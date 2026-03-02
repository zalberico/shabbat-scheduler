import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Shabbat Scheduler - Noe Valley Chavurah',
  description: 'Coordinate weekly Shabbat dinners for the Noe Valley Chavurah community',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#1e3a5f',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[var(--color-warm)] min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
