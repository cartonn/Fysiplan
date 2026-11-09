# Standaard-behandelkaarten

118 eigen Fysiplan-behandelkaarten (97 in de eerste ronde, 21 voor elleboog, pols en hand op 9 november 2026). Opbouw en fasering volgen de richting van de standaard-oefenprogramma's in Physitrack (stand 9 november 2026), maar namen, omschrijvingen en oefeningen zijn van Fysiplan zelf. Elke oefening is een gepubliceerde oefening uit `public/oefeningen-v2.json`; dosering (sets en herhalingen of tijd) per oefening.

## Aantal kaarten per categorie

| Categorie | Kaarten |
|---|---:|
| Nek | 9 |
| Schouder | 2 |
| Elleboog, pols en hand | 21 |
| Rug en bekken | 24 |
| Heup en bovenbeen | 8 |
| Knie | 19 |
| Enkel en voet | 2 |
| Ouderen en balans | 7 |
| Neurologie en duizeligheid | 11 |
| Hart, vaten en longen | 10 |
| Algemeen en sport | 5 |
| **Totaal** | **118** |

## Wat is overgeslagen en waarom

Uitgangspunt: 569 standaard-sjablonen in Physitrack (EN, FR en NL), waarvan 1 zonder oefeningen.

- 82 sjablonen Hydrotherapie: wij hebben geen badoefeningen.
- 229 sjablonen waren dezelfde oefenset in een andere taal (FR/EN-versie van een NL- of EN-sjabloon). Daardoor bleven 257 unieke sjablonen over.
- 150 sjablonen hielden na het koppelen minder dan 3 oefeningen over. Bij een groot deel van de Physitrack-oefeningen (783 van de 1.071) hebben we nog geen gelijkwaardige oefening; een gok koppelen doen we niet.
- 8 sjablonen bleken na het koppelen vrijwel gelijk aan een andere kaart (vertaling of zelfde oefeningen); de NL-versie is gehouden.
- 2 handmatig: cubitaal tunnelsyndroom (na koppelen alleen nekoefeningen, past niet bij een elleboogkaart) en een dubbele covid-kaart.

## Gaten om later te vullen

- Elleboog, pols en hand: gevuld met 21 kaarten. Daarvoor kwamen 29 nieuwe oefeningen in de bibliotheek (lijntekening, avatar en omschrijving in de richting van Physitrack; `scripts/importeer-elleboog-pols-hand.mjs`, gemarkeerd als `nieuweOefening` in `content/nieuwe-lijntekeningen.json`). Nog niet: strekpees middenkootje (central slip), die nog 2 vingerkootjesoefeningen mist. Knijpen in klei blijft buiten de app tot de avatar de beweging duidelijk laat zien.
- Enkel en voet en Schouder hebben weinig kaarten om dezelfde reden (bijv. elastiekoefeningen voor de rotator cuff, enkelmobilisatie).
- Kaarten met weinig oefeningen (3-4) zijn bruikbaar als start, maar worden sterker zodra de ontbrekende oefeningen als avatar/lijntekening beschikbaar zijn.

## Aanvulling per regio (vanaf 9 november 2026)

Nieuwe oefeningen en kaarten per regio komen erin met `scripts/importeer-regio-oefeningen.mjs` (alleen beelden met oordeel "goed"; een kaart komt er pas bij minstens 3 gepubliceerde oefeningen) en `scripts/na-oefening-import.mjs`. De actuele aantallen per categorie staan in de app; de tabel hierboven is de stand van de eerste ronde.

- Schouder: 25 oefeningen (20 nieuw, 5 bestaande records kregen beeld), 18 nieuwe kaarten.
- Voet en enkel: 16 nieuwe oefeningen, 9 nieuwe kaarten. Negen enkel- en achilleskaarten wachten nog op basisoefeningen die wel een record maar nog geen beeld hebben (voet naar binnen/buiten, kuitrek, kuitheffing).
- Knie: 15 nieuwe oefeningen, 14 nieuwe kaarten en 8 aanvullingen. Acht kniekaarten wachten nog op basisoefeningen zonder beeld.
- Neurologie en duizeligheid: 11 nieuwe oefeningen, 11 nieuwe kaarten en 3 aanvullingen.
