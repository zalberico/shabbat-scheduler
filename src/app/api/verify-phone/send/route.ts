import { createAdminClient } from '@/lib/supabase/admin'
import { sendVerificationCode, getTwilioSendError, logTwilioError } from '@/lib/twilio'
import { NextResponse } from 'next/server'

// In-memory rate limiter: 3 attempts per phone per 10 minutes
const RATE_LIMIT = 3
const RATE_WINDOW_MS = 10 * 60 * 1000
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(phone: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(phone)
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(phone, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT
}

export async function POST(request: Request) {
  const { phone } = await request.json()

  if (!phone) {
    return NextResponse.json({ error: 'Phone number required' }, { status: 400 })
  }

  if (isRateLimited(phone)) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    )
  }

  // Check allowlist first
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

  // Skip SMS when Twilio is not yet approved (10DLC pending)
  if (process.env.SKIP_SMS_VERIFICATION === 'true') {
    return NextResponse.json({ ok: true, skipSms: true })
  }

  try {
    await sendVerificationCode(phone)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const phoneLast4 = typeof phone === 'string' ? phone.slice(-4) : undefined
    logTwilioError('send_verification_failed', e, phoneLast4)
    const { userMessage, httpStatus } = getTwilioSendError(e)
    return NextResponse.json({ error: userMessage }, { status: httpStatus })
  }
}
