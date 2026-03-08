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
  const supabase = createAdminClient()

  const { data: matchRows } = await supabase
    .from('matches')
    .select('id, host_id')
    .eq('week_of', weekOf)

  if (!matchRows?.length) {
    return NextResponse.json([])
  }

  const displayMatches = []

  for (const match of matchRows) {
    const { data: host } = await supabase
      .from('weekly_hosts')
      .select('user_id')
      .eq('id', match.host_id)
      .single()

    if (!host) continue

    const { data: hostUser } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', host.user_id)
      .single()

    const { data: matchGuests } = await supabase
      .from('match_guests')
      .select('guest_id')
      .eq('match_id', match.id)

    const guestDetails: { name: string; email: string; partySize: number; dietary: string[] }[] = []

    if (matchGuests) {
      for (const mg of matchGuests) {
        const { data: guest } = await supabase
          .from('weekly_guests')
          .select('user_id, party_size, dietary_restrictions')
          .eq('id', mg.guest_id)
          .single()

        if (!guest) continue

        const { data: guestUser } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', guest.user_id)
          .single()

        guestDetails.push({
          name: guestUser?.name || 'Unknown',
          email: guestUser?.email || '',
          partySize: guest.party_size,
          dietary: guest.dietary_restrictions,
        })
      }
    }

    displayMatches.push({
      matchId: match.id,
      hostName: hostUser?.name || 'Unknown',
      hostEmail: hostUser?.email || '',
      guests: guestDetails,
    })
  }

  return NextResponse.json(displayMatches)
}
