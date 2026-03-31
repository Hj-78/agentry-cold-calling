export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import nodemailer from 'nodemailer'

export async function POST(req: Request) {
  const body = await req.json()
  const { to, subject, html } = body

  if (!to || !subject || !html) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  // Load SMTP config from params
  const params = await prisma.parametre.findMany({
    where: { cle: { in: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] } },
  })
  const cfg: Record<string, string> = {}
  params.forEach(p => { cfg[p.cle] = p.valeur })

  if (!cfg.SMTP_HOST || !cfg.SMTP_USER || !cfg.SMTP_PASS) {
    return NextResponse.json({ error: 'SMTP non configuré. Configure ton email dans Paramètres.' }, { status: 400 })
  }

  const transporter = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: parseInt(cfg.SMTP_PORT || '587'),
    secure: cfg.SMTP_PORT === '465',
    auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS },
  })

  await transporter.sendMail({
    from: cfg.SMTP_FROM || cfg.SMTP_USER,
    to,
    subject,
    html,
  })

  return NextResponse.json({ ok: true })
}
