/* =====================================================================
   Summary — a plain-language, high-level view of the household finances:
   last full month vs. budget, the year so far vs. prior years, what changed,
   easy places to cut, net worth & savings, and the kids' college funds.
   Read-only; works for every role.
   ===================================================================== */
const SUMM = {m: null};
const lastFullMonth = () => { const prev = ymPlus(ym(CTX.TODAY), -1); return CTX.ASOF_YM < prev ? CTX.ASOF_YM : prev; };
const sKind = c => { const g = catOf(c)?.group; return g === 'Income' ? 'in' : g === 'Fixed Expense' || g === 'Variable Expense' ? 'out' : null; };
// month → category → amount for all history; months in the loaded window come from the live transactions (so edits show)
function summMonthly() {
  const since = CTX.SINCE.slice(0, 7), out = {};
  for (const m in DATA.monthly || {}) if (m < since) out[m] = {...DATA.monthly[m]};
  ST.tx.forEach(t => { const m = t.d.slice(0, 7); if (m < since) return; const o = (out[m] ||= {});
    pieces(t).forEach(p => { const c = p.cat || 'Uncategorized'; o[c] = (o[c] || 0) + p.amt; }); });
  return out;
}
function summTot(MM, months) {   // income / spending totals and spending by category over a set of months
  const r = {inc: 0, out: 0, cat: {}};
  months.forEach(m => { for (const [c, v] of Object.entries(MM[m] || {})) { if (ST.excl.has(c)) continue; const k = sKind(c); if (!k) continue;
    if (k === 'in') r.inc += v; else { r.out += -v; r.cat[c] = (r.cat[c] || 0) - v; } } });
  return r;
}
const yRange = (y, m0, m1) => ymRange(`${y}-${String(m0).padStart(2, '0')}`, `${y}-${String(m1).padStart(2, '0')}`);
const ab = v => (v < 0 ? '−' : '') + short(Math.abs(v));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function renderSummary(pg) {
  const M0 = lastFullMonth(); if (!SUMM.m || SUMM.m > M0) SUMM.m = M0;
  const M = SUMM.m, y = +M.slice(0, 4), mo = +M.slice(5, 7), monName = MON[mo - 1], MM = summMonthly();
  const firstYear = Math.min(...Object.keys(MM).map(k => +k.slice(0, 4)));

  // ---------- the month vs. budget ----------
  const T = summTot(MM, [M]);
  const bud = {}; ST.cats.forEach(c => { if (sKind(c.name) === 'out' && !ST.excl.has(c.name)) bud[c.name] = -budgetFor(y, c.name, mo, mo); });
  const budOut = sum(Object.values(bud)), budIn = sum(ST.cats.filter(c => sKind(c.name) === 'in' && !ST.excl.has(c.name)).map(c => budgetFor(y, c.name, mo, mo)));
  const saved = T.inc - T.out, rate = T.inc > 0 ? saved / T.inc : 0;
  const rows = [...new Set(Object.keys(T.cat).concat(Object.keys(bud).filter(c => bud[c] > 0)))].map(c => ({c, a: T.cat[c] || 0, b: bud[c] || 0}))
    .filter(r => r.a > 0.5 || r.b > 0.5).sort((p, q) => Math.max(q.a, q.b) - Math.max(p.a, p.b));
  const over = rows.filter(r => r.a > r.b + 25 && r.a > r.b * 1.05).sort((p, q) => (q.a - q.b) - (p.a - p.b));
  const topRows = rows.slice(0, 9), rest = rows.slice(9), restA = sum(rest.map(r => r.a)), restB = sum(rest.map(r => r.b));
  const barMax = Math.max(1, ...topRows.map(r => Math.max(r.a, r.b)), restA, restB);

  // ---------- year so far, and the same months in earlier years ----------
  const ytdM = yRange(y, 1, mo), YT = summTot(MM, ytdM), ytdBud = sum(ST.cats.filter(c => sKind(c.name) === 'out' && !ST.excl.has(c.name)).map(c => -budgetFor(y, c.name, 1, mo)));
  const years = []; for (let k = Math.max(firstYear, y - 4); k <= y; k++) years.push(k);
  const same = years.map(k => summTot(MM, yRange(k, 1, mo))), full = years.map((k, i) => k === y ? same[i].out * 12 / mo : summTot(MM, yRange(k, 1, 12)).out);
  const LY = same[years.indexOf(y - 1)] || null;
  const changes = LY ? [...new Set(Object.keys(YT.cat).concat(Object.keys(LY.cat)))].map(c => ({c, now: YT.cat[c] || 0, was: LY.cat[c] || 0})).map(r => ({...r, d: r.now - r.was}))
    .filter(r => Math.abs(r.d) >= 200) : [];
  const ups = changes.filter(r => r.d > 0).sort((p, q) => q.d - p.d).slice(0, 4), downs = changes.filter(r => r.d < 0).sort((p, q) => p.d - q.d).slice(0, 3);

  // ---------- easy places to cut ----------
  const ideas = summIdeas(MM, M, y, mo, years, same);

  // ---------- net worth & savings ----------
  const j = Math.max(0, BS.months.indexOf(M) >= 0 ? BS.months.indexOf(M) : L), at = (k, i) => (BS[k]?.[i] || 0);
  const nw = BS.netWorth[j], nwPrev = BS.netWorth[j - 1] ?? nw, jDec = BS.months.indexOf(`${y - 1}-12`), jYr = Math.max(0, j - 12);
  const parts = [['Cash', at('cash', j), 'Checking & savings'], ['Investments', at('brokerage', j) + at('hsa', j), 'Brokerage & HSA'], ['Retirement', at('retirement', j), '401(k)s & IRAs'],
    ['College', at('college', j), "Kids' 529s"], ['Home & cars', at('assets', j), 'Value minus what we owe on them'], ['Other debts', -(at('liabAccts', j) + at('unsecured', j)), 'Cards & other loans']].filter(p => Math.abs(p[1]) >= 1);
  const last12 = ymRange(ymPlus(M, -11), M), savedSeries = last12.map(m => { const t = summTot(MM, [m]); return t.inc - t.out; }), saved12 = sum(savedSeries), inc12 = sum(last12.map(m => summTot(MM, [m]).inc));

  // ---------- kids ----------
  const kids = DATA.kids.map(k => { const y18 = collegeYear(k), bal = BS[k.key]?.[L] || 0; return {...k, y18, bal, yrsLeft: Math.max(0, ymDiffN(ym(CTX.TODAY), `${y18}-08`) / 12)}; });
  kids.forEach(k => k.cp = colProject(k));

  // ---------- the plain-language headline ----------
  const say = [];
  say.push(budOut > 0 ? `We spent <b>${money(T.out)}</b> in ${monName} — <b class="${T.out <= budOut ? 'pos' : 'neg'}">${money(Math.abs(budOut - T.out))} ${T.out <= budOut ? 'under' : 'over'}</b> the ${money(budOut)} budget.` : `We spent <b>${money(T.out)}</b> in ${monName}.`);
  say.push(`We brought in <b>${money(T.inc)}</b>${saved >= 0 ? ` and kept <b class="pos">${money(saved)}</b> (${Math.round(rate * 100)}% of income).` : `, so we spent <b class="neg">${money(-saved)}</b> more than came in.`}`);
  if (over.length) say.push(`Biggest overage: <b>${esc(over[0].c)}</b>, ${money(over[0].a - over[0].b)} over its ${money(over[0].b)} budget${over.length > 1 ? ` (${over.length - 1} other ${over.length - 1 === 1 ? 'category' : 'categories'} also went over)` : ''}.`);
  if (LY) { const d = YT.out - LY.out; say.push(`So far this year we’ve spent <b>${short(YT.out)}</b>, ${Math.abs(d) < 0.01 * LY.out ? 'about the same as' : `<b class="${d <= 0 ? 'pos' : 'neg'}">${short(Math.abs(d))} ${d > 0 ? 'more' : 'less'}</b> than`} the same months last year.`); }
  say.push(`Net worth is <b>${short(nw)}</b>, ${nw - nwPrev >= 0 ? 'up' : 'down'} ${short(Math.abs(nw - nwPrev))} from the month before${jDec >= 0 ? ` and ${nw - BS.netWorth[jDec] >= 0 ? 'up' : 'down'} ${short(Math.abs(nw - BS.netWorth[jDec]))} since January` : ''}.`);
  const flag = dataChecks().list.filter(c => c.sev === 'bad' && (c.swing || c.id.startsWith('rollup') || c.id.startsWith('bank')) && c.m <= M && c.m >= ymPlus(M, -1));
  if (flag.length) say.push(`<span class="neg">Heads up:</span> some ${mLabel(flag[0].m)} balances look incomplete or don’t match the bank, so net worth may be off until they’re fixed.`);
  const rh = typeof retireHeadline === 'function' ? retireHeadline() : null;
  if (rh) say.push(`Retirement plan: <b class="${rh.ok ? 'pos' : 'neg'}">${Math.round(rh.prob * 100)}% chance</b> we can retire at ${rh.age} spending ${short(rh.spend)} a year (today’s dollars).`);
  if (ideas.total > 0) say.push(`There’s about <b>${short(ideas.total)} a year</b> in easy savings ideas below.`);

  const pctBar = (a, b) => { const w = a / barMax * 100, bw = b / barMax * 100, overB = b > 0 && a > b;
    return `<div class="sb-bar"><i class="${overB ? 'over' : ''}" style="width:${Math.min(100, w)}%"></i>${b > 0 ? `<em style="left:${Math.min(100, bw)}%" title="Budget ${money(b)}"></em>` : ''}</div>`; };
  const bRow = (name, a, b) => { const d = b - a, st = b <= 0 ? '<span class="muted">no budget</span>' : d >= 0 ? `<span class="pos">${money(d)} left</span>` : `<span class="neg">${money(-d)} over</span>`;
    return `<div class="sb-row"><div class="sb-n">${esc(name)}</div>${pctBar(a, b)}<div class="sb-v num">${money(a)}<span class="muted"> of ${b > 0 ? money(b) : '—'}</span></div><div class="sb-s">${st}</div></div>`; };
  const chg = r => `<div class="sum-chg"><span>${esc(r.c)}</span><b class="num ${r.d > 0 ? 'neg' : 'pos'}">${r.d > 0 ? '+' : '−'}${short(Math.abs(r.d))}</b><span class="muted num">${short(r.now)} vs ${short(r.was)}${r.was ? ` · ${pct(r.d / r.was, 0)}` : ''}</span></div>`;

  pg.innerHTML = `<div class="toolbar wrap"><div class="stepper"><button id="smPrev" ${M > ymPlus(M0, -24) ? '' : 'disabled'}>${icon('chev')}</button><b>${mLabel(M)}</b><button id="smNext" ${M < M0 ? '' : 'disabled'}>${icon('chev')}</button></div>
    <span class="muted" style="font-size:12.5px">${M === M0 ? 'The last full month' : `${ymDiffN(M, M0)} month${ymDiffN(M, M0) > 1 ? 's' : ''} before the last full month`}${ST.excl.size ? ` · leaves out ${esc([...ST.excl].join(', '))}` : ''}</span>
    <button class="btn" id="smPrint" style="margin-left:auto">${icon('file')}<span>Print</span></button></div>
  <div class="grid g-12">
    <div class="card c-12 sum-head"><div class="card-h"><div><h3>${monName} ${y} at a glance</h3><div class="sub">The short version</div></div></div>
      <ul class="sum-say">${say.map(s => `<li>${s}</li>`).join('')}</ul>
      <div class="stat-row" style="grid-template-columns:repeat(4,1fr);margin-top:14px">
        <div class="mini"><div class="l">Spent in ${monName}</div><div class="v num">${short(T.out)}</div><div class="ds">${budOut > 0 ? `${T.out <= budOut ? '<span class="pos">' + short(budOut - T.out) + ' under</span>' : '<span class="neg">' + short(T.out - budOut) + ' over</span>'} budget` : '&nbsp;'}</div></div>
        <div class="mini"><div class="l">Came in</div><div class="v num">${short(T.inc)}</div><div class="ds">${budIn > 0 ? `${short(budIn)} expected` : '&nbsp;'}</div></div>
        <div class="mini"><div class="l">Kept (saved)</div><div class="v num ${saved >= 0 ? 'pos' : 'neg'}">${ab(saved)}</div><div class="ds">${T.inc > 0 ? Math.round(rate * 100) + '% of income' : '&nbsp;'}</div></div>
        <div class="mini"><div class="l">Net worth</div><div class="v num">${short(nw)}</div><div class="ds">${chip(nwPrev ? (nw - nwPrev) / Math.abs(nwPrev) : 0)} vs ${MON[(mo + 10) % 12]}</div></div></div></div>

    <div class="card c-7"><div class="card-h"><div><h3>${monName} spending vs. budget</h3><div class="sub">The bar is what we spent; the tick is the budget</div></div></div>
      <div class="sb-list">${topRows.map(r => bRow(r.c, r.a, r.b)).join('')}${rest.length ? bRow(`Everything else (${rest.length})`, restA, restB) : ''}</div>
      <div class="sb-row sb-tot"><div class="sb-n">Total</div><div></div><div class="sb-v num">${money(T.out)}<span class="muted"> of ${money(budOut)}</span></div><div class="sb-s">${budOut - T.out >= 0 ? `<span class="pos">${money(budOut - T.out)} left</span>` : `<span class="neg">${money(T.out - budOut)} over</span>`}</div></div></div>

    <div class="card c-5"><div class="card-h"><div><h3>The year so far</h3><div class="sub">January – ${monName} ${y}</div></div></div>
      <div class="sum-kv"><span>Spent</span><b class="num">${money(YT.out)}</b></div>
      <div class="sum-kv"><span>Budget for these months</span><b class="num">${money(ytdBud)}</b></div>
      <div class="sum-kv"><span>${YT.out <= ytdBud ? 'Under budget by' : 'Over budget by'}</span><b class="num ${YT.out <= ytdBud ? 'pos' : 'neg'}">${money(Math.abs(ytdBud - YT.out))}</b></div>
      <div class="sum-kv"><span>Came in</span><b class="num">${money(YT.inc)}</b></div>
      <div class="sum-kv"><span>Kept (saved)</span><b class="num ${YT.inc - YT.out >= 0 ? 'pos' : 'neg'}">${ab(YT.inc - YT.out)}${YT.inc > 0 ? ` <span class="muted">· ${Math.round((YT.inc - YT.out) / YT.inc * 100)}%</span>` : ''}</b></div>
      <div class="sum-kv"><span>At this pace, the year’s spending</span><b class="num">${short(YT.out * 12 / mo)}</b></div></div>

    <div class="card c-7"><div class="card-h"><div><h3>Spending compared with past years</h3><div class="sub">January – ${monName} each year, next to that year’s full total${mo < 12 ? ` · ${y} full year is a projection at this year’s pace` : ''}</div></div></div>
      <div class="chart" id="smYears"></div><div class="legend"><span><i class="sw" style="background:var(--s1)"></i>Jan – ${monName}</span><span><i class="sw" style="background:var(--s2)"></i>Full year</span></div></div>
    <div class="card c-5"><div class="card-h"><div><h3>What’s changed</h3><div class="sub">Jan – ${monName} ${y} vs. the same months in ${y - 1}</div></div></div>
      ${LY ? `${ups.length ? `<div class="sum-sec">Spending more on</div>${ups.map(chg).join('')}` : ''}${downs.length ? `<div class="sum-sec">Spending less on</div>${downs.map(chg).join('')}` : ''}
        ${!ups.length && !downs.length ? '<p class="muted">No category moved by more than $200.</p>' : ''}
        <div class="sum-kv" style="margin-top:10px"><span>Income</span><b class="num ${YT.inc >= LY.inc ? 'pos' : 'neg'}">${YT.inc >= LY.inc ? '+' : '−'}${short(Math.abs(YT.inc - LY.inc))} <span class="muted">vs last year</span></b></div>`
      : '<p class="muted">Not enough history for last year yet.</p>'}</div>

    <div class="card c-12"><div class="card-h"><div><h3>Easy places to cut</h3><div class="sub">Ideas from our own spending · ${ideas.total > 0 ? `about <b>${short(ideas.total)}/yr</b> if we act on all of them` : 'nothing stands out right now'}</div></div></div>
      <div class="cut-grid">${ideas.groups.map(g => `<div class="cut"><h4>${g.t}</h4><p class="muted">${g.d}</p>${g.items.map(it => `<div class="cut-i"><span>${esc(it.n)}${it.s ? `<small class="muted">${esc(it.s)}</small>` : ''}</span><b class="num">${it.v}</b></div>`).join('')}<div class="cut-t"><span>Could save</span><b class="num pos">~${short(g.save)}/yr</b></div></div>`).join('') || '<p class="muted">No easy cuts found — spending looks in line with usual.</p>'}</div></div>

    <div class="card c-7"><div class="card-h"><div><h3>Net worth</h3><div class="sub">What we own minus what we owe · last 2 years</div></div></div>
      <div class="chart" id="smNw"></div>
      <div class="stat-row" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
        <div class="mini"><div class="l">Since last month</div><div class="v num ${nw - nwPrev >= 0 ? 'pos' : 'neg'}">${nw - nwPrev >= 0 ? '+' : '−'}${short(Math.abs(nw - nwPrev))}</div></div>
        <div class="mini"><div class="l">Since January</div><div class="v num ${jDec < 0 || nw - BS.netWorth[jDec] >= 0 ? 'pos' : 'neg'}">${jDec >= 0 ? (nw - BS.netWorth[jDec] >= 0 ? '+' : '−') + short(Math.abs(nw - BS.netWorth[jDec])) : '—'}</div></div>
        <div class="mini"><div class="l">Past 12 months</div><div class="v num ${nw - BS.netWorth[jYr] >= 0 ? 'pos' : 'neg'}">${nw - BS.netWorth[jYr] >= 0 ? '+' : '−'}${short(Math.abs(nw - BS.netWorth[jYr]))}</div></div></div></div>
    <div class="card c-5"><div class="card-h"><div><h3>Where it is</h3><div class="sub">${mLabel(BS.months[j])}</div></div></div>
      ${parts.map(([n, v, d]) => `<div class="sum-kv"><span>${n}<small class="muted">${d}</small></span><b class="num ${v < 0 ? 'neg' : ''}">${ab(v)}</b></div>`).join('')}
      <div class="sum-kv tot"><span>Net worth</span><b class="num">${short(nw)}</b></div></div>

    <div class="card c-7"><div class="card-h"><div><h3>What we kept each month</h3><div class="sub">Money in minus money out · last 12 months</div></div></div>
      <div class="chart" id="smSave"></div></div>
    <div class="card c-5"><div class="card-h"><div><h3>Savings</h3><div class="sub">${mLabel(last12[0])} – ${mLabel(M)}</div></div></div>
      <div class="sum-big num ${saved12 >= 0 ? 'pos' : 'neg'}">${ab(saved12)}</div><p class="muted" style="margin:-4px 0 12px">kept over the last 12 months${inc12 > 0 ? ` — <b>${Math.round(saved12 / inc12 * 100)}%</b> of what came in` : ''}</p>
      <div class="sum-kv"><span>Average per month</span><b class="num">${ab(saved12 / 12)}</b></div>
      <div class="sum-kv"><span>Best month</span><b class="num">${mLabel(last12[savedSeries.indexOf(Math.max(...savedSeries))])} · ${ab(Math.max(...savedSeries))}</b></div>
      <div class="sum-kv"><span>Toughest month</span><b class="num">${mLabel(last12[savedSeries.indexOf(Math.min(...savedSeries))])} · ${ab(Math.min(...savedSeries))}</b></div>
      <div class="sum-kv"><span>Cash on hand</span><b class="num">${short(at('cash', j))}${T.out > 0 ? ` <span class="muted">· ~${(at('cash', j) / Math.max(1, YT.out / mo)).toFixed(1)} months of spending</span>` : ''}</b></div></div>

    ${kids.length ? `<div class="card c-12"><div class="card-h"><div><h3>Kids’ college</h3><div class="sub">529 savings, growing at ${(COLP().rate * 100).toFixed(1)}%/yr plus ${money(DATA.assume.college529Monthly)}/mo each until they start</div></div></div>
      <div class="kid-grid">${kids.map((k, i) => { const c = k.cp, on = COLP().draws && kidPlan(k).on && c.drawn, ok = !c.extra;
        return `<div class="kid-c"><div class="kid-top"><i class="sw" style="background:${KID_COL[i % 5]}"></i><b>${esc(k.name)}</b><span class="chip ${ok ? 'pos' : ''}">${ok ? 'On track' : 'Needs a boost'}</span></div>
          <div class="sum-kv"><span>Saved today</span><b class="num">${short(k.bal)}</b></div>
          <div class="sum-kv"><span>Starts college</span><b class="num">Aug ${k.y18} · ${k.yrsLeft.toFixed(1)} yrs</b></div>
          <div class="sum-kv"><span>Expected by then</span><b class="num">${short(c.atStart)}</b></div>
          <div class="pbar" style="height:8px;margin:10px 0 6px"><i style="width:${c.covered * 100}%;background:${KID_COL[i % 5]}"></i></div>
          <div class="muted" style="font-size:12px">${on ? `Covers ${Math.round(c.covered * 100)}% of the ${short(c.drawn)} we plan to pull over 4 years` : `${Math.round(c.covered * 100)}% of the ${short(DATA.assume.collegeTarget)} goal`}${ok ? '' : ` · about <b>${money(c.extra)}/mo</b> more would close the gap`}</div></div>`; }).join('')}</div></div>` : ''}
  </div>`;

  $('#smPrev').onclick = () => { SUMM.m = ymPlus(M, -1); render(); };
  $('#smNext').onclick = () => { SUMM.m = ymPlus(M, 1); render(); };
  $('#smPrint').onclick = () => window.print();
  CH.push(() => barChart($('#smYears'), {labels: years.map(String), series: [{name: `Jan – ${monName}`, values: same.map(s => s.out), color: 'var(--s1)'},
      {name: 'Full year', values: full, color: 'var(--s2)', hatchFn: i => years[i] === y && mo < 12}], height: 230, xGap: 40, tipTitle: l => l,
      tipExtra: i => years[i] === y && mo < 12 ? tipRow(null, 'Full year', 'projected') : ''}),
    () => { const i0 = Math.max(0, j - 24), lab = BS.months.slice(i0, j + 1); lineChart($('#smNw'), {labels: lab, series: [{name: 'Net worth', values: BS.netWorth.slice(i0, j + 1), color: 'var(--s1)', area: true}], height: 220, xGap: 70, xFmt: (lb, i, e) => i % e === 0 ? mShort(lb) : null, tipTitle: mLabel}); },
    () => barChart($('#smSave'), {labels: last12, series: [{name: 'Kept', values: savedSeries, colorFn: v => v >= 0 ? 'var(--pos)' : 'var(--neg)'}], height: 220, xGap: 46, xFmt: mShort, tipTitle: mLabel}));
}

// Savings ideas: subscriptions & repeating charges, categories running above usual, small frequent purchases
function summIdeas(MM, M, y, mo, years, same) {
  const groups = [], last3 = [ymPlus(M, -2), ymPlus(M, -1), M], since = CTX.SINCE.slice(0, 7);
  const isVar = c => catOf(c)?.group === 'Variable Expense' && !ST.excl.has(c);
  // vendor activity in the last 3 full months (loaded transactions only)
  const V = {};
  if (last3[0] >= since) ST.tx.forEach(t => { const m = t.d.slice(0, 7); if (!last3.includes(m) || t.amt >= 0) return; const c = t.splits ? t.splits[0].cat : t.cat; if (!isVar(c)) return;
    const n = vendorName(vendorKey(t.desc)); if (!n) return; const v = (V[n] ||= {n, cat: c, m: {}, k: {}}); v.m[m] = (v.m[m] || 0) - t.amt; v.k[m] = (v.k[m] || 0) + 1; });
  // 1) subscriptions from the cash plan + charges that repeat every month at about the same amount
  const subs = (ST.cash || []).filter(c => c.active !== false && c.kind === 'subscription' && c.amount < 0).map(c => ({n: c.name, mo: -c.amount * ({weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, quarterly: 1 / 3, annual: 1 / 12, once: 0}[c.freq] ?? 1)}));
  const seen = new Set(subs.map(s => s.n.toLowerCase()));
  Object.values(V).forEach(v => { const a = last3.map(m => v.m[m] || 0); if (a.some(x => !x) || last3.some(m => v.k[m] > 2)) return; const mean = sum(a) / 3, sd = Math.sqrt(sum(a.map(x => (x - mean) ** 2)) / 3);
    if (mean > 400 || sd / mean > .15 || seen.has(v.n.toLowerCase()) || /credit|loan|financ|mortgage|insur|tax|tuition|daycare|rent\b/i.test(v.n)) return; subs.push({n: v.n, mo: mean, s: v.cat}); });
  subs.sort((p, q) => q.mo - p.mo);
  if (subs.length) { const tot = sum(subs.map(s => s.mo)); groups.push({t: 'Subscriptions & repeating charges', d: `${plural(subs.length, 'charge')} every month, ${money(tot)}/mo in all. Cancelling the ones we don’t use is the easiest win — the estimate assumes we drop a quarter of them.`,
    items: subs.slice(0, 8).map(s => ({n: s.n, s: s.s ? ' · ' + s.s : '', v: money(s.mo) + '/mo'})).concat(subs.length > 8 ? [{n: `+ ${subs.length - 8} more`, v: money(sum(subs.slice(8).map(s => s.mo))) + '/mo'}] : []), save: tot * 12 * .25}); }
  // 2) everyday categories running above our usual for this time of year
  const prior = years.filter(k => k < y).slice(-3).map(k => same[years.indexOf(k)]), now = same[years.indexOf(y)];
  if (prior.length && now) {
    const hot = Object.keys(now.cat).filter(isVar).map(c => { const usual = sum(prior.map(p => p.cat[c] || 0)) / prior.length; return {c, now: now.cat[c], usual, x: now.cat[c] - usual}; })
      .filter(r => r.usual > 0 && r.x > Math.max(300, r.usual * .15)).sort((p, q) => q.x - p.x).slice(0, 6);
    if (hot.length) groups.push({t: 'Running above our usual', d: `Everyday categories higher than our average for January – ${MON[mo - 1]} over the past ${plural(prior.length, 'year')}. Getting back to normal would save the difference.`,
      items: hot.map(r => ({n: r.c, s: ` · usually ${short(r.usual)}`, v: `${short(r.now)} <span class="neg">+${short(r.x)}</span>`})), save: sum(hot.map(r => r.x * 12 / mo))});
  }
  // 3) small, frequent purchases (coffee, fast food, quick online orders)
  const small = Object.values(V).map(v => { const n = sum(last3.map(m => v.k[m] || 0)), amt = sum(last3.map(m => v.m[m] || 0)); return {n: v.n, cat: v.cat, per: n / 3, avg: amt / Math.max(1, n), mo: amt / 3}; })
    .filter(v => v.per >= 4 && v.avg <= 40).sort((p, q) => q.mo - p.mo).slice(0, 6);
  if (small.length) groups.push({t: 'Small, frequent purchases', d: 'Little charges that add up. Cutting these in half is the estimate.',
    items: small.map(v => ({n: v.n, s: ` · ${Math.round(v.per)}×/mo, ~${money(v.avg)} each`, v: money(v.mo) + '/mo'})), save: sum(small.map(v => v.mo)) * 12 * .5});
  return {groups, total: sum(groups.map(g => g.save))};
}

/* =====================================================================
   Data checks — catch bad numbers before they skew every chart
     bank      the bank's month-end balance (CSV) vs. what's entered
     rec       last month-end + that month's transactions ≠ this month-end
     rollup    only some of an account's underlying accounts entered
     swing     net worth moved more than 10% in a month (with the biggest mover)
     stale     an active account not updated for 3+ months
   ===================================================================== */
const signed = (v, d = 0) => (v >= 0 ? '+' : '−') + money(Math.abs(v), d);
function dataChecks() {
  const out = [], B = ST.bal, nowM = ym(CTX.TODAY), since = CTX.SINCE.slice(0, 7), last = B.months.length - 1;
  const done = m => m < nowM;   // only judge finished months
  // bank vs entered
  (CTX.stmt || []).forEach(sb => {
    if (!sb.complete || !done(sb.m)) return; const a = B.accounts.find(x => x.id === sb.acct), j = B.months.indexOf(sb.m); if (!a || j < 0) return;
    const v = a.v[j];
    if (v == null) out.push({id: `bank|${a.id}|${sb.m}`, sev: 'warn', m: sb.m, acct: a, t: `${a.name} · ${mLabel(sb.m)} isn’t entered`, d: `The bank file shows ${money(sb.v, 2)} at month end.`, fix: {l: 'Use the bank’s balance', fn: () => { a.v[j] = sb.v; }}});
    else if (Math.abs(v - sb.v) > Math.max(1, Math.abs(sb.v) * .0005)) out.push({id: `bank|${a.id}|${sb.m}`, sev: 'bad', m: sb.m, acct: a, t: `${a.name} · ${mLabel(sb.m)} doesn’t match the bank`,
      d: `Entered ${money(v, 2)}; the bank’s file shows ${money(sb.v, 2)} — off by ${signed(v - sb.v, 2)}.`, fix: {l: 'Use the bank’s balance', fn: () => { a.v[j] = sb.v; }}});
  });
  // transactions don't add up (accounts with transactions imported)
  const byAM = {}; ST.tx.forEach(t => { const m = t.d.slice(0, 7); if (m < since) return; const k = t.acct + '|' + m, r = (byAM[k] ||= {s: 0, n: 0}); r.s += t.amt; r.n++; });
  B.accounts.filter(a => a.kind === 'account' && a.active !== false && !a.rollup).forEach(a => {
    for (let j = 1; j <= last; j++) { const m = B.months[j], r = byAM[a.name + '|' + m]; if (!done(m) || m <= since || !r || r.n < 5) continue;
      const v0 = a.v[j - 1], v1 = a.v[j]; if (v0 == null || v1 == null) continue;
      const exp = v0 + r.s, gap = v1 - exp;
      if (Math.abs(gap) > Math.max(25, Math.abs(v1) * .002)) out.push({id: `rec|${a.id}|${m}`, sev: 'warn', m, acct: a, t: `${a.name} · ${mLabel(m)} transactions don’t add up`,
        d: `Started at ${money(v0, 2)}, transactions ${signed(r.s, 2)}, so it should end at ${money(exp, 2)} — the entered balance is ${money(v1, 2)} (${signed(gap, 2)}). Usually a missing, duplicate or wrong-sign transaction.`, tx: {acct: a.name, m}});
    }
  });
  // partial roll-ups (e.g. only some Schwab accounts entered)
  B.accounts.filter(a => a.rollup && a.active !== false).forEach(a => {
    const kids = (ST.subAccts || []).filter(s => s.parent === a.id && s.active !== false), key = s => s.id || s.tmp;
    for (let j = Math.max(1, last - 6); j <= last; j++) { const m = B.months[j], pm = B.months[j - 1]; if (!done(m)) continue;
      const now = kids.filter(s => ST.inv[key(s)]?.[m]).length, before = kids.filter(s => ST.inv[key(s)]?.[pm]).length;
      if (now && now < before) out.push({id: `rollup|${a.id}|${m}`, sev: 'bad', m, acct: a, t: `${a.name} · ${mLabel(m)}: only ${now} of ${before} accounts entered`,
        d: `The ${mLabel(m)} total (${short(a.v[j] || 0)}) leaves out ${kids.filter(s => ST.inv[key(s)]?.[pm] && !ST.inv[key(s)]?.[m]).map(s => s.nickname || '••' + s.last4).join(', ')}, so it understates the balance.`, act: a}); }
    // a roll-up total that jumps when its underlying accounts take over (e.g. only part of Schwab entered by account)
    for (let j = Math.max(1, last - 12); j <= last; j++) { const m = B.months[j], v0 = a.v[j - 1], v1 = a.v[j]; if (!done(m) || v0 == null || v1 == null || !v0) continue;
      const fromKids = kids.some(s => ST.inv[key(s)]?.[m]), ch = (v1 - v0) / Math.abs(v0);
      if (fromKids && Math.abs(ch) > .25 && !out.some(c => c.id === `rollup|${a.id}|${m}`)) out.push({id: `rollupjump|${a.id}|${m}`, sev: 'bad', m, acct: a, t: `${a.name} · ${mLabel(m)} total ${ch < 0 ? 'dropped' : 'jumped'} ${Math.abs(Math.round(ch * 100))}%`,
        d: `${mLabel(m)} is the sum of ${kids.filter(s => ST.inv[key(s)]?.[m]).length} underlying account${kids.length === 1 ? '' : 's'} (${short(v1)}) vs. ${short(v0)} the month before. If an account is missing or only partly entered, finish it under Activity by account.`}); }
  });
  // net worth swings over 10%
  const movers = i => { const list = [];
    B.accounts.forEach(a => { const s = BS[(a.kind === 'loan' ? 'loan:' : 'acct:') + a.id]; if (!s) return; list.push({n: a.name, d: (s[i] - s[i - 1]) * (a.kind === 'loan' || a.group === 'Debt' ? -1 : 1)}); });
    if (BS.assetValue) list.push({n: 'Home & vehicles', d: BS.assetValue[i] - BS.assetValue[i - 1]});
    return list.filter(x => Math.abs(x.d) >= 1).sort((p, q) => Math.abs(q.d) - Math.abs(p.d)); };
  for (let i = Math.max(1, L - 23); i <= L; i++) { const m = BS.months[i], a0 = BS.netWorth[i - 1], a1 = BS.netWorth[i]; if (!done(m) || !a0) continue;
    const ch = (a1 - a0) / Math.abs(a0); if (Math.abs(ch) <= .10) continue; const mv = movers(i);
    out.push({id: `swing|${m}`, sev: 'bad', m, t: `Net worth ${ch < 0 ? 'fell' : 'rose'} ${Math.abs(Math.round(ch * 100))}% in ${mLabel(m)} (${signed(a1 - a0)})`,
      d: `${mv[0] ? `Biggest change: <b>${esc(mv[0].n)}</b> ${signed(mv[0].d)}${mv[1] ? `, then ${esc(mv[1].n)} ${signed(mv[1].d)}` : ''}. ` : ''}If that’s real — a sale, a big purchase, a market move — mark it as right; otherwise check that balance.`, html: true, swing: true}); }
  // stale balances
  const lastDone = B.months.filter(done).pop(), jD = B.months.indexOf(lastDone);
  B.accounts.filter(a => a.active !== false && a.kind === 'account').forEach(a => { let k = jD; while (k >= 0 && a.v[k] == null) k--;
    if (k >= 0 && jD - k >= 3) out.push({id: `stale|${a.id}|${B.months[k]}`, sev: 'info', m: lastDone, acct: a, t: `${a.name} hasn’t been updated since ${mLabel(B.months[k])}`, d: `Charts carry ${money(a.v[k])} forward. Enter recent balances, or mark the account inactive if it’s closed.`}); });
  const ok = new Set(CTX.settings.checks_ok || []);
  const rank = {bad: 0, warn: 1, info: 2};
  return {list: out.filter(c => !ok.has(c.id)).sort((p, q) => rank[p.sev] - rank[q.sev] || q.m.localeCompare(p.m)), hidden: out.filter(c => ok.has(c.id)).length};
}
let CHK_OPEN = null;
function checksCard() {
  const C = dataChecks(); if (!C.list.length && !C.hidden) return '';
  const nBad = C.list.filter(c => c.sev !== 'info').length, open = CHK_OPEN ?? nBad > 0;
  const chipC = {bad: 'neg', warn: '', info: ''}, chipT = {bad: 'Check', warn: 'Review', info: 'Reminder'};
  return `<div class="card c-12 chk-card" id="chkCard"><div class="card-h"><div><h3>${C.list.length ? `${icon('warn')} Data checks · ${C.list.length} to look at` : `${icon('check')} Data checks · all clear`}</h3>
      <div class="sub">Bank balances, transaction totals, partial entries and big swings${C.hidden ? ` · ${C.hidden} marked as right` : ''}</div></div>
      ${C.list.length ? `<div class="right"><button class="btn" id="chkTog" style="height:32px">${open ? 'Hide' : 'Show'}</button></div>` : ''}</div>
    ${open ? `<div class="chk-list">${C.list.slice(0, 12).map((c, i) => `<div class="chk ${c.sev}"><span class="chip ${chipC[c.sev]}">${chipT[c.sev]}</span><div class="chk-m"><div class="nm">${esc(c.t)}</div><div class="ds">${c.html ? c.d : esc(c.d)}</div></div>
      <div class="chk-a">${c.fix && CTX.CAN_WRITE ? `<button class="btn" data-cfix="${i}">${esc(c.fix.l)}</button>` : ''}${c.tx ? `<button class="btn" data-ctx="${i}">See transactions</button>` : c.m ? `<button class="btn" data-cgo="${i}">Show month</button>` : ''}${CTX.CAN_WRITE ? `<button class="link" data-cok="${i}">Looks right</button>` : ''}</div></div>`).join('')}
      ${C.list.length > 12 ? `<p class="muted" style="font-size:12px">+${C.list.length - 12} more</p>` : ''}</div>` : ''}</div>`;
}
function wireChecks(pg) {
  if (!$('#chkCard', pg)) return;
  const C = dataChecks().list;
  if ($('#chkTog')) $('#chkTog').onclick = () => { CHK_OPEN = !(CHK_OPEN ?? C.some(c => c.sev !== 'info')); render(); };
  $$('[data-cfix]', pg).forEach(b => b.onclick = () => { const c = C[+b.dataset.cfix]; c.fix.fn(); if (typeof rebuildBS === 'function') rebuildBS(); render(); toast(`${c.acct?.name || 'Balance'} updated to the bank’s balance`); });
  $$('[data-cgo]', pg).forEach(b => b.onclick = () => { const c = C[+b.dataset.cgo], j = ST.bal.months.indexOf(c.m); if (j >= 0) { balM = j; balView = 'month'; } go('balances'); });
  $$('[data-ctx]', pg).forEach(b => b.onclick = () => { const c = C[+b.dataset.ctx]; Object.assign(TXF, {q: '', acct: c.tx.acct, cat: '*', sub: '*', month: c.tx.m, unc: false, vendor: '', dir: ''}); go('tx'); });
  $$('[data-cok]', pg).forEach(b => b.onclick = async () => { const c = C[+b.dataset.cok], list = (CTX.settings.checks_ok || []).concat(c.id).slice(-300); CTX.settings.checks_ok = list; render();
    const {error} = await FDB.rpc('set_household_setting', {p_household: CTX.HH, p_key: 'checks_ok', p_value: list});
    if (error) toast('Couldn’t save that: ' + error.message + (/checks_ok/.test(error.message) ? ' — run migration 1500' : '')); else toast('Marked as right', async () => { CTX.settings.checks_ok = list.filter(x => x !== c.id); render(); await FDB.rpc('set_household_setting', {p_household: CTX.HH, p_key: 'checks_ok', p_value: CTX.settings.checks_ok}); }); });
}

/* =====================================================================
   Loans · pay down, refinance or invest?
   Compares each loan's rate with today's 30-yr average (FRED, via the market-data job)
   and with what the portfolio is expected to earn (the base Plan scenario).
   ===================================================================== */
const LD = {extra: 500};
const mktLast = code => (CTX.market || []).filter(r => r[0] === code).sort((a, b) => a[1].localeCompare(b[1])).map(r => ({m: r[1], v: +r[2]})).pop();
{ const mr = mktLast('MORTGAGE30US'); if (mr && typeof LS !== 'undefined') LS.refiRate = Math.round(mr.v * 8) / 8; }   // the refinance slider starts at today's average
function loanDecisionCard(act) {
  const loans = act.filter(l => l.rate != null && loanBal(l) > 0); if (!loans.length) return '';
  const mr = mktLast('MORTGAGE30US'), t10 = mktLast('DGS10') || mktLast('TB3MS'), mkt = mr ? mr.v / 100 : null, safe = t10 ? t10.v / 100 : .04;
  const ret = (typeof SCN !== 'undefined' && SCN[0]?.p?.ret) || .07, ra = ret * (1 - .15), hurdle = ra - .01;   // after a 15% tax haircut, less 1 point for risk
  const E = LD.extra;
  const rows = loans.map(l => {
    const b = loanBal(l), base = remaining(l), n = base.length, I0 = sum(base.map(r => r.int)), withX = E ? remaining(l, E) : base, n1 = withX.length, I1 = sum(withX.map(r => r.int));
    const i = hurdle / 12, fv = (p, k) => k <= 0 ? 0 : i ? p * (Math.pow(1 + i, k) - 1) / i : p * k;
    const edge = fv(E, n) - fv((l.pmt || 0) + E, n - n1);   // >0: investing the extra beats paying down (on average)
    let v, why, cls;
    if (l.rate === 0) { v = 'Keep it'; cls = 'pos'; why = 'It’s interest-free — paying early gains nothing.'; }
    else if (l.rate >= hurdle) { v = 'Pay it down'; cls = 'neg'; why = `A guaranteed ${pctRate(l.rate)} beats the ~${pctRate(hurdle)} the portfolio is expected to earn after tax and a margin for risk.`; }
    else if (l.rate <= safe) { v = 'Invest — keep the loan'; cls = 'pos'; why = `Even ${t10 ? (mktLast('DGS10') ? '10-yr Treasuries' : 'T-bills') : 'safe bonds'} pay ${pctRate(safe)}, more than this loan costs.`; }
    else { v = 'Lean invest'; cls = ''; why = `Investing is expected to earn ~${pctRate(ra)} after tax vs. ${pctRate(l.rate)} here, but paying down is a sure thing. Pay extra only if certainty matters more to you.`; }
    let refi = null;
    if (l.type === 'Mortgage' && mkt != null && n > 60 && b > 50000) {
      const np = pmtCalc(b, mkt, n), save = (l.pmt || 0) - np, cost = b * (LS.refiCost || 2) / 100;
      refi = l.rate - mkt >= .0075 && save > 0 ? {ok: true, save, cost, be: Math.ceil(cost / save), np} : {ok: false, gap: l.rate - mkt};
      if (refi.ok) { v = 'Price a refinance'; cls = 'neg'; why = `Today’s 30-yr average is ${pctRate(mkt)}, ${((l.rate - mkt) * 100).toFixed(2)} points below your ${pctRate(l.rate)}. ` + why; }
    }
    return {l, b, n, n1, I0, I1, edge, v, why, cls, refi};
  });
  return `<div class="card c-12" id="ldCard"><div class="card-h"><div><h3>Pay down, refinance or invest?</h3>
      <div class="sub">Each loan’s rate vs. ${mr ? `today’s 30-yr mortgage average (<b>${pctRate(mkt)}</b>, ${mLabel(mr.m)})` : 'today’s mortgage rates (run Automation to pull the 30-yr average)'} and your plan’s expected return (<b>${pctRate(ret)}</b>, ~${pctRate(ra)} after tax)</div></div>
      <div class="right"><label class="tgl">Extra per loan <select class="in sm sel" onchange="LD.extra=+this.value;render()">${[0, 100, 250, 500, 1000, 2000].map(x => `<option value="${x}" ${x === E ? 'selected' : ''}>${money(x)}/mo</option>`).join('')}</select></label></div></div>
    <div class="ld-list">${rows.map(r => `<div class="ld">
      <div class="ld-n"><b>${esc(r.l.name)}</b><div class="muted">${short(r.b)} at ${pctRate(r.l.rate)} · ${r.n} payments left</div></div>
      <div class="ld-v"><span class="chip ${r.cls}">${r.v}</span><div class="ds">${r.why}</div></div>
      <div class="ld-x">${E && r.l.rate > 0 ? `<div><span class="muted">+${money(E)}/mo:</span> saves <b>${short(r.I0 - r.I1)}</b> interest, done <b>${r.n - r.n1} mo</b> sooner</div>
        <div class="muted">Investing it instead (risk-adjusted) ends up ${r.edge >= 0 ? `<b class="pos">${short(r.edge)} ahead</b>` : `<b class="neg">${short(-r.edge)} behind</b>`} on average by the original payoff</div>` : ''}
        ${r.refi ? r.refi.ok ? `<div style="margin-top:4px">Refi at ${pctRate(mkt)}: <b>${money(r.refi.save)}/mo</b> less · ~${short(r.refi.cost)} costs · breaks even in <b>${r.refi.be} months</b></div>` : `<div class="muted" style="margin-top:4px">Refinancing: your rate is only ${(r.refi.gap * 100).toFixed(2)} pts ${r.refi.gap >= 0 ? 'above' : 'below'} today’s average — not worth the closing costs yet (look at ~0.75+).</div>` : ''}</div></div>`).join('')}</div>
    <p class="muted" style="font-size:11.5px;margin-top:8px">Rules of thumb, not advice: a loan costing more than the portfolio’s expected after-tax return (less a point for risk) is worth paying down; one cheaper than safe Treasuries is worth keeping; refinancing usually pays when today’s rate is ~0.75 points lower and you’ll stay past the break-even. Expected return comes from the base scenario on the Plan page.</p></div>`;
}
