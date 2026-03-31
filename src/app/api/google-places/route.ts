export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { query } = await req.json()

  const apiKey = process.env.GOOGLE_PLACES_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'Clé GOOGLE_PLACES_API_KEY manquante dans .env.local' }, { status: 400 })
  }

  const searchParams = new URLSearchParams({ query, key: apiKey, language: 'fr' })
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${searchParams}`)
  const data = await res.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return NextResponse.json({ error: data.error_message || data.status }, { status: 400 })
  }

  const results = await Promise.all(
    (data.results || []).slice(0, 10).map(async (place: { place_id: string; name: string; formatted_address: string }) => {
      const detailRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number&key=${apiKey}&language=fr`
      )
      const detail = await detailRes.json()
      return {
        place_id: place.place_id,
        name: place.name,
        formatted_address: place.formatted_address,
        formatted_phone_number: detail.result?.formatted_phone_number || null,
      }
    })
  )

  return NextResponse.json({ results })
}
