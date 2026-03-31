import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Récupère tous les appels avec leur heure et résultat
    const appels = await prisma.sessionAppel.findMany({
      select: { createdAt: true, resultat: true, rdvPris: true },
    })

    // Agrège par heure (0-23)
    const heureMap: Record<number, { appels: number; interesses: number; rdvs: number }> = {}
    for (let h = 0; h < 24; h++) {
      heureMap[h] = { appels: 0, interesses: 0, rdvs: 0 }
    }

    for (const a of appels) {
      const h = new Date(a.createdAt).getHours()
      heureMap[h].appels++
      if (a.resultat === 'interesse') heureMap[h].interesses++
      if (a.rdvPris) heureMap[h].rdvs++
    }

    // Filtre les heures avec activité
    const heures = Object.entries(heureMap)
      .map(([h, stats]) => ({
        heure: parseInt(h),
        label: `${String(h).padStart(2, '0')}h`,
        ...stats,
        tauxConversion: stats.appels >= 3 ? Math.round((stats.interesses / stats.appels) * 100) : null,
      }))
      .filter(h => h.appels > 0)
      .sort((a, b) => a.heure - b.heure)

    // Meilleure heure = plus grand taux de conversion (minimum 3 appels)
    const meilleureHeure = heures
      .filter(h => h.tauxConversion !== null)
      .sort((a, b) => (b.tauxConversion ?? 0) - (a.tauxConversion ?? 0))[0] || null

    return NextResponse.json({ heures, meilleureHeure })
  } catch (e) {
    console.error('Stats heures error:', e)
    return NextResponse.json({ heures: [], meilleureHeure: null })
  }
}
