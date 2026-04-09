export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { listMessages } from '@/lib/gmail'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const folder = searchParams.get('folder') || 'inbox'
  const q = searchParams.get('q') || ''
  const max = parseInt(searchParams.get('max') || '40')

  let query = ''
  if (q) {
    query = q
  } else if (folder === 'sent') {
    query = 'in:sent'
  } else if (folder === 'unread') {
    query = 'in:inbox is:unread'
  } else {
    query = 'in:inbox'
  }

  try {
    const messages = await listMessages(query, max)
    return NextResponse.json({ messages })
  } catch (err) {
    const msg = String(err)
    const isAuthError = msg.includes('insufficient') || msg.includes('403') || msg.includes('401') || msg.includes('scope')
    if (isAuthError) {
      return NextResponse.json({ error: 'auth_required', messages: [] }, { status: 403 })
    }
    console.error('[GMAIL] listMessages error:', err)
    return NextResponse.json({ error: msg, messages: [] }, { status: 500 })
  }
}
