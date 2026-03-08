import { requireAdmin } from '@/lib/auth'
import { getWeekOf, formatWeekOf, formatStartTime } from '@/lib/utils'
import { KASHRUT_LEVELS, OBSERVANCE_LEVELS } from '@/lib/types/database'
import Link from 'next/link'

export default async function AdminPage() {
  const { adminClient } = await requireAdmin()

  const currentWeekOf = getWeekOf()

  // Get all future hosts
  const { data: hosts } = await adminClient
    .from('weekly_hosts')
    .select('id, user_id, week_of, seats_available, kashrut_level, observance_level, start_time, kids_friendly, dogs_friendly, notes, status, created_at')
    .gte('week_of', currentWeekOf)
    .order('week_of')
    .order('created_at')

  // Get all future guests
  const { data: guests } = await adminClient
    .from('weekly_guests')
    .select('id, user_id, week_of, party_size, dietary_restrictions, kashrut_requirement, observance_requirement, can_walk, needs_kid_friendly, needs_dog_friendly, notes, status, signup_type, created_at')
    .gte('week_of', currentWeekOf)
    .order('week_of')
    .order('created_at')

  // Get all future matches and match_guests
  const { data: matches } = await adminClient
    .from('matches')
    .select('id, host_id, week_of')
    .gte('week_of', currentWeekOf)

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

  // Identify matched guest IDs
  const matchedGuestIds = new Set(matchGuests?.map((mg) => mg.guest_id) || [])

  // Collect all weeks with data
  const allWeekSet = new Set<string>()
  hosts?.forEach((h) => allWeekSet.add(h.week_of))
  guests?.forEach((g) => allWeekSet.add(g.week_of))
  matches?.forEach((m) => allWeekSet.add(m.week_of))
  const allWeeks = Array.from(allWeekSet).sort()

  return (
    <div>
      <h1 className="page-title">Admin Dashboard</h1>

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

      {/* Week sections */}
      {allWeeks.length === 0 && (
        <p className="text-gray-500">No signups for any upcoming weeks.</p>
      )}

      <div className="space-y-10">
        {allWeeks.map((week) => {
          const weekHosts = hosts?.filter((h) => h.week_of === week) || []
          const weekGuests = guests?.filter((g) => g.week_of === week) || []

          const weekMatchedHosts = weekHosts.filter((h) => matchByHost.has(h.id) && h.status !== 'cancelled')
          const weekUnmatchedHosts = weekHosts.filter((h) => !matchByHost.has(h.id) && h.status !== 'cancelled')
          const weekCancelledHosts = weekHosts.filter((h) => h.status === 'cancelled')
          const weekUnmatchedGuests = weekGuests.filter((g) => !matchedGuestIds.has(g.id))

          // Seats open = unmatched host capacity + remaining capacity on matched dinners
          const unmatchedSeats = weekUnmatchedHosts.reduce((sum, h) => sum + h.seats_available, 0)
          const matchedRemainingSeats = weekMatchedHosts.reduce((sum, h) => {
            const guestIds = matchByHost.get(h.id) || []
            const seatsUsed = weekGuests.filter((g) => guestIds.includes(g.id)).reduce((s, g) => s + g.party_size, 0)
            return sum + Math.max(0, h.seats_available - seatsUsed)
          }, 0)
          const seatsOpen = unmatchedSeats + matchedRemainingSeats
          const unmatchedGuestCount = weekUnmatchedGuests.reduce((sum, g) => sum + g.party_size, 0)

          const isThisWeek = week === currentWeekOf

          return (
            <div key={week}>
              {/* Week separator with inline stats */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <h2 className="text-lg font-semibold whitespace-nowrap">
                    {isThisWeek ? 'This Friday' : 'Friday'}, {formatWeekOf(week)}
                  </h2>
                  <div className="h-px bg-gray-200 flex-1" />
                </div>
                <span className="text-sm text-gray-500 whitespace-nowrap">
                  {seatsOpen} seats open &middot; {unmatchedGuestCount} guests unmatched
                </span>
              </div>

              {/* Matched Dinners */}
              {weekMatchedHosts.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-[var(--color-primary)] mb-3">Matched Dinners</h3>
                  <div className="space-y-4 mb-6">
                    {weekMatchedHosts.map((host) => {
                      const guestIds = matchByHost.get(host.id) || []
                      const dinnerGuests = guests?.filter((g) => guestIds.includes(g.id)) || []
                      const seatsUsed = dinnerGuests.reduce((sum, g) => sum + g.party_size, 0)

                      return (
                        <div key={host.id} className="card">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold">{getUserName(host.user_id)}&apos;s Dinner</h4>
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
              {weekUnmatchedHosts.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-[var(--color-primary)] mb-3">Unmatched Hosts</h3>
                  <div className="space-y-2 mb-6">
                    {weekUnmatchedHosts.map((host) => (
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
              {weekUnmatchedGuests.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-[var(--color-primary)] mb-3">Unmatched Guests</h3>
                  <div className="space-y-2 mb-6">
                    {weekUnmatchedGuests.map((guest) => (
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
              {weekCancelledHosts.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-gray-400 mb-3">Cancelled</h3>
                  <div className="space-y-2 mb-6">
                    {weekCancelledHosts.map((host) => (
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
