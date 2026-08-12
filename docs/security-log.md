# Security-log v2

Kort logboek van de terugkerende security-audits op het v2-oppervlak
(landing /v2, app /v2/app, cliëntkaart /k, opname /o en de v2-API's in
`server.js`). Eén regel per run: datum, geauditeerd gebied, bevinding en
increment. Zo pakt elke volgende run een **ander** gebied.

Scope-regel: v1 (`/`, `/admin88`, dashboard) verandert nooit van gedrag of
uiterlijk; gedeelde servercode alleen aanraken bij een security-gat en dan
aantoonbaar zonder v1-gedragswijziging.

## Rouleerlijst
accountlaag · open endpoints & limieten · rate limiting /api/kaarten & /api/opname ·
injectie · path traversal · uploads · **security-headers/CSP** · deeplinks/gedeelde kaarten

## Logboek

### 2026-08-12 — CSP / security-headers
**Geauditeerd:** de HTTP-securityheaders van het hele v2-oppervlak
(/v2, /v2/app, /k, /o) plus een brede sanity over CSRF-dekking, cache-control
en path traversal.

**Bevindingen (grotendeels al dicht):**
- CSRF: elke publieke muterende endpoint (`/api/kaarten`, `/api/kaarten/verwijder`,
  `/api/kaart/meting`, `/api/kaart/gedaan`, `/api/praktijk/claim|login`,
  `/api/praktijken`, `/api/opname/upload`, `/api/assistent`, `/api/kaart/vraag`,
  `/api/stats/event`) draait `kruisSite` + een schrijf-/leeslimiet; admin-routes
  vereisen de admin-sleutel in een header (cross-site niet te zetten).
- Cache-control: JSON/HTML krijgen `no-store, max-age=0` (patiënt-/praktijkdata
  lekt niet naar caches); alleen beeld/font/video krijgen een publieke cache.
- Path traversal: `/v2/images/` weert `..`; de statische handler dwingt
  `filePath.startsWith(publicDir)` af.
- `/api/stats/event` whitelist `type` tot drie waarden — geen ongebreidelde groei.
- Headers: nosniff + referrer-policy globaal, HSTS, en per v2-pagina
  X-Frame-Options DENY, COOP, permissions-policy en een CSP.

**Gat + fix (hét increment):** de CSP van /v2/app, /k en /o stond op
`script-src 'self' 'unsafe-inline'`. `'unsafe-inline'` laat een eventueel
geïnjecteerd inline `<script>` of `on…`-handler alsnog draaien. De drie
v2-pagina's hebben elk precies één inline `<script>` zonder src, geen inline
event-handlers en geen `eval`/`new Function`; qr.js laadt same-origin.
Daardoor kon `'unsafe-inline'` weg: elke pagina krijgt nu een **per-antwoord
script-nonce** (`script-src 'self' 'nonce-…'`) die op de inline scripts wordt
gezet. Een geïnjecteerd script mist de nonce en draait niet — kleinere
XSS-straal op precies de pagina's met cliëntnamen en pijnscores. v1 raakt dit
niet: alleen de v2-routes zetten de CSP en de nonce; `/` serveert `index.html`
ongewijzigd zonder CSP.

**Regressietest:** `test-csp-nonce.mjs` (20 checks) — nonce aanwezig, géén
`unsafe-inline` in script-src, inline scripts dragen de nonce, `/qr.js` blijft
extern, nonce is per-antwoord uniek, en alle drie de pagina's booten zonder
CSP-overtreding.

**Volgende run — pak een ander gebied:** accountlaag (sessie-levensduur /
fixation / rotatie na claim) of uploads (content-type-sniffing op
`/api/opname/upload` en de beheer-videoupload).
