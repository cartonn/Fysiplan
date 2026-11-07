# Security-backlog (V2)

Bijgehouden door de security-routine (elke 4 uur). Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
`docs/security-log.md` is het oude logboek (alleen lezen); de datums hieronder komen
daaruit tot en met 2026-11-06.

## Gebied → laatst geaudit

| Gebied | Laatst geaudit |
|---|---|
| (a) beheer-endpoints en de admin-sleutel | 2026-11-06 (deze backlog, PR "security: beheersleutel") |
| (b) accountlaag: sessies, inlogrem, claim, wachtwoord, herstelcode | 2026-11-03 |
| (c) proef-tokens en verlopen proeven | 2026-11-06 (PR #47 proefslot; daarna opnieuw aanmelden) |
| (d) gedeelde kaarten /k en /api/kaart*: id's, IDOR, limieten | 2026-11-07 (vids-eigendom op POST /api/kaarten) |
| (e) uploads (video, logo, opname /o) | 2026-11-04 |
| (f) injectie en XSS (kaartvelden, sjablonen, eigen oefeningen, CSV, vertaling) | 2026-11-07 (runtime: payloads in alle kaartvelden, /k in nl/en/ar met vertaling, overzicht, sjablonen, eigen oefeningen, serverpagina's; geen gat) |
| (g) security-headers, CSP, cookies, CSRF | 2026-10-31 |
| (h) foutmeldingen die stacktraces of paden lekken | 2026-11-06 (runtime-fuzz 60 schrijfroutes, geen lek) |
| (i) denial of service: grote bodies, opslaggroei | 2026-11-07 (te grote body: nu 413, weglezen begrensd op 10 s en 80 MB) |
| (j) npm audit | 2026-11-07 (sharp 0.35.3 → 0.35.5, daarna 0 meldingen) |

Volgende run: (g) headers/CSP/cookies, daarna (e) uploads en (b) accountlaag.

## Open

- **HOOG — praktijknaam is een wereldwijde sleutel** (sweep 2026-11-06, Sanne). Wie een naam als eerste
  beveiligt, sluit elke andere praktijk met die naam buiten ("Deze praktijk is beveiligd. Log in…");
  een naam kan zo vooraf worden gekaapt. Ook wisselt de praktijk stil als de therapeut de naam op de
  kaart wijzigt. server.js `pk = cleanName(b.praktijk).toLowerCase()` en de 409 bij claimen. Grote
  ontwerpkeuze (account-id los van de weergavenaam); eerst met Ahmed afstemmen.
- **LAAG — opnieuw aanmelden verraadt of een e-mailadres al een proef heeft** (2026-11-06). Sinds de
  fix hieronder krijgt een bekend adres "Met dit e-mailadres loopt al een proef" en een nieuw adres
  direct de app. Onvermijdelijk zolang aanmelden zonder mailbevestiging direct toegang geeft; de
  pagina noemt geen naam of praktijk. Fix (eventueel): ook nieuwe aanmeldingen pas na een maillink.
- **LAAG — wissen via /v2/gegevens haalt ook `acc.proef` weg** (sanity PR #48, 2026-11-06). Na
  "alles wissen" is de praktijknaam vrij en draagt een nieuw account met die naam geen proefslot meer.
  Zelfde soort als "proef wissen en opnieuw aanmelden" hieronder; alleen relevant zonder betaalpoort.
  Fix: bij wissen een sha256 van de praktijknaam + proefeinde bewaren tot de bewaartermijn om is.
- **LAAG — proef wissen en opnieuw aanmelden geeft een nieuwe proef van 14 dagen** (2026-11-06).
  `/v2/proef/wissen` haalt de aanmelding weg; daarna levert hetzelfde e-mailadres een verse proef op.
  Het praktijkaccount blijft sinds PR #47 wel dicht (einddatum staat op het account), dus dit helpt
  alleen met een nieuwe praktijknaam. Fix (eventueel): bij wissen alleen de sha256 van het e-mailadres
  en de einddatum bewaren tot de bewaartermijn om is (afstemmen met legal: dataminimalisatie).
- **LAAG — accounts die vóór PR #47 tijdens een proef zijn beveiligd, raken pas gekoppeld bij de
  volgende login vanaf het proefapparaat.** Een sessie op een ander apparaat die nooit opnieuw vanaf
  het proefapparaat inlogt, blijft tot de sessie (30 dagen) verloopt open. Koppelen op praktijknaam
  (`p.praktijk`) is bewust niet gedaan: die naam is vrije invoer en zou andermans account kunnen sluiten.
- **MIDDEL — per-IP-remmen te krap voor een praktijk achter één NAT** (sweep 2026-11-06). Lezen 120
  en schrijven 40 per 5 min per IP (server.js `leesLimiet`, schrijfrem) gelden voor de hele praktijk
  incl. auto-delen, en voor patiënten achter CGNAT/sportschool-wifi. De sweep liep er met 4 gebruikers
  binnen minuten tegenaan. Overweeg rem per praktijksessie/kaart-id naast per IP.
- **LAAG — remteller op de beheersleutel weigert, maar houdt raden niet tegen.**
  `denied()` geeft na 20 fouten per 5 minuten een 429, maar `isAdmin()` wordt vóór
  `denied()` gecontroleerd: wie tijdens de 429-periode de juiste sleutel stuurt,
  komt er gewoon in. Met een lange willekeurige `ADMIN_KEY` praktisch onschadelijk.
  Repro: 25× fout via `x-admin-sleutel`, dan de juiste sleutel → 200.
  Fix: in de beheerroutes eerst de IP-rem controleren, dan pas de sleutel.
- **LAAG — beheer is één gedeelde sleutel, geen account.** Geen audit wie wat
  wijzigde, geen intrekken per persoon. Toegangsbeheer (`ACCOUNT_BEHEER_EMAILS`)
  laat zien hoe het wel kan; overstappen kan later per beheerroute.

## Opgelost

- OPGELOST 2026-11-07 PR #58 — te grote request-body krijgt nu een 413 met melding in plaats van een
  verbroken verbinding (ook chunked); dubbel backlogitem samengevoegd.
- OPGELOST 2026-11-07 PR #58 — `/api/opname/upload` weigert na het verlopen van de proef (token onthoudt
  proef en praktijk).

- **MIDDEL — vreemde opname-video in eigen kaart zetten en daarmee laten wissen** (sweep 2026-11-06,
  Mark). OPGELOST 2026-11-07 PR #54. POST /api/kaarten neemt een opnamepad in `vids` alleen nog over als het
  al op een kaart van dezelfde praktijk staat, een bibliotheekvideo is, of uit een opname komt die
  deze praktijk zelf startte (`opnames` onthoudt nu de praktijk). Een vreemd pad wordt stil
  weggelaten. Test: `npm run test:opname-eigen`.
- **HOOG (alleen ontwikkel-/beeldscripts) — npm audit: sharp ≤0.35.5-rc.1 (libheif, librsvg).**
  OPGELOST 2026-11-07 PR #54: lockfile naar sharp 0.35.5. De server laadt sharp niet; alleen
  scripts voor beeldbewerking gebruiken het.

- **HOOG — proef overnemen met alleen het e-mailadres** (gebruikers-sweep 2026-11-06, Sanne). Opnieuw
  aanmelden met een bestaand adres gaf direct een proefcookie, liet naam/telefoon overschrijven en
  gaf via /v2/proef?mijn=1 toegang tot wissen. Fix: zonder geldige proefcookie van díe proef geen
  cookie en geen wijziging, maar een eenmalige link (24 uur, mailrem 3/uur) naar het echte adres.
  OPGELOST 2026-11-06 PR "security: proef niet over te nemen met alleen het e-mailadres". Test: `npm run test:proef`.
- **MIDDEL — `/api/kaart/afspraak` met een verkeerd type wiste de afspraak** (sweep, Jayden). Alleen
  0/null/leeg haalt weg; tekst, object of lijst geeft 400. OPGELOST 2026-11-06, zelfde PR. Test: `npm run test:proef`.

- **KRITIEK — prototype pollution via `/api/kaart/vertaal?taal=__proto__`** (gebruikers-sweep
  2026-11-06, Jayden). `TALEN["__proto__"]` is truthy, dus de taalcheck liet het door; met een AI-sleutel
  werd `vertalingen["__proto__"]` het `Object.prototype` van het hele serverproces en schreef de cache
  daar sleutels op (plus een betaalde AI-aanroep). Hetzelfde patroon zat in de vraaghulp (`VTALEN`).
  Fix: `Object.hasOwn`. OPGELOST 2026-11-06 PR #49. Test: `npm run test:sweep`.

- **HOOG — verlopen proef blokkeert alleen nieuwe kaarten** (gebruikers-sweep 2026-11-06, persona Mark).
  Met de verlopen proefcookie geven `/api/praktijk/sjablonen`, `/api/praktijk/oefeningen` (upload),
  `/api/opname/start` (60 MB-uploadtoken), `/api/kaart/afspraak` en `/api/kaart/naam` gewoon 200.
  Zonder proefcookie (ander apparaat, cookies gewist) maakt dezelfde praktijksessie weer nieuwe kaarten:
  de proef hangt aan het apparaat (`proefVan`), niet aan de praktijk. Controle staat alleen bij
  `POST /api/kaarten` en `/v2/app`. Fix: proefstatus aan het praktijkaccount koppelen en in één
  poort voor alle schrijfroutes van de therapeut toetsen (patiëntroutes /k blijven open).
  OPGELOST 2026-11-06 PR #47: één poort (`proefSlotVoor` in server.js) voor alle schrijfroutes van de
  therapeut, op proefcookie én op het praktijkaccount (`acc.proef = {id, verloopt}`, gezet bij claimen
  en bij inloggen vanaf het proefapparaat). Lezen, verwijderen, archiveren en patiëntroutes blijven open;
  wissen van de proef heft het slot niet op; beheer op "klant" zetten wel. Test: `npm run test:proefpoort` (ook in CI).

- **HOOG — publieke beheersleutel `admin88`.** `public/index.html`,
  `public/dashboard.html` en `public/content1000.html` zetten
  `'x-admin-sleutel':'admin88'` hard in de pagina, en de server viel zonder
  `ADMIN_KEY` terug op `admin88`. Iedereen kon dan oefeningen hernoemen en
  verwijderen, video's en categorieën wijzigen, het eigenaarsdashboard lezen en de
  volledige praktijkenlijst met contactgegevens ophalen. Fix: geen sleutel meer in
  publieke bestanden (de beheerder voert hem zelf in, alleen in sessionStorage);
  live zonder eigen `ADMIN_KEY` (of met `admin88`) blijft beheer dicht; lokaal blijft
  `admin88` de standaard. Test: `npm run test:beheer` (ook in CI).
  OPGELOST 2026-11-06, PR "security: beheersleutel".

## Sanity 2026-11-07 (04u UTC) op #55, #56, #57

- #57 Mollie: webhook haalt de betaling zelf op, alleen eigen `tr_`-id's, bedrag en proef-id gecontroleerd,
  idempotent; betaalroute achter `kruisSite` en `proefLimiet`. Geen gat. Let op bij live: `eigenHost` bepaalt
  redirect- en webhook-URL; alleen de eigen betaling is te beïnvloeden.
- #55, #56: geen nieuwe endpoints zonder auth; `basisTs`-check alleen voor de eigen praktijk.

