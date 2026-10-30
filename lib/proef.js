// Gratis proefperiode (v2): controle van het aanmeldformulier op /v2/proef.
// Pure functies zonder opslag of netwerk, zodat ze los te testen zijn
// (scripts/test-proef.mjs). De server bewaart en mailt; dit bestand beslist
// alleen of wat iemand intikt bruikbaar is.

export const PROEF_DAGEN = 14;

// veelgemaakte tikfouten in het domein: we verbeteren niet stil, maar vragen
// "bedoel je …?" — een verkeerd adres is een gemiste klant
const DOMEIN_TIKFOUT = {
  "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com",
  "gnail.com": "gmail.com", "gmail.co": "gmail.com", "gmail.nl": "gmail.com", "gmaill.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmil.com": "hotmail.com",
  "hotmail.co": "hotmail.com", "hotmial.nl": "hotmail.nl", "hotmal.nl": "hotmail.nl", "hotmai.nl": "hotmail.nl",
  "outlok.com": "outlook.com", "outllok.com": "outlook.com", "outloo.com": "outlook.com", "outlook.co": "outlook.com",
  "outlok.nl": "outlook.nl", "live.nll": "live.nl", "ziggo.nll": "ziggo.nl", "kpnmail.nll": "kpnmail.nl",
  "icloud.co": "icloud.com", "iclod.com": "icloud.com", "icoud.com": "icloud.com"
};
const TLD_TIKFOUT = { con: "com", cmo: "com", ocm: "com", vom: "com", nll: "nl", lnl: "nl", nk: "nl" };

// wegwerpadressen: zo'n aanmelding kunnen we nooit terugbellen of mailen
const WEGWERP = new Set(["mailinator.com", "yopmail.com", "10minutemail.com", "guerrillamail.com", "tempmail.com",
  "temp-mail.org", "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "tempail.com"]);

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}$/i;

export function emailSuggestie(email) {
  const at = email.lastIndexOf("@");
  if (at < 1) return "";
  const lokaal = email.slice(0, at), domein = email.slice(at + 1);
  if (DOMEIN_TIKFOUT[domein]) return lokaal + "@" + DOMEIN_TIKFOUT[domein];
  const punt = domein.lastIndexOf(".");
  const tld = punt > 0 ? domein.slice(punt + 1) : "";
  if (TLD_TIKFOUT[tld]) return lokaal + "@" + domein.slice(0, punt + 1) + TLD_TIKFOUT[tld];
  return "";
}

// Telefoon naar E.164 (+31612345678). Nederlands nummer: 10 cijfers met een 0
// vooraan, of +31/0031 met 9 cijfers. Buitenlands (België, Duitsland, …): +
// met 8 tot 15 cijfers. Levert "" als het geen bruikbaar nummer is.
export function normaliseerTelefoon(invoer) {
  let t = String(invoer || "").trim().replace(/[\s\-().\/]/g, "");
  if (t.startsWith("00")) t = "+" + t.slice(2);
  // +31 (0)6… — het nulletje tussen haakjes is al weggehaald, de 0 zelf niet
  if (t.startsWith("+310")) t = "+31" + t.slice(4);
  let e164 = "";
  if (/^0[1-9]\d{8}$/.test(t)) e164 = "+31" + t.slice(1);
  else if (/^\+31[1-9]\d{8}$/.test(t)) e164 = t;
  else if (/^\+(?!31)[1-9]\d{7,14}$/.test(t)) e164 = t;
  if (!e164) return "";
  // 0000000000, 0611111111 en dergelijke: geen echt nummer
  const cijfers = e164.replace(/^\+31/, "").replace(/^\+/, "");
  if (/^(\d)\1+$/.test(cijfers.slice(1)) || cijfers === "612345678" || cijfers === "123456789") return "";
  return e164;
}

// leesbaar terug: +31612345678 -> 06 1234 5678, +31201234567 -> 020 123 4567
export function telefoonWeergave(e164) {
  const t = String(e164 || "");
  if (!t.startsWith("+31")) return t;
  const n = "0" + t.slice(3);
  if (n.startsWith("06")) return n.slice(0, 2) + " " + n.slice(2, 6) + " " + n.slice(6);
  // grote steden hebben een netnummer van drie cijfers (020, 010, 030, 070, …)
  if (/^0[1-7]0/.test(n)) return n.slice(0, 3) + " " + n.slice(3, 6) + " " + n.slice(6);
  return n.slice(0, 4) + " " + n.slice(4, 7) + " " + n.slice(7);
}

const schoon = (v, max) => String(v == null ? "" : v).normalize("NFKC")
  .replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

// b: de formuliervelden ({ email, naam, tel, praktijk, akkoord, email_ok }).
// Geeft { ok, waarden, fouten, suggestie } terug; fouten is per veld een zin.
export function valideerAanmelding(b) {
  const fouten = {};
  const email = schoon(b.email, 200).toLowerCase().replace(/\s/g, "");
  const naam = schoon(b.naam, 80);
  const telInvoer = schoon(b.tel, 40);
  const praktijk = schoon(b.praktijk, 80);
  let suggestie = "";

  if (!email) fouten.email = "Vul je e-mailadres in.";
  else if (!EMAIL_RE.test(email)) fouten.email = "Dit e-mailadres klopt niet; controleer de @ en de punt.";
  else if (WEGWERP.has(email.split("@")[1])) fouten.email = "Gebruik je eigen werk- of privéadres; tijdelijke adressen werken niet.";
  else {
    suggestie = emailSuggestie(email);
    // de tweede keer (email_ok staat aan) laten we het adres staan zoals het is
    if (suggestie && !b.email_ok) fouten.email = "Bedoel je " + suggestie + "?";
    else suggestie = "";
  }

  if (!naam) fouten.naam = "Vul de naam van de contactpersoon in.";
  else if ((naam.match(/\p{L}/gu) || []).length < 2) fouten.naam = "Vul een echte naam in, bijvoorbeeld Sanne de Vries.";

  const tel = normaliseerTelefoon(telInvoer);
  if (!telInvoer) fouten.tel = "Vul je telefoonnummer in.";
  else if (!tel) fouten.tel = "Dit nummer klopt niet. Gebruik 10 cijfers, zoals 06 1234 5678, of +32 voor België.";

  if (!b.akkoord) fouten.akkoord = "Vink aan dat we je gegevens voor de proef mogen gebruiken.";

  return { ok: Object.keys(fouten).length === 0, waarden: { email, naam, tel, telInvoer, praktijk }, fouten, suggestie };
}

// "nog 3 dagen", "nog 1 dag", "laatste dag"; dagen tellen per kalenderdag
export function dagenOver(verloopt, nu = Date.now()) {
  return Math.max(0, Math.ceil((verloopt - nu) / 86400000));
}
