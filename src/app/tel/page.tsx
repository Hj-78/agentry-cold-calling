'use client'

import { useEffect, useRef, useState } from 'react'
import type { AgenceQueue, Session } from '@/lib/types'

export default function TelPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [current, setCurrent] = useState<AgenceQueue | null>(null)
  const [flash, setFlash] = useState(false)
  const [noSession, setNoSession] = useState(false)
  const prevIndexRef = useRef<number>(-1)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const triggerCall = (tel: string) => {
    // vibrate phone if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200])
    }
    // open native dialer
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
        return
      }

      setNoSession(false)
      setSession(data)

      const queue: AgenceQueue[] = data.agenceQueue || []
      const idx = data.totalAppels
      const agence = queue[idx] || null

      // new agency detected → auto call
      if (idx !== prevIndexRef.current && prevIndexRef.current !== -1) {
        setFlash(true)
        setTimeout(() => setFlash(false), 800)
        if (agence?.telephone) {
          triggerCall(agence.telephone)
        }
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

  // Session active mais plus d'agences dans la queue
  if (session && !current) {
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

  if (!session) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Connexion...</p>
      </div>
    )
  }

  const queue = session.agenceQueue || []
  const idx = session.totalAppels
  const remaining = queue.length - idx

  return (
    <div
      className={`fixed inset-0 flex flex-col transition-colors duration-150 ${
        flash ? 'bg-green-900' : 'bg-black'
      }`}
    >
      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-safe pt-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-400 text-sm font-medium">Session active</span>
        </div>
        <span className="text-slate-400 text-sm">
          {idx} / {session.objectif} appels
        </span>
      </div>

      {/* Agency name */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <p className="text-slate-400 text-sm uppercase tracking-widest">
          {current.ville || 'Agence'}
        </p>
        <h1 className="text-white text-3xl font-bold text-center leading-tight">
          {current.nom}
        </h1>

        {/* Phone number */}
        <a
          href={`tel:${(current.telephone || '').replace(/\s/g, '')}`}
          className="text-green-400 text-5xl font-mono font-semibold tracking-wider text-center hover:text-green-300 active:text-green-200"
        >
          {current.telephone || '—'}
        </a>

        {/* Call button */}
        <button
          onClick={() => current.telephone && triggerCall(current.telephone)}
          className="mt-4 w-20 h-20 rounded-full bg-green-500 hover:bg-green-400 active:bg-green-600 flex items-center justify-center shadow-lg shadow-green-900 transition-transform active:scale-95"
        >
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1C10.56 21 3 13.44 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.24 1.01l-2.21 2.21z"/>
          </svg>
        </button>

        <p className="text-slate-600 text-sm mt-2">
          {remaining > 0 ? `${remaining} agence${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}` : 'Dernière agence'}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-800">
        <div
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${Math.min(100, Math.round((idx / session.objectif) * 100))}%` }}
        />
      </div>
    </div>
  )
}
