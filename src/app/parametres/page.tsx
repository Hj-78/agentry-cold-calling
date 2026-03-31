'use client'

import { useState, useEffect } from 'react'
import { requestNotificationPermission } from '@/lib/notifications'

export default function ParametresPage() {
  const [objectifDefaut, setObjectifDefaut] = useState('50')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notifStatus, setNotifStatus] = useState<string>('')

  // SMTP
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [smtpSaved, setSmtpSaved] = useState(false)

  // iCloud Calendar
  const [icloudAppleId, setIcloudAppleId] = useState('')
  const [icloudAppPass, setIcloudAppPass] = useState('')
  const [icloudConnected, setIcloudConnected] = useState(false)
  const [icloudLoading, setIcloudLoading] = useState(true)
  const [icloudSaving, setIcloudSaving] = useState(false)
  const [icloudSuccess, setIcloudSuccess] = useState(false)
  const [icloudError, setIcloudError] = useState('')

  useEffect(() => {
    fetch('/api/parametres').then((r) => r.json()).then((data) => {
      if (data.OBJECTIF_DEFAUT) setObjectifDefaut(data.OBJECTIF_DEFAUT)
      if (data.SMTP_HOST) setSmtpHost(data.SMTP_HOST)
      if (data.SMTP_PORT) setSmtpPort(data.SMTP_PORT)
      if (data.SMTP_USER) setSmtpUser(data.SMTP_USER)
      if (data.SMTP_PASS) setSmtpPass(data.SMTP_PASS)
      if (data.SMTP_FROM) setSmtpFrom(data.SMTP_FROM)
    }).catch(() => {})

    // Vérifier connexion iCloud Calendar
    fetch('/api/calendar/settings').then(r => r.json()).then(d => {
      setIcloudConnected(d.configured)
      setIcloudAppleId(d.appleId || '')
      setIcloudLoading(false)
    }).catch(() => setIcloudLoading(false))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/parametres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ OBJECTIF_DEFAUT: objectifDefaut }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleNotif = async () => {
    const ok = await requestNotificationPermission()
    setNotifStatus(ok ? '✅ Notifications activées' : '❌ Permission refusée')
  }

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setSmtpSaving(true)
    await fetch('/api/parametres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SMTP_HOST: smtpHost,
        SMTP_PORT: smtpPort,
        SMTP_USER: smtpUser,
        SMTP_PASS: smtpPass,
        SMTP_FROM: smtpFrom,
      }),
    })
    setSmtpSaving(false)
    setSmtpSaved(true)
    setTimeout(() => setSmtpSaved(false), 3000)
  }

  const handleSaveIcloud = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!icloudAppleId || !icloudAppPass) return
    setIcloudSaving(true)
    setIcloudError('')
    setIcloudSuccess(false)
    try {
      const res = await fetch('/api/calendar/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appleId: icloudAppleId, appPassword: icloudAppPass }),
      })
      const data = await res.json()
      if (data.ok) {
        setIcloudConnected(true)
        setIcloudSuccess(true)
        setIcloudAppPass('')
        setTimeout(() => setIcloudSuccess(false), 4000)
      } else {
        setIcloudError(data.error || 'Erreur de connexion')
      }
    } catch {
      setIcloudError('Erreur réseau')
    }
    setIcloudSaving(false)
  }

  const handleDisconnectIcloud = async () => {
    await fetch('/api/calendar/settings', { method: 'DELETE' })
    setIcloudConnected(false)
    setIcloudAppleId('')
    setIcloudAppPass('')
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
      alert(`${data.imported} agence(s) importée(s) ✅`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-10 md:py-14">

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white">Paramètres</h1>
      </div>

      {/* Objectif */}
      <form onSubmit={handleSave}>
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-5">
          <h2 className="text-white font-semibold text-lg mb-2">🎯 Objectif quotidien</h2>
          <p className="text-slate-500 text-sm mb-6">Nombre d&apos;appels à réaliser par jour par défaut.</p>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="1"
              max="500"
              value={objectifDefaut}
              onChange={(e) => setObjectifDefaut(e.target.value)}
              className="w-32 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-xl font-bold text-center"
            />
            <span className="text-slate-500 text-base">appels / jour</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-semibold text-base transition disabled:opacity-50 mb-8"
        >
          {saving ? 'Enregistrement…' : saved ? '✅ Sauvegardé !' : '💾 Sauvegarder'}
        </button>
      </form>

      {/* Notifications */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-5">
        <h2 className="text-white font-semibold text-lg mb-2">🔔 Notifications</h2>
        <p className="text-slate-500 text-sm mb-6">Active les notifications push pour les rappels. iPhone iOS 16.4+ requis.</p>
        <button
          onClick={handleNotif}
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-3 rounded-xl text-sm font-medium transition"
        >
          Activer les notifications
        </button>
        {notifStatus && <p className="text-sm mt-4 text-slate-400">{notifStatus}</p>}
      </div>

      {/* Données */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-5">
        <h2 className="text-white font-semibold text-lg mb-2">📊 Import / Export</h2>
        <p className="text-slate-500 text-sm mb-6">Exporte ou importe toutes tes agences au format CSV.</p>
        <div className="flex gap-3">
          <button
            onClick={handleExportCSV}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-3 rounded-xl text-sm font-medium transition"
          >
            📤 Exporter CSV
          </button>
          <label className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-3 rounded-xl text-sm font-medium transition cursor-pointer">
            📥 Importer CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
          </label>
        </div>
      </div>

      {/* Email SMTP */}
      <form onSubmit={handleSaveSmtp}>
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-5">
          <h2 className="text-white font-semibold text-lg mb-2">✉️ Configuration email</h2>
          <p className="text-slate-500 text-sm mb-6">
            Configure ton compte email pour envoyer des mails directement depuis l&apos;app.<br />
            <span className="text-slate-600">Gmail : host = smtp.gmail.com, port = 587, mot de passe d&apos;application requis.</span>
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-500 text-xs font-medium block mb-1.5">Serveur SMTP</label>
                <input
                  type="text"
                  placeholder="smtp.gmail.com"
                  value={smtpHost}
                  onChange={e => setSmtpHost(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-slate-500 text-xs font-medium block mb-1.5">Port</label>
                <input
                  type="number"
                  placeholder="587"
                  value={smtpPort}
                  onChange={e => setSmtpPort(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="text-slate-500 text-xs font-medium block mb-1.5">Email / identifiant</label>
              <input
                type="email"
                placeholder="ton.email@gmail.com"
                value={smtpUser}
                onChange={e => setSmtpUser(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-slate-500 text-xs font-medium block mb-1.5">Mot de passe / app password</label>
              <input
                type="password"
                placeholder="••••••••••••••••"
                value={smtpPass}
                onChange={e => setSmtpPass(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-slate-500 text-xs font-medium block mb-1.5">Nom affiché (expéditeur)</label>
              <input
                type="text"
                placeholder="Prénom Nom – Agence"
                value={smtpFrom}
                onChange={e => setSmtpFrom(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
        <button
          type="submit"
          disabled={smtpSaving}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-semibold text-base transition disabled:opacity-50 mb-8"
        >
          {smtpSaving ? 'Enregistrement…' : smtpSaved ? '✅ Config email sauvegardée !' : '💾 Sauvegarder config email'}
        </button>
      </form>

      {/* iCloud Calendar */}
      <form onSubmit={handleSaveIcloud}>
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-5">
          <h2 className="text-white font-semibold text-lg mb-1">🍎 iCloud Calendar</h2>
          <p className="text-slate-500 text-sm mb-2">
            Connecte ton calendrier iCloud pour créer automatiquement des RDV lors de tes sessions.
          </p>
          <p className="text-slate-600 text-xs mb-6">
            Nécessite un <strong className="text-slate-400">mot de passe d&apos;application</strong> Apple —{' '}
            <a href="https://appleid.apple.com/account/manage" target="_blank" className="text-indigo-400 hover:text-indigo-300 underline">
              le générer sur appleid.apple.com
            </a>
          </p>

          {icloudSuccess && (
            <div className="bg-green-900/30 border border-green-700 rounded-xl p-3 mb-4 text-green-300 text-sm">
              ✅ iCloud Calendar connecté avec succès !
            </div>
          )}
          {icloudError && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 mb-4 text-red-300 text-sm">
              ❌ {icloudError}
            </div>
          )}

          {icloudLoading ? (
            <div className="text-slate-500 text-sm">Vérification…</div>
          ) : icloudConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-green-400 text-sm font-medium">Connecté — {icloudAppleId}</span>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-slate-500 text-xs font-medium block mb-1.5">Apple ID</label>
                  <input type="email" value={icloudAppleId} onChange={e => setIcloudAppleId(e.target.value)}
                    placeholder="prenom@icloud.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium block mb-1.5">Nouveau mot de passe d&apos;application</label>
                  <input type="password" value={icloudAppPass} onChange={e => setIcloudAppPass(e.target.value)}
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={icloudSaving || !icloudAppleId || !icloudAppPass}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-semibold transition">
                  {icloudSaving ? 'Vérification…' : '🔄 Mettre à jour'}
                </button>
                <button type="button" onClick={handleDisconnectIcloud}
                  className="text-slate-500 hover:text-red-400 text-xs px-4 transition">
                  Déconnecter
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-slate-500 text-xs font-medium block mb-1.5">Apple ID</label>
                <input type="email" value={icloudAppleId} onChange={e => setIcloudAppleId(e.target.value)}
                  placeholder="prenom@icloud.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-slate-500 text-xs font-medium block mb-1.5">Mot de passe d&apos;application</label>
                <input type="password" value={icloudAppPass} onChange={e => setIcloudAppPass(e.target.value)}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="submit" disabled={icloudSaving || !icloudAppleId || !icloudAppPass}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-semibold transition">
                {icloudSaving ? 'Connexion en cours…' : '🍎 Connecter iCloud Calendar'}
              </button>
            </div>
          )}
        </div>
      </form>

      {/* iPhone */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
        <h2 className="text-white font-semibold text-lg mb-2">📱 Installer sur iPhone</h2>
        <p className="text-slate-500 text-sm mb-6">Ajoute l&apos;app à ton écran d&apos;accueil pour l&apos;utiliser comme une vraie app.</p>
        <ol className="space-y-3">
          {[
            ['Safari', 'Ouvre cette app dans Safari'],
            ['Partager', 'Appuie sur l\'icône Partager (carré + flèche)'],
            ['Écran d\'accueil', 'Sélectionne « Sur l\'écran d\'accueil »'],
            ['Ajouter', 'Appuie sur Ajouter'],
          ].map(([step, desc], i) => (
            <li key={i} className="flex items-start gap-4">
              <span className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 text-sm font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div>
                <span className="text-white text-sm font-medium">{step}</span>
                <span className="text-slate-500 text-sm"> — {desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
