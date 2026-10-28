/* =====================================================================
   TRANSACTIONS · CLEAN UP — quality checks for vendor names and categories, each with a one-click fix.
   Works on the loaded transactions; every fix has Undo, and anything you dismiss stays dismissed (saved with your preferences).
   ===================================================================== */
let QC_TAB = 'vendors';
const qcIgn = () => new Set(UI.qcIgnore || []);
const qcIgnore = key => { UI.qcIgnore = [...new Set([...(UI.qcIgnore || []), key])]; SYNC.schedule(); };
const qcLetters = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
const qcDice = (a, b) => { const g = s => { const o = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); o.set(k, (o.get(k) || 0) + 1); } return o; };
  const A = g(a), B = g(b); let n = 0; A.forEach((v, k) => { n += Math.min(v, B.get(k) || 0); }); return (2 * n) / Math.max(1, a.length - 1 + b.length - 1); };
// same merchant? one name is the start of the other ("Integris" / "Integris Health"), or the letters are mostly the same
const qcSame = (a, b) => { const x = qcLetters(a), y = qcLetters(b); return x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x) || qcDice(x, y) >= .72); };
// rename every transaction whose vendor is one of `from` to `to` (an alias per vendor key, so history and future imports follow)
function qcMergeVendors(from, to) {
  const keys = new Set(); ST.tx.forEach(t => { if (from.includes(vName(t.desc))) { const k = vendorKey(t.desc); if (k) keys.add(k); } });
  const before = ST.valias.map(a => ({...a}));
  keys.forEach(k => { const hit = VALIAS_FOR(k), pat = hit ? hit.pattern : k, ex = ST.valias.find(a => a.pattern === pat); if (ex) ex.name = to; else ST.valias.push({pattern: pat, name: to}); });
  setAliases(ST.valias);
  return () => { ST.valias = before; setAliases(ST.valias); };
}
function qcData() {
  const ign = qcIgn(), V = {};
  ST.tx.forEach(t => { const n = vName(t.desc), v = V[n] ||= {n, tx: [], cats: {}}; v.tx.push(t); if (!t.splits) { const k = (t.cat || '') + '|' + (t.sub || ''); v.cats[k] = (v.cats[k] || 0) + 1; } });
  const vs = Object.values(V);
  // look-alike vendor names: same first 5 letters (e.g. "Amazon Mktplace" / "Amazon.com"), or one name inside another
  const fam = {}; vs.forEach(v => { const k = qcLetters(v.n).slice(0, 5); if (k.length >= 4) (fam[k] ||= []).push(v); });
  const dups = Object.entries(fam).filter(([k, g]) => g.length > 1 && !ign.has('dup:' + k)).map(([k, g]) => { g.sort((a, b) => b.tx.length - a.tx.length); return {k, g, like: new Set(g.slice(1).filter(v => qcSame(v.n, g[0].n)).map(v => v.n))}; })
    .filter(d => d.like.size).sort((a, b) => sum(b.g.map(v => v.tx.length)) - sum(a.g.map(v => v.tx.length)));
  // messy names: card/terminal codes, store numbers, asterisks, or very long
  const messy = vs.filter(v => !ign.has('name:' + v.n) && (/\d{3,}|[*#]|\b(pos|ach|debit|purchase|chk|dir dep|ppd|web id)\b/i.test(v.n) || v.n.length > 30)).sort((a, b) => b.tx.length - a.tx.length);
  // uncategorized, grouped by vendor, with what history suggests
  const unc = vs.map(v => ({v, tx: v.tx.filter(t => !t.cat && !t.splits)})).filter(x => x.tx.length).map(x => ({...x, m: matchCat(x.tx[0].desc, x.tx[0].amt)})).sort((a, b) => b.tx.length - a.tx.length);
  // vendors filed inconsistently: one category › sub-category clearly dominates, a few transactions sit elsewhere
  const mixed = vs.map(v => { const e = Object.entries(v.cats).filter(([k]) => k !== '|').sort((a, b) => b[1] - a[1]), n = sum(e.map(x => x[1]));
    if (e.length < 2 || n < 4 || e[0][1] / n < .75 || ign.has('mix:' + v.n)) return null;
    const [c, s] = e[0][0].split('|'), odd = v.tx.filter(t => !t.splits && t.cat && ((t.cat || '') + '|' + (t.sub || '')) !== e[0][0]);
    return {v, c, s, share: e[0][1] / n, odd, others: e.slice(1)}; }).filter(Boolean).sort((a, b) => b.odd.length - a.odd.length);
  // missing sub-category: the category has sub-categories and this vendor's other transactions there use one
  const nosub = [];
  vs.forEach(v => { const byCat = {}; v.tx.forEach(t => { if (t.splits || !t.cat || !(catOf(t.cat)?.subs || []).length) return; (byCat[t.cat] ||= []).push(t); });
    Object.entries(byCat).forEach(([c, list]) => { const miss = list.filter(t => !t.sub); if (!miss.length || ign.has(`sub:${v.n}|${c}`)) return;
      const cnt = {}; list.forEach(t => { if (t.sub) cnt[t.sub] = (cnt[t.sub] || 0) + 1; }); const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      nosub.push({v, c, miss, best: best ? best[0] : '', seen: best ? best[1] : 0}); }); });
  nosub.sort((a, b) => (b.best ? 1 : 0) - (a.best ? 1 : 0) || b.miss.length - a.miss.length);
  return {dups, messy, unc, mixed, nosub};
}
// the badge counts the ones that most likely need a fix: look-alikes, uncategorized and strays (messy names and missing sub-categories are in the panel too)
const qcCount = () => { try { const d = qcData(); return d.dups.length + d.unc.length + d.mixed.length; } catch (e) { return 0; } };

function openCleanup() {
  const m = $('#modal'); m.classList.add('wide');
  const D = qcData(), amt = list => money(sum(list.map(t => t.amt)), 0);
  const tabs = [['vendors', 'Vendor names', D.dups.length + D.messy.length], ['cats', 'Categories', D.unc.length + D.mixed.length + D.nosub.length]];
  const sec = (t, sub, n, body) => `<div class="qc-sec"><div class="qc-h"><h3>${t} <span class="chip">${n}</span></h3><div class="muted">${sub}</div></div>${n ? body : '<p class="muted qc-ok">Nothing to fix here.</p>'}</div>`;
  const view = n => `<button class="link" data-qview="${esc(n)}">View</button>`;
  const skip = k => `<button class="link muted" data-qign="${esc(k)}" title="Not a problem — don't show it again">Dismiss</button>`;
  const vendors = sec('Look-alike vendors', 'Names that look like the same merchant · ticked ones merge into the name on the right (untick any that are different)', D.dups.length, D.dups.slice(0, 40).map((d, i) => `<div class="qc-row">
      <div class="qc-main">${d.g.map(v => `<label class="qc-v"><input type="checkbox" data-qd="${i}" value="${esc(v.n)}" ${v === d.g[0] || d.like.has(v.n) ? 'checked' : ''}> ${esc(v.n)} <span class="muted">· ${v.tx.length}</span></label>`).join('')}</div>
      <div class="qc-act"><input class="in sm" data-qdn="${i}" list="qcNames${i}" value="${esc(d.g[0].n)}" style="width:170px"><datalist id="qcNames${i}">${d.g.map(v => `<option value="${esc(v.n)}">`).join('')}</datalist>
        <button class="btn primary sm" data-qdgo="${i}">Merge</button>${skip('dup:' + d.k)}</div></div>`).join(''))
    + sec('Messy names', 'Store numbers, card codes or long bank text · give it a clean name', D.messy.length, D.messy.slice(0, 60).map((v, i) => `<div class="qc-row">
      <div class="qc-main"><b>${esc(v.n)}</b><div class="muted ell" style="font-size:var(--fs-xs)">${v.tx.length} transaction${v.tx.length === 1 ? '' : 's'} · ${esc(v.tx[0].desc)}</div></div>
      <div class="qc-act"><input class="in sm" data-qmn="${i}" value="${esc(v.n.replace(/\s*[#*].*$/, '').replace(/\s+\d{3,}.*$/, '').replace(/\b(Pos|Ach|Debit|Purchase|Chk|Card|Pmt)\b/gi, '').replace(/\s{2,}/g, ' ').trim() || v.n)}" style="width:170px">
        <button class="btn primary sm" data-qmgo="${i}">Rename</button>${view(v.n)}${skip('name:' + v.n)}</div></div>`).join(''));
  const cats = sec('Uncategorized', 'Grouped by vendor · the suggestion comes from how similar transactions were filed', D.unc.length, D.unc.slice(0, 60).map((u, i) => `<div class="qc-row">
      <div class="qc-main"><b>${esc(u.v.n)}</b><div class="muted" style="font-size:var(--fs-xs)">${u.tx.length} transaction${u.tx.length === 1 ? '' : 's'} · ${amt(u.tx)}${u.m.how !== 'new' ? ` · suggests ${esc(u.m.cat)}${u.m.sub ? ' › ' + esc(u.m.sub) : ''}` : ''}</div></div>
      <div class="qc-act"><select class="in sm sel" data-quc="${i}">${catOptions(u.m.how !== 'new' ? u.m.cat : '', {blank: 'Category…'})}</select><select class="in sm sel" data-qus="${i}">${subOptions(u.m.how !== 'new' ? u.m.cat : '', u.m.sub || '')}</select>
        <button class="btn primary sm" data-qugo="${i}">Apply</button>${view(u.v.n)}</div></div>`).join(''))
    + sec('Same vendor, different categories', 'Most of a vendor’s transactions go one place and a few don’t · move the strays, or dismiss if they’re right', D.mixed.length, D.mixed.slice(0, 60).map((x, i) => `<div class="qc-row">
      <div class="qc-main"><b>${esc(x.v.n)}</b><div class="muted" style="font-size:var(--fs-xs)">${Math.round(x.share * 100)}% in ${esc(x.c)}${x.s ? ' › ' + esc(x.s) : ''} · ${x.odd.length} elsewhere: ${x.others.slice(0, 3).map(([k, n]) => esc(k.replace('|', ' › ').replace(/ › $/, '')) + ' (' + n + ')').join(', ')}</div></div>
      <div class="qc-act"><button class="btn primary sm" data-qxgo="${i}">Move ${x.odd.length} to ${esc(x.c)}${x.s ? ' › ' + esc(x.s) : ''}</button>${view(x.v.n)}${skip('mix:' + x.v.n)}</div></div>`).join(''))
    + sec('Missing sub-category', 'The category has sub-categories but these transactions don’t use one', D.nosub.length, D.nosub.slice(0, 60).map((x, i) => `<div class="qc-row">
      <div class="qc-main"><b>${esc(x.v.n)}</b> <span class="muted">· ${esc(x.c)}</span><div class="muted" style="font-size:var(--fs-xs)">${x.miss.length} without a sub-category · ${amt(x.miss)}${x.best ? ` · ${x.seen} others use ${esc(x.best)}` : ''}</div></div>
      <div class="qc-act"><select class="in sm sel" data-qns="${i}">${subOptions(x.c, x.best)}</select><button class="btn primary sm" data-qngo="${i}">Apply</button>${view(x.v.n)}${skip(`sub:${x.v.n}|${x.c}`)}</div></div>`).join(''));
  m.innerHTML = `<div class="dh"><div><h2 style="font-size:20px">Clean up</h2><p class="muted" style="font-size:12.5px">Checks on ${ST.tx.length.toLocaleString()} loaded transactions · every fix can be undone</p></div><button class="x" onclick="closeAll()">${icon('close')}</button></div>
    <div class="seg" id="qcTab" style="margin:4px 0 14px">${tabs.map(([k, l, n]) => `<button data-k="${k}" class="${QC_TAB === k ? 'on' : ''}">${l} · ${n}</button>`).join('')}</div>
    <div class="qc-body">${QC_TAB === 'vendors' ? vendors : cats}</div>`;
  if (!m.classList.contains('on')) openLayer('modal');
  const again = () => { const y = m.querySelector('.qc-body')?.scrollTop || 0; openCleanup(); const b = m.querySelector('.qc-body'); if (b) b.scrollTop = y; render(); };
  $$('#qcTab button', m).forEach(b => b.onclick = () => { QC_TAB = b.dataset.k; openCleanup(); });
  $$('[data-qview]', m).forEach(b => b.onclick = () => { TXF.vendor = b.dataset.qview; TXF.cat = '*'; TXF.sub = '*'; TXF.unc = false; TXF.month = ''; closeAll(); go('tx'); });
  $$('[data-qign]', m).forEach(b => b.onclick = () => { qcIgnore(b.dataset.qign); again(); });
  $$('[data-qdgo]', m).forEach(b => b.onclick = () => { const i = b.dataset.qdgo, to = $(`[data-qdn="${i}"]`, m).value.trim(), from = $$(`[data-qd="${i}"]:checked`, m).map(c => c.value).filter(n => n !== to);
    if (!to || !from.length) return toast('Tick at least one other name to merge'); const undo = qcMergeVendors(from, to); toast(`Merged ${from.length} into ${to}`, () => { undo(); render(); }); again(); });
  $$('[data-qmgo]', m).forEach(b => b.onclick = () => { const v = D.messy[b.dataset.qmgo], to = $(`[data-qmn="${b.dataset.qmgo}"]`, m).value.trim(); if (!to || to === v.n) return;
    const undo = qcMergeVendors([v.n], to); toast(`${v.n} → ${to}`, () => { undo(); render(); }); again(); });
  $$('[data-quc]', m).forEach(s => wireCatSub(s, $(`[data-qus="${s.dataset.quc}"]`, m)));
  $$('[data-qugo]', m).forEach(b => b.onclick = () => { const u = D.unc[b.dataset.qugo], c = $(`[data-quc="${b.dataset.qugo}"]`, m).value, s = $(`[data-qus="${b.dataset.qugo}"]`, m).value;
    if (!c) return toast('Pick a category'); if (typeof flushSubs === 'function') flushSubs(); recat(u.tx.map(t => t.id), c, s === '__new' ? '' : s, `${u.tx.length} ${u.v.n} → ${c}${s && s !== '__new' ? ' › ' + s : ''}`); again(); });
  $$('[data-qxgo]', m).forEach(b => b.onclick = () => { const x = D.mixed[b.dataset.qxgo]; recat(x.odd.map(t => t.id), x.c, x.s, `${x.odd.length} ${x.v.n} → ${x.c}${x.s ? ' › ' + x.s : ''}`); again(); });
  $$('[data-qngo]', m).forEach(b => b.onclick = () => { const x = D.nosub[b.dataset.qngo], s = $(`[data-qns="${b.dataset.qngo}"]`, m).value; if (!s || s === '__new') return toast('Pick a sub-category');
    recat(x.miss.map(t => t.id), x.c, s, `${x.miss.length} ${x.v.n} → ${x.c} › ${s}`); again(); });
}
