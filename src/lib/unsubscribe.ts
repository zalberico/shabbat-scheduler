import { createHmac } from 'crypto'

// Signed one-click unsubscribe links for reminder emails. The token is an
// HMAC of the user id keyed by CRON_SECRET, so links can't be forged for
// other users.
export function unsubscribeToken(userId: string): string {
  return createHmac('sha256', process.env.CRON_SECRET || '')
    .update(userId)
    .digest('hex')
    .slice(0, 32)
}

export function unsubscribeUrl(userId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://shabbat-scheduler.vercel.app'
  return `${base}/api/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`
}
