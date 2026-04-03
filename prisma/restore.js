/**
 * restore.js — Lance au démarrage Railway
 *
 * Priorité :
 * 1. Si /data/agentry-backup.json existe → restaure TOUTES les agences avec leurs statuts/notes/commentaires
 *    (même si des agences existent déjà en DB — on écrase pour restaurer les qualifications)
 * 2. Sinon → seed depuis seed-agences.json (agences fraîches)
 *
 * Le Volume Railway monté sur /data rend ces fichiers permanents entre les déploiements.
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const BACKUP_PATH = '/data/agentry-backup.json'
const SEED_PATH = path.join(__dirname, 'seed-agences.json')

async function main() {
  // ── CAS 1 : backup persistant disponible ──────────────────
  if (fs.existsSync(BACKUP_PATH)) {
    console.log(`📂 Backup trouvé : ${BACKUP_PATH}`)
    const raw = fs.readFileSync(BACKUP_PATH, 'utf8')
    const backup = JSON.parse(raw)
    const agences = backup.agences || []

    if (agences.length === 0) {
      console.log('⚠️  Backup vide — seed depuis seed-agences.json…')
    } else {
      console.log(`🔄 Restauration de ${agences.length} agences depuis le backup (${backup.exportedAt || 'date inconnue'})…`)

      // Supprimer tout et réinsérer pour avoir les statuts exacts du backup
      await prisma.agence.deleteMany()

      let inserted = 0
      const batchSize = 100
      for (let i = 0; i < agences.length; i += batchSize) {
        const chunk = agences.slice(i, i + batchSize).map(a => ({
          nom: a.nom,
          telephone: a.telephone || null,
          email: a.email || null,
          adresse: a.adresse || null,
          ville: a.ville || null,
          statut: a.statut || 'nouveau',
          notes: a.notes || null,
          commentaire: a.commentaire || null,
          reviewCount: a.reviewCount || null,
          averageRating: a.averageRating || null,
          website: a.website || null,
          source: a.source || null,
          googlePlaceId: a.googlePlaceId || null,
        }))
        await prisma.agence.createMany({ data: chunk })
        inserted += chunk.length
        console.log(`  ${inserted}/${agences.length}`)
      }
      console.log(`✅ Restauration terminée — ${inserted} agences avec leurs statuts restaurés.`)
      return
    }
  }

  // ── CAS 2 : pas de backup → vérifier si DB déjà peuplée ──
  const count = await prisma.agence.count()
  if (count > 0) {
    console.log(`✅ DB déjà peuplée : ${count} agences — aucune action nécessaire.`)
    return
  }

  // ── CAS 3 : DB vide, pas de backup → seed initial ─────────
  console.log(`📋 DB vide, pas de backup — seed depuis seed-agences.json…`)
  const agences = require(SEED_PATH)
  let inserted = 0
  const batchSize = 100
  for (let i = 0; i < agences.length; i += batchSize) {
    const chunk = agences.slice(i, i + batchSize)
    await prisma.agence.createMany({ data: chunk })
    inserted += chunk.length
    console.log(`  ${inserted}/${agences.length}`)
  }
  console.log(`✅ Seed terminé — ${inserted} agences insérées.`)
}

main()
  .catch(e => { console.error('❌ Restore error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
