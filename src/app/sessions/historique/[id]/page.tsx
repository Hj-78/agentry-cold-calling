'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Session } from '@/lib/types'

const RESULTATS: Record<string, { label: string; color: string; bg: string }> = {
  interesse: { label: 'Intéressé', color: 'text-green-300', bg: 'bg-green-900/20 border-green-700/40' },
  rappeler: { label: 'À rappeler', color: 'text-amber-300', bg: 'bg-amber-900/20 border-amber-700/40' },
  pas_repondu: { label: 'Pas répondu', color: 'text-slate-400', bg: 'bg-slate-800/50 border-slate-700/40' },
  messagerie: { label: 'Messagerie', color: 'text-blue-300', bg: 'bg-blue-900/20 border-blue-700/40' },
  absent: { label: 'Messagerie', color: 'text-blue-300', bg: 'bg-blue-900/20 border-blue-700/40' },
  pas_interesse: { label: 'Pas intéressé', color: 'text-red-300', bg: 'bg-red-900/20 border-red-700/40' },
}

function formatHeure(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatDateLong(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    + ' à '
    + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatDuree(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m}m${String(sec).padStart(2, '0')}s`
}

export default function SessionDetailPage() {
  const params = useParams()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!params?.id) return
    fetch(`/api/sessions/${params.id}`)
      .then(r => r.json())
      .then(data => { setSession(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params?.id])

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-slate-500 text-lg">Chargement…</div>
    </div>
  )

  if (!session || session.status === undefined) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <p className="text-slate-500 mb-4">Session introuvable</p>
        <Link href="/sessions/historique" className="text-indigo-400 hover:text-indigo-300 text-sm transition">
          ← Retour historique
        </Link>
      </div>
    </div>
  )

  const appels = session.appels || []
  const interesses = appels.filter(a => a.resultat === 'interesse').length
  const pasInteresses = appels.filter(a => a.resultat === 'pas_interesse').length
  const aRappeler = appels.filter(a => a.resultat === 'rappeler').length
  const pasRepondu = appels.filter(a => a.resultat === 'pas_repondu').length
  const messagerie = appels.filter(a => a.resultat === 'messagerie' || a.resultat === 'absent').length
  const rdvs = appels.filter(a => a.rdvPris).length

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-14">

      {/* Header */}
      <div className="mb-6">
        <Link href="/sessions/historique" className="text-slate-500 hover:text-white transition text-sm inline-flex items-center gap-1 mb-4">
          ← Historique
        </Link>
        <h1 className="text-2xl font-bold text-white capitalize">{formatDateLong(session.date)}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {session.duree ? formatDuree(session.duree) + ' · ' : ''}
          {appels.length} appel{appels.length > 1 ? 's' : ''}
        </p>
      </div>

      {/* Stats résumé */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
        {[
          { label: 'Intéressé', val: interesses, color: 'text-green-400' },
          { label: 'Pas intéressé', val: pasInteresses, color: 'text-red-400' },
          { label: 'À rappeler', val: aRappeler, color: 'text-amber-400' },
          { label: 'Pas répondu', val: pasRepondu, color: 'text-slate-400' },
          { label: 'Messagerie', val: messagerie, color: 'text-blue-400' },
          { label: 'RDV pris', val: rdvs, color: 'text-yellow-400' },
        ].map(item => (
          <div key={item.label} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className={`text-2xl font-bold tabular-nums ${item.color}`}>{item.val}</span>
            <span className="text-slate-500 text-xs leading-tight">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Résumé IA */}
      {session.resume && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
          <div className="text-purple-400 text-xs font-semibold uppercase tracking-wide mb-2">✨ Résumé IA</div>
          <p className="text-slate-300 text-sm leading-relaxed">{session.resume}</p>
        </div>
      )}

      {/* Liste des appels */}
      <div>
        <div className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">
          {appels.length} appel{appels.length > 1 ? 's' : ''} — dans l&apos;ordre
        </div>
        <div className="space-y-2">
          {appels.map(appel => {
            const res = RESULTATS[appel.resultat || '']
            return (
              <div key={appel.id} className={`border rounded-2xl px-4 py-3 ${res?.bg || 'bg-slate-900 border-slate-800'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-slate-600 text-xs font-mono flex-shrink-0">#{appel.ordre}</span>
                      <span className="text-white font-semibold truncate">{appel.agenceNom || '—'}</span>
                    </div>
                    {appel.agenceTel && (
                      <div className="text-slate-500 text-xs font-mono mt-0.5">{appel.agenceTel}</div>
                    )}
                    {appel.noteRapide && (
                      <div className="text-slate-400 text-xs mt-1.5 italic bg-slate-800/50 rounded-lg px-2 py-1">{appel.noteRapide}</div>
                    )}
                    {appel.rdvPris && (
                      <div className="text-yellow-400 text-xs mt-1 font-semibold">
                        📅 RDV{appel.rdvDate ? ` le ${appel.rdvDate}` : ''}{appel.rdvHeure ? ` à ${appel.rdvHeure}` : ''}
                      </div>
                    )}
                    {appel.aPitche && (
                      <div className="text-purple-400 text-xs mt-0.5">🎙 Pitché</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {res ? (
                      <span className={`text-xs font-semibold ${res.color}`}>{res.label}</span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                    <span className="text-slate-700 text-xs">{formatHeure(appel.createdAt)}</span>
                    {appel.duree ? (
                      <span className="text-slate-700 text-xs">{formatDuree(appel.duree)}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
