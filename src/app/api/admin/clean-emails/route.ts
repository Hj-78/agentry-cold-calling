export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE() {
  const inbound = await prisma.emailInbound.deleteMany({})
  const outbound = await prisma.emailOutbound.deleteMany({})
  return NextResponse.json({ deleted: { inbound: inbound.count, outbound: outbound.count } })
}
