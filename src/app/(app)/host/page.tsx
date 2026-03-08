'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getWeekOf, isBeforeDeadline, formatStartTime } from '@/lib/utils'
import { KASHRUT_LEVELS, OBSERVANCE_LEVELS, START_TIMES } from '@/lib/types/database'
import type { KashrutLevel, ShabbatObservance } from '@/lib/types/database'
import WeekPicker from '@/components/week-picker'

interface GuestInfo {
  name: string
  partySize: number
  dietary: string[]
  kashrut: string
  observance: string
  needsKidFriendly: boolean
  needsDogFriendly: boolean
  notes: string | null
  signupType: string
}

const kashrutLabel = (level: string) =>
  KASHRUT_LEVELS.find((k) => k.value === level)?.label || level

const observanceLabel = (level: string) =>
  OBSERVANCE_LEVELS.find((o) => o.value === level)?.label || level

export default function HostPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [weekOf, setWeekOf] = useState(searchParams.get('week') || getWeekOf())
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [existing, setExisting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'overview' | 'edit'>('overview')
  const [guests, setGuests] = useState<GuestInfo[]>([])
  const [seatsUsed, setSeatsUsed] = useState(0)

  const [seats, setSeats] = useState(4)
  const [kashrut, setKashrut] = useState<KashrutLevel>('none')
  const [observance, setObservance] = useState<ShabbatObservance>('flexible')
  const [startTime, setStartTime] = useState('7:00 PM')
  const [address, setAddress] = useState('')
  const [kidsFriendly, setKidsFriendly] = useState('')
  const [dogsFriendly, setDogsFriendly] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    async function checkExisting() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load user defaults
      const { data: profile } = await supabase
        .from('users')
        .select('default_kashrut_preference, default_shabbat_observance')
        .eq('id', user.id)
        .single()

      if (profile?.default_kashrut_preference) {
        setKashrut(profile.default_kashrut_preference as KashrutLevel)
      }
      if (profile?.default_shabbat_observance) {
        setObservance(profile.default_shabbat_observance as ShabbatObservance)
      }

      const { data: host } = await supabase
        .from('weekly_hosts')
        .select('id, seats_available, kashrut_level, observance_level, start_time, address, kids_friendly, dogs_friendly, notes')
        .eq('user_id', user.id)
        .eq('week_of', weekOf)
        .neq('status', 'cancelled')
        .single()

      if (host) {
        setExisting(host.id)
        setSeats(host.seats_available)
        setKashrut(host.kashrut_level as KashrutLevel)
        setObservance((host.observance_level as ShabbatObservance) || 'flexible')
        setStartTime(host.start_time)
        setAddress(host.address || '')
        setKidsFriendly(host.kids_friendly ? 'yes' : 'no')
        setDogsFriendly(host.dogs_friendly ? 'yes' : 'no')
        setNotes(host.notes || '')

        // Fetch guest data
        try {
          const res = await fetch(`/api/host-guests?week=${weekOf}`)
          if (res.ok) {
            const data = await res.json()
            setGuests(data.guests || [])
            setSeatsUsed(data.seatsUsed || 0)
          }
        } catch {
          // Continue without guest data
        }
      }
      setChecking(false)
    }
    setMode('overview')
    setGuests([])
    setSeatsUsed(0)
    checkExisting()
  }, [weekOf])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Geocode address if provided
    let lat: number | null = null
    let lng: number | null = null
    if (address.trim()) {
      try {
        const geoRes = await fetch('/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: address.trim() }),
        })
        if (geoRes.ok) {
          const geoData = await geoRes.json()
          lat = geoData.lat
          lng = geoData.lng
        }
      } catch {
        // Continue without geocoding
      }
    }

    const payload = {
      user_id: user.id,
      week_of: weekOf,
      seats_available: seats,
      kashrut_level: kashrut,
      observance_level: observance,
      start_time: startTime,
      address: address.trim() || null,
      lat,
      lng,
      kids_friendly: kidsFriendly === 'yes',
      dogs_friendly: dogsFriendly === 'yes',
      notes: notes || null,
    }

    let result
    if (existing) {
      result = await supabase
        .from('weekly_hosts')
        .update(payload)
        .eq('id', existing)
    } else {
      // Check for a cancelled entry for this week (unique constraint: user_id + week_of)
      const { data: cancelled } = await supabase
        .from('weekly_hosts')
        .select('id')
        .eq('user_id', user.id)
        .eq('week_of', weekOf)
        .eq('status', 'cancelled')
        .single()

      if (cancelled) {
        result = await supabase
          .from('weekly_hosts')
          .update({ ...payload, status: 'open' })
          .eq('id', cancelled.id)
      } else {
        result = await supabase.from('weekly_hosts').insert(payload)
      }
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
    } else {
      if (existing) {
        // Return to overview after editing
        setMode('overview')
        setLoading(false)
      } else {
        router.push('/dashboard')
      }
    }
  }

  async function handleCancel() {
    if (!existing) return
    await fetch('/api/cancel-hosting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_of: weekOf }),
    })
    router.push('/dashboard')
  }

  function handleWeekChange(newWeek: string) {
    setWeekOf(newWeek)
    setExisting(null)
    setChecking(true)
    router.push(`/host?week=${newWeek}`, { scroll: false })
  }

  const beforeDeadline = isBeforeDeadline(weekOf)

  // Past deadline with no existing entry — show closed message
  if (!beforeDeadline && !existing && !checking) {
    return (
      <div>
        <h1 className="page-title">Host a Dinner</h1>
        <div className="mb-4">
          <WeekPicker selected={weekOf} onChange={handleWeekChange} />
        </div>
        <div className="card text-center py-8">
          <p className="text-gray-600">Signups for this Friday are closed.</p>
          <p className="text-sm text-gray-500 mt-2">Select a future Friday above to host an upcoming dinner.</p>
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

  // Existing entry in overview mode
  if (existing && mode === 'overview') {
    return (
      <div>
        <h1 className="page-title">Your Dinner</h1>
        <div className="mb-6">
          <WeekPicker selected={weekOf} onChange={handleWeekChange} />
        </div>

        {/* Dinner Details */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Dinner Details</h2>
            {beforeDeadline && (
              <button
                onClick={() => setMode('edit')}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Edit
              </button>
            )}
          </div>
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              {seats} seats &middot; {kashrutLabel(kashrut)} &middot; {formatStartTime(startTime)}
            </p>
            {observance !== 'flexible' && (
              <p>Observance: {observanceLabel(observance)}</p>
            )}
            <p>
              {kidsFriendly === 'yes' ? 'Kids welcome' : 'No kids'}
              {' \u00B7 '}
              {dogsFriendly === 'yes' ? 'Dogs welcome' : 'No dogs'}
            </p>
            {notes && <p className="italic">&ldquo;{notes}&rdquo;</p>}
          </div>
        </div>

        {/* Guest List */}
        <div className="card mb-4">
          <h2 className="text-lg font-semibold mb-3">
            Your Guests
            <span className="text-sm font-normal text-gray-500 ml-2">
              {seatsUsed} of {seats} seats filled
            </span>
          </h2>
          {guests.length === 0 ? (
            <p className="text-gray-500 text-sm">No guests signed up yet.</p>
          ) : (
            <div className="space-y-3">
              {guests.map((guest, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{guest.name}</span>
                    <span className="text-sm text-gray-500">Party of {guest.partySize}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    <p>
                      {kashrutLabel(guest.kashrut)}
                      {guest.dietary.length > 0 && ` \u00B7 ${guest.dietary.join(', ')}`}
                    </p>
                    {guest.observance !== 'flexible' && (
                      <p>{observanceLabel(guest.observance)}</p>
                    )}
                    {guest.needsKidFriendly && <p>Needs kid-friendly</p>}
                    {guest.needsDogFriendly && <p>Needs dog-friendly</p>}
                    {guest.notes && (
                      <p className="italic mt-1">&ldquo;{guest.notes}&rdquo;</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cancel button */}
        {beforeDeadline && (
          <div className="flex gap-3">
            <button type="button" onClick={handleCancel} className="btn-danger">
              Cancel hosting
            </button>
          </div>
        )}
      </div>
    )
  }

  // Edit mode or new entry — show form
  const showAddressField = observance === 'traditional' || observance === 'shomer_shabbat'

  return (
    <div>
      <h1 className="page-title">
        {existing ? 'Update Your Hosting' : 'Host a Dinner'}
      </h1>
      <div className="mb-6">
        <WeekPicker selected={weekOf} onChange={handleWeekChange} />
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label htmlFor="seats" className="label">Available seats</label>
          <input
            id="seats"
            type="number"
            min={1}
            value={seats || ''}
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
          <label htmlFor="observance" className="label">Observance level of your dinner</label>
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

        {showAddressField && (
          <div>
            <label htmlFor="address" className="label">Address (optional)</label>
            <input
              id="address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input"
              placeholder="123 Main St, San Francisco, CA"
            />
            <p className="text-xs text-gray-500 mt-1">
              Share your address to help Shomer Shabbat guests find dinners within walking distance
            </p>
          </div>
        )}

        <div>
          <label htmlFor="kidsFriendly" className="label">Kids welcome</label>
          <select
            id="kidsFriendly"
            value={kidsFriendly}
            onChange={(e) => setKidsFriendly(e.target.value)}
            className="input"
            required
          >
            <option value="" disabled>Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div>
          <label htmlFor="dogsFriendly" className="label">Dogs welcome</label>
          <select
            id="dogsFriendly"
            value={dogsFriendly}
            onChange={(e) => setDogsFriendly(e.target.value)}
            className="input"
            required
          >
            <option value="" disabled>Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div>
          <label htmlFor="notes" className="label">Notes (optional)</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            rows={3}
            placeholder="e.g. Potluck style — bring a dish to share! No phones at the table. We have kids ages 3 & 6. Vegetarian meal. Doors open 30 min before candle lighting."
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Saving...' : existing ? 'Update' : 'Sign up to host'}
          </button>
          {existing && (
            <button type="button" onClick={() => setMode('overview')} className="btn-secondary">
              Back
            </button>
          )}
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
