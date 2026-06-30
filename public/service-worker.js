// Self-destruct service worker: evicts any stale SW a browser registered from an
// older (PWA) build of this app, then reloads to pull fresh content. The current
// app registers NO service worker — this file exists only to un-stick old ones.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url));
    } catch (e) { /* best effort */ }
  })());
});
