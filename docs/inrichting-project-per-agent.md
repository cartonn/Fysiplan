# Inrichting: een apart Claude-project per agent

Stand 2026-11-12, hoort bij draft-PR #260 (sleutel per rol). Dit is een beschrijving. Ik heb niets ingericht, aangezet of uitgezet. De agents blijven op **proef** en eigen berichten op **handmatig**.

## Waarom een eigen project per agent

Een geplande taak in een Claude-project draait altijd in de cloud-omgeving van het **project**, niet in een omgeving per taak. Dat heb ik gemeten bij het maken van de huidige taken. Vijf sleutels in één gedeelde omgeving zouden dus in elke run van elk project-thread zitten: elke agent (en elke andere thread) zou elke sleutel kunnen meesturen. Met één project per agent zit in elke omgeving precies één sleutel, die alleen opent wat bij die rol hoort. De server leidt de rol af uit de sleutel, niet uit het adres.

## Per agent hetzelfde recept

Vijf projecten: **Fysiplan support-agent**, **tech-agent**, **finance-agent**, **chief of staff** en **groei-agent**. Begin met de drie die nu draaien (support, tech, finance). Staf en groei kunnen pas na merge van #260 en blijven dan op proef.

Per project:

1. **Project aanmaken** in Claude met alleen de repo `cartonn/Fysiplan` erbij. Geen connectors (geen GitHub-schrijfrechten, geen mail, geen Linear). De tech-agent heeft voor verslagen geen GitHub nodig; zelf mergen staat uit.
2. **Eigen cloud-omgeving** voor dat project, bijvoorbeeld "Fysiplan support-agent":
   - netwerk: standaard plus alleen `fysiplan.nl` extra;
   - **één** netwerkgeheim: host `fysiplan.nl`, kop `x-agent-sleutel`, waarde = de sleutel van díe rol;
   - geen andere geheimen, geen setup-script dat iets installeert wat niet nodig is.
3. **Sleutel maken**: op /dashboard88/omgeving → Agents → "Sleutels van de agents" → bij die agent "Sleutel maken". De sleutel is één keer te zien. Plak hem direct als netwerkgeheim in de omgeving van stap 2, en nergens anders (niet in een chat, niet in een bestand).
4. **Projectinstellingen**: in het nieuwe project bij Cloud environment de omgeving van stap 2 kiezen.
5. **Geplande taak** in dat project, met dezelfde prompt als nu (`/mnt/project-files/beheer-omgeving/agents/gedeeld.txt` plus het rolbestand) en dezelfde tijden: tech elk uur op :36, support elke 2 uur op :36, finance dagelijks 06:47 Amsterdam. Eerst uit laten, dan één keer met de hand afvuren en kijken of het loket 200 geeft met `modus: proef`.
6. **Controle op de pagina Agents**: bij die agent staat "Gemaakt op …", "laatst gezien" wordt bijgewerkt, en onder "Pogingen tot rechtenoverschrijding" komt niets bij.

## De overstap, in deze volgorde

1. #260 is gereviewd en door jou gemerged. Tot dan kent de live server geen sleutels per rol.
2. Voor support, tech en finance: stap 1 t/m 6 hierboven. De oude gedeelde sleutel blijft tijdens de overstap werken, maar alleen voor support, tech en finance (op het adres van staf of groei geeft hij 403, en dat wordt vastgelegd).
3. Als alle drie de nieuwe projecten één goede run hebben gehad: de **oude taken uitzetten** in het huidige project:
   - tech `trig_01R9amgTwf2rPtTVra5PvZ4L`
   - support `trig_018pmmfviNBcr5Pkuv58vg6N`
   - finance `trig_017ELZGYikwwxv61zVDXXj1J`
   - de agentdemo-sweep `trig_01X4NuJ3jBNjiFvCQJudJHBw` gebruikt dezelfde sleutel; die krijgt een eigen project of een eigen sleutel (bijvoorbeeld die van support, alleen lezen), of gaat uit.
4. **Gedeelde sleutel intrekken**: pagina Agents → oranje balk "Er staat nog een oude gedeelde sleutel" → "Gedeelde sleutel intrekken". Vanaf dat moment geeft hij overal 401.
5. **Uit de algemene projectomgeving halen**: in de omgeving "Fysiplan agents" (`env_014RouSZUAG5mHSa7Hx5HJgM`) het netwerkgeheim voor `fysiplan.nl` verwijderen. Zet daarna het hoofdproject in Projectinstellingen terug op de gewone omgeving, zodat gewone threads geen agentsleutel meer meesturen.
6. **Controle**: op de pagina Agents staat geen gedeelde sleutel meer, vijf (of drie) sleutels per rol, en geen nieuwe pogingen. Een test vanuit het hoofdproject naar `/api/agent/support/werk` hoort nu 404 of 401 te geven.

Stap 3 t/m 5 doe jij zelf. De sleutels en geheimen raak ik niet aan (afspraak: nooit een sleutel in de chat vragen, nooit via een omgeving-tool zetten).

## Wat de server nu afdwingt (PR #260)

- Eén sleutel per rol; op schijf staat alleen de afdruk (sha-256 met voorvoegsel).
- Een sleutel op het adres van een andere rol: **403**, vastgelegd op de pagina en in het beheerlogboek ("agents: poging tot rechtenoverschrijding").
- Intrekken per rol werkt direct (volgend verzoek **401**); de andere rollen werken door.
- Een nieuwe sleutel voor een rol maakt de vorige van die rol meteen ongeldig.
- Een nieuwe gedeelde sleutel maken kan niet meer (400); de oude kan alleen nog worden ingetrokken.
- De stopknop blokkeert alle vijf rollen: werk geeft niets, elke actie 423. Dat geldt ook voor agents op proef als je in de **demo** stilzet, en een sleutel die je in de demo intrekt, blokkeert die agent op proef (401).
- Geweigerde persoonsgegevens komen niet in het auditlog: van een agent staan daar alleen vaste codes (rol, actie, besluit, redencode, id). Getest met een concept en een taak met e-mailadres en telefoonnummer.
- Staf en groei blijven op proef ("aan" weigert de server).

## Kosten en neveneffecten (schatting)

- Elke run van een projecttaak is een nieuwe thread in dat project. Vijf projecten maken dat overzichtelijker dan één.
- Er komen vijf omgevingen bij die je moet bijhouden. Als dat te veel is: begin met drie (support, tech, finance) en voeg staf en groei pas toe als ze ooit echt gaan draaien.

## Raakvlak met ander werk

De thread "Sweep de agentdemo in beheer" stelt fixes voor in dezelfde loketcode (één slot per praktijk over alle rollen, PII-regels voor notities, demo-schakelaars, demo die een herstart overleeft). Als die ook doorgaan, moeten ze na of samen met #260 worden samengevoegd; het sleutelstuk van het loket (`afhandelenAgent`) raken ze waarschijnlijk niet, maar de bestanden wel.
