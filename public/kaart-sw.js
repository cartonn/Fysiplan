// Service worker voor de digitale kaart (/k): maakt de kaart offline bruikbaar en
// laat hem als app op het beginscherm werken. Werkt uitsluitend binnen /k/ zodat
// de rest van de site (waaronder v1) er nooit door wordt geraakt.
'use strict';
// Versienummer van de offline-cache. Bij een nieuwe versie gooit activate() alles van
// de vorige weg. Dat is bewust: de kaart leest drie bestanden die bij elkaar horen
// (mobile-media-review.json, mobile-narration-review.json en het stemmanifest). Zonder
// zo'n gezamenlijke versiesprong kan een telefoon offline een oude houdlijst met nieuwe
// opnames combineren. De kaart controleert dat ook zelf nog op reviewDate.
var CACHE = 'fysiplan-kaart-v2';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (namen) {
    return Promise.all(namen.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

// netwerk eerst (de kaart moet altijd de laatste versie tonen), cache als vangnet
// wanneer de telefoon offline is; grote videobestanden slaan we bewust niet op
// plafond op de cache: ruim genoeg voor meerdere kaarten met beelden, maar de
// telefoon van de patiënt loopt nooit vol; het overschot wordt weggesnoeid
var TELLER = 0;
function snoei(c) {
  c.keys().then(function (ks) {
    for (var i = 0; i < ks.length - 180; i++) c.delete(ks[i]);
  }).catch(function () {});
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/uploads/videos/') === 0) return;
  e.respondWith(
    fetch(req).then(function (antwoord) {
      if (antwoord && antwoord.status === 200) {
        var kopie = antwoord.clone();
        caches.open(CACHE).then(function (c) {
          c.put(req, kopie);
          if (++TELLER % 25 === 0) snoei(c);
        }).catch(function () {});
      }
      // druk (429) of een serverfout: liever de laatst geladen kaart dan een foutscherm
      if (antwoord && (antwoord.status === 429 || antwoord.status >= 500)) {
        return caches.match(req).then(function (uitCache) { return uitCache || antwoord; });
      }
      return antwoord;
    }).catch(function () {
      return caches.match(req).then(function (uitCache) {
        if (uitCache) return uitCache;
        if (req.mode === 'navigate') return caches.match(url.pathname);
        return Response.error();
      });
    })
  );
});
