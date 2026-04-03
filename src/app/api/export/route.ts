export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listReports, readReport } from '@/lib/backup'

/**
 * GET /api/export?format=json|csv|rapport&date=YYYY-MM-DD
 *
 * format=json   → export complet de toutes les agences (JSON)
 * format=csv    → export agences en CSV
 * format=rapport→ rapport journalier (param date= requis, ou aujourd'hui si absent)
 * format=rapports→ liste des rapports disponibles
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') || 'json'

  // Liste des rapports disponibles
  if (format === 'rapports') {
    const reports = listReports()
    return NextResponse.json({ reports })
  }

  // Rapport journalier
  if (format === 'rapport') {
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const report = readReport(date)
    if (!report) return NextResponse.json({ error: `Aucun rapport pour le ${date}` }, { status: 404 })
    return NextResponse.json(report, {
      headers: { 'Content-Disposition': `attachment; filename="rapport-${date}.json"` },
    })
  }

  // Export agences CSV
  if (format === 'csv') {
    const agences = await prisma.agence.findMany({ orderBy: [{ ville: 'asc' }, { nom: 'asc' }] })
    const headers = ['id', 'nom', 'telephone', 'email', 'adresse', 'ville', 'statut', 'notes', 'commentaire', 'website', 'reviewCount', 'averageRating', 'source', 'createdAt']
    const escape = (v: unknown) => {
      if (v == null) return ''
      const s = String(v).replace(/"/g, '""')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
    }
    const rows = [
      headers.join(','),
      ...agences.map(a => headers.map(h => escape(a[h as keyof typeof a])).join(',')),
    ]
    const today = new Date().toISOString().split('T')[0]
    return new NextResponse(rows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="agentry-agences-${today}.csv"`,
      },
    })
  }

  // Export JSON complet (défaut)
  const [agences, sessions] = await Promise.all([
    prisma.agence.findMany({ orderBy: [{ ville: 'asc' }, { nom: 'asc' }] }),
    prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { appels: { orderBy: { ordre: 'asc' } } },
    }),
  ])

  const stats = {
    totalAgences: agences.length,
    parStatut: {
      nouveau: agences.filter(a => a.statut === 'nouveau').length,
      appele: agences.filter(a => a.statut === 'appele').length,
      interesse: agences.filter(a => a.statut === 'interesse').length,
      rappeler: agences.filter(a => a.statut === 'rappeler').length,
      refuse: agences.filter(a => a.statut === 'refuse').length,
    },
    totalSessions: sessions.length,
    totalAppels: sessions.reduce((s, sess) => s + sess.totalAppels, 0),
    totalRdvs: sessions.flatMap(s => s.appels).filter(a => a.rdvPris).length,
  }

  const today = new Date().toISOString().split('T')[0]
  return NextResponse.json({ exportedAt: new Date().toISOString(), stats, agences, sessions }, {
    headers: { 'Content-Disposition': `attachment; filename="agentry-export-${today}.json"` },
  })
}
