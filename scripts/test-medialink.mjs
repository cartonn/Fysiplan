// Tijdelijke links voor eigen video's en foto's (lib/medialink.js).
//
// 1. de regels zelf
// 2. de echte server: een eigen opname en de foto van een eigen oefening zijn alleen te zien via de
//    link op de patiëntkaart of voor wie bij de praktijk is ingelogd; de bibliotheek blijft openbaar
// Zonder browser, past in CI. `npm run test:medialink`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VENSTER_MS, mediaSoort, eindeVoor, handtekening, mediaLink, leesMediaLink } from "../lib/medialink.js";

// ---- 1. de regels ----
{
  const S = "a".repeat(64), T = "b".repeat(64), V = "uploads/videos/v-0123456789abcdef.mp4", F = "uploads/oef-0123456789ab.jpg", K = "0123456789abcdef";
  assert.equal(mediaSoort(V), "video"); assert.equal(mediaSoort("uploads/videos/v-ab.webm"), "video");
  assert.equal(mediaSoort(F), "foto"); assert.equal(mediaSoort("uploads/oef-0123456789ab.png"), "foto");
  for (const p of ["uploads/videos/avatar-12-ab.mp4", "uploads/logo-x-1.png", "uploads/squat-1.jpg", "uploads/videos/v-ab.mov", "/" + V, V + "x", "uploads/videos/../videos/v-ab.mp4"]) assert.equal(mediaSoort(p), null, p);

  const nu = Date.UTC(2026, 10, 12, 13, 0);
  const einde = eindeVoor(nu);
  assert.equal(einde % VENSTER_MS, 0, "het einde ligt op het raster");
  assert.ok(einde - nu > VENSTER_MS && einde - nu <= 2 * VENSTER_MS, "een link is 12 tot 24 uur geldig");
  assert.equal(eindeVoor(nu + 3600e3), einde, "binnen hetzelfde blok dezelfde link");

  const link = mediaLink(S, V, K, nu);
  assert.match(link, /^uploads\/videos\/v-0123456789abcdef\.mp4\?k=0123456789abcdef&e=\d{13}&s=[A-Za-z0-9_-]{32}$/);
  assert.equal(mediaLink(S, V, K, nu + 3600e3), link, "dezelfde kaart krijgt binnen het blok dezelfde link (de telefoon bewaart de foto één keer)");
  assert.equal(mediaLink(S, "yt:abcdefghijk", K, nu), "yt:abcdefghijk", "een YouTube-verwijzing blijft zoals ze is");
  assert.equal(mediaLink(S, "uploads/videos/avatar-1-ab.mp4", K, nu), "uploads/videos/avatar-1-ab.mp4");
  assert.equal(mediaLink(S, V, "demo", nu), V, "zonder geldig kaart-id geen link");
  assert.equal(mediaLink("", V, K, nu), V);

  const q = (l) => new URLSearchParams(l.split("?")[1]);
  assert.equal(leesMediaLink(S, V, q(link), nu), K, "de link hoort bij die kaart");
  assert.equal(leesMediaLink(S, V, q(link), einde - 1), K, "tot vlak voor het einde");
  assert.equal(leesMediaLink(S, V, q(link), einde), null, "daarna niet meer");
  assert.equal(leesMediaLink(T, V, q(link), nu), null, "met een andere sleutel niet");
  assert.equal(leesMediaLink(S, "uploads/videos/v-ffffffffffffffff.mp4", q(link), nu), null, "niet voor een ander bestand");
  const ander = q(link); ander.set("k", "fedcba9876543210");
  assert.equal(leesMediaLink(S, V, ander, nu), null, "niet voor een andere kaart");
  const verder = q(link); verder.set("e", String(einde + VENSTER_MS)); verder.set("s", handtekening(S, V, K, einde + VENSTER_MS));
  assert.equal(leesMediaLink(S, V, verder, nu), null, "een einde dat de server niet zou uitgeven, ook al is de handtekening goed");
  const scheef = q(link); scheef.set("e", String(einde - 1)); scheef.set("s", handtekening(S, V, K, einde - 1));
  assert.equal(leesMediaLink(S, V, scheef, nu), null, "een einde buiten het raster");
  const anders = q(link); anders.set("s", (anders.get("s")[0] === "A" ? "B" : "A") + anders.get("s").slice(1));
  assert.equal(leesMediaLink(S, V, anders, nu), null, "een gewijzigde handtekening");
  for (const weg of ["k", "e", "s"]) { const x = q(link); x.delete(weg); assert.equal(leesMediaLink(S, V, x, nu), null, "zonder " + weg); }
  assert.equal(leesMediaLink(S, V, null, nu), null);
  assert.equal(leesMediaLink(S, "uploads/squat-1.jpg", q(link), nu), null, "een openbaar bestand heeft geen link");
}

// ---- 2. de echte server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-medialink-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let app, uit = "";
const start = async () => {
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "" };
  for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$)/.test(k)) delete env[k];
  app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 50)); }
};
const stop = async () => { if (app && app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); } };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.4." + (ip >> 8) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const png = "data:image/png;base64," + Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.alloc(200, 1)]).toString("base64");
const VIDEO = "uploads/videos/v-aaaaaaaaaaaaaaaa.mp4", BIB = "uploads/videos/v-cccccccccccccccc.mp4";

try {
  await start();
  const A = ses(await (await post("/api/praktijk/claim", { praktijk: "Fysio Eigen", wachtwoord: "eigen-wachtwoord-1", akkoord: true })).json());
  const B = ses(await (await post("/api/praktijk/claim", { praktijk: "Fysio Buren", wachtwoord: "buren-wachtwoord-1", akkoord: true })).json());
  let r = await post("/api/praktijk/oefeningen", { praktijk: "Fysio Eigen", naam: "Eigen kniebuiging", uitleg: "Rustig door de knieën.", img: png }, A);
  assert.equal(r.status, 200, "eigen oefening: " + uit.slice(-300));
  const eigen = (await r.json());
  const po = eigen.oefening ? eigen.oefening : eigen;
  const lijst = await (await get("/api/praktijk/oefeningen?praktijk=" + encodeURIComponent("Fysio Eigen"), A)).json();
  const oef = (Array.isArray(lijst) ? lijst : lijst.oefeningen || []).find((o) => o.naam === "Eigen kniebuiging") || po;
  assert.match(String(oef.id), /^po_[a-f0-9]{12}$/, "testopzet: de eigen oefening heeft een id");
  const FOTO = String(oef.img);
  assert.equal(mediaSoort(FOTO), "foto", "testopzet: de foto staat onder uploads/oef-");
  r = await post("/api/kaarten", { praktijk: "Fysio Eigen", naam: "Dirk", client: { c_naam: "Dirk" }, kaartId: "",
    chosen: [{ n: "Squat", i: 0 }, { n: "Eigen kniebuiging", id: oef.id, i: 0 }] }, A);
  assert.equal(r.status, 200);
  const kaartId = (await r.json()).id;
  // een tweede kaart met dezelfde opname en eigen oefening; straks gaan die er weer af
  r = await post("/api/kaarten", { praktijk: "Fysio Eigen", naam: "Truus", client: { c_naam: "Truus" }, kaartId: "",
    chosen: [{ n: "Squat", i: 0 }, { n: "Eigen kniebuiging", id: oef.id, i: 0 }] }, A);
  assert.equal(r.status, 200);
  const truusId = (await r.json()).id;
  await stop();

  // een eigen opname op de kaart, en een video uit de bibliotheek met dezelfde soort naam
  await mkdir(join(dataDir, "uploads/videos"), { recursive: true });
  await writeFile(join(dataDir, VIDEO), Buffer.alloc(4000, 7));
  await writeFile(join(dataDir, BIB), Buffer.alloc(1000, 9));
  const kaarten = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  const pkA = Object.keys(kaarten).find((pk) => Object.values(kaarten[pk]).some((k) => k.id === kaartId));
  Object.values(kaarten[pkA]).find((k) => k.id === kaartId).vids = { squat: VIDEO };
  Object.values(kaarten[pkA]).find((k) => k.id === truusId).vids = { squat: VIDEO };
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify(kaarten));
  let links = {};
  try { links = JSON.parse(await readFile(join(dataDir, "videolinks.json"), "utf8")); } catch {}
  links.Squat = { ...(links.Squat || {}), eigen: BIB };
  await writeFile(join(dataDir, "videolinks.json"), JSON.stringify(links));
  await start();

  // zonder link en zonder login: niets
  assert.equal((await get("/" + VIDEO)).status, 404, "een eigen opname is geen openbaar adres meer");
  assert.equal((await get("/" + FOTO)).status, 404, "de foto van een eigen oefening ook niet");
  assert.equal((await get("/" + BIB)).status, 200, "een video uit de bibliotheek blijft openbaar");

  // de patiëntkaart krijgt tijdelijke links, en die werken
  const pk = (await (await get("/api/kaart?id=" + kaartId)).json()).kaart;
  assert.match(pk.vids.squat, /^uploads\/videos\/v-a{16}\.mp4\?k=[a-f0-9]+&e=\d{13}&s=[A-Za-z0-9_-]{32}$/, "de opname reist mee als tijdelijke link");
  assert.equal(new URLSearchParams(pk.vids.squat.split("?")[1]).get("k"), kaartId, "die bij deze kaart hoort");
  const eigenOp = (pk.eigenOef || []).find((e) => e.id === oef.id);
  assert.ok(eigenOp && eigenOp.img.startsWith(FOTO + "?k=" + kaartId + "&e="), "de foto van de eigen oefening ook");
  r = await get("/" + pk.vids.squat);
  assert.equal(r.status, 200, "de link van de patiëntkaart werkt");
  assert.equal(r.headers.get("cache-control"), "private, max-age=3600", "en blijft in de eigen browser, niet in een gedeelde cache");
  assert.equal((await r.arrayBuffer()).byteLength, 4000);
  r = await get("/" + pk.vids.squat, { range: "bytes=0-99" });
  assert.equal(r.status, 206, "ook in stukjes (iPhone)"); assert.equal((await r.arrayBuffer()).byteLength, 100);
  assert.equal((await get("/" + eigenOp.img)).status, 200);
  assert.equal((await get("/" + BIB)).headers.get("cache-control"), "public, max-age=86400", "de bibliotheek houdt haar gewone cache");

  // een link is niet te verbouwen
  const q = pk.vids.squat.split("?")[1];
  assert.equal((await get("/" + VIDEO.replace("aaaa", "aaab") + "?" + q)).status, 404, "de link van de ene opname opent geen andere");
  assert.equal((await get("/" + FOTO + "?" + q)).status, 404, "en geen foto");
  assert.equal((await get("/" + VIDEO + "?" + q.replace(/s=./, (m) => m === "s=A" ? "s=B" : "s=A"))).status, 404, "een gewijzigde handtekening");
  assert.equal((await get("/" + VIDEO.replace("uploads/", "uploads//") + "?x=1")).status, 404, "een dubbele slash zonder link");

  // ingelogd bij de eigen praktijk: het gewone pad werkt; bij een andere praktijk niet
  assert.equal((await get("/" + VIDEO, A)).status, 200, "de eigen praktijk ziet haar opname (de editor)");
  assert.equal((await get("/" + FOTO, A)).status, 200, "en de foto van haar eigen oefening");
  assert.equal((await get("/" + VIDEO, B)).status, 404, "een andere praktijk niet");
  assert.equal((await get("/" + FOTO, B)).status, 404);

  // de sleutel staat in de datamap, alleen leesbaar voor de server, en overleeft een herstart
  const sleutelBestand = join(dataDir, "media-sleutel.json");
  assert.match(JSON.parse(await readFile(sleutelBestand, "utf8")).sleutel, /^[a-f0-9]{64}$/);
  assert.equal((await stat(sleutelBestand)).mode & 0o777, 0o600);
  const bron = await readFile(new URL("../server.js", import.meta.url), "utf8");
  assert.ok(!/backupBestanden[^\n]*media-sleutel/.test(bron), "de sleutel gaat niet mee in de reservekopie");
  // de therapeut haalt de opname en de eigen oefening van Truus af (hier in het bestand, tussen twee starts)
  const truus = (await (await get("/api/kaart?id=" + truusId)).json()).kaart;
  const truusVideo = truus.vids.squat, truusFoto = truus.eigenOef.find((e) => e.id === oef.id).img;
  assert.equal((await get("/" + truusVideo)).status, 200); assert.equal((await get("/" + truusFoto)).status, 200);
  await stop();
  const k2 = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  const t2 = Object.values(k2[pkA]).find((k) => k.id === truusId);
  t2.vids = {}; t2.chosen = t2.chosen.filter((x) => x.id !== oef.id);
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify(k2));
  await start();
  assert.equal((await get("/" + pk.vids.squat)).status, 200, "na een herstart werkt dezelfde link nog");
  assert.equal((await get("/" + truusVideo)).status, 404, "een opname die niet meer op de kaart staat, geeft de link van die kaart niet meer");
  assert.equal((await get("/" + truusFoto)).status, 404, "een eigen oefening die niet meer op de kaart staat ook niet");

  // de kaart naar de prullenbak: haar links werken niet meer
  r = await post("/api/kaarten/verwijder", { praktijk: "Fysio Eigen", naam: "Dirk", id: kaartId }, A);
  assert.equal(r.status, 200);
  assert.equal((await get("/" + pk.vids.squat)).status, 404, "een kaart in de prullenbak geeft haar opname niet meer");
  assert.equal((await get("/" + eigenOp.img)).status, 404, "en haar foto ook niet");
  assert.equal((await get("/" + FOTO, A)).status, 200, "de praktijk ziet de foto van haar eigen oefening nog");

  console.log("test-medialink: ok (de regels, eigen opnames en foto's alleen via de link van de kaart of voor de eigen praktijk, de bibliotheek blijft openbaar, de link is niet te verbouwen en vervalt met de kaart)");
} catch (e) {
  e.message += "\n--- server ---\n" + uit.slice(-1500);
  throw e;
} finally {
  await stop();
  await rm(dataDir, { recursive: true, force: true });
}
