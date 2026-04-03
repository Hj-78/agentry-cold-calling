export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const statut = searchParams.get('statut')
  const search = searchParams.get('search')?.trim()
  const countOnly = searchParams.get('count') === '1'
  const citiesOnly = searchParams.get('cities') === '1'

  const where: Record<string, unknown> = {}
  if (statut) where.statut = statut
  if (search) {
    where.OR = [
      { nom: { contains: search } },
      { ville: { contains: search } },
      { telephone: { contains: search } },
    ]
  }

  // Retourner les villes avec le nombre d'agences "nouveau" ayant un téléphone
  if (citiesOnly) {
    const rows = await prisma.agence.groupBy({
      by: ['ville'],
      where: { statut: 'nouveau', telephone: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })
    return NextResponse.json(rows.map(r => ({ ville: r.ville, count: r._count.id })))
  }

  if (countOnly) {
    const withPhone = { ...where, telephone: { not: null } }
    const total = await prisma.agence.count({ where: Object.keys(withPhone).length ? withPhone : undefined })
    return NextResponse.json({ total })
  }

  const agences = await prisma.agence.findMany({
    where: Object.keys(where).length ? where : undefined,
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(agences)
}

export async function POST(req: Request) {
  const body = await req.json()
  const agence = await prisma.agence.create({
    data: {
      nom: body.nom,
      telephone: body.telephone || null,
      email: body.email || null,
      adresse: body.adresse || null,
      notes: body.notes || null,
      source: body.source || 'manual',
      googlePlaceId: body.googlePlaceId || null,
      statut: 'nouveau',
    },
  })
  return NextResponse.json(agence, { status: 201 })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { id, ...data } = body
  const agence = await prisma.agence.update({
    where: { id },
    data,
  })
  return NextResponse.json(agence)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const ville = searchParams.get('ville')

  if (ville) {
    const { count } = await prisma.agence.deleteMany({ where: { ville } })
    return NextResponse.json({ ok: true, deleted: count })
  }

  await prisma.agence.delete({ where: { id: parseInt(id || '0') } })
  return NextResponse.json({ ok: true })
}
