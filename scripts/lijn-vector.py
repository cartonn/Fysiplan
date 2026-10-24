#!/usr/bin/env python3
"""Lijn-vector: maakt van een kleurkaart (of van een AI-lijntekening) een strakke
vector-lijntekening in drukwerkkwaliteit.

Waarom: de oude lijnkaarten (lib/v2-line-art.js) zijn een Sobel-filter. Dat geeft
dubbele, rafelige randen en schaduwvlekken. Deze keten tekent zoals een illustrator:

  1. figuur   achtergrond scheiden (alles wat niet papierwit is), kleine gaten dicht,
              grote gaten (tussen bankpoten) blijven open
  2. contour  één dikke, gladde buitenlijn: potrace-vectoren, 5 px, ronde hoeken
  3. binnen   dunne lijnen uit drie bronnen, elk met een eigen reden:
              - XDoG op een randbewarend gladgestreken beeld: plooien en vormen
              - Canny op alléén de kleur (chroma): een arm vóór het shirt, schoen tegen
                broek; schaduw verandert alleen lichtheid en wordt dus geen lijn
              - kleine donkere details binnen de huid: ogen, wenkbrauwen, mond
              donkere vlakken (broek, haar) en spikkels vallen af
  4. vector   alle inkt via potrace naar gladde Bézier-paden -> SVG (drukwerk)
  5. raster   SVG 2x gerenderd, terug naar 800x1200, hard zwart-wit: voldoet aan
              dezelfde QA als analyzeBinaryLineArt (formaat, puur binair, dekking)
  6. logo     het Fysiplan-merkje strak in lijnwerk linksboven

Gebruik:
  python3 scripts/lijn-vector.py                       # proef: 12 oefeningen -> image-work/lijn-vector/
  python3 scripts/lijn-vector.py --alleen "Lunges"     # één oefening
  python3 scripts/lijn-vector.py --alle                # hele catalogus (proef-map)
  python3 scripts/lijn-vector.py --alle --publiceer    # overschrijft public/...-line-v1.png en zet de .svg ernaast

Vereisten: pip install -r scripts/requirements-lijn-vector.txt
"""
import argparse
import json
import sys
from pathlib import Path

import cairosvg
import cv2
import numpy as np
import potrace

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
CATALOGUS = PUBLIC / "oefeningen-v2.json"
PROEF = ROOT / "image-work" / "lijn-vector"
W, H = 800, 1200
INKT = "#000"

# het merkje van lijn-illustratie-graph.mjs, in dezelfde maat en plek
LOGO = """<g transform="translate(20 22)">
  <rect width="42" height="42" rx="10" fill="#000"/>
  <path d="M8 22h7l4-8 7 17 5-10h5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="52" y="31" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" fill="#000">Fysiplan</text>
</g>"""

PROEFSET = [
    "Chair squat", "Lunges", "Back extension", "Anteflexie armen", "Calf raises", "Glute bridges",
    "Bench press", "Abroller", "Front squat", "Leg press", "Dead lift", "Biceps curl",
]


def laad(path):
    im = cv2.imread(str(path))
    if im is None:
        raise SystemExit(f"Kan beeld niet lezen: {path}")
    im = cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)
    im[:72, :330] = 255  # logo-zone: het merkje komt er straks strak overheen
    return im


def figuur(im):
    lab = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.int16)
    afstand = (255 - lab[..., 0]) + np.abs(lab[..., 1] - 128) * 2 + np.abs(lab[..., 2] - 128) * 2
    m = (afstand > 18).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab_, st, _ = cv2.connectedComponentsWithStats(m)
    hou = np.zeros_like(m)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 400:
            hou[lab_ == i] = 1
    buiten = hou.copy()
    cv2.floodFill(buiten, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 1)
    gaten = (1 - buiten).astype(np.uint8)
    n, lab_, st, _ = cv2.connectedComponentsWithStats(gaten)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 900:
            hou[lab_ == i] = 1
    return hou


def xdog(grijs, sigma=1.3, k=1.6, p=22.0, phi=10.0):
    g = grijs.astype(np.float32) / 255.0
    d = (1 + p) * cv2.GaussianBlur(g, (0, 0), sigma) - p * cv2.GaussianBlur(g, (0, 0), sigma * k)
    return np.where(d >= 0, 1.0, 1.0 + np.tanh(phi * d))


def binnenlijnen(im, fg):
    glad = im.copy()
    for _ in range(3):
        glad = cv2.bilateralFilter(glad, 9, 30, 6)
    grijs = cv2.cvtColor(glad, cv2.COLOR_BGR2GRAY)
    binnen = cv2.erode(fg, np.ones((13, 13), np.uint8)) > 0
    inkt = ((xdog(grijs) < 0.55) & binnen).astype(np.uint8)
    # vlakken zijn geen lijnen: wat een 7x7-opening overleeft is broek of haar
    inkt[cv2.morphologyEx(inkt, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)) > 0] = 0

    lab = cv2.cvtColor(glad, cv2.COLOR_BGR2LAB)
    chroma = cv2.GaussianBlur(cv2.addWeighted(lab[..., 1], 2.0, lab[..., 2], 1.2, -200), (0, 0), 1.6)
    kleurrand = cv2.dilate(cv2.Canny(chroma, 18, 40), np.ones((2, 2), np.uint8)) > 0
    inkt[kleurrand & (cv2.erode(fg, np.ones((11, 11), np.uint8)) > 0)] = 1

    huid = ((lab[..., 1] > 137) & (lab[..., 2] > 135) & (lab[..., 0] > 120)).astype(np.uint8)
    huid = cv2.morphologyEx(huid, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    g0 = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    detail = (((cv2.GaussianBlur(g0, (0, 0), 6) - g0) > 26) & (huid > 0)).astype(np.uint8)
    detail = cv2.morphologyEx(detail, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lab_, st, _ = cv2.connectedComponentsWithStats(detail)
    for i in range(1, n):
        if 6 <= st[i, cv2.CC_STAT_AREA] <= 140:
            inkt[lab_ == i] = 1

    n, lab_, st, _ = cv2.connectedComponentsWithStats(inkt, connectivity=8)
    for i in range(1, n):
        if max(st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT]) < 25 and st[i, cv2.CC_STAT_AREA] < 70:
            inkt[lab_ == i] = 0
    return inkt


def paden(masker, turd, alpha):
    # potracer tekent de onware pixels als inkt, vandaar de inversie
    curves = potrace.Bitmap(~masker.astype(bool)).trace(
        turdsize=turd, alphamax=alpha, opticurve=True, opttolerance=0.4)
    d = []
    for c in curves:
        s = c.start_point
        d.append(f"M{s.x:.1f},{s.y:.1f}")
        for seg in c.segments:
            e = seg.end_point
            if seg.is_corner:
                d.append(f"L{seg.c.x:.1f},{seg.c.y:.1f}L{e.x:.1f},{e.y:.1f}")
            else:
                d.append(f"C{seg.c1.x:.1f},{seg.c1.y:.1f} {seg.c2.x:.1f},{seg.c2.y:.1f} {e.x:.1f},{e.y:.1f}")
        d.append("Z")
    return "".join(d)


def svg_voor(bron, contour=5.0):
    im = laad(bron)
    fg = figuur(im)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<rect width="{W}" height="{H}" fill="#fff"/>
<path d="{paden(binnenlijnen(im, fg), 25, 1.25)}" fill="{INKT}"/>
<path d="{paden(fg, 60, 1.2)}" fill="none" stroke="{INKT}" stroke-width="{contour}" stroke-linejoin="round" stroke-linecap="round"/>
{LOGO}
</svg>"""


def png_uit_svg(svg, doel):
    groot = cairosvg.svg2png(bytestring=svg.encode(), output_width=W * 2, output_height=H * 2)
    im = cv2.imdecode(np.frombuffer(groot, np.uint8), cv2.IMREAD_GRAYSCALE)
    klein = cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)
    binair = np.where(klein < 150, 0, 255).astype(np.uint8)
    zwart = float((binair == 0).mean())
    if not 0.002 <= zwart <= 0.25:
        raise RuntimeError(f"Onwaarschijnlijke zwarte-lijndekking {zwart:.4f} voor {doel}")
    cv2.imwrite(str(doel), binair, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    return zwart


def lijnpad(kaart_img):
    stam = kaart_img.rsplit(".", 1)[0]
    if "-avatar-v" in stam:
        stam = stam[: stam.rindex("-avatar-v")]
    return stam + "-line-v1.png"


def contactvel(rijen, doel):
    tegels = []
    for kleur, lijn in rijen:
        a = cv2.resize(cv2.imread(str(kleur)), (300, 450), interpolation=cv2.INTER_AREA)
        b = cv2.resize(cv2.imread(str(lijn)), (300, 450), interpolation=cv2.INTER_AREA)
        tegels.append(np.hstack([a, b, np.full((450, 12, 3), 235, np.uint8)]))
    per_rij = 3
    while len(tegels) % per_rij:
        tegels.append(np.full_like(tegels[0], 255))
    vel = np.vstack([np.hstack(tegels[i:i + per_rij]) for i in range(0, len(tegels), per_rij)])
    cv2.imwrite(str(doel), vel)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--alleen", help="naam van één oefening")
    ap.add_argument("--alle", action="store_true", help="hele catalogus in plaats van de proefset")
    ap.add_argument("--publiceer", action="store_true", help="schrijf naar public/ (overschrijft -line-v1.png)")
    a = ap.parse_args()

    catalogus = json.loads(CATALOGUS.read_text(encoding="utf8"))
    if a.alleen:
        keuze = [o for o in catalogus if o["naam"] == a.alleen]
    elif a.alle:
        keuze = catalogus
    else:
        per_naam = {o["naam"]: o for o in catalogus}
        keuze = [per_naam[n] for n in PROEFSET if n in per_naam]
    keuze = [o for o in keuze if o.get("kaartImg") and (PUBLIC / o["kaartImg"]).exists()]
    if not keuze:
        raise SystemExit("Geen oefeningen met een kleurkaart gevonden")

    PROEF.mkdir(parents=True, exist_ok=True)
    rijen, fouten = [], 0
    for o in keuze:
        bron = PUBLIC / o["kaartImg"]
        try:
            svg = svg_voor(bron)
            if a.publiceer:
                png = PUBLIC / lijnpad(o["kaartImg"])
            else:
                png = PROEF / (Path(lijnpad(o["kaartImg"])).stem + ".png")
            png.with_suffix(".svg").write_text(svg, encoding="utf8")
            zwart = png_uit_svg(svg, png)
            rijen.append((bron, png))
            print(f"ok   {o['naam']:<40} dekking {zwart:.3f}  -> {png.relative_to(ROOT)}")
        except Exception as fout:  # één slechte kaart mag de rest niet tegenhouden
            fouten += 1
            print(f"FOUT {o['naam']:<40} {fout}", file=sys.stderr)
    if rijen and not a.publiceer:
        contactvel(rijen[:24], PROEF / "contactvel.png")
        print(f"contactvel: {(PROEF / 'contactvel.png').relative_to(ROOT)}")
    print(f"{len(rijen)} gelukt, {fouten} mislukt")
    return 1 if fouten else 0


if __name__ == "__main__":
    sys.exit(main())
