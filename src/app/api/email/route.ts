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

  // Fallback to Gmail env vars if DB not configured
  const smtpHost = cfg.SMTP_HOST || 'smtp.gmail.com'
  const smtpPort = parseInt(cfg.SMTP_PORT || '587')
  const smtpUser = cfg.SMTP_USER || process.env.GMAIL_USER || ''
  const smtpPass = cfg.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || ''
  const smtpFrom = cfg.SMTP_FROM || smtpUser

  if (!smtpUser || !smtpPass) {
    return NextResponse.json({ error: 'SMTP non configuré. Configure ton email dans Paramètres.' }, { status: 400 })
  }

  // Use Gmail service shorthand when host is Gmail (handles TLS correctly on Railway)
  const transportConfig = smtpHost === 'smtp.gmail.com'
    ? { service: 'gmail', auth: { user: smtpUser, pass: smtpPass } }
    : { host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: smtpUser, pass: smtpPass } }

  const transporter = nodemailer.createTransport(transportConfig)

  try {
    await transporter.sendMail({
      from: smtpFrom.includes('<') ? smtpFrom : `Hugo - Agentry <${smtpFrom}>`,
      to,
      subject,
      html,
    })
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
