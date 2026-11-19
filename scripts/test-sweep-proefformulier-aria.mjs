// Proefformulier met fouten, voor schermlezers en het toetsenbord (gebruikers-sweep 2026-11-19, Sanne):
// elk fout veld heeft aria-invalid en wijst met aria-describedby naar zijn eigen melding; de focus gaat
// naar het eerste foute veld, ook als dat een vinkje is (voorheen body); alleen de samenvatting bovenaan
// is role="alert" (voorheen zes meldingen tegelijk bij een leeg formulier). Zonder browser.
// `npm run test:proefaria`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefaria-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MOLLIE_API_KEY: "", MAIL_API_SLEUTEL: "", PROEF_VERPLICHT: "aan" },
  stdio: ["ignore", "ignore", "ignore"] });
const basis = "http://127.0.0.1:" + port;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(basis + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  let ip = 1;
  const stuur = async (velden) => {
    const r = await fetch(basis + "/v2/proef", { method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.0." + (ip++) },
      body: new URLSearchParams(velden).toString() });
    return { status: r.status, html: await r.text() };
  };
  const invoer = (html, sel) => {
    const m = html.match(sel);
    assert.ok(m, "veld niet gevonden: " + sel);
    return m[0];
  };
  const email = (h) => invoer(h, /<input id="email"[^>]*>/);
  const naam = (h) => invoer(h, /<input id="naam"[^>]*>/);
  const tel = (h) => invoer(h, /<input id="tel"[^>]*>/);
  const akkoord = (h) => invoer(h, /<input type="checkbox" name="akkoord"[^>]*>/);
  const vwo = (h) => invoer(h, /<input type="checkbox" name="vwo"[^>]*>/);
  const alerts = (h) => (h.match(/role="alert"/g) || []).length;

  // leeg formulier: alle vijf velden fout, focus op e-mail, één samenvatting
  {
    const { status, html } = await stuur({});
    assert.equal(status, 422);
    for (const [k, el] of [["email", email(html)], ["naam", naam(html)], ["tel", tel(html)], ["akkoord", akkoord(html)], ["vwo", vwo(html)]]) {
      assert.match(el, /aria-invalid="true"/, k + " zonder aria-invalid");
      assert.match(el, new RegExp('aria-describedby="fout-' + k + '"'), k + " wijst niet naar zijn melding");
      assert.match(html, new RegExp('<p class="melding" id="fout-' + k + '">'), "melding van " + k + " heeft geen id");
    }
    assert.match(email(html), / autofocus/);
    assert.doesNotMatch(akkoord(html), /autofocus/);
    assert.equal(alerts(html), 1, "alleen de samenvatting is role=alert");
    assert.match(html, /Nog 5 velden om na te kijken/);
  }
  // alleen de vinkjes fout: focus op het eerste vinkje, tekstvelden niet als fout gemarkeerd
  {
    const { status, html } = await stuur({ email: "sanne@praktijk.nl", naam: "Sanne Test", tel: "06 1234 5679" });
    assert.equal(status, 422);
    assert.match(akkoord(html), / autofocus/, "focus naar het eerste foute vinkje");
    assert.doesNotMatch(vwo(html), /autofocus/);
    assert.match(vwo(html), /aria-invalid="true" aria-describedby="fout-vwo"/);
    for (const el of [email(html), naam(html), tel(html)]) {
      assert.doesNotMatch(el, /aria-invalid|autofocus/);
    }
    assert.equal(alerts(html), 1);
  }
  // alleen de verwerkersovereenkomst fout: focus daar
  {
    const { html } = await stuur({ email: "sanne@praktijk.nl", naam: "Sanne Test", tel: "06 1234 5679", akkoord: "1" });
    assert.match(vwo(html), / autofocus/);
    assert.match(akkoord(html), / checked/);
    assert.doesNotMatch(akkoord(html), /aria-invalid/);
  }
  // tikfout-suggestie in het e-mailadres: geen fout, wel de hulptekst aan het veld gekoppeld
  {
    const { html } = await stuur({ email: "sanne@gmial.com", naam: "Sanne Test", tel: "06 1234 5679", akkoord: "1", vwo: "1" });
    assert.match(email(html), /aria-describedby="hulp-email"/);
    assert.doesNotMatch(email(html), /aria-invalid/);
    assert.match(html, /<p class="hulp" id="hulp-email" role="alert">/);
  }
  // leeg formulier ophalen: geen enkele foutmarkering
  {
    const html = await (await fetch(basis + "/v2/proef", { headers: { "x-forwarded-for": "10.9.1.1" } })).text();
    assert.doesNotMatch(html, /aria-invalid|autofocus|__[A-Z_]+__/);
  }
  console.log("proefformulier-aria: ok");
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
