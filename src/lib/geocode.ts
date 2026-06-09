// Shared Mapbox geocoding, used by /api/geocode (client requests) and
// directly by server routes (a server-to-server fetch to /api/geocode would
// have no session cookies and always 401)
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; formatted_address: string } | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN
  if (!token || !address.trim()) return null

  const encoded = encodeURIComponent(address.trim())
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&limit=1`
  )
  if (!res.ok) return null

  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null

  return {
    lat: feature.center[1],
    lng: feature.center[0],
    formatted_address: feature.place_name,
  }
}
