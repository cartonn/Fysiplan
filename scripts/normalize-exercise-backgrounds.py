#!/usr/bin/env python3
"""Create shadow-free #FFFFFF exercise cards with a local BiRefNet graph step."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--model-home", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--asset-version", type=int, default=7)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def draw_barbell_benches(size: tuple[int, int]) -> Image.Image:
    """Rebuild the two shadow-free benches rejected as room furniture by BiRefNet."""
    width, height = size
    scale = 4
    layer = Image.new("RGB", (width * scale, height * scale), "white")
    draw = ImageDraw.Draw(layer)

    def rect(box: tuple[int, int, int, int], **kwargs) -> None:
        draw.rectangle(tuple(value * scale for value in box), **kwargs)

    def rounded(box: tuple[int, int, int, int], radius: int, **kwargs) -> None:
        draw.rounded_rectangle(tuple(value * scale for value in box), radius=radius * scale, **kwargs)

    def polygon(points: tuple[tuple[int, int], ...], **kwargs) -> None:
        draw.polygon([(x * scale, y * scale) for x, y in points], **kwargs)

    def bench(seat: tuple[int, int, int, int], legs: tuple[tuple[int, str], ...]) -> None:
        x1, y1, x2, y2 = seat
        rounded((x1, y1, x2, y2), 7, fill="#202728")
        rounded((x1 + 3, y1 + 3, x2 - 3, y1 + 12), 4, fill="#4c5657")
        rect((x1, y2 - 10, x2, y2), fill="#101718")
        for leg_x, foot_direction in legs:
            rounded((leg_x, y2 - 2, leg_x + 20, y2 + 128), 4, fill="#12191a")
            rect((leg_x + 4, y2 + 5, leg_x + 9, y2 + 122), fill="#3d4849")
            if foot_direction == "left":
                polygon(((leg_x + 4, y2 + 112), (leg_x + 20, y2 + 119), (leg_x - 24, y2 + 151), (leg_x - 36, y2 + 140)), fill="#11191a")
            else:
                polygon(((leg_x + 16, y2 + 112), (leg_x + 2, y2 + 120), (leg_x + 45, y2 + 151), (leg_x + 58, y2 + 140)), fill="#11191a")

    bench((20, 812, 412, 864), ((37, "right"), (387, "left")))
    bench((437, 744, 770, 797), ((448, "right"), (713, "left")))
    return layer.resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def near_white_ratio(image: Image.Image) -> float:
    pixels = np.asarray(image.convert("RGB"))
    sample = pixels.copy()
    sample[:100, :210] = 255
    near_white = np.all(sample >= 250, axis=2)
    return float(near_white.mean())


def remove_known_shadow_artifacts(card: Image.Image, exercise_name: str) -> None:
    if exercise_name == "Leg raises":
        # The generated source contains one detached rectangular cast shadow to
        # the right of the lower pose. It does not touch the body or equipment.
        ImageDraw.Draw(card).rectangle((470, 935, 680, 1080), fill="white")


def main() -> None:
    args = arguments()
    os.environ["U2NET_HOME"] = str(args.model_home.resolve())
    from rembg import new_session, remove

    catalogue = json.loads((args.root / "public/oefeningen-v2.json").read_text())
    if args.limit:
        catalogue = catalogue[: args.limit]
    session = new_session("birefnet-general")
    results: list[dict[str, object]] = []

    for index, exercise in enumerate(catalogue, start=1):
        source_relative = Path(exercise["kaartImg"])
        source = args.root / "public" / source_relative
        output_name = re.sub(r"-avatar-v\d+\.jpg$", f"-avatar-v{args.asset_version}.jpg", str(source_relative))
        if output_name == str(source_relative):
            raise ValueError(f"Onverwachte kaartbestandsnaam: {source_relative}")
        output_relative = Path(output_name)
        output = args.output_root / output_relative
        output.parent.mkdir(parents=True, exist_ok=True)

        if output.exists() and not args.force:
            card = Image.open(output).convert("RGB")
        else:
            original = Image.open(source).convert("RGB")
            cutout = remove(original, session=session, alpha_matting=False).convert("RGBA")
            if exercise["naam"] == "Barbell neck press":
                card_layer = draw_barbell_benches(original.size)
            else:
                card_layer = Image.new("RGBA", original.size, "white")
            card_layer.alpha_composite(cutout)
            card = card_layer.convert("RGB")
            card.paste(original.crop((0, 0, 200, 90)), (0, 0))
            remove_known_shadow_artifacts(card, exercise["naam"])
            card.save(output, quality=94, subsampling=0, optimize=True)

        result = {
            "order": index,
            "name": exercise["naam"],
            "source": str(source_relative),
            "output": str(output_relative),
            "width": card.width,
            "height": card.height,
            "nearWhiteRatio": round(near_white_ratio(card), 5),
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        }
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)

    report = args.output_root / "background-normalization-report.json"
    report.write_text(json.dumps({"schemaVersion": 1, "assetVersion": args.asset_version, "model": "birefnet-general", "background": "#FFFFFF", "cards": results}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"completed": len(results), "report": str(report)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
