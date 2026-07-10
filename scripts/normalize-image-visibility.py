#!/usr/bin/env python3
"""Maak oefentekeningen even duidelijk als de biceps-referentie.

De tooncurve en, alleen waar nodig, een zeer lichte lijnversterking worden per
JPEG bepaald op het 56x56-formaat van de keuzelijst. Afbeeldingen die al
voldoende lijnzwart en randscherpte hebben worden niet opnieuw opgeslagen.

Gebruik:
  python3 scripts/normalize-image-visibility.py          # alleen rapport
  python3 scripts/normalize-image-visibility.py --write  # bestanden aanpassen

Vereist Pillow (`python3 -m pip install Pillow`).
"""

from argparse import ArgumentParser
from collections import Counter
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1] / "public" / "images"
# De huidige eerste bicepstekening meet op 56x56: p50 54, p90 94 en rand-p90
# 77. De correctie zoekt per tekening de kleinste afstand tot die combinatie,
# zodat al donkere onderdelen niet onnodig nog zwarter worden.
REFERENCE_P50 = 54
REFERENCE_P90 = 94
REFERENCE_EDGE_P90 = 77
WHITE_POINT = 248
MAX_GAMMA = 12.0
MAX_LINE_MIX = 0.5
MINIMUM_SCORE_IMPROVEMENT = 0.03


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
    pixels = list(gray.get_flattened_data())
    darkness = [255 - value for value in pixels]
    ink = [value for value in darkness if value > 4]
    edges = []
    for y in range(gray.height):
        row = y * gray.width
        for x in range(gray.width - 1):
            difference = abs(pixels[row + x] - pixels[row + x + 1])
            if difference > 4:
                edges.append(difference)
    for y in range(gray.height - 1):
        row = y * gray.width
        next_row = row + gray.width
        for x in range(gray.width):
            difference = abs(pixels[row + x] - pixels[next_row + x])
            if difference > 4:
                edges.append(difference)
    return {
        "p50": percentile(ink, 0.5),
        "p90": percentile(ink, 0.9),
        "edge90": percentile(edges, 0.9),
        "energy": sum(darkness) / len(darkness),
    }


def tone_curve(image, gamma):
    lut = []
    for value in range(256):
        if value >= WHITE_POINT:
            lut.append(255)
        else:
            lut.append(round(255 * (value / WHITE_POINT) ** gamma))
    return ImageOps.grayscale(image).point(lut).convert("RGB")


def strengthen_lines(image, amount):
    gray = image.convert("L")
    expanded = gray.filter(ImageFilter.MinFilter(3))
    return Image.blend(gray, expanded, amount).convert("RGB")


def has_visible_color(image):
    red, green, blue = image.convert("RGB").split()
    return any(
        ImageChops.difference(first, second).getextrema()[1] > 4
        for first, second in ((red, green), (green, blue), (red, blue))
    )


def reference_score(metrics):
    return (
        ((metrics["p50"] - REFERENCE_P50) / 6) ** 2
        + ((metrics["p90"] - REFERENCE_P90) / 10) ** 2
        + ((metrics["edge90"] - REFERENCE_EDGE_P90) / 8) ** 2
    )


def is_visibility_acceptable(metrics):
    # Tekeningen met al stevige donkere lijnen én randen hoeven geen hogere
    # middentoon te krijgen. Dat voorkomt dat bestaande zwarte details dichtlopen.
    return (
        metrics["p90"] >= REFERENCE_P90
        and metrics["edge90"] >= REFERENCE_EDGE_P90 - 5
    ) or (
        metrics["p50"] >= REFERENCE_P50 - 4
        and metrics["p90"] >= REFERENCE_P90 - 4
        and metrics["edge90"] >= REFERENCE_EDGE_P90 - 5
    )


def choose_gamma(image):
    current = thumbnail_metrics(image)
    if is_visibility_acceptable(current):
        return 1.0, 0.0, current
    best_gamma = 1.0
    best_line_mix = 0.0
    best_metrics = current
    best_score = reference_score(current)

    for step in range(11, round(MAX_GAMMA * 10) + 1):
        gamma = step / 10
        metrics = thumbnail_metrics(tone_curve(image, gamma))
        score = reference_score(metrics)
        if score < best_score:
            best_gamma = gamma
            best_metrics = metrics
            best_score = score

    if best_gamma == 1.0:
        toned = ImageOps.grayscale(image).convert("RGB")
    else:
        toned = tone_curve(image, best_gamma)
    for step in range(1, round(MAX_LINE_MIX * 20) + 1):
        line_mix = step / 20
        normalized = strengthen_lines(toned, line_mix)
        metrics = thumbnail_metrics(normalized)
        score = reference_score(metrics)
        if score < best_score:
            best_line_mix = line_mix
            best_metrics = metrics
            best_score = score

    improvement = reference_score(current) - best_score
    if improvement < MINIMUM_SCORE_IMPROVEMENT:
        return 1.0, 0.0, current
    return best_gamma, best_line_mix, best_metrics


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
        gamma, line_mix, after = choose_gamma(original)
        gamma_counts[gamma] += 1
        remove_color = has_visible_color(original)

        if gamma == 1.0 and not remove_color:
            unchanged.append((path, before))
            continue

        changed.append((path, gamma, line_mix, remove_color, before, after))
        if args.write:
            if gamma == 1.0:
                normalized = ImageOps.grayscale(original).convert("RGB")
            else:
                normalized = tone_curve(original, gamma)
            if line_mix:
                normalized = strengthen_lines(normalized, line_mix)
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
        for path, gamma, line_mix, remove_color, before, after in sorted(
            changed,
            key=lambda row: (row[1], row[2]),
            reverse=True,
        )[:15]:
            relative = path.relative_to(ROOT)
            print(
                f"  gamma {gamma:.1f}  p50 {before['p50']:>3}->{after['p50']:<3} "
                f"p90 {before['p90']:>3}->{after['p90']:<3} "
                f"rand {before['edge90']:>3}->{after['edge90']:<3} "
                f"lijnmix {line_mix:.2f}{' grijs' if remove_color else '':5}  {relative}"
            )


if __name__ == "__main__":
    main()
