# Veelvoorkomende fysio-oefeningen die V2 nog mist

Datum: 2026-11-06. Vergeleken met alle 604 oefeningen in `public/oefeningen-v2.json` (de 319 met tekening plus de 127 nieuwe uit PR #51 en de overige records). Gezocht op naam én uitleg, zodat varianten die er al zijn (bv. short arc quad = "Knie strekken – liggend", McKenzie = "Rug strekken – liggend", heel slides = "Knie buigen – liggend", pendelen, clamshell, bird dog, kuitrek, open boek) niet dubbel komen.

Werkwijze per oefening (vaste workflow): Physitrack-beginfoto + beschrijving als inspiratie (niet kopiëren), omschrijving uit een betrouwbare fysiobron met bron vastgelegd, dan één lijntekening: één figuur in de echte beginhouding + één zwarte pijl, stijl `public/images/beginhouding-pijl-v1/`. Physitrack is vanuit de cloud geblokkeerd; de Physitrack-controle gebeurt op Ahmeds Mac.

## Voorbeeldset (8, eerst ter goedkeuring)

| # | Oefening | Groep | Waarom veel gebruikt | Bron |
|---|---|---|---|---|
| 1 | Sleeper stretch – zijlig | Bovenste extremiteit | stijve achterkant schouder, werpers | Mike Reinold; Physitrack |
| 2 | Borstrek in deuropening – staand | Bovenste extremiteit | houding, impingement | Krames/OSF; Physitrack |
| 3 | Zijplank op knieën | Core | basis rompstabiliteit, lage rug | ACE; Physitrack |
| 4 | Bekken heffen op een trede | Onderste extremiteit | gluteus medius, knie/heup, lopers | MS Trust; Physitrack |
| 5 | Spanish squat – met band | Onderste extremiteit | patellapees, voorste kniepijn | Welsh Athletics; Physitrack |
| 6 | Copenhagen adductie – korte hefboom | Sportrevalidatie | liesblessure-preventie | Physiotutors; Physitrack |
| 7 | Zenuwglijden zittend – heupzenuw | Rug | uitstralende pijn/ischias | Physitrack; Hinge Health |
| 8 | Voetzool rekken – zittend | Onderste extremiteit | fasciitis plantaris | NHS Fife; Physitrack |

Volledige omschrijving, beginhouding en pijl per oefening: `specs/spec-voorbeeld.json`.

## Rest van de lijst (31, na akkoord op de voorbeeldset)

**Schouder, arm, hand:** arm over de borst rekken (cross-body); vingers langs de muur omhoog (wall walk); wall slides met onderarmen; push-up tegen de muur; buiklig armen heffen in Y; buiklig armen heffen in T; schouder heffen in ruglig met stok; polsbuigers rekken; polsstrekkers rekken; excentrisch pols laten zakken (tenniselleboog); zenuwglijden arm (n. medianus).

**Nek en kaak:** scalenus rekken; mond openen met tong tegen het gehemelte (kaak).

**Rug en romp:** zijplank op onderarm en voeten; Pallof press met elastiek; hamstring rekken in ruglig met band; buiklig op ellebogen (sfinx); buiklig been heffen (heupstrekking).

**Heup, knie, enkel, voet:** Nordic hamstring; heupbuiger rekken geknield; zijwaartse uitval; passieve kniestrekking met hiel op verhoging; excentrisch hiel laten zakken op één been (Alfredson); kuitrek met handdoek in langzit; enkel-ABC schrijven; eenbeenstand op een kussen.

**Balans en vestibulair:** op de hakken lopen; op de tenen lopen; tandemgang (hak-teen lopen); Brandt-Daroff.

## Credits (Runway gpt_image_2, ~5 per tekening)

- Voorbeeldset: 8 × 5 = **40 credits**, met een paar herkansingen ~50.
- Rest: 31 × 5 = 155, met ~15% herkansingen **~180 credits**.
- Totaal ~230 credits voor 39 lijntekeningen. Avatars voor deze set komen later (nog eens ~200) en pas op Ahmeds woord.
- Het saldo (~1100) wordt gedeeld met de avatars van de lege categorieën (~640). Het script stopt daarom automatisch als het saldo onder **650** komt, zodat die reservering intact blijft.

## Uitvoeren op de Mac (pas na akkoord)

```
git fetch origin claude/project-thread-ayl2cu && git checkout claude/project-thread-ayl2cu
node output/veelvoorkomend/genereer-batch.mjs gen voorbeeld
node output/veelvoorkomend/genereer-batch.mjs sheet voorbeeld
```
Daarna per tekening de Physitrack-beginfoto ernaast leggen (alleen lokaal) en afwijkingen herstellen, zoals bij de lege categorieën.
