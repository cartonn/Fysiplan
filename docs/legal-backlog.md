# Legal-backlog (V2)

Bijgehouden door de legal-routine (elke 4 uur). Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
Alle juridische teksten zijn concept tot een jurist ze toetst; niets hier is juridisch advies.
Zakelijke en juridische beslissingen staan onder "Voor Ahmed" in `docs/mensenwerk.md`.

## Gebied → laatst gecontroleerd

| Gebied | Laatst gecontroleerd |
|---|---|
| (a) privacyverklaring (art. 13/14 AVG) | 2026-11-12 09u (na #214/#217/#222/#225: sleutel van de tweede stap, reservecodes, teller foute codes, link "wachtwoord vergeten" en inlogsessies stonden nergens: opgelost met rij #inloggen; vraaghulp stond beschreven alsof hij aan staat terwijl hij standaard uit is: opgelost, tekst volgt `VRAAGHULP_AAN`; `PRIVACY_VERSIE` 2026-11-12; Resend-rij dekt herstel- en slotmails, rechten, klachtrecht, doorgifte: klopt) · 2026-11-10 21u (Anthropic-rij beloofde "geen vrije tekst van de therapeut" en "bibliotheekteksten", maar namen van eigen oefeningen gaan mee naar vertaling en vraaghulp: opgelost; bron van teamledengegevens (art. 14 lid 2 f): opgelost; proefvelden, externe hosts in code, Cloudflare Stream (alleen bibliotheekvideo's van beheer), rechten en klachtrecht: klopt; Resend-rij wacht nog op #167) |
| (b) verwerkersovereenkomst (art. 28 AVG) + subverwerkers | 2026-11-13 01u (na de beheer- en finance-omgeving (#232 e.v.): gebruiksmeting per praktijk en login, een stand per praktijk, supportmails via Resend en agents met een taalmodel die de stand lezen (codes in plaats van namen) stonden nergens; VWO art. 2 zei "niet voor eigen analyses" terwijl Fysiplan kaarten per praktijk en login telt: opgelost met rij `#support`, Resend- en Anthropic-rij, grondslag + bezwaar, VWO art. 2, `VWO_VERSIE` 2026-11-13, `PRIVACY_VERSIE` 2026-11-13, fail-closed test `test-privacy-support.mjs`; externe hosts in code (Railway, Anthropic, Cloudflare, YouTube, Resend, Mollie apart, reservekopie via env): geen nieuwe partij; database #251 zit in de Railway-rij) · 2026-11-11 05u (art. 5 beloofde "vrije tekst van de therapeut gaat niet naar AI-diensten", maar namen van eigen oefeningen gaan mee: opgelost; art. 2 miste kaartnaam, doelactiviteit, weekdoel, werknotitie, behandelaar en contactlogboek: opgelost, fail-closed test; /privacy logboekregel zei 500, code houdt 300 + 50 per praktijk: opgelost; externe hosts in code tegen subverwerkerslijst (Railway, Anthropic, Cloudflare, YouTube, Resend, Mollie apart): geen gat; art. 28 lid 3 a-h verder ongewijzigd) · 2026-11-09 13u |
| (c) algemene voorwaarden | 2026-11-13 05u (na #243/#245/#237: art. 4 zei vast "exclusief btw" terwijl de btw-keuze in Finance ligt en de landing die al volgde: opgelost, voorwaarden gaan door `metBtwBijschrift`; de grens op lopende kaarten (100 proef, 300 per login) stond nergens: opgelost, getallen uit lib/plaatsen.js; art. 9 "wat je toevoegt gebruikt Fysiplan alleen voor jou" klopte niet voor de Ideeënbox: opgelost; `AV_VERSIE` 2026-11-13; opzeggen, proef, incasso, prijsbelofte: klopt) · 2026-11-11 21u (landing belooft "je prijs staat minstens 24 maanden vast" en "24 maanden prijsgarantie", art. 4 zei alleen "nieuwe prijs 30 dagen vooraf": opgelost, `AV_VERSIE` 2026-11-11-2; opzeggen/intrekken, mislukte incasso zonder herkansing, geen kaarten na de proef, btw exclusief, links vanaf landing/proef/app: klopt met de code) |
| (d) code tegen tekst | 2026-11-13 17u (alle `…Path`-bestanden in de datamap van server.js en alle velden die /api/kaart buiten `PATIENT_VELDEN` meestuurt, tegen /privacy: het praktijkprofiel, de sjablonen van het team, eigen oefeningen en de vaste vragen met antwoorden (#254, met de login die ze maakte) stonden alleen in "Als je stopt", zonder doel, grondslag of termijn; /privacy#patient noemde niet dat de kaart het profiel en de vragen van de praktijk toont: opgelost met rij `#inhoud` en een zin bij "Wat je therapeut erop zet", `PRIVACY_VERSIE` 2026-11-13-4, fail-closed test `test-privacy-inhoud.mjs` (nieuw bestand of nieuw kaartveld zonder plek laat de test falen); standaardvragen /k tegen de MDR-grens: verwijzen voor pijn en dosering naar de afspraak met de fysiotherapeut, geen eigen advies, klopt) · 2026-11-12 21u (na #245–#256: het leeslog per kaart (#247) stond niet in /privacy en niet in de VWO, terwijl de bouwer dat zelf meldde: opgelost met rij `#leeslog` (termijnen uit `lib/leeslog.js`) en een regel in VWO art. 5, `VWO_VERSIE` 2026-11-12-2; de meeschrijvende database (#251, met tot 100 eerdere versies per kaart) stond nergens: opgelost, de Railway-rij noemt hem alleen als `DATABASE_MEESCHRIJVEN` aan staat; eigen vragen bij oefeningen (#254) en het leeslog ontbraken in "Als je stopt" en in de uitleg van de download: opgelost; `PRIVACY_VERSIE` 2026-11-12-4; #249 (tijdelijke medialinks), #250 (vooraf vertalen, beheer) en #252/#256 (afdruk, schermen): geen nieuwe gegevens naar derden. Test `test-privacy-leeslog.mjs`) · 2026-11-12 17u (na #237 ideeënbox: titel, toelichting, stemmen per login en het besluit van Fysiplan stonden nergens in /privacy, de Anthropic-rij noemde de toelichting met `IDEEEN_AI=aan` niet, en de download op /v2/gegevens bevatte de ideeën en stemmen van de praktijk niet: opgelost, `PRIVACY_VERSIE` 2026-11-12-3; #238–#242 (beheer-tegel, oefendagen, bewaker, testomgeving, rem per e-mail): geen nieuwe gegevens naar derden) · 2026-11-12 13u (na #229 en #230: alle cookies die server.js zet tegen /privacy#opslag; `fpsessie` (inlog bij de praktijk, sinds #229 een cookie i.p.v. browseropslag) en `fpbeheer` ontbraken, tekst noemde "twee cookies": opgelost, fail-closed test; beheerlogboek (#230) stond niet in /privacy en niet in de VWO: opgelost met rij `#beheerlog` en art. 4/5; VWO art. 5 noemt nu de tweede stap; `VWO_VERSIE` 2026-11-12, `PRIVACY_VERSIE` 2026-11-12-2; bewaartermijn beheerlogboek: naar Ahmed/jurist) · 2026-11-11 09u (na #167 en #183: reservekopie buiten Railway bevat nu ook uploads, /privacy zei "behalve video's": wacht op open PR #184; Resend-rij te smal: opgelost; inleiding subverwerkers zei "het zijn Amerikaanse bedrijven", terwijl de reservekopie-partij Europees kan zijn: opgelost) · 2026-11-10 17u (patiëntroute `PATIENT_VELDEN` tegen /privacy#patient: doelactiviteit, bericht van de praktijk, weekdoel en eigen video/foto ontbraken, afspraak stond onder "zelf aantikt"; opgelost. Mails via Resend gaan ook over betaling en wachtwoord: open tot #167 gemerged is. Logs, auditlog 500, cookies, reservekopie 7 dagen, uitnodiging 7 dagen: klopt) |
| (e) rechten van betrokkenen: inzien, exporteren, wissen | 2026-11-13 13u (sweep-melding van 10u nagemeten: na "Alles wissen" bleef de gebruiksmeting in `beheer-gebruik.json` (praktijknaam + login-id's, telling per dag, foute wachtwoorden per e-mailadres) tot de snoei van de volgende dag staan, terwijl /privacy#support zegt dat het tegelijk weggaat: opgelost, `wisPraktijk` snoeit de meting meteen en server.js geeft de e-mailadressen van de logins mee; /privacy#support noemt de meting nu expliciet, `PRIVACY_VERSIE` 2026-11-13-3; test in `test-praktijkgegevens.mjs`. Nog: één login uit het team halen laat zijn "laatst gezien" tot de dagelijkse snoei staan (LAAG, zie Open)) · 2026-11-13 09u (na #260/#261: "Alles wissen" en het wissen na proef of abonnement lieten het logboek, de open zaken en "verstuurd" van de support-agent (praktijknaam, onderwerp) en de berichten van de agents in `beheer-loket.json` (naam, onderwerp, tekst) staan: opgelost met `wisPraktijk` in omgeving en loket vanuit `praktijkAllesWissen`, nieuwe logboekregels dragen `pk` (niet naar de pagina), oude regels op naam; /privacy#support en #einde zeggen nu dat het meegaat, `PRIVACY_VERSIE` 2026-11-13-2; test in `test-praktijkgegevens.mjs`. Bewust niet: beheerlogboek (verantwoording, termijn bij jurist) en verslagen van agents (alleen pseudoniem P-code, de koppeling verdwijnt met de praktijk); download op /v2/gegevens bevat de supportregels niet, zie Open) · 2026-11-11 13u (na #191 prullenbak: een praktijk kon een kaart niet meer meteen wissen, alleen na 7 dagen of door de hele praktijk te wissen, en /privacy zei daarom "buiten gebruik stellen": opgelost met Definitief verwijderen; download gaf kaarten in de prullenbak verlooptOp 1970: opgelost; VWO art. 10 was gewijzigd zonder nieuwe versie: opgelost) · 2026-11-10 01u (vertaalcache hield namen van eigen oefeningen na "Alles wissen"; download bevat geen geheimen, wel alle kaartvelden) |
| (f) cookies en lokale opslag | 2026-11-12 17u (alle `localStorage`/`sessionStorage`-sleutels in public/ na #229–#242 tegen /privacy#opslag; therapeut- en patiëntrijen kloppen, ideeënbox bewaart niets in de browser; beheer bewaart `fp-beheer-bron` (demo/echt) en in sessionStorage een ingevulde beheersleutel, de rij zei "één cookie": opgelost) · 2026-11-11 01u (alle localStorage-, sessionStorage-, Cache- en IndexedDB-sleutels van /k en /v2/app tegen /privacy#opslag; kaart weg bij de praktijk (404): `fp_beelden_<id>` (kaart-id + oefenbeelden) en de beelden zelf bleven op de telefoon, opgelost; privacylink op een anderstalige kaart zegt nu dat de pagina Nederlands is; cookies `fpproef`/`fp1` en "Wis Fysiplan van dit apparaat" (alle `fp_`/`fysiplan`-sleutels, IndexedDB, caches): klopt) · 2026-11-09 21u |
| (g) MDR en AI-verordening | 2026-11-12 05u (zoekhulp in /v2/app liet een AI-dienst oefeningen kiezen zonder dat de therapeut dat zag: opgelost; AI-vertaalde uitleg op /k zonder melding: opgelost met "automatisch vertaald"; hoofdbeeld /v2 draagt "Beeld gemaakt met AI", montages "Met AI bewerkte montage"; videolabel "klinisch gecontroleerd" alleen bij `clinicallyReviewed`; seintjesmail #212 zonder inhoud en "geen alarmknop"; sorteren op meldingen van de patiënt, geen scores; landing zonder diagnose-, doserings- of sorteerbelofte: klopt) · 2026-11-10 13u |
| (h) WGBO en KNGF-beroepsregels | 2026-11-12 05u (na #191 prullenbak: een verwijderde kaart kon niet meer naar het dossier, ook niet binnen de 7 dagen herstel, en de vragen bij Verwijderen en Definitief verwijderen zeiden dat niet: opgelost; dossiertekst, contactlogboek, bronregel, landingtekst "je dossier blijft in je EPD": klopt) · 2026-11-10 09u (verdwijndatum in overzicht, weekbrief, dossiertekst en patiëntkaart negeerde het wissen van de hele praktijk na proef of abonnement: opgelost; dossierkopie en contactlogboek ongewijzigd) |
| (i) begrijpelijkheid (B1) | 2026-11-13 17u (nieuwe rijen ideeënbox, leeslog, support gemeten: gem. 9–11 woorden per zin, langste zin 36 (support, wissen): gesplitst; /verwerkersovereenkomst, /voorwaarden, /v2/gegevens: geen zin > 33, gegevens ≤ 23; geen nieuw probleem) · 2026-11-11 17u (gemeten op /privacy, /verwerkersovereenkomst, /voorwaarden, /v2/proef, /v2/gegevens en /v2: gem. 9–12 woorden per zin, juridische pagina's geen zin > 40, patiëntdeel ≤ 30; /v2/gegevens zei "Een losse kaart wis je met Verwijderen" terwijl die sinds #191 nog 7 dagen in de prullenbak staat: opgelost; waarschuwing bij Alles wissen 35 woorden: opgelost als lijst; /v2/gegevens nu ook in `test-juridisch-b1.mjs`) · 2026-11-09 17u (alle drie pagina's gemeten: geen zin > 40 woorden, patiëntdeel ≤ 30; samenvatting voorwaarden klopte niet met art. 5; grondslag en bezwaar in gewone taal; test `test-juridisch-b1.mjs`) |

Volgende run: (g) met het agentgeheugen (#260) en de handmatige demorondes (open PR #273, pas na merge) tegen /privacy#support en de AI-melding; daarna (h) en (f). Open daarna: patiëntdeel /privacy in de kaarttalen.
De punten die op PR #41 wachtten, zijn op 2026-11-07 toch gebouwd (#69 en de juridische ronde daarna); #41 botst nu en moet worden bijgewerkt of gesloten.

## Open

- **LAAG (nieuw, 2026-11-13 13u) — rechten (e): haalt een beheerder één login uit het team, dan blijft zijn "laatst gezien"
  in `beheer-gebruik.json` tot de dagelijkse snoei staan (hooguit een dag).** /privacy#support zegt "tot je uit het team gaat".
  Kleinste stap later: bij verwijderen uit het team `gebruik.snoei` voor die ene login. Niet nu: raakt de teamroutes in server.js.

- **OPGELOST 2026-11-13 13u (legal-PR van deze run) — MIDDEL (gebruikers-sweep 2026-11-13 10u, Karin, gemeten lokaal) — rechten (e): "Alles wissen" laat de praktijknaam samen
  met de login-id's tot een dag staan in `beheer-gebruik.json`** (`gezien` met `"<praktijk>|<lid-id>"` en een blok per praktijk), terwijl
  de bevestiging zegt "Alles van je praktijk is gewist". `wisPraktijk` (lib/beheer-omgeving-routes.js r. ~341–350) ruimt `gebruik` niet op;
  `snoeiGebruik` (r. ~215) draait één keer per dag. Kleinste stap: in `wisPraktijk` meteen de gebruiksmeting van die praktijk snoeien.
  Al het andere was na het wissen weg (sessies, login, kaart, uitnodiging, logo, profiel, leeslog, ideeën, vaste vragen, support, loket).

- **LAAG (nieuw, 2026-11-13 09u) — rechten (e): de download op /v2/gegevens bevat niet wat Fysiplan-support over de praktijk
  bijhoudt** (stand, logboekregels, verstuurde supportmails). Daar is Fysiplan zelf verantwoordelijke (art. 15 AVG geldt per
  persoon, niet per praktijk); opvragen kan via contact. Kleinste stap later: in de download een blok `support` met de
  logboekregels op `pk`. Niet nu: raakt `lib/beheer-loket-routes.js`/server.js, waar open PR #273 aan werkt.

- **LAAG (nieuw, gebruikers-sweep 2026-11-13 06u, Sanne) — voorwaarden beloven wijzigingen 30 dagen vooraf te melden, de app vraagt vandaag
  akkoord op AV 2026-11-13.** /voorwaarden: "Veranderen deze voorwaarden inhoudelijk … melden we dat minstens 30 dagen vooraf." Na #268
  (btw, grens op kaarten, Ideeënbox) toont de app meteen "opnieuw akkoord". Legal: bepalen of dit een inhoudelijke wijziging is, en zo ja de
  ingangsdatum of de tekst laten kloppen (sinds #269 zien beheerders de melding ook op Vandaag).

- **MIDDEL — voorwaarden (c) / code tegen tekst (d) 2026-11-13 05u: btw, grens op kaarten en de Ideeënbox.**
  Art. 4 zei vast "exclusief btw", maar sinds #243 kiest de eigenaar in Finance kleineondernemersregeling, inclusief of
  exclusief; de landing volgde die keuze, de voorwaarden niet (bij "inclusief" een ander bedrag dan Mollie afschrijft).
  De server weigert een nieuwe kaart boven 100 lopende kaarten (proef) of 300 per login (klant) (#245); de voorwaarden
  noemden geen grens. Art. 9 beloofde dat Fysiplan wat je toevoegt alleen voor jou gebruikt, terwijl de Ideeënbox (#237)
  ideeën naar Fysiplan stuurt om het product te verbeteren. OPGELOST 2026-11-13 05u (deze PR): bijschrift via
  `metBtwBijschrift`, grens uit lib/plaatsen.js in art. 3 en 4, uitzondering Ideeënbox in art. 9, `AV_VERSIE` 2026-11-13
  (praktijken gaan opnieuw akkoord). Test `test-voorwaarden-code.mjs` (faalt zonder fix). Voor Ahmed/jurist
  (docs/mensenwerk.md): btw-keuze en versie, de getallen, rechten op ideeën. Bron: BW 6:231 e.v. (algemene voorwaarden),
  Auteurswet art. 1; https://wetten.overheid.nl/BWBR0005289.
- **MIDDEL — verwerkersovereenkomst (b) / code tegen tekst (d) 2026-11-13 01u: de hulp van Fysiplan-support stond nergens.**
  Sinds de beheer- en finance-omgeving meet de server per login de laatste login, foute wachtwoorden en de tweede stap, en per
  praktijk de actieve logins per dag (120 dagen) en de kaarten per week; daaruit komt een stand (goed/aandacht/probleem).
  Medewerkers zien die stand, de server stuurt supportmails via Resend (inloggen mislukt, tweede stap op slot, uitnodiging
  verlopen, één beheerder, stil, storing, eigen bericht van een agent), en agents met een taalmodel lezen de stand met codes.
  /privacy noemde dat niet (art. 13 lid 1 c/e, lid 2 a/b), Resend- en Anthropic-rij ook niet, en VWO art. 2 beloofde "niet
  voor eigen analyses" terwijl Fysiplan kaarten per praktijk telt (art. 28 lid 3 a, lid 10: wie zelf doelen kiest, wordt daarvoor
  verantwoordelijke). OPGELOST 2026-11-13 01u (deze PR): rij `#support` (rol, grondslag gerechtvaardigd belang, bezwaar,
  termijnen), Resend- en Anthropic-rij, "Als je stopt", VWO art. 2 met een benoemde uitzondering (`VWO_VERSIE` 2026-11-13,
  praktijken gaan opnieuw akkoord). Test `test-privacy-support.mjs`: elke mailsoort uit `MAIL_SOORTEN` en elk veld dat
  `werkSupport` aan een agent geeft moet in de tekst staan (fail-closed), en de agent krijgt geen namen of adressen.
  Voor Ahmed/jurist (docs/mensenwerk.md): belangenafweging, bezwaar per praktijk, en of tellen in de VWO mag.
  Bron: AVG art. 6 lid 1 f, 13, 21, 28 lid 3 a en lid 10; https://eur-lex.europa.eu/eli/reg/2016/679/oj.
- **MIDDEL — rechten (e) 2026-11-13 01u — OPGELOST 2026-11-13 09u (legal-PR van deze run): "Alles wissen" en het
  wissen na proef of abonnement laten in beheer de naam van de praktijk en verstuurde supportmails staan.**
  `praktijkAllesWissen` (server.js) raakt `beheer-loket.json` (concepten met `pk`, praktijknaam, onderwerp en tekst van de
  mail; laatste 100) en het logboek van de support-agent (`echt.agent.logboek`, praktijknaam en onderwerp; laatste 200;
  `verstuurd`/`open` met `pk` in de sleutel) niet aan. De gebruiksmeting wordt wel dagelijks gesnoeid. /privacy zegt dit nu
  eerlijk ("tot nieuwere ze wegschuiven"), maar "wissen we alles van je praktijk" (art. 17) is zo niet helemaal waar.
  Voorstel zodra #260/#261 gemerged zijn: een `wisPraktijk(pk)` in de omgeving en het loket (zoals `ideeenbox.wisPraktijk`),
  vanuit `praktijkAllesWissen`; `pk` meeschrijven in nieuwe logboekregels; daarna de zin in /privacy#support en #einde weg.
- **MIDDEL — code tegen tekst (d) 2026-11-12 21u: het leeslog (#247) en de meeschrijvende database (#251) stonden niet in
  /privacy en niet in de verwerkersovereenkomst.** Het leeslog legt per kaart vast welke login haar opende of bewaarde
  (persoonsgegevens van medewerkers van de praktijk, en het raakt de patiëntkaart); de bouwer schreef zelf in mensenwerk
  dat de juridische teksten het nog niet noemden. De database houdt een kopie van alle gegevens plus eerdere versies van
  een kaart (hooguit 100). OPGELOST 2026-11-12 21u (deze PR): rij `#leeslog` in /privacy (wat, wie het ziet, termijnen uit de
  code), VWO art. 5 (`VWO_VERSIE` 2026-11-12-2, praktijken gaan opnieuw akkoord), Railway-rij noemt de database alleen
  als hij aan staat, "Als je stopt" en de uitleg van de download noemen leeslog en eigen vragen. Test
  `test-privacy-leeslog.mjs` (faalt zonder fix). Open voor Ahmed/jurist: bewaartermijn van het leeslog (twee jaar,
  NEN 7513 gaat uit van langer) staat al in docs/mensenwerk.md. Bron: AVG art. 13 lid 1 c/e, lid 2 a, art. 28 lid 3, art. 32;
  https://eur-lex.europa.eu/eli/reg/2016/679/oj.
- **MIDDEL — code tegen tekst (d) 2026-11-12 17u: de ideeënbox (#237) stond niet in /privacy en niet in de download.**
  Therapeuten plaatsen ideeën (titel, toelichting) en stemmen; de server koppelt die aan login en praktijk, alle gebruikers
  lezen de ideeën (zonder naam), en met `IDEEEN_AI=aan` gaan titels en toelichtingen naar Anthropic. /privacy noemde niets
  daarvan (art. 13 lid 1 c/e, lid 2 a AVG); de code zei zelf "de privacytekst moet dat eerst noemen". De download op
  /v2/gegevens (art. 15/20) miste de ideeën en stemmen van de praktijk. Hier is Fysiplan verwerkingsverantwoordelijke, niet
  verwerker; daarom niet in de verwerkersovereenkomst. OPGELOST 2026-11-12 17u (deze PR): rij `#ideeen` (wat, wie het ziet,
  rol, grondslag gerechtvaardigd belang, termijnen), "Als je stopt" en de grondslagalinea; Anthropic-rij noemt de ideeënbox
  alleen als `IDEEEN_AI` aan staat (`<!--ideeenai-->`); download bevat `ideeenbox.ingediend` en `.stemmen` (alleen eigen
  praktijk), tekst op /v2/gegevens zegt dat. Tests: `test-privacy-inloggen.mjs` en `test-praktijkgegevens.mjs` (falen zonder
  fix). Open voor Ahmed/jurist (docs/mensenwerk.md): belangenafweging en de termijn van besloten ideeën. Bron: AVG art. 6 lid 1 f,
  13, 15, 20; https://eur-lex.europa.eu/eli/reg/2016/679/oj.
- **LAAG — cookies en opslag (f) 2026-11-12 17u: de beheerrij in /privacy#opslag zei "één cookie", maar de beheeromgeving
  bewaart ook `fp-beheer-bron` (localStorage) en een ingevulde beheersleutel (sessionStorage `fysiplan-beheersleutel`).**
  Alleen medewerkers van Fysiplan. OPGELOST 2026-11-12 17u (deze PR), test in `test-privacy-inloggen.mjs`.

- **TER INFO — logboeken en cookies (f), 2026-11-12 (platformreview, test:beheeraccounts): beheer heeft persoonlijke accounts en een
  beheerlogboek.** Geen tekst aangepast; graag meewegen bij de volgende controle van /privacy en de verwerkersovereenkomst.
  Wat er nieuw wordt bewaard: per beheerder een e-mailadres, naam, wachtwoordhash en het geheim van de tweede stap
  (`beheer-accounts.json`); per beheeractie een regel met wie, wat, wanneer, het antwoord en een gemaskeerd IP-adres
  (`beheer-log.jsonl`, zonder einddatum, mee in de reservekopie). In het logboek staan geen patiëntnamen: bij de herstelmail de
  praktijk, de reden die beheer opgaf en het gemaskeerde adres; bij inzage van een praktijk zonder account de praktijknaam. De
  beheerders zijn medewerkers van Fysiplan, geen klanten. De cookie `__Host-fpbeheer` (twaalf uur, alleen voor de server leesbaar)
  staat alleen in de browser van een beheerder die inlogt, niet bij praktijken of patiënten. Vragen voor de jurist: hoort het
  beheerlogboek in het verwerkingsregister en in de verwerkersovereenkomst (toegang van Fysiplan tot gegevens van een praktijk
  wordt nu met naam vastgelegd), en welke bewaartermijn past erbij? Nu heeft het geen einddatum.
  OPGELOST 2026-11-12 13u (deze PR), tekstdeel: /privacy rij `#beheerlog` (wat, waarom, "nog geen vaste einddatum"), VWO art. 4
  (eigen beheerlogin met tweede stap, toegang wordt vastgelegd, praktijk kan het opvragen) en art. 5. De bewaartermijn is niet
  gebouwd: het logboek is bewust alleen-bijschrijven (`test-beheer-accounts.mjs` borgt dat), dus een termijn is een keuze voor
  Ahmed/jurist, zie docs/mensenwerk.md. Bron: AVG art. 5 lid 1 e, art. 28 lid 3 b en h, art. 32.
- **LAAG — code tegen tekst (d) en cookies (f), 2026-11-12 (platformreview, test:sessiecookie): /privacy#opslag klopt niet meer
  met waar de inlog van de praktijk staat.** De rij "Apparaat van de therapeut (app)" zegt "Twee cookies" en noemt "je inlog bij
  de praktijk" bij wat de browser bewaart. Sinds deze wijziging staat die inlog niet meer in de browseropslag maar in een derde
  cookie, alleen voor de server leesbaar: `__Host-fpsessie` (lokaal `fpsessie`), 30 dagen of tot je uitlogt; "Wis Fysiplan van dit
  apparaat" maakt hem leeg. Het is een functionele cookie (inloggen), dus geen toestemming nodig, wel de uitleg. De tekst is
  bewust niet in deze wijziging aangepast: juridische teksten wijzigt de bouwer van de reviewlijst niet zelf.
  OPGELOST 2026-11-12 13u (deze PR): de rij noemt drie cookies met `fpsessie` (hooguit `SESSIE_MS` dagen, of uitloggen / "Wis
  Fysiplan van dit apparaat"); de inlog staat niet meer onder browseropslag; nieuwe rij `#opslag-beheer` voor `fpbeheer` (12 uur).
  Test `scripts/test-privacy-inloggen.mjs`: elke cookienaam die server.js zet, moet in /privacy#opslag staan (fail-closed).

- **MIDDEL — MDR/AI-verordening (g) 2026-11-12 05u: de zoekhulp en de vertaalde uitleg zeiden niet dat ze automatisch zijn.**
  (1) De zoekhulp in /v2/app stuurt lichaamsdeel en doel naar een AI-dienst, die 4 tot 8 oefeningen kiest en per oefening
  een korte zin schrijft. Het venster zei alleen "De zoekhulp kent geen patiënt en geeft geen dosering"; nergens dat een
  AI-systeem de keuze maakt (AI-verordening art. 50 lid 1, van kracht sinds 2 augustus 2026) of dat die keuze ernaast kan
  zitten. Voor de MDR-grens is belangrijk dat de therapeut ziet dat hij zelf beoordeelt (MDCG 2019-11: geen automatische
  behandelkeuze). (2) Op /k vertaalt de server de uitleg van bibliotheekoefeningen automatisch naar de kaarttaal; de
  patiënt zag dat niet. Een fout in een vertaalde uitvoeringsinstructie kan iemand verkeerd laten oefenen. Er was wel een
  melding als de uitleg níet vertaald is, maar niet als hij dat wel is.
  OPGELOST 2026-11-12 (deze PR): zoekhulpvenster "De zoekhulp werkt met AI … kijk zelf of een oefening past" en
  "Gekozen met AI" boven de uitkomst (alleen v2; v1 toont de knop niet); onder vertaalde uitleg op /k in alle 8 talen
  "Automatisch vertaald uit het Nederlands. Twijfel je? Vraag het je fysiotherapeut." (zonder het woord AI: de wet vraagt
  hier geen AI-melding). Test `scripts/test-ai-melding-zoekhulp-vertaling.mjs` (in test:privacy en CI; faalt zonder fix).
  Bron: Verordening (EU) 2024/1689 art. 50 lid 1 en art. 113; MDCG 2019-11 (stap 3: software die zelf een behandelkeuze
  maakt). Jurist: laten bevestigen dat dit voor art. 50 volstaat.
- **LAAG — privacyverklaring (a)/(d) 2026-11-12 05u: vraaghulp staat standaard uit, /privacy beschrijft hem alsof hij aan staat.**
  Sinds #206 werkt de vraaghulp alleen met `VRAAGHULP=aan`; /privacy#patient en de Anthropic-rij beschrijven hem zonder
  voorbehoud. Te ruim is minder erg dan te smal, maar het klopt niet. Voorstel: regel laten afhangen van `VRAAGHULP_AAN`
  ("staat nu uit") net als `BETAAL_RIJ_HTML`. Niet in deze PR (één gebied per run). Bron: AVG art. 12 lid 1, art. 13.
  OPGELOST 2026-11-12 (deze PR): patiëntregel staat tussen `<!--vraaghulp-->`-markeringen en verdwijnt als hij uit staat;
  de Anthropic-rij zegt dan "(staat nu uit)". Test `scripts/test-privacy-inloggen.mjs` (beide standen, in test:privacy en CI).
- **MIDDEL — privacyverklaring (a) 2026-11-12 09u: gegevens van de eigen login stonden niet in /privacy.**
  Sinds #214, #217, #222 en #225 bewaart de server per login de sleutel van de tweede stap (leesbaar, zoals de code-app hem
  ook heeft), acht reservecodes als hash, een teller van foute codes (24 uur), een link voor een nieuw wachtwoord als hash
  (een uur, of 48 uur via beheer; eenmalig) en de inlogsessies als hash van het token (30 dagen). De tabel "Voor praktijken"
  noemde alleen naam, e-mail, rol, wachtwoordhash en uitnodiging. Art. 13 lid 1 c en lid 2 a AVG vragen welke gegevens,
  waarvoor en hoe lang. OPGELOST 2026-11-12 (deze PR): rij `#inloggen` met doel (art. 32 AVG) en termijnen; de sessieduur komt
  uit `SESSIE_MS`. Download op /v2/gegevens bevat het geheim terecht niet (alleen aan/uit, sinds, aantal reservecodes).
  Bron: AVG art. 13; https://eur-lex.europa.eu/eli/reg/2016/679/oj.
- **LAAG — landing (voor de gebruikers-sweep): aria-label van het hoofdbeeld op /v2 leest voor "De dame in squathouding
  uit het originele Active Tech-voorbeeld".** Interne ontwerptaal voor schermlezers; niet aangeraakt wegens open PR #204 op v2.html.

- **MIDDEL — WGBO (h) 2026-11-12 05u: een kaart in de prullenbak kon niet meer naar het dossier.**
  Wat de patiënt via de kaart meldt (seintjes, "te zwaar", pijnscores, PSK, berichten van de praktijk) staat alleen in
  Fysiplan; de praktijk hoort dat in het eigen dossier te zetten (WGBO art. 7:454 BW, KNGF-richtlijn verslaglegging).
  Sinds #191 zet Verwijderen een kaart 7 dagen in de prullenbak, maar `/api/praktijk/kaart` weigerde verwijderde
  kaarten, dus "Kopieer samenvatting voor dossier" kon niet meer. De vraag bij Verwijderen zei niets over het dossier,
  en die bij Definitief verwijderen ging ervan uit dat het al in het dossier stond.
  OPGELOST 2026-11-12 (deze PR): `GET /api/praktijk/kaart?prullenbak=1` geeft een herstelbare kaart terug, alleen aan
  maker of beheerder (zelfde regel als herstellen); knop "Kopieer voor dossier" in de prullenbak; de dossiertekst zegt
  "Status: kaart verwijderd, de patiëntlink werkt niet meer"; beide vragen noemen het dossier. Patiëntlink en gewone
  route blijven dicht. Test in `scripts/test-kaart-prullenbak.mjs` (faalt zonder fix: 404).
  Bron: WGBO art. 7:454 BW (dossierplicht), AVG art. 5 lid 1 d (juistheid).

- **MIDDEL — voorwaarden (c) 2026-11-11 21u: de prijsbelofte van de landing stond niet in de voorwaarden.**
  /v2 (sinds de Active Tech-landing #197) zegt "je prijs staat minstens 24 maanden vast" en "De prijsbelofte", en bij de
  oprichters "met 24 maanden prijsgarantie". Art. 4 van de voorwaarden zei alleen "een nieuwe prijs melden we minstens 30
  dagen vooraf", en de samenvatting zegt "de artikelen hieronder gelden". Een praktijk leest dan twee verschillende
  afspraken; onduidelijke voorwaarden worden uitgelegd in het nadeel van wie ze opstelde (art. 6:238 lid 2 BW) en
  reclame die niet klopt met het contract is misleidend (art. 6:194 BW). De belofte staat al publiek, dus Fysiplan is er
  waarschijnlijk toch aan gebonden; de voorwaarden zeggen het nu ook.
  OPGELOST 2026-11-11 (deze PR): art. 4 "Prijsbelofte" (24 maanden vanaf de start van het abonnement) en "Prijswijziging
  na die 24 maanden" (30 dagen vooraf), regel in In het kort, `AV_VERSIE` 2026-11-11-2 met regel in `AKKOORD_WIJZIGINGEN`.
  Test in `scripts/test-juridisch-b1.mjs`: elke "minstens N maanden vast" of "N maanden prijsgarantie" op /v2 moet in
  art. 4 en de samenvatting staan (faalt zonder fix). Voor Ahmed: bevestigen of terugdraaien, zie `docs/mensenwerk.md`.
  Nog niet in de voorwaarden (LAAG): de oprichtersbelofte "60 dagen begeleide start, gratis import van logo en sjablonen".

- **MIDDEL — begrijpelijkheid (i) / rechten (e) 2026-11-11 17u: /v2/gegevens beschreef verwijderen van een losse kaart verkeerd.**
  De pagina voor inzage, meenemen en wissen zei "Een losse kaart wis je in de app met Verwijderen". Sinds #191 staat die
  kaart dan nog 7 dagen herstelbaar in de prullenbak; meteen wissen (art. 17, bijvoorbeeld op verzoek van de patiënt) kan
  alleen met "Definitief verwijderen" (#194). Ook stond de waarschuwing bij Alles wissen in één zin van 35 woorden.
  OPGELOST 2026-11-11 (deze PR): tekst noemt maker/beheerder, de prullenbak met termijn uit `KAART_HERSTEL_MS` en
  "Definitief verwijderen"; Alles wissen als korte lijst, met "ook die in de prullenbak" (klopt: `praktijkAllesWissen`
  wist heel `kaarten[pk]`); VWO art. 8 noemt de knop ook (redactioneel, art. 10 had het al, geen nieuwe versie).
  Test: `/v2/gegevens` in `scripts/test-juridisch-b1.mjs` (zinnen ≤ 30 woorden, tekst tegen code; faalt zonder fix).
  Bron: AVG art. 12 lid 1 (beknopt, begrijpelijk, duidelijke taal) en art. 17.
- **LAAG — landing (voor de gebruikers-sweep, niet zelf gebouwd wegens open PR #196 op v2.html):** typfout "exporteert lle
  kaarten" in de FAQ van /v2, en een zin met `fysiplan.nl/v2/app#client={naam}` zonder leesteken ervoor.

- **MIDDEL — rechten van betrokkenen (e) 2026-11-11 13u: na de prullenbak (#191) kon een praktijk een kaart niet meer meteen wissen.**
  Sinds #191 gaat verwijderen eerst 7 dagen naar de prullenbak; er was geen knop om een kaart daaruit definitief te wissen.
  Vraagt een patiënt om wissen (AVG art. 17, "zonder onredelijke vertraging") of is een kaart met verkeerde gegevens gedeeld,
  dan kon de praktijk alleen wachten of de hele praktijk wissen. /privacy#rechten was daarom afgezwakt tot "buiten gebruik
  stellen". Daarnaast (LAAG): de download op /v2/gegevens gaf kaarten in de prullenbak `verlooptOp` 1970-01-01, en VWO
  art. 10 was inhoudelijk gewijzigd zonder nieuwe `VWO_VERSIE` (beheerders die vandaag akkoord gaven, zagen het niet).
  OPGELOST 2026-11-11 (deze PR): `POST /api/kaarten/definitief` (alleen kaarten in de prullenbak, zelfde rechten als
  verwijderen: maker of beheerder; kaart en opnames meteen weg, regel in Activiteit zonder kaartnaam), knop in de
  prullenbak, /privacy en VWO art. 10 noemen het, `VWO_VERSIE` 2026-11-11-2 met regel in `AKKOORD_WIJZIGINGEN`; download
  zet `inPrullenbak` en de echte verdwijndatum. Test in `scripts/test-kaart-prullenbak.mjs` (faalt zonder fix).
  Bron: AVG art. 12 lid 3, art. 17 lid 1, art. 28 lid 3 e (verwerker helpt bij verzoeken van betrokkenen).

- **LAAG — code tegen tekst (d) 2026-11-11 09u: reservekopie buiten Railway nam sinds #183 ook video's en foto's mee.**
  /privacy#reservekopie zei "behalve video's, foto's en logo's". #184 is gesloten; de rij noemt nu "inclusief video's,
  foto's en logo's" (via #186/#187, gecontroleerd 2026-11-11 13u): dat deel OPGELOST. Nog open: (1) de rij verdwijnt helemaal als de kopie aan staat zonder
  `BACKUP_LEVERANCIER` (nu gezet op Scaleway, dus geen gat zolang dat zo blijft; fail-closed maken: dan de host van de
  opslag noemen); (2) een zin dat er een patiënt op een eigen video of opname kan staan. Bron: AVG art. 13 lid 1 e, art. 28 lid 2.
- **LAAG — Resend-rij (d) uit 2026-11-10 17u: OPGELOST 2026-11-11 (deze PR).** Rij noemt nu proef, inloggen/wachtwoord,
  uitnodigingen, opzeggen, wismelding en maandbetaling, met praktijknaam en bedrag. Test in `scripts/test-privacy.mjs`
  leidt de mailsoorten af uit de onderwerpen van `stuurMail`/`proefMail` in server.js (fail-closed).

- **MIDDEL — verwerkersovereenkomst (b) 2026-11-11 05u: art. 5 en art. 2 klopten niet met de code.**
  Art. 5 (beveiliging) beloofde de praktijk "vrije tekst van de therapeut gaat niet naar AI-diensten". Sinds de
  privacyverklaring is rechtgezet (#173) weten we dat `/api/kaart/vertaal` en `/api/kaart/vraag` de namen van eigen
  oefeningen meesturen. Een contractuele belofte die niet klopt, is erger dan een onvolledige privacytekst.
  Art. 2 (soort gegevens, art. 28 lid 3 AVG) noemde alleen "roepnaam", terwijl de server het interne kaartlabel
  ("Jan K."), doelactiviteit, weekdoel, werknotitie, behandelaar en het contactlogboek bewaart.
  Daarnaast (LAAG, code tegen tekst): /privacy#praktijk zei bij het logboek "de laatste 500 gebeurtenissen", maar
  sinds #175 houdt de server per praktijk 300 gewone regels en 50 mislukte pogingen.
  OPGELOST 2026-11-11 (deze PR): art. 2 en 5 bijgewerkt, `VWO_VERSIE` 2026-11-11 met een regel in
  `AKKOORD_WIJZIGINGEN` (beheerders gaan één keer opnieuw akkoord); /privacy noemt de plafonds uit de code
  (`__AUDIT_PER__`/`__AUDIT_RUIS__`). Test in `scripts/test-privacy.mjs`: elk kaartveld uit `PATIENT_VELDEN` én
  elke `kaart.<veld> =` in server.js moet in art. 2 staan (fail-closed; faalt zonder fix op `pskDoel`).
  Bron: AVG art. 28 lid 3 (onderwerp, soort persoonsgegevens), art. 32; art. 13 lid 2 a (bewaartermijn).

- **OPGELOST 2026-11-10 22u (gebruikers-sweep, test:zwaaroffline) — MIDDEL lokale opslag (f): "Wis deze kaart van mijn
  telefoon" liet het kaart-id terugkomen.** Na wissen schreef `pagehide` → `bewaarBeeldenLijst()` opnieuw
  `fp_beelden_<id>` in localStorage (Truus, iPhone SE); dat id is de toegang tot de kaart. Nu schrijft de kaart na wissen niets meer.
- **MIDDEL — cookies en lokale opslag (f) 2026-11-11 01u: een gewiste of verlopen kaart liet sporen op de telefoon.**
  Opent de patiënt een kaart die de praktijk gewist heeft (of die verlopen is), dan haalde `vergeetKaartHier` (kaart.html)
  de vinkjes weg en de service worker de kaart uit de cache. Maar `fp_beelden_<id>` bleef staan: het kaart-id plus de lijst
  van oefenbeelden van die patiënt. Ook de oefenbeelden zelf bleven in de offline-cache. /privacy#opslag belooft dat de
  offline kopie dan weggaat; op een gedeelde telefoon verraden de beelden welke oefeningen iemand deed.
  OPGELOST 2026-11-11 (deze PR): bij "niet gevonden" gaan `fp_beelden_<id>` en de beelden van die kaart weg, behalve wat
  een andere kaart op de telefoon nog gebruikt (zelfde regel als "Wis deze kaart"); daarna schrijft de pagina de lijst
  niet opnieuw. /privacy#opslag noemt de plaatjes erbij. Test in `scripts/test-kaart-weg.mjs` (faalt zonder fix).
  Bron: AVG art. 5 lid 1 c en e (minimale gegevens, opslagbeperking); Telecommunicatiewet art. 11.7a (functionele opslag).
- **OPGELOST 2026-11-11 (deze PR) — LAAG (gebruikers-sweep 2026-11-10 22u, Jayden) — Privacy-link op een Engelse kaart opent een alleen-Nederlandse pagina
  zonder melding** (/privacy en /privacy?taal=en geven lang="nl"). Hoort bij het bekende punt "patiëntdeel /privacy in de
  kaarttalen"; tot die tijd minstens "(in Dutch)" bij de link (kaart.html r. ~708 en ~847). Nu: de link zegt in alle
  8 kaarttalen dat de pagina Nederlands is ("Privacy (in Dutch)"); test in `scripts/test-privacy.mjs`. Een vertaald
  patiëntdeel van /privacy blijft open.

- **LAAG — privacyverklaring (a) 2026-11-10 21u: Anthropic-rij klopte niet met wat er naar de AI-dienst gaat.**
  /privacy#subverwerkers zei bij Anthropic "het vertalen van bibliotheekteksten" en "geen namen, scores of vrije tekst
  van de therapeut". Maar `/api/kaart/vertaal` en `/api/kaart/vraag` (server.js, filter `PRAKTIJK_OEF_ID`) sturen ook de
  namen van eigen oefeningen van de praktijk mee: vrije tekst van de therapeut, die een patiënt kan aanduiden. Vertaalde
  namen blijven in `vertalingen.json` tot de oefening of praktijk gewist wordt. Daarnaast noemde de teamrij niet waar
  naam en e-mail van een teamlid vandaan komen (de beheerder vult ze in), terwijl art. 14 lid 2 f AVG de bron vraagt.
  OPGELOST 2026-11-10 (deze PR): rij beschrijft nu wat echt meegaat, met de waarschuwing geen patiëntnaam in een eigen
  oefening te zetten; teamrij noemt de bron. Test in `scripts/test-privacy.mjs` (nagebootste AI-dienst vertaalt een kaart
  met een eigen oefening; faalt zonder fix). Bron: AVG art. 13 lid 1 e, art. 14 lid 2 f.

- **LAAG — code tegen tekst (d) 2026-11-10 17u: Resend-rij op /privacy#subverwerkers is te smal.**
  De rij zegt "e-mail rond de proef en uitnodigingen; e-mailadres en naam". Fysiplan mailt via Resend ook de
  wachtwoordlinks voor teamleden (server.js `stuurMail`), de opzegbevestiging en, met `MOLLIE_INCASSO=aan`, de
  aankondiging en uitkomst van de maandbetaling met het bedrag (`proefMail` in de incassostap). Geen patiëntgegevens.
  Niet nu aangepast: open PR #167 voegt een regel direct onder die rij toe (botsing). Daarna: rij verbreden naar
  "proef, inloggen, uitnodigingen en betaling" en "bedrag van de maandbetaling" bij de gegevens. Bron: AVG art. 13 lid 1 e.

- **LAAG — code tegen tekst (d) 2026-11-10 17u: /privacy#patient noemde niet alles wat de kaart toont.**
  `/api/kaart` (server.js `PATIENT_VELDEN`) geeft de patiënt ook de doelactiviteit (PSK) met de eigen score, het
  bericht/antwoord van de praktijk, het weekdoel (dagen per week) en eigen video's of foto's van de praktijk (waar de
  patiënt soms zelf op staat). Die ontbraken in "Voor patiënten"; de afspraak stond onder "Wat je zelf aantikt", maar
  die zet de praktijk (`/api/kaart/afspraak` eist de praktijksessie). De verwerkersovereenkomst noemde ze wel.
  OPGELOST 2026-11-10 (deze PR): beide punten in /privacy#patient bijgewerkt; test in `scripts/test-privacy.mjs`
  leest `PATIENT_VELDEN` en faalt als een veld niet uitgelegd is (fail-closed, faalt zonder fix op `vids`).
  Gecontroleerd zonder gat: foutlog zonder IP/kaartlink (`logPad`, mailfout alleen statuscode), auditlog max 500 met
  gemaskeerd IP en weg bij praktijk wissen, `fp1` 30 dagen, `fpproef` proef + bewaartermijn, uitnodiging 7 dagen,
  dagtellingen 120 dagen, reservekopie 7 mappen. Bron: AVG art. 13 lid 1 en art. 14 lid 1 d (categorieën gegevens).

- **MIDDEL — MDR/AI-verordening (g) 2026-11-10 13u: de voorleesstem is met AI gemaakt, maar dat stond er niet altijd bij.**
  De stem op /k ("Luister naar deze oefening", "Luister naar uitleg" bovenaan en in de vergroting) is vooraf gemaakt met
  een AI-stemdienst (HeyGen, `public/audio/noor/manifest.json`). Alleen naast een AI-video zei de kaart "De stem en video
  zijn met AI gemaakt". Bij een oefening zonder AI-video stond er "De stem legt de algemene uitvoering uit", zonder AI;
  en de knop bovenaan en in de vergroting speelden de stem af terwijl de zin per oefening niet in beeld was (de nieuwe
  kaart verbergt die in het overzicht). Een natuurlijk klinkende stem kan voor een echte opname van een mens doorgaan.
  OPGELOST 2026-11-10 (deze PR): de zin bij de knop per oefening zegt nu altijd "De stem is met AI gemaakt"; bovenaan en
  in de vergroting staat een korte regel zolang de stem speelt. De foutmelding noemt "Noor" niet meer als persoon.
  Andere talen gebruiken de stem van het toestel (geen AI-melding nodig). Test `scripts/test-stem-ai-melding.mjs` (in
  test:privacy en CI, faalt zonder fix). Bron: AI-verordening (EU) 2024/1689 art. 50 lid 4 en art. 3 punt 60 (deepfake),
  van toepassing sinds 2 augustus 2026; consistent met Ahmeds keuze van 10-11 (één zin "met AI gemaakt" bij de video).

- **MIDDEL — WGBO + code tegen tekst (2026-11-10 09u): de verdwijndatum klopte niet als de hele praktijk gewist wordt.**
  Fysiplan is geen dossier; de praktijk kopieert naar het EPD vóór een kaart verdwijnt. Het overzicht ("verloopt over
  N dagen"), de weekbrief, de dossiertekst en de patiëntkaart ("Mijn gegevens") toonden alleen de bewaartermijn van de
  kaart zelf (90 dagen na de laatste activiteit). Na een proef zonder abonnement of een opgezegd abonnement wist
  Fysiplan 30 dagen later de hele praktijk, ook die kaarten. Een praktijk zag dan "nog 89 dagen" terwijl alles over
  20 dagen weg was, en kreeg geen waarschuwing om naar het dossier te kopiëren. OPGELOST 2026-11-10 (deze PR):
  `verdwijntOp` (server.js) neemt de vroegste van kaartdatum en praktijkwisdatum (`praktijkWisOp`). Het wissen zelf
  verandert niet. Test `scripts/test-verdwijndatum-praktijk.mjs` (in test:privacy en CI, faalt zonder fix: 89 ≠ 20).
  Bron: WGBO art. 7:454 BW (dossierplicht bij de hulpverlener), AVG art. 28 lid 3 g. Open (LAAG): een mail aan de
  praktijk vóór het wissen staat als keuze voor Ahmed in docs/mensenwerk.md.

- **MIDDEL — voorwaarden (c) + code tegen tekst (d), van de praktijk-routine 2026-11-10: maandincasso gebouwd, tekst nog niet.**
  Met `MOLLIE_INCASSO=aan` schrijft Fysiplan na maand 1 elke maand af op de machtiging (recurring), met een aankondiging
  per mail 5 dagen vooraf (`INCASSO_VOORAF_DAGEN`, lib/mollie.js); mislukt = geen nieuwe poging, Ahmed neemt contact op.
  Art. 4 van de voorwaarden ("betaalwijze, factuurmoment en betaaltermijn na de eerste maand") moet dit beschrijven,
  inclusief de kortere aankondigingstermijn dan de SEPA-standaard van 14 dagen. Staat uit tot Ahmed de variabele zet.
  OPGELOST 2026-11-10 (deze PR): art. 4 beschrijft de incasso, de termijn komt uit `INCASSO_VOORAF_DAGEN`, en zolang
  het uit staat "spreken we de betaling met je af, er wordt niets afgeschreven". Test in `scripts/test-privacy.mjs`
  (faalt zonder fix). Bron: SEPA Core Rulebook (EPC), vooraankondiging 14 dagen tenzij anders afgesproken.

- **LAAG — rechten (e) 2026-11-10: vertaalde namen van eigen oefeningen bleven na wissen in de vertaalcache.**
  `vertalingen.json` bewaart per taal de vertaling van namen van eigen praktijkoefeningen. "Alles wissen" op
  /v2/gegevens, het automatisch wissen na proef/abonnement (`praktijkAllesWissen`) en het verwijderen van een eigen
  oefening lieten die staan tot `vertaalCacheOpschonen` bij de volgende herstart. Een naam kan een patiënt aanduiden.
  OPGELOST 2026-11-10 (deze PR): beide routes ruimen de cache direct op; test in `scripts/test-praktijkgegevens.mjs`
  (faalt zonder fix). Bron: AVG art. 17 lid 1 en art. 28 lid 3 g.
- **LAAG — /privacy#rechten noemde alleen het praktijkwachtwoord voor /v2/gegevens (2026-11-10).** Sinds eigen logins
  kan de beheerder het gedeelde wachtwoord uitzetten; dan leek downloaden/wissen onmogelijk. OPGELOST 2026-11-10 (deze
  PR), `PRIVACY_VERSIE` 2026-11-10. Gecontroleerd zonder gat: de download bevat geen hashes, tokens of
  uitnodigingscodes; teamleden staan erin zonder wachtwoord. Open (LAAG, ongewijzigd): media als pad, geen per-kaart
  JSON-export (de praktijk filtert de volledige download of gebruikt "Kopieer voor dossier").

- **LAAG (doorgezet door de gebruikers-sweep 2026-11-09 18u) — "Wis deze kaart van mijn telefoon" laat avatarbeelden van precies
  deze oefeningen en `oefeningen.json` in Cache Storage (`fysiplan-kaart-v2`)**; op een gedeelde telefoon verraadt dat welke
  oefeningen iemand doet. kaart.html r. ~1794 wist alleen URL's met het kaart-id. Toets tegen de tekst op /privacy (Truus, iPhone SE).
  OPGELOST 2026-11-09 PR #142: `wisOfflineKopie` wist de hele offline-cache als er geen andere kaart op de telefoon
  staat; staan er wel andere kaarten, dan gaan de gegevens van deze kaart en alle beelden die deze kaart laadde weg.
  /privacy#opslag noemt de plaatjes nu. Test in `scripts/test-kaart-wis-telefoon.mjs` (faalt zonder fix).
  Rest (LAAG): wist de praktijk de kaart (404), dan haalt de service worker alleen kaartgegevens weg, niet de beelden.

- **MIDDEL — begrijpelijkheid + code tegen tekst (2026-11-09 17u): samenvatting voorwaarden beloofde iets anders dan art. 5.**
  "In het kort" zei "Je kunt maandelijks opzeggen. Daarna wissen we je kaarten binnen 30 dagen." Art. 5 en de code
  (`abonnementEindeStap`, lib/mollie.js) wissen pas 30 dagen na het einde van de betaalde maand, en dan alles van de
  praktijk, niet alleen de kaarten; het wissen na een proef zonder abonnement (art. 3) stond er niet in.
  OPGELOST 2026-11-09 (deze PR): samenvatting volgt art. 3 en 5; de termijn komt nu overal uit `NA_EINDE_WISSEN_DAGEN`
  (`__NA_EINDE__`) in plaats van een vaste 30 in de tekst (VWO kort, VWO art. 10, voorwaarden art. 5).
  Samenvatting is niet bindend ("De artikelen hieronder gelden"), dus geen nieuwe `AV_VERSIE` en geen nieuw akkoord.
- **LAAG — begrijpelijkheid (B1) (2026-11-09 17u).** Gemeten op de gerenderde pagina's (gem. 8–10 woorden per zin, goed).
  Te lang: opslag op de patiënttelefoon (61 woorden, nu een lijst), datalekartikel VWO art. 9 (41, nu korte zinnen met
  gewone woorden in plaats van "aard, omvang"), "Wat Fysiplan niet doet" (32). "Grondslag" en "gerechtvaardigd belang"
  krijgen nu uitleg in gewone taal; de privacy-samenvatting heeft een regel voor de therapeut (wissen als je stopt).
  OPGELOST 2026-11-09 (deze PR). Test `scripts/test-juridisch-b1.mjs` (in test:privacy en CI): geen zin > 40 woorden,
  patiëntdeel ≤ 30, samenvattingen kloppen met de constanten in de code. Rest: VWO art. 2 (opsomming van 39 woorden)
  mag later een lijst worden; patiëntdeel /privacy alleen in het Nederlands (stond al open).

- **HOOG — code tegen tekst + verwerkersovereenkomst (2026-11-09 13u): kaarten van een proef zonder abonnement bleven onbeperkt staan.**
  VWO art. 10 beloofde "stopt de praktijk, dan binnen 30 dagen gewist", maar na een proef zonder abonnement bleef het
  account staan zolang er een gedeelde kaart was, en een kaart die de patiënt af en toe opent (`bekeken` telt als
  activiteit) verloopt nooit. Gevolg: patiëntgegevens en het account zonder einddatum, ook zonder lopende overeenkomst
  (art. 5 lid 1e en art. 28 lid 3g AVG). OPGELOST 2026-11-09 (deze PR): `proefRonde` wist bij het verlopen van de
  aanmelding (90 dagen na de proef, alleen als de aanmelding zelf zegt "geen klant") via `praktijkAllesWissen` de hele
  praktijk, ook de kaarten. Een ontbrekend aanmeldingenbestand wist dus nooit kaarten. Voorwaarden art. 3, /privacy
  #einde, VWO "In het kort" en art. 10, en de herinneringsmail noemen de 90 dagen. Test
  `scripts/test-proef-einde-wissen.mjs` aangepast (faalt zonder fix). `AV_VERSIE` 2026-11-09-2, `VWO_VERSIE` 2026-11-09.
  2026-11-09 14u: Ahmed koos 30 dagen in plaats van 90 (`PROEF_BEWAAR_DAGEN`, ook voor de aanmelding); `AV_VERSIE`
  2026-11-09-3, `VWO_VERSIE` 2026-11-10.
  Rest (LAAG): wist een proefpraktijk zelf eerder haar aanmelding ("Mijn proef wissen"), dan geldt nog de oude route
  (account weg zodra de laatste kaart verloopt); begrenzen zou ook kaarten wissen als het aanmeldingenbestand ontbreekt.
- **MIDDEL — verwerkersovereenkomst miste drie verplichte punten van art. 28 AVG (2026-11-09 13u).**
  Lid 3a (wettelijke vordering vooraf melden), lid 3h (controle/audit door de praktijk of een deskundige) en lid 4
  (verwerker blijft verantwoordelijk voor subverwerkers). OPGELOST 2026-11-09 (deze PR): art. 3, 6 en 11 aangevuld.
  Bron: AVG art. 28 (eur-lex.europa.eu, Verordening (EU) 2016/679). Kosten en termijn van een audit: zie mensenwerk.
- **LAAG — vertaalroute (2026-11-09 13u).** Bij vertalen gaan ook namen van eigen oefeningen van de praktijk naar
  Anthropic; /privacy noemt "oefeningnamen", dat dekt het. Geen actie.

- **MIDDEL — privacyverklaring + code (2026-11-09 09u): een proefpraktijk zonder abonnement werd nooit gewist.**
  De proefaanmelding verdween 90 dagen na de proef, maar het praktijkaccount (teamleden met naam en e-mail,
  wachtwoordhashes, profiel met logo, sjablonen, eigen oefeningen, logboek) bleef voor altijd staan. Voorwaarden art. 3
  zegt "Word je geen klant, dan wissen we je proefgegevens zoals in de privacyverklaring staat", en die zei alleen
  "zolang de praktijk Fysiplan gebruikt" (art. 5 lid 1e en art. 13 lid 2a AVG).
  OPGELOST 2026-11-09 (deze PR): `proefZonderAbonnementWissen` (server.js, uurlijkse proefronde) wist via
  `praktijkAllesWissen` een praktijk waarvan de aanmelding weg is, de proef meer dan 90 dagen voorbij is en er geen
  gedeelde kaarten meer zijn; met kaarten blijft het account tot de laatste kaart verloopt (praktijk moet ze nog kunnen
  inzien). Eerste mogelijke wissing: eind januari 2027. /privacy heeft nu "Als je stopt" (#einde), de rijen verwijzen
  ernaar. Test `scripts/test-proef-einde-wissen.mjs` (faalt zonder fix, in test:privacy en CI).
  Rest (LAAG): een praktijk die Ahmed met de hand klant maakte en daarna zelf "Mijn proef" wiste, zit al op slot en
  wordt nu ook na 90 dagen gewist als er geen kaarten meer zijn; dat volgt het slot, maar check bij handmatige klanten.
- **MIDDEL — privacyverklaring noemde de uitzondering voor gezondheidsgegevens niet (2026-11-09 09u).**
  Alleen de behandelovereenkomst (art. 6) stond er; art. 13 lid 1c vraagt de grondslag, en voor gezondheidsgegevens
  hoort de uitzondering van art. 9 lid 2 onder h AVG met art. 30 lid 3 UAVG (zorgverlener met beroepsgeheim) erbij.
  OPGELOST 2026-11-09 (deze PR). Bron: AVG art. 9; UAVG art. 30 (wetten.overheid.nl).
- **LAAG — delen via WhatsApp (2026-11-09 09u).** De app heeft wa.me-links om de kaartlink te sturen; WhatsApp is
  geen subverwerker (de praktijk kiest en verstuurt zelf), maar dat stond nergens. OPGELOST 2026-11-09 (deze PR):
  één zin onder de subverwerkers. Gecontroleerd zonder gat: alle externe hosts in code (api.anthropic.com,
  api.resend.com, api.mollie.com, api.cloudflare.com/videodelivery.net, youtube-nocookie.com) staan in de lijst.

- **HOOG — code tegen tekst (2026-11-09 05u): een opgezegd abonnement stopte nooit en er werd nooit gewist.**
  Voorwaarden art. 5 en verwerkersovereenkomst art. 10 beloven: na het einde worden de kaarten van de praktijk binnen
  30 dagen gewist. Na opzeggen bleef `proef.klant` echter voor altijd `true`: de praktijk kon na de betaalde maand
  gratis kaarten blijven maken, en kaarten, account, profiel en aanmelding (met telefoon) bleven staan (art. 5 lid 1e
  en art. 28 lid 3g AVG). OPGELOST 2026-11-09 (deze PR): `abonnementEindeStap` (lib/mollie.js) in de uurlijkse
  proefronde zet na `betaaldTot` het abonnement op "beeindigd" (geen klant, proefpoort dicht, gedeelde kaarten werken
  nog) en wist 30 dagen later alles van de praktijk via `praktijkAllesWissen` (dezelfde route als "Alles wissen" op
  /v2/gegevens; fiscale gegevens blijven 7 jaar). Pagina, mail en voorwaarden noemen de 30 dagen.
  Test: `scripts/test-abonnement-einde.mjs` (faalt zonder fix), plus unit-test in `test-abonnement-mollie.mjs`.
  Nog niet: een abonnement dat stopt omdat een maandincasso mislukt (er is nog geen incasso); de praktijk krijgt
  geen herinneringsmail vlak voor het wissen (zie mensenwerk).

- **MIDDEL — voorwaarden (2026-11-09, gemeld door de praktijk-routine): opzeggen kan nu ook in de app.**
  OPGELOST 2026-11-09 (deze PR): art. 5 zegt nu "zelf in de app (Mijn proef) of per e-mail", stopt aan het einde van
  de betaalde maand, intrekken kan tot die dag. Nieuwe `AV_VERSIE` 2026-11-09 met regel in `AKKOORD_WIJZIGINGEN`
  (beheerders zien het in de app). Opzegtermijn blijft een invulplek voor Ahmed.
  `public/juridisch.html` (abonnement) zegt "Opzeggen doe je per e-mail. Je krijgt een bevestiging." en "Opzegtermijn:
  in te vullen". Sinds PR "praktijk: abonnement zelf opzeggen" kan een betalende praktijk op /v2/proef?mijn=1 zelf
  opzeggen; dat gaat in per het einde van de al betaalde maand (`abonnement.betaaldTot`), tot dan kan ze het intrekken,
  en met mail ingesteld krijgt ze een bevestiging. Voorstel: "Opzeggen doe je in de app (Mijn proef) of per e-mail;
  het abonnement stopt aan het einde van de betaalde maand." Opzegtermijn blijft een keuze van Ahmed (zie mensenwerk).

- **HOOG — MDR (2026-11-09 01u): de AI-vraaghulp op /k kon een dosering invullen.**
  Een vraag als "Hoeveel herhalingen moet ik doen?", "Hoe vaak per dag?" of "Mag ik zwaarder?" ging naar de AI-dienst,
  die de dosering van de kaart niet meekrijgt en hem dus zelf moest bedenken. Dat is doseringsadvies per patiënt,
  precies de grens waarop software een medisch hulpmiddel wordt (MDCG 2019-11, regel 11 MDR; Fysiplan belooft
  "kiest geen behandeling of dosering"). De systeemprompt verbood alleen "aantallen veranderen", niet ze noemen.
  OPGELOST 2026-11-09 (deze PR): `vraagOverDosering` in `lib/vraaghulp-grens.js` vangt hoe vaak/hoeveel/hoe lang/
  hoe zwaar af in de 9 kaarttalen; de server geeft dan een vaste verwijzing ("staat op je kaart, vraag je praktijk",
  zonder AI-label) en roept de AI-dienst niet aan. Prompt: "noem of verander nooit aantallen ... of hoe vaak".
  /privacy (patiëntdeel, `PRIVACY_VERSIE` 2026-11-09) en landing zeggen het erbij. Test: `scripts/test-vraaghulp-grens.mjs`
  (faalt zonder fix). Bewust ruim: "hoe lang moet ik vasthouden?" wordt ook verwezen; een onterechte verwijzing
  kost de patiënt niets.
  Gecontroleerd zonder gat: videolabel "AI-demonstratie · klinisch gecontroleerd" verschijnt alleen bij
  `clinicallyReviewed === true`, anders "AI-concept · beoordeling volgt" (AI-verordening art. 50 lid 4, alle 9 talen);
  **gewijzigd 2026-11-10 (keuze Ahmed, PR #162):** het losse label "AI-concept · beoordeling door fysiotherapeut volgt" is
  vervangen door één gewone zin die nog steeds zegt dat de video met AI is gemaakt: "De video is met AI gemaakt en laat de
  algemene uitvoering zien. Volg daarnaast de dosering en opmerkingen van je behandelaar op." (9 talen); staat de
  luisterknop erbij: "De stem en video zijn met AI gemaakt en leggen de algemene uitvoering uit. …". De belofte
  "beoordeling door fysiotherapeut volgt" is vervallen (Physitrack is de maatstaf, besluit 2026-11-08). Jurist laten
  toetsen of deze zin volstaat voor art. 50 lid 4; `test:patientmobiel` bewaakt dat de AI-melding in alle talen blijft;
  landingsfoto's dragen "AI-bewerkt"; zoekhulp geeft geen dosering; sorteren "meldingen eerst" gaat alleen over
  meldingen die de patiënt zelf stuurde, niet over scores (geen "wie slechter wordt komt bovenaan").
- **LAAG — landing: "auditlogboek is openbaar" linkte naar het oude `docs/security-log.md`** (sinds 7 nov niet meer
  bijgewerkt), terwijl de tekst zegt dat de beveiliging doorlopend getoetst wordt. OPGELOST 2026-11-09 (deze PR):
  link naar `docs/security-backlog.md`.

- **MIDDEL — WGBO (2026-11-08 21u): werknotitie en berichten konden ongemerkt met de kaart verdwijnen.**
  De werknotitie ("linkerknie ontzien") staat alleen in Fysiplan, maar ging niet mee in "Kopieer voor dossier".
  Het label "In dossier" keek alleen naar invoer van de patiënt: een werknotitie of bericht van de praktijk ná het
  label liet de kaart "bijgewerkt in het dossier" lijken, dus de bewaartermijn waarschuwde niet. De dossiertekst
  noemde het laatste opslaan "Aangemaakt" (ook in de CSV-kop), een onjuiste datum in het dossier.
  Bron: art. 7:454 BW (dossierplicht); KNGF-richtlijn Fysiotherapeutische verslaglegging.
  OPGELOST 2026-11-08 PR #110: `laatsteDossierInvoer` (server.js) telt ook praktijkberichten en `notitieT`;
  dossiertekst neemt de werknotitie mee; "Kaart laatst opgeslagen" en CSV-kop "Laatst opgeslagen"; /privacy noemt
  berichten en werknotitie bij de praktijkgegevens. Test in `scripts/test-dossier-contact.mjs` (faalt zonder fix).
  Gecontroleerd zonder gat: app en landing noemen Fysiplan overal "geen dossier" (/privacy, voorwaarden, VWO,
  FAQ), dossiertekst eindigt met bron en bewaartermijn, weekbrief waarschuwt voor kaarten die nog niet in het dossier staan.
  Nog open (LAAG): opnieuw opslaan van een kaart wist het label "In dossier" (conservatief: de waarschuwing komt
  terug), maar ook wie het label zette; dat staat wel in het praktijklogboek.

- **MIDDEL (gebruikers-sweep 2026-11-08 14u, Truus) — /k "Download mijn gegevens" direct na tikken klopt niet** (inzage art. 15).
  Na 2 oefeningen afvinken en een seintje toont de download "0 jours" en "Mes messages au cabinet: rien"; pas na herladen
  klopt het. `zetOefTrouwLokaal` maakt `{n:0}` (kaart.html r. ~1038), download print `n` (r. ~1661); `mijnSeintjes` wordt
  na een seintje niet lokaal bijgewerkt (r. ~1669). Alle talen. iPhone SE.
  OPGELOST 2026-11-08 PR #107: `mgTrouwTik` volgt de serverregel van /api/kaart/oefening (één dag telt één keer,
  uitvinken dezelfde dag haalt hem weg); na een verstuurd seintje zet `mgSeintjeErbij` het meteen in `mijnSeintjes`.
  Test in `scripts/test-mijn-gegevens.mjs` (faalt zonder fix). Rest: een seintje uit de offline-wachtrij komt pas na
  herladen in de seintjeslijst; tot dan staat het onder "Nog niet verstuurd", dus niets ontbreekt.

- **LAAG — /k "Mijn gegevens"-download alleen in nl en en** (2026-11-08). OPGELOST 2026-11-08 PR #103: `TMGD` in alle 9 talen,
  datums in de kaarttaal, test in `scripts/test-mijn-gegevens.mjs`.
- **LAAG — /privacy#opslag miste twee patiëntvoorkeuren** (2026-11-08 13u). `fp_app_weg` (melding "zet de kaart op je
  beginscherm" weggeklikt) en `fp_demo_geluid` (geluid bij de bewegingsdemo) stonden niet in de tabel; beide functioneel
  (art. 11.7a lid 3 Tw), dus geen toestemming nodig, wel uitleg. OPGELOST 2026-11-08 PR #103, `PRIVACY_VERSIE` 2026-11-08.
  Gecontroleerd zonder gat: subverwerkers (Cloudflare Stream-upload is alleen beheer/bibliotheek, geen praktijkdata),
  sessionStorage alleen voor de beheersleutel in het tabblad.
- **LAAG — Privacy-link op een Engelse/Arabische kaart opent een pagina die alleen Nederlands is** en niet het
  patiëntdeel `#patient` (sweep 18u, Jayden, Pixel 7). kaart.html r. ~473, ~599; server.js `juridischBlok`.
  DEELS OPGELOST 2026-11-08 PR #107: beide links gaan nu naar `/privacy#patient` met `hreflang="nl"`. Nog open (LAAG):
  het patiëntdeel van /privacy is alleen Nederlands; vertalen in de 9 kaarttalen is de volgende stap.

- **LAAG — praktijk kan de vraaghulp op de kaart niet zelf uitzetten (2026-11-07).** Staat
  `ANTHROPIC_API_KEY` aan, dan ziet elke patiënt de vraaghulp. De praktijk is
  verwerkingsverantwoordelijke en kan nu niet kiezen om geen enkele patiëntvraag naar een dienst
  in de VS te sturen. Sinds deze ronde gaan vragen over pijn en klachten er niet meer heen, en de
  kaart waarschuwt geen persoonsgegevens te typen. Een schakelaar per praktijk is een keuze; zie
  "Vraaghulp op de kaart" in `docs/mensenwerk.md`.
- **LAAG — label "klinisch gecontroleerd" bij AI-video's (`public/kaart.html`, VIDEO_META).**
  Verschijnt alleen als `clinicallyReviewed === true` in de videocatalogus. Dat is de door Ahmed
  begeleide videostroom; deze routine raakt de reviewstatus niet aan. Let op dat "klinisch" niet
  meer belooft dan "beoordeeld door een fysiotherapeut".

- **LAAG — patiëntopslag (/k) is functioneel, geen toestemming nodig (art. 11.7a lid 3 Tw).**
  Gecontroleerd 2026-11-06: geen cookies op /k, alleen localStorage (taal, lettergrootte, stem,
  vinkjes, "te zwaar", privacyregel gezien, app-uitnodiging) en de offline-cache van de
  service worker. Geen analyse, geen derden behalve video's pas na tikken (al in de verklaring).
  Bron: Telecommunicatiewet art. 11.7a; AP, "Cookies" (autoriteitpersoonsgegevens.nl).
- **LAAG — download bevat media als pad, niet als bestand (2026-11-06).** `/v2/gegevens/download`
  geeft kaarten, aantikken, eigen oefeningen, sjablonen, profiel en logboek als JSON; eigen
  video's, foto's en het logo staan erin als pad. Voor inzage (art. 15) volstaat dat meestal,
  omdat de praktijk die bestanden zelf aanleverde. Een zip zonder nieuwe dependency is pas
  nodig als een praktijk erom vraagt.
- **LAAG — een onbeveiligde praktijk kan niet alles in één keer wissen.** Zonder wachtwoord is
  er geen bewijs van eigenaarschap. Zo'n praktijk kan geen kaarten delen (wachtwoordplicht sinds
  PR #40), dus er staan geen patiëntgegevens op de server; losse sjablonen/profiel via e-mail.
- **LAAG — steekproef (d), 2026-11-06:** avatarvideo's uit PR #42 staan op de eigen server
  (geen nieuwe derde partij), dus de subverwerkerslijst klopt nog. Volledige controle (d) gedaan op 2026-11-08.
- **LAAG — controle (d) 2026-11-08, zonder gat:** een verlopen kaart neemt zijn opnames mee (`bewaartermijnOpruimen`
  → `ruimKaartVideosOp`), ook bij Verwijderen, opnieuw opslaan en "Alles wissen" op /v2/gegevens. Het praktijklogboek
  houdt de laatste 500 regels met gemaskeerd IP en zonder kaartlink; de reservekopie bevat alleen JSON (geen video's)
  en houdt 7 dagen, zoals de teksten zeggen. Dagstatistieken 120 dagen, anoniem.

## Opgelost

- **MIDDEL — verwerkersovereenkomst en voorwaarden zonder samenvatting, VWO niet als concept gemarkeerd.**
  OPGELOST 2026-11-08 PR #100: beide hebben bovenaan "In het kort" (B1, vijf zinnen, "De artikelen hieronder
  gelden"); de VWO draagt nu ook het label "Concept" zoals de voorwaarden. Geen inhoudelijke wijziging, dus
  `VWO_VERSIE` en `AV_VERSIE` blijven gelijk en er is geen nieuw akkoord nodig. Bron: AVG art. 12 lid 1 (beknopt,
  begrijpelijk, duidelijke taal); AP, "Verwerkersovereenkomst" (autoriteitpersoonsgegevens.nl). Test in
  `scripts/test-privacy.mjs`.
- **LAAG — /v2/gegevens liep achter op #84.** OPGELOST 2026-11-08 PR #100: "Alles wissen" noemt de
  proefaanmelding, de voetregel zegt dat Mijn proef alleen de aanmelding wist, en pagina én bevestiging na wissen
  wijzen naar "Wis Fysiplan van dit apparaat" voor wat nog in de browser staat. Test in `scripts/test-praktijkgegevens.mjs`.

- **MIDDEL — opnames via /o bleven na een herstart voor altijd op de schijf.** OPGELOST 2026-11-08 PR #95:
  het opnametoken stond alleen in het geheugen; kwam een opname niet op een kaart en herstartte de server (elke
  deploy) binnen 15 minuten, dan ruimde niets het bestand nog op. Privacyverklaring en VWO art. 10 beloven dat video's
  met de kaart verdwijnen. Nu ruimt `weesOpnamesOpruimen` bij de start en elke 6 uur elk `v-<token>`-bestand op dat
  geen lopend token, kaart of oefening meer gebruikt. Bron: AVG art. 5 lid 1 onder e (opslagbeperking).
  Test `scripts/test-wees-opnames.mjs`.
- **LAAG — proefmail en FAQ beloofden dat gedeelde kaarten "altijd" blijven werken.** OPGELOST 2026-11-08 PR #95:
  herinneringsmail, wis-bevestiging en de FAQ op /v2 zeggen nu "tot hun bewaartermijn afloopt", gelijk aan /privacy.

- **MIDDEL — /k "Mijn gegevens": download mist de seintjes en is onleesbaar.** OPGELOST 2026-11-08 PR #91:
  tekstbestand `fysiplan-mijn-gegevens.txt` met kopjes (nl, anders en), datums, oefeningen met dosering, eigen
  seintjes (via `mijnSeintjes`, alleen soort en moment, ook na afhandeling) en wat alleen op de telefoon staat.
  Bron: AVG art. 12 lid 1 (beknopt, begrijpelijk, duidelijke taal) en art. 15. Test `scripts/test-mijn-gegevens.mjs`.
- **MIDDEL — /k "Wis deze kaart van mijn telefoon" belooft meer dan het doet.** OPGELOST 2026-11-07 PR #87:
  wist nu alle sleutels van deze kaart plus taal, lettergrootte, stem en app-melding (andere kaarten blijven),
  waarschuwt als er nog iets niet verstuurd is, zet het adres op `/k?gewist=1` zodat herladen de kaart niet
  opnieuw opent, en zegt dat een beginschermicoon ook weg moet. Test `scripts/test-kaart-wis-telefoon.mjs`.
- **MIDDEL — /k privacyzin klopt niet helemaal.** OPGELOST 2026-11-07 PR #87: privacyzin en Mijn gegevens
  noemen nu roepnaam, oefeningen en wat de fysiotherapeut erbij schreef, en "een tijd na je behandeling wordt
  de kaart vanzelf gewist" (9 talen); privacyregel in `--grijs` (ca. 4,6:1 in plaats van 2,6:1).

- **MIDDEL — proefaanmelding ontbrak in download en "Alles wissen" (2026-11-07).** `/v2/gegevens`
  beloofde "alle gegevens die Fysiplan voor deze praktijk bewaart", maar de proefaanmelding van die
  praktijk (contactpersoon, e-mail, telefoon, betaling) zat niet in de download (art. 15/20 AVG) en
  bleef na "Alles wissen" staan (art. 17). Was de praktijk klant, dan werd zij nooit automatisch
  gewist. OPGELOST 2026-11-07: de download geeft `aanmelding` mee (zonder apparaat-tokens);
  wissen haalt de aanmelding weg. Na een online betaling blijft alleen naam, e-mail, praktijknaam
  en de betaling, 7 jaar (fiscale bewaarplicht, art. 52 AWR), daarna wist de uurronde ook die.
  Telefoon en apparaten gaan meteen weg en hetzelfde e-mailadres hervat die aanmelding niet meer.
  Privacyverklaring (rij Proefaanmelding) en de gegevenspagina zeggen het erbij.
  Test: `scripts/test-gegevens-proef.mjs` (in `npm run test:privacy` en CI).
  Rest van (e) zonder nieuw gat: teamleden, akkoord en logboek zitten al in download en wissen;
  losse kaart wissen via "Verwijderen" in de app; patiënt via "Mijn gegevens" op /k.

- **MIDDEL — vraaghulp op de kaart kreeg vragen over pijn en klachten (2026-11-07).** Een patiënt
  kon typen "mijn knie doet pijn sinds de operatie, moet ik doorgaan?". Die vraag ging naar de
  AI-dienst in de VS (gezondheidsgegevens, art. 9 AVG) en alleen de systeeminstructie hield een
  antwoord over de klacht tegen. Software die op de klacht van één patiënt reageert, schuift richting
  medisch hulpmiddel (MDR art. 2 lid 1; MDCG 2019-11, stap 3 en 4). OPGELOST 2026-11-07: de server
  herkent pijn, klachten, medicijnen, operatie en herstel in de 9 talen van de kaart
  (`lib/vraaghulp-grens.js`) en geeft dan zonder AI een vaste verwijzing naar de eigen praktijk en
  het seintje "Het doet te veel pijn"; die verwijzing krijgt geen AI-label. Privacyverklaring zegt
  het erbij. Test: `scripts/test-vraaghulp-grens.mjs` en `npm run test:privacy`.
  Rest van (g) zonder nieuw gat: zoekhulp zonder klacht/dosering, vertalen zonder vrije tekst, AI-labels
  op kaart en vraaghulp (art. 50 AI-verordening), landing "stelt geen diagnose, kiest geen behandeling
  of dosering". Sorteren "melding bovenaan" in de app volgt een tik van de patiënt, geen oordeel.

- **HOOG — de app voor therapeuten laadde het lettertype bij Google (2026-11-07).** `public/index.html`
  haalde Inter van fonts.googleapis.com en fonts.gstatic.com. Daardoor ging bij elk bezoek het
  IP-adres van de therapeut naar Google, zonder toestemming en zonder noodzaak (LG München I,
  20-01-2022, 3 O 17493/20; art. 6 AVG). OPGELOST: Inter staat nu op de eigen server
  (`public/fonts`, OFL), de CSP staat geen Google-lettertypes meer toe, en de privacyverklaring
  noemt Google alleen nog voor video's.
- **MIDDEL — teksten liepen achter op rollen, inbox en patiëntkant (2026-11-07).** Teamleden (naam,
  e-mail, rol), "afgehandeld door" en "in dossier" bij een kaart, het akkoord met naam, de wachtrij
  op de telefoon van de patiënt, de cookie `fp1` van de oude app en de wis-knoppen stonden niet in
  de privacyverklaring. De verwerkersovereenkomst noemde nog alleen het praktijkwachtwoord; de
  voorwaarden zeiden "deel de toegang met mensen van je praktijk". OPGELOST: privacyverklaring,
  verwerkersovereenkomst (art. 5) en voorwaarden bijgewerkt; `VWO_VERSIE` naar 2026-11-07 en
  `AV_VERSIE` naar 2026-11-07-2, met regels in `AKKOORD_WIJZIGINGEN`, zodat een beheerder in de app
  ziet wat er veranderde en opnieuw akkoord gaat. Railway bewaart logs 7 dagen (Hobby) of 30 dagen
  (Pro) (docs.railway.com/observability/logs); de tekst zegt "hooguit 30 dagen".
- **MIDDEL — "In de praktijk" bewaarde een volledige naam (art. 5 lid 1 c AVG).** OPGELOST
  2026-11-07: de knop stelt nu ook een roepnaam voor ("Henk V."), net als printen met QR.
- **MIDDEL — geen knop om de app-opslag te wissen; voorwaarden niet geaccepteerd en niet gelinkt
  in de app.** OPGELOST 2026-11-07 (PR #67, #69 en deze ronde): "Wis Fysiplan van dit apparaat" in
  het praktijkslot en in Help, "Wis deze kaart van mijn telefoon" op de patiëntkaart, één akkoord
  voor voorwaarden en verwerkersovereenkomst met versie, tijd en wie, en Help linkt `/voorwaarden`.

- **MIDDEL — privacyverklaring miste verplichte onderdelen van art. 13 AVG en een eerlijke versiedatum.**
  Alleen inzien/verbeteren/wissen stond erin; beperken, bezwaar en meenemen (art. 13 lid 2 b),
  "geen geautomatiseerde besluiten" (lid 2 f), of verstrekken verplicht is (lid 2 e) en de
  antwoordtermijn van een maand (art. 12 lid 3) ontbraken. De versiedatum kwam van de
  verwerkersovereenkomst en bleef op 2 november staan, terwijl de tekst op 6 en 7 november veranderde.
  De foutlog schreef bij een serverfout de volledige URL weg, met kaartlink (`/k/<id>`, `?id=`), naar
  de logs van Railway. OPGELOST 2026-11-07: rechten als lijst in B1-taal, termijn, geen
  geautomatiseerde besluiten, wat nodig is voor de proef, alinea "Foutlog", een samenvatting
  "In het kort" bovenaan (B1), `PRIVACY_VERSIE` los van `VWO_VERSIE` (geen nieuw akkoord nodig),
  en `logPad()` haalt query en kaart-/opname-id's uit de foutlog. Bron: AVG art. 12 en 13
  (eur-lex.europa.eu, Verordening 2016/679); AP, "Privacyverklaring". Test: `npm run test:privacy`.

- **MIDDEL — Mollie niet genoemd terwijl online betalen kan (art. 13 lid 1 e AVG; art. 6:234 BW).**
  Met `MOLLIE_API_KEY` (PR #57) gaan naam of praktijknaam, e-mail en bedrag naar Mollie, maar de
  privacyverklaring noemde Mollie niet en de voorwaarden zeiden "We vragen geen betaalgegevens".
  OPGELOST 2026-11-07: zodra de sleutel staat, toont `/privacy` een regel "Betaling" (wat, waarvoor,
  hoe lang: zolang klant, daarna 7 jaar fiscale bewaarplicht, art. 52 AWR) en een alinea over
  Mollie B.V. als zelfstandig verantwoordelijke; zonder sleutel staat Mollie er niet. Voorwaarden
  (versie 2026-11-07) beschrijven de eerste maand vooraf via Mollie en de machtiging. Het betaalblok
  linkt voorwaarden en privacy, en de server bewaart bij de betaling welke voorwaardenversie de
  praktijk zag (`betaling.av`). Mollie is geen subverwerker (geen patiëntgegevens), dus de
  subverwerkerslijst en de verwerkersovereenkomst veranderen niet. Test: `scripts/test-abonnement-mollie.mjs`.

- **MIDDEL — seintjes, "te zwaar" en berichten verdwenen spoorloos (WGBO).** Een seintje werd
  gewist zodra de therapeut het afhandelde of beantwoordde, een bericht zodra de patiënt het
  wegtikte, een "te zwaar"-melding bij afhandelen. "Kopieer voor dossier" nam ze niet mee, en ze
  stonden nergens anders. Voor de verslaglegging (art. 7:454 BW: gegevens over de gezondheid en
  de uitgevoerde verrichtingen, voor zover nodig voor goede hulpverlening; KNGF-richtlijn
  Fysiotherapeutische verslaglegging) hoort een gemelde pijntoename en het antwoord van de
  therapeut in het dossier van de praktijk. OPGELOST 2026-11-07: de server houdt per kaart een
  contactlogboek (hooguit 50 regels, zelfde bewaartermijn als de kaart, niet in de
  patiëntroute); de dossiertekst noemt het met datum en sluit af met "Bron: Fysiplan,
  overgenomen op …; de digitale kaart wordt na de bewaartermijn gewist". Verder gecontroleerd
  (h): landing, app, privacyverklaring, verwerkersovereenkomst en voorwaarden zeggen overal dat
  Fysiplan geen dossier is en dat de praktijk vastlegt in haar EPD; dat klopt met de code.
  Test: `scripts/test-dossier-contact.mjs` (in test:privacy en CI).

- **MIDDEL — gewiste kaart bleef offline op de telefoon van de patiënt staan.** De service
  worker hield de kopie van `/api/kaart?id=…` (roepnaam, oefeningen, pijnscores) en `/k/<id>`
  na wissen of verlopen; offline toonde de telefoon hem nog, ondanks "verdwijnt vanzelf".
  OPGELOST 2026-11-06: bij 404/410 wist de werker alles van die kaart uit de cache en de kaart
  wist haar eigen vinkjes in localStorage. Privacyverklaring kreeg een eerlijke sectie "Cookies
  en opslag op je apparaat" (de oude zin "onthoudt alleen je taal, je vinkjes en de
  lettergrootte" was onvolledig). Test: `scripts/test-kaart-weg.mjs` (in test:privacy en CI).
- **HOOG — praktijk kon niet alles exporteren of wissen (art. 15/17/20, art. 28 lid 3 g AVG).**
  OPGELOST 2026-11-06: scriptloze pagina `/v2/gegevens` (praktijknaam + wachtwoord, zelfde
  inlogrem en audit). Download = alles van de praktijk als JSON zonder wachtwoordhashes;
  wissen (met getypte bevestiging WISSEN) haalt kaarten met video's, eigen oefeningen met
  foto's, sjablonen, profiel met logo, account, sessies en de logboekregels met de
  praktijknaam weg. Gelinkt vanuit privacyverklaring, verwerkersovereenkomst (art. 8 en 10)
  en voorwaarden (art. 5). Test: `scripts/test-praktijkgegevens.mjs` (in `npm run test:privacy` en CI).
- **HOOG — geen algemene voorwaarden voor proef en abonnement.** OPGELOST 2026-11-06:
  concept op `/voorwaarden` (scriptloos, zelfde sjabloon als `/privacy`), gelinkt vanuit
  landing-voet, proefaanmelding en de voet van de juridische pagina's. Zakelijke keuzes staan
  als invulplek in de tekst en in `docs/mensenwerk.md`. Test: `npm run test:privacy`.
