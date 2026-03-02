'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone } from '@/lib/utils'
import Link from 'next/link'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Check phone against allowlist via API route
    const normalized = normalizePhone(phone)
    const checkRes = await fetch('/api/check-allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalized }),
    })

    if (!checkRes.ok) {
      const data = await checkRes.json()
      setError(data.error || 'Phone number not found in community allowlist. Contact an admin to be added.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          name,
          phone: normalized,
        },
      },
    })

    if (authError) {
      setError(authError.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="card text-center">
        <h2 className="text-xl font-semibold text-[var(--color-primary)] mb-3">Check your email</h2>
        <p className="text-gray-600 mb-4">
          We sent a magic link to <strong>{email}</strong>. Click it to complete your signup.
        </p>
        <button
          onClick={() => setSent(false)}
          className="text-sm text-[var(--color-primary)] underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-[var(--color-primary)] mb-6">Join the community</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
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
            Must match a number in our WhatsApp group to verify membership.
          </p>
        </div>

        {error && (
          <p className="text-red-600 text-sm">{error}</p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Checking...' : 'Sign up'}
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
