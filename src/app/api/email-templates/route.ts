export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TEMPLATES } from '@/lib/email-templates'

export async function GET() {
  const param = await prisma.parametre.findUnique({ where: { cle: 'EMAIL_TEMPLATES' } })
  if (!param) return NextResponse.json(DEFAULT_TEMPLATES)
  try {
    return NextResponse.json(JSON.parse(param.valeur))
  } catch {
    return NextResponse.json(DEFAULT_TEMPLATES)
  }
}

export async function POST(req: Request) {
  const templates = await req.json()
  await prisma.parametre.upsert({
    where: { cle: 'EMAIL_TEMPLATES' },
    update: { valeur: JSON.stringify(templates) },
    create: { cle: 'EMAIL_TEMPLATES', valeur: JSON.stringify(templates) },
  })
  return NextResponse.json({ ok: true })
}
