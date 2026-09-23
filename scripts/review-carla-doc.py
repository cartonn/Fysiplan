"""Read Carla's source attachment; extract originals and labeled review sheets."""
import json
import sys
from pathlib import Path
from docx import Document
from PIL import Image, ImageDraw

source, output = Path(sys.argv[1]), Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
doc = Document(source)
records = []
for p in doc.paragraphs:
    ids = p._p.xpath('.//a:blip/@r:embed')
    if not ids:
        continue
    assert len(ids) == 1 and p.text.strip(), 'Ambiguous image/name mapping'
    part = doc.part.related_parts[ids[0]]
    filename = f'{len(records)+1:02d}' + Path(str(part.partname)).suffix
    (output / filename).write_bytes(part.blob)
    records.append({'name': p.text.strip(), 'file': filename})
(output / 'sources.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
for start in range(0, len(records), 12):
    sheet = Image.new('RGB', (1200, 1600), 'white')
    draw = ImageDraw.Draw(sheet)
    for idx, item in enumerate(records[start:start+12]):
        x, y = (idx % 3)*400, (idx // 3)*400
        picture = Image.open(output / item['file']).convert('RGB')
        picture.thumbnail((380, 345))
        sheet.paste(picture, (x+(400-picture.width)//2, y+40))
        draw.text((x+8,y+8), f'{start+idx+1}. {item["name"]}', fill='black')
    sheet.save(output / f'review-{start//12+1}.jpg')
print(f'{len(records)} source exercises extracted to {output}')
