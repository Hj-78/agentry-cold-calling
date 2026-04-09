/* eslint-disable @typescript-eslint/no-explicit-any */
import { ImapFlow } from 'imapflow'
import { prisma } from '@/lib/prisma'

export interface ImapConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

export interface EmailSummary {
  id: string
  from: string
  fromName: string
  fromEmail: string
  to: string
  subject: string
  snippet: string
  date: string
  timestamp: number
  isRead: boolean
}

export interface EmailFull extends EmailSummary {
  body: string
}

export async function getImapConfig(): Promise<ImapConfig | null> {
  try {
    const params = await prisma.parametre.findMany({
      where: { cle: { in: ['IMAP_HOST', 'IMAP_PORT', 'IMAP_USER', 'IMAP_PASS', 'IMAP_SECURE'] } },
    })
    const cfg: Record<string, string> = {}
    params.forEach(p => { cfg[p.cle] = p.valeur })

    const host = cfg.IMAP_HOST || process.env.IMAP_HOST
    const user = cfg.IMAP_USER || process.env.IMAP_USER
    const pass = cfg.IMAP_PASS || process.env.IMAP_PASS

    if (!host || !user || !pass) return null

    return {
      host,
      port: parseInt(cfg.IMAP_PORT || process.env.IMAP_PORT || '993'),
      secure: (cfg.IMAP_SECURE || process.env.IMAP_SECURE || 'true') !== 'false',
      user,
      pass,
    }
  } catch {
    return null
  }
}

function makeClient(config: ImapConfig): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    tls: { rejectUnauthorized: false },
  })
}

function toDate(d: string | Date | undefined): Date {
  if (!d) return new Date(0)
  return d instanceof Date ? d : new Date(d)
}

export async function listMessages(folder = 'INBOX', limit = 40): Promise<EmailSummary[]> {
  const config = await getImapConfig()
  if (!config) throw new Error('imap_not_configured')

  const client = makeClient(config)
  await client.connect()

  const lock = await client.getMailboxLock(folder)
  try {
    const mailbox = client.mailbox as any
    const total = (mailbox?.exists as number) || 0
    if (total === 0) return []

    const start = Math.max(1, total - limit + 1)
    const messages: EmailSummary[] = []

    for await (const msg of client.fetch(`${start}:*`, {
      envelope: true,
      flags: true,
      internalDate: true,
      uid: true,
    })) {
      const f = (msg as any).envelope?.from?.[0]
      const t = (msg as any).envelope?.to?.[0]
      const d = toDate((msg as any).internalDate)
      const flags = (msg as any).flags as Set<string> | undefined
      messages.push({
        id: String((msg as any).uid),
        from: f ? `${f.name || ''} <${f.address || ''}>`.trim() : '',
        fromName: f?.name || f?.address || '',
        fromEmail: f?.address || '',
        to: t?.address || '',
        subject: (msg as any).envelope?.subject || '(Sans objet)',
        snippet: '',
        date: d.toISOString(),
        timestamp: d.getTime(),
        isRead: flags?.has('\\Seen') ?? false,
      })
    }
    return messages.reverse()
  } finally {
    lock.release()
    await client.logout()
  }
}

export async function getMessage(uid: string, folder = 'INBOX'): Promise<EmailFull> {
  const config = await getImapConfig()
  if (!config) throw new Error('imap_not_configured')

  const client = makeClient(config)
  await client.connect()

  const lock = await client.getMailboxLock(folder)
  try {
    const msg = await client.fetchOne(uid, {
      source: true, flags: true, envelope: true, internalDate: true,
    }, { uid: true }) as any

    if (!msg) throw new Error('Message non trouvé')

    const flags = msg.flags as Set<string> | undefined
    if (!flags?.has('\\Seen')) {
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
    }

    // Importer mailparser dynamiquement pour éviter les erreurs de type
    const { simpleParser } = await import('mailparser')
    const source = msg.source as Buffer | undefined
    if (!source) throw new Error('Source introuvable')

    const parsed = await simpleParser(source)
    const body = parsed.html
      || (parsed.text ? `<pre style="white-space:pre-wrap;font-family:inherit">${parsed.text}</pre>` : '')

    const f = msg.envelope?.from?.[0]
    const t = msg.envelope?.to?.[0]
    const d = toDate(msg.internalDate)

    return {
      id: uid,
      from: f ? `${f.name || ''} <${f.address || ''}>`.trim() : '',
      fromName: f?.name || f?.address || '',
      fromEmail: f?.address || '',
      to: t?.address || '',
      subject: msg.envelope?.subject || '(Sans objet)',
      snippet: (parsed.text || '').slice(0, 150),
      date: d.toISOString(),
      timestamp: d.getTime(),
      isRead: true,
      body: body || '',
    }
  } finally {
    lock.release()
    await client.logout()
  }
}
