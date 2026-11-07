// Grens van de vraaghulp op de patiëntkaart (/api/kaart/vraag).
// De vraaghulp legt alleen de uitvoering van de eigen oefeningen uit. Gaat een vraag
// over pijn, klachten, medicijnen, een operatie of herstel, dan stuurt de server hem
// NIET naar de AI-dienst en geeft hij een vaste verwijzing naar de eigen praktijk.
// Twee redenen:
//  - MDR (MDCG 2019-11): software die op klachten van één patiënt reageert, schuift
//    richting een medisch hulpmiddel. Een vaste verwijzing doet dat niet.
//  - AVG art. 9: zo'n vraag bevat gezondheidsgegevens; die gaan dan niet naar een
//    dienst buiten de EU.
// Pure functies zonder opslag of netwerk, los te testen (scripts/test-vraaghulp-grens.mjs).
// Bewust ruim: een onterechte verwijzing kost de patiënt niets, een gemiste wel.

const GEEN_LETTER_VOOR = "(?<!\\p{L})";
const GEEN_LETTER_NA = "(?!\\p{L})";

// per taal stammen of frasen; (?!\p{L}) waar een korte stam anders te veel vangt
const WOORDEN = [
  // Nederlands
  "pijn", "doet\\s+(?:\\S+\\s+)?zeer", "zeer\\s+do", "klacht", "ontst[eo]k", "zwelling", "gezwollen", "opgezet",
  "medicijn", "medicatie", "pil(?:len)?" + GEEN_LETTER_NA, "paracetamol", "ibuprofen", "diclofenac", "naproxen",
  "operatie", "geopereerd", "hernia", "artrose", "artritis", "breuk", "gebroken", "gescheurd", "scheur" + GEEN_LETTER_NA,
  "blessure", "geblesseerd", "duizel", "misselijk", "tintel", "doof\\s+gevoel", "gevoelloos", "koorts", "bloed",
  "diagnose", "herstel", "genezen", "slechter",
  // Engels
  "pain", "hurt", "ache", "aching", "sore", "swell", "swollen", "injur", "medic", "pills?" + GEEN_LETTER_NA, "surgery",
  "operation", "operated", "diagnos", "dizz", "numb(?:ness)?" + GEEN_LETTER_NA, "tingl", "fever", "blood", "bleed", "fractur", "broken", "torn" + GEEN_LETTER_NA,
  "recover", "heal", "worse",
  // Duits
  "schmerz", "tut\\s+(?:\\S+\\s+)?weh", "verletz", "entz[üu]nd", "geschwollen", "schwellung", "medikament", "tablette",
  "operiert", "diagnose", "schwindel", "kribbel", "taubheit", "fieber", "blut", "gebrochen", "gerissen", "heilung",
  "genes", "schlimmer",
  // Frans
  "douleur", "mal\\s+(?:au|à|a)" + GEEN_LETTER_NA, "bless", "enfl", "gonfl", "m[ée]dicament", "op[ée]ration", "op[ée]r[ée]",
  "diagnostic", "vertige", "engourdi", "fi[èe]vre", "sang" + GEEN_LETTER_NA, "d[ée]chir", "gu[ée]ri", "pire",
  // Spaans
  "dolor", "duele", "lesi[óo]n", "lesionad", "hinchad", "inflamad", "medicament", "pastilla", "operaci[óo]n", "operad",
  "diagn[óo]stico", "mareo", "entumec", "hormigue", "fiebre", "sangr", "fractura", "rot[oa]s?" + GEEN_LETTER_NA, "recuper", "peor",
  // Pools
  "ból" + GEEN_LETTER_NA, "bol(?:i|ą)" + GEEN_LETTER_NA, "bolesn", "uraz", "kontuzj", "obrz[ęe]k", "spuchn", "leki" + GEEN_LETTER_NA,
  "lekarstw", "tabletk", "operacj", "diagnoz", "zawrot", "dr[ęe]tw", "gor[ąa]czk", "krew", "krwaw", "z[łl]aman",
  "wyzdrow", "gorzej",
  // Turks
  "a[ğg]r[ıi]", "ac[ıi]yor", "yaralan", "şiş(?:ti|kin|lik|me)", "ila[çc]", "ameliyat", "te[şs]his", "ba[şs]\\s+d[öo]nmesi",
  "uyu[şs]", "ate[şs]", "kan" + GEEN_LETTER_NA, "kanama", "k[ıi]r[ıi]k", "iyile[şs]", "k[öo]t[üu]le[şs]",
  // Oekraïens
  "біль", "болить", "болю", "болі", "травм", "набряк", "ліки", "таблетк", "операці", "діагноз", "запаморочен",
  "онімін", "температур", "кров", "перелом", "одужан", "гірше"
];

// Arabisch: lidwoord en voorzetsels plakken vóór het woord (الألم, بالدواء), dus geen
// grens aan de voorkant; alleen woorden die niet toevallig in andere woorden zitten
const ARABISCH = ["ألم", "الام", "آلام", "وجع", "يؤلم", "توجع", "إصابة", "اصابة", "تورم", "انتفاخ", "دواء", "أدوية", "ادوية",
  "مسكن", "جراحة", "عملية جراحية", "تشخيص", "دوخة", "دوار", "خدر", "تنميل", "حمى", "حرارة", "نزيف", "كسر", "تمزق", "شفاء", "أسوأ"];

const PATROON = new RegExp(GEEN_LETTER_VOOR + "(?:" + WOORDEN.join("|") + ")|" + ARABISCH.join("|"), "iu");

/** true als de vraag over pijn, klachten, medicijnen, een operatie of herstel gaat */
export function vraagOverKlacht(vraag) {
  return PATROON.test(String(vraag || "").normalize("NFC"));
}

// de vaste verwijzing, in de 9 talen van de kaart; geen AI, geen advies
export const VERWIJZING = {
  nl: "Over pijn, klachten, medicijnen of herstel kan de vraaghulp niets zeggen. Bel of mail daarvoor je eigen praktijk. Neemt de pijn toe tijdens het oefenen? Stop dan en tik hieronder op het seintje \"Het doet te veel pijn\". Je vraag is niet doorgestuurd.",
  en: "The question helper cannot answer questions about pain, symptoms, medication or recovery. Please call or email your own practice. Does the pain increase while exercising? Stop and tap the signal \"It hurts too much\" below. Your question was not sent on.",
  de: "Zu Schmerzen, Beschwerden, Medikamenten oder Genesung kann die Fragehilfe nichts sagen. Ruf dafür bitte deine eigene Praxis an oder schreib ihr. Nehmen die Schmerzen beim Üben zu? Hör dann auf und tippe unten auf das Signal \"Es tut zu weh\". Deine Frage wurde nicht weitergeleitet.",
  fr: "L’aide aux questions ne peut rien dire sur la douleur, les symptômes, les médicaments ou la guérison. Appelle ou écris à ton propre cabinet. La douleur augmente pendant l’exercice ? Arrête et touche le signal « J’ai trop mal » ci-dessous. Ta question n’a pas été transmise.",
  es: "La ayuda de preguntas no puede decir nada sobre dolor, molestias, medicamentos o recuperación. Llama o escribe a tu propia consulta. ¿Aumenta el dolor al hacer los ejercicios? Para y toca abajo la señal «Me duele demasiado». Tu pregunta no se ha enviado.",
  pl: "Pomoc w pytaniach nie odpowiada na pytania o ból, dolegliwości, leki ani powrót do zdrowia. Zadzwoń lub napisz do swojego gabinetu. Ból narasta podczas ćwiczeń? Przerwij i dotknij poniżej sygnału „Za bardzo boli”. Twoje pytanie nie zostało przesłane dalej.",
  tr: "Soru yardımı ağrı, şikâyetler, ilaçlar veya iyileşme hakkında bir şey söyleyemez. Bunun için kendi kliniğini ara ya da ona yaz. Egzersiz sırasında ağrı artıyor mu? Dur ve aşağıdaki \"Çok acıyor\" sinyaline dokun. Sorun iletilmedi.",
  ar: "لا يمكن لمساعد الأسئلة الإجابة عن الألم أو الشكاوى أو الأدوية أو التعافي. اتصل بعيادتك أو راسلها. هل يزداد الألم أثناء التمرين؟ توقف واضغط أدناه على إشارة \"الألم شديد جدًا\". لم يتم إرسال سؤالك.",
  uk: "Помічник із запитань не може відповідати про біль, скарги, ліки чи одужання. Зателефонуй або напиши до своєї практики. Біль посилюється під час вправ? Зупинися й торкнися внизу сигналу «Надто болить». Твоє запитання не було надіслано."
};

export function verwijzing(taal) {
  return Object.hasOwn(VERWIJZING, String(taal || "")) ? VERWIJZING[taal] : VERWIJZING.nl;
}
