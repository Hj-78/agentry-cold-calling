'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'

interface ObjectifJour {
  date: string
  objectif: number
  compteur: number
}

interface JourSemaine {
  date: string
  compteur: number
  objectifAtteint: boolean
  isToday: boolean
}

interface WeekStats {
  totalAppels: number
  joursActifs: number
  moyenneJour: number
  pitches: number
  interesses: number
  rdvs: number
}

interface LastSessionStats {
  date: string
  totalAppels: number
  interesses: number
  rdvs: number
  duree: number
}

interface VilleStat {
  ville: string
  appels: number
  interesses: number
  rdvs: number
  tauxConversion: number
  tauxRdv: number
}

interface HeureStat {
  heure: number
  label: string
  appels: number
  interesses: number
  rdvs: number
  tauxConversion: number | null
}

interface DashboardData {
  today: ObjectifJour
  streak: number
  objectifMin: number
  semaineJours: JourSemaine[]
  week: WeekStats
  lastSession: LastSessionStats | null
}

function formatDuree(s: number) {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m} min`
}

function formatDateCourte(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

const JOURS_LABELS: Record<number, string> = { 1: 'L', 2: 'M', 4: 'J', 5: 'V', 6: 'S' }

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [villesData, setVillesData] = useState<VilleStat[]>([])
  const [heuresData, setHeuresData] = useState<{ heures: HeureStat[]; meilleureHeure: HeureStat | null }>({ heures: [], meilleureHeure: null })

  const fetchData = useCallback(async () => {
    const [dashRes, villesRes, heuresRes] = await Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/stats/villes'),
      fetch('/api/stats/heures'),
    ])
    const [json, villesJson, heuresJson] = await Promise.all([dashRes.json(), villesRes.json(), heuresRes.json()])
    setData(json)
    setVillesData(villesJson.villes || [])
    setHeuresData({ heures: heuresJson.heures || [], meilleureHeure: heuresJson.meilleureHeure || null })
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (!data) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-slate-500 text-lg">Chargement…</div>
    </div>
  )

  const { today, streak, objectifMin, semaineJours, week, lastSession } = data
  const { heures, meilleureHeure } = heuresData
  const maxHeureAppels = heures.length > 0 ? Math.max(...heures.map(h => h.appels)) : 1
  const pct = Math.min(100, Math.round((today.compteur / objectifMin) * 100))
  const done = today.compteur >= objectifMin
  const surplus = today.compteur > objectifMin ? today.compteur - objectifMin : 0

  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="max-w-lg mx-auto px-5 py-8 md:py-12 space-y-4">

      {/* Header */}
      <div className="mb-2">
        <p className="text-slate-500 text-sm capitalize">{dateLabel}</p>
        <div className="flex items-center justify-between mt-0.5">
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          {streak >= 2 && (
            <div className="flex items-center gap-1.5 bg-orange-950/50 border border-orange-700/50 rounded-full px-3 py-1">
              <span className="text-base">🔥</span>
              <span className="text-orange-400 font-bold text-sm">{streak} jours</span>
            </div>
          )}
          {streak === 1 && (
            <div className="flex items-center gap-1.5 bg-orange-950/50 border border-orange-700/50 rounded-full px-3 py-1">
              <span className="text-base">🔥</span>
              <span className="text-orange-400 font-bold text-sm">1 jour</span>
            </div>
          )}
        </div>
      </div>

      {/* GROS BOUTON — Lancer la session */}
      <Link
        href="/sessions"
        className="block w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] rounded-2xl p-5 transition-all duration-150 shadow-xl shadow-indigo-900/40"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-bold text-xl mb-0.5">▶ Lancer une session</div>
            <div className="text-indigo-200 text-sm">Power dialer · Transcription · Résumé IA</div>
          </div>
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white text-xl font-bold">
            →
          </div>
        </div>
      </Link>

      {/* Objectif du jour */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-1">Objectif du jour</div>
            <div className="flex items-baseline gap-2">
              <span className={`text-5xl font-bold tabular-nums ${done ? 'text-green-400' : 'text-white'}`}>
                {today.compteur}
              </span>
              <span className="text-slate-500 text-xl">/ {objectifMin}</span>
              {surplus > 0 && (
                <span className="text-green-500 text-sm font-bold">+{surplus}</span>
              )}
            </div>
          </div>
          {done && (
            <div className="text-3xl">✅</div>
          )}
        </div>

        {/* Barre progression */}
        <div className="w-full bg-slate-800 rounded-full h-2.5 mb-2">
          <div
            className={`h-2.5 rounded-full transition-all duration-700 ${done ? 'bg-green-500' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-slate-600 text-xs">
          {done ? `Objectif atteint${surplus > 0 ? ` · ${surplus} appel${surplus > 1 ? 's' : ''} bonus` : ''} 🎉` : `${objectifMin - today.compteur} appels restants`}
        </p>
      </div>

      {/* Semaine — points jours */}
      {semaineJours.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-4">Cette semaine</div>
          <div className="flex items-end justify-between gap-2">
            {semaineJours.map((jour) => {
              const dayOfWeek = new Date(jour.date + 'T12:00:00').getDay()
              const label = JOURS_LABELS[dayOfWeek] || '?'
              const isFuture = !jour.isToday && new Date(jour.date + 'T23:59:59') > new Date()
              const fillPct = jour.compteur > 0 ? Math.min(100, Math.round((jour.compteur / objectifMin) * 100)) : 0
              const barColor = jour.objectifAtteint
                ? 'bg-green-500'
                : jour.isToday && jour.compteur > 0
                  ? 'bg-indigo-500'
                  : 'bg-slate-600'

              return (
                <div key={jour.date} className="flex flex-col items-center gap-1.5 flex-1">
                  {/* Compteur au-dessus */}
                  <span className={`text-xs tabular-nums h-4 ${jour.compteur > 0 ? (jour.objectifAtteint ? 'text-green-400' : 'text-slate-400') : 'text-transparent'}`}>
                    {jour.compteur > 0 ? jour.compteur : '0'}
                  </span>
                  {/* Barre — remplissage depuis le bas */}
                  <div className="w-full relative bg-slate-800 rounded-lg overflow-hidden" style={{ height: '48px' }}>
                    {!isFuture && fillPct > 0 && (
                      <div
                        className={`absolute bottom-0 left-0 right-0 rounded-lg transition-all duration-700 ${barColor}`}
                        style={{ height: `${fillPct}%` }}
                      />
                    )}
                    {jour.isToday && (
                      <div className="absolute inset-0 border-2 border-indigo-500/50 rounded-lg" />
                    )}
                  </div>
                  {/* Label jour */}
                  <span className={`text-xs font-semibold ${jour.isToday ? 'text-indigo-400' : 'text-slate-500'}`}>
                    {label}
                  </span>
                  {/* Pastille statut */}
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    jour.objectifAtteint ? 'bg-green-500' :
                    jour.isToday ? 'bg-indigo-400' :
                    isFuture ? 'bg-slate-700' : 'bg-red-700'
                  }`} />
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 pt-3 border-t border-slate-800">
            <div className="text-center flex-1">
              <div className="text-white font-bold text-lg">{week.totalAppels}</div>
              <div className="text-slate-500 text-xs">appels</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-green-400 font-bold text-lg">{week.interesses}</div>
              <div className="text-slate-500 text-xs">intéressés</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-yellow-400 font-bold text-lg">{week.rdvs}</div>
              <div className="text-slate-500 text-xs">RDV</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-amber-400 font-bold text-lg">{week.moyenneJour}</div>
              <div className="text-slate-500 text-xs">moy/jour</div>
            </div>
          </div>
        </div>
      )}

      {/* Dernière session */}
      {lastSession && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">Dernière session</div>
          <div className="flex items-center justify-between">
            <div className="text-slate-500 text-xs mb-3">{formatDateCourte(lastSession.date)}{lastSession.duree ? ` · ${formatDuree(lastSession.duree)}` : ''}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">📞</span>
              <span className="text-white font-bold">{lastSession.totalAppels}</span>
              <span className="text-slate-500 text-xs">appels</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center gap-2">
              <span className="text-sm">✅</span>
              <span className="text-green-400 font-bold">{lastSession.interesses}</span>
              <span className="text-slate-500 text-xs">intéressés</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center gap-2">
              <span className="text-sm">📅</span>
              <span className="text-yellow-400 font-bold">{lastSession.rdvs}</span>
              <span className="text-slate-500 text-xs">RDV</span>
            </div>
          </div>
        </div>
      )}

      {/* Entonnoir semaine */}
      {week.totalAppels > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-4">📊 Entonnoir semaine</div>
          <div className="space-y-3">
            {[
              { label: 'Appels', val: week.totalAppels, max: week.totalAppels, color: 'bg-indigo-500' },
              { label: 'Pitchés', val: week.pitches, max: week.totalAppels, color: 'bg-purple-500' },
              { label: 'Intéressés', val: week.interesses, max: week.totalAppels, color: 'bg-green-500' },
              { label: 'RDV 📅', val: week.rdvs, max: week.totalAppels, color: 'bg-yellow-500' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="text-slate-500 text-xs w-20 flex-shrink-0">{item.label}</div>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-2 ${item.color} rounded-full transition-all`}
                    style={{ width: `${item.max > 0 ? Math.round((item.val / item.max) * 100) : 0}%` }}
                  />
                </div>
                <div className="text-white font-bold text-sm w-6 text-right">{item.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meilleure heure d'appel */}
      {heures.length >= 3 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-widest">⏰ Meilleure heure d&apos;appel</div>
            {meilleureHeure && (
              <div className="flex items-center gap-1.5 bg-green-950/50 border border-green-700/40 rounded-full px-3 py-1">
                <span className="text-green-400 font-bold text-sm">{meilleureHeure.label}</span>
                <span className="text-green-600 text-xs">{meilleureHeure.tauxConversion ?? '?'}% conv.</span>
              </div>
            )}
          </div>

          {/* Mini histogramme par heure */}
          <div className="flex items-end gap-1 h-12 mb-2">
            {heures.map(h => {
              const fillPct = maxHeureAppels > 0 ? Math.round((h.appels / maxHeureAppels) * 100) : 0
              const isBest = meilleureHeure && h.heure === meilleureHeure.heure
              return (
                <div key={h.heure} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h.label} · ${h.appels} appels · ${h.tauxConversion ?? '?'}% conv.`}>
                  <div
                    className={`w-full rounded-sm transition-all ${isBest ? 'bg-green-500' : h.tauxConversion && h.tauxConversion >= 5 ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    style={{ height: `${fillPct}%`, minHeight: fillPct > 0 ? '4px' : '0' }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-slate-700 text-xs">
            <span>{heures[0]?.label}</span>
            <span>{heures[Math.floor(heures.length / 2)]?.label}</span>
            <span>{heures[heures.length - 1]?.label}</span>
          </div>
          {meilleureHeure && (
            <p className="text-slate-600 text-xs mt-2">
              Pic de conversion à <span className="text-green-500">{meilleureHeure.label}</span> — {meilleureHeure.interesses} intéressé{meilleureHeure.interesses > 1 ? 's' : ''} sur {meilleureHeure.appels} appels
            </p>
          )}
        </div>
      )}

      {/* Taux de conversion par ville */}
      {villesData.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-4">🏙 Conversion par ville</div>
          <div className="space-y-3">
            {villesData.map(v => (
              <div key={v.ville}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium">{v.ville}</span>
                    <span className="text-slate-600 text-xs">{v.appels} appels</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {v.rdvs > 0 && (
                      <span className="text-yellow-400 text-xs font-bold">📅 {v.rdvs}</span>
                    )}
                    <span className={`text-xs font-bold tabular-nums ${
                      v.tauxConversion >= 10 ? 'text-green-400' :
                      v.tauxConversion >= 5 ? 'text-amber-400' : 'text-slate-400'
                    }`}>{v.tauxConversion}%</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      v.tauxConversion >= 10 ? 'bg-green-500' :
                      v.tauxConversion >= 5 ? 'bg-amber-500' : 'bg-slate-600'
                    }`}
                    style={{ width: `${Math.min(100, v.tauxConversion * 5)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-slate-700 text-xs mt-3">Villes avec 3+ appels · taux = intéressés / total</p>
        </div>
      )}

      {/* Badges / Gamification */}
      <BadgesBlock streak={streak} weekRdvs={week.rdvs} todayAppels={today.compteur} objectifMin={objectifMin} />

      {/* QR Code téléphone */}
      <QRCodeBlock />

    </div>
  )
}

function BadgesBlock({ streak, weekRdvs, todayAppels, objectifMin }: {
  streak: number
  weekRdvs: number
  todayAppels: number
  objectifMin: number
}) {
  const badges = [
    {
      id: 'objectif_jour',
      emoji: '🎯',
      label: 'Objectif atteint',
      desc: `${objectifMin} appels en une journée`,
      unlocked: todayAppels >= objectifMin,
    },
    {
      id: 'machine',
      emoji: '⚡',
      label: 'Machine de guerre',
      desc: '75+ appels en une journée',
      unlocked: todayAppels >= 75,
    },
    {
      id: 'rdv_week',
      emoji: '📅',
      label: 'Closeur',
      desc: '5 RDV dans la semaine',
      unlocked: weekRdvs >= 5,
    },
    {
      id: 'streak_3',
      emoji: '🔥',
      label: 'En feu',
      desc: '3 jours d\'objectif consécutifs',
      unlocked: streak >= 3,
    },
    {
      id: 'streak_5',
      emoji: '🚀',
      label: 'Fusée',
      desc: '5 jours consécutifs',
      unlocked: streak >= 5,
    },
    {
      id: 'streak_10',
      emoji: '👑',
      label: 'Roi du cold call',
      desc: '10 jours consécutifs',
      unlocked: streak >= 10,
    },
  ]

  const unlocked = badges.filter(b => b.unlocked)
  const locked = badges.filter(b => !b.unlocked)

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-4">🏆 Badges</div>

      {unlocked.length === 0 && (
        <p className="text-slate-600 text-sm mb-3">Atteins tes objectifs pour débloquer des badges !</p>
      )}

      {/* Badges débloqués */}
      {unlocked.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          {unlocked.map(b => (
            <div key={b.id} className="bg-indigo-900/30 border border-indigo-700/40 rounded-xl p-3 text-center">
              <div className="text-2xl mb-1">{b.emoji}</div>
              <div className="text-white text-xs font-bold leading-tight">{b.label}</div>
              <div className="text-indigo-400 text-xs mt-0.5 leading-tight">{b.desc}</div>
            </div>
          ))}
        </div>
      )}

      {/* Badges verrouillés (max 3) */}
      {locked.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {locked.slice(0, 3).map(b => (
            <div key={b.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 text-center opacity-50">
              <div className="text-2xl mb-1 grayscale">{b.emoji}</div>
              <div className="text-slate-500 text-xs font-bold leading-tight">{b.label}</div>
              <div className="text-slate-600 text-xs mt-0.5 leading-tight">{b.desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QRCodeBlock() {
  const [url, setUrl] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    // Priorité : URL sauvegardée dans localStorage
    let saved = localStorage.getItem('qr_url')
    // Migrate old /appel URLs to /tel
    if (saved && saved.endsWith('/appel')) {
      saved = saved.replace(/\/appel$/, '/tel')
      localStorage.setItem('qr_url', saved)
    }
    if (saved) {
      setUrl(saved)
      setEditUrl(saved)
      return
    }
    // Si l'app est accessible depuis l'extérieur (pas localhost), utiliser l'URL courante
    const hostname = window.location.hostname
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      const auto = `${window.location.origin}/tel`
      setUrl(auto)
      setEditUrl(auto)
      return
    }
    // Sinon : IP locale (réseau local)
    fetch('/api/local-ip')
      .then(r => r.json())
      .then(({ ip }) => {
        const port = window.location.port
        const auto = `http://${ip}${port ? `:${port}` : ''}/tel`
        setUrl(auto)
        setEditUrl(auto)
      })
      .catch(() => {
        const port = window.location.port
        const fallback = `http://localhost${port ? `:${port}` : ''}/tel`
        setUrl(fallback)
        setEditUrl(fallback)
      })
  }, [])

  function saveUrl() {
    const trimmed = editUrl.trim()
    if (!trimmed) return
    // Ajouter /tel si l'URL ne se termine pas déjà par /tel
    const final = trimmed.endsWith('/tel') ? trimmed : trimmed.replace(/\/$/, '') + '/tel'
    setUrl(final)
    setEditUrl(final)
    localStorage.setItem('qr_url', final)
    setEditing(false)
  }

  function resetUrl() {
    localStorage.removeItem('qr_url')
    const port = window.location.port
    fetch('/api/local-ip')
      .then(r => r.json())
      .then(({ ip }) => {
        const auto = `http://${ip}${port ? `:${port}` : ''}/tel`
        setUrl(auto)
        setEditUrl(auto)
      })
    setEditing(false)
  }

  if (!url) return null

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-slate-400 text-xs font-semibold uppercase tracking-widest">📱 Vue téléphone</div>
        <button onClick={() => setEditing(e => !e)}
          className="text-xs text-slate-500 hover:text-slate-300 transition">
          {editing ? 'Annuler' : '✏️ Modifier URL'}
        </button>
      </div>

      {editing && (
        <div className="mb-4 flex flex-col gap-2">
          <input
            type="text"
            value={editUrl}
            onChange={e => setEditUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveUrl()}
            placeholder="https://xxx.trycloudflare.com"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <button onClick={saveUrl}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg py-1.5 transition">
              Appliquer
            </button>
            <button onClick={resetUrl}
              className="text-slate-500 hover:text-slate-300 text-xs px-3 transition">
              Réinitialiser
            </button>
          </div>
          <p className="text-slate-600 text-xs">Colle ici l&apos;URL Cloudflare pour fonctionner en hotspot</p>
        </div>
      )}

      <div className="flex items-center gap-5">
        <div className="bg-white p-2 rounded-xl flex-shrink-0">
          <QRCodeSVG value={url} size={100} bgColor="#ffffff" fgColor="#000000" />
        </div>
        <div>
          <p className="text-white text-sm font-medium mb-1">Scanner pour appeler</p>
          <p className="text-slate-500 text-xs mb-3">Ouvre la vue téléphone — se synchronise avec le PC en temps réel</p>
          <a href={url} target="_blank"
            className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 text-xs font-mono transition break-all">
            {url} ↗
          </a>
        </div>
      </div>
    </div>
  )
}
