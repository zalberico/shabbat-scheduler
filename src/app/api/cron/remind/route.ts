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

  const res = await fetch(`${baseUrl}/api/send-reminders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    },
  })
  const result = await res.json().catch(() => null)
  if (!res.ok) {
    console.error('Cron reminders failed:', res.status, result)
    return NextResponse.json(
      { error: 'Reminders failed', status: res.status, result },
      { status: 500 }
    )
  }

  return NextResponse.json(result)
}
