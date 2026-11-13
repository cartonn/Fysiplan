# Handmatige demorondes voor staf en groei

De pagina Beheer → Demo → Agents heeft voor de chief of staff en groei-agent een knop **Start demoronde**. De server roept `claude-haiku-5-5` aan en verwerkt maximaal drie acties via de bestaande rol- en goedkeuringspoort. Er wordt niets gemaild, gebeld, gemerged of gepubliceerd. Er is geen timer en geen automatische herpoging.

## Koppeling en grenzen

- `AGENT_DEMO_API_KEY` en eventueel `AGENT_DEMO_WORKSPACE_ID` koppelen alleen deze demorondes. De sleutel verschijnt nooit in de browser. Een al ingestelde `ANTHROPIC_API_KEY` / `ANTHROPIC_WORKSPACE_ID` kan ook worden gebruikt. De afzonderlijke demo-variabelen zetten de patiëntvraaghulp of andere AI-functies niet aan.
- Zes aanvragen per rol per kalenderdag (serverfunctie `dagVan`), inclusief mislukte aanvragen. Het budget staat los van de demo in het bestaande loketbestand en blijft over reset en herstart behouden.
- Maximaal 40.000 bytes werkinvoer en 2.000 uitvoertokens per aanvraag; geen tools of externe links volgen; één lopende ronde tegelijk per serverproces.
- De knop werkt alleen in Demo, voor staf/groei op Proef, met beheerrecht Agents. De globale stopknop en de demostop gelden ook. Na stoppen, uitschakelen of reset tijdens de aanvraag wordt het antwoord niet uitgevoerd. Een aanvraag die al bij de provider loopt kan wel kosten maken.
- Dit is een handmatige serveraanroep. Er zijn hiervoor geen Claude-projecten of rolsleutels nodig. De externe geplande Claude-taken blijven een afzonderlijke route, met een eigen sleutel per rol. Er zijn geen nieuwe geplande taken gemaakt.
- Uitrol van deze branch alleen naar de Railway-testservice; main/productie pas na review en expliciete merge.

## Werkstroom

Staf kan taken voorstellen en advies bij bestaande taken bewaren. Beheer zet een groeitaak open; de groei-agent krijgt de open taak met code en advies in zijn werkpakket. Hij kan een concept aan die code koppelen. Beheer keurt het concept goed of wijst het met feedback af. Zowel de tekst als feedback blijft beschikbaar voor volgende rondes; een goedgekeurde tekst blijft leesbaar in beheer. Een concept markeert een taak niet automatisch als klaar.

Contactvoorstellen controleren kanaaltoestemming, afmelding en recent contact opnieuw bij goedkeuren én bij afronden. Herkenbare persoonsgegevens worden ook in het doelveld van een concept geweigerd. Het tekstfilter is een vangnet, geen garantie van anonimiteit of inhoudelijke juistheid. Beheer blijft verantwoordelijk voor beoordeling.

## Verificatie 13 november 2026

- `npm run test:beheeromgeving` bevat ook `test:demomodel`: echte lokale HTTP-server met gesimuleerde provider voor verkeerde rol, parallelle aanvraag, stop tijdens aanvraag, providerfout, ongeldig JSON-antwoord, budget, demo-reset en herstart.
- `test:agentgeheugen`: overdracht staf → open groeitaak → gekoppeld concept, feedback, gesloten taak, gewijzigde toestemming en doelveld met persoonsgegevens.
- Echte Haiku-proef op uitsluitend lokale demogegevens: staf gaf een advies bij een bestaande taak; groei schreef een concept voor papier/QR-kaarten gekoppeld aan een open groeitaak en stelde toegestaan contact voor. Browser: goedkeuren en volledige tekst daarna teruglezen werkte.
- In de eerste proef ontbrak een vereist adviesveld; de schema's hebben nu verplichte velden per actie. Een ontkennende medische zin werd door de bestaande strenge controle geweigerd; de prompt vermijdt die termen en geeft concrete weigeringen terug voor de volgende ronde.
- Dit is een kleine acceptatieproef, geen bewijs dat elk toekomstig antwoord goed is.

Model/prijzen gecontroleerd op de officiële [modelpagina](https://platform.claude.com/docs/en/models/haiku-5-5/overview) en [prijslijst](https://platform.claude.com/docs/en/about-claude/pricing). Geen automatische overstap naar een duurder model.
