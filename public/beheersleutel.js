export async function vraagBeheersleutel() {
  const opslag = 'fysiplan-beheersleutel';
  async function controleer(sleutel) {
    const antwoord = await fetch('/api/dashboard', {
      headers: { 'x-admin-sleutel': sleutel }, cache: 'no-store'
    });
    if (antwoord.status === 401 || antwoord.status === 403) return false;
    if (!antwoord.ok) throw new Error(antwoord.status === 429
      ? 'Te veel pogingen. Probeer het later opnieuw.'
      : 'Het dashboard is tijdelijk niet bereikbaar.');
    return true;
  }
  let bewaard;
  try { bewaard = sessionStorage.getItem(opslag); } catch {}
  if (bewaard) {
    try {
      if (await controleer(bewaard)) return bewaard;
      sessionStorage.removeItem(opslag);
    } catch {}
  }

  const dialoog = document.createElement('dialog');
  dialoog.setAttribute('aria-labelledby', 'beheerTitel');
  dialoog.innerHTML = `<form>
    <h2 id="beheerTitel">Fysiplan beheer</h2>
    <label>Beheersleutel <input type="password" required autofocus></label>
    <p role="status"></p>
    <button type="submit">Open beheer</button>
    <button type="button">Annuleren</button>
  </form>`;
  document.body.append(dialoog);
  const form = dialoog.querySelector('form');
  const veld = form.querySelector('input');
  const melding = form.querySelector('[role=status]');
  const openen = form.querySelector('[type=submit]');
  return new Promise(resolve => {
    let resultaat = '';
    dialoog.onclose = () => { dialoog.remove(); resolve(resultaat); };
    form.querySelector('[type=button]').onclick = () => dialoog.close();
    form.onsubmit = async event => {
      event.preventDefault();
      if (openen.disabled) return;
      openen.disabled = true;
      const sleutel = veld.value.trim();
      try {
        const geldig = sleutel && await controleer(sleutel);
        if (!dialoog.open) return;
        if (geldig) {
          try { sessionStorage.setItem(opslag, sleutel); } catch {}
          resultaat = sleutel;
          dialoog.close();
        } else {
          melding.textContent = 'Geen toegang met deze beheersleutel.';
          veld.select();
        }
      } catch (fout) {
        melding.textContent = fout.message;
      } finally { openen.disabled = false; }
    };
    dialoog.showModal();
  });
}
