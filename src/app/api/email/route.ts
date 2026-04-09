export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { createRdvWithMeet } from '@/lib/google-calendar'

export async function POST(req: Request) {
  const body = await req.json()
  const { to, subject, html, rdvDate, rdvHeure, agenceNom, agenceEmail } = body

  if (!to || !subject || !html) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  const params = await prisma.parametre.findMany({
    where: { cle: { in: ['SMTP_FROM', 'SMTP_USER'] } },
  })
  const cfg: Record<string, string> = {}
  params.forEach(p => { cfg[p.cle] = p.valeur })

  const resendKey = process.env.RESEND_API_KEY

  if (!resendKey) {
    return NextResponse.json(
      { error: 'RESEND_API_KEY non configuré. Ajoute-le dans les variables Railway.' },
      { status: 500 }
    )
  }

  const resend = new Resend(resendKey)

  // agentry.fr est vérifié dans Resend — toujours envoyer depuis ce domaine
  const fromAddress = process.env.SMTP_FROM || 'Hugo - Agentry <hugo@agentry.fr>'

  // Google Calendar invite si c'est un email RDV confirmation
  let icsAttachment: { filename: string; content: string } | null = null
  if (rdvDate && rdvHeure && agenceEmail) {
    // Créer événement Google Calendar avec Meet
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

    // Générer le fichier .ics
    const [y, m, d] = rdvDate.split('-')
    const [hh, mm] = rdvHeure.split(':')
    const startDt = `${y}${m}${d}T${hh}${mm}00`
    const endHh = String(parseInt(hh) + 1).padStart(2, '0')
    const endDt = `${y}${m}${d}T${endHh}${mm}00`
    const uid = `${Date.now()}@agentry.fr`
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Agentry//Agentry CRM//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `DTSTART:${startDt}`,
      `DTEND:${endDt}`,
      `UID:${uid}`,
      `SUMMARY:RDV Agentry - ${agenceNom || ''}`,
      `DESCRIPTION:Rendez-vous téléphonique avec Agentry`,
      `ORGANIZER;CN=Hugo - Agentry:mailto:hugo@contact.agentry.fr`,
      `ATTENDEE;CN=${agenceNom || ''};RSVP=TRUE:mailto:${agenceEmail}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')

    icsAttachment = {
      filename: 'rendez-vous-agentry.ics',
      content: Buffer.from(icsContent).toString('base64'),
    }
  }

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
      ...(icsAttachment ? { attachments: [icsAttachment] } : {}),
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  // Sauvegarder dans EmailOutbound pour afficher dans "Envoyés"
  try {
    await prisma.emailOutbound.create({
      data: { to, toName: '', subject, bodyHtml: html },
    })
  } catch { /* non bloquant */ }

  return NextResponse.json({ ok: true })
}
