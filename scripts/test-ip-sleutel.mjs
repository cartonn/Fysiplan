// Security 2026-11-16 (beheer, remmen per verbinding): alle per-IP-remmen tellen IPv6 per /64.
// Dat blok kwam uit de eerste vier stukken tussen de dubbele punten van het adres zoals het
// binnenkwam. In een ingekort adres ("2001:db8::1:2:3:4") zijn dat niet de eerste vier groepen,
// dus kreeg elk adres in zo'n blok een eigen teller: met een blok als 2001:db8:0:0::/64 raadde
// je zonder rem door, ook naar de beheersleutel. Nu wordt het adres eerst uitgeschreven
// (lib/ip-sleutel.js). Zonder browser (draait ook in CI). `npm run test:ipsleutel`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ipSleutel } from "../lib/ip-sleutel.js";

// 1) dezelfde /64, anders geschreven: één sleutel
const blok = "2001:db8::/64";
for (const a of ["2001:db8::1:2:3:4", "2001:db8::abcd:2:3:4", "2001:DB8:0:0:1:2:3:4", "2001:0db8:0000:0000:ffff:1:2:3",
  "2001:db8::1", "2001:db8::", "[2001:db8::7]", "2001:db8::7%eth0", "2001:db8:0:0:1:2:1.2.3.4"]) {
  assert.equal(ipSleutel(a), "2001:db8:0:0::/64", a + " hoort bij " + blok);
}
assert.equal(ipSleutel("2a02:a46:1:2:3:4:5:6"), "2a02:a46:1:2::/64");
assert.equal(ipSleutel("2a02:a46:1:2::7"), "2a02:a46:1:2::/64");
assert.notEqual(ipSleutel("2a02:a46:1:3::7"), ipSleutel("2a02:a46:1:2::7"), "een ander /64 telt apart");
assert.equal(ipSleutel("::1"), "0:0:0:0::/64");
// IPv4 en IPv4 in IPv6-jasje: hetzelfde adres
assert.equal(ipSleutel("203.0.113.9"), "203.0.113.9");
assert.equal(ipSleutel("::ffff:203.0.113.9"), "203.0.113.9");
assert.equal(ipSleutel("::FFFF:cb00:7109"), "203.0.113.9");
assert.notEqual(ipSleutel("203.0.113.9"), ipSleutel("203.0.113.10"));
// onzin blijft een (begrensde) sleutel, geen crash
assert.equal(ipSleutel(""), "?");
assert.ok(ipSleutel("x".repeat(5000)).length <= 64);
assert.ok(ipSleutel("1::2::3").length <= 64);

// 2) runtime: foute beheersleutels uit één /64 met wisselende adressen lopen op de rem
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-ip-sleutel-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const app = spawn(process.execPath, ["ser" + "ver.js"], {
  cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const vraag = (pad, headers = {}) => new Promise((ok, nee) => {
  get({ host: "127.0.0.1", port, path: pad, headers }, (r) => { r.resume(); r.on("end", () => ok(r.statusCode)); }).on("error", nee);
});
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await vraag("/health")) === 200) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const hex = (n) => (n + 1).toString(16);
  const codes = [];
  for (let i = 0; i < 25; i++) {
    // elk verzoek een ander adres in 2001:db8:0:0::/64, ingekort geschreven
    codes.push(await vraag("/api/beheer/overzicht", { "x-admin-sleutel": "fout-" + i, "x-forwarded-for": "2001:db8::" + hex(i) + ":1:2:3" }));
  }
  assert.equal(codes[0], 403, "een foute sleutel is eerst gewoon een nee");
  assert.ok(codes.slice(21).every((c) => c === 429), "uit hetzelfde /64 loopt het raden op de rem: " + codes.join(","));
  // de juiste sleutel komt uit dat blok nu ook niet binnen (de rem houdt het raden tegen) ...
  assert.equal(await vraag("/api/beheer/overzicht", { "x-admin-sleutel": "admin88", "x-forwarded-for": "2001:db8::ffff:1:2:3" }), 429);
  // ... maar een ander blok en een gewoon IPv4-adres merken er niets van
  assert.equal(await vraag("/api/dashboard", { "x-admin-sleutel": "admin88", "x-forwarded-for": "2001:db8:0:1::5" }), 200);
  assert.equal(await vraag("/api/dashboard", { "x-admin-sleutel": "admin88", "x-forwarded-for": "198.51.100.7" }), 200);
  console.log("ok test:ipsleutel");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
