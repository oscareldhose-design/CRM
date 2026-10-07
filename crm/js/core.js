/* MAP Operating System: core helpers (safe HTML, API, formatting, forms, tables, dialogs, Excel). */
'use strict';

/* Loaded in <head> before the page is drawn, so dark mode is applied straight away (no light flash). */
try { if (localStorage.getItem('map_crm_theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch (e) { /* private mode */ }

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- Safe HTML: every ${value} is escaped unless it is already Raw ---------- */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(String(s));
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function renderVal(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return esc(v);
}
function h(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += renderVal(vals[i]); });
  return new Raw(out);
}
const icon = (name, cls = '') => raw(`<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`);
function setHTML(el, content) { el.innerHTML = renderVal(content); return el; }
function on(root, type, selector, fn) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  });
}

/* ---------- App state ---------- */
const S = { status: null, me: null, meta: null, usersById: {}, officeName: '' };

/* ---------- API ---------- */
class ApiError extends Error {
  constructor(status, code, message, payload) { super(message); this.status = status; this.code = code; this.payload = payload || {}; }
}
async function api(action, { params, body, method, quiet } = {}) {
  const url = new URL('api.php', location.href);
  url.searchParams.set('action', action);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '' && v !== false) url.searchParams.set(k, v === true ? '1' : v);
    }
  }
  const m = method || (body !== undefined ? 'POST' : 'GET');
  const opts = { method: m, headers: { 'X-MAP-CRM': '1', Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' };
  if (m === 'POST') { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body || {}); }
  let res;
  try { res = await fetch(url, opts); } catch (e) {
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok || !data || data.ok === false) {
    const err = new ApiError(res.status, (data && data.code) || 'error',
      (data && data.message) || (res.status === 404 ? 'The CRM server file (api.php) could not be found.' : `Something went wrong (${res.status}).`), data);
    if (!quiet && err.code === 'signed_out' && typeof onSignedOut === 'function') onSignedOut();
    if (!quiet && err.code === 'must_change_password' && typeof showForcedPasswordChange === 'function') showForcedPasswordChange();
    throw err;
  }
  return data;
}
const apiGet = (action, params, o = {}) => api(action, { params, ...o });
const apiPost = (action, body, o = {}) => api(action, { body: body || {}, ...o });
function apiUrl(action, params = {}) {
  const url = new URL('api.php', location.href);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/* ---------- Formatting ---------- */
const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function money(v, dp = 0) {
  if (v === null || v === undefined || v === '' || isNaN(+v)) return '';
  return '£' + (dp ? nf2 : nf0).format(+v);
}
function moneyShort(v) {
  v = +v || 0;
  if (v >= 1e6) return '£' + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'm';
  if (v >= 1e4) return '£' + Math.round(v / 1e3) + 'k';
  return money(v);
}
function num(v) { return v === null || v === undefined || v === '' ? '' : nf0.format(+v); }
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function fmtDate(v, opts) {
  const d = toDate(v);
  if (!d) return '';
  return d.toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(v) {
  const d = toDate(v);
  if (!d) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function isoDay(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function today() { return isoDay(new Date()); }
function addDays(day, n) { const d = toDate(day) || new Date(); d.setDate(d.getDate() + n); return isoDay(d); }
function daysBetween(a, b) {
  const da = toDate(typeof a === 'string' && a.length > 10 ? isoDay(toDate(a)) : a);
  const db = toDate(typeof b === 'string' && b.length > 10 ? isoDay(toDate(b)) : b);
  if (!da || !db) return null;
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
}
function relTime(v) {
  const d = toDate(v);
  if (!d) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (Math.abs(diff) < 60) return 'just now';
  const mins = Math.round(diff / 60), hrs = Math.round(diff / 3600), days = daysBetween(d, new Date());
  if (diff > 0) {
    if (mins < 60) return `${mins} min ago`;
    if (hrs < 24 && days === 0) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    return fmtDate(d);
  }
  return fmtDate(d);
}
function dueText(day) {
  if (!day) return { text: 'No date', cls: '' };
  const n = daysBetween(today(), day);
  if (n < 0) return { text: n === -1 ? 'Yesterday' : `${-n} days overdue`, cls: 'due-overdue' };
  if (n === 0) return { text: 'Today', cls: 'due-today' };
  if (n === 1) return { text: 'Tomorrow', cls: '' };
  if (n < 7) return { text: toDate(day).toLocaleDateString('en-GB', { weekday: 'long' }), cls: '' };
  return { text: fmtDate(day), cls: '' };
}
function label(enumName, key) {
  if (key === null || key === undefined || key === '') return '';
  const e = S.meta && S.meta.enums && S.meta.enums[enumName];
  return (e && e[key]) || String(key);
}
function enumOptions(enumName) {
  const e = (S.meta && S.meta.enums && S.meta.enums[enumName]) || {};
  return Array.isArray(e) ? e.map((v) => [v, v]) : Object.entries(e);
}
function userName(id) { const u = S.usersById[id]; return u ? u.full_name : ''; }
function initials(name) {
  const p = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function fullName(r) { return [r.first_name, r.last_name].filter(Boolean).join(' '); }
function plural(n, one, many) { return `${num(n)} ${n === 1 ? one : (many || one + 's')}`; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function greeting() { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; }

/* ---------- Badges ---------- */
function ratingBadge(r, score) {
  if (!r) return '';
  return h`<span class="badge rating rating-${r}" title="Lead score ${score ?? ''}">${r}${score !== undefined && score !== null ? raw(` <span class="num">${esc(score)}</span>`) : ''}</span>`;
}
function ragBadge(r) {
  if (!r) return '';
  const t = { red: 'Red', amber: 'Amber', green: 'Green' }[r] || r;
  return h`<span class="rag rag-${r}">${t}</span>`;
}
function riskBadge(risk) {
  if (!risk || risk.level === 'none') return '';
  const map = { high: ['badge-bad', 'alert', 'High risk'], medium: ['badge-warn', 'clock', 'Medium risk'], low: ['badge-ok', 'check', 'On track'] };
  const [c, i, t] = map[risk.level] || map.low;
  return h`<span class="badge ${c}" title="${risk.reasons && risk.reasons.length ? risk.reasons.join(' · ') : ''}">${icon(i)}${t}</span>`;
}
function statusBadge(kind, value) {
  const tone = {
    lead_status: { new: 'badge-brand', contacted: 'badge-info', qualified: 'badge-info', converted: 'badge-ok', lost: 'badge-bad' },
    case_status: { active: 'badge-brand', completed: 'badge-ok', lost: 'badge-bad' },
    policy_status: { quote: 'badge-warn', applied: 'badge-info', on_risk: 'badge-ok', declined: 'badge-bad', ntu: 'badge-bad', lapsed: 'badge-bad', cancelled: 'badge-bad' },
    document_status: { requested: 'badge-warn', received: 'badge-ok', expired: 'badge-bad', not_required: '' },
    contact_status: { new: 'badge-brand', no_answer: 'badge-warn', callback: 'badge-info', interested: 'badge-ok', not_interested: '', wrong_number: 'badge-bad', do_not_call: 'badge-bad', handed_over: 'badge-ok' },
    user_status: { active: 'badge-ok', pending: 'badge-warn', disabled: 'badge-bad', rejected: 'badge-bad' },
  };
  const cls = (tone[kind] && tone[kind][value]) || '';
  const text = kind === 'user_status' ? ({ active: 'Active', pending: 'Waiting for approval', disabled: 'Switched off', rejected: 'Rejected' }[value] || value) : label(kind, value);
  return h`<span class="badge ${cls}">${text}</span>`;
}
function stageTrack(stage) {
  const stages = Object.keys(S.meta.enums.stage);
  const i = stages.indexOf(stage);
  return h`<div class="stage-track" title="${label('stage', stage)}">${stages.map((s, n) => h`<span class="${n <= i ? 'on' : ''}"></span>`)}</div>`;
}
function emptyState(iconName, title, text, action) {
  return h`<div class="empty">${icon(iconName)}<h3>${title}</h3>${text ? h`<p>${text}</p>` : ''}${action || ''}</div>`;
}
function loadingBlock() { return h`<div class="loading"><div class="spinner" role="status" aria-label="Loading"></div></div>`; }

/* ---------- Toasts & dialogs ---------- */
function toast(message, type = 'ok') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  setHTML(el, h`${icon(type === 'bad' ? 'alert' : 'check')}<span>${message}</span>`);
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, type === 'bad' ? 6000 : 3200);
}
function showError(err) { toast(err && err.message ? err.message : String(err), 'bad'); }

const openModals = [];
function modal({ title, sub, body, foot, size, onMount, onClose, dismissable = true }) {
  const layer = document.createElement('div');
  layer.className = 'modal-layer';
  setHTML(layer, h`<div class="modal ${size || ''}" role="dialog" aria-modal="true" aria-labelledby="mt-${openModals.length}">
    <div class="modal-head"><div><h2 id="mt-${openModals.length}">${title}</h2>${sub ? h`<div class="sub">${sub}</div>` : ''}</div>
      <button class="icon-btn" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="modal-body">${body || ''}</div>
    ${foot ? h`<div class="modal-foot">${foot}</div>` : ''}</div>`);
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    layer.remove();
    const i = openModals.indexOf(api_);
    if (i >= 0) openModals.splice(i, 1);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose();
  };
  const api_ = { el: layer, close };
  openModals.push(api_);
  on(layer, 'click', '[data-close]', () => close());
  layer.addEventListener('mousedown', (e) => { if (e.target === layer && dismissable) close(); });
  $('#modals').appendChild(layer);
  if (onMount) onMount(layer, close);
  const first = layer.querySelector('input:not([type=hidden]):not([disabled]), select, textarea, .modal-foot .btn-primary');
  setTimeout(() => (first || layer.querySelector('[data-close]')).focus(), 30);
  return api_;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openModals.length) { openModals[openModals.length - 1].close(); e.stopPropagation(); }
});
function confirmBox({ title, message, confirmText = 'Confirm', danger = false, typed }) {
  return new Promise((resolve) => {
    let ok = false;
    modal({
      title, size: 'narrow',
      body: h`<p class="muted">${message}</p>${typed ? h`<div class="field mt"><label for="cf-typed">Type <b>${typed}</b> to confirm</label><input id="cf-typed" class="input" autocomplete="off"></div>` : ''}`,
      foot: h`<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok>${confirmText}</button>`,
      onClose: () => resolve(ok),
      onMount(el, close) {
        on(el, 'click', '[data-ok]', () => {
          if (typed && $('#cf-typed', el).value.trim() !== typed) { $('#cf-typed', el).setAttribute('aria-invalid', 'true'); return; }
          ok = true;
          close();
        });
      },
    });
  });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied'); } catch (e2) { toast('Could not copy. Select the text and copy it yourself.', 'bad'); }
    ta.remove();
  }
}
function busy(btn, on_, text) {
  if (!btn) return;
  if (on_) {
    if (!btn.dataset.busy) btn.dataset.label = btn.innerHTML; // already busy: keep the original label
    btn.dataset.busy = '1'; btn.disabled = true; if (text) btn.textContent = text;
  } else { btn.disabled = false; delete btn.dataset.busy; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

/* ---------- Forms ---------- */
/*
 * Field spec: { k, label, type, opts, req, full, hint, placeholder, roles, section }
 * types: text email tel money number int date datetime textarea select user introducer client check section password
 */
function fieldOptions(f, value) {
  let opts = [];
  // The record's current choice is always offered, even if that person's login is switched off or the introducer is
  // inactive, so saving an unrelated change never blanks it.
  const cur = value === null || value === undefined ? '' : String(value);
  if (f.type === 'user') {
    const roles = f.roles || ['admin', 'manager', 'adviser', 'administrator'];
    const officeId = S.meta.office && S.meta.office.id;
    opts = S.meta.users.filter((u) => String(u.id) === cur || (u.status === 'active' && roles.includes(u.role)
        && (!officeId || +u.office_id === +officeId) && (f.allowOffice || !+u.is_office_account)))
      .map((u) => [u.id, u.full_name + (u.role === 'administrator' ? ' (admin)' : '') + (u.status === 'active' ? '' : ' (switched off)')]);
    if (cur && !opts.some(([k]) => String(k) === cur)) opts.push([cur, 'Former member of staff']);
  } else if (f.type === 'introducer') {
    opts = (S.meta.introducers || []).map((i) => [i.id, i.name + (i.company ? ` (${i.company})` : '')]);
    if (cur && !opts.some(([k]) => String(k) === cur)) opts.push([cur, 'Current introducer (no longer active)']);
  } else if (typeof f.opts === 'string') {
    opts = enumOptions(f.opts);
  } else if (Array.isArray(f.opts)) {
    opts = f.opts;
  }
  // currentOnly: choices shown only when they are already the record's value (e.g. a converted lead's status).
  if (f.currentOnly) opts = opts.concat(f.currentOnly.filter(([k]) => String(k) === cur));
  return opts;
}
function fieldHtml(f, values) {
  if (f.type === 'section') return h`<div class="section-label">${f.label}</div>`;
  const id = `f-${f.k}-${Math.random().toString(36).slice(2, 7)}`;
  let v = values && values[f.k] !== undefined && values[f.k] !== null ? values[f.k] : (f.default !== undefined ? f.default : '');
  const req = f.req ? raw(' <span class="req" aria-hidden="true">*</span>') : '';
  const common = `id="${id}" name="${esc(f.k)}" ${f.req ? 'required aria-required="true"' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}`;
  let control;
  switch (f.type) {
    case 'textarea':
      control = raw(`<textarea class="textarea" ${common} rows="${f.rows || 3}">${esc(v)}</textarea>`); break;
    case 'select': case 'user': case 'introducer': case 'client': {
      const opts = f.type === 'client' ? (f.clientOpts || []) : fieldOptions(f, v);
      control = raw(`<select class="select" ${common}><option value="">${esc(f.empty || (f.req ? 'Choose…' : '—'))}</option>${opts.map(([k, l]) =>
        `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`);
      break;
    }
    case 'check':
      return h`<div class="field ${f.full ? 'full' : ''}"><label class="check"><input type="checkbox" ${raw(common)} ${v === true || v === 1 || v === '1' ? raw('checked') : ''}><span>${f.label}</span></label>${f.hint ? h`<div class="field-hint">${f.hint}</div>` : ''}<div class="field-error" hidden></div></div>`;
    case 'money': case 'number': case 'int':
      control = raw(`<input class="input num" type="text" inputmode="decimal" ${common} value="${esc(v)}">`); break;
    case 'date':
      control = raw(`<input class="input" type="date" ${common} value="${esc(String(v).slice(0, 10))}">`); break;
    case 'datetime':
      control = raw(`<input class="input" type="datetime-local" ${common} value="${esc(v)}">`); break;
    case 'password':
      control = raw(`<input class="input" type="password" autocomplete="new-password" ${common}>`); break;
    default:
      control = raw(`<input class="input" type="${f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}" ${common} value="${esc(v)}" ${f.type === 'email' ? 'autocomplete="off"' : ''}>`);
  }
  return h`<div class="field ${f.full || f.type === 'textarea' ? 'full' : ''}"><label for="${id}">${f.label}${req}</label>${control}${f.hint ? h`<div class="field-hint">${f.hint}</div>` : ''}<div class="field-error" hidden></div></div>`;
}
function formHtml(fields, values) {
  return h`<div class="form-grid">${fields.map((f) => fieldHtml(f, values))}</div>`;
}
function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'section') continue;
    const el = root.querySelector(`[name="${CSS.escape(f.k)}"]`);
    if (!el) continue;
    out[f.k] = f.type === 'check' ? el.checked : el.value.trim();
  }
  return out;
}
function clearErrors(root) {
  $$('[aria-invalid="true"]', root).forEach((el) => el.removeAttribute('aria-invalid'));
  $$('.field-error', root).forEach((el) => { el.hidden = true; el.textContent = ''; });
  $$('.form-alert', root).forEach((el) => el.remove());
}
function showFormError(root, err) {
  clearErrors(root);
  const field = err && err.payload && err.payload.field;
  const el = field && root.querySelector(`[name="${CSS.escape(field)}"]`);
  if (el) {
    el.setAttribute('aria-invalid', 'true');
    const box = el.closest('.field') && el.closest('.field').querySelector('.field-error');
    if (box) { box.textContent = err.message; box.hidden = false; }
    el.focus();
    return;
  }
  const alertEl = document.createElement('div');
  alertEl.className = `alert ${err.code === 'conflict' ? 'alert-warn' : 'alert-bad'} form-alert mb`;
  setHTML(alertEl, h`${icon('alert')}<div class="alert-text">${err.message}${err.code === 'conflict' ? h` <button type="button" class="link-btn" data-reload-record>Reload the latest version</button>` : ''}</div>`);
  alertEl.setAttribute('role', 'alert');
  const body = root.querySelector('.modal-body') || root;
  body.prepend(alertEl);
  // Long forms are usually scrolled down to the Save button: bring the message into view.
  alertEl.scrollIntoView({ block: 'nearest' });
  const reloadBtn = alertEl.querySelector('[data-reload-record]');
  if (reloadBtn) reloadBtn.focus({ preventScroll: true });
}

/**
 * Opens a create/edit form for a record and saves it. Handles validation errors and edits that clash
 * with someone else's newer save.
 */
function editRecord({ entity, record, fields, title, sub, defaults, onSaved, extraBody, fixed }) {
  const isNew = !record || !record.id;
  const values = Object.assign({}, defaults || {}, record || {});
  const m = modal({
    title: title || (isNew ? 'New' : 'Edit'), sub, size: fields.length > 10 ? 'wide' : '',
    body: h`<form novalidate>${formHtml(fields, values)}<button type="submit" hidden></button></form>`,
    foot: h`<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-save>${icon('check')}${isNew ? 'Save' : 'Save changes'}</button>`,
    onMount(el, close) {
      const form = $('form', el);
      let saving = false;
      const save = async () => {
        if (saving) return;
        saving = true;
        const btn = $('[data-save]', el);
        busy(btn, true, 'Saving…');
        try {
          const data = Object.assign(readForm(form, fields), fixed || {});
          const res = await apiPost('save', Object.assign({ entity, id: isNew ? 0 : record.id, version: isNew ? null : record.version, data }, extraBody || {}));
          close();
          toast(isNew ? 'Saved' : 'Changes saved');
          if (onSaved) onSaved(res.record);
        } catch (err) {
          busy(btn, false);
          showFormError(el, err);
        } finally {
          saving = false;
        }
      };
      on(el, 'click', '[data-save]', save);
      form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
      on(el, 'click', '[data-reload-record]', async () => {
        close();
        try {
          const fresh = await apiGet('get', { entity, id: record.id });
          editRecord({ entity, record: fresh.record, fields, title, sub, defaults, onSaved, extraBody, fixed });
          toast('Loaded the latest version');
        } catch (e) { showError(e); }
      });
    },
  });
  return m;
}

/* ---------- Tables ---------- */
/**
 * mountTable(el, { columns, rows, rowHref, empty, exportName, sort })
 * column: { k, label, render(row), value(row) for sorting/export, right, cls, nosort, noexport }
 */
function mountTable(el, opts) {
  const state = { sortK: opts.sort ? opts.sort[0] : null, dir: opts.sort ? opts.sort[1] : 1 };
  const valueOf = (c, r) => (c.value ? c.value(r) : r[c.k]);
  const draw = () => {
    let rows = opts.rows.slice();
    if (state.sortK) {
      const c = opts.columns.find((x) => x.k === state.sortK);
      if (c) {
        rows.sort((a, b) => {
          let x = valueOf(c, a), y = valueOf(c, b);
          if (x === null || x === undefined || x === '') return 1;
          if (y === null || y === undefined || y === '') return -1;
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * state.dir;
          return String(x).localeCompare(String(y), 'en-GB', { numeric: true }) * state.dir;
        });
      }
    }
    if (!rows.length) {
      setHTML(el, h`<div class="card">${opts.empty || emptyState('search', 'Nothing here yet', '')}</div>`);
      return;
    }
    const limit = opts.limit || 500;
    const shown = rows.slice(0, limit);
    setHTML(el, h`<div class="card"><div class="table-wrap"><table class="table">
      <thead><tr>${opts.columns.map((c) => h`<th class="${c.right ? 'right' : ''} ${c.nosort ? '' : 'sortable'}" ${c.nosort ? '' : raw(`data-sort="${esc(c.k)}"`)} scope="col"
        ${state.sortK === c.k ? raw(`aria-sort="${state.dir > 0 ? 'ascending' : 'descending'}"`) : ''}>${c.label}${state.sortK === c.k ? (state.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`)}</tr></thead>
      <tbody>${shown.map((r, i) => {
        const href = opts.rowHref ? opts.rowHref(r) : null;
        return h`<tr class="${href ? 'clickable' : ''}" ${href ? raw(`data-href="${esc(href)}"`) : ''} data-i="${i}">${opts.columns.map((c) => h`<td class="${c.right ? 'right num' : ''} ${c.cls || ''}">${c.render ? c.render(r) : (valueOf(c, r) ?? '')}</td>`)}</tr>`;
      })}</tbody></table></div>
      <div class="table-foot"><span>${rows.length > limit ? `Showing ${num(limit)} of ${num(rows.length)}` : plural(rows.length, opts.noun || 'row')}</span>
      ${opts.exportName ? h`<button class="link-btn" type="button" data-export>${icon('download', 'ic-sm')} Download Excel</button>` : ''}</div></div>`);
    state.rows = rows;
  };
  if (el._tableClick) el.removeEventListener('click', el._tableClick);
  el._tableClick = (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) {
      const k = th.dataset.sort;
      state.dir = state.sortK === k ? -state.dir : 1;
      state.sortK = k;
      draw();
      return;
    }
    if (e.target.closest('[data-export]')) {
      const cols = opts.columns.filter((c) => !c.noexport);
      downloadXlsx(opts.exportName, [cols.map((c) => c.label), ...state.rows.map((r) => cols.map((c) => {
        const v = c.exportValue ? c.exportValue(r) : valueOf(c, r);
        return v === null || v === undefined ? '' : v;
      }))]);
      return;
    }
    if (e.target.closest('a, button, input, select, label')) return;
    const tr = e.target.closest('tr[data-href]');
    if (tr) location.hash = tr.dataset.href;
  };
  el.addEventListener('click', el._tableClick);
  draw();
  return { redraw: draw, setRows(rows) { opts.rows = rows; draw(); } };
}

/* ---------- Excel (.xlsx) and CSV ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function xmlEsc(s) { return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); }
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
/** rows: array of arrays; first row is the header. */
function buildXlsx(rows, sheetName = 'Sheet1') {
  const widths = (rows[0] || []).map((_, c) => Math.min(60, Math.max(10, ...rows.slice(0, 200).map((r) => String(r[c] ?? '').length + 2))));
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = colName(ci) + (ri + 1);
    const style = ri === 0 ? ' s="1"' : '';
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEsc(v ?? '')}</t></is></c>`;
  }).join('')}</row>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData></worksheet>`;
  const name = xmlEsc(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFA308A3"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
  ]);
}
function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function downloadXlsx(name, rows) {
  downloadBlob(`${name}-${today()}.xlsx`, buildXlsx(rows, name));
  toast('Excel file downloaded');
}
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open .xlsx files. Save the sheet as CSV and import that instead.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('That file is not a valid Excel (.xlsx) file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lelen;
    files[name] = { method, data: u8.subarray(start, start + csize) };
    p += 46 + nlen + elen + clen;
  }
  return {
    async text(name) {
      const f = files[name];
      if (!f) return null;
      const bytes = f.method === 0 ? f.data : await inflateRaw(f.data);
      return dec.decode(bytes);
    },
    names: Object.keys(files),
  };
}
async function readXlsx(buf) {
  const z = await unzip(buf);
  const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
  // By local name in any namespace: some exporters write prefixed elements such as <x:row>.
  const tags = (node, name) => node.getElementsByTagNameNS('*', name);
  const wb = parse(await z.text('xl/workbook.xml') || '');
  const firstSheet = tags(wb, 'sheet')[0];
  let target = 'xl/worksheets/sheet1.xml';
  if (firstSheet) {
    const rid = firstSheet.getAttribute('r:id') || firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rels = parse(await z.text('xl/_rels/workbook.xml.rels') || '<x/>');
    for (const r of tags(rels, 'Relationship')) {
      if (r.getAttribute('Id') === rid) { const t = r.getAttribute('Target'); target = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''); }
    }
  }
  const shared = [];
  const ss = await z.text('xl/sharedStrings.xml');
  if (ss) for (const si of tags(parse(ss), 'si')) shared.push([...tags(si, 't')].map((t) => t.textContent).join(''));
  const sheetXml = await z.text(target);
  if (!sheetXml) throw new Error('Could not find the first sheet in that workbook.');
  const rows = [];
  for (const row of tags(parse(sheetXml), 'row')) {
    const out = [];
    for (const c of tags(row, 'c')) {
      const ref = c.getAttribute('r') || '';
      const col = ref.replace(/\d+/g, '').split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const t = c.getAttribute('t');
      const vEl = tags(c, 'v')[0];
      let v = vEl ? vEl.textContent : '';
      if (t === 's') v = shared[+v] ?? '';
      else if (t === 'inlineStr') v = [...tags(c, 't')].map((x) => x.textContent).join('');
      else if (t === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
      else if (t !== 'str' && v !== '' && !isNaN(+v)) v = +v;
      out[col >= 0 ? col : out.length] = v;
    }
    rows.push(Array.from(out, (x) => (x === undefined ? '' : x)));
  }
  return rows;
}
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}
/** Text of a CSV file: UTF-8 if it is valid UTF-8, otherwise Windows-1252 (Excel's "CSV (Comma delimited)" on UK Windows). */
async function readCsvText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}
async function readSpreadsheet(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(await readCsvText(file));
  if (name.endsWith('.xlsx')) return (await readXlsx(await file.arrayBuffer())).filter((r) => r.some((c) => String(c).trim() !== ''));
  throw new Error('Choose an Excel (.xlsx) or CSV file. Older .xls files: open them in Excel and save as .xlsx first.');
}
/** A spreadsheet date as yyyy-mm-dd. Two-digit years: up to 10 years ahead are 20yy, the rest 19yy; for a date of birth ($past) never in the future. */
function excelDate(v, past) {
  if (typeof v === 'number' && v > 1000 && v < 90000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().slice(0, 10); }
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let y = m[3];
    if (y.length === 2) {
      const now = new Date().getFullYear();
      let full = 2000 + +y;
      if (full > (past ? now : now + 10)) full -= 100;
      y = String(full);
    }
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return s;
}
/** Guesses which spreadsheet column holds which field, from the header names. */
function guessColumns(header, fields) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = {};
  header.forEach((hcell, i) => {
    const n = norm(hcell);
    for (const f of fields) {
      if (map[f.k] !== undefined) continue;
      if ((f.match || [f.k]).some((m) => n === norm(m) || (m.length > 3 && n.includes(norm(m))))) { map[f.k] = i; break; }
    }
  });
  return map;
}
