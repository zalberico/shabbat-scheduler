import { createClient } from '@/lib/supabase/server'
import { getWeekOf, formatWeekOf, isBeforeDeadline, formatStartTime } from '@/lib/utils'
import { KASHRUT_LEVELS, OBSERVANCE_LEVELS } from '@/lib/types/database'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const weekOf = getWeekOf()
  const beforeDeadline = isBeforeDeadline()

  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single()

  // Check if user is hosting this week
  const { data: hostEntry } = await supabase
    .from('weekly_hosts')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_of', weekOf)
    .single()

  // Check if user is a guest this week
  const { data: guestEntry } = await supabase
    .from('weekly_guests')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_of', weekOf)
    .single()

  // Get match info if matched
  let matchInfo: { hostName?: string; guests?: { name: string; partySize: number; dietary: string[] }[] } | null = null

  if (hostEntry?.status === 'matched') {
    const { data: match } = await supabase
      .from('matches')
      .select('id')
      .eq('host_id', hostEntry.id)
      .single()

    if (match) {
      const { data: matchGuests } = await supabase
        .from('match_guests')
        .select('guest_id')
        .eq('match_id', match.id)

      if (matchGuests?.length) {
        const guestIds = matchGuests.map((mg) => mg.guest_id)
        const { data: guestDetails } = await supabase
          .from('weekly_guests')
          .select('user_id, party_size, dietary_restrictions')
          .in('id', guestIds)

        if (guestDetails) {
          const userIds = guestDetails.map((g) => g.user_id)
          const { data: guestUsers } = await supabase
            .from('users')
            .select('id, name')
            .in('id', userIds)

          matchInfo = {
            guests: guestDetails.map((g) => ({
              name: guestUsers?.find((u) => u.id === g.user_id)?.name || 'Unknown',
              partySize: g.party_size,
              dietary: g.dietary_restrictions,
            })),
          }
        }
      }
    }
  }

  if (guestEntry?.status === 'matched') {
    const { data: matchGuest } = await supabase
      .from('match_guests')
      .select('match_id')
      .eq('guest_id', guestEntry.id)
      .single()

    if (matchGuest) {
      const { data: match } = await supabase
        .from('matches')
        .select('host_id')
        .eq('id', matchGuest.match_id)
        .single()

      if (match) {
        const { data: host } = await supabase
          .from('weekly_hosts')
          .select('user_id, start_time, kashrut_level, notes')
          .eq('id', match.host_id)
          .single()

        if (host) {
          const { data: hostUser } = await supabase
            .from('users')
            .select('name')
            .eq('id', host.user_id)
            .single()

          matchInfo = { hostName: hostUser?.name }
        }
      }
    }
  }

  const kashrutLabel = (level: string) =>
    KASHRUT_LEVELS.find((k) => k.value === level)?.label || level

  return (
    <div>
      <h1 className="page-title">
        Shabbat Shalom{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}!
      </h1>

      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-primary)]">
            This Friday &mdash; {formatWeekOf(weekOf)}
          </h2>
          {beforeDeadline && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
              Signups open
            </span>
          )}
          {!beforeDeadline && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              Signups closed
            </span>
          )}
        </div>

        {/* Hosting */}
        {hostEntry && (
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🏠</span>
              <h3 className="font-medium">You&apos;re hosting!</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                hostEntry.status === 'matched' ? 'bg-green-100 text-green-800' :
                hostEntry.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {hostEntry.status}
              </span>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                {hostEntry.seats_available} seats &middot; {kashrutLabel(hostEntry.kashrut_level)} &middot; {formatStartTime(hostEntry.start_time)}
                {hostEntry.kids_friendly && ' · Kids welcome'}
                {hostEntry.dogs_friendly && ' · Dogs present'}
              </p>
              {hostEntry.observance_level && hostEntry.observance_level !== 'flexible' && (
                <p>Observance: {OBSERVANCE_LEVELS.find((o) => o.value === hostEntry.observance_level)?.label || hostEntry.observance_level}</p>
              )}
              {hostEntry.notes && <p>Notes: {hostEntry.notes}</p>}
            </div>

            {matchInfo?.guests && matchInfo.guests.length > 0 && (
              <div className="mt-3 pt-3 border-t border-blue-200">
                <h4 className="text-sm font-medium mb-2">Your guests:</h4>
                <ul className="space-y-1 text-sm">
                  {matchInfo.guests.map((g, i) => (
                    <li key={i}>
                      {g.name} (party of {g.partySize})
                      {g.dietary.length > 0 && ` — ${g.dietary.join(', ')}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Guest */}
        {guestEntry && (
          <div className="bg-amber-50 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🍽️</span>
              <h3 className="font-medium">You&apos;re joining a dinner!</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                guestEntry.status === 'matched' ? 'bg-green-100 text-green-800' :
                guestEntry.status === 'unmatched' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {guestEntry.status}
              </span>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <p>Party of {guestEntry.party_size}</p>
              {guestEntry.dietary_restrictions.length > 0 && (
                <p>Dietary: {guestEntry.dietary_restrictions.join(', ')}</p>
              )}
              {guestEntry.can_walk && <p>Can walk</p>}
            </div>

            {matchInfo?.hostName && (
              <div className="mt-3 pt-3 border-t border-amber-200">
                <p className="text-sm">
                  You&apos;re having dinner at <strong>{matchInfo.hostName}&apos;s</strong>! Check your email for details.
                </p>
              </div>
            )}
          </div>
        )}

        {/* No signup yet */}
        {!hostEntry && !guestEntry && (
          <div className="text-center py-6">
            <p className="text-gray-600 mb-4">
              {beforeDeadline
                ? "You haven't signed up for this week yet."
                : 'Signups for this week are closed. Check back Sunday!'}
            </p>
            {beforeDeadline && (
              <div className="flex gap-3 justify-center">
                <Link href="/host" className="btn-primary">
                  Host a dinner
                </Link>
                <Link href="/join" className="btn-secondary">
                  Join as a guest
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Weekly stats */}
      <div className="grid grid-cols-2 gap-4">
        <WeekStats weekOf={weekOf} />
      </div>
    </div>
  )
}

async function WeekStats({ weekOf }: { weekOf: string }) {
  const supabase = createClient()

  const { count: hostCount } = await supabase
    .from('weekly_hosts')
    .select('*', { count: 'exact', head: true })
    .eq('week_of', weekOf)
    .neq('status', 'cancelled')

  const { count: guestCount } = await supabase
    .from('weekly_guests')
    .select('*', { count: 'exact', head: true })
    .eq('week_of', weekOf)

  return (
    <>
      <div className="card text-center">
        <p className="text-3xl font-bold text-[var(--color-primary)]">{hostCount || 0}</p>
        <p className="text-sm text-gray-500">Hosts this week</p>
      </div>
      <div className="card text-center">
        <p className="text-3xl font-bold text-[var(--color-primary)]">{guestCount || 0}</p>
        <p className="text-sm text-gray-500">Guest signups</p>
      </div>
    </>
  )
}
