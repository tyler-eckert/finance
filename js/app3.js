/* =====================================================================
   ANALYSIS FILTER · LOANS & AMORTIZATION · ASSETS
   ===================================================================== */
Object.assign(I, {
  filter: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  car: '<path d="M5 16l1.5-5a2 2 0 012-1.5h7a2 2 0 012 1.5L19 16"/><rect x="3" y="16" width="18" height="3" rx="1"/><circle cx="7.5" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h2M16 15v3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
});
const D3 = DATA3;

/* ---------------- analysis filter (exclude categories from analysis) ---------------- */
const hasCat = n => ST.cats.some(c => c.name === n);
ST.excl = new Set((CTX.prefs.excl ?? ['Tax']).filter(hasCat));
const FPRESETS = [
  {k: 'all', l: 'Everything', s: []},
  {k: 'tax', l: 'Without taxes', s: ['Tax']},
  {k: 'core', l: 'Without taxes & distributions', s: ['Tax', 'Distributions']},
  {k: 'living', l: 'Core living costs', s: ['Tax', 'Distributions', 'Vacation', 'Lawn/Homecare', 'Other Income']},
].map(p => ({...p, s: p.s.filter(hasCat)})).filter((p, i, a) => i === 0 || p.s.length && a.findIndex(q => q.s.join() === p.s.join()) === i);
const exclLabel = () => ST.excl.size ? 'excl. ' + [...ST.excl].slice(0, 3).join(', ').toLowerCase() + (ST.excl.size > 3 ? ` +${ST.excl.size - 3}` : '') : 'all categories';
function cashflowByMonth(y) {
  const inc = [], exp = [];
  for (let m = 1; m <= ASOF.m; m++) {
    const {A} = actuals(y, m, m); let a = 0, b = 0;
    for (const c in A) { if (ST.excl.has(c)) continue; const g = groupOf(c); if (g === 'Income') a += A[c]; else if (/Expense/.test(g)) b -= A[c]; }
    inc.push(a); exp.push(b);
  }
  return {inc, exp};
}
function filterBtnSync() {
  const b = $('#filterBtn'); if (!b) return;
  b.style.display = ['overview', 'budget'].includes(cur) ? '' : 'none';
  b.innerHTML = `${icon('filter')}<span>${ST.excl.size ? ST.excl.size + ' excluded' : 'All categories'}</span>`;
  b.classList.toggle('active-f', ST.excl.size > 0);
}
function openFilter(e) {
  e && e.stopPropagation();
  const p = $('#fltPop'), r = $('#filterBtn').getBoundingClientRect();
  const draw = () => {
    p.innerHTML = `<div class="flt-h"><b>Include in analysis</b><button class="link" id="fltClr">Reset</button></div>
      <div class="flt-presets">${FPRESETS.map(x => `<button data-p="${x.k}" class="${x.s.length === ST.excl.size && x.s.every(s => ST.excl.has(s)) ? 'on' : ''}">${x.l}</button>`).join('')}</div>
      <div class="flt-list">${GROUPS.filter(g => g.k !== 'TTS').map(g => `<div class="flt-g">${g.l}</div>` + ST.cats.filter(c => c.group === g.k).map(c => `<label><input type="checkbox" data-c="${esc(c.name)}" ${ST.excl.has(c.name) ? '' : 'checked'}><span>${esc(c.name)}</span></label>`).join('')).join('')}</div>
      <div class="muted" style="font-size:11.5px;padding:8px 4px 2px">Applies to Overview and Budget, including KPIs, charts, the waterfall and yearly totals. Transfers to savings are never counted.</div>`;
    $$('[data-p]', p).forEach(b => b.onclick = ev => { ev.stopPropagation(); ST.excl = new Set(FPRESETS.find(x => x.k === b.dataset.p).s); draw(); render(); });
    $$('input[data-c]', p).forEach(cb => cb.onchange = ev => { ev.stopPropagation(); cb.checked ? ST.excl.delete(cb.dataset.c) : ST.excl.add(cb.dataset.c); draw(); render(); });
    $('#fltClr').onclick = ev => { ev.stopPropagation(); ST.excl = new Set(['Tax'].filter(hasCat)); draw(); render(); };
  };
  draw();
  p.style.top = (r.bottom + 8) + 'px'; p.style.right = Math.max(8, innerWidth - r.right) + 'px';
  p.classList.toggle('on');
}
document.addEventListener('click', e => { const p = $('#fltPop'); if (p && p.classList.contains('on') && !p.contains(e.target)) p.classList.remove('on'); });
const exclBanner = () => ST.excl.size ? `<div class="flt-banner">${icon('filter')}<span>Excluding <b>${[...ST.excl].map(esc).join(', ')}</b> from this analysis</span><button class="link" onclick="ST.excl.clear();render()">Show everything</button></div>` : '';

/* ---------------- loan math ---------------- */
const ymAdd = (ym, k) => { let [y, m] = ym.split('-').map(Number); m += k; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return `${y}-${String(m).padStart(2, '0')}`; };
const ymDiff = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const NOW = [CTX.ASOF_YM, BS.months[BS.months.length - 1]].sort().pop();
const pmtCalc = (P, r, n) => { const i = r / 12; return i ? P * i / (1 - Math.pow(1 + i, -n)) : P / n; };
function solveRate(P, pmt, n) { if (pmt * n <= P + .5) return 0; let lo = 0, hi = .6; for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; pmtCalc(P, mid, n) > pmt ? hi = mid : lo = mid; } return (lo + hi) / 2; }
function schedule({P, rate, n, start, pmt, extra = 0, lumps = []}) {
  const i = rate / 12; pmt = pmt ?? pmtCalc(P, rate, n);
  const rows = []; let b = P, m = start;
  for (let k = 1; b > .005 && k <= n + 1200; k++) {
    const int = b * i; let prin = Math.min(Math.max(pmt - int, 0), b);
    let ex = Math.min(extra + sum(lumps.filter(l => l.m === m).map(l => l.amt)), b - prin); ex = Math.max(0, ex);
    const end = b - prin - ex; rows.push({k, m, beg: b, pay: prin + int, prin, int, extra: ex, end: end < .005 ? 0 : end}); b = end; m = ymAdd(m, 1);
  }
  return rows;
}
ST.loans = D3.loans.map(l => { const r = l.rate ?? (l.pmt && l.n ? solveRate(l.principal, l.pmt, l.n) : null); return {...l, actual: {...l.actual}, rate: r != null && r < .001 ? 0 : r}; });
const loanById = id => ST.loans.find(l => l.id === id);
const SCHED = new Map();
const fullSched = l => { if (!l.n || l.rate == null) return []; const k = JSON.stringify([l.principal, l.rate, l.n, l.start, l.pmt]); if (!SCHED.has(k)) SCHED.set(k, schedule({P: l.principal, rate: l.rate, n: l.n, start: l.start, pmt: l.pmt})); return SCHED.get(k); };
// statement if present, else the last statement rolled forward on the loan's terms, else the origination schedule (mirrors v_loan_balances_filled)
function loanBal(l, ym = NOW) {
  if (l.status === 'paid') { if (l.paid && ym >= l.paid) return 0; let v = 0; for (const k of Object.keys(l.actual).sort()) if (k <= ym) v = l.actual[k]; return v; }
  if (l.actual[ym] != null) return l.actual[ym];
  const ks = Object.keys(l.actual).filter(k => k < ym).sort(), last = ks[ks.length - 1];
  if (last && l.pmt && l.rate != null) { let b = l.actual[last]; const i = l.rate / 12; for (let m = ymAdd(last, 1); m <= ym && b > 0; m = ymAdd(m, 1)) b = Math.max(0, b - Math.max(l.pmt - b * i, 0)); return b; }
  if (last) return l.actual[last];
  if (ym < l.start) return ym >= ymAdd(l.start, -1) ? l.principal : 0;
  const r = fullSched(l).find(x => x.m === ym); return r ? r.end : 0;
}
function remaining(l, extra = 0, lumps = []) {
  const bal = loanBal(l), start = ymAdd(NOW, 1), left = Math.max(1, (l.n || 600) - ymDiff(l.start, NOW) - 1);
  if (!bal || l.rate == null) return [];
  return schedule({P: bal, rate: l.rate, n: left, start, pmt: l.pmt ?? undefined, extra, lumps});
}
function loanPayoff(id) { const l = loanById(id); const r = l ? remaining(l) : []; return r.length ? r[r.length - 1].m : NOW; }
const pctRate = r => (r * 100).toFixed(r * 100 < 10 ? 2 : 1).replace(/\.?0+$/, '') + '%';

/* ---------------- LOANS page ---------------- */
const LS = {view: 'loans', sel: null, extra: 0, lump: 0, lumpM: ymAdd(NOW, 5), refiRate: 6, refiCost: 2, refiTerm: 30, open: new Set()};
const BLD = {P: 300000, rate: 6.5, years: 30, start: ymAdd(NOW, 1), extra: 0, lump: 0, lumpM: ymAdd(NOW, 10), cmp: true, rate2: 6.0, years2: 15};
(() => { const m = ST.loans.find(l => l.status === 'active' && l.type === 'Mortgage' && l.rate != null && l.n); if (!m) return;
  Object.assign(BLD, {P: Math.round(loanBal(m)), rate: +(m.rate * 100).toFixed(3), years: Math.max(1, Math.ceil(remaining(m).length / 12)), rate2: Math.max(1, +(m.rate * 100 - .75).toFixed(2))}); })();
function renderLoans(pg) {
  const seg = `<div class="seg" id="lnSeg"><button data-k="loans" class="${LS.view === 'loans' ? 'on' : ''}">My loans</button><button data-k="builder" class="${LS.view === 'builder' ? 'on' : ''}">Schedule builder</button></div>`;
  const tb = `<div class="toolbar">${seg}<button class="btn primary" style="margin-left:auto" onclick="openLoanModal()">${icon('plus')}<span>Add loan</span></button></div>`;
  if (LS.view === 'builder') { renderAmortBuilder(pg, tb); wireLnSeg(); return; }
  const act = ST.loans.filter(l => l.status === 'active'), paid = ST.loans.filter(l => l.status === 'paid');
  const owed = sum(act.map(l => loanBal(l))), mo = sum(act.map(l => l.pmt + (l.escrow || 0)));
  const cys = String(CY), int26 = sum(act.flatMap(l => fullSched(l).filter(r => r.m.startsWith(cys)).map(r => r.int))), pay26 = sum(act.flatMap(l => fullSched(l).filter(r => r.m.startsWith(cys)).map(r => r.pay)));
  const nonMort = act.filter(l => l.type !== 'Mortgage').map(l => loanPayoff(l.id)).sort().pop(), mort = act.find(l => l.type === 'Mortgage');
  const wRate = owed ? sum(act.map(l => loanBal(l) * (l.rate || 0))) / owed : 0;
  if (!loanById(LS.sel) || loanById(LS.sel).status !== 'active') LS.sel = act[0]?.id;
  const L = loanById(LS.sel);
  if (!L) { pg.innerHTML = tb + `<div class="card"><p class="muted">No active loans. Add one, or use the schedule builder.</p></div>`; wireLnSeg(); return; }
  pg.innerHTML = tb + `<div class="grid g-12">
    <div class="card c-3 kpi"><div class="label"><span class="ico">${icon('debt')}</span>Total owed</div><div class="val num">${short(owed)}</div><div class="delta">${act.length} active loans · ${pctRate(wRate)} weighted rate</div></div>
    <div class="card c-3 kpi"><div class="label"><span class="ico">${icon('cash')}</span>Monthly payments</div><div class="val num">${money(mo)}</div><div class="delta">incl. ${money(sum(act.map(l => l.escrow || 0)))} mortgage escrow</div></div>
    <div class="card c-3 kpi"><div class="label"><span class="ico">${icon('calc')}</span>Interest in ${CY}</div><div class="val num">${short(int26)}</div><div class="delta">${pay26 ? Math.round(int26 / pay26 * 100) : 0}% of loan payments</div></div>
    <div class="card c-3 kpi"><div class="label"><span class="ico">${icon('check')}</span>Debt-free (excl. mortgage)</div><div class="val num">${nonMort ? mLabel(nonMort) : 'Now'}</div><div class="delta">${mort ? 'Mortgage ends ' + mLabel(loanPayoff(mort.id)) : 'No mortgage'}</div></div>
    ${typeof loanDecisionCard === 'function' ? loanDecisionCard(act) : ''}
    ${act.map(l => { const b = loanBal(l), p = l.principal ? Math.max(0, 1 - b / l.principal) : 0; return `<button class="card c-3 loan-card ${l.id === LS.sel ? 'sel' : ''}" data-l="${l.id}"><div class="ln-top"><span class="ico">${icon(l.type === 'Mortgage' ? 'house' : l.type === 'Auto' ? 'car' : 'bank')}</span><div><div class="nm">${esc(l.name)}</div><div class="ds">${esc(l.lender)} · ${esc(l.type)}</div></div></div>
      <div class="ln-bal num">${money(b)}</div><div class="pbar" style="height:6px;margin:8px 0 6px"><i style="width:${p * 100}%"></i></div>
      <div class="ln-meta"><span>${l.rate != null ? pctRate(l.rate) : 'rate ?'}${l.rate === 0 ? ' promo' : ''}</span><span>${money(l.pmt || 0)}/mo</span><span>ends ${mShort(loanPayoff(l.id))}</span></div></button>`; }).join('')}
    <div class="card c-8"><div class="card-h"><div><h3>${esc(L.name)}</h3><div class="sub">${money(L.principal)} at ${L.rate != null ? pctRate(L.rate) : '—'} · ${L.n || '?'} payments from ${mLabel(L.start)}${Object.keys(L.actual).length ? ' · dots = statement balances' : ''}</div></div></div>
      <div class="stat-row" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
        <div class="mini"><div class="l">Balance</div><div class="v num">${short(loanBal(L))}</div></div>
        <div class="mini"><div class="l">Payment (P&I)</div><div class="v num">${money(L.pmt || 0)}</div></div>
        <div class="mini"><div class="l">Payments left</div><div class="v num">${remaining(L).length}</div></div>
        <div class="mini"><div class="l">Interest left</div><div class="v num">${short(sum(remaining(L).map(r => r.int)))}</div></div></div>
      <div class="chart" id="lnChart"></div><div class="legend" id="lnLegend"></div></div>
    <div class="card c-4"><div class="card-h"><div><h3>Pay it down faster</h3><div class="sub">Extra principal on top of the regular payment</div></div></div>
      <div class="ctrl"><div><label>Extra each month<b id="exV">${money(LS.extra)}</b></label><input type="range" id="exR" min="0" max="${L.type === 'Mortgage' ? 3000 : 1000}" step="${L.type === 'Mortgage' ? 50 : 25}" value="${LS.extra}"></div>
        <div class="form" style="grid-template-columns:1fr 1fr"><div><label>One-time payment</label><div class="amt-in"><span>$</span><input class="in num" id="lpA" inputmode="decimal" value="${LS.lump || ''}" placeholder="0"></div></div><div><label>In</label><input class="in" type="month" id="lpM" value="${LS.lumpM}"></div></div></div>
      <div id="exOut" class="ex-out"></div>
      ${L.type === 'Mortgage' ? `<div class="refi"><h4>Refinance check</h4>
        <div class="ctrl" style="gap:12px"><div><label>New rate<b id="rfV">${LS.refiRate.toFixed(2)}%</b></label><input type="range" id="rfR" min="4" max="7.5" step=".125" value="${LS.refiRate}"></div>
        <div class="form" style="grid-template-columns:1fr 1fr"><div><label>Closing costs</label><select class="in" id="rfC">${[1, 1.5, 2, 2.5, 3].map(c => `<option value="${c}" ${c === LS.refiCost ? 'selected' : ''}>${c}% of balance</option>`).join('')}</select></div><div><label>New term</label><select class="in" id="rfT">${[30, 20, 15].map(t => `<option ${t === LS.refiTerm ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div></div>
        <div id="rfOut" class="ex-out"></div></div>` : ''}
    </div>
    <div class="card c-12"><div class="card-h"><div><h3>Amortization schedule</h3><div class="sub">By year · expand for months · past payments shaded</div></div><div class="right"><button class="btn" id="lnCsv">${icon('download')}<span>Export CSV</span></button></div></div>
      <div class="scroll-x"><table class="table am" id="amTable"></table></div></div>
    <div class="card c-12"><div class="card-h"><div><h3>Paid off</h3><div class="sub">From your balance sheet history</div></div></div>
      <div class="paid-grid">${paid.map(l => { const ks = Object.keys(l.actual).sort(); if (!ks.length) return ''; return `<div class="paid"><div><div class="nm">${esc(l.name)}</div><div class="ds">${esc(l.type)} · peak ${short(l.principal)} · last balance ${mLabel(ks[ks.length - 1])}</div></div>${spark(ks.map(k => l.actual[k]), 'var(--s5)', 80, 26, false)}<span class="chip pos">${icon('check')} Paid</span></div>`; }).join('')}</div></div>
  </div>`;
  wireLnSeg();
  $$('.loan-card', pg).forEach(c => c.onclick = () => { LS.sel = c.dataset.l; LS.extra = 0; LS.lump = 0; LS.open.clear(); render(); });
  const lumps = () => LS.lump ? [{m: LS.lumpM, amt: LS.lump}] : [];
  const drawDetail = () => {
    const base = remaining(L), ext = remaining(L, LS.extra, lumps()), past = fullSched(L).filter(r => r.m <= NOW);
    if (!base.length) { $('#lnChart').innerHTML = '<p class="muted" style="padding:20px 0">Add the rate, term and payment to see the schedule.</p>'; $('#exOut').innerHTML = ''; $('#amTable').innerHTML = ''; return; }
    const months = past.map(r => r.m).concat(base.map(r => r.m));
    const sched = past.map(r => r.end).concat(base.map(r => r.end));
    const withX = (LS.extra || LS.lump) ? past.map(() => null).concat(base.map((r, i) => ext[i] ? ext[i].end : 0)) : null;
    if (withX && withX.length) withX[past.length - 1] = past[past.length - 1]?.end ?? null;
    const act = months.map(m => L.actual[m] ?? null);
    const series = [{name: 'Scheduled', values: sched, color: 'var(--s2)'}];
    if (withX) series.push({name: 'With extra payments', values: withX, color: 'var(--s1)', width: 2.5});
    lineChart($('#lnChart'), {labels: months, series, height: 300, zero: true, xGap: 70, xFmt: (lb, i, e) => i % e === 0 ? mShort(lb) : null, tipTitle: mLabel,
      vlines: [{i: past.length - 1, label: 'Today'}], tipExtra: i => act[i] != null ? tipRow('var(--text)', 'Statement', money(act[i])) : ''});
    // statement dots
    const svg = $('#lnChart svg'); if (svg && act.some(v => v != null)) {
      const vb = svg.viewBox.baseVal, n = months.length, all = sched.concat(withX || []).filter(v => v != null);
      const tk = niceTicks(Math.min(0, ...all), Math.max(...all) + (Math.max(...all)) * .04, 4); const y0 = tk[0], y1 = tk[tk.length - 1];
      act.forEach((v, i) => { if (v == null) return; const x = 52 + i * (vb.width - 66) / (n - 1), y = 12 + (1 - (v - y0) / (y1 - y0)) * (300 - 38); const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 2); c.setAttribute('style', 'fill:var(--text-2);pointer-events:none'); svg.insertBefore(c, svg.lastChild.previousSibling); });
    }
    $('#lnLegend').innerHTML = `<span><i class="sw" style="background:var(--s2)"></i>Scheduled</span>${withX ? '<span><i class="sw" style="background:var(--s1)"></i>With extra payments</span>' : ''}${act.some(v => v != null) ? '<span><i class="sw" style="background:var(--text);border-radius:50%"></i>Statement balance</span>' : ''}`;
    const saved = sum(base.map(r => r.int)) - sum(ext.map(r => r.int)), ms = base.length - ext.length;
    $('#exOut').innerHTML = (LS.extra || LS.lump) ? `<div class="ex-row"><span>New payoff</span><b>${mLabel(ext[ext.length - 1].m)}</b></div><div class="ex-row"><span>Time saved</span><b>${Math.floor(ms / 12) ? Math.floor(ms / 12) + ' yr ' : ''}${ms % 12} mo</b></div><div class="ex-row big"><span>Interest saved</span><b class="pos">${money(saved)}</b></div>${L.rate < DATA.assume.rate + .025 ? `<p class="muted" style="font-size:11.5px;margin-top:6px">At ${pctRate(L.rate)}, this loan costs less than the ${pctRate(DATA.assume.rate + .025)} return assumed in Plan, so extra payments here trade growth for certainty.</p>` : `<p class="muted" style="font-size:11.5px;margin-top:6px">At ${pctRate(L.rate)}, each extra dollar earns a guaranteed ${pctRate(L.rate)}, above the ${pctRate(DATA.assume.rate + .025)} return assumed in Plan.</p>`}`
      : `<div class="ex-row"><span>Payoff</span><b>${mLabel(base[base.length - 1].m)}</b></div><div class="ex-row"><span>Interest remaining</span><b>${money(sum(base.map(r => r.int)))}</b></div><p class="muted" style="font-size:11.5px;margin-top:6px">Move the slider or add a one-time payment to compare.</p>`;
    if (L.type === 'Mortgage') {
      const bal = loanBal(L), cost = bal * LS.refiCost / 100, nn = LS.refiTerm * 12, np = pmtCalc(bal, LS.refiRate / 100, nn);
      const newInt = np * nn - bal, oldInt = sum(base.map(r => r.int)), d = L.pmt - np, be = d > 0 ? Math.ceil(cost / d) : null;
      $('#rfOut').innerHTML = `<div class="ex-row"><span>New P&I payment</span><b>${money(np)}</b></div><div class="ex-row"><span>Monthly change</span><b class="${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '−' : '+'}${money(Math.abs(d))}</b></div><div class="ex-row"><span>Closing costs</span><b>${money(cost)}</b></div><div class="ex-row"><span>Break-even</span><b>${be ? (be >= 12 ? (be / 12).toFixed(1) + ' yrs' : be + ' mo') : 'n/a'}</b></div><div class="ex-row big"><span>Lifetime interest</span><b class="${newInt + cost < oldInt ? 'pos' : 'neg'}">${newInt + cost < oldInt ? '−' : '+'}${short(Math.abs(oldInt - newInt - cost))}</b></div>`;
    }
    // table
    const rows = past.concat(ext.length ? ext : base), years = [...new Set(rows.map(r => r.m.slice(0, 4)))];
    let h = '<tr><th>Year</th><th>Payments</th><th>Principal</th><th>Interest</th><th>Extra</th><th>Ending balance</th></tr>';
    years.forEach(y => { const rs = rows.filter(r => r.m.startsWith(y)), op = LS.open.has(y), isPast = rs[rs.length - 1].m <= NOW;
      h += `<tr class="click ${isPast ? 'past' : ''} ${y === NOW.slice(0, 4) ? 'curyr' : ''}" data-y="${y}"><td><span class="tw"><span class="chev ${op ? 'on' : ''}">${icon('chev', 2.4)}</span>${y}</span></td><td>${money(sum(rs.map(r => r.pay + r.extra)))}</td><td>${money(sum(rs.map(r => r.prin)))}</td><td>${money(sum(rs.map(r => r.int)))}</td><td class="${sum(rs.map(r => r.extra)) ? 'pos' : 'muted'}">${sum(rs.map(r => r.extra)) ? money(sum(rs.map(r => r.extra))) : '—'}</td><td><b>${money(rs[rs.length - 1].end)}</b></td></tr>`;
      if (op) rs.forEach(r => h += `<tr class="sub ${r.m <= NOW ? 'past' : ''}"><td><span class="sub-name">${MON[+r.m.slice(5) - 1]}${L.actual[r.m] != null ? ` <span class="muted" style="font-size:11px">· stmt ${short(L.actual[r.m])}</span>` : ''}</span></td><td>${money(r.pay + r.extra, 2)}</td><td>${money(r.prin, 2)}</td><td>${money(r.int, 2)}</td><td>${r.extra ? money(r.extra, 2) : ''}</td><td>${money(r.end, 2)}</td></tr>`);
    });
    $('#amTable').innerHTML = h;
    $$('#amTable tr[data-y]').forEach(tr => tr.onclick = () => { const y = tr.dataset.y; LS.open.has(y) ? LS.open.delete(y) : LS.open.add(y); drawDetail(); });
    $('#lnCsv').onclick = () => csvDownload(`${L.name.replace(/\W+/g, '_')}_schedule.csv`, [['#', 'Month', 'Beginning', 'Payment', 'Principal', 'Interest', 'Extra', 'Ending']].concat(rows.map((r, i) => [i + 1, r.m, r.beg.toFixed(2), r.pay.toFixed(2), r.prin.toFixed(2), r.int.toFixed(2), r.extra.toFixed(2), r.end.toFixed(2)])));
  };
  $('#exR').oninput = e => { LS.extra = +e.target.value; $('#exV').textContent = money(LS.extra); drawDetail(); };
  $('#lpA').onchange = e => { LS.lump = +(e.target.value.replace(/[$,]/g, '')) || 0; drawDetail(); };
  $('#lpM').onchange = e => { LS.lumpM = e.target.value; drawDetail(); };
  if ($('#rfR')) { $('#rfR').oninput = e => { LS.refiRate = +e.target.value; $('#rfV').textContent = LS.refiRate.toFixed(2) + '%'; drawDetail(); }; $('#rfC').onchange = e => { LS.refiCost = +e.target.value; drawDetail(); }; $('#rfT').onchange = e => { LS.refiTerm = +e.target.value; drawDetail(); }; }
  CH.push(drawDetail);
}
function wireLnSeg() { $$('#lnSeg button').forEach(b => b.onclick = () => { LS.view = b.dataset.k; render(); }); }
function csvDownload(name, rows) {
  const blob = new Blob([rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n')], {type: 'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- amortization schedule builder ---------------- */
function renderAmortBuilder(pg, tb) {
  const B = BLD, n = B.years * 12;
  const lumps = B.lump ? [{m: B.lumpM, amt: B.lump}] : [];
  const A1 = schedule({P: B.P, rate: B.rate / 100, n, start: B.start, extra: B.extra, lumps});
  const A0 = (B.extra || B.lump) ? schedule({P: B.P, rate: B.rate / 100, n, start: B.start}) : null;
  const A2 = B.cmp ? schedule({P: B.P, rate: B.rate2 / 100, n: B.years2 * 12, start: B.start, extra: B.extra, lumps}) : null;
  const pay = pmtCalc(B.P, B.rate / 100, n), tot = s => sum(s.map(r => r.int));
  const fld = (id, l, v, attrs = '') => `<div><label>${l}</label><input class="in num" id="${id}" value="${v}" ${attrs}></div>`;
  pg.innerHTML = tb + `<div class="grid g-12">
    <div class="card c-4"><div class="card-h"><div><h3>Loan terms</h3><div class="sub">Model any loan, then save it to My loans</div></div></div>
      <div class="form" style="grid-template-columns:1fr 1fr">
        <div style="grid-column:1/-1"><label>Amount borrowed</label><div class="amt-in"><span>$</span><input class="in num" id="bP" inputmode="decimal" value="${B.P.toLocaleString()}"></div></div>
        ${fld('bR', 'Interest rate (%)', B.rate, 'inputmode="decimal"')}${fld('bY', 'Term (years)', B.years, 'inputmode="numeric"')}
        <div><label>First payment</label><input class="in" type="month" id="bS" value="${B.start}"></div>
        <div><label>Extra / month</label><div class="amt-in"><span>$</span><input class="in num" id="bX" inputmode="decimal" value="${B.extra || ''}" placeholder="0"></div></div>
        <div><label>One-time extra</label><div class="amt-in"><span>$</span><input class="in num" id="bL" inputmode="decimal" value="${B.lump || ''}" placeholder="0"></div></div>
        <div><label>Paid in</label><input class="in" type="month" id="bLM" value="${B.lumpM}"></div>
      </div>
      <label class="tgl" style="margin:16px 0 10px"><input type="checkbox" id="bC" ${B.cmp ? 'checked' : ''}> Compare with a second scenario</label>
      ${B.cmp ? `<div class="form" style="grid-template-columns:1fr 1fr">${fld('bR2', 'Scenario B rate (%)', B.rate2, 'inputmode="decimal"')}${fld('bY2', 'Scenario B term (yrs)', B.years2, 'inputmode="numeric"')}</div>` : ''}
      <div class="presets"><span class="muted" style="font-size:11.5px">Start from:</span>${ST.loans.filter(l => l.status === 'active').map(l => `<button class="chip" data-pre="${l.id}">${esc(l.name)}</button>`).join('')}</div>
      <button class="btn primary" id="bSave" style="width:100%;justify-content:center;margin-top:16px">${icon('plus')}<span>Save as a loan</span></button></div>
    <div class="c-8" style="display:flex;flex-direction:column;gap:18px;min-width:0">
      <div class="grid" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:12px">
        <div class="card kpi"><div class="label">Monthly payment</div><div class="val num">${money(pay)}</div><div class="delta">${B.extra ? '+ ' + money(B.extra) + ' extra' : 'principal & interest'}</div></div>
        <div class="card kpi"><div class="label">Total interest</div><div class="val num">${short(tot(A1))}</div><div class="delta">${A0 ? `<span class="pos">${short(tot(A0) - tot(A1))} saved</span>` : Math.round(tot(A1) / B.P * 100) + '% of amount'}</div></div>
        <div class="card kpi"><div class="label">Payoff</div><div class="val num">${mShort(A1[A1.length - 1].m)}</div><div class="delta">${A1.length} payments${A0 ? ` · ${A0.length - A1.length} fewer` : ''}</div></div>
        <div class="card kpi"><div class="label">Total paid</div><div class="val num">${short(B.P + tot(A1))}</div></div>
      </div>
      ${A2 ? `<div class="card"><div class="card-h" style="margin-bottom:6px"><div><h3>Scenario A vs. B</h3></div></div>
        <table class="table cmp"><tr><th></th><th>A · ${B.rate}% / ${B.years} yr</th><th>B · ${B.rate2}% / ${B.years2} yr</th><th>Difference</th></tr>
        ${[['Monthly payment', pay, pmtCalc(B.P, B.rate2 / 100, B.years2 * 12), money], ['Total interest', tot(A1), tot(A2), money], ['Payments', A1.length, A2.length, v => v]].map(([l, a, b, f]) => `<tr><td>${l}</td><td>${f(a)}</td><td>${f(b)}</td><td class="${b < a ? 'pos' : b > a ? 'neg' : 'muted'}">${b === a ? '—' : (b > a ? '+' : '−') + String(f(Math.abs(b - a))).replace('−', '')}</td></tr>`).join('')}</table></div>` : ''}
      <div class="card"><div class="card-h"><div><h3>Principal vs. interest by year</h3><div class="sub">Scenario A${B.extra || B.lump ? ', with extra payments' : ''}</div></div></div><div class="chart" id="bdChart"></div>
        <div class="legend"><span><i class="sw" style="background:var(--s1)"></i>Principal</span><span><i class="sw" style="background:var(--s3)"></i>Interest</span></div></div>
    </div>
    <div class="card c-12"><div class="card-h"><div><h3>Schedule</h3><div class="sub">Scenario A · by year, expand for months</div></div><div class="right"><button class="btn" id="bCsv">${icon('download')}<span>Export CSV</span></button></div></div><div class="scroll-x"><table class="table am" id="bTable"></table></div></div>
  </div>`;
  const num = v => +(String(v).replace(/[$,%\s]/g, '')) || 0;
  const bind = (id, k, f = num) => $(id) && ($(id).onchange = e => { B[k] = f(e.target.value); render(); });
  bind('#bP', 'P'); bind('#bR', 'rate'); bind('#bY', 'years', v => Math.max(1, Math.round(num(v)))); bind('#bS', 'start', v => v); bind('#bX', 'extra'); bind('#bL', 'lump'); bind('#bLM', 'lumpM', v => v);
  bind('#bR2', 'rate2'); bind('#bY2', 'years2', v => Math.max(1, Math.round(num(v))));
  $('#bC').onchange = e => { B.cmp = e.target.checked; render(); };
  $$('[data-pre]', pg).forEach(b => b.onclick = () => { const l = loanById(b.dataset.pre); Object.assign(B, {P: Math.round(loanBal(l)), rate: +(l.rate * 100).toFixed(3), years: Math.max(1, Math.ceil(remaining(l).length / 12)), start: ymAdd(NOW, 1), extra: 0, lump: 0}); render(); });
  $('#bSave').onclick = () => openLoanModal({principal: B.P, rate: B.rate, n: n, start: B.start});
  const years = [...new Set(A1.map(r => r.m.slice(0, 4)))];
  let h = '<tr><th>Year</th><th>Payments</th><th>Principal</th><th>Interest</th><th>Extra</th><th>Ending balance</th></tr>';
  years.forEach(y => { const rs = A1.filter(r => r.m.startsWith(y)), op = LS.open.has('b' + y);
    h += `<tr class="click" data-y="${y}"><td><span class="tw"><span class="chev ${op ? 'on' : ''}">${icon('chev', 2.4)}</span>${y}</span></td><td>${money(sum(rs.map(r => r.pay + r.extra)))}</td><td>${money(sum(rs.map(r => r.prin)))}</td><td>${money(sum(rs.map(r => r.int)))}</td><td class="${sum(rs.map(r => r.extra)) ? 'pos' : 'muted'}">${sum(rs.map(r => r.extra)) ? money(sum(rs.map(r => r.extra))) : '—'}</td><td><b>${money(rs[rs.length - 1].end)}</b></td></tr>`;
    if (op) rs.forEach(r => h += `<tr class="sub"><td><span class="sub-name">${MON[+r.m.slice(5) - 1]} · #${r.k}</span></td><td>${money(r.pay + r.extra, 2)}</td><td>${money(r.prin, 2)}</td><td>${money(r.int, 2)}</td><td>${r.extra ? money(r.extra, 2) : ''}</td><td>${money(r.end, 2)}</td></tr>`); });
  $('#bTable').innerHTML = h;
  $$('#bTable tr[data-y]').forEach(tr => tr.onclick = () => { const k = 'b' + tr.dataset.y; LS.open.has(k) ? LS.open.delete(k) : LS.open.add(k); render(); });
  $('#bCsv').onclick = () => csvDownload('amortization_schedule.csv', [['#', 'Month', 'Beginning', 'Payment', 'Principal', 'Interest', 'Extra', 'Ending']].concat(A1.map(r => [r.k, r.m, r.beg.toFixed(2), r.pay.toFixed(2), r.prin.toFixed(2), r.int.toFixed(2), r.extra.toFixed(2), r.end.toFixed(2)])));
  CH.push(() => { const pr = years.map(y => sum(A1.filter(r => r.m.startsWith(y)).map(r => r.prin + r.extra))), it = years.map(y => sum(A1.filter(r => r.m.startsWith(y)).map(r => r.int)));
    barChart($('#bdChart'), {labels: years, series: [{name: 'Principal', values: pr, color: 'var(--s1)'}, {name: 'Interest', values: it, color: 'var(--s3)'}], height: 220, xGap: 46, tipTitle: y => y, tipExtra: i => tipRow(null, 'Ending balance', money(A1.filter(r => r.m.startsWith(years[i])).pop().end))}); });
}
function openLoanModal(pre = {}) {
  const m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Add loan</h2><p class="muted" style="font-size:12.5px">Payment and schedule are calculated; enter the payment from your statement to override.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="form">
    <div style="grid-column:1/-1"><label>Name</label><input class="in" id="lN" placeholder="e.g. Boat loan"></div>
    <div><label>Lender</label><input class="in" id="lLe" placeholder="Bank"></div>
    <div><label>Type</label><select class="in" id="lT">${['Mortgage', 'Auto', 'Equipment', 'Home improvement', 'HELOC', 'Personal', 'Student', 'Other'].map(t => `<option>${t}</option>`).join('')}</select></div>
    <div><label>Original amount</label><div class="amt-in"><span>$</span><input class="in num" id="lP" value="${pre.principal ? Math.round(pre.principal).toLocaleString() : ''}"></div></div>
    <div><label>Rate (%)</label><input class="in num" id="lR" value="${pre.rate ?? ''}" placeholder="e.g. 6.25"></div>
    <div><label>Term (months)</label><input class="in num" id="lNn" value="${pre.n ?? 60}"></div>
    <div><label>First payment</label><input class="in" type="month" id="lS" value="${pre.start ?? ymAdd(NOW, 1)}"></div>
    <div><label>Payment (optional)</label><div class="amt-in"><span>$</span><input class="in num" id="lPm" placeholder="auto"></div></div>
    <div><label>Escrow / fees per month</label><div class="amt-in"><span>$</span><input class="in num" id="lE" placeholder="0"></div></div>
    <div style="grid-column:1/-1"><label>Secured by</label><select class="in" id="lA"><option value="">Nothing / unsecured</option>${ST.assets.filter(a => a.status === 'active').map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="lGo">Add loan</button></div>`;
  openLayer('modal');
  $('#lGo').onclick = () => { const v = id => +($(id).value.replace(/[$,%\s]/g, '')) || 0; const name = $('#lN').value.trim(); if (!name || !v('#lP')) return $('#lN').focus();
    const l = {id: 'l' + Date.now(), name, lender: $('#lLe').value, type: $('#lT').value, principal: v('#lP'), rate: v('#lR') / 100, n: v('#lNn') || 60, start: $('#lS').value, escrow: v('#lE'), actual: {}, asset: $('#lA').value || null, status: 'active'};
    l.pmt = v('#lPm') || +pmtCalc(l.principal, l.rate, l.n).toFixed(2); if (!v('#lR') && v('#lPm')) l.rate = solveRate(l.principal, l.pmt, l.n);
    ST.loans.push(l); LS.sel = l.id; LS.view = 'loans'; closeAll(); go('loans'); toast(`Added ${name} · ${money(l.pmt, 2)}/mo`); };
}

/* ---------------- ASSETS page ---------------- */
ST.assets = D3.assets.map(a => ({...a, vals: {...a.vals}, src: {}}));
const AS = {range: 'all', mode: 'value', sold: false};
const assetAt = (a, ym) => { let v = null; for (const k of Object.keys(a.vals).sort()) { if (k <= ym) v = a.vals[k]; else break; } return v; };
const lastVal = a => { const ks = Object.keys(a.vals).sort(); return {m: ks[ks.length - 1], v: a.vals[ks[ks.length - 1]]}; };
const lastChange = a => { const ks = Object.keys(a.vals).sort(); let m = ks[0]; for (let i = 1; i < ks.length; i++) if (a.vals[ks[i]] !== a.vals[ks[i - 1]]) m = ks[i]; return m; };
const modelVal = a => { const lv = lastVal(a), mc = lastChange(a), yrs = ymDiff(mc, NOW) / 12; const r = (a.ratePct || 0) / 100; return a.method === 'appreciation' ? lv.v * Math.pow(1 + r, yrs) : a.method === 'depreciation' ? lv.v * Math.pow(1 - r, yrs) : lv.v; };
const loanFor = a => a.loan ? loanById(a.loan) : null;
function renderAssets(pg) {
  const act = ST.assets.filter(a => a.status === 'active'), sold = ST.assets.filter(a => a.status === 'sold');
  const val = sum(act.map(a => lastVal(a).v)), debt = sum(act.map(a => loanFor(a) ? loanBal(loanFor(a)) : 0));
  const prev = sum(act.map(a => assetAt(a, ymAdd(NOW, -12)) ?? 0));
  const months = (() => { const st = AS.range === '1y' ? ymAdd(NOW, -12) : AS.range === '3y' ? ymAdd(NOW, -36) : ymAdd(NOW, -72); const o = []; for (let m = st; m <= NOW; m = ymAdd(m, 1)) o.push(m); return o; })();
  const list = AS.sold ? act.concat(sold) : act;
  const COLS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
  pg.innerHTML = `<div class="toolbar wrap">
    <div class="seg" id="asR">${['1y', '3y', 'all'].map(k => `<button data-k="${k}" class="${AS.range === k ? 'on' : ''}">${k.toUpperCase()}</button>`).join('')}</div>
    <div class="seg" id="asM"><button data-k="value" class="${AS.mode === 'value' ? 'on' : ''}">Value</button><button data-k="equity" class="${AS.mode === 'equity' ? 'on' : ''}">Equity</button></div>
    <label class="tgl"><input type="checkbox" id="asS" ${AS.sold ? 'checked' : ''}> Include sold</label>
    <button class="btn primary" style="margin-left:auto" onclick="openAssetModal()">${icon('plus')}<span>Add asset</span></button></div>
  <div class="grid g-12">
    <div class="card c-3 kpi"><div class="label"><span class="ico">${icon('house')}</span>Asset value</div><div class="val num">${short(val)}</div><div class="delta">${act.length} active assets</div></div>
    <div class="card c-3 kpi"><div class="label"><span class="ico">${icon('save')}</span>Equity</div><div class="val num">${short(val - debt)}</div><div class="delta">${val ? Math.round((val - debt) / val * 100) : 0}% of value owned</div></div>
    <div class="card c-3 kpi"><div class="label"><span class="ico">${icon('debt')}</span>Loans against assets</div><div class="val num">${short(debt)}</div><div class="delta"><button class="link" onclick="go('loans')">View loans →</button></div></div>
    <div class="card c-3 kpi"><div class="label"><span class="ico">${icon('invest')}</span>Value change · 12 mo</div><div class="val num">${short(val - prev)}</div><div class="delta">${chip(prev ? (val - prev) / prev : 0)}</div></div>
    <div class="card c-12"><div class="card-h"><div><h3>${AS.mode === 'value' ? 'Value' : 'Equity'} over time</h3><div class="sub">${AS.mode === 'value' ? 'Recorded estimates, carried forward between updates' : 'Value less the linked loan balance'}</div></div></div>
      <div class="chart" id="asChart"></div><div class="legend">${list.map((a, i) => `<span><i class="sw" style="background:${a.status === 'sold' ? 'var(--text-3)' : COLS[i % 5]}"></i>${esc(a.name)}${a.status === 'sold' ? ' (sold)' : ''}</span>`).join('')}</div></div>
    ${act.map((a, i) => { const lv = lastVal(a), L = loanFor(a), lb = L ? loanBal(L) : 0, stale = ymDiff(lastChange(a), NOW), mv = modelVal(a), ks = Object.keys(a.vals).sort();
      return `<div class="card c-4 asset"><div class="card-h"><span class="ico" style="background:color-mix(in srgb,${COLS[i % 5]} 15%,transparent);color:${COLS[i % 5]}">${icon(a.type === 'Vehicle' ? 'car' : 'house')}</span><div><h3>${esc(a.name)}</h3><div class="sub">${esc(a.type)}${a.purchase ? ' · bought ' + mLabel(a.purchase) : ''}</div></div><div class="right"><button class="mini-btn" data-ed="${a.id}">${icon('edit')}</button></div></div>
        <div class="as-val num">${money(lv.v)}</div><div class="muted" style="font-size:12px">${a.cost ? `${lv.v >= a.cost ? '+' : '−'}${short(Math.abs(lv.v - a.cost))} vs. ${short(a.cost)} cost · ` : ''}updated ${mLabel(lastChange(a))}</div>
        <div style="margin:12px 0">${spark(ks.map(k => a.vals[k]), COLS[i % 5], 300, 36)}</div>
        <div class="ex-row"><span>Linked loan</span><b>${L ? esc(L.name) + ' · ' + short(lb) : '—'}</b></div>
        <div class="ex-row"><span>Equity</span><b>${short(lv.v - lb)}${lb ? ` <span class="muted" style="font-weight:500">(${Math.round((lv.v - lb) / lv.v * 100)}%)</span>` : ''}</b></div>
        ${smartCard(a)}
        <div style="display:flex;gap:8px;margin-top:10px;align-items:center"><button class="link" data-up="${a.id}">Enter value manually</button><span class="muted" style="font-size:11.5px;margin-left:auto">${a.method === 'manual' ? 'Manual' : (a.method === 'appreciation' ? '+' : '−') + a.ratePct + '%/yr model'}</span></div></div>`; }).join('')}
    ${sourcesCard()}
    <div class="card c-12"><div class="card-h"><div><h3>Sold</h3><div class="sub">Kept for history and net-worth trend</div></div></div>
      <div class="paid-grid">${sold.map(a => { const ks = Object.keys(a.vals).sort(); return `<div class="paid"><div><div class="nm">${esc(a.name)}</div><div class="ds">${esc(a.type)} · last valued ${short(a.vals[ks[ks.length - 1]])} in ${mLabel(ks[ks.length - 1])}</div></div>${spark(ks.map(k => a.vals[k]), 'var(--text-3)', 80, 26, false)}<span class="chip">Sold</span></div>`; }).join('')}</div></div>
  </div>`;
  $$('#asR button').forEach(b => b.onclick = () => { AS.range = b.dataset.k; render(); });
  $$('#asM button').forEach(b => b.onclick = () => { AS.mode = b.dataset.k; render(); });
  $('#asS').onchange = e => { AS.sold = e.target.checked; render(); };
  $$('[data-up]', pg).forEach(b => b.onclick = () => openValModal(b.dataset.up));
  $$('[data-ed]', pg).forEach(b => b.onclick = () => openAssetModal(b.dataset.ed));
  $$('[data-src]', pg).forEach(b => b.onclick = () => openSources(b.dataset.src));
  $$('[data-sacc]', pg).forEach(b => b.onclick = () => acceptSmart(b.dataset.sacc));
  $$('[data-acc]', pg).forEach(b => b.onclick = () => { const a = ST.assets.find(x => x.id === b.dataset.acc); const old = {...a.vals}; a.vals[NOW] = Math.round(modelVal(a) / 100) * 100; render(); toast(`${a.name} updated to ${money(a.vals[NOW])}`, () => { a.vals = old; render(); }); });
  CH.push(() => {
    const series = list.map((a, i) => ({name: a.name + (a.status === 'sold' ? ' (sold)' : ''), color: a.status === 'sold' ? 'var(--text-3)' : COLS[i % 5], dash: a.status === 'sold' ? '4 4' : null,
      values: months.map(m => { const ks = Object.keys(a.vals).sort(); if (m < ks[0] || (a.status === 'sold' && m > ks[ks.length - 1])) return null; const v = assetAt(a, m); const L = loanFor(a); return AS.mode === 'value' ? v : v - (L ? (L.actual[m] ?? (L.status === 'paid' ? 0 : loanBal(L, m))) : 0); })}));
    lineChart($('#asChart'), {labels: months, series, height: 260, zero: true, xFmt: (lb, i, e) => i % e === 0 ? mShort(lb) : null, tipTitle: mLabel, xGap: 70});
  });
}
function openValModal(id) {
  const a = ST.assets.find(x => x.id === id), lv = lastVal(a), m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Update ${esc(a.name)}</h2><p class="muted" style="font-size:12.5px">Last recorded ${money(lv.v)} · ${mLabel(lastChange(a))}</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="form"><div><label>As of</label><input class="in" type="month" id="vM" value="${NOW}"></div><div><label>Value</label><div class="amt-in"><span>$</span><input class="in num" id="vV" placeholder="${Math.round(modelVal(a)).toLocaleString()}"></div></div>
  <div style="grid-column:1/-1"><label>Source</label><select class="in" id="vS"><option>Estimate</option><option>Appraisal</option><option>Zillow / Redfin</option><option>KBB / Edmunds</option><option>Tax assessment</option><option>Sale price</option></select></div></div>
  <div class="mini" style="margin-top:14px"><div class="l">History</div>${Object.keys(a.vals).sort().filter((k, i, arr) => i === 0 || a.vals[k] !== a.vals[arr[i - 1]]).reverse().slice(0, 6).map(k => `<div class="r2"><span>${mLabel(k)}</span><b class="num">${money(a.vals[k])}</b></div>`).join('')}</div>
  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="vGo">Save value</button></div>`;
  openLayer('modal'); setTimeout(() => $('#vV').focus(), 50);
  $('#vGo').onclick = () => { const v = +($('#vV').value.replace(/[$,]/g, '')); if (!v) return $('#vV').focus(); const mm = $('#vM').value; a.vals[mm] = v; a.src[mm] = $('#vS').value; if ($('#vS').value === 'Sale price') { a.status = 'sold'; a.sold = mm; } closeAll(); render(); toast(`${a.name}: ${money(v)} as of ${mLabel(mm)}`); };
}
function openAssetModal(id) {
  const a = id ? ST.assets.find(x => x.id === id) : null, m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">${a ? 'Edit ' + esc(a.name) : 'Add asset'}</h2><p class="muted" style="font-size:12.5px">Property, vehicles, equipment, mineral interests, collectibles — anything with a value.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="form">
    <div style="grid-column:1/-1"><label>Name</label><input class="in" id="aN" value="${esc(a?.name || '')}" placeholder="e.g. Kubota mower"></div>
    <div><label>Type</label><select class="in" id="aT">${['Real estate', 'Vehicle', 'Equipment', 'Mineral interest', 'Business interest', 'Collectible', 'Other'].map(t => `<option ${a?.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label>Purchased</label><input class="in" type="month" id="aP" value="${a?.purchase || ''}"></div>
    <div><label>Purchase price</label><div class="amt-in"><span>$</span><input class="in num" id="aC" value="${a?.cost ? a.cost.toLocaleString() : ''}"></div></div>
    <div><label>Current value</label><div class="amt-in"><span>$</span><input class="in num" id="aV" value="${a ? lastVal(a).v.toLocaleString() : ''}"></div></div>
    <div><label>Valuation method</label><select class="in" id="aMt"><option value="manual" ${a?.method === 'manual' ? 'selected' : ''}>Manual updates only</option><option value="appreciation" ${a?.method === 'appreciation' ? 'selected' : ''}>Appreciates</option><option value="depreciation" ${a?.method === 'depreciation' ? 'selected' : ''}>Depreciates</option></select></div>
    <div><label>Rate per year (%)</label><input class="in num" id="aR" value="${a?.ratePct ?? ''}" placeholder="e.g. 3"></div>
    <div style="grid-column:1/-1"><label>Linked loan</label><select class="in" id="aL"><option value="">None</option>${ST.loans.filter(l => l.status === 'active').map(l => `<option value="${l.id}" ${a?.loan === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
  </div>
  <div style="display:flex;gap:10px;margin-top:18px">${a ? `<button class="btn" id="aSold">Mark as sold</button>` : ''}<button class="btn" style="margin-left:auto" onclick="closeAll()">Cancel</button><button class="btn primary" id="aGo">${a ? 'Save' : 'Add asset'}</button></div>`;
  openLayer('modal');
  const num = id => +($(id).value.replace(/[$,%\s]/g, '')) || 0;
  $('#aGo').onclick = () => { const n = $('#aN').value.trim(); if (!n) return $('#aN').focus();
    const o = a || {id: 'a' + Date.now(), vals: {}, src: {}, status: 'active'}; Object.assign(o, {name: n, type: $('#aT').value, purchase: $('#aP').value || null, cost: num('#aC') || null, method: $('#aMt').value, ratePct: num('#aR'), loan: $('#aL').value || null});
    if (num('#aV') && (!a || num('#aV') !== lastVal(a).v)) o.vals[NOW] = num('#aV'); if (!Object.keys(o.vals).length) o.vals[o.purchase || NOW] = o.cost || 0;
    if (!a) ST.assets.push(o); closeAll(); render(); toast(a ? 'Saved' : `Added ${n}`); };
  if ($('#aSold')) $('#aSold').onclick = () => { a.status = 'sold'; a.sold = NOW; closeAll(); render(); toast(`${a.name} moved to Sold`, () => { a.status = 'active'; render(); }); };
}

/* =====================================================================
   SMART VALUES — multi-source valuation, blended with confidence
   Live build: a Supabase Edge Function (scheduled via pg_cron) calls the
   API sources with server-side keys and writes asset_value_quotes rows.
   Manual quotes are saved to asset_value_quotes; API quotes appear once that job runs.
   ===================================================================== */
const SRC = {
  rentcast: {n: 'RentCast AVM', kind: 'api', cost: 'Free tier · 50 calls/mo', w: .35, url: 'https://developers.rentcast.io', note: 'Automated valuation from comps; returns value + low/high range'},
  fhfa: {n: 'FHFA price index · OKC metro', kind: 'index', cost: 'Free · quarterly', w: .25, url: 'https://www.fhfa.gov/house-price-index', note: 'Purchase price grown by the metro purchase-only index since you bought'},
  redfin: {n: 'Redfin ZIP median trend', kind: 'index', cost: 'Free download · monthly', w: .15, url: 'https://www.redfin.com/news/data-center/', note: 'Last value adjusted by your ZIP’s median sale-price change'},
  zillow: {n: 'Zillow Zestimate', kind: 'manual', cost: 'No public API · paste it in', w: .15, url: 'https://www.zillow.com/how-much-is-my-home-worth/', note: 'Zillow retired its public API in 2021'},
  assessor: {n: 'Logan County assessor', kind: 'record', cost: 'Public record · yearly', w: .10, url: null, note: 'Assessor market value; usually lags the market'},
  marketcheck: {n: 'MarketCheck Price', kind: 'api', cost: 'Free plan · 500 calls/mo', w: .30, url: 'https://docs.marketcheck.com/docs/api/cars/market-insights/marketcheck-price', note: 'Predicted price from VIN, miles and ZIP using live dealer listings'},
  vinaudit: {n: 'VinAudit market value', kind: 'api', cost: '100 free, then $100/mo + $0.10', w: .30, url: 'https://data.vinaudit.com/market-values-api', note: 'Below / average / above market from ~18M listings'},
  kbb: {n: 'Kelley Blue Book', kind: 'manual', cost: 'No public API · paste it in', w: .20, url: 'https://www.kbb.com/whats-my-car-worth/', note: 'Private-party value'},
  offer: {n: 'Instant offer (Carvana / CarMax)', kind: 'manual', cost: 'Manual · trade-in floor', w: .10, url: 'https://www.carvana.com/sell-my-car', note: 'What a dealer would pay today: a floor, not market value'},
  curve: {n: 'Depreciation curve', kind: 'model', cost: 'Built in', w: .10, url: null, note: 'Your depreciation rate applied since the last recorded value'},
  appreciation: {n: 'Appreciation model', kind: 'model', cost: 'Built in', w: .05, url: null, note: 'Your appreciation rate applied since the last recorded value'},
};
const KIND = {api: ['Live API', 'mid'], index: ['Index', ''], manual: ['Manual quote', 'new'], record: ['Public record', ''], model: ['Model', '']};
const PLAN = {'Real estate': ['rentcast', 'fhfa', 'redfin', 'zillow', 'assessor', 'appreciation'], 'Vehicle': ['marketcheck', 'vinaudit', 'kbb', 'offer', 'curve']};
const initSmart = a => {
  const s = a.smartSettings || {};
  a.smart = {enabled: s.enabled ?? (a.status === 'active' && !!PLAN[a.type]), cadence: s.cadence || 'Monthly · 1st', autoAccept: s.autoAccept ?? 3, basis: s.basis || 'Private party', condition: s.condition || 'Good',
    vin: s.vin || '', miles: s.miles || '', annualMiles: s.annualMiles || 12000, address: s.address || '', zip: s.zip || '', off: new Set(s.off || []),
    manual: Object.fromEntries((a.quotes || []).filter(q => q.manual).sort((p, q) => p.m.localeCompare(q.m)).map(q => [q.k, {v: q.v, m: q.m}]))};
};
ST.assets.forEach(initSmart);
function quotes(a) {   // latest quote per source: API/index rows written server-side, pasted manual quotes, and the built-in model
  if (!a.smart) initSmart(a);
  const latest = {}; (a.quotes || []).filter(q => !q.manual).forEach(q => { if (!latest[q.k] || q.m > latest[q.k].m) latest[q.k] = q; });
  return (PLAN[a.type] || []).map(k => {
    const s = SRC[k], man = a.smart.manual[k], api = latest[k];
    let v = null, lo = null, hi = null, m = null;
    if (s.kind === 'model') { v = Math.round(modelVal(a) / 100) * 100; m = NOW; }
    else if (man) { v = man.v; m = man.m; }
    else if (api) { v = api.v; lo = api.lo; hi = api.hi; m = api.m; }
    return {k, ...s, v, lo: lo ?? v, hi: hi ?? v, m, none: v == null, on: v != null && !a.smart.off.has(k)};
  });
}
function blend(a) {
  const q = quotes(a).filter(x => x.on);
  if (!q.some(x => x.kind !== 'model')) return null;
  const sorted = q.map(x => x.v).sort((p, r) => p - r), med = sorted[Math.floor(sorted.length / 2)];
  q.forEach(x => { const age = Math.max(0, ymDiff(x.m, NOW)); x.out = Math.abs(x.v / med - 1) > .12; x.ew = x.out ? 0 : x.w * Math.exp(-age / 12); });
  const W = sum(q.map(x => x.ew)) || 1, v = sum(q.map(x => x.v * x.ew)) / W;
  const used = q.filter(x => x.ew > 0), sd = Math.sqrt(sum(used.map(x => x.ew * (x.v - v) ** 2)) / W), cv = sd / v;
  const conf = used.length >= 3 && cv < .03 ? 'High' : used.length >= 2 && cv < .07 ? 'Medium' : 'Low';
  return {v: Math.round(v / 100) * 100, lo: Math.round((v - 1.5 * sd - v * .01) / 100) * 100, hi: Math.round((v + 1.5 * sd + v * .01) / 100) * 100, conf, q, n: used.length, W};
}
function stripPlot(b, w = 300) {
  const xs = b.q.flatMap(x => [x.lo, x.hi, x.v]), mn = Math.min(...xs, b.lo), mx = Math.max(...xs, b.hi), pad = (mx - mn) * .06 || 1;
  const X = v => 8 + (v - mn + pad) / (mx - mn + 2 * pad) * (w - 16);
  return `<svg class="strip" viewBox="0 0 ${w} 34" width="100%" height="34" preserveAspectRatio="none">
    <rect x="${X(b.lo)}" y="12" width="${X(b.hi) - X(b.lo)}" height="10" rx="5" style="fill:var(--brand-500);opacity:.16"/>
    <line x1="8" x2="${w - 8}" y1="17" y2="17" style="stroke:var(--border-strong)"/>
    ${b.q.map(x => `<circle cx="${X(x.v)}" cy="17" r="${x.out ? 3.5 : 4.5}" style="fill:${x.out ? 'var(--surface)' : 'var(--text-2)'};stroke:${x.out ? 'var(--neg)' : 'var(--surface)'};stroke-width:${x.out ? 1.5 : 2}"><title>${esc(x.n)}: ${money(x.v)}${x.out ? ' (outlier, ignored)' : ''}</title></circle>`).join('')}
    <line x1="${X(b.v)}" x2="${X(b.v)}" y1="5" y2="29" style="stroke:var(--brand-500);stroke-width:2.5;stroke-linecap:round"/></svg>`;
}
function smartCard(a) {
  if (!PLAN[a.type]) return '';
  const b = blend(a); if (!b) return `<div class="smart"><div class="smart-h"><span class="tag">${icon('wand')} Smart value</span></div><p class="muted" style="font-size:12px;margin:6px 0 10px">Paste a Zillow / KBB quote or connect a source to blend values.</p><div class="smart-act"><button class="btn" data-src="${a.id}">Sources</button></div></div>`;
  const lv = lastVal(a), d = b.v - lv.v;
  return `<div class="smart"><div class="smart-h"><span class="tag">${icon('wand')} Smart value</span><span class="chip ${b.conf === 'High' ? 'pos' : b.conf === 'Low' ? 'neg' : ''}">${b.conf} confidence</span></div>
    <div class="smart-v num">${money(b.v)}</div><div class="muted" style="font-size:12px">${short(b.lo)} – ${short(b.hi)} · ${b.n} of ${b.q.length} sources · ${d >= 0 ? '+' : '−'}${short(Math.abs(d))} vs. recorded</div>
    ${stripPlot(b)}
    <div class="smart-act"><button class="btn primary" data-sacc="${a.id}">Accept ${short(b.v)}</button><button class="btn" data-src="${a.id}">Sources</button></div></div>`;
}
function openSources(id) {
  const a = ST.assets.find(x => x.id === id), S = a.smart, veh = a.type === 'Vehicle';
  const draw = () => {
    const b = blend(a);
    const d = $('#drawer'); d.classList.add('wide-d');
    d.innerHTML = `<div class="dh"><div><div class="muted" style="font-size:12px;font-weight:600">Smart value · ${esc(a.type)}</div><h2>${esc(a.name)}</h2></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="sample-note">${icon('info')}<span>Paste quotes from the manual sources below. API sources fill in once their scheduled job is connected; keys stay server-side.</span></div>
    ${b ? `<div class="smart big-s"><div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><div class="smart-v num">${money(b.v)}</div><span class="chip ${b.conf === 'High' ? 'pos' : b.conf === 'Low' ? 'neg' : ''}">${b.conf} confidence</span><span class="muted" style="font-size:12px">range ${short(b.lo)} – ${short(b.hi)}</span></div>${stripPlot(b, 420)}</div>` : '<p class="muted">No quotes yet. Paste one below.</p>'}
    <h4 class="h4" style="margin-top:18px">${veh ? 'Vehicle details' : 'Property details'}</h4>
    <div class="form">${veh ? `
      <div style="grid-column:1/-1"><label>VIN <span class="muted">(decoded free via NHTSA vPIC → year, trim, engine)</span></label><input class="in" id="sVin" value="${esc(S.vin)}" placeholder="17-character VIN" maxlength="17"></div>
      <div><label>Odometer</label><input class="in num" id="sMi" value="${esc(S.miles)}" placeholder="miles"></div>
      <div><label>Miles per year</label><input class="in num" id="sAm" value="${S.annualMiles}"></div>
      <div><label>Condition</label><select class="in" id="sCd">${['Excellent', 'Good', 'Fair', 'Poor'].map(c => `<option ${c === S.condition ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label>Value basis</label><select class="in" id="sBs">${['Private party', 'Trade-in', 'Dealer retail'].map(c => `<option ${c === S.basis ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` : `
      <div style="grid-column:1/-1"><label>Address</label><input class="in" id="sAd" value="${esc(S.address)}" placeholder="Street address, Edmond, OK"></div>
      <div><label>ZIP</label><input class="in num" id="sZp" value="${esc(S.zip)}" placeholder="ZIP"></div>
      <div><label>Purchase price · date</label><input class="in" disabled value="${a.cost ? money(a.cost) + ' · ' + mLabel(a.purchase) : '—'}"></div>`}
    </div>
    <h4 class="h4" style="margin-top:18px">Sources</h4>
    <div class="src-list">${(b ? b.q : quotes(a)).map(x => `<div class="src ${x.on ? '' : 'off'} ${x.out ? 'outl' : ''}">
      <label class="sw-tg"><input type="checkbox" data-tg="${x.k}" ${x.on ? 'checked' : ''} ${x.none ? 'disabled' : ''}><i></i></label>
      <div class="src-m"><div class="nm">${esc(x.n)} <span class="tag ${KIND[x.kind][1]}">${KIND[x.kind][0]}</span>${x.none && x.kind !== 'manual' ? ' <span class="chip">No quote yet</span>' : ''}${x.out ? ' <span class="tag new">Outlier · ignored</span>' : ''}</div>
        <div class="ds">${esc(x.note)} · ${esc(x.cost)}</div>
        ${x.kind === 'manual' ? `<div class="man"><div class="amt-in"><span>$</span><input class="in num sm" data-man="${x.k}" placeholder="Paste quote" value="${S.manual[x.k] ? S.manual[x.k].v.toLocaleString() : ''}"></div>${x.url ? `<a class="link" href="${x.url}" target="_blank" rel="noopener">Open ${esc(x.n.split(' ')[0])} ↗</a>` : ''}</div>` : x.url ? `<a class="link" href="${x.url}" target="_blank" rel="noopener">About this source ↗</a>` : ''}</div>
      <div class="src-v"><b class="num">${x.none ? '—' : money(x.v)}</b><div class="ds">${x.none ? '' : (x.lo !== x.hi ? short(x.lo) + '–' + short(x.hi) + ' · ' : '') + mShort(x.m)}</div>${x.on && b ? `<div class="wbar"><i style="width:${Math.round((x.ew || 0) / b.W * 100)}%"></i></div><div class="ds">${Math.round((x.ew || 0) / b.W * 100)}% weight</div>` : ''}</div></div>`).join('')}</div>
    <div class="mini" style="margin-top:16px"><div class="l">How the blend works</div><p style="font-size:12.5px;color:var(--text-2);margin-top:6px">Each source has a base weight (APIs highest, public records lowest). Weight decays with age (half-weight after ~8 months). Quotes more than 12% from the median are flagged and left out. Confidence comes from how closely the remaining sources agree.</p></div>
    <div class="form" style="margin-top:14px"><div><label>Refresh</label><select class="in" id="sCad">${['Monthly · 1st', 'Quarterly', 'Manual only'].map(c => `<option ${c === S.cadence ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label>Auto-accept if change is under</label><select class="in" id="sAa">${[0, 2, 3, 5, 10].map(v => `<option value="${v}" ${v === S.autoAccept ? 'selected' : ''}>${v ? v + '%' : 'Never (always ask)'}</option>`).join('')}</select></div></div>
    <div class="drawer-actions"><button class="btn" id="sRef">${icon('undo')}<span>Refresh now</span></button>${b ? `<button class="btn primary" style="margin-left:auto" data-sacc="${a.id}">Accept ${money(b.v)}</button>` : ''}</div>`;
    $$('[data-tg]', d).forEach(c => c.onchange = () => { c.checked ? S.off.delete(c.dataset.tg) : S.off.add(c.dataset.tg); draw(); SYNC.schedule(); });
    $$('[data-man]', d).forEach(i => i.onchange = () => { const v = +i.value.replace(/[$,]/g, ''); if (v) S.manual[i.dataset.man] = {v, m: NOW}; else delete S.manual[i.dataset.man]; draw(); SYNC.schedule(); });
    const bindS = (sel, k, f = v => v) => $(sel) && ($(sel).onchange = e => { S[k] = f(e.target.value); SYNC.schedule(); if (['condition', 'basis'].includes(k)) draw(); });
    bindS('#sVin', 'vin', v => v.toUpperCase()); bindS('#sMi', 'miles'); bindS('#sAm', 'annualMiles', v => +v.replace(/,/g, '') || 0); bindS('#sCd', 'condition'); bindS('#sBs', 'basis'); bindS('#sAd', 'address'); bindS('#sZp', 'zip'); bindS('#sCad', 'cadence'); bindS('#sAa', 'autoAccept', v => +v);
    $('#sRef').onclick = () => toast('Automatic refresh needs the valuation Edge Function (see README)');
    $$('[data-sacc]', d).forEach(x => x.onclick = () => acceptSmart(a.id));
  };
  draw(); openLayer('drawer');
}
function acceptSmart(id) {
  const a = ST.assets.find(x => x.id === id), b = blend(a); if (!b) return;
  const old = {...a.vals}; a.vals[NOW] = b.v; (a.src ||= {})[NOW] = `Smart blend (${b.n} sources)`;
  closeAll(); render(); toast(`${a.name}: ${money(b.v)} recorded for ${mLabel(NOW)}`, () => { a.vals = old; render(); });
}
function sourcesCard() {
  const act = ST.assets.filter(a => a.status === 'active' && a.smart?.enabled);
  const homes = act.filter(a => a.type === 'Real estate').length, cars = act.filter(a => a.type === 'Vehicle').length;
  const rows = [['rentcast', homes], ['marketcheck', cars], ['vinaudit', cars]];
  return `<div class="card c-12"><div class="card-h"><div><h3>Valuation sources</h3><div class="sub">Pulled monthly by a scheduled job · ${homes + cars * 2} API calls/month for ${act.length} assets</div></div></div>
    <div class="conn-grid">${rows.map(([k, n]) => `<div class="conn"><div><div class="nm">${esc(SRC[k].n)}</div><div class="ds">${esc(SRC[k].cost)} · ${n} call${n === 1 ? '' : 's'}/mo needed</div></div><span class="chip">Not connected</span><button class="btn" style="height:32px" onclick="toast('Store the API key as a Supabase secret and deploy the valuation function (see README)')">How to connect</button></div>`).join('')}
      <div class="conn"><div><div class="nm">FHFA, Redfin, NHTSA vPIC</div><div class="ds">Free public data · no key needed</div></div><span class="chip pos">${icon('check')} Ready</span></div>
      <div class="conn"><div><div class="nm">Zillow, KBB, Carvana / CarMax</div><div class="ds">No public API · paste quotes, with quick links</div></div><span class="chip">Manual</span></div></div></div>`;
}
