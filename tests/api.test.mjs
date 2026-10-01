// MAP CRM API tests. Run with: node --test tests/
// Starts PHP's built-in server on a throwaway database and exercises the main flows end to end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 18000 + Math.floor(Math.random() * 1000);
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
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* download */ }
    return { status: res.status, json, text, headers: res.headers };
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
const cron = () => execFileSync('php', [join(ROOT, 'api.php'), 'cron'], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir } });
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-test-'));
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}?action=status`); if (r.ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('PHP server did not start');
});
after(() => { server.kill(); rmSync(dataDir, { recursive: true, force: true }); });

const officeId = {};
const newcastle = new Client(), nottingham = new Client(), london = new Client();

test('first run creates the three offices and their logins with Map@2025#', async () => {
  const s = await new Client().get('status');
  assert.equal(s.status, 200);
  assert.deepEqual(s.json.offices.map((o) => o.name).sort(), ['London', 'Newcastle', 'Nottingham']);
  s.json.offices.forEach((o) => { officeId[o.name] = o.id; });
  const bad = await new Client().post('login', { username: 'newcastle', password: 'Map@2025' });
  assert.equal(bad.status, 401);
  const nc = await newcastle.login('newcastle');
  assert.equal(nc.role, 'admin');
  assert.equal((await nottingham.login('nottingham')).role, 'manager');
  assert.equal((await london.login('LONDON')).role, 'manager', 'usernames are not case sensitive');
});

test('the admin login opens only the website admin panel', async () => {
  const web = new Client();
  const u = await web.login('admin');
  assert.equal(u.role, 'webadmin');
  assert.equal((await web.get('list', { entity: 'clients' })).status, 403);
  assert.equal((await web.get('salesEvents')).status, 403);
  const gate = await fetch(`http://127.0.0.1:${PORT}/website-admin.php`, { headers: { Cookie: web.cookie }, redirect: 'manual' });
  assert.equal(gate.status, 200);
  assert.match(await gate.text(), /MAP Control Room|Website admin/);
  const anon = await fetch(`http://127.0.0.1:${PORT}/website-admin.php`, { redirect: 'manual' });
  assert.equal(anon.status, 302, 'signed-out visitors are sent to the sign-in page');
  const office = await fetch(`http://127.0.0.1:${PORT}/website-admin.php`, { headers: { Cookie: london.cookie }, redirect: 'manual' });
  assert.equal(office.status, 403, 'office logins cannot open the website admin panel');
});

test('POSTs without the CRM header are refused (CSRF)', async () => {
  const r = await newcastle.call('logout', { body: {}, csrf: false });
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'csrf');
});

test('only @themaap.co.uk emails can request an account, and Newcastle approves it', async () => {
  const anon = new Client();
  const gmail = await anon.post('register', { full_name: 'Sam Lee', email: 'sam@gmail.com', username: 'sam', password: 'Secret123', office_id: officeId.Nottingham, role: 'adviser' });
  assert.equal(gmail.status, 400);
  assert.equal(gmail.json.field, 'email');
  const lookalike = await anon.post('register', { full_name: 'Sam Lee', email: 'sam@themaap.co.uk.evil.com', username: 'sam', password: 'Secret123', office_id: officeId.Nottingham, role: 'adviser' });
  assert.equal(lookalike.status, 400);
  const weak = await anon.post('register', { full_name: 'Sam Lee', email: 'sam@themaap.co.uk', username: 'sam', password: 'password', office_id: officeId.Nottingham, role: 'adviser' });
  assert.equal(weak.json.field, 'password');
  const ok = await anon.post('register', { full_name: 'Sam Lee', email: 'Sam.Lee@TheMAAP.co.uk', username: 'sam.lee', password: 'Secret123', office_id: officeId.Nottingham, role: 'adviser' });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.status, 'pending');
  const early = await new Client().post('login', { username: 'sam.lee', password: 'Secret123' });
  assert.equal(early.json.code, 'pending');
  const dup = await anon.post('register', { full_name: 'Sam Lee', email: 'sam.lee@themaap.co.uk', username: 'sam2', password: 'Secret123', office_id: officeId.Nottingham, role: 'adviser' });
  assert.equal(dup.status, 409);
  assert.equal((await nottingham.get('adminUsers')).status, 403, 'only Newcastle manages logins');
  const users = (await newcastle.get('adminUsers')).json.rows;
  const sam = users.find((u) => u.username === 'sam.lee');
  assert.equal((await newcastle.post('adminUserApprove', { id: sam.id, role: 'adviser', office_id: officeId.Nottingham })).status, 200);
  const samC = new Client();
  assert.equal((await samC.login('sam.lee@themaap.co.uk', 'Secret123')).role, 'adviser');
});

test('five wrong passwords lock a login; Newcastle can unlock it', async () => {
  const c = new Client();
  let last;
  for (let i = 0; i < 5; i++) last = await c.post('login', { username: 'london', password: 'nope' });
  assert.equal(last.status, 423);
  assert.equal((await c.post('login', { username: 'london', password: PW })).status, 423, 'even the right password is refused while locked');
  const id = (await newcastle.get('adminUsers')).json.rows.find((u) => u.username === 'london').id;
  await newcastle.post('adminUserUnlock', { id });
  await new Client().login('london');
});

let samId, nottAdminId, leadId, clientId, caseId;
test('offices only see their own clients', async () => {
  const meta = (await nottingham.get('meta')).json;
  samId = meta.users.find((u) => u.full_name === 'Sam Lee').id;
  const reg = await new Client().post('register', { full_name: 'Ana Admin', email: 'ana@themaap.co.uk', username: 'ana', password: 'Secret123', office_id: officeId.Nottingham, role: 'administrator' });
  assert.equal(reg.status, 200);
  const ana = (await newcastle.get('adminUsers')).json.rows.find((u) => u.username === 'ana');
  await newcastle.post('adminUserApprove', { id: ana.id, role: 'administrator', office_id: officeId.Nottingham });
  nottAdminId = ana.id;
  const lead = await nottingham.save('leads', { first_name: 'Priya', last_name: 'Shah', phone: '07700 900111', email: 'priya@example.com', enquiry_type: 'ftb', source: 'introducer', timescale: 'asap', loan_amount: 260000, property_value: 300000, adviser_id: samId, administrator_id: nottAdminId });
  leadId = lead.id;
  assert.equal(lead.rating, 'HOT');
  assert.equal((await london.get('get', { entity: 'leads', id: leadId })).status, 404, 'London cannot open a Nottingham lead');
  assert.equal((await newcastle.get('get', { entity: 'leads', id: leadId })).status, 404, 'Newcastle sees its own office unless it switches');
  await newcastle.post('switchOffice', { office_id: officeId.Nottingham });
  assert.equal((await newcastle.get('get', { entity: 'leads', id: leadId })).status, 200);
  await newcastle.post('switchOffice', { office_id: officeId.Newcastle });
  const tasks = (await nottingham.get('list', { entity: 'tasks', lead_id: leadId })).json.rows;
  assert.ok(tasks.some((t) => t.auto_key === `leadcontact:${leadId}` && t.assigned_to === samId), 'a new lead creates a contact task for its adviser');
});

test('Quick Case Lookup finds a case in any office by surname, without contact details', async () => {
  const r = await london.get('lookup', { surname: 'sha' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.results, [], 'leads are not cases');
});

test('convert lead → client + case; offer and completion create tasks and the fixed-rate end date', async () => {
  const conv = await nottingham.post('convertLead', { id: leadId, create_case: true });
  assert.equal(conv.status, 200, conv.text);
  clientId = conv.json.client_id; caseId = conv.json.case_id;
  assert.ok(clientId && caseId);
  const lead = (await nottingham.get('get', { entity: 'leads', id: leadId })).json.record;
  assert.equal(lead.status, 'converted');
  let c = (await nottingham.get('get', { entity: 'cases', id: caseId })).json.record;
  assert.equal(c.stage, 'fact_find');
  c = await nottingham.save('cases', { stage: 'offer', lender: 'Nationwide', fixed_term_years: 2, rate_type: 'fixed', proc_fee: 450 }, caseId, c.version);
  assert.ok(c.offer_expiry_date, 'offer expiry worked out');
  let tasks = (await nottingham.get('list', { entity: 'tasks', case_id: caseId })).json.rows;
  const prep = tasks.find((t) => t.auto_key === `offer:${caseId}`);
  assert.ok(prep, 'completion-prep task created');
  assert.equal(prep.assigned_to, nottAdminId, 'for the administrator');
  c = await nottingham.save('cases', { stage: 'completed', completion_date: '2026-06-15' }, caseId, c.version);
  assert.equal(c.status, 'completed');
  assert.equal(c.fixed_rate_end_date, '2028-06-15');
  tasks = (await nottingham.get('list', { entity: 'tasks', case_id: caseId, status: 'all' })).json.rows;
  assert.ok(tasks.some((t) => t.auto_key === `postcompletion:${caseId}`), 'post-completion call booked');
  const look = await london.get('lookup', { surname: 'shah' });
  assert.equal(look.json.results.length, 1);
  assert.equal(look.json.results[0].office, 'Nottingham');
  assert.equal(look.json.results[0].client_id, null, 'other offices get no link into the file');
  assert.ok(!('phone' in look.json.results[0]) && !('email' in look.json.results[0]));
});

test('two people editing the same record: the second save is refused, not overwritten', async () => {
  const c = (await nottingham.get('get', { entity: 'clients', id: clientId })).json.record;
  const a = await nottingham.post('save', { entity: 'clients', id: clientId, version: c.version, data: { postcode: 'NG7 1AA' } });
  assert.equal(a.status, 200);
  const b = await nottingham.post('save', { entity: 'clients', id: clientId, version: c.version, data: { postcode: 'NG1 1ZZ' } });
  assert.equal(b.status, 409);
  assert.equal(b.json.code, 'conflict');
  assert.equal((await nottingham.get('get', { entity: 'clients', id: clientId })).json.record.postcode, 'NG7 1AA');
});

test('automations: remortgage at 6 months, renewals, protection gaps, nothing scheduled', async () => {
  const cl = await nottingham.save('clients', { first_name: 'Tom', last_name: 'Reid', adviser_id: samId, is_landlord: 1 });
  const k = await nottingham.save('cases', { client_id: cl.id, case_type: 'remortgage', stage: 'completed', completion_date: '2021-11-01', fixed_rate_end_date: daysFromNow(120), loan_amount: 180000, adviser_id: samId });
  await nottingham.save('policies', { client_id: cl.id, policy_type: 'home', status: 'on_risk', renewal_date: daysFromNow(20), premium: 30 });
  await nottingham.save('cases', { client_id: cl.id, case_type: 'btl', stage: 'application', adviser_id: samId });
  cron();
  const opps = (await nottingham.get('opportunities', { status: 'open' })).json.rows;
  assert.ok(opps.some((o) => o.type === 'remortgage' && o.case_id === k.id), 'remortgage opportunity');
  assert.ok(opps.some((o) => o.type === 'protection_gap' && o.client_id === cl.id), 'no protection');
  assert.ok(opps.some((o) => o.type === 'landlord_cover' && o.client_id === cl.id), 'landlord without cover');
  const tasks = (await nottingham.get('list', { entity: 'tasks' })).json.rows;
  assert.ok(tasks.some((t) => t.auto_key && t.auto_key.startsWith(`remortgage:${k.id}:`)), 'remortgage review task');
  assert.ok(tasks.some((t) => t.auto_key && t.auto_key.startsWith('renewal:')), 'renewal follow-up task');
  cron();
  const again = (await nottingham.get('list', { entity: 'tasks' })).json.rows.filter((t) => t.auto_key && t.auto_key.startsWith(`remortgage:${k.id}:`));
  assert.equal(again.length, 1, 'rules never create duplicates');
  await nottingham.save('policies', { client_id: cl.id, policy_type: 'life', status: 'on_risk', premium: 25 });
  cron();
  const after_ = (await nottingham.get('opportunities', { status: 'open' })).json.rows;
  assert.ok(!after_.some((o) => o.type === 'protection_gap' && o.client_id === cl.id), 'gap closes itself once protection is in place');
  const radar = (await nottingham.get('radar')).json;
  assert.equal(radar.buckets.m6.length, 1);
  const dash = (await nottingham.get('dashboard')).json;
  assert.equal(dash.kpis.remortgage_6m, 1);
});

test('compliance checklist: ticking items and auto-ticks from received documents', async () => {
  const cl = await nottingham.save('clients', { first_name: 'Lia', last_name: 'Ng', adviser_id: samId });
  const k = await nottingham.save('cases', { client_id: cl.id, case_type: 'ftb', stage: 'application', adviser_id: samId });
  let ev = (await nottingham.get('get', { entity: 'cases', id: k.id })).json.record.compliance_eval;
  assert.equal(ev.rating, 'red', 'items from earlier stages are overdue');
  const pack = await nottingham.post('documentPack', { case_id: k.id });
  assert.ok(pack.json.added >= 5);
  const docs = (await nottingham.get('list', { entity: 'documents', case_id: k.id })).json.rows;
  const id = docs.find((x) => x.name === 'Photo ID');
  await nottingham.save('documents', { status: 'received' }, id.id, id.version);
  ev = (await nottingham.get('get', { entity: 'cases', id: k.id })).json.record.compliance_eval;
  assert.ok(ev.items.find((i) => i.key === 'id_verified').auto, 'Photo ID received ticks the AML item');
  const r = await nottingham.post('complianceSet', { case_id: k.id, key: 'fact_find', done: true });
  assert.equal(r.status, 200);
  assert.ok(r.json.record.compliance_eval.items.find((i) => i.key === 'fact_find').done);
});

test('trash: deleting a client takes its cases along, and restore brings them back', async () => {
  const cl = await nottingham.save('clients', { first_name: 'Del', last_name: 'Me' });
  const k = await nottingham.save('cases', { client_id: cl.id, case_type: 'remortgage' });
  await nottingham.post('delete', { entity: 'clients', id: cl.id });
  assert.equal((await nottingham.get('get', { entity: 'cases', id: k.id })).status, 404);
  const trash = (await nottingham.get('trash')).json.rows;
  assert.ok(trash.some((t) => t.entity === 'clients' && t.id === cl.id));
  assert.ok(!trash.some((t) => t.entity === 'cases' && t.id === k.id), 'children are restored with their parent');
  await nottingham.post('restore', { entity: 'clients', id: cl.id });
  assert.equal((await nottingham.get('get', { entity: 'cases', id: k.id })).status, 200);
});

test('General Sales: import with duplicates and no-consent, call queue, hand-over with call history', async () => {
  const reg = await new Client().post('register', { full_name: 'Gus Sales', email: 'gus@themaap.co.uk', username: 'gus', password: 'Secret123', role: 'sales' });
  assert.equal(reg.status, 200, reg.text);
  const gusRow = (await newcastle.get('adminUsers')).json.rows.find((u) => u.username === 'gus');
  await newcastle.post('adminUserApprove', { id: gusRow.id, role: 'sales', office_id: 0 });
  const gus = new Client();
  await gus.login('gus', 'Secret123');
  assert.equal((await gus.get('list', { entity: 'clients' })).status, 403, 'General Sales cannot see client files');
  assert.equal((await gus.get('lookup', { surname: 'shah' })).status, 403);
  const ev = await gus.post('salesEventSave', { name: 'Home Show', event_date: '2026-09-20', sponsorship_cost: 1500 });
  const evId = ev.json.id;
  const imp = await gus.post('salesImport', { event_id: evId, assume_consent: false, rows: [
    { name: 'Kim Wells', phone: '07700 900201', email: 'kim@example.com', consent: 'Yes' },
    { name: 'Kim Wells again', phone: '+44 7700 900201', consent: 'yes' },
    { first_name: 'No', last_name: 'Consent', phone: '07700 900202', consent: 'No' },
    { first_name: 'Blank', last_name: 'Consent', phone: '07700 900203' },
    { first_name: 'Raj', last_name: 'Patel', phone: '07700 900204', consent: 'Y', interest: 'First home' },
  ] });
  assert.equal(imp.status, 200, imp.text);
  assert.equal(imp.json.added, 2);
  assert.equal(imp.json.duplicates, 1);
  assert.equal(imp.json.no_consent, 2);
  const q1 = (await gus.get('salesQueue', { event_id: evId })).json;
  assert.ok(q1.contact);
  const other = new Client();
  await other.login('newcastle');
  const q2 = (await other.get('salesQueue', { event_id: evId })).json;
  assert.notEqual(q2.contact && q2.contact.id, q1.contact.id, 'two agents are never given the same person');
  const raj = q1.contact.last_name === 'Patel' ? q1.contact : q2.contact;
  const caller = q1.contact.last_name === 'Patel' ? gus : other;
  assert.equal((await caller.post('salesCall', { contact_id: raj.id, outcome: 'interested', notes: 'Wants to buy in spring' })).status, 200);
  const staff = (await gus.get('salesStaff', { office_id: officeId.Nottingham })).json.rows;
  assert.ok(staff.some((s) => s.id === samId));
  const ho = await gus.post('salesHandover', { contact_id: raj.id, office_id: officeId.Nottingham, adviser_id: samId, administrator_id: nottAdminId, enquiry_type: 'ftb' });
  assert.equal(ho.status, 200, ho.text);
  const lead = (await nottingham.get('get', { entity: 'leads', id: ho.json.lead_id })).json;
  assert.equal(lead.record.source, 'event');
  assert.equal(lead.record.adviser_id, samId);
  assert.ok(lead.activities.some((a) => /Wants to buy in spring/.test(a.summary)), 'call history travels with the lead');
  assert.ok(lead.tasks.some((t) => t.assigned_to === samId), 'adviser gets a contact task');
  const res = (await gus.get('salesResults')).json;
  const row = res.events.find((e) => e.id === evId);
  assert.equal(row.stats.handed_over, 1);
  assert.equal(row.stats.cost_per_handover, 1500);
});

test('GDPR erasure removes personal details but keeps the case figures', async () => {
  const cl = await nottingham.save('clients', { first_name: 'Erin', last_name: 'Gone', email: 'erin@example.com', phone: '07700 900999' });
  await nottingham.save('cases', { client_id: cl.id, case_type: 'ftb', loan_amount: 150000 });
  assert.equal((await nottingham.post('eraseClient', { id: cl.id, confirm: 'nope' })).status, 400);
  assert.equal((await nottingham.post('eraseClient', { id: cl.id, confirm: 'ERASE' })).status, 200);
  const d = (await nottingham.get('get', { entity: 'clients', id: cl.id })).json;
  assert.equal(d.record.email, null);
  assert.equal(d.record.first_name, 'Erased');
  assert.equal(d.cases[0].loan_amount, 150000);
});

test('audit log records who did what; backups download as JSON', async () => {
  const a = (await nottingham.get('audit')).json.rows;
  assert.ok(a.some((r) => r.action === 'convert' && r.user_name === 'Nottingham Office'));
  const b = await nottingham.get('backup');
  assert.equal(b.status, 200);
  assert.match(b.headers.get('content-disposition'), /attachment/);
  const data = JSON.parse(b.text);
  assert.ok(data.clients.length > 0);
  assert.ok(data.users.every((u) => !('password_hash' in u)), 'backups never include password hashes');
  assert.ok(data.clients.every((c) => c.office_id === officeId.Nottingham));
});

test('temporary passwords must be changed before anything else', async () => {
  const id = (await newcastle.get('adminUsers')).json.rows.find((u) => u.username === 'ana').id;
  const r = await newcastle.post('adminUserReset', { id });
  const temp = r.json.temp_password;
  const ana = new Client();
  const u = await ana.login('ana', temp);
  assert.equal(u.must_change_password, true);
  assert.equal((await ana.get('dashboard')).json.code, 'must_change_password');
  assert.equal((await ana.post('changePassword', { current_password: temp, new_password: 'NewSecret9' })).status, 200);
  assert.equal((await ana.get('dashboard')).status, 200);
});

test('the recovery code resets the Newcastle password once', async () => {
  // Read the first-run code the way Newcastle sees it at first sign-in.
  const code = (await newcastle.get('status')).json.recovery_code;
  assert.match(code, /^MAP-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const anon = new Client();
  assert.equal((await anon.post('recover', { username: 'nottingham', code, new_password: 'Changed123' })).status, 401, 'only resets a system admin login');
  assert.equal((await anon.post('recover', { username: 'newcastle', code, new_password: 'Changed123' })).status, 200);
  assert.equal((await anon.post('recover', { username: 'newcastle', code, new_password: 'Changed456' })).status, 401, 'a code works once');
  await new Client().login('newcastle', 'Changed123');
});
