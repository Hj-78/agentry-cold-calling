export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

export async function POST(req: Request) {
  const body = await req.json()
  const { to, subject, html } = body

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

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
