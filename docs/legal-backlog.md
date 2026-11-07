# Legal-backlog (V2)

Bijgehouden door de legal-routine (elke 4 uur). Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
Alle juridische teksten zijn concept tot een jurist ze toetst; niets hier is juridisch advies.
Zakelijke en juridische beslissingen staan onder "Voor Ahmed" in `docs/mensenwerk.md`.

## Gebied → laatst gecontroleerd

| Gebied | Laatst gecontroleerd |
|---|---|
| (a) privacyverklaring (art. 13/14 AVG) | 2026-11-07 (team, akkoord, Mijn gegevens, Railway-logs) |
| (b) verwerkersovereenkomst (art. 28 AVG) + subverwerkers | 2026-11-07 (eigen login per therapeut, één akkoord) |
| (c) algemene voorwaarden | 2026-11-07 (akkoord met versie, eigen login) |
| (d) code tegen tekst | 2026-11-07 (Mollie/betalen), steekproef 2026-11-06 |
| (e) rechten van betrokkenen: inzien, exporteren, wissen | 2026-11-07 22u (patiënt: wissen van de telefoon echt volledig; eerder proefaanmelding in download en wissen) |
| (f) cookies en lokale opslag | 2026-11-07 (Google Fonts weg, fp1, wis-knoppen) |
| (g) MDR en AI-verordening | 2026-11-07 (vraaghulp op de kaart, zoekhulp, vertalen, AI-labels, landing en app) |
| (h) WGBO en KNGF-beroepsregels | 2026-11-07 (contactlogboek in de dossiertekst) |
| (i) begrijpelijkheid (B1) | 2026-11-07 (privacyverklaring: "In het kort"; VWO en voorwaarden nog niet) |

Volgende run: /k "Mijn gegevens"-download leesbaar maken (open MIDDEL), daarna (d) code tegen tekst (wissen van opnames, eigen video's, logs) en (i) B1 voor VWO en voorwaarden.
De punten die op PR #41 wachtten, zijn op 2026-11-07 toch gebouwd (#69 en de juridische ronde daarna); #41 botst nu en moet worden bijgewerkt of gesloten.

## Open

- **MIDDEL — /k "Mijn gegevens": download mist de seintjes en is onleesbaar voor een patiënt** (gebruikers-sweep
  2026-11-07 18u, Truus, iPhone SE). De rubriek belooft "pijnscores, gedaan, te zwaar en seintjes", maar de JSON
  heeft geen `seintje` (server.js r. ~3893 laat het weg in de patiëntkaart) en wel technische sleutels (`chosen`,
  `vids`, epoch-tijden, `xfp_…|r0|S`). Lokale vinkjes/te zwaar (`fp_oefdaan`, `fp_zwaar`) ontbreken ook. Inzage
  (art. 15) vraagt begrijpelijke vorm. kaart.html r. ~1595 `downloadMijnGegevens`; sleutels en uitleg ook altijd
  Nederlands op een EN/AR-kaart (Jayden).
- **LAAG — Privacy-link op een Engelse/Arabische kaart opent een pagina die alleen Nederlands is** en niet het
  patiëntdeel `#patient` (sweep 18u, Jayden, Pixel 7). kaart.html r. ~473, ~599; server.js `juridischBlok`.
- **LAAG — /v2/gegevens loopt achter op #84** (sweep 18u, Sanne). Blok "Alles wissen" noemt de proefaanmelding niet
  (public/proef.html r. ~252), onderaan staat nog "wis je via Mijn proef" (r. ~261); na wissen geen verwijzing naar
  "Wis Fysiplan van dit apparaat" terwijl roepnaam en praktijknaam nog in de browser staan.

- **LAAG — praktijk kan de vraaghulp op de kaart niet zelf uitzetten (2026-11-07).** Staat
  `ANTHROPIC_API_KEY` aan, dan ziet elke patiënt de vraaghulp. De praktijk is
  verwerkingsverantwoordelijke en kan nu niet kiezen om geen enkele patiëntvraag naar een dienst
  in de VS te sturen. Sinds deze ronde gaan vragen over pijn en klachten er niet meer heen, en de
  kaart waarschuwt geen persoonsgegevens te typen. Een schakelaar per praktijk is een keuze; zie
  "Vraaghulp op de kaart" in `docs/mensenwerk.md`.
- **LAAG — label "klinisch gecontroleerd" bij AI-video's (`public/kaart.html`, VIDEO_META).**
  Verschijnt alleen als `clinicallyReviewed === true` in de videocatalogus. Dat is de door Ahmed
  begeleide videostroom; deze routine raakt de reviewstatus niet aan. Let op dat "klinisch" niet
  meer belooft dan "beoordeeld door een fysiotherapeut".

- **LAAG — patiëntopslag (/k) is functioneel, geen toestemming nodig (art. 11.7a lid 3 Tw).**
  Gecontroleerd 2026-11-06: geen cookies op /k, alleen localStorage (taal, lettergrootte, stem,
  vinkjes, "te zwaar", privacyregel gezien, app-uitnodiging) en de offline-cache van de
  service worker. Geen analyse, geen derden behalve video's pas na tikken (al in de verklaring).
  Bron: Telecommunicatiewet art. 11.7a; AP, "Cookies" (autoriteitpersoonsgegevens.nl).
- **LAAG — download bevat media als pad, niet als bestand (2026-11-06).** `/v2/gegevens/download`
  geeft kaarten, aantikken, eigen oefeningen, sjablonen, profiel en logboek als JSON; eigen
  video's, foto's en het logo staan erin als pad. Voor inzage (art. 15) volstaat dat meestal,
  omdat de praktijk die bestanden zelf aanleverde. Een zip zonder nieuwe dependency is pas
  nodig als een praktijk erom vraagt.
- **LAAG — een onbeveiligde praktijk kan niet alles in één keer wissen.** Zonder wachtwoord is
  er geen bewijs van eigenaarschap. Zo'n praktijk kan geen kaarten delen (wachtwoordplicht sinds
  PR #40), dus er staan geen patiëntgegevens op de server; losse sjablonen/profiel via e-mail.
- **LAAG — steekproef (d), 2026-11-06:** avatarvideo's uit PR #42 staan op de eigen server
  (geen nieuwe derde partij), dus de subverwerkerslijst klopt nog. Volledige controle (d) van
  wissen van opnames, eigen video's en logs volgt in een latere run.

## Opgelost

- **MIDDEL — /k "Wis deze kaart van mijn telefoon" belooft meer dan het doet.** OPGELOST 2026-11-07 PR #87:
  wist nu alle sleutels van deze kaart plus taal, lettergrootte, stem en app-melding (andere kaarten blijven),
  waarschuwt als er nog iets niet verstuurd is, zet het adres op `/k?gewist=1` zodat herladen de kaart niet
  opnieuw opent, en zegt dat een beginschermicoon ook weg moet. Test `scripts/test-kaart-wis-telefoon.mjs`.
- **MIDDEL — /k privacyzin klopt niet helemaal.** OPGELOST 2026-11-07 PR #87: privacyzin en Mijn gegevens
  noemen nu roepnaam, oefeningen en wat de fysiotherapeut erbij schreef, en "een tijd na je behandeling wordt
  de kaart vanzelf gewist" (9 talen); privacyregel in `--grijs` (ca. 4,6:1 in plaats van 2,6:1).

- **MIDDEL — proefaanmelding ontbrak in download en "Alles wissen" (2026-11-07).** `/v2/gegevens`
  beloofde "alle gegevens die Fysiplan voor deze praktijk bewaart", maar de proefaanmelding van die
  praktijk (contactpersoon, e-mail, telefoon, betaling) zat niet in de download (art. 15/20 AVG) en
  bleef na "Alles wissen" staan (art. 17). Was de praktijk klant, dan werd zij nooit automatisch
  gewist. OPGELOST 2026-11-07: de download geeft `aanmelding` mee (zonder apparaat-tokens);
  wissen haalt de aanmelding weg. Na een online betaling blijft alleen naam, e-mail, praktijknaam
  en de betaling, 7 jaar (fiscale bewaarplicht, art. 52 AWR), daarna wist de uurronde ook die.
  Telefoon en apparaten gaan meteen weg en hetzelfde e-mailadres hervat die aanmelding niet meer.
  Privacyverklaring (rij Proefaanmelding) en de gegevenspagina zeggen het erbij.
  Test: `scripts/test-gegevens-proef.mjs` (in `npm run test:privacy` en CI).
  Rest van (e) zonder nieuw gat: teamleden, akkoord en logboek zitten al in download en wissen;
  losse kaart wissen via "Verwijderen" in de app; patiënt via "Mijn gegevens" op /k.

- **MIDDEL — vraaghulp op de kaart kreeg vragen over pijn en klachten (2026-11-07).** Een patiënt
  kon typen "mijn knie doet pijn sinds de operatie, moet ik doorgaan?". Die vraag ging naar de
  AI-dienst in de VS (gezondheidsgegevens, art. 9 AVG) en alleen de systeeminstructie hield een
  antwoord over de klacht tegen. Software die op de klacht van één patiënt reageert, schuift richting
  medisch hulpmiddel (MDR art. 2 lid 1; MDCG 2019-11, stap 3 en 4). OPGELOST 2026-11-07: de server
  herkent pijn, klachten, medicijnen, operatie en herstel in de 9 talen van de kaart
  (`lib/vraaghulp-grens.js`) en geeft dan zonder AI een vaste verwijzing naar de eigen praktijk en
  het seintje "Het doet te veel pijn"; die verwijzing krijgt geen AI-label. Privacyverklaring zegt
  het erbij. Test: `scripts/test-vraaghulp-grens.mjs` en `npm run test:privacy`.
  Rest van (g) zonder nieuw gat: zoekhulp zonder klacht/dosering, vertalen zonder vrije tekst, AI-labels
  op kaart en vraaghulp (art. 50 AI-verordening), landing "stelt geen diagnose, kiest geen behandeling
  of dosering". Sorteren "melding bovenaan" in de app volgt een tik van de patiënt, geen oordeel.

- **HOOG — de app voor therapeuten laadde het lettertype bij Google (2026-11-07).** `public/index.html`
  haalde Inter van fonts.googleapis.com en fonts.gstatic.com. Daardoor ging bij elk bezoek het
  IP-adres van de therapeut naar Google, zonder toestemming en zonder noodzaak (LG München I,
  20-01-2022, 3 O 17493/20; art. 6 AVG). OPGELOST: Inter staat nu op de eigen server
  (`public/fonts`, OFL), de CSP staat geen Google-lettertypes meer toe, en de privacyverklaring
  noemt Google alleen nog voor video's.
- **MIDDEL — teksten liepen achter op rollen, inbox en patiëntkant (2026-11-07).** Teamleden (naam,
  e-mail, rol), "afgehandeld door" en "in dossier" bij een kaart, het akkoord met naam, de wachtrij
  op de telefoon van de patiënt, de cookie `fp1` van de oude app en de wis-knoppen stonden niet in
  de privacyverklaring. De verwerkersovereenkomst noemde nog alleen het praktijkwachtwoord; de
  voorwaarden zeiden "deel de toegang met mensen van je praktijk". OPGELOST: privacyverklaring,
  verwerkersovereenkomst (art. 5) en voorwaarden bijgewerkt; `VWO_VERSIE` naar 2026-11-07 en
  `AV_VERSIE` naar 2026-11-07-2, met regels in `AKKOORD_WIJZIGINGEN`, zodat een beheerder in de app
  ziet wat er veranderde en opnieuw akkoord gaat. Railway bewaart logs 7 dagen (Hobby) of 30 dagen
  (Pro) (docs.railway.com/observability/logs); de tekst zegt "hooguit 30 dagen".
- **MIDDEL — "In de praktijk" bewaarde een volledige naam (art. 5 lid 1 c AVG).** OPGELOST
  2026-11-07: de knop stelt nu ook een roepnaam voor ("Henk V."), net als printen met QR.
- **MIDDEL — geen knop om de app-opslag te wissen; voorwaarden niet geaccepteerd en niet gelinkt
  in de app.** OPGELOST 2026-11-07 (PR #67, #69 en deze ronde): "Wis Fysiplan van dit apparaat" in
  het praktijkslot en in Help, "Wis deze kaart van mijn telefoon" op de patiëntkaart, één akkoord
  voor voorwaarden en verwerkersovereenkomst met versie, tijd en wie, en Help linkt `/voorwaarden`.

- **MIDDEL — privacyverklaring miste verplichte onderdelen van art. 13 AVG en een eerlijke versiedatum.**
  Alleen inzien/verbeteren/wissen stond erin; beperken, bezwaar en meenemen (art. 13 lid 2 b),
  "geen geautomatiseerde besluiten" (lid 2 f), of verstrekken verplicht is (lid 2 e) en de
  antwoordtermijn van een maand (art. 12 lid 3) ontbraken. De versiedatum kwam van de
  verwerkersovereenkomst en bleef op 2 november staan, terwijl de tekst op 6 en 7 november veranderde.
  De foutlog schreef bij een serverfout de volledige URL weg, met kaartlink (`/k/<id>`, `?id=`), naar
  de logs van Railway. OPGELOST 2026-11-07: rechten als lijst in B1-taal, termijn, geen
  geautomatiseerde besluiten, wat nodig is voor de proef, alinea "Foutlog", een samenvatting
  "In het kort" bovenaan (B1), `PRIVACY_VERSIE` los van `VWO_VERSIE` (geen nieuw akkoord nodig),
  en `logPad()` haalt query en kaart-/opname-id's uit de foutlog. Bron: AVG art. 12 en 13
  (eur-lex.europa.eu, Verordening 2016/679); AP, "Privacyverklaring". Test: `npm run test:privacy`.

- **MIDDEL — Mollie niet genoemd terwijl online betalen kan (art. 13 lid 1 e AVG; art. 6:234 BW).**
  Met `MOLLIE_API_KEY` (PR #57) gaan naam of praktijknaam, e-mail en bedrag naar Mollie, maar de
  privacyverklaring noemde Mollie niet en de voorwaarden zeiden "We vragen geen betaalgegevens".
  OPGELOST 2026-11-07: zodra de sleutel staat, toont `/privacy` een regel "Betaling" (wat, waarvoor,
  hoe lang: zolang klant, daarna 7 jaar fiscale bewaarplicht, art. 52 AWR) en een alinea over
  Mollie B.V. als zelfstandig verantwoordelijke; zonder sleutel staat Mollie er niet. Voorwaarden
  (versie 2026-11-07) beschrijven de eerste maand vooraf via Mollie en de machtiging. Het betaalblok
  linkt voorwaarden en privacy, en de server bewaart bij de betaling welke voorwaardenversie de
  praktijk zag (`betaling.av`). Mollie is geen subverwerker (geen patiëntgegevens), dus de
  subverwerkerslijst en de verwerkersovereenkomst veranderen niet. Test: `scripts/test-abonnement-mollie.mjs`.

- **MIDDEL — seintjes, "te zwaar" en berichten verdwenen spoorloos (WGBO).** Een seintje werd
  gewist zodra de therapeut het afhandelde of beantwoordde, een bericht zodra de patiënt het
  wegtikte, een "te zwaar"-melding bij afhandelen. "Kopieer voor dossier" nam ze niet mee, en ze
  stonden nergens anders. Voor de verslaglegging (art. 7:454 BW: gegevens over de gezondheid en
  de uitgevoerde verrichtingen, voor zover nodig voor goede hulpverlening; KNGF-richtlijn
  Fysiotherapeutische verslaglegging) hoort een gemelde pijntoename en het antwoord van de
  therapeut in het dossier van de praktijk. OPGELOST 2026-11-07: de server houdt per kaart een
  contactlogboek (hooguit 50 regels, zelfde bewaartermijn als de kaart, niet in de
  patiëntroute); de dossiertekst noemt het met datum en sluit af met "Bron: Fysiplan,
  overgenomen op …; de digitale kaart wordt na de bewaartermijn gewist". Verder gecontroleerd
  (h): landing, app, privacyverklaring, verwerkersovereenkomst en voorwaarden zeggen overal dat
  Fysiplan geen dossier is en dat de praktijk vastlegt in haar EPD; dat klopt met de code.
  Test: `scripts/test-dossier-contact.mjs` (in test:privacy en CI).

- **MIDDEL — gewiste kaart bleef offline op de telefoon van de patiënt staan.** De service
  worker hield de kopie van `/api/kaart?id=…` (roepnaam, oefeningen, pijnscores) en `/k/<id>`
  na wissen of verlopen; offline toonde de telefoon hem nog, ondanks "verdwijnt vanzelf".
  OPGELOST 2026-11-06: bij 404/410 wist de werker alles van die kaart uit de cache en de kaart
  wist haar eigen vinkjes in localStorage. Privacyverklaring kreeg een eerlijke sectie "Cookies
  en opslag op je apparaat" (de oude zin "onthoudt alleen je taal, je vinkjes en de
  lettergrootte" was onvolledig). Test: `scripts/test-kaart-weg.mjs` (in test:privacy en CI).
- **HOOG — praktijk kon niet alles exporteren of wissen (art. 15/17/20, art. 28 lid 3 g AVG).**
  OPGELOST 2026-11-06: scriptloze pagina `/v2/gegevens` (praktijknaam + wachtwoord, zelfde
  inlogrem en audit). Download = alles van de praktijk als JSON zonder wachtwoordhashes;
  wissen (met getypte bevestiging WISSEN) haalt kaarten met video's, eigen oefeningen met
  foto's, sjablonen, profiel met logo, account, sessies en de logboekregels met de
  praktijknaam weg. Gelinkt vanuit privacyverklaring, verwerkersovereenkomst (art. 8 en 10)
  en voorwaarden (art. 5). Test: `scripts/test-praktijkgegevens.mjs` (in `npm run test:privacy` en CI).
- **HOOG — geen algemene voorwaarden voor proef en abonnement.** OPGELOST 2026-11-06:
  concept op `/voorwaarden` (scriptloos, zelfde sjabloon als `/privacy`), gelinkt vanuit
  landing-voet, proefaanmelding en de voet van de juridische pagina's. Zakelijke keuzes staan
  als invulplek in de tekst en in `docs/mensenwerk.md`. Test: `npm run test:privacy`.
