// Beheerpagina van de ideeënbox: /dashboard88/ideeen (server: lib/ideeen-routes.js).
// Inloggen gaat zoals op de andere beheerpagina's (public/beheersleutel.js).
import { vraagBeheersleutel } from '/beheersleutel.js';

const HDR = { 'x-admin-sleutel': await vraagBeheersleutel() };
const inhoud = document.getElementById('inhoud');
let data = null;
const open = new Map(); // id -> 'afwijzen' | 'niet-nu' | 'wijzig' (welk invulveld open staat)

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
const datum = (t) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });
const STAND = { open: 'Doet mee', voorgesteld: 'Wacht op jou', gepland: 'Gepland', gebouwd: 'Gebouwd', 'niet-nu': 'Niet nu', afgewezen: 'Afgewezen' };
const ADVIES = { bouwen: 'Bouwen', 'niet-nu': 'Niet nu', afwijzen: 'Afwijzen' };

async function api(pad, body) {
  const r = await fetch(pad, body ? { method: 'POST', headers: { ...HDR, 'content-type': 'application/json' }, body: JSON.stringify(body) } : { headers: HDR, cache: 'no-cache' });
  let d = null;
  try { d = await r.json(); } catch {}
  if (!r.ok) throw new Error((d && d.fout) || 'Er ging iets mis (' + r.status + ').');
  return d;
}
async function laad() {
  try { data = await api('/api/beheer/ideeen'); teken(); }
  catch (f) { inhoud.replaceChildren(el('p', { klas: 'fout', tekst: f.message })); }
}

function teken() {
  const ideeen = new Map(data.ideeen.map((i) => [i.id, i]));
  const wachtend = data.voorstellen.filter((v) => v.ideeen.some((x) => (ideeen.get(x.id) || {}).stand === 'voorgesteld'));
  const eerder = data.voorstellen.filter((v) => !wachtend.includes(v)).slice(0, 3);
  const gepland = data.ideeen.filter((i) => i.stand === 'gepland');
  inhoud.replaceChildren(...[
    el('div', { klas: 'status' },
      el('span', { klas: 'pil' + (data.ai ? ' aan' : ''), title: data.ai ? 'IDEEEN_AI staat aan' : 'Zet IDEEEN_AI=aan op de server (met ANTHROPIC_API_KEY) zodra de privacytekst het taalmodel noemt.' },
        el('i'), data.ai ? 'Agent schrijft mee met taalmodel' : 'Agent zonder taalmodel: top 4 op stemmen'),
      el('span', { klas: 'pil' + (data.mail ? ' aan' : '') }, el('i'), data.mail ? 'Mail bij een nieuwe top 4' : 'Mail staat uit'),
      data.kapot ? el('span', { klas: 'pil fout', tekst: 'ideeen.json is niet te lezen: er wordt niets bewaard' }) : null),
    el('h2', {}, 'Wacht op jouw keuze', data.wacht ? el('span', { klas: 'n', tekst: String(data.wacht) }) : null),
    wachtend.length ? wachtend.map((v) => voorstelKaart(v, ideeen)) : el('div', { klas: 'kaart leeg', tekst: 'Er wacht niets op je. Sluit de ronde hieronder eerder als je niet tot de 1e wilt wachten.' }),
    el('h2', {}, 'Deze ronde'), rondeKaart(),
    gepland.length ? [el('h2', {}, 'Gepland', el('span', { klas: 'n', tekst: String(gepland.length) })), geplandKaart(gepland)] : null,
    eerder.length ? [el('h2', {}, 'Eerdere voorstellen'), eerder.map((v) => voorstelKaart(v, ideeen))] : null,
    el('h2', {}, 'Alle ideeën'), alleKaart()
  ].flat(Infinity).filter(Boolean));
}

function voorstelKaart(v, ideeen) {
  const agent = v.agent || {};
  return el('section', { klas: 'kaart', style: 'margin-bottom:14px' },
    el('div', { klas: 'voorstel-kop' },
      el('b', { tekst: 'Top ' + v.ideeen.length + ' van ' + (v.maand || 'ronde ' + v.ronde) }),
      el('span', { tekst: (v.hoe === 'beheer' ? 'Eerder gesloten op ' : 'Gesloten op ') + datum(v.t) }),
      el('span', { klas: 'rechts', tekst: agent.bron === 'taalmodel' ? 'Toelichting door de agent (taalmodel)' : 'Gekozen met de rekenregel' })),
    agent.fout ? el('p', { klas: 'fout', style: 'padding:8px 20px 0;margin:0', tekst: agent.fout }) : null,
    v.ideeen.map((x) => ideeRij(x, ideeen.get(x.id), agent)));
}

function ideeRij(x, i, agent) {
  const a = agent && agent.teksten ? agent.teksten[x.id] : null;
  const zichtbaar = i || { stand: 'weg', titel: x.titel };
  return el('div', { klas: 'idee' },
    el('div', { klas: 'plek', tekst: String(x.plek) }),
    el('div', {},
      el('div', { klas: 'titel', tekst: x.titel }),
      i && i.tekst ? el('div', { klas: 'tekst', tekst: i.tekst }) : null,
      el('div', { klas: 'cijfers', tekst: x.op + ' omhoog · ' + x.neer + ' omlaag · score ' + x.score + ' · ' + x.praktijken + (x.praktijken === 1 ? ' praktijk' : ' praktijken') + (i && i.verborgen ? ' · verborgen' : '') }),
      a ? el('div', { klas: 'agent' },
        el('div', { klas: 'kop' }, 'Agent', a.advies ? el('span', { klas: 'chip ' + a.advies, tekst: 'Advies: ' + ADVIES[a.advies] }) : null),
        el('dl', {},
          a.samenvatting ? [el('dt', { tekst: 'Vraag' }), el('dd', { tekst: a.samenvatting })] : null,
          a.grootte ? [el('dt', { tekst: 'Grootte' }), el('dd', { tekst: a.grootte + ' (schatting)' })] : null,
          a.letOp ? [el('dt', { tekst: 'Let op' }), el('dd', { tekst: a.letOp })] : null,
          a.waarom ? [el('dt', { tekst: 'Waarom' }), el('dd', { tekst: a.waarom })] : null,
          a.lijktOp && a.lijktOp.length ? [el('dt', { tekst: 'Lijkt op' }), el('dd', { tekst: a.lijktOp.join(' · ') })] : null)) : null),
    acties(zichtbaar, x.id));
}

function acties(i, id) {
  if (i.stand === 'weg') return el('div', { klas: 'besloten', tekst: 'Dit idee is gewist.' });
  const modus = open.get(id);
  if (i.stand !== 'voorgesteld' && modus !== 'wijzig') {
    return el('div', { klas: 'acties besloten' },
      el('span', { klas: 'chip ' + i.stand, tekst: STAND[i.stand] || i.stand }),
      i.besluit ? el('span', { tekst: datum(i.besluit.t) + ' door ' + i.besluit.wie }) : null,
      i.reden ? el('span', { tekst: '“' + i.reden + '”' }) : null,
      i.stand === 'gepland' ? el('button', { type: 'button', klas: 'knop klein hoofd', tekst: 'Markeer als gebouwd', onclick: () => besluit(id, 'gebouwd') }) : null,
      el('button', { type: 'button', klas: 'knop klein', tekst: 'Ander besluit', onclick: () => { open.set(id, 'wijzig'); teken(); } }));
  }
  if (modus === 'afwijzen' || modus === 'niet-nu') {
    const veld = el('textarea', { 'aria-label': 'Reden', maxlength: '300', placeholder: modus === 'afwijzen' ? 'Waarom niet? Bijvoorbeeld: kan al via Kaarten delen.' : 'Waarom later? (mag leeg)' });
    const fout = el('div', { klas: 'fout', role: 'alert' });
    return el('div', { klas: 'acties reden' },
      veld,
      el('small', { tekst: 'De therapeuten zien deze zin bij het idee.' }),
      el('button', { type: 'button', klas: 'knop hoofd', tekst: modus === 'afwijzen' ? 'Afwijzen' : 'Niet nu', onclick: () => besluit(id, modus, veld.value, fout) }),
      el('button', { type: 'button', klas: 'knop klein', tekst: 'Annuleren', onclick: () => { open.delete(id); teken(); } }),
      fout);
  }
  return el('div', { klas: 'acties' },
    el('button', { type: 'button', klas: 'knop hoofd', tekst: 'Bouwen', onclick: () => besluit(id, 'bouwen') }),
    el('button', { type: 'button', klas: 'knop', tekst: 'Niet nu…', onclick: () => { open.set(id, 'niet-nu'); teken(); } }),
    el('button', { type: 'button', klas: 'knop', tekst: 'Afwijzen…', onclick: () => { open.set(id, 'afwijzen'); teken(); } }),
    modus === 'wijzig' ? el('button', { type: 'button', klas: 'knop klein', tekst: 'Annuleren', onclick: () => { open.delete(id); teken(); } }) : null);
}

async function besluit(id, wat, reden, foutVak) {
  try {
    await api('/api/beheer/ideeen/besluit', { id, besluit: wat, reden: reden || '' });
    open.delete(id);
    await laad();
  } catch (f) { if (foutVak) foutVak.textContent = f.message; else alert(f.message); }
}

function rondeKaart() {
  const r = data.ronde;
  const doen = data.ideeen.filter((i) => i.stand === 'open' && !i.verborgen);
  const stemmen = doen.reduce((n, i) => n + i.op + i.neer, 0);
  const top = data.top.map((id) => data.ideeen.find((i) => i.id === id)).filter(Boolean);
  const knop = el('button', { type: 'button', klas: 'knop', tekst: 'Ronde nu sluiten', onclick: async () => {
    if (!confirm('Ronde ' + r.nr + ' nu sluiten? De top ' + top.length + ' komt dan bij "Wacht op jouw keuze" en een nieuwe ronde begint.')) return;
    knop.disabled = true;
    try { await api('/api/beheer/ideeen/ronde-sluiten', { ronde: r.nr }); await laad(); } catch (f) { alert(f.message); knop.disabled = false; }
  } });
  return el('section', { klas: 'kaart' },
    el('div', { klas: 'ronde' },
      el('div', {}, el('b', { tekst: String(r.nr) }), el('span', { tekst: 'ronde, sinds ' + datum(r.start) })),
      el('div', {}, el('b', { tekst: String(doen.length) }), el('span', { tekst: 'ideeën doen mee' })),
      el('div', {}, el('b', { tekst: String(stemmen) }), el('span', { tekst: 'stemmen' })),
      el('div', {}, el('b', { tekst: datum(r.eind).replace(/ \d{4}$/, '') }), el('span', { tekst: 'de agent kiest de top ' + r.top })) ),
    top.length ? el('table', {},
      el('thead', {}, el('tr', {}, el('th', { tekst: 'Top ' + r.top + ' nu' }), el('th', { tekst: 'Omhoog' }), el('th', { tekst: 'Omlaag' }), el('th', { tekst: 'Praktijken' }))),
      el('tbody', {}, top.map((i) => el('tr', {}, el('td', { tekst: i.titel }), el('td', { klas: 'num', tekst: String(i.op) }), el('td', { klas: 'num', tekst: String(i.neer) }), el('td', { klas: 'num', tekst: String(i.praktijken) })))))
      : el('p', { klas: 'leeg', tekst: 'Nog geen idee met meer stemmen omhoog dan omlaag.' }),
    el('div', { klas: 'ronde-voet' }, el('small', { tekst: 'Bij gelijke stand gaat het idee met meer stemmen omhoog voor, daarna het oudste.' }), knop));
}

function geplandKaart(lijst) {
  return el('section', { klas: 'kaart' }, el('table', {},
    el('tbody', {}, lijst.map((i) => el('tr', {},
      el('td', {}, el('b', { tekst: i.titel }), i.besluit ? el('div', { klas: 'besloten', tekst: 'Gepland op ' + datum(i.besluit.t) }) : null),
      el('td', { style: 'text-align:right' }, el('button', { type: 'button', klas: 'knop klein hoofd', tekst: 'Markeer als gebouwd', onclick: () => besluit(i.id, 'gebouwd') })))))));
}

function alleKaart() {
  const lijst = data.ideeen.slice().sort((a, b) => b.t - a.t);
  if (!lijst.length) return el('div', { klas: 'kaart leeg', tekst: 'Nog geen ideeën. Ze verschijnen hier zodra een therapeut er een plaatst (knop "Ideeën" bovenin de app).' });
  return el('section', { klas: 'kaart' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', { tekst: 'Idee' }), el('th', { tekst: 'Score' }), el('th', { tekst: 'Stand' }), el('th', { tekst: 'Geplaatst' }), el('th', {}))),
    el('tbody', {}, lijst.map((i) => el('tr', { klas: i.verborgen ? 'verborgen' : '' },
      el('td', {}, el('div', { tekst: i.titel }), i.reden ? el('div', { klas: 'besloten', tekst: '“' + i.reden + '”' }) : null),
      el('td', { klas: 'num', tekst: i.score + ' (' + i.op + '/' + i.neer + ')' }),
      el('td', {}, el('span', { klas: 'chip ' + i.stand, tekst: STAND[i.stand] || i.stand })),
      el('td', { klas: 'num', tekst: datum(i.t) }),
      el('td', { style: 'text-align:right' }, el('button', { type: 'button', klas: 'knop klein', tekst: i.verborgen ? 'Weer tonen' : 'Verbergen',
        title: i.verborgen ? 'Weer zichtbaar voor de praktijken' : 'Verbergen voor de praktijken (bijvoorbeeld als er persoonsgegevens in staan)',
        onclick: async () => { try { await api('/api/beheer/ideeen/verberg', { id: i.id, verborgen: !i.verborgen }); await laad(); } catch (f) { alert(f.message); } } })))))));
}

laad();
