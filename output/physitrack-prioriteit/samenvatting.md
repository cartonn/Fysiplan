# Prioriteit ontbrekende Physitrack-oefeningen (9 november 2026)

Alleen gerekend op de lokale Physitrack-inventaris (blijft op de Mac). Er is niets betaald en niets gegenereerd.

**Werkwijze**
- Basis: de 257 unieke standaardsjablonen. Taalvarianten (EN/FR/NL) zijn samengevoegd en zwembadsjablonen (hydrotherapie) weggelaten.
- Een oefening telt als gedekt als er een gelijkwaardige Fysiplan-oefening is (koppeling met zekerheid hoog of midden). De 29 nieuwe oefeningen voor elleboog, pols en hand uit main (69bd45f) tellen ook mee.
- Varianten die alleen verschillen in zijde (links/rechts), optienummer of niveau zijn samengevoegd.
- Een sjabloon is "bruikbaar" als er minstens 3 verschillende gedekte oefeningen in zitten.

**Kerncijfers**
- Ontbrekende oefeningen (na samenvoegen): **731**.
- Nu bruikbare sjablonen: **126 van de 257**.
- Extra bruikbare sjablonen als we de meest gebruikte ontbrekende oefeningen toevoegen:

| Top | Extra sjablonen met ≥3 gedekte oefeningen | Totaal bruikbaar |
|---|---|---|
| 25 | +21 | 147 van 257 |
| 50 | +28 | 154 van 257 |
| 100 | +50 | 176 van 257 |
| 150 | +62 | 188 van 257 |

**Verdeling van de top 150 per regio (meest voorkomende regio in de sjablonen)**

| Regio | Aantal in top 150 | Hoogste rang |
|---|---|---|
| Voet & enkel | 31 | 18 |
| Schouder | 23 | 8 |
| Knie | 21 | 1 |
| Sport | 12 | 30 |
| Lumbaal | 10 | 13 |
| Hele lichaam | 8 | 29 |
| Ademhaling | 6 | 9 |
| Heupen | 6 | 83 |
| Cardiovasculair | 5 | 2 |
| Arbeidsomstandigheden | 5 | 3 |
| Cervicaal | 5 | 10 |
| Vestibulair | 4 | 76 |
| Schoudergordel | 3 | 36 |
| Rug | 2 | 20 |
| Benen | 2 | 48 |
| Orthopedie | 2 | 55 |
| Neurologie | 2 | 91 |
| Zwangerschap en bekken | 1 | 71 |
| Kinderfysiotherapie | 1 | 108 |
| Thoracaal | 1 | 116 |

De volledige ranglijst met de Physitrack-namen per oefening staat alleen lokaal op de Mac:
`Fysiplan-sjablonen/output/physitrack-prioriteit/ranglijst.csv`. Physitrack-gegevens gaan niet naar GitHub.

**Advies**
- De eerste 25 tot 50 oefeningen leveren per oefening het meeste op: met 50 oefeningen worden 28 sjablonen extra bruikbaar.
- Daarna neemt de winst per oefening af: van 50 naar 150 oefeningen levert nog 34 sjablonen extra op.
- Per regio liggen voet en enkel, schouder en knie het verst achter.
