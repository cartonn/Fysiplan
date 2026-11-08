# Controle van de GETOONDE lijntekening tegen Physitrack

De app toont voor deze oefeningen een hertekening (veld `getoond`, pad onder /Users/builder/Fysiplan-crosscheck/public/).
Per oefening:
1. Bekijk het getoonde beeld met de Read-tool.
2. Leg het naast Physitrack: gebruik `physitrack_url` (lees de pagina met web-fetch als je twijfelt) of zoek zelf (WebSearch, allowed_domains ["physitrack.com"]) als er geen url is of die niet past. Gebruik ook `uitleg` (die is al volgens Physitrack herschreven).
3. Oordeel `tekening_getoond`: `ok`, `licht afwijkend`, `afwijkend`, `fout` of `geen Physitrack-match` (dan alleen tegen de uitleg beoordelen en dat in de opmerking zetten).
   Let op: beginhouding, richting van de pijl, greep, materiaal, één figuur. Een tekening toont de BEGINhouding met één pijl naar de eindhouding.
4. `opmerking`: kort Nederlands, wat er afwijkt en wat de tekening moet tonen (leeg bij ok).
Regels: nooit tekst of beeld van Physitrack kopiëren; eigen woorden. Alleen je uitvoerbestand schrijven, geen git.
Uitvoer: JSONL `out-N.jsonl` in dezelfde map, één regel per oefening in invoervolgorde:
{"nr":0,"naam":"","physitrack_url":"","tekening_getoond":"","opmerking":""}
Schrijf tussentijds bij.
