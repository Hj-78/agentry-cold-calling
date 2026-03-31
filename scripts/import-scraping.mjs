import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

// Parse CSV en respectant les guillemets
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result.map(v => v.trim())
}

const csvPath = path.join(path.dirname(__dirname), 'Users/hugojalta/Downloads/Scraping . - sheet1 (1).csv')
// Try a few paths
let csvContent
const attempts = [
  '/Users/hugojalta/Downloads/Scraping . - sheet1 (1).csv',
  '/Users/hugojalta/Downloads/Scraping . - sheet1.csv',
]
for (const p of attempts) {
  if (fs.existsSync(p)) { csvContent = fs.readFileSync(p, 'utf-8'); console.log('Reading:', p); break }
}
if (!csvContent) { console.error('CSV introuvable'); process.exit(1) }

const lines = csvContent.split('\n')
// Skip header line (line 0)
const dataLines = lines.slice(1)

// Villes détectées comme headers (pas de phone ni adresse)
const CITY_KEYWORDS = new Set()

const agencies = []
let currentVille = ''

for (const line of dataLines) {
  if (!line.trim()) continue
  const cols = parseCSVLine(line)
  const nom = cols[0]?.trim() || ''
  const adresse = cols[3]?.trim() || ''
  const municipality = cols[4]?.trim() || ''
  const phone = cols[5]?.trim() || ''
  const reviewCount = parseInt(cols[6]) || null
  const averageRating = parseFloat(cols[7]) || null
  const commentaire = cols[12]?.trim() || null
  const website = cols[18]?.trim() || null

  // Ligne vide ou sans nom
  if (!nom) continue

  // Ligne de ville (header violet) : nom présent, pas d'adresse, pas de tel
  if (!adresse && !phone && !municipality) {
    currentVille = nom
    continue
  }

  // Agence valide
  agencies.push({
    nom,
    adresse: adresse || null,
    ville: municipality || currentVille || null,
    telephone: phone || null,
    reviewCount,
    averageRating,
    commentaire,
    website: website || null,
  })
}

console.log(`\n${agencies.length} agences à importer`)
console.log('Exemple:', JSON.stringify(agencies[0], null, 2))

// Upsert : on préserve statut/notes, on met à jour les données du sheet
let updated = 0, created = 0

for (const ag of agencies) {
  // Chercher par nom (on essaie exact puis contains)
  let existing = await prisma.agence.findFirst({
    where: { nom: { equals: ag.nom } }
  })

  if (!existing) {
    // Cherche partiellement (le nom peut être tronqué dans l'ancien import)
    existing = await prisma.agence.findFirst({
      where: { nom: { contains: ag.nom.substring(0, 20) } }
    })
  }

  if (existing) {
    await prisma.agence.update({
      where: { id: existing.id },
      data: {
        telephone: ag.telephone || existing.telephone,
        adresse: ag.adresse || existing.adresse,
        ville: ag.ville || existing.ville,
        reviewCount: ag.reviewCount ?? existing.reviewCount,
        averageRating: ag.averageRating ?? existing.averageRating,
        commentaire: ag.commentaire || existing.commentaire,
        website: ag.website || existing.website,
      }
    })
    updated++
  } else {
    await prisma.agence.create({
      data: {
        nom: ag.nom,
        telephone: ag.telephone,
        adresse: ag.adresse,
        ville: ag.ville,
        reviewCount: ag.reviewCount,
        averageRating: ag.averageRating,
        commentaire: ag.commentaire,
        website: ag.website,
        source: 'scraping',
      }
    })
    created++
  }
}

console.log(`\n✅ ${updated} mises à jour, ${created} créations`)
await prisma.$disconnect()
