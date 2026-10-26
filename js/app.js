/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sum = a => a.reduce((x, y) => x + (y || 0), 0);
// ZDASH: pages that show a zero as $--- (set while Budget vs. actual draws)
let ZDASH = false; const ZD = '<span class="zd">$---</span>';
const money = (v, d = 0) => ZDASH && Math.abs(v) < .5 / 10 ** d ? ZD : (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const short = (v, d) => {
  const a = Math.abs(v), s = v < 0 ? '−' : ''; if (ZDASH && a < .5) return ZD;
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(d ?? (a >= 1e7 ? 1 : 2)) + 'M';
  if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(d ?? (a >= 1e5 ? 0 : 1)) + 'k';
  return s + '$' + a.toFixed(0);
};
const pct = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mLabel = ym => { const [y, m] = ym.split('-'); return MON[+m - 1] + ' ' + y; };
const mShort = ym => { const [y, m] = ym.split('-'); return MON[+m - 1] + " '" + y.slice(2); };
const chip = (v, goodWhenUp = true, txt) => `<span class="chip ${v === 0 ? '' : ((v > 0) === goodWhenUp ? 'pos' : 'neg')}">${v > 0 ? '▲' : v < 0 ? '▼' : ''} ${txt ?? pct(v)}</span>`;
const I = {
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 011-1h10"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  budget: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 14h3M8 17h6"/>',
  invest: '<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>',
  plan: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  save: '<path d="M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2 2.7 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  cash: '<rect x="2" y="6" width="20" height="13" rx="3"/><circle cx="12" cy="12.5" r="2.5"/>',
  debt: '<path d="M4 7h16M4 12h10M4 17h7"/><path d="M17 14l4 4M21 14l-4 4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  sort: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
};
const icon = (k, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;

/* ================= derived data ================= */
const BS = DATA.bs;
let L = BS.months.length - 1;
const at = ym => BS.months.indexOf(ym);
const CY = CTX.CY, PY = CTX.PY, YNOW = +CTX.TODAY.slice(0, 4);
let iDecPY = Math.max(0, at(`${PY}-12`)), i12 = Math.max(0, L - 12);
let NW = BS.netWorth[L];
const investable = i => BS.investable[i] || 0;
const Y = DATA.yearly, YI = Y.years.length - 1;
const ZROW = {y: Y.years.map(() => 0), mCur: Array(12).fill(0), fcCur: 0};
const yr = name => Y.rows.find(r => r.name === name) || ZROW;
const SCH = DATA.schwab;
const schCY = SCH.filter(r => r.m.startsWith(String(CY)));
const monthsElapsed = CTX.ASOF.m;
const ageNow = YNOW - DATA.assume.birthYear;
const nz = v => Number.isFinite(v) ? v : 0;
const SCH_NAME = CTX.SCH_ACCT || 'Brokerage';
function refreshDerived() {   // called after balance / loan / asset edits rebuild BS in place
  L = BS.months.length - 1; iDecPY = Math.max(0, at(`${PY}-12`)); i12 = Math.max(0, L - 12); NW = BS.netWorth[L];
  if (typeof LASTM !== 'undefined') LASTM = BS.months[L];
  if (typeof PB !== 'undefined') PB.clear();
}

/* ================= tooltip ================= */
const tip = $('#tip'); tip.style.position = 'fixed';
function showTip(html, x, y) {
  tip.innerHTML = html; tip.style.opacity = 1;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let left = x + 14, top = y - h - 12;
  if (left + w > innerWidth - 8) left = x - w - 14;
  if (top < 8) top = y + 16;
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
}
const hideTip = () => tip.style.opacity = 0;
const tipRow = (c, n, v) => `<div class="r"><span>${c ? `<i class="sw" style="background:${c}"></i>` : ''}${esc(n)}</span><b class="num">${v}</b></div>`;

/* ================= charts (hand-built SVG) ================= */
const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
function niceTicks(min, max, n = 4) {
  if (min === max) { max = min + 1; }
  const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(6));
  return t;
}
// a card made taller or shorter in Layout gives its charts the difference (split between them)
function chartH(el, h) { const c = el.closest('.card'), ex = +(c?.dataset.extra || 0); if (!ex) return h;
  const n = c.querySelectorAll('.chart').length || 1; return Math.max(120, Math.round(h + ex / n)); }
function svgEl(el, h) {
  el.innerHTML = '';
  const w = Math.max(240, el.clientWidth);
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('height', h);
  el.appendChild(s); return [s, w];
}
const add = (p, tag, attrs, style) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (style) e.setAttribute('style', style); p.appendChild(e); return e; };
const txt = (p, x, y, t, anchor = 'start', style = '') => { const e = add(p, 'text', {x, y, 'text-anchor': anchor}, style); e.textContent = t; return e; };

/* Line / area chart with optional percentile band, crosshair tooltip */
function lineChart(el, o) {
  const h = chartH(el, o.height || 240), [s, w] = svgEl(el, h);
  const P = {l: o.padL ?? 52, r: 14, t: 12, b: 26};
  const n = o.labels.length;
  const all = o.series.flatMap(x => x.values).concat(o.band ? o.band.lo.concat(o.band.hi) : []).filter(v => v != null);
  let mn = Math.min(...all), mx = Math.max(...all);
  if (o.zero) mn = Math.min(0, mn);
  const ticks = niceTicks(o.zero && mn >= 0 ? 0 : mn - (mx - mn) * .04, mx + (mx - mn) * .04, o.ticks || 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = i => P.l + (n === 1 ? 0 : i * (w - P.l - P.r) / (n - 1));
  const Yp = v => P.t + (1 - (v - y0) / (y1 - y0)) * (h - P.t - P.b);
  ticks.forEach(t => { add(s, 'line', {x1: P.l, x2: w - P.r, y1: Yp(t), y2: Yp(t)}, 'stroke:var(--grid)'); txt(s, P.l - 8, Yp(t) + 4, (o.yFmt || short)(t), 'end'); });
  const every = Math.ceil(n / Math.max(2, Math.floor((w - P.l) / (o.xGap || 64))));
  o.labels.forEach((lb, i) => { const t = o.xFmt ? o.xFmt(lb, i, every) : (i % every === 0 ? lb : null); if (t) txt(s, X(i), h - 6, t, 'middle'); });
  (o.vlines || []).forEach(v => { add(s, 'line', {x1: X(v.i), x2: X(v.i), y1: P.t, y2: h - P.b}, 'stroke:var(--text-3);stroke-dasharray:3 4;stroke-width:1'); txt(s, X(v.i) + 6, P.t + 10, v.label, 'start', 'fill:var(--text-2);font-weight:600'); });
  if (o.band) {
    const b = o.band, ix = b.hi.map((v, i) => i).filter(i => b.hi[i] != null && b.lo[i] != null), pts = ix.map(i => `${X(i)},${Yp(b.hi[i])}`).concat(ix.map(i => `${X(i)},${Yp(b.lo[i])}`).reverse());
    add(s, 'polygon', {points: pts.join(' ')}, `fill:${b.color};opacity:.16`);
  }
  o.series.forEach(se => {
    const pts = se.values.map((v, i) => v == null ? null : [X(i), Yp(v)]).filter(Boolean);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    if (se.area) {
      const id = 'g' + (++uid);
      const g = add(add(s, 'defs', {}), 'linearGradient', {id, x1: 0, x2: 0, y1: 0, y2: 1});
      add(g, 'stop', {offset: '0%'}, `stop-color:${se.color};stop-opacity:.28`);
      add(g, 'stop', {offset: '100%'}, `stop-color:${se.color};stop-opacity:0`);
      add(s, 'path', {d: d + `L${pts[pts.length - 1][0]},${h - P.b}L${pts[0][0]},${h - P.b}Z`}, `fill:url(#${id})`);
    }
    add(s, 'path', {d}, `fill:none;stroke:${se.color};stroke-width:${se.width || 2};stroke-linejoin:round;stroke-linecap:round;${se.dash ? 'stroke-dasharray:' + se.dash : ''}`);
  });
  (o.markers || []).forEach(m => {
    const v = m.v ?? o.series[m.s || 0].values[m.i]; if (v == null) return;
    if (m.ring) add(s, 'line', {x1: X(m.i), x2: X(m.i), y1: Yp(v) - 8, y2: h - P.b}, `stroke:${m.color};stroke-dasharray:2 3;opacity:.55`);
    add(s, 'circle', {cx: X(m.i), cy: Yp(v), r: m.r || 4.5}, `fill:${m.color};stroke:var(--surface);stroke-width:2`);
    if (m.label) txt(s, X(m.i), Yp(v) - 11 - (m.dy || 0), m.label, m.anchor || 'middle', `fill:${m.color};font-weight:700;font-size:10.5px;paint-order:stroke;stroke:var(--surface);stroke-width:3px`);
  });
  // hover
  const cross = add(s, 'line', {y1: P.t, y2: h - P.b}, 'stroke:var(--text-3);stroke-width:1;opacity:0');
  const dots = o.series.map(se => add(s, 'circle', {r: 4.5}, `fill:${se.color};stroke:var(--surface);stroke-width:2;opacity:0`));
  const hit = add(s, 'rect', {x: P.l, y: 0, width: w - P.l - P.r, height: h}, 'fill:transparent');
  const move = e => {
    const r = s.getBoundingClientRect(), px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const i = Math.max(0, Math.min(n - 1, Math.round((px * (w / r.width) - P.l) / ((w - P.l - P.r) / (n - 1 || 1)))));
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.style.opacity = .6;
    o.series.forEach((se, k) => { const v = se.values[i]; if (v == null) { dots[k].style.opacity = 0; return; } dots[k].setAttribute('cx', X(i)); dots[k].setAttribute('cy', Yp(v)); dots[k].style.opacity = 1; });
    const rows = o.series.filter(se => se.values[i] != null).map(se => tipRow(se.color, se.name, (o.tipFmt || money)(se.values[i]))).join('')
      + (o.band && o.band.lo[i] != null ? tipRow(null, o.band.name || 'Range', short(o.band.lo[i]) + ' – ' + short(o.band.hi[i])) : '') + (o.tipExtra ? o.tipExtra(i) : '');
    showTip(`<div class="t">${esc(o.tipTitle ? o.tipTitle(o.labels[i], i) : o.labels[i])}</div>${rows}`, e.touches ? e.touches[0].clientX : e.clientX, e.touches ? e.touches[0].clientY : e.clientY);
  };
  const out = () => { cross.style.opacity = 0; dots.forEach(d => d.style.opacity = 0); hideTip(); };
  hit.addEventListener('mousemove', move); hit.addEventListener('touchmove', move, {passive: true}); hit.addEventListener('mouseleave', out); hit.addEventListener('touchend', out);
}

/* Vertical bars: grouped series, or single series with per-bar color */
function barChart(el, o) {
  const h = chartH(el, o.height || 220), [s, w] = svgEl(el, h);
  const P = {l: o.padL ?? 50, r: 8, t: 12, b: 26};
  const n = o.labels.length, k = o.series.length;
  const all = o.series.flatMap(x => x.values).filter(v => v != null);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), o.ticks || 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const Yp = v => P.t + (1 - (v - y0) / (y1 - y0)) * (h - P.t - P.b);
  ticks.forEach(t => { add(s, 'line', {x1: P.l, x2: w - P.r, y1: Yp(t), y2: Yp(t)}, `stroke:var(--grid)`); txt(s, P.l - 8, Yp(t) + 4, (o.yFmt || short)(t), 'end'); });
  add(s, 'line', {x1: P.l, x2: w - P.r, y1: Yp(0), y2: Yp(0)}, 'stroke:var(--border-strong)');
  const slot = (w - P.l - P.r) / n, gw = Math.min(slot * .72, k * 26), bw = (gw - (k - 1) * 2) / k;
  const every = Math.ceil(n / Math.max(2, Math.floor((w - P.l) / (o.xGap || 44))));
  o.labels.forEach((lb, i) => {
    const cx = P.l + slot * i + slot / 2;
    if (i % every === 0) txt(s, cx, h - 6, o.xFmt ? o.xFmt(lb) : lb, 'middle');
    o.series.forEach((se, j) => {
      const v = se.values[i]; if (v == null) return;
      const x = cx - gw / 2 + j * (bw + 2), ya = Yp(Math.max(v, 0)), yb = Yp(Math.min(v, 0)), hh = Math.max(1, yb - ya);
      const r = Math.min(4, bw / 2, hh);
      const up = v >= 0;
      const d = up ? `M${x},${yb}V${ya + r}Q${x},${ya} ${x + r},${ya}H${x + bw - r}Q${x + bw},${ya} ${x + bw},${ya + r}V${yb}Z`
                   : `M${x},${ya}V${yb - r}Q${x},${yb} ${x + r},${yb}H${x + bw - r}Q${x + bw},${yb} ${x + bw},${yb - r}V${ya}Z`;
      const col = se.colorFn ? se.colorFn(v, i) : se.color;
      const p = add(s, 'path', {d}, `fill:${col};${se.opacityFn ? 'opacity:' + se.opacityFn(i) : ''}`);
      if (se.hatchFn && se.hatchFn(i)) { p.setAttribute('style', `fill:${col};opacity:.35`); if (bw > 10) add(s, 'path', {d}, `fill:none;stroke:${col};stroke-width:1.5;stroke-dasharray:3 3`); }
    });
  });
  const hl = add(s, 'rect', {y: P.t, height: h - P.t - P.b, width: slot, rx: 8}, 'fill:var(--text);opacity:0;pointer-events:none');
  s.insertBefore(hl, s.firstChild.nextSibling);
  const hit = add(s, 'rect', {x: P.l, y: 0, width: w - P.l - P.r, height: h}, 'fill:transparent');
  const move = e => {
    const r = s.getBoundingClientRect(), cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY;
    const i = Math.max(0, Math.min(n - 1, Math.floor(((cx - r.left) * (w / r.width) - P.l) / slot)));
    hl.setAttribute('x', P.l + slot * i); hl.style.opacity = .045;
    const rows = o.series.filter(se => se.values[i] != null).map(se => tipRow(se.colorFn ? se.colorFn(se.values[i], i) : se.color, se.nameFn ? se.nameFn(i) : se.name, (o.tipFmt || money)(se.values[i]))).join('') + (o.tipExtra ? o.tipExtra(i) : '');
    showTip(`<div class="t">${esc(o.tipTitle ? o.tipTitle(o.labels[i], i) : o.labels[i])}</div>${rows}`, cx, cy);
  };
  const out = () => { hl.style.opacity = 0; hideTip(); };
  hit.addEventListener('mousemove', move); hit.addEventListener('touchstart', move, {passive: true}); hit.addEventListener('mouseleave', out);
}

/* Horizontal diverging bars (budget variance) */
function divergingBars(el, rows, o = {}) {
  const rh = 30, h = rows.length * rh + 8, [s, w] = svgEl(el, h);
  const labW = Math.min(150, w * .34), P = {l: labW, r: 64};
  const m = Math.max(...rows.map(r => Math.abs(r.v)));
  const cx = P.l + (w - P.l - P.r) / 2, half = (w - P.l - P.r) / 2;
  add(s, 'line', {x1: cx, x2: cx, y1: 0, y2: h}, 'stroke:var(--border-strong)');
  rows.forEach((r, i) => {
    const y = i * rh + 6, bh = 16, len = Math.max(2, Math.abs(r.v) / m * half);
    txt(s, 0, y + 12, r.name, 'start', 'fill:var(--text-2);font-size:12px;font-weight:500');
    const good = r.v >= 0, x = good ? cx : cx - len, rr = Math.min(4, len / 2);
    add(s, 'rect', {x, y, width: len, height: bh, rx: rr}, `fill:${good ? 'var(--pos)' : 'var(--neg)'}`);
    txt(s, good ? cx + len + 6 : cx - len - 6, y + 12, (r.v > 0 ? '+' : '') + short(r.v), good ? 'start' : 'end', 'fill:var(--text);font-weight:600');
    const hit = add(s, 'rect', {x: 0, y: y - 6, width: w, height: rh}, 'fill:transparent;cursor:pointer');
    hit.addEventListener('mousemove', e => showTip(`<div class="t">${esc(r.name)}</div>${tipRow(null, 'Budget', money(r.b))}${tipRow(null, 'Actual', money(r.a))}${tipRow(good ? 'var(--pos)' : 'var(--neg)', good ? 'Under budget' : 'Over budget', money(Math.abs(r.v)))}`, e.clientX, e.clientY));
    hit.addEventListener('mouseleave', hideTip);
    if (o.onClick) hit.addEventListener('click', () => o.onClick(r));
  });
}

/* Waterfall */
function waterfall(el, steps, o = {}) {
  const h = chartH(el, o.height || 240), [s, w] = svgEl(el, h);
  const P = {l: 50, r: 8, t: 18, b: 40};
  let run = 0; const bars = steps.map(st => { if (st.total) { const b = {...st, from: 0, to: st.v}; run = st.v; return b; } const b = {...st, from: run, to: run + st.v}; run += st.v; return b; });
  const vals = bars.flatMap(b => [b.from, b.to]);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals), 4), y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const Yp = v => P.t + (1 - (v - y0) / (y1 - y0)) * (h - P.t - P.b);
  ticks.forEach(t => { add(s, 'line', {x1: P.l, x2: w - P.r, y1: Yp(t), y2: Yp(t)}, 'stroke:var(--grid)'); txt(s, P.l - 8, Yp(t) + 4, short(t), 'end'); });
  add(s, 'line', {x1: P.l, x2: w - P.r, y1: Yp(0), y2: Yp(0)}, 'stroke:var(--border-strong)');
  const slot = (w - P.l - P.r) / bars.length, bw = Math.min(110, slot * .82);
  bars.forEach((b, i) => {
    const x = P.l + slot * i + (slot - bw) / 2, top = Yp(Math.max(b.from, b.to)), bot = Yp(Math.min(b.from, b.to));
    const col = b.total ? (b.v >= 0 ? 'var(--brand-700)' : 'var(--neg)') : b.v >= 0 ? 'var(--pos)' : 'var(--neutral)';
    add(s, 'rect', {x, y: top, width: bw, height: Math.max(2, bot - top), rx: 0}, `fill:${col}${b.total ? '' : ''}`);
    txt(s, x + bw / 2, top - 6, short(b.v), 'middle', 'fill:var(--text);font-weight:600');
    const words = b.name.split(' '); txt(s, x + bw / 2, h - 22, words[0], 'middle'); if (words[1]) txt(s, x + bw / 2, h - 9, words.slice(1).join(' '), 'middle');
  });
}

/* Sparkline */
function spark(values, color = 'var(--s1)', w = 110, h = 34, fill = true) {
  const mn = Math.min(...values), mx = Math.max(...values), n = values.length;
  const X = i => i * (w - 4) / (n - 1) + 2, Yp = v => h - 3 - (v - mn) / ((mx - mn) || 1) * (h - 6);
  const d = values.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Yp(v).toFixed(1)).join('');
  const id = 'sp' + (++uid);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible">${fill ? `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:${color};stop-opacity:.25"/><stop offset="1" style="stop-color:${color};stop-opacity:0"/></linearGradient></defs><path d="${d}L${X(n - 1)},${h}L${X(0)},${h}Z" style="fill:url(#${id})"/>` : ''}<path d="${d}" style="fill:none;stroke:${color};stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"/><circle cx="${X(n - 1)}" cy="${Yp(values[n - 1])}" r="2.8" style="fill:${color}"/></svg>`;
}

/* Ring gauge */
function ring(p, size = 96, color = 'var(--brand-500)', label = '') {
  const r = size / 2 - 7, c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" style="fill:none;stroke:var(--surface-3);stroke-width:8"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" transform="rotate(-90 ${size / 2} ${size / 2})" style="fill:none;stroke:${color};stroke-width:8;stroke-linecap:round;stroke-dasharray:${c * p} ${c}"/><text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" style="font-family:var(--font);font-size:${size * .22}px;font-weight:700;fill:var(--text)">${label}</text></svg>`;
}

/* ================= insights engine ================= */
function buildInsights() {
  const out = [], tryI = f => { try { const r = f(); if (r) out.push(r); } catch (e) { console.warn('[insight]', e); } };
  const yAct = n => { const {A} = actuals(CY, 1, monthsElapsed); return A[n] || 0; };
  const yBud = n => budgetFor(CY, n, 1, monthsElapsed);
  const exp = ST.cats.filter(c => /Expense/.test(c.group) && !ST.excl.has(c.name));
  // 1 account fees
  tryI(() => {
    if (!schCY.length) return null;
    const fees = -sum(schCY.map(r => r.fee)), avgBal = sum(schCY.map(r => r.start)) / schCY.length; if (fees <= 0) return null;
    const annFee = fees / schCY.length * 12, feePct = annFee / avgBal, B = SCH[SCH.length - 1].end, r = DATA.assume.rate;
    const drag = B * (Math.pow(1 + r, 20) - Math.pow(1 + r - feePct, 20));
    return {k: 'save', t: `${SCH_NAME} fees are running ${short(annFee)}/yr (${(feePct * 100).toFixed(2)}%)`, p: `${money(fees)} charged so far in ${CY} on a ~${short(avgBal)} balance. If that's an advisory fee, a lower-cost index allocation could keep most of it invested.`, i: `≈ ${short(drag)} more after 20 yrs at ${(r * 100).toFixed(0)}%`, w: 10};
  });
  // 2 most over budget YTD
  const over = exp.map(c => ({n: c.name, a: yAct(c.name), b: yBud(c.name)})).filter(x => x.b < 0 && x.a < x.b).sort((p, q) => (p.a - p.b) - (q.a - q.b));
  tryI(() => { const x = over[0]; if (!x) return null;
    return {k: 'warn', t: `${x.n} is ${short(x.b - x.a)} over its YTD budget`, p: `${short(-x.a)} spent vs ${short(-x.b)} budgeted through ${MON[monthsElapsed - 1]} (${Math.round(x.a / x.b * 100)}% used). ${PY} ran ${short(-yr(x.n).y[YI - 1])}. Either raise the baseline or tag one-off projects so the monthly budget stays meaningful.`, i: 'Re-baseline budget · split projects', w: 8}; });
  // 3 fastest pace vs. the full-year budget
  tryI(() => { const ann = c => budgetFor(CY, c, 1, 12);
    const x = exp.filter(c => c.name !== over[0]?.n).map(c => ({n: c.name, pace: yAct(c.name) / monthsElapsed * 12, b: ann(c.name)})).filter(x => x.b < 0 && x.pace < x.b * 1.1).sort((p, q) => (p.pace - p.b) - (q.pace - q.b))[0];
    if (!x) return null;
    return {k: 'warn', t: `${x.n} is pacing to ${short(-x.pace)} this year`, p: `${short(-yAct(x.n))} through ${MON[monthsElapsed - 1]} vs a ${short(-x.b)} annual budget.`, i: `${short(x.b - x.pace)} over plan at this pace`, w: 7}; });
  // 4 minerals trend
  tryI(() => { const ys = Object.keys(minGross).map(Number).sort(); if (ys.length < 3) return null;
    const y0 = ys.includes(PY) ? PY : ys[0], y1 = ys[ys.length - 1], m0 = minGross[y0], m1 = minGross[y1]; if (!m0 || y1 <= y0 || m1 >= m0) return null;
    return {k: 'info', t: `Minerals cash flow is forecast to fall ${Math.round((1 - m1 / m0) * 100)}% by ${y1}`, p: `From ${short(m0)} gross in ${y0} to ${short(m1)} est. in ${y1}, so fixed costs are worth anchoring to the lower run-rate.`, i: `Build budgets on the ${y1 - 1}–${String(y1).slice(2)} run-rate`, w: 6}; });
  // 5 cash cushion
  tryI(() => { const cash = BS.cash[L], burn = -yr('Total Expenses (less tax)').y[YI] / monthsElapsed; if (!(burn > 0)) return null;
    return {k: 'info', t: `Cash covers ${(cash / burn).toFixed(1)} months of spending`, p: `${short(cash)} in cash accounts vs ~${short(burn)}/mo average spend in ${CY}. Parking a set buffer in high-yield savings earns interest without touching investments.`, i: `≈ ${short(cash * .035)}/yr at an assumed 3.5% APY`, w: 5}; });
  // 6 biggest change vs. last year
  tryI(() => { const ch = exp.map(c => { const a = -yr(c.name).y[YI - 1] / 12, b = -yr(c.name).y[YI] / monthsElapsed; return {n: c.name, a, b, d: b - a}; }).filter(x => x.a > 150 && Math.abs(x.d) > 75).sort((p, q) => Math.abs(q.d) - Math.abs(p.d))[0];
    if (!ch) return null; const down = ch.d < 0;
    return {k: down ? 'save' : 'warn', t: `${ch.n} is ${down ? 'down' : 'up'} ${Math.abs(Math.round((ch.b / ch.a - 1) * 100))}% vs ${PY}`, p: `Averaging ${money(ch.b)}/mo in ${CY} vs ${money(ch.a)}/mo last year.`, i: `${short(Math.abs(ch.d) * 12)}/yr ${down ? 'saved' : 'more'} vs ${PY} pace`, w: 4}; });
  // 7 highest-rate loan
  tryI(() => { const l = ST.loans.filter(l => l.status === 'active' && l.type !== 'Mortgage' && loanBal(l) > 0).sort((p, q) => (q.rate || 0) - (p.rate || 0))[0]; if (!l) return null;
    return {k: 'info', t: `${l.name}: ${short(loanBal(l))} left at ${money(l.pmt || 0)}/mo`, p: `At ${pctRate(l.rate || 0)}, compare it to what your investments are expected to earn. Paying it off frees ${short((l.pmt || 0) * 12)}/yr of fixed spending; it ends ${mLabel(loanPayoff(l.id))} on schedule.`, i: (l.rate || 0) > DATA.assume.rate + .025 ? 'Rate is above the plan return → consider payoff' : 'Rate is below the plan return', w: 3}; });
  return out.sort((a, b) => b.w - a.w);
}
let INS = [];
const insHTML = list => list.map(x => `<div class="ins"><div class="badge b-${x.k}">${icon(x.k === 'save' ? 'save' : x.k === 'warn' ? 'warn' : 'info')}</div><div><h4>${esc(x.t)}</h4><p>${esc(x.p)}</p><div class="impact">${esc(x.i)}</div></div></div>`).join('');

/* ================= page: overview ================= */
let nwRange = 'all';
function renderOverview(pg) {
  INS = buildInsights();
  const nw12 = BS.netWorth[i12], nwYtd = BS.netWorth[iDecPY];
  const inv = investable(L) + BS.college[L];
  const CF = cashflowByMonth(CY), ytdInc = sum(CF.inc), ytdExp = -sum(CF.exp);
  const chkN = typeof dataChecks === 'function' ? dataChecks().list.filter(c => c.sev === 'bad').length : 0;
  pg.innerHTML = `${chkN ? `<div class="banner" style="margin-bottom:14px">${icon('warn')}<span><b>${chkN} data check${chkN > 1 ? 's' : ''}</b> need${chkN > 1 ? '' : 's'} a look — some balances may be off, which would skew net worth.</span><button class="btn" style="height:30px;margin-left:auto" onclick="go('balances')">Review</button></div>` : ''}
  <div class="grid g-12">
    <div class="card hero c-6">
      <div class="kpi"><div class="label hero-top"><span>Net worth · ${mLabel(BS.months[L])}</span><button class="link hero-link" onclick="go('plan')">Open plan →</button></div>
      <div class="val num">${money(NW)}</div>
      <div class="delta">${chip(nz((NW - nwYtd) / Math.abs(nwYtd)))} <span style="margin-left:6px">${short(NW - nwYtd)} YTD · ${short(NW - nw12)} past 12 mo</span></div></div>
      <div class="hero-grid">
        <div>Investments<b class="num">${short(inv)}</b></div>
        <div>Home & vehicle equity<b class="num">${short(BS.assets[L])}</b></div>
        <div>Cash<b class="num">${short(BS.cash[L])}</b></div>
        <div>Retire-ready age<b class="num">${earliest(pvSc()) ?? '> 65'}</b></div>
      </div>
      <div class="hero-plan" title="Plan · ${esc(pvSc().name)}: ${short(planAt(pvSc(), pvSc().p.retire, 'nw'))} net worth at ${pvSc().p.retire}"><span>Plan · ${esc(pvSc().name)}</span><b>${short(planAt(pvSc(), pvSc().p.retire, 'nw'))}</b> net worth at ${pvSc().p.retire} (median, ${PV.real ? "today's $" : 'future $'})</div>
    </div>
    ${['brokerage', 'retirement'].map(k => { const S = BS[k], v = S[L], d = S[iDecPY], lbl = k === 'brokerage' ? 'Brokerage' : 'Retirement';
      return `<div class="card c-2 kpi"><div class="label"><span class="ico">${icon('invest')}</span>${lbl}</div>
      <div class="val num">${short(v)}</div>
      <div class="delta">${chip(nz((v - d) / Math.abs(d || 1)))} <span class="num ${v - d >= 0 ? 'pos' : 'neg'}" style="margin-left:4px;font-weight:600">${v - d >= 0 ? '+' : '−'}${short(Math.abs(v - d))}</span> since Dec</div>
      <div style="margin-top:14px">${spark(BS.months.slice(-24).map((m, j) => S[L - 23 + j] ?? 0), k === 'brokerage' ? 'var(--s1)' : 'var(--s2)', 200, 40)}</div></div>`; }).join('')}
    <div class="card c-2 kpi"><div class="label"><span class="ico">${icon('cash')}</span>${CY} cash flow</div>
      <div class="val num">${short(ytdInc + ytdExp)}</div>
      <div class="delta">${exclLabel()} · ${ytdInc ? Math.round((ytdInc + ytdExp) / ytdInc * 100) : 0}% of income kept</div>
      ${(() => { const P0 = cashflowByMonth(PY), pv = sum(P0.inc) - sum(P0.exp), cv = ytdInc + ytdExp, dd = cv - pv; return `<div class="delta cf-py">${PY} same months (Jan–${MON[ASOF.m - 1]}): <b class="num">${short(pv)}</b> <span class="num ${dd >= 0 ? 'pos' : 'neg'}">${dd >= 0 ? '+' : '−'}${short(Math.abs(dd))}</span></div>`; })()}
      <div style="margin-top:14px">${spark(CF.inc.map((v, i) => v - CF.exp[i]), 'var(--s2)', 200, 40)}</div></div>

    <div data-slot="glance"></div>${typeof ovWeekCard === 'function' ? ovWeekCard() : ''}<div data-slot="notes"></div>
    <div class="card c-8">
      <div class="card-h"><div><h3>Net worth · actual & plan</h3><div class="sub">Month-end actuals, then the plan's projected range · ${PV.real ? "today's dollars (past values inflation-adjusted too)" : 'nominal dollars'}</div></div>
        <div class="right" style="display:flex;gap:8px;align-items:center">${lblToggle()}<div class="seg" id="nwSeg">${[['1y', '±1Y'], ['3y', '±3Y'], ['5y', '±5Y'], ['all', 'All']].map(([k, l]) => `<button data-k="${k}" class="${k === nwRange ? 'on' : ''}" title="${k === 'all' ? 'All history, plus the plan horizon below' : 'This many years back and ahead'}">${l}</button>`).join('')}</div></div></div>
      ${planControls('nw')}
      <div class="chart" id="nwChart"></div>${planLegend('Net worth')}
      ${planStats('nw')}
      <div class="hint nw-fix">${icon('info')}<span>Net worth = cash + investments + home and vehicle <i>equity</i> − other debt. Months without a new balance carry the last one forward.</span></div>
    </div>
    <div class="card c-4">
      <div class="card-h"><div><h3>Where it sits</h3><div class="sub">Gross assets · ${short(BS.investing[L] + BS.cash[L] + BS.assets[L])}</div></div></div>
      <div id="alloc"></div>
    </div>

    ${ovAssetsCard()}${ovBalanceCard()}
    <div data-slot="month"></div><div data-slot="ytd"></div>
    ${ovVendorsCard()}
    <div class="card c-5 ins-card">
      <div class="card-h"><div><h3>Insights</h3><div class="sub">Ranked by dollar impact · ${INS.length} in all</div></div><div class="right"><button class="btn" onclick="go('plan')" style="height:32px">See all</button></div></div>
      <div class="ins-scroll">${insHTML(INS)}</div>
    </div>
    <div data-slot="changed"></div><div data-slot="top"></div>
    ${ovUpcomingCard()}<div data-slot="kids"></div>
    <div data-slot="cuts"></div>
  </div>`;
  embedSummary($('.grid', pg));
  // allocation stacked bar
  const parts = [
    {n: 'Brokerage', v: BS.brokerage[L], c: 'var(--s1)'},
    {n: 'Retirement', v: BS.retirement[L], c: 'var(--s2)'},
    {n: 'Home & vehicle equity', v: BS.assets[L], c: 'var(--s3)'},
    {n: 'Cash', v: BS.cash[L], c: 'var(--s4)'},
    {n: '529s & HSA', v: BS.college[L] + BS.hsa[L], c: 'var(--s5)'},
  ].filter(p => p.v > 0);
  const tot = sum(parts.map(p => p.v)) || 1;
  $('#alloc').innerHTML = `<div style="display:flex;gap:2px;height:14px;border-radius:7px;overflow:hidden;margin:4px 0 14px">${parts.map(p => `<div title="${esc(p.n)}" style="flex:${p.v};background:${p.c}"></div>`).join('')}</div>
    <div class="list">${parts.map(p => `<div class="li"><i class="sw" style="background:${p.c};width:10px;height:10px"></i><div class="nm">${p.n}</div><div class="amt num">${short(p.v)} <span class="muted" style="font-weight:500;margin-left:6px">${(p.v / tot * 100).toFixed(0)}%</span></div></div>`).join('')}</div>`;
  wirePlanControls('nw');
  $$('#nwSeg button').forEach(b => b.onclick = () => { nwRange = b.dataset.k; $$('#nwSeg button').forEach(x => x.classList.toggle('on', x === b)); drawNW(); });
  const drawNW = () => {
    const yrsBack = {'1y': 1, '3y': 3, '5y': 5}[nwRange], st = yrsBack ? Math.max(0, L - 12 * yrsBack) : 0;
    const labels = BS.months.slice(st, L + 1), vals = BS.netWorth.slice(st, L + 1);
    const flags = typeof dataChecks === 'function' ? dataChecks().list.filter(c => c.sev === 'bad' && /^(swing|rollup|rollupjump)\|/.test(c.id)).filter((c, i, a) => a.findIndex(x => x.m === c.m) === i) : [];
    histPlanChart($('#nwChart'), {hLabels: labels, hVals: vals, kind: 'nw', name: 'Net worth', height: 280, events: [], futureMax: yrsBack ? 12 * yrsBack : null, flags});
  };
  wireLblToggle(drawNW);
  const m = CF.inc, ex = CF.exp;
  CH.push(drawNW);
}

/* ================= page: budget ================= */
let bMode = 'month';
const YOPEN = new Set();
const YCH = {cat: '', sub: ''};   // Years chart only: '' = all spending
// a year's transactions for a category (and sub-category: null = all, '__none' = none); split lines count on their own
function openYearTx(cat, sub, year) {
  const yrs = Y.years.map(String).slice(-8), y = String(year || yrs[yrs.length - 1]);
  const hit = p => (p.cat || '') === cat && (sub == null || (sub === '__none' ? !p.sub : (p.sub || '') === sub));
  const list = []; ST.tx.forEach(t => { if (t.d.slice(0, 4) !== y) return; pieces(t).forEach(p => { if (hit(p)) list.push({t, amt: p.amt}); }); });
  list.sort((a, b) => a.amt - b.amt);
  const partial = `${y}-01-01` < CTX.SINCE && !ST.allLoaded, tot = sum(list.map(x => x.amt));
  const d = $('#drawer'); d.classList.add('wide-d');
  d.innerHTML = `<div class="dh"><div><div class="muted" style="font-size:12px;font-weight:600">Transactions · ${y}</div><h2>${esc(cat)}${sub != null ? ` <span class="muted" style="font-weight:500">› ${esc(sub === '__none' ? 'No sub-category' : sub)}</span>` : ''}</h2></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="seg yt-yrs" style="margin:10px 0 12px;flex-wrap:wrap">${yrs.map(v => `<button data-yy="${v}" class="${v === y ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="stat-row" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:12px"><div class="mini"><div class="l">Total</div><div class="v num">${money(Math.abs(tot))}</div></div><div class="mini"><div class="l">Transactions</div><div class="v num">${list.length}</div></div><div class="mini"><div class="l">Average</div><div class="v num">${list.length ? money(Math.abs(tot) / list.length) : '—'}</div></div></div>
    ${partial ? `<div class="banner" style="margin-bottom:10px">${icon('info')}<span>${y} starts before ${mLabel(CTX.SINCE.slice(0, 7))}, so only part of the year is loaded. <button class="link" id="ytLoad">Load full history</button></span></div>` : ''}
    <div class="list" id="ytList">${list.slice(0, 400).map(x => txLi(x.t, x.amt)).join('') || '<p class="muted">No transactions in the loaded history.</p>'}</div>
    ${list.length > 400 ? `<p class="muted" style="font-size:12px;margin-top:8px">Showing the largest 400 of ${list.length}.</p>` : ''}
    <button class="btn" id="ytAll" style="margin-top:12px">${icon('tx')}<span>Open in Transactions</span></button>`;
  openLayer('drawer');
  $$('[data-yy]', d).forEach(b => b.onclick = () => openYearTx(cat, sub, b.dataset.yy));
  $$('#ytList .li', d).forEach(li => li.onclick = () => openTxEdit(li.dataset.id));
  $('#ytAll').onclick = () => { Object.assign(TXF, {cat, sub: sub == null ? '*' : sub, month: '', vendor: '', q: '', unc: false}); closeAll(); go('tx'); };
  if ($('#ytLoad')) $('#ytLoad').onclick = async e => { e.target.textContent = 'loading…'; e.target.disabled = true;
    try { const older = await DB.loadOlder(CTX.SINCE, 1e6), have = new Set(ST.tx.map(t => t.id)); older.forEach(t => { if (!have.has(t.id)) ST.tx.push(t); }); ST.tx.sort((a, b) => b.d.localeCompare(a.d)); ST.allLoaded = true; SYNC.adopt('tx', older.map(t => t.id)); openYearTx(cat, sub, y); }
    catch (err) { toast('Couldn’t load: ' + err.message); } };
}
function renderYears(pg, seg) {
  const yrs = Y.years.map(String), idx = yrs.map((y, i) => i).filter(i => i >= yrs.length - 8), cys = String(CY);
  const exRowsY = Y.rows.filter(r => ST.excl.has(r.name));
  const expAt = (i, fc) => -((fc ? yr('Total Expenses (with tax)').fcCur : yr('Total Expenses (with tax)').y[i]) - sum(exRowsY.filter(r => r.group !== 'Income').map(r => fc ? r.fcCur : r.y[i])));
  const exp = idx.map(i => expAt(i));
  const labels = idx.map(i => yrs[i] === cys ? cys + ' YTD' : yrs[i]).concat([cys + ' F']);
  const vals = exp.concat([expAt(0, true)]);
  const cats = Y.rows.filter(r => /Variable|Fixed/.test(r.group) && !/Total/.test(r.name) && !ST.excl.has(r.name) && Math.abs(r.y[YI - 1]) > 1500).sort((a, b) => a.y[YI - 1] - b.y[YI - 1]);
  const show = idx.slice(-6);
  // sub-categories by year (from the monthly history)
  const SY = {}; Object.entries(DATA.subMonthly || {}).forEach(([m, o]) => { const y = m.slice(0, 4); for (const [k, v] of Object.entries(o)) { if (ST.exclSub?.has(k)) continue; ((SY[k] ||= {})[y] = (SY[k][y] || 0) + v); } });
  const subsOf = c => Object.keys(SY).filter(k => k.startsWith(c + '|')).map(k => k.slice(c.length + 1)).filter(sb => show.some(i => Math.abs(SY[c + '|' + sb][yrs[i]] || 0) >= 1))
    .sort((a, b) => (SY[c + '|' + a][yrs[show[show.length - 2] ?? show[0]]] || 0) - (SY[c + '|' + b][yrs[show[show.length - 2] ?? show[0]]] || 0));
  const hasSubs = cats.filter(r => subsOf(r.name).length).map(r => r.name);
  const subRows = r => { if (!YOPEN.has(r.name)) return ''; const subs = subsOf(r.name);
    const rest = show.map(i => -r.y[i] - sum(subs.map(sb => -(SY[r.name + '|' + sb][yrs[i]] || 0))));
    return subs.map(sb => `<tr class="sub"><td><span class="tw sub-name">${esc(sb)}</span></td>${show.map(i => `<td class="yt-c" data-ytx="${esc(r.name)}" data-yts="${esc(sb)}" data-yy="${yrs[i]}">${short(-(SY[r.name + '|' + sb][yrs[i]] || 0))}</td>`).join('')}<td class="hide-sm" style="width:120px">${spark(show.slice(0, -1).map(i => -(SY[r.name + '|' + sb][yrs[i]] || 0)), 'var(--s4)', 100, 22, false)}</td></tr>`).join('')
      + (rest.some(v => Math.abs(v) >= 50) ? `<tr class="sub"><td><span class="tw sub-name"><i class="muted">No sub-category</i></span></td>${rest.map((v, k) => `<td class="yt-c" data-ytx="${esc(r.name)}" data-yts="__none" data-yy="${yrs[show[k]]}">${short(v)}</td>`).join('')}<td class="hide-sm"></td></tr>` : ''); };
  pg.innerHTML = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px">${seg}<span class="chip">${yrs[idx[0]]} – ${cys}</span>${hasSubs.length ? `<button class="btn" id="yrExp" style="margin-left:auto">${icon('chev')}<span>${YOPEN.size ? 'Collapse all' : 'Expand all'}</span></button>` : ''}</div>
  <div class="grid g-12">
    <div class="card c-12" data-lk="annual-spending"><div class="card-h"><div><h3>${YCH.cat ? esc(YCH.cat) + (YCH.sub ? ' › ' + esc(YCH.sub === '__none' ? 'No sub-category' : YCH.sub) : '') + ' by year' : 'Annual spending'}</h3><div class="sub">${YCH.cat ? (YCH.sub ? `From the monthly history · no forecast bar for sub-categories` : `Dashed bar is the full-year ${CY} forecast (actuals + remaining budget)`) : `${exclLabel()} · dashed bar is the full-year ${CY} forecast (actuals + remaining budget)`} · the filter only changes this chart</div></div>
      <div class="right" style="display:flex;gap:8px;flex-wrap:wrap"><select class="in sel" id="ychCat" style="width:auto;max-width:220px"><option value="">All spending</option>${[['Fixed Expenses', 'Fixed'], ['Variable Expenses', 'Variable'], [null, 'Income']].map(([g, gl]) => { const rs = Y.rows.filter(r => (r.group ?? null) === g && !/Total|Net/.test(r.name)); return rs.length ? `<optgroup label="${gl}">${rs.map(r => `<option ${YCH.cat === r.name ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>
        ${YCH.cat ? `<select class="in sel" id="ychSub" style="width:auto;max-width:200px"><option value="">All sub-categories</option>${Object.keys(SY).filter(k => k.startsWith(YCH.cat + '|')).map(k => k.slice(YCH.cat.length + 1)).sort().map(sb => `<option ${YCH.sub === sb ? 'selected' : ''}>${esc(sb)}</option>`).join('')}</select>
        <button class="btn" id="ychTx" style="height:34px">${icon('tx')}<span>Transactions</span></button>` : ''}</div></div><div class="chart" id="yrChart"></div></div>
    <div class="card c-12"><div class="card-h"><div><h3>By category</h3><div class="sub">Largest categories by ${PY} spend · open a category for its sub-categories</div></div></div>
    <div class="scroll-x"><table class="table"><tr><th>Category</th>${show.map(i => `<th>${yrs[i]}${yrs[i] === cys ? ' YTD' : ''}</th>`).join('')}<th class="hide-sm">Trend</th></tr>
    ${cats.map(r => { const has = hasSubs.includes(r.name), op = YOPEN.has(r.name); return `<tr class="${has ? 'click' : ''} ${op ? 'open' : ''}" ${has ? `data-yc="${esc(r.name)}"` : ''}><td><span class="tw">${has ? `<button class="chev ${op ? 'on' : ''}">${icon('chev', 2.4)}</button>` : '<span class="chev-sp"></span>'}${esc(r.name)}</span></td>${show.map(i => `<td class="yt-c" data-ytx="${esc(r.name)}" data-yy="${yrs[i]}" title="See ${esc(r.name)} transactions in ${yrs[i]}">${short(-r.y[i])}</td>`).join('')}<td class="hide-sm" style="width:120px">${spark(show.slice(0, -1).map(i => -r.y[i]), 'var(--s2)', 100, 26, false)}</td></tr>` + subRows(r); }).join('')}</table></div></div>
  </div>`;
  $$('#bSeg button').forEach(b => b.onclick = () => { bMode = b.dataset.k; render(); });
  $$('[data-yc]', pg).forEach(tr => tr.onclick = () => { const k = tr.dataset.yc; YOPEN.has(k) ? YOPEN.delete(k) : YOPEN.add(k); render(); });
  if ($('#yrExp')) $('#yrExp').onclick = () => { if (YOPEN.size) YOPEN.clear(); else hasSubs.forEach(n => YOPEN.add(n)); render(); };
  $$('[data-ytx]', pg).forEach(td => td.onclick = e => { e.stopPropagation(); openYearTx(td.dataset.ytx, td.dataset.yts ?? null, td.dataset.yy); });
  $('#ychCat').onchange = e => { YCH.cat = e.target.value; YCH.sub = ''; render(); };
  if ($('#ychSub')) $('#ychSub').onchange = e => { YCH.sub = e.target.value; render(); };
  if ($('#ychTx')) $('#ychTx').onclick = () => openYearTx(YCH.cat, YCH.sub || null, cys);
  const yRow = YCH.cat ? Y.rows.find(r => r.name === YCH.cat) : null;
  if (YCH.cat && !yRow) YCH.cat = '';
  if (yRow) { const inc = !yRow.group || /Income/.test(yRow.group), sg = v => inc ? v : -v;
    const cv = YCH.sub ? idx.map(i => sg(SY[YCH.cat + '|' + YCH.sub]?.[yrs[i]] || 0)) : idx.map(i => sg(yRow.y[i]));
    const lab = YCH.sub ? labels.slice(0, -1) : labels, vv = YCH.sub ? cv : cv.concat([sg(yRow.fcCur ?? 0)]);
    CH.push(() => barChart($('#yrChart'), {labels: lab, series: [{name: YCH.sub || YCH.cat, values: vv, color: inc ? 'var(--s1)' : 'var(--s2)', hatchFn: i => !YCH.sub && i === lab.length - 1}], height: 250, xGap: 60}));
    return; }
  CH.push(() => barChart($('#yrChart'), {labels, series: [{name: 'Spending', values: vals, color: 'var(--s2)', hatchFn: i => i === labels.length - 1}], height: 250, xGap: 60,
    tipExtra: i => { const j = idx[i]; return j == null ? '' : tipRow(null, 'Income', short(yr('Total Income').y[j] - sum(exRowsY.filter(r => r.group === 'Income').map(r => r.y[j])))); }}));
}
/* ================= page: investments ================= */
function renderInvest(pg) {
  CH.push(drawBench);
  const tot = investable(L) + BS.college[L];
  const nM = schCY.length || 1;
  const gains = schCY.map(r => r.div + r.mkt + r.fee);
  const twr = schCY.reduce((a, r) => a * (1 + nz((r.div + r.mkt + r.fee) / r.start)), 1) - 1;
  const divs = sum(schCY.map(r => r.div)), fees = -sum(schCY.map(r => r.fee));
  const last = SCH[SCH.length - 1] || {end: 0, m: BS.months[L]};
  const accts = CTX.invAccts.filter(a => a.group !== 'College').map(a => ({...a, c: a.group === 'Retirement' ? 'var(--s2)' : a.kind === 'hsa' ? 'var(--s5)' : 'var(--s1)'}));
  const mo529 = DATA.assume.college529Monthly;
  const kids = DATA.kids.map(k => {
    const bal = BS[k.key]?.[L] || 0, y18 = collegeYear(k), yrsLeft = Math.max(0, (new Date(y18, 7) - new Date(CTX.TODAY)) / 3.156e10);
    const r = .045 / 12, n = Math.round(yrsLeft * 12), proj = bal * Math.pow(1 + r, n) + mo529 * ((Math.pow(1 + r, n) - 1) / r);
    return {...k, bal, y18, proj, yrsLeft};
  });
  const target = DATA.assume.collegeTarget;
  pg.innerHTML = `<div class="grid g-12">
    <div class="card c-3 kpi"><div class="label">Total invested</div><div class="val num">${short(tot)}</div><div class="delta">${chip(nz((tot - investable(i12) - BS.college[i12]) / (investable(i12) + BS.college[i12])))} past 12 mo</div></div>
    <div class="card c-3 kpi"><div class="label">${esc(SCH_NAME)} return · ${CY} YTD</div><div class="val num ${twr >= 0 ? 'pos' : 'neg'}">${pct(twr)}</div><div class="delta">${short(sum(gains))} after fees · time-weighted</div></div>
    <div class="card c-3 kpi"><div class="label">Dividends & interest · YTD</div><div class="val num">${short(divs)}</div><div class="delta">~${short(divs / nM * 12)}/yr run-rate</div></div>
    <div class="card c-3 kpi"><div class="label">Fees · YTD</div><div class="val num">${short(fees)}</div><div class="delta">${nz((fees / nM * 12) / (sum(schCY.map(r => r.start)) / nM) * 100).toFixed(2)}% of balance annualized</div></div>

    <div class="card c-8"><div class="card-h"><div><h3>${PV.pm === 'total' ? 'Investable portfolio · actual & plan' : esc(SCH_NAME)}</h3><div class="sub">${PV.pm === 'total' ? 'Every investable account · plan range from ' + esc(pvSc().name) : 'Month-end balance since funding · ' + short(last.end) + ' on ' + mLabel(last.m)}</div></div>
      <div class="right"><div class="seg" id="pmSeg"><button data-k="total" class="${PV.pm === 'total' ? 'on' : ''}">Investable</button>${SCH.length ? `<button data-k="schwab" class="${PV.pm === 'schwab' ? 'on' : ''}">${esc(SCH_NAME.split(' ').pop())}</button>` : ''}</div></div></div>
      ${PV.pm === 'total' ? planControls('pf') : ''}
      <div class="chart" id="schChart"></div>${PV.pm === 'total' ? planLegend('Investable') + planStats('inv') : ''}
      <div class="legend" style="${PV.pm === 'total' ? 'display:none' : ''}"><span><i class="sw" style="background:var(--s1)"></i>Balance</span><span><i class="sw" style="background:var(--s2);border-radius:50%"></i>Deposit</span><span><i class="sw" style="background:var(--s5);border-radius:50%"></i>Withdrawal</span></div></div>
    <div class="card c-4"><div class="card-h"><div><h3>Accounts</h3><div class="sub">Last 24 months</div></div></div>
      <div class="list">${accts.map(a => { const v = BS[a.k].slice(-24); const ch = v.length > 12 && v[v.length - 13] ? (v[v.length - 1] - v[v.length - 13]) / v[v.length - 13] : 0; return `<div class="li"><div style="min-width:0"><div class="nm">${esc(a.n)}</div><div class="ds">${a.d}</div></div><div style="margin-left:auto">${spark(v, a.c, 64, 26, false)}</div><div class="amt num" style="margin-left:12px;min-width:72px">${short(BS[a.k][L])}<div style="font-size:11px;font-weight:600" class="${ch >= 0 ? 'pos' : 'neg'}">${pct(ch, 0)} 1y</div></div></div>`; }).join('')}</div></div>

    ${flowCard()}
    ${accountProjection()}
    ${SCH.length ? benchCard() : ''}
    ${SCH.length ? `<div class="card c-12"><div class="card-h"><div><h3>Monthly gain / loss</h3><div class="sub">Market change + dividends − fees, excluding deposits & withdrawals</div></div></div><div class="chart" id="retChart"></div></div>` : ''}
    ${collegeSection(kids, target, mo529)}
  </div>`;
  const labels = SCH.map(r => r.m), vals = SCH.map(r => r.end);
  const mk = SCH.map((r, i) => (r.dep + r.wd) !== 0 ? {i, color: r.dep + r.wd > 0 ? 'var(--s2)' : 'var(--s5)'} : null).filter(Boolean);
  $$('#pmSeg button').forEach(b => b.onclick = () => { PV.pm = b.dataset.k; render(); }); wirePlanControls('pf');
  if (!SCH.length) PV.pm = 'total';
  CH.push(() => drawCollege(kids));
  CH.push(drawFlows);
  const i0 = Math.max(0, L - 60);
  CH.push(() => PV.pm === 'total' ? histPlanChart($('#schChart'), {hLabels: BS.months.slice(i0), hVals: BS.months.slice(i0).map((m, k) => investable(i0 + k)), kind: 'inv', name: 'Investable', height: 300, events: []}) : lineChart($('#schChart'), {labels, series: [{name: 'Balance', values: vals, color: 'var(--s1)', area: true}], markers: mk, height: 250, xFmt: (lb, i, e) => i % e === 0 ? mShort(lb) : null, tipTitle: mLabel,
      tipExtra: i => { const r = SCH[i]; return (r.dep ? tipRow('var(--s2)', 'Deposit', short(r.dep)) : '') + (r.wd ? tipRow('var(--s5)', 'Withdrawal', short(r.wd)) : '') + tipRow(null, 'Gain', short(r.div + r.mkt + r.fee)); }}),
    () => { if (!SCH.length) return; const g = SCH.map(r => r.div + r.mkt + r.fee); barChart($('#retChart'), {labels, series: [{name: 'Gain / loss', values: g, colorFn: v => v >= 0 ? 'var(--pos)' : 'var(--neg)'}], height: 230, xGap: 52, xFmt: mShort, tipTitle: mLabel,
      tipExtra: i => tipRow(null, 'Return', pct(g[i] / SCH[i].start, 2))}); });
}

/* college: rolled up, by child, projection and semester draws — see js/app8.js */

/* ================= page: plan ================= */
const A = {retire: DATA.assume.retireAge, spend: DATA.assume.annualExp, ret: DATA.assume.rate + .025, infl: .025, pre: -30000, ss: 0, real: true};
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const minNet = (() => { const by = {}; DATA.minerals.forEach(m => { const y = m.date.slice(0, 4); by[y] = (by[y] || 0) + m.net; }); return by; })();
const minGross = (() => { const by = {}; DATA.minerals.forEach(m => { const y = +m.date.slice(0, 4); by[y] = (by[y] || 0) + m.amt; }); return by; })();
const minLastY = Math.max(0, ...Object.keys(minNet).map(Number));
const minBase = minNet[minLastY] || 0, minDecl = minNet[minLastY - 2] && minBase ? Math.min(0, Math.pow(minBase / minNet[minLastY - 2], 1 / 2) - 1) : 0;
function simulate(retireAge, sims = 500, seedBase = 7) {
  const start = investable(L), years = 95 - ageNow, contrib = DATA.assume.k401max + DATA.assume.employer;
  const paths = [];
  let ok = 0;
  for (let s = 0; s < sims; s++) {
    const R = rng(seedBase * 1000 + s); let b = start; const p = [b];
    for (let t = 1; t <= years; t++) {
      const age = ageNow + t, cal = YNOW + t;
      const u1 = R() || 1e-9, u2 = R(), z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const r = A.ret + .12 * z, inf = Math.pow(1 + A.infl, t);
      const mins = minNet[cal] ?? minBase * Math.pow(1 + minDecl, cal - minLastY);
      let flow;
      if (age < retireAge) flow = contrib + A.pre;
      else flow = -A.spend * inf + mins + (age >= 67 ? A.ss * inf : 0);
      b = b > 0 ? b * (1 + r) + flow : 0;
      p.push(Math.max(0, b));
    }
    if (p[p.length - 1] > 0) ok++;
    paths.push(p);
  }
  return {paths, prob: ok / sims, years};
}
function pctl(paths, q) { const n = paths[0].length, out = []; for (let t = 0; t < n; t++) { const col = paths.map(p => p[t]).sort((a, b) => a - b); out.push(col[Math.floor(q * (col.length - 1))]); } return out; }
function renderPlan(pg) {
  pg.innerHTML = planSeg();
  if (PLV === 'retire') { renderRetirement(pg); wirePlanSeg(); return; }
  if (PLV === 'simple' || PLV === 'invest') { const h = document.createElement('div'); pg.appendChild(h); (PLV === 'simple' ? renderPlanSimple : renderInvest)(h); wirePlanSeg(); return; }
  const host = document.createElement('div'); pg.appendChild(host); wirePlanSeg(); pg = host;
  const sliders = [
    ['retire', 'Retire at age', 45, 65, 1, v => v],
    ['spend', 'Annual spending in retirement', 120000, 360000, 5000, v => short(v) + '/yr'],
    ['ret', 'Expected return', .03, .09, .0025, v => (v * 100).toFixed(2).replace(/0$/, '') + '%'],
    ['infl', 'Inflation', .015, .04, .0025, v => (v * 100).toFixed(2).replace(/0$/, '') + '%'],
    ['pre', 'Net cash flow until retirement', -120000, 60000, 5000, v => short(v) + '/yr'],
    ['ss', 'Social Security from 67 (today $)', 0, 80000, 2500, v => v ? short(v) + '/yr' : 'Not included'],
  ];
  INS = buildInsights();
  const events = planEvents();
  const wKey = w => { const m = w.match(/(\w{3}) (\d{4})/); if (m) return +m[2] * 12 + MON.indexOf(m[1]); const y = w.match(/\d{4}/); return y ? +y[0] * 12 + 6 : 0; };
  events.sort((p, q) => wKey(p.w) - wKey(q.w));
  pg.innerHTML = `<div class="grid g-12">
    <div class="card c-6" style="align-self:start"><div class="card-h"><div><h3>Planned expenses & milestones</h3><div class="sub">Your planned expenses, loan payoffs, taxes and retirement</div></div><div class="right"><button class="btn" style="height:32px" onclick="addExpense()">${icon('plus')}<span>Add</span></button></div></div>
      <div class="tl" id="tl">${events.map(e => `<div class="ev ${e.far ? 'far' : ''}" ${e.id ? `id="${e.id}"` : ''}><div class="when">${e.w}</div><div class="row"><div><div class="nm" style="font-weight:600">${esc(e.n)}</div><div class="muted" style="font-size:12px">${esc(e.d)}</div></div><div class="amt num">${e.a ? money(e.a) : ''}</div>${e.pid && CTX.CAN_WRITE ? `<button class="mini-btn" data-rmpe="${e.pid}" title="Remove">${icon('close')}</button>` : ''}</div></div>`).join('')}</div></div>
    <div class="card c-6" style="align-self:start"><div class="card-h"><div><h3>Minerals cash flow</h3><div class="sub">Gross monthly · actuals vs. your forecast</div></div></div>
      <div class="chart" id="minChart"></div>
      <div class="legend"><span><i class="sw" style="background:var(--s1)"></i>Actual</span><span><i class="sw" style="background:var(--s1);opacity:.35"></i>Estimate</span></div>
      <div class="stat-row" style="margin-top:14px;grid-template-columns:repeat(5,1fr)">${[PY, CY, CY + 1, CY + 2, CY + 3].map(String).map(y => `<div class="mini" style="padding:10px"><div class="l">${y}${+y > CY ? ' est' : +y === CY ? ' A+E' : ''}</div><div class="v num" style="font-size:15px">${short(sum(DATA.minerals.filter(m => m.date.startsWith(y)).map(m => m.amt)))}</div></div>`).join('')}</div></div>

    <div class="card c-12"><div class="card-h"><div><h3>What to do better</h3><div class="sub">Generated from your budget, balances and forecasts · ranked by impact</div></div></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:0 28px">${insHTML(INS)}</div></div>
  </div>`;
  const mins = DATA.minerals.filter(m => m.date >= `${PY}-01`);
  $$('[data-rmpe]', pg).forEach(b => b.onclick = () => { const p = ST.planned.find(x => x.id === b.dataset.rmpe); ST.planned = ST.planned.filter(x => x !== p); render(); toast(`Removed ${p.name}`, () => { ST.planned.push(p); render(); }); });
  CH.push(() => barChart($('#minChart'), {labels: mins.map(m => m.date.slice(0, 7)), series: [{name: 'Gross', nameFn: i => mins[i].type === 'Actual' ? 'Actual' : 'Estimate', values: mins.map(m => m.amt), color: 'var(--s1)', hatchFn: i => mins[i].type !== 'Actual'}], height: 240, xGap: 56, xFmt: mShort,
    tipTitle: mLabel, tipExtra: i => tipRow(null, 'Net of tax', short(mins[i].net)) + (/Escrow/.test(mins[i].src) ? tipRow(null, 'Note', esc(mins[i].src)) : '')}));
}
function planEvents() {
  const ev = [], mk = m => mLabel(m);
  (ST.planned || []).filter(p => p.status !== 'done' && p.status !== 'cancelled' && p.due >= CTX.ASOF_YM).forEach(p => ev.push({w: mk(p.due), n: p.name, d: p.notes || ({cash: 'Paid from cash', brokerage: 'From brokerage', college_529: '529 + cash flow', budget: 'In the monthly budget', other: ''}[p.fund] || ''), a: -Math.abs(p.amount), pid: p.id, far: p.due > ymAdd(CTX.ASOF_YM, 60) ? 1 : 0}));
  ST.loans.filter(l => l.status === 'active').forEach(l => { const pm = loanPayoff(l.id); ev.push({w: mk(pm), n: l.name + ' paid off', d: `Frees ${money((l.pmt || 0) + (l.escrow && l.type !== 'Mortgage' ? l.escrow : 0))}/mo`, a: null, far: pm > ymAdd(CTX.ASOF_YM, 60) ? 1 : 0}); });
  DATA.kids.forEach(k => { if ((ST.planned || []).some(p => p.name.includes(k.name))) return; const y = collegeYear(k); ev.push({w: 'Aug ' + y, n: k.name + ' starts college', d: '529 + cash flow', a: -DATA.assume.collegeTarget, far: 1}); });
  try { const P = taxProjection(CY), nq = QDUE(CY).concat(QDUE(CY + 1)).find(q => q.d > CTX.TODAY); const due = sum(JK.map(j => Math.max(0, P.j[j].req - P.j[j].paid))); if (nq && due > 0) ev.push({w: fmtD(nq.d).replace(/ \d+,/, ''), n: 'Estimated tax payments', d: 'Catch-up to each safe harbor', a: -due}); } catch (e) {}
  const base = SCN[0]; ev.push({w: String(YNOW + base.p.retire - ageNow), n: 'Retirement · age ' + base.p.retire + ' (' + base.name + ')', d: `Salary & 401(k) contributions stop · ${Math.round(scnRun(base).prob * 100)}% chance money lasts to 95`, a: null, far: 1});
  return ev;
}
function addExpense() {
  const m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Plan a future expense</h2><p class="muted" style="font-size:12.5px">Shows on the plan timeline; optional monthly sinking fund.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="form">
    <div style="grid-column:1/-1"><label>Name</label><input class="in" id="peN" placeholder="e.g. Roof replacement"></div>
    <div><label>Month</label><input class="in" type="month" id="peM" value="${ymAdd(CTX.ASOF_YM, 6)}"></div>
    <div><label>Amount</label><div class="amt-in"><span>$</span><input class="in num" id="peA" inputmode="decimal" placeholder="0"></div></div>
    <div><label>Fund from</label><select class="in" id="peF"><option value="cash">Cash</option><option value="brokerage">Brokerage</option><option value="college_529">529</option><option value="budget">Monthly budget</option><option value="other">Other</option></select></div>
    <div><label>Note</label><input class="in" id="peNo" placeholder="Optional"></div>
  </div>
  <label class="tgl" style="margin-top:12px"><input type="checkbox" id="peS"> Spread a monthly sinking fund until the date</label>
  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="peGo">Add to plan</button></div>`;
  openLayer('modal'); setTimeout(() => $('#peN').focus(), 50);
  $('#peGo').onclick = () => { const n = $('#peN').value.trim(), a = +$('#peA').value.replace(/[$,]/g, ''); if (!n) return $('#peN').focus(); if (!a) return $('#peA').focus();
    ST.planned.push({id: 'p' + Date.now(), name: n, due: $('#peM').value, amount: Math.abs(a), fund: $('#peF').value, notes: $('#peNo').value.trim(), sinking: $('#peS').checked, status: 'planned'});
    closeAll(); render(); toast(`Added ${n} · ${mLabel($('#peM').value)}`); };
}

/* chart labels on/off (milestone and check labels; the dots and tooltips stay) — saved with your preferences */
const lblToggle = () => `<button class="btn lbl-tg ${UI.chartLabels !== false ? 'on' : ''}" style="height:32px" title="Show or hide the labels on the dots">${icon('tag')}<span>Labels</span></button>`;
const wireLblToggle = draw => $$('.lbl-tg').forEach(b => b.onclick = () => { UI.chartLabels = UI.chartLabels === false; $$('.lbl-tg').forEach(x => x.classList.toggle('on', UI.chartLabels !== false)); SYNC.schedule(); CH.forEach(f => f()); });
