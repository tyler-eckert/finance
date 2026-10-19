/* ================= shell / routing ================= */
const PAGES = [
  {k: 'overview', n: 'Overview', i: 'home', g: 'Analyze', sub: () => `Balances as of ${mLabel(BS.months[L])} · budget through ${MON[ASOF.m - 1]} ${ASOF.y}`, r: renderOverview},
  {k: 'review', n: 'Year in review', i: 'cal', g: 'Analyze', sub: () => 'Recap, goals, notes and the annual deck', r: renderReview},
  {k: 'budget', n: 'Budget', i: 'budget', g: 'Analyze', sub: () => 'Budget vs. actual · live from your transactions', r: renderBudget},
  {k: 'invest', n: 'Investments', i: 'invest', g: 'Analyze', sub: () => 'Brokerage, retirement, HSA and 529s', r: renderInvest},
  {k: 'cash', n: 'Cash plan', i: 'cal', g: 'Analyze', sub: () => 'Bills, subscriptions, income and what’s coming · next 12 weeks', r: renderCash},
  {k: 'vendors', n: 'Vendors', i: 'store', g: 'Analyze', sub: () => 'Where the money goes, by merchant', r: renderVendors},
  {k: 'plan', n: 'Plan', i: 'plan', g: 'Analyze', sub: () => 'Projections, future expenses and insights', r: renderPlan},
  {k: 'tx', n: 'Transactions', i: 'tx', g: 'Manage', m: 'Activity', sub: () => 'Search, categorize, split and bulk-edit', r: renderTx},
  {k: 'balances', n: 'Balances', i: 'wallet', g: 'Manage', sub: () => 'Month-end values for every account and asset', r: renderBalances},
  {k: 'loans', n: 'Loans', i: 'bank', g: 'Manage', sub: () => 'Balances, payoff dates, amortization and what-ifs', r: renderLoans},
  {k: 'taxes', n: 'Taxes', i: 'file', g: 'Manage', sub: () => 'Estimated payments, refunds and projections · Federal, Oklahoma, New Mexico', r: renderTaxes},
  {k: 'assets', n: 'Assets', i: 'house', g: 'Manage', sub: () => 'Home, vehicles and other assets · values over time', r: renderAssets},
  {k: 'lawn', n: 'Lawn care', i: 'leaf', g: 'Manage', sub: () => 'Invoices tied to the bank, service history and the year ahead', r: renderLawn},
  {k: 'builder', n: 'Budget plan', i: 'grid', g: 'Manage', sub: () => 'Build the monthly budget for the year', r: renderBuilder},
  {k: 'cats', n: 'Categories', i: 'tag', g: 'Manage', sub: () => 'Create, rename, merge and recategorize history', r: renderCats},
  {k: 'admin', n: IS_OWNER ? 'Admin' : 'Settings', i: 'gear', g: 'Manage', sub: () => IS_OWNER ? 'People and permissions, table density and page layout' : 'Table density and page layout', r: renderAdmin},
];
const TABS = ['overview', 'budget', 'tx', 'invest'];
let CH = [], cur = 'overview';
function render() {
  const p = PAGES.find(x => x.k === cur);
  if (!$('#p-' + cur)) { const sec = document.createElement('section'); sec.className = 'page'; sec.id = 'p-' + cur; ($('.page')?.parentNode || document.querySelector('main') || document.body).appendChild(sec); }   // an older cached index.html may not have the newest page
  $$('.page').forEach(s => s.classList.toggle('on', s.id === 'p-' + cur));
  $$('.nav-btn, .tabbar button').forEach(b => b.classList.toggle('active', b.dataset.k === cur || (b.dataset.k === 'more' && !TABS.includes(cur))));
  $('#pageTitle').textContent = p.n; $('#pageSub').textContent = p.sub();
  const y = scrollY; CH = []; p.r($('#p-' + cur)); applyLayout(cur, $('#p-' + cur)); filterBtnSync(); layBtnSync();
  requestAnimationFrame(() => { CH.forEach(f => f()); });
  if (render.keep) scrollTo({top: y}); render.keep = true;
}
function go(k) { cur = k; history.replaceState(null, '', '#' + k); closeAll(); render.keep = false; scrollTo({top: 0}); render(); }
$('#nav').innerHTML = ['Analyze', 'Manage'].map((g, gi) => `${gi ? `<div class="nav-label">${g}</div>` : ''}` + PAGES.filter(p => p.g === g).map(p => `<button class="nav-btn" data-k="${p.k}">${icon(p.i)}${p.n}</button>`).join('')).join('');
$('#tabbar').innerHTML = TABS.map(k => PAGES.find(p => p.k === k)).map(p => `<button data-k="${p.k}">${icon(p.i)}${p.m || (p.n === 'Investments' ? 'Invest' : p.n)}</button>`).join('') + `<button data-k="more">${icon('more')}More</button>`;
$$('.nav-btn, .tabbar button').forEach(b => b.onclick = () => b.dataset.k === 'more' ? openMore() : go(b.dataset.k));
function openMore() {
  const m = $('#modal'); m.classList.remove('wide'); m.classList.add('sheet');
  m.innerHTML = `<div class="dh"><h2 style="font-size:18px">More</h2><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="more-grid">${PAGES.filter(p => !TABS.includes(p.k)).map(p => `<button data-k="${p.k}"><span class="ico">${icon(p.i)}</span>${p.n}</button>`).join('')}</div>`;
  openLayer('modal'); $$('.more-grid button', m).forEach(b => b.onclick = () => go(b.dataset.k));
}
function openLayer(id) { $('#scrim').classList.add('on'); $('#' + id).classList.add('on'); }
function closeAll() { $('#scrim').classList.remove('on'); $('#drawer').classList.remove('on'); const m = $('#modal'); m.classList.remove('on'); setTimeout(() => { if (!m.classList.contains('on')) m.classList.remove('wide', 'sheet'); }, 220); hideTip(); }
$('#scrim').onclick = closeAll; addEventListener('keydown', e => e.key === 'Escape' && closeAll());
$('#importBtn').onclick = openImport;
$('#layoutBtn').onclick = () => { LAYOUT_EDIT = !LAYOUT_EDIT; render(); };
if (!CTX.CAN_WRITE) $('#importBtn').style.display = 'none';
(() => { const e = CTX.email || '', nm = e.split('@')[0].split(/[._-]/).filter(Boolean), av = $('.avatar');
  av.textContent = ((nm[0]?.[0] || '') + (nm[1]?.[0] || nm[0]?.[1] || '')).toUpperCase() || '·'; av.title = e; av.style.cursor = 'pointer';
  av.onclick = ev => { ev.stopPropagation(); const p = $('#fltPop'); p.innerHTML = `<div class="flt-h"><b>${esc(CTX.household.name)} household</b></div><div class="muted" style="font-size:12px;padding:0 4px 10px">${esc(e)} · ${esc(CTX.ROLE)}</div><button class="btn" style="width:100%;justify-content:center" onclick="location.reload()">Reload data</button><button class="btn" style="width:100%;justify-content:center;margin-top:8px" onclick="signOut()">Sign out</button>`;
    const r = av.getBoundingClientRect(); p.style.top = (r.bottom + 8) + 'px'; p.style.right = Math.max(8, innerWidth - r.right) + 'px'; p.classList.add('on'); };
})();
$('#filterBtn').onclick = openFilter;
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('fin.theme', JSON.stringify(t)); } catch (e) {} SYNC.schedule(); $$('#themeToggle button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); }
$$('#themeToggle button').forEach(b => b.onclick = () => setTheme(b.dataset.t));
$('#themeMob').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
setTheme(CTX.prefs.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
let rt, lastW = innerWidth; addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(() => CH.forEach(f => f()), 120); });
cur = (location.hash || '#overview').slice(1); if (!PAGES.find(p => p.k === cur)) cur = 'overview';
render.keep = false; render();

/* collapsible side menu (remembered on this device) */
(() => { const KEY = 'fin.navMini', b = document.getElementById('sideCol'); if (!b) return;
  const set = on => { document.body.classList.toggle('nav-mini', on); b.title = on ? 'Expand the menu' : 'Collapse the menu'; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {} };
  let on = false; try { on = localStorage.getItem(KEY) === '1'; } catch (_) {}
  set(on); b.onclick = () => { set(!document.body.classList.contains('nav-mini')); if (typeof render === 'function') render(); };
  $$('.nav-btn').forEach(x => x.title = x.textContent.trim()); })();
