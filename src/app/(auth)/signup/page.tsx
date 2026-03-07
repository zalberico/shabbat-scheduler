'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone } from '@/lib/utils'
import Link from 'next/link'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const normalizedPhone = normalizePhone(phone)

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/verify-phone/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalizedPhone }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Failed to send verification code.')
      setLoading(false)
      return
    }

    setStep(2)
    setLoading(false)
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/verify-phone/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalizedPhone, code }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Verification failed.')
      setLoading(false)
      return
    }

    if (!data.verified) {
      setError('Invalid code. Please try again.')
      setLoading(false)
      return
    }

    // Code verified — send magic link
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          name,
          phone: normalizedPhone,
        },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      setStep(3)
      setLoading(false)
    }
  }

  async function handleResendCode() {
    setLoading(true)
    setError('')

    const res = await fetch('/api/verify-phone/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalizedPhone }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to resend code.')
    }

    setLoading(false)
  }

  if (step === 3) {
    return (
      <div className="card text-center">
        <h2 className="text-xl font-semibold text-[var(--color-primary)] mb-3">Check your email</h2>
        <p className="text-gray-600 mb-4">
          We sent a magic link to <strong>{email}</strong>. Click it to complete your signup.
        </p>
        <button
          onClick={() => { setStep(1); setCode('') }}
          className="text-sm text-[var(--color-primary)] underline"
        >
          Start over
        </button>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="card">
        <h2 className="text-xl font-semibold text-[var(--color-primary)] mb-6">Verify your phone</h2>
        <p className="text-gray-600 mb-4">
          We sent a 6-digit code to <strong>{phone}</strong>.
        </p>
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div>
            <label htmlFor="code" className="label">Verification code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="input text-center text-2xl tracking-widest"
              placeholder="000000"
              required
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button type="submit" disabled={loading || code.length !== 6} className="btn-primary w-full">
            {loading ? 'Verifying...' : 'Verify'}
          </button>

          <div className="flex justify-between text-sm">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={loading}
              className="text-[var(--color-primary)] underline"
            >
              Resend code
            </button>
            <button
              type="button"
              onClick={() => { setStep(1); setCode(''); setError('') }}
              className="text-gray-500 underline"
            >
              Back
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-[var(--color-primary)] mb-6">Join the community</h2>
      <form onSubmit={handleSendCode} className="space-y-4">
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Your name"
            required
          />
        </div>

        <div>
          <label htmlFor="email" className="label">Email address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label htmlFor="phone" className="label">Phone number</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input"
            placeholder="(415) 555-0123"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Must match a number in our WhatsApp group. We&apos;ll send a verification code.
          </p>
        </div>

        {error && (
          <p className="text-red-600 text-sm">{error}</p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Sending code...' : 'Sign up'}
        </button>
      </form>

      <p className="text-sm text-gray-500 text-center mt-4">
        Already have an account?{' '}
        <Link href="/login" className="text-[var(--color-primary)] underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
