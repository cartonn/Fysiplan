// Demo-werkinstructies: geen verzender, planner of automatische contactreeks.
export const GROEI_AANPAK = {
  doel: 'Een eerste oefenkaart laten maken; een afspraak is alleen een hulpmiddel.',
  varianten: {
    A: 'Eén oefenkaart op papier én telefoon.',
    B: 'De patiënt opent de oefeningen zonder account.'
  },
  standaard: 'A',
  regels: [
    'Noem in marketingteksten en mailconcepten geen AI, taalmodel of modelprovider. Dit verandert niets aan de herkenbare AI-introductie bij een eventueel telefoongesprek.',
    'Begin met een relevante behoefte en bied een voorbeeld aan. Eén vervolgvraag per mail; vraag niet meteen om een afspraak.',
    'Heeft iemand een voorbeeld gevraagd, lever dat direct. Verzin nooit een aanvraag, toestemming of eerdere kennismaking.',
    'Schrijf 60–120 woorden, concrete productfeiten, geen tijdwinst- of resultaatbeloftes, geen druk of verzonnen complimenten.',
    'Mail alleen met passende toestemming; openbare contactgegevens of uitblijven van een reactie geven geen toestemming.',
    'Bellen blijft uitgesteld. Geen belvoorstellen of afspraken plannen. Ook na akkoord verstuurt deze demo niets.',
    'Een antwoord onderbreekt de voorgestelde reeks. Beantwoord eerst de vraag. Bij afmelding stopt alle benadering.',
    'Opvolgplan voor een latere proef: dag 0 voorbeeld, dag 3–4 inhoudelijke vraag, dag 8–10 laatste opvolging. Alleen met geldige toestemming en vastgelegde contacthistorie. Dit is geen actieve verzendreeks; bestaande contactpauzes blijven gelden.',
    'Geen nieuwe variant zolang een concept op beoordeling wacht. Verwerk concrete feedback in een herziening.',
    'Meet positieve reacties, eerste kaarten, betaalde praktijken, kosten, afmeldingen en klachten. Verzin nooit meetresultaten.'
  ],
  afsluiting: 'Met vriendelijke groet,\nCarla Mastenbroek\nFysiplan',
  afmelden: 'Liever geen berichten over Fysiplan? Laat het weten, dan stoppen we.'
};

export function sluitGroeiMail(tekst) {
  // De server voegt de goedgekeurde zakelijke afzender toe, niet het model.
  const kern = tekst.trim().replace(/\n\s*(?:Met vriendelijke groet(?:en)?|Groet(?:en)?|Hartelijke groet)[,\s]*$/i, '').trim();
  return kern + '\n\n' + GROEI_AANPAK.afmelden + '\n\n' + GROEI_AANPAK.afsluiting;
}
