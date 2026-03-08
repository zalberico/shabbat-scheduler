import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getAdminContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminClient = createAdminClient()
  const { data: profile } = await adminClient
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null
  return { user, adminClient }
}

// POST = ban user
export async function POST(request: Request) {
  const ctx = await getAdminContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { user, adminClient } = ctx

  const body = await request.json()
  const { userId } = body

  if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  // Prevent self-ban
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot ban yourself' }, { status: 400 })
  }

  // Check target user exists and is not an admin
  const { data: target } = await adminClient
    .from('users')
    .select('id, phone, is_admin, is_banned')
    .eq('id', userId)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (target.is_admin) {
    return NextResponse.json({ error: 'Cannot ban an admin' }, { status: 400 })
  }

  if (target.is_banned) {
    return NextResponse.json({ error: 'User is already banned' }, { status: 400 })
  }

  // 1. Set is_banned on user record
  await adminClient
    .from('users')
    .update({ is_banned: true, banned_at: new Date().toISOString() })
    .eq('id', userId)

  // 2. Remove phone from allowlist
  if (target.phone) {
    await adminClient
      .from('phone_allowlist')
      .delete()
      .eq('phone', target.phone)
  }

  // 3. Cancel current/future weekly_hosts (set status to 'cancelled')
  await adminClient
    .from('weekly_hosts')
    .update({ status: 'cancelled' })
    .eq('user_id', userId)
    .in('status', ['open', 'matched'])

  // 4. Cancel current/future weekly_guests (set status to 'unmatched')
  await adminClient
    .from('weekly_guests')
    .update({ status: 'unmatched' })
    .eq('user_id', userId)
    .in('status', ['pending', 'matched'])

  // 5. Remove from active matches
  // 5a. Find matches where they are a guest
  const { data: guestEntries } = await adminClient
    .from('match_guests')
    .select('id, match_id, guest_id')
    .eq('guest_id', userId)

  if (guestEntries && guestEntries.length > 0) {
    // Delete their match_guests rows
    await adminClient
      .from('match_guests')
      .delete()
      .eq('guest_id', userId)

    // Reset their weekly_guests to pending (already set to unmatched above)
  }

  // 5b. Find matches where they are the host
  const { data: hostMatches } = await adminClient
    .from('matches')
    .select('id')
    .eq('host_id', userId)

  if (hostMatches && hostMatches.length > 0) {
    const matchIds = hostMatches.map((m) => m.id)

    // Find displaced guests and reset them to pending
    const { data: displacedGuests } = await adminClient
      .from('match_guests')
      .select('guest_id')
      .in('match_id', matchIds)

    if (displacedGuests && displacedGuests.length > 0) {
      const guestIds = displacedGuests.map((g) => g.guest_id)
      await adminClient
        .from('weekly_guests')
        .update({ status: 'pending' })
        .in('user_id', guestIds)
        .eq('status', 'matched')
    }

    // Delete match_guests for these matches
    await adminClient
      .from('match_guests')
      .delete()
      .in('match_id', matchIds)

    // Delete the matches themselves
    await adminClient
      .from('matches')
      .delete()
      .eq('host_id', userId)
  }

  // 6. Ban at Supabase auth level
  await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: '876000h',
  })

  return NextResponse.json({ success: true })
}

// DELETE = unban user
export async function DELETE(request: Request) {
  const ctx = await getAdminContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { adminClient } = ctx

  const body = await request.json()
  const { userId } = body

  if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
  }

  // Check target user exists and is banned
  const { data: target } = await adminClient
    .from('users')
    .select('id, phone, is_banned')
    .eq('id', userId)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!target.is_banned) {
    return NextResponse.json({ error: 'User is not banned' }, { status: 400 })
  }

  // 1. Unset is_banned
  await adminClient
    .from('users')
    .update({ is_banned: false, banned_at: null })
    .eq('id', userId)

  // 2. Re-add phone to allowlist
  if (target.phone) {
    await adminClient
      .from('phone_allowlist')
      .upsert({ phone: target.phone }, { onConflict: 'phone' })
  }

  // 3. Lift Supabase auth ban
  await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  })

  return NextResponse.json({ success: true })
}
