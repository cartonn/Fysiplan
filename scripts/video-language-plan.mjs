import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const core = JSON.parse(await readFile(new URL("content/core-1000.json", root), "utf8"));
const sidecar = JSON.parse(await readFile(new URL("content/core-1000-translations.json", root), "utf8"));
const languages = ["nl", ...Object.keys(sidecar.languages || {})];
const errors = [];

if (sidecar.schemaVersion !== 1) errors.push("translation schemaVersion moet 1 zijn");
if (core.exercises?.length !== 1000) errors.push("Core 1000 moet exact 1000 oefeningen bevatten");
if (languages.length !== 9 || !languages.includes("nl")) errors.push("verwacht Nederlands plus acht vertaaltalen");

const knownIds = new Set(core.exercises.map((entry) => entry.exerciseId));
for (const [exerciseId, translated] of Object.entries(sidecar.translations || {})) {
  if (!knownIds.has(exerciseId)) errors.push(`vertaling verwijst naar onbekende oefening ${exerciseId}`);
  for (const [language, value] of Object.entries(translated || {})) {
    if (!sidecar.languages[language]) errors.push(`${exerciseId}: onbekende taal ${language}`);
    if (!["draft", "review", "approved"].includes(value.status)) errors.push(`${exerciseId}/${language}: ongeldige status`);
    for (const field of ["title", "setup", "movement", "cue", "safety", "narration"]) {
      if (!String(value[field] || "").trim()) errors.push(`${exerciseId}/${language}: ${field} ontbreekt`);
    }
    if (value.status === "approved" && (!value.reviewedBy || !/^\d{4}-\d{2}-\d{2}$/.test(value.reviewedAt || ""))) {
      errors.push(`${exerciseId}/${language}: goedgekeurde vertaling mist taalreviewer of datum`);
    }
  }
}

if (errors.length) {
  console.error("Meertalige videograaf ongeldig:\n- " + errors.join("\n- "));
  process.exit(1);
}

const translated = Object.values(sidecar.translations || {}).reduce((sum, locales) => sum + Object.keys(locales || {}).length, 0);
const approved = Object.values(sidecar.translations || {}).reduce((sum, locales) => sum + Object.values(locales || {}).filter((item) => item.status === "approved").length, 0);
const summary = {
  architecture: "shared-motion-multi-audio-sidecar-graph",
  movementMasters: core.exercises.length,
  languages,
  localeVariants: core.exercises.length * languages.length,
  dutchScriptsReadyForReview: core.exercises.length,
  translationsPresent: translated,
  translationsApproved: approved,
  translationsPending: core.exercises.length * (languages.length - 1) - translated,
  plannedAudioTracks: core.exercises.length * languages.length,
  plannedWebVttTracks: core.exercises.length * languages.length,
  renderSavings: "De bewegingsmaster wordt één keer gerenderd; taalwijzigingen vervangen alleen audio en WebVTT.",
  publicationGate: "Per taal: scriptreview + uitspraakreview + klinische eindcontrole."
};

const exportIndex = process.argv.indexOf("--export-language");
if (exportIndex !== -1) {
  const language = String(process.argv[exportIndex + 1] || "");
  if (!sidecar.languages[language]) throw new Error("Kies een vertaallanguage uit: " + Object.keys(sidecar.languages).join(", "));
  console.log(JSON.stringify({
    schemaVersion: 1,
    language,
    languageLabel: sidecar.languages[language].label,
    instructions: "Vertaal natuurlijk voor patiënten; behoud medische betekenis en voeg geen advies toe. Een moedertaalspreker met medische kennis beoordeelt iedere vertaling vóór TTS.",
    exercises: core.exercises.map((entry) => ({
      exerciseId: entry.exerciseId,
      titleNl: entry.titleNl,
      source: entry.script
    }))
  }, null, 2));
} else {
  console.log(JSON.stringify(summary, null, 2));
}
