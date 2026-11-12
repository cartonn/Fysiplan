// De database die meeschrijft (reviewlijst punt 11).
//
// Alle gegevens staan in JSON-bestanden in de datamap. De review raadde een echte database aan
// (PostgreSQL in Europa), met een rustige overstap:
//   1. een script leest de huidige bestanden in (hier: de eerste ronde bij het starten, of
//      scripts/database-overzetten.mjs op een kopie);
//   2. daarna schrijft de database mee, terwijl de bestanden de enige bron blijven;
//   3. elke nacht vergelijkt de server bestand voor bestand wat in de database staat;
//   4. terugzetten uit de database wordt getest (scripts/database-terugzetten.mjs);
//   5. pas als de vergelijking geen verschil toont en terugzetten werkt, wordt de database de bron.
// Deze module doet stap 1 tot en met 4. Stap 5 is een aparte beslissing en een aparte bouwstap.
//
// Uit, tenzij DATABASE_URL gezet is én DATABASE_MEESCHRIJVEN=aan. Ook aan verandert er voor de
// app niets: elke schrijfactie gaat eerst naar het bestand, zoals altijd. De database krijgt
// daarna een kopie, in een eigen wachtrij. Een trage of onbereikbare database houdt niemand op;
// hij loopt dan achter en de vergelijking laat dat zien.
//
// Wat er in de database staat:
//   fp_bestand       elk gespiegeld bestand in zijn geheel (jsonb), met een vingerafdruk
//   fp_praktijk      per praktijk: naam en wanneer gemaakt
//   fp_login         per login: praktijk, naam, e-mail, rol, actief (zonder wachtwoord of tweede stap)
//   fp_kaart         per kaart: praktijk, id, laatst bewaard, verwijderd, gearchiveerd, en de kaart zelf
//   fp_kaartversie   elke bewaarde versie van een kaart (hooguit 100 per kaart; weg met de kaart)
//   fp_leeslog       de regels van het leeslog
//   fp_vergelijking  de uitkomst van elke vergelijking
// De tabellen naast fp_bestand zijn het begin van het model uit de review. Ze worden telkens uit
// de bestanden afgeleid en dus ook vergeleken.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export const SCHEMA = `
create table if not exists fp_bestand (naam text primary key, inhoud jsonb not null, vinger text not null, bijgewerkt timestamptz not null default now());
create table if not exists fp_praktijk (pk text primary key, naam text not null default '', gemaakt bigint, vinger text not null);
create table if not exists fp_login (pk text not null, id text not null, naam text not null default '', email text not null default '', rol text not null default '', actief boolean not null default true, gemaakt bigint, laatst bigint, vinger text not null, primary key (pk, id));
create table if not exists fp_kaart (pk text not null, sleutel text not null, id text not null, ts bigint, verwijderd_op bigint, gearchiveerd boolean not null default false, vinger text not null, data jsonb not null, primary key (pk, sleutel));
create index if not exists fp_kaart_id on fp_kaart (id);
create table if not exists fp_kaartversie (id text not null, vinger text not null, ts bigint, data jsonb not null, opgeslagen timestamptz not null default now(), primary key (id, vinger));
create table if not exists fp_leeslog (pk text not null, nr int not null, t bigint, tot bigint, n int, k text, s text, wie text, lid text, primary key (pk, nr));
create table if not exists fp_leeslog_vinger (pk text primary key, vinger text not null);
create table if not exists fp_vergelijking (t timestamptz primary key default now(), gelijk boolean not null, verschillen jsonb not null);
`;
export const VERSIES_PER_KAART = 100;

// Welke bestanden gaan mee: elk .json-bestand in de datamap, behalve sessies en sleutels (die
// horen bij deze ene server en worden bij een overstap opnieuw gemaakt) en testbestanden.
export function gespiegeld(naam) {
  const n = basename(String(naam || ""));
  if (!/^[a-z0-9][a-z0-9._-]*\.json$/i.test(n)) return false;
  if (/sessies|insteltokens|media-sleutel|test-postbak|\.tmp-/i.test(n)) return false;
  return true;
}

// JSON met gesorteerde sleutels: zo geeft dezelfde inhoud dezelfde vingerafdruk, of hij nu uit het
// bestand komt of uit jsonb (dat de volgorde van sleutels niet bewaart).
export function canoniek(w) {
  if (Array.isArray(w)) return "[" + w.map((x) => (x === undefined ? "null" : canoniek(x))).join(",") + "]";
  if (w && typeof w === "object") return "{" + Object.keys(w).sort().filter((k) => w[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canoniek(w[k])).join(",") + "}";
  return JSON.stringify(w === undefined ? null : w);
}
export const vinger = (w) => createHash("sha256").update(canoniek(w)).digest("hex").slice(0, 32);
const getal = (x) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Math.round(Number(x)) : null);
const tekst = (x, max = 300) => String(x == null ? "" : x).slice(0, max);
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

// ---- de tabellen afleiden uit de bestanden ----
export function praktijkRijen(accounts) {
  const praktijken = [], logins = [];
  for (const [pk, p] of Object.entries(isObj(accounts) ? accounts : {})) {
    if (!isObj(p)) continue;
    const pr = { pk, naam: tekst(p.naam), gemaakt: getal(p.gemaakt) };
    praktijken.push({ ...pr, vinger: vinger(pr) });
    for (const l of Array.isArray(p.leden) ? p.leden : []) {
      if (!isObj(l) || !l.id) continue;
      const lr = { pk, id: tekst(l.id, 80), naam: tekst(l.naam), email: tekst(l.email), rol: tekst(l.rol, 40), actief: l.actief !== false, gemaakt: getal(l.gemaakt), laatst: getal(l.laatst) };
      logins.push({ ...lr, vinger: vinger(lr) });
    }
  }
  return { praktijken, logins };
}
export function kaartRijen(kaarten) {
  const rijen = [];
  for (const [pk, lijst] of Object.entries(isObj(kaarten) ? kaarten : {})) {
    if (!isObj(lijst)) continue;
    for (const [sleutel, k] of Object.entries(lijst)) {
      if (!isObj(k)) continue;
      rijen.push({ pk, sleutel, id: tekst(k.id || "", 40), ts: getal(k.ts), verwijderd_op: getal(k.verwijderdOp), gearchiveerd: !!k.gearchiveerd, vinger: vinger(k), data: k });
    }
  }
  return rijen;
}
export function leeslogRijen(log) {
  const per = {};
  for (const [pk, lijst] of Object.entries(isObj(log) ? log : {})) {
    if (!Array.isArray(lijst)) continue;
    per[pk] = { vinger: vinger(lijst), rijen: lijst.filter(isObj).map((r, nr) => ({ pk, nr, t: getal(r.t), tot: getal(r.tot), n: getal(r.n), k: tekst(r.k, 80), s: tekst(r.s, 40), wie: tekst(r.wie, 120), lid: tekst(r.lid, 80) })) };
  }
  return per;
}

// ---- de meeschrijver ----
// db: { query(sql, params) -> { rows }, transactie(async (q) => …) }. De server geeft een pg.Pool
// mee (lib/database-pg.js); de test kan elke database met dezelfde vorm meegeven.
export function maakMeeschrijver({ db, dataDir, nu = () => Date.now(), log = console }) {
  const wacht = new Map(); // naam -> tekst van het bestand (de laatste wint)
  let bezig = null, fouten = 0, laatsteFout = "", geschreven = 0, laatsteVergelijking = null, gestopt = false;
  const bekend = { kaart: new Map(), praktijk: new Map(), login: new Map(), leeslog: new Map() };
  let bekendGeladen = false;

  async function laadBekend() {
    if (bekendGeladen) return;
    for (const r of (await db.query("select pk, sleutel, vinger from fp_kaart")).rows) bekend.kaart.set(r.pk + "\u0000" + r.sleutel, r.vinger);
    for (const r of (await db.query("select pk, vinger from fp_praktijk")).rows) bekend.praktijk.set(r.pk, r.vinger);
    for (const r of (await db.query("select pk, id, vinger from fp_login")).rows) bekend.login.set(r.pk + "\u0000" + r.id, r.vinger);
    for (const r of (await db.query("select pk, vinger from fp_leeslog_vinger")).rows) bekend.leeslog.set(r.pk, r.vinger);
    bekendGeladen = true;
  }

  async function schrijfBestand(naam, inhoudTekst) {
    const obj = JSON.parse(inhoudTekst);
    await laadBekend();
    await db.transactie(async (q) => {
      await q("insert into fp_bestand (naam, inhoud, vinger, bijgewerkt) values ($1, $2::jsonb, $3, now()) on conflict (naam) do update set inhoud = excluded.inhoud, vinger = excluded.vinger, bijgewerkt = now()",
        [naam, inhoudTekst, vinger(obj)]);
      if (naam === "kaarten.json") await schrijfKaarten(q, obj);
      if (naam === "praktijk-accounts.json") await schrijfPraktijken(q, obj);
      if (naam === "leeslog.json") await schrijfLeeslog(q, obj);
    });
    geschreven++;
  }
  // Alleen wat veranderde: per rij een vingerafdruk in het geheugen (na de transactie bijgewerkt).
  async function schrijfKaarten(q, kaarten) {
    const rijen = kaartRijen(kaarten), nieuw = new Map(), weg = [];
    for (const r of rijen) {
      const sl = r.pk + "\u0000" + r.sleutel;
      nieuw.set(sl, r.vinger);
      if (bekend.kaart.get(sl) === r.vinger) continue;
      await q("insert into fp_kaart (pk, sleutel, id, ts, verwijderd_op, gearchiveerd, vinger, data) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict (pk, sleutel) do update set id = excluded.id, ts = excluded.ts, verwijderd_op = excluded.verwijderd_op, gearchiveerd = excluded.gearchiveerd, vinger = excluded.vinger, data = excluded.data",
        [r.pk, r.sleutel, r.id, r.ts, r.verwijderd_op, r.gearchiveerd, r.vinger, JSON.stringify(r.data)]);
      if (r.id) {
        await q("insert into fp_kaartversie (id, vinger, ts, data) values ($1,$2,$3,$4::jsonb) on conflict do nothing", [r.id, r.vinger, r.ts, JSON.stringify(r.data)]);
        await q("delete from fp_kaartversie where id = $1 and vinger in (select vinger from fp_kaartversie where id = $1 order by opgeslagen desc, ts desc nulls last offset $2)", [r.id, VERSIES_PER_KAART]);
      }
    }
    for (const sl of bekend.kaart.keys()) if (!nieuw.has(sl)) weg.push(sl.split("\u0000"));
    const ids = new Set(rijen.map((r) => r.id).filter(Boolean));
    for (const [pk, sleutel] of weg) {
      const oud = (await q("delete from fp_kaart where pk = $1 and sleutel = $2 returning id", [pk, sleutel])).rows[0];
      // een kaart die voorgoed weg is, verdwijnt met al haar versies
      if (oud && oud.id && !ids.has(oud.id)) await q("delete from fp_kaartversie where id = $1", [oud.id]);
    }
    bekend.kaart = nieuw;
  }
  async function schrijfPraktijken(q, accounts) {
    const { praktijken, logins } = praktijkRijen(accounts);
    const np = new Map(), nl = new Map();
    for (const r of praktijken) {
      np.set(r.pk, r.vinger);
      if (bekend.praktijk.get(r.pk) !== r.vinger) await q("insert into fp_praktijk (pk, naam, gemaakt, vinger) values ($1,$2,$3,$4) on conflict (pk) do update set naam = excluded.naam, gemaakt = excluded.gemaakt, vinger = excluded.vinger", [r.pk, r.naam, r.gemaakt, r.vinger]);
    }
    for (const r of logins) {
      const sl = r.pk + "\u0000" + r.id;
      nl.set(sl, r.vinger);
      if (bekend.login.get(sl) !== r.vinger) await q("insert into fp_login (pk, id, naam, email, rol, actief, gemaakt, laatst, vinger) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (pk, id) do update set naam = excluded.naam, email = excluded.email, rol = excluded.rol, actief = excluded.actief, gemaakt = excluded.gemaakt, laatst = excluded.laatst, vinger = excluded.vinger",
        [r.pk, r.id, r.naam, r.email, r.rol, r.actief, r.gemaakt, r.laatst, r.vinger]);
    }
    for (const sl of bekend.login.keys()) if (!nl.has(sl)) { const [pk, id] = sl.split("\u0000"); await q("delete from fp_login where pk = $1 and id = $2", [pk, id]); }
    for (const pk of bekend.praktijk.keys()) if (!np.has(pk)) await q("delete from fp_praktijk where pk = $1", [pk]);
    bekend.praktijk = np; bekend.login = nl;
  }
  async function schrijfLeeslog(q, log) {
    const per = leeslogRijen(log), nieuw = new Map();
    for (const [pk, { vinger: v, rijen }] of Object.entries(per)) {
      nieuw.set(pk, v);
      if (bekend.leeslog.get(pk) === v) continue;
      await q("delete from fp_leeslog where pk = $1", [pk]);
      for (let i = 0; i < rijen.length; i += 500) {
        const stuk = rijen.slice(i, i + 500), w = [], p = [];
        stuk.forEach((r, j) => { w.push("(" + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => "$" + (j * 9 + x)).join(",") + ")"); p.push(r.pk, r.nr, r.t, r.tot, r.n, r.k, r.s, r.wie, r.lid); });
        await q("insert into fp_leeslog (pk, nr, t, tot, n, k, s, wie, lid) values " + w.join(","), p);
      }
      await q("insert into fp_leeslog_vinger (pk, vinger) values ($1,$2) on conflict (pk) do update set vinger = excluded.vinger", [pk, v]);
    }
    for (const pk of bekend.leeslog.keys()) if (!nieuw.has(pk)) { await q("delete from fp_leeslog where pk = $1", [pk]); await q("delete from fp_leeslog_vinger where pk = $1", [pk]); }
    bekend.leeslog = nieuw;
  }

  // de wachtrij: één schrijver tegelijk, per bestand alleen de nieuwste stand
  function draai() {
    if (bezig || gestopt) return bezig;
    bezig = (async () => {
      while (wacht.size && !gestopt) {
        const [naam, inhoud] = wacht.entries().next().value;
        wacht.delete(naam);
        try { await schrijfBestand(naam, inhoud); }
        catch (e) {
          fouten++; laatsteFout = String((e && e.message) || e).slice(0, 200);
          // in de rij laten staan als er intussen niets nieuwers kwam; even wachten voor een volgende poging
          bekendGeladen = false; bekend.kaart.clear(); bekend.praktijk.clear(); bekend.login.clear(); bekend.leeslog.clear();
          if (!wacht.has(naam)) wacht.set(naam, inhoud);
          log.error("database: " + naam + " niet meegeschreven: " + laatsteFout);
          await new Promise((r) => setTimeout(r, Math.min(30000, 500 * fouten)).unref?.());
        }
      }
    })().finally(() => { bezig = null; if (wacht.size && !gestopt) draai(); });
    return bezig;
  }

  return {
    async start() {
      await db.query(SCHEMA);
      // de eerste ronde: alle gespiegelde bestanden zoals ze nu op schijf staan
      let namen = [];
      try { namen = (await readdir(dataDir)).filter(gespiegeld); } catch {}
      for (const n of namen.sort()) {
        try { const t = await readFile(join(dataDir, n), "utf8"); JSON.parse(t); if (!wacht.has(n)) wacht.set(n, t); } catch {}
      }
      draai();
    },
    // na elke saveJson: het pad en de tekst die net op schijf staat
    meld(pad, inhoudTekst) {
      const naam = basename(String(pad));
      if (gestopt || !gespiegeld(naam) || String(pad) !== join(dataDir, naam)) return;
      wacht.set(naam, inhoudTekst);
      draai();
    },
    // wachten tot de rij leeg is (bij het stoppen, en voor een vergelijking)
    async bij(maxMs = 10000) {
      const eind = nu() + maxMs;
      while ((wacht.size || bezig) && nu() < eind) await Promise.race([bezig || Promise.resolve(), new Promise((r) => setTimeout(r, 100))]);
      return !wacht.size && !bezig;
    },
    async stop(maxMs = 5000) { await this.bij(maxMs); gestopt = true; },
    // Bestand voor bestand: staat in de database precies wat op schijf staat? En kloppen de
    // afgeleide tabellen met de bestanden? Geeft { t, gelijk, verschillen: [...] } en bewaart dat.
    async vergelijk() {
      const bij = await this.bij(30000);
      const verschillen = [];
      if (!bij) verschillen.push({ wat: "wachtrij", tekst: "de database loopt nog achter (" + wacht.size + " bestanden in de rij)" });
      let namen = [];
      try { namen = (await readdir(dataDir)).filter(gespiegeld).sort(); } catch {}
      const opSchijf = {};
      for (const n of namen) { try { opSchijf[n] = JSON.parse(await readFile(join(dataDir, n), "utf8")); } catch { verschillen.push({ wat: "bestand", naam: n, tekst: "op schijf niet te lezen" }); } }
      const inDb = new Map((await db.query("select naam, inhoud from fp_bestand")).rows.map((r) => [r.naam, r.inhoud]));
      for (const [n, obj] of Object.entries(opSchijf)) {
        if (!inDb.has(n)) verschillen.push({ wat: "bestand", naam: n, tekst: "ontbreekt in de database" });
        else if (vinger(inDb.get(n)) !== vinger(obj)) verschillen.push({ wat: "bestand", naam: n, tekst: "inhoud verschilt" });
      }
      for (const n of inDb.keys()) if (!Object.hasOwn(opSchijf, n)) verschillen.push({ wat: "bestand", naam: n, tekst: "staat in de database, niet op schijf" });
      // de afgeleide tabellen
      const tel = async (sql) => new Map((await db.query(sql)).rows.map((r) => [r.k, r.v]));
      const zelfde = async (wat, verwacht, sql) => {
        const echt = await tel(sql);
        let mis = 0;
        for (const [k, v] of verwacht) if (echt.get(k) !== v) mis++;
        for (const k of echt.keys()) if (!verwacht.has(k)) mis++;
        if (mis) verschillen.push({ wat, tekst: mis + " rijen verschillen" });
      };
      const kr = kaartRijen(opSchijf["kaarten.json"]);
      await zelfde("fp_kaart", new Map(kr.map((r) => [r.pk + "/" + r.sleutel, r.vinger])), "select pk || '/' || sleutel as k, vinger as v from fp_kaart");
      const pr = praktijkRijen(opSchijf["praktijk-accounts.json"]);
      await zelfde("fp_praktijk", new Map(pr.praktijken.map((r) => [r.pk, r.vinger])), "select pk as k, vinger as v from fp_praktijk");
      await zelfde("fp_login", new Map(pr.logins.map((r) => [r.pk + "/" + r.id, r.vinger])), "select pk || '/' || id as k, vinger as v from fp_login");
      const ll = leeslogRijen(opSchijf["leeslog.json"]);
      await zelfde("fp_leeslog", new Map(Object.entries(ll).map(([pk, x]) => [pk, String(x.rijen.length)])), "select pk as k, count(*)::text as v from fp_leeslog group by pk");
      const ids = new Set(kr.map((r) => r.id).filter(Boolean));
      const wees = (await db.query("select count(distinct id)::int as n from fp_kaartversie")).rows[0].n - (await db.query("select count(distinct id)::int as n from fp_kaartversie where id = any($1)", [[...ids]])).rows[0].n;
      if (wees) verschillen.push({ wat: "fp_kaartversie", tekst: wees + " kaarten hebben nog versies maar bestaan niet meer" });
      const uitkomst = { t: new Date(nu()).toISOString(), gelijk: verschillen.length === 0, bestanden: Object.keys(opSchijf).length, verschillen: verschillen.slice(0, 50) };
      await db.query("insert into fp_vergelijking (t, gelijk, verschillen) values ($1, $2, $3::jsonb) on conflict (t) do nothing", [uitkomst.t, uitkomst.gelijk, JSON.stringify(uitkomst.verschillen)]);
      await db.query("delete from fp_vergelijking where t < now() - interval '90 days'");
      laatsteVergelijking = uitkomst;
      return uitkomst;
    },
    stand() {
      return {
        stand: "meeschrijven", wachtrij: wacht.size + (bezig ? 1 : 0), geschreven, fouten, ...(laatsteFout ? { laatsteFout } : {}),
        laatsteVergelijking: laatsteVergelijking ? { t: laatsteVergelijking.t, gelijk: laatsteVergelijking.gelijk, verschillen: laatsteVergelijking.verschillen.length } : null
      };
    },
    _wacht: () => wacht
  };
}

// Alle bestanden uit de database terug naar een map (de hersteltest, scripts/database-terugzetten.mjs).
export async function zetTerug(db, naarMap, schrijf) {
  const rijen = (await db.query("select naam, inhoud from fp_bestand order by naam")).rows;
  for (const r of rijen) if (gespiegeld(r.naam)) await schrijf(join(naarMap, r.naam), JSON.stringify(r.inhoud, null, 2));
  return rijen.length;
}
