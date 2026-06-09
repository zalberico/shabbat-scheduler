import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { KASHRUT_RANK, OBSERVANCE_RANK } from '@/lib/types/database'
import type { KashrutLevel, ShabbatObservance } from '@/lib/types/database'
import { NextResponse } from 'next/server'
import { getWeekOf, haversineDistanceMiles } from '@/lib/utils'
import { notifyHostIfDinnerFull } from '@/lib/email/dinner-full'

export const maxDuration = 60

async function isAuthorized(request: Request): Promise<boolean> {
  // Check cron secret (require it to be configured, else 'Bearer undefined'
  // would be accepted)
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) return true

  // Check if admin user
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const adminClient = createAdminClient()
    const { data: profile } = await adminClient
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) {
    return NextResponse.json({ error: 'Invalid week_of format' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Get all open/matched hosts for this week (matched hosts may have direct signups with remaining seats)
  const { data: hosts } = await supabase
    .from('weekly_hosts')
    .select('*, users!inner(id, name, email)')
    .eq('week_of', weekOf)
    .in('status', ['open', 'matched'])
    .order('kashrut_level', { ascending: false })

  // Get all pending/unmatched match_pool guests for this week. Including
  // 'unmatched' lets re-runs re-consider guests a previous run couldn't
  // place. Banned users must be excluded explicitly — the ban route parks
  // their entries as 'unmatched', which would otherwise re-enter the pool.
  const { data: guestRows } = await supabase
    .from('weekly_guests')
    .select('*, users!inner(id, name, email, is_banned)')
    .eq('week_of', weekOf)
    .in('status', ['pending', 'unmatched'])
    .eq('signup_type', 'match_pool')

  // Calculate used seats per host from existing placements: match_guests
  // covers direct, algorithm, and admin-placed guests (same accounting as
  // direct-signup and admin/matches); direct signups without a match row
  // (legacy/partial failures) are added separately below
  const { data: weekMatches } = await supabase
    .from('matches')
    .select('id, host_id')
    .eq('week_of', weekOf)

  const hostByMatchId = new Map<string, string>()
  weekMatches?.forEach((m) => hostByMatchId.set(m.id, m.host_id))

  const seatsUsed = new Map<string, number>()
  const countedGuestEntryIds = new Set<string>()

  if (weekMatches?.length) {
    const { data: placedGuests } = await supabase
      .from('match_guests')
      .select('match_id, guest_id, weekly_guests(party_size)')
      .in('match_id', weekMatches.map((m) => m.id))

    placedGuests?.forEach((mg: any) => {
      const hostId = hostByMatchId.get(mg.match_id)
      if (hostId) {
        countedGuestEntryIds.add(mg.guest_id)
        seatsUsed.set(hostId, (seatsUsed.get(hostId) || 0) + (mg.weekly_guests?.party_size || 0))
      }
    })
  }

  const { data: directSignups } = await supabase
    .from('weekly_guests')
    .select('id, selected_host_id, party_size')
    .eq('week_of', weekOf)
    .eq('signup_type', 'direct')
    .not('selected_host_id', 'is', null)

  directSignups?.forEach((g) => {
    if (g.selected_host_id && !countedGuestEntryIds.has(g.id)) {
      seatsUsed.set(g.selected_host_id, (seatsUsed.get(g.selected_host_id) || 0) + g.party_size)
    }
  })

  // Build the candidate pool: skip banned users and guests already placed at
  // a table (match_guests is authoritative — a guest whose status update
  // failed on a previous run must not be placed twice)
  const guests = (guestRows || []).filter((g) => {
    if (countedGuestEntryIds.has(g.id)) return false
    // @ts-expect-error - joined query types
    return !g.users.is_banned
  })

  if (!hosts?.length || !guests.length) {
    return NextResponse.json({
      message: 'No hosts or guests to match',
      hosts: hosts?.length || 0,
      guests: guests.length,
    })
  }

  // Get recent matches for novelty scoring (last 8 weeks)
  const { data: recentMatches } = await supabase
    .from('matches')
    .select('host_id, match_guests(guest_id, weekly_guests(user_id))')
    .gte('week_of', new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

  // Resolve past host entries to user ids — past-week host_ids aren't in
  // this week's hosts list, so they must be looked up directly
  const recentHostIds = Array.from(new Set((recentMatches || []).map((m) => m.host_id)))
  const { data: recentHostRows } = recentHostIds.length
    ? await supabase.from('weekly_hosts').select('id, user_id').in('id', recentHostIds)
    : { data: [] as { id: string; user_id: string }[] }
  const recentHostUserById = new Map<string, string>()
  recentHostRows?.forEach((h) => recentHostUserById.set(h.id, h.user_id))

  // Build a map of recent host-guest pairings
  const recentPairings = new Set<string>()
  recentMatches?.forEach((match) => {
    const hostUserId = recentHostUserById.get(match.host_id)
    if (!hostUserId) return
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
    // Higher observance = more constrained
    const obsDiff = OBSERVANCE_RANK[(b.observance_level as ShabbatObservance) || 'flexible'] - OBSERVANCE_RANK[(a.observance_level as ShabbatObservance) || 'flexible']
    if (obsDiff !== 0) return obsDiff
    // Fewer seats = more constrained
    return a.seats_available - b.seats_available
  })

  const assignedGuests = new Set<string>()
  const matchResults: { hostId: string; guestIds: string[] }[] = []

  for (const host of sortedHosts) {
    let remainingSeats = host.seats_available - (seatsUsed.get(host.id) || 0)
    if (remainingSeats <= 0) continue
    const tableGuests: string[] = []
    const tableDietary: string[] = []

    const hostObsRank = OBSERVANCE_RANK[(host.observance_level as ShabbatObservance) || 'flexible']

    // Hard constraints (party size is re-checked per pick as seats shrink)
    const candidates = guests.filter((g) => {
      if (assignedGuests.has(g.id)) return false

      // Hard constraint: kashrut compatibility
      const guestReq = KASHRUT_RANK[g.kashrut_requirement as KashrutLevel]
      const hostLevel = KASHRUT_RANK[host.kashrut_level as KashrutLevel]
      if (guestReq > hostLevel) return false

      // Hard constraint: observance compatibility
      const guestObsReq = OBSERVANCE_RANK[(g.observance_requirement as ShabbatObservance) || 'flexible']
      if (guestObsReq > hostObsRank) return false

      // Hard constraint: kid-friendly
      if (g.needs_kid_friendly && !host.kids_friendly) return false

      // Hard constraint: dog-friendly
      if (g.needs_dog_friendly && !host.dogs_friendly) return false

      // Hard constraint: walking distance
      if (g.can_walk && g.lat != null && g.lng != null) {
        if (host.lat != null && host.lng != null) {
          const dist = haversineDistanceMiles(g.lat, g.lng, host.lat, host.lng)
          if (dist > 1.0) return false
        } else {
          // Guest needs to walk but host didn't share address
          return false
        }
      }

      return true
    })

    // Pick the best-scoring guest one at a time so the dietary-grouping term
    // can see who is already seated at the table
    while (remainingSeats > 0) {
      let best: { guest: (typeof candidates)[number]; score: number } | null = null

      for (const g of candidates) {
        if (assignedGuests.has(g.id)) continue
        if (g.party_size > remainingSeats) continue

        let score = 0

        // Novelty: bonus for new pairings
        const pairingKey = `${host.user_id}:${g.user_id}`
        if (!recentPairings.has(pairingKey)) {
          score += 10
        }

        // Fill factor: prefer guests that fill the table well
        const fillRatio = g.party_size / remainingSeats
        score += fillRatio * 5

        // Dietary compatibility: bonus for matching the table's dietary groups
        const overlap = g.dietary_restrictions.filter((d) => tableDietary.includes(d)).length
        score += overlap * 2

        // Walking proximity bonus
        if (g.lat != null && g.lng != null && host.lat != null && host.lng != null) {
          const dist = haversineDistanceMiles(g.lat, g.lng, host.lat, host.lng)
          if (dist < 0.5) score += 3
        }

        if (!best || score > best.score) {
          best = { guest: g, score }
        }
      }

      if (!best) break
      tableGuests.push(best.guest.id)
      assignedGuests.add(best.guest.id)
      tableDietary.push(...best.guest.dietary_restrictions)
      remainingSeats -= best.guest.party_size
    }

    if (tableGuests.length > 0) {
      matchResults.push({ hostId: host.id, guestIds: tableGuests })
    }
  }

  // Write matches to database
  let failedTables = 0
  for (const result of matchResults) {
    // Check if a match row already exists (from direct signups)
    let matchId: string
    const { data: existingMatch } = await supabase
      .from('matches')
      .select('id')
      .eq('host_id', result.hostId)
      .eq('week_of', weekOf)
      .single()

    if (existingMatch) {
      matchId = existingMatch.id
    } else {
      const { data: newMatch, error: matchError } = await supabase
        .from('matches')
        .insert({ week_of: weekOf, host_id: result.hostId })
        .select('id')
        .single()

      if (matchError || !newMatch) {
        console.error('Failed to create match for host', result.hostId, matchError)
        // Return guests to the pool so they're marked unmatched below and
        // re-considered on the next run
        result.guestIds.forEach((id) => assignedGuests.delete(id))
        failedTables++
        continue
      }
      matchId = newMatch.id
    }

    // Insert match guests — statuses are only updated if this succeeds, so a
    // failed insert can't leave guests marked matched with no match row
    const { error: guestInsertError } = await supabase.from('match_guests').insert(
      result.guestIds.map((guestId) => ({
        match_id: matchId,
        guest_id: guestId,
      }))
    )

    if (guestInsertError) {
      console.error('Failed to insert match_guests for host', result.hostId, guestInsertError)
      result.guestIds.forEach((id) => assignedGuests.delete(id))
      failedTables++
      continue
    }

    // Update host status (if not already matched)
    const { error: hostStatusError } = await supabase
      .from('weekly_hosts')
      .update({ status: 'matched' })
      .eq('id', result.hostId)
    if (hostStatusError) {
      console.error('Failed to update host status', result.hostId, hostStatusError)
    }

    // Update guest statuses
    const { error: guestStatusError } = await supabase
      .from('weekly_guests')
      .update({ status: 'matched' })
      .in('id', result.guestIds)
    if (guestStatusError) {
      console.error('Failed to update guest statuses', result.guestIds, guestStatusError)
    }

    // Notify the host if this filled their table
    await notifyHostIfDinnerFull(result.hostId, weekOf)
  }

  // Mark unmatched guests (only match_pool guests). Guests from failed
  // writes were removed from assignedGuests above so they land here and get
  // re-considered on the next run.
  const unmatchedGuests = guests.filter((g) => !assignedGuests.has(g.id))
  if (unmatchedGuests.length > 0) {
    const { error: unmatchedError } = await supabase
      .from('weekly_guests')
      .update({ status: 'unmatched' })
      .in('id', unmatchedGuests.map((g) => g.id))
    if (unmatchedError) {
      console.error('Failed to mark unmatched guests:', unmatchedError)
    }
  }

  return NextResponse.json({
    matched: matchResults.length - failedTables,
    failedTables,
    totalGuests: guests.length,
    matchedGuests: assignedGuests.size,
    unmatchedGuests: unmatchedGuests.length,
  })
}
