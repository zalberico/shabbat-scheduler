import { checkVerificationCode, getTwilioCheckError, logTwilioError } from '@/lib/twilio'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { phone, code } = await request.json()

  if (!phone || !code) {
    return NextResponse.json({ error: 'Phone and code required' }, { status: 400 })
  }

  try {
    const verified = await checkVerificationCode(phone, code)
    return NextResponse.json({ verified })
  } catch (e: unknown) {
    const phoneLast4 = typeof phone === 'string' ? phone.slice(-4) : undefined
    logTwilioError('check_verification_failed', e, phoneLast4)
    const { userMessage, httpStatus } = getTwilioCheckError(e)
    return NextResponse.json({ error: userMessage }, { status: httpStatus })
  }
}
