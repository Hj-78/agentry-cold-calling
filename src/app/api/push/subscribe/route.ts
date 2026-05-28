export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST: enregistre (ou met à jour) la subscription push du téléphone
export async function POST(req: Request) {
  try {
    const subscription = await req.json()
    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'Subscription invalide' }, { status: 400 })
    }

    await prisma.parametre.upsert({
      where: { cle: 'push_subscription' },
      update: { valeur: JSON.stringify(subscription) },
      create: { cle: 'push_subscription', valeur: JSON.stringify(subscription) },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PUSH SUBSCRIBE]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE: supprime la subscription (désabonnement)
export async function DELETE() {
  await prisma.parametre.deleteMany({ where: { cle: 'push_subscription' } })
  return NextResponse.json({ ok: true })
}
