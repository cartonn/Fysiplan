# Mensenwerk

Wat alleen Ahmed (of een jurist) kan doen. Routines zetten hier punten neer en bouwen ze niet zelf.

## Voor Ahmed

### Wat gebeurt er met seintjes na een verlopen proef? (gebruikers-sweep, 2026-11-06)
Na 14 dagen gaat /v2/app op slot, maar patiëntkaarten blijven werken en patiënten kunnen nog
"Het doet te veel pijn" tikken. De therapeut ziet die seintjes dan nergens meer, terwijl de
verlopen-pagina zegt dat patiënten niets merken. Kies: (a) het kaartenoverzicht met seintjes blijft
alleen-lezen open, (b) de verlopen-pagina toont het aantal openstaande seintjes, of (c) de knoppen
op de patiëntkaart verdwijnen na verloop. Advies: (a). Hoort bij de open keuze wat er na de proef gebeurt.

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
