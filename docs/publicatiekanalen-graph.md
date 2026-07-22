# FysiPlan publicatiekanalen

De publieke root is voortaan een stabiel productiekanaal. Nieuwe content wordt eerst en uitsluitend in v2 gepubliceerd. De scheiding wordt tijdens elke build door `scripts/publication-channel-graph.mjs` gecontroleerd.

```mermaid
flowchart LR
  L["215 historische lijntekeningen"] --> V1["v1-catalogus"] --> R["fysiplan.nl/"]
  V1 --> M["fysiplan.nl/admin88"]
  L --> V2["v2-broncatalogus: 500"]
  N["285 geselecteerde uitbreidingen"] --> D["Quota-bewuste Runway beeld-DAG"] --> Q["Beeld-QA + checkpoint"] --> V2
  V2 --> A["Alleen bestaande kaartbestanden publiceren"] --> U["fysiplan.nl/v2/app"]
  P["Nieuwe functies, foto's en video's"] --> U
  G["Publicatiegraph"] --> C1["Gate: v1 exact 215 en lijntekening"]
  G --> C2["Gate: v2 exact 500 bronitems"]
  G --> C3["Gate: routes en /v2/assets gescheiden"]
  G --> C4["Gate: alle generatoren schrijven alleen v2"]
```

## Contract

- `/oefeningen.json` levert de 215 historische oefeningen aan zowel `/` als `/admin88` en verwijst alleen naar het lijntekeningveld `img`.
- `/v2/oefeningen.json` levert de v2-catalogus met beheerwijzigingen, zoekmetadata, video's en alleen kaartbeelden die werkelijk op schijf staan.
- v2-kaartbeelden hebben in de browser een `/v2/images/...`-URL. De fysieke beeldmap wordt gedeeld om de 215 bestaande kaarten niet te dupliceren.
- `public/oefeningen.json` is read-only voor de productiegraphs.
- De top-500-, Runway- en achtergrondgraphs lezen en schrijven uitsluitend `public/oefeningen-v2.json`.
- Ontbrekende uitbreidingsbeelden blijven onzichtbaar tot hun eigen DAG-tak volledig is gepubliceerd; hierdoor ontstaan nooit kapotte oefenkaarten op v2.

Controleer het contract met:

```bash
npm run channels:check
```
