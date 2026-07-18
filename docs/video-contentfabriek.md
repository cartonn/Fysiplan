# Fysiplan video-contentfabriek

## Besluit in één zin

Bouw één herkenbare digitale Fysiplan-fysiotherapeut, laat iedere beweging door een echte
fysiotherapeut uitvoeren en vastleggen met motion capture, en gebruik AI alleen voor de avatar,
stem en lokalisatie — nooit om een therapeutische beweging te verzinnen.

Dat geeft Fysiplan een eigen, meertalige bibliotheek die klinisch controleerbaar en veel goedkoper
te onderhouden is dan per taal een volledige video opnieuw maken.

## Waarom dit anders moet dan een gewone AI-avatar

Synthesia en HeyGen zijn sterk in pratende avatars, lipsynchronisatie en templatevideo's op schaal.
Hun productdocumentatie beschrijft echter geen klinisch betrouwbare full-body biomechanica. Een
tekstprompt als “doe een squat” is daarom geen veilige bron voor patiëntinstructie. Zie de officiële
[Synthesia API- en templatedocumentatie](https://docs.synthesia.io/reference/introduction),
[Synthesia Personal Avatars](https://docs.synthesia.io/docs/personal-avatars) en
[HeyGen API-prijzen](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained).

De beweging is het medische product. Daarom is de bron altijd een fysiotherapeut die de oefening
daadwerkelijk uitvoert; de avatar is alleen de consistente visuele huid daaroverheen.

## Aanbevolen stack

| Laag | Keuze | Reden |
| --- | --- | --- |
| Bewegingsbron | Ervaren fysiotherapeut + vast captureprotocol | Menselijke, herhaalbare en reviewbare uitvoering |
| Productie motion capture | Rokoko Smartsuit Pro II | 200 fps, onbeperkt opnemen, FBX/BVH/CSV, directe Unreal/Blender-workflow en ingebouwde cleanup; [productinformatie](https://www.rokoko.com/products/smartsuit-pro) |
| Goedkope pilot | Move One op iPhone | Snel valideren zonder studio-investering; [prijzen en limieten](https://docs.move.ai/knowledge/move-one-pricing) |
| Avatar/render | Epic MetaHuman + Unreal Engine | Hoogste realistische, consistente eigen avatar en controle over camera, kleding, licht en anatomische zichtbaarheid; [MetaHuman Animator](https://dev.epicgames.com/documentation/metahuman/metahuman-animator-in-unreal-engine) |
| Stem | ElevenLabs Multilingual v2/v3 | Consistente stem over veel talen via API; [modellen](https://elevenlabs.io/docs/overview/models) en [TTS API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) |
| Video delivery | Cloudflare Stream | Upload, encoding, adaptieve playback, signed URL-optie, captions en meerdere audiosporen in één videomaster; [Stream](https://developers.cloudflare.com/stream/) |
| App-koppeling | `exerciseId` + goedgekeurde catalogus | Automatische één-klik-koppeling die hernoemen en vertalen overleeft |

MetaHuman markerless body capture vanaf één camera is in Unreal 5.8 nog experimenteel. Gebruik dat
daarom voor tests, niet als enige productiebron. Zie
[MetaHuman mono video capture](https://dev.epicgames.com/documentation/metahuman/metahuman-animation-from-mono-video-capture-in-unreal-engine).
Voor latere studio-opschaling is Move Genesis een professioneel markerless multi-camerasysteem met
biomechanische modellering; zie [Genesis overview](https://docs.move.ai/knowledge/genesis-overview).

Gerenderde videobestanden zijn volgens de Unreal EULA royaltyvrije “Non-Engine Products”; controleer
bij aanschaf ook de dan geldende seatvoorwaarden. Zie de [Unreal Engine EULA](https://www.unrealengine.com/en-US/eula).

## Slim opschalen naar duizenden oefeningen

Begin niet met duizend los bedachte scripts. Maak 250–400 canonieke bewegingsfamilies en bouw
klinisch relevante varianten als aparte catalogusitems:

- links/rechts of bilateraal;
- liggend, zittend en staand;
- zonder materiaal, elastiek, halter, bal of apparaat;
- regressie, basis en progressie;
- mobiliteit, isometrisch, langzaam concentrisch/excentrisch;
- verschillende veilige ROM- of tempovarianten.

Zo ontstaan 1.000–2.000 echt vindbare oefeningen zonder duizend keer de hele productie opnieuw uit
te vinden. Iedere variant blijft wel een eigen beoordeeld item; varianten zijn geen excuus om een
ongecontroleerde animatie automatisch te publiceren.

### Metadata per item

Minimaal: `exerciseId`, naam, lichaamsregio, gewricht, bewegingsrichting, houding, materiaal, zijde,
niveau, doel, uitgangshouding, uitvoering, veelgemaakte fout, doseringsvorm, contra-indicaties,
captureversie, avatarversie, talen, reviewer, reviewdatum, videoversie en status.

De huidige app leidt `exerciseId` af van het stabiele afbeeldingspad. Daardoor blijven kaarten en
video's correct gekoppeld wanneer een naam of categorie wijzigt. Nieuwe kaarten bewaren zowel ID als
leesbare naam; oudere kaarten blijven via de naamfallback werken.

## Eén visuele master, alle talen

Render per oefening één korte visuele master van ongeveer 15–25 seconden. Voeg daarna per taal een
apart audiospoor en captionbestand toe. Cloudflare Stream ondersteunt extra audiosporen en captions:

- [extra audiosporen](https://developers.cloudflare.com/stream/edit-videos/adding-additional-audio-tracks/);
- [captions](https://developers.cloudflare.com/stream/edit-videos/adding-captions/).

Daarmee hoeft een gewijzigd Turks script niet opnieuw door motion capture of Unreal. Alleen het
Turkse audio- en captionspoor verandert. De patiënt kiest de taal op de kaart; de speler toont de
beschikbare taalsporen en opent automatisch de captiontaal als die bestaat.

Gebruik één gelicentieerde Fysiplan-stem, een vaste medische woordenlijst en taalreview door een
moedertaalspreker. Een letterlijke AI-vertaling is geen publicatiegoedkeuring.

## Publicatiepoort

De workflow is:

`draft → motion captured → rendered → clinical review → language review → approved → published`

Een item met `draft`, `review` of `retired` komt nooit in het patiëntmanifest. Alleen `approved` met
reviewer, reviewdatum, geldige versie en een toegestane Cloudflare Stream-URL wordt door de build
geaccepteerd. `npm run build` stopt bij een ongeldige catalogus, dus een half beoordeelde video kan
niet per ongeluk live gaan.

Voorbeeld van één gepubliceerd item:

```json
{
  "exerciseId": "fp_0123456789abcdef",
  "status": "approved",
  "provider": "cloudflare-stream",
  "iframe": "https://customer-<code>.cloudflarestream.com/<uid>/iframe",
  "languages": ["nl", "en", "tr"],
  "aiGenerated": true,
  "version": 1,
  "clinicalReview": {
    "reviewer": "BIG-geregistreerde fysiotherapeut",
    "approvedAt": "2026-08-01"
  }
}
```

De bestaande persoonlijke cliëntopname en de praktijkvideo blijven overrides. De prioriteit op de
patiëntkaart is: persoonlijke video → eigen praktijkopname → praktijk-YouTube → Fysiplan-catalogus.

## UX in Fysiplan

De therapeut doet geen tweede videohandeling:

1. Een oefening met video toont in de bibliotheek **video inbegrepen**.
2. Eén klik op `+` voegt oefening, afbeelding en videokoppeling toe.
3. Op de A4 staat een klein blauw `VIDEO`-signaal als bevestiging.
4. Op de digitale patiëntkaart verschijnt de afspeelknop automatisch.
5. De camera op de A4 blijft beschikbaar voor een persoonlijke cliëntvideo; die gaat altijd voor.

Bij AI-gerenderde catalogusvideo toont de patiëntpagina blijvend “AI-demonstratie · klinisch
gecontroleerd”. Dat helpt ook bij de transparantie-eis voor synthetische content uit artikel 50 van
de [EU AI Act](https://eur-lex.europa.eu/eli/reg/2024/1689/oj?locale=en), die vanaf 2 augustus 2026
van toepassing is.

## Kostenbeeld

Cloudflare rekent momenteel $5 per 1.000 opgeslagen videominuten en $1 per 1.000 geleverde minuten;
encoding en ingress zijn inbegrepen. Zie [Stream pricing](https://developers.cloudflare.com/stream/pricing/).
Duizend clips van gemiddeld twintig seconden zijn circa 333 opgeslagen minuten: ruim binnen de
eerste $5-opslagbundel. Honderdduizend bekeken minuten kosten ongeveer $100. Motion capture,
klinische review en taalcontrole zijn dus veel grotere kostenposten dan opslag.

Een praat-avatar-API over diezelfde 333 minuten kost op basis van HeyGen's huidige orde van grootte
ongeveer $333 bij $1/minuut of $1.332 bij $4/minuut, nog vóór taalvarianten en herproductie. Die route
lost de correcte lichaamsbeweging bovendien niet op. Mux is een bruikbaar alternatief met een
gratis deliverylaag en multi-audio; zie [Mux pricing](https://www.mux.com/pricing).

## Pilot van zes weken

1. Kies de 50 meest gebruikte oefeningen uit gebruiksdata en laat één fysiotherapeut de definitieve
   uitvoering en foutenlijst vastleggen.
2. Bouw één Fysiplan MetaHuman, leg performer-, gezicht- en stemrechten schriftelijk vast en maak
   een vast camera/licht/kledingprotocol.
3. Capture eerst met Move One om de hele keten te bewijzen; vergelijk tien complexe bewegingen met
   Rokoko voordat de productiestack definitief wordt gekocht.
4. Publiceer Nederlands, Engels en Turks, ieder met captions en taalreview.
5. Laat twee fysiotherapeuten onafhankelijk op uitvoering, camerazicht, tempo en veiligheidszin
   controleren; verschillen moeten vóór publicatie worden opgelost.
6. Meet afspelen, volledig bekijken, patiëntbegrip en therapietrouw — geen diagnose of automatische
   voorschrijfbeslissing.

Video bij een thuisoefenprogramma kan gedrag verbeteren: in een RCT na beroerte was de
3-maandentrouw 75,6% met video tegenover 55,2% met hand-outs
([PubMed](https://pubmed.ncbi.nlm.nih.gov/32489241/)). Een systematische review vond in zeven van tien
RCT's voordeel voor digitale interventies, maar noemt langetermijneffecten nog onzeker
([PubMed](https://pubmed.ncbi.nlm.nih.gov/36184611/)). Daarom eerst het 50-video-cohort meten en pas
daarna de productielijn naar 250 en 1.000 items opschalen.

## Dagelijks beheer

- Exporteer de actuele wachtrij met `npm run videos:export > video-productie.csv`.
- Voeg alleen na beide reviews een item aan `content/video-catalogus.json` toe.
- Controleer met `npm run videos:check`.
- Publiceer een wijziging als nieuwe `version`; overschrijf nooit stil een klinisch goedgekeurde
  versie. Bewaar bronmotion, renderinstellingen, scripts, audio en reviewformulier buiten de app in
  een versiegestuurde productieopslag.
