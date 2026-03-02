'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/host', label: 'Host' },
  { href: '/join', label: 'Join' },
  { href: '/history', label: 'History' },
  { href: '/profile', label: 'Profile' },
]

export function Nav({ isAdmin }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <header className="bg-[var(--color-primary)] text-white sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="font-bold text-lg">
          Shabbat Scheduler
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                pathname === link.href
                  ? 'bg-white/20 font-medium'
                  : 'hover:bg-white/10'
              )}
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-white/20 font-medium'
                  : 'hover:bg-white/10'
              )}
            >
              Admin
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="ml-2 px-3 py-1.5 rounded-md text-sm hover:bg-white/10 transition-colors"
          >
            Sign out
          </button>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="md:hidden border-t border-white/20 px-4 py-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                'block px-3 py-2 rounded-md text-sm transition-colors',
                pathname === link.href
                  ? 'bg-white/20 font-medium'
                  : 'hover:bg-white/10'
              )}
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMenuOpen(false)}
              className={cn(
                'block px-3 py-2 rounded-md text-sm transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-white/20 font-medium'
                  : 'hover:bg-white/10'
              )}
            >
              Admin
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="block w-full text-left px-3 py-2 rounded-md text-sm hover:bg-white/10 transition-colors"
          >
            Sign out
          </button>
        </nav>
      )}
    </header>
  )
}
