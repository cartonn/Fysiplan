# FysiPlan oefenbeelden-graph

De 215 beelden worden niet als één oncontroleerbare batch gemaakt. Elke oefening is een eigen tak in een gerichte acyclische graph (DAG). Daardoor kan een mislukte generatie worden herhaald zonder geslaagde beelden opnieuw te betalen of te overschrijven.

```mermaid
flowchart LR
  A["Vaste FysiPlan-avatar"] --> G1
  S1["Originele oefening 1 + individuele instructie"] --> U1["Bronaudit en compositiekeuze"] --> N1["Referentie normaliseren"] --> G1["Posepaar genereren"] --> C1["800×1200 + vaste branding"] --> Q1["Kaart- en print-QA"] --> R1["Klaar voor fysio-review"] --> P1["Concept publiceren"]
  S2["Originele oefening 2 + individuele instructie"] --> U2["Bronaudit en compositiekeuze"] --> N2["Referentie normaliseren"] --> G2["Posepaar genereren"] --> C2["800×1200 + vaste branding"] --> Q2["Kaart- en print-QA"] --> R2["Klaar voor fysio-review"] --> P2["Concept publiceren"]
  A --> G2
  SN["… oefening 215"] --> UN["Bronaudit en compositiekeuze"] --> NN["Referentie normaliseren"] --> GN["Posepaar genereren"] --> CN["800×1200 + vaste branding"] --> QN["Kaart- en print-QA"] --> RN["Klaar voor fysio-review"] --> PN["Concept publiceren"]
  A --> GN
```

## Beeldspecificatie

- Eén herkenbare vrouwelijke avatar, lichtgrijs shirt, antracietkleurige broek en lichte sportschoenen.
- Een helder witte naadloze achtergrond en witte vloer besparen printerinkt; zachte contactschaduw en contourlicht houden het lichtgrijze shirt ook in zwart-wit duidelijk zichtbaar.
- Begin- en eindhouding in één doorlopende studio zonder scheidingslijn.
- Staande bewegingen staan naast elkaar; liggende, horizontale en grote apparaatoefeningen boven elkaar zodat de actieve keten groter in het portretvlak past.
- Camerastand is licht gedraaid, behalve wanneer een helder zijaanzicht klinisch noodzakelijk is.
- FysiPlan-logo en naam worden na generatie exact linksboven geplaatst; het model mag zelf geen tekst of logo tekenen.
- De individuele Nederlandse instructie is leidend. De oorspronkelijke oefeningafbeelding is een secundaire posehint en wordt genegeerd wanneer hij met de tekst botst; brede opnamebatchvelden worden bewust niet gebruikt.
- Technische QA controleert exact 2:3-formaat, bestandsgrootte, helderheid, zwart-witcontrast en een eventuele harde middenscheiding.
- De output blijft `awaiting-physiotherapist-review` totdat beginhouding, eindhouding, materiaal, gewrichtsstand en bewegingsrichting klinisch zijn beoordeeld.

## Modelrouting en budget

Eenvoudige staande bewegingen gebruiken `seedream5_lite` (4 credits), omdat de goedkopere Gen-4-route in de representatieve proef te vaak zonder inhoudelijke reden uitviel. Instructiegevoelige vloer- en yogaposes gebruiken `gpt_image_2` op lage renderkwaliteit (1 credit), omdat daar correcte pose-instructies belangrijker zijn dan extra textuur. Oefeningen met machines, TRX, Bosu of ander lastig te reconstrueren materiaal gebruiken hetzelfde model op mediumkwaliteit (5 credits). De graph gebruikt maximaal vier totale taken, met een semaphore van twee gelijktijdige generaties per model overeenkomstig de huidige Runway-accountlimieten.

```bash
npm run images:graph
node --env-file=.env scripts/exercise-image-graph.mjs run --execute --orders 1,49,63,98,127,153,176,189 --budget-credits 40
node --env-file=.env scripts/exercise-image-graph.mjs run --execute --publish-concepts --budget-credits 750 --quiet
node --env-file=.env scripts/exercise-image-graph.mjs run --execute --publish-concepts --seam-recovery --orders 3,9 --budget-credits 8
node --env-file=.env scripts/exercise-image-graph.mjs run --execute --publish-concepts --seam-recovery --force-gpt-low --orders 2,6 --budget-credits 2
node --env-file=.env scripts/exercise-image-graph.mjs run --execute --publish-concepts --seam-recovery --force-gemini-flash --orders 68,69,70 --budget-credits 15
```
