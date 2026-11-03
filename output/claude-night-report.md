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
| twee figuren overlappen elkaar (uitsnede zou een stuk van de ander bevatten) | 37 |
| merk valt binnen een figuur-uitsnede | 20 |
| losse inkt binnen de uitsnede | 12 |
| houdingen te veel op elkaar lijkend om beweging te heten | 4 |
| handmatig afgekeurd na visuele controle | 1 |
| één samenhangend figuur (o.a. alle lijntekeningen) | 78 |
| meer dan twee figuren / losse voorwerpen niet toe te wijzen | 2 |
| beeld zelf tegengehouden, dus geen houdingen (5 inhoudelijk afgekeurd, 4 tijdelijke bron-houds) | 9 |
| **totaal beschikbare beelden** | **319** |

Stand 2026-11-03 na ronde 5, nageteld uit `public/mobile-media-review.json`: 156
uitsnedeparen, 154 statisch, 9 tegengehouden. Tot ronde 5 stond hier 158 statisch en 5
afgekeurd; de vier bron-houds (Dips en Step up with knee raise waren al handmatig
afgekeurd als paar, Triceps dips en Standing chair shoulder rotations waren statisch)
schoven van statisch naar tegengehouden.

De volledige lijst met namen staat in `output/mobile-pose-per-exercise.md`.
De 163 oefeningen zonder houdingen tonen onveranderd de volledige afbeelding —
er wordt nooit stilzwijgend een lijntekening voor in de plaats gezet.

## 4. Hoe ver de controle gaat

| soort controle | status |
|---|---|
| code- en testronde | **gedaan** — `npm run test:mobile` (twaalf onderdelen sinds ronde 6) en `npm run build` zijn groen |
| visuele ronde | **gedaan voor de 162 gemeten kandidaat-paren**, één voor één op 41 contactvellen in de definitieve weergave. Niet gedaan: een losse visuele controle van de 163 statische oefeningen buiten de meting om |
| luisterronde | **niet gedaan** — er is deze nacht geen enkele opname beluisterd |
| klinische goedkeuring | **niet gedaan en nergens uit af te leiden**. Alle `clinicalApproved` blijven false, de vijftien houds op de uitleg staan ongewijzigd, en de negen tegengehouden beelden (vijf afgekeurd, vier tijdelijke bron-houds) blijven tegengehouden |

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
| de miniatuur kreeg het witte merkvlak op basis van alleen de afmetingen; de vergrote foto controleerde wél de sha256, de miniatuur niet (mijn eerdere voortgang zei ten onrechte "hetzelfde vlak" alsof dat ook gold) | een vervangen beeld van hetzelfde formaat of een oude cachekopie verloor inhoud onder een vlak van een ander bestand | eerst `bevestigBron` op het pad van het getoonde beeld; tot dan en bij falen blijft de miniatuur heel. Een verouderde controle (ander pad, ander formaat, hertekend, nieuwere beurt, andere beoordelingsregel) zet niets; elke nieuwe `load`/`error` begint opnieuw |
| het stemmanifest werd zonder grens opgehaald, terwijl de knop al op "Stop" stond; de wachttijd van 12 s begint pas na het manifest | op een slechte verbinding bleef de knop eindeloos op "Stop", zonder melding | 10 s grens over aanvraag en inhoud, afbreken waar de browser dat kan, daarna opnieuw proberen; een te laat antwoord telt niet; een manifest zonder lijst opnames wordt geweigerd; stoppen tijdens het laden blijft stil |

Beide nieuwe tests falen op de vorige code bij hun eerste nieuwe controle; `npm run
test:mobile` en `npm run build` zijn groen. Niet gedaan: echte browser of toestel (de
browsercheck zou bewaarde, nog niet gecommitte uitvoer overschrijven), luistertest,
klinische beoordeling. Tijdens de hashcontrole is het ingebakken merk op een miniatuur
even zichtbaar; dat is bewust. Slaagt het manifest pas bij een latere poging, dan
verschijnen de luisterknoppen per oefening niet alsnog (niet verbreed).

### Ronde 4, vervolgaudit: een eerdere controle werd hergebruikt (commit `fc40de1`)

`bevestigBron` onthield een geslaagde controle per pad en hash. Laadde hetzelfde pad
opnieuw met andere bytes en hetzelfde formaat (miniatuur opnieuw geladen, vergrote foto
opnieuw geopend), dan werd zonder nieuwe controle afgedekt: op `2249b0c` gaf de
reproductie twee keer `true`, één fetch, één vlak. Nu haalt elke lading het pad opnieuw op
(tweede keer: `false`, twee fetches, geen vlak). De gedeelde uitkomst, die ook de
houdingen leest, is die van de nieuwste controle; een oudere die later klaar is,
overschrijft hem niet. De regressietests gebruiken geen handmatige cachereset meer en
falen op `2249b0c`.

Wat de controle **niet** bewijst: dat het beeld uit precies de gehashte bytes is
gedecodeerd. De browser laat de bytes van een `<img>` niet lezen; gehasht wordt wat
`fetch()` voor hetzelfde pad direct na de lading teruggeeft (normaal dezelfde
HTTP-cachekopie). Wisselt het bestand tussen beeldlading en controle, of komt het beeld uit
het geheugen van de pagina terwijl de cachekopie intussen anders is, dan kan dat afwijken.
Bijna elke afwijking faalt dicht (geen vlak, geen houdingen). Alleen als het beeld
onbeoordeelde bytes kreeg en de controle tegelijk precies de beoordeelde, gaat het mis.
Kosten: één fetch uit de cache plus SHA-256 per lading. De vergrote foto doet er twee.

### Ronde 5, broncorrectie: verwisseld stoelpaar en vier defecte bronnen (commit `9e6f50d`)

**Koppeling.** Bij Standing chair hip extension (`fp_514654a0d4181742`) en Standing chair
knee lift (`fp_5319c4700561725d`) toonde het V2-kaartbeeld de beweging van de ander. Alleen
`kaartImg` in `public/oefeningen-v2.json` is omgewisseld (2 regels). Ids, teksten, het
lijnbeeld, V1 en alle bestanden zijn ongewijzigd. De uitzondering staat met pad, sha256,
vorige koppeling en terugdraai-instructie in `content/v2-avatar-overrides.json`. De
Carla-pijplijn leidde het kaartbeeld af uit de naam van het lijnbeeld; die volgt nu de
uitzondering en weigert een import die het beeld van de andere oefening zou overschrijven.
De build controleert de uitzondering extra (pad, hash, V1-lijnbeeld, uniek gebruik);
niets is versoepeld. Beide blijven statisch: één figuur, geen begin/eind-paar.
**Niet aangepast:** de V1-lijnbeelden van dit paar zijn op dezelfde manier verwisseld.

**Houds.** Dips, Triceps dips, Step up with knee raise en Standing chair shoulder rotations
krijgen een tijdelijke hold op precies dat bestand (pad + sha256), via het bestaande
afkeurspoor. Er is niets verwijderd en niets klinisch beoordeeld. Beoordeling: 6 van 319
regels gewijzigd; afgekeurd 5 → 9, onbeoordeeld 314 → 310, houdingen 156 en merken 215
ongewijzigd.

**Op elke QR-kaart** (ook die uit de V1-editor): het stoelpaar toont nu het passende beeld.
Bij de vier houds verdwijnen de foto, de luisterknop per oefening (Dips en Triceps dips
hebben een opname) en de videoknop van die oefening, ook een praktijkvideo. Dosering blijft.
De knop "Luister naar uitleg" bovenaan speelt de opnames van Dips en Triceps dips nog wel;
dat gold al voor eerdere afkeuringen en is niet aangepast (in ronde 6 opgelost). In de
therapeutenapp gelden de houds niet.

### Ronde 6, V2-lijnbeeld van het stoelpaar en voorlezen bovenaan

**Lijnbeeld.** De coördinator bekeek de volledige originele lijntekeningen:
`standing-chair-hip-extension-line-v1.png` toont de knie naar voren,
`standing-chair-knee-lift-line-v1.png` het been naar achteren. In
`public/oefeningen-v2.json` is daarom ook `img` van beide oefeningen omgewisseld
(2 regels, tekstueel). Kaartbeeld, lijnbeeld en tekst tonen nu per oefening dezelfde
beweging. Ids (expliciet veld, gelijk aan de afgeleide V1-id), namen, teksten,
`public/oefeningen.json` (sha `038af18e…`) en alle beeldbestanden zijn byte-gelijk.

**Pijlbeelden.** De server levert voor een V2-lijnbeeld de pijlversie
(`server.js`: `arrowImages.get(e.img)`). Pijlbeeld 313 (hip extension: pijl van de voet
naar achteren) en 315 (knee lift: pijl bij de knie omhoog) zijn per naam getekend en
kloppen al. Alleen hun sleutel (`source`) in `content/beginhouding-pijl.json` schuift mee.
Anders zou de server na de wissel juist het verkeerde pijlbeeld leveren.
**Gevolg:** de geleverde V2-catalogus (`/v2/oefeningen.json`) en wat een therapeut of
patiënt ziet, veranderen voor dit paar niet. De correctie herstelt de onderliggende
koppeling, zodat lijnmodus, graphs en een nieuwe pijlpublicatie niet meer van het
verkeerde beeld uitgaan.

**Uitzondering, smal en hash-gebonden.** `content/v2-avatar-overrides.json` (schema 2)
legt per oefening vast: kaart-, lijn-, V1- en pijlbeeld met pad en sha256, de vorige
waarden en hoe je terugdraait. `lib/v2-overrides.js` controleert dat volledig; beide
build-poorten (`publication-channel-graph`, `validate-exercise-backgrounds`) stellen alleen
deze twee ids vrij van "V2-lijnbeeld = V1-lijnbeeld" en roepen daarbij die controle aan.
Uitvoer nu: 317 legacykaarten exact V1, 2 een vastgelegde V2-correctie.
`scripts/v2-line-art-graph.mjs run --execute` zette elk legacy-`img` terug op V1 en zou de
correctie dus stil terugdraaien (aangetoond met de vorige versie); dat volgt nu dezelfde
uitzondering. `scripts/exercise-image-graph.mjs` kan dit paar niet plannen (geen
productiegegevens; `plan` stopt al op Alternating lunge jumps) en is niet aangepast.

**Voorlezen bovenaan.** "Luister naar uitleg" (Nederlands) slaat nu elke oefening over
waarvan de kaart het beeld tegenhoudt. Dat is dezelfde regel (`mediaWithheld`) als bij de
knop per oefening, die bij zo'n oefening niet verschijnt. De melding noemt ze: "Niet
voorgelezen, omdat de oefenafbeelding nog wordt gecontroleerd: …". Wordt er daardoor niets
voorgelezen, dan staat er "Er wordt nu niets voorgelezen voor deze selectie" en niet dat
er geen opname is. Er komt geen toestelstem als vervanging. Teksten, opnames en dosering
zijn niet aangeraakt, en niets wordt als inhoudelijk fout bestempeld. Op dit moment gaat
het om Dips en Triceps dips: de enige tegengehouden oefeningen met een opname.
Lukt het laden van de controlegegevens niet, dan speelde en speelt er niets (bestaande
regel). **Niet aangepast:** andere talen (toestelstem) lezen naam en uitleg van
tegengehouden oefeningen nog wel voor; de opdracht ging over het Nederlands.

**Tests.** `scripts/test-noor-voorlezen-holds.mjs` draait `leesVoor()` uit de kaart met de
echte beoordeling en opnames. Met de kaart van ronde 5 faalt de test: Dips en Triceps dips
worden afgespeeld. `scripts/test-v2-uitzondering-mutaties.mjs` muteert in een wegwerpmap
en bewaakt de echte bestanden met hun hash:
houds — ander pad, andere bytes op hetzelfde pad, andere naam, ander id: de bouw faalt
telkens met de verwachte melding en schrijft geen beoordeling; de controle zonder mutatie
geeft byte voor byte dezelfde beoordeling als de repo.
lijnbeelden — een derde oefening die van V1 afwijkt, het V2-lijnbeeld terug naar V1, V1
"repareren", pijlen niet meegeschoven, een verkeerde hash, of de uitzondering verwijderd:
beide poorten falen telkens om de verwachte reden.
graph — `run --execute` laat de correctie staan, en alle andere legacykaarten blijven V1.
`scripts/test-v2-avatar-mapping.mjs` eist nu ook het juiste V2-lijnbeeld, het
ongewijzigde V1-beeld en de V1-sha, de gelijke id's en het ongewijzigde geleverde
pijlbeeld.

**Belangrijk voor een V1-besluit.** V1 heeft geen expliciet id-veld; het id is afgeleid
van het lijnbeeldpad. De V1-lijnbeelden omwisselen zou dus ook de id's van deze twee
V1-oefeningen omwisselen. Kaarten die op id zoeken, vinden dan de andere oefening. De
poorten weigeren dat nu ("exerciseId van V1 en V2 lopen uiteen"). Een V1-correctie vraagt
eerst een expliciet id in V1 en een eigen besluit.

**Beoordeling:** 2 van 319 regels gewijzigd (alleen de observatietekst van het stoelpaar);
samenvatting ongewijzigd: 9 tegengehouden, 310 onbeoordeeld, 156 uitsnedeparen, 154
statisch.

### Ronde 7, voorlezen in andere talen (commit `d2b6f7a`)

**Wat.** "Lees voor" in andere talen dan het Nederlands (toestelstem) volgt nu dezelfde
regels als de knoppen per oefening en het Nederlandse voorlezen. Een oefening wordt
helemaal overgeslagen (naam, dosering en uitleg) als de kaart het getoonde beeld
tegenhoudt of als er een houd op de uitleg staat. Lukt het laden van de controle niet,
dan wordt er niets voorgelezen; voorheen klonken dan naam en dosering zonder uitleg. Een
melding in de taal van de kaart noemt wat is overgeslagen en waarom, en verwijst naar de
dosering op de kaart. Wordt alles overgeslagen, dan staat er dat er nu niets wordt
voorgelezen; er wordt dan niet gesproken en geen andere spraak afgebroken. De melding
zegt niets over opnames en niets over de juistheid van teksten.

**Ongewijzigd.** Niet-tegengehouden oefeningen klinken precies als voorheen: kaartnummer,
dosering, vertaalde uitleg (een niet-vertaalde Nederlandse uitleg blijft weg). Ook taal,
stem, tempo, de beurtbewaking, het Nederlandse voorlezen en alle catalogi, beoordelingen,
beelden en opnames zijn ongewijzigd. Nu geraakt: 20 van de 319 oefeningen (9 beeld, 15
uitleg, 4 beide).

**Vertalingen.** Vijf nieuwe meldingsteksten in alle negen talen (`T`/`tr`). Ik heb ze
geschreven in de stijl van de bestaande teksten; een moedertaalspreker heeft ze niet
gelezen.

**Tests.** `scripts/test-voorlezen-andere-talen.mjs` draait de echte functies met de echte
beoordeling:
- zonder houds exact de oude voorlezing;
- gemengd en alles tegengehouden;
- acht talen;
- controle niet te laden;
- de beurtbewaking;
- alle 319 oefeningen één voor één: overslaan precies als de kaartknoppen
  (`hideMedia||holdExplanation`) en het Nederlands, met 299 voorgelezen en 20 overgeslagen.

Met de kaart van `ac9d32c` slaagt het geval zonder houds en faalt het gemengde geval.
Niet getest: echte spraak op een toestel (geen browserautomatisering, niets beluisterd).

### Ronde 8, uitwijklink onder YouTube-video's (commit `693c0b3`)

**Aanleiding.** In productie meldt de ingesloten YouTube-speler (o.a. Step up tempo in
"Met video") een configuratiefout. YouTube verwacht een Referer; deze site stuurt
bewust `referrer-policy: same-origin`, want de kaartlink is de toegang tot de kaart.
Die policy is **niet** aangepast.

**Wat.** Onder de ingesloten YouTube-speler, op de patiëntkaart en in het videovoorbeeld
van beheer, staat nu een link naar `https://www.youtube.com/watch?v=ID`. De link
verschijnt alleen bij een gevalideerd id (11 tekens `[A-Za-z0-9_-]`) en opent in een nieuw
tabblad met `rel="noopener noreferrer"`, pas na een tik. Het label staat in de taal van de
kaart en zegt expliciet dat YouTube opent ("Open deze video op YouTube (externe
website)"). De link bevat alleen het video-id: geen kaart-id of toegangscode, en geen
Referer.

**Wat het niet doet.** Het herstelt de ingesloten speler niet, en nergens staat dat het
dat doet. Speler, bronvolgorde en andere videobronnen zijn ongewijzigd; `server.js` is
byte-gelijk.

**Tests.** `scripts/test-youtube-uitwijk.mjs` controleert de policy in de bron en live op
een gestarte server. Daarna draait het de echte klikafhandeling van de kaart en het
echte beheervoorbeeld:
- exacte link en ongewijzigde speler;
- geen kaartgegevens in de link;
- negen talen;
- ongeldige of kwaadaardige id's geven geen link;
- eigen, Stream- en catalogusvideo's geven geen link.

Niet in een browser of op productie geklikt.

**Open besluit.** Een speler die wél werkt zonder de kaartlink als Referer mee te sturen
vraagt een keuze, bijvoorbeeld eigen of Stream-video in plaats van YouTube.

## 6. Wat blijft liggen — en waarom

1. **Luisterronde.** Geen enkele van de 67 bestaande opnames is beluisterd. 252 van de
   319 oefeningen hebben er sowieso geen.
2. **Klinische goedkeuring.** Vijftien expliciete houds en negen tegengehouden afbeeldingen
   (vijf afgekeurd, vier tijdelijke bron-houds) wachten op een fysiotherapeut. Niets in deze nacht verandert daar iets aan.
3. **De 154 statische oefeningen krijgen alleen met ander bronmateriaal een
   houdingweergave.** Per meting: 78 tonen één samenhangend figuur (vaak door een
   apparaat verbonden), 37 laten de figuren elkaar overlappen, bij 20 valt het merk in
   een figuurvak, 12 hebben losse inkt in de uitsnede, 4 houdingen lijken te veel op
   elkaar, 2 zijn niet toe te wijzen en 1 heb ik na het kijken afgekeurd (Alternating
   lunge jumps). De vier bron-houds en de vijf afgekeurde beelden komen daar nog bij. Opnieuw renderen
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
9. **De V1-lijnbeelden van het stoelpaar blijven verwisseld** (V1-editor, V1-lijnmodus,
   PDF uit V1). Omwisselen zou ook de afgeleide V1-id's omwisselen; zie ronde 6.
10. ~~Andere talen lezen tegengehouden oefeningen nog voor~~ — opgelost in ronde 7
   (`d2b6f7a`).

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
