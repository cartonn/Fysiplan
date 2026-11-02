// Gedeelde meetkunde voor het tonen van twee houdingen uit één bronafbeelding.
//
// De patiëntkaart (public/kaart.html) en het beoordelingsgereedschap
// (scripts/pose-crop-candidates.mjs, scripts/render-pose-review.mjs) moeten
// exact dezelfde uitsnede en schaal gebruiken, anders beoordeelt de fysiotherapeut
// iets anders dan de patiënt ziet. De kaart is één los HTML-bestand en kan niet
// importeren; scripts/test-mobile-pose-layout.mjs vergelijkt daarom de ingebouwde
// kopie regel voor regel met deze module op dezelfde invoer.
//
// Uitgangspunten, afgeleid van de eis "zelfde beeld, zelfde lichaamsschaal":
//  * één schaalfactor voor beide houdingen; nooit afzonderlijk passend maken;
//  * langs de as waarop het blad de figuren naast (of onder) elkaar zet, centreren we:
//    die afstand is bladindeling, geen beweging;
//  * loodrecht daarop blijft het werkelijke verschil staan: bij een blad met twee
//    figuren naast elkaar zakt een squat echt lager dan de stand, en die hoogte
//    hoort de patiënt te zien;
//  * de uitsnede is expliciet opgegeven en beoordeeld, nooit afgeleid van witruimte.

export function validatePoseCrop(crop, width, height) {
  if (!crop || typeof crop !== 'object') return false;
  for (const key of ['x', 'y', 'w', 'h']) {
    const value = crop[key];
    if (!Number.isInteger(value)) return false;
  }
  if (crop.w <= 0 || crop.h <= 0) return false;
  if (crop.x < 0 || crop.y < 0) return false;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return false;
  if (crop.x + crop.w > width || crop.y + crop.h > height) return false;
  return true;
}

export function cropsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Twee houdingen die elkaar overlappen zijn per definitie geen gescheiden figuren:
// dan zou in elk beeld een stuk van de andere tekening achterblijven.
export function validatePosePair(poses, width, height) {
  if (!Array.isArray(poses) || poses.length !== 2) return false;
  for (const pose of poses) if (!validatePoseCrop(pose && pose.crop, width, height)) return false;
  if (cropsOverlap(poses[0].crop, poses[1].crop)) return false;
  return true;
}

export function poseFrameLayout(poses, axis, size, pad) {
  const frameSize = size || 640;
  const margin = pad == null ? 32 : pad;
  const stacked = axis === 'y';
  // langs de indelingsas tellen we alleen de grootste uitsnede (we centreren daar),
  // loodrecht erop het werkelijke bereik van beide uitsnedes samen
  const widest = Math.max.apply(null, poses.map(p => p.crop.w));
  const tallest = Math.max.apply(null, poses.map(p => p.crop.h));
  const left = Math.min.apply(null, poses.map(p => p.crop.x));
  const top = Math.min.apply(null, poses.map(p => p.crop.y));
  const spanX = Math.max.apply(null, poses.map(p => p.crop.x + p.crop.w)) - left;
  const spanY = Math.max.apply(null, poses.map(p => p.crop.y + p.crop.h)) - top;
  const boxW = stacked ? spanX : widest;
  const boxH = stacked ? tallest : spanY;
  const inner = frameSize - 2 * margin;
  const scale = Math.min(inner / boxW, inner / boxH);
  const offsetX = margin + (inner - boxW * scale) / 2;
  const offsetY = margin + (inner - boxH * scale) / 2;
  return poses.map(pose => ({
    sx: pose.crop.x, sy: pose.crop.y, sw: pose.crop.w, sh: pose.crop.h,
    dx: stacked ? offsetX + (pose.crop.x - left) * scale : (frameSize - pose.crop.w * scale) / 2,
    dy: stacked ? (frameSize - pose.crop.h * scale) / 2 : offsetY + (pose.crop.y - top) * scale,
    dw: pose.crop.w * scale,
    dh: pose.crop.h * scale,
    scale
  }));
}
