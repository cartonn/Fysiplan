# Mensenwerk

Wat alleen Ahmed (of een jurist) kan doen. Routines zetten hier punten neer en bouwen ze niet zelf.

## Voor Ahmed

### Hulp van Fysiplan-support: drie vragen voor de jurist (legal, 2026-11-13)
**Wat er is:** /privacy heeft nu een rij "Hulp van Fysiplan-support". Fysiplan meet per praktijk en per login het gebruik
(laatste login, actieve logins per dag, foute wachtwoorden, tweede stap, kaarten per week), maakt daar een stand van en kan
supportmails sturen; de agents met een taalmodel lezen die stand met codes in plaats van namen. Fysiplan is daar zelf
verantwoordelijk, op grond van gerechtvaardigd belang. De verwerkersovereenkomst (art. 2) noemt nu één uitzondering: Fysiplan
telt kaarten per praktijk en per login, zonder inhoud. Daardoor is er een nieuwe versie (2026-11-13) en gaat elke praktijk
opnieuw akkoord in de app.
**Wat een jurist moet bevestigen:** (1) mag Fysiplan als verwerker het aantal kaarten per praktijk en login zelf gebruiken
voor support (AVG art. 28 lid 10), of moet dat anders, bijvoorbeeld alleen per praktijk; (2) belangenafweging op papier
(art. 6 lid 1 f); (3) bezwaar (art. 21): er is nog geen knop om supportmails per praktijk uit te zetten, alleen per soort
voor iedereen. Komt er een bezwaar, dan moet beheer dat nu met de hand regelen. Wil je een knop per praktijk, zeg het, dan
bouwt de legal-routine hem.

### Ideeënbox: twee vragen voor de jurist (legal, 2026-11-12)
**Wat er is:** /privacy noemt nu de ideeënbox (rij "Ideeënbox"). Fysiplan is daar zelf verantwoordelijk voor de gegevens,
op grond van gerechtvaardigd belang (het product verbeteren); meedoen is vrijwillig.
**Wat een jurist moet bevestigen:** (1) volstaat gerechtvaardigd belang, en moet de belangenafweging op papier (AVG art. 6
lid 1 f)? (2) Ideeën waar Fysiplan over besliste en de stemmen hebben geen einddatum; ze blijven na het stoppen van een
praktijk staan zonder koppeling aan praktijk of login. Is dat goed, of wil je een termijn (bijvoorbeeld 2 jaar na het besluit)?
Dan bouwt de legal-routine die. Zet je `IDEEEN_AI=aan`, dan noemt /privacy vanzelf dat Anthropic de ideeën leest.

### De bewaker van buitenaf: zorg dat het alarm je bereikt (bouw, 2026-11-12)
**Wat er is:** om de vijf minuten kijkt een machine van GitHub of fysiplan.nl het doet. Bij een storing opent de bewaker een
issue op jouw naam; is het voorbij, dan sluit hij het. Uitleg in gewone taal: [docs/bewaker.md](bewaker.md).
**Wat alleen jij kunt doen:** (1) kijk bij GitHub onder Settings, Notifications of je een mail krijgt voor issues die aan jou
zijn toegewezen; (2) wil je een bericht op je telefoon, zet dan een adres van ntfy of Slack in het geheim `BEWAKER_WEBHOOK`;
(3) stuur één proefmelding vanuit Actions, "bewaker", "Run workflow". Komt er niets binnen, dan bereikt het alarm je niet.
**Wat hij niet kan:** elke minuut kijken en je bellen. Daarvoor is een dienst van buiten nodig die `/health` opvraagt; die
kies en betaal je zelf. Maak je de repository besloten, dan zet de bewaker zichzelf uit tot je de variabele `BEWAKER` kiest.

### De testomgeving: maak haar bij Railway (bouw, 2026-11-12)
**Wat er is:** de server weet zelf of hij productie of een testomgeving is. In een testomgeving mailt hij niemand (alles komt
in een testpostbak), staat betalen en de reservekopie uit en staat er een rood lint op elke pagina, ook als de sleutels van
productie zijn meegekopieerd. Een script zet er twee verzonnen praktijken in. Uitleg met de stappen: [docs/testomgeving.md](testomgeving.md).
**Wat alleen jij kunt doen:** bij Railway de omgeving maken. Ze moet precies `test` heten, een nieuw leeg volume krijgen en een
eigen `ADMIN_KEY`. Daarna één keer `node scripts/nepgegevens.mjs <adres>` draaien.
**Een keuze die nog open staat:** nu krijgen productie en test een wijziging tegelijk. Wil je dat een wijziging eerst op test
staat en pas na jouw akkoord naar productie gaat, dan moet productie aan een eigen tak hangen. Dat hoort bij het punt "vaste
uitrolmomenten".

### Hoe lang bewaren we het beheerlogboek? (legal, 2026-11-12 13u)
**Wat er is:** sinds #230 legt Fysiplan elke beheeractie vast (wie bij Fysiplan, wat, wanneer, bij welke praktijk; bij een
herstelmail de reden en een gemaskeerd adres). Geen patiëntgegevens. Het bestand groeit zonder einde en gaat mee in de reservekopie.
De legal-routine heeft het nu in /privacy en in de verwerkersovereenkomst gezet, met "nog geen vaste einddatum".
**Waarom een keuze nodig is:** de AVG vraagt een bewaartermijn (art. 5 lid 1 e). Het logboek is bewust niet te wissen, zodat
niemand zijn spoor kan uitvegen; een termijn moet dat principe dus bewust doorbreken.
**Advies:** 2 jaar, daarna automatisch weg bij het starten van de server (lang genoeg om een klacht of datalek na te gaan).
Laat een jurist bevestigen; zeg het tegen een routine, dan bouwt die het en past de tekst aan.


### Prijsbelofte van 24 maanden staat nu ook in de voorwaarden (legal, 2026-11-11 21u)
**Wat er was:** de landing belooft iedereen "je prijs staat minstens 24 maanden vast" (en de oprichters "24 maanden
prijsgarantie"), maar de voorwaarden zeiden alleen dat een nieuwe prijs 30 dagen vooraf gemeld wordt. Twee verschillende
afspraken; de landing staat publiek, dus daar ben je waarschijnlijk al aan gebonden.
**Wat de legal-routine deed:** art. 4 noemt nu de prijsbelofte van 24 maanden vanaf de start van het abonnement; daarna
geldt de melding 30 dagen vooraf. Beheerders gaan één keer opnieuw akkoord (versie 2026-11-11-2).
**Wat jij moet kiezen:** (1) zo laten (advies), of (2) de belofte alleen voor oprichters, of (3) helemaal weg. Bij (2) of
(3) moeten landing (`public/v2.html`, regels "Geen modules … 24 maanden vast", de oprichterskaart en "De prijsbelofte")
en art. 4 samen worden aangepast; wie al met de 24 maanden heeft afgesloten, houdt die. Laat ook een jurist naar deze
zin kijken. Ook nog niet in de voorwaarden: "60 dagen begeleide start, gratis import" voor oprichters.

### Praktijk met één beheerder die het wachtwoord kwijt is (gebruikers-sweep, 2026-11-11 14u)
**GEDAAN 2026-11-12 (deze PR), keuze (2):** elke eigen login vraagt onder Kaarten met "Wachtwoord vergeten?" zelf een link aan op het
eigen adres (een uur geldig, werkt één keer, de tweede stap blijft staan); zie de README bij *Wachtwoord vergeten*. Ahmed koos dit
niet uit dit lijstje: het is gebouwd binnen zijn opdracht van 2026-11-11 om de hoge prioriteiten uit de platformreview af te maken,
omdat sinds #222 elke praktijk start met één beheerder, zonder praktijkwachtwoord en zonder herstelcode. Keuze (1), de waarschuwing
voor een tweede beheerder, is niet gebouwd. De herstelmail van beheer werkt ongewijzigd. Test: `npm run test:wachtwoordvergeten`.
**Wat de code nu doet:** na de overstap naar eigen logins ("praktijkwachtwoord uit") werkt de herstelcode niet meer. Een lid dat zijn
wachtwoord kwijt is, moet de beheerder om een nieuwe uitnodiging vragen. Is die lid zelf de enige beheerder, dan is er geen weg terug
(zichzelf opnieuw uitnodigen geeft 409). De app waarschuwt bij "Zet het praktijkwachtwoord uit" niet dat er twee beheerders horen te zijn.
**Wat jij moet kiezen:** (1) een waarschuwing bij uitzetten met maar één beheerder ("wijs eerst een tweede beheerder aan"), (2) een
herstel per e-mail voor eigen logins (mail staat aan op Railway), of (3) herstel alleen via jou (handmatig). Advies: (1) nu, (2) later;
laat het weten, dan bouwt de sweep (1).

### Wie mag een patiëntkaart verwijderen? (security, 2026-11-11)
**GEDAAN 2026-11-11 (PR #191, #194):** alleen maker en beheerder, 7 dagen in de prullenbak, daar ook definitief te verwijderen.
**Wat de code nu doet:** elke therapeut van de praktijk kan elke gedeelde patiëntkaart definitief verwijderen, ook die van
een collega, met de video's erbij. Sinds deze week staat dat wel in Activiteit (wie, wanneer). Bij sjablonen en eigen
oefeningen mag alleen de maker of een beheerder verwijderen; kaarten onthouden (nog) geen maker.
**Wat jij moet kiezen:** (1) zo laten (collega's nemen elkaars patiënten over), of (2) alleen de maker en de beheerder mogen
verwijderen, de rest kan archiveren. Advies: (2), omdat het een medisch dossier raakt; laat het weten, dan bouwt de
security-routine het.

### Reservekopie buiten Railway (Scaleway, Amsterdam)
Dagelijkse versleutelde dagkopie: applicatiegegevens plus uploads. Uploads krijgen per dag
aparte objecten. Ongewijzigde inhoud wordt binnen Scaleway gekopieerd; alleen gewijzigde
inhoud gaat opnieuw over het Railway-netwerk. Iedere dagkopie is zelfstandig herstelbaar.
De bestaande bucket-lifecycle verwijdert objecten na zeven dagen (afhandeling kan vertraagd zijn).

Budgetbeveiliging: maximaal 1 GiB inhoud per dagkopie, 200 MiB nieuwe transfer per dagelijkse
poging en 64 MiB gegevensbestanden (was 10 MiB tot 12 november 2026; boven die grens mislukt de
hele dagkopie). Vanaf de helft van die grens meldt /health `"backupRuimte":"krap"` en krijgt de
beheerder een mail: op maandag, en boven de 80 procent na elke dagkopie. De getallen staan in
`/api/beheer/backup-status` onder `gegevens`. Dit is geen onbeperkte opslaggarantie. Bij ontbrekende
uploads worden gegevens en een expliciete lijst ontbrekende uploads bewaard; /health meldt
`deels` en de beheerder krijgt een melding. `ok` betekent dat alle geïnventariseerde bestanden
zijn opgeslagen en de objectgroottes zijn gecontroleerd. Herstel controleert encryptie en hashes.
Elke 24-uurscyclus heeft maximaal vier pogingen: de eerste plus herkansingen na 15 minuten,
1 uur en 4 uur vanaf de vorige poging (de server controleert iedere 5 minuten). Een persistent
transferjournaal reserveert bytes vóór iedere PUT, ook voor mislukte verzoeken. Alle pogingen delen
hetzelfde budget van 200 MiB. Reeds aangekomen uploadobjecten worden via het journaal hergebruikt.
Een geslaagde cyclus wordt na herstart niet opnieuw uitgevoerd. Een onderbroken oude poging met
onbekend verbruik wacht conservatief tot de volgende cyclus.
Publiek toont /health alleen de back-upstatus en het tijdstip van de laatste VOLLEDIGE kopie.
Details staan achter de beheersleutel op GET /api/beheer/backup-status; geen sleutels of bestandsnamen
worden teruggegeven.

Herstellen: `scripts/backup-terugzetten.mjs` leest oude zelfstandige FPB1-bestanden en nieuwe
indexbestanden met S3-referenties. Bij het nieuwe formaat zijn ook de S3-instellingen nodig.
Een onvolledige kopie wordt standaard geweigerd; alleen bewust `--onvolledig` gebruiken.
Gebruik altijd een aparte lege map. De Mac-handleiding staat in Fysiplan-reserve.

Nog organisatorisch: Scaleway aan bestaande praktijken melden volgens de verwerkersafspraken,
het account bij inschrijving op de juiste bedrijfsgegevens zetten, en de ontsleutelwachtzin
ook in een onafhankelijke wachtwoordkluis bewaren. Railway blijft US West; opslagbackup is Amsterdam.

### Fysiplan gebruiken zonder proef of abonnement (security 2026-11-09, gebouwd 2026-11-10)
**Wat de code nu doet:** GEDAAN 2026-11-10 (livegang, Ahmed: "verbeter alle punten die je zelf kan"): een **nieuwe**
praktijk beveiligen, en dus kaarten delen, kan live alleen nog vanuit een lopende proef of als klant
(`PROEF_VERPLICHT`, standaard aan in productie). Zonder proef zegt de app "Start eerst je gratis proef" met een link.
Praktijken die al beveiligd waren merken niets; een collega komt binnen via een uitnodiging. Een team met een verlopen
proef kan niet meer verder onder een nieuwe naam.
**Wat jij kunt doen:** niets. Wil je het terug zoals het was, zet dan op Railway `PROEF_VERPLICHT` = `uit`.
Nog open (LAAG): wie zich opnieuw aanmeldt met een ander e-mailadres krijgt een nieuwe proef van 14 dagen.

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
**Wat jij moet kiezen:** (1) GEDAAN 2026-11-10 (livegang): een week vóór het wissen krijgen de aanmelder en de
beheerders van de praktijk één mail (wanneer, wat er weggaat, doorgaan, kopiëren naar het dossier, downloaden). Dat geldt
ook na een proef zonder abonnement. Alleen als de mail is ingesteld (`MAIL_API_SLEUTEL` + `MAIL_AFZENDER`). (2) Teruggave van geld bij opzeggen halverwege de maand: de code boekt niets terug;
zet je keuze in de voorwaarden (art. 5) of laat de jurist het zeggen. (3) De opzegtermijn in art. 5 is nog een invulplek.

### De app in vier schermen (reviewlijst punt 14, 2026-11-12)
**Wat de code nu doet:** bovenin de app staan vier knoppen: Vandaag, Patiënten, Kaart maken en
Praktijk. De app opent op Kaart maken, zoals altijd; wie een ander scherm kiest, komt de volgende
keer daar terug. Vandaag toont de seintjes van patiënten (met
"Naar dossier" en "Afgehandeld") en wie deze week niet oefende (een kaart van minder dan twee dagen
oud telt nog niet mee). Het getal bij Vandaag is het aantal openstaande seintjes. Patiënten is de
lijst met kaarten; Praktijk heeft het login- en accountblok en tegels voor team, eigen oefeningen,
sjablonen, proef en abonnement, en gegevens. Kaart maken is de editor zoals hij was; de knop
Kaarten daar opent nog het zijpaneel. Printen geeft altijd de kaart. V1 (de app op /) is ongewijzigd.
**Wat ik bewust niet deed:** de oude app uit de code halen. V1 draait voor de demopraktijk en blijft
staan. De editor kreeg ook nog geen nieuwe indeling met een lijst rechts; dat is een volgende stap
als de vier schermen bevallen.
**Wat jij kunt doen:** kijk of Vandaag als vast beginscherm beter zou zijn. Ik koos voor Kaart maken
plus het onthouden van je keuze, omdat therapeuten nu zo gewend zijn te werken; omzetten is één regel.

### Vaste vragen per oefening in plaats van de vraaghulp (reviewlijst punt 13, 2026-11-12)
**Wat de code nu doet:** op elke patiëntkaart staat onder de oefeningen "Vragen over je oefeningen":
vijf vaste vragen met een vast antwoord, in de negen talen van de kaart (pijn, goed uitvoeren, meer
of minder doen, een dag overgeslagen, ademhaling). Ze staan in `lib/vaste-vragen.js`. Ze noemen
geen getallen of dosering en verwijzen voor alles wat bij één patiënt hoort naar de kaart, de knoppen
"Het doet te veel pijn" en "Ik heb een vraag", en de eigen praktijk. Daarnaast kan een praktijk in de
app bij elke oefening eigen vragen met antwoord zetten (het vraagtekentje op het plaatje, alleen met
een eigen login). Die staan bij de oefening op elke kaart van die praktijk, in het Nederlands; in een
andere taal staat erbij dat de praktijk ze in het Nederlands schreef. Er gaat geen vrije tekst van de
patiënt naar een AI-dienst. De eigen vragen gaan mee in de download en in "Alles wissen", en een
wijziging staat in de activiteit van de praktijk.
**Wat jij moet doen:**
1. Laat de vijf standaardvragen en hun antwoorden nalezen door een fysiotherapeut, samen met de
   steekproef van de bibliotheek. Ik heb ze zelf geschreven en vertaald; ze zijn nog niet door een
   fysiotherapeut of een moedertaalspreker gelezen. Verbeteringen zet je in `lib/vaste-vragen.js`.
2. Laat `VRAAGHULP` uit. De vaste vragen vervangen de vraaghulp; de schakelaar en de code van de
   oude vraaghulp kunnen weg zodra de server in losse onderdelen staat (punt 15).

### Vraaghulp op de kaart (legal, 2026-11-07; eigen schakelaar 2026-11-12)
**Wat de code nu doet:** de vraaghulp staat standaard UIT, ook als `ANTHROPIC_API_KEY` is ingesteld
(de zoekhulp en het vertalen hangen aan dezelfde sleutel en blijven werken). De patiëntkaart toont
het vraagveld dan niet, `/api/kaart/vraag` weigert, de landing noemt de vraaghulp niet en `/health`
zegt `"vraaghulp":"uit"`. Aanzetten kan alleen bewust met `VRAAGHULP=aan` in Railway.
**Waarom uit:** het filter herkent een klacht aan een vaste woordenlijst. Gemeten op 11 november:
15 van 18 gewone klachtzinnen ("ik heb last van mijn rug", "mijn knie is dik en warm") gingen
erdoorheen en dus naar Anthropic in de VS, terwijl /privacy belooft dat zulke vragen niet worden
doorgestuurd. Zet de vraaghulp pas weer aan als die belofte klopt, bijvoorbeeld met vaste vragen
waaruit de patiënt kiest in plaats van een vrij tekstveld.
**Als hij aan staat:** vragen over pijn, klachten, medicijnen of herstel die het filter herkent gaan
niet naar de AI-dienst; de patiënt krijgt een vaste verwijzing naar de eigen praktijk. Andere vragen
(hoe diep zakken?) gaan wel naar Anthropic in de VS.
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

### Mail op de dag dat de proef afloopt (praktijk-routine, 2026-11-12)
**Wat de code nu doet:** op de dag dat een gratis proef afloopt, krijgt de aanmelder één mail "Je Fysiplan-proef is
afgelopen": nieuwe kaarten kunnen niet meer, gedeelde kaarten blijven werken, hoe je doorgaat en op welke datum alles
gewist wordt als de praktijk geen klant wordt. Jij (`PROEF_MELDING_AAN`) krijgt "Proef afgelopen: …", een goed moment
om te bellen. Geen mail aan klanten, aan wie al "Ja, ik wil doorgaan" koos, of aan proeven die bij de uitrol al langer
dan een dag voorbij waren. Staat `MOLLIE_API_KEY`, dan noemen deze mail én de herinnering twee dagen vooraf de link
om de eerste maand online af te rekenen (fysiplan.nl/v2/proef?mijn=1, met de prijs en de btw volgens de keuze in Finance); zonder
Mollie blijft het "antwoord op deze mail, dan bellen we je".
**Env:** werkt alleen met mail (`MAIL_API_SLEUTEL` + `MAIL_AFZENDER`, staan al op Railway); de betaallink alleen met `MOLLIE_API_KEY`.
**Wat jij moet doen:** niets. Kijk bij de eerste "Proef afgelopen"-mail of de toon je bevalt.

### Aantal therapeuten en kaarten (reviewlijst punt 7, 2026-11-12)
**Wat de code nu doet** (`lib/plaatsen.js`, test `npm run test:plaatsen`):
- **Een praktijk vult het aantal therapeuten niet meer in.** Elke login in het team telt als één therapeut. Een
  uitnodiging die nog niet is aangenomen, telt niet. Een praktijk die nog niet beveiligd is, betaalt voor één.
- **Een nieuwe maand is voor de logins van dat moment**, of voor het hoogste aantal van de afgelopen maand als dat
  hoger was. De server kijkt elk uur. Wie een collega een maand laat meewerken en vlak voor de afschrijving
  verwijdert, betaalt die maand dus nog voor die collega. Tussentijds wordt er niets bijgeschreven of teruggegeven.
- **"Mijn abonnement" zegt hoeveel logins het team heeft** en, als dat afwijkt, voor hoeveel de volgende maand is.
- **De grens van 100 kaarten is weg.** Tijdens de proef: 100 lopende kaarten. Voor een klant: 300 lopende kaarten
  per login. Afgeronde kaarten en de prullenbak tellen niet mee voor die grens (samen hooguit drie keer zoveel).
  Een bestaande kaart bijwerken kan altijd. Er blijft een grens omdat alle kaarten tot de database er is in één
  bestand staan.

**Wat jij moet weten:** de getallen 100 en 300 zijn mijn keuze, geen meting van wat een praktijk nodig heeft. Ze
staan bovenaan `lib/plaatsen.js`. De voorwaarden zeggen niets over een aantal kaarten.

### Video's en foto's via een tijdelijke link (reviewlijst punt 9, 2026-11-12)
**Wat de code nu doet** (`lib/medialink.js`, test `npm run test:medialink`):
- **Een eigen opname van een praktijk en de foto van een eigen oefening zijn geen openbaar adres meer.** De server
  geeft ze alleen nog via een link die bij één kaart hoort en na 12 tot 24 uur verloopt, of aan wie bij die praktijk
  is ingelogd (het werkscherm). Een andere praktijk en een bezoeker zonder link krijgen "niet gevonden".
- **De patiëntkaart krijgt die links vanzelf** bij het openen. Wie een link doorstuurt, geeft de video hooguit een
  dag weg, en alleen zolang de kaart bestaat: in de prullenbak of verlopen werkt de link niet meer.
- **De bibliotheek blijft openbaar**: de oefenbeelden, de video's die beheer bij een oefening zette en de logo's.
- De sleutel waarmee de server de links ondertekent, staat in de datamap (`media-sleutel.json`) en gaat niet mee in
  de reservekopie. Na een restore maakt de server een nieuwe en krijgt elke kaart bij het openen nieuwe links.

**Wat jij moet weten:** een opname die een patiënt al op de telefoon had geopend, speelt na een dag pas weer als de
kaart opnieuw verbinding heeft. Video's werden al niet offline bewaard, dus voor de patiënt verandert er niets.

### Vertalingen vooraf en per taal nalezen (reviewlijst punt 10, 2026-11-12)
**Wat de code nu doet** (`lib/vertaling.js`, `lib/vertaal-routes.js`, test `npm run test:vertalingen`):
- **Op /dashboard88/vertalingen** staat per taal hoeveel teksten van de bibliotheek (naam en uitleg van elke
  oefening, 1634 teksten) vertaald en nagelezen zijn. Met één knop laat je de bibliotheek vooraf vertalen, per
  taal of alle acht. Dat gebeurt alleen voor wat nog ontbreekt, in rondes van 20 teksten, en is te stoppen.
- **Een lezer** leest per tekst het Nederlands en de vertaling, verbetert die zo nodig en drukt op "Klopt,
  nagelezen". Een nagelezen tekst wordt nooit meer automatisch overschreven. Verandert de Nederlandse tekst, dan
  telt hij opnieuw als niet nagelezen. Elk nalezen staat met naam in het logboek van beheer.
- **De patiëntkaart** zegt bij een uitleg die niet is nagelezen dat hij automatisch is vertaald. Onder elke
  vertaalde uitleg staat, ingeklapt, de Nederlandse tekst.
- Wat nog geen vertaling heeft (een nieuwe oefening, de naam van een eigen oefening van een praktijk), vertaalt
  de kaart zoals eerst bij het openen. Die tekst staat dan als "automatisch vertaald" op de kaart.
- **Bijvangst:** een uitleg langer dan 300 tekens (87 oefeningen) werd afgekapt vertaald en kwam op de kaart
  nooit terug. Die bleef dus altijd in het Nederlands. Nu gaat de hele tekst mee.

**Wat jij moet doen:**
- **Een lezer per taal zoeken.** Maak voor die persoon een beheeraccount in de beheeromgeving (Beheerders) en geef
  alleen het recht "Vertalingen". Daarmee komt de lezer alleen bij deze pagina, niet bij praktijken, finance of
  andere beheerpagina's.
- **Eén keer op "Alle talen vooraf vertalen" drukken.** Naar schatting kost dat bij de AI-dienst minder dan tien
  euro. Ik heb het niet zelf gestart, omdat het geld kost.

### Leeslog per kaart (reviewlijst punt 8, 2026-11-12)
**Wat de code nu doet** (`lib/leeslog.js`, test `npm run test:leeslog`):
- **De server houdt bij wie een kaart opende of bewaarde**, en wie het overzicht van alle kaarten, de berichten
  van patiënten of de download van alle gegevens opvroeg. Met de naam van de login en het moment. Wie een kaart open
  heeft staan, krijgt één regel per kwartier, niet één per keer dat de app ververst.
- **Een beheerder van de praktijk ziet het per kaart**: Kaarten, de knop "Inzage" achter de kaart. Een therapeut
  ziet de knop niet. Het leeslog zit ook in de download van alle gegevens.
- **Er staat geen naam van een patiënt in**, alleen het nummer van de kaart. Wordt een kaart definitief verwijderd
  of verloopt ze, dan verdwijnen haar regels. Een regel blijft hooguit twee jaar.
- De patiënt die haar eigen kaart opent, staat er niet in: dat is geen inzage door een ander.
- Wat beheer van Fysiplan bij een praktijk zonder account leest, staat er als "Fysiplan-beheer" in en met naam in
  het eigen logboek van beheer.

**Wat jij moet weten:**
- **Twee jaar en "verdwijnt met de kaart" zijn mijn keuze.** De norm voor logging in de zorg (NEN 7513) gaat uit
  van langer bewaren, maar de kaarten zelf verdwijnen na 90 dagen stilte en Fysiplan is het dossier niet. Leg dit
  voor aan de jurist bij het gesprek over beveiliging.
- **Privacyverklaring en verwerkersovereenkomst noemen het leeslog sinds 2026-11-12 21u** (legal-routine: rij
  "Leeslog per kaart" op /privacy en art. 5 van de verwerkersovereenkomst, versie 2026-11-12-2; praktijken gaan
  daarvoor één keer opnieuw akkoord in de app).
- Wie met het gedeelde praktijkwachtwoord werkt, staat erin als "gedeeld wachtwoord": dan is niet te zien wie het
  was. Sinds elke nieuwe praktijk een eigen login per persoon heeft, speelt dat alleen bij oude accounts.


**Wat de code nu doet:** zet je `MOLLIE_API_KEY` op Railway, dan krijgen "Mijn proef" en de
verlopen-pagina een blok "Direct online afrekenen": het blok telt zelf de logins van de praktijk (zie "Aantal
therapeuten en kaarten" hieronder), eerste maand
(9,99 per therapeut; de btw volgt de keuze in Finance, zie "Factuur per online betaling" hieronder, en zonder
die keuze staat het blok er niet) betalen met iDEAL of kaart bij Mollie. Na betaling wordt de proef meteen een
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

### Database die meeschrijft (reviewlijst punt 11, 2026-11-12)
**Wat de code nu doet** (`lib/database.js`, test `npm run test:database`): niets, tot jij hem aanzet. Staat hij aan,
dan:
- leest de server bij het starten alle gegevensbestanden in een PostgreSQL-database (sessies en sleutels niet);
- krijgt de database na elke schrijfactie een kopie. Het bestand blijft de enige bron: de app leest nooit uit de
  database, en een trage of onbereikbare database houdt niemand op;
- staan er naast de bestanden ook tabellen voor praktijken, logins (zonder wachtwoord), kaarten, elke bewaarde
  versie van een kaart (hooguit 100 per kaart; weg met de kaart) en het leeslog. Dat is het begin van het model uit
  de review;
- vergelijkt de server elke nacht om 3 uur bestand voor bestand en tabel voor tabel. De uitkomst staat in `/health`
  onder `database` en in de tabel `fp_vergelijking`;
- zet `scripts/database-terugzetten.mjs` alles uit de database terug naar een lege map en vergelijkt die met de
  datamap. Dat is de hersteltest. `scripts/database-overzetten.mjs` oefent de overstap op een kopie van de datamap.

**Wat jij moet doen om hem aan te zetten:**
1. Railway, project Fysiplan, omgeving production: "New", dan "Database", dan "PostgreSQL". Kies dezelfde regio
   als de app (EU West, Amsterdam).
2. Bij de dienst Fysiplan twee variabelen: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` en
   `DATABASE_MEESCHRIJVEN` = `aan`.
3. Na de uitrol staat in `/health` bij `database` de stand "meeschrijven" en de wachtrij op 0.
4. Geef de omgeving test een eigen PostgreSQL, nooit die van productie.

**Wat bij jou blijft:** de stap waarin de database de bron wordt, is niet gebouwd. Die komt pas als de
vergelijking een week lang elke nacht gelijk is en terugzetten werkt. In de database staan dezelfde gegevens als in
de bestanden, ook van patiënten, bij dezelfde leverancier (Railway) en in dezelfde regio. Zodra je hem aanzet, noemt
/privacy hem vanzelf in de rij van Railway (legal-routine 2026-11-12 21u), met de eerdere versies van een kaart. Kies
bij Railway echt dezelfde regio (EU West, Amsterdam): de tekst zegt "in dezelfde regio". Voor de jurist blijft de vraag
of de verwerkersovereenkomst de database apart moet noemen; volgens de legal-routine valt hij onder "Railway, server
en opslag", omdat het dezelfde subverwerker is.

### Factuur per online betaling (praktijk-routine, 2026-11-08)
**Wat de code nu doet:** na een online betaling ziet de praktijk op de bedankpagina en in "Mijn proef"
een link naar `/v2/proef/factuur` (alleen met de eigen proefcookie, printbaar, scriptloos). Elke betaling
krijgt een doorlopend nummer per jaar (`FP-2026-0001`, ...), dat ook na "Alles wissen" 7 jaar bewaard blijft.
Zonder btw-id is het een **betaalbewijs** met de zin "geen factuur voor de btw"; met de variabelen hieronder
een **factuur** met 21% btw uitgesplitst.
**Wat jij moet doen:**
1. Zet op Railway `FYSIPLAN_BTW_NUMMER` (je btw-id, `NL…B01`), naast `FYSIPLAN_BEDRIJF`, `FYSIPLAN_KVK` en
   `FYSIPLAN_ADRES`. Pas als alle vier er staan, heet de pagina "Factuur".
2. **Beslissen (btw):** GEBOUWD 2026-11-12 (bouw, punt 6 van de reviewlijst): de keuze maak je zelf, in de
   beheeromgeving onder Finance ("Btw-instellingen"). Het bedrag dat Mollie afschrijft, de factuur, het betaalblok,
   de mails en de landing volgen die keuze vanzelf (`lib/prijs.js`):
   - **Kleineondernemersregeling: ja.** Er wordt 9,99 per therapeut afgeschreven, de factuur noemt geen btw en zegt
     dat ze is vrijgesteld (artikel 25 Wet OB), en de teksten zeggen "Fysiplan rekent geen btw". Een btw-id is dan
     niet nodig voor een factuur; bedrijfsnaam, KvK en adres wel.
   - **Nee, en 9,99 is exclusief btw.** Er wordt 12,09 per therapeut afgeschreven (9,99 plus 21%). De teksten
     zeggen "exclusief btw" en het betaalblok noemt ook de 12,09.
   - **Nee, en 9,99 is inclusief btw.** Er wordt 9,99 afgeschreven (8,26 plus 1,73 btw) en de teksten zeggen
     "inclusief btw".
   **Zolang je niet gekozen hebt, start online afrekenen niet**, ook niet met `MOLLIE_API_KEY`: het betaalblok
   staat er dan niet en de mails zeggen "antwoord op deze mail, dan bellen we je". De teksten blijven tot die tijd
   "exclusief btw" zeggen. Een betaling onthoudt haar eigen bedrag en btw: kies je later anders, dan verandert een
   factuur die er al is niet, en een aangekondigde incasso wordt afgeschreven zoals ze is aangekondigd.
   **Nog voor jou:** kiezen, en je boekhouder laten bevestigen dat de factuur zo klopt (ook de zin over de
   vrijstelling). **Let op de voorwaarden:** artikel 4 van `/voorwaarden` zegt "exclusief btw" en volgt je keuze niet
   vanzelf, omdat een juridische tekst niet stil mag veranderen. Kies je "inclusief" of de kleineondernemersregeling,
   dan moet die zin mee, met een nieuwe versie van de voorwaarden.
3. ~~Factuuradres~~ GEBOUWD 2026-11-11 (praktijk-routine): op Mijn abonnement staat nu het blok
   "Factuurgegevens" (naam van de praktijk + adres, optioneel). Ze komen op elke nieuwe factuur en worden bij
   het uitgeven van het factuurnummer vastgelegd, zodat een uitgegeven factuur niet meer verandert. Boven 100
   euro (vanaf 11 therapeuten bij 9,99 incl. btw) zonder adres ziet de praktijk op de factuur een oproep om het
   in te vullen. Geen env-variabele nodig; het werkt zodra er online betaald is (`MOLLIE_API_KEY`).
   **Nog voor jou:** laat je boekhouder bevestigen dat dit (plus naam en btw-id van Fysiplan) genoeg is voor
   een volledige factuur; wil je het adres verplicht maken vóór het betalen, zeg het.


### Thuiskaart als tweede afdruk (reviewlijst punt 12, 2026-11-12)
**Wat de code nu doet** (`public/index.html`, `bouwThuiskaart`, test `npm run test:thuiskaart`): in het printvenster
van de app staat naast "Uitgebreide kaart" en "Compacte kaart" de keuze **Thuiskaart**. Dat is een vel voor thuis:
zes oefeningen per vel met een groot beeld, de naam, de dosering in woorden ("3 series van 12 herhalingen"), de
uitleg uit de bibliotheek en zeven vakjes om per dag af te vinken. Op het eerste vel staat de QR-code van de
digitale kaart als die erop moet. "Groot lettertype" werkt ook hier. De trainingslog blijft zoals hij was. V1 (de
app op /) heeft de keuze niet.

**Wat jij moet weten:** het vel is liggend, net als de trainingslog. In Safari, dat staand print, komen er twee
oefeningen naast elkaar en drie onder elkaar. De tekst op het vel is Nederlands, ook als de patiënt de digitale kaart
in een andere taal leest.

### Engelse oefennamen in de Nederlandse bibliotheek (gebruikers-sweep, 2026-11-07)
**Wat er is:** op een Nederlandse patiëntkaart staan namen als "Knee elbow", "Abs stretch" en "Abroller".
Ze komen uit `public/oefeningen-v2.json`. Routines raken dat bestand niet aan, want daar werkt jouw
videostroom aan.
**Wat er sinds 2026-11-12 is gedaan:** de 135 oefeningen die op een standaardkaart staan, tonen een
Nederlandse naam ("Leg extension" heet nu "Knieën strekken – op het apparaat"). Dat gaat via een laag
over het bestand heen: `content/oefennamen-nl.json`, zie de README. Het bestand zelf is niet gewijzigd.
**Wat jij nog moet doen:**
1. Laat een fysiotherapeut de 135 namen nalopen (`content/oefennamen-nl.json`, rechts staat de nieuwe
   naam). Een naam verbeteren is één regel; `npm run test:oefennamen` loopt daarna na of elke
   standaardkaart nog dezelfde oefeningen vindt.
2. Kies Nederlandse namen voor de Engelse namen die buiten de standaardkaarten staan. Een telling met
   een woordenlijst komt op ruim 110 (een schatting), vooral krachtapparaten, TRX, yoga, Bodyblade en
   foamroller. Ze kunnen in hetzelfde bestand.
3. De voorleesstem noemt 33 hernoemde oefeningen nog bij hun oude naam, omdat de opname met die naam
   begint. Neem ze opnieuw op bij de volgende ronde stemmen; tot dan speelt de bestaande opname.
4. De voorbeeldkaart (`/k/demo`) houdt haar vier namen (Squat, Dead bug, Anteflexie armen, Step up),
   omdat de beelden op de landingspagina die kaart laten zien.

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
2. ~~**Prijswijziging**~~ ingevuld 2026-11-10 (livegang): minstens 30 dagen vooraf, per e-mail. Wil je het anders, zeg het.
3. ~~**Opzegtermijn**~~ ingevuld 2026-11-10 (livegang) zoals de code het doet: geen opzegtermijn, het abonnement stopt
   aan het einde van de betaalde maand. Wil je het anders, zeg het.
4. **Aansprakelijkheidsgrens:** bijv. maximaal het bedrag van 3 of 12 maanden abonnement.
5. **Bevoegde rechtbank:** bijv. de rechtbank in het arrondissement van je vestigingsplaats.
6. **KvK, rechtsvorm en adres** komen uit de Railway-variabelen FYSIPLAN_BEDRIJF, FYSIPLAN_KVK,
   FYSIPLAN_ADRES en FYSIPLAN_CONTACT (stonden op 2026-11-02 nog niet). Zonder die variabelen
   toont de pagina alleen "Fysiplan".
7. **Jurist:** laat privacyverklaring, verwerkersovereenkomst en voorwaarden samen toetsen;
   haal daarna het concept-blok weg en verhoog `AV_VERSIE` in server.js.
