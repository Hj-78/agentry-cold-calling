import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST : découverte automatique d'agences immobilières dans une liste de villes
// via Google Places API — importe les nouvelles agences en évitant les doublons
export async function POST(req: Request) {
  const { villes } = await req.json()

  if (!Array.isArray(villes) || villes.length === 0) {
    return NextResponse.json({ error: 'Liste de villes vide' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Clé GOOGLE_PLACES_API_KEY manquante dans .env.local' }, { status: 400 })
  }

  // Récupère les téléphones déjà en base pour éviter doublons
  const existing = await prisma.agence.findMany({ select: { telephone: true, nom: true } })
  const existingTels = new Set(existing.map(a => a.telephone?.replace(/\s/g, '')).filter(Boolean))
  const existingNoms = new Set(existing.map(a => a.nom.toLowerCase().trim()))

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const ville of villes.slice(0, 10)) { // Max 10 villes par batch
    try {
      const query = `agences immobilières ${ville}`
      const searchParams = new URLSearchParams({ query, key: apiKey, language: 'fr' })
      const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${searchParams}`)
      const data = await res.json()

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        errors.push(`${ville}: ${data.error_message || data.status}`)
        continue
      }

      const places = (data.results || []).slice(0, 20)

      for (const place of places) {
        try {
          // Récupère les détails (téléphone, note, etc.)
          const detailRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,rating,user_ratings_total,website&key=${apiKey}&language=fr`
          )
          const detail = await detailRes.json()
          const r = detail.result || {}

          const tel = r.formatted_phone_number?.replace(/\s/g, '') || null
          const nom = place.name?.trim() || ''

          // Évite les doublons (par téléphone ou nom exact)
          if (tel && existingTels.has(tel)) { skipped++; continue }
          if (existingNoms.has(nom.toLowerCase())) { skipped++; continue }

          await prisma.agence.create({
            data: {
              nom,
              telephone: r.formatted_phone_number || null,
              adresse: place.formatted_address || null,
              ville: ville.trim(),
              averageRating: r.rating || null,
              reviewCount: r.user_ratings_total || null,
              website: r.website || null,
              source: 'google-places-auto',
              googlePlaceId: place.place_id,
              statut: 'nouveau',
            },
          })

          if (tel) existingTels.add(tel)
          existingNoms.add(nom.toLowerCase())
          imported++
        } catch { /* agence déjà en base ou erreur */ }
      }
    } catch (e) {
      errors.push(`${ville}: ${String(e)}`)
    }
  }

  return NextResponse.json({ imported, skipped, errors })
}
