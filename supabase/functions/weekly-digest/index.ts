// eckert.fin · weekly-digest
// Reads the household's calendars (iCloud public calendar links or any app's iCal / .ics link) plus the money the app
// already knows (Cash plan bills, loan payments, estimated tax due dates, planned milestones), builds a two-week digest,
// saves it (finance.digests → the app's This week page) and emails it.
//
// Called three ways:
//   • pg_cron every hour (supabase/digest_schedule.sql) with header x-cron-secret: <CRON_SECRET>
//       → for each household, only when it's the chosen day and hour in the household's time zone (default Sunday 5 pm Central)
//         and this week's digest hasn't been emailed yet
//   • the app (Admin → Weekly digest → Build now / Build & email) with the signed-in user's token → that household
//   • the app (Admin → Weekly digest → Test) with {action: 'test_feed', url} → checks one calendar link, saves nothing
//
// Secrets (Supabase → Edge Functions → Secrets; never in the repo):
//   CRON_SECRET (same one market-data uses)
//   Email (optional — without it the digest is saved but not emailed), either:
//     GMAIL_USER (e.g. you@gmail.com) + GMAIL_APP_PASSWORD (a Google App Password, not your Gmail password), or
//     RESEND_API_KEY (+ a domain verified in Resend)
//   DIGEST_FROM  optional display name + address, e.g. "eckert.fin <you@gmail.com>"
//   APP_URL      optional, default https://finance.eckerthaus.com/#week
// Deploy with JWT verification OFF (the function checks the cron secret or the user itself):
//   supabase functions deploy weekly-digest --no-verify-jwt
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.16';

/* =====================================================================
   Digest building blocks — iCal parsing, bill occurrences, the digest and the email (no network, no database)
   ===================================================================== */
// ---------------------------------------------------------------- time zones
// minutes the zone is ahead of UTC at a given instant (e.g. America/Chicago in summer → −300)
const FMT = new Map<string, Intl.DateTimeFormat>();   // building a formatter is slow; one per zone and shape is plenty
const fmtFor = (tz: string, wd: boolean) => { const k = tz + (wd ? '|w' : ''); let f = FMT.get(k);
  if (!f) { f = new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', ...(wd ? {weekday: 'short'} : {})}); FMT.set(k, f); } return f; };
function tzOffset(tz: string, utcMs: number) {
  const f = fmtFor(tz, false);
  const p: Record<string, number> = {}; f.formatToParts(new Date(utcMs)).forEach(x => { if (x.type !== 'literal') p[x.type] = +x.value; });
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - utcMs) / 60000;
}
// a wall-clock time in a zone → UTC ms (two passes handle the DST edges)
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let off = tzOffset(tz, guess); let t = guess - off * 60000;
  const off2 = tzOffset(tz, t); if (off2 !== off) t = guess - off2 * 60000;
  return t;
}
export function localParts(utcMs: number, tz: string) {
  const f = fmtFor(tz, false);
  const p: Record<string, string> = {}; f.formatToParts(new Date(utcMs)).forEach(x => { if (x.type !== 'literal') p[x.type] = x.value; });
  return {date: `${p.year}-${p.month}-${p.day}`, h: +p.hour % 24, m: +p.minute};
}
export const timeLabel = (h: number, m: number) => `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`;

// ---------------------------------------------------------------- plain dates (YYYY-MM-DD)
export const dAdd = (d: string, n: number) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();   // 0 = Sunday
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// ---------------------------------------------------------------- iCal
type Prop = {name: string; params: Record<string, string>; value: string};
export type CalEvent = {uid: string; title: string; location: string; allDay: boolean; startUtc: number; endUtc: number; date: string; endDate: string; time: string | null; status: string};
const unescapeText = (s: string) => s.replace(/\\n/gi, ' · ').replace(/\\([,;\\])/g, '$1').trim();
function parseProps(block: string[]): Prop[] {
  return block.map(line => {
    let i = 0, q = false; for (; i < line.length; i++) { const c = line[i]; if (c === '"') q = !q; else if (c === ':' && !q) break; }
    const head = line.slice(0, i), value = line.slice(i + 1), parts = head.split(';'), params: Record<string, string> = {};
    parts.slice(1).forEach(p => { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ''); });
    return {name: parts[0].toUpperCase(), params, value};
  });
}
// DTSTART-style value → {wall clock parts, kind}; 'utc' (…Z), 'zoned' (TZID) or 'floating', or 'date' (all day)
function parseDT(p: Prop, defTz: string) {
  const v = p.value.trim(), date = /^\d{8}$/.test(v) || p.params.VALUE === 'DATE';
  const y = +v.slice(0, 4), mo = +v.slice(4, 6), d = +v.slice(6, 8);
  if (date) return {y, mo, d, h: 0, mi: 0, s: 0, allDay: true, tz: defTz};
  const h = +v.slice(9, 11), mi = +v.slice(11, 13), s = +v.slice(13, 15) || 0;
  if (v.endsWith('Z')) return {y, mo, d, h, mi, s, allDay: false, tz: 'UTC'};
  let tz = p.params.TZID || defTz; try { new Intl.DateTimeFormat('en-US', {timeZone: tz}); } catch { tz = defTz; }   // Windows-style names fall back to home
  return {y, mo, d, h, mi, s, allDay: false, tz};
}
type DT = ReturnType<typeof parseDT>;
const dtUtc = (x: DT) => x.tz === 'UTC' ? Date.UTC(x.y, x.mo - 1, x.d, x.h, x.mi, x.s) : zonedToUtc(x.y, x.mo, x.d, x.h, x.mi, x.s, x.tz);
const dtKey = (x: DT) => ymd(x.y, x.mo, x.d) + (x.allDay ? '' : `T${x.h}:${x.mi}`);

const DOW: Record<string, number> = {SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6};
// expand an RRULE into wall-clock start dates (YYYY-MM-DD) between from and to (inclusive); time of day stays the master's
function expandRule(rule: string, start: DT, from: string, to: string, ex: Set<string>): string[] {
  const R: Record<string, string> = {}; rule.split(';').forEach(kv => { const [k, v] = kv.split('='); if (k && v) R[k.toUpperCase()] = v; });
  const freq = R.FREQ, interval = Math.max(1, +(R.INTERVAL || 1)), count = R.COUNT ? +R.COUNT : Infinity;
  const until = R.UNTIL ? ymd(+R.UNTIL.slice(0, 4), +R.UNTIL.slice(4, 6), +R.UNTIL.slice(6, 8)) : '9999-12-31';
  const s0 = ymd(start.y, start.mo, start.d), byday = (R.BYDAY || '').split(',').filter(Boolean), bymd = (R.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
  const out: string[] = []; let n = 0;
  const take = (d: string) => { if (d < s0 || d > until || n >= count) return false; n++; if (d >= from && d <= to && !ex.has(d)) out.push(d); return true; };
  const hardStop = dAdd(to, 1);
  const DAY = 864e5, gap = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY), skip = count === Infinity && from > s0;
  if (freq === 'DAILY') { const jump = skip ? Math.max(0, Math.floor((gap(s0, from) - 2) / interval)) * interval : 0; for (let d = dAdd(s0, jump), k = 0; d <= until && d <= hardStop && n < count && k < 5000; d = dAdd(d, interval), k++) take(d); }
  else if (freq === 'WEEKLY') {
    const days = byday.length ? byday.map(b => DOW[b.slice(-2)]).sort() : [dow(s0)];
    let wk0 = dAdd(s0, -dow(s0));   // Sunday of the first week
    if (skip) { const wks = Math.max(0, Math.floor((gap(wk0, from) / 7 - 1) / interval)) * interval; wk0 = dAdd(wk0, wks * 7); }
    for (let w = wk0, k = 0; w <= until && w <= hardStop && n < count && k < 3000; w = dAdd(w, 7 * interval), k++) days.forEach(dd => take(dAdd(w, dd)));
  } else if (freq === 'MONTHLY') {
    let y0 = start.y, m0 = start.mo;
    if (skip) { const fy = +from.slice(0, 4), fm = +from.slice(5, 7), months = (fy - y0) * 12 + (fm - m0) - 1; if (months > 0) { const k = Math.floor(months / interval) * interval; m0 += k; y0 += Math.floor((m0 - 1) / 12); m0 = (m0 - 1) % 12 + 1; } }
    for (let y = y0, m = m0, k = 0; k < 1200 && n < count; k++) {
      const first = ymd(y, m, 1); if (first > until || first > hardStop) break;
      const dim = daysIn(y, m), cands: number[] = [];
      if (byday.length) byday.forEach(b => { const mm = b.match(/^([+-]?\d+)?(\w\w)$/); if (!mm) return; const wd = DOW[mm[2]], nth = mm[1] ? +mm[1] : 0;
        const all: number[] = []; for (let d = 1; d <= dim; d++) if (dow(ymd(y, m, d)) === wd) all.push(d);
        if (!nth) cands.push(...all); else { const pick = nth > 0 ? all[nth - 1] : all[all.length + nth]; if (pick) cands.push(pick); } });
      else (bymd.length ? bymd : [start.d]).forEach(md => { const d = md < 0 ? dim + md + 1 : md; if (d >= 1 && d <= dim) cands.push(d); });
      cands.sort((a, b) => a - b).forEach(d => take(ymd(y, m, d)));
      m += interval; while (m > 12) { m -= 12; y++; }
    }
  } else if (freq === 'YEARLY') {
    const y0 = skip ? start.y + Math.max(0, Math.floor((+from.slice(0, 4) - start.y - 1) / interval)) * interval : start.y;
    for (let y = y0, k = 0; k < 200 && n < count; y += interval, k++) { const d = ymd(y, start.mo, Math.min(start.d, daysIn(y, start.mo))); if (d > until || d > hardStop) break; take(d); }
  } else take(s0);
  return out;
}

// all events that touch [from, to] (local dates in tz), recurring ones expanded, cancelled ones and exceptions handled
export function parseICS(text: string, from: string, to: string, tz: string): CalEvent[] {
  // cheap pre-check on the raw lines: keep anything recurring or moved, and one-off events within a few days of the window
  const lo = dAdd(from, -3).replace(/-/g, ''), hi = dAdd(to, 3).replace(/-/g, '');
  const keepRaw = (b: string[]) => { let ds = '', de = ''; for (const l of b) { if (l.startsWith('RRULE') || l.startsWith('RECURRENCE-ID')) return true;
      if (l.startsWith('DTSTART')) ds = (l.match(/:(\d{8})/) || [])[1] || ''; else if (l.startsWith('DTEND')) de = (l.match(/:(\d{8})/) || [])[1] || ''; }
    if (!ds) return false; return ds <= hi && (de || ds) >= lo; };
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const blocks: Prop[][] = []; let cur: string[] | null = null, depth = 0;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') { cur = []; depth = 0; continue; }
    if (cur && l.startsWith('BEGIN:')) { depth++; continue; }          // VALARM inside an event
    if (cur && l.startsWith('END:') && depth) { depth--; continue; }
    if (l === 'END:VEVENT' && cur) { if (keepRaw(cur)) blocks.push(parseProps(cur)); cur = null; continue; }
    if (cur && !depth) cur.push(l);
  }
  const masters: Prop[][] = [], overrides: Record<string, Prop[]> = {};
  blocks.forEach(b => { const rid = b.find(p => p.name === 'RECURRENCE-ID'), uid = b.find(p => p.name === 'UID')?.value || '';
    if (rid) overrides[uid + '|' + dtKey(parseDT(rid, tz))] = b; else masters.push(b); });
  const out: CalEvent[] = [];
  const emit = (b: Prop[], st: DT, en: DT | null, durMs: number) => {
    const g = (n: string) => b.find(p => p.name === n)?.value || '';
    if (/CANCELLED/i.test(g('STATUS'))) return;
    const home = st.allDay || st.tz === tz, s = home ? Date.UTC(st.y, st.mo - 1, st.d, st.h, st.mi, st.s) : dtUtc(st), e = en ? (home && (en.allDay || en.tz === tz) ? Date.UTC(en.y, en.mo - 1, en.d, en.h, en.mi, en.s) : dtUtc(en)) : s + durMs;
    let date: string, endDate: string, time: string | null = null;
    if (st.allDay) { date = ymd(st.y, st.mo, st.d); endDate = en ? dAdd(ymd(en.y, en.mo, en.d), -1) : date; if (endDate < date) endDate = date; }
    else if (home) { date = ymd(st.y, st.mo, st.d); time = timeLabel(st.h, st.mi); endDate = new Date(Math.max(s, e - 1)).toISOString().slice(0, 10); }   // wall-clock ms: sorting and spans are all that need it
    else { const L = localParts(s, tz); date = L.date; time = timeLabel(L.h, L.m); endDate = localParts(Math.max(s, e - 1), tz).date; }
    // startUtc / endUtc hold home wall-clock time (used only for sorting and spans), so shift converted events the same way
    const sh = home ? 0 : tzOffset(tz, s) * 60000;
    if (endDate < from || date > to) return;
    out.push({uid: g('UID'), title: unescapeText(g('SUMMARY')) || '(busy)', location: unescapeText(g('LOCATION')), allDay: st.allDay, startUtc: s + sh, endUtc: e + sh, date, endDate, time, status: g('STATUS')});
  };
  for (const b of masters) {
    const dsP = b.find(p => p.name === 'DTSTART'); if (!dsP) continue;
    const st = parseDT(dsP, tz), deP = b.find(p => p.name === 'DTEND'), en = deP ? parseDT(deP, tz) : null;
    const rr = b.find(p => p.name === 'RRULE')?.value, uid = b.find(p => p.name === 'UID')?.value || '';
    if (rr) { const u = rr.match(/UNTIL=(\d{8})/); if (u && u[1] < from.replace(/-/g, '')) continue; }   // a series that ended before the window
    const wall = (x: DT) => (x.allDay || x.tz === tz) ? Date.UTC(x.y, x.mo - 1, x.d, x.h, x.mi, x.s) : dtUtc(x), durMs = en ? wall(en) - wall(st) : st.allDay ? 864e5 : 0;
    if (!rr) { const d0 = ymd(st.y, st.mo, st.d), d1 = en ? ymd(en.y, en.mo, en.d) : d0; if (d1 < dAdd(from, -2) || d0 > dAdd(to, 2)) continue; emit(b, st, en, durMs); continue; }
    const ex = new Set<string>(); b.filter(p => p.name === 'EXDATE').forEach(p => p.value.split(',').forEach(v => { const x = parseDT({...p, value: v}, tz); ex.add(ymd(x.y, x.mo, x.d)); }));
    const spanDays = st.allDay && en ? Math.max(0, Math.round((Date.UTC(en.y, en.mo - 1, en.d) - Date.UTC(st.y, st.mo - 1, st.d)) / 864e5) - 1) : 0;
    for (const d of expandRule(rr, st, dAdd(from, -spanDays - 1), to, ex)) {
      const [y, mo, dd] = d.split('-').map(Number), inst: DT = {...st, y, mo, d: dd};
      const ov = overrides[uid + '|' + dtKey(inst)];
      if (ov) { const os = ov.find(p => p.name === 'DTSTART'), oe = ov.find(p => p.name === 'DTEND'); if (os) { const ost = parseDT(os, tz); emit(ov, ost, oe ? parseDT(oe, tz) : null, durMs); } continue; }
      emit(b, inst, null, durMs);
    }
  }
  // moved instances whose master's own date falls outside the window still count
  Object.values(overrides).forEach(ov => { const os = ov.find(p => p.name === 'DTSTART'); if (!os) return; const ost = parseDT(os, tz), d = ymd(ost.y, ost.mo, ost.d);
    if (d >= from && d <= to && !out.some(e => e.uid === (ov.find(p => p.name === 'UID')?.value || '') && e.date === d)) { const oe = ov.find(p => p.name === 'DTEND'); emit(ov, ost, oe ? parseDT(oe, tz) : null, 0); } });
  return out.sort((a, b) => a.startUtc - b.startUtc);
}

// ---------------------------------------------------------------- Cash plan items (same rules as the app's Cash plan)
export type CashItem = {name: string; kind: string; amount: number; frequency: string; start_date: string; day2: number | null; end_date: string | null; is_active: boolean; category?: string | null; vendor?: string | null};
export function occurrences(it: CashItem, from: string, to: string): string[] {
  if (it.is_active === false || !it.start_date) return [];
  const out: string[] = [], s = it.start_date, push = (d: string) => { if (d >= from && d <= to && d >= s && (!it.end_date || d <= it.end_date)) out.push(d); };
  const sy = +s.slice(0, 4), sm = +s.slice(5, 7), sd = +s.slice(8, 10);
  if (it.frequency === 'once') push(s);
  else if (it.frequency === 'weekly' || it.frequency === 'biweekly') { const step = it.frequency === 'weekly' ? 7 : 14; let d = s; while (d < from) d = dAdd(d, step); for (; d <= to; d = dAdd(d, step)) push(d); }
  else {
    const every = ({semimonthly: 1, monthly: 1, quarterly: 3, annual: 12} as Record<string, number>)[it.frequency] || 1, d2 = it.day2 || Math.min(sd + 15, 31);
    for (let k = 0; k < 600; k += every) { const y = sy + Math.floor((sm - 1 + k) / 12), m = (sm - 1 + k) % 12 + 1, first = ymd(y, m, Math.min(sd, daysIn(y, m)));
      if (first > to) break; push(first); if (it.frequency === 'semimonthly') push(ymd(y, m, Math.min(d2, daysIn(y, m)))); }
  }
  return out.sort();
}

// ---------------------------------------------------------------- the digest
export type Feed = {label: string; color: string; events: CalEvent[]; ok: boolean; error?: string};
export type DigestInput = {
  tz: string; from: string; to: string; today: string; threshold: number;
  feeds: Feed[]; cash: CashItem[];
  loans: {name: string; payment: number | null; escrow?: number | null; lender?: string | null}[];
  taxDue: {date: string; quarter: number}[];
  planned: {name: string; due_month: string; amount: number; fund_from: string | null}[];
  checking: {balance: number; asOf: string} | null;
};
export type Bill = {date: string; name: string; amount: number; why: 'big' | 'loan' | 'tax' | 'milestone'; note?: string};
export function buildDigest(I: DigestInput) {
  const loanRe = new RegExp('\\b(mortgage|loan|car payment|student loan' + I.loans.map(l => '|' + l.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + ')\\b', 'i');
  const bills: Bill[] = [];
  I.cash.filter(c => c.kind !== 'income' && c.kind !== 'transfer').forEach(c => {
    const label = `${c.name} ${c.vendor || ''} ${c.category || ''}`, isLoan = loanRe.test(label) || I.loans.some(l => (l.payment || 0) > 0 && (Math.abs(Math.abs(+c.amount) - +l.payment!) <= +l.payment! * .1 || Math.abs(Math.abs(+c.amount) - (+l.payment! + +(l.escrow || 0))) <= (+l.payment! + +(l.escrow || 0)) * .1)), isTax = /\btax(es)?\b/i.test(label) && !/prep/i.test(label);
    occurrences(c, I.from, I.to).forEach(d => { const amt = Math.abs(+c.amount);
      if (isLoan) bills.push({date: d, name: c.name, amount: amt, why: 'loan'});
      else if (isTax) bills.push({date: d, name: c.name, amount: amt, why: 'tax'});
      else if (amt >= I.threshold) bills.push({date: d, name: c.name, amount: amt, why: 'big'}); });
  });
  // loans without a Cash plan item: show the payment on the 1st, flagged
  // a loan counts as on the Cash plan when a bill there matches its payment (with or without escrow, ±10%) or its lender's name
  const covers = (l: DigestInput['loans'][number], c: CashItem) => { const a = Math.abs(+c.amount), p = +(l.payment || 0), pe = p + +(l.escrow || 0), txt = `${c.name} ${c.vendor || ''}`.toLowerCase();
    return Math.abs(a - p) <= p * .1 || Math.abs(a - pe) <= pe * .1 || (!!l.lender && txt.includes(l.lender.toLowerCase().split(/\s+/)[0])); };
  I.loans.filter(l => (l.payment || 0) > 0 && !I.cash.some(c => c.kind !== 'income' && c.kind !== 'transfer' && covers(l, c)))
    .forEach(l => { for (let d = I.from; d <= I.to; d = dAdd(d, 1)) if (d.endsWith('-01')) bills.push({date: d, name: l.name, amount: +l.payment!, why: 'loan', note: 'due date not on the Cash plan'}); });
  // estimated tax due dates (the amount comes from a Cash plan tax item that day, if there is one)
  I.taxDue.filter(t => t.date >= I.from && t.date <= I.to).forEach(t => { if (!bills.some(b => b.why === 'tax' && Math.abs(Date.parse(b.date) - Date.parse(t.date)) < 4 * 864e5))
    bills.push({date: t.date, name: `Estimated tax payments · Q${t.quarter}`, amount: 0, why: 'tax', note: 'Federal, Oklahoma and New Mexico · amounts on the Taxes page'}); });
  // planned milestones due this month or next (month-level, shown on the 1st or the window start)
  I.planned.filter(p => p.due_month.slice(0, 7) >= I.from.slice(0, 7) && p.due_month.slice(0, 7) <= I.to.slice(0, 7) && Math.abs(p.amount) >= I.threshold)
    .forEach(p => bills.push({date: p.due_month.slice(0, 10) < I.from ? I.from : p.due_month.slice(0, 10), name: p.name, amount: Math.abs(+p.amount), why: 'milestone', note: `planned · ${p.fund_from === 'budget' ? 'in the monthly budget' : p.fund_from || ''}`}));
  bills.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);

  const days: {date: string; events: (CalEvent & {cal: string; color: string; cont: boolean})[]; bills: Bill[]}[] = [];
  for (let d = I.from; d <= I.to; d = dAdd(d, 1)) days.push({date: d, events: [], bills: bills.filter(b => b.date === d)});
  I.feeds.forEach(f => f.events.forEach(e => days.forEach(day => {
    if (day.date === e.date || (e.allDay && day.date > e.date && day.date <= e.endDate)) day.events.push({...e, cal: f.label, color: f.color, cont: day.date !== e.date});
  })));
  days.forEach(d => d.events.sort((a, b) => (a.allDay === b.allDay ? a.startUtc - b.startUtc : a.allDay ? -1 : 1)));
  const wk1End = dAdd(I.from, 6), paid = bills.filter(b => b.why !== 'milestone'), w1 = paid.filter(b => b.date <= wk1End), w2 = paid.filter(b => b.date > wk1End);   // milestones show, but don't count as bills due
  const sum = (a: Bill[]) => a.reduce((t, b) => t + b.amount, 0);
  return {
    v: 1, tz: I.tz, from: I.from, to: I.to, generated: new Date().toISOString(), threshold: I.threshold,
    calendars: I.feeds.map(f => ({label: f.label, color: f.color, ok: f.ok, error: f.error || null, count: f.events.length})),
    days, bills, totals: {week1: sum(w1), week2: sum(w2), all: sum(paid)},
    counts: {events: days.reduce((t, d) => t + d.events.filter(e => !e.cont).length, 0), week1Events: days.filter(d => d.date <= wk1End).reduce((t, d) => t + d.events.filter(e => !e.cont).length, 0)},
    checking: I.checking,
  };
}
export type Digest = ReturnType<typeof buildDigest>;

// ---------------------------------------------------------------- email
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));
const money = (v: number) => '$' + Math.round(v).toLocaleString('en-US');
const DN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dLabel = (d: string) => `${DN[dow(d)]}, ${MN[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
export const subjectOf = (D: Digest) => `This week · ${MN[+D.from.slice(5, 7) - 1]} ${+D.from.slice(8, 10)}–${MN[+D.to.slice(5, 7) - 1] === MN[+D.from.slice(5, 7) - 1] ? '' : MN[+D.to.slice(5, 7) - 1] + ' '}${+D.to.slice(8, 10)} · ${D.counts.week1Events} event${D.counts.week1Events === 1 ? '' : 's'}${D.totals.week1 ? ' · ' + money(D.totals.week1) + ' in bills' : ''}`;
export function emailHtml(D: Digest, appUrl: string) {
  const wk1End = dAdd(D.from, 6);
  const dayHtml = (d: Digest['days'][number]) => {
    if (!d.events.length && !d.bills.length) return '';
    return `<tr><td style="padding:14px 0 6px;font:700 12px Montserrat,Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#68726c">${dLabel(d.date)}</td></tr>`
      + d.events.map(e => `<tr><td style="padding:5px 0;font:500 14px Montserrat,Arial,sans-serif;color:#050806"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${esc(e.color)};margin-right:8px"></span><span style="color:#68726c;display:inline-block;min-width:66px">${e.allDay ? 'All day' : esc(e.time)}</span>${esc(e.title)}${e.cont ? ' <span style="color:#68726c">(continues)</span>' : ''}<span style="color:#68726c"> · ${esc(e.cal)}${e.location ? ' · ' + esc(e.location) : ''}</span></td></tr>`).join('')
      + d.bills.map(b => `<tr><td style="padding:5px 0;font:600 14px Montserrat,Arial,sans-serif;color:#050806"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${b.why === 'milestone' ? '#6250d6' : '#eda100'};margin-right:8px"></span><span style="color:#68726c;display:inline-block;min-width:66px">${b.why === 'milestone' ? 'Planned' : 'Bill'}</span>${esc(b.name)}${b.amount ? ' · ' + money(b.amount) : ''}${b.note ? ` <span style="color:#68726c;font-weight:500">· ${esc(b.note)}</span>` : ''}</td></tr>`).join('');
  };
  const wk = (a: string, b: string) => D.days.filter(d => d.date >= a && d.date <= b).map(dayHtml).join('') || '<tr><td style="padding:8px 0;font:500 14px Montserrat,Arial,sans-serif;color:#68726c">Nothing on the calendars.</td></tr>';
  const cover = D.checking && D.totals.week1 > 0 ? (D.checking.balance >= D.totals.week1 ? `Checking had ${money(D.checking.balance)} at the end of ${D.checking.asOf} — enough for this week’s ${money(D.totals.week1)}.` : `Heads up: this week’s bills (${money(D.totals.week1)}) are more than the ${money(D.checking.balance)} checking had at the end of ${D.checking.asOf}.`) : '';
  const bad = D.calendars.filter(c => !c.ok);
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e3e8e5">
<tr><td style="background:linear-gradient(135deg,#04140c,#0e3b27 55%,#167a43);background-color:#0e3b27;padding:26px 28px;color:#fff">
 <div style="font:700 11px Montserrat,Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;opacity:.75">eckert.fin · weekly digest</div>
 <div style="font:700 26px Montserrat,Arial,sans-serif;letter-spacing:-.02em;margin-top:6px">${dLabel(D.from).split(',')[1].trim()} – ${dLabel(wk1End).split(',')[1].trim()}</div>
 <div style="font:500 14px Montserrat,Arial,sans-serif;opacity:.85;margin-top:6px">${D.counts.week1Events} event${D.counts.week1Events === 1 ? '' : 's'} this week · ${D.totals.week1 ? money(D.totals.week1) + ' in bills' : 'no big bills'}${D.totals.week2 ? ' · ' + money(D.totals.week2) + ' the week after' : ''}</div></td></tr>
<tr><td style="padding:8px 28px 4px"><table role="presentation" width="100%">${wk(D.from, wk1End)}</table></td></tr>
${D.to > wk1End ? `<tr><td style="padding:18px 28px 0"><div style="font:700 15px Montserrat,Arial,sans-serif;color:#0e3b27;border-top:1px solid #e3e8e5;padding-top:18px">Coming up the week after</div></td></tr><tr><td style="padding:0 28px 4px"><table role="presentation" width="100%">${wk(dAdd(wk1End, 1), D.to)}</table></td></tr>` : ''}
${cover ? `<tr><td style="padding:16px 28px 0"><div style="background:#f1f9f4;border-radius:12px;padding:12px 14px;font:500 13px Montserrat,Arial,sans-serif;color:#0e3b27">${esc(cover)}</div></td></tr>` : ''}
${bad.length ? `<tr><td style="padding:12px 28px 0;font:500 12px Montserrat,Arial,sans-serif;color:#8a5d00">Couldn’t read: ${bad.map(c => esc(c.label)).join(', ')} — check the link in Admin → Weekly digest.</td></tr>` : ''}
<tr><td style="padding:22px 28px 26px"><a href="${esc(appUrl)}" style="display:inline-block;background:#0e3b27;color:#fff;text-decoration:none;font:600 14px Montserrat,Arial,sans-serif;padding:11px 18px;border-radius:999px">Open This week in eckert.fin</a></td></tr>
</table><div style="font:500 11px Montserrat,Arial,sans-serif;color:#68726c;margin-top:12px">Bills of ${money(D.threshold)} or more, plus every loan and tax payment.</div></td></tr></table></body></html>`;
}

/* =====================================================================
   The function
   ===================================================================== */

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'https://finance.eckerthaus.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers: {...cors, 'Content-Type': 'application/json'}});
const env = (k: string) => (Deno.env.get(k) ?? '').trim();

async function fetchICS(url: string) {
  const u = url.trim().replace(/^webcal:\/\//i, 'https://');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    let r: Response;
    try { r = await fetch(u, {headers: {'User-Agent': 'eckert.fin weekly-digest', Accept: 'text/calendar,*/*'}, signal: ctl.signal, redirect: 'follow'}); }
    catch (e) { throw new Error(ctl.signal.aborted ? `${new URL(u).host} didn’t answer in 15 seconds` : `couldn’t reach ${new URL(u).host} — check the link`); }
    if (!r.ok) throw new Error(`${new URL(u).host} answered ${r.status}`);
    const txt = await r.text(); if (txt.length > 8_000_000) throw new Error('calendar is too large');
    if (!/BEGIN:VCALENDAR/i.test(txt)) throw new Error('that link isn’t an iCal (.ics) calendar');
    return txt;
  } finally { clearTimeout(t); }
}

type Settings = {tz?: string; threshold?: number; days?: number; sendDow?: number; sendHour?: number; email?: boolean; emails?: string[]};
const settingsOf = (s: any): Required<Settings> => ({tz: 'America/Chicago', threshold: 500, days: 14, sendDow: 0, sendHour: 17, email: true, emails: [], ...(s || {})});
// the Monday the digest covers: next week's on a weekend, this week's otherwise
function weekStart(today: string) { const w = dow(today); return w === 0 ? dAdd(today, 1) : w === 6 ? dAdd(today, 2) : dAdd(today, 1 - w); }

async function buildFor(fin: any, admin: any, hh: string, opts: {send: boolean; trigger: string}) {
  const {data: h} = await fin.from('households').select('id, name, settings').eq('id', hh).single();
  const S = settingsOf(h?.settings?.digest), now = Date.now(), L = localParts(now, S.tz), from = weekStart(L.date), to = dAdd(from, Math.max(7, Math.min(28, S.days)) - 1);
  // calendars
  const {data: feedRows} = await fin.from('calendar_feeds').select('*').eq('household_id', hh).eq('enabled', true).order('sort_order');
  const feeds: Feed[] = [];
  for (const f of feedRows || []) {
    try { const ev = parseICS(await fetchICS(f.url), from, to, S.tz); feeds.push({label: f.label, color: f.color, events: ev, ok: true});
      await fin.from('calendar_feeds').update({last_fetched: new Date().toISOString(), last_ok: true, last_error: null, last_count: ev.length}).eq('id', f.id); }
    catch (e) { feeds.push({label: f.label, color: f.color, events: [], ok: false, error: (e as Error).message});
      await fin.from('calendar_feeds').update({last_fetched: new Date().toISOString(), last_ok: false, last_error: (e as Error).message}).eq('id', f.id); }
  }
  // money
  const [{data: cash}, {data: loans}, {data: planned}, {data: accts}] = await Promise.all([
    fin.from('cash_items').select('name, kind, amount, frequency, start_date, day2, end_date, is_active, vendor, categories(name)').eq('household_id', hh).eq('is_active', true),
    fin.from('loans').select('name, lender, payment, escrow, status').eq('household_id', hh).eq('status', 'active'),
    fin.from('planned_expenses').select('name, due_month, amount, fund_from, status').eq('household_id', hh).eq('status', 'planned').gte('due_month', from.slice(0, 8) + '01').lte('due_month', to),
    fin.from('accounts').select('id, kind, is_active').eq('household_id', hh).eq('kind', 'checking'),
  ]);
  let checking: {balance: number; asOf: string} | null = null;
  const ids = (accts || []).map((a: any) => a.id);
  if (ids.length) {
    const {data: bal} = await fin.from('account_balances').select('account_id, month, balance').in('account_id', ids).order('month', {ascending: false}).limit(ids.length * 3);
    const latest: Record<string, any> = {}; (bal || []).forEach((b: any) => { if (!latest[b.account_id]) latest[b.account_id] = b; });
    const L2 = Object.values(latest); if (L2.length) { const m = L2.map((b: any) => b.month).sort().pop() as string; checking = {balance: L2.reduce((t: number, b: any) => t + +b.balance, 0), asOf: `${MN[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`}; }
  }
  const y = +from.slice(0, 4), taxDue = [y - 1, y].flatMap(yy => [[1, `${yy}-04-15`], [2, `${yy}-06-15`], [3, `${yy}-09-15`], [4, `${yy + 1}-01-15`]].map(([q, d]) => ({quarter: q as number, date: d as string})));
  const D = buildDigest({tz: S.tz, from, to, today: L.date, threshold: +S.threshold || 500, feeds,
    cash: (cash || []).map((c: any) => ({...c, amount: +c.amount, category: c.categories?.name || null})),
    loans: (loans || []).map((l: any) => ({name: l.name, lender: l.lender, payment: l.payment == null ? null : +l.payment, escrow: l.escrow == null ? null : +l.escrow})), taxDue,
    planned: (planned || []).map((p: any) => ({...p, amount: +p.amount})), checking});
  const {data: saved, error} = await fin.from('digests').upsert({household_id: hh, week_start: from, range_end: to, generated_at: new Date().toISOString(), payload: D}, {onConflict: 'household_id,week_start'}).select('id, emailed_at').single();
  if (error) throw error;
  let emailed: string[] = [], emailNote = '';
  if (opts.send && S.email !== false) {
    let to_ = (S.emails || []).filter(e => /@/.test(e));
    if (!to_.length) {   // default: everyone in the household who can edit
      const {data: mem} = await fin.from('household_members').select('user_id, role').eq('household_id', hh).in('role', ['owner', 'editor']);
      for (const m of mem || []) { const {data: u} = await admin.auth.admin.getUserById(m.user_id); if (u?.user?.email) to_.push(u.user.email); }
    }
    const html = emailHtml(D, env('APP_URL') || 'https://finance.eckerthaus.com/#week'), subject = subjectOf(D);
    if (!to_.length) emailNote = 'no email addresses';
    else if (env('GMAIL_USER') && env('GMAIL_APP_PASSWORD')) {
      // Gmail: sends as your Gmail address over SMTP (port 465) with a Google App Password
      try {
        const tx = nodemailer.createTransport({host: 'smtp.gmail.com', port: 465, secure: true, auth: {user: env('GMAIL_USER'), pass: env('GMAIL_APP_PASSWORD').replace(/\s+/g, '')}});
        await tx.sendMail({from: env('DIGEST_FROM') || `eckert.fin <${env('GMAIL_USER')}>`, to: to_.join(', '), subject, html});
        emailed = to_; await fin.from('digests').update({emailed_at: new Date().toISOString(), emailed_to: to_}).eq('id', saved.id);
      } catch (e) { emailNote = 'Gmail didn’t accept it: ' + (e as Error).message.slice(0, 200); }
    } else if (env('RESEND_API_KEY')) {
      const r = await fetch('https://api.resend.com/emails', {method: 'POST', headers: {Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({from: env('DIGEST_FROM') || 'eckert.fin <onboarding@resend.dev>', to: to_, subject, html})});
      if (!r.ok) emailNote = `email failed: ${r.status} ${(await r.text()).slice(0, 200)}`;
      else { emailed = to_; await fin.from('digests').update({emailed_at: new Date().toISOString(), emailed_to: to_}).eq('id', saved.id); }
    } else emailNote = 'no email set up (GMAIL_USER + GMAIL_APP_PASSWORD) — saved, not emailed';
  }
  return {household_id: hh, week_start: from, range_end: to, events: D.counts.events, bills: D.bills.length, calendars: D.calendars, emailed, emailNote};
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: cors});
  if (req.method !== 'POST') return json(405, {error: 'POST only'});
  try {
    const url = env('SUPABASE_URL'), serviceKey = env('SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey) return json(500, {error: 'Service key not available to the function'});
    const admin = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}}), fin = admin.schema('finance');
    const body = await req.json().catch(() => ({}));
    const cronSecret = env('CRON_SECRET'), given = req.headers.get('x-cron-secret') ?? '';
    // ---- schedule: hourly; each household only at its own day and hour
    if (cronSecret && given && given === cronSecret) {
      const {data: hhs} = await fin.from('households').select('id, settings'), results = [];
      for (const h of hhs || []) {
        const S = settingsOf(h.settings?.digest), {data: feeds} = await fin.from('calendar_feeds').select('id').eq('household_id', h.id).limit(1);
        if (!feeds?.length && !h.settings?.digest) continue;   // not set up
        const L = localParts(Date.now(), S.tz);
        if (dow(L.date) !== +S.sendDow || L.h !== +S.sendHour) {
          // every other day: a quiet morning refresh so calendar changes show up (no email)
          if (L.h !== +(h.settings?.digest?.refreshHour ?? 6)) continue;
          const started = new Date().toISOString();
          try { const r = await buildFor(fin, admin, h.id, {send: false, trigger: 'refresh'}); results.push(r);
            await fin.from('automation_runs').insert({job: 'digest', household_id: h.id, trigger: 'refresh', started_at: started, finished_at: new Date().toISOString(), ok: true, summary: r}); }
          catch (e) { await fin.from('automation_runs').insert({job: 'digest', household_id: h.id, trigger: 'refresh', started_at: started, finished_at: new Date().toISOString(), ok: false, summary: {errors: [(e as Error).message]}}); }
          continue;
        }
        const {data: done} = await fin.from('digests').select('emailed_at').eq('household_id', h.id).eq('week_start', weekStart(L.date)).maybeSingle();
        if (done?.emailed_at) continue;
        const started = new Date().toISOString();
        try { const r = await buildFor(fin, admin, h.id, {send: true, trigger: 'schedule'}); results.push(r);
          await fin.from('automation_runs').insert({job: 'digest', household_id: h.id, trigger: 'schedule', started_at: started, finished_at: new Date().toISOString(), ok: !r.emailNote, summary: r}); }
        catch (e) { await fin.from('automation_runs').insert({job: 'digest', household_id: h.id, trigger: 'schedule', started_at: started, finished_at: new Date().toISOString(), ok: false, summary: {errors: [(e as Error).message]}}); }
      }
      return json(200, {ok: true, results});
    }
    // ---- the app
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const {data: me, error: meErr} = token ? await admin.auth.getUser(token) : {data: null, error: true} as any;
    if (meErr || !me?.user) return json(401, {error: 'Sign in again'});
    if (!body.household_id) return json(400, {error: 'household_id is required'});
    const {data: mem} = await fin.from('household_members').select('role').eq('household_id', body.household_id).eq('user_id', me.user.id).maybeSingle();
    if (!mem) return json(403, {error: 'Not a member of this household'});
    if (body.action === 'test_feed') {
      if (!/^(https?|webcal):\/\//i.test(body.url || '')) return json(400, {error: 'Paste the full link (it starts with webcal:// or https://)'});
      const tz = settingsOf((await fin.from('households').select('settings').eq('id', body.household_id).single()).data?.settings?.digest).tz;
      const today = localParts(Date.now(), tz).date, ev = parseICS(await fetchICS(body.url), today, dAdd(today, 30), tz);
      return json(200, {ok: true, count: ev.length, next: ev.slice(0, 5).map(e => ({date: e.date, time: e.time, title: e.title}))});
    }
    if (mem.role === 'viewer' && body.send) return json(403, {error: 'Only owners and editors can email the digest'});   // viewers may refresh it
    const started = new Date().toISOString(), r = await buildFor(fin, admin, body.household_id, {send: !!body.send, trigger: 'manual'});
    await fin.from('automation_runs').insert({job: 'digest', household_id: body.household_id, trigger: 'manual', started_at: started, finished_at: new Date().toISOString(), ok: !r.emailNote, summary: r});
    return json(200, {ok: true, ...r});
  } catch (e) {
    return json(500, {error: (e as Error).message});
  }
});
