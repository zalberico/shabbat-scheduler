import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { KASHRUT_RANK } from '@/lib/types/database'
import type { KashrutLevel } from '@/lib/types/database'
import { NextResponse } from 'next/server'
import { getWeekOf } from '@/lib/utils'

async function isAuthorized(request: Request): Promise<boolean> {
  // Check cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true

  // Check if admin user
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    return profile?.is_admin === true
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const weekOf = body.week_of || getWeekOf()

  const supabase = createAdminClient()

  // Get all open hosts for this week
  const { data: hosts } = await supabase
    .from('weekly_hosts')
    .select('*, users!inner(id, name, email)')
    .eq('week_of', weekOf)
    .eq('status', 'open')
    .order('kashrut_level', { ascending: false })

  // Get all pending guests for this week
  const { data: guests } = await supabase
    .from('weekly_guests')
    .select('*, users!inner(id, name, email)')
    .eq('week_of', weekOf)
    .eq('status', 'pending')

  if (!hosts?.length || !guests?.length) {
    return NextResponse.json({
      message: 'No hosts or guests to match',
      hosts: hosts?.length || 0,
      guests: guests?.length || 0,
    })
  }

  // Get recent matches for novelty scoring (last 8 weeks)
  const { data: recentMatches } = await supabase
    .from('matches')
    .select('host_id, match_guests(guest_id, weekly_guests(user_id))')
    .gte('week_of', new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

  // Build a map of recent host-guest pairings
  const recentPairings = new Set<string>()
  recentMatches?.forEach((match) => {
    const hostEntry = hosts?.find((h) => h.id === match.host_id)
    if (!hostEntry) return
    const hostUserId = hostEntry.user_id
    match.match_guests?.forEach((mg: any) => {
      const guestUserId = mg.weekly_guests?.user_id
      if (guestUserId) {
        recentPairings.add(`${hostUserId}:${guestUserId}`)
      }
    })
  })

  // Sort hosts by most constrained first
  const sortedHosts = [...hosts].sort((a, b) => {
    // Higher kashrut = more constrained
    const kashrutDiff = KASHRUT_RANK[b.kashrut_level as KashrutLevel] - KASHRUT_RANK[a.kashrut_level as KashrutLevel]
    if (kashrutDiff !== 0) return kashrutDiff
    // Walking only = more constrained
    if (a.walking_distance_only !== b.walking_distance_only) return a.walking_distance_only ? -1 : 1
    // Fewer seats = more constrained
    return a.seats_available - b.seats_available
  })

  const assignedGuests = new Set<string>()
  const matchResults: { hostId: string; guestIds: string[] }[] = []

  for (const host of sortedHosts) {
    let remainingSeats = host.seats_available
    const tableGuests: string[] = []

    // Score and sort eligible guests
    const eligibleGuests = guests
      .filter((g) => {
        if (assignedGuests.has(g.id)) return false
        if (g.party_size > remainingSeats) return false

        // Hard constraint: kashrut compatibility
        const guestReq = KASHRUT_RANK[g.kashrut_requirement as KashrutLevel]
        const hostLevel = KASHRUT_RANK[host.kashrut_level as KashrutLevel]
        if (guestReq > hostLevel) return false

        // Hard constraint: walking distance
        if (host.walking_distance_only && !g.can_walk) return false

        return true
      })
      .map((g) => {
        let score = 0

        // Novelty: bonus for new pairings
        const pairingKey = `${host.user_id}:${g.user_id}`
        if (!recentPairings.has(pairingKey)) {
          score += 10
        }

        // Fill factor: prefer guests that fill the table well
        const fillRatio = g.party_size / remainingSeats
        score += fillRatio * 5

        // Dietary compatibility: bonus for matching dietary groups
        const hostDietary = tableGuests.length > 0
          ? guests.filter((tg) => tableGuests.includes(tg.id))
              .flatMap((tg) => tg.dietary_restrictions)
          : []
        const overlap = g.dietary_restrictions.filter((d) => hostDietary.includes(d)).length
        score += overlap * 2

        return { guest: g, score }
      })
      .sort((a, b) => b.score - a.score)

    for (const { guest } of eligibleGuests) {
      if (guest.party_size > remainingSeats) continue
      tableGuests.push(guest.id)
      assignedGuests.add(guest.id)
      remainingSeats -= guest.party_size
      if (remainingSeats <= 0) break
    }

    if (tableGuests.length > 0) {
      matchResults.push({ hostId: host.id, guestIds: tableGuests })
    }
  }

  // Write matches to database
  for (const result of matchResults) {
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .insert({ week_of: weekOf, host_id: result.hostId })
      .select('id')
      .single()

    if (matchError || !match) continue

    // Insert match guests
    await supabase.from('match_guests').insert(
      result.guestIds.map((guestId) => ({
        match_id: match.id,
        guest_id: guestId,
      }))
    )

    // Update host status
    await supabase
      .from('weekly_hosts')
      .update({ status: 'matched' })
      .eq('id', result.hostId)

    // Update guest statuses
    await supabase
      .from('weekly_guests')
      .update({ status: 'matched' })
      .in('id', result.guestIds)
  }

  // Mark unmatched guests
  const unmatchedGuests = guests.filter((g) => !assignedGuests.has(g.id))
  if (unmatchedGuests.length > 0) {
    await supabase
      .from('weekly_guests')
      .update({ status: 'unmatched' })
      .in('id', unmatchedGuests.map((g) => g.id))
  }

  return NextResponse.json({
    matched: matchResults.length,
    totalGuests: guests.length,
    matchedGuests: assignedGuests.size,
    unmatchedGuests: unmatchedGuests.length,
  })
}
