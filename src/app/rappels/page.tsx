'use client'

import { useState, useEffect } from 'react'
import { scheduleNotification, requestNotificationPermission } from '@/lib/notifications'

interface Agence { id: number; nom: string }
interface Rappel {
  id: number; dateHeure: string; note: string | null; fait: boolean
  agence: { nom: string } | null; agenceId: number | null
}

function formatDateHeure(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function isLate(d: string) { return new Date(d) < new Date() }

// Retourne la date du jour + 1h arrondie à la prochaine demi-heure
function defaultDateTime() {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function RappelsPage() {
  const [agences, setAgences] = useState<Agence[]>([])
  const [rappels, setRappels] = useState<Rappel[]>([])
  const [agenceId, setAgenceId] = useState('')
  const [date, setDate] = useState(() => defaultDateTime().split('T')[0])
  const [heure, setHeure] = useState(() => defaultDateTime().split('T')[1])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const fetchRappels = async () => {
    const res = await fetch('/api/rappels')
    const data: Rappel[] = await res.json()
    setRappels(data)
    data.filter(r => !r.fait).forEach(r => {
      const d = new Date(r.dateHeure)
      if (d > new Date()) scheduleNotification(`📞 ${r.agence?.nom || 'Rappel'}`, r.note || 'Heure du rappel !', d)
    })
  }

  useEffect(() => {
    fetch('/api/agences').then(r => r.json()).then(setAgences)
    fetchRappels()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date || !heure) return
    setSaving(true)
    const dateHeure = `${date}T${heure}`
    await fetch('/api/rappels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agenceId: agenceId ? parseInt(agenceId) : null, dateHeure, note }),
    })
    setAgenceId(''); setNote(''); setSaving(false); setShowForm(false)
    fetchRappels()
  }

  const handleFait = async (id: number) => {
    await fetch('/api/rappels', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, fait: true }) })
    fetchRappels()
  }

  const handleDelete = async (id: number) => {
    await fetch(`/api/rappels?id=${id}`, { method: 'DELETE' })
    fetchRappels()
  }

  const aVenir = rappels.filter(r => !r.fait)
  const faits = rappels.filter(r => r.fait)

  // Jours uniques pour grouper les rappels à venir
  const groupes = aVenir.reduce((acc, r) => {
    const jour = new Date(r.dateHeure).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    if (!acc[jour]) acc[jour] = []
    acc[jour].push(r)
    return acc
  }, {} as Record<string, Rappel[]>)

  return (
    <div className="max-w-2xl mx-auto px-5 py-10 md:py-14">

      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-slate-500 text-base mb-1">{aVenir.length} rappel{aVenir.length > 1 ? 's' : ''} à venir</p>
          <h1 className="text-4xl font-bold text-white">Rappels</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => requestNotificationPermission().then(ok => ok ? alert('✅ Notifications activées') : alert('Permission refusée'))}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white px-4 py-2.5 rounded-xl text-sm transition"
          >
            🔔
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            + Nouveau
          </button>
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-10">
          <h2 className="text-white font-bold text-2xl mb-8">Nouveau rappel</h2>
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Agence */}
            <div>
              <label className="text-slate-400 text-sm font-medium block mb-3">Agence</label>
              <select
                value={agenceId}
                onChange={e => setAgenceId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-slate-200 text-base focus:outline-none focus:border-indigo-500"
              >
                <option value="">— Sélectionner une agence (optionnel) —</option>
                {agences.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>

            {/* Date + Heure séparés et grands */}
            <div>
              <label className="text-slate-400 text-sm font-medium block mb-3">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-5 text-white text-xl font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
                style={{ colorScheme: 'dark' }}
              />
            </div>

            <div>
              <label className="text-slate-400 text-sm font-medium block mb-3">Heure</label>
              <input
                type="time"
                required
                value={heure}
                onChange={e => setHeure(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-5 text-white text-3xl font-bold text-center focus:outline-none focus:border-indigo-500 cursor-pointer tracking-widest"
                style={{ colorScheme: 'dark' }}
              />
            </div>

            {/* Créneaux rapides */}
            <div>
              <label className="text-slate-400 text-sm font-medium block mb-3">Créneaux rapides</label>
              <div className="grid grid-cols-4 gap-2">
                {['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map(h => (
                  <button
                    key={h} type="button"
                    onClick={() => setHeure(h)}
                    className={`py-3 rounded-xl text-sm font-semibold transition ${heure === h ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-slate-400 text-sm font-medium block mb-3">Note</label>
              <textarea
                placeholder="Objet de l'appel, contexte..."
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white placeholder-slate-600 text-base focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-4 rounded-2xl text-base font-semibold transition">
                Annuler
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-4 rounded-2xl text-base font-semibold transition">
                {saving ? 'Enregistrement…' : '+ Créer le rappel'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rappels à venir — groupés par jour */}
      {aVenir.length === 0 && !showForm ? (
        <div className="text-center py-24">
          <div className="text-6xl mb-6">🔔</div>
          <p className="text-slate-500 text-xl mb-2">Aucun rappel planifié</p>
          <p className="text-slate-600 text-base">Appuie sur "+ Nouveau" pour en créer un</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupes).map(([jour, items]) => (
            <div key={jour}>
              <div className="text-slate-500 text-sm font-semibold uppercase tracking-widest mb-4 capitalize">{jour}</div>
              <div className="space-y-3">
                {items.map(r => (
                  <div
                    key={r.id}
                    className={`bg-slate-900 border rounded-2xl p-6 ${isLate(r.dateHeure) ? 'border-red-500/50' : 'border-slate-800'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">

                        {/* Heure — grosse */}
                        <div className={`text-3xl font-bold mb-1 ${isLate(r.dateHeure) ? 'text-red-400' : 'text-white'}`}>
                          {new Date(r.dateHeure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {isLate(r.dateHeure) && (
                            <span className="ml-3 text-xs font-semibold bg-red-900/50 text-red-400 px-2.5 py-1 rounded-full align-middle">En retard</span>
                          )}
                        </div>

                        {/* Agence */}
                        {r.agence && (
                          <div className="text-indigo-400 font-semibold text-lg mb-1">{r.agence.nom}</div>
                        )}

                        {/* Note */}
                        {r.note && <p className="text-slate-400 text-sm mt-2 leading-relaxed">{r.note}</p>}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleFait(r.id)}
                          className="bg-green-700 hover:bg-green-600 text-white px-5 py-3 rounded-xl text-sm font-semibold transition"
                        >
                          ✅ Fait
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="text-slate-600 hover:text-red-400 py-2 transition text-center text-lg"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Faits */}
      {faits.length > 0 && (
        <details className="mt-10 opacity-40 hover:opacity-60 transition-opacity">
          <summary className="text-slate-500 text-sm cursor-pointer select-none mb-4">
            {faits.length} rappel{faits.length > 1 ? 's' : ''} effectué{faits.length > 1 ? 's' : ''}
          </summary>
          <div className="space-y-2">
            {faits.map(r => (
              <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  {r.agence && <span className="text-slate-500 text-sm line-through">{r.agence.nom}</span>}
                  <div className="text-slate-600 text-xs mt-0.5">{formatDateHeure(r.dateHeure)}</div>
                </div>
                <button onClick={() => handleDelete(r.id)} className="text-slate-700 hover:text-red-400 transition text-lg">🗑</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
