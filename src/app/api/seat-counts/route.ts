import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekOf } from '@/lib/utils'
import { NextResponse } from 'next/server'

// Returns { [hostId]: seatsUsed } for all hosts in upcoming weeks.
// Uses admin client to bypass RLS so all users get accurate counts.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const weekOf = searchParams.get('week') || getWeekOf()
  const adminClient = createAdminClient()

  // Count direct signups
  const { data: directSignups } = await adminClient
    .from('weekly_guests')
    .select('selected_host_id, party_size')
    .gte('week_of', weekOf)
    .eq('signup_type', 'direct')
    .not('selected_host_id', 'is', null)

  const seatsByHost: Record<string, number> = {}
  directSignups?.forEach((g) => {
    if (g.selected_host_id) {
      seatsByHost[g.selected_host_id] = (seatsByHost[g.selected_host_id] || 0) + g.party_size
    }
  })

  // Count algorithm/admin-matched guests via match_guests
  const { data: matchRows } = await adminClient
    .from('matches')
    .select('id, host_id')
    .gte('week_of', weekOf)

  if (matchRows?.length) {
    const matchIds = matchRows.map((m) => m.id)
    const { data: matchGuestRows } = await adminClient
      .from('match_guests')
      .select('match_id, guest_id')
      .in('match_id', matchIds)

    if (matchGuestRows?.length) {
      const matchGuestIds = matchGuestRows.map((mg) => mg.guest_id)
      const { data: matchedGuests } = await adminClient
        .from('weekly_guests')
        .select('id, party_size')
        .in('id', matchGuestIds)
        .eq('signup_type', 'match_pool')

      // Map guest_id -> host_id
      const guestToHost = new Map<string, string>()
      matchRows.forEach((m) => {
        matchGuestRows
          .filter((mg) => mg.match_id === m.id)
          .forEach((mg) => guestToHost.set(mg.guest_id, m.host_id))
      })

      matchedGuests?.forEach((g) => {
        const hostId = guestToHost.get(g.id)
        if (hostId) {
          seatsByHost[hostId] = (seatsByHost[hostId] || 0) + g.party_size
        }
      })
    }
  }

  return NextResponse.json(seatsByHost)
}
