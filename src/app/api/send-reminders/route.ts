import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'
import { ReminderEmail } from '@/lib/email/templates'
import { getWeekOf } from '@/lib/utils'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const weekOf = getWeekOf()
  const supabase = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://shabbat.example.com'

  // Get all users
  const { data: users } = await supabase.from('users').select('id, name, email')
  if (!users) return NextResponse.json({ sent: 0 })

  // Get users already signed up this week
  const { data: hosts } = await supabase
    .from('weekly_hosts')
    .select('user_id')
    .eq('week_of', weekOf)
    .neq('status', 'cancelled')

  const { data: guests } = await supabase
    .from('weekly_guests')
    .select('user_id')
    .eq('week_of', weekOf)

  const signedUp = new Set([
    ...(hosts?.map((h) => h.user_id) || []),
    ...(guests?.map((g) => g.user_id) || []),
  ])

  // Send reminders to users who haven't signed up
  const toNotify = users.filter((u) => !signedUp.has(u.id))
  let sent = 0

  for (const user of toNotify) {
    try {
      await resend.emails.send({
        from: 'Shabbat Scheduler <shabbat@shabbat.zalberico.com>',
        to: user.email,
        subject: 'Sign up for Shabbat dinner this Friday!',
        react: ReminderEmail({ name: user.name, appUrl: `${appUrl}/dashboard` }),
      })
      sent++
    } catch (e) {
      console.error('Failed to send reminder:', e)
    }
  }

  return NextResponse.json({ sent, total: toNotify.length })
}
