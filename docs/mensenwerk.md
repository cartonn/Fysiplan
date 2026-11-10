# Mensenwerk

Wat alleen Ahmed (of een jurist) kan doen. Routines zetten hier punten neer en bouwen ze niet zelf.

## Voor Ahmed

### Reservekopie buiten Railway (livegang, 2026-11-10)
**Wat de code nu doet:** de dagelijkse reservekopie stond alleen op hetzelfde Railway-volume als de gegevens zelf. Nu
stuurt de server dezelfde bestanden elke dag (en bij elke start) **versleuteld** naar een opslagbak buiten Railway, in
één bestand per weekdag (`fysiplan-ma.fpb` … `fysiplan-zo.fpb`), dus elders staat nooit meer dan 7 dagen. De opslagdienst
kan de inhoud niet lezen. Video's, foto's en logo's gaan niet mee. Zonder de variabelen hieronder gebeurt er niets.
`/health` toont `backupElders`: `uit`, `ok` of `fout`; bij een fout krijg je hooguit één mail per dag.
**Wat jij moet doen:**
1. Maak bij een Europese opslagdienst een privé-bak (bucket) aan, bijvoorbeeld Scaleway Object Storage (Amsterdam) of
   Cloudflare R2 met regio EU, en maak een toegangssleutel die alleen in die bak mag schrijven en lezen.
2. Zet op Railway: `BACKUP_S3_URL` (adres met de bak erin, bv. `https://s3.nl-ams.scw.cloud/fysiplan-reserve`),
   `BACKUP_S3_REGIO` (bv. `nl-ams`; bij R2 `auto`), `BACKUP_S3_SLEUTEL_ID`, `BACKUP_S3_GEHEIM`, en `BACKUP_SLEUTEL`:
   een zelfgekozen lange wachtzin (minstens 24 tekens). **Bewaar die wachtzin ook buiten Railway** (wachtwoordkluis):
   zonder de wachtzin is de reservekopie niet terug te lezen.
3. Zet `BACKUP_LEVERANCIER` op de naam en plaats van de dienst (bv. `Scaleway (Amsterdam, Nederland)`). Dan staat
   de partij vanzelf in de lijst op /privacy. Het is een nieuwe subverwerker: meld hem vooraf aan praktijken die al
   akkoord gaven (verwerkersovereenkomst) en sluit met de dienst een verwerkersovereenkomst.
4. Controleer daarna https://fysiplan.nl/health: `backupElders` moet `ok` zijn.
5. Terugzetten (één keer oefenen): `BACKUP_SLEUTEL=… node scripts/backup-terugzetten.mjs <bestand.fpb> <lege map>`.

### Fysiplan gebruiken zonder proef of abonnement (security, 2026-11-09 20u)
**Wat de code nu doet:** wie /v2/app opent zonder de proef te starten, kan een praktijk beveiligen en kaarten maken, zonder
einddatum. De proefgrens zit alleen op praktijken die bij de proef horen. Een team met een verlopen proef kan zo met een
nieuwe (of verkeerd getypte) praktijknaam gewoon verder (gebruikers-sweep, Mark). Dit is geen beveiligingsgat maar een
zakelijke keuze.
**Wat jij moet kiezen:** (1) app zonder proef open laten zoals nu, of (2) beveiligen en kaarten delen alleen na een proef of
abonnement (dan moet een collega altijd via een uitnodiging binnenkomen). Advies: (2) zodra de eerste praktijken betalen.

### Einde na de proef en controle door een praktijk (legal, 2026-11-09 13u)
**Wat de code nu doet:** wordt een praktijk na de gratis proef geen klant, dan wist Fysiplan 30 dagen na de proef
alles van die praktijk, ook de kaarten die patiënten nog gebruiken (eerst 90 dagen, nu 30).
**Gekozen:** (1) GEDAAN 2026-11-09: Ahmed koos 30 dagen (gelijk aan een opgezegd abonnement), `PROEF_BEWAAR_DAGEN` = 30.
**Nog open:** (2) De verwerkersovereenkomst zegt nu
dat een praktijk de afspraken mag laten controleren, 14 dagen vooraf afgesproken, op eigen kosten. Laat de jurist
kijken of je een maximum per jaar of een vergoeding voor jouw tijd wilt.

### Einde van een opgezegd abonnement (legal, 2026-11-09)
**Wat de code nu doet:** na opzeggen loopt het abonnement tot het einde van de betaalde maand. Daarna is de
praktijk geen klant meer (geen nieuwe kaarten), en 30 dagen later wist Fysiplan alles van die praktijk; alleen
naam, e-mail, praktijknaam en betaling blijven 7 jaar. Jij krijgt een mail op de dag dat het abonnement stopt.
**Wat jij moet kiezen:** (1) wil je dat de praktijk een paar dagen vóór het wissen nog een mail krijgt? Advies: ja,
zodra er een maandincasso is. (2) Teruggave van geld bij opzeggen halverwege de maand: de code boekt niets terug;
zet je keuze in de voorwaarden (art. 5) of laat de jurist het zeggen. (3) De opzegtermijn in art. 5 is nog een invulplek.

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
(9,99 per therapeut, exclusief btw) betalen met iDEAL of kaart bij Mollie. Na betaling wordt de proef meteen een
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
   de voorwaarden beschrijven de eerste maand vooraf. Sinds 2026-11-10 (legal) beschrijft art. 4 ook
   de maandincasso zoals de code hem doet (mail 5 dagen vooraf, mislukt = jij neemt contact op).
   Laat de jurist kijken of de afgesproken termijn van 5 dagen (standaard 14) zo goed geregeld is. Laat de 7 jaar bewaren door je boekhouder bevestigen.
**Maandincasso:** gebouwd 2026-11-10, staat UIT tot je `MOLLIE_INCASSO=aan` zet (zie hieronder).

### Maandincasso na de eerste maand (praktijk-routine, 2026-11-10)
**Wat de code nu doet:** met `MOLLIE_API_KEY` **én** `MOLLIE_INCASSO=aan` (en werkende mail: `MAIL_API_SLEUTEL` +
`MAIL_AFZENDER`) schrijft Fysiplan elke maand zelf af op de machtiging van de eerste betaling. Vijf dagen vóór het einde
van de betaalde maand krijgt de praktijk een aankondiging (bedrag, datum, hoe opzeggen); pas als die maand om is én de
mail vijf dagen oud is, maakt de server bij Mollie een `recurring`-betaling. Gelukt: de betaalde maand schuift een maand
op, de praktijk krijgt een mail en een eigen factuur (`/v2/proef/factuur?nr=FP-…`, gelinkt op Mijn proef), jij een mail
"Maand betaald". Mislukt: jij krijgt "Maandincasso mislukt", de praktijk een mail; er volgt **geen** nieuwe poging en de
app blijft open. Een opgezegd abonnement wordt nooit geïnd. Zonder `MOLLIE_INCASSO` (of zonder mail) verandert er niets.
Webhook-adres: `FYSIPLAN_BASIS_URL` (standaard `https://fysiplan.nl`) + `/api/mollie/webhook`.
**Wat jij moet doen:**
1. In Mollie SEPA-incasso laten activeren (voor iDEAL-machtigingen nodig).
2. In de voorwaarden (art. 4) invullen: maandelijkse incasso, aankondiging 5 dagen vooraf. Laat dat bij voorkeur de
   legal-routine doen; de SEPA-regel is 14 dagen vooraf, tenzij je een kortere termijn afspreekt in de voorwaarden.
3. Zet daarna op Railway `MOLLIE_INCASSO` = `aan` (eerst met de testsleutel proberen).
4. **Beslissen:** wat er gebeurt na een mislukte incasso. Gebouwd: jij belt, de app blijft open. Alternatief: na X dagen
   zonder betaling op slot (zoals een opgezegd abonnement). Zeg het, dan bouwt deze routine het.

### Abonnement zelf opzeggen (praktijk-routine, 2026-11-09)
**Wat de code nu doet:** een praktijk die online betaalde ziet op https://fysiplan.nl/v2/proef?mijn=1 het blok
"Je abonnement" met factuur en de knop "Abonnement opzeggen" (vinkje verplicht). Opzeggen gaat in per het einde van
de betaalde maand; tot die datum kan de praktijk "Toch doorgaan". Jij krijgt een mail "Opgezegd: …" of "Opzegging
ingetrokken: …", de praktijk een bevestiging (alleen als `MAIL_API_SLEUTEL` en `MAIL_AFZENDER` staan). Er gaat niets
naar Mollie, want er loopt nog geen maandincasso; de komende incasso slaat opgezegde abonnementen over. Ook opgelost:
"Gegevens wissen" op Mijn proef wiste bij een betalende praktijk ook de betaling en het factuurnummer; nu blijft wat de
fiscale bewaarplicht vraagt (7 jaar), net als bij Alles wissen op /v2/gegevens.
Zonder `MOLLIE_API_KEY` bestaat er geen online abonnement, dus verandert er niets.
**Wat jij moet doen:**
1. **Beslissen:** opzegtermijn. Gebouwd is "stopt aan het einde van de betaalde maand" (geen extra termijn). Wil je
   een termijn (bv. een maand), zeg het. Vul dan ook "Opzegtermijn" in de voorwaarden in (staat in de legal-backlog).
2. Na het einde van een opgezegde maand gaat de app nog niet vanzelf op slot; dat komt samen met de maandincasso.
   Tot dan zie je opzeggingen in je mail en zet je de praktijk zelf op "geen klant" in /aanmeldingen.

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
   prijs × therapeuten af. De factuur rekent de btw daarom **uit** het betaalde bedrag (bij 9,99 euro: 8,26 +
   1,73 btw). Wil je de btw er bovenop (12,09 incl.), zeg het; dan past deze routine het afrekenbedrag aan.
   Zit je in de kleineondernemersregeling (KOR), laat `FYSIPLAN_BTW_NUMMER` dan leeg en meld het, dan komt er
   een KOR-factuur zonder btw.
3. Boven 100 euro incl. btw (vanaf 9 therapeuten bij 9,99 euro) vraagt de wet ook het adres van de praktijk op
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
1. ~~**Betaalwijze en factuur**~~ ingevuld 2026-11-10 volgens de gebouwde maandincasso (art. 4); wil je het anders, zeg het.
2. **Prijswijziging:** hoeveel dagen vooraf je een nieuwe prijs meldt (gebruikelijk 30).
3. **Opzegtermijn:** de landing belooft "maandelijks opzegbaar"; kies bijv. "tegen het einde van de lopende maand".
4. **Aansprakelijkheidsgrens:** bijv. maximaal het bedrag van 3 of 12 maanden abonnement.
5. **Bevoegde rechtbank:** bijv. de rechtbank in het arrondissement van je vestigingsplaats.
6. **KvK, rechtsvorm en adres** komen uit de Railway-variabelen FYSIPLAN_BEDRIJF, FYSIPLAN_KVK,
   FYSIPLAN_ADRES en FYSIPLAN_CONTACT (stonden op 2026-11-02 nog niet). Zonder die variabelen
   toont de pagina alleen "Fysiplan".
7. **Jurist:** laat privacyverklaring, verwerkersovereenkomst en voorwaarden samen toetsen;
   haal daarna het concept-blok weg en verhoog `AV_VERSIE` in server.js.
