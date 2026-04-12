export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const folder = searchParams.get('folder') || 'inbox'
  const q = searchParams.get('q') || ''
  const max = parseInt(searchParams.get('max') || '50')

  try {
    if (folder === 'sent') {
      // Emails envoyés (stockés à chaque envoi Resend)
      const sent = await prisma.emailOutbound.findMany({
        orderBy: { sentAt: 'desc' },
        take: max,
      })
      const messages = sent.map(m => ({
        id: String(m.id),
        from: m.from,
        fromName: 'Hugo — Agentry',
        fromEmail: m.from,
        to: m.to,
        subject: m.subject,
        snippet: m.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150),
        date: m.sentAt.toISOString(),
        timestamp: m.sentAt.getTime(),
        isRead: true,
        folder: 'sent',
      }))
      const filtered = q
        ? messages.filter(m => m.subject.toLowerCase().includes(q.toLowerCase()) || m.to.toLowerCase().includes(q.toLowerCase()))
        : messages
      return NextResponse.json({ messages: filtered })
    }

    // Boîte de réception — emails reçus via webhook Resend
    const received = await prisma.emailInbound.findMany({
      orderBy: { receivedAt: 'desc' },
      take: max,
      where: q ? {
        OR: [
          { subject: { contains: q } },
          { fromName: { contains: q } },
          { fromEmail: { contains: q } },
        ],
      } : undefined,
    })

    const messages = received.map(m => ({
      id: String(m.id),
      from: m.from,
      fromName: m.fromName,
      fromEmail: m.fromEmail,
      to: m.to,
      subject: m.subject,
      snippet: m.snippet || '',
      date: m.receivedAt.toISOString(),
      timestamp: m.receivedAt.getTime(),
      isRead: m.isRead,
      folder: 'inbox',
    }))

    return NextResponse.json({ messages })
  } catch (err) {
    console.error('[EMAIL] list error:', err)
    return NextResponse.json({ error: String(err), messages: [] }, { status: 500 })
  }
}
