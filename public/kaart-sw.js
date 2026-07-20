// Service worker voor de digitale kaart (/k): maakt de kaart offline bruikbaar en
// laat hem als app op het beginscherm werken. Werkt uitsluitend binnen /k/ zodat
// de rest van de site (waaronder v1) er nooit door wordt geraakt.
'use strict';
var CACHE = 'fysiplan-kaart-v1';

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
        caches.open(CACHE).then(function (c) { c.put(req, kopie); }).catch(function () {});
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
