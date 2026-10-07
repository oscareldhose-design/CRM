// Regression tests for the General Sales fixes (crm/lib/sales.php). Run with: node --test tests/fix-sales.test.mjs
// Starts PHP's built-in server (several workers, so requests really run at the same time) on a throwaway database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 31000 + Math.floor(Math.random() * 4000);
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
  async ok(action, body) {
    const r = await this.post(action, body);
    assert.equal(r.status, 200, `${action}: ${r.text}`);
    return r.json;
  }
  async login(username, password = PW) {
    const r = await this.post('login', { username, password });
    assert.equal(r.status, 200, `login ${username}: ${r.text}`);
    return r.json.user;
  }
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fix-sales-'));
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], {
    env: { ...process.env, MAP_CRM_DATA_DIR: dataDir, MAP_CRM_MAIL_FILE: join(dataDir, 'mail.jsonl'), PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}?action=status`); if (r.ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('PHP server did not start');
});
after(() => { server.kill(); rmSync(dataDir, { recursive: true, force: true }); });

const office = {};
const newcastle = new Client(), nottingham = new Client(), admin = new Client(), sid = new Client(), pia = new Client();
let ncDesk, ntDesk, piaId;   // the Newcastle and Nottingham office logins (they can take hand-overs) and a protection-only adviser
let phoneNo = 900100;
const phone = () => `07700 ${phoneNo++}`;
const future = () => new Date(Date.now() + 86400000).toISOString();

async function newEvent(name) {
  return (await sid.ok('salesEventSave', { name, event_date: '2026-09-20', sponsorship_cost: 300 })).id;
}
async function contacts(eventId) {
  const r = await sid.get('salesEvent', { id: eventId });
  assert.equal(r.status, 200, r.text);
  return r.json.contacts;
}
async function addPeople(eventId, people) {
  const imp = await sid.ok('salesImport', { event_id: eventId, rows: people.map((p) => ({ consent: 'yes', ...p })) });
  const cs = await contacts(eventId);
  return people.map((p) => cs.find((c) => `${c.first_name} ${c.last_name}` === p.name)).concat([imp]);
}
async function leadsFor(contactId) {
  const all = [];
  for (const c of [newcastle, nottingham]) all.push(...(await c.get('list', { entity: 'leads' })).json.rows);
  return all.filter((l) => l.event_contact_id === contactId);
}

test('setup: office logins, a General Sales agent and a protection-only adviser', async () => {
  (await new Client().get('status')).json.offices.forEach((o) => { office[o.name] = o.id; });
  await newcastle.login('newcastle');
  await nottingham.login('nottingham');
  await admin.login('admin');
  for (const [name, user, advice] of [['Sid Sales', 'sid.sales', 'mortgage_protection'], ['Pia Cover', 'pia.cover', 'protection']]) {
    const r = await new Client().post('register', { full_name: name, email: `${user}@themaap.co.uk`, username: user, password: 'Secret123', advice_type: advice });
    assert.equal(r.status, 200, r.text);
  }
  const rows = (await admin.get('adminUsers')).json.rows;
  const id = (u) => rows.find((r) => r.username === u).id;
  await admin.ok('adminUserApprove', { id: id('sid.sales'), role: 'sales', office_id: 0 });
  await admin.ok('adminUserApprove', { id: id('pia.cover'), role: 'adviser', office_id: office.Newcastle, advice_type: 'protection' });
  piaId = id('pia.cover');
  ncDesk = id('newcastle');
  ntDesk = id('nottingham');
  await sid.login('sid.sales', 'Secret123');
  await pia.login('pia.cover', 'Secret123');
});

test('two agents handing the same person over at once make one lead, not several', async () => {
  const ev = await newEvent('Race Show');
  const [zed] = await addPeople(ev, [{ name: 'Zed Race', phone: phone(), interest: 'First home' }]);
  const body = (o, a) => ({ contact_id: zed.id, office_id: o, adviser_id: a, administrator_id: 0, enquiry_type: 'ftb', notes: '' });
  const other = new Client();
  await other.login('sid.sales', 'Secret123');
  const rs = await Promise.all([sid.post('salesHandover', body(office.Newcastle, ncDesk)), other.post('salesHandover', body(office.Nottingham, ntDesk)),
    sid.post('salesHandover', body(office.Newcastle, ncDesk)), other.post('salesHandover', body(office.Nottingham, ntDesk))]);
  assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.text).join('\n'));
  assert.ok(rs.filter((r) => r.status !== 200).every((r) => r.status === 409 && r.json.code === 'handed'));
  const leads = await leadsFor(zed.id);
  assert.equal(leads.length, 1, 'only one office lead for the person');
  const after_ = (await contacts(ev)).find((c) => c.id === zed.id);
  assert.equal(after_.handed_lead_id, leads[0].id);
});

test('a protection-only adviser cannot be handed a mortgage enquiry they would never see', async () => {
  const staff = (await sid.get('salesStaff', { office_id: office.Newcastle })).json.rows;
  assert.equal(staff.find((s) => s.id === piaId).advice_type, 'protection', 'the hand-over form can tell who is protection only');
  const ev = await newEvent('Cover Show');
  const [fred, gail] = await addPeople(ev, [{ name: 'Fred Firsthome', phone: phone() }, { name: 'Gail Cover', phone: phone() }]);
  const r = await sid.post('salesHandover', { contact_id: fred.id, office_id: office.Newcastle, adviser_id: piaId, administrator_id: 0, enquiry_type: 'ftb' });
  assert.equal(r.status, 400, r.text);
  assert.equal(r.json.field, 'adviser_id');
  const r2 = await sid.post('salesHandover', { contact_id: fred.id, office_id: office.Newcastle, adviser_id: ncDesk, administrator_id: piaId, enquiry_type: 'remortgage' });
  assert.equal(r2.status, 400, r2.text);
  assert.equal(r2.json.field, 'administrator_id');
  assert.equal((await leadsFor(fred.id)).length, 0, 'nothing was handed over');
  // A protection enquiry (or "not sure yet") is fine, and the adviser sees the lead and its task.
  const ok = await sid.ok('salesHandover', { contact_id: gail.id, office_id: office.Newcastle, adviser_id: piaId, administrator_id: 0, enquiry_type: 'protection' });
  assert.ok((await pia.get('list', { entity: 'leads' })).json.rows.some((l) => l.id === ok.lead_id));
  assert.ok((await pia.get('list', { entity: 'tasks' })).json.rows.some((t) => t.lead_id === ok.lead_id && t.assigned_to === piaId));
  await sid.ok('salesHandover', { contact_id: fred.id, office_id: office.Newcastle, adviser_id: ncDesk, administrator_id: 0, enquiry_type: 'ftb' });
});

test("a queue screen left open can't overwrite another agent's Do not call and put the person back in the queue", async () => {
  const ev = await newEvent('Claim Show');
  const [carl, rob] = await addPeople(ev, [{ name: 'Carl Claim', phone: phone() }, { name: 'Rob Retry', phone: phone() }]);
  const q = (await sid.get('salesQueue', { event_id: ev })).json;
  assert.ok(q.contact);
  const held = q.contact;
  // Someone else reaches the same person (e.g. after the 15-minute hold ran out) and is told never to call again.
  await newcastle.ok('salesCall', { contact_id: held.id, outcome: 'do_not_call', notes: 'Asked never to be called' });
  const stale = await sid.post('salesCall', { contact_id: held.id, outcome: 'callback', callback_at: future(), notes: 'stale screen' });
  assert.equal(stale.status, 409, stale.text);
  assert.equal(stale.json.code, 'conflict');
  const row = (await contacts(ev)).find((c) => c.id === held.id);
  assert.equal(row.status, 'do_not_call');
  assert.equal(row.attempts, 1, 'the refused call is not counted');
  const next = (await sid.get('salesQueue', { event_id: ev })).json.contact;
  assert.ok(!next || next.id !== held.id, 'they are not offered again');
  // People still in the queue (no answer) can be called again.
  const other = held.id === carl.id ? rob : carl;
  await newcastle.ok('salesCall', { contact_id: other.id, outcome: 'no_answer' });
  await sid.ok('salesCall', { contact_id: other.id, outcome: 'no_answer' });
  assert.equal((await contacts(ev)).find((c) => c.id === other.id).attempts, 2);
});

test('erasing a handed-over person also removes their details from the office lead', async () => {
  const ev = await newEvent('Erase Show');
  const [elena, conor] = await addPeople(ev, [{ name: 'Elena Erase', phone: phone(), email: 'elena@example.com' }, { name: 'Conor Client', phone: phone(), email: 'conor@example.com' }]);
  await sid.ok('salesCall', { contact_id: elena.id, outcome: 'interested', notes: 'Divorcing, needs to buy husband out' });
  const ho = await sid.ok('salesHandover', { contact_id: elena.id, office_id: office.Newcastle, adviser_id: ncDesk, administrator_id: 0, enquiry_type: 'remortgage', notes: 'Call after 6pm' });
  assert.equal((await sid.post('salesContactErase', { id: elena.id, confirm: 'ERASE' })).status, 200);
  const lead = (await newcastle.get('get', { entity: 'leads', id: ho.lead_id })).json;
  assert.equal(lead.record.first_name, 'Erased');
  assert.equal(lead.record.email, null);
  assert.equal(lead.record.phone, null);
  assert.equal(lead.record.notes, null);
  assert.ok(lead.activities.length > 0);
  assert.ok(!JSON.stringify(lead.activities).includes('Divorcing'), 'call notes are gone from the lead');
  assert.ok(!JSON.stringify(lead.tasks).includes('Elena'), 'and from its tasks');
  assert.ok(lead.tasks.every((t) => t.status === 'done'), 'nothing is left to follow up');
  const audit = (await newcastle.get('audit')).json.rows;
  assert.ok(!JSON.stringify(audit).includes('Elena'), 'or the office audit log');
  // Once the office has made them a client, the office erases them (which clears General Sales too).
  const ho2 = await sid.ok('salesHandover', { contact_id: conor.id, office_id: office.Newcastle, adviser_id: ncDesk, administrator_id: 0, enquiry_type: 'protection' });
  const conv = await newcastle.ok('convertLead', { id: ho2.lead_id, create_case: false });
  const refused = await sid.post('salesContactErase', { id: conor.id, confirm: 'ERASE' });
  assert.equal(refused.status, 409, refused.text);
  assert.equal(refused.json.code, 'client');
  assert.match(refused.json.message, /Newcastle/);
  await newcastle.ok('eraseClient', { id: conv.client_id, confirm: 'ERASE' });
  const gone = (await contacts(ev)).find((c) => c.id === conor.id);
  assert.ok(gone.erased_at);
  assert.equal(gone.phone, null);
});

test('removed people can still be erased, and someone who said "do not call" is never added back', async () => {
  const ev1 = await newEvent('Old Show');
  const neilPhone = phone();
  const [gina, neil, dora, remy] = await addPeople(ev1, [{ name: 'Gina Delete', phone: phone(), email: 'gina@example.com' },
    { name: 'Neil Nocall', phone: neilPhone }, { name: 'Dora Event', phone: phone() }, { name: 'Remy Removed', phone: phone(), email: 'remy@example.com' }]);
  await sid.ok('salesCall', { contact_id: neil.id, outcome: 'do_not_call' });
  for (const c of [gina, neil, remy]) await sid.ok('salesContactDelete', { id: c.id });
  assert.equal((await sid.post('salesContactErase', { id: gina.id, confirm: 'ERASE' })).status, 200, 'a removed contact can be erased');
  await sid.ok('salesEventDelete', { id: ev1 });
  assert.equal((await sid.post('salesContactErase', { id: dora.id, confirm: 'ERASE' })).status, 200, 'so can someone on a deleted event');
  const ev2 = await newEvent('New Show');
  const imp = await sid.ok('salesImport', { event_id: ev2, rows: [{ name: 'Neil Nocall', phone: neilPhone.replace(/^0/, '+44 '), consent: 'yes' },
    { name: 'Remy Removed', email: 'remy@example.com', consent: 'yes' }, { name: 'Fay Fresh', phone: phone(), consent: 'yes' }] });
  assert.equal(imp.duplicates, 1, 'the do-not-call person is skipped');
  assert.equal(imp.added, 2, 'someone simply removed from a list can be added again');
  assert.ok(!(await contacts(ev2)).some((c) => c.last_name === 'Nocall'));
  const one = await sid.post('salesContactSave', { event_id: ev2, first_name: 'Neil', last_name: 'Again', phone: neilPhone, consent: true });
  assert.equal(one.status, 409, one.text);
  assert.equal(one.json.code, 'duplicate');
  assert.match(one.json.message, /Do not call/);
});

test('two imports of the same sign-up list at once add everyone only once', async () => {
  const ev = await newEvent('Double Import Show');
  const rows = [];
  for (let i = 0; i < 150; i++) rows.push({ name: `Person ${i}`, phone: `07800 2${String(i).padStart(5, '0')}`, consent: 'yes' });
  const other = new Client();
  await other.login('sid.sales', 'Secret123');
  const rs = await Promise.all([sid.post('salesImport', { event_id: ev, rows }), other.post('salesImport', { event_id: ev, rows })]);
  rs.forEach((r) => assert.equal(r.status, 200, r.text));
  assert.equal(rs[0].json.added + rs[1].json.added, 150);
  assert.equal(rs[0].json.duplicates + rs[1].json.duplicates, 150);
  assert.equal((await contacts(ev)).length, 150);
});

test('an import row whose only contact detail is a broken email is refused', async () => {
  const ev = await newEvent('Bad Email Show');
  const imp = await sid.ok('salesImport', { event_id: ev, rows: [{ name: 'Bob Jones', email: 'bob at example dot com', phone: '', consent: 'yes' },
    { name: 'Ann Lee', email: 'ann@', consent: 'yes' }, { name: 'Val Id', email: 'val@example.com', consent: 'yes' }] });
  assert.equal(imp.added, 1);
  assert.equal(imp.invalid, 2);
  assert.match(imp.errors[0].message, /bob at example dot com/);
  assert.deepEqual((await contacts(ev)).map((c) => c.first_name), ['Val']);
});

test('editing a contact checks the version, and an erased contact cannot be edited back', async () => {
  const ev = await newEvent('Edit Show');
  const id = (await sid.ok('salesContactSave', { event_id: ev, first_name: 'Eddie', last_name: 'Edit', phone: phone(), consent: true })).id;
  const c = (await contacts(ev)).find((x) => x.id === id);
  const data = { id, event_id: ev, first_name: 'Eddie', last_name: 'Edit', phone: c.phone, consent: true };
  await sid.ok('salesContactSave', { ...data, notes: 'first edit', version: c.version });
  const stale = await sid.post('salesContactSave', { ...data, notes: 'second edit from an old screen', version: c.version });
  assert.equal(stale.status, 409, stale.text);
  assert.equal(stale.json.code, 'conflict');
  assert.equal((await contacts(ev)).find((x) => x.id === id).notes, 'first edit');
  await sid.ok('salesContactErase', { id, confirm: 'ERASE' });
  const back = await sid.post('salesContactSave', { ...data, notes: 'written back' });
  assert.equal(back.status, 409, back.text);
  assert.equal((await contacts(ev)).find((x) => x.id === id).phone, null);
});

test('hand-over notes say "Interested in" once', async () => {
  const ev = await newEvent('Notes Show');
  const [nina] = await addPeople(ev, [{ name: 'Nina Notes', phone: phone(), interest: 'First home' }]);
  const ho = await sid.ok('salesHandover', { contact_id: nina.id, office_id: office.Newcastle, adviser_id: ncDesk, administrator_id: 0, enquiry_type: 'ftb', notes: 'Interested in: First home' });
  const notes = (await newcastle.get('get', { entity: 'leads', id: ho.lead_id })).json.record.notes;
  assert.equal(notes.match(/Interested in: First home/g).length, 1, notes);
  const [omar] = await addPeople(ev, [{ name: 'Omar Other', phone: phone(), interest: 'Life cover' }]);
  const ho2 = await sid.ok('salesHandover', { contact_id: omar.id, office_id: office.Newcastle, adviser_id: ncDesk, administrator_id: 0, enquiry_type: 'protection', notes: 'Call after 6pm' });
  assert.match((await newcastle.get('get', { entity: 'leads', id: ho2.lead_id })).json.record.notes, /Interested in: Life cover\nCall after 6pm/);
});
