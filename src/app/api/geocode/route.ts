import { createClient } from '@/lib/supabase/server'
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

  const token = process.env.MAPBOX_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Geocoding not configured' }, { status: 500 })
  }

  const encoded = encodeURIComponent(address.trim())
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&limit=1`
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 502 })
  }

  const data = await res.json()
  const feature = data.features?.[0]

  if (!feature) {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 })
  }

  return NextResponse.json({
    lat: feature.center[1],
    lng: feature.center[0],
    formatted_address: feature.place_name,
  })
}
