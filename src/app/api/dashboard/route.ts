export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const JOURS_ACTIFS = [1, 2, 4, 5, 6] // lun, mar, jeu, ven, sam
const OBJECTIF_MIN = 50

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function isJourActif(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return JOURS_ACTIFS.includes(d.getDay())
}

function startOf(unit: 'day' | 'week' | 'month') {
  const d = new Date()
  if (unit === 'day') { d.setHours(0, 0, 0, 0); return d }
  if (unit === 'week') { d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); return d }
  if (unit === 'month') { d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); return d }
  return d
}

function calcStats(appels: { resultat: string | null; aPitche: boolean | null; rdvPris: boolean | null }[]) {
  return {
    totalAppels: appels.length,
    interesses: appels.filter(a => a.resultat === 'interesse').length,
    pasInteresses: appels.filter(a => a.resultat === 'pas_interesse').length,
    rdvs: appels.filter(a => a.rdvPris).length,
    pitches: appels.filter(a => a.aPitche).length,
    rappeler: appels.filter(a => a.resultat === 'rappeler').length,
    messagerie: appels.filter(a => a.resultat === 'messagerie' || a.resultat === 'absent').length,
  }
}

async function getOrCreateToday() {
  const date = todayStr()
  return prisma.objectifJour.upsert({
    where: { date },
    update: {},
    create: { date, objectif: OBJECTIF_MIN, compteur: 0 },
  })
}

async function calcStreak() {
  const since = new Date()
  since.setDate(since.getDate() - 60)
  const sinceStr = since.toISOString().split('T')[0]
  const rows = await prisma.objectifJour.findMany({
    where: { date: { gte: sinceStr } },
    orderBy: { date: 'desc' },
  })
  const byDate: Record<string, number> = {}
  rows.forEach(r => { byDate[r.date] = r.compteur })

  let streak = 0
  const today = todayStr()
  const cur = new Date()
  cur.setDate(cur.getDate() - 1)

  for (let i = 0; i < 60; i++) {
    const ds = cur.toISOString().split('T')[0]
    if (ds >= today) { cur.setDate(cur.getDate() - 1); continue }
    if (isJourActif(ds)) {
      const count = byDate[ds] ?? 0
      if (count >= OBJECTIF_MIN) { streak++ } else { break }
    }
    cur.setDate(cur.getDate() - 1)
  }
  const todayCount = byDate[today] ?? 0
  if (isJourActif(today) && todayCount >= OBJECTIF_MIN) streak++
  return streak
}

export async function GET() {
  const today = await getOrCreateToday()
  const streak = await calcStreak()

  // ── AUJOURD'HUI ─────────────────────────────────────────
  const dayStart = startOf('day')
  const dayAppels = await prisma.sessionAppel.findMany({
    where: { createdAt: { gte: dayStart } },
    select: { resultat: true, aPitche: true, rdvPris: true },
  })
  const dayStats = calcStats(dayAppels)

  // Sync objectifJour.compteur avec le vrai compte du jour (fiabilité)
  if (today.compteur !== dayStats.totalAppels && dayStats.totalAppels > 0) {
    await prisma.objectifJour.update({
      where: { id: today.id },
      data: { compteur: dayStats.totalAppels },
    }).catch(() => {})
  }

  // ── SEMAINE (7 derniers jours) ───────────────────────────
  const weekStart = startOf('week')
  const weekAppels = await prisma.sessionAppel.findMany({
    where: { createdAt: { gte: weekStart } },
    select: { resultat: true, aPitche: true, rdvPris: true, createdAt: true },
  })
  const weekStats = calcStats(weekAppels)

  // Jours actifs de la semaine courante avec barres
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]
  const weekData = await prisma.objectifJour.findMany({
    where: { date: { gte: sevenDaysAgoStr } },
    orderBy: { date: 'asc' },
  })
  const semaineJours: { date: string; compteur: number; objectifAtteint: boolean; isToday: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    if (isJourActif(ds)) {
      const row = weekData.find(r => r.date === ds)
      semaineJours.push({
        date: ds,
        compteur: row?.compteur ?? 0,
        objectifAtteint: (row?.compteur ?? 0) >= OBJECTIF_MIN,
        isToday: ds === todayStr(),
      })
    }
  }

  // Moyenne par jour actif cette semaine
  const joursAvecAppels = [...new Set(
    weekAppels.map(a => a.createdAt.toISOString().split('T')[0])
  )].length
  const moyenneJour = joursAvecAppels > 0 ? Math.round(weekStats.totalAppels / joursAvecAppels) : 0
  const joursActifs = weekData.filter(d => d.compteur >= OBJECTIF_MIN && isJourActif(d.date)).length

  // ── MOIS (30 derniers jours) ─────────────────────────────
  const monthStart = startOf('month')
  const monthAppels = await prisma.sessionAppel.findMany({
    where: { createdAt: { gte: monthStart } },
    select: { resultat: true, aPitche: true, rdvPris: true, createdAt: true },
  })
  const monthStats = calcStats(monthAppels)
  const joursAvecAppelsMois = [...new Set(
    monthAppels.map(a => a.createdAt.toISOString().split('T')[0])
  )].length
  const moyenneJourMois = joursAvecAppelsMois > 0 ? Math.round(monthStats.totalAppels / joursAvecAppelsMois) : 0

  // ── DERNIÈRE SESSION ─────────────────────────────────────
  const lastSession = await prisma.session.findFirst({
    where: { status: 'ended' },
    orderBy: { createdAt: 'desc' },
    include: { appels: { select: { resultat: true, aPitche: true, rdvPris: true } } },
  })
  const lastSessionStats = lastSession ? {
    date: lastSession.createdAt,
    totalAppels: lastSession.totalAppels,
    interesses: lastSession.appels.filter(a => a.resultat === 'interesse').length,
    pasInteresses: lastSession.appels.filter(a => a.resultat === 'pas_interesse').length,
    rdvs: lastSession.appels.filter(a => a.rdvPris).length,
    pitches: lastSession.appels.filter(a => a.aPitche).length,
    duree: lastSession.duree,
    resume: lastSession.resume,
  } : null

  return NextResponse.json({
    today: { ...today, compteur: dayStats.totalAppels },
    streak,
    objectifMin: OBJECTIF_MIN,
    semaineJours,
    day: dayStats,
    week: { ...weekStats, joursActifs, moyenneJour },
    month: { ...monthStats, moyenneJour: moyenneJourMois, joursAvecAppels: joursAvecAppelsMois },
    lastSession: lastSessionStats,
  })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const delta = body.delta === -1 ? -1 : 1
  const today = await getOrCreateToday()
  const updated = await prisma.objectifJour.update({
    where: { id: today.id },
    data: { compteur: { increment: delta } },
  })
  if (updated.compteur < 0) {
    return NextResponse.json(await prisma.objectifJour.update({
      where: { id: today.id },
      data: { compteur: 0 },
    }))
  }
  return NextResponse.json(updated)
}

export async function PUT(req: Request) {
  const { objectif } = await req.json()
  const today = await getOrCreateToday()
  const updated = await prisma.objectifJour.update({
    where: { id: today.id },
    data: { objectif },
  })
  return NextResponse.json(updated)
}
