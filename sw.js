/* Service Worker — Dieta Planner
   Strategia: l'HTML e i JSON vengono SEMPRE presi dalla rete.
   Solo se sei offline viene usata l'ultima copia salvata.
   Questo garantisce che l'app installata veda sempre l'ultima
   versione caricata su GitHub, senza dover reinstallare nulla. */

const CACHE_NAME = 'dieta-planner-v66';

/* All'attivazione: cancella le cache vecchie e prende il
   controllo di tutte le pagine aperte immediatamente. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomi) => {
      return Promise.all(
        nomi
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      );
    }).then(() => self.clients.claim())
  );
});

/* All'installazione: attiva subito, senza aspettare che
   l'utente chiuda e riapra l'app. */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

/* Ad ogni richiesta:
   - HTML (index.html, la pagina stessa): SEMPRE dalla rete.
     Solo se sei completamente offline, usa l'ultima copia.
   - JSON (ingredienti.json, ricette.json): SEMPRE dalla rete,
     con fallback alla cache se offline.
   - manifest.json e icone: cache-first (cambiano raramente).
   - Tutto il resto: network-first con fallback. */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  /* Richieste non-GET (es. POST): ignora, lascia gestire al browser */
  if (event.request.method !== 'GET') return;

  /* File HTML: network-first assoluto */
  if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((risposta) => {
          /* Salva una copia in cache per il fallback offline */
          const copia = risposta.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copia);
          });
          return risposta;
        })
        .catch(() => {
          /* Offline: usa l'ultima copia salvata */
          return caches.match(event.request).then((cached) => {
            return cached || new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }

  /* File JSON (ingredienti.json, ricette.json): network-first */
  if (url.pathname.endsWith('.json') && !url.pathname.includes('manifest')) {
    event.respondWith(
      fetch(event.request)
        .then((risposta) => {
          const copia = risposta.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copia);
          });
          return risposta;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || new Response('{}', {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  /* manifest.json: cache-first (cambia raramente) */
  if (url.pathname.includes('manifest')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request);
      })
    );
    return;
  }

  /* Tutto il resto (icone, ecc.): network-first con fallback */
  event.respondWith(
    fetch(event.request)
      .then((risposta) => {
        const copia = risposta.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copia);
        });
        return risposta;
      })
      .catch(() => caches.match(event.request))
  );
});
