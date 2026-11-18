# De testomgeving

Een testomgeving is dezelfde server als fysiplan.nl, op een eigen adres, met verzonnen praktijken en patiënten. Je
probeert er iets uit zonder dat een echte praktijk of patiënt er iets van merkt.

De regels staan in `lib/omgeving.js`, de nepgegevens in `scripts/nepgegevens.mjs`, de test is `npm run test:omgeving`.

## Waarom de server zelf oplet

Bij Railway maak je een tweede omgeving het snelst door productie te kopiëren. Dan gaan alle variabelen mee: de sleutel
van de mail, van Mollie, van de reservekopie. Een kopie die daar gewoon mee start, mailt echte mensen en schrijft over de
reservekopie van productie heen. Daarom beslist de server bij het starten zelf welke omgeving hij is, en doet hij in een
testomgeving niets echts, ook als de sleutels van productie erbij staan.

## Hoe de server weet welke omgeving hij is

| Situatie | Omgeving |
| --- | --- |
| De variabele `OMGEVING` is `test` of `productie` | Wat er staat. Dit wint van alles hieronder. |
| Op Railway, de omgeving heet `production` (of heeft geen naam) | Productie |
| Op Railway, de omgeving heet `test` | Test |
| Op Railway, de omgeving heet anders (`staging`, `production-copy`, een PR-omgeving) | De server start niet en zegt in het logboek waarom |
| Niet op Railway | Lokaal (je eigen computer) |

Productie hoeft dus niets ingesteld te krijgen: de omgeving bij Railway heet al `production`. Zet `OMGEVING` daar niet.

`/health` zegt welke omgeving het is, in het veld `omgeving`.

## Het merk in de datamap

Een testomgeving zet in haar datamap het bestand `omgeving.json`. Daarmee kan het volgende niet meer gebeuren:

- **Een testomgeving op de gegevens van productie.** Een testomgeving start alleen op een lege map of op een map met het
  merk. Staan er gegevens zonder merk, dan start ze niet en raakt ze niets aan.
- **Productie op de gegevens van een testomgeving.** Productie (en een lokale server) start niet op een map met het merk.

## Wat een testomgeving anders doet

| Onderdeel | In een testomgeving |
| --- | --- |
| Mail | Elk bericht komt in de testpostbak (`/test/postbak`, alleen voor beheer). Er gaat alleen echt een mail uit naar een adres dat in `TEST_MAIL_AAN` staat, en dan met `[TEST]` voor het onderwerp. |
| Links in berichten | Wijzen naar de testomgeving zelf, nooit naar fysiplan.nl. |
| Betalen (Mollie) | Uit. Alleen een sleutel die met `test_` begint, wordt gebruikt. Een echte sleutel wordt genegeerd. |
| Reservekopie buiten Railway | Uit, ook als de `BACKUP_…`-variabelen er staan. Een testomgeving schrijft dus nooit over de reservekopie van productie. |
| Video (Cloudflare) | Uit. Video's blijven op het eigen volume. |
| Elke pagina | Een rood lint links met "TESTOMGEVING · nepgegevens". |
| Zoekmachines | Niets wordt opgenomen: `robots.txt` weigert alles en elke pagina zegt `noindex`. |

Wat de server negeert, noemt hij bij het starten in het logboek, in regels die met `TESTOMGEVING` beginnen.

Wat niet verandert: de taalhulp. Staat `ANTHROPIC_API_KEY` in de testomgeving, dan werkt de vraaghulp daar ook en kost
ze geld. Laat de sleutel weg als je dat niet wilt. De remmen (aantal aanmeldingen, aantal inlogpogingen) zijn dezelfde
als in productie.

Twee kleine dingen die je kunt zien: op het werkscherm en de patiëntkaart staat `[TEST]` niet in de titel van het tabblad
(die pagina's kiezen hun titel zelf), het lint staat er wel. En op een telefoon ligt het lint over de eerste millimeters
van de linkerrand.

## Zo maak je de testomgeving bij Railway

Dit kan alleen wie bij Railway mag inloggen.

1. Open het project "Fysiplan" en maak een nieuwe omgeving met de naam **`test`**. Precies die naam: met een andere naam
   start de server niet. Kopiëren van `production` mag, daarvoor zijn de regels hierboven.
2. Geef de service in die omgeving een **nieuw, leeg volume** op `/data`. Koppel nooit het volume van productie.
3. Geef de service een eigen adres (Settings, Networking, "Generate domain"). De server gebruikt dat adres vanzelf in
   links. Heb je een eigen domein voor de testomgeving, zet het dan in `FYSIPLAN_BASIS_URL`.
4. Zet in de testomgeving deze variabelen:
   - `ADMIN_KEY`: een eigen, nieuwe sleutel. Niet die van productie. Zonder sleutel is de testpostbak voor niemand te lezen.
   - `TEST_MAIL_AAN`: je eigen adres (meer adressen met een komma ertussen), als je een mail ook echt wilt ontvangen.
     Een adres met een plus (`naam+collega@…`) telt als hetzelfde adres. Laat je dit leeg, dan wordt er niets verstuurd.
5. Wacht tot de uitrol klaar is en open `/health` op het nieuwe adres. Er hoort `"omgeving":"test"` te staan.
6. Zet de nepgegevens erin, vanaf je eigen computer in de map van de repository:

   ```
   node scripts/nepgegevens.mjs https://adres-van-de-testomgeving
   ```

   Het script print per login het e-mailadres, het wachtwoord, de sleutel voor de code-app en acht reservecodes. Bewaar
   dat overzicht: de wachtwoorden worden op dat moment gemaakt en staan nergens anders.

## De nepgegevens

Twee verzonnen praktijken: "Proefpraktijk De Linde" (een beheerder en een collega, drie kaarten) en "Fysio Voorbeeld
Zuid" (een beheerder, twee kaarten). Op de kaarten staan oefeningen uit de bibliotheek, en bij vier ervan wat een patiënt
de afgelopen dagen invulde: pijnscores, afgevinkte dagen en hoe het gaat. Eén kaart loopt goed, bij één loopt de pijn op,
één is net gestart.

Het script doet dezelfde verzoeken als een therapeut en een patiënt. Het begint alleen als `/health` zegt dat het een
testomgeving of een lokale server is; op productie doet het niets. Alle adressen eindigen op `example.org`.

Een tweede keer draaien zegt dat de gegevens er al staan. Een tweede stel ernaast kan met `--set=b`, op zijn vroegst een
dag later, omdat de server vijf nieuwe praktijken per dag per adres toelaat.

Opnieuw beginnen: verwijder bij Railway het volume van de testomgeving, koppel een nieuw leeg volume en draai het script
opnieuw.

## Wat dit nog niet is

Een wijziging komt nu nog niet eerst op de testomgeving: Railway rolt `main` uit naar elke omgeving die aan `main` hangt,
dus productie en test krijgen een wijziging tegelijk. Wil je dat een wijziging eerst op test staat en pas na een akkoord
naar productie gaat, dan moet productie aan een eigen tak hangen (bijvoorbeeld `productie`) en moet iemand die tak
bijwerken. Dat verandert hoe er wordt uitgerold en is een keuze van de eigenaar; zie `docs/mensenwerk.md`.
