// Beheer- en finance-omgeving (/dashboard88/omgeving). Haalt alles op bij /api/beheer/omgeving
// en tekent de pagina's zelf; grafieken zijn eigen SVG zonder bibliotheek. Inloggen gaat via
// /beheersleutel.js, net als op de andere beheerpagina's.
import { vraagBeheersleutel } from '/beheersleutel.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = (cent, heel) => {
  const n = Math.round(Number(cent) || 0), neg = n < 0, a = Math.abs(n);
  const e = Math.floor(a / 100).toLocaleString('nl-NL');
  return (neg ? '−' : '') + '€ ' + (heel ? Math.round(a / 100).toLocaleString('nl-NL') : e + ',' + String(a % 100).padStart(2, '0'));
};
const kortEuro = (cent) => { const e = Math.abs(cent) / 100; return (cent < 0 ? '−' : '') + '€ ' + (e >= 10000 ? (e / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + 'k' : Math.round(e).toLocaleString('nl-NL')); };
const datum = (ms, opt) => ms ? new Date(ms).toLocaleDateString('nl-NL', opt || { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
const tijd = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const maandNaam = (m, lang) => new Date(m + '-15T12:00:00Z').toLocaleDateString('nl-NL', lang ? { month: 'long', year: 'numeric' } : { month: 'short' }).replace('.', '');
const geleden = (ms, nu) => {
  if (!ms) return 'nooit';
  const d = Math.floor((nu - ms) / 86400e3);
  if (d <= 0) { const u = Math.floor((nu - ms) / 3600e3); return u <= 0 ? 'net' : u + ' uur geleden'; }
  return d === 1 ? 'gisteren' : d + ' dagen geleden';
};
const STATUS = { klant: ['Klant', 'goed'], opgezegd: ['Opgezegd', 'aandacht'], gestopt: ['Gestopt', 'neutraal'], proef: ['Proef', 'petrol'], 'zonder-abonnement': ['Proef verlopen', 'neutraal'], v1: ['V1-demo', 'neutraal'] };
const STAND = { goed: 'Goed', aandacht: 'Aandacht', probleem: 'Probleem', nvt: 'Niet bewaakt' };
const aantal = (n, een, meer) => n + ' ' + (n === 1 ? een : meer);
const getal = (n) => Number(n).toLocaleString('nl-NL', { maximumFractionDigits: 1 });
const pil = (tekst, soort, kaal) => '<span class="pil ' + soort + (kaal ? ' kaal' : '') + '">' + esc(tekst) + '</span>';

const PAGINAS = {
  overzicht: ['Overzicht', 'Hoe het platform en de praktijken ervoor staan'],
  praktijken: ['Praktijken', 'Per praktijk de therapeuten, het gebruik en de health'],
  support: ['Support-agent', 'Wat de agent signaleert, voorstelt en oplost'],
  berichten: ['Berichten', 'Therapeuten en beheerders mailen bij een storing of onderhoud'],
  finance: ['Cijfers', 'Klanten, omzet, kosten en prognose'],
  facturen: ['Facturen en kosten', 'Wat er is gefactureerd, betaald en open staat'],
  btw: ['Btw-aangifte', 'Per kwartaal de rubrieken voor de aangifte omzetbelasting'],
  jaar: ['Jaarafsluiting', 'De accountant-agent loopt het boekjaar na']
};

let HDR = {};
let data = null;
let bron = 'echt';
try { if (localStorage.getItem('fp-beheer-bron') === 'demo') bron = 'demo'; } catch {}
// een link met ?bron=demo opent meteen de demo
{ const q = new URLSearchParams(location.search).get('bron'); if (q === 'demo' || q === 'echt') bron = q; }
const st = { filter: '', stand: '', factuurTab: 'alle', factuurBlad: 0, kostenAlle: false, jaar: null, ladePk: null, logAlles: false };
const PER_BLAD = 15;
const tip = $('#tip');

function toonTip(e, html) { tip.innerHTML = html; tip.style.opacity = 1; const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8); tip.style.left = x + 'px'; tip.style.top = (e.clientY - tip.offsetHeight - 12) + 'px'; }
function verbergTip() { tip.style.opacity = 0; }
function bindTips(el) {
  el.querySelectorAll('[data-tip]').forEach((n) => {
    n.addEventListener('mousemove', (e) => toonTip(e, n.dataset.tip));
    n.addEventListener('mouseleave', verbergTip);
  });
}
function melden(tekst, fout) {
  const m = $('#melding');
  m.textContent = tekst; m.className = 'melding' + (fout ? ' fout' : ''); m.hidden = false;
  clearTimeout(melden.t); melden.t = setTimeout(() => { m.hidden = true; }, fout ? 9000 : 4500);
}

async function haal() {
  const r = await fetch('/api/beheer/omgeving?bron=' + bron, { headers: HDR, cache: 'no-store' });
  if (r.status === 401 || r.status === 403) { try { sessionStorage.removeItem('fysiplan-beheersleutel'); } catch {} throw new Error('toegang'); }
  if (!r.ok) throw new Error('fout');
  data = await r.json();
  $('#bijgewerkt').textContent = 'bijgewerkt ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}
async function post(pad, body, stil) {
  const r = await fetch('/api/beheer/omgeving/' + pad, { method: 'POST', headers: { ...HDR, 'content-type': 'application/json' }, body: JSON.stringify({ bron, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { melden(j.fout || 'Dat lukte niet.', true); return null; }
  data = j;
  if (!stil) teken();
  return j;
}

function pagina() { const p = location.hash.slice(1); return Object.hasOwn(PAGINAS, p) ? p : 'overzicht'; }
function teken() {
  if (!data) return;
  const p = pagina();
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('aan', a.dataset.pagina === p));
  $('#titel').textContent = PAGINAS[p][0];
  $('#sub').textContent = PAGINAS[p][1];
  document.title = PAGINAS[p][0] + ' · Fysiplan Beheer';
  $('#demoband').hidden = bron !== 'demo';
  document.querySelectorAll('#bronSchakel button').forEach((b) => b.classList.toggle('aan', b.dataset.bron === bron));
  $('#bronUitleg').textContent = bron === 'demo' ? 'Verzonnen gegevens om de omgeving en de agents te testen.' : 'De gegevens van fysiplan.nl.';
  const problemen = data.zaken.filter((z) => z.ernst === 'probleem').length;
  $('#tSupport').textContent = problemen || '';
  const btwOpen = data.finance.btw.filter((b) => b.stand === 'te-doen' || b.stand === 'te-laat').length;
  $('#tBtw').textContent = btwOpen || '';
  const el = $('#pagina');
  el.innerHTML = ({ overzicht, praktijken, support, berichten, finance, facturen, btw, jaar })[p]();
  bindTips(el);
  ({ overzicht: bindOverzicht, praktijken: bindPraktijken, support: bindSupport, berichten: bindBerichten, finance: bindFinance, facturen: bindFacturen, btw: bindBtw, jaar: bindJaar })[p]?.(el);
  if (st.ladePk) tekenLade();
}

// ---------- bouwstenen ----------
const kpi = (l, w, s, held) => '<div class="kpi' + (held ? ' held' : '') + '"><div class="l">' + esc(l) + '</div><div class="w">' + w + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>';
const check = (ok, titel, tekst) => '<div class="check"><span class="ic ' + (ok === true ? 'goed' : ok === false ? 'fout' : 'weet') + '" aria-hidden="true">' + (ok === true ? '✓' : ok === false ? '!' : '?') + '</span><div><b>' + esc(titel) + '</b><small>' + esc(tekst) + '</small></div><span class="sr" hidden>' + (ok === true ? 'in orde' : ok === false ? 'niet in orde' : 'nakijken') + '</span></div>';

// Kaarten per week, twaalf weken, als kleine staafjes in een tabelrij. De laatste vier weken
// (de "30 dagen" ernaast) zijn donker, de acht ervoor licht: zo is een daling in één blik te zien.
function vonk(weken) {
  if (!weken || !weken.length) return '<span class="hint">–</span>';
  const max = Math.max(1, ...weken), B = 4, G = 2, H = 22, W = weken.length * (B + G) - G;
  const som = (a) => a.reduce((t, x) => t + x, 0);
  const tipHtml = '<b>Kaarten per week</b><div class="tr"><span>Laatste 4 weken</span><span>' + som(weken.slice(-4)) + '</span></div><div class="tr"><span>De 4 ervoor</span><span>' + som(weken.slice(-8, -4)) + '</span></div><div class="tr"><span>Hoogste week</span><span>' + max + '</span></div>';
  return '<svg class="vonk" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Kaarten per week over twaalf weken: ' + weken.join(', ') + '" data-tip="' + esc(tipHtml) + '">' +
    weken.map((n, i) => { const h = n ? Math.max(2, Math.round((H - 1) * n / max)) : 1; return '<rect x="' + i * (B + G) + '" y="' + (H - h) + '" width="' + B + '" height="' + h + '" rx="1" class="' + (i >= weken.length - 4 ? 'nu' : 'toen') + (n ? '' : ' nul') + '"/>'; }).join('') + '</svg>';
}
// staafjes over de volle breedte met een tip per staaf: [{ l: label in de tip, n: waarde }]
function staafjes(punten, { eenheid, klasse = '', hoogte = 64, label } = {}) {
  const max = Math.max(1, ...punten.map((p) => p.n));
  return '<div class="staafjes ' + klasse + '" style="height:' + hoogte + 'px" role="img" aria-label="' + esc(label + ': ' + punten.map((p) => p.n).join(', ')) + '">' +
    punten.map((p) => '<i class="' + (p.accent ? 'nu' : '') + (p.n ? '' : ' nul') + '" style="height:' + (p.n ? Math.max(6, 100 * p.n / max) : 3) + '%" data-tip="' + esc('<b>' + p.l + '</b><div class="tr"><span>' + eenheid + '</span><span>' + p.n + '</span></div>') + '"></i>').join('') + '</div>';
}
// wat de support-agent de laatste zeven dagen deed, uit zijn logboek
function weekVanAgent() {
  const sinds = data.nu - 7 * 86400e3, log = (data.agent.logboek || []).filter((x) => Date.parse(x.t) >= sinds);
  const tel = (wat) => log.filter((x) => x.wat === wat);
  return { gemaild: tel('gemaild').reduce((t, x) => t + (x.aan || 1), 0), opgelost: tel('opgelost').length, naMail: tel('opgelost').filter((x) => x.gemaild).length, nieuw: tel('nieuw').length };
}

// staafgrafiek met één of twee series; waarden in centen
function staven(maanden, series, { hoogte = 230 } = {}) {
  const W = 560, H = hoogte, L = 50, R = 6, T = 10, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const max = Math.max(1, ...maanden.flatMap((m) => series.map((s) => m[s.k])));
  const stap = netteStap(max / 4), top = stap * Math.ceil(max / stap);
  const g = iw / maanden.length, bw = Math.min(18, (g - 8 - (series.length - 1) * 2) / series.length);
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(series.map((s) => s.l).join(' en ')) + ' per maand">';
  for (let v = 0; v <= top; v += stap) { const y = T + ih - ih * v / top; svg += '<line class="' + (v ? 'rooster' : 'nul') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="as" x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + kortEuro(v) + '</text>'; }
  maanden.forEach((m, i) => {
    const x0 = L + i * g + (g - bw * series.length - (series.length - 1) * 2) / 2;
    series.forEach((s, j) => {
      const h = Math.max(0, ih * m[s.k] / top), x = x0 + j * (bw + 2), y = T + ih - h;
      if (h > 0.5) svg += '<path d="M' + x + ',' + (T + ih) + 'V' + (y + Math.min(4, h)) + 'q0,-' + Math.min(4, h) + ' ' + Math.min(4, bw / 2) + ',-' + Math.min(4, h) + 'H' + (x + bw - Math.min(4, bw / 2)) + 'q' + Math.min(4, bw / 2) + ',0 ' + Math.min(4, bw / 2) + ',' + Math.min(4, h) + 'V' + (T + ih) + 'z" fill="var(' + s.c + ')"/>';
    });
    const tipHtml = '<b>' + esc(maandNaam(m.maand, true)) + '</b>' + series.map((s) => '<div class="tr"><span>' + esc(s.l) + '</span><span>' + euro(m[s.k]) + '</span></div>').join('') + (m.facturen != null ? '<div class="tr"><span>Facturen</span><span>' + m.facturen + '</span></div>' : '');
    svg += '<rect class="doel" x="' + (L + i * g) + '" y="' + T + '" width="' + g + '" height="' + ih + '" data-tip="' + esc(tipHtml) + '"/>';
    svg += '<text class="as" x="' + (L + i * g + g / 2) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(maandNaam(m.maand)) + '</text>';
  });
  return '<div class="grafiek">' + svg + '</svg></div>';
}
function netteStap(x) { if (x <= 0) return 100; const p = Math.pow(10, Math.floor(Math.log10(x))); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

// lijn met bandbreedte voor de prognose, met de laatste zes echte maanden ervoor
// De lopende maand is nog niet af: die staat er als open rondje bij, en de lijn en de prognose
// lopen van de laatste hele maand door.
function prognoseLijn(echt, prog) {
  const W = 560, H = 230, L = 50, R = 6, T = 10, B = 26, iw = W - L - R, ih = H - T - B;
  const punten = [...echt.map((m, i) => ({ maand: m.maand, w: m.omzet, echt: true, loopt: i === echt.length - 1 })), ...prog.map((p) => ({ maand: p.maand, w: p.verwacht, laag: p.laag, hoog: p.hoog, plaatsen: p.plaatsen }))];
  const max = Math.max(1, ...punten.map((p) => p.hoog || p.w));
  const stap = netteStap(max / 4), top = stap * Math.ceil(max / stap);
  const x = (i) => L + iw * (i + 0.5) / punten.length, y = (v) => T + ih - ih * v / top;
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Omzet en prognose per maand">';
  for (let v = 0; v <= top; v += stap) svg += '<line class="' + (v ? 'rooster' : 'nul') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="as" x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + kortEuro(v) + '</text>';
  const e = echt.length, heel = Math.max(0, e - 2); // heel: de laatste maand die af is
  const vooruit = punten.map((p, i) => (i === heel || i >= e ? i : -1)).filter((i) => i >= 0);
  const band = vooruit.map((i) => [x(i), y(punten[i].hoog ?? punten[i].w)]);
  const bandOnder = vooruit.map((i) => [x(i), y(punten[i].laag ?? punten[i].w)]).reverse();
  svg += '<path d="M' + [...band, ...bandOnder].map((q) => q.join(',')).join('L') + 'z" fill="var(--serie-omzet)" opacity=".12"/>';
  svg += '<line x1="' + (x(e - 1) + iw / punten.length / 2) + '" x2="' + (x(e - 1) + iw / punten.length / 2) + '" y1="' + T + '" y2="' + (T + ih) + '" stroke="var(--lijn)" stroke-dasharray="3 3"/>';
  svg += '<text class="as" x="' + (x(e - 1) + iw / punten.length / 2 + 6) + '" y="' + (T + 10) + '">prognose</text>';
  svg += '<path d="M' + punten.slice(0, heel + 1).map((p, i) => x(i) + ',' + y(p.w)).join('L') + '" fill="none" stroke="var(--serie-omzet)" stroke-width="2.25" stroke-linejoin="round"/>';
  svg += '<path d="M' + vooruit.map((i) => x(i) + ',' + y(punten[i].w)).join('L') + '" fill="none" stroke="var(--serie-omzet)" stroke-width="2" stroke-dasharray="5 4"/>';
  punten.forEach((p, i) => {
    if (p.echt) svg += '<circle cx="' + x(i) + '" cy="' + y(p.w) + '" r="4" fill="' + (p.loopt ? '#fff' : 'var(--serie-omzet)') + '" stroke="' + (p.loopt ? 'var(--serie-omzet)' : '#fff') + '" stroke-width="2"/>';
    const t = '<b>' + esc(maandNaam(p.maand, true)) + '</b><div class="tr"><span>' + (p.loopt ? 'Omzet tot nu toe' : p.echt ? 'Omzet' : 'Verwacht') + '</span><span>' + euro(p.w) + '</span></div>' + (p.loopt ? '<div class="tr"><span>Deze maand loopt nog</span><span></span></div>' : p.echt ? '' : '<div class="tr"><span>Plaatsen</span><span>' + getal(p.plaatsen) + '</span></div><div class="tr"><span>Bandbreedte</span><span>' + kortEuro(p.laag) + ' – ' + kortEuro(p.hoog) + '</span></div>');
    svg += '<rect class="doel" x="' + (L + iw * i / punten.length) + '" y="' + T + '" width="' + iw / punten.length + '" height="' + ih + '" data-tip="' + esc(t) + '"/>';
    if (i % 2 === 0) svg += '<text class="as" x="' + x(i) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(maandNaam(p.maand)) + '</text>';
  });
  return '<div class="grafiek">' + svg + '</svg></div>';
}

// ---------- pagina's ----------
function overzicht() {
  const o = data.overzicht, t = o.totalen, f = data.finance.kpi, nu = data.nu;
  const bewaakt = t.goed + t.aandacht + t.probleem, tot = Math.max(1, bewaakt); // gestopt of alleen V1: geen health
  const kleur = { goed: '#2E9E57', aandacht: '#D49A1C', probleem: '#D9473B' };
  const week = weekVanAgent();
  const balk = ['goed', 'aandacht', 'probleem'].filter((k) => t[k]).map((k) => '<i style="width:' + (100 * t[k] / tot) + '%;background:' + kleur[k] + '" data-tip="' + esc('<b>' + STAND[k] + '</b><div class="tr"><span>Praktijken</span><span>' + t[k] + '</span></div>') + '"></i>').join('');
  const zorgen = o.rijen.filter((r) => r.stand === 'probleem' || r.stand === 'aandacht').slice(0, 6);
  const sys = data.systeem || {};
  const beschik = (sys.beschikbaarheid || []);
  const gem = beschik.length ? Math.round(beschik.reduce((a, b) => a + b.pct, 0) / beschik.length * 100) / 100 : null;
  return '<div class="raster r4">' +
    kpi('Praktijken', t.praktijken, t.klanten + ' klant · ' + t.proeven + ' in proef', true) +
    kpi('Therapeuten met een login', t.therapeuten, t.actief7 + ' actief in de laatste 7 dagen') +
    kpi('Terugkerende omzet per maand', euro(f.mrr), aantal(f.plaatsenDoorlopend, 'plaats', 'plaatsen') + ' die doorlopen · excl. btw') +
    kpi('Open zaken', data.zaken.length, data.zaken.filter((z) => z.ernst === 'probleem').length + ' problemen, ' + data.zaken.filter((z) => z.ernst === 'aandacht').length + ' aandachtspunten') +
    '</div>' +
    '<div class="raster r21 mt">' +
      '<div class="kaart"><div class="kaartkop"><div><h2>Health van de praktijken</h2><p class="ks">Een probleem kost 30 punten, een aandachtspunt 10. Wie gestopt is of alleen V1 gebruikt, telt niet mee.</p></div><a class="knop licht klein" href="#praktijken">Alle praktijken</a></div>' +
        (bewaakt ? '<div class="balkje">' + balk + '</div><div class="legenda">' + ['goed', 'aandacht', 'probleem'].map((k) => '<span><i style="background:' + kleur[k] + '"></i>' + STAND[k] + ' <b>' + t[k] + '</b></span>').join('') + (t.nvt ? '<span><i style="background:var(--lijn)"></i>Niet bewaakt <b>' + t.nvt + '</b></span>' : '') + '</div>' : '<p class="leeg">' + (t.praktijken ? 'Nog geen praktijk om te bewaken.' : 'Nog geen praktijken met een account.') + '</p>') +
        (zorgen.length ? '<table class="tabel mt"><thead><tr><th>Praktijk</th><th>Wat er speelt</th><th class="r">Score</th></tr></thead><tbody>' + zorgen.map((r) =>
          '<tr class="klik" tabindex="0" data-pk="' + esc(r.pk) + '"><td class="naamcel"><b>' + esc(r.naam) + '</b><small>' + r.therapeuten + ' therapeuten</small></td><td>' + esc(r.signalen.map((s) => s.tekst).join(' · ')) + '</td><td class="r">' + pil(r.score, r.stand, true) + '</td></tr>').join('') + '</tbody></table>' : '') +
      '</div>' +
      '<div class="kaart"><h2>Platform</h2><p class="ks">Versie ' + esc(String(sys.versie || '').slice(0, 7) || 'onbekend') + ' · draait ' + esc(sys.uptimeUren) + ' uur</p>' +
        (sys.checks || []).map((c) => check(c.ok, c.naam, c.tekst)).join('') +
        '<h2 class="mt">Beschikbaarheid</h2>' + (beschik.length
          ? '<p class="ks">' + (beschik.length === 1 ? 'Vandaag' : 'Laatste ' + beschik.length + ' dagen') + ' · gemiddeld ' + gem.toLocaleString('nl-NL') + '% · gemeten door de server zelf, elke minuut</p><div class="beschik">' + beschik.map((b) => '<i class="' + (b.pct < 99 ? 'uit' : b.pct < 100 ? 'dip' : '') + '" style="height:' + Math.max(8, (b.pct - 95) * 20) + '%" data-tip="' + esc('<b>' + datum(Date.parse(b.datum)) + '</b><div class="tr"><span>Bereikbaar</span><span>' + b.pct.toLocaleString('nl-NL') + '%</span></div>') + '"></i>').join('') + '</div>'
          : '<p class="ks">Nog geen meting: de server telt vanaf nu elke minuut dat hij draait. De eerste cijfers staan er over tien minuten.</p>') +
      '</div>' +
    '</div>' +
    '<div class="raster r2 mt">' +
      '<div class="kaart"><div class="kaartkop"><div><h2>Support-agent</h2><p class="ks">' + aantal(data.zaken.length, 'open zaak', 'open zaken') + ' · deze week ' + aantal(week.gemaild, 'mail', 'mails') + ' verstuurd en ' + aantal(week.opgelost, 'zaak', 'zaken') + ' opgelost</p></div><a class="knop licht klein" href="#support">Naar de agent</a></div>' +
        (data.zaken.length ? '<div class="punten">' + data.zaken.slice(0, 5).map((z) => '<a class="punt" href="#support">' + pil(...ERNST[z.ernst]) + '<span><b>' + esc(z.praktijk) + '</b><small>' + esc(z.tekst) + '</small></span><i aria-hidden="true">›</i></a>').join('') + '</div>' + (data.zaken.length > 5 ? '<p class="uitleg">En nog ' + (data.zaken.length - 5) + ' bij de support-agent.</p>' : '') : '<p class="leeg">Geen open zaken. Alles draait.</p>') +
        '<p class="mt"><button type="button" class="knop limoen klein" id="rondeHier">Ronde nu draaien</button></p>' +
      '</div>' +
      '<div class="kaart"><div class="kaartkop"><div><h2>Finance in het kort</h2><p class="ks">' + esc(maandNaam(data.finance.maanden.at(-1)?.maand || '2026-01', true)) + '</p></div><a class="knop licht klein" href="#finance">Naar de cijfers</a></div>' +
        '<div class="raster r2">' + kpi('Omzet deze maand, tot nu toe', euro(f.omzetMaand), 'vorige maand ' + euro(f.omzetVorigeMaand) + ' · excl. btw') + kpi('Open posten', euro(f.openCent), f.open === 1 ? '1 factuur' : f.open + ' facturen') + '</div>' +
        '<h2 class="ruim">Finance-agent</h2>' + agentPunten(data.financeAgent, 4) +
      '</div>' +
    '</div>';
}

function bindOverzicht(el) {
  $('#rondeHier', el)?.addEventListener('click', async (e) => { e.target.disabled = true; const j = await post('ronde', {}); if (j) melden('Ronde gedraaid: ' + aantal(j.zaken.length, 'zaak', 'zaken') + ' gevonden.'); });
}

function praktijken() {
  const o = data.overzicht, nu = data.nu;
  const q = st.filter.toLowerCase();
  const rijen = o.rijen.filter((r) => (!st.stand || r.stand === st.stand) && (!q || r.naam.toLowerCase().includes(q) || r.leden.some((l) => (l.naam + ' ' + l.email).toLowerCase().includes(q))));
  const chip = (k, l, n) => '<button type="button" class="chip' + (st.stand === k ? ' aan' : '') + '" data-stand="' + k + '">' + l + '<b>' + n + '</b></button>';
  return '<div class="filter"><input type="search" id="zoek" placeholder="Zoek praktijk, therapeut of e-mail" value="' + esc(st.filter) + '" aria-label="Zoeken"/>' +
    chip('', 'Alle', o.totalen.praktijken) + chip('probleem', 'Probleem', o.totalen.probleem) + chip('aandacht', 'Aandacht', o.totalen.aandacht) + chip('goed', 'Goed', o.totalen.goed) + (o.totalen.nvt ? chip('nvt', 'Niet bewaakt', o.totalen.nvt) : '') + '</div>' +
    '<div class="kaart"><table class="tabel"><thead><tr><th>Praktijk</th><th>Status</th><th class="r">Therapeuten</th><th class="r">Actief 7 dagen</th><th class="r">Kaarten 30 dagen</th><th>Per week, 12 weken</th><th>Laatst actief</th><th>Health</th></tr></thead><tbody>' +
    (rijen.length ? rijen.map((r) => '<tr class="klik" tabindex="0" data-pk="' + esc(r.pk) + '">' +
      '<td class="naamcel"><b>' + esc(r.naam) + '</b><small>' + esc(r.signalen[0]?.tekst || (r.sinds ? 'sinds ' + datum(r.sinds) : '')) + '</small></td>' +
      '<td>' + pil(...(STATUS[r.status] || [r.status, 'neutraal'])) + '</td>' +
      '<td class="r num">' + r.therapeuten + (r.plaatsen ? ' <small class="hint">/ ' + r.plaatsen + ' betaald</small>' : '') + '</td>' +
      '<td class="r num">' + r.actief7 + '</td><td class="r num">' + r.kaarten30 + '</td><td>' + vonk(r.weken) + '</td>' +
      '<td>' + esc(geleden(r.laatst, nu)) + '</td>' +
      '<td>' + (r.stand === 'nvt' ? '<span class="hint">niet bewaakt</span>' : '<div class="score"><div class="balk"><i class="' + r.stand + '" style="width:' + r.score + '%"></i></div><span>' + r.score + '</span></div>') + '</td></tr>').join('')
      : '<tr><td colspan="8" class="leeg">' + (o.rijen.length ? 'Geen praktijk past bij dit filter.' : 'Nog geen praktijk met een account.') + '</td></tr>') +
    '</tbody></table></div>';
}
function bindPraktijken(el) {
  const z = $('#zoek', el);
  z?.addEventListener('input', () => { st.filter = z.value; const pos = z.selectionStart; teken(); const n = $('#zoek'); n.focus(); n.setSelectionRange(pos, pos); });
  el.querySelectorAll('[data-stand]').forEach((b) => b.addEventListener('click', () => { st.stand = b.dataset.stand; teken(); }));
}
function openLade(pk) { st.ladePk = pk; tekenLade(); }
function tekenLade() {
  const r = data.overzicht.rijen.find((x) => x.pk === st.ladePk);
  const lade = $('#lade');
  if (!r) { lade.hidden = true; st.ladePk = null; return; }
  const nu = data.nu;
  const zaken = data.zaken.filter((z) => z.pk === r.pk);
  const facturen = data.finance.facturen.filter((f) => f.pk === r.pk).slice(0, 6);
  const init = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  // de weken lopen terug vanaf nu: de laatste staaf is de week tot vandaag
  const weekPunten = r.weken.map((n, i) => { const eind = nu - (r.weken.length - 1 - i) * 7 * 86400e3; return { n, accent: i >= r.weken.length - 4, l: datum(eind - 6 * 86400e3, { day: 'numeric', month: 'short' }) + ' t/m ' + datum(eind, { day: 'numeric', month: 'short' }) }; });
  const dagPunten = r.actiefDagen.map((d) => ({ n: d.n, accent: true, l: datum(Date.parse(d.datum + 'T12:00:00Z'), { weekday: 'short', day: 'numeric', month: 'short' }) }));
  const sinds = data.systeem && data.systeem.gebruikSinds;
  const gebruik = r.status === 'v1' ? '' : '<h3>Gebruik</h3>' +
    (r.weken.some((n) => n) ? '<p class="hint">Kaarten per week, laatste 12 weken</p>' + staafjes(weekPunten, { eenheid: 'Kaarten', label: 'Kaarten per week' }) : '<p class="hint">Geen kaart gemaakt of bijgewerkt in de laatste 12 weken.</p>') +
    (dagPunten.length ? '<p class="hint mt">Therapeuten die de app open hadden, per dag' + (dagPunten.length < 30 ? ' (gemeten sinds ' + datum(Date.parse(r.actiefDagen[0].datum + 'T12:00:00Z'), { day: 'numeric', month: 'long' }) + ')' : '') + '</p>' + staafjes(dagPunten, { eenheid: 'Therapeuten', klasse: 'dagen', hoogte: 44, label: 'Actieve therapeuten per dag' })
      : bron === 'echt' ? '<p class="hint mt">' + (sinds ? 'Wie de app open heeft, telt de server sinds ' + datum(sinds, { day: 'numeric', month: 'long' }) + '.' : 'Wie de app open heeft, telt de server vanaf de eerste therapeut die inlogt.') + '</p>' : '');
  $('#ladeBinnen').innerHTML = '<button type="button" class="sluit" id="ladeDicht" aria-label="Sluiten">×</button>' +
    '<h2>' + esc(r.naam) + '</h2><p class="hint">' + pil(...(STATUS[r.status] || [r.status, 'neutraal'])) + ' ' + (r.stand === 'nvt' ? '' : pil(STAND[r.stand] + ' · ' + r.score, r.stand)) + (r.sinds ? ' &nbsp;sinds ' + datum(r.sinds) : '') + '</p>' +
    '<div class="feiten"><div><small>Therapeuten</small><b>' + r.therapeuten + '</b></div><div><small>Kaarten 30 dagen</small><b>' + r.kaarten30 + '</b></div><div><small>Met tweede stap</small><b>' + r.tweedeStap + '/' + r.therapeuten + '</b></div></div>' +
    (r.betaaldTot ? '<p class="uitleg">Betaald tot ' + datum(r.betaaldTot) + (r.plaatsen ? ' voor ' + r.plaatsen + (r.plaatsen === 1 ? ' therapeut' : ' therapeuten') : '') + '.</p>' : r.proefTot ? '<p class="uitleg">Proef loopt tot ' + datum(r.proefTot) + '.</p>' : '') +
    '<h3>Wat er speelt</h3>' + (zaken.length ? zaken.map((z) => '<div class="voorstel"><strong>' + esc(z.tekst) + '</strong><br/>' + (z.mails.length ? 'Agent stelt een mail voor aan ' + esc(z.mails.map((m) => m.naam || m.aan).join(', ')) + '.' : esc(z.taak || '')) + '</div>').join('<div class="mt"></div>') + '<p class="mt"><a class="knop licht klein" href="#support">Naar de support-agent</a></p>' : '<p class="hint">' + (r.status === 'v1' ? 'Deze praktijk gebruikt alleen V1. Beheer telt hier de logins en bewaakt verder niets.' : r.stand === 'nvt' ? 'Deze praktijk is gestopt en wordt niet meer bewaakt.' : 'Niets: deze praktijk draait zonder problemen.') + '</p>') +
    gebruik +
    '<h3>Logins</h3>' + (r.leden.length ? r.leden.map((l) => '<div class="lid"><span class="av' + (l.actief ? '' : ' uit') + '">' + esc(init(l.naam || l.email)) + '</span><div><b>' + esc(l.naam || l.email) + '</b><small>' + (l.actief && l.kaarten30 != null && r.status !== 'v1' ? aantal(l.kaarten30, 'kaart', 'kaarten') + ' in 30 dagen · ' : '') + esc(l.email) + '</small></div>' +
      '<span class="hint">' + (l.rol === 'beheerder' ? pil('Beheerder', 'petrol', true) + ' ' : '') + (l.actief ? (l.tweedeStap ? '' : pil('Geen tweede stap', 'aandacht', true) + ' ') + esc(geleden(l.laatst, nu)) : pil('Uitgenodigd', 'neutraal', true)) + '</span></div>').join('') : '<p class="hint">Nog geen eigen logins.</p>') +
    (facturen.length ? '<h3>Laatste facturen</h3><table class="tabel"><tbody>' + facturen.map((f) => '<tr><td>' + esc(f.nr || '(nog geen nummer)') + '</td><td>' + datum(f.datum) + '</td><td class="r num">' + euro(f.totaalCent) + '</td><td>' + factuurPil(f.status) + '</td></tr>').join('') + '</tbody></table>' : '') +
    '<p class="uitleg">Kaarten en patiëntgegevens staan hier bewust niet: beheer ziet alleen tellingen. Een kaart telt in de week waarin hij voor het laatst is bewaard.</p>';
  lade.hidden = false;
  bindTips(lade);
  $('#ladeDicht').addEventListener('click', sluitLade);
  $('#ladeDicht').focus();
}
function sluitLade() { st.ladePk = null; $('#lade').hidden = true; }

function support() {
  const zaken = data.zaken;
  const soorten = data.agent.soorten;
  const stand = data.agent.stand;
  const zaakHtml = (z) => {
    const ms = soorten[z.soort];
    const s = z.mailStand || 'uit';
    return '<div class="zaak ' + z.ernst + '"><div class="zaakkop">' + pil(z.ernst === 'probleem' ? 'Probleem' : 'Aandacht', z.ernst) + '<b>' + esc(z.praktijk) + '</b><span class="hint">' + esc(ms ? ms.titel : 'Taak voor beheer') + '</span></div>' +
      '<div class="wat">' + esc(z.tekst) + '</div>' +
      (z.mails.length ? '<div class="voorstel"><strong>Voorstel:</strong> mail aan ' + esc(z.mails.map((m) => (m.naam ? m.naam + ' ' : '') + '<' + m.aan + '>').join(', ')) + '.' +
        z.mails.slice(0, 1).map((m) => '<details class="mail"><summary>' + esc(m.onderwerp) + '</summary><pre>' + esc(m.tekst) + '</pre></details>').join('') + '</div>'
        : '<div class="voorstel"><strong>Taak:</strong> ' + esc(z.taak || '') + '</div>') +
      (z.mails.length ? '<div class="zaakvoet">' + (z.verstuurd ? '✓ Gemaild ' + esc(tijd(new Date(z.verstuurd).toISOString())) + (z.opnieuwVanaf > data.nu ? ' · opnieuw kan vanaf ' + datum(z.opnieuwVanaf) : '') : s === 'automatisch' ? 'Gaat bij de volgende ronde automatisch weg' : s === 'handmatig' ? 'Wacht op een klik van beheer' : 'Mails van deze soort staan uit') +
        '<button type="button" class="knop klein' + (s === 'uit' && bron === 'echt' ? ' licht' : '') + '" data-verstuur="' + esc(z.sleutel) + '"' + ((s === 'uit' && bron === 'echt') || (z.verstuurd && z.opnieuwVanaf > data.nu) ? ' disabled' : '') + '>' + (bron === 'demo' ? 'Verstuur (demo)' : 'Verstuur') + '</button></div>' : '') +
      '</div>';
  };
  // het logboek van de agent: wat hij zag, mailde en zag verdwijnen
  const week = weekVanAgent();
  const LOG = { nieuw: ['Gezien', 'neutraal'], gemaild: ['Gemaild', 'petrol'], opgelost: ['Opgelost', 'goed'], start: ['Begin', 'neutraal'] };
  const logRegel = (x) => {
    const wat = x.wat === 'gemaild' ? 'Mail “' + x.onderwerp + '” naar ' + aantal(x.aan || 1, 'adres', 'adressen') + (x.wie && x.wie !== 'agent' ? ', verstuurd door ' + x.wie : ', automatisch')
      : x.wat === 'opgelost' ? x.tekst + '. Weg ' + (x.dagen ? 'na ' + aantal(x.dagen, 'dag', 'dagen') : 'op dezelfde dag') + (x.gemaild ? ', na een mail' : ', zonder mail')
      : x.tekst;
    return '<div class="logregel">' + pil(...(LOG[x.wat] || [x.wat, 'neutraal']), true) + '<div>' + (x.praktijk ? '<b>' + esc(x.praktijk) + '</b>' : '') + '<span>' + esc(wat) + '</span><time>' + esc(tijd(x.t)) + '</time></div></div>';
  };
  const log = data.agent.logboek || [], logToon = st.logAlles ? log : log.slice(0, 8);
  const laatste = data.agent.laatsteRonde;
  const standKnop = (soort, k, l) => '<button type="button" data-soort="' + soort + '" data-stand="' + k + '" class="' + ((stand[soort] || 'uit') === k ? 'aan' : '') + '"' + (soort === 'storing' && k === 'automatisch' ? ' disabled title="Een storingsbericht verstuurt altijd een mens"' : '') + '>' + l + '</button>';
  return '<div class="raster r4">' +
    kpi('Open zaken', zaken.length, aantal(zaken.filter((z) => z.ernst === 'probleem').length, 'probleem', 'problemen') + ', ' + aantal(zaken.filter((z) => z.ernst === 'aandacht').length, 'aandachtspunt', 'aandachtspunten'), true) +
    kpi('Gemaild deze week', week.gemaild, week.nieuw ? aantal(week.nieuw, 'nieuwe zaak', 'nieuwe zaken') + ' gezien' : 'geen nieuwe zaken') +
    kpi('Opgelost deze week', week.opgelost, week.opgelost ? week.naMail + ' daarvan na een mail' : 'nog niets verdwenen') +
    kpi('Laatste ronde', laatste ? esc(tijd(laatste)) : '–', bron === 'demo' ? 'in demo draait de agent alleen als jij klikt' : 'de agent kijkt elke ' + data.agent.elke + ' minuten') +
    '</div><div class="raster r21 mt">' +
    '<div><div class="kaart"><div class="kaartkop"><div><h2>Open zaken</h2><p class="ks">' + aantal(zaken.length, 'zaak', 'zaken') + ', gesorteerd op ernst. Kaarten of patiënten komen nooit in een mail.</p></div>' +
      '<button type="button" class="knop limoen klein" id="ronde">Ronde nu draaien</button></div>' +
      (zaken.length ? zaken.map(zaakHtml).join('') : '<p class="leeg">Geen open zaken. Alles draait.</p>') + '</div></div>' +
    '<div><div class="kaart"><h2>Wat mag de agent mailen?</h2><p class="ks">Per soort bericht: <b>uit</b> (alleen voorstellen), <b>handmatig</b> (beheer klikt per zaak) of <b>automatisch</b> (één keer per zaak per week). Standaard staat alles uit.</p>' +
      Object.entries(soorten).map(([k, s]) => '<div class="soort"><div class="rij"><b>' + esc(s.titel) + '</b><span class="seg" role="group" aria-label="' + esc(s.titel) + '">' + standKnop(k, 'uit', 'Uit') + standKnop(k, 'handmatig', 'Handmatig') + standKnop(k, 'automatisch', 'Automatisch') + '</span></div><small>' + esc(s.uitleg) + '</small></div>').join('') +
      (bron === 'echt' ? '<p class="uitleg">Elke wijziging komt met je naam in het beheerlogboek. ' + (data.mail ? '' : '<b>Mail staat op deze server uit</b>, dus er gaat nog niets weg.') + '</p>' : '<p class="uitleg">In deze demo staan twee soorten al op automatisch en één op handmatig, zodat je ziet wat de agent dan doet. Op fysiplan.nl staat alles uit tot jij het aanzet. In demo gaat er nooit iets weg: verstuurde mails komen in het postvak hieronder.</p>') +
    '</div>' +
    '<div class="kaart mt"><h2>Wat de agent deed</h2><p class="ks">Wat hij zag, mailde en zag verdwijnen. Nieuwste boven.</p>' +
      (log.length ? '<div class="logboek">' + logToon.map(logRegel).join('') + '</div>' + (log.length > 8 ? '<div class="pager"><button type="button" class="knop licht klein" id="logAlles">' + (st.logAlles ? 'Toon de laatste 8' : 'Toon alle ' + log.length) + '</button></div>' : '')
        : '<p class="leeg">Nog niets. De agent schrijft hier op wat er nieuw is, wat hij mailde en wat is opgelost.</p>') +
    '</div>' +
    (bron === 'demo' ? '<div class="kaart mt"><h2>Postvak uit (demo)</h2><p class="ks">Wat de agent in demo zou hebben gestuurd</p>' + (data.agent.mails.length ? '<div class="uitbox">' + data.agent.mails.map((m) => '<div><b>' + esc(m.onderwerp) + '</b><small>aan ' + esc(m.aan) + (m.praktijk ? ' · ' + esc(m.praktijk) : '') + ' · ' + esc(tijd(m.t)) + '</small></div>').join('') + '</div>' : '<p class="leeg">Nog niets verstuurd. Zet een soort op automatisch en draai een ronde.</p>') + '</div>' : '') +
    '</div></div>';
}
function bindSupport(el) {
  $('#ronde', el)?.addEventListener('click', async (e) => { e.target.disabled = true; const j = await post('ronde', {}); if (j) { const r = j.agent.rondes[0] || {}; melden('Ronde gedraaid: ' + aantal(j.zaken.length, 'zaak', 'zaken') + ', ' + aantal(r.verstuurd || 0, 'mail', 'mails') + ' verstuurd' + (r.nieuw || r.opgelost ? ', ' + (r.nieuw || 0) + ' nieuw en ' + (r.opgelost || 0) + ' opgelost' : '') + '.'); } });
  $('#logAlles', el)?.addEventListener('click', () => { st.logAlles = !st.logAlles; teken(); });
  el.querySelectorAll('[data-soort]').forEach((b) => b.addEventListener('click', async () => {
    if (b.classList.contains('aan')) return;
    if (bron === 'echt' && b.dataset.stand !== 'uit' && !confirm('Mails van de soort “' + data.agent.soorten[b.dataset.soort].titel + '” naar echte therapeuten en beheerders toestaan (' + b.dataset.stand + ')?')) return;
    const j = await post('mailstand', { soort: b.dataset.soort, stand: b.dataset.stand });
    if (j) melden('Opgeslagen.');
  }));
  el.querySelectorAll('[data-verstuur]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const j = await post('verstuur', { sleutel: b.dataset.verstuur });
    if (j) melden(bron === 'demo' ? 'Verstuurd in demo (alleen in het postvak hiernaast).' : 'Verstuurd.');
    else b.disabled = false;
  }));
}

function berichten() {
  const sj = data.agent.sjablonen;
  const s = data.agent.stand.storing || 'uit';
  return '<div class="raster r12">' +
    '<div class="kaart"><h2>Bericht opstellen</h2><p class="ks">Kies een begin, pas de tekst aan en vervang alles tussen [haken]</p>' +
    '<div class="formulier"><div class="keuze" role="radiogroup" aria-label="Soort bericht">' + Object.entries(sj).map(([k, v], i) => '<label><input type="radio" name="sjabloon" value="' + k + '"' + (i === 0 ? ' checked' : '') + '/>' + esc({ storing: 'Storing', onderhoud: 'Onderhoud', opgelost: 'Opgelost' }[k] || k) + '</label>').join('') + '</div>' +
    '<div class="veld" role="radiogroup" aria-label="Aan"><span class="vt">Aan</span><div class="keuze"><label><input type="radio" name="wie" value="beheerders" checked/>Beheerders van elke praktijk <span class="hint">(' + data.ontvangers.beheerders + ')</span></label><label><input type="radio" name="wie" value="iedereen"/>Iedereen met een login <span class="hint">(' + data.ontvangers.iedereen + ')</span></label></div></div>' +
    '<label>Onderwerp<input id="bOnderwerp" maxlength="140"/></label>' +
    '<label>Bericht<textarea id="bTekst" maxlength="4000"></textarea></label>' +
    '<label>Typ ter bevestiging het aantal ontvangers<input id="bBevestig" inputmode="numeric" autocomplete="off" placeholder="aantal"/></label>' +
    '<div><button type="button" class="knop" id="bVerstuur">' + (bron === 'demo' ? 'Versturen (demo)' : 'Versturen') + '</button></div></div></div>' +
    '<div><div class="kaart"><h2>Voordat je verstuurt</h2>' +
      check(bron === 'demo' || s !== 'uit', 'Storingsberichten toegestaan', bron === 'demo' ? 'In demo gaat er niets weg.' : s === 'uit' ? 'Staan uit. Zet ze op handmatig bij de support-agent.' : 'Staan op handmatig.') +
      check(bron === 'demo' || data.mail, 'Mail op de server', data.mail ? 'Ingesteld.' : 'Staat uit: er kan niets weg.') +
      check(true, 'Geen patiëntgegevens', 'Het bericht gaat alleen over Fysiplan zelf. Noem nooit een patiënt of kaart.') +
      check(true, 'Eén mail per adres', 'Wie bij twee praktijken werkt, krijgt het bericht één keer.') +
    '</div>' +
    (bron === 'demo' ? '<div class="kaart mt"><h2>Postvak uit (demo)</h2>' + (data.agent.mails.length ? '<div class="uitbox">' + data.agent.mails.slice(0, 12).map((m) => '<div><b>' + esc(m.onderwerp) + '</b><small>aan ' + esc(m.aan) + ' · ' + esc(tijd(m.t)) + '</small></div>').join('') + '</div>' : '<p class="leeg">Nog niets.</p>') + '</div>' : '') +
    '</div></div>';
}
function bindBerichten(el) {
  const zet = () => { const k = $('input[name=sjabloon]:checked', el).value; $('#bOnderwerp', el).value = data.agent.sjablonen[k].onderwerp; $('#bTekst', el).value = data.agent.sjablonen[k].tekst; };
  el.querySelectorAll('input[name=sjabloon]').forEach((r) => r.addEventListener('change', zet));
  zet();
  $('#bVerstuur', el).addEventListener('click', async () => {
    const wie = $('input[name=wie]:checked', el).value;
    const j = await post('storing', { wie, onderwerp: $('#bOnderwerp', el).value, tekst: $('#bTekst', el).value, bevestig: Number($('#bBevestig', el).value) }, true);
    if (j) { melden(bron === 'demo' ? 'Verstuurd in demo.' : 'Het bericht gaat nu weg naar ' + data.ontvangers[wie] + ' adressen.'); teken(); }
  });
}

function finance() {
  const f = data.finance, k = f.kpi, inst = f.instellingen;
  const radio = (naam, waarde, label, huidig) => '<label><input type="radio" name="' + naam + '" value="' + waarde + '"' + (huidig === waarde ? ' checked' : '') + '/>' + label + '</label>';
  const leeg = !f.facturen.length && !f.kosten.length;
  return '<div class="raster r5">' +
    kpi('Klanten', k.klanten, k.plaatsen + ' betaalde plaatsen', true) +
    kpi('Terugkerend per maand', euro(k.mrr), 'excl. btw · ' + euro(k.arr, true) + ' per jaar') +
    kpi('Omzet ' + jaarVanNu(), euro(k.omzetJaar, true), 'excl. btw') +
    kpi('Prognose ' + jaarVanNu(), euro(k.prognoseJaar, true), (k.groeiPlaatsen < 0 ? '−' : '+') + getal(Math.abs(k.groeiPlaatsen)) + ' plaatsen per maand (schatting)') +
    kpi('Open posten', euro(k.openCent), k.open + ' van ' + k.facturen + ' facturen') + '</div>' +
    '<div class="kaart mt"><h2>Finance-agent</h2><p class="ks">Wat geld kost, een termijn heeft of nog gekozen moet worden. De agent verandert zelf niets.</p>' + agentPunten(data.financeAgent) + '</div>' +
    (leeg ? '<div class="kaart mt leegstaat"><h2>Nog geen cijfers</h2><p>Er is nog niets betaald en er zijn nog geen kosten ingevoerd. Zodra de eerste praktijk via Mollie betaalt, staan hier omzet, kosten, kwartalen en de prognose.</p><button type="button" class="knop limoen" data-naar-demo>Bekijk het met demo-gegevens</button></div>' : '') +
    '<div class="raster r2 mt"' + (leeg ? ' hidden' : '') + '>' +
      '<div class="kaart"><h2>Omzet en kosten per maand</h2><p class="ks">Laatste 12 maanden, excl. btw</p>' + staven(f.maanden, [{ k: 'omzet', l: 'Omzet', c: '--serie-omzet' }, { k: 'kosten', l: 'Kosten', c: '--serie-kosten' }]) +
        '<div class="legenda"><span><i style="background:var(--serie-omzet)"></i>Omzet</span><span><i style="background:var(--serie-kosten)"></i>Kosten</span></div></div>' +
      '<div class="kaart"><h2>Prognose</h2><p class="ks">Volgende 12 maanden, excl. btw: de plaatsen die doorlopen, plus de groei in plaatsen van de laatste zes hele maanden. Een schatting, geen belofte.</p>' + prognoseLijn(f.maanden.slice(-7), f.prognose) +
        '<p class="uitleg">Nu ' + aantal(k.plaatsenDoorlopend, 'plaats', 'plaatsen') + ' à ' + euro(k.prijsExcl) + ' excl. btw; de groei was ' + (k.groeiPlaatsen < 0 ? '−' : '+') + getal(Math.abs(k.groeiPlaatsen)) + ' per maand.' +
          (k.plaatsen > k.plaatsenDoorlopend ? ' Wie heeft opgezegd (' + aantal(k.plaatsen - k.plaatsenDoorlopend, 'plaats', 'plaatsen') + '), telt niet mee.' : '') +
          (k.proeven ? ' Niet meegeteld: ' + aantal(k.proeven, 'proef', 'proeven') + ' met ' + aantal(k.proefPlaatsen, 'login', 'logins') + ', goed voor ' + euro(k.proefPerMaand) + ' per maand als ze allemaal klant worden.' : '') + '</p></div>' +
    '</div>' +
    '<div class="raster ' + (leeg ? 'r12' : 'r21') + ' mt">' +
      '<div class="kaart"' + (leeg ? ' hidden' : '') + '><h2>Kwartalen en jaren</h2><p class="ks">Omzet, kosten en resultaat, excl. btw</p><table class="tabel"><thead><tr><th>Periode</th><th class="r">Omzet</th><th class="r">Kosten</th><th class="r">Resultaat</th><th class="r">Btw ontvangen</th><th class="r">Facturen</th></tr></thead><tbody>' +
        [...f.kwartalen].reverse().slice(0, 6).map((q) => '<tr><td>' + esc(q.periode.replace('-K', ' K')) + '</td><td class="r num">' + euro(q.omzet) + '</td><td class="r num">' + euro(q.kosten) + '</td><td class="r num">' + euro(q.resultaat) + '</td><td class="r num">' + euro(q.btw) + '</td><td class="r num">' + q.facturen + '</td></tr>').join('') +
        '</tbody><tfoot>' + [...f.jaren].reverse().slice(0, 2).map((j) => '<tr><td>Jaar ' + esc(j.periode) + '</td><td class="r num">' + euro(j.omzet) + '</td><td class="r num">' + euro(j.kosten) + '</td><td class="r num">' + euro(j.resultaat) + '</td><td class="r num">' + euro(j.btw) + '</td><td class="r num">' + j.facturen + '</td></tr>').join('') + '</tfoot></table>' +
        '</div>' +
      '<div class="kaart"><h2>Btw-instellingen</h2><p class="ks">Nog open bij Ahmed en de boekhouder. Wat Mollie afschreef, verandert hier niet door.</p><div class="formulier">' +
        '<div class="veld" role="radiogroup" aria-label="Prijs inclusief btw"><span class="vt">Is € ' + (inst.prijsCent / 100).toLocaleString('nl-NL') + ' per therapeut inclusief btw?</span><div class="keuze">' + radio('prijsBtw', 'onbekend', 'Nog niet gekozen', inst.prijsBtw) + radio('prijsBtw', 'inclusief', 'Inclusief', inst.prijsBtw) + radio('prijsBtw', 'exclusief', 'Exclusief', inst.prijsBtw) + '</div></div>' +
        '<div class="veld" role="radiogroup" aria-label="Kleineondernemersregeling"><span class="vt">Kleineondernemersregeling (KOR)</span><div class="keuze">' + radio('kor', 'onbekend', 'Nog niet gekozen', inst.kor) + radio('kor', 'nee', 'Nee', inst.kor) + radio('kor', 'ja', 'Ja', inst.kor) + '</div></div>' +
        '<label>Btw-tarief<select id="tarief">' + [21, 9, 0].map((t) => '<option value="' + t + '"' + (inst.btwTarief === t ? ' selected' : '') + '>' + t + '%</option>').join('') + '</select><span class="hint">Software als dienst valt meestal onder 21%.</span></label>' +
        '<div><button type="button" class="knop" id="finBewaar">Opslaan</button></div></div></div>' +
    '</div>';
}
const jaarVanNu = () => new Date(data.nu).getFullYear();
function bindFinance(el) {
  $('#finBewaar', el)?.addEventListener('click', async () => {
    const j = await post('finance', { prijsBtw: $('input[name=prijsBtw]:checked', el)?.value, kor: $('input[name=kor]:checked', el)?.value, btwTarief: Number($('#tarief', el).value) });
    if (j) melden('Btw-instellingen opgeslagen.');
  });
}

const ERNST = { probleem: ['Probleem', 'probleem'], aandacht: ['Aandacht', 'aandacht'], kans: ['Kans', 'petrol'] };
function agentPunten(punten, max) {
  if (!punten.length) return '<p class="leeg">De finance-agent heeft niets gevonden.</p>';
  return '<div class="punten">' + punten.slice(0, max || 99).map((p) => '<a class="punt" href="#' + p.naar + '">' + pil(...ERNST[p.ernst]) + '<span><b>' + esc(p.titel) + '</b><small>' + esc(p.tekst) + '</small></span><i aria-hidden="true">›</i></a>').join('') + '</div>' +
    (max && punten.length > max ? '<p class="uitleg">En nog ' + (punten.length - max) + ' bij Cijfers.</p>' : '');
}
const factuurPil = (s) => s === 'betaald' ? pil('Betaald', 'goed') : s === 'mislukt' ? pil('Incasso mislukt', 'probleem') : pil('Open', 'aandacht');
function facturen() {
  const f = data.finance;
  const lijst = f.facturen.filter((x) => st.factuurTab === 'alle' || (st.factuurTab === 'open' ? x.status !== 'betaald' : x.status === 'betaald'));
  const tab = (k, l, n) => '<button type="button" class="chip' + (st.factuurTab === k ? ' aan' : '') + '" data-tab="' + k + '">' + l + '<b>' + n + '</b></button>';
  const bladen = Math.max(1, Math.ceil(lijst.length / PER_BLAD));
  const blad = Math.min(st.factuurBlad, bladen - 1);
  const kostenLijst = st.kostenAlle ? f.kosten : f.kosten.slice(0, 10);
  const ex = (s, l) => '<a class="knop licht klein" href="/api/beheer/omgeving/export?bron=' + bron + '&soort=' + s + '" data-export>' + l + '</a>';
  return '<div class="raster r4">' + kpi('Gefactureerd', f.kpi.facturen, euro(f.facturen.reduce((t, x) => t + x.totaalCent, 0)) + ' incl. btw', true) + kpi('Betaald', f.kpi.betaald, euro(f.kpi.betaaldCent)) + kpi('Open', f.kpi.open, euro(f.kpi.openCent)) + kpi('Kosten dit jaar', euro(f.kosten.filter((k) => new Date(k.datum).getFullYear() === jaarVanNu()).reduce((t, k) => t + k.exclCent, 0)), 'excl. btw') + '</div>' +
    '<div class="kaart mt"><div class="kaartkop"><div class="filter">' + tab('alle', 'Alle', f.facturen.length) + tab('betaald', 'Betaald', f.kpi.betaald) + tab('open', 'Open', f.kpi.open) + '</div><span class="geenprint">' + ex('facturen', 'Facturen (CSV)') + ' ' + ex('debiteuren', 'Open posten (CSV)') + '</span></div>' +
    '<table class="tabel"><thead><tr><th>Nummer</th><th>Datum</th><th>Praktijk</th><th class="r">Therapeuten</th><th class="r">Excl. btw</th><th class="r">Btw</th><th class="r">Totaal</th><th>Status</th></tr></thead><tbody>' +
    (lijst.length ? lijst.slice(blad * PER_BLAD, (blad + 1) * PER_BLAD).map((x) => '<tr><td class="num">' + (x.nr ? esc(x.nr) : '<span class="hint">nog geen nummer</span>') + '</td><td>' + datum(x.datum) + '</td><td>' + esc(x.praktijk) + '</td><td class="r num">' + x.aantal + '</td><td class="r num">' + euro(x.excl) + '</td><td class="r num">' + euro(x.btw) + '</td><td class="r num">' + euro(x.totaalCent) + '</td><td>' + factuurPil(x.status) + '</td></tr>').join('') : '<tr><td colspan="8" class="leeg">' + (bron === 'echt' ? 'Nog geen facturen: Mollie staat nog uit, dus er is nog niets betaald.' : 'Geen facturen in deze selectie.') + '</td></tr>') +
    '</tbody></table>' + (lijst.length > PER_BLAD ? '<div class="pager"><span>' + (blad * PER_BLAD + 1) + '–' + Math.min(lijst.length, (blad + 1) * PER_BLAD) + ' van ' + lijst.length + '</span><button type="button" class="knop licht klein" data-blad="-1"' + (blad === 0 ? ' disabled' : '') + '>Vorige</button><button type="button" class="knop licht klein" data-blad="1"' + (blad >= bladen - 1 ? ' disabled' : '') + '>Volgende</button></div>' : '') + '</div>' +
    '<div class="raster r12 mt">' +
      '<div class="kaart"><h2>Kosten toevoegen</h2><p class="ks">Kosten van Fysiplan zelf (hosting, software, advies). Bewaar de bon apart.</p><div class="formulier">' +
        '<div class="rij"><label>Datum<input type="date" id="kDatum" value="' + new Date(data.nu).toISOString().slice(0, 10) + '"/></label><label>Categorie<select id="kCat">' + ['Hosting', 'Software', 'Content', 'Advies', 'Overig'].map((c) => '<option>' + c + '</option>').join('') + '</select></label></div>' +
        '<label>Omschrijving<input id="kOms" maxlength="120" placeholder="bijvoorbeeld Railway november"/></label>' +
        '<div class="rij"><label>Bedrag incl. btw<input id="kBedrag" inputmode="decimal" placeholder="24,20"/></label><label>Waarvan btw<input id="kBtw" inputmode="decimal" placeholder="4,20"/></label></div>' +
        '<div><button type="button" class="knop" id="kBewaar">Toevoegen</button></div></div></div>' +
      '<div class="kaart"><div class="kaartkop"><div><h2>Kosten</h2><p class="ks">' + f.kosten.length + ' posten</p></div><span class="geenprint">' + ex('kosten', 'Kosten (CSV)') + '</span></div><table class="tabel"><thead><tr><th>Datum</th><th>Omschrijving</th><th>Categorie</th><th class="r">Excl.</th><th class="r">Btw</th><th></th></tr></thead><tbody>' +
        (f.kosten.length ? kostenLijst.map((k) => '<tr><td>' + datum(k.datum) + '</td><td>' + esc(k.omschrijving) + '</td><td>' + esc(k.categorie) + '</td><td class="r num">' + euro(k.exclCent) + '</td><td class="r num">' + euro(k.btwCent) + '</td><td class="r">' + (k.door ? '<button type="button" class="knop licht klein" data-weg="' + esc(k.id) + '" aria-label="Weghalen">×</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="6" class="leeg">Nog geen kosten ingevoerd.</td></tr>') +
      '</tbody></table>' + (f.kosten.length > 10 ? '<div class="pager"><button type="button" class="knop licht klein" id="kostenAlle">' + (st.kostenAlle ? 'Toon de laatste 10' : 'Toon alle ' + f.kosten.length) + '</button></div>' : '') + '</div>' +
    '</div>';
}
function bindFacturen(el) {
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.factuurTab = b.dataset.tab; st.factuurBlad = 0; teken(); }));
  el.querySelectorAll('[data-blad]').forEach((b) => b.addEventListener('click', () => { st.factuurBlad = Math.max(0, st.factuurBlad + Number(b.dataset.blad)); teken(); }));
  $('#kostenAlle', el)?.addEventListener('click', () => { st.kostenAlle = !st.kostenAlle; teken(); });
  bindExport(el);
  $('#kBewaar', el)?.addEventListener('click', async () => {
    const j = await post('kosten', { datum: $('#kDatum', el).value, categorie: $('#kCat', el).value, omschrijving: $('#kOms', el).value, bedrag: $('#kBedrag', el).value, btw: $('#kBtw', el).value || '0' });
    if (j) melden('Kostenpost toegevoegd.');
  });
  el.querySelectorAll('[data-weg]').forEach((b) => b.addEventListener('click', async () => { if (confirm('Deze kostenpost weghalen?')) { const j = await post('kosten', { actie: 'weg', id: b.dataset.weg }); if (j) melden('Weggehaald.'); } }));
}
// downloaden met de beheerkop (een gewone link stuurt die niet mee)
function bindExport(el) {
  el.querySelectorAll('[data-export]').forEach((a) => a.addEventListener('click', async (e) => {
    e.preventDefault();
    const r = await fetch(a.href, { headers: HDR });
    if (!r.ok) { melden('Downloaden lukte niet.', true); return; }
    const naam = (r.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'export.csv';
    const url = URL.createObjectURL(await r.blob());
    const l = document.createElement('a'); l.href = url; l.download = naam; document.body.append(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }));
}

function btw() {
  const f = data.finance, inst = f.instellingen;
  const standPil = (s) => ({ ingediend: pil('Ingediend', 'goed'), 'te-doen': pil('Te doen', 'aandacht'), 'te-laat': pil('Te laat', 'probleem'), loopt: pil('Loopt nog', 'neutraal'), kor: pil('KOR: geen aangifte', 'neutraal') })[s] || s;
  const rijen = f.btw.slice(0, 8);
  return (inst.kor === 'onbekend' || inst.prijsBtw === 'onbekend' ? '<div class="waarschuwing">De btw-keuze is nog open. Deze bedragen rekenen met ' + inst.btwTarief + '% btw in het betaalde bedrag en zonder KOR. Kies het bij Cijfers, samen met de boekhouder.</div>' : '') +
    '<div class="kwartaal mt">' + (rijen.length ? rijen.map((b) => '<div class="kaart kw"><div class="p">' + esc(b.kwartaal.replace('-K', ' K')) + '<small>uiterlijk ' + datum(Date.parse(b.deadline)) + '</small></div>' +
      '<div class="v"><small>1a omzet hoog tarief</small><b>' + euro(b.r1a.omzet) + '</b></div><div class="v"><small>1a btw</small><b>' + euro(b.r1a.btw) + '</b></div>' +
      '<div class="v"><small>5b voorbelasting</small><b>' + euro(b.r5b) + '</b></div>' +
      '<div class="v"><small>' + (b.teBetalen < 0 ? 'Terug te krijgen' : 'Te betalen') + '</small><b>' + euro(Math.abs(b.teBetalen)) + '</b></div>' +
      '<div class="acties">' + standPil(b.stand) + (b.stand === 'ingediend' ? '<button type="button" class="knop licht klein" data-heropen="' + b.kwartaal + '">Heropen</button>' : b.stand === 'te-doen' || b.stand === 'te-laat' ? '<button type="button" class="knop klein" data-indienen="' + b.kwartaal + '">Ingediend</button>' : '') + '</div>' +
      (b.stand === 'ingediend' ? '<div class="voet' + (b.verschil ? ' anders' : '') + '">' + (b.ingediend.bedragen
        ? (b.verschil ? '<b>Veranderd na het indienen.</b> Ingediend: ' + euro(b.ingediend.bedragen.teBetalen) + ', nu: ' + euro(b.teBetalen) + ' (verschil ' + euro(b.verschil) + '). Kijk met de boekhouder of een suppletie nodig is.'
          : 'Ingediend op ' + datum(Date.parse(b.ingediend.op)) + (b.ingediend.door ? ' door ' + esc(b.ingediend.door) : '') + (b.ingediend.kenmerk ? ', kenmerk ' + esc(b.ingediend.kenmerk) : '') + '. De bedragen van toen liggen vast: ' + euro(b.ingediend.bedragen.teBetalen) + '.')
        : 'Ingediend op ' + datum(Date.parse(b.ingediend.op)) + '. Van deze aangifte zijn de bedragen niet vastgelegd.') + '</div>' : '') +
      '</div>').join('') : '<div class="kaart leeg">Nog geen omzet, dus nog geen aangifte.</div>') + '</div>' +
    '<p class="uitleg">Rubriek 1a is de omzet tegen het algemene tarief; 5b is de btw op kosten die bij Facturen en kosten zijn ingevoerd. Doe de aangifte zelf in Mijn Belastingdienst Zakelijk en markeer hem daarna hier, eventueel met het kenmerk. Bij het markeren legt Fysiplan de bedragen vast; verandert er daarna nog iets in dat kwartaal, dan staat het verschil erbij. <a href="/api/beheer/omgeving/export?bron=' + bron + '&soort=btw" data-export>Btw-overzicht als CSV</a></p>';
}
function bindBtw(el) {
  bindExport(el);
  el.querySelectorAll('[data-indienen]').forEach((b) => b.addEventListener('click', async () => {
    const kenmerk = prompt('Aangifte ' + b.dataset.indienen + ' als ingediend markeren. Kenmerk van de Belastingdienst (mag leeg):', '');
    if (kenmerk === null) return;
    const j = await post('aangifte', { kwartaal: b.dataset.indienen, ingediend: true, kenmerk });
    if (j) melden('Aangifte ' + b.dataset.indienen + ' staat als ingediend.');
  }));
  el.querySelectorAll('[data-heropen]').forEach((b) => b.addEventListener('click', async () => { if (confirm('Aangifte ' + b.dataset.heropen + ' weer open zetten?')) await post('aangifte', { kwartaal: b.dataset.heropen, ingediend: false }); }));
}

function jaar() {
  const jaren = data.jaren;
  if (!st.jaar || !jaren.some((j) => j.jaar === st.jaar)) st.jaar = (jaren.find((j) => j.jaar < String(jaarVanNu())) || jaren[0]).jaar;
  const j = jaren.find((x) => x.jaar === st.jaar);
  // een afgesloten jaar toont de cijfers die bij het afsluiten zijn vastgelegd
  const fj = (j.afgesloten && j.vast) || j.cijfers;
  const VELD = { omzet: 'omzet', kosten: 'kosten', resultaat: 'resultaat', btw: 'btw ontvangen', voorbelasting: 'voorbelasting' };
  const anders = j.gewijzigd ? Object.keys(VELD).filter((k) => j.cijfers[k] !== j.vast[k]).map((k) => VELD[k] + ' nu ' + euro(j.cijfers[k]) + ' (was ' + euro(j.vast[k]) + ')') : [];
  if (j.gewijzigd && j.cijfers.facturen !== j.vast.facturen) anders.push('facturen nu ' + j.cijfers.facturen + ' (was ' + j.vast.facturen + ')');
  const pct = j.totaal ? j.klaar / j.totaal : 0, R = 40, O = 2 * Math.PI * R;
  const ex = (s, l) => '<a class="knop licht klein" href="/api/beheer/omgeving/export?bron=' + bron + '&soort=' + s + '&jaar=' + j.jaar + '" data-export>' + l + '</a>';
  const lopend = j.jaar >= String(jaarVanNu());
  return '<div class="filter">' + jaren.map((x) => '<button type="button" class="chip' + (x.jaar === st.jaar ? ' aan' : '') + '" data-jaar="' + x.jaar + '">' + x.jaar + (x.afgesloten ? ' ✓' : '') + '</button>').join('') + '</div>' +
    '<div class="raster r12">' +
      '<div><div class="kaart"><div class="ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="' + R + '" fill="none" stroke="var(--lijn-2)" stroke-width="10"/><circle cx="50" cy="50" r="' + R + '" fill="none" stroke="' + (pct === 1 ? '#2E9E57' : 'var(--petrol)') + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (O * pct) + ' ' + O + '" transform="rotate(-90 50 50)"/></svg>' +
        '<div><div class="groot">' + j.klaar + ' van ' + j.totaal + '</div><div class="hint">controles in orde voor ' + esc(j.jaar) + '</div><div class="mt">' + (j.afgesloten ? pil('Afgesloten door ' + j.afgesloten.door + ' op ' + datum(Date.parse(j.afgesloten.op)), 'goed') : lopend ? pil('Boekjaar loopt nog', 'neutraal') : j.kanAfsluiten ? pil('Klaar om af te sluiten', 'goed') : pil('Nog niet klaar', 'aandacht')) + '</div></div></div>' +
        (j.gewijzigd ? '<div class="waarschuwing mt">Na het afsluiten is er iets veranderd: ' + esc(anders.join(', ')) + '. Hieronder staan de cijfers van het afsluiten. Heropen het jaar om de nieuwe cijfers over te nemen, of zet de wijziging terug.</div>' : '') +
        '<h2 class="ruim">Resultaat ' + esc(j.jaar) + (j.afgesloten && j.vast ? ' <small class="hint">vastgelegd bij het afsluiten</small>' : '') + '</h2><table class="tabel"><tbody>' +
          '<tr><td>Omzet excl. btw</td><td class="r num">' + euro(fj.omzet) + '</td></tr><tr><td>Kosten excl. btw</td><td class="r num">−' + euro(fj.kosten).replace('€ ', '€ ') + '</td></tr>' +
          '</tbody><tfoot><tr><td>Resultaat</td><td class="r num">' + euro(fj.resultaat) + '</td></tr></tfoot></table>' +
        '<table class="tabel mt"><tbody><tr><td>Btw ontvangen</td><td class="r num">' + euro(fj.btw) + '</td></tr><tr><td>Voorbelasting</td><td class="r num">' + euro(fj.voorbelasting) + '</td></tr><tr><td>Facturen</td><td class="r num">' + fj.facturen + '</td></tr></tbody></table>' +
        '<div class="mt geenprint">' + (j.afgesloten ? '<button type="button" class="knop licht" id="heropenJaar">Boekjaar heropenen</button>' : '<button type="button" class="knop limoen" id="sluitJaar"' + (j.kanAfsluiten ? '' : ' disabled') + '>Boekjaar ' + esc(j.jaar) + ' afsluiten</button>') + ' <button type="button" class="knop licht" id="print">Jaarrapport printen</button></div>' +
        (j.afgesloten ? '<p class="uitleg">Een afgesloten jaar zit op slot: kosten en aangiftes in ' + esc(j.jaar) + ' kunnen pas weer veranderen na heropenen.</p>' : '') +
        (!j.kanAfsluiten && !j.afgesloten ? '<p class="uitleg">' + (lopend ? 'Afsluiten kan na 31 december.' : 'Afsluiten kan zodra er geen rode punten meer op de lijst staan.') + '</p>' : '') +
      '</div>' +
      '<div class="kaart mt geenprint"><h2>Pakket voor de accountant</h2><p class="ks">CSV-bestanden met puntkomma, te openen in Excel</p><div class="keuze">' + ex('jaaroverzicht', 'Jaaroverzicht') + ex('facturen', 'Facturen') + ex('debiteuren', 'Open posten') + ex('kosten', 'Kosten') + ex('btw', 'Btw per kwartaal') + '</div></div></div>' +
      '<div class="kaart"><h2>Accountant-agent</h2><p class="ks">Loopt het boekjaar na op wat een accountant vraagt. Een vraagteken kan Fysiplan zelf niet weten: dat kijk je samen na.</p>' +
        j.controles.map((c) => check(c.ok, c.titel, c.tekst)).join('') + '</div>' +
    '</div>';
}
function bindJaar(el) {
  bindExport(el);
  el.querySelectorAll('[data-jaar]').forEach((b) => b.addEventListener('click', () => { st.jaar = b.dataset.jaar; teken(); }));
  $('#sluitJaar', el)?.addEventListener('click', async () => { if (confirm('Boekjaar ' + st.jaar + ' afsluiten? De cijfers van nu worden vastgelegd en het jaar gaat op slot. Dit komt in het beheerlogboek.')) { const j = await post('afsluiten', { jaar: st.jaar }); if (j) melden('Boekjaar ' + st.jaar + ' is afgesloten.'); } });
  $('#heropenJaar', el)?.addEventListener('click', async () => { if (confirm('Boekjaar ' + st.jaar + ' heropenen?')) await post('afsluiten', { jaar: st.jaar, heropen: true }); });
  $('#print', el)?.addEventListener('click', () => print());
}

// ---------- start ----------
async function vernieuw() {
  try { await haal(); teken(); }
  catch (e) { $('#pagina').innerHTML = '<div class="kaart leeg">' + (e.message === 'toegang' ? 'Geen toegang. Log in met je beheeraccount; <a href="">herlaad de pagina</a>.' : 'De gegevens konden niet worden opgehaald. <a href="">Probeer het opnieuw</a>.') + '</div>'; }
}
window.addEventListener('hashchange', () => { sluitLade(); $('#melding').hidden = true; teken(); scrollTo(0, 0); });
function wissel(naar) {
  if (naar === bron) return;
  bron = naar;
  try { localStorage.setItem('fp-beheer-bron', bron); } catch {}
  sluitLade(); vernieuw();
}
$('#pagina').addEventListener('click', (e) => { if (e.target.closest('[data-naar-demo]')) wissel('demo'); });
$('#vernieuw').addEventListener('click', vernieuw);
$('#bronSchakel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bron]');
  if (b) wissel(b.dataset.bron);
});
$('#demoOpnieuw').addEventListener('click', async () => { if (confirm('De demo terugzetten naar het begin?')) { const j = await post('demo-opnieuw', {}); if (j) melden('Demo staat weer aan het begin.'); } });
$('#pagina').addEventListener('click', (e) => { const r = e.target.closest('tr[data-pk]'); if (r) openLade(r.dataset.pk); });
$('#pagina').addEventListener('keydown', (e) => { const r = e.target.closest('tr[data-pk]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLade(r.dataset.pk); } });
$('#lade').addEventListener('click', (e) => { if (e.target.id === 'lade') sluitLade(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#lade').hidden) sluitLade(); });

const sleutel = await vraagBeheersleutel();
if (!sleutel) $('#pagina').innerHTML = '<div class="kaart leeg">Log in met je beheeraccount om verder te gaan. <a href="">Opnieuw</a></div>';
else {
  HDR = { 'x-admin-sleutel': sleutel };
  await vernieuw();
  setInterval(() => { if (document.visibilityState === 'visible' && $('#lade').hidden) vernieuw(); }, 120000);
}
