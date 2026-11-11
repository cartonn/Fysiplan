// Reservekopie buiten Railway (lib/backup-elders.js): versleuteld, één bestand per weekdag,
// S3-handtekening volgens de AWS-voorbeelden, en de server stuurt hem bij de start naar de
// opslag. Zonder variabelen gebeurt er niets. Zonder browser. `npm run test:backup`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupInstellingen, objectNaam, ontsleutel, s3Headers, versleutel, verzamelBackup, maakPakketMetTerugval, telUploads, veiligBackupPad } from "../lib/backup-elders.js";

// 1. handtekening: de twee voorbeelden uit de AWS-documentatie (Signature Version 4, S3)
const aws = { regio: "us-east-1", id: "AKIAIOSFODNN7EXAMPLE", geheim: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", nu: new Date("2013-05-24T00:00:00Z") };
assert.match(s3Headers({ methode: "GET", url: "https://examplebucket.s3.amazonaws.com/?lifecycle", ...aws }).authorization,
  /Signature=fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543$/);
assert.match(s3Headers({ methode: "GET", url: "https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J", ...aws }).authorization,
  /Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7$/);

// 2. versleutelen: heen en terug, verkeerde wachtzin en geknoei worden geweigerd, geen leesbare tekst
const wachtzin = "een-lange-wachtzin-voor-de-test-1234";
const pakket = versleutel({ "kaarten.json": Buffer.from('{"roepnaam":"Truus"}') }, wachtzin);
assert.equal(ontsleutel(pakket, wachtzin).bestanden["kaarten.json"].toString(), '{"roepnaam":"Truus"}');
assert.ok(!pakket.includes("Truus") && !pakket.includes("kaarten.json"), "inhoud en bestandsnamen staan niet leesbaar in het pakket");
assert.throws(() => ontsleutel(pakket, "een-andere-wachtzin-voor-de-test-99"));
const geknoeid = Buffer.from(pakket); geknoeid[geknoeid.length - 1] ^= 1;
assert.throws(() => ontsleutel(geknoeid, wachtzin));

// 3. instellingen: alles of niets, https verplicht, bak in het pad, geen korte wachtzin
const goed = { BACKUP_S3_URL: "https://s3.nl-ams.scw.cloud/fysiplan-reserve/", BACKUP_S3_SLEUTEL_ID: "id", BACKUP_S3_GEHEIM: "geheim", BACKUP_SLEUTEL: wachtzin };
assert.equal(backupInstellingen(goed).url, "https://s3.nl-ams.scw.cloud/fysiplan-reserve");
assert.equal(backupInstellingen({}), null);
assert.equal(backupInstellingen({ ...goed, BACKUP_SLEUTEL: "kort" }), null);
assert.equal(backupInstellingen({ ...goed, BACKUP_S3_URL: "http://s3.nl-ams.scw.cloud/bak" }), null);
assert.equal(backupInstellingen({ ...goed, BACKUP_S3_URL: "https://s3.nl-ams.scw.cloud" }), null);
// één naam per weekdag, in Nederlandse tijd: nooit meer dan zeven bestanden elders
assert.equal(objectNaam(new Date("2026-11-10T12:00:00Z")), "fysiplan-di.fpb");
assert.equal(objectNaam(new Date("2026-11-10T23:30:00Z")), "fysiplan-wo.fpb");

// 4. de server: stuurt bij de start één versleuteld pakket naar de opslag, met alle databestanden
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-backup-"));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ "Test Fysio": [{ id: "abc123abc123", naam: "Geheimenaam" }] }));
await writeFile(join(dataDir, "praktijk-oefeningen.json"), JSON.stringify({ "test fysio": [{ naam: "Eigen oefening" }] }));
await mkdir(join(dataDir, "uploads", "videos"), { recursive: true });
const video = Buffer.from([0, 255, 1, 42, 0, 16]);
await writeFile(join(dataDir, "uploads", "videos", "test.mp4"), video);
assert.equal(veiligBackupPad('../buiten.json'), false);
assert.equal(veiligBackupPad('/buiten.json'), false);
await assert.rejects(verzamelBackup(dataDir, [], 2), /budgetgrens/);
// Te groot voor de grens: de gegevensbestanden gaan alleen, en dat is zichtbaar (deels, met hoeveel
// uploads ontbreken). Twee gevallen: de bron is al te groot, of het pakket komt pas na verpakken en
// versleutelen boven de grens. Passen ook de gegevens niet, dan is het een fout.
{
  const { randomBytes } = await import("node:crypto");
  const kaartenPad = join(dataDir, "kaarten.json");
  const grootte = (await readFile(kaartenPad)).length;
  const zonderUploads = (r) => Object.keys(ontsleutel(r.body, wachtzin).bestanden);
  // een onsamendrukbare upload die veel groter is dan de gegevens
  const ruis = randomBytes(6000);
  await writeFile(join(dataDir, "uploads", "videos", "ruis.mp4"), ruis);
  const alleUploads = { aantal: 2, bytes: video.length + ruis.length };
  // (a) bron te groot: de grens ligt ruim boven de gegevens, maar onder de uploads
  const krap = await maakPakketMetTerugval(dataDir, [kaartenPad], wachtzin, Date.now(), grootte + 3000);
  assert.equal(krap.deels, true, "uploads passen niet: deelkopie");
  assert.deepEqual(zonderUploads(krap), ["kaarten.json"], "alleen gegevensbestanden, geen uploads");
  assert.deepEqual(krap.ontbreekt, alleUploads, "zichtbaar hoeveel uploads ontbreken");
  // (b) bron past, maar het versleutelde pakket niet: grens precies op de bron
  const bron = grootte + video.length + ruis.length;
  assert.ok(Object.keys(await verzamelBackup(dataDir, [kaartenPad], bron)).length === 3, "de bron past binnen de grens");
  assert.ok(versleutel(await verzamelBackup(dataDir, [kaartenPad], bron), wachtzin).length > bron, "het pakket is groter dan de bron");
  const naVerpakken = await maakPakketMetTerugval(dataDir, [kaartenPad], wachtzin, Date.now(), bron);
  assert.equal(naVerpakken.deels, true, "te groot na verpakken: ook dan de deelkopie in plaats van niets");
  assert.ok(naVerpakken.body.length <= bron);
  assert.deepEqual(zonderUploads(naVerpakken), ["kaarten.json"]);
  assert.deepEqual(naVerpakken.ontbreekt, alleUploads);
  assert.deepEqual(await telUploads(dataDir), alleUploads);
  await rm(join(dataDir, "uploads", "videos", "ruis.mp4"));
  // (c) ook de gegevens passen niet: fout, geen lege kopie
  await assert.rejects(maakPakketMetTerugval(dataDir, [kaartenPad], wachtzin, Date.now(), 2), /budgetgrens/);
  // (d) alles past: volledig
  const ruim = await maakPakketMetTerugval(dataDir, [kaartenPad], wachtzin);
  assert.equal(ruim.deels, false);
  assert.deepEqual(ruim.ontbreekt, { aantal: 0, bytes: 0 });
  assert.ok(ontsleutel(ruim.body, wachtzin).bestanden["uploads/videos/test.mp4"], "past alles, dan gaan de uploads mee");
}
await symlink('/etc/passwd', join(dataDir, 'uploads', 'link'));
await assert.rejects(verzamelBackup(dataDir, []), /symbolische link/);
await rm(join(dataDir, 'uploads', 'link'));
const ontvangen = [];
let antwoord = 200;
const nep = createServer((req, res) => {
  const stukken = [];
  req.on("data", (c) => stukken.push(c));
  req.on("end", () => {
    if (req.url === "/emails") { ontvangen.push({ mail: JSON.parse(Buffer.concat(stukken).toString()) }); res.writeHead(200, { "content-type": "application/json" }); return res.end('{"id":"m"}'); }
    ontvangen.push({ methode: req.method, url: req.url, headers: req.headers, body: Buffer.concat(stukken) });
    res.writeHead(antwoord); res.end();
  });
});
await new Promise((r) => nep.listen(0, "127.0.0.1", r));
const nepUrl = "http://127.0.0.1:" + nep.address().port;

async function start(env) {
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "",
      MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", BACKUP_S3_URL: "", BACKUP_S3_SLEUTEL_ID: "", BACKUP_S3_GEHEIM: "", BACKUP_SLEUTEL: "", BACKUP_LEVERANCIER: "", ...env },
    stdio: ["ignore", "pipe", "pipe"] });
  let uitvoer = "";
  app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
  const origin = "http://127.0.0.1:" + port;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin + "/health")).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return { origin, stop: () => new Promise((r) => { app.on("exit", r); app.kill(); }), uitvoer: () => uitvoer };
}
const wacht = async (klaar) => { for (let i = 0; i < 100 && !(await klaar()); i++) await new Promise((r) => setTimeout(r, 100)); };
const health = async (origin) => (await fetch(origin + "/health")).json();
const aan = { BACKUP_S3_URL: nepUrl + "/bak", BACKUP_S3_SLEUTEL_ID: "sleutelid", BACKUP_S3_GEHEIM: "geheim", BACKUP_SLEUTEL: wachtzin, BACKUP_LEVERANCIER: "Scaleway (Amsterdam, Nederland)" };

try {
  // uit: niets verstuurd, /health zegt "uit", de privacyverklaring noemt geen extra partij
  let app = await start({});
  assert.equal((await health(app.origin)).backupElders, "uit");
  assert.ok(!(await (await fetch(app.origin + "/privacy")).text()).includes('id="reservekopie"'));
  await app.stop();
  assert.equal(ontvangen.length, 0, "zonder variabelen gaat er niets naar buiten");

  // aan: één PUT naar het weekdagbestand, ondertekend, versleuteld, met alle databestanden
  app = await start(aan);
  await wacht(async () => (await health(app.origin)).backupElders === "ok");
  const h = await health(app.origin);
  assert.equal(h.backupElders, "ok", app.uitvoer());
  assert.ok(h.backupEldersOp);
  assert.equal(h.backupEldersUploadsOntbreken, 0);
  assert.ok(!JSON.stringify(h).includes("geheim") && !JSON.stringify(h).includes(wachtzin), "/health lekt geen sleutels");
  const put = ontvangen.find((o) => o.methode === "PUT");
  assert.equal(put.url, "/bak/" + objectNaam());
  assert.match(put.headers.authorization, /^AWS4-HMAC-SHA256 Credential=sleutelid\//);
  assert.ok(!put.body.includes("Geheimenaam"), "patiëntgegevens gaan niet leesbaar de deur uit");
  const terug = ontsleutel(put.body, wachtzin).bestanden;
  assert.equal(JSON.parse(terug["kaarten.json"])["Test Fysio"][0].naam, "Geheimenaam");
  assert.deepEqual(terug["uploads/videos/test.mp4"], video);
  assert.ok(terug["praktijk-oefeningen.json"], "eigen oefeningen van praktijken zitten in de reservekopie");
  // ook de kopie op het volume zelf heeft de eigen oefeningen nu
  const dagmap = (await readdir(join(dataDir, "backups")))[0];
  assert.ok((await readdir(join(dataDir, "backups", dagmap))).includes("praktijk-oefeningen.json"));
  // de privacyverklaring noemt de opslagpartij
  const privacy = await (await fetch(app.origin + "/privacy")).text();
  assert.ok(privacy.includes('id="reservekopie"') && privacy.includes("Scaleway (Amsterdam, Nederland)"));
  // de tekst klopt met wat er meegaat: ook de uploads
  assert.ok(/reservekopie[\s\S]{0,400}ook video/.test(privacy) && !/behalve video/.test(privacy));
  await app.stop();

  // terugzetten met het script
  const pakketPad = join(dataDir, "terug.fpb"), doel = join(dataDir, "teruggezet");
  await writeFile(pakketPad, put.body);
  const code = await new Promise((r) => spawn(process.execPath, ["scripts/backup-terugzetten.mjs", pakketPad, doel],
    { env: { ...process.env, BACKUP_SLEUTEL: wachtzin }, stdio: "ignore" }).on("exit", r));
  assert.equal(code, 0);
  assert.equal(JSON.parse(await readFile(join(doel, "kaarten.json"), "utf8"))["Test Fysio"][0].naam, "Geheimenaam");

  assert.deepEqual(await readFile(join(doel, "uploads", "videos", "test.mp4")), video);
  // Een ontsleutelbaar maar onveilig archief mag geen bestand buiten de doelmap maken.
  await writeFile(pakketPad, versleutel({ '../buiten.json': Buffer.from('bad') }, wachtzin));
  const unsafe = await new Promise(r => spawn(process.execPath, ['scripts/backup-terugzetten.mjs', pakketPad, join(dataDir,'unsafe')], { env: {...process.env, BACKUP_SLEUTEL:wachtzin}, stdio:'ignore' }).on('exit',r));
  assert.notEqual(unsafe,0);

  // opslag weigert: /health zegt "fout", de beheerder krijgt één mail, de server draait door
  ontvangen.length = 0;
  app = await start(aan);
  await wacht(async () => (await health(app.origin)).backupElders === 'ok');
  assert.equal(ontvangen.length, 0, 'herstart uploadt niet nogmaals binnen 24 uur');
  await app.stop();
  await rm(join(dataDir, 'backup-elders-status.json'));
  antwoord = 403;
  app = await start({ ...aan, MAIL_API_SLEUTEL: "nep", MAIL_AFZENDER: "fysiplan@voorbeeld.nl", MAIL_API_BASIS: nepUrl, PROEF_MELDING_AAN: "beheer@voorbeeld.nl" });
  await wacht(async () => (await health(app.origin)).backupElders === "fout" && ontvangen.some((o) => o.mail));
  assert.equal((await health(app.origin)).backupElders, "fout");
  const mail = ontvangen.find((o) => o.mail);
  assert.ok(mail && /reservekopie/i.test(mail.mail.subject), "mail aan de beheerder bij een mislukte reservekopie");
  assert.ok(!JSON.stringify(mail.mail).includes(wachtzin));
  await app.stop();

  // uploads te groot voor de grens: de gegevens gaan wel, /health zegt "deels" met het aantal
  // ontbrekende uploads, en de beheerder krijgt een mail die zegt wat er ontbreekt
  await rm(join(dataDir, 'backup-elders-status.json'));
  const { randomBytes } = await import("node:crypto");
  await writeFile(join(dataDir, "uploads", "videos", "groot.mp4"), randomBytes(1024 * 1024 + 4096));
  ontvangen.length = 0;
  antwoord = 200;
  app = await start({ ...aan, BACKUP_MAX_MB: "1", MAIL_API_SLEUTEL: "nep", MAIL_AFZENDER: "fysiplan@voorbeeld.nl", MAIL_API_BASIS: nepUrl, PROEF_MELDING_AAN: "beheer@voorbeeld.nl" });
  await wacht(async () => (await health(app.origin)).backupElders === "deels" && ontvangen.some((o) => o.mail));
  const hd = await health(app.origin);
  assert.equal(hd.backupElders, "deels", app.uitvoer());
  assert.equal(hd.backupEldersUploadsOntbreken, 2, "/health zegt hoeveel uploads ontbreken");
  const deelPut = ontvangen.find((o) => o.methode === "PUT");
  const deel = ontsleutel(deelPut.body, wachtzin).bestanden;
  assert.ok(deel["kaarten.json"] && !Object.keys(deel).some((n) => n.startsWith("uploads/")), "gegevens wel, uploads niet");
  const deelMail = ontvangen.find((o) => o.mail).mail;
  assert.match(deelMail.subject, /onvolledig/);
  assert.match(JSON.stringify(deelMail), /alle 2 uploads/);
  assert.match(JSON.stringify(deelMail), /7 dagen/);
  await app.stop();
  // na een herstart binnen 24 uur blijft "deels" zichtbaar (niet stil terug naar "ok")
  ontvangen.length = 0;
  app = await start({ ...aan, BACKUP_MAX_MB: "1" });
  await wacht(async () => (await health(app.origin)).backupElders === "deels");
  assert.equal((await health(app.origin)).backupEldersUploadsOntbreken, 2);
  assert.equal(ontvangen.length, 0);
  await app.stop();
  console.log("Reservekopie buiten Railway: handtekening, versleuteling, verzenden, terugzetten, foutmelding en deelkopie kloppen.");
} finally {
  nep.close();
  await rm(dataDir, { recursive: true, force: true });
}
