import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DAVClient } from 'tsdav'

// GET : retourne si iCloud est configuré (+ Apple ID masqué)
export async function GET() {
  const appleIdParam = await prisma.parametre.findUnique({ where: { cle: 'ICLOUD_APPLE_ID' } })
  const appPassParam = await prisma.parametre.findUnique({ where: { cle: 'ICLOUD_APP_PASSWORD' } })
  const configured = !!(appleIdParam?.valeur && appPassParam?.valeur)
  return NextResponse.json({
    configured,
    appleId: appleIdParam?.valeur || '',
  })
}

// POST : sauvegarde les credentials iCloud et teste la connexion
export async function POST(req: Request) {
  try {
    const { appleId, appPassword } = await req.json()
    if (!appleId || !appPassword) {
      return NextResponse.json({ error: 'Apple ID et mot de passe requis' }, { status: 400 })
    }

    // Test de connexion avant de sauvegarder
    const client = new DAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: { username: appleId, password: appPassword },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    })
    await client.login()
    const calendars = await client.fetchCalendars()

    // Sauvegarde en DB
    await prisma.parametre.upsert({
      where: { cle: 'ICLOUD_APPLE_ID' },
      create: { cle: 'ICLOUD_APPLE_ID', valeur: appleId },
      update: { valeur: appleId },
    })
    await prisma.parametre.upsert({
      where: { cle: 'ICLOUD_APP_PASSWORD' },
      create: { cle: 'ICLOUD_APP_PASSWORD', valeur: appPassword },
      update: { valeur: appPassword },
    })

    return NextResponse.json({ ok: true, calendarCount: calendars.length })
  } catch (e) {
    return NextResponse.json({ error: 'Connexion échouée — vérifiez votre Apple ID et mot de passe d\'application' }, { status: 400 })
  }
}

// DELETE : supprime les credentials iCloud
export async function DELETE() {
  await prisma.parametre.deleteMany({
    where: { cle: { in: ['ICLOUD_APPLE_ID', 'ICLOUD_APP_PASSWORD'] } }
  })
  return NextResponse.json({ ok: true })
}
