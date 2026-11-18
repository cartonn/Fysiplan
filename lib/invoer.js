// Vaste controle op invoer (reviewlijst punt 15). Eén plek die zegt wat een verzoek mag bevatten,
// in plaats van per route een eigen JSON.parse en eigen grenzen.
//
// leesObject: de body moet een JSON-object zijn (geen lijst, geen null, geen tekst), anders null.
// De controles geven de schone waarde terug, of undefined als de waarde niet klopt.

export async function leesObject(request, readBody, max) {
  let b;
  try { b = JSON.parse(await (max ? readBody(request, max) : readBody(request))); } catch { return null; }
  return b && typeof b === "object" && !Array.isArray(b) ? b : null;
}

// een geheel getal binnen [min, max]; geen tekst, geen 3.5, geen NaN
export function geheel(x, min, max) {
  return typeof x === "number" && Number.isInteger(x) && x >= min && x <= max ? x : undefined;
}

// een waarde uit een vaste lijst
export function eenVan(x, lijst) {
  // alleen een echte tekst: ["vraag"] of een getal telt niet (security-backlog 2026-11-13)
  return typeof x === "string" && lijst.includes(x) ? x : undefined;
}

// een index in een lijst (een getal of een tekst met alleen cijfers, zonder voorloopnullen;
// geen lijst als [0], die String() anders als "0" las)
export function index(x, lengte) {
  const n = typeof x === "number" ? x : typeof x === "string" && /^(0|[1-9]\d{0,3})$/.test(x) ? Number(x) : NaN;
  return Number.isInteger(n) && n >= 0 && n < lengte ? n : undefined;
}
