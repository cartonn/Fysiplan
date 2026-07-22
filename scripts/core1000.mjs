import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { exerciseId as publicExerciseId } from "../lib/exercise-id.js";

const root = new URL("../", import.meta.url);
const libraryUrl = new URL("public/oefeningen-v2.json", root);
const legacyProductionUrl = new URL("content/video-productie-v2.json", root);
const outputUrl = new URL("content/core-1000.json", root);
const summaryUrl = new URL("content/core-1000-summary.json", root);
const SAFETY = "Stop bij scherpe of toenemende pijn en overleg met je fysiotherapeut als je twijfelt.";
const DEFAULT_LANGUAGES = ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"];

function stableId(value) {
  return "fc_" + createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function move(title, action, cue, joint, goal) {
  return { title, action, cue, joint, goal };
}

function mode(label, setup, method, equipment, difficulty, suffix = "") {
  return { label, setup, method, equipment, difficulty, suffix };
}

const DOMAINS = [
  {
    id: "nek", label: "Nek", region: "Hoofd en nek", quota: 50,
    movements: [
      move("Kin intrekken", "Trek je kin rustig recht naar achteren zonder omlaag te kijken.", "Houd je kruin lang en laat je schouders los.", "cervicale wervelkolom", "diepe nekflexoren"),
      move("Nek buigen", "Breng je kin gecontroleerd richting borstbeen en kom terug tot neutraal.", "Beweeg binnen een comfortabele baan zonder te forceren.", "cervicale wervelkolom", "flexiemobiliteit"),
      move("Nek strekken", "Kijk geleidelijk omhoog en keer rustig terug.", "Verdeel de beweging over de hele nek en houd je kaak ontspannen.", "cervicale wervelkolom", "extensiemobiliteit"),
      move("Nek draaien", "Draai je hoofd alsof je over je schouder kijkt en keer terug.", "Houd je neus op gelijke hoogte en je romp stil.", "cervicale wervelkolom", "rotatiemobiliteit"),
      move("Nek zijwaarts buigen", "Breng je oor richting schouder zonder je hoofd te draaien.", "Laat de andere schouder laag en beweeg langzaam.", "cervicale wervelkolom", "lateroflexiemobiliteit"),
      move("Diepe nekflexoren activeren", "Maak een kleine knikbeweging alsof je zacht ja knikt.", "Duw je hoofd niet hard in de ondergrond en blijf doorademen.", "cranio-cervicaal", "motorische controle"),
      move("Nekrotatie met oogfixatie", "Houd je blik op één punt terwijl je hoofd rustig links en rechts beweegt.", "Stop als duizeligheid sterk toeneemt en herstel eerst je blik.", "cervicaal-oculair", "oog-hoofdcoördinatie"),
      move("Schouderblad liften en ontspannen", "Trek beide schouders richting oren en laat ze langzaam zakken.", "Laat de nek lang worden tijdens het zakken.", "schoudergordel", "ontspanning"),
      move("Levator scapulae rek", "Draai je hoofd schuin en kijk rustig richting oksel.", "Gebruik je hand alleen als lichte begeleiding, niet om te trekken.", "nek-schouderovergang", "spierlengte"),
      move("Bovenste trapezius rek", "Buig je hoofd opzij tot een milde rek aan de andere zijde ontstaat.", "Houd de schouder aan de rekzijde laag.", "nek-schouderovergang", "spierlengte")
    ],
    modes: [
      mode("zittend actief", "Zit rechtop met beide voeten op de vloer.", "Voer de beweging zonder hulp uit.", "geen", "basis"),
      mode("liggend ondersteund", "Lig op je rug met een dun kussen onder je hoofd.", "Gebruik de ondergrond als rustige feedback.", "mat en dun kussen", "regressie"),
      mode("isometrisch", "Zit rechtop en plaats je hand aan de zijde waar je kracht wilt geven.", "Geef vijf seconden lichte tegendruk zonder zichtbare beweging.", "handdoek optioneel", "basis"),
      mode("met elastiek", "Zit of sta lang en bevestig een licht elastiek veilig.", "Beweeg langzaam tegen lichte weerstand en kom gecontroleerd terug.", "licht elastiek", "progressie"),
      mode("functioneel staand", "Sta stabiel met je gewicht gelijk over beide voeten.", "Combineer de beweging met rustig kijken of reiken in de aangegeven richting.", "geen", "progressie")
    ]
  },
  {
    id: "schouder", label: "Schouder", region: "Schouder", quota: 60,
    movements: [
      move("Schouder voorwaarts heffen", "Breng je arm voorwaarts omhoog en laat hem rustig zakken.", "Houd je schouderblad breed en voorkom optrekken van de schouder.", "glenohumeraal", "flexie"),
      move("Schouder zijwaarts heffen", "Breng je arm zijwaarts omhoog en keer gecontroleerd terug.", "Beweeg in het vlak van je schouderblad met je duim iets omhoog.", "glenohumeraal", "abductie"),
      move("Schouder naar buiten draaien", "Draai je onderarm naar buiten terwijl je bovenarm stabiel blijft.", "Houd je elleboog licht tegen je zij.", "glenohumeraal", "exorotatie"),
      move("Schouder naar binnen draaien", "Draai je onderarm naar binnen zonder je romp mee te bewegen.", "Houd je schouder laag en je elleboog op dezelfde plaats.", "glenohumeraal", "endorotatie"),
      move("Schouderblad naar achteren", "Breng je schouderbladen zacht richting achterzakken en laat los.", "Knijp niet hard en maak je borstkas niet overdreven hol.", "scapulothoracaal", "scapulacontrole"),
      move("Schouderblad omhoog draaien", "Laat je schouderblad gecontroleerd meedraaien terwijl je arm omhoog gaat.", "Houd ruimte tussen schouder en oor.", "scapulothoracaal", "opwaartse rotatie"),
      move("Serratus punch", "Reik vanuit je schouderblad naar voren en kom rustig terug.", "Houd je elleboog gestrekt zonder hem op slot te zetten.", "scapulothoracaal", "serratuskracht"),
      move("Schouder extensie", "Breng je arm gestrekt naar achteren en keer terug tot naast je romp.", "Blijf lang en laat je borstkas niet voorover vallen.", "glenohumeraal", "extensie"),
      move("Horizontaal openen", "Open je armen op schouderhoogte en breng ze gecontroleerd terug.", "Laat je ribben laag en stuur vanuit de schouderbladen.", "glenohumeraal", "horizontale abductie"),
      move("Onderste trapezius heffen", "Breng je armen schuin omhoog in een Y-vorm en laat rustig zakken.", "Houd je nek ontspannen en leid met je duimen.", "scapulothoracaal", "onderste trapezius"),
      move("Schouder pendelen", "Laat je arm ontspannen hangen en maak kleine rustige cirkels.", "Gebruik je romp om de beweging te starten; de arm blijft los.", "glenohumeraal", "ontlasting"),
      move("Hand achter de rug brengen", "Schuif je hand rustig langs je rug omhoog en weer terug.", "Forceer niet en houd je schouder weg van je oor.", "glenohumeraal", "endorotatiemobiliteit")
    ],
    modes: [
      mode("geleid met stok", "Zit of lig stabiel en houd een stok met beide handen vast.", "Laat de andere arm rustig meehelpen.", "stok", "regressie"),
      mode("actief zonder gewicht", "Zit of sta rechtop met ontspannen schouders.", "Voer de volledige comfortabele beweging zelf uit.", "geen", "basis"),
      mode("isometrisch tegen muur", "Sta naast een muur met een opgerolde handdoek tussen arm en muur.", "Geef vijf seconden gelijkmatige druk zonder mee te bewegen.", "muur en handdoek", "basis"),
      mode("met elastiek", "Bevestig een licht elastiek stevig en neem een lange houding aan.", "Beweeg tegen weerstand en keer in drie tellen terug.", "elastiek", "progressie"),
      mode("functioneel reikend", "Sta stabiel voor een tafel of wand met een licht voorwerp binnen bereik.", "Reik gecontroleerd en plaats het voorwerp zonder compensatie.", "licht voorwerp", "progressie")
    ]
  },
  {
    id: "arm-hand", label: "Elleboog, pols en hand", region: "Arm en hand", quota: 60,
    movements: [
      move("Elleboog buigen", "Buig je elleboog en breng je hand richting schouder, daarna rustig terug.", "Houd je bovenarm naast je romp.", "elleboog", "flexie"),
      move("Elleboog strekken", "Strek je elleboog volledig binnen je comfortabele bereik en buig terug.", "Laat je schouder ontspannen.", "elleboog", "extensie"),
      move("Onderarm naar handpalm boven", "Draai je onderarm zodat je handpalm omhoog wijst en keer terug.", "Houd je elleboog in negentig graden tegen je zij.", "radio-ulnair", "supinatie"),
      move("Onderarm naar handpalm onder", "Draai je onderarm zodat je handpalm omlaag wijst en keer terug.", "Voorkom dat je schouder meedraait.", "radio-ulnair", "pronatie"),
      move("Pols omhoog", "Breng je handrug richting onderarm en laat gecontroleerd zakken.", "De onderarm blijft ondersteund en stil.", "pols", "extensie"),
      move("Pols omlaag", "Buig je handpalm richting onderarm en keer terug.", "Beweeg rustig door de pols zonder de vingers hard te knijpen.", "pols", "flexie"),
      move("Pols naar duimzijde", "Beweeg je hand richting duimzijde en terug naar neutraal.", "Houd je onderarm en vingers ontspannen.", "pols", "radiale deviatie"),
      move("Pols naar pinkzijde", "Beweeg je hand richting pinkzijde en terug naar neutraal.", "Voorkom rotatie van de onderarm.", "pols", "ulnaire deviatie"),
      move("Vingers openen en sluiten", "Spreid je vingers volledig en maak daarna een ontspannen vuist.", "Buig en strek alle vingergewrichten gelijkmatig.", "vingers", "mobiliteit"),
      move("Duim oppositie", "Raak met je duim één voor één iedere vingertop aan.", "Maak een ronde O-vorm zonder de duim te forceren.", "duimbasis", "coördinatie"),
      move("Peesglijden hand", "Doorloop rustig rechte hand, haakvuist, volle vuist en tafelpositie.", "Houd iedere positie kort vast zonder pijn uit te lokken.", "hand", "peesglijden"),
      move("Knijpkracht", "Knijp gelijkmatig in het materiaal en laat volledig los.", "Houd pols neutraal en adem door.", "hand", "grijpkracht")
    ],
    modes: [
      mode("actief ondersteund", "Zit aan tafel met je onderarm comfortabel ondersteund.", "Gebruik je andere hand alleen voor lichte begeleiding.", "tafel", "regressie"),
      mode("actief", "Zit rechtop met je onderarm ondersteund en je hand vrij.", "Voer de beweging zelf uit door het beschikbare bereik.", "tafel", "basis"),
      mode("isometrisch", "Zit met de onderarm ondersteund en plaats je andere hand als weerstand.", "Geef vijf seconden lichte druk zonder zichtbare beweging.", "geen", "basis"),
      mode("met lichte weerstand", "Zit met je onderarm stevig ondersteund.", "Beweeg tegen lichte weerstand en laat langzaam terugkomen.", "licht elastiek of 0,5 kg", "progressie"),
      mode("functionele taak", "Zit aan tafel met kleine alledaagse voorwerpen voor je.", "Voer de beweging uit tijdens gecontroleerd pakken, draaien of plaatsen.", "bekertje, wasknijper of zachte bal", "progressie")
    ]
  },
  {
    id: "rug", label: "Rug", region: "Romp en rug", quota: 60,
    movements: [
      move("Bekken kantelen", "Kantel je bekken rustig voor- en achterover en vind daarna het midden.", "Laat borstkas en schouders ontspannen.", "lumbaal-bekken", "motorische controle"),
      move("Rug bol en hol", "Maak je rug geleidelijk rond en daarna rustig lang.", "Verdeel de beweging over de hele wervelkolom.", "wervelkolom", "mobiliteit"),
      move("Romp draaien", "Draai je borstkas rustig naar één zijde en terug.", "Houd je bekken zo stil mogelijk.", "thoracolumbaal", "rotatie"),
      move("Romp zijwaarts buigen", "Glijd met één hand langs je zij en kom gecontroleerd terug.", "Blijf in één vlak en draai niet mee.", "thoracolumbaal", "lateroflexie"),
      move("Rug strekken", "Maak je borstbeen lang naar voren of omhoog en keer terug.", "Beweeg zonder in de onderrug te knijpen.", "thoracolumbaal", "extensie"),
      move("Knie naar borst", "Breng één knie rustig richting borst en laat weer zakken.", "Houd de andere zijde ontspannen en voorkom forceren.", "lumbaal-heup", "flexiemobiliteit"),
      move("Open boek", "Draai je bovenste arm en borstkas open en keer terug.", "Houd je knieën op elkaar en volg je hand met je ogen.", "thoracaal", "rotatiemobiliteit"),
      move("Brug", "Til je bekken op tot schouders, heupen en knieën één lijn vormen.", "Duw gelijkmatig door beide voeten en houd je ribben laag.", "lumbaal-bekken", "heupextensiekracht"),
      move("Bird dog", "Strek één arm en het tegenovergestelde been en keer terug.", "Houd je bekken horizontaal en maak jezelf lang.", "romp", "rompstabiliteit"),
      move("Dead bug", "Laat tegenovergestelde arm en been gecontroleerd van elkaar weg bewegen.", "Houd je onderrug rustig en adem uit tijdens het strekken.", "romp", "anterieure rompcontrole"),
      move("Romp heupscharnier", "Kantel vanuit je heupen voorover en kom terug tot lang staan.", "Houd je rug lang en je gewicht verdeeld over de hele voet.", "heup-rug", "tiltechniek"),
      move("Thoracale extensie", "Open je bovenrug over de steun en keer rustig terug.", "Ondersteun je hoofd en houd de beweging uit de onderrug.", "thoracaal", "extensiemobiliteit")
    ],
    modes: [
      mode("liggend", "Lig stabiel op je rug of zij op een mat.", "Gebruik de ondergrond om ongewenste beweging te beperken.", "mat", "regressie"),
      mode("op handen en knieën", "Kom op handen en knieën met handen onder schouders en knieën onder heupen.", "Verplaats langzaam zonder door je armen te zakken.", "mat", "basis"),
      mode("zittend", "Zit voor op een stevige stoel met beide voeten op de grond.", "Blijf lang en beweeg vanuit de bedoelde rugregio.", "stoel", "basis"),
      mode("staand", "Sta op heupbreedte met zachte knieën.", "Behoud je balans en verdeel het gewicht gelijk.", "geen", "progressie"),
      mode("met lichte weerstand", "Neem een stabiele houding en houd een licht elastiek of gewicht vast.", "Beweeg gecontroleerd tegen weerstand en vertraag de terugweg.", "elastiek of licht gewicht", "progressie")
    ]
  },
  {
    id: "heup", label: "Heup", region: "Heup", quota: 55,
    movements: [
      move("Heup buigen", "Breng je knie richting borst en laat gecontroleerd zakken.", "Houd je bekken recht en je romp lang.", "heup", "flexie"),
      move("Heup strekken", "Breng je been vanuit de heup naar achteren en keer terug.", "Span je bil aan zonder je onderrug hol te trekken.", "heup", "extensie"),
      move("Heup zijwaarts heffen", "Breng je been zijwaarts en keer langzaam terug.", "Houd voet en knie naar voren en je bekken horizontaal.", "heup", "abductie"),
      move("Heup naar binnen bewegen", "Breng je been gecontroleerd naar de middellijn en terug.", "Blijf lang en voorkom dat je bekken draait.", "heup", "adductie"),
      move("Heup naar buiten draaien", "Draai je bovenbeen gecontroleerd naar buiten en terug.", "Houd je bekken stil en beweeg binnen een pijnvrije baan.", "heup", "exorotatie"),
      move("Heup naar binnen draaien", "Draai je bovenbeen gecontroleerd naar binnen en terug.", "Laat je romp niet meebewegen.", "heup", "endorotatie"),
      move("Clamshell", "Open je bovenste knie terwijl je voeten bij elkaar blijven.", "Rol je bekken niet naar achteren.", "heup", "abductie-exorotatie"),
      move("Heupscharnier", "Breng je billen naar achteren en kom vanuit je heupen terug omhoog.", "Houd rug en nek lang.", "heup", "functionele kracht"),
      move("Monster walk", "Stap gecontroleerd schuin voorwaarts en houd spanning op het elastiek.", "Houd knieën boven de voeten en je bekken stabiel.", "heup", "laterale keten"),
      move("Heupflexor rek", "Verplaats je bekken rustig voorwaarts tot een milde rek aan de voorzijde ontstaat.", "Kantel je bekken licht achterover en blijf lang.", "heup", "spierlengte"),
      move("Piriformis rek", "Breng je onderbeen gecontroleerd over het andere been en trek licht naar je toe.", "Houd je bekken ontspannen op de ondergrond.", "heup", "rotatiemobiliteit")
    ],
    modes: [
      mode("liggend ondersteund", "Lig stabiel op een mat met je romp ontspannen.", "Gebruik de mat voor steun en voer de beweging rustig uit.", "mat", "regressie"),
      mode("zijlig", "Lig op je zij met heupen gestapeld en je hoofd ondersteund.", "Houd je bekken loodrecht op de mat.", "mat", "basis"),
      mode("staand met steun", "Sta naast een stevige tafel of leuning.", "Gebruik één hand licht voor balans.", "tafel of leuning", "basis"),
      mode("met elastiek", "Plaats een licht elastiek veilig rond de benen en neem een stabiele houding aan.", "Houd continue lichte spanning en vertraag de terugweg.", "elastiek", "progressie"),
      mode("functioneel op één been", "Sta op één been bij een stevig steunpunt.", "Behoud een horizontaal bekken tijdens de hele taak.", "steunpunt", "progressie")
    ]
  },
  {
    id: "knie", label: "Knie", region: "Knie", quota: 55,
    movements: [
      move("Knie buigen", "Buig je knie rustig en strek daarna terug.", "Houd de knie in lijn met de tweede teen.", "knie", "flexie"),
      move("Knie strekken", "Strek je knie volledig binnen je comfortabele bereik en laat langzaam terug.", "Span je bovenbeen aan zonder je adem vast te houden.", "knie", "extensie"),
      move("Quadriceps aanspannen", "Druk je knieholte licht richting ondergrond en span je bovenbeen aan.", "Houd vijf seconden vast en ontspan volledig.", "knie", "quadricepsactivatie"),
      move("Straight leg raise", "Til je gestrekte been tot de hoogte van het andere bovenbeen en laat zakken.", "Houd je knie gestrekt en je bekken stil.", "knie-heup", "quadricepskracht"),
      move("Mini-squat", "Buig heupen en knieën licht en kom gecontroleerd terug.", "Houd knieën boven de voeten en borstbeen lang.", "knie", "gesloten keten"),
      move("Sit-to-stand", "Kom gecontroleerd overeind van de stoel en ga rustig terug zitten.", "Duw door beide voeten en stuur je knieën vooruit.", "knie-heup", "functionele kracht"),
      move("Step-up", "Stap volledig op de verhoging en kom gecontroleerd terug.", "Houd knie en voet in één lijn.", "knie-heup", "trapfunctie"),
      move("Step-down", "Laat één hiel rustig richting vloer zakken en duw terug omhoog.", "Houd je bekken horizontaal en voorkom naar binnen vallen van de knie.", "knie-heup", "excentrische controle"),
      move("Split squat", "Zak recht omlaag tussen beide voeten en duw terug omhoog.", "Verdeel je gewicht en houd voorste knie boven de voet.", "knie-heup", "unilaterale kracht"),
      move("Hamstring curl", "Buig je knie en breng je hiel richting bil, daarna langzaam terug.", "Houd je bovenbeen stil.", "knie", "hamstringkracht"),
      move("Terminal knee extension", "Strek je knie tegen de weerstand tot lang staan en laat rustig terug.", "Span je bovenbeen aan en houd je heup boven je voet.", "knie", "eindstrekking")
    ],
    modes: [
      mode("liggend", "Lig op je rug met beide benen comfortabel ondersteund.", "Voer de beweging rustig uit zonder je bekken te kantelen.", "mat of behandelbank", "regressie"),
      mode("zittend", "Zit stevig op een stoel met beide voeten vrij of op de vloer.", "Blijf rechtop en beweeg gecontroleerd.", "stoel", "basis"),
      mode("staand met steun", "Sta bij een stevige leuning of tafel.", "Gebruik de steun alleen voor balans.", "steunpunt", "basis"),
      mode("met elastiek", "Bevestig een licht elastiek veilig en neem de aangegeven houding aan.", "Werk tegen weerstand en keer in drie tellen terug.", "elastiek", "progressie"),
      mode("op verhoging", "Sta voor of op een lage, stabiele verhoging.", "Plaats je hele voet en behoud controle tijdens op- en afstappen.", "step", "progressie")
    ]
  },
  {
    id: "enkel-voet", label: "Enkel en voet", region: "Enkel en voet", quota: 55,
    movements: [
      move("Enkel optrekken", "Trek je voet en tenen richting scheenbeen en laat terug.", "Houd je hiel op dezelfde plaats.", "enkel", "dorsaalflexie"),
      move("Enkel wegduwen", "Duw je voorvoet van je af en keer gecontroleerd terug.", "Beweeg recht door de enkel zonder naar binnen te draaien.", "enkel", "plantairflexie"),
      move("Voet naar binnen", "Draai de voetzool licht naar binnen en keer terug.", "Houd je knie stil en maak de beweging klein.", "enkel", "inversie"),
      move("Voet naar buiten", "Draai de voetzool licht naar buiten en keer terug.", "Beweeg vanuit de enkel zonder je hele been te draaien.", "enkel", "eversie"),
      move("Kuitheffing", "Kom gecontroleerd op je voorvoeten en laat je hielen langzaam zakken.", "Verdeel de druk over grote teen, kleine teen en hielbasis.", "enkel", "kuitkracht"),
      move("Tenen heffen", "Til alle tenen op terwijl de bal van de voet blijft staan.", "Houd je voetboog rustig en laat langzaam zakken.", "voet", "voorste scheenbeenspier"),
      move("Korte voet", "Trek de bal van je grote teen subtiel richting hiel zonder je tenen te krullen.", "Behoud driepuntscontact van de voet.", "voet", "voetboogcontrole"),
      move("Tenen spreiden", "Spreid je tenen en plaats ze één voor één ontspannen terug.", "Voorkom hard krullen van de tenen.", "voorvoet", "intrinsieke voetspieren"),
      move("Knie naar voren over voet", "Breng je knie gecontroleerd naar voren terwijl je hiel blijft staan.", "Stuur de knie richting tweede teen.", "enkel", "dorsaalflexiemobiliteit"),
      move("Kuitrek gestrekte knie", "Verplaats je gewicht naar voren met de achterste knie gestrekt.", "Houd de achterste hiel laag en voet recht vooruit.", "enkel-kuit", "gastrocnemiuslengte"),
      move("Kuitrek gebogen knie", "Buig de achterste knie terwijl de hiel op de grond blijft.", "Houd de voetboog actief en beweeg rustig voorwaarts.", "enkel-kuit", "soleuslengte")
    ],
    modes: [
      mode("zittend actief", "Zit met je voet vrij of licht op de vloer.", "Beweeg rustig door het beschikbare bereik.", "stoel", "regressie"),
      mode("staand met steun", "Sta bij een stevige leuning met voeten op heupbreedte.", "Gebruik de steun alleen voor balans.", "leuning", "basis"),
      mode("met elastiek", "Zit stabiel en bevestig een licht elastiek veilig rond de voorvoet.", "Werk tegen lichte weerstand en laat langzaam terug.", "elastiek", "basis"),
      mode("op één been", "Sta op één been bij een stevig steunpunt.", "Houd knie, enkel en tweede teen in één lijn.", "steunpunt", "progressie"),
      mode("op een verhoging", "Sta met de voorvoet op een lage stabiele verhoging.", "Gebruik het volledige comfortabele bereik met langzame terugweg.", "lage step", "progressie")
    ]
  },
  {
    id: "balans", label: "Balans en valpreventie", region: "Balans", quota: 70,
    movements: [
      move("Voeten naast elkaar staan", "Blijf stabiel staan met beide voeten tegen elkaar.", "Kijk vooruit en verdeel je gewicht gelijk.", "hele lichaam", "statische balans"),
      move("Semi-tandemstand", "Plaats één voet half voor de andere en houd de positie.", "Houd je heupen recht vooruit.", "hele lichaam", "statische balans"),
      move("Tandemstand", "Plaats hiel voor teen en blijf gecontroleerd staan.", "Maak jezelf lang en gebruik een steunpunt indien nodig.", "hele lichaam", "smalle steunbasis"),
      move("Eenbeenstand", "Til één voet op en blijf stabiel op het standbeen.", "Houd je bekken horizontaal en knie zacht.", "hele lichaam", "unilaterale balans"),
      move("Gewicht verplaatsen voor-achter", "Verplaats je gewicht richting voorvoet en daarna richting hielen.", "Houd je hele lichaam als één lijn en voorkom stappen.", "hele lichaam", "grensverkenning"),
      move("Gewicht verplaatsen zijwaarts", "Verplaats je gewicht rustig van het ene naar het andere been.", "Houd beide voeten op de vloer.", "hele lichaam", "laterale controle"),
      move("Reiken in stand", "Reik met één hand naar een doel en keer terug naar het midden.", "Beweeg gecontroleerd vanuit enkels en heupen.", "hele lichaam", "dynamische balans"),
      move("Op de plaats marcheren", "Til afwisselend je knieën en plaats je voeten gecontroleerd terug.", "Blijf lang en houd een gelijkmatig ritme.", "hele lichaam", "dynamische balans"),
      move("Zijwaarts stappen", "Stap zijwaarts en sluit gecontroleerd aan.", "Houd tenen vooruit en knieën zacht.", "hele lichaam", "laterale stabiliteit"),
      move("Achterwaarts stappen", "Stap rustig achteruit en breng je gewicht gecontroleerd terug.", "Kijk vooruit en plaats eerst de bal van de voet.", "hele lichaam", "achterwaartse controle"),
      move("Over een obstakel stappen", "Til je voet over het obstakel en plaats hem volledig neer.", "Geef jezelf tijd en voorkom om het obstakel heen draaien.", "hele lichaam", "obstakelvaardigheid"),
      move("Draaien op de plaats", "Maak meerdere kleine stappen om veilig om te draaien.", "Houd voeten uit elkaar en draai niet op één vaststaande voet.", "hele lichaam", "draaivaardigheid"),
      move("Stoel opstaan en lopen", "Sta op, loop naar het markeringspunt, draai en ga weer zitten.", "Werk rustig en controleer iedere overgang.", "hele lichaam", "functionele mobiliteit"),
      move("Dubbele taak lopen", "Loop rustig terwijl je een eenvoudige tweede taak uitvoert.", "Verlaag het tempo zodra de kwaliteit van lopen afneemt.", "hele lichaam", "dual-task balans")
    ],
    modes: [
      mode("met stevige steun", "Sta naast een aanrecht of stevige leuning.", "Houd de steun met één of twee handen vast.", "aanrecht of leuning", "regressie"),
      mode("zonder steun", "Sta in een vrije, goed verlichte ruimte met een steunpunt binnen bereik.", "Voer de taak zonder vasthouden uit.", "geen", "basis"),
      mode("met hoofdbeweging", "Sta stabiel met een steunpunt binnen bereik.", "Voeg rustige hoofdbewegingen toe zonder de taak te versnellen.", "steunpunt", "progressie"),
      mode("op zachte ondergrond", "Sta op een stevige schuimmat met een steunpunt binnen bereik.", "Beperk de taak zodra je voeten of knieën hun lijn verliezen.", "balanskussen", "progressie"),
      mode("met cognitieve taak", "Sta of loop in een veilige vrije ruimte.", "Noem bijvoorbeeld maanden of tel rustig terwijl je blijft bewegen.", "geen", "progressie")
    ]
  },
  {
    id: "neuro", label: "Neurologische revalidatie", region: "Neurologie", quota: 55,
    movements: [
      move("Symmetrisch opstaan", "Kom met gelijkmatige druk door beide voeten overeind.", "Breng je neus eerst boven je tenen en strek daarna heupen en knieën.", "hele lichaam", "transfer"),
      move("Zijwaarts verplaatsen in zit", "Verplaats je gewicht naar één zitbeen en keer terug.", "Houd beide voeten ondersteund en maak de beweging bewust.", "romp", "rompcontrole"),
      move("Reiken met aangedane arm", "Reik rustig naar het doel en breng je hand gecontroleerd terug.", "Beperk meebewegen van de romp.", "bovenste extremiteit", "armfunctie"),
      move("Hand openen na grijpen", "Open je vingers volledig na het vasthouden van een zacht voorwerp.", "Geef tijd aan de ontspanning en forceer niet.", "hand", "selectieve motoriek"),
      move("Hiel plaatsen", "Plaats je hiel bewust voor je neer en rol je voet af.", "Til je voorvoet voldoende op tijdens de zwaaifase.", "onderste extremiteit", "looppatroon"),
      move("Stap initiëren", "Verplaats je gewicht en zet daarna bewust de eerste stap.", "Gebruik een duidelijk ritme of tel hardop.", "hele lichaam", "starten met lopen"),
      move("Grote stappen", "Maak rustige ruime stappen en zwaai je armen mee.", "Houd je borstbeen lang en kijk vooruit.", "hele lichaam", "amplitude"),
      move("Ritmisch marcheren", "Marcheer in een gelijkmatig aangegeven ritme.", "Plaats iedere voet volledig en behoud de maat.", "hele lichaam", "ritmische motoriek"),
      move("Romp rotatie in zit", "Draai je borstkas en reik naar een doel naast je.", "Houd beide zitbeenderen op de stoel.", "romp", "selectieve rompbeweging"),
      move("Brug met symmetrie", "Til je bekken op met gelijke druk door beide voeten.", "Controleer dat je bekken niet wegdraait.", "romp-heup", "symmetrische activatie"),
      move("Voet naar marker", "Plaats je voet gecontroleerd op of naast een marker en terug.", "Til je voet voldoende op en rem de neerwaartse beweging af.", "onderste extremiteit", "gerichte stap")
    ],
    modes: [
      mode("met fysieke steun", "Neem een veilige uitgangshouding met een stevige steun aan de sterke zijde.", "Gebruik de steun om de beweging gecontroleerd te starten.", "steunpunt", "regressie"),
      mode("met visueel doel", "Plaats een duidelijk contrasterend doel binnen comfortabel bereik.", "Richt de beweging bewust op het doel.", "kleurmarker", "basis"),
      mode("met ritmische cue", "Neem de aangegeven houding aan en luister naar een rustig gelijkmatig ritme.", "Start iedere herhaling op dezelfde tel.", "metronoom of tellen", "basis"),
      mode("bilateraal", "Neem een symmetrische houding aan met beide zijden ondersteund.", "Laat beide zijden tegelijk of om-en-om meewerken.", "geen", "progressie"),
      mode("functionele combinatie", "Plaats de benodigde voorwerpen veilig binnen bereik.", "Combineer de beweging met een eenvoudige dagelijkse taak.", "alledaags voorwerp", "progressie")
    ]
  },
  {
    id: "vestibulair", label: "Vestibulair", region: "Evenwicht en blik", quota: 30,
    movements: [
      move("Blikstabilisatie horizontaal", "Houd je ogen op het doel terwijl je hoofd links en rechts beweegt.", "Het doel blijft zo scherp mogelijk; herstel tussendoor.", "vestibulo-oculair", "VOR horizontaal"),
      move("Blikstabilisatie verticaal", "Houd je ogen op het doel terwijl je hoofd omhoog en omlaag beweegt.", "Begin langzaam en stop bij sterke toename van klachten.", "vestibulo-oculair", "VOR verticaal"),
      move("Ogen naar doelen", "Verplaats je blik snel tussen twee stilstaande doelen.", "Houd je hoofd stil en pauzeer kort op ieder doel.", "oculomotorisch", "saccades"),
      move("Doel volgen", "Volg een langzaam bewegend doel met je ogen.", "Houd je hoofd stil en beweeg vloeiend.", "oculomotorisch", "smooth pursuit"),
      move("Hoofd draaien in stand", "Draai je hoofd rustig terwijl je stabiel blijft staan.", "Gebruik een steunpunt binnen handbereik.", "vestibulair-balans", "habituatie"),
      move("Buigen en oprichten", "Buig rustig voorover en kom gecontroleerd terug omhoog.", "Wacht na iedere herhaling tot de klachten weer afnemen.", "vestibulair", "positieverandering")
    ],
    modes: [
      mode("zittend langzaam", "Zit stevig met voeten op de vloer en een duidelijk doel voor je.", "Voer de taak langzaam gedurende een korte periode uit.", "letterkaart", "regressie"),
      mode("staand langzaam", "Sta met voeten op heupbreedte en een steunpunt binnen bereik.", "Voer de taak langzaam uit.", "letterkaart en steunpunt", "basis"),
      mode("staand sneller", "Sta stabiel met het doel op ooghoogte.", "Verhoog alleen het tempo als het beeld scherp blijft.", "letterkaart", "progressie"),
      mode("tijdens lopen", "Loop in een vrije gang met begeleiding of steun indien voorgeschreven.", "Behoud een veilig tempo terwijl je de bliktaak uitvoert.", "letterkaart", "progressie"),
      mode("drukke achtergrond", "Plaats het doel voor een contrastrijke maar stilstaande achtergrond.", "Start kort en neem voldoende hersteltijd.", "visuele achtergrond", "extra-review")
    ]
  },
  {
    id: "bekken", label: "Bekkengezondheid", region: "Bekken", quota: 35,
    movements: [
      move("Bekkenbodem aanspannen", "Sluit en lift de bekkenbodem zacht en laat volledig los.", "Span billen en buik niet hard mee en blijf ademen.", "bekkenbodem", "kracht"),
      move("Bekkenbodem ontspannen", "Laat de bekkenbodem bewust zakken tijdens een rustige inademing.", "Ontspan kaak, buik en billen.", "bekkenbodem", "ontspanning"),
      move("Bekkenbodem snel aanspannen", "Maak een korte lichte aanspanning en laat direct volledig los.", "Kwaliteit gaat voor snelheid.", "bekkenbodem", "snelkracht"),
      move("Bekkenbodem met uitademing", "Adem uit en lift de bekkenbodem zacht; ontspan bij inademen.", "Vermijd persen of je adem vasthouden.", "bekkenbodem-ademhaling", "coördinatie"),
      move("Diepe buikactivatie", "Span de onderbuik subtiel aan zonder je bekken te bewegen.", "Blijf rustig doorademen en houd ribben ontspannen.", "romp-bekken", "rompcontrole"),
      move("Adductor ontspanning", "Laat knieën ondersteund naar buiten zakken en adem rustig.", "Zoek ontspanning, geen maximale rek.", "heup-bekken", "ontspanning"),
      move("Bekkenmobiliteit", "Beweeg je bekken rustig voor, achter en naar beide zijden.", "Maak de beweging klein en vloeiend.", "bekken", "mobiliteit")
    ],
    modes: [
      mode("liggend", "Lig comfortabel met gebogen knieën en steun waar nodig.", "Voel de beweging zonder zichtbare compensatie.", "mat en kussen", "regressie"),
      mode("zijlig", "Lig op je zij met knieën licht gebogen en je buik ontspannen.", "Gebruik rustige ademhaling als ritme.", "mat en kussen", "basis"),
      mode("zittend", "Zit ontspannen op een stevige stoel met voeten ondersteund.", "Blijf lang en houd buik en billen zacht.", "stoel", "basis"),
      mode("staand", "Sta ontspannen met voeten op heupbreedte.", "Behoud normale ademhaling en gelijkmatige gewichtsverdeling.", "geen", "progressie"),
      mode("tijdens functionele taak", "Neem de uitgangshouding van de afgesproken dagelijkse taak aan.", "Coördineer de beweging met uitademen tijdens inspanning.", "alledaags voorwerp", "progressie")
    ]
  },
  {
    id: "zwangerschap", label: "Zwangerschap en postpartum", region: "Zwangerschap", quota: 20,
    movements: [
      move("360 graden ademhaling", "Adem rustig naar flanken, rug en buik en adem ontspannen uit.", "Laat schouders en kaak los.", "ademhaling-romp", "drukregulatie"),
      move("Bekkenkanteling postpartum", "Kantel je bekken klein voor- en achterover en vind neutraal.", "Vermijd persen en beweeg pijnvrij.", "bekken-romp", "mobiliteit"),
      move("Zijlig heupkracht", "Breng je bovenste knie of been gecontroleerd omhoog en terug.", "Houd je bekken gestapeld en adem door.", "heup", "laterale kracht"),
      move("Functioneel opstaan", "Kom via een vooroververplaatsing gecontroleerd overeind.", "Adem uit tijdens het opstaan en gebruik steun indien nodig.", "hele lichaam", "dagelijkse functie")
    ],
    modes: [
      mode("eerste fase rustig", "Neem een comfortabele ondersteunde houding aan.", "Werk met kleine bewegingen en ruime hersteltijd.", "kussens", "regressie"),
      mode("zittend", "Zit ondersteund met beide voeten op de grond.", "Behoud ontspannen ademhaling.", "stoel", "basis"),
      mode("zijlig", "Lig op je zij met kussens tussen knieën en onder buik indien prettig.", "Beweeg rustig zonder druk op de buik.", "mat en kussens", "basis"),
      mode("staand met steun", "Sta bij een tafel of aanrecht met voeten op heupbreedte.", "Gebruik de steun licht en blijf doorademen.", "tafel of aanrecht", "progressie"),
      mode("functioneel", "Neem de houding van de dagelijkse taak aan met materiaal dicht bij je.", "Adem uit bij inspanning en vermijd langdurig persen.", "alledaags voorwerp", "progressie")
    ]
  },
  {
    id: "cardiopulmonaal", label: "Cardiopulmonaal", region: "Conditie en ademhaling", quota: 35,
    movements: [
      move("Lippenremademhaling", "Adem in door je neus en langer uit door bijna gesloten lippen.", "Maak de uitademing rustig, niet geforceerd.", "ademhaling", "dyspnoeregulatie"),
      move("Diafragma-ademhaling", "Laat je onderribben en buik rustig uitzetten bij inademen.", "Houd borst en schouders ontspannen.", "ademhaling", "ademcoördinatie"),
      move("Thorax openen", "Open je armen tijdens het inademen en sluit rustig bij uitademen.", "Beweeg alleen binnen een comfortabele ademruimte.", "thorax", "thoraxmobiliteit"),
      move("Marcheren", "Marcheer in een gelijkmatig tempo en blijf rustig ademen.", "Gebruik de praattest en vertraag indien nodig.", "hele lichaam", "conditie"),
      move("Zijwaarts stappen", "Stap afwisselend opzij en terug in een rustig ritme.", "Plaats je voeten volledig en houd voldoende ruimte.", "hele lichaam", "conditie"),
      move("Opstaan herhalen", "Sta rustig op en ga gecontroleerd weer zitten.", "Adem uit tijdens het opstaan.", "hele lichaam", "functionele conditie"),
      move("Armen en adem koppelen", "Breng je armen omhoog bij inademen en omlaag bij uitademen.", "Stop voor vermoeidheid je techniek verandert.", "schouder-thorax", "adem-beweegcoördinatie")
    ],
    modes: [
      mode("zittend", "Zit ondersteund met voeten op de vloer.", "Werk in een rustig tempo met voldoende herstel.", "stoel", "regressie"),
      mode("staand met steun", "Sta bij een stevig steunpunt.", "Gebruik de steun licht en houd de praattest aan.", "steunpunt", "basis"),
      mode("interval kort", "Neem een veilige houding en zet een korte werk- en rusttijd klaar.", "Wissel korte inspanning af met volledig herstel.", "timer", "basis"),
      mode("interval langer", "Neem een veilige vrije werkplek en houd een stoel dichtbij.", "Werk langer op matige intensiteit zonder buiten adem te raken.", "timer en stoel", "progressie"),
      mode("met armtaak", "Sta of zit met een licht voorwerp binnen bereik.", "Combineer de ademhaling met rustig heffen of verplaatsen.", "licht voorwerp", "progressie")
    ]
  },
  {
    id: "postoperatief", label: "Postoperatieve revalidatie", region: "Postoperatief", quota: 45,
    movements: [
      move("Enkelpompen", "Beweeg beide voeten rustig op en neer.", "Houd benen ontspannen en beweeg regelmatig.", "enkel", "circulatie"),
      move("Quadriceps activeren", "Druk je knieholte zacht naar beneden en span je bovenbeen aan.", "Houd kort vast zonder je adem in te houden.", "knie", "spieractivatie"),
      move("Hielschuiven", "Schuif je hiel richting bil en daarna rustig terug.", "Houd je knie in lijn en respecteer het afgesproken bereik.", "knie-heup", "mobiliteit"),
      move("Gestrekt been heffen", "Til het gestrekte been gecontroleerd op en laat terug.", "Voer dit alleen uit zonder strekvertraging en volgens protocol.", "knie-heup", "quadricepskracht"),
      move("Schouder pendelen", "Laat je arm ontspannen hangen en maak kleine cirkels.", "Respecteer draag- en bewegingsrestricties.", "schouder", "ontlasting"),
      move("Hand en elleboog bewegen", "Open en sluit je hand en buig en strek je elleboog rustig.", "Houd de geopereerde schouder ontspannen.", "arm", "distale mobiliteit"),
      move("Geassisteerde armheffing", "Help de geopereerde arm met de andere arm binnen het toegestane bereik.", "Volg exact de grens uit het behandelprotocol.", "schouder", "passief-geassisteerde mobiliteit"),
      move("Veilig opstaan", "Schuif naar voren, plaats je voeten en kom volgens de afgesproken belasting overeind.", "Gebruik armleuningen of hulpmiddel zoals voorgeschreven.", "hele lichaam", "transfer"),
      move("Lopen met hulpmiddel", "Plaats hulpmiddel en aangedane been volgens het aangeleerde patroon.", "Houd passen klein en volg de belastingsafspraak.", "hele lichaam", "gangrevalidatie")
    ],
    modes: [
      mode("vroege fase", "Neem de door je behandelaar voorgeschreven ondersteunde houding aan.", "Voer alleen het toegestane bereik en de toegestane belasting uit.", "kussen of brace volgens protocol", "extra-review"),
      mode("actief ondersteund", "Neem een stabiele houding aan en ondersteun het geopereerde lichaamsdeel.", "Help de beweging zonder te trekken of te forceren.", "handdoek, stok of band", "regressie"),
      mode("actief", "Neem een veilige houding aan binnen de geldende restricties.", "Voer de beweging zelf uit met rustige controle.", "geen", "basis"),
      mode("functioneel", "Zet stoel, hulpmiddel en looproute vooraf veilig klaar.", "Voer de dagelijkse taak stap voor stap uit.", "stoel of loophulpmiddel", "basis"),
      mode("opbouwfase", "Neem de afgesproken uitgangshouding aan na vrijgave door je behandelaar.", "Vergroot belasting of bereik alleen volgens het protocol.", "licht elastiek of step", "progressie")
    ]
  },
  {
    id: "pediatrie", label: "Pediatrie", region: "Kind en jeugd", quota: 25,
    movements: [
      move("Dierenloop", "Beweeg als het gekozen dier naar het doel en weer terug.", "Houd het speels en stop voordat de houding inzakt.", "hele lichaam", "motorische ontwikkeling"),
      move("Springen en landen", "Spring met twee voeten en land zacht op de gemarkeerde plek.", "Buig heupen en knieën bij de landing.", "hele lichaam", "sprongcontrole"),
      move("Bal gooien en vangen", "Gooi de bal naar het doel of de begeleider en vang hem terug.", "Kijk naar de bal en gebruik beide handen waar nodig.", "bovenste extremiteit", "oog-handcoördinatie"),
      move("Evenwichtspad", "Loop stap voor stap over de gemarkeerde route.", "Kijk vooruit en neem de tijd.", "hele lichaam", "balans"),
      move("Opstaan vanaf de vloer", "Kom via zijzit of halve knielstand overeind.", "Gebruik zo weinig steun als veilig mogelijk.", "hele lichaam", "functionele motoriek")
    ],
    modes: [
      mode("met verhaal", "Maak een korte veilige speelroute met een duidelijk begin en einde.", "Koppel iedere beweging aan een eenvoudig verhaal.", "kleurmarkers", "regressie"),
      mode("met kleurdoelen", "Plaats grote contrasterende doelen op veilige afstand.", "Beweeg naar de genoemde kleur.", "kleurmarkers", "basis"),
      mode("met bal", "Gebruik een zachte lichte bal in een vrije ruimte.", "Voer de taak rustig uit en vergroot pas later de afstand.", "zachte bal", "basis"),
      mode("met hindernissen", "Zet lage zachte hindernissen met voldoende tussenruimte klaar.", "Stap of beweeg gecontroleerd over ieder onderdeel.", "zachte hindernissen", "progressie"),
      mode("met reactietaak", "Sta in een vrije ruimte met een begeleider of duidelijke signalen.", "Start pas na het afgesproken visuele of auditieve signaal.", "kleur- of geluidssignaal", "progressie")
    ]
  },
  {
    id: "adl", label: "Werk en dagelijkse handelingen", region: "Functioneel", quota: 35,
    movements: [
      move("Voorwerp van tafel pakken", "Reik, pak het voorwerp veilig vast en plaats het gecontroleerd terug.", "Breng je lichaam dicht bij het werkgebied.", "hele lichaam", "reiken en grijpen"),
      move("Voorwerp van vloer tillen", "Zak vanuit heupen en knieën, pak het voorwerp en kom rustig omhoog.", "Houd het voorwerp dicht bij je lichaam.", "hele lichaam", "tiltechniek"),
      move("Boven schouderhoogte plaatsen", "Breng een licht voorwerp gecontroleerd naar de plank en terug.", "Gebruik een stabiele stand en trek je schouder niet op.", "schouder-romp", "bovenhands werk"),
      move("Duwen", "Verplaats het object met je lichaamsgewicht en gecontroleerde stappen.", "Houd polsen neutraal en rug lang.", "hele lichaam", "duwkracht"),
      move("Trekken", "Breng het object gecontroleerd naar je toe terwijl je achteruit stapt.", "Houd ellebogen dicht bij je lichaam.", "hele lichaam", "trekkracht"),
      move("Draaien en plaatsen", "Draai met kleine stappen en plaats het voorwerp op het doel.", "Draai voeten en romp samen.", "hele lichaam", "werktransfer"),
      move("Langdurig zitten onderbreken", "Kom overeind, strek je uit en loop enkele rustige passen.", "Herhaal regelmatig voordat stijfheid toeneemt.", "hele lichaam", "werkonderbreking")
    ],
    modes: [
      mode("licht en dichtbij", "Plaats een licht voorwerp dicht voor je op werkhoogte.", "Oefen eerst met kleine afstand.", "licht voorwerp", "regressie"),
      mode("ergonomische basis", "Stel stoel, tafel of werkvlak op passende hoogte in.", "Beweeg met ontspannen schouders en neutrale polsen.", "werkplek", "basis"),
      mode("met stapverplaatsing", "Plaats bron en doel op één of twee stappen afstand.", "Stap mee in plaats van vanuit je rug te draaien.", "licht voorwerp", "basis"),
      mode("met matig gewicht", "Plaats een hanteerbaar gewicht dicht bij je en maak de route vrij.", "Behoud dezelfde techniek onder iets meer belasting.", "matig gewicht", "progressie"),
      mode("met tempo of herhaling", "Zet meerdere lichte voorwerpen en een korte werktijd klaar.", "Behoud kwaliteit en neem pauze voordat vermoeidheid de techniek verandert.", "lichte voorwerpen en timer", "progressie")
    ]
  },
  {
    id: "sport", label: "Sportrevalidatie", region: "Sport", quota: 40,
    movements: [
      move("Landing op twee benen", "Land zacht met heupen en knieën gebogen en stabiliseer.", "Houd knieën boven de voeten en borstbeen lang.", "hele lichaam", "landingscontrole"),
      move("Landing op één been", "Land op één been en houd de positie gecontroleerd vast.", "Houd bekken horizontaal en knie boven de voet.", "hele lichaam", "unilaterale landing"),
      move("Versnellen en afremmen", "Versnel over korte afstand en rem in meerdere gecontroleerde stappen af.", "Zak iets in heupen en knieën tijdens het remmen.", "hele lichaam", "deceleratie"),
      move("Richtingsverandering", "Plant je voet, rem af en verander gecontroleerd van richting.", "Houd romp boven steunvlak en voorkom instorten van de knie.", "hele lichaam", "cutting"),
      move("Laterale shuffle", "Beweeg zijwaarts met korte snelle stappen zonder voeten te kruisen.", "Blijf laag en houd je borstkas vooruit.", "hele lichaam", "laterale snelheid"),
      move("Hop vooruit", "Spring op één been voorwaarts en stabiliseer de landing.", "Begin klein en houd iedere landing vast.", "hele lichaam", "hopcontrole"),
      move("Rotatieworp", "Draai vanuit heupen en romp en werp de bal gecontroleerd naar het doel.", "Draai voeten mee en rem de beweging af.", "romp-schouder", "rotatiekracht"),
      move("Sprinttechniek marcheren", "Breng afwisselend knie en tegenovergestelde arm actief omhoog.", "Blijf lang en plaats je voet onder je lichaamszwaartepunt.", "hele lichaam", "looptechniek")
    ],
    modes: [
      mode("techniek langzaam", "Neem een ruime vlakke ondergrond en markeer het bewegingspad.", "Voer de beweging langzaam uit en stabiliseer iedere fase.", "vloerlabels", "regressie"),
      mode("submaximaal", "Maak een veilige vrije zone en werk op ongeveer halve snelheid.", "Behoud volledige controle en stop bij pijn.", "pionnen", "basis"),
      mode("met extern doel", "Plaats een duidelijk doel of lijn op veilige afstand.", "Richt beweging en landing op het doel.", "pion of lijn", "basis"),
      mode("met reactietaal", "Werk met een begeleider of vooraf ingestelde visuele signalen.", "Reageer pas op het signaal en behoud techniek.", "reactielicht of kleurkaart", "progressie"),
      mode("sportspecifiek", "Maak een veilige zone die past bij de doelsport.", "Voer de beweging op sportspecifieke snelheid uit na vrijgave.", "sportspecifiek materiaal", "extra-review")
    ]
  }
];

function buildExpansionEntry(domain, movement, technique, movementIndex, techniqueIndex) {
  const key = `${domain.id}/${movementIndex}/${techniqueIndex}`;
  const title = `${movement.title} · ${technique.label}`;
  const exerciseId = stableId(key);
  const risk = technique.difficulty === "extra-review" ? "extra-review" : "standard";
  return {
    order: 216,
    exerciseId,
    source: "core1000-clinical-expansion",
    sourceDomain: domain.label,
    sourceName: title,
    titleNl: title,
    category: domain.label,
    region: domain.region,
    joint: movement.joint,
    goals: [movement.goal, technique.suffix].filter(Boolean),
    startingPosition: technique.setup.split(".")[0],
    equipment: technique.equipment === "geen" ? [] : technique.equipment.split(" of "),
    difficulty: technique.difficulty,
    searchAliases: Array.from(new Set([movement.title, movement.joint, movement.goal, domain.label, technique.label].map(String))),
    script: {
      language: "nl-NL",
      setup: technique.setup,
      movement: `${movement.action} ${technique.method}`,
      cue: movement.cue,
      safety: SAFETY,
      narration: `Dit is ${title.toLowerCase()}. ${technique.setup} ${movement.action} ${technique.method} ${movement.cue} ${SAFETY}`
    },
    dosage: { sets: 2, repetitions: risk === "extra-review" ? 5 : 8, holdSeconds: movement.goal.includes("rek") || movement.goal.includes("lengte") ? 20 : 0, rule: "De fysiotherapeut past dosering en belasting individueel aan." },
    movementMasterId: `fm_${exerciseId.slice(3)}`,
    media: { poster: null, motionMaster: null, status: "planned", languages: { nl: "script-draft" } },
    languages: Object.fromEntries(DEFAULT_LANGUAGES.map((language) => [language, language === "nl" ? "script-draft" : "translation-pending"])),
    risk: { level: risk, reason: risk === "extra-review" ? "Protocol-, prikkel- of sportspecifieke uitvoering vereist extra klinische controle." : "Dubbele klinische beoordeling vóór publicatie." },
    approvals: {
      script: { status: "draft", approvedBy: [], approvedAt: null },
      motion: { status: "pending", approvedBy: [], approvedAt: null },
      finalVideo: { status: "pending", approvedBy: [], approvedAt: null }
    },
    publication: { status: "blocked", reason: "Beweging, Nederlands script en eindvideo wachten op dubbele klinische beoordeling." },
    version: 1
  };
}

function buildExpansion() {
  const entries = [];
  for (const domain of DOMAINS) {
    const domainEntries = [];
    for (const [movementIndex, movement] of domain.movements.entries()) {
      for (const [techniqueIndex, technique] of domain.modes.entries()) {
        domainEntries.push(buildExpansionEntry(domain, movement, technique, movementIndex, techniqueIndex));
      }
    }
    if (domainEntries.length !== domain.quota) {
      throw new Error(`${domain.label}: verwacht ${domain.quota} items, gegenereerd ${domainEntries.length}`);
    }
    entries.push(...domainEntries);
  }
  return entries;
}

function legacyEntry(exercise, production, position) {
  const prod = production.get(exercise.sourceName || exercise.naam);
  if (!prod) throw new Error(`Productie-entry ontbreekt voor bestaande oefening: ${exercise.naam}`);
  return {
    order: position + 1,
    exerciseId: prod.exerciseId,
    source: "legacy-215",
    sourceName: exercise.naam,
    titleNl: prod.titleNl,
    category: exercise.groep,
    region: exercise.groep,
    joint: "clinical-review-pending",
    goals: [],
    startingPosition: prod.script.setup.split(".")[0],
    equipment: prod.shotPlan.props,
    difficulty: prod.risk.level === "extra-review" ? "extra-review" : "basis",
    searchAliases: [exercise.naam, prod.titleNl, exercise.groep],
    referenceImage: exercise.img,
    cardImage: exercise.kaartImg || exercise.img,
    script: prod.script,
    dosage: { sets: 3, repetitions: 12, holdSeconds: 0, rule: "De fysiotherapeut past dosering en belasting individueel aan." },
    movementMasterId: `fm_${prod.exerciseId.slice(3)}`,
    media: { poster: exercise.kaartImg || exercise.img, motionMaster: null, status: "planned", languages: { nl: "script-draft" } },
    languages: Object.fromEntries(DEFAULT_LANGUAGES.map((language) => [language, language === "nl" ? "script-draft" : "translation-pending"])),
    risk: prod.risk,
    approvals: prod.approvals,
    publication: prod.publication,
    version: 1
  };
}

function selectedPublicEntry(exercise, source, position) {
  const cardImage = exercise.kaartImg || exercise.img;
  return {
    ...source,
    order: position + 1,
    source: "top500-public",
    sourceDomain: source.sourceDomain || source.category,
    sourceName: exercise.naam,
    titleNl: exercise.naam,
    category: exercise.groep,
    publicExerciseId: publicExerciseId(exercise),
    searchAliases: Array.from(new Set([
      ...(source.searchAliases || []), source.titleNl, exercise.naam, exercise.groep
    ])),
    referenceImage: exercise.img,
    cardImage,
    media: { ...source.media, poster: cardImage },
  };
}

function validate(catalog) {
  const errors = [];
  if (catalog.exercises.length !== 1000) errors.push(`verwacht exact 1000 oefeningen, gevonden ${catalog.exercises.length}`);
  const ids = catalog.exercises.map((entry) => entry.exerciseId);
  if (new Set(ids).size !== ids.length) errors.push("exerciseId's zijn niet uniek");
  const titles = catalog.exercises.map((entry) => entry.titleNl.toLocaleLowerCase("nl-NL"));
  if (new Set(titles).size !== titles.length) errors.push("Nederlandse titels zijn niet uniek");
  for (const entry of catalog.exercises) {
    for (const key of ["exerciseId", "titleNl", "category", "region", "movementMasterId"]) {
      if (!String(entry[key] || "").trim()) errors.push(`${entry.exerciseId || "?"}: ${key} ontbreekt`);
    }
    for (const key of ["setup", "movement", "cue", "safety", "narration"]) {
      if (!String(entry.script?.[key] || "").trim()) errors.push(`${entry.exerciseId}: script.${key} ontbreekt`);
    }
    if (entry.publication.status === "published") errors.push(`${entry.exerciseId}: generator mag niets automatisch publiceren`);
  }
  const expansionCounts = Object.fromEntries(DOMAINS.map((domain) => [domain.label, catalog.exercises.filter((entry) => entry.sourceDomain === domain.label).length]));
  for (const domain of DOMAINS) if (expansionCounts[domain.label] !== domain.quota) errors.push(`${domain.label}: quota klopt niet`);
  return { errors, expansionCounts };
}

const [legacyLibrary, legacyProduction] = await Promise.all([
  readFile(libraryUrl, "utf8").then(JSON.parse),
  readFile(legacyProductionUrl, "utf8").then(JSON.parse)
]);
const productionByName = new Map(legacyProduction.exercises.map((entry) => [entry.sourceName, entry]));
const expansionBlueprint = buildExpansion();
const expansionById = new Map(expansionBlueprint.map((entry) => [entry.exerciseId, entry]));
const publicEntries = legacyLibrary.map((exercise, index) => {
  if (!exercise.coreExerciseId) return legacyEntry(exercise, productionByName, index);
  const source = expansionById.get(exercise.coreExerciseId);
  if (!source) throw new Error(`Core-bron ontbreekt voor publieke oefening: ${exercise.naam}`);
  return selectedPublicEntry(exercise, source, index);
});
const selectedIds = new Set(legacyLibrary.map((entry) => entry.coreExerciseId).filter(Boolean));
const expansion = expansionBlueprint.filter((entry) => !selectedIds.has(entry.exerciseId));
const exercises = [...publicEntries, ...expansion].map((entry, index) => ({ ...entry, order: index + 1 }));
const catalog = {
  schemaVersion: 1,
  collection: "FysiPlan Core 1000",
  generatedAt: "2026-07-20",
  status: "production-blueprint",
  defaultLanguage: "nl",
  targetLanguages: DEFAULT_LANGUAGES,
  contentPolicy: {
    ownMediaOnly: true,
    patientPublicationRequires: ["script-approved-by-2", "motion-approved-by-2", "final-video-approved-by-2", "locale-reviewed"],
    syntheticMediaLabel: "AI-demonstratie · klinisch gecontroleerd",
    reuseRule: "Een bewegingsmaster mag alleen worden gedeeld wanneer houding, bewegingsbaan, apparatuur en tempo klinisch identiek zijn."
  },
  exercises
};
const { errors, expansionCounts } = validate(catalog);
if (errors.length) throw new Error("Core 1000 ongeldig:\n- " + errors.join("\n- "));

const summary = {
  schemaVersion: 1,
  collection: catalog.collection,
  total: exercises.length,
  existing: publicEntries.length,
  legacy: publicEntries.filter((entry) => entry.source === "legacy-215").length,
  publicTop500Expansion: publicEntries.filter((entry) => entry.source === "top500-public").length,
  clinicalExpansion: expansion.length,
  movementMasters: new Set(exercises.map((entry) => entry.movementMasterId)).size,
  ownVideoTarget: exercises.length,
  plannedLanguages: DEFAULT_LANGUAGES,
  publication: { published: 0, blocked: exercises.length },
  review: {
    standard: exercises.filter((entry) => entry.risk.level === "standard").length,
    extra: exercises.filter((entry) => entry.risk.level !== "standard").length
  },
  expansionByDomain: expansionCounts
};

if (process.argv.includes("--write")) {
  await Promise.all([
    writeFile(outputUrl, JSON.stringify(catalog, null, 2) + "\n"),
    writeFile(summaryUrl, JSON.stringify(summary, null, 2) + "\n")
  ]);
  console.log(`Core 1000 geschreven: ${summary.total} oefeningen, ${summary.movementMasters} bewegingsmasters, ${summary.plannedLanguages.length} talen gepland.`);
} else {
  console.log(JSON.stringify(summary, null, 2));
}
