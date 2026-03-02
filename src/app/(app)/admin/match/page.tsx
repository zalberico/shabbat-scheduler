'use client'

import { useState, useEffect, useCallback } from 'react'
import { getWeekOf, formatWeekOf } from '@/lib/utils'

interface MatchDisplay {
  matchId: string
  hostName: string
  hostEmail: string
  guests: { name: string; email: string; partySize: number; dietary: string[] }[]
}

export default function AdminMatchPage() {
  const weekOf = getWeekOf()
  const [matches, setMatches] = useState<MatchDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const loadMatches = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/matches')
    const data = await res.json()
    setMatches(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

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

  return (
    <div>
      <h1 className="page-title">Manage Matches</h1>
      <p className="text-gray-600 mb-6">Week of {formatWeekOf(weekOf)}</p>

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={runMatching} disabled={running} className="btn-primary">
          {running ? 'Running...' : 'Run Matching Algorithm'}
        </button>
        <button onClick={sendNotifications} disabled={sending || matches.length === 0} className="btn-secondary">
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
          <p className="text-gray-500">Loading matches...</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-600">No matches yet. Run the matching algorithm to create matches.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => (
            <div key={match.matchId} className="card">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🏠</span>
                <h3 className="font-semibold">{match.hostName}</h3>
                <span className="text-sm text-gray-500">{match.hostEmail}</span>
              </div>
              <div className="pl-8 space-y-1">
                {match.guests.map((g, i) => (
                  <p key={i} className="text-sm">
                    <span className="font-medium">{g.name}</span>
                    {' '}(party of {g.partySize})
                    {g.dietary.length > 0 && (
                      <span className="text-gray-500"> — {g.dietary.join(', ')}</span>
                    )}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
