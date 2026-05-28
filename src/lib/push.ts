import webpush from 'web-push'
import { prisma } from './prisma'

// VAPID config — clés générées une seule fois, stockées dans les env vars
webpush.setVapidDetails(
  'mailto:hugo@contact.agentry.fr',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

/**
 * Envoie une notification push "prochain appel" sur le téléphone enregistré.
 * Ne fait rien si aucune subscription n'est enregistrée ou si les vars VAPID manquent.
 */
export async function sendNextCallPush(nom: string, telephone: string) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return

  try {
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
