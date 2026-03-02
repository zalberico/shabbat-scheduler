import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

async function checkAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
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
  const { data } = await supabase
    .from('phone_allowlist')
    .select('*')
    .order('uploaded_at', { ascending: false })

  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const supabase = createAdminClient()

  if (body.phones && Array.isArray(body.phones)) {
    // Bulk insert
    let added = 0
    let skipped = 0
    for (const phone of body.phones) {
      const { error } = await supabase
        .from('phone_allowlist')
        .insert({ phone })
      if (error) skipped++
      else added++
    }
    return NextResponse.json({ added, skipped })
  }

  if (body.phone) {
    // Single insert
    const { error } = await supabase
      .from('phone_allowlist')
      .insert({ phone: body.phone })

    if (error) {
      const msg = error.message.includes('duplicate')
        ? 'Phone already in allowlist.'
        : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Missing phone or phones' }, { status: 400 })
}

export async function DELETE(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await request.json()
  const supabase = createAdminClient()
  await supabase.from('phone_allowlist').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
