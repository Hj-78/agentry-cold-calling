'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedAgence {
  nom: string
  telephone: string
  ville: string
  adresse: string
  horaires: string
}

interface ImportResult {
  added: number
  duplicates: number
  errors: number
}

interface ScrapeResult {
  nom: string
  telephone: string
  adresse: string
  ville: string
  horaires: string
  website?: string
}

// ─── Column detection ────────────────────────────────────────────────────────

const COLUMN_MAP: Record<string, keyof ParsedAgence> = {
  // Nom
  name: 'nom', nom: 'nom', title: 'nom', 'business name': 'nom',
  entreprise: 'nom', établissement: 'nom', raison: 'nom',
  // Téléphone
  phone: 'telephone', téléphone: 'telephone', telephone: 'telephone',
  tel: 'telephone', mobile: 'telephone', 'numéro': 'telephone',
  numero: 'telephone', 'phone number': 'telephone', 'contact': 'telephone',
  // Ville
  city: 'ville', ville: 'ville', locality: 'ville', localité: 'ville',
  commune: 'ville', municipality: 'ville',
  // Adresse
  address: 'adresse', adresse: 'adresse', rue: 'adresse',
  'street address': 'adresse', location: 'adresse',
  // Horaires
  hours: 'horaires', horaires: 'horaires', 'opening hours': 'horaires',
  "heures d'ouverture": 'horaires', schedule: 'horaires', timetable: 'horaires',
}

function detectColumn(header: string): keyof ParsedAgence | null {
  const h = header.toLowerCase().trim()
  if (COLUMN_MAP[h]) return COLUMN_MAP[h]
  // Partial match
  for (const [key, field] of Object.entries(COLUMN_MAP)) {
    if (h.includes(key) || key.includes(h)) return field
  }
  return null
}

function mapRow(row: Record<string, string>, mapping: Record<string, keyof ParsedAgence>): ParsedAgence {
  const result: ParsedAgence = { nom: '', telephone: '', ville: '', adresse: '', horaires: '' }
  for (const [col, field] of Object.entries(mapping)) {
    const val = (row[col] || '').toString().trim()
    if (val && !result[field]) result[field] = val
  }
  return result
}

function parseRows(rawRows: Record<string, string>[]): { rows: ParsedAgence[]; mapping: Record<string, keyof ParsedAgence> } {
  if (!rawRows.length) return { rows: [], mapping: {} }
  const headers = Object.keys(rawRows[0])
  const mapping: Record<string, keyof ParsedAgence> = {}
  for (const h of headers) {
    const field = detectColumn(h)
    if (field) mapping[h] = field
  }
  const rows = rawRows
    .map(r => mapRow(r, mapping))
    .filter(r => r.nom.trim())
  return { rows, mapping }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [tab, setTab] = useState<'file' | 'scrape'>('file')

  // File state
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedAgence[]>([])
  const [rawCount, setRawCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [mapping, setMapping] = useState<Record<string, keyof ParsedAgence>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Manual mapping fallback (quand auto-détection échoue)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRawRows, setCsvRawRows] = useState<Record<string, string>[]>([])
  const [manualMapping, setManualMapping] = useState<Record<string, keyof ParsedAgence | ''>>({})
  const [showManualMapping, setShowManualMapping] = useState(false)

  // Scrape state
  const [keyword, setKeyword] = useState('agence immobilière')
  const [scrapeCity, setScrapeCity] = useState('')
  const [maxResults, setMaxResults] = useState(15)
  const [scraping, setScraping] = useState(false)
  const [scrapeResults, setScrapeResults] = useState<ScrapeResult[]>([])
  const [scrapeStatus, setScrapeStatus] = useState('')
  const [scrapeError, setScrapeError] = useState('')
  const [scrapeImporting, setScrapeImporting] = useState(false)
  const [scrapeImportResult, setScrapeImportResult] = useState<ImportResult | null>(null)
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  // ── File parsing ──────────────────────────────────────────────────────────

  const finalizeParsed = (rows: ParsedAgence[]) => {
    const seen = new Set<string>()
    let dupes = 0
    const unique: ParsedAgence[] = []
    for (const r of rows) {
      const key = `${r.nom.toLowerCase().trim()}|${r.telephone.replace(/\s/g, '')}`
      if (seen.has(key)) { dupes++; continue }
      seen.add(key)
      unique.push(r)
    }
    setDuplicateCount(dupes)
    setParsed(unique)
  }

  const processFile = useCallback(async (file: File) => {
    setParseError('')
    setImportResult(null)
    setParsed([])
    setShowManualMapping(false)
    setFileName(file.name)

    const ext = file.name.split('.').pop()?.toLowerCase()

    try {
      let rawRows: Record<string, string>[] = []

      if (ext === 'csv') {
        const text = await file.text()
        // Supprimer le BOM UTF-8 — Google Sheets exporte avec \uFEFF en début de fichier
        const cleanText = text.replace(/^\uFEFF/, '')
        const lines = cleanText.split('\n').filter(l => l.trim())

        // Essayer toutes les combinaisons : (skip 0 ou 1 ligne) × (auto, ',', ';', '\t')
        // et prendre celle qui donne le plus de colonnes sans __parsed_extra
        const parse = (src: string, delimiter?: string) =>
          Papa.parse<Record<string, string>>(src, {
            header: true,
            skipEmptyLines: true,
            transformHeader: h => h.trim(),
            ...(delimiter !== undefined ? { delimiter } : {}),
          }).data

        const score = (rows: Record<string, string>[]) => {
          if (!rows.length) return -1
          const keys = Object.keys(rows[0])
          const hasExtra = keys.includes('__parsed_extra')
          return (hasExtra ? 0 : keys.length) * rows.length
        }

        const candidates: Record<string, string>[][] = []
        for (const skip of [0, 1]) {
          if (skip >= lines.length) continue
          const src = lines.slice(skip).join('\n')
          for (const delim of [undefined, ',', ';', '\t']) {
            candidates.push(parse(src, delim))
          }
        }

        rawRows = candidates.reduce((best, cur) =>
          score(cur) > score(best) ? cur : best
        , [])
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
      } else {
        setParseError('Format non supporté. Utilisez .csv, .xlsx ou .xls')
        return
      }

      setRawCount(rawRows.length)

      if (rawRows.length === 0) {
        setParseError('Le fichier est vide ou ne contient aucune ligne valide.')
        return
      }

      const headers = Object.keys(rawRows[0])
      setCsvHeaders(headers)
      setCsvRawRows(rawRows)

      const { rows, mapping: m } = parseRows(rawRows)
      setMapping(m)

      // Si la colonne "nom" n'est pas détectée → mapping manuel
      const hasNom = Object.values(m).includes('nom')
      if (!hasNom) {
        const initial: Record<string, keyof ParsedAgence | ''> = {}
        for (const h of headers) initial[h] = m[h] || ''
        setManualMapping(initial)
        setShowManualMapping(true)
        return
      }

      finalizeParsed(rows)
    } catch (e) {
      setParseError(`Erreur de lecture : ${e instanceof Error ? e.message : 'Inconnue'}`)
    }
  }, [])

  const applyManualMapping = () => {
    const rows = csvRawRows
      .map(row => {
        const result: ParsedAgence = { nom: '', telephone: '', ville: '', adresse: '', horaires: '' }
        for (const [col, field] of Object.entries(manualMapping)) {
          if (!field) continue
          const val = (row[col] || '').toString().trim()
          if (val && !result[field]) result[field] = val
        }
        return result
      })
      .filter(r => r.nom.trim())

    if (rows.length === 0) {
      setParseError('Aucune ligne valide. Assurez-vous d\'assigner la colonne "Nom de l\'agence".')
      return
    }

    setParseError('')
    setShowManualMapping(false)
    // Reconstruire le mapping affiché depuis les sélections manuelles
    const resolvedMapping: Record<string, keyof ParsedAgence> = {}
    for (const [col, field] of Object.entries(manualMapping)) {
      if (field) resolvedMapping[col] = field
    }
    setMapping(resolvedMapping)
    finalizeParsed(rows)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!parsed.length) return
    setImporting(true)
    try {
      const agences = parsed.map(r => ({
        nom: r.nom,
        telephone: r.telephone || null,
        ville: r.ville || null,
        adresse: r.adresse || null,
        horaires: r.horaires || null,
        source: 'import_fichier',
      }))
      const res = await fetch('/api/agences/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agences }),
      })
      const data = await res.json()
      setImportResult(data)
      setParsed([])
      setFileName('')
    } catch {
      setParseError('Erreur lors de l\'import')
    }
    setImporting(false)
  }

  // ── Serveur local ─────────────────────────────────────────────────────────

  const checkServerStatus = useCallback(async () => {
    setServerStatus('checking')
    try {
      const res = await fetch('http://localhost:3333/health', {
        signal: AbortSignal.timeout(3000),
      })
      setServerStatus(res.ok ? 'online' : 'offline')
    } catch {
      setServerStatus('offline')
    }
  }, [])

  useEffect(() => {
    if (tab === 'scrape') checkServerStatus()
  }, [tab, checkServerStatus])

  // ── Scraping ──────────────────────────────────────────────────────────────

  const handleScrape = async () => {
    if (!scrapeCity.trim() || serverStatus !== 'online') return
    setScraping(true)
    setScrapeResults([])
    setScrapeError('')
    setScrapeStatus('Scraping en cours… (peut prendre 1 à 2 minutes)')
    setScrapeImportResult(null)

    try {
      const res = await fetch('http://localhost:3333/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), city: scrapeCity.trim(), maxResults }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScrapeError(data.error || 'Erreur scraping')
        setScrapeStatus('')
      } else if (data.message && (!data.results || data.results.length === 0)) {
        setScrapeError(data.message)
        setScrapeStatus('')
      } else {
        setScrapeResults(data.results || [])
        setScrapeStatus(`${(data.results || []).length} résultats trouvés`)
      }
    } catch (e) {
      setScrapeError(`Impossible de joindre le serveur local. Vérifiez qu'il tourne : npm run scraper`)
      setScrapeStatus('')
    }
    setScraping(false)
  }

  const handleScrapeImport = async () => {
    if (!scrapeResults.length) return
    setScrapeImporting(true)
    try {
      const agences = scrapeResults.map(r => ({
        nom: r.nom,
        telephone: r.telephone || null,
        ville: r.ville || null,
        adresse: r.adresse || null,
        source: 'scraping_googlemaps',
      }))
      const res = await fetch('/api/agences/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agences }),
      })
      const data = await res.json()
      setScrapeImportResult(data)
      setScrapeResults([])
    } catch {
      setScrapeError('Erreur import')
    }
    setScrapeImporting(false)
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-12">

      {/* Header */}
      <div className="mb-6 md:mb-10">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Import</h1>
        <p className="text-slate-500 text-sm mt-1">Importez des agences depuis un fichier ou scrapez Google Maps</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-6">
        {([
          { key: 'file', label: '📁 Fichier CSV / XLSX' },
          { key: 'scrape', label: '🗺 Google Maps' },
        ] as { key: typeof tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
              tab === t.key ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── FILE TAB ── */}
      {tab === 'file' && (
        <div className="space-y-5">

          {/* Zone de dépôt */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-8 md:p-12 text-center transition cursor-pointer ${
              dragging ? 'border-indigo-500 bg-indigo-900/20' : 'border-slate-700 hover:border-slate-600 bg-slate-900/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileInput}
            />
            <div className="text-4xl mb-3">📂</div>
            <p className="text-white font-semibold mb-1">
              {fileName ? `📄 ${fileName}` : 'Glisser un fichier ici'}
            </p>
            <p className="text-slate-500 text-sm mb-4">ou</p>
            <button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-semibold text-sm transition min-h-[48px]"
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
            >
              Choisir un fichier
            </button>
            <p className="text-slate-600 text-xs mt-4">CSV, XLSX, XLS — colonnes auto-détectées</p>
          </div>

          {parseError && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-2xl px-5 py-4 text-red-400 text-sm">
              ⚠️ {parseError}
            </div>
          )}

          {/* Mapping manuel — affiché quand l'auto-détection échoue */}
          {showManualMapping && csvHeaders.length > 0 && (
            <div className="bg-slate-900 border border-amber-700/40 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 bg-amber-900/10">
                <p className="text-amber-300 font-semibold text-sm">Colonnes non reconnues automatiquement</p>
                <p className="text-slate-400 text-xs mt-1">
                  {rawCount} lignes trouvées · Assignez chaque colonne à un champ CRM
                </p>
              </div>
              <div className="divide-y divide-slate-800">
                {csvHeaders.map(header => (
                  <div key={header} className="px-5 py-3 flex items-center justify-between gap-4">
                    <span className="text-slate-300 text-sm font-mono min-w-0 truncate flex-1">
                      {header}
                      {csvRawRows[0]?.[header] && (
                        <span className="text-slate-600 ml-2 font-sans font-normal">
                          ex: {String(csvRawRows[0][header]).slice(0, 30)}
                        </span>
                      )}
                    </span>
                    <select
                      value={manualMapping[header] || ''}
                      onChange={e => setManualMapping(prev => ({ ...prev, [header]: e.target.value as keyof ParsedAgence | '' }))}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 flex-shrink-0 w-44"
                    >
                      <option value="">— Ignorer —</option>
                      <option value="nom">Nom de l'agence ★</option>
                      <option value="telephone">Téléphone</option>
                      <option value="ville">Ville</option>
                      <option value="adresse">Adresse</option>
                      <option value="horaires">Horaires</option>
                    </select>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-slate-800">
                <button
                  onClick={applyManualMapping}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold text-sm transition"
                >
                  Appliquer le mapping →
                </button>
                <p className="text-slate-600 text-xs mt-2 text-center">★ Le champ "Nom de l'agence" est obligatoire</p>
              </div>
            </div>
          )}

          {/* Résultat de parsing */}
          {parsed.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              {/* Résumé */}
              <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap gap-4 items-center">
                <div>
                  <span className="text-white font-bold text-xl">{rawCount}</span>
                  <span className="text-slate-500 text-sm ml-1">lignes détectées</span>
                </div>
                <div>
                  <span className="text-green-400 font-bold text-xl">{parsed.length}</span>
                  <span className="text-slate-500 text-sm ml-1">à importer</span>
                </div>
                {duplicateCount > 0 && (
                  <div>
                    <span className="text-amber-400 font-bold text-xl">{duplicateCount}</span>
                    <span className="text-slate-500 text-sm ml-1">doublons ignorés</span>
                  </div>
                )}
              </div>

              {/* Colonnes détectées */}
              {Object.keys(mapping).length > 0 && (
                <div className="px-5 py-3 border-b border-slate-800">
                  <p className="text-slate-500 text-xs mb-2">Colonnes mappées :</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(mapping).map(([col, field]) => (
                      <span key={col} className="bg-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded-lg">
                        <span className="text-slate-500">{col}</span> → <span className="text-indigo-400 font-medium">{field}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Aperçu 5 premières lignes */}
              <div className="divide-y divide-slate-800">
                {parsed.slice(0, 5).map((row, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                      <span className="text-white font-medium text-sm">{row.nom}</span>
                      {row.ville && <span className="text-slate-500 text-xs">{row.ville}</span>}
                      {row.telephone && <span className="text-indigo-400 text-xs">{row.telephone}</span>}
                    </div>
                    {row.adresse && <p className="text-slate-600 text-xs mt-0.5">{row.adresse}</p>}
                  </div>
                ))}
                {parsed.length > 5 && (
                  <div className="px-5 py-3 text-slate-600 text-xs">
                    + {parsed.length - 5} autres agences…
                  </div>
                )}
              </div>

              {/* Bouton import */}
              <div className="px-5 py-4 border-t border-slate-800">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-base transition min-h-[56px]"
                >
                  {importing ? 'Import en cours…' : `📥 Importer ${parsed.length} agence${parsed.length > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}

          {/* Résultat import */}
          {importResult && (
            <div className="bg-green-900/20 border border-green-700/50 rounded-2xl px-5 py-5 text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-green-300 font-bold text-lg">Import terminé !</p>
              <p className="text-slate-400 text-sm mt-2">
                <span className="text-green-400 font-bold">{importResult.added}</span> agences ajoutées
                {importResult.duplicates > 0 && (
                  <> · <span className="text-amber-400 font-bold">{importResult.duplicates}</span> doublons ignorés</>
                )}
              </p>
            </div>
          )}

          {/* Format info */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-slate-400 text-sm font-semibold mb-3">📋 Colonnes reconnues automatiquement</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { field: 'Nom', aliases: 'name, nom, title, business name' },
                { field: 'Téléphone', aliases: 'phone, tel, mobile, numéro' },
                { field: 'Ville', aliases: 'city, ville, locality' },
                { field: 'Adresse', aliases: 'address, adresse, rue' },
                { field: 'Horaires', aliases: 'hours, horaires, opening hours' },
              ].map(item => (
                <div key={item.field} className="bg-slate-800 rounded-xl px-4 py-3">
                  <p className="text-indigo-400 text-xs font-semibold">{item.field}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{item.aliases}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SCRAPE TAB ── */}
      {tab === 'scrape' && (
        <div className="space-y-5">

          {/* Statut du serveur local */}
          <div className={`rounded-2xl px-5 py-4 flex items-center justify-between gap-3 ${
            serverStatus === 'online'
              ? 'bg-green-900/20 border border-green-700/40'
              : serverStatus === 'offline'
              ? 'bg-red-900/20 border border-red-700/40'
              : 'bg-slate-900 border border-slate-800'
          }`}>
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                serverStatus === 'online' ? 'bg-green-400' :
                serverStatus === 'offline' ? 'bg-red-400' : 'bg-slate-500 animate-pulse'
              }`} />
              <div>
                {serverStatus === 'online' && (
                  <>
                    <p className="text-green-300 text-sm font-semibold">Serveur local actif</p>
                    <p className="text-slate-500 text-xs">http://localhost:3333 — prêt à scraper</p>
                  </>
                )}
                {serverStatus === 'offline' && (
                  <>
                    <p className="text-red-300 text-sm font-semibold">Serveur local inactif</p>
                    <p className="text-slate-400 text-xs">Dans un terminal : <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300">npm run scraper</code></p>
                  </>
                )}
                {serverStatus === 'checking' && (
                  <p className="text-slate-400 text-sm">Vérification du serveur local…</p>
                )}
              </div>
            </div>
            <button
              onClick={checkServerStatus}
              className="text-slate-500 hover:text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 transition flex-shrink-0"
            >
              Vérifier
            </button>
          </div>

          {/* Formulaire */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-white font-semibold">🗺 Scraper Google Maps</h2>
            <p className="text-slate-500 text-sm">Récupère automatiquement les agences immobilières d'une ville depuis Google Maps, sans API payante.</p>

            <div>
              <label className="text-slate-400 text-sm block mb-2">Mot-clé</label>
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="agence immobilière"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-indigo-500 min-h-[48px]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-slate-400 text-sm block mb-2">Ville *</label>
                <input
                  type="text"
                  value={scrapeCity}
                  onChange={e => setScrapeCity(e.target.value)}
                  placeholder="ex: Paris, Lyon, Bordeaux…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-indigo-500 min-h-[48px]"
                />
              </div>
              <div>
                <label className="text-slate-400 text-sm block mb-2">Nb max</label>
                <select
                  value={maxResults}
                  onChange={e => setMaxResults(parseInt(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-white text-base focus:outline-none focus:border-indigo-500 min-h-[48px]"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleScrape}
              disabled={scraping || !scrapeCity.trim() || serverStatus !== 'online'}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-4 rounded-xl font-bold text-base transition min-h-[56px] flex items-center justify-center gap-2"
            >
              {scraping ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scraping en cours… (1-2 min)
                </>
              ) : serverStatus === 'offline' ? (
                '⚠️ Démarrez le serveur local d\'abord'
              ) : (
                '🔍 Lancer le scraping'
              )}
            </button>

            {scrapeStatus && !scraping && (
              <p className="text-green-400 text-sm text-center">{scrapeStatus}</p>
            )}

            {scraping && (
              <p className="text-slate-400 text-sm text-center animate-pulse">
                Navigation sur Google Maps… chaque fiche prend ~2s
              </p>
            )}
          </div>

          {scrapeError && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-2xl px-5 py-4 text-red-400 text-sm">
              ⚠️ {scrapeError}
            </div>
          )}

          {/* Résultats scraping */}
          {scrapeResults.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-white font-semibold">{scrapeResults.length} résultats</span>
                <span className="text-slate-500 text-xs">Aperçu avant import</span>
              </div>

              <div className="divide-y divide-slate-800 max-h-80 overflow-y-auto">
                {scrapeResults.map((r, i) => (
                  <div key={i} className="px-5 py-3">
                    <p className="text-white font-medium text-sm">{r.nom}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {r.ville && <span className="text-slate-500 text-xs">{r.ville}</span>}
                      {r.telephone && <span className="text-indigo-400 text-xs">{r.telephone}</span>}
                      {r.website && <span className="text-slate-600 text-xs truncate max-w-[160px]">{r.website}</span>}
                    </div>
                    {r.adresse && <p className="text-slate-600 text-xs mt-0.5 truncate">{r.adresse}</p>}
                    {r.horaires && <p className="text-slate-700 text-xs mt-0.5 truncate">{r.horaires}</p>}
                  </div>
                ))}
              </div>

              <div className="px-5 py-4 border-t border-slate-800">
                <button
                  onClick={handleScrapeImport}
                  disabled={scrapeImporting}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-base transition min-h-[56px]"
                >
                  {scrapeImporting ? 'Import en cours…' : `📥 Importer ${scrapeResults.length} agences dans le CRM`}
                </button>
              </div>
            </div>
          )}

          {scrapeImportResult && (
            <div className="bg-green-900/20 border border-green-700/50 rounded-2xl px-5 py-5 text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-green-300 font-bold text-lg">Import terminé !</p>
              <p className="text-slate-400 text-sm mt-2">
                <span className="text-green-400 font-bold">{scrapeImportResult.added}</span> agences ajoutées
                {scrapeImportResult.duplicates > 0 && (
                  <> · <span className="text-amber-400 font-bold">{scrapeImportResult.duplicates}</span> doublons ignorés</>
                )}
              </p>
            </div>
          )}

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4">
            <p className="text-slate-500 text-xs font-semibold mb-2 uppercase tracking-wide">Comment ça marche</p>
            <ol className="text-slate-500 text-xs space-y-1 list-decimal list-inside">
              <li>Démarrez le serveur local dans un terminal : <code className="text-amber-300">npm run scraper</code></li>
              <li>Saisissez un mot-clé et une ville, lancez le scraping</li>
              <li>Le scraping tourne sur votre Mac (Playwright + Chromium)</li>
              <li>Les résultats s'affichent en aperçu, puis importez dans le CRM</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
