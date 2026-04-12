export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function safeParseQueue(s: string | null) {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'
import { DEFAULT_TEMPLATES } from '@/lib/email-templates'
import { writeFullBackup, writeSessionReport } from '@/lib/backup'
import { createRdvWithMeet } from '@/lib/google-calendar'

// PATCH: met à jour une session (ajoute un appel, ou clôture la session)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const body = await req.json().catch(() => ({}))

  // Ajouter un appel à la session
  if (body.action === 'add_appel') {
    const session = await prisma.session.findUnique({ where: { id }, include: { appels: true } })
    if (!session) return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })

    const ordre = session.appels.length + 1
    const appel = await prisma.sessionAppel.create({
      data: {
        sessionId: id,
        ordre,
        agenceId: body.agenceId || null,
        agenceNom: body.agenceNom || null,
        agenceTel: body.agenceTel || null,
        transcription: body.transcription || null,
        resultat: body.resultat || null,
        resume: body.resume || null,
        pointsCles: body.pointsCles || null,
        prochaineAction: body.prochaineAction || null,
        duree: body.duree || null,
        aPitche: body.aPitche ?? null,
        rdvPris: body.rdvPris ?? null,
        rdvDate: body.rdvDate || null,
        rdvHeure: body.rdvHeure || null,
        agenceEmail: body.agenceEmail || null,
        noteRapide: body.noteRapide || null,
      },
    })

    // Auto-envoi email de confirmation de RDV + création Google Calendar
    if (body.rdvPris && body.rdvDate && body.rdvHeure) {
      try {
        const resendKey = process.env.RESEND_API_KEY

        // Générer résumé IA pour l'email si transcription disponible
        let resumeAppel = body.noteRapide || 'Échange téléphonique – suite à notre conversation, vous avez confirmé votre intérêt pour un rendez-vous.'
        if (body.transcription?.trim()) {
          try {
            const apiKey = process.env.ANTHROPIC_API_KEY
            if (apiKey) {
              const client = new Anthropic({ apiKey })
              const msg = await client.messages.create({
                model: 'claude-opus-4-6',
                max_tokens: 300,
                messages: [{
                  role: 'user',
                  content: `Tu es un commercial. Résume en 2-3 phrases maximum ce que vous avez évoqué dans cet appel téléphonique pour le rappeler dans un email de confirmation de rendez-vous. Sois concis et professionnel.\n\nTranscription: ${body.transcription}`,
                }],
              })
              if (msg.content[0].type === 'text') resumeAppel = msg.content[0].text
            }
          } catch { /* résumé IA optionnel */ }
        }

        // Formater la date du RDV en français (T12:00:00 évite le bug UTC minuit → jour -1)
        const rdvDateFr = new Date(body.rdvDate + 'T12:00:00').toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        })

        // Générer la pièce jointe .ics (invitation Google/Apple Calendar)
        const icsContent = (() => {
          const [y, m, d] = body.rdvDate.split('-')
          const [hh, mm] = body.rdvHeure.split(':')
          const startDt = `${y}${m}${d}T${hh}${mm}00`
          const endHh = String(parseInt(hh) + 1).padStart(2, '0')
          const endDt = `${y}${m}${d}T${endHh}${mm}00`
          const uid = `${Date.now()}@agentry.fr`
          const desc = resumeAppel.replace(/\n/g, '\\n').replace(/,/g, '\\,')
          return [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Agentry//Agentry CRM//FR',
            'CALSCALE:GREGORIAN',
            'METHOD:REQUEST',
            'BEGIN:VEVENT',
            `DTSTART:${startDt}`,
            `DTEND:${endDt}`,
            `UID:${uid}`,
            `SUMMARY:RDV Agentry - ${body.agenceNom || ''}`,
            `DESCRIPTION:${desc}`,
            `ORGANIZER;CN=Hugo - Agentry:mailto:hugo@contact.agentry.fr`,
            `ATTENDEE;CN=${body.agenceNom || ''};RSVP=TRUE:mailto:${body.agenceEmail}`,
            'STATUS:CONFIRMED',
            'SEQUENCE:0',
            'END:VEVENT',
            'END:VCALENDAR',
          ].join('\r\n')
        })()

        // 1. Créer l'événement Google Calendar avec Google Meet (invite envoyée par Google)
        let meetLink = ''
        console.log('[GCAL] Tentative création événement Google Calendar pour', body.agenceEmail, body.rdvDate, body.rdvHeure)
        console.log('[GCAL] Env vars présentes:', {
          GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
          GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
        })
        try {
          const googleResult = await createRdvWithMeet({
            agenceNom: body.agenceNom || '',
            agenceEmail: body.agenceEmail,
            rdvDate: body.rdvDate,
            rdvHeure: body.rdvHeure,
            description: resumeAppel,
          })
          console.log('[GCAL] Résultat:', googleResult)
          if (googleResult.meetLink) meetLink = googleResult.meetLink
        } catch (gcalErr) {
          console.error('[GCAL] Erreur Google Calendar:', gcalErr)
        }

        // Fallback iCloud Calendar si Google Calendar non configuré
        if (!meetLink) {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/calendar`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agenceNom: body.agenceNom,
                agenceEmail: body.agenceEmail,
                rdvDate: body.rdvDate,
                rdvHeure: body.rdvHeure,
                description: resumeAppel,
              }),
            })
          } catch { /* iCloud Calendar optionnel */ }
        }

        // 2. Envoyer l'email de confirmation via Resend (seulement si email prospect dispo)
        if (resendKey && body.agenceEmail) {
          const tmpl = DEFAULT_TEMPLATES.find(t => t.id === 'rdv-confirmation')!
          const fromAddress = process.env.SMTP_FROM || 'Hugo - Agentry <hugo@contact.agentry.fr>'
          const meetBlock = meetLink
            ? `<div style="margin:20px 0;text-align:center"><a href="${meetLink}" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600">🎥 Rejoindre Google Meet</a><p style="margin:8px 0 0;font-size:12px;color:#94a3b8">${meetLink}</p></div>`
            : ''
          const vars: Record<string, string> = {
            agence: body.agenceNom || '',
            expediteur: 'Hugo — Agentry',
            rdvDate: rdvDateFr,
            rdvHeure: body.rdvHeure,
            resumeAppel,
            meetLink: meetBlock,
          }
          const apply = (s: string) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v), s)
          const sujet = apply(tmpl.sujet)
          const corps = apply(tmpl.corps)

          const resend = new Resend(resendKey)
          await resend.emails.send({
            from: fromAddress,
            to: body.agenceEmail,
            subject: sujet,
            html: corps,
            attachments: [{
              filename: 'rendez-vous-agentry.ics',
              content: Buffer.from(icsContent).toString('base64'),
            }],
          })
        }
      } catch { /* auto-envoi optionnel, non bloquant */ }
    }

    // Auto-update agence statut si intéressé ou RDV pris
    if (body.agenceId) {
      if (body.resultat === 'interesse' || body.rdvPris) {
        await prisma.agence.updateMany({
          where: { id: body.agenceId },
          data: { statut: body.rdvPris ? 'interesse' : 'interesse' },
        })
      } else if (body.resultat === 'rappeler') {
        await prisma.agence.updateMany({
          where: { id: body.agenceId, statut: 'nouveau' },
          data: { statut: 'rappeler' },
        })
      } else if (body.resultat === 'pas_interesse') {
        await prisma.agence.updateMany({
          where: { id: body.agenceId, statut: { in: ['nouveau', 'appele'] } },
          data: { statut: 'refuse' },
        })
      }
    }

    await prisma.session.update({
      where: { id },
      data: { totalAppels: { increment: 1 } },
    })

    // Mettre à jour le compteur journalier
    const today = new Date().toISOString().split('T')[0]
    await prisma.objectifJour.upsert({
      where: { date: today },
      update: { compteur: { increment: 1 } },
      create: { date: today, objectif: session.objectif, compteur: 1 },
    })

    return NextResponse.json(appel)
  }

  // Clôturer la session
  if (body.action === 'end') {
    const session = await prisma.session.findUnique({ where: { id }, include: { appels: { orderBy: { ordre: 'asc' } } } })
    if (!session) return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })

    const duree = body.duree || 0

    // Générer le résumé avec Claude
    let resume = null
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (apiKey && session.appels.length > 0) {
        const client = new Anthropic({ apiKey })
        const appelsTexte = session.appels.map((a, i) => {
          const lines = [`Appel ${i + 1}${a.agenceNom ? ` - ${a.agenceNom}` : ''}${a.agenceTel ? ` (${a.agenceTel})` : ''}`]
          if (a.resultat) lines.push(`Résultat: ${a.resultat}`)
          if (a.aPitche !== null) lines.push(`A pitché: ${a.aPitche ? 'oui' : 'non'}`)
          if (a.rdvPris) lines.push(`RDV pris: oui`)
          if (a.noteRapide) lines.push(`Note: ${a.noteRapide}`)
          if (a.transcription) lines.push(`Transcription: ${a.transcription}`)
          return lines.join('\n')
        }).join('\n\n')

        const dureeMin = Math.round(duree / 60)
        const message = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Tu es un coach en cold calling. Voici le résumé d'une session de prospection.

Durée: ${dureeMin} minutes
Objectif: ${session.objectif} appels
Appels réalisés: ${session.appels.length}

${appelsTexte}

Génère un résumé de session motivant et concis en français (5-8 phrases max). Mentionne les points forts, les axes d'amélioration, et si l'objectif a été atteint.`,
          }],
        })
        resume = message.content[0].type === 'text' ? message.content[0].text : null
      }
    } catch {
      // Résumé optionnel, pas bloquant
    }

    const updated = await prisma.session.update({
      where: { id },
      data: { status: 'ended', duree, resume },
      include: { appels: { orderBy: { ordre: 'asc' } } },
    })

    // Marquer toutes les agences appelées comme "appele" — SAUF "pas_repondu" (restent "nouveau")
    try {
      const queue = session.agenceQueue ? JSON.parse(session.agenceQueue) as { id: number }[] : []
      const appeleeIds = session.appels
        .filter(a => a.agenceId && a.resultat !== 'pas_repondu')
        .map(a => a.agenceId as number)
      if (appeleeIds.length > 0) {
        await prisma.agence.updateMany({
          where: { id: { in: appeleeIds }, statut: 'nouveau' },
          data: { statut: 'appele' },
        })
      }
      // Marquer aussi les agences de la queue qui n'ont pas été appelées (skippées)
      const nonAppelees = queue.filter(ag => !appeleeIds.includes(ag.id)).map(ag => ag.id)
      if (nonAppelees.length > 0) {
        // On ne les marque pas, elles restent "nouveau" pour la prochaine session
      }
    } catch { /* silencieux */ }

    // Auto-backup après chaque session : backup complet + rapport journalier
    writeFullBackup().catch(() => {})
    writeSessionReport(id).catch(() => {})

    return NextResponse.json({ ...updated, agenceQueue: safeParseQueue(session.agenceQueue) })
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
}

// DELETE: supprime une session et ses appels
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  await prisma.sessionAppel.deleteMany({ where: { sessionId: id } })
  await prisma.session.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// GET: retourne une session par ID
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const session = await prisma.session.findUnique({
    where: { id },
    include: { appels: { orderBy: { ordre: 'asc' } } },
  })
  if (!session) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
  return NextResponse.json({
    ...session,
    agenceQueue: safeParseQueue(session.agenceQueue),
  })
}
