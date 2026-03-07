import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Rate limit: 5 attempts per IP per 10 minutes
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    )
  }

  const { phone } = await request.json()

  if (!phone) {
    return NextResponse.json({ error: 'Phone number required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('phone_allowlist')
    .select('id')
    .eq('phone', phone)
    .single()

  if (!data) {
    return NextResponse.json(
      { error: 'Phone number not found in community allowlist. Contact an admin to be added.' },
      { status: 403 }
    )
  }

  return NextResponse.json({ ok: true })
}
