#!/usr/bin/env node
/**
 * scraper-server.js — Serveur local de scraping Google Maps
 *
 * Utilise puppeteer-core (déjà installé) + Google Chrome (déjà sur votre Mac).
 * Aucune installation supplémentaire nécessaire.
 *
 * Démarrer avec :  npm run scraper
 * Laisser tourner en arrière-plan pendant l'utilisation de l'app.
 */

const http = require('http')

const PORT = process.env.SCRAPER_PORT || 3333

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// ─── Scraping ────────────────────────────────────────────────────────────────

async function scrapeGoogleMaps({ keyword, city, maxResults }) {
  const puppeteer = require('puppeteer-core')

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1280, height: 800 },
  })

  try {
    const page = await browser.newPage()

    // Masquer les indices headless
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8' })

    // ── Naviguer vers Google Maps ──────────────────────────────────────────
    const query = encodeURIComponent(`${keyword} ${city}`)
    console.log(`\n[SCRAPER] Recherche : "${keyword} ${city}" (max ${maxResults} résultats)`)

    await page.goto(`https://www.google.com/maps/search/${query}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    await delay(2000)

    // ── Consentement RGPD ──────────────────────────────────────────────────
    try {
      await page.waitForSelector('button', { timeout: 4000 })
      const buttons = await page.$$('button')
      for (const btn of buttons) {
        const txt = (await btn.evaluate((el) => el.textContent || '')).toLowerCase()
        if (txt.includes('accepter') || txt.includes('accept') || txt.includes('tout accept')) {
          await btn.click()
          console.log('[SCRAPER] Cookies acceptés')
          await delay(1500)
          break
        }
      }
    } catch {
      // Pas de dialog cookies
    }

    // ── Attendre la liste ──────────────────────────────────────────────────
    try {
      await page.waitForSelector('[role="feed"]', { timeout: 15000 })
    } catch {
      return {
        results: [],
        total: 0,
        message: "Google Maps n'a pas chargé la liste. Réessayez.",
      }
    }

    // ── Scroll pour charger plus de résultats ──────────────────────────────
    const target = Math.min(maxResults, 20)
    for (let i = 0; i < 6; i++) {
      const count = await page.$$eval(
        '[role="feed"] a[href*="/maps/place/"]',
        (els) => new Set(els.map((e) => e.href)).size
      )
      console.log(`[SCRAPER] ${count} résultats chargés...`)
      if (count >= target) break
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]')
        if (feed) feed.scrollTop += 3000
      })
      await delay(2000)
    }

    // ── Extraire les liens ─────────────────────────────────────────────────
    const resultLinks = await page.evaluate((max) => {
      const seen = new Set()
      const items = []

      document.querySelectorAll('[role="feed"] a[href*="/maps/place/"]').forEach((a) => {
        const href = a.href
        if (!href || seen.has(href)) return
        seen.add(href)

        // Chercher le nom — plusieurs sélecteurs par ordre de priorité
        const selectors = [
          '.fontHeadlineSmall',
          '[class*="fontHeadline"]',
          '.qBF1Pd',
          '[class*="NrDZNb"]',
          '[class*="GpJrze"]',
        ]
        let nom = ''
        for (const sel of selectors) {
          const el = a.querySelector(sel)
          if (el && el.textContent && el.textContent.trim()) {
            nom = el.textContent.trim()
            break
          }
        }
        if (!nom) nom = a.getAttribute('aria-label') || ''

        if (nom && items.length < max) items.push({ href, nom })
      })

      return items
    }, target)

    console.log(`[SCRAPER] ${resultLinks.length} établissements à visiter`)

    if (resultLinks.length === 0) {
      return {
        results: [],
        total: 0,
        message: `Aucun établissement trouvé pour "${keyword} ${city}". Essayez un autre mot-clé ou ville.`,
      }
    }

    // ── Visiter chaque fiche ───────────────────────────────────────────────
    const results = []

    for (let i = 0; i < resultLinks.length; i++) {
      const link = resultLinks[i]
      process.stdout.write(`[SCRAPER] [${i + 1}/${resultLinks.length}] ${link.nom} ... `)

      try {
        await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 15000 })
        await delay(2000)

        const details = await page.evaluate(() => {
          // ── Téléphone ──
          let telephone = ''

          // Méthode 1 : lien tel:
          const telLink = document.querySelector('a[href^="tel:"]')
          if (telLink) telephone = telLink.href.replace('tel:', '').trim()

          // Méthode 2 : data-item-id
          if (!telephone) {
            const telBtn = document.querySelector('[data-item-id^="phone:tel:"]')
            if (telBtn) {
              telephone = (telBtn.getAttribute('data-item-id') || '').replace('phone:tel:', '').trim()
            }
          }

          // Méthode 3 : aria-label ressemblant à un numéro
          if (!telephone) {
            const candidates = document.querySelectorAll('button[aria-label], [role="button"][aria-label]')
            for (const el of candidates) {
              const label = (el.getAttribute('aria-label') || '').trim()
              if (/[\d]{8,}/.test(label.replace(/[\s\-\.\+]/g, ''))) {
                telephone = label
                break
              }
            }
          }

          // ── Adresse ──
          let adresse = ''
          const addrEl = document.querySelector('[data-item-id="address"]')
          if (addrEl) adresse = (addrEl.textContent || '').trim()

          // ── Horaires ──
          let horaires = ''
          const hoursEl = document.querySelector(
            '[aria-label*="horaire"], [aria-label*="Ouvert"], [aria-label*="Fermé"], [aria-label*="heure d"]'
          )
          if (hoursEl) horaires = (hoursEl.getAttribute('aria-label') || '').slice(0, 200)

          // ── Site web ──
          let website = ''
          const webLink = document.querySelector('a[data-item-id="authority"]')
          if (webLink) website = webLink.href || ''

          return { telephone, adresse, horaires, website }
        })

        console.log(details.telephone || '(pas de téléphone)')

        results.push({
          nom: link.nom,
          telephone: details.telephone,
          adresse: details.adresse,
          ville: city,
          horaires: details.horaires,
          website: details.website,
        })
      } catch (err) {
        console.log(`ERREUR: ${err.message}`)
        results.push({ nom: link.nom, telephone: '', adresse: '', ville: city, horaires: '', website: '' })
      }

      // Délai minimum 2 secondes entre chaque action (anti-blocage)
      await delay(2000)
    }

    return { results, total: results.length }
  } finally {
    await browser.close()
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Serveur HTTP ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS — autorise l'app Next.js (local ou Railway) à appeler ce serveur depuis le navigateur
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  // GET /health
  if (req.method === 'GET' && req.url === '/health') {
    send(200, { status: 'ok', message: 'Serveur de scraping actif' })
    return
  }

  // POST /scrape
  if (req.method === 'POST' && req.url === '/scrape') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      let params
      try {
        params = JSON.parse(body)
      } catch {
        send(400, { error: 'Corps JSON invalide' })
        return
      }

      const { keyword = 'agence immobilière', city, maxResults = 15 } = params

      if (!city || !city.trim()) {
        send(400, { error: 'Ville requise' })
        return
      }

      try {
        const result = await scrapeGoogleMaps({
          keyword: keyword.trim(),
          city: city.trim(),
          maxResults: Math.min(parseInt(maxResults) || 15, 20),
        })
        console.log(`[SCRAPER] Terminé : ${result.total || (result.results && result.results.length) || 0} résultats\n`)
        send(200, result)
      } catch (err) {
        console.error('[SCRAPER] Erreur fatale :', err.message)
        send(500, { error: err.message || 'Erreur de scraping inconnue' })
      }
    })
    return
  }

  send(404, { error: 'Route introuvable' })
})

server.listen(PORT, () => {
  console.log('')
  console.log('═══════════════════════════════════════════════════')
  console.log('  🚀 Serveur de scraping Google Maps démarré')
  console.log(`     http://localhost:${PORT}`)
  console.log('  Chrome : ' + CHROME_PATH)
  console.log('═══════════════════════════════════════════════════')
  console.log('  Routes :')
  console.log('    GET  /health — Ping')
  console.log('    POST /scrape — { keyword, city, maxResults }')
  console.log('───────────────────────────────────────────────────')
  console.log('  Ctrl+C pour arrêter')
  console.log('')
})
