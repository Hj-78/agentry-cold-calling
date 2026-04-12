export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Resend Inbound Webhook
// Payload: { type: "email.received", data: { from, to, subject, email_id, message_id, ... } }
// NOTE: Resend inbound webhooks do NOT include html/text body — we fetch it via API

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

async function fetchEmailBodyFromResend(emailId: string): Promise<{ html: string | null; text: string | null }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !emailId) return { html: null, text: null }
  try {
    const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return { html: null, text: null }
    const data = await res.json()
    return {
      html: data.html || null,
      text: data.text || null,
    }
  } catch {
    return { html: null, text: null }
  }
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

    // Email body — try all known Resend field names (may be present in some formats)
    let bodyHtml = extractField(data,
      'html',
      'html_body',
      'htmlBody',
      'body_html',
      'payload.html',
    )
    let bodyText = extractField(data,
      'text',
      'text_body',
      'textBody',
      'body_text',
      'plain_text',
      'plainText',
      'payload.text',
    )

    // Message ID for dedup
    const messageId = extractField(data,
      'email_id',
      'message_id',
      'messageId',
      'headers.message-id',
      'headers.Message-Id',
    )

    // Resend email_id (separate from message_id) — used to fetch body via API
    const resendEmailId = extractField(data, 'email_id')

    console.log('[WEBHOOK EMAIL] html length:', bodyHtml?.length ?? 'null')
    console.log('[WEBHOOK EMAIL] text length:', bodyText?.length ?? 'null')
    console.log('[WEBHOOK EMAIL] resendEmailId:', resendEmailId)

    // If no body in payload, fetch from Resend API using email_id
    if (!bodyHtml && !bodyText && resendEmailId) {
      console.log('[WEBHOOK EMAIL] fetching body from Resend API...')
      const fetched = await fetchEmailBodyFromResend(resendEmailId)
      bodyHtml = fetched.html
      bodyText = fetched.text
      console.log('[WEBHOOK EMAIL] fetched html length:', bodyHtml?.length ?? 'null')
      console.log('[WEBHOOK EMAIL] fetched text length:', bodyText?.length ?? 'null')
    }

    // Parse "John Doe <john@example.com>"
    const fromMatch = from.match(/^"?([^"<]*)"?\s*<(.+?)>$/)
    const fromName = fromMatch ? fromMatch[1].trim() : from
    const fromEmail = fromMatch ? fromMatch[2].trim() : from

    // Snippet
    const rawText = bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '')
    const snippet = rawText.trim().slice(0, 200)

    // Dedup — use messageId (email_id from Resend) for deduplication
    if (messageId) {
      const existing = await prisma.emailInbound.findUnique({ where: { messageId } })
      if (existing) {
        // If stored without body, update now
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
