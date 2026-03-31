import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET: liste toutes les sessions terminées
export async function GET() {
  const sessions = await prisma.session.findMany({
    orderBy: { createdAt: 'desc' },
    include: { appels: { orderBy: { ordre: 'asc' } } },
  })
  // Parse agenceQueue JSON for each session
  const parsed = sessions.map(s => ({
    ...s,
    agenceQueue: s.agenceQueue ? JSON.parse(s.agenceQueue) : null,
  }))
  return NextResponse.json(parsed)
}

// POST: crée une nouvelle session avec file d'agences pré-chargée
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  // Clôturer toute session active existante
  await prisma.session.updateMany({
    where: { status: 'active' },
    data: { status: 'ended', duree: 0 },
  })

  const objectif = body.objectif || 50

  // Récupérer les prochaines agences à appeler (statut nouveau, avec téléphone, dans l'ordre Google Sheet = id asc)
  const agencesAAppeler = await prisma.agence.findMany({
    where: { statut: 'nouveau', telephone: { not: null } },
    orderBy: { id: 'asc' },
    take: objectif,
    select: { id: true, nom: true, telephone: true, email: true, ville: true, adresse: true },
  })

  const session = await prisma.session.create({
    data: {
      objectif,
      status: 'active',
      agenceQueue: JSON.stringify(agencesAAppeler),
    },
    include: { appels: true },
  })

  return NextResponse.json({
    ...session,
    agenceQueue: agencesAAppeler,
  })
}
