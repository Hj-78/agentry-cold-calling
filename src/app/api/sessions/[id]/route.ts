export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import nodemailer from 'nodemailer'
import { DEFAULT_TEMPLATES } from '@/lib/email-templates'

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
    if (body.rdvPris && body.agenceEmail && body.rdvDate && body.rdvHeure) {
      try {
        const smtpParams = await prisma.parametre.findMany({
          where: { cle: { in: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'GOOGLE_REFRESH_TOKEN'] } },
        })
        const smtp: Record<string, string> = {}
        smtpParams.forEach(p => { smtp[p.cle] = p.valeur })

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

        // Formater la date du RDV en français
        const rdvDateFr = new Date(body.rdvDate).toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        })

        // 1. Créer l'événement iCloud Calendar
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
        const meetLink = ''

        // 2. Envoyer l'email de confirmation avec le lien Meet
        if (smtp.SMTP_HOST && smtp.SMTP_USER && smtp.SMTP_PASS) {
          let templates = DEFAULT_TEMPLATES
          const tmplParam = await prisma.parametre.findUnique({ where: { cle: 'EMAIL_TEMPLATES' } })
          if (tmplParam) {
            try { templates = JSON.parse(tmplParam.valeur) } catch { /* utiliser défaut */ }
          }

          const tmpl = templates.find(t => t.id === 'rdv-confirmation') || DEFAULT_TEMPLATES.find(t => t.id === 'rdv-confirmation')
          if (tmpl) {
            const expediteur = smtp.SMTP_FROM || smtp.SMTP_USER
            const vars: Record<string, string> = {
              agence: body.agenceNom || '',
              expediteur,
              rdvDate: rdvDateFr,
              rdvHeure: body.rdvHeure,
              resumeAppel,
              meetLink: meetLink
                ? `<p style="margin:16px 0"><a href="${meetLink}" style="display:inline-block;background:#1a73e8;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">🎥 Rejoindre le Google Meet</a><br><span style="color:#94a3b8;font-size:11px;margin-top:6px;display:block">${meetLink}</span></p>`
                : '',
            }
            const apply = (s: string) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v), s)
            const sujet = apply(tmpl.sujet)
            const corps = apply(tmpl.corps)

            const transporter = nodemailer.createTransport({
              host: smtp.SMTP_HOST,
              port: parseInt(smtp.SMTP_PORT || '587'),
              secure: parseInt(smtp.SMTP_PORT || '587') === 465,
              auth: { user: smtp.SMTP_USER, pass: smtp.SMTP_PASS },
            })

            await transporter.sendMail({
              from: `Agentry <${expediteur}>`,
              to: body.agenceEmail,
              subject: sujet,
              html: corps,
            })
          }
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

    return NextResponse.json({ ...updated, agenceQueue: session.agenceQueue ? JSON.parse(session.agenceQueue) : null })
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
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
    agenceQueue: session.agenceQueue ? JSON.parse(session.agenceQueue) : null,
  })
}
