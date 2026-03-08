import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { redirect } from 'next/navigation'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin, is_banned')
    .eq('id', user.id)
    .single()

  if (profile?.is_banned) {
    redirect('/login?error=banned')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav isAdmin={profile?.is_admin} />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {children}
      </main>
    </div>
  )
}
