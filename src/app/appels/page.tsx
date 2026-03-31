'use client'

import { useState, useEffect } from 'react'
import TranscriptionRecorder from '@/components/appels/TranscriptionRecorder'

interface Agence { id: number; nom: string }
interface Appel {
  id: number; date: string; resultat: string | null
  transcription: string | null; resume: string | null
  pointsCles: string | null; prochaineAction: string | null
  agence: { nom: string } | null
}
interface Summary { resultat: string; resume: string; pointsCles: string; prochaineAction: string }

const RESULTATS = [
  { value: '', label: "Résultat de l'appel…" },
  { value: 'interesse', label: '🟢 Intéressé' },
  { value: 'pas_interesse', label: '🔴 Pas intéressé' },
  { value: 'rappeler', label: '🟡 À rappeler' },
  { value: 'messagerie', label: '📳 Messagerie' },
  { value: 'absent', label: '👻 Absent' },
]

export default function AppelsPage() {
  const [agences, setAgences] = useState<Agence[]>([])
  const [appels, setAppels] = useState<Appel[]>([])
  const [agenceId, setAgenceId] = useState('')
  const [resultat, setResultat] = useState('')
  const [transcription, setTranscription] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const fetchAppels = async () => {
    const res = await fetch('/api/appels')
    setAppels(await res.json())
  }

  useEffect(() => {
    fetch('/api/agences').then((r) => r.json()).then(setAgences)
    fetchAppels()
  }, [])

  const handleResumer = async () => {
    if (!transcription.trim()) return
    setLoadingSummary(true)
    const res = await fetch('/api/claude-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcription }),
    })
    const data = await res.json()
    if (data.error) alert(data.error)
    else { setSummary(data); if (data.resultat) setResultat(data.resultat) }
    setLoadingSummary(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/appels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agenceId: agenceId ? parseInt(agenceId) : null,
        resultat, transcription,
        resume: summary?.resume || null,
        pointsCles: summary?.pointsCles || null,
        prochaineAction: summary?.prochaineAction || null,
      }),
    })
    setAgenceId(''); setResultat(''); setTranscription(''); setSummary(null); setSaving(false)
    fetchAppels()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Logger un appel</h1>

      <form onSubmit={handleSave} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 mb-8 space-y-4">
        {/* Agence */}
        <select value={agenceId} onChange={(e) => setAgenceId(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm">
          <option value="">— Sélectionner une agence (optionnel) —</option>
          {agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
        </select>

        {/* Résultat */}
        <select value={resultat} onChange={(e) => setResultat(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm">
          {RESULTATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        {/* Transcription */}
        <div>
          <label className="text-slate-400 text-xs mb-2 block">Transcription de l&apos;appel</label>
          <TranscriptionRecorder value={transcription} onChange={setTranscription} />
        </div>

        {/* Bouton Claude */}
        {transcription.trim() && (
          <button type="button" onClick={handleResumer} disabled={loadingSummary}
            className="w-full bg-purple-700 hover:bg-purple-600 text-white py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loadingSummary ? <><span className="animate-spin">⟳</span> Analyse en cours…</> : '✨ Résumer avec Claude'}
          </button>
        )}

        {/* Résumé Claude */}
        {summary && (
          <div className="bg-slate-700 border border-purple-500/30 rounded-xl p-4 space-y-3">
            <div className="text-purple-300 text-sm font-semibold">✨ Analyse Claude</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-slate-400 text-xs mb-1">Résultat</div>
                <div className="text-slate-100 capitalize">{summary.resultat.replace(/_/g, ' ')}</div></div>
              <div><div className="text-slate-400 text-xs mb-1">Prochaine action</div>
                <div className="text-slate-100">{summary.prochaineAction}</div></div>
            </div>
            <div><div className="text-slate-400 text-xs mb-1">Résumé</div>
              <div className="text-slate-200 text-sm">{summary.resume}</div></div>
            <div><div className="text-slate-400 text-xs mb-1">Points clés</div>
              <div className="text-slate-200 text-sm">{summary.pointsCles}</div></div>
          </div>
        )}

        <button type="submit" disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg font-medium transition disabled:opacity-50">
          {saving ? 'Enregistrement…' : "💾 Sauvegarder l'appel"}
        </button>
      </form>

      {/* Appels récents */}
      <h2 className="text-lg font-semibold text-slate-200 mb-3">Appels récents</h2>
      <div className="space-y-2">
        {appels.length === 0 && (
          <div className="text-center text-slate-600 py-12">
            <div className="text-4xl mb-2">📞</div>
            Aucun appel enregistré
          </div>
        )}
        {appels.map((appel) => (
          <div key={appel.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <button type="button" className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() => setOpenId(openId === appel.id ? null : appel.id)}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-slate-500 text-xs flex-shrink-0">
                  {new Date(appel.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-slate-200 text-sm font-medium truncate">{appel.agence?.nom || 'Sans agence'}</span>
                {appel.resultat && (
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full flex-shrink-0">
                    {RESULTATS.find((r) => r.value === appel.resultat)?.label || appel.resultat}
                  </span>
                )}
              </div>
              <span className="text-slate-600 text-xs ml-2">{openId === appel.id ? '▲' : '▼'}</span>
            </button>
            {openId === appel.id && (
              <div className="px-4 pb-4 space-y-2 border-t border-slate-700 pt-3">
                {appel.resume && <div><div className="text-slate-400 text-xs">Résumé</div><div className="text-slate-200 text-sm">{appel.resume}</div></div>}
                {appel.pointsCles && <div><div className="text-slate-400 text-xs">Points clés</div><div className="text-slate-200 text-sm">{appel.pointsCles}</div></div>}
                {appel.prochaineAction && <div><div className="text-slate-400 text-xs">Prochaine action</div><div className="text-slate-200 text-sm font-medium">{appel.prochaineAction}</div></div>}
                {appel.transcription && (
                  <details><summary className="text-slate-500 text-xs cursor-pointer hover:text-slate-400">Voir transcription</summary>
                    <p className="text-slate-500 text-xs mt-1 whitespace-pre-wrap">{appel.transcription}</p>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
