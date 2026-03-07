import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { MatchGroupEmail, UnmatchedEmail } from '@/lib/email/templates'
import { getWeekOf, formatWeekOf, formatStartTime } from '@/lib/utils'
import { KASHRUT_LEVELS, OBSERVANCE_LEVELS } from '@/lib/types/database'
import { NextResponse } from 'next/server'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

async function isAuthorized(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true
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
  const formattedWeek = formatWeekOf(weekOf)

  const supabase = createAdminClient()
  const resend = getResend()
  const sent: string[] = []

  // Get all matches for this week
  const { data: matches } = await supabase
    .from('matches')
    .select('id, host_id')
    .eq('week_of', weekOf)

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
        await resend.emails.send({
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
      } catch (e) {
        console.error('Failed to send group match email:', e)
      }
    }
  }

  // Send unmatched emails
  const { data: unmatched } = await supabase
    .from('weekly_guests')
    .select('*, users!inner(name, email)')
    .eq('week_of', weekOf)
    .eq('status', 'unmatched')

  if (unmatched) {
    for (const guest of unmatched) {
      // @ts-expect-error - joined query types
      const guestName = guest.users.name
      // @ts-expect-error - joined query types
      const guestEmail = guest.users.email
      try {
        await resend.emails.send({
          from: 'Shabbat Scheduler <shabbat@shabbat.zalberico.com>',
          to: guestEmail,
          subject: 'No match this week — try again next Friday!',
          react: UnmatchedEmail({ name: guestName, weekOf: formattedWeek }),
        })
        sent.push(`unmatched:${guestEmail}`)
      } catch (e) {
        console.error('Failed to send unmatched email:', e)
      }
    }
  }

  return NextResponse.json({ sent: sent.length, emails: sent })
}
