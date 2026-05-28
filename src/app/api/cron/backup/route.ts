export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

export async function GET(req: Request) {
  // Vérification sécurité : Vercel Cron envoie ce header
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Export complet des agences
    const agences = await prisma.agence.findMany({ orderBy: { ville: 'asc' } })

    // 2. Sessions des 30 derniers jours
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const sessions = await prisma.session.findMany({
      where: { createdAt: { gte: since } },
      include: { appels: { orderBy: { ordre: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    })

    const snapshot = {
      backupAt: new Date().toISOString(),
      totalAgences: agences.length,
      agences,
      sessions30j: sessions.length,
      sessions,
    }

    const json = JSON.stringify(snapshot, null, 2)

    // 3. Stocker le snapshot dans la DB (Parametre) comme filet de sécurité
    await prisma.parametre.upsert({
      where: { cle: 'last_backup_json' },
      update: { valeur: json },
      create: { cle: 'last_backup_json', valeur: json },
    })
    await prisma.parametre.upsert({
      where: { cle: 'last_backup_at' },
      update: { valeur: new Date().toISOString() },
      create: { cle: 'last_backup_at', valeur: new Date().toISOString() },
    })

    // 4. Envoyer l'email avec le JSON en pièce jointe
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const resend = new Resend(resendKey)
      const dateStr = new Date().toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      const stats = {
        nouveau: agences.filter(a => a.statut === 'nouveau').length,
        interesse: agences.filter(a => a.statut === 'interesse').length,
        rappeler: agences.filter(a => a.statut === 'rappeler').length,
        appele: agences.filter(a => a.statut === 'appele').length,
        refuse: agences.filter(a => a.statut === 'refuse').length,
      }

      await resend.emails.send({
        from: 'Agentry Backup <hugo@contact.agentry.fr>',
        to: 'jaltahugo78@gmail.com',
        subject: `💾 Backup Agentry — ${dateStr}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:32px;border-radius:16px">
            <h2 style="color:#6366f1;margin:0 0 8px">💾 Backup quotidien Agentry</h2>
            <p style="color:#94a3b8;margin:0 0 24px">${dateStr}</p>

            <div style="background:#1e293b;border-radius:12px;padding:20px;margin-bottom:24px">
              <div style="font-size:13px;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em">Base de données</div>
              <div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:16px">${agences.length} agences</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
                <div style="color:#94a3b8">🟢 Nouveau : <strong style="color:#e2e8f0">${stats.nouveau}</strong></div>
                <div style="color:#94a3b8">✓ Intéressé : <strong style="color:#4ade80">${stats.interesse}</strong></div>
                <div style="color:#94a3b8">↩ À rappeler : <strong style="color:#fbbf24">${stats.rappeler}</strong></div>
                <div style="color:#94a3b8">📞 Appelé : <strong style="color:#e2e8f0">${stats.appele}</strong></div>
                <div style="color:#94a3b8">✕ Refusé : <strong style="color:#f87171">${stats.refuse}</strong></div>
              </div>
            </div>

            <div style="background:#1e293b;border-radius:12px;padding:20px;margin-bottom:24px">
              <div style="font-size:13px;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Sessions (30 derniers jours)</div>
              <div style="font-size:22px;font-weight:700;color:#fff">${sessions.length} sessions</div>
            </div>

            <p style="color:#475569;font-size:12px;margin:0">
              Le fichier JSON complet est en pièce jointe. Conserve ces emails — ils sont ta sauvegarde.
            </p>
          </div>
        `,
        attachments: [{
          filename: `agentry-backup-${new Date().toISOString().split('T')[0]}.json`,
          content: Buffer.from(json).toString('base64'),
        }],
      })
    }

    return NextResponse.json({
      ok: true,
      agences: agences.length,
      sessions: sessions.length,
      backupAt: snapshot.backupAt,
    })
  } catch (err) {
    console.error('[CRON BACKUP]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
