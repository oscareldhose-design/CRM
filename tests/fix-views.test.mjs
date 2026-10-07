// Regression tests for the screens API (crm/lib/views.php). Run with: node --test tests/fix-views.test.mjs
// Starts PHP's built-in server on a throwaway database, like tests/api.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 25000 + Math.floor(Math.random() * 5000);
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
/** Runs one SQL statement straight on the test database (to set times the API always sets to "now"). */
const sql = (query, params = []) => {
  const file = join(dataDir, readdirSync(dataDir).find((f) => f.endsWith('.sqlite')));
  const code = '$p = new PDO("sqlite:" . $argv[1]); $p->setAttribute(PDO::ATTR_TIMEOUT, 10); $p->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);'
    + ' $s = $p->prepare($argv[2]); $s->execute(json_decode($argv[3], true)); echo json_encode($s->fetchAll(PDO::FETCH_ASSOC));';
  return JSON.parse(execFileSync('php', ['-r', code, file, query, JSON.stringify(params)]).toString() || '[]');
};

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fix-views-'));
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
const hannah = new Client(), paula = new Client(), sarah = new Client();
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

test('setup: Newcastle with mortgage and protection work, a protection-only adviser and a protection-only manager', async () => {
  (await new Client().get('status')).json.offices.forEach((o) => { officeId[o.name] = o.id; });
  await newcastle.login('newcastle');
  await nottingham.login('nottingham');
  await london.login('london');
  await admin.login('admin');
  staff.sarah = await makeUser('sarah.ahmed', 'mortgage_protection', 'Newcastle');
  staff.mark = await makeUser('mark.lewis', 'mortgage_protection', 'Newcastle');
  staff.hannah = await makeUser('hannah.reid', 'protection', 'Newcastle');
  await hannah.login('hannah.reid', 'Secret123');
  await sarah.login('sarah.ahmed', 'Secret123');
  // The admin can make an office manager whose login is protection only.
  const pm = await admin.post('adminUserSave', { full_name: 'Paula Prot', email: 'paula.prot@themaap.co.uk', username: 'paula.prot', role: 'manager', office_id: officeId.Newcastle, advice_type: 'protection', status: 'active' });
  assert.equal(pm.status, 200, pm.text);
  await paula.login('paula.prot', pm.json.temp_password);
  assert.equal((await paula.post('changePassword', { current_password: pm.json.temp_password, new_password: 'Secret12345!' })).status, 200);
  const me = (await paula.ok('status')).user;
  assert.equal(me.role, 'manager');
  assert.equal(me.protection_only, true);

  // Mortgage work: an introducer's client with a completed case (fixed rate ends soon), a live case with documents and a case task.
  W.intro = await newcastle.save('introducers', { name: 'Rachel Green', company: 'Tyneside Homes' });
  W.client = await newcastle.save('clients', { first_name: 'Pat', last_name: 'Protclient', adviser_id: staff.hannah.id, introducer_id: W.intro.id });
  W.done = await newcastle.save('cases', { client_id: W.client.id, case_type: 'remortgage', stage: 'completed', completion_date: '2021-12-01', fixed_rate_end_date: daysFromNow(100),
    lender: 'Halifax', loan_amount: 175000, proc_fee: 600, rate_type: 'fixed', adviser_id: staff.sarah.id, introducer_id: W.intro.id });
  W.live = await newcastle.save('cases', { client_id: W.client.id, case_type: 'ftb', stage: 'application', lender: 'Nationwide', loan_amount: 210000, adviser_id: staff.sarah.id });
  assert.equal((await newcastle.post('documentPack', { case_id: W.live.id })).status, 200);
  W.caseTask = await newcastle.save('tasks', { title: 'Chase Nationwide underwriter', case_id: W.live.id, client_id: W.client.id, assigned_to: staff.sarah.id, due_date: daysFromNow(1) });
  W.mLead = await newcastle.save('leads', { first_name: 'Morty', last_name: 'Gagelead', phone: '07700 900501', enquiry_type: 'ftb', introducer_id: W.intro.id, adviser_id: staff.sarah.id });
  // Protection work.
  W.pLead = await newcastle.save('leads', { first_name: 'Ruby', last_name: 'Shaw', phone: '07700 900502', enquiry_type: 'protection', introducer_id: W.intro.id, adviser_id: staff.hannah.id });
  await newcastle.save('policies', { client_id: W.client.id, policy_type: 'home', status: 'on_risk', provider: 'LV=', premium: 30, renewal_date: daysFromNow(200) });
  cron();
  const ops = (await newcastle.ok('opportunities', { status: 'open' })).rows.filter((o) => o.client_id === W.client.id);
  W.remOpp = ops.find((o) => o.type === 'remortgage');
  W.gapOpp = ops.find((o) => o.type === 'protection_gap');
  assert.ok(W.remOpp && W.gapOpp, `the engine raised a remortgage and a protection gap opportunity: ${JSON.stringify(ops.map((o) => o.type))}`);
});

test('a protection-only manager\'s backup and audit log hold no mortgage work; the office login\'s backup still holds everything', async () => {
  const b = await paula.get('backup');
  assert.equal(b.status, 200, b.text);
  const data = JSON.parse(b.text);
  assert.match(data.scope, /protection/);
  assert.deepEqual(data.cases, [], 'no mortgage cases');
  assert.deepEqual(data.documents, [], 'no case documents');
  assert.ok(data.leads.some((l) => l.id === W.pLead.id), 'protection leads are kept');
  assert.ok(!data.leads.some((l) => l.id === W.mLead.id), 'mortgage leads are left out');
  assert.ok(!data.tasks.some((t) => t.case_id), 'no case tasks');
  assert.ok(!data.activities.some((a) => a.case_id), 'no case activity');
  assert.ok(!data.opportunities.some((o) => o.type === 'remortgage'), 'no remortgage opportunities');
  assert.ok(!data.opportunities.some((o) => /mortgage/i.test(o.detail || '')), 'opportunity notes don\'t mention the mortgage');
  assert.ok(data.templates.length > 0 && !data.templates.some((t) => /mortgage|^case/i.test(t.category || '')), 'no mortgage templates');
  const text = JSON.stringify(data);
  assert.ok(!/Halifax|Nationwide|Morty Gagelead|Added mortgage case/.test(text), 'nothing in the file names the mortgage work');
  assert.ok(data.clients.some((c) => c.id === W.client.id), 'clients and their cover are kept');
  assert.ok(data.policies.length > 0);

  const audit = (await paula.ok('audit')).rows;
  assert.ok(audit.length > 0);
  assert.ok(!audit.some((r) => ['cases', 'documents'].includes(r.entity) || r.action === 'lookup'), 'no case or document history');
  assert.ok(!audit.some((r) => /Morty Gagelead|Chase Nationwide|Remortgage:/.test(r.summary || '')), 'no mortgage lead, case task or remortgage lines');
  assert.ok(audit.some((r) => /Ruby Shaw/.test(r.summary || '')), 'protection work is still in the audit log');

  const office = await newcastle.get('backup');
  const full = JSON.parse(office.text);
  assert.equal(full.scope, 'office');
  assert.ok(full.cases.length >= 2 && full.documents.length > 0, 'the office login keeps a full backup');
  assert.ok(full.leads.some((l) => l.id === W.mLead.id));
  assert.ok((await newcastle.ok('audit')).rows.some((r) => r.entity === 'cases'));
});

test('protection-only advisers get no remortgage notifications and cannot act on remortgage opportunities', async () => {
  const bell = (await hannah.ok('notifications')).items;
  assert.ok(bell.some((i) => i.kind === 'opportunity'), 'protection opportunities still ring the bell');
  assert.ok(!bell.some((i) => /Remortgage/.test(i.text)), 'remortgage ones don\'t');
  for (const action of ['dismissed', 'open', 'actioned', 'task']) {
    const r = await hannah.post('opportunityAct', { id: W.remOpp.id, action });
    assert.equal(r.status, 404, `${action}: ${r.text}`);
  }
  const still = (await newcastle.ok('opportunities', { status: 'all' })).rows.find((o) => o.id === W.remOpp.id);
  assert.equal(still.status, 'open', 'the remortgage opportunity is untouched');
  // The protection gap still works, and its wording doesn't mention the mortgage.
  const rows = (await hannah.ok('opportunities', { status: 'open' })).rows;
  const gap = rows.find((o) => o.id === W.gapOpp.id);
  assert.ok(gap);
  assert.ok(!rows.some((o) => /mortgage|completion/i.test(o.detail || '')), JSON.stringify(rows.map((o) => o.detail)));
  const act = await hannah.post('opportunityAct', { id: W.gapOpp.id, action: 'task' });
  assert.equal(act.status, 200, act.text);
  const task = (await hannah.ok('get', { entity: 'tasks', id: act.json.task_id })).record;
  assert.ok(!/mortgage/i.test(task.notes || ''), task.notes);
  // The office login still sees the engine's own words.
  assert.match((await newcastle.ok('opportunities', { status: 'all' })).rows.find((o) => o.id === W.gapOpp.id).detail, /mortgage/);
});

test('protection-only advisers get no mortgage figures in introducer stats or team workload', async () => {
  const mine = (await hannah.ok('introducerStats')).rows.find((r) => r.id === W.intro.id);
  assert.equal(mine.completed, 0);
  assert.equal(mine.lent, 0);
  assert.equal(mine.fees, 0);
  assert.equal(mine.referrals, 2, 'the protection lead and the client, not the mortgage lead');
  const office = (await newcastle.ok('introducerStats')).rows.find((r) => r.id === W.intro.id);
  assert.equal(office.completed, 1);
  assert.equal(office.lent, 175000);
  assert.equal(office.referrals, 3);

  const team = (await hannah.ok('team')).rows;
  const s = team.find((u) => u.id === staff.sarah.id);
  assert.equal(s.active_cases, 0);
  assert.equal(s.open_leads, 0, 'her mortgage lead is not counted');
  assert.equal(s.open_tasks, 0, 'nor her case task');
  assert.equal((await newcastle.ok('team')).rows.find((u) => u.id === staff.sarah.id).active_cases, 1);
});

test('the trash shows protection-only advisers no mortgage leads, case tasks or mortgage templates', async () => {
  const lead = await newcastle.save('leads', { first_name: 'Trashed', last_name: 'Mortgagelead', phone: '07700 900503', enquiry_type: 'btl' });
  const task = await newcastle.save('tasks', { title: 'Trashed case task', case_id: W.live.id });
  const tpl = await newcastle.save('templates', { name: 'Trashed offer chase', category: 'Mortgage offers', subject: 'Your offer', body: 'Hello' });
  const pLead = await newcastle.save('leads', { first_name: 'Trashed', last_name: 'Coverlead', phone: '07700 900504', enquiry_type: 'protection' });
  for (const [entity, id] of [['leads', lead.id], ['tasks', task.id], ['templates', tpl.id], ['leads', pLead.id]]) {
    assert.equal((await newcastle.post('delete', { entity, id })).status, 200);
  }
  const names = (await hannah.ok('trash')).rows.map((r) => `${r.entity}:${r.name}`);
  assert.ok(names.includes('leads:Trashed Coverlead'), names.join());
  assert.ok(!names.some((n) => /Mortgagelead|Trashed case task|Trashed offer chase/.test(n)), names.join());
  const office = (await newcastle.ok('trash')).rows.map((r) => `${r.entity}:${r.name}`);
  assert.ok(['leads:Trashed Mortgagelead', 'tasks:Trashed case task', 'templates:Trashed offer chase'].every((n) => office.includes(n)), office.join());
});

test('GDPR erase clears profile and lost reasons, closes follow-ups, scrubs purged history and outdates open forms', async () => {
  const cl = await nottingham.save('clients', { first_name: 'Zed', last_name: 'Purgeme', marital_status: 'divorced', dependants: 3, employment_status: 'self_employed', homeowner_status: 'renting' });
  const k = await nottingham.save('cases', { client_id: cl.id, case_type: 'ftb', property_address: '12 Acacia Avenue, Watford', notes: 'Lives with Jane', loan_amount: 100000 });
  const lostCase = await nottingham.save('cases', { client_id: cl.id, case_type: 'remortgage', loan_amount: 90000 });
  await nottingham.save('cases', { status: 'lost', lost_reason: 'Zed Purgeme divorce, sale with Jane Purgeme fell through' }, lostCase.id, lostCase.version);
  await nottingham.save('cases', { client_id: cl.id, case_type: 'remortgage', stage: 'completed', completion_date: '2021-01-01', fixed_rate_end_date: daysFromNow(60), loan_amount: 90000 });
  const pol = await nottingham.save('policies', { client_id: cl.id, policy_type: 'life', policy_number: 'AV-998877' });
  const gone = await nottingham.save('tasks', { title: 'Call Zed Purgeme about his CCJ', client_id: cl.id });
  assert.equal((await nottingham.post('delete', { entity: 'tasks', id: gone.id })).status, 200);
  assert.equal((await nottingham.post('purge', { entity: 'tasks', id: gone.id })).status, 200);
  await nottingham.save('tasks', { title: 'Send Zed his KFI', client_id: cl.id, due_date: daysFromNow(2) });
  cron();
  assert.ok((await nottingham.ok('opportunities', { status: 'open' })).rows.some((o) => o.client_id === cl.id), 'the client has an open opportunity');

  assert.equal((await nottingham.post('eraseClient', { id: cl.id, confirm: 'ERASE' })).status, 200);
  const file = await nottingham.ok('get', { entity: 'clients', id: cl.id });
  for (const f of ['marital_status', 'dependants', 'employment_status', 'homeowner_status']) assert.equal(file.record[f], null, f);
  assert.equal(file.cases.find((c) => c.id === lostCase.id).lost_reason, null, 'free-text lost reasons are cleared');
  assert.ok(file.tasks.length > 0 && file.tasks.every((t) => t.status === 'done'), 'open tasks are closed');
  assert.ok(!file.opportunities.some((o) => o.status === 'open'), 'open opportunities are closed');
  assert.ok(!(await nottingham.ok('opportunities', { status: 'open' })).rows.some((o) => o.client_id === cl.id));
  // An edit form opened before the erase can't write the details back.
  const staleCase = await nottingham.post('save', { entity: 'cases', id: k.id, version: k.version, data: { property_address: '12 Acacia Avenue, Watford' } });
  assert.equal(staleCase.status, 409, staleCase.text);
  const stalePolicy = await nottingham.post('save', { entity: 'policies', id: pol.id, version: pol.version, data: { policy_number: 'AV-998877' } });
  assert.equal(stalePolicy.status, 409, stalePolicy.text);
  // History of the task purged before the erase no longer names him.
  assert.deepEqual((await nottingham.ok('audit', { q: 'Purgeme' })).rows.map((r) => r.summary), []);
});

test('dashboard counts match the screens they link to', async () => {
  const dash = async () => (await london.ok('dashboard'));
  const reminder = async (re) => (await dash()).reminders.some((r) => re.test(r.text));
  // Opportunities of a client in the trash are not counted (as on the Opportunities screen).
  const cl = await london.save('clients', { first_name: 'Del', last_name: 'Eted' });
  await london.save('cases', { client_id: cl.id, case_type: 'ftb', stage: 'completed', completion_date: '2021-01-01', fixed_rate_end_date: daysFromNow(150), loan_amount: 100000 });
  await london.post('addActivity', { client_id: cl.id, type: 'note', summary: 'Spoke to Del' });
  cron();
  assert.ok((await dash()).kpis.opportunities > 0);
  assert.ok((await dash()).recent.some((a) => a.client_name === 'Del Eted'));
  assert.equal((await london.post('delete', { entity: 'clients', id: cl.id })).status, 200);
  const screen = await london.ok('opportunities', { status: 'open' });
  const d = await dash();
  assert.equal(d.kpis.opportunities, screen.rows.length);
  assert.equal(Object.values(screen.counts).reduce((a, b) => a + b, 0), screen.rows.length, 'the type counts agree with the rows');
  assert.ok(!d.recent.some((a) => a.client_name === 'Del Eted'), 'recent activity leaves out clients in the trash');

  // Fixed rates ending: counted as the radar counts them (92 days; erased clients left out).
  const era = await london.save('clients', { first_name: 'Era', last_name: 'Sed' });
  await london.save('cases', { client_id: era.id, case_type: 'ftb', stage: 'completed', completion_date: '2021-01-01', fixed_rate_end_date: daysFromNow(91), loan_amount: 100000 });
  assert.equal((await london.ok('radar')).buckets.m3.length, 1);
  assert.ok(await reminder(/fixed rate ends within 3 months/), 'the reminder agrees with the radar\'s "within 3 months"');
  assert.equal((await dash()).kpis.remortgage_6m, 1);
  assert.equal((await london.post('eraseClient', { id: era.id, confirm: 'ERASE' })).status, 200);
  assert.equal((await london.ok('radar')).buckets.m3.length, 0);
  assert.equal((await dash()).kpis.remortgage_6m, 0);
  assert.ok(!(await reminder(/fixed rate/)));

  // Documents still awaited on a case that is then lost no longer raise the reminder.
  const dc = await london.save('clients', { first_name: 'Doc', last_name: 'Lost' });
  const k = await london.save('cases', { client_id: dc.id, case_type: 'ftb' });
  await london.save('documents', { case_id: k.id, client_id: dc.id, name: 'Payslips', status: 'requested', requested_at: daysFromNow(-20) });
  assert.ok(await reminder(/documents? requested over 14 days ago/));
  const fresh = (await london.ok('get', { entity: 'cases', id: k.id })).record;
  await london.save('cases', { status: 'lost', lost_reason: 'Went elsewhere' }, k.id, fresh.version);
  assert.ok(!(await reminder(/documents? requested over 14 days ago/)));
});

test('"Mine only" filters the completed column, renewals and reviews; the radar warns only about fixed rates', async () => {
  const marks = await newcastle.save('clients', { first_name: 'Marks', last_name: 'Client', adviser_id: staff.mark.id, next_review_date: daysFromNow(12) });
  await newcastle.save('cases', { client_id: marks.id, case_type: 'ftb', stage: 'completed', completion_date: daysFromNow(-5), loan_amount: 1000, adviser_id: staff.mark.id });
  await newcastle.save('policies', { client_id: marks.id, policy_type: 'home', status: 'on_risk', renewal_date: daysFromNow(10), adviser_id: staff.mark.id });
  const sarahs = await newcastle.save('clients', { first_name: 'Sarahs', last_name: 'Client', adviser_id: staff.sarah.id, next_review_date: daysFromNow(14) });
  await newcastle.save('policies', { client_id: sarahs.id, policy_type: 'home', status: 'on_risk', renewal_date: daysFromNow(11) });

  const all = await sarah.ok('pipeline');
  assert.ok(all.completed.some((k) => k.client_id === marks.id));
  const mine = await sarah.ok('pipeline', { mine: '1' });
  assert.ok(!mine.completed.some((k) => k.adviser_id !== staff.sarah.id && k.administrator_id !== staff.sarah.id), 'only my completions');

  const range = { from: daysFromNow(-1), to: daysFromNow(30) };
  const cal = (await sarah.ok('calendar', { ...range, mine: '1' })).items;
  assert.ok(!cal.some((i) => i.client_id === marks.id), 'no colleague\'s renewals or reviews');
  assert.ok(cal.some((i) => i.kind === 'review' && i.client_id === sarahs.id), 'my client\'s review');
  assert.ok(cal.some((i) => i.kind === 'renewal' && i.client_id === sarahs.id), 'my client\'s renewal with no adviser on the policy');
  const office = (await sarah.ok('calendar', range)).items;
  assert.ok(office.some((i) => i.kind === 'renewal' && i.client_id === marks.id));

  const before = (await newcastle.ok('radar')).missing_end_date;
  await newcastle.save('cases', { client_id: marks.id, case_type: 'remortgage', stage: 'completed', completion_date: '2024-01-01', rate_type: 'tracker', loan_amount: 1000 });
  assert.equal((await newcastle.ok('radar')).missing_end_date, before, 'a tracker has no fixed-rate end date to add');
  await newcastle.save('cases', { client_id: marks.id, case_type: 'remortgage', stage: 'completed', completion_date: '2024-01-01', rate_type: 'fixed', loan_amount: 1000 });
  assert.equal((await newcastle.ok('radar')).missing_end_date, before + 1);
});

test('an introducer who refers clients directly shows when they last referred', async () => {
  const intro = await newcastle.save('introducers', { name: 'Direct Only Agent' });
  await newcastle.save('clients', { first_name: 'Dee', last_name: 'Rect', introducer_id: intro.id });
  const row = (await newcastle.ok('introducerStats')).rows.find((r) => r.id === intro.id);
  assert.equal(row.referrals, 1);
  assert.ok(row.last_referral_at, 'last referral is the direct client\'s date');
});

test('reports put leads and lost cases on the UK day they happened', async () => {
  const lead = await nottingham.save('leads', { first_name: 'Early', last_name: 'Bird', phone: '07700 900601', source: 'walk_in' });
  // 00:30 on 1 October 2026 in the UK (summer time) is 23:30 UTC on 30 September.
  sql('UPDATE leads SET created_at = ? WHERE id = ?', ['2026-09-30T23:30:00Z', lead.id]);
  const walkIns = async (from, to) => {
    const row = (await nottingham.ok('reports', { from, to })).sources.find((s) => s.source === 'walk_in');
    return row ? row.leads : 0;
  };
  assert.equal(await walkIns('2026-10-01', '2026-10-31'), 1);
  assert.equal(await walkIns('2026-09-01', '2026-09-30'), 0);
  sql('UPDATE leads SET created_at = ? WHERE id = ?', ['2026-10-31T23:59:00Z', lead.id]); // 31 October, after the clocks go back
  assert.equal(await walkIns('2026-10-01', '2026-10-31'), 1);
  assert.equal(await walkIns('2026-11-01', '2026-11-30'), 0);
});

test('a task that goes overdue after the bell was opened shows as unread', async () => {
  const me = (await nottingham.ok('status')).user;
  const t = await nottingham.save('tasks', { title: 'Send Emma the KFI', due_date: daysFromNow(-1), assigned_to: me.id });
  sql('UPDATE tasks SET created_at = ? WHERE id = ?', [`${daysFromNow(-3)}T12:00:00Z`, t.id]);
  sql('UPDATE users SET notifications_seen_at = ? WHERE id = ?', [`${daysFromNow(-2)}T12:00:00Z`, me.id]);
  const item = (await nottingham.ok('notifications')).items.find((i) => i.link === `#/tasks/${t.id}`);
  assert.equal(item.kind, 'overdue');
  assert.equal(item.unread, true);
  assert.equal((await nottingham.post('notificationsSeen')).status, 200);
  assert.equal((await nottingham.ok('notifications')).items.find((i) => i.link === `#/tasks/${t.id}`).unread, false);
});

test('a backslash in search text matches only a backslash', async () => {
  await newcastle.save('clients', { first_name: 'Jack', last_name: 'Hall' });
  assert.ok((await newcastle.ok('lookup', { surname: 'Hall' })).results.some((r) => r.name === 'Jack Hall'));
  assert.deepEqual((await newcastle.ok('lookup', { surname: 'H\\all' })).results, []);
  assert.ok((await newcastle.ok('search', { q: 'Jack Hall' })).results.some((r) => r.title === 'Jack Hall'));
  assert.deepEqual((await newcastle.ok('search', { q: 'Jack H\\all' })).results, []);
  assert.deepEqual((await newcastle.ok('audit', { q: 'Jack H\\all' })).rows, []);
});
