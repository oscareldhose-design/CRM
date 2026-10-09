/* MAP Operating System: General Sales (events calling team). */
'use strict';

const EVENT_FIELDS = [
  { k: 'name', label: 'Event name', req: true, full: true, placeholder: 'e.g. Newcastle Home Show 2026' },
  { k: 'event_date', label: 'Date', type: 'date' }, { k: 'location', label: 'Location' },
  { k: 'organiser', label: 'Organiser' }, { k: 'sponsorship_cost', label: 'What MAP paid to sponsor it (£)', type: 'money' },
  { k: 'notes', label: 'Notes', type: 'textarea' },
];
const CONTACT_FIELDS = [
  { k: 'first_name', label: 'First name', req: true }, { k: 'last_name', label: 'Last name' },
  { k: 'phone', label: 'Phone', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' },
  { k: 'postcode', label: 'Postcode' }, { k: 'interest', label: 'Interested in', placeholder: 'e.g. First home, remortgage, life cover' },
  { k: 'notes', label: 'Notes', type: 'textarea' },
  { k: 'consent', label: 'They agreed to be contacted by MAP (required)', type: 'check', full: true },
];
function editEvent(ev, onSaved) {
  const isNew = !ev;
  modal({
    title: isNew ? 'Add an event' : `Edit ${ev.name}`, sub: isNew ? 'Add the event MAP sponsored, then import its sign-up list.' : '',
    body: h`<form novalidate>${formHtml(EVENT_FIELDS, ev || {})}</form>`,
    foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-save>${icon('check')}Save</button>`,
    onMount(el, close) {
      on(el, 'click', '[data-save]', async (e, btn) => {
        busy(btn, true, 'Saving…');
        try {
          const data = readForm($('form', el), EVENT_FIELDS);
          const res = await apiPost('salesEventSave', Object.assign({ id: ev ? ev.id : 0, version: ev ? ev.version : null }, data));
          close(); toast('Event saved');
          if (onSaved) onSaved(res.id); else location.hash = `#/sales/events/${res.id}`;
        } catch (err) { busy(btn, false); showFormError(el, err); }
      });
    },
  });
}
function editContact(eventId, c, onSaved) {
  modal({
    title: c ? `Edit ${fullName(c)}` : 'Add a contact', sub: 'Only add people who agreed to be contacted by MAP.',
    body: h`<form novalidate>${formHtml(CONTACT_FIELDS, c ? Object.assign({}, c, { consent: !!c.consent }) : {})}</form>`,
    foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-save>${icon('check')}Save</button>`,
    onMount(el, close) {
      on(el, 'click', '[data-save]', async (e, btn) => {
        busy(btn, true, 'Saving…');
        try {
          const data = readForm($('form', el), CONTACT_FIELDS);
          await apiPost('salesContactSave', Object.assign({ id: c ? c.id : 0, event_id: eventId, version: c ? c.version : null }, data));
          close(); toast('Saved'); onSaved();
        } catch (err) { busy(btn, false); showFormError(el, err); }
      });
    },
  });
}
/** onCancel: called when the dialog is closed without handing the person over. */
function handoverModal(contact, onDone, onCancel) {
  const offices = S.meta.offices;
  let handed = false;
  modal({
    title: `Hand ${fullName(contact)} over`, sub: 'They arrive in the office as a new lead with the full call history, and the adviser gets a "contact lead" task.',
    body: h`<div class="form-grid">
      <div class="field"><label for="ho-o">Office <span class="req">*</span></label><select class="select" id="ho-o" name="office_id"><option value="">Choose…</option>${offices.map((o) => h`<option value="${o.id}">${o.name}</option>`)}</select><div class="field-error" hidden></div></div>
      <div class="field"><label for="ho-t">Interested in</label><select class="select" id="ho-t" name="enquiry_type"><option value="">Not sure yet</option>${enumOptions('enquiry_type').map(([k, v]) => h`<option value="${k}">${v}</option>`)}</select></div>
      <div class="field"><label for="ho-a">Adviser <span class="req">*</span></label><select class="select" id="ho-a" name="adviser_id" disabled><option value="">Choose the office first</option></select><div class="field-error" hidden></div></div>
      <div class="field"><label for="ho-d">Administrator</label><select class="select" id="ho-d" name="administrator_id" disabled><option value="">Choose the office first</option></select><div class="field-error" hidden></div></div>
      <div class="field full"><label for="ho-n">Notes for the adviser</label><textarea class="textarea" id="ho-n" name="notes" placeholder="Best time to call, what they asked about…">${contact.interest ? `Interested in: ${contact.interest}` : ''}</textarea></div></div>`,
    foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-ok>${icon('send')}Hand over</button>`,
    onClose: () => { if (!handed && onCancel) onCancel(); },
    onMount(el, close) {
      const o = $('#ho-o', el), a = $('#ho-a', el), d = $('#ho-d', el);
      o.addEventListener('change', async () => {
        a.disabled = d.disabled = true;
        if (!o.value) return;
        try {
          const res = await apiGet('salesStaff', { office_id: o.value });
          // Protection-only staff are marked: a mortgage enquiry can't go to them.
          const opts = (roles) => res.rows.filter((u) => roles.includes(u.role)).map((u) => h`<option value="${u.id}">${u.full_name}${u.advice_type === 'protection' ? ' (protection only)' : ''}</option>`);
          setHTML(a, h`<option value="">Choose…</option>${opts(['adviser', 'manager', 'admin'])}`);
          setHTML(d, h`<option value="">None</option>${opts(['administrator', 'manager', 'admin'])}`);
          a.disabled = d.disabled = false;
        } catch (err) { showError(err); }
      });
      on(el, 'click', '[data-ok]', async (e, btn) => {
        busy(btn, true, 'Handing over…');
        try {
          await apiPost('salesHandover', { contact_id: contact.id, office_id: +o.value, adviser_id: +a.value, administrator_id: +d.value || 0, enquiry_type: $('#ho-t', el).value, notes: $('#ho-n', el).value });
          handed = true;
          close(); toast(`Handed over to ${o.options[o.selectedIndex].text}`); onDone();
        } catch (err) { busy(btn, false); showFormError(el, err); }
      });
    },
  });
}
function statsKpis(s, cost) {
  return h`<div class="kpis">
    ${kpi('Contacts', num(s.contacts), `${num(s.not_called)} not called yet`, '#/sales/queue')}
    ${kpi('Reached', num(s.reached), s.reach_rate === null ? 'no calls yet' : `${s.reach_rate}% of those called`, '#/sales/queue')}
    ${kpi('Interested', num(s.interested), 'said yes to a chat', '#/sales/queue')}
    ${kpi('Handed over', num(s.handed_over), `${num(s.converted)} converted, ${num(s.completed)} completed`, '#/sales/results')}
    ${kpi('Cost per hand-over', s.cost_per_handover === null ? '—' : money(s.cost_per_handover), cost ? `${money(cost)} sponsorship` : 'add the sponsorship cost', '#/sales/results')}
  </div>`;
}

async function viewSales({ el, stale }) {
  const d = await apiGet('salesEvents');
  if (stale()) return;
  const q = d.queue;
  setHTML(el, h`${pageHead({ title: 'General Sales: events', sub: 'Add each event MAP sponsored, import its sign-up list, then work through the call queue.',
    actions: h`<a class="btn btn-secondary" href="#/sales/queue">${icon('phone')}Open call queue</a><button class="btn btn-primary" type="button" data-new>${icon('plus')}Add event</button>` })}
  <div class="kpis">${kpi('In the call queue', num(q.total), `${num(q.new)} new · ${num(q.retries)} to retry`, '#/sales/queue')}
    ${kpi('Call-backs due', num(q.callbacks), `${num(q.later_callbacks)} booked for later`, '#/sales/queue', q.callbacks > 0)}
    ${kpi('Events', num(d.rows.length), 'sponsored events', '#/sales')}
    ${kpi('Handed over', num(d.rows.reduce((s, e) => s + e.stats.handed_over, 0)), 'to the offices as new leads', '#/sales/results')}</div>
  <div data-t></div>`);
  mountTable($('[data-t]', el), {
    rows: d.rows, noun: 'event', exportName: 'MAP events', rowHref: (e) => `#/sales/events/${e.id}`,
    empty: emptyState('megaphone', 'No events yet', 'Add the first event MAP sponsored, then import its sign-up list.'),
    columns: [
      { k: 'name', label: 'Event', render: (e) => h`<div class="t-title">${e.name}</div><div class="t-sub">${fmtDate(e.event_date)}${e.location ? ' · ' + e.location : ''}</div>` },
      { k: 'contacts', label: 'Contacts', right: true, value: (e) => e.stats.contacts },
      { k: 'called', label: 'Called', right: true, value: (e) => e.stats.called },
      { k: 'reached', label: 'Reached', right: true, value: (e) => e.stats.reached },
      { k: 'interested', label: 'Interested', right: true, value: (e) => e.stats.interested },
      { k: 'handed', label: 'Handed over', right: true, value: (e) => e.stats.handed_over },
      { k: 'converted', label: 'Converted', right: true, value: (e) => e.stats.converted },
      { k: 'cph', label: 'Cost / hand-over', right: true, value: (e) => e.stats.cost_per_handover, render: (e) => (e.stats.cost_per_handover === null ? '—' : money(e.stats.cost_per_handover)) },
    ],
  });
  on(el, 'click', '[data-new]', () => editEvent(null));
}

async function viewSalesEvent({ el, params, query, stale }) {
  const d = await apiGet('salesEvent', { id: params.id });
  if (stale()) return;
  const ev = d.event;
  const reload = () => router();
  const state = { status: query.get('status') || '' };
  setTitle(ev.name);
  setHTML(el, h`<a class="back-link" href="#/sales">${icon('chevron-left', 'ic-sm')}Events</a>
  <div class="detail-head"><div class="avatar">${icon('megaphone')}</div><div class="grow"><h1>${ev.name}</h1><div class="meta">${ev.event_date ? h`<span class="chip">${icon('calendar', 'ic-sm')}${fmtDate(ev.event_date)}</span>` : ''}
    ${ev.location ? h`<span class="chip">${ev.location}</span>` : ''}${ev.organiser ? h`<span class="chip">${ev.organiser}</span>` : ''}${ev.sponsorship_cost ? h`<span class="chip">${money(ev.sponsorship_cost)} sponsorship</span>` : ''}</div></div>
    <div class="row"><a class="btn btn-primary" href="#/sales/queue?event=${ev.id}">${icon('phone')}Call this list</a>
      <button class="btn btn-secondary" type="button" data-act="import">${icon('upload')}Import sign-up list</button>
      <button class="btn btn-ghost" type="button" data-act="add">${icon('plus')}Add contact</button>
      <button class="btn btn-ghost" type="button" data-act="edit">${icon('edit')}Edit</button>
      <button class="icon-btn" type="button" data-act="delete" aria-label="Delete event">${icon('trash')}</button></div></div>
  ${statsKpis(ev.stats, ev.sponsorship_cost)}
  <div class="filters">${segmented('status', [['', 'Everyone'], ...enumOptions('contact_status')], state.status)}</div><div data-t></div>`);
  let table;
  const draw = () => {
    setQuery({ status: state.status });
    const rows = d.contacts.filter((c) => !state.status || c.status === state.status);
    // Someone handed to another office belongs to that office: only it (or General Sales) can change them.
    const otherOffice = (c) => S.me.role !== 'sales' && c.handed_office_id && +c.handed_office_id !== +S.me.office_id;
    const opts = {
      rows, noun: 'contact', exportName: `MAP ${ev.name} contacts`,
      empty: emptyState('users', 'No contacts here', 'Import the event\'s sign-up list (Excel or CSV) or add people one at a time.'),
      columns: [
        { k: 'name', label: 'Name', value: fullName, render: (c) => h`<div class="t-title">${fullName(c)}</div><div class="t-sub">${c.interest || ''}</div>` },
        { k: 'phone', label: 'Phone', render: (c) => telLink(c.phone) }, { k: 'email', label: 'Email' },
        { k: 'status', label: 'Status', value: (c) => label('contact_status', c.status), render: (c) => h`${statusBadge('contact_status', c.status)}${c.status === 'callback' && c.callback_at ? h`<div class="t-sub">${fmtDateTime(c.callback_at)}</div>` : ''}${c.handed_office ? h`<div class="t-sub">to ${c.handed_office}</div>` : ''}` },
        { k: 'attempts', label: 'Calls', right: true, value: (c) => +c.attempts },
        { k: 'last_called_at', label: 'Last call', render: (c) => h`${c.last_called_at ? relTime(c.last_called_at) : '—'}${c.last_note ? h`<div class="t-sub ellipsis" style="max-width:220px">${c.last_note}</div>` : ''}`, exportValue: (c) => fmtDateTime(c.last_called_at) },
        { k: 'act', label: '', nosort: true, noexport: true, render: (c) => (otherOffice(c) ? '' : h`<div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
          ${['interested', 'callback', 'no_answer', 'new'].includes(c.status) && !c.erased_at ? h`<button class="btn btn-primary btn-xs" type="button" data-hand="${c.id}">${icon('send', 'ic-sm')}Hand over</button>` : ''}
          ${!c.erased_at ? h`<button class="icon-btn" type="button" data-edit="${c.id}" aria-label="Edit">${icon('edit', 'ic-sm')}</button><button class="icon-btn" type="button" data-erase="${c.id}" aria-label="Erase personal data (GDPR)" title="Erase personal data (GDPR)">${icon('gdpr', 'ic-sm')}</button>` : ''}
          <button class="icon-btn" type="button" data-remove="${c.id}" aria-label="Remove">${icon('trash', 'ic-sm')}</button></div>`) },
      ],
    };
    if (table) table.setRows(rows); else table = mountTable($('[data-t]', el), opts);
  };
  wireSegments(el, (n, v) => { state[n] = v; draw(); });
  const find = (id) => d.contacts.find((c) => +c.id === +id);
  on(el, 'click', '[data-hand]', (e, b) => handoverModal(find(b.dataset.hand), reload));
  on(el, 'click', '[data-edit]', (e, b) => editContact(ev.id, find(b.dataset.edit), reload));
  on(el, 'click', '[data-remove]', async (e, b) => {
    if (!(await confirmBox({ title: 'Remove this contact?', message: 'They are taken off this event\'s list and the call queue.', confirmText: 'Remove', danger: true }))) return;
    try { await apiPost('salesContactDelete', { id: +b.dataset.remove }); toast('Removed'); reload(); } catch (err) { showError(err); }
  });
  on(el, 'click', '[data-erase]', async (e, b) => {
    const c = find(b.dataset.erase);
    if (!(await confirmBox({ title: 'Erase personal data?', typed: 'ERASE', danger: true, confirmText: 'Erase permanently', message: `GDPR right to erasure: ${fullName(c)}'s name, phone, email and call notes are removed for good. If they are on a sign-up list you import later, they will be added again.` }))) return;
    try { await apiPost('salesContactErase', { id: c.id, confirm: 'ERASE' }); toast('Personal data erased'); reload(); } catch (err) { showError(err); }
  });
  on(el, 'click', '[data-act]', async (e, b) => {
    const a = b.dataset.act;
    if (a === 'edit') editEvent(ev, reload);
    if (a === 'add') editContact(ev.id, null, reload);
    if (a === 'delete') {
      if (!(await confirmBox({ title: `Delete ${ev.name}?`, message: 'The event and its call list are removed from General Sales. Leads already handed over stay with the offices.', confirmText: 'Delete event', danger: true }))) return;
      try { await apiPost('salesEventDelete', { id: ev.id }); toast('Event deleted'); location.hash = '#/sales'; } catch (err) { showError(err); }
    }
    if (a === 'import') {
      importWizard({
        title: `Import the sign-up list for ${ev.name}`,
        fields: [
          { k: 'first_name', label: 'First name', match: ['first name', 'forename', 'firstname'] }, { k: 'last_name', label: 'Last name', match: ['last name', 'surname', 'lastname'] },
          { k: 'name', label: 'Full name (if no first/last)', match: ['full name', 'name'] }, { k: 'phone', label: 'Phone', match: ['phone', 'mobile', 'telephone', 'number', 'tel'] },
          { k: 'email', label: 'Email', match: ['email', 'e-mail'] }, { k: 'postcode', label: 'Postcode', match: ['postcode', 'post code'] },
          { k: 'interest', label: 'Interested in', match: ['interest', 'interested', 'looking for', 'enquiry'] },
          { k: 'consent', label: 'Consent / opt-in', match: ['consent', 'opt in', 'optin', 'opt-in', 'marketing', 'agree', 'permission'] }, { k: 'notes', label: 'Notes', match: ['notes', 'comments'] },
        ],
        extra: h`<div class="alert alert-info">${icon('gdpr')}<div class="alert-text">People who did not consent are skipped automatically, and so are duplicates (same phone or email as anyone already on a list).
          <label class="check mt-sm"><input type="checkbox" data-assume><span>This list has no consent column, and everyone on it ticked a consent box on the sign-up form</span></label></div></div>`,
        onImport: (rows, m) => apiPost('salesImport', { event_id: ev.id, rows, assume_consent: $('[data-assume]', m).checked }),
      });
    }
  });
  draw();
}

/* ---------- Call queue ---------- */
async function viewSalesQueue({ el, query, stale }) {
  const events = (await apiGet('salesEvents')).rows;
  if (stale()) return;
  // skipped: the people skipped since the queue opened, all left out until everyone left has been skipped.
  const state = { event: query.get('event') || '', outcome: '', contact: null, skipped: [] };
  setHTML(el, h`${pageHead({ title: 'Call queue', sub: 'Tells you who to ring next: call-backs that are due first, then new contacts, then people who did not answer. Every call and outcome is logged.' })}
  <div class="filters"><select class="select" data-event aria-label="Event"><option value="">All events</option>${events.map((e) => h`<option value="${e.id}" ${String(e.id) === state.event ? raw('selected') : ''}>${e.name}</option>`)}</select><span class="small muted" data-counts></span></div>
  <div data-body>${loadingBlock()}</div>`);
  const body = $('[data-body]', el);
  const outcomeIcons = { no_answer: 'phone', voicemail: 'message', callback: 'clock', interested: 'check-circle', not_interested: 'x-circle', wrong_number: 'alert', do_not_call: 'gdpr' };
  const load = async () => {
    setQuery({ event: state.event });
    setHTML(body, loadingBlock());
    // The latest skip goes first (older servers read only that one); at most the last 100.
    const d = await apiGet('salesQueue', { event_id: state.event, skip: state.skipped.slice(-100).reverse().join(',') });
    if (stale()) { if (leaving()) release(d.contact); return; }
    if (!d.contact && state.skipped.length) { state.skipped = []; toast('Everyone left has been skipped: back to the start of the queue.'); return load(); }
    const q = d.counts;
    $('[data-counts]', el).textContent = `${num(q.total)} to call · ${num(q.callbacks)} call-backs due · ${num(q.new)} new · ${num(q.retries)} to retry`;
    state.contact = d.contact;
    state.outcome = '';
    const c = d.contact;
    if (!c) {
      setHTML(body, h`<div class="card">${emptyState('check-circle', 'Nobody left to call right now', q.later_callbacks ? `${q.later_callbacks} call-back${q.later_callbacks === 1 ? ' is' : 's are'} booked for later. They come back into the queue when they are due.` : 'Import another sign-up list to keep going.', h`<a class="btn btn-primary mt" href="#/sales">Go to events</a>`)}</div>`);
      return;
    }
    const why = c.status === 'callback' ? `Call-back booked for ${fmtDateTime(c.callback_at)}` : c.status === 'new' ? 'Not called yet' : `Tried ${c.attempts} time${c.attempts === 1 ? '' : 's'} with no answer`;
    setHTML(body, h`<div class="grid grid-main"><section class="card card-accent queue-card"><div class="card-body stack">
      <div class="queue-person"><div class="avatar">${initials(fullName(c))}</div><div class="grow"><h2 style="font-size:24px">${fullName(c)}</h2>
        <div class="row small muted"><span>${icon('megaphone', 'ic-sm')} ${c.event_name}${c.event_date ? ', ' + fmtDate(c.event_date) : ''}</span>${c.postcode ? h`<span>${c.postcode}</span>` : ''}</div>
        <div class="mt-sm"><span class="badge ${c.status === 'callback' ? 'badge-info' : c.status === 'new' ? 'badge-brand' : 'badge-warn'}">${why}</span></div></div></div>
      <div><a class="queue-phone" href="tel:${(c.phone || '').replace(/[^\d+]/g, '')}">${c.phone}</a>${c.email ? h`<div class="small muted">${mailLink(c.email)}</div>` : ''}</div>
      ${c.interest ? h`<div class="alert alert-info">${icon('info')}<div class="alert-text">Interested in: <b>${c.interest}</b></div></div>` : ''}
      ${c.notes ? h`<div class="pre small">${c.notes}</div>` : ''}
      <div><div class="label mb">How did the call go?</div><div class="outcomes">${enumOptions('call_outcome').map(([k, t]) => h`<button type="button" class="outcome" data-outcome="${k}" aria-pressed="false">${icon(outcomeIcons[k] || 'phone')}${t}</button>`)}</div></div>
      <div class="field hidden" data-cb><label for="q-cb">Call back on</label><input class="input" type="datetime-local" id="q-cb"></div>
      <div class="field"><label for="q-notes">Notes</label><textarea class="textarea" id="q-notes" rows="3" placeholder="What did they say?"></textarea></div>
      <div class="row"><button class="btn btn-primary btn-lg" type="button" data-save disabled>${icon('check')}Save & next</button><button class="btn btn-ghost" type="button" data-skip>Skip for now</button></div>
    </div></section>
    <section class="card"><div class="card-head"><h2>Call history</h2></div><div class="card-body">${d.calls.length ? h`<div class="timeline">${d.calls.map((x) => h`<div class="tl-item"><div class="tl-icon">${icon(outcomeIcons[x.outcome] || 'phone', 'ic-sm')}</div>
      <div><div class="tl-head"><b>${label('call_outcome', x.outcome)}</b><span>${x.user_name || ''}</span><span>${relTime(x.created_at)}</span></div>${x.notes ? h`<div class="tl-body">${x.notes}</div>` : ''}</div></div>`)}</div>` : h`<p class="muted">First call to this person.</p>`}
      <p class="small muted mt">Consent: ${c.consent_source || 'recorded'}${c.consent_at ? `, ${fmtDate(c.consent_at)}` : ''}</p></div></section></div>`);
  };
  // The person shown is held for this agent for 15 minutes: let them go as soon as the agent moves on, so other agents
  // can ring them.
  function release(c, keepalive) {
    return c ? apiPost('salesRelease', { contact_id: c.id }, { quiet: true, keepalive }).catch(() => {}) : Promise.resolve();
  }
  // Not when the page now open is this queue again: it shows (and keeps) the same person.
  const leaving = () => { const now = parseHash(); return !(now.path === 'sales/queue' && (now.query.get('event') || '') === state.event); };
  const onLeave = () => {
    if (!stale()) return;
    window.removeEventListener('hashchange', onLeave);
    window.removeEventListener('pagehide', onHide);
    if (leaving()) release(state.contact);
  };
  const onHide = () => release(state.contact, true);
  window.addEventListener('hashchange', onLeave);
  window.addEventListener('pagehide', onHide);
  on(el, 'change', '[data-event]', async (e, s) => {
    const c = state.contact;
    state.contact = null; state.event = s.value; state.skipped = [];
    await release(c); // before the next person is fetched, or "All events" would bring the same person back
    load().catch(showError);
  });
  on(body, 'click', '[data-outcome]', (e, b) => {
    state.outcome = b.dataset.outcome;
    $$('[data-outcome]', body).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const cb = $('[data-cb]', body);
    cb.classList.toggle('hidden', state.outcome !== 'callback');
    if (state.outcome === 'callback' && !$('#q-cb', body).value) {
      const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(10, 0, 0, 0);
      $('#q-cb', body).value = `${isoDay(t)}T10:00`;
    }
    $('[data-save]', body).disabled = false;
  });
  on(body, 'click', '[data-skip]', () => {
    if (state.contact) state.skipped = state.skipped.filter((id) => id !== +state.contact.id).concat(+state.contact.id);
    load().catch(showError);
  });
  on(body, 'click', '[data-save]', async (e, btn) => {
    const c = state.contact;
    busy(btn, true, 'Saving…');
    try {
      const cbVal = $('#q-cb', body).value;
      await apiPost('salesCall', { contact_id: c.id, outcome: state.outcome, notes: $('#q-notes', body).value, callback_at: state.outcome === 'callback' && cbVal ? new Date(cbVal).toISOString() : '' });
      toast(`Logged: ${label('call_outcome', state.outcome)}`);
      if (state.outcome === 'interested') {
        const ok = await confirmBox({ title: `Hand ${fullName(c)} over now?`, message: 'Pick the office, adviser and administrator. They arrive as a new lead with this call history.', confirmText: 'Hand over' });
        // Handed over or not, the call is logged: carry on with the next person.
        const next = () => load().catch(showError);
        if (ok) { handoverModal(c, next, next); return; }
      }
      load().catch(showError);
    } catch (err) { busy(btn, false); showError(err); }
  });
  await load();
}

async function viewSalesResults({ el, stale }) {
  const d = await apiGet('salesResults');
  if (stale()) return;
  const t = d.totals;
  setHTML(el, h`${pageHead({ title: 'Event results', sub: 'Per event: who was reached, who was interested, who was handed over and converted, and the cost per hand-over.' })}
  <div class="kpis">${kpi('Contacts', num(t.contacts), `${num(t.called)} called`, '#/sales')}${kpi('Reached', num(t.reached), t.called ? `${Math.round((100 * t.reached) / t.called)}% of calls` : '', '#/sales')}
    ${kpi('Interested', num(t.interested), '', '#/sales')}${kpi('Handed over', num(t.handed_over), `${num(t.converted)} converted · ${num(t.completed)} completed`, '#/sales')}
    ${kpi('Cost per hand-over', t.cost_per_handover === null ? '—' : money(t.cost_per_handover), `${money(t.cost)} total sponsorship`, '#/sales')}</div>
  <section class="mb"><h2 style="font-size:18px;margin-bottom:10px">By event</h2><div data-ev></div></section>
  <section><h2 style="font-size:18px;margin-bottom:10px">By agent</h2><div data-ag></div></section>`);
  mountTable($('[data-ev]', el), { rows: d.events, noun: 'event', exportName: 'MAP event results', rowHref: (e) => `#/sales/events/${e.id}`, columns: [
    { k: 'name', label: 'Event', render: (e) => h`<div class="t-title">${e.name}</div><div class="t-sub">${fmtDate(e.event_date)}</div>` },
    { k: 'contacts', label: 'Contacts', right: true, value: (e) => e.stats.contacts }, { k: 'reached', label: 'Reached', right: true, value: (e) => e.stats.reached },
    { k: 'interested', label: 'Interested', right: true, value: (e) => e.stats.interested }, { k: 'handed', label: 'Handed over', right: true, value: (e) => e.stats.handed_over },
    { k: 'converted', label: 'Converted', right: true, value: (e) => e.stats.converted }, { k: 'completed', label: 'Completed', right: true, value: (e) => e.stats.completed },
    { k: 'cost', label: 'Sponsorship', right: true, value: (e) => +e.sponsorship_cost || null, render: (e) => money(e.sponsorship_cost) },
    { k: 'cph', label: 'Cost / hand-over', right: true, value: (e) => e.stats.cost_per_handover, render: (e) => (e.stats.cost_per_handover === null ? '—' : money(e.stats.cost_per_handover)) }] });
  mountTable($('[data-ag]', el), { rows: d.agents, noun: 'agent', exportName: 'MAP calls by agent', empty: emptyState('phone', 'No calls logged yet', ''), columns: [
    { k: 'user_name', label: 'Agent' }, { k: 'calls', label: 'Calls', right: true, value: (a) => +a.calls }, { k: 'reached', label: 'Reached', right: true, value: (a) => +a.reached },
    { k: 'interested', label: 'Interested', right: true, value: (a) => +a.interested }, { k: 'handed_over', label: 'Handed over', right: true, value: (a) => +a.handed_over },
    { k: 'last_call_at', label: 'Last call', render: (a) => relTime(a.last_call_at) }] });
}
