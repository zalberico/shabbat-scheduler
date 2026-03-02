'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getWeekOf, formatWeekOf, isBeforeDeadline } from '@/lib/utils'
import { KASHRUT_LEVELS, START_TIMES } from '@/lib/types/database'
import type { KashrutLevel } from '@/lib/types/database'

export default function HostPage() {
  const router = useRouter()
  const weekOf = getWeekOf()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [existing, setExisting] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [seats, setSeats] = useState(4)
  const [kashrut, setKashrut] = useState<KashrutLevel>('none')
  const [startTime, setStartTime] = useState('7:00 PM')
  const [walkingOnly, setWalkingOnly] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    async function checkExisting() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load user defaults
      const { data: profile } = await supabase
        .from('users')
        .select('default_kashrut_preference')
        .eq('id', user.id)
        .single()

      if (profile?.default_kashrut_preference) {
        setKashrut(profile.default_kashrut_preference as KashrutLevel)
      }

      const { data: host } = await supabase
        .from('weekly_hosts')
        .select('id, seats_available, kashrut_level, start_time, walking_distance_only, notes')
        .eq('user_id', user.id)
        .eq('week_of', weekOf)
        .single()

      if (host) {
        setExisting(host.id)
        setSeats(host.seats_available)
        setKashrut(host.kashrut_level as KashrutLevel)
        setStartTime(host.start_time)
        setWalkingOnly(host.walking_distance_only)
        setNotes(host.notes || '')
      }
      setChecking(false)
    }
    checkExisting()
  }, [weekOf])

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
      seats_available: seats,
      kashrut_level: kashrut,
      start_time: startTime,
      walking_distance_only: walkingOnly,
      notes: notes || null,
    }

    let result
    if (existing) {
      result = await supabase
        .from('weekly_hosts')
        .update(payload)
        .eq('id', existing)
    } else {
      result = await supabase.from('weekly_hosts').insert(payload)
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
    await supabase
      .from('weekly_hosts')
      .update({ status: 'cancelled' })
      .eq('id', existing)
    router.push('/dashboard')
  }

  if (!isBeforeDeadline()) {
    return (
      <div>
        <h1 className="page-title">Host a Dinner</h1>
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
        <h1 className="page-title">Host a Dinner</h1>
        <div className="card text-center py-8">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">
        {existing ? 'Update Your Hosting' : 'Host a Dinner'}
      </h1>
      <p className="text-gray-600 mb-6">
        For Friday, {formatWeekOf(weekOf)}
      </p>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label htmlFor="seats" className="label">Available seats</label>
          <input
            id="seats"
            type="number"
            min={1}
            max={20}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
            className="input w-24"
            required
          />
          <p className="text-xs text-gray-500 mt-1">How many guests can you seat?</p>
        </div>

        <div>
          <label htmlFor="kashrut" className="label">Kashrut level of your dinner</label>
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
          <label htmlFor="startTime" className="label">Dinner start time</label>
          <select
            id="startTime"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="input"
          >
            {START_TIMES.map((t) => (
              <option key={t} value={t}>
                {t === 'candle_lighting' ? 'Candle lighting time' : t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="walking"
            type="checkbox"
            checked={walkingOnly}
            onChange={(e) => setWalkingOnly(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
          />
          <label htmlFor="walking" className="text-sm text-gray-700">
            Walking distance only (prefer guests who will walk to dinner)
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
            placeholder="Any additional info for your guests..."
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Saving...' : existing ? 'Update' : 'Sign up to host'}
          </button>
          {existing && (
            <button type="button" onClick={handleCancel} className="btn-danger">
              Cancel hosting
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
