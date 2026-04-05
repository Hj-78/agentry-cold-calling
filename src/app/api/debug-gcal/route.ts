export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createRdvWithMeet } from '@/lib/google-calendar'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  const envStatus = {
    GOOGLE_CLIENT_ID: clientId ? `✅ présent (${clientId.slice(0, 20)}...)` : '❌ MANQUANT',
    GOOGLE_CLIENT_SECRET: clientSecret ? `✅ présent` : '❌ MANQUANT',
    GOOGLE_REFRESH_TOKEN: refreshToken ? `✅ présent (${refreshToken.slice(0, 20)}...)` : '❌ MANQUANT',
  }

  if (!clientId || !clientSecret || !refreshToken) {
    return NextResponse.json({ ok: false, envStatus, error: 'Variables manquantes' })
  }

  try {
    const result = await createRdvWithMeet({
      agenceNom: 'TEST DEBUG',
      agenceEmail: 'hugo@agentry.fr',
      rdvDate: '2026-04-15',
      rdvHeure: '10:00',
      description: 'Test de connexion Google Calendar',
    })
    return NextResponse.json({ ok: true, envStatus, result })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      envStatus,
      error: String(err),
      errorDetail: err instanceof Error ? { message: err.message, stack: err.stack?.slice(0, 500) } : err,
    })
  }
}
