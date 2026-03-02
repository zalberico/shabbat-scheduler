'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getWeekOf, formatWeekOf, isBeforeDeadline } from '@/lib/utils'
import { KASHRUT_LEVELS, DIETARY_OPTIONS } from '@/lib/types/database'
import type { KashrutLevel } from '@/lib/types/database'

export default function JoinPage() {
  const router = useRouter()
  const weekOf = getWeekOf()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [existing, setExisting] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [partySize, setPartySize] = useState(1)
  const [dietary, setDietary] = useState<string[]>([])
  const [kashrut, setKashrut] = useState<KashrutLevel>('none')
  const [canWalk, setCanWalk] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    async function checkExisting() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load user defaults
      const { data: profile } = await supabase
        .from('users')
        .select('default_dietary_restrictions, default_kashrut_preference')
        .eq('id', user.id)
        .single()

      if (profile) {
        if (profile.default_dietary_restrictions?.length) {
          setDietary(profile.default_dietary_restrictions)
        }
        if (profile.default_kashrut_preference) {
          setKashrut(profile.default_kashrut_preference as KashrutLevel)
        }
      }

      const { data: guest } = await supabase
        .from('weekly_guests')
        .select('id, party_size, dietary_restrictions, kashrut_requirement, can_walk, notes')
        .eq('user_id', user.id)
        .eq('week_of', weekOf)
        .single()

      if (guest) {
        setExisting(guest.id)
        setPartySize(guest.party_size)
        setDietary(guest.dietary_restrictions)
        setKashrut(guest.kashrut_requirement as KashrutLevel)
        setCanWalk(guest.can_walk)
        setNotes(guest.notes || '')
      }
      setChecking(false)
    }
    checkExisting()
  }, [weekOf])

  function toggleDietary(item: string) {
    setDietary((prev) =>
      prev.includes(item) ? prev.filter((d) => d !== item) : [...prev, item]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      week_of: weekOf,
      party_size: partySize,
      dietary_restrictions: dietary,
      kashrut_requirement: kashrut,
      can_walk: canWalk,
      notes: notes || null,
    }

    let result
    if (existing) {
      result = await supabase
        .from('weekly_guests')
        .update(payload)
        .eq('id', existing)
    } else {
      result = await supabase.from('weekly_guests').insert(payload)
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  async function handleCancel() {
    if (!existing) return
    const supabase = createClient()
    await supabase.from('weekly_guests').delete().eq('id', existing)
    router.push('/dashboard')
  }

  if (!isBeforeDeadline()) {
    return (
      <div>
        <h1 className="page-title">Join a Dinner</h1>
        <div className="card text-center py-8">
          <p className="text-gray-600">Signups for this week are closed.</p>
          <p className="text-sm text-gray-500 mt-2">Check back Sunday to sign up for next week.</p>
        </div>
      </div>
    )
  }

  if (checking) {
    return (
      <div>
        <h1 className="page-title">Join a Dinner</h1>
        <div className="card text-center py-8">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">
        {existing ? 'Update Your Signup' : 'Join a Dinner'}
      </h1>
      <p className="text-gray-600 mb-6">
        For Friday, {formatWeekOf(weekOf)}
      </p>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label htmlFor="partySize" className="label">Party size</label>
          <input
            id="partySize"
            type="number"
            min={1}
            max={10}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
            className="input w-24"
            required
          />
          <p className="text-xs text-gray-500 mt-1">Including yourself</p>
        </div>

        <div>
          <span className="label">Dietary restrictions</span>
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
          <label htmlFor="kashrut" className="label">Minimum kashrut level needed</label>
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

        <div className="flex items-center gap-3">
          <input
            id="canWalk"
            type="checkbox"
            checked={canWalk}
            onChange={(e) => setCanWalk(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
          />
          <label htmlFor="canWalk" className="text-sm text-gray-700">
            I can walk to dinner (relevant for Shomer Shabbat hosts)
          </label>
        </div>

        <div>
          <label htmlFor="notes" className="label">Notes (optional)</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            rows={3}
            placeholder="Anything else the host should know..."
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Saving...' : existing ? 'Update' : 'Sign up as guest'}
          </button>
          {existing && (
            <button type="button" onClick={handleCancel} className="btn-danger">
              Cancel signup
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
