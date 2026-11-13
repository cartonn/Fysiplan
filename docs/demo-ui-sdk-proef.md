# UI SDK-proef voor het demo-agentdashboard

Alleen de server met `OMGEVING=test` markeert de beheerpagina voor deze proef. De
client laadt de bundel uitsluitend bij Agents met `bron=demo`. Productie en V1
krijgen geen nieuwe componenten of WebMCP-registratie.

- Taken: tabs voor wachtend en lopend/afgerond, inclusief pijltoetsen.
- Concepten: dialoog met Escape en focus terug naar de opener.
- Feedback: SDK-tekstveld, maximaal 200 tekens; bevestiging blijft handmatig.
- Bridge en WebMCP gebruiken dezelfde expliciete allowlist. Alleen tabs wisselen,
  concept openen/sluiten en feedback invullen. Geen `press`, goedkeuring, verzending,
  sleutelbeheer of wijziging van agentstanden. Bij verlaten wordt WebMCP afgemeld
  en weigert de bridge alle acties.
- Serverrechten, besluitroutes, bronkeuze en idempotentie blijven leidend. Deze
  browserallowlist is geen beveiliging tegen iemand die al beheerrechten heeft.
- Vaste beta.1-versies, lokale bundel (geen CDN), 186 kB ongecomprimeerd. De SDK
  is beta; dit is een beperkte proef, geen algemene platformmigratie.

## Bouwen en testen

`npm run build:demo-ui` maakt de meegeleverde bundel. CI controleert dat deze exact
uit de bronnen en vastgelegde dependencies volgt. `node scripts/test-demo-ui-policy.mjs`
controleert 20 toestemmingsgevallen. `npm run sweep:agentgeheugen` controleert de
bestaande serverpoort met concurrency, afmelden, rollen en stopknop.

Browserproef 13 november, lokaal met alleen nepgegevens: pijltoetsen, concept
openen, Escape/focusherstel, WebMCP tabwissel/openen/feedback, geweigerde press,
feedback met dubbelklik (één auditbesluit), behoud na herladen, en geen WebMCP
bij overschakelen naar Echt. Geen modelaanroepen, mail of telefoongesprekken.
