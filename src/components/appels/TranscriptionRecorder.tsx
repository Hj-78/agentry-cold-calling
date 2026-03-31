'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  value: string
  onChange: (text: string) => void
}

export default function TranscriptionRecorder({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false)
  const [supported, setSupported] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const finalRef = useRef(value)

  useEffect(() => {
    finalRef.current = value
  }, [value])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
      setSupported(false)
    }
  }, [])

  const startRecording = () => {
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
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalRef.current += t + ' '
        } else {
          interim = t
        }
      }
      onChange(finalRef.current + interim)
    }

    recognition.onerror = () => setRecording(false)
    recognition.onend = () => setRecording(false)
    recognition.start()
    recognitionRef.current = recognition
    setRecording(true)
  }

  const stopRecording = () => {
    recognitionRef.current?.stop()
    setRecording(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={recording ? stopRecording : startRecording}
          disabled={!supported}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            !supported ? 'bg-slate-700 text-slate-500 cursor-not-allowed' :
            recording ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse' :
            'bg-slate-700 hover:bg-slate-600 text-slate-200'
          }`}>
          {recording ? '⏹ Arrêter' : '🎤 Dicter'}
        </button>
        {recording && <span className="text-red-400 text-xs animate-pulse">● En cours…</span>}
        {!supported && <span className="text-amber-400 text-xs">⚠️ Utilisez Chrome ou Safari</span>}
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="Transcription de l'appel (dictée ou saisie manuelle)…"
        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 text-sm h-32 resize-none" />
    </div>
  )
}
