export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const inbound = await prisma.emailInbound.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 20,
  })
  const outbound = await prisma.emailOutbound.findMany({
    orderBy: { sentAt: 'desc' },
    take: 20,
  })
  return NextResponse.json({
    inboundCount: inbound.length,
    outboundCount: outbound.length,
    inbound: inbound.map(m => ({
      id: m.id,
      messageId: m.messageId,
      from: m.from,
      to: m.to,
      subject: m.subject,
      hasHtml: !!m.bodyHtml,
      hasText: !!m.bodyText,
      snippet: m.snippet,
      receivedAt: m.receivedAt,
    })),
    outbound: outbound.map(m => ({
      id: m.id,
      from: m.from,
      to: m.to,
      subject: m.subject,
      sentAt: m.sentAt,
    })),
  })
}

// POST: backfill missing email bodies from Resend API
export async function POST() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No RESEND_API_KEY' })

  // Find emails without body
  const emails = await prisma.emailInbound.findMany({
    where: { bodyHtml: null, bodyText: null, messageId: { not: null } },
    take: 50,
  })

  let updated = 0
  for (const email of emails) {
    // messageId stored is the email_id from Resend (e.g. "9c30e0d2-...")
    const emailId = email.messageId
    if (!emailId) continue
    try {
      const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) continue
      const data = await res.json()
      const bodyHtml = data.html || null
      const bodyText = data.text || null
      if (!bodyHtml && !bodyText) continue
      const rawText = bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : '')
      const snippet = rawText.trim().slice(0, 200)
      await prisma.emailInbound.update({
        where: { id: email.id },
        data: { bodyHtml, bodyText, snippet },
      })
      updated++
    } catch { /* skip */ }
  }

  return NextResponse.json({ updated, total: emails.length })
}
