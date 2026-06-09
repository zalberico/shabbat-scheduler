import { createAdminClient } from '@/lib/supabase/admin'
import { unsubscribeToken } from '@/lib/unsubscribe'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function htmlResponse(message: string, status = 200) {
  return new Response(
    `<!doctype html><html><body style="font-family: sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
      <h2>Shabbat Scheduler</h2><p>${message}</p>
    </body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } }
  )
}

// One-click unsubscribe from weekly reminder emails (link in the email
// footer). Token is an HMAC of the user id, see src/lib/unsubscribe.ts.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('u')
  const token = searchParams.get('t')

  if (!userId || !UUID_REGEX.test(userId) || !token || token !== unsubscribeToken(userId)) {
    return htmlResponse('Invalid unsubscribe link.', 400)
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('users')
    .update({ email_reminders: false })
    .eq('id', userId)

  if (error) {
    console.error('Failed to unsubscribe user:', error)
    return htmlResponse('Something went wrong. Please contact an admin.', 500)
  }

  return htmlResponse(
    'You have been unsubscribed from weekly reminder emails. You will still receive emails about dinners you sign up for.'
  )
}
