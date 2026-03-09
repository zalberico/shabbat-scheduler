'use client'

import { useState, useEffect, useCallback } from 'react'
import { getWeekOf, formatWeekOf, formatStartTime, getFutureFridays } from '@/lib/utils'
import { KASHRUT_LEVELS, OBSERVANCE_LEVELS } from '@/lib/types/database'

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

interface WeekData {
  dinners: Dinner[]
  unmatchedGuests: UnmatchedGuest[]
}

const kashrutLabel = (level: string) =>
  KASHRUT_LEVELS.find((k) => k.value === level)?.label || level
const observanceLabel = (level: string) =>
  OBSERVANCE_LEVELS.find((o) => o.value === level)?.label || level

export default function AdminMatchPage() {
  const currentWeekOf = getWeekOf()
  const weeks = getFutureFridays(6)
  const [weekData, setWeekData] = useState<Record<string, WeekData>>({})
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadAllWeeks = useCallback(async () => {
    setLoading(true)
    const results: Record<string, WeekData> = {}
    await Promise.all(
      weeks.map(async (week) => {
        const res = await fetch(`/api/admin/matches?week=${week}`)
        const data = await res.json()
        results[week] = {
          dinners: data.dinners || [],
          unmatchedGuests: data.unmatchedGuests || [],
        }
      })
    )
    setWeekData(results)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadWeek = useCallback(async (week: string) => {
    const res = await fetch(`/api/admin/matches?week=${week}`)
    const data = await res.json()
    setWeekData((prev) => ({
      ...prev,
      [week]: {
        dinners: data.dinners || [],
        unmatchedGuests: data.unmatchedGuests || [],
      },
    }))
  }, [])

  useEffect(() => {
    loadAllWeeks()
  }, [loadAllWeeks])

  async function runMatching(weekOf: string) {
    setRunning(weekOf)
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
    await loadWeek(weekOf)
    setRunning(null)
  }

  async function sendNotifications(weekOf: string) {
    setSending(weekOf)
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
    setSending(null)
  }

  async function assignGuest(guestId: string, hostId: string, weekOf: string) {
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
    await loadWeek(weekOf)
    setActionLoading(null)
  }

  async function removeGuest(guestId: string, weekOf: string) {
    setActionLoading(guestId)
    const res = await fetch(`/api/admin/matches?guest_id=${guestId}&week=${weekOf}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const data = await res.json()
      setResult(data.error || 'Failed to remove guest')
    }
    await loadWeek(weekOf)
    setActionLoading(null)
  }

  // Filter to weeks that have data
  const activeWeeks = weeks.filter((w) => {
    const data = weekData[w]
    return data && (data.dinners.length > 0 || data.unmatchedGuests.length > 0)
  })

  return (
    <div>
      <h1 className="page-title">Manage Matches</h1>

      {result && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-sm text-blue-800">
          {result}
        </div>
      )}

      {loading ? (
        <div className="card text-center py-8">
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : activeWeeks.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-500">No signups for any upcoming weeks.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {activeWeeks.map((week) => {
            const data = weekData[week]
            if (!data) return null
            const { dinners, unmatchedGuests } = data
            const hasMatches = dinners.some((d) => d.guests.length > 0)
            const isThisWeek = week === currentWeekOf

            return (
              <div key={week}>
                {/* Week separator */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <h2 className="text-lg font-semibold whitespace-nowrap">
                      {isThisWeek ? 'This Friday' : 'Friday'}, {formatWeekOf(week)}
                    </h2>
                    <div className="h-px bg-gray-200 flex-1" />
                  </div>
                </div>

                {/* Action buttons per week */}
                <div className="flex flex-wrap gap-3 mb-4">
                  <button
                    onClick={() => runMatching(week)}
                    disabled={running !== null}
                    className="btn-primary text-sm"
                  >
                    {running === week ? 'Running...' : 'Run Matching'}
                  </button>
                  <button
                    onClick={() => sendNotifications(week)}
                    disabled={sending !== null || !hasMatches}
                    className="btn-secondary text-sm"
                  >
                    {sending === week ? 'Sending...' : 'Send Notifications'}
                  </button>
                </div>

                {/* Dinners */}
                {dinners.length > 0 && (
                  <>
                    <h3 className="text-base font-semibold text-[var(--color-primary)] mb-3">
                      Dinners ({dinners.length})
                    </h3>
                    <div className="space-y-4 mb-6">
                      {dinners.map((dinner) => {
                        const isFull = dinner.seatsUsed >= dinner.seatsAvailable
                        const remaining = dinner.seatsAvailable - dinner.seatsUsed
                        const assignableGuests = unmatchedGuests.filter(
                          (g) => g.partySize <= remaining
                        )

                        return (
                          <div key={dinner.hostId} className={`card ${isFull ? 'opacity-75' : ''}`}>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold">{dinner.hostName}&apos;s Dinner</h4>
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
                                        onClick={() => removeGuest(g.guestId, week)}
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
                                      assignGuest(e.target.value, dinner.hostId, week)
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
                  </>
                )}

                {/* Unmatched Guests */}
                {unmatchedGuests.length > 0 && (
                  <>
                    <h3 className="text-base font-semibold text-[var(--color-primary)] mb-3">
                      Unmatched Guests ({unmatchedGuests.length})
                    </h3>
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
                  </>
                )}

                {/* Empty state for week with no dinners and no guests */}
                {dinners.length === 0 && unmatchedGuests.length === 0 && (
                  <div className="card text-center py-6">
                    <p className="text-gray-500">No signups for this week.</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
