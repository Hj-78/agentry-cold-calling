export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Sessions d'aujourd'hui (UTC — le cron tourne à 19h UTC = 21h Paris CEST)
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setUTCHours(23, 59, 59, 999)

    const sessions = await prisma.session.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
      include: { appels: true },
      orderBy: { createdAt: 'asc' },
    })

    const dateStr = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Europe/Paris',
    })

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json({ ok: true, skipped: 'no RESEND_API_KEY' })
    }

    const resend = new Resend(resendKey)

    // Pas de session aujourd'hui
    if (sessions.length === 0) {
      await resend.emails.send({
        from: 'Agentry <hugo@contact.agentry.fr>',
        to: 'jaltahugo78@gmail.com',
        subject: `📊 Bilan du ${dateStr} — Pas de session`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:32px;border-radius:16px">
            <h2 style="color:#6366f1;margin:0 0 8px">📊 Bilan journalier</h2>
            <p style="color:#94a3b8;margin:0 0 24px">${dateStr}</p>
            <div style="background:#1e293b;border-radius:12px;padding:24px;text-align:center">
              <div style="font-size:40px;margin-bottom:12px">😴</div>
              <div style="font-size:16px;color:#94a3b8">Pas de session de prospection aujourd'hui.</div>
            </div>
          </div>
        `,
      })
      return NextResponse.json({ ok: true, sessions: 0 })
    }

    // Agréger tous les appels de toutes les sessions du jour
    const tousAppels = sessions.flatMap(s => s.appels)
    const total = tousAppels.length

    const stats = {
      interesse:    tousAppels.filter(a => a.resultat === 'interesse').length,
      rdvPris:      tousAppels.filter(a => a.rdvPris).length,
      rappeler:     tousAppels.filter(a => a.resultat === 'rappeler').length,
      pasInteresse: tousAppels.filter(a => a.resultat === 'pas_interesse').length,
      pasRepondu:   tousAppels.filter(a => a.resultat === 'pas_repondu').length,
      pitches:      tousAppels.filter(a => a.aPitche).length,
    }

    const repondu = total - stats.pasRepondu
    const tauxReponse = total > 0 ? Math.round((repondu / total) * 100) : 0
    const tauxPitch = repondu > 0 ? Math.round((stats.pitches / repondu) * 100) : 0
    const dureeTotal = sessions.reduce((acc, s) => acc + (s.duree || 0), 0)
    const dureeMin = Math.round(dureeTotal / 60)

    // Bloc détail par session (si plusieurs sessions)
    const sessionBlocs = sessions.map((s, i) => {
      const appels = s.appels
      const sTotal = appels.length
      const sPasRepondu = appels.filter(a => a.resultat === 'pas_repondu').length
      const sRepondu = sTotal - sPasRepondu
      const sTaux = sTotal > 0 ? Math.round((sRepondu / sTotal) * 100) : 0
      const sInteresse = appels.filter(a => a.resultat === 'interesse').length
      const sRdv = appels.filter(a => a.rdvPris).length
      const sRappeler = appels.filter(a => a.resultat === 'rappeler').length
      const sObjectif = s.objectif
      return `
        <div style="background:#0f172a;border-radius:8px;padding:14px;margin-top:10px">
          <div style="font-size:12px;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Session ${i + 1} — ${sTotal} appels / ${sObjectif} objectif</div>
          <div style="font-size:13px;color:#94a3b8;display:flex;gap:16px;flex-wrap:wrap">
            <span>📞 Répondu : <strong style="color:#e2e8f0">${sRepondu} (${sTaux}%)</strong></span>
            <span>✓ Intéressé : <strong style="color:#4ade80">${sInteresse}</strong></span>
            ${sRdv > 0 ? `<span>📅 RDV : <strong style="color:#818cf8">${sRdv}</strong></span>` : ''}
            ${sRappeler > 0 ? `<span>↩ Rappeler : <strong style="color:#fbbf24">${sRappeler}</strong></span>` : ''}
          </div>
        </div>
      `
    }).join('')

    const html = `
      <div style="font-family:sans-serif;max-width:540px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:32px;border-radius:16px">
        <h2 style="color:#6366f1;margin:0 0 4px">📊 Bilan journalier</h2>
        <p style="color:#94a3b8;margin:0 0 28px;font-size:14px">${dateStr}</p>

        <!-- Chiffre principal -->
        <div style="background:#1e293b;border-radius:12px;padding:24px;margin-bottom:16px;text-align:center">
          <div style="font-size:52px;font-weight:800;color:#fff;line-height:1">${total}</div>
          <div style="font-size:14px;color:#64748b;margin-top:4px">appels passés${dureeMin > 0 ? ` · ${dureeMin} min` : ''}</div>
        </div>

        <!-- Stats -->
        <div style="background:#1e293b;border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="font-size:12px;color:#64748b;margin-bottom:14px;text-transform:uppercase;letter-spacing:.05em">Résultats</div>
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:6px 0;color:#94a3b8;font-size:14px">📞 Taux de réponse</td>
              <td style="text-align:right;font-weight:700;color:#fff;font-size:16px">${tauxReponse}%</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#94a3b8;font-size:14px">💬 Taux de pitch</td>
              <td style="text-align:right;font-weight:700;color:#fff;font-size:16px">${tauxPitch}%</td>
            </tr>
            <tr><td colspan="2" style="padding:4px 0"><hr style="border:none;border-top:1px solid #334155;margin:4px 0"/></td></tr>
            ${stats.rdvPris > 0 ? `
            <tr>
              <td style="padding:6px 0;color:#94a3b8;font-size:14px">📅 RDV pris</td>
              <td style="text-align:right;font-weight:700;color:#818cf8;font-size:16px">${stats.rdvPris}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:6px 0;color:#94a3b8;font-size:14px">✓ Intéressés</td>
              <td style="text-align:right;font-weight:700;color:#4ade80;font-size:16px">${stats.interesse}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#94a3b8;font-size:14px">↩ À rappeler</td>
              <td style="text-align:right;font-weight:700;color:#fbbf24;font-size:16px">${stats.rappeler}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#94a3b8;font-size:14px">✕ Pas intéressés</td>
              <td style="text-align:right;font-weight:700;color:#f87171;font-size:16px">${stats.pasInteresse}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#94a3b8;font-size:14px">📵 Pas répondu</td>
              <td style="text-align:right;font-weight:700;color:#475569;font-size:16px">${stats.pasRepondu}</td>
            </tr>
          </table>
        </div>

        ${sessions.length > 1 ? `
        <!-- Détail sessions -->
        <div style="background:#1e293b;border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="font-size:12px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Détail des ${sessions.length} sessions</div>
          ${sessionBlocs}
        </div>` : ''}

        ${stats.rdvPris > 0 ? `
        <div style="background:#312e81;border-radius:12px;padding:16px;text-align:center;margin-bottom:16px">
          <div style="font-size:24px;margin-bottom:4px">🎉</div>
          <div style="font-weight:700;color:#c7d2fe;font-size:16px">${stats.rdvPris} RDV pris aujourd'hui !</div>
        </div>` : ''}

        <p style="color:#334155;font-size:12px;margin:0;text-align:center">Agentry · Rapport automatique quotidien</p>
      </div>
    `

    await resend.emails.send({
      from: 'Agentry <hugo@contact.agentry.fr>',
      to: 'jaltahugo78@gmail.com',
      subject: `📊 ${dateStr} — ${total} appels · ${tauxReponse}% réponse${stats.rdvPris > 0 ? ` · 🎉 ${stats.rdvPris} RDV` : ''}`,
      html,
    })

    return NextResponse.json({
      ok: true,
      sessions: sessions.length,
      totalAppels: total,
      tauxReponse,
      rdvPris: stats.rdvPris,
    })
  } catch (err) {
    console.error('[CRON RAPPORT]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
