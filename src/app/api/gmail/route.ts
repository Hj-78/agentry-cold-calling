export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { listMessages } from '@/lib/imap'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const folder = searchParams.get('folder') === 'sent' ? 'Sent' : 'INBOX'
  const q = searchParams.get('q') || ''
  const max = parseInt(searchParams.get('max') || '40')

  try {
    let messages = await listMessages(folder, max)
    // Filtre de recherche côté serveur si query
    if (q) {
      const ql = q.toLowerCase()
      messages = messages.filter(m =>
        m.subject.toLowerCase().includes(ql) ||
        m.fromName.toLowerCase().includes(ql) ||
        m.fromEmail.toLowerCase().includes(ql)
      )
    }
    return NextResponse.json({ messages })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('imap_not_configured')) {
      return NextResponse.json({ error: 'imap_not_configured', messages: [] }, { status: 403 })
    }
    if (msg.includes('auth') || msg.includes('LOGIN') || msg.includes('credentials')) {
      return NextResponse.json({ error: 'imap_auth_error', messages: [], detail: msg }, { status: 401 })
    }
    console.error('[IMAP] listMessages error:', err)
    return NextResponse.json({ error: msg, messages: [] }, { status: 500 })
  }
}
