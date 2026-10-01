#!/usr/bin/env python3
"""Hertekent alle V2-lijnkaarten (`*-line-v1.png`) tot schone, passende tekeningen.

Twee bronnen, één opmaakstap:

* **Contourkaarten** (de oude Sobel-randdetectie, herkenbaar aan het verminkte
  logo linksboven) worden volledig opnieuw getekend vanuit de kleurkaart
  (`*-avatar-v*.jpg`): voorgrondmasker -> vloeiend gesilhouet (zwaardere
  buitenlijn) + gefilterde binnenlijnen (Canny op een randbewarend gefilterde
  foto, geskeletteerd, gevectoriseerd, korte snippers en ruis weg,
  Gauss-gladgestreken). Rond het gezicht wordt agressiever gefilterd zodat er
  een rustig, vriendelijk gezicht overblijft in plaats van een grimas.
* **Illustraties** (al echt getekend, maar in wisselende formaten) houden hun
  lijnwerk; alleen de opmaak verandert.

Opmaak (beide): het logo verdwijnt, de inhoud wordt in losse panelen geknipt
(figuren/houdingen die door witruimte gescheiden zijn), en de indeling die de
figuren het grootst in het staande 2:3-vakje laat passen wint: origineel,
onder elkaar, of een raster. Alle panelen krijgen dezelfde schaal, zodat twee of
drie personen of een persoon met machine even groot blijven ten opzichte van
elkaar. Lijnen worden pas na het schalen getekend (4x supersampling,
antialiasing), dus elke kaart heeft exact dezelfde lijndikte.

Gebruik:
  npm run images:lijnkaarten                      # alles in place (idempotent)
  python3 scripts/lijnkaarten-hertekenen.py --only roeier --out /tmp/proef
  python3 scripts/lijnkaarten-hertekenen.py --kleur x-avatar-v8.jpg --naar x-line-v1.png
  python3 scripts/lijnkaarten-hertekenen.py --illustratie gegenereerd.png --naar x-line-v1.png

Het rapport content/lijnkaarten-herteken-rapport.json legt per kaart vast hoe
hij gemaakt is (en de sha256), zodat een volgende run hertekende kaarten
opnieuw uit kleur tekent maar opgemaakte illustraties niet nogmaals schaalt.

Afhankelijkheden: scripts/requirements-lijnkaarten.txt
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

# eindformaat = het vakje op de oefenkaart (2:3 staand), gelijk aan lib/v2-line-art.js
OUT_W, OUT_H = 800, 1200
MARGIN = 0.055            # witrand rondom, als fractie van de breedte
PANEL_GAP = 0.06          # ruimte tussen herschikte panelen, fractie van de breedte
SS = 4                    # supersampling voor antialiasing
OUTER_W = 3.6             # lijndikte silhouet (px in eindformaat)
INNER_W = 2.2             # lijndikte binnenlijnen
FACE_W = 2.0              # lijndikte gezichtslijnen
REARRANGE_GAIN = 1.12
ILLUSTRATION_MIN_W = 1.9  # minimale lijndikte van illustraties na schalen
EDGE_LO, EDGE_HI = 80, 200
MS_SPATIAL, MS_COLOR = 6, 16
MIN_INNER = 26
MIN_CANNY = 34
MIN_SPUR = 7
DARK_L = 110     # herschik alleen als figuren minstens 12% groter worden


# ---------------------------------------------------------------- helpers

def read_rgb(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"kan {path} niet lezen")
    return image


def logo_zone(shape) -> tuple[int, int]:
    h, w = shape[:2]
    return int(w * 0.25), int(h * 0.065)


def drop_logo(mask: np.ndarray) -> np.ndarray:
    """Verwijdert componenten die volledig in de logozone linksboven liggen."""
    zx, zy = logo_zone(mask.shape)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    out = mask.copy()
    for i in range(1, count):
        x, y, w, h, _ = stats[i]
        if x + w <= zx and y + h <= zy:
            out[labels == i] = 0
    return out


def remove_small(mask: np.ndarray, min_area: int) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    keep = np.zeros(count, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
    return keep[labels]


def fill_holes(mask: np.ndarray) -> np.ndarray:
    m = mask.astype(np.uint8) * 255
    h, w = m.shape
    flood = np.pad(m, 1)
    ff = flood.copy()
    cv2.floodFill(ff, None, (0, 0), 255)
    holes = ff[1:-1, 1:-1] == 0
    # alleen kleine gaten dichten: grote gaten (tussen arm en romp, onder een
    # zittende knie) zijn echte achtergrond en moeten als lijn zichtbaar blijven
    count, labels, stats, _ = cv2.connectedComponentsWithStats(holes.astype(np.uint8), 8)
    small = np.zeros(count, bool)
    small[1:] = stats[1:, cv2.CC_STAT_AREA] < (h * w) * 0.00004
    return mask | small[labels]


# ---------------------------------------------------------------- tracing

NEIGHBOURS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def trace_skeleton(skel: np.ndarray) -> list[np.ndarray]:
    """Zet een 1px-skelet om in polylijnen (x, y), gesplitst op knooppunten."""
    ys, xs = np.nonzero(skel)
    pixels = set(zip(ys.tolist(), xs.tolist()))
    if not pixels:
        return []

    def nbrs(p):
        y, x = p
        return [(y + dy, x + dx) for dy, dx in NEIGHBOURS if (y + dy, x + dx) in pixels]

    degree = {p: len(nbrs(p)) for p in pixels}
    visited_edges: set[tuple] = set()
    paths: list[np.ndarray] = []

    def edge_key(a, b):
        return (a, b) if a < b else (b, a)

    def walk(start, nxt):
        path = [start, nxt]
        visited_edges.add(edge_key(start, nxt))
        prev, cur = start, nxt
        while degree[cur] == 2:
            options = [n for n in nbrs(cur) if n != prev and edge_key(cur, n) not in visited_edges]
            if not options:
                break
            nxt = options[0]
            visited_edges.add(edge_key(cur, nxt))
            path.append(nxt)
            prev, cur = cur, nxt
        return path

    nodes = [p for p in pixels if degree[p] != 2]
    for node in nodes:
        for n in nbrs(node):
            if edge_key(node, n) in visited_edges:
                continue
            paths.append(np.array([(x, y) for y, x in walk(node, n)], float))
    # resterende gesloten lussen
    for p in pixels:
        for n in nbrs(p):
            if edge_key(p, n) not in visited_edges:
                paths.append(np.array([(x, y) for y, x in walk(p, n)], float))
    return paths


def path_length(path: np.ndarray) -> float:
    if len(path) < 2:
        return 0.0
    return float(np.sum(np.hypot(*np.diff(path, axis=0).T)))


def resample(path: np.ndarray, step: float) -> np.ndarray:
    seg = np.hypot(*np.diff(path, axis=0).T)
    dist = np.concatenate([[0], np.cumsum(seg)])
    if dist[-1] < step:
        return path
    samples = np.arange(0, dist[-1], step)
    samples = np.append(samples, dist[-1])
    return np.stack([np.interp(samples, dist, path[:, 0]), np.interp(samples, dist, path[:, 1])], 1)


def smooth(path: np.ndarray, sigma: float, closed: bool) -> np.ndarray:
    if len(path) < 5 or sigma <= 0:
        return path
    radius = int(math.ceil(sigma * 3))
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    mode = "wrap" if closed else "edge"
    padded = np.pad(path, ((radius, radius), (0, 0)), mode=mode)
    out = np.stack([np.convolve(padded[:, i], kernel, mode="valid") for i in range(2)], 1)
    if not closed:
        out[0], out[-1] = path[0], path[-1]
    return out


# ---------------------------------------------------------------- drawing model

@dataclass
class Stroke:
    points: np.ndarray       # broncoördinaten
    width: float             # eindpixels
    closed: bool = False


@dataclass
class Drawing:
    width: int
    height: int
    panel_mask: np.ndarray            # alle inkt/figuur (voor uitsnedes)
    split_mask: np.ndarray            # idem zonder vloerlijnen (voor het knippen in panelen)
    strokes: list[Stroke] = field(default_factory=list)
    raster: np.ndarray | None = None  # inkt 0..1 (illustraties)
    stroke_width: float = 0.0         # mediane lijndikte van de illustratie (bronpx)
    kind: str = ""


def detect_faces(gray: np.ndarray) -> list[tuple[int, int, int, int]]:
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    profile = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
    faces = list(cascade.detectMultiScale(gray, 1.08, 5, minSize=(24, 24)))
    faces += list(profile.detectMultiScale(gray, 1.08, 5, minSize=(24, 24)))
    faces += [(gray.shape[1] - x - w, y, w, h) for x, y, w, h in
              profile.detectMultiScale(cv2.flip(gray, 1), 1.08, 5, minSize=(24, 24))]
    return [tuple(map(int, f)) for f in faces]


def mask_boundary_runs(mask: np.ndarray, allowed: np.ndarray, min_len: float) -> list[np.ndarray]:
    """Gladde grenslijnen van een materiaalmasker, alleen de stukken binnen `allowed`."""
    h, w = mask.shape
    m = remove_small(mask, int(h * w * 0.0003))
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # glimlichtjes en gaatjes binnen een vlak zijn geen vorm: dichtmaken
    m = ~remove_small(~m.astype(bool), int(h * w * 0.0006))
    m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2.0) > 0.5
    contours, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    runs = []
    for contour in contours:
        pts = contour[:, 0, :].astype(float)
        if len(pts) < 10:
            continue
        pts = smooth(resample(np.vstack([pts, pts[:1]]), 1.5), 2.4, closed=True)
        xi = np.clip(np.round(pts[:, 0]).astype(int), 0, w - 1)
        yi = np.clip(np.round(pts[:, 1]).astype(int), 0, h - 1)
        ok = allowed[yi, xi]
        if ok.all():
            runs.append(pts)
            continue
        # splits in aaneengesloten stukken binnen het toegestane gebied
        start = None
        for i, flag in enumerate(np.append(ok, False)):
            if flag and start is None:
                start = i
            elif not flag and start is not None:
                run = pts[start:i]
                if path_length(run) >= min_len:
                    runs.append(run)
                start = None
    return [r for r in runs if path_length(r) >= min_len]


def face_strokes(lab: np.ndarray, fg: np.ndarray, face) -> list[Stroke]:
    """Eenvoudig, vriendelijk gezicht: twee ooggestippen en een glimlach.

    De gelaatstrekken worden in de foto gezocht (donkere vlekjes t.o.v. de
    huid), niet geraden; wat niet overtuigend gevonden wordt, wordt niet
    getekend. Een leeg, rustig gezicht is altijd beter dan een grimas.
    """
    x, y, fw, fh = face
    h, w = fg.shape
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(w, x + fw), min(h, y + fh)
    L = lab[y0:y1, x0:x1, 0].astype(np.float32)
    A = lab[y0:y1, x0:x1, 1].astype(np.float32)
    region = np.zeros_like(L, bool)
    cv2.ellipse(region.view(np.uint8), (int(fw / 2), int(fh * 0.55)), (int(fw * 0.34), int(fh * 0.38)), 0, 0, 360, 1, -1)
    if region.sum() < 50:
        return []
    skin = np.median(L[region])
    strokes: list[Stroke] = []

    # ogen: donkerste compacte vlekjes in de bovenste helft, links en rechts
    dark = (L < skin - 38) & region
    dark = cv2.morphologyEx(dark.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    count, labels, stats, cents = cv2.connectedComponentsWithStats(dark, 8)
    eyes = []
    for i in range(1, count):
        cx, cy = cents[i]
        area = stats[i, cv2.CC_STAT_AREA]
        if fh * 0.30 < cy < fh * 0.58 and fw * 0.0004 * fw < area < fw * fw * 0.02:
            eyes.append((area, cx, cy))
    left = [e for e in eyes if e[1] < fw * 0.5]
    right = [e for e in eyes if e[1] >= fw * 0.5]
    radius = max(1.6, fw * 0.028)
    if left and right:
        le, re_ = max(left), max(right)
        if abs(le[2] - re_[2]) < fh * 0.09 and fw * 0.22 < re_[1] - le[1] < fw * 0.6:
            for _, cx, cy in (le, re_):
                t = np.linspace(0, 2 * np.pi, 16)
                pts = np.stack([x0 + cx + np.cos(t) * radius * 0.45, y0 + cy + np.sin(t) * radius * 0.45], 1)
                strokes.append(Stroke(pts, radius * 1.3, closed=True))
            # glimlach: rood/donker gebied onder de ogen
            eye_y = (le[2] + re_[2]) / 2
            mid_x = (le[1] + re_[1]) / 2
            span = (re_[1] - le[1])
            mouth = ((A > np.median(A[region]) + 9) | (L < skin - 30)) & region
            ys, xs = np.nonzero(mouth)
            sel = (ys > eye_y + span * 0.55) & (ys < eye_y + span * 1.25) & (np.abs(xs - mid_x) < span * 0.55)
            if sel.sum() > 6:
                mx0, mx1 = np.percentile(xs[sel], [8, 92])
                my = np.percentile(ys[sel], 50)
                half = max((mx1 - mx0) / 2, span * 0.22)
                cxm = (mx0 + mx1) / 2
                t = np.linspace(-1, 1, 24)
                pts = np.stack([x0 + cxm + t * half, y0 + my + (1 - t ** 2) * half * 0.28 - half * 0.08], 1)
                strokes.append(Stroke(pts, FACE_W))
    return strokes


def redraw_from_color(color_path: Path) -> Drawing:
    bgr = read_rgb(color_path)
    h, w = bgr.shape[:2]
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[..., 0] * (100 / 255)
    a = lab[..., 1] - 128
    b = lab[..., 2] - 128
    delta_white = np.sqrt((100 - L) ** 2 + a ** 2 + b ** 2)

    # voorgrond: alles wat merkbaar van papierwit afwijkt
    fg = delta_white > 4.5
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool)
    fg = drop_logo(fg)
    fg = remove_small(fg, int(h * w * 0.00006))
    fg = fill_holes(fg)
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
    fg = remove_small(fg, int(h * w * 0.00006))

    strokes: list[Stroke] = []

    # silhouet: buitencontouren en grote gaten
    smooth_mask = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 1.6) > 0.5
    contours, hierarchy = cv2.findContours(smooth_mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    for contour in contours:
        pts = contour[:, 0, :].astype(float)
        if len(pts) < 12 or abs(cv2.contourArea(contour)) < h * w * 0.00004:
            continue
        pts = smooth(resample(np.vstack([pts, pts[:1]]), 1.5), 2.2, closed=True)
        strokes.append(Stroke(pts, OUTER_W, closed=True))

    # binnenlijnen: mean-shift maakt van de foto vlakke kleurvlakken (stof-
    # textuur en zachte schaduw verdwijnen, echte randen blijven scherp); daarna
    # een kleur-Canny: per pixel telt het Lab-kanaal met de grootste gradiënt
    filtered = cv2.pyrMeanShiftFiltering(bgr, MS_SPATIAL, MS_COLOR, maxLevel=1)
    filtered = cv2.bilateralFilter(filtered, 7, 30, 5)
    flab = cv2.cvtColor(filtered, cv2.COLOR_BGR2LAB)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    # helderheid apart: zonder mean-shift (die smelt donkere broek en zwarte
    # machine samen), met gamma-lift zodat verschillen in het donker even
    # zwaar tellen als in het licht, plus lokale contrastversterking
    soft = bgr
    for _ in range(3):
        soft = cv2.bilateralFilter(soft, 9, 25, 5)
    raw_l = cv2.cvtColor(soft, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32) / 255
    lifted = (np.power(raw_l, 0.45) * 255).astype(np.uint8)
    lum = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 12)).apply(lifted)
    channels = [lum.astype(np.float32), flab[..., 1].astype(np.float32) * 1.6, flab[..., 2].astype(np.float32) * 1.6]
    gx = np.stack([cv2.Sobel(c, cv2.CV_32F, 1, 0, ksize=3) for c in channels])
    gy = np.stack([cv2.Sobel(c, cv2.CV_32F, 0, 1, ksize=3) for c in channels])
    pick = np.argmax(gx ** 2 + gy ** 2, axis=0)[None]
    dx = np.take_along_axis(gx, pick, 0)[0]
    dy = np.take_along_axis(gy, pick, 0)[0]
    edges = cv2.Canny(np.clip(dx, -32767, 32767).astype(np.int16), np.clip(dy, -32767, 32767).astype(np.int16),
                      EDGE_LO, EDGE_HI, L2gradient=True) > 0

    faces = detect_faces(gray)
    face_mask = np.zeros((h, w), np.uint8)
    for x, y, fw, fh in faces:
        cv2.ellipse(face_mask, (int(x + fw / 2), int(y + fh * 0.55)),
                    (int(fw * 0.36), int(fh * 0.40)), 0, 0, 360, 1, -1)
    face_mask = face_mask.astype(bool) & fg

    inner = cv2.erode(smooth_mask.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)

    # materiaalgrenzen: huid tegen kleding en donkere stof/apparaat tegen licht
    # zijn de lijnen die een illustrator tekent (arm over romp, hals, broekzoom)
    fl = flab.astype(np.int16)
    skin = (fl[..., 1] > 136) & (fl[..., 2] > 136) & (fl[..., 0] > 70) & fg
    chroma = np.hypot(fl[..., 1] - 128, fl[..., 2] - 128)
    dark = (fl[..., 0] < DARK_L) & (chroma < 11) & fg
    occupied = np.zeros((h, w), np.uint8)
    for material in (skin, dark):
        for pts in mask_boundary_runs(material, inner & ~face_mask, MIN_INNER):
            strokes.append(Stroke(pts, INNER_W))
            cv2.polylines(occupied, [np.round(pts).astype(np.int32).reshape(-1, 1, 2)], False, 1, 9)

    # overige randen (plooien, overlappende ledematen) uit de kleur-Canny,
    # behalve waar al een materiaalgrens of het silhouet ligt
    edges &= ~face_mask & inner & ~occupied.astype(bool)
    edges = cv2.dilate(edges.astype(np.uint8), np.ones((2, 2), np.uint8)).astype(bool)
    skel = skeletonize(edges)
    # lengte per samenhangende lijn, niet per stukje tussen twee kruispunten:
    # anders valt een drukke maar echte contour (been tegen machine) in snippers weg
    count, labels, stats, _ = cv2.connectedComponentsWithStats(skel.astype(np.uint8), 8)
    keep = np.zeros(count, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= MIN_CANNY
    skel = keep[labels]

    for path in trace_skeleton(skel):
        if len(path) < 3 or path_length(path) < MIN_SPUR:
            continue
        strokes.append(Stroke(smooth(resample(path, 1.5), 2.6, closed=False), INNER_W))

    for face in faces:
        strokes.extend(face_strokes(lab, fg, face))

    return Drawing(w, h, fg, ignore_floor_lines(fg), strokes=strokes, kind="hertekend")


def load_illustration(line_path: Path) -> Drawing:
    gray = cv2.imread(str(line_path), cv2.IMREAD_GRAYSCALE)
    h, w = gray.shape
    ink = 1.0 - gray.astype(np.float32) / 255.0
    ink[ink < 0.06] = 0           # papierruis weg, papier blijft zuiver wit
    solid = ink > 0.25
    solid = drop_logo(solid)
    solid = remove_small(solid, 6)
    ink = np.where(cv2.dilate(solid.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0, ink, 0)
    # randen van de bronafbeelding (lijstjes, scanranden) negeren
    border = max(2, int(min(h, w) * 0.006))
    ink[:border], ink[-border:], ink[:, :border], ink[:, -border:] = 0, 0, 0, 0
    solid = ink > 0.25
    grow = np.ones((9, 9), np.uint8)
    panel = cv2.dilate(solid.astype(np.uint8), grow).astype(bool)
    split = cv2.dilate(ignore_floor_lines(solid).astype(np.uint8), grow).astype(bool)
    core = ink > 0.5
    dist = cv2.distanceTransform(core.astype(np.uint8), cv2.DIST_L2, 3)
    ridge = skeletonize(core)
    width = float(np.median(dist[ridge]) * 2) if ridge.any() else 2.0
    return Drawing(w, h, panel, split, raster=ink, stroke_width=width, kind="illustratie")


# ---------------------------------------------------------------- layout

def bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def split_axis(mask: np.ndarray, box, axis: int, min_gap: int) -> list[tuple[int, int, int, int]]:
    """Knipt box langs een as op witte stroken van minstens min_gap px."""
    x0, y0, x1, y1 = box
    sub = mask[y0:y1, x0:x1]
    profile = sub.any(axis=0 if axis == 0 else 1)
    runs, start, gap = [], None, 0
    for i, filled in enumerate(profile):
        if filled:
            if start is None:
                start = i
            elif gap >= min_gap:
                runs.append((start, last + 1))
                start = i
            gap, last = 0, i
        else:
            gap += 1
    if start is not None:
        runs.append((start, last + 1))
    out = []
    for a, b in runs:
        if axis == 0:
            piece = mask[y0:y1, x0 + a:x0 + b]
            bb = bbox(piece)
            out.append((x0 + a, y0 + bb[1], x0 + a + (bb[2]), y0 + bb[3]) if bb else (x0 + a, y0, x0 + b, y1))
        else:
            piece = mask[y0 + a:y0 + b, x0:x1]
            bb = bbox(piece)
            out.append((x0 + bb[0], y0 + a, x0 + bb[2], y0 + a + bb[3]) if bb else (x0, y0 + a, x1, y0 + b))
    return out


def ignore_floor_lines(mask: np.ndarray) -> np.ndarray:
    """Lange dunne horizontale lijnen (vloer) verbinden panelen niet echt."""
    h, w = mask.shape
    m = mask.astype(np.uint8)
    horizontal = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (int(w * 0.25), 1)))
    thick = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((max(3, h // 120), 1), np.uint8))
    floor = (horizontal > 0) & ~(thick > 0)
    return mask & ~floor


@dataclass
class Placement:
    src: tuple[int, int, int, int]
    scale: float
    dx: float   # eindcoordinaat = src * scale + (dx, dy)
    dy: float
    region: np.ndarray | None = None  # bronpixels die bij dit paneel horen (overlappende panelen)


def layout(drawing: Drawing, allow_rearrange: bool = True) -> tuple[list[Placement], str]:
    mask = drawing.panel_mask
    whole = bbox(mask)
    if whole is None:
        raise RuntimeError("lege tekening")
    margin = OUT_W * MARGIN
    avail_w, avail_h = OUT_W - 2 * margin, OUT_H - 2 * margin
    gap = OUT_W * PANEL_GAP
    min_gap = max(6, int(max(drawing.width, drawing.height) * 0.012))

    candidates = []

    def place_grid(panels, cols, name, regions=None):
        regions = regions or [None] * len(panels)
        region_of = {id(p): r for p, r in zip(panels, regions)}
        rows = [panels[i:i + cols] for i in range(0, len(panels), cols)]
        # gelijke schaal voor alle panelen
        row_w = [sum(p[2] - p[0] for p in row) for row in rows]
        row_h = [max(p[3] - p[1] for p in row) for row in rows]
        def fits(scale):
            total_h = sum(rh * scale for rh in row_h) + gap * (len(rows) - 1)
            widest = max(rw * scale + gap * (len(row) - 1) for rw, row in zip(row_w, rows))
            return total_h <= avail_h + 1e-6 and widest <= avail_w + 1e-6
        scale = min(
            (avail_h - gap * (len(rows) - 1)) / sum(row_h),
            min((avail_w - gap * (len(row) - 1)) / rw for rw, row in zip(row_w, rows)),
        )
        if scale <= 0 or not fits(scale):
            return
        placements = []
        total_h = sum(rh * scale for rh in row_h) + gap * (len(rows) - 1)
        y = margin + (avail_h - total_h) / 2
        for row, rw, rh in zip(rows, row_w, row_h):
            x = margin + (avail_w - (rw * scale + gap * (len(row) - 1))) / 2
            for p in row:
                pw, ph = (p[2] - p[0]) * scale, (p[3] - p[1]) * scale
                # binnen een rij op de onderkant uitlijnen: figuren staan op dezelfde vloer
                placements.append(Placement(p, scale, x - p[0] * scale, y + (rh * scale - ph) - p[1] * scale, region_of[id(p)]))
                x += pw + gap
            y += rh * scale + gap
        candidates.append((scale, name, placements))

    place_grid([whole], 1, "origineel")
    original_scale = candidates[0][0]
    if not allow_rearrange:
        return candidates[0][2], candidates[0][1]

    split_mask = drawing.split_mask
    cols = split_axis(split_mask, whole, 0, min_gap)
    cols = [c for c in cols if (c[2] - c[0]) * (c[3] - c[1]) > 0]
    if 2 <= len(cols) <= 4 and substantial(split_mask, cols):
        # vloerlijn hoort weer bij elk paneel: herbereken bbox met volledig masker
        cols = [bbox_within(mask, (c[0], whole[1], c[2], whole[3])) or c for c in cols]
        place_grid(cols, 1, "onder-elkaar")
        if len(cols) >= 3:
            place_grid(cols, 2, "raster")
    rows = split_axis(split_mask, whole, 1, min_gap)
    if 2 <= len(rows) <= 4 and substantial(split_mask, rows):
        rows = [bbox_within(mask, (whole[0], r[1], whole[2], r[3])) or r for r in rows]
        place_grid(rows, len(rows), "naast-elkaar")
        if len(rows) >= 3:
            place_grid(rows, 2, "raster")

    if len(candidates) == 1:
        found = component_panels(drawing)
        if found:
            boxes, regions = found
            place_grid(boxes, 1, "onder-elkaar", regions)
            if len(boxes) >= 3:
                place_grid(boxes, 2, "raster", regions)

    best = max(candidates, key=lambda c: c[0])
    if best[1] != "origineel" and best[0] < original_scale * REARRANGE_GAIN:
        best = candidates[0]
    return best[2], best[1]


def substantial(mask: np.ndarray, boxes) -> bool:
    """Elk paneel moet een echte figuur/houding zijn, geen los puntje van een stok."""
    areas = [int(mask[y0:y1, x0:x1].sum()) for x0, y0, x1, y1 in boxes]
    return min(areas) >= max(areas) * 0.25


def component_panels(drawing: Drawing):
    """Panelen als losse figuurgroepen, ook als hun kaders elkaar overlappen.

    Kleine losse delen (halter, elastiek, vloerstukje) horen bij de dichtstbij-
    zijnde grote groep; elke bronpixel krijgt zo precies één paneel.
    """
    h, w = drawing.split_mask.shape
    m = drawing.split_mask.astype(np.uint8)
    if drawing.raster is None:
        k = max(3, int(max(h, w) * 0.012)) | 1
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    count, labels, stats, cents = cv2.connectedComponentsWithStats(m, 8)
    if count < 3:
        return None
    areas = stats[1:, cv2.CC_STAT_AREA]
    big = [i + 1 for i, a in enumerate(areas) if a >= areas.max() * 0.25]
    if not 2 <= len(big) <= 4:
        return None
    seeds = np.isin(labels, big)
    src = np.where(seeds, 0, 1).astype(np.uint8)
    _, nearest_pixel = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(seeds)                 # zelfde (rij-)volgorde als de labeling
    lookup = np.zeros(len(ys) + 1, np.int32)
    lookup[1:] = labels[ys, xs]
    nearest = lookup[nearest_pixel]
    centres = {i: cents[i] for i in big}
    spread = np.ptp([c for c in centres.values()], axis=0)
    order = sorted(big, key=lambda i: centres[i][0] if spread[0] >= spread[1] else centres[i][1])
    boxes, regions = [], []
    for i in order:
        region = nearest == i
        bb = bbox(drawing.panel_mask & region)
        if bb is None:
            return None
        boxes.append(bb)
        regions.append(region)
    return boxes, regions


def bbox_within(mask, box):
    x0, y0, x1, y1 = box
    bb = bbox(mask[y0:y1, x0:x1])
    if bb is None:
        return None
    return x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3]


# ---------------------------------------------------------------- render

def render(drawing: Drawing, placements: list[Placement]) -> np.ndarray:
    if drawing.raster is not None:
        canvas = np.zeros((OUT_H, OUT_W), np.float32)
        for pl in placements:
            x0, y0, x1, y1 = pl.src
            crop = drawing.raster[y0:y1, x0:x1]
            if pl.region is not None:
                crop = crop * pl.region[y0:y1, x0:x1]
            # lijndikte gelijktrekken met de hertekende kaarten: sterk verkleinde
            # illustraties krijgen anders haarlijntjes die op papier wegvallen
            grow = (ILLUSTRATION_MIN_W / pl.scale - drawing.stroke_width) / 2
            if grow >= 0.5:
                k = int(round(grow * 2)) + 1
                crop = cv2.dilate(crop, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
            tw = max(1, int(round((x1 - x0) * pl.scale)))
            th = max(1, int(round((y1 - y0) * pl.scale)))
            interp = cv2.INTER_AREA if pl.scale < 1 else cv2.INTER_CUBIC
            scaled = np.clip(cv2.resize(crop, (tw, th), interpolation=interp), 0, 1)
            if pl.scale > 1.15:
                # vergrote lijnen worden zacht: iets aanscherpen
                blur = cv2.GaussianBlur(scaled, (0, 0), 1.0)
                scaled = np.clip(scaled + 0.6 * (scaled - blur), 0, 1)
            ox = int(round(x0 * pl.scale + pl.dx))
            oy = int(round(y0 * pl.scale + pl.dy))
            region = canvas[oy:oy + th, ox:ox + tw]
            np.maximum(region, scaled[:region.shape[0], :region.shape[1]], out=region)
        ink = canvas
    else:
        big = np.zeros((OUT_H * SS, OUT_W * SS), np.uint8)
        shift = 4
        for stroke in drawing.strokes:
            cx, cy = stroke.points[len(stroke.points) // 2]
            pl = owner(placements, stroke.points)
            if pl is None:
                continue
            pts = stroke.points * pl.scale + np.array([pl.dx, pl.dy])
            pts = np.round(pts * SS * (1 << shift)).astype(np.int32)
            thickness = max(1, int(round(stroke.width * SS)))
            cv2.polylines(big, [pts.reshape(-1, 1, 2)], stroke.closed, 255, thickness, cv2.LINE_AA, shift)
        ink = cv2.resize(big, (OUT_W, OUT_H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    ink = np.clip(ink * 1.08, 0, 1)
    ink[ink < 0.04] = 0
    return (255 - np.round(ink * 255)).astype(np.uint8)


def owner(placements, points):
    if len(placements) == 1:
        return placements[0]
    cx, cy = points.mean(axis=0)
    if placements[0].region is not None:
        h, w = placements[0].region.shape
        px, py = points[len(points) // 2]
        yi, xi = int(np.clip(py, 0, h - 1)), int(np.clip(px, 0, w - 1))
        for pl in placements:
            if pl.region[yi, xi]:
                return pl
    best, best_d = None, float("inf")
    for pl in placements:
        x0, y0, x1, y1 = pl.src
        dx = max(x0 - cx, 0, cx - x1)
        dy = max(y0 - cy, 0, cy - y1)
        d = math.hypot(dx, dy)
        if d < best_d:
            best, best_d = pl, d
    return best


# ---------------------------------------------------------------- catalogue

def is_contour_card(line_path: Path) -> bool:
    """De oude randdetectie: 800x1200, puur zwart-wit en met het logo linksboven."""
    gray = cv2.imread(str(line_path), cv2.IMREAD_GRAYSCALE)
    h, w = gray.shape
    if (w, h) != (OUT_W, OUT_H):
        return False
    if len(np.unique(gray)) > 2:
        return False
    zx, zy = logo_zone(gray.shape)
    return (gray[:zy, :zx] < 128).mean() > 0.01


def color_source(line_path: Path) -> Path | None:
    stem = str(line_path)[: -len("-line-v1.png")]
    matches = sorted(Path(stem).parent.glob(Path(stem).name + "-avatar-v*.jpg"),
                     key=lambda p: int(re.search(r"-avatar-v(\d+)", p.name).group(1)))
    return matches[-1] if matches else None


def touches_border(image: np.ndarray, edge: int = 8) -> bool:
    ring = np.ones(image.shape, bool)
    ring[edge:-edge, edge:-edge] = False
    return bool((image[ring] < 255).any())


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def draw_card(mode: str, source: Path, target: Path) -> dict:
    """mode 'kleur': hertekenen vanuit een kleurkaart; 'illustratie': opmaak van lijnwerk."""
    drawing = redraw_from_color(source) if mode == "kleur" else load_illustration(source)
    placements, arrangement = layout(drawing)
    image = render(drawing, placements)
    if arrangement != "origineel" and touches_border(image):
        # vangnet: een herschikking mag nooit iets buiten het vakje duwen
        placements, arrangement = layout(drawing, allow_rearrange=False)
        image = render(drawing, placements)
    if touches_border(image):
        raise RuntimeError(f"{source}: tekening raakt de rand van het vakje")
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".tmp.png")
    cv2.imwrite(str(tmp), image, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    tmp.replace(target)
    return {
        "bron": drawing.kind,
        "indeling": arrangement,
        "panelen": len(placements),
        "schaal": round(placements[0].scale, 4),
        "inktdekking": round(float((1 - image.astype(np.float32) / 255).mean()), 5),
        "sha256": file_sha(target),
    }


def process(job: tuple[str, str, str, str]) -> dict:
    pad, mode, source, target = job
    result = draw_card(mode, Path(source), Path(target))
    result["pad"] = pad
    result["kleurbron"] = str(Path(source).relative_to(PUBLIC)) if mode == "kleur" else None
    return result


def plan_job(line: Path, target: Path, previous: dict | None) -> tuple[str, str, str, str] | None:
    """Bepaalt per kaart wat er moet gebeuren; None = al klaar, niet aankomen.

    Een eerder hertekende kaart wordt altijd opnieuw uit de kleurkaart getekend
    (deterministisch, dus verbeteringen aan dit script landen overal). Een al
    opgemaakte illustratie wordt niet nog eens geschaald (dat zou elke run iets
    scherpte kosten), tenzij het bestand sindsdien is vervangen.
    """
    pad = str(line.relative_to(PUBLIC))
    unchanged = previous is not None and previous.get("sha256") == file_sha(line)
    if unchanged and previous.get("bron") == "hertekend" and previous.get("kleurbron"):
        color = PUBLIC / previous["kleurbron"]
        if color.exists():
            return pad, "kleur", str(color), str(target)
    if unchanged and previous.get("bron") == "illustratie":
        return None
    color = color_source(line)
    if is_contour_card(line) and color:
        return pad, "kleur", str(color), str(target)
    return pad, "illustratie", str(line), str(target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="herteken alle kaarten in public/images")
    parser.add_argument("--out", type=Path, help="proefrun: schrijf naar deze map")
    parser.add_argument("--only", default="", help="alleen paden die deze tekst bevatten")
    parser.add_argument("--kleur", type=Path, help="enkel bestand: herteken vanuit deze kleurkaart")
    parser.add_argument("--illustratie", type=Path, help="enkel bestand: maak deze lijnillustratie passend")
    parser.add_argument("--naar", type=Path, help="doelbestand bij --kleur/--illustratie")
    parser.add_argument("--report", type=Path, default=ROOT / "content" / "lijnkaarten-herteken-rapport.json")
    parser.add_argument("--jobs", type=int, default=0)
    args = parser.parse_args()

    if args.kleur or args.illustratie:
        if not args.naar:
            sys.exit("--naar ontbreekt")
        mode, source = ("kleur", args.kleur) if args.kleur else ("illustratie", args.illustratie)
        print(json.dumps(draw_card(mode, source.resolve(), args.naar.resolve()), ensure_ascii=False))
        return
    if not args.write and not args.out:
        sys.exit("Gebruik --write (in place), --out <map> (proef) of --kleur/--illustratie met --naar")

    previous = {}
    if args.report.exists():
        previous = {entry["pad"]: entry for entry in json.loads(args.report.read_text()).get("kaarten", [])}

    lines = sorted(PUBLIC.glob("images/**/*-line-v1.png"))
    if args.only:
        lines = [p for p in lines if args.only in str(p)]
    jobs, kept = [], []
    for line in lines:
        target = line if args.write else args.out / line.relative_to(PUBLIC / "images")
        job = plan_job(line, target, previous.get(str(line.relative_to(PUBLIC))))
        if job is None:
            kept.append(previous[str(line.relative_to(PUBLIC))])
            if args.out:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(line.read_bytes())
        else:
            jobs.append(job)

    with ProcessPoolExecutor(max_workers=args.jobs or None) as pool:
        results = list(pool.map(process, jobs, chunksize=2))

    summary: dict[str, int] = {}
    for r in results:
        key = f"{r['bron']}/{r['indeling']}"
        summary[key] = summary.get(key, 0) + 1
    print(json.dumps({"getekend": len(results), "ongewijzigd": len(kept), "verdeling": summary},
                     indent=2, ensure_ascii=False))
    if args.write:
        merged = dict(previous)
        for entry in kept + results:
            merged[entry["pad"]] = entry
        existing = {str(p.relative_to(PUBLIC)) for p in PUBLIC.glob("images/**/*-line-v1.png")}
        report = {
            "schemaVersion": 1,
            "uitleg": "gegenereerd door scripts/lijnkaarten-hertekenen.py; sha256 = gepubliceerde kaart",
            "formaat": [OUT_W, OUT_H],
            "lijndikte": {"silhouet": OUTER_W, "binnen": INNER_W, "gezicht": FACE_W,
                          "illustratieMinimum": ILLUSTRATION_MIN_W},
            "kaarten": [merged[k] for k in sorted(merged) if k in existing],
        }
        args.report.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
