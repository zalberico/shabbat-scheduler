import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getWeekOf } from '@/lib/utils'

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const weekOf = searchParams.get('week') || getWeekOf()
  const adminClient = createAdminClient()

  // Find host's entry for this week
  const { data: host } = await adminClient
    .from('weekly_hosts')
    .select('id, user_id')
    .eq('user_id', user.id)
    .eq('week_of', weekOf)
    .neq('status', 'cancelled')
    .single()

  if (!host) {
    return NextResponse.json({ guests: [], seatsUsed: 0 })
  }

  // Verify the requesting user is the host
  if (host.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find match for this host
  const { data: match } = await adminClient
    .from('matches')
    .select('id')
    .eq('host_id', host.id)
    .eq('week_of', weekOf)
    .single()

  if (!match) {
    return NextResponse.json({ guests: [], seatsUsed: 0 })
  }

  // Get all guest IDs from match_guests
  const { data: matchGuests } = await adminClient
    .from('match_guests')
    .select('guest_id')
    .eq('match_id', match.id)

  if (!matchGuests?.length) {
    return NextResponse.json({ guests: [], seatsUsed: 0 })
  }

  const guestIds = matchGuests.map((mg) => mg.guest_id)

  // Get guest details
  const { data: guestEntries } = await adminClient
    .from('weekly_guests')
    .select('user_id, party_size, dietary_restrictions, kashrut_requirement, observance_requirement, needs_kid_friendly, needs_dog_friendly, notes, signup_type')
    .in('id', guestIds)

  if (!guestEntries?.length) {
    return NextResponse.json({ guests: [], seatsUsed: 0 })
  }

  // Get user names
  const userIds = guestEntries.map((g) => g.user_id)
  const { data: users } = await adminClient
    .from('users')
    .select('id, name')
    .in('id', userIds)

  const userMap = new Map(users?.map((u) => [u.id, u.name]) || [])

  const guests = guestEntries.map((g) => ({
    name: userMap.get(g.user_id) || 'Unknown',
    partySize: g.party_size,
    dietary: g.dietary_restrictions || [],
    kashrut: g.kashrut_requirement,
    observance: g.observance_requirement,
    needsKidFriendly: g.needs_kid_friendly,
    needsDogFriendly: g.needs_dog_friendly,
    notes: g.notes,
    signupType: g.signup_type,
  }))

  const seatsUsed = guestEntries.reduce((sum, g) => sum + g.party_size, 0)

  return NextResponse.json({ guests, seatsUsed })
}
