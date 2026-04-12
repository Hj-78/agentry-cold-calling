export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'

interface ScrapeResult {
  nom: string
  telephone: string
  adresse: string
  ville: string
  horaires: string
  website: string
}

const CHROME_CANDIDATES = [
  // Mac local
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Linux system (Railway nixpacks)
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/run/current-system/sw/bin/chromium',
]

async function findChromium(): Promise<string> {
  // 1. Var d'env explicite (Railway settings)
  if (process.env.CHROMIUM_EXECUTABLE_PATH) return process.env.CHROMIUM_EXECUTABLE_PATH

  // 2. Chercher dans les chemins connus
  const { existsSync } = await import('fs')
  const found = CHROME_CANDIDATES.find((p) => existsSync(p))
  if (found) return found

  // 3. Essayer `which chromium` (nix PATH)
  try {
    const { execSync } = await import('child_process')
    const path = execSync('which chromium || which chromium-browser || which google-chrome', {
      encoding: 'utf-8',
    }).trim()
    if (path && existsSync(path)) return path
  } catch { /* not found in PATH */ }

  throw new Error(
    'Chromium introuvable. En local: installe Google Chrome. Sur Railway: ajoute nixPkgs = ["chromium"] dans nixpacks.toml'
  )
}

async function launchBrowser() {
  const puppeteer = (await import('puppeteer-core')).default
  const executablePath = await findChromium()

  return puppeteer.launch({
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--headless=new',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--mute-audio',
    ],
    defaultViewport: { width: 1280, height: 800 },
    headless: true,
  })
}

async function scrapeGoogleMaps(keyword: string, city: string): Promise<ScrapeResult[]> {
  const browser = await launchBrowser()

  try {
    const page = await browser.newPage()

    // Bloc anti-bot basique
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' })

    // Aller sur Google Maps
    const query = encodeURIComponent(`${keyword} ${city}`)
    await page.goto(`https://www.google.com/maps/search/${query}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    // Accepter les cookies RGPD si présents
    try {
      await page.waitForSelector('button[aria-label], form button', { timeout: 4000 })
      const buttons = await page.$$('button')
      for (const btn of buttons) {
        const txt = await btn.evaluate((el) => el.textContent?.toLowerCase() || '')
        if (txt.includes('accept') || txt.includes('tout accepter') || txt.includes('tout refuser')) {
          await btn.click()
          break
        }
      }
      await new Promise((r) => setTimeout(r, 1500))
    } catch {
      /* pas de dialog cookie */
    }

    // Attendre la liste de résultats
    try {
      await page.waitForSelector('[role="feed"] a[href*="/maps/place/"], a[href*="/maps/place/"]', {
        timeout: 15000,
      })
    } catch {
      return []
    }

    // Scroll pour charger plus de résultats
    await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]')
      if (feed) feed.scrollTop = 9999
    })
    await new Promise((r) => setTimeout(r, 2000))

    // Récupérer les liens des résultats
    const resultLinks: { href: string; nom: string; adresse: string }[] = await page.evaluate(() => {
      const seen = new Set<string>()
      const items: { href: string; nom: string; adresse: string }[] = []

      document.querySelectorAll('a[href*="/maps/place/"]').forEach((a) => {
        const href = (a as HTMLAnchorElement).href
        if (!href || seen.has(href)) return
        seen.add(href)

        // Chercher le nom dans les enfants
        const nameEl =
          a.querySelector('.fontHeadlineSmall') ||
          a.querySelector('.qBF1Pd') ||
          a.querySelector('[class*="fontHeadline"]')
        const nom =
          nameEl?.textContent?.trim() ||
          (a as HTMLAnchorElement).getAttribute('aria-label') ||
          ''

        // Adresse: spans après le nom dans les blocs d'info
        const infoEls = a.querySelectorAll('.W4Efsd span, .UsdlK span')
        const adresse = Array.from(infoEls)
          .map((el) => el.textContent?.trim())
          .filter(Boolean)
          .join(', ')
          .slice(0, 100)

        if (nom) items.push({ href, nom, adresse })
      })

      return items.slice(0, 12)
    })

    if (resultLinks.length === 0) return []

    // Visiter chaque résultat pour récupérer le téléphone
    const results: ScrapeResult[] = []

    for (const link of resultLinks) {
      try {
        await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 15000 })
        await new Promise((r) => setTimeout(r, 1000))

        const details = await page.evaluate(() => {
          // Téléphone
          let telephone = ''
          const telLink = document.querySelector('a[href^="tel:"]') as HTMLAnchorElement | null
          if (telLink) telephone = telLink.href.replace('tel:', '')
          if (!telephone) {
            const telBtn = document.querySelector('[data-item-id^="phone:tel:"]') as HTMLElement | null
            if (telBtn) telephone = telBtn.getAttribute('data-item-id')?.replace('phone:tel:', '') || ''
          }

          // Adresse
          let adresse = ''
          const addrBtn = document.querySelector('[data-item-id="address"]') as HTMLElement | null
          if (addrBtn) adresse = addrBtn.textContent?.trim() || ''

          // Horaires
          let horaires = ''
          const hoursEl =
            document.querySelector('[aria-label*="horaire"], [aria-label*="Ouvert"], [aria-label*="Fermé"]') as HTMLElement | null
          if (hoursEl) horaires = hoursEl.getAttribute('aria-label') || ''

          // Site web
          let website = ''
          const webLink = document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement | null
          if (webLink) website = webLink.href || ''

          return { telephone, adresse, horaires, website }
        })

        results.push({
          nom: link.nom,
          telephone: details.telephone || '',
          adresse: details.adresse || link.adresse || '',
          ville: city,
          horaires: details.horaires || '',
          website: details.website || '',
        })
      } catch {
        // Garder quand même le résultat sans détails
        results.push({
          nom: link.nom,
          telephone: '',
          adresse: link.adresse || '',
          ville: city,
          horaires: '',
          website: '',
        })
      }

      await new Promise((r) => setTimeout(r, 400))
    }

    return results
  } finally {
    await browser.close()
  }
}

export async function POST(req: Request) {
  const { keyword = 'agence immobilière', city } = await req.json()

  if (!city?.trim()) {
    return NextResponse.json({ error: 'Ville requise' }, { status: 400 })
  }

  try {
    const results = await scrapeGoogleMaps(keyword, city)
    return NextResponse.json({ results, total: results.length })
  } catch (err) {
    console.error('[SCRAPE MAPS] Error:', err)
    return NextResponse.json(
      { error: `Erreur scraping: ${err instanceof Error ? err.message : 'Inconnue'}` },
      { status: 500 }
    )
  }
}
