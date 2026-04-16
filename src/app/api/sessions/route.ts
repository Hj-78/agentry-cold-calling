export const dynamic = 'force-dynamic'
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

  // Mode temps : durée fixe en secondes (default 3600 = 1h). On charge TOUTES les agences dispo.
  const dureeObjectif: number = body.dureeObjectif || 3600
  const villesFiltre: string[] | null = Array.isArray(body.villes) && body.villes.length > 0 ? body.villes : null

  // Construire le filtre
  const where: Record<string, unknown> = { statut: 'nouveau', telephone: { not: null } }
  if (villesFiltre) where.ville = { in: villesFiltre }

  // Récupérer TOUTES les agences disponibles (pas de limite), triées par taille de ville
  let agencesAAppeler
  if (villesFiltre) {
    agencesAAppeler = await prisma.agence.findMany({
      where,
      orderBy: [{ ville: 'asc' }, { nom: 'asc' }],
      select: { id: true, nom: true, telephone: true, email: true, ville: true, adresse: true },
    })
  } else {
    const [allAgences, villeStats] = await Promise.all([
      prisma.agence.findMany({
        where,
        orderBy: { nom: 'asc' },
        select: { id: true, nom: true, telephone: true, email: true, ville: true, adresse: true },
      }),
      prisma.agence.groupBy({
        by: ['ville'],
        where: { statut: 'nouveau', telephone: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ])
    const villeRank: Record<string, number> = {}
    villeStats.forEach((v, i) => { if (v.ville) villeRank[v.ville] = i })
    allAgences.sort((a, b) => {
      const ra = villeRank[a.ville ?? ''] ?? 999
      const rb = villeRank[b.ville ?? ''] ?? 999
      if (ra !== rb) return ra - rb
      return a.nom.localeCompare(b.nom)
    })
    agencesAAppeler = allAgences
  }

  const session = await prisma.session.create({
    data: {
      objectif: agencesAAppeler.length, // nb réel d'agences chargées
      dureeObjectif,
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
