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
