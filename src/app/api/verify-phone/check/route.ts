import { checkVerificationCode } from '@/lib/twilio'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { phone, code } = await request.json()

  if (!phone || !code) {
    return NextResponse.json({ error: 'Phone and code required' }, { status: 400 })
  }

  try {
    const verified = await checkVerificationCode(phone, code)
    return NextResponse.json({ verified })
  } catch (e: any) {
    console.error('Failed to check verification code:', e)
    return NextResponse.json(
      { error: 'Verification failed. Please try again.' },
      { status: 500 }
    )
  }
}
