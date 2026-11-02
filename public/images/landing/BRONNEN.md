# Foto's op de landingspagina (/v2)

## Update 2 november 2026

- `kaart-papier-natural-*`: gerichte imagegen-retouche van de eerdere kaartmontage voor papierkromming, belichting en handcontact. Bron `assets/landing/paper-natural-source.png`. De 12 oefenkolommen zijn visueel gecontroleerd. De foto is illustratief; kleine tekst en lijnen zijn door de beeldgenerator opnieuw weergegeven en zijn niet pixel-identiek aan de werkkaart. De losse voorbeeldkaart blijft de ongewijzigde technische weergave.

- `kaart-papier-sport-12-*`: de basis is met de ingebouwde imagegen bewerkt: behandelaar in blauwe polo; vrouwelijke patiënt in sportshirt en trainingsbroek. Vervolgens is het volledige papier deterministisch vervangen door `trainingskaart-12.png`; de beeldgenerator heeft de definitieve tekst, vakken en oefenafbeeldingen niet getekend.
- `trainingskaart-12.svg` / `.png`: voorbeeldkaart op basis van de afmetingen, kleuren, bestaande oefenbeelden en tabelstructuur van `public/index.html` (`#a4`, `renderA4`). Twaalf oefenkolommen, twee blokken van zes datumregels, twee BORG-regels, één XRM-regel. Getypte, fictieve gegevens. Dit is een presentatievoorbeeld, geen behandeladvies en geen echte patiëntkaart.
- `kaart-telefoon-light-*`: imagegen-bewerking naar lichte schermweergave. Voorbeeldteller vervolgens technisch op twaalf gezet. Geen wijziging van de werkende patiëntapp door deze fotobewerking.
- Reproduceerbaar vanuit `assets/landing/patient-sport-source.png` en `assets/landing/phone-light-source.png`, met `scripts/landing-card-assets.mjs` en `scripts/landing-phone-counter.mjs`. De bestaande foto's blijven bewaard.

Deze beelden blijven illustratieve fotomontages, geen testimonials. De kaart is geen letterlijke browser-screenshot; de technische montage gebruikt dezelfde vakindeling en oorspronkelijke oefenafbeeldingen. De links op de landingpage openen de echte app/voorbeeldkaart.

De (basis)foto's komen van Pexels en vallen onder de Pexels License
(https://www.pexels.com/license/): gratis te gebruiken, ook commercieel, en
naamsvermelding is niet verplicht. We noemen de fotografen toch op de pagina.
Het is niet toegestaan de foto's ongewijzigd door te verkopen of te
suggereren dat de mensen erop Fysiplan aanbevelen.

## Fotoband in 02 'Van behandelkamer naar huiskamer'

| Bestand | Fotograaf | Bron |
|---|---|---|
| `behandelkamer-*.jpg` | Karola G (Kaboompics) | https://www.pexels.com/photo/chiropractor-assisting-female-patient-with-dumbbell-in-doctor-office-4506073/ |
| `begeleiding-*.jpg` | Kampus Production | https://www.pexels.com/photo/a-man-exercising-indoors-7551631/ |
| `thuis-*.jpg` | Karola G (Kaboompics) | https://www.pexels.com/photo/woman-doing-yoga-at-home-6633825/ |

## Montages boven de twee cijfers in 01 'Waarom Fysiplan'

| Bestand | Fotograaf | Bron | Bewerking |
|---|---|---|---|
| `kaart-papier-*.jpg` | SHVETS production | https://www.pexels.com/photo/a-person-taking-notes-while-talking-to-the-patient-8413183/ | Klembord vervangen door de liggende A4-kaart van de hero op /v2 |
| `kaart-telefoon-*.jpg` | Tima Miroshnichenko | https://www.pexels.com/photo/a-person-holding-a-smartphone-with-blank-screen-6611918/ | Leeg scherm vervangen door de mobiele kaart van /k/demo |

De twee montages zijn in oktober 2026 met een beeldgenerator gemaakt (aangeleverd
door Ahmed). Kleine teksten en de QR-code in de foto zijn gereconstrueerd. De QR
in de foto is dus geen werkende scanroute, en de foto's zijn illustratief: geen
testimonials en geen echte patiëntgegevens. Onder elke montage staat dat het een
montage is.

Bijsnijden en kleur afstemmen gebeurt met `python3 scripts/landing-fotos.py <bronmap>`,
met in die map één origineel per plek, genoemd naar de plek (`behandelkamer.jpg`,
`kaart-papier.png`, enzovoort).
