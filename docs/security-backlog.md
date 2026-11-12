# Security-backlog (V2)

Bijgehouden door de security-routine (elke 4 uur). Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
`docs/security-log.md` is het oude logboek (alleen lezen); de datums hieronder komen
daaruit tot en met 2026-11-06.

## Gebied → laatst geaudit

| Gebied | Laatst geaudit |
|---|---|
| (a) beheer-endpoints en de admin-sleutel | 2026-11-11 12u (alleen de nieuwe `/api/beheer/backup-status` uit #187: `isAdmin` met rem, geen geheimen in het antwoord; /health toont alleen uit/ok/deels/fout/wacht. Geen gat) · 2026-11-10 12u (na #159: sleutelformulier controleert via /api/dashboard, sleutel alleen in sessionStorage, geen sleutel in publieke bestanden; productie zonder eigen `ADMIN_KEY` dicht. Gevonden: foute sleutels op routes waar beheer een extra recht is, telden niet mee voor de rem, opgelost) · 2026-11-09 12u (statisch: 17 `isAdmin`-routes, /aanmeldingen en /medewerkers alleen `ACCOUNT_BEHEER_EMAILS`, geen admin88 in publieke bestanden, productie zonder eigen `ADMIN_KEY` dicht, rem vóór sleutel. Geen gat) |
| (b) accountlaag: sessies, inlogrem, claim, wachtwoord, herstelcode | 2026-11-12 00u (na #207, sessies op schijf: alleen sha256(token) + afdruk van de wachtwoordhash in `praktijk-sessies.json`, niet in de reservekopie (`backupBestanden`) en niet onder `/uploads`; alle 7 plekken die sessies intrekken (uitloggen, wachtwoord, lid weg, gedeeld uit, reset, wissen, praktijk weg) werken op de gehashte sleutel; vangnet afdruk ≠ wachtwoord van nu → 401 ook na terugzetten; opnieuw uitgenodigd lid houdt zijn id maar krijgt een nieuwe hash, oude sessie dood. Nieuw LAAG: inlogrem leeft alleen in het geheugen, zie Open. Verder geen gat) · 2026-11-10 20u (NAKIJKEN van de sweep bevestigd: missers van een lid bij wachtwoord wijzigen telden op de praktijksleutel, opgelost) · 2026-11-10 16u (runtime: inlogrem per IP remde niet echt, goed wachtwoord na 20 missers nog binnen; /v2/gegevens en /v2/proef/overzicht telden missers niet per IP: opgelost. Sessies 30 dagen, ingetrokken bij verwijderen/wachtwoord/gedeeld uit; rol live uit het lid; uitnodigingstoken 192 bits met misrem; herstelcode 80 bits. Verder geen gat) · 2026-11-09 12u (team: eigen login, uitnodigen, verwijderen, rol, gedeeld uit; uitnodiging verzilveren; wachtwoord per lid; v1-login/registratie. Nieuw: LAAG uitnodigingsmail als spamkanaal, zie Open) · 2026-11-08 04u (claim, inloggen op naam en e-mail, rem per naam/e-mail/praktijk, wachtwoord wijzigen, herstel, uitnodiging, overzicht en /v2/gegevens met e-mail; gedeeld wachtwoord weer aan: opgelost) |
| (c) proef-tokens en verlopen proeven | 2026-11-11 16u (welkomstlink was het blijvende cookietoken van het eerste apparaat: opgelost, eigen token 7 dagen / 3 apparaten) · 2026-11-11 04u (statisch + runtime alle /v2/proef/*-routes met de proefcookie: wissen, opzeggen, factuurgegevens, betalen, doorgaan, factuur, terug. "Gegevens wissen" met een betaald abonnement maakte de praktijk gratis en voor altijd klant: opgelost. Nieuw LAAG: abonnementsacties zonder beheerdersrol, welkomstlink = blijvend apparaattoken, zie Open) · 2026-11-09 16u (koppelen van een account aan een proef bij inloggen, nu ook gevolgd door wissen na 30 dagen: oude proefcookie hing een gewone praktijk aan een verlopen proef, opgelost; claim, slot en wissen alleen voor de eigen proef) · 2026-11-08 08u (runtime: aanmelden, opnieuw aanmelden met bekend adres, maillink, verlopen proef, overzicht na proef, wissen/doorgaan/betalen; login-CSRF via /v2/proef/terug: opgelost) |
| (d) gedeelde kaarten /k en /api/kaart*: id's, IDOR, limieten | 2026-11-11 12u (runtime: met de sessie van praktijk A alle 15 therapeutroutes op een kaart van praktijk B, met naam, kleine letters en leeg → 404, niets van B in een antwoord; zonder sessie alleen de patiëntroute antwoord/gezien (bewust); /api/kaart geeft alleen de allowlist en roepnaam; na nieuwe link geeft het oude id 404 op /api/kaart, manifest, agenda, ICS, vertaal en alle patiënt-POST's; id-varianten (hoofdletters, spatie, %00, 8 of 13 tekens) 404; na verwijderen 404; misrem 429 na 30. Geen gat) · 2026-11-10 00u (statisch alle 30 kaartroutes: patiëntroutes met `vindKaart` + misrem + `kruisSite`, therapeutroutes met `eisBeveiligdePraktijk` en alleen de eigen map, /api/kaart met allowlist, /k zonder bestaan-orakel, demo per verzoek vers. Teamsjablonen lezen/verwijderen zonder wachtwoord: opgelost) · 2026-11-08 12u (therapeutroutes op één kaart open bij praktijk zonder wachtwoord: opgelost; id 48 bits + misrem 30/5 min per IP) |
| (e) uploads (video, logo, opname /o) | 2026-11-11 20u (runtime: /uploads met ../, %2e%2e, ..%2f, ..%5c, dubbele codering, %00, hoofdletters, ./ en // → 403/404 of hetzelfde eigen bestand; opname van een verwijderde kaart via // of ./ blijft 404 (test:kaartprullenbak); weesopnames worden bij start opgeruimd; nosniff/CORP/noindex op media. Geen gat) · 2026-11-10 08u (statisch + runtime: /uploads met ../, %2e%2e, %2f, %5c, %00, dubbele codering → 403/404; opname-upload chunked 70 MB zonder content-length → 413 vóór bufferen, geen bestand; type/magische bytes; token blijft na fout bruikbaar; eigenVideoPad alleen eigen opnames; wissen ruimt foto's, logo en video's op. Geen gat) · 2026-11-09 00u (praktijkprofiel + logo van een praktijk zonder wachtwoord overschrijfbaar met alleen de naam: opgelost; opname-upload, beheer-upload, /uploads-pad, type/grootte/magische bytes: geen gat) |
| (f) injectie en XSS (kaartvelden, sjablonen, eigen oefeningen, CSV, vertaling) | 2026-11-12 12u (statisch: alle nieuwe `innerHTML` sinds 6f5fe7c in index.html/kaart.html/proef.html (eigen login, tweede stap, reservecodes, sleutel, prullenbak, seintjes): invoer door `esc()`, de QR-link via `setAttribute` met een server-`otpauth:`-uri, `vrager` uit een vaste tekst. Geen gat) · 2026-11-10 20u (runtime met Chromium, CSP uit zodat ook inline handlers zouden afgaan, op de nieuwe /k van #162 en #171: payloads in praktijknaam, adres, plaats, telefoon, e-mail, website (javascript:), kaartnaam, roepnaam, doel, let op, oefennaam, schemacellen, antwoord, behandelaar, PSK, notitie, afspraak, seintje; overzicht, oefenstand, Gedaan, foto, video, pijnscore in nl en ar: niets uitgevoerd of geïnjecteerd. Statisch: alle 27 `innerHTML` in kaart.html gaan door `esc()`, `vids`/`yt` alleen via de serverwhitelist. Geen gat) · 2026-11-09 08u (runtime met Chromium: payloads in teamnaam, uitnodiging, eigen oefening, teamsjabloon, alle kaartvelden, bericht, notitie, behandelaar, doel; app-start, Kaarten-paneel, inbox, Team, Activiteit, Rapport, Sjablonen, /k in nl/en/ar: niets geïnjecteerd, geen CSP-melding. CSV-exports met formule-escape, afspraak-ICS zonder regelinjectie. Geen gat) |
| (g) security-headers, CSP, cookies, CSRF | 2026-11-11 16u (runtime: CSP/frame-ancestors/nosniff/referrer/no-store op /v2 (Active Tech, fonts self), /v2/proef, /v2/app, /k, /o, /privacy, /verwerkersovereenkomst, /v2/gegevens, /v2/uitnodiging, API; /uploads met CORP same-origin; cookies fp1/fpproef HttpOnly+SameSite=Lax(+Secure). Statisch alle 75 schrijfroutes: zonder `kruisSite` alleen routes met de beheersleutel in een header, `/api/opname/start` (sessie in header, token niet cross-origin leesbaar) en v1-uitloggen. Praktijksessie zit in een header, niet in een cookie. Geen gat) · 2026-11-10 04u (runtime: CSP/frame-ancestors/nosniff/referrer/no-store op 13 V2-routes ook /v2/gegevens, /v2/uitnodiging, /aanmeldingen, factuur; cookies fp1/fpproef HttpOnly+SameSite=Lax(+Secure achter https); cross-site POST op alle /v2/proef/*-acties, /v2/gegevens en /api/praktijk* → 403; geen CORS-headers, ook niet op OPTIONS. Geen gat) · 2026-11-08 16u (runtime: CSP, frame-ancestors, nosniff, referrer, no-store op /v2, /v2/proef, /v2/app, /k, /o, /privacy, /verwerkersovereenkomst en API; geen inline script zonder nonce; HSTS alleen achter https. Geen gat); 2026-11-09 08u: `kruisSite` liet same-site door, opgelost) |
| (h) foutmeldingen die stacktraces of paden lekken | 2026-11-12 12u (runtime-fuzz 147 routes × GET/POST/PUT/DELETE × 11 kapotte bodies × 3 content-types, zonder én met praktijksessie (kop + cookie met dubbele/kapotte waarde) = 29.400 verzoeken: geen stacktrace, geen intern pad. Gevonden LAAG: body `null`/`[]`/`"x"` gaf 500 + TypeError in het log op /api/praktijk/akkoord, /team, /team/eigen-login, /team/sein-mail: opgelost, test:bodygeenobject) · 2026-11-11 08u (runtime-fuzz 123 routes + /k, /o, /api/kaart/<id>, team, drafts, uploads × GET/POST/PUT/DELETE × 9 kapotte bodies × 3 content-types, zonder én met praktijksessie + beheersleutel = 21.648 verzoeken: geen 500, geen stacktrace, geen intern pad, niets in het serverlog. Alleen beheer ziet bij de Cloudflare-koppeling de JSON-parsefout, geen pad. Geen gat) · 2026-11-09 16u (statisch: alle `sendJson`/`send` met `err.message`/`e.stack` in server.js, routes/ en lib/ sinds 8-11, ook opzeggen, factuur, wissen na proef: interne fouten gaan alleen naar het serverlog. Geen gat) · 2026-11-08 (runtime-fuzz 103 routes × GET/POST/PUT/DELETE × 7 kapotte bodies × 3 content-types = 6592 verzoeken, plus pad-traversal en kapotte %-codering: geen stacktrace, geen intern pad, geen fout in het serverlog) |
| (i) denial of service: grote bodies, opslaggroei | 2026-11-12 12u (statisch de nieuwe routes van #222–#229: wachtwoord-vergeten met rem per verbinding (6/uur) en per adres (3 mails/uur), antwoord vóór het werk, hooguit 3 mails per aanvraag; sessie-cookie met schrijfLimiet en zonder nieuwe sessie; tellers met opruiming. Geen gat) · 2026-11-11 08u (statisch: 67 `readBody`-aanroepen met grens, patiëntroutes /api/kaart/* met plafonds (metingen 366, ervaring 120, gedaan 366, oefTrouw 60, oefZwaar 24, contactlog 50), tik terug in de tijd begrensd, Mollie-webhook alleen eigen betaal-id's. Geen gat) · 2026-11-09 20u (remmen: schrijf-/leesrem per IP zette een hele praktijk achter één wifi plus de patiënten daar op 429: opgelost met een rem per praktijk; plafonds per praktijk ongewijzigd) · 2026-11-08 20u (opslaggroei alle schrijfroutes; één praktijk kon de videogrens voor iedereen volzetten: opgelost met quotum per praktijk) |
| (j) npm audit | 2026-11-12 12u (0 meldingen, ook dev) · 2026-11-11 12u (0 meldingen) · 2026-11-10 08u (0 meldingen) · 2026-11-09 20u (0 meldingen, ook dev) |

Sanity 2026-11-12 16u op #232 (beheer- en finance-omgeving, rechten per beheerder, agentloket), #237 (ideeënbox), #239 (bewaker)
en #235/#236/#240: een beperkt beheeraccount komt alleen bij `/api/beheer/omgeving*` (`magBuiten` in `isAdmin` én `beheerEigen`), daar
controleert elke POST zijn recht (`ROUTE_RECHT`), eigen rechten wijzigen kan niet en het laatste volledige account blijft; `/api/agent`
is dicht zonder sleutel, sleutel `fpa_` + 192 bits alleen als sha256 bewaard, vergelijking met timingSafeEqual, rem 10/kwartier per
verbinding, vaste lijst acties per rol en daggrenzen; de foutentelling per route houdt hooguit 30 routes per uur en alleen woorden uit
de eigen broncode (geen ingeprikte tekst van een bezoeker). Ideeënbox: alleen sessies van een beveiligde praktijk, kruisSite, body
8 kB, 5 ideeën per login per dag, stemmen per login, weghalen alleen eigen/beheerder van die praktijk, besluiten alleen `beheerEigen`
(beperkt account geweigerd), andere praktijken zien alleen "ander" (geen praktijknaam of login); de pagina's zetten tekst met
`textContent`. Bewaker: `/health` toont nu alleen twee aantallen fouten per uur en de starttijd. Geen gat.

Volgende run: (c) proef-tokens, daarna (a) beheer (incl. de nieuwe omgeving en het agentloket als runtime-probe).

Sanity 2026-11-12 12u op #230 (persoonlijke beheeraccounts): beheer telt alleen met cookie `fpbeheer`/`__Host-fpbeheer`
(HttpOnly, SameSite=Strict, genegeerd bij `kruisSite`) plús de kop `x-admin-sleutel: account`, die een andere website niet kan meesturen;
login met kruisSite-weigering, rem per adres en per IP, nephash tegen tijdsverschil, startwachtwoord 100 bits en een week geldig,
pas na eigen wachtwoord en eerste code een sessie; gegevens van praktijken alleen via `beheerEigen` (niet met de openbare
standaardsleutel van een lokale server); productie zonder eigen `ADMIN_KEY` en zonder account blijft dicht. Geen gat.

Sanity 2026-11-12 12u op #224–#229 (praktijknaam van de praktijk, wachtwoord vergeten, privacyverklaring, kaartpakket, eigen
video/pijnscore, sessiecookie): de resetlink gebruikt `instelBasis` → `eigenHost` (alleen fysiplan.nl, subdomeinen of localhost, dus
geen Host-vergiftiging); de link geeft geen sessie en de tweede stap blijft; /v2/gegevens vraagt ook de code. #229: elke route die een
sessie uitdeelt gaat via `sessieUit` (geen sleutel in het antwoord voor een browser), `sessieCookieVan` negeert de cookie bij
`kruisSite`, cookie HttpOnly + SameSite=Strict (+ Secure, `__Host-` op https). Geen gat.

Sanity 2026-11-12 12u op #219–#223 (opzeggen/praktijknaam bezet, AI-melding zoekhulp/vertaling, login bij andere praktijk,
eigen login verplicht, naam erft niets): #222 laat bij de overstap alleen iemand met het juiste praktijkwachtwoord één beheerder met
eigen login maken, en alleen zolang er geen actieve beheerder met eigen login is (anders 401 `perEmail`); daarna is het
praktijkwachtwoord dood (`gedeeldStaatUit`), sessies ingetrokken, en komt pas met de eerste code een sessie. Een nieuwe claim maakt
meteen een eigen login met tweede stap, het praktijkwachtwoord is een willekeurige hash. Herstelcode geeft onder de regel geen sessie.
`team/gedeeld` aan en `stap-verplicht` uit zijn 400. #221 noemt bij een login van een andere praktijk pas na een goed wachtwoord de
eigen praktijknaam (409). #223: claim op een naam met gegevens zonder account krijgt een eigen code. Geen gat.

Sanity 2026-11-12 04u op #209–#218 (sessies op schijf, lichte app, beheerherstel per mail, seintjesmail, tweede stap en verplichting,
teamsjabloon vervangen, proefmail): nieuwe routes `/api/praktijk/team/tweede-stap/{start,bevestig,uit,reservecodes}` vragen een eigen
login plus het eigen wachtwoord (rem per lid), `bevestig` alleen binnen een lopende instelling met 10 pogingen; `tweede-stap/wis`,
`stap-verplicht` en `sein-mail` alleen voor een beheerder, wissen en verplichten alleen met eigen login; `/api/praktijk/reset` is 410
met de beheersleutel; `/api/beheer/praktijk-herstel` alleen met de beheersleutel, rem per praktijk en per adres, link/code alleen in de
mail, niets verandert tot de praktijk de mail gebruikt. Geen gat.

Sanity 2026-11-12 00u op #202–#208 (landing, voorwaarden, /k grote letters + /o galerij, vraaghulp-schakelaar, sessies op
schijf, reservekopiegrens, donker thema + seintjesvenster): `VRAAGHULP_AAN` sluit `/api/kaart/vraag` (503) en de `ai`-vlag
van /api/kaart zonder schakelaar; `backupRuimte`/`gegevens` op /health en backup-status geven alleen getallen; de waarschuwingsmail
gaat alleen naar `proefMeldingAan`; nette afsluiting op SIGTERM. `seinFeitenHtml` (nieuw `innerHTML` in index.html) zet alle
invoer door `esc()`, de kleur komt uit een vaste lijst. #205 raakt alleen `kaart.html`/`opname.html` zonder nieuwe `innerHTML` met
invoer. Geen gat.

Sanity 2026-11-11 20u op #198–#200 (eigen welkomstlink, tekst Mijn gegevens, donker thema/kaart weg/vertaling op /k): #199
voegt alleen `HERSTEL_DAGEN` (getal, door `htmlEsc`) toe aan de proefpagina; #200 raakt `index.html`, `kaart.html`, `proef.html`
en CSS zonder nieuwe `innerHTML` met invoer en zonder nieuwe serverroute. Geen gat.

Sanity 2026-11-11 16u op #191–#197 (prullenbak, herstel, definitief verwijderen, praktijkprofiel collega, Active Tech):
nieuwe routes `/api/kaarten/prullenbak`, `/herstel`, `/definitief` met `eisBeveiligdePraktijk`, `kruisSite` en
`magKaartVerwijderen` (maker als onveranderlijke account-id of beheerder); alle 13 patiëntroutes via `vindKaart` en alle
therapeutroutes op één kaart slaan een kaart in de prullenbak over; `/uploads` geeft 404 voor opnames van alleen verwijderde
kaarten; weekbrief, inbox en overzicht tellen ze niet mee; prullenbaklijst in de app door `esc()`. Geen gat.

- **OPGELOST 2026-11-11 16u (deze PR) — LAAG — welkomstlink is een blijvend apparaattoken.** De link in de welkomstmail
  was hetzelfde token als de proefcookie van het eerste apparaat en werkte zolang de aanmelding bestond. Nu krijgt de mail
  een eigen token (`welkomLink`, alleen als sha256 op schijf), 7 dagen geldig, op hooguit 3 apparaten; `/v2/proef/terug`
  neemt geen cookietoken meer aan. Oude welkomstmails van vóór deze PR werken daardoor niet meer: de foutpagina wijst naar
  opnieuw aanmelden met hetzelfde adres (eenmalige link van 24 uur, zelfde proef). Test: `npm run test:welkomlink`.

Sanity 2026-11-11 12u op #183–#189 (reservekopie met uploads, kaartprint/storingsmelding, sjabloonknop, Amsterdam):
nieuwe route `/api/beheer/backup-status` alleen met de beheersleutel; de back-uplaag weigert symbolische links en onveilige
paden, het statusbestand staat in de datamap buiten `/uploads`; `sjablonenVoorApp` voegt alleen `magWeg` toe;
`kaart.html` en `index.html` zonder nieuwe `innerHTML` met invoer; #189 raakt alleen `railway.json`. Geen gat.

- **OPGELOST 2026-11-11 12u (deze PR) — LAAG — abonnement opzeggen zonder beheerdersrol.** `/v2/proef/opzeggen` hing alleen
  aan de proefcookie van het apparaat; op een gedeelde praktijkcomputer kon elke collega (ook rol therapeut) opzeggen, en 30
  dagen na de betaalde maand wist de server alle patiëntkaarten. Repro lokaal: cookie + `actie=opzeggen&zeker=1` → 200
  "Je abonnement is opgezegd". Nu: hoort de aanmelding bij een beveiligde praktijk, dan vraagt het formulier het wachtwoord
  van een beheerder (of het gedeelde praktijkwachtwoord zolang dat aan staat); zonder of met dat van een therapeut 403,
  missers tellen op de IP-rem (429 na 20), en "abonnement opgezegd" (met wie) en "opzeggen geweigerd" staan in Activiteit.
  Intrekken blijft zonder wachtwoord. Factuurgegevens, betalen en wissen houden alleen de cookie: die kunnen geen
  patiëntgegevens laten verdwijnen (wissen met abonnement weigert sinds #179). Test: `npm run test:opzeggenbeheer`.

Sanity 2026-11-11 08u op #179–#181 (eigen fix proefwissen, verwerkersovereenkomst, afspraakreeks/titel op /k): #180 raakt
alleen `VWO_VERSIE`, een akkoordregel en twee getallen voor /privacy; #181 alleen `public/kaart.html` zonder nieuwe `innerHTML`
met invoer. Geen gat.

- **OPGELOST 2026-11-11 (deze PR) — MIDDEL — collega met rol therapeut wijzigt het praktijkprofiel** (doorgezet door de
  gebruikers-sweep 02u, Mark; nu bevestigd). `POST /api/praktijken` had alleen `eisBeveiligdePraktijk`. Repro lokaal: therapeut
  stuurt `{tel:"0900-OPLICHTER", website:"https://example.org/phish"}` of een logo → 200, en /api/kaart van elke patiënt toont
  dat nummer en die link; geen logboekregel. Nu: met een praktijksessie mag alleen een beheerder (of het gedeelde
  praktijkwachtwoord) iets wijzigen, een therapeut krijgt 403; een ongewijzigd profiel blijft 200 (de app stuurt het bij elk
  verlaten van een veld), en elke wijziging staat als "praktijkgegevens of logo gewijzigd" met wie in Activiteit.
  Test: `npm run test:profielbeheer`. Gevolg voor UI (gebruikers-sweep): een therapeut die de praktijkvelden op de kaart
  aanpast, ziet dat alleen lokaal; overweeg die velden voor een therapeut alleen-lezen te maken met een korte uitleg.

Sanity 2026-11-11 04u op #176–#178 (wissen op de telefoon, vinkjes/taal op /k, factuurgegevens): nieuwe POST
`/v2/proef/factuurgegevens` heeft `kruisSite`, body ≤ 4 KB, alleen de eigen proefcookie met een actief/opgezegd
abonnement, lengte- en regelgrens, alles door `htmlEsc`/`esc` (ook op de factuur, CSP `default-src 'none'`).
`kaart.html` zonder nieuwe `innerHTML` met invoer. Geen gat.

- **OPGELOST 2026-11-11 (deze PR) — MIDDEL — "Gegevens wissen" op /v2/proef maakte een betalende praktijk gratis en
  voor altijd klant.** `/v2/proef/wissen` (alleen de proefcookie, geen beheerdersrol) bracht de aanmelding met een betaald
  abonnement terug tot de fiscale rest met `klant: true` en `gewist`. De proefronde slaat gewiste aanmeldingen over: geen
  maandincasso meer, het abonnement liep nooit af, de praktijk werd nooit gewist en bleef kaarten maken. Na een beëindigd
  abonnement zette dezelfde knop `klant` weer op true: de app ging weer open. Repro lokaal: claim met proefcookie, wissen
  → 200, daarna `POST /api/kaarten` met de praktijksessie 200. Nu: met een betaald abonnement en een gekoppelde praktijk
  geeft de route 409 en verwijst naar opzeggen of Mijn gegevens; een praktijk aan een gewiste aanmelding staat op slot
  (`praktijkProefVerlopen`). Test: `npm run test:proefwissenklant`. Gevolg voor UI (gebruikers-sweep): het blok "Je gegevens
  wissen" op Mijn proef staat er nog bij een abonnement; de knop legt nu uit waar het wel kan.

Sanity 2026-11-11 00u op #172–#174 (wachtwoordrem per lid, privacytekst, Annuleren/te zwaar offline/wissen op /k):
#173 en #174 raken geen server, geen nieuwe `innerHTML` met invoer. Geen gat.

Sanity 2026-11-10 20u op #170 en #171 (privacyverklaring patiënten, herstelknoppen/laadtekst op /k): alleen tekst en
`public/kaart.html` zonder nieuwe `innerHTML` met invoer, geen serverwijziging. Geen gat.

- **OPGELOST 2026-11-11 (deze PR), deels — HOOG (gebruikers-sweep 2026-11-10 22u, Mark) — elke therapeut kan elke
  patiëntkaart van de praktijk definitief verwijderen, zonder logboekregel.** Bevestigd lokaal: collega met rol therapeut →
  `POST /api/kaarten/verwijder` 200, kaart en video's weg, niets in het logboek. Nu: `kaart-verwijderd` met wie het deed in
  het logboek en in Activiteit (zonder kaartnaam of kaart-id). Kaarten hebben geen maker-veld; óf alleen maker/beheer mag
  verwijderen is een productkeuze en staat in `docs/mensenwerk.md`. Test: `npm run test:auditspoor`.

- **OPGELOST 2026-11-11 (deze PR) — MIDDEL — een buitenstaander kon het logboek van elke praktijk wegdrukken.**
  `praktijkAudit` was één lijst van 500 regels voor alle praktijken samen. Elk verzoek zonder login op een kaartroute van een
  beveiligde praktijk schrijft `toegang-geweigerd`, elke foute login op een verzonnen naam `login-mislukt`. Repro lokaal:
  300× `GET /api/kaarten?praktijk=<naam>` zonder sessie + 300 foute logins op verzonnen namen (wisselende IP's) → Activiteit
  van de praktijk leeg, ook "beveiligd" en "kaart verwijderd" weg. Nu: plafond per praktijk (300 gewone regels, 50 regels die
  iemand zonder login kan veroorzaken), totaal 5000, en bij vol eerst de oudste ruis weg. Test: `npm run test:auditspoor`.

- **OPGELOST 2026-11-10 (deze PR) — LAAG — collega kon met foute pogingen bij wachtwoord wijzigen de praktijk op slot
  zetten** (NAKIJKEN van de gebruikers-sweep 14u, nu bevestigd). `/api/praktijk/wachtwoord` telde een fout eigen wachtwoord
  van een lid via `loginMisTel(pk)` op de sleutel van de praktijk. Repro lokaal: lid tikt 10× een fout huidig wachtwoord,
  daarna gaf inloggen met het praktijkwachtwoord 429 (bij een praktijk met de naam als sleutel; anders alleen wachtwoord
  wijzigen en herstelcode voor de beheerder). Een geslaagde wijziging door een lid wiste ook de teller van een lopende aanval
  op het praktijkwachtwoord. Alleen voor iemand die al is ingelogd. Nu: missers van een lid tellen op `lid:<praktijk>:<id>`.
  Test: `npm run test:wachtwoordrem`.

Sanity 2026-11-10 16u op #166 en #168 (AI-melding voorleesstem, pijncijfers/agenda bij 200 % tekst): alleen
`public/kaart.html` en `noor-audio.js`, geen nieuwe `innerHTML` met invoer, geen serverwijziging. Open PR #167
(reservekopie buiten Railway, proef verplicht, mail vóór wissen) nagelopen: AES-256-GCM met scrypt-sleutel vóór verzenden,
https verplicht, korte wachtzin = uit, geen geheimen in logs. Geen gat.

- **OPGELOST 2026-11-10 (deze PR) — MIDDEL — inlogrem per IP liet een goed wachtwoord toch binnen.** Elke foute
  inlogpoging telt via `denied()` in de rem per IP (20 per 5 min), maar `/api/praktijk/login`, `/api/praktijk/herstel` en
  `/api/v1/login` keken vóór het controleren van het wachtwoord niet of het IP al op die rem stond. De rem veranderde dus
  alleen het antwoord op een fout wachtwoord (429 in plaats van 403); een goed wachtwoord gaf nog 200. Omdat de rem per naam
  per ingetikte naam telt, kon één IP zo een veelgebruikt wachtwoord over alle praktijknamen blijven proberen (alleen de
  schrijfrem van 40 per 5 min). `/v2/gegevens/download|wissen` (download van alle kaarten) en `/v2/proef/overzicht`
  telden foute pogingen helemaal niet per IP. Repro lokaal: 21 foute logins op steeds een andere naam, daarna het goede
  wachtwoord vanaf hetzelfde IP → 200. Nu: `inlogOpRemIp` vóór de wachtwoordcontrole (429), en de twee formulieren tellen
  missers mee. Een ander IP en gewone, geslaagde logins merken niets. Test: `npm run test:inlogrem`.

Sanity 2026-11-10 12u op #159–#164 (sleutelformulier beheer, mailrem uitnodigingen, verdwijndatum praktijk, verlopen
proef op tweede apparaat, nieuwe patiëntkaart): `proefVerlopen` in de praktijkstatus komt alleen uit de eigen proefcookie
of de ingelogde praktijk; `verdwijntOp` leest alleen de eigen proef; het beheerformulier zet vaste tekst in `innerHTML`
en de foutmelding via `textContent`. Geen nieuw gat.

- **OPGELOST 2026-11-10 (deze PR) — MIDDEL — beheersleutel raden zonder rem.** De rem (20 foute pogingen per 5 min per
  IP) telde alleen in `denied()`. Routes die beheer als extra recht gebruiken roepen `isAdmin` aan zonder `denied`:
  GET `/api/praktijken` (beheer krijgt de hele praktijkenlijst, anders alleen de eigen), `/api/opname/start` met
  `doel: "oefening"`, de videopaden in POST `/api/kaarten`, en de schrijf-/leesremmen. Het antwoord verschilt bij de
  juiste sleutel, dus daar kon je onbeperkt raden (alleen de leesrem van 120 per 5 min, met een nieuw IP opnieuw).
  Repro lokaal: 21 foute sleutels op GET `/api/praktijken` gaven elk 200, daarna opende de juiste sleutel `/api/dashboard`
  nog gewoon. Nu telt `isAdmin` zelf elke foute, niet-lege sleutel (één keer per verzoek). Verzoeken zonder sleutel
  tellen niet. Test: stap 7 in `scripts/test-beheersleutel.mjs` (`test:beheer`).

Sanity 2026-11-10 08u op #157–#158 (voorwaarden art. 4 incasso, controlezinnen in de kaarttaal, wissen spaart beelden
van een andere kaart, emoji-initiaal): server.js alleen een nieuwe AV-versie en tekstvariabele; /k-meldingen via `tr()`
als tekst, de cache-opruiming kijkt alleen naar `fp_beelden_<id>` op het eigen apparaat. Open PR #159 (beheersleutel in
een dialoog in plaats van `prompt`): sleutel blijft alleen in sessionStorage, geen sleutel in publieke bestanden. Geen gat.

Sanity 2026-11-10 04u op #151–#155 (maandincasso, factuur per maand, vertaalcache wissen, print/uitloggen): de factuur
`?nr=` zoekt alleen in de eigen proef (404 voor een andere praktijk), de webhook beoordeelt alleen eigen betaal-id's met
metadata, periode en bedrag, mails zijn platte tekst, `rij()` in de factuur escapet. Wel gevonden (OPGELOST, zie hieronder):
een weggevallen Mollie-antwoord kon een tweede afschrijving geven.

- **OPGELOST 2026-11-10 (deze PR) — MIDDEL — maandincasso kon dubbel afschrijven.** `POST /payments` heeft een time-out
  van 15 s. Maakte Mollie de betaling wel aan maar viel het antwoord weg (time-out, 5xx), dan was er lokaal niets opgeslagen
  en maakte de volgende uurronde een tweede incasso voor dezelfde maand op het mandaat van de praktijk. Ook konden twee
  overlappende rondes (een trage ronde plus het uur-interval) dezelfde maand tegelijk incasseren. Fix: vaste
  `Idempotency-Key` per praktijk en periode (`incassoSleutel`), en `proefRonde` draait nooit twee keer tegelijk.
  Test `scripts/test-incasso-dubbel.mjs` (in `test:abonnement`). Alleen actief met `MOLLIE_INCASSO=aan`, dat staat nog uit.

Sanity 2026-11-10 00u op #143–#150 (Physitrack-avatars, regio-oefeningen en 116 nieuwe behandelkaarten, categorie-indeling,
niet-vertaalde uitleg op /k): geen wijziging in server.js of lib/ sinds #141; de nieuwe melding op /k is `textContent`, de
lightbox-uitleg gaat door `esc()`, de categorieën in de app zijn vaste labels. Geen gat.

Sanity 2026-11-09 20u op #139–#140 (juridische teksten B1, wissen na proef alleen met vinkje, knop na uitnodiging met
klaargezette praktijknaam, behandelkaartenbibliotheek): `/v2/proef/wissen` houdt `kruisSite` en eist nu ook `zeker=1`;
de knoplink gaat door `htmlEsc`, `TEKST` door `serveerProef` (escapet); `?praktijk=` gaat alleen in `.value`; de nieuwe
`innerHTML` in de bibliotheek escapet namen met `esc()`, sleutels zijn `bron:index`. Geen gat.

Sanity 2026-11-09 16u op #129–#137 (wissen na proef zonder abonnement 30 dagen, linkerpaneel, avatars, Noor-stop en
wachtrij op /k): `proefRonde` wist alleen accounts met `acc.proef.id` van een verlopen niet-klant-aanmelding; de koppeling
bij inloggen was te ruim (zie Open, opgelost). #130 en #137 zijn alleen front-end; de nieuwe meldingen op /k zijn
`textContent`, de wachtrij herhaalt alleen de eigen patiëntroutes. Geen ander gat.

Sanity 2026-11-09 12u op #120–#128 (proefpraktijk zonder abonnement wissen, roepnaamvoorstel alleen bij dezelfde voornaam,
duidelijke foutmeldingen bij inloggen, Physitrack-beelden): `proefZonderAbonnementWissen` laat klanten staan zolang hun
aanmelding bestaat; de nieuwe `denied`-teksten verraden niet welk veld fout is; `roepOk` werkt alleen binnen de eigen map.
Wel gevonden: was `proef-aanmeldingen.json` onleesbaar, dan wiste het uurrondje ook klanten zonder kaarten (opgelost, zie Open).

Sanity 2026-11-09 00u op #109–#111 (videoquotum, werknotitie mee naar dossier, lightbox/proefvenster): `notitieT`
reist alleen mee in het praktijkoverzicht (achter de praktijkpoort), niet in de patiëntroute (allowlist); de nieuwe
`innerHTML` in de app is vaste tekst. Geen gat.

Sanity 2026-11-09 08u op #112–#119 (abonnement opzeggen, automatisch wissen na einde, behandelaar bij nieuwe kaart,
doseringsvraag in de vraaghulp, Physitrack-beelden): `/v2/proef/opzeggen` heeft `kruisSite` + proefcookie (SameSite=Lax);
`MIJN_KOP` gaat door `htmlEsc`; `behandelaarVanSessie` neemt alleen de naam van het eigen lid (s.pk === pk, stuurtekens
weg, 40 tekens); automatisch wissen zoekt de praktijk op het proef-id van het account. Geen gat. Wel: opzeggen maakt
`kruisSite` belangrijker (een geslaagde CSRF zegt op en wist 30 dagen later alles), zie hieronder.

AFGESLOTEN 2026-11-09 (geen gat): `/api/opname/start` met doel "oefening" zonder beheerdersrechten (sweep 06u, Mark) geeft
200 maar maakt altijd een kaartopname (`doel === "oefening" && isAdmin`), met dezelfde praktijkpoort; er is geen
bibliotheekschrijfpad zonder beheersleutel.

Audit (e) 2026-11-09 00u:
- **OPGELOST 2026-11-09 (deze PR) — MIDDEL — praktijkprofiel en logo van een praktijk zonder wachtwoord
  overschrijfbaar door iedereen.** `POST /api/praktijken` gebruikte `eisPraktijk`, die bij een niet-geclaimde praktijk
  alles doorlaat. Het profiel (telefoon, e-mail, website, logo) staat via `/api/kaart` op elke gedeelde patiëntkaart
  van die praktijk. Met alleen de praktijknaam (staat op de geprinte kaart) kon iedereen er een eigen nummer, website
  of logo neerzetten: phishing namens de praktijk. Repro lokaal: POST `/api/praktijken` met `{praktijk, adres, tel}`
  zonder cookie gaf 200 en `/api/kaart?id=…` toonde daarna het valse nummer. Nu: `eisBeveiligdePraktijk` (zonder
  wachtwoord alleen v1 en een eigen beheersleutel); de v2-app stuurt het profiel direct na beveiligen mee.
  Test: `npm run test:profielovername`.
- Verder nagelopen, geen gat: `/api/opname/upload` (token 48 bits, eenmalig, TTL, cross-site dicht, 60 MB vóór
  bufferen, mp4/webm op magische bytes, quotum), beheer-uploads (alleen `isAdmin`), logo en eigen-oefeningfoto
  (dataURL-regex + `echteAfbeelding`, 400/600 kB), `/uploads/` (normalize + prefixcheck, extensie-allowlist,
  nosniff, CORP same-origin, noindex).

Sanity 2026-11-08 20u op #106–#108 (verwijderde collega, Mijn gegevens-download, niet stil hernoemen): de nieuwe
409-vraag in `POST /api/kaarten` zit achter dezelfde praktijkpoort en geeft alleen de naam van een kaart uit de
eigen map terug. Geen gat.

Audit (i) + (j) 2026-11-08 20u:
- **OPGELOST 2026-11-08 (deze PR) — MIDDEL — één praktijk kon de videogrens voor alle praktijken volzetten.**
  Iedereen kan gratis een praktijk claimen (5 per IP per dag) en daarna via `/api/opname/start` + `/o` eigen
  video's tot 60 MB uploaden en op de eigen kaarten zetten (100 kaarten × 12 video's). Die tellen tegen de gedeelde
  grens `VIDEO_OPSLAG_MAX_MB` (4 GB) en verdwijnen pas met de kaart. Na ~70 uploads kreeg elke andere praktijk
  blijvend 507 "videopslag is vol". Nu: quotum per praktijk `VIDEO_PRAKTIJK_MAX_MB` (standaard 500 MB) over de
  opnames op de eigen kaarten plus nog niet opgeslagen opnames; daarboven 507 met `praktijkVol`, andere praktijken
  merken niets. Test: `npm run test:videoquotum`.
- **LAAG — restrisico: meerdere geclaimde praktijken samen** (8 × 500 MB = 4 GB, met 5 claims per IP per dag twee
  dagen vanaf één IP). Voorgestelde fix: bij de 507 van de gedeelde grens een melding in het beheerdashboard, of
  voor praktijken in een proef een lager quotum (bv. 100 MB). Nu niet gebouwd: het quotum maakt het al veel duurder.
- **LAAG — gelijktijdige uploads kunnen het quotum met hooguit 4 × 60 MB overschrijden** (`lopendeUploads` ≤ 4, de
  telling gebeurt na het bufferen). Acceptabel; fix zou een reservering per praktijk zijn.
- Verder nagelopen, geen gat: plafonds op praktijken (200/300/1000), kaarten per praktijk (100), metingen/gedaan
  (366), ervaring/psk (120), contactlogboek (50), oefTrouw (60), oefzwaar (24), eigen oefeningen (200, foto 600 kB),
  sjablonen (30), teamleden (50), proeven (5000), v1-tokens (500), opnametokens (200, TTL 15 min), logo 400 kB,
  eigen categorieën (100); `/api/stats/event` alleen tellers met eigen rem. `npm audit`: 0 meldingen.

Sanity 2026-11-08 16u op #103–#105 (Mijn gegevens in 9 talen, roepnaamvoorstel/landing printbaar, oefenteksten):
alleen `PRIVACY_VERSIE` in server.js, geen nieuwe routes; de nieuwe vertalingen zijn vaste tekst. Geen gat.

Sanity 2026-11-08 12u op #99–#101 (prijs €9,99, samenvatting VWO/voorwaarden, dubbeltik/seintje-antwoord): geen
nieuwe routes of velden; de nieuwe foutmelding in de seintje-venster is vaste tekst. Geen gat.

Audit (d) 2026-11-08 12u:
- **OPGELOST 2026-11-08 (deze PR) — MIDDEL — therapeutroutes op één kaart open voor iedereen bij een praktijk
  zonder wachtwoord.** `/api/kaart/antwoord`, `afspraak`, `nieuwe-link`, `archief`, `naam`, `notitie`,
  `behandelaar`, `psk-doel`, `doel`, `seintje/gezien` en `oefzwaar/gezien` gebruikten `eisPraktijk`, die bij een
  niet-geclaimde praktijk alles doorlaat. Kaarten van zo'n praktijk bestaan (gedeeld via v1 of de beheersleutel,
  of van vóór de wachtwoordplicht). Met alleen de praktijknaam en het kaart-id (beide op de geprinte kaart/QR) kon
  iedereen namens "de praktijk" een bericht en afspraak op de patiëntkaart zetten (phishing), de kaart archiveren
  (weg na de bewaartermijn), de patiëntlink breken of het seintje wegtikken. Repro lokaal: POST
  `/api/kaart/antwoord` met `{praktijk, id, tekst}` zonder cookie gaf 200. Nu: `eisBeveiligdePraktijk`, dezelfde
  poort als het overzicht; v1-sessies en een eigen beheersleutel werken nog. Test: `npm run test:kaartroutes`.
- **OPGELOST 2026-11-10 (deze PR) — LAAG — teamsjablonen van een praktijk zonder wachtwoord zijn op naam te lezen/overschrijven**
  Opslaan eiste al een claim; lezen en verwijderen niet. Na een claim-reset door beheer of onder een oude naamsleutel
  bleven sjablonen op naam leesbaar en weg te halen. Nu `eisBeveiligdePraktijk` op GET en verwijder (de app vangt de 401
  al op). Test: `npm run test:sjablonenslot`. Oorspronkelijk:
  (`/api/praktijk/sjablonen` GET/POST/verwijder en `POST /api/praktijken` gebruiken `eisPraktijk`). Geen
  patiëntgegevens; v2 deelt pas na beveiligen. Fix (eventueel): ook `eisBeveiligdePraktijk`, na een check dat de
  app sjablonen niet vóór het beveiligen opslaat.
- Verder nagelopen, geen gat: kaart-id 6 bytes (48 bits) met `kaartMisLimiet` (30 missers per 5 min per IP, laatste
  XFF-element, IPv6 per /64) op alle kaartroutes; `GET /api/kaart` geeft alleen de allowlist (geen notitie,
  behandelaar, seintje, contactlogboek, kaartlabel); praktijkroutes zoeken alleen in de map van de eigen sessie
  (`praktijkVan`), dus geen IDOR tussen praktijken; `nieuwe-link` maakt het oude id meteen ongeldig.

Sanity 2026-11-08 08u op #95–#96 (weesopnames, seintje-voorrang, QR-taal, roepnaam = kaartnaam, eerste deling):
`weesOpnamesOpruimen` raakt alleen `v-<hex>.mp4|webm` zonder lopend token en laat `ruimKaartVideosOp` beslissen
(niets wat een kaart of oefening nog gebruikt); `zetSeintje` krijgt alleen een gecontroleerde `soort`, `ook` bevat
alleen vraag/pijn en het overzicht escapet via `htmlEsc`. Geen gat.

Audit (c) 2026-11-08 08u:
- **OPGELOST 2026-11-08 (deze PR) — MIDDEL — login-CSRF via de maillink `/v2/proef/terug`.** De GET zette meteen
  de proefcookie. Elke website kon een therapeut met één link (top-level navigatie; `SameSite=Lax` stuurt dan mee)
  de eigen, verlopen proef van de aanvaller laten overnemen. Gevolg: op dat apparaat de verlopen-pagina en 403 op
  alle schrijfroutes (`proefSlotVoor` kijkt naar de cookie), ook voor een betalende praktijk; en een praktijk die
  daarna op dat apparaat werd beveiligd (`claim`) of inlogde, werd met `proefKoppel` blijvend aan de proef van de
  aanvaller gekoppeld, waarmee die praktijk op elk apparaat dicht ging. Daarnaast verbruikte een linkscanner in de
  mailbox de eenmalige maillink al vóórdat de therapeut hem opende. Nu: een GET van een andere site of zonder
  `Sec-Fetch-Site` toont alleen een knop; de cookie komt pas bij een POST van fysiplan zelf (`kruisSite`) of bij
  een link die de gebruiker zelf opende (`Sec-Fetch-Site: none`, mail-app). De eenmalige link wordt pas dan
  verbruikt. Test: `npm run test:proef`.
- Verder runtime nagelopen, geen gat: opnieuw aanmelden met een bekend adres zet geen cookie en wijzigt niets
  (maillink naar het echte adres); opnieuw aanmelden met de eigen verlopen proef verlengt niets; `/v2/proef/wissen`,
  `doorgaan`, `betalen` en `overzicht` achter `kruisSite`; raden van een code valt onder `kaartMisLimiet` (192 bits).
- **Afgesloten 2026-11-08 — LAAG (te controleren) — patiëntroutes accepteren `text/plain`** (zie Open): geen gat.
  Alle patiënt-POST-routes staan achter `kruisSite`; een browser stuurt bij een cross-site POST altijd `Origin` en
  (sinds 2023 overal) `Sec-Fetch-Site`, dus een andere website wordt geweigerd ongeacht het content-type. Een verzoek
  zónder Origin komt niet uit een browser (curl), en dat kan hooguit wat de kaartlink zelf al toestaat: de
  patiëntroutes werken op het kaart-id, niet op een cookie.

Sanity 2026-11-08 04u op #91–#93 (Mijn gegevens-download, offline vinkje per oefening, factuur): `/v2/proef/factuur`
alleen met de eigen proefcookie, 404 zonder betaling, alle velden via `esc()`, CSP `default-src 'none'`; de
patiëntroute geeft van het contactlogboek alleen soort en moment van eigen seintjes; het vinkje gebruikt
`tikMoment` (hooguit 14 dagen terug) en het plafond van 60 oefeningen. Geen gat.

Audit (b) 2026-11-08 04u: claim (rem nieuwe praktijk, 409 op bezette naam, akkoord verplicht), inloggen op naam
(rem per naam, gedeeld-uit telt niet mee), op e-mail (rem per adres, alleen actieve leden), wachtwoord wijzigen en
nieuwe herstelcode (sessie + huidig wachtwoord, rem per praktijk), herstel (gedeeld-uit doet niet mee), uitnodiging
(token sha256, 7 dagen, eenmalig), overzicht na proef en /v2/gegevens met e-mail (rem per naam, wissen alleen
beheerder). Eén gat, hieronder opgelost; de overige open punten van (b) staan al in Open.

Sanity 2026-11-08 00u op #87–#89 (wissen van de telefoon, offline-wachtrij met `wanneer`, naam wijzigen): `wanneer`
komt van de patiënt maar wordt begrensd op hooguit 14 dagen terug en nooit in de toekomst (`tikMoment`), per dag
één waarde, lijsten blijven op 366/120/50 afgekapt; een ouder seintje verdringt geen nieuwer. Geen gat.

Audit (h) en (a) 2026-11-08 00u:
- **OPGELOST 2026-11-08 (deze PR) — LAAG: rem op de beheersleutel hield raden niet tegen.** Zie onder Open.
- **OPGELOST 2026-11-08 (deze PR) — LAAG — `/api/kaart/vraag` geeft 502 "even niet bereikbaar" op een kapotte body** (`{`, `null`, geen JSON). De
  algemene `catch` vangt de parse-fout. Geen lek (vaste tekst), wel een misleidende status. Fix: parse-fout → 400.
  Nu: geen JSON of geen object → 400 vóór de kaart wordt gezocht. Test: `npm run test:teamherstel`.

Sanity 2026-11-07 20u op #81–#85 (logo-veeg, printknop, overzicht na proef met eigen login, proefcookie wissen,
proefaanmelding in download/wissen): overzicht-login met e-mail valt onder dezelfde rem per praktijknaam en eist een
actief lid; `?apparaat=1` bij uitloggen zit achter `kruisSite`; download laat `tokens`/`mailLink` weg; een gewiste
proef met betaling houdt geen apparaat-tokens. Geen gat.

Sanity 2026-11-07 16u op #74–#80 (vraaghulp-grens, kaarttaal, UI-schil, avatarrondjes): geen nieuwe routes;
nieuwe innerHTML-plekken escapen namen via `esc()`/`avRond()`. Geen gat.

Audit (e) 2026-11-07 16u:
- **OPGELOST 2026-11-07 (deze PR) — MIDDEL: nieuw logo wiste logo's van andere praktijken.** De opruiming na
  `POST /api/praktijken` verwijderde elk bestand dat met `logo-<slug>-` begon. Een onbeveiligde praktijk "Fysio"
  wiste zo zonder login het logo van "Fysio Noord", en "P" dat van elke praktijk met een vaste code (`logo-p-…`).
  Nu alleen `logo-<slug>-<tijd>.<ext>` en nooit een bestand dat een ander profiel noemt. Test: `npm run test:logoveeg`.
- Opname-upload (`/api/opname/upload`): token eenmalig, proefslot, 60 MB-grens vóór bufferen, inhoud mp4/webm
  gecontroleerd, opslagwaakhond. Eigen oefening en logo: JPEG/PNG op magische bytes, 600/400 kB. `/uploads/`:
  pad-normalisatie, extensielijst, nosniff, CORP same-origin. Geen gat.

Sanity 2026-11-07 12u op #64–#72 (praktijkcode, team, inbox, patiëntkant, akkoord, wissen, UI): team-routes
eisen sessie + beheerdersrol (live gelezen), verwijderen trekt sessies meteen in, uitnodigingstoken alleen als
sha256 en 7 dagen, inbox/dossier via `eisBeveiligdePraktijk` en `praktijkVan`. Eén gat: herstelcode na
"gedeeld wachtwoord uit" (hieronder opgelost).

Sanity 2026-11-07 08u op #57 (Mollie), #59, #60 (kaart hernoemen): geen gat. De webhook haalt de betaling
zelf op bij Mollie en controleert id, proef en bedrag; hernoemen zoekt het kaartId alleen in de eigen praktijk.

## Open

- **OPGELOST 2026-11-12 16u (deze PR, test:gegevensrem) — MIDDEL (gebruikers-sweep 2026-11-12 14u, Karin, gemeten lokaal) — pogingen van een therapeut op /v2/gegevens sluiten de beheerder buiten.** Bevestigd lokaal: na tien pogingen van de therapeut (of tien foute wachtwoorden van een buitenstaander op een willekeurig adres) gaf het goede wachtwoord van de beheerder 429. Nu: met een e-mailadres telt de rem per adres (`mail:<adres>`, dezelfde sleutel als inloggen in de app), zonder e-mail per praktijknaam; een collega met het juiste wachtwoord maar zonder beheerdersrol krijgt 403 zonder misser (logboek: download-/alles-wissen-geweigerd). De rem op het adres van de beheerder zelf werkt nog (429 na tien missers).
  Een therapeut met het juiste e-mailadres, wachtwoord en code krijgt terecht 403 ("…alleen een beheerder…"), maar elke poging telt als misser
  op de praktijknaam (server.js r. ~8124, `loginOpSlot` r. ~238). Na tien pogingen kan ook de beheerder 15 minuten niet downloaden of wissen;
  dat kan iedereen die de praktijknaam kent. Voorstel: een geslaagde login van een niet-beheerder niet als misser tellen, en de rem per
  adres + persoon in plaats van alleen per praktijknaam.
- **LAAG (gebruikers-sweep 2026-11-12 14u, Karin) — elke therapeut leest de Activiteit van de hele praktijk** (`GET /api/praktijk/activiteit`,
  server.js r. ~4067–4089, geen `isBeheer`): logins van collega's (naam, gemaskeerd IP), mislukte pogingen, rol- en teamwijzigingen.
  Bewuste keuze of alleen beheerder? Het logboek houdt bovendien maar 15 regels, dus beheeracties zakken snel weg.
- **LAAG (gebruikers-sweep 2026-11-12 14u, Karin) — uitnodigen accepteert `<script>@x.nl` als e-mailadres** (`geldigEmail` server.js
  r. ~1075 laat `<>` toe); overal ge-escaped, geen XSS, wel onzin in team en logboek.

- **TER INFO voor audit (a), (b) en (g), 2026-11-12 (platformreview, test:beheeraccounts) — beheer heeft persoonlijke accounts.**
  Nieuw aanvalsvlak: `POST /api/beheer/login`, `/logout`, `/accounts`, `/accounts/uit`, `/wachtwoord`, `GET /api/beheer/ik` en
  `/overzicht`, `lib/beheer.js`, `public/beheersleutel.js`, en de bestanden `beheer-accounts.json` (scrypt-hash, TOTP-geheim
  leesbaar, reservecodes als hash), `beheer-sessies.json` (alleen sha256(token) plus een afdruk van de wachtwoordhash; niet in de
  reservekopie) en `beheer-log.jsonl` (alleen erbij schrijven). Hoe het in elkaar zit: de sessie staat in `__Host-fpbeheer`
  (lokaal `fpbeheer`; HttpOnly, SameSite=Strict, twaalf uur) en telt alleen samen met de kop `x-admin-sleutel: account`;
  `eigenCookie` negeert de cookie bij `kruisSite`. `isAdmin` laat een account of de sleutel toe, `beheerEigen` een account of een
  eigen sleutel (alle plekken die vroeger `ADMIN_KEY_EIGEN && isAdmin` vroegen). Een nieuw account heeft een startwachtwoord van een
  week; een sessie komt er pas na een eigen wachtwoord (12 tekens) en een ingestelde tweede stap. Rem: tien foute wachtwoorden per
  kwartier per adres (`beheerRem`, alleen in het geheugen), de bestaande rem per verbinding, en de dagteller van de tweede stap op
  schijf. Staat een adres op slot, dan krijgt elk verzoek hetzelfde 429, behalve wachtwoord plus goede code: zo sluit wie alleen
  het adres kent de eigenaar niet buiten, en is er geen antwoord meer dat zegt of een wachtwoord klopt (het verzoek met een goed
  wachtwoord en een foute code schrijft wel naar schijf en duurt dus iets langer). Een onbekend adres krijgt hetzelfde antwoord na
  dezelfde rekentijd (`BEHEER_NEPHASH`).
  Bewust zo gelaten, graag meewegen bij de volgende audit:
  (1) de sleutel houdt alle rechten zolang `ADMIN_KEY` op de server staat, ook accounts maken en uitzetten: dat is de weg voor
  het eerste account en de weg naar binnen als niemand meer kan inloggen. Het beheerlogboek noemt hem "beheersleutel";
  (2) de beheerpagina's hebben alleen `frame-ancestors 'none'`, geen script-CSP: een XSS op een beheerpagina kan handelen zolang de
  pagina open is, maar de sessie niet meenemen;
  (3) `/aanmeldingen` en `/medewerkers` (de accountlaag van V1 met `ACCOUNT_BEHEER_EMAILS`) hebben geen tweede stap en zijn niet
  op de beheeraccounts overgezet;
  (4) `/api/praktijk/login` antwoordt bij een onbekend e-mailadres nog sneller dan bij een bekend adres met een fout wachtwoord
  (niet gemeten, gelezen in de code); de beheerlogin doet dat niet;
  (5) wie bij de schijf kan, kan het logboek aanpassen: het is een spoor voor beheerders onderling, geen bewijs tegen de hoster.
  Daarom gaat bij een account erbij, opnieuw gemaakt of uitgezet ook een mail naar de beheerders en het meldadres.
- **TER INFO voor audit (b) en (g), 2026-11-12 (platformreview, test:sessiecookie) — de praktijksessie staat nu in een cookie.**
  Tot nu toe stond de sleutel in `localStorage` en ging hij mee in `x-praktijk-sessie`; oudere notities hier en in het oude
  logboek ("geen cookie, dus geen CSRF op de ingelogde schrijfroutes") gelden daardoor niet meer. Nu: cookie `__Host-fpsessie`
  op https (`fpsessie` zonder https), `HttpOnly`, `SameSite=Strict`, `Secure`, 30 dagen, zonder `Domain`. Een verzoek met
  `Sec-Fetch-Site` of `Origin` krijgt de sleutel niet meer in het antwoord. Tegen CSRF staan twee sloten: `SameSite=Strict`, en
  `sessieCookieVan` negeert de cookie als `kruisSite` het verzoek van elders vindt (ook `same-site` met een andere Origin). Elke
  route die een sessie uitdeelt weigert eerst een andere website (statisch vastgelegd in de test). Bewust zo gelaten: een verzoek
  zonder browserkoppen krijgt de sleutel in het antwoord en mag de kop blijven gebruiken (tests, eigen programma's); de kop wint van
  de cookie; bij omruilen (`/api/praktijk/sessie-cookie`) krijgt dezelfde sleutel een cookie voor de resterende tijd, er komt geen
  nieuwe. Een script op de pagina kan nog steeds handelen zolang de pagina open is; het kan de sleutel niet meer meenemen.
- **OPGELOST 2026-11-12 06u (gebruikers-sweep, deze PR, test:loginanderepraktijk) — HOOG (Karin, desktop) — inloggen met e-mail
  negeerde de praktijknaam als de login maar bij één praktijk hoorde.** Een collega met alleen een login bij Beta kwam op het scherm van
  Alfa stil bij Beta binnen (200, sessie van Beta); een verwijderde collega met een tweede praktijk dacht zo dat hij er nog in zat.
  Nu 409 met de naam van de eigen praktijk (`kies`), zonder sessie; zonder naam of met de goede naam/praktijkcode gewoon 200; fout
  wachtwoord blijft 403 zonder praktijknaam (server.js `/api/praktijk/login`).
- **OPGELOST 2026-11-12 12u (deze PR, test:kaartpraktijknaam).** Bevestigd lokaal: met de sessie van "Fysio Zonnig" (ook rol
  therapeut) gaf `POST /api/kaarten` met `praktijk: "Bel 0900-OPLICHTER"` 200 en toonde /api/kaart die kop aan de patiënt (zonder
  profiel ook als praktijknaam) en in de agenda-uitnodiging. Nu bewaart de server bij een beveiligde praktijk de eigen weergavenaam
  (`kaartPraktijkNaam`: profiel, anders de naam bij het beveiligen) en vervangt hij bij het lezen (/api/kaart, afspraak- en
  oefenmomenten-ICS) ook een oude kop die al op de server stond. Opnieuw openen met een afwijkende A4-kop hoogt de versie niet op.
  Zonder account (v1, beheer) blijft de opgeslagen naam. De A4-kop in de app zelf blijft vrij (alleen print). Oorspronkelijke melding:
- **MIDDEL (nieuw, gebruikers-sweep 2026-11-12 06u, Sanne + Karin) — de praktijknaam op de patiëntkaart komt van de client, niet van de
  sessie.** `POST /api/kaarten` bewaart `praktijk = cleanName(b.praktijk, 80)` (server.js r. ~5182) terwijl `pk` uit de sessie komt.
  Gevolg: na het hernoemen van de A4-kop tonen kaarten van één praktijk verschillende namen op /k ("Beveiligd bij 'Fysio Zonnig'" en
  tegelijk "Kaarten van de praktijk (…De Gezonde Rug…)"), en een therapeut kan een willekeurige praktijknaam als kop op de patiëntkaart
  zetten. /api/kaart valt terug op `found.praktijk` als het profiel ontbreekt (r. ~5475). Voorstel: bij een sessie de weergavenaam van
  de praktijk van de sessie bewaren/tonen; hernoemen alleen via het profiel (beheerder). Raakt index.html (kop op de A4) en server.js.

- **OPGELOST 2026-11-12 02u (gebruikers-sweep, deze PR, test:gedeeldwerk) — HOOG (Karin, desktop) — het gedeelde praktijkwachtwoord wiste
  de hele praktijk, ook de beheerders met eigen login.** `/v2/gegevens/wissen` zonder e-mail viel terug op `accountVoorLogin` (gedeeld
  wachtwoord) en wiste alles, ook het account van de eigenaar. Nu: heeft de praktijk een actieve beheerder met eigen login, dan wist
  alleen zo'n beheerder (met e-mail), net als bij het team (#201); 403 met uitleg en "alles-wissen-geweigerd" in het logboek. Downloaden
  met het gedeelde wachtwoord werkt nog (bewust gelaten; zie het punt hieronder).
- **OPGELOST 2026-11-12 04u (deze PR) voor (1); (2) AFGESLOTEN als geen gat.** (1) Bevestigd: met een beheerder met eigen login
  zegde het gedeelde praktijkwachtwoord het abonnement op (200). Nu 403 ("alleen een beheerder met een eigen login"), "opzeggen
  geweigerd" in Activiteit; zonder beheerder met eigen login werkt het gedeelde wachtwoord zoals voorheen. Test: uitgebreid
  `npm run test:opzeggenbeheer`. (2) Downloaden met het gedeelde wachtwoord laat ik bewust zo: een sessie met dat wachtwoord is
  beheerder en leest in de app al elke kaart en het logboek, dus de download geeft niets extra's; de tweede stap verplicht maken
  (#217) zet het gedeelde wachtwoord uit. Oorspronkelijke melding:
  **NAKIJKEN (gebruikers-sweep 2026-11-12 02u, Karin) — MIDDEL — zelfde patroon nog open:** (1) opzeggen van het abonnement met het
  gedeelde wachtwoord terwijl er een beheerder met eigen login is (`abonnementBeheerder`, server.js r. ~996; intrekken kan wel, dus
  herstelbaar); (2) alles downloaden (alle kaarten en het logboek) met het gedeelde wachtwoord, zelfde situatie. Kies of beide ook een
  beheerder met eigen login vragen.
- **OPGELOST 2026-11-12 04u (deze PR, test:praktijknaambezet).** Bevestigd lokaal (200, stil). Dubbele namen blijven mogelijk
  (zoals bij beveiligen), maar POST /api/praktijken geeft nu 409 `bezet` als een andere beveiligde praktijk de nieuwe naam al heeft
  (ook met andere hoofdletters); de app vraagt "Weet je het zeker?" en stuurt dan `zelfdeNaam: true`. Elke naamwijziging staat als
  "praktijknaam gewijzigd" met wie en oud → nieuw in Activiteit. Oorspronkelijke melding:
  **NAKIJKEN (gebruikers-sweep 2026-11-12 02u, Karin) — MIDDEL — beheerder hernoemt de praktijk stil naar de naam van een andere
  praktijk.** POST /api/praktijken met `praktijk: "<naam van praktijk B>"` geeft 200; daarna toont /k de naam van B en inloggen met naam
  B + het wachtwoord van A komt in A uit (B zelf onaangetast). server.js r. ~4192 en ~4255 (`praktijkAccounts[key].naam = p.praktijk`)
  zonder controle op `accountsMetNaam`. Verwacht: dezelfde waarschuwing als bij beveiligen.

- **OPGELOST 2026-11-11 20u (deze PR) — NAKIJKEN (van de gebruikers-sweep 2026-11-11 18u, Karin) — LAAG→MIDDEL:** bevestigd: met een
  sessie op het gedeelde praktijkwachtwoord (dat vaak het hele team kent) kon elke collega een beheerder met eigen login naar
  therapeut zetten én met `gedeeld: "laten"` uit het team verwijderen; in Activiteit stond alleen "rol gewijzigd" zonder naam. Nu:
  een gedeelde sessie krijgt 403 bij degraderen of verwijderen van een actieve beheerder met eigen login ("team-wijziging-geweigerd"
  met naam in Activiteit); iemand beheerder maken en therapeuten beheren blijft met de gedeelde sessie werken; een beheerder met
  eigen login kan een andere beheerder gewoon aanpassen. "Rol gewijzigd" en "collega verwijderd" tonen nu wie welke collega
  aanpaste. Test: `npm run test:teameigenbeheer`. Oorspronkelijke melding: zolang het gedeelde praktijkwachtwoord aan staat, kan een sessie
  met dat wachtwoord elke beheerder met eigen login naar therapeut zetten (`/api/praktijk/team/rol`, server.js r. ~3221: de check geldt
  alleen bij `acc.gedeeldUit` of voor jezelf). Gemeten: 200, daarna 0 beheerders met eigen login. Klopt met het ontwerp (gedeeld =
  beheerder), maar zonder waarschuwing en zonder logregel met naam. Overwegen: rolwijziging van een eigen-login-beheerder alleen door een
  beheerder met eigen login, of in Activiteit vastleggen.

- **OPGELOST 2026-11-11 12u (opzeggen), zie boven, deze PR. LAAG (2026-11-11) — abonnementsacties zonder beheerdersrol.** Opzeggen, factuurgegevens, betalen en wissen op
  /v2/proef hangen alleen aan de proefcookie van het apparaat. Op een gedeelde praktijkcomputer kan elke collega het
  abonnement opzeggen; 30 dagen na de betaalde maand wist de server dan alle patiëntkaarten. Verzachting: bevestigingsmail
  aan de aanmelder, intrekken kan tot het einde, Ahmed krijgt een melding. Voorstel: bij een gekoppelde praktijk ook een
  beheerderssessie van die praktijk eisen (of het wachtwoord laten intikken) voor opzeggen.
- **OPGELOST 2026-11-11 16u (zie boven, deze PR). LAAG (2026-11-11) — welkomstlink is een blijvend apparaattoken.** De link in de welkomstmail (`/v2/proef/terug?code=`)
  is hetzelfde token als de cookie van het eerste apparaat en blijft geldig zolang de aanmelding bestaat (tot 5 apparaten).
  Wie de mail later leest (gedeelde mailbox), krijgt zo het abonnementsbeheer. Voorstel: een apart maillink-token dat na
  gebruik of 7 dagen vervalt, los van de cookie.

- **OPGELOST 2026-11-11 08u (zie boven, deze PR).** MIDDEL (doorgezet door de gebruikers-sweep 2026-11-11 02u, Mark) — collega met rol therapeut wijzigt het praktijkprofiel.**
  `POST /api/praktijken` (server.js r. ~3655) heeft alleen `eisBeveiligdePraktijk`, geen beheercheck. Repro lokaal: therapeut
  stuurt `{tel:"0900-OPLICHTER", website:"https://example.org/phish"}` → 200, en /k van elke patiënt toont dat nummer en die
  link bij de praktijknaam; geen logboekregel. Verwacht 403 zoals bij team/akkoord, of beheer + logboek. Raakt server.js (open PR #167).
- **LAAG (sweep 2026-11-11 02u, Mark) — gelijktijdige schrijfacties op notitie/afspraak/behandelaar zonder versiecheck** (laatste
  wint stil). Integriteit, geen toegang; staat ook in routine-backlog.

- **OPGELOST 2026-11-10 20u (zie boven, deze PR).** NAKIJKEN (doorgezet door de gebruikers-sweep 2026-11-10 14u) — `/api/praktijk/wachtwoord`: een fout eigen
  wachtwoord van een lid telt via `loginMisTel(pk)` mee op de sleutel van de hele praktijk.** Na genoeg pogingen kan `loginOpSlot(pk)`
  mogelijk de hele praktijk (ook de beheerder) op 429 zetten. Nagaan of de gewone login dezelfde sleutel gebruikt (Mark, code gelezen).

- **LAAG (doorgezet door de gebruikers-sweep 2026-11-10 02u) — twee gelijktijdige "Nodig uit"-verzoeken geven allebei 200 met
  twee verschillende links, maar per collega wordt maar één hash bewaard** (server.js r. ~2830 overschrijft). De eerste link is dan
  dood (404 "werkt niet meer"). In de app zelf is dubbelklik opgevangen; dit is de serverkant (Mark, API).

- **LAAG (2026-11-12) — inlogrem start bij elke herstart opnieuw.** `loginMisPraktijk` (10 missers per praktijk per kwartier)
  en de rem per IP staan alleen in het geheugen. Sinds #207 overleven sessies een uitrol, maar de rem niet: elke uitrol (±25 per
  dag) geeft een aanvaller op één praktijkwachtwoord 10 extra pogingen, bovenop de ±960 per dag die de rem al toelaat (+25 %).
  Scrypt en een wachtwoord van minstens 8 tekens maken dat geen praktische route. Voorstel als het goedkoop kan: de per-praktijk-
  teller mee in het sessiebestand of een eigen klein bestand.
- **AFGESLOTEN 2026-11-12 (geen securitygat, ontwerp) — NAKIJKEN (van de gebruikers-sweep 2026-11-11 22u, Karin) — LAAG:** een
  beheerder van Y die zijn praktijk hernoemt naar de naam van X kan niets van X lezen of wijzigen (accounts blijven gescheiden). Een
  nieuwe praktijk mag bij claimen al bewust dezelfde naam kiezen ("Andere praktijk met deze naam"), dus hernoemen geeft geen nieuwe
  route om op X te lijken. De weggevallen hint bij X is UX: hoort bij de gebruikers-sweep. Oorspronkelijke melding: een beheerder van praktijk Y kan via POST /api/praktijken
  het profiel en `account.naam` hernoemen naar de exacte naam van een andere beveiligde praktijk X (200, geen vraag; server.js r. ~3890).
  Geen datalek (/v2/gegevens en team blijven per account gescheiden), maar patiëntkaarten en uitnodigingen van Y lijken dan van X te
  komen, en bij X valt de hint "log in met je eigen e-mail" weg (`every(gedeeldUit)` over accounts met die naam). Bij claimen moet
  "andere praktijk met deze naam" juist bewust gekozen worden. Overwegen: zelfde botsingscheck als bij claimen.
- **AFGESLOTEN 2026-11-10 (geen gat) — beoordeeld door security:** de proefmails zijn platte tekst, de adressen in HTML gaan
  door `htmlEsc` en de CSV van /api/aanmeldingen zet `'` voor `= + - @` (formule-escape). Een strengere regex mag (UX), is geen securityfix.
- **LAAG (doorgezet door de gebruikers-sweep 2026-11-09 22u, ter info) — e-mailcheck van de proef keurt `=hyperlink("http://evil")@x.nl`
  en emoji-adressen goed** (lib/proef.js r. 25, `EMAIL_RE = /^[^\s@]{1,64}@…/`). Raakt de meldingsmails en het aanmeldoverzicht
  (formule-injectie bij een export naar een spreadsheet). Sanne, desktop.

- **AFGESLOTEN 2026-11-09 20u als beveiligingspunt, doorgezet naar docs/mensenwerk.md (zakelijke keuze).** Geen technisch gat:
  iedereen kan in /v2/app een praktijk beveiligen zonder proef (bewuste keuze), dus een typfout of een nieuwe naam is geen
  omzeiling die alleen een team heeft. Of de app zonder proef of abonnement open moet blijven, beslist Ahmed. Oorspronkelijke melding:
  **MIDDEL (doorgezet door de gebruikers-sweep 2026-11-09 18u) — praktijk zonder proef via een (typ)naam.** Mark (iPad): een collega
  typte "Fysio Marktest." en Beveiligen maakte een tweede praktijkaccount zonder `proef`; op een kopie met verlopen proef gaf
  `POST /api/kaarten` daar 200. `proefKoppel` (server.js r. ~2644) koppelt alleen via de proefcookie van dat apparaat. Bekend dat
  /v2/app zonder proef open is (bewuste keuze), maar zo omzeilt een team ook de verlopen proef. De sweep zet nu de praktijknaam
  klaar na een uitnodiging (deze PR); een "bedoel je …?" op namen lekt praktijknamen, dus eerst hier beoordelen.

- **OPGELOST 2026-11-09 (deze PR) — MIDDEL — oude proefcookie op het apparaat hangt een gewone praktijk aan een
  verlopen proef, die daarna helemaal gewist wordt** (sanity #133/#136). Inloggen met naam en wachtwoord koppelde het
  account aan de proef van de cookie zodra `acc.gemaakt >= proef.gestart`, ook als de praktijk ná het einde van die
  proef was gemaakt. Gevolg: de praktijk ging direct op slot, en sinds #133 wist de proefronde 30 dagen na die oude
  proef het hele account mét de patiëntkaarten. Repro lokaal: proef 46 dagen verlopen, praktijk vandaag beveiligd
  zonder proef, inloggen met `cookie: fpproef=<oud>` gaf `acc.proef = {id: oud}`. Kan per ongeluk (gedeelde computer)
  of door een collega met het praktijkwachtwoord. Nu: alleen koppelen als het account binnen die proef is gemaakt
  (`gestart <= gemaakt <= verloopt`). Test: `npm run test:oudeproef`.
- **OPGELOST 2026-11-09 (deze PR) — MIDDEL (doorgezet door gebruikers-sweep 2026-11-09 14u) — herstelcode is hoofdlettergevoelig.** Uitgegeven als
  `FP-a0713-dff95-…`; in hoofdletters overgetypt (papieren code) geeft 403 en telt mee voor het slot van 15 minuten.
  server.js r. ~2994 (`String(b.herstelcode).trim()` zonder normalisatie). Advies: client en server normaliseren
  (kleine letters, streepjes/spaties). Desktop (Sanne). Nu: `herstelcodeNormaal` op de server zet hoofdletters,
  spaties en ontbrekende streepjes terug naar de uitgegeven vorm; een echt verkeerde code blijft 403. Test: `npm run test:oudeproef`.
- **DEELS OPGELOST 2026-11-09 20u (deze PR): sessieverkeer telt per praktijk, zie MIDDEL hieronder. Open: seintjes van patiënten
  delen nog één bak per IP, en sessies alleen in het geheugen.** LAAG (doorgezet door gebruikers-sweep 2026-11-09 14u) — schrijfrem is één bucket per IP voor alle routes (40/5 min,
  server.js r. ~1467). Snel tikken op de pijnscore blokkeerde het pijnseintje. De kaart zet zo'n tik nu in de wachtrij
  (PR van de sweep), maar overweeg een eigen bucket voor seintjes. Ook: praktijksessies alleen in het geheugen
  (r. ~173), dus elke deploy logt iedereen uit en de eerste autosave daarna geeft stil 401 (Mark).

- **OPGELOST 2026-11-09 (deze PR) — MIDDEL — onleesbaar `proef-aanmeldingen.json` wist klanten** (sanity #123). Bij een
  kapot bestand startte de server met `proeven = {}`; het rondje van 5 s na de start zag dan bij elk account met een oude
  proef "aanmelding weg" en wiste het (team, profiel, sjablonen) zodra er geen kaarten waren, ook bij betalende klanten.
  De eerste nieuwe aanmelding overschreef daarna het kapotte bestand. Nu: onleesbaar ≠ leeg; het automatisch wissen na
  de proef staat dan uit en het kapotte bestand wordt apart bewaard (`.onleesbaar-<tijd>`). Test: `npm run test:proefarchief`.
- **OPGELOST 2026-11-10 (deze PR) — LAAG (audit (b) 2026-11-09) — uitnodigingsmail als spamkanaal.** Nu hooguit
  10 uitnodigingsmails per praktijk per 24 uur (`uitnodigMailOpSlot`); daarboven komt de link wel terug met
  `mailLimiet`, zonder mail. Test: `npm run test:uitnodigmail`. Oorspronkelijke melding: Iedereen kan een praktijk claimen (5 per IP per dag)
  en per praktijk 50 collega's uitnodigen: Fysiplan mailt dan willekeurige adressen met een zelfgekozen praktijknaam in het
  onderwerp (`mailOpSlot` remt alleen per adres). Max ~250 mails per IP per dag; slecht voor de mailreputatie. Voorgestelde
  fix: uitnodigingen per praktijk per dag begrenzen (bv. 10) en tijdens een proef pas mailen na de eerste gedeelde kaart.
- **OPGELOST 2026-11-09 (deze PR) — MIDDEL (gebruikers-sweep 2026-11-09 10u, Mark) — verlopen proef houdt kaarten onbeperkt in leven via `/api/kaart/archief`.**
  Nu: na een verlopen proef blijven archiveren en terugzetten open, maar alleen als de kaart daardoor niet later verloopt;
  anders 403 `proefVerlopen` met de datum tot wanneer de kaart blijft. `/api/praktijk/akkoord` na de proef: geen gat
  (alleen het akkoord met nieuwe voorwaarden, geen patiëntgegevens). Test: `npm run test:proefarchief`. Oorspronkelijke melding:
  Aan/uit zetten van het archief zet `verloopt` van de kaart opnieuw; de route staat niet in `PROEF_SCHRIJFROUTES`. Ook
  `/api/praktijk/akkoord` schrijft nog bij een verlopen proef. Dossier en archief zijn bewust open; beoordelen of archief de
  bewaartermijn mag verlengen. Server lokaal 4611 met verlopen `verloopt`.
- **LAAG (sweep 2026-11-09 10u, Sanne) — server dwingt roepnaam en schone tekens niet af.** Via de API gaan `=HYPERLINK(...)`,
  `<script>…` en volledige namen gewoon als kaartnaam mee (escaped op /k, CSV maakt formules onschadelijk); `cleanName`
  (server.js r. ~1850) doet alleen trim en slice. Geen gat, wel dataminimalisatie alleen in de client.

- **AFGESLOTEN 2026-11-09 (geen beveiligingsgat) — verlopen proef: seintje afhandelen werkt nog.** "Gezien" en afhandelen
  zijn bewust open (alleen de eigen inbox, geen nieuwe gegevens naar de patiënt); dat de app `inboxGezien` ook na een 403 op
  het antwoord zet, is een app-fout voor de gebruikers-sweep (docs/routine-backlog.md). Oorspronkelijke melding (MIDDEL, 2026-11-08 18u, Mark): Een collega met een verlopen
  proef krijgt bij antwoorden netjes 403, maar `/api/praktijk/inbox/afgehandeld` en `/api/kaart/seintje/gezien` staan niet in
  `PROEF_SCHRIJFROUTES` (server.js r. ~541): het seintje verdwijnt uit de inbox zonder antwoord aan de patiënt. De app zet
  `inboxGezien` ook na een 403 op het antwoord (index.html r. ~3786). iPad.

- **OPGELOST 2026-11-08 (deze PR) — MIDDEL (gebruikers-sweep 2026-11-08 14u, Mark) — verwijderde collega komt weer binnen met het gedeelde praktijkwachtwoord.**
  Na × in Team vervalt zijn eigen sessie, maar inloggen met praktijknaam + praktijkwachtwoord gaf 200 en een
  beheerderssessie. Nu: zolang het praktijkwachtwoord werkt, geeft `/api/praktijk/team/verwijder` voor een actieve
  collega 409 (`gedeeldAan`), en kiest de beheerder in de app "Verwijder en zet het praktijkwachtwoord uit"
  (`gedeeld:"uit"`, alleen met eigen login; trekt ook alle gedeelde sessies in) of bewust "Alleen verwijderen"
  (`gedeeld:"laten"`, met de tip het wachtwoord te veranderen). Uitgenodigden die nooit inlogden gaan gewoon weg.
  Test: `npm run test:teamherstel` en `npm run test:team`.
- **LAAG (sweep 14u, Jayden) — bericht van de therapeut laat tekst-omkeertekens (U+202E e.d.) door** naar /k; alleen
  \u0000–\u001f wordt gefilterd (server.js r. ~4333). Geen XSS (platte tekst), wel misleidende weergave.

- **OPGELOST 2026-11-09 (deze PR) — LAAG→MIDDEL — `kruisSite` laat `Sec-Fetch-Site: same-site` door** (audit (c) 2026-11-08).
  Sinds #115/#116 zwaarder: met de proefcookie kan zo'n post het abonnement opzeggen, en 30 dagen na het einde wist
  Fysiplan alles van de praktijk. Nu telt same-site alleen met een Origin die precies deze host is; zonder Origin
  geweigerd. same-origin en none blijven toegestaan. Test: `npm run test:kruissite`. Oorspronkelijke melding: Een subdomein (of een andere
  app op `*.up.railway.app`, als dat domein niet op de Public Suffix List staat) telt zo als dezelfde site en mag
  POST'en met de proefcookie (`/v2/proef/wissen`, `doorgaan`). Geen bekend subdomein in handen van een ander. Fix:
  alleen `same-origin` en `none` toestaan, na een check dat geen eigen route van `same-site` afhangt.
- **AFGESLOTEN 2026-11-08 (geen gat, zie audit (c) 08u) — LAAG (te controleren) — patiëntroutes accepteren `content-type: text/plain`** (gebruikers-sweep 2026-11-08 06u, Truus):
  `POST /api/kaart/meting` met text/plain geeft 200. Zo'n verzoek is een "simple request" zonder CORS-voorcontrole; nagaan of
  `kruisSite` (Origin/Referer) dit voor andere sites in alle gevallen tegenhoudt, ook zonder Origin-kop.
- **OPGELOST 2026-11-07 (deze PR) — MIDDEL — therapeut (geen beheerder) kan teamsjablonen en eigen oefeningen van de hele praktijk verwijderen of
  overschrijven** (gebruikers-sweep 2026-11-07 18u, Mark, API). `POST /api/praktijk/sjablonen/verwijder` en
  `/api/praktijk/oefeningen/verwijder` geven 200 voor rol therapeut; opnieuw delen met dezelfde naam overschrijft
  stil. Er wordt geen maker bijgehouden. server.js r. ~2840–2855 en ~2899–2918: alleen `eisPraktijk`, geen
  `isBeheer`/maker-check. Fix: maker (lid-id, `door`) wordt opgeslagen; verwijderen geeft 403 en dezelfde naam
  delen 409 voor een andere therapeut. Oud werk zonder maker: alleen beheerder. Test: `npm run test:gedeeldwerk`.
- **OPGELOST 2026-11-07 (deze PR) — LAAG — na een verlopen proef kan een beheerder nog collega's uitnodigen** (sweep 18u, Mark). `/api/praktijk/team/*`
  staat niet in `PROEF_SCHRIJFROUTES` (server.js r. ~529); uitnodigen geeft 200 en de link werkt.

- **OPGELOST 2026-11-09 20u (deze PR) — nu telt een verzoek met een geldige praktijksessie per praktijk (schrijven 200, lezen
  600 per 5 min) plus een ruimere bak voor alle sessies op één IP (400 / 1200); anoniem (patiënt, inloggen, aanmelden) blijft
  40 / 120 per IP en telt het team niet meer mee. Een nep-sessiekop telt gewoon per IP. Test: `npm run test:rempraktijk`.**
  MIDDEL — schrijfrem van 40 per 5 minuten per IP geldt voor een hele praktijk achter één wifi (gebruikers-sweep
  2026-11-07 14u, Mark). Kaart opslaan, afspraak, login, opname en team tellen samen in `schrijfLimiet`
  (server.js r. ~1205–1220). Mark + collega liepen na ±40 gewone handelingen twee keer tegen 429 aan, voor iedereen op
  dat IP, ±5 minuten. Advies: voor geldige praktijksessies per sessie/lid tellen of een hogere grens; de rem voor
  anonieme routes per IP laten. (Bewijs lokaal: probe met x-forwarded-for.)
- **OPGELOST 2026-11-08 (deze PR) — LAAG — gedeeld praktijkwachtwoord weer aanzetten brengt het oude wachtwoord terug** (sanity PR #65,
  2026-11-07). `/api/praktijk/team/gedeeld-uit` met `uit:false` zet alleen de vlag terug; het oude
  wachtwoord (en de herstelcode) die een vertrokken collega kende, werken dan meteen weer.
  Fix: bij weer aanzetten een nieuw wachtwoord eisen en een nieuwe herstelcode tonen (raakt de teamkaart in de app).
  Nu: `uit:false` eist `wachtwoord` (min. 8), zet een nieuwe hash en herstelcode (één keer getoond in de teamkaart)
  en trekt oude gedeelde sessies in; het oude wachtwoord en de oude code werken niet meer. Test: `npm run test:teamherstel`.
- **OPGELOST 2026-11-07 (deze PR, dubbel met hierboven) — LAAG — team uitnodigen en eigen login maken werken ook na een verlopen proef** (sanity PR #65).
  `/api/praktijk/team/*` staat niet in `PROEF_SCHRIJFROUTES`. Geen datalek (de proef blijft voor iedereen
  dicht), wel een schrijfroute die open blijft. Fix: `uitnodigen` en `eigen-login` aan de set toevoegen.
- **LAAG — inloggen met e-mail: tien foute pogingen zetten dat adres een kwartier op slot** (sanity PR #65).
  Gebruikers-sweep 2026-11-12 18u (Karin): sinds #242 geldt dat ook voor /v2/gegevens; wie het adres van een beheerder kent, sluit haar daar
  een kwartier buiten (11× fout met haar adres, ook in hoofdletters/spaties → 429). Bekende afweging, ter info.
  Wie het e-mailadres van een collega kent, kan die zo steeds buitensluiten. Zelfde afweging als de rem per
  praktijknaam; eventueel: slot alleen voor IP's zonder eerdere geslaagde login.
- **LAAG — tweede betaalpoging maakt de eerste onvindbaar** (sanity PR #57, 2026-11-07). `/v2/proef/betalen`
  haalt het vorige betaal-id uit `mollieBetaalIndex`. Rondt de praktijk daarna tóch de eerste checkout af (twee
  tabbladen), dan wordt die betaling genegeerd: geld afgeschreven, proef blijft dicht. Geen aanvalspad, wel
  integriteit. Fix: oude betaal-id's in de index houden (per proef een lijst) en elke betaalde laten tellen.
- **LAAG — opnieuw aanmelden verraadt of een e-mailadres al een proef heeft** (2026-11-06). Sinds de
  fix hieronder krijgt een bekend adres "Met dit e-mailadres loopt al een proef" en een nieuw adres
  direct de app. Onvermijdelijk zolang aanmelden zonder mailbevestiging direct toegang geeft; de
  pagina noemt geen naam of praktijk. Fix (eventueel): ook nieuwe aanmeldingen pas na een maillink.
- **LAAG — wissen via /v2/gegevens haalt ook `acc.proef` weg** (sanity PR #48, 2026-11-06). Na
  "alles wissen" is de praktijknaam vrij en draagt een nieuw account met die naam geen proefslot meer.
  Zelfde soort als "proef wissen en opnieuw aanmelden" hieronder; alleen relevant zonder betaalpoort.
  Fix: bij wissen een sha256 van de praktijknaam + proefeinde bewaren tot de bewaartermijn om is.
- **LAAG — proef wissen en opnieuw aanmelden geeft een nieuwe proef van 14 dagen** (2026-11-06).
  `/v2/proef/wissen` haalt de aanmelding weg; daarna levert hetzelfde e-mailadres een verse proef op.
  Het praktijkaccount blijft sinds PR #47 wel dicht (einddatum staat op het account), dus dit helpt
  alleen met een nieuwe praktijknaam. Fix (eventueel): bij wissen alleen de sha256 van het e-mailadres
  en de einddatum bewaren tot de bewaartermijn om is (afstemmen met legal: dataminimalisatie).
- **LAAG — accounts die vóór PR #47 tijdens een proef zijn beveiligd, raken pas gekoppeld bij de
  volgende login vanaf het proefapparaat.** Een sessie op een ander apparaat die nooit opnieuw vanaf
  het proefapparaat inlogt, blijft tot de sessie (30 dagen) verloopt open. Koppelen op praktijknaam
  (`p.praktijk`) is bewust niet gedaan: die naam is vrije invoer en zou andermans account kunnen sluiten.
- **OPGELOST 2026-11-09 20u voor de praktijk (deze PR, zie hierboven); open als LAAG: patiënten achter CGNAT/sportschool-wifi
  delen nog 40/120 per IP. Voorstel: patiëntroutes per kaart-id tellen naast een ruimere IP-bak.**
  MIDDEL — per-IP-remmen te krap voor een praktijk achter één NAT (sweep 2026-11-06). Lezen 120
  en schrijven 40 per 5 min per IP (server.js `leesLimiet`, schrijfrem) gelden voor de hele praktijk
  incl. auto-delen, en voor patiënten achter CGNAT/sportschool-wifi. De sweep liep er met 4 gebruikers
  binnen minuten tegenaan. Overweeg rem per praktijksessie/kaart-id naast per IP.
- **OPGELOST 2026-11-08 (deze PR) — LAAG — remteller op de beheersleutel weigert, maar houdt raden niet tegen.**
  `denied()` geeft na 20 fouten per 5 minuten een 429, maar `isAdmin()` wordt vóór
  `denied()` gecontroleerd: wie tijdens de 429-periode de juiste sleutel stuurt,
  komt er gewoon in. Met een lange willekeurige `ADMIN_KEY` praktisch onschadelijk.
  Repro: 25× fout via `x-admin-sleutel`, dan de juiste sleutel → 200.
  Fix: in de beheerroutes eerst de IP-rem controleren, dan pas de sleutel. Nu: `isAdmin()` weigert elke sleutel
  van een IP dat op de rem staat (`beheerOpRem`); andere IP's merken niets. Test: `npm run test:beheer`.
- **OPGELOST 2026-11-12 (platformreview, test:beheeraccounts) — LAAG — beheer is één gedeelde sleutel, geen account.** Geen audit
  wie wat wijzigde, geen intrekken per persoon. Toegangsbeheer (`ACCOUNT_BEHEER_EMAILS`)
  laat zien hoe het wel kan; overstappen kan later per beheerroute. Nu: persoonlijke beheeraccounts met een tweede stap, uitzetten
  per persoon en een beheerlogboek (zie de notitie bovenaan Open). De sleutel werkt nog zolang `ADMIN_KEY` op de server staat;
  weghalen is aan de eigenaar.

## Opgelost

- OPGELOST 2026-11-12 (bouwthread, deze PR) — **wie een praktijknaam beveiligt, erfde wat er zonder account onder stond** (HOOG).
  Een v1-sessie en beheer delen kaarten onder de naam in kleine letters, zonder praktijkaccount, en er zijn kaarten
  van vóór de wachtwoordplicht. De eerste die zo'n naam in V2 beveiligde, kreeg die sleutel: alle kaarten eronder
  (lezen en verwijderen), en de v1-praktijk kreeg daarna 401 op haar eigen overzicht en kon niets meer delen. De
  standaardnaam van v1, "FysioTotaal", staat als voorbeeld op de landingspagina. Lokaal gemeten met een v1-sessie.
  Nu: staat er onder de kale naam al iets zonder account (kaarten, profiel, sjablonen, eigen oefeningen, of een
  profiel met die naam onder een andere sleutel zonder account), of is het de standaardnaam van v1, dan krijgt de
  nieuwe praktijk een eigen code (`naamDraagtGegevens`), net als bij "Andere praktijk met deze naam". Een verse naam
  houdt de naam als sleutel. Test: `npm run test:naamerftniets`. Drie tests die een praktijk beveiligden boven op
  gezaaide kaarten (dossier-contact, praktijkgegevens, sweep-overzicht-wis) zaaien nu ook het account.
  Niet meegenomen (LAAG): logboekregels onder een kale naam zonder account (soort actie, tijdstip, gemaskeerd IP;
  geen kaartnamen) blijven bij de naam. Staat er verder niets meer onder, dan ziet wie de naam daarna beveiligt
  die regels in Activiteit en in de download.
- OPGELOST 2026-11-07 PR #73 — **herstelcode werkte nog na "gedeeld praktijkwachtwoord uit"** (MIDDEL).
  De code ligt op papier in de praktijkmap, dus een vertrokken collega kende hem. Met
  `/api/praktijk/herstel` kon die het gedeelde wachtwoord omzetten, kreeg elke keer een verse code (de
  beheerder kon hem niet meer afpakken) en logde álle teamleden uit, zo vaak als die wilde. Nu: een praktijk
  met het gedeelde wachtwoord uit doet niet mee aan herstel (401, `perEmail`), en herstel trekt alleen nog
  de sessies met het gedeelde wachtwoord in. Test: `npm run test:teamherstel`.
- OPGELOST 2026-11-07 (thread "Ontwerp rollen, dossier en opslag", stap 1) — **praktijknaam is een
  wereldwijde sleutel** (HOOG). Een tweede praktijk met dezelfde naam kiest "Andere praktijk met deze
  naam" en krijgt een eigen code `p-<16 hex>` (`acc.naam` = weergave); inloggen op naam zoekt het
  account waarvan het wachtwoord klopt; met een sessie handelt elke route voor de eigen praktijk
  (`praktijkVan`), dus een andere naam op de kaart wisselt niet meer stil van praktijk. Bestaande
  accounts houden hun sleutel. Test: `npm run test:praktijkcode`.
- OPGELOST 2026-11-07 PR #61 — `kruisSite()` weigert nu ook een vreemde of `null`-Origin als
  Sec-Fetch-Site ontbreekt (oudere Safari). Test: `npm run test:kruissite`.
- OPGELOST 2026-11-07 PR #61 — een kaart-id als lijst of object (`{"id":["<id>"]}`) vindt geen kaart meer
  (21 routes via `idTekst()`); geeft 404 in plaats van stil het id te gebruiken.

- OPGELOST 2026-11-07 PR #58 — te grote request-body krijgt nu een 413 met melding in plaats van een
  verbroken verbinding (ook chunked); dubbel backlogitem samengevoegd.
- OPGELOST 2026-11-07 PR #58 — `/api/opname/upload` weigert na het verlopen van de proef (token onthoudt
  proef en praktijk).

- **MIDDEL — vreemde opname-video in eigen kaart zetten en daarmee laten wissen** (sweep 2026-11-06,
  Mark). OPGELOST 2026-11-07 PR #54. POST /api/kaarten neemt een opnamepad in `vids` alleen nog over als het
  al op een kaart van dezelfde praktijk staat, een bibliotheekvideo is, of uit een opname komt die
  deze praktijk zelf startte (`opnames` onthoudt nu de praktijk). Een vreemd pad wordt stil
  weggelaten. Test: `npm run test:opname-eigen`.
- **HOOG (alleen ontwikkel-/beeldscripts) — npm audit: sharp ≤0.35.5-rc.1 (libheif, librsvg).**
  OPGELOST 2026-11-07 PR #54: lockfile naar sharp 0.35.5. De server laadt sharp niet; alleen
  scripts voor beeldbewerking gebruiken het.

- **HOOG — proef overnemen met alleen het e-mailadres** (gebruikers-sweep 2026-11-06, Sanne). Opnieuw
  aanmelden met een bestaand adres gaf direct een proefcookie, liet naam/telefoon overschrijven en
  gaf via /v2/proef?mijn=1 toegang tot wissen. Fix: zonder geldige proefcookie van díe proef geen
  cookie en geen wijziging, maar een eenmalige link (24 uur, mailrem 3/uur) naar het echte adres.
  OPGELOST 2026-11-06 PR "security: proef niet over te nemen met alleen het e-mailadres". Test: `npm run test:proef`.
- **MIDDEL — `/api/kaart/afspraak` met een verkeerd type wiste de afspraak** (sweep, Jayden). Alleen
  0/null/leeg haalt weg; tekst, object of lijst geeft 400. OPGELOST 2026-11-06, zelfde PR. Test: `npm run test:proef`.

- **KRITIEK — prototype pollution via `/api/kaart/vertaal?taal=__proto__`** (gebruikers-sweep
  2026-11-06, Jayden). `TALEN["__proto__"]` is truthy, dus de taalcheck liet het door; met een AI-sleutel
  werd `vertalingen["__proto__"]` het `Object.prototype` van het hele serverproces en schreef de cache
  daar sleutels op (plus een betaalde AI-aanroep). Hetzelfde patroon zat in de vraaghulp (`VTALEN`).
  Fix: `Object.hasOwn`. OPGELOST 2026-11-06 PR #49. Test: `npm run test:sweep`.

- **HOOG — verlopen proef blokkeert alleen nieuwe kaarten** (gebruikers-sweep 2026-11-06, persona Mark).
  Met de verlopen proefcookie geven `/api/praktijk/sjablonen`, `/api/praktijk/oefeningen` (upload),
  `/api/opname/start` (60 MB-uploadtoken), `/api/kaart/afspraak` en `/api/kaart/naam` gewoon 200.
  Zonder proefcookie (ander apparaat, cookies gewist) maakt dezelfde praktijksessie weer nieuwe kaarten:
  de proef hangt aan het apparaat (`proefVan`), niet aan de praktijk. Controle staat alleen bij
  `POST /api/kaarten` en `/v2/app`. Fix: proefstatus aan het praktijkaccount koppelen en in één
  poort voor alle schrijfroutes van de therapeut toetsen (patiëntroutes /k blijven open).
  OPGELOST 2026-11-06 PR #47: één poort (`proefSlotVoor` in server.js) voor alle schrijfroutes van de
  therapeut, op proefcookie én op het praktijkaccount (`acc.proef = {id, verloopt}`, gezet bij claimen
  en bij inloggen vanaf het proefapparaat). Lezen, verwijderen, archiveren en patiëntroutes blijven open;
  wissen van de proef heft het slot niet op; beheer op "klant" zetten wel. Test: `npm run test:proefpoort` (ook in CI).

- **HOOG — publieke beheersleutel `admin88`.** `public/index.html`,
  `public/dashboard.html` en `public/content1000.html` zetten
  `'x-admin-sleutel':'admin88'` hard in de pagina, en de server viel zonder
  `ADMIN_KEY` terug op `admin88`. Iedereen kon dan oefeningen hernoemen en
  verwijderen, video's en categorieën wijzigen, het eigenaarsdashboard lezen en de
  volledige praktijkenlijst met contactgegevens ophalen. Fix: geen sleutel meer in
  publieke bestanden (de beheerder voert hem zelf in, alleen in sessionStorage);
  live zonder eigen `ADMIN_KEY` (of met `admin88`) blijft beheer dicht; lokaal blijft
  `admin88` de standaard. Test: `npm run test:beheer` (ook in CI).
  OPGELOST 2026-11-06, PR "security: beheersleutel".

## Sanity 2026-11-07 (04u UTC) op #55, #56, #57

- #57 Mollie: webhook haalt de betaling zelf op, alleen eigen `tr_`-id's, bedrag en proef-id gecontroleerd,
  idempotent; betaalroute achter `kruisSite` en `proefLimiet`. Geen gat. Let op bij live: `eigenHost` bepaalt
  redirect- en webhook-URL; alleen de eigen betaling is te beïnvloeden.
- #55, #56: geen nieuwe endpoints zonder auth; `basisTs`-check alleen voor de eigen praktijk.

