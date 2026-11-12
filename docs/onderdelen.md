# Testen en onderdelen (reviewlijst punt 15)

## Alle tests in één keer

`npm run test:alles` draait elke stap uit `.github/workflows/ci.yml` (behalve `npm ci`). Eerst de build,
daarna de tests met een paar tegelijk. Elke test start een eigen server op een vrije poort met een eigen
datamap, dus ze zitten elkaar niet in de weg. Op een machine met 4 kernen duurt het rond de 5 minuten,
tegen ruim 14 minuten één voor één.

- `--n=4` hoeveel tegelijk
- `--alleen=kaart` alleen de stappen waarin dit voorkomt
- `--lijst` alleen laten zien wat er zou draaien

De lijst staat op één plek: een nieuwe test zet je in `ci.yml`, en dan draait hij ook lokaal mee.
Een mislukte test wordt niet opnieuw geprobeerd; een test die soms faalt, moet gerepareerd worden.

CI zelf draait de stappen nog één voor één. Dat is bewust: zo wijst een rode stap in GitHub direct de
test aan die faalde.

## De server in onderdelen

`server.js` is groot. Nieuwe en losgehaalde stukken krijgen een eigen bestand in `lib/` met dezelfde vorm:
`maakX(d)` krijgt alles wat het nodig heeft via `d` en geeft `afhandelen(request, response, urlPath)` terug.
Zo'n onderdeel leest en schrijft zelf geen bestanden, en is los te testen.

- `lib/invoer.js`: één plek die zegt wat een verzoek mag bevatten (een JSON-object, een geheel getal binnen
  grenzen, een waarde uit een vaste lijst, een index).
- `lib/patient-routes.js`: alles wat de patiënt op de kaart aantikt (pijnscore, herstel, PSK, geoefend,
  afvinken, te zwaar, seintje, bericht gezien). Elk verzoek gaat door dezelfde poort: de rem op schrijven,
  geen verzoek van een andere site, een body die een object is, en een kaart die bestaat.
  Getest met `npm run test:patientonderdeel`, naast de bestaande tests van de patiëntkant.

Het volgende onderdeel om los te halen is de praktijkkant (inbox, antwoorden, kaarten); dat doen we
stap voor stap, telkens met de bestaande tests groen.
