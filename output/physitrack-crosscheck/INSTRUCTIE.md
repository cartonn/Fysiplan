# Physitrack-crosscheck per oefening (werkinstructie voor een batch)

Doel: elke Fysiplan V2-oefening uit jouw batch vergelijken met de openbare Physitrack-uitleg
(pagina's op physitrack.com onder `/home-exercise-video/`), die klinisch getoetst is.

## Harde regels
- Van Physitrack nooit tekst of beeld kopiëren of opslaan. Alleen lezen, vergelijken en in EIGEN woorden
  de richting vastleggen (beginhouding, beweging, greep, materiaal). Geen citaten in je uitvoer.
- Niets aanpassen buiten je eigen uitvoerbestand. Geen betaalde diensten (Runway, HeyGen), geen git.
- De lijntekening wint bij conflict tussen tekening en avatar/video.

## Invoer (per record in jouw `in-XX.json`)
`nr` (index in public/oefeningen-v2.json), `naam`, `groep`, `set` (bestaand/nieuw), `img` (lijntekening),
`kaartImg` (avatar, links start, rechts eind), `uitleg` (huidige tekst), soms `bron`/`bronTitel`
(Physitrack-pagina uit een eerdere controle), soms `spec_tekening` (eerdere beschrijving van wat de tekening
toont; controleer die zelf tegen het beeld) en `videoprompt` (de spec-prompt waarop de HeyGen-video gebaseerd is),
en bij `video: "ja"` een `video_frames` (strook van 6 frames uit de goedgekeurde video, van links naar rechts in de tijd).

Beeldpaden `img` en `kaartImg` zijn relatief aan `/Users/builder/Fysiplan-crosscheck/public/`. Bekijk ze met de Read-tool.

## Werkwijze per oefening
1. Bekijk de lijntekening en de avatar (en de video-strook als die er is).
2. Zoek de best passende Physitrack-pagina: WebSearch met `allowed_domains: ["physitrack.com"]` en een Engelse
   zoekterm (vertaal de Nederlandse naam; gebruik ook wat de tekening toont). Lees zo nodig de pagina
   (web-fetch). Heeft het record al een `bron`, leg de uitleg alleen snel tegen die bron (geen nieuwe zoektocht,
   tenzij de bron duidelijk niet past).
3. Kies een Physitrack-variant die past bij wat de TEKENING toont (houding, materiaal), niet alleen bij de naam.
4. Oordeel per onderdeel, met precies één van: `ok`, `licht afwijkend`, `afwijkend`, `fout`, `geen Physitrack-match`.
   - uitleg: klopt de tekst met Physitrack (richting, houding, greep, materiaal) én met de tekening?
   - tekening: toont de tekening een geldige Physitrack-variant van deze oefening (bij de naam)?
   - avatar: komt de avatar overeen met de tekening en Physitrack (start en eind, greep, richting)?
   - video: alleen bij video "ja"; komt de beweging in de strook overeen? Anders leeg laten.
   Bij geen match (TRX, Bodyblade, apparaten, fitness die Physitrack niet heeft): `geen Physitrack-match` voor uitleg
   en tekening, maar beoordeel avatar/video dan wél tegen de tekening (ok/afwijkend/fout). Noteer de dichtstbijzijnde
   pagina in physitrack_url als die er is, en zet in de opmerking "dichtstbij:".
5. Wijkt de uitleg af (licht afwijkend, afwijkend of fout): schrijf `nieuwe_uitleg` in dezelfde stijl als nu:
   Nederlands, B1, je-vorm, 1 tot 3 zinnen, eerst beginhouding, dan beweging. Zelfde richting als Physitrack, eigen woorden.
   Toont de tekening een andere variant dan Physitrack en is die variant geen geldige Physitrack-variant: pas de uitleg
   NIET aan de verkeerde tekening aan; schrijf de uitleg volgens Physitrack en zet tekening op afwijkend/fout.
   Is de uitleg ok: `nieuwe_uitleg` leeg.
6. `opmerking`: kort Nederlands, wat precies afwijkt (en wat er aan tekening/avatar/video moet veranderen). Leeg mag bij alles ok.

## Uitvoer
Schrijf naar `/Users/builder/Fysiplan-crosscheck/output/physitrack-crosscheck/batches/out-XX.jsonl`
(zelfde XX als je invoer), één JSON-object per regel, in dezelfde volgorde als de invoer, met precies deze velden:

```
{"nr":0,"naam":"","groep":"","set":"bestaand","physitrack_url":"","physitrack_titel":"",
 "uitleg_oordeel":"","tekening_oordeel":"","avatar_oordeel":"","video":"ja|nee","video_oordeel":"",
 "nieuwe_uitleg":"","opmerking":""}
```
`physitrack_titel` is de paginatitel (korte naam van de oefening; dat is geen citaat-probleem).
Schrijf het bestand tussentijds bij (bijvoorbeeld na elke 5 oefeningen), zodat werk niet verloren gaat.
Lever alle records van de batch op, ook als je bij een oefening twijfelt (zet dan de twijfel in de opmerking).
