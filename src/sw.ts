/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()

// Pré-cache do app shell (gerado no build)
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA: navegações caem no index.html
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Fotos do Supabase Storage: cache-first para economizar egress (5 GB/mês)
registerRoute(
  ({ url }) => url.pathname.includes('/storage/v1/object/public/'),
  new CacheFirst({
    cacheName: 'fotos-forro',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

// ---- Web Push (Fase 4) ----

interface PushPayload {
  title?: string
  body?: string
  url?: string
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Forró de Segunda', {
      body: payload.body ?? 'Hoje tem forró! 🎶 Não esquece o check-in.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data?.url as string) ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(
      (clientes) => {
        for (const c of clientes) {
          if ('focus' in c) {
            void c.navigate(url)
            return c.focus()
          }
        }
        return self.clients.openWindow(url)
      },
    ),
  )
})
