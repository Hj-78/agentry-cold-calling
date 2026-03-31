export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

// Google OAuth callback supprimé — l'app utilise désormais iCloud Calendar (CalDAV)
export async function GET() {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return NextResponse.redirect(`${base}/parametres`)
}
