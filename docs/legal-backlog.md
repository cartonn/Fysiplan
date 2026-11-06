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
| (e) rechten van betrokkenen: inzien, exporteren, wissen | nooit apart |
| (f) cookies en lokale opslag | nooit apart |
| (g) MDR en AI-verordening | 2026-11-02 (PR #40) |
| (h) WGBO en KNGF-beroepsregels | nooit apart |
| (i) begrijpelijkheid (B1) | nooit apart |

Volgende run: (e) rechten van betrokkenen, daarna (f) en (h).

## Open

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

- **HOOG — geen algemene voorwaarden voor proef en abonnement.** OPGELOST 2026-11-06:
  concept op `/voorwaarden` (scriptloos, zelfde sjabloon als `/privacy`), gelinkt vanuit
  landing-voet, proefaanmelding en de voet van de juridische pagina's. Zakelijke keuzes staan
  als invulplek in de tekst en in `docs/mensenwerk.md`. Test: `npm run test:privacy`.
