# Legal-backlog (V2)

Bijgehouden door de legal-routine (elke 4 uur). Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
Alle juridische teksten zijn concept tot een jurist ze toetst; niets hier is juridisch advies.
Zakelijke en juridische beslissingen staan onder "Voor Ahmed" in `docs/mensenwerk.md`.

## Gebied → laatst gecontroleerd

| Gebied | Laatst gecontroleerd |
|---|---|
| (a) privacyverklaring (art. 13/14 AVG) | 2026-11-02 (PR #40), kort herlezen 2026-11-06 |
| (b) verwerkersovereenkomst (art. 28 AVG) + subverwerkers | 2026-11-02 (PR #40) |
| (c) algemene voorwaarden | 2026-11-06 (concept gebouwd, deze run) |
| (d) code tegen tekst | 2026-11-02 (PR #40), steekproef 2026-11-06 |
| (e) rechten van betrokkenen: inzien, exporteren, wissen | 2026-11-06 (PR praktijkgegevens, deze run) |
| (f) cookies en lokale opslag | nooit apart |
| (g) MDR en AI-verordening | 2026-11-02 (PR #40) |
| (h) WGBO en KNGF-beroepsregels | nooit apart |
| (i) begrijpelijkheid (B1) | nooit apart |

Volgende run: (f) cookies en lokale opslag, daarna (h) WGBO en (i) B1.

## Open

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

## Opgelost

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
