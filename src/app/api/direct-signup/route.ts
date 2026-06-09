import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getWeekOf, isBeforeDeadline, isValidFutureFriday, formatWeekOf } from '@/lib/utils'
import { sendEmail } from '@/lib/email/send'
import { GuestCancelledEmail } from '@/lib/email/templates'
import { notifyHostIfDinnerFull } from '@/lib/email/dinner-full'
import { geocodeAddress } from '@/lib/geocode'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.host_id || !body?.party_size) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const weekOf = body.week_of || getWeekOf()

  if (body.week_of && !isValidFutureFriday(body.week_of)) {
    return NextResponse.json({ error: 'Invalid week' }, { status: 400 })
  }

  if (!isBeforeDeadline(weekOf)) {
    return NextResponse.json({ error: 'Signups are closed for this week' }, { status: 400 })
  }
  const adminClient = createAdminClient()

  // Check user doesn't already have a guest entry this week
  const { data: existingGuest } = await adminClient
    .from('weekly_guests')
    .select('id')
    .eq('user_id', user.id)
    .eq('week_of', weekOf)
    .single()

  if (existingGuest) {
    return NextResponse.json({ error: 'You already have a signup for this week' }, { status: 409 })
  }

  // Check user isn't already hosting a dinner this week
  const { data: existingHost } = await adminClient
    .from('weekly_hosts')
    .select('id')
    .eq('user_id', user.id)
    .eq('week_of', weekOf)
    .neq('status', 'cancelled')
    .single()

  if (existingHost) {
    return NextResponse.json({ error: 'You are already hosting a dinner this week' }, { status: 409 })
  }

  // Verify host exists and is available
  const { data: host } = await adminClient
    .from('weekly_hosts')
    .select('id, user_id, seats_available, status, week_of')
    .eq('id', body.host_id)
    .single()

  if (!host || host.week_of !== weekOf) {
    return NextResponse.json({ error: 'Host not found for this week' }, { status: 404 })
  }

  if (host.status === 'cancelled') {
    return NextResponse.json({ error: 'This dinner has been cancelled' }, { status: 400 })
  }

  if (host.user_id === user.id) {
    return NextResponse.json({ error: 'You cannot sign up for your own dinner' }, { status: 400 })
  }

  // Calculate remaining seats via match_guests (covers direct, algorithm, and
  // admin-placed), plus any direct signups for this host not yet linked to a
  // match row (partial-failure leftovers) — same accounting as the matcher
  let usedSeats = 0
  const linkedGuestIds = new Set<string>()

  const { data: hostMatch } = await adminClient
    .from('matches')
    .select('id')
    .eq('host_id', host.id)
    .eq('week_of', weekOf)
    .single()

  if (hostMatch) {
    const { data: matchGuestRows } = await adminClient
      .from('match_guests')
      .select('guest_id')
      .eq('match_id', hostMatch.id)

    if (matchGuestRows?.length) {
      const mgIds = matchGuestRows.map((mg) => mg.guest_id)
      mgIds.forEach((id) => linkedGuestIds.add(id))
      const { data: matchedGuests } = await adminClient
        .from('weekly_guests')
        .select('party_size')
        .in('id', mgIds)

      usedSeats = matchedGuests?.reduce((sum, g) => sum + g.party_size, 0) || 0
    }
  }

  const { data: unlinkedDirect } = await adminClient
    .from('weekly_guests')
    .select('id, party_size')
    .eq('week_of', weekOf)
    .eq('signup_type', 'direct')
    .eq('selected_host_id', host.id)

  unlinkedDirect?.forEach((g) => {
    if (!linkedGuestIds.has(g.id)) usedSeats += g.party_size
  })

  const remaining = host.seats_available - usedSeats

  if (body.party_size > remaining) {
    return NextResponse.json({
      error: `Not enough seats. ${remaining} remaining.`,
    }, { status: 409 })
  }

  // Geocode address if provided (direct Mapbox call — a self-fetch to
  // /api/geocode would have no session cookies and always 401)
  let lat: number | null = null
  let lng: number | null = null
  if (body.can_walk && body.address?.trim()) {
    try {
      const geo = await geocodeAddress(body.address)
      if (geo) {
        lat = geo.lat
        lng = geo.lng
      }
    } catch {
      // Continue without geocoding
    }
  }

  // Create or reuse the match row BEFORE the guest entry so a mid-flow
  // failure can't strand a guest as matched-with-no-match. An empty match
  // row left behind by a later failure is harmless: this route and the
  // matcher both reuse it, and send-notifications skips empty matches.
  let matchId: string
  if (hostMatch) {
    matchId = hostMatch.id
  } else {
    const { data: newMatch, error: matchError } = await adminClient
      .from('matches')
      .insert({ week_of: weekOf, host_id: host.id })
      .select('id')
      .single()

    if (matchError || !newMatch) {
      // Possible race: a concurrent signup created the row between our
      // earlier select and this insert (matches is unique per host) — re-check
      const { data: racedMatch } = await adminClient
        .from('matches')
        .select('id')
        .eq('host_id', host.id)
        .eq('week_of', weekOf)
        .single()
      if (!racedMatch) {
        return NextResponse.json({ error: 'Failed to create match' }, { status: 500 })
      }
      matchId = racedMatch.id
    } else {
      matchId = newMatch.id
    }
  }

  // Insert guest entry as 'pending' — only flipped to 'matched' once the
  // match_guests link exists
  const { data: guestEntry, error: guestError } = await adminClient
    .from('weekly_guests')
    .insert({
      user_id: user.id,
      week_of: weekOf,
      party_size: body.party_size,
      dietary_restrictions: body.dietary_restrictions || [],
      kashrut_requirement: body.kashrut_requirement || 'none',
      observance_requirement: body.observance_requirement || 'flexible',
      can_walk: body.can_walk || false,
      address: body.can_walk && body.address?.trim() ? body.address.trim() : null,
      lat: body.can_walk ? lat : null,
      lng: body.can_walk ? lng : null,
      needs_kid_friendly: body.needs_kid_friendly || false,
      needs_dog_friendly: body.needs_dog_friendly || false,
      notes: body.notes || null,
      signup_type: 'direct',
      selected_host_id: host.id,
      status: 'pending',
    })
    .select('id')
    .single()

  if (guestError || !guestEntry) {
    return NextResponse.json({ error: guestError?.message || 'Failed to create signup' }, { status: 500 })
  }

  // Link guest to match — no transactions via PostgREST, so compensate on
  // failure by removing the guest entry so the user can retry cleanly
  const { error: linkError } = await adminClient.from('match_guests').insert({
    match_id: matchId,
    guest_id: guestEntry.id,
  })

  if (linkError) {
    console.error('Failed to link direct signup to match:', linkError)
    await adminClient.from('weekly_guests').delete().eq('id', guestEntry.id)
    return NextResponse.json({ error: 'Failed to complete signup, please try again' }, { status: 500 })
  }

  // Placement is recorded — mark the guest matched. A failure here is benign
  // (match_guests is authoritative); log and continue.
  const { error: statusError } = await adminClient
    .from('weekly_guests')
    .update({ status: 'matched' })
    .eq('id', guestEntry.id)
  if (statusError) {
    console.error('Failed to mark direct signup matched:', statusError)
  }

  if (!hostMatch) {
    // Update host status to matched (first guest at this table)
    await adminClient
      .from('weekly_hosts')
      .update({ status: 'matched' })
      .eq('id', host.id)
  }

  // Check if dinner is now full and send notification to host
  const newUsedSeats = usedSeats + body.party_size
  if (newUsedSeats >= host.seats_available) {
    await notifyHostIfDinnerFull(host.id, weekOf)
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const weekOf = searchParams.get('week') || getWeekOf()
  const adminClient = createAdminClient()

  // Find user's direct signup for this week
  const { data: guestEntry } = await adminClient
    .from('weekly_guests')
    .select('id, user_id, selected_host_id, party_size')
    .eq('user_id', user.id)
    .eq('week_of', weekOf)
    .eq('signup_type', 'direct')
    .single()

  if (!guestEntry) {
    return NextResponse.json({ error: 'No direct signup found' }, { status: 404 })
  }

  // Get guest name and host info for notification BEFORE deleting
  let guestName = 'A guest'
  let hostEmail: string | null = null
  let hostName = 'Host'
  let hostSeats = 0

  const { data: guestUser } = await adminClient
    .from('users')
    .select('name')
    .eq('id', guestEntry.user_id)
    .single()

  if (guestUser) guestName = guestUser.name

  if (guestEntry.selected_host_id) {
    const { data: hostEntry } = await adminClient
      .from('weekly_hosts')
      .select('user_id, seats_available')
      .eq('id', guestEntry.selected_host_id)
      .single()

    if (hostEntry) {
      hostSeats = hostEntry.seats_available
      const { data: hostUser } = await adminClient
        .from('users')
        .select('name, email')
        .eq('id', hostEntry.user_id)
        .single()

      if (hostUser) {
        hostName = hostUser.name
        hostEmail = hostUser.email
      }
    }
  }

  // Delete match_guests entry
  await adminClient
    .from('match_guests')
    .delete()
    .eq('guest_id', guestEntry.id)

  // Delete the guest entry
  await adminClient
    .from('weekly_guests')
    .delete()
    .eq('id', guestEntry.id)

  // Check if match now has 0 guests
  if (guestEntry.selected_host_id) {
    const { data: match } = await adminClient
      .from('matches')
      .select('id')
      .eq('host_id', guestEntry.selected_host_id)
      .eq('week_of', weekOf)
      .single()

    if (match) {
      const { count } = await adminClient
        .from('match_guests')
        .select('*', { count: 'exact', head: true })
        .eq('match_id', match.id)

      if (count === 0) {
        await adminClient.from('matches').delete().eq('id', match.id)
        await adminClient
          .from('weekly_hosts')
          .update({ status: 'open' })
          .eq('id', guestEntry.selected_host_id)
      }
    }
  }

  // Calculate remaining seats after cancellation and send email to host
  if (hostEmail && process.env.RESEND_API_KEY) {
    try {
      // Count remaining used seats
      const { data: remainingSignups } = await adminClient
        .from('weekly_guests')
        .select('party_size')
        .eq('selected_host_id', guestEntry.selected_host_id!)
        .eq('signup_type', 'direct')

      const stillUsed = remainingSignups?.reduce((sum, g) => sum + g.party_size, 0) || 0
      const seatsRemaining = hostSeats - stillUsed

      await sendEmail({
        from: 'Shabbat Scheduler <shabbat@shabbat.zalberico.com>',
        to: hostEmail,
        subject: `${guestName.split(' ')[0]} cancelled their signup for your dinner`,
        react: GuestCancelledEmail({
          hostName: hostName.split(' ')[0],
          guestName: guestName.split(' ')[0],
          weekOf: formatWeekOf(weekOf),
          seatsRemaining,
          totalSeats: hostSeats,
        }),
      })
    } catch (e) {
      console.error('Failed to send guest cancellation email:', e)
    }
  }

  return NextResponse.json({ success: true })
}
