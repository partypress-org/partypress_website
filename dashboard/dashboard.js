/* PARTYPRESS dashboard — static, reads JSON built by scripts/build_website_data.py */
(function () {
  'use strict';

  var DATA = 'data/';
  var MAX_SERIES = 5;
  var SLOTS = 5; // categorical colour slots --series-1 … --series-5
  var SHORT_TOPIC = {
    1: 'Macroeconomics', 2: 'Civil rights', 3: 'Health', 4: 'Agriculture', 5: 'Labour',
    6: 'Education', 7: 'Environment', 8: 'Energy', 9: 'Immigration', 10: 'Transport',
    12: 'Law and crime', 13: 'Social welfare', 14: 'Housing', 15: 'Domestic commerce',
    16: 'Defence', 17: 'Technology', 18: 'Foreign trade', 19: 'International affairs',
    20: 'Government operations', 21: 'Public lands', 23: 'Culture'
  };
  var DEFAULT_TOPICS = [8, 7, 9];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var SVGNS = 'http://www.w3.org/2000/svg';

  var meta = null;
  var cache = {};
  var state = {
    mode: 'topics', country: null, party: null, topic: 8, res: 'quarter', min: 10,
    selected: [] // [{key, slot}] — slot is fixed per entity so survivors never repaint
  };
  var view = null; // last rendered series, for table/CSV/tooltip

  var $ = function (id) { return document.getElementById(id); };
  var fmtInt = function (n) { return n.toLocaleString('en-GB'); };
  var cssVar = function (name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };
  var slotColor = function (slot) { return cssVar('--series-' + (slot + 1)); };

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(tag, attrs, text) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- periods ---------- */
  function periodIndex(t) { // "YYYY-MM" -> months since year 0
    return (+t.slice(0, 4)) * 12 + (+t.slice(5, 7)) - 1;
  }
  function periodLabel(idx, res) {
    var y = Math.floor(idx / 12), m = idx % 12;
    return res === 'quarter' ? y + ' Q' + (Math.floor(m / 3) + 1) : MONTHS[m] + ' ' + y;
  }
  function periodKey(idx) {
    var y = Math.floor(idx / 12), m = idx % 12 + 1;
    return y + '-' + (m < 10 ? '0' : '') + m;
  }

  /* ---------- data ---------- */
  function getJSON(path) {
    if (!cache[path]) {
      cache[path] = fetch(DATA + path).then(function (r) {
        if (!r.ok) throw new Error(path + ': ' + r.status);
        return r.json();
      });
    }
    return cache[path];
  }
  function countryFile(country) {
    var c = meta.countries.find(function (x) { return x.country === country; });
    return 'series/' + state.res + '/' + c.file + '.json';
  }
  function partiesIn(country) {
    return meta.parties.filter(function (p) { return p.country === country; });
  }
  function partyInfo(country, party) {
    return meta.parties.find(function (p) { return p.country === country && p.party === party; });
  }
  function topicLabel(code) {
    var t = meta.topics.find(function (x) { return x.code === +code; });
    return t ? t.label : String(code);
  }

  /* ---------- URL state ---------- */
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (h.get('mode') === 'parties') state.mode = 'parties';
    if (h.get('country')) state.country = h.get('country');
    if (h.get('party')) state.party = h.get('party');
    if (h.get('topic')) state.topic = +h.get('topic');
    if (h.get('res') === 'month') state.res = 'month';
    if (h.get('min')) state.min = +h.get('min');
    if (h.get('sel')) {
      state.selected = h.get('sel').split(',').filter(Boolean).slice(0, MAX_SERIES)
        .map(function (k, i) { return { key: k, slot: i }; });
    }
  }
  function writeHash() {
    var h = new URLSearchParams({
      mode: state.mode, country: state.country, res: state.res, min: state.min,
      sel: state.selected.map(function (s) { return s.key; }).join(',')
    });
    if (state.mode === 'topics') h.set('party', state.party); else h.set('topic', state.topic);
    history.replaceState(null, '', '#' + h.toString());
  }

  /* ---------- selection ---------- */
  function freeSlot() {
    for (var i = 0; i < SLOTS; i++) {
      if (!state.selected.some(function (s) { return s.slot === i; })) return i;
    }
    return -1;
  }
  function toggle(key) {
    var i = state.selected.findIndex(function (s) { return s.key === key; });
    if (i >= 0) state.selected.splice(i, 1);
    else if (state.selected.length < MAX_SERIES) state.selected.push({ key: key, slot: freeSlot() });
    update();
  }
  function defaultSelection() {
    if (state.mode === 'topics') {
      state.selected = DEFAULT_TOPICS.map(function (c, i) { return { key: String(c), slot: i }; });
    } else {
      state.selected = partiesIn(state.country).slice(0, 3)
        .map(function (p, i) { return { key: p.party, slot: i }; });
    }
  }

  /* ---------- controls ---------- */
  function fillSelect(sel, items, value) {
    sel.textContent = '';
    items.forEach(function (it) {
      var o = el('option', { value: it.value }, it.label);
      if (it.value === String(value)) o.selected = true;
      sel.appendChild(o);
    });
  }
  function syncControls() {
    $('f-mode').value = state.mode;
    fillSelect($('f-country'), meta.countries.map(function (c) {
      return { value: c.country, label: c.country };
    }), state.country);
    fillSelect($('f-party'), partiesIn(state.country).map(function (p) {
      return { value: p.party, label: p.name + ' (' + p.short + ')' };
    }), state.party);
    fillSelect($('f-topic'), meta.topics.map(function (t) {
      return { value: String(t.code), label: t.label };
    }), state.topic);
    $('f-res').value = state.res;
    $('f-min').value = String(state.min);
    $('ctl-party').hidden = state.mode !== 'topics';
    $('ctl-topic').hidden = state.mode !== 'parties';
    $('chips-label').textContent = (state.mode === 'topics' ? 'Topics' : 'Parties') + ' (up to ' + MAX_SERIES + ')';
  }
  function renderChips(available) {
    var box = $('chips');
    box.textContent = '';
    var items = state.mode === 'topics'
      ? meta.topics.map(function (t) { return { key: String(t.code), label: SHORT_TOPIC[t.code] || t.label, title: t.label }; })
      : partiesIn(state.country).map(function (p) { return { key: p.party, label: p.short, title: p.name }; });
    var full = state.selected.length >= MAX_SERIES;
    items.forEach(function (it) {
      var sel = state.selected.find(function (s) { return s.key === it.key; });
      var b = el('button', { type: 'button', class: 'chip', 'aria-pressed': sel ? 'true' : 'false', title: it.title });
      if (sel) {
        var k = el('span', { class: 'chip-key', 'aria-hidden': 'true' });
        k.style.background = slotColor(sel.slot);
        b.appendChild(k);
      }
      b.appendChild(document.createTextNode(it.label));
      var missing = available && !available[it.key];
      if ((!sel && full) || (missing && !sel)) b.disabled = true;
      if (missing) b.title = it.title + ' — no series at this resolution';
      b.addEventListener('click', function () { toggle(it.key); });
      box.appendChild(b);
    });
  }

  /* ---------- assemble series ---------- */
  function buildView(file) {
    var res = state.res, step = res === 'quarter' ? 3 : 1;
    var series = [];
    var lo = Infinity, hi = -Infinity;
    var volume = []; // [{slot,label, points:{idx:n}}]
    var available = {};

    if (state.mode === 'topics') {
      var pd = file.parties[state.party];
      meta.topics.forEach(function (t) { available[String(t.code)] = !!pd; });
      if (pd) {
        var idxs = pd.t.map(periodIndex);
        idxs.forEach(function (i) { lo = Math.min(lo, i); hi = Math.max(hi, i); });
        var vpts = {};
        idxs.forEach(function (i, j) { vpts[i] = pd.n[j]; });
        volume.push({ slot: -1, label: 'Releases', points: vpts });
        state.selected.forEach(function (s) {
          var pts = {};
          idxs.forEach(function (i, j) {
            if (pd.n[j] >= state.min && pd.share[s.key][j] != null) {
              pts[i] = { v: pd.share[s.key][j], se: pd.se[s.key][j], n: pd.n[j] };
            }
          });
          series.push({ key: s.key, slot: s.slot, label: SHORT_TOPIC[s.key] || topicLabel(s.key), full: topicLabel(s.key), points: pts });
        });
      }
    } else {
      Object.keys(file.parties).forEach(function (k) { available[k] = true; });
      state.selected.forEach(function (s) {
        var pd2 = file.parties[s.key];
        var info = partyInfo(state.country, s.key);
        var pts = {}, vp = {};
        if (pd2) {
          pd2.t.forEach(function (t, j) {
            var i = periodIndex(t);
            lo = Math.min(lo, i); hi = Math.max(hi, i);
            vp[i] = pd2.n[j];
            var v = pd2.share[String(state.topic)][j];
            if (pd2.n[j] >= state.min && v != null) pts[i] = { v: v, se: pd2.se[String(state.topic)][j], n: pd2.n[j] };
          });
        }
        var lab = info ? info.short : s.key;
        series.push({ key: s.key, slot: s.slot, label: lab, full: info ? info.name : s.key, points: pts });
        volume.push({ slot: s.slot, label: lab, points: vp });
      });
    }
    var periods = [];
    if (isFinite(lo)) for (var i = lo; i <= hi; i += step) periods.push(i);
    return { res: res, periods: periods, series: series, volume: volume, available: available };
  }

  /* ---------- line chart ---------- */
  function niceScale(v) { // -> {max, step}: 3–5 round percentage ticks
    var steps = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25];
    v = Math.max(v, 0.01);
    for (var i = 0; i < steps.length; i++) {
      if (v / steps[i] <= 5) return { max: Math.min(1, Math.ceil(v / steps[i] - 1e-9) * steps[i]), step: steps[i] };
    }
    return { max: 1, step: 0.25 };
  }
  function yearTicks(periods, width) {
    if (!periods.length) return [];
    var y0 = Math.ceil(periods[0] / 12), y1 = Math.floor(periods[periods.length - 1] / 12);
    var span = y1 - y0 + 1, every = width < 480 ? 4 : width < 760 ? 2 : 1;
    if (span <= 4) every = 1;
    var out = [];
    for (var y = y0; y <= y1; y++) if ((y - y0) % every === 0) out.push(y);
    return out;
  }

  function drawLines(v) {
    var host = $('chart');
    host.textContent = '';
    var W = host.clientWidth || 600;
    var narrow = W < 560;
    var H = narrow ? 260 : 330;
    var m = { t: 8, r: narrow ? 12 : 140, b: 24, l: 40 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H });
    host.appendChild(root);

    var plotted = v.series.filter(function (s) { return Object.keys(s.points).length; });
    if (!v.periods.length || !plotted.length) {
      root.appendChild(svg('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'empty' },
        state.selected.length ? 'No periods meet the minimum number of releases.' : 'Select a series below the filters.'));
      v.geom = null;
      return;
    }

    var ymax = 0;
    plotted.forEach(function (s) {
      Object.keys(s.points).forEach(function (i) {
        var p = s.points[i];
        ymax = Math.max(ymax, Math.min(1, p.v + 1.96 * (p.se || 0)));
      });
    });
    var scale = niceScale(ymax);
    ymax = scale.max;
    var p0 = v.periods[0], p1 = v.periods[v.periods.length - 1];
    var x = function (i) { return m.l + (p1 === p0 ? iw / 2 : (i - p0) / (p1 - p0) * iw); };
    var y = function (val) { return m.t + ih - val / ymax * ih; };

    // grid + y labels
    var nT = Math.round(ymax / scale.step);
    for (var k = 0; k <= nT; k++) {
      var val = scale.step * k, yy = y(val);
      root.appendChild(svg('line', { x1: m.l, x2: m.l + iw, y1: yy, y2: yy, stroke: k === 0 ? cssVar('--axis') : cssVar('--grid'), 'stroke-width': 1 }));
      root.appendChild(svg('text', { x: m.l - 6, y: yy + 4, 'text-anchor': 'end' }, (Math.round(val * 1000) / 10) + '%'));
    }
    yearTicks(v.periods, iw).forEach(function (yr) {
      var xx = x(yr * 12);
      root.appendChild(svg('text', { x: xx, y: H - 6, 'text-anchor': 'middle' }, String(yr)));
    });

    // bands then lines
    var step = v.res === 'quarter' ? 3 : 1;
    plotted.forEach(function (s) {
      var col = slotColor(s.slot);
      runs(v.periods, s.points).forEach(function (run) {
        if (run.length > 1) {
          var up = run.map(function (i) { var p = s.points[i]; return x(i) + ',' + y(Math.min(ymax, p.v + 1.96 * (p.se || 0))); });
          var dn = run.slice().reverse().map(function (i) { var p = s.points[i]; return x(i) + ',' + y(Math.max(0, p.v - 1.96 * (p.se || 0))); });
          root.appendChild(svg('polygon', { points: up.concat(dn).join(' '), fill: col, 'fill-opacity': 0.13, stroke: 'none' }));
        }
      });
    });
    plotted.forEach(function (s) {
      var col = slotColor(s.slot);
      runs(v.periods, s.points).forEach(function (run) {
        if (run.length === 1) {
          root.appendChild(svg('circle', { cx: x(run[0]), cy: y(s.points[run[0]].v), r: 2.5, fill: col }));
        } else {
          var d = run.map(function (i, j) { return (j ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(s.points[i].v).toFixed(1); }).join('');
          root.appendChild(svg('path', { d: d, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        }
      });
    });

    // direct end labels (≤5 series), nudged apart
    if (!narrow) {
      var ends = plotted.map(function (s) {
        var idx = Object.keys(s.points).map(Number).sort(function (a, b) { return a - b; });
        var last = idx[idx.length - 1];
        return { s: s, x: x(last), y: y(s.points[last].v) };
      }).sort(function (a, b) { return a.y - b.y; });
      for (var e = 1; e < ends.length; e++) {
        if (ends[e].y - ends[e - 1].y < 13) ends[e].y = ends[e - 1].y + 13;
      }
      ends.forEach(function (en) {
        root.appendChild(svg('text', { x: m.l + iw + 8, y: en.y + 4, class: 'label-end' }, en.s.label));
      });
    }

    // hover layer
    var hair = svg('line', { y1: m.t, y2: m.t + ih, stroke: cssVar('--ink-muted'), 'stroke-width': 1, visibility: 'hidden' });
    root.appendChild(hair);
    var dots = svg('g', { visibility: 'hidden' });
    root.appendChild(dots);
    var hit = svg('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', tabindex: 0, 'aria-label': 'Chart values: use arrow keys' });
    root.appendChild(hit);
    v.geom = { x: x, y: y, p0: p0, p1: p1, iw: iw, m: m, step: step, hair: hair, dots: dots, root: root };

    var cur = -1;
    function show(idxPos, clientX, clientY) {
      cur = Math.max(0, Math.min(v.periods.length - 1, idxPos));
      var i = v.periods[cur], xx = x(i);
      hair.setAttribute('x1', xx); hair.setAttribute('x2', xx); hair.setAttribute('visibility', 'visible');
      dots.textContent = '';
      plotted.forEach(function (s) {
        var p = s.points[i];
        if (p) dots.appendChild(svg('circle', { cx: xx, cy: y(p.v), r: 4, fill: slotColor(s.slot), stroke: cssVar('--surface'), 'stroke-width': 2 }));
      });
      dots.setAttribute('visibility', 'visible');
      var rows = plotted.map(function (s) { return { s: s, p: s.points[i] }; })
        .sort(function (a, b) { return (b.p ? b.p.v : -1) - (a.p ? a.p.v : -1); })
        .map(function (r) {
          return { color: slotColor(r.s.slot), value: r.p ? (r.p.v * 100).toFixed(1) + '%' : '–', label: r.s.full };
        });
      var foot;
      if (state.mode === 'topics') {
        var vn = v.volume[0] && v.volume[0].points[i];
        foot = (vn != null ? fmtInt(vn) : 0) + ' releases';
      }
      if (clientX == null) {
        var r = root.getBoundingClientRect();
        clientX = r.left + xx * r.width / W; clientY = r.top + m.t + 20;
      }
      tooltip(clientX, clientY, periodLabel(i, v.res), rows, foot);
    }
    function hide() {
      hair.setAttribute('visibility', 'hidden'); dots.setAttribute('visibility', 'hidden');
      $('tooltip').hidden = true;
    }
    function posFromEvent(ev) {
      var r = root.getBoundingClientRect();
      var px = (ev.clientX - r.left) * W / r.width;
      var i = p0 + (px - m.l) / iw * (p1 - p0);
      return Math.round((i - p0) / step);
    }
    hit.addEventListener('pointermove', function (ev) { show(posFromEvent(ev), ev.clientX, ev.clientY); });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('blur', hide);
    hit.addEventListener('focus', function () { show(cur < 0 ? v.periods.length - 1 : cur); });
    hit.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        show((cur < 0 ? v.periods.length - 1 : cur) + (ev.key === 'ArrowRight' ? 1 : -1));
      }
    });
  }

  function runs(periods, points) { // consecutive periods with data
    var out = [], run = [];
    periods.forEach(function (i) {
      if (points[i]) run.push(i);
      else if (run.length) { out.push(run); run = []; }
    });
    if (run.length) out.push(run);
    return out;
  }

  /* ---------- volume chart (same x as the line chart; its own y) ---------- */
  function drawVolume(v) {
    var host = $('chart-volume');
    host.textContent = '';
    if (!v.geom) return;
    var g = v.geom;
    var W = host.clientWidth || 600, H = 80;
    var m = { t: 4, b: 4 };
    var ih = H - m.t - m.b;
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H });
    host.appendChild(root);
    var nmax = 1;
    v.volume.forEach(function (s) { Object.keys(s.points).forEach(function (i) { nmax = Math.max(nmax, s.points[i]); }); });
    var y = function (n) { return m.t + ih - n / nmax * ih; };
    root.appendChild(svg('line', { x1: g.m.l, x2: g.m.l + g.iw, y1: y(0), y2: y(0), stroke: cssVar('--axis') }));
    root.appendChild(svg('text', { x: g.m.l - 6, y: m.t + 9, 'text-anchor': 'end' }, fmtInt(nmax)));
    root.appendChild(svg('text', { x: g.m.l - 6, y: y(0), 'text-anchor': 'end' }, '0'));
    if (state.mode === 'topics') {
      var s = v.volume[0];
      var bw = Math.max(1, g.iw / Math.max(1, v.periods.length) - 2);
      Object.keys(s.points).forEach(function (k) {
        var i = +k, n = s.points[i];
        var below = n < state.min;
        root.appendChild(svg('rect', {
          x: g.x(i) - bw / 2, y: y(n), width: bw, height: Math.max(0, y(0) - y(n)),
          fill: cssVar('--volume'), 'fill-opacity': below ? 0.35 : 1, rx: Math.min(2, bw / 2)
        }));
      });
    } else {
      v.volume.forEach(function (s) {
        runs(v.periods, s.points).forEach(function (run) {
          var d = run.map(function (i, j) { return (j ? 'L' : 'M') + g.x(i).toFixed(1) + ',' + y(s.points[i]).toFixed(1); }).join('');
          if (run.length === 1) d += 'h0.01';
          root.appendChild(svg('path', { d: d, fill: 'none', stroke: slotColor(s.slot), 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
        });
      });
    }
  }

  /* ---------- tooltip ---------- */
  function tooltip(cx, cy, head, rows, foot) {
    var tt = $('tooltip');
    tt.textContent = '';
    tt.appendChild(el('div', { class: 'tt-head' }, head));
    rows.forEach(function (r) {
      var row = el('div', { class: 'tt-row' });
      var key = el('span', { class: 'chip-key', 'aria-hidden': 'true' });
      key.style.background = r.color;
      row.appendChild(key);
      row.appendChild(el('strong', null, r.value));
      row.appendChild(el('span', null, r.label));
      tt.appendChild(row);
    });
    if (foot) tt.appendChild(el('div', { class: 'tt-foot' }, foot));
    tt.hidden = false;
    var card = tt.offsetParent.getBoundingClientRect();
    var w = tt.offsetWidth, h = tt.offsetHeight;
    var left = cx - card.left + 14;
    if (left + w > card.width - 4) left = cx - card.left - w - 14;
    var top = Math.max(4, cy - card.top - h / 2);
    tt.style.left = Math.max(4, left) + 'px';
    tt.style.top = top + 'px';
  }

  /* ---------- legend, note, table, CSV ---------- */
  function renderLegend(v) {
    var box = $('legend');
    box.textContent = '';
    v.series.forEach(function (s) {
      var it = el('span', { class: 'legend-item', title: s.full });
      var k = el('span', { class: 'legend-key', 'aria-hidden': 'true' });
      k.style.background = slotColor(s.slot);
      it.appendChild(k);
      it.appendChild(document.createTextNode(s.label));
      box.appendChild(it);
    });
    $('chart').setAttribute('aria-label', 'Line chart: ' + (state.mode === 'topics'
      ? 'topic shares for ' + (partyInfo(state.country, state.party) || {}).name
      : topicLabel(state.topic) + ' share by party in ' + state.country));
  }
  function renderNote() {
    var note = $('chart-note');
    if (state.mode === 'topics') {
      var p = partyInfo(state.country, state.party);
      note.textContent = p ? p.name + ' (' + p.short + ') · ' + p.family + ' · ' + fmtInt(p.n_docs) +
        ' releases, ' + p.first.slice(0, 7) + ' to ' + p.last.slice(0, 7) : '';
    } else {
      note.textContent = topicLabel(state.topic) + ' · parties in ' + state.country;
    }
  }
  function tableRows(v) {
    var out = [];
    v.series.forEach(function (s) {
      Object.keys(s.points).map(Number).sort(function (a, b) { return a - b; }).forEach(function (i) {
        var p = s.points[i];
        out.push({
          period: periodKey(i), label: periodLabel(i, v.res), series: s.full, key: s.key,
          share: p.v, se: p.se, lo: Math.max(0, p.v - 1.96 * (p.se || 0)), hi: Math.min(1, p.v + 1.96 * (p.se || 0)), n: p.n
        });
      });
    });
    return out;
  }
  function renderTable(v) {
    var wrap = $('table-wrap');
    if (wrap.hidden) return;
    wrap.textContent = '';
    var tbl = el('table');
    var thead = el('thead'), tr = el('tr');
    tr.appendChild(el('th', null, 'Period'));
    v.series.forEach(function (s) { tr.appendChild(el('th', { title: s.full }, s.label)); });
    if (state.mode === 'topics') tr.appendChild(el('th', null, 'Releases'));
    thead.appendChild(tr); tbl.appendChild(thead);
    var tb = el('tbody');
    v.periods.slice().reverse().forEach(function (i) {
      var any = v.series.some(function (s) { return s.points[i]; });
      if (!any) return;
      var r = el('tr');
      r.appendChild(el('td', null, periodLabel(i, v.res)));
      v.series.forEach(function (s) {
        var p = s.points[i];
        r.appendChild(el('td', null, p ? (p.v * 100).toFixed(1) + '%' : '–'));
      });
      if (state.mode === 'topics') {
        var n = v.volume[0].points[i];
        r.appendChild(el('td', null, n != null ? fmtInt(n) : '–'));
      }
      tb.appendChild(r);
    });
    tbl.appendChild(tb);
    wrap.appendChild(tbl);
  }
  function downloadCSV() {
    if (!view) return;
    var esc = function (s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var lines = ['country,party,topic_code,topic,period,resolution,pol_share,se,ci95_low,ci95_high,n_releases'];
    tableRows(view).forEach(function (r) {
      var party = state.mode === 'topics' ? state.party : r.key;
      var code = state.mode === 'topics' ? r.key : String(state.topic);
      lines.push([state.country, party, code, topicLabel(code), r.period, view.res,
        r.share, r.se, r.lo.toFixed(4), r.hi.toFixed(4), r.n].map(esc).join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
    var a = el('a', {
      href: URL.createObjectURL(blob),
      download: 'partypress_' + state.country.toLowerCase().replace(/\W+/g, '-') + '_' + state.res + '.csv'
    });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- main update ---------- */
  var token = 0;
  function update() {
    syncControls();
    writeHash();
    var my = ++token;
    renderChips(null);
    getJSON(countryFile(state.country)).then(function (file) {
      if (my !== token) return;
      view = buildView(file);
      renderChips(view.available);
      renderLegend(view);
      drawLines(view);
      drawVolume(view);
      renderNote();
      renderTable(view);
    }).catch(function (err) {
      $('chart').textContent = 'Could not load data (' + err.message + ').';
    });
  }
  function redraw() {
    if (!view) return;
    drawLines(view); drawVolume(view);
  }

  /* ---------- static sections ---------- */
  function renderStats() {
    var t = meta.totals;
    $('stat-docs').textContent = fmtInt(t.documents);
    $('stat-sents').textContent = (t.sentences / 1e6).toFixed(1) + 'M';
    $('stat-parties').textContent = fmtInt(t.parties);
    $('stat-countries').textContent = fmtInt(t.countries);
    $('stat-span').textContent = t.first_date.slice(0, 4) + '–' + t.last_date.slice(0, 4);
    $('data-version').textContent = meta.corpus_version || '–';
    $('data-built').textContent = meta.generated;
  }
  function renderCoverage() {
    var box = $('coverage-list');
    box.textContent = '';
    var head = el('div', { class: 'cov-head' });
    head.appendChild(el('span', null, 'Country'));
    head.appendChild(el('span', null, 'Releases'));
    head.appendChild(el('span', { class: 'cov-num' }, 'Parties'));
    head.appendChild(el('span', { class: 'cov-span' }, 'Years'));
    box.appendChild(head);
    var rows = meta.countries.slice().sort(function (a, b) { return b.n_docs - a.n_docs; });
    var max = rows[0].n_docs;
    rows.forEach(function (c) {
      var r = el('div', { class: 'cov-row', role: 'button', tabindex: 0, title: 'Show ' + c.country + ' in the chart' });
      r.appendChild(el('span', null, c.country));
      var cell = el('span', { title: fmtInt(c.n_docs) + ' releases' });
      var bar = el('div', { class: 'cov-bar' });
      bar.style.width = (c.n_docs / max * 100).toFixed(1) + '%';
      cell.appendChild(bar);
      r.appendChild(cell);
      r.appendChild(el('span', { class: 'cov-num' }, fmtInt(c.n_parties)));
      r.appendChild(el('span', { class: 'cov-span' }, c.first_year + '–' + c.last_year));
      var go = function () {
        setCountry(c.country);
        $('explore').scrollIntoView({ behavior: 'smooth' });
      };
      r.addEventListener('click', go);
      r.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
      box.appendChild(r);
    });
  }
  function drawYears() {
    var host = $('chart-years');
    host.textContent = '';
    var data = meta.documents_by_year;
    var W = host.clientWidth || 400, H = 220;
    var m = { t: 8, r: 4, b: 22, l: 44 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H });
    host.appendChild(root);
    var max = Math.max.apply(null, data.map(function (d) { return d.n; }));
    var top = Math.ceil(max / 10000) * 10000;
    var y = function (n) { return m.t + ih - n / top * ih; };
    for (var k = 0; k <= 2; k++) {
      var v = top * k / 2;
      root.appendChild(svg('line', { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), stroke: k ? cssVar('--grid') : cssVar('--axis') }));
      root.appendChild(svg('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, v ? (v / 1000) + 'k' : '0'));
    }
    var slot = iw / data.length, bw = Math.max(2, slot - 2);
    var lastYear = meta.totals.last_date.slice(0, 4);
    data.forEach(function (d, j) {
      var bx = m.l + j * slot + (slot - bw) / 2;
      var partial = String(d.year) === lastYear;
      var bar = svg('rect', {
        x: bx, y: y(d.n), width: bw, height: y(0) - y(d.n), rx: Math.min(3, bw / 2),
        fill: cssVar('--series-1'), 'fill-opacity': partial ? 0.4 : 1, tabindex: 0
      });
      var label = d.year + (partial ? ' (to ' + meta.totals.last_date.slice(0, 7) + ')' : '');
      var show = function (ev) {
        bar.setAttribute('fill-opacity', partial ? 0.55 : 0.8);
        var r = bar.getBoundingClientRect();
        tooltipFixed(ev && ev.clientX != null ? ev.clientX : r.left + r.width / 2, r.top, label, fmtInt(d.n) + ' releases');
      };
      var hide = function () { bar.setAttribute('fill-opacity', partial ? 0.4 : 1); $('tooltip-fixed').hidden = true; };
      // hit area wider than the bar
      var hit = svg('rect', { x: m.l + j * slot, y: m.t, width: slot, height: ih, fill: 'transparent' });
      hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', hide);
      bar.addEventListener('focus', show); bar.addEventListener('blur', hide);
      root.appendChild(bar); root.appendChild(hit);
      var every = W < 420 ? 4 : 2;
      if ((d.year - data[0].year) % every === 0) {
        root.appendChild(svg('text', { x: bx + bw / 2, y: H - 6, 'text-anchor': 'middle' }, String(d.year)));
      }
    });
  }
  function tooltipFixed(cx, cy, head, body) {
    var tt = $('tooltip-fixed');
    tt.textContent = '';
    tt.appendChild(el('div', { class: 'tt-head' }, head));
    var row = el('div', { class: 'tt-row' });
    row.appendChild(el('strong', null, body));
    tt.appendChild(row);
    tt.hidden = false;
    var w = tt.offsetWidth, h = tt.offsetHeight;
    tt.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, cx - w / 2)) + 'px';
    tt.style.top = Math.max(4, cy - h - 8) + 'px';
  }
  function setupDataverse() {
    var url = document.body.getAttribute('data-dataverse') || '';
    var pending = !url || url.indexOf('XXXXXX') >= 0;
    document.querySelectorAll('.dataverse-link').forEach(function (a) {
      if (a.classList.contains('btn-primary')) {
        a.href = pending ? '#download' : url;
        return;
      }
      if (pending) {
        a.removeAttribute('href');
        a.setAttribute('aria-disabled', 'true');
        a.textContent = 'Dataverse (DOI pending)';
      } else {
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
      }
    });
    document.querySelectorAll('.dv-pending').forEach(function (p) { p.hidden = !pending; });
  }

  function setCountry(c) {
    state.country = c;
    var ps = partiesIn(c);
    if (!ps.some(function (p) { return p.party === state.party; })) state.party = ps[0].party;
    if (state.mode === 'parties') defaultSelection();
    update();
  }

  /* ---------- init ---------- */
  function init() {
    setupDataverse();
    var ttf = el('div', { class: 'tooltip tooltip-fixed', id: 'tooltip-fixed', role: 'status', hidden: '' });
    document.body.appendChild(ttf);

    getJSON('meta.json').then(function (m) {
      meta = m;
      renderStats();
      renderCoverage();
      drawYears();

      var hadHash = location.hash.length > 1;
      readHash();
      if (!meta.countries.some(function (c) { return c.country === state.country; })) state.country = 'Germany';
      if (!meta.countries.some(function (c) { return c.country === state.country; })) state.country = meta.countries[0].country;
      var ps = partiesIn(state.country);
      if (!ps.some(function (p) { return p.party === state.party; })) state.party = ps[0].party;
      if (!meta.topics.some(function (t) { return t.code === state.topic; })) state.topic = 8;
      if (!hadHash || !state.selected.length) defaultSelection();

      $('f-mode').addEventListener('change', function (e) { state.mode = e.target.value; defaultSelection(); update(); });
      $('f-country').addEventListener('change', function (e) { setCountry(e.target.value); });
      $('f-party').addEventListener('change', function (e) { state.party = e.target.value; update(); });
      $('f-topic').addEventListener('change', function (e) { state.topic = +e.target.value; update(); });
      $('f-res').addEventListener('change', function (e) { state.res = e.target.value; update(); });
      $('f-min').addEventListener('change', function (e) { state.min = +e.target.value; update(); });
      $('btn-csv').addEventListener('click', downloadCSV);
      $('btn-table').addEventListener('click', function () {
        var w = $('table-wrap');
        w.hidden = !w.hidden;
        this.setAttribute('aria-expanded', String(!w.hidden));
        this.textContent = w.hidden ? 'Show table' : 'Hide table';
        if (view) renderTable(view);
      });
      var t;
      window.addEventListener('resize', function () {
        clearTimeout(t);
        t = setTimeout(function () { redraw(); drawYears(); }, 120);
      });
      update();
    }).catch(function (err) {
      $('chart').textContent = 'Could not load dashboard data (' + err.message + ').';
    });
  }

  init();
})();
