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

        // Require server-side proof of phone ownership: a fresh ledger row
        // written by /api/verify-phone/check when Twilio approved the code,
        // bound to this email. Without it, anyone could call
        // supabase.auth.signUp directly with an allowlisted phone in metadata.
        const skipSms = process.env.SKIP_SMS_VERIFICATION === 'true'
        if (!skipSms) {
          const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          const { data: verification } = await adminClient
            .from('phone_verifications')
            .select('phone')
            .eq('phone', phone)
            .eq('email', data.user.email!.toLowerCase())
            .gte('verified_at', cutoff)
            .single()
          if (!verification) {
            return NextResponse.redirect(`${origin}/login?error=auth`)
          }
        }

        // Profile creation is server-only: the client insert policy was
        // dropped in migration 010, so use the admin client.
        const { error: insertError } = await adminClient.from('users').insert({
          id: data.user.id,
          email: data.user.email!,
          name: metadata?.name || data.user.email!.split('@')[0],
          phone,
          phone_verified: !skipSms,
        })
        if (insertError) {
          console.error('Failed to create user profile:', insertError)
          return NextResponse.redirect(`${origin}/login?error=auth`)
        }

        if (!skipSms) {
          // Consume the proof so it cannot be replayed for another account.
          await adminClient.from('phone_verifications').delete().eq('phone', phone)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
