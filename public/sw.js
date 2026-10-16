/* ANOR service worker: offline catalog cache, push notifications, offline fallback page.
 * Plain JS (no build step). Bump VERSION to drop old caches after a deploy. */
const VERSION = "anor-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const API = `${VERSION}-api`;
const IMAGES = `${VERSION}-images`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/brand/anor-logo.svg"];
const LIMITS = { [PAGES]: 60, [API]: 120, [IMAGES]: 300 };

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName) {
  const max = LIMITS[cacheName];
  if (!max) return;
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/** Network first, cached copy when offline (pages the visitor already opened). */
async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") {
      const cache = await caches.open(cacheName);
      await cache.put(request, res.clone());
      trim(cacheName);
    }
    return res;
  } catch {
    const hit = await caches.match(request);
    if (hit) return hit;
    if (request.mode === "navigate") return caches.match(OFFLINE);
    throw new Error("offline");
  }
}

/** Cached copy at once, refreshed in the background (catalog API). */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone()).then(() => trim(cacheName));
      return res;
    })
    .catch(() => hit);
  return hit || refresh;
}

async function cacheFirst(request, cacheName) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, res.clone());
    trim(cacheName);
  }
  return res;
}

// Catalog pages worth keeping for offline browsing. Private pages (account, cart, checkout,
// seller, admin) are never cached: they hold personal data.
const CATALOG_PAGE = /^\/(?:(?:oz|ru)\/?)?(?:$|c\/|p\/|catalog|deals|made-in-uzbekistan|shop\/|brand\/|help)/;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }
  if (url.pathname.startsWith("/media/") || url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/uploads/products/")) {
    event.respondWith(cacheFirst(req, IMAGES));
    return;
  }
  if (url.pathname.startsWith("/api/v1/products") || url.pathname.startsWith("/api/v1/search/suggest")) {
    event.respondWith(staleWhileRevalidate(req, API));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(CATALOG_PAGE.test(url.pathname) ? networkFirst(req, PAGES) : fetch(req).catch(() => caches.match(OFFLINE)));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ANOR", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "ANOR";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/shortcut-96.png",
      data: { href: typeof data.href === "string" && data.href.startsWith("/") ? data.href : "/" },
      tag: data.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          w.focus();
          return w.navigate(href);
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});

// Sign-out (and account switch) wipes cached pages: they may carry the previous user's header.
self.addEventListener("message", (event) => {
  if (event.data === "anor:clear-private") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(API)]));
});
