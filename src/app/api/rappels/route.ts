export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const rappels = await prisma.rappel.findMany({
    orderBy: { dateHeure: 'asc' },
    include: { agence: { select: { nom: true } } },
  })
  return NextResponse.json(rappels)
}

export async function POST(req: Request) {
  const body = await req.json()
  const rappel = await prisma.rappel.create({
    data: {
      agenceId: body.agenceId || null,
      dateHeure: new Date(body.dateHeure),
      note: body.note || null,
    },
  })
  return NextResponse.json(rappel, { status: 201 })
}

export async function PATCH(req: Request) {
  const { id, ...data } = await req.json()
  if (data.dateHeure) data.dateHeure = new Date(data.dateHeure)
  const rappel = await prisma.rappel.update({ where: { id }, data })
  return NextResponse.json(rappel)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = parseInt(searchParams.get('id') || '0')
  await prisma.rappel.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
