#!/usr/bin/env python3
"""Maak lichte oefentekeningen beter zichtbaar zonder geometrie te wijzigen.

De tooncurve wordt per JPEG bepaald op het 56x56-formaat van de keuzelijst.
Afbeeldingen die al voldoende contrast hebben worden niet opnieuw opgeslagen.

Gebruik:
  python3 scripts/normalize-image-visibility.py          # alleen rapport
  python3 scripts/normalize-image-visibility.py --write  # bestanden aanpassen

Vereist Pillow (`python3 -m pip install Pillow`).
"""

from argparse import ArgumentParser
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1] / "public" / "images"
# Ondergrens voor duidelijke lijnen na verkleinen. De hogere streefwaarden
# geven wat marge voor kleine verschillen na JPEG-compressie.
ACCEPT_P50 = 40
ACCEPT_P90 = 75
TARGET_P50 = 45
TARGET_P90 = 85
WHITE_POINT = 248
MAX_GAMMA = 6.0


def percentile(values, fraction):
    values = sorted(values)
    if not values:
        return 0
    index = min(len(values) - 1, round((len(values) - 1) * fraction))
    return values[index]


def fit_on_white(image, size=56, inset=2):
    fitted = ImageOps.contain(
        image.convert("RGB"),
        (size - inset * 2, size - inset * 2),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGB", (size, size), "white")
    canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas


def thumbnail_metrics(image):
    gray = fit_on_white(image).convert("L")
    darkness = [255 - value for value in gray.get_flattened_data()]
    ink = [value for value in darkness if value > 4]
    return {
        "p50": percentile(ink, 0.5),
        "p90": percentile(ink, 0.9),
        "energy": sum(darkness) / len(darkness),
    }


def tone_curve(image, gamma):
    lut = []
    for value in range(256):
        if value >= WHITE_POINT:
            lut.append(255)
        else:
            lut.append(round(255 * (value / WHITE_POINT) ** gamma))
    return image.convert("RGB").point(lut * 3)


def choose_gamma(image):
    current = thumbnail_metrics(image)
    if current["p50"] >= ACCEPT_P50 and current["p90"] >= ACCEPT_P90:
        return 1.0, current
    for step in range(10, round(MAX_GAMMA * 10) + 1):
        gamma = step / 10
        metrics = thumbnail_metrics(tone_curve(image, gamma))
        if metrics["p50"] >= TARGET_P50 and metrics["p90"] >= TARGET_P90:
            return gamma, metrics
    normalized = tone_curve(image, MAX_GAMMA)
    return MAX_GAMMA, thumbnail_metrics(normalized)


def main():
    parser = ArgumentParser()
    parser.add_argument("--write", action="store_true", help="overschrijf de JPEG-bestanden")
    args = parser.parse_args()

    files = sorted(ROOT.rglob("*.jpg"))
    changed = []
    unchanged = []
    gamma_counts = Counter()

    for path in files:
        with Image.open(path) as opened:
            original = opened.convert("RGB")
        before = thumbnail_metrics(original)
        gamma, after = choose_gamma(original)
        gamma_counts[gamma] += 1

        if gamma == 1.0:
            unchanged.append((path, before))
            continue

        changed.append((path, gamma, before, after))
        if args.write:
            normalized = tone_curve(original, gamma)
            temporary = path.with_suffix(".visibility.tmp.jpg")
            normalized.save(
                temporary,
                "JPEG",
                quality=92,
                optimize=True,
                progressive=True,
                subsampling=0,
            )
            if normalized.size != original.size:
                raise RuntimeError(f"Afmetingen gewijzigd voor {path}")
            temporary.replace(path)

    print(f"Afbeeldingen: {len(files)}")
    print(f"Al goed zichtbaar, ongewijzigd: {len(unchanged)}")
    print(f"Genormaliseerd: {len(changed)}")
    print("Gamma-verdeling: " + ", ".join(f"{gamma:.1f}={count}" for gamma, count in sorted(gamma_counts.items())))
    print("Modus: " + ("bestanden aangepast" if args.write else "rapport; gebruik --write om toe te passen"))

    if changed:
        print("\nSterkste correcties:")
        for path, gamma, before, after in sorted(changed, key=lambda row: row[1], reverse=True)[:15]:
            relative = path.relative_to(ROOT)
            print(
                f"  gamma {gamma:.1f}  p50 {before['p50']:>3}->{after['p50']:<3} "
                f"p90 {before['p90']:>3}->{after['p90']:<3}  {relative}"
            )


if __name__ == "__main__":
    main()
