/* =====================================================================
   TRUST — a quick reference to the family trust: key points, who does what, and what happens when.
   The content is household data (households.settings.trust), never part of this public repo:
   load it with "Import summary" (a JSON file kept in private/), and link the signed PDF wherever you keep it.
   ===================================================================== */
const TRUST = () => CTX.settings?.trust || null;
let TR_OPEN = new Set();
const trPg = p => p ? `<span class="tr-pg" title="Page in the signed document">p. ${p}</span>` : '';
const trList = a => (a || []).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('');
async function saveTrust(T) {
  if (!CTX.CAN_WRITE) return false;
  const {error} = await FDB.rpc('set_household_setting', {p_household: CTX.HH, p_key: 'trust', p_value: T});
  if (error) { toast('Couldn’t save the trust summary: ' + error.message + (/trust/.test(error.message) ? ' — run migration 1900' : '')); return false; }
  CTX.settings.trust = T; return true;
}
function trustImport() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => { const f = inp.files[0]; if (!f) return;
    try { const T = JSON.parse(await f.text()); if (!T || typeof T !== 'object' || !T.name) throw new Error('that file isn’t a trust summary (it needs at least a name)');
      T.pdf_url ??= TRUST()?.pdf_url || ''; T.updated = CTX.TODAY;
      if (await saveTrust(T)) { render(); toast('Trust summary loaded'); } } catch (e) { toast('Couldn’t read that file: ' + e.message); } };
  inp.click();
}
function renderTrust(pg) {
  const T = TRUST(), ro = !CTX.CAN_WRITE;
  if (!T) { pg.innerHTML = `<div class="grid g-12"><div class="card c-12"><div class="card-h"><div><h3>No trust summary yet</h3><div class="sub">It’s stored with your household (private to its members), not in the app’s code</div></div></div>
      <p class="muted" style="max-width:640px">Import the summary file (<code>private/trust_summary.json</code> in your repo folder, never committed). Everything on this page comes from it, and you can re-import an updated one any time.</p>
      ${ro ? '' : `<button class="btn primary" style="margin-top:12px" onclick="trustImport()">${icon('upload')}<span>Import summary</span></button>`}</div></div>`; return; }
  const P = T.people || [], by = re => P.filter(p => re.test(p.role)).sort((a, b) => (a.order || 0) - (b.order || 0));
  const grantors = by(/^grantor/i), trustees = by(/^initial trustee/i), succ = by(/^successor trustee/i), kids = by(/^beneficiary$/i), cont = by(/contingent/i), signing = by(/witness|notary/i);
  const other = P.filter(p => ![grantors, trustees, succ, kids, cont, signing].some(g => g.includes(p)));
  const person = (p, i) => `<div class="tr-p">${i != null ? `<span class="tr-n">${i}</span>` : ''}<div><b>${esc(p.name)}</b>${p.relation ? `<span class="muted"> · ${esc(p.relation)}</span>` : ''}${p.notes ? `<div class="muted tr-note">${esc(p.notes)}</div>` : ''}${p.doc && !/trust$/i.test(p.doc) ? `<div class="muted tr-note">${esc(p.doc)}</div>` : ''}</div>${trPg(p.page)}</div>`;
  const sec = (id, title, sub, body, cls = 'c-6') => `<div class="card ${cls}"><div class="card-h"><div><h3>${title}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>${body}</div>`;
  const title = (T.funding_checklist || []).map(s => s.match(/['‘’"“”]([^'"“”‘’]*Trustees[^'"“”‘’]*)['‘’"“”]/)?.[1]).find(Boolean);
  const fold = (id, h, body) => `<details class="tr-fold" data-tf="${id}" ${TR_OPEN.has(id) ? 'open' : ''}><summary>${h}</summary>${body}</details>`;
  pg.innerHTML = `<div class="grid g-12">
    <div class="card hero c-8"><div class="label hero-top"><span>${esc(T.type || 'Trust')}</span>${T.pdf_url ? `<a class="btn" style="height:30px" href="${esc(T.pdf_url)}" target="_blank" rel="noopener">${icon('file')}<span>Open the signed copy</span></a>` : ''}</div>
      <div class="tr-name">${esc(T.name)}</div>
      <div class="tr-facts">${[['Signed', T.signed ? fmtD(T.signed) : ''], ['Governing law', T.state], ['Prepared by', T.preparer], ['Married', T.family?.married && /^\d{4}-\d\d-\d\d$/.test(T.family.married) ? fmtD(T.family.married) : T.family?.married || '']].filter(x => x[1]).map(([l, v]) => `<div><span>${l}</span><b>${esc(v)}</b></div>`).join('')}</div>
      ${(T.contacts || []).length ? `<div class="tr-contacts">${T.contacts.map(c => `<div><b>${esc(c.name)}</b><span>${esc(c.role)}</span>${c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</div>`).join('')}</div>` : ''}</div>
    <div class="card c-4"><div class="card-h"><div><h3>Who to call</h3><div class="sub">In order, if we can’t act</div></div></div>
      <div class="tr-ladder">${trustees.map(p => person(p, '★')).join('')}${succ.map((p, i) => person(p, i + 1)).join('')}</div>
      ${ro ? '' : `<div class="tr-tools"><input class="in" id="trUrl" placeholder="Link to the signed PDF (OneDrive, iCloud…)" value="${esc(T.pdf_url || '')}"><button class="btn" style="height:32px" id="trUrlGo">Save link</button><button class="btn" style="height:32px" onclick="trustImport()" title="Replace the summary with an updated JSON file">${icon('upload')}<span>Import</span></button></div>`}</div>

    ${sec('kp', 'Key points', 'The trust in plain English', `<ul class="tr-ul">${trList(T.overview)}</ul>`, 'c-7')}
    ${sec('ben', 'Beneficiaries', 'Who it’s for', `<div class="tr-ladder">${kids.map(p => person(p)).join('')}</div>${cont.length ? `<h4 class="tr-h4">Only if no descendants survive</h4><div class="tr-ladder">${cont.map(p => person(p)).join('')}</div>` : ''}`, 'c-5')}

    ${T.agents ? sec('agents', 'Who acts for whom', 'Each spouse’s agents, in order · the spouse first, then the backups', (() => { const who = Object.keys(T.agents), rows = [['financial', 'Financial power of attorney'], ['healthcare', 'Healthcare power of attorney'], ['executor', 'Executor (pour-over will)'], ['hipaa', 'Medical records (HIPAA)']];
      return `<div class="scroll-x"><table class="table cmp tr-ag"><tr><th></th>${who.map(w => `<th>For ${esc(w)}</th>`).join('')}</tr>${rows.filter(([k]) => who.some(w => (T.agents[w][k] || []).length)).map(([k, l]) => `<tr><td><b>${l}</b></td>${who.map(w => `<td><ol>${(T.agents[w][k] || []).map(a => `<li>${esc(a.name)}${a.notes && !/^(successor|initial agent|alternate)/i.test(a.notes) ? ` <span class="muted">· ${esc(a.notes)}</span>` : ''}</li>`).join('')}</ol></td>`).join('')}</tr>`).join('')}</table></div>
      ${fold('agfx', 'When these take effect', who.map(w => `<h4 class="tr-h4">${esc(w)}</h4><ul class="tr-ul">${['financial_effective', 'healthcare_effective', 'hipaa_effective'].filter(k => T.agents[w][k]).map(k => `<li><b>${{financial_effective: 'Financial POA', healthcare_effective: 'Healthcare POA', hipaa_effective: 'HIPAA'}[k]}:</b> ${esc(T.agents[w][k])}</li>`).join('')}</ul>`).join(''))}`; })(), 'c-8') : ''}
    ${T.guardians ? sec('guard', 'Guardians for the kids', 'If neither of us can care for them', `<div class="tr-ladder">${(T.guardians.nominees || []).map(n => person({name: n.name, relation: n.relation, notes: n.notes}, n.order)).join('')}</div><ul class="tr-ul" style="margin-top:10px;font-size:12.5px">${trList(T.guardians.notes)}</ul>`, 'c-4') : ''}
    ${(T.after_a_death || []).length || (T.incapacity_steps || []).length ? sec('steps', 'If something happens', 'Step by step, from the Trustee Instructions and Overview', `<div class="tr-when tr-two">
      <div><h4>After a death</h4><ol class="tr-ul">${trList(T.after_a_death)}</ol></div><div><h4>If one of us is incapacitated</h4><ol class="tr-ul">${trList(T.incapacity_steps)}</ol></div></div>`, 'c-12') : ''}
    ${sec('when', 'What happens when', 'The three moments that matter', `<div class="tr-when">
      <div><h4>If one of us can’t manage things</h4><ul class="tr-ul">${trList(T.incapacity)}</ul></div>
      <div><h4>When one of us dies, then both</h4><ul class="tr-ul">${trList(T.distribution)}</ul></div>
      <div><h4>Changing or revoking it</h4><ul class="tr-ul">${trList(T.amend_revoke)}</ul></div></div>`, 'c-12')}

    ${sec('assets', 'What’s in the trust', 'From the schedules at the back', `<div class="scroll-x"><table class="table cmp"><tr><th>Asset</th><th>Schedule / note</th><th></th></tr>${(T.assets || []).map(a => `<tr><td>${esc(a.item)}</td><td class="muted">${esc(a.notes)}</td><td>${trPg(a.page)}</td></tr>`).join('')}</table></div>`, 'c-6')}
    ${sec('fund', 'Keeping it funded', 'Titling and beneficiary designations', `${title ? `<div class="tr-title"><span>${esc(title)}</span><button class="btn" style="height:28px" id="trCopy">${icon('copy')}<span>Copy</span></button></div>` : ''}<ul class="tr-ul">${trList(T.funding_checklist)}</ul>${(T.funding_steps || []).length ? fold('fsteps', 'How to title each kind of asset', `<div class="scroll-x"><table class="table cmp tr-fs"><tr><th>Asset</th><th>How</th><th>Status</th></tr>${T.funding_steps.map(f => `<tr><td><b>${esc(f.asset)}</b></td><td>${esc(f.how)}</td><td class="muted">${esc(f.status)}</td></tr>`).join('')}</table></div>`) : ''}`, 'c-6')}
    ${T.healthcare_wishes || T.remembrance || T.personal_property ? sec('wishes', 'Wishes', 'Healthcare choices, final arrangements and personal items · as written', `<div class="tr-when tr-two">${Object.keys(T.healthcare_wishes || T.remembrance || {}).map(w => `<div><h4>${esc(w)}</h4>
      ${(T.healthcare_wishes?.[w] || []).length ? `<h4 class="tr-h4">Healthcare</h4><ul class="tr-ul">${trList(T.healthcare_wishes[w])}</ul>` : ''}
      <h4 class="tr-h4">Funeral & services</h4>${(T.remembrance?.[w] || []).length ? `<ul class="tr-ul">${trList(T.remembrance[w])}</ul>` : '<p class="muted" style="font-size:12.5px">Memorandum not filled in yet.</p>'}
      <h4 class="tr-h4">Personal items</h4>${(T.personal_property?.[w] || []).filter(x => !/^blank/i.test(x)).length ? `<ul class="tr-ul">${trList(T.personal_property[w])}</ul>` : '<p class="muted" style="font-size:12.5px">Memorandum not filled in yet.</p>'}</div>`).join('')}</div>`, 'c-12') : ''}

    <div class="card c-12"><div class="card-h"><div><h3>The details</h3><div class="sub">Trustee powers, related documents, signing and a section index</div></div></div>
      ${fold('pow', 'Trustee powers & limits', `<ul class="tr-ul">${trList(T.trustee_powers)}</ul>`)}
      ${(T.documents || []).length ? fold('lib', `Every document (${T.documents.length})`, `<div class="tr-docs">${T.documents.map(d => `<div class="tr-doc"><div class="pi-m1"><b>${esc(d.doc)}</b><span class="muted">${d.signed && /^\d{4}-/.test(d.signed) ? fmtD(d.signed) : esc(d.signed || '')}${d.pages ? ` · ${d.pages} pp` : ''}</span></div><div class="muted" style="font-size:12.5px;margin:2px 0 4px">${esc(d.purpose)}</div>${(d.key_points || []).length ? `<ul class="tr-ul" style="font-size:12.5px">${trList(d.key_points)}</ul>` : ''}${d.people ? `<div class="muted" style="font-size:11.5px;margin-top:4px">Names: ${esc(d.people)}</div>` : ''}</div>`).join('')}</div>`) : ''}
      ${(T.ancillary_docs || []).length && !(T.documents || []).length ? fold('docs', 'Related documents', `<div class="scroll-x"><table class="table cmp"><tr><th>Document</th><th>For</th><th>Notes</th><th></th></tr>${T.ancillary_docs.map(d => `<tr><td>${esc(d.doc)}</td><td>${esc(d.who)}</td><td class="muted">${esc(d.key_people)}</td><td>${trPg(d.page)}</td></tr>`).join('')}</table></div>`) : ''}
      ${fold('ppl', 'Everyone named', `<div class="tr-grid">${grantors.concat(other, signing).map(p => `<div><div class="muted tr-role">${esc(p.role)}</div>${person(p)}</div>`).join('')}</div>`)}
      ${fold('idx', 'Section index', `<div class="scroll-x"><table class="table cmp"><tr><th>Section</th><th>Summary</th><th>Page</th></tr>${(T.sections || []).map(s => `<tr><td class="nowrap"><b>${esc(s.title)}</b></td><td class="muted">${esc(s.summary)}</td><td>${s.page || ''}</td></tr>`).join('')}</table></div>`)}
      <p class="muted" style="font-size:11.5px;margin-top:10px">A summary for quick reference${T.updated ? `, loaded ${fmtD(T.updated)}` : ''}. The signed document controls; check it (and your attorney) before acting on anything here.</p></div>
  </div>`;
  $$('.tr-fold', pg).forEach(d => d.ontoggle = () => { d.open ? TR_OPEN.add(d.dataset.tf) : TR_OPEN.delete(d.dataset.tf); });
  if ($('#trCopy')) $('#trCopy').onclick = () => navigator.clipboard?.writeText(title).then(() => toast('Copied the trust titling'), () => toast('Couldn’t copy'));
  if ($('#trUrlGo')) $('#trUrlGo').onclick = async () => { const u = $('#trUrl').value.trim(); if (u && !/^https:\/\//i.test(u)) return toast('Use an https:// link');
    if (await saveTrust({...T, pdf_url: u})) { render(); toast(u ? 'Link saved' : 'Link removed'); } };
}
