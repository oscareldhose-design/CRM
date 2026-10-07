// Regression tests for the website admin panel's "CRM logins" fixes. Run with: node --test tests/fix-admin-panel.test.mjs
// Starts PHP's built-in server on a throwaway database, like tests/api.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 19000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}/api.php`;
const PW = 'Map@2025#';
let server, dataDir;

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
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString('utf8');
    let json = null;
    try { json = JSON.parse(text); } catch { /* download */ }
    return { status: res.status, json, text, buf, headers: res.headers };
  }
  get(action, params) { return this.call(action, { params }); }
  post(action, body) { return this.call(action, { body: body || {} }); }
  async login(username, password = PW) {
    const r = await this.post('login', { username, password });
    assert.equal(r.status, 200, `login ${username}: ${r.text}`);
    return r.json.user;
  }
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fix-admin-'));
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir, MAP_CRM_MAIL_FILE: join(dataDir, 'mail.jsonl') }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}?action=status`); if (r.ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('PHP server did not start');
});
after(() => { server.kill(); rmSync(dataDir, { recursive: true, force: true }); });

const admin = new Client();
const office = {};
const users = async () => (await admin.get('adminUsers')).json.rows;
const byName = async (username) => (await users()).find((u) => u.username === username);
const staff = (over = {}) => ({ id: 0, full_name: 'Test Person', email: '', username: '', role: 'adviser', office_id: office.Newcastle, advice_type: 'mortgage_protection', status: 'active', ...over });
const request = (name, username) => new Client().post('register', { full_name: name, email: `${username}@themaap.co.uk`, username, password: 'Secret123', advice_type: 'mortgage_protection' });

test('setup: the admin signs in and sees the offices', async () => {
  await admin.login('admin');
  for (const o of (await admin.get('adminOffices')).json.rows) office[o.name] = o.id;
  assert.ok(office.Newcastle && office.London);
  const r = await admin.get('adminUsers');
  assert.equal(r.json.me, (await byName('admin')).id, 'the panel is told which login is signed in');
});

test('the admin cannot reset their own password (it would sign them out before they saw it); others still can', async () => {
  const me = await byName('admin');
  const self = await admin.post('adminUserReset', { id: me.id });
  assert.equal(self.status, 409);
  assert.equal(self.json.code, 'self');
  assert.match(self.json.message, /Password/);
  assert.equal((await admin.get('adminUsers')).status, 200, 'still signed in');
  await new Client().login('admin'); // the password still works
  const other = await admin.post('adminUserReset', { id: (await byName('nottingham')).id });
  assert.equal(other.status, 200);
  assert.ok(other.json.temp_password);
  await new Client().login('nottingham', other.json.temp_password);
});

test('a login created as switched off is saved switched off', async () => {
  const r = await admin.post('adminUserSave', staff({ full_name: 'Off Person', email: 'off.person@themaap.co.uk', username: 'off.person', status: 'disabled' }));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.user.status, 'disabled');
  const login = await new Client().post('login', { username: 'off.person', password: r.json.temp_password });
  assert.equal(login.json.code, 'disabled');
  const on = await admin.post('adminUserSave', staff({ id: r.json.user.id, full_name: 'Off Person', email: 'off.person@themaap.co.uk', username: 'off.person', status: 'active' }));
  assert.equal(on.json.user.status, 'active');
  await new Client().login('off.person', r.json.temp_password);
});

test('a rejected request does not block giving that person a login, and cannot be switched on directly', async () => {
  assert.equal((await request('Ellie Brooks', 'ellie.brooks')).status, 200);
  const ellie = await byName('ellie.brooks');
  assert.equal((await admin.post('adminUserReject', { id: ellie.id })).status, 200);
  const edit = await admin.post('adminUserSave', staff({ id: ellie.id, full_name: 'Ellie Brooks', email: 'ellie.brooks@themaap.co.uk', username: 'ellie.brooks' }));
  assert.equal(edit.status, 404, 'a rejected request is not a login that can be edited to active');
  const add = await admin.post('adminUserSave', staff({ full_name: 'Ellie Brooks', email: 'ellie.brooks@themaap.co.uk', username: 'ellie.brooks' }));
  assert.equal(add.status, 200, add.text);
  assert.equal(add.json.user.status, 'active');
  const rows = (await users()).filter((u) => u.username === 'ellie.brooks' || u.email === 'ellie.brooks@themaap.co.uk');
  assert.equal(rows.length, 1, 'the rejected row is gone');
  // Same for a different username with the rejected email, and for an edit that takes a rejected username.
  assert.equal((await request('Ben Ford', 'ben.ford')).status, 200);
  await admin.post('adminUserReject', { id: (await byName('ben.ford')).id });
  const ben = await admin.post('adminUserSave', staff({ full_name: 'Ben Ford', email: 'ben.ford@themaap.co.uk', username: 'bford' }));
  assert.equal(ben.status, 200, ben.text);
  assert.equal((await request('Cal Day', 'cal.day')).status, 200);
  await admin.post('adminUserReject', { id: (await byName('cal.day')).id });
  const rename = await admin.post('adminUserSave', staff({ id: ben.json.user.id, full_name: 'Ben Ford', email: 'ben.ford@themaap.co.uk', username: 'cal.day' }));
  assert.equal(rename.status, 200, rename.text);
  // A username that a real login has is still refused.
  const taken = await admin.post('adminUserSave', staff({ full_name: 'Copy Cat', email: 'copy.cat@themaap.co.uk', username: 'ellie.brooks' }));
  assert.equal(taken.status, 409);
});

test('logins of a closed office can still be switched off and edited without moving them', async () => {
  const leeds = (await admin.post('adminOfficeSave', { name: 'Leeds', address: '', phone: '', active: true })).json.id;
  const add = await admin.post('adminUserSave', staff({ full_name: 'Lee Ward', email: 'lee.ward@themaap.co.uk', username: 'lee.ward', office_id: leeds }));
  assert.equal(add.status, 200, add.text);
  assert.equal((await admin.post('adminOfficeSave', { id: leeds, name: 'Leeds', address: '', phone: '', active: false })).status, 200);
  const lee = add.json.user;
  const off = await admin.post('adminUserSave', staff({ id: lee.id, full_name: 'Lee Ward', email: 'lee.ward@themaap.co.uk', username: 'lee.ward', office_id: leeds, status: 'disabled' }));
  assert.equal(off.status, 200, off.text);
  assert.equal(off.json.user.status, 'disabled');
  assert.equal(off.json.user.office_id, leeds, 'still in its own office');
  const advice = await admin.post('adminUserSave', staff({ id: lee.id, full_name: 'Lee Ward', email: 'lee.ward@themaap.co.uk', username: 'lee.ward', office_id: leeds, status: 'disabled', advice_type: 'protection' }));
  assert.equal(advice.status, 200, advice.text);
  // The office login of a closed office too.
  const londonLogin = await byName('london');
  assert.equal((await admin.post('adminOfficeSave', { id: office.London, name: 'London', address: '', phone: '', active: false })).status, 200);
  const lon = await admin.post('adminUserSave', { id: londonLogin.id, full_name: londonLogin.full_name, email: '', username: 'london', role: 'manager', office_id: office.London, advice_type: 'mortgage_protection', status: 'disabled' });
  assert.equal(lon.status, 200, lon.text);
  assert.equal((await new Client().post('login', { username: 'london', password: PW })).json.code, 'disabled');
  // Nobody can be moved into, added to or approved into a closed office.
  const move = await admin.post('adminUserSave', staff({ id: (await byName('ellie.brooks')).id, full_name: 'Ellie Brooks', email: 'ellie.brooks@themaap.co.uk', username: 'ellie.brooks', office_id: leeds }));
  assert.equal(move.status, 400);
  assert.equal(move.json.field, 'office_id');
  const create = await admin.post('adminUserSave', staff({ full_name: 'New Leeds', email: 'new.leeds@themaap.co.uk', username: 'new.leeds', office_id: leeds }));
  assert.equal(create.status, 400);
  assert.equal((await request('Dee Moss', 'dee.moss')).status, 200);
  const approve = await admin.post('adminUserApprove', { id: (await byName('dee.moss')).id, role: 'adviser', office_id: leeds });
  assert.equal(approve.status, 400);
  // Reopen London and switch its login back on for the tests below.
  await admin.post('adminOfficeSave', { id: office.London, name: 'London', address: '', phone: '', active: true });
  await admin.post('adminUserSave', { id: londonLogin.id, full_name: londonLogin.full_name, email: '', username: 'london', role: 'manager', office_id: office.London, advice_type: 'mortgage_protection', status: 'active' });
  await new Client().login('london');
});

test('an admin cannot change their own role; a demoted built-in admin becomes ordinary staff, not an office login', async () => {
  const me = await byName('admin');
  const self = await admin.post('adminUserSave', { id: me.id, full_name: me.full_name, email: '', username: 'admin', role: 'adviser', office_id: office.Newcastle, advice_type: 'mortgage_protection', status: 'active' });
  assert.equal(self.status, 409);
  assert.equal(self.json.code, 'self');
  assert.equal((await admin.get('adminUsers')).status, 200, 'still the admin');
  const rename = await admin.post('adminUserSave', { id: me.id, full_name: 'Website admin', email: '', username: 'admin', role: 'webadmin', office_id: 0, advice_type: 'mortgage_protection', status: 'active' });
  assert.equal(rename.status, 200, 'editing your own login without changing its role still works');
  assert.equal(rename.json.user.is_office_account, true);
  // A second admin demotes the built-in admin login.
  const add = await admin.post('adminUserSave', { id: 0, full_name: 'Second Admin', email: 'second.admin@themaap.co.uk', username: 'admin2', role: 'webadmin', office_id: 0, advice_type: 'mortgage_protection', status: 'active' });
  assert.equal(add.status, 200, add.text);
  const admin2 = new Client();
  await admin2.login('admin2', add.json.temp_password);
  await admin2.post('changePassword', { current_password: add.json.temp_password, new_password: 'Second123' });
  const noEmail = await admin2.post('adminUserSave', { id: me.id, full_name: 'Website admin', email: '', username: 'admin', role: 'adviser', office_id: office.Newcastle, advice_type: 'mortgage_protection', status: 'active' });
  assert.equal(noEmail.status, 400, 'staff logins need a MAP email');
  assert.equal(noEmail.json.field, 'email');
  const demote = await admin2.post('adminUserSave', { id: me.id, full_name: 'Website admin', email: 'web.admin@themaap.co.uk', username: 'admin', role: 'adviser', office_id: office.Newcastle, advice_type: 'mortgage_protection', status: 'active' });
  assert.equal(demote.status, 200, demote.text);
  assert.equal(demote.json.user.role, 'adviser');
  assert.equal(demote.json.user.is_office_account, false, 'not listed as an office login');
  const promote = await admin2.post('adminUserSave', { id: me.id, full_name: 'Website admin', email: 'web.admin@themaap.co.uk', username: 'admin', role: 'webadmin', office_id: 0, advice_type: 'mortgage_protection', status: 'active' });
  assert.equal(promote.status, 200, promote.text);
  assert.equal(promote.json.user.role, 'webadmin');
  await admin.login('admin');
  assert.equal((await admin.get('adminUsers')).status, 200);
});

test('backups download as files; the database copy has no sessions or pending recovery code', async () => {
  const all = await admin.get('adminBackupAll');
  assert.equal(all.status, 200);
  assert.match(all.headers.get('content-disposition') || '', /attachment; filename="map-crm-backup-all-offices-/);
  assert.ok(JSON.parse(all.text).users.length > 0);
  const db = await admin.get('adminDatabase');
  assert.equal(db.status, 200);
  assert.equal(db.buf.subarray(0, 15).toString('latin1'), 'SQLite format 3');
  const file = join(dataDir, 'download-check.sqlite');
  writeFileSync(file, db.buf);
  const count = (sql) => execFileSync('php', ['-r', `$p = new PDO('sqlite:' . $argv[1]); echo $p->query($argv[2])->fetchColumn();`, file, sql]).toString();
  assert.equal(count('SELECT COUNT(*) FROM sessions'), '0');
  assert.equal(count("SELECT COUNT(*) FROM settings WHERE key = 'recovery_pending'"), '0');
  assert.ok(+count('SELECT COUNT(*) FROM users') > 5);
  assert.equal(count('PRAGMA journal_mode'), 'delete', 'one self-contained file');
  const anon = await new Client().get('adminDatabase');
  assert.equal(anon.status, 401);
});

test('older SQLite (no VACUUM INTO): the database file copy is complete and consistent', () => {
  // Calls the fallback directly; the PHP here always has VACUUM INTO.
  const php = `define('MAP_CRM', 1);
    require $argv[1] . '/config.php'; require $argv[1] . '/lib/core.php'; require $argv[1] . '/lib/auth.php'; require $argv[1] . '/lib/admin.php';
    crm_db()->exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('fallback_check', 'latest')");
    $tmp = CRM_DATA_DIR . '/fallback-check.sqlite';
    $ok = crm_admin_copy_database_file($tmp);
    $c = new PDO('sqlite:' . $tmp);
    echo json_encode(['ok' => $ok, 'integrity' => $c->query('PRAGMA integrity_check')->fetchColumn(),
      'users' => (int) $c->query('SELECT COUNT(*) FROM users')->fetchColumn(), 'live_users' => (int) crm_val('SELECT COUNT(*) FROM users'),
      'latest' => $c->query("SELECT value FROM settings WHERE key = 'fallback_check'")->fetchColumn()]);`;
  const out = JSON.parse(execFileSync('php', ['-r', php, ROOT], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir } }).toString());
  assert.equal(out.ok, true);
  assert.equal(out.integrity, 'ok');
  assert.equal(out.users, out.live_users);
  assert.equal(out.latest, 'latest', 'changes still in the WAL are included');
});

test('admin panel page: the phone menu sits above its overlay, the empty tab count hides, backups download in the page', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/website-admin.php`, { headers: { Cookie: admin.cookie }, redirect: 'manual' });
  assert.equal(res.status, 200);
  const html = await res.text();
  const wrap = html.indexOf('<div class="admin-wrap">'), overlay = html.indexOf('id="sidebarOverlay"'), sidebar = html.indexOf('id="adminSidebar"');
  assert.ok(wrap > 0 && wrap < overlay && overlay < sidebar, 'the overlay is inside .admin-wrap, before the sidebar');
  assert.match(html, /\.tab-count\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(html, /action=adminBackupAll" data-download/);
  assert.match(html, /action=adminDatabase" data-download/);
  assert.match(html, /id="crmBackupStatus"/);
  const js = readFileSync(join(ROOT, 'js', 'website-logins.js'), 'utf8');
  assert.match(js, /u\.id === state\.me \? ''/, 'no Reset password button on your own login');
});
