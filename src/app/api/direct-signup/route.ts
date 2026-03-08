import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getWeekOf, isBeforeDeadline, isValidFutureFriday, formatWeekOf } from '@/lib/utils'
import { Resend } from 'resend'
import { GuestCancelledEmail, DinnerFullEmail } from '@/lib/email/templates'

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

  // Calculate remaining seats
  const { data: directSignups } = await adminClient
    .from('weekly_guests')
    .select('party_size')
    .eq('selected_host_id', host.id)
    .eq('signup_type', 'direct')

  const usedSeats = directSignups?.reduce((sum, g) => sum + g.party_size, 0) || 0
  const remaining = host.seats_available - usedSeats

  if (body.party_size > remaining) {
    return NextResponse.json({
      error: `Not enough seats. ${remaining} remaining.`,
    }, { status: 409 })
  }

  // Geocode address if provided
  let lat: number | null = null
  let lng: number | null = null
  if (body.can_walk && body.address?.trim()) {
    try {
      const geoRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/geocode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: body.address.trim() }),
      })
      if (geoRes.ok) {
        const geoData = await geoRes.json()
        lat = geoData.lat
        lng = geoData.lng
      }
    } catch {
      // Continue without geocoding
    }
  }

  // Insert guest entry
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
      status: 'matched',
    })
    .select('id')
    .single()

  if (guestError || !guestEntry) {
    return NextResponse.json({ error: guestError?.message || 'Failed to create signup' }, { status: 500 })
  }

  // Upsert match row for this host
  let matchId: string
  const { data: existingMatch } = await adminClient
    .from('matches')
    .select('id')
    .eq('host_id', host.id)
    .eq('week_of', weekOf)
    .single()

  if (existingMatch) {
    matchId = existingMatch.id
  } else {
    const { data: newMatch, error: matchError } = await adminClient
      .from('matches')
      .insert({ week_of: weekOf, host_id: host.id })
      .select('id')
      .single()

    if (matchError || !newMatch) {
      return NextResponse.json({ error: 'Failed to create match' }, { status: 500 })
    }
    matchId = newMatch.id

    // Update host status to matched
    await adminClient
      .from('weekly_hosts')
      .update({ status: 'matched' })
      .eq('id', host.id)
  }

  // Link guest to match
  await adminClient.from('match_guests').insert({
    match_id: matchId,
    guest_id: guestEntry.id,
  })

  // Check if dinner is now full and send notification to host
  const newUsedSeats = usedSeats + body.party_size
  if (newUsedSeats >= host.seats_available && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const formattedWeek = formatWeekOf(weekOf)

      // Get host user info
      const { data: hostUser } = await adminClient
        .from('users')
        .select('name, email')
        .eq('id', host.user_id)
        .single()

      // Get all guests for this dinner
      const { data: allMatchGuests } = await adminClient
        .from('match_guests')
        .select('guest_id')
        .eq('match_id', matchId)

      const allGuestIds = allMatchGuests?.map((mg) => mg.guest_id) || []
      const { data: allGuestEntries } = allGuestIds.length
        ? await adminClient
            .from('weekly_guests')
            .select('user_id, party_size, dietary_restrictions')
            .in('id', allGuestIds)
        : { data: [] }

      const guestUserIds = allGuestEntries?.map((g) => g.user_id) || []
      const { data: guestUsers } = guestUserIds.length
        ? await adminClient.from('users').select('id, name').in('id', guestUserIds)
        : { data: [] }

      if (hostUser && allGuestEntries?.length) {
        const guestList = allGuestEntries.map((g) => ({
          name: guestUsers?.find((u) => u.id === g.user_id)?.name || 'Unknown',
          partySize: g.party_size,
          dietary: g.dietary_restrictions,
        }))

        await resend.emails.send({
          from: 'Shabbat Scheduler <shabbat@shabbat.zalberico.com>',
          to: hostUser.email,
          subject: `Your Shabbat dinner is full! (${formattedWeek})`,
          react: DinnerFullEmail({
            hostName: hostUser.name.split(' ')[0],
            weekOf: formattedWeek,
            guests: guestList,
          }),
        })
      }
    } catch (e) {
      console.error('Failed to send dinner full email:', e)
    }
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

      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
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
