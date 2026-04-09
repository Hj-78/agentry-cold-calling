export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://agentry-cold-calling-production.up.railway.app'}/emails?auth_error=${error}`
    )
  }
  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://agentry-cold-calling-production.up.railway.app'}/emails?auth_error=no_code`
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agentry-cold-calling-production.up.railway.app'
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${appUrl}/api/auth/callback`
  )

  try {
    const { tokens } = await auth.getToken(code)
    if (tokens.refresh_token) {
      // Stocker le token complet (Calendar + Gmail) en base
      await prisma.parametre.upsert({
        where: { cle: 'GOOGLE_REFRESH_TOKEN_FULL' },
        update: { valeur: tokens.refresh_token },
        create: { cle: 'GOOGLE_REFRESH_TOKEN_FULL', valeur: tokens.refresh_token },
      })
    }
    return NextResponse.redirect(`${appUrl}/emails?auth_success=1`)
  } catch (err) {
    console.error('[AUTH] callback error:', err)
    return NextResponse.redirect(`${appUrl}/emails?auth_error=${encodeURIComponent(String(err))}`)
  }
}
