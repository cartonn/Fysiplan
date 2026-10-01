"""Virtual Sketching (Mo et al., SIGGRAPH 2021) in Python/onnxruntime.

Neurale vectorisatie van lijntekeningen: een recurrent model 'tekent' de
tekening na met een virtuele pen, stap voor stap, in een bewegend venster.
Elke penstreek is een kwadratische Bézier met begin- en einddikte. Zo worden
rafelige, dubbele of onderbroken pixellijnen vervangen door doorlopende,
gladde streken zoals een tekenaar ze zet.

Port van de browserversie (github.com/nsitu/virtual-sketching-web,
browser_port/src/{model,preprocess,raster}.js), die op zijn beurt de
originele samplers (test_vectorization.py / test_rough_sketch_simplification.py)
volgt. Modellen: release `browser-models-v1` van die repository.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

MODEL_RELEASE = "https://github.com/nsitu/virtual-sketching-web/releases/download/browser-models-v1/"
MODEL_FILES = {"line": "virtual_sketching_step.onnx", "rough": "virtual_sketching_rough_step.onnx"}
MODES = {
    "line": {"channels": 1, "rounds": 10, "steps": 500},
    "rough": {"channels": 3, "rounds": 10, "steps": 128},
}
RASTER = 128
MIN_WINDOW = 32
MIN_WIDTH = 0.01
MAX_SCALING = 2.0


@dataclass
class PenStroke:
    params: tuple       # control row/col (fractie), end row/col (-1..1), eindbreedte, schaal
    prev_width: float
    cursor: tuple       # (x, y) als fractie van de beeldgrootte
    image_size: int
    window: float
    seq: int = 0        # doorlopende stapteller: opeenvolgende streken vormen één penhaal

    def curve(self, samples: int = 24) -> tuple[np.ndarray, np.ndarray]:
        """Middellijn (x, y) in beeldpixels en straal per punt."""
        p = self.params
        size = RASTER
        # patchcoördinaten (2x supersampled, zoals de rasterizer)
        start = np.array([size, size], float)                     # (row, col) = midden
        end = np.array([((p[2] + 1) / 2) * (size * 2 - 1), ((p[3] + 1) / 2) * (size * 2 - 1)])
        ctrl = start + (end - start) * np.array([p[0], p[1]])
        t = np.linspace(0, 1, samples)[:, None]
        rc = (1 - t) ** 2 * start + 2 * t * (1 - t) * ctrl + t ** 2 * end
        r0 = 1 + math.floor(self.prev_width * size / 2)
        r1 = 1 + math.floor(p[4] * size / 2)
        radius = ((1 - t[:, 0]) * r0 + t[:, 0] * r1) / 2         # patchpixels
        # patch -> beeld (zelfde mapping als pastePatch/pasteTransform)
        cx, cy = self.cursor[0] * self.image_size, self.cursor[1] * self.image_size
        left, top = cx - self.window / 2, cy - self.window / 2
        xf, yf = math.floor(left), math.floor(top)
        xc, yc = math.ceil(cx + self.window / 2), math.ceil(cy + self.window / 2)
        sw, sh = max(1, xc - xf), max(1, yc - yf)
        scx = (((xf + xc) / 2 - left) / self.window) * size
        scy = (((yf + yc) / 2 - top) / self.window) * size
        srw, srh = size * sw / self.window, size * sh / self.window
        sl, st = scx - (srw - 1) / 2, scy - (srh - 1) / 2
        kx = (sw - 1) / (srw - 1) if sw > 1 else 0
        ky = (sh - 1) / (srh - 1) if sh > 1 else 0
        x = xf + ((rc[:, 1] - 0.5) / 2 - sl) * kx
        y = yf + ((rc[:, 0] - 0.5) / 2 - st) * ky
        return np.stack([x, y], 1), radius * kx


def ensure_model(mode: str, cache: Path) -> Path:
    path = cache / MODEL_FILES[mode]
    if not path.exists() or path.stat().st_size < 1_000_000:
        import urllib.request
        cache.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(MODEL_RELEASE + MODEL_FILES[mode], tmp)
        tmp.replace(path)
    return path


def crop_and_resize(image: np.ndarray, cursor, window: float, out: int, extrap: float) -> np.ndarray:
    h, w = image.shape[:2]
    left = cursor[0] * w - (window - 1) / 2
    top = cursor[1] * h - (window - 1) / 2
    scale = (window - 1) / (out - 1)
    m = np.array([[scale, 0, left], [0, scale, top]], np.float32)
    return cv2.warpAffine(image, m, (out, out), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=extrap)


def render_patch(params, prev_width: float, size: int = RASTER) -> np.ndarray:
    hs = size * 2
    high = np.zeros((hs, hs), np.float32)
    x0 = y0 = 0.5
    x2, y2 = (params[2] + 1) / 2, (params[3] + 1) / 2
    x1, y1 = x0 + (x2 - x0) * params[0], y0 + (y2 - y0) * params[1]
    z0 = 1 + math.floor(prev_width * size / 2)
    z2 = 1 + math.floor(params[4] * size / 2)
    norm = lambda v: int(v * (hs - 1) + 0.5)
    r0, c0, r1, c1, r2, c2 = map(norm, (x0, y0, x1, y1, x2, y2))
    for i in range(100):
        t = i * 0.01
        row = int((1 - t) ** 2 * r0 + 2 * t * (1 - t) * r1 + t * t * r2)
        col = int((1 - t) ** 2 * c0 + 2 * t * (1 - t) * c1 + t * t * c2)
        cv2.circle(high, (col, row), int((1 - t) * z0 + t * z2), 1.0, -1)
    return high.reshape(size, 2, size, 2).mean(axis=(1, 3))


def paste_patch(canvas: np.ndarray, patch: np.ndarray, cursor, size: int, window: float) -> None:
    cx, cy = cursor[0] * size, cursor[1] * size
    x1, y1 = cx - window / 2, cy - window / 2
    xf, yf = math.floor(x1), math.floor(y1)
    xc, yc = math.ceil(cx + window / 2), math.ceil(cy + window / 2)
    sw, sh = max(1, xc - xf), max(1, yc - yf)
    pcx = (((xf + xc) / 2 - x1) / window) * RASTER
    pcy = (((yf + yc) / 2 - y1) / window) * RASTER
    spw, sph = RASTER * sw / window, RASTER * sh / window
    sl, st = pcx - (spw - 1) / 2, pcy - (sph - 1) / 2
    kx = (spw - 1) / (sw - 1) if sw > 1 else 0
    ky = (sph - 1) / (sh - 1) if sh > 1 else 0
    m = np.array([[kx, 0, sl], [0, ky, st]], np.float32)
    support = cv2.warpAffine(patch, m, (sw, sh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                             borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    dx0, dy0 = max(0, xf), max(0, yf)
    dx1, dy1 = min(size, xf + sw), min(size, yf + sh)
    if dx1 <= dx0 or dy1 <= dy0:
        return
    region = canvas[dy0:dy1, dx0:dx1]
    np.minimum(region + support[dy0 - yf:dy1 - yf, dx0 - xf:dx1 - xf], 1, out=region)


class Vectorizer:
    def __init__(self, mode: str, cache: Path, threads: int = 1):
        self.mode = mode
        self.cfg = MODES[mode]
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = threads
        opts.inter_op_num_threads = 1
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(str(ensure_model(mode, cache)), opts, providers=["CPUExecutionProvider"])

    def _undrawn_cursor(self, image, canvas, history, rng):
        size = image.shape[0]
        ink = image[..., 0] < 1 if image.ndim == 3 else image < 1
        drawn = canvas > 0
        n = math.ceil(size / RASTER)
        best, best_undrawn, min_acc, min_cell = None, 0, 1.0, None
        for gx in range(n):
            for gy in range(n):
                sl = (slice(gy * RASTER, min(gy * RASTER + RASTER, size)), slice(gx * RASTER, min(gx * RASTER + RASTER, size)))
                target = int(ink[sl].sum())
                done = int((ink[sl] & drawn[sl]).sum())
                undrawn = target - done
                acc = 1.0 if target == 0 or undrawn <= 5 else done / target
                if acc < min_acc:
                    min_acc, min_cell = acc, (gx, gy)
                if undrawn > best_undrawn:
                    best_undrawn, best = undrawn, (gx, gy)
        if min_acc >= 0.95 or best is None:
            return None
        idx = min_cell[0] * n + min_cell[1]
        same = history.get("idx") == idx
        if same and history.get("times", 0) >= 2:
            best = min_cell
            history["times"] = 1
        else:
            history["times"] = history.get("times", 0) + 1 if same else 1
        history["idx"] = idx
        y = best[1] * RASTER + RASTER / 4 + rng.randrange(RASTER // 2 + 1)
        x = best[0] * RASTER + RASTER / 4 + rng.randrange(RASTER // 2 + 1)
        return (min(size - 1, x) / size, min(size - 1, y) / size)

    def _initial_cursor(self, image, rng):
        size = image.shape[0]
        ink = (image < 1).any(axis=2) if image.ndim == 3 else image < 1
        if not ink.any():
            return None
        # integraalbeeld: is er inkt in het venster rond (x, y)?
        ii = cv2.integral(ink.astype(np.uint8))
        half = RASTER // 2
        for _ in range(10000):
            x, y = rng.randrange(size), rng.randrange(size)
            a0, b0, a1, b1 = max(0, y - half), max(0, x - half), min(size, y + half), min(size, x + half)
            if ii[a1, b1] - ii[a0, b1] - ii[a1, b0] + ii[a0, b0] > 0:
                return (x / size, y / size)
        ys, xs = np.nonzero(ink)
        return (xs[0] / size, ys[0] / size)

    def vectorize(self, image: np.ndarray, seed: int = 7, rounds: int | None = None,
                  steps: int | None = None, patience: int = 12) -> tuple[list[PenStroke], np.ndarray]:
        """image: vierkant, float32 [0,1], wit papier = 1 (HxW of HxWx3)."""
        rng = random.Random(seed)
        size = image.shape[0]
        ch = self.cfg["channels"]
        img = image if image.ndim == 3 else image[..., None]
        if img.shape[2] != ch:
            img = np.repeat(img[..., :1], ch, axis=2)
        img = img.astype(np.float32)
        full_small = cv2.resize(img, (RASTER, RASTER), interpolation=cv2.INTER_AREA).reshape(1, RASTER, RASTER, ch)
        canvas = np.zeros((size, size), np.float32)
        strokes: list[PenStroke] = []
        history: dict = {}
        cursor = self._initial_cursor(img, rng)
        seq = 0
        for _ in range(rounds or self.cfg["rounds"]):
            if cursor is None:
                break
            state = np.zeros((1, 1024), np.float32)
            prev_width, prev_scaling, prev_window = MIN_WIDTH, 1.0, float(RASTER)
            idle = 0
            for step in range(steps or self.cfg["steps"]):
                if step and step % 48 == 0:
                    state = np.zeros((1, 1024), np.float32)
                window = float(np.clip(prev_scaling * prev_window, MIN_WINDOW, size))
                patch_photo = crop_and_resize(img, cursor, window, RASTER, 1.0).reshape(1, RASTER, RASTER, ch) * 2 - 1
                patch_canvas = (1 - crop_and_resize(canvas, cursor, window, RASTER, 0.0)) * 2 - 1
                full_canvas = 1 - cv2.resize(canvas, (RASTER, RASTER), interpolation=cv2.INTER_AREA)
                feeds = {
                    "step_patch_photo:0": patch_photo.astype(np.float32),
                    "step_patch_canvas:0": patch_canvas.reshape(1, RASTER, RASTER, 1).astype(np.float32),
                    "step_entire_photo:0": full_small,
                    "step_entire_canvas:0": full_canvas.reshape(1, RASTER, RASTER, 1).astype(np.float32),
                    "step_cursor:0": np.array([[cursor]], np.float32),
                    "step_image_size:0": np.array(size, np.int32),
                    "step_window_size:0": np.array([[[window]]], np.float32),
                    "step_prev_width:0": np.array([[[prev_width]]], np.float32),
                    "step_state_in:0": state,
                }
                seq += 1
                params, pen, state = self.session.run(["other_params:0", "pen_ras:0", "state_out:0"], feeds)
                params = params.reshape(-1).astype(float)
                pen = pen.reshape(-1)
                if pen[1] <= pen[0]:          # pen omlaag: streek tekenen
                    patch = render_patch(params, prev_width)
                    paste_patch(canvas, patch, cursor, size, window)
                    strokes.append(PenStroke(tuple(params), prev_width, tuple(cursor), size, window, seq))
                    idle = 0
                else:
                    idle += 1
                scaling = min(MAX_SCALING, max(0.0, params[5]))
                next_window = float(np.clip(scaling * window, MIN_WINDOW, size))
                prev_width = params[4] * window / next_window
                prev_scaling, prev_window = scaling, window
                nx = cursor[0] * size + params[3] * window / 2
                ny = cursor[1] * size + params[2] * window / 2
                cursor = (float(np.clip(nx, 0, size - 1)) / size, float(np.clip(ny, 0, size - 1)) / size)
                if idle >= patience:
                    break
            seq += 1000   # nieuwe ronde = nieuwe penhaal
            cursor = self._undrawn_cursor(img, canvas, history, rng)
        return strokes, canvas


def chain_strokes(strokes: list[PenStroke], samples: int = 16) -> list[np.ndarray]:
    """Voegt opeenvolgende penstreken samen tot doorlopende polylijnen."""
    paths: list[np.ndarray] = []
    current: list[np.ndarray] = []
    last = None
    for stroke in strokes:
        pts, _ = stroke.curve(samples)
        if last is not None and stroke.seq == last + 1 and current:
            current.append(pts[1:])
        else:
            if current:
                paths.append(np.vstack(current))
            current = [pts]
        last = stroke.seq
    if current:
        paths.append(np.vstack(current))
    return paths
