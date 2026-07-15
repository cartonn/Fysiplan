/* Kleine QR-encoder voor de kaart-QR (geen externe libraries, net als de rest van Fysiplan).
   Byte-mode, foutcorrectieniveau M, versie 1-3 (ruim voldoende voor een korte kaart-URL).
   Gebaseerd op het QR-model-2-algoritme (ISO/IEC 18004). Gebruik: FYSIQR.svg(tekst, pixels). */
(function () {
  'use strict';

  // ---- GF(256)-rekenwerk voor Reed-Solomon ----
  var EXP = new Array(256), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1; if (x & 0x100) x ^= 0x11d;
    }
    EXP[255] = EXP[0];
  })();
  function gmul(a, b) { if (!a || !b) return 0; return EXP[(LOG[a] + LOG[b]) % 255]; }

  // generatorpolynoom van graad n
  function rsGenerator(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var ng = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) {
        ng[j] ^= g[j];
        ng[j + 1] ^= gmul(g[j], EXP[i]);
      }
      g = ng;
    }
    return g;
  }
  function rsRemainder(data, degree) {
    var gen = rsGenerator(degree);
    var res = data.concat(new Array(degree).fill(0));
    for (var i = 0; i < data.length; i++) {
      var f = res[i];
      if (f === 0) continue;
      for (var j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], f);
    }
    return res.slice(data.length);
  }

  // versie 1-3, niveau M, één ECC-blok: [datacodewoorden, ecc-codewoorden]
  var CAP = { 1: [16, 10], 2: [28, 16], 3: [44, 26] };
  var ALIGN = { 1: null, 2: 18, 3: 22 };

  function encodeData(text, version) {
    var bytes = [];
    // naar UTF-8-bytes (URL's zijn ASCII, maar voor de zekerheid)
    var enc = unescape(encodeURIComponent(text));
    for (var i = 0; i < enc.length; i++) bytes.push(enc.charCodeAt(i) & 0xff);
    var nData = CAP[version][0];
    if (bytes.length + 2 > nData) return null;
    var bits = [], push = function (val, len) { for (var b = len - 1; b >= 0; b--) bits.push((val >> b) & 1); };
    push(4, 4);                 // byte-mode
    push(bytes.length, 8);      // lengte (8 bits bij versie 1-9)
    bytes.forEach(function (by) { push(by, 8); });
    var maxBits = nData * 8;
    push(0, Math.min(4, maxBits - bits.length));   // terminator
    while (bits.length % 8) bits.push(0);
    var cw = [];
    for (var p = 0; p < bits.length; p += 8) {
      var v = 0;
      for (var q = 0; q < 8; q++) v = (v << 1) | bits[p + q];
      cw.push(v);
    }
    var pad = [0xec, 0x11], pi = 0;
    while (cw.length < nData) cw.push(pad[(pi++) % 2]);
    return cw.concat(rsRemainder(cw, CAP[version][1]));
  }

  // ---- matrixopbouw ----
  function makeMatrix(version, codewords, mask) {
    var size = 17 + 4 * version;
    var mod = [], fun = [];
    for (var r = 0; r < size; r++) { mod.push(new Array(size).fill(false)); fun.push(new Array(size).fill(false)); }
    function set(r, c, dark) { mod[r][c] = dark; fun[r][c] = true; }

    // zoekpatronen (met witte rand)
    function finder(row, col) {
      for (var r = -1; r <= 7; r++) for (var c = -1; c <= 7; c++) {
        var rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        var dark = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(rr, cc, dark);
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    // timingpatronen
    for (var t = 8; t < size - 8; t++) {
      if (!fun[6][t]) set(6, t, t % 2 === 0);
      if (!fun[t][6]) set(t, 6, t % 2 === 0);
    }

    // uitlijningspatroon (versie 2 en 3: één, in de rechteronderhoek)
    var ap = ALIGN[version];
    if (ap) {
      for (var ar = -2; ar <= 2; ar++) for (var ac = -2; ac <= 2; ac++) {
        set(ap + ar, ap + ac, Math.max(Math.abs(ar), Math.abs(ac)) !== 1);
      }
    }

    // formaatinfo-posities reserveren (waarde komt later)
    for (var f = 0; f < 8; f++) {
      if (!fun[f][8]) set(f, 8, false);
      if (!fun[8][f]) set(8, f, false);
      if (!fun[8][size - 1 - f]) set(8, size - 1 - f, false);
      if (!fun[size - 1 - f][8]) set(size - 1 - f, 8, false);
    }
    set(8, 8, false);
    set(size - 8, 8, true); // vaste donkere module

    // datamodules plaatsen: zigzag van rechtsonder omhoog, twee kolommen tegelijk
    var maskFn = [
      function (r, c) { return (r + c) % 2 === 0; },
      function (r, c) { return r % 2 === 0; },
      function (r, c) { return c % 3 === 0; },
      function (r, c) { return (r + c) % 3 === 0; },
      function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
      function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
      function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
      function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; }
    ][mask];
    var byteIdx = 0, bitIdx = 7, row = size - 1, up = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (var cc2 = 0; cc2 < 2; cc2++) {
          var c2 = col - cc2;
          if (!fun[row][c2]) {
            var dark = false;
            if (byteIdx < codewords.length) {
              dark = ((codewords[byteIdx] >> bitIdx) & 1) === 1;
              if (--bitIdx < 0) { byteIdx++; bitIdx = 7; }
            }
            if (maskFn(row, c2)) dark = !dark;
            mod[row][c2] = dark;
          }
        }
        row += up ? -1 : 1;
        if (row < 0 || row >= size) { row = up ? 0 : size - 1; up = !up; break; }
      }
    }

    // formaatinfo: niveau M (=0) + maskernummer, BCH(15,5)-gecodeerd
    var G15 = 0x537, G15MASK = 0x5412;
    function bchLen(v) { var d = 0; while (v) { d++; v >>>= 1; } return d; }
    var data = mask; // (M << 3) | mask, en M = 0
    var d15 = data << 10;
    while (bchLen(d15) - bchLen(G15) >= 0) d15 ^= G15 << (bchLen(d15) - bchLen(G15));
    var bits = ((data << 10) | d15) ^ G15MASK;
    for (var i = 0; i < 15; i++) {
      var on = ((bits >> i) & 1) === 1;
      // verticale kopie langs het zoekpatroon linksboven / linksonder
      if (i < 6) mod[i][8] = on;
      else if (i < 8) mod[i + 1][8] = on;
      else mod[size - 15 + i][8] = on;
      // horizontale kopie linksboven / rechtsboven
      if (i < 8) mod[8][size - i - 1] = on;
      else if (i < 9) mod[8][15 - i] = on;
      else mod[8][15 - i - 1] = on;
    }
    return mod;
  }

  // strafscore volgens de spec: zo kiest de encoder het best leesbare masker
  function penalty(m) {
    var size = m.length, score = 0, r, c;
    // regel 1: reeksen van 5+ gelijke modules in rij of kolom
    for (var dir = 0; dir < 2; dir++) {
      for (r = 0; r < size; r++) {
        var run = 1;
        for (c = 1; c < size; c++) {
          var cur = dir ? m[c][r] : m[r][c], prev = dir ? m[c - 1][r] : m[r][c - 1];
          if (cur === prev) { run++; if (c === size - 1 && run >= 5) score += 3 + run - 5; }
          else { if (run >= 5) score += 3 + run - 5; run = 1; }
        }
      }
    }
    // regel 2: 2x2-blokken van gelijke kleur
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
      if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) score += 3;
    }
    // regel 3: zoekpatroon-achtige reeks 1011101 met 4 witte ernaast
    var P1 = [true, false, true, true, true, false, true, false, false, false, false];
    var P2 = P1.slice().reverse();
    function hits(get, len) {
      var n = 0;
      for (var i = 0; i + 11 <= len; i++) {
        var ok1 = true, ok2 = true;
        for (var j = 0; j < 11; j++) {
          var v = get(i + j);
          if (v !== P1[j]) ok1 = false;
          if (v !== P2[j]) ok2 = false;
        }
        if (ok1) n++; if (ok2) n++;
      }
      return n;
    }
    for (r = 0; r < size; r++) {
      (function (rr) {
        score += 40 * hits(function (i) { return m[rr][i]; }, size);
        score += 40 * hits(function (i) { return m[i][rr]; }, size);
      })(r);
    }
    // regel 4: verhouding donker/licht
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
    score += 10 * Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5);
    return score;
  }

  function matrix(text) {
    var codewords = null, version = 0;
    for (var v = 1; v <= 3; v++) { codewords = encodeData(text, v); if (codewords) { version = v; break; } }
    if (!codewords) return null; // tekst te lang voor versie 3
    var best = null, bestScore = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      var m = makeMatrix(version, codewords, mk);
      var s = penalty(m);
      if (s < bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  // SVG-weergave met stille zone van 4 modules; schaalt scherp mee bij printen
  function svg(text, px) {
    var m = matrix(text);
    if (!m) return '';
    var n = m.length, Q = 4, total = n + 2 * Q;
    var path = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (m[r][c]) path += 'M' + (c + Q) + ' ' + (r + Q) + 'h1v1h-1z';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px +
      '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges">' +
      '<rect width="' + total + '" height="' + total + '" fill="#fff"/>' +
      '<path d="' + path + '" fill="#000"/></svg>';
  }

  window.FYSIQR = { matrix: matrix, svg: svg };
})();
