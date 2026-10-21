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
const VS = {q: '', dir: 'out', xfer: false, lim: 80, sort: 'l12', cat: '*', sub: '*', collapsed: false, tog: new Set(), subOpen: new Set()};
function vendorStats() {   // name → {months: {ym: amt}, n12, last, cats, keys}
  const since = CTX.SINCE.slice(0, 7), out = {};
  const put = (name, k, m, amt, n, cat, d, sub) => {
    if (!VS.xfer && cat === 'TTS') return;
    if (ST.excl.has(cat || '') || (sub !== undefined && ST.exclSub.has((cat || '') + '|' + sub))) return;   // the top-bar “All categories” filter
    if (VS.cat !== '*' && (cat || '') !== VS.cat) return;
    if (VS.cat !== '*' && VS.sub !== '*' && (sub === undefined || (VS.sub === '__none' ? !!sub : sub !== VS.sub))) return;
    if (VS.dir === 'out' ? amt >= 0 : amt <= 0) return;
    const v = out[name] ||= {name, months: {}, cats: {}, keys: new Set(), n: {}, last: ''};
    v.months[m] = (v.months[m] || 0) + Math.abs(amt); v.n[m] = (v.n[m] || 0) + n; v.cats[cat || 'Uncategorized'] = (v.cats[cat || 'Uncategorized'] || 0) + Math.abs(amt);
    // per category › sub-category, so a vendor that spans several shows up under each with just its share (older summary rows have no sub-category)
    const ck = (cat || 'Uncategorized') + '|' + (sub === undefined ? '\u0000' : sub || ''), cs = (v.cs ||= {})[ck] ||= {cat: cat || 'Uncategorized', sub: sub === undefined ? null : sub || '', months: {}, n: {}};
    cs.months[m] = (cs.months[m] || 0) + Math.abs(amt); cs.n[m] = (cs.n[m] || 0) + n;
    if (k) v.keys.add(k); if (d && d > v.last) v.last = d; else if (!d && m + '-28' > v.last) v.last = v.last || m + '-15';
  };
  (D2.vendorMonthly || []).forEach(r => { if (r.m < since) put(vendorName(r.k), r.k, r.m, r.amt, r.n, r.cat, null); });
  ST.tx.forEach(t => { if (t.d.slice(0, 7) < since) return; const k = vendorKey(t.desc), nm = vendorName(k), m = t.d.slice(0, 7);
    pieces(t).forEach((p, i) => put(nm, k, m, p.amt, i ? 0 : 1, p.cat, t.d, p.sub || '')); });   // splits count toward each of their categories
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
    <select class="in sel" id="vCat" style="width:auto;max-width:200px"><option value="*">All categories</option>${ST.cats.filter(c => c.group !== 'TTS' || VS.xfer).map(c => `<option ${VS.cat === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    ${VS.cat !== '*' ? `<select class="in sel" id="vSub" style="width:auto;max-width:200px"><option value="*">All sub-categories</option>${(catOf(VS.cat)?.subs || []).map(x => typeof x === 'string' ? x : x.name).map(n => `<option ${VS.sub === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}<option value="__none" ${VS.sub === '__none' ? 'selected' : ''}>No sub-category</option></select>` : ''}
    <label class="tgl"><input type="checkbox" id="vX" ${VS.xfer ? 'checked' : ''}> Include transfers</label></div>
  ${exclBanner()}
  <div class="grid g-12">
    <div class="card c-4 kpi"><div class="label">${VS.dir === 'out' ? 'Spent' : 'Received'} · last 12 months</div><div class="val num">${short(tot)}</div><div class="delta">${active.length} vendors · ${mShort(m12[0])} – ${mShort(end)}</div></div>
    <div class="card c-4 kpi"><div class="label">Top vendor</div><div class="val num" style="font-size:22px">${top ? esc(top.name) : '—'}</div><div class="delta">${top ? short(top.l12) + ' · ' + top.c12 + ' transactions' : ''}</div></div>
    <div class="card c-4 kpi"><div class="label">Top 10 share</div><div class="val num">${tot ? Math.round(top10 / tot * 100) : 0}%</div><div class="delta">of the last 12 months</div></div>
    <div class="card c-12"><div class="card-h"><div><h3>Vendors</h3><div class="sub">Grouped from bank descriptions · tap one for history, or to rename or merge it${ST.excl.size ? ` · ${exclLabel()}` : ''}${VS.cat !== '*' ? ` · only ${esc(VS.cat || 'Uncategorized')}${VS.sub !== '*' ? ' · ' + esc(VS.sub === '__none' ? 'no sub-category' : VS.sub) : ''} spending${VS.sub !== '*' ? ` (sub-categories go back to ${mLabel(CTX.SINCE.slice(0, 7))})` : ''}` : ''}</div></div></div>
      ${vendorTree(rows, m12, p12)}
      ${rows.length > VS.lim ? `<div style="text-align:center;padding:12px"><button class="btn" id="vMore">Show ${Math.min(80, rows.length - VS.lim)} more vendors</button></div>` : ''}</div>
  </div>`;
  let qt; $('#vQ').oninput = e => { VS.q = e.target.value; clearTimeout(qt); qt = setTimeout(() => { const p = e.target.selectionStart; render(); const n = $('#vQ'); n.focus(); n.setSelectionRange(p, p); }, 250); };
  $$('#vDir button').forEach(b => b.onclick = () => { VS.dir = b.dataset.d; render(); });

  $('#vX').onchange = e => { VS.xfer = e.target.checked; render(); };
  $('#vCat').onchange = e => { VS.cat = e.target.value; VS.sub = '*'; render(); };
  if ($('#vSub')) $('#vSub').onchange = e => { VS.sub = e.target.value; render(); };
  $$('[data-vt]', pg).forEach(el => el.onclick = e => { e.stopPropagation(); const k = el.dataset.vt; VS.tog.has(k) ? VS.tog.delete(k) : VS.tog.add(k); render(); });
  $$('[data-vs]', pg).forEach(tr => tr.onclick = () => { const k = tr.dataset.vs; VS.subOpen.has(k) ? VS.subOpen.delete(k) : VS.subOpen.add(k); render(); });
  if ($('#vtAll')) $('#vtAll').onclick = () => { VS.collapsed = !VS.collapsed; VS.tog.clear(); render(); };
  if ($('#vtSubs')) $('#vtSubs').onclick = () => { const ks = [...pg.querySelectorAll('[data-vs]')].map(x => x.dataset.vs), all = ks.length && ks.every(k => VS.subOpen.has(k)); ks.forEach(k => all ? VS.subOpen.delete(k) : VS.subOpen.add(k)); render(); };
  $$('.srt', pg).forEach(b => b.onclick = e => { e.stopPropagation(); VS.sort = b.dataset.s; render(); });
  if ($('#vMore')) $('#vMore').onclick = () => { VS.lim += 80; render(); };
  $$('tr[data-v]', pg).forEach(tr => tr.onclick = () => openVendor(tr.dataset.v));
}
// Vendor › Category › Sub-category. Vendors show their categories by default (collapse with the caret, or all at once);
// a category with sub-categories opens on click. Sorted by the column you pick — last 12 months, high to low, by default.
function vendorTree(rows, m12, p12) {
  const sumM = (o, ms) => sum(ms.map(m => o[m] || 0)), out = VS.dir === 'out';
  const srt = a => a.sort((x, y) => VS.sort === 'chg' ? Math.abs(y.l12 - y.p12) - Math.abs(x.l12 - x.p12) : VS.sort === 'n' ? y.n - x.n : VS.sort === 'name' ? x.name.localeCompare(y.name) : y.l12 - x.l12 || y.p12 - x.p12);
  const node = (name, cs) => { const o = {name, l12: 0, p12: 0, n: 0, spark: m12.map(() => 0)}; cs.forEach(c => { o.l12 += sumM(c.months, m12); o.p12 += sumM(c.months, p12); o.n += sumM(c.n, m12); m12.forEach((m, i) => o.spark[i] += c.months[m] || 0); }); return o; };
  const chg = x => `<td class="${!x.p12 ? 'muted' : (x.l12 - x.p12 > 0) === out ? 'neg' : 'pos'}">${!x.p12 ? (x.l12 ? 'new' : '—') : (x.l12 - x.p12 >= 0 ? '+' : '−') + short(Math.abs(x.l12 - x.p12))}</td>`;
  const cells = (x, lvl) => `<td>${lvl ? money(x.l12) : `<b>${money(x.l12)}</b>`}</td><td class="hide-sm muted">${money(x.p12)}</td>${chg(x)}<td>${x.n || ''}</td><td class="hide-sm" style="width:110px">${spark(x.spark, lvl ? 'var(--text-3)' : 'var(--s2)', 96, lvl ? 18 : 24, false)}</td>`;
  const body = rows.slice(0, VS.lim).map(v => {
    const cs = Object.values(v.cs || {}), byCat = {}; cs.forEach(c => (byCat[c.cat] ||= []).push(c));
    const cats = srt(Object.entries(byCat).map(([c, list]) => ({...node(c, list), list}))).filter(c => c.l12 || c.p12);
    const open = VS.collapsed ? VS.tog.has(v.name) : !VS.tog.has(v.name), tot = v.l12 || 1;
    let h = `<tr class="click vt-v" data-v="${esc(v.name)}"><td><span class="vg-c" data-vt="${esc(v.name)}" title="${open ? 'Hide' : 'Show'} categories">${cats.length ? (open ? '▾' : '▸') : ''}</span><b class="nm">${esc(v.name)}</b>${cats.length > 1 ? ` <span class="chip vt-n">${cats.length} categories</span>` : ''}</td>${cells({...v, n: v.c12, spark: m12.map(m => v.months[m] || 0)}, 0)}</tr>`;
    if (!open) return h;
    cats.forEach(c => {
      const subs = srt(Object.values(c.list.reduce((o, x) => { const k = x.sub === null ? '(older history)' : x.sub || 'No sub-category'; (o[k] ||= []).push(x); return o; }, {})).map(list => node(list[0].sub === null ? '(older history)' : list[0].sub || 'No sub-category', list))).filter(x => x.l12 || x.p12);
      const real = subs.filter(x => x.name !== '(older history)'), canOpen = real.length > 1 || (real[0] && real[0].name !== 'No sub-category');
      const sk = v.name + '|' + c.name, so = VS.subOpen.has(sk);
      h += `<tr class="vt-c ${canOpen ? 'click' : ''}" ${canOpen ? `data-vs="${esc(sk)}"` : ''}><td style="padding-left:24px"><span class="vg-c">${canOpen ? (so ? '▾' : '▸') : ''}</span>${esc(c.name)}${v.l12 ? ` <span class="muted" style="font-size:11.5px">· ${Math.round(c.l12 / tot * 100)}%</span>` : ''}</td>${cells(c, 1)}</tr>`;
      if (canOpen && so) h += subs.map(x => `<tr class="vt-s"><td style="padding-left:58px">${esc(x.name)}</td>${cells(x, 2)}</tr>`).join('');
    });
    return h; }).join('');
  const th = (k, l) => `<th><button class="link srt ${VS.sort === k ? 'on' : ''}" data-s="${k}">${l}</button></th>`;
  return `<div class="vt-tools"><button class="link" id="vtAll">${VS.collapsed ? 'Show all categories' : 'Vendors only'}</button><button class="link" id="vtSubs">Open / close sub-categories</button></div>
    <div class="scroll-x"><table class="table vt vtree"><tr>${th('name', 'Vendor › category › sub-category')}${th('l12', 'Last 12 mo')}<th class="hide-sm">Prior 12 mo</th>${th('chg', 'Change')}${th('n', 'Txns')}<th class="hide-sm">Trend</th></tr>${body}</table></div>
    <p class="muted" style="font-size:11.5px;margin-top:8px">Tap a vendor for its history, or to rename or merge it · tap a category to see its sub-categories. Split transactions count toward each of their categories. “Older history” is spending before ${mLabel(CTX.SINCE.slice(0, 7))}, stored by category only.</p>`;
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
    <h4 class="h4" style="margin-top:16px">Categories · all history</h4>${cats.map(([c, a]) => { const subs = Object.values(v.cs || {}).filter(x => x.cat === c && x.sub !== null).map(x => [x.sub || 'No sub-category', sum(Object.values(x.months))]).filter(x => x[1] > .5).sort((p, q) => q[1] - p[1]);
      return `<div class="ex-row"><span>${esc(c)}</span><b>${money(a)} <span class="muted" style="font-weight:500">${Math.round(a / cTot * 100)}%</span></b></div>${subs.length > 1 || (subs[0] && subs[0][0] !== 'No sub-category') ? subs.map(([n, x]) => `<div class="ex-row vd-sub"><span>› ${esc(n)}</span><b class="muted" style="font-weight:500">${money(x)}</b></div>`).join('') : ''}`; }).join('')}
    ${CTX.CAN_WRITE ? `<h4 class="h4" style="margin-top:16px">Rename or merge</h4><div class="form" style="grid-template-columns:1fr auto"><div><input class="in" id="vRen" list="vNames" value="${esc(name)}"><datalist id="vNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div><button class="btn primary" id="vRenGo">Save</button></div>
      <p class="muted" style="font-size:11.5px;margin-top:6px">Pick an existing vendor to merge into it. Applies to all history and future imports. Raw keys: ${[...v.keys].slice(0, 6).map(esc).join(', ')}${v.keys.size > 6 ? '…' : ''}</p>` : ''}
    <h4 class="h4" style="margin-top:16px">Recent transactions</h4><div class="list" id="vList">${txs.map(t => txLi(t)).join('') || '<p class="muted">None in the loaded history.</p>'}</div>
    <button class="btn" id="vAll" style="margin-top:10px">${icon('tx')}<span>See all in Transactions</span></button>`;
  openLayer('drawer');
  $$('#vList .li').forEach(li => li.onclick = () => openTxEdit(li.dataset.id));
  $('#vAll').onclick = () => { TXF.vendor = name; TXF.cat = '*'; TXF.sub = '*'; TXF.month = ''; go('tx'); };
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
// Recurring items found in the transactions that aren't on the cash plan yet:
//  · weekly / every-2-weeks / twice-a-month (paychecks, allowances) from the spacing of charges
//  · monthly bills by month: present nearly every month, usually once or twice (or a fixed number of times),
//    amounts steady — or allowed to vary for real bills (utilities, cards) but not for everyday shopping
//  · quarterly and yearly charges (insurance, memberships) from charges ~3 or ~12 months apart at similar amounts
function suggestRecurring() {
  const lastD = ST.tx.reduce((m, t) => t.d > m ? t.d : m, '') || CTX.TODAY, lastM = lastD.slice(0, 7), from = ymAdd(lastM, -14) + '-01';
  const have = new Set(ST.cash.flatMap(c => [(c.vendor || '').toLowerCase(), c.name.toLowerCase()]).filter(Boolean));
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const cv = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return m ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / m : 0; };
  const everyday = c => /eating out|grocer|cloth|groom|entertain|car wash|^other$|amazon|shopping|gifts?|gas$|fuel|coffee|vacation|travel|medical/i.test(c || '');
  const retail = n => /lowe'?s|home depot|walmart|target|costco|sam'?s club|hobby lobby|kohl|old navy|tj ?maxx|dollar|goodwill|7-eleven|oncue|phillips|qt\b|quiktrip|sonic|chick|mcdonald|starbucks|donut|amazon/i.test(n);
  const months12 = Array.from({length: 12}, (_, i) => ymAdd(lastM, i - 11));
  const groups = {};
  ST.tx.forEach(t => { if (t.d < from || !t.amt) return; const c = t.splits ? t.splits[0].cat : t.cat, n = vName(t.desc); if (!n) return;
    const k = n + '|' + (t.amt > 0 ? 1 : -1); (groups[k] ||= {name: n, sign: t.amt > 0 ? 1 : -1, rows: [], cats: {}}).rows.push(t); groups[k].cats[c || ''] = (groups[k].cats[c || ''] || 0) + 1; });
  const out = [], months6 = Array.from({length: 6}, (_, i) => ymAdd(lastM, i - 5)), stale = (d, days) => dAdd(d, days) < lastD;
  const nextMonthly = (day, step = 1) => { let m = lastM, d; do { m = ymAdd(m, step); d = mDay(+m.slice(0, 4), +m.slice(5), day); } while (d < CTX.TODAY); return d; };
  Object.values(groups).forEach(g => {
    if (have.has(g.name.toLowerCase())) return;
    const cat = Object.entries(g.cats).sort((a, b) => b[1] - a[1])[0][0];
    let rows = g.rows.slice().sort((a, b) => a.d.localeCompare(b.d));
    // A) steady series: the same amount around the same day each month (a vendor can have several, e.g. one 529 deposit per child)
    if (g.sign < 0) {
      const byAmt = {}; rows.forEach(t => (byAmt[Math.abs(t.amt).toFixed(2)] ||= []).push(t));
      const series = [];
      Object.entries(byAmt).forEach(([a, ts]) => { if (ts.length < 4 || +a < 5) return;
        const bins = []; ts.slice().sort((x, y) => +x.d.slice(8) - +y.d.slice(8)).forEach(t => { const d = +t.d.slice(8), b = bins.find(b => Math.abs(b.c - d) <= 3 || Math.abs(b.c - d) >= 27); if (b) { b.ts.push(t); b.c = med(b.ts.map(x => +x.d.slice(8))); } else bins.push({c: d, ts: [t]}); });
        bins.forEach(b => { const ms = new Set(b.ts.map(t => t.d.slice(0, 7))), in12 = months12.filter(m => ms.has(m)).length, lastT = b.ts.map(t => t.d).sort().pop();
          if (in12 >= 4 && b.ts.length <= ms.size + 1 && (ms.has(lastM) || ms.has(ymAdd(lastM, -1))) && !stale(lastT, 45)) series.push({a: +a, day: b.c, ts: b.ts, n: ms.size}); }); });
      if (series.length) {
        const kindS = /netflix|spotify|apple\.com|icloud|youtube|disney|hulu|max|prime|peacock|paramount|espn|adobe|starz|ring|quip|ww int/i.test(g.name) ? 'subscription' : cat === 'TTS' || /contrib|529|savings|transfer/i.test(g.name + ' ' + cat) ? 'transfer' : 'bill';
        const ord = d => d + (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');
        series.sort((x, y) => x.day - y.day).forEach(se => out.push({name: series.length > 1 ? `${g.name} · ${ord(se.day)}` : g.name, vendor: g.name, kind: kindS, amount: -se.a, freq: 'monthly', start: nextMonthly(se.day), day2: null, cat, n: se.ts.length, note: ''}));
        const used = new Set(series.flatMap(se => se.ts)); rows = rows.filter(t => !used.has(t));
        if (rows.length < 3) return;
      }
    }
    const ds = rows.map(t => t.d), last = ds[ds.length - 1];
    const amts = rows.map(t => Math.abs(t.amt)), ma = med(amts); if (ma < 3) return;
    const byM = {}; rows.forEach(t => { const m = t.d.slice(0, 7), o = (byM[m] ||= {s: 0, n: 0, days: []}); o.s += Math.abs(t.amt); o.n++; o.days.push(+t.d.slice(8)); });
    const kind = g.sign > 0 ? 'income' : cat === 'TTS' || /quicksave|transfer|contrib|529|savings/i.test(g.name + ' ' + cat) ? 'transfer'
      : (/netflix|spotify|apple\.com|icloud|youtube|disney|hulu|max|prime|peacock|paramount|espn|adobe|starz|ring|quip|ww int/i.test(g.name) || /netflix|disney|stream|subscri/i.test(cat)) && ma < 150 ? 'subscription' : 'bill';
    const push = (freq, amount, start, note, day2 = null) => out.push({name: g.name, vendor: g.name, kind, amount: +(g.sign * amount).toFixed(2), freq, start, day2, cat, n: rows.length, note});
    // 1) fast cadences (paychecks etc.) from spacing
    const gaps = ds.slice(1).map((d, i) => (new Date(d) - new Date(ds[i])) / 864e5).filter(x => x > 0), gp = med(gaps), steady = amts.filter(a => Math.abs(a - ma) <= Math.max(2, ma * .25)).length / amts.length >= .7;
    const spread = med(Object.values(byM).map(o => Math.max(...o.days) - Math.min(...o.days)));   // same-day batches (e.g. one 529 deposit per child) aren't a weekly cadence
    if (steady && gp >= 5 && gp <= 17 && rows.length >= 6 && spread >= 8 && !stale(last, 21)) {
      let freq = gp <= 9 ? 'weekly' : 'biweekly';
      const dom = [...new Set(ds.slice(-8).map(d => +d.slice(8)))];
      if (freq === 'biweekly' && dom.length <= 7 && dom.every(x => x <= 2 || (x >= 13 && x <= 17) || x >= 27)) freq = 'semimonthly';
      if (!(everyday(cat) && freq === 'weekly' && cv(amts) > .1)) {
        if (freq === 'semimonthly') push(freq, ma, mDay(+CTX.TODAY.slice(0, 4), +CTX.TODAY.slice(5, 7), med(ds.map(d => +d.slice(8)).filter(x => x < 20)) || 1), '', dom.some(x => x >= 27) ? 31 : 15);
        else { let nx = dAdd(last, freq === 'weekly' ? 7 : 14); while (nx < CTX.TODAY) nx = dAdd(nx, freq === 'weekly' ? 7 : 14); push(freq, ma, nx, ''); }
        return;
      }
    }
    // 2) monthly by month presence
    if (retail(g.name)) return;
    const first = ds[0].slice(0, 7), span = months12.filter(m => m >= first), present = span.filter(m => byM[m]);
    const counts = present.map(m => byM[m].n), perM = med(counts), sameCount = counts.filter(c => c === perM).length / Math.max(1, counts.length) >= .8;
    const tot = present.map(m => byM[m].s), mcv = cv(tot);
    if (span.length >= 3 && present.length >= Math.max(3, Math.ceil(span.length * .75)) && (byM[lastM] || byM[ymAdd(lastM, -1)])) {
      const isCard = /card|credit/i.test(cat + ' ' + g.name);
      const okCount = perM <= 2 || (isCard && perM <= 5) || (sameCount && mcv <= .15);
      const okAmt = isCard ? true : everyday(cat) ? mcv <= .2 && perM <= 1 : mcv <= .9;
      if (okCount && okAmt && !stale(last, 45)) {
        const recent = present.slice(-3).map(m => byM[m].s), amount = med(recent), day = med(rows.slice(-3).map(t => +t.d.slice(8)));
        push('monthly', amount, nextMonthly(day), mcv > .15 ? `varies · ${money(Math.min(...tot))}–${money(Math.max(...tot))}` : ''); return;
      }
    }
    // 3) quarterly / yearly (charges ~3 or ~12 months apart at similar amounts)
    if (everyday(cat) && cv(amts) > .1) return;
    const mgaps = ds.slice(1).map((d, i) => ymDiffN(ds[i].slice(0, 7), d.slice(0, 7))), simAmt = cv(amts.slice(-3)) <= .2;
    if (rows.length >= 3 && simAmt && mgaps.slice(-2).every(x => x >= 2 && x <= 4) && !stale(last, 120)) { push('quarterly', med(amts.slice(-3)), nextMonthly(+last.slice(8), 3), ''); return; }
    if (rows.length >= 2 && rows.length <= 3 && ma >= 30 && simAmt && mgaps.slice(-1).every(x => x >= 11 && x <= 13) && !stale(last, 400)) {
      let m = ymAdd(last.slice(0, 7), 12); const d = mDay(+m.slice(0, 4), +m.slice(5), +last.slice(8)); push('annual', amts[amts.length - 1], d, `last ${mLabel(last.slice(0, 7))}`);
    }
  });
  return out.sort((a, b) => Math.abs(b.amount) * (b.freq === 'annual' ? 1 / 12 : b.freq === 'quarterly' ? 1 / 3 : 1) - Math.abs(a.amount) * (a.freq === 'annual' ? 1 / 12 : a.freq === 'quarterly' ? 1 / 3 : 1));
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
    ${sugg.length ? `<div class="card c-12"><div class="card-h"><div><h3>Suggested from your transactions</h3><div class="sub">Monthly, quarterly and yearly charges and deposits found in the last 14 months · amounts that vary use the recent typical month · add the ones that belong in the plan</div></div><div class="right"><button class="btn" id="cpAddAll">Add all ${sugg.length}</button></div></div>
      <div class="list">${sugg.slice(0, 30).map((s, k) => `<div class="li"><div style="min-width:0;flex:1"><div class="nm ell">${esc(s.name)}</div><div class="ds">${FREQ[s.freq]} · next ${fmtDate(s.start)} · ${({income: 'Income', bill: 'Bill', subscription: 'Subscription', transfer: 'Transfer'})[s.kind]} · seen ${s.n}×${s.note ? ' · ' + esc(s.note) : ''}</div></div><div class="amt num ${s.amount > 0 ? 'pos' : ''}">${money(s.amount, 2)}</div><button class="btn" style="height:30px;margin-left:10px" data-sg="${k}">Add</button></div>`).join('')}</div></div>` : ''}
  </div>`;
  $$('[data-ci]', pg).forEach(tr => tr.onclick = () => openCashItem(ST.cash.find(c => c.id === tr.dataset.ci)));
  if ($('#cpAdd')) $('#cpAdd').onclick = () => openCashItem();
  $('#cpStart').onclick = openCashStart;
  $$('[data-sg]', pg).forEach(b => b.onclick = () => openCashItem(null, sugg[+b.dataset.sg]));
  if ($('#cpAddAll')) $('#cpAddAll').onclick = () => { const add = sugg.map((s, k) => ({id: 'c' + Date.now() + k, active: true, sort: 100, end: null, acct: '', ...s, notes: s.note || ''})); add.forEach(a => { delete a.n; delete a.note; }); ST.cash.push(...add); render(); toast(`Added ${add.length} items`, () => { ST.cash = ST.cash.filter(c => !add.includes(c)); render(); }); };
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
    <div class="scroll-x" style="margin-top:4px"><table class="table cmp"><tr><th>Account</th><th>Starting</th><th>Net deposits</th><th>Market gain</th><th>Ending</th><th>Return</th><th>Split from</th></tr>
    ${F.accts.map(a => `<tr><td class="nowrap">${esc(a.n)}</td><td>${short(a.start)}</td><td>${sg(a.dep)}</td><td class="${a.gain >= 0 ? 'pos' : 'neg'}">${sg(a.gain)}</td><td>${short(a.end)}</td><td class="${a.ret >= 0 ? 'pos' : 'neg'}">${pct(a.ret)}</td><td>${src(a)}${a.nInf ? ` <span class="chip" title="Months where the balance jumped more than 15% with no activity entered — counted as money moved in or out">${a.nInf} jump${a.nInf > 1 ? 's' : ''} as deposits</span>` : ''}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td>${short(F.T.start)}</td><td>${sg(F.T.dep)}</td><td>${sg(F.T.gain)}</td><td>${short(F.T.end)}</td><td>${pct(F.T.ret)}</td><td></td></tr></table></div>
    <p class="muted" style="font-size:11.5px;margin-top:8px">Statements = months entered with Full activity on Balances. Estimated uses your plan settings (${short(F.contribMo)}/mo 401(k) incl. match, ${short(F.mo529)}/mo per 529). Balances only = no deposit data, so the change counts as gain — except a jump of more than 15% in one month, which is treated as money moved in or out. Enter Full activity on Balances for an exact split. Return is time-weighted, so deposits and withdrawals don’t distort it.</p></div>`;
}
function drawFlows() {
  $$('#flowR button').forEach(b => b.onclick = () => { FLOW_R = b.dataset.k; render(); });
  const el = $('#flowChart'); if (!el) return;   // the chart was dropped from the card (v52); tiles and table stay
  const F = flowSplit();
  barChart(el, {labels: F.monthly.map(r => r.m), series: [{name: 'Net deposits', values: F.monthly.map(r => r.dep), color: 'var(--s2)'}, {name: 'Market gain', values: F.monthly.map(r => r.gain), colorFn: v => v >= 0 ? 'var(--s1)' : 'var(--neg)'}],
    height: 240, xGap: 56, xFmt: mShort, tipTitle: mLabel, tipFmt: v => (v >= 0 ? '+' : '−') + money(Math.abs(v)),
    tipExtra: i => tipRow(null, 'Total change', (F.monthly[i].dep + F.monthly[i].gain >= 0 ? '+' : '−') + money(Math.abs(F.monthly[i].dep + F.monthly[i].gain)))});
}

/* =====================================================================
   College savings · 529s — rolled up and by child, with a child filter,
   a projection through college, start markers and 4 years of semester draws.
   The draw plan is household data: households.settings.college_plan
     {draws: bool, rate: 0.045, kids: {Name: {on: bool, per: 15000, sem: {'2036-08': 16000, ...}}}}
   ===================================================================== */
const KID_COL = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
let COL_RANGE = '3y';
const COLP = () => { const p = (CTX.settings.college_plan ||= {}); p.kids ||= {}; if (p.draws == null) p.draws = true; if (p.rate == null) p.rate = .045; return p; };
const colHidden = () => new Set(UI.colHide || []);
const colSems = k => { const o = []; for (let t = 0; t < 4; t++) o.push({m: `${k.y18 + t}-08`, l: `Fall ’${String(k.y18 + t).slice(2)}`, y: t + 1, f: 1}, {m: `${k.y18 + t + 1}-01`, l: `Spring ’${String(k.y18 + t + 1).slice(2)}`, y: t + 1, f: 0}); return o; };
const kidPlan = k => { const p = COLP().kids[k.name] || {}; return {on: p.on !== false, per: p.per ?? Math.round(DATA.assume.collegeTarget / 8 / 100) * 100, sem: p.sem || {}}; };
const kidDraw = (k, m) => { const p = kidPlan(k); if (!COLP().draws || !p.on || !colSems(k).some(s => s.m === m)) return 0; return +(p.sem[m] ?? p.per) || 0; };
function colProject(k) {
  const P = COLP(), r = (+P.rate || 0) / 12, mo = DATA.assume.college529Monthly || 0, start = `${k.y18}-08`, sems = colSems(k), last = sems[7].m;
  const months = ymRange(BS.months[L], ymPlus(last, 4)), val = {}, after = {};
  let bal = BS[k.key]?.[L] || 0, atStart = null, drawn = 0, end = null, firstShort = null;
  months.forEach((m, i) => {
    if (i) { bal *= 1 + r; if (m < start) bal += mo; }
    if (m === start) atStart = bal;
    const d = kidDraw(k, m); if (d) { bal -= d; drawn += d; after[m] = bal; if (bal < 0 && !firstShort) firstShort = m; }
    if (m === last) end = bal;
    val[m] = bal;
  });
  if (atStart == null) atStart = BS[k.key]?.[L] || 0;   // already in college
  const n = Math.max(0, ymDiffN(BS.months[L], start)), kk = ymDiffN(start, last), g = Math.pow(1 + r, n), ann = r ? (g - 1) / r : n;
  let extra = 0;
  if (COLP().draws && kidPlan(k).on && drawn) { if (end < 0 && n > 0) extra = Math.ceil(-end / (ann * Math.pow(1 + r, kk)) / 5) * 5; }
  else if (n > 0 && atStart < DATA.assume.collegeTarget) extra = Math.ceil((DATA.assume.collegeTarget - atStart) / ann / 5) * 5;
  const covered = drawn ? Math.max(0, Math.min(1, (drawn + Math.min(0, end)) / drawn)) : Math.min(1, atStart / DATA.assume.collegeTarget);
  return {months, val, after, atStart, drawn, end, firstShort, extra, covered, start, last, n};
}
let colSaveT = null;
function saveColPlan() {
  if (!CTX.CAN_WRITE) return;
  clearTimeout(colSaveT);
  colSaveT = setTimeout(async () => {
    const {error} = await FDB.rpc('set_household_setting', {p_household: CTX.HH, p_key: 'college_plan', p_value: COLP()});
    if (error) toast('Couldn’t save the college plan: ' + error.message);
  }, 600);
}
// redraw the page but keep the cursor in the same input (so Tab / Enter keep flowing)
function renderKeep() { setTimeout(() => { const f = document.activeElement, k = f?.dataset?.cd; render(); if (k) { const n = $(`[data-cd="${k}"]`); if (n) { n.focus(); n.select?.(); } } }, 0); }

function collegeSection(kidsAll, target, mo529) {
  if (!kidsAll.length && !BS.college[L]) return '';
  const hid = colHidden(), kids = kidsAll.filter(k => !hid.has(k.name)), P = COLP();
  kids.forEach(k => k.cp = colProject(k));
  const KC = k => KID_COL[kidsAll.indexOf(k) % 5];
  const series = j => sum(kids.map(k => BS[k.key]?.[j] || 0));
  const tot = series(L), y1 = series(i12), ydec = series(iDecPY);
  const first = kids.slice().sort((a, b) => a.y18 - b.y18)[0];
  const sumStart = sum(kids.map(k => k.cp.atStart)), sumDraw = sum(kids.map(k => k.cp.drawn)), sumEnd = sum(kids.map(k => k.cp.end)), need = sum(kids.map(k => k.cp.extra));
  const drawsOn = P.draws && kids.some(k => kidPlan(k).on);
  const chips = kidsAll.map(k => `<button class="kchip ${hid.has(k.name) ? 'off' : ''}" data-kid="${esc(k.name)}" title="Show / hide ${esc(k.name)}"><i class="sw" style="background:${KC(k)}"></i>${esc(k.name)}</button>`).join('');
  const sg = v => (v >= 0 ? '' : '−') + short(Math.abs(v));
  return `<div class="card c-8" id="colCard"><div class="card-h"><div><h3>College savings · 529s</h3><div class="sub">${kids.length === kidsAll.length ? `All ${kids.length} plans` : `${kids.length} of ${kidsAll.length} plans`} rolled up · actual, then projected at ${(P.rate * 100).toFixed(1)}%/yr${drawsOn ? ' with semester draws' : ''}</div></div>
      <div class="right" style="display:flex;gap:8px;align-items:center">${CTX.CAN_WRITE ? `<button class="btn" id="kidsBtn" style="height:32px">${icon('edit')}<span>Children</span></button>` : ''}<div class="seg" id="colR">${[['1y', '1Y'], ['3y', '3Y'], ['all', 'All']].map(([k, l]) => `<button data-k="${k}" class="${COL_RANGE === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
      <div class="kchips">${chips}<span style="flex:1"></span><label class="tgl"><input type="checkbox" id="colProj" ${UI.colProj !== false ? 'checked' : ''}> Project through college</label><label class="tgl"><input type="checkbox" id="colDraws" ${P.draws ? 'checked' : ''} ${CTX.CAN_WRITE ? '' : 'disabled'}> Include draws</label></div>
      <div class="stat-row" style="grid-template-columns:repeat(4,1fr);margin:12px 0 14px">
        <div class="mini"><div class="l">Total today</div><div class="v num">${short(tot)}</div><div class="ds" style="font-size:11px;color:var(--text-3)">${chip(nz((tot - y1) / y1))} 12 mo · ${tot - ydec >= 0 ? '+' : '−'}${short(Math.abs(tot - ydec))} since Dec</div></div>
        <div class="mini"><div class="l">Projected at college start</div><div class="v num">${short(sumStart)}</div><div class="ds" style="font-size:11px;color:var(--text-3)">target ${short(target * kids.length)}</div></div>
        <div class="mini"><div class="l">${drawsOn ? '4-year draws' : 'First starts'}</div><div class="v num" ${drawsOn ? '' : 'style="font-size:16px"'}>${drawsOn ? short(sumDraw) : first ? esc(first.name) + ' · ' + first.y18 : '—'}</div><div class="ds" style="font-size:11px;color:var(--text-3)">${drawsOn ? `${kids.filter(k => kidPlan(k).on).length} child${kids.filter(k => kidPlan(k).on).length === 1 ? '' : 'ren'} · 8 semesters each` : first ? first.yrsLeft.toFixed(1) + ' yrs' : ''}</div></div>
        <div class="mini"><div class="l">${drawsOn ? 'Left after college' : 'Extra / mo to hit target'}</div><div class="v num ${drawsOn ? (sumEnd >= 0 ? 'pos' : 'neg') : ''}">${drawsOn ? sg(sumEnd) : need ? money(need) : 'On track'}</div><div class="ds" style="font-size:11px;color:var(--text-3)">${drawsOn ? (need ? `+${money(need)}/mo closes the gap` : 'every draw covered') : `${money(mo529)}/mo each now`}</div></div></div>
      <div class="chart" id="colChart"></div><div class="legend"><span><i class="sw" style="background:var(--text-2)"></i>${kids.length === kidsAll.length ? 'All 529s' : 'Selected'}</span>${kids.map(k => `<span><i class="sw" style="background:${KC(k)}"></i>${esc(k.name)}</span>`).join('')}${UI.colProj !== false ? '<span><i class="sw dash"></i>Projected</span><span><i class="sw" style="border-radius:50%;background:var(--text-2)"></i>College starts (Aug)</span>' : ''}</div></div>
    <div class="card c-4"><div class="card-h"><div><h3>By child</h3><div class="sub">Last 24 months · ${money(mo529)}/mo each until college</div></div></div>
      <div class="list">${kids.map(k => { const v = (BS[k.key] || []).slice(-24), ch = v.length > 12 && v[v.length - 13] ? (v[v.length - 1] - v[v.length - 13]) / v[v.length - 13] : 0;
        return `<div class="li"><div style="min-width:0"><div class="nm">${esc(k.name)}</div><div class="ds">College ${k.y18} · ${k.yrsLeft.toFixed(1)} yrs</div></div><div style="margin-left:auto">${spark(v, KC(k), 64, 26, false)}</div><div class="amt num" style="margin-left:12px;min-width:72px">${short(k.bal)}<div style="font-size:11px">${chip(ch)}</div></div></div>`; }).join('') || '<p class="muted" style="padding:8px 0">Every child is filtered out — tap a name above.</p>'}</div>
      <div class="ex-row" style="margin-top:6px"><span>Total</span><b>${short(tot)}</b></div></div>
    <div class="card c-12"><div class="card-h"><div><h3>College projections by child</h3><div class="sub">${(P.rate * 100).toFixed(1)}% a year plus ${money(mo529)}/mo until August of the year they turn 18${drawsOn ? ', then each semester’s draw' : ` · target ${short(target)} each`}</div></div></div>
      <div class="scroll-x"><table class="table cmp"><tr><th>Child</th><th>Today</th><th>Starts</th><th>Years left</th><th>At start</th><th>4-yr draws</th><th>Left after</th><th>${drawsOn ? 'Draws covered' : 'Funded'}</th><th>Extra / mo to close gap</th></tr>
      ${kids.map(k => { const c = k.cp, on = drawsOn && kidPlan(k).on; return `<tr><td><span class="tw"><i class="sw" style="background:${KC(k)}"></i>${esc(k.name)}</span></td><td>${short(k.bal)}</td><td>${startSel(k)}</td><td>${k.yrsLeft.toFixed(1)}</td><td><b>${short(c.atStart)}</b></td>
        <td>${on ? short(c.drawn) : '<span class="muted">off</span>'}</td><td class="${on ? (c.end >= 0 ? 'pos' : 'neg') : 'muted'}">${on ? sg(c.end) + (c.firstShort ? `<div class="muted" style="font-size:11px">runs out ${mLabel(c.firstShort)}</div>` : '') : '—'}</td>
        <td style="min-width:110px"><div style="display:flex;align-items:center;gap:8px"><div class="pbar" style="flex:1;height:6px"><i style="width:${c.covered * 100}%;background:${KC(k)}"></i></div><span class="muted num" style="font-size:11.5px">${Math.round(c.covered * 100)}%</span></div></td>
        <td class="${c.extra ? '' : 'pos'}">${c.extra ? money(c.extra) : 'On track'}</td></tr>`; }).join('')}
      <tr class="tot"><td>Total</td><td>${short(sum(kids.map(k => k.bal)))}</td><td></td><td></td><td>${short(sumStart)}</td><td>${drawsOn ? short(sumDraw) : ''}</td><td>${drawsOn ? sg(sumEnd) : ''}</td><td></td><td>${need ? money(need) : 'On track'}</td></tr></table></div></div>
    ${drawsCard(kids, kidsAll)}`;
}
function drawsCard(kids, kidsAll) {
  const P = COLP(), ro = CTX.CAN_WRITE ? '' : 'disabled', KC = k => KID_COL[kidsAll.indexOf(k) % 5];
  const nf = v => v != null && v !== '' ? Math.round(+v).toLocaleString() : '';
  const heads = [1, 2, 3, 4].flatMap(y => [`Yr ${y} fall`, `Yr ${y} spring`]);
  return `<div class="card c-12" id="drawCard"><div class="card-h"><div><h3>College draws by semester</h3><div class="sub">What you expect to pull each August and January for 4 years · blank uses the per-semester amount · ${P.draws ? 'included in the projection' : '<b>turned off</b> — the projection ignores draws'}</div></div>
      <div class="right" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><label class="tgl">Growth <input class="in sm num" id="colRate" ${ro} value="${(P.rate * 100).toFixed(1)}" style="width:60px">%/yr</label><label class="tgl"><input type="checkbox" id="colDraws2" ${P.draws ? 'checked' : ''} ${ro}> Include draws</label></div></div>
    <div class="scroll-x"><table class="table draw-t ${P.draws ? '' : 'dim'}"><tr><th>Child</th><th>Use</th><th>Per semester</th>${heads.map(h => `<th>${h}</th>`).join('')}<th>Left after</th></tr>
    ${kids.map(k => { const p = kidPlan(k), c = k.cp, off = !P.draws || !p.on;
      return `<tr class="${off ? 'dim' : ''}"><td class="nowrap"><span class="tw"><i class="sw" style="background:${KC(k)}"></i>${esc(k.name)}</span><div class="muted" style="font-size:11px">Starts Aug ${k.y18} · ${short(c.atStart)}</div></td>
        <td><input type="checkbox" data-kon="${esc(k.name)}" ${p.on ? 'checked' : ''} ${ro} title="Include ${esc(k.name)}'s draws"></td>
        <td><input class="cell num" data-cd="${esc(k.name)}|per" data-kper="${esc(k.name)}" ${ro} value="${nf(p.per)}"></td>
        ${colSems(k).map(s => { const a = c.after[s.m]; return `<td><div class="dsem">${s.l}</div><input class="cell num" data-cd="${esc(k.name)}|${s.m}" data-ksem="${esc(k.name)}" data-m="${s.m}" ${ro} value="${nf(p.sem[s.m])}" placeholder="${nf(p.per)}">
          <div class="dbal ${a == null ? '' : a >= 0 ? '' : 'neg'}">${a == null ? '&nbsp;' : sgn(a)}</div></td>`; }).join('')}
        <td class="num ${off ? 'muted' : c.end >= 0 ? 'pos' : 'neg'}"><b>${off ? '—' : sgn(c.end)}</b></td></tr>`; }).join('')}</table></div>
    <p class="muted" style="font-size:11.5px;margin-top:8px">Type an amount in any semester to override it (0 = no draw that term); clear it to fall back to the per-semester amount. The small number under each term is the 529 balance right after that draw.</p></div>`;
}
const sgn = v => (v < 0 ? '−' : '') + short(Math.abs(v));
function drawCollege(kidsAll) {
  const el = $('#colChart'); if (!el) return;
  const hid = colHidden(), kids = kidsAll.filter(k => !hid.has(k.name)), P = COLP(), proj = UI.colProj !== false, KC = k => KID_COL[kidsAll.indexOf(k) % 5];
  // wiring (all of the college cards)
  $$('#colR button').forEach(b => b.onclick = () => { COL_RANGE = b.dataset.k; render(); });
  $$('.kchip').forEach(b => b.onclick = () => { const s = colHidden(), n = b.dataset.kid; s.has(n) ? s.delete(n) : s.add(n); UI.colHide = [...s]; render(); });
  $('#colProj').onchange = e => { UI.colProj = e.target.checked; render(); };
  if ($('#kidsBtn')) $('#kidsBtn').onclick = openKidsModal;
  $$('[data-kstart]').forEach(sel => sel.onchange = () => { const k = kidsAll.find(x => x.name === sel.dataset.kstart); setStartYear(k.name, k.dob, +sel.value); saveColPlan(); render();
    toast(`${k.name} starts college Aug ${sel.value}`); });
  const setDraws = v => { P.draws = v; saveColPlan(); render(); };
  $('#colDraws').onchange = e => setDraws(e.target.checked); if ($('#colDraws2')) $('#colDraws2').onchange = e => setDraws(e.target.checked);
  const kp = n => (P.kids[n] ||= {}), num = s => { const v = String(s).replace(/[$,\s]/g, ''); return v === '' ? null : +v; };
  if ($('#colRate')) $('#colRate').onchange = e => { const v = num(e.target.value); if (v != null && v >= 0 && v < 30) { P.rate = v / 100; saveColPlan(); } render(); };
  $$('[data-kon]').forEach(c => c.onchange = () => { kp(c.dataset.kon).on = c.checked; saveColPlan(); render(); });
  $$('[data-kper]').forEach(c => c.onchange = () => { const v = num(c.value); if (v == null) delete kp(c.dataset.kper).per; else kp(c.dataset.kper).per = v; saveColPlan(); renderKeep(); });
  $$('[data-ksem]').forEach(c => c.onchange = () => { const p = kp(c.dataset.ksem), v = num(c.value); p.sem ||= {}; if (v == null) delete p.sem[c.dataset.m]; else p.sem[c.dataset.m] = v; saveColPlan(); renderKeep(); });
  $$('#drawCard .cell').forEach(c => c.onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const t = e.target.closest('td'), i = [...t.parentNode.children].indexOf(t), nx = t.parentNode.nextElementSibling?.children[i]?.querySelector('.cell'); (nx || c).focus(); nx?.select(); });
  if (!kids.length) { el.innerHTML = ''; return; }
  // axis: history window, then (optionally) every month through the last child's final spring draw
  const st = COL_RANGE === '1y' ? Math.max(0, L - 12) : COL_RANGE === '3y' ? Math.max(0, L - 36) : Math.max(0, BS.college.findIndex(v => v > 0));
  const hist = BS.months.slice(st, L + 1), endM = proj ? kids.map(k => ymPlus(k.cp.last, 4)).sort().pop() : BS.months[L];
  const labels = hist.concat(ymRange(ymPlus(BS.months[L], 1), endM)), nH = hist.length, iOf = m => labels.indexOf(m);
  const H = k => labels.map((m, i) => i < nH ? (BS[k.key]?.[st + i] ?? null) : null);
  const F = k => labels.map((m, i) => i < nH - 1 ? null : (k.cp.val[m] ?? (m > k.cp.months[k.cp.months.length - 1] ? k.cp.val[k.cp.months[k.cp.months.length - 1]] : null)));
  const sumS = arrs => labels.map((m, i) => arrs.every(a => a[i] == null) ? null : sum(arrs.map(a => a[i] ?? 0)));
  const hs = kids.map(H), fs = proj ? kids.map(F) : [];
  const series = [{name: kids.length === kidsAll.length ? 'All 529s' : 'Selected', values: sumS(hs), color: 'var(--text-2)', area: !proj, width: 2.5}]
    .concat(kids.map((k, j) => ({name: k.name, values: hs[j], color: KC(k)})));
  if (proj) series.push({name: 'Projected total', values: sumS(fs), color: 'var(--text-2)', dash: '5 5', width: 2}, ...kids.map((k, j) => ({name: k.name + ' · projected', values: fs[j], color: KC(k), dash: '4 4'})));
  const nK = kids.length, markers = proj ? kids.map((k, j) => { const i = iOf(k.cp.start); return i < 0 ? null : {i, s: 1 + nK + 1 + j, color: KC(k), label: `${k.name} ’${String(k.y18).slice(2)}`, dy: j * 13, r: 5, ring: true}; }).filter(Boolean) : [];
  lineChart(el, {labels, series, height: 260, zero: true, xGap: 70, xFmt: (lb, i, e) => i % e === 0 ? (labels.length > 60 ? lb.slice(0, 4) : mShort(lb)) : null, tipTitle: mLabel,
    vlines: proj && labels.length > nH ? [{i: nH - 1, label: 'Today'}] : [], markers,
    tipExtra: i => { const m = labels[i]; return kids.map(k => { const d = kidDraw(k, m); return d && m >= k.cp.start ? tipRow(KC(k), `${k.name} draw`, '−' + money(d)) : ''; }).join(''); }});
}

/* =====================================================================
   Admin → Automation: the market-data Edge Function (benchmarks, macro,
   stock prices, asset quotes) — last runs, run now, provider keys, positions
   ===================================================================== */
const AUTO = {prov: null, provErr: null, running: false, results: null, loaded: false};
const AUTO_JOBS = [['benchmarks', 'Benchmarks', 'S&P 500, 60/40, bonds, global, T-bill monthly returns'], ['macro', 'Market rates', 'CPI, 30-yr mortgage, 10-yr Treasury, T-bill'],
  ['stocks', 'Stock positions', 'Month-end shares × close for accounts with a ticker'], ['assets', 'Asset quotes', 'RentCast, FHFA, MarketCheck, VinAudit · monthly']];
async function autoCall(body) {
  const {data, error} = await sb.functions.invoke('market-data', {body: {household_id: CTX.HH, ...body}});
  if (error) { let msg = error.message; try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) {}
    if (error.context?.status === 404 || /FunctionsFetchError|FunctionsRelayError|Failed to send/.test(error.name + ' ' + error.message)) msg = 'The market-data function isn’t deployed yet — see README → Automated data.';
    throw new Error(msg); }
  return data;
}
function mkSeries(code) { return (CTX.market || []).filter(r => r[0] === code).map(r => ({m: r[1], v: +r[2]})).sort((a, b) => a.m.localeCompare(b.m)); }
function automationCard() {
  if (!AUTO.loaded && CTX.CAN_WRITE) { AUTO.loaded = true; autoCall({action: 'status'}).then(d => { AUTO.prov = d.providers; }, e => { AUTO.provErr = e.message; }).finally(() => { if (cur === 'admin') render(); }); }
  const last = Object.fromEntries((AUTO.results || CTX.auto || []).map(r => [r.job, r]));
  const when = d => d ? new Date(d).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) : 'never';
  const cpi = mkSeries('CPIAUCSL'), cpiY = cpi.length > 12 ? cpi[cpi.length - 1].v / cpi[cpi.length - 13].v - 1 : null, last1 = c => mkSeries(c).at(-1);
  const tiles = [['Inflation (CPI, 12 mo)', cpiY != null ? pct(cpiY) : '—', cpi.at(-1)?.m], ['30-yr mortgage', last1('MORTGAGE30US') ? last1('MORTGAGE30US').v.toFixed(2) + '%' : '—', last1('MORTGAGE30US')?.m],
    ['10-yr Treasury', last1('DGS10') ? last1('DGS10').v.toFixed(2) + '%' : '—', last1('DGS10')?.m], ['3-mo T-bill', last1('TB3MS') ? last1('TB3MS').v.toFixed(2) + '%' : '—', last1('TB3MS')?.m]];
  const P = AUTO.prov, pc = (k, n, need) => `<span class="chip ${P?.[k] ? 'pos' : ''}">${P?.[k] ? icon('check') + ' ' : ''}${n}${P && !P[k] ? ` · ${need}` : ''}</span>`;
  const accts = (SNAP.accounts || []).filter(a => a.is_active !== false && !a.parent_account_id && (a.ticker || a.kind === 'stock' || AUTO.addId === a.id));
  const ro = CTX.CAN_WRITE ? '' : 'disabled';
  return `<div class="card c-12" id="autoCard"><div class="card-h"><div><h3>Automation</h3><div class="sub">Market data, stock prices and asset quotes · the <b>market-data</b> function runs every morning; API keys stay in Supabase secrets</div></div>
      <div class="right" style="display:flex;gap:10px;align-items:center">${CTX.CAN_WRITE ? `<label class="tgl" title="Re-pull all benchmark history and re-quote assets this month"><input type="checkbox" id="autoFull"> Full history</label><button class="btn primary" id="autoRun" ${AUTO.running ? 'disabled' : ''}>${AUTO.running ? 'Running…' : 'Run now'}</button>` : ''}</div></div>
    ${AUTO.provErr ? `<div class="hint" style="margin-bottom:10px">${esc(AUTO.provErr)}</div>` : P ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${pc('schedule', 'Daily schedule', 'set CRON_SECRET')}${pc('yahoo', 'Yahoo prices')}${pc('fred', 'FRED rates')}${pc('fhfa', 'FHFA home index')}${pc('rentcast', 'RentCast', 'add key')}${pc('marketcheck', 'MarketCheck', 'add key')}${pc('vinaudit', 'VinAudit', 'add key')}${pc('alphavantage', 'Alpha Vantage backup', 'optional')}</div>` : ''}
    <div class="scroll-x"><table class="table auto-t"><tr><th>Job</th><th>Last run</th><th>Status</th><th>Details</th></tr>
      ${AUTO_JOBS.map(([k, n, d]) => { const r = last[k], s = r?.summary || r || {}, errs = s.errors || [], notes = s.notes || [];
        return `<tr><td><b>${n}</b><div class="muted" style="font-size:11.5px">${d}</div></td><td class="nowrap">${r ? when(r.finished_at || r.started_at) + (r.trigger === 'manual' ? ' · manual' : '') : (AUTO.results ? 'not run' : 'never')}</td>
          <td>${!r ? '<span class="chip">Waiting</span>' : errs.length ? `<span class="chip neg">${errs.length} issue${errs.length > 1 ? 's' : ''}</span>` : `<span class="chip pos">${icon('check')} ${s.written ?? 0} written</span>`}</td>
          <td class="auto-d">${errs.map(e => `<div class="neg">${esc(e)}</div>`).join('')}${notes.slice(0, 6).map(e => `<div>${esc(e)}</div>`).join('')}${notes.length > 6 ? `<div class="muted">+${notes.length - 6} more</div>` : ''}</td></tr>`; }).join('')}</table></div>
    ${AUTO.results ? `<div class="hint" style="margin-top:10px">Done. <button class="link" onclick="location.reload()">Reload</button> to see the new numbers across the app.</div>` : ''}
    <div class="stat-row" style="grid-template-columns:repeat(4,1fr);margin:14px 0">${tiles.map(([l, v, m]) => `<div class="mini"><div class="l">${l}</div><div class="v num">${v}</div><div class="ds" style="font-size:11px;color:var(--text-3)">${m ? mLabel(m) + ' · FRED' : 'after the first run'}</div></div>`).join('')}</div>
    <h4 style="margin:6px 0 8px;font-size:13px">Stock positions <span class="muted" style="font-weight:500">· balance = shares × month-end close, written for each finished month you haven’t entered yourself</span></h4>
    <div class="scroll-x"><table class="table"><tr><th>Account</th><th>Ticker</th><th>Shares</th><th>Cost basis</th><th></th></tr>
      ${accts.map(a => `<tr><td>${esc(a.name)}</td><td><input class="in sm" data-tk="${a.id}" ${ro} value="${esc(a.ticker || '')}" placeholder="e.g. PPG" style="width:110px;text-transform:uppercase"></td>
        <td><input class="in sm num" data-sh="${a.id}" ${ro} value="${a.shares != null ? (+a.shares).toLocaleString('en-US', {maximumFractionDigits: 6}) : ''}" placeholder="0" style="width:130px"></td>
        <td><div class="amt-in"><span>$</span><input class="in sm num" data-cb="${a.id}" ${ro} value="${a.cost_basis != null ? Math.round(+a.cost_basis).toLocaleString() : ''}" placeholder="total paid" style="width:130px"></div></td>
        <td>${a.ticker ? `<button class="link" data-tkclr="${a.id}" ${ro}>Stop pricing</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No stock accounts yet.</td></tr>'}
    </table></div>
    ${CTX.CAN_WRITE ? `<div style="display:flex;gap:8px;align-items:center;margin-top:8px"><span class="muted" style="font-size:12px">Price another account:</span><select class="in sm" id="tkAdd" style="width:220px"><option value="">Choose…</option>${(SNAP.accounts || []).filter(a => a.is_active !== false && !a.parent_account_id && !accts.includes(a) && ['Investing', 'Retirement'].includes(a.balance_group)).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>` : ''}
  </div>`;
}
function wireAutomation() {
  if (!$('#autoCard')) return;
  if ($('#autoRun')) $('#autoRun').onclick = async () => {
    AUTO.running = true; render();
    try { const d = await autoCall({force: $('#autoFull')?.checked}); AUTO.results = (d.results || []).map(r => ({job: r.job, trigger: 'manual', finished_at: new Date().toISOString(), summary: r})); toast(d.ok ? 'Automation finished' : 'Automation finished with issues — see details'); }
    catch (e) { toast(e.message); }
    AUTO.running = false; render();
  };
  const save = async (id, patch) => {
    const a = SNAP.accounts.find(x => x.id === id);
    const {error} = await sb.schema('finance').from('accounts').update(patch).eq('id', id);
    if (error) return toast('Couldn’t save: ' + error.message);
    Object.assign(a, patch); render(); toast(`${a.name} saved${patch.ticker ? ' · priced on the next run' : ''}`);
  };
  $$('[data-tk]').forEach(i => i.onchange = () => { const t = i.value.trim().toUpperCase(); if (t && !/^[A-Z0-9.^=-]{1,15}$/.test(t)) return toast('That doesn’t look like a ticker'); save(i.dataset.tk, {ticker: t || null}); });
  $$('[data-sh]').forEach(i => i.onchange = () => { const v = i.value.replace(/[,\s]/g, ''); if (v !== '' && !(+v >= 0)) return toast('Shares must be a number'); save(i.dataset.sh, {shares: v === '' ? null : +v}); });
  $$('[data-tkclr]').forEach(b => b.onclick = () => save(b.dataset.tkclr, {ticker: null}));
  $$('[data-cb]').forEach(i => i.onchange = () => { const v = i.value.replace(/[$,\s]/g, ''); if (v !== '' && !(+v >= 0)) return toast('Cost basis must be a number'); save(i.dataset.cb, {cost_basis: v === '' ? null : +v}); });
  if ($('#tkAdd')) $('#tkAdd').onchange = e => { AUTO.addId = e.target.value; render(); setTimeout(() => $(`[data-tk="${AUTO.addId}"]`)?.focus(), 30); };
}

/* ---- children: college start year and adding / editing kids ---- */
const startSel = k => {
  const auto = autoCollegeYear(k.dob), ys = []; for (let y = auto - 2; y <= auto + 4; y++) ys.push(y);
  if (!CTX.CAN_WRITE) return `Aug ${k.y18}${k.y18 !== auto ? ' <span class="chip">adjusted</span>' : ''}`;
  return `<select class="in sm sel" data-kstart="${esc(k.name)}" title="When ${esc(k.name)} starts college">${ys.map(y => `<option value="${y}" ${y === k.y18 ? 'selected' : ''}>Aug ${y}${y === auto ? ' · on time' : y > auto ? ` · +${y - auto} yr` : ` · −${auto - y} yr`}</option>`).join('')}</select>`;
};
// move the start year (and any per-semester overrides with it); the on-time year clears the override
function setStartYear(name, dob, year) {
  const P = COLP(), p = (P.kids[name] ||= {}), prev = +p.startYear || autoCollegeYear(dob), d = year - prev;
  if (d && p.sem) p.sem = Object.fromEntries(Object.entries(p.sem).map(([m, v]) => [`${+m.slice(0, 4) + d}${m.slice(4)}`, v]));
  if (year === autoCollegeYear(dob)) delete p.startYear; else p.startYear = year;
}
function openKidsModal() {
  const m = $('#modal'); m.classList.add('wide');
  const list = (CTX.settings.kids || []).map(k => ({...k}));
  const accts = (SNAP.accounts || []).filter(a => a.balance_group === 'College' && !a.parent_account_id);
  const linked = k => accts.find(a => a.owner_label === k.name || a.name.startsWith(k.name));
  const free = accts.filter(a => !list.some(k => linked(k) === a));
  const draw = () => {
    m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Children & college</h2><p class="muted" style="font-size:12.5px">College start defaults to the August after they turn 18 (fall birthdays a year later). Change it for a child who’s held back or starts early.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="scroll-x"><table class="table kid-t"><tr><th>Child</th><th>Birth date</th><th>College starts</th><th>529 account</th><th></th></tr>
      ${list.map((k, i) => { const auto = autoCollegeYear(k.dob), cur = +COLP().kids[k.name]?.startYear || auto, ys = []; for (let y = auto - 2; y <= auto + 4; y++) ys.push(y);
        return `<tr><td><b>${esc(k.name)}</b></td><td><input class="in sm" type="date" data-kdob="${i}" value="${esc(k.dob)}"></td>
          <td><select class="in sm sel" data-ky="${i}">${ys.map(y => `<option value="${y}" ${y === cur ? 'selected' : ''}>Aug ${y}${y === auto ? ' · on time' : y > auto ? ` · +${y - auto} yr` : ` · −${auto - y} yr`}</option>`).join('')}</select></td>
          <td class="muted">${linked(k) ? esc(linked(k).name) : '<span class="neg">none linked</span>'}</td><td><button class="link" data-krm="${i}" style="color:var(--neg)">Remove</button></td></tr>`; }).join('')}</table></div>
    <h4 style="margin:16px 0 8px;font-size:13px">Add a child</h4>
    <div class="form" style="grid-template-columns:1.2fr 1fr 1.4fr 1fr">
      <div><label>Name</label><input class="in" id="nkName" placeholder="First name"></div>
      <div><label>Birth date</label><input class="in" type="date" id="nkDob"></div>
      <div><label>529 account</label><select class="in" id="nkAcct"><option value="new">Create a new 529 account</option>${free.map(a => `<option value="${a.id}">Use ${esc(a.name)}</option>`).join('')}</select></div>
      <div><label>Balance today <span class="muted">(optional)</span></label><input class="in num" id="nkBal" placeholder="$0"></div>
    </div>
    <div class="hint" id="kMsg" style="display:none;margin-top:10px"></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="kGo">Save</button></div>`;
    $$('[data-kdob]', m).forEach(i => i.onchange = () => { list[+i.dataset.kdob].dob = i.value; draw(); });
    $$('[data-ky]', m).forEach(s => s.onchange = () => { list[+s.dataset.ky].year = +s.value; });
    $$('[data-krm]', m).forEach(b => b.onclick = () => { const k = list[+b.dataset.krm]; if (confirmRm(k)) { list.splice(+b.dataset.krm, 1); draw(); } });
    $('#nkAcct').onchange = e => { $('#nkBal').disabled = e.target.value !== 'new'; };
    $('#kGo').onclick = save;
  };
  const confirmRm = k => { const el = $('#kMsg'); if (el.dataset.rm === k.name) return true; el.dataset.rm = k.name; el.style.display = ''; el.textContent = `Click Remove again to take ${k.name} off the plan. The 529 account and its history stay on Balances.`; return false; };
  const msg = t => { const el = $('#kMsg'); el.style.display = ''; el.textContent = t; };
  const save = async () => {
    const was = CTX.settings.kids || [], name = $('#nkName').value.trim(), dob = $('#nkDob').value, acct = $('#nkAcct').value, bal = +$('#nkBal').value.replace(/[$,\s]/g, '') || 0;
    if (name || dob) {
      if (!name || !dob) return msg('Enter both a name and a birth date for the new child.');
      if (list.some(k => k.name.toLowerCase() === name.toLowerCase())) return msg(`There’s already a child named ${name}.`);
      list.push({name, dob, isNew: true, acct, bal});
    }
    if (list.some(k => !/^\d{4}-\d{2}-\d{2}$/.test(k.dob || ''))) return msg('Every child needs a birth date.');
    $('#kGo').disabled = true;
    try {
      // start years (shifts semester overrides with them); dropped kids leave the plan
      list.forEach(k => setStartYear(k.name, k.dob, k.year || +COLP().kids[k.name]?.startYear || autoCollegeYear(k.dob)));
      Object.keys(COLP().kids).forEach(n => { if (!list.some(k => k.name === n)) delete COLP().kids[n]; });
      const kids = list.map(k => ({name: k.name, dob: k.dob}));
      const changed = JSON.stringify(kids) !== JSON.stringify(was.map(k => ({name: k.name, dob: k.dob})));
      for (const k of list.filter(x => x.isNew)) {
        let id = k.acct;
        if (k.acct === 'new') {
          const {data, error} = await FDB.from('accounts').insert({household_id: CTX.HH, name: `${k.name} 529`, kind: 'college', balance_group: 'College', owner_label: k.name, in_net_worth: true, in_investable: false, sort_order: 600}).select('id').single();
          if (error) throw error; id = data.id;
          if (k.bal) { const {error: e2} = await FDB.from('account_balances').insert({household_id: CTX.HH, account_id: id, month: BS.months[L] + '-01', balance: k.bal, source: 'manual'}); if (e2) throw e2; }
        } else { const {error} = await FDB.from('accounts').update({owner_label: k.name}).eq('id', id); if (error) throw error; }
      }
      if (changed) { const {error} = await FDB.rpc('set_household_setting', {p_household: CTX.HH, p_key: 'kids', p_value: kids}); if (error) throw error; CTX.settings.kids = kids; }
      const {error} = await FDB.rpc('set_household_setting', {p_household: CTX.HH, p_key: 'college_plan', p_value: COLP()}); if (error) throw error;
      if (changed) { closeAll(); toast('Saved · reloading with the updated children…'); setTimeout(() => location.reload(), 700); }
      else { closeAll(); render(); toast('College start years saved'); }
    } catch (e) { $('#kGo').disabled = false; list.splice(0, list.length, ...list.filter(k => !k.isNew)); msg('Couldn’t save: ' + (e.message || e) + (/set_household_setting|kids/.test(e.message || '') ? ' — run migration 1400.' : '')); }
  };
  draw(); openLayer('modal');
}
