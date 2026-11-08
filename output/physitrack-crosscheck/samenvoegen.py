#!/usr/bin/env python3
"""Voegt batches/out-*.jsonl samen tot resultaten.csv en opnieuw-maken.md."""
import csv, glob, json, os, collections

HIER = os.path.dirname(os.path.abspath(__file__))
KOL = ["nr", "naam", "groep", "set", "physitrack_url", "physitrack_titel", "uitleg_oordeel",
       "tekening_oordeel", "avatar_oordeel", "video", "video_oordeel", "nieuwe_uitleg", "opmerking"]
SLECHT = {"afwijkend", "fout"}

rijen = {}
for f in sorted(glob.glob(os.path.join(HIER, "batches", "out-*.jsonl"))):
    for l in open(f, encoding="utf-8"):
        l = l.strip()
        if not l:
            continue
        r = json.loads(l)
        rijen[int(r["nr"])] = {k: ("" if r.get(k) is None else r.get(k)) for k in KOL}

# volgorde van de werklijst aanhouden
volgorde = []
for f in sorted(glob.glob(os.path.join(HIER, "batches", "in-*.json"))):
    volgorde += [x["nr"] for x in json.load(open(f, encoding="utf-8"))]
lijst = [rijen[n] for n in volgorde if n in rijen]

with open(os.path.join(HIER, "resultaten.csv"), "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=KOL)
    w.writeheader()
    w.writerows(lijst)

# opnieuw-maken.md
regels = {"Tekeningen": [], "Avatars": [], "Video's": []}
for r in lijst:
    o = r["opmerking"] or "zie resultaten.csv"
    if r["tekening_oordeel"] in SLECHT:
        regels["Tekeningen"].append(r)
    if r["avatar_oordeel"] in SLECHT:
        regels["Avatars"].append(r)
    if r["video"] == "ja" and r["video_oordeel"] in SLECHT:
        regels["Video's"].append(r)

md = ["# Opnieuw maken na Physitrack-crosscheck", "",
      f"Stand: {len(lijst)} van {len(volgorde)} oefeningen gecontroleerd. "
      "Bron per regel: resultaten.csv (oordeel `afwijkend` of `fout`). De lijntekening wint bij conflict; "
      "een avatar of video die afwijkt wordt opnieuw gemaakt nadat de tekening klopt.", "",
      "## Bekend vooraf", "",
      "- **600 One leg standing / 601 Standing chair shoulder rotations**: gemeld als 'elkaars tekening en avatar'. "
      "Gecontroleerd op origin/main (8 nov): de BESTANDSNAMEN zijn verwisseld (600 wijst naar standing-chair-shoulder-rotations-*, "
      "601 naar one-leg-standing-*), maar de beelden zelf horen nu wel bij de juiste oefening. De tekeningen kloppen dus. "
      "Wel opnieuw: avatar 601 (staat op één been met het andere opgetrokken; moet op twee benen staan met de armen in goalpost-houding). "
      "Aanrader: bestanden hernoemen zodat naam en inhoud gelijk zijn (zelfde situatie bij 597/599 hip extension / knee lift).", ""]
for kop, rs in regels.items():
    md += [f"## {kop} ({len(rs)})", ""]
    per_groep = collections.defaultdict(list)
    for r in rs:
        per_groep[r["groep"]].append(r)
    for g in sorted(per_groep):
        md += [f"### {g}", ""]
        for r in per_groep[g]:
            sleutel = {"Tekeningen": "tekening_oordeel", "Avatars": "avatar_oordeel", "Video's": "video_oordeel"}[kop]
            md.append(f"- **{r['nr']} {r['naam']}** ({r[sleutel]}): {r['opmerking'] or 'zie resultaten.csv'}")
        md.append("")
open(os.path.join(HIER, "opnieuw-maken.md"), "w", encoding="utf-8").write("\n".join(md))

# samenvatting
tel = {k: collections.Counter(r[k] for r in lijst if r[k]) for k in
       ("uitleg_oordeel", "tekening_oordeel", "avatar_oordeel", "video_oordeel")}
for k, c in tel.items():
    print(k, dict(c))
print("herschreven uitleggen:", sum(1 for r in lijst if r["nieuwe_uitleg"].strip()))
print("opnieuw: tekeningen", len(regels["Tekeningen"]), "avatars", len(regels["Avatars"]), "video's", len(regels["Video's"]))
print("klaar:", len(lijst), "/", len(volgorde))
