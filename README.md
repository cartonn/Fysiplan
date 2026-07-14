# Fysiplan

Fysiplan vervangt een eenvoudig, oud fysio-programma waarmee trainingskaarten worden
gemaakt. Je kiest oefeningen met plaatjes en print één A4-trainingskaart (of slaat 'm op als
PDF), met een monitoring-grid voor serie / herhaling / weerstand over meerdere data.

Live Railway URL: https://fysiplan-production.up.railway.app

## Wat de app doet

- Oefeningenbibliotheek met **echte oefening-plaatjes** (215 stuks, geleverd in de repo),
  gegroepeerd per categorie (Bovenste/Onderste extremiteit, Core, Cardio, Bosu, TRX, Yoga,
  Kettlebell, Foam roller, Speedladder) + zoeken. Deze lijst wordt door de **server** geleverd,
  dus **iedereen die de URL opent** ziet ze — op elk apparaat, zonder inloggen of upload.
  (Is `public/oefeningen.json` afwezig, dan valt de app terug op nette placeholder-tekeningen.)
- Klik een oefening en het bijbehorende plaatje komt direct genummerd op de A4.
- Eén A4-trainingskaart met cliëntvelden (Naam, Leeftijd, max. HF, Trainingszone) en
  monitoring-grid.
- Printen + opslaan als PDF (via het printvenster van de browser).
- Eigen oefening toevoegen met een eigen plaatje (blijft lokaal bewaard via `localStorage`).

## Structuur

- `public/index.html` — de volledige front-end app (zelfstandig: HTML + CSS + JS + data).
- `public/oefeningen.json` — de **server-bibliotheek**: lijst van `{naam, groep, img}` die de app bij
  het opstarten inleest, zodat de plaatjes voor iedereen (elk apparaat) beschikbaar zijn. Optioneel
  veld `ook` (lijst van extra categorieën) toont een oefening op meerdere plekken — zo staan de
  cardio-apparaten zowel onder **Apparaten** als onder **Cardio**.
- `public/images/` — de web-geoptimaliseerde JPEG's, per categorie in een submap.
- `server.js` — minimale Node-server (geen dependencies): serveert `public/` en `/health`.
- `scripts/build.js` — schrijft buildmetadata naar `dist/build-info.json`.
- `scripts/convert-images.mjs` — eenmalig hulpscript: zet zware BMP/PNG naar compacte JPEG's en
  (her)bouwt `public/oefeningen.json`. Zie "Nieuwe plaatjes toevoegen" hieronder.
- `scripts/normalize-image-visibility.py` — brengt lijnzwart, randscherpte en kleur per afbeelding
  op de zichtbaarheid van de biceps-referentie, gemeten op het 56×56-formaat van de keuzelijst,
  zonder afmetingen te wijzigen.
- `railway.json` — Railway build/deploy + healthcheck op `/health`.

## Scripts

- `npm run build` — schrijft buildmetadata naar `dist/build-info.json`.
- `npm run images:normalize` — normaliseert oefentekeningen naar de biceps-referentie
  (vereist Python + Pillow).
- `npm run start` — start de webserver op `PORT` (Railway) of lokaal op `3000`.

Lokaal draaien: `npm run build && npm run start`, daarna http://localhost:3000

## Eigen oefeningenlijst uploaden (Carla)

De oefeningen met plaatjes worden **standaard door de server geleverd** (zie `oefeningen.json`
hierboven), dus iedereen ziet dezelfde lijst. Wil één werkplek daarnaast toch een eigen,
afwijkende lijst gebruiken, dan kan dat via de knop **"Plaatjes uploaden"**: dat bestand
(.txt/.csv) **wordt de oefeningenlijst** en vervangt de server-lijst — maar alleen **lokaal in
die ene browser** (bewaard via IndexedDB). Format: oefeningnaam, daaronder de bestandsnamen van de
bijbehorende plaatjes, lege regel, volgende oefening. Met de knop **"Standaardlijst"** keer je
terug naar de gedeelde server-lijst.

## Praktijkprofielen en opgeslagen kaarten

- **Praktijken (gedeeld):** vul je op de A4 een praktijknaam + adres in, dan wordt dat profiel via
  `POST /api/praktijken` op de server bewaard (`praktijken.json`) en is het op elk apparaat te
  kiezen via het keuzemenu boven de praktijknaam. `GET /api/praktijken` levert de lijst.
- **Kaarten (lokaal):** via de knop **Kaarten** sla je de huidige kaart onder een naam op en open
  of verwijder je eerder opgeslagen kaarten. Kaarten bevatten cliëntgegevens en blijven daarom
  bewust **lokaal in de browser** (`localStorage`, sleutel `fysiplan_kaarten`). Oefeningen worden
  op naam bewaard, zodat een kaart blijft werken als de bibliotheek verandert.

## Beheer via /admin88

De gewone URL is voor het maken en printen van kaarten. Bibliotheekbeheer gebeurt op
**`/admin88`** (herkenbaar aan de "Beheer"-badge). Alleen daar zijn beschikbaar:

- **Oefening toevoegen** (naam + categorie + plaatje) — `POST /api/oefeningen`; het plaatje wordt
  in de browser verkleind naar max 900px en op de server bewaard onder `uploads/`. De categorie is
  een vrij veld met suggesties: een bestaande naam (ook bij ander hoofdlettergebruik) hergebruikt
  die categorie, een onbekende naam **maakt automatisch een nieuwe categorie** aan. Tijdens het
  typen van de oefeningnaam wordt een logische categorie voorgesteld (bv. "TRX …" → TRX).
- **Oefening hernoemen** (potloodje ✎) — `POST /api/hernoem` (`naam-wijzigingen.json`).
- **Categorie wijzigen** (pijltjes ⇄) — `POST /api/oefeningen/categorie`
  (`categorie-wijzigingen.json`): verplaats een oefening naar een andere categorie en/of toon hem
  op een 2e plek (het `ook`-veld).
- **Oefening verwijderen** (🗑) — `POST /api/oefeningen/verwijder`; basis-oefeningen komen in
  `oefeningen-verwijderd.json`, zelf toegevoegde worden echt verwijderd.
- **Plaatjes uploaden** (de lokale lijst-override) is ook alleen zichtbaar in beheer.

Elke beheeractie is **direct server-side** en dus meteen live op beide URL's — er is geen
synchronisatie, wachttijd of aparte deploy nodig. Het geserveerde `oefeningen.json` =
basisbestand + hernoemingen − verwijderd + toegevoegd. `/health` toont de tellers
(`hernoemd`, `toegevoegd`, `verwijderd`).

De mutatie-API's eisen een sleutel-header die alleen de beheerpagina meestuurt
(instelbaar via `ADMIN_KEY`, standaard `admin88`). Let op: dit is afscherming-door-verhulling —
wie de beheer-URL kent, kan beheren. Echte authenticatie is bewust buiten scope gehouden.

> **Blijvend bewaren op Railway:** de containerschijf wordt bij elke redeploy gewist. Voeg in
> Railway een **Volume** toe met mount path `/data` (service → rechtsklik → Attach volume) —
> de server gebruikt die map dan automatisch en de naamwijzigingen overleven elke deploy.
> Zonder volume blijven wijzigingen bewaard tot de eerstvolgende redeploy/herstart.

## Nieuwe plaatjes toevoegen (in de repo)

De 215 oefening-plaatjes staan in `public/images/` (per categorie in een submap) en zijn
gekoppeld via `public/oefeningen.json`. Zo voeg je er nieuwe toe zodat **iedereen** ze via de URL
krijgt:

1. Zet de nieuwe afbeeldingen (elk formaat: BMP/PNG/JPG) in een submap onder `public/images/`.
   De **mapnaam bepaalt de categorie**, de **bestandsnaam wordt de oefeningnaam**.
2. Draai het conversiescript. Het zet zware BMP/PNG om naar compacte JPEG's, verwijdert de
   originele bronmappen en (her)bouwt `public/oefeningen.json`:

   ```
   npm install --no-save jimp        # eenmalig, alleen voor dit script (staat niet in deps)
   node scripts/convert-images.mjs
   ```

3. Normaliseer daarna de lijnsterkte van nieuwe en bestaande tekeningen:

   ```
   python3 -m pip install Pillow   # eenmalig
   npm run images:normalize
   ```

4. Controleer de app lokaal (`npm run build && npm run start`), dan committen + pushen. Railway
   deployt automatisch en de nieuwe oefeningen staan live voor iedereen.

> De categorie-namen en hun volgorde staan bovenin `scripts/convert-images.mjs` (de `CAT`-tabel);
> pas die aan als je een map anders wilt labelen.

## Data & privacy

De **oefening-plaatjes** staan op de server en zijn dus gedeeld/openbaar via de URL — dat is de
bedoeling (het zijn geen persoonsgegevens). Alle **cliëntgegevens** (naam, leeftijd, kaart-inhoud,
eigen oefeningen) blijven **lokaal in de browser** (`localStorage`/IndexedDB); daarvan gaat niets
naar een server. Voor een toekomstige gedeelde/multi-praktijk versie met centrale opslag van
cliëntdata moeten AVG / NEN 7510 worden ingericht (nu buiten scope).
