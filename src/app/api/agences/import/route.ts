export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface AgenceImport {
  nom: string
  telephone?: string | null
  email?: string | null
  adresse?: string | null
  ville?: string | null
  notes?: string | null
  source?: string | null
  googlePlaceId?: string | null
  statut?: string
  horaires?: string | null
}

export async function POST(req: Request) {
  const body = await req.json()
  const agences: AgenceImport[] = Array.isArray(body) ? body : body.agences

  if (!agences || !Array.isArray(agences)) {
    return NextResponse.json({ error: 'Expected array of agencies' }, { status: 400 })
  }

  // Load existing phones + names to detect duplicates
  const existing = await prisma.agence.findMany({ select: { nom: true, telephone: true } })
  const existingPhones = new Set(
    existing.filter(e => e.telephone).map(e => e.telephone!.replace(/\s/g, '').toLowerCase())
  )
  const existingNames = new Set(existing.map(e => e.nom.toLowerCase().trim()))

  let added = 0
  let duplicates = 0
  const toInsert: AgenceImport[] = []

  for (const a of agences) {
    if (!a.nom?.trim()) continue
    const phone = (a.telephone || '').replace(/\s/g, '').toLowerCase()
    const name = a.nom.toLowerCase().trim()

    if ((phone && existingPhones.has(phone)) || existingNames.has(name)) {
      duplicates++
      continue
    }
    toInsert.push(a)
    if (phone) existingPhones.add(phone)
    existingNames.add(name)
  }

  // Insert in batches of 100
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100)
    await prisma.agence.createMany({
      data: batch.map(a => ({
        nom: a.nom,
        telephone: a.telephone || null,
        email: a.email || null,
        adresse: a.adresse || null,
        ville: a.ville || null,
        notes: a.horaires ? `Horaires : ${a.horaires}` : (a.notes || null),
        source: a.source || 'import',
        googlePlaceId: a.googlePlaceId || null,
        statut: a.statut || 'nouveau',
      })),
    })
    added += batch.length
  }

  return NextResponse.json({ added, duplicates, errors: 0, ok: true })
}
