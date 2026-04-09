export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getMessage } from '@/lib/gmail'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const message = await getMessage(params.id)
    return NextResponse.json(message)
  } catch (err) {
    const msg = String(err)
    const isAuthError = msg.includes('insufficient') || msg.includes('403') || msg.includes('401') || msg.includes('scope')
    if (isAuthError) return NextResponse.json({ error: 'auth_required' }, { status: 403 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
