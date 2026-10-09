// Regression tests for the records API (crm/lib/entities.php). Run with: node --test tests/fix-entities.test.mjs
// Starts PHP's built-in server on a throwaway database, like tests/api.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 20000 + Math.floor(Math.random() * 5000);
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
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fix-entities-'));
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
const newcastle = new Client(), nottingham = new Client(), admin = new Client(), hannah = new Client();
const staff = {};

/** Requests a login and has the admin approve it; returns the user's row. */
async function makeUser(username, advice, office, role = 'adviser') {
  const reg = await new Client().post('register', { full_name: username.replace('.', ' '), email: `${username}@themaap.co.uk`, username, password: 'Secret123', advice_type: advice });
  assert.equal(reg.status, 200, reg.text);
  const row = (await admin.get('adminUsers')).json.rows.find((u) => u.username === username);
  const ok = await admin.post('adminUserApprove', { id: row.id, role, office_id: officeId[office], advice_type: advice });
  assert.equal(ok.status, 200, ok.text);
  return (await admin.get('adminUsers')).json.rows.find((u) => u.username === username);
}

test('setup: offices, office logins, a mortgage adviser and a protection-only adviser in Newcastle', async () => {
  (await new Client().get('status')).json.offices.forEach((o) => { officeId[o.name] = o.id; });
  await newcastle.login('newcastle');
  await nottingham.login('nottingham');
  await admin.login('admin');
  staff.sarah = await makeUser('sarah.ahmed', 'mortgage_protection', 'Newcastle');
  staff.mark = await makeUser('mark.lewis', 'mortgage_protection', 'Newcastle');
  staff.hannah = await makeUser('hannah.reid', 'protection', 'Newcastle');
  staff.nott = await makeUser('nina.nott', 'mortgage_protection', 'Nottingham');
  await hannah.login('hannah.reid', 'Secret123');
  const users = (await admin.get('adminUsers')).json.rows;
  staff.nottOffice = users.find((u) => u.username === 'nottingham');
  staff.webadmin = users.find((u) => u.username === 'admin');
});

test('a converted lead can still be edited, and a blank status, stage or priority keeps the current value', async () => {
  const lead = await newcastle.save('leads', { first_name: 'Olive', last_name: 'Edit', phone: '07700 910001', enquiry_type: 'ftb', adviser_id: staff.sarah.id });
  const conv = await newcastle.post('convertLead', { id: lead.id, create_case: true });
  assert.equal(conv.status, 200, conv.text);
  let l = (await newcastle.get('get', { entity: 'leads', id: lead.id })).json.record;
  // The lead form has no "Converted" option, so it sends a blank status.
  const edit = await newcastle.post('save', { entity: 'leads', id: lead.id, version: l.version, data: { status: '', notes: 'Fixed a typo' } });
  assert.equal(edit.status, 200, edit.text);
  assert.equal(edit.json.record.status, 'converted');
  assert.equal(edit.json.record.notes, 'Fixed a typo');
  // Every list that must hold a value keeps it when a blank comes in.
  const cl = await newcastle.save('clients', { first_name: 'Blank', last_name: 'Choices' });
  const k = await newcastle.save('cases', { client_id: cl.id, case_type: 'ftb', stage: 'application' });
  const p = await newcastle.save('policies', { client_id: cl.id, policy_type: 'life', status: 'on_risk' });
  const t = await newcastle.save('tasks', { title: 'Blank test', priority: 'high', client_id: cl.id });
  const d = await newcastle.save('documents', { client_id: cl.id, name: 'Photo ID', status: 'received' });
  for (const [entity, rec, data, keep] of [
    ['cases', k, { stage: '', status: '' }, { stage: 'application', status: 'active' }],
    ['policies', p, { status: '' }, { status: 'on_risk' }],
    ['tasks', t, { priority: '', status: null }, { priority: 'high', status: 'open' }],
    ['documents', d, { status: '' }, { status: 'received' }],
  ]) {
    const r = await newcastle.post('save', { entity, id: rec.id, version: rec.version, data });
    assert.equal(r.status, 200, `${entity}: ${r.text}`);
    for (const [f, v] of Object.entries(keep)) assert.equal(r.json.record[f], v, `${entity}.${f} kept`);
    assert.equal(r.json.record.version, rec.version, `${entity}: nothing changed, so no new version`);
  }
  // New records still get their defaults from a blank.
  const fresh = await newcastle.save('tasks', { title: 'Defaults', priority: '', status: '' });
  assert.equal(fresh.priority, 'normal');
  assert.equal(fresh.status, 'open');
  // Only "Convert to client" can make a lead converted.
  const other = await newcastle.save('leads', { first_name: 'Not', last_name: 'Converted', phone: '07700 910002' });
  const bad = await newcastle.post('save', { entity: 'leads', id: other.id, data: { status: 'converted' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.field, 'status');
});

test('a lead stays editable after its client is permanently deleted', async () => {
  const lead = await newcastle.save('leads', { first_name: 'Stuck', last_name: 'Lead', phone: '07700 910003', enquiry_type: 'protection' });
  const conv = (await newcastle.post('convertLead', { id: lead.id, create_case: false })).json;
  await newcastle.post('delete', { entity: 'clients', id: conv.client_id });
  assert.equal((await newcastle.post('purge', { entity: 'clients', id: conv.client_id })).status, 200);
  const l = (await newcastle.get('get', { entity: 'leads', id: lead.id })).json.record;
  assert.equal(l.client_id, null);
  const r = await newcastle.post('save', { entity: 'leads', id: lead.id, data: { notes: 'trying to edit' } });
  assert.equal(r.status, 200, r.text);
});

test('protection-only advisers never get mortgage details or mortgage templates through email templates', async () => {
  // A client added directly (no lead) with a mortgage case, and one converted from a mortgage lead.
  const direct = await newcastle.save('clients', { first_name: 'Dee', last_name: 'Rect', email: 'dee@example.com' });
  await newcastle.save('cases', { client_id: direct.id, case_type: 'remortgage', lender: 'Nationwide', loan_amount: 310000, property_address: '1 Secret St' });
  // Mortgage users get the case details for a client added directly (not only for clients converted from a lead).
  const offer = (await newcastle.get('list', { entity: 'templates' })).json.rows.find((t) => t.name === 'Offer issued');
  const r = await newcastle.post('renderTemplate', { template_id: offer.id, client_id: direct.id });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.body, /Nationwide has issued your mortgage offer for £310,000/);
  // Hannah's own template with mortgage placeholders, rendered for that client, shows nothing from the case.
  const mine = await hannah.save('templates', { name: 'Probe', category: 'Protection', subject: 'Hi {{first_name}}', body: '{{lender}}|{{loan_amount}}|{{property_address}}|{{completion_date}}|{{fixed_rate_end_date}}' });
  const h = await hannah.post('renderTemplate', { template_id: mine.id, client_id: direct.id });
  assert.equal(h.status, 200, h.text);
  assert.equal(h.json.subject, 'Hi Dee');
  assert.ok(!/Nationwide|310|Secret/.test(h.json.body), h.json.body);
  // Mortgage templates are out of reach by id as well as in the list, whatever the category is called.
  const chaser = await newcastle.save('templates', { name: 'Offer chaser', category: 'Mortgage offers', subject: 's', body: 'b' });
  const caseDocs = await newcastle.save('templates', { name: 'Case docs', category: 'cases', subject: 's', body: 'b' });
  const list = (await hannah.get('list', { entity: 'templates' })).json.rows;
  assert.ok(list.some((t) => t.name === 'Protection review'), 'protection templates are listed');
  for (const id of [offer.id, chaser.id, caseDocs.id]) {
    assert.ok(!list.some((t) => t.id === id), `template ${id} is not listed`);
    assert.equal((await hannah.get('get', { entity: 'templates', id })).status, 404);
    assert.equal((await hannah.post('renderTemplate', { template_id: id, client_id: direct.id })).status, 404);
    assert.equal((await hannah.post('save', { entity: 'templates', id, data: { body: 'x' } })).status, 404);
  }
  assert.ok((await newcastle.get('list', { entity: 'templates' })).json.rows.some((t) => t.id === chaser.id), 'mortgage users still see them');
});

test('protection-only advisers see no case counts or mortgage lead on client screens', async () => {
  const lead = await newcastle.save('leads', { first_name: 'Mo', last_name: 'Lead', phone: '07700 910004', enquiry_type: 'ftb' });
  const conv = (await newcastle.post('convertLead', { id: lead.id, create_case: true })).json;
  assert.ok(conv.case_id);
  const rows = (await hannah.get('list', { entity: 'clients' })).json.rows;
  assert.ok(rows.length > 0 && rows.every((c) => !('active_cases' in c)), 'no active_cases for protection-only advisers');
  assert.equal((await newcastle.get('list', { entity: 'clients' })).json.rows.find((c) => c.id === conv.client_id).active_cases, 1);
  assert.equal((await hannah.get('get', { entity: 'clients', id: conv.client_id })).json.lead, null, 'the mortgage lead is not shown');
  assert.equal((await newcastle.get('get', { entity: 'clients', id: conv.client_id })).json.lead.id, lead.id);
  const pLead = await hannah.save('leads', { first_name: 'Pro', last_name: 'Lead', phone: '07700 910005', enquiry_type: 'protection' });
  const pConv = (await hannah.post('convertLead', { id: pLead.id, create_case: true })).json;
  assert.equal((await hannah.get('get', { entity: 'clients', id: pConv.client_id })).json.lead.id, pLead.id, 'a protection lead still is');
});

test('protection-only advisers cannot link tasks or policies to mortgage cases or leads', async () => {
  const cl = await newcastle.save('clients', { first_name: 'Link', last_name: 'Test' });
  const k = await newcastle.save('cases', { client_id: cl.id, case_type: 'ftb' });
  const mLead = await newcastle.save('leads', { first_name: 'Mort', last_name: 'Lead', phone: '07700 910006', enquiry_type: 'remortgage' });
  const pLead = await newcastle.save('leads', { first_name: 'Prot', last_name: 'Lead', phone: '07700 910007', enquiry_type: 'protection' });
  for (const [entity, data, field] of [
    ['tasks', { title: 'probe', case_id: k.id }, 'case_id'],
    ['tasks', { title: 'probe', lead_id: mLead.id }, 'lead_id'],
    ['policies', { client_id: cl.id, policy_type: 'life', case_id: k.id }, 'case_id'],
  ]) {
    const r = await hannah.post('save', { entity, id: 0, data });
    assert.equal(r.status, 400, `${entity} ${field}: ${r.text}`);
    assert.equal(r.json.field, field);
  }
  assert.equal((await hannah.post('save', { entity: 'tasks', id: 0, data: { title: 'ok', lead_id: pLead.id } })).status, 200);
  // A policy the office linked to a case can still be edited by her.
  const pol = await newcastle.save('policies', { client_id: cl.id, policy_type: 'life', case_id: k.id });
  const edit = await hannah.post('save', { entity: 'policies', id: pol.id, data: { premium: 25, case_id: k.id } });
  assert.equal(edit.status, 200, edit.text);
  assert.ok(!('case_id' in edit.json.record), 'she is not told which mortgage case it belongs to');
  assert.equal((await newcastle.get('get', { entity: 'policies', id: pol.id })).json.record.case_id, k.id, 'the link to the case is kept');
});

test('staff fields only take active staff of the same office, but an unchanged person is kept', async () => {
  for (const [who, id] of [['another office\'s adviser', staff.nott.id], ['another office\'s login', staff.nottOffice.id], ['the website admin', staff.webadmin.id]]) {
    const r = await newcastle.post('save', { entity: 'leads', id: 0, data: { first_name: 'X', last_name: 'Y', adviser_id: id } });
    assert.equal(r.status, 400, `${who}: ${r.text}`);
    assert.equal(r.json.field, 'adviser_id');
  }
  const lead = await newcastle.save('leads', { first_name: 'Kept', last_name: 'Adviser', phone: '07700 910008', adviser_id: staff.sarah.id });
  // Sarah moves to Nottingham: the Newcastle form still sends her as the adviser, and that is fine.
  const s = staff.sarah;
  const move = await admin.post('adminUserSave', { id: s.id, full_name: s.full_name, email: s.email, username: s.username, role: s.role, office_id: officeId.Nottingham, advice_type: s.advice_type, status: 'active' });
  assert.equal(move.status, 200, move.text);
  const r = await newcastle.post('save', { entity: 'leads', id: lead.id, data: { notes: 'still hers', adviser_id: s.id } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.record.adviser_id, s.id);
  assert.equal((await newcastle.post('save', { entity: 'leads', id: 0, data: { first_name: 'New', last_name: 'Lead', adviser_id: s.id } })).status, 400, 'but she cannot be given new Newcastle work');
});

test('convert to client works after the lead\'s adviser leaves or its introducer is deleted', async () => {
  const intro = await newcastle.save('introducers', { name: 'Temp Agent' });
  const l1 = await newcastle.save('leads', { first_name: 'Intro', last_name: 'Gone', phone: '07700 910009', enquiry_type: 'ftb', introducer_id: intro.id, adviser_id: staff.mark.id });
  await newcastle.post('delete', { entity: 'introducers', id: intro.id });
  const c1 = await newcastle.post('convertLead', { id: l1.id, create_case: true });
  assert.equal(c1.status, 200, c1.text);
  assert.equal((await newcastle.get('get', { entity: 'cases', id: c1.json.case_id })).json.record.introducer_id, null);
  const l2 = await newcastle.save('leads', { first_name: 'Adv', last_name: 'Gone', phone: '07700 910010', enquiry_type: 'protection', adviser_id: staff.mark.id });
  const m = staff.mark;
  assert.equal((await admin.post('adminUserSave', { id: m.id, full_name: m.full_name, email: m.email, username: m.username, role: m.role, office_id: officeId.Newcastle, advice_type: m.advice_type, status: 'disabled' })).status, 200);
  const c2 = await newcastle.post('convertLead', { id: l2.id, create_case: true });
  assert.equal(c2.status, 200, c2.text);
  assert.ok(c2.json.policy_id);
});

test('trashing or purging a converted lead keeps the client\'s timeline and tasks', async () => {
  const lead = await newcastle.save('leads', { first_name: 'Del', last_name: 'Converted', phone: '07700 910011', enquiry_type: 'protection' });
  await newcastle.post('addActivity', { lead_id: lead.id, type: 'call', summary: 'First call with lead', follow_up_date: daysFromNow(2), follow_up_title: 'Follow up Del' });
  const conv = (await newcastle.post('convertLead', { id: lead.id, create_case: false })).json;
  const file = async () => (await newcastle.get('get', { entity: 'clients', id: conv.client_id })).json;
  const before_ = await file();
  assert.ok(before_.tasks.some((t) => t.title === 'Follow up Del'));
  await newcastle.post('delete', { entity: 'leads', id: lead.id });
  assert.ok((await file()).tasks.some((t) => t.title === 'Follow up Del'), 'trashing the lead leaves the client\'s task');
  assert.equal((await newcastle.post('purge', { entity: 'leads', id: lead.id })).status, 200);
  const after_ = await file();
  assert.ok(after_.tasks.some((t) => t.title === 'Follow up Del'), 'purging the lead leaves the client\'s task');
  assert.ok(after_.activities.some((a) => a.summary === 'First call with lead'), 'and the call record');
  assert.ok(after_.activities.some((a) => /Converted from lead/.test(a.summary)), 'and the conversion entry');
  // A task that moved to the client can still go to the trash and come back after the lead is gone.
  const t = after_.tasks.find((x) => x.title === 'Follow up Del');
  await newcastle.post('delete', { entity: 'tasks', id: t.id });
  assert.equal((await newcastle.post('restore', { entity: 'tasks', id: t.id })).status, 200);
  // An unconverted lead's tasks still go to the trash with it and come back with it.
  const open = await newcastle.save('leads', { first_name: 'Open', last_name: 'Lead', phone: '07700 910012' });
  await newcastle.save('tasks', { title: 'Call Open Lead', lead_id: open.id });
  await newcastle.post('delete', { entity: 'leads', id: open.id });
  assert.ok(!(await newcastle.get('list', { entity: 'tasks', lead_id: open.id })).json.rows.some((x) => x.title === 'Call Open Lead'));
  await newcastle.post('restore', { entity: 'leads', id: open.id });
  assert.ok((await newcastle.get('list', { entity: 'tasks', lead_id: open.id })).json.rows.some((x) => x.title === 'Call Open Lead'));
});

test('possible duplicates match a phone number however it was written', async () => {
  await newcastle.save('clients', { first_name: 'Dup', last_name: 'Phone', phone: '07700 900777' });
  for (const phone of ['07700900777', '07700 900777', '+44 7700 900777', '(07700) 900-777']) {
    const lead = await newcastle.save('leads', { first_name: 'D', last_name: 'P', phone });
    const d = (await newcastle.get('get', { entity: 'leads', id: lead.id })).json.possible_duplicates;
    assert.equal(d.length, 1, phone);
    assert.equal(d[0].last_name, 'Phone');
  }
  const lead = await newcastle.save('leads', { first_name: 'D', last_name: 'P', phone: '07700 900778' });
  assert.equal((await newcastle.get('get', { entity: 'leads', id: lead.id })).json.possible_duplicates.length, 0, 'a different number is not a duplicate');
});

test('a change to a shared template shows in every office\'s audit log', async () => {
  const shared = (await nottingham.get('list', { entity: 'templates' })).json.rows.find((t) => t.name === 'Insurance renewal');
  await newcastle.save('templates', { body: 'Newcastle changed this' }, shared.id);
  const log = (await nottingham.get('audit', { q: '' })).json.rows;
  assert.ok(log.some((r) => r.entity === 'templates' && r.entity_id === shared.id && r.user_name === 'Newcastle Office' && /shared with every office/.test(r.summary)));
});
