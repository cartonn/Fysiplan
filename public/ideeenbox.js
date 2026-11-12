// De ideeënbox in /v2/app (knop "Ideeën" in de kopbalk en Hulp → Ideeënbox).
// Therapeuten en beheerders plaatsen ideeën voor Fysiplan en stemmen omhoog of omlaag. Aan het
// eind van de maand gaat de top 4 naar Fysiplan; wat Fysiplan besluit, staat hier terug.
// De server staat in lib/ideeen-routes.js. Geen inline handlers (CSP), alle tekst via textContent.

const VAN = { jij: 'Jouw idee', praktijk: 'Collega uit je praktijk', ander: 'Een therapeut' };
const TABS = [
  { id: 'stemmen', t: 'Stemmen', leeg: '' },
  { id: 'voorgesteld', t: 'Ligt bij Fysiplan', uitleg: 'De top 4 van de vorige ronde. Fysiplan beslist binnenkort wat er gebouwd wordt.' },
  { id: 'gepland', t: 'Gepland', uitleg: 'Fysiplan gaat dit bouwen.' },
  { id: 'gebouwd', t: 'Gebouwd', uitleg: 'Dit zit nu in Fysiplan. Dank aan wie het bedacht en erop stemde.' },
  { id: 'niet', t: 'Niet gekozen', uitleg: 'Fysiplan bouwt dit (nu) niet. Bij "Niet nu" doet het idee over drie rondes weer mee.' }
];
const tabVan = (i) => i.stand === 'open' ? 'stemmen' : i.stand === 'voorgesteld' ? 'voorgesteld' : i.stand === 'gepland' ? 'gepland' : i.stand === 'gebouwd' ? 'gebouwd' : 'niet';

let dlg = null;
let formEl = null; // het invulblok blijft hetzelfde element, zodat stemmen nooit getypte tekst wist
const st = { ideeen: [], ronde: null, tab: 'stemmen', sort: 'top', open: new Set(), laden: false, fout: '' };

function el(tag, eig, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eig || {})) {
    if (v == null || v === false) continue;
    if (k === 'tekst') e.textContent = v;
    else if (k === 'klas') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}
const svg = (pad) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = pad; return s; };
const PIJL_OP = "<path d='M12 5l7 8h-4.5v6h-5v-6H5z' fill='currentColor'/>";
const PIJL_NEER = "<path d='M12 19l-7-8h4.5V5h5v6H19z' fill='currentColor'/>";

function wanneer(t) {
  const dg = Math.floor((Date.now() - t) / 864e5);
  if (dg <= 0) return 'vandaag';
  if (dg === 1) return 'gisteren';
  if (dg < 30) return dg + ' dagen geleden';
  return new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
}
const datum = (t) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' });
function rondeZin(r) {
  if (!r) return '';
  const dagen = Math.max(0, Math.ceil((r.eind - Date.now()) / 864e5));
  return dagen <= 1 ? 'De ronde sluit morgen' : 'Nog ' + dagen + ' dagen';
}

async function api(pad, body) {
  const o = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-cache' };
  const r = await fetch(pad, o);
  let d = null;
  try { d = await r.json(); } catch {}
  if (!r.ok) { const f = new Error((d && d.fout) || 'Er ging iets mis. Probeer het zo opnieuw.'); f.status = r.status; throw f; }
  return d;
}

function stijl() {
  if (document.getElementById('idb-stijl')) return;
  document.head.append(el('link', { id: 'idb-stijl', rel: 'stylesheet', href: '/ideeenbox.css?v=1' }));
}

// ---- het venster ----
function bouw() {
  stijl();
  dlg = el('dialog', { klas: 'idb no-print', 'aria-labelledby': 'idb_titel' });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
}

function teken() {
  const r = st.ronde;
  dlg.replaceChildren(
    el('div', { klas: 'idb-kop' },
      el('div', {},
        el('div', { klas: 'idb-eyebrow' }, 'Ideeënbox', r ? el('span', { klas: 'idb-ronde' }, ' · ' + rondeZin(r)) : null),
        el('h2', { id: 'idb_titel', tekst: 'Wat moet Fysiplan als volgende bouwen?' }),
        el('p', { tekst: r
          ? 'Plaats een idee of stem op dat van een ander. Op ' + datum(r.eind) + ' gaat de top ' + r.top + ' naar Fysiplan. Daar wordt beslist wat er gebouwd wordt, en dat zie je hier terug.'
          : 'Plaats een idee of stem op dat van een ander.' })),
      el('button', { type: 'button', klas: 'idb-x', 'aria-label': 'Sluiten', onclick: () => dlg.close(), tekst: '×' })),
    ...(st.fout === 'login' ? [loginBlok()] : [formEl || (formEl = invoer()), tabs(), lijst()])
  );
}

function loginBlok() {
  return el('div', { klas: 'idb-leeg idb-login' },
    el('b', { tekst: 'Log in bij je praktijk' }),
    el('p', { tekst: 'De ideeënbox hoort bij je eigen login, zodat elke therapeut één stem heeft.' }),
    el('button', { type: 'button', klas: 'btn primary', tekst: 'Naar inloggen', onclick: () => { dlg.close(); const k = document.getElementById('kaartenBtn'); if (k) k.click(); } }));
}

// ---- nieuw idee ----
let lijktTimer = 0, lijktVraag = 0;
function invoer() {
  const titel = el('input', { type: 'text', id: 'idb_titelveld', maxlength: '120', autocomplete: 'off', placeholder: 'Wat zou je werk makkelijker maken?', 'aria-label': 'Je idee in één zin' });
  const tekst = el('textarea', { id: 'idb_tekst', maxlength: '1000', rows: '3', placeholder: 'Toelichting (mag leeg): welk probleem lost het op, en wanneer loop je ertegenaan?', 'aria-label': 'Toelichting' });
  const lijkt = el('div', { klas: 'idb-lijkt', 'aria-live': 'polite' });
  const melding = el('div', { klas: 'idb-melding', role: 'status' });
  const knop = el('button', { type: 'submit', klas: 'btn primary', tekst: 'Idee plaatsen', disabled: true });
  const meer = el('div', { klas: 'idb-meer', hidden: true },
    tekst,
    el('div', { klas: 'idb-voet' },
      el('small', { tekst: 'Iedereen die Fysiplan gebruikt kan je idee lezen. Je naam en praktijk staan er niet bij. Schrijf er geen patiëntgegevens in.' }),
      knop));
  const form = el('form', { klas: 'idb-nieuw', onsubmit: async (e) => {
    e.preventDefault();
    knop.disabled = true; melding.textContent = '';
    try {
      const d = await api('/api/ideeen', { titel: titel.value, tekst: tekst.value });
      st.ideeen.unshift(d.idee);
      st.tab = 'stemmen'; st.sort = 'nieuw';
      titel.value = ''; tekst.value = ''; lijkt.replaceChildren(); meer.hidden = true;
      teken();
      melding.textContent = 'Geplaatst. Je eigen stem staat er al op.'; melding.className = 'idb-melding goed';
    } catch (f) { melding.textContent = f.message; melding.className = 'idb-melding fout'; knop.disabled = false; }
  } }, titel, lijkt, meer, melding);
  const bij = () => {
    const genoeg = titel.value.trim().length >= 4;
    knop.disabled = !genoeg;
    if (titel.value.trim() || document.activeElement === titel) meer.hidden = false;
    clearTimeout(lijktTimer);
    const q = (titel.value + ' ' + tekst.value).trim();
    if (q.length < 6) { lijkt.replaceChildren(); return; }
    lijktTimer = setTimeout(async () => {
      const nr = ++lijktVraag;
      try {
        const d = await api('/api/ideeen/lijkt?q=' + encodeURIComponent(q.slice(0, 600)));
        if (nr !== lijktVraag) return;
        if (!d.ideeen.length) { lijkt.replaceChildren(); return; }
        lijkt.replaceChildren(el('div', { klas: 'idb-lijkt-kop', tekst: d.ideeen.length === 1 ? 'Lijkt op een idee dat er al staat. Stem daar liever op:' : 'Lijkt op ideeën die er al staan. Stem daar liever op:' }),
          ...d.ideeen.map((i) => rij(vervang(i), true)));
      } catch {}
    }, 280);
  };
  titel.addEventListener('input', bij);
  tekst.addEventListener('input', bij);
  titel.addEventListener('focus', () => { meer.hidden = false; });
  titel.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!knop.disabled) tekst.focus(); } });
  return form;
}
// het idee uit de lijst als dat er al is (zelfde stand), anders het binnengekomen idee
function vervang(i) { const al = st.ideeen.find((x) => x.id === i.id); return al || i; }

// ---- tabbladen ----
function tabs() {
  const tel = {};
  for (const i of st.ideeen) tel[tabVan(i)] = (tel[tabVan(i)] || 0) + 1;
  const zicht = TABS.filter((t) => t.id === 'stemmen' || tel[t.id]);
  if (!zicht.some((t) => t.id === st.tab)) st.tab = 'stemmen';
  const balk = el('div', { klas: 'idb-tabs', role: 'tablist', 'aria-label': 'Ideeën' },
    zicht.map((t) => el('button', { type: 'button', role: 'tab', 'aria-selected': st.tab === t.id ? 'true' : 'false', klas: st.tab === t.id ? 'aan' : '',
      onclick: () => { st.tab = t.id; teken(); dlg.querySelector('.idb-tabs [aria-selected="true"]')?.focus(); } },
    t.t, el('span', { klas: 'idb-tel', tekst: String(tel[t.id] || 0) }))));
  if (st.tab === 'stemmen') {
    balk.append(el('div', { klas: 'idb-sort', role: 'group', 'aria-label': 'Volgorde' },
      ['top', 'nieuw'].map((s) => el('button', { type: 'button', 'aria-pressed': st.sort === s ? 'true' : 'false', klas: st.sort === s ? 'aan' : '',
        tekst: s === 'top' ? 'Meeste stemmen' : 'Nieuwste', onclick: () => { st.sort = s; teken(); } }))));
  }
  return balk;
}
function rangorde(a, b) { return b.score - a.score || b.op - a.op || a.t - b.t || (a.id < b.id ? -1 : 1); }

function lijst() {
  const tab = TABS.find((t) => t.id === st.tab);
  let rijen = st.ideeen.filter((i) => tabVan(i) === st.tab);
  rijen.sort(st.tab === 'stemmen' && st.sort === 'nieuw' ? (a, b) => b.t - a.t : st.tab === 'stemmen' ? rangorde : (a, b) => (b.besloten || b.t) - (a.besloten || a.t));
  const kader = el('div', { klas: 'idb-lijst', role: 'tabpanel' });
  if (st.laden && !st.ideeen.length) { kader.append(el('div', { klas: 'idb-leeg', tekst: 'Ideeën laden…' })); return kader; }
  if (st.fout) { kader.append(el('div', { klas: 'idb-leeg fout', tekst: st.fout })); return kader; }
  if (tab.uitleg) kader.append(el('p', { klas: 'idb-uitleg', tekst: tab.uitleg }));
  if (!rijen.length) {
    kader.append(el('div', { klas: 'idb-leeg' },
      el('b', { tekst: 'Er staan nog geen ideeën.' }),
      el('p', { tekst: 'Wat mis je in Fysiplan, of wat kost je nu onnodig tijd? Het eerste idee van de ronde begint bovenaan.' })));
    return kader;
  }
  const lijn = st.tab === 'stemmen' && st.sort === 'top' ? rijen.filter((i) => i.top).length : 0;
  rijen.forEach((i, n) => {
    kader.append(rij(i, false));
    if (lijn && n === lijn - 1 && n < rijen.length - 1) kader.append(el('div', { klas: 'idb-grens', role: 'separator' },
      el('span', { tekst: 'Tot hier gaat het door naar Fysiplan' + (st.ronde ? ' op ' + datum(st.ronde.eind) : '') })));
  });
  if (st.tab === 'stemmen' && st.sort === 'top' && !lijn && rijen.length) {
    kader.append(el('p', { klas: 'idb-uitleg', tekst: 'Een idee gaat door als er meer stemmen omhoog dan omlaag op staan.' }));
  }
  return kader;
}

// ---- één idee ----
function rij(i, klein) {
  const lang = i.tekst && i.tekst.length > 160;
  const open = st.open.has(i.id);
  const body = el('div', { klas: 'idb-body' },
    el('div', { klas: 'idb-titel', tekst: i.titel }),
    i.tekst ? el('div', { klas: 'idb-tekst' + (lang && !open ? ' kort' : ''), tekst: i.tekst }) : null,
    lang && !klein ? el('button', { type: 'button', klas: 'idb-link', tekst: open ? 'Minder' : 'Lees verder', onclick: () => { open ? st.open.delete(i.id) : st.open.add(i.id); teken(); } }) : null,
    i.reden ? el('div', { klas: 'idb-reden' }, el('b', { tekst: 'Fysiplan: ' }), i.reden) : null,
    el('div', { klas: 'idb-meta' },
      i.top && i.stand === 'open' ? el('span', { klas: 'idb-chip top', tekst: 'Top ' + (st.ronde ? st.ronde.top : 4) }) : null,
      chip(i),
      el('span', { klas: i.van === 'jij' ? 'idb-van jij' : 'idb-van', tekst: VAN[i.van] || VAN.ander }),
      el('span', { klas: 'idb-punt', tekst: '·' }),
      el('span', { tekst: wanneer(i.t) }),
      i.magWeg && !klein ? [el('span', { klas: 'idb-punt', tekst: '·' }), el('button', { type: 'button', klas: 'idb-link', tekst: 'Weghalen', onclick: () => weg(i) })] : null));
  return el('div', { klas: 'idb-rij' + (klein ? ' klein' : '') + (i.van === 'jij' ? ' eigen' : ''), 'data-id': i.id }, stemBlok(i), body);
}
function chip(i) {
  const t = { voorgesteld: 'Ligt bij Fysiplan', gepland: 'Gepland', gebouwd: 'Gebouwd', 'niet-nu': 'Niet nu', afgewezen: 'Niet gekozen' }[i.stand];
  return t ? el('span', { klas: 'idb-chip ' + i.stand, tekst: t }) : null;
}
function stemBlok(i) {
  const titel = i.op + ' omhoog, ' + i.neer + ' omlaag';
  if (!i.kanStemmen) return el('div', { klas: 'idb-stem vast', title: titel }, el('b', { tekst: String(i.score) }), el('small', { tekst: 'stemmen' }));
  const knop = (w, pad, label) => el('button', { type: 'button', klas: 'idb-pijl ' + (w > 0 ? 'op' : 'neer'), 'aria-pressed': i.mijnStem === w ? 'true' : 'false',
    'aria-label': label + ': ' + i.titel, title: label, onclick: () => stem(i, i.mijnStem === w ? 0 : w) }, svg(pad));
  return el('div', { klas: 'idb-stem', title: titel },
    knop(1, PIJL_OP, 'Stem omhoog'),
    el('b', { 'aria-label': 'Stand: ' + i.score + ' (' + titel + ')', tekst: String(i.score) }),
    knop(-1, PIJL_NEER, 'Stem omlaag'));
}

async function stem(i, w) {
  const oud = { mijnStem: i.mijnStem, score: i.score, op: i.op, neer: i.neer };
  // meteen tonen; de server bevestigt of zet terug
  i.op += (w === 1) - (oud.mijnStem === 1); i.neer += (w === -1) - (oud.mijnStem === -1);
  i.mijnStem = w; i.score = i.op - i.neer;
  const focusId = i.id, richting = w || oud.mijnStem;
  teken(); herfocus(focusId, richting);
  try {
    const d = await api('/api/ideeen/stem', { id: i.id, stem: w });
    Object.assign(i, d.idee);
    const top = new Set(d.top || []);
    for (const x of st.ideeen) if (x.stand === 'open') x.top = top.has(x.id);
  } catch (f) {
    Object.assign(i, oud);
    if (f.status === 409 || f.status === 404) await laad();
    st.melding = f.message;
  }
  teken(); herfocus(focusId, richting); vernieuwLijkt();
  if (st.melding) { const m = dlg.querySelector('.idb-melding'); if (m) { m.textContent = st.melding; m.className = 'idb-melding fout'; } st.melding = ''; }
}
// de rijen onder "Lijkt op" staan in het invulblok, dat niet opnieuw getekend wordt
function vernieuwLijkt() {
  for (const r of dlg.querySelectorAll('.idb-lijkt .idb-rij')) {
    const i = st.ideeen.find((x) => x.id === r.getAttribute('data-id'));
    if (i) r.replaceWith(rij(i, true));
  }
}
// na opnieuw tekenen staat de focus weer op dezelfde stemknop (toetsenbord)
function herfocus(id, w) {
  const r = dlg.querySelector('.idb-lijst .idb-rij[data-id="' + id + '"] .idb-pijl.' + (w < 0 ? 'neer' : 'op'));
  if (r) r.focus();
}
async function weg(i) {
  if (!confirm('Dit idee weghalen? De stemmen erop gaan ook weg.')) return;
  try { await api('/api/ideeen/weg', { id: i.id }); st.ideeen = st.ideeen.filter((x) => x.id !== i.id); teken(); }
  catch (f) { alert(f.message); }
}

async function laad() {
  st.laden = true;
  try {
    const d = await api('/api/ideeen');
    st.ideeen = d.ideeen; st.ronde = d.ronde; st.fout = '';
  } catch (f) { st.fout = f.status === 401 ? 'login' : f.message; }
  st.laden = false;
}

export async function openIdeeenbox() {
  if (!dlg) bouw();
  st.tab = 'stemmen'; st.sort = 'top';
  teken();
  if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
  await laad();
  teken();
  if (!st.fout) { const v = document.getElementById('idb_titelveld'); if (v && !st.ideeen.length) v.focus(); }
}
