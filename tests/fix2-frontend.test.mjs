// MAP CRM front-end regression tests (second review round). Run with: node --test tests/fix2-frontend.test.mjs
// Part 1 runs the shared front-end code (core.js, shell.js) in Node.
// Part 2 drives the real app in Chromium against PHP's built-in server on a throwaway database. It is skipped when
// Playwright (or its browser) is not installed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 20000 + Math.floor(Math.random() * 1000);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = `${ORIGIN}/api.php`;
const PAGE = `${ORIGIN}/`;
const PW = 'Map@2025#';
let server, dataDir;

/* ---------- Part 1: the front-end code in Node ---------- */

/** Loads core.js and shell.js into a fresh context with just enough of a browser to run their top-level code. */
function loadFrontEnd() {
  const ctx = vm.createContext({
    console, TextDecoder, TextEncoder, File, Blob, URL, URLSearchParams, setTimeout, clearTimeout,
    document: { addEventListener() {}, documentElement: { dataset: {} }, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {} },
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

test('phone numbers typed into Excel number cells get their leading 0 (or +) back on import', () => {
  const phone = loadFrontEnd().run('excelPhone');
  assert.equal(phone(7700900302), '07700900302', 'a mobile number Excel kept as a number');
  assert.equal(phone('7700900302'), '07700900302', 'the same number from a CSV file');
  assert.equal(phone(1912345678), '01912345678');
  assert.equal(phone(447700900302), '+447700900302');
  assert.equal(phone('07700 900302'), '07700 900302', 'text is left as typed');
  assert.equal(phone('+44 7700 900302'), '+44 7700 900302');
  assert.equal(phone(12345), '12345');
  assert.equal(phone(''), '');
});

test('protection-only advisers: lead form without mortgage fields, protection wording, no General Sales', () => {
  const { run } = loadFrontEnd();
  run(`S.meta = { office: { id: 1 }, users: [], enums: { enquiry_type: { ftb: 'First-time buyer', protection: 'Protection' },
    timescale: { asap: 'Now / offer accepted', '1m': 'Within a month' }, credit_issues: { none: 'None' }, source: {}, employment: {}, lost_reason: ['Declined by lender'] } };`);
  run('S.me = { id: 1, role: "manager", protection_only: true };');
  const keys = plain(run('leadFields().map((f) => f.k)'));
  for (const k of ['loan_amount', 'property_value', 'deposit', 'credit_issues']) assert.ok(!keys.includes(k), k);
  assert.deepEqual(plain(run(`fieldOptions(leadFields().find((f) => f.k === 'timescale'), '')`)), [['asap', 'Now'], ['1m', 'Within a month']]);
  assert.equal(run(`timescaleLabel('asap')`), 'Now');
  assert.equal(run(`templateFields().find((f) => f.k === 'category').placeholder`), 'e.g. Leads, Protection, Insurance');
  assert.equal(run('canSales()'), false, 'General Sales hands over mortgage enquiries');
  run('S.me = { id: 1, role: "manager", protection_only: false };');
  assert.ok(plain(run('leadFields().map((f) => f.k)')).includes('credit_issues'));
  assert.equal(run(`timescaleLabel('asap')`), 'Now / offer accepted');
  assert.equal(run(`templateFields().find((f) => f.k === 'category').placeholder`), 'e.g. Leads, Cases, Protection');
  assert.equal(run('canSales()'), true);
  run('S.me = { id: 2, role: "sales", protection_only: true };');
  assert.equal(run('canSales()'), true, 'a General Sales login keeps its area');
});

test('mortgage case and case-task pickers leave out staff who give protection advice only', () => {
  const { run } = loadFrontEnd();
  run(`S.meta = { office: { id: 1 }, introducers: [], users: [
    { id: 5, full_name: 'James Carter', role: 'adviser', office_id: 1, status: 'active', is_office_account: 0, advice_type: 'mortgage_protection' },
    { id: 6, full_name: 'Hannah Reid', role: 'adviser', office_id: 1, status: 'active', is_office_account: 0, advice_type: 'protection' }] };`);
  const names = (f, v) => plain(run(`fieldOptions(${JSON.stringify(f)}, ${JSON.stringify(v)})`)).map(([, l]) => l);
  assert.deepEqual(names({ type: 'user' }, ''), ['James Carter', 'Hannah Reid']);
  assert.deepEqual(names({ type: 'user', mortgage: true }, ''), ['James Carter']);
  assert.deepEqual(names({ type: 'user', mortgage: true }, 6), ['James Carter', 'Hannah Reid'], 'the record\'s current person is kept');
  assert.ok(plain(run(`FIELDS.cases.filter((f) => f.type === 'user').map((f) => f.mortgage)`)).every(Boolean));
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
  async ok(action, params) {
    const r = await this.get(action, params);
    assert.equal(r.status, 200, `${action}: ${r.text}`);
    return r.json;
  }
  async post(action, body) {
    const r = await this.call(action, { body: body || {} });
    assert.equal(r.status, 200, `${action}: ${r.text}`);
    return r.json;
  }
  async login(username, password = PW) { return (await this.post('login', { username, password })).user; }
  async save(entity, data, id = 0, version = null) { return (await this.post('save', { entity, id, version, data })).record; }
}

const office = new Client(), admin = new Client(), dan = new Client();
const people = {}, officeId = {};
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let phoneNo = 900500;
const phone = () => `07700 ${phoneNo++}`;

before(async () => {
  if (skip) return;
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fe2-test-'));
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir, MAP_CRM_MAIL_FILE: join(dataDir, 'mail.jsonl') }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}?action=status`); if (r.ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  await office.login('newcastle');
  await admin.login('admin');
  for (const o of (await office.ok('status')).offices) officeId[o.name] = o.id;
  for (const [name, username, role, advice] of [['James Carter', 'james.carter', 'adviser', 'mortgage_protection'], ['Hannah Reid', 'hannah.reid', 'adviser', 'protection'],
    ['Dan Hughes', 'dan.hughes', 'sales', 'mortgage_protection'], ['Sys Admin', 'sys.admin', 'manager', 'mortgage_protection']]) {
    await new Client().post('register', { full_name: name, email: `${username}@themaap.co.uk`, username, password: 'Welcome123', advice_type: advice });
    const u = (await admin.ok('adminUsers')).rows.find((x) => x.username === username);
    await admin.post('adminUserApprove', { id: u.id, role, office_id: role === 'sales' ? 0 : officeId.Newcastle, advice_type: advice });
  }
  for (const u of (await admin.ok('adminUsers')).rows) people[u.username] = u;
  // A (legacy) system admin, who sees every office.
  execFileSync('php', ['-r', `define('MAP_CRM', 1); require ${JSON.stringify(join(ROOT, 'config.php'))}; require ${JSON.stringify(join(ROOT, 'lib', 'core.php'))}; crm_db(); crm_q("UPDATE users SET role = 'admin' WHERE username = 'sys.admin'");`],
    { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir } });
  await dan.login('dan.hughes', 'Welcome123');
});
after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

async function newPage({ width = 1280, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
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
  await page.waitForSelector('#content .page-head, #content .detail-head');
}
const done = (page) => page.context().close();
const response = (page, action) => page.waitForResponse((r) => new URL(r.url()).searchParams.get('action') === action);
/** Opens a #/ address and waits for the page's data to arrive. */
async function open(page, hash, action) {
  const r = action ? response(page, action) : null;
  await page.evaluate((h) => { location.hash = h; }, hash);
  if (r) await r;
  await page.waitForTimeout(100);
}

/** A General Sales event with people on its list (names in queue order). */
async function newEvent(name, names) {
  const ev = await dan.post('salesEventSave', { name, event_date: '2026-09-20' });
  await dan.post('salesImport', { event_id: ev.id, assume_consent: true,
    rows: names.map((n) => ({ first_name: n.split(' ')[0], last_name: n.split(' ')[1], phone: phone() })) });
  return ev.id;
}
const queueName = (page) => page.textContent('.queue-person h2');
/** Leaves the call queue (which lets the person shown go) before the page is closed. */
async function leaveQueue(page) {
  const r = response(page, 'salesRelease');
  await open(page, '#/sales', 'salesEvents');
  await r;
  await done(page);
}

test('calendar: each change of month asks the server once, however often it is clicked', { skip }, async () => {
  const page = await newPage();
  await signIn(page);
  let calls = 0;
  page.on('request', (r) => { if (new URL(r.url()).searchParams.get('action') === 'calendar') calls++; });
  await open(page, '#/tasks?tab=calendar', 'calendar');
  for (let i = 1; i <= 5; i++) {
    calls = 0;
    const r = response(page, 'calendar');
    await page.click('[aria-label="Next month"]');
    await r; await page.waitForTimeout(250);
    assert.equal(calls, 1, `click ${i}`);
  }
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 5);
  assert.equal((await page.textContent('[data-body] .filters b')).trim(), d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
  await done(page);
});

test('Team & workload: a person\'s Tasks button lists that person\'s tasks', { skip }, async () => {
  await office.save('tasks', { title: 'Chase James payslips', assigned_to: people['james.carter'].id, due_date: daysFromNow(1) });
  await office.save('tasks', { title: 'Call Hannah client back', assigned_to: people['hannah.reid'].id, due_date: daysFromNow(1) });
  const page = await newPage();
  await signIn(page);
  await open(page, '#/team', 'team');
  const r = response(page, 'list');
  await page.click('.person:has-text("James Carter") a:has-text("Tasks")');
  await r; await page.waitForSelector('[data-body] .filters');
  assert.match(await page.evaluate(() => location.hash), new RegExp(`assigned_to=${people['james.carter'].id}`));
  let text = await page.textContent('[data-body]');
  assert.match(text, /Chase James payslips/);
  assert.doesNotMatch(text, /Call Hannah client back/);
  assert.match(text, /Assigned to James Carter/);
  const r2 = response(page, 'list');
  await page.click('[data-everyone]'); await r2; await page.waitForTimeout(100);
  text = await page.textContent('[data-body]');
  assert.match(text, /Call Hannah client back/);
  assert.doesNotMatch(await page.evaluate(() => location.hash), /assigned_to/);
  await done(page);
});

test('Reports does not write its filters into the address of the page opened while it was loading', { skip }, async () => {
  const page = await newPage();
  await signIn(page);
  await page.route(/action=reports/, async (route) => { await new Promise((r) => setTimeout(r, 1200)); await route.continue(); });
  const r = response(page, 'reports');
  await page.evaluate(() => { location.hash = '#/reports?tab=sources'; });
  await page.waitForTimeout(150);
  await open(page, '#/clients', 'list');
  await r; await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.hash), '#/clients');
  await done(page);
});

test('Reports: lost cases are counted under the reason picked, whatever details were typed', { skip }, async () => {
  const client = await office.save('clients', { first_name: 'Lena', last_name: 'Lost' });
  for (const detail of ['Went with Halifax direct', 'Cheaper fee elsewhere']) {
    const k = await office.save('cases', { client_id: client.id, case_type: 'ftb', stage: 'fact_find' });
    await office.save('cases', { status: 'lost', lost_reason: `Went with another broker: ${detail}` }, k.id, k.version);
  }
  const page = await newPage();
  await signIn(page);
  await open(page, '#/reports?tab=lost', 'reports');
  await page.waitForSelector('.bar-row');
  const bars = await page.$$eval('.bar-row', (rows) => rows.map((r) => [r.querySelector('.bar-label').textContent, r.querySelector('.bar-val').textContent]));
  assert.deepEqual(bars, [['Went with another broker', '2']]);
  await done(page);
});

test('Audit log: the Person list holds this office\'s people, everyone only with All offices ticked', { skip }, async () => {
  const page = await newPage();
  await signIn(page, 'sys.admin', 'Welcome123');
  await open(page, '#/audit', 'audit');
  const options = () => page.$$eval('[data-user] option', (o) => o.map((x) => x.textContent));
  let names = await options();
  assert.ok(names.includes('Newcastle Office') && names.includes('James Carter') && names.includes('Dan Hughes'), names.join(', '));
  assert.ok(!names.includes('Nottingham Office') && !names.includes('London Office'), names.join(', '));
  const r = response(page, 'audit');
  await page.check('[data-all]'); await r;
  names = await options();
  assert.ok(names.includes('Nottingham Office') && names.includes('London Office'), names.join(', '));
  await done(page);
});

test('Trash shows the names of case and policy types, not their codes', { skip }, async () => {
  const client = await office.save('clients', { first_name: 'Sophia', last_name: 'Wright' });
  const k = await office.save('cases', { client_id: client.id, case_type: 'ftb', stage: 'fact_find' });
  const p = await office.save('policies', { client_id: client.id, policy_type: 'ci', status: 'quote' });
  await office.post('delete', { entity: 'cases', id: k.id });
  await office.post('delete', { entity: 'policies', id: p.id });
  const page = await newPage();
  await signIn(page);
  await open(page, '#/trash', 'trash');
  const text = await page.textContent('#content table');
  assert.match(text, /Sophia Wright: First-time buyer/);
  assert.match(text, /Sophia Wright: Critical illness/);
  assert.doesNotMatch(text, /: (ftb|ci)\b/);
  await done(page);
});

test('"Reload the latest version" in the Lost dialog reloads the page, and the lead can then be marked lost', { skip }, async () => {
  const lead = await office.save('leads', { first_name: 'Clash', last_name: 'Lead', enquiry_type: 'ftb' });
  const page = await newPage();
  await signIn(page);
  await open(page, `#/leads/${lead.id}`, 'get');
  await page.click('.detail-head [data-act="lost"]'); await page.waitForSelector('#lost-r');
  await office.save('leads', { notes: 'Changed by someone else' }, lead.id, lead.version);
  await page.click('.modal [data-ok]'); await page.waitForSelector('.modal [data-reload-record]');
  const r = response(page, 'get');
  await page.click('.modal [data-reload-record]'); await r;
  await page.waitForSelector('.detail-head');
  assert.equal(await page.locator('.modal').count(), 0, 'the dialog closed');
  assert.match(await page.textContent('#content'), /Changed by someone else/);
  await page.click('.detail-head [data-act="lost"]'); await page.waitForSelector('#lost-r');
  const saved = response(page, 'save');
  await page.click('.modal [data-ok]'); await saved;
  await page.waitForTimeout(200);
  assert.equal((await office.ok('get', { entity: 'leads', id: lead.id })).record.status, 'lost');
  await done(page);
});

test('call queue: choosing Interested and then not handing over moves on to the next person', { skip }, async () => {
  const ev = await newEvent('Durham Show', ['Mia Scott', 'Zara Khan']);
  const page = await newPage();
  await signIn(page, 'dan.hughes', 'Welcome123');
  await open(page, `#/sales/queue?event=${ev}`, 'salesQueue');
  await page.waitForSelector('.queue-person');
  assert.equal(await queueName(page), 'Mia Scott');
  await page.click('[data-outcome="interested"]');
  await page.click('[data-save]');
  await page.waitForSelector('.modal [data-ok]:has-text("Hand over")');
  await page.click('.modal [data-ok]');
  await page.waitForSelector('#ho-o');
  const r = response(page, 'salesQueue');
  await page.click('.modal [data-close]:has-text("Cancel")'); await r;
  await page.waitForSelector('.queue-person');
  assert.equal(await queueName(page), 'Zara Khan');
  const btn = await page.evaluate(() => { const b = document.querySelector('[data-save]'); return { text: b.textContent.trim(), disabled: b.disabled }; });
  assert.deepEqual(btn, { text: 'Save & next', disabled: true });
  await leaveQueue(page);
});

test('call queue: Skip for now sends every person skipped so far', { skip }, async () => {
  const ev = await newEvent('Gateshead Fair', ['Ava Morgan', 'Ethan Price', 'Ruby Shaw']);
  const page = await newPage();
  await signIn(page, 'dan.hughes', 'Welcome123');
  await open(page, `#/sales/queue?event=${ev}`, 'salesQueue');
  await page.waitForSelector('.queue-person');
  const skips = [];
  page.on('request', (rq) => { const u = new URL(rq.url()); if (u.searchParams.get('action') === 'salesQueue') skips.push(u.searchParams.get('skip')); });
  const ids = {};
  for (const c of (await dan.ok('salesEvent', { id: ev })).contacts) ids[`${c.first_name} ${c.last_name}`] = c.id;
  assert.equal(await queueName(page), 'Ava Morgan');
  let r = response(page, 'salesQueue');
  await page.click('[data-skip]'); await r; await page.waitForSelector('.queue-person');
  assert.equal(await queueName(page), 'Ethan Price');
  r = response(page, 'salesQueue');
  await page.click('[data-skip]'); await r; await page.waitForSelector('.queue-person');
  assert.deepEqual(skips.slice(0, 2), [String(ids['Ava Morgan']), `${ids['Ethan Price']},${ids['Ava Morgan']}`]);
  await leaveQueue(page);
});

test('call queue: leaving the queue lets the person shown go at once, for the other agents', { skip }, async () => {
  const ev = await newEvent('Sunderland Expo', ['Noah Bell', 'Leah Dunn']);
  const page = await newPage();
  await signIn(page, 'dan.hughes', 'Welcome123');
  await open(page, `#/sales/queue?event=${ev}`, 'salesQueue');
  await page.waitForSelector('.queue-person');
  assert.equal(await queueName(page), 'Noah Bell');
  const r = response(page, 'salesRelease');
  await open(page, '#/sales', 'salesEvents'); await r;
  const next = await office.ok('salesQueue', { event_id: ev });
  assert.equal(`${next.contact.first_name} ${next.contact.last_name}`, 'Noah Bell', 'the next agent gets the first person, not the second');
  await done(page);
});

test('an office login is not offered Edit, Erase or Remove for someone handed to another office', { skip }, async () => {
  const ev = await newEvent('Hexham Fair', ['Gone Away', 'Still Here']);
  const contacts = (await dan.ok('salesEvent', { id: ev })).contacts;
  const gone = contacts.find((c) => c.first_name === 'Gone');
  const nottDesk = Object.values(people).find((u) => u.username === 'nottingham').id;
  await dan.post('salesHandover', { contact_id: gone.id, office_id: officeId.Nottingham, adviser_id: nottDesk, administrator_id: 0, enquiry_type: 'ftb' });
  const page = await newPage();
  await signIn(page);
  await open(page, `#/sales/events/${ev}`, 'salesEvent');
  await page.waitForSelector('#content table');
  const handed = page.locator('tr', { hasText: 'Handed to Nottingham' });
  assert.equal(await handed.count(), 1);
  assert.equal(await handed.locator('[data-edit], [data-erase], [data-remove]').count(), 0);
  assert.equal(await page.locator('tr', { hasText: 'Still Here' }).locator('[data-edit], [data-erase], [data-remove]').count(), 3);
  await done(page);
});

test('protection-only advisers\' Excel exports carry no mortgage figures or case links', { skip }, async () => {
  await office.save('leads', { first_name: 'Nora', last_name: 'Figures', loan_amount: 410000, property_value: 520000, deposit: 110000, credit_issues: 'major',
    adviser_id: people['hannah.reid'].id });
  const client = await office.save('clients', { first_name: 'Paul', last_name: 'Policy', adviser_id: people['hannah.reid'].id });
  const k = await office.save('cases', { client_id: client.id, case_type: 'remortgage', stage: 'fact_find' });
  await office.save('policies', { client_id: client.id, case_id: k.id, policy_type: 'life', status: 'quote', adviser_id: people['hannah.reid'].id });
  const page = await newPage();
  await signIn(page, 'hannah.reid', 'Welcome123');
  await open(page, '#/data');
  const sheet = async (entity) => {
    const dl = page.waitForEvent('download');
    await page.click(`[data-export="${entity}"]`);
    return readFileSync(await (await dl).path()).toString('utf8'); // stored, not compressed: the sheet's XML is readable
  };
  const leads = await sheet('leads');
  assert.match(leads, /Nora/);
  for (const col of ['loan_amount', 'property_value', 'deposit', 'credit_issues', '410000', '520000']) assert.ok(!leads.includes(`>${col}<`), col);
  const policies = await sheet('policies');
  assert.match(policies, /Paul Policy/);
  assert.ok(!policies.includes('>case_id<'));
  await done(page);
});

test('protection-only advisers get protection wording: trash, lost reasons, lead form, templates', { skip }, async () => {
  const client = await office.save('clients', { first_name: 'Grace', last_name: 'Cover', adviser_id: people['hannah.reid'].id });
  const lead = await office.save('leads', { first_name: 'Ruby', last_name: 'Shaw', enquiry_type: 'protection', timescale: 'asap', credit_issues: 'major', adviser_id: people['hannah.reid'].id });
  const page = await newPage();
  await signIn(page, 'hannah.reid', 'Welcome123');
  await open(page, `#/clients/${client.id}`, 'get');
  await page.click('.detail-head [data-act="delete"]'); await page.waitForSelector('.modal');
  assert.match(await page.textContent('.modal'), /Their policies and tasks go to the trash too\./);
  await page.click('.modal [data-close]:has-text("Cancel")');
  await open(page, `#/leads/${lead.id}`, 'get');
  const leadText = await page.textContent('#content');
  assert.doesNotMatch(leadText, /Credit history|offer accepted/);
  assert.match(leadText, /Timescale\s*Now/);
  await page.click('.detail-head [data-act="lost"]'); await page.waitForSelector('#lost-r');
  const reasons = await page.$$eval('#lost-r option', (o) => o.map((x) => x.textContent));
  assert.ok(reasons.includes('Bought cover elsewhere'));
  assert.ok(!reasons.some((x) => /lender|Sale fell through/.test(x)), reasons.join(', '));
  await page.keyboard.press('Escape');
  await page.click('.detail-head [data-act="edit"]'); await page.waitForSelector('.modal [name="timescale"]');
  assert.equal(await page.locator('.modal [name="credit_issues"]').count(), 0);
  assert.equal(await page.textContent('.modal [name="timescale"] option[value="asap"]'), 'Now');
  await page.keyboard.press('Escape');
  await open(page, '#/templates', 'list');
  await page.click('[data-new]'); await page.waitForSelector('.modal [name="category"]');
  assert.equal(await page.getAttribute('.modal [name="category"]', 'placeholder'), 'e.g. Leads, Protection, Insurance');
  assert.equal(await page.locator('#nav a[data-nav="sales"]').count(), 0);
  await done(page);
});

test('Protection: "Renewals" lists the renewals due in the next 30 days that the Renewals figures count', { skip }, async () => {
  const client = await office.save('clients', { first_name: 'Rena', last_name: 'Newal' });
  for (const days of [-5, 18, 45]) await office.save('policies', { client_id: client.id, policy_type: 'home', status: 'on_risk', renewal_date: daysFromNow(days) });
  const page = await newPage();
  await signIn(page);
  await open(page, '#/protection?status=renewals', 'list');
  await page.waitForSelector('[data-table] table');
  assert.equal(await page.locator('[data-table] tr', { hasText: 'Rena Newal' }).count(), 1);
  const kpi = +(await page.textContent('.kpi:has-text("Renewals · 30 days") .k-value')).trim();
  assert.equal(kpi, await page.locator('[data-table] tbody tr').count(), 'the KPI and the list agree');
  await done(page);
});

test('importing an Excel sign-up list keeps the leading 0 of phone numbers, so duplicates are caught', { skip }, async () => {
  const ev = await dan.post('salesEventSave', { name: 'Alnwick Fete', event_date: '2026-09-20' });
  await dan.post('salesContactSave', { event_id: ev.id, first_name: 'Ethan', last_name: 'Price', phone: '07700 900302', consent: true });
  const { run } = loadFrontEnd();
  const blob = run('buildXlsx')([['First name', 'Last name', 'Phone', 'Consent'], ['Ethan', 'Price', 7700900302, 'Yes'], ['Nina', 'Fox', 7700900777, 'Yes']]);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const page = await newPage();
  await signIn(page, 'dan.hughes', 'Welcome123');
  await open(page, `#/sales/events/${ev.id}`, 'salesEvent');
  await page.click('[data-act="import"]'); await page.waitForSelector('.modal [data-file]');
  await page.setInputFiles('.modal [data-file]', { name: 'signups.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  await page.waitForSelector('.modal [data-go]:not([disabled])');
  const r = response(page, 'salesImport');
  await page.click('.modal [data-go]');
  const res = await (await r).json();
  assert.equal(res.added, 1);
  assert.equal(res.duplicates, 1);
  const phones = (await dan.ok('salesEvent', { id: ev.id })).contacts.map((c) => c.phone).sort();
  assert.deepEqual(phones, ['07700 900302', '07700900777']);
  await done(page);
});

test('a task opened from a link closes when you move to another page', { skip }, async () => {
  const page = await newPage();
  await signIn(page);
  const id = await page.evaluate(async () => {
    const r = await fetch('api.php?action=save', { method: 'POST', headers: { 'X-MAP-CRM': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'tasks', id: 0, data: { title: 'Dialog test task' } }) });
    return (await r.json()).record.id;
  });
  await page.evaluate((h) => { location.hash = h; }, `#/tasks/${id}`);
  await page.waitForSelector('#modals .modal-layer');
  await page.evaluate(() => { location.hash = '#/dashboard'; });
  await page.waitForSelector('#content .page-head');
  await page.waitForTimeout(200);
  assert.equal(await page.$('#modals .modal-layer'), null, 'no dialog left over the dashboard');
  await done(page);
});

test('no uncaught errors in the pages above', { skip }, () => {
  assert.deepEqual(pageErrors, []);
});
