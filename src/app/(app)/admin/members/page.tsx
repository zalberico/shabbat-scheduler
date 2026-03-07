'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Member {
  id: string
  name: string
  email: string
  phone: string
  default_kashrut_preference: string
  default_shabbat_observance: string
  is_admin: boolean
  created_at: string
}

export default function AdminMembersPage() {
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    async function loadMembers() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUserId(user.id)

      // Check admin status
      const { data: profile } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin) { router.push('/dashboard'); return }

      const { data } = await supabase
        .from('users')
        .select('id, name, email, phone, default_kashrut_preference, default_shabbat_observance, is_admin, created_at')
        .order('created_at', { ascending: false })

      setMembers((data as Member[]) || [])
      setLoading(false)
    }
    loadMembers()
  }, [router])

  async function toggleAdmin(userId: string, newAdminStatus: boolean) {
    setToggling(userId)
    const res = await fetch('/api/admin/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, is_admin: newAdminStatus }),
    })

    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) => m.id === userId ? { ...m, is_admin: newAdminStatus } : m)
      )
    }
    setToggling(null)
  }

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Members</h1>
        <div className="card text-center py-8">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">Members</h1>
      <p className="text-gray-600 mb-6">{members.length} registered members</p>

      <div className="space-y-2">
        {members.map((member) => (
          <div key={member.id} className="card flex items-center gap-4 !py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{member.name}</p>
                {member.is_admin && (
                  <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">admin</span>
                )}
              </div>
              <p className="text-sm text-gray-500 truncate">{member.email}</p>
              <p className="text-xs text-gray-400">{member.phone}</p>
            </div>
            <div className="text-right text-xs text-gray-400 mr-2">
              <p>{member.default_kashrut_preference}</p>
              <p>{member.default_shabbat_observance}</p>
            </div>
            <button
              onClick={() => toggleAdmin(member.id, !member.is_admin)}
              disabled={member.id === currentUserId || toggling === member.id}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                member.id === currentUserId
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : member.is_admin
                    ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                    : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
              }`}
            >
              {toggling === member.id
                ? '...'
                : member.id === currentUserId
                  ? 'You'
                  : member.is_admin
                    ? 'Remove admin'
                    : 'Make admin'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
