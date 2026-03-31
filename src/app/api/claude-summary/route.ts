import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: Request) {
  const { transcription } = await req.json()

  if (!transcription?.trim()) {
    return NextResponse.json({ error: 'Transcription vide' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'Clé ANTHROPIC_API_KEY manquante dans .env.local' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Tu es un expert en cold calling commercial francophone. Analyse cette transcription d'appel de prospection.

Transcription :
---
${transcription}
---

Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans texte autour) :
{
  "resultat": "interesse | pas_interesse | rappeler | messagerie | absent",
  "resume": "résumé de l'appel en 2-3 phrases",
  "pointsCles": "point 1, point 2, point 3",
  "prochaineAction": "action concrète et précise à réaliser"
}`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    return NextResponse.json({ error: 'Réponse Claude invalide' }, { status: 500 })
  }

  try {
    const cleaned = content.text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
    return NextResponse.json(JSON.parse(cleaned))
  } catch {
    return NextResponse.json({ error: 'Parsing impossible', raw: content.text }, { status: 500 })
  }
}
