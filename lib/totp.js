// Tweede stap bij het inloggen: codes uit een code-app (TOTP, RFC 6238 met HMAC-SHA1, een
// nieuwe code per 30 seconden, 6 cijfers). Dat is wat Google Authenticator, Microsoft
// Authenticator, 1Password en de wachtwoordapp van iOS allemaal lezen. Zonder afhankelijkheden;
// `npm run test:tweedestap` controleert de rekenkern tegen de testvectoren uit de RFC.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALFABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STAP_S = 30;
export const CIJFERS = 6;

export function base32(buf) {
  let bits = 0, waarde = 0, uit = "";
  for (const byte of buf) {
    waarde = (waarde << 8) | byte; bits += 8;
    while (bits >= 5) { uit += ALFABET[(waarde >>> (bits - 5)) & 31]; bits -= 5; }
    waarde &= (1 << bits) - 1;
  }
  if (bits > 0) uit += ALFABET[(waarde << (5 - bits)) & 31];
  return uit;
}
// geeft null bij een teken buiten het alfabet (spaties, streepjes en = mogen ertussen staan)
export function base32Naar(tekst) {
  const schoon = String(tekst || "").toUpperCase().replace(/[\s=-]/g, "");
  if (!schoon || /[^A-Z2-7]/.test(schoon)) return null;
  let bits = 0, waarde = 0;
  const uit = [];
  for (const teken of schoon) {
    waarde = (waarde << 5) | ALFABET.indexOf(teken); bits += 5;
    if (bits >= 8) { uit.push((waarde >>> (bits - 8)) & 255); bits -= 8; }
    waarde &= (1 << bits) - 1;
  }
  return Buffer.from(uit);
}
// 160 bits, de lengte die de RFC aanraadt en die elke code-app aankan
export const nieuwGeheim = () => base32(randomBytes(20));
export const stapVan = (ms) => Math.floor(ms / 1000 / STAP_S);
// de code voor één tijdstap (HOTP, RFC 4226)
export function codeVoor(geheim, stap) {
  const sleutel = Buffer.isBuffer(geheim) ? geheim : base32Naar(geheim);
  if (!sleutel || !sleutel.length) return null;
  const teller = Buffer.alloc(8);
  teller.writeBigUInt64BE(BigInt(stap));
  const h = createHmac("sha1", sleutel).update(teller).digest();
  const o = h[h.length - 1] & 15;
  const getal = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(getal % 10 ** CIJFERS).padStart(CIJFERS, "0");
}
// Klopt de ingetikte code? Eén stap terug en één vooruit tellen mee (klok van de telefoon).
// Geeft de tijdstap waarop de code klopte, of null. `na` is de laatst gebruikte stap: een code
// van die stap of eerder telt niet meer, zodat een afgekeken code niet nog eens werkt.
export function controleer(geheim, invoer, ms = Date.now(), na = 0) {
  const code = String(invoer || "").replace(/\s/g, "");
  if (!new RegExp("^\\d{" + CIJFERS + "}$").test(code)) return null;
  const nu = stapVan(ms);
  let treffer = null;
  for (const stap of [nu - 1, nu, nu + 1]) {
    const goed = codeVoor(geheim, stap);
    // elke stap vergelijken, in vaste tijd: de duur verraadt niet welke stap raak was
    if (goed && timingSafeEqual(Buffer.from(goed), Buffer.from(code)) && stap > na && treffer == null) treffer = stap;
  }
  return treffer;
}
// De link achter de QR-code die de code-app scant. SHA1, 6 cijfers en 30 seconden zijn de
// standaard van elke code-app en staan er daarom niet in: zo blijft de link kort genoeg voor de
// eigen QR-encoder (public/qr.js leest in de ruime stand hooguit OTPAUTH_MAX bytes). Past het
// niet, dan valt eerst de losse uitgever weg (de naam vóór de dubbele punt zegt hetzelfde) en
// daarna het adres: in de code-app staat dan alleen "Fysiplan".
export const OTPAUTH_MAX = 106;
export function otpauth(geheim, account, uitgever = "Fysiplan") {
  const basis = "otpauth://totp/" + encodeURIComponent(uitgever);
  const geheimDeel = "?secret=" + geheim, uitgeverDeel = "&issuer=" + encodeURIComponent(uitgever);
  // een @ mag in dit deel van een link gewoon blijven staan; de rest wordt wel gecodeerd
  const naam = account ? ":" + encodeURIComponent(String(account)).replace(/%40/g, "@") : "";
  const past = (link) => Buffer.byteLength(link) <= OTPAUTH_MAX;
  if (naam && past(basis + naam + geheimDeel + uitgeverDeel)) return basis + naam + geheimDeel + uitgeverDeel;
  if (naam && past(basis + naam + geheimDeel)) return basis + naam + geheimDeel;
  return basis + geheimDeel + uitgeverDeel;
}
// reservecodes voor wie zijn telefoon kwijt is: 80 bits, vier blokken van vier, één keer bruikbaar
export const nieuweReservecode = () => base32(randomBytes(10)).replace(/(.{4})(?=.)/g, "$1-");
export const reservecodeNormaal = (invoer) => {
  const kaal = String(invoer || "").toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z2-7]{16}$/.test(kaal) ? kaal : "";
};
