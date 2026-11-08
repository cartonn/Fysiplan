# Security-backlog (V2)

Bijgehouden door de security-routine (elke 4 uur). Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
`docs/security-log.md` is het oude logboek (alleen lezen); de datums hieronder komen
daaruit tot en met 2026-11-06.

## Gebied → laatst geaudit

| Gebied | Laatst geaudit |
|---|---|
| (a) beheer-endpoints en de admin-sleutel | 2026-11-08 (runtime: rem op foute sleutels hield raden niet tegen, opgelost; alle beheerroutes eisen `isAdmin`) |
| (b) accountlaag: sessies, inlogrem, claim, wachtwoord, herstelcode | 2026-11-08 04u (claim, inloggen op naam en e-mail, rem per naam/e-mail/praktijk, wachtwoord wijzigen, herstel, uitnodiging, overzicht en /v2/gegevens met e-mail; gedeeld wachtwoord weer aan: opgelost) |
| (c) proef-tokens en verlopen proeven | 2026-11-07 (statisch: cookie/maillink-tokens alleen als sha256, max 5 per proef, eenmalige maillink 24 u, gewiste proef laat geen tokens achter; team-uitnodigen na verlopen proef: dicht) |
| (d) gedeelde kaarten /k en /api/kaart*: id's, IDOR, limieten | 2026-11-07 (vids-eigendom op POST /api/kaarten) |
| (e) uploads (video, logo, opname /o) | 2026-11-07 (logo-veeg wiste logo's van andere praktijken: opgelost; opname-upload, eigen oefening, /uploads-pad: geen gat) |
| (f) injectie en XSS (kaartvelden, sjablonen, eigen oefeningen, CSV, vertaling) | 2026-11-07 (runtime: payloads in alle kaartvelden, /k in nl/en/ar met vertaling, overzicht, sjablonen, eigen oefeningen, serverpagina's; geen gat) |
| (g) security-headers, CSP, cookies, CSRF | 2026-11-07 (runtime: koppen op 11 V2-pagina's en API, cookies HttpOnly+Lax+Secure, praktijksessie via eigen kop; kruisSite kijkt nu ook naar Origin) |
| (h) foutmeldingen die stacktraces of paden lekken | 2026-11-08 (runtime-fuzz 103 routes × GET/POST/PUT/DELETE × 7 kapotte bodies × 3 content-types = 6592 verzoeken, plus pad-traversal en kapotte %-codering: geen stacktrace, geen intern pad, geen fout in het serverlog) |
| (i) denial of service: grote bodies, opslaggroei | 2026-11-07 (te grote body: nu 413, weglezen begrensd op 10 s en 80 MB) |
| (j) npm audit | 2026-11-07 (sharp 0.35.3 → 0.35.5, daarna 0 meldingen) |

Volgende run: (c) proef-tokens runtime, daarna (d) gedeelde kaarten.

Sanity 2026-11-08 04u op #91–#93 (Mijn gegevens-download, offline vinkje per oefening, factuur): `/v2/proef/factuur`
alleen met de eigen proefcookie, 404 zonder betaling, alle velden via `esc()`, CSP `default-src 'none'`; de
patiëntroute geeft van het contactlogboek alleen soort en moment van eigen seintjes; het vinkje gebruikt
`tikMoment` (hooguit 14 dagen terug) en het plafond van 60 oefeningen. Geen gat.

Audit (b) 2026-11-08 04u: claim (rem nieuwe praktijk, 409 op bezette naam, akkoord verplicht), inloggen op naam
(rem per naam, gedeeld-uit telt niet mee), op e-mail (rem per adres, alleen actieve leden), wachtwoord wijzigen en
nieuwe herstelcode (sessie + huidig wachtwoord, rem per praktijk), herstel (gedeeld-uit doet niet mee), uitnodiging
(token sha256, 7 dagen, eenmalig), overzicht na proef en /v2/gegevens met e-mail (rem per naam, wissen alleen
beheerder). Eén gat, hieronder opgelost; de overige open punten van (b) staan al in Open.

Sanity 2026-11-08 00u op #87–#89 (wissen van de telefoon, offline-wachtrij met `wanneer`, naam wijzigen): `wanneer`
komt van de patiënt maar wordt begrensd op hooguit 14 dagen terug en nooit in de toekomst (`tikMoment`), per dag
één waarde, lijsten blijven op 366/120/50 afgekapt; een ouder seintje verdringt geen nieuwer. Geen gat.

Audit (h) en (a) 2026-11-08 00u:
- **OPGELOST 2026-11-08 (deze PR) — LAAG: rem op de beheersleutel hield raden niet tegen.** Zie onder Open.
- **OPGELOST 2026-11-08 (deze PR) — LAAG — `/api/kaart/vraag` geeft 502 "even niet bereikbaar" op een kapotte body** (`{`, `null`, geen JSON). De
  algemene `catch` vangt de parse-fout. Geen lek (vaste tekst), wel een misleidende status. Fix: parse-fout → 400.
  Nu: geen JSON of geen object → 400 vóór de kaart wordt gezocht. Test: `npm run test:teamherstel`.

Sanity 2026-11-07 20u op #81–#85 (logo-veeg, printknop, overzicht na proef met eigen login, proefcookie wissen,
proefaanmelding in download/wissen): overzicht-login met e-mail valt onder dezelfde rem per praktijknaam en eist een
actief lid; `?apparaat=1` bij uitloggen zit achter `kruisSite`; download laat `tokens`/`mailLink` weg; een gewiste
proef met betaling houdt geen apparaat-tokens. Geen gat.

Sanity 2026-11-07 16u op #74–#80 (vraaghulp-grens, kaarttaal, UI-schil, avatarrondjes): geen nieuwe routes;
nieuwe innerHTML-plekken escapen namen via `esc()`/`avRond()`. Geen gat.

Audit (e) 2026-11-07 16u:
- **OPGELOST 2026-11-07 (deze PR) — MIDDEL: nieuw logo wiste logo's van andere praktijken.** De opruiming na
  `POST /api/praktijken` verwijderde elk bestand dat met `logo-<slug>-` begon. Een onbeveiligde praktijk "Fysio"
  wiste zo zonder login het logo van "Fysio Noord", en "P" dat van elke praktijk met een vaste code (`logo-p-…`).
  Nu alleen `logo-<slug>-<tijd>.<ext>` en nooit een bestand dat een ander profiel noemt. Test: `npm run test:logoveeg`.
- Opname-upload (`/api/opname/upload`): token eenmalig, proefslot, 60 MB-grens vóór bufferen, inhoud mp4/webm
  gecontroleerd, opslagwaakhond. Eigen oefening en logo: JPEG/PNG op magische bytes, 600/400 kB. `/uploads/`:
  pad-normalisatie, extensielijst, nosniff, CORP same-origin. Geen gat.

Sanity 2026-11-07 12u op #64–#72 (praktijkcode, team, inbox, patiëntkant, akkoord, wissen, UI): team-routes
eisen sessie + beheerdersrol (live gelezen), verwijderen trekt sessies meteen in, uitnodigingstoken alleen als
sha256 en 7 dagen, inbox/dossier via `eisBeveiligdePraktijk` en `praktijkVan`. Eén gat: herstelcode na
"gedeeld wachtwoord uit" (hieronder opgelost).

Sanity 2026-11-07 08u op #57 (Mollie), #59, #60 (kaart hernoemen): geen gat. De webhook haalt de betaling
zelf op bij Mollie en controleert id, proef en bedrag; hernoemen zoekt het kaartId alleen in de eigen praktijk.

## Open

- **LAAG (te controleren) — patiëntroutes accepteren `content-type: text/plain`** (gebruikers-sweep 2026-11-08 06u, Truus):
  `POST /api/kaart/meting` met text/plain geeft 200. Zo'n verzoek is een "simple request" zonder CORS-voorcontrole; nagaan of
  `kruisSite` (Origin/Referer) dit voor andere sites in alle gevallen tegenhoudt, ook zonder Origin-kop.
- **OPGELOST 2026-11-07 (deze PR) — MIDDEL — therapeut (geen beheerder) kan teamsjablonen en eigen oefeningen van de hele praktijk verwijderen of
  overschrijven** (gebruikers-sweep 2026-11-07 18u, Mark, API). `POST /api/praktijk/sjablonen/verwijder` en
  `/api/praktijk/oefeningen/verwijder` geven 200 voor rol therapeut; opnieuw delen met dezelfde naam overschrijft
  stil. Er wordt geen maker bijgehouden. server.js r. ~2840–2855 en ~2899–2918: alleen `eisPraktijk`, geen
  `isBeheer`/maker-check. Fix: maker (lid-id, `door`) wordt opgeslagen; verwijderen geeft 403 en dezelfde naam
  delen 409 voor een andere therapeut. Oud werk zonder maker: alleen beheerder. Test: `npm run test:gedeeldwerk`.
- **OPGELOST 2026-11-07 (deze PR) — LAAG — na een verlopen proef kan een beheerder nog collega's uitnodigen** (sweep 18u, Mark). `/api/praktijk/team/*`
  staat niet in `PROEF_SCHRIJFROUTES` (server.js r. ~529); uitnodigen geeft 200 en de link werkt.

- **MIDDEL — schrijfrem van 40 per 5 minuten per IP geldt voor een hele praktijk achter één wifi** (gebruikers-sweep
  2026-11-07 14u, Mark). Kaart opslaan, afspraak, login, opname en team tellen samen in `schrijfLimiet`
  (server.js r. ~1205–1220). Mark + collega liepen na ±40 gewone handelingen twee keer tegen 429 aan, voor iedereen op
  dat IP, ±5 minuten. Advies: voor geldige praktijksessies per sessie/lid tellen of een hogere grens; de rem voor
  anonieme routes per IP laten. (Bewijs lokaal: probe met x-forwarded-for.)
- **OPGELOST 2026-11-08 (deze PR) — LAAG — gedeeld praktijkwachtwoord weer aanzetten brengt het oude wachtwoord terug** (sanity PR #65,
  2026-11-07). `/api/praktijk/team/gedeeld-uit` met `uit:false` zet alleen de vlag terug; het oude
  wachtwoord (en de herstelcode) die een vertrokken collega kende, werken dan meteen weer.
  Fix: bij weer aanzetten een nieuw wachtwoord eisen en een nieuwe herstelcode tonen (raakt de teamkaart in de app).
  Nu: `uit:false` eist `wachtwoord` (min. 8), zet een nieuwe hash en herstelcode (één keer getoond in de teamkaart)
  en trekt oude gedeelde sessies in; het oude wachtwoord en de oude code werken niet meer. Test: `npm run test:teamherstel`.
- **OPGELOST 2026-11-07 (deze PR, dubbel met hierboven) — LAAG — team uitnodigen en eigen login maken werken ook na een verlopen proef** (sanity PR #65).
  `/api/praktijk/team/*` staat niet in `PROEF_SCHRIJFROUTES`. Geen datalek (de proef blijft voor iedereen
  dicht), wel een schrijfroute die open blijft. Fix: `uitnodigen` en `eigen-login` aan de set toevoegen.
- **LAAG — inloggen met e-mail: tien foute pogingen zetten dat adres een kwartier op slot** (sanity PR #65).
  Wie het e-mailadres van een collega kent, kan die zo steeds buitensluiten. Zelfde afweging als de rem per
  praktijknaam; eventueel: slot alleen voor IP's zonder eerdere geslaagde login.
- **LAAG — tweede betaalpoging maakt de eerste onvindbaar** (sanity PR #57, 2026-11-07). `/v2/proef/betalen`
  haalt het vorige betaal-id uit `mollieBetaalIndex`. Rondt de praktijk daarna tóch de eerste checkout af (twee
  tabbladen), dan wordt die betaling genegeerd: geld afgeschreven, proef blijft dicht. Geen aanvalspad, wel
  integriteit. Fix: oude betaal-id's in de index houden (per proef een lijst) en elke betaalde laten tellen.
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
- **OPGELOST 2026-11-08 (deze PR) — LAAG — remteller op de beheersleutel weigert, maar houdt raden niet tegen.**
  `denied()` geeft na 20 fouten per 5 minuten een 429, maar `isAdmin()` wordt vóór
  `denied()` gecontroleerd: wie tijdens de 429-periode de juiste sleutel stuurt,
  komt er gewoon in. Met een lange willekeurige `ADMIN_KEY` praktisch onschadelijk.
  Repro: 25× fout via `x-admin-sleutel`, dan de juiste sleutel → 200.
  Fix: in de beheerroutes eerst de IP-rem controleren, dan pas de sleutel. Nu: `isAdmin()` weigert elke sleutel
  van een IP dat op de rem staat (`beheerOpRem`); andere IP's merken niets. Test: `npm run test:beheer`.
- **LAAG — beheer is één gedeelde sleutel, geen account.** Geen audit wie wat
  wijzigde, geen intrekken per persoon. Toegangsbeheer (`ACCOUNT_BEHEER_EMAILS`)
  laat zien hoe het wel kan; overstappen kan later per beheerroute.

## Opgelost

- OPGELOST 2026-11-07 PR #73 — **herstelcode werkte nog na "gedeeld praktijkwachtwoord uit"** (MIDDEL).
  De code ligt op papier in de praktijkmap, dus een vertrokken collega kende hem. Met
  `/api/praktijk/herstel` kon die het gedeelde wachtwoord omzetten, kreeg elke keer een verse code (de
  beheerder kon hem niet meer afpakken) en logde álle teamleden uit, zo vaak als die wilde. Nu: een praktijk
  met het gedeelde wachtwoord uit doet niet mee aan herstel (401, `perEmail`), en herstel trekt alleen nog
  de sessies met het gedeelde wachtwoord in. Test: `npm run test:teamherstel`.
- OPGELOST 2026-11-07 (thread "Ontwerp rollen, dossier en opslag", stap 1) — **praktijknaam is een
  wereldwijde sleutel** (HOOG). Een tweede praktijk met dezelfde naam kiest "Andere praktijk met deze
  naam" en krijgt een eigen code `p-<16 hex>` (`acc.naam` = weergave); inloggen op naam zoekt het
  account waarvan het wachtwoord klopt; met een sessie handelt elke route voor de eigen praktijk
  (`praktijkVan`), dus een andere naam op de kaart wisselt niet meer stil van praktijk. Bestaande
  accounts houden hun sleutel. Test: `npm run test:praktijkcode`.
- OPGELOST 2026-11-07 PR #61 — `kruisSite()` weigert nu ook een vreemde of `null`-Origin als
  Sec-Fetch-Site ontbreekt (oudere Safari). Test: `npm run test:kruissite`.
- OPGELOST 2026-11-07 PR #61 — een kaart-id als lijst of object (`{"id":["<id>"]}`) vindt geen kaart meer
  (21 routes via `idTekst()`); geeft 404 in plaats van stil het id te gebruiken.

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

