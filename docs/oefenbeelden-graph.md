# FysiPlan oefenbeelden-graph

De 500 beelden worden niet als één oncontroleerbare batch gemaakt. Elke oefening is een eigen tak in een gerichte acyclische graph (DAG). Daardoor kan een mislukte generatie worden herhaald zonder geslaagde beelden opnieuw te betalen of te overschrijven.

De graph publiceert uitsluitend naar `public/oefeningen-v2.json`. De historische lijntekeningencatalogus in `public/oefeningen.json` is geen node in deze productiegraaf en kan daardoor niet door een dagelijkse Runway-run worden gewijzigd.

```mermaid
flowchart LR
  A["Vaste FysiPlan-avatar"] --> G1
  S1["Originele oefening 1 + individuele instructie"] --> U1["Bronaudit en compositiekeuze"] --> N1["Referentie normaliseren"] --> G1["Posepaar genereren"] --> C1["800×1200 + vaste branding"] --> B1["BiRefNet: studio en schaduw verwijderen"] --> W1["#FFFFFF-gate"] --> Q1["Kaart- en print-QA"] --> R1["Klaar voor fysio-review"] --> P1["Concept publiceren"]
  S2["Originele oefening 2 + individuele instructie"] --> U2["Bronaudit en compositiekeuze"] --> N2["Referentie normaliseren"] --> G2["Posepaar genereren"] --> C2["800×1200 + vaste branding"] --> B2["BiRefNet: studio en schaduw verwijderen"] --> W2["#FFFFFF-gate"] --> Q2["Kaart- en print-QA"] --> R2["Klaar voor fysio-review"] --> P2["Concept publiceren"]
  A --> G2
  SN["… oefening 500"] --> UN["Bronaudit en compositiekeuze"] --> NN["Referentie normaliseren"] --> GN["Posepaar genereren"] --> CN["800×1200 + vaste branding"] --> BN["BiRefNet: studio en schaduw verwijderen"] --> WN["#FFFFFF-gate"] --> QN["Kaart- en print-QA"] --> RN["Klaar voor fysio-review"] --> PN["Concept publiceren"]
  A --> GN
```

## Beeldspecificatie

- Eén herkenbare vrouwelijke avatar, lichtgrijs shirt, antracietkleurige broek en lichte sportschoenen.
- Eén volledig effen `#FFFFFF`-achtergrond zonder zichtbare vloer, grijsverloop of contactschaduw bespaart printerinkt; contourlicht op de persoon houdt het lichtgrijze shirt ook in zwart-wit duidelijk zichtbaar.
- Begin- en eindhouding in één doorlopende studio zonder scheidingslijn.
- Staande bewegingen staan naast elkaar; liggende, horizontale en grote apparaatoefeningen boven elkaar zodat de actieve keten groter in het portretvlak past.
- Camerastand is licht gedraaid, behalve wanneer een helder zijaanzicht klinisch noodzakelijk is.
- FysiPlan-logo en naam worden na generatie exact linksboven geplaatst; het model mag zelf geen tekst of logo tekenen.
- Elke gepubliceerde beeldgeneratie krijgt een nieuw versienummer in de bestandsnaam, zodat een browser nooit een oudere kaart uit de 24-uurs afbeeldingscache kan tonen.
- De individuele Nederlandse instructie is leidend. De oorspronkelijke oefeningafbeelding is een secundaire posehint en wordt genegeerd wanneer hij met de tekst botst; brede opnamebatchvelden worden bewust niet gebruikt.
- Een afzonderlijke graph-gate eist een neutrale randmediaan van minimaal 245/255; een grijze studio kan daardoor niet ongemerkt worden gepubliceerd.
- Na generatie verwijdert `scripts/normalize-exercise-backgrounds.py` lokaal de studio en schaduwen met BiRefNet, zet de vrijstaande persoon en benodigde apparatuur op `#FFFFFF` en schrijft een meetrapport voor alle 215 kaarten.
- Technische QA controleert exact 2:3-formaat, bestandsgrootte, achtergrondwit, helderheid, zwart-witcontrast en een eventuele harde middenscheiding.
- De output blijft `awaiting-physiotherapist-review` totdat beginhouding, eindhouding, materiaal, gewrichtsstand en bewegingsrichting klinisch zijn beoordeeld.

## Eén posepaar, twee V2-weergaven

Iedere gepubliceerde V2-kleurkaart krijgt lokaal en zonder extra Runway-kosten een exact gekoppelde lijnvariant. De fysiotherapeut wisselt met één toggle tussen beide weergaven voor de kaart en PDF; de digitale QR-ervaring blijft altijd in kleur.

```mermaid
flowchart LR
  C["Goedgekeurde kleurkaart 800×1200"] --> E["Contourdetectie op hetzelfde pixelvlak"]
  E --> B["Harde binaire omzetting"]
  B --> Q["QA: uitsluitend #000000 en #FFFFFF"]
  Q --> L["Lijnkaart 800×1200"]
  C --> P["V2-kleurpad"]
  L --> P2["V2-lijnpad"]
  P --> T["Therapeut-toggle"]
  P2 --> T
  P --> QR["QR en digitale ervaring"]
```

De graph in `scripts/v2-line-art-graph.mjs` bewaakt de 1-op-1-koppeling. De start- en eindhouding, uitsnede, apparatuur en branding kunnen niet verschuiven, omdat de lijnvariant rechtstreeks uit de gepubliceerde kleurkaart wordt afgeleid. PNG wordt bewust gebruikt: daardoor blijven alle pixels exact zwart of wit en kunnen JPEG-compressie, grijze antialiasing en schaduw niet terugkomen.

```bash
# Alleen inventariseren; schrijft niets.
npm run images:line-pairs:status

# Ontbrekende lijnvarianten genereren en V2-koppelingen bijwerken.
npm run images:line-pairs:generate
```

## Modelrouting en budget

Eenvoudige staande bewegingen gebruiken standaard `seedream5_lite` (4 credits). Instructiegevoelige vloer- en yogaposes gebruiken `gpt_image_2`. Oefeningen met machines, TRX, Bosu of ander lastig materiaal gebruiken hetzelfde model op mediumkwaliteit. Voor de uitbreiding van 215 naar 500 oefeningen wordt bewust overal `gpt_image_2` op lage kwaliteit (1 credit) gebruikt: zo blijft de avatar- en kaartstijl gelijk aan de goedgekeurde proefbeelden.

## Rollend Runway-venster

`scripts/runway-image-batch.mjs` bestuurt de beeld-DAG zonder zelf een tweede productiepijplijn te vormen. De controller selecteert alleen kaartbestanden die werkelijk ontbreken, telt geslaagde GPT Image 2-generaties uit de laatste 24 uur en start per run maximaal tien nieuwe aanvragen. De lokale veiligheidsgrens is 190 aanvragen in plaats van Runways gepubliceerde maximum van 200; tien plaatsen blijven beschikbaar voor controles of handmatige herstelruns.

De generatie draait sequentieel. Zodra Runway een quota-`429` teruggeeft, wordt die node als `deferred-quota` opgeslagen en stopt de hele run vóór een volgende betaalde aanvraag. Een volgende run pakt dezelfde node weer op. Geslaagde nodes, downloads, composities en QA-resultaten zijn checkpoints en worden niet opnieuw betaald.

```bash
# Alleen planning en actuele voortgang; gebruikt geen credits.
npm run images:runway-batch
npm run images:runway-batch:status

# Eén begrensde, hervatbare batch.
node --env-file=.env scripts/runway-image-batch.mjs run --execute
```

```bash
npm run images:graph
node --env-file=.env scripts/exercise-image-graph.mjs run --execute --orders 1,49,63,98,127,153,176,189 --budget-credits 40
node --env-file=.env scripts/exercise-image-graph.mjs run --execute --publish-concepts --budget-credits 750 --quiet
node --env-file=.env scripts/exercise-image-graph.mjs run --execute --publish-concepts --seam-recovery --orders 3,9 --budget-credits 8
node --env-file=.env scripts/exercise-image-graph.mjs run --execute --publish-concepts --seam-recovery --force-gpt-low --orders 2,6 --budget-credits 2
node --env-file=.env scripts/exercise-image-graph.mjs run --execute --publish-concepts --seam-recovery --force-gemini-flash --orders 68,69,70 --budget-credits 15

# Eenmalige lokale setup; het model wordt buiten Git in image-work bewaard.
python3 -m venv image-work/background-env
image-work/background-env/bin/pip install -r scripts/requirements-exercise-backgrounds.txt
image-work/background-env/bin/python scripts/normalize-exercise-backgrounds.py \
  --model-home image-work/rembg-models \
  --output-root image-work/exact-white-v7
```

## Lijn-illustraties in vaste stijl (nátekenen)

De deterministische contourdetectie is gratis en pose-exact, maar tekent gezichten
schetsmatig. Daarom bestaat er een tweede, generatieve stap die elke goedgekeurde
kleurkaart via Runway (`gpt_image_2`, referentie = de kleurkaart zelf) volledig
nátekent in één vaste illustratiestijl: rustige contourlijnen van één gewicht, een
eenvoudig vriendelijk gezicht, spaarzame plooilijnen, geen arcering of grijstinten.
Na generatie volgt dezelfde harde poort als altijd: 800×1200, Fysiplan-branding
linksboven, binarisatie naar uitsluitend `#000000` op `#FFFFFF`, en de bestaande QA.

```mermaid
flowchart LR
  C["Goedgekeurde kleurkaart"] --> G["Runway: nátekenen in vaste stijl"]
  G --> F["Logo + harde binarisatie"] --> Q["QA: puur zwart-wit"] --> V["Vervangt -line-v1.png"]
  V --> R["content/lijn-illustraties.json (register)"]
```

Het register bewaart per oefening de `colorSha` van de kleurkaart waarop de
illustratie is gebaseerd. `scripts/v2-line-art-graph.mjs` slaat geregistreerde
illustraties over — ook met `--force` — zolang die sha klopt; wijzigt de
kleurkaart, dan vervalt de bescherming vanzelf en herstelt de deterministische
lijn zich tot er opnieuw geïllustreerd is.

```bash
# Inventariseren (schrijft niets, geen API nodig)
npm run images:lijn-illustraties

# Batch genereren (5 credits per kaart; herstart veilig, batchgrootte instelbaar)
RUNWAYML_API_SECRET='...' npm run images:lijn-illustraties:generate -- --max-batch 6

# Eén oefening gericht (bijvoorbeeld voor een stijlpilot)
RUNWAYML_API_SECRET='...' node scripts/lijn-illustratie-graph.mjs run --execute --alleen "Lunges"
```
