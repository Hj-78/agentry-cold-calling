'use client'

import { useState, useEffect, useRef } from 'react'

interface Agence {
  id: number
  nom: string
  telephone: string | null
  email: string | null
  adresse: string | null
  ville: string | null
  statut: string
  notes: string | null
  commentaire: string | null
  reviewCount: number | null
  averageRating: number | null
  website: string | null
  source: string | null
}

interface PlaceResult {
  place_id: string
  name: string
  formatted_address: string
  formatted_phone_number?: string | null
}

const STATUTS = [
  { value: 'nouveau', label: 'Nouveau', dot: 'bg-slate-400', row: '' },
  { value: 'appele', label: 'Déjà appelé', dot: 'bg-slate-600', row: 'opacity-60' },
  { value: 'interesse', label: 'Intéressé', dot: 'bg-green-400', row: 'bg-green-950/30' },
  { value: 'rappeler', label: 'À rappeler', dot: 'bg-amber-400', row: 'bg-amber-950/30' },
  { value: 'refuse', label: 'Refusé', dot: 'bg-red-500', row: 'bg-red-950/20' },
  { value: 'converti', label: 'Converti', dot: 'bg-indigo-400', row: 'bg-indigo-950/40' },
]

type SortKey = 'nom' | 'ville' | 'averageRating' | 'reviewCount' | 'statut'

function getStatut(value: string) {
  return STATUTS.find(s => s.value === value) || STATUTS[0]
}

const emptyForm = { nom: '', telephone: '', email: '', adresse: '', ville: '', notes: '', website: '' }

interface HistoriqueAppel {
  id: number
  resultat: string | null
  resume: string | null
  noteRapide: string | null
  duree: number | null
  rdvPris: boolean | null
  rdvDate: string | null
  rdvHeure: string | null
  createdAt: string
}

const RESULTAT_LABELS: Record<string, { label: string; color: string }> = {
  interesse: { label: 'Intéressé', color: 'text-green-400' },
  rappeler: { label: 'À rappeler', color: 'text-amber-400' },
  pas_repondu: { label: 'Pas répondu', color: 'text-slate-400' },
  messagerie: { label: 'Messagerie', color: 'text-blue-400' },
  pas_interesse: { label: 'Pas intéressé', color: 'text-red-400' },
}

function formatDureeShort(s: number | null) {
  if (!s) return null
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m${String(sec).padStart(2, '0')}s` : `${sec}s`
}

export default function AgencesPage() {
  const [agences, setAgences] = useState<Agence[]>([])
  const [filtre, setFiltre] = useState('tous')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showMaps, setShowMaps] = useState(false)
  const [mapsQuery, setMapsQuery] = useState('')
  const [mapsResults, setMapsResults] = useState<PlaceResult[]>([])
  const [mapsLoading, setMapsLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [historiqueByAgence, setHistoriqueByAgence] = useState<Record<number, HistoriqueAppel[]>>({})
  const [showDiscover, setShowDiscover] = useState(false)
  const [discoverVilles, setDiscoverVilles] = useState('')
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverResult, setDiscoverResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('ville')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchAgences = async () => {
    const res = await fetch('/api/agences')
    setAgences(await res.json())
  }

  useEffect(() => { fetchAgences() }, [])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = [...agences].sort((a, b) => {
    let va: string | number = '', vb: string | number = ''
    if (sortKey === 'nom') { va = a.nom.toLowerCase(); vb = b.nom.toLowerCase() }
    else if (sortKey === 'ville') { va = (a.ville || '').toLowerCase(); vb = (b.ville || '').toLowerCase() }
    else if (sortKey === 'averageRating') { va = a.averageRating ?? -1; vb = b.averageRating ?? -1 }
    else if (sortKey === 'reviewCount') { va = a.reviewCount ?? -1; vb = b.reviewCount ?? -1 }
    else if (sortKey === 'statut') { va = a.statut; vb = b.statut }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const filtered = sorted.filter((a) => {
    const matchStatut = filtre === 'tous' || a.statut === filtre
    const matchSearch = !search ||
      a.nom.toLowerCase().includes(search.toLowerCase()) ||
      (a.telephone || '').includes(search) ||
      (a.ville || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.adresse || '').toLowerCase().includes(search.toLowerCase())
    return matchStatut && matchSearch
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingId) {
      await fetch('/api/agences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...form }),
      })
    } else {
      await fetch('/api/agences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'manual' }),
      })
    }
    setForm(emptyForm); setShowForm(false); setEditingId(null)
    fetchAgences()
  }

  const handleStatutChange = async (id: number, statut: string) => {
    await fetch('/api/agences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, statut }),
    })
    fetchAgences()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette agence ?')) return
    await fetch(`/api/agences?id=${id}`, { method: 'DELETE' })
    setExpandedRow(null)
    fetchAgences()
  }

  const handleMapsSearch = async () => {
    if (!mapsQuery.trim()) return
    setMapsLoading(true)
    const res = await fetch('/api/google-places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mapsQuery }),
    })
    const data = await res.json()
    if (data.error) alert(data.error)
    else setMapsResults(data.results || [])
    setMapsLoading(false)
  }

  const handleAddFromMaps = async (place: PlaceResult) => {
    await fetch('/api/agences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom: place.name,
        telephone: place.formatted_phone_number || '',
        adresse: place.formatted_address,
        source: 'google_maps',
        googlePlaceId: place.place_id,
      }),
    })
    fetchAgences()
  }

  const handleExportCSV = async () => {
    const res = await fetch('/api/export-csv')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'agences.csv'; a.click()
  }

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const csv = ev.target?.result as string
      const res = await fetch('/api/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      const data = await res.json()
      alert(`${data.imported} agence(s) importée(s)`)
      fetchAgences()
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const statsCounts = STATUTS.reduce((acc, s) => {
    acc[s.value] = agences.filter(a => a.statut === s.value).length
    return acc
  }, {} as Record<string, number>)

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1 hover:text-white transition ${sortKey === k ? 'text-white' : 'text-slate-500'}`}
    >
      {label}
      {sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  )

  return (
    <div className="flex flex-col h-screen md:h-auto">

      {/* Header */}
      <div className="px-6 pt-8 pb-4 md:pt-10 flex-shrink-0">
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="text-slate-500 text-base mb-1">{filtered.length}/{agences.length} agences</p>
            <h1 className="text-3xl font-bold text-white">Agences</h1>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm) }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
            >
              + Ajouter
            </button>
            <button
              onClick={() => setShowMaps(!showMaps)}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-medium transition"
            >
              🔍 Maps
            </button>
            <button
              onClick={() => { setShowDiscover(!showDiscover); setDiscoverResult(null) }}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-medium transition"
            >
              🌍 Auto
            </button>
            <label className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-medium transition cursor-pointer">
              📥
              <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
            </label>
            <button
              onClick={handleExportCSV}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-medium transition"
            >
              📤
            </button>
          </div>
        </div>

        {/* Filtres statut */}
        <div className="flex gap-2 flex-wrap mb-4">
          {[{ value: 'tous', label: 'Tous', count: agences.length, dot: 'bg-slate-500' }, ...STATUTS.map(s => ({ ...s, count: statsCounts[s.value] || 0 }))].map((s) => (
            <button
              key={s.value}
              onClick={() => setFiltre(s.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition ${
                filtre === s.value
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {s.label}
              <span className="text-slate-500 text-xs">{s.count}</span>
            </button>
          ))}
        </div>

        {/* Recherche */}
        <input
          ref={searchRef}
          placeholder="Rechercher nom, ville, téléphone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm mb-3"
        />
      </div>

      {/* Formulaire ajout/modif */}
      {showForm && (
        <div className="mx-6 mb-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex-shrink-0">
          <h2 className="text-white font-semibold mb-4">{editingId ? 'Modifier' : 'Nouvelle agence'}</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input required placeholder="Nom de l'agence *" value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Téléphone" value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm" />
              <input placeholder="Ville" value={form.ville}
                onChange={(e) => setForm({ ...form, ville: e.target.value })}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm" />
            </div>
            <input placeholder="Adresse" value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm" />
            <input placeholder="Site web" value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm" />
            <textarea placeholder="Notes" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm h-20 resize-none" />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }}
                className="text-slate-400 hover:text-white px-4 py-2 text-sm transition">Annuler</button>
              <button type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition">
                {editingId ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Google Maps */}
      {showMaps && (
        <div className="mx-6 mb-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex-shrink-0">
          <h2 className="text-white font-semibold mb-4">Recherche Google Maps</h2>
          <div className="flex gap-3 mb-4">
            <input placeholder="Ex: agences immobilières Paris 15" value={mapsQuery}
              onChange={(e) => setMapsQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleMapsSearch()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm" />
            <button onClick={handleMapsSearch} disabled={mapsLoading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
              {mapsLoading ? '…' : 'Chercher'}
            </button>
          </div>
          {mapsResults.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {mapsResults.map((place) => (
                <div key={place.place_id} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">{place.name}</div>
                    <div className="text-slate-400 text-xs truncate">{place.formatted_address}</div>
                    {place.formatted_phone_number && <div className="text-indigo-400 text-xs">{place.formatted_phone_number}</div>}
                  </div>
                  <button onClick={() => handleAddFromMaps(place)}
                    className="ml-3 flex-shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                    + Ajouter
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Découverte automatique de nouvelles villes */}
      {showDiscover && (
        <div className="mx-6 mb-4 bg-slate-900 border border-indigo-800/40 rounded-2xl p-6 flex-shrink-0">
          <h2 className="text-white font-semibold mb-2">🌍 Découverte automatique</h2>
          <p className="text-slate-500 text-sm mb-4">Recherche automatiquement les agences immobilières sur Google Places pour les villes listées.</p>
          <div className="mb-3">
            <label className="text-slate-400 text-xs block mb-1.5">Villes à explorer (séparées par des virgules)</label>
            <input
              placeholder="Ex: Cergy, Pontoise, Éragny, Osny, Vauréal"
              value={discoverVilles}
              onChange={e => setDiscoverVilles(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={async () => {
                const villes = discoverVilles.split(',').map(v => v.trim()).filter(Boolean)
                if (villes.length === 0) return
                setDiscoverLoading(true)
                setDiscoverResult(null)
                try {
                  const res = await fetch('/api/discover-villes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ villes }),
                  })
                  const data = await res.json()
                  if (!data.error) {
                    setDiscoverResult({ imported: data.imported, skipped: data.skipped })
                    if (data.imported > 0) fetchAgences()
                  }
                } catch { /* silencieux */ }
                setDiscoverLoading(false)
              }}
              disabled={discoverLoading || !discoverVilles.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
            >
              {discoverLoading ? '⏳ Recherche en cours…' : '🚀 Lancer la découverte'}
            </button>
            {discoverResult && (
              <span className="text-green-400 text-sm font-medium">
                ✅ {discoverResult.imported} importée{discoverResult.imported > 1 ? 's' : ''} · {discoverResult.skipped} déjà en base
              </span>
            )}
          </div>
          <p className="text-slate-700 text-xs mt-2">Max 10 villes · 20 agences/ville · nécessite GOOGLE_PLACES_API_KEY</p>
        </div>
      )}

      {/* TABLE */}
      <div className="flex-1 overflow-auto px-6 pb-8">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-600">
            <div className="text-5xl mb-4">🏢</div>
            <p className="text-lg">Aucune agence trouvée</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 overflow-hidden">
            {/* En-tête tableau avec tri */}
            <div className="grid grid-cols-[2fr_1fr_1fr_80px_auto] bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-10">
              <SortBtn k="nom" label="Agence" />
              <SortBtn k="ville" label="Ville" />
              <div className="hidden md:flex items-center gap-3">
                <SortBtn k="averageRating" label="Note" />
                <span className="text-slate-700">·</span>
                <SortBtn k="reviewCount" label="Avis" />
              </div>
              <SortBtn k="statut" label="Statut" />
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tel</div>
            </div>

            {/* Lignes */}
            <div className="divide-y divide-slate-800/60">
              {filtered.map((agence, idx) => {
                const statut = getStatut(agence.statut)
                const isExpanded = expandedRow === agence.id

                return (
                  <div key={agence.id} className={statut.row}>
                    {/* Ligne principale */}
                    <div
                      className={`grid grid-cols-[2fr_1fr_1fr_80px_auto] items-center px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition ${isExpanded ? 'bg-white/[0.04]' : ''}`}
                      onClick={() => {
                        const newId = isExpanded ? null : agence.id
                        setExpandedRow(newId)
                        // Charge l'historique si pas encore chargé
                        if (newId && !historiqueByAgence[newId]) {
                          fetch(`/api/agences/${newId}`)
                            .then(r => r.json())
                            .then(data => setHistoriqueByAgence(prev => ({ ...prev, [newId]: data.appels || [] })))
                            .catch(() => setHistoriqueByAgence(prev => ({ ...prev, [newId]: [] })))
                        }
                      }}
                    >
                      {/* Nom */}
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className="text-slate-600 text-xs tabular-nums w-5 flex-shrink-0 hidden md:block">{idx + 1}</span>
                        <span className="text-white text-sm font-medium truncate">{agence.nom}</span>
                      </div>

                      {/* Ville */}
                      <div className="min-w-0 pr-2">
                        <span className="text-slate-400 text-sm truncate block">{agence.ville || '—'}</span>
                      </div>

                      {/* Note + Avis */}
                      <div className="hidden md:flex items-center gap-2 min-w-0 pr-2">
                        {agence.averageRating ? (
                          <span className="text-amber-400 text-sm font-medium">★ {agence.averageRating.toFixed(1)}</span>
                        ) : <span className="text-slate-700 text-sm">—</span>}
                        {agence.reviewCount ? (
                          <span className="text-slate-600 text-xs">({agence.reviewCount})</span>
                        ) : null}
                      </div>

                      {/* Statut */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <select
                          value={agence.statut}
                          onChange={(e) => handleStatutChange(agence.id, e.target.value)}
                          className={`bg-transparent text-xs font-medium rounded-lg px-2 py-1.5 border cursor-pointer focus:outline-none ${
                            agence.statut === 'interesse' ? 'border-green-700 text-green-400' :
                            agence.statut === 'rappeler' ? 'border-amber-700 text-amber-400' :
                            agence.statut === 'refuse' ? 'border-red-900 text-red-500' :
                            agence.statut === 'converti' ? 'border-indigo-700 text-indigo-400' :
                            agence.statut === 'appele' ? 'border-slate-600 text-slate-500' :
                            'border-slate-700 text-slate-400'
                          }`}
                          style={{ backgroundColor: '#0f172a' }}
                        >
                          {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>

                      {/* Téléphone */}
                      <div className="pl-2" onClick={(e) => e.stopPropagation()}>
                        {agence.telephone ? (
                          <a
                            href={`tel:${agence.telephone}`}
                            className="text-indigo-400 hover:text-indigo-300 text-xs transition font-mono whitespace-nowrap"
                          >
                            📞
                          </a>
                        ) : (
                          <span className="text-slate-700 text-sm">—</span>
                        )}
                      </div>
                    </div>

                    {/* Ligne étendue */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 bg-slate-900/50 border-t border-slate-800/50">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          {agence.telephone && (
                            <div>
                              <div className="text-slate-500 text-xs mb-1">Téléphone</div>
                              <a href={`tel:${agence.telephone}`} className="text-indigo-400 text-sm font-mono">{agence.telephone}</a>
                            </div>
                          )}
                          {agence.adresse && (
                            <div className="col-span-2">
                              <div className="text-slate-500 text-xs mb-1">Adresse</div>
                              <div className="text-slate-300 text-sm">{agence.adresse}</div>
                            </div>
                          )}
                          {agence.averageRating && (
                            <div>
                              <div className="text-slate-500 text-xs mb-1">Note Google</div>
                              <div className="text-amber-400 text-sm font-medium">★ {agence.averageRating.toFixed(1)} <span className="text-slate-500 font-normal">({agence.reviewCount} avis)</span></div>
                            </div>
                          )}
                          {agence.website && (
                            <div className="col-span-2">
                              <div className="text-slate-500 text-xs mb-1">Site web</div>
                              <a href={agence.website} target="_blank" rel="noopener noreferrer" className="text-indigo-400 text-sm truncate block hover:underline">{agence.website.replace(/^https?:\/\//, '').split('/')[0]}</a>
                            </div>
                          )}
                          {agence.commentaire && (
                            <div className="col-span-2 md:col-span-4">
                              <div className="text-slate-500 text-xs mb-1">Commentaire</div>
                              <div className="text-slate-300 text-sm italic">{agence.commentaire}</div>
                            </div>
                          )}
                          {agence.notes && (
                            <div className="col-span-2 md:col-span-4">
                              <div className="text-slate-500 text-xs mb-1">Notes</div>
                              <div className="text-slate-300 text-sm">{agence.notes}</div>
                            </div>
                          )}
                          {agence.email && (
                            <div>
                              <div className="text-slate-500 text-xs mb-1">Email</div>
                              <a href={`mailto:${agence.email}`} className="text-indigo-400 text-sm">{agence.email}</a>
                            </div>
                          )}
                        </div>
                        {/* Historique appels */}
                        {(() => {
                          const hist = historiqueByAgence[agence.id]
                          if (hist === undefined) return (
                            <div className="text-slate-600 text-xs py-2">Chargement historique…</div>
                          )
                          if (hist.length === 0) return (
                            <div className="text-slate-700 text-xs py-2 border-t border-slate-800/50 mt-3 pt-3">Aucun appel enregistré pour cette agence.</div>
                          )
                          return (
                            <div className="border-t border-slate-800/50 mt-3 pt-3">
                              <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">📞 Historique des appels ({hist.length})</div>
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {hist.map(appel => {
                                  const res = appel.resultat ? RESULTAT_LABELS[appel.resultat] : null
                                  const date = new Date(appel.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
                                  return (
                                    <div key={appel.id} className="bg-slate-800/50 rounded-lg px-3 py-2 text-xs">
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-slate-600">{date}</span>
                                          {res && <span className={`font-semibold ${res.color}`}>{res.label}</span>}
                                          {appel.rdvPris && <span className="text-green-400">📅 RDV {appel.rdvDate ? appel.rdvDate : ''} {appel.rdvHeure || ''}</span>}
                                        </div>
                                        {appel.duree && <span className="text-slate-600">{formatDureeShort(appel.duree)}</span>}
                                      </div>
                                      {appel.noteRapide && <p className="text-slate-400 italic">{appel.noteRapide}</p>}
                                      {appel.resume && <p className="text-slate-500 mt-0.5">{appel.resume}</p>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })()}

                        <div className="flex gap-3 items-center mt-3">
                          <button
                            onClick={() => {
                              setEditingId(agence.id)
                              setForm({
                                nom: agence.nom,
                                telephone: agence.telephone || '',
                                email: agence.email || '',
                                adresse: agence.adresse || '',
                                ville: agence.ville || '',
                                notes: agence.notes || '',
                                website: agence.website || '',
                              })
                              setShowForm(true)
                              setExpandedRow(null)
                            }}
                            className="text-slate-400 hover:text-white text-sm transition"
                          >
                            ✏️ Modifier
                          </button>
                          <button
                            onClick={() => handleDelete(agence.id)}
                            className="text-slate-600 hover:text-red-400 text-sm transition"
                          >
                            🗑️ Supprimer
                          </button>
                          {agence.telephone && (
                            <a
                              href={`tel:${agence.telephone}`}
                              className="ml-auto bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition"
                            >
                              📞 Appeler
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
