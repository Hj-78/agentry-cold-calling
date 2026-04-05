'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { EmailTemplate } from '@/lib/email-templates'

interface Agence {
  id: number
  nom: string
  email: string | null
  telephone: string | null
  ville: string | null
}

function applyVars(text: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{{${k}}}`, v), text)
}

export default function EmailsPage() {
  const [tab, setTab] = useState<'composer' | 'templates'>('composer')

  // Composer
  const [agences, setAgences] = useState<Agence[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [agenceId, setAgenceId] = useState('')
  const [agenceSearch, setAgenceSearch] = useState('')
  const [showAgenceDropdown, setShowAgenceDropdown] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [rdvDate, setRdvDate] = useState('')
  const [rdvHeure, setRdvHeure] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // Template editor
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [savingTemplates, setSavingTemplates] = useState(false)

  const agenceSearchRef = useRef<HTMLDivElement>(null)

  // Settings
  const [expediteur, setExpediteur] = useState('')

  useEffect(() => {
    fetch('/api/agences').then(r => r.json()).then((data: Agence[]) => setAgences(data))
    fetch('/api/email-templates').then(r => r.json()).then(setTemplates)
    fetch('/api/parametres').then(r => r.json()).then((d: Record<string, string>) => {
      setExpediteur(d.SMTP_FROM || d.SMTP_USER || '')
    })
  }, [])

  // Fermer le dropdown agence si clic en dehors
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (agenceSearchRef.current && !agenceSearchRef.current.contains(e.target as Node)) {
      setShowAgenceDropdown(false)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleClickOutside])

  const selectedAgence = agences.find(a => String(a.id) === agenceId)

  // When agency or template changes, recompute subject/body
  useEffect(() => {
    const t = templates.find(t => t.id === templateId)
    if (!t) return
    const rdvDateFr = rdvDate
      ? new Date(rdvDate + 'T12:00:00').toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        })
      : '{{rdvDate}}'
    const vars = {
      agence: selectedAgence?.nom || '',
      expediteur,
      rdvDate: rdvDateFr,
      rdvHeure: rdvHeure || '{{rdvHeure}}',
      resumeAppel: '',
    }
    setSubject(applyVars(t.sujet, vars))
    setBody(applyVars(t.corps, vars))
  }, [templateId, agenceId, templates, expediteur, selectedAgence?.nom, rdvDate, rdvHeure])

  // When agency changes, auto-fill email
  useEffect(() => {
    if (selectedAgence?.email) setTo(selectedAgence.email)
  }, [agenceId, selectedAgence?.email])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!to || !subject || !body) return
    setSending(true)
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          html: body,
          ...(templateId === 'rdv-confirmation' && rdvDate && rdvHeure ? {
            rdvDate,
            rdvHeure,
            agenceNom: selectedAgence?.nom || '',
            agenceEmail: to,
          } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erreur envoi'); setSending(false); return }
      setSent(true)
      setTimeout(() => setSent(false), 4000)
    } catch {
      setError('Erreur réseau')
    }
    setSending(false)
  }

  // Template editor
  const handleSaveTemplates = async () => {
    setSavingTemplates(true)
    await fetch('/api/email-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templates),
    })
    setSavingTemplates(false)
  }

  const handleUpdateTemplate = (field: keyof EmailTemplate, value: string) => {
    if (!editingTemplate) return
    const updated = { ...editingTemplate, [field]: value }
    setEditingTemplate(updated)
    setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  const handleAddTemplate = () => {
    const newT: EmailTemplate = {
      id: Date.now().toString(),
      nom: 'Nouveau template',
      objection: '',
      sujet: '',
      corps: '<p>Bonjour,</p>\n\n<p>...</p>\n\n<p>Bien cordialement,<br>{{expediteur}}</p>',
    }
    setTemplates(prev => [...prev, newT])
    setEditingTemplate(newT)
  }

  const handleDeleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id))
    if (editingTemplate?.id === id) setEditingTemplate(null)
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-10 md:py-14">

      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-slate-500 text-base mb-1">{templates.length} template{templates.length > 1 ? 's' : ''}</p>
          <h1 className="text-4xl font-bold text-white">Emails</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-2xl p-1.5 mb-8">
        {[
          { key: 'composer', label: '✉️ Composer' },
          { key: 'templates', label: '📋 Templates' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'composer' | 'templates')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
              tab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ——— COMPOSER ——— */}
      {tab === 'composer' && (
        <form onSubmit={handleSend} className="space-y-6">

          {/* Agence — combobox avec recherche */}
          <div>
            <label className="text-slate-400 text-sm font-medium block mb-2">Agence</label>
            <div className="relative" ref={agenceSearchRef}>
              <input
                type="text"
                value={agenceSearch}
                onChange={e => {
                  setAgenceSearch(e.target.value)
                  setAgenceId('')
                  setShowAgenceDropdown(true)
                }}
                onFocus={() => setShowAgenceDropdown(true)}
                placeholder={selectedAgence ? `${selectedAgence.nom}${selectedAgence.ville ? ` — ${selectedAgence.ville}` : ''}` : '🔍 Rechercher une agence…'}
                className={`w-full bg-slate-900 border rounded-2xl px-5 py-4 text-base focus:outline-none focus:border-indigo-500 transition ${
                  selectedAgence ? 'border-indigo-500 text-white' : 'border-slate-800 text-slate-300 placeholder-slate-500'
                }`}
              />
              {selectedAgence && (
                <button
                  type="button"
                  onClick={() => { setAgenceId(''); setAgenceSearch(''); setTo('') }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xl leading-none"
                >
                  ✕
                </button>
              )}
              {showAgenceDropdown && !selectedAgence && (
                <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl max-h-64 overflow-y-auto">
                  {agences
                    .filter(a => {
                      const q = agenceSearch.toLowerCase()
                      return !q || a.nom.toLowerCase().includes(q) || (a.ville || '').toLowerCase().includes(q)
                    })
                    .slice(0, 50)
                    .map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setAgenceId(String(a.id))
                          setAgenceSearch('')
                          setShowAgenceDropdown(false)
                        }}
                        className="w-full text-left px-5 py-3.5 hover:bg-slate-700 transition text-sm border-b border-slate-700/50 last:border-0"
                      >
                        <span className="text-white font-medium">{a.nom}</span>
                        {a.ville && <span className="text-slate-400 ml-2">— {a.ville}</span>}
                        {a.email && <span className="text-indigo-400 text-xs ml-2">{a.email}</span>}
                      </button>
                    ))}
                  {agences.filter(a => {
                    const q = agenceSearch.toLowerCase()
                    return !q || a.nom.toLowerCase().includes(q) || (a.ville || '').toLowerCase().includes(q)
                  }).length === 0 && (
                    <div className="px-5 py-4 text-slate-500 text-sm">Aucune agence trouvée</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Template */}
          <div>
            <label className="text-slate-400 text-sm font-medium block mb-2">Template</label>
            <div className="grid grid-cols-1 gap-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={`text-left px-5 py-4 rounded-2xl border transition ${
                    templateId === t.id
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-sm">{t.nom}</div>
                  {t.objection && (
                    <div className="text-xs text-slate-500 mt-0.5">Objection : {t.objection}</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Date/Heure RDV — affiché uniquement pour rdv-confirmation */}
          {templateId === 'rdv-confirmation' && (
            <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl px-5 py-4 space-y-3">
              <p className="text-indigo-300 text-sm font-semibold">📅 Informations du rendez-vous</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs font-medium block mb-1.5">Date du RDV</label>
                  <input
                    type="date"
                    value={rdvDate}
                    onChange={e => setRdvDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs font-medium block mb-1.5">Heure du RDV</label>
                  <input
                    type="time"
                    value={rdvHeure}
                    onChange={e => setRdvHeure(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Destinataire */}
          <div>
            <label className="text-slate-400 text-sm font-medium block mb-2">Destinataire</label>
            <input
              type="email"
              required
              placeholder="contact@agence.com"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Objet */}
          <div>
            <label className="text-slate-400 text-sm font-medium block mb-2">Objet</label>
            <input
              type="text"
              required
              placeholder="Objet de l'email…"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Corps */}
          <div>
            <label className="text-slate-400 text-sm font-medium block mb-2">Corps (HTML)</label>
            <textarea
              required
              rows={10}
              value={body}
              onChange={e => setBody(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-white placeholder-slate-600 text-sm font-mono focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="<p>Bonjour,</p>"
            />
          </div>

          {/* Aperçu HTML */}
          {body && (
            <div>
              <label className="text-slate-400 text-sm font-medium block mb-2">Aperçu</label>
              <div
                className="bg-white text-slate-900 rounded-2xl px-6 py-5 text-sm leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-2xl px-5 py-4 text-red-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={sending || !to || !subject || !body}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-4 rounded-2xl font-semibold text-base transition"
          >
            {sending ? 'Envoi en cours…' : sent ? '✅ Email envoyé !' : '📤 Envoyer l\'email'}
          </button>

          <p className="text-slate-600 text-xs text-center">
            Variables disponibles : <code className="text-slate-500">&#123;&#123;agence&#125;&#125;</code> <code className="text-slate-500">&#123;&#123;expediteur&#125;&#125;</code>
          </p>
        </form>
      )}

      {/* ——— TEMPLATES ——— */}
      {tab === 'templates' && (
        <div className="space-y-6">

          <div className="flex gap-3">
            <button
              onClick={handleAddTemplate}
              className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 py-3 rounded-2xl text-sm font-semibold transition"
            >
              + Nouveau template
            </button>
            <button
              onClick={handleSaveTemplates}
              disabled={savingTemplates}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-2xl text-sm font-semibold transition"
            >
              {savingTemplates ? 'Sauvegarde…' : '💾 Sauvegarder'}
            </button>
          </div>

          {/* Template list */}
          <div className="space-y-2">
            {templates.map(t => (
              <div
                key={t.id}
                onClick={() => setEditingTemplate(editingTemplate?.id === t.id ? null : t)}
                className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${
                  editingTemplate?.id === t.id ? 'border-indigo-500' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold text-sm">{t.nom}</div>
                    {t.objection && <div className="text-slate-500 text-xs mt-0.5">Objection : {t.objection}</div>}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteTemplate(t.id) }}
                    className="text-slate-700 hover:text-red-400 transition text-lg"
                  >
                    🗑
                  </button>
                </div>

                {/* Inline editor */}
                {editingTemplate?.id === t.id && (
                  <div
                    className="mt-5 space-y-4"
                    onClick={e => e.stopPropagation()}
                  >
                    <div>
                      <label className="text-slate-500 text-xs font-medium block mb-1.5">Nom du template</label>
                      <input
                        value={editingTemplate.nom}
                        onChange={e => handleUpdateTemplate('nom', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs font-medium block mb-1.5">Objection associée</label>
                      <input
                        value={editingTemplate.objection}
                        onChange={e => handleUpdateTemplate('objection', e.target.value)}
                        placeholder="ex: Envoyez-moi un mail"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs font-medium block mb-1.5">Objet</label>
                      <input
                        value={editingTemplate.sujet}
                        onChange={e => handleUpdateTemplate('sujet', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs font-medium block mb-1.5">Corps (HTML)</label>
                      <textarea
                        rows={8}
                        value={editingTemplate.corps}
                        onChange={e => handleUpdateTemplate('corps', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-xs font-mono focus:outline-none focus:border-indigo-500 resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-slate-600 text-xs text-center">
            Variables : <code className="text-slate-500">&#123;&#123;agence&#125;&#125;</code> — remplacé par le nom de l'agence<br />
            <code className="text-slate-500">&#123;&#123;expediteur&#125;&#125;</code> — remplacé par votre nom (configuré dans Paramètres)
          </p>
        </div>
      )}
    </div>
  )
}
