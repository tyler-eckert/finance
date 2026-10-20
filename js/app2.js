/* =====================================================================
   MANAGE LAYER — transactions, categories, budgets, balances (in-memory;
   the live build persists the same shapes to Supabase)
   ===================================================================== */
Object.assign(I, {
  tx: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  wallet: '<path d="M3 7a2 2 0 012-2h13v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>',
  grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 4v16"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  split: '<path d="M6 3v6a4 4 0 004 4h4a4 4 0 014 4v4M18 3v6a4 4 0 01-4 4"/><path d="M3 18l3 3 3-3"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  merge: '<path d="M6 3v5a5 5 0 005 5h7M6 21v-5a5 5 0 015-5"/><path d="M15 9l3 4-3 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  wand: '<path d="M4 20L15 9M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.7 1.3L21 13l-1.3.7L19 15l-.7-1.3L17 13l1.3-.7z"/>',
});

const D2 = DATA2;
const GROUPS = [
  {k: 'Income', l: 'Income'},
  {k: 'Fixed Expense', l: 'Fixed expenses'},
  {k: 'Variable Expense', l: 'Variable expenses'},
  {k: 'TTS', l: 'Transfers (not budgeted)'},
];
const ST = {
  tx: D2.tx.map(t => ({...t})),
  cats: D2.cats.map(c => ({id: c.id, name: c.name, group: c.group, subs: [...(D2.subs[c.name] || [])]})),
  budget: JSON.parse(JSON.stringify(D2.budgets)),
  subBudget: JSON.parse(JSON.stringify(D2.subBudgets)),
  bal: JSON.parse(JSON.stringify(D2.balIn)),
  userRules: Object.fromEntries(Object.entries(D2.userRules).map(([k, v]) => [k, {cat: v.cat, sub: v.sub}])),
  log: (CTX.changeLog || []).map(c => ({when: new Date(c.at), label: c.summary, n: c.affected, undo: c.undoable ? () => serverUndo(c.id) : null})),
  catCounts: {...D2.catCounts},
  planned: (CTX.planned || []).map(p => ({id: p.id, name: p.name, due: p.due_month.slice(0, 7), amount: +p.amount, fund: p.fund_from, notes: p.notes || '', sinking: p.sinking_fund, status: p.status})),
  allLoaded: false,
};
ST.subAccts = (D2.subAccts || []).map(a => ({...a}));
ST.inv = JSON.parse(JSON.stringify(D2.inv || {}));
ST.valias = (D2.vendorAliases || []).map(a => ({pattern: a.pattern, name: a.name}));
ST.cash = (D2.cashItems || []).map(c => ({...c}));
if (!ST.budget[CY]) ST.budget[CY] = {};
if (!ST.subBudget[CY]) ST.subBudget[CY] = {};
for (const y in ST.budget) if (!ST.subBudget[y]) ST.subBudget[y] = {};
ST.cats.forEach(c => { if (!ST.budget[CY][c.name] && c.group !== 'TTS') ST.budget[CY][c.name] = Array(12).fill(0); });
async function serverUndo(logId) { DB.undoChange(logId); await new Promise(r => setTimeout(r, 900)); await refreshLoadedTx(); }
async function refreshLoadedTx() {   // re-read categories of loaded transactions after a server-side change
  const fresh = await DB.loadOlder('9999-12-31', ST.tx.length + 1000), by = new Map(fresh.map(t => [t.id, t]));
  ST.tx.forEach(t => { const f = by.get(t.id); if (!f) return; t.cat = f.cat; t.sub = f.sub; if (f.splits) t.splits = f.splits; else delete t.splits; });
  SYNC.adopt('tx'); render();
}
const catOf = n => ST.cats.find(c => c.name === n);
const groupOf = n => catOf(n)?.group || '';
const isExpense = n => /Expense/.test(groupOf(n));
const ASOF = {...CTX.ASOF};

/* ---------- description normalizer (mirrors the importer's history keys) ---------- */
function normDesc(d) {
  d = String(d || '').toUpperCase().split(/ CHK| DEBIT CRD| CARD PUR| POS /)[0];
  d = d.replace(/[0-9#*\-_.,/•]+/g, ' ').replace(/\b(SQ|TST|PAYPAL INST XFER|SP)\b/g, ' ');
  return d.replace(/\s+/g, ' ').trim();
}
const RULES = D2.rules;
const PREFIX = (() => { const P = {}; for (const k in RULES) { const p = k.split(' ').slice(0, 2).join(' '); (P[p] ||= {}); RULES[k].forEach(([c, s, n]) => { const kk = c + '|' + s; P[p][kk] = (P[p][kk] || 0) + n; }); } return P; })();
function matchCat(desc, amt) {
  const k = normDesc(desc);
  if (ST.userRules[k]) return {...ST.userRules[k], conf: 1, n: 1, how: 'your rule'};
  let cands = RULES[k] ? RULES[k].map(([c, s, n]) => ({c, s, n})) : null, how = 'exact';
  if (!cands) { const p = PREFIX[k.split(' ').slice(0, 2).join(' ')]; if (p) { cands = Object.entries(p).map(([kk, n]) => { const [c, s] = kk.split('|'); return {c, s, n}; }).sort((a, b) => b.n - a.n); how = 'similar'; } }
  if (!cands) return {cat: '', sub: '', conf: 0, n: 0, how: 'new'};
  // sign sanity: money in shouldn't land in an expense bucket if an income bucket exists
  const fit = amt > 0 ? cands.filter(x => !/Expense/.test(groupOf(x.c))) : cands;
  const pick = (fit.length ? fit : cands)[0], tot = sum(cands.map(x => x.n));
  return {cat: pick.c, sub: pick.s, conf: pick.n / tot, n: tot, how};
}
const confTag = m => m.how === 'new' ? '<span class="tag new">Review</span>' : m.how === 'your rule' ? '<span class="tag">Your rule</span>' : m.conf >= .8 && m.how === 'exact' ? `<span class="tag">High · ${Math.round(m.conf * 100)}%</span>` : `<span class="tag mid">${m.how === 'similar' ? 'Similar' : 'Medium'} · ${Math.round(m.conf * 100)}%</span>`;

/* ---------- aggregation (splits respected) ---------- */
const pieces = t => t.splits ? t.splits : [{cat: t.cat, sub: t.sub, amt: t.amt}];
function actuals(y, m0, m1) {
  const A = {}, S = {};
  const lo = `${y}-${String(m0).padStart(2, '0')}`, hi = `${y}-${String(m1).padStart(2, '0')}`;
  ST.tx.forEach(t => { const ym = t.d.slice(0, 7); if (ym < lo || ym > hi) return;
    pieces(t).forEach(p => { if (ST.exclSub?.size && ST.exclSub.has((p.cat || '') + '|' + (p.sub || ''))) return; const c = p.cat || 'Uncategorized'; A[c] = (A[c] || 0) + p.amt; const k = c + '|' + (p.sub || ''); S[k] = (S[k] || 0) + p.amt; }); });
  return {A, S};
}
const budgetFor = (y, cat, m0, m1) => { const sb = subBudgetRows(y, cat); const row = sb.length ? sb.reduce((acc, r) => acc.map((v, i) => v + (r.v[i] || 0)), Array(12).fill(0)) : (ST.budget[y]?.[cat] || Array(12).fill(0)); return sum(row.slice(m0 - 1, m1)); };
const subBudgetRows = (y, cat) => Object.entries(ST.subBudget[y] || {}).filter(([k]) => k.startsWith(cat + '|')).map(([k, v]) => ({sub: k.split('|')[1], v}));
const subBudgetFor = (y, cat, sub, m0, m1) => { const r = ST.subBudget[y]?.[cat + '|' + sub]; return r ? sum(r.slice(m0 - 1, m1)) : null; };

/* ---------- small UI helpers ---------- */
function toast(msg, undo) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.innerHTML = `${icon('check')}<span>${esc(msg)}</span>${undo ? `<button id="toastUndo">Undo</button>` : ''}`;
  t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 4200);
  if (undo) $('#toastUndo').onclick = () => { undo(); t.classList.remove('on'); };
}
const catOptions = (sel, {blank = 'Uncategorized', any = false} = {}) => (any ? `<option value="*">Any category</option>` : '') + `<option value="">${blank}</option>` +
  GROUPS.map(g => `<optgroup label="${g.l}">${ST.cats.filter(c => c.group === g.k).map(c => `<option ${c.name === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
const subOptions = (cat, sel, {any = false} = {}) => (any ? `<option value="*">Any sub-category</option>` : '') + `<option value="">${(catOf(cat)?.subs.length) ? '— None —' : 'No sub-categories'}</option>` + (catOf(cat)?.subs || []).map(s => `<option ${s === sel ? 'selected' : ''}>${esc(s)}</option>`).join('') + (cat && !any ? '<option value="__new">+ New sub-category…</option>' : '');
function wireCatSub(catSel, subSel, onChange) {
  catSel.onchange = () => { subSel.innerHTML = subOptions(catSel.value, ''); onChange && onChange(); };
  subSel.onchange = () => {
    if (subSel.value !== '__new') return onChange && onChange();
    if (!catOf(catSel.value)) { subSel.value = ''; return toast('Pick a category first'); }
    const inp = document.createElement('input'); inp.className = 'in new-sub ' + (subSel.classList.contains('sm') ? 'sm' : ''); inp.placeholder = 'New sub-category, then Enter'; inp.enterKeyHint = 'done';
    subSel.replaceWith(inp); setTimeout(() => inp.focus(), 0);
    let fin = false;
    const done = () => { if (fin) return; fin = true;
      const c = catOf(catSel.value), v = inp.value.trim().replace(/\s+/g, ' ');
      const hit = c && c.subs.find(s => s.toLowerCase() === v.toLowerCase());
      const nm = hit || v; if (c && v && !hit) c.subs.push(v);
      subSel.innerHTML = subOptions(catSel.value, nm); if (inp.isConnected) inp.replaceWith(subSel); onChange && onChange();
      if (v && !hit) toast(`Added “${v}” to ${c.name}`); };
    inp._done = done; inp.onblur = done; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') { inp.value = ''; done(); } };
  };
}
const flushSubs = () => $$('input.new-sub').forEach(i => i._done && i._done());
const fmtDate = d => MON[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10));
const cleanDesc = d => d.replace(/ (CHK|DEBIT CRD|CARD PUR).*$/i, '').trim();

/* =====================================================================
   BUDGET (computed live from transactions)
   ===================================================================== */
let bMonth = ASOF.m; const bOpen = new Set();
function renderBudget(pg) {
  const seg = `<div class="seg" id="bSeg">${[['month', 'Month'], ['ytd', 'YTD'], ['years', 'Years'], ['actuals', 'Actuals']].map(([k, l]) => `<button data-k="${k}" class="${k === bMode ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (bMode === 'years') { renderYears(pg, seg); return; }
  if (bMode === 'actuals') { renderActuals(pg, seg); return; }
  const m0 = bMode === 'month' ? bMonth : 1, m1 = bMonth, y = ASOF.y;
  const {A, S} = actuals(y, m0, m1);
  const rows = ST.cats.filter(c => c.group !== 'TTS' && !ST.excl.has(c.name)).map(c => ({c, b: budgetFor(y, c.name, m0, m1), a: A[c.name] || 0}));
  const exRows = [...ST.excl].filter(n => A[n] || budgetFor(y, n, m0, m1)).map(n => ({n, a: A[n] || 0, b: budgetFor(y, n, m0, m1)}));
  const tot = g => rows.filter(r => r.c.group === g).reduce((s, r) => ({b: s.b + r.b, a: s.a + r.a}), {b: 0, a: 0});
  const inc = tot('Income'), fx = tot('Fixed Expense'), vx = tot('Variable Expense');
  const exp = {b: fx.b + vx.b, a: fx.a + vx.a}, net = {b: inc.b + exp.b, a: inc.a + exp.a};
  const unc = A['Uncategorized'] || 0, uncN = ST.tx.filter(t => !t.splits && !t.cat && t.d.slice(0, 7) >= `${y}-${String(m0).padStart(2, '0')}` && t.d.slice(0, 7) <= `${y}-${String(m1).padStart(2, '0')}`).length;
  const kpi = (lbl, r, goodUp) => { const v = r.a - r.b; return `<div class="card c-4 kpi"><div class="label">${lbl}</div><div class="val num">${money(r.a)}</div><div class="delta">${chip(v, true, short(Math.abs(v)) + (v >= 0 ? (goodUp ? ' ahead' : ' under') : (goodUp ? ' behind' : ' over')))} <span class="muted" style="margin-left:6px">budget ${money(r.b)}</span></div></div>`; };
  const tax = rows.find(r => r.c.name === 'Tax')?.a || 0;
  const variance = rows.filter(r => r.c.group !== 'Income' && Math.abs(r.a - r.b) > 1).map(r => ({name: r.c.name, v: r.a - r.b, a: r.a, b: r.b})).sort((a, b) => a.v - b.v);
  const top = variance.length > 10 ? variance.slice(0, 6).concat(variance.slice(-4)) : variance;
  pg.innerHTML = `
  <div class="toolbar">${seg}
    <select class="in sel" id="bMonthSel">${MON.slice(0, ASOF.m).map((m, i) => `<option value="${i + 1}" ${i + 1 === bMonth ? 'selected' : ''}>${bMode === 'month' ? m + ' ' + y : 'Jan – ' + m + ' ' + y}</option>`).join('')}</select>
    <div style="margin-left:auto;display:flex;gap:8px"><button class="btn" id="bExpand">${icon('chev')}<span>${bOpen.size ? 'Collapse all' : 'Expand all'}</span></button><button class="btn" onclick="go('builder')">${icon('grid')}<span>Edit budget</span></button></div></div>
  ${exclBanner()}${uncN ? `<div class="banner">${icon('warn')}<span><b>${uncN} uncategorized</b> transactions (${money(unc)}) in this period.</span><button class="btn" style="height:30px;margin-left:auto" onclick="TXF.cat='';TXF.sub='*';TXF.unc=true;TXF.month='${y}-${String(m1).padStart(2, '0')}';go('tx')">Review</button></div>` : ''}
  <div class="grid g-12">
    ${kpi('Income', inc, true)}${kpi('Spending', exp, false)}${kpi('Net', net, true)}
    <div class="card c-7"><div class="card-h"><div><h3>Biggest variances</h3><div class="sub">Green = under budget · red = over · click to drill in</div></div></div><div class="chart" id="varChart"></div></div>
    <div class="card c-5"><div class="card-h"><div><h3>Where the money went</h3><div class="sub">${bMode === 'month' ? MON[m1 - 1] + ' ' + y : 'Jan – ' + MON[m1 - 1] + ' ' + y}</div></div></div><div class="chart" id="wfChart"></div></div>
    <div class="card c-12"><div class="card-h"><div><h3>Budget vs. actual</h3><div class="sub">${MON[m1 - 1]} and the year to date side by side · expand a category for its sub-categories · tap a line for its transactions</div></div></div>
      <div class="scroll-x"><table class="table bva" id="bvaTable"></table></div></div>
  </div>`;
  $$('#bSeg button').forEach(b => b.onclick = () => { bMode = b.dataset.k; render(); });
  $('#bMonthSel').onchange = e => { bMonth = +e.target.value; render(); };
  $('#bExpand').onclick = () => { if (bOpen.size) bOpen.clear(); else HAS.forEach(n => bOpen.add(n)); render(); };
  const vcell = (v, inc) => Math.abs(v) < 1 ? '<td class="muted">—</td>' : `<td class="${v > 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : '−'}${money(Math.abs(v)).replace('−', '')}</td>`;
  const bar = (a, b, income) => { const used = b ? a / b : (a ? 2 : 0), over = income ? used < 1 : used > 1; return `<td class="bar-cell"><div style="display:flex;align-items:center;gap:8px"><div class="pbar" style="flex:1"><i class="${over ? 'over' : ''}" style="width:${Math.min(100, used * 100)}%"></i></div><span class="muted num" style="font-size:11.5px;width:38px">${b ? Math.round(used * 100) + '%' : '—'}</span></div></td>`; };
  // table: the month and year-to-date side by side for the selected month
  const AM = actuals(y, m1, m1), AY = actuals(y, 1, m1), mLbl = MON[m1 - 1];
  const R = c => ({bm: budgetFor(y, c, m1, m1), am: AM.A[c] || 0, by: budgetFor(y, c, 1, m1), ay: AY.A[c] || 0});
  const cells = (r, income, muteB) => `<td class="muted bm">${money(r.bm)}</td><td>${money(r.am)}</td>${vcell(r.am - r.bm)}<td class="muted by">${money(r.by)}</td><td>${money(r.ay)}</td>${vcell(r.ay - r.by)}${bar(r.ay, r.by, income)}`;
  const NC = 8;
  let h = `<tr class="bh1"><th rowspan="2">Category</th><th colspan="3" class="bgrp">${mLbl} ${y}</th><th colspan="3" class="bgrp">Year to date · Jan – ${mLbl}</th><th rowspan="2" class="bar-cell">% used (YTD)</th></tr>
    <tr class="bh2"><th class="bm">Budget</th><th>Actual</th><th>Variance</th><th class="by">Budget</th><th>Actual</th><th>Variance</th></tr>`; const HAS = new Set();
  const gsum = (g, k) => sum(ST.cats.filter(c => c.group === g && !ST.excl.has(c.name)).map(c => R(c.name)[k]));
  const gR = g => ({bm: gsum(g, 'bm'), am: gsum(g, 'am'), by: gsum(g, 'by'), ay: gsum(g, 'ay')});
  GROUPS.filter(g => g.k !== 'TTS').forEach(g => {
    h += `<tr class="grp"><td colspan="${NC}">${g.l}</td></tr>`;
    const income = g.k === 'Income';
    rows.filter(r => r.c.group === g.k).forEach(r => {
      const c = r.c.name, rr = R(c); if (!rr.am && !rr.bm && !rr.ay && !rr.by) return;
      const subKeys = [...new Set(Object.keys(AY.S).filter(k => k.startsWith(c + '|')).map(k => k.split('|')[1]))];
      const subs = [...new Set([...r.c.subs.filter(sb => subKeys.includes(sb) || subBudgetFor(y, c, sb, 1, m1) != null), ...subKeys])].filter(sb => Math.abs(AY.S[c + '|' + sb] || 0) >= .5 || subBudgetFor(y, c, sb, 1, m1) != null);
      const has = subs.some(Boolean); if (has) HAS.add(c); const open = has && bOpen.has(c);
      h += `<tr class="click cat ${open ? 'open' : ''}" data-cat="${esc(c)}"><td><span class="tw">${has ? `<button class="chev" data-tg="${esc(c)}" aria-label="Expand">${icon('chev', 2.4)}</button>` : '<span class="chev-sp"></span>'}<span>${esc(c)}</span>${has ? `<span class="cnt">${subs.filter(Boolean).length}</span>` : ''}</span></td>${cells(rr, income)}</tr>`;
      if (open) subs.sort((p, q) => (AY.S[c + '|' + p] || 0) - (AY.S[c + '|' + q] || 0)).forEach(sb => {
        const bm = subBudgetFor(y, c, sb, m1, m1), by = subBudgetFor(y, c, sb, 1, m1), am = AM.S[c + '|' + sb] || 0, ay = AY.S[c + '|' + sb] || 0;
        h += `<tr class="click sub" data-cat="${esc(c)}" data-sub="${esc(sb)}"><td><span class="tw sub-name">${sb ? esc(sb) : '<i class="muted">No sub-category</i>'}</span></td>
          <td class="muted bm">${bm == null ? '' : money(bm)}</td><td>${money(am)}</td>${bm == null ? '<td></td>' : vcell(am - bm)}<td class="muted by">${by == null ? '' : money(by)}</td><td>${money(ay)}</td>${by == null ? '<td></td>' : vcell(ay - by)}${by == null ? '<td class="bar-cell"></td>' : bar(ay, by, income)}</tr>`;
      });
    });
    h += `<tr class="tot"><td>Total ${g.l.toLowerCase()}</td>${cells(gR(g.k), income)}</tr>`;
  });
  if (exRows.length) h += `<tr class="grp"><td colspan="${NC}">Excluded from analysis</td></tr>` + [...ST.excl].map(n => ({n, r: R(n)})).filter(x => x.r.am || x.r.bm || x.r.ay || x.r.by).map(x => `<tr class="excl"><td>${esc(x.n)}</td><td class="muted bm">${money(x.r.bm)}</td><td class="muted">${money(x.r.am)}</td><td></td><td class="muted by">${money(x.r.by)}</td><td class="muted">${money(x.r.ay)}</td><td></td><td class="bar-cell"></td></tr>`).join('');
  const nR = ['Income', 'Fixed Expense', 'Variable Expense'].map(gR).reduce((a, b) => ({bm: a.bm + b.bm, am: a.am + b.am, by: a.by + b.by, ay: a.ay + b.ay}));
  h += `<tr class="tot net"><td>Net${ST.excl.size ? ' <span class="muted" style="font-size:11px;font-weight:500">' + exclLabel() + '</span>' : ''}</td><td class="muted bm">${money(nR.bm)}</td><td>${money(nR.am)}</td>${vcell(nR.am - nR.bm)}<td class="muted by">${money(nR.by)}</td><td>${money(nR.ay)}</td>${vcell(nR.ay - nR.by)}<td class="bar-cell"></td></tr>`;
  $('#bvaTable').innerHTML = h;
  $$('#bvaTable .chev').forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.tg; bOpen.has(k) ? bOpen.delete(k) : bOpen.add(k); render(); });
  $$('#bvaTable tr.click').forEach(tr => tr.onclick = () => openCatTx(tr.dataset.cat, tr.dataset.sub, m0, m1));
  CH.push(() => divergingBars($('#varChart'), top, {onClick: r => openCatTx(r.name, undefined, m0, m1)}),
    () => waterfall($('#wfChart'), [{name: 'Income', v: inc.a, total: true}, {name: 'Fixed', v: fx.a}, {name: 'Variable', v: vx.a - tax}, ...(ST.excl.has('Tax') ? [] : [{name: 'Tax', v: tax}]), {name: 'Net', v: net.a, total: true}], {height: 260}));
}
function openCatTx(cat, sub, m0, m1) {
  const y = ASOF.y, lo = `${y}-${String(m0).padStart(2, '0')}`, hi = `${y}-${String(m1).padStart(2, '0')}`;
  const match = p => p.cat === cat && (sub === undefined || (p.sub || '') === sub);
  const list = ST.tx.filter(t => t.d.slice(0, 7) >= lo && t.d.slice(0, 7) <= hi && pieces(t).some(match));
  const amtOf = t => sum(pieces(t).filter(match).map(p => p.amt));
  const c = catOf(cat), inc = c?.group === 'Income', sg = v => inc ? v : -v;
  // last 12 months ending at the latest month with data
  const end = `${ASOF.y}-${String(ASOF.m).padStart(2, '0')}`, m12 = Array.from({length: 12}, (_, i) => ymAdd(end, i - 11));
  const byM = {}; ST.tx.forEach(t => { const k = t.d.slice(0, 7); if (k < m12[0] || k > end) return; pieces(t).forEach(p => { if (match(p)) byM[k] = (byM[k] || 0) + p.amt; }); });
  const v12 = m12.map(k => sg(byM[k] || 0)), t12 = sum(v12);
  // annual: last 5 calendar years (current year = year to date, live)
  const yrs = Array.from({length: 5}, (_, i) => CY - 4 + i);
  const hist = yy => { let s = 0; for (let m = 1; m <= 12; m++) { const k = `${yy}-${String(m).padStart(2, '0')}`; s += sub === undefined ? (DATA.monthly[k]?.[cat] || 0) : (DATA.subMonthly[k]?.[cat + '|' + sub] || 0); } return s; };
  const yv = yrs.map(yy => sg(yy === CY ? sum(ST.tx.filter(t => t.d.startsWith(String(CY))).map(t => sum(pieces(t).filter(match).map(p => p.amt)))) : hist(yy)));
  const pace = ASOF.m ? yv[4] / ASOF.m * 12 : 0;
  // vendors behind the last 12 months
  const vend = {}; ST.tx.forEach(t => { const k = t.d.slice(0, 7); if (k < m12[0] || k > end) return; const a = amtOf(t); if (!a) return; const n = vendorName(vendorKey(t.desc)); (vend[n] ||= {n, v: 0, c: 0}); vend[n].v += sg(a); vend[n].c++; });
  const topV = Object.values(vend).sort((p, q) => q.v - p.v).slice(0, 8), vMax = Math.max(1, ...topV.map(x => Math.abs(x.v)));
  const budM = Math.abs(sub === undefined ? budgetFor(y, cat, 1, 12) : (subBudgetFor(y, cat, sub, 1, 12) || 0)) / 12;
  const d = $('#drawer');
  d.innerHTML = `<div class="dh"><div><div class="muted" style="font-size:12px;font-weight:600">${esc(GROUPS.find(g => g.k === c?.group)?.l || '')}${sub !== undefined ? ' · ' + esc(cat) : ''}</div><h2>${esc(sub === undefined ? cat : (sub || 'No sub-category'))}</h2></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="stat-row" style="margin:14px 0;grid-template-columns:1fr 1fr 1fr"><div class="mini"><div class="l">${m0 === m1 ? MON[m0 - 1] + ' ' + y : 'Jan – ' + MON[m1 - 1]}</div><div class="v num">${money(Math.abs(sum(list.map(amtOf))))}</div><div class="muted" style="font-size:11.5px">${list.length} transactions</div></div>
    <div class="mini"><div class="l">Last 12 months</div><div class="v num">${money(t12)}</div><div class="muted" style="font-size:11.5px">${money(t12 / 12)}/mo avg</div></div>
    <div class="mini"><div class="l">Budget</div><div class="v num">${money(budM)}/mo</div><div class="muted" style="font-size:11.5px">${y} pace ${short(pace)}/yr</div></div></div>
    <h4 class="h4">Last 12 months</h4><div class="chart" id="catChart"></div>
    <h4 class="h4" style="margin-top:18px">By year · last 5 years</h4><div class="chart" id="catYrChart"></div>
    ${topV.length ? `<h4 class="h4" style="margin-top:18px">Top vendors · last 12 months</h4><div class="list">${topV.map(x => `<div class="li click" data-vend="${esc(x.n)}"><div style="min-width:0;flex:1"><div class="nm ell">${esc(x.n)}</div><div class="pbar" style="height:4px;margin-top:5px"><i style="width:${Math.abs(x.v) / vMax * 100}%"></i></div></div><div class="amt num">${money(x.v)}<div class="muted" style="font-size:11px;font-weight:500">${x.c} txns</div></div></div>`).join('')}</div>` : ''}
    <h4 class="h4" style="margin-top:18px">Transactions · ${m0 === m1 ? MON[m0 - 1] : 'Jan – ' + MON[m1 - 1]} ${y}</h4><div class="list" id="catList">${list.slice(0, 80).map(t => txLi(t, amtOf(t))).join('') || '<p class="muted">None in this period.</p>'}</div>`;
  openLayer('drawer');
  $$('#catList .li').forEach(li => li.onclick = () => openTxEdit(li.dataset.id));
  $$('[data-vend]', d).forEach(li => li.onclick = () => { TXF.vendor = li.dataset.vend; TXF.cat = cat; TXF.sub = '*'; TXF.month = 'm12'; go('tx'); });
  requestAnimationFrame(() => {
    barChart($('#catChart'), {labels: m12.map(mShort), series: [{name: sub ?? cat, values: v12, color: 'var(--s2)'}], height: 170, padL: 44, xGap: 40, tipTitle: (l, i) => mLabel(m12[i] || m12[0])});
    barChart($('#catYrChart'), {labels: yrs.map(v => v === CY ? v + ' YTD' : String(v)), series: [{name: sub ?? cat, values: yv, color: 'var(--s1)', hatchFn: i => yrs[i] === CY}], height: 170, padL: 44, xGap: 50,
      tipExtra: i => yrs[i] === CY ? tipRow(null, 'Full-year pace', money(pace)) : ''});
  });
}
const txLi = (t, amt = t.amt) => `<div class="li click" data-id="${t.id}"><div style="min-width:0"><div class="nm ell">${esc(cleanDesc(t.desc))}</div><div class="ds">${fmtDate(t.d)} · ${t.splits ? `${icon('split')} Split ${t.splits.length} ways` : esc([t.cat || 'Uncategorized', t.sub].filter(Boolean).join(' · '))}</div></div><div class="amt num ${amt > 0 ? 'pos' : ''}">${money(amt, 2)}</div></div>`;

/* =====================================================================
   TRANSACTIONS
   ===================================================================== */
const TXF = {q: '', acct: '', cat: '*', sub: '*', month: '', unc: false, lim: 150, vendor: '', dir: ''};
const todayYM = () => CTX.TODAY.slice(0, 7);
function txRange(p) {   // period → [from, to] inclusive 'YYYY-MM-DD'
  const t = CTX.TODAY, ymT = todayYM(), y = +t.slice(0, 4);
  if (!p) return null;
  if (/^\d{4}-\d{2}$/.test(p)) return [p + '-01', p + '-31'];
  if (/^\d{4}$/.test(p)) return [p + '-01-01', p + '-12-31'];
  const back = n => { const d = new Date(t + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  return {this: [ymT + '-01', ymT + '-31'], last: [ymAdd(ymT, -1) + '-01', ymAdd(ymT, -1) + '-31'], d30: [back(30), t], d90: [back(90), t], ytd: [y + '-01-01', t], py: [(y - 1) + '-01-01', (y - 1) + '-12-31'], m12: [ymAdd(ymT, -11) + '-01', t]}[p] || null;
}
const TXSEL = new Set();
function txFiltered() {
  const q = TXF.q.trim().toUpperCase();
  const rg = txRange(TXF.month);
  return ST.tx.filter(t => (!TXF.acct || t.acct === TXF.acct) && (!rg || (t.d >= rg[0] && t.d <= rg[1])) && (!TXF.unc || (!t.cat && !t.splits)) &&
    (!TXF.dir || (TXF.dir === 'out' ? t.amt < 0 : t.amt > 0)) && (!TXF.vendor || vendorName(vendorKey(t.desc)) === TXF.vendor) &&
    (TXF.unc || !(ST.excl.size || ST.exclSub.size) || pieces(t).some(p => !isExclP(p))) &&
    (TXF.cat === '*' || pieces(t).some(p => (p.cat || '') === TXF.cat && (TXF.sub === '*' || (TXF.sub === '__none' ? !p.sub : p.sub === TXF.sub)))) && (!q || t.desc.toUpperCase().includes(q) || (t.note || '').toUpperCase().includes(q) || vendorName(vendorKey(t.desc)).toUpperCase().includes(q)));
}
function renderTx(pg) {
  const months = [...new Set(ST.tx.map(t => t.d.slice(0, 7)))].sort().reverse();
  const list = txFiltered();
  pg.innerHTML = `
  <div class="toolbar wrap">
    <div class="search">${icon('search')}<input class="in" id="txQ" placeholder="Search description or note" value="${esc(TXF.q)}"></div>
    <select class="in sel" id="txAcct"><option value="">All accounts</option>${[...new Set(ST.tx.map(t => t.acct))].sort().map(a => `<option ${TXF.acct === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <select class="in sel" id="txMonth"><option value="">Any date</option>${[['this', 'This month'], ['last', 'Last month'], ['d30', 'Last 30 days'], ['d90', 'Last 90 days'], ['ytd', 'Year to date'], ['m12', 'Last 12 months'], ['py', 'Last year']].map(([k, l]) => `<option value="${k}" ${k === TXF.month ? 'selected' : ''}>${l}</option>`).join('')}<optgroup label="Month">${months.map(m => `<option value="${m}" ${m === TXF.month ? 'selected' : ''}>${mLabel(m)}</option>`).join('')}</optgroup></select>
    <select class="in sel" id="txDir"><option value="">In & out</option><option value="out" ${TXF.dir === 'out' ? 'selected' : ''}>Money out</option><option value="in" ${TXF.dir === 'in' ? 'selected' : ''}>Money in</option></select>
    ${TXF.vendor ? `<button class="chip pos" id="txVend" title="Clear vendor filter">${esc(TXF.vendor)} ✕</button>` : ''}
    ${TXF.cat !== '*' ? `<button class="chip pos" id="txCatClr" title="Clear category filter">${esc(TXF.cat || 'Uncategorized')}${TXF.sub !== '*' ? ' · ' + esc(TXF.sub === '__none' ? 'no sub-category' : TXF.sub) : ''} ✕</button>` : ''}
    <label class="tgl"><input type="checkbox" id="txUnc" ${TXF.unc ? 'checked' : ''}> Uncategorized</label>
  </div>
  ${exclBanner()}
  <div class="card" style="padding-top:8px">
    <div class="bulk ${TXSEL.size ? 'on' : ''}" id="bulk"><b>${TXSEL.size} selected</b>
      <select class="in sel" id="bkCat">${catOptions('', {blank: 'Set category…'})}</select><select class="in sel" id="bkSub">${subOptions('', '')}</select>
      <button class="btn primary" id="bkApply" style="height:34px">Apply</button><button class="btn" id="bkClear" style="height:34px">Clear</button></div>
    ${(() => { const rg = txRange(TXF.month); return rg && rg[0] < CTX.SINCE && !ST.allLoaded ? `<div class="banner" style="margin:6px 0 10px">${icon('info')}<span>This period starts before ${mLabel(CTX.SINCE.slice(0, 7))}, the start of the loaded history. Use “load all” below to include it.</span></div>` : ''; })()}
    <div class="tx-sum muted">${list.length.toLocaleString()} transactions · ${money(sum(list.map(t => t.amt)), 2)} net · ${ST.allLoaded ? 'full history loaded' : `showing ${mLabel(CTX.SINCE.slice(0, 7))} onward · <button class="link" id="txOlder">load all ${D2.txCountAll.toLocaleString()}</button>`}</div>
    <div class="scroll-x"><table class="table txt"><tr><th style="width:28px"><input type="checkbox" id="selAll"></th><th class="hide-sm">Date</th><th>Description</th><th class="hide-sm">Category</th><th>Amount</th></tr>
    ${list.slice(0, TXF.lim).map(t => `<tr class="click" data-id="${t.id}"><td><input type="checkbox" class="rsel" data-id="${t.id}" ${TXSEL.has(t.id) ? 'checked' : ''}></td><td class="muted nowrap hide-sm">${fmtDate(t.d)}${t.d.slice(0, 4) !== String(CY) ? ', ' + t.d.slice(2, 4) : ''}</td>
      <td><div class="ell tx-d">${esc(cleanDesc(t.desc))}</div><div class="ds mob-cat"><span class="mob-only-inline">${fmtDate(t.d)} · </span><button class="link vlink" data-v="${esc(vendorName(vendorKey(t.desc)))}">${esc(vendorName(vendorKey(t.desc)))}</button> · ${esc(t.acct)}${t.note ? ' · ' + esc(t.note) : ''}<span class="mob-only-inline"> · ${t.splits ? 'Split' : esc(t.cat || 'Uncategorized')}</span></div></td>
      <td class="hide-sm">${t.splits ? `<span class="pill split">${icon('split')}Split · ${t.splits.length}</span>` : t.cat ? `<span class="pill">${esc(t.cat)}${t.sub ? `<i>${esc(t.sub)}</i>` : ''}</span>` : '<span class="pill warn">Uncategorized</span>'}</td>
      <td class="num nowrap ${t.amt > 0 ? 'pos' : ''}">${money(t.amt, 2)}</td></tr>`).join('')}</table></div>
    ${!list.length ? `<p class="muted" style="padding:18px 4px">No transactions match these filters${TXF.month ? ` for ${esc(({this: 'this month', last: 'last month', d30: 'the last 30 days', d90: 'the last 90 days', ytd: 'this year', m12: 'the last 12 months', py: 'last year'})[TXF.month] || mLabel(TXF.month))}` : ''}. The latest transaction loaded is ${ST.tx[0] ? fmtDate(ST.tx[0].d) + ', ' + ST.tx[0].d.slice(0, 4) : '—'}.</p>` : ''}
    ${list.length > TXF.lim ? `<div style="text-align:center;padding:14px"><button class="btn" id="txMore">Show ${Math.min(150, list.length - TXF.lim)} more</button></div>` : ''}
  </div>`;
  const re = () => { TXF.lim = 150; render(); };
  let qt; $('#txQ').oninput = e => { TXF.q = e.target.value; clearTimeout(qt); qt = setTimeout(() => { const pos = e.target.selectionStart; re(); const n = $('#txQ'); n.focus(); n.setSelectionRange(pos, pos); }, 250); };
  $('#txAcct').onchange = e => { TXF.acct = e.target.value; re(); };
  $('#txMonth').onchange = e => { TXF.month = e.target.value; re(); };
  $('#txDir').onchange = e => { TXF.dir = e.target.value; re(); };
  if ($('#txVend')) $('#txVend').onclick = () => { TXF.vendor = ''; re(); };
  if ($('#txCatClr')) $('#txCatClr').onclick = () => { TXF.cat = '*'; TXF.sub = '*'; re(); };
  $('#txUnc').onchange = e => { TXF.unc = e.target.checked; re(); };
  if ($('#txMore')) $('#txMore').onclick = () => { TXF.lim += 150; render(); };
  $$('.vlink', pg).forEach(b => b.onclick = e => { e.stopPropagation(); TXF.vendor = b.dataset.v; re(); });
  if ($('#txOlder')) $('#txOlder').onclick = async e => { e.target.textContent = 'loading…'; e.target.disabled = true;
    try { const older = await DB.loadOlder(CTX.SINCE, 1e6); const have = new Set(ST.tx.map(t => t.id)); older.forEach(t => { if (!have.has(t.id)) ST.tx.push(t); }); ST.tx.sort((a, b) => b.d.localeCompare(a.d)); ST.allLoaded = true; SYNC.adopt('tx', older.map(t => t.id)); render(); toast(`Loaded ${older.length.toLocaleString()} older transactions`); }
    catch (err) { toast('Couldn’t load: ' + err.message); render(); } };
  $$('tr.click', pg).forEach(tr => tr.onclick = e => { if (e.target.type === 'checkbox') return; openTxEdit(tr.dataset.id); });
  $$('.rsel', pg).forEach(c => c.onchange = () => { c.checked ? TXSEL.add(c.dataset.id) : TXSEL.delete(c.dataset.id); render(); });
  $('#selAll').onchange = e => { list.slice(0, TXF.lim).forEach(t => e.target.checked ? TXSEL.add(t.id) : TXSEL.delete(t.id)); render(); };
  wireCatSub($('#bkCat'), $('#bkSub'));
  $('#bkClear').onclick = () => { TXSEL.clear(); render(); };
  $('#bkApply').onclick = () => { flushSubs(); const c = $('#bkCat').value; if (!c) return; const ids = [...TXSEL]; recat(ids, c, $('#bkSub').value, `Bulk: ${ids.length} → ${c}`); TXSEL.clear(); render(); };
}
function recat(ids, cat, sub, label) {
  const before = ids.map(id => { const t = ST.tx.find(x => x.id === id); return [id, t.cat, t.sub, t.splits]; });
  ids.forEach(id => { const t = ST.tx.find(x => x.id === id); t.cat = cat; t.sub = sub || ''; delete t.splits; });
  const undo = () => { before.forEach(([id, c, s, sp]) => { const t = ST.tx.find(x => x.id === id); t.cat = c; t.sub = s; if (sp) t.splits = sp; }); render(); };
  ST.log.unshift({when: new Date(), label, n: ids.length, undo});
  toast(`${label}`, undo);
}
function openTxEdit(id) {
  const t = ST.tx.find(x => x.id === id), k = normDesc(t.desc);
  const same = ST.tx.filter(x => x.id !== id && normDesc(x.desc) === k);
  const hist = RULES[k] ? sum(RULES[k].map(r => r[3])) : 0, m = matchCat(t.desc, t.amt);
  const d = $('#drawer');
  d.innerHTML = `<div class="dh"><div><div class="muted" style="font-size:12px;font-weight:600">${esc(t.acct)} · ${fmtDate(t.d)}, ${t.d.slice(0, 4)}</div><h2 style="font-size:19px">${esc(cleanDesc(t.desc))}</h2></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="big-amt num ${t.amt > 0 ? 'pos' : ''}">${money(t.amt, 2)}</div>
  <div class="muted" style="font-size:11.5px;word-break:break-all;margin-bottom:16px">${esc(t.desc)}</div>
  ${t.splits ? `<div class="mini" style="margin-bottom:14px"><div class="l">Split ${t.splits.length} ways</div>${t.splits.map(s => `<div class="r2"><span>${esc(s.cat)}${s.sub ? ' · ' + esc(s.sub) : ''}${s.note ? ` <i class="muted">${esc(s.note)}</i>` : ''}</span><b class="num">${money(s.amt, 2)}</b></div>`).join('')}</div>` : `
  <div class="form">
    <div><label>Category</label><select class="in" id="eCat">${catOptions(t.cat)}</select></div>
    <div><label>Sub-category</label><select class="in" id="eSub">${subOptions(t.cat, t.sub)}</select></div>
  </div>`}
  <div class="form" style="margin-top:12px"><div style="grid-column:1/-1"><label>Note</label><input class="in" id="eNote" value="${esc(t.note || '')}" placeholder="Add a note"></div></div>
  ${m.how !== 'new' ? `<div class="hint">${icon('wand')}<span>History suggests <b>${esc(m.cat)}${m.sub ? ' · ' + esc(m.sub) : ''}</b> ${confTag(m)} based on ${hist || m.n} past matches.</span></div>` : ''}
  ${same.length && !t.splits ? `<label class="tgl" style="margin-top:12px"><input type="checkbox" id="eAll"> Also apply to ${same.length} other “${esc(k)}” transactions</label>` : ''}
  ${!t.splits ? `<label class="tgl" style="margin-top:6px"><input type="checkbox" id="eRule" checked> Remember for future imports</label>` : ''}
  <div class="drawer-actions"><button class="btn" id="eSplit">${icon('split')}<span>${t.splits ? 'Edit split' : 'Split'}</span></button>${t.splits ? '<button class="btn" id="eUnsplit">Remove split</button>' : ''}<button class="btn primary" id="eSave" style="margin-left:auto">Save</button></div>`;
  openLayer('drawer');
  if (!t.splits) wireCatSub($('#eCat'), $('#eSub'));
  $('#eSplit').onclick = () => openSplit(t);
  if ($('#eUnsplit')) $('#eUnsplit').onclick = () => { t.cat = t.splits[0].cat; t.sub = t.splits[0].sub; delete t.splits; closeAll(); render(); toast('Split removed'); };
  $('#eSave').onclick = () => {
    flushSubs();
    t.note = $('#eNote').value;
    if (!t.splits) {
      const c = $('#eCat').value, s = $('#eSub').value === '__new' ? '' : $('#eSub').value;
      const ids = [t.id].concat($('#eAll')?.checked ? same.map(x => x.id) : []);
      if ($('#eRule')?.checked && c) ST.userRules[k] = {cat: c, sub: s};
      recat(ids, c, s, ids.length > 1 ? `${ids.length} “${k}” → ${c}${s ? ' · ' + s : ''}` : `Categorized as ${c}${s ? ' · ' + s : ''}`);
    }
    closeAll(); render();
  };
}

/* ---------- split ---------- */
function openSplit(t) {
  const sign = t.amt < 0 ? -1 : 1, total = Math.abs(t.amt);
  let parts = t.splits ? t.splits.map(s => ({...s, amt: Math.abs(s.amt)})) : [{cat: t.cat, sub: t.sub, amt: +(total / 2).toFixed(2), note: ''}, {cat: '', sub: '', amt: +(total - +(total / 2).toFixed(2)).toFixed(2), note: ''}];
  const m = $('#modal');
  const draw = () => {
    const rem = +(total - sum(parts.map(p => +p.amt || 0))).toFixed(2);
    m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Split transaction</h2><p class="muted" style="font-size:12.5px">${esc(cleanDesc(t.desc))} · ${fmtDate(t.d)} · <b class="num">${money(t.amt, 2)}</b></p></div><button class="x" onclick="closeModal()">${icon('close')}</button></div>
    <div class="split-rows">${parts.map((p, i) => `<div class="split-row" data-i="${i}">
      <select class="in sCat">${catOptions(p.cat)}</select><select class="in sSub">${subOptions(p.cat, p.sub)}</select>
      <div class="amt-in"><span>$</span><input class="in sAmt num" inputmode="decimal" value="${p.amt}"></div>
      <input class="in sNote" placeholder="Note" value="${esc(p.note || '')}">
      <button class="x sDel" ${parts.length < 3 ? 'disabled style="opacity:.3"' : ''}>${icon('close')}</button></div>`).join('')}</div>
    <div class="split-foot"><button class="btn" id="sAdd">${icon('plus')}<span>Add line</span></button><button class="btn" id="sEven">Split evenly</button>
      <div class="rem ${Math.abs(rem) < .005 ? 'ok' : 'bad'}">${Math.abs(rem) < .005 ? icon('check') + ' Balanced' : (rem > 0 ? money(rem, 2) + ' left to assign' : money(-rem, 2) + ' over')}</div></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="sSave" ${Math.abs(rem) < .005 && parts.every(p => p.cat) ? '' : 'disabled style="opacity:.45"'}>Save split</button></div>`;
    $$('.split-row', m).forEach(r => {
      const i = +r.dataset.i, p = parts[i];
      wireCatSub($('.sCat', r), $('.sSub', r), () => { p.cat = $('.sCat', r).value; p.sub = $('.sSub', r)?.value || ''; draw(); });
      $('.sAmt', r).onchange = e => { p.amt = +(+e.target.value.replace(/[^0-9.]/g, '')).toFixed(2); draw(); };
      $('.sNote', r).onchange = e => p.note = e.target.value;
      $('.sDel', r).onclick = () => { if (parts.length > 2) { parts.splice(i, 1); draw(); } };
    });
    $('#sAdd').onclick = () => { parts.push({cat: '', sub: '', amt: Math.max(0, rem), note: ''}); draw(); };
    $('#sEven').onclick = () => { const each = Math.floor(total / parts.length * 100) / 100; parts.forEach((p, i) => p.amt = i === parts.length - 1 ? +(total - each * (parts.length - 1)).toFixed(2) : each); draw(); };
    $('#sSave').onclick = () => { if (Math.abs(rem) >= .005 || !parts.every(p => p.cat)) return; t.splits = parts.map(p => ({cat: p.cat, sub: p.sub, amt: sign * p.amt, note: p.note})); t.cat = parts[0].cat; t.sub = parts[0].sub; closeAll(); render(); toast(`Split into ${parts.length} lines`); };
  };
  draw(); $('#modal').classList.add('on'); $('#scrim').classList.add('on');
}
function closeModal() { $('#modal').classList.remove('on'); if (!$('#drawer').classList.contains('on')) $('#scrim').classList.remove('on'); }

/* =====================================================================
   IMPORT — parse, de-dupe, auto-match category + sub-category from history
   ===================================================================== */
let IMP = null;
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
function toRows(text, acct) {
  const R = parseCSV(text), H = R[0].map(h => h.toLowerCase().replace(/^﻿/, '').trim());
  const fi = re => H.findIndex(h => re.test(h));
  const iD = fi(/^(posting |transaction |post )?date$|date/), iDesc = fi(/^desc|description|payee|memo|^name|details/);
  const iDr = fi(/debit|withdraw/), iCr = fi(/credit|deposit/);
  const iAmt = H.findIndex((h, k) => /amount/.test(h) && k !== iDr && k !== iCr);
  const iT = fi(/^type$|d\/c|transaction type|^dr\/cr/), iChk = fi(/check|chk/), iBal = fi(/^balance$|running bal|ledger bal|available bal/);
  const split = iDr >= 0 && iCr >= 0;
  const map = {date: H[iD], description: H[iDesc], amount: split ? `${H[iCr]} − ${H[iDr]}` : H[iAmt], balance: iBal >= 0 ? H[iBal] : null};
  const num = s => { const v = String(s ?? '').replace(/[$,\s]/g, ''); const neg = /^\(.*\)$/.test(v) || /^-/.test(v); return (neg ? -1 : 1) * Math.abs(+v.replace(/[()\-]/g, '') || 0); };
  const toISO = s => { s = String(s || '').trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; };
  const parsed = R.slice(1).map((r, i) => {
    let amt;
    if (split) amt = Math.abs(num(r[iCr])) - Math.abs(num(r[iDr]));          // credits in, debits out
    else { amt = num(r[iAmt]); if (iT >= 0 && amt > 0 && /^(debit|dr|withdrawal|pos|atm|fee|check)/i.test(String(r[iT]).trim())) amt = -amt; }
    const d = toISO(r[iD]); let desc = String(r[iDesc] || '').replace(/\s+/g, ' ').trim();
    if (iChk >= 0 && String(r[iChk] || '').trim() && /^CHECK/i.test(desc)) desc = `CHECK #${String(r[iChk]).trim()}`;
    if (!d || !desc || !amt) return null;
    return {i, d, desc, amt: +amt.toFixed(2), acct, bal: iBal >= 0 && String(r[iBal] || '').trim() !== '' ? num(r[iBal]) : null};
  }).filter(Boolean);
  // match against what's already loaded for this account: same day, same size, same merchant
  const pool = new Map(), keyOf = (d, amt, desc) => `${d}|${Math.abs(amt).toFixed(2)}|${vendorKey(desc) || normDesc(desc)}`;
  ST.tx.filter(t => t.acct === acct).forEach(t => { const k = keyOf(t.d, t.amt, t.desc); (pool.get(k) || pool.set(k, []).get(k)).push(t); });
  const lo = parsed.reduce((m, r) => r.d < m ? r.d : m, '9999'), hi = parsed.reduce((m, r) => r.d > m ? r.d : m, '');
  const rows = parsed.map(r => {
    const hit = (pool.get(keyOf(r.d, r.amt, r.desc)) || []).shift();
    const mt = matchCat(r.desc, r.amt);
    if (!hit) return {...r, cat: mt.cat, sub: mt.sub, m: mt, st: 'new', keep: true, vendor: vendorName(vendorKey(r.desc))};
    const same = Math.abs(hit.amt - r.amt) < .005;
    const sideOk = !hit.cat || (r.amt > 0) === !/Expense/.test(groupOf(hit.cat)) || groupOf(hit.cat) === 'TTS';
    const keepCat = same || (hit.cat && sideOk);
    return {...r, hit, st: same ? 'dup' : 'fix', keep: !same, cat: keepCat ? hit.cat : mt.cat, sub: keepCat ? hit.sub : mt.sub, m: keepCat ? {how: 'kept', conf: 1, n: 0} : mt, vendor: vendorName(vendorKey(r.desc))};
  });
  const used = new Set(rows.filter(r => r.hit).map(r => r.hit.id));
  const stale = ST.tx.filter(t => t.acct === acct && t.d >= lo && t.d <= hi && !used.has(t.id));
  // month-end balances from a running-balance column (latest row of each month)
  const asc = parsed.length > 1 && parsed[0].d <= parsed[parsed.length - 1].d, bals = {};
  if (iBal >= 0) parsed.forEach((r, k) => { if (r.bal == null) return; const mo = r.d.slice(0, 7), cur = bals[mo];
    if (!cur || r.d > cur.d || (r.d === cur.d && (asc ? k > cur.k : k < cur.k))) bals[mo] = {d: r.d, k, v: r.bal}; });
  return {map, rows, stale, lo, hi, bals};
}
function openImport() {
  IMP = {acct: (CTX.importAccts[0] || [...new Set(ST.tx.map(t => t.acct))][0]), file: null, data: null, onlyReview: false, replace: false, setBal: true};
  drawImport(); openLayer('modal');
}
const IMP_TAG = {new: '', dup: '<span class="chip">Already imported</span>', fix: '<span class="tag mid">Correct existing</span>'};
function drawImport() {
  const m = $('#modal'), D = IMP.data;
  const needs = r => r.st !== 'dup' && (r.m.how === 'new' || (r.m.conf < .8 && r.m.how !== 'kept') || !r.cat);
  const stats = D ? {n: D.rows.filter(r => r.keep && r.st === 'new').length, fix: D.rows.filter(r => r.keep && r.st === 'fix').length, dup: D.rows.filter(r => r.st === 'dup').length,
    rev: D.rows.filter(r => r.keep && needs(r)).length, del: IMP.replace ? D.stale.length : 0} : null;
  const balRow = D && ST.bal.accounts.find(a => a.kind === 'account' && a.name === IMP.acct), balMs = D ? Object.keys(D.bals).sort() : [];
  m.classList.add('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px;letter-spacing:-.02em">Import transactions</h2><p class="muted" style="font-size:12.5px">CSV export from your bank · debits come in as money out, credits as money in · already-imported rows are matched by date, amount and vendor</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="acct-pick">${(CTX.importAccts.length ? CTX.importAccts : [IMP.acct]).map((a, i) => { const lt = ST.tx.find(t => t.acct === a); return `<button class="${IMP.acct === a ? 'on' : ''}" data-a="${esc(a)}">${icon(i ? 'save' : 'cash')}<b style="display:block;margin-top:6px">${esc(a)}</b><small>${lt ? 'Last transaction ' + fmtDate(lt.d) + ', ' + lt.d.slice(0, 4) : 'No transactions yet'}</small></button>`; }).join('')}</div>
  ${!D ? `<label class="drop" style="display:block;cursor:pointer"><input type="file" accept=".csv,.txt" id="csvIn" hidden><span class="ico" style="margin:0 auto">${icon('up')}</span><b>Drop a CSV or click to browse</b><span class="muted" style="font-size:12px">Date, Description and Amount — or Debit / Credit — columns are detected automatically</span></label>` :
  `<div class="imp-sum"><div class="mini"><div class="l">New</div><div class="v num">${stats.n}</div></div><div class="mini"><div class="l">Corrections</div><div class="v num" style="color:#b07800">${stats.fix}</div></div><div class="mini"><div class="l">Needs a look</div><div class="v num" style="color:#b07800">${stats.rev}</div></div><div class="mini"><div class="l">Already imported</div><div class="v num muted">${stats.dup}</div></div></div>
   <div style="display:flex;align-items:center;gap:10px;margin:14px 0 6px;flex-wrap:wrap"><h4 style="font-size:13px">${esc(IMP.file)} · ${fmtDate(D.lo)} – ${fmtDate(D.hi)}, ${D.hi.slice(0, 4)}</h4><span class="muted" style="font-size:11.5px">${esc(D.map.date)} → Date · ${esc(D.map.description)} → Description · ${esc(D.map.amount)} → Amount</span><label class="tgl" style="margin-left:auto"><input type="checkbox" id="onlyRev" ${IMP.onlyReview ? 'checked' : ''}> Needs a look only</label></div>
   <div class="scroll-x imp-wrap"><table class="map"><tr><th></th><th>Date</th><th>Description</th><th>Vendor</th><th style="text-align:right">Amount</th><th>Category</th><th>Sub-category</th><th>Match</th></tr>
   ${D.rows.filter(r => !IMP.onlyReview || needs(r)).map(r => `<tr class="${r.st === 'dup' ? 'dup' : ''}" data-i="${r.i}"><td><input type="checkbox" class="iKeep" ${r.keep ? 'checked' : ''} ${r.st === 'dup' ? 'disabled' : ''}></td><td class="nowrap">${fmtDate(r.d)}</td><td class="ell" style="max-width:220px" title="${esc(r.desc)}">${esc(cleanDesc(r.desc))}</td><td class="ell" style="max-width:140px">${esc(r.vendor)}</td><td style="text-align:right" class="num ${r.amt > 0 ? 'pos' : ''}">${money(r.amt, 2)}${r.st === 'fix' ? `<div class="muted" style="font-size:10.5px">was ${money(r.hit.amt, 2)}</div>` : ''}</td>
     <td>${r.st === 'dup' ? `<span class="muted">${esc(r.cat || 'Uncategorized')}</span>` : `<select class="in sm iCat">${catOptions(r.cat)}</select>`}</td><td>${r.st === 'dup' ? '' : `<select class="in sm iSub">${subOptions(r.cat, r.sub)}</select>`}</td><td>${r.st !== 'new' ? IMP_TAG[r.st] : confTag(r.m)}</td></tr>`).join('')}</table></div>
   <div class="imp-opts">
     <label class="tgl"><input type="checkbox" id="learn" checked> Learn from my changes for future imports</label>
     <label class="tgl"><input type="checkbox" id="impRep" ${IMP.replace ? 'checked' : ''}> Replace mode: delete ${D.stale.length} ${esc(IMP.acct)} transaction${D.stale.length === 1 ? '' : 's'} between ${fmtDate(D.lo)} and ${fmtDate(D.hi)} that aren't in this file</label>
     ${balRow && balMs.length ? `<label class="tgl"><input type="checkbox" id="impBal" ${IMP.setBal ? 'checked' : ''}> Set ${esc(IMP.acct)} month-end balance${balMs.length > 1 ? 's' : ''} from the file: ${balMs.map(k => `${MON[+k.slice(5) - 1]} ${money(D.bals[k].v, 2)}`).join(' · ')}</label>` : ''}
   </div>`}
  <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">${D ? '<button class="btn" id="impBack">Choose another file</button>' : ''}<button class="btn" onclick="closeAll()">Cancel</button>${D ? `<button class="btn primary" id="impGo">${[stats.n && `Import ${stats.n}`, stats.fix && `correct ${stats.fix}`, stats.del && `delete ${stats.del}`].filter(Boolean).join(' · ') || 'Nothing to import'}</button>` : ''}</div>`;
  $$('.acct-pick button', m).forEach(b => b.onclick = () => { IMP.acct = b.dataset.a; if (IMP.data) IMP.data = toRows(IMP.raw, IMP.acct); drawImport(); });
  const load = (name, text) => { IMP.file = name; IMP.raw = text; try { IMP.data = toRows(text, IMP.acct); } catch (e) { toast('Couldn’t read that file: ' + e.message); IMP.data = null; } drawImport(); };
  if ($('#csvIn')) $('#csvIn').onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => load(f.name, t)); };
  const drop = $('.drop', m); if (drop) { drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over'); drop.ondrop = e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) f.text().then(t => load(f.name, t)); }; }
  if (!D) return;
  $('#onlyRev').onchange = e => { IMP.onlyReview = e.target.checked; drawImport(); };
  $('#impRep').onchange = e => { IMP.replace = e.target.checked; drawImport(); };
  if ($('#impBal')) $('#impBal').onchange = e => { IMP.setBal = e.target.checked; };
  $('#impBack').onclick = () => { IMP.data = null; drawImport(); };
  $$('tr[data-i]', m).forEach(tr => { const r = D.rows.find(x => x.i === +tr.dataset.i);
    $('.iKeep', tr).onchange = e => { r.keep = e.target.checked; drawImport(); };
    if (r.st === 'dup') return;
    wireCatSub($('.iCat', tr), $('.iSub', tr), () => { r.cat = $('.iCat', tr).value; r.sub = $('.iSub', tr)?.value === '__new' ? '' : ($('.iSub', tr)?.value || ''); r.edited = true; });
  });
  $('#impGo').onclick = async () => {
    flushSubs();
    const add = D.rows.filter(r => r.keep && r.st === 'new'), fix = D.rows.filter(r => r.keep && r.st === 'fix'), del = IMP.replace ? D.stale : [];
    if (!add.length && !fix.length && !del.length && !(IMP.setBal && balRow)) return closeAll();
    const btn = $('#impGo'); btn.disabled = true; btn.textContent = 'Importing…';
    let saved = [];
    try { saved = await DB.importTx(add, IMP.acct, IMP.file, fix, del.map(t => t.id)); }
    catch (e) { btn.disabled = false; btn.textContent = 'Retry import'; return toast('Import failed: ' + e.message); }
    const before = {fix: fix.map(r => [r.hit, {...r.hit}]), del: del.slice()};
    fix.forEach(r => Object.assign(r.hit, {amt: r.amt, desc: r.desc, cat: r.cat, sub: r.sub || ''}));
    if (fix.length) SYNC.adopt('tx', fix.map(r => r.hit.id));
    if (del.length) { const gone = new Set(del.map(t => t.id)); ST.tx = ST.tx.filter(t => !gone.has(t.id)); SYNC.adopt('tx', [...gone]); }
    saved.forEach((row, j) => { const r = add[j]; ST.tx.push({id: row.id, d: r.d, desc: r.desc, amt: r.amt, cat: r.cat, sub: r.sub || '', proj: '', acct: r.acct, note: ''}); });
    SYNC.adopt('tx', saved.map(r => r.id));
    if ($('#learn')?.checked) add.concat(fix).filter(r => r.edited && r.cat).forEach(r => ST.userRules[normDesc(r.desc)] = {cat: r.cat, sub: r.sub});
    if (IMP.setBal && balRow) Object.entries(D.bals).forEach(([mo, b]) => { let j = ST.bal.months.indexOf(mo); if (j < 0 && mo > ST.bal.months[ST.bal.months.length - 1]) { while (ST.bal.months[ST.bal.months.length - 1] < mo) { ST.bal.months.push(ymAdd(ST.bal.months[ST.bal.months.length - 1], 1)); ST.bal.accounts.forEach(a => a.v.push(null)); } j = ST.bal.months.indexOf(mo); } if (j >= 0) balRow.v[j] = b.v; });
    if (Object.keys(D.bals || {}).length) DB.saveStatementBalances(IMP.acct, D.bals, D.hi).catch(e => console.warn('[fin] statement balances not saved — run migration 1500', e.message));
    ST.tx.sort((a, b) => b.d.localeCompare(a.d));
    D2.txCountAll += saved.length - del.length;
    const newest = D.hi.slice(0, 7);
    if (newest > `${ASOF.y}-${String(ASOF.m).padStart(2, '0')}` && +newest.slice(0, 4) === ASOF.y) ASOF.m = +newest.slice(5, 7);
    closeAll(); render();
    toast(`${IMP.acct}: ${[saved.length && `${saved.length} imported`, fix.length && `${fix.length} corrected`, del.length && `${del.length} removed`].filter(Boolean).join(' · ') || 'balances updated'}`);
  };
}

/* =====================================================================
   BALANCES — flexible month-end inputs
   ===================================================================== */
const BGROUPS = ['Cash', 'Investing', 'Retirement', 'College', 'Debt', 'Other'];
let balM = null, balView = 'grid', balInactive = false;   // history grid by default: balances go in once a month
const acctLive = (a, i) => a.active !== false && (a.v[i] != null || a.v.slice(Math.max(0, i - 5), i + 1).some(v => v != null && Math.abs(v) >= .5) || (a.v.slice(0, i + 1).filter(v => v != null).pop() || 0) !== 0);
function renderBalances(pg) {
  const B = ST.bal, months = B.months;
  if (balM == null) { const lastFull = months.map((m, j) => B.accounts.filter(a => a.v[j] != null).length); let j = lastFull.length - 1; while (j > 0 && !lastFull[j]) j--; balM = Math.min(months.length - 1, j + (lastFull[j] >= B.accounts.length * .8 ? 1 : 0)); }
  if (balM < 0) balM = months.length - 1;
  const i = balM, VA = B.accounts.filter(a => balInactive || acctLive(a, i)), nHidden = B.accounts.length - VA.length, done = VA.filter(a => a.v[i] != null).length;
  const signOf = a => a.group === 'Debt' ? -1 : 1;
  const nw = j => sum(B.accounts.map(a => (a.v[j] ?? a.v[j - 1] ?? 0) * signOf(a)));
  const groups = BGROUPS.filter(g => VA.some(a => a.group === g));
  const kOf = a => B.accounts.indexOf(a);
  // History grid: locked to the last 12 months, with month-over-month and year-over-year variance columns
  const gridHTML = () => {
    // window = the 12 complete months ending last month
    const nowM = ym(CTX.TODAY);
    let A = months.length - 1; if (months[A] >= nowM && A > 0) A--;   // the current month isn't over yet — end on the last complete month
    const jN = A, j0 = Math.max(0, A - 11), W = months.slice(j0, jN + 1);
    const val = (a, j) => j < 0 ? null : (a.v[j] ?? a.v[j - 1] ?? null);       // same carry-forward rule as net worth
    const ya = A - 12, yaM = ya >= 0 ? months[ya] : (() => { const [y, m] = months[A].split('-'); return `${+y - 1}-${m}`; })();
    const prevYA = (a, j) => { if (j >= 0) return val(a, j); const s = BS && BS[(a.kind === 'loan' ? 'loan:' : 'acct:') + a.id], k = BS?.months?.indexOf(yaM); return s && k >= 0 ? (s[k] ?? null) : null; };
    let nv = 0; const slot = () => ['vm', 'vy'][nv++ % 2];   // MoM pair, then YoY pair
    const vc = (cur, prv, sg) => {
      const c = slot();
      if (cur == null || prv == null) return `<td class="num muted var-c ${c}1">${cur != null && prv == null ? 'new' : '—'}</td><td class="num muted var-c ${c}2"></td>`;
      const d = cur - prv, cls = d === 0 ? 'muted' : d * sg > 0 ? 'pos' : 'neg';
      return `<td class="num var-c ${c}1 ${cls}">${d === 0 ? '$0' : (d > 0 ? '+' : '') + short(d)}</td><td class="num var-c ${c}2 ${cls}">${prv ? pct(d / Math.abs(prv), 1) : ''}</td>`;
    };
    const sumG = (list, f) => { const xs = list.map(f); return xs.every(x => x == null) ? null : sum(xs.map(x => x ?? 0)); };
    const vars = (list, sg, signed) => { const g = f => sumG(list, a => { const x = f(a); return x == null ? null : x * (signed ? signOf(a) : 1); });
      return vc(g(a => val(a, A)), g(a => val(a, A - 1)), sg) + vc(g(a => val(a, A)), g(a => prevYA(a, ya)), sg); };
    return `<div class="card"><div class="card-h"><div><h3>Last 12 months</h3><div class="sub">${mLabel(W[0])} – ${mLabel(W[W.length - 1])} · variances for ${mLabel(months[A])}${A < months.length - 1 ? ` · ${mLabel(months[months.length - 1])} not complete yet, enter it under Month entry` : ''}</div></div></div>
      <div class="scroll-x"><table class="table grid-t"><tr><th class="stick">Account</th>${W.map((m, x) => `<th class="${x + j0 === A ? 'anc' : ''}">${mShort(m)}</th>`).join('')}
        <th class="var-h vm1" title="Month over month">MoM $<span>vs ${mShort(months[A - 1] || yaM)}</span></th><th class="var-h vm2">MoM %<span>&nbsp;</span></th><th class="var-h vy1" title="Same month a year ago">YoY $<span>vs ${mShort(yaM)}</span></th><th class="var-h vy2">YoY %<span>&nbsp;</span></th></tr>
      ${groups.map(g => { const ga = VA.filter(a => a.group === g), sg = g === 'Debt' ? -1 : 1;
        return `<tr class="grp"><td class="stick">${g}</td>${W.map((m, x) => { const t = sumG(ga, a => val(a, x + j0)); return `<td class="num gtot ${x + j0 === A ? 'anc' : ''}">${t == null ? '' : short(t)}</td>`; }).join('')}${vars(ga, sg, false)}</tr>` + ga.map(a => `<tr><td class="nowrap stick ind">${esc(a.name)}</td>${W.map((m, x) => { const j = x + j0, v = a.v[j];
          return `<td class="${j === A ? 'anc' : ''}"><input class="cell num" ${a.rollup ? 'readonly' : ''} data-k="${kOf(a)}" data-j="${j}" value="${v != null ? Math.round(v).toLocaleString() : ''}" placeholder="—"></td>`; }).join('')}
          ${vc(val(a, A), val(a, A - 1), sg)}${vc(val(a, A), prevYA(a, ya), sg)}</tr>`).join(''); }).join('')}
      <tr class="tot"><td class="stick">Net worth (tracked)</td>${W.map((m, x) => `<td class="num ${x + j0 === A ? 'anc' : ''}">${short(nw(x + j0))}</td>`).join('')}${vars(B.accounts, 1, true)}</tr></table></div></div>`;
  };
  const chk = typeof checksCard === 'function' ? checksCard() : '';
  pg.innerHTML = `${chk ? `<div class="grid g-12" style="margin-bottom:18px">${chk}</div>` : ''}
  <div class="toolbar wrap"><div class="seg" id="balSeg"><button data-k="month" class="${balView === 'month' ? 'on' : ''}">Month entry</button><button data-k="grid" class="${balView === 'grid' ? 'on' : ''}">History grid</button></div>
    ${balView === 'month' ? `<div class="stepper"><button id="bmPrev" ${i ? '' : 'disabled'}>${icon('chev')}</button><b>${mLabel(months[i])}</b><button id="bmNext" ${i < months.length - 1 ? '' : 'disabled'}>${icon('chev')}</button></div>` : ''}
    <label class="tgl" style="margin-left:auto"><input type="checkbox" id="balInact" ${balInactive ? 'checked' : ''}> Show inactive${nHidden ? ` (${nHidden})` : ''}</label>
    <button class="btn primary" id="addAcct">${icon('plus')}<span>Add account</span></button></div>
  ${balView === 'month' ? `<div class="grid g-12">
    <div class="card c-4 kpi"><div class="label">Entered for ${MON[+months[i].slice(5) - 1]}</div><div class="val num">${done} <span class="muted" style="font-size:16px">of ${VA.length}</span></div><div class="pbar" style="margin-top:12px;height:8px"><i style="width:${VA.length ? done / VA.length * 100 : 0}%"></i></div></div>
    <div class="card c-4 kpi"><div class="label">Tracked net worth · ${mLabel(months[i])}</div><div class="val num">${short(nw(i))}</div><div class="delta">${chip(i ? (nw(i) - nw(i - 1)) / Math.abs(nw(i - 1)) : 0)} <span class="muted" style="margin-left:6px">${short(nw(i) - (i ? nw(i - 1) : 0))} vs prior</span></div></div>
    <div class="card c-4 kpi"><div class="label">Quick fill${CTX.CAN_WRITE ? '' : ' · view only'}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" id="copyAll">${icon('undo')}<span>Carry forward blanks</span></button><button class="btn" id="pasteBtn">${icon('file')}<span>Paste values</span></button></div><div class="muted" style="font-size:11.5px;margin-top:8px">Saved as you type · loans here are statement balances</div></div>
    ${groups.map(g => `<div class="card c-6"><div class="card-h"><div><h3>${g}</h3><div class="sub">${short(sum(VA.filter(a => a.group === g).map(a => a.v[i] ?? a.v[i - 1] ?? 0)))}${g === 'Debt' ? ' owed' : ''}${VA.some(a => a.group === g && a.v[i] == null) ? ' · incl. last month for blanks' : ''}</div></div></div>
      ${VA.map(a => a.group !== g ? '' : `<div class="bal-row ${a.v[i] == null ? 'empty' : ''} ${a.active === false ? 'inact' : ''}" data-k="${kOf(a)}">
        <div class="bal-nm"><div class="nm">${esc(a.name)}${a.active === false ? ' <span class="chip">Inactive</span>' : ''}</div><div class="ds">${esc(a.inst)} · last ${a.v[i - 1] != null ? short(a.v[i - 1]) : '—'}${a.kind === 'account' && ['Investing', 'Retirement', 'College'].includes(a.group) && CTX.CAN_WRITE ? ` · <button class="link" data-act="${kOf(a)}">${a.rollup ? 'By account' : 'Split into accounts'}</button>` : ''}</div></div>
        <div class="bal-sp hide-sm">${spark(a.v.slice(Math.max(0, i - 11), i + 1).map((v, j, arr) => v ?? arr[j - 1] ?? 0), g === 'Debt' ? 'var(--s5)' : 'var(--s1)', 70, 26, false)}</div>
        <div class="bal-in"><span>$</span><input class="in num balIn" ${a.rollup ? 'readonly title="Sum of the accounts under it — use Activity by account"' : ''} inputmode="decimal" placeholder="${a.v[i - 1] != null ? Math.round(a.v[i - 1]).toLocaleString() : '0'}" value="${a.v[i] != null ? a.v[i].toLocaleString('en-US', {maximumFractionDigits: 2}) : ''}"></div>
        <div class="bal-ch num">${a.v[i] != null && a.v[i - 1] ? `<span class="${(a.v[i] - a.v[i - 1]) * signOf(a) >= 0 ? 'pos' : 'neg'}">${pct((a.v[i] - a.v[i - 1]) / a.v[i - 1], 1)}</span>` : a.v[i] == null ? '<span class="tag new">Due</span>' : ''}</div>${a.kind === 'account' && CTX.CAN_WRITE ? `<button class="mini-btn bal-hide" data-hide="${kOf(a)}" title="${a.active === false ? 'Mark active' : 'Mark inactive (hide)'}">${icon(a.active === false ? 'eye' : 'eyeOff')}</button>` : ''}</div>`).join('')}</div>`).join('')}
  </div>` : gridHTML()}`;
  $$('#balSeg button').forEach(b => b.onclick = () => { balView = b.dataset.k; render(); });
  if ($('#bmPrev')) { $('#bmPrev').onclick = () => { balM--; render(); }; $('#bmNext').onclick = () => { balM++; render(); }; }
  const parse = s => { const v = String(s).replace(/[$,\s]/g, ''); return v === '' ? null : +v; };
  $$('.balIn', pg).forEach(inp => { inp.onchange = () => { const a = B.accounts[+inp.closest('.bal-row').dataset.k]; a.v[i] = parse(inp.value); render(); }; inp.onkeydown = e => { if (e.key === 'Enter') { const all = $$('.balIn', pg), n = all.indexOf(inp); inp.blur(); setTimeout(() => $$('.balIn')[n + 1]?.focus(), 30); } }; });
  $$('.cell', pg).forEach(c => {
    c.onchange = () => { B.accounts[+c.dataset.k].v[+c.dataset.j] = parse(c.value);
      setTimeout(() => { const f = document.activeElement, k = f?.classList?.contains('cell') ? [f.dataset.k, f.dataset.j] : null;   // keep Tab / click target after redraw
        render(); if (k) { const n = $(`.cell[data-k="${k[0]}"][data-j="${k[1]}"]`); if (n) { n.focus(); n.select(); } } }, 0); };
    c.onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const col = $$(`.cell[data-j="${c.dataset.j}"]`, pg), n = col[col.indexOf(c) + 1]; (n || c).focus(); n?.select(); };   // Enter = down
  });
  if ($('#copyAll')) $('#copyAll').onclick = () => { const was = B.accounts.map(a => a.v[i]); B.accounts.forEach(a => { if (a.v[i] == null && a.v[i - 1] != null) a.v[i] = a.v[i - 1]; }); render(); toast('Carried forward last month for blanks', () => { B.accounts.forEach((a, k) => a.v[i] = was[k]); render(); }); };
  if ($('#pasteBtn')) $('#pasteBtn').onclick = () => openPaste(i);
  $('#addAcct').onclick = openAddAccount;
  $('#balInact').onchange = e => { balInactive = e.target.checked; render(); };
  $$('[data-hide]', pg).forEach(b => b.onclick = () => { const a = B.accounts[+b.dataset.hide]; a.active = a.active === false; render(); toast(a.active ? `${a.name} is active again` : `${a.name} hidden · tick “Show inactive” to see it`, () => { a.active = !a.active; render(); }); });
  $$('[data-act]', pg).forEach(b => b.onclick = () => openActivity(B.accounts[+b.dataset.act], i));
  if (typeof wireChecks === 'function') wireChecks(pg);
}
function openPaste(i) {
  const m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Paste balances</h2><p class="muted" style="font-size:12.5px">One per line: <code>Account name, balance</code> — or paste a column straight from a spreadsheet in account order.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <textarea class="in" id="pasteTa" rows="9" style="width:100%;height:auto;padding:12px;font-family:ui-monospace,monospace" placeholder="Charles Schwab, 2,301,550.12\nTyler's 401(k), 631,200\nExpedition loan, 50,210"></textarea>
  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="pasteGo">Apply to ${mLabel(ST.bal.months[i])}</button></div>`;
  openLayer('modal');
  $('#pasteGo').onclick = () => {
    let n = 0; const lines = $('#pasteTa').value.split(/\n/).map(l => l.trim()).filter(Boolean);
    lines.forEach((l, k) => { const mm = l.match(/^(.*?)[,\t]\s*\$?([\d,.\-]+)$/); const a = mm ? ST.bal.accounts.find(x => x.name.toLowerCase().startsWith(mm[1].trim().toLowerCase().slice(0, 6))) : ST.bal.accounts[k]; const v = +(mm ? mm[2] : l).replace(/[$,]/g, ''); if (a && !isNaN(v)) { a.v[i] = v; n++; } });
    closeAll(); render(); toast(`Updated ${n} balances`);
  };
}
function openAddAccount() {
  const m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Add account or source</h2><p class="muted" style="font-size:12.5px">Anything with a month-end value — accounts, property, vehicles, loans, private holdings.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="form">
    <div style="grid-column:1/-1"><label>Name</label><input class="in" id="aName" placeholder="e.g. Fidelity Roth IRA"></div>
    <div><label>Institution / source</label><input class="in" id="aInst" placeholder="Fidelity"></div>
    <div><label>Type</label><select class="in" id="aGrp">${BGROUPS.map(g => `<option>${g}</option>`).join('')}</select></div>
    <div><label>Update cadence</label><select class="in" id="aCad"><option>Monthly</option><option>Quarterly</option><option>Annually</option></select></div>
    <div style="grid-column:1/-1" class="muted">Property and vehicles go on Assets; loans with a schedule go on Loans.</div>
    <div><label>Starting month</label><select class="in" id="aStart">${ST.bal.months.map((mm, j) => `<option value="${j}" ${j === ST.bal.months.length - 2 ? 'selected' : ''}>${mLabel(mm)}</option>`).join('')}</select></div>
    <div><label>Opening balance</label><input class="in num" id="aBal" inputmode="decimal" placeholder="$0"></div>
    <div><label>Counts toward</label><select class="in" id="aIn"><option value="nw">Net worth</option><option value="inv">Net worth & investable</option><option value="track">Track only</option></select></div>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="aGo">Add account</button></div>`;
  openLayer('modal');
  $('#aGo').onclick = () => { const n = $('#aName').value.trim(); if (!n) return $('#aName').focus();
    const v = Array(ST.bal.months.length).fill(null); const b = $('#aBal').value.replace(/[$,]/g, ''); if (b) v[+$('#aStart').value] = +b;
    if (ST.bal.accounts.some(a => a.name.toLowerCase() === n.toLowerCase())) return toast('An account with that name already exists');
    ST.bal.accounts.push({name: n, group: $('#aGrp').value, inst: $('#aInst').value || $('#aGrp').value, v, kind: 'account', id: null, cadence: $('#aCad').value, in: $('#aIn').value}); closeAll(); render(); toast(`Added ${n}`); };
}

/* =====================================================================
   BUDGET BUILDER — 12-month plan per category (optional sub-budgets)
   ===================================================================== */
let byYear = CY; const bbOpen = new Set();
function seasonal(cat, sub) { // monthly shape from last year's actuals
  const v = MON.map((_, i) => { const {A, S} = actuals(PY, i + 1, i + 1); return Math.abs(sub ? (S[cat + '|' + sub] || 0) : (A[cat] || 0)); });
  const t = sum(v); return t ? v.map(x => x / t) : Array(12).fill(1 / 12);
}
function createBudget(y, how) {
  const src = ST.budget[y - 1] || {}, out = {};
  ST.cats.filter(c => c.group !== 'TTS').forEach(c => {
    const sign = c.group === 'Income' ? 1 : -1;
    if (how === 'copy') out[c.name] = (src[c.name] || Array(12).fill(0)).slice();
    else if (how === 'blank') out[c.name] = Array(12).fill(0);
    else { const yy = Math.min(y - 1, CY), mm = yy === CY ? ASOF.m : 12; const {A} = actuals(yy, 1, mm); const annual = (A[c.name] || 0) / mm * 12;
      out[c.name] = how === 'runrate' ? Array(12).fill(Math.round(annual / 12)) : seasonal(c.name).map(p => Math.round(annual * p)); }
    if (sign < 0) out[c.name] = out[c.name].map(v => -Math.abs(v)); else out[c.name] = out[c.name].map(v => Math.abs(v));
  });
  ST.budget[y] = out; ST.subBudget[y] = how === 'copy' ? JSON.parse(JSON.stringify(ST.subBudget[y - 1] || {})) : {};
}
function renderBuilder(pg) {
  const years = [PY, CY, CY + 1].filter(y => y >= CY || ST.budget[y]);
  const B = ST.budget[byYear];
  const yearSeg = `<div class="seg" id="bySeg">${years.map(y => `<button data-y="${y}" class="${y === byYear ? 'on' : ''}">${y}${!ST.budget[y] ? ' +' : ''}</button>`).join('')}</div>`;
  if (!B) {
    pg.innerHTML = `<div class="toolbar">${yearSeg}</div><div class="card" style="max-width:760px"><div class="card-h"><div><h3>Create the ${byYear} budget</h3><div class="sub">Pick a starting point — every cell stays editable afterwards</div></div></div>
      <div class="opt-grid">${[['copy', 'Copy ' + (byYear - 1) + ' budget', 'Same monthly amounts, including seasonal lines like Tax and Lawn'], ['seasonal', 'Actuals, seasonal', `${Math.min(byYear - 1, CY)} run-rate spread by each category's ${PY} monthly pattern`], ['runrate', 'Actuals, flat', `${byYear - 1} year-to-date average × 12, even each month`], ['blank', 'Start blank', 'Zero everywhere; build up line by line']].map(([k, t, d]) => `<button class="opt" data-k="${k}"><b>${t}</b><span>${d}</span></button>`).join('')}</div></div>`;
    $$('#bySeg button').forEach(b => b.onclick = () => { byYear = +b.dataset.y; render(); });
    $$('.opt', pg).forEach(b => b.onclick = () => { createBudget(byYear, b.dataset.k); render(); toast(`${byYear} budget created`); });
    return;
  }
  const SB = ST.subBudget[byYear];
  const rowVals = c => { const sb = subBudgetRows(byYear, c); return sb.length ? MON.map((_, i) => sum(sb.map(r => r.v[i] || 0))) : (B[c] || Array(12).fill(0)); };
  const grpTot = g => MON.map((_, i) => sum(ST.cats.filter(c => c.group === g).map(c => rowVals(c.name)[i])));
  const inc = grpTot('Income'), ex = MON.map((_, i) => grpTot('Fixed Expense')[i] + grpTot('Variable Expense')[i]), net = MON.map((_, i) => inc[i] + ex[i]);
  const f = v => v ? Math.round(v).toLocaleString('en-US') : '';
  const cellRow = (vals, attrs, ro) => vals.map((v, i) => `<td>${ro ? `<span class="ro num">${f(v)}</span>` : `<input class="cell num" ${attrs} data-i="${i}" value="${f(v)}" placeholder="0">`}</td>`).join('');
  let h = `<tr><th class="stick">Category</th>${MON.map(m => `<th>${m}</th>`).join('')}<th>Total</th><th></th></tr>`;
  GROUPS.filter(g => g.k !== 'TTS').forEach(g => {
    h += `<tr class="grp"><td class="stick" colspan="15">${g.l}</td></tr>`;
    ST.cats.filter(c => c.group === g.k).forEach(c => {
      const sbs = subBudgetRows(byYear, c.name), vals = rowVals(c.name), open = bbOpen.has(c.name);
      h += `<tr class="${sbs.length ? 'has-sub' : ''}"><td class="stick"><span class="tw">${c.subs.length ? `<button class="chev ${open ? 'on' : ''}" data-tg="${esc(c.name)}">${icon('chev', 2.4)}</button>` : '<span class="chev-sp"></span>'}${esc(c.name)}</span></td>${cellRow(vals, `data-c="${esc(c.name)}"`, sbs.length)}<td class="num b">${f(sum(vals))}</td><td><button class="mini-btn" data-menu="${esc(c.name)}">${icon('more')}</button></td></tr>`;
      if (open) c.subs.forEach(s => { const v = SB[c.name + '|' + s]; h += `<tr class="subr"><td class="stick"><span class="tw sub-name">${esc(s)}</span></td>${v ? cellRow(v, `data-c="${esc(c.name)}" data-s="${esc(s)}"`) : `<td colspan="12" style="text-align:left;padding-left:12px"><button class="link" data-addsub="${esc(c.name)}|${esc(s)}">+ Budget this sub-category separately</button></td>`}<td class="num">${v ? f(sum(v)) : ''}</td><td>${v ? `<button class="mini-btn" data-rmsub="${esc(c.name)}|${esc(s)}">${icon('close')}</button>` : ''}</td></tr>`; });
    });
    h += `<tr class="tot"><td class="stick">Total ${g.l.toLowerCase()}</td>${grpTot(g.k).map(v => `<td class="num">${f(v)}</td>`).join('')}<td class="num">${f(sum(grpTot(g.k)))}</td><td></td></tr>`;
  });
  h += `<tr class="tot net"><td class="stick">Net</td>${net.map(v => `<td class="num ${v < 0 ? 'neg' : 'pos'}">${f(v)}</td>`).join('')}<td class="num ${sum(net) < 0 ? 'neg' : 'pos'}">${f(sum(net))}</td><td></td></tr>`;
  pg.innerHTML = `<div class="toolbar wrap">${yearSeg}<span class="muted" style="font-size:12px">Signed: income positive, expenses negative · type a number, Tab to the next month</span>
    <div style="margin-left:auto;display:flex;gap:8px"><button class="btn" onclick="openCatModal()">${icon('plus')}<span>New category</span></button></div></div>
  <div class="grid g-12">
    <div class="card c-3 kpi"><div class="label">Planned income</div><div class="val num">${short(sum(inc))}</div></div>
    <div class="card c-3 kpi"><div class="label">Planned spending</div><div class="val num">${short(sum(ex))}</div><div class="delta">${short(sum(ex) / 12)}/mo avg</div></div>
    <div class="card c-6"><div class="card-h" style="margin-bottom:4px"><div><h3>Monthly net</h3><div class="sub">Updates as you type</div></div><div class="right num ${sum(net) < 0 ? 'neg' : 'pos'}" style="font-weight:700">${short(sum(net))} / yr</div></div><div class="chart" id="bbChart"></div></div>
    <div class="card c-12" style="padding:10px 0 4px"><div class="scroll-x"><table class="table bb">${h}</table></div></div>
  </div>
  <div class="menu" id="rowMenu"></div>`;
  $$('#bySeg button').forEach(b => b.onclick = () => { byYear = +b.dataset.y; render(); });
  $$('.bb .chev', pg).forEach(b => b.onclick = () => { const k = b.dataset.tg; bbOpen.has(k) ? bbOpen.delete(k) : bbOpen.add(k); render(); });
  $$('.bb input.cell', pg).forEach(inp => {
    inp.onfocus = () => inp.select();
    inp.onchange = () => { const v = +(inp.value.replace(/[$,\s]/g, '')) || 0, c = inp.dataset.c, s = inp.dataset.s, i = +inp.dataset.i; const sign = groupOf(c) === 'Income' ? 1 : -1; const val = inp.value.trim().startsWith('-') || inp.value.trim().startsWith('+') ? v : sign * Math.abs(v);
      if (s) SB[c + '|' + s][i] = val; else B[c][i] = val; const ae = document.activeElement, sel = ae && ae.dataset ? [ae.dataset.c, ae.dataset.s, ae.dataset.i] : null; render(); if (sel) { const n = $$('.bb input.cell').find(x => x.dataset.c === sel[0] && x.dataset.s === sel[1] && x.dataset.i === sel[2]); n && n.focus(); } };
  });
  $$('[data-addsub]', pg).forEach(b => b.onclick = () => { const [c, s] = b.dataset.addsub.split('|'); const cur = rowVals(c); const subsActive = subBudgetRows(byYear, c).length; SB[c + '|' + s] = subsActive ? Array(12).fill(0) : cur.slice(); render(); });
  $$('[data-rmsub]', pg).forEach(b => b.onclick = () => { delete SB[b.dataset.rmsub]; render(); });
  const menu = $('#rowMenu');
  $$('[data-menu]', pg).forEach(b => b.onclick = e => { e.stopPropagation(); const c = b.dataset.menu, r = b.getBoundingClientRect();
    menu.innerHTML = [['fill', 'Fill Jan across all months'], ['annual', 'Set annual total & spread evenly'], ['season', 'Spread by ' + PY + ' seasonality'], ['actual', 'Use ' + (byYear - 1) + ' run-rate'], ['zero', 'Clear row']].map(([k, l]) => `<button data-a="${k}">${l}</button>`).join('') + '<div class="menu-in" hidden><input class="in" placeholder="Annual total"><button class="btn primary">Set</button></div>';
    menu.style.top = (r.bottom + 4) + 'px'; menu.style.left = Math.max(8, r.right - 250) + 'px'; menu.classList.add('on');
    const sign = groupOf(c) === 'Income' ? 1 : -1, row = B[c], cur = rowVals(c);
    $$('button[data-a]', menu).forEach(x => x.onclick = ev => { ev.stopPropagation(); const a = x.dataset.a;
      if (a === 'annual') { const box = $('.menu-in', menu); box.hidden = false; const inp = $('input', box); inp.value = Math.round(Math.abs(sum(cur))); inp.focus(); inp.select(); $('button', box).onclick = () => { const t = +inp.value.replace(/[$,]/g, '') || 0; for (let i = 0; i < 12; i++) row[i] = sign * Math.round(t / 12); menu.classList.remove('on'); render(); }; return; }
      const tot = Math.abs(sum(cur));
      if (a === 'fill') for (let i = 1; i < 12; i++) row[i] = row[0];
      if (a === 'season') { const p = seasonal(c); for (let i = 0; i < 12; i++) row[i] = sign * Math.round(tot * p[i]); }
      if (a === 'actual') { const yy = Math.min(byYear - 1, CY), mm = yy === CY ? ASOF.m : 12; const {A} = actuals(yy, 1, mm); const ann = Math.abs(A[c] || 0) / mm * 12; for (let i = 0; i < 12; i++) row[i] = sign * Math.round(ann / 12); }
      if (a === 'zero') row.fill(0);
      menu.classList.remove('on'); render(); });
  });
  document.addEventListener('click', () => menu.classList.remove('on'), {once: true});
  CH.push(() => barChart($('#bbChart'), {labels: MON, series: [{name: 'Net', values: net, colorFn: v => v >= 0 ? 'var(--pos)' : 'var(--neg)'}], height: 120, padL: 46, ticks: 2, tipTitle: l => l + ' ' + byYear, tipExtra: i => tipRow(null, 'Income', money(inc[i])) + tipRow(null, 'Spending', money(ex[i]))}));
}

/* =====================================================================
   CATEGORIES — create, rename, merge, move, and mass-recategorize history
   ===================================================================== */
const MC = {q: '', fromCat: '*', fromSub: '*', d0: '', d1: '', toCat: '', toSub: '', rule: true};
const histCount = (cat, sub) => sub === undefined ? sum(Object.entries(ST.catCounts).filter(([k]) => k.split('|')[0] === cat).map(([, n]) => n)) : (ST.catCounts[cat + '|' + sub] || 0);
function snapshot() { return {cats: JSON.parse(JSON.stringify(ST.cats)), budget: JSON.parse(JSON.stringify(ST.budget)), sub: JSON.parse(JSON.stringify(ST.subBudget)), tx: ST.tx.map(t => [t.cat, t.sub, t.splits ? JSON.parse(JSON.stringify(t.splits)) : null]), cc: {...ST.catCounts}}; }
function restore(s) { ST.cats = s.cats; ST.budget = s.budget; ST.subBudget = s.sub; ST.catCounts = s.cc; ST.tx.forEach((t, i) => { [t.cat, t.sub] = s.tx[i]; if (s.tx[i][2]) t.splits = s.tx[i][2]; else delete t.splits; }); render(); }
function logChange(label, n, snap, srv) { const undo = snap ? () => { restore(snap); srv && srv(); } : null; ST.log.unshift({when: new Date(), label, n, undo}); toast(label, undo); }
function eachPiece(fn) { ST.tx.forEach(t => { fn(t); (t.splits || []).forEach(fn); }); }
function renameCat(oldN, newN) {
  const snap = snapshot(), n = histCount(oldN);
  catOf(oldN).name = newN; eachPiece(p => { if (p.cat === oldN) p.cat = newN; });
  for (const y in ST.budget) if (ST.budget[y][oldN]) { ST.budget[y][newN] = ST.budget[y][oldN]; delete ST.budget[y][oldN]; }
  for (const y in ST.subBudget) for (const k of Object.keys(ST.subBudget[y])) if (k.startsWith(oldN + '|')) { ST.subBudget[y][newN + k.slice(oldN.length)] = ST.subBudget[y][k]; delete ST.subBudget[y][k]; }
  for (const k of Object.keys(ST.catCounts)) if (k.split('|')[0] === oldN) { ST.catCounts[newN + k.slice(oldN.length)] = ST.catCounts[k]; delete ST.catCounts[k]; }
  logChange(`Renamed “${oldN}” → “${newN}” across ${n.toLocaleString()} transactions`, n, snap);
}
function mergeCat(from, into) {
  const snap = snapshot(), n = histCount(from), src = catOf(from), dst = catOf(into);
  src.subs.forEach(s => !dst.subs.includes(s) && dst.subs.push(s));
  eachPiece(p => { if (p.cat === from) p.cat = into; });
  for (const y in ST.budget) if (ST.budget[y][from]) { ST.budget[y][into] = (ST.budget[y][into] || Array(12).fill(0)).map((v, i) => v + ST.budget[y][from][i]); delete ST.budget[y][from]; }
  for (const k of Object.keys(ST.catCounts)) if (k.split('|')[0] === from) { const nk = into + k.slice(from.length); ST.catCounts[nk] = (ST.catCounts[nk] || 0) + ST.catCounts[k]; delete ST.catCounts[k]; }
  ST.cats = ST.cats.filter(c => c !== src);
  if (src.id && dst.id) DB.mergeCategory(src.id, dst.id);
  ST.excl.delete(from);
  logChange(`Merged “${from}” into “${into}” · ${n.toLocaleString()} transactions moved, budgets combined`, n, null);
}
function renameSub(cat, oldS, newS, toCat = cat) {
  const snap = snapshot(), n = histCount(cat, oldS);
  const c = catOf(cat), d = catOf(toCat);
  c.subs = c.subs.filter(s => s !== oldS); if (newS && !d.subs.includes(newS)) d.subs.push(newS);
  eachPiece(p => { if (p.cat === cat && (p.sub || '') === oldS) { p.cat = toCat; p.sub = newS; } });
  const ok = cat + '|' + oldS, nk = toCat + '|' + newS; ST.catCounts[nk] = (ST.catCounts[nk] || 0) + (ST.catCounts[ok] || 0); delete ST.catCounts[ok];
  for (const y in ST.subBudget) if (ST.subBudget[y][ok]) { if (newS && !ST.subBudget[y][nk]) ST.subBudget[y][nk] = ST.subBudget[y][ok]; delete ST.subBudget[y][ok]; }
  DB.moveSub(cat, oldS, toCat, newS);
  logChange(toCat !== cat ? `Moved “${oldS}” to ${toCat}${newS !== oldS ? ' as “' + newS + '”' : ''} · ${n} transactions` : newS ? `Renamed sub-category “${oldS}” → “${newS}” · ${n} transactions` : `Removed “${oldS}” · ${n} transactions now unassigned`, n, null);
}
/* ---- category order: arrows + drag, within each group; sub-categories within their category ---- */
let CAT_ORDER = false, CAT_DRAG = null;
function catOrderList() {
  const arrows = (k, up, dn) => `<span class="ord-btns"><button class="mini-btn" data-${k}="-1" ${up ? '' : 'disabled'} title="Move up">${icon('up')}</button><button class="mini-btn" data-${k}="1" ${dn ? '' : 'disabled'} title="Move down">${icon('down')}</button></span>`;
  return GROUPS.map(g => { const cs = ST.cats.filter(c => c.group === g.k); if (!cs.length) return '';
    return `<div class="ct-grp" style="display:flex;align-items:center">${g.l}<button class="link" data-az="${g.k}" style="margin-left:auto;text-transform:none;letter-spacing:0;font-weight:600">Sort A–Z</button></div>` + cs.map((c, i) => `<div class="ord-cat" draggable="true" data-oc="${esc(c.name)}">
      <div class="ord-row"><span class="ord-h" title="Drag">${icon('grip')}</span><b>${esc(c.name)}</b><span class="muted ct-n" style="margin-left:auto">${c.subs.length ? c.subs.length + ' sub' : ''}</span>${arrows('cm', i > 0, i < cs.length - 1)}</div>
      ${c.subs.length > 1 ? `<div class="ord-subs">${c.subs.map((s, j) => `<div class="ord-sub" data-os="${esc(s)}"><span>${esc(s)}</span>${arrows('sm', j > 0, j < c.subs.length - 1)}</div>`).join('')}<button class="link" data-saz="${esc(c.name)}" style="font-size:11.5px">Sort A–Z</button></div>` : ''}</div>`).join(''); }).join('');
}
function wireCatOrder(pg) {
  const catByEl = el => catOf(el.closest('[data-oc]').dataset.oc);
  const moveCat = (c, target, after) => { const a = ST.cats; a.splice(a.indexOf(c), 1); a.splice(a.indexOf(target) + (after ? 1 : 0), 0, c); render(); };
  $$('[data-cm]', pg).forEach(b => b.onclick = () => { const c = catByEl(b), same = ST.cats.filter(x => x.group === c.group), t = same[same.indexOf(c) + +b.dataset.cm]; if (t) moveCat(c, t, +b.dataset.cm > 0); });
  $$('[data-sm]', pg).forEach(b => b.onclick = () => { const c = catByEl(b), s = b.closest('[data-os]').dataset.os, i = c.subs.indexOf(s), j = i + +b.dataset.sm; if (j < 0 || j >= c.subs.length) return; c.subs.splice(i, 1); c.subs.splice(j, 0, s); render(); });
  $$('[data-az]', pg).forEach(b => b.onclick = () => { const g = b.dataset.az, was = ST.cats.slice(), sorted = ST.cats.filter(c => c.group === g).sort((x, y) => x.name.localeCompare(y.name)); let k = 0; ST.cats = ST.cats.map(c => c.group === g ? sorted[k++] : c); render(); toast('Sorted A–Z', () => { ST.cats = was; render(); }); });
  $$('[data-saz]', pg).forEach(b => b.onclick = () => { const c = catOf(b.dataset.saz), was = c.subs.slice(); c.subs.sort((x, y) => x.localeCompare(y)); render(); toast('Sorted A–Z', () => { c.subs = was; render(); }); });
  // drag & drop (desktop): drop on another category in the same group
  $$('.ord-cat', pg).forEach(el => {
    el.ondragstart = e => { CAT_DRAG = el.dataset.oc; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', CAT_DRAG); };
    el.ondragend = () => { CAT_DRAG = null; $$('.ord-cat', pg).forEach(x => x.classList.remove('dragging', 'drop-a', 'drop-b')); };
    el.ondragover = e => { const src = CAT_DRAG && catOf(CAT_DRAG), t = catOf(el.dataset.oc); if (!src || src === t || src.group !== t.group) return; e.preventDefault();
      const r = el.getBoundingClientRect(), after = e.clientY > r.top + Math.min(r.height, 44) / 2; el.classList.toggle('drop-a', after); el.classList.toggle('drop-b', !after); };
    el.ondragleave = () => el.classList.remove('drop-a', 'drop-b');
    el.ondrop = e => { e.preventDefault(); const src = catOf(CAT_DRAG), t = catOf(el.dataset.oc); if (src && t && src !== t && src.group === t.group) moveCat(src, t, el.classList.contains('drop-a')); };
  });
}
function renderCats(pg) {
  const ytd = actuals(CY, 1, ASOF.m);
  const matches = mcMatches();
  pg.innerHTML = `<div class="toolbar"><span class="muted" style="font-size:12.5px">Changes apply to every transaction since ${Y.years[0]}, your budgets, and future import matching</span><button class="btn primary" style="margin-left:auto" onclick="openCatModal()">${icon('plus')}<span>New category</span></button></div>
  <div class="grid g-12">
    <div class="card c-7"><div class="card-h"><div><h3>Categories</h3><div class="sub">${CAT_ORDER ? 'Drag a row or use the arrows · this order is used in budgets, reports and every category list' : `${ST.cats.length} categories · ${sum(ST.cats.map(c => c.subs.length))} sub-categories`}</div></div>
      ${CTX.CAN_WRITE ? `<div class="right"><button class="btn ${CAT_ORDER ? 'primary' : ''}" id="catOrd">${CAT_ORDER ? 'Done' : icon('sort') + '<span>Reorder</span>'}</button></div>` : ''}</div>
      ${CAT_ORDER ? catOrderList() : GROUPS.map(g => `<div class="ct-grp">${g.l}</div>` + ST.cats.filter(c => c.group === g.k).map(c => `<details class="ct" ${c.name === MC.openCat ? 'open' : ''}><summary><span class="chev">${icon('chev', 2.4)}</span><b>${esc(c.name)}</b><span class="muted ct-n">${histCount(c.name).toLocaleString()} txns · ${short(Math.abs(ytd.A[c.name] || 0))} YTD</span>
        <span class="ct-act"><button class="mini-btn" title="Rename" data-ren="${esc(c.name)}">${icon('edit')}</button><button class="mini-btn" title="Merge into…" data-mrg="${esc(c.name)}">${icon('merge')}</button></span></summary>
        <div class="ct-subs">${c.subs.map(s => `<div class="ct-sub"><span>${esc(s)}</span><span class="muted ct-n">${histCount(c.name, s).toLocaleString()}</span><span class="ct-act"><button class="mini-btn" title="Rename / move" data-rsub="${esc(c.name)}|${esc(s)}">${icon('edit')}</button><button class="mini-btn" title="Remove" data-dsub="${esc(c.name)}|${esc(s)}">${icon('trash')}</button></span></div>`).join('')}
        <button class="link" data-nsub="${esc(c.name)}">+ Add sub-category</button></div></details>`).join('')).join('')}
    </div>
    <div class="c-5" style="display:flex;flex-direction:column;gap:18px;min-width:0">
      <div class="card"><div class="card-h"><div><h3>Mass recategorize</h3><div class="sub">Find transactions across history, then move them</div></div></div>
        <div class="form one">
          <div><label>Description contains</label><input class="in" id="mcQ" value="${esc(MC.q)}" placeholder="e.g. HOME DEPOT"></div>
          <div class="two"><div><label>Currently in</label><select class="in" id="mcFC">${catOptions(MC.fromCat, {any: true})}</select></div><div><label>&nbsp;</label><select class="in" id="mcFS">${MC.fromCat === '*' ? '<option value="*">Any sub-category</option>' : subOptions(MC.fromCat, MC.fromSub, {any: true})}</select></div></div>
          <div class="two"><div><label>From</label><input class="in" type="month" id="mcD0" value="${MC.d0}"></div><div><label>To</label><input class="in" type="month" id="mcD1" value="${MC.d1}"></div></div>
          <div class="arrow-sep">${icon('chev', 2.4)}</div>
          <div class="two"><div><label>Move to</label><select class="in" id="mcTC">${catOptions(MC.toCat, {blank: 'Choose…'})}</select></div><div><label>&nbsp;</label><select class="in" id="mcTS">${subOptions(MC.toCat, MC.toSub)}</select></div></div>
          <label class="tgl"><input type="checkbox" id="mcRule" ${MC.rule ? 'checked' : ''}> Also use this for future imports</label>
        </div>
        <div class="mc-prev"><b class="num">${matches.list.length.toLocaleString()}</b> loaded matches · ${money(sum(matches.list.map(t => t.amt)))}${matches.hist != null ? ` · <b class="num">${matches.hist.toLocaleString()}</b> across full history` : ''}
          <div class="list">${matches.list.slice(0, 5).map(t => txLi(t)).join('')}</div></div>
        <button class="btn primary" id="mcGo" style="width:100%;justify-content:center;margin-top:12px" ${matches.list.length && MC.toCat ? '' : 'disabled style="opacity:.45;width:100%;justify-content:center;margin-top:12px"'}>Move ${matches.list.length.toLocaleString()} transactions</button></div>
      <div class="card"><div class="card-h"><div><h3>Change history</h3><div class="sub">Recent bulk changes · recategorizations can be undone</div></div></div>
        ${ST.log.length ? `<div class="list">${ST.log.slice(0, 8).map((l, i) => `<div class="li"><div style="min-width:0"><div class="nm" style="font-size:13px">${esc(l.label)}</div><div class="ds">${l.when.toDateString() === new Date().toDateString() ? l.when.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : l.when.toLocaleDateString()}</div></div>${l.undo ? `<button class="btn" data-undo="${i}" style="height:30px;margin-left:auto">${icon('undo')}<span>Undo</span></button>` : ''}</div>`).join('')}</div>` : '<p class="muted" style="font-size:12.5px">No bulk changes yet.</p>'}</div>
    </div></div>`;
  const keep = id => { const el = $(id); const pos = el.selectionStart; render(); const n = $(id); n.focus(); if (pos != null && n.setSelectionRange) n.setSelectionRange(pos, pos); };
  let qt; $('#mcQ').oninput = e => { MC.q = e.target.value; clearTimeout(qt); qt = setTimeout(() => keep('#mcQ'), 250); };
  $('#mcFC').onchange = e => { MC.fromCat = e.target.value; MC.fromSub = '*'; render(); };
  $('#mcFS').onchange = e => { MC.fromSub = e.target.value; render(); };
  $('#mcD0').onchange = e => { MC.d0 = e.target.value; render(); }; $('#mcD1').onchange = e => { MC.d1 = e.target.value; render(); };
  wireCatSub($('#mcTC'), $('#mcTS'), () => { MC.toCat = $('#mcTC').value; MC.toSub = $('#mcTS')?.value === '__new' ? '' : ($('#mcTS')?.value || ''); render(); });
  $('#mcRule').onchange = e => MC.rule = e.target.checked;
  $('#mcGo').onclick = () => { if (!MC.toCat || !matches.list.length) return; const snap = snapshot(); matches.list.forEach(t => { t.cat = MC.toCat; t.sub = MC.toSub; delete t.splits; });
    if (MC.rule && MC.q) [...new Set(matches.list.map(t => normDesc(t.desc)))].forEach(k => ST.userRules[k] = {cat: MC.toCat, sub: MC.toSub});
    const p = DB.bulkRecat({contains: MC.q.trim(), fromCat: MC.fromCat, fromSub: MC.fromSub, d0: MC.d0, d1: MC.d1}, MC.toCat, MC.toSub, MC.rule && !!MC.q.trim());
    p.then(r => { if (r.n > matches.list.length) toast(`Moved ${r.n.toLocaleString()} transactions across full history`); });
    logChange(`Moved ${matches.hist ?? matches.list.length} “${MC.q || MC.fromCat}” transactions → ${MC.toCat}${MC.toSub ? ' · ' + MC.toSub : ''}`, matches.list.length, snap, () => p.then(r => r.logId && DB.undoChange(r.logId))); MC.q = ''; render(); };
  $$('[data-undo]', pg).forEach(b => b.onclick = () => { const l = ST.log.splice(+b.dataset.undo, 1)[0]; l.undo(); render(); });
  $$('[data-ren]', pg).forEach(b => b.onclick = e => { e.preventDefault(); openCatModal({rename: b.dataset.ren}); });
  $$('[data-mrg]', pg).forEach(b => b.onclick = e => { e.preventDefault(); openCatModal({merge: b.dataset.mrg}); });
  $$('[data-rsub]', pg).forEach(b => b.onclick = () => { const [c, s] = b.dataset.rsub.split('|'); openCatModal({rsub: [c, s]}); });
  $$('[data-dsub]', pg).forEach(b => b.onclick = () => { const [c, s] = b.dataset.dsub.split('|'); MC.openCat = c; renameSub(c, s, ''); render(); });
  $$('[data-nsub]', pg).forEach(b => b.onclick = () => openCatModal({nsub: b.dataset.nsub}));
  if ($('#catOrd')) $('#catOrd').onclick = () => { CAT_ORDER = !CAT_ORDER; render(); };
  if (CAT_ORDER) wireCatOrder(pg);
  $$('details.ct', pg).forEach(d => d.ontoggle = () => { if (d.open) MC.openCat = $('b', d).textContent; });
}
function mcMatches() {
  const q = MC.q.trim().toUpperCase();
  if (!q && MC.fromCat === '*') return {list: [], hist: null};
  const list = ST.tx.filter(t => (!q || t.desc.toUpperCase().includes(q)) && (MC.fromCat === '*' || (t.cat || '') === MC.fromCat) && (MC.fromSub === '*' || (t.sub || '') === MC.fromSub) && (!MC.d0 || t.d.slice(0, 7) >= MC.d0) && (!MC.d1 || t.d.slice(0, 7) <= MC.d1));
  let hist = null;
  if (q && !MC.d0 && !MC.d1) { const keys = Object.keys(RULES).filter(k => k.includes(normDesc(q))); hist = 0; keys.forEach(k => RULES[k].forEach(([c, s, w, n]) => { if ((MC.fromCat === '*' || c === MC.fromCat) && (MC.fromSub === '*' || s === MC.fromSub)) hist += n; })); hist = Math.max(hist, list.length); }
  else if (!q && !MC.d0 && !MC.d1) hist = MC.fromSub === '*' ? histCount(MC.fromCat) : histCount(MC.fromCat, MC.fromSub);
  return {list, hist};
}
function openCatModal(o = {}) {
  const m = $('#modal'); m.classList.remove('wide');
  const head = (t, s) => `<div class="dh"><div><h2 style="font-size:20px">${t}</h2>${s ? `<p class="muted" style="font-size:12.5px">${s}</p>` : ''}</div><button class="x" onclick="closeAll()">${icon('close')}</button></div>`;
  const foot = l => `<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="cmGo">${l}</button></div>`;
  if (o.rename) m.innerHTML = head(`Rename “${esc(o.rename)}”`, `Updates ${histCount(o.rename).toLocaleString()} transactions, all budgets and import rules.`) + `<div class="form one"><div><label>New name</label><input class="in" id="cmN" value="${esc(o.rename)}"></div><div><label>Group</label><select class="in" id="cmG">${GROUPS.map(g => `<option value="${g.k}" ${g.k === groupOf(o.rename) ? 'selected' : ''}>${g.l}</option>`).join('')}</select></div></div>` + foot('Rename everywhere');
  else if (o.merge) m.innerHTML = head(`Merge “${esc(o.merge)}”`, `Moves ${histCount(o.merge).toLocaleString()} transactions and its sub-categories, adds its budget to the target, then removes it.`) + `<div class="form one"><div><label>Merge into</label><select class="in" id="cmT">${catOptions('', {blank: 'Choose…'}).replace(`<option>${esc(o.merge)}</option>`, '')}</select></div></div>` + foot('Merge');
  else if (o.rsub) m.innerHTML = head(`Edit “${esc(o.rsub[1])}”`, `${histCount(o.rsub[0], o.rsub[1]).toLocaleString()} transactions in ${esc(o.rsub[0])}.`) + `<div class="form one"><div><label>Name</label><input class="in" id="cmN" value="${esc(o.rsub[1])}"></div><div><label>Parent category</label><select class="in" id="cmT">${catOptions(o.rsub[0])}</select></div></div>` + foot('Apply to history');
  else if (o.nsub) m.innerHTML = head(`New sub-category in ${esc(o.nsub)}`) + `<div class="form one"><div><label>Name</label><input class="in" id="cmN" placeholder="e.g. Piano lessons"></div></div>` + foot('Add');
  else m.innerHTML = head('New category', 'Shows up in budgets, imports and reports right away.') + `<div class="form one"><div><label>Name</label><input class="in" id="cmN" placeholder="e.g. Kids activities"></div><div><label>Group</label><select class="in" id="cmG">${GROUPS.filter(g => g.k !== 'TTS').map(g => `<option value="${g.k}" ${g.k === 'Variable Expense' ? 'selected' : ''}>${g.l}</option>`).join('')}</select></div><div><label>Sub-categories <span class="muted">(optional, comma-separated)</span></label><input class="in" id="cmS" placeholder="Soccer, Hockey, Camps"></div><div><label>Monthly budget</label><input class="in num" id="cmB" inputmode="decimal" placeholder="$0"></div></div>` + foot('Create category');
  openLayer('modal'); setTimeout(() => $('#cmN')?.focus(), 50);
  $('#cmGo').onclick = () => {
    const n = $('#cmN')?.value.trim();
    if (o.rename) { if (n && n !== o.rename && catOf(n)) return toast('A category with that name already exists'); if (n && n !== o.rename) { renameCat(o.rename, n); if (ST.excl.has(o.rename)) { ST.excl.delete(o.rename); ST.excl.add(n); } } catOf(n || o.rename).group = $('#cmG').value; }
    else if (o.merge) { const t = $('#cmT').value; if (!t) return; mergeCat(o.merge, t); }
    else if (o.rsub) { const t = $('#cmT').value; if (!n || !t) return; MC.openCat = t; renameSub(o.rsub[0], o.rsub[1], n, t); }
    else if (o.nsub) { if (!n) return; catOf(o.nsub).subs.push(n); MC.openCat = o.nsub; toast(`Added ${n}`); }
    else { if (!n || catOf(n)) return $('#cmN').focus(); const g = $('#cmG').value, b = +($('#cmB').value.replace(/[$,]/g, '')) || 0;
      ST.cats.push({name: n, group: g, subs: $('#cmS').value.split(',').map(s => s.trim()).filter(Boolean)});
      for (const y in ST.budget) ST.budget[y][n] = Array(12).fill(g === 'Income' ? b : -b); MC.openCat = n; toast(`Created ${n}`); }
    closeAll(); render();
  };
}

/* =====================================================================
   ACTUALS BY MONTH — any date range, months as columns (laid out like the Budget page)
   live transactions where they're loaded, the stored monthly history before that
   ===================================================================== */
const AR = (() => { const to = ymPlus(ym(CTX.TODAY), -1); return {from: ymPlus(to, -11), to, open: new Set()}; })();
function monthActuals(m) {
  if (m >= CTX.SINCE.slice(0, 7)) { const y = +m.slice(0, 4), mo = +m.slice(5, 7); return actuals(y, mo, mo); }
  const A = {...(DATA.monthly[m] || {})}, S = {};
  Object.entries(DATA.subMonthly[m] || {}).forEach(([k, v]) => { if (!ST.exclSub?.has(k)) S[k] = v; else A[k.split('|')[0]] = (A[k.split('|')[0]] || 0) - v; });
  return {A, S};
}
function renderActuals(pg, seg) {
  const first = Object.keys(DATA.monthly).sort()[0] || ymPlus(ym(CTX.TODAY), -24), lastM = ym(CTX.TODAY);
  const allM = ymRange(first, lastM).reverse();
  if (AR.from > AR.to) [AR.from, AR.to] = [AR.to, AR.from];
  let months = ymRange(AR.from, AR.to); const capped = months.length > 36; if (capped) months = months.slice(-36);
  const M = months.map(monthActuals);
  const subsOf = c => [...new Set(M.flatMap(r => Object.keys(r.S).filter(k => k.startsWith(c + '|')).map(k => k.split('|')[1])))];
  const f = v => Math.abs(v) < .5 ? '' : Math.round(v).toLocaleString('en-US');
  const cats = ST.cats.filter(c => c.group !== 'TTS' && !ST.excl.has(c.name));
  const catVals = c => M.map(r => r.A[c] || 0), subVals = (c, sb) => M.map(r => r.S[c + '|' + sb] || 0);
  const grpVals = g => M.map((_, i) => sum(cats.filter(c => c.group === g).map(c => M[i].A[c.name] || 0)));
  const inc = grpVals('Income'), ex = M.map((_, i) => grpVals('Fixed Expense')[i] + grpVals('Variable Expense')[i]), net = M.map((_, i) => inc[i] + ex[i]);
  const unc = M.map(r => r.A['Uncategorized'] || 0);
  const nM = months.length, cellsOf = vals => vals.map((v, i) => `<td class="num${v > 0 ? ' pos' : ''}" data-m="${months[i]}">${f(v)}</td>`).join('') + `<td class="num b">${f(sum(vals))}</td><td class="num muted">${f(sum(vals) / nM)}</td>`;
  let h = `<tr><th class="stick">Category</th>${months.map(m => `<th>${mShort(m)}</th>`).join('')}<th>Total</th><th>Avg / mo</th></tr>`; const HAS = [];
  GROUPS.filter(g => g.k !== 'TTS').forEach(g => {
    h += `<tr class="grp"><td class="stick" colspan="${nM + 3}">${g.l}</td></tr>`;
    cats.filter(c => c.group === g.k).forEach(c => { const v = catVals(c.name); if (v.every(x => Math.abs(x) < .5)) return;
      const subs = subsOf(c.name).filter(sb => subVals(c.name, sb).some(x => Math.abs(x) >= .5)), has = subs.length > 1 || (subs.length === 1 && subs[0] !== ''), open = has && AR.open.has(c.name); if (has) HAS.push(c.name);
      h += `<tr class="click" data-cat="${esc(c.name)}"><td class="stick"><span class="tw">${has ? `<button class="chev ${open ? 'on' : ''}" data-tg="${esc(c.name)}">${icon('chev', 2.4)}</button>` : '<span class="chev-sp"></span>'}${esc(c.name)}</span></td>${cellsOf(v)}</tr>`;
      if (open) subs.sort((p, q) => sum(subVals(c.name, p)) - sum(subVals(c.name, q))).forEach(sb => { h += `<tr class="subr click" data-cat="${esc(c.name)}" data-sub="${esc(sb)}"><td class="stick"><span class="tw sub-name">${sb ? esc(sb) : '<i class="muted">No sub-category</i>'}</span></td>${cellsOf(subVals(c.name, sb))}</tr>`; });
    });
    h += `<tr class="tot"><td class="stick">Total ${g.l.toLowerCase()}</td>${cellsOf(grpVals(g.k))}</tr>`;
  });
  if (unc.some(x => Math.abs(x) >= .5)) h += `<tr class="excl"><td class="stick">Uncategorized</td>${cellsOf(unc)}</tr>`;
  h += `<tr class="tot net"><td class="stick">Net${ST.excl.size ? ` <span class="muted" style="font-size:11px;font-weight:500">${exclLabel()}</span>` : ''}</td>${net.map(v => `<td class="num ${v < 0 ? 'neg' : 'pos'}">${f(v)}</td>`).join('')}<td class="num b ${sum(net) < 0 ? 'neg' : 'pos'}">${f(sum(net))}</td><td class="num muted">${f(sum(net) / nM)}</td></tr>`;
  const opt = sel => allM.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${mLabel(m)}</option>`).join('');
  const toM = ymPlus(lastM, -1), PRE = [['12', 'Last 12 months', ymPlus(toM, -11), toM], ['ytd', `${CY} so far`, `${CY}-01`, toM], ['py', String(PY), `${PY}-01`, `${PY}-12`], ['24', 'Last 24 months', ymPlus(toM, -23), toM]];
  pg.innerHTML = `<div class="toolbar wrap">${seg}
    <select class="in sel" id="arFrom">${opt(AR.from)}</select><span class="muted">to</span><select class="in sel" id="arTo">${opt(AR.to)}</select>
    <div class="seg" id="arPre">${PRE.map(([k, l, a, b]) => `<button data-a="${a}" data-b="${b}" class="${AR.from === a && AR.to === b ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div style="margin-left:auto;display:flex;gap:8px"><button class="btn" id="arExp">${icon('chev')}<span>${AR.open.size ? 'Collapse all' : 'Expand all'}</span></button><button class="btn" id="arCsv">${icon('download')}<span>CSV</span></button></div></div>
  ${exclBanner()}${capped ? `<div class="banner">${icon('info')}<span>Showing the last 36 months of that range.</span></div>` : ''}
  <div class="grid g-12">
    <div class="card c-4 kpi"><div class="label">Income</div><div class="val num">${money(sum(inc))}</div><div class="delta">${short(sum(inc) / nM)}/mo avg</div></div>
    <div class="card c-4 kpi"><div class="label">Spending</div><div class="val num">${money(-sum(ex))}</div><div class="delta">${short(-sum(ex) / nM)}/mo avg</div></div>
    <div class="card c-4 kpi"><div class="label">Net</div><div class="val num ${sum(net) < 0 ? 'neg' : ''}">${money(sum(net))}</div><div class="delta">${mLabel(months[0])} – ${mLabel(months[nM - 1])} · ${nM} months</div></div>
    <div class="card c-12" style="padding:10px 0 4px"><div class="scroll-x"><table class="table bb ar-t">${h}</table></div></div>
  </div>`;
  $('#arFrom').onchange = e => { AR.from = e.target.value; render(); };
  $('#arTo').onchange = e => { AR.to = e.target.value; render(); };
  $$('#arPre button').forEach(b => b.onclick = () => { AR.from = b.dataset.a; AR.to = b.dataset.b; render(); });
  $('#arExp').onclick = () => { if (AR.open.size) AR.open.clear(); else HAS.forEach(n => AR.open.add(n)); render(); };
  $$('.ar-t .chev', pg).forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.tg; AR.open.has(k) ? AR.open.delete(k) : AR.open.add(k); render(); });
  // a cell opens that month's transactions (loaded months only)
  $$('.ar-t tr.click td[data-m]', pg).forEach(td => td.onclick = () => { const m = td.dataset.m, tr = td.parentElement; if (m < CTX.SINCE.slice(0, 7)) return toast('Older months come from the stored history — load older transactions on the Transactions page to drill in');
    const y = +m.slice(0, 4), mo = +m.slice(5, 7); if (y !== ASOF.y) { TXF.cat = tr.dataset.cat; TXF.sub = tr.dataset.sub ?? '*'; TXF.month = m; go('tx'); return; } openCatTx(tr.dataset.cat, tr.dataset.sub, mo, mo); });
  $('#arCsv').onclick = () => { const rows = [['Category', 'Sub-category', ...months, 'Total']];
    cats.forEach(c => { const v = catVals(c.name); if (v.every(x => Math.abs(x) < .5)) return; rows.push([c.name, '', ...v.map(x => x.toFixed(2)), sum(v).toFixed(2)]);
      subsOf(c.name).forEach(sb => { const sv = subVals(c.name, sb); if (sv.some(x => Math.abs(x) >= .5)) rows.push([c.name, sb, ...sv.map(x => x.toFixed(2)), sum(sv).toFixed(2)]); }); });
    const csv = rows.map(r => r.map(x => /[",\n]/.test(x) ? `"${String(x).replace(/"/g, '""')}"` : x).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = `actuals-${months[0]}-to-${months[nM - 1]}.csv`; a.click(); };
}
