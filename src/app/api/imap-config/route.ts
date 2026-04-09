export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getImapConfig } from '@/lib/imap'

export async function GET() {
  const config = await getImapConfig()
  if (!config) return NextResponse.json({ configured: false })
  return NextResponse.json({
    configured: true,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    // Ne pas renvoyer le mot de passe
  })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { host, port, secure, user, pass } = body

  if (!host || !user || !pass) {
    return NextResponse.json({ error: 'Champs manquants (host, user, pass)' }, { status: 400 })
  }

  // Tester la connexion avant de sauvegarder
  try {
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host, port: parseInt(port || '993'),
      secure: secure !== false,
      auth: { user, pass },
      logger: false,
      tls: { rejectUnauthorized: false },
    })
    await client.connect()
    await client.logout()
  } catch (err) {
    return NextResponse.json({ error: `Connexion IMAP échouée : ${err}` }, { status: 400 })
  }

  // Sauvegarder
  const entries = [
    { cle: 'IMAP_HOST', valeur: host },
    { cle: 'IMAP_PORT', valeur: String(port || 993) },
    { cle: 'IMAP_SECURE', valeur: String(secure !== false) },
    { cle: 'IMAP_USER', valeur: user },
    { cle: 'IMAP_PASS', valeur: pass },
  ]

  for (const { cle, valeur } of entries) {
    await prisma.parametre.upsert({
      where: { cle },
      update: { valeur },
      create: { cle, valeur },
    })
  }

  return NextResponse.json({ ok: true })
}
