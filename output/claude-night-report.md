# Nachtreparatie patiëntkaart — overdracht aan de coördinator

Werktak: `/private/tmp/fysiplan-release-20261102`, uitgaand van `9bf215a`.
**Niet gepusht, niet gedeployd, niet gemerged.** Lokale commits:

| commit | onderwerp |
|---|---|
| `4f5680c` | begin-/eindhouding met beoordeelde uitsnedes |
| `4aec046` | robuustheid en eerlijkheid van de stemopname |
| `53ae691` | weergavetest sluitend tot de canvas-opdracht |
| `c8ca782` | leveringsketen tot de patiëntlink, eerlijk knoplabel |
| `9ef09c8` | herkomst van praktijkvideo's benoemd |
| `57da3fa` | nooit stilzwijgend een lijntekening |
| `f200ed8`, `2642c13`, `d16ef77` | beoordelingsspoor, rapportage, voortgang |
| `1ba3434` | **ronde 2:** byte-ranges volgens RFC 9110, ook voor praktijkvideo's |
| `3dcf70b` | **ronde 2:** wachttijd ook als een opname halverwege stokt |

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
| code- en testronde | **gedaan** — `npm run test:mobile` (negen poorten) en `npm run build` zijn groen |
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

### Ronde 2, na controle door de coördinator

| wat er mis was | waarom het telt |
|---|---|
| `Range: bytes=-500` werd beantwoord als `bytes 0-500` in plaats van de laatste 500 bytes — in mijn eigen `sendMedia` voor de stemopnames, **én** in de route voor praktijkvideo's onder `/uploads/`, waar dat al in productie (`9bf215a`) zo zat | spelers vragen het einde van een bestand zo op (moov-atom van een mp4, ID3v1 van een mp3) en kregen het begin terug met een kop die beweerde dat het het einde was. Beide routes gebruiken nu `lib/byte-range.js`; tegen de vorige `server.js` gaf het verzoek aantoonbaar `bytes 0-500/97612`, nu `bytes 97112-97611/97612` |
| een 416 kreeg `cache-control: public, max-age=86400` | caches sleutelen op de URL, niet op de Range-kop; een bewaarde 416 kon gewone verzoeken beantwoorden. Nu `no-store` |
| de wachttijd van de stemopname gold alleen tot het eerste `playing` | een fragment dat halverwege stokte bleef eindeloos op "Stop" staan. Nu starten `waiting`/`stalled` een wachttijd (zonder verlenging), en `playing` of echte voortgang heft hem op; de nieuwe tests falen tegen de vorige code |

### Ronde 3, na de onafhankelijke audit van e5991d2 (commit `63f8ee1`)

| wat er mis was | waarom het telt | nu |
|---|---|---|
| de miniatuur kreeg het witte merkvlak op basis van alleen de afmetingen; de vergrote foto controleerde wél de sha256, de miniatuur niet (mijn eerdere voortgang zei ten onrechte "hetzelfde vlak" alsof dat ook gold) | een vervangen beeld van hetzelfde formaat of een oude cachekopie verloor inhoud onder een vlak van een ander bestand | eerst `bevestigBron` op precies het getoonde pad; tot dan en bij falen blijft de miniatuur heel. Een verouderde controle (ander pad, ander formaat, hertekend, nieuwere beurt, andere beoordelingsregel) zet niets; elke nieuwe `load`/`error` begint opnieuw |
| het stemmanifest werd zonder grens opgehaald, terwijl de knop al op "Stop" stond; de wachttijd van 12 s begint pas na het manifest | op een slechte verbinding bleef de knop eindeloos op "Stop", zonder melding | 10 s grens over aanvraag en inhoud, afbreken waar de browser dat kan, daarna opnieuw proberen; een te laat antwoord telt niet; een manifest zonder lijst opnames wordt geweigerd; stoppen tijdens het laden blijft stil |

Beide nieuwe tests falen op de vorige code bij hun eerste nieuwe controle; `npm run
test:mobile` en `npm run build` zijn groen. Niet gedaan: echte browser of toestel (de
browsercheck zou bewaarde, nog niet gecommitte uitvoer overschrijven), luistertest,
klinische beoordeling. Tijdens de hashcontrole is het ingebakken merk op een miniatuur
even zichtbaar; dat is bewust. Slaagt het manifest pas bij een latere poging, dan
verschijnen de luisterknoppen per oefening niet alsnog (niet verbreed).

## 6. Wat blijft liggen — en waarom

1. **Luisterronde.** Geen enkele van de 67 bestaande opnames is beluisterd. 252 van de
   319 oefeningen hebben er sowieso geen.
2. **Klinische goedkeuring.** Vijftien expliciete houds en vijf afgekeurde afbeeldingen
   wachten op een fysiotherapeut. Niets in deze nacht verandert daar iets aan.
3. **De 158 statische oefeningen krijgen alleen met ander bronmateriaal een
   houdingweergave.** Per meting: 79 tonen één samenhangend figuur (vaak door een
   apparaat verbonden), 38 laten de figuren elkaar overlappen, bij 20 valt het merk in
   een figuurvak, 12 hebben losse inkt in de uitsnede, 4 houdingen lijken te veel op
   elkaar, 2 zijn niet toe te wijzen en 3 heb ik na het kijken afgekeurd. Opnieuw renderen
   met ruimte tussen de figuren en het merk erbuiten maakt een gecontroleerde weergave
   mogelijk. Dat vraagt beeldgeneratie; **daar is deze sessie niet voor geautoriseerd en
   er is niets uitgegeven.**
4. **Praktijkuploads hebben geen beoordelingsregel.** Een praktijk kan een eigen
   oefenfoto (`uploads/oef-*.jpg`) en een eigen video per kaart publiceren. Een expliciete
   afkeuring voor zo'n bron werkt inmiddels wél (`public/kaart.html:716` blokkeert elke
   afgekeurde bron, `:755` laat de hercontrole ook `uploads/` toe), maar het buildscript
   maakt alleen regels voor repository-beelden, dus in de praktijk zijn uploads
   onbeoordeeld zichtbaar. `explanationWithheld` werkt voor `po_`-ids alleen als een houd
   die oefening noemt, en zulke houds bestaan niet. Houdingen en natuurlijke stem kunnen
   die media niet bereiken; bij praktijkvideo's staat sinds `9ef09c8` dat beeld en tekst
   een andere bron hebben. Een echte beoordelingsweg voor uploads is een ontwerpkeuze
   voor jou, geen nachtreparatie.
5. **Een door de therapeut geplakte YouTube-link gaat nog altijd vóór de klinisch
   beoordeelde catalogusvideo** (`public/kaart.html:1166`). Dat staat zo in de code
   beschreven als bewuste keuze; ik heb het niet veranderd, maar het verdient een
   expliciet besluit.
6. **De Nederlandse luisterknop laat dosering en de veiligheidszin weg** die andere talen
   wel krijgen. Dat kan niet met de bestaande opnames worden opgelost; er staat nu wel
   expliciet bij wat de stem wél en niet zegt.
7. **Productiedata zijn hier niet te zien** (`data/` is gitignored). Ik kan dus niet
   zeggen hoeveel praktijkvideo's of geüploade beelden er in productie staan, laat staan
   of er één op een levende kaart zit.
8. **Eén kaartpagina voor alle patiëntlinks.** `server.js` serveert voor elke `/k/`-link
   dezelfde `public/kaart.html`. Alles wat deze nacht aan de kaart veranderde (houdingen,
   merk, miniatuurmasker, stemopname, wachttijden, manifestgrens) geldt dus ook voor
   bestaande QR-kaarten die in de V1-editor zijn gemaakt. De V1-editor en -catalogus zelf
   zijn niet gewijzigd. Moeten V1-links gedragsmatig ongewijzigd blijven, dan is dat een
   releasebesluit; de code is daar niet op gescheiden.

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
npm run test:mobile       # negen poorten
npm run build
node scripts/render-pose-review.mjs --before-after "Squat,Barbell pull over"
```
