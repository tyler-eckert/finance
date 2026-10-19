/* =====================================================================
   LAWN CARE — invoices with line items (tied to the bank payment and split
   into sub-categories), a service log, a typical-year calendar from history,
   ±6 months at a glance, and DIY / planned activities on any date.
   ===================================================================== */
Object.assign(I, {leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19l8-8"/>'});
const INV = () => (CTX.invoices ||= []);
const LACT = () => (CTX.lawnActs ||= []);
const LW = {vendor: 'Liv Outdoors', open: new Set(), cand: null, scanning: false, showAll: false};
const LAWN_CAT = 'Lawn/Homecare';
const ACTS = ['Fertilization', 'Weed control', 'Pre-emergent', 'Iron', 'Aeration', 'Dethatch / scalp', 'Overseed', 'Sod', 'Growth regulator', 'Pest control', 'Disease control', 'Mowing', 'Irrigation', 'Beds & cleanup', 'Leaf removal', 'Trees & shrubs', 'Soil test', 'Lighting', 'Other'];
const TURFS = ['Bermuda', 'Fescue', 'Beds', 'Trees', 'Whole yard'];
const ACT_COL = {Fertilization: 'var(--s1)', 'Weed control': 'var(--s3)', 'Pre-emergent': 'var(--s3)', Iron: '#7a5c2e', Aeration: 'var(--s4)', 'Dethatch / scalp': 'var(--s4)', Overseed: 'var(--s2)', Sod: 'var(--s2)', 'Growth regulator': 'var(--s5)', 'Pest control': 'var(--neg)', 'Disease control': 'var(--neg)', Mowing: 'var(--text-3)', Irrigation: '#2a78d6', 'Beds & cleanup': '#a07b3b', 'Leaf removal': '#a07b3b', 'Trees & shrubs': '#4d7c3a'};
function classifyLine(desc) {
  const d = desc.toLowerCase();
  const turf = /bermuda/.test(d) ? 'Bermuda' : /fescue|fescude/.test(d) ? 'Fescue' : /landscape bed|flower bed|mulch|\bbeds?\b|clean-?up/.test(d) ? 'Beds' : /tree|shrub|juniper|stump|willow/.test(d) ? 'Trees' : 'Whole yard';
  const act = /pgr|growth reg/.test(d) ? 'Growth regulator' : /fertiliz|deep root|feeding/.test(d) ? 'Fertilization' : /pre-?emerg/.test(d) ? 'Pre-emergent' : /weed control|dallis|weed/.test(d) && !/weed-eat/.test(d) ? 'Weed control'
    : /aerat/.test(d) ? 'Aeration' : /iron/.test(d) ? 'Iron' : /mow|weed-eat/.test(d) ? 'Mowing' : /over-?seed/.test(d) ? 'Overseed' : /sod|top ?soil|mason sand/.test(d) ? 'Sod' : /irrigation|valve|value|rotor|sprinkler|zone/.test(d) ? 'Irrigation'
    : /grub|army worm|insect|pest/.test(d) ? 'Pest control' : /disease|fungic/.test(d) ? 'Disease control' : /leaf/.test(d) ? 'Leaf removal' : /mulch|clean-?up|bed/.test(d) ? 'Beds & cleanup' : /tree|stump|juniper|shrub/.test(d) ? 'Trees & shrubs' : /light/.test(d) ? 'Lighting' : 'Other';
  const m = desc.match(/(Bermuda|Fescue|Landscape Bed) Program:\s*Round\s*(\d+)/i);
  return {act, turf, key: m ? `${m[1].replace(/landscape bed/i, 'Beds')} R${m[2]}` : null};
}
// every service, from invoice lines (pro) and the activity log (DIY / planned)
function lawnEvents() {
  const ev = [];
  INV().forEach(inv => (inv.lines || []).forEach(l => { const c = classifyLine(l.description); ev.push({d: l.service_date || inv.invoice_date, act: l.activity || c.act, turf: l.turf || c.turf, key: c.key, who: inv.vendor, st: 'done', cost: +l.amount, desc: l.description, inv: inv.invoice_no}); }));
  LACT().forEach(a => ev.push({d: a.act_date, act: a.activity, turf: a.turf || 'Whole yard', key: null, who: a.who, st: a.status, cost: a.cost != null ? +a.cost : null, desc: a.notes || a.product || '', id: a.id, product: a.product}));
  return ev.filter(e => e.d).sort((a, b) => a.d.localeCompare(b.d));
}
// typical year from history: each repeating service (program round, or activity + turf) with its usual date and cost
function typicalYear(ev) {
  const done = ev.filter(e => e.st === 'done' && !['Mowing', 'Irrigation', 'Other', 'Lighting'].includes(e.act));
  const by = {}; done.forEach(e => { const k = e.key || `${e.turf} · ${e.act}`; (by[k] ||= []).push(e); });
  const doy = d => { const t = new Date(d + 'T12:00:00'), s = new Date(t.getFullYear(), 0, 1); return Math.round((t - s) / 864e5); };
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return Object.entries(by).map(([k, list]) => { const yrs = new Set(list.map(e => e.d.slice(0, 4))); if (yrs.size < 2) return null;
    const perY = list.length / yrs.size; if (perY > 2.5) return null;
    const days = list.map(e => doy(e.d)), m = med(days), lo = Math.min(...days), hi = Math.max(...days);
    if (!list[0].key && hi - lo > 75) return null;
    return {k, act: list[0].act, turf: list[0].turf, day: m, lo, hi, n: list.length, years: yrs.size, cost: med(list.map(e => e.cost || 0)), who: list[list.length - 1].who}; }).filter(Boolean).sort((a, b) => a.day - b.day);
}
const dayToDate = (y, doy) => { const t = new Date(y, 0, 1); t.setDate(t.getDate() + doy); return t.toISOString().slice(0, 10); };
const fmtD2 = d => `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;

/* ---------------- payment matching ---------------- */
async function lawnFindPayments() {
  const invs = INV().filter(i => i.paid_on); if (!invs.length) return;
  LW.scanning = true; render();
  try {
    const groups = {}; invs.forEach(i => (groups[i.vendor + '|' + i.paid_on] ||= []).push(i));
    const amts = new Set(); invs.forEach(i => amts.add((-+i.total).toFixed(2))); Object.values(groups).forEach(g => { if (g.length > 1) amts.add((-sum(g.map(i => +i.total))).toFixed(2)); });
    const ds = invs.map(i => i.paid_on).sort(), lo = dAdd(ds[0], -10), hi = dAdd(ds[ds.length - 1], 30), out = [];
    for (const part of chunks([...amts], 150)) { const {data, error} = await FDB.from('transactions').select('id, posted_on, description, amount, is_split, category_id').eq('household_id', CTX.HH).gte('posted_on', lo).lte('posted_on', hi).in('amount', part); if (error) throw error; out.push(...data); }
    const vs = [...new Set(invs.map(i => i.vendor.split(' ')[0]))];
    for (const v of vs) { const {data, error} = await FDB.from('transactions').select('id, posted_on, description, amount, is_split, category_id').eq('household_id', CTX.HH).gte('posted_on', lo).lte('posted_on', CTX.TODAY).lt('amount', 0).ilike('description', `%${v}%`); if (error) throw error; data.forEach(t => { if (!out.some(o => o.id === t.id)) out.push(t); }); }
    LW.cand = out;
  } catch (e) { toast('Couldn’t look up payments: ' + e.message); }
  LW.scanning = false; render();
}
function lawnMatches() {
  const C = LW.cand || [], used = new Set(INV().map(i => i.transaction_id).filter(Boolean)), res = {};
  const near = (a, b, n) => Math.abs(new Date(a) - new Date(b)) <= n * 864e5;
  const vend = (t, v) => t.description.toLowerCase().includes(v.toLowerCase().split(' ')[0]);
  const pick = (amt, d, v) => C.filter(t => !used.has(t.id) && Math.abs(-t.amount - amt) < .005 && near(t.posted_on, d, 10)).sort((a, b) => (vend(b, v) - vend(a, v)) || Math.abs(new Date(a.posted_on) - new Date(d)) - Math.abs(new Date(b.posted_on) - new Date(d)))[0];
  const invs = INV().filter(i => !i.transaction_id && i.paid_on).sort((a, b) => a.paid_on.localeCompare(b.paid_on));
  invs.forEach(i => { const t = pick(+i.total, i.paid_on, i.vendor); if (t) { used.add(t.id); res[i.id] = {t, group: [i]}; } });
  const groups = {}; invs.filter(i => !res[i.id]).forEach(i => (groups[i.vendor + '|' + i.paid_on] ||= []).push(i));
  Object.values(groups).filter(g => g.length > 1).forEach(g => { const t = pick(sum(g.map(i => +i.total)), g[0].paid_on, g[0].vendor); if (t) { used.add(t.id); g.forEach(i => res[i.id] = {t, group: g}); } });
  // invoices with no exact payment: the nearest vendor payment, to show the difference
  INV().filter(i => !i.transaction_id && i.paid_on && !res[i.id]).forEach(i => { const t = C.filter(t => !used.has(t.id) && vend(t, i.vendor) && near(t.posted_on, i.paid_on, 10)).sort((a, b) => Math.abs(new Date(a.posted_on) - new Date(i.paid_on)) - Math.abs(new Date(b.posted_on) - new Date(i.paid_on)))[0]; if (t) res[i.id] = {t, group: [i], off: -t.amount - +i.total}; });
  return res;
}
const lawnOrphans = M => { const tied = new Set([...INV().map(i => i.transaction_id), ...Object.values(M).map(m => m.t.id)]); const v = LW.vendor.split(' ')[0].toLowerCase();
  return (LW.cand || []).filter(t => !tied.has(t.id) && t.description.toLowerCase().includes(v)).sort((a, b) => b.posted_on.localeCompare(a.posted_on)); };
// tie invoices to their payment and split the payment by sub-category (one line per sub-category)
async function lawnTieAndSplit(list) {
  let ok = 0, bad = 0;
  const byTx = {}; list.forEach(({inv, t}) => { (byTx[t.id] ||= {t, invs: []}).invs.push(inv); });
  for (const {t, invs} of Object.values(byTx)) {
    try {
      const tot = sum(invs.map(i => +i.total)); if (Math.abs(tot + +t.amount) > .005) { bad++; continue; }
      const g = {}; invs.forEach(inv => (inv.lines || []).forEach(l => { const k = (l.category_id || '') + '|' + (l.subcategory_id || ''); (g[k] ||= {c: l.category_id, s: l.subcategory_id, a: 0, inv: new Set()}).a += +l.amount; g[k].inv.add(inv.invoice_no); }));
      const parts = Object.values(g), invNos = invs.map(i => '#' + i.invoice_no).join(', ');
      if (parts.length === 1) { const {error} = await FDB.from('transactions').update({category_id: parts[0].c, subcategory_id: parts[0].s, match_source: 'user'}).eq('id', t.id); if (error) throw error; }
      else { const lines = parts.map(p => ({category_id: p.c, subcategory_id: p.s, amount: -(+p.a.toFixed(2)), notes: `Inv ${[...p.inv].map(x => '#' + x).join(', ')}`}));
        const {error} = await FDB.rpc('set_splits', {p_tx: t.id, p_lines: lines}); if (error) throw error; }
      for (const inv of invs) { const {error} = await FDB.from('invoices').update({transaction_id: t.id}).eq('id', inv.id); if (error) throw error; inv.transaction_id = t.id; }
      const lt = ST.tx.find(x => x.id === t.id);
      if (lt) { const nm = id => MAP.catName[id] || '', sn = id => MAP.subName[id]?.name || '';
        if (parts.length === 1) { lt.cat = nm(parts[0].c); lt.sub = sn(parts[0].s); delete lt.splits; } else lt.splits = parts.map(p => ({cat: nm(p.c), sub: sn(p.s), amt: -(+p.a.toFixed(2)), note: `Inv ${[...p.inv].map(x => '#' + x).join(', ')}`}));
        SYNC.adopt('tx', [lt.id]); }
      ok += invs.length;
    } catch (e) { bad++; console.warn('[fin] tie invoice', e); }
  }
  toast(`${ok} invoice${ok === 1 ? '' : 's'} tied and split${bad ? ` · ${bad} skipped (amounts didn’t match)` : ''}`);
  render();
}
async function lawnReloadInvoices() {
  const {data, error} = await FDB.from('invoices').select('*, lines:invoice_lines(*)').eq('household_id', CTX.HH).order('invoice_date');
  if (error) throw error; CTX.invoices = data.map(i => ({...i, lines: (i.lines || []).sort((a, b) => String(a.service_date).localeCompare(String(b.service_date)) || a.sort_order - b.sort_order)}));
}

/* ---------------- page ---------------- */
function renderLawn(pg) {
  const ev = lawnEvents(), today = CTX.TODAY, ty = typicalYear(ev), invs = INV().slice().sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)));
  const M = lawnMatches(), ro = CTX.CAN_WRITE ? '' : 'disabled';
  const yr = y => sum(ev.filter(e => e.st === 'done' && e.d.startsWith(String(y))).map(e => e.cost || 0));
  const tied = invs.filter(i => i.transaction_id), ready = invs.filter(i => !i.transaction_id && M[i.id] && !M[i.id].off), offs = invs.filter(i => !i.transaction_id && M[i.id]?.off), orphans = lawnOrphans(M);
  const nextP = ev.filter(e => e.st === 'planned' && e.d >= today)[0];
  // ±6 months window
  const m0 = ymPlus(ym(today), -6), win = ymRange(m0, ymPlus(ym(today), 6));
  const expected = []; [+today.slice(0, 4) - 1, +today.slice(0, 4), +today.slice(0, 4) + 1].forEach(y => ty.forEach(t => { const d = dayToDate(y, t.day); if (d.slice(0, 7) < win[0] || d.slice(0, 7) > win[win.length - 1]) return;
    const hit = ev.some(e => e.act === t.act && e.turf === t.turf && Math.abs(new Date(e.d) - new Date(d)) < 35 * 864e5 && (e.key ? e.key === t.k : true)); if (!hit && d >= today) expected.push({d, act: t.act, turf: t.turf, k: t.k, cost: t.cost, who: t.who, st: 'expected'}); }));
  const inWin = ev.filter(e => e.d.slice(0, 7) >= win[0] && e.d.slice(0, 7) <= win[win.length - 1]).concat(expected);
  const rowsA = ACTS.filter(a => inWin.some(e => e.act === a));
  const cell = (a, m) => inWin.filter(e => e.act === a && e.d.slice(0, 7) === m).map(e => `<i class="lc-dot ${e.st}${e.who === 'DIY' ? ' diy' : ''}" style="--c:${ACT_COL[a] || 'var(--s1)'}" title="${esc(fmtD2(e.d) + ' · ' + (e.key || e.turf + ' ' + e.act) + (e.desc ? ' · ' + e.desc : '') + (e.cost ? ' · ' + money(e.cost) : '') + ' · ' + (e.st === 'expected' ? 'expected from history' : e.st) + (e.who ? ' · ' + e.who : ''))}"></i>`).join('');
  const pending = LACT().filter(a => a.status === 'planned').sort((a, b) => a.act_date.localeCompare(b.act_date));
  const recentDIY = LACT().filter(a => a.status !== 'planned').sort((a, b) => b.act_date.localeCompare(a.act_date)).slice(0, 12);
  const years = [...new Set(ev.filter(e => e.st === 'done').map(e => e.d.slice(0, 4)))].sort().slice(-4);
  const acts = ACTS.filter(a => ev.some(e => e.st === 'done' && e.act === a && years.includes(e.d.slice(0, 4))));
  const matchCell = i => { if (i.transaction_id) { const t = ST.tx.find(x => x.id === i.transaction_id); return `<span class="chip pos">${icon('check')} Tied${t ? ' · ' + fmtDate(t.d) : ''}</span>`; }
    const m = M[i.id]; if (m?.off) return `<span class="chip neg" title="${esc(m.t.description)}">Closest payment ${fmtD2(m.t.posted_on)} · ${money(-m.t.amount, 2)} (${m.off > 0 ? '+' : '−'}${money(Math.abs(m.off), 2)})</span>`; if (m) return `<span class="chip">Payment found · ${fmtD2(m.t.posted_on)}${m.group.length > 1 ? ` · with ${m.group.length - 1} other` : ''}</span>`;
    return LW.cand ? `<span class="chip neg">No matching payment</span>` : '<span class="muted">—</span>'; };
  pg.innerHTML = `<div class="toolbar wrap"><span class="muted" style="font-size:12.5px">Services from invoices, plus what you do yourself · ${invs.length} invoice${invs.length === 1 ? '' : 's'}</span>
    <div style="margin-left:auto;display:flex;gap:8px">${CTX.CAN_WRITE ? `<button class="btn" id="lwImp">${icon('file')}<span>Import lines</span></button><button class="btn" id="lwInv">${icon('plus')}<span>Add invoice</span></button><button class="btn primary" id="lwAdd">${icon('plus')}<span>Plan / log activity</span></button>` : ''}</div></div>
  <div class="grid g-12">
    <div class="card c-3 kpi"><div class="label">${CY} so far</div><div class="val num">${money(yr(CY))}</div><div class="delta">${short(yr(CY - 1))} in ${CY - 1}</div></div>
    <div class="card c-3 kpi"><div class="label">Invoices tied to the bank</div><div class="val num">${tied.length} <span class="muted" style="font-size:16px">of ${invs.length}</span></div><div class="delta">${ready.length ? `${ready.length} ready to tie` : LW.cand ? (offs.length ? `${offs.length} don’t match` : 'all checked') : 'run “Find payments”'}</div></div>
    <div class="card c-3 kpi"><div class="label">Next up</div><div class="val" style="font-size:18px">${nextP ? esc(nextP.act) : expected[0] ? esc(expected[0].k || expected[0].act) : '—'}</div><div class="delta">${nextP ? fmtD2(nextP.d) + ' · ' + esc(nextP.who) : expected[0] ? 'expected ~' + fmtD2(expected[0].d) : ''}</div></div>
    <div class="card c-3 kpi"><div class="label">Typical year</div><div class="val num">${short(sum(ty.map(t => t.cost)))}</div><div class="delta">${ty.length} recurring services</div></div>

    <div class="card c-12"><div class="card-h"><div><h3>At a glance · ${mLabel(win[0])} – ${mLabel(win[win.length - 1])}</h3><div class="sub">● done · ◆ done yourself · ○ planned · ◌ expected from past years · hover for details · click a month to plan something</div></div></div>
      <div class="scroll-x"><table class="table lc-t"><tr><th>Activity</th>${win.map(m => `<th class="${m === ym(today) ? 'now' : ''}">${mShort(m)}</th>`).join('')}</tr>
        ${rowsA.map(a => `<tr><td class="nowrap"><i class="sw" style="background:${ACT_COL[a] || 'var(--s1)'}"></i> ${a}</td>${win.map(m => `<td class="lc-c ${m === ym(today) ? 'now' : ''}" data-plan="${a}|${m}">${cell(a, m)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${win.length + 1}" class="muted">Nothing in this window yet.</td></tr>`}</table></div></div>

    <div class="card c-7"><div class="card-h"><div><h3>Typical year</h3><div class="sub">Built from ${years.join(', ') || 'your history'} · usual date and cost for each recurring service</div></div>${CTX.CAN_WRITE && ty.length ? `<div class="right"><button class="btn nowrap" id="lwPlanAll" style="height:32px;white-space:nowrap">Plan the next 12 months</button></div>` : ''}</div>
      <div class="scroll-x"><table class="table lw-t"><tr><th>When</th><th>Service</th><th>Usual range</th><th>Cost</th><th>Seen</th></tr>
        ${ty.map(t => `<tr><td class="nowrap"><b>${fmtD2(dayToDate(CY, t.day))}</b></td><td><i class="sw" style="background:${ACT_COL[t.act] || 'var(--s1)'}"></i> ${esc(t.k)} <span class="muted">· ${t.act}</span></td><td class="muted nowrap">${fmtD2(dayToDate(CY, t.lo))} – ${fmtD2(dayToDate(CY, t.hi))}</td><td class="num">${money(t.cost)}</td><td class="muted">${t.years} yrs</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Import a couple of years of invoices to see a typical year.</td></tr>'}</table></div></div>
    <div class="card c-5"><div class="card-h"><div><h3>Planned & do-it-yourself</h3><div class="sub">Aeration, iron, anything you plan or do yourself · any date</div></div></div>
      <div class="list">${pending.slice(0, LW.allPlan ? 999 : 8).map(a => `<div class="li"><i class="sw" style="background:${ACT_COL[a.activity] || 'var(--s1)'};width:10px;height:10px"></i><div style="min-width:0;flex:1"><div class="nm">${esc(a.activity)} <span class="muted">· ${esc(a.turf || '')}</span></div><div class="ds">${fmtD2(a.act_date)} ${a.act_date.slice(0, 4)} · ${esc(a.who)}${a.product ? ' · ' + esc(a.product) : ''}${a.notes ? ' · ' + esc(a.notes) : ''}</div></div>
          ${CTX.CAN_WRITE ? `<button class="btn" style="height:28px" data-ldone="${a.id}">Done</button><button class="mini-btn" data-ledit="${a.id}" title="Edit">${icon('edit')}</button>` : ''}</div>`).join('') || '<p class="muted" style="padding:6px 0">Nothing planned. Use “Plan / log activity”, or click a month above.</p>'}</div>
      ${pending.length > 8 && !LW.allPlan ? `<button class="btn" id="lwAllPlan" style="margin-top:8px">Show all ${pending.length} planned</button>` : ''}
      ${recentDIY.length ? `<h4 style="margin:14px 0 6px;font-size:12.5px">Recently logged</h4><div class="list">${recentDIY.map(a => `<div class="li"><div style="min-width:0;flex:1"><div class="nm" style="font-size:13px">${esc(a.activity)} <span class="muted">· ${esc(a.turf || '')}</span></div><div class="ds">${fmtD2(a.act_date)} ${a.act_date.slice(0, 4)} · ${a.status}${a.cost ? ' · ' + money(a.cost) : ''}</div></div>${CTX.CAN_WRITE ? `<button class="mini-btn" data-ledit="${a.id}" title="Edit">${icon('edit')}</button>` : ''}</div>`).join('')}</div>` : ''}</div>

    <div class="card c-12"><div class="card-h"><div><h3>Invoices</h3><div class="sub">Each invoice’s lines add up to its total; tie it to the bank payment and the payment is split by sub-category</div></div>
      <div class="right" style="display:flex;gap:8px">${CTX.CAN_WRITE ? `<button class="btn" id="lwScan" ${LW.scanning ? 'disabled' : ''}>${LW.scanning ? 'Looking…' : 'Find payments'}</button>${ready.length ? `<button class="btn primary" id="lwTie">Tie & split ${ready.length}</button>` : ''}` : ''}</div></div>
      ${offs.length || orphans.length ? `<div class="hint" style="margin-bottom:10px;display:block">${offs.length ? `<b>${offs.length} invoice${offs.length > 1 ? 's don’t' : ' doesn’t'} match a payment exactly</b> — ${offs.map(i => `#${esc(i.invoice_no)} (${M[i.id].off > 0 ? 'paid ' + money(M[i.id].off, 2) + ' more' : 'paid ' + money(-M[i.id].off, 2) + ' less'})`).join(', ')}. A line may be on the wrong invoice, or a payment covered part of another one.` : ''}${orphans.length ? `${offs.length ? '<br>' : ''}<b>${orphans.length} ${esc(LW.vendor)} payment${orphans.length > 1 ? 's' : ''} with no invoice</b> — ${orphans.slice(0, 8).map(t => `${fmtD2(t.posted_on)} ${t.posted_on.slice(0, 4)} ${money(-t.amount, 2)}`).join(', ')}${orphans.length > 8 ? '…' : ''}` : ''}</div>` : ''}
      <div class="scroll-x"><table class="table lw-t"><tr><th>Invoice</th><th>Services</th><th>Paid</th><th>Total</th><th>Lines</th><th>Bank payment</th><th></th></tr>
        ${invs.slice(0, LW.showAll ? 999 : 25).map(i => { const ls = i.lines || [], lt = sum(ls.map(l => +l.amount)), off = Math.abs(lt - +i.total) > .005, op = LW.open.has(i.id);
          return `<tr class="click" data-inv="${i.id}"><td class="nowrap"><b>#${esc(i.invoice_no)}</b> <span class="muted">${esc(i.vendor)}</span></td><td class="nowrap">${i.invoice_date ? fmtD2(i.invoice_date) + ' ' + i.invoice_date.slice(0, 4) : ''}</td><td class="nowrap">${i.paid_on ? fmtD2(i.paid_on) + ' ' + i.paid_on.slice(0, 4) : '—'}</td><td class="num">${money(+i.total, 2)}</td><td>${ls.length}${off ? ' <span class="chip neg">lines ≠ total</span>' : ''}</td><td>${matchCell(i)}</td><td>${CTX.CAN_WRITE && !i.transaction_id && M[i.id] && !M[i.id].off ? `<button class="btn" style="height:28px" data-tie="${i.id}">Tie & split</button>` : ''}</td></tr>`
            + (op ? `<tr class="lw-lines"><td colspan="7"><table class="table">${ls.map(l => { const c = classifyLine(l.description); return `<tr><td class="nowrap">${l.service_date ? fmtD2(l.service_date) : ''}</td><td>${esc(l.description)}</td><td class="muted">${esc(MAP.subName[l.subcategory_id]?.name || '')}</td><td><span class="chip">${l.activity || c.act}</span></td><td class="num">${money(+l.amount, 2)}</td></tr>`; }).join('')}</table>${CTX.CAN_WRITE ? `<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px"><button class="btn" style="height:28px" data-invedit="${i.id}">${icon('edit')}<span>Edit invoice</span></button></div>` : ''}</td></tr>` : ''); }).join('') || '<tr><td colspan="7" class="muted">No invoices yet — use “Add invoice”, or “Import lines” to paste many from a spreadsheet.</td></tr>'}</table></div>
      ${invs.length > 25 && !LW.showAll ? `<div style="text-align:center;padding:10px"><button class="btn" id="lwMore">Show all ${invs.length}</button></div>` : ''}</div>

    <div class="card c-12"><div class="card-h"><div><h3>Spending by service</h3><div class="sub">From invoice lines and logged costs</div></div></div>
      <div class="scroll-x"><table class="table lw-t"><tr><th>Service</th>${years.map(y => `<th>${y}${y === String(CY) ? ' YTD' : ''}</th>`).join('')}</tr>
        ${acts.map(a => `<tr><td><i class="sw" style="background:${ACT_COL[a] || 'var(--s1)'}"></i> ${a}</td>${years.map(y => `<td class="num">${money(sum(ev.filter(e => e.st === 'done' && e.act === a && e.d.startsWith(y)).map(e => e.cost || 0)))}</td>`).join('')}</tr>`).join('')}
        <tr class="tot"><td>Total</td>${years.map(y => `<td class="num">${money(yr(+y))}</td>`).join('')}</tr></table></div></div>
  </div>`;
  if ($('#lwImp')) $('#lwImp').onclick = openLawnImport;
  if ($('#lwInv')) $('#lwInv').onclick = () => openInvoiceForm();
  $$('[data-invedit]', pg).forEach(b => b.onclick = e => { e.stopPropagation(); openInvoiceForm(INV().find(x => x.id === b.dataset.invedit)); });
  if ($('#lwAdd')) $('#lwAdd').onclick = () => openLawnAct();
  if ($('#lwScan')) $('#lwScan').onclick = lawnFindPayments;
  if ($('#lwAllPlan')) $('#lwAllPlan').onclick = () => { LW.allPlan = true; render(); };
  if ($('#lwMore')) $('#lwMore').onclick = () => { LW.showAll = true; render(); };
  if ($('#lwTie')) $('#lwTie').onclick = () => lawnTieAndSplit(ready.map(i => ({inv: i, t: M[i.id].t})));
  $$('[data-tie]', pg).forEach(b => b.onclick = e => { e.stopPropagation(); const i = INV().find(x => x.id === b.dataset.tie), m = M[i.id]; lawnTieAndSplit(m.group.map(g => ({inv: g, t: m.t}))); });
  $$('tr[data-inv]', pg).forEach(tr => tr.onclick = () => { const k = tr.dataset.inv; LW.open.has(k) ? LW.open.delete(k) : LW.open.add(k); render(); });
  $$('[data-plan]', pg).forEach(td => td.onclick = () => { if (!CTX.CAN_WRITE) return; const [a, m] = td.dataset.plan.split('|'); openLawnAct({activity: a, act_date: m < ym(today) ? m + '-15' : (m === ym(today) ? today : m + '-01'), status: m < ym(today) ? 'done' : 'planned'}); });
  $$('[data-ldone]', pg).forEach(b => b.onclick = async () => { const a = LACT().find(x => x.id === b.dataset.ldone); a.status = 'done'; await lawnSaveAct(a); render(); });
  $$('[data-ledit]', pg).forEach(b => b.onclick = () => openLawnAct(LACT().find(x => x.id === b.dataset.ledit)));
  if ($('#lwPlanAll')) $('#lwPlanAll').onclick = async () => { const end = dAdd(today, 365), add = [];
    [+today.slice(0, 4), +today.slice(0, 4) + 1].forEach(y => ty.forEach(t => { const d = dayToDate(y, t.day); if (d < today || d > end) return; if (ev.some(e => e.act === t.act && e.turf === t.turf && Math.abs(new Date(e.d) - new Date(d)) < 35 * 864e5)) return; add.push({act_date: d, activity: t.act, turf: t.turf, who: t.who || 'DIY', status: 'planned', cost: t.cost || null, notes: t.k}); }));
    for (const a of add) await lawnSaveAct(a, true); toast(`Planned ${add.length} service${add.length === 1 ? '' : 's'} from your typical year`); render(); };
}
async function lawnSaveAct(a, isNew = !a.id) {
  const rec = {household_id: CTX.HH, act_date: a.act_date, activity: a.activity, turf: a.turf || null, who: a.who || 'DIY', status: a.status || 'planned', product: a.product || null, cost: a.cost ?? null, notes: a.notes || null};
  try { if (isNew) { const {data, error} = await FDB.from('lawn_activities').insert(rec).select('id').single(); if (error) throw error; a.id = data.id; LACT().push(a); }
    else { const {error} = await FDB.from('lawn_activities').update(rec).eq('id', a.id); if (error) throw error; } }
  catch (e) { toast('Couldn’t save: ' + e.message + (/lawn_activities/.test(e.message) ? ' — run migration 1700' : '')); }
}
function openLawnAct(a0 = {}) {
  const a = {activity: 'Fertilization', turf: 'Bermuda', who: 'DIY', status: 'planned', act_date: CTX.TODAY, ...a0}, isNew = !a.id, m = $('#modal'); m.classList.remove('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">${isNew ? 'Plan or log an activity' : 'Edit activity'}</h2><p class="muted" style="font-size:12.5px">Any date — past to log it, future to plan it.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="form"><div><label>Activity</label><select class="in" id="laA">${ACTS.map(x => `<option ${x === a.activity ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div><label>Where</label><select class="in" id="laT">${TURFS.map(x => `<option ${x === a.turf ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div><label>Date</label><input class="in" type="date" id="laD" value="${a.act_date}"></div>
      <div><label>Status</label><select class="in" id="laS">${[['planned', 'Planned'], ['done', 'Done'], ['skipped', 'Skipped']].map(([k, l]) => `<option value="${k}" ${k === a.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label>Who</label><input class="in" id="laW" value="${esc(a.who)}" placeholder="DIY or company"></div>
      <div><label>Cost <span class="muted">(optional)</span></label><input class="in num" id="laC" value="${a.cost ?? ''}" placeholder="$0"></div>
      <div style="grid-column:1/-1"><label>Product / rate <span class="muted">(optional)</span></label><input class="in" id="laP" value="${esc(a.product || '')}" placeholder="e.g. Ferrous sulfate 2 oz / 1,000 sq ft"></div>
      <div style="grid-column:1/-1"><label>Notes</label><input class="in" id="laN" value="${esc(a.notes || '')}"></div></div>
    <div style="display:flex;gap:10px;margin-top:18px">${!isNew ? `<button class="btn" id="laDel" style="color:var(--neg)">Delete</button>` : ''}<span style="flex:1"></span><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="laGo">Save</button></div>`;
  openLayer('modal');
  $('#laGo').onclick = async () => { Object.assign(a, {activity: $('#laA').value, turf: $('#laT').value, act_date: $('#laD').value, status: $('#laS').value, who: $('#laW').value.trim() || 'DIY', cost: $('#laC').value.trim() ? +$('#laC').value.replace(/[$,]/g, '') : null, product: $('#laP').value.trim(), notes: $('#laN').value.trim()});
    if (!a.act_date) return toast('Pick a date'); await lawnSaveAct(a, isNew); closeAll(); render(); };
  if ($('#laDel')) $('#laDel').onclick = async () => { const {error} = await FDB.from('lawn_activities').delete().eq('id', a.id); if (error) return toast(error.message); CTX.lawnActs = LACT().filter(x => x !== a); closeAll(); render(); };
}

/* ---------------- import pasted invoice lines ---------------- */
function parseInvoiceLines(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim()); if (!lines.length) return {rows: [], err: 'Nothing pasted'};
  const sep = lines[0].includes('\t') ? '\t' : ',', split = l => sep === '\t' ? l.split('\t') : (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map(x => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
  const head = split(lines[0]).map(h => h.trim().toLowerCase()), idx = re => head.findIndex(h => re.test(h));
  const c = {sd: idx(/^service date/), desc: idx(/desc/), cost: idx(/cost|amount/), cat: idx(/^categor/), sub: idx(/^subcat/), inv: idx(/inv/), pd: idx(/^paid date/)};
  if (c.desc < 0 || c.cost < 0 || c.inv < 0) return {rows: [], err: 'Need at least Description, Cost and Inv # columns (with a header row)'};
  const dt = s => { const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim()) ? String(s).trim() : null; const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; };
  const rows = lines.slice(1).map(l => split(l)).map(f => ({sd: dt(f[c.sd]), desc: (f[c.desc] || '').trim(), amt: +String(f[c.cost] || '').replace(/[$,\s()]/g, ''), cat: (f[c.cat] || '').trim(), sub: (f[c.sub] || '').trim(), inv: String(f[c.inv] || '').trim(), pd: dt(f[c.pd])}))
    .filter(r => r.desc && r.inv && isFinite(r.amt));
  return {rows};
}
function openLawnImport() {
  const m = $('#modal'); m.classList.add('wide');
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Import invoice lines</h2><p class="muted" style="font-size:12.5px">Copy the rows from your spreadsheet (with the header row) and paste them here. Lines are grouped by Inv #; an invoice already imported is replaced.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="form"><div><label>Vendor</label><input class="in" id="liV" value="${esc(LW.vendor)}"></div><div><label>Default category</label><select class="in" id="liC">${catOptions(LAWN_CAT)}</select></div></div>
    <textarea class="in" id="liT" rows="9" style="width:100%;margin-top:10px;font-family:ui-monospace,monospace;font-size:11.5px" placeholder="Service Date	SD Year	Description	Cost	Categories	Subcategories	Inv #	Paid Date	PD Year"></textarea>
    <div id="liP" class="hint" style="display:none;margin-top:10px"></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button class="btn" onclick="closeAll()">Cancel</button><button class="btn primary" id="liGo" disabled>Import</button></div>`;
  openLayer('modal');
  let P = null;
  $('#liT').oninput = () => { P = parseInvoiceLines($('#liT').value); const g = {}; P.rows.forEach(r => (g[r.inv] ||= []).push(r));
    const n = Object.keys(g).length, ex = Object.keys(g).filter(k => INV().some(i => i.invoice_no === k && i.vendor === $('#liV').value.trim())).length, odd = P.rows.filter(r => r.sd && r.pd && r.sd > r.pd);
    $('#liP').style.display = ''; $('#liP').innerHTML = P.err ? esc(P.err) : `<b>${P.rows.length} lines · ${n} invoices · ${money(sum(P.rows.map(r => r.amt)), 2)}</b>${ex ? ` · ${ex} already imported (will be replaced)` : ''}${odd.length ? `<br><span class="neg">${odd.length} line${odd.length > 1 ? 's have a' : ' has a'} service date after the paid date (e.g. ${esc(odd[0].desc)} · ${odd[0].sd}) — check for a typo; it imports as-is.</span>` : ''}`;
    $('#liGo').disabled = !P.rows.length; };
  $('#liGo').onclick = async () => { const b = $('#liGo'); b.disabled = true; b.textContent = 'Importing…'; const vendor = $('#liV').value.trim() || 'Vendor', defCat = $('#liC').value || LAWN_CAT; LW.vendor = vendor;
    try {
      const g = {}; P.rows.forEach(r => (g[r.inv] ||= []).push(r));
      for (const [no, rows] of Object.entries(g)) {
        const sd = rows.map(r => r.sd).filter(Boolean).sort(), pd = rows.map(r => r.pd).filter(Boolean).sort().pop() || null, total = +sum(rows.map(r => r.amt)).toFixed(2);
        const {data: inv, error} = await FDB.from('invoices').upsert({household_id: CTX.HH, vendor, invoice_no: no, invoice_date: sd[0] || pd, paid_on: pd, total}, {onConflict: 'household_id,vendor,invoice_no'}).select('id').single(); if (error) throw error;
        { const {error: e2} = await FDB.from('invoice_lines').delete().eq('invoice_id', inv.id); if (e2) throw e2; }
        const recs = [];
        for (const [k, r] of rows.entries()) { const cat = catOf(r.cat) ? r.cat : defCat, cid = catId(cat), sid = r.sub ? await subId(cat, r.sub) : null, c = classifyLine(r.desc);
          if (r.sub && catOf(cat) && !catOf(cat).subs.includes(r.sub)) catOf(cat).subs.push(r.sub);
          recs.push({household_id: CTX.HH, invoice_id: inv.id, service_date: r.sd, description: r.desc, amount: r.amt, category_id: cid, subcategory_id: sid, activity: c.act, turf: c.turf, sort_order: k}); }
        const {error: e3} = await FDB.from('invoice_lines').insert(recs); if (e3) throw e3;
      }
      await lawnReloadInvoices(); closeAll(); toast(`Imported ${Object.keys(g).length} invoices`); LW.cand = null; render(); lawnFindPayments();
    } catch (e) { b.disabled = false; b.textContent = 'Import'; toast('Import failed: ' + e.message + (/invoice/.test(e.message) ? ' — run migration 1700' : '')); } };
}

/* ---------------- add / edit one invoice ----------------
   enter the total and its lines; the lines must add up to the total, then pick the bank payment it ties to
   (exact amount near the paid date) and the payment is split by sub-category */
function openInvoiceForm(inv0) {
  const isNew = !inv0, m = $('#modal'); m.classList.add('wide');
  const F = {vendor: inv0?.vendor || LW.vendor, no: inv0?.invoice_no || '', total: inv0 ? (+inv0.total).toFixed(2) : '', paid: inv0?.paid_on || CTX.TODAY,
    cat: (inv0?.lines?.[0] && MAP.catName[inv0.lines[0].category_id]) || LAWN_CAT,
    lines: inv0 ? inv0.lines.map(l => ({d: l.service_date || '', desc: l.description, sub: MAP.subName[l.subcategory_id]?.name || '', amt: (+l.amount).toFixed(2)})) : [{d: '', desc: '', sub: '', amt: ''}],
    tx: inv0?.transaction_id || null, cand: null, busy: false};
  const num = v => { const x = +String(v).replace(/[$,\s]/g, ''); return isFinite(x) ? x : NaN; };
  const subs = () => catOf(F.cat)?.subs || [];
  const lineSum = () => +sum(F.lines.map(l => num(l.amt) || 0)).toFixed(2);
  const totalOk = () => { const t = num(F.total); return F.total !== '' && isFinite(t) && t > 0 && Math.abs(lineSum() - t) < .005 && F.lines.every(l => l.desc.trim() && isFinite(num(l.amt)) && l.amt !== ''); };
  const near = (a, b) => Math.round(Math.abs(new Date(a) - new Date(b)) / 864e5);
  let tm = null;
  const lookup = () => { clearTimeout(tm); tm = setTimeout(async () => { const t = num(F.total); if (!(t > 0) || !F.paid) { F.cand = null; draw(); return; }
    const lo = dAdd(F.paid, -12), hi = dAdd(F.paid, 12), v = F.vendor.trim().split(' ')[0] || '';
    try { const sel = 'id, posted_on, description, amount, is_split, category_id';
      const [a, b] = await Promise.all([FDB.from('transactions').select(sel).eq('household_id', CTX.HH).gte('posted_on', lo).lte('posted_on', hi).eq('amount', (-t).toFixed(2)),
        v ? FDB.from('transactions').select(sel).eq('household_id', CTX.HH).gte('posted_on', lo).lte('posted_on', hi).lt('amount', 0).ilike('description', `%${v}%`) : {data: []}]);
      if (a.error) throw a.error; const all = [...a.data]; (b.data || []).forEach(x => { if (!all.some(y => y.id === x.id)) all.push(x); });
      const tiedTo = id => INV().filter(i => i.transaction_id === id && i.id !== inv0?.id);
      F.cand = all.map(x => { const others = tiedTo(x.id); return {...x, others, shared: others.length > 0 && x.id === inv0?.transaction_id, exact: Math.abs(-x.amount - t - sum(others.map(o => +o.total))) < .005, days: near(x.posted_on, F.paid)}; })
        .sort((p, q) => (q.exact - p.exact) || (q.description.toLowerCase().includes(v.toLowerCase()) - p.description.toLowerCase().includes(v.toLowerCase())) || p.days - q.days).slice(0, 6);
      if (!F.tx) { const best = F.cand.find(c => c.exact && (!c.others.length || c.shared)); if (best) F.tx = best.id; }
    } catch (e) { F.cand = []; toast('Couldn’t look up payments: ' + e.message); }
    draw(); }, 350); };
  const status = () => { const t = num(F.total), ls = lineSum();
    if (F.total === '' || !isFinite(t)) return `<span class="muted">Enter the invoice total</span>`;
    const d = +(t - ls).toFixed(2);
    return Math.abs(d) < .005 ? `<span class="pos"><b>✓ Lines add up to the total</b> · ${money(ls, 2)}</span>` : `<span class="neg"><b>Lines ${money(ls, 2)} vs. total ${money(t, 2)}</b> · ${d > 0 ? money(d, 2) + ' still to assign' : money(-d, 2) + ' over'}</span>`; };
  const candHtml = () => { if (F.cand == null) return `<p class="muted" style="margin:6px 0">Enter the total and paid date to look for the payment.</p>`;
    if (!F.cand.length) return `<p class="muted" style="margin:6px 0">No payment of ${money(num(F.total), 2)} within 12 days of ${fmtD2(F.paid)}. Save now and tie it later with “Find payments”.</p>`;
    return F.cand.map(c => { const dis = !c.exact || (c.others.length && !c.shared); const diff = -c.amount - num(F.total);
      return `<label class="inv-c ${dis ? 'dis' : ''}"><input type="radio" name="ivTx" value="${c.id}" ${F.tx === c.id ? 'checked' : ''} ${dis ? 'disabled' : ''}><span><b>${fmtD2(c.posted_on)} ${c.posted_on.slice(0, 4)}</b> · ${money(-c.amount, 2)} <span class="muted">· ${esc(c.description.slice(0, 48))}</span></span>
        <span class="${!dis ? 'pos' : 'neg'}" style="margin-left:auto;white-space:nowrap">${c.shared ? (c.exact ? `✓ paid together with #${c.others.map(o => esc(o.invoice_no)).join(', #')}` : `doesn’t match with #${c.others.map(o => esc(o.invoice_no)).join(', #')}`) : c.others.length ? `already tied to #${c.others.map(o => esc(o.invoice_no)).join(', #')}` : c.exact ? `✓ amount matches${c.days ? ` · ${c.days}d from paid date` : ''}` : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff), 2)} off`}</span></label>`; }).join('')
      + `<label class="inv-c"><input type="radio" name="ivTx" value="" ${!F.tx ? 'checked' : ''}><span class="muted">Don’t tie it yet</span></label>`; };
  const draw = () => {
    const foc = document.activeElement, fk = foc?.dataset?.k, fi = foc?.dataset?.i, pos = foc?.selectionStart;
    m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">${isNew ? 'Add an invoice' : 'Edit invoice #' + esc(inv0.invoice_no)}</h2><p class="muted" style="font-size:12.5px">Enter the total and each line. Once the lines add up, pick the bank payment and it’s split by sub-category.</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
      <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div><label>Vendor</label><input class="in" data-k="vendor" value="${esc(F.vendor)}"></div>
        <div><label>Invoice #</label><input class="in" data-k="no" value="${esc(F.no)}" placeholder="5952"></div>
        <div><label>Invoice total</label><input class="in num" data-k="total" value="${esc(F.total)}" placeholder="$0.00" inputmode="decimal"></div>
        <div><label>Paid on</label><input class="in" type="date" data-k="paid" value="${F.paid}"></div>
        <div><label>Category</label><select class="in" data-k="cat">${catOptions(F.cat)}</select></div></div>
      <div class="scroll-x" style="margin-top:12px"><table class="table inv-f"><tr><th>Service date</th><th>Description</th><th>Sub-category</th><th>Amount</th><th></th></tr>
        ${F.lines.map((l, i) => `<tr><td><input class="in" type="date" data-k="d" data-i="${i}" value="${l.d}"></td><td><input class="in" data-k="desc" data-i="${i}" value="${esc(l.desc)}" placeholder="Bermuda Program: Round 3 - Fertilization"></td>
          <td><input class="in" list="ivSubs" data-k="sub" data-i="${i}" value="${esc(l.sub)}" placeholder="pick or type"></td><td><input class="in num" data-k="amt" data-i="${i}" value="${esc(l.amt)}" placeholder="0.00" inputmode="decimal"></td>
          <td>${F.lines.length > 1 ? `<button class="mini-btn" data-del="${i}" title="Remove line">${icon('close')}</button>` : ''}</td></tr>`).join('')}</table></div>
      <datalist id="ivSubs">${subs().map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap"><button class="btn" id="ivAdd" style="height:30px">${icon('plus')}<span>Add line</span></button>
        ${F.lines.length > 1 && num(F.total) > 0 ? `<button class="btn" id="ivFill" style="height:30px" title="Put the remaining amount on the last line">Fill last line</button>` : ''}<span style="margin-left:auto;font-size:13px">${status()}</span></div>
      <h4 style="margin:16px 0 6px;font-size:13px">Bank payment</h4><div class="inv-cands">${candHtml()}</div>
      <div style="display:flex;gap:10px;margin-top:18px">${!isNew ? `<button class="btn" id="ivDel" style="color:var(--neg)">Delete</button>` : ''}<span style="flex:1"></span><button class="btn" onclick="closeAll()">Cancel</button>
        <button class="btn primary" id="ivGo" ${totalOk() && F.no.trim() && !F.busy ? '' : 'disabled'}>${F.busy ? 'Saving…' : F.tx ? 'Save, tie & split' : 'Save invoice'}</button></div>`;
    $$('[data-k]', m).forEach(el => { el.oninput = el.onchange = () => { const k = el.dataset.k, i = el.dataset.i;
        if (i != null) F.lines[+i][k] = el.value; else F[k] = el.value;
        if (k === 'total' || k === 'paid' || k === 'vendor') { if (k !== 'vendor') F.tx = null; lookup(); }
        if (el.tagName === 'SELECT' || el.type === 'date') draw(); else softDraw(); }; });
    $$('[data-del]', m).forEach(b => b.onclick = () => { F.lines.splice(+b.dataset.del, 1); draw(); });
    $$('input[name=ivTx]', m).forEach(r => r.onchange = () => { F.tx = r.value || null; draw(); });
    $('#ivAdd').onclick = () => { const last = F.lines[F.lines.length - 1]; F.lines.push({d: last?.d || '', desc: '', sub: last?.sub || '', amt: ''}); draw(); $$('[data-k=desc]', m).pop()?.focus(); };
    if ($('#ivFill')) $('#ivFill').onclick = () => { const l = F.lines[F.lines.length - 1], rest = num(F.total) - sum(F.lines.slice(0, -1).map(x => num(x.amt) || 0)); l.amt = rest.toFixed(2); draw(); };
    $('#ivGo').onclick = save;
    if ($('#ivDel')) $('#ivDel').onclick = async () => { if (!confirm(`Delete invoice #${inv0.invoice_no}? The bank payment keeps its current split.`)) return;
      const {error} = await FDB.from('invoices').delete().eq('id', inv0.id); if (error) return toast(error.message); CTX.invoices = INV().filter(x => x.id !== inv0.id); closeAll(); render(); };
    if (fk) { const el = fi != null ? m.querySelector(`[data-k="${fk}"][data-i="${fi}"]`) : m.querySelector(`[data-k="${fk}"]:not([data-i])`); if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch (_) {} } }
  };
  // typing shouldn't rebuild the form — just refresh the check and the button
  const softDraw = () => { const st = m.querySelector('#ivAdd')?.parentElement?.lastElementChild; if (st) st.innerHTML = status(); const go = $('#ivGo'); if (go) go.disabled = !(totalOk() && F.no.trim() && !F.busy); };
  async function save() {
    if (!totalOk()) return toast('The lines need to add up to the total');
    const vendor = F.vendor.trim() || 'Vendor', no = F.no.trim(), total = +num(F.total).toFixed(2);
    if (INV().some(i => i.vendor === vendor && i.invoice_no === no && i.id !== inv0?.id)) return toast(`Invoice #${no} from ${vendor} already exists — edit that one instead`);
    F.busy = true; draw(); LW.vendor = vendor;
    try {
      const ds = F.lines.map(l => l.d).filter(Boolean).sort(), rec = {household_id: CTX.HH, vendor, invoice_no: no, invoice_date: ds[0] || F.paid || null, paid_on: F.paid || null, total};
      let id = inv0?.id;
      if (id) { const {error} = await FDB.from('invoices').update(rec).eq('id', id); if (error) throw error; }
      else { const {data, error} = await FDB.from('invoices').insert(rec).select('id').single(); if (error) throw error; id = data.id; }
      { const {error} = await FDB.from('invoice_lines').delete().eq('invoice_id', id); if (error) throw error; }
      const cid = catId(F.cat), recs = [];
      for (const [k, l] of F.lines.entries()) { const sub = l.sub.trim(), sid = sub ? await subId(F.cat, sub) : null, c = classifyLine(l.desc);
        if (sub && catOf(F.cat) && !catOf(F.cat).subs.includes(sub)) catOf(F.cat).subs.push(sub);
        recs.push({household_id: CTX.HH, invoice_id: id, service_date: l.d || null, description: l.desc.trim(), amount: +num(l.amt).toFixed(2), category_id: cid, subcategory_id: sid, activity: c.act, turf: c.turf, sort_order: k}); }
      { const {error} = await FDB.from('invoice_lines').insert(recs); if (error) throw error; }
      // a changed payment link: untie the old one first
      if (inv0?.transaction_id && inv0.transaction_id !== F.tx) { const {error} = await FDB.from('invoices').update({transaction_id: null}).eq('id', id); if (error) throw error; }
      await lawnReloadInvoices();
      const inv = INV().find(x => x.id === id), t = F.tx && F.cand?.find(c => c.id === F.tx);
      closeAll();
      if (t) await lawnTieAndSplit([inv, ...(t.shared ? INV().filter(i => i.transaction_id === t.id && i.id !== inv.id) : [])].map(i => ({inv: i, t})));
      else if (F.tx && inv0?.transaction_id === F.tx) {   // still tied to the same payment: re-split with the new lines
        const {data, error} = await FDB.from('transactions').select('id, posted_on, description, amount').eq('id', F.tx).single();
        if (!error && Math.abs(-data.amount - total) < .005) await lawnTieAndSplit([{inv, t: data}]);
        else { await FDB.from('invoices').update({transaction_id: null}).eq('id', id); inv.transaction_id = null; toast('Saved · the new total no longer matches its payment, so it was untied'); render(); }
      } else { toast(`Saved invoice #${no}`); render(); }
    } catch (e) { F.busy = false; draw(); toast('Couldn’t save: ' + e.message + (/invoice/.test(e.message) ? ' — run migration 1700' : '')); }
  }
  openLayer('modal'); draw(); if (F.total) lookup();
}
