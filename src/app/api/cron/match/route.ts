import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL is not set' }, { status: 500 })
  }

  // Step 1: Run matching
  const matchRes = await fetch(`${baseUrl}/api/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    },
  })
  const matchResult = await matchRes.json().catch(() => null)
  if (!matchRes.ok) {
    console.error('Cron matching failed:', matchRes.status, matchResult)
    return NextResponse.json(
      { error: 'Matching failed', status: matchRes.status, matching: matchResult },
      { status: 500 }
    )
  }

  // Step 2: Send notification emails
  const notifyRes = await fetch(`${baseUrl}/api/send-notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    },
  })
  const notifyResult = await notifyRes.json().catch(() => null)
  if (!notifyRes.ok) {
    console.error('Cron notifications failed:', notifyRes.status, notifyResult)
    return NextResponse.json(
      { error: 'Notifications failed', status: notifyRes.status, matching: matchResult, notifications: notifyResult },
      { status: 500 }
    )
  }

  return NextResponse.json({ matching: matchResult, notifications: notifyResult })
}
