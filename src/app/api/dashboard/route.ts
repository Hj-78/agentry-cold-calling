export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Jours actifs : lundi(1), mardi(2), jeudi(4), vendredi(5), samedi(6)
const JOURS_ACTIFS = [1, 2, 4, 5, 6]
const OBJECTIF_MIN = 50

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function isJourActif(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return JOURS_ACTIFS.includes(d.getDay())
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
  // Récupère les 60 derniers jours pour calculer la série
  const since = new Date()
  since.setDate(since.getDate() - 60)
  const sinceStr = since.toISOString().split('T')[0]
  const rows = await prisma.objectifJour.findMany({
    where: { date: { gte: sinceStr } },
    orderBy: { date: 'desc' },
  })
  const byDate: Record<string, number> = {}
  rows.forEach(r => { byDate[r.date] = r.compteur })

  // Parcourt les jours actifs en arrière depuis hier
  let streak = 0
  const today = todayStr()
  const cur = new Date()
  cur.setDate(cur.getDate() - 1) // commence à hier

  for (let i = 0; i < 60; i++) {
    const ds = cur.toISOString().split('T')[0]
    if (ds >= today) { cur.setDate(cur.getDate() - 1); continue }
    if (isJourActif(ds)) {
      const count = byDate[ds] ?? 0
      if (count >= OBJECTIF_MIN) {
        streak++
      } else {
        break
      }
    }
    cur.setDate(cur.getDate() - 1)
  }
  // Si aujourd'hui est un jour actif et objectif atteint, ça compte aussi
  const todayCount = byDate[today] ?? 0
  if (isJourActif(today) && todayCount >= OBJECTIF_MIN) streak++
  return streak
}

export async function GET() {
  const today = await getOrCreateToday()
  const streak = await calcStreak()

  // Stats 7 derniers jours
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

  const weekData = await prisma.objectifJour.findMany({
    where: { date: { gte: sevenDaysAgoStr } },
    orderBy: { date: 'asc' },
  })

  const totalAppels = weekData.reduce((sum, d) => sum + d.compteur, 0)
  const joursActifs = weekData.filter((d) => d.compteur >= OBJECTIF_MIN && isJourActif(d.date)).length
  const moyenneJour = weekData.filter(d => d.compteur > 0).length > 0
    ? Math.round(totalAppels / weekData.filter(d => d.compteur > 0).length)
    : 0

  // Jours actifs de la semaine en cours (lun-sam selon règle)
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

  // Stats conversion de la semaine (depuis SessionAppel)
  const weekAppels = await prisma.sessionAppel.findMany({
    where: { createdAt: { gte: sevenDaysAgo } },
    select: { resultat: true, aPitche: true, rdvPris: true },
  })
  const pitchesWeek = weekAppels.filter(a => a.aPitche).length
  const interessesWeek = weekAppels.filter(a => a.resultat === 'interesse').length
  const rdvsWeek = weekAppels.filter(a => a.rdvPris).length

  // Dernière session terminée
  const lastSession = await prisma.session.findFirst({
    where: { status: 'ended' },
    orderBy: { createdAt: 'desc' },
    include: { appels: { select: { resultat: true, aPitche: true, rdvPris: true } } },
  })

  const lastSessionStats = lastSession ? {
    date: lastSession.createdAt,
    totalAppels: lastSession.totalAppels,
    interesses: lastSession.appels.filter(a => a.resultat === 'interesse').length,
    rdvs: lastSession.appels.filter(a => a.rdvPris).length,
    duree: lastSession.duree,
  } : null

  return NextResponse.json({
    today,
    streak,
    objectifMin: OBJECTIF_MIN,
    semaineJours,
    week: { totalAppels, joursActifs, moyenneJour, pitches: pitchesWeek, interesses: interessesWeek, rdvs: rdvsWeek },
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
