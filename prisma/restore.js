/**
 * restore.js — Lance au démarrage Railway
 *
 * Priorité :
 * 1. Si /data/agentry-backup.json existe → restaure toutes les agences avec leurs statuts/notes
 * 2. Sinon → seed depuis seed-agences.json (agences fraîches)
 *
 * Pour que /data persiste entre les déploiements → ajouter un Volume Railway monté sur /data
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()
const BACKUP_PATH = '/data/agentry-backup.json'
const SEED_PATH = path.join(__dirname, 'seed-agences.json')

async function main() {
  const count = await prisma.agence.count()

  if (count > 0) {
    console.log(`✅ DB déjà peuplée : ${count} agences présentes — restore ignoré.`)
    return
  }

  console.log('⚠️  Base vide — tentative de restauration…')

  // Essayer de restaurer depuis le backup persistant
  if (fs.existsSync(BACKUP_PATH)) {
    console.log(`📂 Backup trouvé : ${BACKUP_PATH}`)
    const raw = fs.readFileSync(BACKUP_PATH, 'utf8')
    const backup = JSON.parse(raw)
    const agences = backup.agences || []

    if (agences.length > 0) {
      console.log(`🔄 Restauration de ${agences.length} agences depuis le backup…`)
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
      console.log(`✅ Restauration terminée — ${inserted} agences restaurées avec leurs statuts.`)
      console.log(`   Backup daté du : ${backup.exportedAt || 'inconnu'}`)
      return
    }
  }

  // Fallback : seed depuis le fichier d'origine
  console.log(`📋 Pas de backup — seed depuis seed-agences.json…`)
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
