import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

async function checkAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const adminClient = createAdminClient()
  const { data: profile } = await adminClient
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  return profile?.is_admin === true
}

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: phones } = await supabase
    .from('phone_allowlist')
    .select('*')
    .order('uploaded_at', { ascending: false })

  // Fetch all users to build phone→user map
  const { data: users } = await supabase
    .from('users')
    .select('name, email, phone, is_banned')

  const phoneToUser = new Map<string, { name: string; email: string; is_banned: boolean }>()
  if (users) {
    for (const u of users) {
      if (u.phone) {
        phoneToUser.set(u.phone, { name: u.name, email: u.email, is_banned: u.is_banned })
      }
    }
  }

  const enriched = (phones || []).map((p) => ({
    ...p,
    user: phoneToUser.get(p.phone) || null,
  }))

  return NextResponse.json(enriched)
}

const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/

export async function POST(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const supabase = createAdminClient()

  if (body.phones && Array.isArray(body.phones)) {
    if (body.phones.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 phones per upload' }, { status: 400 })
    }
    // Bulk insert
    let added = 0
    let skipped = 0
    for (const phone of body.phones) {
      if (typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
        skipped++
        continue
      }
      const { error } = await supabase
        .from('phone_allowlist')
        .insert({ phone })
      if (error) skipped++
      else added++
    }
    return NextResponse.json({ added, skipped })
  }

  if (body.phone) {
    if (typeof body.phone !== 'string' || !PHONE_REGEX.test(body.phone)) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
    }
    // Single insert
    const { error } = await supabase
      .from('phone_allowlist')
      .insert({ phone: body.phone })

    if (error) {
      const msg = error.message.includes('duplicate')
        ? 'Phone already in allowlist.'
        : 'Failed to add phone number.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Missing phone or phones' }, { status: 400 })
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await request.json()
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const supabase = createAdminClient()
  await supabase.from('phone_allowlist').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
