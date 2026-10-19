/* =====================================================================
   VENDORS · CASH PLAN (12 weeks) · BROKERAGE ACTIVITY BY ACCOUNT
   ===================================================================== */
Object.assign(I, {
  store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a3 3 0 01-5.3 2 3 3 0 01-5.4 0A3 3 0 014 11z"/><path d="M5 13.5V20h14v-6.5M10 20v-4h4v4"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
});
const asofYM = () => `${ASOF.y}-${String(ASOF.m).padStart(2, '0')}`;
const vName = desc => vendorName(vendorKey(desc));

/* =====================================================================
   VENDORS
   ===================================================================== */
const VS = {q: '', dir: 'out', xfer: false, lim: 80, sort: 'l12'};
function vendorStats() {   // name → {months: {ym: amt}, n12, last, cats, keys}
  const since = CTX.SINCE.slice(0, 7), out = {};
  const put = (name, k, m, amt, n, cat, d) => {
    if (!VS.xfer && cat === 'TTS') return;
    if (VS.dir === 'out' ? amt >= 0 : amt <= 0) return;
    const v = out[name] ||= {name, months: {}, cats: {}, keys: new Set(), n: {}, last: ''};
    v.months[m] = (v.months[m] || 0) + Math.abs(amt); v.n[m] = (v.n[m] || 0) + n; v.cats[cat || 'Uncategorized'] = (v.cats[cat || 'Uncategorized'] || 0) + Math.abs(amt);
    if (k) v.keys.add(k); if (d && d > v.last) v.last = d; else if (!d && m + '-28' > v.last) v.last = v.last || m + '-15';
  };
  (D2.vendorMonthly || []).forEach(r => { if (r.m < since) put(vendorName(r.k), r.k, r.m, r.amt, r.n, r.cat, null); });
  ST.tx.forEach(t => { if (t.d.slice(0, 7) < since) return; const k = vendorKey(t.desc); put(vendorName(k), k, t.d.slice(0, 7), t.amt, 1, t.splits ? t.splits[0].cat : t.cat, t.d); });
  return out;
}
function renderVendors(pg) {
  const end = asofYM(), m12 = Array.from({length: 12}, (_, i) => ymAdd(end, i - 11)), p12 = m12.map(m => ymAdd(m, -12));
  const S = vendorStats(), q = VS.q.trim().toLowerCase();
  const rows = Object.values(S).map(v => ({...v, l12: sum(m12.map(m => v.months[m] || 0)), p12: sum(p12.map(m => v.months[m] || 0)), c12: sum(m12.map(m => v.n[m] || 0)),
    cat: Object.entries(v.cats).sort((a, b) => b[1] - a[1])[0]?.[0] || ''})).filter(v => (v.l12 || v.p12) && (!q || v.name.toLowerCase().includes(q) || v.cat.toLowerCase().includes(q)));
  rows.sort((a, b) => VS.sort === 'chg' ? Math.abs(b.l12 - b.p12) - Math.abs(a.l12 - a.p12) : VS.sort === 'n' ? b.c12 - a.c12 : VS.sort === 'name' ? a.name.localeCompare(b.name) : b.l12 - a.l12);
  const tot = sum(rows.map(r => r.l12)), top10 = sum(rows.slice().sort((a, b) => b.l12 - a.l12).slice(0, 10).map(r => r.l12));
  const active = rows.filter(r => r.l12 > 0), top = active.slice().sort((a, b) => b.l12 - a.l12)[0];
  const th = (k, l) => `<th class="${k === 'name' ? '' : ''}"><button class="link srt ${VS.sort === k ? 'on' : ''}" data-s="${k}">${l}</button></th>`;
  pg.innerHTML = `<div class="toolbar wrap">
    <div class="search">${icon('search')}<input class="in" id="vQ" placeholder="Search vendors or categories" value="${esc(VS.q)}"></div>
    <div class="seg" id="vDir"><button data-d="out" class="${VS.dir === 'out' ? 'on' : ''}">Spending</button><button data-d="in" class="${VS.dir === 'in' ? 'on' : ''}">Income</button></div>
    <label class="tgl"><input type="checkbox" id="vX" ${VS.xfer ? 'checked' : ''}> Include transfers</label></div>
  <div class="grid g-12">
    <div class="card c-4 kpi"><div class="label">${VS.dir === 'out' ? 'Spent' : 'Received'} · last 12 months</div><div class="val num">${short(tot)}</div><div class="delta">${active.length} vendors · ${mShort(m12[0])} – ${mShort(end)}</div></div>
    <div class="card c-4 kpi"><div class="label">Top vendor</div><div class="val num" style="font-size:22px">${top ? esc(top.name) : '—'}</div><div class="delta">${top ? short(top.l12) + ' · ' + top.c12 + ' transactions' : ''}</div></div>
    <div class="card c-4 kpi"><div class="label">Top 10 share</div><div class="val num">${tot ? Math.round(top10 / tot * 100) : 0}%</div><div class="delta">of the last 12 months</div></div>
    <div class="card c-12"><div class="card-h"><div><h3>Vendors</h3><div class="sub">Grouped from bank descriptions · tap one for history, or to rename or merge it</div></div></div>
      <div class="scroll-x"><table class="table vt"><tr>${th('name', 'Vendor')}<th class="hide-sm">Category</th>${th('l12', 'Last 12 mo')}<th class="hide-sm">Prior 12 mo</th>${th('chg', 'Change')}${th('n', 'Txns')}<th class="hide-sm">Trend</th></tr>
      ${rows.slice(0, VS.lim).map(v => { const d = v.l12 - v.p12; return `<tr class="click" data-v="${esc(v.name)}"><td><div class="nm">${esc(v.name)}</div><div class="ds muted mob-only-inline" style="font-size:11px">${esc(v.cat)}</div></td><td class="hide-sm muted">${esc(v.cat)}</td><td><b>${money(v.l12)}</b></td><td class="hide-sm muted">${money(v.p12)}</td>
        <td class="${!v.p12 ? 'muted' : (d > 0) === (VS.dir === 'out') ? 'neg' : 'pos'}">${!v.p12 ? 'new' : (d >= 0 ? '+' : '−') + short(Math.abs(d))}</td><td>${v.c12}</td><td class="hide-sm" style="width:110px">${spark(m12.map(m => v.months[m] || 0), 'var(--s2)', 96, 24, false)}</td></tr>`; }).join('')}</table></div>
      ${rows.length > VS.lim ? `<div style="text-align:center;padding:12px"><button class="btn" id="vMore">Show ${Math.min(80, rows.length - VS.lim)} more</button></div>` : ''}</div>
  </div>`;
  let qt; $('#vQ').oninput = e => { VS.q = e.target.value; clearTimeout(qt); qt = setTimeout(() => { const p = e.target.selectionStart; render(); const n = $('#vQ'); n.focus(); n.setSelectionRange(p, p); }, 250); };
  $$('#vDir button').forEach(b => b.onclick = () => { VS.dir = b.dataset.d; render(); });
  $('#vX').onchange = e => { VS.xfer = e.target.checked; render(); };
  $$('.srt', pg).forEach(b => b.onclick = e => { e.stopPropagation(); VS.sort = b.dataset.s; render(); });
  if ($('#vMore')) $('#vMore').onclick = () => { VS.lim += 80; render(); };
  $$('tr[data-v]', pg).forEach(tr => tr.onclick = () => openVendor(tr.dataset.v));
}
function openVendor(name) {
  const S = vendorStats(), v = S[name]; if (!v) return;
  const end = asofYM(), m24 = Array.from({length: 24}, (_, i) => ymAdd(end, i - 23)), yrs = Array.from({length: 5}, (_, i) => CY - 4 + i);
  const yv = yrs.map(y => sum(Object.entries(v.months).filter(([m]) => m.startsWith(String(y))).map(([, a]) => a)));
  const l12 = sum(m24.slice(12).map(m => v.months[m] || 0)), c12 = sum(m24.slice(12).map(m => v.n[m] || 0));
  const txs = ST.tx.filter(t => vName(t.desc) === name).slice(0, 60);
  const names = [...new Set(Object.keys(S).concat(ST.valias.map(a => a.name)))].sort();
  const cats = Object.entries(v.cats).sort((a, b) => b[1] - a[1]).slice(0, 5), cTot = sum(cats.map(c => c[1])) || 1;
  const d = $('#drawer');
  d.innerHTML = `<div class="dh"><div><div class="muted" style="font-size:12px;font-weight:600">Vendor · ${VS.dir === 'out' ? 'spending' : 'income'}</div><h2>${esc(name)}</h2></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="stat-row" style="margin:14px 0;grid-template-columns:1fr 1fr 1fr"><div class="mini"><div class="l">Last 12 months</div><div class="v num">${money(l12)}</div><div class="muted" style="font-size:11.5px">${money(l12 / 12)}/mo</div></div>
      <div class="mini"><div class="l">Transactions</div><div class="v num">${c12}</div><div class="muted" style="font-size:11.5px">${c12 ? money(l12 / c12) + ' avg' : ''}</div></div>
      <div class="mini"><div class="l">Last seen</div><div class="v num" style="font-size:16px">${v.last ? fmtDate(v.last) + ', ' + v.last.slice(0, 4) : '—'}</div></div></div>
    <h4 class="h4">Last 24 months</h4><div class="chart" id="vChart"></div>
    <h4 class="h4" style="margin-top:16px">By year · last 5 years</h4><div class="chart" id="vYr"></div>
    <h4 class="h4" style="margin-top:16px">Categories</h4>${cats.map(([c, a]) => `<div class="ex-row"><span>${esc(c)}</span><b>${money(a)} <span class="muted" style="font-weight:500">${Math.round(a / cTot * 100)}%</span></b></div>`).join('')}
    ${CTX.CAN_WRITE ? `<h4 class="h4" style="margin-top:16px">Rename or merge</h4><div class="form" style="grid-template-columns:1fr auto"><div><input class="in" id="vRen" list="vNames" value="${esc(name)}"><datalist id="vNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div><button class="btn primary" id="vRenGo">Save</button></div>
      <p class="muted" style="font-size:11.5px;margin-top:6px">Pick an existing vendor to merge into it. Applies to all history and future imports. Raw keys: ${[...v.keys].slice(0, 6).map(esc).join(', ')}${v.keys.size > 6 ? '…' : ''}</p>` : ''}
    <h4 class="h4" style="margin-top:16px">Recent transactions</h4><div class="list" id="vList">${txs.map(t => txLi(t)).join('') || '<p class="muted">None in the loaded history.</p>'}</div>
    <button class="btn" id="vAll" style="margin-top:10px">${icon('tx')}<span>See all in Transactions</span></button>`;
  openLayer('drawer');
  $$('#vList .li').forEach(li => li.onclick = () => openTxEdit(li.dataset.id));
  $('#vAll').onclick = () => { TXF.vendor = name; TXF.cat = '*'; TXF.month = ''; go('tx'); };
  if ($('#vRenGo')) $('#vRenGo').onclick = () => {
    const nn = $('#vRen').value.trim(); if (!nn || nn === name) return;
    const was = ST.valias.map(a => ({...a}));
    v.keys.forEach(k => { const hit = VALIAS_FOR(k); const pat = hit ? hit.pattern : k; const ex = ST.valias.find(a => a.pattern === pat); if (ex) ex.name = nn; else ST.valias.push({pattern: pat, name: nn}); });
    setAliases(ST.valias); closeAll(); render();
    toast(`${name} → ${nn}`, () => { ST.valias = was; setAliases(ST.valias); render(); });
  };
  requestAnimationFrame(() => {
    barChart($('#vChart'), {labels: m24.map(mShort), series: [{name, values: m24.map(m => v.months[m] || 0), color: 'var(--s2)'}], height: 170, padL: 44, xGap: 48, tipTitle: (l, i) => mLabel(m24[i] || m24[0]), tipExtra: i => tipRow(null, 'Transactions', v.n[m24[i]] || 0)});
    barChart($('#vYr'), {labels: yrs.map(y => y === CY ? y + ' YTD' : String(y)), series: [{name, values: yv, color: 'var(--s1)', hatchFn: i => yrs[i] === CY}], height: 160, padL: 44, xGap: 50});
  });
}
const VALIAS_FOR = k => ST.valias.filter(a => k.startsWith(a.pattern)).sort((a, b) => b.pattern.length - a.pattern.length)[0];

/* =====================================================================
   CASH PLAN — 12 weeks of bills, subscriptions, income and one-offs
   ===================================================================== */
const CP_KINDS = [{k: 'income', l: 'Income', sign: 1}, {k: 'bill', l: 'Bills', sign: -1}, {k: 'subscription', l: 'Subscriptions', sign: -1}, {k: 'transfer', l: 'Transfers & savings', sign: -1}, {k: 'one_time', l: 'Coming up', sign: -1}];
const FREQ = {once: 'One time', weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Yearly'};
const dAdd = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const mDay = (y, m, day) => { const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`; };
function occurrences(it, from, to) {   // ISO dates of an item between from and to (inclusive)
  if (it.active === false || !it.start) return [];
  const out = [], push = d => { if (d >= from && d <= to && d >= it.start && (!it.end || d <= it.end)) out.push(d); };
  const s = it.start, sy = +s.slice(0, 4), sm = +s.slice(5, 7), sd = +s.slice(8, 10);
  if (it.freq === 'once') push(s);
  else if (it.freq === 'weekly' || it.freq === 'biweekly') { const step = it.freq === 'weekly' ? 7 : 14; let d = s; while (d < from) d = dAdd(d, step); for (; d <= to; d = dAdd(d, step)) push(d); }
  else {
    const every = {semimonthly: 1, monthly: 1, quarterly: 3, annual: 12}[it.freq] || 1, d2 = it.day2 || Math.min(sd + 15, 31);
    for (let k = 0; k < 400; k += every) { const y = sy + Math.floor((sm - 1 + k) / 12), m = (sm - 1 + k) % 12 + 1, first = mDay(y, m, sd);
      if (first > to) break; push(first); if (it.freq === 'semimonthly') push(mDay(y, m, d2)); }
  }
  return out.sort();
}
const weekStart = d => { const t = new Date(d + 'T12:00:00'); const wd = (t.getDay() + 6) % 7; t.setDate(t.getDate() - wd); return t.toISOString().slice(0, 10); };
function cashStart() {
  UI.cash ||= {};
  const cashAccts = ST.bal.accounts.filter(a => a.kind === 'account' && a.group === 'Cash' && a.active !== false);
  const sel = UI.cash.accts && UI.cash.accts.length ? cashAccts.filter(a => UI.cash.accts.includes(a.name)) : cashAccts.filter(a => /check/i.test(a.name)).slice(0, 1);
  const pick = (sel.length ? sel : cashAccts.slice(0, 1)).map(a => { let j = a.v.length - 1; while (j >= 0 && a.v[j] == null) j--; return {name: a.name, v: j >= 0 ? a.v[j] : 0, m: j >= 0 ? ST.bal.months[j] : null}; });
  const auto = sum(pick.map(p => p.v)), asOf = pick.map(p => p.m).filter(Boolean).sort().pop();
  const ov = UI.cash.override;
  return {amount: ov != null && ov !== '' ? +ov : auto, auto, asOf, pick, cashAccts, overridden: ov != null && ov !== ''};
}
function suggestRecurring() {
  const from = dAdd(CTX.TODAY, -150), groups = {};
  ST.tx.forEach(t => { if (t.d < from || !t.amt) return; const n = vName(t.desc), k = n + '|' + (t.amt > 0 ? 1 : -1); (groups[k] ||= {name: n, sign: t.amt > 0 ? 1 : -1, rows: [], cat: t.cat}).rows.push(t); });
  const have = new Set(ST.cash.map(c => (c.vendor || c.name).toLowerCase()));
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const out = [];
  Object.values(groups).forEach(g => {
    if (g.rows.length < 3 || have.has(g.name.toLowerCase())) return;
    const ds = g.rows.map(t => t.d).sort(), gaps = ds.slice(1).map((d, i) => (new Date(d) - new Date(ds[i])) / 864e5), gp = med(gaps);
    const amts = g.rows.map(t => Math.abs(t.amt)), ma = med(amts); if (ma < 5) return;
    const close = amts.filter(a => Math.abs(a - ma) <= Math.max(2, ma * .25)).length / amts.length; if (close < .7) return;
    let freq = gp >= 5 && gp <= 9 ? 'weekly' : gp >= 12 && gp <= 17 ? 'biweekly' : gp >= 25 && gp <= 35 ? 'monthly' : gp >= 80 && gp <= 100 ? 'quarterly' : null; if (!freq) return;
    if (freq === 'biweekly') { const dom = [...new Set(ds.map(d => +d.slice(8)))]; if (dom.length <= 7 && dom.every(x => x <= 2 || (x >= 13 && x <= 17) || x >= 27)) freq = 'semimonthly'; }
    const last = ds[ds.length - 1], period = {weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30, quarterly: 91}[freq]; if (dAdd(last, period + 12) < CTX.TODAY) return;
    let next = freq === 'monthly' || freq === 'quarterly' ? mDay(+ymAdd(last.slice(0, 7), freq === 'monthly' ? 1 : 3).slice(0, 4), +ymAdd(last.slice(0, 7), freq === 'monthly' ? 1 : 3).slice(5), +last.slice(8)) : dAdd(last, period);
    while (next < CTX.TODAY) next = freq === 'monthly' ? mDay(+ymAdd(next.slice(0, 7), 1).slice(0, 4), +ymAdd(next.slice(0, 7), 1).slice(5), +last.slice(8)) : dAdd(next, period);
    const subLike = /netflix|spotify|apple|youtube|disney|ring|adobe|starz|hulu|max|prime|icloud|espn|peacock|paramount/i.test(g.name) || /Netflix|Spotify|Apple|Ring|Cable/.test(g.cat || '');
    const kind = g.sign > 0 ? 'income' : g.cat === 'TTS' || /quicksave|transfer|contrib|529/i.test(g.name) ? 'transfer' : subLike && ma < 150 ? 'subscription' : 'bill';
    let day2 = null; if (freq === 'semimonthly') { const dom = ds.map(d => +d.slice(8)); day2 = dom.some(x => x >= 27) ? 31 : 15; }
    out.push({name: g.name, vendor: g.name, kind, amount: +(g.sign * ma).toFixed(2), freq, start: freq === 'semimonthly' ? mDay(+CTX.TODAY.slice(0, 4), +CTX.TODAY.slice(5, 7), med(ds.map(d => +d.slice(8)).filter(x => x < 20)) || 1) : next, day2, cat: g.cat || '', n: g.rows.length});
  });
  return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}
let CPX = {open: null};
function renderCash(pg) {
  const W = 12, w0 = weekStart(CTX.TODAY), weeks = Array.from({length: W}, (_, i) => dAdd(w0, i * 7)), wEnd = dAdd(w0, W * 7 - 1);
  const st = cashStart();
  const items = ST.cash.filter(c => c.active !== false);
  const cell = it => weeks.map(w => sum(occurrences(it, w < CTX.TODAY ? CTX.TODAY : w, dAdd(w, 6)).map(() => it.amount)));   // only what's still ahead of today
  const rowsBy = CP_KINDS.map(k => ({...k, items: items.filter(it => it.kind === k.k).map(it => ({it, v: cell(it)})).filter(r => r.it.kind !== 'one_time' || sum(r.v.map(Math.abs)))}));
  const inW = weeks.map((_, i) => sum(items.map(it => cell(it)[i]).filter(v => v > 0))), outW = weeks.map((_, i) => sum(items.map(it => cell(it)[i]).filter(v => v < 0)));
  const net = weeks.map((_, i) => inW[i] + outW[i]); let run = st.amount; const endBal = net.map(v => (run += v));
  const low = Math.min(...endBal), lowI = endBal.indexOf(low);
  const sugg = CTX.CAN_WRITE ? suggestRecurring() : [];
  const f = v => v ? (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('en-US') : '';
  let h = `<tr><th class="stick">Item</th>${weeks.map(w => `<th>${MON[+w.slice(5, 7) - 1]} ${+w.slice(8)}</th>`).join('')}<th>12 wks</th></tr>`;
  rowsBy.forEach(g => { if (!g.items.length) return;
    h += `<tr class="grp"><td class="stick" colspan="${W + 2}">${g.l}</td></tr>`;
    g.items.forEach(({it, v}) => h += `<tr class="click" data-ci="${it.id}"><td class="stick"><div class="nm ell" style="max-width:190px">${esc(it.name)}</div><div class="ds muted" style="font-size:11px">${FREQ[it.freq]}${it.freq !== 'once' ? ' · ' + money(Math.abs(it.amount)) : ''}</div></td>${v.map(x => `<td class="num ${x > 0 ? 'pos' : ''}">${f(x)}</td>`).join('')}<td class="num"><b>${f(sum(v))}</b></td></tr>`);
    const gt = weeks.map((_, i) => sum(g.items.map(r => r.v[i])));
    h += `<tr class="sub"><td class="stick">Total ${g.l.toLowerCase()}</td>${gt.map(x => `<td class="num">${f(x)}</td>`).join('')}<td class="num">${f(sum(gt))}</td></tr>`; });
  h += `<tr class="tot"><td class="stick">Net</td>${net.map(x => `<td class="num ${x < 0 ? 'neg' : 'pos'}">${f(x)}</td>`).join('')}<td class="num">${f(sum(net))}</td></tr>
        <tr class="tot net"><td class="stick">Ending cash</td>${endBal.map(x => `<td class="num ${x < 0 ? 'neg' : ''}">${f(x)}</td>`).join('')}<td></td></tr>`;
  pg.innerHTML = `<div class="toolbar wrap"><span class="muted" style="font-size:12.5px">Weeks start Monday · counting from today · ${fmtDate(w0)} – ${fmtDate(wEnd)}, ${wEnd.slice(0, 4)}</span>
    ${CTX.CAN_WRITE ? `<button class="btn primary" style="margin-left:auto" id="cpAdd">${icon('plus')}<span>Add item</span></button>` : ''}</div>
  <div class="grid g-12">
    <div class="card c-3 kpi"><div class="label">Starting cash</div><div class="val num">${short(st.amount)}</div><div class="delta">${st.overridden ? 'entered manually' : `${esc(st.pick.map(p => p.name).join(' + '))}${st.asOf ? ' · ' + mLabel(st.asOf) + ' balance' : ''}`} · <button class="link" id="cpStart">change</button></div></div>
    <div class="card c-3 kpi"><div class="label">Coming in · 12 weeks</div><div class="val num pos">${short(sum(inW))}</div><div class="delta">${items.filter(i => i.amount > 0).length} income items</div></div>
    <div class="card c-3 kpi"><div class="label">Going out · 12 weeks</div><div class="val num">${short(-sum(outW))}</div><div class="delta">${items.filter(i => i.amount < 0).length} bills & planned items</div></div>
    <div class="card c-3 kpi"><div class="label">Lowest point</div><div class="val num ${low < 0 ? 'neg' : ''}">${short(low)}</div><div class="delta">week of ${fmtDate(weeks[lowI])}</div></div>
    <div class="card c-12"><div class="card-h"><div><h3>Ending cash by week</h3><div class="sub">Starting cash plus everything scheduled below</div></div></div><div class="chart" id="cpChart"></div></div>
    <div class="card c-12" style="padding:10px 0 4px"><div class="scroll-x"><table class="table bb cp">${items.length ? h : `<tr><td style="padding:24px;text-align:left" class="muted">Nothing scheduled yet. Add bills, subscriptions and paychecks — or start from the suggestions below.</td></tr>`}</table></div></div>
    ${sugg.length ? `<div class="card c-12"><div class="card-h"><div><h3>Suggested from your transactions</h3><div class="sub">Repeating charges and deposits from the last 5 months · add the ones that belong in the plan</div></div><div class="right"><button class="btn" id="cpAddAll">Add all ${sugg.length}</button></div></div>
      <div class="list">${sugg.slice(0, 30).map((s, k) => `<div class="li"><div style="min-width:0;flex:1"><div class="nm ell">${esc(s.name)}</div><div class="ds">${FREQ[s.freq]} · next ${fmtDate(s.start)} · ${({income: 'Income', bill: 'Bill', subscription: 'Subscription', transfer: 'Transfer'})[s.kind]} · seen ${s.n}×</div></div><div class="amt num ${s.amount > 0 ? 'pos' : ''}">${money(s.amount, 2)}</div><button class="btn" style="height:30px;margin-left:10px" data-sg="${k}">Add</button></div>`).join('')}</div></div>` : ''}
  </div>`;
  $$('[data-ci]', pg).forEach(tr => tr.onclick = () => openCashItem(ST.cash.find(c => c.id === tr.dataset.ci)));
  if ($('#cpAdd')) $('#cpAdd').onclick = () => openCashItem();
  $('#cpStart').onclick = openCashStart;
  $$('[data-sg]', pg).forEach(b => b.onclick = () => openCashItem(null, sugg[+b.dataset.sg]));
  if ($('#cpAddAll')) $('#cpAddAll').onclick = () => { const add = sugg.map((s, k) => ({id: 'c' + Date.now() + k, active: true, sort: 100, notes: '', end: null, acct: '', ...s})); add.forEach(a => delete a.n); ST.cash.push(...add); render(); toast(`Added ${add.length} items`, () => { ST.cash = ST.cash.filter(c => !add.includes(c)); render(); }); };
  CH.push(() => barChart($('#cpChart'), {labels: weeks.map(w => MON[+w.slice(5, 7) - 1] + ' ' + +w.slice(8)), series: [{name: 'Ending cash', values: endBal, colorFn: v => v >= 0 ? 'var(--s1)' : 'var(--neg)'}], height: 200, xGap: 46,
    tipTitle: (l, i) => 'Week of ' + fmtDate(weeks[i]), tipExtra: i => tipRow(null, 'In', money(inW[i])) + tipRow(null, 'Out', money(outW[i])) + tipRow(null, 'Net', money(net[i]))}));
}
function openCashStart() {
  const st = cashStart(), m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Starting cash</h2><p class="muted" style="font-size:12.5px">Use the latest balances of these accounts, or type today's number.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="list">${st.cashAccts.map(a => { let j = a.v.length - 1; while (j >= 0 && a.v[j] == null) j--; return `<label class="li" style="cursor:pointer"><input type="checkbox" data-ca="${esc(a.name)}" ${st.pick.some(p => p.name === a.name) ? 'checked' : ''}><div style="flex:1"><div class="nm">${esc(a.name)}</div><div class="ds">${j >= 0 ? mLabel(ST.bal.months[j]) : 'no balance yet'}</div></div><div class="amt num">${j >= 0 ? money(a.v[j], 2) : '—'}</div></label>`; }).join('')}</div>
    <div class="form one" style="margin-top:12px"><div><label>Or enter today's balance <span class="muted">(leave blank to use the accounts above)</span></label><div class="amt-in"><span>$</span><input class="in num" id="csOv" value="${st.overridden ? st.amount : ''}" placeholder="${Math.round(st.auto).toLocaleString()}"></div></div></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="csGo">Use</button></div>`;
  openLayer('modal');
  $('#csGo').onclick = () => { UI.cash ||= {}; UI.cash.accts = $$('[data-ca]', m).filter(c => c.checked).map(c => c.dataset.ca); const v = $('#csOv').value.replace(/[$,\s]/g, ''); UI.cash.override = v === '' ? null : +v; closeAll(); render(); };
}
function openCashItem(it, pre) {
  const isNew = !it, o = it ? {...it} : {id: 'c' + Date.now(), name: '', kind: 'bill', amount: -0, freq: 'monthly', start: CTX.TODAY, day2: null, end: null, cat: '', acct: '', vendor: '', active: true, notes: '', sort: 100, ...(pre || {})};
  delete o.n;
  const m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">${isNew ? 'Add to cash plan' : 'Edit ' + esc(o.name)}</h2><p class="muted" style="font-size:12.5px">Amounts are entered positive; income adds to cash, everything else takes from it.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
  <div class="form">
    <div style="grid-column:1/-1"><label>Name</label><input class="in" id="ciN" value="${esc(o.name)}" placeholder="e.g. Mortgage, Netflix, Paycheck, Roof deposit"></div>
    <div><label>Type</label><select class="in" id="ciK">${CP_KINDS.map(k => `<option value="${k.k}" ${o.kind === k.k ? 'selected' : ''}>${k.l === 'Coming up' ? 'One-time / coming up' : k.l.replace(/s$/, '').replace('Transfers & saving', 'Transfer / savings')}</option>`).join('')}</select></div>
    <div><label>Amount</label><div class="amt-in"><span>$</span><input class="in num" id="ciA" inputmode="decimal" value="${o.amount ? Math.abs(o.amount).toLocaleString('en-US', {maximumFractionDigits: 2}) : ''}"></div></div>
    <div><label>How often</label><select class="in" id="ciF">${Object.entries(FREQ).map(([k, l]) => `<option value="${k}" ${o.freq === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label id="ciDl">${o.freq === 'once' ? 'Date' : 'Next date'}</label><input class="in" type="date" id="ciD" value="${o.start}"></div>
    <div id="ciD2w" ${o.freq === 'semimonthly' ? '' : 'hidden'}><label>Second day of month</label><input class="in num" id="ciD2" value="${o.day2 || 15}"></div>
    <div><label>Ends <span class="muted">(optional)</span></label><input class="in" type="date" id="ciE" value="${o.end || ''}"></div>
    <div><label>Category <span class="muted">(optional)</span></label><select class="in" id="ciC">${catOptions(o.cat, {blank: '—'})}</select></div>
    <div style="grid-column:1/-1"><label>Note</label><input class="in" id="ciNo" value="${esc(o.notes || '')}"></div>
  </div>
  <div style="display:flex;gap:10px;margin-top:18px">${isNew ? '' : `<button class="btn" id="ciDel">${icon('trash')}<span>Delete</span></button><button class="btn" id="ciOff">${o.active === false ? 'Resume' : 'Pause'}</button>`}<button class="btn" style="margin-left:auto" onclick="closeAll()">Cancel</button><button class="btn primary" id="ciGo">${isNew ? 'Add' : 'Save'}</button></div>`;
  openLayer('modal'); setTimeout(() => $('#ciN').focus(), 50);
  $('#ciF').onchange = e => { $('#ciD2w').hidden = e.target.value !== 'semimonthly'; $('#ciDl').textContent = e.target.value === 'once' ? 'Date' : 'Next date'; };
  $('#ciGo').onclick = () => {
    const name = $('#ciN').value.trim(), a = Math.abs(+$('#ciA').value.replace(/[$,\s]/g, '') || 0); if (!name) return $('#ciN').focus(); if (!a) return $('#ciA').focus();
    const kind = $('#ciK').value;
    Object.assign(o, {name, kind, amount: kind === 'income' ? a : -a, freq: $('#ciF').value, start: $('#ciD').value || CTX.TODAY, day2: $('#ciF').value === 'semimonthly' ? Math.min(31, Math.max(1, +$('#ciD2').value || 15)) : null,
      end: $('#ciE').value || null, cat: $('#ciC').value, notes: $('#ciNo').value.trim()});
    if (isNew) ST.cash.push(o); else Object.assign(it, o);
    closeAll(); render(); toast(isNew ? `Added ${name}` : 'Saved');
  };
  if ($('#ciDel')) $('#ciDel').onclick = () => { const k = ST.cash.indexOf(it); ST.cash.splice(k, 1); closeAll(); render(); toast(`Deleted ${it.name}`, () => { ST.cash.splice(k, 0, it); render(); }); };
  if ($('#ciOff')) $('#ciOff').onclick = () => { it.active = it.active === false; closeAll(); render(); };
}

/* =====================================================================
   BROKERAGE ACTIVITY BY ACCOUNT (e.g. Schwab ••515 …) — roll up into the parent
   ===================================================================== */
const INV_F = [['start', 'Starting'], ['dep', 'Deposits'], ['wd', 'Withdrawals'], ['div', 'Div & interest'], ['xfer', 'Transfers'], ['mkt', 'Market change'], ['fee', 'Fees']];
const invEnd = r => sum(INV_F.map(([k]) => +r[k] || 0));
function prevEnd(id, m) { const rows = ST.inv[id] || {}; const ks = Object.keys(rows).filter(k => k < m).sort(); return ks.length ? rows[ks[ks.length - 1]].end : 0; }
function openActivity(parent, i) {
  const m = ST.bal.months[i], kids = () => ST.subAccts.filter(a => a.parent === parent.id && a.active !== false).sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(a.last4 || a.nickname).localeCompare(String(b.last4 || b.nickname)));
  UI.subMode ||= {};
  let mode = UI.subMode[parent.id] || (parent.acctKind === 'brokerage' ? 'activity' : 'balance');
  const blank = key => ({start: prevEnd(key, m), dep: 0, wd: 0, div: 0, xfer: 0, mkt: 0, fee: 0});
  const draft = {}, dk = a => { const k = a.id || a.tmp; if (!draft[k] && a.tmp && draft[a.tmp]) draft[k] = draft[a.tmp]; return k; };
  kids().forEach(a => { const key = dk(a), r = ST.inv[key]?.[m]; draft[key] = r ? {...r} : blank(key); });
  const endOf = r => mode === 'balance' ? (r.end ?? invEnd(r)) : invEnd(r);
  const label = a => a.nickname || (a.last4 ? '••' + a.last4 : 'Account');
  const modal = $('#modal');
  const draw = () => {
    const ks = kids(), nf = v => v ? (+v).toLocaleString('en-US', {maximumFractionDigits: 2}) : '';
    const tot = Object.fromEntries(INV_F.map(([k]) => [k, sum(ks.map(a => +draft[dk(a)]?.[k] || 0))])), totEnd = sum(ks.map(a => endOf(draft[dk(a)])));
    modal.classList.add('wide');
    const head = mode === 'activity' ? `<tr><th>Account</th>${INV_F.map(([, l]) => `<th>${l}</th>`).join('')}<th>Ending</th></tr>` : `<tr><th>Account</th><th>Last month</th><th>${MON[+m.slice(5) - 1]} ending balance</th><th>Change</th></tr>`;
    const row = a => { const key = dk(a), r = draft[key], prev = prevEnd(key, m), e = endOf(r);
      const nm = `<td><input class="in sm" tabindex="-1" data-nick="${key}" value="${esc(a.nickname || '')}" placeholder="Nickname" style="min-width:130px"><div class="muted" style="font-size:11px;margin-top:2px">${a.last4 ? '••' + esc(a.last4) : '&nbsp;'}</div></td>`;
      return mode === 'activity' ? `<tr data-key="${key}">${nm}${INV_F.map(([k]) => `<td><input class="cell num" data-f="${k}" value="${nf(r[k])}" placeholder="0"></td>`).join('')}<td class="num" data-end><b>${money(e, 2)}</b></td></tr>`
        : `<tr data-key="${key}">${nm}<td class="num muted">${prev ? money(prev, 2) : '—'}</td><td><input class="cell num" data-f="end" value="${nf(r.end ?? (draft[key]._set ? e : ''))}" placeholder="${prev ? Math.round(prev).toLocaleString() : '0'}" style="width:140px"></td><td data-chg class="num ${e - prev >= 0 ? 'pos' : 'neg'}">${(draft[key]._set || ST.inv[key]?.[m]) && prev ? (e - prev >= 0 ? '+' : '−') + money(Math.abs(e - prev), 2).replace('−', '') : ''}</td></tr>`; };
    const foot = mode === 'activity' ? `<tr class="tot"><td>Total</td>${INV_F.map(([k]) => `<td class="num" data-tot="${k}">${money(tot[k])}</td>`).join('')}<td class="num" data-tot="end">${money(totEnd, 2)}</td></tr>`
      : `<tr class="tot"><td>Total</td><td class="num muted">${money(sum(ks.map(a => prevEnd(dk(a), m))), 2)}</td><td class="num" data-tot="end">${money(totEnd, 2)}</td><td></td></tr>`;
    modal.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">${esc(parent.name)} · ${mLabel(m)}</h2><p class="muted" style="font-size:12.5px">${mode === 'activity' ? 'Enter each account’s activity with its sign (withdrawals, fees and losses negative). Ending = the sum of the row.' : 'Enter each account’s month-end balance.'} ${esc(parent.name)} becomes the total of the accounts below.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="seg" id="actMode" style="margin-bottom:12px"><button data-m="balance" class="${mode === 'balance' ? 'on' : ''}">Balances only</button><button data-m="activity" class="${mode === 'activity' ? 'on' : ''}">Full activity</button></div>
    ${ks.length ? `<div class="scroll-x"><table class="table inv-t">${head}${ks.map(row).join('')}${foot}</table></div>` : `<p class="muted" style="padding:10px 0">No underlying accounts yet. Add each account that makes up ${esc(parent.name)} below; from then on its balance is their total.</p>`}
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap"><span class="muted" style="font-size:12px">Add account:</span><input class="in sm" id="nkNm" placeholder="Name (e.g. Roth, Pre-tax, Rollover)" style="width:230px"><input class="in sm" id="nkL4" placeholder="Last 4 (optional)" maxlength="4" inputmode="numeric" style="width:130px;min-width:0"><button class="btn" id="nkAdd" style="height:30px">${icon('plus')}<span>Add</span></button>
      ${mode === 'activity' && ks.length ? `<button class="btn" id="nkCarry" style="height:30px;margin-left:auto">Starting = last month's ending</button>` : ''}</div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="actGo" ${ks.length ? '' : 'disabled style="opacity:.45"'}>Save ${mLabel(m)}</button></div>`;
    $$('#actMode button', modal).forEach(b => b.onclick = () => { mode = UI.subMode[parent.id] = b.dataset.m; draw(); });
    // recalc endings and totals without re-rendering, so the cursor and Tab order stay where the browser put them
    const refresh = () => { const ks2 = kids(), ends = ks2.map(a => endOf(draft[dk(a)]));
      ks2.forEach((a, k) => { const tr = $(`tr[data-key="${dk(a)}"]`, modal); if (!tr) return; const prev = prevEnd(dk(a), m), e = ends[k];
        const ec = $('[data-end]', tr); if (ec) ec.innerHTML = `<b>${money(e, 2)}</b>`;
        const cc = $('[data-chg]', tr); if (cc) { cc.className = 'num ' + (e - prev >= 0 ? 'pos' : 'neg'); cc.textContent = (draft[dk(a)]._set || ST.inv[dk(a)]?.[m]) && prev ? (e - prev >= 0 ? '+' : '−') + money(Math.abs(e - prev), 2).replace('−', '') : ''; } });
      INV_F.forEach(([k]) => { const c = $(`[data-tot="${k}"]`, modal); if (c) c.textContent = money(sum(ks2.map(a => +draft[dk(a)]?.[k] || 0))); });
      const te = $('[data-tot="end"]', modal); if (te) te.textContent = money(sum(ends), 2); };
    $$('tr[data-key]', modal).forEach(tr => { const r = draft[tr.dataset.key];
      $$('[data-f]', tr).forEach(inp => { inp.onfocus = () => inp.select(); inp.onchange = () => { const raw = inp.value.replace(/[$,\s]/g, ''); if (inp.dataset.f === 'end') { r.end = raw === '' ? undefined : +raw || 0; r._set = raw !== ''; } else r[inp.dataset.f] = +raw || 0;
        refresh(); };
        inp.onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); inp.onchange();       // Enter = same column, next account
          const col = $$(`[data-f="${inp.dataset.f}"]`, modal), k = col.indexOf(inp); (col[k + 1] || inp).focus(); }; }); });
    $$('[data-nick]', modal).forEach(inp => inp.onchange = () => { const a = ST.subAccts.find(x => (x.id || x.tmp) === inp.dataset.nick); a.nickname = inp.value.trim(); });
    $('#nkAdd').onclick = () => { const l4 = $('#nkL4').value.replace(/\D/g, '').slice(-4), nn = $('#nkNm').value.trim(); if (!l4 && !nn) return $('#nkNm').focus();
      if (kids().some(a => (l4 && a.last4 === l4) || (nn && (a.nickname || '').toLowerCase() === nn.toLowerCase()))) return toast('Already added');
      const a = {id: null, tmp: 't' + Date.now(), parent: parent.id, last4: l4, nickname: nn, active: true, sort: 950 + kids().length}; ST.subAccts.push(a); draft[a.tmp] = blank(a.tmp); draw(); };
    if ($('#nkCarry')) $('#nkCarry').onclick = () => { kids().forEach(a => { const key = dk(a); draft[key].start = prevEnd(key, m); }); draw(); };
    $('#actGo').onclick = () => {
      const ks = kids(); let tot = {start: 0, dep: 0, wd: 0, div: 0, xfer: 0, mkt: 0, fee: 0, end: 0};
      ks.forEach(a => { const key = dk(a), d = draft[key]; let r;
        if (mode === 'balance') { if (!d._set && !ST.inv[key]?.[m]) return; const start = prevEnd(key, m), end = +(+(d.end ?? start)).toFixed(2); r = {start, dep: 0, wd: 0, div: 0, xfer: 0, mkt: +(end - start).toFixed(2), fee: 0, end}; }
        else { r = {...d}; delete r._set; r.end = +invEnd(r).toFixed(2); }
        (ST.inv[key] ||= {})[m] = r; for (const k in tot) tot[k] += +r[k] || 0; });
      for (const k in tot) tot[k] = +tot[k].toFixed(2);
      (ST.inv[parent.id] ||= {})[m] = tot; parent.v[i] = tot.end; parent.rollup = true;
      if (CTX.SCH_ACCT === parent.name) { const row = {m, start: tot.start, dep: tot.dep + Math.max(0, tot.xfer), wd: tot.wd + Math.min(0, tot.xfer), div: tot.div, mkt: tot.mkt, fee: tot.fee, end: tot.end};
        const j = SCH.findIndex(r => r.m === m); if (j >= 0) SCH[j] = row; else { SCH.push(row); SCH.sort((a, b) => a.m.localeCompare(b.m)); } }
      closeAll(); render(); toast(`${parent.name} · ${mLabel(m)}: ${money(tot.end, 2)}`);
    };
  };
  draw(); openLayer('modal');
}

/* =====================================================================
   Investments · deposits vs. market gain
   Splits each month's balance change into money you put in (deposits, withdrawals,
   transfers) and true gain (market change + dividends − fees).
   Source per account-month: entered activity ("Full activity") when it has any flows,
   otherwise the plan's contribution estimate (401(k) + match, 529 monthly), otherwise none.
   ===================================================================== */
let FLOW_R = '12m';
function flowSplit(range = FLOW_R) {
  const months = BS.months, j1 = L;
  const j0 = range === 'ytd' ? Math.max(0, months.indexOf(`${months[j1].slice(0, 4)}-01`) - 1) : range === 'all' ? 0 : Math.max(0, j1 - (range === '3y' ? 36 : 12));
  const A = DATA.assume, contribMo = ((A.k401max || 0) + (A.employer || 0)) / 12, mo529 = A.college529Monthly || 0;
  const list = CTX.invAccts.filter(a => a.group !== 'College').map(a => ({id: a.id, k: a.k, n: a.n, group: a.group}))
    .concat(DATA.kids.map(k => ({id: k.key.split(':')[1], k: k.key, n: k.name + ' 529', group: 'College'})));
  const raw = id => { const b = ST.bal.accounts.find(x => x.id === id); return b ? m => { const j = ST.bal.months.indexOf(m); return j < 0 ? undefined : b.v[j]; } : () => undefined; };
  const isFlow = r => r && ['dep', 'wd', 'xfer', 'div', 'fee'].some(f => +r[f]);
  const monthly = months.slice(j0 + 1, j1 + 1).map(m => ({m, dep: 0, gain: 0}));
  const accts = list.map(a => {
    const s = BS[a.k] || [], rv = raw(a.id), est = a.k === CTX.contribKey ? contribMo : a.group === 'College' ? mo529 : 0;
    const o = {...a, start: s[j0] || 0, end: s[j1] || 0, dep: 0, gain: 0, nAct: 0, nEst: 0, nNone: 0, nInf: 0, est, g: 1};
    for (let j = j0 + 1; j <= j1; j++) {
      if (!s[j - 1]) { if (s[j]) o.start += s[j]; continue; }   // first tracked balance is a starting point, not a gain
      const m = months[j], chg = (s[j] || 0) - (s[j - 1] || 0), r = ST.inv[a.id]?.[m];
      let dep;
      if (isFlow(r)) { dep = (+r.dep || 0) + (+r.wd || 0) + (+r.xfer || 0); o.nAct++; }
      else if (est && rv(m) != null && (s[j - 1] || s[j])) { dep = est; o.nEst++; }
      else { dep = 0; if (chg) o.nNone++; }
      // no statement: a jump of more than 15% in a month (and over $2k) is a deposit / rollover / withdrawal, not the market
      if (!isFlow(r) && Math.abs(chg - dep) > Math.max(2000, .15 * s[j - 1])) { dep = chg; o.nInf++; }
      o.dep += dep; o.gain += chg - dep; const mm = monthly[j - j0 - 1]; mm.dep += dep; mm.gain += chg - dep; mm.base = (mm.base || 0) + (s[j - 1] || 0) + dep / 2;
      const base = (s[j - 1] || 0) + dep / 2; if (base > 0) o.g *= 1 + (chg - dep) / base;
    }
    o.ret = o.g - 1;   // time-weighted: each month's gain ÷ (prior balance + half that month's deposits), chained
    return o;
  }).filter(o => o.start || o.end);
  const T = {start: sum(accts.map(a => a.start)), end: sum(accts.map(a => a.end)), dep: sum(accts.map(a => a.dep)), gain: sum(accts.map(a => a.gain))};
  T.ret = monthly.reduce((g, r) => r.base > 0 ? g * (1 + r.gain / r.base) : g, 1) - 1;
  return {j0, j1, accts, T, monthly, contribMo, mo529};
}
function flowCard() {
  if (!CTX.invAccts.length) return '';
  const F = flowSplit(), sg = v => (v >= 0 ? '+' : '−') + short(Math.abs(v));
  const src = a => a.nAct && !a.nEst && !a.nNone ? '<span class="chip pos">Statements</span>'
    : a.nAct ? `<span class="chip">Statements ${a.nAct} mo · ${a.nEst ? 'est.' : 'balance-only'} ${a.nEst + a.nNone} mo</span>`
    : a.nEst ? `<span class="chip">Estimated · ${short(a.est)}/mo</span>` : '<span class="chip neg" title="No activity entered, so any deposits are counted as gain">Balances only</span>';
  const per = `${mLabel(BS.months[F.j0])} → ${mLabel(BS.months[F.j1])}`;
  return `<div class="card c-12" id="flowCard"><div class="card-h"><div><h3>Deposits vs. market gain</h3><div class="sub">Where the change in your invested balances came from · ${per}</div></div>
    <div class="right"><div class="seg" id="flowR">${[['12m', '12 mo'], ['ytd', 'YTD'], ['3y', '3 yr'], ['all', 'All']].map(([k, l]) => `<button data-k="${k}" class="${FLOW_R === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="stat-row" style="grid-template-columns:repeat(5,1fr);margin-bottom:14px">
      <div class="mini"><div class="l">Starting${F.accts.some(a => !BS[a.k][F.j0]) ? ' · or first tracked' : ''}</div><div class="v num">${short(F.T.start)}</div></div>
      <div class="mini"><div class="l">Net deposits</div><div class="v num">${sg(F.T.dep)}</div></div>
      <div class="mini"><div class="l">Market gain</div><div class="v num ${F.T.gain >= 0 ? 'pos' : 'neg'}">${sg(F.T.gain)}</div></div>
      <div class="mini"><div class="l">Ending</div><div class="v num">${short(F.T.end)}</div></div>
      <div class="mini"><div class="l">Return · time-weighted</div><div class="v num ${F.T.ret >= 0 ? 'pos' : 'neg'}">${pct(F.T.ret)}</div></div></div>
    <div class="chart" id="flowChart"></div><div class="legend"><span><i class="sw" style="background:var(--s2)"></i>Net deposits</span><span><i class="sw" style="background:var(--s1)"></i>Market gain</span></div>
    <div class="scroll-x" style="margin-top:10px"><table class="table cmp"><tr><th>Account</th><th>Starting</th><th>Net deposits</th><th>Market gain</th><th>Ending</th><th>Return</th><th>Split from</th></tr>
    ${F.accts.map(a => `<tr><td class="nowrap">${esc(a.n)}</td><td>${short(a.start)}</td><td>${sg(a.dep)}</td><td class="${a.gain >= 0 ? 'pos' : 'neg'}">${sg(a.gain)}</td><td>${short(a.end)}</td><td class="${a.ret >= 0 ? 'pos' : 'neg'}">${pct(a.ret)}</td><td>${src(a)}${a.nInf ? ` <span class="chip" title="Months where the balance jumped more than 15% with no activity entered — counted as money moved in or out">${a.nInf} jump${a.nInf > 1 ? 's' : ''} as deposits</span>` : ''}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td>${short(F.T.start)}</td><td>${sg(F.T.dep)}</td><td>${sg(F.T.gain)}</td><td>${short(F.T.end)}</td><td>${pct(F.T.ret)}</td><td></td></tr></table></div>
    <p class="muted" style="font-size:11.5px;margin-top:8px">Statements = months entered with Full activity on Balances. Estimated uses your plan settings (${short(F.contribMo)}/mo 401(k) incl. match, ${short(F.mo529)}/mo per 529). Balances only = no deposit data, so the change counts as gain — except a jump of more than 15% in one month, which is treated as money moved in or out. Enter Full activity on Balances for an exact split. Return is time-weighted, so deposits and withdrawals don’t distort it.</p></div>`;
}
function drawFlows() {
  const el = $('#flowChart'); if (!el) return;
  $$('#flowR button').forEach(b => b.onclick = () => { FLOW_R = b.dataset.k; render(); });
  const F = flowSplit();
  barChart(el, {labels: F.monthly.map(r => r.m), series: [{name: 'Net deposits', values: F.monthly.map(r => r.dep), color: 'var(--s2)'}, {name: 'Market gain', values: F.monthly.map(r => r.gain), colorFn: v => v >= 0 ? 'var(--s1)' : 'var(--neg)'}],
    height: 240, xGap: 56, xFmt: mShort, tipTitle: mLabel, tipFmt: v => (v >= 0 ? '+' : '−') + money(Math.abs(v)),
    tipExtra: i => tipRow(null, 'Total change', (F.monthly[i].dep + F.monthly[i].gain >= 0 ? '+' : '−') + money(Math.abs(F.monthly[i].dep + F.monthly[i].gain)))});
}
