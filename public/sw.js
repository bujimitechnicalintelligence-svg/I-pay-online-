// I-pay-online Service Worker for Native Push Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push event listener
self.addEventListener('push', (event) => {
  let data = { title: 'I-pay-online', body: 'New notification', icon: '/app-icon.png' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'I-pay-online', body: event.data.text(), icon: '/app-icon.png' };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'I-pay-online', {
      body: data.body || '',
      icon: data.icon || '/app-icon.png',
      badge: '/app-icon.png',
      vibrate: [100, 50, 100],
      data: data
    })
  );
});

// Notification click listener
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
