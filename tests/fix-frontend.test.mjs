// MAP CRM front-end regression tests. Run with: node --test tests/fix-frontend.test.mjs
// Part 1 runs the shared front-end code (core.js, shell.js) in Node and checks index.html.
// Part 2 drives the real app in Chromium against PHP's built-in server on a throwaway database. It is skipped when
// Playwright (or its browser) is not installed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 19000 + Math.floor(Math.random() * 1000);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = `${ORIGIN}/api.php`;
const PAGE = `${ORIGIN}/`;
const PW = 'Map@2025#';
let server, dataDir;

/* ---------- Part 1: the front-end code in Node ---------- */

/** Loads core.js and shell.js into a fresh context with just enough of a browser to run their top-level code. */
function loadFrontEnd(storage = {}) {
  const ctx = vm.createContext({
    console, TextDecoder, TextEncoder, File, Blob, URL, URLSearchParams, setTimeout, clearTimeout,
    document: { addEventListener() {}, documentElement: { dataset: {} }, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem() {} },
    window: { addEventListener() {} },
    location: { href: 'http://127.0.0.1/', hash: '' },
    CSS: { escape: (s) => s },
  });
  vm.runInContext(readFileSync(join(ROOT, 'js', 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  vm.runInContext(readFileSync(join(ROOT, 'js', 'shell.js'), 'utf8'), ctx, { filename: 'shell.js' });
  return { ctx, run: (code) => vm.runInContext(code, ctx) };
}
/** Values made in the other context have that context's Array prototype; compare them as plain JSON. */
const plain = (x) => JSON.parse(JSON.stringify(x));

test('a saved dark theme is applied as soon as core.js runs (no light flash)', () => {
  assert.equal(loadFrontEnd({ map_crm_theme: 'dark' }).ctx.document.documentElement.dataset.theme, 'dark');
  assert.equal(loadFrontEnd({}).ctx.document.documentElement.dataset.theme, undefined);
});

test('index.html: core.js loads before first paint, assets are versioned, no inline scripts, #app is not a live region', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /<script src="js\/core\.js\?v=[^"]+"><\/script>/, 'core.js is a normal (blocking) script in <head>');
  assert.doesNotMatch(html, /<script[^>]*core\.js[^>]*defer/);
  for (const m of html.matchAll(/(?:src|href)="((?:js\/[^"]+\.js)|app\.css[^"]*)"/g)) assert.match(m[1], /\?v=/, `${m[1]} has a version`);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'no inline scripts (CSP)');
  assert.match(html, /<div id="app" class="app">/);
  assert.doesNotMatch(html, /id="app"[^>]*aria-live/);
});

test('edit forms keep a switched-off adviser and an inactive introducer instead of blanking them', () => {
  const { run } = loadFrontEnd();
  run(`S.meta = { office: { id: 1 }, introducers: [{ id: 2, name: 'Active Agent', company: '' }], users: [
    { id: 5, full_name: 'Amy Active', role: 'adviser', office_id: 1, status: 'active', is_office_account: 0 },
    { id: 6, full_name: 'James Gone', role: 'adviser', office_id: 1, status: 'disabled', is_office_account: 0 },
    { id: 7, full_name: 'Other Gone', role: 'adviser', office_id: 1, status: 'disabled', is_office_account: 0 },
    { id: 8, full_name: 'Newcastle Office', role: 'manager', office_id: 1, status: 'active', is_office_account: 1 },
    { id: 9, full_name: 'Far Away', role: 'adviser', office_id: 2, status: 'active', is_office_account: 0 }] };`);
  const names = (f, v) => plain(run(`fieldOptions(${JSON.stringify(f)}, ${JSON.stringify(v)})`)).map(([, l]) => l);
  assert.deepEqual(names({ type: 'user' }, ''), ['Amy Active']);
  assert.deepEqual(names({ type: 'user' }, 6), ['Amy Active', 'James Gone (switched off)'], 'the current adviser stays, marked as switched off');
  assert.deepEqual(names({ type: 'user' }, '9'), ['Amy Active', 'Far Away'], 'the current adviser from another office stays');
  assert.deepEqual(names({ type: 'user', allowOffice: true }, ''), ['Amy Active', 'Newcastle Office']);
  assert.deepEqual(names({ type: 'user' }, 44), ['Amy Active', 'Former member of staff'], 'an unknown current value is still kept');
  assert.deepEqual(plain(run(`fieldOptions({ type: 'introducer' }, 3)`)).map(([k, l]) => [String(k), l]),
    [['2', 'Active Agent'], ['3', 'Current introducer (no longer active)']]);
  // The field renders with the current value selected.
  const html = run(`String(fieldHtml({ k: 'adviser_id', label: 'Adviser', type: 'user' }, { adviser_id: 6 }))`);
  assert.match(html, /<option value="6" selected>James Gone \(switched off\)<\/option>/);
});

test('PHP 7.4-style string ids and flags still list normal staff (is_office_account "0")', () => {
  const { run } = loadFrontEnd();
  run(`S.meta = { office: { id: '1' }, introducers: [], users: [
    { id: '5', full_name: 'Amy Active', role: 'adviser', office_id: '1', status: 'active', is_office_account: '0' },
    { id: '8', full_name: 'Newcastle Office', role: 'manager', office_id: '1', status: 'active', is_office_account: '1' }] };`);
  assert.deepEqual(plain(run(`fieldOptions({ type: 'user' }, '')`)).map(([, l]) => l), ['Amy Active']);
});

test('a converted lead can be edited: its status list offers "Converted" only when it is converted', () => {
  const { run } = loadFrontEnd();
  run(`S.meta = { enums: {} };`);
  const statusOpts = (v) => plain(run(`fieldOptions(FIELDS.leads.find((f) => f.k === 'status'), ${JSON.stringify(v)})`)).map(([k]) => k);
  assert.deepEqual(statusOpts('converted'), ['new', 'contacted', 'qualified', 'lost', 'converted']);
  assert.deepEqual(statusOpts('new'), ['new', 'contacted', 'qualified', 'lost']);
});

test('busy() twice keeps the original button label', () => {
  const { run } = loadFrontEnd();
  const btn = run(`({ dataset: {}, disabled: false, innerHTML: 'Save', set textContent(v) { this.innerHTML = v; } })`);
  run('busy')(btn, true, 'Saving…');
  run('busy')(btn, true, 'Saving…');
  run('busy')(btn, false);
  assert.equal(btn.innerHTML, 'Save');
  assert.equal(btn.disabled, false);
});

test('spreadsheet import: two-digit years and Windows-1252 CSV files', async () => {
  const { run } = loadFrontEnd();
  const excelDate = run('excelDate');
  const yy = String(new Date().getFullYear() + 1).slice(2);
  assert.equal(excelDate('15/06/72'), '1972-06-15');
  assert.equal(excelDate('15/06/72', true), '1972-06-15');
  assert.equal(excelDate('01/02/05'), '2005-02-01');
  assert.equal(excelDate(`01/02/${yy}`), `20${yy}-02-01`, 'next year is still this century');
  assert.equal(excelDate(`01/02/${yy}`, true), `19${yy}-02-01`, 'a date of birth is never in the future');
  assert.equal(excelDate(26465), '1972-06-15');
  const read = run('readSpreadsheet');
  // "Name\nZoë £50" saved by Excel as "CSV (Comma delimited)" (Windows-1252).
  const ansi = new File([new Uint8Array([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x5a, 0x6f, 0xeb, 0x20, 0xa3, 0x35, 0x30])], 'list.csv');
  assert.deepEqual(plain(await read(ansi)), [['Name'], ['Zoë £50']]);
  const utf8 = new File(['﻿Name\nZoë £50'], 'list.csv');
  assert.deepEqual(plain(await read(utf8)), [['Name'], ['Zoë £50']]);
});

test('protection-only advisers are not shown the mortgage template placeholders', () => {
  const { run } = loadFrontEnd();
  const hint = () => run(`templateFields().find((f) => f.k === 'body').hint`);
  run('S.me = { role: "adviser", protection_only: true };');
  assert.doesNotMatch(hint(), /lender|loan_amount|property_address|completion_date|fixed_rate_end_date/);
  assert.match(hint(), /\{\{first_name\}\}/);
  run('S.me = { role: "adviser", protection_only: false };');
  assert.match(hint(), /\{\{lender\}\}.*\{\{fixed_rate_end_date\}\}/);
});

/* ---------- Part 2: the app in a real browser ---------- */

let chromium = null;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(spec)); break; } catch { /* try the next place */ }
}
let browser = null;
if (chromium) {
  const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  try { browser = await chromium.launch({ executablePath }); } catch { browser = null; }
}
const skip = browser ? false : 'Playwright with Chromium is not installed';
const pageErrors = [];

class Client {
  constructor() { this.cookie = ''; }
  async call(action, { params = {}, body } = {}) {
    const url = new URL(BASE);
    url.searchParams.set('action', action);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers = { Accept: 'application/json', 'X-MAP-CRM': '1' };
    if (this.cookie) headers.Cookie = this.cookie;
    const opts = { method: body ? 'POST' : 'GET', headers };
    if (body) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    const set = res.headers.get('set-cookie');
    if (set) {
      const m = set.match(/map_crm_sid=([^;]*)/);
      if (m) this.cookie = m[1] && m[1] !== 'deleted' ? `map_crm_sid=${m[1]}` : '';
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  }
  get(action, params) { return this.call(action, { params }); }
  async post(action, body) {
    const r = await this.call(action, { body: body || {} });
    assert.equal(r.status, 200, `${action}: ${r.text}`);
    return r.json;
  }
  async login(username, password = PW) { return (await this.post('login', { username, password })).user; }
  async save(entity, data, id = 0, version = null) { return (await this.post('save', { entity, id, version, data })).record; }
}

const office = new Client(), admin = new Client();
const people = {};

before(async () => {
  if (skip) return;
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fe-test-'));
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir, MAP_CRM_MAIL_FILE: join(dataDir, 'mail.jsonl') }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}?action=status`); if (r.ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  await office.login('newcastle');
  await admin.login('admin');
  const newcastleId = (await office.get('status')).json.offices.find((o) => o.name === 'Newcastle').id;
  for (const [name, username, advice] of [['James Carter', 'james.carter', 'mortgage_protection'], ['Hannah Reid', 'hannah.reid', 'protection']]) {
    await new Client().post('register', { full_name: name, email: `${username}@themaap.co.uk`, username, password: 'Welcome123', advice_type: advice });
    const u = (await admin.get('adminUsers')).json.rows.find((x) => x.username === username);
    await admin.post('adminUserApprove', { id: u.id, role: 'adviser', office_id: newcastleId, advice_type: advice });
    people[username] = (await admin.get('adminUsers')).json.rows.find((x) => x.username === username);
  }
});
after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

async function newPage({ width = 1280, height = 900, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
  await ctx.route(/^https:\/\//, (route) => route.abort()); // web fonts are not needed here
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  return page;
}
async function signIn(page, username = 'newcastle', password = PW) {
  await page.goto(PAGE);
  await page.waitForSelector('#si-user');
  await page.fill('#si-user', username);
  await page.fill('input[name="password"]', password);
  await page.click('#signinForm button[type="submit"]');
  await page.waitForSelector('#content');
  await page.waitForTimeout(400);
}
const done = (page) => page.context().close();

test('pressing Enter twice in a new-record form saves one record, and the button label survives a failed save', { skip }, async () => {
  const page = await newPage();
  await signIn(page);
  await page.click('[data-fab]'); await page.click('[data-quick="lead"]');
  await page.fill('.modal [name="first_name"]', 'Test'); await page.fill('.modal [name="last_name"]', 'Doubleenter');
  await page.focus('.modal [name="phone"]');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const leads = (await office.get('list', { entity: 'leads', status: 'all', q: 'Doubleenter' })).json.rows;
  assert.equal(leads.length, 1);
  await page.click('[data-fab]'); await page.click('[data-quick="client"]');
  await page.fill('.modal [name="first_name"]', 'Solo'); await page.focus('.modal [name="phone"]');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  const btn = await page.evaluate(() => { const b = document.querySelector('.modal [data-save]'); return { text: b.textContent.trim(), disabled: b.disabled }; });
  assert.deepEqual(btn, { text: 'Save', disabled: false });
  await done(page);
});

test('editing a client keeps a switched-off adviser and an inactive introducer', { skip }, async () => {
  const intro = await office.save('introducers', { name: 'Rachel Green', active: true });
  const client = await office.save('clients', { first_name: 'Harry', last_name: 'Walker', postcode: 'NE3 2AB', adviser_id: people['james.carter'].id, introducer_id: intro.id });
  await admin.post('adminUserSave', Object.assign({}, people['james.carter'], { status: 'disabled' }));
  await office.save('introducers', { active: false }, intro.id, intro.version);
  const page = await newPage();
  await signIn(page);
  await page.goto(`${PAGE}#/clients/${client.id}`); await page.waitForSelector('.detail-head');
  await page.click('.detail-head [data-act="edit"]'); await page.waitForSelector('.modal [name="postcode"]');
  assert.equal(await page.inputValue('.modal [name="adviser_id"]'), String(people['james.carter'].id));
  assert.equal(await page.inputValue('.modal [name="introducer_id"]'), String(intro.id));
  await page.fill('.modal [name="postcode"]', 'NE3 2AC');
  await page.click('.modal [data-save]'); await page.waitForTimeout(800);
  const after = (await office.get('get', { entity: 'clients', id: client.id })).json.record;
  assert.equal(after.postcode, 'NE3 2AC');
  assert.equal(+after.adviser_id, +people['james.carter'].id);
  assert.equal(+after.introducer_id, +intro.id);
  await done(page);
});

test('a save that clashes with someone else\'s shows the message where it can be seen', { skip }, async () => {
  const client = await office.save('clients', { first_name: 'Emma', last_name: 'Thompson' });
  const cs = await office.save('cases', { client_id: client.id, case_type: 'ftb', stage: 'application', lender: 'Halifax' });
  const page = await newPage({ height: 800 });
  await signIn(page);
  await page.goto(`${PAGE}#/cases/${cs.id}`); await page.waitForSelector('.detail-head');
  await page.click('.detail-head [data-act="edit"]'); await page.waitForSelector('.modal [data-save]');
  await office.save('cases', { notes: 'Saved by someone else' }, cs.id, cs.version);
  await page.evaluate(() => { const b = document.querySelector('.modal-body'); b.scrollTop = b.scrollHeight; });
  await page.click('.modal [data-save]'); await page.waitForSelector('.form-alert');
  await page.waitForTimeout(200);
  const pos = await page.evaluate(() => {
    const a = document.querySelector('.form-alert').getBoundingClientRect(), b = document.querySelector('.modal-body').getBoundingClientRect();
    return { visible: a.top >= b.top && a.bottom <= b.bottom, focus: document.activeElement.hasAttribute('data-reload-record') };
  });
  assert.deepEqual(pos, { visible: true, focus: true });
  await done(page);
});

test('a converted lead can be edited and stays converted', { skip }, async () => {
  const lead = await office.save('leads', { first_name: 'Isla', last_name: 'Turner', enquiry_type: 'ftb' });
  await office.post('convertLead', { id: lead.id, create_case: false });
  const page = await newPage();
  await signIn(page);
  await page.goto(`${PAGE}#/leads/${lead.id}`); await page.waitForSelector('.detail-head');
  await page.click('.detail-head [data-act="edit"]'); await page.waitForSelector('.modal [name="status"]');
  assert.equal(await page.inputValue('.modal [name="status"]'), 'converted');
  await page.fill('.modal [name="phone"]', '07700 900999');
  await page.click('.modal [data-save]'); await page.waitForTimeout(800);
  assert.equal(await page.locator('.modal').count(), 0, 'the form closed after saving');
  const after = (await office.get('get', { entity: 'leads', id: lead.id })).json.record;
  assert.equal(after.phone, '07700 900999');
  assert.equal(after.status, 'converted');
  await done(page);
});

test('the pipeline list downloads one Excel file however often the filters change', { skip }, async () => {
  const client = await office.save('clients', { first_name: 'Grace', last_name: 'Allen' });
  await office.save('cases', { client_id: client.id, case_type: 'ftb', stage: 'fact_find' });
  const page = await newPage();
  await signIn(page);
  await page.goto(`${PAGE}#/pipeline?view=list`); await page.waitForSelector('[data-export]');
  await page.click('[data-seg="risk"] [data-val="high"]'); await page.waitForTimeout(150);
  await page.click('[data-seg="risk"] [data-val=""]'); await page.waitForTimeout(150);
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await page.click('[data-export]'); await page.waitForTimeout(1200);
  assert.equal(downloads, 1);
  await done(page);
});

test('after signing out and back in (same tab) the bell, quick add and Quick Case Lookup open once', { skip }, async () => {
  const page = await newPage();
  await signIn(page);
  await page.click('[data-signout]'); await page.waitForSelector('#si-user');
  await page.fill('#si-user', 'newcastle'); await page.fill('input[name="password"]', PW);
  await page.click('#signinForm button[type="submit"]'); await page.waitForSelector('#content'); await page.waitForTimeout(400);
  await page.click('[data-bell]'); await page.waitForTimeout(150);
  assert.equal(await page.locator('.popover').count(), 1, 'bell');
  await page.click('#pageTitle');
  await page.click('[data-fab]'); await page.waitForTimeout(150);
  assert.equal(await page.locator('.fab-menu').count(), 1, 'quick add');
  await page.click('#pageTitle');
  await page.click('[data-lookup]'); await page.waitForTimeout(300);
  assert.equal(await page.locator('.modal-layer').count(), 1, 'one lookup dialog');
  await done(page);
});

test('on a 390px phone the dashboard fits, the bell panel stays on screen and Quick Case Lookup is in the + menu', { skip }, async () => {
  await office.post('addActivity', { client_id: (await office.save('clients', { first_name: 'Long', last_name: 'Note' })).id, type: 'note',
    summary: 'A long one-line summary of a call that goes on and on about payslips, bank statements, valuations and solicitors '.repeat(3) });
  const page = await newPage({ width: 390, height: 844, mobile: true });
  await signIn(page);
  await page.waitForTimeout(400);
  const size = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  assert.deepEqual(size, { sw: 390, iw: 390 });
  await page.click('[data-bell]'); await page.waitForTimeout(150);
  const pop = await page.evaluate(() => document.querySelector('.popover').getBoundingClientRect().toJSON());
  assert.ok(pop.left >= 0 && pop.right <= 390, `bell panel ${pop.left}..${pop.right}`);
  await page.click('#pageTitle');
  await page.click('[data-fab]'); await page.click('[data-quick="lookup"]'); await page.waitForTimeout(300);
  assert.equal(await page.locator('.modal h2').textContent(), 'Quick Case Lookup');
  await done(page);
});

test('search: one letter shows nothing; protection-only advisers are not pointed at Quick Case Lookup', { skip }, async () => {
  const page = await newPage();
  await signIn(page);
  await page.fill('#globalSearch', 'E'); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.querySelector('#searchResults').classList.contains('hidden')), true);
  await page.fill('#globalSearch', 'zzzz'); await page.waitForTimeout(600);
  assert.match(await page.textContent('#searchResults'), /Quick Case Lookup/);
  await done(page);
  const prot = await newPage();
  await signIn(prot, 'hannah.reid', 'Welcome123');
  await prot.fill('#globalSearch', 'zzzz'); await prot.waitForTimeout(600);
  const text = (await prot.textContent('#searchResults')).trim();
  assert.match(text, /^No matches in Newcastle\.$/);
  await prot.click('[data-fab]');
  assert.doesNotMatch(await prot.textContent('.fab-menu'), /Lookup|mortgage/i);
  await done(prot);
});

test('a broken #/ link goes to the start page without an error', { skip }, async () => {
  const page = await newPage();
  await signIn(page);
  await page.goto(`${PAGE}#/leads`); await page.waitForTimeout(400);
  const before = pageErrors.length;
  await page.evaluate(() => { location.hash = '#/clients/%E0%A4%A'; }); await page.waitForTimeout(600);
  assert.deepEqual(pageErrors.slice(before), []);
  assert.equal(await page.evaluate(() => location.hash), '#/dashboard');
  await done(page);
});

test('a long email is copied for pasting instead of being cut short in the mailto link', { skip }, async () => {
  const client = await office.save('clients', { first_name: 'Mail', last_name: 'Long', email: 'mail.long@example.com' });
  const body = 'Dear {{first_name}},\n\n' + 'Here is a long paragraph about your review. '.repeat(40) + '\n\nKind regards,\n{{my_name}}';
  const tpl = await office.save('templates', { name: 'Very long email', subject: 'Review', body });
  const page = await newPage();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await signIn(page);
  await page.goto(`${PAGE}#/clients/${client.id}`); await page.waitForSelector('.detail-head');
  await page.click('.detail-head [data-act="email"]'); await page.waitForSelector('#em-t');
  await page.selectOption('#em-t', String(tpl.id)); await page.waitForTimeout(600);
  const link = await page.evaluate(() => ({ href: document.querySelector('[data-mailto]').getAttribute('href'), hint: !document.querySelector('[data-long-hint]').hidden }));
  assert.doesNotMatch(link.href, /&body=/, 'no cut-off body in the link');
  assert.equal(link.hint, true);
  await page.evaluate(() => document.querySelector('[data-mailto]').addEventListener('click', (e) => e.preventDefault()));
  await page.click('[data-mailto]'); await page.waitForTimeout(300);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.endsWith('Newcastle Office'), 'the whole email, with the sign-off, is on the clipboard');
  await done(page);
});

test('request form: errors follow the order of the boxes and match the server rules', { skip }, async () => {
  const page = await newPage();
  await page.goto(PAGE); await page.waitForSelector('#si-user');
  await page.click('[data-auth-tab="request"]'); await page.waitForSelector('#requestForm');
  const state = () => page.evaluate(() => ({ focus: document.activeElement.name, errors: [...document.querySelectorAll('.field-error')].filter((e) => !e.hidden).length }));
  await page.click('#requestForm button[type=submit]');
  assert.deepEqual(await state(), { focus: 'full_name', errors: 1 });
  await page.fill('#rq-name', 'Jo Smith');
  for (const bad of ['.lead', 'jo..smith', 'jo.smith.']) {
    await page.fill('#rq-email', bad);
    await page.click('#requestForm button[type=submit]');
    assert.equal((await state()).focus, 'email', bad);
  }
  await page.fill('#rq-email', 'jo'); // "jo" is too short for a username, so nothing is suggested
  assert.equal(await page.inputValue('#rq-user'), '');
  await page.click('#requestForm button[type=submit]');
  assert.equal((await state()).focus, 'username');
  await page.fill('#rq-email', 'jo.smith');
  assert.equal(await page.inputValue('#rq-user'), 'jo.smith');
  await done(page);
});

test('dark mode is on before the app scripts have loaded', { skip }, async () => {
  const page = await newPage();
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.setItem('map_crm_theme', 'dark'));
  await page.route(/js\/(auth|shell|views-main|views-more|sales)\.js/, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.goto(PAGE, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.body !== null);
  await page.waitForTimeout(300);
  const early = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, appLoaded: typeof boot === 'function' }));
  assert.deepEqual(early, { theme: 'dark', appLoaded: false });
  await done(page);
});

test('no uncaught errors in the pages above', { skip }, () => {
  assert.deepEqual(pageErrors, []);
});
