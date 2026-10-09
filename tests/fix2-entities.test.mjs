// Second-round regression tests for the records API (crm/lib/entities.php): protection-only advisers and mortgage work.
// Run with: node --test tests/fix2-entities.test.mjs. Starts PHP's built-in server on a throwaway database, like tests/api.test.mjs.
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
  async ok(action, params) {
    const r = await this.get(action, params);
    assert.equal(r.status, 200, `${action}: ${r.text}`);
    return r.json;
  }
}
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fix2-entities-'));
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
const newcastle = new Client(), admin = new Client(), hannah = new Client(), paula = new Client();
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
const saveRaw = (c, entity, data, id = 0) => c.post('save', { entity, id, data });

test('setup: Newcastle with a mortgage adviser, a protection-only adviser and a protection-only manager', async () => {
  (await new Client().get('status')).json.offices.forEach((o) => { officeId[o.name] = o.id; });
  await newcastle.login('newcastle');
  await admin.login('admin');
  staff.sarah = await makeUser('sarah.ahmed', 'mortgage_protection', 'Newcastle');
  staff.hannah = await makeUser('hannah.reid', 'protection', 'Newcastle');
  await hannah.login('hannah.reid', 'Secret123');
  const pm = await admin.post('adminUserSave', { full_name: 'Paula Prot', email: 'paula.prot@themaap.co.uk', username: 'paula.prot', role: 'manager', office_id: officeId.Newcastle, advice_type: 'protection', status: 'active' });
  assert.equal(pm.status, 200, pm.text);
  await paula.login('paula.prot', pm.json.temp_password);
  assert.equal((await paula.post('changePassword', { current_password: pm.json.temp_password, new_password: 'Secret12345!' })).status, 200);
});

test('mortgage leads, cases and case or mortgage-lead tasks cannot be given to a protection-only adviser', async () => {
  const h = staff.hannah.id;
  // Mortgage leads.
  for (const field of ['adviser_id', 'administrator_id']) {
    const r = await saveRaw(newcastle, 'leads', { first_name: 'Mason', last_name: 'Ford', phone: '07700 920001', enquiry_type: 'ftb', [field]: h });
    assert.equal(r.status, 400, r.text);
    assert.equal(r.json.field, field);
    assert.match(r.json.message, /protection advice only/);
  }
  // A protection lead is fine, but it can't then become a mortgage enquiry while she has it.
  const pLead = await newcastle.save('leads', { first_name: 'Ruby', last_name: 'Shaw', phone: '07700 920002', enquiry_type: 'protection', adviser_id: h });
  const turn = await saveRaw(newcastle, 'leads', { enquiry_type: 'remortgage' }, pLead.id);
  assert.equal(turn.status, 400, turn.text);
  assert.equal(turn.json.field, 'adviser_id');
  assert.equal((await newcastle.save('leads', { enquiry_type: 'remortgage', adviser_id: staff.sarah.id }, pLead.id)).adviser_id, staff.sarah.id);

  // Cases.
  const client = await newcastle.save('clients', { first_name: 'Grace', last_name: 'Allen', adviser_id: h, administrator_id: h });
  for (const field of ['adviser_id', 'administrator_id']) {
    const r = await saveRaw(newcastle, 'cases', { client_id: client.id, case_type: 'remortgage', stage: 'offer', [field]: h });
    assert.equal(r.status, 400, r.text);
    assert.equal(r.json.field, field);
  }
  // A case for her client doesn't pick her up from the client file.
  const kase = await newcastle.save('cases', { client_id: client.id, case_type: 'remortgage', stage: 'offer', lender: 'Skipton' });
  assert.notEqual(kase.adviser_id, h);
  assert.notEqual(kase.administrator_id, h);
  const bySarah = new Client();
  await bySarah.login('sarah.ahmed', 'Secret123');
  const k2 = await bySarah.save('cases', { client_id: client.id, case_type: 'ftb' });
  assert.equal(k2.adviser_id, staff.sarah.id, 'an adviser opening the case takes it');
  assert.equal(k2.administrator_id, null);
  const r1 = await saveRaw(newcastle, 'cases', { adviser_id: h }, kase.id);
  assert.equal(r1.status, 400, r1.text);

  // Tasks on a case or a mortgage lead.
  const mLead = await newcastle.save('leads', { first_name: 'Morty', last_name: 'Gage', phone: '07700 920003', enquiry_type: 'home_mover', adviser_id: staff.sarah.id });
  for (const link of [{ case_id: kase.id }, { lead_id: mLead.id }]) {
    const r = await saveRaw(newcastle, 'tasks', { title: 'Check Skipton offer conditions', assigned_to: h, ...link });
    assert.equal(r.status, 400, `${JSON.stringify(link)}: ${r.text}`);
    assert.equal(r.json.field, 'assigned_to');
  }
  // Her own kind of work still goes to her.
  const t = await newcastle.save('tasks', { title: 'Call Grace about life cover', assigned_to: h, client_id: client.id });
  await newcastle.save('tasks', { title: 'Call Ruby', assigned_to: h, lead_id: (await newcastle.save('leads', { first_name: 'Ivy', last_name: 'Cover', phone: '07700 920004', enquiry_type: 'insurance' })).id });
  // ...but a task of hers can't be moved onto a case.
  const move = await saveRaw(newcastle, 'tasks', { case_id: kase.id }, t.id);
  assert.equal(move.status, 400, move.text);
  // The assignments that were refused never reached her lists, and the office has none for her on mortgage work.
  const hers = (await newcastle.ok('list', { entity: 'tasks', assigned_to: h })).rows;
  assert.ok(!hers.some((x) => x.case_id || /Mason|Morty/.test(x.title)), JSON.stringify(hers.map((x) => x.title)));
});

test('work already with someone who later becomes protection only still saves; converting their mortgage lead opens an unassigned case', async () => {
  const lee = await makeUser('lee.legacy', 'mortgage_protection', 'Newcastle');
  const client = await newcastle.save('clients', { first_name: 'Leg', last_name: 'Acy' });
  const kase = await newcastle.save('cases', { client_id: client.id, case_type: 'ftb', adviser_id: lee.id });
  const task = await newcastle.save('tasks', { title: 'Chase valuation', case_id: kase.id, assigned_to: lee.id });
  const lead = await newcastle.save('leads', { first_name: 'Old', last_name: 'Lead', phone: '07700 920010', enquiry_type: 'ftb', adviser_id: lee.id });
  const up = await admin.post('adminUserSave', { id: lee.id, full_name: lee.full_name, email: lee.email, username: lee.username, role: 'adviser', office_id: officeId.Newcastle, advice_type: 'protection', status: 'active' });
  assert.equal(up.status, 200, up.text);
  // Unrelated edits and quick ticks still work.
  assert.equal((await newcastle.save('cases', { notes: 'Valuation booked' }, kase.id)).adviser_id, lee.id);
  assert.equal((await newcastle.post('taskDone', { id: task.id, done: true })).status, 200);
  assert.equal((await newcastle.save('leads', { notes: 'Called back' }, lead.id)).adviser_id, lee.id);
  const conv = await newcastle.post('convertLead', { id: lead.id, create_case: true });
  assert.equal(conv.status, 200, conv.text);
  const k = (await newcastle.ok('get', { entity: 'cases', id: conv.json.case_id })).record;
  assert.equal(k.adviser_id, null, 'the new case does not go to a protection-only adviser');
});

test('a protection-only login cannot remove (or find out about) case timeline entries', async () => {
  const client = await newcastle.save('clients', { first_name: 'Emma', last_name: 'Thompson' });
  const kase = await newcastle.save('cases', { client_id: client.id, case_type: 'ftb', lender: 'Halifax' });
  await newcastle.post('addActivity', { case_id: kase.id, type: 'note', summary: 'Talked through the Halifax application' });
  const caseAct = (await newcastle.ok('get', { entity: 'cases', id: kase.id })).activities.find((a) => /Halifax application/.test(a.summary));
  assert.ok(caseAct);
  for (const who of [paula, hannah]) {
    const r = await who.post('deleteActivity', { id: caseAct.id });
    assert.equal(r.status, 404, r.text);
    assert.equal(r.json.code, 'not_found');
  }
  assert.ok((await newcastle.ok('get', { entity: 'cases', id: kase.id })).activities.some((a) => a.id === caseAct.id), 'the entry is still there');
  // Their own client notes can still be removed; a mortgage login can still remove case entries.
  const own = await hannah.post('addActivity', { client_id: client.id, type: 'note', summary: 'Life cover chat' });
  assert.equal((await hannah.post('deleteActivity', { id: own.json.id })).status, 200);
  assert.equal((await newcastle.post('deleteActivity', { id: caseAct.id })).status, 200);
});

test('a protection-only adviser can restore a policy whose mortgage case is also in the trash', async () => {
  const client = await newcastle.save('clients', { first_name: 'Polly', last_name: 'Cover' });
  const kase = await newcastle.save('cases', { client_id: client.id, case_type: 'ftb' });
  const pol = await newcastle.save('policies', { client_id: client.id, case_id: kase.id, policy_type: 'mortgage_protection', provider: 'Aviva' });
  const pol2 = await newcastle.save('policies', { client_id: client.id, case_id: kase.id, policy_type: 'life', provider: 'LV=' });
  await newcastle.post('delete', { entity: 'policies', id: pol.id });
  await newcastle.post('delete', { entity: 'policies', id: pol2.id });
  await newcastle.post('delete', { entity: 'cases', id: kase.id });
  const r = await hannah.post('restore', { entity: 'policies', id: pol.id });
  assert.equal(r.status, 200, r.text);
  assert.ok(!/case/i.test(r.text));
  assert.equal((await newcastle.ok('get', { entity: 'policies', id: pol.id })).record.deleted_at, null);
  // A mortgage login is still asked to restore the case first.
  assert.equal((await newcastle.post('restore', { entity: 'policies', id: pol2.id })).json.code, 'parent_deleted');
});

test('purging a converted mortgage lead keeps its history with the client but out of protection-only sight', async () => {
  // Converted with a case.
  const lead = await newcastle.save('leads', { first_name: 'Noah', last_name: 'Clarke', phone: '07700 920020', enquiry_type: 'remortgage', source: 'existing_client' });
  await newcastle.post('addActivity', { lead_id: lead.id, type: 'call', summary: 'Noah wants to remortgage away from Halifax, owes 180k' });
  const conv = (await newcastle.post('convertLead', { id: lead.id, create_case: true })).json;
  assert.ok(conv.case_id);
  // Converted without a case; the client's case is opened later.
  const lead2 = await newcastle.save('leads', { first_name: 'Nora', last_name: 'Late', phone: '07700 920021', enquiry_type: 'ftb' });
  await newcastle.post('addActivity', { lead_id: lead2.id, type: 'call', summary: 'Nora has a 10% deposit saved' });
  const conv2 = (await newcastle.post('convertLead', { id: lead2.id, create_case: false })).json;
  const later = await newcastle.save('cases', { client_id: conv2.client_id, case_type: 'ftb' });
  // A protection lead's history stays plain client history.
  const lead3 = await newcastle.save('leads', { first_name: 'Pia', last_name: 'Prot', phone: '07700 920022', enquiry_type: 'protection' });
  await newcastle.post('addActivity', { lead_id: lead3.id, type: 'call', summary: 'Pia wants life cover' });
  const conv3 = (await newcastle.post('convertLead', { id: lead3.id, create_case: false })).json;

  for (const c of [conv, conv2]) {
    assert.equal((await hannah.ok('get', { entity: 'clients', id: c.client_id })).activities.length, 0, 'hidden before the purge');
  }
  for (const l of [lead, lead2, lead3]) {
    assert.equal((await newcastle.post('delete', { entity: 'leads', id: l.id })).status, 200);
    assert.equal((await newcastle.post('purge', { entity: 'leads', id: l.id })).status, 200);
  }
  for (const [c, caseId, text] of [[conv, conv.case_id, /owes 180k/], [conv2, later.id, /10% deposit/]]) {
    const theirs = await hannah.ok('get', { entity: 'clients', id: c.client_id });
    assert.deepEqual(theirs.activities, [], JSON.stringify(theirs.activities.map((a) => a.summary)));
    assert.ok(!theirs.tasks.some((t) => /Contact new lead/.test(t.title)), JSON.stringify(theirs.tasks.map((t) => t.title)));
    const office = await newcastle.ok('get', { entity: 'clients', id: c.client_id });
    assert.ok(office.activities.some((a) => text.test(a.summary)), 'the office still has the call');
    assert.ok(office.activities.some((a) => /Converted from lead/.test(a.summary)), 'and the conversion entry');
    assert.ok((await newcastle.ok('get', { entity: 'cases', id: caseId })).activities.some((a) => text.test(a.summary)), 'now on the case timeline');
  }
  const pia = await hannah.ok('get', { entity: 'clients', id: conv3.client_id });
  assert.ok(pia.activities.some((a) => a.summary === 'Pia wants life cover'), 'protection lead history is still shown');
});

test('an email sent from a client\'s page with a mortgage template goes on their case, out of protection-only sight', async () => {
  const client = await newcastle.save('clients', { first_name: 'Gwen', last_name: 'Offer', email: 'gwen@example.com' });
  const kase = await newcastle.save('cases', { client_id: client.id, case_type: 'ftb', lender: 'Skipton', loan_amount: 200000 });
  const tpl = (await newcastle.ok('list', { entity: 'templates' })).rows;
  const offer = tpl.find((t) => t.name === 'Offer issued');
  const first = tpl.find((t) => t.name === 'First contact');
  const r = await newcastle.post('renderTemplate', { template_id: offer.id, client_id: client.id });
  assert.equal(r.status, 200, r.text);
  // The screen sends the subject (and may send the template).
  assert.equal((await newcastle.post('logEmail', { client_id: client.id, subject: r.json.subject })).status, 200);
  assert.equal((await newcastle.post('logEmail', { client_id: client.id, template_id: offer.id, subject: 'Edited subject line' })).status, 200);
  // A mortgage template with the case's details in its subject.
  const own = await newcastle.save('templates', { name: 'Lender update', category: 'Updates', subject: 'News from {{ lender }} about your application', body: 'Hi {{first_name}}' });
  const r2 = (await newcastle.post('renderTemplate', { template_id: own.id, client_id: client.id })).json;
  assert.equal(r2.subject, 'News from Skipton about your application');
  assert.equal((await newcastle.post('logEmail', { client_id: client.id, subject: r2.subject })).status, 200);
  // A general template stays on the client.
  const r3 = (await newcastle.post('renderTemplate', { template_id: first.id, client_id: client.id })).json;
  assert.equal((await newcastle.post('logEmail', { client_id: client.id, subject: r3.subject })).status, 200);

  const acts = (await newcastle.ok('get', { entity: 'clients', id: client.id })).activities;
  for (const s of [r.json.subject, 'Edited subject line', r2.subject]) {
    const a = acts.find((x) => x.summary === `Email sent: ${s}`);
    assert.ok(a, s);
    assert.equal(a.case_id, kase.id, `${s} is on the case`);
  }
  assert.equal(acts.find((x) => x.summary === `Email sent: ${r3.subject}`).case_id, null);
  const theirs = (await hannah.ok('get', { entity: 'clients', id: client.id })).activities.map((a) => a.summary);
  assert.deepEqual(theirs, [`Email sent: ${r3.subject}`]);
});

test('email templates: mortgage ones are hidden from protection-only advisers by category or by their mortgage details, and theirs never vanish', async () => {
  // "Mortgage protection" is a protection product: the adviser's own template in that category stays theirs.
  const mp = await hannah.save('templates', { name: 'MP quote', category: 'Mortgage protection', subject: 'Your cover quote', body: 'Hi {{first_name}}' });
  assert.ok((await hannah.ok('list', { entity: 'templates' })).rows.some((t) => t.id === mp.id));
  assert.equal((await hannah.save('templates', { body: 'Hi {{first_name}}, here is your quote.' }, mp.id)).id, mp.id);
  // A category or details they couldn't see is refused rather than saved out of sight.
  for (const [data, field] of [
    [{ name: 'C', category: 'Cases', subject: 'S', body: 'B' }, 'category'],
    [{ name: 'C', category: 'Case studies', subject: 'S', body: 'B' }, 'category'],
    [{ name: 'R', category: 'Remortgage', subject: 'S', body: 'B' }, 'category'],
    [{ name: 'L', category: 'Offers', subject: 'S', body: 'Your offer from {{lender}}' }, 'body'],
    [{ name: 'L', category: '', subject: 'Completion on {{ completion_date }}', body: 'B' }, 'body'],
  ]) {
    const r = await saveRaw(hannah, 'templates', data);
    assert.equal(r.status, 400, `${JSON.stringify(data)}: ${r.text}`);
    assert.equal(r.json.field, field);
  }
  assert.equal((await saveRaw(hannah, 'templates', { category: 'Cases' }, mp.id)).status, 400);
  // Under protection or insurance the details are allowed (they are left blank for a protection-only login).
  const prot = await hannah.save('templates', { name: 'Cover for your home', category: 'Protection', subject: 'S', body: 'Cover for {{property_address}}' });
  assert.ok((await hannah.ok('list', { entity: 'templates' })).rows.some((t) => t.id === prot.id));
  // A mortgage template saved by a mortgage login under any category is hidden from them.
  const off = await newcastle.save('templates', { name: 'Offer chase', category: 'Offers', subject: 'Your offer', body: 'We have your offer for {{loan_amount}} on {{property_address}}.' });
  const theirs = (await hannah.ok('list', { entity: 'templates' })).rows;
  assert.ok(!theirs.some((t) => t.id === off.id));
  assert.ok(!theirs.some((t) => !/protection|insurance/i.test(t.category || '') && /\{\{\s*(lender|loan_amount|property_address|completion_date|fixed_rate_end_date)\s*\}\}/.test(t.subject + t.body)));
  assert.ok(theirs.some((t) => t.name === 'Protection review') && theirs.some((t) => t.name === 'First contact'));
  assert.equal((await hannah.get('get', { entity: 'templates', id: off.id })).status, 404);
  assert.equal((await hannah.post('renderTemplate', { template_id: off.id })).status, 404);
  assert.ok((await newcastle.ok('list', { entity: 'templates' })).rows.some((t) => t.id === off.id), 'the office still has it');
});
