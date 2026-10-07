// Regression tests for the core/auth fixes. Run with: node --test tests/fix-core-auth.test.mjs
// Each group starts PHP's built-in server on its own throwaway database (same harness as api.test.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PW = 'Map@2025#';
const servers = [];
const dirs = [];

const tempDir = () => { const d = mkdtempSync(join(tmpdir(), 'map-crm-fix-')); dirs.push(d); return d; };

/** Starts php -S on a free random port. PHP_CLI_SERVER_WORKERS > 1 lets requests really run in parallel. */
async function startServer({ dataDir = tempDir(), env = {}, workers = 1 } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = 19000 + Math.floor(Math.random() * 1000);
    const proc = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', ROOT], {
      env: { ...process.env, MAP_CRM_DATA_DIR: dataDir, MAP_CRM_MAIL_FILE: join(dataDir, 'mail.jsonl'), PHP_CLI_SERVER_WORKERS: String(workers), ...env },
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
  async call(action, { params = {}, body, raw } = {}) {
    const url = new URL(`${this.base}/api.php`);
    url.searchParams.set('action', action);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers = { Accept: 'application/json', 'X-MAP-CRM': '1' };
    if (this.cookie) headers.Cookie = this.cookie;
    const opts = { method: body || raw ? 'POST' : 'GET', headers };
    if (body || raw) { headers['Content-Type'] = 'application/json'; opts.body = raw || JSON.stringify(body); }
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

/** Runs PHP code with config.php and lib/core.php loaded. */
const php = (code, env = {}) => execFileSync('php', ['-r', `define('MAP_CRM', 1); require ${JSON.stringify(join(ROOT, 'config.php'))}; require ${JSON.stringify(join(ROOT, 'lib', 'core.php'))}; ${code}`],
  { env: { ...process.env, MAP_CRM_DATA_DIR: tempDir(), ...env } }).toString();

const tally = (rs) => rs.reduce((t, r) => { const k = `${r.status}:${r.json && r.json.code}`; t[k] = (t[k] || 0) + 1; return t; }, {});

let A; // normal server (8 workers), used by most tests
before(async () => { A = await startServer({ workers: 8 }); });
after(() => {
  servers.forEach((s) => s.kill());
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
});

/* ---- PHP 7.4/8.0 return SQLite numbers as strings (findings #2, #5) ------------------------------ */

test('query helpers return native ints and floats even when PDO stringifies (PHP 7.4/8.0 behaviour)', () => {
  const out = php(`echo json_encode([crm_val('SELECT 7'), crm_val('SELECT 225000.0'), crm_val("SELECT '07700900111'"), crm_val('SELECT NULL'),
    crm_one("SELECT 1 AS a, 2.5 AS b, '3' AS c, NULL AS d, 'x' AS e"), crm_all('SELECT 1 AS n UNION ALL SELECT 2'), crm_val('SELECT 1 WHERE 0')], JSON_PRESERVE_ZERO_FRACTION);`,
  { MAP_CRM_STRINGIFY_FETCHES: '1' });
  assert.equal(out, '[7,225000.0,"07700900111",null,{"a":1,"b":2.5,"c":"3","d":null,"e":"x"},[{"n":1},{"n":2}],null]');
});

/** The JSON types of a response, so two servers' answers can be compared regardless of ids and times. */
const shape = (v) => (Array.isArray(v) ? v.map(shape) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])])) : v === null ? 'null' : typeof v);

async function typeScenario(base) {
  const c = new Client(base);
  await c.login('newcastle');
  const out = {};
  out.status = (await c.get('status')).json;
  out.meta = (await c.get('meta')).json;
  const lead = await c.save('leads', { first_name: 'Tia', last_name: 'Types', phone: '07700 900500', enquiry_type: 'ftb', loan_amount: 225000, property_value: 260000 });
  const again = await c.save('leads', { first_name: 'Tia', last_name: 'Types', loan_amount: 225000, property_value: 260000 }, lead.id, lead.version);
  out.versions = [lead.version, again.version];
  out.lead = (await c.get('get', { entity: 'leads', id: lead.id })).json;
  out.leads = (await c.get('list', { entity: 'leads' })).json;
  out.templates = (await c.get('list', { entity: 'templates' })).json;
  out.tasks = (await c.get('list', { entity: 'tasks' })).json;
  return out;
}

test('with numbers returned as strings, every answer still carries numbers where PHP 8.1+ does', async () => {
  const B = await startServer({ env: { MAP_CRM_STRINGIFY_FETCHES: '1' } });
  const old = await typeScenario(B.base);
  const now = await typeScenario(A.base);
  assert.ok(old.meta.users.length > 0);
  for (const u of old.meta.users) {
    assert.equal(typeof u.id, 'number');
    assert.equal(typeof u.is_office_account, 'number', 'so !u.is_office_account works in the browser');
  }
  assert.ok(old.status.offices.every((o) => typeof o.id === 'number'));
  assert.ok(old.templates.rows.length > 0 && old.templates.rows.every((t) => typeof t.id === 'number'));
  assert.equal(old.lead.record.loan_amount, 225000);
  assert.equal(typeof old.lead.record.version, 'number');
  assert.deepEqual(old.versions, [1, 1], 'saving without changes does not bump the version');
  assert.deepEqual(shape(old), shape(now), 'same JSON types as on PHP 8.1+');
});

/* ---- Sign-in: lock and per-connection limit can't be raced (#21), NUL bytes (#74) ------------------ */

test('wrong passwords sent in parallel still lock the login after five tries', async () => {
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => new Client(A.base).post('login', { username: 'nottingham', password: `Wrong${i}` })));
  const t = tally(rs);
  assert.ok((t['401:bad_login'] || 0) <= 4, `at most 5 passwords were checked: ${JSON.stringify(t)}`);
  assert.equal((t['401:bad_login'] || 0) + (t['423:locked'] || 0), 30, JSON.stringify(t));
  const right = await new Client(A.base).post('login', { username: 'nottingham', password: PW });
  assert.equal(right.status, 423, 'the login is locked');
  const admin = new Client(A.base);
  await admin.login('admin');
  const id = (await admin.get('adminUsers')).json.rows.find((u) => u.username === 'nottingham').id;
  assert.equal((await admin.post('adminUserUnlock', { id })).status, 200);
  await new Client(A.base).login('nottingham');
});

test('a locked admin login is pointed to the recovery code', async () => {
  const S = await startServer();
  let last;
  for (let i = 0; i < 5; i++) last = await new Client(S.base).post('login', { username: 'admin', password: `nope${i}` });
  assert.equal(last.status, 423);
  const r = await new Client(S.base).post('login', { username: 'admin', password: PW });
  assert.equal(r.status, 423);
  assert.match(r.json.message, /recovery code/);
});

test('a NUL byte in a password is a normal wrong password or a validation message, never a server error', async () => {
  const unknown = await new Client(A.base).call('login', { raw: '{"username":"nobody.here","password":"a\\u0000b"}' });
  assert.equal(unknown.status, 401);
  const known = await new Client(A.base).call('login', { raw: '{"username":"london","password":"Map@2025#\\u0000x"}' });
  assert.equal(known.status, 401, 'bcrypt would ignore the part after the NUL; the CRM does not');
  const reg = await new Client(A.base).call('register', { raw: '{"full_name":"Nul Byte","email":"nul.byte@themaap.co.uk","username":"nul.byte","password":"Secret123\\u0000x","advice_type":"protection"}' });
  assert.equal(reg.status, 400);
  assert.equal(reg.json.field, 'password');
  const rec = await new Client(A.base).call('recover', { raw: '{"username":"admin","code":"MAP-AAAA-AAAA-AAAA-AAAA","new_password":"Secret123\\u0000x"}' });
  assert.equal(rec.status, 400);
});

/* ---- Account requests: usernames are not cut short (#76) ------------------------------------------ */

test('usernames longer than 32 characters are refused, not silently shortened', async () => {
  const base = { full_name: 'Lena Long', password: 'Secret123', advice_type: 'protection' };
  const long = await new Client(A.base).post('register', { ...base, email: 'lena.long@themaap.co.uk', username: 'abcdefghijklmnopqrstuvwxyz0123456789abcd' });
  assert.equal(long.status, 400);
  assert.equal(long.json.field, 'username');
  const ok = await new Client(A.base).post('register', { ...base, email: 'lena.long@themaap.co.uk', username: 'abcdefghijklmnopqrstuvwxyz012345' });
  assert.equal(ok.status, 200, ok.text);
});

/* ---- General Sales: people handed to another office (#20) ------------------------------------------ */

test('office logins cannot change, remove or erase a General Sales contact handed to another office', async () => {
  const newcastle = new Client(A.base), nottingham = new Client(A.base), london = new Client(A.base);
  await newcastle.login('newcastle');
  await nottingham.login('nottingham');
  const lon = await london.login('london');
  const ev = await newcastle.post('salesEventSave', { name: 'Scope Show', event_date: '2026-09-20' });
  assert.equal(ev.status, 200, ev.text);
  const add = await newcastle.post('salesContactSave', { event_id: ev.json.id, first_name: 'Lena', last_name: 'London', phone: '07866 600001', consent: true });
  assert.equal(add.status, 200, add.text);
  const id = add.json.id;
  const ho = await newcastle.post('salesHandover', { contact_id: id, office_id: lon.office_id, adviser_id: lon.id, enquiry_type: 'ftb' });
  assert.equal(ho.status, 200, ho.text);
  for (const c of [nottingham, newcastle]) {
    assert.equal((await c.post('salesContactErase', { id, confirm: 'ERASE' })).status, 403);
    assert.equal((await c.post('salesContactDelete', { id })).status, 403);
    assert.equal((await c.post('salesContactSave', { id, first_name: 'X', last_name: 'Y', phone: '07866 600001', consent: true })).status, 403);
  }
  const edit = await london.post('salesContactSave', { id, first_name: 'Lena', last_name: 'London', phone: '07866 600001', consent: true });
  assert.equal(edit.status, 200, 'the office it was handed to still can');
});

/* ---- Helpers: phone numbers (#22) and month arithmetic (#77) --------------------------------------- */

test('the same UK number written in any common format normalises to one value', () => {
  const out = JSON.parse(php(`echo json_encode(array_map('crm_norm_phone', ['07712 345678', '+44 (0)7712 345678', '0044 7712 345678', '+44 7712 345678', '0044 (0) 7712 345678', '0191 123 4567', '+44 (0)191 123 4567', '+33 6 12 34 56 78', '0033 6 12 34 56 78']));`));
  assert.deepEqual(out.slice(0, 5), Array(5).fill('07712345678'));
  assert.deepEqual(out.slice(5, 7), ['01911234567', '01911234567']);
  assert.equal(out[7], out[8], 'other international numbers match too');
});

test('adding months stays in the target month (offer expiry, fixed-rate end)', () => {
  const out = JSON.parse(php(`echo json_encode([crm_add_months('2026-08-31', 6), crm_add_months('2026-12-31', 6), crm_add_months('2024-02-29', 60),
    crm_add_months('2026-01-31', 1), crm_add_months('2024-01-31', 1), crm_add_months('2026-06-15', 24), crm_add_months('2026-11-30', 3), crm_add_months('nope', 6)]);`));
  assert.deepEqual(out, ['2027-02-28', '2027-06-30', '2029-02-28', '2026-02-28', '2024-02-29', '2028-06-15', '2027-02-28', null]);
});

/* ---- Upgrading a version 1 database (#23, #24, #78) ------------------------------------------------ */

test('upgrading a version 1 database: parallel first requests, new recovery code, no system admins left', async () => {
  const dataDir = tempDir();
  execFileSync('php', [join(ROOT, 'api.php'), 'cron'], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir } });
  const db = join(dataDir, readdirSync(dataDir).find((f) => /^crm-[a-f0-9]{32}\.sqlite$/.test(f)));
  const script = join(dataDir, 'make-v1.php');
  writeFileSync(script, `<?php
$db = new PDO('sqlite:' . $argv[1], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec("UPDATE settings SET value = '1' WHERE key = 'schema_version'");
$db->exec("DELETE FROM settings WHERE key = 'recovery_pending'");
$db->prepare("UPDATE settings SET value = ? WHERE key = 'recovery_hash'")->execute([password_hash('MAP-OLDC-ODE2-OLDC-ODE3', PASSWORD_DEFAULT)]);
$db->exec("UPDATE users SET role = 'admin' WHERE username = 'newcastle'");
$db->prepare("INSERT INTO users (username, email, full_name, password_hash, role, office_id, status, is_office_account, created_at, updated_at)
  VALUES ('sam.boss', 'sam.boss@themaap.co.uk', 'Sam Boss', ?, 'admin', 2, 'active', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')")
  ->execute([password_hash('Welcome123', PASSWORD_DEFAULT)]);
try { $db->exec('ALTER TABLE users DROP COLUMN advice_type'); } catch (Exception $e) { /* SQLite before 3.35: keep the column */ }
`);
  execFileSync('php', [script, db]);
  const S = await startServer({ dataDir, workers: 8 });
  const first = await Promise.all(Array.from({ length: 12 }, () => new Client(S.base).get('status')));
  assert.deepEqual(first.map((r) => r.status), Array(12).fill(200), 'no request fails while another upgrades the database');
  const anon = new Client(S.base);
  assert.equal((await anon.post('recover', { username: 'admin', code: 'MAP-OLDC-ODE2-OLDC-ODE3', new_password: 'Changed123' })).status, 401, 'the version 1 code no longer works');
  const admin = new Client(S.base);
  await admin.login('admin');
  const code = (await admin.get('status')).json.recovery_code;
  assert.match(code, /^MAP-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/, 'the admin login is shown a new code');
  const sam = new Client(S.base);
  const u = await sam.login('sam.boss', 'Welcome123');
  assert.equal(u.role, 'manager', 'system admins become office managers');
  assert.equal(u.advice_type, 'mortgage_protection');
  assert.equal((await sam.post('switchOffice', { office_id: 1 })).status, 403, 'and cannot open other offices');
  assert.equal((await new Client(S.base).login('newcastle')).role, 'manager');
  assert.equal((await new Client(S.base).post('recover', { username: 'admin', code, new_password: 'Changed123' })).status, 200);
});

/* ---- website-admin.php start-up errors (#111) -------------------------------------------------------- */

test('the admin panel explains a start-up problem in words, not an error code', async () => {
  const d = tempDir();
  writeFileSync(join(d, 'blocker'), '');
  const S = await startServer({ dataDir: join(d, 'blocker', 'data') });
  const r = await fetch(`${S.base}/website-admin.php`);
  assert.equal(r.status, 503);
  const html = await r.text();
  assert.match(html, /could not create its &quot;data&quot; folder/);
  assert.doesNotMatch(html, /<p class="sub mt">storage<\/p>/);
});

/* ---- Per-connection limit can't be raced (#21) ------------------------------------------------------ */

test('wrong logins sent in parallel stop at the per-connection limit', async () => {
  const S = await startServer({ workers: 16 });
  await new Client(S.base).get('status');
  const rs = await Promise.all(Array.from({ length: 80 }, (_, i) => new Client(S.base).post('login', { username: `ghost${i}`, password: 'Wrong123' })));
  const t = tally(rs);
  assert.ok((t['401:bad_login'] || 0) <= 30, `no more than 30 failures from one connection: ${JSON.stringify(t)}`);
  assert.equal((t['401:bad_login'] || 0) + (t['429:rate_limited'] || 0), 80, JSON.stringify(t));
  assert.equal((await new Client(S.base).post('login', { username: 'london', password: PW })).status, 429);
});
