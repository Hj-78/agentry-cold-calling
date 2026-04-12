export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url)
  const folder = searchParams.get('folder') || 'inbox'
  const id = parseInt(params.id)

  try {
    if (folder === 'sent') {
      const m = await prisma.emailOutbound.findUnique({ where: { id } })
      if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({
        id: String(m.id),
        from: m.from,
        fromName: 'Hugo — Agentry',
        fromEmail: m.from,
        to: m.to,
        subject: m.subject,
        snippet: '',
        date: m.sentAt.toISOString(),
        timestamp: m.sentAt.getTime(),
        isRead: true,
        body: m.bodyHtml,
        folder: 'sent',
      })
    }

    const m = await prisma.emailInbound.findUnique({ where: { id } })
    if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Mark as read
    if (!m.isRead) {
      await prisma.emailInbound.update({ where: { id }, data: { isRead: true } })
    }

    return NextResponse.json({
      id: String(m.id),
      from: m.from,
      fromName: m.fromName,
      fromEmail: m.fromEmail,
      to: m.to,
      subject: m.subject,
      snippet: m.snippet || '',
      date: m.receivedAt.toISOString(),
      timestamp: m.receivedAt.getTime(),
      isRead: true,
      body: m.bodyHtml || (m.bodyText ? `<pre style="white-space:pre-wrap;font-family:inherit">${m.bodyText}</pre>` : ''),
      folder: 'inbox',
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
