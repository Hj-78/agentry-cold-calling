// Service Worker — Agentry Push Notifications

self.addEventListener('push', event => {
  if (!event.data) return
  let data
  try { data = event.data.json() } catch { return }

  const nom = data.nom || 'Prochain appel'
  const tel = data.telephone || ''

  event.waitUntil(
    self.registration.showNotification(`📞 ${nom}`, {
      body: tel,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'agentry-next-call',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      actions: [
        { action: 'call', title: '📞 Appeler' },
        { action: 'dismiss', title: 'Ignorer' },
      ],
      data: { tel, nom },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const tel = event.notification.data?.tel
  if (!tel) return

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Ouvrir le dialer directement
      return clients.openWindow(`tel:${tel.replace(/\s/g, '')}`)
    })
  )
})
