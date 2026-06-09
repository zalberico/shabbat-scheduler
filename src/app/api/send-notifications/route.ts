import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { MatchGroupEmail, UnmatchedEmail } from '@/lib/email/templates'
import { getWeekOf, formatWeekOf, formatStartTime } from '@/lib/utils'
import { KASHRUT_LEVELS, OBSERVANCE_LEVELS } from '@/lib/types/database'
import { NextResponse } from 'next/server'

export const maxDuration = 60

async function isAuthorized(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) return true
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
  const formattedWeek = formatWeekOf(weekOf)

  const supabase = createAdminClient()
  const sent: string[] = []

  // Get matches for this week that haven't been notified yet
  const { data: matches } = await supabase
    .from('matches')
    .select('id, host_id')
    .eq('week_of', weekOf)
    .is('notified_at', null)

  if (matches) {
    for (const match of matches) {
      // Get host info
      const { data: host } = await supabase
        .from('weekly_hosts')
        .select('*, users!inner(name, email)')
        .eq('id', match.host_id)
        .single()

      if (!host) continue

      // Get guest info
      const { data: matchGuests } = await supabase
        .from('match_guests')
        .select('guest_id')
        .eq('match_id', match.id)

      if (!matchGuests?.length) continue

      const guestIds = matchGuests.map((mg) => mg.guest_id)
      const { data: guestEntries } = await supabase
        .from('weekly_guests')
        .select('*, users!inner(name, email)')
        .in('id', guestIds)

      if (!guestEntries) continue

      // @ts-expect-error - joined query types
      const hostName = host.users.name
      // @ts-expect-error - joined query types
      const hostEmail = host.users.email

      const guestList = guestEntries.map((g) => ({
        // @ts-expect-error - joined query types
        name: g.users.name,
        partySize: g.party_size,
        dietary: g.dietary_restrictions,
        notes: g.notes,
      }))

      const guestEmails = guestEntries.map((g) => {
        // @ts-expect-error - joined query types
        return g.users.email as string
      })

      const kashrutLabel = KASHRUT_LEVELS.find((k) => k.value === host.kashrut_level)?.label || host.kashrut_level
      const observanceLabel = OBSERVANCE_LEVELS.find((o) => o.value === host.observance_level)?.label

      // Send a single group email to host + all guests
      try {
        await sendEmail({
          from: 'Shabbat Scheduler <shabbat@shabbat.zalberico.com>',
          to: hostEmail,
          cc: guestEmails,
          subject: `Shabbat dinner this Friday at ${hostName}'s! (${formattedWeek})`,
          react: MatchGroupEmail({
            hostName,
            weekOf: formattedWeek,
            startTime: formatStartTime(host.start_time),
            kashrut: kashrutLabel,
            observance: observanceLabel,
            kidsFriendly: host.kids_friendly,
            dogsFriendly: host.dogs_friendly,
            hostNotes: host.notes,
            guests: guestList,
          }),
        })
        sent.push(`group:${hostEmail}+${guestEmails.join('+')}`)
        await supabase
          .from('matches')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', match.id)
      } catch (e) {
        console.error('Failed to send group match email:', e)
      }
      // Stay under Resend's requests-per-second rate limit
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  // Send unmatched emails (skip banned users and already-notified guests)
  const { data: unmatched } = await supabase
    .from('weekly_guests')
    .select('*, users!inner(name, email, is_banned)')
    .eq('week_of', weekOf)
    .eq('status', 'unmatched')
    .is('notified_at', null)

  if (unmatched) {
    for (const guest of unmatched) {
      // @ts-expect-error - joined query types
      if (guest.users.is_banned) continue
      // @ts-expect-error - joined query types
      const guestName = guest.users.name
      // @ts-expect-error - joined query types
      const guestEmail = guest.users.email
      try {
        await sendEmail({
          from: 'Shabbat Scheduler <shabbat@shabbat.zalberico.com>',
          to: guestEmail,
          subject: 'No match this week — try again next Friday!',
          react: UnmatchedEmail({ name: guestName, weekOf: formattedWeek }),
        })
        sent.push(`unmatched:${guestEmail}`)
        await supabase
          .from('weekly_guests')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', guest.id)
      } catch (e) {
        console.error('Failed to send unmatched email:', e)
      }
      // Stay under Resend's requests-per-second rate limit
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  return NextResponse.json({ sent: sent.length, emails: sent })
}
