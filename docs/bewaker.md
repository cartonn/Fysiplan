# De bewaker van buitenaf

De bewaker kijkt om de vijf minuten of fysiplan.nl het doet, vanaf een machine van GitHub. Hij draait dus niet op
Railway: valt de server om, dan valt het alarm niet mee om. Gaat er iets mis, dan opent hij een issue in deze repository
op naam van de eigenaar. Is het voorbij, dan sluit hij het issue weer.

De code staat in `scripts/bewaker.mjs`, het rooster in `.github/workflows/bewaker.yml`, de test is `npm run test:bewaker`.

## Wat hij nakijkt

| Wat | Wanneer is het een storing |
| --- | --- |
| De server (`/health`) | Geen antwoord, een foutcode, of een antwoord dat niet van Fysiplan is |
| De landingspagina (`/v2`) | Geen antwoord, een foutcode, of een pagina waar Fysiplan niet op staat |
| Het werkscherm van de therapeut (`/v2/app`) | Idem |
| De oefenbibliotheek (`/v2/oefeningen.json`) | Ontbreekt, of heeft minder dan 500 oefeningen |
| De reservekopie buiten Railway | Mislukt, of de laatste volledige kopie is ouder dan 36 uur |
| Het blijvende volume | De gegevens staan er niet op (na een herstart zouden ze weg zijn) |
| Serverfouten | Meer dan 10 in het afgelopen uur |

Minder dringend, dus alleen een opmerking bij de ronde en geen issue: de reservekopie staat uit of is niet volledig, de
gegevens zijn over de helft van wat in de reservekopie past, of er mislukten in een uur meer dan 20 verzoeken aan een
dienst van buiten (mail, video, betalen of de taalhulp).

Eén mislukte poging is nog geen storing. Een uitrol herstart de server en dan is hij even weg. Wat niet antwoordt, vraagt
de bewaker na een halve minuut opnieuw, en daarna nog een keer. Pas na drie mislukte pogingen telt het.

## Wat er gebeurt bij een storing

1. Er komt een issue met de titel "Storing: fysiplan.nl werkt niet goed", op naam van de eigenaar van de repository. Erin
   staat in gewone taal wat er mis is en waar je kunt kijken.
2. Die ene ronde kleurt rood in het tabblad Actions.
3. Is er een adres voor je telefoon ingesteld (zie hieronder), dan gaat daar een bericht heen.
4. Zolang dezelfde storing duurt, schrijft de bewaker niets meer. Verandert ze, dan past hij de tekst van het issue aan.
   Een nieuw bericht komt er alleen als er iets misgaat dat nog niet gemeld was.
5. Zijn twee rondes achter elkaar weer goed, dan zet hij "Voorbij" bij het issue, met hoe lang het duurde, en sluit hij het.
6. Komt er binnen twaalf uur opnieuw een storing, dan gaat die verder in hetzelfde issue.

Sluit je het issue zelf terwijl de storing nog loopt, dan opent de bewaker het bij de volgende ronde weer.

Zolang de repository openbaar is, kan iedereen het issue lezen. Er staat alleen in wat er mis is met de site, en nooit
iets over een praktijk of een patiënt. Hetzelfde staat al openbaar op `/health`.

## Jouw deel: zorg dat het alarm je bereikt

De bewaker opent het issue. Of jij daar een mail of een melding van krijgt, hangt af van jouw instellingen bij GitHub.
Dat kan ik van buitenaf niet zien, dus controleer het één keer.

1. **Meldingen van GitHub.** Ga op github.com naar je profielfoto, Settings, Notifications. Zorg dat je voor issues die
   aan jou zijn toegewezen een e-mail krijgt (bij "Participating" hoort "Email" aan te staan; de namen van de knoppen
   kunnen iets anders zijn). Met de app van GitHub op je telefoon krijg je er ook een pushbericht van.
2. **Een bericht op je telefoon (aanbevolen).** De bewaker kan bij elke storing een bericht sturen naar een adres dat jij
   kiest.
   - Met de gratis app **ntfy**: installeer de app, abonneer je op een onderwerp met een lange, onraadbare naam, en zet
     het adres `https://ntfy.sh/die-naam` in deze repository onder Settings, Secrets and variables, Actions, New
     repository secret, met de naam `BEWAKER_WEBHOOK`. Wie de naam van het onderwerp kent, kan meelezen. Daarom staat in
     het bericht alleen wat er mis is met de site, en nooit iets over een praktijk of een patiënt.
   - Met **Slack**: maak een "incoming webhook" en zet dat adres in hetzelfde geheim.
3. **Proefmelding.** Ga naar Actions, kies links "bewaker", klik "Run workflow", vink de proefmelding aan en start. Er
   komt een issue "Proefmelding van de bewaker" op jouw naam dat meteen weer dichtgaat, en een bericht op je telefoon als
   je dat hebt ingesteld. Kreeg je niets, dan staan je meldingen bij GitHub niet goed.

## Aan, zuinig of uit

De variabele `BEWAKER` (Settings, Secrets and variables, Actions, tabblad Variables) kiest het rooster.

| `BEWAKER` | Wat er gebeurt |
| --- | --- |
| leeg of `snel` | Om de vijf minuten (de standaard) |
| `zuinig` | Twee keer per uur |
| `uit` | Nooit |

Op `zuinig` en `uit` blijven er in het tabblad Actions rondes verschijnen die zijn overgeslagen ("skipped"). Die starten
geen machine en kosten niets.

Met de variabele `BEWAKER_ADRES` kijkt hij naar een ander adres dan `https://fysiplan.nl`.

Helemaal weg uit de lijst met rondes: Actions, "bewaker", de drie puntjes rechtsboven, "Disable workflow".

## Wat hij niet kan

- **Niet elke minuut.** GitHub start een rooster op zijn vroegst om de vijf minuten, en soms later of een keer niet, vooral
  rond het hele uur. Een storing van een paar minuten kan hij dus missen, en een alarm komt vijf tot tien minuten na het
  begin. (Gelezen in de documentatie van GitHub, 2026-11-12.)
- **Niet bellen.** Hij maakt een issue en stuurt een bericht. Wil je elke minuut een controle en een telefoontje of sms,
  dan heb je een dienst van buiten nodig die dat doet. Laat die `https://fysiplan.nl/health` opvragen en alarm slaan als
  er geen `"ok":true` in het antwoord staat. Dat adres telt niet als bezoek. Welke dienst het best past, heb ik niet
  onderzocht; dat kies en betaal je zelf.
- **Niet in een besloten repository zonder dat je ervoor kiest.** In een openbare repository zijn de machines van GitHub
  gratis. Wordt de repository besloten, dan gaat elke ronde van je tegoed bij GitHub af, en om de vijf minuten zijn dat
  ruim 8.600 rondes per maand. De bewaker zet zichzelf dan uit en opent een issue waarin dat staat. Wil je hem houden,
  zet dan `BEWAKER` op `snel` of `zuinig`. (Dat de machines gratis zijn voor openbare repository's is gelezen bij GitHub;
  wat een ronde in een besloten repository precies kost, heb ik niet kunnen nalezen. Het uitzetten is getest tegen een
  nagemaakte GitHub, niet tegen de echte.)
- **Niet na 60 dagen stilte.** In een openbare repository zet GitHub een rooster uit als er 60 dagen niets in de
  repository is gebeurd. (Gelezen bij GitHub.)
- **Niet in de server kijken.** Hij ziet wat een bezoeker ziet, en wat de server op `/health` over zichzelf zegt. Waarom
  iets misgaat, staat in de logs van Railway.

## Wat de server erbij vertelt

`/health` heeft er twee velden bij gekregen:

- `gestart`: sinds wanneer dit proces draait. Na elke uitrol is dat een nieuw moment.
- `fouten.uur`: hoe vaak de server het afgelopen uur een fout gaf die er niet hoort te zijn (een antwoord 500, of een
  fout die niemand opving). `fouten.buiten`: hoe vaak een dienst van buiten niet deed wat de server vroeg (een antwoord
  502). Het zijn alleen aantallen; na een herstart beginnen ze op nul.

Verzoeken van de bewaker tellen niet mee als bezoek in het dashboard.

## Met de hand

```
node scripts/bewaker.mjs https://fysiplan.nl
```

Dat kijkt alles één keer na en vertelt wat het vond, zonder iets te melden. De afsluitcode is 0 als alles goed is, 1 bij
een storing en 2 als de bewaker zijn werk niet kon doen.
