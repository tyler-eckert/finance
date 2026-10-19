/* =====================================================================
   eckert.fin · data layer
   Sign-in → load one snapshot from the `finance` schema → shape it into
   DATA / DATA2 / DATA3 / DATA4 for the app modules → keep Supabase in sync
   with every edit (diff-based, so every screen's changes persist the same way).
   ===================================================================== */
'use strict';
const CFG = window.FIN_CONFIG || {};
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
const FDB = sb.schema('finance');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = v => typeof v === 'string' && UUID.test(v);

/* ---------- date helpers (no hard-coded years anywhere) ---------- */
const ym = d => String(d).slice(0, 7);
// college starts the August after a child turns 18 (Sept+ birthdays start a year later), unless the plan overrides it
const autoCollegeYear = dob => +String(dob).slice(0, 4) + 18 + (+String(dob).slice(5, 7) >= 9 ? 1 : 0);
const collegeYear = k => +(CTX.settings?.college_plan?.kids?.[k.name]?.startYear) || autoCollegeYear(k.dob);
const ymPlus = (s, k) => { let [y, m] = s.split('-').map(Number); m += k; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return `${y}-${String(m).padStart(2, '0')}`; };
const ymRange = (a, b) => { const o = []; for (let m = a; m <= b; m = ymPlus(m, 1)) o.push(m); return o; };
const mStart = s => s + '-01';
const r2 = v => Math.round(v * 100) / 100;

/* ---------- labels between DB codes and the app's display values ---------- */
const KIND2GROUP = {income: 'Income', fixed: 'Fixed Expense', variable: 'Variable Expense', transfer: 'TTS'};
const GROUP2KIND = Object.fromEntries(Object.entries(KIND2GROUP).map(([k, v]) => [v, k]));
const LOAN_T = {mortgage: 'Mortgage', auto: 'Auto', equipment: 'Equipment', home_improvement: 'Home improvement', heloc: 'HELOC', personal: 'Personal', student: 'Student', other: 'Other'};
const ASSET_T = {real_estate: 'Real estate', vehicle: 'Vehicle', equipment: 'Equipment', mineral_interest: 'Mineral interest', business_interest: 'Business interest', collectible: 'Collectible', other: 'Other'};
const inv = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const LOAN_T_R = inv(LOAN_T), ASSET_T_R = inv(ASSET_T);
const PAY_T = {estimate: 'Estimate', extension: 'Extension payment', balance_due: 'Balance due', refund: 'Refund', penalty_interest: 'Penalty / interest', credit_applied: 'Credit applied', note: 'Overpayment note'};
const PAY_T_R = inv(PAY_T);
const SRC_JS2DB = {offer: 'instant_offer', curve: 'depreciation'};
const SRC_DB2JS = inv(SRC_JS2DB);

/* =====================================================================
   BOOT · auth gate
   ===================================================================== */
const boot = document.getElementById('boot');
const bootMsg = (html, busy) => { boot.querySelector('.boot-body').innerHTML = html; boot.classList.toggle('busy', !!busy); };
function showLogin(err) {
  bootMsg(`<form id="loginF" class="login" autocomplete="on">
    <img src="trust-logo.png" alt="" style="width:92px;display:block;margin:0 auto 10px">
    <h2>Sign in</h2><p class="muted">Your finances, private to your household.</p>
    ${err ? `<div class="login-err">${escH(err)}</div>` : ''}
    <label>Email<input class="in" type="email" id="lgE" autocomplete="username" required></label>
    <label>Password<input class="in" type="password" id="lgP" autocomplete="current-password"></label>
    <button class="btn primary" type="submit" style="width:100%;justify-content:center">Sign in</button>
    <button class="link" type="button" id="lgMagic">Email me a sign-in link instead</button></form>`);
  const f = document.getElementById('loginF'), e = document.getElementById('lgE');
  try { e.value = localStorage.getItem('fin.email') || ''; } catch (_) {}
  (e.value ? document.getElementById('lgP') : e).focus();
  f.onsubmit = async ev => {
    ev.preventDefault(); const email = e.value.trim(), password = document.getElementById('lgP').value;
    try { localStorage.setItem('fin.email', email); } catch (_) {}
    if (!password) return magic(email);
    bootMsg('<div class="spin"></div><p>Signing in…</p>', true);
    const {error} = await sb.auth.signInWithPassword({email, password});
    if (error) return showLogin(error.message);
    start();
  };
  document.getElementById('lgMagic').onclick = () => magic(e.value.trim());
}
async function magic(email) {
  if (!email) return showLogin('Enter your email first.');
  const {error} = await sb.auth.signInWithOtp({email, options: {shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname}});
  if (error) return showLogin(error.message);
  bootMsg(`<h2>Check your email</h2><p class="muted">A sign-in link is on its way to ${escH(email)}.</p><button class="link" onclick="showLogin()">Back</button>`);
}
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

let SESSION = null, HH = null, ROLE = 'viewer', SNAP = null;
async function start() {
  if (!CFG.supabaseUrl || /YOUR-/.test(CFG.supabaseUrl + CFG.supabaseKey)) {
    return bootMsg('<h2>Almost there</h2><p class="muted">Add your Supabase URL and publishable key to <code>js/config.js</code>.</p>');
  }
  const {data: {session}} = await sb.auth.getSession();
  if (!session) return showLogin();
  SESSION = session;
  bootMsg('<div class="spin"></div><p>Loading your data…</p>', true);
  try {
    const {data: hhs, error} = await FDB.rpc('my_households');
    if (error) throw error;
    if (!hhs || !hhs.length) return bootMsg(`<h2>No household yet</h2><p class="muted">You're signed in as ${escH(session.user.email)}, but this account isn't linked to a household. Run the membership SQL from the README, then reload.</p><button class="btn" onclick="signOut()">Sign out</button>`);
    let pick = hhs[0]; try { pick = hhs.find(h => h.household_id === localStorage.getItem('fin.hh')) || hhs[0]; } catch (_) {}
    HH = pick.household_id; ROLE = pick.role;
    const t0 = performance.now();
    const [{data: snap, error: e2}, ex] = await Promise.all([FDB.rpc('app_snapshot', {p_household: HH}), FDB.rpc('app_snapshot_extra', {p_household: HH})]);
    if (e2) throw e2;
    if (ex.error) console.warn('[fin] app_snapshot_extra unavailable — run migration 1200', ex.error.message);
    Object.assign(snap, {vendor_aliases: [], vendor_monthly: [], cash_items: [], market_series: [], automation: [], statement_balances: [], notes: [], invoices: [], lawn_activities: []}, ex.data || {}); snap.extraOk = !ex.error;
    SNAP = snap; console.info(`[fin] snapshot ${(JSON.stringify(snap).length / 1e6).toFixed(1)} MB in ${Math.round(performance.now() - t0)} ms`);
    buildData(snap);
    await loadApp();
    boot.classList.add('gone'); setTimeout(() => boot.remove(), 400);
    SYNC.init();
  } catch (err) {
    console.error(err);
    bootMsg(`<h2>Couldn't load</h2><p class="muted">${escH(err.message || err)}</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn" onclick="location.reload()">Retry</button><button class="btn" onclick="signOut()">Sign out</button></div>`);
  }
}
async function signOut() { await sb.auth.signOut(); location.hash = ''; location.reload(); }
sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT' && SESSION) location.reload(); if (s) SESSION = s; });

function loadApp() {
  const files = ['js/app.js', 'js/app2.js', 'js/app3.js', 'js/app4.js', 'js/app5.js', 'js/app6.js', 'js/app7.js', 'js/app8.js', 'js/app9.js', 'js/app10.js', 'js/app11.js', 'js/shell.js'];
  const v = CFG.version || '';
  return files.reduce((p, f) => p.then(() => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = f + (v ? '?v=' + v : ''); s.async = false;
    s.onload = res; s.onerror = () => rej(new Error('Could not load ' + f)); document.body.appendChild(s);
  })), Promise.resolve());
}

/* =====================================================================
   SHAPE · DB snapshot → app data
   ===================================================================== */
const MAP = {cat: {}, catName: {}, sub: {}, subName: {}, acct: {}, acctName: {}, proj: {}, projCode: {}};
let CTX = {};
let DATA, DATA2, DATA3, DATA4;

function loanFilled(l, stmts, m) {   // mirrors finance.v_loan_balances_filled
  if (l.paid_off_month && m >= ym(l.paid_off_month)) return 0;
  let last = null; for (const k in stmts) if (k <= m && (!last || k > last)) last = k;
  const fp = l.first_payment_month ? ym(l.first_payment_month) : null;
  if (!last && !(fp && m >= ymPlus(fp, -1))) return null;           // loan not yet in existence
  const i = (+l.annual_rate || 0) / 12, pmt = +l.payment || 0;
  const roll = (bal, from, upto, left) => { let b = bal, k = 0; for (let x = ymPlus(from, 1); x <= upto; x = ymPlus(x, 1)) { if (++k > left || b <= 0) return 0; const int = b * i; b = Math.max(0, b - Math.min(Math.max(pmt - int, 0), b)); } return b; };
  if (last === m) return +stmts[last];
  if (last && pmt) { const done = fp ? (ymDiffN(fp, last) + 1) : 0; return roll(+stmts[last], last, m, Math.max(1, (l.term_months || 600) - done)); }
  if (last) return +stmts[last];
  if (fp && m < fp) return +l.original_principal || 0;
  if (l.term_months) return roll(+l.original_principal || 0, ymPlus(fp, -1), m, l.term_months);
  return 0;
}
const vendorKey = descr => {
  let d = String(descr ?? '').trim().toUpperCase();
  if (/\bATM CASH\b/.test(d)) return 'ATM WITHDRAWAL';
  d = d.replace(/\s+(CHK CARD PUR|DEBIT CRD|CARD PUR|POS PURCHASE|POS RETURN|POS DEBIT|POS|ATM CASH|ACH TRAN)(\s.*)?$/, '');
  if (d.startsWith('PAYPAL PURCHASE - ')) d = d.slice(18); else { const p = d.indexOf(' - '); if (p > 0) d = d.slice(0, p); }
  d = d.replace(/^(SQ|TST|PY|SP|TIL|ZEFFY|GOOGLE|PP|DD|IN|BT|CKO|SMK|EB|FS|LS|PAR|CLK|WPY|GG|DNH|APL|PAYPAL) ?\* ?/, '');
  d = d.replace(/^([A-Z0-9][A-Z0-9 .'&-]*?) ?\*.*$/, '$1');
  d = d.replace(/^SP (?=[A-Z])/, '');
  d = d.replace(/(?<![A-Z0-9-])#?[0-9]+(?![A-Z0-9-])/g, ' ');
  d = d.replace(/(?<![A-Z0-9-])[A-Z][0-9]{3,}(?![A-Z0-9-])/g, ' ');
  d = d.replace(/[*"•#]/g, ' ').replace(/\s+/g, ' ');
  const trim = s => s.replace(/^[ .,\-/]+|[ .,\-/]+$/g, '');
  d = trim(d);
  for (let prev = null; prev !== d;) { prev = d; d = d.replace(/\s+(LLC|INC|CO|CORP|LTD|PAYMENT|PAYMT|PYMT|PMT|AUTOPAY|ONLINE|PURCHASE|STORE)$/, ''); }
  d = trim(d); return d || null;
};
/* display name: longest matching household alias, else Title Case of the key */
let VALIAS = [];
const titleCase = s => s.toLowerCase().replace(/(^|[\s/&(-])([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/'S\b/g, "'s");
const vendorName = k => { if (!k) return '(unknown)'; for (const a of VALIAS) if (k.startsWith(a.pattern)) return a.name; return titleCase(k); };
const setAliases = list => { VALIAS = list.slice().sort((a, b) => b.pattern.length - a.pattern.length); };
window.vendorKey = vendorKey; window.vendorName = vendorName; window.setAliases = setAliases;
const ymDiffN = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };

function computeBS(S, today) {
  // ----- balances: per account month → value; balance-sheet range
  const balBy = {}; S.balances.forEach(([aid, m, v]) => { (balBy[aid] ||= {})[ym(m)] = +v; });
  const allBalMonths = S.balances.map(b => ym(b[1]));
  const firstBM = allBalMonths.length ? allBalMonths.reduce((a, b) => a < b ? a : b) : ymPlus(ym(today), -12);
  let lastBM = allBalMonths.length ? allBalMonths.reduce((a, b) => a > b ? a : b) : ym(today);
  if (lastBM > ym(today)) lastBM = ym(today);
  const months = ymRange(firstBM, lastBM);
  const carry = (series, closed) => { let v = 0, seen = false; return months.map(m => { if (series && series[m] != null) { v = series[m]; seen = true; } if (closed && m > closed) return 0; return seen ? v : 0; }); };

  const loanStmts = {}; S.loan_balances.forEach(([lid, m, v]) => { (loanStmts[lid] ||= {})[ym(m)] = +v; });
  const avBy = {}; S.asset_values.forEach(([aid, m, v]) => { (avBy[aid] ||= {})[ym(m)] = +v; });

  const bs = {months};
  Object.defineProperties(bs, {_balBy: {value: balBy}, _loanStmts: {value: loanStmts}, _avBy: {value: avBy}});
  const acctKey = a => 'acct:' + a.id;
  const grpSum = (fn) => months.map((_, i) => S.accounts.filter(a => !a.parent_account_id && fn(a)).reduce((s, a) => s + bs[acctKey(a)][i], 0));
  S.accounts.forEach(a => { bs[acctKey(a)] = carry(balBy[a.id], a.closed_on ? ym(a.closed_on) : null); });
  bs.cash = grpSum(a => a.balance_group === 'Cash' && !a.is_liability);
  bs.retirement = grpSum(a => a.balance_group === 'Retirement');
  bs.college = grpSum(a => a.balance_group === 'College');
  bs.hsa = grpSum(a => a.kind === 'hsa');
  bs.brokerage = grpSum(a => a.balance_group === 'Investing' && a.kind !== 'hsa');
  bs.investing = grpSum(a => ['Investing', 'Retirement', 'College'].includes(a.balance_group));
  bs.investable = grpSum(a => a.in_investable);
  bs.liabAccts = grpSum(a => a.is_liability && a.in_net_worth);
  bs.otherAccts = grpSum(a => a.balance_group === 'Other' && !a.is_liability && a.in_net_worth);
  // assets & loans
  const assetVal = (a, m) => { if (a.sold_on && m > ym(a.sold_on)) return 0; let v = null; for (const k in avBy[a.id] || {}) if (k <= m && (v == null || k > v.k)) v = {k, v: avBy[a.id][k]}; return v ? v.v : 0; };
  bs.assetValue = months.map(m => S.assets.reduce((s, a) => s + assetVal(a, m), 0));
  const firstVal = {}; for (const aid in avBy) firstVal[aid] = Object.keys(avBy[aid]).sort()[0];
  // a secured loan counts once its asset has a recorded value (keeps early history from showing debt without the house behind it)
  S.loans.forEach(l => { bs['loan:' + l.id] = months.map(m => (l.asset_id && !(firstVal[l.asset_id] && m >= firstVal[l.asset_id])) ? 0 : (loanFilled(l, loanStmts[l.id] || {}, m) || 0)); });
  bs.securedLoans = months.map((_, i) => S.loans.filter(l => l.asset_id).reduce((s, l) => s + bs['loan:' + l.id][i], 0));
  bs.loans = months.map((_, i) => S.loans.reduce((s, l) => s + bs['loan:' + l.id][i], 0));
  bs.assets = months.map((_, i) => bs.assetValue[i] - bs.securedLoans[i]);                 // equity
  bs.unsecured = months.map((_, i) => bs.loans[i] - bs.securedLoans[i]);
  bs.netWorth = months.map((_, i) => bs.cash[i] + bs.investing[i] + bs.otherAccts[i] - bs.liabAccts[i] + bs.assets[i] - bs.unsecured[i]);
  bs.debt = bs.loans;

  return bs;
}

function buildData(S) {
  const today = String(S.today);
  // ----- lookups
  S.categories.forEach(c => { MAP.cat[c.name] = c.id; MAP.catName[c.id] = c.name; });
  S.subcategories.forEach(([id, cid, name]) => { MAP.sub[cid + '|' + name] = id; MAP.subName[id] = {cat: MAP.catName[cid], name, cid}; });
  S.accounts.forEach(a => { MAP.acct[a.name] = a.id; MAP.acctName[a.id] = a.name; });
  S.projects.forEach(p => { MAP.proj[p.code] = p.id; MAP.projCode[p.id] = p.code; });
  const catN = id => (id && MAP.catName[id]) || '', subN = id => (id && MAP.subName[id]?.name) || '';
  const settings = S.household.settings || {};

  // ----- transactions (detail window)
  const tx = S.tx.map(([id, d, desc, amt, c, s, p, a, note, sp]) => {
    const t = {id, d, desc, amt: +amt, cat: catN(c), sub: subN(s), proj: MAP.projCode[p] || '', acct: MAP.acctName[a] || '', note: note || ''};
    if (sp && sp.length) t.splits = sp.map(([sid, sc, ss, sa, sn]) => ({cat: catN(sc), sub: subN(ss), amt: +sa, note: sn || ''}));
    return t;
  });
  const lastTx = tx.reduce((m, t) => t.d > m ? t.d : m, '');
  const asofYm = ym(lastTx || today);
  const CY = +asofYm.slice(0, 4), PY = CY - 1, ASOF_M = +asofYm.slice(5, 7);

  const bs = computeBS(S, today), months = bs.months, acctKey = a => 'acct:' + a.id;
  const balBy = bs._balBy, loanStmts = bs._loanStmts, avBy = bs._avBy, lastBM = months[months.length - 1];

  // ----- categories & yearly history
  const cats = S.categories.filter(c => c.active).map(c => ({name: c.name, group: KIND2GROUP[c.kind], id: c.id, desc: c.description || ''}));
  const subs = {}; S.subcategories.forEach(([id, cid, name, active]) => { if (active && MAP.catName[cid]) (subs[MAP.catName[cid]] ||= []).push(name); });
  const catCounts = {};
  const monthly = {};   // 'YYYY-MM' → cat → amount
  S.cat_monthly.forEach(([m, cid, sid, amt, n]) => {
    const c = catN(cid) || 'Uncategorized', k = c + '|' + subN(sid);
    catCounts[k] = (catCounts[k] || 0) + n;
    const mm = ym(m); ((monthly[mm] ||= {})[c] = (monthly[mm][c] || 0) + +amt);
  });
  const firstY = Math.min(CY, ...Object.keys(monthly).map(m => +m.slice(0, 4)));
  const years = []; for (let y = firstY; y <= CY; y++) years.push(y);
  const budgets = {}, subBudgets = {};
  S.budgets.forEach(([y, m, cid, sid, amt]) => {
    const c = catN(cid); if (!c) return;
    if (sid) { const k = c + '|' + subN(sid); ((subBudgets[y] ||= {})[k] ||= Array(12).fill(0))[m - 1] = +amt; }
    else ((budgets[y] ||= {})[c] ||= Array(12).fill(0))[m - 1] = +amt;
  });
  const sumY = (c, y) => { let s = 0; for (let m = 1; m <= 12; m++) s += monthly[`${y}-${String(m).padStart(2, '0')}`]?.[c] || 0; return r2(s); };
  const mRow = c => Array.from({length: 12}, (_, i) => r2(monthly[`${CY}-${String(i + 1).padStart(2, '0')}`]?.[c] || 0));
  const budRow = c => { const b = budgets[CY]?.[c]; const sb = Object.entries(subBudgets[CY] || {}).filter(([k]) => k.startsWith(c + '|')); return sb.length ? Array.from({length: 12}, (_, i) => sum0(sb.map(([, v]) => v[i]))) : (b || Array(12).fill(0)); };
  const sum0 = a => a.reduce((x, y) => x + (y || 0), 0);
  const fc = c => { const a = mRow(c), b = budRow(c); return r2(sum0(a.slice(0, ASOF_M)) + sum0(b.slice(ASOF_M))); };
  const ygrp = c => c.group === 'Income' ? null : c.group === 'Fixed Expense' ? 'Fixed Expenses' : 'Variable Expenses';
  const rows = [];
  const mkRow = (name, group, cs) => ({name, group, y: years.map(y => r2(sum0(cs.map(c => sumY(c, y))))), mCur: Array.from({length: 12}, (_, i) => r2(sum0(cs.map(c => mRow(c)[i])))), fcCur: r2(sum0(cs.map(fc)))});
  const inc = cats.filter(c => c.group === 'Income').map(c => c.name), fix = cats.filter(c => c.group === 'Fixed Expense').map(c => c.name);
  const vari = cats.filter(c => c.group === 'Variable Expense' && c.name !== 'Tax').map(c => c.name), tax = cats.some(c => c.name === 'Tax') ? ['Tax'] : [];
  cats.filter(c => c.group !== 'TTS').forEach(c => rows.push(mkRow(c.name, ygrp(c), [c.name])));
  rows.push(mkRow('Total Income', null, inc), mkRow('Total Fixed Expenses', 'Fixed Expenses', fix), mkRow('Total Variable Expenses', 'Variable Expenses', vari),
    mkRow('Total Expenses (less tax)', 'Variable Expenses', fix.concat(vari)), mkRow('Total Expenses (with tax)', 'Variable Expenses', fix.concat(vari, tax)));

  // ----- investment activity (largest tracked account = "primary brokerage")
  const iaBy = {}; S.investment_activity.forEach(r => (iaBy[r.account_id] ||= []).push(r));
  const schId = Object.keys(iaBy).sort((a, b) => iaBy[b].length - iaBy[a].length)[0] || null;
  const SCH = (iaBy[schId] || []).map(r => ({m: r.m, start: +r.start, dep: +r.dep + Math.max(0, +r.xfer), wd: +r.wd + Math.min(0, +r.xfer), div: +r.div, mkt: +r.mkt, fee: +r.fee, end: +r.end}));

  // ----- people & assumptions
  const base = S.scenarios.find(s => s.is_base) || S.scenarios[0];
  const bp = base?.params || {};
  const kids = (settings.kids || []).map(k => { const a = S.accounts.find(x => x.balance_group === 'College' && (x.owner_label === k.name || x.name.startsWith(k.name))); return {name: k.name, dob: k.dob, key: a ? acctKey(a) : null}; }).filter(k => k.key);
  const assume = {retireAge: bp.retire ?? 55, annualExp: bp.spend ?? 200000, rate: (bp.ret ?? .075) - .025, birthYear: settings.birth_year || 1990,
    k401max: settings.k401_contribution ?? 23500, employer: settings.employer_match ?? 0, collegeTarget: settings.college_target ?? 120000, college529Monthly: settings.college_monthly ?? 100};
  const minerals = S.income_forecasts.filter(f => f.stream === 'minerals').map(f => ({date: f.date, src: f.src || '', type: f.status === 'actual' ? 'Actual' : 'Estimate', amt: +f.gross || +f.amt || 0, net: +f.net || 0}));

  // investable accounts for the investments page
  const lastI = months.length - 1;
  const invAccts = S.accounts.filter(a => a.in_investable && a.is_active && bs[acctKey(a)][lastI] > 0).sort((a, b) => bs[acctKey(b)][lastI] - bs[acctKey(a)][lastI]);
  const contribAcct = S.accounts.find(a => a.name === settings.contribution_account) || invAccts.filter(a => a.balance_group === 'Retirement')[0];
  const flowAcct = S.accounts.find(a => a.name === settings.cashflow_account) || (schId && S.accounts.find(a => a.id === schId)) || invAccts.filter(a => a.balance_group === 'Investing')[0];

  DATA = {bs, yearly: {years, rows}, schwab: SCH, minerals, kids, assume,
    projects: S.projects.map(p => ({id: p.code, desc: p.description || '', start: p.start ? ym(p.start) : '', end: p.end ? ym(p.end) : '', total: +p.total || 0, n: +p.n || 0}))};

  // ----- DATA2: manage layer
  const RULES = {};
  S.merchants.forEach(([k, cid, sid, w, n]) => { const c = catN(cid); if (c) (RULES[k] ||= []).push([c, subN(sid), +w, +n]); });
  for (const k in RULES) RULES[k].sort((a, b) => b[2] - a[2]);
  const userRules = {}; S.rules.forEach(([id, k, t, cid, sid]) => { if (t === 'exact' && catN(cid)) userRules[k] = {cat: catN(cid), sub: subN(sid), id}; });
  const balMonths = ymRange(`${PY}-01`, ym(today) > lastBM ? ym(today) : lastBM);
  const hasKids = new Set(S.accounts.filter(a => a.parent_account_id).map(a => a.parent_account_id));
  const balAccts = S.accounts.filter(a => !a.parent_account_id).map(a => ({name: a.name, group: a.is_liability ? 'Debt' : a.balance_group, inst: a.institution || a.balance_group, v: balMonths.map(m => balBy[a.id]?.[m] ?? null), kind: 'account', id: a.id,
      active: a.is_active !== false, acctKind: a.kind, rollup: hasKids.has(a.id)}))
    .concat(S.loans.filter(l => l.status === 'active').map(l => ({name: l.name, group: 'Debt', inst: l.lender || LOAN_T[l.loan_type], v: balMonths.map(m => loanStmts[l.id]?.[m] ?? null), kind: 'loan', id: l.id, active: true})));
  const subAccts = S.accounts.filter(a => a.parent_account_id).map(a => ({id: a.id, parent: a.parent_account_id, last4: a.last4 || '', nickname: a.nickname || '', name: a.name, active: a.is_active !== false, sort: a.sort_order}));
  const inv = {}; S.investment_activity.forEach(r => { (inv[r.account_id] ||= {})[r.m] = {start: +r.start, dep: +r.dep, wd: +r.wd, div: +r.div, xfer: +r.xfer, mkt: +r.mkt, fee: +r.fee, end: +r.end}; });
  setAliases(S.vendor_aliases.map(([id, pattern, name]) => ({id, pattern, name})));
  const subMonthly = {}; S.cat_monthly.forEach(([m, cid, sid, amt]) => { if (!sid) return; const k = catN(cid) + '|' + subN(sid), mm = ym(m); ((subMonthly[mm] ||= {})[k] = (subMonthly[mm][k] || 0) + +amt); });
  DATA2 = {tx, rules: RULES, userRules, cats, subs, budgets, subBudgets, balIn: {months: balMonths, accounts: balAccts}, txCountAll: +S.tx_count, catCounts,
    subAccts, inv, vendorAliases: VALIAS.map(a => ({...a})), vendorMonthly: S.vendor_monthly.map(([m, k, cid, amt, n]) => ({m, k, cat: catN(cid), amt: +amt, n: +n})),
    cashItems: S.cash_items.map(c => ({id: c.id, name: c.name, kind: c.kind, amount: +c.amount, freq: c.frequency, start: c.start_date, day2: c.day2, end: c.end_date, cat: catN(c.category_id), acct: MAP.acctName[c.account_id] || '', vendor: c.vendor || '', active: c.is_active, notes: c.notes || '', sort: c.sort_order})),
    extraOk: !!S.extraOk};
  DATA.monthly = monthly; DATA.subMonthly = subMonthly;

  // ----- DATA3: loans & assets
  const loanFor = {}; S.loans.forEach(l => { if (l.asset_id) loanFor[l.asset_id] = l.id; });
  DATA3 = {
    loans: S.loans.map(l => {
      const st = loanStmts[l.id] || {}, ks = Object.keys(st);
      const P = +l.original_principal || (ks.length ? Math.max(...ks.map(k => st[k])) : 0);
      return {id: l.id, name: l.name, lender: l.lender || '', type: LOAN_T[l.loan_type] || 'Other', principal: P, rate: l.annual_rate != null ? +l.annual_rate : null,
        n: l.term_months || null, start: l.first_payment_month ? ym(l.first_payment_month) : (ks.sort()[0] || asofYm), pmt: l.payment != null ? +l.payment : null, escrow: +l.escrow || 0,
        actual: st, asset: l.asset_id, status: l.status === 'active' ? 'active' : 'paid', paid: l.paid_off_month ? ym(l.paid_off_month) : null, notes: l.notes || ''};
    }),
    assets: S.assets.map(a => ({id: a.id, name: a.name, type: ASSET_T[a.asset_type] || 'Other', purchase: a.purchased_on ? ym(a.purchased_on) : null, cost: a.purchase_price != null ? +a.purchase_price : null,
      vals: {...(avBy[a.id] || {})}, method: a.valuation_method === 'smart' ? 'manual' : a.valuation_method, ratePct: +a.valuation_rate_pct || 0, loan: loanFor[a.id] || null,
      status: a.status === 'active' ? 'active' : 'sold', sold: a.sold_on ? ym(a.sold_on) : null, smartSettings: a.smart_settings || {}, details: a.details || {},
      quotes: S.asset_quotes.filter(q => q.asset_id === a.id).map(q => ({k: SRC_DB2JS[q.source] || q.source, v: +q.value, lo: q.low != null ? +q.low : null, hi: q.high != null ? +q.high : null, m: ym(q.as_of), manual: q.manual}))})),
    sources: S.valuation_sources,
  };

  // ----- DATA4: taxes
  const ledger = S.tax_payments.map(p => ({id: p.id, d: p.paid_on, ty: p.tax_year, j: p.jurisdiction, status: 'Actual', type: PAY_T[p.payment_type] || p.payment_type,
    q: p.quarter ? 'Q' + p.quarter : '', method: p.method || '', amt: +p.amount, conf: p.confirmation_last4 ? '••' + p.confirmation_last4 : '', note: p.notes || '', src: p.transaction_id ? 'Bank' : 'Manual'}));
  const tyears = {};
  const tyRows = {}; S.tax_years.forEach(t => { (tyRows[t.tax_year] ||= {})[t.jurisdiction] = t; });
  const yset = new Set([...ledger.map(l => l.ty), ...Object.keys(tyRows).map(Number), CY]);
  [...yset].sort().forEach(y => {
    const o = {inc: Math.max(0, ...['FED', 'OK', 'NM'].map(j => +tyRows[y]?.[j]?.est_income || 0))};
    ['FED', 'OK', 'NM'].forEach(j => o[j] = r2(ledger.filter(l => l.ty === y && l.j === j && !['Refund', 'Overpayment note'].includes(l.type)).reduce((s, l) => s + l.amt, 0)));
    tyears[y] = o;
  });
  const salaryCats = settings.salary_categories || inc.filter(c => !/distribut|other|interest|refund|dividend/i.test(c));
  const income = ymRange(`${CY - 3}-01`, `${CY}-12`).map(m => ({m, w2: r2(sum0(salaryCats.map(c => monthly[m]?.[c] || 0))),
    k1: r2(sum0(minerals.filter(x => x.date.startsWith(m)).map(x => x.amt))), div: r2(SCH.find(r => r.m === m)?.div || 0)}));
  const taxPrepSub = MAP.sub[MAP.cat['Tax'] + '|Tax Prep'];
  const fees = []; S.cat_monthly.forEach(([m, cid, sid, amt]) => { if (taxPrepSub && sid === taxPrepSub) fees.push({d: String(m), amt: -amt, note: 'Tax prep'}); });
  DATA4 = {ledger, fees, years: tyears, income, taxYears: tyRows};

  // ----- context for every module
  const prefs = S.prefs || {};
  CTX = {TODAY: today, CY, PY, ASOF: {y: CY, m: ASOF_M}, ASOF_YM: asofYm, SINCE: String(S.since), HH, ROLE, CAN_WRITE: ROLE !== 'viewer', settings, prefs,
    household: S.household, email: SESSION?.user?.email || '', SCH_ACCT: schId ? MAP.acctName[schId] : null,
    invAccts: invAccts.map(a => ({n: a.name, d: {Retirement: 'Retirement', Investing: a.kind === 'hsa' ? 'HSA' : 'Brokerage', College: '529'}[a.balance_group] || a.balance_group, k: acctKey(a), group: a.balance_group, kind: a.kind, id: a.id})),
    contribKey: contribAcct ? acctKey(contribAcct) : null, flowKey: flowAcct ? acctKey(flowAcct) : null,
    scenarios: S.scenarios, planned: S.planned_expenses, changeLog: S.change_log, benchmarks: S.benchmarks, benchReturns: S.benchmark_returns,
    taxYears: tyRows, sources: S.valuation_sources, salaryCats,
    importAccts: S.accounts.filter(a => a.imports_transactions && a.is_active).map(a => a.name)};
  CTX.market = S.market_series || []; CTX.auto = S.automation || [];
  CTX.notes = (S.notes || []).map(n => ({...n}));
  CTX.invoices = (S.invoices || []).map(i => ({...i, total: +i.total, lines: (i.lines || []).map(l => ({...l, amount: +l.amount})).sort((a, b) => String(a.service_date).localeCompare(String(b.service_date)) || a.sort_order - b.sort_order)}));
  CTX.lawnActs = (S.lawn_activities || []).map(a => ({...a, cost: a.cost == null ? null : +a.cost}));
  CTX.stmt = (S.statement_balances || []).map(([acct, m, v, asOf, complete]) => ({acct, m, v: +v, asOf, complete}));
  window.CTX = CTX; window.DATA = DATA; window.DATA2 = DATA2; window.DATA3 = DATA3; window.DATA4 = DATA4;
}

/* Recompute the balance sheet after edits on Balances / Loans / Assets (keeps array identity) */
function rebuildBS() {
  if (!SNAP) return;
  const w0 = ST.bal.months[0], S = {...SNAP};
  S.balances = SNAP.balances.filter(r => ym(r[1]) < w0);
  S.loan_balances = SNAP.loan_balances.filter(r => ym(r[1]) < w0);
  ST.bal.accounts.forEach(a => ST.bal.months.forEach((m, j) => { if (a.v[j] != null && isUuid(a.id)) (a.kind === 'loan' ? S.loan_balances : S.balances).push([a.id, mStart(m), a.v[j]]); }));
  ST.loans.forEach(l => { if (!isUuid(l.id)) return; for (const k in l.actual) if (k < w0) S.loan_balances.push([l.id, mStart(k), l.actual[k]]); });
  S.asset_values = []; ST.assets.forEach(a => { if (isUuid(a.id)) for (const k in a.vals) S.asset_values.push([a.id, mStart(k), a.vals[k]]); });
  S.loans = ST.loans.filter(l => isUuid(l.id)).map(l => ({id: l.id, original_principal: l.principal, annual_rate: l.rate, term_months: l.n, first_payment_month: l.start ? mStart(l.start) : null,
    payment: l.pmt, asset_id: isUuid(l.asset) ? l.asset : null, paid_off_month: l.status === 'active' ? null : mStart(l.paid || CTX.ASOF_YM)}));
  S.assets = ST.assets.filter(a => isUuid(a.id)).map(a => ({id: a.id, sold_on: a.status === 'sold' ? mStart(a.sold || lastValM(a)) : null}));
  const known = new Set(SNAP.accounts.map(a => a.id));
  S.accounts = SNAP.accounts.concat(ST.bal.accounts.filter(a => a.kind === 'account' && isUuid(a.id) && !known.has(a.id)).map(a => ({id: a.id, name: a.name, balance_group: a.group === 'Debt' ? 'Debt' : a.group,
    is_liability: a.group === 'Debt', in_net_worth: a.in !== 'track', in_investable: a.in === 'inv', kind: 'other', is_active: true})));
  const nb = computeBS(S, CTX.TODAY);
  for (const k in nb) { if (Array.isArray(BS[k])) { BS[k].length = 0; BS[k].push(...nb[k]); } else BS[k] = nb[k]; }
  if (typeof refreshDerived === 'function') refreshDerived();
}
const lastValM = a => Object.keys(a.vals).sort().pop();

/* =====================================================================
   SYNC · persist every edit (diff against the last saved state)
   ===================================================================== */
const SYNC = {
  sig: {}, busy: false, again: false, timer: null, err: null, pending: 0, hooks: [],
  init() {
    this.snapshotAll(true);
    const r0 = window.render;
    window.render = function () { r0.apply(this, arguments); SYNC.schedule(); };
    addEventListener('beforeunload', e => { if (SYNC.dirty()) { e.preventDefault(); e.returnValue = ''; } });
    this.status();
  },
  schedule(ms = 500) { if (!CTX.CAN_WRITE) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), ms); },
  dirty() { return this.busy || this.hooks.length || Object.keys(this.diff()).some(k => this.diff()[k].length); },
  status(msg) {
    const el = document.querySelector('.sync'); if (!el) return;
    const st = this.err ? 'err' : this.busy ? 'busy' : 'ok';
    el.dataset.st = st;
    el.innerHTML = `<span class="dot"></span>${escH(msg || (this.err ? 'Not saved · ' + this.err : this.busy ? 'Saving…' : CTX.CAN_WRITE ? 'All changes saved' : 'View only'))}`;
    if (this.err) el.title = this.err;
  },
  // ---------- signatures of the current in-memory state
  state() {
    const S = {};
    S.tx = new Map(ST.tx.filter(t => isUuid(t.id)).map(t => [t.id, JSON.stringify([t.cat || '', t.sub || '', t.note || '', t.splits ? t.splits.map(s => [s.cat, s.sub || '', +(+s.amt).toFixed(2), s.note || '']) : null])]));
    S.cats = new Map(ST.cats.map((c, i) => [c.id || '?' + c.name, JSON.stringify([c.name, c.group, c.subs, i])]));   // order matters: position in the list = sort_order
    S.rules = new Map(Object.entries(ST.userRules).map(([k, v]) => [k, JSON.stringify([v.cat, v.sub || ''])]));
    S.budget = new Map();
    for (const y in ST.budget) for (const c in ST.budget[y]) S.budget.set(`${y}|${c}|`, JSON.stringify(ST.budget[y][c].map(v => +(+v || 0).toFixed(2))));
    for (const y in ST.subBudget) for (const k in ST.subBudget[y]) S.budget.set(`${y}|${k}`, JSON.stringify(ST.subBudget[y][k].map(v => +(+v || 0).toFixed(2))));
    S.bal = new Map(); ST.bal.accounts.forEach(a => ST.bal.months.forEach((m, j) => { if (a.v[j] != null) S.bal.set(`${a.kind}|${a.id || '?' + a.name}|${m}`, String(+(+a.v[j]).toFixed(2))); }));
    S.acct = new Map(ST.bal.accounts.filter(a => a.kind === 'account').map(a => [a.id || '?' + a.name, JSON.stringify([a.name, a.group, a.inst, a.cadence || null, a.in || null, a.active !== false])]));
    S.sub = new Map((ST.subAccts || []).map(a => [a.id || a.tmp, JSON.stringify([a.last4, a.nickname, a.active !== false, a.parent])]));
    S.inv = new Map(); for (const id in ST.inv || {}) for (const m in ST.inv[id]) S.inv.set(`${id}|${m}`, JSON.stringify(ST.inv[id][m]));
    S.valias = new Map((ST.valias || []).map(a => [a.pattern, a.name]));
    S.cash = new Map((ST.cash || []).map(c => [c.id, JSON.stringify([c.name, c.kind, c.amount, c.freq, c.start, c.day2 || null, c.end || null, c.cat || '', c.acct || '', c.vendor || '', c.active !== false, c.notes || '', c.sort || 100])]));
    S.loans = new Map(ST.loans.map(l => [l.id, JSON.stringify([l.name, l.lender, l.type, l.principal, l.rate, l.n, l.start, l.pmt, l.escrow, l.asset, l.status, l.paid || null])]));
    S.assets = new Map(ST.assets.map(a => [a.id, JSON.stringify([a.name, a.type, a.purchase, a.cost, a.method, a.ratePct, a.loan, a.status, a.sold || null, a.smart ? smartSave(a.smart) : null])]));
    S.avals = new Map(); ST.assets.forEach(a => { for (const k in a.vals) S.avals.set(`${a.id}|${k}`, JSON.stringify([+a.vals[k], a.src?.[k] || null])); });
    S.quotes = new Map(); ST.assets.forEach(a => { for (const k in a.smart?.manual || {}) S.quotes.set(`${a.id}|${k}`, JSON.stringify(a.smart.manual[k])); });
    S.scn = new Map(SCN.map((s, i) => [s.id, JSON.stringify([s.name, s.note || '', s.p, s.show !== false, i])]));
    S.ledger = new Map(TX.ledger.map(l => [l.id, JSON.stringify([l.d, l.ty, l.j, l.type, l.q, l.method, l.amt, l.conf, l.note])]));
    S.taxy = new Map(); ['FED', 'OK', 'NM'].forEach(j => { S.taxy.set(`${CTX.PY}|${j}`, JSON.stringify([+TX.prior[j] || 0, +TX.credit[j] || 0])); });
    S.taxw = new Map(); ['FED', 'OK', 'NM'].forEach(j => { const w = TX.wh?.[j] || {}; S.taxw.set(`${CTX.CY}|${j}`, JSON.stringify([w.ytd ?? null, w.asof || null])); });
    S.plan = new Map((ST.planned || []).map(p => [p.id, JSON.stringify([p.name, p.due, p.amount, p.fund, p.notes || '', p.status || 'planned'])]));
    S.prefs = new Map([['p', JSON.stringify(prefsNow())]]);
    return S;
  },
  adopt(k, ids) { const now = this.state()[k]; (ids || [...new Set([...now.keys(), ...this.sig[k].keys()])]).forEach(id => now.has(id) ? this.sig[k].set(id, now.get(id)) : this.sig[k].delete(id)); },
  snapshotAll(first) { this.sig = this.state(); if (first) this.base = this.sig; },
  diff() {
    const now = this.state(), out = {};
    for (const k in now) {
      const a = this.sig[k] || new Map(), b = now[k], ch = [];
      b.forEach((v, id) => { if (a.get(id) !== v) ch.push({id, op: a.has(id) ? 'upd' : 'add', v, old: a.get(id)}); });
      a.forEach((v, id) => { if (!b.has(id)) ch.push({id, op: 'del', v}); });
      out[k] = ch;
    }
    out._now = now; return out;
  },
  async run() {
    if (!this.base) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true; this.err = null; this.status();
    let wroteBS = false;
    try {
      // explicit history-wide operations queued by the UI go first
      while (this.hooks.length) { const h = this.hooks[0]; await h(); this.hooks.shift(); }
      const D = this.diff(), now = D._now;
      const done = (k, id) => { const v = now[k].get(id); if (v === undefined) this.sig[k].delete(id); else this.sig[k].set(id, v); };
      for (const k of ORDER) {
        if (!D[k].length) continue;
        await WRITERS[k](D[k], now[k]);
        D[k].forEach(c => done(k, c.id));
        if (['bal', 'loans', 'assets', 'avals'].includes(k)) wroteBS = true;
      }
      // kinds whose temp ids became uuids are re-signed wholesale; the rest were marked one by one
      const after = this.state();
      for (const k of ['cats', 'acct', 'sub', 'loans', 'assets', 'scn', 'ledger', 'plan', 'cash']) if (D[k].length) this.sig[k] = after[k];
    } catch (e) {
      console.error('[fin] sync', e); this.err = (e.message || String(e)).slice(0, 140);
      if (typeof toast === 'function') toast('Couldn’t save: ' + this.err);
    } finally {
      this.busy = false; this.status();
      if (wroteBS) { try { rebuildBS(); RENDER_SILENT(); } catch (e) { console.warn('[fin] rebuild', e); } }
      if (this.again) { this.again = false; this.schedule(50); }
    }
  },
  queue(fn) { this.hooks.push(fn); this.schedule(0); },
};
const RENDER_SILENT = () => { const r = window.render; r.keep = true; const s = SYNC.schedule; SYNC.schedule = () => {}; try { r(); } finally { SYNC.schedule = s; } };
const prefsNow = () => ({excl: [...ST.excl].sort(), exclSub: [...(ST.exclSub || [])].sort(), pv: {h: PV.h, sc: PV.sc, real: PV.real, pm: PV.pm}, conf: SCCONF, tax: {rates: TX.rates, preset: TX.preset, highAGI: TX.highAGI}, bm: {show: [...BM.show].sort(), stocks: BM.stocks}, theme: document.documentElement.dataset.theme, ui: typeof UI === 'undefined' ? undefined : UI});
const smartSave = s => ({enabled: !!s.enabled, cadence: s.cadence, autoAccept: s.autoAccept, basis: s.basis, condition: s.condition, vin: s.vin, miles: s.miles, annualMiles: s.annualMiles, address: s.address, zip: s.zip, off: [...(s.off || [])].sort()});

const ORDER = ['cats', 'acct', 'sub', 'inv', 'valias', 'cash', 'loans', 'assets', 'tx', 'rules', 'budget', 'bal', 'avals', 'quotes', 'scn', 'ledger', 'taxy', 'taxw', 'plan', 'prefs'];
const hh = () => CTX.HH;
const must = r => { if (r.error) throw new Error(r.error.message + (r.error.details ? ' · ' + r.error.details : '')); return r.data; };
const catId = n => { if (!n) return null; const id = ST.cats.find(c => c.name === n)?.id || MAP.cat[n]; if (!id) throw new Error('Unknown category ' + n); return id; };
async function subId(cat, sub) {
  if (!cat || !sub) return null;
  const cid = catId(cat), k = cid + '|' + sub;
  if (MAP.sub[k]) return MAP.sub[k];
  const row = must(await FDB.from('subcategories').upsert({household_id: hh(), category_id: cid, name: sub}, {onConflict: 'category_id,name'}).select('id').single());
  MAP.sub[k] = row.id; MAP.subName[row.id] = {cat, name: sub, cid}; return row.id;
}
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

const WRITERS = {
  async cats(ch) {
    for (const c of ch) {
      if (c.op === 'del') continue;                       // removals happen through merge / explicit hooks
      const cat = ST.cats.find(x => (x.id || '?' + x.name) === c.id); if (!cat) continue;
      const sort_order = (ST.cats.indexOf(cat) + 1) * 10;
      if (!cat.id) {
        const row = must(await FDB.from('categories').insert({household_id: hh(), name: cat.name, kind: GROUP2KIND[cat.group] || 'variable', sort_order}).select('id').single());
        cat.id = row.id; MAP.cat[cat.name] = row.id; MAP.catName[row.id] = cat.name;
      } else {
        const [name, group] = JSON.parse(c.v);
        must(await FDB.from('categories').update({name, kind: GROUP2KIND[group] || 'variable', sort_order}).eq('id', cat.id));
        MAP.cat[name] = cat.id; MAP.catName[cat.id] = name;
      }
      const prevSubs = c.op === 'add' || !c.old ? null : JSON.parse(c.old)[2];
      for (const [i, s] of cat.subs.entries()) {
        const sid = await subId(cat.name, s);
        if (sid && (!prevSubs || prevSubs.indexOf(s) !== i)) must(await FDB.from('subcategories').update({sort_order: (i + 1) * 10}).eq('id', sid));
      }
    }
  },
  async acct(ch) {
    for (const c of ch) {
      if (c.op === 'del') continue;
      const a = ST.bal.accounts.find(x => x.kind === 'account' && (x.id || '?' + x.name) === c.id); if (!a) continue;
      const grp = a.group === 'Debt' ? 'Debt' : a.group, kind = {Cash: 'savings', Investing: 'brokerage', Retirement: 'retirement', College: 'college', Debt: 'credit_card'}[grp] || 'other';
      const rec = {name: a.name, institution: a.inst, balance_group: grp, is_liability: grp === 'Debt', in_investable: a.in === 'inv', in_net_worth: a.in !== 'track', update_cadence: (a.cadence || 'monthly').toLowerCase()};
      if (!a.id) { const row = must(await FDB.from('accounts').insert({household_id: hh(), kind, sort_order: 900, ...rec}).select('id').single()); a.id = row.id; MAP.acct[a.name] = row.id; MAP.acctName[row.id] = a.name; }
      else must(await FDB.from('accounts').update({name: a.name, institution: a.inst, is_active: a.active !== false}).eq('id', a.id));
    }
  },
  async sub(ch) {
    for (const c of ch) {
      if (c.op === 'del') continue;
      const a = ST.subAccts.find(x => (x.id || x.tmp) === c.id); if (!a) continue;
      const rec = {last4: a.last4 || null, nickname: a.nickname || null, is_active: a.active !== false, name: a.name || `${MAP.acctName[a.parent] || 'Account'} · ${a.nickname || '••' + a.last4}`};
      if (!a.id) {
        const par = ST.bal.accounts.find(x => x.id === a.parent);
        const row = must(await FDB.from('accounts').insert({household_id: hh(), parent_account_id: a.parent, kind: ({Retirement: 'retirement', College: 'college'})[par?.group] || 'brokerage', balance_group: par?.group || 'Investing',
          institution: par?.inst || null, in_net_worth: false, in_investable: false, sort_order: 950, ...rec}).select('id').single());
        a.id = row.id; a.name = rec.name; MAP.acct[rec.name] = row.id; MAP.acctName[row.id] = rec.name;
        if (a.tmp && ST.inv[a.tmp]) { ST.inv[row.id] = ST.inv[a.tmp]; delete ST.inv[a.tmp]; }
        if (par) par.rollup = true;
      } else must(await FDB.from('accounts').update(rec).eq('id', a.id));
    }
  },
  async inv(ch) {
    const ups = [];
    for (const c of ch) {
      const [id0, m] = c.id.split('|'), id = isUuid(id0) ? id0 : ST.subAccts.find(x => x.tmp === id0)?.id; if (!isUuid(id)) continue;
      if (c.op === 'del') { if (isUuid(id0)) must(await FDB.from('investment_activity').delete().eq('account_id', id).eq('month', mStart(m))); continue; }
      const r = JSON.parse(c.v);
      ups.push({household_id: hh(), account_id: id, month: mStart(m), starting_balance: r.start || 0, deposits: r.dep || 0, withdrawals: r.wd || 0, dividends_interest: r.div || 0,
        transfers: r.xfer || 0, market_change: r.mkt || 0, fees: r.fee || 0, ending_balance: r.end || 0});
    }
    if (ups.length) must(await FDB.from('investment_activity').upsert(ups, {onConflict: 'account_id,month'}));
    // detail accounts also carry their month-end balance
    const bals = ups.map(u => ({household_id: hh(), account_id: u.account_id, month: u.month, balance: u.ending_balance, source: 'statement'}));
    if (bals.length) must(await FDB.from('account_balances').upsert(bals, {onConflict: 'account_id,month'}));
  },
  async valias(ch) {
    for (const c of ch) {
      if (c.op === 'del') { must(await FDB.from('vendor_aliases').delete().eq('household_id', hh()).eq('pattern', c.id)); continue; }
      must(await FDB.from('vendor_aliases').upsert({household_id: hh(), pattern: c.id, name: c.v}, {onConflict: 'household_id,pattern'}));
    }
  },
  async cash(ch) {
    for (const c of ch) {
      if (c.op === 'del') { if (isUuid(c.id)) must(await FDB.from('cash_items').delete().eq('id', c.id)); continue; }
      const it = ST.cash.find(x => x.id === c.id); if (!it) continue;
      const rec = {name: it.name, kind: it.kind, amount: it.amount, frequency: it.freq, start_date: it.start, day2: it.day2 || null, end_date: it.end || null,
        category_id: it.cat ? catId(it.cat) : null, account_id: it.acct ? MAP.acct[it.acct] || null : null, vendor: it.vendor || null, is_active: it.active !== false, notes: it.notes || null, sort_order: it.sort || 100};
      if (!isUuid(it.id)) { const row = must(await FDB.from('cash_items').insert({household_id: hh(), ...rec}).select('id').single()); it.id = row.id; }
      else must(await FDB.from('cash_items').update(rec).eq('id', it.id));
    }
  },
  async loans(ch) {
    for (const c of ch) {
      const l = ST.loans.find(x => x.id === c.id);
      if (c.op === 'del') { if (isUuid(c.id)) must(await FDB.from('loans').delete().eq('id', c.id)); continue; }
      const rec = {name: l.name, lender: l.lender || null, loan_type: LOAN_T_R[l.type] || 'other', original_principal: l.principal, annual_rate: l.rate, term_months: l.n || null,
        first_payment_month: l.start ? mStart(l.start) : null, payment: l.pmt, escrow: l.escrow || 0, asset_id: isUuid(l.asset) ? l.asset : null,
        status: l.status === 'active' ? 'active' : 'paid_off', paid_off_month: l.status === 'active' ? null : mStart(l.paid || CTX.ASOF_YM)};
      if (!isUuid(l.id)) {
        const old = l.id, row = must(await FDB.from('loans').insert({household_id: hh(), ...rec}).select('id').single());
        l.id = row.id; ST.assets.forEach(a => { if (a.loan === old) a.loan = row.id; }); if (LS.sel === old) LS.sel = row.id;
        if (!ST.bal.accounts.some(x => x.kind === 'loan' && x.id === row.id) && l.status === 'active') ST.bal.accounts.push({name: l.name, group: 'Debt', inst: l.lender || l.type, v: ST.bal.months.map(() => null), kind: 'loan', id: row.id});
      } else must(await FDB.from('loans').update(rec).eq('id', l.id));
    }
  },
  async assets(ch) {
    for (const c of ch) {
      const a = ST.assets.find(x => x.id === c.id);
      if (c.op === 'del') { if (isUuid(c.id)) must(await FDB.from('assets').delete().eq('id', c.id)); continue; }
      const rec = {name: a.name, asset_type: ASSET_T_R[a.type] || 'other', purchased_on: a.purchase ? mStart(a.purchase) : null, purchase_price: a.cost || null,
        valuation_method: a.method || 'manual', valuation_rate_pct: a.ratePct || null, status: a.status === 'sold' ? 'sold' : 'active',
        sold_on: a.status === 'sold' ? mStart(a.sold || lastValM(a) || CTX.ASOF_YM) : null, smart_settings: a.smart ? smartSave(a.smart) : {}};
      if (!isUuid(a.id)) { const old = a.id, row = must(await FDB.from('assets').insert({household_id: hh(), ...rec}).select('id').single()); a.id = row.id; }
      else must(await FDB.from('assets').update(rec).eq('id', a.id));
      // the loan ↔ asset link lives on the loan
      const linked = ST.loans.filter(l => isUuid(l.id) && (l.asset === a.id || l.id === a.loan));
      for (const l of linked) { const want = a.loan === l.id; if ((l.asset === a.id) !== want || want) { l.asset = want ? a.id : null; must(await FDB.from('loans').update({asset_id: l.asset}).eq('id', l.id)); } }
    }
  },
  async tx(ch, now) {
    const upd = ch.filter(c => c.op === 'upd'), del = ch.filter(c => c.op === 'del');
    const byCat = new Map(), notes = [], splits = [];
    for (const c of upd) {
      const t = ST.tx.find(x => x.id === c.id), was = JSON.parse(this._prev?.get(c.id) || SYNC.sig.tx.get(c.id) || 'null');
      const [cat, sub, note, sp] = JSON.parse(c.v);
      if (!was || was[0] !== cat || was[1] !== sub) { const k = cat + '|' + sub; (byCat.get(k) || byCat.set(k, []).get(k)).push(c.id); }
      if (!was || was[2] !== note) notes.push([c.id, note]);
      if (!was || JSON.stringify(was[3]) !== JSON.stringify(sp)) splits.push([c.id, t]);
    }
    for (const [k, ids] of byCat) {
      const [cat, sub] = k.split('|'); const cid = cat ? catId(cat) : null, sid = await subId(cat, sub);
      for (const part of chunks(ids, 200)) must(await FDB.from('transactions').update({category_id: cid, subcategory_id: sid, match_source: cid ? 'user' : 'none'}).in('id', part));
    }
    for (const [id, note] of notes) must(await FDB.from('transactions').update({notes: note || null}).eq('id', id));
    for (const [id, t] of splits) {
      const lines = t?.splits ? await Promise.all(t.splits.map(async s => ({category_id: catId(s.cat), subcategory_id: await subId(s.cat, s.sub), amount: s.amt, notes: s.note || null}))) : [];
      must(await FDB.rpc('set_splits', {p_tx: id, p_lines: lines}));
    }
    for (const part of chunks(del.map(c => c.id), 200)) must(await FDB.from('transactions').delete().in('id', part));
  },
  async rules(ch) {
    for (const c of ch) {
      if (c.op === 'del') { must(await FDB.from('match_rules').delete().eq('household_id', hh()).eq('merchant_key', c.id).eq('match_type', 'exact')); continue; }
      const [cat, sub] = JSON.parse(c.v); if (!cat) continue;
      must(await FDB.from('match_rules').upsert({household_id: hh(), merchant_key: c.id, match_type: 'exact', category_id: catId(cat), subcategory_id: await subId(cat, sub), amount_sign: null, created_by: SESSION.user.id}, {onConflict: 'household_id,merchant_key,match_type,amount_sign'}));
    }
  },
  async budget(ch) {
    const rows = [], dels = [];
    for (const c of ch) {
      const [y, cat, sub] = c.id.split('|'); if (!ST.cats.some(x => x.name === cat)) continue;
      const cid = catId(cat), sid = sub ? await subId(cat, sub) : null;
      if (c.op === 'del') { dels.push([+y, cid, sid]); continue; }
      JSON.parse(c.v).forEach((v, i) => rows.push({household_id: hh(), year: +y, month: i + 1, category_id: cid, subcategory_id: sid, amount: v}));
    }
    for (const part of chunks(rows, 500)) must(await FDB.from('budgets').upsert(part, {onConflict: 'household_id,year,month,category_id,subcategory_id'}));
    for (const [y, cid, sid] of dels) { let q = FDB.from('budgets').delete().eq('household_id', hh()).eq('year', y).eq('category_id', cid); q = sid ? q.eq('subcategory_id', sid) : q.is('subcategory_id', null); must(await q); }
  },
  async bal(ch) {
    const ups = {account: [], loan: []}, dels = [];
    for (const c of ch) {
      const [kind, id0, m] = c.id.split('|');
      const ent = ST.bal.accounts.find(a => a.kind === kind && (a.id || '?' + a.name) === id0);
      const id = ent?.id || (isUuid(id0) ? id0 : null); if (!id) continue;
      if (c.op === 'del') { dels.push([kind, id, m]); continue; }
      const v = +c.v;
      ups[kind].push(kind === 'loan' ? {household_id: hh(), loan_id: id, month: mStart(m), balance: v, source: 'manual'} : {household_id: hh(), account_id: id, month: mStart(m), balance: v, source: 'manual'});
      if (kind === 'loan') { const l = ST.loans.find(x => x.id === id); if (l) l.actual[m] = v; }
    }
    if (ups.account.length) must(await FDB.from('account_balances').upsert(ups.account, {onConflict: 'account_id,month'}));
    if (ups.loan.length) must(await FDB.from('loan_balances').upsert(ups.loan, {onConflict: 'loan_id,month'}));
    for (const [kind, id, m] of dels) {
      must(await FDB.from(kind === 'loan' ? 'loan_balances' : 'account_balances').delete().eq(kind === 'loan' ? 'loan_id' : 'account_id', id).eq('month', mStart(m)));
      if (kind === 'loan') { const l = ST.loans.find(x => x.id === id); if (l) delete l.actual[m]; }
    }
  },
  async avals(ch) {
    const ups = [];
    for (const c of ch) {
      const [aid, m] = c.id.split('|'); const a = ST.assets.find(x => x.id === aid); const id = a?.id;
      if (!isUuid(id) && !isUuid(aid)) continue;
      if (c.op === 'del') { must(await FDB.from('asset_values').delete().eq('asset_id', aid).eq('month', mStart(m))); continue; }
      const [v, src] = JSON.parse(c.v);
      ups.push({household_id: hh(), asset_id: id, month: mStart(m), value: v, source: src || 'manual'});
    }
    if (ups.length) must(await FDB.from('asset_values').upsert(ups, {onConflict: 'asset_id,month'}));
  },
  async quotes(ch) {
    for (const c of ch) {
      const [aid, k] = c.id.split('|'); if (!isUuid(aid)) continue;
      const code = SRC_JS2DB[k] || k;
      if (c.op === 'del') { must(await FDB.from('asset_value_quotes').delete().eq('asset_id', aid).eq('source_code', code).eq('is_manual', true)); continue; }
      const q = JSON.parse(c.v);
      must(await FDB.from('asset_value_quotes').upsert({household_id: hh(), asset_id: aid, source_code: code, as_of: mStart(q.m), value: q.v, is_manual: true}, {onConflict: 'asset_id,source_code,as_of'}));
    }
  },
  async scn(ch) {
    for (const c of ch) {
      if (c.op === 'del') { if (isUuid(c.id)) must(await FDB.from('scenarios').delete().eq('id', c.id)); continue; }
      const s = SCN.find(x => x.id === c.id), [name, note, p, show, i] = JSON.parse(c.v);
      const rec = {name, note, params: p, show_on_charts: show, sort_order: (i + 1) * 10, is_base: i === 0};
      if (!isUuid(s.id)) { const old = s.id, row = must(await FDB.from('scenarios').insert({household_id: hh(), ...rec}).select('id').single()); s.id = row.id; if (SCSEL === old) SCSEL = row.id; if (PV.sc === old) PV.sc = row.id; }
      else must(await FDB.from('scenarios').update(rec).eq('id', s.id));
    }
  },
  async ledger(ch) {
    for (const c of ch) {
      if (c.op === 'del') { if (isUuid(c.id)) must(await FDB.from('tax_payments').delete().eq('id', c.id)); continue; }
      const l = TX.ledger.find(x => x.id === c.id);
      const type = PAY_T_R[l.type] || (/estimate/i.test(l.type) ? 'estimate' : /extension/i.test(l.type) ? 'extension' : 'balance_due');
      const rec = {jurisdiction: l.j, tax_year: l.ty, paid_on: l.d, payment_type: type, quarter: l.q ? +String(l.q).replace(/\D/g, '') || null : null, method: l.method || null,
        amount: l.amt, confirmation_last4: (l.conf || '').replace(/[^0-9A-Za-z]/g, '').slice(-4) || null, notes: l.note || null};
      if (!isUuid(l.id)) { const row = must(await FDB.from('tax_payments').insert({household_id: hh(), ...rec}).select('id').single()); l.id = row.id; }
      else must(await FDB.from('tax_payments').update(rec).eq('id', l.id));
    }
  },
  async taxw(ch) {   // withholding to date, for the safe-harbor check
    for (const c of ch) { const [y, j] = c.id.split('|'), [ytd, asof] = JSON.parse(c.v);
      must(await FDB.from('tax_years').upsert({household_id: hh(), tax_year: +y, jurisdiction: j, withholding_ytd: ytd, withholding_asof: asof}, {onConflict: 'household_id,tax_year,jurisdiction'})); }
  },
  async taxy(ch) {
    for (const c of ch) {
      const [y, j] = c.id.split('|'), [liab, credit] = JSON.parse(c.v);
      must(await FDB.from('tax_years').upsert({household_id: hh(), tax_year: +y, jurisdiction: j, liability: liab || null, overpayment_applied_next: credit || 0}, {onConflict: 'household_id,tax_year,jurisdiction'}));
    }
  },
  async plan(ch) {
    for (const c of ch) {
      if (c.op === 'del') { if (isUuid(c.id)) must(await FDB.from('planned_expenses').delete().eq('id', c.id)); continue; }
      const p = ST.planned.find(x => x.id === c.id);
      const rec = {name: p.name, due_month: mStart(p.due), amount: p.amount, fund_from: p.fund || 'cash', sinking_fund: !!p.sinking, notes: p.notes || null, status: p.status || 'planned'};
      if (!isUuid(p.id)) { const row = must(await FDB.from('planned_expenses').insert({household_id: hh(), ...rec}).select('id').single()); p.id = row.id; }
      else must(await FDB.from('planned_expenses').update(rec).eq('id', p.id));
    }
  },
  async prefs(ch) {
    if (!ch.length) return;
    must(await FDB.from('user_prefs').upsert({user_id: SESSION.user.id, household_id: hh(), prefs: prefsNow()}, {onConflict: 'user_id'}));
  },
};

/* ---------- explicit server-side operations (history beyond the loaded window) ---------- */
const DB = {
  bulkRecat(filter, cat, sub, rule) {
    return new Promise(res => SYNC.queue(async () => {
      const f = {}; if (filter.contains) f.contains = filter.contains;
      if (filter.fromCat && filter.fromCat !== '*') f.from_category = catId(filter.fromCat);
      if (filter.fromSub && filter.fromSub !== '*' && filter.fromCat !== '*') f.from_subcategory = await subId(filter.fromCat, filter.fromSub);
      if (filter.d0) f.date_from = mStart(filter.d0); if (filter.d1) f.date_to = ymLastDay(filter.d1);
      const n = must(await FDB.rpc('bulk_recategorize', {p_household: hh(), p_filter: f, p_category: catId(cat), p_subcategory: await subId(cat, sub), p_create_rule: !!rule}));
      const log = must(await FDB.from('change_log').select('id').eq('household_id', hh()).eq('action', 'recategorize').order('created_at', {ascending: false}).limit(1));
      res({n, logId: log[0]?.id});
    }));
  },
  undoChange(logId) { SYNC.queue(async () => { must(await FDB.rpc('undo_change', {p_log_id: logId})); }); },
  mergeCategory(fromId, intoId) { SYNC.queue(async () => { must(await FDB.rpc('merge_category', {p_from: fromId, p_into: intoId})); SYNC.sig.cats.delete(fromId); }); },
  moveSub(cat, sub, toCat, newName) {
    SYNC.queue(async () => {
      const sid = MAP.sub[catId(cat) + '|' + sub]; if (!sid) return;
      must(await FDB.rpc('move_subcategory', {p_sub: sid, p_to_category: catId(toCat), p_new_name: newName || null}));
      delete MAP.sub[catId(cat) + '|' + sub];
      if (newName && toCat === cat) { MAP.sub[catId(cat) + '|' + newName] = sid; }
    });
  },
  async importTx(rows, acctName, fileName, fixes = [], delIds = []) {
    const acct = MAP.acct[acctName]; if (!acct) throw new Error('Unknown account ' + acctName);
    for (const r of fixes) must(await FDB.from('transactions').update({amount: r.amt, description: r.desc, category_id: r.cat ? catId(r.cat) : null, subcategory_id: await subId(r.cat, r.sub), match_source: r.edited ? 'user' : 'history'}).eq('id', r.hit.id));
    for (const part of chunks(delIds, 200)) must(await FDB.from('transactions').delete().in('id', part));
    if (!rows.length) return [];
    const batch = must(await FDB.from('import_batches').insert({household_id: hh(), account_id: acct, file_name: fileName, row_count: rows.length, imported_count: rows.length,
      auto_matched: rows.filter(r => r.m && r.m.how !== 'new' && !r.edited).length, created_by: SESSION.user.id}).select('id').single());
    const recs = [];
    for (const r of rows) recs.push({household_id: hh(), account_id: acct, posted_on: r.d, description: r.desc, original_description: r.desc, amount: r.amt,
      category_id: r.cat ? catId(r.cat) : null, subcategory_id: await subId(r.cat, r.sub), import_batch_id: batch.id,
      match_source: !r.cat ? 'none' : r.edited ? 'user' : r.m?.how === 'your rule' ? 'rule' : 'history', match_confidence: r.m?.conf != null ? +(+r.m.conf).toFixed(3) : null});
    const out = [];
    for (const part of chunks(recs, 500)) out.push(...must(await FDB.from('transactions').insert(part).select('id, posted_on, description, amount')));
    return out;
  },
  // the bank's own month-end balances from a CSV's Balance column (kept apart from what you enter, for the data checks)
  async saveStatementBalances(acctName, bals, fileHi) {
    const acct = MAP.acct[acctName]; if (!acct || !bals) return;
    const rows = Object.entries(bals).map(([m, b]) => ({household_id: hh(), account_id: acct, month: mStart(m), balance: +(+b.v).toFixed(2), as_of: b.d, complete: fileHi > ymLastDay(m), source: 'csv'}))
      .filter(r => r.complete || !CTX.stmt.some(x => x.acct === acct && x.m === r.month.slice(0, 7) && x.complete));   // never replace a true month-end with a partial month
    if (!rows.length) return;
    must(await FDB.from('statement_balances').upsert(rows, {onConflict: 'account_id,month'}));
    rows.forEach(r => { const m = r.month.slice(0, 7), i = CTX.stmt.findIndex(x => x.acct === acct && x.m === m), o = {acct, m, v: r.balance, asOf: r.as_of, complete: r.complete};
      if (i >= 0) { if (CTX.stmt[i].complete && !o.complete) return; CTX.stmt[i] = o; } else CTX.stmt.push(o); });
  },
  async loadOlder(before, limit = 5000) {
    const out = [];
    for (let from = 0; from < limit; from += 1000) {
      const rows = must(await FDB.from('transactions').select('id, posted_on, description, amount, category_id, subcategory_id, project_id, account_id, notes, is_split, transaction_splits(category_id, subcategory_id, amount, notes, sort_order)')
        .eq('household_id', hh()).lt('posted_on', before).order('posted_on', {ascending: false}).range(from, from + 999));
      out.push(...rows); if (rows.length < 1000) break;
    }
    return out.map(r => { const t = {id: r.id, d: r.posted_on, desc: r.description, amt: +r.amount, cat: MAP.catName[r.category_id] || '', sub: MAP.subName[r.subcategory_id]?.name || '', proj: MAP.projCode[r.project_id] || '', acct: MAP.acctName[r.account_id] || '', note: r.notes || ''};
      if (r.is_split && r.transaction_splits?.length) t.splits = r.transaction_splits.sort((a, b) => a.sort_order - b.sort_order).map(s => ({cat: MAP.catName[s.category_id] || '', sub: MAP.subName[s.subcategory_id]?.name || '', amt: +s.amount, note: s.notes || ''}));
      return t; });
  },
};
const ymLastDay = s => { const [y, m] = s.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
window.DB = DB; window.SYNC = SYNC; window.signOut = signOut; window.showLogin = showLogin;

start();
