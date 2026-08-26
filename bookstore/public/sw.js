// Service Worker for offline POS support
// Caches product catalog and allows offline browsing
// Sales are queued and synced when connection is restored

const CACHE_NAME = "melio-pos-v1";
const PRODUCT_CACHE = "melio-products-v1";
const STATIC_CACHE = "melio-static-v1";

// Assets to pre-cache for offline use
const PRECACHE_URLS = [
  "/pos",
  "/login",
];

// Install: pre-cache critical assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== PRODUCT_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy: network-first for API, cache-first for static
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-HTTP
  if (request.method !== "GET" || !url.protocol.startsWith("http")) return;

  // API requests: network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    // Product API: cache for offline browsing
    if (url.pathname === "/api/products" || url.pathname.startsWith("/api/products?")) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const clone = response.clone();
            caches.open(PRODUCT_CACHE).then((cache) => cache.put(request, clone));
            return response;
          })
          .catch(() => caches.match(request))
      );
      return;
    }

    // Other API: network only (don't cache mutations)
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// Handle messages from main thread
self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_PRODUCTS") {
    // Pre-cache product list for offline
    fetch("/api/products?limit=500")
      .then((r) => r.json())
      .then((data) => {
        const response = new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
        caches.open(PRODUCT_CACHE).then((cache) => {
          cache.put("/api/products?limit=500", response);
        });
      })
      .catch(() => {});
  }

  if (event.data?.type === "GET_OFFLINE_SALES") {
    // Return queued offline sales
    const dbRequest = indexedDB.open("melio-offline-sales", 1);
    dbRequest.onsuccess = () => {
      const db = dbRequest.result;
      const tx = db.transaction("sales", "readonly");
      const store = tx.objectStore("sales");
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        event.source.postMessage({
          type: "OFFLINE_SALES",
          sales: getAll.result,
        });
      };
    };
  }

  if (event.data?.type === "QUEUE_SALE") {
    // Queue a sale for later sync
    const dbRequest = indexedDB.open("melio-offline-sales", 1);
    dbRequest.onupgradeneeded = () => {
      const db = dbRequest.result;
      if (!db.objectStoreNames.contains("sales")) {
        db.createObjectStore("sales", { keyPath: "id" });
      }
    };
    dbRequest.onsuccess = () => {
      const db = dbRequest.result;
      const tx = db.transaction("sales", "readwrite");
      const store = tx.objectStore("sales");
      store.put(event.data.sale);
    };
  }

  if (event.data?.type === "SYNC_COMPLETE") {
    // Remove synced sales from IndexedDB
    const dbRequest = indexedDB.open("melio-offline-sales", 1);
    dbRequest.onsuccess = () => {
      const db = dbRequest.result;
      const tx = db.transaction("sales", "readwrite");
      const store = tx.objectStore("sales");
      store.clear();
    };
  }
});
