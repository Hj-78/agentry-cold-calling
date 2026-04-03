/**
 * backup.ts — Sauvegarde automatique de la base de données
 *
 * Écrit deux types de fichiers dans /data/ (Volume Railway persistant) :
 * - /data/agentry-backup.json     → snapshot complet de toutes les agences
 * - /data/rapports/YYYY-MM-DD.json → rapport détaillé de chaque session
 *
 * Ces fichiers survivent aux redéploiements si un Volume Railway est monté sur /data.
 */

import fs from 'fs'
import path from 'path'
import { prisma } from './prisma'

const DATA_DIR = '/data'
const RAPPORTS_DIR = path.join(DATA_DIR, 'rapports')
const BACKUP_FILE = path.join(DATA_DIR, 'agentry-backup.json')

function ensureDirs() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    if (!fs.existsSync(RAPPORTS_DIR)) fs.mkdirSync(RAPPORTS_DIR, { recursive: true })
  } catch { /* silencieux */ }
}

/** Écrit un snapshot complet de toutes les agences dans /data/agentry-backup.json */
export async function writeFullBackup() {
  try {
    ensureDirs()

    const agences = await prisma.agence.findMany({
      orderBy: { ville: 'asc' },
    })

    const backup = {
      exportedAt: new Date().toISOString(),
      totalAgences: agences.length,
      agences,
    }

    fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2), 'utf8')
    console.log(`💾 Backup écrit : ${agences.length} agences → ${BACKUP_FILE}`)
  } catch (err) {
    console.error('⚠️  Backup write error:', err)
  }
}

/** Écrit le rapport détaillé d'une session dans /data/rapports/YYYY-MM-DD.json */
export async function writeSessionReport(sessionId: number) {
  try {
    ensureDirs()

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { appels: { orderBy: { ordre: 'asc' } } },
    })
    if (!session) return

    const today = new Date().toISOString().split('T')[0]
    const reportFile = path.join(RAPPORTS_DIR, `${today}.json`)

    // Lire le rapport existant du jour (plusieurs sessions possible)
    let rapport: Record<string, unknown> = { date: today, sessions: [] }
    if (fs.existsSync(reportFile)) {
      try { rapport = JSON.parse(fs.readFileSync(reportFile, 'utf8')) } catch { /* nouveau rapport */ }
    }

    const sessions = (rapport.sessions as unknown[]) || []

    // Stats de la session
    const interesses = session.appels.filter(a => a.resultat === 'interesse').length
    const rappelers = session.appels.filter(a => a.resultat === 'rappeler').length
    const pasInteresse = session.appels.filter(a => a.resultat === 'pas_interesse').length
    const rdvs = session.appels.filter(a => a.rdvPris).length
    const pitches = session.appels.filter(a => a.aPitche).length

    const sessionReport = {
      sessionId: session.id,
      heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      dureeMinutes: session.duree ? Math.round(session.duree / 60) : 0,
      totalAppels: session.totalAppels,
      objectif: session.objectif,
      stats: {
        interesses,
        rappelers,
        pasInteresse,
        rdvs,
        pitches,
      },
      resume: session.resume || null,
      appels: session.appels.map(a => ({
        ordre: a.ordre,
        agence: a.agenceNom || '—',
        telephone: a.agenceTel || '—',
        resultat: a.resultat || '—',
        aPitche: a.aPitche ?? false,
        rdvPris: a.rdvPris ?? false,
        rdvDate: a.rdvDate || null,
        rdvHeure: a.rdvHeure || null,
        noteRapide: a.noteRapide || null,
        dureeSecondes: a.duree || 0,
        createdAt: a.createdAt,
      })),
    }

    sessions.push(sessionReport)
    rapport.sessions = sessions
    rapport.totalSessionsDuJour = sessions.length
    rapport.totalAppelsDuJour = sessions.reduce((s: number, sess: unknown) => s + ((sess as { totalAppels: number }).totalAppels || 0), 0)
    rapport.totalRdvsDuJour = sessions.reduce((s: number, sess: unknown) => s + ((sess as { stats: { rdvs: number } }).stats?.rdvs || 0), 0)
    rapport.updatedAt = new Date().toISOString()

    fs.writeFileSync(reportFile, JSON.stringify(rapport, null, 2), 'utf8')
    console.log(`📋 Rapport journalier mis à jour : ${reportFile}`)
  } catch (err) {
    console.error('⚠️  Session report write error:', err)
  }
}

/** Liste tous les rapports disponibles */
export function listReports(): string[] {
  try {
    ensureDirs()
    if (!fs.existsSync(RAPPORTS_DIR)) return []
    return fs.readdirSync(RAPPORTS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
  } catch { return [] }
}

/** Lit un rapport par date (YYYY-MM-DD) */
export function readReport(date: string): unknown | null {
  try {
    const file = path.join(RAPPORTS_DIR, `${date}.json`)
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch { return null }
}
