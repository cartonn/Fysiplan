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

// ---- Dosering (legal 2026-11-09) ----
// Hoe vaak, hoeveel, hoe lang en hoe zwaar bepaalt de fysiotherapeut; dat staat op de
// kaart. De AI-dienst krijgt de dosering van de kaart niet mee, dus een vraag als
// "hoeveel herhalingen?" of "mag ik zwaarder?" zou hij zelf moeten invullen: een
// doseringsadvies per patiënt, en dat is precies de MDR-grens (MDCG 2019-11; Fysiplan
// kiest geen behandeling of dosering). Zo'n vraag gaat dus ook niet naar de AI-dienst,
// maar krijgt een vaste verwijzing naar de kaart en de eigen praktijk.
const DOSERING = [
  // Nederlands
  "hoeveel", "hoe\\s+vaak", "hoe\\s+lang", "vaker", "zwaarder", "lichter", "herhaling", "series?" + GEEN_LETTER_NA,
  "keer\\s+per", "per\\s+(?:dag|week)", "elke\\s+dag", "dagelijks", "seconde", "minuten", "kilo", "opvoeren", "afbouwen",
  // Engels
  "how\\s+many", "how\\s+much", "how\\s+often", "how\\s+long", "more\\s+often", "heavier", "lighter", "reps?" + GEEN_LETTER_NA,
  "repetition", "sets" + GEEN_LETTER_NA, "times\\s+a\\s+(?:day|week)", "per\\s+(?:day|week)", "every\\s+day", "daily",
  "seconds", "minutes", "kg" + GEEN_LETTER_NA,
  // Duits
  "wie\\s+viele?", "wie\\s+oft", "wie\\s+lange?", "öfter", "schwerer", "leichter", "wiederholung", "sätze",
  "pro\\s+(?:tag|woche)", "jeden\\s+tag", "täglich", "sekunden",
  // Frans
  "combien", "fr[ée]quence", "plus\\s+souvent", "plus\\s+lourd", "plus\\s+l[ée]g[eè]r", "r[ée]p[ée]tition", "s[ée]ries",
  "par\\s+(?:jour|semaine)", "tous\\s+les\\s+jours", "secondes",
  // Spaans
  "cu[áa]nt[oa]s?" + GEEN_LETTER_NA, "cada\\s+cu[áa]nto", "frecuencia", "m[áa]s\\s+a\\s+menudo", "m[áa]s\\s+peso",
  "repetici[óo]n", "al\\s+d[íi]a", "por\\s+(?:d[íi]a|semana)", "todos\\s+los\\s+d[íi]as", "segundos", "minutos",
  // Pools
  "ile" + GEEN_LETTER_NA, "jak\\s+cz[ęe]sto", "jak\\s+d[łl]ugo", "cz[ęe][śs]ciej", "ci[ęe][żz]sz", "powt[óo]rze",
  "dziennie", "w\\s+tygodniu", "codziennie", "sekund", "minut" + GEEN_LETTER_NA,
  // Turks
  "ka[çc]" + GEEN_LETTER_NA, "ka[çc]\\s+(?:kez|kere|tekrar|set|saniye|dakika)", "ne\\s+s[ıi]kl[ıi]kla", "ne\\s+kadar\\s+s[üu]re",
  "daha\\s+s[ıi]k", "daha\\s+a[ğg][ıi]r", "g[üu]nde", "haftada", "her\\s+g[üu]n", "saniye", "dakika",
  // Oekraïens
  "скільки", "як\\s+часто", "як\\s+довго", "частіше", "важч", "повторен", "підход", "щодня", "на\\s+день", "на\\s+тиждень",
  "секунд", "хвилин"
];
// Arabisch: "كم" (hoeveel) alleen als los woord, want het zit ook in andere woorden
const DOSERING_AR = ["(?:^|[\\s،؟?])كم(?=[\\s،؟?]|$)", "كم مرة", "تكرار", "يوميا", "يومياً", "في اليوم", "في الأسبوع", "ثوان", "دقائق", "أثقل", "كيلو"];
const DOSERING_PATROON = new RegExp(GEEN_LETTER_VOOR + "(?:" + DOSERING.join("|") + ")|" + DOSERING_AR.join("|"), "iu");

/** true als de vraag gaat over hoe vaak, hoeveel, hoe lang of hoe zwaar (dosering) */
export function vraagOverDosering(vraag) {
  return DOSERING_PATROON.test(String(vraag || "").normalize("NFC"));
}

// de vaste verwijzing bij een doseringsvraag, in de 9 talen van de kaart; geen AI, geen advies
export const DOSERING_VERWIJZING = {
  nl: "Hoe vaak, hoeveel en hoe zwaar je oefent, heeft je fysiotherapeut voor jou bepaald. Dat staat op je kaart bij elke oefening. De vraaghulp verandert of bedenkt dat niet. Twijfel je, of wil je meer of minder doen? Vraag het je praktijk, of tik hieronder op het seintje \"Ik heb een vraag\". Je vraag is niet doorgestuurd.",
  en: "How often, how much and how heavy you exercise was set for you by your physiotherapist. It is on your card with each exercise. The question helper does not change or make that up. Not sure, or want to do more or less? Ask your practice, or tap the signal \"I have a question\" below. Your question was not sent on.",
  de: "Wie oft, wie viel und wie schwer du übst, hat dein Physiotherapeut für dich festgelegt. Das steht auf deiner Karte bei jeder Übung. Die Fragehilfe ändert das nicht und denkt sich nichts aus. Bist du unsicher oder möchtest du mehr oder weniger tun? Frag deine Praxis oder tippe unten auf das Signal \"Ich habe eine Frage\". Deine Frage wurde nicht weitergeleitet.",
  fr: "La fréquence, la quantité et la charge de tes exercices ont été fixées pour toi par ton kinésithérapeute. Elles figurent sur ta carte à côté de chaque exercice. L’aide aux questions ne les modifie pas et n’en invente pas. Un doute, ou envie d’en faire plus ou moins ? Demande à ton cabinet, ou touche le signal « J’ai une question » ci-dessous. Ta question n’a pas été transmise.",
  es: "Con qué frecuencia, cuánto y con cuánto peso haces los ejercicios lo ha decidido tu fisioterapeuta para ti. Está en tu tarjeta junto a cada ejercicio. La ayuda de preguntas no lo cambia ni lo inventa. ¿Tienes dudas o quieres hacer más o menos? Pregunta a tu consulta o toca abajo la señal «Tengo una pregunta». Tu pregunta no se ha enviado.",
  pl: "Jak często, ile i z jakim obciążeniem ćwiczysz, ustalił dla ciebie twój fizjoterapeuta. Jest to na twojej karcie przy każdym ćwiczeniu. Pomoc w pytaniach tego nie zmienia ani nie wymyśla. Masz wątpliwości albo chcesz robić więcej lub mniej? Zapytaj w swoim gabinecie albo dotknij poniżej sygnału „Mam pytanie”. Twoje pytanie nie zostało przesłane dalej.",
  tr: "Ne sıklıkla, ne kadar ve ne ağırlıkla egzersiz yapacağını fizyoterapistin senin için belirledi. Bu, kartında her egzersizin yanında yazıyor. Soru yardımı bunu değiştirmez ve uydurmaz. Emin değil misin ya da daha fazla veya daha az mı yapmak istiyorsun? Kliniğine sor ya da aşağıdaki \"Bir sorum var\" sinyaline dokun. Sorun iletilmedi.",
  ar: "عدد مرات التمرين وكميته وشدته حددها لك أخصائي العلاج الطبيعي. تجدها على بطاقتك بجانب كل تمرين. مساعد الأسئلة لا يغيرها ولا يخترعها. هل أنت متردد أو تريد أن تفعل أكثر أو أقل؟ اسأل عيادتك أو اضغط أدناه على إشارة \"لديّ سؤال\". لم يتم إرسال سؤالك.",
  uk: "Як часто, скільки і з якою вагою вправлятися, визначив для тебе твій фізіотерапевт. Це вказано на твоїй картці біля кожної вправи. Помічник із запитань цього не змінює і не вигадує. Сумніваєшся або хочеш робити більше чи менше? Запитай у своїй практиці або торкнися внизу сигналу «У мене є запитання». Твоє запитання не було надіслано."
};

export function doseringVerwijzing(taal) {
  return Object.hasOwn(DOSERING_VERWIJZING, String(taal || "")) ? DOSERING_VERWIJZING[taal] : DOSERING_VERWIJZING.nl;
}
