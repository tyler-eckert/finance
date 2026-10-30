/* =====================================================================
   PLAN & INVESTMENTS · Summary — where the money is, where it's heading, what comes out of it
   (milestones and debts), retirement odds, the kids' 529s and what to do better.
   The detailed views (investment history, milestones & minerals, scenarios) stay one click away.
   ===================================================================== */
let PI_ACCT = 'all';
const FUND_OPTS = () => [['brokerage', `${SCH_NAME} (brokerage)`], ['cash', 'Cash'], ['college_529', '529'], ['budget', 'Monthly budget'], ['other', 'Other']];
const fundLabel = f => (FUND_OPTS().find(x => x[0] === f) || [, 'Other'])[1];
const upcomingMiles = () => (ST.planned || []).filter(livePlan).sort((a, b) => a.due.localeCompare(b.due));

// which account a milestone comes out of (brokerage → the cash-flow brokerage account, e.g. Schwab)
const drawAcct = f => f === 'brokerage' ? CTX.flowKey : f === 'college_529' ? 'college' : null;

// expected path for one account (or all 529s): history, then growth + savings + freed loan payments − milestones paid from it, until retirement
function acctPath(key, sc) {
  const yrs = Math.max(1, sc.p.retire - ageNow), nF = yrs * 12, rm = Math.pow(1 + sc.p.ret, 1 / 12) - 1;
  const hist = key === 'college' ? BS.college : BS[key], i0 = Math.max(0, L - 60);
  const hL = BS.months.slice(i0, L + 1), hV = hist.slice(i0, L + 1);
  const months = [], vals = [], draws = [], D = DEBTS();
  if (key === 'college') { for (let t = 1; t <= Math.min(nF, 12 * 18); t++) { const m = ymAdd(LASTM, t); months.push(m); vals.push(collegeAt(m)); } }
  else {
    const add = (key === CTX.flowKey ? sc.p.pre : key === CTX.contribKey ? contrib401 : 0) / 12, freed = key === CTX.flowKey && sc.p.debtSave !== false;
    const out = {}; upcomingMiles().filter(p => drawAcct(p.fund) === key).forEach(p => { out[p.due] = (out[p.due] || 0) + Math.abs(p.amount); draws.push(p); });
    let b = hV[hV.length - 1] || 0;
    for (let t = 1; t <= nF; t++) { const m = ymAdd(LASTM, t); b = Math.max(0, b * (1 + rm) + add + (freed ? freedAt(m, D) : 0) - (out[m] || 0)); months.push(m); vals.push(b); }
  }
  const dfl = t => PV.real ? Math.pow(1 + sc.p.infl, t / 12) : 1;
  return {hL, hV, months, vals: vals.map((v, t) => v / dfl(t + 1)), draws, debts: key === CTX.flowKey ? D : []};
}
// each child's 529 on the semester draw plan (same numbers as Investment detail → College and Year in review)
const piKids = () => DATA.kids.map(k => { const kk = {...k, y18: collegeYear(k)}, cp = colProject(kk), on = COLP().draws && kidPlan(kk).on;
  return {n: k.name, bal: BS[k.key]?.[L] || 0, y: kk.y18, start: cp.atStart, drawn: cp.drawn, end: cp.end, short: cp.firstShort, extra: cp.extra, f: cp.covered, on}; });

function renderPlanSimple(pg) {
  const sel = SCN.find(s => s.id === SCSEL) || SCN[0], run = scnRun(sel), e = earliest(sel), pct0 = v => Math.round(v * 100) + '%';
  const medRet = deflate(pctl(run.paths, .5)[sel.p.retire - ageNow] || 0, sel.p.retire - ageNow, sel.p);
  const inv = investable(L), tot = inv + BS.college[L], inv12 = investable(i12) + BS.college[i12];
  const accts = CTX.invAccts.filter(a => a.group !== 'College');
  const target = DATA.assume.collegeTarget, mo529 = DATA.assume.college529Monthly, kids = DATA.kids.length ? piKids() : [];
  const miles = upcomingMiles(), fromInv = sum(miles.filter(fromSavings).map(p => Math.abs(p.amount)));
  const D = DEBTS(), dRet = YNOW + sel.p.retire - ageNow;
  const views = [['all', 'All investments + 529s'], ['inv', 'Investable (retirement plan)'], ...accts.map(a => [a.k, a.n]), ...(DATA.kids.length ? [['college', '529s']] : [])];
  if (!views.some(v => v[0] === PI_ACCT)) PI_ACCT = 'all';
  const Q = [['retire', 'Retire at', 45, 65, 1, v => 'age ' + v], ['spend', 'Spending in retirement', 120000, 360000, 5000, v => short(v) + '/yr'],
    ['pre', 'Saving each year until then', -120000, 120000, 5000, v => (v >= 0 ? '+' : '') + short(v) + '/yr'], ['ret', 'Investment return', .04, .10, .0025, v => (v * 100).toFixed(2).replace(/\.?0+$/, '') + '%'],
    ['ss', 'Social Security', 0, 80000, 2500, v => v ? short(v) + '/yr' : 'None']];
  const g12 = (k, j) => { const a = BS[k]?.[i12] || 0, b = BS[k]?.[L] || 0; return a > 0 ? b / a - 1 : null; };
  // v99: each row shows the 12-month change as a % and in dollars
  const d12 = k => (BS[k]?.[L] || 0) - (BS[k]?.[i12] || 0), sgn$ = v => (v >= 0 ? '+' : '−') + short(Math.abs(v));
  const accRow = (n, k, col) => { const c = g12(k), d = d12(k); return `<div class="pi-acc"><span class="nm">${esc(n)}</span><span class="sp">${spark(BS[k].slice(-24), col, 70, 22, false)}</span><span class="amt num">${short(BS[k][L])}</span><span class="pc">${c == null ? '<span class="muted">—</span>' : chip(c)}${c == null ? '' : `<small class="num ${d >= 0 ? 'pos' : 'neg'}">${sgn$(d)}</small>`}</span></div>`; };
  const sub = {all: `Every investment account plus the 529s · plan range from ${esc(sel.name)} · milestones, loan payoffs and each college semester show in their month`,
    inv: `What the retirement plan counts (no 529s) · plan range from ${esc(sel.name)} · milestones paid from savings come out in their month`,
    college: `All 529s · ${money(mo529)}/mo each until college, then each semester’s draw`}[PI_ACCT] || `Expected path at ${(sel.p.ret * 100).toFixed(1)}% a year until you retire · milestones paid from this account come out in their month${PI_ACCT === CTX.flowKey && sel.p.debtSave !== false ? ', freed loan payments go in' : ''}`;
  INS = buildInsights();
  pg.innerHTML = `<div class="grid g-12">
    <div class="card hero c-8 pi-hero"><div class="label hero-top"><span>Retirement · ${esc(sel.name)}</span>
        <select class="in sel pi-sc" id="piSc" title="Scenario">${SCN.map(s => `<option value="${s.id}" ${s.id === sel.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="rh-head"><span class="val num">${pct0(run.prob)}</span><span class="rh-say">chance the money lasts to 95 if we retire at <b>${sel.p.retire}</b> spending <b>${short(sel.p.spend)}/yr</b></span></div>
      <div class="delta">${e ? `Earliest age with a ${pct0(SCCONF)} chance: <b>${e}</b> (${YNOW + e - ageNow})` : `No age before 65 reaches ${pct0(SCCONF)}`} · median <b>${short(medRet)}</b> invested at ${sel.p.retire} (today’s $)${fromInv ? ` · after ${short(fromInv)} of milestones` : ''}${D.length ? ` · ${D.filter(d => d.end <= `${dRet}-12`).length} of ${D.length} loans paid off by then` : ''}</div>
      <div class="pi-q rh-quick">${Q.map(([k, l, mn, mx, st, f]) => `<div><label>${l} <b id="pq-${k}">${f(sel.p[k])}</b></label><input type="range" min="${mn}" max="${mx}" step="${st}" value="${sel.p[k]}" data-pq="${k}"></div>`).join('')}</div>
      <div class="pi-more"><button class="link hero-link" id="piAdv">More settings & scenarios →</button></div></div>
    <div class="card c-4 kpi"><div class="label"><span class="ico">${icon('invest')}</span>Invested today</div><div class="val num">${short(tot)}</div>
      <div class="delta">${chip(nz((tot - inv12) / inv12))} <b class="num ${tot - inv12 >= 0 ? 'pos' : 'neg'}" style="margin-left:4px">${(tot - inv12 >= 0 ? '+' : '−') + short(Math.abs(tot - inv12))}</b> past 12 mo <span class="muted">· includes contributions</span></div>
      <div class="pi-accs"><div class="pi-acc pi-acc-h"><span></span><span>24 mo</span><span>Balance</span><span>12 mo</span></div>
        ${accts.map(a => accRow(a.n, a.k, a.group === 'Retirement' ? 'var(--s2)' : 'var(--s1)')).join('')}${DATA.kids.length ? accRow('529s', 'college', 'var(--s5)') : ''}</div></div>

    <div class="card c-8"><div class="card-h"><div><h3>History & plan</h3><div class="sub">${sub} · ${PV.real ? "today's $" : 'future $'}</div></div>
      <div class="right" style="display:flex;gap:8px;align-items:center">${lblToggle()}<select class="in sel" id="piAcct">${views.map(([k, l]) => `<option value="${k}" ${k === PI_ACCT ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
      <div class="chart" id="piChart"></div>
      <div class="legend"><span><i class="sw" style="background:var(--s1)"></i>Actual</span><span><i class="sw" style="background:var(--s1);opacity:.5"></i>${PI_ACCT === 'all' || PI_ACCT === 'inv' ? 'Plan median & middle half' : 'Expected'}</span><span><i class="sw" style="background:var(--s5);border-radius:50%"></i>Milestone</span><span><i class="sw" style="background:var(--s3);border-radius:50%"></i>Loan paid off</span>
        <span style="margin-left:auto"><button class="link" id="piReal">${PV.real ? 'Show future $' : "Show today's $"}</button></span></div></div>

    <div class="card c-4"><div class="card-h"><div><h3>Milestones</h3><div class="sub">Big expenses ahead · pick what pays for each</div></div>${CTX.CAN_WRITE ? `<div class="right"><button class="btn" style="height:30px" onclick="addExpense()">${icon('plus')}<span>Add</span></button></div>` : ''}</div>
      <div class="pi-miles">${miles.map(p => `<div class="pi-m"><div class="pi-m1"><b>${esc(p.name)}</b><span class="num">−${short(Math.abs(p.amount))}</span></div>
        <div class="pi-m2"><span class="muted">${mLabel(p.due)}</span><select class="in sel" data-pf="${p.id}" ${CTX.CAN_WRITE ? '' : 'disabled'}>${FUND_OPTS().map(([k, l]) => `<option value="${k}" ${p.fund === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${CTX.CAN_WRITE ? `<button class="mini-btn" data-prm="${p.id}" title="Remove">${icon('close')}</button>` : ''}</div></div>`).join('') || '<p class="muted">Nothing planned. Add a pool, a car or a trip and see what it does to the plan.</p>'}</div>
      <p class="muted" style="font-size:var(--fs-xs);margin-top:8px">${esc(SCH_NAME)}, Cash and Other milestones come out of the retirement plan; 529 and Monthly budget ones don’t.</p></div>

    ${D.length ? `<div class="card c-4"><div class="card-h"><div><h3>Debts</h3><div class="sub">When each loan is gone and what it frees up</div></div></div>
      <div class="pi-debts">${D.map(d => { const l = loanById(d.id); return `<div class="pi-d"><div class="pi-m1"><b>${esc(d.n)}</b><span class="num">${short(loanBal(l))}</span></div>
        <div class="pi-m2"><span class="muted">${d.early ? `Paid off ${mLabel(d.end)} <span class="chip pos">early</span>` : `Paid off ${mLabel(d.end)}`}</span><span style="margin-left:auto" class="num">+${money(d.pmt)}/mo</span></div></div>`; }).join('')}</div>
      ${CTX.CAN_WRITE ? `<div class="pi-pay"><select class="in sel" id="piPayL">${D.filter(d => !d.early).map(d => `<option value="${d.id}">${esc(d.n)}</option>`).join('')}</select><input class="in" type="month" id="piPayM" value="${ymAdd(CTX.ASOF_YM, 12)}"><button class="btn" style="height:32px" id="piPay">Plan payoff</button></div>` : ''}
      <p class="muted" style="font-size:var(--fs-xs);margin-top:8px">${sel.p.debtSave !== false ? 'Until you retire, freed payments go to savings' : 'Freed payments aren’t added to savings'}${sel.p.mortgageDrop ? '; in retirement they lower what you need' : ''}. An early payoff adds a milestone for the balance left, paid from ${esc(SCH_NAME)}.</p></div>` : ''}

    ${kids.length ? `<div class="card ${D.length ? 'c-8' : 'c-12'}"><div class="card-h"><div><h3>College</h3><div class="sub">${COLP().draws ? `529 today → at the start of college, then each semester’s draw · ${money(mo529)}/mo each until then` : `529 today → at the start of college vs. the ${short(target)} goal · ${money(mo529)}/mo each`}</div></div><div class="right"><button class="link" id="piCol">Draws & details →</button></div></div>
      <div class="pi-kids">${kids.map(k => `<div class="pi-k"><div class="pi-k1"><b>${esc(k.n)}</b><span class="muted">starts ${k.y}</span></div><div class="pi-k2"><span>${short(k.bal)} today</span><span>→ <b>${short(k.start)}</b> at start</span></div>
        <div class="pbar"><i class="${k.f < 1 ? 'over' : ''}" style="width:${Math.min(100, k.f * 100)}%"></i></div>
        <div class="muted" style="font-size:var(--fs-xs)">${k.on && k.drawn ? `Covers ${Math.round(k.f * 100)}% of ${short(k.drawn)} in draws${k.short ? ` · runs short ${mLabel(k.short)}` : ''}` : `${Math.round(k.f * 100)}% of the ${short(target)} goal`}${k.extra ? ` · ~${money(k.extra)}/mo more would close it` : ''}</div></div>`).join('')}</div></div>` : ''}

    <div class="card c-12"><div class="card-h"><div><h3>What to do better</h3><div class="sub">Generated from your budget, balances and forecasts · ranked by impact</div></div></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:0 28px">${insHTML(INS)}</div></div>
  </div>`;
  // ---- interactions
  $('#piSc').onchange = ev => { SCSEL = ev.target.value; render(); };
  const fmt = Object.fromEntries(Q.map(q => [q[0], q[5]]));
  $$('[data-pq]', pg).forEach(inp => { inp.oninput = () => { $('#pq-' + inp.dataset.pq).textContent = fmt[inp.dataset.pq](+inp.value); }; inp.onchange = () => { sel.p[inp.dataset.pq] = +inp.value; sel.note = 'Edited'; render(); }; });
  $('#piAdv').onclick = () => { PLV = 'retire'; render(); };
  if ($('#piCol')) $('#piCol').onclick = () => { PLV = 'invest'; render(); setTimeout(() => $('#colCard')?.scrollIntoView({behavior: 'smooth'}), 250); };
  $('#piAcct').onchange = ev => { PI_ACCT = ev.target.value; render(); };
  $('#piReal').onclick = () => { PV.real = !PV.real; render(); };
  $$('[data-pf]', pg).forEach(s => s.onchange = () => { const p = ST.planned.find(x => x.id === s.dataset.pf); if (p) { p.fund = s.value; render(); toast(`${p.name}: paid from ${fundLabel(s.value)}`); } });
  $$('[data-prm]', pg).forEach(b => b.onclick = () => { const p = ST.planned.find(x => x.id === b.dataset.prm); ST.planned = ST.planned.filter(x => x !== p); render(); toast(`Removed ${p.name}`, () => { ST.planned.push(p); render(); }); });
  if ($('#piPay')) $('#piPay').onclick = () => { const l = loanById($('#piPayL').value), m = $('#piPayM').value; if (!l || !/^\d{4}-\d{2}$/.test(m)) return;
    const bal = Math.round(loanBal(l, m)); if (bal <= 0) return toast(`${l.name} is already paid off by ${mLabel(m)}`);
    ST.planned.push({id: 'p' + Date.now(), name: `Pay off ${l.name}`, due: m, amount: bal, fund: 'brokerage', notes: `Early payoff · frees ${money(l.pmt || 0)}/mo`, sinking: false, status: 'planned'});
    render(); toast(`Added: pay off ${l.name} · ${mLabel(m)} · ${short(bal)}`); };
  wireLblToggle();
  // ---- chart
  CH.push(() => {
    if (PI_ACCT === 'all' || PI_ACCT === 'inv') { const i0 = Math.max(0, L - 60), hL = BS.months.slice(i0, L + 1);
      histPlanChart($('#piChart'), {hLabels: hL, hVals: hL.map((m, k) => investable(i0 + k) + (PI_ACCT === 'all' ? BS.college[i0 + k] || 0 : 0)), kind: PI_ACCT, name: PI_ACCT === 'all' ? 'Invested' : 'Investable', height: 340, sc: sel, years: Math.max(sel.p.retire - ageNow + 1, ...DATA.kids.map(k => collegeYear(k) + 5 - YNOW), 10)}); return; }
    const P = acctPath(PI_ACCT, sel), labels = P.hL.concat(P.months), nH = P.hL.length, last = P.hV[nH - 1];
    const actual = P.hV.concat(P.months.map(() => null)), proj = P.hL.map((_, i) => i === nH - 1 ? last : null).concat(P.vals);
    const showLbl = UI.chartLabels !== false;
    const markers = P.draws.map((p, k) => { const i = labels.indexOf(p.due); return i < 0 ? null : {i, s: 1, color: 'var(--s5)', r: 4.5, label: showLbl ? `${p.name} −${short(Math.abs(p.amount))}` : null, dy: (k % 2) * 13}; }).filter(Boolean);
    P.debts.forEach(d => { const i = labels.indexOf(d.end); if (i >= nH) markers.push({i, s: 1, color: 'var(--s3)', r: 4, label: null}); });
    const ri = labels.indexOf(`${YNOW + sel.p.retire - ageNow}-${LASTM.slice(5)}`);
    lineChart($('#piChart'), {labels, series: [{name: 'Actual', values: actual, color: 'var(--s1)', area: true}, {name: 'Expected', values: proj, color: 'var(--s1)', dash: '6 5', width: 2}], height: 340, markers,
      vlines: [{i: nH - 1, label: 'Today'}, ...(ri > 0 ? [{i: ri, label: 'Retire ' + sel.p.retire}] : [])], zero: true, xGap: 74,
      xFmt: (lb, i, e) => i % e === 0 ? (labels.length > 200 ? "'" + lb.slice(2, 4) : mShort(lb)) : null, tipTitle: mLabel,
      tipExtra: i => P.draws.filter(p => p.due === labels[i]).map(p => tipRow('var(--s5)', p.name, '−' + money(Math.abs(p.amount)))).join('') + P.debts.filter(d => d.end === labels[i]).map(d => tipRow('var(--s3)', d.n + ' paid off', '+' + money(d.pmt) + '/mo')).join('')});
  });
}
