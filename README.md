# Fysiplan

Fysiplan vervangt een eenvoudig, oud fysio-programma waarmee trainingskaarten worden
gemaakt. Je kiest oefeningen met plaatjes en print één A4-trainingskaart (of slaat 'm op als
PDF), met een monitoring-grid voor serie / herhaling / weerstand over meerdere data.

Live Railway URL: https://fysiplan-production.up.railway.app

## Wat de app doet

- Oefeningenbibliotheek (82 oefeningen), filterbaar op groep (bovenste / onderste extremiteit /
  romp / divers) + zoeken.
- Twee staps: klik een oefening → kies één of meer plaatjes → ze komen genummerd op de A4.
- Eén A4-trainingskaart met cliëntvelden (Naam, Leeftijd, max. HF, Trainingszone) en
  monitoring-grid.
- Printen + opslaan als PDF (via het printvenster van de browser).
- Eigen oefening toevoegen met een eigen plaatje (blijft lokaal bewaard via `localStorage`).

## Structuur

- `public/index.html` — de volledige front-end app (zelfstandig: HTML + CSS + JS + data).
- `server.js` — minimale Node-server (geen dependencies): serveert `public/` en `/health`.
- `scripts/build.js` — schrijft buildmetadata naar `dist/build-info.json`.
- `railway.json` — Railway build/deploy + healthcheck op `/health`.

## Scripts

- `npm run build` — schrijft buildmetadata naar `dist/build-info.json`.
- `npm run start` — start de webserver op `PORT` (Railway) of lokaal op `3000`.

Lokaal draaien: `npm run build && npm run start`, daarna http://localhost:3000

## Eigen oefeningenlijst uploaden (Carla)

Via de knop **"Plaatjes uploaden"** in de app kan de praktijk haar eigen lijst uploaden. Dat
bestand (.txt/.csv) **wordt de oefeningenlijst** en vervangt de standaard 82 placeholders. Format:
oefeningnaam, daaronder de bestandsnamen van de bijbehorende plaatjes, lege regel, volgende oefening.
De plaatjes kunnen in dezelfde upload mee (worden lokaal in de browser bewaard via IndexedDB).
Met de knop **"Standaardlijst"** keer je terug naar de standaardlijst.

## De echte oefening-plaatjes (alternatief: in de repo)

De tekeningen in de app zijn nu nette stand-ins. De echte plaatjes vervangen ze later **zonder
codewijziging** — gekoppeld op oefeningnaam:

1. Zet de afbeeldingen (PNG/JPG) in `public/images/`.
2. Koppel ze in `public/oefening-plaatjes.json` (sleutel = oefeningnaam). Drie vormen mogelijk,
   zie `public/oefening-plaatjes.VOORBEELD.json` en `public/images/LEESMIJ.txt`:
   - één plaatje: `"Squat (kniebuiging)": "squat.png"`
   - meerdere: `"Lunge (uitval)": ["lunge-start.png", "lunge-uitvoering.png"]`
   - met labels: `"Glute bridge": { "start": "...", "uitvoering": "..." }`
3. Opslaan + pushen. De placeholders verdwijnen automatisch voor elke gekoppelde oefening.

Lever je een lijst aan met "oefeningnaam + bestandsnaam", dan is `oefening-plaatjes.json` in één
keer te vullen.

### Automatisch inlezen van Carla's bestand

Carla levert een bestand aan in dit formaat (oefeningnaam, daaronder de plaatjes die erbij horen,
lege regel, volgende oefening):

```
Squat (kniebuiging)
squat-start.png
squat-uitvoering.png

Lunge (uitval)
lunge.png
```

Het script `scripts/import-plaatjes.mjs` leest dit in, splitst het per oefening en bouwt het
manifest. Het meldt ook welke namen niet matchen met de app (met een suggestie):

```
node scripts/import-plaatjes.mjs <bestand>           # dry-run: alleen rapport
node scripts/import-plaatjes.mjs <bestand> --write   # schrijft public/oefening-plaatjes.json
```

Daarna de bijbehorende afbeeldingen in `public/images/` zetten en pushen.

## Data & privacy

Alle gegevens (cliëntvelden, eigen oefeningen) blijven nu **lokaal in de browser**
(`localStorage`); er gaat niets naar een server. Voor een toekomstige gedeelde/multi-praktijk
versie met centrale opslag moeten AVG / NEN 7510 worden ingericht (nu buiten scope).
