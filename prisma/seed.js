const { PrismaClient } = require('@prisma/client')
const agences = require('./seed-agences.json')

const prisma = new PrismaClient()

async function main() {
  const count = await prisma.agence.count()
  if (count > 0) {
    console.log(`Seed ignoré : ${count} agences déjà en base.`)
    return
  }

  console.log(`Base vide — seed de ${agences.length} agences…`)
  let inserted = 0
  const batchSize = 100
  for (let i = 0; i < agences.length; i += batchSize) {
    const chunk = agences.slice(i, i + batchSize)
    await prisma.agence.createMany({ data: chunk })
    inserted += chunk.length
    console.log(`  ${inserted}/${agences.length}`)
  }
  console.log('✅ Seed terminé.')
}

main()
  .catch(e => { console.error('❌ Seed error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
