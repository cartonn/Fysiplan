(function () {
  'use strict';
  var root = document.getElementById('prijs-calculator');
  if (!root) return;
  var custom = document.getElementById('prijs-aantal');
  var total = document.getElementById('prijs-totaal');
  var explanation = document.getElementById('prijs-toelichting');
  var error = document.getElementById('prijs-fout');
  var radios = root.querySelectorAll('input[type=radio]');
  var money = new Intl.NumberFormat('nl-NL', {style:'currency', currency:'EUR'});
  // de prijs en het bijschrift over de btw komen van de pagina (de server vult ze in uit lib/prijs.js)
  var cent = Number(root.getAttribute('data-prijs-cent')) || 999;
  var btw = root.getAttribute('data-btw') || 'excl. btw';
  function render(raw) {
    var count = Number(raw);
    var valid = /^\d+$/.test(raw) && count >= 1 && Number.isSafeInteger(count * cent);
    error.hidden = valid;
    custom.setAttribute('aria-invalid', String(!valid));
    total.textContent = valid ? money.format(count * cent / 100) : '—';
    explanation.textContent = valid ? 'per maand voor ' + count + (count === 1 ? ' therapeut' : ' therapeuten') + ', ' + btw + '.' : 'Vul een geldig aantal in om de prijs te berekenen.';
  }
  radios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (!radio.checked) return;
      custom.value = '';
      render(radio.value);
    });
  });
  custom.addEventListener('input', function () {
    radios.forEach(function (radio) { radio.checked = false; });
    render(custom.value);
  });
})();
