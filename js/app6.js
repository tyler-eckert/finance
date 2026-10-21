/* =====================================================================
   PLAN ON OVERVIEW & INVESTMENTS — historical actuals + projected values
   ===================================================================== */
const PV = {h: '10y', sc: SCN[0].id, pm: 'total', real: true, ...(CTX.prefs.pv || {})};
const pvDefl = (sc, k) => PV.real ? Math.pow(1 + sc.p.infl, k / 12) : 1; // k = months from latest actual (negative = past)
const pvSc = () => SCN.find(s => s.id === PV.sc) || SCN[0];
let LASTM = BS.months[L];
const pvYears = sc => PV.h === 'off' ? 0 : PV.h === '10y' ? 10 : PV.h === 'retire' ? Math.max(1, sc.p.retire - ageNow + 2) : 95 - ageNow;
const PB = new Map();
function planBands(sc) { const k = pkey(sc.p); if (!PB.has(k)) { const r = scnRun(sc); PB.set(k, {a25: pctl(r.paths, .25), a50: pctl(r.paths, .5), a75: pctl(r.paths, .75)}); } return PB.get(k); }
const interpA = (arr, mi) => { const t = mi / 12, i = Math.floor(t), f = t - i; return i + 1 < arr.length ? arr[i] * (1 - f) + arr[i + 1] * f : arr[arr.length - 1]; };
function valueAtM(a, m) { const lv = lastVal(a), yrs = Math.max(0, ymDiff(lastChange(a), m)) / 12, r = (a.ratePct || 0) / 100;
  return a.method === 'appreciation' ? lv.v * Math.pow(1 + r, yrs) : a.method === 'depreciation' ? lv.v * Math.pow(1 - r, yrs) : lv.v; }
const equityAt = m => sum(ST.assets.filter(a => a.status === 'active').map(a => valueAtM(a, m) - (a.loan && loanById(a.loan) ? loanBal(loanById(a.loan), m) : 0)));
const otherLoansAt = m => sum(ST.loans.filter(l => l.status === 'active' && !ST.assets.some(a => a.status === 'active' && a.loan === l.id)).map(l => m <= NOW && !Object.keys(l.actual).length && m < l.start ? 0 : loanBal(l, m)));
// 529s on the same draw plan as Investments → College (semester draws, per-child overrides); cached per plan
let COLC = null;
function collegeAt(m) {
  const key = JSON.stringify([CTX.settings?.college_plan || {}, DATA.kids, LASTM, DATA.assume.college529Monthly]);
  if (!COLC || COLC.k !== key) COLC = {k: key, P: typeof colProject === 'function' ? DATA.kids.map(k => colProject({...k, y18: collegeYear(k)})) : []};
  return sum(COLC.P.map(P => { if (m <= P.months[0]) return Math.max(0, P.val[P.months[0]]); const v = P.val[m] ?? P.val[P.months[P.months.length - 1]]; return Math.max(0, v || 0); }));
}
// a percentile path is yearly; spread it over the months and take each milestone out in its own month (not smeared across the year)
function bandAt(arr, k, sc) {
  if (k <= 0) return arr[0]; const t = Math.ceil(k / 12), f = (k - (t - 1) * 12) / 12; if (t >= arr.length) return arr[arr.length - 1];
  const S = planSteps(), g = ageNow + t > sc.p.retire ? 1 / (1 - (sc.p.tax || 0)) : 1, Dt = (S.PE[t] || 0) * g;
  const done = sum(S.draws.filter(d => d.t === t && d.k <= k).map(d => d.amt)) * g;
  return Math.max(0, arr[t - 1] * (1 - f) + (arr[t] + Dt) * f - done);
}
/* future months + investable bands; kind = 'nw' adds cash, 529s, asset equity, other loans */
function planFuture(sc, years, kind) {
  const B = planBands(sc), months = [], p25 = [], p50 = [], p75 = [];
  for (let k = 1; k <= years * 12; k++) {
    const m = ymAdd(LASTM, k), add = kind === 'nw' ? BS.cash[L] + collegeAt(m) + equityAt(m) - otherLoansAt(m) : kind === 'all' ? collegeAt(m) : 0;
    const d = pvDefl(sc, k); months.push(m); p25.push((bandAt(B.a25, k, sc) + add) / d); p50.push((bandAt(B.a50, k, sc) + add) / d); p75.push((bandAt(B.a75, k, sc) + add) / d);
  }
  return {months, p25, p50, p75};
}
function planAt(sc, age, kind) { const k = (age - ageNow) * 12; const B = planBands(sc), m = ymAdd(LASTM, k); return (bandAt(B.a50, k, sc) + (kind === 'nw' ? BS.cash[L] + collegeAt(m) + equityAt(m) - otherLoansAt(m) : kind === 'all' ? collegeAt(m) : 0)) / pvDefl(sc, k); }
function planVsActual(sc) { // investable, Dec of last year → latest month, expected path vs actual
  const n = ymDiff(`${PY}-12`, LASTM), start = investable(iDecPY), exp = start * Math.pow(1 + sc.p.ret, n / 12) + (contrib401 + sc.p.pre) * n / 12, act = investable(L);
  return {exp, act, diff: act - exp, n};
}
function planControls(id) {
  return `<div class="plan-ctl"><div class="seg" id="${id}H">${[['off', 'Actuals'], ['10y', '+10 yrs'], ['retire', 'To retirement'], ['95', 'To 95']].map(([k, l]) => `<button data-h="${k}" class="${PV.h === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="seg" id="${id}R"><button data-r="1" class="${PV.real ? 'on' : ''}">Today's $</button><button data-r="0" class="${PV.real ? '' : 'on'}">Future $</button></div>
    <select class="in sel" id="${id}S" title="Plan scenario">${SCN.map(s => `<option value="${s.id}" ${s.id === PV.sc ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>`;
}
function wirePlanControls(id) {
  $$(`#${id}H button`).forEach(b => b.onclick = () => { PV.h = b.dataset.h; render(); });
  $$(`#${id}R button`).forEach(b => b.onclick = () => { PV.real = b.dataset.r === '1'; render(); });
  const s = $(`#${id}S`); if (s) s.onchange = e => { PV.sc = e.target.value; render(); };
}
function histPlanChart(el, {hLabels, hVals, kind, name, height = 280, events = [], futureMax = null, flags = [], sc: scIn = null, years = null}) {
  const sc = scIn || pvSc(), yrs = years ?? pvYears(sc); let F = yrs ? planFuture(sc, yrs, kind) : {months: [], p25: [], p50: [], p75: []};
  if (futureMax != null && yrs) { const n = F.months.filter(m => ymDiff(LASTM, m) <= futureMax).length; F = {months: F.months.slice(0, n), p25: F.p25.slice(0, n), p50: F.p50.slice(0, n), p75: F.p75.slice(0, n)}; }
  const showLbl = UI.chartLabels !== false;
  hVals = hVals.map((v, i) => v * pvDefl(sc, -(hLabels.length - 1 - i)) ** -1);
  const labels = hLabels.concat(F.months), nH = hLabels.length, last = hVals[nH - 1];
  const actual = hVals.concat(F.months.map(() => null));
  const med = hLabels.map((_, i) => i === nH - 1 ? last : null).concat(F.p50);
  const lo = hLabels.map((_, i) => i === nH - 1 ? last : null).concat(F.p25), hi = hLabels.map((_, i) => i === nH - 1 ? last : null).concat(F.p75);
  const series = [{name: name + ' · actual', values: actual, color: 'var(--s1)', area: !yrs}];
  if (yrs) series.push({name: 'Plan median · ' + sc.name, values: med, color: 'var(--s1)', dash: '6 5', width: 2});
  const vl = events.slice(); if (yrs) { vl.push({i: nH - 1, label: 'Today'}); const ri = labels.indexOf(`${YNOW + sc.p.retire - ageNow}-${LASTM.slice(5)}`); if (ri > 0) vl.push({i: ri, label: 'Retire ' + sc.p.retire}); }
  const pe = yrs ? (ST.planned || []).filter(p => p.status !== 'done' && p.status !== 'cancelled' && p.due > LASTM && p.fund !== 'budget') : [];   // budget-funded ones never move this line
  const inKind = p => fromSavings(p) || (p.fund === 'college_529' && (kind === 'all' || kind === 'nw'));   // only the ones that come out of this line
  const markers = pe.map((p, k) => { const i = labels.indexOf(p.due); return i < nH ? null : {i, s: 1, color: inKind(p) ? 'var(--s5)' : 'var(--text-3)', label: showLbl ? `${p.name} −${short(Math.abs(p.amount))}` : null, dy: (k % 2) * 13, r: 4.5}; }).filter(Boolean);
  if (yrs) DEBTS().forEach((d, k) => { const i = labels.indexOf(d.end); if (i >= nH) markers.push({i, s: 1, color: 'var(--s3)', r: 4, label: null}); });   // loan payoffs: dot only, details in the tooltip (labels piled up)
  // months a data check flagged (e.g. a partly entered account): red ring so a cliff isn't mistaken for a real drop
  flags.forEach(f => { const i = hLabels.indexOf(f.m); if (i >= 0) markers.push({i, s: 0, color: 'var(--neg)', r: 5, ring: true, label: showLbl ? '⚠ check' : null}); });
  lineChart(el, {labels, series, band: yrs ? {lo, hi, color: 'var(--s1)', name: 'Middle half of outcomes'} : null, height, vlines: vl, markers,
    tipExtra: i => pe.filter(p => p.due === labels[i]).map(p => tipRow(inKind(p) ? 'var(--s5)' : 'var(--text-3)', p.name + (inKind(p) ? '' : ' (not from this)'), '−' + money(Math.abs(p.amount)))).join('') + (yrs ? DEBTS().filter(d => d.end === labels[i]).map(d => tipRow('var(--s3)', d.n + ' paid off', '+' + money(d.pmt) + '/mo')).join('') : '') + flags.filter(f => f.m === labels[i]).map(f => tipRow('var(--neg)', 'Data check', esc(f.t))).join(''), zero: kind !== 'nw' || true, xGap: 74,
    xFmt: (lb, i, e) => i % e === 0 ? (labels.length > 200 ? "'" + lb.slice(2, 4) : mShort(lb)) : null, tipTitle: (lb, i) => mLabel(lb) + (i >= nH ? ' · age ' + (ageNow + Math.round(ymDiff(CTX.TODAY.slice(0, 7), lb) / 12)) : '')});
}
function planLegend(name) {
  return PV.h === 'off' ? '' : `<div class="legend"><span><i class="sw" style="background:var(--s1)"></i>${name} · actual</span><span><i class="sw" style="background:transparent;border:1.5px dashed var(--s1)"></i>Plan median</span><span><i class="sw" style="background:var(--s1);opacity:.2"></i>Middle half of outcomes</span></div>`;
}
function planStats(kind) {
  const sc = pvSc(), pva = planVsActual(sc), now = kind === 'nw' ? NW : investable(L);
  const ret = sc.p.retire, a10 = ageNow + 10;
  return `<div class="stat-row plan-stats">
    <div class="mini"><div class="l">${kind === 'nw' ? 'Net worth' : 'Investable'} · ${mShort(LASTM)}</div><div class="v num">${short(now)}</div></div>
    <div class="mini"><div class="l">Plan · age ${a10} (${YNOW + 10})</div><div class="v num">${short(planAt(sc, a10, kind))}</div></div>
    <div class="mini"><div class="l">Plan · retire at ${ret}</div><div class="v num">${short(planAt(sc, ret, kind))}</div></div>
    <div class="mini"><div class="l">Actual vs plan · since Dec</div><div class="v num ${pva.diff >= 0 ? 'pos' : 'neg'}">${pva.diff >= 0 ? '+' : '−'}${short(Math.abs(pva.diff))}</div><div class="ds" style="font-size:11px;color:var(--text-3)">${pva.diff >= 0 ? 'ahead of' : 'behind'} the ${(sc.p.ret * 100).toFixed(1)}% path</div></div></div>`;
}

/* ---------- projected balances by account (expected path, before market swings) ---------- */
function accountProjection() {
  const sc = pvSc(), r = sc.p.ret, ages = [ageNow + 5, ageNow + 10, sc.p.retire].filter((v, i, a) => a.indexOf(v) === i).sort((x, y) => x - y);
  const grow = (b, add, yrs) => { for (let t = 0; t < yrs; t++) b = b * (1 + r) + add; return b; };
  const rows = CTX.invAccts.filter(a => a.group !== 'College').map(a => ({n: a.n, b: BS[a.k][L],
    add: a.k === CTX.flowKey ? sc.p.pre : a.k === CTX.contribKey ? contrib401 : 0,
    note: a.k === CTX.flowKey ? `${short(sc.p.pre)}/yr net cash flow` : a.k === CTX.contribKey ? `+${short(contrib401)}/yr incl. match` : 'growth only'}));
  const coll = {n: `529s (${DATA.kids.length} kid${DATA.kids.length === 1 ? '' : 's'})`, b: BS.college[L], note: `${money(DATA.assume.college529Monthly)}/mo each at 4.5% until college`};
  const at = (row, age) => grow(row.b, row.add, Math.min(age, sc.p.retire) - ageNow) * (age > sc.p.retire ? Math.pow(1 + r, age - sc.p.retire) : 1) / (PV.real ? Math.pow(1 + sc.p.infl, age - ageNow) : 1);
  const dfl = age => PV.real ? Math.pow(1 + sc.p.infl, age - ageNow) : 1;
  const cAt = age => collegeAt(ymAdd(LASTM, (age - ageNow) * 12)) / dfl(age);
  return `<div class="card c-12"><div class="card-h"><div><h3>Projected balances by account</h3><div class="sub">${esc(sc.name)} · expected path at ${(r * 100).toFixed(1)}% a year, before market swings · ${PV.real ? "today's dollars" : 'nominal dollars'}</div></div></div>
    <div class="scroll-x"><table class="table cmp"><tr><th>Account</th><th>Today</th>${ages.map(a => `<th>Age ${a} · ${YNOW + a - ageNow}${a === sc.p.retire ? ' (retire)' : ''}</th>`).join('')}<th class="hide-sm">Assumption</th></tr>
    ${rows.map(x => `<tr><td>${x.n}</td><td>${short(x.b)}</td>${ages.map(a => `<td>${short(at(x, a))}</td>`).join('')}<td class="hide-sm muted">${x.note}</td></tr>`).join('')}
    <tr><td>${coll.n}</td><td>${short(coll.b)}</td>${ages.map(a => `<td>${short(cAt(a))}</td>`).join('')}<td class="hide-sm muted">${coll.note}</td></tr>
    <tr class="tot"><td>Total</td><td>${short(sum(rows.map(x => x.b)) + coll.b)}</td>${ages.map(a => `<td>${short(sum(rows.map(x => at(x, a))) + cAt(a))}</td>`).join('')}<td class="hide-sm"></td></tr></table></div>
    <p class="muted" style="font-size:11.5px;margin-top:8px">Expected (average) values run above the median line in the charts because market returns compound unevenly. Edit the assumptions on Plan → Retirement.</p></div>`;
}
