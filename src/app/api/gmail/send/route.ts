export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { sendViaGmail } from '@/lib/gmail'

export async function POST(req: Request) {
  const body = await req.json()
  const { to, subject, html, threadId, inReplyTo, references } = body

  if (!to || !subject || !html) {
    return NextResponse.json({ error: 'Champs manquants (to, subject, html)' }, { status: 400 })
  }

  try {
    await sendViaGmail({ to, subject, html, threadId, inReplyTo, references })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = String(err)
    const isAuthError = msg.includes('insufficient') || msg.includes('403') || msg.includes('401') || msg.includes('scope')
    if (isAuthError) return NextResponse.json({ error: 'auth_required' }, { status: 403 })
    console.error('[GMAIL] send error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
