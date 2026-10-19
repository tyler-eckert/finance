/* =====================================================================
   NOTES & YEAR IN REVIEW
   One notes table (finance.notes) at whatever level fits — a month, a goal,
   a trip, a balance-sheet line, a category, a large purchase, a section's key
   points — rolled up into a Year in Review page that mirrors the annual deck
   and exports it as a PowerPoint.
   ===================================================================== */
const NOTES = () => (CTX.notes ||= []);
const nKey = (scope, ref, year) => `${scope}|${ref || ''}|${year ?? ''}`;
const noteFind = (scope, ref = '', year = null) => NOTES().find(n => n.scope === scope && (n.ref || '') === (ref || '') && (n.year ?? null) === (year ?? null));
const noteList = (scope, year) => NOTES().filter(n => n.scope === scope && n.year === year).sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
const noteText = (scope, ref, year) => noteFind(scope, ref, year)?.body || '';
const NT = new Map();
function noteSave(n, now = false) {          // insert / update / delete one note (debounced)
  if (!CTX.CAN_WRITE) return;
  clearTimeout(NT.get(n));
  const run = async () => {
    const empty = !(n.title || '').trim() && !(n.body || '').trim() && !n.status;
    try {
      if (empty) { if (n.id) { const {error} = await FDB.from('notes').delete().eq('id', n.id); if (error) throw error; } const i = NOTES().indexOf(n); if (i >= 0) NOTES().splice(i, 1); return; }
      const rec = {household_id: CTX.HH, scope: n.scope, ref: n.ref || '', year: n.year ?? null, title: n.title || null, body: n.body || null, status: n.status || null, sort_order: n.sort_order ?? 100};
      if (n.id) { const {error} = await FDB.from('notes').update(rec).eq('id', n.id); if (error) throw error; }
      else { if (n._saving) return; n._saving = true; const {data, error} = await FDB.from('notes').insert(rec).select('id, created_at').single(); n._saving = false; if (error) throw error; n.id = data.id; n.created_at = data.created_at; }
    } catch (e) { toast('Couldn’t save the note: ' + e.message + (/notes/.test(e.message) ? ' — run migration 1600' : '')); }
  };
  if (now) return run(); NT.set(n, setTimeout(run, 500));
}
function noteSet(scope, ref, year, patch) {
  let n = noteFind(scope, ref, year);
  if (!n) { n = {scope, ref: ref || '', year: year ?? null}; NOTES().push(n); }
  Object.assign(n, patch); noteSave(n); return n;
}
// <textarea> bound to a keyed note
const noteBox = (scope, ref, year, ph, rows = 3) => `<textarea class="in note-in" rows="${rows}" ${CTX.CAN_WRITE ? '' : 'readonly'} data-note="${esc(nKey(scope, ref, year))}" placeholder="${esc(ph)}">${esc(noteText(scope, ref, year))}</textarea>`;
const noteLine = (scope, ref, year, ph) => `<input class="in sm note-in" ${CTX.CAN_WRITE ? '' : 'readonly'} data-note="${esc(nKey(scope, ref, year))}" placeholder="${esc(ph)}" value="${esc(noteText(scope, ref, year))}">`;
function wireNotes(root = document) {
  $$('[data-note]', root).forEach(el => el.oninput = () => { const [scope, ref, y] = el.dataset.note.split('|'); noteSet(scope, ref, y === '' ? null : +y, {body: el.value}); });
}

/* ---------------- report buckets (category → House, Cars, Food & Such, …) ---------------- */
const RV_BUCKETS = ['House', 'Cars', 'Food & Such', 'Shopping', 'Medical', 'Comforts', 'School', 'Tithing', 'Other'];
const RV = {y: null, open: null};
const RVS = () => { const s = (CTX.settings.review ||= {}); s.buckets ||= {}; return s; };
function defBucket(c) {
  const n = c.toLowerCase();
  if (/school|daycare|tuition|mdo/.test(n)) return 'School';
  if (/mortgage|gas\/electric|utilit|septic|water|lawn|home|house|pest|hoa|property|generator|cleaning|furni|decor/.test(n)) return 'House';
  if (/\bcars?\b|car payment|car wash|auto|fuel|gas$|insurance|pike|toll|credit card/.test(n)) return 'Cars';
  if (/grocer|eating|food|dining|restaurant/.test(n)) return 'Food & Such';
  if (/amazon|cloth|shopping|target|walmart|gift/.test(n)) return 'Shopping';
  if (/medic|doctor|dent|pharm|health|vision/.test(n)) return 'Medical';
  if (/tith|church|giving|charit|donat/.test(n)) return 'Tithing';
  if (/school|daycare|tuition|mdo/.test(n)) return 'School';
  if (/phone|internet|cable|netflix|disney|stream|groom|spa|subscr|music/.test(n)) return 'Comforts';
  return 'Other';
}
const bucketOf = c => RVS().buckets[c] || defBucket(c);
let rvSaveT = null;
function saveReviewSettings() { if (!CTX.CAN_WRITE) return; clearTimeout(rvSaveT); rvSaveT = setTimeout(async () => { const {error} = await FDB.rpc('set_household_setting', {p_household: CTX.HH, p_key: 'review', p_value: RVS()}); if (error) toast('Couldn’t save review settings: ' + error.message); }, 500); }

/* ---------------- the numbers for a year ---------------- */
const LARGE_SKIP = /^(tax|vacation|entertainment|credit card|car payments|mortgage|tts)$/i;
const NEED_HINT = /home|house|lawn|repair|medical|car|auto|insur|plumb|hvac|heat|air|roof|water|septic|electric/i;
function reviewData(y) {
  const MM = summMonthly(), lastM = y === CY ? `${CY}-${String(ASOF.m).padStart(2, '0')}` : `${y}-12`, months = ymRange(`${y}-01`, lastM), partial = lastM < `${y}-12`;
  const cat = {}; let incTot = 0, dist = 0, pay = 0;
  const SAL = new Set(CTX.salaryCats || []);
  months.forEach(m => { for (const [c, v] of Object.entries(MM[m] || {})) { const g = catOf(c)?.group; if (!g || g === 'TTS') continue;
    if (g === 'Income') { incTot += v; if (/distribut/i.test(c)) dist += v; else if (SAL.has(c)) pay += v; } else cat[c] = (cat[c] || 0) - v; } });
  const other = incTot - dist - pay, expense = sum(Object.values(cat)), tax = cat['Tax'] || 0;
  const loaded = `${y}-01` >= CTX.SINCE.slice(0, 7) || ST.allLoaded;
  // transactions for the year (sub-categories, large items)
  const tx = ST.tx.filter(t => t.d.slice(0, 4) === String(y) && t.d.slice(0, 7) <= lastM);
  const sub = {}; tx.forEach(t => pieces(t).forEach(p => { if (!p.cat) return; const k = p.cat + '|' + (p.sub || ''); sub[k] = (sub[k] || 0) - p.amt; }));
  const thr = RVS().largeMin || 1000;
  const large = tx.filter(t => !t.splits && t.amt <= -thr && t.cat && catOf(t.cat)?.group === 'Variable Expense' && !LARGE_SKIP.test(t.cat))
    .map(t => { const n = noteFind('large', t.id, y); return {t, st: n?.status || (NEED_HINT.test(t.cat + ' ' + (t.sub || '')) ? 'need' : 'want'), desc: n?.title ?? t.note ?? ''}; })
    .sort((a, b) => a.t.d.localeCompare(b.t.d));
  const want = sum(large.filter(l => l.st === 'want').map(l => -l.t.amt)), need = sum(large.filter(l => l.st === 'need').map(l => -l.t.amt));
  const ent = cat['Entertainment'] || 0, vac = cat['Vacation'] || 0;
  const theo = expense - tax - want - ent - vac, adj = theo - need;
  // adjusted spend by bucket and category (large items taken out of their categories)
  const lgByCat = {}; large.filter(l => l.st !== 'skip').forEach(l => { lgByCat[l.t.cat] = (lgByCat[l.t.cat] || 0) - l.t.amt; });
  const buckets = {}, bucketCats = {};
  Object.entries(cat).forEach(([c, v]) => { if (c === 'Tax' || c === 'Entertainment' || c === 'Vacation') return; const a = v - (lgByCat[c] || 0); if (Math.abs(a) < .5) return; const b = bucketOf(c); buckets[b] = (buckets[b] || 0) + a; (bucketCats[b] ||= []).push({c, v: a}); });
  Object.values(bucketCats).forEach(l => l.sort((p, q) => q.v - p.v));
  const subsOf = c => Object.entries(sub).filter(([k]) => k.startsWith(c + '|')).map(([k, v]) => ({s: k.split('|')[1], v})).filter(r => Math.abs(r.v) >= .5).sort((a, b) => b.v - a.v);
  return {y, months, lastM, partial, loaded, incTot, dist, pay, other, expense, tax, fromSavings: expense - incTot, large, want, need, ent, vac, theo, adj, cat, buckets, bucketCats, entSubs: subsOf('Entertainment'), vacSubs: subsOf('Vacation'), subsOf};
}
// balance sheet: Dec of the prior year vs Dec of the year (or the latest month)
function reviewBalance(y) {
  const m1 = y === CY ? BS.months[L] : `${y}-12`, m0 = `${y - 1}-12`, i0 = BS.months.indexOf(m0), i1 = BS.months.indexOf(m1);
  const at = (k, i) => i < 0 ? null : (BS[k]?.[i] ?? null);
  const accts = (SNAP.accounts || []).filter(a => !a.parent_account_id && a.in_net_worth !== false);
  const row = a => ({id: a.id, n: a.name, v0: at('acct:' + a.id, i0) || 0, v1: at('acct:' + a.id, i1) || 0});
  const grp = (f) => accts.filter(f).map(row).filter(r => r.v0 || r.v1);
  const G = [
    {k: 'Cash', rows: grp(a => a.balance_group === 'Cash' && !a.is_liability)},
    {k: 'Retirement', rows: grp(a => a.balance_group === 'Retirement')},
    {k: 'College', rows: grp(a => a.balance_group === 'College')},
    {k: 'Other investing', rows: grp(a => a.balance_group === 'Investing')},
  ];
  const valAt = (a, m) => { const ks = Object.keys(a.vals || {}).filter(k => k <= m).sort(); if (!ks.length) return 0; if (a.status === 'sold' && a.sold && m >= a.sold) return 0; return a.vals[ks[ks.length - 1]]; };
  const assets = ST.assets.map(a => { const ln = a.loan ? loanById(a.loan) : null, e = m => valAt(a, m) - (ln ? loanBal(ln, m) : 0); return {id: a.id, n: a.name, v0: Math.max(0, e(m0)), v1: Math.max(0, e(m1)), sold: a.status === 'sold' && a.sold && a.sold.slice(0, 4) === String(y)}; }).filter(r => r.v0 || r.v1);
  const debt = ST.loans.map(l => ({id: l.id, n: l.name, v0: loanBal(l, m0), v1: loanBal(l, m1), rate: l.rate, end: loanPayoff(l.id)})).filter(r => r.v0 > .5 || r.v1 > .5);
  return {m0, m1, G, assets, debt, nw0: at('netWorth', i0) ?? 0, nw1: at('netWorth', i1) ?? 0};
}
// yearly totals per category; the current year is an estimate: actual so far + the budget for the rest of the year
// (or the year-to-date pace where there's no budget), so it compares apples to apples with full past years
function reviewTrends() {
  const MM = summMonthly(), years = [...new Set(Object.keys(MM).map(m => +m.slice(0, 4)))].sort().filter(y => y <= CY), am = ASOF.m;
  const actualY = (c, y) => -sum(ymRange(`${y}-01`, `${y}-12`).map(m => MM[m]?.[c] || 0));
  const estCY = c => { const ytd = -sum(ymRange(`${CY}-01`, `${CY}-${String(am).padStart(2, '0')}`).map(m => MM[m]?.[c] || 0)); if (am >= 12) return ytd;
    const b = typeof budgetFor === 'function' ? -budgetFor(CY, c, am + 1, 12) : 0; return ytd + (Math.abs(b) > .5 ? b : ytd / am * (12 - am)); };
  const yr = (c, y) => y === CY ? estCY(c) : actualY(c, y);
  const sign = c => catOf(c)?.group === 'Income' ? -1 : 1;
  const T = RVS().trends || [{t: 'Mortgage', cats: ['Mortgage']}, {t: 'Groceries & Eating Out', cats: ['Groceries', 'Eating Out']}, {t: 'Vacations & Entertainment', cats: ['Vacation', 'Entertainment']}];
  const all = ST.cats.filter(c => c.group !== 'TTS').map(c => ({c: c.name, g: c.group, v: years.map(y => yr(c.name, y) * sign(c.name))})).filter(r => r.v.some(v => Math.abs(v) >= 1));
  const gOrder = {Income: 0, 'Fixed Expense': 1, 'Variable Expense': 2};
  all.sort((a, b) => (gOrder[a.g] ?? 3) - (gOrder[b.g] ?? 3) || Math.max(...b.v) - Math.max(...a.v));
  return {years, est: am < 12 ? CY : null, estThrough: am, all, charts: T.map(ch => ({t: ch.t, series: ch.cats.filter(c => catOf(c)).map(c => ({n: c, v: years.map(y => Math.max(0, yr(c, y)))}))})).filter(ch => ch.series.length)};
}
function reviewInvesting() {
  const kids = DATA.kids.map(k => { const y18 = collegeYear(k); return {...k, y18, bal: BS[k.key]?.[L] || 0, yrsLeft: 0}; }); kids.forEach(k => k.cp = colProject(k));
  const born = k => +String(k.dob).slice(0, 4) + (+String(k.dob).slice(5, 7) - 1) / 12;
  const ages = Array.from({length: 23}, (_, i) => i);
  const kidSeries = kids.map(k => ({n: k.name, v: ages.map(a => { const m = `${Math.floor(born(k) + a)}-${String(Math.round(((born(k) + a) % 1) * 12) + 1).padStart(2, '0')}`; const j = BS.months.indexOf(m);
    if (j >= 0 && j <= L) return BS[k.key]?.[j] ?? null; return k.cp.val[m] ?? null; })}));
  const sc = SCN[0], B = typeof planBands === 'function' ? planBands(sc) : null, nAges = Array.from({length: 96 - ageNow}, (_, t) => ageNow + t).filter(a => a <= 75);
  return {kids, ages, kidSeries, nest: B ? {ages: nAges, v: nAges.map(a => B.a50[a - ageNow] ?? null), retire: sc.p.retire, spend: sc.p.spend} : null};
}

/* ---------------- page ---------------- */
function renderReview(pg) {
  if (RV.y == null) RV.y = +CTX.TODAY.slice(5, 7) <= 6 ? CY - 1 : CY;   // first half of the year → review last year
  const y = RV.y, D = reviewData(y), Bs = reviewBalance(y), ro = CTX.CAN_WRITE ? '' : 'disabled', TRD = reviewTrends();
  const yrs = []; for (let k = Math.max(+CTX.SINCE.slice(0, 4), CY - 6); k <= CY; k++) yrs.push(k);
  const list = (scope, yy, label, ph) => `<div class="rv-list"><h4>${label}</h4>${noteList(scope, yy).map(n => `<div class="rv-li ${n.status === 'done' ? 'done' : ''}">
      ${scope !== 'trip' ? `<input type="checkbox" data-ndone="${n.id || ''}" ${n.status === 'done' ? 'checked' : ''} ${ro} title="Done">` : '<span class="rv-dot"></span>'}
      <input class="in sm" data-ntitle="${n.id || ''}" value="${esc(n.title || '')}" ${CTX.CAN_WRITE ? '' : 'readonly'}><button class="mini-btn" data-ndel="${n.id || ''}" title="Remove" ${ro}>${icon('close')}</button></div>`).join('')}
      ${CTX.CAN_WRITE ? `<div class="rv-li add"><input class="in sm" data-nadd="${scope}|${yy}" placeholder="${esc(ph)}"></div>` : ''}</div>`;
  const kp = (ref, ph) => `<div class="rv-kp"><label>Key points <span class="muted">· one per line, become the slide bullets</span></label>${noteBox('slide', ref, y, ph, 4)}</div>`;
  const ab = v => (v < 0 ? '(' + Math.round(-v).toLocaleString() + ')' : Math.round(v).toLocaleString());
  const k$ = v => Math.round(v / 1000);
  const top3 = Object.entries(D.buckets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b]) => b);
  const allCats = Object.keys(D.cat).filter(c => !['Tax', 'Entertainment', 'Vacation'].includes(c)).sort();
  const var$ = (a, b) => b - a, varP = (a, b) => a ? (b - a) / Math.abs(a) : null;
  const bsRow = (r, scope = 'account') => `<tr><td class="ind">${esc(r.n)}</td><td class="num">${ab(r.v0)}</td><td class="num">${ab(r.v1)}</td><td class="num ${var$(r.v0, r.v1) >= 0 ? '' : 'neg'}">${ab(var$(r.v0, r.v1))}</td><td class="num">${varP(r.v0, r.v1) == null ? '—' : pct(varP(r.v0, r.v1))}</td><td>${noteLine(scope, r.id, y, r.sold ? 'Sold in ' + y : r.rate != null ? `${pctRate(r.rate)} · ends ${mLabel(r.end)}` : 'Comment')}</td></tr>`;
  const tot = rows => ({v0: sum(rows.map(r => r.v0)), v1: sum(rows.map(r => r.v1))});
  const totRow = (n, t, cls = 'tot') => `<tr class="${cls}"><td>${n}</td><td class="num">${ab(t.v0)}</td><td class="num">${ab(t.v1)}</td><td class="num">${ab(t.v1 - t.v0)}</td><td class="num">${varP(t.v0, t.v1) == null ? '—' : pct(varP(t.v0, t.v1))}</td><td></td></tr>`;
  const cashT = tot(Bs.G[0].rows), invT = tot(Bs.G.slice(1).flatMap(g => g.rows)), assetT = tot(Bs.assets), debtT = tot(Bs.debt);
  const monthNotes = NOTES().filter(n => n.scope === 'month' && n.ref.startsWith(String(y)) && (n.body || '').trim()).sort((a, b) => a.ref.localeCompare(b.ref));

  pg.innerHTML = `<div class="toolbar wrap"><div class="seg" id="rvY">${yrs.map(k => `<button data-y="${k}" class="${k === y ? 'on' : ''}">${k}${k === CY ? ' · YTD' : ''}</button>`).join('')}</div>
    <span class="muted" style="font-size:12.5px">${D.partial ? `Through ${mLabel(D.lastM)}` : 'Full year'} · notes save as you type${D.loaded ? '' : ' · <b>load all transactions</b> (Transactions page) for sub-category and large-item detail'}</span>
    <button class="btn primary" id="rvPpt" style="margin-left:auto">${icon('download')}<span>Download PowerPoint</span></button></div>
  <div class="grid g-12">
    <div class="card c-12"><div class="card-h"><div><h3>${y} recap & ${y + 1} goals</h3><div class="sub">What we accomplished and what we want to accomplish · tick goals as they’re done</div></div></div>
      <div class="rv-cols">${list('goal', y, `${y} goals`, 'Add a goal…')}${list('goal', y + 1, `${y + 1} goals`, 'Add a goal…')}${list('trip', y, `${y} vacations`, 'Add a trip…')}${list('trip', y + 1, `${y + 1} vacations & trips`, 'Add a trip…')}</div></div>

    <div class="card c-12"><div class="card-h"><div><h3>${y} spending breakdown</h3><div class="sub">The flow of funds starting with income · in thousands</div></div></div>
      <div class="chart" id="rvWf"></div>
      <div class="rv-flow">${[['Distributions', D.dist], ['Paychecks', D.pay], ['Other income', D.other], [D.fromSavings >= 0 ? 'From savings' : 'To savings', Math.abs(D.fromSavings)], ['Tax', D.tax], ['Large wants', D.want], ['Entertainment', D.ent], ['Vacation', D.vac], ['Theoretical spend', D.theo], ['Large needs', D.need], ['Adjusted spend', D.adj]].map(([l, v]) => `<div class="mini"><div class="l">${l}</div><div class="v num">${money(v)}</div></div>`).join('')}</div>
      ${kp('spending', 'e.g. $24k of tax was 2024 owed, the rest 2025 estimates')}</div>

    <div class="card c-12"><div class="card-h"><div><h3>Large purchases</h3><div class="sub">Single charges of ${money(RVS().largeMin || 1000)}+ in everyday categories · mark each as a want, a need, or leave it out</div></div>
      <div class="right"><label class="tgl">Over <select class="in sm sel" id="rvMin" ${ro}>${[500, 1000, 2000, 5000].map(v => `<option value="${v}" ${(RVS().largeMin || 1000) === v ? 'selected' : ''}>${money(v)}</option>`).join('')}</select></label></div></div>
      <div class="scroll-x"><table class="table rv-t"><tr><th>Date</th><th>Vendor</th><th>Amount</th><th>Want / need</th><th>Description</th></tr>
        ${D.large.map(l => `<tr class="${l.st === 'skip' ? 'muted' : ''}"><td class="nowrap">${fmtDate(l.t.d)}</td><td class="nowrap">${esc(vendorName(vendorKey(l.t.desc)))}<div class="muted" style="font-size:11px">${esc(l.t.cat)}${l.t.sub ? ' · ' + esc(l.t.sub) : ''}</div></td><td class="num nowrap">${money(-l.t.amt)}</td>
          <td><select class="in sm sel" data-lst="${l.t.id}" ${ro}>${[['want', 'Want'], ['need', 'Need'], ['skip', 'Leave out']].map(([k, n]) => `<option value="${k}" ${l.st === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
          <td><input class="in sm" data-ldesc="${l.t.id}" value="${esc(l.desc)}" placeholder="What was it?" ${CTX.CAN_WRITE ? '' : 'readonly'} style="min-width:180px"></td></tr>`).join('') || '<tr><td colspan="5" class="muted">None this year.</td></tr>'}
        <tr class="tot"><td colspan="2">${y} total</td><td class="num nowrap">${money(D.want + D.need)}</td><td colspan="2" class="muted">${money(D.want)} wants · ${money(D.need)} needs</td></tr></table></div></div>
    ${[['Entertainment', D.entSubs, D.ent], ['Vacation', D.vacSubs, D.vac]].map(([c, rows, t]) => `<div class="card c-6"><div class="card-h"><div><h3>${c === 'Vacation' ? 'Vacations' : c}</h3><div class="sub">By sub-category · add a note to explain any line</div></div></div>
        <div class="scroll-x"><table class="table rv-t">${rows.map(r => `<tr><td>${esc(r.s || 'No sub-category')}</td><td class="num nowrap">${money(r.v)}</td><td>${noteLine('category', c + '|' + r.s, y, 'Note')}</td></tr>`).join('') || '<tr><td class="muted">Nothing this year.</td></tr>'}
        <tr class="tot"><td>${y} total</td><td class="num nowrap">${money(t)}</td><td></td></tr></table></div></div>`).join('')}

    <div class="card c-12"><div class="card-h"><div><h3>Where the rest went</h3><div class="sub">Adjusted spend (${money(D.adj)}) by group · change a category’s group with its dropdown · the top 3 get their own table in the deck</div></div></div>
      <div class="rv-buckets">${Object.entries(D.buckets).sort((a, b) => b[1] - a[1]).map(([b, v]) => `<details class="rv-b" ${RV.open === b || top3.includes(b) ? 'open' : ''}><summary><b>${esc(b)}</b><span class="num">${money(v)} · ${D.adj ? Math.round(v / D.adj * 100) : 0}%</span></summary>
        <div class="scroll-x"><table class="table rv-t">${(D.bucketCats[b] || []).map(r => `<tr><td>${esc(r.c)}</td><td class="num">${money(r.v)}</td><td><select class="in sm sel" data-bk="${esc(r.c)}" ${ro}>${RV_BUCKETS.map(x => `<option ${x === bucketOf(r.c) ? 'selected' : ''}>${x}</option>`).join('')}</select></td><td>${noteLine('category', r.c, y, 'Commentary')}</td></tr>`).join('')}</table></div></details>`).join('')}</div></div>

    <div class="card c-8"><div class="card-h"><div><h3>Balance sheet snapshot</h3><div class="sub">${mLabel(Bs.m0)} vs. ${mLabel(Bs.m1)} · comments go into the deck</div></div></div>
      <div class="scroll-x"><table class="table rv-t rv-bs"><tr><th>Month-end balances</th><th>${mShort(Bs.m0)}</th><th>${mShort(Bs.m1)}</th><th>Var $</th><th>Var %</th><th>Comment</th></tr>
        <tr class="grp"><td colspan="6">Cash</td></tr>${Bs.G[0].rows.map(r => bsRow(r)).join('')}${totRow('Total cash', cashT)}
        <tr class="grp"><td colspan="6">Investing</td></tr>${Bs.G.slice(1).filter(g => g.rows.length).map(g => `<tr><td colspan="6" class="rv-sub">${g.k}</td></tr>` + g.rows.map(r => bsRow(r)).join('') + totRow('Total ' + g.k.toLowerCase(), tot(g.rows), 'sub-tot')).join('')}${totRow('Total investing', invT)}
        ${totRow('Total cash + investing', {v0: cashT.v0 + invT.v0, v1: cashT.v1 + invT.v1})}
        <tr class="grp"><td colspan="6">Assets (equity)</td></tr>${Bs.assets.map(r => bsRow(r, 'account')).join('')}${totRow('Total assets', assetT)}
        ${totRow('Est. net worth', {v0: Bs.nw0, v1: Bs.nw1}, 'tot net')}
        <tr class="grp"><td colspan="6">Debt</td></tr>${Bs.debt.map(r => bsRow(r, 'account')).join('')}${totRow('Total debt', debtT)}</table></div></div>
    <div class="card c-4"><div class="card-h"><div><h3>Balance sheet notes</h3><div class="sub">Right-hand column of the slide</div></div></div>
      ${[['balance-cash', 'Cash', 'e.g. Keeping a few months of expenses on hand'], ['balance-invest', 'Investing', 'e.g. Maxing out the 401(k)'], ['balance-summary', 'Summary', 'e.g. Close to $300k net worth increase']].map(([r, l, ph]) => `<div class="rv-kp"><label>${l}</label>${noteBox('slide', r, y, ph, 3)}</div>`).join('')}</div>

    <div class="card c-6"><div class="card-h"><div><h3>College funds by age</h3><div class="sub">Actual, then projected with your draw plan</div></div></div><div class="chart" id="rvKids"></div>${kp('invest-529', 'e.g. Super-funded all accounts with another $1,000 in August')}</div>
    <div class="card c-6"><div class="card-h"><div><h3>Nest egg by age</h3><div class="sub">Plan median · ${esc(SCN[0].name)} scenario</div></div></div><div class="chart" id="rvNest"></div>${kp('invest-nest', 'e.g. Retire at 55 drawing $225k/yr')}</div>

    <div class="card c-12"><div class="card-h"><div><h3>Annual trends</h3><div class="sub">Every year on record${TRD.est ? ` · ${TRD.est} is an estimate: Jan–${MON[TRD.estThrough - 1]} actual + the budget for the rest of the year (hatched)` : ''}</div></div></div>
      <div class="rv-trends">${TRD.charts.map((c, i) => `<div><h4>${esc(c.t)}</h4><div class="chart" id="rvTr${i}"></div></div>`).join('')}</div>${kp('trends', 'e.g. Food has gotten very expensive')}
      <h4 style="margin:18px 0 8px;font-size:13px">Every category</h4>
      <div class="rv-all">${TRD.all.map((r, i) => `<div class="rv-mini"><div class="rv-mh"><b>${esc(r.c)}</b><span class="muted num">${TRD.est ? TRD.est + ' est ' : ''}${short(r.v[r.v.length - 1])}</span></div><div class="chart" id="rvA${i}"></div></div>`).join('')}</div></div>

    <div class="card c-12"><div class="card-h"><div><h3>Month notes · ${y}</h3><div class="sub">From the Summary page · they go in the deck’s speaker notes</div></div></div>
      ${monthNotes.length ? monthNotes.map(n => `<div class="sum-kv"><span><b>${mLabel(n.ref)}</b></span><span style="text-align:left;flex:1;margin-left:16px;white-space:pre-wrap">${esc(n.body)}</span></div>`).join('') : `<p class="muted">No month notes yet — add them on the Summary page as each month closes.</p>`}
      <div class="rv-kp" style="margin-top:12px"><label>Title slide</label><div class="form" style="grid-template-columns:1fr 1fr"><div><input class="in" id="rvTitle" ${CTX.CAN_WRITE ? '' : 'readonly'} value="${esc(RVS().title || defTitle())}"></div><div><input class="in" id="rvClose" ${CTX.CAN_WRITE ? '' : 'readonly'} value="${esc(RVS().closing || 'Thank you for coming to my TED talk · Questions?')}"></div></div></div></div>
  </div>`;

  // wiring
  wireNotes(pg);
  $$('#rvY button').forEach(b => b.onclick = () => { RV.y = +b.dataset.y; render(); });
  const byId = id => NOTES().find(n => n.id === id);
  $$('[data-nadd]', pg).forEach(i => i.onkeydown = e => { if (e.key !== 'Enter' || !i.value.trim()) return; const v = i.value.trim(); i.value = ''; const [scope, yy] = i.dataset.nadd.split('|'), n = {scope, ref: '', year: +yy, title: v, status: scope === 'goal' ? 'planned' : null, sort_order: noteList(scope, +yy).length + 1};
    NOTES().push(n); noteSave(n, true).then(() => { render(); setTimeout(() => $(`[data-nadd="${scope}|${yy}"]`)?.focus(), 30); }); });
  $$('[data-nadd]', pg).forEach(i => i.onblur = () => { if (i.value.trim()) i.onkeydown({key: 'Enter'}); });
  $$('[data-ntitle]', pg).forEach(i => i.oninput = () => { const n = byId(i.dataset.ntitle); if (n) { n.title = i.value; noteSave(n); } });
  $$('[data-ndone]', pg).forEach(c => c.onchange = () => { const n = byId(c.dataset.ndone); if (n) { n.status = c.checked ? 'done' : 'planned'; noteSave(n, true); render(); } });
  $$('[data-ndel]', pg).forEach(b => b.onclick = () => { const n = byId(b.dataset.ndel); if (!n) return; n.title = ''; n.body = ''; n.status = null; noteSave(n, true).then(render); });
  $$('[data-lst]', pg).forEach(s => s.onchange = () => { noteSet('large', s.dataset.lst, y, {status: s.value}); setTimeout(render, 30); });
  $$('[data-ldesc]', pg).forEach(i => i.oninput = () => noteSet('large', i.dataset.ldesc, y, {title: i.value}));
  $$('[data-bk]', pg).forEach(s => s.onchange = () => { RVS().buckets[s.dataset.bk] = s.value; RV.open = s.value; saveReviewSettings(); render(); });
  if ($('#rvMin')) $('#rvMin').onchange = e => { RVS().largeMin = +e.target.value; saveReviewSettings(); render(); };
  if ($('#rvTitle')) $('#rvTitle').onchange = e => { RVS().title = e.target.value.trim(); saveReviewSettings(); };
  if ($('#rvClose')) $('#rvClose').onchange = e => { RVS().closing = e.target.value.trim(); saveReviewSettings(); };
  $('#rvPpt').onclick = () => openDeckExport(y);
  const I = reviewInvesting(), TR = TRD;
  CH.push(() => waterfall($('#rvWf'), [{name: 'Income', v: D.incTot / 1000, total: true}, {name: D.fromSavings >= 0 ? 'From savings' : 'To savings', v: -D.fromSavings / 1000 * -1}, {name: 'Expense', v: D.expense / 1000, total: true},
      {name: 'Tax', v: -D.tax / 1000}, {name: 'Large wants', v: -D.want / 1000}, {name: 'Entertain­ment', v: -D.ent / 1000}, {name: 'Vacation', v: -D.vac / 1000}, {name: 'Theoretical spend', v: D.theo / 1000, total: true}, {name: 'Large needs', v: -D.need / 1000}, {name: 'Adjusted spend', v: D.adj / 1000, total: true}], {height: 260}),
    () => lineChart($('#rvKids'), {labels: I.ages, series: I.kidSeries.map((s, i) => ({name: s.n, values: s.v.map(v => v == null ? null : Math.max(0, v)), color: KID_COL[i % 5]})), height: 220, zero: true, xFmt: (lb, i) => i % 2 === 0 ? lb : null, tipTitle: a => 'Age ' + a}),
    () => I.nest && lineChart($('#rvNest'), {labels: I.nest.ages, series: [{name: 'Plan median', values: I.nest.v, color: 'var(--s1)', area: true}], height: 220, zero: true, vlines: [{i: I.nest.ages.indexOf(I.nest.retire), label: 'Retire ' + I.nest.retire}], xFmt: (lb, i) => i % 5 === 0 ? lb : null, tipTitle: a => 'Age ' + a}),
    ...TR.charts.map((c, i) => () => barChart($(`#rvTr${i}`), {labels: TR.years.map(String), series: c.series.map((s, k) => ({name: s.n, values: s.v, color: ['var(--s1)', 'var(--s2)'][k % 2], hatchFn: j => TR.years[j] === TR.est})), height: 200, xGap: 34, tipExtra: j => TR.years[j] === TR.est ? tipRow(null, 'Estimate', `Jan–${MON[TR.estThrough - 1]} actual + budget`) : ''})),
    () => TR.all.forEach((r, i) => { const el = $(`#rvA${i}`); if (el) barChart(el, {labels: TR.years.map(y => "'" + String(y).slice(2)), series: [{name: r.c, values: r.v, color: r.g === 'Income' ? 'var(--s2)' : 'var(--s1)', hatchFn: j => TR.years[j] === TR.est}], height: 110, xGap: 26, padL: 40, ticks: 2, tipTitle: (l, j) => String(TR.years[j]) + (TR.years[j] === TR.est ? ' (estimate)' : '')}); }));
}

/* ---------------- PowerPoint export (PptxGenJS, loaded on demand) ---------------- */
const PPTX_SRC = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js', PPTX_SRI = 'sha384-Cck14aA9cifjYolcnjebXRfWGkz5ltHMBiG4px/j8GS+xQcb7OhNQWZYyWjQ+UwQ';
const loadPptx = () => window.PptxGenJS ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = PPTX_SRC; s.integrity = PPTX_SRI; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = () => rej(new Error('Couldn’t load the PowerPoint library')); document.head.appendChild(s); });
const DECK_IMG = {photo: null, logo: null};
try { DECK_IMG.logo = localStorage.getItem('fin.deck.logo'); DECK_IMG.photo = localStorage.getItem('fin.deck.photo'); } catch (_) {}
function openDeckExport(y) {
  const m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">${y} review deck</h2><p class="muted" style="font-size:12.5px">9 slides in your usual order, with your notes as bullets and comments. Charts are real PowerPoint charts you can restyle.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="form one"><div><label>Title-slide photo <span class="muted">(optional)</span></label><input class="in" type="file" id="dkPhoto" accept="image/*">${DECK_IMG.photo ? '<div class="muted" style="font-size:11.5px;margin-top:4px">Using the last photo you picked · choose another to replace it</div>' : ''}</div>
      <div><label>Logo for each slide <span class="muted">(optional — the Family Trust logo is used otherwise)</span></label><input class="in" type="file" id="dkLogo" accept="image/*">${DECK_IMG.logo ? '<div class="muted" style="font-size:11.5px;margin-top:4px">Using your saved logo</div>' : ''}</div></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="dkGo">${icon('download')}<span>Download .pptx</span></button></div>`;
  openLayer('modal');
  const read = (inp, k) => new Promise(res => { const f = inp.files?.[0]; if (!f) return res(); const r = new FileReader(); r.onload = () => { DECK_IMG[k] = r.result; try { localStorage.setItem('fin.deck.' + k, r.result); } catch (_) {} res(); }; r.readAsDataURL(f); });
  $('#dkGo').onclick = async () => { const b = $('#dkGo'); b.disabled = true; b.lastChild.textContent = 'Building…';
    try { await read($('#dkPhoto'), 'photo'); await read($('#dkLogo'), 'logo'); await loadPptx(); await buildDeck(y); closeAll(); toast('Deck downloaded'); }
    catch (e) { b.disabled = false; b.lastChild.textContent = 'Download .pptx'; toast(e.message); } };
}
async function buildDeck(y) {
  if (!DECK_IMG.logo) { try { const r = await fetch('trust-logo.png'); if (r.ok) { const b = await r.blob(); DECK_IMG.logo = await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); }); } } catch (_) {} }
  const D = reviewData(y), Bs = reviewBalance(y), I = reviewInvesting(), TR = reviewTrends(), S = RVS();
  const pp = new PptxGenJS(); pp.defineLayout({name: 'LETTER_L', width: 11, height: 8.5}); pp.layout = 'LETTER_L'; pp.title = `${y} Recap & ${y + 1} Goals`;
  const GREEN = '1F7A3E', DARK = '3B4F1F', GRAY = '7F7F7F', RED = 'C00000', F = 'Arial';
  const bullets = (txt) => (txt || '').split('\n').map(s => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  const K = v => Math.round(v / 1000), num = v => v == null ? '–' : v < 0 ? `(${Math.round(-v).toLocaleString()})` : Math.round(v).toLocaleString();
  let pageNo = 1;
  const slide = (title, sub) => { const s = pp.addSlide(); pageNo++;
    s.addShape(pp.ShapeType.rect, {x: 0, y: 0, w: 11, h: 0.18, fill: {color: DARK}, line: {color: DARK}});
    s.addText(title, {x: 0.35, y: 0.28, w: 8.6, h: 0.5, fontFace: F, fontSize: 26, bold: true, color: '000000'});
    if (sub) s.addText(sub, {x: 0.35, y: 0.76, w: 8.6, h: 0.3, fontFace: F, fontSize: 12, color: GRAY});
    if (DECK_IMG.logo) s.addImage({data: DECK_IMG.logo, x: 10.0, y: 0.25, w: 0.75, h: 0.75, sizing: {type: 'contain', w: 0.75, h: 0.75}});
    s.addText(String(pageNo), {x: 10.3, y: 8.1, w: 0.5, h: 0.3, fontFace: F, fontSize: 9, color: GRAY, align: 'right'}); return s; };
  const bulletBox = (s, items, o) => { if (!items.length) return; s.addText(items.map(t => ({text: t, options: {bullet: true, breakLine: true}})), {fontFace: F, fontSize: 12, color: '000000', valign: 'top', paraSpaceAfter: 6, ...o}); };
  const table = (s, head, rows, o, colW) => s.addTable([head.map(h => ({text: h, options: {bold: true, color: 'FFFFFF', fill: {color: DARK}}})), ...rows], {fontFace: F, fontSize: 9, border: {type: 'none'}, rowH: 0.22, colW, autoPage: false, ...o});

  // 1 · title
  { const s = pp.addSlide();
    if (DECK_IMG.photo) s.addImage({data: DECK_IMG.photo, x: 5.3, y: 0.4, w: 5.3, h: 7.7, sizing: {type: 'cover', w: 5.3, h: 7.7}});
    if (DECK_IMG.logo) s.addImage({data: DECK_IMG.logo, x: 1.2, y: 1.0, w: 2.4, h: 2.4, sizing: {type: 'contain', w: 2.4, h: 2.4}});
    s.addText((S.title || defTitle()).replace(/\s+/g, '\n'), {x: 0.4, y: 4.1, w: 4.8, h: 2.2, fontFace: F, fontSize: 54, bold: true, color: GREEN, valign: 'bottom'});
    s.addText(`${MON_LONG(1)} ${y + 1}`, {x: 0.45, y: 6.35, w: 4.5, h: 0.4, fontFace: F, fontSize: 18, color: '000000'}); }
  // 2 · recap & goals
  { const s = slide(`${y} Recap & ${y + 1} Goals`, 'What did we accomplish and what do we want to accomplish');
    const col = (x, yy) => { const g = noteList('goal', yy), t = noteList('trip', yy);
      s.addText(String(yy), {x, y: 1.25, w: 4.8, h: 0.45, fontFace: F, fontSize: 22, bold: true, color: GREEN});
      const items = [{text: 'Goals:', options: {bold: true, breakLine: true}}, ...g.map(n => ({text: (n.title || '') + (yy === y && n.status === 'done' ? '  ✓' : ''), options: {bullet: true, breakLine: true}})),
        {text: ' ', options: {breakLine: true}}, {text: yy === y ? 'Vacations:' : 'Vacations/Trips:', options: {bold: true, breakLine: true}}, ...t.map(n => ({text: n.title || '', options: {bullet: true, breakLine: true}}))];
      s.addText(items, {x, y: 1.8, w: 4.8, h: 5.8, fontFace: F, fontSize: 14, valign: 'top', paraSpaceAfter: 4}); };
    col(0.4, y); col(5.8, y + 1);
    const mn = NOTES().filter(n => n.scope === 'month' && n.ref.startsWith(String(y)) && (n.body || '').trim()).sort((a, b) => a.ref.localeCompare(b.ref));
    if (mn.length) s.addNotes(mn.map(n => `${mLabel(n.ref)}: ${n.body}`).join('\n\n')); }
  // 3 · spending waterfall + groups
  { const s = slide(`${y} Spending Breakdown`, 'Waterfall represents the flow of funds in thousands of dollars starting with income');
    const steps = [['Total Income', 0, K(D.incTot), 'tot'], [D.fromSavings >= 0 ? 'From Savings' : 'To Savings', 0, 0, 'sv'], ['Expense', 0, K(D.expense), 'tot'], ['Tax', 0, K(D.tax), 'dn'], ['Discretionary', 0, K(D.want), 'dn'], ['Entertainment', 0, K(D.ent), 'dn'], ['Vacation', 0, K(D.vac), 'dn'], ['Theoretical Spend', 0, K(D.theo), 'tot'], ['Necessity', 0, K(D.need), 'dn'], ['Adj. Spend', 0, K(D.adj), 'tot']];
    let run = K(D.expense); const base = [], up = [], down = [], tots = [];
    steps.forEach(([n, , v, k], i) => { if (k === 'tot') { base.push(0); tots.push(v); up.push(0); down.push(0); if (i === 2) run = v; else if (i > 2) run = v; return; }
      if (k === 'sv') { const d = K(Math.abs(D.fromSavings)); if (D.fromSavings >= 0) { base.push(K(D.incTot)); up.push(d); down.push(0); } else { base.push(K(D.expense)); up.push(0); down.push(d); } tots.push(0); return; }
      run -= v; base.push(run); down.push(v); up.push(0); tots.push(0); });
    const labels = steps.map(x => x[0]);
    s.addChart(pp.ChartType.bar, [{name: 'base', labels, values: base}, {name: 'Total', labels, values: tots}, {name: 'Up', labels, values: up}, {name: 'Down', labels, values: down}],
      {x: 0.3, y: 1.15, w: 6.9, h: 5.6, barGrouping: 'stacked', chartColors: ['FFFFFF', 'D9D9D9', GREEN, RED], chartColorsOpacity: 100, showLegend: false, catAxisLabelRotate: -45, catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
        valGridLine: {style: 'none'}, showValue: false, dataLabelFontSize: 9, catAxisLabelFontFace: F, barGapWidthPct: 40});
    const vals = [K(D.incTot), K(Math.abs(D.fromSavings)), K(D.expense), -K(D.tax), -K(D.want), -K(D.ent), -K(D.vac), K(D.theo), -K(D.need), K(D.adj)];
    s.addText(labels.map((l, i) => `${l}: ${vals[i] < 0 ? '(' + (-vals[i]) + ')' : vals[i]}`).join('   ·   '), {x: 0.3, y: 6.85, w: 6.9, h: 0.5, fontFace: F, fontSize: 8, color: GRAY});
    const B = Object.entries(D.buckets).sort((a, b) => b[1] - a[1]);
    s.addChart(pp.ChartType.doughnut, [{name: 'Groups', labels: B.map(b => b[0]), values: B.map(b => Math.round(b[1]))}], {x: 7.2, y: 1.6, w: 3.6, h: 3.8, holeSize: 55, showLegend: true, legendPos: 'b', legendFontSize: 8, showPercent: true, dataLabelFontSize: 8, dataLabelColor: 'FFFFFF',
      chartColors: ['1F3864', '2E5597', '4472C4', '5B8BD6', '7FA3E0', '9DB8E8', 'B4C7E7', 'C9D6EF', 'DAE3F3']});
    s.addText(`${K(D.adj)}k`, {x: 8.25, y: 2.95, w: 1.5, h: 0.5, fontFace: F, fontSize: 22, bold: true, color: '1F3864', align: 'center'});
    bulletBox(s, bullets(noteText('slide', 'spending', y)), {x: 7.2, y: 5.6, w: 3.6, h: 2.2, fontSize: 10}); }
  // 4 · large items, entertainment, vacations
  { const s = slide(`${y} Spending Breakdown`, 'Large purchases, entertainment and vacations');
    const L = D.large.filter(l => l.st !== 'skip').slice().sort((a, b) => a.t.amt - b.t.amt), LS = L.slice(0, 13).sort((a, b) => a.t.d.localeCompare(b.t.d));
    table(s, ['Date', 'Vendor', 'Amount', 'Want/Need', 'Description'], LS.map(l => [`${+l.t.d.slice(5, 7)}/${+l.t.d.slice(8)}/${l.t.d.slice(0, 4)}`, vendorName(vendorKey(l.t.desc)), {text: num(l.t.amt), options: {align: 'right'}}, l.st === 'need' ? 'Need' : 'Want', l.desc || '']).concat(L.length > LS.length ? [[{text: `+ ${L.length - LS.length} smaller items`, options: {italic: true, color: GRAY}}, '', {text: num(sum(L.slice(13).map(l => l.t.amt))), options: {align: 'right', color: GRAY}}, '', '']] : []).concat([[{text: `${y} Total`, options: {bold: true}}, '', {text: num(-(D.want + D.need)), options: {bold: true, align: 'right'}}, '', '']]), {x: 0.35, y: 1.1, w: 10.3, rowH: 0.2, fontSize: 8}, [0.9, 1.9, 1.0, 0.9, 5.6]);
    const half = (rows, total, cat, x) => table(s, [cat, 'Amount', 'Description'], rows.slice(0, 12).map(r => [r.s || '—', {text: num(-r.v), options: {align: 'right'}}, noteText('category', cat + '|' + r.s, y)]).concat(rows.length > 12 ? [[{text: `+ ${rows.length - 12} more`, options: {italic: true, color: GRAY}}, {text: num(-sum(rows.slice(12).map(r => r.v))), options: {align: 'right', color: GRAY}}, '']] : []).concat([[{text: `${y} Total`, options: {bold: true}}, {text: num(-total), options: {bold: true, align: 'right'}}, '']]), {x, y: 4.55, w: 5.05, rowH: 0.2, fontSize: 8}, [1.9, 0.9, 2.25]);
    half(D.entSubs, D.ent, 'Entertainment', 0.35); half(D.vacSubs, D.vac, 'Vacation', 5.6); }
  // 5 · remainder by group
  { const s = slide(`${y} Spending Breakdown`, 'Where the rest of the money went');
    const B = Object.entries(D.buckets).sort((a, b) => b[1] - a[1]);
    s.addChart(pp.ChartType.doughnut, [{name: 'Groups', labels: B.map(b => b[0]), values: B.map(b => Math.round(b[1]))}], {x: 0.3, y: 1.3, w: 4.2, h: 4.6, holeSize: 55, showLegend: true, legendPos: 'b', legendFontSize: 9, showPercent: true, dataLabelFontSize: 8, dataLabelColor: 'FFFFFF',
      chartColors: ['1F3864', '2E5597', '4472C4', '5B8BD6', '7FA3E0', '9DB8E8', 'B4C7E7', 'C9D6EF', 'DAE3F3']});
    let yy = 1.15; B.slice(0, 3).forEach(([b, v]) => { const rows = (D.bucketCats[b] || []).slice(0, 9);
      table(s, [b, 'Amount', 'Commentary'], rows.map(r => [r.c, {text: num(-r.v), options: {align: 'right'}}, noteText('category', r.c, y)]).concat([[{text: `${y} Total`, options: {bold: true}}, {text: num(-v), options: {bold: true, align: 'right'}}, '']]), {x: 4.8, y: yy, w: 5.9}, [1.8, 1.0, 3.1]);
      yy += (rows.length + 2) * 0.22 + 0.25; }); }
  // 6 · balance sheet
  { const s = slide('Balance Sheet Snapshot', 'Year-over-year comparison of our accounts');
    const R = (n, v0, v1, c = '', o = {}) => { const d = v1 - v0, p = v0 ? d / Math.abs(v0) : null; return [{text: n, options: o}, {text: num(v0), options: {align: 'right', ...o}}, {text: num(v1), options: {align: 'right', ...o}}, {text: num(d), options: {align: 'right', color: d < 0 ? RED : '000000', ...o}}, {text: p == null ? '–' : (p < 0 ? '(' + Math.round(-p * 100) + '%)' : Math.round(p * 100) + '%'), options: {align: 'right', ...o}}, {text: c, options: {fontSize: 8, ...o}}]; };
    const H = n => [{text: n, options: {bold: true, colspan: 6, color: GREEN}}];
    const t = rows => ({v0: sum(rows.map(r => r.v0)), v1: sum(rows.map(r => r.v1))}), B = {bold: true};
    const rows = [H('Cash'), ...Bs.G[0].rows.map(r => R('   ' + r.n, r.v0, r.v1, noteText('account', r.id, y))), R('Total Cash', t(Bs.G[0].rows).v0, t(Bs.G[0].rows).v1, '', B), H('Investing')];
    Bs.G.slice(1).filter(g => g.rows.length).forEach(g => { rows.push([{text: '  ' + g.k, options: {bold: true, colspan: 6}}]); g.rows.forEach(r => rows.push(R('     ' + r.n, r.v0, r.v1, noteText('account', r.id, y)))); rows.push(R('  Total ' + g.k, t(g.rows).v0, t(g.rows).v1, '', B)); });
    const inv = t(Bs.G.slice(1).flatMap(g => g.rows)), cash = t(Bs.G[0].rows);
    rows.push(R('Total Investing', inv.v0, inv.v1, '', B), R('Total Cash + Investing', cash.v0 + inv.v0, cash.v1 + inv.v1, '', B), H('Assets'), ...Bs.assets.map(r => R('   ' + r.n, r.v0, r.v1, noteText('account', r.id, y))), R('Total Assets', t(Bs.assets).v0, t(Bs.assets).v1, '', B),
      R('Est. Net Worth', Bs.nw0, Bs.nw1, '', {bold: true, fill: {color: 'D9E1D0'}}), H('Debt'), ...Bs.debt.map(r => R('   ' + r.n, r.v0, r.v1, noteText('account', r.id, y) || (r.rate != null ? `${(r.rate * 100).toFixed(2)}% · ends ${mLabel(r.end)}` : ''))), R('Total Debt', t(Bs.debt).v0, t(Bs.debt).v1, '', B));
    const rh = Math.min(0.2, 6.6 / (rows.length + 1));
    s.addTable([[{text: 'Month-end balances', options: {bold: true}}, {text: mShort(Bs.m0), options: {bold: true, align: 'right'}}, {text: mShort(Bs.m1), options: {bold: true, align: 'right'}}, {text: 'Var. $', options: {bold: true, align: 'right'}}, {text: 'Var. %', options: {bold: true, align: 'right'}}, {text: 'Comment', options: {bold: true}}], ...rows],
      {x: 0.35, y: 1.1, w: 7.3, colW: [2.2, 0.95, 0.95, 0.9, 0.65, 1.65], fontFace: F, fontSize: 8, rowH: rh, border: {type: 'none'}, autoPage: false});
    let yy = 1.2; [['balance-cash', 'Cash:'], ['balance-invest', 'Investing:'], ['balance-summary', 'Summary:']].forEach(([r, l]) => { const b = bullets(noteText('slide', r, y)); if (!b.length) return;
      s.addText(l, {x: 7.85, y: yy, w: 2.9, h: 0.3, fontFace: F, fontSize: 12, bold: true, underline: true}); yy += 0.3;
      const h = 0.25 + b.length * 0.42; bulletBox(s, b, {x: 7.85, y: yy, w: 2.9, h, fontSize: 10}); yy += h + 0.2; }); }
  // 7 · investing
  { const s = slide('Investing Status', 'College fund and nest egg');
    if (I.kidSeries.length) s.addChart(pp.ChartType.line, I.kidSeries.map(k => ({name: k.n, labels: I.ages.map(String), values: k.v.map(v => v == null ? null : Math.max(0, Math.round(v)))})), {x: 0.3, y: 1.15, w: 5.1, h: 3.6, showLegend: true, legendPos: 'b', legendFontSize: 9, lineSize: 2, lineDataSymbol: 'none', catAxisTitle: 'Age', showCatAxisTitle: true, valAxisLabelFontSize: 8, catAxisLabelFontSize: 8, chartColors: ['1A8F4E', '2A78D6', 'EDA100', '6250D6', 'EB6834'], valGridLine: {color: 'E6E6E6', size: 0.5}});
    if (I.nest) s.addChart(pp.ChartType.line, [{name: 'Plan median', labels: I.nest.ages.map(String), values: I.nest.v.map(v => Math.round(v / 1000))}], {x: 5.6, y: 1.15, w: 5.1, h: 3.6, showLegend: false, lineSize: 2.5, lineDataSymbol: 'none', catAxisTitle: 'Age', showCatAxisTitle: true, valAxisTitle: '$ thousands', showValAxisTitle: true, valAxisLabelFontSize: 8, catAxisLabelFontSize: 8, chartColors: [GREEN], valGridLine: {color: 'E6E6E6', size: 0.5}});
    s.addText('529 Accounts Key Points', {x: 0.35, y: 4.95, w: 5, h: 0.3, fontFace: F, fontSize: 12, bold: true, underline: true});
    bulletBox(s, bullets(noteText('slide', 'invest-529', y)), {x: 0.35, y: 5.3, w: 5, h: 2.6, fontSize: 11});
    s.addText('Schwab + 401k Accounts Key Points', {x: 5.65, y: 4.95, w: 5, h: 0.3, fontFace: F, fontSize: 12, bold: true, underline: true});
    bulletBox(s, bullets(noteText('slide', 'invest-nest', y)), {x: 5.65, y: 5.3, w: 5, h: 2.6, fontSize: 11}); }
  // 8 · trends
  { const s = slide(`${TR.years[0] || y}+ Annual Trends`, 'Life is expensive');
    s.addText('Key Points', {x: 0.35, y: 1.15, w: 5, h: 0.3, fontFace: F, fontSize: 12, bold: true, underline: true});
    bulletBox(s, bullets(noteText('slide', 'trends', y)), {x: 0.35, y: 1.5, w: 5, h: 2.8, fontSize: 11});
    const pos = [[5.6, 1.15], [0.3, 4.55], [5.6, 4.55]];
    TR.charts.slice(0, 3).forEach((c, i) => { const [x, yy] = pos[i]; s.addText(c.t + ' Trends', {x: x + 0.05, y: yy, w: 5, h: 0.3, fontFace: F, fontSize: 12, bold: true, underline: true});
      s.addChart(c.series.length > 1 ? pp.ChartType.line : pp.ChartType.bar, c.series.map(se => ({name: se.n, labels: TR.years.map(yy => yy === TR.est ? yy + ' est' : String(yy)), values: se.v.map(Math.round)})), {x, y: yy + 0.3, w: 5.1, h: 3.0, showLegend: c.series.length > 1, legendPos: 'b', legendFontSize: 8, lineSize: 2, lineDataSymbol: 'none', valAxisLabelFontSize: 8, catAxisLabelFontSize: 8, chartColors: c.series.length > 1 ? [GREEN, '2A78D6'] : [GREEN], valGridLine: {color: 'E6E6E6', size: 0.5}}); }); }
  // 8b · every category, last six years (current year estimated)
  { const yrs = TR.years.slice(-6), idx = yrs.map(yy => TR.years.indexOf(yy)), rows = TR.all.filter(r => r.g !== 'Income').slice(0, 30);
    const s = slide('Annual Trends by Category', TR.est ? `${TR.est} estimated: Jan–${MON[TR.estThrough - 1]} actual + budget for the rest of the year` : 'Full-year totals');
    const half = Math.ceil(rows.length / 2), cols = [rows.slice(0, half), rows.slice(half)];
    cols.forEach((list, k) => list.length && table(s, ['Category', ...yrs.map(yy => yy === TR.est ? yy + ' est' : String(yy))], list.map(r => [r.c, ...idx.map(i => ({text: num(r.v[i]), options: {align: 'right'}}))]),
      {x: 0.35 + k * 5.25, y: 1.15, w: 5.05, rowH: 0.21, fontSize: 7.5}, [1.55, ...yrs.map(() => 3.5 / yrs.length)])); }
  // 9 · closing
  { const s = pp.addSlide(); const [a, b] = (S.closing || 'Thank you for coming to my TED talk · Questions?').split('·').map(x => x.trim());
    s.addText((a || '').toUpperCase(), {x: 0.6, y: 2.6, w: 9.8, h: 1.6, fontFace: F, fontSize: 40, bold: true, color: GREEN}); if (b) s.addText(b.toUpperCase(), {x: 0.6, y: 4.4, w: 9.8, h: 0.8, fontFace: F, fontSize: 28, color: '000000'}); }
  await pp.writeFile({fileName: `${y + 1}_01 - BvA.pptx`});
}
const defTitle = () => { const n = (CTX.household.name || 'Our').trim(); return (/family/i.test(n) ? n : n + ' Family').toUpperCase(); };
const MON_LONG = m => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1];
