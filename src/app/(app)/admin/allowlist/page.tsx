'use client'

import { useState, useEffect, useCallback } from 'react'
import { normalizePhone } from '@/lib/utils'

export default function AllowlistPage() {
  const [phones, setPhones] = useState<{ id: string; phone: string; uploaded_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [csvText, setCsvText] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const loadAllowlist = useCallback(async () => {
    const res = await fetch('/api/admin/allowlist')
    const data = await res.json()
    setPhones(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAllowlist()
  }, [loadAllowlist])

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

      {/* Current allowlist */}
      <h2 className="font-semibold mb-3">Current allowlist ({phones.length} numbers)</h2>
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : phones.length === 0 ? (
        <p className="text-gray-500">No phone numbers yet.</p>
      ) : (
        <div className="space-y-1">
          {phones.map((p) => (
            <div key={p.id} className="card flex items-center justify-between !py-2 !px-4">
              <span className="text-sm font-mono">{p.phone}</span>
              <button
                onClick={() => removePhone(p.id)}
                className="text-xs text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
