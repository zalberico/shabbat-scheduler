import { createClient } from '@/lib/supabase/server'
import { formatWeekOf, formatStartTime } from '@/lib/utils'
import { redirect } from 'next/navigation'

export default async function HistoryPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get past hosting
  const { data: pastHosts } = await supabase
    .from('weekly_hosts')
    .select('id, week_of, seats_available, kashrut_level, start_time, status')
    .eq('user_id', user.id)
    .order('week_of', { ascending: false })
    .limit(20)

  // Get past guest signups
  const { data: pastGuests } = await supabase
    .from('weekly_guests')
    .select('id, week_of, party_size, status')
    .eq('user_id', user.id)
    .order('week_of', { ascending: false })
    .limit(20)

  // Combine and sort by date
  type HistoryEntry = {
    date: string
    type: 'host' | 'guest'
    status: string
    detail: string
  }

  const history: HistoryEntry[] = []

  pastHosts?.forEach((h) => {
    history.push({
      date: h.week_of,
      type: 'host',
      status: h.status,
      detail: `${h.seats_available} seats, ${formatStartTime(h.start_time)}`,
    })
  })

  pastGuests?.forEach((g) => {
    history.push({
      date: g.week_of,
      type: 'guest',
      status: g.status,
      detail: `Party of ${g.party_size}`,
    })
  })

  history.sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <h1 className="page-title">Dinner History</h1>

      {history.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-600">No dinner history yet.</p>
          <p className="text-sm text-gray-500 mt-2">Sign up to host or join a dinner to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((entry, i) => (
            <div key={i} className="card flex items-center gap-4">
              <span className="text-2xl">{entry.type === 'host' ? '🏠' : '🍽️'}</span>
              <div className="flex-1">
                <p className="font-medium">{formatWeekOf(entry.date)}</p>
                <p className="text-sm text-gray-600">
                  {entry.type === 'host' ? 'Hosted' : 'Guest'} &middot; {entry.detail}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                entry.status === 'matched' ? 'bg-green-100 text-green-800' :
                entry.status === 'cancelled' || entry.status === 'unmatched' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {entry.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
