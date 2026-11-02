// Keep the light-mode montage's example count consistent with the 12-column card.
import sharp from 'sharp';
import path from 'node:path';
const source=process.argv[2];
if(!source)throw new Error('Provide the light-mode source image');
const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1448" height="1086">
<g transform="translate(776 520) rotate(-12)"><rect x="-13" y="-12" width="27" height="24" rx="12" fill="#dcefff"/><text x="0" y="4" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#2877cd">12</text></g>
<g transform="translate(708 561) rotate(-12)"><rect x="-3" y="-12" width="106" height="17" fill="#f8fbff"/><text x="0" y="0" font-family="Arial,sans-serif" font-size="9.4" font-weight="600" fill="#152441">0 van 12 volledig gedaan</text></g>
</svg>`);
const composited=await sharp(source).composite([{input:overlay}]).png().toBuffer();
for(const w of [500,1000])await sharp(composited).resize(w,Math.round(w*.75)).jpeg({quality:91,mozjpeg:true}).toFile(path.resolve(import.meta.dirname,`../public/images/landing/kaart-telefoon-light-${w}.jpg`));
