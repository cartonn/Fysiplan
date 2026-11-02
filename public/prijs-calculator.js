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
  function render(raw) {
    var count = Number(raw);
    var valid = /^\d+$/.test(raw) && count >= 1 && Number.isSafeInteger(count * 999);
    error.hidden = valid;
    custom.setAttribute('aria-invalid', String(!valid));
    total.textContent = valid ? money.format(count * 999 / 100) : '—';
    explanation.textContent = valid ? 'per maand voor ' + count + (count === 1 ? ' therapeut' : ' therapeuten') + ', excl. btw.' : 'Vul een geldig aantal in om de prijs te berekenen.';
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
