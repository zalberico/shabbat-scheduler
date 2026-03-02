'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
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
          We sent a magic link to <strong>{email}</strong>. Click it to sign in.
        </p>
        <button
          onClick={() => setSent(false)}
          className="text-sm text-[var(--color-primary)] underline"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-[var(--color-primary)] mb-6">Sign in</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
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

        {error && (
          <p className="text-red-600 text-sm">{error}</p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Sending...' : 'Send magic link'}
        </button>
      </form>

      <p className="text-sm text-gray-500 text-center mt-4">
        New here?{' '}
        <Link href="/signup" className="text-[var(--color-primary)] underline">
          Sign up
        </Link>
      </p>
    </div>
  )
}
