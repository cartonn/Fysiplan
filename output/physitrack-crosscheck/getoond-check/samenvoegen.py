#!/usr/bin/env python3
"""Voegt getoond-check/out-*.jsonl samen tot ../tekening-hertoets.csv (oordeel over het beeld dat de app TOONT)."""
import csv, glob, json, os, collections
H = os.path.dirname(os.path.abspath(__file__))
KOL = ["nr", "naam", "groep", "getoond", "physitrack_url", "tekening_getoond", "oud_oordeel_bron", "opmerking"]
inv, rij = {}, {}
for f in sorted(glob.glob(os.path.join(H, "in-*.json"))):
    for x in json.load(open(f, encoding="utf-8")): inv[x["nr"]] = x
for f in sorted(glob.glob(os.path.join(H, "out-*.jsonl"))):
    for l in open(f, encoding="utf-8"):
        if l.strip(): r = json.loads(l); rij[int(r["nr"])] = r
oud = {int(r["nr"]): r["tekening_oordeel"] for r in csv.DictReader(open(os.path.join(H, "..", "resultaten.csv"), encoding="utf-8"))}
uit = []
for n in sorted(inv):
    x, r = inv[n], rij.get(n, {})
    uit.append({"nr": n, "naam": x["naam"], "groep": x["groep"], "getoond": x["getoond"], "physitrack_url": r.get("physitrack_url", x.get("physitrack_url", "")),
                "tekening_getoond": r.get("tekening_getoond", "NIET BEOORDEELD"), "oud_oordeel_bron": oud.get(n, ""), "opmerking": r.get("opmerking", "")})
with open(os.path.join(H, "..", "tekening-hertoets.csv"), "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=KOL); w.writeheader(); w.writerows(uit)
c = collections.Counter(u["tekening_getoond"] for u in uit); print(dict(c))
for k in ("fout", "afwijkend", "licht afwijkend"):
    print(k, [u["nr"] for u in uit if u["tekening_getoond"] == k])
print("bron zei ok/licht, getoond fout/afwijkend:", [u["nr"] for u in uit if u["tekening_getoond"] in ("fout", "afwijkend") and u["oud_oordeel_bron"] in ("ok", "licht afwijkend")])
print("bron zei fout/afwijkend, getoond ok:", [u["nr"] for u in uit if u["tekening_getoond"] == "ok" and u["oud_oordeel_bron"] in ("fout", "afwijkend")])
