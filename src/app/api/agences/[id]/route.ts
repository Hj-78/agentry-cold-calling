import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  if (isNaN(id)) return NextResponse.json({ error: 'ID invalide' }, { status: 400 })

  const agence = await prisma.agence.findUnique({
    where: { id },
  })
  if (!agence) return NextResponse.json({ error: 'Agence introuvable' }, { status: 404 })

  // Historique depuis SessionAppel (source principale)
  const sessionAppels = await prisma.sessionAppel.findMany({
    where: { agenceId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Calcul stats
  const total = sessionAppels.length
  const interesses = sessionAppels.filter(a => a.resultat === 'interesse').length
  const rdvs = sessionAppels.filter(a => a.rdvPris).length
  const pitches = sessionAppels.filter(a => a.aPitche).length
  const dureeMoy = total > 0 && sessionAppels.some(a => a.duree)
    ? Math.round(sessionAppels.reduce((s, a) => s + (a.duree || 0), 0) / total)
    : null

  return NextResponse.json({
    agence,
    appels: sessionAppels,
    stats: { total, interesses, rdvs, pitches, dureeMoy },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  if (isNaN(id)) return NextResponse.json({ error: 'ID invalide' }, { status: 400 })

  const body = await req.json()
  const updated = await prisma.agence.update({
    where: { id },
    data: body,
  })
  return NextResponse.json(updated)
}
