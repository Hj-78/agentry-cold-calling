'use client'

import { useState, useEffect } from 'react'
import PowerDialer from '@/components/sessions/PowerDialer'
import type { Session } from '@/lib/types'

const RESULTATS: Record<string, { label: string; color: string }> = {
  interesse: { label: 'Intéressé', color: 'bg-green-800 text-green-200' },
  rappeler: { label: 'À rappeler', color: 'bg-amber-800 text-amber-200' },
  messagerie: { label: 'Messagerie / Absent', color: 'bg-blue-800 text-blue-200' },
  absent: { label: 'Messagerie / Absent', color: 'bg-blue-800 text-blue-200' },
  pas_interesse: { label: 'Pas intéressé', color: 'bg-red-900 text-red-300' },
}

function formatTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  return `${m}m${String(sec).padStart(2, '0')}s`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [launching, setLaunching] = useState(false)
  const [objectif, setObjectif] = useState(50)
  const [disponibles, setDisponibles] = useState<number | null>(null)
  const OBJECTIF_MIN = 50

  const fetchData = async () => {
    const [listRes, activeRes, agencesRes] = await Promise.all([
      fetch('/api/sessions'),
      fetch('/api/sessions/active'),
      fetch('/api/agences?statut=nouveau&count=1'),
    ])
    const list = await listRes.json()
    const active = await activeRes.json()
    const agencesData = await agencesRes.json().catch(() => null)
    setSessions(Array.isArray(list) ? list.filter((s: Session) => s.status === 'ended') : [])
    setActiveSession(active)
    if (agencesData && typeof agencesData.total === 'number') setDisponibles(agencesData.total)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const launchSession = async () => {
    setLaunching(true)
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectif }),
    })
    const session = await res.json()
    if (!session.agenceQueue || session.agenceQueue.length === 0) {
      setDisponibles(0)
      setLaunching(false)
      return
    }
    setActiveSession(session)
    setLaunching(false)
  }

  const handleSessionEnd = (endedSession: Session) => {
    setActiveSession(null)
    setSessions(prev => [endedSession, ...prev])
    setExpandedId(endedSession.id)
  }

  const copyResume = (session: Session) => {
    const lines = [
      `Session du ${formatDate(session.date)}`,
      `Durée : ${session.duree ? formatTime(session.duree) : 'N/A'}`,
      `Appels : ${session.totalAppels}/${session.objectif}`,
      '',
    ]
    if (session.resume) lines.push(session.resume, '')
    session.appels.forEach(a => {
      lines.push(`#${a.ordre} ${a.agenceNom || 'Agence'}${a.agenceTel ? ` — ${a.agenceTel}` : ''} → ${RESULTATS[a.resultat || '']?.label || ''}`)
      if (a.prochaineAction) lines.push(`  → ${a.prochaineAction}`)
    })
    navigator.clipboard.writeText(lines.join('\n'))
  }

  if (activeSession) {
    return <PowerDialer session={activeSession} onEnd={handleSessionEnd} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-500 text-lg">Chargement…</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 md:py-14">

      {/* Header */}
      <div className="mb-10">
        <p className="text-slate-500 text-base mb-1">{sessions.length} session{sessions.length > 1 ? 's' : ''} passée{sessions.length > 1 ? 's' : ''}</p>
        <h1 className="text-3xl font-bold text-white">Sessions</h1>
      </div>

      {/* Lancer une session */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8">
        <h2 className="text-white font-semibold text-xl mb-1">Lancer une session</h2>
        <p className="text-slate-500 text-sm mb-8">Transcription automatique · Analyse IA · Résumé de fin de session</p>

        <div className="flex items-center gap-5 mb-8">
          <div>
            <label className="text-slate-400 text-sm block mb-2">Objectif d&apos;appels</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={OBJECTIF_MIN}
                max={500}
                value={objectif}
                onChange={e => {
                  const val = parseInt(e.target.value) || OBJECTIF_MIN
                  setObjectif(Math.max(OBJECTIF_MIN, val))
                }}
                onBlur={e => {
                  const val = parseInt(e.target.value) || OBJECTIF_MIN
                  if (val < OBJECTIF_MIN) setObjectif(OBJECTIF_MIN)
                }}
                className="w-28 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-xl font-bold text-center"
              />
              <span className="text-slate-500 text-base">appels</span>
            </div>
            {objectif > OBJECTIF_MIN && (
              <p className="text-indigo-400 text-xs mt-1">+{objectif - OBJECTIF_MIN} au-delà du minimum</p>
            )}
            <p className="text-slate-600 text-xs mt-1">Minimum : {OBJECTIF_MIN} appels</p>
          </div>
        </div>

        {disponibles === 0 && (
          <div className="mb-4 bg-amber-950/60 border border-amber-700/50 rounded-xl px-4 py-3 text-amber-300 text-sm">
            ⚠️ Aucune agence disponible — toutes ont été appelées ou il n&apos;y a pas d&apos;agences avec un numéro.<br />
            <span className="text-amber-500 text-xs">Va dans <strong>Agences</strong> pour en importer de nouvelles.</span>
          </div>
        )}
        {disponibles !== null && disponibles > 0 && (
          <p className="text-slate-500 text-xs mb-3 text-center">{disponibles} agence{disponibles > 1 ? 's' : ''} disponible{disponibles > 1 ? 's' : ''}</p>
        )}
        <button
          onClick={launchSession}
          disabled={launching || disponibles === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-5 rounded-2xl font-bold text-xl transition active:scale-98 shadow-2xl shadow-indigo-900/50"
        >
          {launching ? 'Démarrage…' : '▶ Lancer la session'}
        </button>
      </div>

      {/* Historique */}
      {sessions.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-slate-500 text-lg">Aucune session terminée</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-slate-400 text-sm font-medium uppercase tracking-widest mb-6">Historique</h2>
          {sessions.map(session => {
            const pct = session.objectif > 0
              ? Math.min(100, Math.round((session.totalAppels / session.objectif) * 100))
              : 0
            const isExpanded = expandedId === session.id
            const interesses = session.appels.filter(a => a.resultat === 'interesse').length
            const aRappeler = session.appels.filter(a => a.resultat === 'rappeler').length
            const rdvs = session.appels.filter(a => a.rdvPris).length
            const pitches = session.appels.filter(a => a.aPitche).length

            return (
              <div key={session.id} className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                  className="w-full text-left px-8 py-7"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-white font-semibold text-lg capitalize">{formatDate(session.date)}</div>
                      <div className="text-slate-500 text-sm mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <span>{session.duree ? formatTime(session.duree) : '—'}</span>
                        <span>{session.totalAppels} appel{session.totalAppels > 1 ? 's' : ''}</span>
                        {pitches > 0 && <span className="text-purple-400">🎙 {pitches} pitché{pitches > 1 ? 's' : ''}</span>}
                        {interesses > 0 && <span className="text-green-400">✓ {interesses} intéressé{interesses > 1 ? 's' : ''}</span>}
                        {rdvs > 0 && <span className="text-yellow-400 font-semibold">📅 {rdvs} RDV</span>}
                        {aRappeler > 0 && <span className="text-amber-400">{aRappeler} à rappeler</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${pct >= 100 ? 'text-green-400' : 'text-indigo-400'}`}>
                        {pct}%
                      </span>
                      <span className="text-slate-600">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-800">
                    {session.resume && (
                      <div className="px-8 py-6 border-b border-slate-800">
                        <div className="text-purple-400 text-xs font-semibold uppercase tracking-wide mb-3">✨ Résumé IA</div>
                        <p className="text-slate-300 text-sm leading-relaxed">{session.resume}</p>
                        <button
                          onClick={() => copyResume(session)}
                          className="mt-4 text-slate-500 hover:text-slate-300 text-xs transition"
                        >
                          📋 Copier le résumé complet
                        </button>
                      </div>
                    )}

                    <div className="px-8 py-6 space-y-3">
                      {session.appels.map(appel => {
                        const res = RESULTATS[appel.resultat || '']
                        return (
                          <div key={appel.id} className="bg-slate-800 rounded-2xl px-5 py-4">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-slate-600 text-xs font-mono flex-shrink-0">#{appel.ordre}</span>
                                <span className="text-white text-sm font-medium truncate">
                                  {appel.agenceNom || 'Agence inconnue'}
                                </span>
                              </div>
                              {res && (
                                <span className={`text-xs px-2.5 py-1 rounded-full flex-shrink-0 font-medium ${res.color}`}>
                                  {res.label}
                                </span>
                              )}
                            </div>
                            {appel.agenceTel && <div className="text-slate-500 text-xs mb-2">{appel.agenceTel}</div>}
                            <div className="flex gap-2 flex-wrap mb-2">
                              {appel.aPitche && <span className="bg-purple-900/50 text-purple-300 text-xs px-2 py-0.5 rounded-full">🎙 Pitché</span>}
                              {appel.rdvPris && <span className="bg-green-900/50 text-green-300 text-xs px-2 py-0.5 rounded-full">📅 RDV pris</span>}
                              {appel.noteRapide && <span className="text-slate-400 text-xs italic">{appel.noteRapide}</span>}
                            </div>
                            {appel.resume && <p className="text-slate-400 text-sm leading-relaxed">{appel.resume}</p>}
                            {appel.prochaineAction && (
                              <p className="text-amber-400 text-sm mt-2">→ {appel.prochaineAction}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
