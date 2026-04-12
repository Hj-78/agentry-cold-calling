export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Run missing SQLite migrations manually
export async function POST() {
  const results: string[] = []

  // Add messageId to EmailOutbound if missing
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "EmailOutbound" ADD COLUMN "messageId" TEXT`
    )
    results.push('Added EmailOutbound.messageId')
  } catch (e) {
    results.push('EmailOutbound.messageId: ' + String(e).split('\n')[0])
  }

  // Create unique index on messageId (SQLite doesn't support adding unique via ALTER)
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "EmailOutbound_messageId_key" ON "EmailOutbound"("messageId")`
    )
    results.push('Created unique index on EmailOutbound.messageId')
  } catch (e) {
    results.push('Index: ' + String(e).split('\n')[0])
  }

  return NextResponse.json({ ok: true, results })
}

export async function GET() {
  // Check current schema
  const cols = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `PRAGMA table_info("EmailOutbound")`
  )
  return NextResponse.json({ columns: cols.map(c => c.name) })
}
