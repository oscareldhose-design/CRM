// Second-round regression tests for the screens API (crm/lib/views.php). Run with: node --test tests/fix2-views.test.mjs
// Starts PHP's built-in server on a throwaway database, like tests/api.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 30000 + Math.floor(Math.random() * 5000);
const BASE = `http://127.0.0.1:${PORT}/api.php`;
const PW = 'Map@2025#';
let server, dataDir, mailFile;

class Client {
  constructor() { this.cookie = ''; }
  async call(action, { params = {}, body, csrf = true } = {}) {
    const url = new URL(BASE);
    url.searchParams.set('action', action);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers = { Accept: 'application/json' };
    if (csrf) headers['X-MAP-CRM'] = '1';
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
    try { json = JSON.parse(text); } catch { /* download */ }
    return { status: res.status, json, text, headers: res.headers };
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
const cron = () => execFileSync('php', [join(ROOT, 'api.php'), 'cron'], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir } });
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fix2-views-'));
  mailFile = join(dataDir, 'mail.jsonl');
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir, MAP_CRM_MAIL_FILE: mailFile }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}?action=status`); if (r.ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('PHP server did not start');
});
after(() => { server.kill(); rmSync(dataDir, { recursive: true, force: true }); });

const officeId = {};
const newcastle = new Client(), admin = new Client(), hannah = new Client(), sarah = new Client();
const staff = {};
const W = {}; // records made in the setup that later tests look at

/** Requests a login and has the admin approve it; returns the user's row. */
async function makeUser(username, advice, office, role = 'adviser') {
  const reg = await new Client().post('register', { full_name: username.replace('.', ' '), email: `${username}@themaap.co.uk`, username, password: 'Secret123', advice_type: advice });
  assert.equal(reg.status, 200, reg.text);
  const row = (await admin.get('adminUsers')).json.rows.find((u) => u.username === username);
  const ok = await admin.post('adminUserApprove', { id: row.id, role, office_id: officeId[office], advice_type: advice });
  assert.equal(ok.status, 200, ok.text);
  return (await admin.get('adminUsers')).json.rows.find((u) => u.username === username);
}

/** Open opportunities of a client as the office login sees them. */
const oppsOf = async (who, clientId, status = 'all') => (await who.ok('opportunities', { status })).rows.filter((o) => o.client_id === clientId);

test('setup: a client of a protection-only adviser with a completed purchase whose fixed rate ends soon', async () => {
  (await new Client().get('status')).json.offices.forEach((o) => { officeId[o.name] = o.id; });
  await newcastle.login('newcastle');
  await admin.login('admin');
  staff.sarah = await makeUser('sarah.ahmed', 'mortgage_protection', 'Newcastle');
  staff.hannah = await makeUser('hannah.reid', 'protection', 'Newcastle');
  await hannah.login('hannah.reid', 'Secret123');
  await sarah.login('sarah.ahmed', 'Secret123');

  W.client = await newcastle.save('clients', { first_name: 'Thomas', last_name: 'Young', adviser_id: staff.hannah.id });
  W.case = await newcastle.save('cases', { client_id: W.client.id, case_type: 'ftb', stage: 'completed', completion_date: daysFromNow(-200),
    fixed_rate_end_date: daysFromNow(100), lender: 'HSBC', loan_amount: 180000, rate_type: 'fixed', adviser_id: staff.sarah.id });
  cron();
  const ops = await oppsOf(newcastle, W.client.id, 'open');
  W.remOpp = ops.find((o) => o.type === 'remortgage');
  W.gapOpp = ops.find((o) => o.type === 'protection_gap');
  W.homeOpp = ops.find((o) => o.type === 'home_insurance');
  assert.ok(W.remOpp && W.gapOpp && W.homeOpp, `the engine raised remortgage, protection gap and home insurance opportunities: ${JSON.stringify(ops.map((o) => o.type))}`);
  assert.match(W.gapOpp.detail, /mortgage/, 'the office login sees the engine\'s own wording');
});

test('a task the office login makes from an opportunity has no mortgage wording for the protection-only adviser it goes to', async () => {
  for (const op of [W.gapOpp, W.homeOpp]) {
    const act = await newcastle.post('opportunityAct', { id: op.id, action: 'task' });
    assert.equal(act.status, 200, act.text);
    // The task goes to the client's adviser, who gives protection advice only, and they can open it.
    const task = (await hannah.ok('get', { entity: 'tasks', id: act.json.task_id })).record;
    assert.equal(task.assigned_to, staff.hannah.id);
    assert.equal(task.client_id, W.client.id);
    assert.ok(task.notes, 'the task still says why');
    assert.ok(!/mortgage|buying a home|completion|with us/i.test(`${task.title} ${task.notes}`), `${task.title} | ${task.notes}`);
    // The opportunities screen itself still shows the office login the engine's wording.
    assert.equal((await oppsOf(newcastle, W.client.id)).find((o) => o.id === op.id).detail, op.detail);
  }
});

test('a remortgage opportunity whose case is in the trash is not listed and no task can be made from it', async () => {
  const dashBefore = (await newcastle.ok('dashboard')).kpis.opportunities;
  const countBefore = (await newcastle.ok('opportunities', { status: 'open' })).counts.remortgage;
  assert.equal(countBefore, 1);
  assert.equal((await newcastle.post('delete', { entity: 'cases', id: W.case.id })).status, 200);

  // Left out like the opportunities of a client in the trash: list, counts, dashboard and bell.
  const list = await newcastle.ok('opportunities', { status: 'all' });
  assert.ok(!list.rows.some((o) => o.id === W.remOpp.id), 'not listed while its case is in the trash');
  assert.ok(!list.counts.remortgage, JSON.stringify(list.counts));
  assert.equal((await newcastle.ok('dashboard')).kpis.opportunities, dashBefore - 1);
  assert.ok(!(await sarah.ok('notifications')).items.some((i) => /Remortgage/.test(i.text)));

  const tasksBefore = (await newcastle.ok('list', { entity: 'tasks' })).rows.length;
  for (const action of ['task', 'dismissed']) {
    const r = await newcastle.post('opportunityAct', { id: W.remOpp.id, action });
    assert.equal(r.status, 404, `${action}: ${r.text}`);
  }
  assert.equal((await newcastle.ok('list', { entity: 'tasks' })).rows.length, tasksBefore, 'no task was made');
  const hers = (await hannah.ok('list', { entity: 'tasks' })).rows;
  assert.ok(!hers.some((t) => /Remortgage|HSBC/.test(`${t.title} ${t.notes || ''}`)), JSON.stringify(hers.map((t) => t.title)));

  // Restored, the case brings its opportunity back.
  assert.equal((await newcastle.post('restore', { entity: 'cases', id: W.case.id })).status, 200);
  assert.ok((await oppsOf(newcastle, W.client.id)).some((o) => o.id === W.remOpp.id));
});

test('a remortgage follow-up task keeps its case and is not given to the client\'s protection-only adviser', async () => {
  const act = await newcastle.post('opportunityAct', { id: W.remOpp.id, action: 'task' });
  assert.equal(act.status, 200, act.text);
  const task = (await newcastle.ok('get', { entity: 'tasks', id: act.json.task_id })).record;
  assert.equal(task.case_id, W.case.id, 'the task stays on the case');
  assert.notEqual(task.assigned_to, staff.hannah.id, 'case work does not go to someone who gives protection advice only');
  assert.match(task.notes, /HSBC/, 'case work keeps the engine\'s wording');
  assert.equal((await hannah.get('get', { entity: 'tasks', id: task.id })).status, 404, 'the protection-only adviser cannot see it');
  assert.ok(!(await hannah.ok('list', { entity: 'tasks' })).rows.some((t) => t.id === task.id));
});
