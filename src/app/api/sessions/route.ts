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

  const objectif = body.objectif || 50
  const villeFiltre: string | null = body.ville || null

  // Construire le filtre
  const where: Record<string, unknown> = { statut: 'nouveau', telephone: { not: null } }
  if (villeFiltre) where.ville = villeFiltre

  // Récupérer les agences — si ville spécifique : ordre alphabétique nom
  // Si toutes les villes : on récupère toutes puis on trie par taille de ville (grandes d'abord)
  let agencesAAppeler
  if (villeFiltre) {
    agencesAAppeler = await prisma.agence.findMany({
      where,
      orderBy: { nom: 'asc' },
      take: objectif,
      select: { id: true, nom: true, telephone: true, email: true, ville: true, adresse: true },
    })
  } else {
    // Récupérer toutes + trier par taille de ville (grosses villes d'abord, petites à la fin)
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
    // Map ville → rank (position dans le classement par count desc)
    const villeRank: Record<string, number> = {}
    villeStats.forEach((v, i) => { if (v.ville) villeRank[v.ville] = i })
    allAgences.sort((a, b) => {
      const ra = villeRank[a.ville ?? ''] ?? 999
      const rb = villeRank[b.ville ?? ''] ?? 999
      if (ra !== rb) return ra - rb
      return a.nom.localeCompare(b.nom)
    })
    agencesAAppeler = allAgences.slice(0, objectif)
  }

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
