export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

export function scheduleNotification(titre: string, body: string, dateHeure: Date) {
  const delay = dateHeure.getTime() - Date.now()
  if (delay <= 0) {
    if (Notification.permission === 'granted') {
      new Notification(titre, { body, icon: '/icon-192.png' })
    }
    return
  }
  setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification(titre, { body, icon: '/icon-192.png' })
    }
  }, delay)
}
