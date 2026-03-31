export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const appels = await prisma.appel.findMany({
    orderBy: { date: 'desc' },
    include: { agence: { select: { nom: true } } },
    take: 50,
  })
  return NextResponse.json(appels)
}

export async function POST(req: Request) {
  const body = await req.json()
  const appel = await prisma.appel.create({
    data: {
      agenceId: body.agenceId || null,
      resultat: body.resultat || null,
      transcription: body.transcription || null,
      resume: body.resume || null,
      pointsCles: body.pointsCles || null,
      prochaineAction: body.prochaineAction || null,
      duree: body.duree || null,
    },
  })
  return NextResponse.json(appel, { status: 201 })
}
