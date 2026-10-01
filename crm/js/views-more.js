/* MAP Operating System: radar, opportunities, compliance, documents, tasks & calendar, introducers, team,
   reports, templates, lost cases, audit log, trash, import/export & backups, account. */
'use strict';

/* ---------- Remortgage radar ---------- */
async function viewRadar({ el, stale }) {
  const d = await apiGet('radar');
  if (stale()) return;
  const meta = [['ended', 'Already ended', 'Rolled onto the lender\'s standard rate'], ['m3', 'Within 3 months', 'Act now'], ['m6', '3–6 months', 'Opportunity created automatically'],
    ['m12', '6–12 months', 'Coming up'], ['m24', '1–2 years', 'Future pipeline'], ['later', 'Over 2 years', 'Long-term']];
  const total = (k) => d.buckets[k].reduce((s, r) => s + (+r.loan_amount || 0), 0);
  setHTML(el, h`${pageHead({ title: 'Remortgage radar', sub: 'Completed clients grouped by when their fixed rate ends: your future revenue pipeline.' })}
  ${d.missing_end_date ? h`<div class="alert alert-warn mb">${icon('alert')}<div class="alert-text">${plural(d.missing_end_date, 'completed case')} ${d.missing_end_date === 1 ? 'has' : 'have'} no fixed-rate end date, so ${d.missing_end_date === 1 ? 'it is' : 'they are'} not on the radar. Add the end date (or the fixed period) on the case.</div></div>` : ''}
  <div class="radar-cols mb">${meta.map(([k, t, s]) => h`<a class="card card-pad radar-col r-${k}" href="#radar-${k}" data-jump="${k}" style="text-decoration:none;color:inherit">
    <div class="k-label tiny muted" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">${t}</div><div class="big">${num(d.buckets[k].length)}</div><div class="small muted">${moneyShort(total(k))} lending · ${s}</div></a>`)}</div>
  ${meta.filter(([k]) => d.buckets[k].length).map(([k, t]) => h`<section class="mb" id="radar-${k}"><h2 style="font-size:18px;margin:6px 0 10px">${t}</h2><div data-radar="${k}"></div></section>`)}
  ${meta.every(([k]) => !d.buckets[k].length) ? h`<div class="card">${emptyState('radar', 'Nothing on the radar yet', 'When a mortgage completes, the CRM records when the fixed rate ends and the client appears here.')}</div>` : ''}`);
  for (const [k] of meta) {
    const box = $(`[data-radar="${k}"]`, el);
    if (!box) continue;
    mountTable(box, {
      rows: d.buckets[k], noun: 'client', exportName: `MAP remortgage radar ${k}`, rowHref: (r) => `#/cases/${r.id}`, sort: ['fixed_rate_end_date', 1],
      columns: [
        { k: 'client_name', label: 'Client', render: (r) => h`<div class="t-title">${r.client_name}</div><div class="t-sub">${r.phone || ''}</div>` },
        { k: 'lender', label: 'Lender', render: (r) => h`${r.lender || ''}<div class="t-sub">${r.rate ? r.rate + '%' : ''} ${label('rate_type', r.rate_type)}</div>` },
        { k: 'loan_amount', label: 'Loan', right: true, render: (r) => money(r.loan_amount), value: (r) => +r.loan_amount || null },
        { k: 'fixed_rate_end_date', label: 'Fixed rate ends', render: (r) => h`${fmtDate(r.fixed_rate_end_date)}<div class="t-sub ${r.days_left < 92 ? 'due-today' : ''}">${r.days_left < 0 ? `${-r.days_left} days ago` : `in ${r.days_left} days`}</div>` },
        { k: 'adviser_id', label: 'Adviser', value: (r) => userName(r.adviser_id) },
        { k: 'opportunity_status', label: 'Follow-up', render: (r) => (r.opportunity_status ? statusBadge('x', r.opportunity_status === 'open' ? 'Opportunity open' : r.opportunity_status === 'actioned' ? 'Actioned' : 'Dismissed') : h`<span class="muted small">—</span>`) },
        { k: 'act', label: '', nosort: true, noexport: true, render: (r) => h`<button class="btn btn-secondary btn-xs" type="button" data-remail="${r.id}">${icon('mail', 'ic-sm')}Email</button>` },
      ],
    });
  }
  on(el, 'click', '[data-remail]', (e, b) => emailComposer({ case_id: +b.dataset.remail }, null, 'Remortgage review'));
  on(el, 'click', '[data-jump]', (e, a) => { e.preventDefault(); const t = $(`#radar-${a.dataset.jump}`, el); if (t) t.scrollIntoView({ behavior: 'smooth' }); });
}

/* ---------- Opportunities ---------- */
async function viewOpportunities({ el, query }) {
  const state = { status: query.get('status') || 'open', type: query.get('type') || '' };
  setHTML(el, h`${pageHead({ title: 'Opportunities', sub: isProtectionOnly() ? 'Clients without protection, landlords without cover, buyers without home insurance and reviews due: spotted automatically.' : 'Clients without protection, landlords without cover, buyers without home insurance, reviews due and remortgages: spotted automatically.' })}
  <div class="filters">${segmented('status', [['open', 'Open'], ['actioned', 'Actioned'], ['dismissed', 'Dismissed'], ['all', 'All']], state.status)}<div data-types></div></div>
  <div data-list>${loadingBlock()}</div>`);
  const typeIcon = { remortgage: 'radar', protection_gap: 'shield', landlord_cover: 'building', home_insurance: 'home', review_due: 'calendar', other: 'spark' };
  const load = async () => {
    setQuery({ status: state.status === 'open' ? '' : state.status, type: state.type });
    const d = await apiGet('opportunities', { status: state.status, type: state.type });
    setHTML($('[data-types]', el), segmented('type', [['', 'All types'], ...enumOptions('opportunity_type').filter(([k]) => !(isProtectionOnly() && k === 'remortgage')).map(([k, v]) => [k, `${v}${d.counts[k] ? ` (${d.counts[k]})` : ''}`])], state.type));
    setHTML($('[data-list]', el), d.rows.length ? h`<div class="grid grid-2">${d.rows.map((o) => h`<div class="card card-pad">
      <div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="reminder info" style="padding:0;border:0;background:none"><span class="r-icon">${icon(typeIcon[o.type] || 'spark')}</span></span>
        <div class="grow"><div class="row-between"><b>${o.title}</b><span class="badge ${o.status === 'open' ? 'badge-brand' : o.status === 'actioned' ? 'badge-ok' : ''}">${label('opportunity_type', o.type)}</span></div>
          <div class="small muted mt-sm">${o.detail || ''}</div>
          <div class="task-meta">${o.due_date ? h`<span>${icon('calendar', 'ic-sm')} ${fmtDate(o.due_date)}</span>` : ''}${o.value ? h`<span>${money(o.value)}</span>` : ''}${o.adviser_id ? h`<span>${userName(o.adviser_id)}</span>` : ''}<span>Spotted ${relTime(o.created_at)}</span></div>
          <div class="row mt">${o.client_id ? h`<a class="btn btn-ghost btn-xs" href="${o.case_id ? `#/cases/${o.case_id}` : `#/clients/${o.client_id}`}">Open ${o.client_name || 'client'}</a>` : ''}
            ${o.status === 'open' ? h`<button class="btn btn-primary btn-xs" type="button" data-op="task" data-id="${o.id}">${icon('calendar', 'ic-sm')}Create task</button>
              <button class="btn btn-secondary btn-xs" type="button" data-op="actioned" data-id="${o.id}">${icon('check', 'ic-sm')}Done</button>
              <button class="btn btn-ghost btn-xs" type="button" data-op="dismissed" data-id="${o.id}">Dismiss</button>` : h`<button class="btn btn-ghost btn-xs" type="button" data-op="open" data-id="${o.id}">${icon('undo', 'ic-sm')}Reopen</button>`}</div></div></div></div>`)}</div>`
      : h`<div class="card">${emptyState('spark', 'No opportunities here', state.status === 'open' ? 'The CRM checks every client for gaps and upcoming reviews automatically.' : '')}</div>`);
  };
  wireSegments(el, (name, val) => { state[name] = val; load().catch(showError); });
  on(el, 'click', '[data-op]', async (e, b) => {
    try {
      const r = await apiPost('opportunityAct', { id: +b.dataset.id, action: b.dataset.op });
      toast(b.dataset.op === 'task' ? 'Task created for the adviser' : b.dataset.op === 'open' ? 'Reopened' : 'Updated');
      if (r.task_id) pollNotifications();
      load();
    } catch (err) { showError(err); }
  });
  await load();
}

/* ---------- Compliance ---------- */
async function viewCompliance({ el, query, stale }) {
  const d = await apiGet('compliance');
  if (stale()) return;
  const state = { rating: query.get('rating') || '' };
  setHTML(el, h`${pageHead({ title: 'Compliance', sub: 'An automatic checklist for every case, rated Red / Amber / Green. Red means something should already have been done.' })}
  <div class="kpis">
    ${kpi('Red', num(d.summary.red), 'items overdue for the stage', '#/compliance?rating=red', d.summary.red > 0)}
    ${kpi('Amber', num(d.summary.amber), 'items due at the current stage', '#/compliance?rating=amber')}
    ${kpi('Green', num(d.summary.green), 'up to date', '#/compliance?rating=green')}
  </div>
  <div class="filters">${segmented('rating', [['', 'All'], ['red', 'Red'], ['amber', 'Amber'], ['green', 'Green']], state.rating)}</div><div data-table></div>`);
  let table;
  const draw = () => {
    setQuery({ rating: state.rating });
    const rows = d.rows.filter((c) => !state.rating || c.compliance_eval.rating === state.rating);
    const opts = {
      rows, noun: 'case', exportName: 'MAP compliance', rowHref: (c) => `#/cases/${c.id}`,
      empty: emptyState('check-circle', 'No cases here', ''),
      columns: [
        { k: 'client_name', label: 'Client', render: (c) => h`<div class="t-title">${c.client_name}</div><div class="t-sub">${label('case_type', c.case_type)} · ${label('stage', c.stage)}</div>` },
        { k: 'rating', label: 'Rating', value: (c) => ({ red: 0, amber: 1, green: 2 }[c.compliance_eval.rating]), render: (c) => ragBadge(c.compliance_eval.rating), exportValue: (c) => c.compliance_eval.rating },
        { k: 'progress', label: 'Progress', value: (c) => c.compliance_eval.done / Math.max(1, c.compliance_eval.required),
          render: (c) => h`<div style="min-width:120px"><div class="progress"><span style="width:${Math.round((100 * c.compliance_eval.done) / Math.max(1, c.compliance_eval.required))}%"></span></div><div class="t-sub">${c.compliance_eval.done} of ${c.compliance_eval.required}</div></div>`,
          exportValue: (c) => `${c.compliance_eval.done}/${c.compliance_eval.required}` },
        { k: 'missing', label: 'Still to do', nosort: true, value: (c) => c.compliance_eval.items.filter((i) => i.required && !i.done).map((i) => i.label).join('; '),
          render: (c) => { const m = c.compliance_eval.items.filter((i) => i.required && !i.done); return m.length ? h`${m.slice(0, 2).map((i) => h`<div class="small ${i.overdue ? 'risk-high' : ''}">${i.label}</div>`)}${m.length > 2 ? h`<div class="t-sub">+${m.length - 2} more</div>` : ''}` : h`<span class="muted small">Nothing</span>`; } },
        { k: 'adviser_id', label: 'Adviser', value: (c) => userName(c.adviser_id) },
      ],
    };
    if (table) table.setRows(rows); else table = mountTable($('[data-table]', el), opts);
  };
  wireSegments(el, (n, v) => { state[n] = v; draw(); });
  draw();
}

/* ---------- Documents ---------- */
async function viewDocuments({ el, query }) {
  const state = { status: query.get('status') || 'requested' };
  setHTML(el, h`${pageHead({ title: 'Documents', sub: 'What has been requested, received or has expired, for every case.' })}
  <div class="filters" data-filters></div><div data-table>${loadingBlock()}</div>`);
  let table;
  const load = async () => {
    setQuery({ status: state.status === 'requested' ? '' : state.status });
    const d = await apiGet('documents', { status: state.status });
    const c = d.summary;
    setHTML($('[data-filters]', el), segmented('status', [['requested', `Requested (${c.requested || 0})`], ['received', `Received (${c.received || 0})`], ['expired', `Expired (${c.expired || 0})`], ['all', 'All']], state.status));
    const opts = {
      rows: d.rows, noun: 'document', exportName: 'MAP documents', rowHref: (x) => (x.case_id ? `#/cases/${x.case_id}` : `#/clients/${x.client_id}`),
      empty: emptyState('file', 'No documents here', state.status === 'requested' ? 'Nothing is waiting to come in.' : ''),
      columns: [
        { k: 'name', label: 'Document', render: (x) => h`<div class="t-title">${x.name}</div>${x.notes ? h`<div class="t-sub">${x.notes}</div>` : ''}` },
        { k: 'client_name', label: 'Client', render: (x) => h`${x.client_name}<div class="t-sub">${x.case_type ? `${label('case_type', x.case_type)} · ${label('stage', x.stage)}` : ''}</div>` },
        { k: 'status', label: 'Status', value: (x) => label('document_status', x.status), render: (x) => statusBadge('document_status', x.status) },
        { k: 'requested_at', label: 'Requested', render: (x) => { const n = daysBetween(x.requested_at, today()); return h`${fmtDate(x.requested_at)}${x.status === 'requested' && n > 14 ? h`<div class="t-sub due-overdue">${n} days waiting</div>` : ''}`; } },
        { k: 'received_at', label: 'Received', render: (x) => fmtDate(x.received_at) },
        { k: 'expiry_date', label: 'Expires', render: (x) => fmtDate(x.expiry_date) },
        { k: 'act', label: '', nosort: true, noexport: true, render: (x) => (x.status === 'requested' ? h`<button class="btn btn-secondary btn-xs" type="button" data-received="${x.id}" data-v="${x.version}">${icon('check', 'ic-sm')}Received</button>` : '') },
      ],
    };
    if (table) table.setRows(d.rows); else table = mountTable($('[data-table]', el), opts);
  };
  wireSegments(el, (n, v) => { state[n] = v; load().catch(showError); });
  on(el, 'click', '[data-received]', async (e, b) => {
    try { await apiPost('save', { entity: 'documents', id: +b.dataset.received, version: +b.dataset.v, data: { status: 'received' } }); toast('Marked as received'); load(); } catch (err) { showError(err); }
  });
  await load();
}

/* ---------- Tasks & calendar ---------- */
async function viewTaskRoute({ params }) {
  location.replace('#/tasks');
  try { const d = await apiGet('get', { entity: 'tasks', id: params.id }); openTask(d.record, null, () => router()); } catch (e) { showError(e); }
}
async function viewTasks({ el, query }) {
  const state = { tab: query.get('tab') || 'list', due: query.get('due') || 'all', mine: query.get('mine') === '1', month: query.get('month') || today().slice(0, 7) };
  setHTML(el, h`${pageHead({ title: 'Tasks & calendar', sub: 'Everything due, overdue or coming up in the next 60 days, including the tasks the CRM creates for you.',
    actions: h`<button class="btn btn-primary" type="button" data-new>${icon('plus')}New task</button>` })}
  <div class="tabs" role="tablist"><button role="tab" type="button" data-tab="list" aria-selected="${state.tab === 'list'}">Task list</button><button role="tab" type="button" data-tab="calendar" aria-selected="${state.tab === 'calendar'}">Calendar</button></div>
  <div data-body>${loadingBlock()}</div>`);
  const body = $('[data-body]', el);
  const reload = () => draw().catch(showError);
  const draw = async () => {
    setQuery({ tab: state.tab === 'list' ? '' : state.tab, due: state.due === 'all' ? '' : state.due, mine: state.mine ? '1' : '', month: state.tab === 'calendar' ? state.month : '' });
    if (state.tab === 'list') {
      const isDone = state.due === 'done';
      const res = await apiGet('list', { entity: 'tasks', status: isDone ? 'done' : 'open', due: ['overdue', 'today', 'upcoming'].includes(state.due) ? state.due : '', mine: state.mine });
      const t = today();
      let rows = res.rows;
      if (isDone) rows = rows.sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at))).slice(0, 200);
      const groups = isDone ? [['Done recently', rows]] : [
        ['Overdue', rows.filter((x) => x.due_date && x.due_date < t)], ['Today', rows.filter((x) => x.due_date === t)],
        ['Next 7 days', rows.filter((x) => x.due_date > t && daysBetween(t, x.due_date) <= 7)], ['Next 60 days', rows.filter((x) => x.due_date && daysBetween(t, x.due_date) > 7 && daysBetween(t, x.due_date) <= 60)],
        ['Later', rows.filter((x) => x.due_date && daysBetween(t, x.due_date) > 60)], ['No date', rows.filter((x) => !x.due_date)],
      ].filter(([, list]) => list.length);
      setHTML(body, h`<div class="filters">${segmented('due', [['all', 'All open'], ['overdue', 'Overdue'], ['today', 'Today'], ['upcoming', 'Next 60 days'], ['done', 'Done']], state.due)}
        <label class="check"><input type="checkbox" data-mine ${state.mine ? raw('checked') : ''}><span>Mine only</span></label></div>
        ${groups.length ? groups.map(([g, list]) => h`<section class="card mb"><div class="card-head"><h2>${g} <span class="muted small">(${list.length})</span></h2></div><div class="card-body" data-group>${tasksHtml(list, { showLink: true })}</div></section>`)
          : h`<div class="card">${emptyState('check-circle', 'No tasks here', 'All clear.')}</div>`}`);
      $$('[data-group]', body).forEach((g) => wireTasks(g, () => rows, reload));
      $('[data-mine]', body).addEventListener('change', (e) => { state.mine = e.target.checked; reload(); });
    } else {
      const [y, m] = state.month.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
      const end = new Date(start); end.setDate(start.getDate() + 41);
      const res = await apiGet('calendar', { from: isoDay(start), to: isoDay(end), mine: state.mine });
      const byDay = {};
      res.items.forEach((it) => { (byDay[it.overdue ? today() : it.date] = byDay[it.overdue ? today() : it.date] || []).push(it); });
      const linkOf = (it) => (it.kind === 'task' ? `#/tasks/${it.id}` : it.case_id ? `#/cases/${it.case_id}` : it.policy_id ? `#/policies/${it.policy_id}` : `#/clients/${it.client_id}`);
      const days = [];
      for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
      const prev = new Date(y, m - 2, 1), nextM = new Date(y, m, 1);
      setHTML(body, h`<div class="filters"><button class="icon-btn" type="button" data-month="${isoDay(prev).slice(0, 7)}" aria-label="Previous month">${icon('chevron-left')}</button>
        <b style="font-size:18px;min-width:170px;text-align:center">${first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
        <button class="icon-btn" type="button" data-month="${isoDay(nextM).slice(0, 7)}" aria-label="Next month">${icon('chevron-right')}</button>
        <button class="btn btn-ghost btn-sm" type="button" data-month="${today().slice(0, 7)}">Today</button>
        <label class="check"><input type="checkbox" data-mine ${state.mine ? raw('checked') : ''}><span>Mine only</span></label>
        <span class="small muted">Overdue tasks show on today. Also shows ${isProtectionOnly() ? 'renewals and reviews' : 'completions, offer expiries, renewals, fixed-rate ends and reviews'}.</span></div>
        <div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h`<div class="cal-dow">${d}</div>`)}
        ${days.map((d) => { const k = isoDay(d); const list = byDay[k] || []; return h`<div class="cal-day ${d.getMonth() !== m - 1 ? 'other' : ''} ${k === today() ? 'today' : ''}"><div class="cal-num">${d.getDate()}</div>
          ${list.slice(0, 4).map((it) => h`<a class="cal-ev k-${it.kind} ${it.overdue ? 'overdue' : ''}" href="${linkOf(it)}" title="${it.title}">${it.title}</a>`)}${list.length > 4 ? h`<div class="tiny muted">+${list.length - 4} more</div>` : ''}</div>`; })}</div>`);
      on(body, 'click', '[data-month]', (e, b) => { state.month = b.dataset.month; reload(); });
      $('[data-mine]', body).addEventListener('change', (e) => { state.mine = e.target.checked; reload(); });
    }
  };
  on(el, 'click', '[data-tab]', (e, b) => { state.tab = b.dataset.tab; $$('[data-tab]', el).forEach((x) => x.setAttribute('aria-selected', String(x === b))); reload(); });
  on(body, 'click', '[data-seg] button', (e, b) => { state.due = b.dataset.val; reload(); });
  on(el, 'click', '[data-new]', () => openTask(null, null, reload));
  await draw();
}

/* ---------- Introducers ---------- */
async function viewIntroducers({ el, stale }) {
  const d = await apiGet('introducerStats');
  if (stale()) return;
  setHTML(el, h`${pageHead({ title: 'Introducers', sub: 'Referral partners, with referrals and conversions counted automatically from the leads and clients linked to them.',
    actions: h`<button class="btn btn-primary" type="button" data-new>${icon('plus')}New introducer</button>` })}<div data-table></div>`);
  mountTable($('[data-table]', el), {
    rows: d.rows, noun: 'introducer', exportName: 'MAP introducers', rowHref: (r) => `#/introducers/${r.id}`, sort: ['referrals', -1],
    empty: emptyState('handshake', 'No introducers yet', 'Add estate agents, solicitors and other partners who refer clients to you.'),
    columns: [
      { k: 'name', label: 'Introducer', render: (r) => h`<div class="t-title">${r.name}${r.active ? '' : h` <span class="badge">Inactive</span>`}</div><div class="t-sub">${r.company || ''}</div>` },
      { k: 'type', label: 'Type', value: (r) => label('introducer_type', r.type) },
      { k: 'referrals', label: 'Referrals', right: true, value: (r) => r.referrals },
      { k: 'converted', label: 'Converted', right: true, value: (r) => r.converted },
      { k: 'conversion', label: 'Conversion', right: true, value: (r) => r.conversion, render: (r) => (r.conversion === null ? '—' : `${r.conversion}%`) },
      ...(isProtectionOnly() ? [] : [{ k: 'completed', label: 'Completions', right: true, value: (r) => r.completed },
        { k: 'fees', label: 'Fees earned', right: true, value: (r) => r.fees, render: (r) => money(r.fees) }]),
      { k: 'last_referral_at', label: 'Last referral', render: (r) => (r.last_referral_at ? relTime(r.last_referral_at) : '—'), exportValue: (r) => fmtDate(r.last_referral_at) },
    ],
  });
  on(el, 'click', '[data-new]', () => editRecord({ entity: 'introducers', fields: FIELDS.introducers, title: 'New introducer', defaults: { active: true },
    onSaved: async (r) => { S.meta = Object.assign(S.meta, await apiGet('meta')); location.hash = `#/introducers/${r.id}`; } }));
}
async function viewIntroducer({ el, params, stale }) {
  const d = await apiGet('get', { entity: 'introducers', id: params.id });
  if (stale()) return;
  const r = d.record;
  const reload = async () => { const m = await apiGet('meta'); S.meta.introducers = m.introducers; router(); };
  setTitle(r.name);
  const conv = d.leads.filter((l) => l.client_id).length;
  setHTML(el, h`<a class="back-link" href="#/introducers">${icon('chevron-left', 'ic-sm')}Introducers</a>
  <div class="detail-head"><div class="avatar">${initials(r.name)}</div><div class="grow"><h1>${r.name}</h1><div class="meta">${r.company ? h`<span class="chip">${r.company}</span>` : ''}${r.type ? h`<span class="chip">${label('introducer_type', r.type)}</span>` : ''}${r.active ? '' : h`<span class="badge">Inactive</span>`}</div></div>
    <div class="row"><button class="btn btn-primary" type="button" data-act="lead">${icon('lead')}New referral</button><button class="btn btn-ghost" type="button" data-act="edit">${icon('edit')}Edit</button><button class="icon-btn" type="button" data-act="delete" aria-label="Move to trash">${icon('trash')}</button></div></div>
  <div class="kpis">${kpi('Referrals', num(d.leads.length + d.clients.filter((c) => !d.leads.some((l) => l.client_id === c.id)).length), 'leads and clients', '#/introducers/' + r.id)}
    ${kpi('Converted', num(conv), d.leads.length ? `${Math.round((100 * conv) / d.leads.length)}% of referred leads` : 'no leads yet', '#/introducers/' + r.id)}</div>
  <div class="grid grid-2"><section class="card"><div class="card-head"><h2>Details</h2></div><div class="card-body">${kvHtml([['Phone', telLink(r.phone)], ['Email', mailLink(r.email)], ['Terms', r.commission_terms], ['Added', fmtDate(r.created_at)]])}
    ${r.notes ? h`<div class="pre mt">${r.notes}</div>` : ''}</div></section>
    <section class="card"><div class="card-head"><h2>Referred leads</h2></div><div class="card-body">${d.leads.length ? h`<div class="list">${d.leads.map((l) => h`<a class="list-item" href="#/leads/${l.id}"><div class="grow"><div class="li-title">${fullName(l)}</div><div class="li-sub">${fmtDate(l.created_at)}</div></div>${ratingBadge(l.rating)}${statusBadge('lead_status', l.status)}</a>`)}</div>` : h`<p class="muted">No leads yet.</p>`}</div></section></div>`);
  on(el, 'click', '[data-act]', (e, b) => {
    const a = b.dataset.act;
    if (a === 'edit') editRecord({ entity: 'introducers', record: r, fields: FIELDS.introducers, title: `Edit ${r.name}`, onSaved: reload });
    if (a === 'lead') newLead({ introducer_id: r.id, source: 'introducer' });
    if (a === 'delete') trashRecord('introducers', r, r.name, () => { location.hash = '#/introducers'; });
  });
}

/* ---------- Team & workload ---------- */
async function viewTeam({ el, stale }) {
  const d = await apiGet('team');
  if (stale()) return;
  const statusTxt = { ok: ['badge-ok', 'OK'], busy: ['badge-warn', 'Busy'], overloaded: ['badge-bad', 'Overloaded'] };
  setHTML(el, h`${pageHead({ title: 'Team & workload', sub: `Who is carrying what in ${S.officeName}. A person is marked overloaded at ${d.threshold} workload points or 5+ overdue tasks.` })}
  ${d.unassigned_tasks ? h`<div class="alert alert-warn mb">${icon('alert')}<div class="alert-text">${plural(d.unassigned_tasks, 'open task')} ${d.unassigned_tasks === 1 ? 'has' : 'have'} nobody assigned. <a href="#/tasks">Assign them</a></div></div>` : ''}
  <div class="people">${d.rows.map((u) => {
    const [cls, txt] = statusTxt[u.status];
    return h`<div class="card person"><div class="row"><div class="avatar">${initials(u.full_name)}</div><div class="grow"><b>${u.full_name}</b><div class="small muted">${label('x', S.meta.roles[u.role] || u.role)}</div></div><span class="badge ${cls}">${txt}</span></div>
      <div class="load-meter"><div class="row-between small"><span class="muted">Workload</span><b>${u.load} pts</b></div><div class="progress mt-sm"><span class="${u.status}" style="width:${Math.min(100, (100 * u.load) / d.threshold)}%"></span></div></div>
      <div class="mini-stats">${isProtectionOnly() ? h`<div><b>${u.open_quotes}</b><span>Quotes</span></div>` : h`<div><b>${u.active_cases}</b><span>Cases</span></div>`}<div><b>${u.open_leads}</b><span>Leads</span></div><div><b>${u.open_tasks}</b><span>Tasks</span></div><div><b class="${u.overdue_tasks ? 'risk-high' : ''}">${u.overdue_tasks}</b><span>Overdue</span></div></div>
      <div class="row mt"><a class="btn btn-ghost btn-xs" href="#/tasks?mine=0">Tasks</a><span class="small muted">${u.due_week} due this week${u.last_login_at ? ` · last in ${relTime(u.last_login_at)}` : ''}</span></div></div>`;
  })}</div>${d.rows.length ? '' : h`<div class="card">${emptyState('team', 'No staff in this office yet', 'Staff appear here once their login is approved.')}</div>`}`);
}

/* ---------- Reports ---------- */
async function viewReports({ el, query }) {
  const reportTabs = isProtectionOnly() ? [['revenue', 'Commission by adviser'], ['sources', 'Lead sources']]
    : [['pipeline', 'Pipeline'], ['revenue', 'Revenue by adviser'], ['quiet', 'Gone quiet'], ['sources', 'Lead sources'], ['completions', 'Completions'], ['lost', 'Lost reasons']];
  const firstTab = reportTabs[0][0];
  const asked = query.get('tab');
  const state = { from: query.get('from') || `${today().slice(0, 4)}-01-01`, to: query.get('to') || today(), tab: reportTabs.some(([k]) => k === asked) ? asked : firstTab };
  setHTML(el, h`${pageHead({ title: 'Reports', sub: isProtectionOnly() ? 'Protection commission by adviser and where your leads come from.' : 'Pipeline, revenue by adviser, cases that have gone quiet, lead sources and completions.' })}
  <div class="filters"><div class="field"><label for="rp-from">From</label><input class="input" type="date" id="rp-from" value="${state.from}"></div>
    <div class="field"><label for="rp-to">To</label><input class="input" type="date" id="rp-to" value="${state.to}"></div>
    <div class="field"><span class="label">Quick ranges</span>${segmented('range', [['month', 'This month'], ['year', 'This year'], ['12m', 'Last 12 months']], '')}</div></div>
  <div class="tabs" role="tablist">${reportTabs
    .map(([k, t]) => h`<button role="tab" type="button" data-tab="${k}" aria-selected="${k === state.tab}">${t}</button>`)}</div><div data-body>${loadingBlock()}</div>`);
  const body = $('[data-body]', el);
  let d;
  const draw = () => {
    setQuery({ from: state.from, to: state.to, tab: state.tab === firstTab ? '' : state.tab });
    const t = state.tab;
    if (t === 'pipeline') {
      const rows = d.pipeline;
      setHTML(body, h`<div class="grid grid-2"><section class="card"><div class="card-head"><h2>Lending by stage</h2></div><div class="card-body">${barsHtml(rows, { value: (r) => r.loan, labelOf: (r) => label('stage', r.stage), fmt: moneyShort })}</div></section><div data-t></div></div>`);
      mountTable($('[data-t]', body), { rows, noun: 'stage', exportName: 'MAP pipeline report', columns: [
        { k: 'stage', label: 'Stage', value: (r) => label('stage', r.stage) }, { k: 'count', label: 'Cases', right: true },
        { k: 'loan', label: 'Lending', right: true, render: (r) => money(r.loan) }, { k: 'fees', label: 'Fees due', right: true, render: (r) => money(r.fees) },
        { k: 'high', label: 'High risk', right: true }] });
    } else if (t === 'revenue') {
      const prot = isProtectionOnly();
      const rows = d.revenue.map((r) => Object.assign({ name: r.adviser_id ? userName(r.adviser_id) || 'Former staff' : 'No adviser' }, r, prot ? { total: r.commission } : {}))
        .filter((r) => !prot || r.policies > 0);
      const total = rows.reduce((s, r) => s + r.total, 0);
      if (prot) {
        setHTML(body, h`<div class="kpis">${kpi('Protection commission', money(total), `${fmtDate(d.from)} to ${fmtDate(d.to)}`, '#/reports?tab=revenue')}${kpi('Policies started', num(rows.reduce((s, r) => s + r.policies, 0)), 'went on risk in this period', '#/protection?status=on_risk')}</div>
          <div class="grid grid-2"><section class="card"><div class="card-head"><h2>Commission by adviser</h2></div><div class="card-body">${rows.length ? barsHtml(rows, { value: (r) => r.total, labelOf: (r) => r.name, fmt: moneyShort }) : emptyState('chart', 'No commission in this period', '')}</div></section><div data-t></div></div>`);
        mountTable($('[data-t]', body), { rows, noun: 'adviser', exportName: 'MAP protection commission', sort: ['total', -1], columns: [
          { k: 'name', label: 'Adviser' }, { k: 'policies', label: 'Policies started', right: true }, { k: 'total', label: 'Commission', right: true, render: (r) => h`<b>${money(r.total)}</b>` }] });
        return;
      }
      setHTML(body, h`<div class="kpis">${kpi('Total revenue', money(total), `${fmtDate(d.from)} to ${fmtDate(d.to)}`, '#/reports?tab=revenue')}${kpi('Completions', num(rows.reduce((s, r) => s + r.completions, 0)), moneyShort(rows.reduce((s, r) => s + r.lent, 0)) + ' lent', '#/reports?tab=completions')}</div>
        <div class="grid grid-2"><section class="card"><div class="card-head"><h2>Revenue by adviser</h2></div><div class="card-body">${rows.length ? barsHtml(rows, { value: (r) => r.total, labelOf: (r) => r.name, fmt: moneyShort }) : emptyState('chart', 'No revenue in this period', '')}</div></section><div data-t></div></div>`);
      mountTable($('[data-t]', body), { rows, noun: 'adviser', exportName: 'MAP revenue by adviser', sort: ['total', -1], columns: [
        { k: 'name', label: 'Adviser' }, { k: 'completions', label: 'Completions', right: true }, { k: 'lent', label: 'Lent', right: true, render: (r) => moneyShort(r.lent) },
        { k: 'proc_fees', label: 'Proc fees', right: true, render: (r) => money(r.proc_fees) }, { k: 'broker_fees', label: 'Broker fees', right: true, render: (r) => money(r.broker_fees) },
        { k: 'commission', label: 'Protection commission', right: true, render: (r) => money(r.commission) }, { k: 'total', label: 'Total', right: true, render: (r) => h`<b>${money(r.total)}</b>` }] });
    } else if (t === 'quiet') {
      setHTML(body, h`<p class="muted">Live cases with no call, note or update for ${d.quiet_days} days or more.</p><div data-t></div>`);
      mountTable($('[data-t]', body), { rows: d.quiet, noun: 'case', exportName: 'MAP quiet cases', rowHref: (r) => `#/cases/${r.id}`, sort: ['days', -1],
        empty: emptyState('check-circle', 'No quiet cases', 'Every live case has had attention recently.'), columns: [
          { k: 'client_name', label: 'Client', render: (r) => h`<div class="t-title">${r.client_name}</div><div class="t-sub">${label('case_type', r.case_type)}</div>` },
          { k: 'stage', label: 'Stage', value: (r) => label('stage', r.stage) }, { k: 'adviser_id', label: 'Adviser', value: (r) => userName(r.adviser_id) },
          { k: 'loan_amount', label: 'Loan', right: true, render: (r) => money(r.loan_amount), value: (r) => +r.loan_amount || null },
          { k: 'days', label: 'Days quiet', right: true, render: (r) => h`<b class="${r.days >= d.quiet_days + 7 ? 'risk-high' : 'risk-medium'}">${r.days}</b>` }] });
    } else if (t === 'sources') {
      const rows = d.sources.map((r) => Object.assign({}, r, { conv: r.leads ? Math.round((100 * r.converted) / r.leads) : 0 }));
      setHTML(body, h`<div class="grid grid-2"><section class="card"><div class="card-head"><h2>Leads by source</h2></div><div class="card-body">${rows.length ? barsHtml(rows, { value: (r) => +r.leads, labelOf: (r) => label('source', r.source) }) : emptyState('chart', 'No leads in this period', '')}</div></section><div data-t></div></div>`);
      mountTable($('[data-t]', body), { rows, noun: 'source', exportName: 'MAP lead sources', sort: ['leads', -1], columns: [
        { k: 'source', label: 'Source', value: (r) => label('source', r.source) }, { k: 'leads', label: 'Leads', right: true, value: (r) => +r.leads },
        { k: 'hot', label: 'HOT', right: true, value: (r) => +r.hot }, { k: 'converted', label: 'Converted', right: true, value: (r) => +r.converted },
        { k: 'lost', label: 'Lost', right: true, value: (r) => +r.lost }, { k: 'conv', label: 'Conversion', right: true, render: (r) => `${r.conv}%` }] });
    } else if (t === 'completions') {
      const rows = d.months;
      setHTML(body, h`<section class="card mb"><div class="card-head"><div><h2>Completions per month</h2><div class="sub">Last 12 months · hover a column for the figures</div></div></div><div class="card-body">
        ${columnsHtml(rows, { value: (r) => r.completions, labelOf: (r) => toDate(r.month + '-01').toLocaleDateString('en-GB', { month: 'short' }), tipOf: (r) => `${toDate(r.month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}: ${r.completions} completions, ${moneyShort(r.lent)} lent, ${money(r.fees)} fees` })}</div></section><div data-t></div>`);
      mountTable($('[data-t]', body), { rows, noun: 'month', exportName: 'MAP completions by month', columns: [
        { k: 'month', label: 'Month', render: (r) => toDate(r.month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) },
        { k: 'completions', label: 'Completions', right: true }, { k: 'lent', label: 'Lent', right: true, render: (r) => money(r.lent) }, { k: 'fees', label: 'Fees', right: true, render: (r) => money(r.fees) }] });
    } else {
      setHTML(body, d.lost.length ? h`<div class="grid grid-2"><section class="card"><div class="card-head"><h2>Why cases were lost</h2></div><div class="card-body">${barsHtml(d.lost, { value: (r) => +r.n, labelOf: (r) => r.reason })}</div></section><div data-t></div></div>`
        : h`<div class="card">${emptyState('check-circle', 'No lost cases in this period', '')}</div>`);
      if (d.lost.length) mountTable($('[data-t]', body), { rows: d.lost, noun: 'reason', exportName: 'MAP lost reasons', columns: [{ k: 'reason', label: 'Reason' }, { k: 'n', label: 'Cases', right: true, value: (r) => +r.n }] });
    }
  };
  const load = async () => { setHTML(body, loadingBlock()); d = await apiGet('reports', { from: state.from, to: state.to }); draw(); };
  on(el, 'click', '[data-tab]', (e, b) => { state.tab = b.dataset.tab; $$('[data-tab]', el).forEach((x) => x.setAttribute('aria-selected', String(x === b))); draw(); });
  ['#rp-from', '#rp-to'].forEach((s) => $(s, el).addEventListener('change', () => { state.from = $('#rp-from', el).value; state.to = $('#rp-to', el).value; load().catch(showError); }));
  on(el, 'click', '[data-seg="range"] button', (e, b) => {
    const t = today();
    state.to = t;
    state.from = b.dataset.val === 'month' ? t.slice(0, 8) + '01' : b.dataset.val === 'year' ? t.slice(0, 4) + '-01-01' : addDays(t, -365);
    $('#rp-from', el).value = state.from; $('#rp-to', el).value = state.to;
    load().catch(showError);
  });
  await load();
}

/* ---------- Email templates ---------- */
async function viewTemplates({ el, stale }) {
  const d = await apiGet('list', { entity: 'templates' });
  if (stale()) return;
  const reload = () => router();
  setHTML(el, h`${pageHead({ title: 'Email templates', sub: 'Ready-made emails filled in with the client\'s details. Copy them into your normal email; sending stays with you.',
    actions: h`<button class="btn btn-primary" type="button" data-new>${icon('plus')}New template</button>` })}
  <div class="grid grid-2">${d.rows.map((t) => h`<div class="card card-pad"><div class="row-between"><div><b>${t.name}</b><div class="small muted">${t.category || 'General'}${t.shared ? ' · shared with every office' : ` · ${S.officeName} only`}</div></div>
      <div class="row"><button class="btn btn-ghost btn-xs" type="button" data-edit="${t.id}" ${t.shared && !isManager() ? raw('disabled title="Only office managers can change shared templates"') : ''}>${icon('edit', 'ic-sm')}Edit</button>
      <button class="icon-btn" type="button" data-del="${t.id}" aria-label="Delete ${t.name}" ${t.shared && !isManager() ? raw('disabled') : ''}>${icon('trash', 'ic-sm')}</button></div></div>
    <div class="mt"><div class="label">Subject</div><div>${t.subject}</div></div><div class="pre small muted mt" style="max-height:140px;overflow:hidden">${t.body}</div></div>`)}</div>
  ${d.rows.length ? '' : h`<div class="card">${emptyState('mail', 'No templates', '')}</div>`}`);
  on(el, 'click', '[data-new]', () => {
    const fields = isManager() ? [...FIELDS.templates, { k: 'global', label: 'Share with every office', type: 'check' }] : FIELDS.templates;
    editRecord({ entity: 'templates', fields, title: 'New email template', onSaved: reload });
  });
  on(el, 'click', '[data-edit]', (e, b) => { const t = d.rows.find((x) => x.id === +b.dataset.edit); editRecord({ entity: 'templates', record: t, fields: FIELDS.templates, title: `Edit ${t.name}`, onSaved: reload }); });
  on(el, 'click', '[data-del]', (e, b) => { const t = d.rows.find((x) => x.id === +b.dataset.del); trashRecord('templates', t, `"${t.name}"`, reload); });
}

/* ---------- Lost cases ---------- */
async function viewLost({ el, query, stale }) {
  const d = await apiGet('lost');
  if (stale()) return;
  const tab = isProtectionOnly() ? 'leads' : (query.get('tab') || 'cases');
  const reload = () => router();
  setHTML(el, h`${pageHead(isProtectionOnly() ? { title: 'Lost leads', sub: 'Leads that did not go ahead, with the reason. Any of them can be reopened.' }
    : { title: 'Lost cases', sub: 'Cases and leads that did not go ahead, with the reason. Any of them can be reopened.' })}
  ${isProtectionOnly() ? '' : h`<div class="tabs" role="tablist"><button role="tab" type="button" data-tab="cases" aria-selected="${tab === 'cases'}">Cases (${d.cases.length})</button><button role="tab" type="button" data-tab="leads" aria-selected="${tab === 'leads'}">Leads (${d.leads.length})</button></div>`}<div data-t></div>`);
  if (tab === 'cases') {
    mountTable($('[data-t]', el), { rows: d.cases, noun: 'case', exportName: 'MAP lost cases', rowHref: (c) => `#/cases/${c.id}`, empty: emptyState('check-circle', 'No lost cases', ''), columns: [
      { k: 'client_name', label: 'Client', render: (c) => h`<div class="t-title">${c.client_name}</div><div class="t-sub">${label('case_type', c.case_type)} · was at ${label('stage', c.stage_before_lost || c.stage)}</div>` },
      { k: 'lost_reason', label: 'Reason' }, { k: 'loan_amount', label: 'Loan', right: true, render: (c) => money(c.loan_amount), value: (c) => +c.loan_amount || null },
      { k: 'adviser_id', label: 'Adviser', value: (c) => userName(c.adviser_id) }, { k: 'lost_at', label: 'Lost', render: (c) => fmtDate(c.lost_at) },
      { k: 'act', label: '', nosort: true, noexport: true, render: (c) => h`<button class="btn btn-secondary btn-xs" type="button" data-reopen="cases:${c.id}">${icon('undo', 'ic-sm')}Reopen</button>` }] });
  } else {
    mountTable($('[data-t]', el), { rows: d.leads, noun: 'lead', exportName: 'MAP lost leads', rowHref: (l) => `#/leads/${l.id}`, empty: emptyState('check-circle', 'No lost leads', ''), columns: [
      { k: 'name', label: 'Lead', value: fullName, render: (l) => h`<div class="t-title">${fullName(l)}</div><div class="t-sub">${label('enquiry_type', l.enquiry_type)}</div>` },
      { k: 'lost_reason', label: 'Reason' }, { k: 'source', label: 'Source', value: (l) => label('source', l.source) }, { k: 'lost_at', label: 'Lost', render: (l) => fmtDate(l.lost_at) },
      { k: 'act', label: '', nosort: true, noexport: true, render: (l) => h`<button class="btn btn-secondary btn-xs" type="button" data-reopen="leads:${l.id}">${icon('undo', 'ic-sm')}Reopen</button>` }] });
  }
  on(el, 'click', '[data-tab]', (e, b) => { location.hash = `#/lost${b.dataset.tab === 'cases' ? '' : '?tab=leads'}`; });
  on(el, 'click', '[data-reopen]', (e, b) => { const [en, id] = b.dataset.reopen.split(':'); reopen(en, +id, reload); });
}

/* ---------- Audit log ---------- */
async function viewAudit({ el }) {
  const state = { q: '', entity: '', user_id: '', all: false, rows: [], done: false };
  setHTML(el, h`${pageHead({ title: 'Audit log', sub: 'Full change history: who did what, and when. Every sign-in, change, deletion and download is recorded against the person who did it.' })}
  <div class="filters"><div class="search-pill"><input type="search" data-q placeholder="Search the log" aria-label="Search the audit log"><span class="go">${icon('search', 'ic-sm')}</span></div>
    <select class="select" data-entity aria-label="Record type"><option value="">Everything</option>${[['leads', 'Leads'], ['clients', 'Clients'], ['cases', 'Cases'], ['policies', 'Policies'], ['tasks', 'Tasks'], ['documents', 'Documents'], ['users', 'Logins'], ['event_contacts', 'Event contacts'], ['events', 'Events']]
      .filter(([k]) => !(isProtectionOnly() && ['cases', 'documents'].includes(k))).map(([k, t]) => h`<option value="${k}">${t}</option>`)}</select>
    <select class="select" data-user aria-label="Person"><option value="">Everyone</option>${S.meta.users.map((u) => h`<option value="${u.id}">${u.full_name}</option>`)}</select>
    ${isAdmin() ? h`<label class="check"><input type="checkbox" data-all><span>All offices</span></label>` : ''}</div>
  <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Who</th><th>What</th>${isAdmin() ? h`<th>Office</th>` : ''}</tr></thead><tbody data-rows></tbody></table></div>
    <div class="table-foot"><span data-count></span><button class="btn btn-ghost btn-sm" type="button" data-more>Load older entries</button></div></div>`);
  const tbody = $('[data-rows]', el);
  const fmtChange = (v) => (v === null || v === '' ? '(empty)' : String(v).length > 60 ? String(v).slice(0, 60) + '…' : String(v));
  const draw = () => {
    setHTML(tbody, state.rows.length ? state.rows.map((r) => h`<tr><td class="nowrap"><span title="${fmtDateTime(r.at)}">${fmtDateTime(r.at)}</span></td><td>${r.user_name || h`<span class="muted">Not signed in</span>`}<div class="t-sub">${r.ip || ''}</div></td>
      <td><div>${r.summary || r.action}</div>${r.changes ? h`<details class="small muted mt-sm"><summary style="cursor:pointer">${Object.keys(r.changes).length} field${Object.keys(r.changes).length === 1 ? '' : 's'} changed</summary>
        ${Object.entries(r.changes).map(([k, [a, b]]) => h`<div><b>${k}</b>: ${fmtChange(a)} → ${fmtChange(b)}</div>`)}</details>` : ''}</td>${isAdmin() ? h`<td>${r.office_name || '—'}</td>` : ''}</tr>`)
      : raw(`<tr><td colspan="4">${renderVal(emptyState('history', 'Nothing found', ''))}</td></tr>`));
    $('[data-count]', el).textContent = plural(state.rows.length, 'entry', 'entries');
    $('[data-more]', el).hidden = state.done;
  };
  const load = async (more) => {
    const params = { q: state.q, entity: state.entity, user_id: state.user_id, all: state.all };
    if (more && state.rows.length) params.before = state.rows[state.rows.length - 1].id;
    const res = await apiGet('audit', params);
    state.rows = more ? state.rows.concat(res.rows) : res.rows;
    state.done = res.rows.length < 200;
    draw();
  };
  $('[data-q]', el).addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load().catch(showError); }, 300));
  $('[data-entity]', el).addEventListener('change', (e) => { state.entity = e.target.value; load().catch(showError); });
  $('[data-user]', el).addEventListener('change', (e) => { state.user_id = e.target.value; load().catch(showError); });
  if ($('[data-all]', el)) $('[data-all]', el).addEventListener('change', (e) => { state.all = e.target.checked; load().catch(showError); });
  on(el, 'click', '[data-more]', () => load(true).catch(showError));
  await load();
}

/* ---------- Trash ---------- */
async function viewTrash({ el, stale }) {
  const d = await apiGet('trash');
  if (stale()) return;
  const names = { leads: 'Lead', clients: 'Client', cases: 'Case', policies: 'Policy', tasks: 'Task', documents: 'Document', introducers: 'Introducer', templates: 'Template' };
  setHTML(el, h`${pageHead({ title: 'Trash', sub: 'Deleted items can be restored. Anything deleted along with a client comes back when you restore the client.' })}<div data-t></div>`);
  mountTable($('[data-t]', el), {
    rows: d.rows, noun: 'item', empty: emptyState('trash', 'The trash is empty', ''), columns: [
      { k: 'entity', label: 'Type', value: (r) => names[r.entity] || r.entity },
      { k: 'name', label: 'Name', render: (r) => h`<span class="t-title">${r.name}</span>` },
      { k: 'deleted_at', label: 'Deleted', render: (r) => h`${fmtDateTime(r.deleted_at)}<div class="t-sub">${userName(r.deleted_by)}</div>` },
      { k: 'act', label: '', nosort: true, noexport: true, render: (r) => h`<div class="row" style="justify-content:flex-end"><button class="btn btn-secondary btn-xs" type="button" data-restore="${r.entity}:${r.id}">${icon('undo', 'ic-sm')}Restore</button>
        ${isManager() ? h`<button class="btn btn-danger btn-xs" type="button" data-purge="${r.entity}:${r.id}">Delete forever</button>` : ''}</div>` },
    ],
  });
  on(el, 'click', '[data-restore]', async (e, b) => {
    const [entity, id] = b.dataset.restore.split(':');
    try { await apiPost('restore', { entity, id: +id }); toast('Restored'); router(); } catch (err) { showError(err); }
  });
  on(el, 'click', '[data-purge]', async (e, b) => {
    const [entity, id] = b.dataset.purge.split(':');
    if (!(await confirmBox({ title: 'Delete forever?', message: 'This permanently removes it (and anything deleted with it). It cannot be undone.', confirmText: 'Delete forever', danger: true }))) return;
    try { await apiPost('purge', { entity, id: +id }); toast('Deleted for good'); router(); } catch (err) { showError(err); }
  });
}

/* ---------- Import, export & backups ---------- */
const IMPORT_FIELDS = {
  leads: [
    { k: 'first_name', label: 'First name', match: ['first name', 'forename', 'firstname', 'given name'] }, { k: 'last_name', label: 'Last name', match: ['last name', 'surname', 'lastname', 'family name'] },
    { k: 'name', label: 'Full name (if no first/last)', match: ['full name', 'name', 'client name', 'customer'] }, { k: 'email', label: 'Email', match: ['email', 'e-mail', 'email address'] },
    { k: 'phone', label: 'Phone', match: ['phone', 'mobile', 'telephone', 'tel', 'contact number', 'number'] }, { k: 'enquiry_type', label: 'Looking for', match: ['enquiry', 'type', 'looking for', 'product'] },
    { k: 'source', label: 'Source', match: ['source', 'channel'] }, { k: 'loan_amount', label: 'Loan amount', match: ['loan', 'mortgage amount', 'borrowing'] },
    { k: 'property_value', label: 'Property value', match: ['property value', 'value', 'price', 'purchase price'] }, { k: 'deposit', label: 'Deposit', match: ['deposit'] },
    { k: 'timescale', label: 'Timescale', match: ['timescale', 'when'] }, { k: 'notes', label: 'Notes', match: ['notes', 'comments', 'message'] },
  ],
  clients: [
    { k: 'title', label: 'Title', match: ['title'] }, { k: 'first_name', label: 'First name', match: ['first name', 'forename', 'firstname'] },
    { k: 'last_name', label: 'Last name', match: ['last name', 'surname', 'lastname'] }, { k: 'name', label: 'Full name (if no first/last)', match: ['full name', 'name', 'client name'] },
    { k: 'email', label: 'Email', match: ['email', 'e-mail'] }, { k: 'phone', label: 'Phone', match: ['phone', 'mobile', 'telephone', 'tel'] },
    { k: 'dob', label: 'Date of birth', match: ['dob', 'date of birth', 'birth'] }, { k: 'address', label: 'Address', match: ['address', 'street'] },
    { k: 'postcode', label: 'Postcode', match: ['postcode', 'post code', 'zip'] }, { k: 'annual_income', label: 'Annual income', match: ['income', 'salary'] },
    { k: 'next_review_date', label: 'Next review', match: ['review'] }, { k: 'notes', label: 'Notes', match: ['notes', 'comments'] },
  ],
};
function importWizard({ title, fields, onImport, extra }) {
  modal({
    title, size: 'wide', sub: 'Choose an Excel (.xlsx) or CSV file. The first row should hold the column names.',
    body: h`<div class="stack"><input type="file" class="input" accept=".xlsx,.csv,.txt" data-file>${extra || ''}<div data-map></div></div>`,
    foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-go disabled>${icon('upload')}Import</button>`,
    onMount(el, close) {
      let rows = null, map = {};
      $('[data-file]', el).addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          rows = await readSpreadsheet(f);
          if (rows.length < 2) throw new Error('That file has no rows under the header.');
          map = guessColumns(rows[0], fields);
          const header = rows[0];
          setHTML($('[data-map]', el), h`<div class="alert alert-info">${icon('info')}<div class="alert-text">${plural(rows.length - 1, 'row')} found. Check which column holds what, then import.</div></div>
            <div class="form-grid mt">${fields.map((fl) => h`<div class="field"><label>${fl.label}</label><select class="select" data-col="${fl.k}"><option value="">Not in this file</option>
              ${header.map((hc, i) => h`<option value="${i}" ${map[fl.k] === i ? raw('selected') : ''}>${hc || `Column ${colName(i)}`}</option>`)}</select></div>`)}</div>
            <div class="label mt">Preview</div><div class="table-wrap"><table class="table"><thead><tr>${header.map((hc) => h`<th>${hc}</th>`)}</tr></thead><tbody>${rows.slice(1, 4).map((r) => h`<tr>${header.map((_, i) => h`<td>${r[i] ?? ''}</td>`)}</tr>`)}</tbody></table></div>`);
          $('[data-go]', el).disabled = false;
        } catch (err) { setHTML($('[data-map]', el), h`<div class="alert alert-bad">${icon('alert')}<div class="alert-text">${err.message}</div></div>`); }
      });
      on(el, 'click', '[data-go]', async (e, btn) => {
        $$('[data-col]', el).forEach((s) => { map[s.dataset.col] = s.value === '' ? undefined : +s.value; });
        const out = rows.slice(1).map((r) => {
          const o = {};
          for (const fl of fields) if (map[fl.k] !== undefined) o[fl.k] = /dob|date/.test(fl.k) ? excelDate(r[map[fl.k]]) : r[map[fl.k]];
          return o;
        });
        busy(btn, true, 'Importing…');
        try { const res = await onImport(out, el); close(); importResult(res); } catch (err) { busy(btn, false); showError(err); }
      });
    },
  });
}
function importResult(res) {
  modal({
    title: 'Import finished', size: 'narrow',
    body: h`<div class="stack-sm"><div class="alert alert-ok">${icon('check')}<div class="alert-text"><b>${num(res.added)}</b> added</div></div>
      ${res.duplicates ? h`<div class="alert alert-info">${icon('info')}<div class="alert-text"><b>${num(res.duplicates)}</b> duplicates skipped (same email or phone already on file)</div></div>` : ''}
      ${res.no_consent ? h`<div class="alert alert-info">${icon('gdpr')}<div class="alert-text"><b>${num(res.no_consent)}</b> skipped because they did not consent to be contacted</div></div>` : ''}
      ${(res.error_count || res.invalid) ? h`<div class="alert alert-warn">${icon('alert')}<div class="alert-text"><b>${num(res.error_count || res.invalid)}</b> rows could not be imported:${(res.errors || []).slice(0, 8).map((er) => h`<br>Row ${er.row}: ${er.message}`)}</div></div>` : ''}</div>`,
    foot: h`<button class="btn btn-primary" type="button" data-close>Done</button>`,
    onClose: () => router(),
  });
}
async function viewData({ el, query }) {
  setHTML(el, h`${pageHead({ title: 'Import, export & backups', sub: 'Bring spreadsheets in, take Excel copies out, and download a full backup at any time.' })}
  <div class="grid grid-2">
    <section class="card"><div class="card-head"><div><h2>Import from Excel</h2><div class="sub">Duplicates (same email or phone) are skipped automatically</div></div></div><div class="card-body stack-sm">
      <button class="btn btn-secondary" type="button" data-import="leads">${icon('lead')}Import leads</button>
      <button class="btn btn-secondary" type="button" data-import="clients">${icon('users')}Import clients</button>
      <p class="small muted">Event sign-up lists go in through General Sales → Events, where consent is checked.</p></div></section>
    <section class="card"><div class="card-head"><div><h2>Export to Excel</h2><div class="sub">Everything in ${S.officeName}</div></div></div><div class="card-body"><div class="row">
      ${[['leads', 'Leads'], ['clients', 'Clients'], ['cases', 'Cases'], ['policies', 'Policies'], ['tasks', 'Tasks'], ['introducers', 'Introducers']].filter(([k]) => !(isProtectionOnly() && k === 'cases')).map(([k, t]) => h`<button class="btn btn-ghost btn-sm" type="button" data-export="${k}">${icon('sheet', 'ic-sm')}${t}</button>`)}</div></div></section>
    <section class="card"><div class="card-head"><div><h2>Backups</h2><div class="sub">A complete copy you can keep safe</div></div></div><div class="card-body stack-sm">
      ${isManager() ? h`<a class="btn btn-primary" href="${apiUrl('backup')}">${icon('download')}Download ${S.officeName} backup (JSON)</a>` : h`<p class="muted">The office logins (and office managers) can download the office's backup. Backups of every office are in the website admin panel.</p>`}
      <p class="small muted">Backups hold personal data. Store them securely and delete old copies you no longer need.</p></div></section>
  </div>`);
  on(el, 'click', '[data-import]', (e, b) => {
    const entity = b.dataset.import;
    importWizard({
      title: `Import ${entity}`, fields: IMPORT_FIELDS[entity].filter((f) => !(isProtectionOnly() && ['loan_amount', 'property_value', 'deposit'].includes(f.k))),
      extra: entity === 'leads' ? h`<label class="check"><input type="checkbox" data-tasks-opt><span>Create a "contact lead" task for each imported lead</span></label>` : '',
      onImport: (rows, m) => apiPost('importRows', { entity, rows, create_tasks: !!($('[data-tasks-opt]', m) && $('[data-tasks-opt]', m).checked) }),
    });
  });
  on(el, 'click', '[data-export]', async (e, b) => {
    const entity = b.dataset.export;
    try {
      const res = await apiGet('list', { entity, status: 'all' });
      const skip = new Set(['office_id', 'version', 'deleted_at', 'deleted_by', 'compliance_eval', 'risk', 'compliance', 'auto_key']);
      const keys = Object.keys(res.rows[0] || { id: '' }).filter((k) => !skip.has(k));
      const userCols = new Set(['adviser_id', 'administrator_id', 'assigned_to', 'created_by', 'updated_by', 'completed_by']);
      downloadXlsx(`MAP ${entity}`, [keys, ...res.rows.map((r) => keys.map((k) => (userCols.has(k) ? userName(r[k]) : r[k] === null ? '' : r[k])))]);
    } catch (err) { showError(err); }
  });
  if (query.get('entity')) { const b = $(`[data-import="${query.get('entity')}"]`, el); if (b) b.click(); setQuery({ entity: '' }); }
}

/* ---------- My account ---------- */
async function viewAccount({ el }) {
  const me = S.me;
  setHTML(el, h`${pageHead({ title: 'My account', sub: 'Your login and password.' })}
  <div class="grid grid-2"><section class="card"><div class="card-head"><h2>Your details</h2></div><div class="card-body">${kvHtml([
    ['Name', me.full_name], ['Username', me.username], ['Email', me.email], ['Role', me.is_office_account ? 'Office login' : me.role_label],
    ['Advice', me.advice_type === 'protection' ? 'Protection only' : 'Mortgage & protection'], ['Office', S.officeName || (me.role === 'sales' ? 'General Sales' : '')],
    ['Last sign-in', fmtDateTime(me.last_login_at)]])}
    <p class="small muted mt">To change your name, email, role, office or advice type, ask the MAP admin.</p></div></section>
  <section class="card"><div class="card-head"><h2>Change password</h2></div><div class="card-body"><form class="stack" id="cpw" novalidate>
    ${passwordInput('cp-cur', 'current_password', 'Current password', 'current-password')}
    ${passwordInput('cp-new', 'new_password', 'New password', 'new-password')}
    <div class="pw-meter" data-score="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div><div class="pw-rules"></div>
    ${passwordInput('cp-new2', 'new_password2', 'Confirm new password', 'new-password')}
    <div><button class="btn btn-primary" type="submit">${icon('check')}Change password</button></div></form></div></section></div>`);
  pwFeedback(el, '#cp-new');
  const form = $('#cpw', el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    if (!pwRulesOk(form.new_password.value)) return showFormError(form, { message: 'Use at least 8 characters with upper and lower case letters and a number.', payload: { field: 'new_password' } });
    if (form.new_password.value !== form.new_password2.value) return showFormError(form, { message: 'The two passwords do not match.', payload: { field: 'new_password2' } });
    const btn = $('button[type=submit]', form);
    busy(btn, true, 'Saving…');
    try { const r = await apiPost('changePassword', { current_password: form.current_password.value, new_password: form.new_password.value }); toast(r.message); form.reset(); } catch (err) { showFormError(form, err); }
    busy(btn, false);
  });
}
