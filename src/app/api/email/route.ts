export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { createRdvWithMeet } from '@/lib/google-calendar'

// Adresses vérifiées dans Resend
const ADDRESSES = {
  primary: { email: 'hugo@contact.agentry.fr', display: 'Hugo — Agentry <hugo@contact.agentry.fr>' },
  secondary: { email: 'hugo@agentry.fr', display: 'Hugo — Agentry <hugo@agentry.fr>' },
}

export async function POST(req: Request) {
  const body = await req.json()
  const { to, subject, html, fromAccount, rdvDate, rdvHeure, agenceNom, agenceEmail } = body

  if (!to || !subject || !html) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY non configuré.' }, { status: 500 })
  }

  // Choisir l'adresse d'envoi
  const account = fromAccount === 'secondary' ? ADDRESSES.secondary : ADDRESSES.primary
  const fromAddress = account.display

  // Google Calendar + ICS si email de RDV
  let icsAttachment: { filename: string; content: string } | null = null
  if (rdvDate && rdvHeure && agenceEmail) {
    try {
      await createRdvWithMeet({
        agenceNom: agenceNom || '',
        agenceEmail,
        rdvDate,
        rdvHeure,
        description: `Rendez-vous Agentry — ${agenceNom || agenceEmail}`,
      })
    } catch (err) {
      console.error('Google Calendar error (non-bloquant):', err)
    }

    const [y, m, d] = rdvDate.split('-')
    const [hh, mm] = rdvHeure.split(':')
    const startDt = `${y}${m}${d}T${hh}${mm}00`
    const endHh = String(parseInt(hh) + 1).padStart(2, '0')
    const endDt = `${y}${m}${d}T${endHh}${mm}00`
    const uid = `${Date.now()}@agentry.fr`
    const icsContent = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agentry//CRM//FR',
      'CALSCALE:GREGORIAN', 'METHOD:REQUEST', 'BEGIN:VEVENT',
      `DTSTART:${startDt}`, `DTEND:${endDt}`, `UID:${uid}`,
      `SUMMARY:RDV Agentry - ${agenceNom || ''}`,
      `DESCRIPTION:Rendez-vous téléphonique avec Agentry`,
      `ORGANIZER;CN=Hugo - Agentry:mailto:${account.email}`,
      `ATTENDEE;CN=${agenceNom || ''};RSVP=TRUE:mailto:${agenceEmail}`,
      'STATUS:CONFIRMED', 'SEQUENCE:0', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n')
    icsAttachment = { filename: 'rendez-vous-agentry.ics', content: Buffer.from(icsContent).toString('base64') }
  }

  const resend = new Resend(resendKey)
  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
      ...(icsAttachment ? { attachments: [icsAttachment] } : {}),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  try {
    await prisma.emailOutbound.create({
      data: { from: account.email, to, toName: '', subject, bodyHtml: html },
    })
  } catch { /* non bloquant */ }

  return NextResponse.json({ ok: true })
}
