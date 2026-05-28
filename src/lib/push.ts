import { prisma } from './prisma'

// web-push is a CJS-only package — bypass TypeScript module resolution
// The package is installed at runtime via node_modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let webpush: any
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  webpush = require('web-push')
} catch {
  webpush = null
}

/**
 * Envoie une notification push "prochain appel" sur le téléphone enregistré.
 * Ne fait rien si aucune subscription n'est enregistrée ou si les vars VAPID manquent.
 */
export async function sendNextCallPush(nom: string, telephone: string) {
  if (!webpush) return
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return

  try {
    webpush.setVapidDetails(
      'mailto:hugo@contact.agentry.fr',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )

    const param = await prisma.parametre.findUnique({ where: { cle: 'push_subscription' } })
    if (!param) return

    const subscription = JSON.parse(param.valeur)
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ nom, telephone }),
      { TTL: 60 } // expire après 60s si le téléphone est hors ligne
    )
  } catch (err: unknown) {
    // Si la subscription est expirée/invalide → la supprimer
    if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
      await prisma.parametre.deleteMany({ where: { cle: 'push_subscription' } }).catch(() => {})
    }
    console.error('[PUSH] sendNextCallPush error:', err)
  }
}
