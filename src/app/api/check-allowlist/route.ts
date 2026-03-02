import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { phone } = await request.json()

  if (!phone) {
    return NextResponse.json({ error: 'Phone number required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('phone_allowlist')
    .select('id')
    .eq('phone', phone)
    .single()

  if (!data) {
    return NextResponse.json(
      { error: 'Phone number not found in community allowlist. Contact an admin to be added.' },
      { status: 403 }
    )
  }

  return NextResponse.json({ ok: true })
}
