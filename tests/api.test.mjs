// MAP CRM API tests. Run with: node --test tests/api.test.mjs
// Starts PHP's built-in server on a throwaway database and exercises the main flows end to end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 18000 + Math.floor(Math.random() * 1000);
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
const newcastle = new Client(), nottingham = new Client(), london = new Client(), admin = new Client();
const mails = () => (existsSync(mailFile) ? readFileSync(mailFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

test('first run creates the three offices, one login for each whole office, and the admin login', async () => {
  const s = await new Client().get('status');
  assert.equal(s.status, 200);
  assert.deepEqual(s.json.offices.map((o) => o.name).sort(), ['London', 'Newcastle', 'Nottingham']);
  s.json.offices.forEach((o) => { officeId[o.name] = o.id; });
  const bad = await new Client().post('login', { username: 'newcastle', password: 'Map@2025' });
  assert.equal(bad.status, 401);
  for (const [c, name] of [[newcastle, 'newcastle'], [nottingham, 'nottingham'], [london, 'LONDON']]) {
    const u = await c.login(name);
    assert.equal(u.role, 'manager', `${name} is an office login like the others`);
    assert.equal(u.is_office_account, true);
    assert.equal(u.advice_type, 'mortgage_protection');
  }
  assert.equal((await admin.login('admin')).role, 'webadmin');
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

test('only @themaap.co.uk emails can request an account; info@ is emailed and the admin approves it', async () => {
  const anon = new Client();
  const base = { full_name: 'Sam Lee', password: 'Secret123', advice_type: 'mortgage_protection' };
  const gmail = await anon.post('register', { ...base, email: 'sam@gmail.com', username: 'sam' });
  assert.equal(gmail.status, 400);
  assert.equal(gmail.json.field, 'email');
  const lookalike = await anon.post('register', { ...base, email: 'sam@themaap.co.uk.evil.com', username: 'sam' });
  assert.equal(lookalike.status, 400);
  const weak = await anon.post('register', { ...base, email: 'sam@themaap.co.uk', username: 'sam', password: 'password' });
  assert.equal(weak.json.field, 'password');
  const noAdvice = await anon.post('register', { ...base, email: 'sam@themaap.co.uk', username: 'sam', advice_type: '' });
  assert.equal(noAdvice.status, 400);
  assert.equal(noAdvice.json.field, 'advice_type', 'they must say mortgage & protection or protection only');
  assert.equal(mails().length, 0, 'refused requests send no email');
  const ok = await anon.post('register', { ...base, email: 'Sam.Lee@TheMAAP.co.uk', username: 'sam.lee', office_id: officeId.London, role: 'manager' });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.status, 'pending');
  const sent = mails();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'info@themaap.co.uk');
  assert.match(sent[0].subject, /Sam Lee/);
  assert.match(sent[0].body, /sam\.lee@themaap\.co\.uk/);
  assert.match(sent[0].body, /Mortgage & protection/);
  assert.match(sent[0].body, /website-admin\.php/);
  assert.ok(sent[0].headers.includes('Reply-To: sam.lee@themaap.co.uk'));
  const early = await new Client().post('login', { username: 'sam.lee', password: 'Secret123' });
  assert.equal(early.json.code, 'pending');
  const dup = await anon.post('register', { ...base, email: 'sam.lee@themaap.co.uk', username: 'sam2' });
  assert.equal(dup.status, 409);
  assert.equal((await nottingham.get('adminUsers')).status, 403, 'office logins do not manage logins');
  assert.equal((await newcastle.get('adminUsers')).status, 403, 'not even Newcastle');
  const users = (await admin.get('adminUsers')).json.rows;
  const sam = users.find((u) => u.username === 'sam.lee');
  assert.equal(sam.role, 'adviser', 'people cannot pick their own role');
  assert.equal(sam.office_id, null, 'or their own office');
  assert.equal((await admin.post('adminUserApprove', { id: sam.id, role: 'adviser', office_id: 0 })).status, 400, 'an adviser needs an office');
  assert.equal((await admin.post('adminUserApprove', { id: sam.id, role: 'adviser', office_id: officeId.Nottingham })).status, 200);
  const samC = new Client();
  assert.equal((await samC.login('sam.lee@themaap.co.uk', 'Secret123')).role, 'adviser');
});

test('five wrong passwords lock a login; the admin can unlock it', async () => {
  const c = new Client();
  let last;
  for (let i = 0; i < 5; i++) last = await c.post('login', { username: 'london', password: 'nope' });
  assert.equal(last.status, 423);
  assert.equal((await c.post('login', { username: 'london', password: PW })).status, 423, 'even the right password is refused while locked');
  const id = (await admin.get('adminUsers')).json.rows.find((u) => u.username === 'london').id;
  await admin.post('adminUserUnlock', { id });
  await new Client().login('london');
});

let samId, nottAdminId, leadId, clientId, caseId;
test('offices only see their own clients', async () => {
  const meta = (await nottingham.get('meta')).json;
  samId = meta.users.find((u) => u.full_name === 'Sam Lee').id;
  const reg = await new Client().post('register', { full_name: 'Ana Admin', email: 'ana@themaap.co.uk', username: 'ana', password: 'Secret123', advice_type: 'mortgage_protection' });
  assert.equal(reg.status, 200);
  const ana = (await admin.get('adminUsers')).json.rows.find((u) => u.username === 'ana');
  await admin.post('adminUserApprove', { id: ana.id, role: 'administrator', office_id: officeId.Nottingham });
  nottAdminId = ana.id;
  const lead = await nottingham.save('leads', { first_name: 'Priya', last_name: 'Shah', phone: '07700 900111', email: 'priya@example.com', enquiry_type: 'ftb', source: 'introducer', timescale: 'asap', loan_amount: 260000, property_value: 300000, adviser_id: samId, administrator_id: nottAdminId });
  leadId = lead.id;
  assert.equal(lead.rating, 'HOT');
  assert.equal((await london.get('get', { entity: 'leads', id: leadId })).status, 404, 'London cannot open a Nottingham lead');
  assert.equal((await newcastle.get('get', { entity: 'leads', id: leadId })).status, 404, 'Newcastle is an office like the others');
  assert.equal((await newcastle.post('switchOffice', { office_id: officeId.Nottingham })).status, 403, 'and cannot switch into another office');
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
  const completed = daysFromNow(-10);
  c = await nottingham.save('cases', { stage: 'completed', completion_date: completed }, caseId, c.version);
  assert.equal(c.status, 'completed');
  assert.equal(c.fixed_rate_end_date, `${+completed.slice(0, 4) + 2}${completed.slice(4)}`, 'a 2-year fix ends 2 years after completion');
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
  const reg = await new Client().post('register', { full_name: 'Gus Sales', email: 'gus@themaap.co.uk', username: 'gus', password: 'Secret123', advice_type: 'mortgage_protection' });
  assert.equal(reg.status, 200, reg.text);
  const gusRow = (await admin.get('adminUsers')).json.rows.find((u) => u.username === 'gus');
  assert.equal((await admin.post('adminUserApprove', { id: gusRow.id, role: 'sales', office_id: 0 })).status, 200);
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
  const id = (await admin.get('adminUsers')).json.rows.find((u) => u.username === 'ana').id;
  const r = await admin.post('adminUserReset', { id });
  const temp = r.json.temp_password;
  const ana = new Client();
  const u = await ana.login('ana', temp);
  assert.equal(u.must_change_password, true);
  assert.equal((await ana.get('dashboard')).json.code, 'must_change_password');
  assert.equal((await ana.post('changePassword', { current_password: temp, new_password: 'NewSecret9' })).status, 200);
  assert.equal((await ana.get('dashboard')).status, 200);
});

test('the recovery code resets the admin password once', async () => {
  // Read the first-run code the way the admin sees it at first sign-in (in the admin panel).
  assert.equal((await newcastle.get('status')).json.recovery_code, undefined, 'office logins never see it');
  const code = (await admin.get('status')).json.recovery_code;
  assert.match(code, /^MAP-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const anon = new Client();
  assert.equal((await anon.post('recover', { username: 'newcastle', code, new_password: 'Changed123' })).status, 401, 'only resets the admin login');
  assert.equal((await anon.post('recover', { username: 'admin', code, new_password: 'Changed123' })).status, 200);
  assert.equal((await anon.post('recover', { username: 'admin', code, new_password: 'Changed456' })).status, 401, 'a code works once');
  await new Client().login('admin', 'Changed123');
});

test('security: quoted or look-alike addresses cannot request an account', async () => {
  for (const email of ['"attacker@evil.com"@themaap.co.uk', 'x y@themaap.co.uk', 'x@sub.themaap.co.uk', 'x@themaap.co.uk.evil.com', 'x@themaap.co.ukx']) {
    const r = await new Client().post('register', { full_name: 'Eve Bad', email, username: 'eve' + Math.floor(Math.random() * 1e6), password: 'Secret123', advice_type: 'protection' });
    assert.equal(r.status, 400, `${email} should be refused`);
  }
});

test('security: staff of a closed office are not moved into another office', async () => {
  await admin.login('admin', 'Changed123'); // the recovery-code test above changed this password
  const office = (await admin.post('adminOfficeSave', { name: 'Leeds', address: '', phone: '', active: true })).json.id;
  await new Client().post('register', { full_name: 'Lee Ward', email: 'lee.ward@themaap.co.uk', username: 'lee.ward', password: 'Secret123', advice_type: 'mortgage_protection' });
  const lee = (await admin.get('adminUsers')).json.rows.find((u) => u.username === 'lee.ward');
  await admin.post('adminUserApprove', { id: lee.id, role: 'manager', office_id: office });
  const c = new Client();
  await c.login('lee.ward', 'Secret123');
  assert.equal((await c.get('list', { entity: 'clients' })).status, 200);
  await admin.post('adminOfficeSave', { id: office, name: 'Leeds', address: '', phone: '', active: false });
  assert.equal((await c.get('list', { entity: 'clients' })).status, 401, 'signed out when the office closes');
  await c.login('lee.ward', 'Secret123');
  const r = await c.get('list', { entity: 'clients' });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'no_office');
});

test('security: a case cannot be restored after its client is permanently deleted', async () => {
  const cl = await nottingham.save('clients', { first_name: 'Orphan', last_name: 'Test' });
  const k = await nottingham.save('cases', { client_id: cl.id, case_type: 'ftb' });
  await nottingham.post('delete', { entity: 'cases', id: k.id });
  await new Promise((r) => setTimeout(r, 1100));
  await nottingham.post('delete', { entity: 'clients', id: cl.id });
  assert.equal((await nottingham.post('purge', { entity: 'clients', id: cl.id })).status, 200);
  const r = await nottingham.post('restore', { entity: 'cases', id: k.id });
  assert.ok(r.status === 404 || r.json.code === 'parent_gone', `restore refused (${r.status} ${r.text})`);
  const fresh = await london.save('clients', { first_name: 'London', last_name: 'Person', email: 'london.person@example.com' });
  assert.notEqual(fresh.id, cl.id, 'record ids are never reused');
  assert.equal((await nottingham.get('get', { entity: 'cases', id: k.id })).status, 404);
});

test('security: GDPR erasure also scrubs policy, task and lookup history', async () => {
  const cl = await nottingham.save('clients', { first_name: 'Gdpr', last_name: 'Person' });
  const p = await nottingham.save('policies', { client_id: cl.id, policy_type: 'life', notes: 'Gdpr Person has a health condition' });
  await nottingham.save('policies', { notes: 'Gdpr Person: updated notes' }, p.id, p.version);
  await nottingham.save('tasks', { title: 'Call Gdpr Person about cover', client_id: cl.id });
  await london.get('lookup', { surname: 'Person' });
  assert.equal((await nottingham.post('eraseClient', { id: cl.id, confirm: 'ERASE' })).status, 200);
  const nott = JSON.stringify((await nottingham.get('audit', { q: '' })).json.rows);
  assert.ok(!/Gdpr Person/.test(nott), 'no audit line still names the person');
  const lon = JSON.stringify((await london.get('audit', { q: '' })).json.rows);
  assert.ok(!/surname "Person"/.test(lon), 'lookups for the surname are scrubbed');
});

test('protection-only advisers see nothing to do with mortgages', async () => {
  // London has a mortgage client with a case, set up by the office login.
  const cl = await london.save('clients', { first_name: 'Mo', last_name: 'Gage', adviser_id: null });
  const k = await london.save('cases', { client_id: cl.id, case_type: 'ftb', stage: 'application', loan_amount: 210000, lender: 'Halifax' });
  await london.save('policies', { client_id: cl.id, policy_type: 'life', status: 'on_risk', premium: 20, commission: 400, start_date: new Date().toISOString().slice(0, 10) });
  const reg = await new Client().post('register', { full_name: 'Pat Cover', email: 'pat.cover@themaap.co.uk', username: 'pat.cover', password: 'Secret123', advice_type: 'protection' });
  assert.equal(reg.status, 200, reg.text);
  assert.match(mails().at(-1).body, /Protection only/);
  const row = (await admin.get('adminUsers')).json.rows.find((u) => u.username === 'pat.cover');
  assert.equal(row.advice_type, 'protection');
  assert.equal((await admin.post('adminUserApprove', { id: row.id, role: 'adviser', office_id: officeId.London, advice_type: 'protection' })).status, 200);
  const pat = new Client();
  const me = await pat.login('pat.cover', 'Secret123');
  assert.equal(me.protection_only, true);
  for (const action of ['pipeline', 'radar', 'compliance', 'documents']) {
    const r = await pat.get(action);
    assert.equal(r.status, 403, `${action} is mortgage work`);
    assert.equal(r.json.code, 'protection_only');
  }
  assert.equal((await pat.get('lookup', { surname: 'gage' })).status, 403);
  assert.equal((await pat.get('list', { entity: 'cases' })).status, 403);
  assert.equal((await pat.get('get', { entity: 'cases', id: k.id })).status, 403);
  assert.equal((await pat.post('save', { entity: 'cases', id: 0, data: { client_id: cl.id, case_type: 'ftb' } })).status, 403);
  assert.equal((await pat.get('list', { entity: 'documents' })).status, 403);
  assert.equal((await pat.post('importRows', { entity: 'cases', rows: [] })).status, 403);
  const client = (await pat.get('get', { entity: 'clients', id: cl.id })).json;
  assert.deepEqual(client.cases, [], 'the client file shows no mortgage cases');
  assert.equal(client.policies.length, 1, 'but does show their cover');
  const dash = (await pat.get('dashboard')).json;
  assert.equal(dash.mode, 'protection');
  assert.ok(!('remortgage_6m' in dash.kpis) && !('active_cases' in dash.kpis));
  assert.ok('policies_in_force' in dash.kpis);
  const rep = (await pat.get('reports')).json;
  assert.deepEqual(rep.pipeline, []);
  assert.deepEqual(rep.months, []);
  assert.ok(rep.revenue.every((r) => r.completions === 0 && r.lent === 0 && r.proc_fees === 0 && r.total === r.commission));
  assert.ok(!(await pat.get('opportunities', { status: 'open' })).json.rows.some((o) => o.type === 'remortgage'));
  const mortgageLead = await pat.post('save', { entity: 'leads', id: 0, data: { first_name: 'Ray', last_name: 'Mort', phone: '07700 900321', enquiry_type: 'ftb' } });
  assert.equal(mortgageLead.status, 400, 'mortgage enquiries are not offered');
  const lead = await pat.save('leads', { first_name: 'Ray', last_name: 'Cover', phone: '07700 900322', enquiry_type: 'protection' });
  const conv = await pat.post('convertLead', { id: lead.id, create_case: true });
  assert.equal(conv.status, 200, conv.text);
  assert.ok(conv.json.client_id);
  assert.ok(!conv.json.case_id, 'converting a lead never opens a mortgage case');
  const search = (await pat.get('search', { q: 'Gage' })).json.results;
  assert.ok(search.some((r) => r.type === 'client'), 'search still finds the client');
  assert.ok(!(await pat.get('search', { q: 'Halifax' })).json.results.some((r) => r.type === 'case'), 'but no mortgage cases');
  assert.ok((await london.get('search', { q: 'Halifax' })).json.results.some((r) => r.type === 'case'));
  // Mortgage leads and anything linked to a case stay out of sight.
  const mLead = await london.save('leads', { first_name: 'Remy', last_name: 'Mover', phone: '07700 900323', enquiry_type: 'home_mover' });
  await london.save('tasks', { title: 'Chase the valuation for Mo Gage', case_id: k.id, client_id: cl.id, due_date: new Date().toISOString().slice(0, 10) });
  await london.post('addActivity', { client_id: cl.id, case_id: k.id, type: 'note', summary: 'Halifax offer issued' });
  assert.equal((await pat.get('get', { entity: 'leads', id: mLead.id })).status, 404);
  assert.ok(!(await pat.get('list', { entity: 'leads', status: 'all' })).json.rows.some((l) => l.id === mLead.id));
  assert.ok(!(await pat.get('list', { entity: 'tasks' })).json.rows.some((t) => t.case_id), 'no case tasks');
  assert.ok(!(await pat.get('list', { entity: 'tasks' })).json.rows.some((t) => t.lead_id === mLead.id), 'no tasks for mortgage leads');
  const file = (await pat.get('get', { entity: 'clients', id: cl.id })).json;
  assert.ok(!file.activities.some((a) => a.case_id) && !file.tasks.some((t) => t.case_id));
  assert.equal((await pat.post('addActivity', { client_id: cl.id, case_id: k.id, type: 'note', summary: 'x' })).status, 404);
  assert.ok((await london.get('list', { entity: 'tasks' })).json.rows.some((t) => t.case_id === k.id), 'the office login still has them');
  // A lead that isn't a mortgage enquiry can still carry figures: protection-only advisers never receive them.
  const other = await london.save('leads', { first_name: 'Ola', last_name: 'Figures', phone: '07700 900324', enquiry_type: 'other', loan_amount: 150000, property_value: 200000 });
  const seen = (await pat.get('list', { entity: 'leads', status: 'all' })).json.rows.find((l) => l.id === other.id);
  assert.ok(seen && !('loan_amount' in seen) && !('property_value' in seen), 'no mortgage figures in the lead list');
  const got = (await pat.get('get', { entity: 'leads', id: other.id })).json.record;
  assert.ok(!('loan_amount' in got) && !('deposit' in got), 'or on the lead');
  assert.equal((await london.get('get', { entity: 'leads', id: other.id })).json.record.loan_amount, 150000);
  // A client who also has a mortgage case can't be trashed from a protection-only login.
  const del = await pat.post('delete', { entity: 'clients', id: cl.id });
  assert.equal(del.status, 409);
  assert.equal(del.json.code, 'has_other_work');
  assert.equal((await london.get('get', { entity: 'cases', id: k.id })).status, 200, 'the case is untouched');
  // The London office login still sees everything.
  assert.equal((await london.get('get', { entity: 'cases', id: k.id })).status, 200);
  assert.equal((await london.get('dashboard')).json.mode, undefined);
});

test('the admin login manages logins: add, edit advice type, switch off', async () => {
  const add = await admin.post('adminUserSave', { full_name: 'Nia Brook', email: 'nia.brook@themaap.co.uk', username: 'nia.brook', role: 'adviser', office_id: officeId.Newcastle, advice_type: 'protection', status: 'active' });
  assert.equal(add.status, 200, add.text);
  assert.ok(add.json.temp_password);
  assert.equal(add.json.user.advice_type, 'protection');
  const bad = await admin.post('adminUserSave', { full_name: 'Nia Brook', email: 'nia@gmail.com', username: 'nia2', role: 'adviser', office_id: officeId.Newcastle, advice_type: 'protection' });
  assert.equal(bad.status, 400, 'only MAP emails');
  const id = add.json.user.id;
  const edit = await admin.post('adminUserSave', { id, full_name: 'Nia Brook', email: 'nia.brook@themaap.co.uk', username: 'nia.brook', role: 'adviser', office_id: officeId.Newcastle, advice_type: 'mortgage_protection', status: 'disabled' });
  assert.equal(edit.status, 200, edit.text);
  assert.equal(edit.json.user.advice_type, 'mortgage_protection');
  assert.equal((await new Client().post('login', { username: 'nia.brook', password: add.json.temp_password })).json.code, 'disabled');
  const adminRow = (await admin.get('adminUsers')).json.rows.find((u) => u.username === 'admin');
  const self = await admin.post('adminUserSave', { id: adminRow.id, full_name: adminRow.full_name, email: '', username: 'admin', role: 'webadmin', office_id: 0, advice_type: 'mortgage_protection', status: 'disabled' });
  assert.equal(self.status, 409, 'the admin cannot switch off their own login');
  const sentBefore = mails().length;
  const te = await admin.post('adminTestEmail', {});
  assert.equal(te.status, 200, te.text);
  assert.equal(mails().length, sentBefore + 1, 'a test email is sent');
  assert.equal(mails().at(-1).to, 'info@themaap.co.uk');
  assert.equal((await newcastle.post('adminTestEmail', {})).status, 403, 'only the admin login can send it');
  const settings = (await admin.get('adminSettings')).json;
  assert.ok(!('require_approval' in settings), 'every request needs approval: there is no switch to turn it off');
  const team = (await newcastle.get('team')).json;
  assert.ok(!JSON.stringify(team).includes('Newcastle Office'), 'office logins are not counted as team members');
});
