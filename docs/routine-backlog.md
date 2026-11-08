# Routine-backlog: gebruikers-sweep (V2)

Bijgehouden door de gebruikers-sweep (elke 4 uur). Vier persona's gebruiken de V2-app lokaal
op mobiel, tablet en desktop. Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
Beveiliging staat in `docs/security-backlog.md`, juridisch in `docs/legal-backlog.md`,
werk voor Ahmed in `docs/mensenwerk.md`.

## Flow × apparaat → laatst getest

| Flow | Desktop 1280 | iPad | iPhone SE | iPhone 14 | Pixel 7 |
|---|---|---|---|---|---|
| Proef aanmelden + formulierfouten | 2026-11-08 02u | 2026-11-07 10u | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Welkom, praktijknaam (ook leeg), 12 oefeningen | 2026-11-07 18u | 2026-11-07 10u | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Printversie (lijn, kleur, compact) | 2026-11-08 02u (ook landing printen) | 2026-11-07 10u (2 pagina's, PDF) | 2026-11-07 14u | 2026-11-06 22u (venster) | 2026-11-07 10u |
| Beveiligen, herstelcode, inloggen 2e apparaat | 2026-11-08 02u | 2026-11-08 02u (staand) | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Delen, QR, kaartenoverzicht, CSV | 2026-11-08 02u (roepnaam: fix) | 2026-11-08 02u (staand) | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Naam wijzigen in overzicht + daarna verder bewerken | 2026-11-07 22u (fix) | 2026-11-07 10u | 2026-11-07 14u | – | 2026-11-07 10u |
| Teamsjabloon, eigen oefening (foto), eigen video | 2026-11-08 02u (dubbelklik: fix) | 2026-11-08 02u (teamsjabloon collega) | – | – | – |
| Opname via telefoon /o | 2026-11-07 22u | 2026-11-07 22u (staand) | – | 2026-11-07 10u | 2026-11-08 02u |
| Afspraak, seintje, signalen | 2026-11-08 02u | 2026-11-08 02u (staand) | 2026-11-07 10u | 2026-11-07 22u (.ics DE) | 2026-11-07 22u (.ics na wegnemen: fix) |
| Proef bijna verlopen / verlopen (echte verlopen-pagina) | 2026-11-08 02u | 2026-11-08 02u (collega) | – | 2026-11-07 02u (breedte) | – |
| /k: lezen, voorlezen, pijnscore, herstel, gedaan, te zwaar | – | 2026-11-07 06u | 2026-11-07 14u | 2026-11-07 10u | 2026-11-07 14u |
| /k: gedaan-vinkjes op een tweede apparaat | – | 2026-11-07 10u | 2026-11-07 10u | 2026-11-07 10u | 2026-11-07 10u |
| /k: 200% tekst, offline, Engels, landscape, trage lijn | – | – | 2026-11-08 02u (offline vinkje: fix) | 2026-11-08 02u (EN trage lijn, landscape) | 2026-11-07 22u (landscape, 429) |
| /k: video afspelen (eigen opname, YouTube) | – | 2026-11-07 10u | 2026-11-07 22u (ook offline, 200%) | 2026-11-07 10u | 2026-11-07 22u |
| /k: Duits en Arabisch (rtl) | – | – | ar + uk 2026-11-08 02u | Duits 2026-11-07 14u | Arabisch 2026-11-07 18u |
| Landing /v2 (desktop: ook printen) | 2026-11-08 02u | 2026-11-07 18u | 2026-11-07 06u | 2026-11-07 14u | 2026-11-07 14u |
| Therapeut-app op telefoon | – | – | 2026-11-07 06u | 2026-11-06 22u | 2026-11-07 10u |
| Therapeut-app op iPad liggend | – | 2026-11-07 10u | – | – | – |
| Twee werkplekken op één kaart (oud apparaat/tabblad) | 2026-11-07 06u | 2026-11-07 06u | – | – | – |
| Team: uitnodigen, rollen, verwijderen, inbox, dossier | 2026-11-07 18u | 2026-11-07 18u | – | – | – |
| Mijn gegevens /k, Wis van dit apparaat, /v2/gegevens | 2026-11-07 18u | – | 2026-11-07 18u | 2026-11-08 02u | 2026-11-07 18u |
| Vensters met alleen toetsenbord | 2026-11-07 22u | – | – | – | – |

Volgende run (na 2026-11-08 02u): eigen video op de kaart zetten (nep-camera: chromium.launch met
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`), print op echte iPad-Safari, /k Duits/Turks/Pools op
iPhone SE, therapeut-app op iPad liggend met een team van 3, /k 200 % op Pixel 7, Inbox "Alleen mijn patiënten" hertesten.

Testtip: de verlopen-pagina test je met een tweede server op een kopie van de datamap waarin `verloopt`
in proef-aanmeldingen.json in het verleden staat (wordt alleen bij het opstarten gelezen).
Testtip: vanuit een .mjs-test laad je Playwright met `createRequire(import.meta.url)("playwright")`; `import("playwright")` vindt hem niet.

Testtip (2026-11-08): `npm run test:offline` is lokaal wisselvallig (`page.reload: net::ERR_FAILED`, ook op main 2 van 3 keer);
in CI draait het browserdeel niet. Werker-race bij offline herladen: aparte taak.

Testtip: alle agents delen localhost en dus één IP-bucket van de lees- en schrijfrem. Geef elke
browsercontext lokaal een eigen `x-forwarded-for`, anders krijg je 429's.

## Open

### HOOG
- **OPGELOST 2026-11-08 PR #92 — App: volledige patiëntnaam toch op de server na "Maak er Marieke B. van".** Bij
  "In de praktijk" + OK werd alleen `#k_naam` de roepnaam; `client.c_naam` ("Marieke de Boer") ging mee en de QR vroeg
  daarna opnieuw. Nu neemt `#c_naam` de roepnaam over en laat `serverKaart` geen volledige naam meer meegaan.
  Desktop (Sanne, 2026-11-08 02u). Test: `npm run test:oefvinkje`.
- **Seintjes overschrijven elkaar, ook "Het doet te veel pijn" door "Ik heb een vraag"** (de therapeut ziet alleen de
  vraag). Was MIDDEL/LAAG (vraag → gaat goed); met pijn klinisch zwaarder. Eén `seintje`-slot op de kaart. (Mark, 02u)
- **OPGELOST 2026-11-07 PR #88 — /k: offline twee dagen: dag 1 ging ongemerkt verloren.** Wachtrij per soort per dag
  met `wanneer`; de server zet de tik op zijn dag (`ont` = ontvangst, voor inbox/dossierlabel). Truus hertestte op
  iPhone SE: dag 1 en dag 2 kwamen allebei aan, op de juiste dag. Test: `npm run test:wachtrijdagen`.
- **App op iPad: print kan op 2 pagina's eindigen, met de QR op pagina 2** (eerst nakijken op een echte iPad).
  Met een iPad-UA zet de app `html.safari-print` (kaart 90° gedraaid voor staand papier) terwijl
  `@page{size:A4 landscape}` blijft staan; Chromium-emulatie geeft 2 pagina's, staand en liggend. De klasse
  gaat na `afterprint` niet weg. public/index.html r. 238, 268–273, 1901 (`SAFARI_PRINT`). (Mark, 2026-11-07 06u)

### MIDDEL
- **App: geprinte QR en "Test de QR op je telefoon" nemen de gekozen patiënttaal niet mee.** WhatsApp-link krijgt
  `?taal=ar`, maar `toonQr` (index.html r. ~2166) en het QR-testvenster (r. ~2631) bouwen `/k/<id>` zonder `kaartUrl()`.
  Een Russischtalige telefoon krijgt dan Nederlands. Desktop → iPhone SE (Truus, 2026-11-08 02u).
- **/k: "Luister naar Noor" per oefening heeft geen stopknop of speelstand**; alleen de bovenste knop wordt "Stop" (ver
  buiten beeld), een tweede tik start opnieuw. kaart.html r. ~1873–1880, ~1926. iPhone SE (Truus, 02u).
- **Landing /v2 printen/PDF: lege secties en prijzen weg** (scroll-animaties met opacity 0 ook in print). Oplossing:
  `@media print{*{animation:none!important}}` in public/v2.html r. ~484. Desktop (Sanne, 02u).
- **/k: agendaknoppen zonder bezig-slot of feedback op een trage lijn**; `naarAgenda` haalt het .ics twee keer op
  (controle + navigatie), dubbeltik = 2–4 verzoeken (iOS: mogelijk twee importvragen). kaart.html r. ~885–897. Pixel 7 (Jayden, 02u).
- **App: na "Maak er … van" bij een editor zonder kaartId volgt een 409 over de eigen, net gedeelde kaart**
  (`zetKaartId` alleen als `d.id===KAART_ID`, index.html r. ~3312). Desktop (Sanne, 02u).
- **OPGELOST 2026-11-07 PR #89 — App: na "Naam wijzigen" zette "In de praktijk" de oude naam stil terug** (`#k_naam`
  hield de oude naam; de server hernoemde terug). Desktop (Sanne, 22u). Test: `npm run test:hernoem`.
- **OPGELOST 2026-11-07 PR #89 — /k: agendaknop eindigde op een kale Nederlandse JSON-foutpagina** (afspraak
  intussen weggehaald, 429, 404, 400) zonder weg terug. Nu eerst controleren, anders een melding in de eigen taal onder
  de knop. Pixel 7 (Jayden, 22u). Test: `npm run test:agendamelding`.
- **/k lightbox staand op iPhone SE: naam over de uitleg, onderkant onbereikbaar.** Foto begint op y −7, uitlegpaneel
  loopt tot 576 bij 568 hoog met `overflow:visible` (niet scrollbaar), witte `.lbnaam` staat over de crème uitleg.
  Onderaan de technische zin "Volledige oefenafbeelding. De houdingen worden niet automatisch uitgesneden of
  afgespeeld." kaart.html r. 103–117, 2279. (Truus, 22u)
- **Inbox "Alleen mijn patiënten" verbergt vragen en zegt "Alles is afgehandeld"** (hertest 22u: ongewijzigd) terwijl de teller 1 blijft. Kaarten
  van eigen logins krijgen `behandelaar:null`; het filter zoekt op voornaam in het vrije veld. public/index.html
  r. ~3659–3663. Desktop (Mark, 2026-11-07 18u).
- **Uitgenodigde collega met typfout in de praktijknaam maakt een losse praktijk** ("nog niet beveiligd" +
  Beveiligen, geen e-mailveld). De server kan inloggen met alleen e-mail; geef een vak "Inloggen met je e-mail" en
  noem de praktijknaam op de klaar-pagina (server.js r. ~5303). iPad liggend (Mark, 18u).
- **/k offline: pijnscore en "Ik heb vandaag geoefend" tonen geen gekozen stand** (alleen groene tekst; knop
  aria-pressed=false, weekbolletje blijft leeg); seintjes wel. kaart.html r. ~2330, ~2346. iPhone SE (Truus, 18u).
- **/k spoedregel zegt "Bel de praktijk" zonder nummer of belknop** als de praktijk geen telefoon heeft ingevuld.
  `tekenSpoed` r. ~1578: tel-link als `K.praktijk.tel` bestaat, anders in de app om een nummer vragen. (Truus, 18u)
- **OPGELOST 2026-11-08 PR #92 — Eigen oefening: dubbelklik op Toevoegen geeft een valse fout** (knop op slot vóór de FileReader, server reserveert de naam vóór de awaits; Mark hertestte: één POST, geen 409) (hertest 22u: 200 + 409, één oefening, maar daarna
  "Er is al een eigen oefening met deze naam."). `knop.disabled` gaat pas aan ná FileReader/`resizeDataUrl`
  (index.html r. ~4795–4805): bezig-slot vóór de FileReader. De serverrace (naamcontrole vóór de awaits, server.js
  r. ~2834) bestaat nog. Desktop (Mark, 2026-11-07 14u, 22u).
- **App op iPad liggend: knop Toevoegen bij Eigen oefening valt onder de vensterrand** (lijst "Jullie eigen
  oefeningen" staat tussen formulier en knoppen; knop y=883 op 810 hoog, venster schuift onzichtbaar; knop 36 px).
  Knoppen boven de lijst of vast onderaan. index.html r. ~4778–4784. (Mark, 22u)
- **/k: vaste Nederlandse controlezinnen op een Engelse/Duitse kaart**: "De oefenafbeelding wordt gecontroleerd…" en
  "De algemene uitleg wordt gecontroleerd…" (public/kaart.html r. ~1299–1300) gaan niet door `tr()`. Pixel 7 (EN),
  iPhone 14 en iPhone SE (DE) (Jayden, Truus, 2026-11-07 14u).
- **OPGELOST 2026-11-08 PR #92 — /k: vinkje "Gedaan" per oefening gaat offline verloren** (via `stuur()` en de wachtrij per oefening per dag; server telt op de dag van tikken; Truus hertestte op iPhone SE): `/api/kaart/oefening` gaat niet via `stuur()`/de wachtrij
  (lege `.catch`, kaart.html r. ~1079). De rest van de offline-wachtrij werkt wél (pijn, herstel, seintje, te zwaar,
  dag gedaan komen na online vanzelf aan). iPhone SE (Truus, 14u).
- **/k bij 200 % zoom: hele pagina schuift horizontaal** (582 px op 320): "Alles gedaan", weekbolletjes, "Ik heb vandaag
  geoefend", "Begrepen", voettekst. iPhone SE (Truus, 14u; CSS-zoom, strenger dan WCAG).
- **App: "Naam wijzigen" zit verstopt in een scrollbox van 200 px** (`#k_srv_lijst` max-height 200px; het deelpaneel is
  1479 px hoog, de knop staat ±110 px onder de rand, geen hint). public/index.html r. ~736. Desktop, iPad (Sanne, 10u).
- **Opnamepagina /o loopt vast zonder camera**: "Dat lukte niet" zonder knop Opnieuw en zonder bestandskeuze
  (`<input type=file accept=video/*>`); het scherm blijft "Wachten op de video…" tonen. public/opname.html r. 103, 127.
  iPhone 14 + desktop (Mark, 10u).
- **/k bij 200 % zoom: appbanner bedekt ±30 % en het sluitkruis staat buiten beeld** (scrollWidth 588 op 320). iPhone SE (Truus, 10u).
- **/k: Engelse oefennamen op een Nederlandse kaart** ("Knee elbow", "Med ball rotation passes knee", "Leg extension",
  "Seated chair squats", "Abs stretch", "Abroller"). Staat in public/oefeningen-v2.json (r. 650, 4469): die bestanden
  raken routines niet aan; doorgezet naar mensenwerk (videostroom). iPhone SE (Truus, 10u).
- **/k (andere taal, trage lijn): weer eerst een halfvolle, aantikbare Nederlandse kaart** (tot ±5 s bij 2,5 s vertraging)
  terwijl `alles()` op /api/kaart/vertaal wacht (kaart.html r. ~1480). Erger dan het LAAG-punt hieronder. iPhone 14 (Jayden, 10u).
- **App: verouderd-melding is minuscuul en de enige waarschuwing** (±9 px tekst, links ±10 px hoog in `#qrBlok`);
  het formulier blijft bewerkbaar zonder banner, de therapeut typt door. Desktop (Mark, 2026-11-07 06u).
- **App, verlopen proef bij een collega op iPad: bewerken gaat stil verloren.** De proefbalk staat bovenaan en is
  na scrollen uit beeld; velden blijven bewerkbaar, `PROEF_VOORBIJ` verstuurt niets zonder melding. (Mark)
- **App op iPhone SE: Sjablonen-venster onleesbaar.** Tekstkolom ±70 px (één woord per regel), titel valt boven
  weg; rij met `display:flex` zonder wrap, public/index.html r. ~2281. (Sanne, 2026-11-07 06u)
- **/k: uitleg niet zichtbaar, wel technische tekst** "Natuurlijke stemopname nog niet beschikbaar. De uitleg staat
  bij de afbeelding." onder 4 van 6 oefeningen; uitleg pas na tik op de foto (vergrootglas ±20 px). iPhone SE, iPad (Truus).
- **App op telefoon: deelweigering (409 bestaat/verouderd) staat in `#qrBlok` buiten beeld** (x≈944 px in het
  scrollende A4 op een scherm van 412 px); de therapeut ziet niet waarom de QR ontbreekt. Na een hernoeming
  via het overzicht geeft daarna elke bewerking 409. Pixel 7 (Sanne, 2026-11-07).
- **Overzicht na een verlopen proef laat "te zwaar" weg** (en toont "afspraak 8 nov" zonder ×4).
  server.js `/v2/proef/overzicht` leest `oefZwaar` niet. Desktop (Mark, 2026-11-07).
- **Kaartenoverzicht: lange naam zonder spaties steekt over de rand en de knoppen** (`#k_srv_lijst` zonder
  `overflow-wrap:anywhere`); × wrapt ook op desktop. Desktop (Sanne, 2026-11-07).
- **/k: pijnscore toont soms een ander cijfer dan de server bewaart.** 2 en snel 6 tikken op een
  trage lijn: kaart toont 2, therapeut ziet 6 (mschaal-handler zonder bezig-slot of volgnummer,
  public/kaart.html). iPhone SE (Truus).
- **/k: lightbox op iPhone SE staand moeilijk te sluiten.** Geen sluitknop; tik op het witte paneel
  wisselt de houding; alleen de donkere rand (~15 %, stroken van 18 px) sluit. Paneel bedekt de helft
  van "Foto tonen" en "Luister naar uitleg". Bij 200 % tekst valt de lightbox buiten beeld. (Truus)
- **App op iPhone 14: tikdoelen in Kaarten 15–36 px** (Uitloggen, Nieuwe herstelcode, Activiteit
  15 px; Rapport/CSV 22 px; filterchips 24 px); Kopie en × wrappen naar een eigen regel. (Sanne)
- **Afspraak "nog N keer" is dubbelzinnig**: bij ×4 staat er "nog 4 keer" vóór de eerste afspraak
  (kaart.html `tekenAfspraak`/`TAFHER`, index.html `volgendeAfspraak`). Kies "afspraak 1 van 4" of
  tel de eerstvolgende niet mee. Pixel 7, iPhone 14 (Jayden).
- **App: proef voorbij bij sjabloon, eigen oefening, afspraak, opname** toont `alert(d.fout)` of kleine
  tekst "Kijk op fysiplan.nl/v2/proef" (geen link, altijd productie). Gebruik `toonProefVoorbij()` uit
  index.html (sinds deze run) bij elke `d.proefVerlopen`. (Mark) Ook "In de praktijk" (`k_save_srv`) en
  "Naam wijzigen" (`data-shernoem`) geven een alert; bij afspraak staat de melding 1,6 s in de Bewaar-knop. (Mark, 2026-11-07)
- **Collega op tweede apparaat ziet de proefbalk en aftelling niet; /v2/proef toont daar het
  aanmeldformulier**, ook via de link "Wil je doorgaan?". PROEF komt alleen uit de proefcookie
  (server.js `/v2/app` en `/v2/proef`); ook het praktijkaccount (`acc.proef`) gebruiken. iPad (Mark).
  Erger na afloop (2026-11-07): de collega ziet een normale app tot de eerste schrijfactie, en kan niet
  laten weten dat de praktijk wil doorgaan of het overzicht openen. Na inloggen status opvragen.
- **Tweede apparaat: welkomstvenster heeft geen "inloggen bij mijn praktijk"**, alleen stappen voor
  een nieuwe praktijk. iPad (Mark).
- **Print: lange praktijknaam afgekapt** ("Fysiotherapie & Manue"): de kop is een `<input id="praktijk">`
  en die print op één regel. Desktop en iPad (Sanne).
- **Landing /v2 op mobiel: tikdoelen 14–22 px** (navigatie, taallinks, "Bekijk de kaart vergroot",
  voet); "Vragen" valt buiten beeld in een scrollstrook zonder hint. Printvenster-knoppen 33 px. iPhone 13 / iPad (Sanne).
- **/k: dubbel tikken maakt ongedaan** bij de videoknop en bij "gedaan" per oefening (twee POSTs, kunnen
  ook in omgekeerde volgorde aankomen: patiënt ziet niet gedaan, therapeut wel). Bezig-slot nodig in
  `toggleOefDaan` en de vbtn-toggle. iPhone SE, Pixel 7 trage lijn (Truus, Jayden).
- **/k: trage lijn geeft geen feedback** bij pijnscore/herstel: oude keuze blijft 2–3 s staan. Pixel 7 (Jayden).
- **/k: "gedaan vandaag" rekent client in lokale tijd, server in Amsterdam-tijd**, en is een toggle; in een
  andere tijdzone kan een tik het vinkje van gisteren weghalen. `bevestigGedaan` toggelt met verouderde
  `K` op een tweede apparaat (server.js `/api/kaart/gedaan`, kaart.html `dagStr`). (Jayden)
- **/k: "Kaart niet gevonden" altijd Nederlands**, ook met `?taal=en`; `toonStoring` alleen NL/EN. (Jayden)
  Ook in het Duits, en een 429 op de pijnscore toont de Nederlandse servertekst (kaart.html `dank.textContent=d.fout`). Pixel 7 (2026-11-07).
- **/k: voorlezen geeft een systeem-alert met technische tekst**, altijd Nederlands (`meldOntbrekend`). (Truus)
- **/k (Arabisch): onvertaalde Nederlandse tekst staat rtl** (punt vooraan); geef niet-vertaalde tekst
  `lang="nl" dir="ltr"`. "De oefenafbeelding wordt gecontroleerd" is niet vertaald. (Truus)
- **/k: seintjes overschrijven elkaar**: "vraag" en daarna "gaat goed" → de vraag verdwijnt stil (één `seintje`-slot). (Jayden)
- **OPGELOST 2026-11-08 PR #92 — /k: offline afgevinkt bereikt de therapeut nooit.** Geen wachtrij of `online`-handler, terwijl
  de offline-banner "versturen lukt weer zodra je internet hebt" belooft (kaart.html, oefening-POST
  met lege `.catch`; `#gdaan` meldt niets). iPhone SE.
- **/k: knop "Grotere letters" en 200% tekstgrootte geven horizontaal scrollen en afgeknipte woorden.**
  `html.groot body{zoom:1.16}`, `.oef{overflow:hidden}`, `.oefkop`/`.chip` wrappen niet. iPhone SE.
- **/k: contrast van uitlegtekst 2,7:1** (`--zacht:#a39c8a` op #fffefa), tekst 9,5–12,5 px.
- **/k: tikdoelen onder 44 px**: Te zwaar? (78×21), sluitkruisje appbanner (21×34), Alles gedaan,
  Begrepen, agenda-dagknoppen, koptekstknoppen.
- **/k: terugknop met open lightbox verlaat de kaart** (geen pushState/popstate). Pixel 7, iPhone 14.
- **/k: lightbox in landscape**: bovenkant valt weg, naam over uitleg, knoppen achter de foto.
- **/k (Engels): servermeldingen in het Nederlands** (`d.fout` direct getoond), en 'gedaan' faalt stil.
- **/k (Engels, trage lijn): eerst een halflege Nederlandse kaart**, geen laadstaat tot ~3,5 s.
- **App: modale vensters niet met toetsenbord**: geen focus naar het venster, geen Escape, geen role=dialog. Hertest 18u: ovProefWelkom, ovPrint, ovKaarten, ovSjab, ovWis ongewijzigd (22u: ook ovQrTest); `<dialog>` "Nieuw in Fysiplan" en ovSein werken wel (patroon). `openOv`/`closeOv` r. ~5002.
- **App: printversie toont placeholders van het praktijkadres** ("adres / postcode en plaats / …").
- **LIJKT OPGELOST 2026-11-07 18u (#77): App 1280×800: A4 past niet; QR en deelknoppen na delen buiten beeld.** Sanne zag #a4wrap 736×559, geen horizontaal scrollen, QR en knoppen zichtbaar.
- **Foutmelding "Alleen beschikbaar voor beheer." bij fout wachtwoord of foute herstelcode.**
  Al opgelost in open PR #41 (server.js `denied()` met eigen tekst); mergen of overnemen.

### LAAG
- Teamsjabloon van een ander: therapeut ziet × "verwijderen voor de hele praktijk"; server weigert pas na de bevestiging
  met een alert (index.html r. ~2509 `data-pdel`). iPad staand (Mark, 2026-11-08 02u).
- Verlopen proef: "+1 week" laat de nieuwe datum in het veld staan terwijl niets is bewaard (index.html r. ~4455 `data-safweek`). iPad (Mark, 02u).
- iPad staand: na een gelukte deling staan QR/WhatsApp/kopieer buiten beeld (x 855–1124 op 810) zonder melding. (Mark, 02u)
- Herstelcode is gevoelig voor hoofdletters en spaties ("fp-…", "FP a66d7 …" geweigerd). server.js r. ~2739. (Sanne, 02u)
- /k: eigen taalkeuze houdt niet stand: URL blijft `?taal=en`, na herladen weer Engels (kaart.html r. ~1732 `wisselTaal`). iPhone 14 (Jayden, 02u).
- /o zonder token geeft 200 met de oude V1-inlogpagina in plaats van "Deze opnamelink is niet geldig". Pixel 7 (Jayden, 02u).
- /k lightbox staand op iPhone 14: witte oefennaam over de appbanner (variant van het SE-punt). (Jayden, 02u)
- /k/<id>/ en /k/<ID in hoofdletters> zeggen "Kaart bestaat niet (meer)" (kaart.html r. 620, server.js `vindKaart`). iPhone SE (Truus, 02u).
- /k offline: Noor-opname zegt "kon niet worden afgespeeld" zonder te noemen dat er geen internet is (mp3 niet in kaart-sw.js). (Truus, 02u)
- /k Arabisch bij 200 %: door rtl valt juist het begin van de regels weg (op echt toestel bevestigen). (Truus, 02u)
- OPGELOST 2026-11-08 PR #92 (melding noemt nu JPEG/PNG, nog wel als alert) — Eigen oefening: verkeerd fotobestand (.HEIC, .pdf, tekst als .png) geeft alleen alert "De foto kon niet worden
  gelezen." zonder "gebruik JPEG of PNG". index.html r. ~4799. iPad staand (Mark, 22u).
- /k video zonder internet: eigen opname zegt "neem contact op met je praktijk" (misleidend offline, en achter de
  appbanner); YouTube onbereikbaar geeft een zwart vlak zonder melding. kaart.html `bewaakVideo` r. ~2181, yt-tak
  r. ~2320. iPhone SE (Truus, 22u).
- /k: `<video>` van de eigen opname heeft aria-label "General instructions for this exercise" (label van het
  tekstblok, `VIDEO_TEKST_ALG`); verwacht "Video from your therapist: <oefening>". kaart.html r. ~2308. Pixel 7 (Jayden, 22u).
- Lange roepnaam afgekapt op de print (36 tekens zichtbaar), en lengtes verschillen: editor `c_naam` maxLength 40
  (index.html r. 1106), Naam wijzigen en server 60 (server.js `cleanName(b.naam, 60)`). Desktop (Sanne, 22u).
- /v2/proef: 0612345678 wordt als nepnummer geweigerd met de tekst "Gebruik 10 cijfers die met 0 beginnen (mobiel
  06…)", wat dit nummer al doet. lib/proef.js r. 51, 96: eigen zin geven. Desktop (Sanne, 22u).
- Team-venster: na meerdere uitnodigingen staat alleen de laatste link; geen "kopieer link" voor eerdere (opnieuw
  uitnodigen maakt de vorige ongeldig). Verwijderknop × 32×36 px, "Zeker?" loopt over de rand. index.html r. ~3060–3100. (Mark, 18u)
- Akkoord wordt twee keer gevraagd: bij de proef én bij Beveiligen (`#ps_vwolab`). Desktop (Sanne, 18u).
- `/k/<onzin>` geeft 200 in plaats van 404 (de API weigert wel netjes). (Jayden, 18u)
- Sjabloon met `oefeningen:[{n:{a:1}}]` wordt bewaard als oefening "[object Object]" (server.js r. ~2857 `cleanName`
  op een object); verwacht 400. (Mark, 14u)
- /k offline: dag en score krijgen het tijdstip van ontvangst (twee offline dagen: zie HOOG, 18u). "Te zwaar?" zegt offline al "Doorgegeven ✓" (kaart.html r. ~2212). (Truus, 14u, uit code)
- Afspraak-.ics: DESCRIPTION/URL wijzen naar `/k/<id>` zonder `?taal=` (server.js r. ~4365). (Jayden, 14u)
- Roepnaamvoorstel bij rare invoer onzin: "Jan K. 😀 =1+1 <script>" → "Jan <." (index.html `kaartLabelVan`). (Sanne, 14u)
- Praktijknaam "Fysio <b>Sanne</b>" wordt stil "Fysio bSanne/b" (lib/proef.js `schoon`). (Sanne, 14u)
- Dubbeltik op "Toch zo laten" stuurt twee POST /api/kaarten (200 + 409); geen dubbele kaart. (Sanne, 14u)
- Welkomsttekst "klik links" klopt niet op de telefoon (lijst staat boven); daarna meteen ook "Nieuw in Fysiplan". (Sanne, 14u)
- /k: uitvinken op apparaat A bereikt apparaat B niet als B die oefeningen zelf in localStorage had aangevinkt
  (`leesOefDaan` voegt lokaal en server samen). Randgeval na PR #68: na laden de serverstand van vandaag als waarheid
  nemen, localStorage alleen offline. iPhone 14 + Pixel 7 (Jayden, hertest 10u).
- Sjablonen-venster ook op desktop 1280 onleesbaar (tekstkolom ±70 px); hoort bij het MIDDEL-punt voor iPhone SE. Na
  "Deel" blijft de knop Deel bij het eigen sjabloon staan. (Mark, 10u)
- /k: gegokt of onbekend kaart-id geeft HTTP 200 met "Kaart niet gevonden" (de API zelf geeft 404); beter 404/410. Lekt niets.
  server.js r. ~4392. (Truus, Mark, 10u)
- /k: offline zegt de eigen video "neem contact op met je praktijk"; offline pijnscore wordt nooit later verstuurd
  (hoort bij het offline-punt). iPhone SE (Truus, 10u).
- /k (Arabisch, vertaling mislukt): voorlezen spreekt Nederlandse namen uit met de Arabische stem, zonder melding
  (kaart.html `leesVoor` r. ~1526). Ook de uitleg in de lightbox blijft Nederlands zonder melding (Engels, Jayden). (10u)
- .ics-link verliest de taal (`/k/<id>` zonder `?taal=en`), server.js r. ~3986 en ~4171. (Jayden, 10u)
- Kleurprint "Avatar" mengt stijlen: bekkenbodemoefeningen als lijntekening, enkele als grijze foto. Desktop (Sanne, 10u).
- Tip "therapietrouw" (`#trouwhint`) op Pixel 7 links en rechts afgekapt (binnen het geschaalde A4). (Sanne, 10u)
- App: dubbelklik op "+" in de oefeningenlijst voegt toe en haalt weer weg (toggle), public/index.html r. ~1358. (Sanne)
- App: emoji in de roepnaam geeft voorstel "Dirk �." (`kaartLabelVan` met `charAt(0)`, index.html ~r. 1955). (Sanne)
- App op iPhone SE: knoppengroep Sjablonen | Kaarten | Wis kaart breekt over twee regels (v2.css r. 92–94);
  welkomstvenster: Enter in praktijknaam doet niets, tekst zegt "klik links". (Sanne)
- API: `chosen` als string geeft 200 en een kaart zonder oefeningen (verwacht 400). (Mark)
- /api/kaart/vraag geeft 502 "vraaghulp niet bereikbaar" op een kapotte body in plaats van 400 (server.js r. ~4243). (Jayden)
- /k: 429 toont "No connection right now", gelijk aan een storing. iPhone 14 (Jayden).
- Landing /v2 op iPhone SE: kop (82 px) en duimbalk (68 px) nemen 26 % van de hoogte; "Probeer Fysiplan gratis"
  in de hero half achter de duimbalk. (Jayden)
- /k: herstelknoppen zonder aria-pressed/eigen label; `#agbtn` begint met svg zonder label; lightbox op iPad
  zonder sluitknop. (Truus)
- /k (Engels): mislukte vertaling laat oefennamen stil Nederlands; trage lijn geeft eerst een lege pagina
  zonder laadstaat (niet meer halfleeg NL). Pixel 7 (Jayden).
- /k: pijnschaalknoppen 36×46 px op iPhone SE, schaal breekt 6+5 en "10 = ergste pijn" staat los;
  appbanner bedekt "Neem pijn serieus" bij 8+. (Truus)
- Proefformulier: "06 1234 5678" (placeholder en voorbeeld in de foutmelding) wordt zelf geweigerd
  (lib/proef.js). (Sanne, Mark)
- App op telefoon: "Test de QR op je telefoon" toont een QR en "Open op deze computer"; toetsenbordhints
  "/ zoeken · Enter toevoegen" staan ook op de telefoon. (Sanne)
- Kleurprint: staande afbeelding (Rugstrekken, apparaat) steekt boven de cel uit. Desktop (Sanne).
- Dubbelklik op "Toevoegen" bij Eigen oefening: opgeslagen en daarna 409 "bestaat al" (`eo_bewaar`
  zet `disabled` pas na FileReader). Desktop (Mark).
- .ics: lange regels niet gevouwen (RFC 5545, 75 octets) bij een lange praktijknaam. (Jayden)
- Prijscalculator /v2 zonder bovengrens (99999999999 therapeuten). (Jayden)
- Dubbelklik op "In de praktijk": kaart wordt opgeslagen, daarna alert "Er is al een kaart …" (409 van de tweede POST). (Sanne)
- Proefformulier past rare invoer stil aan (`<script>` → "scriptalert(1)/script", 10.000 tekens → 80) in plaats van te melden. (Sanne)
- Beeldknop heet "Lijntekeningen | Avatar", landing en printvenster zeggen "kleur of lijntekening". (Sanne)
- /k (Engels): kop "S H W" (H/W Nederlands), grafieklabel dd-mm, afspraak in US-notatie, aria-labels Nederlands;
  na een mislukte vertaling probeert de kaart het die sessie niet opnieuw. (Jayden)
- Server knipt tekst af midden in een emoji (`slice` op UTF-16 in `sanStr`), geeft "�". (Jayden) Ook in
  `/api/kaart/antwoord` en `/api/kaart/vraag` (`.slice(0,300)`); één gedeelde UTF-16-veilige afkap gebruiken.
- /k: foutmelding van de videospeler alleen NL/EN; appbanner wisselt niet mee van taal en bedekt de uitleg onder de video. (Truus)
- Kaartenoverzicht "actief deze week" telt pijnscore, herstel, seintjes en afvinken per oefening niet mee (`actiefDezeWeek`). (Truus, Sanne)
- Kaartenoverzicht ververst niet direct na beveiligen ("Nog geen gedeelde kaarten" tot heropenen).
- Lange kaartnaam: melding toont de hele invoer, server bewaart 60 tekens; `#k_naam` zonder maxlength.
- Bijna verlopen proef: "loopt nog vandaag nog", en "t/m zaterdag" terwijl hij vrijdag afloopt.
- /v2/proef zegt "Vul drie gegevens in", er zijn vijf verplichte velden.
- Verwerkersovereenkomst twee keer aanvinken (proef en beveiligen).
- Nieuwe proefgebruiker ziet bij het tweede bezoek meteen "Nieuw in Fysiplan".
- /k: "Ik heb vandaag geoefend" is een aan/uit-knop; nog eens tikken wist de oefendag.
- /k: lightbox zegt "De uitvoering is niet door een fysiotherapeut goedgekeurd" (verwarrend voor patiënt).
- App: knoppen 28–36 px hoog op desktop en tablet; Print loopt op iPad liggend tegen de rand. Op 1280 wrappen
  "+ Eigen oefening", "Wis kaart" (2 regels) en "Print trainingsschema (PDF)" (3 regels). (Sanne)
- /k (Duits): "Eén tik" is vertaald als "Ein Tipp" (= een hint), in `de.sintro` en `de.hsintro`; beter "Einmal tippen". (Jayden, 2026-11-07)
- /k: pijnscore op dezelfde dag wijzigen houdt de tijd van de eerste tik (server.js `/api/kaart/meting`). (Jayden)
- /k: "Ervaren herstel" zit dicht in een `<details class="rustblok">`; de vijf knoppen zijn niet te zien. iPhone SE (Truus).
- Verlopen proef: "Ja, ik wil doorgaan" onthoudt niets; de pagina toont daarna dezelfde knop (`p.doorgaan` ongebruikt). (Mark)
- Overzicht na de proef toont seintjes die in de app al gezien zijn nog als nieuw. (Mark)
- Eigen oefening: PDF of GIF geeft "De foto kon niet worden gelezen." in plaats van "Kies een JPEG- of PNG-foto". (Mark)
- 13e oefening geeft een systeem-`alert()` ("Maximaal 12 plaatjes"). (Sanne)
- Print: lange Doel/Opm. kapt stil af zonder "…"; Opm. schuift tegen "Casus"; cel 12 1 px hoger met zwaardere rand;
  in compact zijn de tekeningen ~⅓ van de cel. Desktop (Sanne).

## Opgelost

- **App: seintje "heeft een vraag" werd met één klik + Enter stil afgehandeld** (prompt, leeg = afhandelen). Nu een eigen
  venster met "Beantwoorden" en "Alleen afhandelen". **Afspraak: fouttekst bleef op "Bewaar"** en **dubbelklik op "+1 week"
  = twee weken**: label één keer onthouden, bezig-slot. **Hoge vensters** (Kaarten na beveiligen) scrollen nu binnen het
  scherm. **KRITIEK — /k?taal=__proto__ maakte de kaart leeg, en via fp_taal ook elke latere QR-scan** (Jayden): taal
  alleen nog via `isTaal` (hasOwnProperty). **Proef: voorbeeldnummer 06 1234 5678 werd zelf geweigerd** (Sanne).
  OPGELOST 2026-11-07 PR #75. Test: `npm run test:seintje`, `npm run test:proef`.
- **HOOG — "Naam wijzigen" in het overzicht werd bij de volgende bewerking stil teruggedraaid** (de open editor stuurde
  de oude naam + kaartId; ook `client.c_naam` bleef oud, dus /k zag de verbetering nooit). De open editor neemt nu naam
  en versie over, de server zet `client.c_naam` mee en hoogt `ts` op (ander apparaat krijgt "verouderd").
  OPGELOST 2026-11-07 PR #68. Test: `npm run test:hernoem`. (Sanne, desktop + Pixel 7)
- **HOOG — /k: "gedaan" per oefening stond alleen op één apparaat** (iPhone 6/6, iPad 0/6). De kaart telt nu de vinkjes
  van vandaag uit `oefTrouw` mee (serverdag via `dag` in GET /api/kaart). OPGELOST 2026-11-07 PR #68.
  Test: `npm run test:gedaansync`. (Truus, iPhone SE + iPad)
- **MIDDEL — /k: na "Alles gedaan" haalde een bevestigende tik op "Ik heb vandaag geoefend" de dag stil weg** (kaart bleef
  "alles gedaan" tonen, therapeut 0 actief). De dag wordt nu expliciet aan/uit gezet (`aan`), de automatische
  bevestiging is idempotent en uitzetten haalt de vinkjes mee weg. OPGELOST 2026-11-07 PR #68. (Jayden, iPhone 14 + Pixel 7)
- **HOOG — App: roepnaam verbeteren maakte stil een tweede kaart met een nieuwe QR/link** ("Dirk" → "Dirck",
  ook "Voorbeeldpatiënt" → echte roepnaam). POST /api/kaarten hernoemt nu de kaart van het meegestuurde
  `kaartId` als de nieuwe naam vrij is; id, QR en voortgang blijven. OPGELOST 2026-11-07 PR #60. Test: `npm run test:hernoem`.
- **MIDDEL — alleen openen op een tweede werkplek maakte de kaart op de eerste "verouderd"** (409 kaatste heen en
  weer, Mark, desktop + iPad). Ongewijzigde inhoud hoogt `ts` niet meer op. OPGELOST 2026-11-07 PR #60.
- **HOOG — App op iPhone SE: sticky bovenbalk nam 57 % van het scherm** (Sanne). Onder 920 px scrolt hij mee weg.
  OPGELOST 2026-11-07 PR #60. Test: `npm run test:topbar`.
- **HOOG — oud apparaat of tabblad overschreef een gedeelde kaart bij het openen en wiste eigen opnames**
  (Truus, desktop, 2026-11-07). De v2-editor stuurt nu `basisTs` mee; is de kaart elders bewaard, dan geeft
  de server 409 `verouderd` en toont de editor "Open de nieuwste versie" / "Toch mijn versie bewaren".
  OPGELOST 2026-11-07 PR #56. Test: `npm run test:kaartversie`.
- **HOOG — /k: eigen video van de therapeut verdween bij een oefening met een afgekeurd beeld** (Chair squat,
  iPhone SE). De eigen opname of per kaart geplakte YouTube-link blijft nu staan, zonder algemene uitlegtekst;
  bibliotheek- en gegenereerde video's blijven verborgen. OPGELOST 2026-11-07 PR #56.
  Test: `npm run test:kaartversie`.
- **MIDDEL — /k: lang woord of lange link in het bericht van de therapeut maakte de pagina 2241 px breed**
  (iPhone SE; tikken kwamen niet meer aan). `.akaart .atekst` breekt nu af. Ook weg: de zin "de tekst
  hieronder is de algemene uitleg" onder een praktijkvideo zonder uitleg. OPGELOST 2026-11-07 PR #56.
- **HOOG — proef zonder praktijknaam liep vast in Kaarten.** Kaarten vraagt nu de praktijknaam
  (min. 2 tekens) en toont daarna het beveiligingsblok. OPGELOST 2026-11-06 PR #53.
  Test: `npm run test:praktijkslot`.
- **HOOG — 429/5xx leek op "nog niet beveiligd" en "nog geen gedeelde kaarten".** Nu: "De server is
  even druk / kan nu niet laden. Je kaarten zijn niet weg." met "Opnieuw proberen", en geen
  Beveiligen-knop bij een storing. OPGELOST 2026-11-06 PR #53. Test: `npm run test:praktijkslot`.
- **HOOG — telefoon en iPad staand: geen beeldkeuze (lijn/kleur) en geen Help** (Sanne, Mark).
  v2.css verborg `.menu` onder 920 px; nu een eigen regel onder de knoppen. OPGELOST 2026-11-06 PR #53.
- **HOOG — /k: "Te zwaar?" zei "Doorgegeven ✓" ook als versturen mislukte** (offline, 429, 5xx; Truus).
  Nu pas na een 2xx, anders "Niet verstuurd. Tik opnieuw". OPGELOST 2026-11-06 PR #53.
  Test: `npm run test:tezwaar`.
- **LAAG — afspraak-.ics met taal=__proto__ gaf "SUMMARY:undefined"** (Jayden). `Object.hasOwn`.
  OPGELOST 2026-11-06 PR #53.
- **KRITIEK — verlopen proef op een tweede apparaat gaf een eindeloze herlaadlus** (Mark, iPad,
  ingelogd zonder proefcookie). De app herlaadde bij `proefVerlopen`, maar /v2/app serveert zonder
  cookie gewoon weer de app: 6 herlaadbeurten in 12 s, invoer weg. Nu een vaste melding bovenaan
  ("Je gratis proef is voorbij" met link naar /v2/proef), lezen blijft werken en automatisch delen
  stopt (`toonProefVoorbij` in public/index.html). OPGELOST 2026-11-06 PR #49. Test: `npm run test:tablet`.
- **HOOG — /k: offline werkt pas na het tweede bezoek.** De kaart stuurt de werker nu na het eerste
  laden de adressen die al geladen zijn (pagina, `/api/kaart?id=`, vertaling, beelden); de werker
  bewaart ze (alleen eigen site, geen video's of schrijfroutes). OPGELOST 2026-11-06 PR #49.
  Test: `npm run test:offline`.
- **HOOG — tablet: knopjes "eigen video" en × onbereikbaar.** Op apparaten zonder aanwijzen staan ze
  nu altijd, 30 px met een tikvlak van 44 px; met toetsenbord zichtbaar bij focus en te openen met
  Enter/spatie. OPGELOST 2026-11-06 PR #49. Test: `npm run test:tablet`.

- **MIDDEL — na een verlopen proef kwamen patiëntseintjes nergens meer aan.** Ahmed koos 2026-11-06
  voor een alleen-lezen overzicht: de verlopen-pagina heeft nu "Seintjes van je patiënten"
  (praktijknaam + wachtwoord, POST /v2/proef/overzicht), met seintjes bovenaan, pijn, herstel,
  laatst geoefend en afspraak. Geen sessie, geen schrijfroute. OPGELOST 2026-11-06,
  PR "kaart: seintjes blijven zichtbaar na een verlopen proef". Test: `npm run test:proef`.
- **HOOG — CSV-export liet formules door** (`=1+1`, `@SUM`, `+`, `-`): Excel/LibreOffice voerden
  ze uit. Nu krijgt zo'n cel een `'` ervoor (`csvCel` in public/index.html). OPGELOST 2026-11-06,
  PR "kaart: CSV zonder formules, afspraak met tijdzone, druk is geen weg kaart". Test: `npm run test:sweep`.
- **HOOG — afspraak-.ics een uur verkeerd buiten Nederlandse tijd**: DTSTART was zwevend, nu
  `TZID=Europe/Amsterdam` met VTIMEZONE (ook goed over de zomertijdwissel). OPGELOST 2026-11-06, zelfde PR.
- **HOOG — /k zei bij druk (429) of serverfout "Deze trainingskaart bestaat niet (meer)"**: nu alleen
  bij een echte 404; anders "Even geen verbinding" met Opnieuw proberen, en de service worker geeft
  bij 429/5xx de laatst geladen kaart uit de cache. OPGELOST 2026-11-06, zelfde PR.

## Opgelost door de sweep van 2026-11-07 18u (PR in deze run)
- HOOG — Printknop bij een praktijk die nog niet beveiligd is: venster sloot stil en opende Beveiligen, er werd niets
  geprint. Nu blijft het venster open met de reden, "Beveiligen" en "Print zonder QR-code". Test: `npm run test:printknop` (scenario 4). (Sanne, desktop)
- HOOG — Overzicht na een verlopen proef bleef dicht zodra het gedeelde praktijkwachtwoord uit stond. Nu ook met
  e-mail + eigen wachtwoord. Test: `npm run test:sweepoverzicht`. (Mark, desktop)
- MIDDEL — "Wis Fysiplan van dit apparaat" liet de proefcookie staan (volgende gebruiker zag naam/e-mail en kon de
  proef stoppen). Logout met `?apparaat=1` wist hem nu. Test: `npm run test:sweepoverzicht`. (Sanne, desktop)
