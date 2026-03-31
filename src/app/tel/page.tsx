'use client'

import { useEffect, useRef, useState } from 'react'
import type { AgenceQueue, Session } from '@/lib/types'

export default function TelPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [current, setCurrent] = useState<AgenceQueue | null>(null)
  const [noSession, setNoSession] = useState(false)
  // readyToCall = true quand un nouveau numéro est détecté → plein écran vert "1 tap"
  const [readyToCall, setReadyToCall] = useState(false)
  const prevIndexRef = useRef<number>(-1)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const doCall = (tel: string) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([150, 80, 150])
    }
    setReadyToCall(false)
    window.location.href = `tel:${tel.replace(/\s/g, '')}`
  }

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/sessions/active', { cache: 'no-store' })
      const data: Session | null = await res.json()

      if (!data || data.status !== 'active') {
        setSession(null)
        setCurrent(null)
        setNoSession(true)
        setReadyToCall(false)
        return
      }

      setNoSession(false)
      setSession(data)

      const queue: AgenceQueue[] = data.agenceQueue || []
      const idx = data.totalAppels
      const agence = queue[idx] || null

      // Nouveau numéro détecté → passer en mode "prêt à appeler"
      if (prevIndexRef.current !== -1 && idx !== prevIndexRef.current && agence?.telephone) {
        setReadyToCall(true)
      }

      prevIndexRef.current = idx
      setCurrent(agence)
    } catch {
      // network error — keep polling
    }
  }

  useEffect(() => {
    fetchSession()
    intervalRef.current = setInterval(fetchSession, 2000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ——— PAS DE SESSION ———
  if (noSession) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <div className="text-slate-500 text-4xl">📵</div>
        <p className="text-slate-400 text-lg text-center px-8">
          Aucune session active.<br />Lance une session depuis le PC.
        </p>
        <div className="mt-4 w-2 h-2 rounded-full bg-slate-600 animate-pulse" />
      </div>
    )
  }

  // ——— CONNEXION EN COURS ———
  if (!session) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Connexion...</p>
      </div>
    )
  }

  // ——— FILE TERMINÉE ———
  if (!current) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <div className="text-5xl mb-2">🎉</div>
        <p className="text-white text-xl font-bold">File d&apos;appels terminée !</p>
        <p className="text-slate-500 text-sm text-center px-8">Termine la session sur le PC.</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-500 text-xs">Session toujours active</span>
        </div>
      </div>
    )
  }

  const queue = session.agenceQueue || []
  const idx = session.totalAppels
  const remaining = queue.length - idx

  // ——— MODE "PRÊT À APPELER" — plein écran, 1 tap ———
  if (readyToCall && current.telephone) {
    return (
      <button
        onClick={() => doCall(current.telephone!)}
        className="fixed inset-0 bg-green-500 active:bg-green-400 flex flex-col items-center justify-center gap-6 w-full"
      >
        <div className="text-white/80 text-sm uppercase tracking-widest font-semibold">Nouveau numéro</div>
        <div className="text-white text-4xl font-bold text-center px-6 leading-tight">
          {current.nom}
        </div>
        <div className="text-white text-5xl font-mono font-bold tracking-wider">
          {current.telephone}
        </div>
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white flex items-center justify-center animate-pulse">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1C10.56 21 3 13.44 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.24 1.01l-2.21 2.21z"/>
            </svg>
          </div>
          <span className="text-white font-bold text-xl">APPUIE POUR APPELER</span>
        </div>
      </button>
    )
  }

  // ——— VUE NORMALE ———
  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-400 text-sm font-medium">Session active</span>
        </div>
        <span className="text-slate-400 text-sm">{idx} / {session.objectif}</span>
      </div>

      {/* Contenu */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
        <p className="text-slate-500 text-xs uppercase tracking-widest">{current.ville || ''}</p>
        <h1 className="text-white text-3xl font-bold text-center leading-tight">{current.nom}</h1>

        <a
          href={`tel:${(current.telephone || '').replace(/\s/g, '')}`}
          className="text-green-400 text-4xl font-mono font-semibold tracking-wider text-center"
        >
          {current.telephone || '—'}
        </a>

        {/* Bouton appeler */}
        <a
          href={`tel:${(current.telephone || '').replace(/\s/g, '')}`}
          onClick={() => {
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(100)
          }}
          className="mt-2 w-24 h-24 rounded-full bg-green-500 active:bg-green-400 flex items-center justify-center shadow-xl shadow-green-900/50"
        >
          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1C10.56 21 3 13.44 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.24 1.01l-2.21 2.21z"/>
          </svg>
        </a>

        <p className="text-slate-700 text-sm">
          {remaining > 0 ? `${remaining} restante${remaining > 1 ? 's' : ''}` : 'Dernière agence'}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-800 flex-shrink-0">
        <div
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${Math.min(100, Math.round((idx / session.objectif) * 100))}%` }}
        />
      </div>
    </div>
  )
}
