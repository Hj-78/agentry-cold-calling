'use client'

import { useState, useEffect, useRef } from 'react'

interface AgenceQueue {
  id: number
  nom: string
  telephone: string | null
  email: string | null
  ville: string | null
  adresse: string | null
}

interface SessionData {
  id: number
  totalAppels: number
  objectif: number
  status: string
  agenceQueue: AgenceQueue[] | null
}

interface RappelAgence {
  id: number
  nom: string
  telephone: string | null
  ville: string | null
  noteRapide?: string | null
}

export default function AppelPhonePage() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastAgenceId, setLastAgenceId] = useState<number | null>(null)
  const [rappels, setRappels] = useState<RappelAgence[]>([])
  const [modeRappels, setModeRappels] = useState(false)
  const [swipeFeedback, setSwipeFeedback] = useState<'interesse' | 'pas_interesse' | 'rappeler' | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const poll = async () => {
    try {
      const res = await fetch('/api/sessions/active')
      const data = await res.json()
      setSession(data)
      setLoading(false)

      // Vibration quand l'agence change
      if (data) {
        const queue: AgenceQueue[] = data.agenceQueue || []
        const current = queue[data.totalAppels]
        if (current && current.id !== lastAgenceId) {
          setLastAgenceId(current.id)
          if (navigator.vibrate) navigator.vibrate([100, 50, 100])
        }
      }
    } catch {
      setLoading(false)
    }
  }

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 2000)
    // Charge les rappels du jour
    fetch('/api/agences?statut=rappeler')
      .then(r => r.json())
      .then((data: unknown) => Array.isArray(data) ? setRappels((data as RappelAgence[]).slice(0, 20)) : null)
      .catch(() => {})
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const queue: AgenceQueue[] = session?.agenceQueue || []
  const current: AgenceQueue | null = session ? (queue[session.totalAppels] || null) : null
  const callNum = session ? session.totalAppels + 1 : 0
  const total = session?.objectif || 50

  // Swipe handlers pour qualifier rapidement
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = async (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null || !session || !current) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    // Swipe horizontal uniquement (dx > 60px et plus grand que le dy)
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return

    const resultat = dx > 0 ? 'interesse' : 'pas_interesse'
    setSwipeFeedback(resultat)
    if (navigator.vibrate) navigator.vibrate(resultat === 'interesse' ? [100, 50, 100] : [50])

    // Envoie le résultat au PC via l'API session
    try {
      await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_appel',
          agenceId: current.id,
          agenceNom: current.nom,
          agenceTel: current.telephone,
          resultat,
        }),
      })
    } catch { /* silencieux */ }

    setTimeout(() => setSwipeFeedback(null), 800)
    touchStartX.current = null
    touchStartY.current = null
  }

  // Pas de session active
  if (!loading && !session) {
    if (modeRappels || rappels.length > 0) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col">
          {/* Header rappels */}
          <div className="flex items-center justify-between px-5 pt-12 pb-4 border-b border-slate-800">
            <button onClick={() => setModeRappels(false)} className="text-slate-500 text-sm">← Retour</button>
            <h1 className="text-white font-bold text-base">↩ Rappels du jour</h1>
            <div className="flex gap-1.5 items-center">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-amber-400 text-xs font-bold">{rappels.length}</span>
            </div>
          </div>

          {rappels.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="text-5xl">✅</div>
              <p className="text-slate-400 text-lg font-medium">Aucun rappel en attente</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {rappels.map(ag => (
                <div key={ag.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-base truncate">{ag.nom}</div>
                    {ag.ville && <div className="text-slate-500 text-xs mt-0.5">{ag.ville}</div>}
                    {ag.telephone && <div className="text-indigo-400 font-mono text-sm mt-1">{ag.telephone}</div>}
                  </div>
                  {ag.telephone ? (
                    <a href={`tel:${ag.telephone.replace(/\s/g, '')}`}
                      className="flex-shrink-0 w-14 h-14 bg-green-600 active:bg-green-700 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-green-900/40 transition-transform active:scale-95">
                      📞
                    </a>
                  ) : (
                    <div className="flex-shrink-0 w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-600 text-xl">
                      📵
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="px-5 pb-8 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-700 animate-pulse" />
            <span className="text-slate-600 text-xs">En attente d&apos;une session…</span>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="text-6xl">⏸</div>
        <h1 className="text-2xl font-bold text-white">Pas de session en cours</h1>
        <p className="text-slate-500">Lance une session depuis le PC, la page se met à jour automatiquement.</p>

        {rappels.length > 0 && (
          <button onClick={() => setModeRappels(true)}
            className="bg-amber-600/20 border border-amber-700/50 text-amber-300 px-5 py-3 rounded-2xl text-sm font-semibold flex items-center gap-2 hover:bg-amber-600/30 transition">
            <span>↩</span>
            <span>Voir {rappels.length} rappel{rappels.length > 1 ? 's' : ''} en attente</span>
          </button>
        )}

        <div className="flex gap-2 items-center text-slate-600 text-sm">
          <span className="w-2 h-2 rounded-full bg-slate-700 animate-pulse" />
          En attente…
        </div>
      </div>
    )
  }

  // Session terminée
  if (session?.status === 'ended' || (!current && session)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="text-6xl">🎉</div>
        <h1 className="text-2xl font-bold text-white">Session terminée !</h1>
        <p className="text-slate-500">{session?.totalAppels} appels effectués</p>
      </div>
    )
  }

  if (loading || !current) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-slate-950 flex flex-col select-none relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Feedback swipe */}
      {swipeFeedback && (
        <div className={`absolute inset-0 z-50 flex items-center justify-center pointer-events-none transition-opacity ${
          swipeFeedback === 'interesse' ? 'bg-green-500/20' : 'bg-red-500/20'
        }`}>
          <div className={`text-6xl font-black animate-bounce ${
            swipeFeedback === 'interesse' ? 'text-green-400' : 'text-red-400'
          }`}>
            {swipeFeedback === 'interesse' ? '✓' : '✕'}
          </div>
        </div>
      )}

      {/* Hints swipe */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-800 text-xs font-bold rotate-90 opacity-60 pointer-events-none">INTÉRESSÉ →</div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-800 text-xs font-bold -rotate-90 opacity-60 pointer-events-none">← NON</div>

      {/* Header — counter */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div className="text-slate-600 text-sm font-medium">APPEL</div>
        <div className="text-white font-bold text-lg tabular-nums">
          {callNum}<span className="text-slate-600 font-normal">/{total}</span>
        </div>
        <div className="flex gap-1">
          {[...Array(Math.min(5, total))].map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i < session!.totalAppels ? 'bg-indigo-500' : 'bg-slate-700'}`}
            />
          ))}
        </div>
      </div>

      {/* Zone principale — flex-1 centré */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">

        {/* Nom agence */}
        <div className="text-center">
          <div className="text-slate-500 text-sm uppercase tracking-widest mb-2">Agence</div>
          <h1 className="text-3xl font-bold text-white leading-tight text-center">
            {current.nom}
          </h1>
          {current.ville && (
            <p className="text-slate-400 text-base mt-2">{current.ville}</p>
          )}
        </div>

        {/* Numéro de téléphone */}
        {current.telephone && (
          <div className="text-center">
            <div className="text-indigo-400 font-mono text-2xl font-bold tracking-widest">
              {current.telephone}
            </div>
          </div>
        )}

        {/* BOUTON APPELER — le seul truc important */}
        {current.telephone ? (
          <a
            href={`tel:${current.telephone.replace(/\s/g, '')}`}
            className="w-full max-w-xs flex items-center justify-center gap-4 bg-green-600 active:bg-green-700 text-white rounded-3xl py-8 text-2xl font-bold shadow-2xl shadow-green-900/50 transition-transform active:scale-95"
          >
            <span className="text-4xl">📞</span>
            <span>APPELER</span>
          </a>
        ) : (
          <div className="w-full max-w-xs flex items-center justify-center gap-3 bg-slate-800 text-slate-500 rounded-3xl py-8 text-xl font-bold">
            <span>Pas de numéro</span>
          </div>
        )}

        {/* Prochaine agence */}
        {queue[session!.totalAppels + 1] && (
          <div className="text-center mt-2">
            <div className="text-slate-600 text-xs uppercase tracking-wider mb-1">Suivante</div>
            <div className="text-slate-500 text-sm">{queue[session!.totalAppels + 1].nom}</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 pb-10 flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-slate-600 text-xs">Synchronisé avec le PC</span>
      </div>

      <audio ref={audioRef} />
    </div>
  )
}
