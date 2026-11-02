# Nachtreparatie patiëntkaart — overdracht aan de coördinator

Werktak: `/private/tmp/fysiplan-release-20261102`, uitgaand van `9bf215a`.
**Niet gepusht, niet gedeployd, niet gemerged.** Lokale commits:

| commit | onderwerp |
|---|---|
| `4f5680c` | begin-/eindhouding met beoordeelde uitsnedes |
| `4aec046` | robuustheid en eerlijkheid van de stemopname |
| (volgend) | sluitende weergavetest en rapportage |

## 1. De oorzaak, in volgorde van belang

**a. De demonstratie was dode code.** `demoSplitsing()` eiste
`demo.info.poseMetadata.reviewStatus === 'approved'`, maar `demo.info` werd gebouwd uit
alleen `{name, s, h, uitleg}`. In de hele repository bestond geen enkele schrijver van
`poseMetadata`. De poort stond dus dicht, maar er was ook geen weg meer naar een werkende
begin-/eindhouding — voor alle 319 oefeningen. Een onafhankelijke read-only audit kwam
op hetzelfde uit.

**b. Splitsen op de middellijn.** De bladen zetten twee figuren in één raster
(meestal 800×1200) met het Fysiplan-woordmerk ingebakken boven **alleen het linker
figuur**. Een splitsing op 50% geeft het merk dus aan houding 1 en niet aan houding 2, en
snijdt alles door wat de middellijn kruist. Dat is precies het beeld dat werd gemeld:
wisselende logo's en resten van de andere tekening.

**c. Het merk telde mee in het contentvak.** De oude `demoUniformFrames()` bepaalde het
vak met een scan op niet-witte pixels. Die scan pakte het merk mee, waardoor de helft mét
merk een hoger vak kreeg en de gedeelde schaal de twee lichamen op **verschillende grootte**
zette. Zie `output/pose-review/before-after-fp_ff306042c93f0900.png`.

**d. 38 bladen staan gestapeld, niet naast elkaar.** Een x-splitsing halveert daar
**beide** personen: houding 1 toont de linkerhelften van allebei, houding 2 de
rechterhelften. Zie `before-after-fp_5db16db1c4b85956.png` — dit is de ernstigste variant
van hetzelfde probleem.

**e. (eigen fout, onderweg gevonden)** Mijn eerste versie behield het verschil in
positie óók langs de as waarop het blad de figuren zet. Bij een gestapeld blad leest dat
als "het lichaam zakt". Gevonden tijdens de visuele controle, hersteld vóór enige
goedkeuring: er wordt nu gecentreerd langs de indelingsas en alleen loodrecht daarop
blijft het echte verschil staan — zodat een squat wél zichtbaar lager zakt dan de stand.

## 2. Wat er nu staat

- `lib/pose-frames.js` — de meetkunde: één schaal voor beide houdingen, nooit uitrekken,
  centreren langs de indelingsas, echt verschil loodrecht daarop.
- `scripts/pose-crop-candidates.mjs` — meet per blad met connected components waar de
  figuren en het eigen merk staan en stelt expliciete uitsnedes voor. Vier harde eisen:
  **nul** vreemde inkt in een uitsnede, merk erbuiten, figuren echt gescheiden,
  silhouetten meetbaar verschillend.
- `scripts/render-pose-review.mjs` — rendert die frames met exact de meetkunde van de
  kaart, plus een getrouwe nabouw van de oude splitsing als bewijsmateriaal.
- `content/mobile-pose-approvals.json` — de visuele controle, per bestand aan zijn
  sha256 gebonden, met de handmatige afkeuringen en de reden.
- `scripts/build-mobile-media-review.mjs` — voegt alleen gemeten **én** visueel
  gecontroleerde uitsnedes samen in `public/mobile-media-review.json`, onder
  `poseGeometry.status: "geometry-approved"`. Die naam is bewust niet "approved":
  hij gaat over de uitsnede, niet over de oefening.
- `public/kaart.html` — tekent de houdingen op canvas met die uitsnedes, zet het merk
  zelf op dezelfde plek buiten beide uitsnedes, en controleert eerst de sha256 van het
  bronbestand. Een vervangen beeld laat de goedkeuring automatisch vervallen.

Onder de twee houdingen staat in negen talen wat dit is: twee uitsnedes uit dezelfde
foto, het wisselen is geen oefentempo, en de uitvoering is niet door een fysiotherapeut
goedgekeurd.

## 3. Uitkomst per oefening

| uitkomst | aantal |
|---|---|
| begin-/eindhouding gecontroleerd en actief | **156** |
| twee figuren overlappen elkaar (uitsnede zou een stuk van de ander bevatten) | 38 |
| merk valt binnen een figuur-uitsnede | 20 |
| losse inkt binnen de uitsnede | 12 |
| houdingen te veel op elkaar lijkend om beweging te heten | 4 |
| handmatig afgekeurd na visuele controle | 3 |
| één samenhangend figuur (o.a. alle lijntekeningen) | 79 |
| meer dan twee figuren / losse voorwerpen niet toe te wijzen | 2 |
| beeld zelf afgekeurd, dus geen houdingen | 5 |
| **totaal beschikbare beelden** | **319** |

De volledige lijst met namen staat in `output/mobile-pose-per-exercise.md`.
De 163 oefeningen zonder houdingen tonen onveranderd de volledige afbeelding —
er wordt nooit stilzwijgend een lijntekening voor in de plaats gezet.

## 4. Hoe ver de controle gaat

| soort controle | status |
|---|---|
| code- en testronde | **gedaan** — `npm run test:mobile` (zeven poorten) en `npm run build` zijn groen |
| visuele ronde | **gedaan voor de 162 gemeten kandidaat-paren**, één voor één op 41 contactvellen in de definitieve weergave. Niet gedaan: een losse visuele controle van de 163 statische oefeningen buiten de meting om |
| luisterronde | **niet gedaan** — er is deze nacht geen enkele opname beluisterd |
| klinische goedkeuring | **niet gedaan en nergens uit af te leiden**. Alle `clinicalApproved` blijven false, de vijftien houds op de uitleg staan ongewijzigd, en de vijf afgekeurde beelden blijven afgekeurd |

De keten is dicht: `scripts/test-mobile-pose-layout.mjs` draait `demoStart()` uit
`public/kaart.html` met echte beoordelingsdata en vangt elke canvas-opdracht op. Daarmee
staat vast dat de kaart exact de uitsnede, schaal en plek tekent die is beoordeeld —
en niet iets dat er alleen op lijkt.

## 5. Andere reparaties uit dezelfde nacht

Gevonden door twee onafhankelijke read-only audits (praktijk-overrides en stemweergave).

| wat er mis was | waarom het telt |
|---|---|
| Noor-opnames werden als `application/octet-stream` zonder `Content-Length` en zonder `accept-ranges` uitgeleverd | iOS Safari opent een opname met `Range: bytes=0-1` en speelt zonder 206-antwoord niets af. Nu `audio/mpeg` met byte-ranges; live geverifieerd en met een eigen test vastgelegd |
| houdlijsten werden bij het afspelen alleen op **naam** vergeleken | na een hernoeming glipte een teruggehouden uitleg door de controle; nu ook op stabiel id, zoals de rest van de kaart al deed |
| de melding over ontbrekende opnames kwam vóór het afspelen | een blokkerende `alert()` laat de toestemming van de tik verlopen, waarna het geluid helemaal niet start. Nu eerst spelen, dan melden |
| een teruggehouden afbeelding bood nog wél de stemopname aan | dezelfde oefening half tonen en half tegenhouden is misleidend |
| "klinisch gecontroleerd" verscheen bij **afwezigheid** van 'concept' | `lib/video-catalog.js` levert dat veld nooit, dus het label verscheen altijd. Nu alleen bij een positieve bevestiging |
| elke kaartopening haalde alle afgekeurde beelden op (562 kB) om hashes te vergelijken | afkeuringen blokkeren nu meteen (veilige beginstand) en de hashcontrole draait alleen voor beelden die echt op deze kaart staan |
| een hangende opname stuurde geen enkele gebeurtenis | de knop bleef eindeloos op "Stop" staan bij stilte; er is nu een wachttijd per fragment met een nette melding |
| telefoon in de zak stopte de demonstratieklok niet | de toestelstem praatte door |
| na het laden van het stemmanifest werd alleen `tekenKaart()` aangeroepen | de knoppen "gedaan vandaag" en "te zwaar" kwamen daardoor bij elke opening leeg terug |
| `check-noor-assets.mjs` controleerde de bevroren v1-catalogus | de kaart leest v2; die liepen alleen toevallig gelijk |
| twee beoordelingsbestanden uit verschillende generaties | offline kon een oude houdlijst met nieuwe opnames worden gecombineerd; dat wordt nu geweigerd en de offline-cache kreeg een versiesprong |
| de mobiele poorten draaiden nergens automatisch | `npm run test:mobile` staat nu in CI |

## 6. Wat blijft liggen — en waarom

1. **Luisterronde.** Geen enkele van de 67 bestaande opnames is beluisterd. 252 van de
   319 oefeningen hebben er sowieso geen.
2. **Klinische goedkeuring.** Vijftien expliciete houds en vijf afgekeurde afbeeldingen
   wachten op een fysiotherapeut. Niets in deze nacht verandert daar iets aan.
3. **58 oefeningen kunnen alleen met nieuw bronmateriaal.** 20 bladen zetten het merk
   boven een figuur en 38 laten de twee figuren elkaar overlappen. Opnieuw renderen met
   meer ruimte tussen de figuren en het merk buiten beide, maakt daar een gecontroleerde
   houdingweergave mogelijk. Dat vraagt beeldgeneratie; **daar is deze sessie niet voor
   geautoriseerd en er is niets uitgegeven.**
4. **Praktijk-overrides staan buiten de poort.** Een praktijk kan een eigen oefenfoto
   (`uploads/oef-*.jpg`) en een eigen video per kaart publiceren. De beoordelingspoort
   kent alleen bronnen die met `images/` beginnen, en `explanationWithheld` doet niets
   voor `po_`-ids. Houdingen en natuurlijke stem kunnen die media niet bereiken (beide
   zijn aan een beoordeelde hash respectievelijk aan exacte tekst gebonden), maar het
   beeld en de video zelf worden ongecontroleerd getoond. Dit goed oplossen betekent een
   beoordelingsdimensie voor runtime-uploads — een ontwerpkeuze voor jou, geen
   nachtreparatie.
5. **Een door de therapeut geplakte YouTube-link gaat nog altijd vóór de klinisch
   beoordeelde catalogusvideo.** Dat staat zo in de code beschreven als bewuste keuze;
   ik heb het niet veranderd, maar het verdient een expliciet besluit.
6. **De Nederlandse luisterknop laat dosering en de veiligheidszin weg** die andere talen
   wel krijgen. Dat kan niet met de bestaande opnames worden opgelost; er staat nu wel
   expliciet bij wat de stem wél en niet zegt.
7. **Productiedata zijn hier niet te zien** (`data/` is gitignored). Ik kan dus niet
   zeggen hoeveel praktijkvideo's of geüploade beelden er in productie staan, laat staan
   of er één op een levende kaart zit.

## 7. Uitgaven

Geen. Geen beeldgeneratie, geen spraakgeneratie, geen API-aanroepen naar betaalde
diensten, geen nieuwe toegang of sleutels. De zes eerder geïmporteerde opnames uit
`/private/tmp/fysiplan-api-batch-258.json` zijn niet opnieuw gegenereerd en niet
aangeraakt.

## 8. Reproduceren

```
npm run poses:measure     # meet alle 319 bladen opnieuw
npm run poses:review      # contactvellen in output/pose-review/
npm run poses:build       # bouwt public/mobile-media-review.json opnieuw
npm run test:mobile       # zeven poorten
npm run build
node scripts/render-pose-review.mjs --before-after "Squat,Barbell pull over"
```
