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
