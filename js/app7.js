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
  return pageCards(el).map(c => { let k = normKey(cardTitle(c)); seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) k += '-' + seen[k]; c.dataset.cid = k; return {el: c, k, t: cardTitle(c) || 'Untitled card'}; });
}
const pageLayout = page => (UI.layout[page] ||= {order: [], hidden: []});

/* Apply the saved order / visibility after each render (called from render()) */
function applyLayout(page, el) {
  if (page === 'admin') return;
  const cards = tagCards(page, el), L = UI.layout[page] || {order: [], hidden: []};
  document.body.classList.toggle('lay-on', LAYOUT_EDIT);
  el.querySelector('.lay-banner')?.remove();
  if (LAYOUT_EDIT) {
    const b = document.createElement('div'); b.className = 'lay-banner';
    b.innerHTML = `${icon('layout')}<span><b>Customizing this page.</b> Drag the handle to move a card, use the arrows on a phone, and the eye to hide it. Hidden cards stay faded here and disappear when you're done.</span><span style="margin-left:auto;display:flex;gap:8px"><button class="btn" id="layReset">Reset page</button><button class="btn primary" id="layDone">Done</button></span>`;
    el.prepend(b);
    $('#layDone').onclick = () => { LAYOUT_EDIT = false; layBtnSync(); render(); toast('Layout saved'); };
    $('#layReset').onclick = () => { const was = clone(UI.layout[page] || {}); delete UI.layout[page]; render(); toast('Page layout reset', () => { UI.layout[page] = was; render(); }); };
  }
  cards.forEach((c, i) => {
    const oi = L.order.indexOf(c.k); c.el.style.order = oi < 0 ? 1000 + i : oi;
    const hid = L.hidden.includes(c.k);
    c.el.classList.toggle('lay-hidden', hid && LAYOUT_EDIT);
    c.el.style.display = hid && !LAYOUT_EDIT ? 'none' : '';
    c.el.querySelector(':scope > .lay-ctl')?.remove();
    if (!LAYOUT_EDIT) { c.el.removeAttribute('draggable'); return; }
    const ctl = document.createElement('div'); ctl.className = 'lay-ctl';
    ctl.innerHTML = `<button class="grip" title="Drag to move">${icon('grip')}</button><button data-mv="-1" title="Move earlier">${icon('up')}</button><button data-mv="1" title="Move later">${icon('down')}</button><button data-hd title="${hid ? 'Show' : 'Hide'}">${icon(hid ? 'eyeOff' : 'eye')}</button>`;
    c.el.appendChild(ctl);
    ctl.onclick = e => e.stopPropagation();
    $$('[data-mv]', ctl).forEach(b => b.onclick = () => moveCard(page, el, c.k, +b.dataset.mv));
    $('[data-hd]', ctl).onclick = () => { const H = pageLayout(page).hidden; H.includes(c.k) ? H.splice(H.indexOf(c.k), 1) : H.push(c.k); render(); };
    const grip = $('.grip', ctl);
    grip.onmousedown = grip.ontouchstart = () => c.el.setAttribute('draggable', 'true');
    c.el.ondragstart = e => { e.dataTransfer.setData('text/plain', c.k); e.dataTransfer.effectAllowed = 'move'; };
    c.el.ondragend = () => c.el.removeAttribute('draggable');
    c.el.ondragover = e => { e.preventDefault(); c.el.classList.add('lay-drop'); };
    c.el.ondragleave = () => c.el.classList.remove('lay-drop');
    c.el.ondrop = e => { e.preventDefault(); c.el.classList.remove('lay-drop'); const from = e.dataTransfer.getData('text/plain'); if (!from || from === c.k) return;
      const r = c.el.getBoundingClientRect(), after = (e.clientY - r.top) > r.height / 2 || (e.clientX - r.left) > r.width * .66;
      const list = visualOrder(el).filter(k => k !== from), at = list.indexOf(c.k) + (after ? 1 : 0); list.splice(at, 0, from); pageLayout(page).order = list; render(); };
  });
}
const visualOrder = el => pageCards(el).map((c, i) => ({k: c.dataset.cid, o: +c.style.order || i, i})).sort((a, b) => a.o - b.o || a.i - b.i).map(x => x.k);
function moveCard(page, el, k, dir) {
  const list = visualOrder(el), card = pageCards(el).find(c => c.dataset.cid === k), sibs = pageCards(el).filter(c => c.parentElement === card.parentElement).map(c => c.dataset.cid);
  const mine = list.filter(x => sibs.includes(x)), i = mine.indexOf(k), j = i + dir; if (j < 0 || j >= mine.length) return;
  const a = list.indexOf(mine[i]), b = list.indexOf(mine[j]); [list[a], list[b]] = [list[b], list[a]];
  pageLayout(page).order = list; render();
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
        <div class="avatar" style="width:34px;height:34px;font-size:12px;flex:none">${esc((p.display_name || p.email || '?').slice(0, 2).toUpperCase())}</div>
        <div style="min-width:0;flex:1"><div class="nm ell">${esc(p.display_name || p.email)}${p.is_me ? ' <span class="chip">You</span>' : ''}</div><div class="ds ell">${esc(p.email)} · last sign-in ${fmtWhen(p.last_sign_in_at)}</div></div>
        ${roleSel(p)}
        ${IS_OWNER ? `<button class="mini-btn" title="Set password" data-pw="${p.user_id}">${icon('edit')}</button><button class="mini-btn" title="Remove from household" data-rm="${p.user_id}">${icon('trash')}</button>` : ''}</div>`).join('')}</div>
      <p class="muted" style="font-size:11.5px;margin-top:10px">Removing someone takes away their access to this household; their login stays in Supabase Auth until you delete it there.</p></div>

    <div class="card c-5"><div class="card-h"><div><h3>Table density</h3><div class="sub">Row padding and text size for every table · saved to your profile</div></div></div>
      <div class="seg" id="densSeg">${DENSITY.map(d => `<button data-d="${d.k}" class="${preset === d.k ? 'on' : ''}">${d.l}</button>`).join('')}${preset ? '' : '<button class="on">Custom</button>'}</div>
      <div class="ctrl" style="margin-top:16px"><div><label>Row padding<b id="dPyV">${D.py}px</b></label><input type="range" id="dPy" min="1" max="16" step="1" value="${D.py}"></div>
        <div><label>Text size<b id="dFsV">${D.fs}px</b></label><input type="range" id="dFs" min="11" max="16" step=".5" value="${D.fs}"></div></div>
      <div class="dens-prev"><table class="table"><tr><th>Preview</th><th>Budget</th><th>Actual</th></tr><tr><td>Groceries</td><td class="muted">−$1,500</td><td>−$1,392</td></tr><tr><td>Eating Out</td><td class="muted">−$917</td><td>−$1,140</td></tr><tr class="tot"><td>Total</td><td class="muted">−$2,417</td><td>−$2,532</td></tr></table></div>
      ${IS_OWNER ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn" id="hhDef">Save my display & layout as household default</button></div>` : ''}
      ${CTX.household.settings?.ui ? `<button class="link" id="useDef" style="margin-top:10px">Use the household default</button>` : ''}</div>

    <div class="card c-12"><div class="card-h"><div><h3>Phone bottom bar</h3><div class="sub">How far the tab bar sits above the bottom edge of the screen · Auto follows the phone's safe area (home indicator)</div></div>
      <div class="right"><button class="btn ${UI.mobile?.tabBottom == null ? 'active-f' : ''}" id="tbAuto">Auto</button></div></div>
      <div class="ctrl"><div><label>Distance from the bottom<b id="tbV">${UI.mobile?.tabBottom == null ? 'Auto' : UI.mobile.tabBottom + 'px'}</b></label><input type="range" id="tbR" min="0" max="60" step="1" value="${UI.mobile?.tabBottom ?? 24}"></div></div>
      <p class="muted" style="font-size:11.5px;margin-top:6px">Applies on phones (the bar is hidden on wide screens). Try 4–10px if the bar floats too high when opened from the Home Screen.</p></div>

    <div class="card c-12"><div class="card-h"><div><h3>Page layout</h3><div class="sub">Show, hide and order the cards on each page · or open a page and press <b>Layout</b> to drag cards around</div></div>
      <div class="right"><button class="btn" id="layResetAll">Reset all pages</button></div></div>
      <div class="adm-pages">${PAGES.filter(p => p.k !== 'admin').map(p => { const L = UI.layout[p.k] || {order: [], hidden: []}; const cards = (ADM.scan[p.k] || []).map((c, i) => ({...c, o: L.order.indexOf(c.k) < 0 ? 1000 + i : L.order.indexOf(c.k)})).sort((a, b) => a.o - b.o);
        return `<div class="adm-page"><h4>${icon(p.i)}${esc(p.n)}<span class="muted" style="margin-left:auto;font-weight:500;font-size:11.5px">${L.hidden.length ? L.hidden.length + ' hidden' : ''}</span></h4>
          ${cards.map((c, i) => `<div class="adm-card ${L.hidden.includes(c.k) ? 'off' : ''}"><span title="${esc(c.t)}">${esc(c.t)}</span><button class="mini-btn" data-pmv="${p.k}|${c.k}|-1" ${i ? '' : 'disabled style="opacity:.3"'}>${icon('up')}</button><button class="mini-btn" data-pmv="${p.k}|${c.k}|1" ${i < cards.length - 1 ? '' : 'disabled style="opacity:.3"'}>${icon('down')}</button><button class="mini-btn" data-phd="${p.k}|${c.k}" title="${L.hidden.includes(c.k) ? 'Show' : 'Hide'}">${icon(L.hidden.includes(c.k) ? 'eyeOff' : 'eye')}</button></div>`).join('') || '<p class="muted" style="font-size:12px">No cards</p>'}
          <div style="display:flex;gap:10px;margin-top:8px"><button class="link" data-pgo="${p.k}">Customize on page →</button>${UI.layout[p.k] ? `<button class="link" data-prs="${p.k}" style="margin-left:auto">Reset</button>` : ''}</div></div>`; }).join('')}</div>
      <p class="muted" style="font-size:11.5px;margin-top:10px">Cards that change with the page's selection (for example, the selected loan's detail) are listed under the name they had when this page last loaded.</p></div>
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
  $$('#densSeg button[data-d]').forEach(b => b.onclick = () => { const d = DENSITY.find(x => x.k === b.dataset.d); setD(d.py, d.fs); render(); });
  $('#dPy').oninput = e => setD(+e.target.value, UI.density.fs); $('#dFs').oninput = e => setD(UI.density.py, +e.target.value);
  $('#dPy').onchange = $('#dFs').onchange = () => render();
  if ($('#hhDef')) $('#hhDef').onclick = async () => { const settings = {...(CTX.household.settings || {}), ui: {density: UI.density, layout: UI.layout}};
    const {error} = await sb.schema('finance').from('households').update({settings}).eq('id', CTX.HH);
    if (error) return toast('Couldn’t save: ' + error.message); CTX.household.settings = settings; render(); toast('Saved as the household default for everyone without their own layout'); };
  if ($('#useDef')) $('#useDef').onclick = () => { const d = clone(CTX.household.settings.ui); UI.density = {...UI_DEFAULT.density, ...d.density}; UI.layout = d.layout || {}; applyDensity(); render(); toast('Using the household default'); };
  // phone bar
  $('#tbR').oninput = e => { (UI.mobile ||= {}).tabBottom = +e.target.value; $('#tbV').textContent = e.target.value + 'px'; applyDensity(); SYNC.schedule(); };
  $('#tbR').onchange = () => render();
  $('#tbAuto').onclick = () => { (UI.mobile ||= {}).tabBottom = null; applyDensity(); render(); };
  // layout
  $$('[data-phd]', pg).forEach(b => b.onclick = () => { const [pk, k] = b.dataset.phd.split('|'), H = pageLayout(pk).hidden; H.includes(k) ? H.splice(H.indexOf(k), 1) : H.push(k); render(); });
  $$('[data-pmv]', pg).forEach(b => b.onclick = () => { const [pk, k, d] = b.dataset.pmv.split('|'); const L = pageLayout(pk), all = ADM.scan[pk].map((c, i) => ({k: c.k, o: L.order.indexOf(c.k) < 0 ? 1000 + i : L.order.indexOf(c.k)})).sort((a, b) => a.o - b.o).map(c => c.k);
    const i = all.indexOf(k), j = i + +d; if (j < 0 || j >= all.length) return; [all[i], all[j]] = [all[j], all[i]]; L.order = all; render(); });
  $$('[data-pgo]', pg).forEach(b => b.onclick = () => { LAYOUT_EDIT = true; go(b.dataset.pgo); layBtnSync(); });
  $$('[data-prs]', pg).forEach(b => b.onclick = () => { delete UI.layout[b.dataset.prs]; render(); });
  $('#layResetAll').onclick = () => { const was = clone(UI.layout); UI.layout = {}; render(); toast('All page layouts reset', () => { UI.layout = was; render(); }); };
}
const confirmInline = (el, msg) => window.confirm(msg + ' Continue?');
function openRemove(p) {
  const m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Remove ${esc(p.display_name || p.email)}?</h2><p class="muted" style="font-size:12.5px">They lose access to this household right away. Their login isn't deleted.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="rmGo" style="background:var(--neg);border-color:var(--neg)">Remove</button></div>`;
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
    <div><label>Permission</label><select class="in" id="apR"><option value="editor">Editor · can change data</option><option value="viewer">Viewer · read only</option><option value="owner">Owner · full admin</option></select></div>
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
