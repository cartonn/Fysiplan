// Vaste vragen op de patiëntkaart, in plaats van de vraaghulp (reviewlijst punt 13).
//
// De vraaghulp stuurde een vrije vraag van de patiënt, achter een woordfilter, naar een AI-dienst
// buiten Europa. Een woordfilter herkent een klacht niet betrouwbaar, en een antwoord van een
// taalmodel is niet na te kijken voordat de patiënt het leest. Daarom nu:
//   - Een paar vaste vragen met vaste antwoorden die bij elke oefening gelden (STANDAARD), in de
//     negen talen van de kaart. Ze zeggen niets over klachten of dosering van één patiënt en
//     verwijzen daarvoor naar de kaart en de eigen fysiotherapeut.
//   - Per oefening eigen vragen van de praktijk: de therapeut schrijft vraag en antwoord zelf, in
//     de app. Ze staan bij de praktijk en verschijnen op elke kaart van die praktijk met die oefening.
//   - Geen vrije tekst van de patiënt naar een AI-dienst. Wie een andere vraag heeft, tikt op
//     "Ik heb een vraag" en de praktijk ziet dat.
//
// Opslag (vaste-vragen.json): { praktijkSleutel: { oefeningnaam: [ { v, a, t, door? } ] } }.
// Alleen rekenen en controleren; geen opslag en geen verzoeken.

export const MAX_PER_OEF = 5;
export const MAX_VRAAG = 140;
export const MAX_ANTWOORD = 600;
export const MAX_OEF_PER_PRAKTIJK = 1000;

// Standaardvragen. Wijzig je een tekst, laat hem dan nalezen (docs/mensenwerk.md).
export const STANDAARD = [
  {
    id: "pijn",
    v: {
      nl: "Wat doe ik als het pijn doet tijdens de oefening?",
      en: "What do I do if the exercise hurts?",
      de: "Was mache ich, wenn die Übung wehtut?",
      fr: "Que faire si l’exercice me fait mal ?",
      es: "¿Qué hago si el ejercicio me duele?",
      pl: "Co zrobić, jeśli ćwiczenie boli?",
      tr: "Egzersiz sırasında ağrı olursa ne yapmalıyım?",
      ar: "ماذا أفعل إذا شعرت بألم أثناء التمرين؟",
      uk: "Що робити, якщо під час вправи болить?"
    },
    a: {
      nl: "Neem pijn serieus. Stop als de pijn toeneemt en houd je aan de pijngrens die je met je fysiotherapeut hebt afgesproken. Blijft het pijn doen of twijfel je? Tik op “Het doet te veel pijn” of bel je praktijk.",
      en: "Take pain seriously. Stop if the pain gets worse and keep to the pain limit you agreed with your physiotherapist. Does it keep hurting, or are you unsure? Tap “It hurts too much” or call your practice.",
      de: "Nimm Schmerzen ernst. Hör auf, wenn der Schmerz stärker wird, und halte dich an die Schmerzgrenze, die du mit deiner Physiotherapeutin oder deinem Physiotherapeuten vereinbart hast. Tut es weiter weh oder bist du unsicher? Tippe auf „Es tut zu weh“ oder ruf deine Praxis an.",
      fr: "Prends la douleur au sérieux. Arrête si la douleur augmente et respecte la limite de douleur convenue avec ton kinésithérapeute. La douleur persiste ou tu as un doute ? Touche « J’ai trop mal » ou appelle ton cabinet.",
      es: "Toma en serio el dolor. Para si el dolor aumenta y respeta el límite de dolor que acordaste con tu fisioterapeuta. ¿Sigue doliendo o tienes dudas? Toca «Me duele demasiado» o llama a tu consulta.",
      pl: "Traktuj ból poważnie. Przerwij, jeśli ból się nasila, i trzymaj się granicy bólu ustalonej z fizjoterapeutą. Nadal boli albo masz wątpliwości? Dotknij „Za bardzo boli” lub zadzwoń do swojej przychodni.",
      tr: "Ağrıyı ciddiye al. Ağrı artarsa dur ve fizyoterapistinle kararlaştırdığın ağrı sınırına uy. Ağrı devam ediyor mu ya da emin değil misin? “Çok acıyor” düğmesine dokun veya kliniğini ara.",
      ar: "خذ الألم على محمل الجد. توقّف إذا ازداد الألم والتزم بحدّ الألم الذي اتفقت عليه مع أخصائي العلاج الطبيعي. هل يستمر الألم أو لست متأكدًا؟ اضغط على «الألم شديد جدًا» أو اتصل بعيادتك.",
      uk: "Стався до болю серйозно. Зупинись, якщо біль посилюється, і дотримуйся межі болю, про яку ви домовилися з фізіотерапевтом. Біль не минає або ти не впевнений? Натисни «Надто болить» або зателефонуй до своєї практики."
    }
  },
  {
    id: "goed",
    v: {
      nl: "Hoe weet ik of ik de oefening goed doe?",
      en: "How do I know I am doing the exercise right?",
      de: "Woran erkenne ich, dass ich die Übung richtig mache?",
      fr: "Comment savoir si je fais bien l’exercice ?",
      es: "¿Cómo sé si hago bien el ejercicio?",
      pl: "Skąd mam wiedzieć, że dobrze wykonuję ćwiczenie?",
      tr: "Egzersizi doğru yaptığımı nasıl anlarım?",
      ar: "كيف أعرف أنني أؤدي التمرين بشكل صحيح؟",
      uk: "Як зрозуміти, що я правильно виконую вправу?"
    },
    a: {
      nl: "Kijk naar het beeld en lees “Zo doe je het”. Beweeg rustig en gecontroleerd. Twijfel je nog? Tik op “Ik heb een vraag”: je fysiotherapeut ziet dat bij het inloggen en kan er de volgende keer met je naar kijken.",
      en: "Look at the picture and read “How to do it”. Move slowly and in a controlled way. Still unsure? Tap “I have a question”: your physiotherapist sees it when they log in and can look at it with you next time.",
      de: "Schau dir das Bild an und lies „So geht es“. Bewege dich ruhig und kontrolliert. Noch unsicher? Tippe auf „Ich habe eine Frage“: Deine Physiotherapeutin oder dein Physiotherapeut sieht das beim Einloggen und kann es beim nächsten Mal mit dir anschauen.",
      fr: "Regarde l’image et lis « Comment faire ». Bouge lentement et de façon contrôlée. Toujours un doute ? Touche « J’ai une question » : ton kinésithérapeute le verra à sa prochaine connexion et pourra regarder cela avec toi la prochaine fois.",
      es: "Mira la imagen y lee «Cómo hacerlo». Muévete despacio y con control. ¿Sigues con dudas? Toca «Tengo una pregunta»: tu fisioterapeuta lo verá al iniciar sesión y podrá revisarlo contigo la próxima vez.",
      pl: "Spójrz na obraz i przeczytaj „Jak to zrobić”. Poruszaj się spokojnie i z kontrolą. Nadal masz wątpliwości? Dotknij „Mam pytanie”: fizjoterapeuta zobaczy to po zalogowaniu i następnym razem obejrzy to z tobą.",
      tr: "Görsele bak ve “Nasıl yapılır” bölümünü oku. Sakin ve kontrollü hareket et. Hâlâ emin değil misin? “Bir sorum var” düğmesine dokun: fizyoterapistin giriş yaptığında bunu görür ve bir dahaki sefere seninle birlikte bakabilir.",
      ar: "انظر إلى الصورة واقرأ «طريقة الأداء». تحرّك بهدوء وتحكّم. هل ما زلت غير متأكد؟ اضغط على «لديّ سؤال»: يرى أخصائي العلاج الطبيعي ذلك عند تسجيل الدخول ويمكنه مراجعته معك في المرة القادمة.",
      uk: "Подивись на зображення і прочитай «Як виконувати». Рухайся спокійно й контрольовано. Досі сумніваєшся? Натисни «У мене є запитання»: фізіотерапевт побачить це, коли увійде, і наступного разу перегляне це з тобою."
    }
  },
  {
    id: "meer",
    v: {
      nl: "Mag ik meer of minder doen dan op de kaart staat?",
      en: "May I do more or less than what is on the card?",
      de: "Darf ich mehr oder weniger machen, als auf der Karte steht?",
      fr: "Puis-je en faire plus ou moins que ce qui est indiqué sur la carte ?",
      es: "¿Puedo hacer más o menos de lo que pone en la tarjeta?",
      pl: "Czy mogę robić więcej lub mniej, niż jest na karcie?",
      tr: "Kartta yazandan daha fazla veya daha az yapabilir miyim?",
      ar: "هل يمكنني أن أفعل أكثر أو أقل مما هو مكتوب على البطاقة؟",
      uk: "Чи можна робити більше або менше, ніж написано на картці?"
    },
    a: {
      nl: "Houd je aan wat op de kaart staat: dat heeft je fysiotherapeut voor jou gekozen. Is een oefening te zwaar, tik dan bij die oefening op “Te zwaar?”. Wil je meer of minder doen, overleg dat met je fysiotherapeut.",
      en: "Keep to what is on the card: your physiotherapist chose it for you. If an exercise is too hard, tap “Too hard?” at that exercise. If you want to do more or less, discuss it with your physiotherapist.",
      de: "Halte dich an das, was auf der Karte steht: Das hat deine Physiotherapeutin oder dein Physiotherapeut für dich ausgewählt. Ist eine Übung zu schwer, tippe bei dieser Übung auf „Zu schwer?“. Willst du mehr oder weniger machen, sprich das mit deiner Physiotherapeutin oder deinem Physiotherapeuten ab.",
      fr: "Respecte ce qui est indiqué sur la carte : ton kinésithérapeute l’a choisi pour toi. Si un exercice est trop dur, touche « Trop dur ? » à cet exercice. Si tu veux en faire plus ou moins, parles-en avec ton kinésithérapeute.",
      es: "Sigue lo que pone en la tarjeta: tu fisioterapeuta lo eligió para ti. Si un ejercicio es demasiado duro, toca «¿Demasiado duro?» en ese ejercicio. Si quieres hacer más o menos, háblalo con tu fisioterapeuta.",
      pl: "Trzymaj się tego, co jest na karcie: fizjoterapeuta wybrał to dla ciebie. Jeśli ćwiczenie jest za trudne, dotknij „Za trudne?” przy tym ćwiczeniu. Jeśli chcesz robić więcej lub mniej, porozmawiaj o tym z fizjoterapeutą.",
      tr: "Kartta yazana uy: bunu fizyoterapistin senin için seçti. Bir egzersiz çok zorsa, o egzersizde “Çok mu zor?” düğmesine dokun. Daha fazla veya daha az yapmak istiyorsan bunu fizyoterapistinle konuş.",
      ar: "التزم بما هو مكتوب على البطاقة: فقد اختاره أخصائي العلاج الطبيعي لك. إذا كان التمرين صعبًا جدًا، اضغط على «صعب جدًا؟» عند ذلك التمرين. إذا أردت أن تفعل أكثر أو أقل، فناقش ذلك مع أخصائي العلاج الطبيعي.",
      uk: "Дотримуйся того, що написано на картці: це обрав для тебе фізіотерапевт. Якщо вправа надто важка, натисни «Занадто важко?» біля цієї вправи. Якщо хочеш робити більше або менше, обговори це з фізіотерапевтом."
    }
  },
  {
    id: "overgeslagen",
    v: {
      nl: "Ik heb een dag overgeslagen. Moet ik dat inhalen?",
      en: "I skipped a day. Do I need to make up for it?",
      de: "Ich habe einen Tag ausgelassen. Muss ich das nachholen?",
      fr: "J’ai sauté un jour. Dois-je le rattraper ?",
      es: "Me he saltado un día. ¿Tengo que recuperarlo?",
      pl: "Opuściłem jeden dzień. Czy muszę to nadrobić?",
      tr: "Bir günü atladım. Bunu telafi etmem gerekir mi?",
      ar: "فاتني يوم. هل يجب أن أعوّضه؟",
      uk: "Я пропустив день. Чи треба це надолужити?"
    },
    a: {
      nl: "Nee. Ga gewoon verder met wat er op je kaart staat en doe niet extra om het in te halen.",
      en: "No. Just carry on with what is on your card and do not do extra to make up for it.",
      de: "Nein. Mach einfach mit dem weiter, was auf deiner Karte steht, und mach nicht extra viel, um es nachzuholen.",
      fr: "Non. Continue simplement ce qui est indiqué sur ta carte et n’en fais pas plus pour rattraper.",
      es: "No. Sigue con lo que pone en tu tarjeta y no hagas más para recuperarlo.",
      pl: "Nie. Po prostu kontynuuj to, co jest na karcie, i nie rób więcej, żeby to nadrobić.",
      tr: "Hayır. Kartında yazanla devam et ve telafi etmek için fazladan yapma.",
      ar: "لا. تابع ببساطة ما هو مكتوب على بطاقتك ولا تفعل أكثر لتعويضه.",
      uk: "Ні. Просто продовжуй те, що написано на картці, і не роби більше, щоб надолужити."
    }
  },
  {
    id: "adem",
    v: {
      nl: "Hoe adem ik tijdens de oefening?",
      en: "How should I breathe during the exercise?",
      de: "Wie atme ich während der Übung?",
      fr: "Comment respirer pendant l’exercice ?",
      es: "¿Cómo respiro durante el ejercicio?",
      pl: "Jak oddychać podczas ćwiczenia?",
      tr: "Egzersiz sırasında nasıl nefes almalıyım?",
      ar: "كيف أتنفس أثناء التمرين؟",
      uk: "Як дихати під час вправи?"
    },
    a: {
      nl: "Blijf rustig doorademen en houd je adem niet in, tenzij de uitleg bij de oefening iets anders zegt.",
      en: "Keep breathing calmly and do not hold your breath, unless the explanation of the exercise says otherwise.",
      de: "Atme ruhig weiter und halte die Luft nicht an, es sei denn, die Anleitung zur Übung sagt etwas anderes.",
      fr: "Continue à respirer calmement et ne retiens pas ta respiration, sauf si l’explication de l’exercice dit autre chose.",
      es: "Sigue respirando con calma y no aguantes la respiración, salvo que la explicación del ejercicio diga otra cosa.",
      pl: "Oddychaj spokojnie i nie wstrzymuj oddechu, chyba że opis ćwiczenia mówi inaczej.",
      tr: "Sakin nefes almaya devam et ve nefesini tutma; egzersizin açıklaması başka bir şey söylüyorsa ona uy.",
      ar: "استمر في التنفس بهدوء ولا تحبس أنفاسك، إلا إذا ذكر شرح التمرين غير ذلك.",
      uk: "Дихай спокійно і не затримуй дихання, якщо в поясненні до вправи не сказано інакше."
    }
  }
];

const schoon = (t, max) => String(t == null ? "" : t)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
  .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, max);

// De vragen die de therapeut bewaart, gecontroleerd: een lijst van { v, a }.
// Geeft { ok, vragen } of { ok:false, fout }.
export function controleer(lijst) {
  if (!Array.isArray(lijst)) return { ok: false, fout: "Ongeldige lijst met vragen." };
  if (lijst.length > MAX_PER_OEF) return { ok: false, fout: "Maximaal " + MAX_PER_OEF + " vragen per oefening." };
  const uit = [];
  const gezien = new Set();
  for (const x of lijst) {
    if (!x || typeof x !== "object") return { ok: false, fout: "Ongeldige vraag." };
    const v = schoon(x.v, MAX_VRAAG), a = schoon(x.a, MAX_ANTWOORD);
    if (!v && !a) continue; // een lege regel slaan we over
    if (v.length < 3) return { ok: false, fout: "Elke vraag heeft minstens een paar woorden nodig." };
    if (a.length < 3) return { ok: false, fout: "Geef bij elke vraag ook een antwoord." };
    const k = v.toLowerCase();
    if (gezien.has(k)) return { ok: false, fout: "Deze vraag staat er al: " + v };
    gezien.add(k);
    uit.push({ v, a });
  }
  return { ok: true, vragen: uit };
}

// De oefeningnaam als sleutel (zoals hij op de kaart staat)
export const oefSleutel = (n) => String(n == null ? "" : n).replace(/\s+/g, " ").trim().slice(0, 120);

// Bewaren in de opslag van één praktijk. Een lege lijst haalt de oefening weg.
// Bestaande vragen houden hun maker en tijd als de tekst gelijk blijft.
export function zet(opslag, pk, oef, vragen, door, nu = Date.now()) {
  const naam = oefSleutel(oef);
  if (!naam) return false;
  const eigen = Object.hasOwn(opslag, pk) && opslag[pk] && typeof opslag[pk] === "object" ? opslag[pk] : {};
  const oud = Array.isArray(eigen[naam]) ? eigen[naam] : [];
  if (!vragen.length) {
    if (!Object.hasOwn(eigen, naam)) return false;
    delete eigen[naam];
  } else {
    if (!Object.hasOwn(eigen, naam) && Object.keys(eigen).length >= MAX_OEF_PER_PRAKTIJK) return false;
    eigen[naam] = vragen.map((x) => {
      const was = oud.find((o) => o && o.v === x.v && o.a === x.a);
      return was ? { v: x.v, a: x.a, t: was.t, ...(was.door ? { door: was.door } : {}) } : { v: x.v, a: x.a, t: nu, ...(door ? { door } : {}) };
    });
  }
  if (Object.keys(eigen).length) opslag[pk] = eigen; else delete opslag[pk];
  return true;
}

// Voor de kaart van de patiënt: alleen vraag en antwoord, en alleen voor de oefeningen op de kaart
export function voorKaart(opslag, pk, namen) {
  const eigen = Object.hasOwn(opslag, pk) && opslag[pk] && typeof opslag[pk] === "object" ? opslag[pk] : {};
  const uit = {};
  for (const n of namen) {
    const k = oefSleutel(n);
    if (!k || !Object.hasOwn(eigen, k) || !Array.isArray(eigen[k]) || !eigen[k].length) continue;
    uit[k] = eigen[k].map((x) => ({ v: String(x.v || ""), a: String(x.a || "") }));
  }
  return uit;
}

// Voor de app van de therapeut: alle oefeningen van de praktijk, met maker en tijd
export function voorApp(opslag, pk) {
  const eigen = Object.hasOwn(opslag, pk) && opslag[pk] && typeof opslag[pk] === "object" ? opslag[pk] : {};
  const uit = {};
  for (const [k, lijst] of Object.entries(eigen)) {
    if (Array.isArray(lijst) && lijst.length) uit[k] = lijst.map((x) => ({ v: x.v, a: x.a, t: x.t || 0, door: x.door || "" }));
  }
  return uit;
}

// De standaardvragen in één taal (valt terug op Nederlands)
export function standaardIn(taal) {
  return STANDAARD.map((s) => ({ id: s.id, v: s.v[taal] || s.v.nl, a: s.a[taal] || s.a.nl }));
}
