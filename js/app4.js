/* =====================================================================
   RETIREMENT SCENARIOS · WHEN CAN I RETIRE · INVESTMENT BENCHMARKS
   ===================================================================== */
let PLV = 'simple';
const PLV_OPTS = [['simple', 'Summary'], ['invest', 'Investment detail'], ['miles', 'Milestones & insights'], ['retire', 'Scenarios']];
const planSeg = () => `<div class="toolbar"><div class="seg" id="plSeg">${PLV_OPTS.map(([k, l]) => `<button data-k="${k}" class="${PLV === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
const wirePlanSeg = () => $$('#plSeg button').forEach(b => b.onclick = () => { PLV = b.dataset.k; render(); });

/* ---------------- scenario engine ---------------- */
const SC_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
const BASEP = {retire: DATA.assume.retireAge, spend: DATA.assume.annualExp, ret: DATA.assume.rate + .025, vol: .12, infl: .025, pre: -30000, ss: 0, ssAge: 67, health: 0, tax: 0, minerals: 1, mortgageDrop: true, debtSave: true, crash: false};
let SCN = (CTX.scenarios || []).slice().sort((a, b) => (b.is_base - a.is_base) || (a.sort_order - b.sort_order)).map(s => ({id: s.id, name: s.name, note: s.note || '', p: {...BASEP, ...(s.params || {})}, show: s.show_on_charts !== false}));
if (!SCN.length) SCN = [{id: 's' + Date.now(), name: 'Base', note: 'Starting assumptions', p: {...BASEP}, show: true}];
let SCSEL = SCN[0].id, SCCONF = CTX.prefs.conf ?? .85;
const scnStart = () => investable(L);
const contrib401 = DATA.assume.k401max + DATA.assume.employer;
const MORT = ST.loans.find(l => l.status === 'active' && l.type === 'Mortgage');
const MORT_PI = MORT ? (MORT.pmt || 0) * 12 : 0, MORT_END = MORT ? +loanPayoff(MORT.id).slice(0, 4) : 0;
const mineralsAt = cal => minNet[cal] ?? minBase * Math.pow(1 + minDecl, cal - minLastY);
// planned expenses & milestones (Plan → Milestones) come out of the portfolio in their year; 529-funded or already-in-budget ones don't
const plannedFlows = () => { const o = {}; (ST.planned || []).filter(p => p.status !== 'done' && p.status !== 'cancelled' && !['college_529', 'budget'].includes(p.fund) && p.due >= CTX.ASOF_YM)
  .forEach(p => { const y = +p.due.slice(0, 4); o[y] = (o[y] || 0) + Math.abs(+p.amount || 0); }); return o; };
/* ---- debts & milestones on the plan's own clock: step t = the 12 months after the latest balance ----
   Each active loan stops costing its monthly P&I once it's paid off (on schedule, or early with a "Pay off <loan>" milestone).
   Before retirement the freed payment goes to savings (debtSave); in retirement it lowers what you need (mortgageDrop). */
const livePlan = p => p.status !== 'done' && p.status !== 'cancelled' && p.due >= CTX.ASOF_YM;
const fromSavings = p => !['college_529', 'budget'].includes(p.fund);
const payoffMile = l => (ST.planned || []).find(p => livePlan(p) && /^pay ?off\b/i.test(p.name) && p.name.toLowerCase().includes(String(l.name).toLowerCase()));
const loanEndM = l => { const nat = loanPayoff(l.id), pm = payoffMile(l); return pm && pm.due < nat ? pm.due : nat; };
const DEBTS = () => ST.loans.filter(l => l.status === 'active' && (+l.pmt || 0) > 0).map(l => { const pm = payoffMile(l), nat = loanPayoff(l.id); return {id: l.id, n: l.name, type: l.type, pmt: +l.pmt, nat, end: pm && pm.due < nat ? pm.due : nat, early: !!(pm && pm.due < nat)}; });
const freedAt = (m, D = DEBTS()) => sum(D.filter(d => d.end < m).map(d => d.pmt));   // monthly P&I no longer owed in month m
const stepsKey = () => JSON.stringify([(ST.planned || []).filter(livePlan).map(p => [p.name, p.due, p.amount, p.fund]), DEBTS().map(d => [d.pmt, d.end]), BS.months[L]]);
const PSC = new Map();
function planSteps(years = 95 - ageNow) {
  const key = stepsKey() + years; if (PSC.has(key)) return PSC.get(key);
  const D = DEBTS(), m0 = BS.months[L], free = [0], PE = {}, draws = [];
  for (let t = 1; t <= years; t++) { let f = 0; for (let k = 1; k <= 12; k++) f += freedAt(ymAdd(m0, (t - 1) * 12 + k), D); free.push(f); }
  (ST.planned || []).filter(p => livePlan(p) && fromSavings(p)).forEach(p => { const k = Math.max(1, ymDiff(m0, p.due)), t = Math.ceil(k / 12), amt = Math.abs(+p.amount || 0); PE[t] = (PE[t] || 0) + amt; draws.push({k, t, amt, p}); });
  const out = {free, PE, draws, D}; PSC.set(key, out); return out;
}
function simP(p, sims = 400, keepPaths = true) {
  const years = 95 - ageNow, paths = keepPaths ? [] : null, S = planSteps(years), PE = S.PE; let ok = 0;
  for (let s = 0; s < sims; s++) {
    const R = rng(9000 + s); let b = scnStart(); const path = keepPaths ? [b] : null;
    for (let t = 1; t <= years; t++) {
      const age = ageNow + t, cal = YNOW + t, inf = Math.pow(1 + p.infl, t);
      const u1 = R() || 1e-9, u2 = R(), z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      let r = p.ret + p.vol * z; if (p.crash && age === p.retire) r = -.25;
      const mins = mineralsAt(cal) * p.minerals;
      let flow;
      if (age < p.retire) flow = contrib401 + p.pre + (p.minerals - 1) * mineralsAt(cal) + (p.debtSave !== false ? S.free[t] : 0);
      else {
        const need = p.spend * inf + (age < 65 ? p.health * inf : 0) - (p.mortgageDrop ? S.free[t] : 0);
        const income = mins + (age >= p.ssAge ? p.ss * inf : 0), gap = need - income;
        flow = gap > 0 ? -gap / (1 - p.tax) : -gap;
      }
      if (PE[t]) flow -= age < p.retire ? PE[t] : PE[t] / (1 - p.tax);
      b = b > 0 ? b * (1 + r) + flow : 0;
      if (keepPaths) path.push(Math.max(0, b));
    }
    if (b > 0) ok++; if (keepPaths) paths.push(path);
  }
  return {paths, prob: ok / sims, years};
}
const RUNC = new Map();
const pkey = p => JSON.stringify(p) + stepsKey();   // re-run when milestones change
function scnRun(sc) { const k = 'r' + pkey(sc.p); if (!RUNC.has(k)) RUNC.set(k, simP(sc.p)); return RUNC.get(k); }
function scnSweep(sc) {
  const k = 'w' + pkey({...sc.p, retire: 0}); if (RUNC.has(k)) return RUNC.get(k);
  const ages = [], probs = []; for (let a = 45; a <= 65; a++) { ages.push(a); probs.push(simP({...sc.p, retire: a}, 250, false).prob); }
  const out = {ages, probs}; RUNC.set(k, out); return out;
}
const earliest = (sc, conf = SCCONF) => { const w = scnSweep(sc); const i = w.probs.findIndex(p => p >= conf); return i < 0 ? null : w.ages[i]; };
const deflate = (v, t, p) => v / Math.pow(1 + p.infl, t);

/* ---------------- Retirement tab ---------------- */
function renderRetirement(pg) {
  const host = document.createElement('div'); pg.appendChild(host);
  const base = SCN[0], vis = SCN.filter(s => s.show), sel = SCN.find(s => s.id === SCSEL) || SCN[0];
  const eb = earliest(base), selRun = scnRun(sel);
  const fmtPct = v => Math.round(v * 100) + '%';
  const confSeg = `<div class="seg" id="cfSeg">${[.75, .85, .95].map(c => `<button data-c="${c}" class="${c === SCCONF ? 'on' : ''}">${fmtPct(c)}</button>`).join('')}</div>`;
  const sliders = [
    ['retire', 'Retire at age', 45, 65, 1, v => v],
    ['spend', 'Spending in retirement (today $)', 120000, 360000, 5000, v => short(v) + '/yr'],
    ['ret', 'Expected return (nominal)', .04, .10, .0025, v => (v * 100).toFixed(2).replace(/\.?0+$/, '') + '%'],
    ['vol', 'Volatility', .06, .20, .01, v => Math.round(v * 100) + '%'],
    ['infl', 'Inflation', .015, .045, .0025, v => (v * 100).toFixed(2).replace(/\.?0+$/, '') + '%'],
    ['pre', 'Net cash flow until retirement', -120000, 60000, 5000, v => short(v) + '/yr'],
    ['health', 'Health insurance before 65 (today $)', 0, 40000, 1000, v => v ? short(v) + '/yr' : 'None'],
    ['ss', 'Social Security (today $)', 0, 80000, 2500, v => v ? short(v) + '/yr' : 'Not included'],
    ['ssAge', 'Social Security starts at', 62, 70, 1, v => v],
    ['tax', 'Tax on withdrawals', 0, .30, .01, v => Math.round(v * 100) + '%'],
    ['minerals', 'Minerals vs. your forecast', 0, 1.5, .05, v => Math.round(v * 100) + '%'],
  ];
  host.innerHTML = `<div class="grid g-12">
    <div class="card hero c-12 retire-hero"><div class="rh-main"><div class="label">Are we going to be okay? · ${esc(sel.name)}</div>
      <div class="rh-head"><span class="val num">${fmtPct(selRun.prob)}</span><span class="rh-say">chance we can retire at <b>${sel.p.retire}</b> spending <b>${short(sel.p.spend)}/yr</b></span></div>
      <div class="delta">${selRun.prob >= SCCONF ? 'Meets' : 'Below'} your ${fmtPct(SCCONF)} target · share of market paths where the money lasts to 95, in today’s dollars${sel.p.ss ? ` · includes ${short(sel.p.ss)}/yr Social Security from ${sel.p.ssAge}` : ' · no Social Security included'}</div>
      <div class="rh-quick">
        <div><label>Retire at <b id="hq-retire">${sel.p.retire}</b></label><input type="range" min="45" max="65" step="1" value="${sel.p.retire}" data-hq="retire"></div>
        <div><label>Spending <b id="hq-spend">${short(sel.p.spend)}/yr</b></label><input type="range" min="120000" max="360000" step="5000" value="${sel.p.spend}" data-hq="spend"></div>
        <div><label>Social Security <b id="hq-ss">${sel.p.ss ? short(sel.p.ss) + '/yr' : 'None'}</b></label><input type="range" min="0" max="80000" step="2500" value="${sel.p.ss || 0}" data-hq="ss"></div></div>
      <div class="delta" style="margin-top:10px">${(() => { const e = earliest(sel); return e ? `Earliest age with a ${fmtPct(SCCONF)} chance: <b>${e}</b> (${YNOW + e - ageNow}, ${e - ageNow} years from now)` : `No age between 45 and 65 reaches ${fmtPct(SCCONF)} with these assumptions`; })()}</div></div>
      <div class="rh-side"><div class="label" style="margin-bottom:8px">Confidence target</div>${confSeg}<div class="label" style="margin-top:14px;font-size:var(--fs-xs)">Earliest age · chance at the scenario's own age</div>
        <div class="rh-chips">${SCN.map((s, i) => { const e = earliest(s); return `<div class="rh-chip"><i class="sw" style="background:${SC_COLORS[i % 5]}"></i><span>${esc(s.name)}</span><b>${e ? 'Age ' + e : '> 65'}</b><span class="rh-at">${Math.round(scnRun(s).prob * 100)}% at ${s.p.retire}</span></div>`; }).join('')}</div></div></div>

    <div class="card c-12"><div class="card-h"><div><h3>Retirement age vs. chance of success</h3><div class="sub">Share of 250 market paths where the money lasts to 95, for each possible retirement age · dashed line = your ${fmtPct(SCCONF)} target</div></div></div>
      <div class="chart" id="swChart"></div><div class="legend">${vis.map(s => `<span><i class="sw" style="background:${SC_COLORS[SCN.indexOf(s) % 5]}"></i>${esc(s.name)}</span>`).join('')}<span><i class="sw" style="background:var(--text-3)"></i>Target</span></div></div>

    <div class="card c-4"><div class="card-h"><div><h3>Scenarios</h3><div class="sub">Pick one to edit · eye toggles it on the charts</div></div><div class="right"><button class="btn" style="height:32px" id="scAdd">${icon('plus')}<span>New</span></button></div></div>
      <div class="sc-list">${SCN.map((s, i) => `<div class="sc ${s.id === sel.id ? 'on' : ''}" data-s="${s.id}"><i class="sw" style="background:${SC_COLORS[i % 5]};width:10px;height:10px"></i><div class="sc-m"><div class="nm">${esc(s.name)}</div><div class="ds">${esc(s.note || '')}</div></div><button class="mini-btn" data-eye="${s.id}" title="Show on charts">${s.show ? '●' : '○'}</button></div>`).join('')}</div>
      <div class="sc-edit"><div class="form one" style="margin-bottom:12px"><div><label>Name</label><input class="in" id="scName" value="${esc(sel.name)}"></div></div>
        <div class="ctrl">${sliders.map(([k, l, mn, mx, st, f]) => `<div><label>${l}<b id="sv-${k}">${f(sel.p[k])}</b></label><input type="range" min="${mn}" max="${mx}" step="${st}" value="${sel.p[k]}" data-k="${k}"></div>`).join('')}</div>
        ${DEBTS().length ? `<label class="tgl" style="margin-top:14px"><input type="checkbox" id="scMort" ${sel.p.mortgageDrop ? 'checked' : ''}> In retirement, spending drops by each loan’s P&amp;I once it’s paid off</label>
        <label class="tgl" style="margin-top:8px"><input type="checkbox" id="scDebt" ${sel.p.debtSave !== false ? 'checked' : ''}> Before retirement, freed loan payments go to savings</label>` : ''}
        <label class="tgl" style="margin-top:8px"><input type="checkbox" id="scCrash" ${sel.p.crash ? 'checked' : ''}> −25% market crash the year I retire</label>
        <div style="display:flex;gap:8px;margin-top:16px">${SCN.length > 1 ? `<button class="btn" id="scDel">${icon('trash')}<span>Delete</span></button>` : ''}<button class="btn" id="scDup" style="margin-left:auto">${icon('plus')}<span>Duplicate</span></button></div></div></div>

    <div class="c-8" style="display:flex;flex-direction:column;gap:18px;min-width:0">
      <div class="card"><div class="card-h"><div><h3>${esc(sel.name)} · portfolio over time</h3><div class="sub">Inflation-adjusted to today's dollars · band = middle half of outcomes for the selected scenario</div></div></div>
        <div class="stat-row" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
          <div class="mini"><div class="l">Lasts to 95</div><div class="v num ${selRun.prob >= SCCONF ? 'pos' : selRun.prob >= .7 ? '' : 'neg'}">${fmtPct(selRun.prob)}</div></div>
          <div class="mini"><div class="l">Median at ${sel.p.retire}</div><div class="v num">${short(deflate(pctl(selRun.paths, .5)[sel.p.retire - ageNow], sel.p.retire - ageNow, sel.p))}</div></div>
          <div class="mini"><div class="l">Withdrawal rate yr 1</div><div class="v num" id="wr"></div></div>
          <div class="mini"><div class="l">Earliest age (${fmtPct(SCCONF)})</div><div class="v num">${earliest(sel) ?? '> 65'}</div></div></div>
        <div class="chart" id="scChart"></div><div class="legend">${vis.map(s => `<span><i class="sw" style="background:${SC_COLORS[SCN.indexOf(s) % 5]}"></i>${esc(s.name)} median</span>`).join('')}</div></div>
      <div class="card"><div class="card-h"><div><h3>Compare scenarios</h3><div class="sub">Today's dollars · same 400 market paths for every scenario, so differences come from the assumptions alone</div></div></div>
        <div class="scroll-x"><table class="table cmp" id="scTable"></table></div></div>
    </div>
    <div class="card c-12"><div class="card-h"><div><h3>What moves your retirement date</h3><div class="sub">${esc(sel.name)}: years earlier (green) or later (red) for the earliest ${fmtPct(SCCONF)}-confidence age when one assumption changes</div></div></div><div class="chart" id="sensChart"></div></div>
  </div>`;
  // interactions
  $$('#cfSeg button', host).forEach(b => b.onclick = () => { SCCONF = +b.dataset.c; render(); });
  const hqF = {retire: v => v, spend: v => short(v) + '/yr', ss: v => v ? short(v) + '/yr' : 'None'};
  $$('[data-hq]', host).forEach(inp => { inp.oninput = () => { $('#hq-' + inp.dataset.hq).textContent = hqF[inp.dataset.hq](+inp.value); }; inp.onchange = () => { sel.p[inp.dataset.hq] = +inp.value; sel.note = 'Edited'; render(); }; });
  $$('.sc', host).forEach(r => r.onclick = e => { if (e.target.closest('[data-eye]')) return; SCSEL = r.dataset.s; render(); });
  $$('[data-eye]', host).forEach(b => b.onclick = () => { const s = SCN.find(x => x.id === b.dataset.eye); s.show = !s.show; render(); });
  $('#scName').onchange = e => { const v = e.target.value.trim(); if (v && SCN.some(s => s !== sel && s.name === v)) return toast('Another scenario has that name'); sel.name = v || sel.name; render(); };
  $$('.sc-edit input[type=range]', host).forEach(inp => { inp.oninput = () => { const k = inp.dataset.k; $('#sv-' + k).textContent = sliders.find(s => s[0] === k)[5](+inp.value); }; inp.onchange = () => { sel.p[inp.dataset.k] = +inp.value; sel.note = 'Edited'; render(); }; });
  if ($('#scMort')) $('#scMort').onchange = e => { sel.p.mortgageDrop = e.target.checked; sel.note = 'Edited'; render(); };
  if ($('#scDebt')) $('#scDebt').onchange = e => { sel.p.debtSave = e.target.checked; sel.note = 'Edited'; render(); };
  $('#scCrash').onchange = e => { sel.p.crash = e.target.checked; render(); };
  const dup = () => { if (SCN.length >= 5) return toast('Up to 5 scenarios'); let nm = sel.name + ' (copy)', k = 2; while (SCN.some(s => s.name === nm)) nm = sel.name + ' (copy ' + k++ + ')'; const n = {id: 's' + Date.now(), name: nm, note: 'Copy of ' + sel.name, p: {...sel.p}, show: true}; SCN.push(n); SCSEL = n.id; render(); };
  $('#scDup').onclick = dup; $('#scAdd').onclick = dup;
  if ($('#scDel')) $('#scDel').onclick = () => { const was = [...SCN]; SCN = SCN.filter(s => s !== sel); SCSEL = SCN[0].id; render(); toast(`Deleted ${sel.name}`, () => { SCN = was; SCSEL = sel.id; render(); }); };
  // table
  const rows = SCN.map((s, i) => { const r = scnRun(s), ri = s.p.retire - ageNow, p50 = pctl(r.paths, .5), p25 = pctl(r.paths, .25);
    const at = (age, arr) => deflate(arr[age - ageNow], age - ageNow, s.p); return {s, i, r, p50, p25, ri, at}; });
  $('#scTable').innerHTML = `<tr><th>Scenario</th><th>Retire</th><th>Spend</th><th>Return</th><th>Lasts to 95</th><th>Median at retire</th><th>Median at 75</th><th>Weak market at 75</th><th>Earliest (${fmtPct(SCCONF)})</th></tr>` +
    rows.map(({s, i, r, p50, p25, at}) => `<tr class="click ${s.id === sel.id ? 'cur' : ''}" data-s="${s.id}"><td><span class="tw"><i class="sw" style="background:${SC_COLORS[i % 5]}"></i>${esc(s.name)}</span></td><td>${s.p.retire}</td><td>${short(s.p.spend)}</td><td>${(s.p.ret * 100).toFixed(1)}%</td><td class="${r.prob >= SCCONF ? 'pos' : r.prob >= .7 ? '' : 'neg'}"><b>${fmtPct(r.prob)}</b></td><td>${short(at(s.p.retire, p50))}</td><td>${short(at(75, p50))}</td><td>${short(at(75, p25))}</td><td><b>${earliest(s) ?? '> 65'}</b></td></tr>`).join('');
  $$('#scTable tr[data-s]').forEach(tr => tr.onclick = () => { SCSEL = tr.dataset.s; render(); });
  const need0 = sel.p.spend * Math.pow(1 + sel.p.infl, sel.p.retire - ageNow) - mineralsAt(YNOW + sel.p.retire - ageNow) * sel.p.minerals;
  const port0 = pctl(selRun.paths, .5)[sel.p.retire - ageNow];
  $('#wr').textContent = (Math.max(0, need0) / (1 - sel.p.tax) / port0 * 100).toFixed(1) + '%';
  CH.push(
    () => { const w0 = scnSweep(SCN[0]); const series = vis.map(s => ({name: s.name, values: scnSweep(s).probs.map(v => v * 100), color: SC_COLORS[SCN.indexOf(s) % 5], width: s.id === sel.id ? 3 : 2}));
      series.push({name: 'Target', values: w0.ages.map(() => SCCONF * 100), color: 'var(--text-3)', dash: '5 5', width: 1.5});
      lineChart($('#swChart'), {labels: w0.ages, series, height: 260, padL: 44, zero: true, yFmt: v => Math.round(v) + '%', tipFmt: v => Math.round(v) + '%', tipTitle: a => 'Retire at ' + a + ' (' + (YNOW + a - ageNow) + ')', xGap: 40}); },
    () => { const ages = Array.from({length: 95 - ageNow + 1}, (_, t) => ageNow + t);
      const series = vis.map(s => { const r = scnRun(s); return {name: s.name, values: pctl(r.paths, .5).map((v, t) => deflate(v, t, s.p)), color: SC_COLORS[SCN.indexOf(s) % 5], width: s.id === sel.id ? 3 : 2}; });
      const lo = pctl(selRun.paths, .25).map((v, t) => deflate(v, t, sel.p)), hi = pctl(selRun.paths, .75).map((v, t) => deflate(v, t, sel.p));
      lineChart($('#scChart'), {labels: ages, series, band: {lo, hi, color: SC_COLORS[SCN.indexOf(sel) % 5], name: sel.name + ' middle half'}, height: 280, zero: true, vlines: [{i: sel.p.retire - ageNow, label: 'Retire ' + sel.p.retire}], markers: Object.entries(plannedFlows()).map(([y, amt], k) => { const i = +y - YNOW; return i > 0 && i < ages.length ? {i, s: Math.max(0, series.findIndex(x => x.name === sel.name)), color: 'var(--s5)', label: `${(ST.planned || []).filter(p => +p.due.slice(0, 4) === +y && !['college_529', 'budget'].includes(p.fund)).map(p => p.name).join(', ')} −${short(amt)}`, dy: (k % 2) * 13} : null; }).filter(Boolean), xFmt: (lb, i) => i % 5 === 0 ? lb : null, tipTitle: (a, i) => `Age ${a} · ${YNOW + i}`}); },
    () => drawSensitivity(sel)
  );
}
function drawSensitivity(sel) {
  const e0 = earliest(sel); if (e0 == null) { $('#sensChart').innerHTML = '<p class="muted" style="padding:20px 0">No retirement age reaches the target with these assumptions, so there is no date to move. Try lowering spending or the confidence target.</p>'; return; }
  const tests = [
    ['Spend $25k/yr less', {spend: sel.p.spend - 25000}], ['Spend $25k/yr more', {spend: sel.p.spend + 25000}],
    ['Return +1%', {ret: sel.p.ret + .01}], ['Return −1%', {ret: sel.p.ret - .01}],
    ['Save $25k/yr more until retiring', {pre: sel.p.pre + 25000}], ['Minerals at half of forecast', {minerals: sel.p.minerals * .5}],
    ['Social Security $40k/yr at 67', {ss: 40000, ssAge: 67}], ['Inflation +1%', {infl: sel.p.infl + .01}],
    ['Health insurance $25k/yr until 65', {health: sel.p.health + 25000}],
  ];
  const rows = tests.map(([n, d]) => { const e = earliest({p: {...sel.p, ...d}}); return {name: n, v: e == null ? -(66 - e0) : e0 - e, a: e, b: e0}; }).filter(r => true).sort((p, q) => q.v - p.v);
  const el = $('#sensChart'), narrow = el.clientWidth < 600, rh = narrow ? 46 : 30, h = rows.length * rh + 8, [s, w] = svgEl(el, h);
  const labW = narrow ? 0 : Math.min(240, w * .4), cx = labW + (w - labW) / 2, half = (w - labW) / 2 - 90, m = Math.max(1, ...rows.map(r => Math.abs(r.v)));
  add(s, 'line', {x1: cx, x2: cx, y1: narrow ? 16 : 0, y2: h}, 'stroke:var(--border-strong)');
  rows.forEach((r, i) => { const y = i * rh + (narrow ? 22 : 6), len = Math.max(2, Math.abs(r.v) / m * half), good = r.v >= 0;
    txt(s, 0, narrow ? y - 6 : y + 12, r.name, 'start', 'fill:var(--text-2);font-size:12px;font-weight:500');
    if (r.v !== 0) add(s, 'rect', {x: good ? cx : cx - len, y, width: len, height: 16, rx: 4}, `fill:${good ? 'var(--pos)' : 'var(--neg)'}`);
    txt(s, r.v === 0 ? cx + 8 : good ? cx + len + 6 : cx - len - 6, y + 12, r.v === 0 ? 'no change' : r.a == null ? 'not by 65' : (good ? `${r.v} yr earlier · ${r.a}` : `${-r.v} yr later · ${r.a}`), r.v === 0 || good ? 'start' : 'end', 'fill:var(--text);font-weight:600'); });
}

/* ---------------- Benchmarks (Investments page) ---------------- */
const BM = {period: 'all', show: new Set(CTX.prefs.bm?.show || ['sp', 'mod', 'agg']), stocks: CTX.prefs.bm?.stocks ?? 60};
const BM_DEF = {sp: {n: 'S&P 500 (total return)', c: 'var(--s3)', code: 'SP500TR'}, mod: {n: '60/40 moderate allocation', c: 'var(--s2)', code: 'AOR'}, agg: {n: 'US aggregate bonds', c: 'var(--s4)', code: 'AGG'}, cus: {n: 'Custom blend', c: 'var(--s5)'}};
const BM_RET = (() => { const o = {}; (CTX.benchReturns || []).forEach(([code, m, r]) => { (o[code] ||= {})[m] = +r; }); return o; })();
const bmHas = k => k === 'cus' ? SCH.every(r => BM_RET.SP500TR?.[r.m] != null && BM_RET.AGG?.[r.m] != null) : SCH.length && SCH.every(r => BM_RET[BM_DEF[k].code]?.[r.m] != null);
const SCH_SHORT = SCH_NAME.split(' ').pop();
function bmSeries() {
  const st = BM.period === 'ytd' ? Math.max(0, SCH.findIndex(r => r.m.startsWith(String(CY)))) : BM.period === '1y' ? Math.max(0, SCH.length - 12) : 0;
  const rows = SCH.slice(st);
  const net = rows.map(r => nz((r.div + r.mkt + r.fee) / r.start)), gross = rows.map(r => nz((r.div + r.mkt) / r.start));
  const S = [{k: 'net', n: `Your ${SCH_SHORT} (after fees)`, c: 'var(--s1)', r: net, real: true}, {k: 'gross', n: `Your ${SCH_SHORT} (before fees)`, c: 'var(--s1)', dash: '4 4', r: gross, real: true}];
  ['sp', 'mod', 'agg'].forEach(k => BM.show.has(k) && bmHas(k) && S.push({k, ...BM_DEF[k], r: rows.map(x => BM_RET[BM_DEF[k].code][x.m])}));
  if (BM.show.has('cus') && bmHas('cus')) S.push({k: 'cus', ...BM_DEF.cus, n: `Custom ${BM.stocks}/${100 - BM.stocks}`, r: rows.map(x => BM.stocks / 100 * BM_RET.SP500TR[x.m] + (1 - BM.stocks / 100) * BM_RET.AGG[x.m])});
  return {labels: [ymAdd(rows[0].m, -1)].concat(rows.map(r => r.m)), S};
}
function bmStats(r) {
  const n = r.length, cum = r.reduce((a, x) => a * (1 + x), 1) - 1, ann = Math.pow(1 + cum, 12 / n) - 1;
  const mu = sum(r) / n, vol = Math.sqrt(sum(r.map(x => (x - mu) ** 2)) / (n - 1)) * Math.sqrt(12);
  let peak = 1, v = 1, dd = 0; r.forEach(x => { v *= 1 + x; peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); });
  return {cum, ann, vol, dd, sharpe: (ann - .042) / vol, best: Math.max(...r), worst: Math.min(...r)};
}
function benchCard() {
  return `<div class="card c-12" id="bmCard"><div class="card-h"><div><h3>Benchmark comparison</h3><div class="sub">Growth of $100 · time-weighted monthly returns, so deposits and withdrawals don't distort the comparison</div></div>
    <div class="right"><div class="seg" id="bmP">${[['ytd', 'YTD'], ['1y', '1Y'], ['all', 'Since ' + mShort(SCH[0].m).replace("'", '’')]].map(([k, l]) => `<button data-k="${k}" class="${BM.period === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="bm-chips">${Object.entries(BM_DEF).map(([k, d]) => `<button class="bm-chip ${BM.show.has(k) && bmHas(k) ? 'on' : ''}" data-b="${k}" ${bmHas(k) ? '' : 'disabled style="opacity:.45" title="No benchmark data loaded yet"'}><i class="sw" style="background:${d.c}"></i>${k === 'cus' ? `Custom ${BM.stocks}/${100 - BM.stocks}` : d.n}</button>`).join('')}
      ${BM.show.has('cus') && bmHas('cus') ? `<label class="bm-mix">Stocks <input type="range" id="bmMix" min="0" max="100" step="10" value="${BM.stocks}"> <b id="bmMixV">${BM.stocks}%</b></label>` : ''}${['sp', 'mod', 'agg'].some(bmHas) ? '' : '<span class="sample-pill">No benchmark data yet</span>'}</div>
    <div class="chart" id="bmChart"></div><div class="legend" id="bmLeg"></div>
    <div class="scroll-x" style="margin-top:14px"><table class="table cmp" id="bmTable"></table></div>
    <p class="muted" style="font-size:var(--fs-xs);margin-top:10px">Your lines use your monthly statements. Benchmark lines come from <code>finance.benchmark_returns</code> (monthly total returns); load them with the benchmark job in the README. Choose the benchmark that matches the account's target mix.</p></div>`;
}
function drawBench() {
  const el = $('#bmChart'); if (!el) return;
  const {labels, S} = bmSeries();
  const growth = r => [100].concat(r.reduce((a, x) => (a.push(a[a.length - 1] * (1 + x)), a), [100]).slice(1));
  lineChart(el, {labels, series: S.map(x => ({name: x.n, values: growth(x.r), color: x.c, dash: x.dash, width: x.k === 'net' ? 3 : 2})), height: 280, xFmt: (lb, i, e) => i % e === 0 ? mShort(lb) : null, tipTitle: mLabel, tipFmt: v => '$' + v.toFixed(1), xGap: 70});
  $('#bmLeg').innerHTML = S.map(x => `<span><i class="sw" style="background:${x.c};${x.dash ? 'opacity:.5' : ''}"></i>${esc(x.n)}</span>`).join('');
  const st = S.map(x => ({...x, ...bmStats(x.r)})), me = st[0];
  const p = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';
  $('#bmTable').innerHTML = `<tr><th>Series</th><th>Total return</th><th>Annualized</th><th>Volatility</th><th>Worst drop</th><th>Return per unit of risk</th><th>vs. your Schwab</th></tr>` +
    st.map(x => `<tr class="${x.k === 'net' ? 'cur' : ''}"><td><span class="tw"><i class="sw" style="background:${x.c};${x.dash ? 'opacity:.5' : ''}"></i>${esc(x.n)}</span></td><td><b>${p(x.cum)}</b></td><td>${p(x.ann)}</td><td>${(x.vol * 100).toFixed(1)}%</td><td class="neg">${p(x.dd)}</td><td>${x.sharpe.toFixed(2)}</td><td class="${x.k === 'net' ? 'muted' : x.ann > me.ann ? 'neg' : 'pos'}">${x.k === 'net' ? '—' : x.k === 'gross' ? 'Fees cost ' + Math.abs((x.ann - me.ann) * 100).toFixed(1) + ' pts/yr' : (x.ann > me.ann ? 'Ahead of you by ' : 'Behind you by ') + Math.abs((x.ann - me.ann) * 100).toFixed(1) + ' pts/yr'}</td></tr>`).join('');
  const feeDrag = st[1].ann - st[0].ann;
  $('#bmTable').insertAdjacentHTML('afterend', '');
  const card = $('#bmCard'); let fd = $('#bmFee', card); if (!fd) { fd = document.createElement('div'); fd.id = 'bmFee'; fd.className = 'hint'; $('#bmTable').parentElement.after(fd); }
  fd.innerHTML = `${icon('wand')}<span>Fees cost you <b>${(feeDrag * 100).toFixed(2)} points a year</b> over this period (${p(st[1].cum)} before fees vs. ${p(st[0].cum)} after). From your own statements.</span>`;
  $$('#bmP button').forEach(b => b.onclick = () => { BM.period = b.dataset.k; $$('#bmP button').forEach(x => x.classList.toggle('on', x === b)); drawBench(); });
  $$('.bm-chip').forEach(b => b.onclick = () => { const k = b.dataset.b; if (!bmHas(k)) return; BM.show.has(k) ? BM.show.delete(k) : BM.show.add(k); render(); });
  if ($('#bmMix')) $('#bmMix').oninput = e => { BM.stocks = +e.target.value; $('#bmMixV').textContent = BM.stocks + '%'; drawBench(); };
}

// one-line answer for other pages: the base scenario's chance at its own retirement age and spending
function retireHeadline() { const sc = SCN[0]; if (!sc) return null; const r = scnRun(sc); return {prob: r.prob, age: sc.p.retire, spend: sc.p.spend, name: sc.name, ok: r.prob >= SCCONF, conf: SCCONF}; }
