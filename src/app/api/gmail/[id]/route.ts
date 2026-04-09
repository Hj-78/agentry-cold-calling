export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getMessage } from '@/lib/imap'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url)
  const folder = searchParams.get('folder') === 'sent' ? 'Sent' : 'INBOX'

  try {
    const message = await getMessage(params.id, folder)
    return NextResponse.json(message)
  } catch (err) {
    const msg = String(err)
    if (msg.includes('imap_not_configured')) return NextResponse.json({ error: 'imap_not_configured' }, { status: 403 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
