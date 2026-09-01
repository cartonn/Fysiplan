const CODE_PATTERN = /^[A-Z]{2}\d{2}(?:-[2-9]|-[1-9]\d{1,2})?$/;
const FULL_DATE_PATTERN = /\b(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}\b/g;

function letters(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .match(/[A-Z]+/g) || [];
}

export function normalizePatientCode(value) {
  const code = String(value || "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "");
  return CODE_PATTERN.test(code) ? code : "";
}

export function patientCodeFromNameAndBirthDate(name, birthDate, now = new Date()) {
  const parts = letters(name);
  if (!parts.length) return "";
  const initials = parts.length === 1
    ? (parts[0].slice(0, 2).padEnd(2, parts[0][0]))
    : parts[0][0] + parts[parts.length - 1][0];
  const raw = String(birthDate || "").trim();
  let day, month, year;
  let match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]((?:19|20)\d{2})$/);
  if (match) [, day, month, year] = match;
  else {
    match = raw.match(/^((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})$/);
    if (match) [, year, month, day] = match;
  }
  if (!match) return "";
  const d = Number(day), m = Number(month), y = Number(year);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > now.getUTCFullYear() || check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return "";
  return initials + String(y).slice(-2);
}

function patientCodeFromLegacy(card, fallbackIndex) {
  const client = card && typeof card.client === "object" ? card.client : {};
  const existing = normalizePatientCode(client.c_code) || normalizePatientCode(card && card.naam);
  if (existing) return existing;
  const parts = letters(client.c_naam || (card && card.naam));
  if (parts.length) {
    const initials = parts.length === 1
      ? parts[0].slice(0, 2).padEnd(2, parts[0][0])
      : parts[0][0] + parts[parts.length - 1][0];
    const age = Number.parseInt(String(client.c_leeftijd || "").replace(/\D/g, ""), 10);
    return initials + (Number.isInteger(age) && age >= 0 && age <= 99 ? String(age).padStart(2, "0") : "00");
  }
  const id = String(card && card.id || "");
  let seed = fallbackIndex + 1;
  for (let i = 0; i < id.length; i++) seed = (seed * 33 + id.charCodeAt(i)) % 100;
  return "FP" + String(seed).padStart(2, "0");
}

export function redactFullDates(value) {
  return String(value == null ? "" : value).replace(FULL_DATE_PATTERN, "[datum verwijderd]");
}

export function containsFullDate(value) {
  FULL_DATE_PATTERN.lastIndex = 0;
  return FULL_DATE_PATTERN.test(String(value == null ? "" : value));
}

export function hasForbiddenDirectIdentifiers(client) {
  if (!client || typeof client !== "object") return false;
  return ["c_naam", "c_leeftijd", "c_geboortedatum", "c_dob", "naam", "geboortedatum", "birthDate", "dateOfBirth"]
    .some((key) => Object.prototype.hasOwnProperty.call(client, key));
}

export function sanitizePatientClient(client, code, maxLength = 500) {
  const clean = { c_code: normalizePatientCode(code) };
  const source = client && typeof client === "object" ? client : {};
  for (const key of ["c_hf", "c_zone", "c_opm", "c_cave", "c_doel"]) {
    const value = redactFullDates(source[key]).slice(0, maxLength);
    if (value) clean[key] = value;
  }
  return clean;
}

export function migratePatientCardStore(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = {};
  let changed = false;
  for (const [practiceKey, rawMap] of Object.entries(source)) {
    if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) { changed = true; continue; }
    const nextMap = {};
    let index = 0;
    for (const [oldKey, rawCard] of Object.entries(rawMap)) {
      if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) { changed = true; continue; }
      index++;
      const base = patientCodeFromLegacy(rawCard, index);
      let code = base, suffix = 2;
      while (nextMap[code.toLowerCase()]) code = base + "-" + suffix++;
      const next = { ...rawCard, naam: code, client: sanitizePatientClient(rawCard.client, code) };
      delete next.geboortedatum;
      delete next.birthDate;
      nextMap[code.toLowerCase()] = next;
      if (oldKey !== code.toLowerCase() || JSON.stringify(next) !== JSON.stringify(rawCard)) changed = true;
    }
    if (Object.keys(nextMap).length) output[practiceKey] = nextMap;
    else if (Object.keys(rawMap).length) changed = true;
  }
  return { cards: output, changed };
}

export const patientCodePattern = CODE_PATTERN;
