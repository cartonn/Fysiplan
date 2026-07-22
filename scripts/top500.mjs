import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const corePath = new URL("content/core-1000.json", root);
const selectionPath = new URL("content/top-500-selection.json", root);
const cataloguePath = new URL("public/oefeningen-v2.json", root);
const shouldWrite = process.argv.includes("--write");

const pickGroups = [
  {
    source: "Schouder", target: "Bovenste extremiteit", picks: {
      "Schouder voorwaarts heffen": ["geleid met stok", "actief zonder gewicht", "isometrisch tegen muur", "met elastiek", "functioneel reikend"],
      "Schouder zijwaarts heffen": ["geleid met stok", "actief zonder gewicht", "isometrisch tegen muur", "met elastiek", "functioneel reikend"],
      "Schouder naar buiten draaien": ["actief zonder gewicht", "isometrisch tegen muur", "met elastiek"],
      "Schouder naar binnen draaien": ["actief zonder gewicht", "isometrisch tegen muur", "met elastiek"],
      "Schouderblad naar achteren": ["actief zonder gewicht", "isometrisch tegen muur", "met elastiek"],
      "Schouderblad omhoog draaien": ["actief zonder gewicht", "met elastiek", "functioneel reikend"],
      "Serratus punch": ["actief zonder gewicht", "met elastiek", "functioneel reikend"],
      "Schouder extensie": ["actief zonder gewicht", "met elastiek", "functioneel reikend"],
      "Horizontaal openen": ["actief zonder gewicht", "met elastiek"],
      "Onderste trapezius heffen": ["actief zonder gewicht", "functioneel reikend"],
      "Schouder pendelen": ["actief zonder gewicht"],
      "Hand achter de rug brengen": ["actief zonder gewicht", "functioneel reikend"]
    }
  },
  {
    source: "Elleboog, pols en hand", target: "Bovenste extremiteit", picks: {
      "Elleboog buigen": ["actief", "met lichte weerstand"],
      "Elleboog strekken": ["actief"],
      "Onderarm naar handpalm boven": ["actief"],
      "Onderarm naar handpalm onder": ["actief"],
      "Pols omhoog": ["actief", "met lichte weerstand"],
      "Pols omlaag": ["actief"],
      "Pols naar duimzijde": ["actief"],
      "Pols naar pinkzijde": ["actief"],
      "Vingers openen en sluiten": ["actief"],
      "Duim oppositie": ["actief"],
      "Peesglijden hand": ["actief"],
      "Knijpkracht": ["actief", "met lichte weerstand"]
    }
  },
  {
    source: "Heup", target: "Onderste extremiteit", picks: {
      "Heup buigen": ["liggend ondersteund", "staand met steun", "met elastiek"],
      "Heup strekken": ["staand met steun", "met elastiek", "functioneel op één been"],
      "Heup zijwaarts heffen": ["zijlig", "staand met steun", "met elastiek", "functioneel op één been"],
      "Heup naar binnen bewegen": ["liggend ondersteund", "staand met steun", "met elastiek"],
      "Heup naar buiten draaien": ["liggend ondersteund", "zijlig", "met elastiek"],
      "Heup naar binnen draaien": ["liggend ondersteund", "staand met steun"],
      "Clamshell": ["zijlig", "met elastiek"],
      "Heupscharnier": ["staand met steun", "functioneel op één been"],
      "Monster walk": ["met elastiek"],
      "Heupflexor rek": ["staand met steun"],
      "Piriformis rek": ["liggend ondersteund"]
    }
  },
  {
    source: "Knie", target: "Onderste extremiteit", picks: {
      "Knie buigen": ["liggend", "zittend", "staand met steun", "met elastiek"],
      "Knie strekken": ["liggend", "zittend", "staand met steun", "met elastiek"],
      "Quadriceps aanspannen": ["liggend", "zittend"],
      "Straight leg raise": ["liggend", "met elastiek"],
      "Mini-squat": ["staand met steun", "met elastiek"],
      "Sit-to-stand": ["zittend", "staand met steun", "met elastiek"],
      "Step-up": ["staand met steun", "op verhoging"],
      "Step-down": ["staand met steun", "met elastiek", "op verhoging"],
      "Split squat": ["staand met steun", "op verhoging"],
      "Hamstring curl": ["liggend", "zittend", "staand met steun", "met elastiek"],
      "Terminal knee extension": ["staand met steun", "met elastiek"]
    }
  },
  {
    source: "Enkel en voet", target: "Onderste extremiteit", picks: {
      "Enkel optrekken": ["zittend actief", "staand met steun", "met elastiek"],
      "Enkel wegduwen": ["zittend actief", "staand met steun", "met elastiek"],
      "Voet naar binnen": ["zittend actief", "met elastiek"],
      "Voet naar buiten": ["zittend actief", "met elastiek"],
      "Kuitheffing": ["staand met steun", "op een verhoging", "op één been"],
      "Kuitrek gestrekte knie": ["staand met steun", "op een verhoging"],
      "Kuitrek gebogen knie": ["staand met steun", "op een verhoging"],
      "Knie naar voren over voet": ["staand met steun", "op een verhoging"],
      "Tenen heffen": ["zittend actief", "staand met steun"],
      "Korte voet": ["zittend actief", "staand met steun", "op één been"],
      "Tenen spreiden": ["zittend actief"]
    }
  },
  {
    source: "Rug", target: "Core", picks: {
      "Bekken kantelen": ["liggend", "op handen en knieën", "zittend", "staand", "met lichte weerstand"],
      "Brug": ["liggend", "met lichte weerstand"],
      "Bird dog": ["op handen en knieën", "staand", "met lichte weerstand"],
      "Dead bug": ["liggend", "staand", "met lichte weerstand"],
      "Romp heupscharnier": ["op handen en knieën", "zittend", "staand", "met lichte weerstand"],
      "Romp draaien": ["met lichte weerstand"],
      "Romp zijwaarts buigen": ["met lichte weerstand"],
      "Rug strekken": ["met lichte weerstand"]
    }
  },
  {
    source: "Cardiopulmonaal", target: "Cardio", picks: {
      "Diafragma-ademhaling": ["zittend"],
      "Lippenremademhaling": ["zittend"],
      "Armen en adem koppelen": ["met armtaak"],
      "Marcheren": ["interval kort", "interval langer"],
      "Opstaan herhalen": ["interval kort"],
      "Thorax openen": ["met armtaak"],
      "Zijwaarts stappen": ["interval kort"]
    }
  },
  {
    source: "Nek", target: "Nek", picks: {
      "Kin intrekken": ["zittend actief", "liggend ondersteund"],
      "Nek buigen": ["zittend actief", "liggend ondersteund"],
      "Nek strekken": ["zittend actief", "functioneel staand"],
      "Nek draaien": ["zittend actief", "functioneel staand"],
      "Nek zijwaarts buigen": ["zittend actief", "isometrisch"],
      "Diepe nekflexoren activeren": ["zittend actief", "liggend ondersteund"],
      "Nekrotatie met oogfixatie": ["zittend actief", "functioneel staand"],
      "Schouderblad liften en ontspannen": ["zittend actief", "functioneel staand"],
      "Levator scapulae rek": ["zittend actief", "functioneel staand"],
      "Bovenste trapezius rek": ["zittend actief", "functioneel staand"]
    }
  },
  {
    source: "Rug", target: "Rug", picks: {
      "Rug bol en hol": ["op handen en knieën", "zittend", "staand", "met lichte weerstand"],
      "Romp draaien": ["liggend", "op handen en knieën", "zittend", "staand"],
      "Romp zijwaarts buigen": ["liggend", "zittend", "staand"],
      "Rug strekken": ["liggend", "op handen en knieën", "zittend", "staand"],
      "Knie naar borst": ["liggend", "zittend", "staand"],
      "Open boek": ["liggend", "op handen en knieën", "zittend"],
      "Thoracale extensie": ["liggend", "op handen en knieën", "zittend", "staand"]
    }
  },
  {
    source: "Balans en valpreventie", target: "Balans en valpreventie", picks: {
      "Voeten naast elkaar staan": ["met stevige steun", "zonder steun", "met hoofdbeweging"],
      "Semi-tandemstand": ["met stevige steun", "zonder steun", "met hoofdbeweging"],
      "Tandemstand": ["met stevige steun", "zonder steun", "met hoofdbeweging"],
      "Eenbeenstand": ["met stevige steun", "zonder steun", "met hoofdbeweging"],
      "Gewicht verplaatsen voor-achter": ["met stevige steun", "zonder steun"],
      "Gewicht verplaatsen zijwaarts": ["met stevige steun", "zonder steun"],
      "Reiken in stand": ["met stevige steun", "zonder steun"],
      "Op de plaats marcheren": ["met stevige steun", "zonder steun"],
      "Zijwaarts stappen": ["met stevige steun", "zonder steun"],
      "Achterwaarts stappen": ["met stevige steun", "zonder steun"],
      "Over een obstakel stappen": ["met stevige steun", "zonder steun"],
      "Draaien op de plaats": ["met stevige steun", "zonder steun"],
      "Stoel opstaan en lopen": ["zonder steun"],
      "Dubbele taak lopen": ["met cognitieve taak"]
    }
  },
  {
    source: "Neurologische revalidatie", target: "Neurologische revalidatie", picks: {
      "Reiken met aangedane arm": ["met visueel doel", "functionele combinatie"],
      "Hand openen na grijpen": ["bilateraal"],
      "Romp rotatie in zit": ["bilateraal"],
      "Symmetrisch opstaan": ["met fysieke steun", "met ritmische cue"],
      "Stap initiëren": ["met visueel doel", "met ritmische cue"],
      "Zijwaarts verplaatsen in zit": ["met visueel doel"],
      "Hiel plaatsen": ["met visueel doel"],
      "Voet naar marker": ["met visueel doel"],
      "Ritmisch marcheren": ["met ritmische cue"],
      "Grote stappen": ["met ritmische cue", "functionele combinatie"],
      "Brug met symmetrie": ["bilateraal"]
    }
  },
  {
    source: "Vestibulair", target: "Vestibulair", picks: {
      "Blikstabilisatie horizontaal": ["zittend langzaam", "staand langzaam", "tijdens lopen"],
      "Blikstabilisatie verticaal": ["zittend langzaam", "staand langzaam"],
      "Ogen naar doelen": ["zittend langzaam", "staand langzaam"],
      "Doel volgen": ["zittend langzaam"],
      "Hoofd draaien in stand": ["staand langzaam"],
      "Buigen en oprichten": ["staand langzaam"]
    }
  },
  {
    source: "Werk en dagelijkse handelingen", target: "Werk en dagelijkse handelingen", picks: {
      "Voorwerp van vloer tillen": ["ergonomische basis", "licht en dichtbij"],
      "Voorwerp van tafel pakken": ["licht en dichtbij"],
      "Boven schouderhoogte plaatsen": ["ergonomische basis", "licht en dichtbij"],
      "Duwen": ["licht en dichtbij", "met stapverplaatsing"],
      "Trekken": ["licht en dichtbij"],
      "Draaien en plaatsen": ["met stapverplaatsing"],
      "Langdurig zitten onderbreken": ["met tempo of herhaling"]
    }
  },
  {
    source: "Bekkengezondheid", target: "Bekken & postpartum", picks: {
      "Bekkenbodem aanspannen": ["liggend"],
      "Bekkenbodem ontspannen": ["liggend"],
      "Bekkenbodem snel aanspannen": ["zittend"],
      "Bekkenbodem met uitademing": ["liggend"],
      "Diepe buikactivatie": ["liggend"],
      "Bekkenmobiliteit": ["liggend"]
    }
  },
  {
    source: "Zwangerschap en postpartum", target: "Bekken & postpartum", picks: {
      "360 graden ademhaling": ["eerste fase rustig"],
      "Bekkenkanteling postpartum": ["eerste fase rustig"],
      "Functioneel opstaan": ["functioneel"],
      "Zijlig heupkracht": ["zijlig"]
    }
  },
  {
    source: "Sportrevalidatie", target: "Sportrevalidatie", picks: {
      "Hop vooruit": ["techniek langzaam"],
      "Landing op twee benen": ["techniek langzaam"],
      "Landing op één been": ["techniek langzaam"],
      "Laterale shuffle": ["submaximaal"],
      "Richtingsverandering": ["techniek langzaam"],
      "Sprinttechniek marcheren": ["techniek langzaam"],
      "Versnellen en afremmen": ["submaximaal"]
    }
  }
];

const categoryPlan = {
  "Bovenste extremiteit": 50,
  "Onderste extremiteit": 80,
  Core: 20,
  Cardio: 8,
  Nek: 20,
  Rug: 25,
  "Balans en valpreventie": 30,
  "Neurologische revalidatie": 15,
  Vestibulair: 10,
  "Werk en dagelijkse handelingen": 10,
  "Bekken & postpartum": 10,
  Sportrevalidatie: 7
};

const friendlyVariant = {
  "actief zonder gewicht": "actief",
  "geleid met stok": "met stok",
  "isometrisch tegen muur": "isometrisch tegen de muur",
  "met stevige steun": "met steun",
  "zonder steun": "zonder steun",
  "met lichte weerstand": "met lichte weerstand"
};

function slug(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "oefening";
}

function publicName(base, variant) {
  return `${base} – ${friendlyVariant[variant] || variant}`;
}

const core = JSON.parse(await readFile(corePath, "utf8"));
const candidates = new Map();
for (const entry of core.exercises || []) {
  if (entry.source === "legacy-215") continue;
  const sourceDomain = entry.sourceDomain || entry.category;
  candidates.set(`${sourceDomain}\t${entry.titleNl}`, entry);
}

const selected = [];
const missing = [];
for (const group of pickGroups) {
  for (const [base, variants] of Object.entries(group.picks)) {
    for (const variant of variants) {
      const titleNl = `${base} · ${variant}`;
      const entry = candidates.get(`${group.source}\t${titleNl}`);
      if (!entry) { missing.push(`${group.source}: ${titleNl}`); continue; }
      const naam = publicName(base, variant);
      const outputImage = `images/${slug(group.target)}/${slug(naam)}-avatar-v8.jpg`;
      selected.push({
        rank: 215 + selected.length + 1,
        coreExerciseId: entry.exerciseId,
        sourceDomain: group.source,
        publicCategory: group.target,
        naam,
        outputImage,
        region: entry.region,
        joint: entry.joint,
        goals: entry.goals,
        equipment: entry.equipment,
        difficulty: entry.difficulty,
        script: entry.script,
        dosage: entry.dosage,
        imagePlan: {
          start: entry.startingPosition,
          end: entry.script?.movement,
          cue: entry.script?.cue,
          composition: "twee duidelijke poses, doorlopende witte studio, geen scheidingslijn"
        }
      });
    }
  }
}

const errors = [...missing.map((item) => `kandidaat ontbreekt: ${item}`)];
if (selected.length !== 285) errors.push(`verwacht 285 selecties, gevonden ${selected.length}`);
const ids = selected.map((entry) => entry.coreExerciseId);
const names = selected.map((entry) => entry.naam.toLocaleLowerCase("nl-NL"));
if (new Set(ids).size !== ids.length) errors.push("dubbele coreExerciseId in selectie");
if (new Set(names).size !== names.length) errors.push("dubbele Nederlandse naam in selectie");

const actualCategoryPlan = Object.fromEntries(Object.keys(categoryPlan).map((category) => [
  category, selected.filter((entry) => entry.publicCategory === category).length
]));
for (const [category, expected] of Object.entries(categoryPlan)) {
  if (actualCategoryPlan[category] !== expected) errors.push(`${category}: verwacht ${expected}, gevonden ${actualCategoryPlan[category]}`);
}

const existingCatalogue = JSON.parse(await readFile(cataloguePath, "utf8"));
const original = existingCatalogue.filter((entry) => !entry.coreExerciseId);
if (original.length !== 215) errors.push(`verwacht 215 oorspronkelijke oefeningen, gevonden ${original.length}`);
const originalNames = new Set(original.map((entry) => entry.naam.toLocaleLowerCase("nl-NL")));
for (const entry of selected) if (originalNames.has(entry.naam.toLocaleLowerCase("nl-NL"))) errors.push(`naam botst met bestaande oefening: ${entry.naam}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else if (shouldWrite) {
  const selection = {
    schemaVersion: 1,
    collection: "FysiPlan Top 500",
    generatedAt: "2026-07-20",
    policy: {
      targetTotal: 500,
      existingExercises: 215,
      selectedAdditions: 285,
      ownMediaOnly: true,
      selectionMethod: "klinische dekkingsgraph met bronconsensus, uitvoerbaarheidsfilter, variantdeduplicatie en categoriequota",
      publicSafety: "Inhoud en AI-beelden zijn concept totdat een fysiotherapeut de beweging en instructie heeft beoordeeld."
    },
    researchBasis: [
      "AAOS conditioning programs per lichaamsregio",
      "NHS MSK-, Otago- en onderste-ledemaatprogramma's",
      "APTA-richtlijn vestibulaire hypofunctie",
      "publieke taxonomieën van Physitrack, MedBridge en Wibbi"
    ],
    categoryPlan,
    selected
  };
  const additions = selected.map((entry) => ({
    naam: entry.naam,
    groep: entry.publicCategory,
    img: entry.outputImage,
    kaartImg: entry.outputImage,
    coreExerciseId: entry.coreExerciseId
  }));
  await Promise.all([
    writeFile(selectionPath, JSON.stringify(selection, null, 2) + "\n"),
    writeFile(cataloguePath, JSON.stringify([...original, ...additions], null, 2) + "\n")
  ]);
  console.log(`geschreven: 215 + ${additions.length} = ${original.length + additions.length} oefeningen`);
  console.log(JSON.stringify(actualCategoryPlan, null, 2));
} else {
  console.log(`top-500 selectie geldig: ${selected.length} aanvullingen`);
  console.log(JSON.stringify(actualCategoryPlan, null, 2));
}
