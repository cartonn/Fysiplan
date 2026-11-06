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

// Eerste bezoek: de kaart en zijn gegevens zijn al geladen voordat deze werker de
// pagina beheert, dus gingen ze nooit door de fetch-handler hierboven en stond er
// niets in de cache. Offline herladen gaf dan een wit scherm. De kaart stuurt daarom,
// zodra de werker actief is, de adressen die hij al geladen heeft; die halen we hier
// één keer op en bewaren we. Alleen GET binnen de eigen site, nooit video's of
// schrijfroutes, en alleen een geslaagd antwoord (200).
function magBewaren(pad) {
  if (typeof pad !== 'string' || pad.charAt(0) !== '/' || pad.charAt(1) === '/') return false;
  if (pad.indexOf('/uploads/videos/') === 0) return false;
  if (pad.indexOf('/api/') === 0) return /^\/api\/kaart(\/vertaal|\/manifest)?\?id=[a-f0-9]{8,16}(&taal=[a-z]{2})?$/.test(pad);
  return true;
}
self.addEventListener('message', function (e) {
  var d = e.data;
  if (!d || d.type !== 'bewaar' || !Array.isArray(d.urls)) return;
  var paden = d.urls.filter(magBewaren).slice(0, 120);
  var klaar = caches.open(CACHE).then(function (c) {
    return Promise.all(paden.map(function (pad) {
      return c.match(pad).then(function (al) {
        if (al) return;
        return fetch(pad, { credentials: 'same-origin' }).then(function (r) {
          if (r && r.status === 200) return c.put(pad, r);
        }).catch(function () {});
      });
    }));
  }).then(function () {
    if (e.source && e.source.postMessage) e.source.postMessage({ type: 'bewaard', aantal: paden.length });
  }).catch(function () {});
  if (e.waitUntil) e.waitUntil(klaar);
});

// Bewaartermijn ook op de telefoon: meldt de server dat een kaart weg is, dan halen we
// alles van die kaart uit de offline-cache (de pagina /k/<id> en de kaartgegevens,
// vertaling en manifest). Andere kaarten en gedeelde bestanden blijven staan.
function kaartIdVan(url) {
  if (!/^\/api\/kaart(\/vertaal|\/manifest)?$/.test(url.pathname)) return '';
  var id = url.searchParams.get('id') || '';
  return /^[a-f0-9]{8,16}$/.test(id) ? id : '';
}
function hoortBijKaart(u, id) {
  if (u.pathname === '/k/' + id) return true;
  return /^\/api\/kaart(\/vertaal|\/manifest)?$/.test(u.pathname) && u.searchParams.get('id') === id;
}
function vergeetKaart(id) {
  return caches.keys().then(function (namen) {
    return Promise.all(namen.map(function (n) {
      return caches.open(n).then(function (c) {
        return c.keys().then(function (ks) {
          return Promise.all(ks.filter(function (r) { return hoortBijKaart(new URL(r.url), id); })
            .map(function (r) { return c.delete(r); }));
        });
      });
    }));
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
      // de kaart bestaat niet meer (gewist, verlopen of nieuwe link): ook de offline
      // kopie op de telefoon weg, anders blijven roepnaam en scores offline zichtbaar
      var weg = antwoord && (antwoord.status === 404 || antwoord.status === 410) ? kaartIdVan(url) : '';
      if (weg) {
        var opgeruimd = vergeetKaart(weg);
        if (e.waitUntil) e.waitUntil(opgeruimd);
        return opgeruimd.then(function () { return antwoord; }, function () { return antwoord; });
      }
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
