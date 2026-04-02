export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

export async function POST(req: Request) {
  try {
    const { to, sujet, corps } = await req.json()

    if (!to || !sujet || !corps) {
      return NextResponse.json({ error: 'Champs manquants (to, sujet, corps)' }, { status: 400 })
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return NextResponse.json({ error: 'GMAIL_USER ou GMAIL_APP_PASSWORD non configuré' }, { status: 500 })
    }

    await transporter.sendMail({
      from: `Hugo - Agentry <${process.env.GMAIL_USER}>`,
      to,
      subject: sujet,
      html: corps,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
