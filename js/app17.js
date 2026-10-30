/* =====================================================================
   v102 · BUDGETING WITH HISTORY
   1  history beside every budget line (last year, last 12 months, trend)
   2  one-click suggestions (last year, 12-mo average, this year's pace, +3%) and "split by history"
   3  annual amount → spread evenly / like last year / chosen months
   4  a budget editor panel, opened from Budget setup or right from Budget vs. actual
   5  long range: actuals for past years, this year, and a rule per category for the years ahead (feeds the plan)
   6  "needs a budget": sub-categories with real spending and no budget
   Amounts follow the budget's sign convention: income positive, expenses negative.
   ===================================================================== */
Object.assign(I, {pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>', hist: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>'});

/* ---------- history index: key 'Cat' or 'Cat|Sub' → {'YYYY-MM': amount} (signed, like transactions) ---------- */
let HIX = null, HIXk = '';
function histIdx() {
  const k = ST.tx.length + '|' + (ST.allLoaded ? 1 : 0) + '|' + (SYNC?.sig?.tx?.size || 0);
  if (HIX && HIXk === k && Date.now() - HIX._t < 4000) return HIX;
  const H = {}, since = CTX.SINCE.slice(0, 7), add = (key, m, v) => { const o = (H[key] ||= {}); o[m] = (o[m] || 0) + v; };
  for (const m in DATA.monthly || {}) if (m < since) for (const c in DATA.monthly[m]) add(c, m, DATA.monthly[m][c]);
  for (const m in DATA.subMonthly || {}) if (m < since) for (const kk in DATA.subMonthly[m]) add(kk, m, DATA.subMonthly[m][kk]);
  ST.tx.forEach(t => { const m = t.d.slice(0, 7); if (m < since) return; pieces(t).forEach(p => { const c = p.cat || 'Uncategorized'; add(c, m, p.amt); add(c + '|' + (p.sub || ''), m, p.amt); }); });
  H._t = Date.now(); HIX = H; HIXk = k; return H;
}
const hAt = (key, m) => histIdx()[key]?.[m] || 0;
const keyOf = (c, s) => s == null ? c : c + '|' + s;
const r5 = v => Math.round(v / 5) * 5;
function hStats(c, s, y) {
  const key = keyOf(c, s), LF = lastFullMonth(), lfY = +LF.slice(0, 4), lfM = +LF.slice(5, 7);
  const ly = MON.map((_, i) => hAt(key, `${y - 1}-${String(i + 1).padStart(2, '0')}`));
  const last12m = ymRange(ymPlus(LF, -11), LF), last12 = sum(last12m.map(m => hAt(key, m)));
  const ytdM = y === lfY ? lfM : y < lfY ? 12 : 0, ytd = sum(MON.slice(0, ytdM).map((_, i) => hAt(key, `${y}-${String(i + 1).padStart(2, '0')}`)));
  const m24 = ymRange(ymPlus(LF, -23), LF), v24 = m24.map(m => hAt(key, m));
  return {ly, lyT: sum(ly), last12, avg12: last12 / 12, ytd, ytdM, pace: ytdM ? ytd / ytdM * 12 : 0, m24, v24};
}
// signed suggestions for a 12-month row
function suggest(c, s, y, kind) {
  const H = hStats(c, s, y), sign = groupOf(c) === 'Income' ? 1 : -1, mag = v => sign * Math.abs(r5(v));
  if (kind === 'ly') return H.ly.map(v => mag(v));
  if (kind === 'lyplus') return H.ly.map(v => mag(v * 1.03));
  if (kind === 'avg12') return Array(12).fill(mag(H.avg12));
  if (kind === 'pace') return Array(12).fill(mag(H.pace / 12));
  if (kind === 'season') { const shape = shapeOf(H.ly), t = Math.abs(H.last12); return shape.map(p => mag(t * p)); }
  return null;
}
const shapeOf = arr => { const a = arr.map(v => Math.abs(v)), t = sum(a); return t ? a.map(v => v / t) : Array(12).fill(1 / 12); };
function spreadAnnual(total, how, months, c, s, y) {
  const sign = groupOf(c) === 'Income' ? 1 : -1, t = Math.abs(total);
  if (how === 'months' && months.length) return MON.map((_, i) => months.includes(i) ? sign * r5(t / months.length) : 0);
  if (how === 'ly') { const p = shapeOf(hStats(c, s, y).ly); return p.map(x => sign * r5(t * x)); }
  return Array(12).fill(sign * r5(t / 12));
}
/* split a category budget into its sub-categories by their share of the last 12 months (the category total stays the same) */
function splitByHistory(c, y) {
  const cat = catOf(c); if (!cat || !cat.subs.length) return 0; const B = ST.budget[y]; if (!B) return 0; const SB = (ST.subBudget[y] ||= {});
  if (subBudgetRows(y, c).length) return 0;
  const tot = (B[c] || Array(12).fill(0)).slice(), sh = cat.subs.map(sb => ({sb, v: Math.abs(hStats(c, sb, y).last12)})).filter(x => x.v >= 1), T = sum(sh.map(x => x.v));
  if (!T || !sum(tot.map(Math.abs))) return 0;
  sh.forEach(x => { SB[c + '|' + x.sb] = tot.map(v => Math.round(v * x.v / T)); });
  return sh.length;
}
const bRow = (c, s, y) => s == null ? ST.budget[y]?.[c] : ST.subBudget[y]?.[c + '|' + s];
const bVals = (c, s, y) => { const r = bRow(c, s, y); if (r) return r; if (s == null) { const sb = subBudgetRows(y, c); if (sb.length) return MON.map((_, i) => sum(sb.map(x => x.v[i] || 0))); } return Array(12).fill(0); };

/* ---------- 4 · the budget editor panel ---------- */
const BE = {c: null, s: null, y: CY, how: 'even', months: []};
function openBudEdit(c, s, y) {
  Object.assign(BE, {c, s: s ?? null, y: y || (ST.budget[CY] ? CY : Object.keys(ST.budget).map(Number).sort().pop())});
  if (!ST.budget[BE.y]) createBudget(BE.y, 'copy');
  drawBudEdit(); openLayer('drawer');
}
function drawBudEdit() {
  const {c, s, y} = BE, d = $('#drawer'), H = hStats(c, s, y), inc = groupOf(c) === 'Income', sg = v => inc ? v : -v;
  const hasSubs = s == null && subBudgetRows(y, c).length > 0, cur = bVals(c, s, y).slice(), years = Object.keys(ST.budget).map(Number).filter(v => v >= CY).sort();
  if (!years.includes(y)) years.push(y);
  if (!years.includes(CY + 1)) years.push(CY + 1);   // next year can be started from here (copies this year's budget)
  years.sort();
  const ytdB = sum(cur.slice(0, H.ytdM)), f = v => v ? Math.round(Math.abs(v)).toLocaleString('en-US') : '';
  d.classList.add('wide-d');
  d.innerHTML = `<div class="dh"><div><div class="muted" style="font-size:12px;font-weight:600">${s != null ? esc(c) + ' · ' : ''}Budget · ${y}</div><h2>${esc(s == null ? c : (s || 'No sub-category'))}</h2></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="seg sm" id="beY" style="margin:10px 0 4px">${years.map(v => `<button data-y="${v}" class="${v === y ? 'on' : ''}" ${!ST.budget[v] ? `title="Start the ${v} budget from ${v - 1}"` : ''}>${v}${!ST.budget[v] ? ' +' : ''}</button>`).join('')}</div>
    <div class="stat-row be-stats">
      <div class="mini"><div class="l">Last year · ${y - 1}</div><div class="v num">${money(sg(H.lyT))}</div><div class="ds">${money(sg(H.lyT) / 12)}/mo</div></div>
      <div class="mini"><div class="l">Last 12 months</div><div class="v num">${money(sg(H.last12))}</div><div class="ds">${money(sg(H.avg12))}/mo avg</div></div>
      <div class="mini"><div class="l">${y} so far${H.ytdM ? ' · Jan–' + MON[H.ytdM - 1] : ''}</div><div class="v num">${money(sg(H.ytd))}</div><div class="ds">${H.ytdM ? `budget ${money(sg(ytdB))} · ${sg(H.ytd) - sg(ytdB) > 0 === !inc ? '<span class="neg">' : '<span class="pos">'}${short(Math.abs(H.ytd - ytdB))} ${(sg(H.ytd) > sg(ytdB)) === !inc ? 'over' : 'under'}</span>` : 'not started'}</div></div>
      <div class="mini"><div class="l">${y} budget</div><div class="v num" id="beTot">${money(sg(sum(cur)))}</div><div class="ds">${money(sg(sum(cur)) / 12)}/mo</div></div></div>
    <h4 class="h4">Last 24 months <span class="muted" style="font-weight:500">· actual spending · hover a bar for its budget</span></h4><div class="chart" id="beChart"></div>
    ${hasSubs ? `<div class="banner" style="margin-top:14px">${icon('info')}<span>${esc(c)} is budgeted by sub-category — edit those lines, or open one below.</span></div>
      <div class="list" style="margin-top:8px">${subBudgetRows(y, c).map(r => `<div class="li click" data-besub="${esc(r.sub)}"><div style="flex:1">${esc(r.sub || 'No sub-category')}</div><b class="num">${money(sg(sum(r.v)))}</b></div>`).join('')}</div>`
    : `<h4 class="h4" style="margin-top:18px">${y} by month</h4>
    <div class="be-grid">${MON.map((m, i) => `<label><span>${m}</span><input class="in num be-in" data-i="${i}" inputmode="decimal" value="${f(cur[i])}" placeholder="0"><small class="muted">${H.ly[i] ? short(Math.abs(H.ly[i])) : '—'}</small></label>`).join('')}</div>
    <div class="muted" style="font-size:var(--fs-xs);margin-top:4px">Grey under each month = last year's actual</div>
    <h4 class="h4" style="margin-top:16px">Quick fill</h4>
    <div class="be-quick">${[['ly', `Last year, month by month`, sg(H.lyT)], ['lyplus', 'Last year + 3%', sg(H.lyT) * 1.03], ['avg12', '12-month average', sg(H.last12)], ['pace', `${CY} pace`, sg(H.pace)], ['season', 'Last 12 mo, last year’s pattern', sg(H.last12)]].map(([k, l, v]) => `<button class="btn sm" data-sug="${k}">${l}<span class="muted num">${short(Math.abs(v))}/yr</span></button>`).join('')}</div>
    <h4 class="h4" style="margin-top:16px">Set a yearly amount</h4>
    <div class="be-ann"><div class="bal-in"><span>$</span><input class="in num" id="beAnn" inputmode="decimal" value="${f(sum(cur))}"></div>
      <div class="seg sm" id="beHow">${[['even', 'Evenly'], ['ly', 'Like last year'], ['months', 'Only these months']].map(([k, l]) => `<button data-h="${k}" class="${BE.how === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn" id="beSpread">Spread</button></div>
    ${BE.how === 'months' ? `<div class="be-months">${MON.map((m, i) => `<button class="kchip ${BE.months.includes(i) ? '' : 'off'}" data-bm="${i}">${m}</button>`).join('')}</div>` : ''}
    ${s != null && !bRow(c, s, y) && !subBudgetRows(y, c).length ? `<div class="banner" style="margin-top:14px">${icon('info')}<span>${esc(c)} is budgeted as a whole. Saving this line splits ${esc(c)}'s budget across its sub-categories by the last 12 months first, so the category total doesn't change.</span></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:18px"><button class="btn primary" id="beSave">Save ${y} budget</button><button class="btn" onclick="closeAll()">Cancel</button>${s == null && catOf(c)?.subs.length ? `<button class="btn" id="beSplit" style="margin-left:auto" title="Keeps the category total">Split into sub-categories by history</button>` : ''}</div>`}`;
  const read = () => $$('.be-in', d).map(x => { const v = +(x.value.replace(/[$,\s]/g, '')) || 0; return inc ? Math.abs(v) : -Math.abs(v); });
  const put = arr => { $$('.be-in', d).forEach((x, i) => x.value = f(arr[i])); upd(); };
  const upd = () => { const t = sum(read()); $('#beTot').textContent = money(sg(t)); if ($('#beAnn')) $('#beAnn').value = f(t); drawBeChart(read()); };
  $$('#beY button', d).forEach(b => b.onclick = () => { BE.y = +b.dataset.y; if (!ST.budget[BE.y]) createBudget(BE.y, 'copy'); drawBudEdit(); });
  $$('[data-besub]', d).forEach(b => b.onclick = () => { BE.s = b.dataset.besub; drawBudEdit(); });
  $$('.be-in', d).forEach(x => { x.oninput = upd; x.onfocus = () => x.select(); });
  $$('[data-sug]', d).forEach(b => b.onclick = () => put(suggest(c, s, y, b.dataset.sug)));
  $$('#beHow button', d).forEach(b => b.onclick = () => { BE.how = b.dataset.h; const keep = read(); drawBudEdit(); put(keep); });
  $$('[data-bm]', d).forEach(b => b.onclick = () => { const i = +b.dataset.bm; BE.months = BE.months.includes(i) ? BE.months.filter(x => x !== i) : [...BE.months, i]; b.classList.toggle('off'); });
  if ($('#beSpread')) $('#beSpread').onclick = () => put(spreadAnnual(+($('#beAnn').value.replace(/[$,\s]/g, '')) || 0, BE.how, BE.months, c, s, y));
  if ($('#beSplit')) $('#beSplit').onclick = () => { const n = splitByHistory(c, y); if (!n) return toast('No sub-category history to split by'); render(); drawBudEdit(); toast(`${c} split into ${n} sub-categories by the last 12 months`); };
  if ($('#beSave')) $('#beSave').onclick = () => { const v = read();
    if (s != null && !bRow(c, s, y)) { if (!subBudgetRows(y, c).length) splitByHistory(c, y); (ST.subBudget[y] ||= {})[c + '|' + s] = v; }
    else if (s != null) ST.subBudget[y][c + '|' + s] = v; else (ST.budget[y] ||= {})[c] = v;
    closeAll(); render(); toast(`${s ?? c} · ${y} budget saved (${money(sg(sum(v)))})`); };
  const drawBeChart = vals => { const yv = H.m24.map(m => +m.slice(0, 4)), mi = H.m24.map(m => +m.slice(5, 7) - 1);
    barChart($('#beChart'), {labels: H.m24.map(mShort), series: [{name: 'Actual', values: H.v24.map(sg), color: 'var(--s2)'}], height: 150, padL: 44, xGap: 46,
      tipTitle: (l, i) => mLabel(H.m24[i]), tipExtra: i => { const b = yv[i] === y ? vals[mi[i]] : bVals(c, s, yv[i])?.[mi[i]]; return b ? tipRow(null, 'Budget', money(sg(b))) : ''; }});};
  requestAnimationFrame(() => drawBeChart(read().length ? read() : cur));
}

/* ---------- 6 · needs a budget ---------- */
function needsBudget(y) {
  const out = [];
  ST.cats.filter(c => /Expense/.test(c.group) && c.group !== 'TTS').forEach(c => {
    const catB = Math.abs(sum(bVals(c.name, null, y))), subsB = subBudgetRows(y, c.name);
    if (!catB) { const t = Math.abs(hStats(c.name, null, y).last12); if (t >= 300) out.push({c: c.name, s: null, t}); return; }
    if (subsB.length) c.subs.forEach(sb => { if (subsB.some(r => r.sub === sb)) return; const t = Math.abs(hStats(c.name, sb, y).last12); if (t >= 300) out.push({c: c.name, s: sb, t}); });
  });
  return out.sort((a, b) => b.t - a.t);
}
function needsBudgetCard(y) {
  const L0 = needsBudget(y); if (!L0.length) return '';
  return `<div class="card c-12 nb-card" data-lk="needs-a-budget"><div class="card-h"><div><h3>Needs a budget</h3><div class="sub">${plural(L0.length, 'line')} with real spending in the last 12 months but no ${y} budget · tap one to set it from its history</div></div>
    <div class="right"><button class="btn sm" id="nbAll">Add all at their 12-month average</button></div></div>
    <div class="nb-list">${L0.slice(0, 12).map(x => `<button class="nb-i" data-nb="${esc(x.c)}|${x.s == null ? '' : esc(x.s)}|${x.s == null ? 0 : 1}"><span>${esc(x.s == null ? x.c : x.s)}${x.s != null ? `<small>${esc(x.c)}</small>` : ''}</span><b class="num">${short(x.t)}</b><span class="muted">/ 12 mo</span></button>`).join('')}${L0.length > 12 ? `<span class="muted" style="align-self:center">+${L0.length - 12} more</span>` : ''}</div></div>`;
}

/* ---------- 5 · long range ---------- */
const BPLAN = () => CTX.household?.settings?.budget_plan || {};
async function saveBPlan(p) {
  const settings = {...(CTX.household.settings || {}), budget_plan: p};
  const {error} = await sb.schema('finance').from('households').update({settings}).eq('id', CTX.HH);
  if (error) return toast('Couldn’t save: ' + error.message); CTX.household.settings = settings; render();
}
function longRange(pg, yearSeg) {
  const P = BPLAN(), infl = SCN[0]?.p.infl ?? .025, base = ST.budget[CY + 1] ? CY + 1 : CY, LF = lastFullMonth(), lfY = +LF.slice(0, 4), lfM = +LF.slice(5, 7);
  const past = [CY - 3, CY - 2, CY - 1], fut = [1, 2, 3, 4, 5].map(k => base + k).filter(v => v > base);
  const retY = YNOW + (SCN[0]?.p.retire ?? 55) - ageNow;
  const yAct = (c, yy) => sum(MON.map((_, i) => hAt(c, `${yy}-${String(i + 1).padStart(2, '0')}`)));
  const rule = c => ({g: P[c]?.g ?? infl, end: P[c]?.end ?? null, note: P[c]?.note || ''});
  const proj = (c, yy) => { const r = rule(c), b = sum(bVals(c, null, base)); if (r.end && yy > r.end) return 0; return b * Math.pow(1 + r.g, yy - base); };
  const rows = ST.cats.filter(c => c.group !== 'TTS' && (sum(bVals(c.name, null, base)) || past.some(yy => yAct(c.name, yy)))), sg = c => groupOf(c) === 'Income' ? 1 : -1;
  const cell = (v, c, cls = '') => `<td class="num ${cls}">${v ? short(Math.abs(v)) : '<span class="zd">—</span>'}</td>`;
  const grp = g => rows.filter(r => r.group === g);
  const tot = (list, f) => sum(list.map(r => f(r.name)));
  const head = `<tr><th class="stick">Category</th>${past.map(yy => `<th>${yy}</th>`).join('')}<th>${CY}<span class="lr-sub">pace</span></th><th class="lr-b">${base}<span class="lr-sub">budget</span></th>${fut.map(yy => `<th class="lr-f">${yy}</th>`).join('')}<th class="lr-r">At ${retY}<span class="lr-sub">today’s $</span></th><th class="lr-rule">Rule</th></tr>`;
  const pace = c => lfY === CY ? yAct(c, CY) / lfM * 12 : yAct(c, CY);
  const atRet = c => proj(c, retY) / Math.pow(1 + infl, retY - YNOW);
  const body = GROUPS.filter(g => g.k !== 'TTS').map(g => { const L0 = grp(g.k); if (!L0.length) return '';
    return `<tr class="grp"><td class="stick" colspan="${past.length + fut.length + 5}">${g.l}</td></tr>` + L0.map(r => { const c = r.name, ru = rule(c);
      return `<tr><td class="stick"><button class="link lr-n" data-be="${esc(c)}">${esc(c)}</button></td>${past.map(yy => cell(yAct(c, yy), c)).join('')}${cell(pace(c), c, 'lr-p')}${cell(sum(bVals(c, null, base)), c, 'lr-b')}${fut.map(yy => cell(proj(c, yy), c, 'lr-f')).join('')}${cell(atRet(c), c, 'lr-r')}
        <td class="lr-rule"><label>+<input class="in num lr-g" data-lg="${esc(c)}" value="${(ru.g * 100).toFixed(1).replace(/\.0$/, '')}">%/yr</label><label>ends after <input class="in num lr-e" data-le="${esc(c)}" value="${ru.end || ''}" placeholder="—"></label></td></tr>`; }).join('')
      + `<tr class="tot"><td class="stick">Total ${g.l.toLowerCase()}</td>${past.map(yy => cell(tot(L0, c => yAct(c, yy)))).join('')}${cell(tot(L0, pace), '', 'lr-p')}${cell(tot(L0, c => sum(bVals(c, null, base))), '', 'lr-b')}${fut.map(yy => cell(tot(L0, c => proj(c, yy)), '', 'lr-f')).join('')}${cell(tot(L0, atRet), '', 'lr-r')}<td></td></tr>`; }).join('');
  const expL = rows.filter(r => /Expense/.test(r.group)), retSpend = Math.abs(tot(expL, atRet)), planSpend = SCN[0]?.p.spend || 0;
  pg.innerHTML = `<div class="toolbar wrap">${yearSeg}${bbViewSeg()}<span class="muted" style="font-size:var(--fs-sm)">Past years are actuals · ${base} is your budget · later years grow by each line's rule (default ${(infl * 100).toFixed(1)}% = the plan's inflation) · “ends after” stops a line (daycare, a loan)</span></div>
  <div class="grid g-12">
    <div class="card c-12 lr-sum"><div class="bs-row">
      <div class="bs-st"><span class="bs-l">Spending · ${base} budget</span><b class="num">${short(Math.abs(tot(expL, c => sum(bVals(c, null, base)))))}</b><span class="bs-b">${past.map(yy => `${yy}: ${short(Math.abs(tot(expL, c => yAct(c, yy))))}`).join(' · ')}</span></div>
      <div class="bs-st"><span class="bs-l">Spending · ${fut[fut.length - 1]}</span><b class="num">${short(Math.abs(tot(expL, c => proj(c, fut[fut.length - 1]))))}</b><span class="bs-b">future dollars</span></div>
      <div class="bs-st"><span class="bs-l">At retirement · ${retY}</span><b class="num">${short(retSpend)}</b><span class="bs-b">today’s dollars · the plan uses ${short(planSpend)}/yr</span>${CTX.CAN_WRITE && Math.abs(retSpend - planSpend) > 1000 ? `<button class="btn sm" id="lrUse" style="align-self:flex-start;margin-top:4px">Use ${short(retSpend)} in the plan</button>` : ''}</div></div>
      <div class="bs-per muted">Lines that end before ${retY} (kids’ school, daycare, loans) drop out of the retirement number. The plan adds health insurance and its own mortgage payoff on top.</div></div>
    <div class="card c-12" style="padding:10px 0 4px"><div class="scroll-x"><table class="table lr-t">${head}${body}</table></div></div>
  </div>`;
  $$('[data-lg]', pg).forEach(x => x.onchange = () => { const p = {...BPLAN()}; p[x.dataset.lg] = {...(p[x.dataset.lg] || {}), g: (+x.value || 0) / 100}; saveBPlan(p); });
  $$('[data-le]', pg).forEach(x => x.onchange = () => { const p = {...BPLAN()}; p[x.dataset.le] = {...(p[x.dataset.le] || {}), end: +x.value || null}; saveBPlan(p); });
  $$('[data-be]', pg).forEach(b => b.onclick = () => openBudEdit(b.dataset.be, null, base));
  if ($('#lrUse')) $('#lrUse').onclick = () => { SCN[0].p.spend = Math.round(retSpend / 1000) * 1000; SYNC.schedule(); render(); toast(`Plan retirement spending set to ${short(SCN[0].p.spend)}/yr`); };
}
let BBV = 'month';
const bbViewSeg = () => `<div class="seg" id="bbView"><button data-v="month" class="${BBV === 'month' ? 'on' : ''}">By month</button><button data-v="long" class="${BBV === 'long' ? 'on' : ''}">Long range</button></div>`;
