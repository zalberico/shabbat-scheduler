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

  // Get this week's guests
  const { data: guests } = await adminClient
    .from('weekly_guests')
    .select('id, user_id, party_size, dietary_restrictions, kashrut_requirement, observance_requirement, can_walk, needs_kid_friendly, needs_dog_friendly, notes, status, signup_type, created_at')
    .eq('week_of', weekOf)
    .order('created_at')

  // Get matches and match_guests for this week
  const { data: matches } = await adminClient
    .from('matches')
    .select('id, host_id')
    .eq('week_of', weekOf)

  const matchIds = matches?.map((m) => m.id) || []
  const { data: matchGuests } = matchIds.length
    ? await adminClient.from('match_guests').select('match_id, guest_id').in('match_id', matchIds)
    : { data: [] }

  // Get user names for all users
  const allUserIds = Array.from(new Set([
    ...(hosts?.map((h) => h.user_id) || []),
    ...(guests?.map((g) => g.user_id) || []),
  ]))
  const { data: allUsers } = allUserIds.length
    ? await adminClient.from('users').select('id, name').in('id', allUserIds)
    : { data: [] }

  const getUserName = (userId: string) =>
    allUsers?.find((u) => u.id === userId)?.name || 'Unknown'

  const totalSeats = hosts?.reduce((sum, h) => h.status !== 'cancelled' ? sum + h.seats_available : sum, 0) || 0
  const totalGuests = guests?.reduce((sum, g) => sum + g.party_size, 0) || 0

  const kashrutLabel = (level: string) =>
    KASHRUT_LEVELS.find((k) => k.value === level)?.label || level
  const observanceLabel = (level: string) =>
    OBSERVANCE_LEVELS.find((o) => o.value === level)?.label || level

  // Build match map: host_id -> guest_ids
  const matchByHost = new Map<string, string[]>()
  matches?.forEach((m) => {
    const guestIds = matchGuests?.filter((mg) => mg.match_id === m.id).map((mg) => mg.guest_id) || []
    matchByHost.set(m.host_id, guestIds)
  })

  // Identify matched guest IDs (to exclude from unmatched section)
  const matchedGuestIds = new Set(matchGuests?.map((mg) => mg.guest_id) || [])

  // Split hosts into matched and unmatched
  const matchedHosts = hosts?.filter((h) => matchByHost.has(h.id) && h.status !== 'cancelled') || []
  const unmatchedHosts = hosts?.filter((h) => !matchByHost.has(h.id) && h.status !== 'cancelled') || []
  const cancelledHosts = hosts?.filter((h) => h.status === 'cancelled') || []

  // Unmatched guests: not in any match
  const unmatchedGuests = guests?.filter((g) => !matchedGuestIds.has(g.id)) || []

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

      {/* Matched Dinners */}
      {matchedHosts.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-3">Matched Dinners</h2>
          <div className="space-y-4 mb-8">
            {matchedHosts.map((host) => {
              const guestIds = matchByHost.get(host.id) || []
              const dinnerGuests = guests?.filter((g) => guestIds.includes(g.id)) || []
              const seatsUsed = dinnerGuests.reduce((sum, g) => sum + g.party_size, 0)

              return (
                <div key={host.id} className="card">
                  {/* Host header */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{getUserName(host.user_id)}&apos;s Dinner</h3>
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
                      {seatsUsed} of {host.seats_available} seats filled
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    <p>
                      {kashrutLabel(host.kashrut_level)} &middot; {observanceLabel(host.observance_level)} &middot; {formatStartTime(host.start_time)}
                      {' · '}{host.kids_friendly ? 'Kids welcome' : 'No kids'}
                      {' · '}{host.dogs_friendly ? 'Dogs welcome' : 'No dogs'}
                    </p>
                    {host.notes && <p className="italic mt-1">&ldquo;{host.notes}&rdquo;</p>}
                  </div>

                  {/* Guests */}
                  {dinnerGuests.length > 0 && (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Guests</p>
                      <div className="space-y-2">
                        {dinnerGuests.map((guest) => (
                          <div key={guest.id} className="bg-gray-50 rounded-lg p-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{getUserName(guest.user_id)}</span>
                              <div className="flex items-center gap-2">
                                {guest.signup_type === 'direct' && (
                                  <span className="text-xs text-blue-600">direct</span>
                                )}
                                <span className="text-xs text-gray-500">Party of {guest.party_size}</span>
                              </div>
                            </div>
                            <p className="text-xs text-gray-600 mt-0.5">
                              {kashrutLabel(guest.kashrut_requirement)}
                              {guest.dietary_restrictions.length > 0 && ` · ${guest.dietary_restrictions.join(', ')}`}
                              {guest.needs_kid_friendly && ' · Needs kid-friendly'}
                              {guest.needs_dog_friendly && ' · Needs dog-friendly'}
                            </p>
                            {guest.notes && (
                              <p className="text-xs text-gray-500 italic mt-0.5">&ldquo;{guest.notes}&rdquo;</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Unmatched Hosts */}
      {unmatchedHosts.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-3">Unmatched Hosts</h2>
          <div className="space-y-2 mb-8">
            {unmatchedHosts.map((host) => (
              <div key={host.id} className="card flex items-center gap-4 !py-3">
                <div className="flex-1">
                  <p className="font-medium">{getUserName(host.user_id)}</p>
                  <p className="text-sm text-gray-600">
                    {host.seats_available} seats &middot; {kashrutLabel(host.kashrut_level)} &middot; {observanceLabel(host.observance_level)} &middot; {formatStartTime(host.start_time)}
                    {' · '}{host.kids_friendly ? 'Kids welcome' : 'No kids'}
                    {' · '}{host.dogs_friendly ? 'Dogs welcome' : 'No dogs'}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                  open
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Unmatched Guests */}
      {unmatchedGuests.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-3">Unmatched Guests</h2>
          <div className="space-y-2 mb-8">
            {unmatchedGuests.map((guest) => (
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
                  guest.status === 'unmatched' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {guest.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Cancelled Hosts */}
      {cancelledHosts.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-gray-400 mb-3">Cancelled</h2>
          <div className="space-y-2 mb-8">
            {cancelledHosts.map((host) => (
              <div key={host.id} className="card flex items-center gap-4 !py-3 opacity-50">
                <div className="flex-1">
                  <p className="font-medium">{getUserName(host.user_id)}</p>
                  <p className="text-sm text-gray-600">
                    {host.seats_available} seats &middot; {kashrutLabel(host.kashrut_level)}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800">
                  cancelled
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {(!hosts || hosts.length === 0) && (!guests || guests.length === 0) && (
        <p className="text-gray-500">No signups yet for this week.</p>
      )}
    </div>
  )
}
