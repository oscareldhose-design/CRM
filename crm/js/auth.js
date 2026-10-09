/* MAP Operating System: sign-in, account requests, password recovery and start-up. */
'use strict';

const THEME_KEY = 'map_crm_theme';
function getTheme() { try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } }
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* private mode */ }
  $$('[data-theme-icon]').forEach((el) => setHTML(el, icon(t === 'dark' ? 'sun' : 'moon')));
}
function toggleTheme() { applyTheme(getTheme() === 'dark' ? 'light' : 'dark'); }
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-toggle-theme]')) toggleTheme();
  if (e.target.closest('[data-reload]')) location.reload();
});

function pwScore(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
  return pw ? Math.max(1, s) : 0;
}
function pwRulesOk(pw) { return pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw); }
function pwFeedback(root, inputSel) {
  const input = $(inputSel, root);
  const meter = $('.pw-meter', root);
  const rules = $('.pw-rules', root);
  const update = () => {
    const v = input.value;
    meter.dataset.score = pwScore(v);
    setHTML(rules, h`${[['8+ characters', v.length >= 8], ['Upper & lower case', /[a-z]/.test(v) && /[A-Z]/.test(v)], ['A number', /\d/.test(v)]]
      .map(([t, ok]) => h`<span class="${ok ? 'ok' : ''}">${icon(ok ? 'check' : 'x', 'ic-sm')}${t}</span>`)}`);
  };
  input.addEventListener('input', update);
  update();
}
function passwordInput(id, name, labelText, autocomplete, extra = '') {
  return h`<div class="field"><label for="${id}">${labelText}</label>
    <div class="input-icon has-reveal">${icon('lock')}<input class="input" id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" required ${raw(extra)}>
    <button type="button" class="reveal" data-reveal="${id}" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div>
    <div class="field-error" hidden></div></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-reveal]');
  if (!b) return;
  const input = document.getElementById(b.dataset.reveal);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.setAttribute('aria-pressed', String(show));
  b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  setHTML(b, icon(show ? 'eye-off' : 'eye'));
});
function capsWatch(root) {
  root.addEventListener('keyup', (e) => {
    if (!e.getModifierState) return;
    const caps = e.getModifierState('CapsLock');
    $$('.caps', root).forEach((el) => { el.hidden = !caps; });
  });
}

/* ---------- Sign-in page ---------- */
function authLayout(cardContent) {
  return h`<div class="auth">
    <section class="auth-side"><div class="auth-card" id="authCard">
      <div class="auth-brand"><img src="assets/map-logo.svg" alt="MAP: Your way home" width="64" height="68"></div>
      ${cardContent}</div></section>
  </div>
  <button class="theme-fab" type="button" data-toggle-theme aria-label="Switch light or dark mode"><span data-theme-icon>${icon(getTheme() === 'dark' ? 'sun' : 'moon')}</span></button>`;
}
function shakeCard() { const c = $('#authCard'); if (!c) return; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
function authAlert(root, message, kind = 'bad') {
  const box = $('[data-auth-alert]', root);
  if (!box) return;
  if (!message) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.className = `alert alert-${kind}`;
  box.setAttribute('role', kind === 'bad' || kind === 'warn' ? 'alert' : 'status'); // read out by screen readers
  setHTML(box, h`${icon(kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'alert')}<div class="alert-text">${message}</div>`);
}

function showLogin(opts = {}) {
  document.title = 'Sign in · MAP Operating System';
  stopPolling();
  const app = $('#app');
  const tab = opts.tab || 'signin';
  const card = tab === 'forgot' ? forgotPanel() : h`
    <div class="auth-tabs" role="tablist">
      <button role="tab" type="button" data-auth-tab="signin" aria-selected="${tab === 'signin'}">Sign in</button>
      <button role="tab" type="button" data-auth-tab="request" aria-selected="${tab === 'request'}">Request access</button>
    </div>
    ${tab === 'request' ? requestPanel() : signinPanel(opts)}`;
  setHTML(app, authLayout(card));
  const root = $('#authCard');
  on(root, 'click', '[data-auth-tab]', (e, b) => showLogin({ tab: b.dataset.authTab }));
  on(root, 'click', '[data-go-forgot]', () => showLogin({ tab: 'forgot' }));
  on(root, 'click', '[data-go-signin]', () => showLogin({ tab: 'signin' }));
  capsWatch(root);
  if (tab === 'signin') wireSignin(root, opts);
  if (tab === 'request') wireRequest(root);
  if (tab === 'forgot') wireForgot(root);
  if (S.status && !S.status.https && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    authAlert(root, 'This page is not using a secure connection. Open the CRM with an address that starts https:// before signing in.', 'warn');
  }
}

function signinPanel(opts) {
  return h`<h2>Welcome back</h2><p class="sub">Sign in with your MAP username and password.</p>
    <form class="auth-form" id="signinForm" novalidate>
      <div class="alert" data-auth-alert hidden></div>
      <div class="field"><label for="si-user">Username</label>
        <div class="input-icon">${icon('user')}<input class="input" id="si-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${opts.username || ''}"></div></div>
      ${passwordInput('si-pass', 'password', 'Password', 'current-password')}
      <div class="caps" hidden>${icon('alert', 'ic-sm')}Caps Lock is on</div>
      <div class="row-between"><label class="check"><input type="checkbox" name="remember"><span>Keep me signed in for 30 days</span></label>
        <button type="button" class="link-btn" data-go-forgot>Forgot password?</button></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('lock')}Sign in</button>
    </form>
    <div class="auth-foot"><span class="lock">${icon('shield', 'ic-sm')}Secure sign-in. Five wrong passwords lock the login for 15 minutes.</span></div>`;
}
function wireSignin(root, opts) {
  const form = $('#signinForm', root);
  if (opts.message) authAlert(root, opts.message, opts.messageKind || 'info');
  // Not when someone (or their password manager) is already in a box: their typing would land in the other one.
  setTimeout(() => { if (!root.contains(document.activeElement)) (opts.username ? $('#si-pass', root) : $('#si-user', root)).focus(); }, 50);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    authAlert(root, '');
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) { authAlert(root, 'Enter your username and password.'); shakeCard(); return; }
    const btn = $('button[type=submit]', form);
    busy(btn, true, 'Signing in…');
    try {
      const res = await apiPost('login', { username, password, remember: form.remember.checked }, { quiet: true });
      S.status.user = res.user;
      const st = await apiGet('status', null, { quiet: true });
      S.status = st;
      await enterApp();
    } catch (err) {
      busy(btn, false);
      form.password.value = '';
      authAlert(root, err.message, err.code === 'pending' ? 'info' : 'bad');
      shakeCard();
      form.password.focus();
    }
  });
}

function requestPanel() {
  const domain = (S.status && S.status.domain) || 'themaap.co.uk';
  return h`<h2>Request a login</h2>
    <p class="sub">For MAP staff with a <b>@${domain}</b> email address. The MAP admin approves every request before it can be used.</p>
    <form class="auth-form" id="requestForm" novalidate>
      <div class="alert" data-auth-alert hidden></div>
      <div class="field"><label for="rq-name">Full name</label><div class="input-icon">${icon('user')}<input class="input" id="rq-name" name="full_name" autocomplete="name" maxlength="80" required></div><div class="field-error" hidden></div></div>
      <div class="field"><label for="rq-email">MAP email address</label>
        <div class="domain-input"><input class="input" id="rq-email" name="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="firstname.lastname" required><span class="suffix">@${domain}</span></div>
        <div class="field-hint">Only @${domain} addresses can request an account.</div><div class="field-error" hidden></div></div>
      <div class="field"><label for="rq-user">Choose a username</label><div class="input-icon">${icon('key')}<input class="input" id="rq-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="32" required></div>
        <div class="field-hint">You'll sign in with this. Letters, numbers, dots or dashes.</div><div class="field-error" hidden></div></div>
      <fieldset class="field advice-choice"><legend class="label">What advice do you give?</legend>
        <label class="choice"><input type="radio" name="advice_type" value="mortgage_protection" required><span><b>Mortgage & protection</b><small>Mortgages, protection and insurance</small></span></label>
        <label class="choice"><input type="radio" name="advice_type" value="protection"><span><b>Protection only</b><small>Life, critical illness, income protection and insurance</small></span></label>
        <div class="field-error" hidden></div></fieldset>
      ${passwordInput('rq-pass', 'password', 'Create a password', 'new-password')}
      <div class="pw-meter" data-score="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div class="pw-rules"></div>
      ${passwordInput('rq-pass2', 'password2', 'Confirm password', 'new-password')}
      <div class="caps" hidden>${icon('alert', 'ic-sm')}Caps Lock is on</div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('send')}Send request</button>
    </form>`;
}
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
function wireRequest(root) {
  const form = $('#requestForm', root);
  const domain = (S.status && S.status.domain) || 'themaap.co.uk';
  pwFeedback(root, '#rq-pass');
  let userTouched = false;
  form.username.addEventListener('input', () => { userTouched = true; });
  form.email.addEventListener('input', () => {
    let v = form.email.value.trim();
    const at = v.indexOf('@');
    if (at >= 0) {
      const dom = v.slice(at + 1).toLowerCase();
      if (dom === domain) { v = v.slice(0, at); form.email.value = v; }
    }
    if (!userTouched) {
      // Suggest the username only while it would be accepted (3–32 letters, numbers, dots, dashes or underscores).
      const s = v.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+/, '').slice(0, 32);
      form.username.value = USERNAME_RE.test(s) ? s : '';
    }
  });
  const fieldErr = (name, msg) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (el.type === 'radio') {
      const box = el.closest('fieldset').querySelector('.field-error');
      box.textContent = msg; box.hidden = false; el.focus(); shakeCard();
      return;
    }
    el.setAttribute('aria-invalid', 'true');
    const box = el.closest('.field').querySelector('.field-error');
    if (box) { box.textContent = msg; box.hidden = false; }
    el.focus();
    shakeCard();
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    authAlert(root, '');
    // Checked in the order the boxes are on screen, with the same rules as the server.
    if (form.full_name.value.trim().length < 2) return fieldErr('full_name', 'Enter your full name.');
    const local = form.email.value.trim();
    if (local.includes('@')) return fieldErr('email', `Use your @${domain} email address.`);
    if (!local) return fieldErr('email', 'Enter the first part of your MAP email address.');
    if (!/^[a-z0-9][a-z0-9._%+'-]{0,63}$/i.test(local) || local.includes('..') || local.endsWith('.')) {
      return fieldErr('email', 'Check the first part of your email address: letters, numbers and single dots, e.g. firstname.lastname.');
    }
    if (!USERNAME_RE.test(form.username.value.trim().toLowerCase())) {
      return fieldErr('username', 'Usernames are 3–32 characters: letters, numbers, dots, dashes or underscores, starting with a letter or number.');
    }
    const advice = form.querySelector('[name="advice_type"]:checked');
    if (!advice) return fieldErr('advice_type', 'Choose "Mortgage & protection" or "Protection only".');
    if (!pwRulesOk(form.password.value)) return fieldErr('password', 'Use at least 8 characters with upper and lower case letters and a number.');
    if (form.password.value !== form.password2.value) return fieldErr('password2', 'The two passwords do not match.');
    const btn = $('button[type=submit]', form);
    busy(btn, true, 'Sending…');
    try {
      const res = await apiPost('register', {
        full_name: form.full_name.value.trim(), email: `${local}@${domain}`, username: form.username.value.trim(),
        password: form.password.value, advice_type: advice.value,
      }, { quiet: true });
      setHTML(root, h`<div style="text-align:center"><div class="success-mark">${icon('check')}</div>
        <h2>${res.status === 'pending' ? 'Request sent' : 'Your login is ready'}</h2><p class="sub">${res.message}</p>
        <button class="btn btn-primary btn-lg btn-block mt" type="button" data-signin-as="${form.username.value.trim()}">Back to sign in</button></div>`);
      on(root, 'click', '[data-signin-as]', (ev, b) => showLogin({ tab: 'signin', username: b.dataset.signinAs }));
    } catch (err) {
      busy(btn, false);
      const map = { full_name: 'full_name', email: 'email', username: 'username', password: 'password', advice_type: 'advice_type' };
      if (err.payload && map[err.payload.field]) fieldErr(map[err.payload.field], err.message);
      else { authAlert(root, err.message); shakeCard(); }
    }
  });
}

function forgotPanel() {
  return h`<button type="button" class="back-link link-btn" data-go-signin>${icon('chevron-left', 'ic-sm')} Back to sign in</button>
    <h2>Forgotten your password?</h2>
    <p class="sub">Ask the <b>MAP admin</b> to reset it. They'll give you a temporary password, and you'll choose a new one the next time you sign in.</p>
    <div class="alert alert-info mt">${icon('info')}<div class="alert-text">If your login is locked after too many wrong passwords, wait 15 minutes or ask the MAP admin to unlock it.</div></div>
    <details class="mt" id="recoverBox"><summary class="link-btn" style="cursor:pointer;margin-top:8px">The admin login? Reset it with the recovery code</summary>
      <form class="auth-form" id="recoverForm" novalidate>
        <div class="alert" data-auth-alert hidden></div>
        <div class="field"><label for="rc-user">Admin username</label><div class="input-icon">${icon('user')}<input class="input" id="rc-user" name="username" value="admin" autocapitalize="none" required></div></div>
        <div class="field"><label for="rc-code">Recovery code</label><div class="input-icon">${icon('key')}<input class="input" id="rc-code" name="code" placeholder="MAP-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" required></div></div>
        ${passwordInput('rc-pass', 'new_password', 'New password', 'new-password')}
        <div class="pw-meter" data-score="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <div class="pw-rules"></div>
        ${passwordInput('rc-pass2', 'new_password2', 'Confirm new password', 'new-password')}
        <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('key')}Reset password</button>
      </form></details>`;
}
function wireForgot(root) {
  pwFeedback(root, '#rc-pass');
  const form = $('#recoverForm', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    authAlert(form, '');
    if (!pwRulesOk(form.new_password.value)) { authAlert(form, 'Use at least 8 characters with upper and lower case letters and a number.'); return; }
    if (form.new_password.value !== form.new_password2.value) { authAlert(form, 'The two passwords do not match.'); return; }
    const btn = $('button[type=submit]', form);
    busy(btn, true, 'Resetting…');
    try {
      const res = await apiPost('recover', { username: form.username.value.trim(), code: form.code.value.trim(), new_password: form.new_password.value }, { quiet: true });
      showLogin({ tab: 'signin', username: form.username.value.trim(), message: res.message, messageKind: 'ok' });
    } catch (err) {
      busy(btn, false);
      authAlert(form, err.message);
      shakeCard();
    }
  });
}

/* ---------- Forced password change (temporary password) ---------- */
function showForcedPasswordChange() {
  stopPolling();
  document.title = 'Choose a new password · MAP Operating System';
  setHTML($('#app'), authLayout(h`<h2>Choose a new password</h2>
    <p class="sub">You signed in with a temporary password. Choose your own to carry on.</p>
    <form class="auth-form" id="pwForm" novalidate>
      <div class="alert" data-auth-alert hidden></div>
      ${passwordInput('fp-cur', 'current_password', 'Temporary password', 'current-password')}
      ${passwordInput('fp-new', 'new_password', 'New password', 'new-password')}
      <div class="pw-meter" data-score="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div class="pw-rules"></div>
      ${passwordInput('fp-new2', 'new_password2', 'Confirm new password', 'new-password')}
      <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('check')}Save and continue</button>
      <button class="btn btn-ghost btn-block" type="button" data-signout>${icon('logout')}Sign out</button>
    </form>`));
  const root = $('#authCard');
  pwFeedback(root, '#fp-new');
  capsWatch(root);
  on(root, 'click', '[data-signout]', signOut);
  const form = $('#pwForm', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    authAlert(root, '');
    if (!pwRulesOk(form.new_password.value)) { authAlert(root, 'Use at least 8 characters with upper and lower case letters and a number.'); return; }
    if (form.new_password.value !== form.new_password2.value) { authAlert(root, 'The two passwords do not match.'); return; }
    const btn = $('button[type=submit]', form);
    busy(btn, true, 'Saving…');
    try {
      await apiPost('changePassword', { current_password: form.current_password.value, new_password: form.new_password.value }, { quiet: true });
      S.status = await apiGet('status', null, { quiet: true });
      toast('Password changed');
      await enterApp();
    } catch (err) { busy(btn, false); authAlert(root, err.message); shakeCard(); }
  });
}

/* ---------- Start-up and signing out ---------- */
async function signOut() {
  try { await apiPost('logout', {}, { quiet: true }); } catch (e) { /* already signed out */ }
  S.me = null; S.meta = null;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  showLogin({ tab: 'signin', message: 'You have signed out.', messageKind: 'ok' });
}
function onSignedOut() {
  if (!S.me) return;
  S.me = null; S.meta = null;
  closeAllModals();
  showLogin({ tab: 'signin', message: 'Your session has ended. Please sign in again.', messageKind: 'info' });
}
function closeAllModals() { while (openModals.length) openModals[openModals.length - 1].close(); }

async function enterApp() {
  const user = S.status && S.status.user;
  if (!user) return showLogin();
  if (user.must_change_password) return showForcedPasswordChange();
  if (user.role === 'webadmin') {
    location.href = 'website-admin.php';
    return;
  }
  const meta = await apiGet('meta');
  S.meta = meta;
  S.me = meta.user;
  S.usersById = {};
  meta.users.forEach((u) => { S.usersById[u.id] = u; });
  S.officeName = meta.office ? meta.office.name : '';
  renderShell();
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    history.replaceState(null, '', '#/' + (S.me.role === 'sales' ? 'sales' : 'dashboard'));
  }
  router();
  startPolling();
}

async function boot() {
  applyTheme(getTheme());
  try {
    S.status = await apiGet('status', null, { quiet: true });
  } catch (err) {
    setHTML($('#app'), authLayout(h`<h2>The CRM can't start</h2><div class="alert alert-bad mt">${icon('alert')}<div class="alert-text">${err.message}</div></div>
      <p class="sub mt">If you've just uploaded the files, check that <b>api.php</b> is in the same folder as this page and that the server runs PHP 7.4 or newer.</p>
      <button class="btn btn-primary btn-block mt" type="button" data-reload>Try again</button>`));
    return;
  }
  if (S.status.user) {
    try { await enterApp(); } catch (err) { if (err.code !== 'signed_out' && err.code !== 'must_change_password') showLogin({ message: err.message, messageKind: 'bad' }); }
  } else {
    const next = new URLSearchParams(location.search).get('next');
    showLogin({ message: next === 'website-admin' ? 'Sign in with the admin login to open the website admin panel.' : '', messageKind: 'info' });
  }
}
document.addEventListener('DOMContentLoaded', boot);
