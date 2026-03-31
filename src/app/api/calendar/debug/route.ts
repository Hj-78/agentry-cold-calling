export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DAVClient } from 'tsdav'

export async function GET() {
  const appleIdParam = await prisma.parametre.findUnique({ where: { cle: 'ICLOUD_APPLE_ID' } })
  const appPassParam = await prisma.parametre.findUnique({ where: { cle: 'ICLOUD_APP_PASSWORD' } })

  const client = new DAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: { username: appleIdParam!.valeur, password: appPassParam!.valeur },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
  await client.login()

  const calendars = await client.fetchCalendars()
  const result = []

  for (const cal of calendars) {
    const objects = await client.fetchCalendarObjects({ calendar: cal }).catch(() => [])
    const events = objects.map((o: { data?: string }) => {
      const data = o.data || ''
      const summary = data.match(/SUMMARY:(.*)/)?.[1]?.trim() || '?'
      const dtstart = data.match(/DTSTART[^:]*:(\d{8})/)?.[1] || ''
      const rrule = data.match(/RRULE:(.*)/)?.[1]?.trim() || null
      const date = dtstart ? `${dtstart.substring(0,4)}-${dtstart.substring(4,6)}-${dtstart.substring(6,8)}` : ''
      return { summary, date, rrule }
    }).sort((a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date))

    result.push({
      calendar: cal.displayName,
      count: objects.length,
      events,
    })
  }

  return NextResponse.json(result)
}
