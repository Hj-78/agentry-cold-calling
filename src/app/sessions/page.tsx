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

interface CityCount { ville: string | null; count: number }

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [launching, setLaunching] = useState(false)
  const [objectif, setObjectif] = useState(50)
  const [disponibles, setDisponibles] = useState<number | null>(null)
  const [villes, setVilles] = useState<CityCount[]>([])
  const [villesChoisies, setVillesChoisies] = useState<string[]>([]) // [] = toutes
  const [deletingVille, setDeletingVille] = useState<string | null>(null)
  const [confirmDeleteVille, setConfirmDeleteVille] = useState<string | null>(null)
  const OBJECTIF_MIN = 10

  const fetchData = async () => {
    const [listRes, activeRes, agencesRes, villesRes] = await Promise.all([
      fetch('/api/sessions'),
      fetch('/api/sessions/active'),
      fetch('/api/agences?statut=nouveau&count=1'),
      fetch('/api/agences?cities=1'),
    ])
    const list = await listRes.json()
    const active = await activeRes.json()
    const agencesData = await agencesRes.json().catch(() => null)
    const villesData = await villesRes.json().catch(() => [])
    setSessions(Array.isArray(list) ? list.filter((s: Session) => s.status === 'ended') : [])
    setActiveSession(active)
    if (agencesData && typeof agencesData.total === 'number') setDisponibles(agencesData.total)
    if (Array.isArray(villesData)) setVilles(villesData)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Quand on choisit des villes, mettre à jour l'objectif au total des counts
  useEffect(() => {
    if (villesChoisies.length > 0) {
      const total = villes
        .filter(v => v.ville && villesChoisies.includes(v.ville))
        .reduce((sum, v) => sum + v.count, 0)
      setObjectif(total || 1)
    }
  }, [villesChoisies, villes])

  const toggleVille = (ville: string) => {
    setVillesChoisies(prev =>
      prev.includes(ville) ? prev.filter(v => v !== ville) : [...prev, ville]
    )
  }

  const dispoTotal = villesChoisies.length > 0
    ? villes.filter(v => v.ville && villesChoisies.includes(v.ville)).reduce((s, v) => s + v.count, 0)
    : (disponibles ?? 0)

  const launchSession = async () => {
    setLaunching(true)
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectif, villes: villesChoisies.length > 0 ? villesChoisies : null }),
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

  const deleteVille = async (ville: string) => {
    setDeletingVille(ville)
    await fetch(`/api/agences?ville=${encodeURIComponent(ville)}`, { method: 'DELETE' })
    setConfirmDeleteVille(null)
    setDeletingVille(null)
    setVillesChoisies(prev => prev.filter(v => v !== ville))
    await fetchData()
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
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-14">

      {/* Header */}
      <div className="mb-6 md:mb-10 flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-base mb-1">{sessions.length} session{sessions.length > 1 ? 's' : ''} passée{sessions.length > 1 ? 's' : ''}</p>
          <h1 className="text-3xl font-bold text-white">Sessions</h1>
        </div>
        <div className="flex gap-2 mt-1">
          <a
            href="/api/export?format=csv"
            download
            className="text-xs px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition font-medium"
          >
            ⬇ CSV
          </a>
          <a
            href="/api/export?format=json"
            download
            className="text-xs px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition font-medium"
          >
            ⬇ JSON
          </a>
        </div>
      </div>

      {/* Lancer une session */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-8 mb-6 md:mb-8">
        <h2 className="text-white font-semibold text-xl mb-1">Lancer une session</h2>
        <p className="text-slate-500 text-sm mb-6">Transcription automatique · Analyse IA · Résumé de fin de session</p>

        {/* Sélecteur de villes (multi-select) */}
        {villes.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-slate-400 text-sm">📍 Villes à appeler</label>
              {villesChoisies.length > 0 && (
                <button
                  onClick={() => { setVillesChoisies([]); setObjectif(Math.min(disponibles ?? 50, 50)) }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  Tout déselectionner
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => { setVillesChoisies([]); setObjectif(Math.min(disponibles ?? 50, 50)) }}
                className={`py-3 px-4 rounded-xl text-sm font-semibold transition border ${
                  villesChoisies.length === 0
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                }`}
              >
                <div>🌍 Toutes les villes</div>
                <div className="text-xs font-normal opacity-70 mt-0.5">{disponibles ?? '…'} agences</div>
              </button>
              {villes.map(v => {
                const selected = v.ville ? villesChoisies.includes(v.ville) : false
                return (
                  <div key={v.ville} className="relative group">
                    <button
                      onClick={() => v.ville && toggleVille(v.ville)}
                      className={`w-full py-3 pl-4 pr-10 rounded-xl text-sm font-semibold transition border text-left ${
                        selected
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {selected && <span className="text-indigo-200 text-xs">✓</span>}
                        <span className="truncate">{v.ville?.replace(/^\d{5}\s/, '') ?? '—'}</span>
                      </div>
                      <div className="text-xs font-normal opacity-70 mt-0.5">{v.count} agence{v.count > 1 ? 's' : ''}</div>
                    </button>
                    {/* Bouton supprimer */}
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDeleteVille(v.ville ?? '') }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition text-slate-600 hover:text-red-400 p-1 rounded"
                      title="Supprimer toutes les agences de cette ville"
                    >
                      🗑
                    </button>
                  </div>
                )
              })}
            </div>
            {villesChoisies.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {villesChoisies.map(v => (
                  <span key={v} className="bg-indigo-900/50 border border-indigo-700/50 text-indigo-300 text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                    {v.replace(/^\d{5}\s/, '')}
                    <button onClick={() => toggleVille(v)} className="text-indigo-400 hover:text-white ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Objectif */}
        <div className="flex items-center gap-4 mb-6">
          <div>
            <label className="text-slate-400 text-sm block mb-2">Objectif d&apos;appels</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={500}
                value={objectif}
                onChange={e => setObjectif(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-xl font-bold text-center"
              />
              <span className="text-slate-500 text-base">appels</span>
            </div>
          </div>
          {villesChoisies.length > 0 && (
            <div className="flex-1 bg-indigo-900/30 border border-indigo-700/40 rounded-xl px-4 py-3">
              <div className="text-indigo-300 text-xs font-semibold mb-0.5">{villesChoisies.length} ville{villesChoisies.length > 1 ? 's' : ''} sélectionnée{villesChoisies.length > 1 ? 's' : ''}</div>
              <div className="text-indigo-400 text-xs">{dispoTotal} agences dispo</div>
            </div>
          )}
        </div>

        {dispoTotal === 0 && (
          <div className="mb-4 bg-amber-950/60 border border-amber-700/50 rounded-xl px-4 py-3 text-amber-300 text-sm">
            ⚠️ {villesChoisies.length > 0 ? 'Toutes les agences de ces villes ont été appelées.' : 'Aucune agence disponible.'}
          </div>
        )}

        <button
          onClick={launchSession}
          disabled={launching || dispoTotal === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-5 rounded-2xl font-bold text-lg md:text-xl transition active:scale-98 shadow-2xl shadow-indigo-900/50 min-h-[56px]"
        >
          {launching ? 'Démarrage…' : villesChoisies.length > 0 ? `▶ Lancer — ${villesChoisies.length} ville${villesChoisies.length > 1 ? 's' : ''}` : '▶ Lancer la session'}
        </button>

        {/* Modal confirmation suppression ville */}
        {confirmDeleteVille && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full">
              <div className="text-2xl mb-3">🗑️</div>
              <h3 className="text-white font-bold text-lg mb-2">Supprimer la ville ?</h3>
              <p className="text-slate-400 text-sm mb-5">
                Toutes les agences de <span className="text-white font-semibold">{confirmDeleteVille.replace(/^\d{5}\s/, '')}</span> seront définitivement supprimées.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteVille(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white transition text-sm font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={() => deleteVille(confirmDeleteVille)}
                  disabled={deletingVille === confirmDeleteVille}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition disabled:opacity-50"
                >
                  {deletingVille === confirmDeleteVille ? 'Suppression…' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        )}
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
