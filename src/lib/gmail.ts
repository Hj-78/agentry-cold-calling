import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'

async function getAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const auth = new google.auth.OAuth2(clientId, clientSecret)

  // Token DB (avec scope Gmail) a priorité sur le token env (Calendar uniquement)
  let refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  try {
    const dbToken = await prisma.parametre.findUnique({ where: { cle: 'GOOGLE_REFRESH_TOKEN_FULL' } })
    if (dbToken?.valeur) refreshToken = dbToken.valeur
  } catch { /* ignore */ }

  auth.setCredentials({ refresh_token: refreshToken })
  return auth
}

function decodeBase64(encoded: string): string {
  return Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function getHeader(headers: Array<{ name?: string | null; value?: string | null }>, name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    const html = payload.parts.find((p: { mimeType: string }) => p.mimeType === 'text/html')
    if (html?.body?.data) return decodeBase64(html.body.data)
    const text = payload.parts.find((p: { mimeType: string }) => p.mimeType === 'text/plain')
    if (text?.body?.data) return `<pre style="white-space:pre-wrap;font-family:inherit">${decodeBase64(text.body.data)}</pre>`
    for (const part of payload.parts) {
      const body = extractBody(part)
      if (body) return body
    }
  }
  return ''
}

export interface GmailMessage {
  id: string
  threadId: string
  from: string
  fromName: string
  fromEmail: string
  to: string
  subject: string
  snippet: string
  date: string
  timestamp: number
  isRead: boolean
  body?: string
}

export async function listMessages(query = 'in:inbox', maxResults = 40): Promise<GmailMessage[]> {
  const auth = await getAuth()
  const gmail = google.gmail({ version: 'v1', auth })

  const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults })
  if (!list.data.messages?.length) return []

  const messages = await Promise.all(
    list.data.messages.map(m =>
      gmail.users.messages.get({
        userId: 'me',
        id: m.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      })
    )
  )

  return messages.map(msg => {
    const headers = msg.data.payload?.headers || []
    const from = getHeader(headers, 'From')
    const match = from.match(/^"?([^"<]+)"?\s*<(.+?)>$/)
    return {
      id: msg.data.id!,
      threadId: msg.data.threadId!,
      from,
      fromName: match ? match[1].trim() : from,
      fromEmail: match ? match[2] : from,
      to: getHeader(headers, 'To'),
      subject: getHeader(headers, 'Subject') || '(Sans objet)',
      snippet: msg.data.snippet || '',
      date: getHeader(headers, 'Date'),
      timestamp: parseInt(msg.data.internalDate || '0'),
      isRead: !msg.data.labelIds?.includes('UNREAD'),
    }
  }).sort((a, b) => b.timestamp - a.timestamp)
}

export async function getMessage(id: string): Promise<GmailMessage & { body: string }> {
  const auth = await getAuth()
  const gmail = google.gmail({ version: 'v1', auth })

  const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
  const headers = msg.data.payload?.headers || []
  const from = getHeader(headers, 'From')
  const match = from.match(/^"?([^"<]+)"?\s*<(.+?)>$/)

  // Mark as read (non-bloquant)
  if (msg.data.labelIds?.includes('UNREAD')) {
    gmail.users.messages.modify({
      userId: 'me', id,
      requestBody: { removeLabelIds: ['UNREAD'] },
    }).catch(() => {})
  }

  return {
    id: msg.data.id!,
    threadId: msg.data.threadId!,
    from,
    fromName: match ? match[1].trim() : from,
    fromEmail: match ? match[2] : from,
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject') || '(Sans objet)',
    snippet: msg.data.snippet || '',
    date: getHeader(headers, 'Date'),
    timestamp: parseInt(msg.data.internalDate || '0'),
    isRead: !msg.data.labelIds?.includes('UNREAD'),
    body: extractBody(msg.data.payload),
  }
}

export async function sendViaGmail(params: {
  to: string
  subject: string
  html: string
  threadId?: string
  inReplyTo?: string
  references?: string
}): Promise<void> {
  const auth = await getAuth()
  const gmail = google.gmail({ version: 'v1', auth })

  const lines = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
  ]
  if (params.inReplyTo) lines.push(`In-Reply-To: ${params.inReplyTo}`)
  if (params.references) lines.push(`References: ${params.references}`)
  lines.push('', params.html)

  const raw = Buffer.from(lines.join('\r\n')).toString('base64url')
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, ...(params.threadId ? { threadId: params.threadId } : {}) },
  })
}

export async function getUnreadCount(): Promise<number> {
  const auth = await getAuth()
  const gmail = google.gmail({ version: 'v1', auth })
  const res = await gmail.users.labels.get({ userId: 'me', id: 'INBOX' })
  return res.data.messagesUnread || 0
}
