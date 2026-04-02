export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import agences from '../../../../prisma/seed-agences.json'

export async function POST() {
  const count = await prisma.agence.count()
  if (count > 0) {
    return NextResponse.json({ ok: true, message: `Déjà ${count} agences en base, seed ignoré.`, count })
  }

  let inserted = 0
  const batchSize = 100
  for (let i = 0; i < agences.length; i += batchSize) {
    const chunk = agences.slice(i, i + batchSize)
    await prisma.agence.createMany({ data: chunk })
    inserted += chunk.length
  }

  return NextResponse.json({ ok: true, inserted, message: `${inserted} agences importées.` })
}

export async function GET() {
  const count = await prisma.agence.count()
  return NextResponse.json({ count })
}
