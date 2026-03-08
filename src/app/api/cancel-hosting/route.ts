import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getWeekOf } from '@/lib/utils'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const weekOf = getWeekOf()
  const adminClient = createAdminClient()

  // Find host entry
  const { data: hostEntry } = await adminClient
    .from('weekly_hosts')
    .select('id')
    .eq('user_id', user.id)
    .eq('week_of', weekOf)
    .neq('status', 'cancelled')
    .single()

  if (!hostEntry) {
    return NextResponse.json({ error: 'No active host entry found' }, { status: 404 })
  }

  // Cancel the host
  await adminClient
    .from('weekly_hosts')
    .update({ status: 'cancelled' })
    .eq('id', hostEntry.id)

  // Find match for this host
  const { data: match } = await adminClient
    .from('matches')
    .select('id')
    .eq('host_id', hostEntry.id)
    .eq('week_of', weekOf)
    .single()

  if (match) {
    // Find all match_guests
    const { data: matchGuests } = await adminClient
      .from('match_guests')
      .select('guest_id')
      .eq('match_id', match.id)

    if (matchGuests?.length) {
      const guestIds = matchGuests.map((mg) => mg.guest_id)

      // Update linked weekly_guests: unmatched, clear selected_host_id
      await adminClient
        .from('weekly_guests')
        .update({ status: 'unmatched', selected_host_id: null })
        .in('id', guestIds)

      // Delete match_guests
      await adminClient
        .from('match_guests')
        .delete()
        .eq('match_id', match.id)
    }

    // Delete match
    await adminClient
      .from('matches')
      .delete()
      .eq('id', match.id)
  }

  return NextResponse.json({ success: true })
}
