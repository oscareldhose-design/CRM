/* MAP website admin panel: CRM logins. The admin login approves login requests, manages every login and office,
   the CRM settings, the recovery code and full backups. Everything shown is escaped before it reaches the page. */
(function () {
  'use strict';
  var script = document.currentScript;
  var API = (script && script.dataset.api) || 'api.php';
  var SIGNIN = (script && script.dataset.signin) || './';
  var $ = function (id) { return document.getElementById(id); };
  if (!$('crm-logins-section')) return;

  var ROLES = { adviser: 'Adviser', administrator: 'Administrator', manager: 'Office manager', sales: 'General Sales', webadmin: 'Website admin' };
  var REQUEST_ROLES = ['adviser', 'administrator', 'manager', 'sales'];
  var OFFICE_ROLES = ['manager', 'adviser', 'administrator'];
  var ADVICE = [['mortgage_protection', 'Mortgage & protection'], ['protection', 'Protection only']];
  var adviceLabel = function (k) { return k === 'protection' ? 'Protection only' : 'Mortgage & protection'; };
  // The whole-office logins (newcastle, nottingham, london). The admin login has no email either, but isn't one.
  var isOffice = function (u) { return !!u.is_office_account && u.role !== 'webadmin'; };
  var state = { users: [], offices: [], settings: null, pendingKey: '' };

  /* ---- Helpers ---------------------------------------------------------------------------------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  function when(iso) {
    if (!iso) return 'never';
    var d = new Date(iso);
    return isNaN(d) ? String(iso) : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function options(pairs, selected) {
    var sel = selected == null ? '' : String(selected);
    return pairs.map(function (p) { return '<option value="' + esc(p[0]) + '"' + (String(p[0]) === sel ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('');
  }
  function officePairs(current) {
    return [['', 'Choose an office…']].concat(state.offices.filter(function (o) { return +o.active === 1 || +o.id === +current; })
      .map(function (o) { return [o.id, o.name + (+o.active === 1 ? '' : ' (closed)')]; }));
  }
  function say(el, text, type) { if (el) { el.textContent = text; el.className = 'status show ' + (type || 'info'); } }
  function hush(el) { if (el) { el.textContent = ''; el.className = 'status'; } }
  function busy(btn, on, text) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = text || 'Working…'; btn.disabled = true; } else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }
  function api(action, body) {
    var opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'X-MAP-CRM': '1', Accept: 'application/json' } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(API + '?action=' + encodeURIComponent(action), opts)
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: 'The server sent an unexpected answer (' + r.status + ').' }; }); },
        function () { return { ok: false, message: 'Could not reach the server. Check your connection and try again.' }; })
      .then(function (r) {
        if (r && r.ok) return r;
        if (r && r.code === 'signed_out') location.href = SIGNIN + '?next=website-admin';
        var err = new Error((r && r.message) || 'Something went wrong.');
        err.field = r && r.field;
        throw err;
      });
  }

  /* ---- Dialog ----------------------------------------------------------------------------------- */
  var layer = $('crmDialog'), dlgBody = $('crmDialogBody'), dismissable = true, lastFocus = null;
  function openDialog(title, html, locked) {
    lastFocus = document.activeElement;
    dismissable = !locked;
    $('crmDialogTitle').textContent = title;
    dlgBody.innerHTML = html;
    layer.classList.add('show');
    var first = dlgBody.querySelector('[autofocus]') || dlgBody.querySelector('input, select, button');
    if (first) first.focus();
  }
  function closeDialog() {
    layer.classList.remove('show');
    dlgBody.innerHTML = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  layer.addEventListener('mousedown', function (e) { if (e.target === layer && dismissable) closeDialog(); });
  layer.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) closeDialog();
    var copy = e.target.closest('[data-copy]');
    if (copy) {
      var text = copy.dataset.copy;
      var done = function () { copy.textContent = 'Copied ✓'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { selectCode(); });
      else selectCode();
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && layer.classList.contains('show') && dismissable) closeDialog(); });
  function selectCode() {
    var code = dlgBody.querySelector('.crm-code');
    if (code && window.getSelection) { var r = document.createRange(); r.selectNodeContents(code); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
  }
  function confirmDialog(title, message, confirmText, danger) {
    return new Promise(function (resolve) {
      openDialog(title, '<p class="muted">' + esc(message) + '</p><div class="actions" style="margin-top:4px"><button class="btn ' + (danger ? 'danger' : 'primary') + '" type="button" data-yes>' + esc(confirmText) + '</button><button class="btn ghost" type="button" data-close>Cancel</button></div>');
      var settled = false, watch = new MutationObserver(function () { if (!layer.classList.contains('show')) finish(false); });
      var finish = function (v) { if (!settled) { settled = true; watch.disconnect(); resolve(v); } };
      watch.observe(layer, { attributes: true, attributeFilter: ['class'] });
      dlgBody.querySelector('[data-yes]').addEventListener('click', function () { finish(true); closeDialog(); });
    });
  }
  function showSecret(title, intro, secret, after, locked) {
    openDialog(title, '<p class="muted">' + esc(intro) + '</p><div class="crm-code">' + esc(secret) + '</div>' +
      '<div class="key-hint" style="margin-top:0">It is only shown once.</div>' +
      '<div class="actions" style="margin-top:4px"><button class="btn primary" type="button" data-done>' + (locked ? 'I\'ve saved it' : 'Done') + '</button><button class="btn ghost" type="button" data-copy="' + esc(secret) + '">Copy</button></div>', locked);
    dlgBody.querySelector('[data-done]').addEventListener('click', function () { closeDialog(); if (after) after(); });
  }
  function field(id, label, control, cls, hint) {
    return '<div class="field ' + (cls || '') + '"><label for="' + id + '">' + esc(label) + '</label>' + control + (hint ? '<div class="key-hint" style="margin-top:0">' + esc(hint) + '</div>' : '') + '</div>';
  }
  function formError(form, statusEl, err) {
    say(statusEl, err.message, 'error');
    var bad = err.field && form.querySelector('[name="' + err.field + '"]');
    if (bad) bad.focus();
  }

  /* ---- Counts and badges ------------------------------------------------------------------------ */
  function updateCounts(pending) {
    var n = pending.length;
    ['crmPendingBadge', 'crmPendingTab'].forEach(function (id) { var b = $(id); if (b) { b.textContent = n; b.hidden = n === 0; } });
    if ($('crmStatPending')) $('crmStatPending').textContent = n;
    if ($('crmPendingCount')) $('crmPendingCount').textContent = n + ' waiting';
    var notice = $('crmPendingNotice');
    if (notice) {
      notice.hidden = n === 0;
      $('crmPendingNoticeText').textContent = n === 1 ? '1 person is waiting for a CRM login.' : n + ' people are waiting for a CRM login.';
    }
  }

  /* ---- Login requests --------------------------------------------------------------------------- */
  function renderRequests() {
    var pending = state.users.filter(function (u) { return u.status === 'pending'; });
    updateCounts(pending);
    state.pendingKey = pending.map(function (u) { return u.id; }).join(',');
    $('crmRequestEmpty').hidden = pending.length > 0;
    $('crmRequestList').innerHTML = pending.map(function (u) {
      var id = 'crmReq' + u.id;
      return '<div class="item" data-id="' + u.id + '">' +
        '<div class="item-head"><div class="crm-person"><span class="crm-avatar" aria-hidden="true">' + esc(initials(u.full_name)) + '</span><div><h4>' + esc(u.full_name) + '</h4>' +
        '<small>' + esc(u.email) + ' · username <b>' + esc(u.username) + '</b> · asked ' + esc(when(u.created_at)) + '</small></div></div>' +
        '<div class="crm-chips"><span class="chip ' + (u.advice_type === 'protection' ? 'info' : 'live') + '">' + esc(adviceLabel(u.advice_type)) + '</span><span class="chip draft">Waiting</span></div></div>' +
        '<div class="form-grid">' +
        field(id + 'Office', 'Office', '<select id="' + id + 'Office" data-f="office_id">' + options(officePairs(), '') + '</select>', 'third') +
        field(id + 'Role', 'Role', '<select id="' + id + 'Role" data-f="role">' + options(REQUEST_ROLES.map(function (r) { return [r, ROLES[r]]; }), 'adviser') + '</select>', 'third') +
        field(id + 'Advice', 'Advice they give', '<select id="' + id + 'Advice" data-f="advice_type">' + options(ADVICE, u.advice_type) + '</select>', 'third') +
        '</div><div class="row-actions"><button class="btn primary" type="button" data-act="approve">✓ Approve</button><button class="btn danger" type="button" data-act="reject">Reject</button></div>' +
        '<div class="status" data-status style="margin-top:0"></div></div>';
    }).join('');
  }
  $('crmRequestList').addEventListener('change', function (e) {
    if (e.target.dataset.f !== 'role') return;
    var office = e.target.closest('.item').querySelector('[data-f="office_id"]');
    office.disabled = OFFICE_ROLES.indexOf(e.target.value) < 0;
    if (office.disabled) office.value = '';
  });
  $('crmRequestList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var item = btn.closest('.item'), id = +item.dataset.id, st = item.querySelector('[data-status]');
    var u = state.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    var get = function (f) { return item.querySelector('[data-f="' + f + '"]').value; };
    if (btn.dataset.act === 'approve') {
      var role = get('role'), office = +get('office_id') || 0;
      if (OFFICE_ROLES.indexOf(role) >= 0 && !office) { say(st, 'Choose which office ' + u.full_name.split(' ')[0] + ' works in.', 'error'); item.querySelector('[data-f="office_id"]').focus(); return; }
      busy(btn, true, 'Approving…');
      api('adminUserApprove', { id: id, role: role, office_id: office, advice_type: get('advice_type') })
        .then(function () { say($('crmRequestStatus'), u.full_name + ' is approved and can sign in now with the username "' + u.username + '".', 'ok'); return load(); })
        .catch(function (err) { busy(btn, false); say(st, err.message, 'error'); });
    } else {
      confirmDialog('Reject ' + u.full_name + '?', 'They will not be able to sign in. They can ask again later.', 'Reject request', true).then(function (yes) {
        if (!yes) return;
        api('adminUserReject', { id: id })
          .then(function () { say($('crmRequestStatus'), 'The request from ' + u.full_name + ' was rejected.', 'info'); return load(); })
          .catch(function (err) { say(st, err.message, 'error'); });
      });
    }
  });

  /* ---- Logins ------------------------------------------------------------------------------------ */
  function loginItem(u) {
    var chips = ['<span class="chip">' + esc(isOffice(u) ? 'Office login' : (ROLES[u.role] || u.role_label)) + '</span>'];
    if (u.office_name) chips.push('<span class="chip">🏢 ' + esc(u.office_name) + '</span>');
    if (u.role !== 'webadmin' && !isOffice(u)) chips.push('<span class="chip' + (u.advice_type === 'protection' ? ' info' : '') + '">' + esc(adviceLabel(u.advice_type)) + '</span>');
    chips.push(u.status === 'active' ? '<span class="chip live">Active</span>' : '<span class="chip expired">Switched off</span>');
    if (u.locked) chips.push('<span class="chip expired">🔒 Locked</span>');
    if (u.must_change_password) chips.push('<span class="chip draft">Temporary password</span>');
    return '<div class="item" data-id="' + u.id + '"><div class="item-head"><div class="crm-person"><span class="crm-avatar" aria-hidden="true">' + esc(initials(u.full_name)) + '</span>' +
      '<div><h4>' + esc(u.full_name) + '</h4><small>' + esc(u.username) + (u.email ? ' · ' + esc(u.email) : '') + ' · last sign-in ' + esc(when(u.last_login_at)) + '</small></div></div>' +
      '<div class="crm-chips">' + chips.join('') + '</div></div><div class="row-actions">' +
      (u.locked ? '<button class="btn warn" type="button" data-act="unlock">Unlock</button>' : '') +
      '<button class="btn ghost" type="button" data-act="reset">🔑 Reset password</button><button class="btn ghost" type="button" data-act="edit">✏️ Edit</button></div></div>';
  }
  function renderLogins() {
    var q = $('crmLoginSearch').value.trim().toLowerCase(), f = $('crmLoginFilter').value;
    var rows = state.users.filter(function (u) {
      if (u.status !== 'active' && u.status !== 'disabled') return false;
      if (q && (u.full_name + ' ' + u.username + ' ' + (u.email || '') + ' ' + (u.office_name || '')).toLowerCase().indexOf(q) < 0) return false;
      if (f === 'office') return isOffice(u);
      if (f === 'staff') return !isOffice(u) && u.role !== 'webadmin';
      if (f === 'protection') return !isOffice(u) && u.role !== 'webadmin' && u.advice_type === 'protection';
      if (f === 'disabled') return u.status === 'disabled';
      if (f === 'locked') return u.locked;
      return true;
    });
    var groups = [
      ['Office logins', 'One login for each whole office. It sees every client, case and task in that office.', rows.filter(isOffice)],
      ['Advisers & staff', 'Each person signs in with their own login and sees their own office.', rows.filter(function (u) { return !isOffice(u) && u.role !== 'webadmin'; })],
      ['Admin logins', 'Open this admin panel. They don\'t use the CRM itself.', rows.filter(function (u) { return u.role === 'webadmin'; })],
    ];
    var html = groups.filter(function (g) { return g[2].length; }).map(function (g) {
      return '<div class="adm-section-divider">' + esc(g[0]) + ' · ' + g[2].length + '</div><p class="adm-hint">' + esc(g[1]) + '</p><div class="list" style="margin-top:0">' + g[2].map(loginItem).join('') + '</div>';
    }).join('');
    $('crmLoginGroups').innerHTML = html || '<p class="muted" style="margin:18px 0 0">No logins match.</p>';
  }
  $('crmLoginSearch').addEventListener('input', renderLogins);
  $('crmLoginFilter').addEventListener('change', renderLogins);
  $('crmAddLoginBtn').addEventListener('click', function () { loginForm(null); });
  $('crmLoginGroups').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var id = +btn.closest('.item').dataset.id, st = $('crmLoginStatus');
    var u = state.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    if (btn.dataset.act === 'edit') loginForm(u);
    if (btn.dataset.act === 'unlock') {
      api('adminUserUnlock', { id: id }).then(function () { say(st, u.full_name + ' is unlocked.', 'ok'); return load(); }).catch(function (err) { say(st, err.message, 'error'); });
    }
    if (btn.dataset.act === 'reset') {
      confirmDialog('Reset ' + u.full_name + '\'s password?', 'They are signed out everywhere and get a temporary password, which they must change when they next sign in.', 'Reset password').then(function (yes) {
        if (!yes) return;
        api('adminUserReset', { id: id }).then(function (r) {
          showSecret('Temporary password for ' + u.full_name, 'Give this to them in person or by phone. They sign in with username "' + u.username + '" and choose their own password.', r.temp_password);
          return load();
        }).catch(function (err) { say(st, err.message, 'error'); });
      });
    }
  });

  function loginForm(u) {
    var isNew = !u, office = !!u && isOffice(u), noEmail = !!u && !!u.is_office_account, domain = (state.settings && state.settings.domain) || 'themaap.co.uk';
    var v = u || { full_name: '', email: '', username: '', role: 'adviser', office_id: '', advice_type: 'mortgage_protection', status: 'active' };
    var roles = Object.keys(ROLES).map(function (r) { return [r, ROLES[r]]; });
    var html = '<form class="form-grid" id="crmLoginForm" novalidate>' +
      field('crmLfName', 'Full name', '<input id="crmLfName" name="full_name" autocomplete="off" required value="' + esc(v.full_name) + '" autofocus>', 'half') +
      field('crmLfEmail', noEmail ? 'Email (optional)' : 'MAP email', '<input id="crmLfEmail" name="email" type="email" autocomplete="off" placeholder="name@' + esc(domain) + '" value="' + esc(v.email || '') + '">', 'half') +
      field('crmLfUser', 'Username', '<input id="crmLfUser" name="username" autocomplete="off" autocapitalize="none" spellcheck="false" required value="' + esc(v.username) + '">', 'half') +
      (office ? '' : field('crmLfRole', 'Role', '<select id="crmLfRole" name="role">' + options(roles, v.role) + '</select>', 'half')) +
      field('crmLfOffice', 'Office', '<select id="crmLfOffice" name="office_id">' + options(officePairs(v.office_id), v.office_id || '') + '</select>', 'half', office ? '' : 'Not needed for General Sales or website admin logins.') +
      (office || v.role === 'webadmin' ? '' : field('crmLfAdvice', 'Advice they give', '<select id="crmLfAdvice" name="advice_type">' + options(ADVICE, v.advice_type) + '</select>', 'half', 'Protection only hides everything to do with mortgages in their CRM.')) +
      field('crmLfStatus', 'Login', '<select id="crmLfStatus" name="status">' + options([['active', 'Active'], ['disabled', 'Switched off']], v.status) + '</select>', 'half') +
      '</form><div class="status" id="crmLfMsg" style="margin-top:0"></div>' +
      '<div class="actions" style="margin-top:4px"><button class="btn primary" type="button" id="crmLfSave">Save login</button><button class="btn ghost" type="button" data-close>Cancel</button></div>' +
      (isNew ? '<div class="key-hint" style="margin-top:0">New logins need a @' + esc(domain) + ' email. They get a temporary password and choose their own when they first sign in.</div>' : '');
    openDialog(isNew ? 'Add a login' : (office ? 'Edit the ' + u.full_name + ' office login' : 'Edit ' + u.full_name), html);
    var form = $('crmLoginForm'), role = form.querySelector('[name="role"]'), officeSel = form.querySelector('[name="office_id"]');
    var sync = function () {
      if (!role) return;
      officeSel.disabled = OFFICE_ROLES.indexOf(role.value) < 0;
      if (officeSel.disabled) officeSel.value = '';
      var advice = form.querySelector('[name="advice_type"]');
      if (advice) advice.closest('.field').hidden = role.value === 'webadmin';
    };
    if (role) role.addEventListener('change', sync);
    sync();
    if (isNew) {
      var email = form.querySelector('[name="email"]'), user = form.querySelector('[name="username"]'), touched = false;
      user.addEventListener('input', function () { touched = true; });
      email.addEventListener('input', function () { if (!touched) user.value = email.value.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32); });
    }
    $('crmLfSave').addEventListener('click', function () {
      var btn = this, val = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
      var data = { id: u ? u.id : 0, full_name: val('full_name'), email: val('email'), username: val('username').toLowerCase(), role: role ? role.value : v.role,
        office_id: +val('office_id') || 0, advice_type: form.querySelector('[name="advice_type"]') ? val('advice_type') : v.advice_type, status: val('status') };
      busy(btn, true, 'Saving…');
      api('adminUserSave', data).then(function (r) {
        closeDialog();
        say($('crmLoginStatus'), 'Login saved for ' + data.full_name + '.', 'ok');
        if (r.temp_password) showSecret('Temporary password for ' + data.full_name, 'Give this to them in person or by phone. They sign in with username "' + data.username + '" and choose their own password.', r.temp_password);
        return load();
      }).catch(function (err) { busy(btn, false); formError(form, $('crmLfMsg'), err); });
    });
  }

  /* ---- Offices and settings ---------------------------------------------------------------------- */
  function renderOffices() {
    $('crmOfficeList').innerHTML = state.offices.map(function (o) {
      return '<div class="item" data-id="' + o.id + '"><div class="item-head"><h4>' + esc(o.name) + '</h4>' + (+o.active === 1 ? '<span class="chip live">Open</span>' : '<span class="chip">Closed</span>') + '</div>' +
        '<small>' + esc(o.address || 'No address') + (o.phone ? ' · ' + esc(o.phone) : '') + '</small>' +
        '<div class="crm-mini"><div><b>' + (+o.staff) + '</b><span>Logins</span></div><div><b>' + (+o.clients) + '</b><span>Clients</span></div><div><b>' + (+o.active_cases) + '</b><span>Live cases</span></div></div>' +
        '<div class="row-actions"><button class="btn ghost" type="button" data-act="edit">✏️ Edit</button></div></div>';
    }).join('');
    var s = state.settings;
    if (s) {
      $('crmTeamThreshold').value = s.team_threshold;
      $('crmQuietDays').value = s.quiet_days;
      $('crmServerInfo').textContent = 'Server: PHP ' + s.php_version + ', SQLite ' + s.sqlite_version + (s.https ? ', secure connection (https).' : '. This site is not on https yet: switch it on with your host.');
      $('crmRecoveryState').textContent = s.recovery_set ? 'A recovery code is set. Making a new one stops the old one working.' : 'There is no recovery code yet. Make one and keep it somewhere safe.';
    }
  }
  function officeForm(o) {
    var v = o || { name: '', phone: '', address: '', active: 1 };
    openDialog(o ? 'Edit ' + o.name : 'Add an office', '<form class="form-grid" id="crmOfForm" novalidate>' +
      field('crmOfName', 'Office name', '<input id="crmOfName" name="name" required value="' + esc(v.name) + '" autofocus>', 'half') +
      field('crmOfPhone', 'Phone', '<input id="crmOfPhone" name="phone" type="tel" value="' + esc(v.phone || '') + '">', 'half') +
      field('crmOfAddress', 'Address', '<input id="crmOfAddress" name="address" value="' + esc(v.address || '') + '">') +
      '<label class="crm-check field"><input type="checkbox" name="active"' + (+v.active === 1 ? ' checked' : '') + '><span>Office is open (it shows in the CRM)</span></label>' +
      '</form><div class="status" id="crmOfMsg" style="margin-top:0"></div><div class="actions" style="margin-top:4px"><button class="btn primary" type="button" id="crmOfSave">Save office</button><button class="btn ghost" type="button" data-close>Cancel</button></div>' +
      '<div class="key-hint" style="margin-top:0">Each office sees only its own clients. Closing an office signs out its staff until their logins are moved.</div>');
    var form = $('crmOfForm'), val = function (n) { return form.querySelector('[name="' + n + '"]').value.trim(); };
    $('crmOfSave').addEventListener('click', function () {
      var btn = this;
      busy(btn, true, 'Saving…');
      api('adminOfficeSave', { id: o ? +o.id : 0, name: val('name'), phone: val('phone'), address: val('address'), active: form.querySelector('[name="active"]').checked })
        .then(function () { closeDialog(); say($('crmOfficeStatus'), 'Office saved.', 'ok'); return load(); })
        .catch(function (err) { busy(btn, false); formError(form, $('crmOfMsg'), err); });
    });
  }
  $('crmAddOfficeBtn').addEventListener('click', function () { officeForm(null); });
  $('crmOfficeList').addEventListener('click', function (e) {
    if (!e.target.closest('[data-act="edit"]')) return;
    var id = +e.target.closest('.item').dataset.id;
    officeForm(state.offices.filter(function (o) { return +o.id === id; })[0]);
  });
  $('crmSettingsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('crmSettingsSave'), form = e.target;
    busy(btn, true, 'Saving…');
    api('adminSettingsSave', { team_threshold: +$('crmTeamThreshold').value, quiet_days: +$('crmQuietDays').value })
      .then(function () { busy(btn, false); say($('crmSettingsStatus'), 'Settings saved.', 'ok'); })
      .catch(function (err) { busy(btn, false); formError(form, $('crmSettingsStatus'), err); });
  });

  /* ---- Security ----------------------------------------------------------------------------------- */
  $('crmNewRecoveryBtn').addEventListener('click', function () {
    confirmDialog('Make a new recovery code?', 'The old code stops working straight away. Write the new one down and keep it somewhere safe, away from this computer.', 'Make a new code').then(function (yes) {
      if (!yes) return;
      api('adminRecoveryNew', {}).then(function (r) {
        showSecret('Your new recovery code', 'If the admin password is ever forgotten, use this on the sign-in page ("Forgot password?") to set a new one.', r.code);
        return load();
      }).catch(function (err) { say($('crmSecurityStatus'), err.message, 'error'); });
    });
  });
  function checkRecoveryCode() {
    api('status').then(function (r) {
      if (!r.recovery_code) return;
      showSecret('Save your recovery code', 'This is the recovery code for the admin login. If the admin password is ever forgotten, it resets it from the sign-in page ("Forgot password?"). Write it down and keep it somewhere safe.',
        r.recovery_code, function () { api('ackRecovery', {}).catch(function () { /* shown again next time */ }); }, true);
    }).catch(function () { /* not critical */ });
  }

  /* ---- Loading ------------------------------------------------------------------------------------ */
  function load() {
    return Promise.all([api('adminUsers'), api('adminOffices'), api('adminSettings')]).then(function (res) {
      state.users = res[0].rows;
      state.offices = res[1].rows;
      state.settings = res[2];
      renderRequests();
      renderLogins();
      renderOffices();
    }).catch(function (err) { say($('crmLoginStatus'), 'Could not load the CRM logins: ' + err.message, 'error'); });
  }
  // Pick up new requests when the admin comes back to the tab, without wiping a request they are filling in.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || layer.classList.contains('show')) return;
    api('adminUsers').then(function (r) {
      state.users = r.rows;
      var key = r.rows.filter(function (u) { return u.status === 'pending'; }).map(function (u) { return u.id; }).join(',');
      if (key !== state.pendingKey) renderRequests();
      renderLogins();
    }).catch(function () { /* try again next time */ });
  });
  var review = $('crmReviewRequestsBtn');
  if (review) review.addEventListener('click', function () {
    var link = document.querySelector('.sidebar-link[data-target="crm-requests-section"]');
    if (link) link.click();
  });
  // If the website part of the panel can't start (for example Firebase can't be reached), keep the tabs working
  // so logins can still be managed.
  window.addEventListener('load', function () {
    if (document.documentElement.dataset.panelReady) return;
    var show = function (tab) {
      document.querySelectorAll('#dashboardTabs .tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
      document.querySelectorAll('.section-card[data-tab]').forEach(function (s) { s.classList.toggle('is-hidden', s.dataset.tab !== tab); });
    };
    document.querySelectorAll('#dashboardTabs .tab-btn').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.tab); }); });
    document.querySelectorAll('.sidebar-link[data-target]').forEach(function (l) {
      l.addEventListener('click', function () {
        var target = $(l.dataset.target);
        if (!target) return;
        show(target.dataset.tab);
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    show('logins');
  });
  load().then(checkRecoveryCode);
})();
