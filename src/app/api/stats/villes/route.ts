import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Récupère tous les appels avec agenceId
    const appels = await prisma.sessionAppel.findMany({
      where: { agenceId: { not: null } },
      select: { agenceId: true, resultat: true, rdvPris: true, aPitche: true },
    })

    // Récupère les villes des agences concernées
    const agenceIdsRaw = appels.map(a => a.agenceId).filter((id): id is number => id !== null)
    const agenceIds = Array.from(new Set(agenceIdsRaw))
    const agences = await prisma.agence.findMany({
      where: { id: { in: agenceIds } },
      select: { id: true, ville: true },
    })

    const villeByAgenceId: Record<number, string> = {}
    for (const ag of agences) {
      villeByAgenceId[ag.id] = ag.ville || 'Inconnue'
    }

    // Agrège par ville
    const villeMap: Record<string, { appels: number; interesses: number; rdvs: number; pitches: number }> = {}
    for (const a of appels) {
      const ville = villeByAgenceId[a.agenceId!] || 'Inconnue'
      if (!villeMap[ville]) villeMap[ville] = { appels: 0, interesses: 0, rdvs: 0, pitches: 0 }
      villeMap[ville].appels++
      if (a.resultat === 'interesse') villeMap[ville].interesses++
      if (a.rdvPris) villeMap[ville].rdvs++
      if (a.aPitche) villeMap[ville].pitches++
    }

    // Formate et trie par nombre d'appels
    const villes = Object.entries(villeMap)
      .map(([ville, stats]) => ({
        ville,
        appels: stats.appels,
        interesses: stats.interesses,
        rdvs: stats.rdvs,
        pitches: stats.pitches,
        tauxConversion: stats.appels > 0 ? Math.round((stats.interesses / stats.appels) * 100) : 0,
        tauxRdv: stats.appels > 0 ? Math.round((stats.rdvs / stats.appels) * 100) : 0,
      }))
      .filter(v => v.appels >= 3) // Minimum 3 appels pour avoir une stat significative
      .sort((a, b) => b.appels - a.appels)
      .slice(0, 8) // Top 8 villes

    return NextResponse.json({ villes })
  } catch (e) {
    console.error('Stats villes error:', e)
    return NextResponse.json({ villes: [] })
  }
}
