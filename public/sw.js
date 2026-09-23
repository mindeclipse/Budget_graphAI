// Service Worker for BudgetGraph PWA
const CACHE_VERSION = "v6";
const STATIC_CACHE = `budget-static-${CACHE_VERSION}`;
const DATA_CACHE = `budget-data-${CACHE_VERSION}`;

// Базові ресурси App Shell для попереднього кешування
const APP_SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-192.svg",
  "/icons/icon-512.png",
  "/icons/icon-512.svg",
];

// Встановлення Service Worker: кешуємо App Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS).catch((err) => {
        console.warn("[SW] Попереднє кешування деяких ресурсів пропущено:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Активація Service Worker: очищення застарілих кешів
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith("budget-") && name !== STATIC_CACHE && name !== DATA_CACHE)
          .map((name) => {
            console.log("[SW] Видалення старого кешу:", name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Обробка мережевих запитів (Fetch)
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ігноруємо протоколи, що не є HTTP/HTTPS (наприклад chrome-extension:)
  if (!url.protocol.startsWith("http")) {
    return;
  }

  // Ігноруємо Next.js Dev HMR (Hot Module Replacement)
  if (url.pathname.includes("/_next/webpack-hmr")) {
    return;
  }

  // Перехоплення Web Share Target API (Імпорт квитанцій та чеків в 1 клік)
  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(
      (async () => {
        try {
          const formData = await request.formData();
          const file = formData.get("file");
          const title = formData.get("title");
          const text = formData.get("text");
          const sharedUrl = formData.get("url");

          if (file || text) {
            await new Promise((resolve, reject) => {
              const openReq = indexedDB.open("budget_share_target_db", 1);
              openReq.onupgradeneeded = () => {
                const db = openReq.result;
                if (!db.objectStoreNames.contains("shared_items")) {
                  db.createObjectStore("shared_items", { keyPath: "id", autoIncrement: true });
                }
              };
              openReq.onsuccess = () => {
                const db = openReq.result;
                const tx = db.transaction(["shared_items"], "readwrite");
                const store = tx.objectStore("shared_items");
                store.add({
                  blob: file || null,
                  fileName: file ? file.name : "shared-receipt.pdf",
                  fileType: file ? file.type : "application/pdf",
                  title: typeof title === "string" ? title : "",
                  text: typeof text === "string" ? text : "",
                  url: typeof sharedUrl === "string" ? sharedUrl : "",
                  timestamp: Date.now(),
                });
                tx.oncomplete = () => {
                  db.close();
                  resolve();
                };
                tx.onerror = () => {
                  db.close();
                  reject(tx.error);
                };
              };
              openReq.onerror = () => reject(openReq.error);
            });
          }

          return Response.redirect("/?action=shared_receipt", 303);
        } catch (err) {
          console.warn("[SW] Помилка обробки share-target:", err);
          return Response.redirect("/?action=shared_receipt", 303);
        }
      })()
    );
    return;
  }

  // Тільки GET запити підлягають кешуванню. POST/PATCH/DELETE/PUT обробляються безпосередньо (офлайн-чергою)
  if (request.method !== "GET") {
    return;
  }

  // 0. Заборона кешування чутливих ендпоінтів автентифікації, біометрії та бекапів (Network Only з graceful offline fallback)
  if (
    url.pathname.startsWith("/api/auth") ||
    url.pathname.startsWith("/api/backup")
  ) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: "offline", message: "Network unavailable" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // 1. Навігаційні запити (HTML сторінки): Network-First з fallback на кешований App Shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;

          const rootCache = await caches.match("/");
          if (rootCache) return rootCache;

          return new Response(
            `<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"/><title>Офлайн | BudgetGraph</title><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body style="background:#09090b;color:#f4f4f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:1rem;"><div><h1 style="font-size:1.5rem;margin-bottom:0.5rem;">Офлайн режим</h1><p style="color:#a1a1aa;font-size:0.875rem;">Немає підключення до мережі. Перевірте зв'язок та оновіть сторінку.</p></div></body></html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
    );
    return;
  }

  // 2. Статичні ресурси Next.js (_next/static, fonts, svg, favicon): Cache-First з оновленням
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Запускаємо фонове оновлення (Stale-While-Revalidate)
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                caches.open(STATIC_CACHE).then((cache) => cache.put(request, networkResponse));
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. GET API запити даних: Network-First з кеш fallback у DATA_CACHE
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cachedData = await caches.match(request);
          if (cachedData) {
            return cachedData;
          }
          return new Response(
            JSON.stringify({ error: "Offline: Network unavailable and no cached data found" }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        })
    );
    return;
  }

  // 4. Решта GET запитів: спроба мережі з fallback на кеш
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
