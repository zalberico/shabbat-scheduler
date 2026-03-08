'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getWeekOf, formatWeekOf, isBeforeDeadline, formatStartTime, approximateArea, haversineDistanceMiles } from '@/lib/utils'
import { KASHRUT_LEVELS, KASHRUT_RANK, OBSERVANCE_LEVELS, OBSERVANCE_RANK, DIETARY_OPTIONS } from '@/lib/types/database'
import type { KashrutLevel, ShabbatObservance } from '@/lib/types/database'
import WeekPicker from '@/components/week-picker'

interface HostCard {
  id: string
  user_id: string
  hostName: string
  seats_available: number
  kashrut_level: KashrutLevel
  observance_level: ShabbatObservance
  start_time: string
  kids_friendly: boolean
  dogs_friendly: boolean
  address: string | null
  lat: number | null
  lng: number | null
  notes: string | null
  seatsUsed: number
}

interface UserProfile {
  default_dietary_restrictions: string[]
  default_kashrut_preference: KashrutLevel
  default_shabbat_observance: ShabbatObservance
}

type ExistingSignup = {
  id: string
  signup_type: 'match_pool' | 'direct'
  status: string
  selected_host_id: string | null
}

export default function BrowsePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [weekOf, setWeekOf] = useState(searchParams.get('week') || getWeekOf())
  const beforeDeadline = isBeforeDeadline(weekOf)

  const [loading, setLoading] = useState(true)
  const [hosts, setHosts] = useState<HostCard[]>([])
  const [existingSignup, setExistingSignup] = useState<ExistingSignup | null>(null)
  const [isHosting, setIsHosting] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)

  // Signup form state
  const [expandedHost, setExpandedHost] = useState<string | null>(null)
  const [partySize, setPartySize] = useState(1)
  const [dietary, setDietary] = useState<string[]>([])
  const [kashrut, setKashrut] = useState<KashrutLevel>('none')
  const [observance, setObservance] = useState<ShabbatObservance>('flexible')
  const [canWalk, setCanWalk] = useState(false)
  const [address, setAddress] = useState('')
  const [needsKidFriendly, setNeedsKidFriendly] = useState(false)
  const [needsDogFriendly, setNeedsDogFriendly] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])

  function handleWeekChange(newWeek: string) {
    setWeekOf(newWeek)
    setHosts([])
    setExistingSignup(null)
    setIsHosting(false)
    setExpandedHost(null)
    setLoading(true)
    router.push(`/browse?week=${newWeek}`, { scroll: false })
  }

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load profile defaults
      const { data: userProfile } = await supabase
        .from('users')
        .select('default_dietary_restrictions, default_kashrut_preference, default_shabbat_observance')
        .eq('id', user.id)
        .single()

      if (userProfile) {
        setProfile(userProfile as UserProfile)
        if (userProfile.default_dietary_restrictions?.length) {
          setDietary(userProfile.default_dietary_restrictions)
        }
        if (userProfile.default_kashrut_preference) {
          setKashrut(userProfile.default_kashrut_preference as KashrutLevel)
        }
        if (userProfile.default_shabbat_observance) {
          setObservance(userProfile.default_shabbat_observance as ShabbatObservance)
        }
      }

      // Check existing guest entry
      const { data: guestEntry } = await supabase
        .from('weekly_guests')
        .select('id, signup_type, status, selected_host_id')
        .eq('user_id', user.id)
        .eq('week_of', weekOf)
        .single()

      if (guestEntry) {
        setExistingSignup(guestEntry as ExistingSignup)
      }

      // Check if hosting
      const { data: hostEntry } = await supabase
        .from('weekly_hosts')
        .select('id')
        .eq('user_id', user.id)
        .eq('week_of', weekOf)
        .neq('status', 'cancelled')
        .single()

      if (hostEntry) {
        setIsHosting(true)
      }

      // Fetch all hosts for this week
      const { data: weeklyHosts } = await supabase
        .from('weekly_hosts')
        .select('id, user_id, seats_available, kashrut_level, observance_level, start_time, kids_friendly, dogs_friendly, address, lat, lng, notes')
        .eq('week_of', weekOf)
        .neq('status', 'cancelled')

      if (weeklyHosts?.length) {
        // Fetch host user names
        const userIds = weeklyHosts.map((h) => h.user_id)
        const { data: hostUsers } = await supabase
          .from('users')
          .select('id, name')
          .in('id', userIds)

        // Fetch direct signup counts per host
        const { data: directSignups } = await supabase
          .from('weekly_guests')
          .select('selected_host_id, party_size')
          .eq('week_of', weekOf)
          .eq('signup_type', 'direct')
          .not('selected_host_id', 'is', null)

        const seatsByHost = new Map<string, number>()
        directSignups?.forEach((g) => {
          if (g.selected_host_id) {
            seatsByHost.set(g.selected_host_id, (seatsByHost.get(g.selected_host_id) || 0) + g.party_size)
          }
        })

        const cards: HostCard[] = weeklyHosts.map((h) => ({
          id: h.id,
          user_id: h.user_id,
          hostName: hostUsers?.find((u) => u.id === h.user_id)?.name?.split(' ')[0] || 'Host',
          seats_available: h.seats_available,
          kashrut_level: h.kashrut_level as KashrutLevel,
          observance_level: (h.observance_level as ShabbatObservance) || 'flexible',
          start_time: h.start_time,
          kids_friendly: h.kids_friendly,
          dogs_friendly: h.dogs_friendly,
          address: h.address,
          lat: h.lat,
          lng: h.lng,
          notes: h.notes,
          seatsUsed: seatsByHost.get(h.id) || 0,
        }))

        setHosts(cards)
      }

      setLoading(false)
    }
    loadData()
  }, [weekOf])

  function resetForm() {
    setPartySize(1)
    setDietary(profile?.default_dietary_restrictions || [])
    setKashrut(profile?.default_kashrut_preference || 'none')
    setObservance(profile?.default_shabbat_observance || 'flexible')
    setCanWalk(false)
    setAddress('')
    setNeedsKidFriendly(false)
    setNeedsDogFriendly(false)
    setNotes('')
    setError('')
    setWarnings([])
  }

  function toggleExpand(hostId: string) {
    if (expandedHost === hostId) {
      setExpandedHost(null)
      setWarnings([])
    } else {
      resetForm()
      setExpandedHost(hostId)
    }
  }

  function checkWarnings(host: HostCard) {
    const w: string[] = []
    if (KASHRUT_RANK[kashrut] > KASHRUT_RANK[host.kashrut_level]) {
      w.push(`Your kashrut requirement (${KASHRUT_LEVELS.find((k) => k.value === kashrut)?.label}) exceeds this dinner's level (${KASHRUT_LEVELS.find((k) => k.value === host.kashrut_level)?.label}).`)
    }
    if (OBSERVANCE_RANK[observance] > OBSERVANCE_RANK[host.observance_level]) {
      w.push(`Your observance requirement (${OBSERVANCE_LEVELS.find((o) => o.value === observance)?.label}) exceeds this dinner's level (${OBSERVANCE_LEVELS.find((o) => o.value === host.observance_level)?.label}).`)
    }
    if (needsKidFriendly && !host.kids_friendly) {
      w.push('This dinner is not marked as kid-friendly.')
    }
    if (needsDogFriendly && !host.dogs_friendly) {
      w.push('This dinner is not marked as dog-friendly.')
    }
    if (canWalk && host.lat != null && host.lng != null) {
      // We don't have guest coords yet, but warn if host has no address
    }
    setWarnings(w)
    return w
  }

  async function handleDirectSignup(host: HostCard) {
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/direct-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_id: host.id,
        week_of: weekOf,
        party_size: partySize,
        dietary_restrictions: dietary,
        kashrut_requirement: kashrut,
        observance_requirement: observance,
        can_walk: canWalk,
        address: canWalk ? address : null,
        needs_kid_friendly: needsKidFriendly,
        needs_dog_friendly: needsDogFriendly,
        notes: notes || null,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      setSubmitting(false)
      return
    }

    setExistingSignup({
      id: '',
      signup_type: 'direct',
      status: 'matched',
      selected_host_id: host.id,
    })
    setExpandedHost(null)
    setSubmitting(false)
    router.refresh()
  }

  async function handleCancelDirectSignup() {
    setCancelling(true)
    const res = await fetch(`/api/direct-signup?week=${weekOf}`, { method: 'DELETE' })
    if (res.ok) {
      setExistingSignup(null)
      setCancelling(false)
      router.refresh()
      // Reload data
      window.location.reload()
    } else {
      setCancelling(false)
    }
  }

  function toggleDietary(item: string) {
    setDietary((prev) =>
      prev.includes(item) ? prev.filter((d) => d !== item) : [...prev, item]
    )
  }

  const kashrutLabel = (level: string) =>
    KASHRUT_LEVELS.find((k) => k.value === level)?.label || level

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Browse Dinners</h1>
        <div className="card text-center py-8">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  const signedUpHostName = existingSignup?.signup_type === 'direct' && existingSignup.selected_host_id
    ? hosts.find((h) => h.id === existingSignup.selected_host_id)?.hostName
    : null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title mb-0">Browse Dinners</h1>
          <div className="mt-1">
            <WeekPicker selected={weekOf} onChange={handleWeekChange} />
          </div>
        </div>
        {beforeDeadline ? (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
            Signups open
          </span>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
            Signups closed
          </span>
        )}
      </div>

      {/* Match me to any dinner CTA */}
      {!existingSignup && !isHosting && beforeDeadline && (
        <div className="card mb-6 bg-gradient-to-r from-[var(--color-primary)]/5 to-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[var(--color-primary)]">Match Me to Any Dinner</h2>
              <p className="text-sm text-gray-600 mt-1">
                New here? We&apos;ll find the perfect dinner for you based on your preferences.
              </p>
            </div>
            <Link href="/join" className="btn-primary whitespace-nowrap ml-4">
              Sign Me Up
            </Link>
          </div>
        </div>
      )}

      {/* Already signed up banner */}
      {existingSignup && (
        <div className="card mb-6 bg-green-50 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              {existingSignup.signup_type === 'direct' ? (
                <p className="text-sm text-green-800">
                  You&apos;re signed up for <strong>{signedUpHostName}&apos;s</strong> dinner!
                </p>
              ) : (
                <p className="text-sm text-green-800">
                  You&apos;re in the matching pool.{' '}
                  <Link href="/join" className="underline">Edit your preferences</Link>
                </p>
              )}
            </div>
            {existingSignup.signup_type === 'direct' && (
              <button
                onClick={handleCancelDirectSignup}
                disabled={cancelling}
                className="btn-danger text-sm"
              >
                {cancelling ? 'Cancelling...' : 'Cancel signup'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Already hosting banner */}
      {isHosting && (
        <div className="card mb-6 bg-blue-50 border border-blue-200">
          <p className="text-sm text-blue-800">
            You&apos;re hosting this week!{' '}
            <Link href="/host" className="underline">Manage your dinner</Link>
          </p>
        </div>
      )}

      {/* Host cards */}
      {hosts.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-600">No dinners available yet this week.</p>
          <p className="text-sm text-gray-500 mt-2">Check back later or sign up to host!</p>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Available Dinners</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hosts.map((host) => {
              const remaining = host.seats_available - host.seatsUsed
              const isFull = remaining <= 0
              const isExpanded = expandedHost === host.id
              const canSignUp = beforeDeadline && !existingSignup && !isHosting && !isFull

              return (
                <div key={host.id} className="card">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-[var(--color-primary)]">
                      {host.hostName}&apos;s Dinner
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isFull ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {isFull ? 'Full' : `${remaining} of ${host.seats_available} seats left`}
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 space-y-1 mb-3">
                    <p>
                      {kashrutLabel(host.kashrut_level)}
                      {host.observance_level !== 'flexible' && (
                        <> &middot; {OBSERVANCE_LEVELS.find((o) => o.value === host.observance_level)?.label}</>
                      )}
                    </p>
                    <p>
                      {formatStartTime(host.start_time)}
                      {host.kids_friendly && ' · Kids welcome'}
                      {host.dogs_friendly && ' · Dogs welcome'}
                    </p>
                    <p className="text-gray-500">{approximateArea(host.address)}</p>
                  </div>

                  {host.notes && (
                    <p className="text-sm text-gray-500 italic mb-3 line-clamp-2">
                      &ldquo;{host.notes}&rdquo;
                    </p>
                  )}

                  {canSignUp && !isExpanded && (
                    <button
                      onClick={() => toggleExpand(host.id)}
                      className="btn-primary w-full text-sm"
                    >
                      Sign Up
                    </button>
                  )}

                  {/* Expanded signup form */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                      {warnings.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          {warnings.map((w, i) => (
                            <p key={i} className="text-sm text-yellow-800">{w}</p>
                          ))}
                          <p className="text-xs text-yellow-600 mt-1">You can still sign up if you&apos;re okay with this.</p>
                        </div>
                      )}

                      <div>
                        <label htmlFor={`partySize-${host.id}`} className="label">Party size</label>
                        <input
                          id={`partySize-${host.id}`}
                          type="number"
                          min={1}
                          max={remaining}
                          value={partySize}
                          onChange={(e) => setPartySize(Number(e.target.value))}
                          className="input w-24"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">Including yourself ({remaining} seats available)</p>
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
                        <label htmlFor={`kashrut-${host.id}`} className="label">Minimum kashrut level needed</label>
                        <select
                          id={`kashrut-${host.id}`}
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
                        <label htmlFor={`observance-${host.id}`} className="label">Minimum observance level needed</label>
                        <select
                          id={`observance-${host.id}`}
                          value={observance}
                          onChange={(e) => setObservance(e.target.value as ShabbatObservance)}
                          className="input"
                        >
                          {OBSERVANCE_LEVELS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          id={`canWalk-${host.id}`}
                          type="checkbox"
                          checked={canWalk}
                          onChange={(e) => setCanWalk(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <label htmlFor={`canWalk-${host.id}`} className="text-sm text-gray-700">
                          I don&apos;t drive on Shabbat
                        </label>
                      </div>

                      {canWalk && (
                        <div>
                          <label htmlFor={`address-${host.id}`} className="label">Your address (for walking distance)</label>
                          <input
                            id={`address-${host.id}`}
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            className="input"
                            placeholder="123 Main St, San Francisco, CA"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <input
                          id={`kids-${host.id}`}
                          type="checkbox"
                          checked={needsKidFriendly}
                          onChange={(e) => setNeedsKidFriendly(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <label htmlFor={`kids-${host.id}`} className="text-sm text-gray-700">
                          I need a kid-friendly dinner
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          id={`dogs-${host.id}`}
                          type="checkbox"
                          checked={needsDogFriendly}
                          onChange={(e) => setNeedsDogFriendly(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <label htmlFor={`dogs-${host.id}`} className="text-sm text-gray-700">
                          I need a dog-friendly dinner
                        </label>
                      </div>

                      <div>
                        <label htmlFor={`notes-${host.id}`} className="label">Notes (optional)</label>
                        <textarea
                          id={`notes-${host.id}`}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="input"
                          rows={2}
                          placeholder="e.g. Severe nut allergy. Happy to bring a side dish or dessert! Kids are 2 & 5. We'd love to meet other young families."
                        />
                      </div>

                      {error && <p className="text-red-600 text-sm">{error}</p>}

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            const w = checkWarnings(host)
                            if (w.length > 0 && warnings.length === 0) {
                              // First click shows warnings, second click confirms
                              return
                            }
                            handleDirectSignup(host)
                          }}
                          disabled={submitting}
                          className="btn-primary"
                        >
                          {submitting ? 'Signing up...' : warnings.length > 0 ? 'Sign Up Anyway' : 'Confirm Signup'}
                        </button>
                        <button
                          onClick={() => { setExpandedHost(null); setWarnings([]) }}
                          className="btn-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
