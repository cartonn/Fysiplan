# Routine-backlog: gebruikers-sweep (V2)

Bijgehouden door de gebruikers-sweep (elke 4 uur). Vier persona's gebruiken de V2-app lokaal
op mobiel, tablet en desktop. Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
Beveiliging staat in `docs/security-backlog.md`, juridisch in `docs/legal-backlog.md`,
werk voor Ahmed in `docs/mensenwerk.md`.

## Flow × apparaat → laatst getest

| Flow | Desktop 1280 | iPad | iPhone SE | iPhone 14 | Pixel 7 |
|---|---|---|---|---|---|
| Proef aanmelden + formulierfouten | 2026-11-06 22u | – | – | 2026-11-06 22u | – |
| Welkom, praktijknaam (ook leeg), 12 oefeningen | 2026-11-06 22u | 2026-11-06 | – | 2026-11-06 22u | – |
| Printversie (lijn, kleur, compact) | 2026-11-06 22u | 2026-11-06 22u (kleur liggend) | – | 2026-11-06 22u (venster) | – |
| Beveiligen, herstelcode, inloggen 2e apparaat | 2026-11-06 22u | 2026-11-06 22u | – | 2026-11-06 22u | – |
| Delen, QR, kaartenoverzicht, CSV | 2026-11-06 22u | 2026-11-06 22u | – | 2026-11-06 22u | – |
| Teamsjabloon, eigen oefening (foto), eigen video | 2026-11-06 22u | 2026-11-06 22u | – | – | – |
| Opname via telefoon /o | – | 2026-11-06 22u | – | iPhone 13: 2026-11-06 22u | – |
| Afspraak, seintje, signalen | 2026-11-06 22u | 2026-11-06 22u | 2026-11-06 22u | 2026-11-06 22u | 2026-11-06 22u |
| Proef bijna verlopen / verlopen | 2026-11-06 | 2026-11-06 (code) | – | – | – |
| /k: lezen, voorlezen, pijnscore, herstel, gedaan, te zwaar | – | – | 2026-11-06 22u | 2026-11-06 22u | 2026-11-06 22u |
| /k: 200% tekst, offline, Engels, landscape, trage lijn | – | – | 2026-11-06 22u | 2026-11-06 22u | 2026-11-06 22u |
| /k: video afspelen (eigen opname, YouTube) | – | – | 2026-11-06 | – | – |
| /k: Duits en Arabisch (rtl) | – | – | 2026-11-06 | – | – |
| Landing /v2 op mobiel | – | – | – | iPhone 13: 2026-11-06 | 2026-11-06 22u |
| Therapeut-app op telefoon | – | – | – | 2026-11-06 22u | – |

Volgende run: de echte verlopen-pagina (server herstarten met een proef-aanmeldingen.json met
`verloopt` in het verleden: de server leest dat bestand alleen bij het opstarten), de therapeut-app
op Pixel 7, /k in het Duits op Pixel, iPad-print in Safari kan niet (Chromium draait de PDF), en
de bibliotheekvideo op /k (lokaal hebben de oefeningen geen video).
Testtip: Playwright-telefoonprofielen staan op en-US; geef `locale: 'nl-NL'` mee voor een Nederlandse kaart.

Testtip: alle agents delen localhost en dus één IP-bucket van de lees- en schrijfrem. Geef elke
browsercontext lokaal een eigen `x-forwarded-for`, anders krijg je 429's.

## Open

### HOOG
- **/k: eigen video van de therapeut verdwijnt bij een oefening met een afgekeurd beeld.** Chair squat
  staat `rejected` in mobile-media-review.json; `public/kaart.html` (rond `if(hideMedia||holdExplanation)knop='';`)
  verbergt dan ook de eigen opname, die los staat van het beeld. De app toont de video als "aan";
  de patiënt ziet alleen "De oefenafbeelding wordt gecontroleerd". iPhone SE (Truus, 2026-11-06).
  Let op: de reviewlogica zelf niet aanraken, alleen de eigen video (`vids`) los van het beeld tonen.

### MIDDEL
- **App: Kaarten-venster hoger dan het scherm na beveiligen of een nieuwe herstelcode.** Titel valt
  boven weg, "Sluiten" onder; scrollen helpt niet (`.ov` zonder `overflow-y:auto`, `.modal` zonder
  `max-height`, public/index.html rond r. 189). Geldt voor elk hoog venster. Desktop 1280×800 (Mark).
- **/k: pijnscore toont soms een ander cijfer dan de server bewaart.** 2 en snel 6 tikken op een
  trage lijn: kaart toont 2, therapeut ziet 6 (mschaal-handler zonder bezig-slot of volgnummer,
  public/kaart.html). iPhone SE (Truus).
- **/k: lightbox op iPhone SE staand moeilijk te sluiten.** Geen sluitknop; tik op het witte paneel
  wisselt de houding; alleen de donkere rand (~15 %, stroken van 18 px) sluit. Paneel bedekt de helft
  van "Foto tonen" en "Luister naar uitleg". Bij 200 % tekst valt de lightbox buiten beeld. (Truus)
- **App op iPhone 14: tikdoelen in Kaarten 15–36 px** (Uitloggen, Nieuwe herstelcode, Activiteit
  15 px; Rapport/CSV 22 px; filterchips 24 px); Kopie en × wrappen naar een eigen regel. (Sanne)
- **Afspraak "nog N keer" is dubbelzinnig**: bij ×4 staat er "nog 4 keer" vóór de eerste afspraak
  (kaart.html `tekenAfspraak`/`TAFHER`, index.html `volgendeAfspraak`). Kies "afspraak 1 van 4" of
  tel de eerstvolgende niet mee. Pixel 7, iPhone 14 (Jayden).
- **App: proef voorbij bij sjabloon, eigen oefening, afspraak, opname** toont `alert(d.fout)` of kleine
  tekst "Kijk op fysiplan.nl/v2/proef" (geen link, altijd productie). Gebruik `toonProefVoorbij()` uit
  index.html (sinds deze run) bij elke `d.proefVerlopen`. (Mark)
- **Collega op tweede apparaat ziet de proefbalk en aftelling niet; /v2/proef toont daar het
  aanmeldformulier**, ook via de link "Wil je doorgaan?". PROEF komt alleen uit de proefcookie
  (server.js `/v2/app` en `/v2/proef`); ook het praktijkaccount (`acc.proef`) gebruiken. iPad (Mark).
- **Tweede apparaat: welkomstvenster heeft geen "inloggen bij mijn praktijk"**, alleen stappen voor
  een nieuwe praktijk. iPad (Mark).
- **Print: lange praktijknaam afgekapt** ("Fysiotherapie & Manue"): de kop is een `<input id="praktijk">`
  en die print op één regel. Desktop en iPad (Sanne).
- **Landing /v2 op mobiel: tikdoelen 14–22 px** (navigatie, taallinks, "Bekijk de kaart vergroot",
  voet); "Vragen" valt buiten beeld in een scrollstrook zonder hint. Printvenster-knoppen 33 px. iPhone 13 / iPad (Sanne).
- **/k: dubbel tikken maakt ongedaan** bij de videoknop en bij "gedaan" per oefening (twee POSTs, kunnen
  ook in omgekeerde volgorde aankomen: patiënt ziet niet gedaan, therapeut wel). Bezig-slot nodig in
  `toggleOefDaan` en de vbtn-toggle. iPhone SE, Pixel 7 trage lijn (Truus, Jayden).
- **/k: trage lijn geeft geen feedback** bij pijnscore/herstel: oude keuze blijft 2–3 s staan. Pixel 7 (Jayden).
- **/k: "gedaan vandaag" rekent client in lokale tijd, server in Amsterdam-tijd**, en is een toggle; in een
  andere tijdzone kan een tik het vinkje van gisteren weghalen. `bevestigGedaan` toggelt met verouderde
  `K` op een tweede apparaat (server.js `/api/kaart/gedaan`, kaart.html `dagStr`). (Jayden)
- **/k: "Kaart niet gevonden" altijd Nederlands**, ook met `?taal=en`; `toonStoring` alleen NL/EN. (Jayden)
- **/k: voorlezen geeft een systeem-alert met technische tekst**, altijd Nederlands (`meldOntbrekend`). (Truus)
- **/k (Arabisch): onvertaalde Nederlandse tekst staat rtl** (punt vooraan); geef niet-vertaalde tekst
  `lang="nl" dir="ltr"`. "De oefenafbeelding wordt gecontroleerd" is niet vertaald. (Truus)
- **/k: seintjes overschrijven elkaar**: "vraag" en daarna "gaat goed" → de vraag verdwijnt stil (één `seintje`-slot). (Jayden)
- **/k: offline afgevinkt bereikt de therapeut nooit.** Geen wachtrij of `online`-handler, terwijl
  de offline-banner "versturen lukt weer zodra je internet hebt" belooft (kaart.html, oefening-POST
  met lege `.catch`; `#gdaan` meldt niets). iPhone SE.
- **/k: knop "Grotere letters" en 200% tekstgrootte geven horizontaal scrollen en afgeknipte woorden.**
  `html.groot body{zoom:1.16}`, `.oef{overflow:hidden}`, `.oefkop`/`.chip` wrappen niet. iPhone SE.
- **/k: contrast van uitlegtekst 2,7:1** (`--zacht:#a39c8a` op #fffefa), tekst 9,5–12,5 px.
- **/k: tikdoelen onder 44 px**: Te zwaar? (78×21), sluitkruisje appbanner (21×34), Alles gedaan,
  Begrepen, agenda-dagknoppen, koptekstknoppen.
- **/k: terugknop met open lightbox verlaat de kaart** (geen pushState/popstate). Pixel 7, iPhone 14.
- **/k: lightbox in landscape**: bovenkant valt weg, naam over uitleg, knoppen achter de foto.
- **/k (Engels): servermeldingen in het Nederlands** (`d.fout` direct getoond), en 'gedaan' faalt stil.
- **/k (Engels, trage lijn): eerst een halflege Nederlandse kaart**, geen laadstaat tot ~3,5 s.
- **App: dubbelklik op "+1 week" verzet de afspraak twee weken** (geen bezig-slot op Bewaar).
- **App: modale vensters niet met toetsenbord**: geen focus naar het venster, geen Escape, geen role=dialog.
- **App: printversie toont placeholders van het praktijkadres** ("adres / postcode en plaats / …").
- **App 1280×800: A4 past niet; QR en deelknoppen na delen buiten beeld** (`#a4wrap` scrolt horizontaal).
- **Foutmelding "Alleen beschikbaar voor beheer." bij fout wachtwoord of foute herstelcode.**
  Al opgelost in open PR #41 (server.js `denied()` met eigen tekst); mergen of overnemen.

### LAAG
- /k: lang woord zonder spaties in het bericht van de therapeut maakt de pagina 1818 px breed
  (`.akaart .atekst` zonder `overflow-wrap:anywhere`); erger dan de bekende lange link. (Truus)
- /k: pijnschaalknoppen 36×46 px op iPhone SE, schaal breekt 6+5 en "10 = ergste pijn" staat los;
  appbanner bedekt "Neem pijn serieus" bij 8+. (Truus)
- Proefformulier: "06 1234 5678" (placeholder en voorbeeld in de foutmelding) wordt zelf geweigerd
  (lib/proef.js). (Sanne, Mark)
- App op telefoon: "Test de QR op je telefoon" toont een QR en "Open op deze computer"; toetsenbordhints
  "/ zoeken · Enter toevoegen" staan ook op de telefoon. (Sanne)
- Kleurprint: staande afbeelding (Rugstrekken, apparaat) steekt boven de cel uit. Desktop (Sanne).
- Dubbelklik op "Toevoegen" bij Eigen oefening: opgeslagen en daarna 409 "bestaat al" (`eo_bewaar`
  zet `disabled` pas na FileReader). Desktop (Mark).
- .ics: lange regels niet gevouwen (RFC 5545, 75 octets) bij een lange praktijknaam. (Jayden)
- Prijscalculator /v2 zonder bovengrens (99999999999 therapeuten). (Jayden)
- Dubbelklik op "In de praktijk": kaart wordt opgeslagen, daarna alert "Er is al een kaart …" (409 van de tweede POST). (Sanne)
- Proefformulier past rare invoer stil aan (`<script>` → "scriptalert(1)/script", 10.000 tekens → 80) in plaats van te melden. (Sanne)
- Beeldknop heet "Lijntekeningen | Avatar", landing en printvenster zeggen "kleur of lijntekening". (Sanne)
- /k (Engels): kop "S H W" (H/W Nederlands), grafieklabel dd-mm, afspraak in US-notatie, aria-labels Nederlands;
  na een mislukte vertaling probeert de kaart het die sessie niet opnieuw. (Jayden)
- Server knipt tekst af midden in een emoji (`slice` op UTF-16 in `sanStr`), geeft "�". (Jayden)
- /k: foutmelding van de videospeler alleen NL/EN; appbanner wisselt niet mee van taal en bedekt de uitleg onder de video. (Truus)
- Kaartenoverzicht "actief deze week" telt pijnscore, herstel en seintjes niet mee (`actiefDezeWeek`). (Truus)
- Kaartenoverzicht ververst niet direct na beveiligen ("Nog geen gedeelde kaarten" tot heropenen).
- Lange kaartnaam: melding toont de hele invoer, server bewaart 60 tekens; `#k_naam` zonder maxlength.
- Bijna verlopen proef: "loopt nog vandaag nog", en "t/m zaterdag" terwijl hij vrijdag afloopt.
- /v2/proef zegt "Vul drie gegevens in", er zijn vijf verplichte velden.
- Verwerkersovereenkomst twee keer aanvinken (proef en beveiligen).
- Nieuwe proefgebruiker ziet bij het tweede bezoek meteen "Nieuw in Fysiplan".
- /k: lange link in bericht van therapeut steekt buiten de kaart (`.atekst` zonder `overflow-wrap:anywhere`).
- /k: "Ik heb vandaag geoefend" is een aan/uit-knop; nog eens tikken wist de oefendag.
- /k: lightbox zegt "De uitvoering is niet door een fysiotherapeut goedgekeurd" (verwarrend voor patiënt).
- App: knoppen 28–36 px hoog op desktop en tablet; Print loopt op iPad liggend tegen de rand.

## Opgelost

- **HOOG — proef zonder praktijknaam liep vast in Kaarten.** Kaarten vraagt nu de praktijknaam
  (min. 2 tekens) en toont daarna het beveiligingsblok. OPGELOST 2026-11-06 PR #53.
  Test: `npm run test:praktijkslot`.
- **HOOG — 429/5xx leek op "nog niet beveiligd" en "nog geen gedeelde kaarten".** Nu: "De server is
  even druk / kan nu niet laden. Je kaarten zijn niet weg." met "Opnieuw proberen", en geen
  Beveiligen-knop bij een storing. OPGELOST 2026-11-06 PR #53. Test: `npm run test:praktijkslot`.
- **HOOG — telefoon en iPad staand: geen beeldkeuze (lijn/kleur) en geen Help** (Sanne, Mark).
  v2.css verborg `.menu` onder 920 px; nu een eigen regel onder de knoppen. OPGELOST 2026-11-06 PR #53.
- **HOOG — /k: "Te zwaar?" zei "Doorgegeven ✓" ook als versturen mislukte** (offline, 429, 5xx; Truus).
  Nu pas na een 2xx, anders "Niet verstuurd. Tik opnieuw". OPGELOST 2026-11-06 PR #53.
  Test: `npm run test:tezwaar`.
- **LAAG — afspraak-.ics met taal=__proto__ gaf "SUMMARY:undefined"** (Jayden). `Object.hasOwn`.
  OPGELOST 2026-11-06 PR #53.
- **KRITIEK — verlopen proef op een tweede apparaat gaf een eindeloze herlaadlus** (Mark, iPad,
  ingelogd zonder proefcookie). De app herlaadde bij `proefVerlopen`, maar /v2/app serveert zonder
  cookie gewoon weer de app: 6 herlaadbeurten in 12 s, invoer weg. Nu een vaste melding bovenaan
  ("Je gratis proef is voorbij" met link naar /v2/proef), lezen blijft werken en automatisch delen
  stopt (`toonProefVoorbij` in public/index.html). OPGELOST 2026-11-06 PR #49. Test: `npm run test:tablet`.
- **HOOG — /k: offline werkt pas na het tweede bezoek.** De kaart stuurt de werker nu na het eerste
  laden de adressen die al geladen zijn (pagina, `/api/kaart?id=`, vertaling, beelden); de werker
  bewaart ze (alleen eigen site, geen video's of schrijfroutes). OPGELOST 2026-11-06 PR #49.
  Test: `npm run test:offline`.
- **HOOG — tablet: knopjes "eigen video" en × onbereikbaar.** Op apparaten zonder aanwijzen staan ze
  nu altijd, 30 px met een tikvlak van 44 px; met toetsenbord zichtbaar bij focus en te openen met
  Enter/spatie. OPGELOST 2026-11-06 PR #49. Test: `npm run test:tablet`.

- **MIDDEL — na een verlopen proef kwamen patiëntseintjes nergens meer aan.** Ahmed koos 2026-11-06
  voor een alleen-lezen overzicht: de verlopen-pagina heeft nu "Seintjes van je patiënten"
  (praktijknaam + wachtwoord, POST /v2/proef/overzicht), met seintjes bovenaan, pijn, herstel,
  laatst geoefend en afspraak. Geen sessie, geen schrijfroute. OPGELOST 2026-11-06,
  PR "kaart: seintjes blijven zichtbaar na een verlopen proef". Test: `npm run test:proef`.
- **HOOG — CSV-export liet formules door** (`=1+1`, `@SUM`, `+`, `-`): Excel/LibreOffice voerden
  ze uit. Nu krijgt zo'n cel een `'` ervoor (`csvCel` in public/index.html). OPGELOST 2026-11-06,
  PR "kaart: CSV zonder formules, afspraak met tijdzone, druk is geen weg kaart". Test: `npm run test:sweep`.
- **HOOG — afspraak-.ics een uur verkeerd buiten Nederlandse tijd**: DTSTART was zwevend, nu
  `TZID=Europe/Amsterdam` met VTIMEZONE (ook goed over de zomertijdwissel). OPGELOST 2026-11-06, zelfde PR.
- **HOOG — /k zei bij druk (429) of serverfout "Deze trainingskaart bestaat niet (meer)"**: nu alleen
  bij een echte 404; anders "Even geen verbinding" met Opnieuw proberen, en de service worker geeft
  bij 429/5xx de laatst geladen kaart uit de cache. OPGELOST 2026-11-06, zelfde PR.
