# Routine-backlog: gebruikers-sweep (V2)

Bijgehouden door de gebruikers-sweep (elke 4 uur). Vier persona's gebruiken de V2-app lokaal
op mobiel, tablet en desktop. Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
Beveiliging staat in `docs/security-backlog.md`, juridisch in `docs/legal-backlog.md`,
werk voor Ahmed in `docs/mensenwerk.md`.

## Flow × apparaat → laatst getest

| Flow | Desktop 1280 | iPad | iPhone SE | iPhone 14 | Pixel 7 |
|---|---|---|---|---|---|
| Proef aanmelden + formulierfouten | 2026-11-09 18u (ok; 0612345678 nog misleidend) | 2026-11-08 10u staand | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Welkom, praktijknaam (ook leeg), 12 oefeningen | 2026-11-09 18u (ok; lange naam 66 tekens; "Nieuw in Fysiplan" direct na welkom) | 2026-11-07 10u | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Printversie (lijn, kleur, compact) | 2026-11-10 10u (Groot liep van de A4 → OPGELOST, test:printgroot; compact geeft nog geen extra schemaruimte) | 2026-11-09 22u liggend (printknop ok; kaartvelden 8–11 px hoog) | 2026-11-07 14u | 2026-11-06 22u (venster) | 2026-11-07 10u |
| Beveiligen, herstelcode, inloggen 2e apparaat | 2026-11-09 18u (ok; herstelcode kleine letters ok) | 2026-11-09 18u staand (typfout collega: losse praktijk → fix via klaargezette naam) | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Delen, QR, kaartenoverzicht, CSV | 2026-11-10 10u (CSV-escape ok; dubbelklik Deel nog open; "@Piet" geeft "?") | 2026-11-10 06u staand (tikdoelen overzicht nog < 44) | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Naam wijzigen in overzicht + daarna verder bewerken | 2026-11-09 18u (nieuwe kaart: naamveld volgt → OPGELOST, test:nieuwekaartnaam) | 2026-11-07 10u | 2026-11-07 14u | – | 2026-11-07 10u |
| Teamsjabloon, eigen oefening (foto), eigen video | 2026-11-10 10u (ok; nep-JPEG/.exe nette melding, 6 MB verkleind) | 2026-11-10 10u staand+liggend (sjabloon ok; tekstkolom liggend 303 px) | – | – | – |
| Opname via telefoon /o | 2026-11-09 14u (ok; vals "verouderd" na opname OPGELOST) | 2026-11-09 18u (nep-camera ok; .exe 400) | – | 2026-11-07 10u | 2026-11-09 10u (ok) |
| Afspraak, seintje, signalen | 2026-11-10 10u (seintje → inbox, ook bij collega) | 2026-11-08 18u staand (afspraak na verlopen proef stil) | 2026-11-08 18u (seintje → inbox ok) | 2026-11-10 10u #162 (.ics 1 download, nog 3 verzoeken) | 2026-11-10 10u #162 (Engels ok) |
| Proef bijna verlopen / verlopen (echte verlopen-pagina) | 2026-11-10 10u ("t/m <dag>" + "loopt nog vandaag nog" open) | 2026-11-10 10u staand+liggend (2e apparaat zonder cookie → OPGELOST, test:proeftweedeapparaat) | – | 2026-11-07 02u (breedte) | – |
| /k: lezen, voorlezen, pijnscore, herstel, gedaan, te zwaar | – | 2026-11-09 14u staand+liggend (ok; tikdoelen) | 2026-11-10 10u #162 (dubbeltik Gedaan slaat volgende oefening over: HOOG, naar #162) | 2026-11-10 10u #162 (Engelse oefenstand ok) | 2026-11-10 10u #162 (ok) |
| /k: gedaan-vinkjes op een tweede apparaat | – | 2026-11-07 10u | 2026-11-07 10u | 2026-11-07 10u | 2026-11-07 10u |
| /k: 200% tekst, offline, Engels, landscape, trage lijn | – | – | 2026-11-10 10u #162 (200 %: dosering buiten beeld; offline wachtrij ok) | 2026-11-10 10u #162 (liggend ±49 % over voor de oefening) | 2026-11-10 10u #162 (trage lijn: eerst NL laadtekst; draaien/terug ok) |
| /k: video afspelen (eigen opname, YouTube) | – | 2026-11-08 22u (webm + mp4, staand/liggend) | 2026-11-07 22u (ook offline, 200%) | 2026-11-07 10u | 2026-11-09 22u (eigen webm, ook liggend ok) |
| /k: andere talen | – | – | de/tr 2026-11-09 22u (mislukte vertaling → echte uitleg in NL met melding OPGELOST, test:nietvertaald; demostem las NL met Duitse stem: mee opgelost) | pl/ar 2026-11-08 22u (RTL-naam: fix) | ar + uk 2026-11-08 10u (te zwaar: fix) |
| Landing /v2 (desktop: ook printen) | 2026-11-08 14u (print: fix) | 2026-11-09 10u staand+liggend (nav 22/30 px nog) | 2026-11-09 18u (200 %: 513 px breed door <code> in FAQ; nav 22 px) | 2026-11-09 22u staand+liggend (38/40 tikdoelen < 44 px) | 2026-11-08 22u (taallinks klein) |
| Therapeut-app op telefoon | – | – | 2026-11-07 06u | 2026-11-06 22u | 2026-11-07 10u |
| Therapeut-app op iPad liggend | – | 2026-11-07 10u | – | – | – |
| Twee werkplekken op één kaart (oud apparaat/tabblad) | 2026-11-09 22u (409 + keuze ok; melding ±7 px) | 2026-11-09 22u liggend (idem) | – | – | – |
| Team: uitnodigen, rollen, verwijderen, inbox, dossier | 2026-11-10 10u (oude link na weigering → OPGELOST, test:vuleersterij) | 2026-11-10 10u staand (uitnodiging aangenomen op iPad ok) | – | – | – |
| /privacy (100 % en 200 %) | – | – | 2026-11-09 18u (ok; kopregellinks 14–17 px) | – | – |
| Mijn gegevens /k, Wis van dit apparaat, /v2/gegevens | 2026-11-09 18u (/v2/gegevens: naam niet ingevuld, melding bovenaan) | – | 2026-11-09 18u (wis laat avatars in de cache) | 2026-11-08 02u | 2026-11-09 18u (download Engels ok) |
| Vensters met alleen toetsenbord | 2026-11-09 18u (Kaarten en Print: focus-val en Escape ok) | 2026-11-09 02u staand (fix, in test:vensterterug) | – | – | – |

Volgende run (na 2026-11-10 10u): na merge van #162 de nieuwe /k opnieuw (dubbeltik Gedaan, 200 %, liggend), "Compacte kaart"
schemaruimte, proefbalk "t/m <dag>", .ics dubbeltik, /o op iPad, landing /v2 op tablet, iPad liggend print. Tip: Playwright staat
in /opt/node22/lib/node_modules/playwright (niet in node_modules van de repo); createRequire vindt hem via NODE_PATH.
Oudere lijst (na 2026-11-10 06u): verlopen proef bij laden op 2e apparaat (`/api/praktijk/status`) + "In de praktijk"
(`k_save_srv` → `toonProefVoorbij`), printvariant "Groot lettertype" past niet op A4, teamsjabloon (niet getest 06u), .ics dubbeltik,
/o met camera, iPad liggend print.
Oudere lijst (na 2026-11-09 22u): .ics dubbeltik (kaart.html `naarAgenda` + `#agbtn`), na Uitloggen QR/deelknoppen/roepnaam
weg (`prakLogout`), verlopen proef op een 2e apparaat meteen tonen (`/api/praktijk/status` zonder `proefVerlopen`), lange
praktijknaam + placeholders op de print. Niet getest deze run: /o met camera, compacte/grote printvariant, iPad staand.
Therapeut-app niet op telefoon (therapeuten werken op desktop/tablet). WebKit is niet geïnstalleerd: "iPhone"-devices draaien in Chromium.
Testtip: 200 % op /k of landing is met een mobiele viewport van 160 px slecht na te bootsen (de viewport rekt mee met een bredere pagina).

Testtip: de verlopen-pagina test je met een tweede server op een kopie van de datamap waarin `verloopt`
in proef-aanmeldingen.json in het verleden staat (wordt alleen bij het opstarten gelezen).
Testtip: vanuit een .mjs-test laad je Playwright met `createRequire(import.meta.url)("playwright")`; `import("playwright")` vindt hem niet.

Testtip (2026-11-08): `npm run test:offline` is lokaal wisselvallig (`page.reload: net::ERR_FAILED`, ook op main 2 van 3 keer);
in CI draait het browserdeel niet. Werker-race bij offline herladen: aparte taak.

Testtip: alle agents delen localhost en dus één IP-bucket van de lees- en schrijfrem. Geef elke
browsercontext lokaal een eigen `x-forwarded-for`, anders krijg je 429's.

## Open

### Herontwerp patiëntkaart 2026-11-10 (thread "Verbeter de mobiele ervaring voor patiënten", test:patientmobiel)
De kaart /k heeft nu twee standen met dezelfde oefeningen (zelfde DOM, zelfde knoppen):
- **Overzicht:** datum, "Jouw oefeningen", doel, voortgang, één knop "Begin met oefenen", korte rijen (avatar, naam, "3 × 10",
  vinkje). Daaronder "Hoe ging het vandaag?" (pijnscore eerst), contact (afspraak, seintjes, bellen) en "Meer" (agenda, schema,
  Mijn gegevens, Print/Deel).
- **Oefenstand (`body.sessie`):** één oefening per scherm met groot beeld, dosering in grote cijfers, stemknop, "Zo doe je het"
  per zin, "Te zwaar?" en de pijnregel; onderin vast "Gedaan" met vorige/volgende. Na de laatste oefening sta je bij de pijnvraag.
  De terugknop van de telefoon sluit de oefening (eerst het grote beeld), niet de kaart.
- Wie een test voor /k schrijft: stemknop, video, "Te zwaar?" en uitleg zijn in het overzicht verborgen; open eerst de oefening
  (`#startknop` of een tik op de rij).
- **OPGELOST — /k: uitleg alleen in de lightbox.** Staat nu bij de oefening zelf, 9 talen.
- **OPGELOST — /k: lijntekening op de telefoon** bij een oefening zonder avatar. Nu alleen `kaartImg`; zonder avatar het volgnummer.
- **OPGELOST — /k: "Zet op beginscherm"-balk na 2,5 s over de oefeningen.** Komt pas na de pijnscore of "Ik heb vandaag geoefend",
  nooit over de oefenstand.
- **OPGELOST — tikdoelen /k** minstens 44 px. De pijncijfers zijn sinds de pijnschuif 44 px hoog en op 320 px 26 px breed; de baan
  erboven is 64 px hoog en is het grote doel.
- **OPGELOST — /k: letters in px.** Alles in rem (behalve het grote beeld/lightbox); schaalt mee met de telefooninstelling.
- **OPGELOST — /k: lange pagina zonder houvast.** Vier blokken met één hoofdknop; drie afvinkroutes zijn er nog, maar de oefenstand
  is de hoofdroute en "Ik heb vandaag geoefend" gaat vanzelf aan als alles is afgevinkt.
- **Pijnschuif (zelfde PR).** Boven de elf cijferknoppen ligt een baan die naar "ergste pijn" dikker wordt (`.pschuif`, één kleur,
  bewust geen groen-naar-rood en geen woorden per cijfer: de kaart duidt de score niet). Slepen laat het cijfer meelopen (met een
  vinger komt het rondje boven de duim uit), loslaten of tikken klikt op de cijferknop eronder. De knoppen blijven dus de echte
  bediening (schermlezer, bezig-stand, wachtrij zonder internet, foutmelding); de schuif is `aria-hidden`. Omhoog en omlaag vegen
  bladert (`touch-action:pan-y`, pas schuiven na 8 px opzij). Zelfde schuif bij de doelactiviteit (PSK).
- **Video op de plek van het beeld (zelfde PR).** In de oefenstand delen beeld, afspeelknop en video één rastervak. Afspeelknop
  midden op het beeld met de tekst onderaan; eigen en avatarvideo krijgen rechtsboven een kruisje, YouTube/Stream houden een
  gewone knop onder de dosering. "Video laden…" en de foutmelding staan op de video. In het overzicht een afspeelteken op het
  plaatje. Wie in een test op het midden van het beeld van een video-oefening klikt, raakt de afspeelknop (dat is de bedoeling).
- **OPGELOST — HOOG /k: dubbeltik op "Gedaan" vinkte ook de volgende oefening af** (gebruikers-sweep 10u). Het slot zat per
  oefening; na de eerste tik stond de volgende er al. Nu neemt de knop zelf één tik per 700 ms aan (`KLAAR_SLOT`).
- **OPGELOST — MIDDEL /k: weinig hoogte** (telefoon liggend, heel grote letters): onder 26em hoogte een kleiner beeld en
  "Vandaag gedaan" naast de knoppen in plaats van erboven.
- **AI-label bij de video (keuze Ahmed 2026-11-10).** Het losse label "AI-concept · beoordeling door fysiotherapeut volgt" is
  weg. Er staat één zin: "De stem en video zijn met AI gemaakt en leggen de algemene uitvoering uit. Volg daarnaast de dosering
  en opmerkingen van je behandelaar op." (zonder luisterknop: "De video is met AI gemaakt en laat de algemene uitvoering zien.
  …", 9 talen). Zet het losse label niet terug; de AI-melding zelf moet blijven (AI-verordening art. 50).
- Nog open uit de sweep van 10u: het privacyblok vult bij de eerste opening het eerste scherm (ook op main); na alles gedaan is er
  geen knop voor een tweede ronde; "Toch niet gedaan" gaat zonder internet niet in de wachtrij.
- Nog open: "Ik heb een vraag" met vrije tekst (productkeuze, MDR) en de juridische tekst in het grote beeld (legal).


### Sweep 2026-11-10 06u
- **OPGELOST 2026-11-10 06u (deze PR, test:controletaal) — MIDDEL /k: Engelse kaart toonde de Nederlandse zinnen "De oefenafbeelding
  wordt gecontroleerd…" en "De algemene uitleg wordt gecontroleerd…"** (Jayden). Nu `tr('holdBeeld')`/`tr('holdUitleg')` in alle negen
  kaarttalen; de reviewstatus zelf is niet aangeraakt. Hertest Jayden Pixel 7 + iPhone 14: Engels. Rest: `meldOntbrekend`/`noorMeld`
  (kaart.html r. ~2050) zijn nog Nederlands, maar horen bij de Nederlandse stem; op de Engelse kaart niet te zien.
- **OPGELOST 2026-11-10 06u (deze PR, test:wistweekaarten) — MIDDEL /k: "Wis van dit apparaat" op kaart B wiste beelden die kaart A
  nog nodig heeft** (gedeelde oefening + appicoon; A offline met kapot plaatje) (Truus, iPhone SE). Elke kaart onthoudt nu haar
  beelden (`fp_beelden_<id>`, gaat mee weg bij wissen); wat een andere kaart gebruikt blijft staan, wat alleen B gebruikte gaat weg.
  Is van een andere kaart niet bekend welke beelden ze gebruikt (geopend vóór deze versie), dan blijven de beelden staan.
  Hertest Truus: ok.
- **OPGELOST 2026-11-10 06u (deze PR, test:emojiinitialen) — LAAG App: emoji vooraan in praktijknaam of roepnaam gaf "�" als initiaal**
  in de badge en het kaartenoverzicht (Sanne). `avInitialen` slaat woorden zonder letter over en neemt het eerste codepunt. Hertest: ok.
- **OPGELOST 2026-11-10 10u (test:printgroot) — MIDDEL (nieuw, Sanne desktop) — printvariant "Groot lettertype" loopt van de A4:** tabel groeit tot de onderrand, de legenda
  "S = series…" wordt afgeknipt en de veiligheidsregel (`#a4::after`) valt over de laatste rij; ook bij compact + groot. Groot is
  bovendien amper groter (namen 7,5 → 10 px). public/v2.css r. ~189–193, ~176/209; index.html r. ~385 (`.shw-legenda`).
- **MIDDEL (nieuw, Sanne) — "Compacte kaart" geeft geen extra schemaruimte:** alleen het plaatje krimpt (81×123 → 42×62), de
  `.pic`-cel blijft 83×125 en het aantal rijen gelijk (v2.css r. ~196–197).
- **OPGELOST 2026-11-10 10u (test:proeftweedeapparaat) — MIDDEL (bevestigd, Mark iPad) — verlopen proef op een 2e apparaat pas na de eerste 403**, en "In de praktijk" geeft dan een kale
  alert "Kijk op fysiplan.nl/v2/proef" zonder proefbalk (`k_save_srv` index.html r. ~4664/4685 roept `toonProefVoorbij` niet aan).
  Het oudere punt hieronder "Verlopen proef, eigen login: Kaarten waarschuwt niet vóór opslaan" is dus NIET opgelost.
- **LAAG (nieuw)** — Emoji in de roepnaam telt als "volledige naam" (`naamLijktVolledig`, confirm + label) (Sanne). 13e oefening geeft een
  browser-alert "Maximaal 12 plaatjes" (index.html r. ~1682) (Sanne). "Deel" in het overzicht zonder `aria-expanded` (Sanne). Na
  "Maak mijn login" gaat de focus bij Escape naar body (Mark). Proefbalk "t/m <dag>" terwijl de proef die nacht al stopt (server.js
  r. ~557 vs `datumNl`) (Mark). Te kleine foto (< 100 bytes) zegt "te groot" (server.js r. ~3237) (Mark). `/api/kaart/gedaan` met
  `aan:"<script>"` geeft 200 (Truus). Nederlandse oefennamen op een Engelse kaart zonder vertaling staan onder `lang="en"` (kaart.html
  r. ~1354; `lang="nl"` als niet vertaald) (Jayden).
- **Bevestigd, nog open:** tikdoelen Kaarten-overzicht/Teamvenster (Rapport/CSV 22, Deel/Openen/Kopie 32, vinkjes 16×13), tikdoelen /k
  (31 elementen), beginschermbalk bij 200 % (177 px, kruisje 30×47), "Hoe gaat het vergeleken met de start?" dichtgeklapt, .ics
  dubbeltik (4 verzoeken), .ics zonder `?taal=`, "Too hard?" na 400, offline .ics algemene fout, tijdzone kaart vs .ics, Escape in
  seintjes- en QR-testvenster (focus body; oorzaak: eigen `.focus()` vóór de observer resp. `disabled` op de knop), dubbelklik Deel,
  0612345678.
- **Goed bevonden:** formulierfouten /v2/proef, beveiligen + herstelcode (dubbelklik één claim), CSV-escape, gegokte id's 404 / "Card not
  found", rare invoer 400/413, uploads (.exe, GIF, 61 MB) nette weigering, 403 op alle schrijfroutes bij verlopen proef, team en login
  2e apparaat, Engelse kaart + trage lijn + draaien + terugknop, offline wachtrij /k, nergens een 500 of pageerror.

### Sweep 2026-11-10 10u (patiëntkant getest op PR #162, de nieuwe /k; therapeutkant op main)
- **OPGELOST 2026-11-10 10u (deze PR, test:proeftweedeapparaat) — MIDDEL App: verlopen proef op een tweede apparaat pas na de
  eerste 403, "In de praktijk" gaf een kale alert** (Mark, iPad staand + liggend). `/api/praktijk/status` geeft nu `proefVerlopen`
  (proefcookie of ingelogde praktijk; niet op naam alleen), `toonPrakSlot` toont de proefbalk bij het laden, `k_save_srv` toont de
  balk + melding in het venster i.p.v. `alert`. Rest: "bijna verlopen" (laatste dag) ziet een collega zonder proefcookie nog niet.
- **OPGELOST 2026-11-10 10u (deze PR, test:printgroot) — MIDDEL Print "Groot lettertype" liep van de A4** (Sanne): bij 12 oefeningen
  206 mm op 200 mm, legenda weg, veiligheidsregel over de XRM-rij. Bij Groot nu invulvak 19 px en rij 5,7 mm; alle vier varianten
  passen, gemeten met 12 lange namen.
- **OPGELOST 2026-11-10 10u (deze PR, test:vuleersterij) — MIDDEL App: "Vul eerste rij" deed stil niets** terwijl er "3 × 10" in de
  vakjes stond (placeholders); de kaart ging zonder dosering naar de patiënt (Truus' therapeut, main en #162). Beide leeg = 3 × 10.
- **OPGELOST 2026-11-10 10u (deze PR, test:vuleersterij) — LAAG Team: na een geweigerde uitnodiging bleef de link van de vorige
  collega onder de fout staan** (Mark). De link wordt nu bij elke nieuwe poging eerst gewist.
- **HOOG (nieuw, Truus iPhone SE, alleen PR #162) — dubbeltik op "Gedaan" vinkt ook de volgende oefening af en slaat die over**
  (`#sklaar`, `OEF_SLOT` per index; na `openOef(v)` valt de tweede tik op v). Doorgegeven aan de thread van #162; moet vóór de merge.
- **MIDDEL (nieuw, PR #162)** — 200 % tekst op iPhone SE: dosering buiten beeld bij het openen van een oefening (kop 107 + balk 88 px;
  na Gedaan balk 206 px). Liggend (Pixel 7 915×412, iPhone 14): kop 69 + balk 131 px laten ±49 % over. Doorgegeven aan #162.
- **MIDDEL (nieuw, Truus, main en #162)** — eerste opening: privacyblok met "Begrepen" vult het hele eerste scherm, "Begin met
  oefenen" staat onder de vouw (bij 200 % drie schermen scrollen).
- **LAAG (nieuw)** — #162: na alles gedaan is "Begin met oefenen" weg (tweede ronde alleen via een rij); offline "Toch niet gedaan"
  (`aan:false`) gaat niet in de wachtrij; trage lijn toont op een Engelse kaart eerst "Je kaart wordt geladen…" (kaart.html r. ~574,
  vertaling pas na noor-audio.js) (Jayden). Main: roepnaam "@Piet" geeft "?" als initiaal (`avInitialen` knipt vanaf "@") (Sanne).
  Opnieuw uitnodigen met hetzelfde adres maakt de eerste link stil ongeldig, zonder melding aan de beheerder (Mark).
  Sjablonenvenster op iPad liggend (981–1150 px): tekstkolom 303 px, 40 titels over 2 regels (v2.css r. 652, breekpunt 980) (Mark).
- **Bevestigd, nog open:** "Compacte kaart" geeft geen schemaruimte (`.pic` aspect-ratio 2/3, index.html r. 141; vaste rijen),
  dubbelklik "Deel" + geen `aria-expanded`, alert "Maximaal 12 plaatjes", tikdoelen Kaarten-venster (48 < 44 px), "Nieuw in Fysiplan"
  direct na welkom, proefbalk "t/m <dag>" + "loopt nog vandaag nog" (server.js `proefVars`, `datumNl`), foto < 100 bytes "te groot",
  .ics dubbeltik (3 verzoeken, nu 1 download), .ics-naam `afspraak.ics`, kaartlink zonder `?taal=`, AM/PM, Nederlandse oefennamen
  onder `lang="en"`, "Ik heb een vraag" zonder tekst, "Hoe gaat het vergeleken met de start?" dichtgeklapt.
- **Goed bevonden:** proefformulier, beveiligen + herstelcode (dubbelklik één claim), CSV-escape (BOM, `;`, `'=`), team (3 collega's,
  `<script>`-naam veilig, iPad-login), teamsjabloon op iPad, eigen oefening (nep-JPEG/.exe nette melding, 6 MB verkleind, 10.000
  tekens ingekort), /o met nep-camera, seintje → inbox bij collega, verlopen-pagina met cookie; #162: Engelse oefenstand, terugknop
  lightbox → oefening → overzicht → vorige pagina, RTL, offline wachtrij, gegokte/rare id's "Kaart niet gevonden"/"Card not found",
  rare API-invoer 400. Nergens een 500 of pageerror.

### Sweep 2026-11-10 02u
- **OPGELOST 2026-11-10 02u (deze PR, test:uitloggenprint) — MIDDEL App: na Uitloggen bleven QR, "Bekijk zelf…", deelknoppen en
  roepnaam van de laatste patiënt staan**, de roepnaam ook na herladen (Sanne, desktop). `prakLogout` haalt nu de QR weg, leegt
  roepnaam en patiëntvelden en koppelt de editor los van de gedeelde kaart; de oefeningen blijven staan. Hertest Sanne: ok.
- **OPGELOST 2026-11-10 02u (deze PR, test:uitloggenprint) — MIDDEL Print: lange praktijknaam afgekapt en grijze placeholders
  ("adres", "telefoon", "__-__") op papier** (Sanne, lijn/kleur/compact). Placeholders zijn transparant in `@media print`; vóór het
  printen (`beforeprint`) komt de praktijknaam in een tekstblok dat over twee regels mag lopen met een kleinere letter (min. 10 px).
- **OPGELOST 2026-11-10 02u (deze PR, test:wachtrijmelding) — MIDDEL /k: "Opgeslagen op je telefoon…" bleef onder pijnscore en
  seintje staan nadat de wachtrij verstuurd was** (Truus, iPhone SE). `tekenWacht` ruimt de wachtmeldingen op zodra alles weg is.
- **MIDDEL (nieuw, Jayden Pixel 7 + iPhone 14) — Engelse kaart toont Nederlandse zinnen "De algemene uitleg wordt gecontroleerd.
  Vraag je behandelaar…" en "De oefenafbeelding wordt gecontroleerd…"** (kaart.html r. ~1357–1358, vast in de code, niet via `tr()`).
  Alleen de tekst vertalen; de reviewstatus zelf niet aanraken (videostroom).
- **MIDDEL (nieuw, Truus) — "Wis van dit apparaat" bij twee kaarten op één telefoon wist ook beelden die de andere kaart nog nodig
  heeft** (kaart.html `wisOfflineKopie` r. ~1818). Kaart A mist offline dan de foto van een gedeelde oefening. Met één kaart: opgelost.
- **MIDDEL (nieuw, Mark) — tikdoelen app op desktop/iPad:** Kaarten-overzicht 27 elementen < 44 px ("1 seintje", "Rapport",
  "Exporteer (CSV)" 22 hoog; sorteer/Deel/Openen/Kopie 32); Teamvenster rolkeuze 32, × 32×36, velden en "Nodig uit" 36.
- **LAAG (nieuw)** — Emoji-roepnaam geeft "�" als initiaal (`avInitialen` r. ~1213 `charAt(0)`; `Array.from` gebruiken) (Sanne).
  Roepnaamhint stelt "script>alert(1)…" voor (Sanne). Escape in het seintjesvenster zet de focus op body (Mark). Wegvallende lijn
  vlak na de .ics-check kan de kaart vervangen door de foutpagina van de browser (`naarAgenda` `location.href`; blob/`<a download>`
  voorkomt het) (Jayden). Het blok "Hoe gaat het vergeleken met de start?" staat dichtgeklapt (`<details>` r. ~548) (Truus).
  `/api/kaart/gedaan` met een `dag` van 10.000 tekens geeft 200 (veld genegeerd) (Jayden).
- **Bevestigd, nog open:** verlopen proef op een 2e apparaat pas na de eerste 403 (`/api/praktijk/status` zonder `proefVerlopen`,
  server.js r. ~2590) (Mark iPad); conflictmelding en deelknoppen onder de QR 8 px in het verkleinde A4-voorbeeld (Mark); seintjesvenster
  bij verlopen proef zegt "niet afhandelen" (index.html r. ~5112); .ics dubbeltik (timingafhankelijk 2 downloads, 4 verzoeken); tijdzone
  kaart vs Mijn gegevens (r. ~1470 zonder `timeZone`); "Too hard?" na 400 eindeloos "Tap to retry" (r. ~2498); offline .ics algemene fout;
  .ics-link zonder `?taal=` en Nederlandse bestandsnamen (server.js r. ~4795/5007); "Zet op beginscherm"-balk 177 px bij 200 %;
  "Ik heb een vraag" zonder inhoud (productkeuze); dubbelklik "Deel" in overzicht; Escape in QR-testvenster; 0612345678-melding;
  tikdoelen /k (Te zwaar? 77×21, Alles gedaan 29, pijnscore 36, weekdagen 33×37, AA/Print/Deel 35–36).
- **Goed bevonden:** formulierfouten /v2/proef, beveiligen + herstelcode, CSV-formule-escape, andere praktijk 401/404, gegokte id's
  404, 9 schrijfroutes 403 bij verlopen proef (ook collega zonder cookie), uploads (.exe, 61 MB) nette 400/413, dubbeltik pijnscore/
  herstel/seintje één POST, offline herladen /k, 200 % zonder horizontaal scrollen, Engels + liggend + terugknop + trage lijn.

### Sweep 2026-11-09 22u
- **OPGELOST 2026-11-09 22u (deze PR, test:nietvertaald) — HOOG /k: mislukte vertaling verving de echte uitleg door algemene
  zinnen.** De bewegingsdemo toont nu de echte uitleg in het Nederlands (`lang="nl"`) met een korte melding in de taal van de
  patiënt ("Diese Anleitung gibt es noch nicht auf Deutsch…"); ook in de foto-uitleg. Een mislukte vertaling wordt niet meer als
  lege vertaling bewaard, dus de kaart probeert het later opnieuw. "Ton an" leest de Nederlandse uitleg niet meer met een
  Duitse stem voor (gevonden door Truus bij de hertest). Hertest Truus iPhone SE de/tr: ok.
- **OPGELOST 2026-11-09 22u (deze PR, test:qrroepnaam) — MIDDEL App: Roepnaam, Leeftijd, max. HF en Trainingszone 24 px breed zodra
  de QR op de A4 staat** (Sanne, 1280 en 1600). De rij deelknoppen onder de QR breekt nu af; Roepnaam 110 px op 1280.
- **OPGELOST 2026-11-10 02u (test:uitloggenprint) — MIDDEL (Sanne) — na Uitloggen blijven de QR, "Bekijk zelf…" en de deelknoppen van de laatste patiënt werken**, roepnaam
  blijft ook na herladen. index.html r. ~3565 `prakLogout()` roept geen `verbergQr()` aan en leegt `#c_naam` niet.
- **MIDDEL (nieuw, Mark iPad) — verlopen proef op een tweede apparaat (ingelogd, geen proefcookie): de app toont niets tot de eerste
  403.** `/api/praktijk/status` geeft geen `proefVerlopen`, dus `toonProefVoorbij` start niet bij het laden.
- **MIDDEL (nieuw, Mark iPad liggend) — kaartvoorbeeld op de iPad: velden 8–11 px hoog** (Roepnaam e.d. 189×11, praktijkvelden 137×8,
  schemacellen 14×10). Het A4-voorbeeld wordt verkleind; op tablet een grotere bewerkstand overwegen.
- **MIDDEL (herhaald, Mark) — melding "intussen op een ander apparaat gewijzigd" ±7 px met links van ±10 px** in het QR-vak
  (index.html r. ~2201 `toonQrHint`). Werking zelf is goed (409, geen stil overschrijven).
- **MIDDEL (herhaald, Truus) — "Zet op beginscherm"-balk**: bij 200 % tekst 177 px hoog (31 % van het scherm), dekt "Luister naar
  uitleg" af; kruisje 21×34 #b9b2a0. Ook nieuw: `privmeer`-link 46×16; tekst rgb(119,113,98) 4,35:1 op "0 van 7 vandaag gedaan".
- **LAAG (nieuw)** — Dubbelklik "Deel" in het kaartenoverzicht klapt open en meteen dicht (Sanne). Escape in het QR-testvenster
  zet de focus op body (Sanne). /v2/proef > 8 KB geeft een kale "Ongeldig verzoek"-pagina; /v2/gegevens bij 413 "naam en wachtwoord
  horen niet bij elkaar" (Sanne, alleen met devtools). Seintjesvenster bij verlopen proef zegt "niet afhandelen" terwijl
  afhandelen wel werkt (Mark, index.html r. ~5097). "Too hard?" na een 400 blijft eindeloos "Tap to retry" (Jayden). Offline
  .ics-tik geeft de algemene foutmelding (Jayden). Kaartlink in de .ics zonder `?taal=` (Jayden).
- **OPGELOST (hertest Mark 22u) — inbox markeerde een seintje als gezien na een 403** (`inboxGezien` bestaat niet meer; vraag blijft
  in de inbox). Dubbelklik "Nodig uit": UI toont één rij per collega (tokens niet nagekeken).
- Bevestigd, nog open: .ics dubbeltik (2 downloads, ook `oefenmomenten.ics`), tijdzone kaart vs Mijn gegevens, landing-tikdoelen
  iPhone 14, lange praktijknaam en placeholders op de print, "Ik heb een vraag" zonder inhoud, tikdoelen /k, Noor-dekking.

### Sweep 2026-11-09 18u
- **OPGELOST 2026-11-09 18u (deze PR, test:nieuwekaartnaam) — App: na "In de praktijk" als nieuwe kaart bleef de editor op de
  oude naam.** Het naamveld (en QR) volgt nu de nieuwe kaart (`volgNieuweKaart`); autosaves 200, Jokes kaart blijft ongemoeid.
  Hertest Sanne desktop: ok.
- **OPGELOST 2026-11-09 18u (deze PR, test:uitnodigingpraktijk) — collega met typfout in de praktijknaam maakte met Beveiligen
  een losse praktijk zonder proef** (Mark, iPad: "Fysio Marktest." → tweede account, kaart maken 200 ook na verlopen proef).
  De knop "Open Fysiplan" na de uitnodiging zet de praktijknaam klaar (`/v2/app?praktijk=`), het algemene welkom blijft dicht,
  het inlogformulier met e-mail staat open. Nog open (MIDDEL): wie toch zelf een naam typt, krijgt geen "bedoel je …?"
  (vergt een opzoeking op namen; eerst met security afstemmen, zie security-backlog).
- **OPGELOST 2026-11-09 18u (deze PR, test:pijnscorebezig) — /k pijnscore zonder bezig-stand bij een trage lijn en fout in groene
  opmaak** (Jayden, Pixel 7 + iPhone 14). Nu aria-busy + pulserende knop, tikken tijdens opslaan genegeerd (één verzoek), en
  `zetDank` geeft fout rood en wachtrij neutraal; ook bij herstel (PSK), ervaren herstel en seintjes.
- **OPGELOST 2026-11-09 18u (deze PR, test:proefwissen) — "Nu meteen wissen" op de verlopen-pagina wiste met één tik.** Verplicht
  vinkje, knop 44 px, server wist alleen met `zeker=1` (anders terug naar /v2/proef).
- **OPGELOST 2026-11-09 22u (test:nietvertaald) — HOOG (nieuw, Truus iPhone SE, tr/de/en/ar) — /k mislukte vertaling vervangt de echte oefenuitleg door algemene zinnen**
  ("Rustig van begin- naar eindhouding…"); halters/schouderhoogte weg, geen melding, `VERT[taal]={}` blijft staan (geen nieuwe
  poging). kaart.html r. ~2354 (`eigenUitleg=''` als niet vertaald) en `wisselTaal` r. ~1821. Advies: dan de Nederlandse uitleg
  tonen (lang="nl") met een korte melding, en de lege vertaling niet bewaren.
- **MIDDEL (nieuw, Truus) — /k "Zet op beginscherm"-balk blijft staan** en ligt aan het eind over de footerlink Privacy; kruisje
  21×34 lichtgrijs (kaart.html r. ~254–263, ~627).
- **MIDDEL (nieuw, Truus) — "Ik heb een vraag" stuurt alleen het soort seintje**, de patiënt kan de vraag niet typen; de inbox toont
  geen inhoud. Productkeuze (vrije tekst = meer gegevens): naar Ahmed als het blijft terugkomen.
- **MIDDEL (nieuw, Truus) — /v2 op 200 % 513 px breed** door `<code>fysiplan.nl/v2/app#client={…}</code>` in de FAQ (v2.html r. ~764,
  `overflow-wrap:anywhere` ontbreekt).
- **MIDDEL (Jayden iPhone 14) — .ics dubbeltik geeft 2 downloads** (kaart.html `naarAgenda` r. ~911 zonder bezig-slot; ook
  oefenmomenten).
- **OPGELOST 2026-11-10 02u (test:uitloggenprint) — MIDDEL (herhaald, Sanne) — lange praktijknaam afgekapt op print; placeholders grijs op de print** (index.html r. ~347, ~249,
  ~351; `@media print` mist `::placeholder{color:transparent}`).
- **MIDDEL (Truus, Jayden) — tikdoelen /k:** "Te zwaar?" 78×21, "Alles gedaan" 29 hoog, pijnscore 36 breed op 320, weekdagen 33×37,
  taal/AA/Lees voor 36–38, Print/Deel 35. iPad app: categoriechips 24, + 28, ★ 24, werkbalk 36 (Mark).
- **LAAG/MIDDEL (Jayden) — afspraaktijd op de kaart in de tijdzone van het toestel met AM/PM, in Mijn gegevens Europe/Amsterdam**
  (kaart.html r. ~1454 vs ~1757).
- **LAAG (nieuw)** — Kaarten-venster: naam van 60 tekens loopt onder de knoppen door, melding toont de 10.000 tekens (index.html
  r. ~4237, ~4522) (Sanne). Na Uitloggen blijft de laatste kaart (roepnaam) op het scherm (Sanne). /v2/gegevens vult de
  praktijknaam niet in en zet de foutmelding bovenaan (Sanne). Dubbelklik "Nodig uit" geeft 2 tokens (Mark). Gegokt id na de rem:
  "No connection right now" i.p.v. niet gevonden/te veel (Mark). Arabisch: "sec 30 vasthouden" (chips zonder `dir=auto`) (Truus).
  Offline-melding bij pijnscore/seintje blijft staan na versturen (Truus). Nederlandse bestandsnamen `afspraak.ics`,
  `fysiplan-mijn-gegevens.txt`; .ics-link zonder `?taal=` (Jayden). Lightbox "niet door een fysiotherapeut goedgekeurd" verwarrend
  op een kaart van de eigen therapeut (Truus, naar legal ter info).


### Sweep 2026-11-09 14u
- **OPGELOST 2026-11-09 (deze PR, test:noorstop) — /k: Noor-stopknop bij de oefening.** "Luister naar Noor" heet tijdens het
  luisteren "Stop" (aria-pressed) en een tweede tik stopt; een andere oefening starten zet de vorige terug. Meldingen
  ("Nog geen actuele stemopname …", "kon niet worden afgespeeld") staan op de pagina (#noorMelding, role=status) bij de knop
  in plaats van een alert(); knop 44 px. Hertest Truus: iPhone SE, iPad staand en liggend ok, geen dialogen.
- **OPGELOST 2026-11-09 (deze PR, test:kaartdruk) — /k: na een 429 gingen "gedaan" per oefening, "Ik heb vandaag geoefend"
  en het pijnseintje stil verloren.** `stuur()` zet een tik bij 429/5xx nu in de wachtrij met de melding "Het is even druk;
  dit gaat over een paar minuten vanzelf mee" (9 talen) en verstuurt hem na de Retry-After opnieuw. iPhone 14 (Jayden).
  Nog open: de pijnscore stuurt elke tik als POST (geen debounce) en de schrijfrem is één bucket per IP voor alle routes
  (zie security-backlog).
- **OPGELOST (hertest Mark 14u) — vals "intussen op een ander apparaat gewijzigd" na een telefoonopname.** Alle autosaves 200.
- **OPGELOST (hertest Mark 14u) — verlopen proef met eigen login.** /v2/app toont meteen de verlopen-pagina; afspraak door een
  collega na verlopen proef krijgt een nette 403-melding.
- **OPGELOST 2026-11-09 18u (test:nieuwekaartnaam) — HOOG (verhoogd, hertest Sanne 14u) — App: na "In de praktijk" als nieuwe kaart blijft de editor op de oude naam.** Elke
  autosave 409 `bestaat`, ook na herladen; "Ja, die kaart bijwerken" zet de editor stil terug op de oude kaart, zodat
  wijzigingen voor Piet op de voorbeeldkaart landen. index.html r. ~3445 (`keuze==='nieuw'` → zetKaartId zonder `c_naam`).
- **OPGELOST 2026-11-09 18u (test:uitnodigingpraktijk; "bedoel je" nog open) — HOOG (hertest Mark 14u, iPad liggend) — typfout praktijknaam collega maakt met Beveiligen een losse praktijk** (zie hieronder).
- **OPGELOST 2026-11-09 18u (test:proefwissen) — MIDDEL (nieuw, Mark iPad) — "Nu meteen wissen" op de verlopen-pagina wist met één tik zonder bevestiging**, knop 30 px,
  ±70 px onder "Ja, ik wil doorgaan". public/proef.html r. ~214–216 (verborgen `zeker=1`). Advies: vinkje `required` zoals
  het andere wisformulier en 44 px.
- **MIDDEL (nieuw, Truus) — /k schaalt niet mee met de lettergrootte van de browser**: alle fonts in vaste px (kaart.html r. 55
  en ~75× `font:Npx`); "A A" geeft maar zoom 1.16. text-size-adjust werkt wel.
- **OPGELOST 2026-11-09 18u (test:pijnscorebezig) — MIDDEL (nieuw, Jayden) — /k pijnscore: foutmelding in de groene "gelukt"-opmaak (#mdank)**, en bij een trage lijn geen
  "bezig"-stand (oude score blijft 3 s gemarkeerd, lokt herhaald tikken uit). kaart.html r. ~351, ~2529.
- **LAAG/MIDDEL (nieuw, Truus) — Noor-dekking**: op de voorbeeldkaart heeft 1 van 6 oefeningen een opname; "Luister naar
  uitleg" noemt dan een lange lijst. Inhoud hoort bij de videostroom (niet aanraken); alleen de melding inkorten mag.
- **LAAG (nieuw)** — "Nieuw in Fysiplan" komt terug na sluiten met Escape (release-notes.js r. 12/18, alleen "Begrepen" zet
  `seen`) (Sanne). Antwoordvenster van een seintje noemt niet wat de patiënt meldde (index.html `openSeinVenster` r. ~4765)
  (Mark). Eigen sjabloon houdt "Deel" na delen en staat dubbel (Mark). .ics: bestandsnaam `afspraak.ics`, PRODID //NL, link
  zonder `?taal=en` (server.js r. ~4729) (Jayden). Grafiek /k zonder legenda "pijnscore" (Jayden). Roepnaamvoorstel van
  `<img …>` wordt "img O." (Sanne). Print: vak 12 1 px hoger (Sanne). Andere talen: leesVoor gebruikt nog alert() (kaart.html
  r. ~1854/1913).

- **OPGELOST (hertest 2026-11-09 22u) — LAAG (doorgezet door security 2026-11-09 12u) — app: inbox markeert een seintje als gezien terwijl het antwoord 403 kreeg**
  (verlopen proef). `public/index.html` r. ~3786 zet `inboxGezien` ook na de 403 op `/api/kaart/antwoord`, waardoor de vraag
  uit de inbox verdwijnt zonder antwoord aan de patiënt. Alleen bij een geslaagd antwoord als gezien markeren.

### HOOG (nieuw 2026-11-09 10u)
- **OPGELOST 2026-11-09 (deze PR, test:roepnaamander) — App: roepnaamvoorstel hernoemde stil de kaart van een andere patiënt.**
  Het voorstel stuurt nu `roepnaamHernoem`; de server hernoemt alleen bij dezelfde voornaam ("Anna de Wit" → "Anna W."), anders
  eerst de vraag "nieuwe kaart of naam verbeteren". Hertest Sanne (desktop, 10u): Jokes kaart blijft Joke.
- **OPGELOST 2026-11-09 (deze PR, test:kaartladen) — /k: trage vertaling eerst half leeg Nederlands, trage kaart leeg scherm,
  onbekend id met ?taal=en Nederlands, 200 % op 320 px te breed ("Begrepen" en "Gemaakt met Fysiplan").** Nu een laadscherm
  in 9 talen tot de kaart in de eigen taal getekend is (max 8 s op de vertaling), vertaalde niet-gevonden-pagina, afbrekende
  privacyregel en voet, "Begrepen" 44 px. Pixel 7/iPhone 14 (Jayden), iPhone SE (Truus).
- **OPGELOST 2026-11-09 (deze PR, test:roepnaamander) — fout wachtwoord of herstelcode zei "Alleen beschikbaar voor beheer."**
  Nu "Praktijknaam, e-mailadres of wachtwoord klopt niet." / "Praktijknaam of herstelcode klopt niet." (zelfde 403). Desktop (Sanne).
- **OPGELOST 2026-11-09 14u (deze PR, test:noorstop) — /k: Noor-stopknop (hertest 10u: nog stuk).** "Luister naar Noor" bij een oefening wordt geen Stop; tweede tik begint opnieuw;
  alleen `#leesBtn` bovenaan wordt Stop (buiten beeld). kaart.html r. ~1972 (noorRegel), ~2338 (klik → altijd speelNoor),
  ~1919–1926. Daarnaast nog de `alert()` "Nog geen actuele stemopname …" (r. ~1946–1962). iPhone SE (Truus).
- **OPGELOST (hertest 2026-11-09 14u) — App: vals "intussen op een ander apparaat gewijzigd" na een telefoonopname** (MIDDEL→HOOG omdat de autosave stil blijft
  falen). Na een eigen video via /o geeft elke autosave 409 `verouderd` (basisTs ouder dan de ts die de opname zette); melding
  ~7 px in het QR-vak. server.js r. ~4058–4065, index.html r. ~2179: na "video binnen" `KAART_TS` bijwerken. Desktop (Mark).
- **OPGELOST 2026-11-09 18u — App: na "In de praktijk" als nieuwe kaart blijft de editor op de oude naam** (MIDDEL). Joke open → Kaarten "Piet Bakker" →
  OK (nieuwe kaart): naamveld en QR tonen Joke, `KAART_ID` is die van Piet B.; elke volgende autosave geeft 409 `bestaat`
  "Er is al een kaart Joke". index.html r. ~3447 (`keuze==='nieuw'` → zetKaartId) zonder `c_naam` bij te werken. Desktop (Sanne).

### MIDDEL / LAAG (nieuw 2026-11-09 10u)
- /k zonder internet: Noor speelt niet en de melding zegt niet waarom (mp3's niet in de cache, 206 niet bewaard; kaart-sw.js
  r. ~105). Onbekende /k offline: kale browserfout (r. ~119). (Truus)
- /k contrast `--zacht:#a39c8a` 2,71:1 (kaart.html r. 36) op labels, pijnschaal-uitleg, `.mnoot`, grafiekdatums 2,55:1. (Truus, Jayden)
- /k grafiekdatums DD-MM vast ook op een Engelse kaart (r. ~1397); schemalegenda S/H/W in het Engels "H = repetitions". (Jayden)
- /k: uitleg alleen in de lightbox; Engelse oefennamen op een Nederlandse kaart (zie mensenwerk "Engelse oefennamen"). (Truus)
- App: placeholders (adres/telefoon) staan grijs op de print (index.html r. ~351); lange oefennaam loopt het plaatjesvak in. (Sanne)
- App: opnieuw uitnodigen maakt de vorige link stil ongeldig (server.js r. ~2773). (Mark)
- Misleidende meldingen: .exe als opname → "leeg of te kort"; vraag van 10.000 tekens → "Typ eerst een korte vraag";
  0612345678 → "Gebruik 10 cijfers…" (lib/proef.js r. ~52/96). (Mark, Sanne, Jayden)
- Lege staat "Nog geen gedeelde kaarten" direct na beveiligen terwijl de voorbeeldkaart al gedeeld wordt. (Sanne)

### HOOG
- **OPGELOST 2026-11-09 (deze PR, test:roepnaamander) — App: roepnaamvoorstel hernoemt stil de kaart van een andere patiënt** (2026-11-09 06u, desktop, Sanne). Open kaart "Joke" →
  Kaarten → typ "Anna de Wit" → In de praktijk → OK bij de roepnaamvraag: Jokes kaart (zelfde id) heet nu "Anna W.", Jokes QR toont
  "FOR Anna", melding zegt "gedeeld". `HERNOEM_VOOR` wordt gezet bij het roepnaamvoorstel (index.html r. ~4492 en ~2181), waardoor
  `serverKaart` `hernoem:true` stuurt en de server de "andere patiënt?"-vraag (PR #108) overslaat. Een roepnaamvoorstel mag alleen
  hernoemen als de oude naam bij dezelfde patiënt hoort (bijv. zelfde voornaam), anders eerst de hernoemVraag.
- **OPGELOST 2026-11-09 (deze PR, test:kaart200taal) — /k bij 200 % tekst: dosering afgeknipt** ("15 herhali…", pagina 392 px op 320
  zonder scrollen): `.chip` nowrap in `.oef` met overflow:hidden. Nu breken chip en naam af. iPhone SE (Truus, 06u).
- **OPGELOST 2026-11-09 (deze PR, test:kaart200taal) — Nederlandse servermeldingen op een Engelse kaart** bij pijnscore en PSK (429,
  400): nu alleen in het Nederlands de servertekst, anders de eigen vertaalde melding. Pixel 7 (Jayden, 06u). Vervangt het HOOG-punt
  hieronder voor pijnscore/PSK.
- **OPGELOST 2026-11-09 (deze PR, test:dubbelklikoverzicht) — Kaarten-venster: dubbelklik op × of Kopie** gaf twee vragen en twee
  verzoeken (200 + 404 "Kaart niet gevonden."). Nu bezig-slot per actie en kaart; × is 44 px. Desktop (Sanne, 06u: hertest ok).
- **OPGELOST 2026-11-09 18u (klaargezette naam na uitnodiging) — App: collega met typfout in de praktijknaam maakt met "Beveiligen" stil een losse tweede praktijk** (2026-11-09 06u, desktop,
  Mark: "burg", punt erachter, streepje; kleine letters en dubbele spaties gaan wel goed). Die praktijk hangt niet aan een proef en
  verloopt nooit. Verscherpt het MIDDEL-punt "typfout praktijknaam". index.html r. ~3020 (`!PRAKSLOT.geclaimd` verbergt #ps_email);
  server.js r. ~246 (exacte naam). Advies: e-mailveld altijd tonen of "bedoel je …?".
- **DEELS OPGELOST 2026-11-09 (deze PR, test:kaartladen; mislukte vertaling blijft nog stil Nederlands) — /k: trage vertaling toont eerst een Nederlands, half leeg scherm** (4 s vertraagd: "Jouw oefeningen" zonder oefeningen, NL-knoppen
  al aantikbaar), en een mislukte vertaling blijft stil Nederlands. kaart.html r. ~1778 (`wisselTaal` async, `#wrap` vóór `alles()`),
  r. ~1781 (`VERT[TAAL]={}`). Pixel 7, iPhone 14 (Jayden, 06u).

### MIDDEL (nieuw 2026-11-09 06u)
- **Lange praktijknaam afgekapt in de print** ("Fysiotherapie & Manue"), alle 4 varianten; `input#praktijk` één regel van 227 px
  (index.html r. ~345, `.prak` r. 118/249), welkomveld staat 80 tekens toe. Desktop (Sanne).
- **Uitgenodigde collega krijgt het algemene welkom** ("Zet een wachtwoord op je praktijk") plus "Nieuw in Fysiplan"; ook een nieuwe
  proefgebruiker ziet "Nieuw in Fysiplan" bij het tweede bezoek (public/release-notes.js `seen`). Desktop (Mark, Sanne).
- **Proef: einddatum klopt niet.** "t/m dinsdag 10 november" terwijl de proef dinsdag ±03:25 stopt; "je proef loopt nog vandaag nog."
  (dubbel nog); laatste dag zonder doorgaan-knop. server.js r. ~656–662 (proefVars), ~5362 (verloopt = start + 14×24 u). iPad (Mark).
- **OPGELOST (hertest 2026-11-09 14u) — Verlopen proef, eigen login: Kaarten waarschuwt niet vóór opslaan** (hertest: nog stuk; daarna een kale alert, geen proefbalk).
  `/api/praktijk/status` geeft geen proefstatus; `k_save_srv` (index.html r. ~4501) mist de proefVerlopen-tak. Desktop (Mark).
- **DEELS OPGELOST 2026-11-09 14u (deze PR, test:kaartdruk: tik gaat in de wachtrij) — /k: snel tikken op pijnscore zet de schrijfrem vol, daarna gaat "Het doet te veel pijn" 5 min niet** (40/5 min per IP voor alle
  routes samen); "Ik heb geoefend" faalt bij 429 stil. Pixel 7 (Jayden).
- **OPGELOST 2026-11-09 (deze PR, test:kaartladen) — /k: trage `/api/kaart` = volledig leeg scherm** zonder laadindicator; onbekend id met ?taal=en nog Nederlands. Pixel 7 (Jayden).
- **OPGELOST 2026-11-09 14u (deze PR) — /k: "Luister naar uitleg"-alert en Noor per oefening zonder stopknop** (hertest: nog stuk, stopknop 1331 px buiten beeld).
  kaart.html r. ~1946–1962, ~2338. iPhone SE (Truus).

### LAAG (nieuw 2026-11-09 06u)
- Naam van 10.000 tekens: server kapt op 60, melding toont de hele naam (index.html r. ~4500). Emoji als naam: kapot rondje "�"
  (`charAt(0)`, index.html r. ~1190). `<script>` als contactpersoon stil verminkt (lib/proef.js `schoon`). Tikdoelen + (28), ★ (24),
  Deel/Openen/Kopie (32), vinkje voorwaarden 13 px; contrast categoriekoppen 2,41:1. 401's in de console vóór beveiligen. (Sanne)
- Te grote foto (23 MB) wordt stil verkleind, zonder melding (Mark). `/api/kaart/gedaan` met `aan:"ja"` geeft 200 en zet de dag uit
  (Jayden). Storingspagina /k alleen in het Engels vertaald, niet de/fr (Jayden). Telefoon op Engels opent de kaart in het Engels;
  zonder vertaling Engelse knoppen naast Nederlandse oefeningen (Truus).

### HOOG (ouder)
- **OPGELOST 2026-11-09 (deze PR, test:inboxmijn) — Inbox "Alleen mijn patiënten" verborg de vraag op de eigen kaart van een
  collega** (teller 1, lijst "Alles is afgehandeld"). Een nieuwe kaart kreeg `behandelaar:null`; het filter zocht de voornaam in dat
  lege veld. Nu krijgt een nieuwe kaart de ingelogde collega als behandelaar, het filter vergelijkt het hele eerste woord
  ("Sanneke" ≠ "Sanne"), kaarten zonder behandelaar blijven zichtbaar en de teller telt de getoonde lijst. Desktop (Mark, 02u).
  Bestaand punt "Inbox Alleen mijn patiënten" hieronder (MIDDEL) is hiermee ook opgelost.
- **OPGELOST 2026-11-09 (deze PR, test:vensterterug) — /k: terugknop met open foto (lightbox) verliet de kaart** (na een QR-scan
  als eerste pagina: kaart weg). Nu een eigen geschiedenisstap: terug sluit alleen de foto; sluiten met × of Escape haalt die stap
  weer weg. Pixel 7 en iPhone 14 (Jayden, 02u).
- **OPGELOST 2026-11-09 (deze PR, test:vensterterug) — /k spoedregel "Bel de praktijk" zonder nummer.** Zonder telefoonnummer
  nu "Bel je huisarts. Bij nood: 112." (9 talen); met nummer een tel-link van 44 px in de spoedregel zelf. iPhone SE (Truus, 02u).
  Vervangt het MIDDEL-punt "spoedregel zegt Bel de praktijk zonder nummer".
- **OPGELOST 2026-11-09 (deze PR, test:vensterterug) — App: vensters met alleen het toetsenbord** (ovProefWelkom, ovPrint,
  ovKaarten, ovQrTest en alle andere `.ov`): focus bleef achter het venster, Escape sloot niets, geen role=dialog, focus na
  sluiten op BODY. Nu een laag in index.html (`vensterToetsenbord`): role=dialog + aria-modal + naam, focus erin, focus-val,
  Escape via de eigen sluitknop, focus terug. Vensters zonder sluitknop (proefwelkom: verplichte keuze) sluiten niet op Escape.
  Desktop (Sanne, 02u), iPad staand. Het deelpaneel (Deel) is geen `.ov` en blijft open staan (LAAG hieronder).
- **Nederlandse servermeldingen op een Engelse kaart** (o.a. 429 "Even te veel verzoeken…" na ±41 tikken op de pijnscore;
  elke 4xx met `fout`). `kaart.html` r. ~2464 `dank.textContent=d.fout||tr('mfout')`: toon in een andere taal dan nl de eigen
  vertaalde melding. Let op: de schrijfrem (40 per 5 min per IP, server.js r. ~1347) is gedeeld achter CGNAT/wifi. iPhone 14 (Jayden, 02u).
- **Verloop pijn/herstel: de slechte dag is onzichtbaar voor de therapeut** (hertest 02u: pijn 7,6,8,6 en herstel −1,0,−2,+1 →
  inbox "pijnscore 6", overzicht "pijn 7→6 · herstel: iets beter"). Zie het MIDDEL-punt hieronder; nu HOOG omdat het beeld
  positiever is dan het was. server.js r. ~943 (inboxItems), index.html r. ~3950. MDR-grens: verloop tonen, geen rangschikking.
- **OPGELOST 2026-11-08 (deze PR, test:hernoem) — App: "opslaan als" met de naam van een andere patiënt hernoemde de open kaart.**
  Kaart "Jan K." open → oefening weg → Kaarten → "Piet V." → In de praktijk: één kaart "Piet V." met Jans id; Jans geprinte QR
  opende Piets kaart en Jans scores stonden bij Piet. De server hernoemt nu alleen met `hernoem:true`; anders 409 `hernoemVraag`
  en de app vraagt "nieuwe kaart (eigen QR)" of "zelfde patiënt, naam verbeteren" (ook in de QR-hint). Een roepnaamvoorstel geldt
  als zelfde patiënt. Desktop (Sanne, 18u).
- **OPGELOST 2026-11-08 (deze PR, test:lightbox) — /k-lightbox op een kleine telefoon onbruikbaar.** iPhone SE staand: foto
  begon op y −32, de witte naam stond over de uitleg, de onderkant was onbereikbaar, geen sluitknop (bij 200 % zag de patiënt
  geen foto). Nu scrollbaar met `safe center`, naam boven de foto, sluitknop van 44 px rechtsboven. Ook iPhone 14 liggend (ar).
  iPhone SE (Truus, 22u), iPhone 14 (Jayden, 22u). Nog open: terugknop sluit de lightbox niet (staat bij de hertest-lijst).
- **OPGELOST 2026-11-08 (deze PR, test:lightbox) — App, verlopen proef: Bewaar in het Kaarten-venster weigerde stil.** Afspraak:
  melding alleen in de proefbalk áchter het venster; Behandelaar, Doelactiviteit en Werknotitie: 1,6 s servertekst als knoptekst,
  daarna "Bewaar" alsof het gelukt was; Oefendoel bleef op de niet-bewaarde keuze. Nu een blijvende melding "Niet bewaard …
  Wil je doorgaan?" onder de rij (veld houdt zijn breedte), oefendoel springt terug; de automatische opslag zet geen blok in het
  venster. iPad staand (Mark, 22u), desktop (Sanne, 22u). Was:
  **App, verlopen proef: afspraak bewaren wordt stil geweigerd.** 403, knop springt terug naar "Bewaar", de nieuwe datum blijft
  in het veld; de melding staat alleen in `#proefBalk` achter het Kaarten-venster (zelfde patroon als het seintje-antwoord in
  PR #101). `toonProefVoorbij()` index.html r. ~2627; aanroepen r. ~2305, ~2668, ~4607. iPad staand (Mark, 18u).
- **OPGELOST 2026-11-08 PR #101 — App, verlopen proef: collega beantwoordt een seintje en ziet geen fout.** De server weigerde
  netjes (403), maar het venster sloot alsof het gelukt was en de melding stond in de proefbalk áchter het Kaarten-venster;
  de patiënt kreeg nooit antwoord. Nu blijft het venster open met "Niet verstuurd: … Wil je doorgaan?". iPad staand (Mark, 10u).
  Test: `npm run test:dubbeltik`.
- **OPGELOST 2026-11-08 PR #96 — App: na de eerste "In de praktijk" werd het kaart-id niet onthouden** (`saveServerCard`
  nam het alleen over als het al gelijk was aan het lege KAART_ID). Elke volgende opslag gaf 409 "Er is al een kaart" over de
  eigen kaart en een daarna opgenomen eigen video kwam nooit bij de patiënt. iPad liggend (Mark, 2026-11-08 06u).
  Test: `npm run test:eerstedeling`. (Zelfde oorzaak als het MIDDEL-punt "na Maak er … van … 409".)
- **OPGELOST 2026-11-08 PR #96 — /k toont de naam van een andere patiënt.** Deelde de therapeut onder een andere naam dan
  het naamveld (voorbeeldkaart "Voorbeeldpatiënt", of de kaart van een vorige patiënt hergebruikt), dan zag de patiënt
  "Voor <oude naam>" (ook in de beginschermnaam). Nu is de gekozen kaartnaam ook de roepnaam op de server (behalve een
  automatische "Kaart <datum>"). Pixel 7, iPhone 14 (Jayden, 06u). Test: `npm run test:oefvinkje`.
- **OPGELOST 2026-11-08 PR #92 — App: volledige patiëntnaam toch op de server na "Maak er Marieke B. van".** Bij
  "In de praktijk" + OK werd alleen `#k_naam` de roepnaam; `client.c_naam` ("Marieke de Boer") ging mee en de QR vroeg
  daarna opnieuw. Nu neemt `#c_naam` de roepnaam over en laat `serverKaart` geen volledige naam meer meegaan.
  Desktop (Sanne, 2026-11-08 02u). Test: `npm run test:oefvinkje`.
- **OPGELOST 2026-11-08 PR #96 — Seintjes overschrijven elkaar, ook "Het doet te veel pijn" door "Ik heb een vraag"**
  (nu wint het zwaarste open seintje, pijn > vraag > gaat goed; de rest staat in `ook` en verschijnt in inbox en overzicht
  als "(ook een vraag)". Test: `npm run test:seintjevoorrang`) (de therapeut ziet alleen de
  vraag). Was MIDDEL/LAAG (vraag → gaat goed); met pijn klinisch zwaarder. Eén `seintje`-slot op de kaart. (Mark, 02u)
- **OPGELOST 2026-11-07 PR #88 — /k: offline twee dagen: dag 1 ging ongemerkt verloren.** Wachtrij per soort per dag
  met `wanneer`; de server zet de tik op zijn dag (`ont` = ontvangst, voor inbox/dossierlabel). Truus hertestte op
  iPhone SE: dag 1 en dag 2 kwamen allebei aan, op de juiste dag. Test: `npm run test:wachtrijdagen`.
- **App op iPad: print kan op 2 pagina's eindigen, met de QR op pagina 2** (eerst nakijken op een echte iPad).
  Met een iPad-UA zet de app `html.safari-print` (kaart 90° gedraaid voor staand papier) terwijl
  `@page{size:A4 landscape}` blijft staan; Chromium-emulatie geeft 2 pagina's, staand en liggend. De klasse
  gaat na `afterprint` niet weg. public/index.html r. 238, 268–273, 1901 (`SAFARI_PRINT`). (Mark, 2026-11-07 06u)

### MIDDEL
- **Collega met typfout in de praktijknaam krijgt "Beveiligen" i.p.v. inloggen** (hertest 02u, desktop, Mark): e-mailveld verborgen
  bij `!PRAKSLOT.geclaimd` (index.html r. ~3018); server kan inloggen met alleen e-mail. Ook: fout praktijkwachtwoord en
  `/api/opname/start` zonder sessie zeggen "Alleen beschikbaar voor beheer." (server.js r. ~1966, ~3600).
- **App, verlopen proef met eigen login: Kaarten zegt niets tot je opslaat** (Deel/Opslaan staan er gewoon; pas dan 403). Desktop (Mark, 02u).
- **Sjablonenvenster: tekstkolom te smal** (naam en oefeningenlijst breken per 1–2 woorden af door de knoppen). Desktop en iPad (Mark, 02u).
- **Dubbelklik "In de praktijk" bij een andere naam: 2× POST (beide 409 hernoemVraag)**, één confirm; de keuze OK/Annuleren
  ("nieuwe kaart" of "naam verbeteren") is onduidelijk. Desktop (Sanne, 02u).
- **Toolbarknop Kaarten pas na 941× Tab** (446 oefeningen met ★ en + ervoor, geen skiplink); zijbalkknop "Kaarten en patiënten"
  heeft alleen een title. index.html r. 290. Desktop (Sanne, 02u).
- **Print: lange praktijknaam afgekapt** ("Praktijk Sanne mw8m…", 23 tekens). Desktop (Sanne, 02u).
- **/k: onbekend of verlopen id met ?taal=en geeft een Nederlandse foutpagina** (kaart.html r. ~2699, ~615). Pixel 7 (Jayden, 02u).
- **/k tikdoelen < 44 px** (iPhone SE): "Te zwaar?" 78×21, "Alles gedaan" 104×29, "Begrepen" 85×31, dagen 33×37, pijnscore
  36 breed, Luister/AA/Print/Deel 36 hoog. kaart.html r. 182, 193. (Truus, 02u)
- **OPGELOST 2026-11-08 (deze PR, test:lightbox) — /k in het Arabisch: Nederlandse oefennaam in RTL** ("graden 360", ".1 Mobilisatie
  rotatie rug" in de schemakop). Nu `dir="auto"` op oefennaam, schemakop en lightboxnaam. iPhone 14 (Jayden, 22u).
- **Landing /v2 op iPhone SE: 47 tikdoelen kleiner dan 44 px.** Nav-links 22 px hoog ("Vragen" half buiten beeld zonder hint,
  `div.links` 372 op 240), "Inloggen" 34, "Open een voorbeeldkaart" 22, taallinks 17, voetlinks 14, prijsknoppen 1–12 46×38.
  public/v2.html r. 118, 134 (`nav .links a` padding 6px 10px 2px 0), r. 445 (`footer a` line-height 1). Taallinks openen in
  een nieuw tabblad (r. 593, `target=_blank`). iPhone SE (Truus, 22u), Pixel 7 (Jayden, 22u).
- **Landing /v2 bij 200 % zoom schuift horizontaal** (312 px inhoud op 160): vaste zijmarge 40 px (r. 114), `.feiten .rij`
  blijft `1fr 1fr` (r. 250–251), sticky nav neemt bij CSS-zoom de helft van het scherm. iPhone SE (Truus, 22u).
- **/k: "Luister naar uitleg" bovenaan geeft een systeem-alert "Nog geen actuele stemopname: …"** ook op een nieuwe kaart uit de
  app (niet alleen oude kaarten). Knop alleen tonen als er minstens één opname is, of een melding in de pagina.
  kaart.html r. ~1922, ~1930–1942 (`meldOntbrekend`). iPhone SE (Truus, 22u).
- **Hertest 22u, nog stuk:** dubbelklik × (nu 200 + 404 "Kaart niet gevonden.") en Kopie (twee vragen) in het kaartenoverzicht,
  × is 34×32 px (Sanne, desktop); vensters met alleen toetsenbord ook op iPad staand/liggend: focus blijft achter het venster,
  Escape sluit niet, geen role=dialog (`openOv`/`closeOv` index.html r. ~5150) (Mark); /k 200 % nog 224 px op 160 (Begrepen,
  weekbolletjes, voettekst); /k vertaalfout stil (pl/ar/en); trage lijn eerst een Nederlandse kaart; terugknop met open
  lightbox verlaat de kaart (Jayden, Truus).
- **OPGELOST 2026-11-08 (deze PR, test:offlinestand) — /k offline: "Ik heb vandaag geoefend" nog eens tikken haalde de dag stil weg**
  (knop bleef groen, `{aan:false}` in de wachtrij; na online was de dag weg terwijl de vinkjes per oefening bleven). Nu gaat de
  knop zichtbaar uit met de vinkjes mee. Ook: offline pijnscore staat nu als gekozen (aria-pressed). iPhone SE (Truus, 18u).
- **OPGELOST 2026-11-08 (deze PR, test:offlinestand) — /privacy bij 200 % schoof horizontaal** (424 px op 320, lange woorden
  braken niet af) en de versieregel/voettekst haalden 2,45:1 contrast. iPhone SE (Truus, 18u).
- **App: verloop van pijn en herstel onzichtbaar voor de therapeut.** 4 dagen pijn 7, 6, 8, 6 en herstel −1, 0, −2, +2: overzicht
  toont "pijn 7→6 · herstel: veel beter", de inbox "herstel: veel beter · pijnscore 6". De slechte dag 3 is nergens te zien. Breder
  dan het herstelpunt hieronder (ook pijn). Let op MDR-grens: verloop tonen, geen rangschikking. Pixel 7 → desktop (Jayden, 18u).
- **OPGELOST 2026-11-09 (deze PR, test:dubbelklikoverzicht) — App: dubbelklik op × (kaart verwijderen) of Kopie geeft twee vragen en twee POST's**; de tweede krijgt 429 en een alert
  "Even te veel verzoeken…" terwijl de kaart wel weg is. `data-sdel`/`data-skopie` zonder bezig-slot, index.html r. ~4713. Desktop (Sanne, 18u).
- **Typfout/kleine letters in de praktijknaam van een collega staan ook als kop op /k** ("fysio mark test 7632") en in "Kaarten van
  de praktijk"; erger dan het bestaande punt "collega logt per e-mail in na een typfout". iPad → iPhone (Mark, 18u).
- **OPGELOST 2026-11-08 (deze PR, test:landingprint) — App: roepnaamvoorstel kiest de verkeerde initiaal.** "Marieke B. knie"
  → "Marieke K.", "Jan K. schouder links" → "Jan L.", "Kees 😀Jansen" → half emoji-teken, '@Marieke 🦵 B.; "x"' → '@Marieke ".'
  (kwam zo op /k en in de CSV). `kaartLabelVan` houdt nu een bestaande initiaal, slaat tekens als @ en emoji over;
  `naamLijktVolledig` ziet "Jan K. schouder" niet meer als volledige naam. Desktop (Sanne, 14u).
- **App: herstel ("Ervaren herstel") toont alleen het laatste antwoord** in overzicht, inbox en dossiertekst; een dag
  "slechter" verdwijnt, het bolletje is altijd grijs en de CSV heeft geen herstelkolom (pijn wel: "pijn 7→4").
  index.html r. ~3891–3896 (`hsKl` vast), r. ~3459–3465 (dossier), r. ~4354 (CSV-koppen); server.js r. ~935 (inbox).
  Let op MDR-grens: verloop tonen, geen rangschikking. Pixel 7 + iPhone 14 → desktop (Jayden, 14u).
- **App: collega logt per e-mail in na een typfout in de praktijknaam; de verkeerde naam blijft op de A4** (`#praktijk`
  wordt niet overgenomen uit `d.praktijk` van de loginrespons, `prakSlotActie` index.html r. ~3262). Klaar-pagina van de
  uitnodiging linkt naar kale `/v2/app` (server.js r. ~5505) terwijl de app `?praktijk=` kent. iPad liggend (Mark, 14u).
- **/k: lukt vertalen niet (503/502/429), dan blijven oefennamen en uitleg stil Nederlands** zonder melding of nieuwe
  poging (`wisselTaal` kaart.html r. ~1746: `VERT[TAAL]={}` ook bij fout). In de lightbox staat de Nederlandse naam over
  het Franse paneel. iPhone SE fr/es/pl (Truus, 14u).
- **OPGELOST 2026-11-08 PR #101 — /k: dubbeltik op "Gedaan" per oefening zette het vinkje aan en weer uit** (therapeut zag "niet
  gedaan"; nu bezig-slot per oefening). iPhone SE (Truus, 10u). Test: `npm run test:dubbeltik`.
- **OPGELOST 2026-11-08 PR #101 — /k schuift horizontaal in het Turks en met de eigen knop "Grotere letters"** (ook Nederlands:
  336 px op 320; `.oefvoortgang` breekt nu af). iPhone SE (Truus, 10u). Bij 200 % systeemtekst kan de rest van de pagina nog
  breder zijn (privacyregel "Begrepen", voettekst): zie het bestaande 200 %-punt.
- **OPGELOST 2026-11-08 PR #101 — /k "Te zwaar?" toonde in fr, es, pl, tr, ar en uk "Versturen…"/"Niet verstuurd. Tik opnieuw"**
  (sleutels `zwaarbezig`/`zwaarmis` ontbraken in `TG`). Pixel 7 (Jayden, 10u).
- **OPGELOST 2026-11-08 PR #101 — App: dubbelklik op "In de praktijk" gaf een 409 en de alert "intussen op een ander apparaat
  gewijzigd"** (nu bezig-slot op de knop). iPad staand (Mark, 10u).
- **Print "Groot lettertype" snijdt de onderkant af** (hertest 14u Sanne: 4 varianten met QR elk 1 pagina, groot niet apart gemeten): XRM-rij half weg, legenda S/H/W ontbreekt, "Neem pijn serieus…" staat over
  de cellen. public/v2.css r. 186–190 (`html.v2.print-groot … height:22px`) tegen het vaste A4-vlak (`overflow:hidden`), r. 173
  (`#a4::after`). Andere 5 varianten wel op 1 pagina. Desktop (Sanne, 10u).
- **OPGELOST 2026-11-08 (deze PR, test:landingprint) — Doel en Opmerking: 10.000 tekens worden stil afgekapt op 500** (v2-veld stopt nu zelf bij 500; /k breekt lange woorden af) (server.js r. ~3897 `sanStr(…,500)`, geen maxlength in
  index.html r. 359–360), en een woord zonder spaties (geplakte URL) loopt op /k 3960 px buiten de kaart (`.client .rij` zonder
  `overflow-wrap:anywhere`, kaart.html r. 72). Desktop + 375 px (Sanne, 10u).
- **Kaartvoorbeeld op het scherm bij 12 oefeningen**: de gele tip "12 oefeningen is veel…" duwt het A4 omlaag; onderste rijen
  en XRM vallen weg, "Neem pijn serieus" staat over een rij (print zelf goed). Desktop (Sanne, 10u).
- **OPGELOST 2026-11-08 PR #101 — /k in het Turks schuift horizontaal, ook op 100 %** (367 px op 320): "Hepsi tamam" valt buiten beeld. `.oefvoortgang`
  (kaart.html r. 177) zonder `flex-wrap`, `.ovtekst` nowrap. iPhone SE (Truus, 2026-11-08 06u).
- **App op iPad liggend: knopjes eigen video en × op de kaart ±17 px** (en "Ja, die kaart bijwerken" 7 px hoog): het A4 is
  geschaald (±0,57), dus de 30 px + `::after` uit PR #49 wordt ±17–25 px. index.html r. 176–179. (Mark, 06u)
- **Hertest 06u, nog stuk:** Inbox "Alleen mijn patiënten" (alle kaarten van eigen logins `behandelaar:null`); vensters met
  toetsenbord (ovProefWelkom, ovPrint, ovKaarten, ovQrTest); lange praktijknaam in print; "Alleen beschikbaar voor beheer." bij
  fout wachtwoord (PR #41 nog niet op main); agendaknop dubbeltik (4 verzoeken); Noor per oefening zonder stop (en op een
  niet-Nederlandse kaart afwezig); Nederlandse servermeldingen op /k EN; 200 % op Pixel 7 (445 px) en iPhone SE (583 px);
  dubbeltik "Gedaan" per oefening; offline pijnscore zonder gekozen stand; lightbox (geen sluitknop, terugknop verlaat de kaart).
- **OPGELOST 2026-11-08 PR #96 — App: geprinte QR en "Test de QR op je telefoon" nemen de gekozen patiënttaal niet mee**
  (ook "Kopieer link" en "Bekijk zelf"; nu via `kaartUrl()`, en de QR tekent opnieuw bij een taalwissel. Past de link met
  taal niet in de kleine QR (langer domein dan fysiplan.nl), dan codeert alleen de QR de kale link. De CSV-kolom Kaartlink
  blijft zonder taal. Test: `npm run test:qrtaal`). WhatsApp-link krijgt
  `?taal=ar`, maar `toonQr` (index.html r. ~2166) en het QR-testvenster (r. ~2631) bouwen `/k/<id>` zonder `kaartUrl()`.
  Een Russischtalige telefoon krijgt dan Nederlands. Desktop → iPhone SE (Truus, 2026-11-08 02u).
- **/k: "Luister naar Noor" per oefening heeft geen stopknop of speelstand**; alleen de bovenste knop wordt "Stop" (ver
  buiten beeld), een tweede tik start opnieuw. kaart.html r. ~1873–1880, ~1926. iPhone SE (Truus, 02u).
- **OPGELOST 2026-11-08 (deze PR, test:landingprint) — Landing /v2 printen/PDF: lege secties en prijzen weg** (scroll-animaties met opacity 0 ook in print). Oplossing:
  `@media print{*{animation:none!important}}` in public/v2.html r. ~484. Desktop (Sanne, 02u).
- **/k: agendaknoppen zonder bezig-slot of feedback op een trage lijn**; `naarAgenda` haalt het .ics twee keer op
  (controle + navigatie), dubbeltik = 2–4 verzoeken (iOS: mogelijk twee importvragen). kaart.html r. ~885–897. Pixel 7 (Jayden, 02u).
- **OPGELOST 2026-11-08 PR #96 (test:eerstedeling) — App: na "Maak er … van" bij een editor zonder kaartId volgt een 409 over de eigen, net gedeelde kaart**
  (`zetKaartId` alleen als `d.id===KAART_ID`, index.html r. ~3312). Desktop (Sanne, 02u).
- **OPGELOST 2026-11-07 PR #89 — App: na "Naam wijzigen" zette "In de praktijk" de oude naam stil terug** (`#k_naam`
  hield de oude naam; de server hernoemde terug). Desktop (Sanne, 22u). Test: `npm run test:hernoem`.
- **OPGELOST 2026-11-07 PR #89 — /k: agendaknop eindigde op een kale Nederlandse JSON-foutpagina** (afspraak
  intussen weggehaald, 429, 404, 400) zonder weg terug. Nu eerst controleren, anders een melding in de eigen taal onder
  de knop. Pixel 7 (Jayden, 22u). Test: `npm run test:agendamelding`.
- **/k lightbox staand op iPhone SE: naam over de uitleg, onderkant onbereikbaar.** Foto begint op y −7, uitlegpaneel
  loopt tot 576 bij 568 hoog met `overflow:visible` (niet scrollbaar), witte `.lbnaam` staat over de crème uitleg.
  Onderaan de technische zin "Volledige oefenafbeelding. De houdingen worden niet automatisch uitgesneden of
  afgespeeld." kaart.html r. 103–117, 2279. (Truus, 22u)
- **OPGELOST 2026-11-09 (deze PR) — Inbox "Alleen mijn patiënten" verbergt vragen en zegt "Alles is afgehandeld"** (hertest 22u: ongewijzigd) terwijl de teller 1 blijft. Kaarten
  van eigen logins krijgen `behandelaar:null`; het filter zoekt op voornaam in het vrije veld. public/index.html
  r. ~3659–3663. Desktop (Mark, 2026-11-07 18u).
- **Uitgenodigde collega met typfout in de praktijknaam maakt een losse praktijk** ("nog niet beveiligd" +
  Beveiligen, geen e-mailveld). De server kan inloggen met alleen e-mail; geef een vak "Inloggen met je e-mail" en
  noem de praktijknaam op de klaar-pagina (server.js r. ~5303). iPad liggend (Mark, 18u).
- **/k offline: pijnscore en "Ik heb vandaag geoefend" tonen geen gekozen stand** (alleen groene tekst; knop
  aria-pressed=false, weekbolletje blijft leeg); seintjes wel. kaart.html r. ~2330, ~2346. iPhone SE (Truus, 18u).
- **OPGELOST 2026-11-09 (deze PR) — /k spoedregel zegt "Bel de praktijk" zonder nummer of belknop** als de praktijk geen telefoon heeft ingevuld.
  `tekenSpoed` r. ~1578: tel-link als `K.praktijk.tel` bestaat, anders in de app om een nummer vragen. (Truus, 18u)
- **OPGELOST 2026-11-08 PR #92 — Eigen oefening: dubbelklik op Toevoegen geeft een valse fout** (knop op slot vóór de FileReader, server reserveert de naam vóór de awaits; Mark hertestte: één POST, geen 409) (hertest 22u: 200 + 409, één oefening, maar daarna
  "Er is al een eigen oefening met deze naam."). `knop.disabled` gaat pas aan ná FileReader/`resizeDataUrl`
  (index.html r. ~4795–4805): bezig-slot vóór de FileReader. De serverrace (naamcontrole vóór de awaits, server.js
  r. ~2834) bestaat nog. Desktop (Mark, 2026-11-07 14u, 22u).
- **App op iPad liggend: knop Toevoegen bij Eigen oefening valt onder de vensterrand** (lijst "Jullie eigen
  oefeningen" staat tussen formulier en knoppen; knop y=883 op 810 hoog, venster schuift onzichtbaar; knop 36 px).
  Knoppen boven de lijst of vast onderaan. index.html r. ~4778–4784. (Mark, 22u)
- **/k: vaste Nederlandse controlezinnen op een Engelse/Duitse kaart**: "De oefenafbeelding wordt gecontroleerd…" en
  "De algemene uitleg wordt gecontroleerd…" (public/kaart.html r. ~1299–1300) gaan niet door `tr()`. Pixel 7 (EN),
  iPhone 14 en iPhone SE (DE) (Jayden, Truus, 2026-11-07 14u).
- **OPGELOST 2026-11-08 PR #92 — /k: vinkje "Gedaan" per oefening gaat offline verloren** (via `stuur()` en de wachtrij per oefening per dag; server telt op de dag van tikken; Truus hertestte op iPhone SE): `/api/kaart/oefening` gaat niet via `stuur()`/de wachtrij
  (lege `.catch`, kaart.html r. ~1079). De rest van de offline-wachtrij werkt wél (pijn, herstel, seintje, te zwaar,
  dag gedaan komen na online vanzelf aan). iPhone SE (Truus, 14u).
- **/k bij 200 % zoom: hele pagina schuift horizontaal** (582 px op 320): "Alles gedaan", weekbolletjes, "Ik heb vandaag
  geoefend", "Begrepen", voettekst. iPhone SE (Truus, 14u; CSS-zoom, strenger dan WCAG).
- **App: "Naam wijzigen" zit verstopt in een scrollbox van 200 px** (`#k_srv_lijst` max-height 200px; het deelpaneel is
  1479 px hoog, de knop staat ±110 px onder de rand, geen hint). public/index.html r. ~736. Desktop, iPad (Sanne, 10u).
- **Opnamepagina /o loopt vast zonder camera**: "Dat lukte niet" zonder knop Opnieuw en zonder bestandskeuze
  (`<input type=file accept=video/*>`); het scherm blijft "Wachten op de video…" tonen. public/opname.html r. 103, 127.
  iPhone 14 + desktop (Mark, 10u).
- **/k bij 200 % zoom: appbanner bedekt ±30 % en het sluitkruis staat buiten beeld** (scrollWidth 588 op 320). iPhone SE (Truus, 10u).
- **/k: Engelse oefennamen op een Nederlandse kaart** ("Knee elbow", "Med ball rotation passes knee", "Leg extension",
  "Seated chair squats", "Abs stretch", "Abroller"). Staat in public/oefeningen-v2.json (r. 650, 4469): die bestanden
  raken routines niet aan; doorgezet naar mensenwerk (videostroom). iPhone SE (Truus, 10u).
- **/k (andere taal, trage lijn): weer eerst een halfvolle, aantikbare Nederlandse kaart** (tot ±5 s bij 2,5 s vertraging)
  terwijl `alles()` op /api/kaart/vertaal wacht (kaart.html r. ~1480). Erger dan het LAAG-punt hieronder. iPhone 14 (Jayden, 10u).
- **App: verouderd-melding is minuscuul en de enige waarschuwing** (±9 px tekst, links ±10 px hoog in `#qrBlok`);
  het formulier blijft bewerkbaar zonder banner, de therapeut typt door. Desktop (Mark, 2026-11-07 06u).
- **App, verlopen proef bij een collega op iPad: bewerken gaat stil verloren.** De proefbalk staat bovenaan en is
  na scrollen uit beeld; velden blijven bewerkbaar, `PROEF_VOORBIJ` verstuurt niets zonder melding. (Mark)
- **App op iPhone SE: Sjablonen-venster onleesbaar.** Tekstkolom ±70 px (één woord per regel), titel valt boven
  weg; rij met `display:flex` zonder wrap, public/index.html r. ~2281. (Sanne, 2026-11-07 06u)
- **/k: uitleg niet zichtbaar, wel technische tekst** "Natuurlijke stemopname nog niet beschikbaar. De uitleg staat
  bij de afbeelding." onder 4 van 6 oefeningen; uitleg pas na tik op de foto (vergrootglas ±20 px). iPhone SE, iPad (Truus).
- **App op telefoon: deelweigering (409 bestaat/verouderd) staat in `#qrBlok` buiten beeld** (x≈944 px in het
  scrollende A4 op een scherm van 412 px); de therapeut ziet niet waarom de QR ontbreekt. Na een hernoeming
  via het overzicht geeft daarna elke bewerking 409. Pixel 7 (Sanne, 2026-11-07).
- **Overzicht na een verlopen proef laat "te zwaar" weg** (en toont "afspraak 8 nov" zonder ×4).
  server.js `/v2/proef/overzicht` leest `oefZwaar` niet. Desktop (Mark, 2026-11-07).
- **Kaartenoverzicht: lange naam zonder spaties steekt over de rand en de knoppen** (`#k_srv_lijst` zonder
  `overflow-wrap:anywhere`); × wrapt ook op desktop. Desktop (Sanne, 2026-11-07).
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
  index.html (sinds deze run) bij elke `d.proefVerlopen`. (Mark) Ook "In de praktijk" (`k_save_srv`) en
  "Naam wijzigen" (`data-shernoem`) geven een alert; bij afspraak staat de melding 1,6 s in de Bewaar-knop. (Mark, 2026-11-07)
- **Collega op tweede apparaat ziet de proefbalk en aftelling niet; /v2/proef toont daar het
  aanmeldformulier**, ook via de link "Wil je doorgaan?". PROEF komt alleen uit de proefcookie
  (server.js `/v2/app` en `/v2/proef`); ook het praktijkaccount (`acc.proef`) gebruiken. iPad (Mark).
  Erger na afloop (2026-11-07): de collega ziet een normale app tot de eerste schrijfactie, en kan niet
  laten weten dat de praktijk wil doorgaan of het overzicht openen. Na inloggen status opvragen.
- **Tweede apparaat: welkomstvenster heeft geen "inloggen bij mijn praktijk"**, alleen stappen voor
  een nieuwe praktijk. iPad (Mark).
- **Print: lange praktijknaam afgekapt** ("Fysiotherapie & Manue"): de kop is een `<input id="praktijk">`
  en die print op één regel. Desktop en iPad (Sanne).
- **Landing /v2 op mobiel: tikdoelen 14–22 px** (navigatie, taallinks, "Bekijk de kaart vergroot",
  voet); "Vragen" valt buiten beeld in een scrollstrook zonder hint. Printvenster-knoppen 33 px. iPhone 13 / iPad (Sanne).
- **/k: dubbel tikken maakt ongedaan** bij de videoknop ("gedaan" per oefening OPGELOST 2026-11-08 PR #101) (twee POSTs, kunnen
  ook in omgekeerde volgorde aankomen: patiënt ziet niet gedaan, therapeut wel). Bezig-slot nodig in
  `toggleOefDaan` en de vbtn-toggle. iPhone SE, Pixel 7 trage lijn (Truus, Jayden).
- **/k: trage lijn geeft geen feedback** bij pijnscore/herstel: oude keuze blijft 2–3 s staan. Pixel 7 (Jayden).
- **/k: "gedaan vandaag" rekent client in lokale tijd, server in Amsterdam-tijd**, en is een toggle; in een
  andere tijdzone kan een tik het vinkje van gisteren weghalen. `bevestigGedaan` toggelt met verouderde
  `K` op een tweede apparaat (server.js `/api/kaart/gedaan`, kaart.html `dagStr`). (Jayden)
- **/k: "Kaart niet gevonden" altijd Nederlands**, ook met `?taal=en`; `toonStoring` alleen NL/EN. (Jayden)
  Ook in het Duits, en een 429 op de pijnscore toont de Nederlandse servertekst (kaart.html `dank.textContent=d.fout`). Pixel 7 (2026-11-07).
- **/k: voorlezen geeft een systeem-alert met technische tekst**, altijd Nederlands (`meldOntbrekend`). (Truus)
- **/k (Arabisch): onvertaalde Nederlandse tekst staat rtl** (punt vooraan); geef niet-vertaalde tekst
  `lang="nl" dir="ltr"`. "De oefenafbeelding wordt gecontroleerd" is niet vertaald. (Truus)
- **/k: seintjes overschrijven elkaar**: "vraag" en daarna "gaat goed" → de vraag verdwijnt stil (één `seintje`-slot). (Jayden)
- **OPGELOST 2026-11-08 PR #92 — /k: offline afgevinkt bereikt de therapeut nooit.** Geen wachtrij of `online`-handler, terwijl
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
- **App: modale vensters niet met toetsenbord**: geen focus naar het venster, geen Escape, geen role=dialog. Hertest 18u: ovProefWelkom, ovPrint, ovKaarten, ovSjab, ovWis ongewijzigd (22u: ook ovQrTest); `<dialog>` "Nieuw in Fysiplan" en ovSein werken wel (patroon). `openOv`/`closeOv` r. ~5002.
- **App: printversie toont placeholders van het praktijkadres** ("adres / postcode en plaats / …").
- **LIJKT OPGELOST 2026-11-07 18u (#77): App 1280×800: A4 past niet; QR en deelknoppen na delen buiten beeld.** Sanne zag #a4wrap 736×559, geen horizontaal scrollen, QR en knoppen zichtbaar.
- **Foutmelding "Alleen beschikbaar voor beheer." bij fout wachtwoord of foute herstelcode.**
  Al opgelost in open PR #41 (server.js `denied()` met eigen tekst); mergen of overnemen.

### LAAG
- **Sweep 2026-11-09 02u, LAAG:** × bij andermans teamsjabloon (403 pas na confirm; iPad, Mark); inbox-vinkje 16×13 px en
  sjablonenknoppen 36 px (Mark); deelpaneel zonder aria-expanded/Escape (index.html r. ~4111); proefformulier zonder aria-invalid,
  5 losse role=alert, "Gebruik 10 cijfers…" bij een geweigerd nepnummer (lib/proef.js r. 53, 96); 13e oefening via native alert;
  `POST /api/kaarten` slaat `naam:{a:1}` op als "[object Object]" en `chosen:"abc"` als lege kaart; "Nieuw in Fysiplan" al bij
  het 2e bezoek op dag 1 (release-notes.js r. 18) (Sanne); /k leeg scherm zonder laadindicator op een trage lijn, verloopdatums
  "06-11" op een Engelse kaart, "0 deze week actief" terwijl er scores zijn (Jayden); seintje dubbeltik + extra tik = 2 POSTs
  (Truus); landing-tikdoelen ongewijzigd.
- **Verlopen proef: "+1 week" bij de afspraak schuift de datum in het veld door, ook als bewaren geweigerd wordt** (na twee tikken
  22-11 in het veld, niets bewaard). iPad (Mark, 22u).
- **Verlopen-pagina /v2/proef vult de praktijknaam niet in** als die pas in de app is ingevuld (proefrecord `praktijk` leeg;
  `acc.proef` kent hem wel; `proefZetPraktijk` index.html r. ~2606 werkt alleen lokaal). Desktop (Sanne, 22u).
- **Proefformulier: 0612345678 geeft "Dit nummer klopt niet. Gebruik 10 cijfers die met 0 beginnen"** terwijl het wel 10 cijfers
  zijn (bewuste nepnummerlijst); zeg "Vul je echte nummer in". lib/proef.js r. 52, 96. Nog geen `aria-invalid`. (Sanne, 22u)
- **/k-schema: S/H/W en de legenda blijven Nederlandse afkortingen in pl/ar**; Arabisch "2 مجموعات, 15 تكرارات" met Latijnse komma.
  iPhone 14 (Jayden, 22u).
- **.ics-DESCRIPTION linkt naar /k/<id> zonder `?taal=`** (nog te bevestigen, server.js r. ~4630): op een nieuw apparaat opent de
  kaart vanuit de agenda in het Nederlands. (Jayden, 22u)
- **Proefformulier: alleen een fout in een vinkje → focus gaat naar body** (`eerste` kijkt alleen naar email/naam/tel, server.js r. ~674). Desktop (Sanne, 18u).
- **/k lightbox liggend op iPhone 14: witte oefennaam over de grijze disclaimer** (`.lbnaam` absolute, kaart.html r. ~118). (Jayden, 18u)
- **Teamsjabloon: therapeut (geen beheerder) ziet × bij het sjabloon van een collega**; server weigert terecht 403. iPad liggend (Mark, 18u).
- **/privacy versieregel**: zie OPGELOST hierboven. Tikdoelen < 44 px op iPad: categorieën 24 px, Lijntekeningen/Avatar 28 px,
  seintje-knop 32 px, Bewaar bij afspraak 32 px (Mark, 18u).
- **/k Frans wisselt tussen "tu" en "vous"** (`T.fr` tu; `TSN`, `THS`, `TOFF`, `TSPOED`, `TMG` vous; kaart.html r. 628 tegen
  r. 820–866). Kies vous voor oudere patiënten. iPhone SE (Truus, 14u).
- **/k: Nederlandse aria-labels/tooltip op een fr/es/pl-kaart**: "vergrote oefenfoto" (r. 602), "Voorleesstem" (r. 464),
  title "Print of bewaar als PDF" (r. 467), "Taal / Language" (r. 457). "De oefenafbeelding wordt gecontroleerd…" ook in
  fr/es/pl Nederlands (aanvulling op het MIDDEL-punt). iPhone SE (Truus, 14u).
- **/k: 429 bij doelactiviteit toont Nederlandse servertekst** (kaart.html r. ~2484 toont `d.fout`; aanvulling op het
  pijnscore-punt). Pixel 7, iPhone 14 (Jayden, 14u).
- **/v2/proef: 0612345678 krijgt "Gebruik 10 cijfers die met 0 beginnen"** terwijl het als nepnummer wordt geweigerd
  (lib/proef.js r. 52, r. 96). Foutmeldingen hebben geen `aria-invalid`/`aria-describedby`. Desktop (Sanne, 14u).
- **App Beveiligen: tabvolgorde wachtwoord → knop → akkoordvinkje**; bij "Vink aan…" gaat de focus niet naar het vinkje
  (index.html r. ~2901–2908, r. ~3252). Desktop (Sanne, 14u).
- **Kaartenoverzicht: naamrondje toont "?" bij een naam die met @ of = begint.** Desktop (Sanne, 14u).
- **Team: opnieuw uitnodigen zet de rol stil terug op Therapeut** (server.js r. ~2633–2641) en meldt niet dat de vorige
  link vervalt. Een heruitgenodigde collega kan zijn eigen oude teamsjablonen niet meer bijwerken (409, nieuw lid-id,
  server.js r. ~2636 tegen r. ~3020). Desktop (Mark, 14u).
- **Uitnodigingslink met "." of ")" erachter of in hoofdletters: "verlopen of al gebruikt"** (server.js r. ~5474, regex op
  rauwe invoer; eerst kleine letters en niet-hex eraf). iPad liggend (Mark, 14u).
- **Welkomstvenster: Enter in "Naam van je praktijk" doet niets**; herladen vóór invullen = welkom komt niet terug
  (index.html r. ~510, ~2626). Desktop (Sanne, 10u).
- **Roepnaamvoorstel verminkt rare invoer**: "Jan 😀 <script>…" → "Jan <." (`kaartLabelVan` neemt een leesteken als
  initiaal). Naam wijzigen kapt 300 tekens stil af op 60; avatar "=E" bij een naam met "=". (Sanne, 10u)
- **Proefformulier: 0612345678 geweigerd (nepnummer) met de melding "Gebruik 10 cijfers die met 0 beginnen"**, wat al klopt
  (lib/proef.js r. 52 tegenover r. 96). (Sanne, 10u)
- **Team: opnieuw uitnodigen maakt de vorige link stil ongeldig, en de linkbox noemt niet voor wie hij is** (server.js
  r. ~2629–2645). iPad staand (Mark, 10u).
- **Teamsjabloon: therapeut-collega ziet × bij het sjabloon van een ander** (server weigert terecht met 403). (Mark, 10u)
- **Proef "t/m <dag>" klopt niet**: hij sluit op het tijdstip van aanmelden, niet aan het eind van die dag (server.js r. ~5196,
  `nu + 14*86400000`). (Mark, 10u)
- **.ics van de afspraak: kaartlink zonder `?taal=`** (DESCRIPTION en URL, server.js r. ~4545, ~4569; waarschijnlijk ook
  oefenmomenten.ics r. ~4709); bestandsnaam altijd "afspraak.ics". iPhone 14, Pixel 7 (Jayden, 10u).
- **/k Arabisch: kolomkoppen ".1 Mobilisatie…", S/H/W Latijns, veeg-pijl "→" wijst in rtl verkeerd.** Oekraïens: "15 повторення"
  moet "15 повторень". Pixel 7 (Jayden, 10u).
- **/k oefening die niet in de bibliotheek staat**: "De algemene uitleg wordt gecontroleerd" klopt niet (`explanationWithheld`
  true zonder `o`, kaart.html r. ~681) en "Luister" geeft `alert("Nog geen actuele stemopname: …")`. Alleen oude/API-kaarten. (Truus, 10u)
- **/k app-banner: sluitkruis 21×34 px, aria-label "sluiten" niet vertaald.** /k/<onbekend id> geeft HTTP 200 (soft-404). (Truus, 10u)
- **Hertest 10u, nog stuk:** vensters met toetsenbord (geen focus, Escape sluit niets: `openOv`/`closeOv` index.html r. ~5063);
  landing /v2 print (12 pagina's, `.prijs` opacity 0); Naam wijzigen verstopt; lange praktijknaam in print; collega ziet geen
  proefbalk en verlopen = alert of stil verloren; uitnodiging-klaar-pagina tegenover Kaarten op nieuw apparaat; /o zonder camera;
  overzicht na proef zonder ×N; Nederlandse servertekst na 429/404 op /k in en/ar/uk; /k/<onbekend> en storingspagina Nederlands;
  trage lijn: leeg scherm en dan Nederlandse kaart; agendaknop dubbeltik (3 verzoeken); pijnscore dubbeltik (2 POST's); terugknop
  met lightbox verlaat de kaart; lightbox-focus terug naar body; tikdoelen < 44 px op /k en de landing.
- Eigen oefening met een te kleine of lege foto (1×1 PNG) zegt "De foto is te groot (max. 600 kB)." server.js r. ~2937. (Mark, 06u)
- /k EN: .ics-bestanden heten "afspraak.ics"/"oefenmomenten.ics" en het beginscherm "Trainingskaart …" (server.js r. ~4565,
  ~4754, ~4935). (Jayden, 06u)
- Proefformulier met meer dan 8 KB (alleen zonder `maxlength`) geeft een kale tekstpagina "Ongeldig verzoek" (413) en
  alle invoer is weg. server.js r. ~5140. (Sanne, 06u)
- Teamsjabloon van een ander: therapeut ziet × "verwijderen voor de hele praktijk"; server weigert pas na de bevestiging
  met een alert (index.html r. ~2509 `data-pdel`). iPad staand (Mark, 2026-11-08 02u).
- Verlopen proef: "+1 week" laat de nieuwe datum in het veld staan terwijl niets is bewaard (index.html r. ~4455 `data-safweek`). iPad (Mark, 02u).
- iPad staand: na een gelukte deling staan QR/WhatsApp/kopieer buiten beeld (x 855–1124 op 810) zonder melding. (Mark, 02u)
- Herstelcode is gevoelig voor hoofdletters en spaties ("fp-…", "FP a66d7 …" geweigerd). server.js r. ~2739. (Sanne, 02u)
- /k: eigen taalkeuze houdt niet stand: URL blijft `?taal=en`, na herladen weer Engels (kaart.html r. ~1732 `wisselTaal`). iPhone 14 (Jayden, 02u).
- /o zonder token geeft 200 met de oude V1-inlogpagina in plaats van "Deze opnamelink is niet geldig". Pixel 7 (Jayden, 02u).
- /k lightbox staand op iPhone 14: witte oefennaam over de appbanner (variant van het SE-punt). (Jayden, 02u)
- /k/<id>/ en /k/<ID in hoofdletters> zeggen "Kaart bestaat niet (meer)" (kaart.html r. 620, server.js `vindKaart`). iPhone SE (Truus, 02u).
- /k offline: Noor-opname zegt "kon niet worden afgespeeld" zonder te noemen dat er geen internet is (mp3 niet in kaart-sw.js). (Truus, 02u)
- /k Arabisch bij 200 %: door rtl valt juist het begin van de regels weg (op echt toestel bevestigen). (Truus, 02u)
- OPGELOST 2026-11-08 PR #92 (melding noemt nu JPEG/PNG, nog wel als alert) — Eigen oefening: verkeerd fotobestand (.HEIC, .pdf, tekst als .png) geeft alleen alert "De foto kon niet worden
  gelezen." zonder "gebruik JPEG of PNG". index.html r. ~4799. iPad staand (Mark, 22u).
- /k video zonder internet: eigen opname zegt "neem contact op met je praktijk" (misleidend offline, en achter de
  appbanner); YouTube onbereikbaar geeft een zwart vlak zonder melding. kaart.html `bewaakVideo` r. ~2181, yt-tak
  r. ~2320. iPhone SE (Truus, 22u).
- /k: `<video>` van de eigen opname heeft aria-label "General instructions for this exercise" (label van het
  tekstblok, `VIDEO_TEKST_ALG`); verwacht "Video from your therapist: <oefening>". kaart.html r. ~2308. Pixel 7 (Jayden, 22u).
- Lange roepnaam afgekapt op de print (36 tekens zichtbaar), en lengtes verschillen: editor `c_naam` maxLength 40
  (index.html r. 1106), Naam wijzigen en server 60 (server.js `cleanName(b.naam, 60)`). Desktop (Sanne, 22u).
- /v2/proef: 0612345678 wordt als nepnummer geweigerd met de tekst "Gebruik 10 cijfers die met 0 beginnen (mobiel
  06…)", wat dit nummer al doet. lib/proef.js r. 51, 96: eigen zin geven. Desktop (Sanne, 22u).
- Team-venster: na meerdere uitnodigingen staat alleen de laatste link; geen "kopieer link" voor eerdere (opnieuw
  uitnodigen maakt de vorige ongeldig). Verwijderknop × 32×36 px, "Zeker?" loopt over de rand. index.html r. ~3060–3100. (Mark, 18u)
- Akkoord wordt twee keer gevraagd: bij de proef én bij Beveiligen (`#ps_vwolab`). Desktop (Sanne, 18u).
- `/k/<onzin>` geeft 200 in plaats van 404 (de API weigert wel netjes). (Jayden, 18u)
- Sjabloon met `oefeningen:[{n:{a:1}}]` wordt bewaard als oefening "[object Object]" (server.js r. ~2857 `cleanName`
  op een object); verwacht 400. (Mark, 14u)
- /k offline: dag en score krijgen het tijdstip van ontvangst (twee offline dagen: zie HOOG, 18u). "Te zwaar?" zegt offline al "Doorgegeven ✓" (kaart.html r. ~2212). (Truus, 14u, uit code)
- Afspraak-.ics: DESCRIPTION/URL wijzen naar `/k/<id>` zonder `?taal=` (server.js r. ~4365). (Jayden, 14u)
- Roepnaamvoorstel bij rare invoer onzin: "Jan K. 😀 =1+1 <script>" → "Jan <." (index.html `kaartLabelVan`). (Sanne, 14u)
- Praktijknaam "Fysio <b>Sanne</b>" wordt stil "Fysio bSanne/b" (lib/proef.js `schoon`). (Sanne, 14u)
- Dubbeltik op "Toch zo laten" stuurt twee POST /api/kaarten (200 + 409); geen dubbele kaart. (Sanne, 14u)
- Welkomsttekst "klik links" klopt niet op de telefoon (lijst staat boven); daarna meteen ook "Nieuw in Fysiplan". (Sanne, 14u)
- /k: uitvinken op apparaat A bereikt apparaat B niet als B die oefeningen zelf in localStorage had aangevinkt
  (`leesOefDaan` voegt lokaal en server samen). Randgeval na PR #68: na laden de serverstand van vandaag als waarheid
  nemen, localStorage alleen offline. iPhone 14 + Pixel 7 (Jayden, hertest 10u).
- Sjablonen-venster ook op desktop 1280 onleesbaar (tekstkolom ±70 px); hoort bij het MIDDEL-punt voor iPhone SE. Na
  "Deel" blijft de knop Deel bij het eigen sjabloon staan. (Mark, 10u)
- /k: gegokt of onbekend kaart-id geeft HTTP 200 met "Kaart niet gevonden" (de API zelf geeft 404); beter 404/410. Lekt niets.
  server.js r. ~4392. (Truus, Mark, 10u)
- /k: offline zegt de eigen video "neem contact op met je praktijk"; offline pijnscore wordt nooit later verstuurd
  (hoort bij het offline-punt). iPhone SE (Truus, 10u).
- /k (Arabisch, vertaling mislukt): voorlezen spreekt Nederlandse namen uit met de Arabische stem, zonder melding
  (kaart.html `leesVoor` r. ~1526). Ook de uitleg in de lightbox blijft Nederlands zonder melding (Engels, Jayden). (10u)
- .ics-link verliest de taal (`/k/<id>` zonder `?taal=en`), server.js r. ~3986 en ~4171. (Jayden, 10u)
- Kleurprint "Avatar" mengt stijlen: bekkenbodemoefeningen als lijntekening, enkele als grijze foto. Desktop (Sanne, 10u).
- Tip "therapietrouw" (`#trouwhint`) op Pixel 7 links en rechts afgekapt (binnen het geschaalde A4). (Sanne, 10u)
- App: dubbelklik op "+" in de oefeningenlijst voegt toe en haalt weer weg (toggle), public/index.html r. ~1358. (Sanne)
- App: emoji in de roepnaam geeft voorstel "Dirk �." (`kaartLabelVan` met `charAt(0)`, index.html ~r. 1955). (Sanne)
- App op iPhone SE: knoppengroep Sjablonen | Kaarten | Wis kaart breekt over twee regels (v2.css r. 92–94);
  welkomstvenster: Enter in praktijknaam doet niets, tekst zegt "klik links". (Sanne)
- API: `chosen` als string geeft 200 en een kaart zonder oefeningen (verwacht 400). (Mark)
- /api/kaart/vraag geeft 502 "vraaghulp niet bereikbaar" op een kapotte body in plaats van 400 (server.js r. ~4243). (Jayden)
- /k: 429 toont "No connection right now", gelijk aan een storing. iPhone 14 (Jayden).
- Landing /v2 op iPhone SE: kop (82 px) en duimbalk (68 px) nemen 26 % van de hoogte; "Probeer Fysiplan gratis"
  in de hero half achter de duimbalk. (Jayden)
- /k: herstelknoppen zonder aria-pressed/eigen label; `#agbtn` begint met svg zonder label; lightbox op iPad
  zonder sluitknop. (Truus)
- /k (Engels): mislukte vertaling laat oefennamen stil Nederlands; trage lijn geeft eerst een lege pagina
  zonder laadstaat (niet meer halfleeg NL). Pixel 7 (Jayden).
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
- Server knipt tekst af midden in een emoji (`slice` op UTF-16 in `sanStr`), geeft "�". (Jayden) Ook in
  `/api/kaart/antwoord` en `/api/kaart/vraag` (`.slice(0,300)`); één gedeelde UTF-16-veilige afkap gebruiken.
- /k: foutmelding van de videospeler alleen NL/EN; appbanner wisselt niet mee van taal en bedekt de uitleg onder de video. (Truus)
- Kaartenoverzicht "actief deze week" telt pijnscore, herstel, seintjes en afvinken per oefening niet mee (`actiefDezeWeek`). (Truus, Sanne)
- Kaartenoverzicht ververst niet direct na beveiligen ("Nog geen gedeelde kaarten" tot heropenen).
- Lange kaartnaam: melding toont de hele invoer, server bewaart 60 tekens; `#k_naam` zonder maxlength.
- Bijna verlopen proef: "loopt nog vandaag nog", en "t/m zaterdag" terwijl hij vrijdag afloopt.
- /v2/proef zegt "Vul drie gegevens in", er zijn vijf verplichte velden.
- Verwerkersovereenkomst twee keer aanvinken (proef en beveiligen).
- Nieuwe proefgebruiker ziet bij het tweede bezoek meteen "Nieuw in Fysiplan".
- /k: "Ik heb vandaag geoefend" is een aan/uit-knop; nog eens tikken wist de oefendag.
- /k: lightbox zegt "De uitvoering is niet door een fysiotherapeut goedgekeurd" (verwarrend voor patiënt).
- App: knoppen 28–36 px hoog op desktop en tablet; Print loopt op iPad liggend tegen de rand. Op 1280 wrappen
  "+ Eigen oefening", "Wis kaart" (2 regels) en "Print trainingsschema (PDF)" (3 regels). (Sanne)
- /k (Duits): "Eén tik" is vertaald als "Ein Tipp" (= een hint), in `de.sintro` en `de.hsintro`; beter "Einmal tippen". (Jayden, 2026-11-07)
- /k: pijnscore op dezelfde dag wijzigen houdt de tijd van de eerste tik (server.js `/api/kaart/meting`). (Jayden)
- /k: "Ervaren herstel" zit dicht in een `<details class="rustblok">`; de vijf knoppen zijn niet te zien. iPhone SE (Truus).
- Verlopen proef: "Ja, ik wil doorgaan" onthoudt niets; de pagina toont daarna dezelfde knop (`p.doorgaan` ongebruikt). (Mark)
- Overzicht na de proef toont seintjes die in de app al gezien zijn nog als nieuw. (Mark)
- Eigen oefening: PDF of GIF geeft "De foto kon niet worden gelezen." in plaats van "Kies een JPEG- of PNG-foto". (Mark)
- 13e oefening geeft een systeem-`alert()` ("Maximaal 12 plaatjes"). (Sanne)
- Print: lange Doel/Opm. kapt stil af zonder "…"; Opm. schuift tegen "Casus"; cel 12 1 px hoger met zwaardere rand;
  in compact zijn de tekeningen ~⅓ van de cel. Desktop (Sanne).

## Opgelost

- **App: seintje "heeft een vraag" werd met één klik + Enter stil afgehandeld** (prompt, leeg = afhandelen). Nu een eigen
  venster met "Beantwoorden" en "Alleen afhandelen". **Afspraak: fouttekst bleef op "Bewaar"** en **dubbelklik op "+1 week"
  = twee weken**: label één keer onthouden, bezig-slot. **Hoge vensters** (Kaarten na beveiligen) scrollen nu binnen het
  scherm. **KRITIEK — /k?taal=__proto__ maakte de kaart leeg, en via fp_taal ook elke latere QR-scan** (Jayden): taal
  alleen nog via `isTaal` (hasOwnProperty). **Proef: voorbeeldnummer 06 1234 5678 werd zelf geweigerd** (Sanne).
  OPGELOST 2026-11-07 PR #75. Test: `npm run test:seintje`, `npm run test:proef`.
- **HOOG — "Naam wijzigen" in het overzicht werd bij de volgende bewerking stil teruggedraaid** (de open editor stuurde
  de oude naam + kaartId; ook `client.c_naam` bleef oud, dus /k zag de verbetering nooit). De open editor neemt nu naam
  en versie over, de server zet `client.c_naam` mee en hoogt `ts` op (ander apparaat krijgt "verouderd").
  OPGELOST 2026-11-07 PR #68. Test: `npm run test:hernoem`. (Sanne, desktop + Pixel 7)
- **HOOG — /k: "gedaan" per oefening stond alleen op één apparaat** (iPhone 6/6, iPad 0/6). De kaart telt nu de vinkjes
  van vandaag uit `oefTrouw` mee (serverdag via `dag` in GET /api/kaart). OPGELOST 2026-11-07 PR #68.
  Test: `npm run test:gedaansync`. (Truus, iPhone SE + iPad)
- **MIDDEL — /k: na "Alles gedaan" haalde een bevestigende tik op "Ik heb vandaag geoefend" de dag stil weg** (kaart bleef
  "alles gedaan" tonen, therapeut 0 actief). De dag wordt nu expliciet aan/uit gezet (`aan`), de automatische
  bevestiging is idempotent en uitzetten haalt de vinkjes mee weg. OPGELOST 2026-11-07 PR #68. (Jayden, iPhone 14 + Pixel 7)
- **HOOG — App: roepnaam verbeteren maakte stil een tweede kaart met een nieuwe QR/link** ("Dirk" → "Dirck",
  ook "Voorbeeldpatiënt" → echte roepnaam). POST /api/kaarten hernoemt nu de kaart van het meegestuurde
  `kaartId` als de nieuwe naam vrij is; id, QR en voortgang blijven. OPGELOST 2026-11-07 PR #60. Test: `npm run test:hernoem`.
- **MIDDEL — alleen openen op een tweede werkplek maakte de kaart op de eerste "verouderd"** (409 kaatste heen en
  weer, Mark, desktop + iPad). Ongewijzigde inhoud hoogt `ts` niet meer op. OPGELOST 2026-11-07 PR #60.
- **HOOG — App op iPhone SE: sticky bovenbalk nam 57 % van het scherm** (Sanne). Onder 920 px scrolt hij mee weg.
  OPGELOST 2026-11-07 PR #60. Test: `npm run test:topbar`.
- **HOOG — oud apparaat of tabblad overschreef een gedeelde kaart bij het openen en wiste eigen opnames**
  (Truus, desktop, 2026-11-07). De v2-editor stuurt nu `basisTs` mee; is de kaart elders bewaard, dan geeft
  de server 409 `verouderd` en toont de editor "Open de nieuwste versie" / "Toch mijn versie bewaren".
  OPGELOST 2026-11-07 PR #56. Test: `npm run test:kaartversie`.
- **HOOG — /k: eigen video van de therapeut verdween bij een oefening met een afgekeurd beeld** (Chair squat,
  iPhone SE). De eigen opname of per kaart geplakte YouTube-link blijft nu staan, zonder algemene uitlegtekst;
  bibliotheek- en gegenereerde video's blijven verborgen. OPGELOST 2026-11-07 PR #56.
  Test: `npm run test:kaartversie`.
- **MIDDEL — /k: lang woord of lange link in het bericht van de therapeut maakte de pagina 2241 px breed**
  (iPhone SE; tikken kwamen niet meer aan). `.akaart .atekst` breekt nu af. Ook weg: de zin "de tekst
  hieronder is de algemene uitleg" onder een praktijkvideo zonder uitleg. OPGELOST 2026-11-07 PR #56.
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

## Opgelost door de sweep van 2026-11-07 18u (PR in deze run)
- HOOG — Printknop bij een praktijk die nog niet beveiligd is: venster sloot stil en opende Beveiligen, er werd niets
  geprint. Nu blijft het venster open met de reden, "Beveiligen" en "Print zonder QR-code". Test: `npm run test:printknop` (scenario 4). (Sanne, desktop)
- HOOG — Overzicht na een verlopen proef bleef dicht zodra het gedeelde praktijkwachtwoord uit stond. Nu ook met
  e-mail + eigen wachtwoord. Test: `npm run test:sweepoverzicht`. (Mark, desktop)
- MIDDEL — "Wis Fysiplan van dit apparaat" liet de proefcookie staan (volgende gebruiker zag naam/e-mail en kon de
  proef stoppen). Logout met `?apparaat=1` wist hem nu. Test: `npm run test:sweepoverzicht`. (Sanne, desktop)
