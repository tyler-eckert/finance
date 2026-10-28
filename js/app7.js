/* =====================================================================
   ADMIN · people & permissions · table density · page layout (hide / reorder cards)
   ===================================================================== */
Object.assign(I, {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.8 8.3 2 12 2 12s3.6 7 10 7a9.5 9.5 0 004.4-1.1M9.9 9.9a3 3 0 004.2 4.2"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M10 9v12"/>',
});
const IS_OWNER = CTX.ROLE === 'owner';

/* ---------------- UI preferences: per user, with an optional household default ---------------- */
const UI_DEFAULT = {density: {py: 5, fs: 13}, layout: {}};
const clone = o => JSON.parse(JSON.stringify(o));
const UI = (() => { const base = clone(CTX.household.settings?.ui || UI_DEFAULT), mine = CTX.prefs.ui;
  const u = mine ? {...base, ...clone(mine)} : base; u.density = {...UI_DEFAULT.density, ...(u.density || {})}; u.layout ||= {}; return u; })();
let LAYOUT_EDIT = false;
const DENSITY = [{k: 'compact', l: 'Compact', py: 5, fs: 13}, {k: 'cozy', l: 'Cozy', py: 7, fs: 13.5}, {k: 'comfortable', l: 'Comfortable', py: 10, fs: 14}];
function applyDensity() {
  const r = document.documentElement.style;
  r.setProperty('--td-py', UI.density.py + 'px'); r.setProperty('--td-fs', UI.density.fs + 'px');
  const tb = UI.mobile?.tabBottom; if (tb == null) r.removeProperty('--tab-bottom'); else r.setProperty('--tab-bottom', tb + 'px');
}
applyDensity();

/* ---------------- card identity: stable key from the card's title ---------------- */
const MONTHS_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g;
const cardTitle = el => (el.querySelector('h3')?.textContent || el.querySelector('.label')?.textContent || el.querySelector('.nm')?.textContent || (el.querySelector('table') ? (PAGES.find(p => el.closest('#p-' + p.k))?.n || '') + ' table' : '')).replace(/\s+/g, ' ').trim();
const normKey = t => t.toLowerCase().replace(/[’'$€%]/g, '').replace(MONTHS_RE, ' ').replace(/[0-9]+/g, ' ').replace(/[^a-z&+]+/g, ' ').trim().replace(/\s+/g, '-') || 'card';
const pageCards = el => [...el.querySelectorAll('.card')].filter(c => !c.parentElement.closest('.card') && !c.classList.contains('loan-card'));
function tagCards(page, el) {
  const seen = {};
  return pageCards(el).map(c => { let k = c.dataset.lk || normKey(cardTitle(c));   /* data-lk: fixed key for tiles whose title changes */ seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) k += '-' + seen[k]; c.dataset.cid = k; return {el: c, k, t: cardTitle(c) || 'Untitled card'}; });
}
const pageLayout = page => (UI.layout[page] ||= {order: [], hidden: []});
// card order and hidden cards are kept per device (phone / computer); older saved layouts without them fall back to the shared list
const LGET = (L, key) => (L?.[key + 'By']?.[devKey()] ?? L?.[key] ?? []);
const LDK = (page, key) => { const L = pageLayout(page), dk = devKey(); L[key + 'By'] ||= {}; if (!L[key + 'By'][dk]) L[key + 'By'][dk] = (L[key] || []).slice(); return L[key + 'By'][dk]; };
const setOrder = (page, list) => { LDK(page, 'order'); pageLayout(page).orderBy[devKey()] = list; };
function resetPageDev(page) { const L = UI.layout[page]; if (!L) return; const dk = devKey();
  (L.orderBy ||= {})[dk] = []; (L.hiddenBy ||= {})[dk] = []; ['size', 'tall', 'free', 'pos', 'lock'].forEach(k => { if (L[k]) delete L[k][dk]; }); }
/* Locked tiles: when Layout closes, every tile's height on the page is saved (per device). Outside Layout a tile never gets
   SHORTER than that height, so nothing below it jumps up; since v77 it grows when its contents need more room instead of
   clipping or scrolling inside. Open Layout to resize — closing it saves the new sizes. */
function layLock(page, el) { if (!el) return; const dk = devKey(), L = pageLayout(page), K = ((L.lock ||= {})[dk] = {});
  pageCards(el).forEach(c => { if (!c.dataset.cid || c.style.display === 'none' || c.classList.contains('lay-hidden')) return; const h = Math.round(c.getBoundingClientRect().height); if (h > 20) K[c.dataset.cid] = h; });
  if (typeof SYNC !== 'undefined') SYNC.schedule(); }
// tile sizes and compact view are kept separately for a phone-size screen and a computer-size one
const devKey = () => innerWidth <= 860 ? 'phone' : 'desk';
const SIZES = {desk: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12], phone: [4, 6, 12]};
const SIZE_NAME = n => ({2: '⅙', 3: '¼', 4: '⅓', 5: '5/12', 6: '½', 7: '7/12', 8: '⅔', 9: '¾', 10: '⅚', 11: '11/12', 12: 'Full'})[n] || n + '/12';
const isCompact = () => (UI.compact || {})[devKey()] !== false;   // on unless turned off for this kind of device
function applyCompact() { document.body.classList.toggle('compact', isCompact()); }
let DEV_NOW = devKey();
addEventListener('resize', () => { const d = devKey(); if (d !== DEV_NOW) { DEV_NOW = d; applyCompact(); if (typeof buildNav === 'function') buildNav(); if (typeof render === 'function') render(); } });

/* v77 · minimum tile widths: a tile saved at ⅙ of a wide screen gets crushed on a narrower one (one word per line, numbers cut off).
   Each kind of tile has a minimum width in px; on a narrower grid it takes more columns until it fits, and wraps to the next row. */
const MIN_W = c => +c.dataset.minw || (c.classList.contains('hero') ? 300 : c.querySelector('table') ? 360 : c.querySelector('.chart') ? 320 : c.classList.contains('kpi') ? 210 : 260);
function fitMinWidth(card, free) {
  const g = card.parentElement; if (!g || !g.clientWidth || devKey() === 'phone') return;
  const cols = (getComputedStyle(g).gridTemplateColumns.match(/px/g) || []).length || 12; if (cols < 12) return;   // phone grids already stack
  const gap = parseFloat(getComputedStyle(g).columnGap) || 0, colW = (g.clientWidth - gap * 11) / 12;
  const need = Math.min(12, Math.ceil((MIN_W(card) + gap) / (colW + gap))), now = spanOf(card); if (now >= need) return;
  const m = (card.style.gridColumn || '').match(/^(\d+)\s*\//);   // pinned "col / span n": keep the column when it still fits
  card.style.gridColumn = m && free ? `${Math.max(1, Math.min(13 - need, +m[1]))} / span ${need}` : `span ${need}`;
}

/* ---------- v77 · focused Overview: six cards by default (one-time; the old layout is kept in UI.layoutBak and Undo restores it) ---------- */
const OV_CORE = ['ov-this-week', 'net-worth-open-plan', 'at-a-glance', 'net-worth-actual-&-plan', 'where-it-sits', 'notes-for'];
const OV_PHONE = ['net-worth-open-plan', 'at-a-glance', 'ov-this-week', 'where-it-sits', 'net-worth-actual-&-plan', 'notes-for'];
const OV_SIZE = {'ov-this-week': 12, 'net-worth-open-plan': 4, 'at-a-glance': 8, 'net-worth-actual-&-plan': 8, 'where-it-sits': 4, 'notes-for': 12};
function ovFocus(cards) {
  if (UI.ovFocus >= 1 || !cards.length) return false;
  const keys = cards.map(c => c.k), rest = keys.filter(k => !OV_CORE.includes(k)), was = clone(UI.layout.overview || null);
  UI.layoutBak = {...(UI.layoutBak || {}), overview: was};
  UI.layout.overview = {order: [], hidden: [], orderBy: {desk: [...OV_CORE, ...rest], phone: [...OV_PHONE, ...rest]}, hiddenBy: {desk: rest.slice(), phone: rest.slice()}, size: {desk: {...OV_SIZE}}, free: {desk: false, phone: false}};
  UI.ovFocus = 1; if (typeof SYNC !== 'undefined') SYNC.schedule();
  setTimeout(() => toast('Overview trimmed to 6 cards · Layout → eye icon brings any card back', () => { if (was) UI.layout.overview = was; else delete UI.layout.overview; render(); SYNC.schedule(); }), 400);
  return true;
}

/* Apply the saved order / visibility after each render (called from render()) */
function applyLayout(page, el) {
  if (page === 'admin') return;
  // Free placement: tiles that a page stacks in a side column (e.g. Taxes → Upcoming deadlines + From your bank) become tiles of their own
  if (UI.layout[page]?.free?.[devKey()]) [...el.querySelectorAll('.grid')].filter(g => !g.closest('.card')).forEach(g => [...g.children].forEach(w => {
    if (w.classList.contains('card') || !w.children.length || ![...w.children].every(x => x.classList.contains('card'))) return;
    const span = [...w.classList].find(k => /^c-\d+$/.test(k));
    [...w.children].forEach(x => { if (span && ![...x.classList].some(k => /^c-\d+$/.test(k))) x.classList.add(span); g.insertBefore(x, w); }); w.remove(); }));
  if (page === 'overview' && !LAYOUT_EDIT) ovFocus(tagCards(page, el));
  const cards = tagCards(page, el), L = UI.layout[page] || {order: [], hidden: []};
  document.body.classList.toggle('lay-on', LAYOUT_EDIT);
  el.querySelector('.lay-banner')?.remove();
  if (LAYOUT_EDIT) {
    const b = document.createElement('div'); b.className = 'lay-banner';
    b.innerHTML = `${icon('layout')}<span><b>Customizing this page on ${devKey() === 'phone' ? 'phones' : 'computers'}.</b> Drag the handle to move a card (arrows on a phone), drag its right or bottom edge (or use − / +) to resize it, the eye to hide it. Double-click an edge to reset it. Sizes are saved separately for phone and computer.</span><span style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label class="lay-cmp" title="Tiles pack into any empty space, and you can drop a tile anywhere"><input type="checkbox" id="layFree" ${L.free?.[devKey()] ? 'checked' : ''}> Free placement</label><label class="lay-cmp"><input type="checkbox" id="layCompact" ${isCompact() ? 'checked' : ''}> Compact view</label><button class="btn" id="layReset">Reset page</button><button class="btn primary" id="layDone">Done</button></span>`;
    el.prepend(b);
    $('#layDone').onclick = () => { layLock(page, el); LAYOUT_EDIT = false; layBtnSync(); render(); toast('Layout saved · tiles keep at least these heights'); };
    $('#layReset').onclick = () => { const was = clone(UI.layout[page] || {}); resetPageDev(page); render(); toast('Page layout reset', () => { UI.layout[page] = was; render(); }); };
    $('#layFree').onchange = e => { const lay = pageLayout(page); (lay.free ||= {})[devKey()] = e.target.checked; if (!e.target.checked && lay.pos) delete lay.pos[devKey()]; render(); };
    $('#layCompact').onchange = e => { (UI.compact ||= {})[devKey()] = e.target.checked; applyCompact(); render(); };
  }
  const dk = devKey(), SZ = L.size?.[dk] || {}, TL = L.tall?.[dk] || {}, FREE = !!L.free?.[dk], POS = L.pos?.[dk] || {};
  const grids = [...new Set(cards.map(c => c.el.parentElement))]; grids.forEach(g => g.classList.toggle('free', FREE));
  // effective order: the saved order, with any card it doesn't know yet (new or renamed) slotted in after the card before it on the page
  const keys = cards.map(c => c.k), ORD = LGET(L, 'order').filter(k => keys.includes(k));
  if (ORD.length) keys.forEach((k, i) => { if (ORD.includes(k)) return; const prev = keys.slice(0, i).reverse().find(x => ORD.includes(x)); ORD.splice(prev ? ORD.indexOf(prev) + 1 : 0, 0, k); });
  cards.forEach((c, i) => {
    const oi = ORD.indexOf(c.k); c.el.style.order = oi < 0 ? 1000 + i : oi;
    c.el.style.gridColumn = SZ[c.k] ? `span ${SZ[c.k]}` : ''; c.el.style.gridRow = ''; delete c.el.dataset.pin;
    const fr = FREE_ROWS['p-' + page + '|' + c.k]; if (FREE && fr) c.el.style.gridRow = `span ${fr}`;   // last known height until it's re-measured
    if (FREE && POS[c.k]) { const n = spanOf(c.el), col = Math.max(1, Math.min(13 - n, POS[c.k].c)); c.el.style.gridColumn = `${col} / span ${n}`; c.el.dataset.pin = POS[c.k].r; if (fr) c.el.style.gridRow = `${POS[c.k].r} / span ${fr}`; }
    c.el.dataset.extra = TL[c.k] || ''; c.el.style.height = ''; c.el.style.minHeight = ''; c.el.classList.remove('lay-tall-scroll');
    c.el.style.alignSelf = TL[c.k] ? 'start' : '';   // a card with its own height doesn't stretch to its row
    const LKH = !LAYOUT_EDIT && L.lock?.[dk]?.[c.k]; c.el.classList.toggle('lay-locked', !!LKH);
    // v77: a locked tile keeps AT LEAST its saved height (nothing below it jumps up), but grows when its content needs more — it never clips
    if (LKH) { c.el.style.minHeight = LKH + 'px'; c.el.style.alignSelf = 'start'; }
    if (!LAYOUT_EDIT) fitMinWidth(c.el, FREE);
    const hid = LGET(L, 'hidden').includes(c.k);
    c.el.classList.toggle('lay-hidden', hid && LAYOUT_EDIT);
    c.el.style.display = hid && !LAYOUT_EDIT ? 'none' : '';
    c.el.querySelector(':scope > .lay-ctl')?.remove();
    if (!LAYOUT_EDIT) { c.el.removeAttribute('draggable'); return; }
    const ctl = document.createElement('div'); ctl.className = 'lay-ctl';
    ctl.innerHTML = `<button class="grip" title="Drag to move">${icon('grip')}</button><button data-mv="-1" title="Move earlier">${icon('up')}</button><button data-mv="1" title="Move later">${icon('down')}</button><button data-sz="-1" title="Smaller" class="sz">−</button><span class="sz-l">${SIZE_NAME(spanOf(c.el))}</span><button data-sz="1" title="Larger" class="sz">+</button><button data-hd title="${hid ? 'Show' : 'Hide'}">${icon(hid ? 'eyeOff' : 'eye')}</button>`;
    c.el.appendChild(ctl);
    // drag the right edge to resize: snaps to the 12-column grid (whole steps on a phone)
    c.el.querySelector(':scope > .lay-rs')?.remove();
    const rs = document.createElement('div'); rs.className = 'lay-rs'; rs.title = 'Drag to resize'; c.el.appendChild(rs);
    rs.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); rs.setPointerCapture(e.pointerId);
      const grid = c.el.parentElement, gcs = getComputedStyle(grid), gap = parseFloat(gcs.columnGap) || 0, colW = (grid.clientWidth - gap * 11) / 12, left = c.el.getBoundingClientRect().left;
      const list = SIZES[dk], snap = n => list.reduce((b, x) => Math.abs(x - n) < Math.abs(b - n) ? x : b, list[0]);
      let n = spanOf(c.el); const tag = c.el.querySelector('.lay-ctl .sz-l'); c.el.classList.add('lay-sizing'); document.body.classList.add('lay-dragging');
      rs.onpointermove = ev => { const w = ev.clientX - left; n = snap(Math.max(1, Math.min(12, Math.round((w + gap) / (colW + gap))))); c.el.style.gridColumn = c.el.dataset.pin && POS[c.k] ? `${Math.max(1, Math.min(13 - n, POS[c.k].c))} / span ${n}` : `span ${n}`; freeRows(c.el); if (tag) tag.textContent = SIZE_NAME(n); };
      rs.onpointerup = rs.onpointercancel = () => { rs.onpointermove = rs.onpointerup = rs.onpointercancel = null; c.el.classList.remove('lay-sizing'); document.body.classList.remove('lay-dragging');
        const lay = pageLayout(page); ((lay.size ||= {})[dk] ||= {})[c.k] = n; render(); }; };
    rs.ondblclick = () => { const lay = pageLayout(page); if (lay.size?.[dk]) delete lay.size[dk][c.k]; render(); };
    // drag the bottom edge to make it taller or shorter: charts stretch, lists and tables get room (or scroll)
    c.el.querySelector(':scope > .lay-rh')?.remove();
    const rh = document.createElement('div'); rh.className = 'lay-rh'; rh.title = 'Drag to change the height · double-click to reset'; c.el.appendChild(rh);
    rh.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); rh.setPointerCapture(e.pointerId);
      // measure the card's own height (not stretched to its row) so what you see while dragging is what you get
      c.el.style.alignSelf = 'start'; const r0 = c.el.getBoundingClientRect(), h0 = r0.height, e0 = +(c.el.dataset.extra || 0), base = h0 - e0, y0 = e.clientY;
      // snap targets: every 8px, plus the bottoms of the cards beside it and its natural height
      // the other cards in this row, at their own (unstretched) heights
      const near = pageCards(el).filter(x => x !== c.el && x.style.display !== 'none' && Math.abs(x.getBoundingClientRect().top - r0.top) < 40).map(x => { const a = x.style.alignSelf; x.style.alignSelf = 'start'; const h = x.getBoundingClientRect().height; x.style.alignSelf = a; return h; });
      const mags = [...near, base]; let ex = e0, tgt = h0; c.el.classList.add('lay-sizing'); document.body.classList.add('lay-dragging');
      const tag = document.createElement('div'); tag.className = 'lay-hl'; c.el.appendChild(tag);
      rh.onpointermove = ev => { let t = Math.max(80, h0 + ev.clientY - y0), m = mags.find(x => Math.abs(x - t) <= 12);
        tgt = m != null ? Math.round(m) : Math.round(t / 8) * 8; ex = Math.round(tgt - base); c.el.style.height = tgt + 'px'; c.el.style.overflow = 'hidden'; freeRows(c.el, tgt);
        tag.textContent = m != null ? (Math.abs(m - base) < 1 ? 'Natural height' : 'Lined up with the next card') : (ex > 0 ? '+' : '') + ex + 'px'; };
      rh.onpointerup = rh.onpointercancel = () => { rh.onpointermove = rh.onpointerup = rh.onpointercancel = null; c.el.classList.remove('lay-sizing'); document.body.classList.remove('lay-dragging'); c.el.style.overflow = ''; tag.remove();
        const lay = pageLayout(page); ((lay.tall ||= {})[dk] ||= {})[c.k] = ex; if (Math.abs(ex) < 4) delete lay.tall[dk][c.k]; render(); }; };
    rh.ondblclick = () => { const lay = pageLayout(page); if (lay.tall?.[dk]) delete lay.tall[dk][c.k]; render(); };
    ctl.onclick = e => e.stopPropagation();
    $$('[data-mv]', ctl).forEach(b => b.onclick = () => moveCard(page, el, c.k, +b.dataset.mv));
    $$('[data-sz]', ctl).forEach(b => b.onclick = () => { const list = SIZES[dk], now = spanOf(c.el);
      const n = +b.dataset.sz > 0 ? (list.find(x => x > now) ?? list[list.length - 1]) : ([...list].reverse().find(x => x < now) ?? list[0]);
      const lay = pageLayout(page); ((lay.size ||= {})[dk] ||= {})[c.k] = n; render(); });
    $('[data-hd]', ctl).onclick = () => { const H = LDK(page, 'hidden'); H.includes(c.k) ? H.splice(H.indexOf(c.k), 1) : H.push(c.k); render(); };
    const grip = $('.grip', ctl);
    if (FREE) { grip.title = 'Drag anywhere · double-click to un-pin'; grip.onpointerdown = e => freeDrag(e, page, el, c, dk); grip.ondblclick = () => { const lay = pageLayout(page); if (lay.pos?.[dk]) delete lay.pos[dk][c.k]; render(); }; }
    else grip.onmousedown = grip.ontouchstart = () => c.el.setAttribute('draggable', 'true');
    c.el.ondragstart = e => { e.dataTransfer.setData('text/plain', c.k); e.dataTransfer.effectAllowed = 'move'; };
    c.el.ondragend = () => c.el.removeAttribute('draggable');
    c.el.ondragover = e => { e.preventDefault(); c.el.classList.add('lay-drop'); };
    c.el.ondragleave = () => c.el.classList.remove('lay-drop');
    c.el.ondrop = e => { e.preventDefault(); c.el.classList.remove('lay-drop'); const from = e.dataTransfer.getData('text/plain'); if (!from || from === c.k) return;
      const r = c.el.getBoundingClientRect(), after = (e.clientY - r.top) > r.height / 2 || (e.clientX - r.left) > r.width * .66;
      const list = visualOrder(el).filter(k => k !== from), at = list.indexOf(c.k) + (after ? 1 : 0); list.splice(at, 0, from); setOrder(page, list); render(); };
  });
}
const visualOrder = el => pageCards(el).map((c, i) => ({k: c.dataset.cid, o: +c.style.order || i, i})).sort((a, b) => a.o - b.o || a.i - b.i).map(x => x.k);
function moveCard(page, el, k, dir) {
  const list = visualOrder(el), card = pageCards(el).find(c => c.dataset.cid === k), sibs = pageCards(el).filter(c => c.parentElement === card.parentElement).map(c => c.dataset.cid);
  const mine = list.filter(x => sibs.includes(x)), i = mine.indexOf(k), j = i + dir; if (j < 0 || j >= mine.length) return;
  const a = list.indexOf(mine[i]), b = list.indexOf(mine[j]); [list[a], list[b]] = [list[b], list[a]];
  setOrder(page, list); render();
}
function layBtnSync() { const b = $('#layoutBtn'); if (!b) return; b.classList.toggle('active-f', LAYOUT_EDIT); b.style.display = cur === 'admin' ? 'none' : ''; }

/* ---------------- ADMIN page ---------------- */
const ADM = {people: null, loading: false, err: null, scan: null};
async function loadPeople() {
  ADM.loading = true;
  const {data, error} = await sb.schema('finance').rpc('household_people', {p_household: CTX.HH});
  ADM.loading = false; ADM.people = data || []; ADM.err = error ? error.message : null;
  if (cur === 'admin') render();
}
function scanPages() {   // render each page off-screen once to list its cards, then clear it again
  const out = {}, saveCH = CH, keep = render.keep;
  PAGES.filter(p => p.k !== 'admin').forEach(p => {
    const sec = $('#p-' + p.k);
    try { CH = []; p.r(sec); out[p.k] = tagCards(p.k, sec).map(({k, t}) => ({k, t})); }
    catch (e) { console.warn('[layout scan]', p.k, e); out[p.k] = []; }
    finally { sec.innerHTML = ''; }
  });
  CH = saveCH; render.keep = keep; closeAll();
  return out;
}
/* Admin: every card folds to its header · open/closed is remembered per person (UI.admOpen) · first visit: only People is open */
function admCollapse(pg) {
  const cards = [...pg.querySelectorAll(':scope > .grid > .card')]; if (!cards.length) return;
  const keyOf = c => normKey(c.querySelector('.card-h h3')?.textContent || cardTitle(c));
  if (!Array.isArray(UI.admOpen)) UI.admOpen = [keyOf(cards[0])];
  const open = new Set(UI.admOpen), save = () => { UI.admOpen = [...open]; SYNC.schedule(); };
  const bar = document.createElement('div'); bar.className = 'toolbar adm-bar';
  bar.innerHTML = `<span class="muted" style="font-size:var(--fs-sm)">${cards.length} sections · click a header to open or close it</span><div style="margin-left:auto;display:flex;gap:8px"><button class="btn sm" data-admall="1">Expand all</button><button class="btn sm" data-admall="0">Collapse all</button></div>`;
  pg.prepend(bar);
  cards.forEach(c => { const k = keyOf(c), h = c.querySelector('.card-h'); if (!h) return;
    c.classList.add('adm-fold'); c.classList.toggle('folded', !open.has(k));
    const chev = document.createElement('button'); chev.className = 'adm-chev'; chev.setAttribute('aria-label', 'Open or close'); chev.innerHTML = icon('chev', 2.4); h.prepend(chev);
    h.onclick = e => { if (e.target.closest('button:not(.adm-chev),input,select,textarea,a,label')) return; open.has(k) ? open.delete(k) : open.add(k); c.classList.toggle('folded', !open.has(k)); save(); }; });
  $$('[data-admall]', bar).forEach(b => b.onclick = () => { cards.forEach(c => { const k = keyOf(c); b.dataset.admall === '1' ? open.add(k) : open.delete(k); c.classList.toggle('folded', b.dataset.admall !== '1'); }); save(); });
}
function renderAdmin(pg) {
  if (!ADM.people && !ADM.loading) loadPeople();
  if (!ADM.scan) ADM.scan = scanPages();
  const fmtWhen = d => d ? new Date(d).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) : 'never';
  const roleSel = p => `<select class="in sel adm-role" data-role="${p.user_id}" ${!IS_OWNER ? 'disabled' : ''}>${['owner', 'editor', 'viewer'].map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${{owner: 'Owner · admin', editor: 'Editor', viewer: 'Viewer'}[r]}</option>`).join('')}</select>`;
  const D = UI.density, preset = DENSITY.find(x => x.py === D.py && x.fs === D.fs)?.k;
  pg.innerHTML = `<div class="grid g-12">
    <div class="card c-7"><div class="card-h"><div><h3>People & permissions</h3><div class="sub">${esc(CTX.household.name)} household · owners manage people and household defaults, editors change data, viewers can only look</div></div>
      ${IS_OWNER ? `<div class="right"><button class="btn primary" id="admAdd">${icon('plus')}<span>Add person</span></button></div>` : ''}</div>
      ${ADM.err ? `<div class="banner">${icon('warn')}<span>${esc(ADM.err)}${/household_people/.test(ADM.err) ? ' — run migration 20261017001100_finance_admin.sql.' : ''}</span></div>` : ''}
      <div class="list adm-list">${ADM.people == null ? '<p class="muted">Loading…</p>' : ADM.people.map(p => `<div class="li">
        <div class="avatar adm-av">${esc((p.display_name || p.email || '?').trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?')}</div>
        <div style="min-width:0;flex:1"><div class="nm ell">${esc(p.display_name || p.email)}${p.is_me ? ' <span class="chip">You</span>' : ''}</div><div class="ds ell">${esc(p.email)} · last sign-in ${fmtWhen(p.last_sign_in_at)}</div></div>
        ${roleSel(p)}
        ${IS_OWNER ? `<button class="mini-btn" title="Set password" data-pw="${p.user_id}">${icon('edit')}</button><button class="mini-btn" title="Remove from household" data-rm="${p.user_id}">${icon('trash')}</button>` : ''}</div>`).join('')}</div>
      <p class="muted" style="font-size:var(--fs-xs);margin-top:10px">Removing someone takes away their access to this household; their login stays in Supabase Auth until you delete it there.</p></div>

    <div class="card c-5"><div class="card-h"><div><h3>Table density</h3><div class="sub">Row padding and text size for every table · saved to your profile</div></div></div>
      <div class="seg" id="densSeg">${DENSITY.map(d => `<button data-d="${d.k}" class="${preset === d.k ? 'on' : ''}">${d.l}</button>`).join('')}${preset ? '' : '<button class="on">Custom</button>'}</div>
      <div class="ctrl" style="margin-top:16px"><div><label>Row padding<b id="dPyV">${D.py}px</b></label><input type="range" id="dPy" min="1" max="16" step="1" value="${D.py}"></div>
        <div><label>Text size<b id="dFsV">${D.fs}px</b></label><input type="range" id="dFs" min="11" max="16" step=".5" value="${D.fs}"></div></div>
      <div class="dens-prev"><table class="table"><tr><th>Preview</th><th>Budget</th><th>Actual</th></tr><tr><td>Groceries</td><td class="muted">−$1,500</td><td>−$1,392</td></tr><tr><td>Eating Out</td><td class="muted">−$917</td><td>−$1,140</td></tr><tr class="tot"><td>Total</td><td class="muted">−$2,417</td><td>−$2,532</td></tr></table></div>
      ${IS_OWNER ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn" id="hhDef">Save my display & layout as household default</button></div>` : ''}
      ${CTX.household.settings?.ui ? `<button class="link" id="useDef" style="margin-top:10px">Use the household default</button>` : ''}</div>

    ${simpleViewCard()}
    <div class="card c-12"><div class="card-h"><div><h3>Phone bottom bar</h3><div class="sub">How far the tab bar sits above the bottom edge of the screen · Auto follows the phone's safe area (home indicator)</div></div>
      <div class="right"><button class="btn ${UI.mobile?.tabBottom == null ? 'active-f' : ''}" id="tbAuto">Auto</button></div></div>
      <div class="ctrl"><div><label>Distance from the bottom<b id="tbV">${UI.mobile?.tabBottom == null ? 'Auto' : UI.mobile.tabBottom + 'px'}</b></label><input type="range" id="tbR" min="0" max="60" step="1" value="${UI.mobile?.tabBottom ?? 24}"></div></div>
      <p class="muted" style="font-size:var(--fs-xs);margin-top:6px">Applies on phones (the bar is hidden on wide screens). Try 4–10px if the bar floats too high when opened from the Home Screen.</p></div>

    <div class="card c-12"><div class="card-h"><div><h3>Page layout · ${devKey() === 'phone' ? 'this phone' : 'computers'}</h3><div class="sub">Show, hide and order the cards on each page · phones and computers each keep their own · or open a page and press <b>Layout</b> to drag cards around</div></div>
      <div class="right"><button class="btn" id="layResetAll">Reset all pages</button></div></div>
      <div class="adm-pages">${PAGES.filter(p => p.k !== 'admin').map(p => { const L = UI.layout[p.k] || {order: [], hidden: []}, LO = LGET(L, 'order'), LH = LGET(L, 'hidden'); const cards = (ADM.scan[p.k] || []).map((c, i) => ({...c, o: LO.indexOf(c.k) < 0 ? 1000 + i : LO.indexOf(c.k)})).sort((a, b) => a.o - b.o);
        return `<div class="adm-page"><h4>${icon(p.i)}${esc(p.n)}<span class="muted" style="margin-left:auto;font-weight:500;font-size:var(--fs-xs)">${LH.length ? LH.length + ' hidden' : ''}</span></h4>
          ${cards.map((c, i) => `<div class="adm-card ${LH.includes(c.k) ? 'off' : ''}"><span title="${esc(c.t)}">${esc(c.t)}</span><button class="mini-btn" data-pmv="${p.k}|${c.k}|-1" ${i ? '' : 'disabled style="opacity:.3"'}>${icon('up')}</button><button class="mini-btn" data-pmv="${p.k}|${c.k}|1" ${i < cards.length - 1 ? '' : 'disabled style="opacity:.3"'}>${icon('down')}</button><button class="mini-btn" data-phd="${p.k}|${c.k}" title="${LH.includes(c.k) ? 'Show' : 'Hide'}">${icon(L.hidden.includes(c.k) ? 'eyeOff' : 'eye')}</button></div>`).join('') || '<p class="muted" style="font-size:12px">No cards</p>'}
          <div style="display:flex;gap:10px;margin-top:8px"><button class="link" data-pgo="${p.k}">Customize on page →</button>${UI.layout[p.k] ? `<button class="link" data-prs="${p.k}" style="margin-left:auto">Reset</button>` : ''}</div></div>`; }).join('')}</div>
      <p class="muted" style="font-size:var(--fs-xs);margin-top:10px">Cards that change with the page's selection (for example, the selected loan's detail) are listed under the name they had when this page last loaded.</p></div>
    ${typeof digestAdminCard === 'function' ? digestAdminCard() : ''}
    ${automationCard()}
  </div>`;
  // people
  $$('[data-role]', pg).forEach(s => s.onchange = async () => { const p = ADM.people.find(x => x.user_id === s.dataset.role), was = p.role;
    if (p.is_me && was === 'owner' && s.value !== 'owner' && !confirmInline(s, 'You will lose admin access.')) { s.value = was; return; }
    const {error} = await sb.schema('finance').from('household_members').update({role: s.value}).eq('household_id', CTX.HH).eq('user_id', p.user_id);
    if (error) { s.value = was; return toast('Couldn’t change role: ' + error.message); }
    p.role = s.value; toast(`${p.display_name || p.email} is now ${s.value === 'owner' ? 'an owner' : 'an ' + s.value}`); if (p.is_me) setTimeout(() => location.reload(), 900); });
  $$('[data-rm]', pg).forEach(b => b.onclick = () => openRemove(ADM.people.find(x => x.user_id === b.dataset.rm)));
  $$('[data-pw]', pg).forEach(b => b.onclick = () => openSetPassword(ADM.people.find(x => x.user_id === b.dataset.pw)));
  if ($('#admAdd')) $('#admAdd').onclick = openAddPerson;
  // density
  const setD = (py, fs) => { UI.density = {py, fs}; applyDensity(); $('#dPyV').textContent = py + 'px'; $('#dFsV').textContent = fs + 'px'; SYNC.schedule(); };
  wireTabsCard();
  $$('#densSeg button[data-d]').forEach(b => b.onclick = () => { const d = DENSITY.find(x => x.k === b.dataset.d); setD(d.py, d.fs); render(); });
  $('#dPy').oninput = e => setD(+e.target.value, UI.density.fs); $('#dFs').oninput = e => setD(UI.density.py, +e.target.value);
  $('#dPy').onchange = $('#dFs').onchange = () => render();
  if ($('#hhDef')) $('#hhDef').onclick = async () => { const settings = {...(CTX.household.settings || {}), ui: {density: UI.density, layout: UI.layout}};
    const {error} = await sb.schema('finance').from('households').update({settings}).eq('id', CTX.HH);
    if (error) return toast('Couldn’t save: ' + error.message); CTX.household.settings = settings; render(); toast('Saved as the household default for everyone without their own layout'); };
  wireAutomation();
  if (typeof wireDigestAdmin === 'function') wireDigestAdmin(pg);
  if ($('#useDef')) $('#useDef').onclick = () => { const d = clone(CTX.household.settings.ui); UI.density = {...UI_DEFAULT.density, ...d.density}; UI.layout = d.layout || {}; applyDensity(); render(); toast('Using the household default'); };
  // phone bar
  $('#tbR').oninput = e => { (UI.mobile ||= {}).tabBottom = +e.target.value; $('#tbV').textContent = e.target.value + 'px'; applyDensity(); SYNC.schedule(); };
  $('#tbR').onchange = () => render();
  $('#tbAuto').onclick = () => { (UI.mobile ||= {}).tabBottom = null; applyDensity(); render(); };
  // layout
  $$('[data-phd]', pg).forEach(b => b.onclick = () => { const [pk, k] = b.dataset.phd.split('|'), H = LDK(pk, 'hidden'); H.includes(k) ? H.splice(H.indexOf(k), 1) : H.push(k); render(); });
  $$('[data-pmv]', pg).forEach(b => b.onclick = () => { const [pk, k, d] = b.dataset.pmv.split('|'); const LO = LGET(pageLayout(pk), 'order'), all = ADM.scan[pk].map((c, i) => ({k: c.k, o: LO.indexOf(c.k) < 0 ? 1000 + i : LO.indexOf(c.k)})).sort((a, b) => a.o - b.o).map(c => c.k);
    const i = all.indexOf(k), j = i + +d; if (j < 0 || j >= all.length) return; [all[i], all[j]] = [all[j], all[i]]; setOrder(pk, all); render(); });
  $$('[data-pgo]', pg).forEach(b => b.onclick = () => { LAYOUT_EDIT = true; go(b.dataset.pgo); layBtnSync(); });
  $$('[data-prs]', pg).forEach(b => b.onclick = () => { resetPageDev(b.dataset.prs); render(); });
  $('#layResetAll').onclick = () => { const was = clone(UI.layout); Object.keys(UI.layout).forEach(resetPageDev); render(); toast(`All page layouts reset on ${devKey() === 'phone' ? 'this phone' : 'computers'}`, () => { UI.layout = was; render(); }); };
  admCollapse(pg);
}
const confirmInline = (el, msg) => window.confirm(msg + ' Continue?');
function openRemove(p) {
  const m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Remove ${esc(p.display_name || p.email)}?</h2><p class="muted" style="font-size:12.5px">They lose access to this household right away. Their login isn't deleted.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="rmGo" style="background:var(--neg);border-color:var(--neg-ink)">Remove</button></div>`;
  openLayer('modal');
  $('#rmGo').onclick = async () => { const {error} = await sb.schema('finance').from('household_members').delete().eq('household_id', CTX.HH).eq('user_id', p.user_id);
    if (error) return toast('Couldn’t remove: ' + error.message); ADM.people = ADM.people.filter(x => x !== p); closeAll(); render(); toast(`Removed ${p.email}`); if (p.is_me) setTimeout(() => location.reload(), 900); };
}
async function adminCall(body) {
  const {data, error} = await sb.functions.invoke('admin-users', {body: {household_id: CTX.HH, redirect_to: location.origin + location.pathname, ...body}});
  if (error) { let msg = error.message; try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) {} const status = error.context?.status, missing = status === 404 || /FunctionsFetchError|FunctionsRelayError/.test(error.name || ''); throw Object.assign(new Error(msg), {missing}); }
  return data;
}
function openAddPerson() {
  const m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Add person</h2><p class="muted" style="font-size:12.5px">Set a password to create the login now, or leave it blank to email an invite.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="form">
    <div style="grid-column:1/-1"><label>Email</label><input class="in" id="apE" type="email" placeholder="name@example.com" autocomplete="off"></div>
    <div><label>Name <span class="muted">(optional)</span></label><input class="in" id="apN" placeholder="e.g. Jessie"></div>
    <div><label>Permission</label><select class="in" id="apR"><option value="editor">Editor · can change data</option><option value="viewer">Viewer · browse, switch months, own layout</option><option value="owner">Owner · full admin</option></select></div>
    <div style="grid-column:1/-1"><label>Temporary password <span class="muted">(8+ characters · blank = send invite email)</span></label><input class="in" id="apP" type="text" autocomplete="new-password" placeholder="Leave blank to invite"></div>
  </div>
  <div class="hint" id="apMsg" style="display:none"></div>
  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="apGo">Add person</button></div>`;
  openLayer('modal'); setTimeout(() => $('#apE').focus(), 50);
  $('#apGo').onclick = async () => {
    const email = $('#apE').value.trim(), role = $('#apR').value, display_name = $('#apN').value.trim(), password = $('#apP').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return $('#apE').focus();
    if (password && password.length < 8) return toast('Password must be at least 8 characters');
    const btn = $('#apGo'); btn.disabled = true; btn.textContent = 'Adding…';
    try {
      const r = await adminCall({action: 'create', email, role, display_name, password: password || undefined});
      closeAll(); await loadPeople();
      toast(r.how === 'invited' ? `Invite sent to ${email}` : r.how === 'created' ? `Created ${email} · share the temporary password` : `${email} added to the household`);
    } catch (e) {
      if (e.missing) {   // Edge Function not deployed: still works for people who already have a login
        const {error} = await sb.schema('finance').rpc('add_member_by_email', {p_household: CTX.HH, p_email: email, p_role: role, p_display_name: display_name || null});
        if (!error) { closeAll(); await loadPeople(); return toast(`${email} added to the household`); }
        $('#apMsg').style.display = ''; $('#apMsg').innerHTML = `${icon('info')}<span>To create new logins from here, deploy the <b>admin-users</b> Edge Function (see README). Until then, create the login under Supabase → Authentication → Users and add it here by email. <span class="muted">(${esc(error.message)})</span></span>`;
      } else toast('Couldn’t add: ' + e.message);
      btn.disabled = false; btn.textContent = 'Add person';
    }
  };
}
function openSetPassword(p) {
  const m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Set password · ${esc(p.display_name || p.email)}</h2><p class="muted" style="font-size:12.5px">They can sign in with it right away. Share it privately.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="form one"><div><label>New password (8+ characters)</label><input class="in" id="spP" type="text" autocomplete="new-password"></div></div>
  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="spGo">Set password</button></div>`;
  openLayer('modal'); setTimeout(() => $('#spP').focus(), 50);
  $('#spGo').onclick = async () => { const pw = $('#spP').value; if (pw.length < 8) return toast('At least 8 characters');
    try { await adminCall({action: 'set_password', user_id: p.user_id, password: pw}); closeAll(); toast('Password updated'); }
    catch (e) { toast(e.missing ? 'Deploy the admin-users Edge Function to set passwords from here' : 'Couldn’t update: ' + e.message); } };
}

const spanOf = el => { const m = getComputedStyle(el).gridColumnEnd.match(/span (\d+)/) || getComputedStyle(el).gridColumnStart.match(/span (\d+)/); return m ? +m[1] : 12; };
applyCompact();

/* cards without charts: after the page draws, apply the extra height (taller = more room, shorter = scrolls) */
/* free placement: the grid runs in 8px rows; each tile spans as many rows as it is tall, so short tiles leave no gaps,
   later tiles fill any hole (dense), and a pinned tile sits exactly where you dropped it */
const FREE_ROW = 8, FREE_ROWS = {};
// one tile's row span from its current (or given) height — used live while resizing so the page reflows as you drag
function freeRows(card, h) { const g = card.parentElement; if (!g?.classList.contains('free')) return;
  const gap = parseFloat(getComputedStyle(g).columnGap) || 0; if (h == null) h = card.getBoundingClientRect().height;
  card.dataset.rows = Math.max(1, Math.ceil((h + gap) / FREE_ROW)); freeLayout(g); }
/* Every tile in a free grid has a saved spot (column, row). Tiles keep their column and order no matter what happens
   to their contents; when one grows, only the tiles directly below it are pushed down (and come back up when it shrinks).
   A tile without a saved spot (first time, or a new tile) gets the first open space and is saved there. */
// where saved tiles end up: top to bottom by saved row, each keeps its column and is pushed down only by tiles placed before it
function planFree(boxes, P) { const placed = [], out = {};
  const floor = (col, w) => Math.max(1, ...placed.filter(p => col < p.col + p.w && p.col < col + w).map(p => p.row + p.h));
  boxes.filter(b => P[b.k]).sort((a, b) => P[a.k].r - P[b.k].r || P[a.k].c - P[b.k].c).forEach(b => { const col = Math.max(1, Math.min(13 - b.w, P[b.k].c)), row = Math.max(P[b.k].r, floor(col, b.w)); placed.push({...b, col, row}); out[b.k] = {col, row}; });
  return {out, floor, placed}; }
function freeLayout(g) {
  const sec = g.closest('.page'), page = sec?.id.slice(2); if (!page) return;
  { const gap = parseFloat(getComputedStyle(g).columnGap) || 0; g.style.setProperty('--fgap', gap + 'px'); g.style.setProperty('--fcw', ((g.clientWidth - gap * 11) / 12) + 'px'); }   // for the Layout grid guide
  const dk = devKey(), lay = pageLayout(page), P = ((lay.pos ||= {})[dk] ||= {});
  // every tile in the grid takes part; ones the layout doesn't track (e.g. the loan picker cards) are placed in open space each time but not saved
  const cards = [...g.children].filter(c => c.classList.contains('card') && c.style.display !== 'none');
  const box = (c, i) => ({c, k: c.dataset.cid || '~' + i, w: Math.min(12, spanOf(c)), h: +c.dataset.rows || 1});
  const put = (b, col, row) => { b.c.style.gridColumn = `${col} / span ${b.w}`; b.c.style.gridRow = `${row} / span ${b.h}`; b.c.dataset.pin = row; };
  // 1) saved tiles, top to bottom: keep the column, push down only if something above now overlaps
  const all = cards.map(box), plan = planFree(all, P), placed = plan.placed, floor = plan.floor;
  all.filter(b => P[b.k]).forEach(b => put(b, plan.out[b.k].col, plan.out[b.k].row));
  // 2) new tiles: first open spot (lowest row, then leftmost), then remember it
  let added = false;
  all.filter(b => !P[b.k]).sort((a, b) => (+a.c.style.order || 0) - (+b.c.style.order || 0)).forEach(b => { let best = null;
    for (let col = 1; col <= 13 - b.w; col++) { const row = floor(col, b.w); if (!best || row < best.row) best = {col, row}; }
    put(b, best.col, best.row); placed.push({...b, col: best.col, row: best.row}); if (b.k[0] !== '~') { P[b.k] = {c: best.col, r: best.row}; added = true; } });
  if (added && typeof SYNC !== 'undefined') SYNC.schedule();
}
function packFree(el) {
  [...el.querySelectorAll('.grid.free')].forEach(g => { const gap = parseFloat(getComputedStyle(g).columnGap) || 0;
    [...g.children].filter(c => c.classList.contains('card')).forEach(c => { const n = Math.max(1, Math.ceil((c.getBoundingClientRect().height + gap) / FREE_ROW)); c.dataset.rows = n; FREE_ROWS[el.id + '|' + c.dataset.cid] = n; });
    freeLayout(g); });
}
function freeDrag(e, page, el, c, dk) {
  e.preventDefault(); e.stopPropagation();
  const g = c.el.parentElement, gr = g.getBoundingClientRect(), gap = parseFloat(getComputedStyle(g).columnGap) || 0, colW = (g.clientWidth - gap * 11) / 12, n = spanOf(c.el);
  const r0 = c.el.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, sy0 = scrollY;
  // positions in page coordinates, so scrolling while dragging never shifts anything
  const cardX0 = r0.left - gr.left, cardY0 = r0.top - gr.top;   // card's spot inside the grid at the start
  const ghost = document.createElement('div'); ghost.className = 'free-ghost'; g.appendChild(ghost);
  c.el.classList.add('free-moving'); document.body.classList.add('lay-dragging');
  let col = 1, row = 1, wantRow = 1, last = e, raf = 0;
  const boxes = [...g.children].filter(x => x.classList.contains('card') && x.style.display !== 'none' && x.dataset.cid).map(x => ({k: x.dataset.cid, w: Math.min(12, spanOf(x)), h: +x.dataset.rows || 1}));
  const place = () => { const dx = last.clientX - x0, dy = last.clientY - y0 + (scrollY - sy0);
    col = Math.max(1, Math.min(13 - n, Math.round((cardX0 + dx) / (colW + gap)) + 1)); row = Math.max(1, Math.round((cardY0 + dy) / FREE_ROW) + 1);
    const gx = (col - 1) * (colW + gap), want = row; wantRow = want;
    // the tile snaps to the grid under the pointer
    c.el.style.transform = `translate(${gx - cardX0}px,${(want - 1) * FREE_ROW - cardY0}px)`;
    // where it will really land: a tile that starts above it in the same columns pushes it down (same rule as the layout) — the outline shows that spot
    { const P2 = {...(pageLayout(page).pos?.[dk] || {}), [c.k]: {c: col, r: want}}; row = planFree(boxes, P2).out[c.k]?.row ?? want; }
    const gy = (row - 1) * FREE_ROW; ghost.classList.toggle('pushed', row !== want);
    Object.assign(ghost.style, {left: gx + 'px', top: gy + 'px', width: n * colW + (n - 1) * gap + 'px', height: c.el.offsetHeight + 'px'}); };
  // keep scrolling while the pointer rests near the top or bottom edge
  const edge = () => { raf = 0; const vv = window.visualViewport, vTop = vv ? vv.offsetTop : 0, vBot = vv ? vv.offsetTop + vv.height : innerHeight;
    const dy = last.clientY > vBot - 60 ? 12 : last.clientY < vTop + 50 && scrollY > 0 ? -12 : 0;
    if (dy) { scrollBy(0, dy); place(); raf = requestAnimationFrame(edge); } };
  const move = ev => { ev.preventDefault(); last = ev; place(); if (!raf) raf = requestAnimationFrame(edge); };
  const onScroll = () => place();
  place();
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('scroll', onScroll);
    cancelAnimationFrame(raf); document.body.classList.remove('lay-dragging'); ghost.remove(); c.el.classList.remove('free-moving'); c.el.style.transform = '';
    const lay = pageLayout(page), P = ((lay.pos ||= {})[dk] ||= {});
    P[c.k] = {c: col, r: wantRow}; render(); };   // save the spot you pointed at; the layout pushes it down exactly as the outline showed
  addEventListener('pointermove', move, {passive: false}); addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('scroll', onScroll, {passive: true});
}
function fitTallCards(el) {
  pageCards(el).forEach(c => { const ex = +(c.dataset.extra || 0); if (!ex || c.querySelector('.chart') || c.classList.contains('lay-locked')) return;
    c.style.alignSelf = 'start'; const nat = c.getBoundingClientRect().height;   // stays 'start': its height is its own, not its row's
    if (ex > 0) c.style.minHeight = (nat + ex) + 'px'; else { c.style.height = Math.max(90, nat + ex) + 'px'; c.classList.add('lay-tall-scroll'); } });
  packFree(el);
}

/* v94 · Admin → Simple view (replaces the old Tabs card: the menu is now six fixed sections) */
function simpleViewCard() {
  return `<div class="card c-12" id="simpleCard"><div class="card-h"><div><h3>Simple view</h3><div class="sub">Just Home, On track, Goals and This week · for you only, on every device · viewers start in Simple view</div></div>
    <div class="right"><button class="btn ${isSimple() ? '' : 'primary'}" onclick="setSimple(!isSimple())">${isSimple() ? 'Show the full app' : 'Switch to Simple view'}</button></div></div>
    <p class="muted" style="font-size:var(--fs-sm)">Anyone can switch from the avatar menu (top right). To set it up for someone else, add them as a <b>Viewer</b> in People & permissions — they’ll open in Simple view.</p></div>`;
}
/* ---------------- Admin → Tabs: show / hide, reorder, section, phone bar (v94: no longer shown) ---------------- */
function tabsCard() {
  const T = TABSET(), bar = barKeys();
  const row = (p, list, i) => { const hid = tabHidden(p.k), lock = p.k === 'admin';
    return `<div class="tb-row ${hid ? 'off' : ''}" draggable="true" data-tk="${p.k}"><button class="mini-btn tb-grip" title="Drag to reorder">${icon('grip')}</button>
      <span class="tb-ico">${icon(p.i)}</span><span class="tb-n">${esc(p.n)}</span>
      <span class="tb-ctl"><button class="mini-btn" data-tmv="-1" ${i === 0 ? 'disabled' : ''} title="Move up">${icon('up')}</button><button class="mini-btn" data-tmv="1" ${i === list.length - 1 ? 'disabled' : ''} title="Move down">${icon('down')}</button>
      <button class="mini-btn" data-tgrp title="Move to ${tabGroup(p) === 'Analyze' ? 'Manage' : 'Analyze'}">${tabGroup(p) === 'Analyze' ? '↓ Manage' : '↑ Analyze'}</button>
      <label class="tb-bar" title="Show on the phone's bottom bar (up to 4)"><input type="checkbox" data-tbar ${bar.includes(p.k) ? 'checked' : ''} ${hid || lock ? 'disabled' : ''}> Phone bar</label>
      ${lock ? '<span class="chip" title="Admin always stays visible">Always on</span>' : `<button class="btn tb-vis" data-tvis style="height:28px">${icon(hid ? 'eyeOff' : 'eye')}<span>${hid ? 'Hidden' : 'Shown'}</span></button>`}</span></div>`; };
  return `<div class="card c-12" id="tabsCard"><div class="card-h"><div><h3>Tabs · ${devKey() === 'phone' ? 'this phone' : 'computers'}</h3><div class="sub">Show, hide and reorder the pages in the menu · phones and computers each keep their own · drag a row or use the arrows</div></div>
    <div class="right"><button class="btn" id="tbReset">Reset tabs</button></div></div>
    <div class="tb-cols">${['Analyze', 'Manage'].map(g => { const list = navPages(g); return `<div><div class="nav-label" style="margin:0 0 6px">${g}</div><div class="tb-list" data-tg="${g}">${list.map((p, i) => row(p, list, i)).join('') || '<p class="muted">No tabs here.</p>'}</div></div>`; }).join('')}</div>
    <p class="muted" style="font-size:var(--fs-xs);margin-top:8px">A hidden tab is only removed from the menu — its data and settings stay, and you can show it again here. The phone bar holds 4 tabs; the rest are under More.</p></div>`;
}
function wireTabsCard() {
  const card = $('#tabsCard'); if (!card) return; const T = TABSET();
  const save = () => { SYNC.schedule(); buildNav(); render(); };
  const fullOrder = () => ['Analyze', 'Manage'].flatMap(g => navPages(g).map(p => p.k));
  $$('.tb-row', card).forEach(r => { const k = r.dataset.tk, g = tabGroup(PAGES.find(p => p.k === k));
    $$('[data-tmv]', r).forEach(b => b.onclick = () => { const list = navPages(g).map(p => p.k), i = list.indexOf(k), j = i + +b.dataset.tmv; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]];
      T.order = ['Analyze', 'Manage'].flatMap(x => x === g ? list : navPages(x).map(p => p.k)); save(); });
    $('[data-tgrp]', r).onclick = () => { (T.group ||= {})[k] = g === 'Analyze' ? 'Manage' : 'Analyze'; T.order = fullOrder(); save(); };
    const v = $('[data-tvis]', r); if (v) v.onclick = () => { T.hidden ||= []; T.hidden.includes(k) ? T.hidden.splice(T.hidden.indexOf(k), 1) : T.hidden.push(k); if (T.bar) T.bar = T.bar.filter(x => !T.hidden.includes(x)); save(); };
    $('[data-tbar]', r).onchange = e => { let b = barKeys().slice(); if (e.target.checked) { if (b.length >= 4) b = b.slice(0, 3); b.push(k); } else b = b.filter(x => x !== k); T.bar = b; save(); };
    r.ondragstart = e => { e.dataTransfer.setData('text/plain', k); e.dataTransfer.effectAllowed = 'move'; r.classList.add('dragging'); };
    r.ondragend = () => r.classList.remove('dragging');
    r.ondragover = e => { e.preventDefault(); r.classList.add('lay-drop'); }; r.ondragleave = () => r.classList.remove('lay-drop');
    r.ondrop = e => { e.preventDefault(); r.classList.remove('lay-drop'); const from = e.dataTransfer.getData('text/plain'); if (!from || from === k) return;
      const after = e.clientY - r.getBoundingClientRect().top > r.offsetHeight / 2, list = fullOrder().filter(x => x !== from); list.splice(list.indexOf(k) + (after ? 1 : 0), 0, from);
      (T.group ||= {})[from] = g; T.order = list; save(); };
  });
  $('#tbReset').onclick = () => { const was = clone(T); (UI.tabsBy ||= {})[devKey()] = {order: [], hidden: [], group: {}, bar: null}; save(); toast('Tabs reset', () => { UI.tabsBy[devKey()] = was; save(); }); };
}
