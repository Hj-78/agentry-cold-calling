'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface CalEvent {
  id: string
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  allDay?: boolean
  url?: string
}

function formatEventDate(dateTime: string | undefined, date: string | undefined) {
  const d = dateTime ? new Date(dateTime) : date ? new Date(date + 'T00:00:00') : null
  if (!d) return '—'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatEventTime(dateTime: string | undefined) {
  if (!dateTime) return ''
  return new Date(dateTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function groupByDate(events: CalEvent[]) {
  const groups: Record<string, CalEvent[]> = {}
  events.forEach(ev => {
    const dt = ev.start.dateTime || ev.start.date || ''
    const key = dt.substring(0, 10)
    if (!groups[key]) groups[key] = []
    groups[key].push(ev)
  })
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
}

export default function CalendrierPage() {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showNewRdv, setShowNewRdv] = useState(false)
  const [createSuccess, setCreateSuccess] = useState(false)

  // Form RDV
  const [rdvNom, setRdvNom] = useState('')
  const [rdvEmail, setRdvEmail] = useState('')
  const [rdvDate, setRdvDate] = useState('')
  const [rdvHeure, setRdvHeure] = useState('')
  const [rdvDesc, setRdvDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/calendar')
      const data = await res.json()
      setConnected(data.connected)
      setEvents(data.events || [])
    } catch {
      // silencieux
    }
    setLoading(false)
  }

  useEffect(() => { fetchEvents() }, [])

  const createRdv = async () => {
    if (!rdvNom || !rdvDate || !rdvHeure) return
    setCreating(true)
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agenceNom: rdvNom,
          agenceEmail: rdvEmail || undefined,
          rdvDate,
          rdvHeure,
          description: rdvDesc,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setCreateSuccess(true)
        setShowNewRdv(false)
        setRdvNom(''); setRdvEmail(''); setRdvDate(''); setRdvHeure(''); setRdvDesc('')
        setTimeout(() => { setCreateSuccess(false); fetchEvents() }, 2000)
      }
    } catch { /* silencieux */ }
    setCreating(false)
  }

  const grouped = groupByDate(events)
  const today = new Date().toISOString().substring(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().substring(0, 10)

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 md:py-14">

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-base mb-1">{events.length} rendez-vous à venir</p>
          <h1 className="text-3xl font-bold text-white">Calendrier</h1>
        </div>
        {connected && (
          <button
            onClick={() => setShowNewRdv(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
          >
            + RDV
          </button>
        )}
      </div>

      {createSuccess && (
        <div className="bg-green-900/30 border border-green-700 rounded-2xl p-4 mb-6 text-green-300 text-sm">
          ✅ RDV créé dans iCloud Calendar !
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-slate-500">Connexion à iCloud…</div>
        </div>
      ) : !connected ? (
        /* Non connecté */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center">
          <div className="text-5xl mb-4">🍎</div>
          <h2 className="text-white font-bold text-xl mb-3">Connecter iCloud Calendar</h2>
          <p className="text-slate-500 text-sm mb-8 max-w-xs mx-auto leading-relaxed">
            Configure ton Apple ID et ton mot de passe d&apos;application pour synchroniser tes RDV avec iCloud Calendar.
          </p>
          <Link
            href="/parametres"
            className="inline-block bg-white hover:bg-slate-100 text-slate-900 font-semibold px-6 py-3 rounded-xl transition"
          >
            <span className="mr-2">⚙️</span>
            Configurer dans les paramètres
          </Link>
          <p className="text-slate-600 text-xs mt-4">
            Besoin d&apos;un mot de passe d&apos;application ?{' '}
            <a href="https://appleid.apple.com/account/manage" target="_blank" className="text-indigo-400 hover:text-indigo-300 underline">
              appleid.apple.com
            </a>
          </p>
        </div>
      ) : events.length === 0 ? (
        /* Connecté mais aucun RDV */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center">
          <div className="text-5xl mb-4">🗓️</div>
          <h2 className="text-white font-semibold text-lg mb-2">Aucun rendez-vous à venir</h2>
          <p className="text-slate-500 text-sm mb-6">Les RDV pris en session apparaîtront ici automatiquement.</p>
          <button
            onClick={() => setShowNewRdv(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
          >
            + Créer un RDV manuellement
          </button>
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-green-400 text-xs">iCloud Calendar connecté</span>
          </div>
        </div>
      ) : (
        /* Liste des RDV groupés par date */
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-green-400 text-xs">iCloud Calendar · synchronisé</span>
            <button onClick={fetchEvents} className="text-slate-500 hover:text-slate-300 text-xs ml-auto transition">↻ Actualiser</button>
          </div>

          {grouped.map(([dateKey, dayEvents]) => {
            const isToday = dateKey === today
            const isTomorrow = dateKey === tomorrow
            const dateLabel = isToday
              ? 'Aujourd\'hui'
              : isTomorrow
              ? 'Demain'
              : formatEventDate(dayEvents[0].start.dateTime, dayEvents[0].start.date)

            return (
              <div key={dateKey}>
                <div className={`text-xs font-semibold uppercase tracking-widest mb-3 ${isToday ? 'text-indigo-400' : isTomorrow ? 'text-amber-400' : 'text-slate-500'}`}>
                  {isToday && '🔴 '}{dateLabel}
                </div>
                <div className="space-y-3">
                  {dayEvents.map(ev => {
                    const startTime = formatEventTime(ev.start.dateTime)
                    const endTime = formatEventTime(ev.end.dateTime)
                    const isRdv = ev.summary?.toLowerCase().includes('rdv')

                    return (
                      <div key={ev.id}
                        className={`bg-slate-900 border rounded-2xl p-5 transition ${isRdv ? 'border-green-700/50 bg-green-900/10' : 'border-slate-800'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {isRdv && <span className="text-green-400 text-xs font-bold">📅 RDV</span>}
                              <h3 className="text-white font-semibold truncate">{ev.summary}</h3>
                            </div>
                            {startTime && (
                              <div className="text-indigo-400 text-sm font-mono mb-2">
                                {startTime}{endTime ? ` → ${endTime}` : ''}
                              </div>
                            )}
                            {ev.location && (
                              <div className="text-slate-400 text-xs mb-1">
                                📍 {ev.location}
                              </div>
                            )}
                            {ev.description && (
                              <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">{ev.description}</p>
                            )}
                          </div>
                          {ev.url && (
                            <a href={ev.url} target="_blank" rel="noopener noreferrer"
                              className="text-slate-500 hover:text-slate-300 text-xs transition flex-shrink-0">
                              ↗
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal nouveau RDV */}
      {showNewRdv && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center p-0 md:items-center md:p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-t-3xl md:rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-lg">📅 Nouveau RDV</h3>
              <button onClick={() => setShowNewRdv(false)} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-400 text-xs mb-1.5 block">Agence / Nom *</label>
                <input type="text" value={rdvNom} onChange={e => setRdvNom(e.target.value)}
                  placeholder="Agence Martin"
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1.5 block">Email du prospect (invitation)</label>
                <input type="email" value={rdvEmail} onChange={e => setRdvEmail(e.target.value)}
                  placeholder="contact@agence.com"
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs mb-1.5 block">Date *</label>
                  <input type="date" value={rdvDate} onChange={e => setRdvDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1.5 block">Heure *</label>
                  <input type="time" value={rdvHeure} onChange={e => setRdvHeure(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1.5 block">Notes</label>
                <textarea rows={2} value={rdvDesc} onChange={e => setRdvDesc(e.target.value)}
                  placeholder="Contexte du rendez-vous…"
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-indigo-500" />
              </div>
            </div>

            <button
              onClick={createRdv}
              disabled={creating || !rdvNom || !rdvDate || !rdvHeure}
              className="w-full mt-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-4 rounded-xl font-semibold transition"
            >
              {creating ? 'Création…' : '🍎 Créer dans iCloud Calendar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
