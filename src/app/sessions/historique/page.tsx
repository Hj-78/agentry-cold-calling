'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Session } from '@/lib/types'

function formatDuree(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m}m${String(sec).padStart(2, '0')}s`
}

function formatDateHeure(dateStr: string) {
  const d = new Date(dateStr)
  const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return { date, heure }
}

export default function HistoriquePage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => {
        setSessions(Array.isArray(data) ? data.filter((s: Session) => s.status === 'ended') : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-slate-500 text-lg">Chargement…</div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 md:py-14">

      {/* Header */}
      <div className="mb-8">
        <Link href="/sessions" className="text-slate-500 hover:text-white transition text-sm inline-flex items-center gap-1 mb-4">
          ← Retour Sessions
        </Link>
        <h1 className="text-3xl font-bold text-white">Historique des sessions</h1>
        <p className="text-slate-500 text-sm mt-1">
          {sessions.length} session{sessions.length > 1 ? 's' : ''} terminée{sessions.length > 1 ? 's' : ''}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-slate-500 text-lg">Aucune session terminée</p>
          <Link href="/sessions" className="inline-block mt-4 text-indigo-400 hover:text-indigo-300 text-sm transition">
            Lancer une session →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => {
            const appels = session.appels || []
            const { date, heure } = formatDateHeure(session.date)
            const interesses = appels.filter(a => a.resultat === 'interesse').length
            const pasInteresses = appels.filter(a => a.resultat === 'pas_interesse').length
            const aRappeler = appels.filter(a => a.resultat === 'rappeler').length
            const pasRepondu = appels.filter(a => a.resultat === 'pas_repondu').length
            const messagerie = appels.filter(a => a.resultat === 'messagerie' || a.resultat === 'absent').length
            const rdvs = appels.filter(a => a.rdvPris).length

            return (
              <div key={session.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">

                {/* En-tête session */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-white font-semibold capitalize">{date}</div>
                    <div className="text-slate-500 text-sm mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="text-indigo-400 font-mono">{heure}</span>
                      {session.duree ? <span>{formatDuree(session.duree)}</span> : null}
                      <span>{appels.length} appel{appels.length > 1 ? 's' : ''}</span>
                      {rdvs > 0 && <span className="text-yellow-400 font-semibold">📅 {rdvs} RDV</span>}
                    </div>
                  </div>
                  <Link
                    href={`/sessions/historique/${session.id}`}
                    className="bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition flex-shrink-0"
                  >
                    Détail →
                  </Link>
                </div>

                {/* Qualifications */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: 'Intéressé', val: interesses, color: 'text-green-400' },
                    { label: 'Pas intéressé', val: pasInteresses, color: 'text-red-400' },
                    { label: 'À rappeler', val: aRappeler, color: 'text-amber-400' },
                    { label: 'Pas répondu', val: pasRepondu, color: 'text-slate-400' },
                    { label: 'Messagerie', val: messagerie, color: 'text-blue-400' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 bg-slate-800/50 rounded-xl px-3 py-2">
                      <span className={`font-bold tabular-nums text-lg ${item.color}`}>{item.val}</span>
                      <span className="text-slate-500 text-xs leading-tight">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
