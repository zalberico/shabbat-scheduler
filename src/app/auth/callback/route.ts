import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/dashboard'
  // Only allow same-site paths as redirect targets
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

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
        // Create profile from auth metadata
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

        const { error: insertError } = await supabase.from('users').insert({
          id: data.user.id,
          email: data.user.email!,
          name: metadata?.name || data.user.email!.split('@')[0],
          phone,
        })
        if (insertError) {
          console.error('Failed to create user profile:', insertError)
          return NextResponse.redirect(`${origin}/login?error=auth`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
