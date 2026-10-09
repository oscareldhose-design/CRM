// Regression tests for the second-round General Sales fixes (crm/lib/sales.php). Run with: node --test tests/fix2-sales.test.mjs
// Starts PHP's built-in server on a throwaway database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 36000 + Math.floor(Math.random() * 3000);
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
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fix2-sales-'));
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], {
    env: { ...process.env, MAP_CRM_DATA_DIR: dataDir, MAP_CRM_MAIL_FILE: join(dataDir, 'mail.jsonl') }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}?action=status`); if (r.ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('PHP server did not start');
});
after(() => { server.kill(); rmSync(dataDir, { recursive: true, force: true }); });

const office = {};
const newcastle = new Client(), admin = new Client(), sid = new Client(), pia = new Client();
let ncDesk, piaId;   // the Newcastle office login (it can take hand-overs) and a protection-only adviser in Newcastle
let phoneNo = 955100;
const phone = () => `07700 ${phoneNo++}`;

async function contacts(eventId) {
  const r = await sid.get('salesEvent', { id: eventId });
  assert.equal(r.status, 200, r.text);
  return r.json.contacts;
}
async function addPeople(eventId, people) {
  await sid.ok('salesImport', { event_id: eventId, rows: people.map((p) => ({ consent: 'yes', ...p })) });
  const cs = await contacts(eventId);
  return people.map((p) => cs.find((c) => `${c.first_name} ${c.last_name}` === p.name));
}
const interested = (contact, notes) => sid.ok('salesCall', { contact_id: contact.id, outcome: 'interested', notes });
const leadsFor = async (contactId) => (await newcastle.get('list', { entity: 'leads' })).json.rows.filter((l) => l.event_contact_id === contactId);

test('setup: office login, a General Sales agent and a protection-only adviser', async () => {
  (await new Client().get('status')).json.offices.forEach((o) => { office[o.name] = o.id; });
  await newcastle.login('newcastle');
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
  await sid.login('sid.sales', 'Secret123');
  await pia.login('pia.cover', 'Secret123');
});

/* ---- #19: "Not sure yet" or "Other" can't carry a mortgage interest and its call notes to a protection-only adviser -- */

test('a hand-over to a protection-only adviser or administrator must be a protection enquiry', async () => {
  const ev = (await sid.ok('salesEventSave', { name: 'Leak Show', event_date: '2026-09-20', sponsorship_cost: 300 })).id;
  const [ethan, ryan, gail, rita] = await addPeople(ev, [
    { name: 'Ethan Price', phone: phone(), interest: 'Remortgage' }, { name: 'Ryan Bell', phone: phone(), interest: 'Buy to let' },
    { name: 'Gail Cover', phone: phone(), interest: 'Life cover' }, { name: 'Rita Remo', phone: phone(), interest: 'Remortgage' }]);
  await interested(ethan, 'Fixed rate with Nationwide ends in March, wants to remortgage, owes about 180k');
  await interested(ryan, 'Has two buy to let flats, wants a better rate');

  const base = { office_id: office.Newcastle, administrator_id: 0 };
  // "Not sure yet" (the form's default, sent as '') and "Other" are refused for a protection-only adviser or administrator,
  // on a field the hand-over form shows the message under.
  for (const [body, field] of [
    [{ contact_id: ethan.id, adviser_id: piaId, enquiry_type: '', notes: 'Interested in: Remortgage' }, 'adviser_id'],
    [{ contact_id: ethan.id, adviser_id: piaId }, 'adviser_id'],
    [{ contact_id: ryan.id, adviser_id: piaId, enquiry_type: 'other', notes: 'Interested in: Buy to let' }, 'adviser_id'],
    [{ contact_id: ryan.id, adviser_id: ncDesk, administrator_id: piaId, enquiry_type: '' }, 'administrator_id'],
    [{ contact_id: ryan.id, adviser_id: ncDesk, administrator_id: piaId, enquiry_type: 'other' }, 'administrator_id'],
  ]) {
    const r = await sid.post('salesHandover', { ...base, ...body });
    assert.equal(r.status, 400, r.text);
    assert.equal(r.json.field, field, r.text);
    assert.match(r.json.message, /Pia Cover gives protection advice only/);
    assert.match(r.json.message, /Protection \(life, CI, IP\)/, 'the message says what to choose');
  }
  // A mortgage enquiry is still refused as before.
  const m = await sid.post('salesHandover', { ...base, contact_id: ethan.id, adviser_id: piaId, enquiry_type: 'remortgage' });
  assert.equal(m.status, 400, m.text);
  assert.equal(m.json.field, 'adviser_id');
  assert.match(m.json.message, /can't take this enquiry \(Remortgage\)/);

  // Nothing was handed over and nothing reached the protection-only adviser.
  assert.equal((await leadsFor(ethan.id)).length, 0);
  assert.equal((await leadsFor(ryan.id)).length, 0);
  for (const c of await contacts(ev)) {
    if (c.id === ethan.id || c.id === ryan.id) assert.equal(c.status, 'interested');
  }
  for (const [action, params] of [['list', { entity: 'leads' }], ['list', { entity: 'tasks' }], ['dashboard', {}], ['notifications', {}], ['search', { q: 'Ethan' }]]) {
    const r = await pia.get(action, params);
    assert.equal(r.status, 200, `${action}: ${r.text}`);
    assert.doesNotMatch(r.text, /Remortgage|Nationwide|Buy to let|Ethan|Ryan/, `${action} ${JSON.stringify(params)}`);
  }

  // A protection enquiry still goes to them, with the agent's notes.
  const okGail = await sid.ok('salesHandover', { ...base, contact_id: gail.id, adviser_id: piaId, enquiry_type: 'protection', notes: 'Interested in: Life cover' });
  const gl = (await pia.get('get', { entity: 'leads', id: okGail.lead_id })).json.record;
  assert.equal(gl.enquiry_type, 'protection');
  assert.match(gl.notes, /Interested in: Life cover/);
  // When the agent takes the contact's mortgage interest out of the notes for a protection-only adviser, it isn't put back.
  const okRita = await sid.ok('salesHandover', { ...base, contact_id: rita.id, adviser_id: piaId, enquiry_type: 'insurance', notes: 'Wants home insurance, call after 6pm' });
  const rl = await pia.get('get', { entity: 'leads', id: okRita.lead_id });
  assert.equal(rl.status, 200, rl.text);
  assert.match(rl.json.record.notes, /Wants home insurance, call after 6pm/);
  assert.doesNotMatch(rl.text, /Remortgage/);
  // A protection-only administrator with a protection enquiry is fine too.
  const [hugo] = await addPeople(ev, [{ name: 'Hugo Cover', phone: phone(), interest: 'Income protection' }]);
  const okHugo = await sid.ok('salesHandover', { ...base, contact_id: hugo.id, adviser_id: ncDesk, administrator_id: piaId, enquiry_type: 'business_protection' });
  assert.ok((await pia.get('list', { entity: 'leads' })).json.rows.some((l) => l.id === okHugo.lead_id));

  // Everyone else can still be handed "Not sure yet" or "Other", and gets the contact's interest and call history as before.
  const okEthan = await sid.ok('salesHandover', { ...base, contact_id: ethan.id, adviser_id: ncDesk, enquiry_type: '' });
  const el = await newcastle.get('get', { entity: 'leads', id: okEthan.lead_id });
  assert.equal(el.status, 200, el.text);
  assert.equal(el.json.record.enquiry_type, null);
  assert.match(el.json.record.notes, /Interested in: Remortgage/);
  assert.match(el.text, /Nationwide ends in March/);
  const okRyan = await sid.ok('salesHandover', { ...base, contact_id: ryan.id, adviser_id: ncDesk, enquiry_type: 'other' });
  assert.match((await newcastle.get('get', { entity: 'leads', id: okRyan.lead_id })).json.record.notes, /Interested in: Buy to let/);
});
