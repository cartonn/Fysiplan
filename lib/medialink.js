// Tijdelijke links voor eigen video's en foto's van een praktijk.
//
// Alles onder /uploads/ was op te vragen door wie het adres kende: geen login, geen koppeling
// aan de kaart en geen einddatum. Het adres van een eigen opname was daarmee een blijvende
// sleutel, en op zo'n opname kan een patiënt staan. Wie de link doorstuurde of op een gedeeld
// toestel achterliet, gaf de video weg.
//
// Nu geeft de server een eigen opname of een foto van een eigen oefening alleen nog uit:
//   - via een link die bij één kaart hoort en verloopt (deze module), of
//   - aan wie is ingelogd bij de praktijk van wie het bestand is (dat regelt de server).
//
// De link is het gewone pad met drie vragen erachter: ?k=<kaart>&e=<einde>&s=<handtekening>.
// De handtekening is een HMAC over pad, kaart en einde met een sleutel die alleen de server kent.
//
// Het einde ligt op een vast raster van twaalf uur: een link is 12 tot 24 uur geldig, en binnen
// een blok van twaalf uur krijgt dezelfde kaart telkens dezelfde link. Zo bewaart de telefoon een
// foto niet bij elk bezoek opnieuw onder een ander adres.
//
// Alleen rekenen; geen opslag en geen verzoeken.
import { createHmac, timingSafeEqual } from "node:crypto";

export const VENSTER_MS = 12 * 60 * 60 * 1000;
const VIDEO = /^uploads\/videos\/v-[a-f0-9]+\.(mp4|webm)$/;
const FOTO = /^uploads\/oef-[a-f0-9]{12}\.(jpg|png)$/;
const KAART = /^[a-f0-9]{8,16}$/;

// "video" (een opname van de praktijk), "foto" (de foto van een eigen oefening) of null (de rest
// van /uploads/: bibliotheek, logo's)
export const mediaSoort = (pad) => (VIDEO.test(String(pad)) ? "video" : FOTO.test(String(pad)) ? "foto" : null);

// het einde van een link die nu wordt uitgegeven: het einde van het volgende blok van twaalf uur
export const eindeVoor = (nu = Date.now()) => (Math.floor(nu / VENSTER_MS) + 2) * VENSTER_MS;

export function handtekening(sleutel, pad, kaartId, einde) {
  return createHmac("sha256", sleutel).update(pad + "\n" + kaartId + "\n" + einde).digest("base64url").slice(0, 32);
}

// het pad met de drie vragen erachter; een pad dat geen eigen opname of foto is, blijft zoals het is
export function mediaLink(sleutel, pad, kaartId, nu = Date.now()) {
  const p = String(pad || "");
  if (!sleutel || !mediaSoort(p) || !KAART.test(String(kaartId || ""))) return p;
  const einde = eindeVoor(nu);
  return p + "?k=" + kaartId + "&e=" + einde + "&s=" + handtekening(sleutel, p, kaartId, einde);
}

// Klopt de link? Geeft het id van de kaart waar hij bij hoort, of null. Of die kaart nog bestaat
// en dit bestand nog draagt, kijkt de server daarna zelf na.
export function leesMediaLink(sleutel, pad, vragen, nu = Date.now()) {
  if (!sleutel || !mediaSoort(pad) || !vragen) return null;
  const k = String(vragen.get("k") || ""), e = String(vragen.get("e") || ""), s = String(vragen.get("s") || "");
  if (!KAART.test(k) || !/^\d{13}$/.test(e) || !/^[A-Za-z0-9_-]{32}$/.test(s)) return null;
  const einde = Number(e);
  // verlopen, of een einde dat de server zelf nooit zou uitgeven
  if (einde <= nu || einde > eindeVoor(nu) || einde % VENSTER_MS !== 0) return null;
  const goed = Buffer.from(handtekening(sleutel, pad, k, einde)), gekregen = Buffer.from(s);
  return goed.length === gekregen.length && timingSafeEqual(goed, gekregen) ? k : null;
}
