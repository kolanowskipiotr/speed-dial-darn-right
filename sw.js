// ─── Speed Dial Darn Right — Service Worker ───────────────────────
// Minimal SW whose only job is to deliver OS-level notifications via
// ServiceWorkerRegistration.showNotification() — far more reliable on
// Chrome / macOS than the legacy new Notification() constructor.

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

// When the user clicks a notification, focus the existing tab (or open one).
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
            const open = wins.find(w => new URL(w.url).origin === self.location.origin);
            return open ? open.focus() : self.clients.openWindow('/');
        })
    );
});

