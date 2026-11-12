# Fysiplan

Fysiplan vervangt een eenvoudig, oud fysio-programma waarmee trainingskaarten worden
gemaakt. Je kiest oefeningen met plaatjes en print één A4-trainingskaart (of slaat 'm op als
PDF), met een monitoring-grid voor serie / herhaling / weerstand over meerdere data.

Live Railway URL: https://fysiplan-production.up.railway.app

## Wat de app doet

- Oefeningenbibliotheek met **echte oefening-plaatjes** (215 stuks, geleverd in de repo),
  gegroepeerd per categorie (Bovenste/Onderste extremiteit, Core, Cardio, Bosu, TRX, Yoga,
  Kettlebell, Foam roller, Speedladder) + zoeken. Deze lijst wordt door de **server** geleverd,
  dus **iedereen die de URL opent** ziet ze — op elk apparaat, zonder inloggen of upload.
  (Is `public/oefeningen.json` afwezig, dan valt de app terug op nette placeholder-tekeningen.)
- Klik een oefening en het bijbehorende plaatje komt direct genummerd op de A4.
- Heeft de oefening een praktijk- of Fysiplan-video, dan gaat die met dezelfde klik automatisch
  mee naar de digitale kaart. De videobadge maakt dat al vóór het kiezen zichtbaar.
- Eén A4-trainingskaart met cliëntvelden (Naam, Leeftijd, max. HF, Trainingszone) en
  monitoring-grid.
- Printen + opslaan als PDF (via het printvenster van de browser).
- Eigen oefening toevoegen met een eigen plaatje (blijft lokaal bewaard via `localStorage`).

## Structuur

- `public/index.html` — de volledige front-end app (zelfstandig: HTML + CSS + JS + data).
- `public/oefeningen.json` — de **server-bibliotheek**: lijst van `{naam, groep, img}` die de app bij
  het opstarten inleest, zodat de plaatjes voor iedereen (elk apparaat) beschikbaar zijn. Optioneel
  veld `ook` (lijst van extra categorieën) toont een oefening op meerdere plekken — zo staan de
  cardio-apparaten zowel onder **Apparaten** als onder **Cardio**.
- `public/images/` — de web-geoptimaliseerde JPEG's, per categorie in een submap.
- `content/video-catalogus.json` — versiegestuurde Fysiplan-videotheek, gekoppeld via een stabiele
  `exerciseId`; alleen klinisch goedgekeurde items worden aan patiënten geleverd.
- `docs/video-contentfabriek.md` — productieontwerp voor avatar, motion capture, talen, review,
  hosting, kosten en de eerste pilot.
- `server.js` — minimale Node-server (geen dependencies): serveert `public/` en `/health`.
- `scripts/build.js` — schrijft buildmetadata naar `dist/build-info.json`.
- `scripts/kleine-beelden.mjs` — bouwstap: zet van elk beeld in `public/images/` een versie van
  hooguit 160 px in `dist/klein/` voor de oefenlijst en de sjabloonkiezer. De A4, de pdf en de
  patiëntkaart gebruiken het volledige bestand. `/health` toont het aantal als `kleineBeelden`.
- `scripts/convert-images.mjs` — eenmalig hulpscript: zet zware BMP/PNG naar compacte JPEG's en
  (her)bouwt `public/oefeningen.json`. Zie "Nieuwe plaatjes toevoegen" hieronder.
- `scripts/normalize-image-visibility.py` — brengt lijnzwart, randscherpte en kleur per afbeelding
  op de zichtbaarheid van de biceps-referentie, gemeten op het 56×56-formaat van de keuzelijst,
  zonder afmetingen te wijzigen.
- `railway.json` — Railway build/deploy + healthcheck op `/health`.

## Scripts

- `npm run build` — draait de controles, maakt de kleine beelden in `dist/klein/` en schrijft
  buildmetadata naar `dist/build-info.json`.
- `npm run images:normalize` — normaliseert oefentekeningen naar de biceps-referentie
  (vereist Python + Pillow).
- `npm run videos:check` — controleert IDs, reviewstatus en veilige Stream-URL's van de videotheek.
- `npm run videos:export` — schrijft de actuele productiewachtrij als CSV naar standaarduitvoer.
- `npm run start` — start de webserver op `PORT` (Railway) of lokaal op `3000`.

Lokaal draaien: `npm run build && npm run start`, daarna http://localhost:3000

## Eigen oefeningenlijst uploaden (Carla)

De oefeningen met plaatjes worden **standaard door de server geleverd** (zie `oefeningen.json`
hierboven), dus iedereen ziet dezelfde lijst. Wil één werkplek daarnaast toch een eigen,
afwijkende lijst gebruiken, dan kan dat via de knop **"Plaatjes uploaden"**: dat bestand
(.txt/.csv) **wordt de oefeningenlijst** en vervangt de server-lijst — maar alleen **lokaal in
die ene browser** (bewaard via IndexedDB). Format: oefeningnaam, daaronder de bestandsnamen van de
bijbehorende plaatjes, lege regel, volgende oefening. Met de knop **"Standaardlijst"** keer je
terug naar de gedeelde server-lijst.

## Praktijkprofielen en opgeslagen kaarten

- **Praktijken (gedeeld):** vul je op de A4 een praktijknaam + adres in, dan wordt dat profiel via
  `POST /api/praktijken` op de server bewaard (`praktijken.json`) en is het op elk apparaat te
  kiezen via het keuzemenu boven de praktijknaam. `GET /api/praktijken` levert de lijst.
- **Kaarten (lokaal):** via de knop **Kaarten** sla je de huidige kaart onder een naam op en open
  of verwijder je eerder opgeslagen kaarten. Kaarten bevatten cliëntgegevens en blijven daarom
  bewust **lokaal in de browser** (`localStorage`, sleutel `fysiplan_kaarten`). Oefeningen worden
  op naam bewaard, zodat een kaart blijft werken als de bibliotheek verandert.

## Fysiplan v2 (/v2 en /v2/app)

- **/v2** is de landingspagina, **/v2/app** dezelfde app met een nieuw licht uiterlijk (`v2.css`)
  en extra functies; de site op `/` blijft onaangeroerd. Extra in v2:
- **Kaartsjablonen** (`public/sjablonen.json`): kant-en-klare programma's per klacht, gekoppeld
  op oefening­naam.
- **Praktijklogo:** upload bij het praktijkprofiel (`POST /api/praktijken` met `logo`-dataURL,
  bewaard in `uploads/`), print mee op elke kaart.
- **Gedeelde kaarten per praktijk:** `GET/POST /api/kaarten` en `POST /api/kaarten/verwijder`
  (opslag `kaarten.json`, sleutel praktijk + kaartnaam, max. 100 per praktijk). Delen kan pas als
  de praktijk beveiligd is met een wachtwoord (anders `401 {beveilig:true}`). Het naamveld is in v2
  een **roepnaam** (bijv. "Jan K."); leeftijd en Casus gaan niet naar de server. Twee kaarten met
  dezelfde roepnaam overschrijven elkaar niet: de app stuurt het kaart-id mee en de server geeft
  `409 {bestaat:true}` bij een botsing. Zie **Data & privacy** voor wat er precies wordt bewaard.
- **QR-code op de print:** aanvinkbaar in het printvenster. De kaart wordt dan bij de praktijk
  bewaard en krijgt een QR (eigen encoder, `public/qr.js`, geen dependencies) naar
  **/k/&lt;id&gt;** (`public/kaart.html`): een mobielvriendelijke, alleen-lezen weergave die de
  cliënt zonder app of account opent. Het id is onraadbaar (12 hex-tekens).
- **Oefenvideo's (zonder app):** iedere serveroefening heeft in `/admin88` een zichtbare
  **+ Video**. Daarmee kan beheer een gerenderde avatarvideo direct kiezen of slepen,
  vooraf bekijken, vervangen en verwijderen. Met `CLOUDFLARE_ACCOUNT_ID` plus
  `CLOUDFLARE_STREAM_TOKEN` maakt `POST /api/oefeningen/video/upload/start` een eenmalige
  Direct Creator Upload (MP4/WebM, max. 200 MB) en gaat het bestand rechtstreeks van de browser
  naar Cloudflare Stream; het API-token komt nooit in de browser. Zonder die variabelen gebruikt
  dezelfde knop automatisch `POST /api/oefeningen/video/upload` en `/data` (max. 60 MB). De
  koppeling gebruikt het stabiele `exerciseId` en blijft dus bestaan bij
  hernoemen. Daarnaast kan beheer een YouTube-link zetten (`POST /api/oefeningen/video`,
  privacyvriendelijke nocookie-embed) of een **eigen video opnemen**: er verschijnt een QR op het scherm, de telefoon opent
  `/o/&lt;token&gt;` (`public/opname.html`) met één opnameknop, en de upload
  (`/api/opname/*`, mp4/webm, max. 60 MB) hangt de video aan de oefening (`videolinks.json`,
  bestanden in `uploads/videos/`). In v2 kan de therapeut per kaart ook een **persoonlijke
  video** voor één cliënt opnemen (camera-icoon op het plaatje; opgeslagen in het
  `vids`-veld van de kaart). Voorrang op de digitale kaart: persoonlijke opname →
  praktijkopname → YouTube-link die de therapeut zelf op de kaart zette → praktijkvideo in
  Cloudflare Stream → beoordeelde Fysiplan-video → YouTube-link uit de bibliotheek →
  conceptvideo. Zo gaat er zo min mogelijk naar YouTube. Video's worden geserveerd met
  Range-ondersteuning (vereist voor iPhone/Safari).
- **Tweede stap bij het inloggen:** wie een eigen login heeft, zet onder Kaarten → Team een tweede
  stap aan. Na het wachtwoord vraagt Fysiplan dan om een code uit een code-app (TOTP, RFC 6238:
  Google Authenticator, Microsoft Authenticator, Wachtwoorden op een iPhone, 1Password). Instellen
  gaat met een QR-code die de browser zelf tekent (`public/qr.js` in de ruime stand; het geheim
  gaat niet door de QR-cache van de server) of door de sleutel over te typen, en staat pas aan als
  de eerste code klopt. Een code werkt één keer. Bij het aanzetten krijgt de gebruiker acht
  reservecodes, elk één keer bruikbaar, voor als de telefoon weg is. De tweede stap geldt bij het
  inloggen in de app en op de formulieren die met e-mail en wachtwoord werken (overzicht na de
  proef, praktijkgegevens downloaden of wissen). Uitzetten en nieuwe reservecodes vragen het
  wachtwoord en een code.
  - *Raden.* De code wordt pas bekeken als het wachtwoord klopt. Na 20 foute codes binnen 24 uur
    werkt voor die login 24 uur lang alleen nog een reservecode; de teller staat op schijf, dus
    een uitrol geeft geen nieuwe pogingen. Op dat moment krijgt de eigenaar van de login een mail (als mail
    is ingesteld) en staat het in de Activiteit van de praktijk: wie zo ver komt, kent het
    wachtwoord.
  - *Telefoon en reservecodes kwijt.* Een beheerder met een eigen login wist de tweede stap van een
    collega (Team → wissen); de collega logt dan in met alleen het wachtwoord en stelt hem opnieuw
    in. Is de enige beheerder het zelf kwijt, dan stuurt Fysiplan-beheer de herstelmail met
    `"tweedeStap": true` (zie **Beheer**).
  - *Verplicht voor de hele praktijk.* Een beheerder met een eigen login en een eigen tweede stap
    kan hem onder Team van iedereen vragen (met het eigen wachtwoord). Het gedeelde
    praktijkwachtwoord gaat dan uit en kan niet weer aan. Wie nog geen tweede stap heeft, is
    uitgelogd en stelt hem in bij het inloggen: na het goede wachtwoord toont de app de QR-code, en
    pas met de eerste code is er een sessie. In zo'n praktijk bestaat geen sessie zonder tweede
    stap. "Uitzetten" is daar opnieuw instellen (nieuwe telefoon), en een gewiste tweede stap
    wordt bij het inloggen opnieuw ingesteld. Opheffen vraagt wachtwoord en code; het
    praktijkwachtwoord blijft daarna uit. De schakelaar staat standaard uit
    (`npm run test:stapverplicht`).
  - *Grenzen.* Zonder die schakelaar is de tweede stap een eigen keuze per login, en logt het
    gedeelde praktijkwachtwoord in zonder tweede stap en met beheerdersrechten: zet het uit (Team)
    zodra iedereen een eigen login heeft. Met de schakelaar aan kan wie het wachtwoord kent van een
    login die de tweede stap nog niet heeft ingesteld, hem als eerste instellen. De eigenaar komt
    er dan niet in en het staat in de Activiteit; een beheerder wist hem (Team → wissen). Stil
    meekijken kan niet: elk antwoord met een geheim maakt het vorige ongeldig, dus het geheim dat
    in gebruik komt, heeft alleen de browser gezien die het instellen afmaakt.
    Het geheim staat leesbaar in `praktijk-accounts.json`, want de server moet de code kunnen
    narekenen; wie die schijf kan lezen, heeft ook de tweede stap. De login van V1 (`/`) en de
    beheersleutel hebben geen tweede stap. `npm run test:tweedestap` dekt de rekenkern (testvectoren
    uit RFC 4226 en RFC 6238), de QR-code en de routes.

## Gratis proef van 14 dagen (/v2/proef)

Alle "Probeer gratis"-knoppen op de landing gaan naar **/v2/proef**: e-mailadres, contactpersoon en
telefoonnummer (praktijknaam optioneel), met controle op tikfouten in het e-maildomein, wegwerpadressen
en Nederlandse/buitenlandse telefoonnummers. Daarna staat de praktijk direct in `/v2/app` met een
voorbeeldkaart (6 rugoefeningen), een proefbalk (dagen over, teller x/12) en de knop **Test de QR op je
telefoon**. De pagina's zijn scriptloos; de logica staat in `lib/proef.js` en `server.js`.

- Proef hangt aan een HttpOnly-cookie `fpproef`; op schijf (`proef-aanmeldingen.json`) staat alleen de hash.
- Na 14 dagen toont `/v2/app` een verlopen-pagina met **Ja, ik wil doorgaan**, en weigert `/api/kaarten`
  nieuwe kaarten voor dat apparaat. Gedeelde patiëntkaarten (`/k/<id>`) blijven werken.
- Meldingen (alleen als mail is ingesteld): nieuwe aanmelding, "wil doorgaan" en twee dagen voor het einde
  naar `PROEF_MELDING_AAN` (komma-gescheiden; standaard `ACCOUNT_BEHEER_EMAILS`); welkomstmail met een
  persoonlijke link voor een tweede apparaat en een herinnering naar de aanmelder.
- Overzicht met CSV-export, "klant geworden", "+7 dagen" en wissen op **/aanmeldingen**, alleen voor
  ingelogde `ACCOUNT_BEHEER_EMAILS` (niet met admin88). `/dashboard88` toont alleen aantallen.
- AVG: geen IP-adres opgeslagen, aanmelder kan zelf wissen, automatisch gewist 30 dagen na afloop
  tenzij klant. `npm run test:proef` test de hele flow tegen een nagebootste maildienst.

## Beheer via /admin88

De gewone URL is voor het maken en printen van kaarten. Bibliotheekbeheer gebeurt op
**`/admin88`** (herkenbaar aan de "Beheer"-badge). Alleen daar zijn beschikbaar:

- **Oefening toevoegen** (naam + categorie + plaatje) — `POST /api/oefeningen`; het plaatje wordt
  in de browser verkleind naar max 900px en op de server bewaard onder `uploads/`. De categorie is
  een vrij veld met suggesties: een bestaande naam (ook bij ander hoofdlettergebruik) hergebruikt
  die categorie, een onbekende naam **maakt automatisch een nieuwe categorie** aan. Tijdens het
  typen van de oefeningnaam wordt een logische categorie voorgesteld (bv. "TRX …" → TRX).
- **Categorie toevoegen** via de `+ categorie`-knop naast de categoriefilters. Een lege categorie
  blijft server-side bewaard en kan daarna als eerste of extra categorie aan oefeningen worden
  gekoppeld. Bij meerdere categorieën toont de lijst ze met een `/` ertussen.
- **Oefening hernoemen** (potloodje ✎) — `POST /api/hernoem` (`naam-wijzigingen.json`).
- **Categorie wijzigen** (pijltjes ⇄) — `POST /api/oefeningen/categorie`
  (`categorie-wijzigingen.json`): verplaats een oefening naar een andere categorie en/of toon hem
  op een 2e plek (het `ook`-veld).
- **Oefening verwijderen** (🗑) — `POST /api/oefeningen/verwijder`; basis-oefeningen komen in
  `oefeningen-verwijderd.json`, zelf toegevoegde worden echt verwijderd.
- **+ Video** — upload, preview, vervang of verwijder een avatar-/instructievideo direct naast
  de oefening; zodra de therapeut de oefening met `+` op een kaart zet, reist de video mee.
- **Plaatjes uploaden** (de lokale lijst-override) is ook alleen zichtbaar in beheer.

Elke beheeractie is **direct server-side** en dus meteen live op beide URL's — er is geen
synchronisatie, wachttijd of aparte deploy nodig. Het geserveerde `oefeningen.json` =
basisbestand + hernoemingen − verwijderd + toegevoegd. `/health` toont de tellers
(`hernoemd`, `toegevoegd`, `verwijderd`).

De mutatie-API's eisen een sleutel-header (`x-admin-sleutel`). De beheerpagina's vragen de
beheerder om die sleutel en bewaren hem alleen in het tabblad (sessionStorage); hij staat
in geen enkel publiek bestand. Live (Railway of `NODE_ENV=production`) werkt alleen een eigen
`ADMIN_KEY`: zonder die variabele blijft beheer dicht. Alleen lokaal is `admin88` de standaard.
Met de standaardsleutel kan beheer **geen** kaartoverzicht of patiëntgegevens van een praktijk
lezen; alleen met een eigen `ADMIN_KEY` op de server werkt die beheeringang.

**Een praktijk die er niet meer in komt.** Beheer kan het account van een praktijk niet wissen
en komt met de sleutel niet bij de kaarten van een beveiligde praktijk (de oude
`/api/praktijk/reset` wist niets meer en antwoordt 410). Is een praktijk haar wachtwoord en
herstelcode kwijt, dan laat beheer de server een herstelmail sturen:

```
curl -X POST https://fysiplan.nl/api/beheer/praktijk-herstel \
  -H "x-admin-sleutel: $ADMIN_KEY" -H "content-type: application/json" \
  -d '{"praktijk":"Naam of p-code","reden":"Praktijk belde: wachtwoord en herstelcode kwijt"}'
```

De mail gaat naar een adres dat de praktijk zelf heeft opgegeven: de beheerders met een eigen
login (zij kiezen via een link een nieuw wachtwoord), en als die er niet zijn de aanmelder van de
proef (die krijgt een herstelcode voor het praktijkwachtwoord). De reden is verplicht en staat in
de mail en in het logboek dat de praktijk zelf ziet. De link of code is 48 uur geldig en staat
nooit in het antwoord aan beheer, alleen het gemaskeerde adres. Tot de praktijk de mail gebruikt
verandert er niets: wachtwoorden en sessies blijven werken. Hooguit drie aanvragen per praktijk
per dag. Is er van de praktijk geen eigen adres bekend, of staat mail uit, dan kan het niet via
deze weg (`npm run test:beheerherstel`). De beheersleutel alleen opent zo geen praktijk meer. Wie
bij de server of bij de mailprovider kan (die bewaart verzonden mail), blijft technisch bij
gegevens kunnen; daarom staan de reden en het moment in het logboek van de praktijk.

Heeft een beheerder een tweede stap bij het inloggen en is ook die kwijt (telefoon én
reservecodes), stuur dan `"tweedeStap": true` mee in hetzelfde verzoek. De mail zegt dan dat met de
link ook de tweede stap vervalt; dat gebeurt pas als de beheerder de link gebruikt, en het staat in
het logboek van de praktijk. Zonder die vlag blijft de tweede stap staan en is de mailbox alleen
niet genoeg om in te loggen. Doe dit alleen na controle dat de vraag echt van de praktijk komt
(terugbellen op het bekende nummer): met de vlag is toegang tot de mailbox weer genoeg.

**Mail bij een seintje.** Tikt een patiënt “Ik heb een vraag” of “Het doet te veel pijn”, dan
stuurt de server een korte mail naar de praktijk (als `MAIL_API_SLEUTEL` en `MAIL_AFZENDER` gezet
zijn): dát er een seintje is, met een link naar de app. Er staat geen naam van de patiënt, geen
soort seintje en geen inhoud in. De mail gaat naar de behandelaar van de kaart, anders naar wie de
kaart maakte, anders naar de beheerders met een eigen login, anders naar de aanmelder van de proef;
nooit naar het openbare contactadres uit het profiel. Alleen een nieuw open seintje of een vraag
die oploopt naar pijn geeft een mail, “Het gaat goed” niet. Per adres hooguit één mail per
kwartier (wat in die tijd binnenkomt, gaat samen in de volgende) en per praktijk hooguit 40 per
24 uur. Wat nog niet gemaild is, blijft op schijf gemerkt (`seintje.meld`) en gaat alsnog: na de
rem, na een storing bij de mailprovider of na een herstart. De patiënt wacht nooit op de mail. Een
beheerder zet het per praktijk uit onder Kaarten → Team. Het is geen alarm: wat de patiënt te
lezen krijgt (“ziet het pas bij het inloggen”) blijft gelden (`npm run test:seinmail`).

## V1-account en bevestigingsmail

De app op `/` (V1) staat altijd achter een e-mail/wachtwoordlogin. Een medewerker kiest
**Account aanmaken**, vult het e-mailadres en de gedeelde registratiecode van FysioTotaal in,
ontvangt een eenmalige link en kiest via die link zelf een wachtwoord. Dezelfde mailroute verzorgt
**Wachtwoord vergeten**. Instellinks zijn 24 uur geldig en kunnen maar één keer worden gebruikt.

Stel op de server in:

- `V1_REGISTRATIE_CODE` — de registratiecode die FysioTotaal aan medewerkers geeft;
- `MAIL_API_SLEUTEL` — API-sleutel van Resend;
- `MAIL_AFZENDER` — geverifieerde afzender, bijvoorbeeld `Fysiplan <account@fysiplan.nl>`;
- optioneel `MAIL_API_BASIS` — standaard `https://api.resend.com`, alleen nodig voor een andere
  compatibele mail-API of een lokale testserver.

V2 (`/v2/app`) en beheer (`/admin88`) houden hun eigen toegangsmodel. Draai
`npm run test:ahmed-notities` voor een lokale end-to-endtest met een nagebootste maildienst;
de test verstuurt geen echte e-mail.

> **Blijvend bewaren op Railway:** de containerschijf wordt bij elke redeploy gewist. Voeg in
> Railway een **Volume** toe met mount path `/data` (service → rechtsklik → Attach volume) —
> de server gebruikt die map dan automatisch en de naamwijzigingen overleven elke deploy.
> Zonder volume blijven wijzigingen bewaard tot de eerstvolgende redeploy/herstart.

Voor een videotheek met duizenden avatarvideo's hoort de daadwerkelijke video-opslag in
Cloudflare Stream. Zet daarvoor op de Railway-service:

- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account-id;
- `CLOUDFLARE_STREAM_TOKEN` — API-token met uitsluitend **Stream Write**.

De koppelingen en metadata blijven op `/data`; de zware videobestanden staan dan in Stream.
`/health` meldt onder `videoOpslag` welke route actief is.

## Eigenaars-dashboard via /dashboard88

Op **`/dashboard88`** (ook bereikbaar via de knop *Dashboard* in beheer) staat het
eigenaars-dashboard, met automatische verversing per minuut en een donkere modus:

- **Gebruik:** bezoeken en unieke bezoekers per dag (anonieme dag-hash van IP+browser, niets
  herleidbaars opgeslagen), kaarten opgeslagen en geprint (de app stuurt tellers via
  `POST /api/stats/event` — alleen aantallen, nooit inhoud).
- **Bibliotheek:** oefeningen, categorieën en de beheer-tellers.
- **Security:** geweigerde beheer-verzoeken (tijd, gemaskeerd IP, doel), of de opslag blijvend is
  (Railway-volume) en of er een eigen `ADMIN_KEY` is ingesteld, plus versie en uptime.

De data komt uit `GET /api/dashboard` (beheer-sleutel vereist); tellers staan in
`statistieken.json` in de datamap.

## Nieuwe plaatjes toevoegen (in de repo)

De 215 oefening-plaatjes staan in `public/images/` (per categorie in een submap) en zijn
gekoppeld via `public/oefeningen.json`. Zo voeg je er nieuwe toe zodat **iedereen** ze via de URL
krijgt:

1. Zet de nieuwe afbeeldingen (elk formaat: BMP/PNG/JPG) in een submap onder `public/images/`.
   De **mapnaam bepaalt de categorie**, de **bestandsnaam wordt de oefeningnaam**.
2. Draai het conversiescript. Het zet zware BMP/PNG om naar compacte JPEG's, verwijdert de
   originele bronmappen en (her)bouwt `public/oefeningen.json`:

   ```
   npm install --no-save jimp        # eenmalig, alleen voor dit script (staat niet in deps)
   node scripts/convert-images.mjs
   ```

3. Normaliseer daarna de lijnsterkte van nieuwe en bestaande tekeningen:

   ```
   python3 -m pip install Pillow   # eenmalig
   npm run images:normalize
   ```

4. Controleer de app lokaal (`npm run build && npm run start`), dan committen + pushen. Railway
   deployt automatisch en de nieuwe oefeningen staan live voor iedereen.

> De categorie-namen en hun volgorde staan bovenin `scripts/convert-images.mjs` (de `CAT`-tabel);
> pas die aan als je een map anders wilt labelen.

## Data & privacy

> Deze beschrijving is technisch. De juridische teksten staan op **/privacy** en
> **/verwerkersovereenkomst** (`public/juridisch.html`); laat die door een jurist toetsen
> voordat je er op vertrouwt.

**v1 (`/`)**: kaarten, cliëntgegevens en eigen oefeningen blijven lokaal in de browser
(`localStorage`/IndexedDB). De oefening-plaatjes zijn openbaar via hun URL; dat zijn geen
persoonsgegevens.

**v2 (`/v2/app`)**: een kaart staat eerst alleen in de browser. Is de praktijk beveiligd en heeft
de kaart een roepnaam, dan deelt de app hem met de patiënt. Fysiplan is dan verwerker voor de
praktijk (AVG art. 28): bij het beveiligen en bij de proefaanmelding gaat de praktijk akkoord met
de verwerkersovereenkomst; de versie en het tijdstip staan bij het praktijkaccount (`vwo`).

- **Op de server per gedeelde kaart:** roepnaam (`client.c_naam`), max. HF en trainingszone,
  doel en opmerking van de therapeut, de oefeningen met dosering en schema, persoonlijke video's,
  en wat de patiënt zelf aantikt (pijnscore, oefenvinkjes, ervaren herstel, PSK, seintje,
  te zwaar). Daarnaast de werknotitie, behandelaar en afspraak van de praktijk. Leeftijd en
  Casus gaan niet naar de server; oudere kaarten worden bij het opstarten opgeschoond.
- **De patiënt ziet** (`GET /api/kaart`): alleen het eerste woord van de roepnaam, het doel, de
  opmerking en de kaartinhoud. De volledige kaart staat alleen op `GET /api/praktijk/kaart`
  (ingelogde praktijk).
- **Inloggen blijft over een uitrol heen:** praktijksessies staan in het geheugen en in
  `praktijk-sessies.json` in de datamap (`lib/sessie-opslag.js`). Op schijf staat alleen de
  SHA-256 van het sessietoken, nooit het token zelf. Een sessie geldt 30 dagen en hoort bij het
  wachtwoord waarmee is ingelogd: na een wachtwoordwijziging werkt hij niet meer. Het bestand
  gaat niet mee in de reservekopie. Wil je iedereen opnieuw laten inloggen (bijvoorbeeld na het
  terugzetten van een reservekopie), verwijder dan dat bestand en herstart. Bij een uitrol
  (SIGTERM) maakt de server lopende verzoeken af voordat hij stopt.
- **Tweede stap bij het inloggen:** heeft een login een tweede stap, dan staan bij dat lid in
  `praktijk-accounts.json` het geheim van de code-app (leesbaar), de SHA-256 van de ongebruikte
  reservecodes, de laatst gebruikte tijdstap en de teller van foute codes. Ze gaan mee in de
  reservekopie en verdwijnen bij uitzetten, bij wissen door een beheerder en met het account. De
  waarschuwingsmail na te veel foute codes gaat naar het adres van de login zelf en bevat de
  praktijknaam en de voornaam, geen code en geen geheim. Vraagt een praktijk de tweede stap
  van iedereen, dan staat dat met het moment bij de praktijk zelf (`stapVerplicht`); het staat ook
  in de download van de praktijkgegevens.
- **Bewaartermijn** (automatisch, elke 6 uur en bij het opstarten): een kaart verdwijnt na
  `BEWAAR_STIL_DAGEN` (standaard 90) dagen zonder activiteit, of `BEWAAR_AFGEROND_DAGEN`
  (standaard 30) dagen na afronden (archiveren). Na de invoering geldt eenmalig een aanloop van
  `BEWAAR_AANLOOP_DAGEN` (standaard 30) dagen (`bewaartermijn.json`), zodat niemand onverwacht
  kaarten kwijtraakt. De dagelijkse reservekopie bewaart hooguit 7 dagen.
- **AI** (alleen met `ANTHROPIC_API_KEY`): de zoekhulp stuurt alleen lichaamsdeel, trainingsdoel
  en een paar zoekwoorden; de vraaghulp op de patiëntkaart (standaard uit, alleen aan met
  `VRAAGHULP=aan`) stuurt de vraag plus de namen en
  bibliotheekuitleg van de oefeningen; vertalen gaat alleen over bibliotheekteksten en namen van
  eigen oefeningen. Geen naam, doel, opmerking of score gaat naar de AI-dienst. De weekbrief is
  een vaste feitenlijst zonder AI. De patiëntkaart zegt in negen talen dat antwoorden van een
  AI-programma komen (AI-verordening art. 50).
- **Beoogd gebruik:** maken, printen en delen van oefenkaarten en tonen wat patiënten zelf
  aangeven. Fysiplan stelt geen diagnose, kiest geen behandeling of dosering en duidt geen
  scores (geen rood/groen, geen "aandacht"-labels). Op dit beoogd gebruik rust de inschatting dat
  Fysiplan geen medisch hulpmiddel is (MDR, MDCG 2019-11); laat die toetsen, en houd nieuwe
  functies en marketingteksten binnen dit beoogd gebruik.

Omgevingsvariabelen voor de juridische pagina's: `FYSIPLAN_BEDRIJF`, `FYSIPLAN_KVK`,
`FYSIPLAN_ADRES`, `FYSIPLAN_CONTACT` (anders het adres uit `MAIL_AFZENDER`) en
`FYSIPLAN_HOSTING_REGIO` (de Railway-regio, bijv. "EU West (Amsterdam)"). Zonder deze waarden
tonen de pagina's een nette lege plek of "nog niet vastgelegd".
