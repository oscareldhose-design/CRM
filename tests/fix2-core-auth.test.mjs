// Regression tests for the second-round core/auth fixes (#24, #27, #30). Run with: node --test tests/fix2-core-auth.test.mjs
// Starts PHP's built-in server on its own throwaway database (same harness as api.test.mjs). The last test drives the
// app in Chromium and is skipped when Playwright is not installed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PW = 'Map@2025#';
const NEW_PW = 'Secret12345!';
const servers = [];
const dirs = [];

const tempDir = () => { const d = mkdtempSync(join(tmpdir(), 'map-crm-fix2-')); dirs.push(d); return d; };

/** Starts php -S on a free random port. Several workers, so the browser's spare connections can't stall it. */
async function startServer({ dataDir = tempDir(), env = {} } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = 19000 + Math.floor(Math.random() * 1000);
    const proc = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', ROOT], {
      env: { ...process.env, MAP_CRM_DATA_DIR: dataDir, MAP_CRM_MAIL_FILE: join(dataDir, 'mail.jsonl'), PHP_CLI_SERVER_WORKERS: '4', ...env },
      stdio: 'ignore',
    });
    let exited = false;
    proc.on('exit', () => { exited = true; });
    for (let i = 0; i < 50 && !exited; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (exited) break;
      try {
        await fetch(`http://127.0.0.1:${port}/`);
        servers.push(proc);
        return { base: `http://127.0.0.1:${port}`, dataDir, proc };
      } catch { /* starting */ }
    }
    proc.kill();
  }
  throw new Error('PHP server did not start');
}

class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  async call(action, { params = {}, body } = {}) {
    const url = new URL(`${this.base}/api.php`);
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
  post(action, body) { return this.call(action, { body: body || {} }); }
  async ok(action, params) {
    const r = await this.get(action, params);
    assert.equal(r.status, 200, `${action}: ${r.text}`);
    return r.json;
  }
  async login(username, password = PW) {
    const r = await this.post('login', { username, password });
    assert.equal(r.status, 200, `login ${username}: ${r.text}`);
    return r.json.user;
  }
  async save(entity, data, id = 0, version = null) {
    const r = await this.post('save', { entity, id, version, data });
    assert.equal(r.status, 200, `save ${entity}: ${r.text}`);
    return r.json.record;
  }
}

/** Runs PHP code against the test server's database (config.php and lib/core.php loaded). */
const php = (code) => execFileSync('php', ['-r', `define('MAP_CRM', 1); require ${JSON.stringify(join(ROOT, 'config.php'))}; require ${JSON.stringify(join(ROOT, 'lib', 'core.php'))}; crm_db(); ${code}`],
  { env: { ...process.env, MAP_CRM_DATA_DIR: A.dataDir } }).toString();

let A;
const admin = {}, office = {}, people = {};
const at = (name) => people[name].c;

/** Adds a login from the admin panel, signs it in and replaces its temporary password. */
async function addStaff(username, role, officeName, advice) {
  const full = username.split('.').map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  const r = await admin.c.post('adminUserSave', { id: 0, full_name: full, email: `${username}@themaap.co.uk`, username, role,
    office_id: officeName ? office[officeName] : 0, advice_type: advice, status: 'active' });
  assert.equal(r.status, 200, r.text);
  const c = new Client(A.base);
  await c.login(username, r.json.temp_password);
  const ch = await c.post('changePassword', { current_password: r.json.temp_password, new_password: NEW_PW });
  assert.equal(ch.status, 200, ch.text);
  people[username] = { c, id: r.json.user.id, full };
}

before(async () => {
  A = await startServer();
  admin.c = new Client(A.base);
  await admin.c.login('admin');
  for (const o of (await admin.c.get('status')).json.offices) office[o.name] = o.id;
  for (const name of ['newcastle', 'nottingham']) {
    people[name] = { c: new Client(A.base) };
    await people[name].c.login(name);
  }
  await addStaff('paula.prot', 'manager', 'Newcastle', 'protection');          // protection-only manager
  await addStaff('mark.mgr', 'manager', 'Newcastle', 'mortgage_protection');   // ordinary manager
  await addStaff('hannah.reid', 'adviser', 'Newcastle', 'protection');         // protection-only adviser
  await addStaff('james.carter', 'adviser', 'Newcastle', 'mortgage_protection');
  await addStaff('victoria.blake', 'adviser', 'Nottingham', 'mortgage_protection');
  await addStaff('sid.sales', 'sales', null, 'mortgage_protection');           // General Sales
  await addStaff('pete.sales', 'sales', null, 'protection');                   // a General Sales login marked protection only
  await addStaff('sys.admin', 'manager', 'Newcastle', 'protection');           // made a (legacy) system admin below
  php(`crm_q("UPDATE users SET role = 'admin' WHERE username = 'sys.admin'");`);
});
after(() => {
  servers.forEach((s) => s.kill());
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
});

/* ---- #24: a protection-only office login doesn't get the General Sales area ------------------------- */

test('a protection-only manager or system admin is kept out of General Sales; everyone else keeps it', async () => {
  // Some General Sales work to look at: an event with a remortgage enquiry.
  const ev = await at('mark.mgr').post('salesEventSave', { name: 'Home Show', event_date: '2026-09-20' });
  assert.equal(ev.status, 200, ev.text);
  const add = await at('mark.mgr').post('salesContactSave', { event_id: ev.json.id, first_name: 'Ethan', last_name: 'Price', phone: '07866 600101',
    interest: 'Remortgage', consent: true });
  assert.equal(add.status, 200, add.text);
  const contactId = add.json.id;

  for (const who of ['paula.prot', 'sys.admin']) {
    const c = at(who);
    for (const [action, params] of [['salesEvents'], ['salesEvent', { id: ev.json.id }], ['salesQueue', { event_id: ev.json.id }], ['salesResults'],
      ['salesStaff', { office_id: office.Newcastle }]]) {
      const r = await c.get(action, params);
      assert.equal(r.status, 403, `${who} ${action}: ${r.text}`);
      assert.equal(r.json.code, 'protection_only');
      assert.doesNotMatch(r.text, /Ethan|Remortgage|Home Show/);
    }
    for (const [action, body] of [['salesEventSave', { name: 'Nope', event_date: '2026-09-21' }],
      ['salesContactSave', { event_id: ev.json.id, first_name: 'No', last_name: 'One', phone: '07866 600102', consent: true }],
      ['salesHandover', { contact_id: contactId, office_id: office.Newcastle, adviser_id: people['james.carter'].id, enquiry_type: 'remortgage' }]]) {
      const r = await c.post(action, body);
      assert.equal(r.status, 403, `${who} ${action}: ${r.text}`);
      assert.equal(r.json.code, 'protection_only');
    }
    // Their own (protection) CRM still works.
    assert.equal((await c.get('list', { entity: 'leads' })).status, 200);
  }
  assert.equal((await at('paula.prot').get('salesEvents')).json.message, 'General Sales is not part of your login (protection only).');

  // Ordinary managers, office logins and General Sales logins (even one marked protection only) keep the area.
  for (const who of ['mark.mgr', 'newcastle', 'sid.sales', 'pete.sales']) {
    const r = await at(who).get('salesEvents');
    assert.equal(r.status, 200, `${who}: ${r.text}`);
    assert.ok(r.json.rows.some((e) => e.id === ev.json.id));
  }
  // A mortgage manager can still hand a mortgage enquiry to a mortgage adviser.
  const ho = await at('mark.mgr').post('salesHandover', { contact_id: contactId, office_id: office.Newcastle, adviser_id: people['james.carter'].id,
    administrator_id: 0, enquiry_type: 'remortgage' });
  assert.equal(ho.status, 200, ho.text);
  // Other office roles are still told General Sales can't open client files, as before.
  assert.equal((await at('sid.sales').get('list', { entity: 'leads' })).status, 403);
  assert.equal((await at('hannah.reid').get('salesEvents')).json.code, 'forbidden');
});

/* ---- #27: meta holds no mortgage reference data for a protection-only login ------------------------- */

test('a protection-only login\'s meta has no compliance checklist or mortgage choices; other logins keep them', async () => {
  const meta = await at('hannah.reid').ok('meta');
  assert.equal(meta.user.protection_only, true);
  assert.ok(!('compliance_items' in meta), 'no mortgage compliance checklist');
  const e = meta.enums;
  for (const k of ['case_type', 'stage', 'case_status', 'rate_type', 'document_status']) {
    assert.deepEqual(e[k], {}, `${k} is an empty list (the screens still read it safely)`);
  }
  assert.deepEqual(e.document_names, []);
  assert.deepEqual(Object.keys(e.enquiry_type).sort(), ['business_protection', 'insurance', 'other', 'protection']);
  assert.ok(!('remortgage' in e.opportunity_type));
  assert.ok('protection_gap' in e.opportunity_type && 'landlord_cover' in e.opportunity_type);
  assert.ok('life' in e.policy_type && 'mortgage_protection' in e.policy_type, 'protection products are all still there');
  assert.ok(e.lead_status && e.source && e.task_priority && e.lost_reason, 'everything else is unchanged');
  assert.doesNotMatch(JSON.stringify(meta), /Remortgage|Mortgage offer|Offer issued|Decision in principle|Valuation report|Source of deposit|Offer checked|Buy to let/);

  // The protection-only manager is the same; a General Sales login marked protection only is offered protection enquiries only.
  const pm = await at('paula.prot').ok('meta');
  assert.ok(!('compliance_items' in pm));
  assert.deepEqual(pm.enums.stage, {});
  assert.deepEqual(Object.keys((await at('pete.sales').ok('meta')).enums.enquiry_type).sort(), ['business_protection', 'insurance', 'other', 'protection']);

  for (const who of ['james.carter', 'newcastle', 'mark.mgr']) {
    const m = await at(who).ok('meta');
    assert.ok(m.compliance_items.some((i) => i.key === 'offer_checked'), who);
    assert.equal(m.enums.stage.offer, 'Offer issued');
    assert.equal(m.enums.enquiry_type.remortgage, 'Remortgage');
    assert.equal(m.enums.opportunity_type.remortgage, 'Remortgage');
    assert.ok(m.enums.document_names.includes('Mortgage offer'));
  }
  assert.equal((await at('sid.sales').ok('meta')).enums.enquiry_type.ftb, 'First-time buyer', 'General Sales can hand over every kind of enquiry');
});

/* ---- #30: meta's staff list is this office's people (plus admins and General Sales), with no emails --- */

test('meta lists only the people in your own office (plus system admins and General Sales) and never their emails', async () => {
  const ids = (m) => m.users.map((u) => u.id);
  const nc = await at('hannah.reid').ok('meta');
  assert.ok(nc.users.every((u) => !('email' in u)), 'no email addresses');
  assert.ok(nc.users.every((u) => u.office_id === office.Newcastle || ['admin', 'sales'].includes(u.role)), JSON.stringify(nc.users));
  for (const who of ['james.carter', 'paula.prot', 'mark.mgr', 'sid.sales', 'sys.admin']) assert.ok(ids(nc).includes(people[who].id), who);
  assert.ok(!ids(nc).includes(people['victoria.blake'].id), 'not another office\'s adviser');
  assert.ok(!nc.users.some((u) => /Victoria|Nottingham|London/.test(u.full_name)), 'or another office\'s login');
  assert.ok(!nc.users.some((u) => u.role === 'webadmin'));
  assert.doesNotMatch(JSON.stringify(nc), /victoria\.blake|james\.carter@/);
  assert.ok(nc.users.some((u) => u.is_office_account === 1 && u.office_id === office.Newcastle), 'the office login is still named');

  const nt = await at('nottingham').ok('meta');
  assert.ok(ids(nt).includes(people['victoria.blake'].id));
  assert.ok(!ids(nt).includes(people['james.carter'].id) && !ids(nt).includes(people['hannah.reid'].id));
  assert.equal(nt.users.find((u) => u.id === people['victoria.blake'].id).full_name, 'Victoria Blake');

  const sales = await at('sid.sales').ok('meta');
  assert.ok(sales.users.every((u) => ['admin', 'sales'].includes(u.role)), 'General Sales gets no office staff list');
  assert.ok(ids(sales).includes(people['pete.sales'].id));

  // A system admin works in every office, so it still gets everyone (but no emails).
  const sys = await at('sys.admin').ok('meta');
  for (const who of ['victoria.blake', 'james.carter', 'sid.sales']) assert.ok(ids(sys).includes(people[who].id), who);
  assert.ok(sys.users.every((u) => !('email' in u)));
  // The user's own record (account page) still has their email.
  assert.equal(nc.user.email, 'hannah.reid@themaap.co.uk');
});

/* ---- The app still works for a protection-only adviser with the trimmed meta ----------------------- */

let chromium = null;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(spec)); break; } catch { /* try the next place */ }
}

test('in the browser, a protection-only adviser\'s screens (and converting a lead) work with no mortgage choices in meta', { skip: chromium ? false : 'Playwright is not installed' }, async (t) => {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined });
  } catch {
    t.skip('Chromium could not start');
    return;
  }
  const hannah = at('hannah.reid');
  const lead = await hannah.save('leads', { first_name: 'Ruby', last_name: 'Shaw', phone: '07700 900502', enquiry_type: 'protection', adviser_id: people['hannah.reid'].id });
  const client = await hannah.save('clients', { first_name: 'Cara', last_name: 'Cover', phone: '07700 900503' });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/^https:\/\//, (route) => route.abort()); // web fonts are not needed here
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${A.base}/`);
    // (Under load the sign-in form is now and then drawn again just after it is filled in: then try once more.)
    for (let i = 0; ; i++) {
      await page.waitForSelector('#si-user');
      await page.fill('#si-user', 'hannah.reid');
      await page.fill('input[name="password"]', NEW_PW);
      await page.click('#signinForm button[type="submit"]');
      try { await page.waitForSelector('#content .page-head h1', { timeout: 10000 }); break; } catch (err) { if (i === 2) throw err; }
    }

    const visit = async (hash, heading) => {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.waitForFunction((t) => { const h1 = document.querySelector('#content h1'); return h1 && h1.textContent.includes(t); }, heading, { timeout: 10000 });
    };
    await visit('#/leads', 'Leads');
    await visit('#/protection', 'Protection');
    await visit('#/opportunities', 'Opportunities');
    await visit('#/lost', 'Lost leads');
    await visit('#/reports', 'Reports');
    await visit('#/tasks', 'Tasks');
    await visit('#/templates', 'Email templates');
    await visit('#/introducers', 'Introducers');
    await visit('#/team', 'Team & workload');
    await visit('#/data', 'Import, export & backups');
    await visit('#/trash', 'Trash');
    await visit('#/account', 'My account');
    await visit(`#/clients/${client.id}`, 'Cara');
    await visit(`#/leads/${lead.id}`, 'Ruby');
    // Converting a lead reads the case types from meta: it must offer the protection quote, not crash.
    await page.click('[data-act="convert"]');
    await page.waitForSelector('.modal #cv-case');
    assert.match(await page.textContent('.modal'), /protection \/ insurance quote/);
    assert.doesNotMatch(await page.textContent('.modal'), /mortgage case/);
    await page.click('.modal [data-close]');
    // The quick-add lead form offers only protection enquiries.
    await page.click('[data-fab]');
    await page.click('[data-quick="lead"]');
    await page.waitForSelector('.modal [name="enquiry_type"]');
    const opts = await page.$$eval('.modal [name="enquiry_type"] option', (os) => os.map((o) => o.value).filter(Boolean));
    assert.deepEqual(opts.sort(), ['business_protection', 'insurance', 'other', 'protection']);
    await ctx.close();
  } finally {
    await browser.close();
  }
  assert.deepEqual(errors, [], 'no script errors');
});
