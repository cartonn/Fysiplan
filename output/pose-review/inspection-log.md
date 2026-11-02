# Visuele inspectie houding-uitsnedes (nacht 2026-11-02 → 2026-11-03)

## Wat is bekeken

Alle 162 gemeten kandidaat-paren zijn één voor één bekeken op contactvellen
(`output/pose-review/pair-candidate-*.png`, vier oefeningen per vel). Elk vel toont
per oefening: de volledige bronafbeelding, houding 1 en houding 2 — die laatste twee
gerenderd met **exact dezelfde meetkunde als de patiëntkaart** (`lib/pose-frames.js`),
zodat de beoordeling gaat over wat de patiënt ziet en niet over een benadering.

Precisering over de volgorde van de nacht: de meting is tijdens het werk twee keer
strenger gezet (de inktdrempel van 243 naar 248, en de drempel voor "te veel op elkaar
lijkend"). Daardoor verschoof de nummering van de vellen en vielen er oefeningen uit de
lijst. De **uitsnedes zelf** zijn sinds de inktdrempel van 248 niet meer veranderd: de
latere aanpassingen bepalen alleen nog wélke oefeningen meedoen, niet hoe een uitsnede
eruitziet. Elke uiteindelijk goedgekeurde uitsnede is dus bekeken in exact de vorm
waarin hij nu wordt getoond. Na de laatste regeneratie zijn de vellen 052 en 160
steekproefsgewijs opnieuw bekeken en identiek bevonden aan wat eerder is beoordeeld.

Per oefening is gelet op:

1. bevat elk frame precies één volledig figuur — geen stuk van de andere tekening, geen merk?
2. staan beide houdingen op dezelfde schaal en logisch uitgelijnd?
3. is er niets weggesneden dat bij de oefening hoort?
4. zijn begin en eind echt verschillend?

Punt 1 en 4 zijn bovendien **gemeten**, niet alleen bekeken: `scripts/pose-crop-candidates.mjs`
telt binnen elke uitsnede de inkt die niet bij die houding hoort (eis: strikt nul) en
meet de silhouetoverlap tussen de twee houdingen in de frame-meetkunde.

De uitkomst per oefening staat in `output/mobile-pose-per-exercise.md`, de vastlegging
met bestandshashes in `content/mobile-pose-approvals.json`.

## Wat dit niet is

Dit is een meetkundige en visuele controle van de **uitsnede en de weergave**. Het zegt
niets over de klinische juistheid van de afgebeelde uitvoering, en niets over de vraag of
de afgebeelde variant de voorgeschreven variant is. `clinicalApproved` blijft overal false,
en de vijftien bestaande houds op de uitleg staan ongewijzigd.

## Handmatige afkeuringen na visuele controle

De meting vond deze drie acceptabel; de visuele controle niet.

| oefening | reden |
|---|---|
| Dips | los grijs handvat naast het figuur in houding 1, en beide figuren staan rechtop: de dip zelf is niet afgebeeld |
| Step up with knee raise | los lichtblauw blok naast het eigen opstapje in houding 1 |
| Alternating lunge jumps | twee afwisselende standen van dezelfde sprongoefening zijn geen begin- en eindhouding van één beweging; de provenance van v9 stelt expliciet dat de sprongovergang niet is goedgekeurd |

Bij Alternating lunge jumps bevestigt de meting wel dat de beenwissel in v9 echt is
hersteld: `madMirrored` 10,5 tegenover `madDirect` 23,4 — houding 2 lijkt op het
spiegelbeeld van houding 1, niet op houding 1 zelf. Dat was bij v8 juist andersom.

## Grensgevallen die bewust statisch blijven

De drempel voor "te veel op elkaar lijkend" (silhouetoverlap ≥ 0,90, of ≥ 0,85 met
nauwelijks pixelverschil) is geijkt op echte bladen: Swiss ball squeezes adductoren
(0,909), Foam roller calf (0,906) en Foam rol glutes stretch (0,855 bij madDirect 5,07)
zijn op het scherm niet van elkaar te onderscheiden en zouden als "beweging" misleidend
zijn. Endy Leg ext (0,888 bij madDirect 28) en Wrist flexion (0,884 bij 12,6) tonen wél
een duidelijk zichtbaar verschil en blijven actief.

## Opmerkingen bij goedgekeurde oefeningen

| oefening | opmerking |
|---|---|
| Front pully row | het apparaat hoort bij houding 1; de kabel van houding 2 eindigt in de bron zelf aan de rand |
| Endo pull | de band loopt in de bronafbeelding zelf tot de beeldrand; niet veroorzaakt door de uitsnede |
| Been pendelen, Standing gluteus | de steunpaal is aan houding 2 toegewezen; in houding 1 staat geen steun |
| Kick back | het enkelgewicht/toestel is aan houding 2 toegewezen |
| Standing abduction | de weerstandsband is aan houding 2 toegewezen; in houding 1 ligt hij los |
| Calf raises | alleen in houding 1 houdt de persoon een voorwerp vast — een inconsistentie in de bron, geen fout van de uitsnede |

## Voor-/na-bewijs

| bestand | wat het laat zien |
|---|---|
| `before-after-fp_ff306042c93f0900.png` (Anteflexie armen) | oud: het merk zit in houding 1 en het lichaam is daardoor kleiner geschaald dan in houding 2. nieuw: gelijke schaal, geen merk in de uitsnede |
| `before-after-fp_341afb721db82139.png` (Squat) | oud: ongelijke schaal. nieuw: gelijke schaal, en de squat zakt zichtbaar lager dan de stand — het echte hoogteverschil blijft staan |
| `before-after-fp_5db16db1c4b85956.png` (Barbell pull over) | gestapeld blad: de oude middellijnsplitsing halveert **beide** personen en zet de linkerhelften in houding 1. nieuw: twee volledige figuren met complete bank |
| `before-after-fp_0e06ee3270c9952a.png` (Swiss ball squeezes adductoren) | zelfde halvering; tevens het voorbeeld waarbij de twee houdingen te veel op elkaar lijken en de oefening daarom statisch blijft |
| `before-after-fp_013ba6ad937cc9d9.png` (Dips) | handmatige afkeuring: het losse handvat is in het nieuwe frame goed zichtbaar |
| `before-after-fp_7dc1478e2b3c17b0.png` (Step up with knee raise) | handmatige afkeuring: het losse blok |
| `before-after-fp_8fb77da919f771d2.png` (Foam roller calf) | grensgeval dat statisch blijft |

Reproduceren: `npm run poses:measure && npm run poses:review` en
`node scripts/render-pose-review.mjs --before-after "Squat,Barbell pull over"`.
