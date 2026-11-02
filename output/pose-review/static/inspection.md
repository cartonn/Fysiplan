# Visuele controle van de 158 statische oefeningen

Datum: 2026-11-02 (sessie 3). Uitgevoerd door Claude Opus 5.5 op verzoek van de eigenaar.

**Wat dit is:** elke oefening die op de kaart als volledige afbeelding verschijnt (poseGeometry.status `static`) is
één voor één bekeken op contactbladen (`static-sheet-01..20.jpg`, 8 per blad, 360×540 per tegel). Elk bronbestand is
vóór het renderen tegen zijn sha256 uit public/mobile-media-review.json gecontroleerd (`index.json` bevat de hash).

**Wat dit niet is:** geen klinische beoordeling en geen controle op volle resolutie. "plausibel" betekent alleen dat
het beeld voor een leek bij de naam lijkt te passen. "fout" en "onzeker" zijn signalen voor een fysiotherapeut, geen
besluit. Er is niets aan de beelden, de beoordelingsbestanden of de kaart veranderd.

Reproduceren: `node scripts/render-static-review.mjs && node scripts/measure-static-background.mjs`.

## Uitkomst

- weergave in orde: 146, met een zichtbare afwijking in het beeld zelf: 12
- betekenis plausibel: 135, onzeker: 17, lijkt fout: 6
- **merk:** 85 van de 158 statische beelden (nr. 74–158: cardio, Swiss ball, foam roller, med ball, mobiliteit, stretch, stoeloefeningen) hebben **geen** Fysiplan-merk; nr. 1–73 hebben het merk ingebakken linksboven. Op de kaart wisselt het merk dus per oefening. Bij de houdingweergave tekent de kaart zelf het merk; bij statische beelden niet.
- **achtergrond:** gemeten op een rand van 6 px is alles vrijwel wit; vier beelden zitten net onder 245 gemiddeld (nr. 25, 31, 47, 109: 240–243). Bij nr. 85 zitten twee foto’s met een zichtbare naad onder elkaar.
- **formaat:** 157× 800×1200; nr. 74 (Alternating lunge jumps, v9) is 1199×1312 en wijkt ook in tekenstijl af.
- **merkvak over het hoofd:** bij nr. 9, 21 en 49 snijdt het ingebakken merkvak een recht hoekje uit de haren van de linker figuur.

## Lijkt inhoudelijk fout (6)

| # | oefening | id | weergave | betekenis | opmerking |
|---|---|---|---|---|---|
| 4 | Dips | `fp_013ba6ad937cc9d9` | ok | fout | Beide figuren staan rechtop naast losse palen; er wordt geen dip afgebeeld |
| 22 | Triceps dips | `fp_f227db5fcf245d9c` | ok | fout | Geen bank of steun: handen steunen op niets |
| 28 | Step up with knee raise | `fp_7dc1478e2b3c17b0` | afwijking | fout | Losse zwevende blokjes; geen opstap zichtbaar (ook handmatig afgekeurd als houdingpaar) |
| 152 | Standing chair hip extension | `fp_514654a0d4181742` | ok | fout | Toont een knieheffing naar voren, geen heupextensie (lijkt verwisseld met 154) |
| 154 | Standing chair knee lift | `fp_5319c4700561725d` | ok | fout | Toont het been naar achteren (heupextensie), geen knieheffing (lijkt verwisseld met 152) |
| 156 | Standing chair shoulder rotations | `fp_4b99c5f11b42a30d` | ok | fout | Toont staan op één been met de hand op de stoel; geen schouderrotatie |

Nr. 152 en 154 lijken onderling verwisseld (bestanden standing-chair-hip-extension-avatar-v8.jpg en standing-chair-knee-lift-avatar-v8.jpg). Niet omgewisseld: dat is een inhoudelijk besluit.

## Onzeker (17)

| # | oefening | id | weergave | betekenis | opmerking |
|---|---|---|---|---|---|
| 1 | Barbell neck press | `fp_1828d3579aacc5bc` | ok | onzeker | Stang vóór het hoofd, niet achter de nek; naam 'neck press' niet afgebeeld |
| 5 | Dumbell neck press | `fp_7f4ce1cc338c328f` | ok | onzeker | Halters vóór de schouders, niet achter de nek; lijkt schouderdrukken |
| 15 | Pully cross up | `fp_77def39d4ae09ef9` | ok | onzeker | Kabel van katrol links loopt dwars langs figuur 1 naar de handen van figuur 2; armen voorwaarts, geen 'cross up' |
| 16 | Pully dips | `fp_6d1cc89ca3f2d07a` | ok | onzeker | Figuur 1 heeft een kabel, figuur 2 houdt handvatten zonder kabel |
| 18 | Pully press single | `fp_338eb9bf2c26dda3` | ok | onzeker | Eén kabel verbindt de hand van figuur 1 met die van figuur 2 |
| 21 | Shoulder rotation (shrugs) | `fp_2851dfd52f89d4e1` | afwijking | onzeker | Merkvak snijdt hoekje uit de haren; beide houdingen vrijwel gelijk, geen schouderophalen zichtbaar |
| 32 | Squat jumps | `fp_a897d84ff30d4993` | ok | onzeker | Springen met opstapkistjes; niet duidelijk of op de kist geland wordt |
| 43 | TRX row | `fp_e28894b278170b61` | afwijking | onzeker | Figuur 2 houdt handvatten zonder band; voeten raken de rechterrand |
| 46 | TRX squat pistol | `fp_e06bebd7b7358c90` | ok | onzeker | Houding 2 lijkt zitten op de grond, geen pistol squat |
| 50 | Yoga ear pressure | `fp_45eb69b02317733b` | afwijking | onzeker | Houding 2 is eerder ploeg dan knieën bij de oren; mat afgesneden aan de rechterrand |
| 68 | Endy Rugmachine | `fp_521e3cd46404d3ac` | ok | onzeker | Volgorde: rechtop eerst, voorovergebogen tweede; bij rugextensie meestal andersom |
| 74 | Alternating lunge jumps | `fp_027779ceb994b08e` | afwijking | onzeker | Afwijkend formaat (liggend), geen merk, andere tekenstijl; twee vrijwel gelijke lunges, sprong niet afgebeeld (ook handmatig afgekeurd als houdingpaar) |
| 77 | Swiss ball squeezes adductoren | `fp_0e06ee3270c9952a` | ok | onzeker | Bal ligt naast/achter de knieën, niet tussen de knieën geklemd |
| 114 | Mob back cat/cow | `fp_fb18dd6c8b2b3a16` | ok | onzeker | Eén houding van een tweefasige beweging (kat/koe) |
| 129 | Seated calfs raises | `fp_074bfa82f6175277` | ok | onzeker | Hielen op de grond; de hielheffing zelf is niet afgebeeld |
| 140 | Seated shoulder roll | `fp_55f82056b64addb5` | ok | onzeker | Schouderrollen niet zichtbaar; neutrale zithouding |
| 148 | Standing chair calfs raises | `fp_5d408b649789eb5c` | ok | onzeker | Hielen op de grond; de hielheffing zelf is niet afgebeeld |

## Afwijking in het beeld, betekenis niet fout (11)

| # | oefening | id | weergave | betekenis | opmerking |
|---|---|---|---|---|---|
| 9 | Front raises | `fp_4e2e2902d6482607` | afwijking | plausibel | Merkvak snijdt een recht hoekje uit de haren van figuur 1 |
| 21 | Shoulder rotation (shrugs) | `fp_2851dfd52f89d4e1` | afwijking | onzeker | Merkvak snijdt hoekje uit de haren; beide houdingen vrijwel gelijk, geen schouderophalen zichtbaar |
| 25 | Hack squat | `fp_918ae38b193310b8` | afwijking | plausibel | Apparaat van figuur 1 afgesneden aan de linkerrand van de bron |
| 40 | TRX lunge reverse | `fp_c7a30e5ff9d85248` | afwijking | plausibel | Band van figuur 1 eindigt in de lucht |
| 43 | TRX row | `fp_e28894b278170b61` | afwijking | onzeker | Figuur 2 houdt handvatten zonder band; voeten raken de rechterrand |
| 47 | TRX triceps extension | `fp_c4b190023bce96e1` | afwijking | plausibel | Figuur 2 en band afgesneden aan de rechterrand |
| 49 | Yoga deep squat | `fp_f6a4e38230c49a26` | afwijking | plausibel | Merkvak snijdt hoekje uit de haren van figuur 1 |
| 50 | Yoga ear pressure | `fp_45eb69b02317733b` | afwijking | onzeker | Houding 2 is eerder ploeg dan knieën bij de oren; mat afgesneden aan de rechterrand |
| 67 | Endy Leg curl | `fp_9c9150323706dcba` | afwijking | plausibel | Voeten van houding 1 half doorzichtig/vervaagd |
| 74 | Alternating lunge jumps | `fp_027779ceb994b08e` | afwijking | onzeker | Afwijkend formaat (liggend), geen merk, andere tekenstijl; twee vrijwel gelijke lunges, sprong niet afgebeeld (ook handmatig afgekeurd als houdingpaar) |
| 85 | Foam roller tractus | `fp_1475d9e5ff7c119b` | afwijking | plausibel | Twee foto's onder elkaar met zichtbare naad en grijze achtergrond |

## Alle 158

| # | oefening | id | weergave | betekenis | opmerking |
|---|---|---|---|---|---|
| 1 | Barbell neck press | `fp_1828d3579aacc5bc` | ok | onzeker | Stang vóór het hoofd, niet achter de nek; naam 'neck press' niet afgebeeld |
| 2 | Barbell pull over | `fp_5db16db1c4b85956` | ok | plausibel |  |
| 3 | Bench press | `fp_23ffdd3956aecfb4` | ok | plausibel |  |
| 4 | Dips | `fp_013ba6ad937cc9d9` | ok | fout | Beide figuren staan rechtop naast losse palen; er wordt geen dip afgebeeld |
| 5 | Dumbell neck press | `fp_7f4ce1cc338c328f` | ok | onzeker | Halters vóór de schouders, niet achter de nek; lijkt schouderdrukken |
| 6 | Dumbell pull over | `fp_7808749387b6f081` | ok | plausibel |  |
| 7 | Exo pull | `fp_5423a6beaa5b75b7` | ok | plausibel |  |
| 8 | Flyes | `fp_7b22cceae60e6805` | ok | plausibel |  |
| 9 | Front raises | `fp_4e2e2902d6482607` | afwijking | plausibel | Merkvak snijdt een recht hoekje uit de haren van figuur 1 |
| 10 | Incline bench press | `fp_e1f92ebe56d44e0a` | ok | plausibel |  |
| 11 | Incline flyes | `fp_d61a6fa943e5ba21` | ok | plausibel |  |
| 12 | Lat pull front | `fp_b3c08cf3e8344649` | ok | plausibel |  |
| 13 | Military press | `fp_d49b76635c4c0073` | ok | plausibel |  |
| 14 | One arm bent over row | `fp_f926cb9ff106963d` | ok | plausibel |  |
| 15 | Pully cross up | `fp_77def39d4ae09ef9` | ok | onzeker | Kabel van katrol links loopt dwars langs figuur 1 naar de handen van figuur 2; armen voorwaarts, geen 'cross up' |
| 16 | Pully dips | `fp_6d1cc89ca3f2d07a` | ok | onzeker | Figuur 1 heeft een kabel, figuur 2 houdt handvatten zonder kabel |
| 17 | Pully down | `fp_39587ab625e7f5ce` | ok | plausibel | Figuur 2 zonder kabel |
| 18 | Pully press single | `fp_338eb9bf2c26dda3` | ok | onzeker | Eén kabel verbindt de hand van figuur 1 met die van figuur 2 |
| 19 | Pully row | `fp_7cad1ed08189f651` | ok | plausibel |  |
| 20 | Reversed flyes | `fp_8db93020a49ad7cc` | ok | plausibel |  |
| 21 | Shoulder rotation (shrugs) | `fp_2851dfd52f89d4e1` | afwijking | onzeker | Merkvak snijdt hoekje uit de haren; beide houdingen vrijwel gelijk, geen schouderophalen zichtbaar |
| 22 | Triceps dips | `fp_f227db5fcf245d9c` | ok | fout | Geen bank of steun: handen steunen op niets |
| 23 | Wrist extension | `fp_ca78db68bfc2ce5e` | ok | plausibel |  |
| 24 | Front squat | `fp_97db6b7c4ee71185` | ok | plausibel |  |
| 25 | Hack squat | `fp_918ae38b193310b8` | afwijking | plausibel | Apparaat van figuur 1 afgesneden aan de linkerrand van de bron |
| 26 | Leg extension | `fp_0ba32cc051f02ca6` | ok | plausibel |  |
| 27 | Single leg squat | `fp_0d8160777275f1d9` | ok | plausibel |  |
| 28 | Step up with knee raise | `fp_7dc1478e2b3c17b0` | afwijking | fout | Losse zwevende blokjes; geen opstap zichtbaar (ook handmatig afgekeurd als houdingpaar) |
| 29 | Abroller | `fp_ba8ecef1edfecd32` | ok | plausibel |  |
| 30 | Mountain climber | `fp_70914158247cadac` | ok | plausibel |  |
| 31 | Roeier | `fp_6c3dd765218031ce` | ok | plausibel |  |
| 32 | Squat jumps | `fp_a897d84ff30d4993` | ok | onzeker | Springen met opstapkistjes; niet duidelijk of op de kist geland wordt |
| 33 | TRX ab roll out | `fp_0583cc25fb6882d7` | ok | plausibel | Bevestigingspunt figuur 1 afgesneden aan de bovenrand |
| 34 | TRX biceps curl | `fp_e13686b64cf3495d` | ok | plausibel |  |
| 35 | TRX chest press | `fp_0e47c8da4f3accdd` | ok | plausibel |  |
| 36 | TRX flyes I | `fp_c2ae0e94f5738a77` | ok | plausibel |  |
| 37 | TRX flyes II | `fp_ff018299959429f0` | ok | plausibel |  |
| 38 | TRX glute bridge | `fp_e8cefa0cdc89c222` | ok | plausibel |  |
| 39 | TRX lunge lateral high | `fp_f514c597315a9093` | ok | plausibel |  |
| 40 | TRX lunge reverse | `fp_c7a30e5ff9d85248` | afwijking | plausibel | Band van figuur 1 eindigt in de lucht |
| 41 | TRX plank | `fp_65c52063d3076d21` | ok | plausibel |  |
| 42 | TRX plank side | `fp_d62104514b8a2ca3` | ok | plausibel |  |
| 43 | TRX row | `fp_e28894b278170b61` | afwijking | onzeker | Figuur 2 houdt handvatten zonder band; voeten raken de rechterrand |
| 44 | TRX saw pikes | `fp_c2db68d9f54ced18` | ok | plausibel |  |
| 45 | TRX squat | `fp_220ad8ffe4242701` | ok | plausibel |  |
| 46 | TRX squat pistol | `fp_e06bebd7b7358c90` | ok | onzeker | Houding 2 lijkt zitten op de grond, geen pistol squat |
| 47 | TRX triceps extension | `fp_c4b190023bce96e1` | afwijking | plausibel | Figuur 2 en band afgesneden aan de rechterrand |
| 48 | Yoga butterfly stretch | `fp_6363eb3d095af9ff` | ok | plausibel | Houdingen vrijwel gelijk |
| 49 | Yoga deep squat | `fp_f6a4e38230c49a26` | afwijking | plausibel | Merkvak snijdt hoekje uit de haren van figuur 1 |
| 50 | Yoga ear pressure | `fp_45eb69b02317733b` | afwijking | onzeker | Houding 2 is eerder ploeg dan knieën bij de oren; mat afgesneden aan de rechterrand |
| 51 | Yoga extended child's pose | `fp_0c813648b61d0a57` | ok | plausibel |  |
| 52 | Yoga extended triangle | `fp_a97c7ce2c7899d0f` | ok | plausibel |  |
| 53 | Yoga frog | `fp_8462e52d2da7bf79` | ok | plausibel |  |
| 54 | Yoga full boat | `fp_8434579cd7154b6d` | ok | plausibel |  |
| 55 | Yoga half monkey | `fp_6303ba477869424f` | ok | plausibel |  |
| 56 | Yoga Marichi’s III | `fp_e19ecd2f1a8dd183` | ok | plausibel | Houdingen vrijwel gelijk |
| 57 | Yoga reverse warrior | `fp_2a949cd1df2e6b73` | ok | plausibel |  |
| 58 | Yoga revolved downward facing dog | `fp_091229d871a15a3f` | ok | plausibel |  |
| 59 | Yoga warrior II | `fp_d9318269f3119cd9` | ok | plausibel |  |
| 60 | Bodyblade diagonaal | `fp_da63729ba577a91a` | ok | plausibel |  |
| 61 | Foam rol glutes stretch | `fp_b1b55b86c4100e54` | ok | plausibel | Houdingen vrijwel gelijk |
| 62 | Abdominal (apparaat) | `fp_5af0270a5fedd83b` | ok | plausibel |  |
| 63 | Backextensie (apparaat) | `fp_b5725b610192706a` | ok | plausibel |  |
| 64 | Crosstrainer (apparaat) | `fp_b9345bde5c635878` | ok | plausibel | Houdingen vrijwel gelijk |
| 65 | Endy Buikmachine | `fp_aaabb27f28a34f46` | ok | plausibel |  |
| 66 | Endy Heup abductie | `fp_3cb155e4c77ec502` | ok | plausibel |  |
| 67 | Endy Leg curl | `fp_9c9150323706dcba` | afwijking | plausibel | Voeten van houding 1 half doorzichtig/vervaagd |
| 68 | Endy Rugmachine | `fp_521e3cd46404d3ac` | ok | onzeker | Volgorde: rechtop eerst, voorovergebogen tweede; bij rugextensie meestal andersom |
| 69 | Fiets (apparaat) | `fp_762433eae97df9e5` | ok | plausibel |  |
| 70 | Leg press (apparaat) | `fp_a283bcb81ae6eb31` | ok | plausibel |  |
| 71 | Loopband (apparaat) | `fp_f2e38bb5f7abf0b2` | ok | plausibel |  |
| 72 | Stairs (apparaat) | `fp_143594f21492f955` | ok | plausibel |  |
| 73 | Vertical row (apparaat) | `fp_e082af3a36965a68` | ok | plausibel |  |
| 74 | Alternating lunge jumps | `fp_027779ceb994b08e` | afwijking | onzeker | Afwijkend formaat (liggend), geen merk, andere tekenstijl; twee vrijwel gelijke lunges, sprong niet afgebeeld (ook handmatig afgekeurd als houdingpaar) |
| 75 | Sprints | `fp_3b9e14e7264e71a4` | ok | plausibel |  |
| 76 | Swiss ball wall squat | `fp_f26c61999ac184bd` | ok | plausibel | Wandpaneel zichtbaar als grijs vlak |
| 77 | Swiss ball squeezes adductoren | `fp_0e06ee3270c9952a` | ok | onzeker | Bal ligt naast/achter de knieën, niet tussen de knieën geklemd |
| 78 | Swiss ball leg curl one leg | `fp_8b276d90443725c9` | ok | plausibel |  |
| 79 | Swiss ball dumbbell flyes | `fp_55b80e4f630bccda` | ok | plausibel |  |
| 80 | Swiss ball dumbbell chest press | `fp_725683c0e7847634` | ok | plausibel | Figuren klein in beeld |
| 81 | Foam roller glute med. | `fp_90e9eb8d9522510c` | ok | plausibel |  |
| 82 | Foam roller glute | `fp_6c0fe3bba04367bd` | ok | plausibel |  |
| 83 | Foam roller hamstring | `fp_4c76bb5ec2f5750b` | ok | plausibel |  |
| 84 | Foam roller calf | `fp_8fb77da919f771d2` | ok | plausibel |  |
| 85 | Foam roller tractus | `fp_1475d9e5ff7c119b` | afwijking | plausibel | Twee foto's onder elkaar met zichtbare naad en grijze achtergrond |
| 86 | Foam roller back upper | `fp_84154b2578401c90` | ok | plausibel | Eén houding |
| 87 | Foam roller lat stretch | `fp_459a21a001379ff4` | ok | plausibel | Eén houding |
| 88 | Foam roller adductoren | `fp_d1a9f14ec236926a` | ok | plausibel | Eén houding |
| 89 | Foam roller fore arm | `fp_b5842218c2acd8d0` | ok | plausibel |  |
| 90 | Foam roller back lower cross | `fp_7a80af282e5365f5` | ok | plausibel |  |
| 91 | Foam roller back lower | `fp_3fd0ad562e93e587` | ok | plausibel |  |
| 92 | Foam roller back extension | `fp_e9358123e578e29b` | ok | plausibel |  |
| 93 | Med ball slams | `fp_3e21b7d2e6b650f9` | ok | plausibel |  |
| 94 | Med ball wall throw | `fp_61f517b18e97eead` | ok | plausibel | Geen muur afgebeeld |
| 95 | Med ball chest press | `fp_4744640504bedb24` | ok | plausibel |  |
| 96 | Med ball floor press | `fp_72446d182c8eb06b` | ok | plausibel |  |
| 97 | Med ball rotation passes | `fp_0c4b960f97f1d61f` | ok | plausibel |  |
| 98 | Med ball rotation passes knee | `fp_b852517e00a4148f` | ok | plausibel |  |
| 99 | Med ball push up one arm | `fp_9ae1334e0216ae2e` | ok | plausibel |  |
| 100 | Med ball push up two arms | `fp_942ed29424854e9d` | ok | plausibel |  |
| 101 | Med. Ball - Alt. Side slam | `fp_2fa3a6c48570a71d` | ok | plausibel |  |
| 102 | Med ball obliques cross | `fp_e3bc3ace06e1a8bd` | ok | plausibel |  |
| 103 | Med ball throw and jog | `fp_9ad5104287158635` | ok | plausibel |  |
| 104 | Med ball swing | `fp_16adae85403409b5` | ok | plausibel |  |
| 105 | Med ball overhead circles | `fp_b30b561f6b7f8387` | ok | plausibel | Cirkelbeweging niet afgebeeld |
| 106 | Med ball lunge overhead press | `fp_af3814ca735a1b07` | ok | plausibel |  |
| 107 | Med ball V-ups | `fp_45fd876f33ca5bd9` | ok | plausibel |  |
| 108 | Mob Hip flexion/extension | `fp_3f1dfb962741627a` | ok | plausibel |  |
| 109 | Mob Hip opener | `fp_99e1e9967d6d6cce` | ok | plausibel | Mat afgesneden aan de rand |
| 110 | Mob thoracaal | `fp_cd1a6657d1158157` | ok | plausibel | Mat afgesneden aan de rand |
| 111 | Mob adductoren | `fp_69601bcfcf25b2d7` | ok | plausibel | Mat afgesneden aan de rand |
| 112 | Adductoren stretch | `fp_4f11e7b699d13a42` | ok | plausibel |  |
| 113 | Mob lower back | `fp_37cafb9b8739b834` | ok | plausibel |  |
| 114 | Mob back cat/cow | `fp_fb18dd6c8b2b3a16` | ok | onzeker | Eén houding van een tweefasige beweging (kat/koe) |
| 115 | Mob back left/right | `fp_c0ed244cbd142ccd` | ok | plausibel |  |
| 116 | Mob Hip circles | `fp_1169ad7f2a3ea56c` | ok | plausibel | Cirkelbeweging niet afgebeeld |
| 117 | Gluteal stretch | `fp_793dbfaf2845eb08` | ok | plausibel |  |
| 118 | Hamstring stretch | `fp_31aecb8b4d9b172e` | ok | plausibel |  |
| 119 | Hamstring stretch one leg | `fp_da024ca505e981eb` | ok | plausibel |  |
| 120 | Quadriceps stretch | `fp_3265101a912475f3` | ok | plausibel |  |
| 121 | Back stretch | `fp_0fd67f9b622d7724` | ok | plausibel |  |
| 122 | Abs stretch | `fp_9798f76661bf3c67` | ok | plausibel |  |
| 123 | Seated side leans | `fp_4da50270005b421f` | ok | plausibel |  |
| 124 | Seated lat stretch | `fp_7e0445b070d4aa84` | ok | plausibel |  |
| 125 | Seated lumbar rotations | `fp_063e61e846384264` | ok | plausibel |  |
| 126 | Seated cat-cow | `fp_47ff49c27d46e275` | ok | plausibel | Eén houding (flexie) |
| 127 | Seated foreward reach | `fp_aea0bdac883b00f0` | ok | plausibel |  |
| 128 | Seated ankle rotations | `fp_16a477f3bf50b61c` | ok | plausibel |  |
| 129 | Seated calfs raises | `fp_074bfa82f6175277` | ok | onzeker | Hielen op de grond; de hielheffing zelf is niet afgebeeld |
| 130 | Seated knee lift | `fp_9da74a2655c001f9` | ok | plausibel |  |
| 131 | Seated leg extension | `fp_583a7b6ccf5e390b` | ok | plausibel |  |
| 132 | Seated band abduction | `fp_5c9bbb42568e066c` | ok | plausibel |  |
| 133 | Seated band leg curl | `fp_940a12dcf63225d8` | ok | plausibel |  |
| 134 | Seated hamstring stretch | `fp_0df1add1de9ff580` | ok | plausibel |  |
| 135 | Seated ab contractions | `fp_e367c9af96d7ae60` | ok | plausibel |  |
| 136 | Seated chair crunches | `fp_963efaf95eb9ea70` | ok | plausibel |  |
| 137 | Seated knee to elbow | `fp_92cd0d5fd88b53b7` | ok | plausibel |  |
| 138 | Seated chair squats | `fp_d288ca26f5c3c5b1` | ok | plausibel |  |
| 139 | Seated shoulder stretch | `fp_e6de47880afff3c3` | ok | plausibel |  |
| 140 | Seated shoulder roll | `fp_55f82056b64addb5` | ok | onzeker | Schouderrollen niet zichtbaar; neutrale zithouding |
| 141 | Seated arm circles | `fp_cf809350cb39e408` | ok | plausibel |  |
| 142 | Seated marching | `fp_992e4cd0badbf045` | ok | plausibel |  |
| 143 | Seated chest opener | `fp_01640004c8145a9a` | ok | plausibel |  |
| 144 | Standing chair leg curl | `fp_98820ba98a6ef8a4` | ok | plausibel |  |
| 145 | Seated cervical stretch | `fp_d4e49eb464ca42bc` | ok | plausibel |  |
| 146 | Seated ankle stretches | `fp_23208818a88487c7` | ok | plausibel |  |
| 147 | Seated leg press – resistance band | `fp_538a5caf7b161fb0` | ok | plausibel |  |
| 148 | Standing chair calfs raises | `fp_5d408b649789eb5c` | ok | onzeker | Hielen op de grond; de hielheffing zelf is niet afgebeeld |
| 149 | Standing chair heel/toe | `fp_03be7dd54cccd997` | ok | plausibel |  |
| 150 | Standing chair half squat | `fp_e718055869c6c0ab` | ok | plausibel |  |
| 151 | Standing chair abductie | `fp_5461e59354073db8` | ok | plausibel |  |
| 152 | Standing chair hip extension | `fp_514654a0d4181742` | ok | fout | Toont een knieheffing naar voren, geen heupextensie (lijkt verwisseld met 154) |
| 153 | Standing chair back leg raise | `fp_d5e159ca1d7436ac` | ok | plausibel |  |
| 154 | Standing chair knee lift | `fp_5319c4700561725d` | ok | fout | Toont het been naar achteren (heupextensie), geen knieheffing (lijkt verwisseld met 152) |
| 155 | One leg standing | `fp_14c75a700561d59f` | ok | plausibel |  |
| 156 | Standing chair shoulder rotations | `fp_4b99c5f11b42a30d` | ok | fout | Toont staan op één been met de hand op de stoel; geen schouderrotatie |
| 157 | Seated dumbell press up | `fp_08fffade39257e4f` | ok | plausibel |  |
| 158 | Seated biceps curl | `fp_5405dc499ab6f482` | ok | plausibel |  |
