// Eén byte-range voor één bestand van bekende grootte, volgens RFC 9110 §14.
//
// Waarom dit een eigen module is: de server had twee handgeschreven parsers (stem-
// opnames en praktijkvideo's) en beide lazen een suffix-verzoek "bytes=-500" als
// "bytes 0 t/m 500" in plaats van "de laatste 500 bytes". Mediaspelers vragen het
// einde van een bestand juist zo op (o.a. voor de moov-atom van een mp4 en de
// ID3v1-tag van een mp3); ze kregen dan het begin terug met een kop die beweerde dat
// het het einde was.
//
// Uitkomst:
//   { status: 200 }                       Range negeren en het hele bestand sturen
//   { status: 416 }                       geldig verzoek, maar niets van te leveren
//   { status: 206, start, end }           inclusief eindpositie, zoals Content-Range
//
// Keuzes, met de RFC-grond:
//   * een andere eenheid, meerdere ranges, of onleesbare syntax: negeren (200). Een
//     server mag Range altijd negeren; meerdere ranges zouden multipart/byteranges
//     vereisen, en daar heeft geen enkele speler hier iets aan.
//   * "bytes=5-2" (laatste < eerste) is volgens §14.1.1 ongeldig, niet onvervulbaar:
//     negeren (200).
//   * "bytes=-0" of een begin voorbij het einde: onvervulbaar (416).
//   * een suffix langer dan het bestand levert het hele bestand als 206.
//   * een laatste positie voorbij het einde wordt afgekapt op het einde.
export function byteRange(header, size) {
  if (header == null) return { status: 200 };
  const waarde = String(header).trim();
  if (!waarde) return { status: 200 };
  const eenheid = /^bytes=([^,]*)$/i.exec(waarde);
  if (!eenheid) return { status: 200 };
  const delen = /^\s*(\d*)-(\d*)\s*$/.exec(eenheid[1]);
  if (!delen || (delen[1] === '' && delen[2] === '')) return { status: 200 };
  if (!Number.isInteger(size) || size < 0) return { status: 200 };

  if (delen[1] === '') {
    const lengte = Number(delen[2]);
    if (lengte === 0 || size === 0) return { status: 416 };
    return { status: 206, start: Math.max(0, size - lengte), end: size - 1 };
  }

  const eerste = Number(delen[1]);
  const laatste = delen[2] === '' ? Infinity : Number(delen[2]);
  if (laatste < eerste) return { status: 200 };
  if (eerste >= size) return { status: 416 };
  return { status: 206, start: eerste, end: Math.min(laatste, size - 1) };
}
