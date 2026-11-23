// Plek en toestel uit een geüploade foto halen (security 2026-11-20, art. 5 lid 1 c en art. 25 AVG).
//
// Een eigen-oefeningfoto en het praktijklogo staan op de patiëntkaart. Een foto van een telefoon
// draagt vaak de plek van opnemen (GPS), merk en type van de telefoon, de opnametijd en soms een
// naam (XMP, IPTC). De app tekent de foto opnieuw op een canvas en stuurt dus al een schone JPEG,
// maar wie de API zelf aanroept (of een oudere app) kreeg die gegevens ongewijzigd op de server
// en via de kaartlink bij de patiënt. Zelfde gedachte als lib/video-locatie.js voor video's.
//
// JPEG: de segmenten APP1 (Exif, XMP), APP3–APP13 (o.a. IPTC/Photoshop) en COM gaan eruit. APP0
// (JFIF), APP2 (kleurprofiel ICC) en APP14 (Adobe, nodig voor de kleuren) blijven, alleen met die naam vooraan. Alleen de
// Exif-oriëntatie komt terug in een minimale Exif, anders stond een staande telefoonfoto ineens
// op zijn kant. Dat geldt ook tussen de scans van een progressieve JPEG, en alles na de EOI
// (extra beelden van de telefoon, met hun eigen Exif) gaat eruit. PNG: alleen de stukken voor het beeld blijven (PNG_HOUDT).
// Kan het bestand niet netjes gelezen worden, dan komt het ongewijzigd terug (de app stuurt
// sowieso een schone versie); de controle of het een echte JPEG/PNG is, gebeurt al ervoor.
// Behalve als er in dat onleesbare bestand nog herkenbare sporen staan (Exif, XMP, IPTC, tekst-
// of C2PA-stukken): dan null, en de server weigert de foto. Eén los byte tussen twee segmenten
// (een browser toont zo'n foto gewoon) liet plek en toestel anders ongewijzigd op de patiëntkaart
// staan (security 2026-11-22 20u, opgelost 2026-11-23).

function exifOrientatie(seg) {
  // seg = inhoud van APP1 zonder marker en lengte: "Exif\0\0" + TIFF
  if (seg.length < 14 || seg.toString("latin1", 0, 6) !== "Exif\0\0") return 0;
  const t = seg.subarray(6);
  const le = t.toString("latin1", 0, 2) === "II";
  if (!le && t.toString("latin1", 0, 2) !== "MM") return 0;
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > t.length) return 0;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > t.length) return 0;
    if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 0; }
  }
  return 0;
}

function minimaleExif(orientatie) {
  // APP1 met "Exif\0\0", TIFF-kop (big-endian), één IFD met alleen Orientation
  const lijf = Buffer.alloc(6 + 8 + 2 + 12 + 4);
  lijf.write("Exif\0\0", 0, "latin1");
  lijf.write("MM", 6, "latin1");
  lijf.writeUInt16BE(42, 8);
  lijf.writeUInt32BE(8, 10);
  lijf.writeUInt16BE(1, 14);
  lijf.writeUInt16BE(0x0112, 16);
  lijf.writeUInt16BE(3, 18);
  lijf.writeUInt32BE(1, 20);
  lijf.writeUInt16BE(orientatie, 24);
  lijf.writeUInt32BE(0, 28);
  const kop = Buffer.from([0xff, 0xe1, 0, 0]);
  kop.writeUInt16BE(lijf.length + 2, 2);
  return Buffer.concat([kop, lijf]);
}

// Welke APPn blijven, en alleen met de juiste naam vooraan: APP2 is ook de plek van MPF (index van
// extra beelden) en FlashPix, APP14 en APP0 kunnen van alles dragen (security 2026-11-22).
const JPEG_HOUDT = new Map([[0xe0, ["JFIF\0", "JFXX\0"]], [0xe2, ["ICC_PROFILE\0"]], [0xee, ["Adobe"]]]);
const jpegHoudt = (marker, inhoud) => (JPEG_HOUDT.get(marker) || []).some((n) => inhoud.toString("latin1", 0, n.length) === n);

function schoneJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const delen = [buf.subarray(0, 2)];
  let orientatie = 0;
  let beeld = false;
  let p = 2;
  while (p < buf.length) {
    if (buf[p] !== 0xff) return null;
    let m = p + 1;
    while (m < buf.length && buf[m] === 0xff) m++; // opvulbytes
    if (m >= buf.length) return null;
    const marker = buf[m];
    // markers zonder lengte (TEM, RSTn) zouden vóór SOS niet voorkomen; EOI zonder beeld: niet vertrouwen
    // EOI na het beeld: klaar. Alles erachter gaat weg: een telefoon zet daar extra beelden (MPF:
    // diepte, HDR, een "bewegende foto" als mp4) met hun eigen Exif, plek en toestel (security 2026-11-21).
    if (marker === 0xd9) { if (!beeld) return null; delen.push(buf.subarray(m - 1, m + 1)); break; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) return null;
    if (m + 3 > buf.length) return null;
    const lengte = buf.readUInt16BE(m + 1);
    if (lengte < 2 || m + 1 + lengte > buf.length) return null;
    const eind = m + 1 + lengte;
    if (marker === 0xda) {
      // SOS: kop plus beelddata tot de volgende echte marker. In beelddata volgt op 0xFF altijd 0x00
      // (opvulling) of een RSTn; een progressieve JPEG heeft meerdere scans, met daartussen tabellen
      // en soms ook weer APPn/COM-segmenten. Die gaan door dezelfde lus als vóór de eerste scan.
      beeld = true;
      let q = eind;
      while (q < buf.length) {
        if (buf[q] !== 0xff) { q++; continue; }
        if (q + 1 >= buf.length) { q = buf.length; break; }
        const v = buf[q + 1];
        if (v === 0x00 || (v >= 0xd0 && v <= 0xd7)) { q += 2; continue; }
        if (v === 0xff) { q++; continue; }
        break;
      }
      // geen EOI (afgekapt bestand): de rest zoals hij was, zoals een lezer hem ook toont
      if (q >= buf.length) { delen.push(buf.subarray(m - 1, buf.length)); break; }
      delen.push(buf.subarray(m - 1, q));
      p = q;
      continue;
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if ((isApp && !jpegHoudt(marker, buf.subarray(m + 3, eind))) || marker === 0xfe) {
      if (marker === 0xe1 && !orientatie) orientatie = exifOrientatie(buf.subarray(m + 3, eind));
    } else delen.push(buf.subarray(m - 1, eind));
    p = eind;
  }
  if (delen.length < 2) return null;
  // de oriëntatie direct na SOI (en na een eventuele JFIF-APP0), waar een lezer hem verwacht
  if (orientatie > 1) {
    const naJfif = delen[1] && delen[1][1] === 0xe0 ? 2 : 1;
    delen.splice(naJfif, 0, minimaleExif(orientatie));
  }
  return Buffer.concat(delen);
}

// PNG: alleen de stukken die voor het beeld nodig zijn blijven (lijst, niet een zwarte lijst). Een
// zwarte lijst liet C2PA-gegevens (caBX, met naam en toestel) en elk eigen stuk staan (security 2026-11-22).
const PNG_HOUDT = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "cHRM", "gAMA", "iCCP", "sBIT", "sRGB",
  "cICP", "mDCv", "cLLi", "bKGD", "pHYs", "acTL", "fcTL", "fdAT"]);
const PNG_KOP = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function schonePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_KOP)) return null;
  const delen = [buf.subarray(0, 8)];
  let p = 8;
  while (p + 12 <= buf.length) {
    const lengte = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    const eind = p + 12 + lengte;
    if (lengte > 0x7fffffff || eind > buf.length) return null;
    if (PNG_HOUDT.has(type)) delen.push(buf.subarray(p, eind));
    p = eind;
    if (type === "IEND") return Buffer.concat(delen);
  }
  return null;
}

// Tekens die alleen in metadata voorkomen: Exif (ook in PNG-eXIf als TIFF-kop na de naam), XMP,
// IPTC/Photoshop, de PNG-stukken met tekst of C2PA, en de plek in een meegeplakte mp4 (©xyz).
const SPOOR_TEKENS = ["Exif\0", "http://ns.adobe.com/xap", "<x:xmpmeta", "Photoshop 3.0", "eXIf", "tEXt", "zTXt", "iTXt", "caBX", "\u00a9xyz"]
  .map((t) => Buffer.from(t, "latin1"));
const heeftSporen = (buf) => SPOOR_TEKENS.some((t) => buf.indexOf(t) >= 0);

// Geeft een nieuwe buffer zonder plek-, toestel- en tekstgegevens. Onleesbaar zonder herkenbare
// sporen: het origineel. Onleesbaar mét sporen: null (de aanroeper weigert dan de foto).
export function zonderBeeldMetadata(buf, soort) {
  if (!Buffer.isBuffer(buf)) return buf;
  let schoon = null;
  try { schoon = soort === "png" ? schonePng(buf) : schoneJpeg(buf); } catch { schoon = null; }
  if (schoon) return schoon;
  return heeftSporen(buf) ? null : buf;
}

// De melding als zonderBeeldMetadata null gaf (zelfde tekst bij logo, eigen oefening en beheer)
export const BEELD_ONLEESBAAR = "Deze foto kunnen we niet goed lezen, en er staan nog gegevens van de telefoon in (zoals de plek). Sla hem opnieuw op, bijvoorbeeld als schermafbeelding, en probeer het nog eens.";
