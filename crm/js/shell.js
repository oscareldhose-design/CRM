/* MAP Operating System: app shell (sidebar, top bar, router, search, bell, quick add) and shared record tools. */
'use strict';

const OFFICE_ROLES = ['admin', 'manager', 'adviser', 'administrator'];
const isOffice = () => S.me && OFFICE_ROLES.includes(S.me.role);
const isManager = () => S.me && ['admin', 'manager'].includes(S.me.role);
const isAdmin = () => S.me && S.me.role === 'admin';
/** General Sales: its own logins, and office managers who give mortgage advice (it hands over mortgage enquiries). */
const canSales = () => S.me && (S.me.role === 'sales' || (['manager', 'admin'].includes(S.me.role) && !S.me.protection_only));
/** Protection-only advisers see nothing to do with mortgages. */
const isProtectionOnly = () => !!(S.me && S.me.protection_only);
const PROTECTION_ENQUIRIES = ['protection', 'insurance', 'business_protection', 'other'];
const MORTGAGE_LEAD_FIELDS = ['loan_amount', 'property_value', 'deposit', 'credit_issues'];
/** Reasons a protection-only adviser can give for a lost lead (the shared list is about lenders and house sales). */
const PROTECTION_LOST_REASONS = ['Went with another adviser', 'Bought cover elsewhere', 'Too expensive', 'Declined by the insurer',
  'No longer needs cover', 'No response from client', 'Other'];
/** A lead's timescale; "Now / offer accepted" (an accepted offer on a home) reads "Now" for protection-only advisers. */
function timescaleLabel(k) { return isProtectionOnly() && k === 'asap' ? 'Now' : label('timescale', k); }
function leadFields() {
  if (!isProtectionOnly()) return FIELDS.leads;
  return FIELDS.leads.filter((f) => !MORTGAGE_LEAD_FIELDS.includes(f.k)).map((f) => (f.k === 'enquiry_type'
    ? Object.assign({}, f, { opts: enumOptions('enquiry_type').filter(([k]) => PROTECTION_ENQUIRIES.includes(k)) })
    : f.k === 'timescale' ? Object.assign({}, f, { opts: enumOptions('timescale').map(([k]) => [k, timescaleLabel(k)]) }) : f));
}
const MORTGAGE_PLACEHOLDERS = ['lender', 'loan_amount', 'property_address', 'completion_date', 'fixed_rate_end_date'];
/** Email template form; protection-only advisers are not shown the mortgage placeholders. */
function templateFields() {
  const names = ['first_name', 'last_name', 'full_name', 'my_name', 'adviser_name', 'office_name', ...(isProtectionOnly() ? [] : MORTGAGE_PLACEHOLDERS), 'today'];
  const hint = 'Placeholders: ' + names.map((n) => `{{${n}}}`).join(' ');
  return FIELDS.templates.map((f) => (f.k === 'body' ? Object.assign({}, f, { hint })
    : f.k === 'category' && isProtectionOnly() ? Object.assign({}, f, { placeholder: 'e.g. Leads, Protection, Insurance' }) : f));
}

/* ---------- Record forms (shared by lists, detail pages and quick add) ---------- */
const FIELDS = {
  leads: [
    { type: 'section', label: 'Contact' },
    { k: 'first_name', label: 'First name', req: true }, { k: 'last_name', label: 'Last name', req: true },
    { k: 'phone', label: 'Phone', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' },
    { type: 'section', label: 'Enquiry' },
    { k: 'enquiry_type', label: 'Looking for', type: 'select', opts: 'enquiry_type' }, { k: 'timescale', label: 'Timescale', type: 'select', opts: 'timescale' },
    { k: 'source', label: 'Source', type: 'select', opts: 'source' }, { k: 'introducer_id', label: 'Introducer', type: 'introducer' },
    { k: 'loan_amount', label: 'Loan amount (£)', type: 'money' }, { k: 'property_value', label: 'Property value (£)', type: 'money' },
    { k: 'deposit', label: 'Deposit (£)', type: 'money' }, { k: 'employment', label: 'Employment', type: 'select', opts: 'employment' },
    { k: 'credit_issues', label: 'Credit history', type: 'select', opts: 'credit_issues' },
    { k: 'status', label: 'Status', type: 'select', opts: [['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'], ['lost', 'Lost']], default: 'new',
      currentOnly: [['converted', 'Converted']] }, // only "Convert to client" converts a lead, but a converted lead stays editable
    { type: 'section', label: 'Who looks after it' },
    { k: 'adviser_id', label: 'Adviser', type: 'user' }, { k: 'administrator_id', label: 'Administrator', type: 'user' },
    { k: 'notes', label: 'Notes', type: 'textarea' },
  ],
  clients: [
    { type: 'section', label: 'Personal details' },
    { k: 'title', label: 'Title', type: 'select', opts: 'title' }, { k: 'dob', label: 'Date of birth', type: 'date' },
    { k: 'first_name', label: 'First name', req: true }, { k: 'last_name', label: 'Last name', req: true },
    { k: 'phone', label: 'Phone', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' },
    { k: 'address', label: 'Address', full: true }, { k: 'postcode', label: 'Postcode' },
    { k: 'marital_status', label: 'Marital status', type: 'select', opts: 'marital_status' }, { k: 'dependants', label: 'Dependants', type: 'int' },
    { k: 'joint_applicant', label: 'Joint applicant' },
    { type: 'section', label: 'Work, home and money' },
    { k: 'employment_status', label: 'Employment', type: 'select', opts: 'employment' }, { k: 'annual_income', label: 'Annual income (£)', type: 'money' },
    { k: 'homeowner_status', label: 'Home situation', type: 'select', opts: 'homeowner_status' },
    { k: 'is_landlord', label: 'Landlord (owns buy-to-let property)', type: 'check' },
    { k: 'existing_plans', label: 'Plans held elsewhere', type: 'textarea', placeholder: 'e.g. Life cover with Aviva £150k, ends 2041; workplace death-in-service 4x salary' },
    { type: 'section', label: 'Relationship' },
    { k: 'adviser_id', label: 'Adviser', type: 'user' }, { k: 'administrator_id', label: 'Administrator', type: 'user' },
    { k: 'source', label: 'Source', type: 'select', opts: 'source' }, { k: 'introducer_id', label: 'Introducer', type: 'introducer' },
    { k: 'next_review_date', label: 'Next review date', type: 'date' },
    { k: 'marketing_consent', label: 'Happy to receive news and offers from MAP', type: 'check' },
    { k: 'notes', label: 'Notes', type: 'textarea' },
  ],
  cases: [
    { type: 'section', label: 'Case' },
    { k: 'case_type', label: 'Case type', type: 'select', opts: 'case_type', req: true }, { k: 'stage', label: 'Stage', type: 'select', opts: 'stage', default: 'enquiry' },
    { k: 'loan_amount', label: 'Loan amount (£)', type: 'money' }, { k: 'property_value', label: 'Property value (£)', type: 'money' },
    { k: 'property_address', label: 'Property address', full: true },
    { type: 'section', label: 'Lender & product' },
    { k: 'lender', label: 'Lender' }, { k: 'product', label: 'Product' },
    { k: 'rate', label: 'Rate (%)', type: 'number' }, { k: 'rate_type', label: 'Rate type', type: 'select', opts: 'rate_type' },
    { k: 'fixed_term_years', label: 'Fixed / initial period (years)', type: 'int' }, { k: 'term_years', label: 'Mortgage term (years)', type: 'int' },
    { k: 'fixed_rate_end_date', label: 'Fixed rate ends', type: 'date', hint: 'Worked out automatically on completion if left blank.' },
    { type: 'section', label: 'Key dates' },
    { k: 'application_date', label: 'Application submitted', type: 'date' }, { k: 'offer_date', label: 'Offer issued', type: 'date' },
    { k: 'offer_expiry_date', label: 'Offer expires', type: 'date' }, { k: 'expected_completion_date', label: 'Expected completion', type: 'date' },
    { k: 'completion_date', label: 'Completed on', type: 'date' },
    { type: 'section', label: 'Fees' },
    { k: 'proc_fee', label: 'Proc fee (£)', type: 'money' }, { k: 'broker_fee', label: 'Broker fee (£)', type: 'money' },
    { type: 'section', label: 'Next step and people' },
    { k: 'next_action', label: 'Next action' }, { k: 'next_action_date', label: 'Next action date', type: 'date' },
    { k: 'adviser_id', label: 'Adviser', type: 'user', mortgage: true }, { k: 'administrator_id', label: 'Administrator', type: 'user', mortgage: true },
    { k: 'introducer_id', label: 'Introducer', type: 'introducer' },
    { k: 'notes', label: 'Notes', type: 'textarea' },
  ],
  policies: [
    { k: 'policy_type', label: 'Type of cover', type: 'select', opts: 'policy_type', req: true },
    { k: 'status', label: 'Status', type: 'select', opts: 'policy_status', default: 'quote' },
    { k: 'provider', label: 'Provider / insurer' }, { k: 'policy_number', label: 'Policy number' },
    { k: 'premium', label: 'Monthly premium (£)', type: 'money' }, { k: 'sum_assured', label: 'Sum assured / cover (£)', type: 'money' },
    { k: 'term_years', label: 'Term (years)', type: 'int' }, { k: 'commission', label: 'Commission (£)', type: 'money' },
    { k: 'quote_date', label: 'Quoted on', type: 'date' }, { k: 'start_date', label: 'Start date', type: 'date' },
    { k: 'renewal_date', label: 'Renewal date', type: 'date', hint: 'Home, landlord and PMI renewals are tracked automatically.' },
    { k: 'adviser_id', label: 'Adviser', type: 'user' },
    { k: 'notes', label: 'Notes', type: 'textarea' },
  ],
  tasks: [
    { k: 'title', label: 'What needs doing', req: true, full: true },
    { k: 'due_date', label: 'Due', type: 'date' }, { k: 'priority', label: 'Priority', type: 'select', opts: 'task_priority', default: 'normal' },
    { k: 'assigned_to', label: 'Assigned to', type: 'user', allowOffice: true }, { k: 'status', label: 'Status', type: 'select', opts: 'task_status', default: 'open' },
    { k: 'notes', label: 'Notes', type: 'textarea' },
  ],
  documents: [
    { k: 'name', label: 'Document', type: 'select', opts: 'document_names', req: true },
    { k: 'status', label: 'Status', type: 'select', opts: 'document_status', default: 'requested' },
    { k: 'requested_at', label: 'Requested on', type: 'date' }, { k: 'received_at', label: 'Received on', type: 'date' },
    { k: 'expiry_date', label: 'Expires', type: 'date', hint: 'Proof of address, payslips and bank statements expire 90 days after receipt automatically.' },
    { k: 'notes', label: 'Notes', full: true },
  ],
  introducers: [
    { k: 'name', label: 'Name', req: true }, { k: 'company', label: 'Company' },
    { k: 'type', label: 'Type', type: 'select', opts: 'introducer_type' }, { k: 'phone', label: 'Phone', type: 'tel' },
    { k: 'email', label: 'Email', type: 'email' }, { k: 'commission_terms', label: 'Referral / commission terms' },
    { k: 'active', label: 'Active referral partner', type: 'check', default: true },
    { k: 'notes', label: 'Notes', type: 'textarea' },
  ],
  templates: [
    { k: 'name', label: 'Template name', req: true }, { k: 'category', label: 'Category', placeholder: isProtectionOnly() ? 'e.g. Leads, Protection, Insurance' : 'e.g. Leads, Cases, Protection' },
    { k: 'subject', label: 'Subject', req: true, full: true },
    { k: 'body', label: 'Email text', type: 'textarea', req: true, rows: 12 }, // hint: see templateFields()
  ],
};
async function clientOptions() {
  const res = await apiGet('list', { entity: 'clients' });
  return res.rows.map((c) => [c.id, `${fullName(c)}${c.postcode ? ' · ' + c.postcode : ''}`]);
}
async function newLead(defaults = {}) {
  editRecord({ entity: 'leads', fields: leadFields(), title: 'New lead', sub: 'Leads are scored HOT, WARM or COLD automatically, and a "contact lead" task is created for the adviser.',
    defaults: Object.assign({ adviser_id: S.me.role === 'adviser' ? S.me.id : '' }, defaults), onSaved: (r) => { location.hash = `#/leads/${r.id}`; } });
}
async function newClient(defaults = {}) {
  editRecord({ entity: 'clients', fields: FIELDS.clients, title: 'New client', defaults: Object.assign({ adviser_id: S.me.role === 'adviser' ? S.me.id : '' }, defaults),
    onSaved: (r) => { location.hash = `#/clients/${r.id}`; } });
}
async function newCase(clientId, onSaved) {
  let fields = FIELDS.cases;
  if (!clientId) {
    const opts = await clientOptions();
    if (!opts.length) { toast('Add the client first, then open a case for them.', 'bad'); return; }
    fields = [{ k: 'client_id', label: 'Client', type: 'client', clientOpts: opts, req: true, full: true }, ...FIELDS.cases];
  }
  editRecord({ entity: 'cases', fields, title: 'New mortgage case', fixed: clientId ? { client_id: clientId } : null,
    onSaved: (r) => { if (onSaved) onSaved(r); else location.hash = `#/cases/${r.id}`; } });
}
async function newPolicy(clientId, onSaved, caseId) {
  let fields = FIELDS.policies;
  if (!clientId) {
    const opts = await clientOptions();
    if (!opts.length) { toast('Add the client first.', 'bad'); return; }
    fields = [{ k: 'client_id', label: 'Client', type: 'client', clientOpts: opts, req: true, full: true }, ...FIELDS.policies];
  }
  editRecord({ entity: 'policies', fields, title: 'New protection or insurance policy',
    fixed: clientId ? Object.assign({ client_id: clientId }, caseId ? { case_id: caseId } : {}) : null,
    onSaved: (r) => { if (onSaved) onSaved(r); else location.hash = `#/policies/${r.id}`; } });
}
function openTask(task, links, onSaved) {
  const isNew = !task || !task.id;
  const defaults = { assigned_to: S.me.id, due_date: today(), priority: 'normal', status: 'open' };
  // A task on a mortgage case can't go to someone who gives protection advice only (they would never see it).
  const onCase = isNew ? !!(links && links.case_id) : !!task.case_id;
  const fields = onCase ? FIELDS.tasks.map((f) => (f.k === 'assigned_to' ? Object.assign({}, f, { mortgage: true }) : f)) : FIELDS.tasks;
  editRecord({ entity: 'tasks', record: isNew ? null : task, fields, title: isNew ? 'New task' : 'Task',
    sub: !isNew && task.auto_key ? 'Created automatically by the CRM.' : '', defaults, fixed: isNew ? links : null, onSaved });
}

/* ---------- Shell ---------- */
function navGroups() {
  const r = S.me.role;
  const groups = [];
  if (isOffice()) {
    groups.push({ label: 'Overview', items: [['dashboard', 'Dashboard', 'dashboard']] });
    if (isProtectionOnly()) {
      groups.push({ label: 'Clients & cover', items: [['leads', 'Leads', 'lead'], ['clients', 'Clients', 'users'], ['protection', 'Protection & insurance', 'shield']] });
      groups.push({ label: 'Future business', items: [['opportunities', 'Opportunities', 'spark'], ['tasks', 'Tasks & calendar', 'calendar']] });
    } else {
      groups.push({ label: 'Clients & cases', items: [['leads', 'Leads', 'lead'], ['clients', 'Clients', 'users'], ['pipeline', 'Mortgage pipeline', 'pipeline'], ['protection', 'Protection & insurance', 'shield']] });
      groups.push({ label: 'Future business', items: [['radar', 'Remortgage radar', 'radar'], ['opportunities', 'Opportunities', 'spark']] });
      groups.push({ label: 'Case work', items: [['compliance', 'Compliance', 'check-circle'], ['documents', 'Documents', 'file'], ['tasks', 'Tasks & calendar', 'calendar']] });
    }
    groups.push({ label: 'Business', items: [['introducers', 'Introducers', 'handshake'], ['team', 'Team & workload', 'team'], ['reports', 'Reports', 'chart']] });
    const tools = [['templates', 'Email templates', 'mail'], ['lost', isProtectionOnly() ? 'Lost leads' : 'Lost cases', 'x-circle'], ['data', 'Import, export & backups', 'database'], ['trash', 'Trash', 'trash']];
    if (isManager()) tools.splice(2, 0, ['audit', 'Audit log', 'history']);
    groups.push({ label: 'Tools', items: tools });
  }
  if (canSales()) groups.push({ label: 'General Sales', items: [['sales', 'Events', 'megaphone'], ['sales/queue', 'Call queue', 'phone'], ['sales/results', 'Event results', 'trophy']] });
  return groups;
}
function renderShell() {
  const me = S.me;
  const officeChip = isAdmin()
    ? h`<label class="office-chip">${icon('building')}<div class="grow"><span class="tiny muted">Viewing office</span>
        <select data-switch-office aria-label="Switch office">${S.meta.offices.map((o) => h`<option value="${o.id}" ${S.meta.office && +o.id === +S.meta.office.id ? raw('selected') : ''}>${o.name}</option>`)}</select></div></label>`
    : h`<div class="office-chip">${icon(me.role === 'sales' ? 'megaphone' : 'building')}<div><span class="tiny muted">${me.role === 'sales' ? 'Team' : 'Office'}</span><b>${me.role === 'sales' ? 'General Sales' : S.officeName}</b></div></div>`;
  setHTML($('#app'), h`<div class="shell">
    <aside class="sidebar" id="sidebar" aria-label="Main menu">
      <a class="brand" href="#/${me.role === 'sales' ? 'sales' : 'dashboard'}" aria-label="MAP: go to the start page"><img src="assets/map-logo.svg" alt="MAP" width="56" height="60"></a>
      ${officeChip}
      <nav class="nav" id="nav">${navGroups().map((g) => h`<div class="nav-group"><div class="nav-label">${g.label}</div>
        ${g.items.map(([path, text, ic]) => h`<a href="#/${path}" data-nav="${path}">${icon(ic)}<span>${text}</span></a>`)}</div>`)}</nav>
      <div class="side-foot"><div class="avatar">${initials(me.full_name)}</div><div class="who"><b>${me.full_name}</b><span>${+me.is_office_account ? 'Office login' : me.role_label}</span></div>
        <a class="icon-btn" href="#/account" aria-label="My account" title="My account">${icon('user')}</a>
        <button class="icon-btn" type="button" data-signout aria-label="Sign out" title="Sign out">${icon('logout')}</button></div>
    </aside>
    <div class="scrim hidden" data-close-nav></div>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" type="button" data-open-nav aria-label="Open menu">${icon('menu')}</button>
        <div class="page-title" id="pageTitle"></div>
        ${isOffice() ? h`<div class="search-pill" role="search"><input id="globalSearch" type="search" placeholder="${isProtectionOnly() ? 'Search clients, leads, policies…' : 'Search clients, leads, cases…'}  ( / )" autocomplete="off" aria-label="Search">
          <button class="go" type="button" data-focus-search aria-label="Search">${icon('search', 'ic-sm')}</button><div class="search-results hidden" id="searchResults"></div></div>` : raw('<div class="grow"></div>')}
        <div class="top-actions">
          ${isOffice() && !isProtectionOnly() ? h`<button class="icon-btn hide-sm" type="button" data-lookup title="Quick Case Lookup (all offices)" aria-label="Quick Case Lookup">${icon('globe')}</button>` : ''}
          <div class="bell-wrap"><button class="icon-btn" type="button" data-bell aria-label="Notifications" title="Notifications">${icon('bell')}<span class="dot hidden" id="bellDot"></span></button><div id="bellPop"></div></div>
          <button class="icon-btn" type="button" data-toggle-theme aria-label="Light or dark mode" title="Light or dark mode"><span data-theme-icon>${icon(getTheme() === 'dark' ? 'sun' : 'moon')}</span></button>
        </div>
      </header>
      <main class="content" id="content" tabindex="-1"></main>
      <div class="compliance-banner">MAP Operating System · ${S.officeName || 'General Sales'} · Advice and suitability always stay with the adviser.</div>
    </div>
    <button class="fab" type="button" data-fab aria-label="Quick add" title="Quick add">${icon('plus')}</button>
    <div id="fabMenu"></div></div>`);
  wireShell();
}
function setNavOpen(open) {
  $('#sidebar').classList.toggle('open', open);
  $('[data-close-nav]').classList.toggle('hidden', !open);
}
let shellDocWired = false;
function wireShell() {
  // Listeners go on the new .shell element, so signing out and back in (same tab) never doubles them up.
  const app = $('#app > .shell');
  on(app, 'click', '[data-open-nav]', () => setNavOpen(true));
  on(app, 'click', '[data-close-nav]', () => setNavOpen(false));
  on(app, 'click', '[data-signout]', signOut);
  on(app, 'click', '[data-lookup]', () => openLookup());
  on(app, 'click', '[data-bell]', toggleBell);
  on(app, 'click', '[data-fab]', toggleFab);
  on(app, 'click', '[data-focus-search]', () => $('#globalSearch').focus());
  on(app, 'click', '#nav a', () => setNavOpen(false));
  const sw = $('[data-switch-office]');
  if (sw) sw.addEventListener('change', async () => {
    try {
      await apiPost('switchOffice', { office_id: +sw.value });
      const meta = await apiGet('meta');
      S.meta = meta; S.officeName = meta.office ? meta.office.name : '';
      meta.users.forEach((u) => { S.usersById[u.id] = u; });
      toast(`Now viewing ${S.officeName}`);
      $('.compliance-banner').textContent = `MAP Operating System · ${S.officeName} · Advice and suitability always stay with the adviser.`;
      router();
      pollNotifications();
    } catch (e) { showError(e); }
  });
  const input = $('#globalSearch');
  if (input) wireSearch(input);
  if (shellDocWired) return;
  shellDocWired = true;
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && $('#globalSearch')) { e.preventDefault(); $('#globalSearch').focus(); }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#bellPop, [data-bell]')) setHTML($('#bellPop') || document.createElement('div'), '');
    if (!e.target.closest('#fabMenu, [data-fab]')) setHTML($('#fabMenu') || document.createElement('div'), '');
    if (!e.target.closest('.search-pill')) { const r = $('#searchResults'); if (r) r.classList.add('hidden'); }
  });
}

/* ---------- Instant search ---------- */
function wireSearch(input) {
  const box = $('#searchResults');
  let items = [], active = -1, seq = 0;
  const typeIcon = { lead: 'lead', client: 'user', case: 'home', policy: 'shield', introducer: 'handshake' };
  const draw = () => {
    if (input.value.trim().length < 2) { box.classList.add('hidden'); return; } // nothing is searched below 2 letters
    box.classList.remove('hidden');
    setHTML(box, items.length ? h`${items.map((r, i) => h`<a href="${r.link}" class="${i === active ? 'active' : ''}"><span class="sr-type">${icon(typeIcon[r.type] || 'search', 'ic-sm')}</span>
      <span class="grow"><span class="li-title">${r.title}</span><br><span class="li-sub">${r.sub}</span></span></a>`)}`
      : h`<div class="empty" style="padding:18px">No matches in ${S.officeName}.${isProtectionOnly() ? ''
        : h` Try <button type="button" class="link-btn" data-lookup>Quick Case Lookup</button> to search every office.`}</div>`);
  };
  const run = debounce(async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.length < 2) { items = []; draw(); return; }
    try { const res = await apiGet('search', { q }); if (mine === seq) { items = res.results; active = -1; draw(); } } catch (e) { /* ignore while typing */ }
  }, 180);
  input.addEventListener('input', run);
  input.addEventListener('focus', () => { if (items.length) draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && items[active >= 0 ? active : 0]) { location.hash = items[active >= 0 ? active : 0].link; box.classList.add('hidden'); input.blur(); }
    if (e.key === 'Escape') { box.classList.add('hidden'); input.blur(); }
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('a')) { box.classList.add('hidden'); input.value = ''; items = []; }
    if (e.target.closest('[data-lookup]')) box.classList.add('hidden');
  });
}

/* ---------- Notifications ---------- */
let pollTimer = null;
function startPolling() { stopPolling(); pollNotifications(); pollTimer = setInterval(pollNotifications, 60000); }
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
async function pollNotifications() {
  if (!S.me) return;
  try {
    const res = await apiGet('notifications');
    S.notifications = res;
    const dot = $('#bellDot');
    if (dot) { dot.textContent = res.unread > 9 ? '9+' : res.unread; dot.classList.toggle('hidden', !res.unread); }
  } catch (e) { /* offline: try again next time */ }
}
function toggleBell() {
  const pop = $('#bellPop');
  if (pop.innerHTML) { setHTML(pop, ''); return; }
  const data = S.notifications || { items: [] };
  const iconFor = { overdue: 'alert', due: 'clock', lead: 'lead', risk: 'flag', opportunity: 'spark', request: 'user', callback: 'phone' };
  setHTML(pop, h`<div class="popover" role="dialog" aria-label="Notifications"><div class="popover-head"><b>Notifications</b><span class="muted small">${plural(data.items.length, 'item')}</span></div>
    <div class="popover-body">${data.items.length ? data.items.map((n) => h`<a class="notif ${n.unread ? 'unread' : ''}" href="${n.link}"><span class="n-dot"></span>${icon(iconFor[n.kind] || 'bell', 'ic-sm')}<span class="grow">${n.text}</span></a>`)
      : emptyState('bell', 'All caught up', 'Nothing needs your attention right now.')}</div></div>`);
  on(pop, 'click', 'a', () => setHTML(pop, ''));
  if (data.unread) {
    apiPost('notificationsSeen').then(() => { data.unread = 0; data.items.forEach((i) => { i.unread = false; }); $('#bellDot').classList.add('hidden'); }).catch(() => {});
  }
}

/* ---------- Quick add ---------- */
function toggleFab() {
  const m = $('#fabMenu');
  if (m.innerHTML) { setHTML(m, ''); return; }
  const items = isOffice()
    ? [['lead', 'New lead', 'lead'], ['client', 'New client', 'user'], ...(isProtectionOnly() ? [] : [['case', 'New mortgage case', 'home']]), ['policy', 'New policy', 'shield'], ['task', 'New task', 'calendar'], ['log', 'Log a call or note', 'phone'],
      ...(isProtectionOnly() ? [] : [['lookup', 'Quick Case Lookup', 'globe']])]
    : [['event', 'New event', 'megaphone'], ['queue', 'Open the call queue', 'phone']];
  setHTML(m, h`<div class="fab-menu" role="menu">${items.map(([k, t, ic]) => h`<button type="button" role="menuitem" data-quick="${k}">${icon(ic)}${t}</button>`)}</div>`);
  on(m, 'click', '[data-quick]', (e, b) => {
    setHTML(m, '');
    const k = b.dataset.quick;
    if (k === 'lead') newLead();
    if (k === 'client') newClient();
    if (k === 'case') newCase();
    if (k === 'policy') newPolicy();
    if (k === 'task') openTask(null, null, () => router());
    if (k === 'log') quickLog();
    if (k === 'lookup') openLookup();
    if (k === 'event') editEvent(null);
    if (k === 'queue') location.hash = '#/sales/queue';
  });
}
function quickLog() {
  modal({
    title: 'Log a call or note', sub: 'Find the client or lead first.',
    body: h`<div class="search-pill"><input type="search" id="ql-q" placeholder="Name, email, phone or postcode" autocomplete="off"><span class="go">${icon('search', 'ic-sm')}</span></div><div class="list mt" id="ql-res"></div>`,
    onMount(el, close) {
      const q = $('#ql-q', el), res = $('#ql-res', el);
      const run = debounce(async () => {
        if (q.value.trim().length < 2) { setHTML(res, ''); return; }
        try {
          const r = await apiGet('search', { q: q.value.trim() });
          const people = r.results.filter((x) => x.type === 'client' || x.type === 'lead');
          setHTML(res, people.length ? people.map((p) => h`<button type="button" class="list-item link-btn" style="text-align:left;width:100%" data-pick="${p.type}:${p.id}">
            <span class="avatar avatar-sm">${initials(p.title)}</span><span><span class="li-title">${p.title}</span><br><span class="li-sub">${p.sub}</span></span></button>`) : emptyState('search', 'No matches', ''));
        } catch (e) { showError(e); }
      }, 200);
      q.addEventListener('input', run);
      on(el, 'click', '[data-pick]', (e, b) => {
        const [type, id] = b.dataset.pick.split(':');
        close();
        logActivity(type === 'client' ? { client_id: +id } : { lead_id: +id }, () => router());
      });
    },
  });
}

/* ---------- Quick Case Lookup (all offices) ---------- */
function openLookup() {
  modal({
    title: 'Quick Case Lookup', size: 'wide',
    sub: 'Find any case in any office by surname, to see who is looking after it. Contact details stay with the office that owns the client.',
    body: h`<form class="row" id="lk-form"><div class="search-pill grow"><input type="search" id="lk-q" placeholder="Surname, e.g. Smith" autocomplete="off" minlength="2"><button class="go" type="submit" aria-label="Look up">${icon('search', 'ic-sm')}</button></div></form><div id="lk-res" class="mt"></div>`,
    onMount(el) {
      const form = $('#lk-form', el), out = $('#lk-res', el);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const s = $('#lk-q', el).value.trim();
        if (s.length < 2) { toast('Type at least 2 letters of the surname.', 'bad'); return; }
        setHTML(out, loadingBlock());
        try {
          const res = await apiGet('lookup', { surname: s });
          setHTML(out, res.results.length ? h`<div class="table-wrap"><table class="table"><thead><tr><th>Client</th><th>Office</th><th>Adviser</th><th>Cases</th></tr></thead><tbody>
            ${res.results.map((r) => h`<tr><td><div class="t-title">${r.same_office ? h`<a href="#/clients/${r.client_id}" data-close>${r.name}</a>` : r.name}</div>${r.postcode_area ? h`<div class="t-sub">${r.postcode_area} area</div>` : ''}</td>
              <td>${r.same_office ? h`<span class="badge badge-brand">${r.office} (yours)</span>` : h`<span class="badge">${r.office}</span>`}</td><td>${r.adviser || '—'}</td>
              <td>${r.cases.length ? r.cases.map((c) => h`<div class="small">${c.type}: <b>${c.stage}</b> ${c.status !== 'active' ? h`<span class="muted">(${c.status})</span>` : ''}</div>`) : h`<span class="muted small">No cases</span>`}</td></tr>`)}
            </tbody></table></div>` : emptyState('search', 'No cases found', `No client with a surname starting "${s}" in any office.`));
        } catch (err) { setHTML(out, ''); showError(err); }
      });
    },
  });
}

/* ---------- Router ---------- */
const ROUTES = [
  ['dashboard', 'viewDashboard', 'office'], ['leads', 'viewLeads', 'office'], ['leads/:id', 'viewLead', 'office'],
  ['clients', 'viewClients', 'office'], ['clients/:id', 'viewClient', 'office'], ['cases/:id', 'viewCase', 'mortgage'],
  ['pipeline', 'viewPipeline', 'mortgage'], ['protection', 'viewProtection', 'office'], ['policies/:id', 'viewPolicy', 'office'],
  ['radar', 'viewRadar', 'mortgage'], ['opportunities', 'viewOpportunities', 'office'], ['compliance', 'viewCompliance', 'mortgage'],
  ['documents', 'viewDocuments', 'mortgage'], ['tasks', 'viewTasks', 'office'], ['tasks/:id', 'viewTaskRoute', 'office'],
  ['introducers', 'viewIntroducers', 'office'], ['introducers/:id', 'viewIntroducer', 'office'], ['team', 'viewTeam', 'office'],
  ['reports', 'viewReports', 'office'], ['templates', 'viewTemplates', 'office'], ['lost', 'viewLost', 'office'],
  ['audit', 'viewAudit', 'manager'], ['trash', 'viewTrash', 'office'], ['data', 'viewData', 'office'],
  ['sales', 'viewSales', 'sales'], ['sales/events/:id', 'viewSalesEvent', 'sales'], ['sales/queue', 'viewSalesQueue', 'sales'],
  ['sales/results', 'viewSalesResults', 'sales'], ['account', 'viewAccount', 'user'],
];
function parseHash() {
  const raw_ = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw_.split('?');
  return { path: path || '', query: new URLSearchParams(qs || '') };
}
function setQuery(changes) {
  const { path, query } = parseHash();
  for (const [k, v] of Object.entries(changes)) { if (v === null || v === undefined || v === '' || v === false) query.delete(k); else query.set(k, v); }
  const qs = query.toString();
  history.replaceState(null, '', `#/${path}${qs ? '?' + qs : ''}`);
}
let routeSeq = 0;
async function router() {
  if (!S.me) return;
  const { path, query } = parseHash();
  let match = null, params = {};
  for (const [pattern, fn, access] of ROUTES) {
    const pp = pattern.split('/'), hp = path.split('/');
    if (pp.length !== hp.length) continue;
    const p = {};
    const decode = (x) => { try { return decodeURIComponent(x); } catch (e) { return null; } }; // a broken link is "no match"
    if (pp.every((seg, i) => (seg.startsWith(':') ? (p[seg.slice(1)] = decode(hp[i])) !== null : seg === hp[i]))) { match = [fn, access]; params = p; break; }
  }
  const allowed = (access) => access === 'user' || (access === 'office' && isOffice()) || (access === 'mortgage' && isOffice() && !isProtectionOnly())
    || (access === 'manager' && isManager()) || (access === 'sales' && canSales());
  if (!match || !allowed(match[1])) {
    location.hash = '#/' + (isOffice() ? 'dashboard' : 'sales');
    return;
  }
  $$('#nav a').forEach((a) => {
    const n = a.dataset.nav;
    const current = path === n || (path.startsWith(n + '/') && !ROUTES.some((r) => r[0] === path && r[0] !== n && navGroups().some((g) => g.items.some((it) => it[0] === path))));
    if (current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const content = $('#content');
  const el = document.createElement('div');
  setHTML(el, loadingBlock());
  content.replaceChildren(el);
  const mySeq = ++routeSeq;
  try {
    await window[match[0]]({ el, params, query, stale: () => mySeq !== routeSeq });
  } catch (err) {
    if (mySeq !== routeSeq) return;
    if (err.code === 'signed_out' || err.code === 'must_change_password') return;
    setHTML(el, h`<div class="card card-pad">${emptyState('alert', 'This page could not be loaded', err.message, h`<button class="btn btn-primary mt" type="button" data-reload>Reload</button>`)}</div>`);
  }
  if (!parseHash().query.get('keep')) window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', () => router());
function setTitle(t) {
  document.title = `${t} · MAP Operating System`;
  const el = $('#pageTitle');
  if (el) el.textContent = t;
}
function pageHead({ title, sub, actions, back }) {
  setTitle(title);
  return h`${back ? h`<a class="back-link" href="${back[0]}">${icon('chevron-left', 'ic-sm')}${back[1]}</a>` : ''}
    <div class="page-head"><div><h1>${title}</h1>${sub ? h`<p class="sub">${sub}</p>` : ''}</div>${actions ? h`<div class="actions">${actions}</div>` : ''}</div>`;
}
function segmented(name, options, value) {
  return h`<div class="segmented" role="group" data-seg="${name}">${options.map(([v, t]) => h`<button type="button" data-val="${v}" aria-pressed="${String(v) === String(value)}">${t}</button>`)}</div>`;
}

/* ---------- Timeline, tasks and logging (used on every record page) ---------- */
const ACT_ICON = { call: 'phone', note: 'note', email: 'mail', meeting: 'users', sms: 'message', system: 'refresh' };
function timelineHtml(acts) {
  if (!acts || !acts.length) return emptyState('history', 'No history yet', 'Calls, notes and emails you log appear here.');
  return h`<div class="timeline">${acts.map((a) => h`<div class="tl-item"><div class="tl-icon ${a.type === 'system' ? 'system' : ''}">${icon(ACT_ICON[a.type] || 'note', 'ic-sm')}</div>
    <div><div class="tl-head"><b>${label('activity_type', a.type)}${a.outcome ? ': ' + a.outcome : ''}</b><span>${a.user_name || 'CRM'}</span><span title="${fmtDateTime(a.created_at)}">${relTime(a.created_at)}</span>
      ${+a.user_id === +S.me.id || isManager() ? h`<button class="link-btn tiny" type="button" data-del-activity="${a.id}" style="margin-left:auto">Remove</button>` : ''}</div>
      <div class="tl-body">${a.summary}</div></div></div>`)}</div>`;
}
function wireTimeline(el, onChange) {
  on(el, 'click', '[data-del-activity]', async (e, b) => {
    if (!(await confirmBox({ title: 'Remove this entry?', message: 'It will be removed from the timeline. The audit log keeps a record.', confirmText: 'Remove', danger: true }))) return;
    try { await apiPost('deleteActivity', { id: +b.dataset.delActivity }); toast('Removed'); onChange(); } catch (err) { showError(err); }
  });
}
function logActivity(target, onDone, preset) {
  const types = [['call', 'Call'], ['note', 'Note'], ['email', 'Email'], ['meeting', 'Meeting'], ['sms', 'Text / WhatsApp']];
  modal({
    title: 'Log a call or note',
    body: h`<form novalidate><div class="stack">
      ${segmented('type', types, (preset && preset.type) || 'call')}
      <div class="field" data-outcome-field><label for="la-out">Outcome</label><select class="select" id="la-out" name="outcome">
        <option value="">—</option><option>Spoke to client</option><option>No answer</option><option>Left voicemail</option><option>Call back requested</option><option>Appointment booked</option><option>Not interested</option></select></div>
      <div class="field"><label for="la-sum">What happened <span class="req">*</span></label><textarea class="textarea" id="la-sum" name="summary" rows="4" required placeholder="Summary of the conversation, next steps, anything agreed…"></textarea><div class="field-error" hidden></div></div>
      <div class="form-grid"><div class="field"><label for="la-fu">Follow-up date <span class="muted">(optional)</span></label><input class="input" type="date" id="la-fu" name="follow_up_date"></div>
        <div class="field"><label for="la-fut">Follow-up task</label><input class="input" id="la-fut" name="follow_up_title" placeholder="e.g. Chase payslips"></div></div>
    </div></form>`,
    foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-save>${icon('check')}Save to timeline</button>`,
    onMount(el, close) {
      let type = (preset && preset.type) || 'call';
      on(el, 'click', '[data-seg] button', (e, b) => {
        type = b.dataset.val;
        $$('[data-seg] button', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        $('[data-outcome-field]', el).hidden = type !== 'call';
      });
      on(el, 'click', '[data-save]', async (e, btn) => {
        const f = $('form', el);
        busy(btn, true, 'Saving…');
        try {
          await apiPost('addActivity', Object.assign({}, target, { type, summary: f.summary.value, outcome: type === 'call' ? f.outcome.value : '', follow_up_date: f.follow_up_date.value, follow_up_title: f.follow_up_title.value }));
          close();
          toast('Saved to the timeline');
          if (onDone) onDone();
        } catch (err) { busy(btn, false); showFormError(el, err); }
      });
    },
  });
}
function tasksHtml(tasks, { showWho = true, showLink = false } = {}) {
  if (!tasks || !tasks.length) return emptyState('check-circle', 'No tasks', 'Nothing scheduled.');
  return h`<div>${tasks.map((t) => {
    const d = dueText(t.due_date);
    const link = showLink && (t.case_id ? `#/cases/${t.case_id}` : t.client_id ? `#/clients/${t.client_id}` : t.lead_id ? `#/leads/${t.lead_id}` : t.policy_id ? `#/policies/${t.policy_id}` : null);
    return h`<div class="task ${t.status === 'done' ? 'done' : ''}">
      <button class="tick" type="button" data-tick="${t.id}" data-done="${t.status === 'done' ? 1 : 0}" aria-label="${t.status === 'done' ? 'Mark as not done' : 'Mark as done'}">${icon('check', 'ic-sm')}</button>
      <div class="grow"><div class="task-title" data-open-task="${t.id}">${t.title}</div>
        <div class="task-meta">${t.status === 'done' ? h`<span>Done ${relTime(t.completed_at)}</span>` : h`<span class="${d.cls}">${icon('clock', 'ic-sm')} ${d.text}</span>`}
          ${t.priority === 'high' && t.status !== 'done' ? h`<span class="badge badge-bad">High</span>` : ''}
          ${showWho ? h`<span>${t.assigned_to ? userName(t.assigned_to) : 'Unassigned'}</span>` : ''}
          ${link ? h`<a href="${link}">${t.client_name || t.lead_name || 'Open record'}</a>` : ''}
          ${t.auto_key ? h`<span class="chip">${icon('spark', 'ic-sm')}Automatic</span>` : ''}</div></div></div>`;
  })}</div>`;
}
function wireTasks(el, tasks, onChange) {
  on(el, 'click', '[data-tick]', async (e, b) => {
    try {
      await apiPost('taskDone', { id: +b.dataset.tick, done: b.dataset.done !== '1' });
      toast(b.dataset.done === '1' ? 'Task reopened' : 'Task done');
      onChange();
    } catch (err) { showError(err); }
  });
  on(el, 'click', '[data-open-task]', (e, b) => {
    const t = tasks().find((x) => +x.id === +b.dataset.openTask);
    if (t) openTask(t, null, onChange);
  });
}

/* ---------- Email from a template (copied into your normal email) ---------- */
async function emailComposer(target, onDone, preferName) {
  let templates;
  try { templates = (await apiGet('list', { entity: 'templates' })).rows; } catch (e) { showError(e); return; }
  if (!templates.length) { toast('Add an email template first (Tools → Email templates).', 'bad'); return; }
  const first = (preferName && templates.find((t) => t.name === preferName)) || templates[0];
  modal({
    title: 'Write an email', size: 'wide',
    sub: 'Pick a template, check the wording, then copy it into your normal email or open it in your email app.',
    body: h`<div class="stack"><div class="field"><label for="em-t">Template</label><select class="select" id="em-t">${templates.map((t) => h`<option value="${t.id}" ${t.id === first.id ? raw('selected') : ''}>${t.category ? t.category + ': ' : ''}${t.name}</option>`)}</select></div>
      <div class="field"><label for="em-to">To</label><input class="input" id="em-to" type="email"></div>
      <div class="field"><label for="em-s">Subject</label><input class="input" id="em-s"></div>
      <div class="field"><label for="em-b">Email</label><textarea class="textarea" id="em-b" rows="12"></textarea>
        <div class="field-hint" data-long-hint hidden>This email is too long to hand to your email app in one go. "Open in email app" copies the email text first: paste it into the new message.</div></div></div>`,
    foot: h`<button class="btn btn-ghost left" type="button" data-copy-all>${icon('copy')}Copy email</button>
      <a class="btn btn-secondary" data-mailto href="#">${icon('mail')}Open in email app</a>
      <button class="btn btn-primary" type="button" data-sent>${icon('check')}Mark as sent</button>`,
    onMount(el, close) {
      const sel = $('#em-t', el);
      const load = async () => {
        try {
          const r = await apiPost('renderTemplate', Object.assign({ template_id: +sel.value }, target));
          $('#em-to', el).value = r.to; $('#em-s', el).value = r.subject; $('#em-b', el).value = r.body;
          updateMailto();
        } catch (e) { showError(e); }
      };
      const updateMailto = () => {
        // Email apps cut off long mailto links, so a long email is copied for pasting instead of being cut short.
        const base = `mailto:${encodeURIComponent($('#em-to', el).value)}?subject=${encodeURIComponent($('#em-s', el).value)}`;
        const full = `${base}&body=${encodeURIComponent($('#em-b', el).value)}`;
        const tooLong = full.length > 1900;
        const link = $('[data-mailto]', el);
        link.setAttribute('href', tooLong ? base : full);
        link.dataset.long = tooLong ? '1' : '';
        $('[data-long-hint]', el).hidden = !tooLong;
      };
      sel.addEventListener('change', load);
      el.addEventListener('input', updateMailto);
      on(el, 'click', '[data-copy-all]', () => copyText(`Subject: ${$('#em-s', el).value}\n\n${$('#em-b', el).value}`));
      on(el, 'click', '[data-mailto]', (e, a) => { if (a.dataset.long) copyText($('#em-b', el).value); });
      on(el, 'click', '[data-sent]', async () => {
        // template_id: the server files an email from a mortgage template on the client's case (out of protection-only advisers' sight).
        try { await apiPost('logEmail', Object.assign({ subject: $('#em-s', el).value, template_id: +sel.value }, target)); close(); toast('Logged on the timeline'); if (onDone) onDone(); } catch (e) { showError(e); }
      });
      load();
    },
  });
}

/* ---------- Simple single-series bar charts ---------- */
function barsHtml(rows, { value, labelOf, fmt = num, max } = {}) {
  const m = max || Math.max(1, ...rows.map(value));
  return h`<div class="bars">${rows.map((r) => {
    const v = value(r);
    return h`<div class="bar-row" title="${labelOf(r)}: ${fmt(v)}"><span class="bar-label">${labelOf(r)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(0, Math.min(100, (100 * v) / m)).toFixed(1)}%"></span></span><span class="bar-val">${fmt(v)}</span></div>`;
  })}</div>`;
}
function columnsHtml(rows, { value, labelOf, tipOf }) {
  const m = Math.max(1, ...rows.map(value));
  return h`<div class="cols" role="img" aria-label="Column chart">${rows.map((r) => h`<div class="col"><span class="col-fill" style="height:${((100 * value(r)) / m).toFixed(1)}%"></span><span class="col-tip">${tipOf(r)}</span></div>`)}</div>
    <div class="col-labels">${rows.map((r) => h`<span>${labelOf(r)}</span>`)}</div>`;
}
