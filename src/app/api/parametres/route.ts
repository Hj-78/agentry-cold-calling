import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const params = await prisma.parametre.findMany()
  const result: Record<string, string> = {}
  params.forEach((p) => { result[p.cle] = p.valeur })
  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const body = await req.json()
  for (const [cle, valeur] of Object.entries(body)) {
    if (typeof valeur === 'string' && valeur.trim()) {
      await prisma.parametre.upsert({
        where: { cle },
        update: { valeur },
        create: { cle, valeur },
      })
    }
  }
  return NextResponse.json({ ok: true })
}
