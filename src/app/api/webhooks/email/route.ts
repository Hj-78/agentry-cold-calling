export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Resend Inbound Webhook
// Payload: { type: "email.received", data: { from, to, subject, html, text, ... } }
// OR raw format: { from, to, subject, html, text, ... } at root level

function extractField(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const parts = key.split('.')
    let cur: unknown = obj
    for (const part of parts) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[part]
      else { cur = undefined; break }
    }
    if (cur !== undefined && cur !== null && cur !== '') return String(cur)
  }
  return null
}

export async function POST(req: Request) {
  try {
    const raw = await req.text()
    console.log('[WEBHOOK EMAIL] raw (2000 chars):', raw.substring(0, 2000))

    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw)
    } catch {
      console.error('[WEBHOOK EMAIL] JSON parse failed, raw:', raw.substring(0, 500))
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Resend wraps in { type, data: {...} } — but older versions send flat
    const data = (body.data && typeof body.data === 'object'
      ? body.data
      : body) as Record<string, unknown>

    console.log('[WEBHOOK EMAIL] data keys:', Object.keys(data))

    // From
    const from = extractField(data, 'from') || ''

    // To — can be array or string
    const toRaw = data.to
    const to = Array.isArray(toRaw)
      ? (toRaw as string[])[0]
      : (typeof toRaw === 'string' ? toRaw : '')

    const subject = extractField(data, 'subject') || '(Sans objet)'

    // Email body — try all known Resend field names
    const bodyHtml = extractField(data,
      'html',
      'html_body',
      'htmlBody',
      'body_html',
      'payload.html',
    )
    const bodyText = extractField(data,
      'text',
      'text_body',
      'textBody',
      'body_text',
      'plain_text',
      'plainText',
      'payload.text',
    )

    console.log('[WEBHOOK EMAIL] html length:', bodyHtml?.length ?? 'null')
    console.log('[WEBHOOK EMAIL] text length:', bodyText?.length ?? 'null')

    // Message ID for dedup
    const messageId = extractField(data,
      'email_id',
      'message_id',
      'messageId',
      'headers.message-id',
      'headers.Message-Id',
    )

    // Parse "John Doe <john@example.com>"
    const fromMatch = from.match(/^"?([^"<]*)"?\s*<(.+?)>$/)
    const fromName = fromMatch ? fromMatch[1].trim() : from
    const fromEmail = fromMatch ? fromMatch[2].trim() : from

    // Snippet
    const rawText = bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '')
    const snippet = rawText.trim().slice(0, 200)

    // Dedup
    if (messageId) {
      const existing = await prisma.emailInbound.findUnique({ where: { messageId } })
      if (existing) {
        // Si on avait sauvegardé sans body, mettre à jour maintenant
        if (!existing.bodyHtml && !existing.bodyText && (bodyHtml || bodyText)) {
          await prisma.emailInbound.update({
            where: { messageId },
            data: { bodyHtml, bodyText, snippet: snippet || existing.snippet },
          })
          console.log('[WEBHOOK EMAIL] updated body for existing message')
        }
        return NextResponse.json({ ok: true, duplicate: true })
      }
    }

    await prisma.emailInbound.create({
      data: { messageId, from, fromName, fromEmail, to, subject, bodyHtml, bodyText, snippet },
    })

    console.log('[WEBHOOK EMAIL] saved:', subject, 'from:', fromEmail, 'html:', bodyHtml?.length ?? 0, 'text:', bodyText?.length ?? 0)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[WEBHOOK EMAIL] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'agentry-email-inbound' })
}
