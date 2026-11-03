// Dekking per V2-categorie, uit de basiscatalogus van de repository.
//
// Telt per weergavecategorie (zelfde aliassen en groepen als de bibliotheek in index.html)
// hoeveel oefeningen er zijn, hoeveel een beeld hebben, hoeveel via een secundaire categorie
// meetellen, en welke bestaande oefeningen nog een beeld missen: dat zijn de echte gaten
// voor nieuwe beelden. Afgekeurde beelden en uitleghoudingen worden apart geteld, want die
// ziet de patiënt niet of niet volledig.
//
// Wat dit NIET is: de productiestand. Runtime-overrides (data/categorie-wijzigingen.json op
// de server) staan niet in de repository; die vervangen groep en ook van een oefening en
// gaan altijd voor. Ook geen klinische dekking: een telling zegt niets over geschiktheid.
//
//   node scripts/category-coverage.mjs            # rapport op stdout
//   node scripts/category-coverage.mjs --write    # schrijf output/category-coverage-report.json
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exerciseId } from '../lib/exercise-id.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPORT_FILE = 'output/category-coverage-report.json';
const INPUTS = ['public/oefeningen-v2.json', 'public/mobile-media-review.json', 'public/mobile-narration-review.json',
  'public/index.html', 'content/category-secondary-evidence.json'];

// De weergaveregels van de bibliotheek zelf, niet een kopie die kan afwijken.
export function weergave(root = ROOT) {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const blok = html.split('// CATEGORY_DISPLAY_START')[1].split('// CATEGORY_DISPLAY_END')[0];
  const ctx = vm.createContext({});
  vm.runInContext(blok, ctx);
  const { groups, aliases } = JSON.parse(vm.runInContext('JSON.stringify({groups,aliases:[...aliases]})', ctx));
  return { groups, aliases: new Map(aliases), displayLabel: ctx.displayLabel };
}

export function berekenDekking(root = ROOT) {
  const lees = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const v2 = lees('public/oefeningen-v2.json');
  const media = lees('public/mobile-media-review.json');
  const uitleg = lees('public/mobile-narration-review.json');
  const bewijs = lees('content/category-secondary-evidence.json');
  const { groups, displayLabel } = weergave(root);

  const klaar = (e) => {
    const bron = String(e.kaartImg || e.img || '').replace(/^\/+/, '');
    return Boolean(bron) && fs.existsSync(path.join(root, 'public', bron));
  };
  // zelfde sleutel als mediaWithheld in kaart.html: exerciseId|bron zonder v2-voorvoegsel
  const bronVan = (e) => String(e.kaartImg || e.img || '').replace(/^\/+/, '').replace(/^v2\//, '');
  const afgekeurd = new Set([...media.entries, ...(media.rejectedSources || [])]
    .filter((r) => r.status === 'rejected').map((r) => r.exerciseId + '|' + r.source));
  const houdingen = uitleg.holds.filter((h) => h.status === 'hold');
  const gehouden = (e, id) => houdingen.some((h) => (h.exerciseId && h.exerciseId === id) || h.name === e.naam);

  const geenAutoVulling = new Set(bewijs.noAutoFill.categories);
  const groepVan = new Map(groups.flatMap(([titel, labels]) => labels.map((l) => [l, titel])));
  const perCategorie = new Map();
  const cat = (label) => {
    if (!perCategorie.has(label)) perCategorie.set(label, { category: label, group: groepVan.get(label) || 'Eigen categorieën',
      storedLabels: new Set(), records: 0, primary: 0, primaryAvailable: 0, secondary: 0, secondaryAvailable: 0,
      available: 0, availableClean: 0, mediaRejected: 0, explanationHeld: 0, missingAssets: [], secondaryRecords: [] });
    return perCategorie.get(label);
  };
  for (const e of v2) {
    const id = exerciseId(e), heeftBeeld = klaar(e);
    const isAfgekeurd = afgekeurd.has(id + '|' + bronVan(e)), isGehouden = gehouden(e, id);
    const labels = new Map();
    labels.set(displayLabel(e.groep), { stored: e.groep, primair: true });
    for (const o of e.ook || []) if (!labels.has(displayLabel(o))) labels.set(displayLabel(o), { stored: o, primair: false });
    for (const [label, { stored, primair }] of labels) {
      const c = cat(label);
      c.storedLabels.add(stored); c.records++;
      if (primair) { c.primary++; if (heeftBeeld) c.primaryAvailable++; }
      else { c.secondary++; if (heeftBeeld) c.secondaryAvailable++; c.secondaryRecords.push(e.naam); }
      if (heeftBeeld) {
        c.available++;
        if (isAfgekeurd) c.mediaRejected++;
        if (isGehouden) c.explanationHeld++;
        if (!isAfgekeurd && !isGehouden) c.availableClean++;
      } else if (primair) {
        c.missingAssets.push({ name: e.naam, exerciseId: id, ...(e.coreExerciseId ? { coreExerciseId: e.coreExerciseId } : {}) });
      }
    }
  }
  const volgorde = groups.flatMap(([, labels]) => labels);
  const categorieen = [...perCategorie.values()]
    .map((c) => ({ ...c, storedLabels: [...c.storedLabels].sort(), noAutoFill: geenAutoVulling.has(c.category),
      gap: c.available === 0 ? 'geen-beschikbare-oefening' : c.missingAssets.length ? 'deels-zonder-beeld' : 'geen' }))
    .sort((a, b) => (volgorde.indexOf(a.category) + 1 || 999) - (volgorde.indexOf(b.category) + 1 || 999) || a.category.localeCompare(b.category, 'nl'));

  const inputs = Object.fromEntries(INPUTS.map((p) => [p, createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex').slice(0, 16)]));
  return {
    scope: 'Basiscatalogus in de repository (public/oefeningen-v2.json). Runtime-overrides op de server niet meegeteld; die gaan altijd voor.',
    inputs,
    totals: {
      records: v2.length,
      available: v2.filter(klaar).length,
      withoutAsset: v2.filter((e) => !klaar(e)).length,
      withSecondary: v2.filter((e) => (e.ook || []).length).length,
      secondaryLabels: v2.reduce((n, e) => n + (e.ook || []).length, 0),
      evidence: { preexisting: bewijs.preexisting.length, earlier: bewijs.earlier.length, mappings: bewijs.mappings.length, notApplied: bewijs.notApplied.length }
    },
    assetGaps: categorieen.filter((c) => c.missingAssets.length).map((c) => ({
      category: c.category, missingAssets: c.missingAssets.length, availableIncludingSecondary: c.available,
      noAutoFill: c.noAutoFill,
      note: c.noAutoFill
        ? 'Alleen nieuwe, specifiek beoordeelde beelden bij bestaande records; niet aanvullen met algemene oefeningen via een secundaire categorie.'
        : c.available === 0
          ? 'Geen enkele beschikbare oefening; beelden voor bestaande records nodig.'
          : 'Deels beschikbaar; ontbrekende records hebben een beeld nodig.'
    })),
    categories: categorieen
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rapport = berekenDekking();
  const json = JSON.stringify(rapport, null, 1) + '\n';
  if (process.argv.includes('--write')) {
    fs.writeFileSync(path.join(ROOT, REPORT_FILE), json);
    console.log('Geschreven: ' + REPORT_FILE);
  }
  const t = rapport.totals;
  console.log(`V2-dekking: ${t.records} records, ${t.available} met beeld, ${t.withoutAsset} zonder beeld; ${t.withSecondary} met secundaire categorie.`);
  for (const c of rapport.categories) {
    console.log(`  ${c.category.padEnd(31)} beschikbaar ${String(c.available).padStart(3)} (primair ${c.primaryAvailable}, secundair ${c.secondaryAvailable}, schoon ${c.availableClean})` +
      `  zonder beeld ${String(c.missingAssets.length).padStart(3)}${c.noAutoFill ? '  [niet auto-vullen]' : ''}`);
  }
}
