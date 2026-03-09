import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekOf } from '@/lib/utils'
import { NextResponse } from 'next/server'

// Returns { [hostId]: seatsUsed } for all hosts in upcoming weeks.
// Uses admin client to bypass RLS so all users get accurate counts.
// Counts via match_guests which covers both direct signups and
// algorithm/admin-placed guests (direct-signup handler creates
// match_guests entries too).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const weekOf = searchParams.get('week') || getWeekOf()
  const adminClient = createAdminClient()

  const { data: matchRows } = await adminClient
    .from('matches')
    .select('id, host_id')
    .gte('week_of', weekOf)

  if (!matchRows?.length) {
    return NextResponse.json({})
  }

  const matchIds = matchRows.map((m) => m.id)
  const { data: matchGuestRows } = await adminClient
    .from('match_guests')
    .select('match_id, guest_id')
    .in('match_id', matchIds)

  if (!matchGuestRows?.length) {
    return NextResponse.json({})
  }

  const guestIds = matchGuestRows.map((mg) => mg.guest_id)
  const { data: guests } = await adminClient
    .from('weekly_guests')
    .select('id, party_size')
    .in('id', guestIds)

  // Map guest_id -> host_id
  const guestToHost = new Map<string, string>()
  matchRows.forEach((m) => {
    matchGuestRows
      .filter((mg) => mg.match_id === m.id)
      .forEach((mg) => guestToHost.set(mg.guest_id, m.host_id))
  })

  const seatsByHost: Record<string, number> = {}
  guests?.forEach((g) => {
    const hostId = guestToHost.get(g.id)
    if (hostId) {
      seatsByHost[hostId] = (seatsByHost[hostId] || 0) + g.party_size
    }
  })

  return NextResponse.json(seatsByHost)
}
