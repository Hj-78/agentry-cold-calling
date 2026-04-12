'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { EmailTemplate } from '@/lib/email-templates'
import type { GmailMessage } from '@/lib/gmail'

// ─── Constantes comptes ────────────────────────────────────────────────────

const ACCOUNTS = [
  { id: 'primary',   email: 'hugo@contact.agentry.fr', label: 'Contact',   color: 'bg-violet-600' },
  { id: 'secondary', email: 'hugo@agentry.fr',          label: 'Agentry',   color: 'bg-indigo-600' },
] as const
type AccountId = 'primary' | 'secondary'

// ─── EmailBody iframe isolé ────────────────────────────────────────────────

function EmailBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(300)

  useEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return
    doc.open()
    doc.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body{margin:0;padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.7;color:#1e293b;background:#fff;word-break:break-word}
        img{max-width:100%;height:auto}a{color:#6d28d9}pre,code{white-space:pre-wrap;word-break:break-all;background:#f1f5f9;padding:2px 6px;border-radius:4px}
        *{box-sizing:border-box}
      </style></head><body>${html}</body></html>`)
    doc.close()
    const resize = () => {
      const h = doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 300
      setHeight(Math.min(h + 8, 900))
    }
    iframe.onload = resize
    setTimeout(resize, 120)
  }, [html])

  return (
    <iframe ref={ref} className="w-full rounded-xl bg-white border-0"
      style={{ height, minHeight: 120 }} sandbox="allow-same-origin allow-popups" title="Email" />
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function applyVars(text: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{{${k}}}`, v), text)
}

function formatDate(ts: number) {
  const d = new Date(ts), now = new Date()
  if (d.getDate() === now.getDate() && now.getTime() - ts < 86400000)
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (now.getTime() - ts < 7 * 86400000)
    return d.toLocaleDateString('fr-FR', { weekday: 'short' })
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('')
}

function avatarBg(name: string) {
  const palette = ['bg-violet-600','bg-indigo-600','bg-blue-600','bg-emerald-600','bg-amber-600','bg-rose-600','bg-cyan-600','bg-pink-600']
  return palette[name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length]
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface Agence { id: number; nom: string; email: string | null; ville: string | null }
type Panel = 'inbox' | 'sent' | 'compose' | 'templates'

// ─── Page principale ───────────────────────────────────────────────────────

export default function EmailsPage() {
  const [panel, setPanel] = useState<Panel>('inbox')
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [selectedMsg, setSelectedMsg] = useState<(GmailMessage & { body: string }) | null>(null)
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  // Compte actif
  const [activeAccount, setActiveAccount] = useState<AccountId>('primary')

  // Compose
  const [agences, setAgences] = useState<Agence[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [agenceId, setAgenceId] = useState('')
  const [agenceSearch, setAgenceSearch] = useState('')
  const [showAgenceDropdown, setShowAgenceDropdown] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [fromAccount, setFromAccount] = useState<AccountId>('primary')
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [rdvDate, setRdvDate] = useState('')
  const [rdvHeure, setRdvHeure] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeSent, setComposeSent] = useState(false)
  const [composeError, setComposeError] = useState('')

  // Réponse
  const [replyBody, setReplyBody] = useState('')
  const [replyMode, setReplyMode] = useState(false)
  const [replySending, setReplySending] = useState(false)
  const [replySent, setReplySent] = useState(false)

  // Templates
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [savingTemplates, setSavingTemplates] = useState(false)

  const agenceSearchRef = useRef<HTMLDivElement>(null)

  // ── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/agences').then(r => r.json()).then(setAgences)
    fetch('/api/email-templates').then(r => r.json()).then(setTemplates)
    loadMessages('inbox', undefined, 'primary')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload when account switches
  useEffect(() => {
    loadMessages(panel === 'sent' ? 'sent' : 'inbox', undefined, activeAccount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount])

  // ── Charger messages ─────────────────────────────────────────────────────

  const loadMessages = useCallback(async (folder: string, q?: string, account?: AccountId) => {
    setLoadingList(true); setSelectedMsg(null)
    const p = new URLSearchParams({ folder })
    if (q) p.set('q', q)
    const acc = account ?? activeAccount
    p.set('account', acc)
    const res = await fetch(`/api/gmail?${p}`)
    const data = await res.json()
    setMessages(data.messages || [])
    setUnreadCount((data.messages || []).filter((m: GmailMessage) => !m.isRead).length)
    setLoadingList(false)
  }, [activeAccount])

  useEffect(() => {
    if (panel !== 'inbox') return
    const i = setInterval(() => loadMessages('inbox'), 30000)
    return () => clearInterval(i)
  }, [panel, loadMessages])

  const loadMessage = async (msg: GmailMessage) => {
    setLoadingMsg(true); setReplyMode(false); setReplyBody(''); setReplySent(false)
    const res = await fetch(`/api/gmail/${msg.id}?folder=${msg.folder || panel}`)
    if (res.ok) {
      const full = await res.json()
      setSelectedMsg(full)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRead: true } : m))
    }
    setLoadingMsg(false)
  }

  // ── Template auto-fill ───────────────────────────────────────────────────

  const selectedAgence = agences.find(a => String(a.id) === agenceId)
  const fromEmail = ACCOUNTS.find(a => a.id === fromAccount)?.email || ACCOUNTS[0].email

  useEffect(() => {
    const t = templates.find(t => t.id === templateId); if (!t) return
    const rdvDateFr = rdvDate
      ? new Date(rdvDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '{{rdvDate}}'
    const vars = { agence: selectedAgence?.nom || '', expediteur: 'Hugo — Agentry', rdvDate: rdvDateFr, rdvHeure: rdvHeure || '{{rdvHeure}}', resumeAppel: '', meetLink: '' }
    setComposeSubject(applyVars(t.sujet, vars))
    setComposeBody(applyVars(t.corps, vars))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, agenceId, templates, rdvDate, rdvHeure])

  useEffect(() => {
    if (selectedAgence?.email) setComposeTo(selectedAgence.email)
  }, [agenceId, selectedAgence?.email])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (agenceSearchRef.current && !agenceSearchRef.current.contains(e.target as Node))
        setShowAgenceDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Envoyer ──────────────────────────────────────────────────────────────

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!composeTo || !composeSubject || !composeBody) return
    setComposeSending(true); setComposeError('')
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: composeTo, subject: composeSubject, html: composeBody,
        fromAccount,
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

  // ── Répondre ─────────────────────────────────────────────────────────────

  const handleReply = async () => {
    if (!selectedMsg || !replyBody.trim()) return
    setReplySending(true)
    const replyHtml = `<div style="font-family:sans-serif">${replyBody.replace(/\n/g, '<br>')}</div>
<br><hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
<div style="color:#94a3b8;font-size:13px;padding-left:12px;border-left:3px solid #334155">${selectedMsg.body}</div>`
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: selectedMsg.fromEmail,
        subject: `Re: ${selectedMsg.subject.replace(/^Re:\s*/i, '')}`,
        html: replyHtml,
        fromAccount: activeAccount,
      }),
    })
    if (res.ok) { setReplySent(true); setReplyMode(false); setReplyBody(''); setTimeout(() => setReplySent(false), 4000) }
    else { const d = await res.json(); setComposeError(d.error || 'Erreur réponse') }
    setReplySending(false)
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  const handleSaveTemplates = async () => {
    setSavingTemplates(true)
    await fetch('/api/email-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(templates) })
    setSavingTemplates(false)
  }

  const handleUpdateTemplate = (field: keyof EmailTemplate, value: string) => {
    if (!editingTemplate) return
    const updated = { ...editingTemplate, [field]: value }
    setEditingTemplate(updated)
    setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden bg-slate-950">

      {/* ── Mobile tab bar ── */}
      <div className="md:hidden flex border-b border-slate-800 bg-slate-950 shrink-0 overflow-x-auto">
        {([
          { key: 'inbox',     label: 'Inbox',     badge: unreadCount },
          { key: 'sent',      label: 'Envoyés',   badge: 0 },
          { key: 'compose',   label: 'Composer',  badge: 0 },
          { key: 'templates', label: 'Templates', badge: 0 },
        ] as { key: Panel; label: string; badge: number }[]).map(item => (
          <button key={item.key}
            onClick={() => { setPanel(item.key); setSelectedMsg(null); if (item.key === 'inbox' || item.key === 'sent') loadMessages(item.key) }}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${panel === item.key ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500'}`}>
            {item.label}
            {item.badge > 0 && <span className="bg-violet-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{item.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── Sidebar desktop ── */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-slate-900/60 backdrop-blur border-r border-slate-800/80 flex-col py-5 px-3 gap-1">

        {/* Comptes */}
        <div className="mb-4 px-2">
          <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-wider mb-2">Comptes</p>
          {ACCOUNTS.map(acc => (
            <button key={acc.id}
              onClick={() => setActiveAccount(acc.id as AccountId)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs transition mb-0.5 ${activeAccount === acc.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${acc.color}`} />
              <span className="truncate">{acc.email}</span>
              {acc.id === 'primary' && <span className="ml-auto text-[9px] bg-violet-600/30 text-violet-400 px-1.5 py-0.5 rounded-full font-medium">principal</span>}
            </button>
          ))}
        </div>

        <div className="border-t border-slate-800/60 mb-3" />

        {/* Composer */}
        <button onClick={() => setPanel('compose')}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-2xl px-4 py-2.5 mb-3 transition text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Composer
        </button>

        {/* Dossiers */}
        {([
          { key: 'inbox', label: 'Boîte de réception', badge: unreadCount, icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4' },
          { key: 'sent',  label: 'Envoyés',            badge: 0,          icon: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' },
        ] as { key: Panel; label: string; badge: number; icon: string }[]).map(item => (
          <button key={item.key}
            onClick={() => { setPanel(item.key); loadMessages(item.key) }}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition ${panel === item.key ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/40'}`}>
            <span className="flex items-center gap-2.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              {item.label}
            </span>
            {item.badge > 0 && <span className="bg-violet-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{item.badge}</span>}
          </button>
        ))}

        <div className="my-1 border-t border-slate-800/60" />

        <button onClick={() => setPanel('templates')}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition ${panel === 'templates' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/40'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Templates
        </button>

        {/* Search */}
        {(panel === 'inbox' || panel === 'sent') && (
          <form className="mt-auto" onSubmit={e => { e.preventDefault(); loadMessages(panel, searchQ.trim() || undefined) }}>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
              </svg>
              <input type="search" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Rechercher…"
                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500" />
            </div>
          </form>
        )}
      </aside>

      {/* ── Zone principale ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Inbox / Sent ── */}
        {(panel === 'inbox' || panel === 'sent') && (
          <>
            {/* Liste */}
            <div className={`flex flex-col border-r border-slate-800/60 overflow-y-auto ${selectedMsg ? 'hidden md:flex md:w-80 md:flex-shrink-0' : 'flex-1'}`}>
              <div className="sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800/60 px-4 py-3 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-white font-semibold text-sm">{panel === 'inbox' ? 'Boîte de réception' : 'Envoyés'}</h2>
                  {messages.length > 0 && <p className="text-slate-600 text-xs mt-0.5">{messages.length} message{messages.length > 1 ? 's' : ''}</p>}
                </div>
                <button onClick={() => loadMessages(panel)}
                  className="text-slate-500 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800">
                  <svg className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {loadingList && (
                <div className="flex flex-col gap-0">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="animate-pulse flex gap-3 items-start px-4 py-3.5 border-b border-slate-800/40">
                      <div className="w-9 h-9 rounded-full bg-slate-800 flex-shrink-0" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-3 bg-slate-800 rounded w-1/2" />
                        <div className="h-3 bg-slate-800 rounded w-3/4" />
                        <div className="h-3 bg-slate-800 rounded w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loadingList && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center flex-1 text-slate-600 text-sm gap-3 py-20">
                  <svg className="w-10 h-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Aucun email
                </div>
              )}

              {messages.map(msg => (
                <button key={msg.id} onClick={() => loadMessage(msg)}
                  className={`w-full text-left px-4 py-3.5 border-b border-slate-800/40 transition group ${selectedMsg?.id === msg.id ? 'bg-slate-800/70' : 'hover:bg-slate-800/30'} ${!msg.isRead ? 'bg-slate-900/50' : ''}`}>
                  <div className="flex gap-3 items-start">
                    <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${avatarBg(msg.fromName)}`}>
                      {initials(msg.fromName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`text-sm truncate ${!msg.isRead ? 'text-white font-semibold' : 'text-slate-300'}`}>
                          {panel === 'sent' ? msg.to : msg.fromName}
                        </span>
                        <span className="text-slate-600 text-xs flex-shrink-0">{formatDate(msg.timestamp)}</span>
                      </div>
                      <div className={`text-xs truncate mb-0.5 ${!msg.isRead ? 'text-slate-200 font-medium' : 'text-slate-400'}`}>
                        {msg.subject}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 truncate">{msg.snippet}</span>
                        {/* Badge adresse */}
                        {msg.to && (ACCOUNTS.map(a => a.email) as string[]).includes(msg.to) && (
                          <span className={`flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${msg.to === 'hugo@contact.agentry.fr' ? 'bg-violet-600/20 text-violet-400' : 'bg-indigo-600/20 text-indigo-400'}`}>
                            {msg.to === 'hugo@contact.agentry.fr' ? 'contact' : 'agentry'}
                          </span>
                        )}
                      </div>
                    </div>
                    {!msg.isRead && <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0 mt-2" />}
                  </div>
                </button>
              ))}
            </div>

            {/* Lecture */}
            {selectedMsg ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="border-b border-slate-800/60 px-4 md:px-6 py-3 md:py-4 bg-slate-950/80 backdrop-blur">
                  <button onClick={() => setSelectedMsg(null)}
                    className="md:hidden flex items-center gap-1.5 text-slate-400 text-sm mb-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Retour
                  </button>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-bold text-base md:text-lg mb-2 leading-tight">{selectedMsg.subject}</h3>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarBg(selectedMsg.fromName)}`}>
                          {initials(selectedMsg.fromName)}
                        </div>
                        <div>
                          <span className="text-slate-200 text-sm font-medium">{selectedMsg.fromName}</span>
                          <span className="text-slate-500 text-xs ml-1.5">&lt;{selectedMsg.fromEmail}&gt;</span>
                        </div>
                        <span className="text-slate-600 text-xs">
                          {new Date(selectedMsg.timestamp).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => { setReplyMode(r => !r); setReplySent(false) }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm transition font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Répondre
                      </button>
                      <button onClick={() => setSelectedMsg(null)}
                        className="hidden md:flex p-2 text-slate-500 hover:text-white transition rounded-xl hover:bg-slate-800">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Corps */}
                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
                  {loadingMsg ? (
                    <div className="animate-pulse space-y-3">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-4 bg-slate-800 rounded" style={{ width: `${55 + i * 7}%` }} />
                      ))}
                    </div>
                  ) : selectedMsg.body ? (
                    <EmailBody html={selectedMsg.body} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-600 text-sm gap-2">
                      <svg className="w-8 h-8 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Aucun contenu
                    </div>
                  )}
                </div>

                {/* Réponse */}
                {replyMode && (
                  <div className="border-t border-slate-800/60 px-4 md:px-6 py-4 bg-slate-900/60 backdrop-blur">
                    {replySent ? (
                      <div className="flex items-center gap-2 text-emerald-400 text-sm py-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Réponse envoyée
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-slate-500 text-xs">De</span>
                          <div className="flex gap-1.5">
                            {ACCOUNTS.map(acc => (
                              <button key={acc.id} type="button"
                                onClick={() => setActiveAccount(acc.id as AccountId)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${activeAccount === acc.id ? `${acc.color} text-white` : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                                {acc.email}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="text-slate-500 text-xs mb-2">
                          À <span className="text-slate-300">{selectedMsg.fromEmail}</span>
                        </div>
                        <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)}
                          placeholder="Écris ta réponse…" rows={4}
                          className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-violet-500 resize-none" />
                        <div className="flex gap-2 mt-3">
                          <button onClick={handleReply} disabled={replySending || !replyBody.trim()}
                            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-5 py-2 rounded-xl text-sm font-semibold transition">
                            {replySending ? 'Envoi…' : 'Envoyer'}
                          </button>
                          <button onClick={() => { setReplyMode(false); setReplyBody('') }}
                            className="px-4 py-2 text-slate-500 hover:text-white rounded-xl text-sm transition">
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
                <div className="flex-1 hidden md:flex items-center justify-center text-slate-600 text-sm">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Sélectionne un email
                  </div>
                </div>
              )
            )}
          </>
        )}

        {/* ── Composer ── */}
        {panel === 'compose' && (
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-10">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-white font-bold text-xl mb-6">Nouveau message</h2>
              <form onSubmit={handleSend} className="space-y-4">

                {/* From picker */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl px-5 py-4">
                  <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-3">De</label>
                  <div className="flex gap-2 flex-wrap">
                    {ACCOUNTS.map(acc => (
                      <button key={acc.id} type="button"
                        onClick={() => setFromAccount(acc.id as AccountId)}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition border ${fromAccount === acc.id ? `${acc.color} text-white border-transparent` : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}>
                        <span className={`w-2 h-2 rounded-full ${fromAccount === acc.id ? 'bg-white/60' : acc.color}`} />
                        {acc.email}
                        {acc.id === 'primary' && <span className="text-[9px] opacity-70">principal</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Agence picker */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl px-5 py-4">
                  <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-3">Agence</label>
                  <div ref={agenceSearchRef} className="relative">
                    <input type="text" value={agenceSearch}
                      onChange={e => { setAgenceSearch(e.target.value); setShowAgenceDropdown(true) }}
                      onFocus={() => setShowAgenceDropdown(true)}
                      placeholder="Rechercher une agence…"
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-violet-500" />
                    {showAgenceDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-20 max-h-52 overflow-y-auto">
                        {agences.filter(a => a.nom.toLowerCase().includes(agenceSearch.toLowerCase())).slice(0, 10).map(a => (
                          <button key={a.id} type="button"
                            onClick={() => { setAgenceId(String(a.id)); setAgenceSearch(a.nom); setShowAgenceDropdown(false) }}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-700 text-slate-200 text-sm transition border-b border-slate-700/50 last:border-0">
                            <span className="font-medium">{a.nom}</span>
                            {a.ville && <span className="text-slate-500 text-xs ml-2">{a.ville}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* À / Objet */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl px-5 py-4 space-y-4">
                  <div>
                    <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-2">À</label>
                    <input type="email" value={composeTo} onChange={e => setComposeTo(e.target.value)}
                      placeholder="destinataire@exemple.fr"
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-2">Objet</label>
                    <input type="text" value={composeSubject} onChange={e => setComposeSubject(e.target.value)}
                      placeholder="Objet du message"
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-violet-500" />
                  </div>
                </div>

                {/* Template */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl px-5 py-4">
                  <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-3">Template</label>
                  <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500">
                    <option value="">— Aucun template —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                  </select>
                  {templateId === 'rdv-confirmation' && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="text-slate-600 text-xs block mb-1.5">Date RDV</label>
                        <input type="date" value={rdvDate} onChange={e => setRdvDate(e.target.value)}
                          className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500" />
                      </div>
                      <div>
                        <label className="text-slate-600 text-xs block mb-1.5">Heure</label>
                        <input type="time" value={rdvHeure} onChange={e => setRdvHeure(e.target.value)}
                          className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Corps */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl px-5 py-4">
                  <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-3">Message</label>
                  <textarea value={composeBody} onChange={e => setComposeBody(e.target.value)}
                    rows={10} placeholder="Écris ton message…"
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-violet-500 resize-none font-mono" />
                </div>

                {composeError && (
                  <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">{composeError}</div>
                )}

                <div className="flex gap-3">
                  <button type="submit" disabled={composeSending || !composeTo || !composeSubject || !composeBody}
                    className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-3.5 rounded-2xl font-semibold text-sm transition flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    {composeSending ? 'Envoi…' : composeSent ? '✓ Envoyé !' : `Envoyer depuis ${fromEmail}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Templates ── */}
        {panel === 'templates' && (
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-10">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-white font-bold text-xl">Templates</h2>
                <button onClick={handleSaveTemplates} disabled={savingTemplates}
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
                  {savingTemplates ? 'Sauvegarde…' : '💾 Sauvegarder'}
                </button>
              </div>
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {templates.map(t => (
                  <button key={t.id} onClick={() => setEditingTemplate(t)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap border ${editingTemplate?.id === t.id ? 'bg-violet-600 text-white border-transparent' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}>
                    {t.nom}
                  </button>
                ))}
              </div>
              {editingTemplate && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div>
                    <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-2">Nom</label>
                    <input value={editingTemplate.nom} onChange={e => handleUpdateTemplate('nom', e.target.value)}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-2">Objet</label>
                    <input value={editingTemplate.sujet} onChange={e => handleUpdateTemplate('sujet', e.target.value)}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-2">Corps</label>
                    <textarea value={editingTemplate.corps} onChange={e => handleUpdateTemplate('corps', e.target.value)}
                      rows={12}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500 resize-none font-mono" />
                  </div>
                  <p className="text-slate-600 text-xs">Variables : {'{{agence}}'} {'{{expediteur}}'} {'{{rdvDate}}'} {'{{rdvHeure}}'}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
