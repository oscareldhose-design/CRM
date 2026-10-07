/* MAP Operating System: dashboard, leads, clients, cases, policies, pipeline, protection. */
'use strict';

function kpi(labelText, value, sub, href, alert) {
  return h`<a class="kpi ${alert ? 'kpi-alert' : ''}" href="${href}"><div class="k-label">${labelText}</div><div class="k-value">${value}</div><div class="k-sub">${sub}</div></a>`;
}
function kvHtml(pairs) {
  const shown = pairs.filter(([, v]) => v !== null && v !== undefined && v !== '' && !(v instanceof Raw && v.s === ''));
  if (!shown.length) return h`<p class="muted">Nothing recorded yet.</p>`;
  return h`<div class="kv">${shown.map(([k, v]) => h`<div><div class="k">${k}</div><div class="v">${v}</div></div>`)}</div>`;
}
const telLink = (p) => (p ? h`<a href="tel:${p.replace(/[^\d+]/g, '')}">${p}</a>` : '');
const mailLink = (e) => (e ? h`<a href="mailto:${e}">${e}</a>` : '');
function ltv(loan, value) { return loan && value ? `${Math.round((100 * loan) / value)}%` : ''; }
function age(dob) { const d = toDate(dob); if (!d) return ''; const n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return `${fmtDate(dob)} (age ${a})`; }
function daysLeftText(day) {
  if (!day) return '';
  const n = daysBetween(today(), day);
  return h`${fmtDate(day)} <span class="${n < 0 ? 'due-overdue' : n <= 30 ? 'due-today' : 'muted'} small">(${n < 0 ? `${-n} days ago` : n === 0 ? 'today' : `in ${n} days`})</span>`;
}
function wireSegments(el, onPick) {
  on(el, 'click', '[data-seg] button', (e, b) => {
    const seg = b.closest('[data-seg]');
    $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onPick(seg.dataset.seg, b.dataset.val);
  });
}
async function markLost(entity, record, onDone) {
  const reasons = S.meta.enums.lost_reason;
  modal({
    title: entity === 'cases' ? 'Mark case as lost' : 'Mark lead as lost', size: 'narrow',
    sub: `Lost work is kept in Tools → ${isProtectionOnly() ? 'Lost leads' : 'Lost cases'} and can be reopened at any time.`,
    body: h`<div class="field"><label for="lost-r">Reason</label><select class="select" id="lost-r">${reasons.map((r) => h`<option>${r}</option>`)}</select></div>
      <div class="field mt"><label for="lost-n">Details <span class="muted">(optional)</span></label><input class="input" id="lost-n" placeholder="${entity === 'cases' ? 'e.g. Went with Halifax direct' : 'e.g. Bought cover through their bank'}"></div>`,
    foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-danger" type="button" data-ok>${icon('x-circle')}Mark as lost</button>`,
    onMount(el, close) {
      on(el, 'click', '[data-ok]', async (e, btn) => {
        const reason = $('#lost-r', el).value + ($('#lost-n', el).value.trim() ? `: ${$('#lost-n', el).value.trim()}` : '');
        busy(btn, true);
        try {
          await apiPost('save', { entity, id: record.id, version: record.version, data: { status: 'lost', lost_reason: reason } });
          close(); toast('Marked as lost'); onDone();
        } catch (err) { busy(btn, false); showFormError(el, err); }
      });
    },
  });
}
async function reopen(entity, id, onDone) {
  try { await apiPost('reopen', { entity, id }); toast('Reopened'); onDone(); } catch (e) { showError(e); }
}
async function trashRecord(entity, record, what, after) {
  const ok = await confirmBox({ title: `Move ${what} to the trash?`, message: entity === 'clients' ? 'Their cases, policies, documents and tasks go to the trash too. You can restore everything from Tools → Trash.' : 'You can restore it from Tools → Trash.', confirmText: 'Move to trash', danger: true });
  if (!ok) return;
  try { await apiPost('delete', { entity, id: record.id }); toast('Moved to the trash'); after(); } catch (e) { showError(e); }
}

/* ---------- Dashboard ---------- */
async function viewDashboard({ el, stale }) {
  const d = await apiGet('dashboard');
  if (stale()) return;
  if (d.mode === 'protection') return dashboardProtection(el, d);
  const k = d.kpis;
  const first = (S.me.full_name || '').split(' ')[0];
  const reminderIcon = { high: 'alert', medium: 'clock', info: 'spark' };
  const stages = Object.entries(d.stages).filter(([s]) => s !== 'completed').map(([s, v]) => ({ s, ...v }));
  setHTML(el, h`${pageHead({
    title: `${greeting()}, ${first}`,
    sub: `Here's what needs attention in ${S.officeName} today, ${fmtDate(today(), { weekday: 'long', day: 'numeric', month: 'long' })}.`,
    actions: h`<button class="btn btn-secondary" type="button" data-act="lead">${icon('lead')}New lead</button><button class="btn btn-primary" type="button" data-act="task">${icon('plus')}New task</button>`,
  })}
  <div class="kpis">
    ${kpi('New leads · 7 days', num(k.new_leads_7d), `${num(k.hot_leads)} HOT lead${k.hot_leads === 1 ? '' : 's'} open`, '#/leads')}
    ${kpi('Active cases', num(k.active_cases), `${moneyShort(k.pipeline_value)} in the pipeline`, '#/pipeline')}
    ${kpi('Completions this month', num(k.completions_month), `${money(k.fees_month)} in fees`, '#/reports')}
    ${kpi('Tasks due today', num(k.tasks_today), `${num(k.tasks_overdue)} overdue`, '#/tasks?due=today', k.tasks_overdue > 0)}
    ${kpi('High-risk cases', num(k.at_risk), 'need action now', '#/pipeline?risk=high', k.at_risk > 0)}
    ${kpi('Remortgages due', num(k.remortgage_6m), 'fixed rates ending in 6 months', '#/radar')}
    ${kpi('Renewals · 30 days', num(k.renewals_30), 'insurance renewals due', '#/protection?status=renewals')}
    ${kpi('Opportunities', num(k.opportunities), 'future business to follow up', '#/opportunities')}
  </div>
  <div class="grid grid-main">
    <div class="stack">
      <section class="card"><div class="card-head"><div><h2>Needs attention now</h2><div class="sub">Worked out automatically from your office's records</div></div></div>
        <div class="card-body stack-sm">${d.reminders.length ? d.reminders.map((r) => h`<a class="reminder ${r.level}" href="${r.link}"><span class="r-icon">${icon(reminderIcon[r.level] || 'info')}</span><span>${r.text}</span>${icon('chevron-right', 'ic-chev')}</a>`)
          : emptyState('check-circle', 'Nothing urgent', 'No reminders right now. Nice work.')}</div></section>
      <section class="card"><div class="card-head"><div><h2>My tasks</h2><div class="sub">Overdue and due today, assigned to you</div></div><a href="#/tasks?mine=1" class="btn btn-ghost btn-sm">All my tasks</a></div>
        <div class="card-body" data-mytasks>${tasksHtml(d.my_tasks, { showWho: false, showLink: true })}</div></section>
    </div>
    <div class="stack">
      <section class="card"><div class="card-head"><div><h2>Pipeline by stage</h2><div class="sub">Live cases from enquiry to exchange</div></div><a href="#/pipeline" class="btn btn-ghost btn-sm">Open pipeline</a></div>
        <div class="card-body">${stages.some((s) => s.count) ? barsHtml(stages, { value: (r) => r.count, labelOf: (r) => label('stage', r.s) }) : emptyState('pipeline', 'No live cases', 'Cases appear here as soon as they are opened.')}</div></section>
      <section class="card"><div class="card-head"><div><h2>High-risk cases</h2><div class="sub">With the reason for the rating</div></div></div>
        <div class="card-body">${d.at_risk.length ? h`<div class="list">${d.at_risk.map((c) => h`<a class="list-item" href="#/cases/${c.id}"><span class="avatar avatar-sm">${initials(c.client_name)}</span>
          <span class="grow"><span class="li-title">${c.client_name}</span><br><span class="li-sub">${label('case_type', c.case_type)} · ${label('stage', c.stage)}</span><br><span class="small risk-high">${c.risk.reason}</span></span></a>`)}</div>`
          : emptyState('shield', 'No high-risk cases', '')}</div></section>
      <section class="card"><div class="card-head"><h2>Recent activity</h2></div>
        <div class="card-body">${d.recent.length ? h`<div class="list">${d.recent.map((a) => {
          const link = a.case_id ? `#/cases/${a.case_id}` : a.client_id ? `#/clients/${a.client_id}` : a.lead_id ? `#/leads/${a.lead_id}` : '#/dashboard';
          return h`<a class="list-item" href="${link}"><span class="tl-icon ${a.type === 'system' ? 'system' : ''}">${icon(ACT_ICON[a.type] || 'note', 'ic-sm')}</span>
            <span class="grow"><span class="li-title">${a.client_name || a.lead_name || ''}</span> <span class="li-sub">· ${a.user_name || 'CRM'} · ${relTime(a.created_at)}</span><br><span class="small ellipsis" style="display:block">${a.summary}</span></span></a>`;
        })}</div>` : emptyState('history', 'No activity yet', '')}</div></section>
    </div>
  </div>`);
  setTitle('Dashboard');
  on(el, 'click', '[data-act="lead"]', () => newLead());
  on(el, 'click', '[data-act="task"]', () => openTask(null, null, () => router()));
  wireTasks($('[data-mytasks]', el), () => d.my_tasks, () => router());
}

function recentActivityHtml(recent) {
  return recent.length ? h`<div class="list">${recent.map((a) => {
    const link = a.case_id && !isProtectionOnly() ? `#/cases/${a.case_id}` : a.client_id ? `#/clients/${a.client_id}` : a.lead_id ? `#/leads/${a.lead_id}` : a.policy_id ? `#/policies/${a.policy_id}` : '#/dashboard';
    return h`<a class="list-item" href="${link}"><span class="tl-icon ${a.type === 'system' ? 'system' : ''}">${icon(ACT_ICON[a.type] || 'note', 'ic-sm')}</span>
      <span class="grow"><span class="li-title">${a.client_name || a.lead_name || ''}</span> <span class="li-sub">· ${a.user_name || 'CRM'} · ${relTime(a.created_at)}</span><br><span class="small ellipsis" style="display:block">${a.summary}</span></span></a>`;
  })}</div>` : emptyState('history', 'No activity yet', '');
}
function dashboardProtection(el, d) {
  const k = d.kpis;
  const first = (S.me.full_name || '').split(' ')[0];
  const reminderIcon = { high: 'alert', medium: 'clock', info: 'spark' };
  setHTML(el, h`${pageHead({
    title: `${greeting()}, ${first}`,
    sub: `Here's what needs attention in ${S.officeName} today, ${fmtDate(today(), { weekday: 'long', day: 'numeric', month: 'long' })}.`,
    actions: h`<button class="btn btn-secondary" type="button" data-act="lead">${icon('lead')}New lead</button><button class="btn btn-primary" type="button" data-act="policy">${icon('shield')}New policy</button>`,
  })}
  <div class="kpis">
    ${kpi('New leads · 7 days', num(k.new_leads_7d), `${num(k.hot_leads)} HOT lead${k.hot_leads === 1 ? '' : 's'} open`, '#/leads')}
    ${kpi('Policies in force', num(k.policies_in_force), `${money(k.premiums, 2)} a month`, '#/protection?status=on_risk')}
    ${kpi('Quotes & applications', num(k.open_quotes), 'waiting to go on risk', '#/protection?status=quotes')}
    ${kpi('Renewals · 30 days', num(k.renewals_30), 'follow-up tasks are created', '#/protection?status=renewals', k.renewals_30 > 0)}
    ${kpi('Tasks due today', num(k.tasks_today), `${num(k.tasks_overdue)} overdue`, '#/tasks?due=today', k.tasks_overdue > 0)}
    ${kpi('Opportunities', num(k.opportunities), 'clients without cover and reviews', '#/opportunities')}
  </div>
  <div class="grid grid-main">
    <div class="stack">
      <section class="card"><div class="card-head"><div><h2>Needs attention now</h2><div class="sub">Worked out automatically from your office's records</div></div></div>
        <div class="card-body stack-sm">${d.reminders.length ? d.reminders.map((r) => h`<a class="reminder ${r.level}" href="${r.link}"><span class="r-icon">${icon(reminderIcon[r.level] || 'info')}</span><span>${r.text}</span>${icon('chevron-right', 'ic-chev')}</a>`)
          : emptyState('check-circle', 'Nothing urgent', 'No reminders right now. Nice work.')}</div></section>
      <section class="card"><div class="card-head"><div><h2>My tasks</h2><div class="sub">Overdue and due today, assigned to you</div></div><a href="#/tasks?mine=1" class="btn btn-ghost btn-sm">All my tasks</a></div>
        <div class="card-body" data-mytasks>${tasksHtml(d.my_tasks, { showWho: false, showLink: true })}</div></section>
    </div>
    <section class="card"><div class="card-head"><h2>Recent activity</h2></div><div class="card-body">${recentActivityHtml(d.recent)}</div></section>
  </div>`);
  setTitle('Dashboard');
  on(el, 'click', '[data-act="lead"]', () => newLead());
  on(el, 'click', '[data-act="policy"]', () => newPolicy());
  wireTasks($('[data-mytasks]', el), () => d.my_tasks, () => router());
}

/* ---------- Leads ---------- */
async function viewLeads({ el, query }) {
  const state = { status: query.get('status') || 'open', rating: query.get('rating') || '', mine: query.get('mine') === '1', q: query.get('q') || '' };
  setHTML(el, h`${pageHead({
    title: 'Leads', sub: 'Every enquiry, scored HOT, WARM or COLD automatically. One click converts a lead to a client.',
    actions: h`<a class="btn btn-ghost" href="#/data?entity=leads">${icon('upload')}Import</a><button class="btn btn-primary" type="button" data-new>${icon('plus')}New lead</button>`,
  })}
  <div class="filters">
    <div class="search-pill"><input type="search" data-q value="${state.q}" placeholder="Search name, email or phone" aria-label="Search leads"><span class="go">${icon('search', 'ic-sm')}</span></div>
    ${segmented('status', [['open', 'Open'], ['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'], ['converted', 'Converted'], ['lost', 'Lost'], ['all', 'All']], state.status)}
    ${segmented('rating', [['', 'All ratings'], ['HOT', 'HOT'], ['WARM', 'WARM'], ['COLD', 'COLD']], state.rating)}
    <label class="check"><input type="checkbox" data-mine ${state.mine ? raw('checked') : ''}><span>Mine only</span></label>
  </div><div data-table>${loadingBlock()}</div>`);
  let table;
  const load = async () => {
    setQuery({ status: state.status === 'open' ? '' : state.status, rating: state.rating, mine: state.mine ? '1' : '', q: state.q });
    const res = await apiGet('list', { entity: 'leads', status: state.status, rating: state.rating, mine: state.mine, q: state.q });
    const rows = res.rows;
    const opts = {
      rows, noun: 'lead', exportName: 'MAP leads', rowHref: (r) => `#/leads/${r.id}`, sort: null,
      empty: emptyState('lead', 'No leads match', 'Try a different filter, or add a new lead.'),
      columns: [
        { k: 'name', label: 'Name', value: (r) => fullName(r), render: (r) => h`<div class="t-title">${fullName(r)}</div><div class="t-sub">${r.phone || ''}${r.phone && r.email ? ' · ' : ''}${r.email || ''}</div>` },
        { k: 'score', label: 'Rating', render: (r) => ratingBadge(r.rating, r.score), exportValue: (r) => `${r.rating} (${r.score})` },
        { k: 'enquiry_type', label: 'Looking for', value: (r) => label('enquiry_type', r.enquiry_type), render: (r) => h`${label('enquiry_type', r.enquiry_type)}<div class="t-sub">${label('timescale', r.timescale)}</div>` },
        { k: 'source', label: 'Source', value: (r) => label('source', r.source) },
        ...(isProtectionOnly() ? [] : [{ k: 'loan_amount', label: 'Loan', right: true, render: (r) => money(r.loan_amount), value: (r) => +r.loan_amount || null }]),
        { k: 'adviser_id', label: 'Adviser', value: (r) => userName(r.adviser_id) },
        { k: 'status', label: 'Status', value: (r) => label('lead_status', r.status), render: (r) => statusBadge('lead_status', r.status) },
        { k: 'created_at', label: 'Added', render: (r) => h`<span title="${fmtDateTime(r.created_at)}">${relTime(r.created_at)}</span>`, exportValue: (r) => fmtDate(r.created_at) },
      ],
    };
    if (table) table.setRows(rows); else table = mountTable($('[data-table]', el), opts);
  };
  wireSegments(el, (name, val) => { state[name] = val; load().catch(showError); });
  $('[data-mine]', el).addEventListener('change', (e) => { state.mine = e.target.checked; load().catch(showError); });
  $('[data-q]', el).addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load().catch(showError); }, 250));
  on(el, 'click', '[data-new]', () => newLead());
  await load();
}

async function viewLead({ el, params, stale }) {
  const d = await apiGet('get', { entity: 'leads', id: params.id });
  if (stale()) return;
  const l = d.record;
  const reload = () => router();
  const target = { lead_id: l.id };
  const open = !['converted', 'lost'].includes(l.status);
  setTitle(fullName(l));
  setHTML(el, h`<a class="back-link" href="#/leads">${icon('chevron-left', 'ic-sm')}Leads</a>
  <div class="detail-head"><div class="avatar">${initials(fullName(l))}</div>
    <div class="grow"><h1>${fullName(l)}</h1><div class="meta">${ratingBadge(l.rating, l.score)}${statusBadge('lead_status', l.status)}
      ${l.enquiry_type ? h`<span class="chip">${label('enquiry_type', l.enquiry_type)}</span>` : ''}${l.source ? h`<span class="chip">${label('source', l.source)}</span>` : ''}</div></div>
    <div class="row">
      ${open ? h`<button class="btn btn-primary" type="button" data-act="convert">${icon('arrow-right')}Convert to client</button>` : ''}
      <button class="btn btn-secondary" type="button" data-act="log">${icon('phone')}Log call</button>
      <button class="btn btn-secondary" type="button" data-act="email">${icon('mail')}Email</button>
      <button class="btn btn-ghost" type="button" data-act="edit">${icon('edit')}Edit</button>
      ${l.status === 'lost' ? h`<button class="btn btn-ghost" type="button" data-act="reopen">${icon('undo')}Reopen</button>` : open ? h`<button class="btn btn-ghost" type="button" data-act="lost">${icon('x-circle')}Lost</button>` : ''}
      <button class="icon-btn" type="button" data-act="delete" aria-label="Delete" title="Move to trash">${icon('trash')}</button>
    </div></div>
  ${l.client_id ? h`<div class="alert alert-ok mb">${icon('check')}<div class="alert-text">Converted to a client. <a href="#/clients/${l.client_id}">Open their client file</a></div></div>` : ''}
  ${d.possible_duplicates && d.possible_duplicates.length && !l.client_id ? h`<div class="alert alert-warn mb">${icon('alert')}<div class="alert-text">This might already be a client: ${d.possible_duplicates.map((c, i) => h`${i ? ', ' : ''}<a href="#/clients/${c.id}">${fullName(c)}</a>`)}</div></div>` : ''}
  ${l.status === 'lost' && l.lost_reason ? h`<div class="alert alert-bad mb">${icon('x-circle')}<div class="alert-text">Lost: ${l.lost_reason}</div></div>` : ''}
  <div class="grid grid-main">
    <div class="stack">
      <section class="card"><div class="card-head"><h2>Enquiry</h2></div><div class="card-body">${kvHtml([
        ['Phone', telLink(l.phone)], ['Email', mailLink(l.email)], ['Looking for', label('enquiry_type', l.enquiry_type)], ['Timescale', label('timescale', l.timescale)],
        ...(isProtectionOnly() ? [] : [['Loan amount', money(l.loan_amount)], ['Property value', money(l.property_value)], ['Deposit', money(l.deposit)], ['Loan to value', ltv(l.loan_amount, l.property_value)]]),
        ['Employment', label('employment', l.employment)], ['Credit history', label('credit_issues', l.credit_issues)], ['Source', label('source', l.source)],
        ['Introducer', l.introducer_id ? h`<a href="#/introducers/${l.introducer_id}">${(S.meta.introducers.find((i) => +i.id === +l.introducer_id) || {}).name || 'Introducer'}</a>` : ''],
        ['Adviser', userName(l.adviser_id)], ['Administrator', userName(l.administrator_id)], ['Added', fmtDateTime(l.created_at)], ['Lead score', `${l.score} / 100 (${l.rating})`],
      ])}${l.notes ? h`<div class="mt"><div class="label">Notes</div><div class="pre mt-sm">${l.notes}</div></div>` : ''}</div></section>
      <section class="card"><div class="card-head"><h2>Tasks</h2><button class="btn btn-ghost btn-sm" type="button" data-act="task">${icon('plus')}Add task</button></div><div class="card-body" data-tasks>${tasksHtml(d.tasks)}</div></section>
    </div>
    <section class="card"><div class="card-head"><div><h2>Timeline</h2><div class="sub">Every call, note and email</div></div><button class="btn btn-ghost btn-sm" type="button" data-act="log">${icon('plus')}Log</button></div>
      <div class="card-body" data-timeline>${timelineHtml(d.activities)}</div></section>
  </div>`);
  wireTasks($('[data-tasks]', el), () => d.tasks, reload);
  wireTimeline($('[data-timeline]', el), reload);
  on(el, 'click', '[data-act]', async (e, b) => {
    const a = b.dataset.act;
    if (a === 'edit') editRecord({ entity: 'leads', record: l, fields: leadFields(), title: `Edit ${fullName(l)}`, onSaved: reload });
    if (a === 'log') logActivity(target, reload);
    if (a === 'email') emailComposer(target, reload, 'First contact');
    if (a === 'task') openTask(null, target, reload);
    if (a === 'lost') markLost('leads', l, reload);
    if (a === 'reopen') reopen('leads', l.id, reload);
    if (a === 'delete') trashRecord('leads', l, 'this lead', () => { location.hash = '#/leads'; });
    if (a === 'convert') {
      const caseTypes = S.meta.enums.case_type;
      const willCase = l.enquiry_type && caseTypes[l.enquiry_type] && !isProtectionOnly();
      const willQuote = ['protection', 'insurance', 'business_protection'].includes(l.enquiry_type);
      modal({
        title: `Convert ${fullName(l)} to a client`, size: 'narrow',
        body: h`<p class="muted">Creates a client file with their details. Their calls and notes move across with them.</p>
          ${willCase || willQuote ? h`<label class="check mt"><input type="checkbox" id="cv-case" checked><span>Also open a ${willCase ? `${label('case_type', l.enquiry_type)} mortgage case at Fact find` : 'protection / insurance quote'}</span></label>` : ''}`,
        foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-ok>${icon('arrow-right')}Convert</button>`,
        onMount(m, close) {
          on(m, 'click', '[data-ok]', async (ev, btn) => {
            busy(btn, true, 'Converting…');
            try {
              const cb = $('#cv-case', m);
              const res = await apiPost('convertLead', { id: l.id, create_case: cb ? cb.checked : false });
              close(); toast('Converted to a client');
              location.hash = res.case_id ? `#/cases/${res.case_id}` : `#/clients/${res.client_id}`;
            } catch (err) { busy(btn, false); showError(err); }
          });
        },
      });
    }
  });
}

/* ---------- Clients ---------- */
async function viewClients({ el, query }) {
  const state = { mine: query.get('mine') === '1', q: query.get('q') || '' };
  setHTML(el, h`${pageHead({
    title: 'Clients', sub: isProtectionOnly() ? 'Full profiles with their cover, plans held elsewhere and a timeline of every call and note.' : 'Full profiles with cases, key dates, plans held elsewhere and a timeline of every call and note.',
    actions: h`<a class="btn btn-ghost" href="#/data?entity=clients">${icon('upload')}Import</a><button class="btn btn-primary" type="button" data-new>${icon('plus')}New client</button>`,
  })}
  <div class="filters"><div class="search-pill"><input type="search" data-q value="${state.q}" placeholder="Search name, email, phone or postcode" aria-label="Search clients"><span class="go">${icon('search', 'ic-sm')}</span></div>
    <label class="check"><input type="checkbox" data-mine ${state.mine ? raw('checked') : ''}><span>Mine only</span></label></div>
  <div data-table>${loadingBlock()}</div>`);
  let table;
  const load = async () => {
    setQuery({ mine: state.mine ? '1' : '', q: state.q });
    const res = await apiGet('list', { entity: 'clients', mine: state.mine, q: state.q });
    const opts = {
      rows: res.rows, noun: 'client', exportName: 'MAP clients', rowHref: (r) => `#/clients/${r.id}`,
      empty: emptyState('users', 'No clients found', 'Convert a lead or add a client to get started.'),
      columns: [
        { k: 'last_name', label: 'Client', value: (r) => `${r.last_name} ${r.first_name}`, render: (r) => h`<div class="t-title">${fullName(r)}${r.erased_at ? h` <span class="badge">Erased</span>` : ''}</div><div class="t-sub">${r.email || ''}</div>`, exportValue: fullName },
        { k: 'phone', label: 'Phone' }, { k: 'postcode', label: 'Postcode' },
        { k: 'adviser_id', label: 'Adviser', value: (r) => userName(r.adviser_id) },
        ...(isProtectionOnly() ? [] : [{ k: 'active_cases', label: 'Live cases', right: true, value: (r) => +r.active_cases }]),
        { k: 'policies_in_force', label: 'Policies', right: true, value: (r) => +r.policies_in_force },
        { k: 'last_contact_at', label: 'Last contact', render: (r) => (r.last_contact_at ? relTime(r.last_contact_at) : h`<span class="muted">Never</span>`), exportValue: (r) => fmtDate(r.last_contact_at) },
        { k: 'next_review_date', label: 'Review due', render: (r) => fmtDate(r.next_review_date) },
      ],
    };
    if (table) table.setRows(res.rows); else table = mountTable($('[data-table]', el), opts);
  };
  $('[data-mine]', el).addEventListener('change', (e) => { state.mine = e.target.checked; load().catch(showError); });
  $('[data-q]', el).addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load().catch(showError); }, 250));
  on(el, 'click', '[data-new]', () => newClient());
  await load();
}

function caseCard(c) {
  return h`<a class="k-card risk-${c.risk && c.risk.level}" href="#/cases/${c.id}" style="margin:0">
    <div class="row-between"><span class="k-name">${label('case_type', c.case_type)}</span>${statusBadge('case_status', c.status)}</div>
    <div class="k-meta">${label('stage', c.stage)}${c.lender ? ' · ' + c.lender : ''}${c.loan_amount ? ' · ' + money(c.loan_amount) : ''}</div>
    ${stageTrack(c.stage)}
    ${c.status === 'active' ? h`<div class="k-reason risk-${c.risk.level}">${icon(c.risk.level === 'low' ? 'check' : 'alert', 'ic-sm')}${c.risk.reason}</div>` : ''}
    ${c.status === 'completed' && c.fixed_rate_end_date ? h`<div class="k-meta">Fixed rate ends ${fmtDate(c.fixed_rate_end_date)}</div>` : ''}
    <div class="k-meta mt-sm">Compliance: ${ragBadge(c.compliance_eval.rating)}</div></a>`;
}

async function viewClient({ el, params, query, stale }) {
  const d = await apiGet('get', { entity: 'clients', id: params.id });
  if (stale()) return;
  const c = d.record;
  const name = fullName(c);
  const tab = query.get('tab') || 'overview';
  const reload = () => router();
  const target = { client_id: c.id };
  setTitle(name);
  const openTasks = d.tasks.filter((t) => t.status === 'open');
  const openOpps = d.opportunities.filter((o) => o.status === 'open');
  const mortgage = !isProtectionOnly();
  const tabs = [['overview', 'Overview'], ...(mortgage ? [['cases', `Cases (${d.cases.length})`]] : []), ['protection', `Protection & insurance (${d.policies.length})`],
    ['timeline', 'Timeline'], ['tasks', `Tasks (${openTasks.length})`], ...(mortgage ? [['documents', `Documents (${d.documents.length})`]] : [])];
  let body;
  if ((tab === 'cases' || tab === 'documents') && !mortgage) {
    location.replace(`#/clients/${c.id}`);
    return;
  }
  if (tab === 'cases') {
    body = h`<div class="row-between mb"><p class="muted" style="margin:0">Every mortgage case for ${c.first_name}, with its risk rating.</p><button class="btn btn-primary btn-sm" type="button" data-act="case">${icon('plus')}New case</button></div>
      ${d.cases.length ? h`<div class="grid grid-3">${d.cases.map(caseCard)}</div>` : h`<div class="card">${emptyState('home', 'No cases yet', 'Open a mortgage case to track it through the pipeline.')}</div>`}`;
  } else if (tab === 'protection') {
    body = h`<div class="row-between mb"><p class="muted" style="margin:0">Life, critical illness, income protection, home, landlord and PMI, with renewals tracked.</p><button class="btn btn-primary btn-sm" type="button" data-act="policy">${icon('plus')}Add policy or quote</button></div>
      <div data-policies></div>`;
  } else if (tab === 'timeline') {
    body = h`<section class="card"><div class="card-head"><h2>Timeline</h2><div class="row"><button class="btn btn-secondary btn-sm" type="button" data-act="email">${icon('mail')}Email</button><button class="btn btn-primary btn-sm" type="button" data-act="log">${icon('plus')}Log a call or note</button></div></div>
      <div class="card-body" data-timeline>${timelineHtml(d.activities)}</div></section>`;
  } else if (tab === 'tasks') {
    body = h`<section class="card"><div class="card-head"><h2>Tasks</h2><button class="btn btn-primary btn-sm" type="button" data-act="task">${icon('plus')}Add task</button></div><div class="card-body" data-tasks>${tasksHtml(d.tasks)}</div></section>`;
  } else if (tab === 'documents') {
    body = h`<p class="muted">Documents are requested and tracked on each case.</p><div data-docs></div>`;
  } else {
    body = h`<div class="grid grid-main"><div class="stack">
      <section class="card"><div class="card-head"><h2>Personal details</h2></div><div class="card-body">${kvHtml([
        ['Phone', telLink(c.phone)], ['Email', mailLink(c.email)], ['Address', c.address], ['Postcode', c.postcode], ['Date of birth', age(c.dob)],
        ['Marital status', label('marital_status', c.marital_status)], ['Dependants', c.dependants === null ? '' : String(c.dependants)], ['Joint applicant', c.joint_applicant],
      ])}</div></section>
      <section class="card"><div class="card-head"><h2>Work, home and money</h2></div><div class="card-body">${kvHtml([
        ['Employment', label('employment', c.employment_status)], ['Annual income', money(c.annual_income)], ['Home situation', label('homeowner_status', c.homeowner_status)],
        ['Landlord', c.is_landlord ? 'Yes' : ''],
      ])}</div></section>
      <section class="card"><div class="card-head"><div><h2>Plans held elsewhere</h2><div class="sub">${isProtectionOnly() ? 'Cover and pensions with other firms' : 'Cover, pensions and mortgages with other firms'}</div></div></div><div class="card-body">${c.existing_plans ? h`<div class="pre">${c.existing_plans}</div>` : h`<p class="muted">None recorded.</p>`}</div></section>
      <section class="card"><div class="card-head"><h2>Relationship</h2></div><div class="card-body">${kvHtml([
        ['Adviser', userName(c.adviser_id)], ['Administrator', userName(c.administrator_id)], ['Source', label('source', c.source)],
        ['Introducer', c.introducer_id ? h`<a href="#/introducers/${c.introducer_id}">${(S.meta.introducers.find((i) => +i.id === +c.introducer_id) || {}).name || 'Introducer'}</a>` : ''],
        ['Next review', fmtDate(c.next_review_date)], ['Marketing consent', c.marketing_consent ? 'Yes' : 'No'], ['Client since', fmtDate(c.created_at)],
        ['Original lead', d.lead ? h`<a href="#/leads/${d.lead.id}">${d.lead.rating} lead, ${fmtDate(d.lead.created_at)}</a>` : ''],
      ])}${c.notes ? h`<div class="mt"><div class="label">Notes</div><div class="pre mt-sm">${c.notes}</div></div>` : ''}</div></section>
    </div><div class="stack">
      <section class="card card-accent"><div class="card-head"><div><h2>Opportunities</h2><div class="sub">Spotted automatically</div></div><a class="btn btn-ghost btn-sm" href="#/opportunities">All</a></div>
        <div class="card-body">${openOpps.length ? h`<div class="list">${openOpps.map((o) => h`<div class="list-item">${icon('spark')}<div><div class="li-title">${o.title}</div><div class="li-sub">${o.detail || ''}</div></div></div>`)}</div>` : h`<p class="muted">No open opportunities.</p>`}</div></section>
      ${mortgage ? h`<section class="card"><div class="card-head"><h2>Live cases</h2><button class="btn btn-ghost btn-sm" type="button" data-act="case">${icon('plus')}New</button></div>
        <div class="card-body stack-sm">${d.cases.filter((k) => k.status === 'active').map(caseCard)}${!d.cases.some((k) => k.status === 'active') ? h`<p class="muted">No live cases.</p>` : ''}</div></section>`
        : h`<section class="card"><div class="card-head"><h2>Cover</h2><button class="btn btn-ghost btn-sm" type="button" data-act="policy">${icon('plus')}Add</button></div>
        <div class="card-body">${d.policies.length ? h`<div class="list">${d.policies.map((p) => h`<a class="list-item" href="#/policies/${p.id}">${icon('shield')}<div class="grow"><div class="li-title">${label('policy_type', p.policy_type)}</div><div class="li-sub">${p.provider || ''} ${p.premium ? '· ' + money(p.premium, 2) + '/month' : ''}</div></div>${statusBadge('policy_status', p.status)}</a>`)}</div>` : h`<p class="muted">No cover recorded yet.</p>`}</div></section>`}
      <section class="card"><div class="card-head"><h2>Upcoming tasks</h2><button class="btn btn-ghost btn-sm" type="button" data-act="task">${icon('plus')}Add</button></div><div class="card-body" data-tasks>${tasksHtml(openTasks.slice(0, 6))}</div></section>
      <section class="card"><div class="card-head"><h2>Latest activity</h2><button class="btn btn-ghost btn-sm" type="button" data-act="log">${icon('plus')}Log</button></div><div class="card-body" data-timeline>${timelineHtml(d.activities.slice(0, 5))}</div></section>
    </div></div>`;
  }
  setHTML(el, h`<a class="back-link" href="#/clients">${icon('chevron-left', 'ic-sm')}Clients</a>
  <div class="detail-head"><div class="avatar">${initials(name)}</div>
    <div class="grow"><h1>${name}</h1><div class="meta">${c.erased_at ? h`<span class="badge badge-bad">Personal data erased</span>` : ''}
      ${c.adviser_id ? h`<span class="chip">${icon('user', 'ic-sm')}${userName(c.adviser_id)}</span>` : ''}${c.is_landlord ? h`<span class="chip">Landlord</span>` : ''}
      ${c.postcode ? h`<span class="chip">${c.postcode}</span>` : ''}${c.phone ? h`<span class="chip">${telLink(c.phone)}</span>` : ''}</div></div>
    <div class="row">
      <button class="btn btn-secondary" type="button" data-act="log">${icon('phone')}Log call</button>
      <button class="btn btn-secondary" type="button" data-act="email">${icon('mail')}Email</button>
      ${mortgage ? h`<button class="btn btn-primary" type="button" data-act="case">${icon('plus')}New case</button>` : h`<button class="btn btn-primary" type="button" data-act="policy">${icon('shield')}New policy</button>`}
      <button class="btn btn-ghost" type="button" data-act="edit">${icon('edit')}Edit</button>
      ${isManager() && !c.erased_at ? h`<button class="icon-btn" type="button" data-act="erase" aria-label="Erase personal data (GDPR)" title="Erase personal data (GDPR)">${icon('gdpr')}</button>` : ''}
      <button class="icon-btn" type="button" data-act="delete" aria-label="Move to trash" title="Move to trash">${icon('trash')}</button>
    </div></div>
  <div class="tabs" role="tablist">${tabs.map(([k, t]) => h`<button role="tab" type="button" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`)}</div>
  ${body}`);
  on(el, 'click', '[data-tab]', (e, b) => { location.hash = `#/clients/${c.id}${b.dataset.tab === 'overview' ? '' : '?tab=' + b.dataset.tab}`; });
  const tasksEl = $('[data-tasks]', el);
  if (tasksEl) wireTasks(tasksEl, () => d.tasks, reload);
  const tl = $('[data-timeline]', el);
  if (tl) wireTimeline(tl, reload);
  const pol = $('[data-policies]', el);
  if (pol) {
    mountTable(pol, {
      rows: d.policies, noun: 'policy', rowHref: (p) => `#/policies/${p.id}`,
      empty: emptyState('shield', 'No policies or quotes yet', 'Add protection or insurance to track it and its renewal.'),
      columns: [
        { k: 'policy_type', label: 'Cover', value: (p) => label('policy_type', p.policy_type), render: (p) => h`<div class="t-title">${label('policy_type', p.policy_type)}</div><div class="t-sub">${p.provider || ''}</div>` },
        { k: 'status', label: 'Status', render: (p) => statusBadge('policy_status', p.status) },
        { k: 'premium', label: 'Monthly', right: true, render: (p) => money(p.premium, 2), value: (p) => +p.premium || null },
        { k: 'sum_assured', label: 'Cover', right: true, render: (p) => money(p.sum_assured), value: (p) => +p.sum_assured || null },
        { k: 'renewal_date', label: 'Renewal', render: (p) => daysLeftText(p.renewal_date) },
      ],
    });
  }
  const docs = $('[data-docs]', el);
  if (docs) {
    mountTable(docs, {
      rows: d.documents, noun: 'document', rowHref: (x) => (x.case_id ? `#/cases/${x.case_id}` : null),
      empty: emptyState('file', 'No documents requested yet', 'Open a case and use "Request standard pack".'),
      columns: [
        { k: 'name', label: 'Document', render: (x) => h`<span class="t-title">${x.name}</span>` },
        { k: 'case_id', label: 'Case', value: (x) => { const k = d.cases.find((cc) => cc.id === x.case_id); return k ? label('case_type', k.case_type) : ''; } },
        { k: 'status', label: 'Status', render: (x) => statusBadge('document_status', x.status) },
        { k: 'requested_at', label: 'Requested', render: (x) => fmtDate(x.requested_at) },
        { k: 'received_at', label: 'Received', render: (x) => fmtDate(x.received_at) },
        { k: 'expiry_date', label: 'Expires', render: (x) => fmtDate(x.expiry_date) },
      ],
    });
  }
  on(el, 'click', '[data-act]', async (e, b) => {
    const a = b.dataset.act;
    if (a === 'edit') editRecord({ entity: 'clients', record: c, fields: FIELDS.clients, title: `Edit ${name}`, onSaved: reload });
    if (a === 'log') logActivity(target, reload);
    if (a === 'email') emailComposer(target, reload);
    if (a === 'task') openTask(null, target, reload);
    if (a === 'case') newCase(c.id);
    if (a === 'policy') newPolicy(c.id, reload);
    if (a === 'delete') trashRecord('clients', c, name, () => { location.hash = '#/clients'; });
    if (a === 'erase') {
      const ok = await confirmBox({ title: 'Erase personal data?', danger: true, confirmText: 'Erase permanently', typed: 'ERASE',
        message: `GDPR right to erasure: ${name}'s name, contact details, notes and call summaries are removed for good. Anonymous case figures are kept for reporting. This cannot be undone.` });
      if (!ok) return;
      try { await apiPost('eraseClient', { id: c.id, confirm: 'ERASE' }); toast('Personal data erased'); reload(); } catch (err) { showError(err); }
    }
  });
}

/* ---------- Mortgage case ---------- */
async function viewCase({ el, params, stale }) {
  const d = await apiGet('get', { entity: 'cases', id: params.id });
  if (stale()) return;
  const c = d.record;
  const cl = d.client || {};
  const name = fullName(cl);
  const reload = () => router();
  const target = { case_id: c.id };
  const stages = Object.keys(S.meta.enums.stage);
  const next = c.status === 'active' ? stages[stages.indexOf(c.stage) + 1] : null;
  const comp = c.compliance_eval;
  setTitle(`${name}: ${label('case_type', c.case_type)}`);
  const risk = c.risk;
  setHTML(el, h`<a class="back-link" href="#/clients/${cl.id}?tab=cases">${icon('chevron-left', 'ic-sm')}${name}</a>
  <div class="detail-head"><div class="avatar">${initials(name)}</div>
    <div class="grow"><h1>${name}</h1><div class="meta"><span class="chip">${icon('home', 'ic-sm')}${label('case_type', c.case_type)}</span>${statusBadge('case_status', c.status)}
      <span class="badge badge-brand">${label('stage', c.stage)}</span>${riskBadge(risk)}<span class="chip">Compliance ${ragBadge(comp.rating)}</span></div></div>
    <div class="row">
      ${next ? h`<button class="btn btn-primary" type="button" data-act="advance">${icon('arrow-right')}Move to ${label('stage', next)}</button>` : ''}
      <button class="btn btn-secondary" type="button" data-act="log">${icon('phone')}Log call</button>
      <button class="btn btn-secondary" type="button" data-act="email">${icon('mail')}Email</button>
      <button class="btn btn-ghost" type="button" data-act="edit">${icon('edit')}Edit</button>
      ${c.status === 'lost' ? h`<button class="btn btn-ghost" type="button" data-act="reopen">${icon('undo')}Reopen</button>` : c.status === 'active' ? h`<button class="btn btn-ghost" type="button" data-act="lost">${icon('x-circle')}Lost</button>` : ''}
      <button class="icon-btn" type="button" data-act="delete" aria-label="Move to trash" title="Move to trash">${icon('trash')}</button>
    </div></div>
  <div class="card card-pad mb"><div class="row-between"><b>${label('stage', c.stage)}</b><span class="muted small">Stage ${stages.indexOf(c.stage) + 1} of ${stages.length}${c.stage_changed_at ? ` · since ${fmtDate(c.stage_changed_at)}` : ''}</span></div>${stageTrack(c.stage)}
    <div class="row-between tiny muted mt-sm">${stages.map((s) => h`<span>${label('stage', s).split(' ')[0]}</span>`)}</div></div>
  ${c.status === 'active' && risk.reasons.length ? h`<div class="alert ${risk.level === 'high' ? 'alert-bad' : 'alert-warn'} mb">${icon('alert')}<div class="alert-text"><b>${risk.level === 'high' ? 'High risk' : 'Medium risk'}:</b> ${risk.reasons.join(' · ')}</div></div>` : ''}
  ${c.status === 'lost' ? h`<div class="alert alert-bad mb">${icon('x-circle')}<div class="alert-text">Lost${c.lost_reason ? ': ' + c.lost_reason : ''}. You can reopen it at any time.</div></div>` : ''}
  <div class="grid grid-main"><div class="stack">
    <section class="card"><div class="card-head"><h2>Case details</h2><button class="btn btn-ghost btn-sm" type="button" data-act="edit">${icon('edit')}Edit</button></div><div class="card-body">${kvHtml([
      ['Lender', c.lender], ['Product', c.product], ['Loan amount', money(c.loan_amount)], ['Property value', money(c.property_value)], ['Loan to value', ltv(c.loan_amount, c.property_value)],
      ['Rate', c.rate ? `${c.rate}%${c.rate_type ? ' ' + label('rate_type', c.rate_type).toLowerCase() : ''}` : ''], ['Initial period', c.fixed_term_years ? `${c.fixed_term_years} years` : ''],
      ['Fixed rate ends', daysLeftText(c.fixed_rate_end_date)], ['Mortgage term', c.term_years ? `${c.term_years} years` : ''], ['Property', c.property_address],
      ['Application', fmtDate(c.application_date)], ['Offer issued', fmtDate(c.offer_date)], ['Offer expires', c.status === 'active' ? daysLeftText(c.offer_expiry_date) : fmtDate(c.offer_expiry_date)],
      ['Expected completion', c.status === 'active' ? daysLeftText(c.expected_completion_date) : fmtDate(c.expected_completion_date)], ['Completed', fmtDate(c.completion_date)],
      ['Proc fee', money(c.proc_fee)], ['Broker fee', money(c.broker_fee)], ['Adviser', userName(c.adviser_id)], ['Administrator', userName(c.administrator_id)],
      ['Next action', c.next_action ? h`${c.next_action}${c.next_action_date ? h` <span class="muted small">(${fmtDate(c.next_action_date)})</span>` : ''}` : ''],
    ])}${c.notes ? h`<div class="mt"><div class="label">Notes</div><div class="pre mt-sm">${c.notes}</div></div>` : ''}</div></section>
    <section class="card"><div class="card-head"><div><h2>Documents</h2><div class="sub">Requested, received or expired</div></div><div class="row">
      <button class="btn btn-secondary btn-sm" type="button" data-act="pack">${icon('file')}Request standard pack</button><button class="btn btn-ghost btn-sm" type="button" data-act="doc">${icon('plus')}Add</button></div></div>
      <div class="card-body">${d.documents.length ? h`<div class="list">${d.documents.map((x) => h`<div class="list-item"><span class="tl-icon">${icon('file', 'ic-sm')}</span>
        <div class="grow"><div class="li-title">${x.name}</div><div class="li-sub">Requested ${fmtDate(x.requested_at)}${x.received_at ? ` · received ${fmtDate(x.received_at)}` : ''}${x.expiry_date ? ` · expires ${fmtDate(x.expiry_date)}` : ''}${x.notes ? ` · ${x.notes}` : ''}</div></div>
        <select class="select" style="width:auto;min-height:36px;padding-top:4px;padding-bottom:4px" data-doc-status="${x.id}" aria-label="Status of ${x.name}">${enumOptions('document_status').map(([k, t]) => h`<option value="${k}" ${k === x.status ? raw('selected') : ''}>${t}</option>`)}</select>
        <button class="icon-btn" type="button" data-doc-edit="${x.id}" aria-label="Edit ${x.name}">${icon('edit', 'ic-sm')}</button></div>`)}</div>`
        : emptyState('file', 'No documents requested', 'Use "Request standard pack" to ask for ID, proof of address, payslips and bank statements in one go.')}</div></section>
    <section class="card"><div class="card-head"><h2>Timeline</h2><button class="btn btn-ghost btn-sm" type="button" data-act="log">${icon('plus')}Log</button></div><div class="card-body" data-timeline>${timelineHtml(d.activities)}</div></section>
  </div><div class="stack">
    <section class="card card-accent"><div class="card-head"><div><h2>Compliance checklist</h2><div class="sub">${comp.done} of ${comp.required} required items done</div></div>${ragBadge(comp.rating)}</div>
      <div class="card-body"><div class="progress mb"><span style="width:${comp.required ? Math.round((100 * comp.done) / comp.required) : 100}%"></span></div>
      <div class="checklist">${comp.items.map((it) => h`<label class="ci ${it.required ? '' : 'later'}">
        <input type="checkbox" class="check" style="width:18px;height:18px;accent-color:var(--brand);margin-top:2px" data-comp="${it.key}" ${it.done ? raw('checked') : ''} ${it.auto ? raw('disabled') : ''}>
        <span><span class="ci-label">${it.label}</span>${it.overdue ? h` <span class="badge badge-bad">Overdue</span>` : ''}<br>
        <span class="ci-sub">${it.auto ? `Automatic: ${it.auto}` : it.done && it.by ? `Ticked by ${it.by}, ${fmtDate(it.at)}` : it.required ? `Required from ${label('stage', it.from)}` : `Needed from ${label('stage', it.from)}`}</span></span></label>`)}</div></div></section>
    <section class="card"><div class="card-head"><h2>Tasks</h2><button class="btn btn-ghost btn-sm" type="button" data-act="task">${icon('plus')}Add</button></div><div class="card-body" data-tasks>${tasksHtml(d.tasks)}</div></section>
    <section class="card"><div class="card-head"><div><h2>Protection & insurance</h2><div class="sub">For ${cl.first_name || 'the client'}</div></div><button class="btn btn-ghost btn-sm" type="button" data-act="policy">${icon('plus')}Add</button></div>
      <div class="card-body">${d.policies.length ? h`<div class="list">${d.policies.map((p) => h`<a class="list-item" href="#/policies/${p.id}">${icon('shield')}<div class="grow"><div class="li-title">${label('policy_type', p.policy_type)}</div><div class="li-sub">${p.provider || ''} ${p.premium ? '· ' + money(p.premium, 2) + '/month' : ''}</div></div>${statusBadge('policy_status', p.status)}</a>`)}</div>`
        : h`<p class="muted">No protection recorded. Protection should be discussed on every case.</p>`}</div></section>
  </div></div>`);
  wireTasks($('[data-tasks]', el), () => d.tasks, reload);
  wireTimeline($('[data-timeline]', el), reload);
  on(el, 'change', '[data-comp]', async (e, cb) => {
    try { await apiPost('complianceSet', { case_id: c.id, key: cb.dataset.comp, done: cb.checked }); reload(); } catch (err) { cb.checked = !cb.checked; showError(err); }
  });
  on(el, 'change', '[data-doc-status]', async (e, sel) => {
    const doc = d.documents.find((x) => +x.id === +sel.dataset.docStatus);
    try { await apiPost('save', { entity: 'documents', id: doc.id, version: doc.version, data: { status: sel.value } }); toast(`${doc.name}: ${label('document_status', sel.value)}`); reload(); } catch (err) { showError(err); reload(); }
  });
  on(el, 'click', '[data-doc-edit]', (e, b) => {
    const doc = d.documents.find((x) => +x.id === +b.dataset.docEdit);
    editRecord({ entity: 'documents', record: doc, fields: FIELDS.documents, title: doc.name, onSaved: reload });
  });
  on(el, 'click', '[data-act]', async (e, b) => {
    const a = b.dataset.act;
    if (a === 'edit') editRecord({ entity: 'cases', record: c, fields: FIELDS.cases, title: `Edit case: ${name}`, onSaved: reload });
    if (a === 'log') logActivity(target, reload);
    if (a === 'email') emailComposer(target, reload, c.stage === 'offer' ? 'Offer issued' : c.status === 'completed' ? 'Completion congratulations' : 'Documents needed');
    if (a === 'task') openTask(null, target, reload);
    if (a === 'lost') markLost('cases', c, reload);
    if (a === 'reopen') reopen('cases', c.id, reload);
    if (a === 'policy') newPolicy(cl.id, reload, c.id);
    if (a === 'delete') trashRecord('cases', c, 'this case', () => { location.hash = `#/clients/${cl.id}?tab=cases`; });
    if (a === 'doc') editRecord({ entity: 'documents', fields: FIELDS.documents, title: 'Request a document', fixed: { case_id: c.id }, defaults: { status: 'requested', requested_at: today() }, onSaved: reload });
    if (a === 'pack') {
      try { const r = await apiPost('documentPack', { case_id: c.id }); toast(r.added ? `${r.added} documents requested` : 'The standard documents are already on this case'); reload(); } catch (err) { showError(err); }
    }
    if (a === 'advance') {
      if (next === 'completed') {
        const years = +c.fixed_term_years || 0;
        modal({
          title: 'Mark as completed', size: 'narrow',
          sub: 'The CRM books a post-completion call and records when the fixed rate ends, so the remortgage is never missed.',
          body: h`<div class="form-grid"><div class="field"><label for="cp-d">Completion date</label><input class="input" type="date" id="cp-d" value="${today()}"></div>
            <div class="field"><label for="cp-y">Fixed / initial period (years)</label><input class="input" id="cp-y" inputmode="numeric" value="${years || ''}"></div>
            <div class="field full"><label for="cp-e">Fixed rate ends</label><input class="input" type="date" id="cp-e" value="${c.fixed_rate_end_date || ''}"><div class="field-hint">Leave blank to work it out from the completion date and the fixed period.</div></div></div>`,
          foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-ok>${icon('check')}Complete case</button>`,
          onMount(m, close) {
            on(m, 'click', '[data-ok]', async (ev, btn) => {
              busy(btn, true, 'Saving…');
              try {
                await apiPost('save', { entity: 'cases', id: c.id, version: c.version, data: { stage: 'completed', completion_date: $('#cp-d', m).value, fixed_term_years: $('#cp-y', m).value, fixed_rate_end_date: $('#cp-e', m).value } });
                close(); toast('Completed. Post-completion call booked.'); reload();
              } catch (err) { busy(btn, false); showFormError(m, err); }
            });
          },
        });
        return;
      }
      try {
        await apiPost('save', { entity: 'cases', id: c.id, version: c.version, data: { stage: next } });
        toast(next === 'offer' ? 'Offer issued. Completion-prep task created for the administrator.' : `Moved to ${label('stage', next)}`);
        reload();
      } catch (err) { showError(err); if (err.code === 'conflict') reload(); }
    }
  });
}

/* ---------- Policy ---------- */
async function viewPolicy({ el, params, stale }) {
  const d = await apiGet('get', { entity: 'policies', id: params.id });
  if (stale()) return;
  const p = d.record;
  const cl = d.client || {};
  const name = fullName(cl);
  const reload = () => router();
  const target = { policy_id: p.id };
  setTitle(`${name}: ${label('policy_type', p.policy_type)}`);
  setHTML(el, h`<a class="back-link" href="#/clients/${cl.id}?tab=protection">${icon('chevron-left', 'ic-sm')}${name}</a>
  <div class="detail-head"><div class="avatar">${icon('shield')}</div><div class="grow"><h1>${label('policy_type', p.policy_type)}</h1>
    <div class="meta"><a class="chip" href="#/clients/${cl.id}">${icon('user', 'ic-sm')}${name}</a>${statusBadge('policy_status', p.status)}${p.provider ? h`<span class="chip">${p.provider}</span>` : ''}</div></div>
    <div class="row"><button class="btn btn-secondary" type="button" data-act="log">${icon('phone')}Log call</button><button class="btn btn-secondary" type="button" data-act="email">${icon('mail')}Email</button>
      <button class="btn btn-primary" type="button" data-act="edit">${icon('edit')}Edit</button><button class="icon-btn" type="button" data-act="delete" aria-label="Move to trash">${icon('trash')}</button></div></div>
  <div class="grid grid-main"><div class="stack">
    <section class="card"><div class="card-head"><h2>Policy details</h2></div><div class="card-body">${kvHtml([
      ['Status', label('policy_status', p.status)], ['Provider', p.provider], ['Policy number', p.policy_number], ['Monthly premium', money(p.premium, 2)],
      ['Cover / sum assured', money(p.sum_assured)], ['Term', p.term_years ? `${p.term_years} years` : ''], ['Quoted', fmtDate(p.quote_date)], ['Started', fmtDate(p.start_date)],
      ['Renewal', daysLeftText(p.renewal_date)], ['Commission', money(p.commission, 2)], ['Adviser', userName(p.adviser_id)],
    ])}${p.notes ? h`<div class="mt"><div class="label">Notes</div><div class="pre mt-sm">${p.notes}</div></div>` : ''}</div></section>
    <section class="card"><div class="card-head"><h2>Timeline</h2><button class="btn btn-ghost btn-sm" type="button" data-act="log">${icon('plus')}Log</button></div><div class="card-body" data-timeline>${timelineHtml(d.activities)}</div></section>
  </div><section class="card"><div class="card-head"><h2>Tasks</h2><button class="btn btn-ghost btn-sm" type="button" data-act="task">${icon('plus')}Add</button></div><div class="card-body" data-tasks>${tasksHtml(d.tasks)}</div></section></div>`);
  wireTasks($('[data-tasks]', el), () => d.tasks, reload);
  wireTimeline($('[data-timeline]', el), reload);
  on(el, 'click', '[data-act]', (e, b) => {
    const a = b.dataset.act;
    if (a === 'edit') editRecord({ entity: 'policies', record: p, fields: FIELDS.policies, title: `Edit ${label('policy_type', p.policy_type)}`, onSaved: reload });
    if (a === 'log') logActivity(target, reload);
    if (a === 'email') emailComposer(target, reload, ['home', 'landlord', 'pmi'].includes(p.policy_type) ? 'Insurance renewal' : 'Protection review');
    if (a === 'task') openTask(null, Object.assign({ client_id: cl.id }, target), reload);
    if (a === 'delete') trashRecord('policies', p, 'this policy', () => { location.hash = `#/clients/${cl.id}?tab=protection`; });
  });
}

/* ---------- Mortgage pipeline ---------- */
async function viewPipeline({ el, query, stale }) {
  const state = { view: query.get('view') || 'board', mine: query.get('mine') === '1', risk: query.get('risk') || '' };
  setHTML(el, h`${pageHead({
    title: 'Mortgage pipeline', sub: 'Every case from enquiry to completion, with a risk rating and the reason for it.',
    actions: h`<button class="btn btn-primary" type="button" data-new>${icon('plus')}New case</button>`,
  })}
  <div class="filters">${segmented('view', [['board', 'Board'], ['list', 'List']], state.view)}
    ${segmented('risk', [['', 'All cases'], ['high', 'High risk'], ['medium', 'Medium risk'], ['low', 'On track']], state.risk)}
    <label class="check"><input type="checkbox" data-mine ${state.mine ? raw('checked') : ''}><span>Mine only</span></label></div>
  <div data-body>${loadingBlock()}</div>`);
  const body = $('[data-body]', el);
  let data;
  const draw = () => {
    setQuery({ view: state.view === 'board' ? '' : state.view, risk: state.risk, mine: state.mine ? '1' : '' });
    const rows = data.rows.filter((c) => !state.risk || c.risk.level === state.risk);
    if (state.view === 'board') {
      const stages = Object.keys(S.meta.enums.stage).filter((s) => s !== 'completed');
      setHTML(body, h`<div class="kanban">${stages.map((s) => {
        const list = rows.filter((c) => c.stage === s);
        return h`<div class="k-col"><div class="k-col-head"><b>${label('stage', s)}</b><span>${list.length} · ${moneyShort(list.reduce((t, c) => t + (+c.loan_amount || 0), 0))}</span></div>
          ${list.map((c) => h`<a class="k-card risk-${c.risk.level}" href="#/cases/${c.id}"><div class="k-name">${c.client_name}</div>
            <div class="k-meta">${label('case_type', c.case_type)}${c.loan_amount ? ' · ' + money(c.loan_amount) : ''}${c.lender ? ' · ' + c.lender : ''}</div>
            <div class="k-meta">${c.adviser_id ? userName(c.adviser_id) : 'No adviser'}</div>
            <div class="k-reason risk-${c.risk.level}">${icon(c.risk.level === 'low' ? 'check' : 'alert', 'ic-sm')}<span>${c.risk.reason}</span></div></a>`)}
          ${list.length ? '' : h`<p class="muted small" style="padding:4px">No cases</p>`}</div>`;
      })}
      <div class="k-col"><div class="k-col-head"><b>Completed · 30 days</b><span>${data.completed.length}</span></div>
        ${data.completed.map((c) => h`<a class="k-card" href="#/cases/${c.id}"><div class="k-name">${c.client_name}</div><div class="k-meta">${label('case_type', c.case_type)} · ${money(c.loan_amount)}</div><div class="k-meta">Completed ${fmtDate(c.completion_date)}</div></a>`)}</div></div>`);
    } else {
      mountTable(body, {
        rows, noun: 'case', exportName: 'MAP pipeline', rowHref: (c) => `#/cases/${c.id}`, sort: ['risk', 1],
        empty: emptyState('pipeline', 'No live cases', ''),
        columns: [
          { k: 'client_name', label: 'Client', render: (c) => h`<div class="t-title">${c.client_name}</div><div class="t-sub">${label('case_type', c.case_type)}</div>` },
          { k: 'stage', label: 'Stage', value: (c) => Object.keys(S.meta.enums.stage).indexOf(c.stage), render: (c) => label('stage', c.stage), exportValue: (c) => label('stage', c.stage) },
          { k: 'loan_amount', label: 'Loan', right: true, render: (c) => money(c.loan_amount), value: (c) => +c.loan_amount || null },
          { k: 'lender', label: 'Lender' },
          { k: 'adviser_id', label: 'Adviser', value: (c) => userName(c.adviser_id) },
          { k: 'risk', label: 'Risk', value: (c) => ({ high: 0, medium: 1, low: 2 }[c.risk.level]), render: (c) => h`${riskBadge(c.risk)}<div class="t-sub">${c.risk.reason}</div>`, exportValue: (c) => `${c.risk.level}: ${c.risk.reason}` },
          { k: 'compliance', label: 'Compliance', value: (c) => c.compliance_eval.rating, render: (c) => ragBadge(c.compliance_eval.rating) },
          { k: 'last', label: 'Last contact', right: true, value: (c) => c.risk.last_touch_days, render: (c) => `${c.risk.last_touch_days}d` },
        ],
      });
    }
  };
  const load = async () => { data = await apiGet('pipeline', { mine: state.mine }); if (!stale()) draw(); };
  wireSegments(el, (name, val) => { state[name] = val; draw(); });
  $('[data-mine]', el).addEventListener('change', (e) => { state.mine = e.target.checked; load().catch(showError); });
  on(el, 'click', '[data-new]', () => newCase());
  await load();
}

/* ---------- Protection & insurance ---------- */
async function viewProtection({ el, query, stale }) {
  const state = { status: query.get('status') || 'live', type: query.get('type') || '' };
  const res = await apiGet('list', { entity: 'policies', status: 'all' });
  if (stale()) return;
  const all = res.rows;
  const t = today();
  const inForce = all.filter((p) => p.status === 'on_risk');
  const renewals = inForce.filter((p) => p.renewal_date && daysBetween(t, p.renewal_date) <= 30 && daysBetween(t, p.renewal_date) >= 0);
  const quotes = all.filter((p) => p.status === 'quote' || p.status === 'applied');
  setHTML(el, h`${pageHead({
    title: 'Protection & insurance', sub: 'Life, critical illness, income protection, home, landlord and PMI, with renewals tracked.',
    actions: h`<button class="btn btn-primary" type="button" data-new>${icon('plus')}New policy or quote</button>`,
  })}
  <div class="kpis">
    ${kpi('Policies in force', num(inForce.length), `${money(inForce.reduce((s, p) => s + (+p.premium || 0), 0), 2)} a month`, '#/protection?status=on_risk')}
    ${kpi('Quotes & applications', num(quotes.length), 'waiting to go on risk', '#/protection?status=quotes')}
    ${kpi('Renewals · 30 days', num(renewals.length), 'follow-up tasks are created', '#/protection?status=renewals', renewals.length > 0)}
    ${kpi('Cover written', moneyShort(inForce.reduce((s, p) => s + (+p.sum_assured || 0), 0)), 'total sum assured in force', '#/protection?status=on_risk')}
  </div>
  <div class="filters">${segmented('status', [['live', 'Live'], ['on_risk', 'In force'], ['quotes', 'Quotes'], ['renewals', 'Renewals due'], ['ended', 'Ended'], ['all', 'All']], state.status)}
    <select class="select" data-type aria-label="Type of cover"><option value="">All types of cover</option>${enumOptions('policy_type').map(([k, v]) => h`<option value="${k}" ${k === state.type ? raw('selected') : ''}>${v}</option>`)}</select></div>
  <div data-table></div>`);
  let table;
  const draw = () => {
    setQuery({ status: state.status === 'live' ? '' : state.status, type: state.type });
    const f = {
      live: (p) => ['quote', 'applied', 'on_risk'].includes(p.status), on_risk: (p) => p.status === 'on_risk', quotes: (p) => ['quote', 'applied'].includes(p.status),
      renewals: (p) => p.status === 'on_risk' && p.renewal_date && daysBetween(t, p.renewal_date) <= 60, ended: (p) => ['declined', 'ntu', 'lapsed', 'cancelled'].includes(p.status), all: () => true,
    }[state.status] || (() => true);
    const rows = all.filter((p) => f(p) && (!state.type || p.policy_type === state.type));
    const opts = {
      rows, noun: 'policy', exportName: 'MAP protection and insurance', rowHref: (p) => `#/policies/${p.id}`, sort: state.status === 'renewals' ? ['renewal_date', 1] : null,
      empty: emptyState('shield', 'No policies here', 'Add protection or insurance from a client\'s file or with the button above.'),
      columns: [
        { k: 'client_name', label: 'Client', render: (p) => h`<div class="t-title">${p.client_name}</div><div class="t-sub">${p.provider || ''}</div>` },
        { k: 'policy_type', label: 'Cover', value: (p) => label('policy_type', p.policy_type) },
        { k: 'status', label: 'Status', value: (p) => label('policy_status', p.status), render: (p) => statusBadge('policy_status', p.status) },
        { k: 'premium', label: 'Monthly', right: true, render: (p) => money(p.premium, 2), value: (p) => +p.premium || null },
        { k: 'sum_assured', label: 'Cover', right: true, render: (p) => money(p.sum_assured), value: (p) => +p.sum_assured || null },
        { k: 'renewal_date', label: 'Renewal', render: (p) => daysLeftText(p.renewal_date), exportValue: (p) => p.renewal_date },
        { k: 'adviser_id', label: 'Adviser', value: (p) => userName(p.adviser_id) },
      ],
    };
    if (table) table.setRows(rows); else table = mountTable($('[data-table]', el), opts);
  };
  wireSegments(el, (name, val) => { state[name] = val; draw(); });
  $('[data-type]', el).addEventListener('change', (e) => { state.type = e.target.value; draw(); });
  on(el, 'click', '[data-new]', () => newPolicy());
  draw();
}
