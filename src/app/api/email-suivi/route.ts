export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import nodemailer from 'nodemailer'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: Request) {
  try {
    const { agenceNom, agenceEmail, noteRapide, agentPrenom } = await req.json()

    if (!agenceEmail) {
      return NextResponse.json({ error: 'Email agence manquant' }, { status: 400 })
    }

    // Récupère config SMTP
    const params = await prisma.parametre.findMany({
      where: { cle: { in: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'ANTHROPIC_API_KEY'] } },
    })
    const cfg: Record<string, string> = {}
    params.forEach(p => { cfg[p.cle] = p.valeur })

    if (!cfg.SMTP_HOST || !cfg.SMTP_USER || !cfg.SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP non configuré dans Paramètres.' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || cfg.ANTHROPIC_API_KEY

    // Valeurs par défaut (fallback si Claude indisponible)
    let emailSubject = `Suite à notre échange — ${agenceNom}`
    let emailHtml = `
      <p>Bonjour,</p>
      <p>Merci pour notre échange de tout à l'heure.</p>
      <p>Comme évoqué, notre système prospecte LeBonCoin à votre place : il détecte les nouvelles annonces, contacte les vendeurs automatiquement, et vos agents reçoivent juste les contacts qualifiés.</p>
      <p>On vous propose <strong>7 jours d'essai gratuits</strong> pour tester ça sur votre secteur. Seriez-vous disponible 10 minutes cette semaine pour une démo ?</p>
      <p>Cordialement,<br>${agentPrenom || 'L\'équipe Agentry'}</p>
    `

    // Tente de générer un email personnalisé avec Claude
    if (apiKey) {
      try {
        const client = new Anthropic({ apiKey })
        const msg = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Tu es un commercial expert en prospection immobilière. Rédige un email de suivi court et percutant après un appel de prospection.

Agence contactée : ${agenceNom}
${noteRapide ? `Note de l'appel : ${noteRapide}` : ''}
Commercial : ${agentPrenom || 'Notre équipe'}
Produit : Système automatisé de prospection LeBonCoin — 7 jours gratuits

Critères :
- Objet accrocheur en 8 mots max
- Corps : 3-4 phrases max, ton direct et humain
- Rappelle le bénéfice clé : vos agents n'ont plus à toucher LeBonCoin
- CTA : proposer un créneau de démo de 10 minutes
- Signature : ${agentPrenom || 'L\'équipe Agentry'}

Réponds UNIQUEMENT avec un JSON valide :
{"subject": "...", "html": "..."}`
          }],
        })

        const content = msg.content[0]
        if (content.type === 'text') {
          const cleaned = content.text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
          const parsed = JSON.parse(cleaned)
          emailSubject = parsed.subject
          emailHtml = parsed.html
        }
      } catch {
        // Garde le template par défaut si Claude échoue (crédits insuffisants, etc.)
      }
    }

    // Envoie l'email
    const transporter = nodemailer.createTransport({
      host: cfg.SMTP_HOST,
      port: parseInt(cfg.SMTP_PORT || '587'),
      secure: cfg.SMTP_PORT === '465',
      auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS },
    })

    await transporter.sendMail({
      from: cfg.SMTP_FROM || cfg.SMTP_USER,
      to: agenceEmail,
      subject: emailSubject,
      html: emailHtml,
    })

    return NextResponse.json({ ok: true, subject: emailSubject })
  } catch (e) {
    console.error('Email suivi error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
