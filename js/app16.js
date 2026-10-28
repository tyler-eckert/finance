/* =====================================================================
   v94 · ON TRACK · GOALS · NEEDS ATTENTION
   On track: the one headline — what we need to save each year to retire at the plan's age (at the plan's confidence)
             next to what we actually kept over the last 12 full months; the 55 → 59½ bridge from taxable money;
             health insurance until Medicare; and each investment account tagged taxable / pre-tax / Roth / HSA.
   Goals:    retirement, each child's college, and the big planned items (pool…), with progress.
   Needs attention (Home): uncategorized, over budget, bills and tax due soon, data checks.
   ===================================================================== */
Object.assign(I, {
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
});

/* ---------------- account tax treatment (household setting) ---------------- */
const TAXT_L = {taxable: 'Taxable', pretax: 'Pre-tax', roth: 'Roth', hsa: 'HSA', '529': '529', none: 'Not counted'};
const TAXT_SET = () => CTX.household?.settings?.tax_treat || CTX.settings?.tax_treat || {};
const taxtGuess = a => { const n = (a.name || '').toLowerCase();
  if (a.group === 'College' || /529/.test(n)) return '529'; if (/\bhsa\b/.test(n)) return 'hsa'; if (/roth/.test(n)) return 'roth';
  if (a.group === 'Retirement' || /401|403|ira\b|pension/.test(n)) return 'pretax'; if (a.group === 'Investing') return 'taxable'; return null; };
const taxtOf = a => TAXT_SET()[a.id] || taxtGuess(a);
const acctBal = a => BS['acct:' + a.id]?.[L] || 0;
const investAccts = () => ST.bal.accounts.filter(a => a.kind === 'account' && ['Investing', 'Retirement', 'College'].includes(a.group) && (a.active !== false || Math.abs(acctBal(a)) >= 1));
async function saveTaxt(id, v) {
  const settings = {...(CTX.household.settings || {}), tax_treat: {...TAXT_SET(), [id]: v}};
  const {error} = await sb.schema('finance').from('households').update({settings}).eq('id', CTX.HH);
  if (error) return toast('Couldn’t save: ' + error.message);
  CTX.household.settings = settings; if (CTX.settings) CTX.settings.tax_treat = settings.tax_treat; render();
}

/* ---------------- the numbers ---------------- */
// income − spending over the last 12 full months, every category (the category filter doesn't change this answer)
function kept12() {
  const M0 = lastFullMonth(), months = ymRange(ymPlus(M0, -11), M0), MM = summMonthly(); let inc = 0, out = 0;
  months.forEach(m => { for (const [c, v] of Object.entries(MM[m] || {})) { const k = sKind(c); if (k === 'in') inc += v; else if (k === 'out') out += -v; } });
  return {inc, out, kept: inc - out, from: months[0], to: M0};
}
// the least net cash flow into savings (on top of 401(k) + match) that still gives the plan's confidence
const NEEDC = new Map();
function neededPre(sc, conf = SCCONF) {
  const key = pkey(sc.p) + conf; if (NEEDC.has(key)) return NEEDC.get(key);
  const ok = x => simP({...sc.p, pre: x}, 250, false).prob >= conf;
  let lo = -200000, hi = 400000, out;
  if (ok(lo)) out = lo; else if (!ok(hi)) out = null;
  else { for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; } out = Math.ceil(hi / 500) * 500; }
  NEEDC.set(key, out); return out;
}
function onTrack() {
  const sc = SCN[0], K = kept12(), pre = neededPre(sc);
  const needed = pre == null ? null : contrib401 + pre, saved = contrib401 + K.kept, planned = contrib401 + sc.p.pre;
  const atPace = simP({...sc.p, pre: K.kept}, 300, false).prob, planP = scnRun(sc).prob;
  return {sc, K, needed, saved, planned, gap: needed == null ? null : saved - Math.max(0, needed), atPace, planP, conf: SCCONF};
}
// taxable money at retirement (today's dollars) against the years before 59½
function bridge() {
  const sc = SCN[0], p = sc.p, n = Math.max(0, p.retire - ageNow), r = p.ret - p.infl, g = Math.pow(1 + r, n), ann = r ? (g - 1) / r : n;
  const by = {taxable: 0, pretax: 0, roth: 0, hsa: 0, '529': 0};
  investAccts().forEach(a => { const t = taxtOf(a); if (t && by[t] != null) by[t] += acctBal(a); });
  const retY = YNOW + n;
  // big planned items paid from brokerage / cash before retiring come out of the taxable pile (in today's dollars)
  const outs = (ST.planned || []).filter(x => livePlan(x) && ['brokerage', 'cash', 'other'].includes(x.fund) && +x.due.slice(0, 4) < retY)
    .map(x => { const y = +x.due.slice(0, 4), amt = Math.abs(+x.amount || 0) / Math.pow(1 + p.infl, Math.max(0, y - YNOW)); return {x, amt, fv: amt * Math.pow(1 + r, retY - y)}; });
  const addTax = Math.max(0, p.pre), taxAt = by.taxable * g + addTax * ann - sum(outs.map(o => o.fv));
  const preAt = by.pretax * g + contrib401 * ann, rothAt = by.roth * g, hsaAt = by.hsa * g;
  const mins = (typeof mineralsAt === 'function' ? mineralsAt(retY) * p.minerals : 0) / Math.pow(1 + p.infl, n);
  const yrs = Math.max(0, 59.5 - p.retire), needYr = Math.max(0, p.spend + (p.health || 0) - mins), need = needYr * yrs;
  return {p, n, by, taxAt, preAt, rothAt, hsaAt, outs, addTax, mins, yrs, needYr, need, cover: needYr ? taxAt / needYr : Infinity};
}

/* ---------------- page: On track ---------------- */
function renderOnTrack(pg) {
  const T = onTrack(), B = bridge(), p = T.sc.p, w = CTX.CAN_WRITE;
  const st = T.needed == null ? {k: 'neg', l: 'Out of reach', s: `No savings rate reaches ${Math.round(T.conf * 100)}% at ${p.retire} with this plan`}
    : T.gap >= 0 ? {k: 'pos', l: 'On track', s: `Saving ${short(T.gap)} a year more than needed`} : {k: 'neg', l: 'Behind', s: `${short(-T.gap)} a year short of what’s needed`};
  const per = `${mShort(T.K.from)} – ${mShort(T.K.to)}`;
  const accts = investAccts();
  pg.innerHTML = `<div class="grid g-12">
    <div class="card hero c-12 ot-hero" data-lk="ot-hero"><div class="label hero-top"><span>Retire at ${p.retire} · ${esc(T.sc.name)}</span><button class="link hero-link" onclick="go('plan')">Open plan →</button></div>
      <div class="ot-row"><div><div class="val">${st.l}</div><div class="delta">${st.s}</div></div>
        <div class="ot-vs"><div><span>Needed each year</span><b class="num">${T.needed == null ? '—' : short(Math.max(0, T.needed))}</b><small>${T.needed != null && T.needed <= 0 ? `already enough · could draw ${short(-T.needed)}/yr` : `for a ${Math.round(T.conf * 100)}% chance`}</small></div><i>vs</i><div><span>Saved, last 12 months</span><b class="num">${short(T.saved)}</b><small>${per}</small></div></div></div>
      <div class="hero-grid">
        <div>Odds at that pace<b class="num">${Math.round(T.atPace * 100)}%</b></div>
        <div>Odds with the plan’s savings<b class="num">${Math.round(T.planP * 100)}%</b></div>
        <div>Kept from the bank<b class="num">${short(T.K.kept)}</b></div>
        <div>401(k) + match<b class="num">${short(contrib401)}</b></div></div>
      <div class="hero-plan"><span>How</span>“Saved” = income minus spending over the last 12 full months (all categories) plus 401(k) and match. “Needed” = the least that still gives a ${Math.round(T.conf * 100)}% chance in ${esc(T.sc.name)}, which spends ${short(p.spend)}/yr from ${p.retire} (today’s dollars).</div></div>

    <div class="card c-7" data-lk="ot-bridge"><div class="card-h"><div><h3>${p.retire} to 59½ · the bridge years</h3><div class="sub">Retirement accounts carry a 10% penalty before 59½, so these ${B.yrs ? B.yrs.toFixed(1).replace('.0', '') + ' years' : 'years'} are paid from taxable money · today’s dollars</div></div></div>
      ${B.yrs <= 0 ? `<p class="muted">The plan retires at ${p.retire}, after 59½ — no bridge needed.</p>` : `
      <div class="ot-bridge"><div class="ot-bar"><i class="${B.cover >= B.yrs ? 'ok' : 'short'}" style="width:${Math.min(100, B.cover / B.yrs * 100)}%"></i></div>
        <div class="ot-bl"><b class="${B.cover >= B.yrs ? 'pos' : 'neg'}">${B.cover >= B.yrs ? `Covered · ${B.cover >= 99 ? 'many' : B.cover.toFixed(1)} years of spending` : `Short · covers ${B.cover.toFixed(1)} of ${B.yrs} years`}</b><span class="muted">${short(B.taxAt)} taxable at ${p.retire} vs ${short(B.need)} needed</span></div></div>
      <table class="table ot-t"><tr><th>Bucket</th><th>Today</th><th>At ${p.retire}</th><th>Use</th></tr>
        <tr><td>Taxable</td><td class="num">${short(B.by.taxable)}</td><td class="num"><b>${short(B.taxAt)}</b></td><td class="muted">Ages ${p.retire}–59½, then flexible</td></tr>
        <tr><td>Pre-tax 401(k) / IRA</td><td class="num">${short(B.by.pretax)}</td><td class="num">${short(B.preAt)}</td><td class="muted">From 59½ (or Rule of 55)</td></tr>
        <tr><td>Roth</td><td class="num">${short(B.by.roth)}</td><td class="num">${short(B.rothAt)}</td><td class="muted">Contributions any time; growth at 59½</td></tr>
        ${B.by.hsa ? `<tr><td>HSA</td><td class="num">${short(B.by.hsa)}</td><td class="num">${short(B.hsaAt)}</td><td class="muted">Medical costs, tax-free</td></tr>` : ''}</table>
      <p class="muted ot-note">Bridge need = ${short(B.needYr)}/yr (${short(p.spend)} spending + ${short(p.health || 0)} health${B.mins >= 500 ? ` − ${short(B.mins)} mineral income` : ''}) × ${B.yrs} years. Taxable grows at ${((p.ret - p.infl) * 100).toFixed(1)}% after inflation plus the plan’s ${short(B.addTax)}/yr${B.outs.length ? `, less ${B.outs.map(o => `${esc(o.x.name)} (${short(o.amt)}, ${o.x.due.slice(0, 4)})`).join(', ')}` : ''}. Rule of 55: a 401(k) at the employer you leave in or after the year you turn 55 can be drawn without the penalty; IRAs can’t. Confirm with your CPA before relying on it.</p>`}</div>

    <div class="card c-5" data-lk="ot-health"><div class="card-h"><div><h3>Health insurance until Medicare</h3><div class="sub">Ages ${p.retire}–65 · added to retirement spending in every plan run</div></div></div>
      <div class="ot-hv"><b class="num">${short(p.health || 0)}</b><span>/yr · today’s dollars</span></div>
      <p class="muted" style="font-size:var(--fs-sm);margin:6px 0 12px">${Math.max(0, 65 - p.retire)} years · about ${short((p.health || 0) * Math.max(0, 65 - p.retire))} in total. Without an employer plan, a family policy bought on the marketplace often costs $20k–$30k+ a year before subsidies, so this is worth checking each year.</p>
      ${w ? `<label class="pj-w ot-hs">Health / yr <b id="otHv">${short(p.health || 0)}</b><input type="range" id="otH" min="0" max="40000" step="1000" value="${p.health || 0}"></label>` : ''}
      ${p.health ? '' : `<div class="banner" style="margin-top:10px">${icon('warn')}<span>The plan has no health insurance before 65.</span></div>`}</div>

    <div class="card c-12" data-lk="ot-accounts"><div class="card-h"><div><h3>Accounts by tax treatment</h3><div class="sub">Sets which bucket each account counts in · first guess from the account name and group · saved for the household</div></div></div>
      <div class="ot-accts">${accts.map(a => `<div class="ot-a"><span class="nm">${esc(a.name)}<small>${esc(a.inst || a.group)}${a.active === false ? ' · closed' : ''}</small></span><b class="num">${short(acctBal(a))}</b>
        <select class="in sel" data-tt="${a.id}" ${w && isUuid(a.id) ? '' : 'disabled'}>${Object.entries(TAXT_L).map(([k, l]) => `<option value="${k}" ${taxtOf(a) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}</div></div>
  </div>`;
  $$('[data-tt]', pg).forEach(s => s.onchange = () => saveTaxt(s.dataset.tt, s.value));
  const h = $('#otH'); if (h) { h.oninput = () => { $('#otHv').textContent = short(+h.value); }; h.onchange = () => { T.sc.p.health = +h.value; SYNC.schedule(); render(); toast(`Health insurance set to ${short(+h.value)}/yr in ${T.sc.name}`); }; }
}

/* ---------------- page: Goals ---------------- */
function renderGoals(pg) {
  const sc = SCN[0], rp = scnRun(sc).prob, ea = earliest(sc), conf = SCCONF;
  const bar = (f, cls = '') => `<div class="gl-bar"><i class="${cls}" style="width:${Math.max(2, Math.min(100, f * 100))}%"></i></div>`;
  const kids = DATA.kids.filter(k => k.key).map(k => { const kk = {...k, y18: collegeYear(k)}; return {k: kk, cp: colProject(kk), bal: BS[k.key]?.[L] || 0}; });
  const big = (ST.planned || []).filter(x => livePlan(x) && x.fund !== 'college_529' && x.fund !== 'budget' && Math.abs(+x.amount || 0) >= 10000).sort((a, b) => a.due.localeCompare(b.due));
  const srcBal = f => f === 'brokerage' ? (BS.brokerage?.[L] || 0) : f === 'cash' ? (BS.cash?.[L] || 0) : null;
  const srcName = f => ({brokerage: typeof SCH_NAME !== 'undefined' ? SCH_NAME : 'Brokerage', cash: 'Cash', other: 'Other'})[f] || f;
  const T = onTrack();
  pg.innerHTML = `<div class="grid g-12">
    <div class="card c-6 gl" data-lk="goal-retire"><div class="gl-h"><span class="gl-i">${icon('target')}</span><div><h3>Retire at ${sc.p.retire}</h3><div class="sub">${esc(sc.name)} · ${short(sc.p.spend)}/yr in today’s dollars</div></div><b class="chip ${rp >= conf ? 'pos' : 'neg'}">${Math.round(rp * 100)}% chance</b></div>
      ${bar(rp / Math.max(conf, .01), rp >= conf ? 'ok' : 'short')}
      <div class="gl-kv"><span>Goal: at least ${Math.round(conf * 100)}% · earliest age at that level: <b>${ea ?? 'over 65'}</b></span></div>
      <div class="gl-kv"><span>${T.gap == null ? 'Savings needed couldn’t be found' : T.gap >= 0 ? `Saving <b class="pos">${short(T.gap)}/yr</b> more than needed` : `<b class="neg">${short(-T.gap)}/yr</b> short of what’s needed`}</span><button class="btn sm" onclick="go('ontrack')">On track</button></div></div>
    ${big.map(x => { const sb = srcBal(x.fund), amt = Math.abs(+x.amount || 0), mo = ymDiffN(ym(CTX.TODAY), x.due);
      return `<div class="card c-6 gl" data-lk="goal-${normKey(x.name)}"><div class="gl-h"><span class="gl-i">${icon('flag')}</span><div><h3>${esc(x.name)}</h3><div class="sub">${mLabel(x.due)} · ${mo > 0 ? `${mo >= 24 ? Math.round(mo / 12) + ' years' : mo + ' months'} away` : 'due now'} · from ${esc(srcName(x.fund))}</div></div><b class="chip">${short(amt)}</b></div>
        ${sb != null ? bar(sb / amt, sb >= amt ? 'ok' : '') : ''}
        <div class="gl-kv"><span>${sb != null ? `${esc(srcName(x.fund))} today: <b>${short(sb)}</b> · ${sb >= amt ? `covers it ${(sb / amt).toFixed(1)}×` : `${Math.round(sb / amt * 100)}% of it`}` : 'Paid from savings'} · the plan already takes it out in ${x.due.slice(0, 4)}</span></div></div>`; }).join('')}
    ${kids.map(({k, cp, bal}) => `<div class="card c-4 gl" data-lk="goal-college-${normKey(k.name)}"><div class="gl-h"><span class="gl-i">${icon('cap')}</span><div><h3>${esc(k.name)}’s college</h3><div class="sub">Starts ${mLabel(cp.start)} · 529</div></div><b class="chip ${cp.covered >= .999 ? 'pos' : ''}">${Math.round(cp.covered * 100)}% covered</b></div>
      ${bar(cp.covered, cp.covered >= .999 ? 'ok' : '')}
      <div class="gl-kv"><span>Saved <b>${short(bal)}</b> · about ${short(cp.atStart)} when college starts</span></div>
      <div class="gl-kv"><span>${cp.extra > 0 ? `Add about <b>${money(cp.extra)}/mo</b> to cover every semester` : 'On pace for the plan’s semesters'}</span></div></div>`).join('')}
    ${!big.length && !kids.length ? '<div class="card c-6"><p class="muted">Add milestones in Plan → Investments → Milestones to track them here.</p></div>' : ''}
  </div>`;
}

/* ---------------- Home: Needs attention ---------------- */
function attentionItems() {
  const out = [], today = CTX.TODAY, y = +today.slice(0, 4), m = +today.slice(5, 7);
  // uncategorized
  const unc = ST.tx.filter(t => !t.splits && !t.cat && t.d >= CTX.SINCE);   // the recent window, not years-old leftovers
  if (unc.length) out.push({k: 'warn', t: `${plural(unc.length, 'uncategorized transaction')}`, s: money(sum(unc.map(t => t.amt))), a: `TXF.cat='';TXF.sub='*';TXF.unc=true;TXF.month='';go('tx')`, b: 'Categorize'});
  // over budget: last full month, and this month already past its whole-month budget
  const over = (yy, mm) => { const A = actuals(yy, mm, mm).A; return ST.cats.filter(c => /Expense/.test(c.group) && c.name !== 'Tax').map(c => ({c: c.name, a: -(A[c.name] || 0), b: -budgetFor(yy, c.name, mm, mm)})).filter(x => x.b > 0 && x.a > x.b + 50).sort((p, q) => (q.a - q.b) - (p.a - p.b)); };
  const LF = lastFullMonth(), ly = +LF.slice(0, 4), lm = +LF.slice(5, 7), oL = over(ly, lm), oN = ly === y && lm === m ? [] : over(y, m);
  if (oN.length) out.push({k: 'neg', t: `${MON[m - 1]} so far: ${oN.slice(0, 3).map(x => esc(x.c)).join(', ')}${oN.length > 3 ? ` +${oN.length - 3}` : ''} already over the month’s budget`, s: `${short(sum(oN.map(x => x.a - x.b)))} over`, a: `bMode='month';bMonth=${m};go('budget')`, b: 'Budget'});
  if (oL.length) out.push({k: 'neg', t: `${MON[lm - 1]}: ${oL.slice(0, 3).map(x => esc(x.c)).join(', ')}${oL.length > 3 ? ` +${oL.length - 3}` : ''} went over budget`, s: `${short(sum(oL.map(x => x.a - x.b)))} over`, a: `bMode='month';bMonth=${lm};go('budget')`, b: 'Review'});
  // bills, loans and tax in the next 14 days (from the weekly digest)
  const P = typeof DG !== 'undefined' ? DG.digests?.[0]?.payload : null;
  if (P) { const due = P.bills.filter(b => b.date >= today && b.why !== 'milestone').sort((a, b) => a.date.localeCompare(b.date)), tax = due.filter(b => b.why === 'tax'), rest = due.filter(b => b.why !== 'tax');
    tax.forEach(b => out.push({k: 'info', t: `Tax: ${esc(b.name)} · ${dgDay(b.date).short} ${dgDay(b.date).md}`, s: b.amount ? money(b.amount) : '', a: `go('taxes')`, b: 'Taxes'}));
    if (rest.length) out.push({k: 'info', t: `${plural(rest.length, 'bill')} due by ${dgDay(rest[rest.length - 1].date).md}: ${rest.slice(0, 3).map(b => esc(b.name)).join(', ')}${rest.length > 3 ? '…' : ''}`, s: money(sum(rest.map(b => b.amount || 0))), a: `go('week')`, b: 'This week'}); }
  // estimated tax due within 30 days (in case the digest isn't set up)
  if (!P || !P.bills.some(b => b.why === 'tax')) { const dues = [[y, 1, 15], [y, 4, 15], [y, 6, 15], [y, 9, 15], [y + 1, 1, 15]].map(([a, b, c]) => `${a}-${String(b).padStart(2, '0')}-${c}`);
    const nx = dues.find(d => d >= today), days = nx ? Math.round((new Date(nx) - new Date(today)) / 864e5) : 99;
    if (days <= 30) out.push({k: 'info', t: `Estimated taxes due ${MON[+nx.slice(5, 7) - 1]} ${+nx.slice(8, 10)} · Federal, Oklahoma, New Mexico`, s: `${days} days`, a: `go('taxes')`, b: 'Taxes'}); }
  // data checks
  const bad = typeof dataChecks === 'function' ? dataChecks().list.filter(c => c.sev === 'bad') : [];
  if (bad.length) out.push({k: 'warn', t: `${plural(bad.length, 'data check')} — balances may be off`, s: '', a: `go('balances')`, b: 'Review'});
  return out;
}
function ovAttentionCard() {
  const L0 = attentionItems(), ic = {neg: 'warn', warn: 'warn', info: 'info'};
  return `<div class="card c-12 att" data-lk="needs-attention"><div class="card-h"><div><h3>Needs attention</h3><div class="sub">${L0.length ? plural(L0.length, 'item') + ' · uncategorized, over budget, bills and tax due soon, data checks' : 'Nothing right now'}</div></div></div>
    ${L0.length ? `<div class="att-l">${L0.map(x => `<button class="att-i ${x.k}" onclick="${x.a}"><span class="att-ic">${icon(ic[x.k])}</span><span class="att-t">${x.t}</span>${x.s ? `<b class="num">${x.s}</b>` : ''}<span class="att-go">${x.b} ›</span></button>`).join('')}</div>`
    : `<div class="att-ok">${icon('check')}<span>All clear — everything is categorized, on budget and nothing is due in the next two weeks.</span></div>`}</div>`;
}
