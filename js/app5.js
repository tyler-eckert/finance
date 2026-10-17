/* =====================================================================
   TAXES — estimated payments (Federal · Oklahoma · New Mexico), refunds,
   history, safe-harbor projection from the budget
   ===================================================================== */
const D4 = DATA4;
const JUR = {FED: {n: 'Federal', c: 'var(--s1)', cur: .9, prior: 1.1, priorLo: 1.0, rule: 'Lesser of 90% of this year’s tax or 100% of last year’s (110% if last year’s AGI was over $150k)'},
  OK: {n: 'Oklahoma', c: 'var(--s2)', cur: .7, prior: 1.0, rule: 'Lesser of 70% of this year’s tax or 100% of last year’s · underpayment interest 20%/yr'},
  NM: {n: 'New Mexico', c: 'var(--s3)', cur: .9, prior: 1.0, rule: 'Lesser of 90% of this year’s tax or 100% of last year’s (prior-year option needs a full-year NM return)'}};
const JK = ['FED', 'OK', 'NM'];
const QDUE = y => [{q: 'Q1', d: `${y}-04-15`}, {q: 'Q2', d: `${y}-06-15`}, {q: 'Q3', d: `${y}-09-15`}, {q: 'Q4', d: `${y + 1}-01-15`}];
const TODAY = CTX.TODAY;
const TX = {
  year: CY, jf: 'all', inc23: false,
  ledger: D4.ledger.map(l => ({...l, type: l.amt === 0 && l.type !== 'Refund' ? 'Overpayment note' : l.type})),
  prior: {}, highAGI: CTX.prefs.tax?.highAGI ?? ((D4.years[PY]?.inc || 0) > 150000), credit: {},
  rates: null, preset: String(PY),
};
const yrPaid = (y, j) => sum(TX.ledger.filter(l => l.ty === y && l.j === j && l.type !== 'Refund').map(l => l.amt));
const yrRef = (y, j) => -sum(TX.ledger.filter(l => l.ty === y && l.j === j && l.type === 'Refund').map(l => l.amt));
JK.forEach(j => { const t = D4.taxYears[PY]?.[j]; TX.prior[j] = t?.liability != null ? +t.liability : yrPaid(PY, j) - yrRef(PY, j); TX.credit[j] = +(t?.overpayment_applied_next || 0); });
const rateOf = ys => Object.fromEntries(JK.map(j => { const inc = sum(ys.map(y => D4.years[y]?.inc || 0)); return [j, inc ? sum(ys.map(y => D4.years[y]?.[j] || 0)) / inc : 0]; }));
const RATE_PRESETS = {[PY]: () => rateOf([PY]), [PY - 1]: () => rateOf([PY - 1]), 'avg': () => rateOf([PY - 1, PY])};
const RATE_LABELS = [[String(PY), PY + ' actual'], [String(PY - 1), (PY - 1) + ' actual'], ['avg', (PY - 1) + '–' + String(PY).slice(2) + ' blend']];
TX.rates = CTX.prefs.tax?.rates || RATE_PRESETS[PY](); if (CTX.prefs.tax?.preset) TX.preset = CTX.prefs.tax.preset;
const SAL = CTX.salaryCats || [];
/* income build-up for the projection year: actual months from the tax tab, rest from budget + forecasts */
function taxIncome(y = CY) {
  const rows = D4.income.filter(r => r.m.startsWith(String(y)));
  const divAct = rows.filter(r => r.div), divAvg = divAct.length ? sum(divAct.map(r => r.div)) / divAct.length : 0;
  const B = ST.budget[y] || {};
  return MON.map((_, i) => { const m = `${y}-${String(i + 1).padStart(2, '0')}`, r = rows.find(x => x.m === m) || {w2: 0, k1: 0, div: 0}, actual = m <= CTX.ASOF_YM;
    return {m, actual, w2: actual ? r.w2 : sum(SAL.map(c => B[c]?.[i] || 0)), k1: r.k1, div: actual ? r.div : divAvg}; });
}
function taxProjection(y = CY) {
  const inc = taxIncome(y), total = sum(inc.map(r => r.w2 + r.k1 + r.div));
  const out = {inc, total, j: {}};
  JK.forEach(j => {
    const proj = TX.rates[j] * total, J = JUR[j], priorMult = j === 'FED' ? (TX.highAGI ? 1.1 : 1.0) : J.prior;
    const viaCur = J.cur * proj, viaPrior = priorMult * TX.prior[j], req = Math.min(viaCur, viaPrior);
    const paid = yrPaid(y, j) + TX.credit[j];
    const qs = QDUE(y).map((q, k) => { const due = req * (k + 1) / 4, paidBy = sum(TX.ledger.filter(l => l.ty === y && l.j === j && l.type !== 'Refund' && l.d <= ymdPlus(q.d, 3)).map(l => l.amt)) + TX.credit[j];
      const st = q.d > TODAY ? 'upcoming' : paidBy + .5 >= due ? 'ok' : 'short'; return {...q, due, inst: req / 4, paidBy, st}; });
    out.j[j] = {proj, req, viaCur, viaPrior, method: viaPrior < viaCur ? 'prior' : 'current', paid, remaining: Math.max(0, req - paid), balance: Math.max(0, proj - Math.max(paid, req)), qs};
  });
  return out;
}
function ymdPlus(d, n) { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); }
const fmtD = d => MON[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)) + ', ' + d.slice(0, 4);
function bankTaxTx() {
  return ST.tx.filter(t => t.cat === 'Tax' && /Federal|Oklahoma|New Mexico/.test(t.sub || '')).map(t => {
    const j = /Federal/.test(t.sub) ? 'FED' : /Oklahoma/.test(t.sub) ? 'OK' : 'NM';
    const m = TX.ledger.find(l => l.j === j && Math.abs(Math.abs(l.amt) - Math.abs(t.amt)) < .01 && Math.abs(new Date(l.d) - new Date(t.d)) < 6 * 864e5);
    return {t, j, m};
  });
}

function renderTaxes(pg) {
  const P = taxProjection(CY), y = TX.year;
  const years = Object.keys(D4.years).map(Number).filter(v => v >= CY - 4 && v <= CY && (v === CY || D4.years[v].inc || JK.some(j => yrPaid(v, j))));
  const isProj = y === CY;
  const med = (() => { const t = years.filter(v => v !== CY).map(v => sum(JK.map(j => yrPaid(v, j)))).sort((a, b) => a - b); return t[Math.floor(t.length / 2)] || 0; })();
  const outl = years.filter(v => v !== CY && med && sum(JK.map(j => yrPaid(v, j))) > 4 * med);
  const tot = j => isProj ? P.j[j].proj : yrPaid(y, j) - yrRef(y, j);
  const inc = (isProj ? P.total : D4.years[y]?.inc) || 1;
  const bank = bankTaxTx(), unmatched = bank.filter(b => !b.m);
  const nextQ = QDUE(CY).find(q => q.d > TODAY) || QDUE(CY + 1).find(q => q.d > TODAY) || QDUE(CY + 1)[3];
  const catchUp = j => { const p = P.j[j]; return Math.max(0, p.req - p.paid); };
  pg.innerHTML = `<div class="toolbar wrap"><div class="seg" id="tySeg">${years.map(v => `<button data-y="${v}" class="${v === y ? 'on' : ''}">${v}${v === CY ? ' · projected' : ''}</button>`).join('')}</div>
    <button class="btn" style="margin-left:auto" onclick="openTaxEntry({type:'Refund'})">${icon('plus')}<span>Record refund</span></button><button class="btn primary" onclick="openTaxEntry()">${icon('plus')}<span>Record payment</span></button></div>
  <div class="grid g-12">
    <div class="card c-3 kpi"><div class="label">${isProj ? 'Projected tax · ' + CY : 'Total paid · ' + y}</div><div class="val num">${short(sum(JK.map(tot)))}</div><div class="delta">${(sum(JK.map(tot)) / inc * 100).toFixed(1)}% of ${short(inc)} est. income${isProj ? '' : sum(JK.map(j => yrRef(y, j))) ? ` · ${money(sum(JK.map(j => yrRef(y, j))), 2)} refunded` : ''}</div></div>
    ${JK.map(j => `<div class="card c-3 kpi"><div class="label"><i class="sw" style="background:${JUR[j].c};width:10px;height:10px"></i>${JUR[j].n}</div><div class="val num">${short(tot(j))}</div><div class="delta">${isProj ? `paid ${short(P.j[j].paid)} of ${short(P.j[j].req)} safe harbor` : `${(tot(j) / inc * 100).toFixed(1)}% effective${yrRef(y, j) ? ' · refund ' + money(yrRef(y, j), 2) : ''}`}</div></div>`).join('')}

    ${isProj ? `<div class="card c-12"><div class="card-h"><div><h3>${CY} estimated payments</h3><div class="sub">Quarterly installments needed to stay inside each safe harbor · as of ${fmtD(TODAY)}</div></div><div class="right"><span class="chip">Next due ${fmtD(nextQ.d)}</span></div></div>
      <div class="scroll-x"><table class="table qgrid"><tr><th></th>${QDUE(CY).map(q => `<th>${q.q}<div class="muted" style="font-weight:500;text-transform:none;letter-spacing:0">${fmtD(q.d).replace(/, \d{4}/, '') + (q.d.startsWith(String(CY + 1)) ? ' ’' + String(CY + 1).slice(2) : '')}</div></th>`).join('')}<th>Required</th><th>Paid</th><th>Still to pay</th></tr>
      ${JK.map(j => { const p = P.j[j]; return `<tr><td><span class="tw"><i class="sw" style="background:${JUR[j].c}"></i><b>${JUR[j].n}</b></span><div class="muted" style="font-size:11px">${p.method === 'prior' ? (j === 'FED' && TX.highAGI ? '110%' : '100%') + ' of ' + PY : Math.round(JUR[j].cur * 100) + '% of ' + CY}</div></td>
        ${p.qs.map(q => `<td><div class="qc ${q.st}"><b class="num">${short(q.inst)}</b><span>${q.st === 'ok' ? '✓ Covered' : q.st === 'short' ? 'Short ' + short(q.due - q.paidBy) : 'Upcoming'}</span></div></td>`).join('')}
        <td class="num">${money(p.req)}</td><td class="num">${money(p.paid)}</td><td class="num"><b class="${p.remaining > 0 ? 'neg' : 'pos'}">${money(p.remaining)}</b></td></tr>`; }).join('')}</table></div>
      ${JK.some(j => P.j[j].qs.some(q => q.st === 'short')) ? `<div class="banner" style="margin:14px 0 0">${icon('warn')}<span>${sum(JK.map(j => yrPaid(CY, j) + TX.credit[j])) ? `<b>Some ${CY} quarters are short.</b>` : `<b>No ${CY} estimated payments are recorded</b> and some due dates have passed. If your ${PY} overpayment was applied to ${CY}, enter it as a credit below. Otherwise,`} paying ${money(sum(JK.map(catchUp)))} by ${fmtD(nextQ.d)} brings each jurisdiction up to its safe harbor. Penalties on the missed quarters may still apply.</span></div>` : ''}
      <div class="tax-note muted">Rules: ${JK.map(j => `<b>${JUR[j].n}</b> — ${JUR[j].rule}`).join(' · ')}. A planning estimate, not tax advice; confirm amounts with your CPA.</div></div>

    <div class="card c-7"><div class="card-h"><div><h3>Projection from your budget</h3><div class="sub">Jan–${MON[ASOF.m - 1]} actuals, then budgeted paychecks, your minerals forecast, and dividends at their ${CY} pace</div></div></div>
      <div class="scroll-x"><table class="table cmp"><tr><th>Income</th><th>Jan–${MON[ASOF.m - 1]} actual</th><th>${ASOF.m < 12 ? MON[ASOF.m] + '–Dec projected' : 'Projected'}</th><th>${CY} total</th></tr>
      ${[['W-2 take-home', 'w2'], ['K-1 / minerals (gross)', 'k1'], ['Dividends & interest', 'div']].map(([l, k]) => `<tr><td>${l}</td><td>${money(sum(P.inc.filter(r => r.actual).map(r => r[k])))}</td><td class="muted">${money(sum(P.inc.filter(r => !r.actual).map(r => r[k])))}</td><td><b>${money(sum(P.inc.map(r => r[k])))}</b></td></tr>`).join('')}
      <tr class="tot"><td>Estimated income</td><td></td><td></td><td>${money(P.total)}</td></tr></table></div>
      <div class="rate-grid">${JK.map(j => `<div class="mini"><div class="l">${JUR[j].n} effective rate</div><div style="display:flex;align-items:center;gap:6px;margin-top:6px"><input class="in num rate-in" data-r="${j}" value="${(TX.rates[j] * 100).toFixed(2)}"><span class="muted">%</span></div><div class="ds" style="font-size:11.5px;color:var(--text-3);margin-top:6px">→ ${money(P.j[j].proj)} tax</div></div>`).join('')}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px"><span class="muted" style="font-size:12px">Rates from:</span>${RATE_LABELS.map(([k, l]) => `<button class="chip ${TX.preset === k ? 'pos' : ''}" data-pre="${k}">${l}</button>`).join('')}</div></div>
    <div class="card c-5"><div class="card-h"><div><h3>Safe-harbor inputs</h3><div class="sub">From your ${PY} returns · edit when filed</div></div></div>
      <div class="form">${JK.map(j => `<div><label>${JUR[j].n} ${PY} tax</label><div class="amt-in"><span>$</span><input class="in num" data-prior="${j}" value="${Math.round(TX.prior[j]).toLocaleString()}"></div></div><div><label>Overpayment applied to ${CY}</label><div class="amt-in"><span>$</span><input class="in num" data-cred="${j}" value="${TX.credit[j] ? Math.round(TX.credit[j]).toLocaleString() : ''}" placeholder="0"></div></div>`).join('')}</div>
      <label class="tgl" style="margin-top:12px"><input type="checkbox" id="hiAGI" ${TX.highAGI ? 'checked' : ''}> ${PY} AGI over $150k (federal 110% rule)</label>
      <p class="muted" style="font-size:11.5px;margin-top:10px">${PY} tax defaults to what you paid, net of refunds. If you overpaid, enter the actual liability from the return.</p>
      <div class="budget-link"><div><b>Budget plan</b><div class="muted" style="font-size:12px">${CY} budget has ${money(-sum(ST.budget[CY]?.Tax || []))} of tax payments.</div></div>${CTX.CAN_WRITE ? `<button class="btn" id="txBud">Plan Jan ’${String(CY + 1).slice(2)} catch-up + Apr ’${String(CY + 1).slice(2)} balance</button>` : ''}</div></div>` : ''}

    <div class="card c-${isProj ? 12 : 8}"><div class="card-h"><div><h3>Payments by tax year</h3><div class="sub">${isProj ? 'Faded bar = ' + CY + ' projected liability' : 'Paid, net of refunds'}</div></div><div class="right">${outl.length ? `<label class="tgl"><input type="checkbox" id="inc23" ${TX.inc23 ? 'checked' : ''}> Include ${outl.join(', ')} (outlier)</label>` : ''}</div></div>
      <div class="chart" id="txChart"></div><div class="legend">${JK.map(j => `<span><i class="sw" style="background:${JUR[j].c}"></i>${JUR[j].n}</span>`).join('')}</div></div>
    ${!isProj ? `<div class="card c-4"><div class="card-h"><div><h3>${y} by jurisdiction</h3><div class="sub">Effective rate on estimated income</div></div></div>${JK.map(j => `<div class="ex-row"><span><i class="sw" style="background:${JUR[j].c}"></i> ${JUR[j].n}</span><b>${money(tot(j))} · ${(tot(j) / inc * 100).toFixed(2)}%</b></div>`).join('')}<div class="ex-row big"><span>Total</span><b>${money(sum(JK.map(tot)))}</b></div><div class="ex-row"><span>Tax prep fees</span><b>${money(sum(D4.fees.filter(f => +String(f.d).slice(0, 4) === y + 1).map(f => f.amt)))}</b></div></div>` : ''}

    <div class="card c-8"><div class="card-h"><div><h3>Payment & refund ledger</h3><div class="sub">Every payment by tax year · matched to bank transactions where possible</div></div>
      <div class="right"><div class="seg" id="jfSeg">${[['all', 'All'], ...JK.map(j => [j, JUR[j].n]), ['ref', 'Refunds']].map(([k, l]) => `<button data-k="${k}" class="${TX.jf === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
      <div class="scroll-x"><table class="table ledger"><tr><th>Date</th><th>Tax yr</th><th>Jurisdiction</th><th>Type</th><th class="hide-sm">Method</th><th class="hide-sm">Conf.</th><th>Amount</th><th class="hide-sm">Bank</th></tr>
      ${TX.ledger.filter(l => TX.jf === 'all' || (TX.jf === 'ref' ? l.type === 'Refund' : l.j === TX.jf)).sort((a, b) => b.d.localeCompare(a.d)).map(l => { const b = bank.find(x => x.m === l);
        return `<tr class="${l.type === 'Overpayment note' ? 'muted-row' : ''}"><td class="nowrap">${fmtD(l.d)}</td><td>${l.ty}</td><td><span class="tw"><i class="sw" style="background:${JUR[l.j].c}"></i>${JUR[l.j].n}</span></td><td>${l.type === 'Estimate' ? `${l.q || ''} estimate` : esc(l.type)}${l.note && l.type !== 'Estimate' ? `<div class="muted" style="font-size:11px">${esc(l.note)}</div>` : ''}</td><td class="hide-sm muted">${esc(l.method || '—')}</td><td class="hide-sm muted">${esc(l.conf || '—')}</td><td class="num ${l.amt < 0 ? 'pos' : ''}"><b>${l.type === 'Overpayment note' ? '—' : l.amt < 0 ? '+' + money(-l.amt, 2) : money(l.amt)}</b></td><td class="hide-sm">${b ? `<span class="chip pos">${icon('check')} Matched</span>` : l.src === 'Bank' ? '<span class="chip">From bank</span>' : ''}</td></tr>`; }).join('')}</table></div></div>
    <div class="c-4" style="display:flex;flex-direction:column;gap:18px;min-width:0">
      <div class="card"><div class="card-h"><div><h3>Upcoming deadlines</h3><div class="sub">Calendar-year filer</div></div></div>
        <div class="tl">${[...QDUE(CY).map(q => ({d: q.d, n: `${q.q} ${CY} estimates`, a: null})), {d: `${CY + 1}-04-15`, n: `File ${CY} returns · pay balance · Q1 ${CY + 1} estimates`, a: sum(JK.map(j => P.j[j].balance)), s: 'Projected balance above safe harbor'}, {d: `${CY + 1}-06-15`, n: `Q2 ${CY + 1} estimates`, a: null}, {d: `${CY + 1}-09-15`, n: `Q3 ${CY + 1} estimates`, a: null}].filter(e => e.d >= TODAY).map((e, i) => i === 0 && !e.a ? {...e, a: sum(JK.map(catchUp)), s: 'Catch-up to safe harbor'} : e).slice(0, 4).map(e => `<div class="ev"><div class="when">${fmtD(e.d)}</div><div class="row"><div><div class="nm" style="font-weight:600">${e.n}</div>${e.s ? `<div class="muted" style="font-size:12px">${e.s}</div>` : ''}</div><div class="amt num">${e.a ? money(e.a) : ''}</div></div></div>`).join('')}</div></div>
      <div class="card"><div class="card-h"><div><h3>From your bank</h3><div class="sub">Tax-tagged transactions not yet in the ledger</div></div></div>
        ${unmatched.length ? `<div class="list">${unmatched.map(b => `<div class="li"><div style="min-width:0"><div class="nm ell" style="font-size:13px">${esc(cleanDesc(b.t.desc))}</div><div class="ds">${fmtDate(b.t.d)}, ${b.t.d.slice(0, 4)} · ${JUR[b.j].n}</div></div><div class="amt num">${money(b.t.amt, 2)}</div><button class="btn" style="height:30px;margin-left:8px" data-addbank="${b.t.id}">Add</button></div>`).join('')}</div>` : '<p class="muted" style="font-size:12.5px">Everything tagged Tax is in the ledger.</p>'}</div>
    </div>
  </div>`;
  $$('#tySeg button').forEach(b => b.onclick = () => { TX.year = +b.dataset.y; render(); });
  $$('#jfSeg button').forEach(b => b.onclick = () => { TX.jf = b.dataset.k; render(); });
  if ($('#inc23')) $('#inc23').onchange = e => { TX.inc23 = e.target.checked; render(); };
  const num = v => +String(v).replace(/[$,%\s]/g, '') || 0;
  $$('[data-r]').forEach(i => i.onchange = () => { TX.rates[i.dataset.r] = num(i.value) / 100; TX.preset = 'custom'; render(); });
  $$('[data-pre]').forEach(b => b.onclick = () => { TX.preset = b.dataset.pre; TX.rates = RATE_PRESETS[b.dataset.pre](); render(); });
  $$('[data-prior]').forEach(i => i.onchange = () => { TX.prior[i.dataset.prior] = num(i.value); render(); });
  $$('[data-cred]').forEach(i => i.onchange = () => { TX.credit[i.dataset.cred] = num(i.value); render(); });
  if ($('#hiAGI')) $('#hiAGI').onchange = e => { TX.highAGI = e.target.checked; render(); };
  if ($('#txBud')) $('#txBud').onclick = () => { const NY = CY + 1; if (!ST.budget[NY]) createBudget(NY, 'copy'); const t = (ST.budget[NY].Tax ||= Array(12).fill(0)), was = t.slice(); t[0] = -Math.round(sum(JK.map(catchUp))); t[3] = -Math.round(sum(JK.map(j => P.j[j].balance))); render(); toast(`${NY} budget: Tax ${money(t[0])} in Jan, ${money(t[3])} in Apr`, () => { ST.budget[NY].Tax = was; render(); }); };
  $$('[data-addbank]').forEach(b => b.onclick = () => { const x = bank.find(z => z.t.id === b.dataset.addbank); openTaxEntry({d: x.t.d, j: x.j, amt: Math.abs(x.t.amt), type: x.t.amt > 0 ? 'Refund' : 'Estimate', ty: +x.t.d.slice(0, 4) - (x.t.d.slice(5, 7) <= '04' ? 1 : 0), src: 'Bank'}); });
  CH.push(() => {
    const ys = years.filter(v => TX.inc23 || !outl.includes(v));
    barChart($('#txChart'), {labels: ys.map(v => v === CY ? CY + ' proj.' : String(v)), series: JK.map(j => ({name: JUR[j].n, color: JUR[j].c, values: ys.map(v => v === CY ? P.j[j].proj : yrPaid(v, j) - yrRef(v, j)), hatchFn: i => ys[i] === CY})), height: 240, xGap: 60,
      tipExtra: i => ys[i] === CY ? tipRow(null, 'Paid so far', money(sum(JK.map(j => P.j[j].paid)))) : tipRow(null, 'Est. income', short(D4.years[ys[i]]?.inc || 0))});
  });
}
function openTaxEntry(pre = {}) {
  const m = $('#modal'); m.classList.remove('wide');
  const isRef = pre.type === 'Refund';
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">${isRef ? 'Record refund' : 'Record tax payment'}</h2><p class="muted" style="font-size:12.5px">${pre.src === 'Bank' ? 'Prefilled from your bank transaction' : 'Estimated payment, extension, balance due or refund'}</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="form">
    <div><label>Jurisdiction</label><select class="in" id="teJ">${JK.map(j => `<option value="${j}" ${pre.j === j ? 'selected' : ''}>${JUR[j].n}</option>`).join('')}</select></div>
    <div><label>Tax year</label><select class="in" id="teY">${[CY + 1, CY, CY - 1, CY - 2, CY - 3].map(v => `<option ${v === (pre.ty || CY) ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div><label>Type</label><select class="in" id="teT">${['Q1 estimate', 'Q2 estimate', 'Q3 estimate', 'Q4 estimate', 'Extension payment', 'Balance due', 'Refund'].map(t => `<option ${(isRef && t === 'Refund') || (!isRef && pre.type === 'Estimate' && t === 'Q4 estimate') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label>Date</label><input class="in" type="date" id="teD" value="${pre.d || TODAY}"></div>
    <div><label>Amount</label><div class="amt-in"><span>$</span><input class="in num" id="teA" value="${pre.amt ? pre.amt.toLocaleString('en-US', {minimumFractionDigits: 2}) : ''}"></div></div>
    <div><label>Method</label><select class="in" id="teM">${['Direct Pay', 'EFTPS', 'E-File', 'OkTAP', 'NM TAP', 'Check', 'Card', 'Direct deposit'].map(t => `<option>${t}</option>`).join('')}</select></div>
    <div style="grid-column:1/-1"><label>Confirmation # <span class="muted">(only the last 4 digits are kept)</span></label><input class="in" id="teC" placeholder="Optional"></div>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="teGo">Save</button></div>`;
  openLayer('modal');
  $('#teGo').onclick = () => { const a = +$('#teA').value.replace(/[$,]/g, ''); if (!a) return $('#teA').focus(); const t = $('#teT').value, ref = t === 'Refund', jj = $('#teJ').value;
    TX.ledger.push({id: 'tl' + Date.now(), d: $('#teD').value, ty: +$('#teY').value, j: $('#teJ').value, status: 'Actual', type: ref ? 'Refund' : /estimate/.test(t) ? 'Estimate' : t, q: /estimate/.test(t) ? t.slice(0, 2) : '', method: $('#teM').value, amt: ref ? -a : a, conf: $('#teC').value ? '••' + $('#teC').value.replace(/\s/g, '').slice(-4) : '', note: '', src: pre.src || 'Manual'});
    closeAll(); render(); toast(`${ref ? 'Refund' : 'Payment'} recorded · ${JUR[jj].n} ${money(a, 2)}`); };
}
