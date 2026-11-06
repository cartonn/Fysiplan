# Security-backlog (V2)

Bijgehouden door de security-routine (elke 4 uur). Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
`docs/security-log.md` is het oude logboek (alleen lezen); de datums hieronder komen
daaruit tot en met 2026-11-06.

## Gebied → laatst geaudit

| Gebied | Laatst geaudit |
|---|---|
| (a) beheer-endpoints en de admin-sleutel | 2026-11-06 (deze backlog, PR "security: beheersleutel") |
| (b) accountlaag: sessies, inlogrem, claim, wachtwoord, herstelcode | 2026-11-03 |
| (c) proef-tokens en verlopen proeven | 2026-11-06 (PR #47, proefslot op account) |
| (d) gedeelde kaarten /k en /api/kaart*: id's, IDOR, limieten | 2026-10-27 |
| (e) uploads (video, logo, opname /o) | 2026-11-04 |
| (f) injectie en XSS (kaartvelden, sjablonen, eigen oefeningen, CSV, vertaling) | 2026-10-24 |
| (g) security-headers, CSP, cookies, CSRF | 2026-10-31 |
| (h) foutmeldingen die stacktraces of paden lekken | nooit apart |
| (i) denial of service: grote bodies, opslaggroei | 2026-10-25 |
| (j) npm audit | onbekend |

Volgende run: (h) foutmeldingen, daarna (j) npm audit en (f) injectie/XSS.

## Open

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
- **LAAG — POST-body boven de limiet krijgt een verbroken verbinding i.p.v. 413** (`req.destroy()` in
  de body-lezer). Netjes 413 sturen en dan sluiten.

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
