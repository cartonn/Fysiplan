# Routine-backlog: gebruikers-sweep (V2)

Bijgehouden door de gebruikers-sweep (elke 4 uur). Vier persona's gebruiken de V2-app lokaal
op mobiel, tablet en desktop. Ernst: KRITIEK / HOOG / MIDDEL / LAAG.
Beveiliging staat in `docs/security-backlog.md`, juridisch in `docs/legal-backlog.md`,
werk voor Ahmed in `docs/mensenwerk.md`.

## Flow × apparaat → laatst getest

| Flow | Desktop 1280 | iPad | iPhone SE | iPhone 14 | Pixel 7 |
|---|---|---|---|---|---|
| Proef aanmelden + formulierfouten | 2026-11-06 | – | – | – | – |
| Welkom, praktijknaam, 12 oefeningen | 2026-11-06 | 2026-11-06 | – | – | – |
| Printversie (lijn, kleur, compact) | 2026-11-06 | – | – | – | – |
| Beveiligen, herstelcode, inloggen 2e apparaat | 2026-11-06 | 2026-11-06 | – | – | – |
| Delen, QR, kaartenoverzicht, CSV | 2026-11-06 | – | – | – | – |
| Teamsjabloon, eigen oefening, eigen video | 2026-11-06 | 2026-11-06 | – | – | – |
| Opname via telefoon /o | – | – | – | iPhone 13: 2026-11-06 | – |
| Afspraak, seintje, signalen | 2026-11-06 | – | 2026-11-06 | 2026-11-06 | 2026-11-06 |
| Proef bijna verlopen / verlopen | 2026-11-06 | deels | – | – | – |
| /k: lezen, voorlezen, pijnscore, herstel, gedaan | – | – | 2026-11-06 | 2026-11-06 | 2026-11-06 |
| /k: 200% tekst, offline, Engels, landscape, trage lijn | – | – | 2026-11-06 | 2026-11-06 | 2026-11-06 |
| /k: video afspelen | nooit (testkaarten hadden geen video) | | | | |
| Landing /v2 op mobiel | nooit | | | | |

Volgende run: video op /k, landing /v2 op mobiel, proef aanmelden op mobiel, print op tablet,
de verlopen-pagina op iPad, en Duits/Arabisch (rtl) op /k.

Testtip: alle agents delen localhost en dus één IP-bucket van de lees- en schrijfrem. Geef elke
browsercontext lokaal een eigen `x-forwarded-for`, anders krijg je 429's.

## Open

### HOOG
- **/k: offline werkt pas na het tweede bezoek.** Eerste bezoek, dan offline herladen geeft een
  wit scherm: de service worker heeft geen precache en de pagina en `/api/kaart` van het eerste
  bezoek zijn al geladen voordat hij de pagina beheert (`public/kaart-sw.js`). iPhone SE.
  Fix: na `controllerchange` (of bij install) de kaartpagina en `/api/kaart?id=` één keer in de cache zetten.
- **Therapeut-app: 429/5xx lijkt op "nog niet beveiligd" en "nog geen gedeelde kaarten".**
  `toonPrakSlot` controleert `r.ok` niet (public/index.html, rond `api/praktijk/status`) en de
  kaartenlijst maakt van elke fout een lege lijst (`return r.ok?r.json():[]`). Collega's denken
  dat alles weg is of beveiligen opnieuw. Desktop. Wacht op PR #41 (zelfde bestand).
- **Tablet: knop voor eigen video (en ×) onbereikbaar.** `.pic:hover .vid` zonder
  `@media (hover:none)` of `:focus-within`; 22×22 px; geen toetsenbordbediening. iPad gen 7.

### MIDDEL
- **Therapeut-app: proefslot op een ander apparaat** (van security, 2026-11-06, PR #47). Na een
  verlopen proef geven alle schrijfroutes (kaart delen, sjabloon, eigen oefening, opname, afspraak,
  naam, notitie, antwoord, zoekhulp) 403 met `proefVerlopen: true`, ook op een apparaat zonder
  proefcookie. Controleer dat de app dan de proef-voorbij-melding met link naar /v2/proef toont
  en niet een algemene foutmelding.
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
- Kaartenoverzicht ververst niet direct na beveiligen ("Nog geen gedeelde kaarten" tot heropenen).
- Lange kaartnaam: melding toont de hele invoer, server bewaart 60 tekens; `#k_naam` zonder maxlength.
- Bijna verlopen proef: "loopt nog vandaag nog", en "t/m zaterdag" terwijl hij vrijdag afloopt.
- /v2/proef zegt "Vul drie gegevens in", er zijn vijf verplichte velden.
- Verwerkersovereenkomst twee keer aanvinken (proef en beveiligen).
- Nieuwe proefgebruiker ziet bij het tweede bezoek meteen "Nieuw in Fysiplan".
- /k: lange link in bericht van therapeut steekt buiten de kaart (`.atekst` zonder `overflow-wrap:anywhere`).
- /k: "Ik heb vandaag geoefend" is een aan/uit-knop; nog eens tikken wist de oefendag.
- /k: lightbox zegt "De uitvoering is niet door een fysiotherapeut goedgekeurd" (verwarrend voor patiënt).
- /k (Engels): kolomkoppen "S H W" zijn Nederlandse afkortingen.
- App: knoppen 28–36 px hoog op desktop en tablet; Print loopt op iPad liggend tegen de rand.

## Opgelost

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
