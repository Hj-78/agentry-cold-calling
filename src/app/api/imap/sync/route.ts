export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { getImapConfig } from '@/lib/imap'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const config = await getImapConfig()
  if (!config) return NextResponse.json({ error: 'IMAP non configuré', synced: 0 })

  try {
    const { ImapFlow } = await import('imapflow')
    const { simpleParser } = await import('mailparser')

    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      logger: false,
      tls: { rejectUnauthorized: false },
    })

    await client.connect()

    let synced = 0

    // ── Sync INBOX ──────────────────────────────────────────────────────────
    const lockInbox = await client.getMailboxLock('INBOX')
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const total = ((client.mailbox as any)?.exists as number) || 0
      if (total > 0) {
        const limit = 200
        const start = Math.max(1, total - limit + 1)

        for await (const msg of client.fetch(`${start}:*`, {
          source: true, envelope: true, flags: true, internalDate: true, uid: true,
        })) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw = (msg as any).source as Buffer
            if (!raw) continue

            const parsed = await simpleParser(raw)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const messageId = parsed.messageId || `imap-uid-${(msg as any).uid}`

            // Skip if already stored
            const exists = await prisma.emailInbound.findUnique({
              where: { messageId }, select: { id: true },
            })
            if (exists) continue

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const f = (msg as any).envelope?.from?.[0]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const t = (msg as any).envelope?.to?.[0]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const d = (msg as any).internalDate instanceof Date
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ? (msg as any).internalDate : new Date((msg as any).internalDate || Date.now())
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const flags = (msg as any).flags as Set<string> | undefined

            const bodyHtml = typeof parsed.html === 'string' ? parsed.html : ''
            const bodyText = parsed.text || ''
            const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 200)
            const toAddr = t?.address || config.user

            await prisma.emailInbound.create({
              data: {
                messageId,
                from: f ? `${f.name ? f.name + ' ' : ''}<${f.address || ''}>`.trim() : '',
                fromName: f?.name || f?.address || '',
                fromEmail: f?.address || '',
                to: toAddr,
                subject: parsed.subject || '(Sans objet)',
                bodyHtml: bodyHtml || null,
                bodyText: bodyText || null,
                snippet,
                isRead: flags?.has('\\Seen') ?? false,
                receivedAt: d,
              },
            })
            synced++
          } catch { /* skip individual message errors */ }
        }
      }
    } finally {
      lockInbox.release()
    }

    // ── Sync Sent (Envoyés) ─────────────────────────────────────────────────
    // Try common sent folder names
    const sentFolders = ['Sent', 'Sent Messages', 'INBOX.Sent', 'Sent Items']
    let sentSynced = 0

    for (const folderName of sentFolders) {
      try {
        const lockSent = await client.getMailboxLock(folderName)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const total = ((client.mailbox as any)?.exists as number) || 0
          if (total === 0) { lockSent.release(); continue }

          const limit = 100
          const start = Math.max(1, total - limit + 1)

          for await (const msg of client.fetch(`${start}:*`, {
            source: true, envelope: true, flags: true, internalDate: true, uid: true,
          })) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const raw = (msg as any).source as Buffer
              if (!raw) continue

              const parsed = await simpleParser(raw)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const messageId = parsed.messageId || `imap-sent-uid-${(msg as any).uid}`

              // Use messageId stored in bodyHtml as fallback check
              const existsOut = await prisma.emailOutbound.findFirst({
                where: { subject: parsed.subject || '', to: parsed.to?.text || '' },
                select: { id: true },
              })
              // Simple dedup: skip if same subject+to already stored
              // Use a more precise check via a dedicated messageId lookup via snippet
              const existsIn = await prisma.emailInbound.findUnique({
                where: { messageId: `sent-${messageId}` }, select: { id: true },
              })
              if (existsOut || existsIn) continue

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const f = (msg as any).envelope?.from?.[0]
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const t = (msg as any).envelope?.to?.[0]
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const d = (msg as any).internalDate instanceof Date
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? (msg as any).internalDate : new Date((msg as any).internalDate || Date.now())

              const bodyHtml = typeof parsed.html === 'string' ? parsed.html : ''

              await prisma.emailOutbound.create({
                data: {
                  from: f?.address || config.user,
                  to: t?.address || parsed.to?.text || '',
                  toName: '',
                  subject: parsed.subject || '(Sans objet)',
                  bodyHtml: bodyHtml || `<pre>${parsed.text || ''}</pre>`,
                  sentAt: d,
                },
              })
              sentSynced++
            } catch { /* skip */ }
          }
          lockSent.release()
          break // found and synced this folder, stop trying others
        } catch {
          lockSent.release()
        }
      } catch { /* folder doesn't exist, try next */ }
    }

    await client.logout()

    return NextResponse.json({ synced, sentSynced })
  } catch (err) {
    console.error('[IMAP SYNC]', err)
    return NextResponse.json({ error: String(err), synced: 0 }, { status: 500 })
  }
}
