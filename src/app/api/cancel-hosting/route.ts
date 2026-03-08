import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getWeekOf, formatWeekOf } from '@/lib/utils'
import { Resend } from 'resend'
import { HostCancelledEmail } from '@/lib/email/templates'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const weekOf = body?.week_of || getWeekOf()
  const adminClient = createAdminClient()

  // Find host entry
  const { data: hostEntry } = await adminClient
    .from('weekly_hosts')
    .select('id, user_id')
    .eq('user_id', user.id)
    .eq('week_of', weekOf)
    .neq('status', 'cancelled')
    .single()

  if (!hostEntry) {
    return NextResponse.json({ error: 'No active host entry found' }, { status: 404 })
  }

  // Get host name for the email
  const { data: hostUser } = await adminClient
    .from('users')
    .select('name')
    .eq('id', hostEntry.user_id)
    .single()

  const hostName = hostUser?.name || 'Your host'

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

      // Get guest details for emails BEFORE modifying data
      const { data: guestEntries } = await adminClient
        .from('weekly_guests')
        .select('user_id')
        .in('id', guestIds)

      const guestUserIds = guestEntries?.map((g) => g.user_id) || []
      const { data: guestUsers } = guestUserIds.length
        ? await adminClient.from('users').select('name, email').in('id', guestUserIds)
        : { data: [] }

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

      // Send cancellation emails to guests
      if (guestUsers?.length && process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const formattedWeek = formatWeekOf(weekOf)
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://shabbat-scheduler.vercel.app'

        for (const guest of guestUsers) {
          try {
            await resend.emails.send({
              from: 'Shabbat Scheduler <shabbat@shabbat.zalberico.com>',
              to: guest.email,
              subject: `${hostName}'s dinner on ${formattedWeek} has been cancelled`,
              react: HostCancelledEmail({
                guestName: guest.name.split(' ')[0],
                hostName: hostName.split(' ')[0],
                weekOf: formattedWeek,
                appUrl: `${appUrl}/browse`,
              }),
            })
          } catch (e) {
            console.error('Failed to send cancellation email:', e)
          }
        }
      }
    }

    // Delete match
    await adminClient
      .from('matches')
      .delete()
      .eq('id', match.id)
  }

  return NextResponse.json({ success: true })
}
