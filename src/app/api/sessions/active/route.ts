export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await prisma.session.findFirst({
    where: { status: 'active' },
    include: { appels: { orderBy: { ordre: 'asc' } } },
  })
  if (!session) return NextResponse.json(null)
  return NextResponse.json({
    ...session,
    agenceQueue: (() => { try { return session.agenceQueue ? JSON.parse(session.agenceQueue) : null } catch { return null } })(),
  })
}
