# Mensenwerk

Wat alleen Ahmed (of een jurist) kan doen. Routines zetten hier punten neer en bouwen ze niet zelf.

## Voor Ahmed

### Online betalen via Mollie (praktijk-routine, 2026-11-07)
**Wat de code nu doet:** zet je `MOLLIE_API_KEY` op Railway, dan krijgen "Mijn proef" en de
verlopen-pagina een blok "Direct online afrekenen": aantal therapeuten kiezen, eerste maand
(5,99 per therapeut) betalen met iDEAL of kaart bij Mollie. Na betaling wordt de proef meteen een
klant (slot eraf, zelfde als "klant" in /aanmeldingen) en krijg je een mail "Betaald: …". De
betaling is van het type `first`, dus Mollie bewaart een mandaat voor latere maandelijkse incasso.
Zonder sleutel verandert er niets: alleen "Ja, ik wil doorgaan" en jij belt.
**Wat jij moet doen:**
1. Mollie-account aanmaken op mollie.com (KvK-uittreksel en zakelijke rekening nodig), iDEAL en
   creditcard aanzetten, en SEPA-incasso aanvragen (voor maand 2 en verder).
2. Eerst testen: zet `MOLLIE_API_KEY` op de **test**sleutel (`test_…`), betaal één keer via
   https://fysiplan.nl/v2/proef met de testbetaling van Mollie, en kijk of de mail "Betaald" komt.
3. Daarna de **live**sleutel (`live_…`) in `MOLLIE_API_KEY`. De webhook-URL
   (`https://fysiplan.nl/api/mollie/webhook`) geeft de app zelf mee; in Mollie hoef je niets in te stellen.
4. Vóór live: Mollie in de privacyverklaring als ontvanger noemen en de betaalwijze in de
   voorwaarden invullen (staat in de legal-backlog).
**Nog niet gebouwd (volgende runs):** de maandelijkse incasso na maand 1 (Mollie-subscription op het
mandaat), opzeggen in de app, en een factuur/btw-bon per betaling. Tot dan: de eerste maand
loopt via Mollie, de rest regel je zelf.


### Stoppende praktijk: wissen kan nu zelf (legal, 2026-11-06)
Verwerkersovereenkomst art. 10 belooft dat kaarten binnen 30 dagen na het einde gewist worden.
Een praktijk kan dat nu zelf (en vooraf alles downloaden) op https://fysiplan.nl/v2/gegevens.
Zeg dat in je opzegbevestiging. Wist een praktijk het niet zelf, dan moet jij het binnen 30 dagen
regelen; vraag de praktijk dan om het via die pagina te doen, of laat een ontwikkelroutine een
beheerroute bouwen. Laat de jurist ook kijken of de logboekregels (zonder naam) en de
reservekopie van 7 dagen goed in de tekst staan.

### Algemene voorwaarden (legal, 2026-11-06)
Op https://fysiplan.nl/voorwaarden staat een concept, duidelijk gemarkeerd. Vul deze keuzes in
(of laat een jurist ze voorstellen); ze staan in de tekst als oranje invulplek in
`public/juridisch.html`, blok `voorwaarden`:
1. **Betaalwijze en factuur:** incasso of factuur, factuur vooraf per maand, betaaltermijn (bijv. 14 dagen).
2. **Prijswijziging:** hoeveel dagen vooraf je een nieuwe prijs meldt (gebruikelijk 30).
3. **Opzegtermijn:** de landing belooft "maandelijks opzegbaar"; kies bijv. "tegen het einde van de lopende maand".
4. **Aansprakelijkheidsgrens:** bijv. maximaal het bedrag van 3 of 12 maanden abonnement.
5. **Bevoegde rechtbank:** bijv. de rechtbank in het arrondissement van je vestigingsplaats.
6. **KvK, rechtsvorm en adres** komen uit de Railway-variabelen FYSIPLAN_BEDRIJF, FYSIPLAN_KVK,
   FYSIPLAN_ADRES en FYSIPLAN_CONTACT (stonden op 2026-11-02 nog niet). Zonder die variabelen
   toont de pagina alleen "Fysiplan".
7. **Jurist:** laat privacyverklaring, verwerkersovereenkomst en voorwaarden samen toetsen;
   haal daarna het concept-blok weg en verhoog `AV_VERSIE` in server.js.
