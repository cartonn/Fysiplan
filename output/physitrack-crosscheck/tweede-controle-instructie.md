# Tweede controle: nieuwe oefenuitleg tegen Physitrack

Je krijgt een lijst oefeningen (nr, naam, groep, nieuwe_uitleg, img). Per oefening:
1. Bekijk de lijntekening met de Read-tool: /Users/builder/Fysiplan-crosscheck/public/<img>.
2. Zoek ZELF de best passende Physitrack-pagina: WebSearch met allowed_domains ["physitrack.com"], Engelse zoekterm. Kies de variant die past bij wat de tekening toont. Lees de pagina zo nodig (web-fetch).
3. Beoordeel of de nieuwe uitleg dezelfde richting heeft als Physitrack (beginhouding, beweging, greep, materiaal) en niet botst met de lijntekening.
   Oordeel: `ok`, `kleine aanpassing` of `fout`. Bij kleine aanpassing/fout: een voorstel voor de uitleg in dezelfde stijl
   (Nederlands, B1, je-vorm, 1 tot 3 zinnen, eerst beginhouding dan beweging). Heeft Physitrack de oefening niet (TRX, apparaat, Bodyblade e.d.): beoordeel alleen tegen de tekening en zet "geen Physitrack-match" in de toelichting.
Regels: nooit tekst of beeld van Physitrack kopiëren; alles in eigen woorden. Niets anders aanpassen dan je uitvoerbestand. Geen git.
Uitvoer: JSONL, één regel per oefening in invoervolgorde, velden:
{"nr":0,"naam":"","physitrack_url":"","physitrack_titel":"","oordeel":"ok|kleine aanpassing|fout","voorstel":"","toelichting":""}
`toelichting`: kort Nederlands, wat er afwijkt (leeg mag bij ok). Schrijf tussentijds bij.
