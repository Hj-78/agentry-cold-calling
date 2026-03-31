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
}

export async function POST(req: Request) {
  const body = await req.json()
  const agences: AgenceImport[] = Array.isArray(body) ? body : body.agences

  if (!agences || !Array.isArray(agences)) {
    return NextResponse.json({ error: 'Expected array of agencies' }, { status: 400 })
  }

  // Insert in batches of 100
  let inserted = 0
  for (let i = 0; i < agences.length; i += 100) {
    const batch = agences.slice(i, i + 100)
    await prisma.agence.createMany({
      data: batch.map(a => ({
        nom: a.nom,
        telephone: a.telephone || null,
        email: a.email || null,
        adresse: a.adresse || null,
        ville: a.ville || null,
        notes: a.notes || null,
        source: a.source || 'import',
        googlePlaceId: a.googlePlaceId || null,
        statut: a.statut || 'nouveau',
      })),
    })
    inserted += batch.length
  }

  return NextResponse.json({ ok: true, inserted })
}
