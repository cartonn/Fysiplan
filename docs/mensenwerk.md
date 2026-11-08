# Mensenwerk

Wat alleen Ahmed (of een jurist) kan doen. Routines zetten hier punten neer en bouwen ze niet zelf.

## Voor Ahmed

### Vraaghulp op de kaart (legal, 2026-11-07)
**Wat de code nu doet:** met `ANTHROPIC_API_KEY` ziet elke patiënt "Vraag over je oefeningen (AI)".
Vragen over pijn, klachten, medicijnen of herstel gaan sinds 7 november niet meer naar de AI-dienst;
de patiënt krijgt een vaste verwijzing naar de eigen praktijk. Andere vragen (hoe diep zakken?) gaan
wel naar Anthropic in de VS.
**Wat jij moet kiezen:** wil je dat een praktijk de vraaghulp voor haar patiënten zelf kan uitzetten?
Advies: ja, als een praktijk of jurist erom vraagt (een praktijk is verantwoordelijk voor doorgifte
buiten de EU). Zeg het, dan bouwt de legal-routine een schakelaar in de praktijkinstellingen.

### Eigen logins en het nieuwe akkoord (legal, 2026-11-07)
**Wat de code nu doet:** elke praktijk ziet na inloggen één keer "De voorwaarden zijn bijgewerkt"
met wat er veranderd is; een beheerder vinkt opnieuw aan. Daarna staat per praktijk vast welke
versie, wanneer en wie (ook in de download van /v2/gegevens).
**Wat jij moet doen:**
1. GEDAAN (Ahmed koos 2026-11-07 het advies): voorwaarden art. 4 zeggen nu dat elke eigen login
   telt als één therapeut (`AV_VERSIE` 2026-11-07-3).
2. Railway bewaart logs 7 dagen (Hobby) of 30 dagen (Pro). De privacyverklaring zegt "hooguit 30
   dagen"; dat klopt voor beide. Alleen bij Enterprise (tot 90 dagen) moet de tekst mee.
3. Laat de jurist privacyverklaring, verwerkersovereenkomst en voorwaarden samen toetsen (staat al
   hieronder bij Algemene voorwaarden, punt 7).

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
4. Mollie staat nu vanzelf in de privacyverklaring zodra de sleutel staat (legal, 2026-11-07), en
   de voorwaarden beschrijven de eerste maand vooraf. Nog in te vullen in de voorwaarden (art. 4):
   betaalwijze, factuurmoment en betaaltermijn **na** de eerste maand. Let op: de voorwaarden
   beloven dat je praktijken laat weten voordat de automatische maandincasso begint; doe dat (of
   laat de code het doen) vóór de eerste incasso. Laat de 7 jaar bewaren door je boekhouder bevestigen.
**Nog niet gebouwd (volgende runs):** de maandelijkse incasso na maand 1 (Mollie-subscription op het
mandaat) en opzeggen in de app. Tot dan: de eerste maand loopt via Mollie, de rest regel je zelf.

### Factuur per online betaling (praktijk-routine, 2026-11-08)
**Wat de code nu doet:** na een online betaling ziet de praktijk op de bedankpagina en in "Mijn proef"
een link naar `/v2/proef/factuur` (alleen met de eigen proefcookie, printbaar, scriptloos). Elke betaling
krijgt een doorlopend nummer per jaar (`FP-2026-0001`, ...), dat ook na "Alles wissen" 7 jaar bewaard blijft.
Zonder btw-id is het een **betaalbewijs** met de zin "geen factuur voor de btw"; met de variabelen hieronder
een **factuur** met 21% btw uitgesplitst.
**Wat jij moet doen:**
1. Zet op Railway `FYSIPLAN_BTW_NUMMER` (je btw-id, `NL…B01`), naast `FYSIPLAN_BEDRIJF`, `FYSIPLAN_KVK` en
   `FYSIPLAN_ADRES`. Pas als alle vier er staan, heet de pagina "Factuur".
2. **Beslissen (btw):** de landing en voorwaarden zeggen "exclusief btw", maar Mollie schrijft nu precies
   prijs × therapeuten af. De factuur rekent de btw daarom **uit** het betaalde bedrag (bij 10 euro: 8,26 +
   1,74 btw). Wil je de btw er bovenop (12,10 incl.), zeg het; dan past deze routine het afrekenbedrag aan.
   Zit je in de kleineondernemersregeling (KOR), laat `FYSIPLAN_BTW_NUMMER` dan leeg en meld het, dan komt er
   een KOR-factuur zonder btw.
3. Boven 100 euro incl. btw (vanaf 9 therapeuten bij 10 euro) vraagt de wet ook het adres van de praktijk op
   de factuur. Fysiplan vraagt dat nu niet; laat het je boekhouder bevestigen, dan bouwt een volgende run
   een veld "factuuradres".


### Engelse oefennamen in de Nederlandse bibliotheek (gebruikers-sweep, 2026-11-07)
**Wat er is:** op een Nederlandse patiëntkaart staan namen als "Knee elbow", "Med ball rotation passes knee",
"Leg extension", "Seated chair squats", "Abs stretch" en "Abroller". Ze komen uit `public/oefeningen-v2.json`
(o.a. r. 650 en 4469). Routines raken die bestanden niet aan, want daar werkt jouw videostroom aan.
**Wat jij moet doen:** laat in de videostroom (of zelf) Nederlandse namen kiezen voor de Engelstalige oefeningen.

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
