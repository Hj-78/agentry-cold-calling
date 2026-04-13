'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Session, AgenceQueue } from '@/lib/types'
import type { EmailTemplate } from '@/lib/email-templates'

function applyVars(text: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{{${k}}}`, v), text)
}

interface PowerDialerProps {
  session: Session
  onEnd: (session: Session) => void
}

const RESULTATS = [
  { value: 'interesse', label: '✓ Intéressé', color: 'bg-green-600 hover:bg-green-500 border-green-500', active: 'ring-2 ring-green-400' },
  { value: 'rappeler', label: '↩ À rappeler', color: 'bg-amber-600 hover:bg-amber-500 border-amber-500', active: 'ring-2 ring-amber-400' },
  { value: 'pas_repondu', label: '📵 Pas répondu', color: 'bg-slate-600 hover:bg-slate-500 border-slate-500', active: 'ring-2 ring-slate-400' },
  { value: 'messagerie', label: '🔇 Messagerie', color: 'bg-blue-700 hover:bg-blue-600 border-blue-500', active: 'ring-2 ring-blue-400' },
  { value: 'pas_interesse', label: '✕ Pas intéressé', color: 'bg-red-800 hover:bg-red-700 border-red-600', active: 'ring-2 ring-red-400' },
]

function formatTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function PowerDialer({ session: initialSession, onEnd }: PowerDialerProps) {
  const [session, setSession] = useState(initialSession)
  const [elapsed, setElapsed] = useState(0)
  const [callElapsed, setCallElapsed] = useState(0)
  const [transcription, setTranscription] = useState('')
  const [interimText, setInterimText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [resultat, setResultat] = useState('')
  const [aPitche, setAPitche] = useState<boolean | null>(null)
  const [rdvPris, setRdvPris] = useState(false)
  const [rdvDate, setRdvDate] = useState('')
  const [rdvHeure, setRdvHeure] = useState('')
  const [rdvEmailProspect, setRdvEmailProspect] = useState('')
  const [noteRapide, setNoteRapide] = useState('')
  const [savingAppel, setSavingAppel] = useState(false)
  const [ending, setEnding] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResume, setAiResume] = useState<{ resultat?: string; resume: string; pointsCles: string; prochaineAction: string } | null>(null)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [showTranscription, setShowTranscription] = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [scriptObjIndex, setScriptObjIndex] = useState<number | null>(null)
  const [showRappelModal, setShowRappelModal] = useState(false)
  const [rappelJour, setRappelJour] = useState('')
  const [rappelPlage, setRappelPlage] = useState('')
  const [emailSuiviLoading, setEmailSuiviLoading] = useState(false)
  const [emailSuiviSent, setEmailSuiviSent] = useState(false)

  // Modal email dans la session
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailModalTemplates, setEmailModalTemplates] = useState<EmailTemplate[]>([])
  const [emailModalTemplateId, setEmailModalTemplateId] = useState('')
  const [emailModalTo, setEmailModalTo] = useState('')
  const [emailModalSubject, setEmailModalSubject] = useState('')
  const [emailModalBody, setEmailModalBody] = useState('')
  const [emailModalRdvDate, setEmailModalRdvDate] = useState('')
  const [emailModalRdvHeure, setEmailModalRdvHeure] = useState('')
  const [emailModalSending, setEmailModalSending] = useState(false)
  const [emailModalSent, setEmailModalSent] = useState(false)
  const [emailModalError, setEmailModalError] = useState('')
  const [emailModalLoaded, setEmailModalLoaded] = useState(false)
  const [progressVisible, setProgressVisible] = useState(true)
  const [endedSession, setEndedSession] = useState<Session | null>(null)
  const [expediteur, setExpediteur] = useState('')
  const [queueIndex, setQueueIndex] = useState(initialSession.appels.length)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isListeningRef = useRef(false)

  const queue: AgenceQueue[] = session.agenceQueue || []
  const currentAgence: AgenceQueue | null = queue[queueIndex] || null
  const currentCallNum = session.totalAppels + 1
  const pct = session.objectif > 0 ? Math.min(100, Math.round((session.totalAppels / session.objectif) * 100)) : 0

  useEffect(() => {
    fetch('/api/parametres').then(r => r.json()).then((d: Record<string, string>) => {
      setExpediteur(d.SMTP_FROM || d.SMTP_USER || '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    sessionTimerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => { if (sessionTimerRef.current) clearInterval(sessionTimerRef.current) }
  }, [])

  useEffect(() => {
    callTimerRef.current = setInterval(() => setCallElapsed(e => e + 1), 1000)
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current) }
  }, [])

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'fr-FR'
    recognition.continuous = true
    recognition.interimResults = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let final = ''
      let interim = ''
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript + ' '
        else interim += event.results[i][0].transcript
      }
      if (final) setTranscription(prev => prev + final)
      setInterimText(interim)
    }
    recognition.onend = () => { if (isListeningRef.current) recognition.start() }
    recognition.onerror = () => { isListeningRef.current = false; setIsListening(false) }
    recognitionRef.current = recognition
    isListeningRef.current = true
    recognition.start()
    setIsListening(true)
  }, [])

  const stopListening = useCallback(() => {
    isListeningRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsListening(false)
    setInterimText('')
  }, [])

  const analyzeWithClaude = async (text: string) => {
    if (!text.trim()) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/claude-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription: text }),
      })
      const data = await res.json()
      if (!data.error) {
        setAiResume(data)
        if (data.resultat) setResultat(data.resultat)
      }
    } catch { /* silencieux */ }
    setAiLoading(false)
  }

  // Charger les templates au premier ouverture de la modal email
  useEffect(() => {
    if (!showEmailModal || emailModalLoaded) return
    setEmailModalLoaded(true)
    fetch('/api/email-templates').then(r => r.json()).then(setEmailModalTemplates).catch(() => {})
  }, [showEmailModal, emailModalLoaded])

  // Recalculer sujet/corps quand le template change dans la modal
  useEffect(() => {
    const t = emailModalTemplates.find(t => t.id === emailModalTemplateId)
    if (!t) return
    const rdvDateFr = emailModalRdvDate
      ? new Date(emailModalRdvDate + 'T12:00:00').toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        })
      : ''
    const vars = {
      agence: currentAgence?.nom || '',
      expediteur: 'Hugo — Agentry',
      rdvDate: rdvDateFr,
      rdvHeure: emailModalRdvHeure,
    }
    setEmailModalSubject(applyVars(t.sujet, vars))
    setEmailModalBody(applyVars(t.corps, vars))
  }, [emailModalTemplateId, emailModalTemplates, currentAgence?.nom, expediteur, emailModalRdvDate, emailModalRdvHeure])

  useEffect(() => {
    if (rdvPris && currentAgence) {
      const agEmail = (currentAgence as unknown as { email?: string }).email || ''
      if (agEmail && !rdvEmailProspect) setRdvEmailProspect(agEmail)
      if (!rdvDate) {
        const tomorrow = new Date(Date.now() + 86400000)
        setRdvDate(tomorrow.toISOString().split('T')[0])
      }
      if (!rdvHeure) setRdvHeure('10:00')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rdvPris])

  const saveAndNext = async () => {
    if (savingAppel) return
    setSavingAppel(true)
    stopListening()

    const fullTranscription = transcription + interimText
    let finalResume = aiResume
    if (fullTranscription.trim() && !aiResume) {
      setAiLoading(true)
      try {
        const res = await fetch('/api/claude-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcription: fullTranscription }),
        })
        const data = await res.json()
        if (!data.error) { finalResume = data; if (data.resultat && !resultat) setResultat(data.resultat) }
      } catch { /* silencieux */ }
      setAiLoading(false)
    }

    await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_appel',
        agenceId: currentAgence?.id || null,
        agenceNom: currentAgence?.nom || null,
        agenceTel: currentAgence?.telephone || null,
        agenceEmail: rdvEmailProspect || (currentAgence as unknown as { email?: string })?.email || null,
        transcription: fullTranscription || null,
        resultat: resultat || finalResume?.resultat || null,
        resume: finalResume?.resume || null,
        pointsCles: finalResume?.pointsCles || null,
        prochaineAction: finalResume?.prochaineAction || null,
        duree: callElapsed,
        aPitche: aPitche,
        rdvPris: rdvPris,
        rdvDate: rdvDate || null,
        rdvHeure: rdvHeure || null,
        noteRapide: noteRapide
          ? `${noteRapide}${rappelJour ? ` [Rappel: ${rappelJour}${rappelPlage ? ` ${rappelPlage}` : ''}]` : ''}`
          : rappelJour ? `[Rappel: ${rappelJour}${rappelPlage ? ` ${rappelPlage}` : ''}]` : null,
      }),
    })

    const updatedSession = await fetch(`/api/sessions/${session.id}`).then(r => r.json())
    setSession({ ...updatedSession, agenceQueue: queue })

    // Reset
    setTranscription('')
    setInterimText('')
    setResultat('')
    setAPitche(null)
    setRdvPris(false)
    setRdvDate('')
    setRdvHeure('')
    setRdvEmailProspect('')
    setNoteRapide('')
    setRappelJour('')
    setRappelPlage('')
    setEmailSuiviSent(false)
    setAiResume(null)
    setCallElapsed(0)
    setQueueIndex(i => i + 1)
    setSavingAppel(false)
    setTimeout(() => startListening(), 300)
  }

  const endSession = async () => {
    if (ending) return
    setEnding(true)
    stopListening()
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current)
    if (callTimerRef.current) clearInterval(callTimerRef.current)

    const fullTranscription = transcription + interimText
    if (fullTranscription.trim() || resultat || aPitche !== null || rdvPris || noteRapide) {
      await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_appel',
          agenceId: currentAgence?.id || null,
          agenceNom: currentAgence?.nom || null,
          agenceTel: currentAgence?.telephone || null,
          transcription: fullTranscription || null,
          resultat: resultat || null,
          duree: callElapsed,
          aPitche: aPitche,
          rdvPris: rdvPris,
          rdvDate: rdvDate || null,
          rdvHeure: rdvHeure || null,
          agenceEmail: rdvEmailProspect || (currentAgence as unknown as { email?: string })?.email || null,
          noteRapide: noteRapide || null,
        }),
      })
    }

    const res = await fetch(`/api/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'end', duree: elapsed }),
    })

    if (res.ok) {
      const ended = await res.json()
      setEndedSession({ ...ended, agenceQueue: queue })
    }
    setEnding(false)
  }

  // ——— BILAN DE SESSION ———
  if (endedSession) {
    const appels = endedSession.appels
    const total = appels.length
    const rdvs = appels.filter(a => a.rdvPris === true).length
    const interesses = appels.filter(a => a.resultat === 'interesse').length
    const aRappeler = appels.filter(a => a.resultat === 'rappeler').length
    const messagerie = appels.filter(a => a.resultat === 'messagerie' || a.resultat === 'absent').length
    const pasRepondu = appels.filter(a => a.resultat === 'pas_repondu').length
    const refuses = appels.filter(a => a.resultat === 'pas_interesse').length
    const pitches = appels.filter(a => a.aPitche === true).length
    const dureeTotal = endedSession.duree || elapsed

    return (
      <div className="min-h-screen bg-slate-950 overflow-y-auto">
        <div className="max-w-xl mx-auto px-5 py-10">
          <div className="text-center mb-10">
            <div className="text-6xl mb-4">{rdvs > 0 ? '🎯' : interesses > 0 ? '✅' : '📊'}</div>
            <h1 className="text-4xl font-bold text-white mb-2">Bilan de session</h1>
            <p className="text-slate-500">{formatTime(dureeTotal)} · {total} appel{total > 1 ? 's' : ''}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
              <div className="text-5xl font-bold text-white mb-1">{total}</div>
              <div className="text-slate-500 text-sm">Appels <span className="text-slate-600">/ {endedSession.objectif}</span></div>
            </div>
            <div className={`border rounded-2xl p-6 text-center ${rdvs > 0 ? 'bg-green-900/30 border-green-700' : 'bg-slate-900 border-slate-800'}`}>
              <div className={`text-5xl font-bold mb-1 ${rdvs > 0 ? 'text-green-400' : 'text-slate-500'}`}>{rdvs}</div>
              <div className={`text-sm ${rdvs > 0 ? 'text-green-300' : 'text-slate-500'}`}>RDV pris 📅</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Intéressés', val: interesses, color: 'text-green-400' },
                { label: 'À rappeler', val: aRappeler, color: 'text-amber-400' },
                { label: 'Pas répondu', val: pasRepondu, color: 'text-slate-400' },
                { label: 'Messagerie', val: messagerie, color: 'text-blue-400' },
                { label: 'Refusés', val: refuses, color: 'text-red-400' },
                { label: 'Pitchés', val: pitches, color: 'text-purple-400' },
                { label: 'Durée moy.', val: total > 0 ? `${Math.floor(Math.round(dureeTotal/total)/60)}m${String(Math.round(dureeTotal/total)%60).padStart(2,'0')}s` : '—', color: 'text-indigo-400' },
              ].map(item => (
                <div key={item.label} className="bg-slate-800 rounded-xl p-4 text-center">
                  <div className={`text-3xl font-bold ${item.color} mb-1`}>{item.val}</div>
                  <div className="text-slate-500 text-xs">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {rdvs > 0 && (
            <div className="bg-green-900/20 border border-green-700/50 rounded-2xl p-5 mb-4">
              <div className="text-green-300 font-semibold mb-3">📅 RDV pris</div>
              {appels.filter(a => a.rdvPris).map(a => (
                <div key={a.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-green-800/30 last:border-0">
                  <span className="text-green-400 font-bold">#{a.ordre}</span>
                  <span className="text-white">{a.agenceNom}</span>
                  {a.noteRapide && <span className="text-green-200/70 italic text-xs">— {a.noteRapide}</span>}
                </div>
              ))}
            </div>
          )}

          {aRappeler > 0 && (
            <div className="bg-amber-900/20 border border-amber-700/50 rounded-2xl p-5 mb-4">
              <div className="text-amber-300 font-semibold mb-3">↩ À rappeler ({aRappeler})</div>
              {appels.filter(a => a.resultat === 'rappeler').map(a => (
                <div key={a.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-amber-800/30 last:border-0">
                  <span className="text-amber-400 font-bold">#{a.ordre}</span>
                  <span className="text-white">{a.agenceNom}</span>
                  {a.noteRapide && <span className="text-amber-200/70 italic text-xs">— {a.noteRapide}</span>}
                </div>
              ))}
            </div>
          )}

          {endedSession.resume && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
              <div className="text-purple-400 text-xs font-semibold uppercase tracking-wide mb-3">✨ Coach IA</div>
              <p className="text-slate-300 text-sm leading-relaxed">{endedSession.resume}</p>
            </div>
          )}

          <button onClick={() => onEnd(endedSession)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-5 rounded-2xl font-bold text-lg transition mt-2">
            Retour →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-white font-mono font-bold">{formatTime(elapsed)}</span>
        </div>
        <div className="text-center flex items-center gap-2">
          <div style={progressVisible ? {} : { filter: 'blur(6px)', userSelect: 'none' }}>
            <span className="text-white font-bold text-xl tabular-nums">{session.totalAppels}</span>
            <span className="text-slate-500 text-sm">/{session.objectif}</span>
          </div>
          <button
            onClick={() => setProgressVisible(v => !v)}
            className="text-slate-600 hover:text-slate-400 text-xs transition leading-none"
            title={progressVisible ? 'Masquer le compteur' : 'Afficher le compteur'}
          >
            {progressVisible ? '👁' : '🙈'}
          </button>
        </div>
        <button onClick={() => setShowEndConfirm(true)}
          className="bg-red-800 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition">
          Terminer
        </button>
      </div>

      {/* Barre progression */}
      <div className="h-1 bg-slate-800 flex-shrink-0">
        <div className="h-1 bg-indigo-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {/* Contenu principal — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

        {/* FICHE AGENCE */}
        {currentAgence ? (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-widest mb-1">Appel {currentCallNum} / {queue.length || session.objectif}</div>
                <h2 className="text-white font-bold text-3xl leading-tight">{currentAgence.nom}</h2>
                {currentAgence.ville && <p className="text-slate-400 mt-1">{currentAgence.ville}</p>}
                {(currentAgence as unknown as { adresse?: string }).adresse && (
                  <p className="text-slate-600 text-sm mt-0.5">{(currentAgence as unknown as { adresse?: string }).adresse}</p>
                )}
              </div>
              <div className={`text-xs font-mono text-right flex-shrink-0 ml-3 font-bold tabular-nums ${
                callElapsed >= 180 ? 'text-red-400' : callElapsed >= 90 ? 'text-amber-400' : 'text-slate-500'
              }`}>
                {formatTime(callElapsed)}
              </div>
            </div>

            {/* Barre durée appel */}
            <div className="mb-4">
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-1000 ${
                    callElapsed >= 180 ? 'bg-red-500' : callElapsed >= 90 ? 'bg-amber-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, (callElapsed / 180) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-slate-700 text-xs mt-1">
                <span>0</span>
                <span className={callElapsed >= 90 ? 'text-amber-600' : ''}>1m30</span>
                <span className={callElapsed >= 180 ? 'text-red-600' : ''}>3min</span>
              </div>
            </div>

            {currentAgence.telephone ? (
              <a href={`tel:${currentAgence.telephone.replace(/\s/g, '')}`}
                className="flex items-center gap-4 bg-green-600/20 hover:bg-green-600/30 border border-green-600/50 text-white rounded-xl px-5 py-4 transition w-full mb-3">
                <span className="text-2xl">📞</span>
                <div>
                  <div className="font-bold text-2xl font-mono tracking-wider">{currentAgence.telephone}</div>
                  <div className="text-green-400 text-xs">Cliquer pour appeler</div>
                </div>
              </a>
            ) : (
              <div className="bg-slate-800 rounded-xl px-5 py-4 text-slate-500 text-sm mb-3">Pas de numéro</div>
            )}

            {(currentAgence as unknown as { email?: string }).email && (
              <div className="text-slate-500 text-sm mt-1">✉️ {(currentAgence as unknown as { email?: string }).email}</div>
            )}

            {/* Lien Google horaires */}
            <a
              href={`https://www.google.com/search?q=horaires+${encodeURIComponent((currentAgence.nom || '') + ' ' + (currentAgence.ville || ''))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-3 text-xs text-slate-500 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition"
            >
              🕐 Voir les horaires sur Google
            </a>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <p className="text-slate-400">File d&apos;appels terminée !</p>
          </div>
        )}

        {/* QUALIFICATION */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">

          {/* Résultats — vertical sur mobile, grille 2 col sur desktop */}
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2.5">
            {RESULTATS.map(r => (
              <button key={r.value}
                onClick={() => {
                  const newVal = resultat === r.value ? '' : r.value
                  setResultat(newVal)
                  if (r.value === 'interesse') setAPitche(true)
                  if (r.value === 'rappeler' && newVal === 'rappeler') setShowRappelModal(true)
                }}
                className={`py-4 rounded-xl text-base font-bold transition border min-h-[56px] ${
                  resultat === r.value
                    ? r.color + ' text-white ' + r.active
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}>
                {r.label}
                {r.value === 'rappeler' && rappelJour && resultat === 'rappeler' && (
                  <div className="text-xs font-normal text-amber-200/70 mt-0.5 truncate">{rappelJour}{rappelPlage ? ` · ${rappelPlage}` : ''}</div>
                )}
              </button>
            ))}
          </div>

          {/* Bouton email rapide */}
          <button
            type="button"
            onClick={() => {
              const agenceEmail = (currentAgence as unknown as { email?: string })?.email || ''
              setEmailModalTo(agenceEmail)
              setEmailModalTemplateId('')
              setEmailModalSubject('')
              setEmailModalBody('')
              setEmailModalRdvDate(rdvDate || '')
              setEmailModalRdvHeure(rdvHeure || '')
              setEmailModalSent(false)
              setEmailModalError('')
              setShowEmailModal(true)
            }}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition border bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white flex items-center justify-center gap-2"
          >
            ✉️ Composer un email
          </button>

          {/* Pitché + RDV */}
          <div className="flex gap-3">
            <button onClick={() => setAPitche(aPitche === true ? null : true)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition border ${
                aPitche === true
                  ? 'bg-purple-600 border-purple-500 text-white ring-2 ring-purple-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}>
              🎙 J&apos;ai pitché
            </button>
            <button onClick={() => { setRdvPris(!rdvPris); if (rdvPris) { setRdvDate(''); setRdvHeure(''); setRdvEmailProspect('') } }}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition border ${
                rdvPris
                  ? 'bg-green-600 border-green-500 text-white ring-2 ring-green-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}>
              📅 RDV pris
            </button>
          </div>

          {/* Détails RDV */}
          {rdvPris && (
            <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-4 space-y-3">
              <div className="text-green-300 text-sm font-semibold">📅 Détails du rendez-vous</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Date *</label>
                  <input type="date" value={rdvDate} onChange={e => setRdvDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500" />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Heure *</label>
                  <input type="time" value={rdvHeure} onChange={e => setRdvHeure(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500" />
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">Email prospect</label>
                <input type="email" value={rdvEmailProspect} onChange={e => setRdvEmailProspect(e.target.value)}
                  placeholder="contact@agence.com"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-green-500" />
              </div>
              {rdvEmailProspect && rdvDate && rdvHeure && (
                <p className="text-green-400 text-xs">✉️ Email de confirmation auto-envoyé</p>
              )}
            </div>
          )}

          {/* Email suivi IA — affiché si Intéressé + email dispo */}
          {resultat === 'interesse' && (currentAgence as unknown as { email?: string }).email && (
            <div className="bg-green-900/20 border border-green-700/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-green-300 text-xs font-semibold">✉️ Email de suivi</div>
                <div className="text-slate-500 text-xs">{(currentAgence as unknown as { email?: string }).email}</div>
              </div>
              {emailSuiviSent ? (
                <span className="text-green-400 text-xs font-bold">✓ Envoyé !</span>
              ) : (
                <button
                  onClick={async () => {
                    setEmailSuiviLoading(true)
                    try {
                      const res = await fetch('/api/email-suivi', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          agenceNom: currentAgence?.nom,
                          agenceEmail: (currentAgence as unknown as { email?: string }).email,
                          noteRapide: noteRapide || '',
                          agentPrenom: expediteur,
                        }),
                      })
                      if (res.ok) setEmailSuiviSent(true)
                    } catch { /* silencieux */ }
                    setEmailSuiviLoading(false)
                  }}
                  disabled={emailSuiviLoading}
                  className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition flex-shrink-0">
                  {emailSuiviLoading ? '…' : '✨ Envoyer'}
                </button>
              )}
            </div>
          )}

          {/* Note rapide */}
          <input type="text" value={noteRapide} onChange={e => setNoteRapide(e.target.value)}
            placeholder="Note rapide…"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
        </div>

        {/* SCRIPT D'APPEL — collapsible */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <button onClick={() => setShowScript(!showScript)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/50 transition">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm font-medium">📋 Script d&apos;appel</span>
              {showScript && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
            </div>
            <span className="text-slate-600 text-sm">{showScript ? '▲' : '▼'}</span>
          </button>

          {showScript && (
            <div className="px-5 pb-5 border-t border-slate-800 space-y-4 pt-4">

              {/* Ouverture */}
              <div>
                <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-2">🎯 Ouverture</div>
                <div className="bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 leading-relaxed border border-slate-700 space-y-1.5">
                  <p>« Bonjour, est-ce que je parle bien à <span className="text-indigo-300 font-medium">[Nom de l&apos;agence]</span> ? »</p>
                  <p className="text-slate-500 italic text-xs">(Oui c&apos;est bien ça.)</p>
                  <p className="mt-1">« Si je vous dis que c&apos;est un appel de prospection, vous raccrochez, ou vous me laissez <span className="text-indigo-300 font-medium">10 secondes</span> pour vous expliquer ? »</p>
                  <p className="text-slate-500 italic text-xs">(Laisser répondre — en général ils sourient et disent &quot;allez-y&quot;.)</p>
                </div>
              </div>

              {/* Pitch */}
              <div>
                <div className="text-xs text-green-400 font-semibold uppercase tracking-wider mb-2">🚀 Pitch</div>
                <div className="bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 leading-relaxed border border-slate-700 space-y-1.5">
                  <p>« On a remarqué que les agents immobiliers perdent beaucoup de temps à <span className="text-green-300 font-medium">prospecter manuellement sur LeBonCoin</span>. Nous on a créé un système qui fait ça à votre place — il <span className="text-green-300 font-medium">détecte les nouvelles annonces, envoie un message en automatique, et gère la conversation jusqu&apos;au rendez-vous.</span> Vos agents reçoivent directement les contacts qualifiés. »</p>
                  <p className="text-slate-500 italic text-xs">(Laisser répondre.)</p>
                  <p className="mt-1">« On cherche des agences partenaires pour tester ça <span className="text-green-300 font-medium">7 jours gratuitement</span>. Vous auriez <span className="text-green-300 font-medium">5 à 10 minutes</span> cette semaine pour qu&apos;on vous montre comment ça marche ? »</p>
                </div>
              </div>

              {/* Verrouiller le RDV */}
              <div>
                <div className="text-xs text-purple-400 font-semibold uppercase tracking-wider mb-2">📍 Verrouiller le RDV</div>
                <div className="bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 leading-relaxed border border-slate-700 space-y-2">
                  <p className="text-slate-500 italic text-xs">(S&apos;il dit oui :)</p>
                  <p>« Parfait. Je peux <span className="text-purple-300 font-medium">passer directement à l&apos;agence</span> si vous préférez, ou on fait ça par téléphone. Vous seriez disponible plutôt <span className="text-purple-300 font-medium">en début ou en fin de semaine</span> ? »</p>
                  <p className="text-slate-500 italic text-xs">(Une fois le créneau :)</p>
                  <p>« Super. Y aurait-il une raison pour laquelle vous ne pourriez pas être là à ce moment-là ? Je vous demande parce qu&apos;on a <span className="text-purple-300 font-medium">d&apos;autres agences dans votre secteur intéressées</span>, et je veux vous donner la priorité sur la zone. »</p>
                </div>
              </div>

              {/* Objections */}
              <div>
                <div className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-2">🛡 Objections</div>
                <div className="space-y-2">
                  {[
                    {
                      label: '« C\'est quoi exactement ? »',
                      reponse: '« C\'est ce que je vous montre en dix minutes — c\'est beaucoup plus clair à voir qu\'à expliquer. Vous êtes dispo plutôt le matin ou l\'après-midi ? »',
                    },
                    {
                      label: '« Envoyez un mail »',
                      reponse: '« Pas de souci. Vous auriez quand même dix minutes cette semaine pour qu\'on en parle ? C\'est vraiment plus parlant en direct. »',
                    },
                    {
                      label: '« On n\'a pas le temps »',
                      reponse: '« C\'est exactement le problème que le système règle. Cinq minutes suffit — plutôt cette semaine ou la semaine prochaine ? »',
                    },
                    {
                      label: '« On fait déjà LeBonCoin »',
                      reponse: '« Justement — est-ce que vous seriez curieux de voir comment le faire sans que vos agents y passent du temps ? »',
                    },
                  ].map((obj, i) => (
                    <div key={i} className="rounded-xl border border-slate-700 overflow-hidden">
                      <button
                        onClick={() => setScriptObjIndex(scriptObjIndex === i ? null : i)}
                        className="w-full text-left px-4 py-3 bg-slate-800 hover:bg-slate-700 transition text-sm font-medium text-amber-300 flex items-center justify-between">
                        <span>{obj.label}</span>
                        <span className="text-slate-500 text-xs ml-2 flex-shrink-0">{scriptObjIndex === i ? '▲' : '▼'}</span>
                      </button>
                      {scriptObjIndex === i && (
                        <div className="px-4 py-3 bg-amber-900/10 text-sm text-slate-300 leading-relaxed border-t border-slate-700">
                          {obj.reponse}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* TRANSCRIPTION — collapsible */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <button onClick={() => setShowTranscription(!showTranscription)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/50 transition">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm font-medium">🎤 Transcription</span>
              {isListening && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
              {transcription && <span className="text-indigo-400 text-xs">{transcription.split(' ').length} mots</span>}
            </div>
            <span className="text-slate-600 text-sm">{showTranscription ? '▲' : '▼'}</span>
          </button>

          {showTranscription && (
            <div className="px-5 pb-4 space-y-3 border-t border-slate-800">
              <div className="flex gap-2 pt-3">
                {!isListening ? (
                  <button onClick={startListening}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                    🎤 Démarrer
                  </button>
                ) : (
                  <button onClick={stopListening}
                    className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                    ⏹ Pause
                  </button>
                )}
                {transcription && (
                  <button onClick={() => analyzeWithClaude(transcription)} disabled={aiLoading}
                    className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                    {aiLoading ? '…' : '✨ Analyser'}
                  </button>
                )}
                {transcription && (
                  <button onClick={() => { setTranscription(''); setInterimText('') }}
                    className="text-slate-500 hover:text-white px-3 py-2 rounded-lg text-sm transition">
                    ✕
                  </button>
                )}
              </div>
              <div className="min-h-14 max-h-32 overflow-y-auto text-sm text-slate-300 leading-relaxed bg-slate-800 rounded-xl px-4 py-3">
                {transcription || interimText ? (
                  <><span>{transcription}</span>{interimText && <span className="text-slate-500 italic">{interimText}</span>}</>
                ) : (
                  <span className="text-slate-600 italic">{isListening ? 'En écoute…' : 'Appuie sur Démarrer'}</span>
                )}
              </div>
              {aiResume && (
                <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-3 space-y-1">
                  <div className="text-xs text-purple-400 font-medium">✨ Analyse IA</div>
                  <p className="text-xs text-slate-300">{aiResume.resume}</p>
                  {aiResume.prochaineAction && <p className="text-xs text-amber-400">→ {aiResume.prochaineAction}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Prochaine agence */}
        {queue[queueIndex + 1] && (
          <div className="px-2 pb-1">
            <div className="text-slate-600 text-xs uppercase tracking-wider mb-1">Suivante</div>
            <div className="text-slate-500 text-sm">{queue[queueIndex + 1].nom} {queue[queueIndex + 1].ville ? `— ${queue[queueIndex + 1].ville}` : ''}</div>
          </div>
        )}
      </div>

      {/* Bouton SUIVANT */}
      <div className="bg-slate-900 border-t border-slate-800 px-5 py-4 flex-shrink-0">
        <button onClick={saveAndNext} disabled={savingAppel || aiLoading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-5 rounded-2xl text-lg md:text-xl font-bold transition active:scale-95 shadow-xl shadow-indigo-900/40 min-h-[64px]">
          {savingAppel || aiLoading ? '…' : `✓ Valider et agence suivante`}
        </button>
      </div>

      {/* Modale Rappel */}
      {showRappelModal && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end justify-center p-4">
          <div className="bg-slate-800 border border-amber-700/50 rounded-2xl p-6 w-full max-w-sm mb-2">
            <h3 className="text-amber-300 font-bold text-lg mb-1">↩ À rappeler</h3>
            <p className="text-slate-400 text-sm mb-4">Quand souhaitent-ils être rappelés ?</p>

            {/* Jour */}
            <div className="mb-3">
              <label className="text-slate-400 text-xs block mb-1.5">Jour préféré</label>
              <div className="grid grid-cols-4 gap-2">
                {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Demain', 'Cette sem.', 'Libre'].map(j => (
                  <button key={j}
                    onClick={() => setRappelJour(rappelJour === j ? '' : j)}
                    className={`py-2 rounded-lg text-xs font-medium transition border ${
                      rappelJour === j
                        ? 'bg-amber-600 border-amber-500 text-white'
                        : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                    }`}>
                    {j}
                  </button>
                ))}
              </div>
            </div>

            {/* Plage horaire */}
            <div className="mb-5">
              <label className="text-slate-400 text-xs block mb-1.5">Plage horaire</label>
              <div className="grid grid-cols-3 gap-2">
                {['Matin (8-12h)', 'Midi (12-14h)', 'Après-midi (14-18h)'].map(p => (
                  <button key={p}
                    onClick={() => setRappelPlage(rappelPlage === p ? '' : p)}
                    className={`py-2 rounded-lg text-xs font-medium transition border ${
                      rappelPlage === p
                        ? 'bg-amber-600 border-amber-500 text-white'
                        : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                    }`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setRappelJour(''); setRappelPlage(''); setShowRappelModal(false) }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-3 rounded-xl text-sm font-medium transition">
                Passer
              </button>
              <button onClick={() => setShowRappelModal(false)}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl text-sm font-bold transition">
                {rappelJour || rappelPlage ? '✓ Enregistrer' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal email dans la session */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-end justify-center">
          <div className="bg-slate-900 border border-slate-700 rounded-t-3xl w-full max-w-lg max-h-[90vh] flex flex-col">

            {/* Header modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
              <div>
                <h3 className="text-white font-bold text-lg">✉️ Envoyer un email</h3>
                {currentAgence && <p className="text-slate-500 text-xs mt-0.5">{currentAgence.nom}</p>}
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="text-slate-500 hover:text-white text-2xl leading-none transition"
              >
                ✕
              </button>
            </div>

            {/* Corps modal — scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* Templates */}
              {emailModalTemplates.length > 0 && (
                <div>
                  <label className="text-slate-400 text-xs font-medium block mb-2">Template</label>
                  <div className="grid grid-cols-1 gap-2">
                    {emailModalTemplates.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setEmailModalTemplateId(emailModalTemplateId === t.id ? '' : t.id)}
                        className={`text-left px-4 py-3 rounded-xl border transition text-sm ${
                          emailModalTemplateId === t.id
                            ? 'bg-indigo-600/20 border-indigo-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-semibold">{t.nom}</div>
                        {t.objection && <div className="text-xs text-slate-500 mt-0.5">Objection : {t.objection}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Champs date/heure RDV si template rdv-confirmation sélectionné */}
              {emailModalTemplateId === 'rdv-confirmation' && (
                <div className="bg-slate-800/60 border border-indigo-500/30 rounded-xl px-4 py-3 space-y-3">
                  <p className="text-indigo-400 text-xs font-semibold">📅 Détails du rendez-vous</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 text-xs block mb-1">Date du RDV *</label>
                      <input
                        type="date"
                        value={emailModalRdvDate}
                        onChange={e => setEmailModalRdvDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 text-xs block mb-1">Heure *</label>
                      <input
                        type="time"
                        value={emailModalRdvHeure}
                        onChange={e => setEmailModalRdvHeure(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Destinataire */}
              <div>
                <label className="text-slate-400 text-xs font-medium block mb-1.5">Destinataire</label>
                <input
                  type="email"
                  value={emailModalTo}
                  onChange={e => setEmailModalTo(e.target.value)}
                  placeholder="contact@agence.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Objet */}
              <div>
                <label className="text-slate-400 text-xs font-medium block mb-1.5">Objet</label>
                <input
                  type="text"
                  value={emailModalSubject}
                  onChange={e => setEmailModalSubject(e.target.value)}
                  placeholder="Objet de l'email…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Corps */}
              <div>
                <label className="text-slate-400 text-xs font-medium block mb-1.5">Message (HTML)</label>
                <textarea
                  rows={6}
                  value={emailModalBody}
                  onChange={e => setEmailModalBody(e.target.value)}
                  placeholder="<p>Bonjour,</p>"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {emailModalError && (
                <div className="bg-red-900/30 border border-red-500/50 rounded-xl px-4 py-3 text-red-400 text-sm">
                  ⚠️ {emailModalError}
                </div>
              )}
            </div>

            {/* Footer modal — bouton envoyer */}
            <div className="px-6 py-4 border-t border-slate-800 flex-shrink-0">
              <button
                disabled={emailModalSending || !emailModalTo || !emailModalSubject || !emailModalBody || emailModalSent}
                onClick={async () => {
                  setEmailModalError('')
                  setEmailModalSending(true)
                  try {
                    const res = await fetch('/api/email', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        to: emailModalTo,
                        subject: emailModalSubject,
                        html: emailModalBody,
                        ...(emailModalTemplateId === 'rdv-confirmation' && emailModalRdvDate && emailModalRdvHeure ? {
                          rdvDate: emailModalRdvDate,
                          rdvHeure: emailModalRdvHeure,
                          agenceNom: currentAgence?.nom || '',
                          agenceEmail: emailModalTo,
                        } : {}),
                      }),
                    })
                    const data = await res.json()
                    if (!res.ok) { setEmailModalError(data.error || 'Erreur envoi') }
                    else { setEmailModalSent(true); setTimeout(() => setShowEmailModal(false), 1500) }
                  } catch {
                    setEmailModalError('Erreur réseau')
                  }
                  setEmailModalSending(false)
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-4 rounded-2xl font-bold text-base transition"
              >
                {emailModalSending ? 'Envoi…' : emailModalSent ? '✅ Email envoyé !' : '📤 Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation fin */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-bold text-lg mb-2">Terminer la session ?</h3>
            <p className="text-slate-400 text-sm mb-5">{session.totalAppels} appels · {formatTime(elapsed)}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowEndConfirm(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl text-sm font-medium transition">
                Continuer
              </button>
              <button onClick={() => { setShowEndConfirm(false); endSession() }} disabled={ending}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white py-3 rounded-xl text-sm font-medium transition disabled:opacity-50">
                {ending ? 'Clôture…' : 'Voir le bilan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
