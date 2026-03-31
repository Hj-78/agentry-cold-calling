export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const agences = await prisma.agence.findMany({ orderBy: { createdAt: 'desc' } })

  const header = 'nom,telephone,email,adresse,statut,notes,source'
  const rows = agences.map((a) =>
    [a.nom, a.telephone || '', a.email || '', a.adresse || '', a.statut, a.notes || '', a.source || '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  )

  const csv = [header, ...rows].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="agences.csv"',
    },
  })
}

export async function POST(req: Request) {
  const { csv } = await req.json()
  const lines = csv.trim().split('\n').slice(1) // skip header

  let imported = 0
  for (const line of lines) {
    const cols = line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.map((c: string) =>
      c.startsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c
    ) || []

    const [nom, telephone, email, adresse, statut, notes, source] = cols
    if (!nom?.trim()) continue

    await prisma.agence.create({
      data: {
        nom: nom.trim(),
        telephone: telephone || null,
        email: email || null,
        adresse: adresse || null,
        statut: statut || 'nouveau',
        notes: notes || null,
        source: source || 'csv',
      },
    })
    imported++
  }

  return NextResponse.json({ imported })
}
