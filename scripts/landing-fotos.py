#!/usr/bin/env python3
"""Zet stockfoto's voor de landingspagina (/v2) klaar in de huisstijl.

Elke foto krijgt een vaste uitsnede per plek, een rustige kleurbewerking die
naar het palet van de landing trekt (inktzwart #232019 in de schaduwen,
papiercrème #f6f2e9 in de lichten, iets minder verzadiging) en wordt als
progressieve JPEG in twee breedtes weggeschreven, zonder EXIF.

Leg de bronfoto's in één map met de plek als bestandsnaam:
  behandelkamer.jpg  begeleiding.jpg  thuis.jpg

Gebruik:
  python3 scripts/landing-fotos.py <bronmap>

Uitvoer: public/images/landing/<plek>-1200.jpg en <plek>-600.jpg.
Vermeld fotograaf en licentie in public/images/landing/BRONNEN.md.

Vereist Pillow (`python3 -m pip install Pillow`).
"""

from argparse import ArgumentParser
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

UIT = Path(__file__).resolve().parents[1] / "public" / "images" / "landing"

# plek -> (breedte:hoogte, zwaartepunt van de uitsnede, optioneel eerst inzoomen
# op een kader links, boven, rechts, onder als fractie van de bron)
PLEKKEN = {
    "behandelkamer": ((4, 3), (0.5, 0.28), None),                     # Karola G (Kaboompics), Pexels 4506073
    "begeleiding": ((4, 3), (0.5, 0.35), None),                       # Kampus Production, Pexels 7551631
    "thuis": ((3, 4), (0.5, 0.3), (0.22, 0.27, 1.0, 1.0)),            # Karola G (Kaboompics), Pexels 6633825
}
BREEDTES = (1200, 600)

INKT = (35, 32, 25)
CREME = (246, 242, 233)
VERZADIGING = 0.8    # iets rustiger dan de bron, naast een crème pagina
DUOTOON = 0.3        # hoeveel van de inkt-crème-duotoon erdoor gaat
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
    ap.add_argument("bron", type=Path, help="map met behandelkamer.jpg, begeleiding.jpg en thuis.jpg")
    args = ap.parse_args()
    UIT.mkdir(parents=True, exist_ok=True)
    gevonden = 0
    for plek, ((bw, bh), midden, kader) in PLEKKEN.items():
        bronnen = sorted(p for p in args.bron.glob(plek + ".*") if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
        if not bronnen:
            print(f"- {plek}: geen bron gevonden, overgeslagen")
            continue
        gevonden += 1
        img = bewerk(Image.open(bronnen[0]))
        if kader:
            w, h = img.size
            img = img.crop((round(kader[0] * w), round(kader[1] * h), round(kader[2] * w), round(kader[3] * h)))
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
