# Routine-backlog: gebruikers-sweep (V2)

Bijgehouden door de gebruikers-sweep (elke 4 uur). Vijf persona's (sinds 2026-11-11 14u ook Karin, beheerder) gebruiken de V2-app lokaal
op mobiel, tablet en desktop. Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
Beveiliging staat in `docs/security-backlog.md`, juridisch in `docs/legal-backlog.md`,
werk voor Ahmed in `docs/mensenwerk.md`.

## Flow × apparaat → laatst getest

| Flow | Desktop 1280 | iPad | iPhone SE | iPhone 14 | Pixel 7 |
|---|---|---|---|---|---|
| Proef aanmelden + formulierfouten | 2026-11-13 18u Sanne (ok; focus eerste fout, `<script>` stil gestript) · 2026-11-13 14u Sanne (ok; aria-invalid, 0612345678, script-strip nog open) · 2026-11-13 06u Sanne toetsenbord (ok; 5 fouten, focus naar e-mail, gmial→gmail) · 2026-11-12 22u Sanne (ok; aria-invalid en script-strip nog open) · 2026-11-12 18u Sanne (focus naar eerste fout ok; aria-invalid/aria-describedby, 0612345678 en script-strip nog open) · 2026-11-12 06u (ok; dubbelklik Start 1 account) · 2026-11-11 22u (ok; 0612345678 en aria-invalid nog open; script-tags in naam stil gestript) · 2026-11-11 10u (praktijknaam uit welkom nog niet in aanmelding; aria-invalid nog open) · 2026-11-11 02u (toetsenbord ok; focus na welkom op body) · 2026-11-10 22u (ok; 0612345678 geweigerd met misleidende melding) · 18u (ok; foutmeldingen niet aan velden gekoppeld; praktijknaam later komt niet in aanmelding) | 2026-11-08 10u staand | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Welkom, praktijknaam (ook leeg), 12 oefeningen | 2026-11-12 06u (naam uit aanmelding staat erin; leeg houdt oude naam; 13e geweigerd) · 2026-11-09 18u (ok; lange naam 66 tekens; "Nieuw in Fysiplan" direct na welkom) | 2026-11-07 10u | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Printversie (lijn, kleur, compact) | 2026-11-13 18u Sanne (8 varianten ok; Doel 500 tekens afgesneden op uitgebreide A4) · 2026-11-13 14u Sanne (5 PDF's 1 A4, thuiskaart 2 vellen) · 2026-11-13 06u Sanne (6 varianten ok; naam 50+ tekens met emoji afgekapt) · 2026-11-13 02u Sanne (12 PDF's; thuiskaart niet meer afgekapt; label Groot 'zes per vel' klopt niet) · 2026-11-12 22u Sanne (7 varianten 1 A4; thuiskaart Groot: uitleg bij 10/12 afgekapt, zonder Groot 1/12 → zie PR bouw-agent) · 2026-11-12 10u (alle varianten met QR 1 A4) · 2026-11-12 06u (11 combinaties elk 1 A4, ook met QR) · 2026-11-11 10u (compact: 14 i.p.v. 12 datumrijen → OPGELOST, test:printcompact) · 2026-11-11 02u (8 PDF's 1 A4, alle namen volledig) · 2026-11-10 22u (8 PDF's elk 1 A4; lang Doel stil afgekapt) · 18u (6 varianten 1 A4; compact nog zwak: HOOG open) | 2026-11-10 14u liggend (printvenster + PDF ok) | 2026-11-07 14u | 2026-11-06 22u (venster) | 2026-11-07 10u |
| Beveiligen, herstelcode, inloggen 2e apparaat | 2026-11-13 18u Sanne + Mark (ok; focus op body na reservecodes; proefbalk pas na herladen) · 2026-11-13 14u Sanne (eigen login + TOTP, onderbroken + verder ok) · 2026-11-13 06u Sanne (eigen login + tweede stap, onderbroken + verder ok) · 2026-11-12 22u Sanne (eigen login + tweede stap ok) · 2026-11-12 18u Sanne (tweede stap onderbroken: "Andere praktijk" maakte een dubbele praktijk en sloot haar buiten → OPGELOST, test:tweedestaponderbroken; hertest ok) · 2026-11-12 14u Sanne (nieuwe startroute eigen login + tweede stap ok; onderbroken stap 2 zonder uitleg, open) · 2026-11-12 10u Sanne (eigen login + tweede stap via Team ok; startroute #222 lokaal niet aan) · 2026-11-11 10u toetsenbord (focus op body na Beveiligen; #ps_msg zonder aria-live) · 2026-11-09 18u (ok; herstelcode kleine letters ok) | 2026-11-13 14u Mark liggend (2e apparaat, dubbele Enter op code 1 sessie) · 2026-11-13 06u Mark staand (2e apparaat + code ok) · 2026-11-12 22u Mark (2e apparaat + code ok) · 2026-11-12 18u Mark (2e apparaat inloggen + code ok) · 2026-11-12 10u Mark staand + liggend (tweede apparaat met code ok; tikdoelen 30 px) · 2026-11-09 18u staand (typfout collega: losse praktijk → fix via klaargezette naam) | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Delen, QR, kaartenoverzicht, CSV | 2026-11-13 18u Sanne (CSV ok; roepnaam printvenster + Test de QR → OPGELOST #292) · 2026-11-13 14u Sanne (CSV ok; roepnaamvoorstel in printvenster → dubbele kaart, voorbeeldkaart wordt echte kaart) · 2026-11-13 10u Sanne (CSV-formules ook met tab ervoor ok; delen 2e context ok) · 2026-11-12 10u (CSV-formules ok; /k praktijknaam van de praktijk ok na #224) · 2026-11-12 06u (CSV ok; hernoemen A4-kop → verschillende namen op /k) · 2026-11-12 02u (CSV ok; tabvolgorde Kaarten; 2179 tabstops) · 2026-11-11 22u (CSV-formule ok; oefendoel toetsenbord nog open; "+ praktijklogo" 12 px) · 2026-11-11 18u (prullenbak → definitief → QR deelde stil opnieuw → OPGELOST, test:kaartweg; oefendoel klapt paneel dicht) · 2026-11-11 02u (CSV formulebescherming ok; focus na QR-venster op body) · 2026-11-10 18u (CSV ok; 0 oefeningen via API = lege kaart) | 2026-11-10 06u staand (tikdoelen overzicht nog < 44) | 2026-11-07 14u | 2026-11-06 22u | 2026-11-07 10u |
| Naam wijzigen in overzicht + daarna verder bewerken | 2026-11-09 18u (nieuwe kaart: naamveld volgt → OPGELOST, test:nieuwekaartnaam) | 2026-11-07 10u | 2026-11-07 14u | – | 2026-11-07 10u |
| Teamsjabloon, eigen oefening (foto), eigen video | 2026-11-13 18u Mark desktop + iPad (eigen oefening met bibliotheeknaam nam sjablonen over → OPGELOST #293; zelfde naam 409, collega 403) · 2026-11-12 06u (sjabloon met emoji/script ok, "Gedeeld" komt) · 2026-11-12 02u (dubbelklik Delen → Verwijderen en stil overschrijven → OPGELOST, test:sjabloondelen) · 2026-11-11 22u API (zelfde naam stil overschreven, nog open; naam van alleen U+200B geaccepteerd) · 2026-11-10 22u (ok; dubbeltik Delen → Verwijderen op iPad) · 10u (ok; nep-JPEG/.exe nette melding, 6 MB verkleind) | 2026-11-13 06u Mark liggend (sjabloon escape ok; snelle dubbeltik Delen → Vervangen?; eigen oefening 15 MB/nep ok) · 2026-11-12 22u Mark (sjabloon emoji/<b> ok; eigen oefening nep/22 MB/dubbelklik ok) · 2026-11-12 18u Mark (sjabloon delen/overschrijven 409/verwijderen 403 ok; eigen oefening: nep-png, gif geweigerd, 6000×4000 verkleind) · 2026-11-12 14u Mark (eigen oefening + video via /o + sjabloon bij collega ok) · 2026-11-12 10u Mark (opname na wijziging elders: video stil kwijt → OPGELOST, test:opnameverouderd) · 2026-11-11 10u staand ("Verwijderen voor de praktijk" bij andermans sjabloon → OPGELOST, test:gedeeldwerk; × eigen oefening collega open) · 2026-11-10 18u staand (collega ziet "Verwijderen" bij andermans sjabloon, 15 px) | – | – | – |
| Opname via telefoon /o | 2026-11-13 10u Mark API (404 vóór bewaren en stil weg na 15 min → PR #277) · 2026-11-09 14u (ok; vals "verouderd" na opname OPGELOST) | 2026-11-13 14u Mark staand galerij (.txt/nep-mp4 geweigerd, echte mp4 op kaart; plafond 20 telde bewaarde opnames → OPGELOST, test:opnameplafond) · 2026-11-13 06u Mark nep-camera (dubbeltik Versturen 1 upload) · 2026-11-12 22u Mark (geen camera → galerij, nep-mp4 geweigerd, token 1×) · 2026-11-11 22u zonder camera (liep dood → OPGELOST, test:opnamegeencamera: galerij + opnieuw proberen) · 2026-11-11 02u staand+liggend (ok, knoppen ≥ 48 px) · 2026-11-10 18u staand+liggend nep-camera (ok; modal-knoppen 36 px) | 2026-11-12 10u iPhone 13 nep-camera (ok) | 2026-11-07 10u | 2026-11-12 18u Mark nep-camera (ok, video op de kaart) · 2026-11-10 18u (ok, opname vanaf iPad) |
| Afspraak, seintje, signalen | 2026-11-13 18u Mark (ok; afspraak verleden/+2 jaar 400) · 2026-11-13 14u Mark + Lotte ("Alleen mijn patiënten" ok) · 2026-11-12 10u Mark (seintje → inbox ok) · 2026-11-11 14u ("+1 week" zomertijd → OPGELOST, test:weekverder; 28-03 02:30 schuift stil naar 03:30) · 2026-11-11 10u (+1 week zomertijd nog open; 2 collega's tegelijk notitie stil overschreven) · 2026-11-11 06u (reeks + zomertijd → /k OPGELOST; +1 week zomertijd open) · 2026-11-10 10u (seintje → inbox, ook bij collega) | 2026-11-13 14u Mark liggend (5 signalen, dubbeltik Afgehandeld 1×, reeks ×6 + "+1 week" ok; × "te zwaar" 14 px) · 2026-11-13 06u Mark (seintjes → Vandaag badge 2; +1 week na verloop laat datum staan) · 2026-11-12 22u Mark (Vandaag toont seintjes + getal; dubbeltik Afgehandeld 1×) · 2026-11-12 18u Mark liggend (afgewezen datum 2030 blijft in het veld) · 2026-11-08 18u staand (afspraak na verlopen proef stil) | 2026-11-08 18u (seintje → inbox ok) | 2026-11-10 10u #162 (.ics 1 download, nog 3 verzoeken) | 2026-11-10 14u (Engels ok; .ics dubbeltik → OPGELOST, test:agendadubbel; tijd "02:25 PM" → 24 uur) |
| Proef bijna verlopen / verlopen (echte verlopen-pagina) | 2026-11-13 18u Mark desktop + iPad (balk pas na herladen; eigen oefening/delen bij verlopen proef kale alert) · 2026-11-13 14u Mark (laatste dag met proefcookie ok; verlopen-pagina noemt nog praktijkwachtwoord) · 2026-11-12 18u Mark (eigenaar met proefcookie: verlopen-pagina zonder Naar dossier/Afgehandeld; e-mailveld leeg; laatste dag alleen met proefcookie; schrijven 403 op 12 routes ok) · 2026-11-12 14u Mark (eigenaar met proefcookie krijgt verlopen-pagina i.p.v. alleen-lezen app; schrijven 403 ok) · 2026-11-11 02u (bijna verlopen nergens zichtbaar, nog open) · 2026-11-10 22u (collega ziet 'laatste dag' niet; eigenaar minder dan collega; afspraak weghalen 403) · 10u ("t/m <dag>" + "loopt nog vandaag nog" open) | 2026-11-13 14u Mark liggend + Lotte staand (verlopen-balk direct, 7 schrijfroutes 403; laatste dag 2e apparaat/collega → OPGELOST, test:proefdag) · 2026-11-13 06u Mark + Lotte (laatste dag onzichtbaar op 2e apparaat/collega; verlopen-balk ok; "loopt nog vandaag nog") · 2026-11-13 02u Mark iPad staand + liggend, 2e apparaat (verlopen: doorgaan/betalen liep dood → OPGELOST, test:proefbeheer; laatste dag nog onzichtbaar) · 2026-11-12 22u Mark (tweede apparaat ziet laatste dag niet; tegel Proef en abonnement opent aanmeldformulier) · 2026-11-12 14u Mark + collega (alleen-lezen ok; laatste dag onzichtbaar) · 2026-11-11 22u (2e iPad ziet verlopen-balk meteen; alle schrijfroutes 403) · 2026-11-11 10u (collega ziet laatste dag niet; afspraak weghalen na verloop 403) · 2026-11-10 18u (alle schrijfroutes 403, ook 2e iPad; sjabloon weg + afgehandeld 200: bewust) | – | 2026-11-07 02u (breedte) | – |
| /k: lezen, voorlezen, pijnscore, herstel, gedaan, te zwaar | – | 2026-11-13 02u Truus staand 100 % + 200 % (ok) · 2026-11-10 18u #162 staand+liggend (liggend: uitleg onder de Gedaan-balk) | 2026-11-13 14u Truus 100 % + 200 % (alles ok; "Alles gedaan" focus naar body zonder bevestiging) · 2026-11-13 06u Truus 100 % + 200 % + A A (verloop na 12 dagen onleesbaar → OPGELOST #271; offline wachtrij, vraag → inbox ok) · 2026-11-13 02u Truus 100 % + 200 % + A A (alles ok; veiligheidszin + vaste vraag te breed → OPGELOST, test:veiliggroot) · 2026-11-12 22u Truus (pijn, herstel, gedaan, vraag → Vandaag/Patiënten ok) · 2026-11-12 14u Truus 100 % + 200 % (therapeut ziet 0 actief; kop breekt midden in woord) · 2026-11-12 10u Truus 100 % + 200 % (alles ok; download na wachtrij → OPGELOST) · 2026-11-12 06u (alles in inbox; download mist wachtrij-seintjes) · 2026-11-11 14u (dag uitzetten wiste vinkjes zonder vraag → OPGELOST, test:daguitvraag) · 2026-11-11 10u (ok; dubbel seintje via API → 3 logregels) · 2026-11-11 02u (seintje "goed" niet in inbox; aria-pressed herstel → OPGELOST) · 2026-11-10 18u (dubbel seintje → OPGELOST, test:agendadubbel; offline wachtrij ok) | 2026-11-13 14u Jayden EN (ok; .ics TZID + COUNT=4) · 2026-11-13 06u Jayden EN trage lijn (seintjes serverstand ok; "I did my exercises" geen reactie) · 2026-11-13 02u Jayden EN trage lijn (pijn/herstel/seintjes ok; datums en-US → OPGELOST) · 2026-11-12 22u Jayden EN trage lijn (seintjes laatste tik → OPGELOST #262, test:seintjestand) · 2026-11-12 18u Jayden EN trage lijn (seintjesknoppen tonen laatste tik, niet de serverstand; pijn/herstel laatste tik ok) · 2026-11-12 14u Jayden (herstel eerste tik won, PSK slikte tik → OPGELOST, test:herstellaatstetik) · 2026-11-12 10u Jayden (idem Pixel 7) · 2026-11-11 22u ("Ik heb vandaag geoefend" uit op trage lijn wist ook een vinkje van daarna; geen feedback) · 2026-11-10 10u #162 (Engelse oefenstand ok) | 2026-11-13 14u Jayden EN trage lijn (ok; oef:"0" als tekst geaccepteerd) · 2026-11-13 06u Jayden EN (herstel laatste tik ok; .ics TZID + COUNT=6 ok) · 2026-11-13 02u Jayden EN (ok) · 2026-11-12 10u Jayden (pijnscore 2→7→3 traag → OPGELOST, test:pijnscorebezig; seintjes snel nog open) · 2026-11-12 06u (Engels, herstel, .ics COUNT=4 ok; seintjes snel na elkaar nog open) · 2026-11-10 10u #162 (ok) |
| /k: gedaan-vinkjes op een tweede apparaat | – | 2026-11-07 10u | 2026-11-07 10u | 2026-11-07 10u | 2026-11-11 02u (ok, heen en weer) · 2026-11-07 10u |
| /k: 200% tekst, offline, Engels, landscape, trage lijn | – | – | 2026-11-12 18u Truus 200 % (koppen breken midden in woord → OPGELOST met hyphens; offline-balk 13,5 px: groter maken kost half scherm, open) · 2026-11-11 22u (200 % + A A: onderbalk, lang woord, tip beginscherm, vergrote foto → OPGELOST, test:onderbalkgroot; offline-melding 13,5 px) · 2026-11-11 18u (200 % + A A: Gedaan onder het scherm bij lang woord, oorzaak + fix gemeten; offline ok) · 2026-11-11 14u (200 % + "A A": pijl volgende helemaal buiten beeld; offline ok) · 2026-11-11 10u (lightboxtekst 14 px bij 200 % nog open) · 2026-11-11 02u (oefenstand alleen beeld → OPGELOST, body.krap) · 2026-11-10 22u (te zwaar offline 'Doorgegeven' → OPGELOST, test:zwaaroffline) · 18u (herstelknoppen buiten vak → OPGELOST, test:grotelettersk; oefenstand bij 200 % alleen beeld) | 2026-11-10 10u #162 (liggend ±49 % over voor de oefening) | 2026-11-13 14u Jayden (draaien oefenstand, terugknop sluit stand: ok) · 2026-11-11 02u (dagwissel open kaart → OPGELOST, test:dagwisseltaal; liggend onderbalk niet gecentreerd) · 2026-11-10 18u (trage lijn: NL laadtekst → OPGELOST, test:kaartladen; draaien/terug ok) |
| /k: video afspelen (eigen opname, YouTube) | – | 2026-11-08 22u (webm + mp4, staand/liggend) | 2026-11-12 22u Truus (verlopen tijdelijke link: video + eigen foto kapot → OPGELOST #262, test:medialinkvers) · 2026-11-12 18u Truus offline 100 % + 200 % (foute melding en blok over de video → OPGELOST, test:video-recovery) · 2026-11-12 10u (online ok; offline foute melding, bij 200 % over de video) · 2026-11-12 06u (eigen opname ok; offline foute hint) · 2026-11-07 22u (ook offline, 200%) | 2026-11-07 10u | 2026-11-09 22u (eigen webm, ook liggend ok) |
| /k: andere talen | – | – | de/tr storing 2026-11-11 10u (storingsmelding in alle talen + serverfout apart → OPGELOST, test:storingtaal) · de-storing 2026-11-11 06u (storingsmelding NL) · de/tr 2026-11-09 22u (mislukte vertaling → echte uitleg in NL met melding OPGELOST, test:nietvertaald; demostem las NL met Duitse stem: mee opgelost) | en 2026-11-12 22u Jayden (#250: één ontbrekende tekst → hele kaart NL → OPGELOST #262, test:vertaaldeels; eigen vragen blijven NL) · en 2026-11-11 22u iPhone 14 (eerst tekenen ok; S/H/W-kop NL; voorlezen leest NL met Engelse stem; afspraaktijd download ≠ kaart in Londen) · en↔nl 2026-11-11 02u iPhone 14 (keuze blijft niet → OPGELOST) · pl/ar 2026-11-08 22u (RTL-naam: fix) | ar + uk 2026-11-08 10u (te zwaar: fix) |
| Landing /v2 (desktop: ook printen) | 2026-11-08 14u (print: fix) | 2026-11-10 18u staand+liggend (nav 22/30 px, kopknoppen 34, "vergroot" 15 px) | 2026-11-09 18u (200 %: 513 px breed door <code> in FAQ; nav 22 px) | 2026-11-13 14u Jayden staand + liggend (ok) · 2026-11-13 06u Jayden liggend (h1 onder scherm → OPGELOST #270) · 2026-11-13 02u Jayden liggend (idem) · 2026-11-10 14u staand+liggend (taalregel contrast 2,45:1; taallinks 17 px; "Vragen" onzichtbaar buiten nav) | 2026-11-13 14u Jayden staand + liggend (#270 houdt) · 2026-11-13 06u Jayden liggend (idem → OPGELOST #270; /v2/en nette 404) · 2026-11-13 02u Jayden liggend (h1 onder het scherm, AI-label over slogan) · 2026-11-10 18u (Engels: alleen /k/demo, taallinks 17 px) |
| Therapeut-app op telefoon | – | – | 2026-11-07 06u | 2026-11-06 22u | 2026-11-07 10u |
| Therapeut-app op iPad liggend | – | 2026-11-10 14u (chips 24 px, ster/+ 24–28 px) | – | – | – |
| Hernoemvraag in Kaarten (andere patiënt) | 2026-11-10 22u (Annuleren hernoemde stil → OPGELOST, test:annulerenhernoem) | 2026-11-10 22u liggend | – | – | – |
| Twee werkplekken op één kaart (oud apparaat/tabblad) | 2026-11-09 22u (409 + keuze ok; melding ±7 px) | 2026-11-09 22u liggend (idem) | – | – | – |
| Vier schermen (Vandaag, Patiënten, Kaart maken, Praktijk; #256) | 2026-11-13 06u Sanne (terugknop verlaat app, nog open) · 2026-11-13 02u Sanne (#263 ok: geen Tab-val, klik naast paneel ok; terugknop verlaat app, Vandaag 'iedereen geoefend' → OPGELOST) · 2026-11-12 22u Sanne (tab-val aria-modal, klik naast paneel leeg scherm, terugknop verlaat app; Mark: bovenbalk 6 px te breed met getal) | 2026-11-13 06u Mark staand 810 + liggend 1080 (44 px, geen scroll; "?" naast × verwijdert oefening → HOOG) · 2026-11-13 02u Mark liggend 1080 + iPad Pro (#263 ok, Praktijk tikbaar, 44 px) · 2026-11-12 22u Mark staand + liggend (liggend 1080: Praktijk buiten beeld → HOOG; knoppen 30 px; Ideeën zonder opmaak) | – | – | – |
| Team: uitnodigen, rollen, verwijderen, inbox, dossier | 2026-11-13 18u Karin desktop + iPad (alle grenzen ok, X↔Y; #287 vaste vragen ok; iPad kopbalk zonder praktijknaam) · 2026-11-13 14u Karin desktop + iPad (16 beheerroutes 403 als therapeut, X↔Y; vaste vragen van collega overschrijfbaar → security) · 2026-11-13 10u Karin desktop + iPad (alle grenzen ok; emoji-e-mail geaccepteerd) · 2026-11-13 06u Karin desktop + iPad (alle grenzen hielden, 15 beheerroutes 403 als therapeut, X↔Y) · 2026-11-13 02u Karin desktop + iPad (alle grenzen hielden, 9 beheerroutes 403 als therapeut, X↔Y) · 2026-11-12 22u Karin desktop + iPad (alle grenzen hielden, ook leeslog X↔Y; leeslog miste losse kaartroutes → OPGELOST #262) · 2026-11-12 18u Karin desktop + iPad (alle grenzen hielden, 14 beheerroutes 403 als therapeut; tikdoelen Team iPad → OPGELOST, test:teamtikdoelen) · 2026-11-12 14u Karin (grenzen hielden; dubbelklik × verwijderde collega → OPGELOST, test:profieltherapeut; therapeut-telefoon → OPGELOST) · 2026-11-12 10u Karin desktop + iPad (alle grenzen hielden; therapeut-telefoon 403 stil + blijft lokaal; tikdoelen tweede stap) · 2026-11-12 06u Karin (tweede stap + verplichten: alles hield; login met e-mail bij andere praktijk → OPGELOST, test:loginanderepraktijk) · 2026-11-11 22u Karin (alle grenzen hielden, ook X↔Y en gelijktijdig degraderen; therapeut wijzigt praktijktelefoon: 403 maar scherm zwijgt) · 2026-11-11 18u Karin (grenzen ok; donker thema onleesbaar → OPGELOST, test:v2contrast; profiel collega na naamwijziging open) · 2026-11-11 14u Karin (alles ok: uitnodigen, rol heen en terug, verwijderde collega 401/403/404, min. één beheerder, zichzelf 400; profiel collega-apparaat leeg → OPGELOST, test:profielcollega) · 2026-11-11 02u (rollen via API ok; therapeut wijzigt praktijkprofiel → security) · 2026-11-10 10u (oude link na weigering → OPGELOST, test:vuleersterij) | 2026-11-12 14u Karin (tikdoelen Team < 44, × nu 44) · 2026-11-12 06u Karin (stap instellen bij inloggen ok; tweede-stap-links 15–16 px) · 2026-11-10 10u staand (uitnodiging aangenomen op iPad ok) | – | – | – |
| Beheer: gedeeld wachtwoord → eigen logins, profiel/logo → /k, prullenbak + herstel + definitief, X ↔ Y, /v2/gegevens download + WISSEN | 2026-11-13 18u Karin (overstap, akkoord, opzeggen/intrekken op eigen testserver ok; nep-logo stil genegeerd) · 2026-11-13 14u Karin (profiel/logo → /k in browser, nieuw akkoord, WISSEN + #282 gebruiksmeting weg ok) · 2026-11-13 06u Karin (profiel/logo → /k, WISSEN ok; nieuw akkoord onzichtbaar + onleesbaar → OPGELOST #269; /v2/gegevens therapeut pas 403 na invullen) · 2026-11-13 02u Karin (profiel/logo → /k, X↔Y, /v2/gegevens download + WISSEN ok; nieuw akkoord onzichtbaar; nep-logo stil) · 2026-11-12 22u Karin (profiel/logo → /k, X↔Y medialinks, /v2/gegevens download + WISSEN ok; nieuw akkoord onzichtbaar tot Praktijk) · 2026-11-12 18u Karin (X↔Y, profiel/logo → /k, /v2/gegevens download + WISSEN ok; #245 grens 100 lopende kaarten ok) · 2026-11-12 06u Karin (X↔Y, prullenbak, /v2/gegevens download + WISSEN ok) · 2026-11-12 02u Karin (WISSEN met gedeeld wachtwoord wiste eigenaar → OPGELOST; hernoemen naar naam praktijk Y → security) · 2026-11-11 14u Karin (alles ok; therapeut op alle beheerroutes 403 met zin; abonnement/opzeggen lokaal niet te testen zonder Mollie) | 2026-11-11 14u Karin + Mark (× eigen oefening collega → OPGELOST, test:gedeeldwerk; rolkeuze 32 px) | – | – | – |
| /privacy (100 % en 200 %) | – | 2026-11-13 02u Truus 200 % (schaalt niet mee) · 2026-11-11 02u iPad staand+liggend (afbreekstreepje inhoud, links 17 px) | 2026-11-13 14u Truus 200 % (bevestigd: schaalt niet mee) · 2026-11-13 06u Truus 200 % (ook /verwerkersovereenkomst: binnen beeld, schaalt niet mee) · 2026-11-13 02u Truus 200 % (px-fonts, 18 tikdoelen < 44) · 2026-11-09 18u (ok; kopregellinks 14–17 px) | – | 2026-11-12 06u (Engels: alleen NL; 17 tikdoelen < 44)
| Mijn gegevens /k, Wis van dit apparaat, /v2/gegevens | 2026-11-09 18u (/v2/gegevens: naam niet ingevuld, melding bovenaan) | – | 2026-11-13 14u Truus (download + wis ok; "1 dagen", "2 series, 30 sec herhalingen") · 2026-11-12 06u (wis ok, download ok) · 2026-11-09 18u (wis laat avatars in de cache) | 2026-11-08 02u | 2026-11-13 14u Jayden EN (download + wis + offline ok) · 2026-11-12 06u (Engels ok; datumnotaties wisselen) · 2026-11-09 18u (download Engels ok) |
| Vensters met alleen toetsenbord | 2026-11-13 14u Sanne (geen focusring op .btn, ring 1,4:1 → OPGELOST, test:focusring) · 2026-11-10 22u (Kaarten opent onderaan; radio/vinkje zonder focus; 1676× Tab; Escape 'Nieuw' → OPGELOST) · 18u (ok; 480 schemavakken zonder label; "Nieuw in Fysiplan" na Escape terug) | 2026-11-09 02u staand (fix, in test:vensterterug) | – | – | – |

Volgende run (na 2026-11-11 06u): /k storingsmelding in alle talen + lightbox bij 200 %, download volgende afspraak doorrollen,
onderbalk liggend centreren, /o zonder camera (galerij), daarna na merge van #167 de index-punten (+1 week zomertijd, reeks bewerken na start, oefendoel-select).
Oudere lijst (na 2026-11-11 02u): /k afspraaktijd in andere tijdzone en "nog N keer", tabtitel/zachte 404 op /k,
zoeken lege staat; na merge van #167 focus na Beveiligen/QR, gelijktijdig bewerken notitie/afspraak, ×-knop eigen oefening collega.
Oudere lijst (na 2026-11-10 22u): na merge van #167 de server/index-punten (praktijknaam in proefaanmelding, aria-invalid,
sjabloonknoppen collega, kaart verwijderen door elke collega (security), proefstatus voor collega's, afspraak weghalen na verloop);
/k afspraakreeks "nog 4 keer" (kaart.html), taalkeuze patiënt blijft niet (kaart.html `?taal=` wint van `fp_taal`), afspraaktijd
in download in andere tijdzone; therapeut-app focusvolgorde Kaarten en skip-link; iPad staand /o en /privacy.
Oudere lijst (na 2026-11-10 18u): na merge van #167 de server/index-punten hieronder (praktijknaam in proefaanmelding,
proefformulier aria-invalid, sjabloonknop voor collega, `pointer:coarse` voor .modal .btn en editor), compacte printkaart,
proefbalk "t/m"; daarnaast /k oefenstand bij 200 % en iPad liggend, /privacy op iPad, therapeut-app iPad liggend met toetsenbord.
Oudere lijst (na 2026-11-10 14u): compacte printkaart (HOOG, index.html `.pic` aspect-ratio), proefbalk "t/m <dag>" na merge van #167
(server.js), iPad-tikdoelen in de editor (`pointer:coarse`), /o met camera, landing /v2 op iPad, /k op iPad na #162.
Oudere lijst (na 2026-11-10 10u): na merge van #162 de nieuwe /k opnieuw (dubbeltik Gedaan, 200 %, liggend), "Compacte kaart"
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

### Sweep 2026-11-13 18u (vijf persona's lokaal met EIGEN_LOGIN_VERPLICHT=aan en PROEF_VERPLICHT=aan; geen 500's of pageerrors; alle beheergrenzen hielden, ook X ↔ Y; #287 bevestigd; CSV-formules en `<script>` overal geneutraliseerd)
- **OPGELOST 2026-11-13 PR #293 (test:eigenbibnaam) — HOOG (Mark, desktop + iPad) — eigen oefening met de naam van een bibliotheekoefening
  ("Squat", "Abroller") nam stil de plek in van die oefening** in standaardsjablonen en nieuwe kaarten van het hele team (`byNorm` in
  index.html, laatste wint). Server weigert nu zo'n naam (409, ook hoofdletters/accenten/eerdere namen). **Open:** bestaande eigen
  oefeningen met zo'n naam blijven staan (opruimen of hernoemen, LAAG).
- **OPGELOST 2026-11-13 PR #291 (test:oefnaam) — MIDDEL (Jayden, Pixel 7) — vinkje of "te zwaar" op een open /k telde bij de verkeerde
  oefening nadat de praktijk een oefening van de kaart haalde** (alleen de plek ging mee). Kaart stuurt nu de naam mee; server volgt die of
  geeft 409. **Rest LAAG:** een geweigerd vinkje (4xx) blijft stil groen staan (kaart.html `stuur(...).catch(function(){})`).
- **OPGELOST 2026-11-13 PR #292 (test:printroepnaam) — MIDDEL (Sanne, open sinds 14u) — roepnaamvoorstel in het printvenster maakte een
  tweede kaart; "Test de QR" deelde een volledige naam zonder vraag.**
- **OPGELOST 2026-11-13 PR #290 (test:allesgedaan) — MIDDEL (Truus, open sinds 14u) — "Alles gedaan" zonder bevestiging, focus op body;
  afvinkknoppen heetten allemaal "Gedaan".** Nu statusregio met focus, knoppen "<oefening>: Gedaan". Teller bij losse vinkjes wordt nu ook
  aangekondigd via dezelfde statusregio.
- **MIDDEL (Mark, bevestigd) — proefbalk pas na herladen na inloggen op een tweede apparaat** (ook bij verlopen proef). `PROEF` komt alleen
  uit `window.FYSIPLAN_PROEF` bij het laden van /v2/app; /api/praktijk/status geeft geen einddatum. Kleinste stap: status geeft `proef`
  (tot, dagenOver, beheer) mee en `psIngelogd` roept `proefStart()` opnieuw aan. Eerste kandidaat volgende run.
- **MIDDEL (Karin, iPad staand én liggend) — kopbalk toont nergens praktijk en login**: praktijkknop pas vanaf 1100 px (v2.css r. ~470/479),
  iPad liggend is 1080 px; "Ideeën" links van het logo, "Help"/"Updates" los op een eigen regel.
- **MIDDEL (Sanne, toetsenbord) — "Je praktijk – Vul je praktijknaam in" zet de focus in "Huidige kaart opslaan als" (`#k_naam`)** in plaats
  van het praktijknaamveld; getypte tekst wordt de kaartnaam (zb_praktijk r. ~1499 → kaartenBtn r. ~3712).
- **MIDDEL (Truus, bekend) — vergrote foto op /k is geen echt venster** (geen aria-modal/inert, focus blijft achter, na sluiten op body;
  kaart.html r. ~937, ~3462, ~3763). × is nu 44 px.
- **LAAG/MIDDEL (Jayden) — serverfout bij laden van /k: de service worker toont de oude kaart zonder melding** (balk alleen bij
  `navigator.onLine` false; kaart.html r. ~1213, kaart-sw.js r. ~112).
- **LAAG/MIDDEL (Karin, bekend) — verwijderde collega met open scherm**: "Openen" geeft alleen "Kaart openen is niet gelukt.", na herladen
  "Niet ingelogd" zonder uitleg (openSrvKaart r. ~5487). Ook: teruggezet naar therapeut houdt in een open Patiënten-lijst "Inzage" en ×.
- **LAAG/MIDDEL (Mark) — verlopen proef: "Eigen oefening toevoegen" en "Delen met de praktijk" geven een kale alert** in plaats van de
  proefbalk (index.html r. ~6707, ~3597 zonder `toonProefVoorbij`).
- **LAAG (nieuw):** focus op body na sluiten Test de QR (knop disabled vóór openen), na reservecodes, inloggen met reservecode en CSV (Sanne);
  Enter in praktijknaam bij welkom op 2e apparaat doet niets (Sanne); gebruikte reservecode zegt niet "al gebruikt" (Sanne); Doel 500 tekens
  afgesneden en "Doel:" overlapt op uitgebreide A4 (Sanne); "volledige naam"-label op "Kim 🧘‍♀️", "+31 test" (Sanne); "Deel" in Patiënten
  zonder aria-expanded (Sanne); eigen oefening niet te bewerken (Mark); "t/m <datum>" bij proefeinde om 04:00 (Mark); iPad-tikdoelen eigen
  oefening/sjabloonbalk 34–38 px (Mark); foto te groot zonder hint (Mark); "Read aloud" zonder speechSynthesis doet niets, EN-stem leest NL
  oefennaam (Jayden); herstelwoorden knop vs download verschillen (Jayden); uitvinken vandaag wist "laatst afgevinkt" van gisteren
  (patient-routes.js r. ~107) (Jayden); landing /v2 menulinks 20 px, voetlinks 14 px (Jayden); teamsjabloon van collega zonder uitleg wie
  mag verwijderen (Karin); nep-logo stil genegeerd (Karin); /v2/gegevens oude foutmelding na download (Karin); opzegmelding noemt
  "wachtwoord van de praktijk" (Karin); verlopen sessie op /api/kaarten zonder praktijk krijgt "Beveilig eerst" (Karin); naam uitnodiging
  10.000 tekens stil op 60 (Karin).
- **Naar security-backlog:** `eenVan`/`index` nemen arrays en "01" aan (`soort:["vraag"]`, `oef:[0]`) (Truus, Jayden; LAAG).
- **Bevestigd, nog open:** tikdoelen pijnknoppen 26–34 px en voetlinks /k, `#offlijn` zonder role, "1 dagen", Wis via confirm(), voorlees-
  melding niet B1, Nederlandse bestandsnamen .ics/.txt, voorbeeldkaart wordt echte kaart, 13e oefening als alert(), 0612345678, Team-tikdoelen
  desktop, emoji-e-mail, Vandaag-badge 3 vs 2, /v2/proef/wissen als therapeut "gewist", Activiteit leesbaar voor therapeut.
- **Volgende run:** proefbalk na inloggen (Mark MIDDEL), iPad-kopbalk zonder praktijk (Karin MIDDEL), praktijkknop-focus (Sanne MIDDEL),
  lightbox als venster (Truus MIDDEL); hertest #290–#293 op de live combinaties.

### Sweep 2026-11-13 14u (vijf persona's lokaal met EIGEN_LOGIN_VERPLICHT=aan en PROEF_VERPLICHT=aan; geen 500's of pageerrors; alle beheergrenzen hielden, ook X ↔ Y, 16 beheerroutes 403 als therapeut; #282 bevestigd)
- **OPGELOST 2026-11-13 (test:focusring) — HOOG (Sanne, desktop toetsenbord) — gewone knoppen (.btn) in V2 hadden geen zichtbare focus**
  (`html.v2 .btn{box-shadow}` won van `.btn:focus-visible`), en de ring (`--ring` limoen 27 %) haalde 1,4:1 op het lichte werkvlak en in
  de kopbalk. Nu een ondoorzichtige outline: petrol op licht, limoen in de kopbalk; zoekveld houdt bij focus een donkere rand.
- **OPGELOST 2026-11-13 (test:opnameplafond) — HOOG (Mark, iPad) — plafond van 20 opnames per praktijk telde ook opnames die al op een
  bewaarde kaart staan (4 uur) en elk geannuleerd QR-venster (15 min)**; de 21e gaf een kale alert "probeer het zo weer". Nu tellen alleen
  wachtende tokens en opnames zonder kaart, Annuleren geeft het token terug (`/api/opname/stop`), de weigering zegt wat je kunt doen en een
  verlopen proef toont de proefbalk.
- **OPGELOST 2026-11-13 (test:proefdag) — MIDDEL (Mark, vier runs open) — laatste proefdag onzichtbaar op een tweede apparaat en bij
  collega's.** /v2/app geeft elke ingelogde sessie van de praktijk de einddatum mee (zonder gegevens van de aanmelder, zonder proefwelkom);
  alleen een beheerder krijgt de link "Mijn proef".
- **Hertest 14u (Sanne, Mark):** focusring op 13 soorten knoppen 6–10:1, roepnaamveld op de A4 had nog geen ring → mee opgelost (4 px
  omdat de A4 verkleind staat). Opnameplafond en laatste proefdag opgelost. Rest: **MIDDEL** direct na inloggen op een tweede apparaat
  komt de proefbalk pas na herladen (einddatum alleen bij het laden van /v2/app; na de inlog geen herlaad); **LAAG** opnameweigering nog als
  alert() en het venster "Eigen instructievideo" is dan al dicht; "over een kwartier" klopt niet voor een binnengekomen opname zonder
  kaart (tot 4 uur); proefbalk bij een collega toont ook "0 / 12 oefeningen" en "Test de QR".
- **MIDDEL (nieuw, Sanne) — roepnaamvoorstel in het printvenster maakt een tweede kaart** en laat de kaart met de volledige naam op de
  server: index.html r. ~3018–3022 zet `cn.value=vs` maar niet `ROEP_VOOR` (vgl. `zet()` r. ~2759), dus geen `roepnaamHernoem` → 409
  hernoemVraag → "nieuwe kaart". Ook "Test de QR" deelt een volledige naam zonder de roepnaamvraag. Eerste kandidaat volgende run.
- **MIDDEL (nieuw, Truus, schermlezer) — "Alles gedaan" verdwijnt na de tik (display:none), focus valt op body en `#ovtekst` is geen
  live-regio**: geen bevestiging (kaart.html r. ~1469–1496, ~796).
- **LAAG/MIDDEL (nieuw, Sanne) — de voorbeeldkaart wordt na het beveiligen stil een echte patiëntkaart** ("Voorbeeldpatiënt", telt mee in
  Patiënten en CSV; index.html r. ~3354/~3418 + autosave).
- **LAAG/MIDDEL (nieuw, Karin) — verwijderde collega met een open scherm** houdt de kaartenlijst in beeld; "Openen" geeft alleen
  "Kaart openen is niet gelukt." (openSrvKaart r. ~5475 handelt 401 niet af). Server weigert wel netjes.
- **LAAG (nieuw):** "Kaarten openen" (derde sprongkoppeling) ook dood buiten Kaart maken (Sanne); roepnaam met `<script>` geeft voorstel
  "Jan S." (Sanne); focusring "Naar de kaart" 1,3:1 (Sanne; meegenomen in test:focusring); Doel van 10.000 tekens stil afgekapt op 500
  (Sanne); download "Mijn gegevens": "1 dagen" en "2 series, 30 sec herhalingen" (kaart.html r. ~2297, ~2316), geen melding na download,
  Wis via confirm() (Truus); voorleesmelding "Nog geen actuele stemopname … 2 oefening(en)" niet B1 (r. ~2736) (Truus); `#offlijn` zonder
  role=status (Truus); lightboxknoppen 40 px bij 100 % en "Privacy" 34 px bij 200 % (Truus); `/api/kaart/oefening` neemt `oef:"0"` (tekst)
  aan (Jayden); `#leesNoot` vast Nederlands (nu verborgen op EN) (Jayden); × "te zwaar" in Patiënten 14×14 px inline (index.html r. ~5648)
  (Mark); "Afgehandeld" zonder r.ok (r. ~5399) (Mark); verlopen-pagina /v2/proef/overzicht noemt nog het praktijkwachtwoord (Mark);
  Vandaag-badge 3 tegenover "2 seintjes" in Patiënten (Karin); goed-seintje na een open vraag niet in de inbox, de patiënt ziet het wel
  in de download (ontwerp SEIN_W) (Truus).
- **Naar security-backlog:** therapeut kan vaste vragen van een collega overschrijven/wissen (Karin, MIDDEL); /v2/proef/wissen als therapeut
  meldt "gewist" (Karin, LAAG). **Legal:** verwijderde collega in `beheer-gebruik.json` (staat al open, legal 13u).
- **Bevestigd, nog open:** sprongkoppelingen, browser-terugknop, aria-invalid, 0612345678, 13e oefening als alert(), "Nieuw in Fysiplan",
  lightbox geen echt venster, "Gedaan" zonder oefeningnaam, /privacy schaalt niet, "vandaag nog", afgewezen afspraakdatum blijft staan,
  Praktijk-knoppen iPad 30 px, Activiteit met ip's leesbaar voor therapeut, "gedaan" truthy, ICS NL-bestandsnamen.
- **Volgende run:** roepnaamvoorstel (Sanne MIDDEL), "Alles gedaan" focus (Truus), verwijderde collega open scherm (Karin); Mark: teamsjabloon
  en eigen oefening met foto (niet gedaan 14u); Jayden: EN-kaart met vertaaldienst niet lokaal te testen.

### Sweep 2026-11-13 10u (vijf persona's lokaal met EIGEN_LOGIN_VERPLICHT=aan en PROEF_VERPLICHT=aan; container halverwege herstart, persona's gingen verder op dezelfde datamap; geen 500's of pageerrors; alle beheergrenzen hielden, ook X ↔ Y; CSV-formules (ook met tab ervoor) geneutraliseerd)
- **OPGELOST 2026-11-13 PR #275 (test:vragennaastweg) — HOOG (Mark, open sinds 06u) — iPad: tik op/naast de "?" verwijderde de oefening.**
  Op een tablet nu elk knopje een eigen strook (× rechtsboven, ? rechts midden, eigen video linksonder), tikvlakken overlappen niet (vier iPads gemeten).
- **OPGELOST 2026-11-13 PR #276 (test:zoekpijl) — HOOG (Sanne, desktop toetsenbord) — zoeken + pijl omlaag + Enter koos stil de 2e, 3e, … treffer.**
  `keyboardIndex` liep door van de vorige zoekopdracht; nu terug bij nieuwe zoekterm, categorie of slim filter.
- **OPGELOST 2026-11-13 PR #277 (test:opnamewacht) — HOOG (Mark) — eigen opname via /o stil gewist als de kaart niet binnen een kwartier bewaard
  was** (kaart kwam terug met `vids:{}`, editor bleef "Nu gekoppeld" tonen), en 404 voor de eigen praktijk vóór het bewaren (NAKIJKEN van security).
  Nu wacht een binnengekomen opname 4 uur (`OPNAME_BEWAAR_MS`) en ziet de eigen praktijk hem meteen.
- **MIDDEL (nieuw, Mark, rest van #277) — opname zonder kaart verdwijnt nog bij elke herstart/deploy** (tokens alleen in het geheugen,
  `weesOpnamesOpruimen` bij opstarten; bewuste legal-keuze 2026-11-08). En de editor controleert niet of de bewaarde kaart de opname echt
  draagt (index.html r. ~2905): bij een weigering blijft "Nu gekoppeld" staan. Kleinste stap: na het bewaren `c.vids` vergelijken en melden
  "Je opname is niet bewaard, neem hem opnieuw op". De app heeft ook nergens een speelbaar voorbeeld van de eigen opname (`openEigenVideo` r. ~6860).
- **MIDDEL (nieuw, Sanne) — sprongkoppelingen "Naar oefening zoeken"/"Naar de kaart" doen niets op Vandaag, Patiënten en Praktijk**
  (doel display:none; index.html r. ~1724: eerst `zetScherm('maken')`, of de koppelingen alleen op Kaart maken tonen).
- **MIDDEL (nieuw, Truus, iPhone SE, schermlezer) — vergrote foto op /k is geen echt venster** (focus blijft achter, geen aria-modal/inert,
  na Escape focus op body; kaart.html r. ~937 en ~3463). **Afvinkknoppen heten allemaal "Gedaan"** zonder oefeningnaam (r. ~1862) en
  **afvinken/"Ik heb vandaag geoefend" geeft geen gesproken bevestiging** (geen live-regio, r. ~3294–3306; offline wel). Bevestigingen
  (mdank, pskdank, …) verschijnen tegelijk met hun tekst: op een echte iPhone nagaan of VoiceOver ze voorleest (zetDank r. ~2154).
- **LAAG (nieuw):** Patiënten: "Rapport" en "Exporteer (CSV)" 22 px hoog, Tab-volgorde springt omhoog (bekend) (Sanne); vinkje "Alleen mijn
  patiënten" 16×13 zonder focusring (Sanne); /v2/proef "Vul drie gegevens in" terwijl er ook twee vinkjes verplicht zijn (Sanne); roepnaam
  editor 40 tekens, patiënt ziet 30 (Sanne); "Delen met de praktijk" (sjabloon) op iPad 125×15 px (Mark); welkom op een tweede apparaat
  zonder "Ik heb al een account" (Mark); pijnschaalknoppen heten "0"–"10" zonder "pijn" (Truus); "groter bekijken" in het overzicht opent
  de oefenstand (Truus); "Ik heb vandaag geoefend" uitzetten via native confirm() met "oefening(en)" (Truus); title printknop Nederlands op
  de Engelse kaart (kaart.html r. ~917) (Jayden); ICS-bestanden heten afspraak.ics/oefenmomenten.ics op de Engelse kaart (server.js r. ~7270,
  ~7471) (Jayden); oefennaam zonder vertaling zonder melding (alleen zonder vertaaldienst) (Jayden); dubbeltik "Done" in de stappenmodus
  springt naar de volgende oefening (kaart.html r. ~3232) (Jayden); uitnodigen accepteert "😀@voorbeeld.nl" (`geldigEmail`) (Karin);
  nieuwe beheerder krijgt "Welkom" en direct "Nieuw in Fysiplan" (Karin).
- **Naar legal-backlog:** "Alles wissen" laat praktijknaam + login-id's tot een dag in `beheer-gebruik.json` (Karin).
- **Bevestigd, nog open:** 0612345678, 13e oefening als `alert()`, tikdoelen Team (39×15 "wissen", × 32×36, rolkeuze 32 hoog).
- **Volgende run:** Mark: afspraak/seintje, signalen, proef bijna verlopen/verlopen en iPad liggend (vielen weg door de herstart);
  Karin: kaartenoverzicht en inbox van de praktijk via het scherm, /k met nieuw logo in de browser; Jayden: "Mijn gegevens", voorlezen, "Te zwaar?".

### Sweep 2026-11-13 06u (vijf persona's lokaal met EIGEN_LOGIN_VERPLICHT=aan en PROEF_VERPLICHT=aan; geen 500's of pageerrors; alle beheergrenzen hielden, ook X ↔ Y, 15 beheerroutes 403 als therapeut)
- **OPGELOST 2026-11-13 PR #269 (test:akkoordvandaag) — HOOG (Sanne) — de zin bij het akkoordvinkje was onleesbaar** (wit op #fffbeb, 1,04:1,
  `html.v2 .modal label{color:var(--ink)}` won van `#ps_akkoord`), precies bij het akkoord dat elke praktijk na #265/#268 opnieuw moet geven.
  Ook de knop Akkoord 34 px op iPad (Karin) en focus op body na Akkoord (Sanne).
- **OPGELOST 2026-11-13 PR #269 (test:akkoordvandaag) — MIDDEL (Karin, Sanne; drie runs open) — nieuw akkoord onzichtbaar buiten Praktijk.**
  Nu stip op de knop Praktijk en een melding op Vandaag/Patiënten met "Naar Praktijk" (alleen voor een beheerder).
- **OPGELOST 2026-11-13 PR #270 (test:landingscherm) — MIDDEL (Jayden, twee runs open) — landing /v2 liggend op de telefoon: h1 onder het scherm.**
  Bij liggend en hoogte ≤ 500 px valt de banner (met AI-bijschrift) weg en scrollt de nav mee; kop op y≈164.
- **OPGELOST 2026-11-13 PR #271 (test:verloopsmal) — MIDDEL (Truus, iPhone SE) — "Jouw verloop" onleesbaar op 320 px** (datums door elkaar,
  bij 200 % + A A pagina 326 px breed). Nu zoveel staven als er passen en alleen datums die passen, in de taal van de kaart (lost ook de LAAG
  "grafieklabel vast dd-mm" op).
- **OPGELOST 2026-11-13 PR #275 (test:vragennaastweg) — HOOG (Mark, iPad staand + liggend) — tik naast de "?" (vaste vragen) op de kaart verwijdert de oefening zonder vraag**, dosering mee.
  `#a4 .pic .vv` staat vast op `left:40px;width:30px` (index.html r. ~190, schaalt niet met `--a4z`) en het tikvlak van `.rm` (24 + 2×10 px,
  v2.css r. ~771) overlapt in een smalle cel; `elementFromPoint` op "?" +12,+12 geeft `SPAN.rm`. Desktop niet (hover). Eerste kandidaat volgende run.
- **OPGELOST 2026-11-13 14u (test:proefdag) — MIDDEL (Mark, bevestigd, drie runs open) — laatste proefdag onzichtbaar op een tweede apparaat en bij collega's** (`/api/praktijk/status`
  zonder vervaldatum, server.js r. ~4183–4220; proefbalk index.html r. ~3393 alleen uit de cookie).
- **MIDDEL (Sanne, bevestigd) — browser-terugknop verlaat de app** (geen pushState/popstate in `zetScherm`, index.html r. ~1601).
- **LAAG/MIDDEL (nieuw, Karin) — /v2/gegevens toont een ingelogde therapeut het volle formulier** en weigert pas na invullen (403); de intro
  noemt nog "het wachtwoord van de praktijk"; ook een ingelogde beheerder moet praktijk en e-mail opnieuw typen (server.js r. ~8461).
- **LAAG (nieuw):** "I did my exercises today" op een trage lijn 1,5–3 s zonder reactie en een tweede tik stil genegeerd (kaart.html r. ~3536,
  `gdaan`; herstel/PSK gebruiken laatsteTikWint) (Jayden); `/api/kaart/gedaan` neemt elke truthy waarde als `aan` (Jayden); een tik ouder dan
  14 dagen of in de toekomst overschrijft de pijnscore van vandaag (`tikMoment` valt terug op `nu`, server.js r. ~2050) (Truus); "6 van 7
  gedaan" telt in de oefenweek en `#gdaan` niet als geoefend, in de download wel (Truus); afspraaktijd kaart (toesteltijd) ≠ download
  (Amsterdam) (Truus, bekend); focus op body na sluiten vergrote foto (`lbSluit`) (Truus); bij 200 % + A A "Nederlan" in de taalkeuze en
  oefennamen breken zonder streepje (Truus); tikdoelen /k: agenda-dagknoppen 37 px, privacylink 17 px, voetlinks 20 px, `.oefinfo` 22 px
  (Truus); Enter in het praktijknaamveld van het welkomvenster doet niets (`#pw_praktijk`, index.html r. ~3405) (Sanne); praktijknaam van 50+
  tekens met emoji/HTML op de print na 2 regels afgekapt (Sanne); "je proef loopt nog vandaag nog" (`MIJN_KOP` server.js r. ~1515) (Mark);
  "+1 week" na verlopen proef laat de nieuwe datum in het veld staan na de 403 (`data-safweek` index.html r. ~6233) (Mark); snelle dubbeltik
  "Delen met de praktijk" geeft alsnog "Vervangen?" (`deelKlikTot` beschermt Delen niet na `renderSjabLijst`) (Mark); de patiënt ziet geen
  verloop van ervaren herstel (productkeuze) (Truus); teksten "Log onder Kaarten in" / "wis … bij Kaarten" (Karin, bekend).
- **Bevestigd, nog open (gezien, niet opnieuw beschreven):** aria-invalid proefformulier, 0612345678, `<script>` stil gestript, 13e oefening als
  `alert()`, "Nieuw in Fysiplan" na herladen, focus op body na welkom/reservecodes, "knop Kaarten", pijnschaal 26–34 px, /privacy in px,
  iPad-tikdoelen (Help/Updates, Naar dossier, chips, eigen-videoknop), zachte 404 op /k, praktijknaam bovenbalk afgekapt.
- **Ter info:** /v2/en geeft nu een nette 404 (LAAG "/v2/en 200 met inlogpagina" opgelost); de therapeut-app opent bewust op Kaart maken,
  het commentaar r. ~1683 klopt niet meer (Mark).

### Sweep 2026-11-13 02u (vijf persona's lokaal met EIGEN_LOGIN_VERPLICHT=aan en PROEF_VERPLICHT=aan; geen 500's of pageerrors; alle beheergrenzen hielden, ook X ↔ Y; #263 hertest ok: geen Tab-val, klik naast paneel ok, thuiskaart niet afgekapt, schermknoppen iPad liggend 44 px)
- **OPGELOST 2026-11-13 PR (deze run, test:proefbeheer) — HOOG (Mark, iPad, tweede apparaat) — na een verlopen proef kon de beheerder
  vanaf een tweede apparaat niet doorgaan of betalen.** "Wil je doorgaan?" en de tegel "Proef en abonnement" openden het
  aanmeldformulier; met het eigen adres kwam "Met dit e-mailadres loopt al een proef" (terwijl die voorbij was). Nu kennen /v2/proef en de
  formulieren erachter (doorgaan, betalen, opzeggen, factuur, factuurgegevens, overzicht, wissen) ook de proef van de ingelogde praktijk,
  alleen voor een beheerder met eigen login; een collega ziet "De proef en het abonnement regelt een beheerder van je praktijk".
  Dekt ook de MIDDEL "tegel Proef en abonnement opent op een tweede apparaat het aanmeldformulier".
- **OPGELOST 2026-11-13 PR (deze run, test:vandaagdatums) — MIDDEL (Sanne, Karin) — Vandaag zei "Iedereen met een kaart heeft deze week
  geoefend" terwijl niemand oefende** (alleen kaarten < 2 dagen). Nu "Nog niets te tellen …" of "Nog geen gedeelde kaarten".
- **OPGELOST 2026-11-13 PR (deze run, test:vandaagdatums) — MIDDEL (Sanne) — proefteller "12 / 12" 1,7:1** (V2-rood op witte pil). Nu vast #b42318.
- **OPGELOST 2026-11-13 PR (deze run, test:vandaagdatums) — MIDDEL (Jayden, twee runs open) — datumnotaties wisselen op de Engelse kaart**
  ("December 27, 2026" naast "Tuesday 17 November"): `datumLang` en de antwoorddatum gebruiken nu en-GB. Nog open (LAAG): grafieklabel
  "13-11" hard dd-mm (kaart.html r. ~1914), printtitel altijd NL-datum (r. ~3771).
- **OPGELOST 2026-11-13 PR (deze run, test:veiliggroot) — MIDDEL (Truus, iPhone SE 200 % + A A) — veiligheidszin "Neem pijn serieus …"
  rechts afgekapt, en een vaste vraag maakte de pagina 16 px breder met het "+" uit beeld.** Tekst in flexbox kreeg `min-width:0` en afbreken.
- **MIDDEL (Mark, bevestigd) — laatste proefdag onzichtbaar op een tweede apparaat**: `/api/praktijk/status` geeft voor de ingelogde
  praktijk geen vervaldatum (server.js r. ~4198), de proefbalk (index.html r. ~3386) kan alleen met de proefcookie gevuld worden.
- **MIDDEL (Sanne, bevestigd) — browser-terugknop verlaat de app** (geen pushState/popstate in `zetScherm`, index.html r. ~1599).
- **MIDDEL (Karin, bevestigd; na #265 relevant) — nieuw akkoord (VWO 2026-11-13) onzichtbaar buiten Praktijk**: geen badge op Vandaag of in de
  bovenbalk (`tekenAkkoord` index.html r. ~4765 tekent alleen in `#ps_akkoord`). Elke bestaande praktijk moet na #265 opnieuw akkoord geven.
- **MIDDEL (Jayden, nieuw) — landing /v2 op een liggende telefoon**: h1 begint op y≈420 (onder het scherm), vaste nav 98 px, label "Beeld
  gemaakt met AI" schuift over de slogan in de foto (v2.html r. ~573 `@media(min-width:701px)` geldt ook liggend; `--knip`).
- **LAAG (nieuw):** Patiënten: Tab-volgorde wijkt af van wat je ziet (v2.css r. 318 `#k_srv{order:-1}`) en "Huidige kaart opslaan als" staat op
  het patiëntenscherm (Sanne); thuiskaart Groot zegt "zes grote plaatjes per vel" maar geeft er 4, en "10.Squat" zonder spatie bij 10–12
  (index.html r. ~577) (Sanne); praktijknaam bovenbalk al bij 17 tekens afgekapt op 1280 (Sanne); "It's going well" geeft op een trage lijn
  ±3 s geen reactie (kaart.html r. ~3560) (Jayden); /en/privacy en /v2/en geven 200 met de inlogpagina (Jayden); logo-upload die geen
  afbeelding is geeft geen melding (index.html r. ~3120, `durl` null) (Karin); `cleanName` kapt op UTF-16 en laat een losse surrogaat
  achter bij emoji (server.js r. ~3162; `Array.from`) (Karin); "1 dagen" in de download Mijn gegevens (kaart.html r. ~2271) (Truus); /privacy
  in vaste px, schaalt niet mee met de tekstgrootte van Chrome/desktop (juridisch.html) (Truus); API accepteert onbekende oefennaam
  en vids-sleutels die /k nooit toont (Truus); lightboxknoppen 40 px (Truus); iPad: veel tikdoelen < 44 px buiten de schermknoppen
  (bovenbalk Help/Updates 30, Vandaag "Naar dossier" 32, praktijkslot 30, welkom 36) (Mark); initialen-avatar "HO" bij emoji/HTML in roepnaam (Mark).
- **Bevestigd, nog open:** aria-invalid proefformulier, 0612345678, "Nieuw in Fysiplan" direct na herladen, focus op body na welkom/reservecodes,
  voorbeeldkaart wordt gedeeld (401 vóór inloggen), 13e oefening als `alert()`, zachte 404 op /k, "knop Kaarten"/"log onder Kaarten in"
  (ook /v2/uitnodiging), /privacy alleen NL, tikdoelen /k (pijnschaal 26–34 px), oefenstand liggend niet gecentreerd, uitleg Balans noemt bosu.
- **Ter info (Karin):** elke therapeut leest `/api/praktijk/activiteit` (staat al als LAAG in de security-backlog, 2026-11-12 14u).

### Sweep 2026-11-12 22u (vijf persona's lokaal met EIGEN_LOGIN_VERPLICHT=aan en PROEF_VERPLICHT=aan; geen 500's of pageerrors; alle beheergrenzen hielden, ook X ↔ Y, leeslog en tijdelijke medialinks)
- **OPGELOST 2026-11-12 22u PR #262 (test:seintjestand) — MIDDEL (Jayden, drie runs open) — seintjesknoppen tonen de laatste tik.** Nu tekent /k
  de knoppen uit de serverstand (POST `open`, GET `kaart.seinOpen`), met aria-pressed, uitleg "je eerdere seintje blijft openstaan" in negen
  talen, seintjes één tegelijk.
- **OPGELOST 2026-11-12 22u PR #262 (test:vertaaldeels) — MIDDEL (Jayden, #250) — één ontbrekende vertaling gooide de hele vertaalde kaart weg**
  (503/502 bij geen sleutel, andere site of storing). Nu `deels:true` met wat er is.
- **OPGELOST 2026-11-12 22u PR #262 (test:medialinkvers) — MIDDEL, HOOG voor de beginscherm-app (Truus, #249) — kaart die 12–24 uur openstaat
  verliest eigen video en foto** ("neem contact op", "Opnieuw proberen" op dezelfde verlopen link, kapot plaatje). Nu nieuwe links bij een
  mediafout en na tien uur. Nog open (LAAG): de service worker geeft bij 429/5xx de oude kaart-JSON met mogelijk verlopen links.
- **OPGELOST 2026-11-12 22u PR #262 (test:leeslog) — MIDDEL (Karin, #247) — leeslog miste wijzigingen via de losse kaartroutes** (notitie, naam,
  behandelaar, afspraak, doel, PSK-doel, archief, dossier, antwoord). Prullenbak/herstel staan alleen in het beheerlogboek (bewust).
- **OPGELOST 2026-11-12 PR #263 (hertest 2026-11-13 02u ok) — HOOG (Sanne, desktop toetsenbord) — vier schermen zijn een aria-modal dialoog met Tab-val** (Vandaag: Tab alleen tussen `ib_mijn` en
  `wb_knop`; `vensterToetsenbord` index.html r. ~6870–6940). Bouw-agent deze run, zie de PR "kaart: schermen …".
- **OPGELOST 2026-11-12 PR #263 (hertest 2026-11-13 02u ok) — HOOG (Sanne) — thuiskaart (#252) met Groot lettertype kapt de uitleg af bij 10/12 oefeningen** (`.tk-uitleg{overflow:hidden}` r. ~323,
  r. ~333; drempel tk-lang/tk-veel rekent niet met Groot); zonder Groot 1/12 ("…en wissel de voeten." weg). Bouw-agent deze run.
- **OPGELOST 2026-11-12 PR #263 (hertest 2026-11-13 02u ok) — HOOG (Mark, iPad liggend 1080) — schermmenu loopt van het scherm, Praktijk niet te tikken** (v2.css r. ~976: eigen rij pas onder 920 px).
  Verwant MIDDEL: bovenbalk 1280 px 6 px te breed met `.fs-tel`; "Ideeën" onder 1100 px zonder opmaak (#efefef met witte tekst); schermknoppen
  30 px op iPad. Bouw-agent deze run.
- **MIDDEL (nieuw):** klik naast het paneel op Patiënten/Praktijk geeft een leeg scherm (index.html r. ~6945) (Sanne); browser-terugknop verlaat
  de app i.p.v. vorig scherm (geen pushState/popstate in `zetScherm`) (Sanne); Vandaag zegt "Iedereen met een kaart heeft deze week geoefend"
  terwijl niemand oefende (kaarten < 2 dagen weggelaten, `tekenNietGeoefend`) (Sanne); proefteller "12 / 12" 1,7:1 contrast (`var(--fout)`
  op wit, r. ~3270) (Sanne); tegel "Proef en abonnement" opent op een tweede apparaat/collega het aanmeldformulier (`/v2/proef?mijn=1` kijkt
  alleen naar de proefcookie, server.js r. ~7808) (Mark); nieuwe voorwaarden/VWO onzichtbaar tot je naar Praktijk gaat (geen badge) (Karin);
  "Ik heb een vraag" stuurt geen inhoud en de verwijstekst onder de vaste vragen suggereert dat wel (#254, productkeuze) (Truus); eigen vragen
  van de praktijk blijven Nederlands op een Engelse kaart, melding pas onder het blok (#254/#250, productkeuze) (Jayden).
- **LAAG (nieuw):** paneelkop blijft "Patiënten/Praktijk" bij de knop Kaarten (r. ~3634) (Sanne); teksten noemen nog "knop Kaarten" voor inloggen
  (r. 596, 633, 1480, 1559, ~6705) en "Daarna beveilig je hem met een wachtwoord" (Sanne, Mark); vaste-vragenknop 14×14 px, label zonder
  oefennaam, fouten als `alert()` (Sanne); thuiskaart-dosering "3 series van 10-12" zonder "herhalingen" (`thuisDosering`) (Sanne); vaste
  vraag met lange URL maakt /k horizontaal scrollbaar (`.vvlijst summary` r. 467, min-width) (Truus); `/api/praktijk/vragen` accepteert elke
  oefennaam, `__proto__` stil 200 (Truus, Jayden); uitleg "Balans op 1 been" noemt een bosu (inhoud, niet aanraken: videostroom) (Truus);
  voorbeeldkaart wordt bij het eerste openen echt gedeeld en geeft daarna elke start een 409 (Truus, Mark); "Inzage" 66×32 en akkoordvinkje
  13×13 op iPad (Karin); WISSEN accepteert ook "wissen" (bewust, wijkt af van label) (Karin); knopje eigen video 24 px (Mark); Team-tegel
  zonder login → kale `alert()` (Sanne, Mark).
- **Bevestigd, nog open:** verlopen-pagina voor de eigenaar met proefcookie; laatste proefdag alleen met proefcookie; aria-invalid en
  script-strip in het proefformulier; 0612345678; "Nieuw in Fysiplan" direct; focus naar body na Begrepen/reservecodes; voorbeeldkaart in
  CSV; zachte 404 op /k; oefenstand liggend niet gecentreerd; afspraaktijd kaart ≠ .ics; tikdoelen pijnschaal/dagknoppen/voetlinks; collega
  op vers apparaat laadt eigen oefeningen niet.
- Niet getest: abonnement/opzeggen (geen Mollie lokaal), mailvarianten, echte WebKit/iOS-PWA, 200 % in de therapeut-app.

Volgende run (na 2026-11-12 22u): na merge van de bouw-PR de vier schermen opnieuw (toetsenbord, iPad liggend, terugknop, klik naast paneel),
thuiskaart Groot hertesten; dan "Proef en abonnement" voor collega's, akkoord-badge, Vandaag-lege-staat, proefteller-contrast.

### Sweep 2026-11-12 18u (vijf persona's lokaal met EIGEN_LOGIN_VERPLICHT=aan en PROEF_VERPLICHT=aan; geen 500's of pageerrors; alle beheergrenzen hielden, ook X ↔ Y)
- **OPGELOST 2026-11-12 18u (test:tweedestaponderbroken) — HOOG (Sanne, desktop) — tweede stap onderbroken (herladen of tab dicht):** het slot
  zei alleen "beveiligd", het e-mailveld was leeg en het QR-vak raadde "Andere praktijk met deze naam" aan. Dat maakte een tweede praktijk met
  dezelfde naam en hetzelfde adres; daarna gaf inloggen 409 "kies" met twee gelijke namen: buitengesloten. Nu geeft de status op het apparaat
  van de proef `vanMij`/`stapOpen`, vult de app het adres in, zegt dat de tweede stap nog niet af is en biedt geen "andere praktijk" aan; de
  server weigert `nieuw:true` met hetzelfde e-mailadres (409). Hertest door Sanne: alles ok.
- **OPGELOST 2026-11-12 18u (test:video-recovery) — HOOG bij 200 % (Truus, iPhone SE) — video zonder internet:** "neem contact op met je
  praktijk" en bij 200 % een blok van 422 px over de video met "Opnieuw proberen" onder de onderbalk. Nu "Deze video heeft internet nodig.",
  de video verdwijnt bij een fout (`vfout`), de knop is te bereiken. Koppen en oefennamen breken bij 200 % af met een streepje (`hyphens`).
- **OPGELOST 2026-11-12 18u (test:teamtikdoelen) — MIDDEL (Karin, iPad) — tikdoelen Team:** rolkeuze, uitnodigvelden, knoppen en de losse
  links ("wissen", "Nieuwe reservecodes", "Stel opnieuw in") nu 44 px op aanraakschermen; de rolkeuze heet "Rol van <naam>".
- **MIDDEL (Jayden, bevestigd en breder) — seintjesknoppen tonen de laatste tik, niet wat de server bewaart.** Ook met 4 s tussen pijn en goed
  blijft groen "It's going well" staan terwijl de server pijn houdt; na herladen staat geen knop aan (GET /api/kaart stuurt `seintje` niet mee,
  POST antwoordt alleen ok). Binnen 30 s nog eens pijn tikken laat "goed" staan (`SEIN_LAATST` springt eruit vóór het tekenen). Serverregel
  (`zetSeintje`): goed 1 < vraag 2 < pijn 3; zwaarder of even zwaar en niet ouder vervangt, het oude gaat naar `ook`; "goed" komt nooit in
  `ook`; `inboxItems` geeft `ook` de tijd van het hoofdseintje. Voorstel: POST en GET geven `open:{soort,ook}`, de kaart tekent de knoppen
  daaruit (+ `aria-pressed`), `ook` als `[{soort,t}]`.
- **MIDDEL (Mark, bevestigd) — verlopen proef:** eigenaar op het apparaat met de proefcookie krijgt de verlopen-pagina (server.js `/v2/app`
  r. ~8517) i.p.v. de alleen-lezen app met Naar dossier/Afgehandeld; daar is het e-mailveld leeg (`V_OV_EMAIL`) en noemen de labels het
  "wachtwoord van de praktijk". Laatste proefdag alleen zichtbaar met de proefcookie (status geeft geen `proefTot` voor `acc.proef`).
- **LAAG (nieuw):** offline-balk op /k 13,5 px bij 200 % (in rem maakt hem op iPhone SE half het scherm: eerst niet-sticky bij `krap`)
  (Truus); voorleesmelding noemt bibliotheeknamen i.p.v. de namen op de kaart (`noorItem`, kaart.html r. ~2392) (Truus); oude QR van de
  tweede stap werkt stil niet meer na een nieuw geheim, met een tip over de tijd (Sanne); QR-test en 13e oefening als kale `alert()`
  (Sanne); focus in Kaarten op "Huidige kaart opslaan als" i.p.v. het wachtwoordveld (Sanne); logoknop blijft na degradatie tot herladen
  (Karin, `applyLogo`); telefoon van een therapeut blijft stil lokaal als het adres leeg is (`upsertPraktijk` r. ~2797) (Karin); verwijderde
  collega krijgt alleen "klopt niet" (Karin); opnieuw uitnodigen maakt de vorige link stil ongeldig, "geldig t/m" ontbreekt (Karin);
  /v2/gegevens na fout leegt e-mail/wachtwoord, wistekst noemt team en ideeënbox niet (Karin); afgewezen afspraakdatum blijft in het veld
  (Mark, `toonA`); "Eigen oefening" open na verloop (Mark); collega met alleen een sessiecookie op een vers apparaat ziet geen praktijk (Mark).
- **Bevestigd, nog open:** roepnaam blijft na Uitloggen in "Huidige kaart opslaan als" (`prakUitgelogd`); proefformulier zonder
  `aria-invalid`; 0612345678; `<script>` stil gestript; voorbeeldkaart telt mee in CSV; "Nieuw in Fysiplan" direct na welkom; pijnschaal
  26–34 px breed en cijfers groeien niet mee; "Privacy (in Dutch)" en voetlinks < 44; oefenstand liggend (foto 93×140); inbox "vraag" met de
  tijd van "pijn"; overzicht blijft "te veel pijn" na "goed"; tikdoelen Kaarten-paneel iPad en sjablonen (15–32 px).
- Niet getest: abonnement/opzeggen (geen Mollie lokaal), mailvarianten, echte WebKit, .ics-inhoud bij Truus.

Volgende run (na 2026-11-12 18u): seintjesknoppen uit de serverstand (MIDDEL, drie runs open), verlopen-pagina voor de eigenaar + e-mail
invullen + `proefTot` in de status, offline-balk bij 200 %, voorleesnamen.

### Sweep 2026-11-12 14u (vijf persona's lokaal met EIGEN_LOGIN_VERPLICHT=aan en PROEF_VERPLICHT=aan; geen 500's of pageerrors; alle beheergrenzen hielden, ook X ↔ Y, verwijderde collega = sessie, login en reservecodes dood)
- **OPGELOST 2026-11-12 14u (test:herstellaatstetik) — HOOG (Jayden, Pixel 7 + iPhone 14, trage lijn) — ervaren herstel snel na elkaar: de
  eerste tik won.** "Much worse" en 0,3 s later "Much better" gaven twee parallelle verzoeken (bezig-slot per knop); server, knop en inbox
  hielden -2, precies omgekeerd. PSK 3 → 8 bewaarde stil 3, en herstel offline liet de oude keuze gemarkeerd. Nu `laatsteTikWint` per schaal
  (één verzoek tegelijk, laatste tik nagestuurd), herstel toont de keuze meteen, offline de nieuwe keuze.
- **OPGELOST 2026-11-12 14u (test:profieltherapeut) — MIDDEL (Karin/Mark, open sinds 2026-11-11 22u) — therapeut wijzigt praktijktelefoon:
  403 zonder melding, nummer bleef lokaal en ging op de print.** Nu een melding bij de velden (13 px, aria-live), de kaart zet het profiel van de
  praktijk terug (ook in `fysiplan_settings`), en een therapeut ziet de logoknop niet meer.
- **OPGELOST 2026-11-12 14u (test:profieltherapeut) — MIDDEL (Karin, desktop) — dubbelklik op × in Team verwijderde een collega zonder
  echte bevestiging;** "Zeker?" liep over de knop van 32 px en het label noemde niemand. Nu telt de bevestiging pas na 700 ms (ook bij
  "zeker wissen?" van de tweede stap), de knop zegt "Zeker verwijderen?" en het label noemt de collega; op aanraakschermen 44 px.
- **MIDDEL (nieuw, Sanne, desktop) — tweede stap onderbroken (herladen, terug, tab dicht) bij de nieuwe startroute:** geen uitleg, e-mailveld in
  Kaarten leeg, en het QR-vak zegt "Heet een andere praktijk toevallig hetzelfde? Kies 'Andere praktijk met deze naam'" (index.html r. ~2344
  en r. ~3013), wat een nieuwe gebruiker naar een tweede praktijk stuurt. Voorstel: `/api/praktijk/status` meldt "stap nog niet ingesteld" plus
  het e-mailadres (gemaskeerd), en de app toont "Log in met <e-mail> om de tweede stap af te maken". Opnieuw inloggen werkt wel.
- **OPGELOST 2026-11-12 15u (test:oefdagen; keuze Ahmed: een afgevinkte oefening telt als oefendag) — MIDDEL (Truus, iPhone SE + desktop) — "0 deze week actief" terwijl de patiënt vandaag 2 oefeningen afvinkte, pijn en herstel gaf.**
  `actiefDezeWeek` (index.html r. ~5373) telt alleen de dagvink `gedaan`, niet `oefTrouw`/metingen; "Download mijn gegevens" zegt idem
  "Dagen waarop ik heb geoefend: niets". Productvraag: telt een afgevinkte oefening als oefendag? (geen MDR-grens; alleen tellen).
- **MIDDEL (nieuw, Mark, desktop) — na verloop van de proef wordt /v2/app op het apparaat met de proefcookie de verlopen-pagina** (server.js
  r. ~8242), terwijl collega's en zijn iPad de alleen-lezen app met "Nieuw van patiënten" zien. Op die pagina is het e-mailveld leeg en noemen
  de labels het "wachtwoord van de praktijk" (proef.html r. ~243), dat niet meer bestaat.
- **MIDDEL (nieuw, Truus, 200 %) — koppen breken midden in een woord** ("Je fysiotherapeu / t iets laten weten"): `body{overflow-wrap:break-word}`
  zonder `hyphens:auto` (kaart.html r. ~357; alleen #hsknoppen heeft het). Voorstel: `hyphens:auto` op koppen met `lang` op html.
- **MIDDEL (Karin, iPad, bevestigd) — tikdoelen Team:** rolkeuze 100×32 zonder label, "wissen" 39×15, uitnodigvelden en "Nodig uit" 36 px,
  "Nieuwe telefoon? Stel opnieuw in" 16 px. (× is nu 44 px op aanraakschermen.)
- **LAAG (nieuw):** roepnaam blijft na Uitloggen in "Huidige kaart opslaan als" staan (Sanne); voorbeeldkaart wordt na inloggen stil als
  patiëntkaart bewaard en telt mee in CSV (Sanne); naam van de eigen login houdt `<b>` (claim `cleanName`, proef haalt `<>` weg; overal
  ge-escaped) (Sanne); focus naar body na "Ik heb ze bewaard" bij reservecodes, "Open hem hier" 93×16 (Sanne); voorleesmelding "Nog geen
  actuele stemopname: …" vast in het Nederlands en technisch (kaart.html `meldOntbrekend` r. ~2547) (Truus); afspraaktijd kaart (toesteltijd)
  ≠ download (Amsterdam) (Truus); pijnschaalcijfers groeien niet mee bij 200 % (Truus); "Privacy (in Dutch)" 121×20 en 118×17, dagknoppen
  agenda 37×44 (Jayden, Truus); na verloop staan "Eigen oefening" en "Bewaren/Delen" open en volgt een kale alert (Mark, index.html r. ~6109);
  "Nieuw in Fysiplan" opent bij een gloednieuwe proefgebruiker en een collega bij de eerste login (Mark, Sanne); overzicht blijft "meldt te
  veel pijn" tonen na een later "het gaat goed" (Mark); avatar "1" bij een naam die met een emoji begint (Karin).
- **Bevestigd, nog open:** seintjes snel na elkaar → groen "It's going well" terwijl server pijn + vraag heeft (Jayden); inbox geeft "vraag" de
  tijd van "pijn"; video offline-melding en bij 200 % over de video (Truus); laatste proefdag alleen op het apparaat met de proefcookie (Mark);
  collega op een kale /v2/app krijgt het algemene welkom (Mark); 0612345678; 401's in de console vóór inloggen; tweede-stapknoppen 36 px.
- Niet getest: abonnement/opzeggen (geen Mollie lokaal), mailvarianten, .ics bij Truus, therapeut-UI bij Jayden (kaart via API).

Volgende run (na 2026-11-12 14u): tweede stap onderbroken (status + e-mail), seintjesknoppen uit de serverstand, "actief deze week" (na
productkeuze), verlopen-pagina voor de eigenaar, `hyphens` bij 200 %, tikdoelen Team op iPad.

### Sweep 2026-11-12 10u (vijf persona's lokaal; geen 500's of pageerrors; alle beheergrenzen hielden, ook X ↔ Y en verwijderen = sessie dood)
- **Let op voor de volgende run:** start de lokale server met `EIGEN_LOGIN_VERPLICHT=aan PROEF_VERPLICHT=aan` (server.js r. ~347 en ~1025;
  standaard alleen aan in productie). Zonder die vlaggen geeft `/api/praktijk/claim` nog een gedeeld praktijkwachtwoord en bleef de nieuwe
  startroute van #222 (eigen login + tweede stap vanaf het begin) deze run ongetest.
- **OPGELOST 2026-11-12 10u (test:opnameverouderd) — HOOG (Mark, iPad staand + desktop) — eigen video stil kwijt als de kaart elders is gewijzigd.**
  Autosave na de opname kreeg 409 `verouderd`; de enige melding was 8,5 px in het QR-vak en "Open de nieuwste versie" gooide de video weg.
  Nu onthoudt de editor nog niet bewaarde opnames (`OPNAME_NIEUW`), toont één keer een venster plus een duidelijke hint, en "Open de nieuwste
  versie (video gaat mee)" zet de opname op de nieuwste versie en bewaart, zonder de wijziging van het andere apparaat te overschrijven.
- **OPGELOST 2026-11-12 10u (test:pijnscorebezig) — MIDDEL (Jayden, Pixel 7 + iPhone 14, trage lijn) — pijnscore 2 → 7 → 3 bewaarde stil 2.**
  Tikken tijdens het opslaan werden genegeerd; nu wint de laatste tik en gaat die na het antwoord als één verzoek mee.
- **OPGELOST 2026-11-12 10u (test-mijn-gegevens) — MIDDEL (Truus, iPhone SE 100 % en 200 %) — seintje uit de offline wachtrij ontbrak in
  "Download mijn gegevens"** tot herladen. `verstuurWacht` werkt nu `mijnSeintjes` bij. Nog open (LAAG): kaart offline heropend uit de
  werker toont de download van vóór het laatste online seintje (bewaarde /api/kaart wordt na een POST niet ververst); `oefZwaar` uit de
  wachtrij idem.
- **MIDDEL (Jayden, bevestigd) — seintjes snel na elkaar / offline: patiënt ziet groen "It's going well", server en inbox hebben pijn + vraag**
  (`zetSeintje` met `ook:[…]`). kaart.html r. ~3366–3377 zet de laatst getikte knop aan, los van de zwaarte-regel van de server.
  Voorstel: na het antwoord de knoppen tekenen uit `mijnSeintjes`/het antwoord van de server.
- **LAAG (Jayden + Truus, bevestigd) — tweede telefoon toont geen openstaand seintje; inbox geeft "vraag" de tijd van "pijn"** (server.js
  `inboxItems` r. ~1710 gebruikt `k.seintje.t` voor `ook`).
- **MIDDEL (Karin, bevestigd en iets erger) — therapeut wijzigt praktijktelefoon: 403 zonder melding én het nummer blijft in
  `fysiplan_settings` staan, dus de A4 van die therapeut drukt een geweigerd nummer af.** index.html `stuurPraktijk` (r. ~2611) handelt
  `d.beheer` niet af; "logo wijzigen" staat er ook voor een therapeut (`applyLogo`).
- **LAAG (Truus, bevestigd, bij 200 % MIDDEL) — video zonder internet:** "neem contact op met je praktijk" i.p.v. "heeft internet nodig";
  bij 200 % bedekt het blok (422 px) de video en valt "Opnieuw proberen" onder de onderbalk. kaart.html `bewaakVideo` r. ~2926.
- **LAAG (Karin, Sanne, Mark) — tikdoelen:** Team: "wissen" 39×15, "Verplichting opheffen" 136×16, "Nieuwe reservecodes", "Zet de tweede stap
  uit" 16 px, × verwijderen 32×36, rolkeuze 100×32, uitnodigvelden 36 px; Kaarten-paneel iPad: Team/Uitloggen/Activiteit 30 px, Deel/Openen
  32, "1 seintje" 22, video-icoon 24×24; /v2/gegevens-links 14–20 px.
- **LAAG (Sanne):** "Wachtwoord vergeten?" bij een eigen login (zonder `perEmail`) opent eerst het herstelcodeformulier; na uitloggen +
  inloggen hangt de editor niet meer aan zijn gedeelde kaart (printen vraagt "Is dit dezelfde patiënt?"; `prakUitgelogd` → `zetKaartId('')`).
- **LAAG (Mark):** Kaarten > Openen vraagt "Huidige kaart vervangen?" ook als het dezelfde kaart is.
- **Bevestigd, nog open:** proefformulier zonder `aria-invalid`/`aria-describedby`, 0612345678 met verwarrende melding, `<script>` stil
  gestript, focus op body na fout en na welkom; kaartnaam en A4-kop zonder maxlength; rol wisselen zonder bevestiging; oefenstand liggend
  (foto 93×140, onderbalk niet gecentreerd); pijnscore 26–34 px breed; 401's in de console vóór inloggen.
- Niet getest: proef bijna verlopen/verlopen (server leest proefdata alleen bij de start; herstart nodig), mail-varianten (mail lokaal uit),
  abonnement/opzeggen (geen Mollie lokaal), teamsjabloon en eigen oefening met video bij Mark (tijd).

Volgende run (na 2026-11-12 10u): server met EIGEN_LOGIN_VERPLICHT=aan en PROEF_VERPLICHT=aan; seintjesknoppen uit de serverstand tekenen;
403 bij praktijkprofiel voor een therapeut zichtbaar maken en lokaal terugzetten; video offline-melding; tikdoelen tweede stap in Team.

### Sweep 2026-11-12 06u (vijf persona's lokaal; geen 500's of pageerrors; beheergrenzen hielden, ook de nieuwe tweede stap)
- **OPGELOST 2026-11-12 06u (test:houdingengroot) — HOOG (Truus, iPhone SE, 200 %) — tekst in de vergrote foto groeide niet mee.**
  `.demouitleg` 12,5 px, `.demobron` 11 px (3,76:1), `.demotekst`/`#lbnaam` 15 px en de knoppen "Foto tonen"/"Luister" 14 px stonden in px.
  Nu in rem (uitleg 14 → 28 px, naam 15 → 30 px bij 200 %), bronregel #6b6455 (5,9:1).
- **OPGELOST 2026-11-12 06u (test:spronglinks) — HOOG (Sanne, desktop toetsenbord) — 2179 tabstops vóór de kaart, geen skiplink.**
  Nu drie sprongkoppelingen bovenaan (zichtbaar bij focus, 44 px): "Naar oefening zoeken", "Naar de kaart", "Kaarten openen"; het zoekveld
  heeft een naam en legt pijltjes + Enter uit; ster en plus noemen de oefening ("Squat: favoriet", aria-pressed). Alleen V2.
  Nog open: de lijst zelf blijft ±1.600 tabstops (ster + plus per rij); eventueel één tabstop per rij met pijltjes (roving tabindex).
- **OPGELOST 2026-11-12 06u (test:loginanderepraktijk) — HOOG (Karin) — login met e-mail kwam stil bij een andere praktijk binnen.** Zie security-backlog.
- **MIDDEL/HOOG (nieuw, Mark, iPad staand) — eigen video op een tweede apparaat stil kwijt als de kaart elders is gewijzigd.**
  iPad en desktop openen dezelfde kaart; desktop bewaart; iPad neemt via /o een video op → autosave 409 `verouderd`, server houdt `vids:{}`,
  geen video op /k. Enige waarschuwing staat in het QR-vak van de A4 (8,5 px, links 83×9 px). index.html r. ~2250 (`toonQrHint` bij
  `d.verouderd`) en r. ~1788 (`cb(s.video)` zonder bewaarcontrole). Voorstel: melding zoals bij printen + bewaarstatus na een opname.
- **LAAG (nieuw, Mark):** focus blijft op "Wachtwoord vergeten?" i.p.v. het herstelveld (iPad); "Sluiten" in Team half onder de rand bij het
  instellen van de tweede stap (iPad staand); /o met een niet-video zegt "opname is leeg of te kort"; Rapport valt terug op `window.prompt`.
- **Bevestigd, nog open (Mark):** therapeut wijzigt praktijktelefoon → 403 stil, A4 toont nieuw nummer (index.html r. ~2572 `stuurPraktijk`);
  twee collega's tegelijk op notitie/afspraak → laatste wint stil; QR-deellinks 9 px en CSV/Rapport 22 px op iPad; tweede apparaat zonder
  "Ik heb al een account"; laatste proefdag alleen op het apparaat met de proefcookie; stille 409 op POST /api/kaarten bij laden.
- **MIDDEL (nieuw, Sanne + Karin) — praktijknaam op /k komt van de client;** zie security-backlog (hernoemen A4-kop → kaarten met verschillende namen).
- **MIDDEL (nieuw, Truus, iPhone SE) — "Download mijn gegevens" mist seintjes die via de offline wachtrij zijn verstuurd** (ook na
  "Verstuurd ✓"; pas na herladen klopt het). `verstuurWacht` (kaart.html r. ~2042, `WACHT_VELD`) werkt `mijnSeintjes`, `oefTrouw`,
  `oefZwaar` niet bij. Art. 15 AVG-belofte bij `mgSeintjeErbij`.
- **MIDDEL (Jayden, bevestigd) — seintjes snel na elkaar / offline: "goed" na "vraag" verdwijnt, patiënt ziet groen "going well"** terwijl
  de server pijn + vraag heeft; pijnscore 2→7→3 bewaart alleen 2 (kaart.html r. ~3300/3363).
- **LAAG (nieuw, Jayden) — een tweede telefoon toont geen openstaand seintje** (`mijnSeintjes` komt wel mee in de API).
- **LAAG/MIDDEL (nieuw, Karin, iPad) — tikdoelen tweede stap in Team:** "wissen" 39×15 px (destructief, alleen "zeker wissen?" in dezelfde
  link), "Verplichting opheffen" 136×16, "Nieuwe telefoon? Stel opnieuw in" 211×16 (index.html r. ~3486/3497/3514).
- **LAAG (nieuw, Truus) — video zonder internet zegt "kan niet worden afgespeeld… neem contact op met je praktijk"** in plaats van "heeft
  internet nodig"; melding ligt over de videobediening (kaart.html r. ~2926).
- **LAAG (nieuw, Truus) — "Ik heb een vraag": geen zin "je fysiotherapeut neemt contact op" en geen belknop zonder praktijknummer**
  (vrije tekst is een bewuste productkeuze, staat bij Ahmed).
- **LAAG (nieuw, Sanne):** kaartnaam in "Huidige kaart opslaan als" zonder maxlength (server kapt stil af op 60, `c_naam` op /k 30;
  10.000 tekens in de confirm); `#praktijk` op de A4 zonder maxlength en lange naam in print afgekapt; 13 oefeningen via API stil afgekapt
  op 12 (server.js r. ~5284, niet live bevestigd); 7× 401 in de console vóór het beveiligen.
- **LAAG (Jayden, bekend/iets erger):** /privacy 17 tikdoelen < 44 px ("Naar de site" 69×12); /v2 39 tikdoelen < 44 px; datums in drie
  notaties op een Engelse kaart; bestandsnaam en `title` printknop Nederlands; reeks "3 more times" vs "4 times"; pijnscore 34×44 op Pixel 7.
- **Bevestigd, nog open:** pijnscore 26×44 en cijfers groeien niet mee (min(1rem,5.2vw)); "plaatjes"-alert + dubbele alert bij 13e; teller
  12/12 contrast; sjabloonnaam zonder grens; werknotitie stil afgekapt op 500; welkom focus naar body; CSV-knop 22 px; printcel 12; zachte 404
  op /k; oefenstand liggend (foto 93×140, onderbalk niet gecentreerd); therapeut ziet "+ praktijklogo"; `upsertPraktijk` meldt 403 niet;
  rolwissel zonder bevestiging; eigen login toont "actief" i.p.v. laatst ingelogd.
- Testtip: de 200 %-tip met `document.documentElement.style` in `addInitScript` faalt (documentElement nog null); gebruik de MutationObserver-
  variant uit scripts/test-kaart-onderbalk-groot.mjs.

Volgende run (na 2026-11-12 06u): praktijknaam van de sessie op /k (na security), offline wachtrij werkt "Mijn gegevens" bij, seintjes één
slot per groep, tikdoelen tweede stap op iPad, lijst als één tabstop per rij.

### Sweep 2026-11-12 02u (vijf persona's lokaal; geen 500's of pageerrors; alle beheergrenzen hielden behalve wissen met het gedeelde wachtwoord)
- **OPGELOST 2026-11-12 02u (test:gedeeldwerk) — HOOG (Karin) — gedeeld praktijkwachtwoord wist de hele praktijk incl. eigenaar.** Zie security-backlog.
- **OPGELOST 2026-11-12 02u (test:sjabloondelen) — HOOG (Sanne desktop, Mark bevestigd) — dubbelklik op "Delen met de praktijk" landde op
  "Verwijderen".** De knop kromp door "Bezig…" van 125 naar 44 px; de tweede klik opende "Je eigen kaart verwijderen?" en met OK was de lokale
  kaart weg. Nu houdt de knop zijn breedte en telt Verwijderen 1,5 s na Delen niet.
- **OPGELOST 2026-11-12 02u (test:gedeeldwerk + test:sjabloondelen) — teamsjabloon stil overschreven (ook hoofdletters), en geen bevestiging
  na delen.** Server geeft 409 `bestaat` tenzij `vervang:true`; de app vraagt "Vervangen?" en meldt daarna "Gedeeld"/"vervangen".
- **HOOG (nieuw, Truus, iPhone SE, 200 % en A A) — uitleg in de vergrote foto groeit niet mee:** in "Houdingen" `.demouitleg` 12,5 px,
  `.demobron` 11 px (contrast 3,76:1), `.demotekst`/`#lbnaam` 15 px; pas na "Foto tonen" 34 px (kaart.html r. ~635–672, vaste px → rem).
- **HOOG (nieuw, Sanne, desktop toetsenbord) — 2179 tabstops, Kaarten pas bij 1676; geen skiplink; ★/+ zonder oefennaam in het label**
  (index.html r. ~1562).
- **MIDDEL (nieuw, Jayden, iPhone 14, trage lijn) — seintjes snel na elkaar: alle drie POST'en, alleen de laatste staat aan; therapeut ziet
  "te veel pijn (ook een vraag)"** (kaart.html r. ~3358, bezig-slot per knop i.p.v. per groep). Pijnscore 2→7→3: alleen 2 bewaard, rest stil
  genegeerd (r. ~3300 `schaal.dataset.bezig`; PSK r. ~3374).
- **MIDDEL (nieuw, Sanne) — Kaarten-venster: focus start op "Huidige kaart opslaan als" onderaan** (`#k_srv{order:-1}` v2.css r. ~318).
- **MIDDEL (nieuw, Sanne) — eigen sjabloonnaam zonder lengtegrens** (10.000 tekens lopen over het venster; server kapt bij delen stil af op 60);
  index.html r. ~2960.
- **MIDDEL (nieuw, Sanne) — teller "12 / 12" in `#ffb4a8` op wit (≈1,7:1)** (index.html r. ~2781, `--fout` uit het donkere thema, v2.css r. ~843).
- **MIDDEL (nieuw, Mark, iPad) — tweede apparaat: welkomstvenster zonder "Ik heb al een account"; naam in kleine letters blijft in `SET.praktijk`.**
- **MIDDEL (nieuw, Jayden, afgeleid uit CSS) — oefenstand liggend: `.skop` zonder safe-area-left/right (notch); met A A liggend alleen foto + titel.**
- **MIDDEL (Truus) — pijnscore-knoppen 26×44 px op 320 breed** (kaart.html r. ~390).
- **LAAG (nieuw):** welkom van de proef komt na herladen niet terug (index.html r. ~2845); 13e oefening = `alert` "plaatjes"; werknotitie dubbel POST
  en stil afgekapt op 500; printcel 12 anders omkaderd (Sanne). Taalkeuze "Nederlan…" bij 200 %; "Wis van dit apparaat" wist ook /k/demo uit de
  cache; dubbeltik Download/Wis in Mijn gegevens; "1 dagen"/"1 days" (Truus, Jayden). Uitnodigingslinks van eerdere collega's verdwijnen uit beeld
  (Mark). "Zeker?" past niet in de ×-knop van het team (iPad), iPad-knoppen Team/Uitloggen/Naar dossier/Prullenbak 30–32 px; logo-knop voor
  therapeut; "wissen" in kleine letters telt als WISSEN; e-mail niet ingevuld na uitnodiging (Karin). seintje `soort` als array → 200 (Truus).
- **Bevestigd, nog open:** S/H/W-koppen niet vertaald; NL-oefennamen zonder vertaling met Engelse stem; "Meer pijn" ≠ knoptekst; 0612345678; oefendoel toetsenbord.

### Sweep 2026-11-11 22u (vijf persona's lokaal; geen 500's, pageerrors of stille toegang; alle beheergrenzen hielden)
- **OPGELOST 2026-11-11 22u (test:onderbalkgroot) — HOOG (Truus, iPhone SE, 200 % + "A A") — onderbalk, lang woord, tip en vergrote foto.**
  Gemeten fix uit 18u toegepast (`body{overflow-wrap:break-word}`, `body.krap .srij/.sstatus{min-width:0}`), plus: bij 200 % zonder A A stond
  de pijl "volgende" op een afgevinkte oefening half buiten beeld ("Volgende" breder dan "Gedaan"); de tip "Zet op beginscherm" bedekte
  32–53 % van het scherm, ook "Ik heb een vraag", met × buiten beeld (nu verborgen bij `body.krap`); vergrote foto en uitleg bij A A
  binnen beeld (`vw / 1.16`). Testtip: 200 % moet vóór `zetKrap()` staan (addInitScript op documentElement), anders gaat body.krap niet aan.
- **OPGELOST 2026-11-11 22u (test:opnamegeencamera) — MIDDEL (Mark, iPad zonder camera) — /o liep dood** ("Dat lukte niet", 0 knoppen).
  Nu "Kies een video uit je galerij" (mp4, mov of webm, max. 60 MB, zelfde upload) en "Camera opnieuw proberen"; ook als de browser niet kan opnemen.
- **MIDDEL (nieuw, Jayden, iPhone 14 + Pixel 7, trage lijn) — "Ik heb vandaag geoefend" uitzetten: 4 s geen feedback, en een vinkje dat je
  intussen zet wordt bij het antwoord ook gewist** (kaart.html r. ~3309–3339: geen optimistische stand, wissen op basis van de stand bij het antwoord).
- **MIDDEL (nieuw, Karin, iPad) — therapeut wijzigt de praktijktelefoon op de kaart: server 403, scherm zwijgt, print toont het nieuwe nummer**
  (index.html r. ~2560 `upsertPraktijk` negeert `!d.ok`; open PR #201 raakt index.html, dus volgende run).
- **MIDDEL (nieuw, Jayden) — oefenstand liggend: foto 93×140 px en de info-badge dekt de benen** (kaart.html r. ~204/339 `max-height:34vh`).
- **MIDDEL (Jayden, bekend) — afspraaktijd op de kaart (telefoontijd) ≠ "Download mijn gegevens" (Amsterdam, zonder tijdzone)** (kaart.html r. ~1846 vs ~2161).
- **LAAG (nieuw):** sjabloonnaam van alleen U+200B geaccepteerd (`cleanName` server.js r. ~2204, `\s` vangt geen zero-width); dosering in teamsjabloon
  zonder typecontrole (`w:"[object Ob"`); eigen oefening mag heten als een bibliotheekoefening ("Squat" 2×); oefendoel via API `-1`/`"<script>"` → 0,
  99 → 7 stil; afspraak `herhaal:99` stil eenmalig; schemakop S/H/W en legenda "W = weight" op Engelse kaart; "exercise(s)" en "1 days";
  voorlezen leest NL therapeutentekst met Engelse stem zonder melding; offline-melding /k 13,5 px vast; "+ praktijklogo" 12 px;
  focus op body na "Begrepen" in "Nieuw in Fysiplan" (release-notes.js r. 12); verwijderde collega krijgt alleen "klopt niet" (geen uitleg);
  "Zeker?" blijft staan naast het keuzepaneel; rolwissel zonder bevestiging.
- **Bevestigd, nog open:** teamsjabloon stil overschreven (ook hoofdletters); oefendoel toetsenbord; iPad-tikdoelen 22–32 px; zachte 404 op /k;
  0612345678; dubbele alert bij 13e oefening.

Volgende run (na 2026-11-11 22u): na merge van #201 `upsertPraktijk`-melding en teamsjabloon met vraag (index.html/server.js);
/k "Ik heb vandaag geoefend" optimistisch + vinkjes van na het verzoek bewaren; oefenstand liggend; afspraaktijd in download.

### Sweep 2026-11-11 18u (vijf persona's lokaal; geen 500's, pageerrors of stille toegang; alle beheergrenzen hielden)
- **OPGELOST 2026-11-11 18u (test:v2contrast) — HOOG (Karin + Mark, desktop en iPad) — donker V2-thema (#197) maakte Kaarten-paneel
  en Team-venster bijna onleesbaar:** lichtblauwe naamblokken (`--naamblok` #eaf2fd) met witte tekst (±1,1:1), rolkeuze wit op wit,
  kop/voet van Kaarten wit op wit, ps-acties, tellerchips, Rapport/CSV, uitnodigformulier. Nu donkere vlakken in een eigen blok
  onderaan public/v2.css. Ook /v2/proef: foutveld (wit op #fffafa) en pijnseintje op de verlopen-pagina (rood op petrol, 1,56:1).
- **OPGELOST 2026-11-11 18u (test:kaartweg) — MIDDEL (Sanne, desktop) — na "Definitief verwijderen" maakte één klik op "Test de QR",
  "Print met QR" of een autosave de patiëntkaart stil opnieuw aan met een nieuwe link** (wisverzoek ongedaan). Ook bleef de oude QR in de
  editor staan na "naar de prullenbak". Nu onthoudt de editor dat zijn kaart weg is (`KAART_WEG`, ook na herladen): QR weg met melding,
  geen autosave, opnieuw delen alleen na een vraag of via "Opnieuw delen met een nieuwe QR-code"; herstellen zet de QR terug.
- **OPGELOST 2026-11-11 18u (test:vertaallaat) — MIDDEL (Jayden, Pixel 7, trage lijn) — kaart in een andere taal dan Nederlands tekende
  pas na de vertaling (tot 8 s; 4 s kaart + 4 s vertaling = 8,2 s).** Nu hooguit 1,5 s wachten (`VERTAAL_WACHT`), daarna vaste teksten in
  de eigen taal en de namen zodra de vertaling er is; een late vertaling tekent niet opnieuw terwijl een video, voorlezen, de vergroting
  of een invoerveld bezig is. Ook schermlezerlabels `#vraagveld`, `#lightbox`, `#lbsluit`, `#ab_weg` in 9 talen (waren NL).
- **OPGELOST 2026-11-11 22u (test:onderbalkgroot) — HOOG (Truus, iPhone SE, 200 % + "A A") — onderbalk oefenstand: pijl "volgende" buiten beeld, en bij een lang woord ("tegenovergestelde"
  in Dead bug) wordt de pagina 367 px breed en staat "Gedaan" onder het scherm.** Oorzaak 1: kaart.html r. ~343/352 `body.krap .srij`
  (en `.sstatus`) zijn flex-items met `min-width:auto`; oorzaak 2: geen `overflow-wrap` op /k. Gemeten fix (beide nodig):
  `body{overflow-wrap:break-word}`, `body.krap .srij,body.krap .sstatus{min-width:0}`, `body.krap .sstatus{flex-wrap:wrap}`,
  `body.krap .srij .kn1{font-size:min(1.0625rem,6vw);padding-inline:8px}`. Eerste kandidaat volgende run.
- **MIDDEL (Karin, iPad) — collega-apparaat volgt een nieuwe praktijknaam/telefoon/logo van de beheerder niet:** `vulUitProfiel()`
  (index.html r. ~2516) zoekt op naam en vult alleen lege velden; na een nieuw logo wijst SET.logo op de collega naar een gewist bestand (404).
- **MIDDEL (Karin) — "Zet het praktijkwachtwoord uit" zonder bevestiging en zonder overzicht wie nog geen eigen login heeft**
  (index.html r. ~3389). Hoort bij de keuze in mensenwerk (één beheerder).
- **MIDDEL (Sanne) — oefendoel in het deelpaneel: elke keuze (ook één pijltje) bewaart, hertekent de lijst, klapt het paneel dicht en
  zet de focus op body;** met het toetsenbord dus maar één stap per keer (index.html r. ~4838 `toonSrvKaarten()`).
- **MIDDEL (Mark, iPad) — deellinks onder de QR op de A4 zijn 7–9 px hoog (×: 11–13 px)** (`toonQr`, font-size 10.5px in geschaalde #a4).
- **OPGELOST 2026-11-11 22u (test:onderbalkgroot) — MIDDEL (Truus/LAAG) — lightbox bij A A steekt rechts buiten beeld** (`.demobeeld` met 100vw onder `zoom:1.16`, r. ~640); lightboxtekst in px.
- **LAAG (Karin):** teamfouten flitsen weg (`msg()` direct gevolgd door `laadTeam()`, r. ~3357/3383); "Zeker?" afgekapt in 32 px-knop;
  gedeeld-wachtwoordsessie kan in de overstap alle eigen-login-beheerders degraderen (zonder logregel met naam); beheerder kan profiel
  hernoemen naar de naam van praktijk Y (geen lek); /v2/uitnodiging vinkje 18 px; teamsjabloon met dezelfde naam stil overschreven ook door beheerder.
- **LAAG (Sanne, hertest):** na Annuleren bij "Test de QR" of "In de praktijk" op een verwijderde kaart volgt nog een overbodige alert "Niet gedeeld".
- **LAAG (Sanne):** focus op body na Herstellen/Definitief in de prullenbak; hernoemen naar een naam in de prullenbak zegt "bestaat al";
  Deel-knop zonder aria-expanded; herstelcode + knoppen als één tekstblok; oefendoel-select 11,5 px; prullenbakknop 32 px.
- **LAAG (Mark):** sjablonenvenster iPad liggend: "Delen"/"Verwijderen" 15 px onder de vouw; na geweigerde afspraak (verlopen proef) blijft
  de nieuwe datum in het veld; nieuw apparaat na verloop krijgt nog het welkom; welkom komt maar één keer.
- **Bevestigd, nog open:** teamsjabloon stil overschreven (server.js r. ~3576 `lijst[idx]=sjabloon`, index.html r. ~2986); /o zonder camera
  loopt dood; collega ziet laatste proefdag niet; herstelknoppen en .ics zonder feedback op trage lijn (.ics 2 verzoeken); afspraaktijd in
  andere tijdzone; praktijknaam uit welkom niet in aanmelding; focus na QR-venster/Beveiligen op body; Enter in welkom; aria-invalid
  proefformulier; 0612345678-melding; 13e oefening via alert; CSV-knop 22 px; stille 409 "Voorbeeldpatiënt" (Karin kon hem niet meer
  reproduceren in de app; Sanne zag hem wel bij laden); therapeut ziet "+ praktijklogo" en Activiteit; lege prullenbak zonder tekst.

Volgende run (na 2026-11-11 18u): Truus 200 % + A A onderbalk (fix hierboven), profiel op collega-apparaat na naamwijziging,
teamsjabloon overschrijven met vraag (server `bestond`), oefendoel-select zonder hertekenen, QR-deellinks op iPad, /o zonder camera.

### Sweep 2026-11-11 14u (vijf persona's lokaal, nu met Karin als beheerder; geen 500's, pageerrors of stille toegang)
- **OPGELOST 2026-11-11 14u (test:profielcollega) — MIDDEL (Karin, desktop) — collega kreeg het praktijkprofiel nooit op zijn eigen
  apparaat.** `loadPraktijken()` vroeg `/api/praktijken` zonder praktijksessie op; de server geeft v2 alleen met sessie het eigen profiel.
  Gevolg: geen adres, telefoon of logo op de papieren kaart van collega's. Nu met `PGET()`, opnieuw na inloggen, en lege velden worden
  aangevuld uit het profiel (wat al op het apparaat staat blijft staan).
- **OPGELOST 2026-11-11 14u (test:gedeeldwerk) — MIDDEL (Mark/Karin, iPad) — "×" bij de eigen oefening van een collega.** GET/POST/verwijder
  van `/api/praktijk/oefeningen` geven nu `magWeg`; de app toont het kruisje alleen dan (44 px, met naam in aria-label) en legt uit wie het
  wel mag. Door Mark op iPad nagelopen op de nieuwe code.
- **OPGELOST 2026-11-11 14u (test:daguitvraag) — MIDDEL (Truus, iPhone SE) — "Ik heb vandaag geoefend" uitzetten wiste zonder vraag alle
  vinkjes van vandaag.** Nu eerst een vraag in de taal van de kaart (9 talen) als er vinkjes staan; Annuleren laat alles staan.
- **OPGELOST 2026-11-11 14u (test:weekverder) — MIDDEL (Mark, desktop) — "+1 week" en `volgendeAfspraak` gebruikten 7×24 uur** (24-03-2027
  14:00 → 31-03 15:00). Nu `weekVerder()` op dezelfde kloktijd. Door Mark nagelopen.
- **MIDDEL (nieuw, Jayden, Pixel 7, trage lijn) — niet-Nederlandse kaart laadt twee keer zo lang:** `/api/kaart/vertaal` start pas na
  `/api/kaart` en de pagina tekent pas als de vertaling er is (of na 8 s). Met 4 s vertraging: kaart pas na 8,1 s. Eerst tekenen, daarna
  vertalen (kaart.html r. ~2254–2260 `setTimeout(af,8000)`, r. ~2534).
- **MIDDEL (Truus, 200 % + "A A") — pijl "volgende" helemaal buiten beeld** (x 329–392 bij 320 breed), "Toch niet gedaan" afgekapt
  (kaart.html r. ~350 `body.krap .srij` + `html.groot body{zoom:1.16}`). Erger dan in 06u gemeld.
- **MIDDEL (nieuw, Mark, iPad liggend) — na "Delen met de praktijk" geen bevestiging, en nog eens delen overschrijft het teamsjabloon met
  dezelfde naam stil** (3 oefeningen → 1). index.html r. ~2972 (`wat==='deel'`).
- **OPGELOST 2026-11-12 (test:wachtwoordvergeten) — MIDDEL (Karin, productvraag → mensenwerk) — praktijk met één beheerder zit vast als die het wachtwoord kwijt is** (na "wachtwoord uit"
  werkt de herstelcode niet meer; geen herstelpad voor een lid). De app waarschuwt niet voor "minstens twee beheerders".
  Nu: elke eigen login vraagt onder Kaarten met "Wachtwoord vergeten?" een link aan op het eigen adres. De waarschuwing is niet gebouwd.
- **LAAG/MIDDEL (Jayden) — herstelknoppen reageren op een trage lijn pas na het antwoord van de server** (4 s, oude keuze blijft groen).
- **LAAG (nieuw, Karin) — stille 409 op POST /api/kaarten voor "Voorbeeldpatiënt" bij elk laden na de overstap naar eigen login** (console).
- **LAAG (Karin) — therapeut ziet telefoonveld en "+ praktijklogo"**; eigen telefoon blijft lokaal en komt op de print; logo-knop zegt
  "Vul eerst praktijknaam en adres in" i.p.v. "alleen een beheerder".
- **LAAG (nieuw, Karin) — kleine teksten:** bevestiging bij verwijderen van andermans eigen oefening noemt maker en "hele praktijk" niet;
  lege prullenbak na "Definitief verwijderen" zonder lege-staattekst; /v2/gegevens leegt het e-mailveld na fout bevestigingswoord;
  eigen login via eigen-login toont "actief" i.p.v. "laatst ingelogd"; therapeut ziet het hele Activiteit-logboek (productvraag).
- **LAAG (nieuw, Mark) — afspraak op 28-03-2027 02:30 (bestaat niet) wordt stil 03:30**, veld blijft 02:30 tonen.
- **LAAG (nieuw, Sanne) — oefendoel `doel:"<script>"` of `-1` geeft 200 en wist het doel; `99` wordt stil 7** (server.js r. ~5299). Ook:
  Kaarten-paneel zegt na Beveiligen 3 s "Nog geen gedeelde kaarten" terwijl de kaart al gedeeld is; welkomvenster: Enter doet niets.
- **LAAG (nieuw, Jayden) — "Nieuw in Fysiplan" opent direct na het welkom bij een nieuwe proefgebruiker.**
- **LAAG (Truus) — download zegt "Meer pijn" waar de knop "Het doet te veel pijn" zegt.**
- **Bevestigd, nog open:** praktijknaam uit welkom niet in proefaanmelding (index.html r. ~2813); focus na QR-venster en na
  "Oefendoel per week" op body (Beveiligen nu op de modal, "Kopieer" pas na 10× Tab); oefendoel met pijltjes bewaart elke stap;
  collega ziet laatste proefdag niet (en `dagenOver` rondt af met ceil i.p.v. per kalenderdag); twee collega's tegelijk op één kaart;
  /o zonder camera loopt dood (iPad staand + liggend); lightboxtekst 200 %; "Het gaat goed" niet in inbox bij open vraag; 3× seintje
  tegelijk = 3 regels; zachte 404 op /k; afspraak 30 min voorbij blijft "next"; download "Next appointment" voorbij + "1 days";
  NL aria-labels op Engelse kaart (`#vraagveld`, `#lightbox`, `#ab_weg`); onderbalk liggend; anonieme notitie-melding; 0612345678-melding;
  13e oefening via `alert()`; CSV-knop 22 px; aria-invalid proefformulier.
- Bevestigd ok: zie de tabel; alle beheergrenzen van Karin hielden (geen stille toegang, X ↔ Y gescheiden, WISSEN volledig).

Volgende run (na 2026-11-11 14u): /k eerst tekenen en daarna vertalen (trage lijn), pijl volgende bij 200 % + A A, bevestiging na
"Delen met de praktijk" + 409 bij dezelfde naam, oefendoel-select in deelpaneel, praktijknaam welkom → proefaanmelding, /o zonder camera.
Testtip: herstart de lokale server na een wijziging in server.js (index.html en kaart.html komen vers van schijf, server.js niet).

### Sweep 2026-11-11 10u (vier persona's lokaal; geen 500's, pageerrors of stille toegang)
- **OPGELOST 2026-11-11 10u (test:printcompact) — HOOG (Sanne, desktop) — "Compacte kaart" gaf geen extra schemaruimte.** Nu krimpt
  het plaatjesvak (18 mm hoog) en komt er per blok een datumrij bij (`tr.xr`, alleen zichtbaar bij het printen van de compacte kaart):
  14 datumrijen tegen 12, alles op één A4 met legenda en veiligheidsregel. Meer rijen paste niet (gemeten).
- **OPGELOST 2026-11-11 10u (test:storingtaal) — MIDDEL (Truus, iPhone SE, de) — storingsmelding /k alleen NL/EN en altijd "geen
  verbinding".** Nu in alle 9 kaarttalen, met `lang` erbij, en bij 429/5xx een eigen tekst ("ligt niet aan je internet").
- **OPGELOST 2026-11-11 10u (test:gedeeldwerk) — MIDDEL (Mark, iPad staand) — therapeut zag "Verwijderen voor de praktijk" bij
  andermans teamsjabloon** (403 na bevestigen). Server geeft nu `magWeg` per sjabloon; de app toont de knop alleen dan.
- **LAAG/MIDDEL (Mark, iPad, nog open) — "×" bij de eigen oefening van een collega** (index.html `toonEigenLijst`, zelfde patroon als
  sjablonen: geef `magWeg` mee in GET /api/praktijk/oefeningen).
- **LAAG (nieuw, Truus) — dubbele meldingen via de API:** 3× tegelijk `POST /api/kaart/seintje {soort:"pijn"}` geeft 3 regels in het
  contactlog binnen 1 ms; de 30-secondenrem zit alleen in de pagina (server.js `logContact`). Wachtrij of 2 tabbladen → dubbele regels.
- **LAAG (nieuw, Jayden) — afspraak die 30 min voorbij is blijft "Your next appointment / Today 09:44"** (venster van 2 uur in
  `tekenAfspraak`, geen "begonnen"); download telt een voorbije reeks anders ("3 times") dan de kaart ("2 more times").
- **LAAG (nieuw, Sanne) — foutmeldingen API:** kapotte JSON op POST /api/kaarten zegt "Geef de praktijknaam en een kaartnaam op";
  anonieme POST /api/kaart/notitie zegt "Zet eerst een wachtwoord op je praktijk".
- **LAAG (nieuw, Mark, iPad) — na "Delen met de praktijk" geen bevestiging;** kaart blijft "alleen op dit apparaat" heten, tweede tik deelt
  stil opnieuw. Inloggen op 2e apparaat vraagt eerst de exacte praktijknaam.
- **Bevestigd, nog open:** praktijknaam uit welkom niet in proefaanmelding (index.html r. ~2801, server.js r. ~5783); proefformulier zonder
  aria-invalid; focus op body na Beveiligen en na QR-venster (`#pb_qr` wordt uitgeschakeld vóór `geopend()`, index.html r. ~2812/5413);
  "+1 week" zomertijd (index.html `basisW+7*864e5`); twee collega's tegelijk op één kaart (geen 409); collega ziet laatste proefdag niet;
  afspraak weghalen na verloop 403; /o zonder camera loopt dood; lightboxtekst 200 %; afspraaktijd in andere tijdzone zonder zone;
  "Ik heb vandaag geoefend" opnieuw tikken wist alle vinkjes zonder vraag; zachte 404 op /k; iPad-tikdoelen < 44 px.

Volgende run (na 2026-11-11 10u): praktijknaam welkom → proefaanmelding (server.js + index.html), × eigen oefening collega (magWeg),
focus na Beveiligen/QR, lightbox 200 %, "+1 week" zomertijd, seintje-dubbel op de server.

### Sweep 2026-11-11 06u (vier persona's lokaal; geen 500's, pageerrors of serverfouten)
- **OPGELOST 2026-11-11 06u (test:reekstitel) — HOOG (Mark, Pixel 7) — afspraakreeks toonde na de zomertijdwissel het verkeerde uur**
  (reeks ma 22-03-2027 14:00, telefoon op 23-03: /k zei 29 maart 15:00; de .ics wel 14:00). Doorrollen met 7×24 uur; nu `weekLater()`
  op dezelfde klokketijd in Europe/Amsterdam (kaart.html `tekenAfspraak`).
- **OPGELOST 2026-11-11 06u (test:reekstitel) — MIDDEL (Mark, Sanne, Jayden) — "wekelijks, nog 4 keer" bij een reeks van 4** (las als vijf); nu
  het aantal ná de getoonde afspraak, met enkelvoud ("1 more time").
- **OPGELOST 2026-11-11 06u (test:reekstitel) — MIDDEL (Jayden, iPhone 14) — na "Wis deze kaart van mijn telefoon" bleef de praktijknaam in de
  tabtitel**, en na herladen werd de gewist-pagina Nederlands (`?taal=` viel weg). Ook: tabtitel en `lang` tijdens laden en in
  foutstaten nu in de taal van de patiënt, zonder praktijknaam.
- **MIDDEL (Mark, desktop) — "+1 week" in de therapeut-app verschuift over de zomertijd het uur** (24-03-2027 14:00 → 31-03 15:00;
  index.html r. ~4819 `basisW+7*864e5`; ook `volgendeAfspraak` r. ~3867, toont alleen de datum). Wacht op #167.
- **MIDDEL (Mark) — na de eerste afspraak van een reeks kan de therapeut de reeks niet meer bewerken** (veld toont de voorbije start,
  Bewaar en "+1 week" geven 400 "komende twaalf maanden"; index.html r. ~3857, server.js r. ~4943). Uit de code; wacht op #167.
- **MIDDEL (Mark) — "Download mijn gegevens" noemt een voorbije datum "Volgende afspraak"** (geen doorrollen; kaart.html r. ~2079 `mgTekst`,
  kan nu `weekLater` gebruiken). Download blijft Amsterdam-tijd zonder zone, /k toont lokale tijd (bekend).
- **MIDDEL (Sanne, desktop) — "Oefendoel per week" in het deelpaneel sluit het paneel en focus op body; met pijltjes bewaart elke stap**
  (index.html r. ~4716 change → `toonSrvKaarten()`). Wacht op #167.
- **OPGELOST 2026-11-11 10u (test:storingtaal) — MIDDEL (Truus, de/fr/…) — storingsmelding /k alleen NL/EN** en zegt "geen verbinding" ook bij 500/503/429 (kaart.html `toonStoring`).
- **MIDDEL (Truus, 200 %) — lightboxtekst groeit niet mee** (`.lbknop`, `.demotekst`, `.demouitleg`, `.demobron` in px; "Foto tonen" 114×40). kaart.html r. ~633–657.
- **MIDDEL/LAAG (Mark, iPad) — /o zonder camera- of microfoontoegang loopt dood**: geen "Opnieuw", geen keuze uit de galerij; `audio:true` blokkeert ook beeld (opname.html r. ~123).
- LAAG/MIDDEL (Truus, iPhone SE 200 %): pijl "volgende" ±18 px buiten beeld (`body.krap .srij{flex:1 1 18em}` + `.spijl` 54 px).
- LAAG/MIDDEL (Jayden, Pixel 7/iPhone 14 liggend): onderbalk oefenstand niet gecentreerd én verspringt ±360 px tussen gedane/niet gedane oefening (kaart.html r. ~341–352).
- LAAG (Truus): offline verstuurd seintje ontbreekt in de download tot herladen (`mgSeintjeErbij` niet bij het legen van de wachtrij).
- LAAG (Jayden): download "1 days"/"1 dagen" (kaart.html r. ~2071); aria-labels NL op Engelse kaart ("Vraag over je oefeningen (AI)", "vergrote oefenfoto", "Sluiten").
- LAAG (Sanne): latere schemarij met nieuwe dosering komt nooit op /k (bewust "eerste ingevulde rij"; productvraag); zolang focus in Roepnaam
  blijft, gaat niets naar de server (`doeAutoDeel`); zoeken "bruggen" 5 vs "brug" 17, "sqaut" 0 zonder lege staat.
- LAAG (Mark): afspraak alleen achter "Deel", knoppen 32 px op iPad; API `herhaal` 13/4.5/"<script>" stil eenmalig i.p.v. 400.
- LAAG (Truus, 200 %): taalkeuze afgekapt "Nederlan"; `#privmeer` 49×17, label "Tijdstip".
- Nog open en bevestigd: /k/<onbekend> HTTP 200; proef bijna voorbij onzichtbaar voor collega; focus op body na Beveiligen/QR;
  "Het gaat goed" niet in inbox bij open vraag; lang Doel afgekapt op print; 13e oefening via `alert()`; Rapport/CSV-knoppen 22 px.
- Bevestigd ok: rechten therapeut (403/409 netjes), uitnodigen + tweede apparaat, seintjes één keer in inbox, alle schrijfroutes 403 na
  verlopen proef, opnametoken eenmalig, 5 printvarianten 1 A4, CSV-formules, alles wat Truus doorgaf klopt bij de therapeut (pijn, herstel,
  vinkjes, offline `wanneer`), offline wachtrij, Wis van dit apparaat leeg, Engelse foutstaten, taalwissel in oefenstand, terugknop.

### Sweep 2026-11-11 02u (vier persona's lokaal; geen 500's of pageerrors)
- **OPGELOST 2026-11-11 02u (test:dagwisseltaal) — HOOG (Sanne → /k) — vinkjes van vandaag schoven naar een andere oefening**
  als de praktijk na het delen een oefening weghaalde of de volgorde wijzigde (telefoon bewaarde posities; Brug + Plank
  afgevinkt i.p.v. alleen Brug, "Alle oefeningen gedaan"). Nu met de oefeningnaam erbij (`naarHuidig`), ook voor "Te zwaar?".
- **OPGELOST 2026-11-11 02u (test:dagwisseltaal) — MIDDEL (Jayden, Pixel 7/iPhone 14) — kaart die over middernacht open bleef,
  tekende niet opnieuw**: "Ik heb vandaag geoefend" bleef aan van gisteren en de eerste tik stuurde `aan:false`, de oefendag
  ging verloren. Nu `dagWissel()` bij focus/zichtbaar/pageshow, elke minuut en vóór de tik.
- **OPGELOST 2026-11-11 02u (test:dagwisseltaal) — MIDDEL (Jayden) — taalkeuze van de patiënt bleef niet** bij dezelfde link
  (`fp_taalkeus_<id>`); een link met een andere taal wint nog steeds.
- **OPGELOST 2026-11-11 02u (test:dagwisseltaal) — MIDDEL (Truus, iPhone SE 200 %) — oefenstand toonde alleen het beeld**:
  `@media (max-height:26em)` springt niet aan bij grote letters; nu `body.krap` via `zetKrap()` en een naam die niet breder groeit dan het scherm.
- **OPGELOST 2026-11-11 02u — LAAG (Truus) — herstelknoppen zonder `aria-pressed`.**
- **MIDDEL → security-backlog (Mark)** — collega met rol therapeut wijzigt het praktijkprofiel (tel, website) dat op elke /k staat.
  OPGELOST serverkant 2026-11-11 (security, test:profielbeheer): therapeut krijgt nu 403. Open voor de sweep (LAAG, UI): de
  praktijkvelden en de logoknop staan voor een therapeut nog open; een wijziging blijft stil alleen lokaal. Alleen-lezen maken met uitleg.
- **MIDDEL (Mark, desktop/iPad) — twee collega's tegelijk op één kaart: notitie, afspraak, behandelaar en bericht overschrijven
  elkaar stil** (beide 200 "Bewaard ✓"; `/api/kaarten` heeft wel 409). server.js r. ~4806/4834/4913, index.html r. ~4882. Wacht op #167.
- **MIDDEL (Sanne, desktop toetsenbord) — focus valt op `body`** na Beveiligen (herstelcode één keer getoond: "Kopieer" niet
  bereikbaar zonder van boven te tabben) en na Escape in het QR-venster. `ps_do`/`pb_qr` disabled vóór de fetch → `terug=null`
  (index.html r. ~5404, ~3505, ~2808). Wacht op #167.
- **LAAG/MIDDEL (Sanne) — welkomstvenster proef komt maar één keer** (`fysiplan_proef_start` bij tonen gezet); Enter in
  praktijknaam doet niets (index.html r. ~529, ~2793).
- **LAAG/MIDDEL (Mark, iPad) — therapeut ziet "×" bij eigen oefeningen van een collega** (403 na bevestiging; aria-label zonder naam). index.html r. ~5226.
- **LAAG (Truus) — seintje "Het gaat goed" komt niet in inbox/chip als er al een vraag/pijn openstaat** (server.js `zetSeintje` r. ~1156); patiënt ziet wel "je fysiotherapeut ziet je seintje".
- **LAAG (Truus) — "Begin met oefenen" op iPhone SE op y 846 (100 %) / 1316 (200 %)** met bericht van de praktijk (open punt privacyblok).
- **LAAG (Sanne) — bibliotheek zoeken: geen lege staat bij 0 treffers; alleen leestekens/emoji geeft stil alle 817; "squats" vindt "Squat" niet** (index.html `renderList`/`searchScore` r. ~1481).
- LAAG: tabtitel /k "Trainingskaart — Fysiplan" Nederlands tijdens laden en in foutstaten; /k/<onbekend> geeft HTTP 200 (zachte 404);
  download herstelwoorden ("+1 (better)") wijken af van de knoppen; agenda zonder dag gebruikt `alert()` (kaart.html r. ~3313);
  Pixel 7 liggend: onderbalk oefenstand niet gecentreerd (`.sbalk .srij`); notitie afgekapt op 500 laat half emoji (server.js
  r. ~4818 `.slice`); /privacy inhoud "partij-/en" afgebroken (`hyphens:auto`, juridisch.html r. 30/92); `/api/kaart/gedaan` met `aan:"ja"` valt terug op aan/uit-tik.
- Nog open en bevestigd: afspraaktijd kaart vs download in andere tijdzone; "nog N keer" één te veel; inbox-tijd van samengevoegd seintje.
- Bevestigd ok: /o iPad staand+liggend (één upload bij dubbeltik, token eenmalig); rollen 403 voor therapeut; kaart 409 bij
  gelijktijdig opslaan; offline wachtrij; tweede telefoon ziet vinkjes; "Wis deze kaart" leeg; CSV-formules; alle printvarianten
  1 A4; Annuleren in hernoemvraag; stemkiezer en laadtekst Engels; XSS nergens; gegokte id's 404 zonder orakel.

### Sweep 2026-11-10 22u (vier persona's lokaal; geen 500's of serverfouten)
- **OPGELOST 2026-11-10 22u (test:annulerenhernoem) — HOOG (Mark, desktop/iPad) — "Annuleren" of Esc in de vraag "andere
  patiënt?" hernoemde de kaart van de vorige patiënt stil** (Els B. → "Piet Z.", haar geprinte QR opende die kaart). Nu twee
  vragen; alleen OK doet iets, Annuleren/Esc slaat niets op (index.html `saveServerCard`).
- **OPGELOST 2026-11-10 22u (test:zwaaroffline) — MIDDEL (Truus, iPhone SE; Jayden, Pixel 7) — "Te zwaar?" zonder internet
  zei "Doorgegeven ✓"** terwijl de melding alleen in de wachtrij stond. Nu "Opgeslagen op je telefoon…" (ook na herladen) en
  pas "Doorgegeven ✓" als de wachtrij verstuurd is.
- **OPGELOST 2026-11-10 22u (test:zwaaroffline) — MIDDEL (Truus) — na "Wis van dit apparaat" kwam `fp_beelden_<id>` terug**
  (pagehide). Zie legal-backlog (f).
- **OPGELOST 2026-11-10 22u (test:zwaaroffline) — MIDDEL (Jayden) — stemkiezer Nederlands op een Engelse kaart** ("Stem",
  "Automatisch", aria "Voorleesstem"); nu in alle 9 kaarttalen.
- **OPGELOST 2026-11-10 22u — MIDDEL (Sanne) — "Nieuw in Fysiplan" met Escape gesloten kwam bij elke keer laden terug**
  (release-notes.js: sluiten telt nu als gezien).
- **HOOG → security-backlog (Mark)** — elke therapeut kan elke kaart verwijderen, zonder logboekregel.
- **MIDDEL (Mark, iPad liggend) — dubbeltik op "Delen met de praktijk" (sjablonen) belandt op "Verwijderen"**: "Bezig…" is
  smaller, "Verwijderen" schuift onder de vinger; beide links 15 px hoog. index.html r. ~2960. Wacht op #167.
- **MIDDEL (Mark) — collega's zien niet dat de proef bijna voorbij is** (`/api/praktijk/status` geeft alleen `proefVerlopen`;
  `FYSIPLAN_PROEF` alleen uit de cookie). Na verloop krijgt de eigenaar alleen de verlopen-pagina, een collega de hele app
  (server.js r. ~2759, ~6147, ~6157). Wacht op #167.
- **MIDDEL (Mark) — na verlopen proef geeft afspraak weghalen (`t:0`) 403**; de vervallen afspraak blijft op /k met agendaknop
  (server.js r. ~594 `PROEF_SCHRIJFROUTES`). Wacht op #167.
- **MIDDEL (Jayden) — taalkeuze van de patiënt blijft niet**: `?taal=` in de link/QR wint altijd van `fp_taal`, de URL wordt bij
  wisselen niet bijgewerkt (kaart.html r. ~929–933, ~2173). De afspraak-.ics linkt zonder `?taal=` (server.js r. ~4954).
- **MIDDEL (Jayden, telefoon in Europe/London) — afspraaktijd op de kaart (22:18, eigen tijd) en in "Download mijn gegevens"
  (23:18, Amsterdam, zonder tijdzone) verschillen** (kaart.html r. ~1751 tegen ~2061).
- **MIDDEL (Sanne, desktop) — Kaarten-venster opent onderaan**: focus op `#k_naam` (CSS `order:-1` op #k_srv), Tab springt
  daarna terug naar boven (index.html r. ~5397, ~760; v2.css r. ~316). Ook bij inloggen op iPad (Mark): toetsenbord bij het
  verkeerde veld. Wacht op #167.
- **MIDDEL (Sanne) — lange tekst in Doel wordt op de print stil afgekapt** (#c_doel zonder maxlength/print-limited; Opm. knipt
  midden in een woord). index.html r. ~378.
- **MIDDEL (Sanne) — focus onzichtbaar op keuzerondjes en vinkjes in vensters** (`.modal input:focus{outline:none;box-shadow}`,
  index.html r. ~213; ook #ps_vwo). En geen skip-link: 1676× Tab tot "Kaarten".
- **MIDDEL/LAAG (Mark) — /k "wekelijks, nog 4 keer" bij COUNT=4** leest als vijf afspraken (`rest` telt de getoonde mee;
  kaart.html r. ~1751/1765).
- LAAG: "Te zwaar?" zonder ongedaan maken (Truus); download zet "herhalingen" achter "30 sec" (kaart.html r. ~2005); bij 200 %
  daglabels oefenweek "WoDo"; `#privmeer` 17 px, voetlinks 20 px, pijncijfers 34×44 zonder gat, lightbox-knoppen 40 px; Engelse
  kaart: lightbox aria-label, printBtn-title, tabtitel niet-gevonden, `fysiplan-mijn-gegevens.txt` Nederlands; datums gemengd
  en/en-GB (`datumLang`, `adatum`); zoomknop over de eindhouding liggend; landing: `--zacht #a39c8a` 2,45:1 ook in hero-noot,
  prijzen, figcaptions; geen Engelse landing; welkomstvenster proef sluit niet met Escape; QR-× op de A4 niet met toetsenbord;
  API accepteert `naam:{}`/`chosen:"x"` (server.js r. ~4211); 0612345678 krijgt "gebruik 10 cijfers" (lib/proef.js r. ~96);
  roepnaam stil afgekapt op 40; teamsjabloon met `n:{}` → "[object Object]"; praktijkwachtwoord uit en rolwijziging zonder
  bevestiging; inbox-noot 2,41:1 (v2.css r. ~376); iPad: `[data-evid]` 24 px, `#ib_mijn` 16×13, topbalkknoppen 28–30 px,
  teamrol 32 px; iPad liggend: afgekapte placeholders en geen praktijklabel in de topbalk.
- Bevestigd ok: alle printvarianten op 1 A4; CSV 7 rijen met formulebescherming; dubbelklik Beveiligen/herstel/eigen oefening
  één verzoek; 5 gelijktijdige eigen oefeningen 1×200 4×409; /o nep-camera iPad, token één keer, 61 MB/nep-mp4 geweigerd;
  seintjes in inbox bij Mark en Sanne; verlopen proef weigert schrijfroutes; offline wachtrij komt aan; gegokte id's 404/429;
  XSS nergens; rechten therapeut 403 bij team- en praktijkacties.

### Sweep 2026-11-10 18u (vier persona's lokaal; geen 500's, pageerrors of serverfouten)
- **OPGELOST 2026-11-10 18u (test:grotelettersk) — MIDDEL /k: bij 200 % liepen de herstelknoppen buiten hun vak** ("Hetzelfc",
  "slechter" afgekapt; Truus, iPhone SE). `#hsknoppen` valt nu terug op één knop per rij als de woorden niet passen.
- **OPGELOST 2026-11-10 18u (test:agendadubbel) — LAAG /k: hetzelfde seintje twee keer tikken gaf twee regels** in contactlog en
  dossier (Truus). Een tweede tik op dezelfde soort binnen 30 s stuurt niets en toont de bevestiging opnieuw.
- **OPGELOST 2026-11-10 18u (test:kaartladen) — MIDDEL /k: bij een trage lijn eerst Nederlandse laadtekst op een Engelse kaart**
  (Jayden, Pixel 7; stond sinds 9-11 open). Een klein script direct na het laadscherm zet de tekst in de taal van de patiënt.
- **MIDDEL (Sanne, desktop) — praktijknaam uit welkom/kaart komt nooit in de proefaanmelding** als het proefformulier hem leeg liet
  ("mag ook later"). /aanmeldingen toont "—", mails "Praktijk: (nog niet ingevuld)", Mollie `name: p.praktijk || p.naam`.
  server.js r. ~5628 zet hem alleen bij aanmelden; bij `proef.kaarten++` (r. ~4340) meenemen. Wacht op #167 (server.js).
- **MIDDEL (Sanne) — proefformulier: fouten niet aan velden gekoppeld** (geen `aria-invalid`/`aria-describedby`, 6× `role="alert"`
  tegelijk). server.js r. ~864 `fout()`, public/proef.html r. 110–134. Wacht op #167.
- **OPGELOST 2026-11-11 10u (test:gedeeldwerk) — MIDDEL (Mark, iPad staand) — collega met rol therapeut ziet "Verwijderen voor de praktijk" bij andermans teamsjabloon**
  (server weigert terecht 403; knop 15 px hoog). index.html r. ~2676: tonen alleen als `door` = ik of `beheer`. Wacht op #167.
- **MIDDEL (Mark, iPad) — vensters eigen video/opname: knoppen 36 px** ("Neem op met je telefoon", "Koppel", "Sluiten",
  "Annuleren"). Hoort bij het open punt tikdoelen tablet (`pointer:coarse` voor `.modal .btn`).
- **MIDDEL (Truus, iPhone SE 200 %) — oefenstand toont alleen het beeld:** kop 107 px + vaste balk 206 px van 568. De compacte stand
  `@media (max-height:26em)` springt niet aan (media-em = 16 px). Ook "Bekijk instructievideo" half onder de balk.
- **MIDDEL (Truus) — privacyblok (open punt):** met een bericht van de therapeut erbij staat "Begin met oefenen" op y = 871 (100 %).
- LAAG: inbox geeft een eerder seintje de tijd van het latere (`zetSeintje` voegt samen in `ook`, server.js); "fysiotherapeu/t"
  breekt zonder streepje bij 200 % (`#seinkop`); pijncijfers groeien bij 200 % niet mee (16 px); aria-label "sluiten" van de
  beginschermbalk en `#vraagveld` Nederlands op Engelse kaart; "oefenmomenten.ics" ook Nederlandse bestandsnaam (server.js r. ~5179);
  tik op "I did my exercises today" als die aan staat wist zonder vraag alle vinkjes van vandaag; trage lijn: tweede pijncijfer
  tijdens opslaan gaat stil verloren; plakken van 10.000 tekens in "Opm." kapt stil af tot 112 (melding alleen sr-only); 480
  schemavakken zonder label; `POST /api/kaarten` met 0 oefeningen geeft een lege kaart; landing iPad: kopknoppen 34 px,
  "Bekijk de kaart vergroot" 15 px staand; /k iPad liggend: uitleg loopt onder de Gedaan-balk; oefeningnamen blijven Nederlands
  op een Engelse kaart zonder melding (lokaal zonder vertaalsleutel; in productie controleren).
- Bevestigd open: compacte print (HOOG), proefbalk "t/m", focus na vinkfout, tabvolgorde Beveiligen, "Nieuw in Fysiplan" na
  Escape, 13e oefening `alert`, lange roepnaam, geen knop voor een tweede ronde na alles gedaan.
- Bevestigd ok: verlopen proef weigert alle schrijfroutes (ook 2e iPad zonder cookie); /o met nep-camera op iPad en telefoon,
  token één keer bruikbaar, .exe/61 MB geweigerd; XSS nergens; CSV-formules onschadelijk; gegokte id's nette 404 in de taal;
  offline wachtrij komt binnen ±4 s aan; draaien en terugknop in de oefenstand ok.

### Sweep 2026-11-10 14u (vier persona's lokaal; geen 500's of pageerrors)
- **OPGELOST 2026-11-10 14u (test:grotelettersk) — MIDDEL /k: bij 200 % tekst liepen de pijncijfers 9 en 10 in elkaar over ("910")**
  (Truus, iPhone SE). Het cijfer groeit nu mee tot het vak vol is (`min(1rem,5.2vw)`); bij 100 % ongewijzigd.
- **OPGELOST 2026-11-10 14u (test:grotelettersk) — LAAG /k: bij 200 % tekst stak "Zo" in "Herinnering in je agenda" buiten beeld**
  (Truus). `.agdagen` met `minmax(0,1fr)` en een daglabel dat in het vak past.
- **OPGELOST 2026-11-10 14u (test:agendadubbel) — LAAG /k: dubbeltik op "Add to my calendar"/"Zet in mijn agenda" gaf twee
  downloads** (Jayden, iPhone 14; stond al sinds 9-11 open). `naarAgenda` neemt één tik tegelijk aan.
- **OPGELOST 2026-11-10 14u (test:agendadubbel) — LAAG /k: afspraaktijd in Amerikaans formaat ("02:25 PM") op een Engelse kaart.**
  Nu de taal uit `SPRAAK` (en-GB) met 24-uursklok.
- **OPGELOST 2026-11-10 14u — MIDDEL: `test:tablet` lokaal rood** (melding van security 12u). De test markeert "Nieuw in Fysiplan"
  vooraf als gezien (versie uit release-notes.js).
- **OPGELOST 2026-11-11 10u (test:printcompact) — HOOG (Sanne, desktop) — "Compacte kaart" geeft geen extra schemaruimte.** Alleen het plaatje krimpt (82×124 → 43×62); het vak
  blijft 126 px hoog door `#a4 .pic{aspect-ratio:2/3}` (index.html r. ~141), de tabel blijft 15 rijen van 6,2 mm. v2.css r. ~199.
  Niet deze run: index.html staat in open PR #167.
- **MIDDEL (Sanne) — proefbalk "t/m dinsdag 24 november" terwijl `verloopt` = aanmelding + 14×24 u** (dus 24-11 om 15:26 op slot;
  `dagenOver` met `Math.ceil` zegt de laatste ochtend "nog 1 dag"). server.js r. ~578/687, lib/proef.js r. ~107. Fix: einde op
  23:59 Europe/Amsterdam van de genoemde dag. Wacht op #167 (server.js).
- **MIDDEL (Truus, iPhone SE) — privacyblok op /k vult bij de eerste opening het scherm:** 246 px bij 100 % (startknop half),
  880 px bij 200 % ("Begrepen" onder de vouw). Tekst is juridisch (TPRIV r en b); voorstel: tweede zin achter "Lees meer", met legal.
- **MIDDEL (Mark, iPad) — tikdoelen in de therapeut-app op tablet:** categorie-chips 24 px, Recent/Favorieten/Met video 26 px,
  werkbalk 36 px, ster 24, "+" 28. Geen `@media (pointer:coarse)` voor deze knoppen in index.html.
- **MIDDEL (Jayden, iPhone 14) — landing /v2: taalregel "Of bekijk dezelfde kaart direct in English…" contrast 2,45:1** (#a39c8a op
  #f6f2e9, 12,5 px; v2.html r. ~593) en taallinks 17 px hoog. Zelfde kleur bij "(mag ook later)" op /v2/proef (Sanne).
- LAAG: lange roepnaam zonder spaties loopt in Kaarten onder Deel/Openen/Kopie (index.html r. ~4401, geen `overflow-wrap`); 13e
  oefening geeft een `alert`; Kaarten-paneel opent met focus op `#k_naam` onderaan; "Vragen" in de /v2-nav valt onzichtbaar buiten
  beeld; .ics heet "afspraak.ics" op een Engelse kaart (server.js r. ~4961); na "alles gedaan" geen knop voor een tweede ronde;
  "Toch niet gedaan" laat "Ik heb vandaag geoefend" aan staan; beginschermbalk kan de seintje-bevestiging bedekken; teamsjabloon
  accepteert onbekende oefeningnamen (wordt een sjabloon met 0 oefeningen); liggend in de oefenstand (844×390) ±160 px inhoud.
- Bevestigd ok: offline "Toch niet gedaan", pijnscore en seintje gaan in de wachtrij en komen aan (punt uit 10u vervalt); dubbelklik
  Deel/Beveiligen/eigen oefening/teamsjabloon geeft één item; collega zonder rechten krijgt overal 403; verlopen proef weigert alle
  schrijfroutes ook zonder cookie; CSV-formules onschadelijk; gegokte id's 404.

- **MIDDEL (gemeld door security 2026-11-10 12u) — `test:tablet` is lokaal rood op main (met Chromium).** De
  iPad-check vindt het tikvlak van de video-knop 24×24 px: het venster "Nieuw in Fysiplan" ligt eroverheen
  (`naastRaakt:false`, `naast` = de dialog). In CI is er geen Playwright, dus daar slaat de test het browserdeel over en
  blijft hij groen. Waarschijnlijk sinds #162/#164. Fix: in de test het welkomstvenster sluiten, of de knop echt 44 px.

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
- **OPGELOST 2026-11-11 10u (test:printcompact) — MIDDEL (nieuw, Sanne) — "Compacte kaart" geeft geen extra schemaruimte:** alleen het plaatje krimpt (81×123 → 42×62), de
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
