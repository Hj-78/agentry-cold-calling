import { google } from 'googleapis'

export interface GoogleMeetResult {
  meetLink: string | null
  eventLink: string | null
}

export async function createRdvWithMeet(params: {
  agenceNom: string
  agenceEmail: string
  rdvDate: string   // YYYY-MM-DD
  rdvHeure: string  // HH:MM
  description: string
}): Promise<GoogleMeetResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('[GCAL] Variables manquantes:', { clientId: !!clientId, clientSecret: !!clientSecret, refreshToken: !!refreshToken })
    return { meetLink: null, eventLink: null }
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })

  const calendar = google.calendar({ version: 'v3', auth })

  // Construire les DateTimes en timezone Paris
  const startIso = `${params.rdvDate}T${params.rdvHeure}:00`
  const startDate = new Date(startIso)
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000) // +1h

  const event = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    sendUpdates: 'all', // Google envoie automatiquement l'invitation au prospect
    requestBody: {
      summary: `RDV Agentry — ${params.agenceNom}`,
      description: params.description,
      start: {
        dateTime: `${params.rdvDate}T${params.rdvHeure}:00`,
        timeZone: 'Europe/Paris',
      },
      end: {
        dateTime: `${params.rdvDate}T${String(parseInt(params.rdvHeure.split(':')[0]) + 1).padStart(2, '0')}:${params.rdvHeure.split(':')[1]}:00`,
        timeZone: 'Europe/Paris',
      },
      attendees: [
        { email: params.agenceEmail, displayName: params.agenceNom },
      ],
      conferenceData: {
        createRequest: {
          requestId: `agentry-rdv-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    },
  })

  const meetLink =
    event.data.conferenceData?.entryPoints?.find(
      ep => ep.entryPointType === 'video'
    )?.uri ?? null

  return {
    meetLink,
    eventLink: event.data.htmlLink ?? null,
  }
}
