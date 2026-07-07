import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { DinnerFullEmail } from '@/lib/email/templates'
import { formatWeekOf } from '@/lib/utils'

// Email the host when their dinner has reached capacity. Checks fullness
// itself, so callers just invoke it after any placement (direct signup,
// matching algorithm, admin manual assignment). Never throws.
export async function notifyHostIfDinnerFull(hostEntryId: string, weekOf: string) {
  if (!process.env.RESEND_API_KEY) return
  try {
    const adminClient = createAdminClient()

    const { data: host } = await adminClient
      .from('weekly_hosts')
      .select('id, user_id, seats_available')
      .eq('id', hostEntryId)
      .single()
    if (!host) return

    const { data: match } = await adminClient
      .from('matches')
      .select('id')
      .eq('host_id', hostEntryId)
      .eq('week_of', weekOf)
      .single()
    if (!match) return

    const { data: matchGuests } = await adminClient
      .from('match_guests')
      .select('guest_id')
      .eq('match_id', match.id)
    if (!matchGuests?.length) return

    const { data: guestEntries } = await adminClient
      .from('weekly_guests')
      .select('user_id, party_size, dietary_restrictions')
      .in('id', matchGuests.map((mg) => mg.guest_id))
    if (!guestEntries?.length) return

    const seatsUsed = guestEntries.reduce((sum, g) => sum + g.party_size, 0)
    if (seatsUsed < host.seats_available) return

    const { data: hostUser } = await adminClient
      .from('users')
      .select('name, email')
      .eq('id', host.user_id)
      .single()
    if (!hostUser) return

    const { data: guestUsers } = await adminClient
      .from('users')
      .select('id, name, email')
      .in('id', guestEntries.map((g) => g.user_id))

    const guestEmails = guestUsers?.map((u) => u.email) || []

    await sendEmail({
      from: 'Shabbat Scheduler <shabbat@shabbat.zalberico.com>',
      to: hostUser.email,
      // Send-only address bounces; replies go to the guests instead
      replyTo: guestEmails.length ? guestEmails : undefined,
      subject: `Your Shabbat dinner is full! (${formatWeekOf(weekOf)})`,
      react: DinnerFullEmail({
        hostName: hostUser.name.split(' ')[0],
        weekOf: formatWeekOf(weekOf),
        guests: guestEntries.map((g) => ({
          name: guestUsers?.find((u) => u.id === g.user_id)?.name || 'Unknown',
          partySize: g.party_size,
          dietary: g.dietary_restrictions,
        })),
      }),
    })
  } catch (e) {
    console.error('Failed to send dinner full email:', e)
  }
}
