# Ronde 3: controle tegen Physitrack (tekening zoals getoond, avatar, uitleg)

Doel: per oefening in jouw batch vaststellen of wat de app NU toont overeenkomt met de openbare Physitrack-uitleg
(physitrack.com, pagina's onder `/home-exercise-video/`).

## Harde regels
- Van Physitrack nooit tekst of beeld kopiëren of opslaan. Alleen lezen en vergelijken; alles in EIGEN woorden. Geen citaten.
- Schrijf alleen je eigen uitvoerbestand. Niets anders aanpassen. Geen betaalde diensten (Runway, HeyGen), geen git.
- De lijntekening wint bij conflict tussen tekening en avatar.

## Invoer (`in-XX.json`, één record per oefening)
`nr`, `naam`, `groep`, `tekening` (het beeld dat de app toont), `avatar` (links/boven start, rechts/onder eind),
`uitleg` (huidige tekst), `physitrack_url` en `physitrack_titel` (eerder gevonden pagina, kan leeg zijn),
`tekening_eerder` (eerder oordeel), `tekening_controleren` (true/false), `eerdere_opmerking`.
Beeldpaden zijn relatief aan `/Users/builder/Fysiplan-crosscheck/public/`. Bekijk ze met de Read-tool.

## Werkwijze per oefening
1. Bekijk tekening en avatar.
2. Physitrack: heeft het record een `physitrack_url` die past, lees die pagina (web-fetch) of gebruik wat je er
   al van weet uit de titel en eerdere opmerking als je zeker bent. Geen URL of past hij niet: WebSearch met
   `allowed_domains: ["physitrack.com"]` en een Engelse zoekterm. Kies de variant die past bij naam én tekening.
3. Oordelen, telkens precies één van: `ok`, `licht`, `afwijkend`, `fout`, `geen match`.
   - tekening: alleen echt beoordelen als `tekening_controleren` true is (houding, materiaal, greep, pijlrichting,
     één duidelijke pijl). Is hij false: neem het woord voor het oordeel uit `tekening_eerder` over (ok), tenzij je bij
     het kijken iets duidelijk fout ziet; zet dat dan in de reden.
     `licht` = alleen kleine pijl- of detailkwestie, bruikbaar; `afwijkend` = andere variant/houding dan Physitrack;
     `fout` = verkeerde oefening of onmogelijke houding.
   - avatar: zelfde houding, materiaal, greep en beweging (start → eind) als de tekening en Physitrack? Zelfde vrouw
     en stijl is niet jouw punt; het gaat om de oefening.
   - uitleg: klopt de richting met Physitrack én met de tekening (beginhouding, beweging, greep, materiaal)?
     Niet 1-op-1; kleine stijlverschillen zijn ok.
   Geen Physitrack-tegenhanger (TRX, Bodyblade, apparaten e.d.): `geen match` voor tekening/uitleg, maar beoordeel
   de avatar dan tegen de tekening en zet `dichtstbij:` in de reden als er een redelijke pagina is.
4. Wijkt de uitleg af (licht/afwijkend/fout): schrijf `nieuwe_uitleg`: Nederlands, B1, je-vorm, 1 tot 3 zinnen,
   eerst beginhouding dan beweging, zelfde richting als Physitrack, eigen woorden. Anders leeg.
5. `reden`: kort Nederlands, wat precies afwijkt en wat er moet veranderen. Leeg mag als alles ok is.

## Uitvoer
`/Users/builder/Fysiplan-crosscheck/output/physitrack-crosscheck/ronde3/batches/out-XX.jsonl`, één JSON per regel,
zelfde volgorde als de invoer, precies deze velden:
{"nr":0,"naam":"","physitrack_url":"","tekening":"","avatar":"","uitleg":"","nieuwe_uitleg":"","reden":""}
Schrijf tussentijds bij (na elke 5 oefeningen). Lever alle records op, ook bij twijfel (twijfel in de reden).
