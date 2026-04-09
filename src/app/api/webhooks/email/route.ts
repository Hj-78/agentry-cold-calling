export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Resend Inbound Webhook
// POST body from Resend: { type: "email.received", data: { from, to, subject, html, text, headers, ... } }
export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Accepter aussi les webhooks de test Resend (type peut être absent)
    const data = body.data || body

    const from: string = data.from || ''
    const toRaw: string | string[] = data.to || ''
    const to = Array.isArray(toRaw) ? toRaw[0] : toRaw
    const subject: string = data.subject || '(Sans objet)'
    const bodyHtml: string | null = data.html || null
    const bodyText: string | null = data.text || null
    const messageId: string | null = data.headers?.['message-id'] || data.message_id || null

    // Parser l'expéditeur : "John Doe <john@example.com>"
    const fromMatch = from.match(/^"?([^"<]*)"?\s*<(.+?)>$/)
    const fromName = fromMatch ? fromMatch[1].trim() : from
    const fromEmail = fromMatch ? fromMatch[2] : from

    const snippet = (bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 200)

    // Ne pas sauvegarder les doublons (même messageId)
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

// Resend envoie un GET pour vérifier l'URL (certains providers)
export async function GET() {
  return NextResponse.json({ ok: true, service: 'agentry-email-inbound' })
}
