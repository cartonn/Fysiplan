// Locatie uit een gekozen video halen (legal 2026-11-18, art. 5 lid 1 c en art. 25 AVG).
//
// Sinds #355 kiest een therapeut op /o ook naast een werkende camera een video uit de galerij.
// Een video van een telefoon (iPhone .mov, Android .mp4) draagt vaak de plek waar hij is
// opgenomen (GPS), en merk en type van de telefoon. Fysiplan heeft die niet nodig; de patiënt
// kreeg ze wel mee bij het openen van de video. Een opname met de camera in de browser
// (MediaRecorder) heeft ze niet.
//
// Hoe: in een mp4/mov (ISO-BMFF) staan zulke gegevens in losse dozen: `udta` (met onder meer
// `©xyz`) en `meta` in `moov` en in elke `trak`, een `meta` of XMP-`uuid` op het hoogste niveau.
// Die dozen krijgen het type `free` en hun inhoud wordt nullen. Lengte en plaats van alles
// blijven gelijk, dus de verwijzingen naar het beeld (stco/co64) kloppen nog en de video speelt
// zoals hij was. Zonder dependency en zonder herschrijven van het bestand.
const XMP_UUID = "be7acfcb97a942e89c71999491e3afac";
const WEG = new Set(["udta", "meta"]);

function dozen(buf, van, tot) {
  const uit = [];
  let p = van;
  while (p + 8 <= tot) {
    let grootte = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    let kop = 8;
    if (grootte === 1) {
      if (p + 16 > tot) break;
      const groot = buf.readBigUInt64BE(p + 8);
      if (groot > BigInt(tot - p)) break;
      grootte = Number(groot);
      kop = 16;
    } else if (grootte === 0) grootte = tot - p;
    if (grootte < kop || p + grootte > tot) break;
    uit.push({ p, grootte, type, kop });
    p += grootte;
  }
  return uit;
}

function wis(buf, d) {
  buf.write("free", d.p + 4, "latin1");
  buf.fill(0, d.p + d.kop, d.p + d.grootte);
}

// Past `buf` ter plekke aan; geeft het aantal gewiste dozen terug. Geen geldige mp4: 0, niets veranderd.
export function wisVideoLocatie(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16 || buf.toString("latin1", 4, 8) !== "ftyp") return 0;
  let n = 0;
  for (const d of dozen(buf, 0, buf.length)) {
    if (d.type === "meta" || (d.type === "uuid" && d.grootte >= d.kop + 16 &&
      buf.toString("hex", d.p + d.kop, d.p + d.kop + 16) === XMP_UUID)) { wis(buf, d); n++; continue; }
    if (d.type !== "moov") continue;
    for (const m of dozen(buf, d.p + d.kop, d.p + d.grootte)) {
      if (WEG.has(m.type)) { wis(buf, m); n++; continue; }
      if (m.type !== "trak") continue;
      for (const t of dozen(buf, m.p + m.kop, m.p + m.grootte)) {
        if (WEG.has(t.type)) { wis(buf, t); n++; }
      }
    }
  }
  return n;
}
