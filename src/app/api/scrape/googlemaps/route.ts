export const dynamic = 'force-dynamic'
export const maxDuration = 120 // Railway max 120s

import { NextResponse } from 'next/server'

interface ScrapeResult {
  nom: string
  telephone: string
  adresse: string
  ville: string
  horaires: string
  website: string
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(req: Request) {
  const { keyword = 'agence immobilière', city } = await req.json()

  if (!city?.trim()) {
    return NextResponse.json({ error: 'Ville requise' }, { status: 400 })
  }

  try {
    // Dynamic import to avoid SSR issues
    const { chromium } = await import('playwright')

    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--no-first-run',
        '--lang=fr-FR',
      ],
    })

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'fr-FR',
      viewport: { width: 1280, height: 800 },
    })

    const page = await context.newPage()

    // Navigate to Google Maps
    const query = encodeURIComponent(`${keyword} ${city}`)
    await page.goto(`https://www.google.com/maps/search/${query}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    await sleep(2000)

    // Dismiss cookie banner if present
    try {
      const acceptBtn = page.locator('button:has-text("Tout accepter"), button:has-text("Accept all"), button:has-text("Accepter")').first()
      if (await acceptBtn.isVisible({ timeout: 3000 })) {
        await acceptBtn.click()
        await sleep(1000)
      }
    } catch { /* no cookie banner */ }

    await sleep(2000)

    // Scroll the results panel to load more results
    const resultsPanel = page.locator('[role="feed"]').first()
    for (let i = 0; i < 5; i++) {
      try {
        await resultsPanel.evaluate(el => el.scrollBy(0, 800))
        await sleep(1500)
      } catch { break }
    }

    // Extract result items
    const results: ScrapeResult[] = []

    // Get all place cards
    const placeCards = await page.locator('a[href*="/maps/place/"]').all()

    for (let i = 0; i < Math.min(placeCards.length, 20); i++) {
      try {
        await placeCards[i].click()
        await sleep(2000)

        // Extract data from the detail panel
        const nom = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => '')
        if (!nom?.trim()) continue

        // Phone
        let telephone = ''
        try {
          const phoneEl = page.locator('[data-tooltip="Copier le numéro de téléphone"], [data-item-id^="phone:tel:"]').first()
          if (await phoneEl.isVisible({ timeout: 2000 })) {
            telephone = (await phoneEl.getAttribute('data-item-id') || '').replace('phone:tel:', '')
            if (!telephone) telephone = (await phoneEl.textContent() || '').trim()
          }
        } catch { /* no phone */ }

        // Address
        let adresse = ''
        try {
          const addrEl = page.locator('[data-item-id="address"], button[data-tooltip*="adresse"] div').first()
          if (await addrEl.isVisible({ timeout: 2000 })) {
            adresse = (await addrEl.textContent() || '').trim()
          }
        } catch { /* no address */ }

        // Extract city from address
        let ville = city
        const adresseParts = adresse.split(',')
        if (adresseParts.length >= 2) {
          const lastPart = adresseParts[adresseParts.length - 1].trim()
          const cityMatch = lastPart.match(/\d{5}\s+(.+)/)
          if (cityMatch) ville = cityMatch[1].trim()
        }

        // Hours
        let horaires = ''
        try {
          const hoursEl = page.locator('[data-item-id="oh"], .OMl5r').first()
          if (await hoursEl.isVisible({ timeout: 2000 })) {
            horaires = (await hoursEl.textContent() || '').trim().slice(0, 200)
          }
        } catch { /* no hours */ }

        // Website
        let website = ''
        try {
          const siteEl = page.locator('a[data-item-id="authority"]').first()
          if (await siteEl.isVisible({ timeout: 2000 })) {
            website = (await siteEl.getAttribute('href') || '').split('?')[0]
          }
        } catch { /* no website */ }

        if (nom.trim()) {
          results.push({
            nom: nom.trim(),
            telephone: telephone.trim(),
            adresse: adresse.trim(),
            ville: ville.trim(),
            horaires: horaires.trim(),
            website: website.trim(),
          })
        }

        await sleep(2000)

        // Go back to results list
        const backBtn = page.locator('button[aria-label*="Retour"], button[aria-label*="Back"]').first()
        if (await backBtn.isVisible({ timeout: 2000 })) {
          await backBtn.click()
          await sleep(1500)
        } else {
          await page.goBack({ timeout: 5000 })
          await sleep(1500)
        }
      } catch { /* skip this result */ }
    }

    await browser.close()

    return NextResponse.json({ results, total: results.length })
  } catch (err) {
    console.error('[SCRAPE] Error:', err)
    return NextResponse.json(
      { error: `Erreur scraping: ${err instanceof Error ? err.message : 'Inconnue'}` },
      { status: 500 }
    )
  }
}
