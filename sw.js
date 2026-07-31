// Service Worker：离线缓存 APP shell，让「添加到主屏幕」后即使网络不佳也能打开
const CACHE = "fresh-workbench-v1";
const ASSETS = ["./", "index.html", "manifest.webmanifest", "icons/icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 只处理同源请求
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request)
        .then(function (resp) {
          const copy = resp.clone();
          caches.open(CACHE).then(function (c) {
            c.put(e.request, copy);
          });
          return resp;
        })
        .catch(function () {
          if (e.request.mode === "navigate") return caches.match("index.html");
        });
    })
  );
});
