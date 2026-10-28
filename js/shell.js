/* ================= shell / routing ================= */
const PAGES = [
  {k: 'overview', n: 'Overview', i: 'home', g: 'Analyze', sub: () => `Balances as of ${mLabel(BS.months[L])} · budget through ${MON[ASOF.m - 1]} ${ASOF.y}`, r: renderOverview},
  {k: 'week', n: 'This week', i: 'week', g: 'Analyze', sub: () => 'Calendars and bills for the next two weeks · the weekly digest', r: renderWeek},
  {k: 'review', n: 'Year in review', i: 'cal', g: 'Analyze', sub: () => 'Recap, goals, notes and the annual deck', r: renderReview},
  {k: 'budget', n: 'Budget vs. actual', m: 'Budget', i: 'budget', g: 'Analyze', sub: () => 'Budget vs. actual · live from your transactions', r: renderBudget},
  {k: 'cash', n: 'Cash plan', i: 'cal', g: 'Analyze', sub: () => 'Bills, subscriptions, income and what’s coming · next 12 weeks', r: renderCash},
  {k: 'vendors', n: 'Vendors', i: 'store', g: 'Analyze', sub: () => 'Where the money goes, by merchant', r: renderVendors},
  {k: 'plan', n: 'Plan & Investments', m: 'Plan', i: 'invest', g: 'Analyze', sub: () => 'Where the money is, where it’s heading, what comes out of it · retirement and college', r: renderPlan},
  {k: 'tx', n: 'Transactions', i: 'tx', g: 'Manage', m: 'Activity', sub: () => 'Search, categorize, split and bulk-edit', r: renderTx},
  {k: 'balances', n: 'Balances', i: 'wallet', g: 'Manage', sub: () => 'Month-end values for every account and asset', r: renderBalances},
  {k: 'loans', n: 'Assets & loans', m: 'Assets', i: 'house', g: 'Manage', sub: () => 'Home, vehicles and what you owe on them · values, payoff dates, amortization and what-ifs', r: renderProperty},
  {k: 'taxes', n: 'Taxes', i: 'file', g: 'Manage', sub: () => 'Estimated payments, refunds and projections · Federal, Oklahoma, New Mexico', r: renderTaxes},
  {k: 'trust', n: 'Trust', i: 'shield', g: 'Manage', sub: () => TRUST()?.name ? esc(TRUST().name) + ' · quick reference' : 'Key points and key people · quick reference', r: renderTrust},
  {k: 'lawn', n: 'Lawn care', i: 'leaf', g: 'Manage', sub: () => 'Invoices tied to the bank, service history and the year ahead', r: renderLawn},
  {k: 'builder', n: 'Budget', i: 'grid', g: 'Manage', sub: () => 'Build the monthly budget for the year', r: renderBuilder},
  {k: 'cats', n: 'Categories', i: 'tag', g: 'Manage', sub: () => 'Create, rename, merge and recategorize history', r: renderCats},
  {k: 'admin', n: IS_OWNER ? 'Admin' : 'Settings', i: 'gear', g: 'Manage', sub: () => IS_OWNER ? 'People and permissions, table density and page layout' : 'Table density and page layout', r: renderAdmin},
  {k: 'ontrack', n: 'On track', i: 'target', g: 'Analyze', sub: () => `Are we saving enough to retire at ${SCN[0]?.p.retire ?? 55}? · ${esc(SCN[0]?.name || 'Base')} plan`, r: renderOnTrack},
  {k: 'goals', n: 'Goals', i: 'flag', g: 'Analyze', sub: () => 'Retirement, college and the big plans · how each one is coming along', r: renderGoals},
];
/* v94 · six sections, each a set of views (the old pages). Pages keep their keys, so go('budget') etc. still work.
   A per-person Simple view (Settings or the avatar menu) shows just Home, On track, Goals and This week. */
const SECTIONS_FULL = [
  {k: 'home', n: 'Home', i: 'home', v: [['overview', 'Overview'], ['week', 'This week']]},
  {k: 'spending', n: 'Spending', i: 'budget', v: [['budget', 'Budget vs. actual'], ['tx', 'Transactions'], ['vendors', 'Vendors'], ['cash', 'Bills'], ['lawn', 'Lawn care']]},
  {k: 'planS', n: 'Plan', i: 'invest', v: [['ontrack', 'On track'], ['plan', 'Investments'], ['goals', 'Goals'], ['review', 'Year in review']]},
  {k: 'networth', n: 'Net worth', i: 'wallet', v: [['balances', 'Balances'], ['loans', 'Assets & loans']]},
  {k: 'taxS', n: 'Taxes', i: 'file', v: [['taxes', 'Taxes']]},
  {k: 'settings', n: 'Settings', i: 'gear', v: [['admin', IS_OWNER ? 'Admin' : 'App'], ['builder', 'Budget setup'], ['cats', 'Categories'], ['trust', 'Trust']]},
];
const SECTIONS_SIMPLE = [
  {k: 'home', n: 'Home', i: 'home', v: [['overview', 'Home']]},
  {k: 'ontrackS', n: 'On track', i: 'target', v: [['ontrack', 'On track']]},
  {k: 'goalsS', n: 'Goals', i: 'flag', v: [['goals', 'Goals']]},
  {k: 'weekS', n: 'This week', i: 'week', v: [['week', 'This week']]},
];
const isSimple = () => UI.simple ?? (CTX.ROLE === 'viewer');
const SECTIONS = () => (isSimple() ? SECTIONS_SIMPLE : SECTIONS_FULL).map(s => ({...s, v: s.v.filter(([k]) => !tabHidden(k))})).filter(s => s.v.length);
const secOf = k => SECTIONS().find(s => s.v.some(v => v[0] === k));
const SECLAST = {};
function goSec(sk) { const s = SECTIONS().find(x => x.k === sk); if (!s) return; go(SECLAST[sk] && s.v.some(v => v[0] === SECLAST[sk]) ? SECLAST[sk] : s.v[0][0]); }
function setSimple(on) { UI.simple = on; SYNC.schedule(); buildNav(); if (!secOf(cur)) cur = 'overview'; go(cur); }
const TABS_DEF = ['overview', 'budget', 'tx', 'plan'];
// tab order, visibility, section and the phone bar come from UI.tabs (Admin → Tabs); Admin itself can't be hidden
const TABSET = () => { const dk = devKey(); UI.tabsBy ||= {}; const t = UI.tabsBy[dk] ||= clone(UI.tabs || {order: [], hidden: [], group: {}, bar: null}); tabMigrate(t); return t; };
function tabMigrate(t) {   // merged tabs: Investments → Plan & Investments (v51), Assets → Assets & loans (v52)
  const MV = [['invest', 'plan', '_m51'], ['assets', 'loans', '_m52']];
  for (const [from, to, flag] of MV) { if (t[flag]) continue; t[flag] = 1;
    const fx = a => { if (!a) return a; const i = a.indexOf(from); if (i < 0) return a; a = a.filter(k => k !== from); if (!a.includes(to)) a.splice(Math.min(i, a.length), 0, to); return a; };
    t.order = fx(t.order); t.bar = fx(t.bar); if (t.hidden) t.hidden = t.hidden.filter(k => k !== from); }
}
const tabGroup = p => TABSET().group?.[p.k] || p.g;
const tabHidden = k => k !== 'admin' && (TABSET().hidden || []).includes(k);
function navPages(g) { const o = TABSET().order || []; return PAGES.map((p, i) => ({p, i})).filter(x => (!g || tabGroup(x.p) === g))
  .sort((a, b) => { const ia = o.indexOf(a.p.k), ib = o.indexOf(b.p.k); return (ia < 0 ? 1000 + a.i : ia) - (ib < 0 ? 1000 + b.i : ib); }).map(x => x.p); }
function barKeys() { const want = (TABSET().bar || TABS_DEF).filter(k => PAGES.some(p => p.k === k) && !tabHidden(k)), vis = navPages().filter(p => !tabHidden(p.k) && p.k !== 'admin').map(p => p.k);
  for (const k of vis) { if (want.length >= 4) break; if (!want.includes(k)) want.push(k); } return want.slice(0, 4); }
let TABS = [];
let CH = [], cur = 'overview';
function render() {
  if (cur === 'invest') { cur = 'plan'; PLV = 'invest'; }
  if (cur === 'assets') { cur = 'loans'; LS.view = 'assets'; }
  const p = PAGES.find(x => x.k === cur);
  if (!$('#p-' + cur)) { const sec = document.createElement('section'); sec.className = 'page'; sec.id = 'p-' + cur; ($('.page')?.parentNode || document.querySelector('main') || document.body).appendChild(sec); }   // an older cached index.html may not have the newest page
  $$('.page').forEach(s => s.classList.toggle('on', s.id === 'p-' + cur));
  if (!secOf(cur)) { const s0 = SECTIONS()[0]; cur = s0.v[0][0]; return render(); }   // a view this person's menu doesn't have (Simple view)
  const sec = secOf(cur); SECLAST[sec.k] = cur;
  $$('.nav-btn, .tabbar button').forEach(b => b.classList.toggle('active', b.dataset.k === sec.k || (b.dataset.k === 'more' && !TABS.includes(sec.k))));
  $('#pageTitle').textContent = sec.n; $('#pageSub').textContent = p.sub();
  const vt = $('#vtabs'); if (vt) { vt.innerHTML = sec.v.length > 1 ? `<div class="seg vseg" role="tablist">${sec.v.map(([k, l]) => `<button role="tab" data-v="${k}" aria-selected="${k === cur}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''; vt.classList.toggle('on', sec.v.length > 1); $$('[data-v]', vt).forEach(b => b.onclick = () => go(b.dataset.v)); }
  const y = scrollY; CH = []; ZDASH = cur === 'budget'; try { p.r($('#p-' + cur)); } finally { ZDASH = false; } applyLayout(cur, $('#p-' + cur)); filterBtnSync(); layBtnSync();
  const keep = render.keep;
  requestAnimationFrame(() => { CH.forEach(f => f()); if (typeof fitTallCards === 'function') fitTallCards($('#p-' + cur)); if (keep && Math.abs(scrollY - y) > 2) scrollTo({top: y}); });   // free placement sizes tiles here, so restore the scroll after
  if (keep) scrollTo({top: y}); render.keep = true;
}
function go(k) { if (!PAGES.some(p => p.k === k) && SECTIONS().some(s => s.k === k)) return goSec(k); cur = k; history.replaceState(null, '', '#' + k); closeAll(); render.keep = false; scrollTo({top: 0}); render(); }
function buildNav() {
  const S = SECTIONS(); TABS = S.slice(0, 4).map(x => x.k);
  $('#nav').innerHTML = S.map(x => `<button class="nav-btn" data-k="${x.k}">${icon(x.i)}${x.n}</button>`).join('');
  $('#tabbar').innerHTML = S.slice(0, 4).map(x => `<button data-k="${x.k}">${icon(x.i)}${x.n}</button>`).join('') + (S.length > 4 ? `<button data-k="more">${icon('more')}More</button>` : '');
  $$('.nav-btn, .tabbar button').forEach(b => { b.title = b.textContent.trim(); b.onclick = () => b.dataset.k === 'more' ? openMore() : goSec(b.dataset.k); });
  const sec = secOf(cur); $$('.nav-btn, .tabbar button').forEach(b => b.classList.toggle('active', b.dataset.k === sec?.k || (b.dataset.k === 'more' && sec && !TABS.includes(sec.k))));
}
buildNav();
function openMore() {
  const m = $('#modal'); m.classList.remove('wide'); m.classList.add('sheet');
  m.innerHTML = `<div class="dh"><h2 style="font-size:18px">More</h2><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="more-grid">${SECTIONS().filter(x => !TABS.includes(x.k)).map(x => `<button data-k="${x.k}"><span class="ico">${icon(x.i)}</span>${x.n}</button>`).join('')}</div>`;
  openLayer('modal'); $$('.more-grid button', m).forEach(b => b.onclick = () => goSec(b.dataset.k));
}
function openLayer(id) { $('#scrim').classList.add('on'); $('#' + id).classList.add('on'); }
function closeAll() { $('#scrim').classList.remove('on'); $('#drawer').classList.remove('on'); setTimeout(() => { if (!$('#drawer').classList.contains('on')) $('#drawer').classList.remove('wide-d'); }, 300); const m = $('#modal'); m.classList.remove('on'); setTimeout(() => { if (!m.classList.contains('on')) m.classList.remove('wide', 'sheet'); }, 220); hideTip(); }
$('#scrim').onclick = closeAll; addEventListener('keydown', e => e.key === 'Escape' && closeAll());
$('#importBtn').onclick = openImport;
$('#layoutBtn').onclick = () => { if (LAYOUT_EDIT) layLock(cur, $('#p-' + cur)); LAYOUT_EDIT = !LAYOUT_EDIT; render(); };
if (!CTX.CAN_WRITE) $('#importBtn').style.display = 'none';
(() => { const e = CTX.email || '', nm = e.split('@')[0].split(/[._-]/).filter(Boolean), av = $('.avatar');
  av.textContent = ((nm[0]?.[0] || '') + (nm[1]?.[0] || nm[0]?.[1] || '')).toUpperCase() || '·'; av.title = e; av.style.cursor = 'pointer';
  av.onclick = ev => { ev.stopPropagation(); const p = $('#fltPop'); p.innerHTML = `<div class="flt-h"><b>${esc(CTX.household.name)} household</b></div><div class="muted" style="font-size:12px;padding:0 4px 10px">${esc(e)} · ${esc(CTX.ROLE)}</div><button class="btn" style="width:100%;justify-content:center;margin-bottom:8px" onclick="setSimple(!isSimple())">${isSimple() ? 'Show the full app' : 'Simple view'}</button><div class="muted" style="font-size:var(--fs-xs);padding:0 4px 10px">${isSimple() ? 'You’re in Simple view: Home, On track, Goals and This week.' : 'Simple view shows just Home, On track, Goals and This week · saved for you only.'}</div><button class="btn" style="width:100%;justify-content:center" onclick="location.reload()">Reload data</button><button class="btn" style="width:100%;justify-content:center;margin-top:8px" onclick="signOut()">Sign out</button>`;
    const r = av.getBoundingClientRect(); p.style.top = (r.bottom + 8) + 'px'; p.style.right = Math.max(8, innerWidth - r.right) + 'px'; p.classList.add('on'); };
})();
$('#filterBtn').onclick = openFilter;
/* v77 · phone header: filter / layout / import / theme live under one ⋯ menu so the page title gets the row */
$('#topMore').onclick = ev => { ev.stopPropagation(); const p = $('#fltPop'), mb = $('#topMore'), r = mb.getBoundingClientRect();
  const fOn = $('#filterBtn').style.display !== 'none', n = ST.excl.size + ST.exclSub.size, dark = document.documentElement.dataset.theme === 'dark';
  const it = (id, ic, l, note = '') => `<button class="mp-i" role="menuitem" data-mp="${id}">${icon(ic)}<span>${l}</span>${note ? `<em>${note}</em>` : ''}</button>`;
  p.innerHTML = `<div class="more-pop" role="menu">${fOn ? it('filter', 'filter', 'Categories', n ? n + ' excluded' : 'All') : ''}${cur !== 'admin' ? it('layout', 'layout', LAYOUT_EDIT ? 'Done with layout' : 'Layout') : ''}${CTX.CAN_WRITE ? it('import', 'down', 'Import') : ''}<button class="mp-i" role="menuitem" data-mp="theme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg><span>${dark ? 'Light' : 'Dark'} mode</span></button></div>`;
  const place = () => { p.style.top = (r.bottom + 8) + 'px'; };
  place(); p.classList.add('on');
  $$('[data-mp]', p).forEach(b => b.onclick = e2 => { e2.stopPropagation(); const k = b.dataset.mp; p.classList.remove('on');
    if (k === 'filter') { openFilter(); place(); }
    else if (k === 'layout') $('#layoutBtn').click();
    else if (k === 'import') openImport();
    else setTheme(dark ? 'light' : 'dark'); }); };
function setTheme(t) { document.documentElement.dataset.theme = t; const tc = document.getElementById('themeColor'); if (tc) tc.content = t === 'dark' ? '#030504' : '#f4f6f5'; try { localStorage.setItem('fin.theme', JSON.stringify(t)); } catch (e) {} SYNC.schedule(); $$('#themeToggle button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); }
$$('#themeToggle button').forEach(b => b.onclick = () => setTheme(b.dataset.t));
$('#themeMob').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
/* theme is per device: this browser's saved choice, else the device's light/dark setting (never the account) */
setTheme((() => { try { return JSON.parse(localStorage.getItem('fin.theme') || 'null'); } catch (_) { return null; } })() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
let rt, lastW = innerWidth; addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(() => { CH.forEach(f => f()); if (typeof packFree === 'function') requestAnimationFrame(() => packFree($('#p-' + cur))); }, 120); });
cur = 'overview'; if (location.hash === '#week' && !tabHidden('week')) cur = 'week'; else if (!secOf('overview')) cur = SECTIONS()[0].v[0][0];   // always open on Overview
render.keep = false; render();

/* collapsible side menu (remembered on this device) */
(() => { const KEY = 'fin.navMini', b = document.getElementById('sideCol'); if (!b) return;
  const set = on => { document.body.classList.toggle('nav-mini', on); b.title = on ? 'Expand the menu' : 'Collapse the menu'; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {} };
  // saved with your profile too, so the website and the local preview match
  let on = UI.navMini; if (on == null) { try { on = localStorage.getItem(KEY) === '1'; } catch (_) { on = false; } }
  set(!!on); b.onclick = () => { const v = !document.body.classList.contains('nav-mini'); set(v); UI.navMini = v; SYNC.schedule(); if (typeof render === 'function') render(); };
  $$('.nav-btn').forEach(x => x.title = x.textContent.trim()); })();

addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 8), {passive: true});
