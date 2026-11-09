# Ronde 3: specs schrijven voor nieuwe beelden (geen Runway draaien!)

Je schrijft alleen een JSON-specbestand. Je draait zelf GEEN Runway of andere betaalde dienst, geen git, en je past niets
anders aan dan je eigen uitvoerbestand.

## Harde regels
- Physitrack (physitrack.com/home-exercise-video/...) is leidend voor wat klinisch klopt. Lees de pagina (web-fetch) of
  zoek met WebSearch `allowed_domains: ["physitrack.com"]`. Nooit tekst of beeld kopiëren of opslaan: vat in EIGEN woorden samen.
- De Engelse beeldtekst (`pose_en` / `eind`) gaat naar Runway: daarin NIETS van Physitrack (geen titels, geen zinnen),
  alleen je eigen beschrijving van houding, materiaal, greep en beweging.
- Bij beslispunten geldt: 212 bovenlichaam draait met de grepen, heupen/zitting staan stil; 66 split squat ZONDER stang;
  390 hoofd draait weg van de rekkant, kin richting de oksel aan de andere kant.

## Invoer
Records met: nr, naam, groep, tekening_nu, avatar_nu (paden relatief aan /Users/builder/Fysiplan-crosscheck/public/),
uitleg_nu, nieuwe_uitleg (voorgestelde tekst, als de uitleg afwijkt; dat wordt de nieuwe uitleg), physitrack_url, reden
(waarom het afwijkt), tekening_wordt_hertekend. Bekijk de huidige beelden met de Read-tool.

## A. Tekening-specs (bestand in-tekeningen.json → specs-tekeningen.json)
Per record een object zoals dit voorbeeld:
{"nr":1,"slug":"barbell-front-press","stijl":"287","content_ref":null,
 "physitrack":{"pagina":"<korte paginanaam>","start":"<eigen woorden NL>","beweging":"...","materiaal":"...","greep":"..."},
 "pose_en":"Side view of one woman ... STARTING position ... One straight arrow ... points UP.","opmerking":"..."}
- slug: kebab-case van de naam. stijl: "001" (staand), "085" (liggend) of "287" (zittend) = stijlreferentie.
- content_ref: null (de huidige tekening is afwijkend; niet als referentie gebruiken).
- pose_en: Engels, de BEGINhouding precies (aanzicht, houding van romp/armen/benen, materiaal, greep), wat het NIET is
  (bv. "NOT standing"), en precies ÉÉN pijl die de bewegingsrichting toont. Eén figuur, zelfde persoon als de huisstijl.

## B. Avatar-specs (bestand in-avatars-N.json → specs-avatars-N.json)
Per record een object zoals dit voorbeeld:
{"nr":39,"slug":"triceps-dips","stijl":"stoel","lijn":"images/beginhouding-pijl-v2/040.webp",
 "physitrack":{"pagina":"...","start":"...","beweging":"...","materiaal":"...","greep":"..."},
 "eind":"Both figures in strict side profile, ... TOP: <beginhouding>. BOTTOM: <eindhouding>.","opmerking":"..."}
- stijl: "stoel" (zittend), "mat" (liggend/op de grond) of "staand".
- lijn: het pad van de huidige tekening (tekening_nu) als die klopt. Is tekening_wordt_hertekend true: zet "lijn": null
  (wordt later ingevuld met de nieuwe tekening) en beschrijf de juiste houding extra precies.
- eind: Engels; aanzicht; materiaal en greep; TOP = beginhouding, BOTTOM = eindhouding; benoem expliciet wat de oude
  avatar fout deed (bv. "NOT lying on the stomach", "the bar is NOT ...").
- Moet de tekening klopt met Physitrack: laat de avatar de tekening volgen (de lijntekening wint).

## Uitvoer
Schrijf een JSON-array naar /Users/builder/Fysiplan-crosscheck/output/physitrack-crosscheck/beelden/ronde3/<uitvoerbestand>,
één object per invoerrecord, zelfde volgorde. Tussentijds wegschrijven mag. Geef aan het eind een korte melding terug
met twijfelgevallen.
