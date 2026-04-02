import { PrismaClient } from '@prisma/client'
import agences from './seed-agences.json'

const prisma = new PrismaClient()

async function main() {
  const count = await prisma.agence.count()
  if (count > 0) {
    console.log(`Seed ignoré : ${count} agences déjà présentes.`)
    return
  }

  console.log(`Seeding ${agences.length} agences…`)
  let inserted = 0
  const batch = 100
  for (let i = 0; i < agences.length; i += batch) {
    const chunk = agences.slice(i, i + batch)
    await prisma.agence.createMany({ data: chunk })
    inserted += chunk.length
    console.log(`  ${inserted}/${agences.length}`)
  }
  console.log('Seed terminé.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
