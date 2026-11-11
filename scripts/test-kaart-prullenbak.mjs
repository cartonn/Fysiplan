// Gedeeld praktijkwerk en rollen (security, 2026-11-07).
// Een therapeut (geen beheerder) kon teamsjablonen en eigen oefeningen van de hele praktijk
// verwijderen, en een sjabloon van een collega stil overschrijven door met dezelfde naam te delen.
// - Wie iets deelde/toevoegde mag het zelf weghalen of bijwerken; een beheerder altijd.
// - Een andere therapeut krijgt 403 (verwijderen) of 409 (zelfde naam), en er verandert niets.
// - Na een verlopen proef kan een beheerder geen collega's meer uitnodigen of eigen login maken.
// Zonder browser, past in CI. `npm run test:gedeeldwerk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-gedeeldwerk-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
let app, uit = "";
const start = () => {
  app = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
};
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const klaar = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); } };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8." + (ip >> 8) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.8.9." + (ip++ & 255) },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
// kleinste geldige PNG-kop + opvulling (server controleert magische bytes en ≥100 bytes)
const png = "data:image/png;base64," + Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.alloc(200, 1)]).toString("base64");
const P = "Fysio Rollen";

try {
  start(); await klaar();
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const S = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Sanne", email: "sanne@rollen.nl", wachtwoord: "sanne-wachtwoord", regels: true }, G)).json());
  const lid = async (naam, email) => {
    const u = await post("/api/praktijk/team/uitnodigen", { email, naam, rol: "therapeut" }, S);
    assert.equal(u.status, 200);
    const t = new URL((await u.json()).link).searchParams.get("t");
    assert.equal((await formulier("/v2/uitnodiging", { t, naam, wachtwoord: naam.toLowerCase() + "-wachtwoord", regels: "1" })).status, 200);
    const l = await post("/api/praktijk/login", { email, wachtwoord: naam.toLowerCase() + "-wachtwoord" });
    assert.equal(l.status, 200);
    return ses(await l.json());
  };
  const J = await lid("Joris", "joris@rollen.nl");
  const M = await lid("Mark", "mark@rollen.nl");

  const maak = async (naam,H,extra={}) => {const r=await post('/api/kaarten',{praktijk:P,naam,client:{c_naam:naam},chosen:[{n:'Squat'}],...extra},H);assert.equal(r.status,200);return r.json();};
  const lijst = async H => (await get('/api/kaarten?praktijk='+encodeURIComponent(P),H)).json();
  const prul = async H => (await (await get('/api/kaarten/prullenbak?praktijk='+encodeURIComponent(P),H)).json()).kaarten;
  const weg = (naam,H,id) => post('/api/kaarten/verwijder',{praktijk:P,naam,id},H);
  const terug = (id,H) => post('/api/kaarten/herstel',{praktijk:P,id},H);
  const a=await maak('Test',J,{maker:'lid:spoof'});
  assert.equal((await lijst(M))[0].magWeg,false);
  assert.equal((await lijst(J))[0].magWeg,true);
  assert.equal((await weg('Test',M,a.id)).status,403);
  assert.equal((await weg('Test',{},a.id)).status,401);
  await maak('Test',M,{kaartId:a.id,behandelaar:'Mark',maker:'lid:spoof'});
  assert.equal((await weg('Test',M,a.id)).status,403,'bewerken neemt eigendom niet over');
  assert.equal((await weg('Test',J,'deadbeef0000')).status,409);
  assert.equal((await weg('Test',J,a.id)).status,200);
  const first=(await prul(J))[0];assert.ok(first.herstelTot<=Date.now()+7*86400000);
  assert.equal((await get('/api/kaart?id='+a.id)).status,404);
  assert.equal((await get('/api/praktijk/kaart?praktijk='+encodeURIComponent(P)+'&id='+a.id,J)).status,404);
  assert.equal((await lijst(J)).length,0);
  assert.equal((await prul(M)).length,0);
  const bezet=await post('/api/kaarten',{praktijk:P,naam:'Test',kaartId:''},M);
  assert.equal(bezet.status,409,'collega kan verwijderde kaart niet vervangen');
  const melding=(await bezet.json()).fout;
  assert.match(melding,/maker of beheerder/);
  assert.match(melding,/andere patiënt/);
  assert.match(melding,/Jan K\./);
  assert.equal((await prul(M)).length,0,'melding geeft collega geen herstelrechten');
  assert.equal((await terug(a.id,M)).status,403);
  assert.equal((await post('/api/kaarten',{praktijk:P,naam:'Test',kaartId:a.id},J)).status,409);
  assert.equal((await post('/api/kaarten',{praktijk:P,naam:'Andere naam',kaartId:a.id},J)).status,409);
  assert.equal((await post('/api/kaart/naam',{praktijk:P,id:a.id,naam:'Hernoemd'},M)).status,404);
  assert.equal((await weg('Test',J,a.id)).status,200);
  assert.equal((await prul(J))[0].herstelTot,first.herstelTot,'herhaalde verwijdering verlengt niets');
  assert.equal((await terug(a.id,S)).status,200);
  assert.equal((await get('/api/kaart?id='+a.id)).status,200);
  assert.equal((await lijst(J))[0].magWeg,true);
  assert.equal((await terug(a.id,S)).status,404);
  const legacy=await maak('Oud',G);
  assert.equal((await weg('Oud',J,legacy.id)).status,403,'zonder maker alleen beheer');
  assert.equal((await weg('Oud',S,legacy.id)).status,200);
  await maak('Verlopen',J);
  await weg('Verlopen',J);
  // Na herstart blijven prullenbak en rollen bestaan; verlopen kaart + privévideo worden opgeruimd.
  app.kill();await wacht(200);
  const data=JSON.parse(await readFile(join(dataDir,'kaarten.json'),'utf8'));
  const pk=Object.keys(data)[0];
  data[pk].verlopen.herstelTot=Date.now()-1;
  const {mkdir}=await import('node:fs/promises');await mkdir(join(dataDir,'uploads/videos'),{recursive:true});
  const video='uploads/videos/v-aaaaaaaaaaaaaaaa.mp4';await writeFile(join(dataDir,video),'testvideo');
  data[pk].verlopen.vids={Squat:video};
  const keep='uploads/videos/v-bbbbbbbbbbbbbbbb.mp4';await writeFile(join(dataDir,keep),'retained video');data[pk].oud.vids={Squat:keep};
  await writeFile(join(dataDir,'kaarten.json'),JSON.stringify(data));
  start();await klaar();
  const J2=ses(await (await post('/api/praktijk/login',{email:'joris@rollen.nl',wachtwoord:'joris-wachtwoord'})).json());
  const S2=ses(await (await post('/api/praktijk/login',{email:'sanne@rollen.nl',wachtwoord:'sanne-wachtwoord'})).json());
  assert.equal((await prul(S2)).length,1,'alleen Oud staat nog in prullenbak');
  assert.equal((await prul(J2)).length,0);
  assert.equal((await get('/'+keep)).status,404,'oude videolink geblokkeerd in prullenbak');
  assert.equal((await get('/'+keep.replace('uploads/','uploads//'))).status,404,'dubbele slash omzeilt videoblokkade niet');
  assert.equal((await readFile(join(dataDir,keep),'utf8')),'retained video');
  assert.equal((await terug(legacy.id,S2)).status,200);
  assert.equal((await get('/'+keep)).status,200,'opname terug na herstel');
  await wacht(300);
  const na=JSON.parse(await readFile(join(dataDir,'kaarten.json'),'utf8'));assert.equal(na[pk].verlopen,undefined);
  await assert.rejects(readFile(join(dataDir,video)),'video opgeruimd na definitieve verwijdering');
  console.log('kaart-prullenbak: rollen, makerbehoud, verborgen links, herstel, herstart en verval OK');
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
