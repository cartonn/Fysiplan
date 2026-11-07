# Legal-backlog (V2)

Bijgehouden door de legal-routine (elke 4 uur). Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
Alle juridische teksten zijn concept tot een jurist ze toetst; niets hier is juridisch advies.
Zakelijke en juridische beslissingen staan onder "Voor Ahmed" in `docs/mensenwerk.md`.

## Gebied → laatst gecontroleerd

| Gebied | Laatst gecontroleerd |
|---|---|
| (a) privacyverklaring (art. 13/14 AVG) | 2026-11-07 (rechten, verplicht verstrekken, foutlog) |
| (b) verwerkersovereenkomst (art. 28 AVG) + subverwerkers | 2026-11-02 (PR #40) |
| (c) algemene voorwaarden | 2026-11-06 (concept gebouwd, deze run) |
| (d) code tegen tekst | 2026-11-07 (Mollie/betalen), steekproef 2026-11-06 |
| (e) rechten van betrokkenen: inzien, exporteren, wissen | 2026-11-06 (PR praktijkgegevens, deze run) |
| (f) cookies en lokale opslag | 2026-11-06 (PR opslag, deze run) |
| (g) MDR en AI-verordening | 2026-11-02 (PR #40) |
| (h) WGBO en KNGF-beroepsregels | 2026-11-07 (contactlogboek in de dossiertekst) |
| (i) begrijpelijkheid (B1) | 2026-11-07 (privacyverklaring: "In het kort"; VWO en voorwaarden nog niet) |

Volgende run: (b) verwerkersovereenkomst, daarna (g) MDR/AI-verordening en (i) B1 voor VWO en voorwaarden.
PR #41 staat sinds 2026-11-02 open op `public/index.html`; de punten die daarop wachten blijven liggen.

## Open

- **MIDDEL — "In de praktijk" in Kaarten bewaart een volledige naam zonder roepnaamvoorstel**
  (sweep 2026-11-06, Sanne). Print met QR en automatisch delen stellen "Henk V." voor; de knop
  `k_save_srv` in public/index.html niet. Gevolg: "Henk de Vries" staat op de server, in het
  overzicht en in de CSV (dataminimalisatie, art. 5 lid 1 c AVG). Ook: de voorbeeldkaart heeft
  `cn.value='Voorbeeldpatiënt'` als echte waarde; wie erin typt, deelt "VoorbeeldpRiaatiënt", en
  elke naamswijziging na beveiligen maakt een nieuwe gedeelde kaart (3 kaarten met dezelfde oefeningen).
- **MIDDEL — therapeut kan de app-opslag op een apparaat niet met één knop wissen (2026-11-06).**
  De app bewaart in de browser de kaarten met naam, leeftijd en casus (`fysiplan_kaarten`,
  `fysiplan_state`), notities, eigen oefeningen en foto's (IndexedDB `fysiplan`) en de
  praktijksessie (`fp_praksessie`). Dat staat nu in de privacyverklaring (#opslag) met het advies
  een eigen apparaat met schermslot te gebruiken. Een knop "Wis Fysiplan van dit apparaat" (bij
  uitloggen of in Help) hoort in `public/index.html`; wacht tot PR #41 daar gemerged of gesloten is.
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
- **MIDDEL — app-voet linkt de voorwaarden nog niet.** De Help-tekst "Privacy en bewaren"
  in `public/index.html` linkt privacy en verwerkersovereenkomst, maar niet `/voorwaarden`.
  Bewust overgeslagen omdat PR #41 (beveiligen-meldingen) nog open staat op `public/index.html`.
  Toevoegen zodra #41 gemerged of gesloten is.
- **MIDDEL — voorwaarden worden bij de proef alleen genoemd, niet geaccepteerd.** Voor een
  zakelijke klant volstaat terhandstelling vóór of bij het sluiten (art. 6:233-234 BW), en de
  proefpagina linkt ze nu. Bij het betaalde abonnement hoort een expliciet akkoord met versie
  en tijdstip (zoals bij de verwerkersovereenkomst, `AV_VERSIE` in server.js). Bouwen zodra er
  een betaalstroom is (zie mensenwerk, routine praktijken).
- **LAAG — steekproef (d), 2026-11-06:** avatarvideo's uit PR #42 staan op de eigen server
  (geen nieuwe derde partij), dus de subverwerkerslijst klopt nog. Volledige controle (d) van
  wissen van opnames, eigen video's en logs volgt in een latere run.

- **LAAG — bewaartermijn van de Railway-logs onbekend (2026-11-07).** De foutlog bevat sinds deze
  run geen kaartlink meer, wel het moment en de foutmelding. Hoe lang Railway logs bewaart, staat
  niet in de code; de privacyverklaring zegt daarom alleen "bij Railway". Bij de volgende (b)-run
  nagaan in de Railway-documentatie en de termijn in de tekst zetten.

## Opgelost

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
