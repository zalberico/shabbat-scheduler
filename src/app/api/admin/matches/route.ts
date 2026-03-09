import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekOf } from '@/lib/utils'
import { NextResponse } from 'next/server'

async function checkAdmin() {
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
}

export async function GET(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const weekOf = searchParams.get('week') || getWeekOf()
  const adminClient = createAdminClient()

  // Batch fetch all data for this week
  const [hostsResult, guestsResult, matchesResult] = await Promise.all([
    adminClient
      .from('weekly_hosts')
      .select('id, user_id, seats_available, kashrut_level, observance_level, start_time, kids_friendly, dogs_friendly, notes, status')
      .eq('week_of', weekOf)
      .neq('status', 'cancelled'),
    adminClient
      .from('weekly_guests')
      .select('id, user_id, party_size, dietary_restrictions, kashrut_requirement, observance_requirement, needs_kid_friendly, needs_dog_friendly, notes, status, signup_type, selected_host_id')
      .eq('week_of', weekOf),
    adminClient
      .from('matches')
      .select('id, host_id')
      .eq('week_of', weekOf),
  ])

  const hosts = hostsResult.data || []
  const allGuests = guestsResult.data || []
  const matchRows = matchesResult.data || []

  // Fetch match_guests for all matches
  const matchIds = matchRows.map((m) => m.id)
  const { data: matchGuestsData } = matchIds.length
    ? await adminClient.from('match_guests').select('match_id, guest_id').in('match_id', matchIds)
    : { data: [] }
  const matchGuests = matchGuestsData || []

  // Fetch all user names
  const allUserIds = Array.from(new Set([
    ...hosts.map((h) => h.user_id),
    ...allGuests.map((g) => g.user_id),
  ]))
  const { data: allUsers } = allUserIds.length
    ? await adminClient.from('users').select('id, name').in('id', allUserIds)
    : { data: [] }

  const getUserName = (userId: string) =>
    allUsers?.find((u) => u.id === userId)?.name || 'Unknown'

  // Build match map: host_id -> match info
  const matchByHost = new Map<string, { matchId: string; guestIds: string[] }>()
  matchRows.forEach((m) => {
    const guestIds = matchGuests.filter((mg) => mg.match_id === m.id).map((mg) => mg.guest_id)
    matchByHost.set(m.host_id, { matchId: m.id, guestIds })
  })

  // Identify all matched guest IDs
  const matchedGuestIds = new Set(matchGuests.map((mg) => mg.guest_id))

  // Build dinners array
  const dinners = hosts.map((host) => {
    const matchInfo = matchByHost.get(host.id)
    const dinnerGuests = matchInfo
      ? allGuests.filter((g) => matchInfo.guestIds.includes(g.id))
      : []
    const seatsUsed = dinnerGuests.reduce((sum, g) => sum + g.party_size, 0)

    return {
      hostId: host.id,
      hostName: getUserName(host.user_id),
      seatsAvailable: host.seats_available,
      seatsUsed,
      kashrut: host.kashrut_level,
      observance: host.observance_level,
      startTime: host.start_time,
      kidsOk: host.kids_friendly,
      dogsOk: host.dogs_friendly,
      notes: host.notes,
      matchId: matchInfo?.matchId || null,
      guests: dinnerGuests.map((g) => ({
        guestId: g.id,
        name: getUserName(g.user_id),
        partySize: g.party_size,
        dietary: g.dietary_restrictions,
        signupType: g.signup_type,
      })),
    }
  })

  // Unmatched guests: not in any match, with status pending or unmatched
  const unmatchedGuests = allGuests
    .filter((g) => !matchedGuestIds.has(g.id) && (g.status === 'pending' || g.status === 'unmatched'))
    .map((g) => ({
      guestId: g.id,
      name: getUserName(g.user_id),
      partySize: g.party_size,
      kashrut: g.kashrut_requirement,
      observance: g.observance_requirement,
      dietary: g.dietary_restrictions,
      needsKidFriendly: g.needs_kid_friendly,
      needsDogFriendly: g.needs_dog_friendly,
      notes: g.notes,
    }))

  return NextResponse.json({ dinners, unmatchedGuests })
}

export async function POST(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.guest_id || !body?.host_id) {
    return NextResponse.json({ error: 'Missing guest_id or host_id' }, { status: 400 })
  }

  const weekOf = body.week_of || getWeekOf()
  const adminClient = createAdminClient()

  // Verify guest exists and is unmatched/pending
  const { data: guest } = await adminClient
    .from('weekly_guests')
    .select('id, party_size, status')
    .eq('id', body.guest_id)
    .eq('week_of', weekOf)
    .single()

  if (!guest) {
    return NextResponse.json({ error: 'Guest not found for this week' }, { status: 404 })
  }
  if (guest.status === 'matched') {
    return NextResponse.json({ error: 'Guest is already matched' }, { status: 409 })
  }

  // Verify host exists and is not cancelled
  const { data: host } = await adminClient
    .from('weekly_hosts')
    .select('id, seats_available, status')
    .eq('id', body.host_id)
    .eq('week_of', weekOf)
    .single()

  if (!host) {
    return NextResponse.json({ error: 'Host not found for this week' }, { status: 404 })
  }
  if (host.status === 'cancelled') {
    return NextResponse.json({ error: 'This dinner has been cancelled' }, { status: 400 })
  }

  // Calculate used seats from match_guests
  const { data: existingMatch } = await adminClient
    .from('matches')
    .select('id')
    .eq('host_id', host.id)
    .eq('week_of', weekOf)
    .single()

  let seatsUsed = 0
  if (existingMatch) {
    const { data: currentGuests } = await adminClient
      .from('match_guests')
      .select('guest_id')
      .eq('match_id', existingMatch.id)

    if (currentGuests?.length) {
      const guestIds = currentGuests.map((mg) => mg.guest_id)
      const { data: guestEntries } = await adminClient
        .from('weekly_guests')
        .select('party_size')
        .in('id', guestIds)
      seatsUsed = guestEntries?.reduce((sum, g) => sum + g.party_size, 0) || 0
    }
  }

  const remaining = host.seats_available - seatsUsed
  if (guest.party_size > remaining) {
    return NextResponse.json({ error: `Not enough seats. ${remaining} remaining, need ${guest.party_size}.` }, { status: 409 })
  }

  // Upsert match row (reuse direct-signup pattern)
  let matchId: string
  if (existingMatch) {
    matchId = existingMatch.id
  } else {
    const { data: newMatch, error: matchError } = await adminClient
      .from('matches')
      .insert({ week_of: weekOf, host_id: host.id })
      .select('id')
      .single()

    if (matchError || !newMatch) {
      return NextResponse.json({ error: 'Failed to create match' }, { status: 500 })
    }
    matchId = newMatch.id
  }

  // Link guest to match
  await adminClient.from('match_guests').insert({
    match_id: matchId,
    guest_id: guest.id,
  })

  // Update guest status to matched, host status to matched
  await Promise.all([
    adminClient
      .from('weekly_guests')
      .update({ status: 'matched' as const })
      .eq('id', guest.id),
    adminClient
      .from('weekly_hosts')
      .update({ status: 'matched' as const })
      .eq('id', host.id),
  ])

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const guestId = searchParams.get('guest_id')
  const weekOf = searchParams.get('week') || getWeekOf()

  if (!guestId) {
    return NextResponse.json({ error: 'Missing guest_id' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Find the match_guests entry
  const { data: matchGuestEntry } = await adminClient
    .from('match_guests')
    .select('id, match_id')
    .eq('guest_id', guestId)
    .single()

  if (!matchGuestEntry) {
    return NextResponse.json({ error: 'Guest is not in any match' }, { status: 404 })
  }

  // Get match to find host_id
  const { data: match } = await adminClient
    .from('matches')
    .select('id, host_id')
    .eq('id', matchGuestEntry.match_id)
    .single()

  // Delete match_guests entry
  await adminClient
    .from('match_guests')
    .delete()
    .eq('id', matchGuestEntry.id)

  // Update guest: status → unmatched, clear selected_host_id
  await adminClient
    .from('weekly_guests')
    .update({ status: 'unmatched' as const, selected_host_id: null })
    .eq('id', guestId)

  // Check if match now has 0 guests remaining
  if (match) {
    const { count } = await adminClient
      .from('match_guests')
      .select('*', { count: 'exact', head: true })
      .eq('match_id', match.id)

    if (count === 0) {
      await adminClient.from('matches').delete().eq('id', match.id)
      await adminClient
        .from('weekly_hosts')
        .update({ status: 'open' as const })
        .eq('id', match.host_id)
    }
  }

  return NextResponse.json({ success: true })
}
