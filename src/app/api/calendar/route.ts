export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DAVClient } from 'tsdav'
// @ts-ignore - ical.js n'a pas de types complets
import ICAL from 'ical.js'

interface CalEvent {
  id: string
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  allDay?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function icalDateToISO(icalTime: any): { dateTime?: string; date?: string } {
  if (!icalTime) return {}
  const isDate = icalTime.isDate
  if (isDate) {
    return { date: icalTime.toString().substring(0, 10) }
  }
  // Convertit en JS Date puis en ISO string
  const jsDate = icalTime.toJSDate()
  return { dateTime: jsDate.toISOString() }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseICSWithRRULE(icsData: string, from: Date, to: Date): CalEvent[] {
  if (!icsData?.trim()) return []
  const events: CalEvent[] = []

  try {
    const jCal = ICAL.parse(icsData)
    const comp = new ICAL.Component(jCal)
    const vevents = comp.getAllSubcomponents('vevent')

    for (const vevent of vevents) {
      try {
        const event = new ICAL.Event(vevent)
        const summary = event.summary || ''
        const description = event.description || undefined
        const location = event.location || undefined
        const uid = event.uid || String(Math.random())

        if (event.isRecurring()) {
          // Itère les occurrences futures
          const iter = event.iterator()
          let next = iter.next()
          let safety = 0
          while (next && safety < 500) {
            safety++
            const jsStart = next.toJSDate()
            if (jsStart > to) break
            if (jsStart >= from) {
              const details = event.getOccurrenceDetails(next)
              const startISO = icalDateToISO(details.startDate)
              const endISO = icalDateToISO(details.endDate)
              events.push({
                id: `${uid}-${jsStart.getTime()}`,
                summary,
                description,
                location,
                start: startISO,
                end: endISO,
                allDay: details.startDate.isDate,
              })
            }
            next = iter.next()
          }
        } else {
          // Événement simple
          if (!event.startDate) continue
          const jsStart = event.startDate.toJSDate()
          if (jsStart < from || jsStart > to) continue
          const startISO = icalDateToISO(event.startDate)
          const endISO = icalDateToISO(event.endDate)
          events.push({
            id: uid,
            summary,
            description,
            location,
            start: startISO,
            end: endISO,
            allDay: event.startDate.isDate,
          })
        }
      } catch {
        // event mal formé, on skip
      }
    }
  } catch {
    // ICS mal formé
  }

  return events
}

async function getClient() {
  const appleIdParam = await prisma.parametre.findUnique({ where: { cle: 'ICLOUD_APPLE_ID' } })
  const appPassParam = await prisma.parametre.findUnique({ where: { cle: 'ICLOUD_APP_PASSWORD' } })
  if (!appleIdParam?.valeur || !appPassParam?.valeur) return null

  const client = new DAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: {
      username: appleIdParam.valeur,
      password: appPassParam.valeur,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
  await client.login()
  return client
}

// GET : récupère les événements iCloud des 60 prochains jours (avec récurrences)
export async function GET() {
  try {
    const client = await getClient()
    if (!client) return NextResponse.json({ events: [], connected: false })

    const calendars = await client.fetchCalendars()

    // Fenêtre : aujourd'hui → 60 jours
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

    const allObjects = (await Promise.all(
      calendars.map(cal =>
        client.fetchCalendarObjects({ calendar: cal })
          .catch(() => [] as { data: string }[])
      )
    )).flat()

    const events = allObjects
      .flatMap(obj => parseICSWithRRULE(obj.data || '', from, to))
      .sort((a, b) => {
        const da = a.start.dateTime || a.start.date || ''
        const db = b.start.dateTime || b.start.date || ''
        return da.localeCompare(db)
      })

    return NextResponse.json({ connected: true, events })
  } catch (e) {
    console.error('iCloud calendar GET error:', e)
    return NextResponse.json({ events: [], connected: false, error: String(e) })
  }
}

// POST : crée un événement dans iCloud Calendar
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { agenceNom, agenceEmail, rdvDate, rdvHeure, description } = body

    const client = await getClient()
    if (!client) return NextResponse.json({ error: 'iCloud non configuré' }, { status: 400 })

    const calendars = await client.fetchCalendars()
    const defaultCal =
      calendars.find(c => String(c.displayName || '').toLowerCase().includes('travail')) ||
      calendars.find(c => String(c.displayName || '').toLowerCase().includes('personnel')) ||
      calendars[0]

    if (!defaultCal) return NextResponse.json({ error: 'Aucun calendrier trouvé' }, { status: 400 })

    const [h, m] = rdvHeure.split(':').map(Number)
    const endH = String(h + 1).padStart(2, '0')
    const uid = `agentry-${Date.now()}@coldcall`
    const dtstart = `${rdvDate.replace(/-/g, '')}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`
    const dtend   = `${rdvDate.replace(/-/g, '')}T${endH}${String(m).padStart(2, '0')}00`

    const attendeeLine = agenceEmail
      ? `ATTENDEE;RSVP=TRUE;CN=${agenceEmail}:mailto:${agenceEmail}`
      : ''

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ColdCall CRM//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SUMMARY:RDV – ${agenceNom}`,
      `DTSTART;TZID=Europe/Paris:${dtstart}`,
      `DTEND;TZID=Europe/Paris:${dtend}`,
      description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : null,
      attendeeLine || null,
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n')

    await client.createCalendarObject({
      calendar: defaultCal,
      filename: `${uid}.ics`,
      iCalString: ics,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('iCloud create event error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
