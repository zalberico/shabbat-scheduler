import { requireAdmin } from '@/lib/auth'

export default async function AdminMembersPage() {
  const { adminClient } = await requireAdmin()

  const { data: members } = await adminClient
    .from('users')
    .select('id, name, email, phone, default_kashrut_preference, default_shabbat_observance, is_admin, created_at')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="page-title">Members</h1>
      <p className="text-gray-600 mb-6">{members?.length || 0} registered members</p>

      <div className="space-y-2">
        {members?.map((member) => (
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
            <div className="text-right text-xs text-gray-400">
              <p>{member.default_kashrut_preference}</p>
              <p>{member.default_shabbat_observance}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
