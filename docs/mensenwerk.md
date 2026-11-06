# Mensenwerk

Wat alleen Ahmed (of een jurist) kan doen. Routines zetten hier punten neer en bouwen ze niet zelf.

## Voor Ahmed

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
