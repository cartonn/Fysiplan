# Foto's op de landingspagina (/v2)

De basisfoto's komen van Pexels en vallen onder de Pexels License
(https://www.pexels.com/license/): gratis te gebruiken, ook commercieel, en
naamsvermelding is niet verplicht. We noemen de fotografen toch onder de
fotoband. Het is niet toegestaan de foto's ongewijzigd door te verkopen of te
suggereren dat de mensen erop Fysiplan aanbevelen.

| Bestand | Fotograaf | Bron | Bewerking |
|---|---|---|---|
| `behandelkamer-*.jpg` | SHVETS production | https://www.pexels.com/photo/a-person-taking-notes-while-talking-to-the-patient-8413183/ | Montage: klembord vervangen door de liggende A4-kaart van de hero op /v2 |
| `begeleiding-*.jpg` | Kampus Production | https://www.pexels.com/photo/a-man-exercising-indoors-7551631/ | Geen montage |
| `thuis-*.jpg` | Tima Miroshnichenko | https://www.pexels.com/photo/a-person-holding-a-smartphone-with-blank-screen-6611918/ | Montage: leeg scherm vervangen door de mobiele kaart van /k/demo |

De twee montages zijn in oktober 2026 met een beeldgenerator gemaakt (aangeleverd
door Ahmed). Kleine teksten en de QR-code in de foto zijn gereconstrueerd. De QR
in de foto is dus geen werkende scanroute, en de foto's zijn illustratief: geen
testimonials en geen echte patiëntgegevens. Onder de band staat dat de kaart is
ingemonteerd.

Bijsnijden en kleur afstemmen gebeurt met `python3 scripts/landing-fotos.py <bronmap>`,
met in die map `behandelkamer.*`, `begeleiding.*` en `thuis.*` (de originelen).
