export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

interface ScrapeResult {
  nom: string
  telephone: string
  adresse: string
  ville: string
  horaires: string
  website: string
}

export async function POST(req: Request) {
  const { keyword = 'agence immobilière', city } = await req.json()

  if (!city?.trim()) {
    return NextResponse.json({ error: 'Ville requise' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Clé GOOGLE_PLACES_API_KEY manquante' }, { status: 400 })
  }

  try {
    const query = `${keyword} ${city}`
    const searchParams = new URLSearchParams({ query, key: apiKey, language: 'fr' })
    const searchRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${searchParams}`
    )
    const searchData = await searchRes.json()

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      return NextResponse.json(
        { error: `Google Places: ${searchData.error_message || searchData.status}` },
        { status: 400 }
      )
    }

    const places = (searchData.results || []).slice(0, 20)
    const results: ScrapeResult[] = []

    for (const place of places) {
      try {
        const detailRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,opening_hours,website&key=${apiKey}&language=fr`
        )
        const detail = await detailRes.json()
        const r = detail.result || {}

        const adresse = r.formatted_address || place.formatted_address || ''
        // Extract city from address (last part after last comma)
        let ville = city
        const adresseParts = adresse.split(',')
        if (adresseParts.length >= 2) {
          const lastPart = adresseParts[adresseParts.length - 1].trim()
          const cityMatch = lastPart.match(/\d{5}\s+(.+)/)
          if (cityMatch) ville = cityMatch[1].trim()
        }

        // Format opening hours
        const horaires = (r.opening_hours?.weekday_text || []).join(' | ').slice(0, 300)

        results.push({
          nom: (r.name || place.name || '').trim(),
          telephone: (r.formatted_phone_number || '').replace(/\s/g, ' ').trim(),
          adresse: adresse.trim(),
          ville: ville.trim(),
          horaires: horaires,
          website: (r.website || '').trim(),
        })
      } catch { /* skip this place */ }
    }

    return NextResponse.json({ results, total: results.length })
  } catch (err) {
    console.error('[SCRAPE] Error:', err)
    return NextResponse.json(
      { error: `Erreur: ${err instanceof Error ? err.message : 'Inconnue'}` },
      { status: 500 }
    )
  }
}
