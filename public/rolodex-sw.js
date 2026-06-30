// Minimal service worker for the Call Time PWA (scope: /rolodex).
// Its only job is to make the page installable as a standalone app — it does NOT
// cache responses (the call list is live, personal data; stale caching would be
// wrong). The empty fetch handler satisfies the installability heuristic while
// leaving every request to go to the network exactly as normal.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network passthrough — no offline cache */ });
