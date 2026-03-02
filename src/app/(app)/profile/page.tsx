'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { KASHRUT_LEVELS, OBSERVANCE_LEVELS, DIETARY_OPTIONS } from '@/lib/types/database'
import type { KashrutLevel, ShabbatObservance } from '@/lib/types/database'

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [dietary, setDietary] = useState<string[]>([])
  const [kashrut, setKashrut] = useState<KashrutLevel>('none')
  const [observance, setObservance] = useState<ShabbatObservance>('flexible')

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profile) {
        setName(profile.name)
        setEmail(profile.email || user.email || '')
        setPhone(profile.phone)
        setDietary(profile.default_dietary_restrictions)
        setKashrut(profile.default_kashrut_preference as KashrutLevel)
        setObservance(profile.default_shabbat_observance as ShabbatObservance)
      }
      setChecking(false)
    }
    loadProfile()
  }, [])

  function toggleDietary(item: string) {
    setDietary((prev) =>
      prev.includes(item) ? prev.filter((d) => d !== item) : [...prev, item]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: updateError } = await supabase
      .from('users')
      .update({
        name,
        phone,
        default_dietary_restrictions: dietary,
        default_kashrut_preference: kashrut,
        default_shabbat_observance: observance,
      })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setLoading(false)
  }

  if (checking) {
    return (
      <div>
        <h1 className="page-title">Profile</h1>
        <div className="card text-center py-8">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">Profile & Preferences</h1>
      <p className="text-gray-600 mb-6">
        Set your defaults. These will pre-fill when you sign up each week.
      </p>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            required
          />
        </div>

        <div>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            className="input bg-gray-50"
            disabled
          />
          <p className="text-xs text-gray-500 mt-1">Email cannot be changed.</p>
        </div>

        <div>
          <label htmlFor="phone" className="label">Phone</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <span className="label">Default dietary restrictions</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {DIETARY_OPTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => toggleDietary(item)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  dietary.includes(item)
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="kashrut" className="label">Default kashrut preference</label>
          <select
            id="kashrut"
            value={kashrut}
            onChange={(e) => setKashrut(e.target.value as KashrutLevel)}
            className="input"
          >
            {KASHRUT_LEVELS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="observance" className="label">Shabbat observance</label>
          <select
            id="observance"
            value={observance}
            onChange={(e) => setObservance(e.target.value as ShabbatObservance)}
            className="input"
          >
            {OBSERVANCE_LEVELS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">Profile updated!</p>}

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
