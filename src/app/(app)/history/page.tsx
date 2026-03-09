import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatWeekOf, formatStartTime } from '@/lib/utils'
import { KASHRUT_LEVELS, OBSERVANCE_LEVELS } from '@/lib/types/database'
import { redirect } from 'next/navigation'

export default async function HistoryPage() {
  const supabase = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const kashrutLabel = (level: string) =>
    KASHRUT_LEVELS.find((k) => k.value === level)?.label || level

  // Round 1: Fetch full host and guest entries
  const [{ data: pastHosts }, { data: pastGuests }] = await Promise.all([
    supabase
      .from('weekly_hosts')
      .select('*')
      .eq('user_id', user.id)
      .order('week_of', { ascending: false })
      .limit(20),
    supabase
      .from('weekly_guests')
      .select('*')
      .eq('user_id', user.id)
      .order('week_of', { ascending: false })
      .limit(20),
  ])

  // Round 2: Fetch matches for hosts + match_guests for guest entries
  const hostIds = (pastHosts || []).map((h) => h.id)
  const guestEntryIds = (pastGuests || []).map((g) => g.id)

  const [{ data: matchesForHosts }, { data: matchGuestsForGuests }] = await Promise.all([
    hostIds.length
      ? adminClient.from('matches').select('id, host_id').in('host_id', hostIds)
      : { data: [] as { id: string; host_id: string }[] },
    guestEntryIds.length
      ? adminClient.from('match_guests').select('guest_id, match_id').in('guest_id', guestEntryIds)
      : { data: [] as { guest_id: string; match_id: string }[] },
  ])

  // Round 3: Fetch guest lists for matched hosts + resolve host IDs for guest entries
  const hostMatchIds = (matchesForHosts || []).map((m) => m.id)
  const guestMatchIds = (matchGuestsForGuests || []).map((mg) => mg.match_id)

  const [{ data: hostSideMatchGuests }, { data: guestSideMatches }] = await Promise.all([
    hostMatchIds.length
      ? adminClient.from('match_guests').select('match_id, guest_id').in('match_id', hostMatchIds)
      : { data: [] as { match_id: string; guest_id: string }[] },
    guestMatchIds.length
      ? adminClient.from('matches').select('id, host_id').in('id', guestMatchIds)
      : { data: [] as { id: string; host_id: string }[] },
  ])

  // Round 4: Fetch guest details (for host cards) + host details (for guest cards)
  const matchedGuestIds = (hostSideMatchGuests || []).map((mg) => mg.guest_id)

  const directHostIds = (pastGuests || [])
    .filter((g) => g.selected_host_id)
    .map((g) => g.selected_host_id!)
  const matchResolvedHostIds = (matchGuestsForGuests || [])
    .map((mg) => {
      const match = (guestSideMatches || []).find((m) => m.id === mg.match_id)
      return match?.host_id
    })
    .filter(Boolean) as string[]
  const allHostIdsForGuests = Array.from(new Set([...directHostIds, ...matchResolvedHostIds]))

  const [{ data: guestDetails }, { data: hostDetailsForGuests }] = await Promise.all([
    matchedGuestIds.length
      ? adminClient.from('weekly_guests').select('id, user_id, party_size, dietary_restrictions').in('id', matchedGuestIds)
      : { data: [] as { id: string; user_id: string; party_size: number; dietary_restrictions: string[] }[] },
    allHostIdsForGuests.length
      ? adminClient.from('weekly_hosts').select('id, user_id, start_time, kashrut_level, observance_level, kids_friendly, dogs_friendly, notes').in('id', allHostIdsForGuests)
      : { data: [] as { id: string; user_id: string; start_time: string; kashrut_level: string; observance_level: string; kids_friendly: boolean; dogs_friendly: boolean; notes: string | null }[] },
  ])

  // Fetch all user names
  const guestUserIds = (guestDetails || []).map((g) => g.user_id)
  const hostUserIds = (hostDetailsForGuests || []).map((h) => h.user_id)
  const allUserIds = Array.from(new Set([...guestUserIds, ...hostUserIds]))

  const { data: allUsers } = allUserIds.length
    ? await adminClient.from('users').select('id, name').in('id', allUserIds)
    : { data: [] as { id: string; name: string }[] }

  // Build lookup maps
  const getUserName = (uid: string) =>
    (allUsers || []).find((u) => u.id === uid)?.name || 'Unknown'

  const matchByHostId = new Map<string, { name: string; partySize: number; dietary: string[] }[]>()
  ;(matchesForHosts || []).forEach((m) => {
    const gIds = (hostSideMatchGuests || [])
      .filter((mg) => mg.match_id === m.id)
      .map((mg) => mg.guest_id)
    const guests = gIds
      .map((gId) => {
        const detail = (guestDetails || []).find((g) => g.id === gId)
        if (!detail) return null
        return {
          name: getUserName(detail.user_id),
          partySize: detail.party_size,
          dietary: detail.dietary_restrictions,
        }
      })
      .filter(Boolean) as { name: string; partySize: number; dietary: string[] }[]
    matchByHostId.set(m.host_id, guests)
  })

  const hostInfoForGuestEntry = new Map<string, {
    hostName: string; startTime: string; kashrut: string; observance: string;
    kidsFriendly: boolean; dogsFriendly: boolean; notes: string | null
  }>()
  ;(pastGuests || []).forEach((g) => {
    let resolvedHostId: string | null = null
    if (g.selected_host_id) {
      resolvedHostId = g.selected_host_id
    } else {
      const mg = (matchGuestsForGuests || []).find((mg) => mg.guest_id === g.id)
      if (mg) {
        const match = (guestSideMatches || []).find((m) => m.id === mg.match_id)
        resolvedHostId = match?.host_id || null
      }
    }
    if (resolvedHostId) {
      const host = (hostDetailsForGuests || []).find((h) => h.id === resolvedHostId)
      if (host) {
        hostInfoForGuestEntry.set(g.id, {
          hostName: getUserName(host.user_id),
          startTime: host.start_time,
          kashrut: host.kashrut_level,
          observance: host.observance_level,
          kidsFriendly: host.kids_friendly,
          dogsFriendly: host.dogs_friendly,
          notes: host.notes,
        })
      }
    }
  })

  // Build sorted entries
  type HostEntry = { type: 'host'; date: string; host: NonNullable<typeof pastHosts>[number] }
  type GuestEntry = { type: 'guest'; date: string; guest: NonNullable<typeof pastGuests>[number] }
  const history: (HostEntry | GuestEntry)[] = [
    ...(pastHosts || []).map((h) => ({ type: 'host' as const, date: h.week_of, host: h })),
    ...(pastGuests || []).map((g) => ({ type: 'guest' as const, date: g.week_of, guest: g })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <h1 className="page-title">Dinner History</h1>

      {history.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-600">No dinner history yet.</p>
          <p className="text-sm text-gray-500 mt-2">Sign up to host or join a dinner to get started!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((entry, i) => {
            if (entry.type === 'host') {
              const h = entry.host
              const guests = matchByHostId.get(h.id)
              return (
                <div key={i} className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🏠</span>
                    <h3 className="font-medium">Hosted &mdash; Friday, {formatWeekOf(h.week_of)}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      h.status === 'matched' ? 'bg-green-100 text-green-800' :
                      h.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {h.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      {h.seats_available} seats &middot; {kashrutLabel(h.kashrut_level)} &middot; {formatStartTime(h.start_time)}
                      {h.kids_friendly && ' · Kids welcome'}
                      {h.dogs_friendly && ' · Dogs welcome'}
                    </p>
                    {h.observance_level && h.observance_level !== 'flexible' && (
                      <p>Observance: {OBSERVANCE_LEVELS.find((o) => o.value === h.observance_level)?.label || h.observance_level}</p>
                    )}
                    {h.notes && <p>Notes: {h.notes}</p>}
                  </div>

                  {guests && guests.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <h4 className="text-sm font-medium mb-2">Guests:</h4>
                      <ul className="space-y-1 text-sm">
                        {guests.map((g, j) => (
                          <li key={j}>
                            {g.name} (party of {g.partySize})
                            {g.dietary.length > 0 && ` — ${g.dietary.join(', ')}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            } else {
              const g = entry.guest
              const hostInfo = hostInfoForGuestEntry.get(g.id)
              return (
                <div key={i} className="bg-amber-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🍽️</span>
                    <h3 className="font-medium">
                      {hostInfo
                        ? <>Joined <strong>{hostInfo.hostName.split(' ')[0]}&apos;s</strong> dinner &mdash; Friday, {formatWeekOf(g.week_of)}</>
                        : <>Guest &mdash; Friday, {formatWeekOf(g.week_of)}</>
                      }
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      g.status === 'matched' ? 'bg-green-100 text-green-800' :
                      g.status === 'unmatched' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {g.status}
                    </span>
                  </div>

                  {hostInfo && (
                    <div className="text-sm text-gray-600 space-y-1 mb-3">
                      <p>
                        {formatStartTime(hostInfo.startTime)}
                        {` · ${kashrutLabel(hostInfo.kashrut)}`}
                        {hostInfo.observance && hostInfo.observance !== 'flexible' && (
                          <> &middot; {OBSERVANCE_LEVELS.find((o) => o.value === hostInfo.observance)?.label}</>
                        )}
                      </p>
                      <p>
                        {hostInfo.kidsFriendly ? 'Kids welcome' : 'No kids'}
                        {' · '}{hostInfo.dogsFriendly ? 'Dogs welcome' : 'No dogs'}
                      </p>
                      {hostInfo.notes && (
                        <p className="italic">&ldquo;{hostInfo.notes}&rdquo;</p>
                      )}
                    </div>
                  )}

                  <div className={`text-sm text-gray-600 space-y-1 ${hostInfo ? 'pt-3 border-t border-amber-200' : ''}`}>
                    <p>Your signup: party of {g.party_size}</p>
                    {g.dietary_restrictions.length > 0 && (
                      <p>Dietary: {g.dietary_restrictions.join(', ')}</p>
                    )}
                    {g.can_walk && <p>Can walk</p>}
                  </div>
                </div>
              )
            }
          })}
        </div>
      )}
    </div>
  )
}
