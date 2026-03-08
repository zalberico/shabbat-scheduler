'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { normalizePhone } from '@/lib/utils'

interface AllowlistUser {
  name: string
  email: string
  is_banned: boolean
}

interface AllowlistEntry {
  id: string
  phone: string
  uploaded_at: string
  user: AllowlistUser | null
}

export default function AllowlistPage() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [csvText, setCsvText] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const loadAllowlist = useCallback(async () => {
    const res = await fetch('/api/admin/allowlist')
    const data = await res.json()
    setEntries(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAllowlist()
  }, [loadAllowlist])

  const filtered = useMemo(() => {
    if (!search.trim()) return entries
    const q = search.toLowerCase()
    return entries.filter((e) =>
      e.phone.toLowerCase().includes(q) ||
      e.user?.name.toLowerCase().includes(q) ||
      e.user?.email.toLowerCase().includes(q)
    )
  }, [entries, search])

  const registered = useMemo(() => filtered.filter((e) => e.user !== null), [filtered])
  const unclaimed = useMemo(() => filtered.filter((e) => e.user === null), [filtered])

  async function addSinglePhone(e: React.FormEvent) {
    e.preventDefault()
    if (!newPhone.trim()) return

    const normalized = normalizePhone(newPhone)
    const res = await fetch('/api/admin/allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalized }),
    })
    const data = await res.json()

    if (!res.ok) {
      setResult(data.error)
    } else {
      setNewPhone('')
      setResult('Phone added!')
      await loadAllowlist()
    }
  }

  async function uploadCsv() {
    if (!csvText.trim()) return
    setUploading(true)
    setResult(null)

    const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean)
    const normalized = Array.from(new Set(lines.map(normalizePhone)))

    const res = await fetch('/api/admin/allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: normalized }),
    })
    const data = await res.json()

    setResult(`Added ${data.added} numbers. ${data.skipped} duplicates skipped.`)
    setCsvText('')
    await loadAllowlist()
    setUploading(false)
  }

  async function removePhone(id: string) {
    await fetch('/api/admin/allowlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadAllowlist()
  }

  return (
    <div>
      <h1 className="page-title">Phone Allowlist</h1>
      <p className="text-gray-600 mb-6">
        Members must have a phone number on this list to sign up.
      </p>

      {/* Add single phone */}
      <div className="card mb-6">
        <h2 className="font-semibold mb-3">Add a phone number</h2>
        <form onSubmit={addSinglePhone} className="flex gap-2">
          <input
            type="tel"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="input flex-1"
            placeholder="(415) 555-0123"
          />
          <button type="submit" className="btn-primary whitespace-nowrap">
            Add
          </button>
        </form>
      </div>

      {/* Bulk upload */}
      <div className="card mb-6">
        <h2 className="font-semibold mb-3">Bulk upload (one phone per line)</h2>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          className="input mb-3"
          rows={5}
          placeholder={"(415) 555-0001\n(415) 555-0002\n(415) 555-0003"}
        />
        <button
          onClick={uploadCsv}
          disabled={uploading || !csvText.trim()}
          className="btn-primary"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {result && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-sm text-blue-800">
          {result}
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          placeholder="Search by phone, name, or email..."
        />
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-gray-500">No phone numbers yet.</p>
      ) : (
        <>
          {/* Registered section */}
          <h2 className="font-semibold mb-3">Registered ({registered.length})</h2>
          {registered.length === 0 ? (
            <p className="text-gray-500 text-sm mb-6">
              {search ? 'No matches.' : 'No registered users yet.'}
            </p>
          ) : (
            <div className="space-y-1 mb-6">
              {registered.map((entry) => (
                <div key={entry.id} className="card flex items-center justify-between !py-2 !px-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${entry.user!.is_banned ? 'line-through text-gray-400' : ''}`}>
                        {entry.user!.name}
                      </span>
                      {entry.user!.is_banned && (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">banned</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{entry.user!.email}</p>
                    <p className="text-xs text-gray-400 font-mono">{entry.phone}</p>
                  </div>
                  <button
                    onClick={() => removePhone(entry.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Unclaimed section */}
          <h2 className="font-semibold mb-3">Unclaimed ({unclaimed.length})</h2>
          {unclaimed.length === 0 ? (
            <p className="text-gray-500 text-sm">
              {search ? 'No matches.' : 'All phone numbers have been claimed.'}
            </p>
          ) : (
            <div className="space-y-1">
              {unclaimed.map((entry) => (
                <div key={entry.id} className="card flex items-center justify-between !py-2 !px-4">
                  <div>
                    <span className="text-sm font-mono">{entry.phone}</span>
                    <span className="text-xs text-gray-400 italic ml-2">Not yet registered</span>
                  </div>
                  <button
                    onClick={() => removePhone(entry.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
