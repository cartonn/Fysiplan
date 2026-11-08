# Specs voor hertekenen in pijl-v1-stijl (ronde 2)

Per oefening in je `in-N.json` schrijf je een tekenspec. Runway krijgt ALLEEN jouw eigen Engelse tekst (`pose_en`) plus een
pijl-v1-stijlvoorbeeld en eventueel een inhoudsreferentie uit ons eigen project.

## Harde regels
- Open de Physitrack-pagina (`physitrack_url`) met WebFetch en lees beginhouding, beweging, materiaal en greep. Past de pagina niet,
  zoek met WebSearch (allowed_domains physitrack.com) de best passende variant bij naam en uitleg.
- Nooit tekst of beeld van Physitrack kopiëren of opslaan; alleen in EIGEN woorden de richting vastleggen. Geen citaten.
- Geen git, geen Runway/HeyGen, niets buiten je eigen uitvoerbestand wijzigen.
- Bij conflict tussen uitleg en Physitrack: volg Physitrack en zet dat in `opmerking`.

## Werkwijze
1. Bekijk `getoond` (het huidige foute app-beeld, onder /Users/builder/Fysiplan-crosscheck/public/) en `bron_img`; lees `fout_in_getoond`.
2. Lees de Physitrack-pagina. Leg vast: start, beweging, materiaal, greep (Nederlands, kort, eigen woorden).
3. `stijl`: kies het pijl-v1-stijlvoorbeeld: "001" staand, "085" liggend of op handen en knieën / op de mat, "287" zittend (stoel/bank/apparaat).
4. `content_ref`: zet `public/<bron_img>` ALLEEN als dat bronbeeld de juiste BEGINhouding en het juiste materiaal toont volgens Physitrack
   en geen watermerk/tekst/logo heeft; anders `null`. Nooit het foute `getoond`-beeld.
5. `pose_en`: Engelse beschrijving van ÉÉN figuur in de echte BEGINhouding (nooit halverwege of eindstand), met kijkhoek
   (side view / front view / three-quarter front view), houding van romp, armen, benen, handen, voeten, materiaal en greep zo concreet
   mogelijk (bijv. "two separate dumbbells, palms facing each other"), en tot slot precies één zin over de ENE pijl: waar hij staat en welke
   kant hij op wijst ("One curved arrow beside the right hand points UP ..."). Bij een symmetrische beweging van twee armen of benen mag één
   pijl voor beide. Benoem expliciet wat NIET mag als dat de fout in `fout_in_getoond` was (bijv. "NOT lying on the stomach").
   Geen merknamen of tekst in het beeld.

## Uitvoer
`ronde2/out-N.json` (zelfde N): een JSON-array, zelfde volgorde, per object precies:
{"nr":0,"slug":"kebab-naam","stijl":"001|085|287","content_ref":null,
 "physitrack":{"pagina":"titel of 'dichtstbij: titel'","start":"","beweging":"","materiaal":"","greep":""},
 "pose_en":"","opmerking":""}
Schrijf tussentijds bij. Meld aan het eind alleen hoeveel specs klaar zijn en welke nummers twijfel hebben.
