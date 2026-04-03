export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { writeFullBackup } from '@/lib/backup'
import { prisma } from '@/lib/prisma'

export async function POST() {
  await writeFullBackup()
  const count = await prisma.agence.count()
  return NextResponse.json({ ok: true, agencesSauvegardees: count, at: new Date().toISOString() })
}

export async function GET() {
  // Infos sur la dernière sauvegarde
  const fs = await import('fs')
  const BACKUP_FILE = '/data/agentry-backup.json'
  if (!fs.existsSync(BACKUP_FILE)) {
    return NextResponse.json({ exists: false })
  }
  try {
    const raw = fs.readFileSync(BACKUP_FILE, 'utf8')
    const data = JSON.parse(raw)
    return NextResponse.json({ exists: true, exportedAt: data.exportedAt, totalAgences: data.totalAgences })
  } catch {
    return NextResponse.json({ exists: true, exportedAt: null })
  }
}
