export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Resend Inbound Webhook
// POST body: { type: "email.received", data: { email_id, from, to, subject, html, text, headers, ... } }
export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log('[WEBHOOK EMAIL] received:', JSON.stringify(body).substring(0, 500))

    const data = body.data || body

    const from: string = data.from || ''
    const toRaw: string | string[] = data.to || ''
    const to = Array.isArray(toRaw) ? toRaw[0] : toRaw
    const subject: string = data.subject || '(Sans objet)'
    const bodyHtml: string | null = data.html || null
    const bodyText: string | null = data.text || null

    // Resend uses email_id or message-id header
    const messageId: string | null =
      data.email_id ||
      data.message_id ||
      (data.headers && (data.headers['message-id'] || data.headers['Message-Id'])) ||
      null

    // Parse "John Doe <john@example.com>"
    const fromMatch = from.match(/^"?([^"<]*)"?\s*<(.+?)>$/)
    const fromName = fromMatch ? fromMatch[1].trim() : from
    const fromEmail = fromMatch ? fromMatch[2] : from

    // Build snippet from text or stripped HTML
    const rawText = bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '')
    const snippet = rawText.trim().slice(0, 200)

    // Dedup by messageId
    if (messageId) {
      const existing = await prisma.emailInbound.findUnique({ where: { messageId } })
      if (existing) return NextResponse.json({ ok: true, duplicate: true })
    }

    await prisma.emailInbound.create({
      data: { messageId, from, fromName, fromEmail, to, subject, bodyHtml, bodyText, snippet },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[WEBHOOK EMAIL] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Resend pings GET to verify webhook URL
export async function GET() {
  return NextResponse.json({ ok: true, service: 'agentry-email-inbound' })
}
