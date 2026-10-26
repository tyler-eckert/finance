/* =====================================================================
   THIS WEEK — the weekly digest: calendars (Medical, Family, Trailer Folk…) + bills of $500 or more, loan and tax payments.
   The digest is built by the weekly-digest Edge Function (Sunday 5 pm by default) and saved in finance.digests;
   this page shows it, keeps the two of you a notes box per week, and Admin → Weekly digest manages the calendar links.
   ===================================================================== */
Object.assign(I, {refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>', week: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 14h3M7.5 17h6"/>'});
// a readable reason from a failed function call: our own {error} body, or the status Supabase answered with
async function fnErr(error, data) { if (data?.error) return data.error; const r = error?.context; let t = '';
  try { t = r && typeof r.text === 'function' ? await r.text() : ''; } catch (e) {}
  try { const j = JSON.parse(t); if (j.error || j.msg || j.message) return j.error || j.msg || j.message; } catch (e) {}
  const st = r?.status; if (st === 546 || /WORKER_LIMIT/i.test(t)) return 'the function ran out of time or memory (546) — a very large calendar? Check Edge Functions → weekly-digest → Logs';
  if (st === 404) return 'the weekly-digest function isn’t deployed (404)'; if (st === 401) return 'sign in again, and check Enforce JWT Verification is off (401)';
  return (st ? `status ${st}` : '') + (t ? ` · ${t.slice(0, 160)}` : '') || error?.message || 'unknown error'; }
const DG = {feeds: null, digests: null, loading: false, err: null, sel: null, busy: false};
const DGS = () => ({tz: 'America/Chicago', threshold: 500, days: 14, sendDow: 0, sendHour: 17, email: true, emails: [], ...(CTX.settings?.digest || {})});
const dgAgo = t => { const m = Math.round((Date.now() - new Date(t).getTime()) / 60e3); return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 24 * 60 ? `${Math.round(m / 60)} hr ago` : new Date(t).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'}); };
const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dgDay = d => { const t = new Date(d + 'T12:00:00'); return {dow: DAYN[t.getDay()], short: DAYN[t.getDay()].slice(0, 3), md: `${MON[t.getMonth()]} ${t.getDate()}`}; };
const dgRange = (a, b) => { const A = dgDay(a), B = dgDay(b); return a.slice(5, 7) === b.slice(5, 7) ? `${A.md}–${+b.slice(8, 10)}` : `${A.md} – ${B.md}`; };
const dgPlus = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };

async function loadDigest(force) {
  if (DG.loading || (!force && DG.digests)) return; DG.loading = true;
  try {
    const [f, d] = await Promise.all([FDB.from('calendar_feeds').select('*').eq('household_id', CTX.HH).order('sort_order').order('created_at'),
      FDB.from('digests').select('id, week_start, range_end, generated_at, payload, notes, emailed_at, emailed_to').eq('household_id', CTX.HH).order('week_start', {ascending: false}).limit(12)]);
    if (f.error || d.error) throw (f.error || d.error);
    DG.feeds = f.data || []; DG.digests = d.data || []; DG.err = null;
  } catch (e) { DG.err = /calendar_feeds|digests|does not exist|schema cache/i.test(e.message || '') ? 'Run migration 20261026002000_finance_weekly_digest.sql in Supabase to turn on the weekly digest.' : (e.message || String(e)); DG.feeds ||= []; DG.digests ||= []; }
  DG.loading = false; if (['week', 'admin', 'overview'].includes(cur)) render();
  dgAutoRefresh();
}
/* keep the digest current: when it's more than an hour old (or a new week has started), rebuild it quietly — no email */
const dgWeekStart = () => { const t = new Date(), w = t.getDay(), add = w === 0 ? 1 : w === 6 ? 2 : 1 - w; t.setDate(t.getDate() + add); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
function dgAutoRefresh() {
  if (DG.busy || DG.err || !DG.feeds?.length || Date.now() - (DG.autoAt || 0) < 15 * 60e3) return;
  const L = DG.digests?.[0], stale = !L || L.week_start < dgWeekStart() || Date.now() - new Date(L.generated_at).getTime() > 60 * 60e3;
  if (!stale) return; DG.autoAt = Date.now(); buildDigestNow(false, true);
}
async function buildDigestNow(send, quiet) {
  if (DG.busy) return; DG.busy = true; if (['week', 'admin', 'overview'].includes(cur)) render();
  const {data, error} = await sb.functions.invoke('weekly-digest', {body: {household_id: CTX.HH, send}});
  DG.busy = false;
  if (error || data?.error) { const msg = await fnErr(error, data); if (quiet) { console.warn('[fin] digest refresh', msg); if (['week', 'admin', 'overview'].includes(cur)) render(); return; } toast('Couldn’t build the digest: ' + msg, null, 12000); render(); return; }
  const keepSel = quiet && DG.sel; await loadDigest(true); DG.sel = keepSel || data.week_start;
  if (quiet) return;
  toast(`Digest for ${dgRange(data.week_start, data.range_end)} built${data.emailed?.length ? ' and emailed to ' + data.emailed.join(', ') : data.emailNote ? ' · ' + data.emailNote : ''}`);
}

/* ---------------- page: This week ---------------- */
function renderWeek(pg) {
  if (!DG.digests) { loadDigest(); pg.innerHTML = `<div class="card"><p class="muted">Loading this week…</p></div>`; return; }
  setTimeout(dgAutoRefresh, 0);
  const list = DG.digests, D0 = list.find(d => d.week_start === DG.sel) || list[0], S = DGS(), w = CTX.CAN_WRITE;
  const tools = `<div class="toolbar wrap">${list.length ? `<select class="in sel" id="wkSel">${list.map(d => `<option value="${d.week_start}" ${d === D0 ? 'selected' : ''}>${dgRange(d.week_start, dgPlus(d.week_start, 6))}${d === list[0] ? ' · latest' : ''}</option>`).join('')}</select>` : ''}${DG.busy ? `<span class="muted" style="font-size:12px">Refreshing…</span>` : list[0] ? `<span class="muted" style="font-size:12px">Updated ${dgAgo(list[0].generated_at)}</span>` : ''}
    ${w ? `<div style="margin-left:auto;display:flex;gap:8px"><button class="btn" id="wkBuild" ${DG.busy ? 'disabled' : ''}>${icon('refresh')}<span>${DG.busy ? 'Refreshing…' : 'Refresh'}</span></button><button class="btn" id="wkSet">${icon('gear')}<span>Calendars & email</span></button></div>` : ''}</div>`;
  if (DG.err) { pg.innerHTML = tools + `<div class="banner">${icon('warn')}<span>${esc(DG.err)}</span></div>`; wireWeek(pg); return; }
  if (!D0) { pg.innerHTML = tools + `<div class="grid g-12"><div class="card c-12 dg-empty"><div class="card-h"><div><h3>No digest yet</h3><div class="sub">${DG.feeds.length ? `${DG.feeds.length} calendar${DG.feeds.length === 1 ? '' : 's'} connected · the first digest arrives ${DAYN[S.sendDow]} at ${S.sendHour % 12 || 12} ${S.sendHour < 12 ? 'am' : 'pm'}, or build one now` : 'Connect your calendars first: Admin → Weekly digest'}</div></div></div>
    ${w ? `<div style="display:flex;gap:8px">${DG.feeds.length ? `<button class="btn primary" id="wkBuild2">${icon('refresh')}<span>Build this week’s digest</span></button>` : `<button class="btn primary" id="wkSet2">${icon('plus')}<span>Connect calendars</span></button>`}</div>` : ''}</div></div>`; wireWeek(pg); return; }
  const P = D0.payload, wk1End = dgPlus(P.from, 6), days1 = P.days.filter(d => d.date <= wk1End), days2 = P.days.filter(d => d.date > wk1End);
  const today = ym(CTX.TODAY) ? CTX.TODAY : new Date().toISOString().slice(0, 10);
  const evRow = e => `<div class="dg-ev"><i style="background:${esc(e.color)}"></i><span class="dg-t">${e.allDay ? 'All day' : esc(e.time)}</span><span class="dg-n">${esc(e.title)}${e.cont ? ' <span class="muted">(continues)</span>' : ''}<small>${esc(e.cal)}${e.location ? ' · ' + esc(e.location) : ''}</small></span></div>`;
  const billRow = b => `<div class="dg-ev dg-bill ${b.why}"><i></i><span class="dg-t">${b.why === 'milestone' ? 'Planned' : b.why === 'tax' ? 'Tax' : b.why === 'loan' ? 'Loan' : 'Bill'}</span><span class="dg-n">${esc(b.name)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</span><b class="num">${b.amount ? money(b.amount) : ''}</b></div>`;
  const dayCard = d => { const L = dgDay(d.date), empty = !d.events.length && !d.bills.length;
    return `<div class="dg-day ${d.date === today ? 'today' : ''} ${empty ? 'quiet' : ''}"><div class="dg-dh"><b>${L.dow}</b><span>${L.md}</span>${d.date === today ? '<span class="chip pos">Today</span>' : ''}</div>
      ${empty ? '<div class="muted dg-none">Nothing scheduled</div>' : d.events.map(evRow).join('') + d.bills.map(billRow).join('')}</div>`; };
  const bills1 = P.bills.filter(b => b.date <= wk1End && b.why !== 'milestone'), cover = P.checking ? P.checking.balance - P.totals.week1 : null;
  const bad = P.calendars.filter(c => !c.ok);
  pg.innerHTML = tools + `<div class="grid g-12">
    <div class="card hero c-8"><div class="label hero-top"><span>Weekly digest · ${dgRange(P.from, P.to)}</span>${D0.emailed_at ? `<span class="chip">Emailed ${fmtD(D0.emailed_at.slice(0, 10))}</span>` : ''}</div>
      <div class="val num" style="font-size:var(--fs-4xl)">${dgRange(P.from, wk1End)}</div>
      <div class="hero-grid"><div>Events this week<b class="num">${P.counts.week1Events}</b></div><div>Bills this week<b class="num">${P.totals.week1 ? money(P.totals.week1) : '—'}</b></div><div>The week after<b class="num">${P.totals.week2 ? money(P.totals.week2) : '—'}</b></div>
        ${P.checking ? `<div>Checking · ${esc(P.checking.asOf)}<b class="num">${short(P.checking.balance)}</b></div>` : ''}</div>
      ${cover != null && P.totals.week1 ? `<div class="hero-plan"><span>${cover >= 0 ? 'Covered' : 'Short'}</span>${cover >= 0 ? `Checking covers this week’s bills with ${short(cover)} to spare` : `This week’s bills are ${short(-cover)} more than checking had at the end of ${esc(P.checking.asOf)}`}</div>` : ''}</div>
    <div class="card c-4"><div class="card-h"><div><h3>Calendars</h3><div class="sub">Built ${new Date(D0.generated_at).toLocaleString(undefined, {weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}</div></div></div>
      <div class="dg-cals">${P.calendars.map(c => `<div class="dg-cal"><i style="background:${esc(c.color)}"></i><b>${esc(c.label)}</b><span class="muted">${c.ok ? c.count + ' event' + (c.count === 1 ? '' : 's') : '<span class="neg">couldn’t read</span>'}</span></div>`).join('') || '<p class="muted">No calendars connected.</p>'}
        <div class="dg-cal"><i class="sq" style="background:var(--warn)"></i><b>Bills</b><span class="muted">${money(P.threshold)}+ · loans · tax</span></div></div>
      ${bad.length ? `<p class="neg" style="font-size:var(--fs-xs);margin-top:8px">${bad.map(c => `${esc(c.label)}: ${esc(c.error || 'error')}`).join('<br>')}</p>` : ''}</div>

    <div class="card c-12" data-lk="digest-week1"><div class="card-h"><div><h3>This week</h3><div class="sub">${dgRange(P.from, wk1End)} · ${P.counts.week1Events} events${bills1.length ? ` · ${bills1.length} bill${bills1.length === 1 ? '' : 's'} (${money(P.totals.week1)})` : ''}</div></div></div>
      <div class="dg-days">${days1.map(dayCard).join('')}</div></div>
    ${days2.length ? `<div class="card c-8" data-lk="digest-week2"><div class="card-h"><div><h3>Coming up the week after</h3><div class="sub">${dgRange(days2[0].date, days2[days2.length - 1].date)}${P.totals.week2 ? ' · ' + money(P.totals.week2) + ' in bills' : ''}</div></div></div>
      <div class="dg-list">${days2.filter(d => d.events.length || d.bills.length).map(d => `<div class="dg-li"><div class="dg-ld"><b>${dgDay(d.date).short}</b><span>${dgDay(d.date).md}</span></div><div style="flex:1;min-width:0">${d.events.map(evRow).join('')}${d.bills.map(billRow).join('')}</div></div>`).join('') || '<p class="muted">Nothing on the calendars yet.</p>'}</div></div>` : ''}
    <div class="card c-4" data-lk="digest-notes"><div class="card-h"><div><h3>Notes for the week</h3><div class="sub">For the two of you · saved with this digest</div></div></div>
      <textarea class="in dg-notes" id="wkNotes" rows="8" placeholder="Who’s driving to practice, what to book, bills to move…" ${w ? '' : 'disabled'}>${esc(D0.notes || '')}</textarea>
      <div class="muted" id="wkSaved" style="font-size:var(--fs-xs);margin-top:6px">${D0.notes ? 'Saved' : ''}</div></div>
  </div>`;
  wireWeek(pg, D0);
}
function wireWeek(pg, D0) {
  if ($('#wkSel')) $('#wkSel').onchange = e => { DG.sel = e.target.value; render(); };
  ['#wkBuild', '#wkBuild2'].forEach(id => { if ($(id)) $(id).onclick = () => buildDigestNow(false); });
  ['#wkSet', '#wkSet2'].forEach(id => { if ($(id)) $(id).onclick = () => { go('admin'); setTimeout(() => $('#dgCard')?.scrollIntoView({behavior: 'smooth'}), 300); }; });
  const n = $('#wkNotes'); let t;
  if (n && D0) n.oninput = () => { $('#wkSaved').textContent = 'Saving…'; clearTimeout(t); t = setTimeout(async () => {
    const {error} = await FDB.from('digests').update({notes: n.value}).eq('id', D0.id); D0.notes = n.value; $('#wkSaved').textContent = error ? 'Couldn’t save: ' + error.message : 'Saved'; }, 700); };
}

/* ---------------- Overview tile ---------------- */
function ovWeekCard() {
  if (!DG.digests) { loadDigest(); return ''; }
  setTimeout(dgAutoRefresh, 0);
  const D0 = DG.digests[0]; if (!D0) return '';
  const P = D0.payload, wk1End = dgPlus(P.from, 6), today = CTX.TODAY;
  const next = P.days.filter(d => d.date >= today && d.date <= wk1End).flatMap(d => d.events.filter(e => !e.cont).map(e => ({...e, d: d.date})).concat(d.bills.filter(b => b.why !== 'milestone').map(b => ({...b, d: d.date, bill: true})))).slice(0, 6);
  return `<div class="card c-12" data-lk="ov-this-week"><div class="card-h"><div><h3>This week</h3><div class="sub">${dgRange(P.from, wk1End)} · ${P.counts.week1Events} events${P.totals.week1 ? ' · ' + money(P.totals.week1) + ' in bills' : ''}</div></div><div class="right"><button class="btn sm" onclick="go('week')">Open</button></div></div>
    <div class="dg-mini">${next.map(x => `<div class="dg-ev${x.bill ? ' dg-bill ' + x.why : ''}"><i ${x.bill ? '' : `style="background:${esc(x.color)}"`}></i><span class="dg-t">${dgDay(x.d).short}${x.bill ? '' : x.allDay ? '' : ' ' + esc(x.time)}</span><span class="dg-n">${esc(x.bill ? x.name : x.title)}</span>${x.bill && x.amount ? `<b class="num">${short(x.amount)}</b>` : ''}</div>`).join('') || '<p class="muted">Nothing left this week.</p>'}</div></div>`;
}

/* ---------------- Admin → Weekly digest ---------------- */
function digestAdminCard() {
  if (!DG.feeds) { loadDigest(); return `<div class="card c-12" id="dgCard"><div class="card-h"><div><h3>Weekly digest</h3><div class="sub">Loading…</div></div></div></div>`; }
  const S = DGS(), w = CTX.CAN_WRITE, ro = w ? '' : 'disabled';
  const st = f => f.last_fetched ? (f.last_ok ? `<span class="chip pos">${f.last_count ?? 0} events · ${new Date(f.last_fetched).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>` : `<span class="chip neg" title="${esc(f.last_error || '')}">Couldn’t read</span>`) : '<span class="chip">Not read yet</span>';
  const hours = Array.from({length: 24}, (_, h) => [h, `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`]);
  return `<div class="card c-12" id="dgCard"><div class="card-h"><div><h3>Weekly digest</h3><div class="sub">Calendars + bills of ${money(S.threshold)} or more (and every loan and tax payment) · built ${DAYN[S.sendDow]}s at ${hours[S.sendHour][1]} for the next ${S.days} days · shows on This week${S.email ? ' and is emailed' : ''}</div></div>
      ${w ? `<div class="right"><button class="btn" id="dgBuild" ${DG.busy ? 'disabled' : ''}>${DG.busy ? 'Building…' : 'Build now'}</button><button class="btn primary" id="dgSend" ${DG.busy ? 'disabled' : ''}>Build & email now</button></div>` : ''}</div>
    ${DG.err ? `<div class="banner">${icon('warn')}<span>${esc(DG.err)}</span></div>` : ''}
    <div class="dg-feeds">${DG.feeds.map(f => `<div class="dg-feed" data-fid="${f.id}">
        <input type="color" class="dg-col" value="${esc(f.color)}" data-fk="color" ${ro} title="Colour">
        <input class="in sm" value="${esc(f.label)}" data-fk="label" ${ro} placeholder="Name" style="max-width:180px">
        <input class="in sm dg-url" type="password" value="${esc(f.url)}" data-fk="url" ${ro} placeholder="webcal://… or https://…ics" autocomplete="off">
        <button class="mini-btn" data-feye title="Show / hide the link">${icon('eye')}</button>
        <label class="tgl" title="Include in the digest"><input type="checkbox" data-fk="enabled" ${f.enabled ? 'checked' : ''} ${ro}></label>
        ${st(f)}
        ${w ? `<button class="btn sm" data-ftest>Test</button><button class="mini-btn" data-fdel title="Remove">${icon('trash')}</button>` : ''}</div>`).join('') || '<p class="muted">No calendars yet.</p>'}
      ${w ? `<div class="dg-feed dg-new"><input type="color" class="dg-col" id="dgNc" value="${['#2a78d6', '#eb6834', '#6250d6', '#1a8f4e', '#eda100'][DG.feeds.length % 5]}"><input class="in sm" id="dgNl" placeholder="Name, e.g. Medical" style="max-width:180px"><input class="in sm dg-url" id="dgNu" placeholder="Paste the calendar link (webcal://… or https://…ics)" autocomplete="off"><button class="btn sm primary" id="dgAdd">${icon('plus')}<span>Add calendar</span></button></div>` : ''}</div>
    <details class="dg-how"><summary>Where to find a calendar’s link</summary><ul>
      <li><b>iCloud</b> (iPhone/Mac Calendar): on a Mac, Calendar → right-click the calendar → <i>Share Calendar…</i> → tick <i>Public Calendar</i> → copy the webcal:// link. On icloud.com/calendar: the share icon next to the calendar → <i>Public Calendar</i>. The link isn’t listed anywhere, but anyone who has it can read that calendar — it’s stored privately for your household here.</li>
      <li><b>Other apps</b> (team / club / group apps): look for <i>Subscribe</i>, <i>Sync to calendar</i>, <i>Export</i> or <i>iCal feed</i> — any link that ends in .ics or starts with webcal:// works.</li>
      <li><b>Google</b>: Settings → the calendar → <i>Integrate calendar</i> → <i>Secret address in iCal format</i>.</li></ul></details>
    <div class="form dg-set">
      <div style="grid-column:1/-1"><label>Email to <span class="muted" style="font-weight:500">· comma-separated · blank sends to everyone who can edit</span></label><input class="in" id="dgEm" value="${esc((S.emails || []).join(', '))}" ${ro} placeholder="you@…, wife@…"></div>
      <div><label>Send on</label><select class="in" id="dgDow" ${ro}>${DAYN.map((d, i) => `<option value="${i}" ${+S.sendDow === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div><label>At</label><select class="in" id="dgHr" ${ro}>${hours.map(([h, l]) => `<option value="${h}" ${+S.sendHour === h ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label>Look ahead</label><select class="in" id="dgDays" ${ro}>${[[7, '1 week'], [14, '2 weeks'], [21, '3 weeks']].map(([d, l]) => `<option value="${d}" ${+S.days === d ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label>Bills of at least</label><div class="amt-in"><span>$</span><input class="in num" id="dgTh" value="${S.threshold}" ${ro}></div></div>
      <div style="grid-column:1/-1"><label class="tgl"><input type="checkbox" id="dgEmOn" ${S.email ? 'checked' : ''} ${ro}> Email the digest (sent from the Gmail account set on the weekly-digest function)</label></div></div>
  </div>`;
}
let dgSetT = null;
function saveDigestSettings(patch) {
  const S = {...DGS(), ...patch}; CTX.settings.digest = S; clearTimeout(dgSetT);
  dgSetT = setTimeout(async () => { const {error} = await FDB.rpc('set_household_setting', {p_household: CTX.HH, p_key: 'digest', p_value: S});
    if (error) toast('Couldn’t save the digest settings: ' + error.message + (/digest/.test(error.message) ? ' — run migration 2000' : '')); }, 500);
}
function wireDigestAdmin(pg) {
  if (!$('#dgCard')) return;
  if ($('#dgBuild')) $('#dgBuild').onclick = () => buildDigestNow(false);
  if ($('#dgSend')) $('#dgSend').onclick = () => buildDigestNow(true);
  $$('.dg-feed[data-fid]', pg).forEach(row => {
    const f = DG.feeds.find(x => x.id === row.dataset.fid);
    $$('[data-fk]', row).forEach(inp => inp.onchange = async () => { const k = inp.dataset.fk, v = k === 'enabled' ? inp.checked : inp.value.trim();
      if (k === 'url' && !/^(https?|webcal):\/\//i.test(v)) { inp.value = f.url; return toast('The link should start with webcal:// or https://'); }
      const {error} = await FDB.from('calendar_feeds').update({[k]: v}).eq('id', f.id); if (error) return toast('Couldn’t save: ' + error.message); f[k] = v; toast('Saved'); });
    row.querySelector('[data-feye]').onclick = () => { const u = row.querySelector('.dg-url'); u.type = u.type === 'password' ? 'text' : 'password'; };
    const del = row.querySelector('[data-fdel]'); if (del) del.onclick = async () => { if (!confirmInline(del, `Remove ${f.label}?`)) return;
      const {error} = await FDB.from('calendar_feeds').delete().eq('id', f.id); if (error) return toast('Couldn’t remove: ' + error.message); DG.feeds = DG.feeds.filter(x => x !== f); render(); toast(`Removed ${f.label}`); };
    const tst = row.querySelector('[data-ftest]'); if (tst) tst.onclick = () => testFeed(f.url, tst);
  });
  if ($('#dgAdd')) $('#dgAdd').onclick = async () => { const label = $('#dgNl').value.trim(), url = $('#dgNu').value.trim(), color = $('#dgNc').value;
    if (!label) return $('#dgNl').focus(); if (!/^(https?|webcal):\/\//i.test(url)) { $('#dgNu').focus(); return toast('Paste the full link — it starts with webcal:// or https://'); }
    const {data, error} = await FDB.from('calendar_feeds').insert({household_id: CTX.HH, label, url, color, sort_order: 100 + DG.feeds.length}).select().single();
    if (error) return toast('Couldn’t add: ' + error.message); DG.feeds.push(data); render(); toast(`Added ${label} · testing the link…`);
    const b = document.querySelector(`.dg-feed[data-fid="${data.id}"] [data-ftest]`); testFeed(url, b); };
  const num = v => +String(v).replace(/[$,]/g, '') || 0;
  const bind = (id, fn) => { const el = $('#' + id); if (el) el.onchange = () => { saveDigestSettings(fn(el)); setTimeout(render, 600); }; };
  bind('dgEm', el => ({emails: el.value.split(/[,;\s]+/).map(s => s.trim()).filter(s => /@/.test(s))}));
  bind('dgDow', el => ({sendDow: +el.value})); bind('dgHr', el => ({sendHour: +el.value})); bind('dgDays', el => ({days: +el.value}));
  bind('dgTh', el => ({threshold: Math.max(0, num(el.value))})); bind('dgEmOn', el => ({email: el.checked}));
}
async function testFeed(url, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
  const {data, error} = await sb.functions.invoke('weekly-digest', {body: {household_id: CTX.HH, action: 'test_feed', url}});
  if (btn) { btn.disabled = false; btn.textContent = 'Test'; }
  if (error || data?.error) return toast('Couldn’t read that calendar: ' + await fnErr(error, data), null, 12000);
  toast(`Works · ${data.count} event${data.count === 1 ? '' : 's'} in the next 30 days${data.next?.[0] ? ` · next: ${data.next[0].title} (${dgDay(data.next[0].date).short} ${dgDay(data.next[0].date).md})` : ''}`);
}
