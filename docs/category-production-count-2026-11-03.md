# Categorietelling productie versus lokaal, 3 november 2026

Vraag: waarom telde Rug op productie 10 en lokaal 11, en welke secundaire V2-categorieën
zijn op productie echt zichtbaar onder de runtime-overrides?

## Bronnen (alleen publieke GET, geen patiëntgegevens)
- `https://fysiplan.nl/health`: commit `736865e27157d87240d0aa1575b45630eb56d8cd`, builtAt
  2026-11-03T05:04:51Z, `verplaatst` 5, `hernoemd`/`toegevoegd`/`verwijderd` 0, 319 V2-records.
- `https://fysiplan.nl/v2/oefeningen.json`: 319 records, ETag `"7b85242b7434db32"`.

## Uitkomst
`buildManifest("v2")` op 736865e nagebouwd met de vijf overrides uit
`content/category-production-overrides.json` geeft **0 verschillen** met de geleverde catalogus
(per exerciseId: aanwezigheid, groep en ook). Er is dus geen telfout in server of client: de
productietelling is de effectieve catalogus.

| Rug | aantal |
| --- | --- |
| basis 736865e, met beeld (lokaal "11") | 11 |
| productie geleverd | 10 |
| basis HEAD 36a084e, met beeld | 13 |
| HEAD onder de productie-overrides (wat na deploy geleverd wordt) | 12 |

Ontbrekend record: **`fp_a0a18c0c13673d38` Back extension**.

Oorzaak: productie heeft een runtime-override (`data/categorie-wijzigingen.json`) op Back
extension: groep Core, ook `["Bovenste extremiteit"]`. Een override vervangt groep en ook
volledig. De Rug-mapping van Back extension kwam later in de basiscatalogus (fcade75) en wordt
daardoor op productie niet getoond. Rug extensie (`fp_7b07f346644f9c17`, zelfde bronhold maar
geen override) staat wel onder Rug.

Het verschil 13 → 12 na deploy is dezelfde oorzaak; de twee nieuwe Foam roller-mappings naar Rug
(1bcae7d) hebben geen override en worden wel zichtbaar.

Andere categorieën die verschillen tussen basis en productie, allemaal door dezelfde vijf overrides:
Bovenste extremiteit 45 → 49 (Abroller, Back extension, Abdominal (apparaat), Back (apparaat)),
Onderste extremiteit 30 → 31 (Balans op 1 been). Werk en dagelijkse handelingen is op productie 0
(de twee nieuwe mappings zijn nog niet gedeployd) en wordt 2 na deploy.

De vier nieuwe mappings uit `content/category-secondary-evidence.json` staan niet op een record met
override; hun bewijsregel "Geen override op productie" klopt.

## Besluit
De override is een bewuste beheerkeuze en blijft staan. Er is niets teruggedraaid of aangevuld
om de telling te verhogen. Rug weer tonen naast Bovenste extremiteit vraagt een beheerbeslissing;
let op: het categorievenster in beheer biedt maar één tweede categorie (`vc_tweede`), de API
(`POST /api/oefeningen/categorie`) accepteert er tot 3.

## Regressie
`scripts/test-category-effective-runtime.mjs` (onderdeel van `npm run test:categories`, dus CI)
start de echte server met precies de vijf productie-overrides en controleert:
- geleverde groep/ook per exerciseId = basis met beeld + override die volledig vervangt; IDs ongewijzigd;
- `countCategory`, `matchesCategory` en `inGroep` uit `public/index.html` tellen en filteren per
  categorie (ook aliassen) exact de geleverde records;
- de weggevallen basis-secundaire categorieën zijn precies die in de momentopname (nu alleen
  Back extension → Rug); een nieuwe mapping op een record met override faalt tot het bewust is
  vastgelegd, en een "reparatie" die basis-ook in de override mengt faalt ook;
- Rug geleverd = basis - 1 met alleen `fp_a0a18c0c13673d38` weg; V1-aantal ongewijzigd.

De test telt relatief (geleverd tegen basis) en niet tegen vaste aantallen, zodat nieuwe
categorie-mappings van vandaag hem niet breken zolang ze geen override raken.

## Beperkingen
- De momentopname geldt voor 2026-11-03. Wijzigt beheer later een categorie, dan wijkt productie
  af van de momentopname; de test gebruikt alleen de momentopname en haalt niets live op.
- De overrides zijn afgeleid uit de publieke catalogus. Dat ze volledig zijn volgt uit `/health`
  (5) en de vijf zichtbaar afwijkende records; de ruwe serverdata is niet gelezen.
