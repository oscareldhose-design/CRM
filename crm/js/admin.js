/* MAP Operating System: system admin (Newcastle): account requests, logins, offices, settings, security. */
'use strict';

function roleOptions(includeWeb) {
  return Object.entries(S.meta.roles).filter(([k]) => includeWeb || k !== 'webadmin');
}
function showTempPassword(name, pw) {
  modal({
    title: `Temporary password for ${name}`, size: 'narrow', dismissable: false,
    sub: 'Give this to them in person or by phone. They must choose their own password when they sign in.',
    body: h`<div class="code-box">${pw}</div><p class="small muted mt">It is only shown once.</p>`,
    foot: h`<button class="btn btn-secondary" type="button" data-copy>${icon('copy')}Copy</button><button class="btn btn-primary" type="button" data-close>Done</button>`,
    onMount(el) { on(el, 'click', '[data-copy]', () => copyText(pw)); },
  });
}
function userForm(u, onDone) {
  const isNew = !u;
  const fields = [
    { k: 'full_name', label: 'Full name', req: true }, { k: 'email', label: 'MAP email', type: 'email', req: !(u && u.is_office_account), placeholder: `name@${S.status.domain}` },
    { k: 'username', label: 'Username', req: true }, { k: 'role', label: 'Role', type: 'select', opts: roleOptions(true), req: true },
    { k: 'office_id', label: 'Office', type: 'select', opts: S.meta.offices.map((o) => [o.id, o.name]), hint: 'Not needed for General Sales or the website admin login.' },
    { k: 'status', label: 'Login', type: 'select', opts: [['active', 'Active'], ['disabled', 'Switched off']], default: 'active' },
  ];
  modal({
    title: isNew ? 'Add a login' : `Edit ${u.full_name}`, sub: isNew ? `New logins need a @${S.status.domain} email. They get a temporary password and choose their own when they first sign in.` : '',
    body: h`<form novalidate>${formHtml(fields, u || { status: 'active' })}</form>`,
    foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-save>${icon('check')}Save</button>`,
    onMount(el, close) {
      on(el, 'click', '[data-save]', async (e, btn) => {
        busy(btn, true, 'Saving…');
        try {
          const data = readForm($('form', el), fields);
          const res = await apiPost('adminUserSave', Object.assign({ id: u ? u.id : 0 }, data));
          close(); toast('Login saved');
          if (res.temp_password) showTempPassword(data.full_name, res.temp_password);
          onDone();
        } catch (err) { busy(btn, false); showFormError(el, err); }
      });
    },
  });
}
function officeForm(o, onDone) {
  const fields = [{ k: 'name', label: 'Office name', req: true }, { k: 'phone', label: 'Phone', type: 'tel' }, { k: 'address', label: 'Address', full: true },
    { k: 'active', label: 'Office is open (shows in the CRM)', type: 'check', default: true }];
  modal({
    title: o ? `Edit ${o.name}` : 'Add an office', sub: 'Each office sees only its own clients.',
    body: h`<form novalidate>${formHtml(fields, o ? Object.assign({}, o, { active: !!o.active }) : { active: true })}</form>`,
    foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-save>${icon('check')}Save</button>`,
    onMount(el, close) {
      on(el, 'click', '[data-save]', async (e, btn) => {
        busy(btn, true, 'Saving…');
        try {
          await apiPost('adminOfficeSave', Object.assign({ id: o ? o.id : 0 }, readForm($('form', el), fields)));
          close(); toast('Office saved');
          const meta = await apiGet('meta'); S.meta.offices = meta.offices;
          onDone();
        } catch (err) { busy(btn, false); showFormError(el, err); }
      });
    },
  });
}

async function viewAdmin({ el, query, stale }) {
  const tab = query.get('tab') || 'requests';
  const reload = () => router();
  const [users, offices, settings] = await Promise.all([apiGet('adminUsers'), apiGet('adminOffices'), apiGet('adminSettings')]);
  if (stale()) return;
  const pending = users.rows.filter((u) => u.status === 'pending');
  const others = users.rows.filter((u) => u.status !== 'pending' && u.status !== 'rejected');
  const tabs = [['requests', `Account requests${pending.length ? ` (${pending.length})` : ''}`], ['logins', 'Logins'], ['offices', 'Offices'], ['settings', 'Settings'], ['security', 'Security']];
  setHTML(el, h`${pageHead({ title: 'Logins & offices', sub: 'Newcastle manages every login. Staff request their own with a MAP email address; you approve them here.' })}
  <div class="tabs" role="tablist">${tabs.map(([k, t]) => h`<button role="tab" type="button" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`)}</div><div data-body></div>`);
  const body = $('[data-body]', el);
  on(el, 'click', '[data-tab]', (e, b) => { location.hash = `#/admin${b.dataset.tab === 'requests' ? '' : '?tab=' + b.dataset.tab}`; });

  if (tab === 'requests') {
    setHTML(body, pending.length ? h`<div class="grid grid-2">${pending.map((u) => h`<div class="card card-pad" data-req="${u.id}">
      <div class="row"><div class="avatar">${initials(u.full_name)}</div><div class="grow"><b>${u.full_name}</b><div class="small muted">${u.email} · username <b>${u.username}</b></div></div>${statusBadge('user_status', 'pending')}</div>
      <p class="small muted mt">Asked for <b>${S.meta.roles[u.requested_role] || u.requested_role}</b>${u.office_name ? ` in ${u.office_name}` : ''}, ${relTime(u.created_at)}.</p>
      ${u.request_note ? h`<div class="alert alert-info">${icon('message')}<div class="alert-text">${u.request_note}</div></div>` : ''}
      <div class="form-grid mt"><div class="field"><label>Role</label><select class="select" data-role>${roleOptions(false).map(([k, v]) => h`<option value="${k}" ${k === u.role ? raw('selected') : ''}>${v}</option>`)}</select></div>
        <div class="field"><label>Office</label><select class="select" data-office><option value="">None (General Sales)</option>${S.meta.offices.map((o) => h`<option value="${o.id}" ${o.id === u.office_id ? raw('selected') : ''}>${o.name}</option>`)}</select></div></div>
      <div class="row mt"><button class="btn btn-primary btn-sm" type="button" data-approve="${u.id}">${icon('check')}Approve</button><button class="btn btn-danger btn-sm" type="button" data-reject="${u.id}">Reject</button></div></div>`)}</div>`
      : h`<div class="card">${emptyState('check-circle', 'No requests waiting', `When someone with a @${settings.domain} email asks for a login, it appears here.`)}</div>`);
    on(body, 'click', '[data-approve]', async (e, b) => {
      const card = b.closest('[data-req]');
      try { await apiPost('adminUserApprove', { id: +b.dataset.approve, role: $('[data-role]', card).value, office_id: +$('[data-office]', card).value || 0 }); toast('Approved. They can sign in now.'); reload(); pollNotifications(); } catch (err) { showError(err); }
    });
    on(body, 'click', '[data-reject]', async (e, b) => {
      if (!(await confirmBox({ title: 'Reject this request?', message: 'They will not be able to sign in. They can request again later.', confirmText: 'Reject', danger: true }))) return;
      try { await apiPost('adminUserReject', { id: +b.dataset.reject }); toast('Request rejected'); reload(); pollNotifications(); } catch (err) { showError(err); }
    });
  }

  if (tab === 'logins') {
    setHTML(body, h`<div class="row-between mb"><p class="muted" style="margin:0">${plural(others.length, 'login')}. Five wrong passwords lock a login for 15 minutes.</p><button class="btn btn-primary btn-sm" type="button" data-add>${icon('plus')}Add a login</button></div><div data-t></div>`);
    mountTable($('[data-t]', body), {
      rows: others, noun: 'login', exportName: 'MAP CRM logins', columns: [
        { k: 'full_name', label: 'Name', render: (u) => h`<div class="t-title">${u.full_name}${u.is_office_account ? h` <span class="badge">Office login</span>` : ''}</div><div class="t-sub">${u.username}${u.email ? ' · ' + u.email : ''}</div>` },
        { k: 'role', label: 'Role', value: (u) => u.role_label },
        { k: 'office_name', label: 'Office', render: (u) => u.office_name || '—' },
        { k: 'status', label: 'Status', value: (u) => u.status, render: (u) => h`${statusBadge('user_status', u.status)}${u.locked ? h` <span class="badge badge-bad">${icon('lock')}Locked</span>` : ''}${u.must_change_password ? h`<div class="t-sub">Using a temporary password</div>` : ''}` },
        { k: 'last_login_at', label: 'Last sign-in', render: (u) => (u.last_login_at ? relTime(u.last_login_at) : h`<span class="muted">Never</span>`), exportValue: (u) => fmtDateTime(u.last_login_at) },
        { k: 'act', label: '', nosort: true, noexport: true, render: (u) => h`<div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
          ${u.locked ? h`<button class="btn btn-secondary btn-xs" type="button" data-unlock="${u.id}">${icon('key', 'ic-sm')}Unlock</button>` : ''}
          <button class="btn btn-ghost btn-xs" type="button" data-reset="${u.id}">${icon('key', 'ic-sm')}Reset password</button>
          <button class="icon-btn" type="button" data-edit="${u.id}" aria-label="Edit ${u.full_name}">${icon('edit', 'ic-sm')}</button></div>` },
      ],
    });
    const find = (id) => others.find((u) => u.id === +id);
    on(body, 'click', '[data-add]', () => userForm(null, reload));
    on(body, 'click', '[data-edit]', (e, b) => userForm(find(b.dataset.edit), reload));
    on(body, 'click', '[data-unlock]', async (e, b) => { try { await apiPost('adminUserUnlock', { id: +b.dataset.unlock }); toast('Unlocked'); reload(); } catch (err) { showError(err); } });
    on(body, 'click', '[data-reset]', async (e, b) => {
      const u = find(b.dataset.reset);
      if (!(await confirmBox({ title: `Reset ${u.full_name}'s password?`, message: 'They are signed out everywhere and get a temporary password, which they must change when they sign in.', confirmText: 'Reset password' }))) return;
      try { const r = await apiPost('adminUserReset', { id: u.id }); showTempPassword(u.full_name, r.temp_password); reload(); } catch (err) { showError(err); }
    });
  }

  if (tab === 'offices') {
    setHTML(body, h`<div class="row-between mb"><p class="muted" style="margin:0">Each office has its own secure area. Add an office for advisers working from somewhere new.</p><button class="btn btn-primary btn-sm" type="button" data-add>${icon('plus')}Add an office</button></div>
      <div class="grid grid-3">${offices.rows.map((o) => h`<div class="card card-pad card-accent"><div class="row-between"><b style="font-size:17px">${o.name}</b>${o.active ? h`<span class="badge badge-ok">Open</span>` : h`<span class="badge">Closed</span>`}</div>
        <p class="small muted mt-sm">${o.address || 'No address'}${o.phone ? ` · ${o.phone}` : ''}</p>
        <div class="mini-stats"><div><b>${o.staff}</b><span>Staff</span></div><div><b>${o.clients}</b><span>Clients</span></div><div><b>${o.active_cases}</b><span>Live cases</span></div><div></div></div>
        <button class="btn btn-ghost btn-xs mt" type="button" data-edit="${o.id}">${icon('edit', 'ic-sm')}Edit</button></div>`)}</div>`);
    on(body, 'click', '[data-add]', () => officeForm(null, reload));
    on(body, 'click', '[data-edit]', (e, b) => officeForm(offices.rows.find((o) => o.id === +b.dataset.edit), reload));
  }

  if (tab === 'settings') {
    setHTML(body, h`<section class="card" style="max-width:720px"><div class="card-body"><form class="stack" id="setForm">
      <label class="check"><input type="checkbox" name="require_approval" ${settings.require_approval ? raw('checked') : ''}><span><b>Newcastle must approve new account requests</b><br><span class="small">Strongly recommended. The CRM can't send emails, so it can't check that the person really owns the @${settings.domain} address they typed. With approval off, anyone who types a MAP address gets straight in (office manager requests always need approval).</span></span></label>
      <div class="form-grid"><div class="field"><label for="st-t">Team workload limit (points)</label><input class="input" id="st-t" name="team_threshold" value="${settings.team_threshold}" inputmode="numeric"><div class="field-hint">A person is "overloaded" at this many points. Live case = 1, open task = 0.5, overdue task = 2.</div><div class="field-error" hidden></div></div>
        <div class="field"><label for="st-q">A case has "gone quiet" after (days)</label><input class="input" id="st-q" name="quiet_days" value="${settings.quiet_days}" inputmode="numeric"><div class="field-error" hidden></div></div></div>
      <div><button class="btn btn-primary" type="submit">${icon('check')}Save settings</button></div></form></div></section>
      <p class="small muted mt">Server: PHP ${settings.php_version}, SQLite ${settings.sqlite_version}${settings.https ? ', secure connection (https)' : ''}.</p>`);
    $('#setForm', body).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try { await apiPost('adminSettingsSave', { require_approval: f.require_approval.checked, team_threshold: +f.team_threshold.value, quiet_days: +f.quiet_days.value }); toast('Settings saved'); } catch (err) { showFormError(f, err); }
    });
  }

  if (tab === 'security') {
    setHTML(body, h`<div class="grid grid-2">
      <section class="card"><div class="card-head"><div><h2>Recovery code</h2><div class="sub">Held by Newcastle</div></div></div><div class="card-body">
        <p class="muted">If the Newcastle password is ever forgotten, the recovery code resets it from the sign-in page ("Forgot password?"). Each code works once.</p>
        <button class="btn btn-secondary" type="button" data-newcode>${icon('key')}Make a new recovery code</button><p class="small muted mt">Making a new code stops the old one working.</p></div></section>
      <section class="card"><div class="card-head"><h2>How logins are protected</h2></div><div class="card-body"><ul class="small" style="padding-left:18px;margin:0;display:grid;gap:6px">
        <li>Passwords are stored as one-way hashes (bcrypt), never as plain text.</li>
        <li>Five wrong passwords lock a login for 15 minutes; repeated failures from one connection are blocked too.</li>
        <li>Only @${settings.domain} email addresses can request a login${settings.require_approval ? ', and you approve each one' : ''}.</li>
        <li>Each office sees only its own clients; General Sales cannot open client files.</li>
        <li>Every sign-in, change, deletion, lookup and download is in the audit log, against the person who did it.</li>
        <li>${settings.https ? 'This site uses a secure (https) connection.' : h`<b class="risk-high">This site is not using https.</b> Ask your web host to switch on SSL.`}</li></ul></div></section></div>`);
    on(body, 'click', '[data-newcode]', async () => {
      if (!(await confirmBox({ title: 'Make a new recovery code?', message: 'The current code will stop working straight away.', confirmText: 'Make a new code' }))) return;
      try {
        const r = await apiPost('adminRecoveryNew');
        modal({ title: 'New recovery code', size: 'narrow', dismissable: false, body: h`<div class="code-box">${r.code}</div><p class="small muted mt">Write it down and keep it safe. It will not be shown again.</p>`,
          foot: h`<button class="btn btn-secondary" type="button" data-copy>${icon('copy')}Copy</button><button class="btn btn-primary" type="button" data-close>I've saved it</button>`,
          onMount(m) { on(m, 'click', '[data-copy]', () => copyText(r.code)); } });
      } catch (err) { showError(err); }
    });
  }
}
