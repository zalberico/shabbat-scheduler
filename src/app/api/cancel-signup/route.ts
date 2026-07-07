import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { GuestCancelledEmail } from '@/lib/email/templates'
import { getWeekOf, formatWeekOf } from '@/lib/utils'
import { NextResponse } from 'next/server'

// Guest cancels their own signup (match pool or direct). Cleans up placement
// rows and notifies the host if the guest was already seated — the join/host
// pages previously deleted rows client-side, silently freeing seats.
export async function DELETE(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const weekOf = searchParams.get('week') || getWeekOf()

  const adminClient = createAdminClient()
  const { data: guestEntry } = await adminClient
    .from('weekly_guests')
    .select('id, user_id, party_size, status, signup_type, selected_host_id')
    .eq('user_id', user.id)
    .eq('week_of', weekOf)
    .single()

  if (!guestEntry) {
    return NextResponse.json({ error: 'No signup found for this week' }, { status: 404 })
  }

  // Resolve the host (if placed): direct signups carry selected_host_id;
  // pool guests resolve via match_guests -> matches
  let hostEntryId: string | null = guestEntry.selected_host_id
  if (!hostEntryId) {
    const { data: matchGuest } = await adminClient
      .from('match_guests')
      .select('match_id')
      .eq('guest_id', guestEntry.id)
      .single()
    if (matchGuest) {
      const { data: match } = await adminClient
        .from('matches')
        .select('host_id')
        .eq('id', matchGuest.match_id)
        .single()
      hostEntryId = match?.host_id || null
    }
  }

  await adminClient.from('match_guests').delete().eq('guest_id', guestEntry.id)

  const { error: deleteError } = await adminClient
    .from('weekly_guests')
    .delete()
    .eq('id', guestEntry.id)
  if (deleteError) {
    console.error('Failed to delete guest signup:', deleteError)
    return NextResponse.json({ error: 'Failed to cancel signup' }, { status: 500 })
  }

  // Notify the host that seats freed up
  if (hostEntryId && process.env.RESEND_API_KEY) {
    try {
      const { data: hostEntry } = await adminClient
        .from('weekly_hosts')
        .select('user_id, seats_available')
        .eq('id', hostEntryId)
        .single()

      if (hostEntry) {
        const { data: hostUser } = await adminClient
          .from('users')
          .select('name, email')
          .eq('id', hostEntry.user_id)
          .single()
        const { data: guestUser } = await adminClient
          .from('users')
          .select('name, email')
          .eq('id', guestEntry.user_id)
          .single()

        if (hostUser) {
          // Count remaining booked seats via match_guests
          let stillUsed = 0
          const { data: match } = await adminClient
            .from('matches')
            .select('id')
            .eq('host_id', hostEntryId)
            .eq('week_of', weekOf)
            .single()
          if (match) {
            const { data: remainingMg } = await adminClient
              .from('match_guests')
              .select('guest_id')
              .eq('match_id', match.id)
            if (remainingMg?.length) {
              const { data: remainingGuests } = await adminClient
                .from('weekly_guests')
                .select('party_size')
                .in('id', remainingMg.map((mg) => mg.guest_id))
              stillUsed = remainingGuests?.reduce((sum, g) => sum + g.party_size, 0) || 0
            }
          }

          const guestName = (guestUser?.name || 'A guest').split(' ')[0]
          await sendEmail({
            from: 'Shabbat Scheduler <shabbat@shabbat.zalberico.com>',
            to: hostUser.email,
            // Send-only address bounces; replies go to the guest instead
            replyTo: guestUser?.email || undefined,
            subject: `${guestName} cancelled their signup for your dinner`,
            react: GuestCancelledEmail({
              hostName: hostUser.name.split(' ')[0],
              guestName,
              weekOf: formatWeekOf(weekOf),
              seatsRemaining: hostEntry.seats_available - stillUsed,
              totalSeats: hostEntry.seats_available,
            }),
          })
        }
      }
    } catch (e) {
      console.error('Failed to send guest cancellation email:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
