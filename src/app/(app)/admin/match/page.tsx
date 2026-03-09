'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { getWeekOf, formatStartTime } from '@/lib/utils'
import { KASHRUT_LEVELS, OBSERVANCE_LEVELS } from '@/lib/types/database'
import WeekPicker from '@/components/week-picker'

interface DinnerGuest {
  guestId: string
  name: string
  partySize: number
  dietary: string[]
  signupType: string
}

interface Dinner {
  hostId: string
  hostName: string
  seatsAvailable: number
  seatsUsed: number
  kashrut: string
  observance: string
  startTime: string
  kidsOk: boolean
  dogsOk: boolean
  notes: string | null
  matchId: string | null
  guests: DinnerGuest[]
}

interface UnmatchedGuest {
  guestId: string
  name: string
  partySize: number
  kashrut: string
  observance: string
  dietary: string[]
  needsKidFriendly: boolean
  needsDogFriendly: boolean
  notes: string | null
}

const kashrutLabel = (level: string) =>
  KASHRUT_LEVELS.find((k) => k.value === level)?.label || level
const observanceLabel = (level: string) =>
  OBSERVANCE_LEVELS.find((o) => o.value === level)?.label || level

export default function AdminMatchPage() {
  const searchParams = useSearchParams()
  const [weekOf, setWeekOf] = useState(searchParams.get('week') || getWeekOf())
  const [dinners, setDinners] = useState<Dinner[]>([])
  const [unmatchedGuests, setUnmatchedGuests] = useState<UnmatchedGuest[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadMatches = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/matches?week=${weekOf}`)
    const data = await res.json()
    setDinners(data.dinners || [])
    setUnmatchedGuests(data.unmatchedGuests || [])
    setLoading(false)
  }, [weekOf])

  useEffect(() => {
    loadMatches()
  }, [loadMatches])

  async function runMatching() {
    setRunning(true)
    setResult(null)

    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_of: weekOf }),
    })
    const data = await res.json()

    if (res.ok) {
      setResult(`Matched ${data.matchedGuests || 0} guests across ${data.matched || 0} tables. ${data.unmatchedGuests || 0} unmatched.`)
    } else {
      setResult(data.error || 'Failed to run matching')
    }
    await loadMatches()
    setRunning(false)
  }

  async function sendNotifications() {
    setSending(true)
    setResult(null)

    const res = await fetch('/api/send-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_of: weekOf }),
    })
    const data = await res.json()

    if (res.ok) {
      setResult(`Sent ${data.sent || 0} notification emails.`)
    } else {
      setResult(data.error || 'Failed to send notifications')
    }
    setSending(false)
  }

  async function assignGuest(guestId: string, hostId: string) {
    setActionLoading(guestId)
    const res = await fetch('/api/admin/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id: guestId, host_id: hostId, week_of: weekOf }),
    })
    if (!res.ok) {
      const data = await res.json()
      setResult(data.error || 'Failed to assign guest')
    }
    await loadMatches()
    setActionLoading(null)
  }

  async function removeGuest(guestId: string) {
    setActionLoading(guestId)
    const res = await fetch(`/api/admin/matches?guest_id=${guestId}&week=${weekOf}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const data = await res.json()
      setResult(data.error || 'Failed to remove guest')
    }
    await loadMatches()
    setActionLoading(null)
  }

  const hasMatches = dinners.some((d) => d.guests.length > 0)

  return (
    <div>
      <h1 className="page-title">Manage Matches</h1>
      <div className="mb-6">
        <WeekPicker
          selected={weekOf}
          onChange={(w) => {
            setWeekOf(w)
            setDinners([])
            setUnmatchedGuests([])
            setResult(null)
            window.history.pushState(null, '', `/admin/match?week=${w}`)
          }}
        />
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={runMatching} disabled={running} className="btn-primary">
          {running ? 'Running...' : 'Run Matching Algorithm'}
        </button>
        <button onClick={sendNotifications} disabled={sending || !hasMatches} className="btn-secondary">
          {sending ? 'Sending...' : 'Send Notification Emails'}
        </button>
      </div>

      {result && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-sm text-blue-800">
          {result}
        </div>
      )}

      {loading ? (
        <div className="card text-center py-8">
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : (
        <>
          {/* Section 1: Dinners */}
          <h2 className="text-base font-semibold text-[var(--color-primary)] mb-3">
            Dinners ({dinners.length})
          </h2>

          {dinners.length === 0 ? (
            <div className="card text-center py-6 mb-8">
              <p className="text-gray-500">No hosts signed up for this week.</p>
            </div>
          ) : (
            <div className="space-y-4 mb-8">
              {dinners.map((dinner) => {
                const isFull = dinner.seatsUsed >= dinner.seatsAvailable
                const remaining = dinner.seatsAvailable - dinner.seatsUsed
                // Filter unmatched guests that fit in remaining seats
                const assignableGuests = unmatchedGuests.filter(
                  (g) => g.partySize <= remaining
                )

                return (
                  <div key={dinner.hostId} className={`card ${isFull ? 'opacity-75' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{dinner.hostName}&apos;s Dinner</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        isFull
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {dinner.seatsUsed} of {dinner.seatsAvailable} filled
                      </span>
                    </div>

                    <div className="text-sm text-gray-600 mb-3">
                      <p>
                        {kashrutLabel(dinner.kashrut)} &middot; {observanceLabel(dinner.observance)} &middot; {formatStartTime(dinner.startTime)}
                        {' · '}{dinner.kidsOk ? 'Kids welcome' : 'No kids'}
                        {' · '}{dinner.dogsOk ? 'Dogs welcome' : 'No dogs'}
                      </p>
                      {dinner.notes && <p className="italic mt-1">&ldquo;{dinner.notes}&rdquo;</p>}
                    </div>

                    {/* Current guests */}
                    {dinner.guests.length > 0 && (
                      <div className="border-t border-gray-100 pt-3 mb-3">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Guests</p>
                        <div className="space-y-2">
                          {dinner.guests.map((g) => (
                            <div key={g.guestId} className="bg-gray-50 rounded-lg p-2.5 flex items-center justify-between">
                              <div>
                                <span className="font-medium text-sm">{g.name}</span>
                                <span className="text-xs text-gray-500 ml-2">Party of {g.partySize}</span>
                                {g.signupType === 'direct' && (
                                  <span className="text-xs text-blue-600 ml-2">direct</span>
                                )}
                                {g.dietary.length > 0 && (
                                  <span className="text-xs text-gray-500 ml-2">{g.dietary.join(', ')}</span>
                                )}
                              </div>
                              <button
                                onClick={() => removeGuest(g.guestId)}
                                disabled={actionLoading === g.guestId}
                                className="text-red-400 hover:text-red-600 text-sm font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                                title="Remove guest"
                              >
                                {actionLoading === g.guestId ? '...' : '✕'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Add guest dropdown */}
                    {!isFull && assignableGuests.length > 0 && (
                      <div className="border-t border-gray-100 pt-3">
                        <select
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              assignGuest(e.target.value, dinner.hostId)
                            }
                          }}
                          disabled={actionLoading !== null}
                        >
                          <option value="">Add a guest...</option>
                          {assignableGuests.map((g) => (
                            <option key={g.guestId} value={g.guestId}>
                              {g.name} (party of {g.partySize})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Section 2: Unmatched Guests */}
          <h2 className="text-base font-semibold text-[var(--color-primary)] mb-3">
            Unmatched Guests ({unmatchedGuests.length})
          </h2>

          {unmatchedGuests.length === 0 ? (
            <div className="card text-center py-6">
              <p className="text-gray-500">All guests are matched!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {unmatchedGuests.map((g) => (
                <div key={g.guestId} className="card !py-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{g.name}</p>
                    <span className="text-xs text-gray-500">Party of {g.partySize}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {kashrutLabel(g.kashrut)} &middot; {observanceLabel(g.observance)}
                    {g.dietary.length > 0 && ` · ${g.dietary.join(', ')}`}
                  </p>
                  <p className="text-sm text-gray-600">
                    {g.needsKidFriendly ? 'Needs kid-friendly' : 'No kid req'}
                    {' · '}{g.needsDogFriendly ? 'Needs dog-friendly' : 'No dog req'}
                    {g.notes && ` · "${g.notes}"`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
