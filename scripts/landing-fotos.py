#!/usr/bin/env python3
"""Zet stockfoto's voor de landingspagina (/v2) klaar in de huisstijl.

Elke foto krijgt een vaste uitsnede per plek, een rustige kleurbewerking die
naar het palet van de landing trekt (inktzwart #232019 in de schaduwen,
papiercrème #f6f2e9 in de lichten, iets minder verzadiging) en wordt als
progressieve JPEG in twee breedtes weggeschreven, zonder EXIF.

Leg de bronfoto's in één map met de plek als bestandsnaam:
  behandelkamer.jpg  huiskamer.jpg  papier.jpg  telefoon.jpg

Gebruik:
  python3 scripts/landing-fotos.py <bronmap>

Uitvoer: public/images/landing/<plek>-1600.jpg en <plek>-800.jpg.
Vermeld fotograaf en licentie in public/images/landing/BRONNEN.md.

Vereist Pillow (`python3 -m pip install Pillow`).
"""

from argparse import ArgumentParser
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

UIT = Path(__file__).resolve().parents[1] / "public" / "images" / "landing"

# plek -> (breedte:hoogte, horizontaal en verticaal zwaartepunt van de uitsnede)
PLEKKEN = {
    "behandelkamer": ((4, 3), (0.5, 0.45)),
    "huiskamer": ((4, 3), (0.5, 0.45)),
    "papier": ((3, 2), (0.5, 0.4)),
    "telefoon": ((3, 2), (0.5, 0.4)),
}
BREEDTES = (1600, 800)

INKT = (35, 32, 25)
CREME = (246, 242, 233)
VERZADIGING = 0.84   # iets rustiger dan de bron, naast een crème pagina
DUOTOON = 0.22       # hoeveel van de inkt-crème-duotoon erdoor gaat
ZWARTPUNT = 12       # schaduwen nooit puur zwart: de pagina heeft ook geen #000


def duotoon_lut():
    """Per kanaal een tabel die grijs 0..255 tussen inkt en crème legt."""
    return [round(INKT[k] + (CREME[k] - INKT[k]) * i / 255) for k in range(3) for i in range(256)]


def bewerk(img):
    img = ImageOps.exif_transpose(img).convert("RGB")
    img = ImageEnhance.Color(img).enhance(VERZADIGING)
    duo = img.convert("L").convert("RGB").point(duotoon_lut())
    img = Image.blend(img, duo, DUOTOON)
    lift = [ZWARTPUNT + i * (255 - ZWARTPUNT) // 255 for i in range(256)] * 3
    return img.point(lift)


def main():
    ap = ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("bron", type=Path, help="map met behandelkamer.jpg, huiskamer.jpg, ...")
    args = ap.parse_args()
    UIT.mkdir(parents=True, exist_ok=True)
    gevonden = 0
    for plek, ((bw, bh), midden) in PLEKKEN.items():
        bronnen = sorted(p for p in args.bron.glob(plek + ".*") if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
        if not bronnen:
            print(f"- {plek}: geen bron gevonden, overgeslagen")
            continue
        gevonden += 1
        img = bewerk(Image.open(bronnen[0]))
        for breedte in BREEDTES:
            hoogte = round(breedte * bh / bw)
            uit = ImageOps.fit(img, (breedte, hoogte), Image.LANCZOS, centering=midden)
            doel = UIT / f"{plek}-{breedte}.jpg"
            uit.save(doel, "JPEG", quality=78 if breedte > 1000 else 80, optimize=True, progressive=True)
            print(f"- {plek}: {doel.name} {breedte}x{hoogte} {doel.stat().st_size // 1024} KB")
    if not gevonden:
        raise SystemExit("Geen enkele bronfoto gevonden.")


if __name__ == "__main__":
    main()
