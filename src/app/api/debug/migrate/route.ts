export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

// Plus nécessaire avec PostgreSQL — les migrations sont gérées par prisma db push au build
export async function POST() {
  return NextResponse.json({ ok: true, message: 'Non requis avec PostgreSQL' })
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Non requis avec PostgreSQL' })
}
