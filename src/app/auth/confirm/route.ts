import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'

  if (token_hash && type) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error && data.user) {
      // Check if user is banned
      const adminClient = createAdminClient()
      const { data: banCheck } = await adminClient
        .from('users')
        .select('is_banned')
        .eq('id', data.user.id)
        .single()

      if (banCheck?.is_banned) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=banned`)
      }

      // Check if user profile exists, create if not
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', data.user.id)
        .single()

      if (!profile) {
        const metadata = data.user.user_metadata
        const phone = metadata?.phone || ''

        // Verify phone is on allowlist before creating profile
        if (!phone) {
          return NextResponse.redirect(`${origin}/login?error=auth`)
        }
        const { data: allowed } = await adminClient
          .from('phone_allowlist')
          .select('id')
          .eq('phone', phone)
          .single()
        if (!allowed) {
          return NextResponse.redirect(`${origin}/login?error=auth`)
        }

        await supabase.from('users').insert({
          id: data.user.id,
          email: data.user.email!,
          name: metadata?.name || data.user.email!.split('@')[0],
          phone,
        })
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
