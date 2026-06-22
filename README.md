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

## De echte oefening-plaatjes

De tekeningen in de app zijn nu nette stand-ins. De echte plaatjes uit het oude programma
vervangen ze later: dat is een content-wissel (afbeeldingen + verwijzingen), geen codewijziging.

## Data & privacy

Alle gegevens (cliëntvelden, eigen oefeningen) blijven nu **lokaal in de browser**
(`localStorage`); er gaat niets naar een server. Voor een toekomstige gedeelde/multi-praktijk
versie met centrale opslag moeten AVG / NEN 7510 worden ingericht (nu buiten scope).
