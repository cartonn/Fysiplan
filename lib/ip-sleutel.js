// De sleutel voor alle per-IP-remmen (schrijven, lezen, inloggen, beheersleutel, aanmelden, hulp).
//
// IPv4 blijft zoals het is. IPv6 telt per /64: één abonnee heeft doorgaans een heel /64-blok en
// kan met elk verzoek een vers adres nemen. Het blok moet dan wel uit het volledige adres komen.
// De oude sleutel nam de eerste vier stukken tussen de dubbele punten van de tekst zoals die
// binnenkwam; in een ingekort adres ("2001:db8::1:2:3:4", waar "::" nullen vervangt) zijn dat
// niet de eerste vier groepen. Elk adres in zo'n blok kreeg zo een eigen teller: tot 65.536
// keer zoveel pogingen als de rem toestaat (security 2026-11-16). Nu wordt het adres eerst
// volledig uitgeschreven; hoofdletters, voorloopnullen, een zone (%eth0), haakjes en een IPv4-
// adres in IPv6-jasje (::ffff:1.2.3.4) geven dezelfde sleutel als het gewone adres.
import { isIPv4, isIPv6 } from "node:net";

function groepen(ip) {
  let s = ip;
  // een IPv4-staart (::ffff:1.2.3.4) wordt twee groepen
  const v4 = s.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    if (!isIPv4(v4[2])) return null;
    const b = v4[2].split(".").map(Number);
    s = v4[1] + ((b[0] << 8) | b[1]).toString(16) + ":" + ((b[2] << 8) | b[3]).toString(16);
  }
  const helften = s.split("::");
  if (helften.length > 2) return null;
  const deel = (t) => (t ? t.split(":") : []);
  const links = deel(helften[0]), rechts = helften.length === 2 ? deel(helften[1]) : [];
  const ontbreekt = 8 - links.length - rechts.length;
  if (helften.length === 2 ? ontbreekt < 1 : ontbreekt !== 0) return null;
  const alle = [...links, ...Array(helften.length === 2 ? ontbreekt : 0).fill("0"), ...rechts];
  if (!alle.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return alle.map((g) => parseInt(g, 16));
}

export function ipSleutel(ruw) {
  let ip = String(ruw == null ? "" : ruw).trim().toLowerCase();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  ip = ip.replace(/%.*$/, "");
  if (isIPv4(ip)) return ip;
  if (!isIPv6(ip)) return ip.slice(0, 64) || "?";
  const g = groepen(ip);
  if (!g) return ip.slice(0, 64);
  // ::ffff:a.b.c.d is gewoon een IPv4-adres
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join(".");
  return g.slice(0, 4).map((x) => x.toString(16)).join(":") + "::/64";
}

// Het grotere blok rond een adres, voor een tweede, ruimere rem naast ipSleutel: IPv6 per /48
// (een site of een gratis tunnel heeft er een, dus 65.536 blokken van /64), IPv4 per /24.
// Zonder dit blok kreeg wie een /48 heeft 65.536 keer elke rem per /64 (security 2026-11-20).
export function ipBlok(ruw) {
  const s = ipSleutel(ruw);
  if (isIPv4(s)) return s.split(".").slice(0, 3).join(".") + ".0/24";
  const m = s.match(/^([0-9a-f]{1,4}:[0-9a-f]{1,4}:[0-9a-f]{1,4}):[0-9a-f]{1,4}::\/64$/);
  return m ? m[1] + "::/48" : s;
}
