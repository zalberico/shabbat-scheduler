import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Step 1: Run matching
  const matchRes = await fetch(`${baseUrl}/api/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    },
  })
  const matchResult = await matchRes.json()

  // Step 2: Send notification emails
  const notifyRes = await fetch(`${baseUrl}/api/send-notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    },
  })
  const notifyResult = await notifyRes.json()

  return NextResponse.json({ matching: matchResult, notifications: notifyResult })
}
