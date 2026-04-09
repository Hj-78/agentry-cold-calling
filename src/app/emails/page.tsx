'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { EmailTemplate } from '@/lib/email-templates'
import type { GmailMessage } from '@/lib/gmail'

// ─── Helpers ───────────────────────────────────────────────────────────────

function applyVars(text: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{{${k}}}`, v), text)
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 7 * 86400000) {
    return d.toLocaleDateString('fr-FR', { weekday: 'short' })
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('')
}

function avatarColor(name: string): string {
  const colors = [
    'bg-violet-600', 'bg-blue-600', 'bg-emerald-600', 'bg-amber-600',
    'bg-rose-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-pink-600',
  ]
  const i = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length
  return colors[i]
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Agence {
  id: number
  nom: string
  email: string | null
  ville: string | null
}

type Panel = 'inbox' | 'sent' | 'compose' | 'templates'

// ─── Main ───────────────────────────────────────────────────────────────────

export default function EmailsPage() {
  const [panel, setPanel] = useState<Panel>('inbox')
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [selectedMsg, setSelectedMsg] = useState<(GmailMessage & { body: string }) | null>(null)
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  // Compose state
  const [agences, setAgences] = useState<Agence[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [agenceId, setAgenceId] = useState('')
  const [agenceSearch, setAgenceSearch] = useState('')
  const [showAgenceDropdown, setShowAgenceDropdown] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [rdvDate, setRdvDate] = useState('')
  const [rdvHeure, setRdvHeure] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeSent, setComposeSent] = useState(false)
  const [composeError, setComposeError] = useState('')

  // Reply
  const [replyBody, setReplyBody] = useState('')
  const [replyMode, setReplyMode] = useState(false)
  const [replySending, setReplySending] = useState(false)
  const [replySent, setReplySent] = useState(false)

  // Template editor
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [savingTemplates, setSavingTemplates] = useState(false)

  const agenceSearchRef = useRef<HTMLDivElement>(null)
  const expediteur = 'Hugo — Agentry'

  // ── Load initial data ────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/agences').then(r => r.json()).then((d: Agence[]) => setAgences(d))
    fetch('/api/email-templates').then(r => r.json()).then(setTemplates)

    const sp = new URLSearchParams(window.location.search)
    if (sp.get('auth_success') || sp.get('auth_error')) {
      window.history.replaceState({}, '', '/emails')
    }
    loadMessages('inbox')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-refresh inbox every 30s ─────────────────────────────────────────
  useEffect(() => {
    if (panel !== 'inbox') return
    const interval = setInterval(() => {
      loadMessages('inbox')
    }, 30000)
    return () => clearInterval(interval)
  }, [panel, loadMessages])

  // ── Load messages ────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (folder: string, q?: string) => {
    setLoadingList(true)
    setSelectedMsg(null)
    const params = new URLSearchParams({ folder })
    if (q) params.set('q', q)
    const res = await fetch(`/api/gmail?${params}`)
    const data = await res.json()
    setMessages(data.messages || [])
    setUnreadCount((data.messages || []).filter((m: GmailMessage) => !m.isRead).length)
    setLoadingList(false)
  }, [])

  const loadMessage = async (msg: GmailMessage) => {
    setLoadingMsg(true)
    setReplyMode(false)
    setReplyBody('')
    setReplySent(false)
    const folder = msg.folder || panel
    const res = await fetch(`/api/gmail/${msg.id}?folder=${folder}`)
    if (res.ok) {
      const full = await res.json()
      setSelectedMsg(full)
      // Marquer comme lu dans la liste
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRead: true } : m))
    }
    setLoadingMsg(false)
  }

  // ── Compose template ─────────────────────────────────────────────────────

  const selectedAgence = agences.find(a => String(a.id) === agenceId)

  useEffect(() => {
    if (agenceSearchRef.current) {
      const handler = (e: MouseEvent) => {
        if (!agenceSearchRef.current?.contains(e.target as Node)) setShowAgenceDropdown(false)
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [])

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
      meetLink: '',
    }
    setComposeSubject(applyVars(t.sujet, vars))
    setComposeBody(applyVars(t.corps, vars))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, agenceId, templates, rdvDate, rdvHeure])

  useEffect(() => {
    if (selectedAgence?.email) setComposeTo(selectedAgence.email)
  }, [agenceId, selectedAgence?.email])

  const handleComposeSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!composeTo || !composeSubject || !composeBody) return
    setComposeSending(true)
    setComposeError('')
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: composeTo,
        subject: composeSubject,
        html: composeBody,
        ...(templateId === 'rdv-confirmation' && rdvDate && rdvHeure
          ? { rdvDate, rdvHeure, agenceNom: selectedAgence?.nom || '', agenceEmail: composeTo }
          : {}),
      }),
    })
    const data = await res.json()
    if (!res.ok) { setComposeError(data.error || 'Erreur envoi'); setComposeSending(false); return }
    setComposeSent(true)
    setTimeout(() => setComposeSent(false), 4000)
    setComposeSending(false)
  }

  // ── Reply ────────────────────────────────────────────────────────────────

  const handleReply = async () => {
    if (!selectedMsg || !replyBody.trim()) return
    setReplySending(true)
    const replyHtml = `<div style="font-family:sans-serif;color:#1e293b">${replyBody.replace(/\n/g, '<br>')}</div>
<br><hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
<div style="color:#64748b;font-size:13px;padding-left:12px;border-left:3px solid #334155">
${selectedMsg.body}
</div>`
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: selectedMsg.fromEmail,
        subject: `Re: ${selectedMsg.subject.replace(/^Re:\s*/i, '')}`,
        html: replyHtml,
      }),
    })
    if (res.ok) {
      setReplySent(true)
      setReplyMode(false)
      setReplyBody('')
      setTimeout(() => setReplySent(false), 4000)
    } else {
      const d = await res.json()
      setComposeError(d.error || 'Erreur envoi réponse')
    }
    setReplySending(false)
  }

  // ── Template editor ──────────────────────────────────────────────────────

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

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col py-4 px-3 gap-1">
        <button
          onClick={() => setPanel('compose')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl px-4 py-3 mb-3 transition text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Composer
        </button>

        {(
          [
            { key: 'inbox', label: 'Boîte de réception', badge: unreadCount },
            { key: 'sent', label: 'Envoyés', badge: 0 },
          ] as { key: Panel; label: string; badge: number }[]
        ).map(item => (
          <button
            key={item.key}
            onClick={() => {
              setPanel(item.key)
              loadMessages(item.key)
            }}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
              panel === item.key ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span className="flex items-center gap-2">
              {item.key === 'inbox' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
              {item.label}
            </span>
            {item.badge > 0 && (
              <span className="bg-indigo-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {item.badge}
              </span>
            )}
          </button>
        ))}

        <div className="my-1 border-t border-slate-800" />

        <button
          onClick={() => setPanel('templates')}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
            panel === 'templates' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Templates
        </button>

        {/* Search */}
        {(panel === 'inbox' || panel === 'sent') && (
          <form
            className="mt-auto"
            onSubmit={e => {
              e.preventDefault()
              loadMessages(panel, searchQ.trim() || undefined)
            }}
          >
            <input
              type="search"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Rechercher…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </form>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Inbox / Sent list ── */}
        {(panel === 'inbox' || panel === 'sent') && (
          <>
            {/* Message list */}
            <div className={`flex flex-col border-r border-slate-800 overflow-y-auto ${selectedMsg ? 'w-80 flex-shrink-0' : 'flex-1'}`}>
              {/* Header */}
              <div className="sticky top-0 bg-slate-950 border-b border-slate-800 px-4 py-3 flex items-center justify-between z-10">
                <h2 className="text-white font-semibold text-sm">
                  {panel === 'inbox' ? 'Boîte de réception' : 'Envoyés'}
                </h2>
                <button
                  onClick={() => loadMessages(panel)}
                  className="text-slate-400 hover:text-white transition p-1 rounded"
                  title="Rafraîchir"
                >
                  <svg className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {/* Loading */}
              {loadingList && (
                <div className="flex flex-col gap-3 p-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="animate-pulse flex gap-3 items-start">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-slate-800 rounded w-1/2" />
                        <div className="h-3 bg-slate-800 rounded w-3/4" />
                        <div className="h-3 bg-slate-800 rounded w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty */}
              {!loadingList && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                  <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  Aucun email
                </div>
              )}

              {/* Message list */}
              {messages.map(msg => (
                <button
                  key={msg.id}
                  onClick={() => loadMessage(msg)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-800/50 transition hover:bg-slate-800/30 ${
                    selectedMsg?.id === msg.id ? 'bg-slate-800/60' : ''
                  } ${!msg.isRead ? 'bg-slate-900/60' : ''}`}
                >
                  <div className="flex gap-3 items-start">
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarColor(msg.fromName)}`}>
                      {getInitials(msg.fromName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`text-sm truncate ${!msg.isRead ? 'text-white font-semibold' : 'text-slate-300 font-medium'}`}>
                          {msg.fromName}
                        </span>
                        <span className="text-slate-500 text-xs flex-shrink-0">{formatDate(msg.timestamp)}</span>
                      </div>
                      <div className={`text-xs truncate mb-0.5 ${!msg.isRead ? 'text-slate-200 font-medium' : 'text-slate-400'}`}>
                        {msg.subject}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{msg.snippet}</div>
                    </div>
                    {!msg.isRead && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Message view */}
            {selectedMsg ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="border-b border-slate-800 px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold text-base mb-1">{selectedMsg.subject}</h3>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(selectedMsg.fromName)}`}>
                            {getInitials(selectedMsg.fromName)}
                          </div>
                          <div>
                            <span className="text-slate-200 text-sm font-medium">{selectedMsg.fromName}</span>
                            <span className="text-slate-500 text-xs ml-1">&lt;{selectedMsg.fromEmail}&gt;</span>
                          </div>
                        </div>
                        <span className="text-slate-500 text-xs">
                          {new Date(selectedMsg.timestamp).toLocaleString('fr-FR', {
                            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => { setReplyMode(r => !r); setReplySent(false) }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Répondre
                      </button>
                      <button
                        onClick={() => setSelectedMsg(null)}
                        className="p-2 text-slate-500 hover:text-white transition rounded-xl hover:bg-slate-800"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  {loadingMsg ? (
                    <div className="animate-pulse space-y-3">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-4 bg-slate-800 rounded" style={{ width: `${60 + Math.random() * 40}%` }} />
                      ))}
                    </div>
                  ) : (
                    <div
                      className="prose prose-sm max-w-none text-slate-200 [&_a]:text-indigo-400 [&_img]:max-w-full [&_*]:!color-inherit"
                      style={{ fontFamily: 'inherit' }}
                      dangerouslySetInnerHTML={{ __html: selectedMsg.body || '' }}
                    />
                  )}
                </div>

                {/* Reply panel */}
                {replyMode && (
                  <div className="border-t border-slate-800 px-6 py-4 bg-slate-900/50">
                    {replySent ? (
                      <div className="flex items-center gap-2 text-emerald-400 text-sm py-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Réponse envoyée
                      </div>
                    ) : (
                      <>
                        <div className="text-slate-400 text-xs mb-2">
                          Répondre à <span className="text-slate-300">{selectedMsg.fromEmail}</span>
                        </div>
                        <textarea
                          value={replyBody}
                          onChange={e => setReplyBody(e.target.value)}
                          placeholder="Écris ta réponse…"
                          rows={4}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                        />
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={handleReply}
                            disabled={replySending || !replyBody.trim()}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-5 py-2 rounded-xl text-sm font-semibold transition"
                          >
                            {replySending ? 'Envoi…' : 'Envoyer'}
                          </button>
                          <button
                            onClick={() => { setReplyMode(false); setReplyBody('') }}
                            className="px-4 py-2 text-slate-400 hover:text-white rounded-xl text-sm transition"
                          >
                            Annuler
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              !loadingList && messages.length > 0 && (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p>Sélectionne un email</p>
                  </div>
                </div>
              )
            )}
          </>
        )}

        {/* ── Compose ── */}
        {panel === 'compose' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-8">
              <h2 className="text-white font-bold text-2xl mb-6">Nouveau message</h2>
              <form onSubmit={handleComposeSend} className="space-y-5">
                {/* Agence */}
                <div>
                  <label className="text-slate-400 text-sm font-medium block mb-2">Agence</label>
                  <div className="relative" ref={agenceSearchRef}>
                    <input
                      type="text"
                      value={agenceSearch}
                      onChange={e => { setAgenceSearch(e.target.value); setAgenceId(''); setShowAgenceDropdown(true) }}
                      onFocus={() => setShowAgenceDropdown(true)}
                      placeholder={selectedAgence ? `${selectedAgence.nom}${selectedAgence.ville ? ` — ${selectedAgence.ville}` : ''}` : '🔍 Rechercher une agence…'}
                      className={`w-full bg-slate-900 border rounded-2xl px-5 py-4 text-base focus:outline-none focus:border-indigo-500 transition ${
                        selectedAgence ? 'border-indigo-500 text-white' : 'border-slate-800 text-slate-300 placeholder-slate-500'
                      }`}
                    />
                    {selectedAgence && (
                      <button type="button" onClick={() => { setAgenceId(''); setAgenceSearch(''); setComposeTo('') }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xl">✕</button>
                    )}
                    {showAgenceDropdown && !selectedAgence && (
                      <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl max-h-64 overflow-y-auto">
                        {agences.filter(a => {
                          const q = agenceSearch.toLowerCase()
                          return !q || a.nom.toLowerCase().includes(q) || (a.ville || '').toLowerCase().includes(q)
                        }).slice(0, 50).map(a => (
                          <button key={a.id} type="button"
                            onClick={() => { setAgenceId(String(a.id)); setAgenceSearch(''); setShowAgenceDropdown(false) }}
                            className="w-full text-left px-5 py-3.5 hover:bg-slate-700 transition text-sm border-b border-slate-700/50 last:border-0">
                            <span className="text-white font-medium">{a.nom}</span>
                            {a.ville && <span className="text-slate-400 ml-2">— {a.ville}</span>}
                            {a.email && <span className="text-indigo-400 text-xs ml-2">{a.email}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Template */}
                <div>
                  <label className="text-slate-400 text-sm font-medium block mb-2">Template</label>
                  <div className="grid grid-cols-1 gap-2">
                    {templates.map(t => (
                      <button key={t.id} type="button" onClick={() => setTemplateId(t.id)}
                        className={`text-left px-4 py-3 rounded-xl border transition text-sm ${
                          templateId === t.id ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}>
                        <div className="font-semibold">{t.nom}</div>
                        {t.objection && <div className="text-xs text-slate-500 mt-0.5">Objection : {t.objection}</div>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date/Heure RDV */}
                {templateId === 'rdv-confirmation' && (
                  <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl px-5 py-4 space-y-3">
                    <p className="text-indigo-300 text-sm font-semibold">📅 Informations du rendez-vous</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1.5">Date du RDV</label>
                        <input type="date" value={rdvDate} onChange={e => setRdvDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs font-medium block mb-1.5">Heure du RDV</label>
                        <input type="time" value={rdvHeure} onChange={e => setRdvHeure(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
                      </div>
                    </div>
                  </div>
                )}

                {/* À / Objet */}
                <div>
                  <label className="text-slate-400 text-sm font-medium block mb-2">À</label>
                  <input type="email" required placeholder="contact@agence.com" value={composeTo} onChange={e => setComposeTo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-slate-400 text-sm font-medium block mb-2">Objet</label>
                  <input type="text" required placeholder="Objet de l'email…" value={composeSubject} onChange={e => setComposeSubject(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
                </div>

                {/* Corps */}
                <div>
                  <label className="text-slate-400 text-sm font-medium block mb-2">Corps (HTML)</label>
                  <textarea required rows={10} value={composeBody} onChange={e => setComposeBody(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-white text-sm font-mono focus:outline-none focus:border-indigo-500 resize-none" />
                </div>

                {/* Preview */}
                {composeBody && (
                  <div>
                    <label className="text-slate-400 text-sm font-medium block mb-2">Aperçu</label>
                    <div className="bg-white text-slate-900 rounded-2xl px-6 py-5 text-sm leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: composeBody }} />
                  </div>
                )}

                {composeError && (
                  <div className="bg-red-900/30 border border-red-500/50 rounded-2xl px-5 py-4 text-red-400 text-sm">⚠️ {composeError}</div>
                )}

                <button type="submit" disabled={composeSending || !composeTo || !composeSubject || !composeBody}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-4 rounded-2xl font-semibold text-base transition">
                  {composeSending ? 'Envoi en cours…' : composeSent ? '✅ Email envoyé !' : '📤 Envoyer'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Templates ── */}
        {panel === 'templates' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-2xl">Templates</h2>
                <div className="flex gap-3">
                  <button onClick={() => {
                    const newT: EmailTemplate = {
                      id: Date.now().toString(), nom: 'Nouveau template', objection: '',
                      sujet: '', corps: '<p>Bonjour,</p>\n\n<p>...</p>\n\n<p>Bien cordialement,<br>{{expediteur}}</p>',
                    }
                    setTemplates(prev => [...prev, newT])
                    setEditingTemplate(newT)
                  }}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-semibold transition">
                    + Nouveau
                  </button>
                  <button onClick={handleSaveTemplates} disabled={savingTemplates}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
                    {savingTemplates ? 'Sauvegarde…' : '💾 Sauvegarder'}
                  </button>
                </div>
              </div>

              {templates.map(t => (
                <div key={t.id}
                  onClick={() => setEditingTemplate(editingTemplate?.id === t.id ? null : t)}
                  className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${
                    editingTemplate?.id === t.id ? 'border-indigo-500' : 'border-slate-800 hover:border-slate-700'
                  }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-white font-semibold text-sm">{t.nom}</div>
                      {t.objection && <div className="text-slate-500 text-xs mt-0.5">Objection : {t.objection}</div>}
                    </div>
                    <button onClick={e => { e.stopPropagation(); setTemplates(prev => prev.filter(x => x.id !== t.id)); if (editingTemplate?.id === t.id) setEditingTemplate(null) }}
                      className="text-slate-700 hover:text-red-400 transition text-lg">🗑</button>
                  </div>
                  {editingTemplate?.id === t.id && (
                    <div className="mt-5 space-y-4" onClick={e => e.stopPropagation()}>
                      {[
                        { label: 'Nom', field: 'nom' as const, placeholder: '' },
                        { label: 'Objection associée', field: 'objection' as const, placeholder: 'ex: Envoyez-moi un mail' },
                        { label: 'Objet', field: 'sujet' as const, placeholder: '' },
                      ].map(({ label, field, placeholder }) => (
                        <div key={field}>
                          <label className="text-slate-500 text-xs font-medium block mb-1.5">{label}</label>
                          <input value={editingTemplate[field]} onChange={e => handleUpdateTemplate(field, e.target.value)}
                            placeholder={placeholder}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
                        </div>
                      ))}
                      <div>
                        <label className="text-slate-500 text-xs font-medium block mb-1.5">Corps (HTML)</label>
                        <textarea rows={8} value={editingTemplate.corps} onChange={e => handleUpdateTemplate('corps', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-xs font-mono focus:outline-none focus:border-indigo-500 resize-none" />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <p className="text-slate-600 text-xs text-center">
                Variables : <code>&#123;&#123;agence&#125;&#125;</code> <code>&#123;&#123;expediteur&#125;&#125;</code> <code>&#123;&#123;rdvDate&#125;&#125;</code> <code>&#123;&#123;rdvHeure&#125;&#125;</code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
