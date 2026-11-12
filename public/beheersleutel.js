// Inloggen voor de beheerpagina's (/admin88, /dashboard88, /content1000, /draft-review.html).
//
// vraagBeheersleutel() geeft terug wat de pagina in de kop x-admin-sleutel meestuurt:
// - "account": er is een beheerder ingelogd met een eigen account (e-mailadres, wachtwoord en
//   een tweede stap). De sessie zelf staat in een cookie die scripts niet kunnen lezen; dit
//   woord zegt alleen dat de pagina als beheer werkt.
// - de beheersleutel van de server: voor het eerste account, en voor wie er nog geen heeft;
// - "" als het venster is gesloten.
// Na het inloggen staat linksonder een strook met wie er is ingelogd, de accounts met het
// beheerlogboek, en uitloggen.
const OPSLAG = 'fysiplan-beheersleutel';
const json = (r) => r.json().catch(() => ({}));
const JSONKOP = { 'content-type': 'application/json' };

function el(tag, eig, ...kinderen) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eig || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kinderen.flat()) if (k != null && k !== false) e.append(k);
  return e;
}
function veld(tekst, eig) {
  const input = el('input', eig);
  return { input, label: el('label', {}, tekst, input) };
}
const moment = (iso) => {
  const d = new Date(iso);
  return iso && !isNaN(d) ? d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
};
async function kopieer(tekst, knop) {
  const was = knop.textContent;
  try { await navigator.clipboard.writeText(tekst); knop.textContent = 'Gekopieerd'; }
  catch { knop.textContent = 'Kopiëren lukt niet; selecteer de tekst'; }
  setTimeout(() => { knop.textContent = was; }, 2500);
}

// De eerste regel zet alles terug naar de standaard van de browser: elke beheerpagina heeft haar
// eigen stijl voor koppen, labels, tabellen en knoppen, en die hoort hier niet naar binnen te lekken.
function stijl() {
  if (document.getElementById('fpbStijl')) return;
  document.head.append(el('style', { id: 'fpbStijl', text: `
dialog.fpb,dialog.fpb *,.fpb-strook,.fpb-strook *{all:revert;box-sizing:border-box}
.fpb [hidden]{display:none!important}
dialog.fpb{font:15px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#18343b;background:#fff;border:0;border-radius:14px;padding:0;width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;box-shadow:0 18px 60px rgba(24,52,59,.28)}
dialog.fpb.breed{width:min(820px,calc(100vw - 24px))}
dialog.fpb::backdrop{background:rgba(24,52,59,.45)}
.fpb form,.fpb .blad{padding:22px;display:grid;gap:12px;margin:0}
.fpb h2{font-size:19px;line-height:1.25;margin:0;font-weight:700}
.fpb h3{font-size:15px;margin:10px 0 0;font-weight:700}
.fpb p{margin:0}
.fpb label{display:grid;gap:4px;font-weight:600;font-size:13.5px}
.fpb input{font:inherit;font-weight:400;padding:10px 11px;border:1px solid #b9c6c4;border-radius:9px;color:inherit;background:#fff;width:100%}
.fpb label.vink{display:flex;gap:8px;align-items:flex-start;font-weight:500}
.fpb label.vink input{width:auto;margin:3px 0 0;padding:0}
.fpb input:focus-visible,.fpb button:focus-visible,.fpb-strook button:focus-visible{outline:3px solid #b9e34b;outline-offset:1px}
.fpb .rij{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fpb .rij.eind{align-items:flex-end}
.fpb .rij label{flex:1 1 180px}
.fpb button{font-family:inherit;font-weight:600;font-size:14px;line-height:1;padding:11px 14px;border-radius:9px;border:1px solid #18343b;background:#fff;color:#18343b;cursor:pointer}
.fpb button.hoofd{background:#18343b;color:#fff}
.fpb button.klein{padding:7px 9px;font-size:12.5px}
.fpb button.link{border:0;background:none;padding:2px 0;text-decoration:underline;font-weight:500;justify-self:start}
.fpb button[disabled]{opacity:.55;cursor:default}
.fpb [role=status]{min-height:1.3em;color:#8a2b17;font-size:13.5px}
.fpb [role=status].goed{color:#1d5c3a}
.fpb .uitleg{color:#48605f;font-size:13.5px}
.fpb .kader{border:1px solid #d5dedc;border-radius:10px;padding:12px;display:grid;gap:8px;background:#f2f5f3}
.fpb .qr{background:#fff;padding:6px;border:1px solid #d5dedc;border-radius:10px;line-height:0;width:max-content}
.fpb .mono{font:600 14px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;user-select:all;word-break:break-word}
.fpb table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.4}
.fpb th,.fpb td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e9e7;vertical-align:top}
.fpb th{font-size:12px;color:#48605f}
.fpb .scroll{max-height:34vh;overflow:auto;border:1px solid #e3e9e7;border-radius:10px}
.fpb-strook{position:fixed;left:12px;bottom:12px;z-index:2147483000;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 24px);font:13px/1.2 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;background:#18343b;color:#fff;border-radius:18px;padding:7px 8px 7px 14px;box-shadow:0 6px 22px rgba(24,52,59,.3)}
.fpb-strook button{font-family:inherit;font-weight:600;font-size:12.5px;line-height:1;border:0;border-radius:999px;padding:7px 10px;background:#b9e34b;color:#18343b;cursor:pointer}
.fpb-strook button.stil{background:rgba(255,255,255,.16);color:#fff}
@media print{.fpb-strook{display:none}}
` }));
}

// wie hoort er bij deze kop? { email, naam, … } voor een account, "beheersleutel", of null
async function ik(kop) {
  const r = await fetch('/api/beheer/ik', { headers: { 'x-admin-sleutel': kop }, cache: 'no-store' });
  if (r.status === 429) throw new Error('Te veel pogingen. Probeer het later opnieuw.');
  if (!r.ok) throw new Error('Fysiplan is tijdelijk niet bereikbaar.');
  return (await json(r)).wie || null;
}
function laadQr() {
  if (window.FYSIQR) return Promise.resolve();
  return new Promise((klaar) => { document.head.append(el('script', { src: '/qr.js', onload: klaar, onerror: klaar })); });
}
function nieuwVenster(breed) {
  stijl();
  const d = el('dialog', { class: 'fpb' + (breed ? ' breed' : ''), 'aria-labelledby': 'fpbTitel' });
  document.body.append(d);
  return d;
}

export async function vraagBeheersleutel() {
  // al ingelogd met een account?
  try { const wie = await ik('account'); if (wie && wie.email) { toonStrook('account', wie); return 'account'; } } catch {}
  // een sleutel uit deze browsersessie die nog werkt?
  let bewaard = '';
  try { bewaard = sessionStorage.getItem(OPSLAG) || ''; } catch {}
  if (bewaard) {
    try {
      if (await ik(bewaard) === 'beheersleutel') { toonStrook(bewaard); return bewaard; }
      sessionStorage.removeItem(OPSLAG);
    } catch {}
  }
  const uit = await inlogVenster();
  if (uit.kop) toonStrook(uit.kop, uit.wie);
  return uit.kop;
}

// ---- inloggen: met een account, of met de sleutel ----
function inlogVenster(vooraf) {
  return new Promise((klaar) => {
    const d = nieuwVenster();
    const uit = { kop: '', wie: null };
    d.addEventListener('close', () => { d.remove(); klaar(uit); });
    const sluit = (kop, wie) => { uit.kop = kop; uit.wie = wie || null; d.close(); };
    // de sessie bestaat al terwijl het venster nog openstaat (de reservecodes): hoe het venster
    // daarna ook dichtgaat, de pagina werkt als ingelogd
    sluit.ingelogd = (wie) => { uit.kop = 'account'; uit.wie = wie || null; };
    toonInlog(d, sluit, vooraf || {});
    d.showModal();
  });
}
function toonInlog(d, sluit, vooraf) {
  const email = veld('E-mailadres', { type: 'email', autocomplete: 'username', required: true, id: 'fpbEmail', value: vooraf.email || '' });
  const ww = veld('Wachtwoord', { type: 'password', autocomplete: 'current-password', required: true, id: 'fpbWw', value: vooraf.wachtwoord || '' });
  const code = veld('Code uit je code-app, of een reservecode', { type: 'text', autocomplete: 'one-time-code', maxlength: 24, id: 'fpbCode' });
  code.label.hidden = true;
  const status = el('p', { role: 'status' });
  const knop = el('button', { type: 'submit', class: 'hoofd', text: 'Inloggen' });
  const form = el('form', {},
    el('h2', { id: 'fpbTitel', text: 'Fysiplan beheer' }),
    email.label, ww.label, code.label, status,
    el('div', { class: 'rij' }, knop, el('button', { type: 'button', text: 'Annuleren', onclick: () => d.close() })),
    el('button', { type: 'button', class: 'link', id: 'fpbNaarSleutel', text: 'Inloggen met de beheersleutel', onclick: () => toonSleutel(d, sluit) }));
  async function verstuur() {
    if (knop.disabled) return;
    knop.disabled = true;
    status.textContent = '';
    const lijf = { email: email.input.value.trim(), wachtwoord: ww.input.value };
    if (!code.label.hidden) lijf.code = code.input.value.trim();
    try {
      const r = await fetch('/api/beheer/login', { method: 'POST', headers: JSONKOP, body: JSON.stringify(lijf) });
      const j = await json(r);
      if (!d.open) return;
      if (r.ok && j.ok) { sluit('account', j.wie); return; }
      if (j.stapInstellen && j.geheim) { await toonInstellen(d, sluit, lijf, j); return; }
      // adresOpSlot: te veel foute wachtwoorden op dit adres. De server zegt dan niet meer of het
      // wachtwoord klopt; met wachtwoord én code komt de eigenaar er nog in, dus het codeveld erbij.
      if (j.tweedeStap || j.adresOpSlot) {
        const stondEr = !code.label.hidden;
        code.label.hidden = false;
        status.textContent = j.adresOpSlot || stondEr || r.status !== 401 ? (j.fout || '') : '';
        code.input.focus(); code.input.select();
        return;
      }
      status.textContent = j.fout || 'Inloggen lukte niet.';
    } catch { status.textContent = 'Geen verbinding met Fysiplan. Probeer het opnieuw.'; }
    finally { knop.disabled = false; }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); verstuur(); });
  d.replaceChildren(form);
  (vooraf.email ? ww.input : email.input).focus();
  if (vooraf.email && vooraf.wachtwoord) verstuur();
}
function toonSleutel(d, sluit) {
  const sleutel = veld('Beheersleutel', { type: 'password', autocomplete: 'off', required: true, id: 'fpbSleutel' });
  const status = el('p', { role: 'status' });
  const knop = el('button', { type: 'submit', class: 'hoofd', text: 'Open beheer' });
  const form = el('form', {},
    el('h2', { id: 'fpbTitel', text: 'Fysiplan beheer' }),
    el('p', { class: 'uitleg', text: 'De sleutel van de server is van niemand persoonlijk. Gebruik hem om je eigen account te maken; daarna log je in met je account.' }),
    sleutel.label, status,
    el('div', { class: 'rij' }, knop, el('button', { type: 'button', text: 'Annuleren', onclick: () => d.close() })),
    el('button', { type: 'button', class: 'link', text: 'Inloggen met een eigen account', onclick: () => toonInlog(d, sluit, {}) }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (knop.disabled) return;
    knop.disabled = true;
    const waarde = sleutel.input.value.trim();
    try {
      const goed = waarde && waarde !== 'account' && await ik(waarde) === 'beheersleutel';
      if (!d.open) return;
      if (goed) {
        try { sessionStorage.setItem(OPSLAG, waarde); } catch {}
        sluit(waarde);
      } else {
        status.textContent = 'Geen toegang met deze beheersleutel.';
        sleutel.input.select();
      }
    } catch (fout) { status.textContent = fout.message; }
    finally { knop.disabled = false; }
  });
  d.replaceChildren(form);
  sleutel.input.focus();
}

// ---- de eerste keer: eigen wachtwoord kiezen en de tweede stap instellen ----
async function toonInstellen(d, sluit, inlog, antwoord) {
  await laadQr();
  let geheim = antwoord.geheim;
  const wwMin = antwoord.wwMin || 12;
  const qr = el('div', { class: 'qr', id: 'fpbQr', role: 'img', 'aria-label': 'QR-code om te scannen met je code-app' });
  const sleutelTekst = el('div', { class: 'mono', id: 'fpbGeheim' });
  // de QR wordt hier in de browser getekend; de link met het geheim gaat nergens anders heen
  const teken = (a) => {
    geheim = a.geheim;
    const svg = window.FYSIQR ? window.FYSIQR.svg(a.uri, 176, true) : '';
    qr.hidden = !svg;
    qr.innerHTML = svg;
    sleutelTekst.textContent = String(a.geheim).replace(/(.{4})(?=.)/g, '$1 ');
  };
  teken(antwoord);
  const nieuw = veld('Je eigen wachtwoord (minstens ' + wwMin + ' tekens)', { type: 'password', autocomplete: 'new-password', required: true, id: 'fpbNieuw' });
  const herhaal = veld('Herhaal je wachtwoord', { type: 'password', autocomplete: 'new-password', required: true, id: 'fpbHerhaal' });
  const code = veld('De zes cijfers die de code-app nu toont', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, required: true, id: 'fpbEersteCode' });
  const status = el('p', { role: 'status' });
  const knop = el('button', { type: 'submit', class: 'hoofd', text: 'Instellen en inloggen' });
  const form = el('form', {},
    el('h2', { id: 'fpbTitel', text: 'Je beheeraccount instellen' }),
    el('p', { class: 'uitleg', text: 'Je logt voor het eerst in. Kies een eigen wachtwoord en koppel een code-app op je telefoon. Daarna werkt het startwachtwoord niet meer.' }),
    el('h3', { text: '1. Kies een eigen wachtwoord' }), nieuw.label, herhaal.label,
    el('h3', { text: '2. Scan de code met je code-app' }),
    el('p', { class: 'uitleg', text: 'Bijvoorbeeld Google Authenticator, Microsoft Authenticator, 1Password of de wachtwoordapp van je telefoon.' }),
    qr,
    el('p', { class: 'uitleg', text: 'Lukt scannen niet? Kies in de app voor handmatig invoeren (op tijd gebaseerd) en vul deze sleutel in:' }), sleutelTekst,
    el('h3', { text: '3. Vul de code in' }), code.label, status,
    el('div', { class: 'rij' }, knop, el('button', { type: 'button', text: 'Annuleren', onclick: () => d.close() })));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (knop.disabled) return;
    status.textContent = '';
    if (nieuw.input.value.length < wwMin) { status.textContent = 'Kies een eigen wachtwoord van minstens ' + wwMin + ' tekens.'; nieuw.input.focus(); return; }
    if (nieuw.input.value !== herhaal.input.value) { status.textContent = 'De twee wachtwoorden zijn niet gelijk.'; herhaal.input.focus(); return; }
    knop.disabled = true;
    try {
      const r = await fetch('/api/beheer/login', { method: 'POST', headers: JSONKOP,
        body: JSON.stringify({ email: inlog.email, wachtwoord: inlog.wachtwoord, geheim, code: code.input.value.trim(), nieuw: nieuw.input.value }) });
      const j = await json(r);
      if (!d.open) return;
      if (r.ok && j.ok) { toonReservecodes(d, sluit, j); return; }
      // een verlopen of elders opnieuw begonnen instelling: de server gaf een nieuwe QR
      if (j.stapInstellen && j.geheim) { teken(j); code.input.value = ''; }
      status.textContent = j.fout || 'Instellen lukte niet.';
      if (j.code) { code.input.focus(); code.input.select(); }
    } catch { status.textContent = 'Geen verbinding met Fysiplan. Probeer het opnieuw.'; }
    finally { knop.disabled = false; }
  });
  d.replaceChildren(form);
  nieuw.input.focus();
}
function toonReservecodes(d, sluit, j) {
  sluit.ingelogd(j.wie);
  // de codes zijn alleen nu te zien: Escape sluit dit venster niet, de knop wel
  d.addEventListener('cancel', (e) => e.preventDefault());
  const codes = (j.reservecodes || []).join('\n');
  const kop = el('button', { type: 'button', text: 'Kopieer', onclick: () => kopieer(codes, kop) });
  d.replaceChildren(el('div', { class: 'blad' },
    el('h2', { id: 'fpbTitel', text: 'Bewaar je reservecodes' }),
    el('p', { class: 'uitleg', text: 'Met een reservecode log je in als je telefoon weg is. Elke code werkt één keer. Je ziet ze alleen nu: bewaar ze op een veilige plek, niet op je telefoon.' }),
    el('div', { class: 'kader mono', id: 'fpbReserve', style: 'white-space:pre-line', text: codes }),
    el('div', { class: 'rij' }, el('button', { type: 'button', class: 'hoofd', id: 'fpbBewaard', text: 'Ik heb ze bewaard', onclick: () => sluit('account', j.wie) }), kop)));
}

// ---- de strook linksonder ----
function toonStrook(kop, wie) {
  stijl();
  const oud = document.getElementById('fpbStrook');
  if (oud) oud.remove();
  const metAccount = kop === 'account';
  const strook = el('div', { class: 'fpb-strook', id: 'fpbStrook', role: 'region', 'aria-label': 'Beheer' },
    el('span', { id: 'fpbWie', text: metAccount ? 'Beheer: ' + ((wie && (wie.naam || wie.email)) || 'ingelogd') : 'Beheer met de gedeelde sleutel' }),
    el('button', { type: 'button', id: 'fpbOpenBeheer', text: metAccount ? 'Accounts en logboek' : 'Maak een eigen account', onclick: () => beheerVenster(kop, wie) }),
    el('button', { type: 'button', class: 'stil', id: 'fpbUit', text: metAccount ? 'Uitloggen' : 'Vergeet sleutel', onclick: async (e) => {
      e.target.disabled = true;
      if (metAccount) {
        try {
          const r = await fetch('/api/beheer/logout', { method: 'POST', headers: JSONKOP, body: '{}' });
          await r.text();
          if (!r.ok) throw new Error();
        } catch {
          // alleen de server kan de cookie weghalen: zonder antwoord ben je hier nog ingelogd
          e.target.disabled = false;
          alert('Uitloggen lukte niet: er is geen verbinding met Fysiplan. Je bent op deze computer nog ingelogd.');
          return;
        }
      } else {
        try { sessionStorage.removeItem(OPSLAG); } catch {}
      }
      location.reload();
    } }));
  document.body.append(strook);
}

// ---- accounts, het eigen wachtwoord en het beheerlogboek ----
async function beheerVenster(kop, wie) {
  const d = nieuwVenster(true);
  d.addEventListener('close', () => d.remove());
  const KOP = { ...JSONKOP, 'x-admin-sleutel': kop };
  const status = el('p', { role: 'status', id: 'fpbBeheerStatus' });
  const inhoud = el('div', { class: 'blad' });
  d.append(inhoud);
  d.showModal();
  const meld = (tekst, goed) => { status.textContent = tekst || ''; status.classList.toggle('goed', !!goed); };
  let startKader = null; // het startwachtwoord van het account dat net is gemaakt

  async function maak(email, naam) {
    meld('');
    const r = await fetch('/api/beheer/accounts', { method: 'POST', headers: KOP, body: JSON.stringify({ email, naam }) });
    const j = await json(r);
    if (!r.ok || !j.ok) { meld(j.fout || 'Het account maken lukte niet.'); return; }
    const kopieerKnop = el('button', { type: 'button', class: 'klein', text: 'Kopieer', onclick: () => kopieer(j.startwachtwoord, kopieerKnop) });
    startKader = el('div', { class: 'kader', id: 'fpbStart' },
      el('p', {}, el('b', { text: 'Startwachtwoord voor ' + j.account.naam + ' (' + j.account.email + ')' })),
      el('div', { class: 'mono', id: 'fpbStartWw', text: j.startwachtwoord }),
      el('p', { class: 'uitleg', text: 'Je ziet het alleen nu, en het is ' + j.geldigDagen + ' dagen geldig. Geef het door langs een weg die je vertrouwt, bijvoorbeeld mondeling. Bij de eerste keer inloggen kiest de eigenaar een eigen wachtwoord en stelt de tweede stap in; daarna werkt dit startwachtwoord niet meer.' }),
      el('div', { class: 'rij' }, kopieerKnop,
        // wie met de sleutel werkt, maakt meestal het eigen account: meteen door naar het instellen
        kop !== 'account' && el('button', { type: 'button', class: 'klein hoofd', id: 'fpbNuInstellen', text: 'Dit is mijn eigen account: nu instellen', onclick: async () => {
          d.close();
          const uit = await inlogVenster({ email: j.account.email, wachtwoord: j.startwachtwoord });
          if (uit.kop === 'account') { try { sessionStorage.removeItem(OPSLAG); } catch {} location.reload(); }
        } })));
    await laad();
  }
  async function zetUit(a) {
    if (!confirm('Het beheeraccount van ' + (a.naam || a.email) + ' uitzetten? Inloggen kan daarna niet meer; het wachtwoord en de tweede stap vervallen.')) return;
    meld('');
    const r = await fetch('/api/beheer/accounts/uit', { method: 'POST', headers: KOP, body: JSON.stringify({ email: a.email }) });
    const j = await json(r);
    if (!r.ok || !j.ok) { meld(j.fout || 'Uitzetten lukte niet.'); return; }
    if (kop === 'account' && wie && a.email === wie.email) { location.reload(); return; }
    await laad();
    meld('Het account van ' + (a.naam || a.email) + ' staat uit.', true);
  }
  function wachtwoordBlok() {
    const huidig = veld('Huidig wachtwoord', { type: 'password', autocomplete: 'current-password', required: true, id: 'fpbHuidig' });
    const nieuw = veld('Nieuw wachtwoord', { type: 'password', autocomplete: 'new-password', required: true, id: 'fpbWwNieuw' });
    const code = veld('Code uit je code-app', { type: 'text', autocomplete: 'one-time-code', maxlength: 24, required: true, id: 'fpbWwCode' });
    const knop = el('button', { type: 'submit', class: 'klein', text: 'Wijzig wachtwoord' });
    const form = el('form', { style: 'padding:0' }, el('div', { class: 'rij eind' }, huidig.label, nieuw.label, code.label, knop));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (knop.disabled) return;
      knop.disabled = true;
      meld('');
      try {
        const r = await fetch('/api/beheer/wachtwoord', { method: 'POST', headers: KOP, body: JSON.stringify({ huidig: huidig.input.value, nieuw: nieuw.input.value, code: code.input.value.trim() }) });
        const j = await json(r);
        if (r.ok && j.ok) { form.reset(); meld('Je wachtwoord is gewijzigd. Op andere apparaten ben je uitgelogd.', true); }
        else meld(j.fout || 'Wijzigen lukte niet.');
      } catch { meld('Geen verbinding met Fysiplan. Probeer het opnieuw.'); }
      finally { knop.disabled = false; }
    });
    return form;
  }
  // De noodprocedure: een praktijk die er niet meer in komt, krijgt een herstelmail op een adres
  // dat ze zelf heeft opgegeven. Beheer ziet de link of code niet en komt zelf niet bij de kaarten.
  function herstelBlok() {
    const praktijk = veld('Praktijk (naam of praktijkcode p-…)', { type: 'text', required: true, maxlength: 80, id: 'fpbHerstelPraktijk', autocomplete: 'off' });
    const reden = veld('Reden (komt in de mail en in het logboek van de praktijk)', { type: 'text', required: true, maxlength: 160, id: 'fpbHerstelReden', autocomplete: 'off' });
    const stap = el('input', { type: 'checkbox', id: 'fpbHerstelStap' });
    const knop = el('button', { type: 'submit', class: 'klein', text: 'Stuur herstelmail' });
    const form = el('form', { style: 'padding:0', id: 'fpbHerstel' },
      el('div', { class: 'rij eind' }, praktijk.label, reden.label, knop),
      el('label', { class: 'vink' }, stap, 'De beheerder van de praktijk is ook de tweede stap kwijt (telefoon en reservecodes): die vervalt dan met de link'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (knop.disabled) return;
      knop.disabled = true;
      meld('');
      try {
        const r = await fetch('/api/beheer/praktijk-herstel', { method: 'POST', headers: KOP,
          body: JSON.stringify({ praktijk: praktijk.input.value.trim(), reden: reden.input.value.trim(), ...(stap.checked ? { tweedeStap: true } : {}) }) });
        const j = await json(r);
        if (r.ok && j.ok) {
          const tekst = 'De herstelmail is verstuurd naar ' + (j.naar || []).join(', ') + '. ' + (j.soort === 'herstelcode' ? 'De herstelcode' : 'De link') +
            ' is 48 uur geldig. Tot de praktijk die gebruikt, verandert er niets.' + (j.tweedeStap ? ' Met de link vervalt ook de tweede stap.' : '');
          await laad();
          meld(tekst, true);
        } else meld((j.fout || 'De herstelmail sturen lukte niet.') + (Array.isArray(j.codes) && j.codes.length ? ' Praktijkcodes: ' + j.codes.join(', ') + '.' : ''));
      } catch { meld('Geen verbinding met Fysiplan. Probeer het opnieuw.'); }
      finally { knop.disabled = false; }
    });
    return form;
  }
  const detail = (r) => [r.status != null ? 'antwoord ' + r.status : '', r.afgebroken ? 'verbinding afgebroken' : '', r.doel, r.naam && r.praktijk ? r.naam : '',
    r.praktijk ? 'praktijk ' + r.praktijk : '', r.reden ? 'reden: ' + r.reden : '', r.naar ? 'naar ' + r.naar : '', r.tweedeStap ? 'tweede stap ' + r.tweedeStap : '', r.pad]
    .filter(Boolean).join(' · ');
  async function laad() {
    let j = {};
    try {
      const r = await fetch('/api/beheer/overzicht', { headers: KOP, cache: 'no-store' });
      j = await json(r);
      if (r.status === 403 && j.geenRecht) j = { geenRecht: j.geenRecht };
      else if (!r.ok || !j.ok) j = { fout: r.status === 403 ? 'Hier kom je alleen met een beheeraccount of met de eigen sleutel van de server. De standaardsleutel van een lokale server maakt geen accounts.' : (j.fout || 'Het overzicht is niet bereikbaar.') };
    } catch { j = { fout: 'Geen verbinding met Fysiplan.' }; }
    const sluitKnop = el('button', { type: 'button', text: 'Sluiten', onclick: () => d.close() });
    // een account met beperkte rechten beheert geen accounts, maar wel het eigen wachtwoord
    if (j.geenRecht && kop === 'account') {
      inhoud.replaceChildren(el('h2', { id: 'fpbTitel', text: 'Je account' }),
        el('p', { class: 'uitleg', text: 'Je account werkt in de beheer- en finance-omgeving, met de rechten die een beheerder je gaf. Accounts en het logboek zijn er voor wie volledig beheer heeft.' }),
        el('h3', { text: 'Je eigen wachtwoord' }), wachtwoordBlok(), status, el('div', { class: 'rij' }, sluitKnop));
      return;
    }
    if (j.fout) { inhoud.replaceChildren(el('h2', { id: 'fpbTitel', text: 'Beheer' }), el('p', { role: 'status', text: j.fout }), el('div', { class: 'rij' }, sluitKnop)); return; }
    const naam = veld('Naam', { type: 'text', required: true, maxlength: 60, id: 'fpbNaam', autocomplete: 'off' });
    const email = veld('E-mailadres', { type: 'email', required: true, maxlength: 120, id: 'fpbNieuwEmail', autocomplete: 'off' });
    const maakKnop = el('button', { type: 'submit', class: 'klein hoofd', text: 'Maak account' });
    const maakForm = el('form', { style: 'padding:0', id: 'fpbMaak' }, el('div', { class: 'rij eind' }, naam.label, email.label, maakKnop));
    maakForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (maakKnop.disabled) return;
      maakKnop.disabled = true;
      try { await maak(email.input.value.trim(), naam.input.value.trim()); }
      catch { meld('Geen verbinding met Fysiplan. Probeer het opnieuw.'); }
      finally { maakKnop.disabled = false; }
    });
    const rijen = (j.accounts || []).map((a) => el('tr', {},
      el('td', { text: a.naam || '' }), el('td', { text: a.email }), el('td', { text: a.status + (a.status === 'uit' && a.uitDoor ? ' (door ' + a.uitDoor + ')' : '') }),
      el('td', { text: moment(a.laatst) || 'nog niet' }),
      el('td', {}, el('div', { class: 'rij' },
        a.status !== 'actief' && el('button', { type: 'button', class: 'klein', text: 'Nieuw startwachtwoord', onclick: () => maak(a.email, a.naam || a.email).catch(() => meld('Geen verbinding met Fysiplan.')) }),
        a.status !== 'uit' && el('button', { type: 'button', class: 'klein', text: 'Zet uit', onclick: () => zetUit(a).catch(() => meld('Geen verbinding met Fysiplan.')) })))));
    const logRijen = (j.log || []).map((r) => el('tr', {}, el('td', { text: moment(r.t) }), el('td', { text: r.wie || '' }), el('td', { text: r.actie || '' }), el('td', { text: detail(r) })));
    // replaceChildren maakt van null of false de tekst "null" of "false": eerst eruit halen
    inhoud.replaceChildren(...[
      el('h2', { id: 'fpbTitel', text: 'Beheeraccounts en logboek' }),
      el('p', { class: 'uitleg', text: 'Elke beheerder heeft een eigen account met een tweede stap. ' +
        (j.sleutelAan ? 'De sleutel van de server (ADMIN_KEY) werkt ook nog; haal hem daar weg zodra iedereen een account heeft en de uploadscripts hem niet nodig hebben.' : 'De sleutel van de server staat uit: beheer kan alleen met een account.') +
        (j.mail ? ' Bij een account erbij of eraf krijgen de beheerders een mail.' : '') }),
      el('div', { class: 'scroll' }, el('table', { id: 'fpbAccounts' },
        el('thead', {}, el('tr', {}, ...['Naam', 'E-mailadres', 'Stand', 'Laatst ingelogd', ''].map((t) => el('th', { text: t })))),
        el('tbody', {}, rijen.length ? rijen : el('tr', {}, el('td', { colspan: 5, text: 'Er zijn nog geen beheeraccounts.' }))))),
      el('h3', { text: 'Account maken' }),
      el('p', { class: 'uitleg', text: 'Het nieuwe account krijgt een startwachtwoord dat ' + j.startDagen + ' dagen geldig is. Een account dat uit staat of nooit is gebruikt, maak je zo ook opnieuw.' }),
      maakForm, startKader,
      kop === 'account' && el('h3', { text: 'Mijn wachtwoord wijzigen' }),
      kop === 'account' && wachtwoordBlok(),
      el('h3', { text: 'Een praktijk komt er niet meer in' }),
      el('p', { class: 'uitleg', text: 'Is een praktijk haar wachtwoord kwijt en kan ze zelf geen nieuw aanvragen? Dan stuurt Fysiplan een herstelmail naar een adres dat de praktijk zelf heeft opgegeven. Jij ziet de link of code niet, en beheer komt hiermee niet bij de kaarten. De reden staat in de mail, in het logboek van de praktijk en hieronder.' + (j.mail ? '' : ' Op deze server staat mail niet aan: een herstelmail sturen kan nu niet.') }),
      herstelBlok(),
      status,
      el('h3', { text: 'Beheerlogboek' }),
      el('p', { class: 'uitleg', text: 'De laatste honderd regels: wie van beheer wat deed. Regels kunnen niet worden gewijzigd of gewist.' }),
      el('div', { class: 'scroll' }, el('table', { id: 'fpbLog' },
        el('thead', {}, el('tr', {}, ...['Wanneer', 'Wie', 'Wat', 'Bijzonderheden'].map((t) => el('th', { text: t })))),
        el('tbody', {}, logRijen.length ? logRijen : el('tr', {}, el('td', { colspan: 4, text: 'Nog niets.' }))))),
      el('div', { class: 'rij' }, sluitKnop)].filter(Boolean));
  }
  await laad();
}
