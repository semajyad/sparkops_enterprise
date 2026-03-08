const CACHE_NAME = "sparkops-shell-v2";
const APP_SHELL = ["/", "/dashboard", "/capture", "/tracking", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) {
            return cached;
          }
          const url = new URL(request.url);
          if (url.pathname.startsWith("/tracking")) {
            return caches.match("/tracking");
          }
          return caches.match("/capture");
        })
      )
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "sparkops-sync") {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "TRIGGER_SYNC" }));
    })
  );
});
