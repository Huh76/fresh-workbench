// Service Worker：离线缓存 APP shell，让「添加到主屏幕」后即使网络不佳也能打开
const CACHE = "fresh-workbench-v3";
// v3（2026-08-04）：缓存键升级，强制失效旧版（含潘通色卡的旧壳）缓存，确保手机一开即最新
const ASSETS = ["./", "index.html", "manifest.json", "icons/icon-512.png"];

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
  // network-first：在线优先取网络最新版，离线才回退缓存（保证安装后打开即最新）
  e.respondWith(
    fetch(e.request)
      .then(function (resp) {
        const copy = resp.clone();
        caches.open(CACHE).then(function (c) {
          c.put(e.request, copy);
        });
        return resp;
      })
      .catch(function () {
        return caches.match(e.request).then(function (cached) {
          return cached || caches.match("index.html");
        });
      })
  );
});
