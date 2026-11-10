# Legal-backlog (V2)

Bijgehouden door de legal-routine (elke 4 uur). Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
Alle juridische teksten zijn concept tot een jurist ze toetst; niets hier is juridisch advies.
Zakelijke en juridische beslissingen staan onder "Voor Ahmed" in `docs/mensenwerk.md`.

## Gebied → laatst gecontroleerd

| Gebied | Laatst gecontroleerd |
|---|---|
| (a) privacyverklaring (art. 13/14 AVG) | 2026-11-09 09u (art. 9-uitzondering, "Als je stopt", proefpraktijk zonder abonnement echt gewist, WhatsApp-link) |
| (b) verwerkersovereenkomst (art. 28 AVG) + subverwerkers | 2026-11-09 13u (art. 28 lid 3 a/g/h en lid 4 langs de tekst; einde proef: kaarten bleven onbeperkt; subverwerkers tegen alle externe hosts in code: geen gat) |
| (c) algemene voorwaarden | 2026-11-10 05u (art. 4 beschrijft de maandincasso: afschrijven via machtiging, mail 5 dagen vooraf als afgesproken kortere termijn, mislukt = contact, factuur per maand; `AV_VERSIE` 2026-11-10) |
| (d) code tegen tekst | 2026-11-09 05u (einde abonnement: wissen 30 dagen na het einde gebouwd) |
| (e) rechten van betrokkenen: inzien, exporteren, wissen | 2026-11-10 01u (vertaalcache hield namen van eigen oefeningen na "Alles wissen" en na verwijderen tot de volgende herstart; /privacy noemde de beheerderslogin op /v2/gegevens niet; download bevat geen geheimen, wel alle kaartvelden) |
| (f) cookies en lokale opslag | 2026-11-09 21u (Cache Storage van /k: "Wis deze kaart" liet oefenbeelden en bibliotheek staan, opgelost; cookies en localStorage ongewijzigd sinds 8-11) |
| (g) MDR en AI-verordening | 2026-11-09 01u (vraaghulp gaf mogelijk doseringsadvies: opgelost; videolabels AI-concept/klinisch gecontroleerd volgen de reviewstatus; landing en app zonder sorteer- of doseringsbelofte) |
| (h) WGBO en KNGF-beroepsregels | 2026-11-08 21u (werknotitie mee naar het dossier, dossierlabel vervalt bij nieuwe praktijkregels, datum heet nu "laatst opgeslagen") |
| (i) begrijpelijkheid (B1) | 2026-11-09 17u (alle drie pagina's gemeten: geen zin > 40 woorden, patiëntdeel ≤ 30; samenvatting voorwaarden klopte niet met art. 5; grondslag en bezwaar in gewone taal; test `test-juridisch-b1.mjs`) |

Volgende run: (h) WGBO, dan (g) MDR, dan (d) code tegen tekst. Open daarna: patiëntdeel /privacy in de kaarttalen.
De punten die op PR #41 wachtten, zijn op 2026-11-07 toch gebouwd (#69 en de juridische ronde daarna); #41 botst nu en moet worden bijgewerkt of gesloten.

## Open

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
