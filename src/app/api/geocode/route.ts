import { createClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/geocode'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { address } = await request.json()
  if (!address || typeof address !== 'string') {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  if (!process.env.MAPBOX_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Geocoding not configured' }, { status: 500 })
  }

  const result = await geocodeAddress(address)
  if (!result) {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 })
  }

  return NextResponse.json(result)
}
