# Handmatige demorondes voor staf en groei

De pagina Beheer → Demo → Agents heeft voor de chief of staff en groei-agent een knop **Start demoronde**. De server roept `claude-haiku-5-5` aan en verwerkt maximaal drie acties via de bestaande rol- en goedkeuringspoort. Er wordt niets gemaild, gebeld, gemerged of gepubliceerd. Er is geen timer en geen automatische herpoging.

## Koppeling en grenzen

- `AGENT_DEMO_API_KEY` en eventueel `AGENT_DEMO_WORKSPACE_ID` koppelen alleen deze demorondes. De sleutel verschijnt nooit in de browser. Een al ingestelde `ANTHROPIC_API_KEY` / `ANTHROPIC_WORKSPACE_ID` kan ook worden gebruikt. De afzonderlijke demo-variabelen zetten de patiëntvraaghulp of andere AI-functies niet aan.
- Twintig aanvragen per rol per kalenderdag (serverfunctie `dagVan`), inclusief mislukte aanvragen. Het budget staat los van de demo in het bestaande loketbestand en blijft over reset en herstart behouden.
- Maximaal 40.000 bytes werkinvoer en 4.000 uitvoertokens per aanvraag; geen tools of externe links volgen; één lopende ronde tegelijk per serverproces.
- De knop werkt alleen in Demo, voor staf/groei op Proef, met beheerrecht Agents. De globale stopknop en de demostop gelden ook. Na stoppen, uitschakelen of reset tijdens de aanvraag wordt het antwoord niet uitgevoerd. Een aanvraag die al bij de provider loopt kan wel kosten maken.
- Dit is een handmatige serveraanroep. Er zijn hiervoor geen Claude-projecten of rolsleutels nodig. De externe geplande Claude-taken blijven een afzonderlijke route, met een eigen sleutel per rol. Er zijn geen nieuwe geplande taken gemaakt.
- Uitrol van deze branch alleen naar de Railway-testservice; main/productie pas na review en expliciete merge.

## Werkstroom

Staf kan taken voorstellen en advies bij bestaande taken bewaren. Beheer zet een groeitaak open; de groei-agent krijgt de open taak met code en advies in zijn werkpakket. Hij kan een concept aan die code koppelen. Beheer keurt het concept goed of wijst het met feedback af. Voor volgende modelrondes blijven de metadata en feedback beschikbaar; de volledige eerdere concepttekst gaat niet opnieuw naar het model. De volledige tekst blijft leesbaar in beheer. Een concept markeert een taak niet automatisch als klaar.

Contactvoorstellen controleren kanaaltoestemming, afmelding en recent contact opnieuw bij goedkeuren én bij afronden. Herkenbare persoonsgegevens worden ook in het doelveld van een concept geweigerd. Het tekstfilter is een vangnet, geen garantie van anonimiteit of inhoudelijke juistheid. Beheer blijft verantwoordelijk voor beoordeling.

## Verificatie 13 november 2026

- `npm run test:beheeromgeving` bevat ook `test:demomodel`: echte lokale HTTP-server met gesimuleerde provider voor verkeerde rol, parallelle aanvraag, stop tijdens aanvraag, providerfout, ongeldig JSON-antwoord, budget, demo-reset en herstart.
- `test:agentgeheugen`: overdracht staf → open groeitaak → gekoppeld concept, feedback, gesloten taak, gewijzigde toestemming en doelveld met persoonsgegevens.
- Echte Haiku-proef op uitsluitend lokale demogegevens: staf gaf een advies bij een bestaande taak; groei schreef een concept voor papier/QR-kaarten gekoppeld aan een open groeitaak en stelde toegestaan contact voor. Browser: goedkeuren en volledige tekst daarna teruglezen werkte.
- In de eerste proef ontbrak een vereist adviesveld; de schema's hebben nu verplichte velden per actie. Een ontkennende medische zin werd door de bestaande strenge controle geweigerd; de prompt vermijdt die termen en geeft concrete weigeringen terug voor de volgende ronde.
- Dit is een kleine acceptatieproef, geen bewijs dat elk toekomstig antwoord goed is.

Model/prijzen gecontroleerd op de officiële [modelpagina](https://platform.claude.com/docs/en/models/haiku-5-5/overview) en [prijslijst](https://platform.claude.com/docs/en/about-claude/pricing). Geen automatische overstap naar een duurder model.

## Eerste acceptatieproef op de testservice (historisch)

Op 13 november is een echte stafronde gelukt (advies opgeslagen). De groei-agent is nog niet betrouwbaar geaccepteerd: een ronde werd inhoudelijk geweigerd, waarna de modelinvoer is verbeterd; de laatste ronde op `f6a623d` gaf `modelantwoord-ongeldig` zonder acties te verwerken. De exacte oorzaak van dat ongeldige antwoord is nog niet vastgesteld. De zes groeirondes voor vandaag zijn gebruikt; de limiet is niet gereset. Dit blijft een open acceptatiepunt, geen geslaagde oplevering van de modelwerking.

De lokale browserproef met uitsluitend testgegevens bevestigde afwijzen met feedback, een taak openzetten, een geldig concept goedkeuren en een bericht naar het demopostvak sturen. Dit bewijst de beheerwerkstroom, niet echte mailbezorging. Staf en groei blijven op proef, berichten op handmatig. Telefonie is op verzoek uitgesteld; geen Twilio-upgrade of telefoonaankoop gedaan. Productie is niet gemerged.

## Hertest na verhoging en reparatie — 13 november 2026, 09:53–09:55 UTC

Op expliciet verzoek is de limiet verhoogd van zes naar twintig aanvragen per rol per dag, met behoud van de bestaande tellers. De uitvoerruimte is verhoogd van 2.000 naar 4.000 tokens; een afgebroken antwoord wordt apart herkend en nooit uitgevoerd. De precieze oorzaak van de eerdere ongeldige respons is niet achteraf bewezen.

Tegen testcommit `6e4e3b7` zijn vier opeenvolgende echte Haiku-rondes via de beheerroute geslaagd:

1. Concept `G-1d761e3b` opgeslagen; beoordeeld en met feedback afgewezen. Het belvoorstel is afgewezen omdat telefonie uitgesteld is.
2. Herziening `G-42624e81` opgeslagen; de formulering over papier/telefoon was nog verwarrend en kreeg concrete feedback. Geen nieuw belvoorstel.
3. Herziening `G-5b8576d6` opgeslagen: één oefenkaart, op papier of via QR-code op de telefoon. Staat op wacht voor menselijke beoordeling.
4. Nieuwe ronde geeft nul acties: bestaand wachtend concept en contactbeperkingen correct herkend. Geen dubbel concept.

`test:beheeromgeving` en `sweep:agentgeheugen` (14 scenario's) slagen. Een extra regressietest simuleert een afgebroken providerantwoord en controleert de specifieke foutcategorie. Deze test bevestigt de werkstroom met inhoudelijke feedback; het is geen garantie dat toekomstige teksten zonder redactie goed zijn. Staf/groei blijven op proef, berichten handmatig. Geen productie-merge, echte mail of telefoongesprek.
