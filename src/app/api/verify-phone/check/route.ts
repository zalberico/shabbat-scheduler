import { createAdminClient } from '@/lib/supabase/admin'
import { checkVerificationCode, getTwilioCheckError, logTwilioError } from '@/lib/twilio'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { phone, code, email } = await request.json()

  if (!phone || !code || !email) {
    return NextResponse.json({ error: 'Phone, code, and email required' }, { status: 400 })
  }

  // When SMS verification is disabled (10DLC pending), the signup page skips
  // this step entirely, but guard anyway so a mid-flow flag flip doesn't hit
  // Twilio. No ledger row is written — the auth callback also skips the
  // ledger check in skip mode and creates the profile with phone_verified = false.
  if (process.env.SKIP_SMS_VERIFICATION === 'true') {
    return NextResponse.json({ verified: true, skipSms: true })
  }

  try {
    const verified = await checkVerificationCode(phone, code)

    if (verified) {
      // Record server-side proof that this phone was verified, bound to the
      // email the user is signing up with. /auth/callback and /auth/confirm
      // require this row (fresh within 24h) before creating the profile.
      const supabase = createAdminClient()
      const { error: ledgerError } = await supabase
        .from('phone_verifications')
        .upsert(
          { phone, email: String(email).toLowerCase(), verified_at: new Date().toISOString() },
          { onConflict: 'phone' }
        )
      if (ledgerError) {
        console.error('Failed to record phone verification:', ledgerError)
        return NextResponse.json(
          { error: 'Verification failed. Please try again.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ verified })
  } catch (e: unknown) {
    const phoneLast4 = typeof phone === 'string' ? phone.slice(-4) : undefined
    logTwilioError('check_verification_failed', e, phoneLast4)
    const { userMessage, httpStatus } = getTwilioCheckError(e)
    return NextResponse.json({ error: userMessage }, { status: httpStatus })
  }
}
