import { requireAdmin } from '@/lib/auth'
import { getWeekOf, formatWeekOf, formatStartTime } from '@/lib/utils'
import { KASHRUT_LEVELS, OBSERVANCE_LEVELS } from '@/lib/types/database'
import Link from 'next/link'
import AdminWeekPicker from './week-picker-wrapper'

export default async function AdminPage({ searchParams }: { searchParams: { week?: string } }) {
  const { adminClient } = await requireAdmin()

  const weekOf = searchParams.week || getWeekOf()

  // Get this week's hosts
  const { data: hosts } = await adminClient
    .from('weekly_hosts')
    .select('id, user_id, seats_available, kashrut_level, observance_level, start_time, kids_friendly, dogs_friendly, notes, status, created_at')
    .eq('week_of', weekOf)
    .order('created_at')

  // Get user names for hosts
  const hostUserIds = hosts?.map((h) => h.user_id) || []
  const { data: hostUsers } = hostUserIds.length
    ? await adminClient.from('users').select('id, name').in('id', hostUserIds)
    : { data: [] }

  // Get this week's guests
  const { data: guests } = await adminClient
    .from('weekly_guests')
    .select('id, user_id, party_size, dietary_restrictions, kashrut_requirement, observance_requirement, can_walk, needs_kid_friendly, needs_dog_friendly, notes, status, created_at')
    .eq('week_of', weekOf)
    .order('created_at')

  // Get user names for guests
  const guestUserIds = guests?.map((g) => g.user_id) || []
  const { data: guestUsers } = guestUserIds.length
    ? await adminClient.from('users').select('id, name').in('id', guestUserIds)
    : { data: [] }

  const getUserName = (userId: string) => {
    const all = [...(hostUsers || []), ...(guestUsers || [])]
    return all.find((u) => u.id === userId)?.name || 'Unknown'
  }

  const totalSeats = hosts?.reduce((sum, h) => h.status !== 'cancelled' ? sum + h.seats_available : sum, 0) || 0
  const totalGuests = guests?.reduce((sum, g) => sum + g.party_size, 0) || 0

  const kashrutLabel = (level: string) =>
    KASHRUT_LEVELS.find((k) => k.value === level)?.label || level
  const observanceLabel = (level: string) =>
    OBSERVANCE_LEVELS.find((o) => o.value === level)?.label || level

  return (
    <div>
      <h1 className="page-title">Admin Dashboard</h1>
      <div className="mb-6">
        <AdminWeekPicker selected={weekOf} basePath="/admin" />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-2xl font-bold text-[var(--color-primary)]">{hosts?.filter((h) => h.status !== 'cancelled').length || 0}</p>
          <p className="text-sm text-gray-500">Hosts</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-[var(--color-primary)]">{totalSeats}</p>
          <p className="text-sm text-gray-500">Total seats</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-[var(--color-primary)]">{guests?.length || 0}</p>
          <p className="text-sm text-gray-500">Guest signups</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-[var(--color-primary)]">{totalGuests}</p>
          <p className="text-sm text-gray-500">Total guests</p>
        </div>
      </div>

      {/* Admin links */}
      <div className="flex flex-wrap gap-3 mb-8">
        <Link href="/admin/match" className="btn-primary">
          Manage Matches
        </Link>
        <Link href="/admin/members" className="btn-secondary">
          Members
        </Link>
        <Link href="/admin/allowlist" className="btn-secondary">
          Allowlist
        </Link>
      </div>

      {/* Hosts */}
      <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-3">Hosts</h2>
      {hosts && hosts.length > 0 ? (
        <div className="space-y-2 mb-8">
          {hosts.map((host) => (
            <div key={host.id} className="card flex items-center gap-4 !py-3">
              <div className="flex-1">
                <p className="font-medium">{getUserName(host.user_id)}</p>
                <p className="text-sm text-gray-600">
                  {host.seats_available} seats &middot; {kashrutLabel(host.kashrut_level)} &middot; {observanceLabel(host.observance_level)} &middot; {formatStartTime(host.start_time)}
                  {' · '}{host.kids_friendly ? 'Kids welcome' : 'No kids'}
                  {' · '}{host.dogs_friendly ? 'Dogs welcome' : 'No dogs'}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                host.status === 'matched' ? 'bg-green-100 text-green-800' :
                host.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {host.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 mb-8">No hosts yet this week.</p>
      )}

      {/* Guests */}
      <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-3">Guests</h2>
      {guests && guests.length > 0 ? (
        <div className="space-y-2">
          {guests.map((guest) => (
            <div key={guest.id} className="card flex items-center gap-4 !py-3">
              <div className="flex-1">
                <p className="font-medium">{getUserName(guest.user_id)}</p>
                <p className="text-sm text-gray-600">
                  Party of {guest.party_size} &middot; {kashrutLabel(guest.kashrut_requirement)} &middot; {observanceLabel(guest.observance_requirement)}
                  {guest.dietary_restrictions.length > 0 && ` · ${guest.dietary_restrictions.join(', ')}`}
                </p>
                <p className="text-sm text-gray-600">
                  {guest.can_walk ? 'Can walk' : 'Can drive'}
                  {' · '}{guest.needs_kid_friendly ? 'Needs kid-friendly' : 'No kid req'}
                  {' · '}{guest.needs_dog_friendly ? 'Needs dog-friendly' : 'No dog req'}
                  {guest.notes && ` · "${guest.notes}"`}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                guest.status === 'matched' ? 'bg-green-100 text-green-800' :
                guest.status === 'unmatched' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {guest.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500">No guest signups yet this week.</p>
      )}
    </div>
  )
}
