// Beheerpagina van de vertalingen: /dashboard88/vertalingen (server: lib/vertaal-routes.js).
// Inloggen gaat zoals op de andere beheerpagina's (public/beheersleutel.js). Een lezer heeft een
// beheeraccount met alleen het recht "Vertalingen".
import { vraagBeheersleutel } from '/beheersleutel.js';

const HDR = { 'x-admin-sleutel': await vraagBeheersleutel() };
const inhoud = document.getElementById('inhoud');
const SOORT = { naam: 'naam', uitleg: 'uitleg' };
const FILTER = { open: 'Nog na te lezen', ontbreekt: 'Nog niet vertaald', nagelezen: 'Nagelezen', alles: 'Alles' };
const RTL = new Set(['ar']);
let data = null;
let lezen = null; // { taal, filter, zoek, van, totaal, rijen }
let kijker = null;

function el(tag, eig, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eig || {})) {
    if (v == null || v === false) continue;
    if (k === 'tekst') e.textContent = v;
    else if (k === 'klas') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}
const datum = (t) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

async function api(pad, body) {
  const r = await fetch(pad, body ? { method: 'POST', headers: { ...HDR, 'content-type': 'application/json' }, body: JSON.stringify(body) } : { headers: HDR, cache: 'no-cache' });
  let d = null;
  try { d = await r.json(); } catch {}
  if (!r.ok) throw new Error((d && d.fout) || (r.status === 403 ? 'Je account mag de vertalingen niet zien. Vraag om het recht "Vertalingen".' : 'Er ging iets mis (' + r.status + ').'));
  return d;
}
async function laad() {
  try { data = await api('/api/beheer/vertalingen'); teken(); volgRonde(); }
  catch (f) { inhoud.replaceChildren(el('p', { klas: 'fout', tekst: f.message })); }
}
async function laadLijst() {
  const q = new URLSearchParams({ taal: lezen.taal, filter: lezen.filter, zoek: lezen.zoek, van: String(lezen.van), aantal: '50' });
  const d = await api('/api/beheer/vertalingen/lijst?' + q);
  lezen.totaal = d.totaal;
  lezen.rijen = d.rijen;
}

function volgRonde() {
  clearTimeout(kijker);
  if (data && data.ronde && !data.ronde.klaar) kijker = setTimeout(async () => { try { data = await api('/api/beheer/vertalingen'); teken(); } catch {} volgRonde(); }, 3000);
}

function teken() {
  inhoud.replaceChildren(...[
    el('div', { klas: 'status' },
      el('span', { klas: 'pil' + (data.ai ? ' aan' : ''), title: data.ai ? '' : 'Zonder ANTHROPIC_API_KEY op de server kan Fysiplan niet vooraf vertalen. Nalezen kan wel.' },
        el('i'), data.ai ? 'Vooraf vertalen kan' : 'Vooraf vertalen staat uit (geen AI-sleutel)')),
    el('h2', {}, 'Per taal'), talenKaart(),
    lezen ? [el('h2', {}, 'Nalezen: ' + (data.talen.find((t) => t.code === lezen.taal) || {}).naam), leesKaart()] : null
  ].flat().filter(Boolean));
}

function talenKaart() {
  const r = data.ronde;
  const loopt = r && !r.klaar;
  const open = data.talen.reduce((s, t) => s + (t.totaal - t.vertaald), 0);
  return el('section', { klas: 'kaart' },
    el('table', {},
      el('thead', {}, el('tr', {}, el('th', { tekst: 'Taal' }), el('th', { tekst: 'Vertaald' }), el('th', { tekst: 'Nagelezen' }), el('th', { tekst: '' }), el('th', { tekst: '' }))),
      el('tbody', {}, data.talen.map((t) => el('tr', {},
        el('td', {}, el('b', { tekst: t.naam })),
        el('td', { klas: 'num', tekst: t.vertaald + ' van ' + t.totaal }),
        el('td', { klas: 'num' }, el('div', { klas: 'balk', title: pct(t.nagelezen, t.totaal) + '%' }, el('i', { style: 'width:' + pct(t.nagelezen, t.totaal) + '%' })), t.nagelezen + ' (' + pct(t.nagelezen, t.totaal) + '%)'),
        el('td', {}, el('button', { klas: 'knop klein', type: 'button', onclick: () => openLezen(t.code) }, 'Nalezen')),
        el('td', {}, t.vertaald < t.totaal && data.ai
          ? el('button', { klas: 'knop klein', type: 'button', disabled: loopt, onclick: () => vooraf(t.code) }, 'Vertaal ' + (t.totaal - t.vertaald) + ' teksten')
          : null))))),
    el('div', { klas: 'ronde' },
      el('small', {}, rondeTekst(r, open)),
      loopt ? el('button', { klas: 'knop', type: 'button', onclick: stop }, 'Stoppen')
        : data.ai && open ? el('button', { klas: 'knop hoofd', type: 'button', onclick: () => vooraf('alle') }, 'Alle talen vooraf vertalen') : null));
}
function rondeTekst(r, open) {
  if (!r) return open ? open + ' teksten hebben nog geen vertaling. Vooraf vertalen kost bij de AI-dienst naar schatting minder dan tien euro voor alle talen samen, en gebeurt alleen voor wat ontbreekt.' : 'Alle teksten hebben een vertaling.';
  const naam = (data.talen.find((t) => t.code === r.taal) || {}).naam || r.taal;
  if (!r.klaar) return 'Bezig met ' + naam + ': ' + r.gedaan + ' van ' + r.totaal + ' teksten vertaald' + (r.mislukt ? ', ' + r.mislukt + ' mislukt' : '') + '.';
  return 'Laatste ronde: ' + r.gedaan + ' van ' + r.totaal + ' teksten vertaald' + (r.mislukt ? ', ' + r.mislukt + ' mislukt' : '') + '. ' + (r.fout || 'Klaar.');
}
async function vooraf(taal) {
  try { await api('/api/beheer/vertalingen/vooraf', { taal }); data = await api('/api/beheer/vertalingen'); teken(); volgRonde(); }
  catch (f) { alert(f.message); }
}
async function stop() {
  try { await api('/api/beheer/vertalingen/stop', {}); } catch {}
}

async function openLezen(taal) {
  lezen = { taal, filter: 'open', zoek: '', van: 0, totaal: 0, rijen: [] };
  try { await laadLijst(); } catch (f) { alert(f.message); }
  teken();
  document.querySelector('#lezen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function herlaad() {
  try { await laadLijst(); } catch (f) { alert(f.message); return; }
  teken();
}

function leesKaart() {
  const zoek = el('input', { type: 'search', placeholder: 'Zoek op oefening of tekst', value: lezen.zoek, 'aria-label': 'Zoeken' });
  let wacht = null;
  zoek.addEventListener('input', () => { clearTimeout(wacht); wacht = setTimeout(() => { lezen.zoek = zoek.value; lezen.van = 0; herlaad(); }, 300); });
  const filter = el('select', { 'aria-label': 'Welke teksten', onchange: (e) => { lezen.filter = e.target.value; lezen.van = 0; herlaad(); } },
    Object.entries(FILTER).map(([k, v]) => el('option', { value: k, selected: k === lezen.filter }, v)));
  return el('section', { klas: 'kaart', id: 'lezen' },
    el('div', { klas: 'filters' }, filter, zoek, el('span', { klas: 'pil', tekst: lezen.totaal + ' teksten' })),
    lezen.rijen.length ? lezen.rijen.map(rij) : el('div', { klas: 'leeg', tekst: lezen.filter === 'open' ? 'Er wacht hier niets op nalezen.' : 'Geen teksten.' }),
    lezen.totaal > lezen.van + lezen.rijen.length || lezen.van > 0
      ? el('div', { klas: 'meer' },
        lezen.van > 0 ? el('button', { klas: 'knop klein', type: 'button', onclick: () => { lezen.van = Math.max(0, lezen.van - 50); herlaad(); } }, 'Vorige 50') : null,
        el('span', { tekst: (lezen.van + 1) + '–' + (lezen.van + lezen.rijen.length) + ' van ' + lezen.totaal }),
        lezen.totaal > lezen.van + lezen.rijen.length ? el('button', { klas: 'knop klein', type: 'button', onclick: () => { lezen.van += 50; herlaad(); } }, 'Volgende 50') : null)
      : null);
}

function rij(x) {
  const veld = el('textarea', { 'aria-label': 'Vertaling', dir: RTL.has(lezen.taal) ? 'rtl' : 'auto', lang: lezen.taal, value: x.vertaling, placeholder: 'Nog geen vertaling: typ hem hier.' });
  const melding = el('small');
  const bewaar = async (pad, body) => {
    melding.textContent = 'Bewaren…';
    try {
      const d = await api(pad, body);
      Object.assign(x, d.rij);
      // de telling per taal bijwerken; de rij blijft in de lijst staan tot je verder gaat
      try { data = await api('/api/beheer/vertalingen'); } catch {}
      teken();
      return;
    } catch (f) { melding.textContent = f.message; melding.className = 'fout'; }
  };
  const blok = el('div', { klas: 'tekst' },
    el('div', { klas: 'oef' }, el('b', { tekst: x.oef }), el('span', { klas: 'chip', tekst: SOORT[x.soort] || x.soort }),
      x.nagelezen ? el('span', { klas: 'chip ok', tekst: 'nagelezen' }) : null),
    el('div', { klas: 'nl', lang: 'nl', tekst: x.nl }),
    el('div', {}, veld,
      el('div', { klas: 'acties' },
        el('button', { klas: 'knop klein hoofd', type: 'button', onclick: () => bewaar('/api/beheer/vertalingen/nagelezen', { taal: lezen.taal, sleutel: x.sleutel, vertaling: veld.value }) },
          x.nagelezen ? 'Wijziging bewaren' : 'Klopt, nagelezen'),
        x.nagelezen ? el('button', { klas: 'knop klein', type: 'button', onclick: () => bewaar('/api/beheer/vertalingen/intrekken', { taal: lezen.taal, sleutel: x.sleutel }) }, 'Toch niet nagelezen') : null,
        x.nagelezen && x.op ? el('small', { tekst: 'Nagelezen door ' + (x.wie || 'onbekend') + ' op ' + datum(x.op) }) : null,
        melding)));
  return blok;
}

laad();
