// Een nette foutpagina voor de V2-kant (praktijk-routine, 2026-11-13).
// Tot nu toe kreeg een praktijk die een adres onder /v2/ verkeerd typte (of een oude link
// opende) het inlogscherm of de app van V1 te zien, en een serverfout bij het openen van een
// pagina gaf kale JSON ({"ok":false,...}). Voor een praktijkhouder die twijfelt of Fysiplan
// betrouwbaar is, is dat het slechtste moment voor een rommelig scherm.
// Scriptloos, zonder externe bronnen; de server zet er een strikte CSP bij.

const TEKST = {
  404: { titel: "Pagina niet gevonden", kop: "Deze pagina bestaat niet.",
    uitleg: "Misschien is de link oud of zit er een tikfout in het adres. Je kaarten en gegevens staan gewoon waar ze stonden." },
  500: { titel: "Er ging iets mis", kop: "Er ging bij ons iets mis.",
    uitleg: "Dit ligt niet aan jou. Er is niets kwijt: wat je eerder bewaarde, staat er nog. Probeer het over een minuut opnieuw. Blijft het misgaan, antwoord dan op een mail van Fysiplan, dan kijken we mee." }
};

// alleen een browser die een pagina opent, krijgt HTML; een fetch uit de app of een
// script houdt het oude antwoord (JSON of platte tekst)
export function wilPagina(request) {
  if (!request || (request.method !== "GET" && request.method !== "HEAD")) return false;
  const dest = String(request.headers?.["sec-fetch-dest"] || "");
  if (dest) return dest === "document";
  return /\btext\/html\b/.test(String(request.headers?.accept || ""));
}

// alleen paden van de V2-kant; V1 (/, /admin88, dashboard) verandert niet
export const isV2Pad = (pad) => typeof pad === "string" && pad.startsWith("/v2/");

export const FOUTPAGINA_CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function foutpaginaHtml(status) {
  const t = TEKST[status] || TEKST[500];
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>${t.titel} · Fysiplan</title>
<style>
  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;
    src:url(/fonts/inter-latin-wght-normal.woff2) format('woff2')}
  :root{--petrol:#18343B;--limoen:#B9E34B;--grijs:#F2F5F3;--tekst:#1d2b2f;--zacht:#4a5a5e}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:var(--grijs);color:var(--tekst);font:17px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px}
  main{max-width:520px;width:100%;background:#fff;border-radius:16px;padding:32px 28px;box-shadow:0 1px 2px rgba(24,52,59,.08),0 8px 28px rgba(24,52,59,.08)}
  .merk{font-weight:900;font-style:italic;letter-spacing:.02em;color:var(--petrol);font-size:15px;margin:0 0 20px}
  .code{display:inline-block;background:var(--limoen);color:var(--petrol);font-weight:700;font-size:13px;border-radius:999px;padding:3px 10px;margin:0 0 12px}
  h1{font-size:26px;line-height:1.25;margin:0 0 10px;color:var(--petrol)}
  p{margin:0 0 22px;color:var(--zacht)}
  nav{display:flex;flex-wrap:wrap;gap:10px}
  a{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border-radius:10px;font-weight:600;text-decoration:none}
  a.hoofd{background:var(--petrol);color:#fff}
  a.ander{border:1.5px solid var(--petrol);color:var(--petrol)}
  a:focus-visible{outline:3px solid var(--limoen);outline-offset:2px}
</style>
</head>
<body>
<main>
  <p class="merk">FYSIPLAN</p>
  <p class="code">Foutcode ${status === 404 ? 404 : 500}</p>
  <h1>${t.kop}</h1>
  <p>${t.uitleg}</p>
  <nav aria-label="Verder">
    <a class="hoofd" href="/v2/app">Naar de app</a>
    <a class="ander" href="/v2">Naar de website</a>
  </nav>
</main>
</body>
</html>
`;
}
