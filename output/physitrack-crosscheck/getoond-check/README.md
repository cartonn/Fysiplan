# Hertoets getoonde tekeningen (8 nov)

Doel: de eerdere crosscheck (resultaten.csv) beoordeelde vaak de BRONtekening, terwijl de app via content/beginhouding-pijl.json
voor 310 oefeningen een pijl-v1-webp toont. Hier is het getoonde pijl-v1-beeld opnieuw tegen Physitrack en de uitleg gelegd.

Uitvoer: ../tekening-hertoets.csv (310 regels; kolom oud_oordeel_bron = oordeel uit resultaten.csv).

Uitkomst: ok 193, licht afwijkend 59, afwijkend 34, fout 17, geen Physitrack-match 7.

- fout: 13, 17, 27, 29, 31, 51, 56, 79, 92, 98, 105, 108, 161, 164, 197, 200, 201
- afwijkend: 1, 7, 15, 18, 24, 28, 30, 39, 43, 44, 50, 64, 65, 83, 88, 89, 91, 93, 101, 113, 114, 121, 129, 134, 137, 145, 170, 171, 183, 208, 525, 551, 552, 581
- bron was ok, getoond pijl-v1 fout/afwijkend (fout ontstaan bij de pijl-omzetting of eerder gemist): 45 oefeningen, zie samenvoegen.py-uitvoer
- bron was fout, getoond pijl-v1 ok: 45, 75, 107, 596

Kanttekening: een deel van de agents heeft oordeelt op beeld + uitleg + Physitrack-titel/eerder gevonden pagina zonder de pagina
opnieuw te openen. Bij 197 (Endy Beenstrekker) is onduidelijk of het apparaat leg extension of leg press is: navragen.
Licht afwijkend gaat meestal over pijlen (meer dan één, dubbel, verkeerde kant) en hoeft niet per se opnieuw.

Nieuwe herteken-lijst (pijl-v1-stijl): 129 line-v1 + 7 oude schetsen + de 51 pijl-v1 fout/afwijkend hierboven (incl. 525, 581).
