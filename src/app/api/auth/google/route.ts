export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
]

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agentry-cold-calling-production.up.railway.app'
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${appUrl}/api/auth/callback`
  )
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force pour obtenir le refresh_token
  })
  return NextResponse.json({ url })
}
