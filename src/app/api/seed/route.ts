export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import agences from '../../../../prisma/seed-agences.json'

// Villes déjà traitées — ne plus apparaître dans les sessions
const VILLES_DONE = [
  '95000 Cergy', '95800 Cergy',
  '95490 Vauréal',
  '95300 Pontoise',
  '78600 Maisons-Laffitte',
  "95310 Saint-Ouen-l'Aumône",
  "95290 L'Isle-Adam",
  '92500 Rueil-Malmaison',
  '78000 Versailles',
  '95110 Sannois',
  '78100 Saint-Germain-en-Laye',
  '95610 Éragny',
]

export async function POST() {
  const count = await prisma.agence.count()
  let inserted = 0
  let cleaned = 0

  // Seeder si base vide
  if (count === 0) {
    const batchSize = 100
    for (let i = 0; i < agences.length; i += batchSize) {
      const chunk = (agences as { nom: string; statut: string; ville?: string | null }[]).slice(i, i + batchSize)
      await prisma.agence.createMany({ data: chunk })
      inserted += chunk.length
    }
  }

  // Marquer les villes traitées comme "appele" (même si elles viennent d'être seedées)
  const result = await prisma.agence.updateMany({
    where: {
      ville: { in: VILLES_DONE },
      statut: 'nouveau',
    },
    data: { statut: 'appele' },
  })
  cleaned = result.count

  const total = await prisma.agence.count()
  const disponibles = await prisma.agence.count({ where: { statut: 'nouveau', telephone: { not: null } } })

  return NextResponse.json({
    ok: true,
    inserted,
    cleaned,
    total,
    disponibles,
    message: inserted > 0
      ? `${inserted} agences importées, ${cleaned} marquées "appelé".`
      : cleaned > 0
        ? `${cleaned} agences remises à jour (villes déjà traitées → appelé).`
        : `Base déjà à jour. ${disponibles} agences disponibles.`,
  })
}

export async function GET() {
  const count = await prisma.agence.count()
  const disponibles = await prisma.agence.count({ where: { statut: 'nouveau', telephone: { not: null } } })
  return NextResponse.json({ count, disponibles })
}
