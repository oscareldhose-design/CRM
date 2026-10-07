// Regression tests for the automatic rules (crm/lib/engine.php). Run with: node --test tests/fix-engine.test.mjs
// Starts PHP's built-in server on a throwaway database, like tests/api.test.mjs, and runs the rules with `php api.php cron`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
/** Runs one SQL statement straight on the test database (to set up history the API cannot create, e.g. last year's rows). */
const sql = (q, params = []) => JSON.parse(execFileSync('php', ['-r', `
  $f = glob(getenv('MAP_CRM_DATA_DIR') . '/crm-*.sqlite')[0];
  $pdo = new PDO('sqlite:' . $f, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
  $pdo->exec('PRAGMA busy_timeout = 10000');
  $st = $pdo->prepare($argv[1]);
  $st->execute(json_decode($argv[2], true));
  echo json_encode($st->columnCount() ? $st->fetchAll() : []);`, '--', q, JSON.stringify(params)], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir } }).toString());

let today;   // the server's date (Europe/London), so the tests do not trip over midnight UTC
const day = (n) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (s, m) => {
  const [y, mo, dd] = s.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo - 1 + m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo - 1 + m, Math.min(dd, last))).toISOString().slice(0, 10);
};

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fix-engine-'));
  mailFile = join(dataDir, 'mail.jsonl');
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { env: { ...process.env, MAP_CRM_DATA_DIR: dataDir, MAP_CRM_MAIL_FILE: mailFile }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}?action=status`); if (r.ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('PHP server did not start');
});
after(() => { server.kill(); rmSync(dataDir, { recursive: true, force: true }); });

const nc = new Client();
const tasksOf = async (params) => (await nc.get('list', { entity: 'tasks', status: 'all', ...params })).json.rows;
const oppsOf = async (clientId, status = 'all') => (await nc.get('opportunities', { status })).json.rows.filter((o) => o.client_id === clientId);

test('setup: office login', async () => {
  await nc.login('newcastle');
  today = (await nc.get('meta')).json.today;
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
});

test('lead import respects "Create a contact task" (off by default)', async () => {
  const rows = (tag) => [{ name: `Imp ${tag}One`, phone: `07844 4${tag}0001` }, { name: `Imp ${tag}Two`, email: `imp${tag}2@example.com` }];
  const off = await nc.post('importRows', { entity: 'leads', create_tasks: false, rows: rows('1') });
  assert.equal(off.status, 200, off.text);
  assert.equal(off.json.added, 2);
  const leadsOff = (await nc.get('list', { entity: 'leads', q: 'Imp 1' })).json.rows;
  for (const l of leadsOff) {
    assert.equal((await tasksOf({ lead_id: l.id })).length, 0, 'no contact task when the box is not ticked');
  }
  const on = await nc.post('importRows', { entity: 'leads', create_tasks: true, rows: rows('2') });
  assert.equal(on.json.added, 2);
  const leadsOn = (await nc.get('list', { entity: 'leads', q: 'Imp 2' })).json.rows;
  assert.equal(leadsOn.length, 2);
  for (const l of leadsOn) {
    assert.ok((await tasksOf({ lead_id: l.id })).some((t) => t.auto_key === `leadcontact:${l.id}`), 'contact task when ticked');
  }
});

test('a lead saved as lost or qualified gets no "Contact new lead" task; a new one does', async () => {
  const lost = await nc.save('leads', { first_name: 'Larry', last_name: 'Lost', enquiry_type: 'ftb', source: 'phone', status: 'lost', lost_reason: 'Other' });
  const qual = await nc.save('leads', { first_name: 'Quinn', last_name: 'Qualified', enquiry_type: 'ftb', source: 'phone', status: 'qualified' });
  const fresh = await nc.save('leads', { first_name: 'Nina', last_name: 'New', enquiry_type: 'ftb', source: 'phone' });
  assert.equal((await tasksOf({ lead_id: lost.id })).length, 0);
  assert.equal((await tasksOf({ lead_id: qual.id })).length, 0);
  assert.ok((await tasksOf({ lead_id: fresh.id })).some((t) => t.auto_key === `leadcontact:${fresh.id}` && t.status === 'open'));
});

test('back-dated completions: no post-completion call for old mortgages, never overdue for recent ones', async () => {
  const cl = await nc.save('clients', { first_name: 'Harry', last_name: 'Historic' });
  const old = await nc.save('cases', { client_id: cl.id, case_type: 'ftb', stage: 'completed', completion_date: '2021-12-01', fixed_term_years: 5 });
  assert.equal(old.fixed_rate_end_date, '2026-12-01');
  assert.ok(!(await tasksOf({ case_id: old.id })).some((t) => (t.auto_key || '').startsWith('postcompletion:')), 'no call for a 2021 completion');
  const recent = await nc.save('cases', { client_id: cl.id, case_type: 'remortgage', stage: 'completed', completion_date: day(-60) });
  const t1 = (await tasksOf({ case_id: recent.id })).find((t) => t.auto_key === `postcompletion:${recent.id}`);
  assert.ok(t1, 'a recent completion still gets its call');
  assert.equal(t1.due_date, today, 'due today, not 46 days overdue');
  const now = await nc.save('cases', { client_id: cl.id, case_type: 'remortgage', stage: 'completed', completion_date: today });
  assert.equal((await tasksOf({ case_id: now.id })).find((t) => t.auto_key === `postcompletion:${now.id}`).due_date, day(14));
});

test('correcting the offer date or completion date moves the dates worked out from them', async () => {
  const cl = await nc.save('clients', { first_name: 'Stan', last_name: 'Stale' });
  let k = await nc.save('cases', { client_id: cl.id, case_type: 'ftb', stage: 'valuation' });
  k = await nc.save('cases', { stage: 'offer' }, k.id, k.version);
  assert.equal(k.offer_date, today);
  assert.equal(k.offer_expiry_date, addMonths(today, 6));
  const real = day(-48);
  k = await nc.save('cases', { offer_date: real }, k.id, k.version);
  assert.equal(k.offer_expiry_date, addMonths(real, 6), 'expiry follows the corrected offer date');
  // The form sends every field back: an unchanged expiry is still "worked out", a typed one is kept.
  k = await nc.save('cases', { offer_date: day(-40), offer_expiry_date: k.offer_expiry_date }, k.id, k.version);
  assert.equal(k.offer_expiry_date, addMonths(day(-40), 6));
  k = await nc.save('cases', { offer_date: day(-30), offer_expiry_date: day(100) }, k.id, k.version);
  assert.equal(k.offer_expiry_date, day(100), 'an expiry typed in by hand is kept');

  let c = await nc.save('cases', { client_id: cl.id, case_type: 'remortgage', stage: 'completed', completion_date: '2026-06-15', fixed_term_years: 2, rate_type: 'fixed' });
  assert.equal(c.fixed_rate_end_date, '2028-06-15');
  c = await nc.save('cases', { completion_date: '2026-06-01' }, c.id, c.version);
  assert.equal(c.fixed_rate_end_date, '2028-06-01', 'follows the corrected completion date');
  c = await nc.save('cases', { fixed_term_years: 5 }, c.id, c.version);
  assert.equal(c.fixed_rate_end_date, '2031-06-01', 'and the corrected fixed term');
  c = await nc.save('cases', { fixed_rate_end_date: '2031-09-30' }, c.id, c.version);
  c = await nc.save('cases', { completion_date: '2026-06-02' }, c.id, c.version);
  assert.equal(c.fixed_rate_end_date, '2031-09-30', 'an end date typed in by hand is kept');
});

test('correcting a fixed-rate end or renewal date does not raise a second opportunity or task; deleting the case closes it', async () => {
  const cl = await nc.save('clients', { first_name: 'Rex', last_name: 'Remo' });
  let k = await nc.save('cases', { client_id: cl.id, case_type: 'ftb', stage: 'completed', completion_date: '2021-11-01', fixed_rate_end_date: day(120), lender: 'Halifax', loan_amount: 200000 });
  const pol = await nc.save('policies', { client_id: cl.id, policy_type: 'life', status: 'on_risk', renewal_date: day(20) });
  cron();
  const remTasks = async () => (await tasksOf({ case_id: k.id })).filter((t) => (t.auto_key || '').startsWith(`remortgage:${k.id}:`) && t.status === 'open');
  const renTasks = async () => (await tasksOf({ client_id: cl.id })).filter((t) => (t.auto_key || '').startsWith(`renewal:${pol.id}:`) && t.status === 'open');
  assert.equal((await oppsOf(cl.id, 'open')).filter((o) => o.type === 'remortgage').length, 1);
  assert.equal((await remTasks()).length, 1);
  assert.equal((await renTasks()).length, 1);
  const firstTask = (await remTasks())[0];

  k = await nc.save('cases', { fixed_rate_end_date: day(150) }, k.id, k.version);
  await nc.save('policies', { renewal_date: day(22) }, pol.id);
  cron();
  const open = (await oppsOf(cl.id, 'open')).filter((o) => o.type === 'remortgage');
  assert.equal(open.length, 1, 'one open remortgage opportunity');
  assert.equal(open[0].due_date, day(150));
  const rt = await remTasks();
  assert.equal(rt.length, 1, 'one open remortgage review task');
  assert.equal(rt[0].id, firstTask.id, 'the same task, moved to the new date');
  assert.equal(rt[0].auto_key, `remortgage:${k.id}:${day(150)}`);
  assert.notEqual(rt[0].title, firstTask.title, 'retitled with the new date');
  const rn = await renTasks();
  assert.equal(rn.length, 1, 'one open renewal task');
  assert.equal(rn[0].auto_key, `renewal:${pol.id}:${day(22)}`);
  cron();
  assert.equal((await remTasks()).length, 1, 'still one after another run');

  assert.equal((await nc.post('delete', { entity: 'cases', id: k.id })).status, 200);
  cron();
  assert.equal((await oppsOf(cl.id, 'open')).filter((o) => o.type === 'remortgage').length, 0, 'deleted case: opportunity closed');
  await nc.post('restore', { entity: 'cases', id: k.id });
  cron();
  assert.equal((await oppsOf(cl.id, 'open')).filter((o) => o.type === 'remortgage').length, 1, 'restored case: opportunity open again');
});

test('no remortgage opportunity or review task when a remortgage is already under way; one opened later closes both', async () => {
  const early = await nc.save('clients', { first_name: 'Paula', last_name: 'Early' });
  const old = await nc.save('cases', { client_id: early.id, case_type: 'ftb', stage: 'completed', completion_date: '2021-06-01', fixed_rate_end_date: day(150) });
  await nc.save('cases', { client_id: early.id, case_type: 'remortgage', stage: 'fact_find' });
  cron();
  assert.equal((await oppsOf(early.id)).filter((o) => o.type === 'remortgage').length, 0, 'no opportunity');
  assert.equal((await tasksOf({ case_id: old.id })).filter((t) => (t.auto_key || '').startsWith('remortgage:')).length, 0, 'no review task');

  const late = await nc.save('clients', { first_name: 'Larry', last_name: 'Late' });
  const k = await nc.save('cases', { client_id: late.id, case_type: 'ftb', stage: 'completed', completion_date: '2021-06-01', fixed_rate_end_date: day(60) });
  cron();
  assert.equal((await oppsOf(late.id, 'open')).filter((o) => o.type === 'remortgage').length, 1);
  assert.equal((await tasksOf({ case_id: k.id })).filter((t) => (t.auto_key || '').startsWith('remortgage:') && t.status === 'open').length, 1);
  await nc.save('cases', { client_id: late.id, case_type: 'product_transfer', stage: 'application' });
  cron();
  assert.equal((await oppsOf(late.id, 'open')).filter((o) => o.type === 'remortgage').length, 0, 'opportunity actioned');
  assert.equal((await tasksOf({ case_id: k.id })).filter((t) => (t.auto_key || '').startsWith('remortgage:') && t.status === 'open').length, 0, 'review task done');

  // A remortgage that completed BEFORE this mortgage is history, not a remortgage under way.
  const hist = await nc.save('clients', { first_name: 'Hilda', last_name: 'History' });
  await nc.save('cases', { client_id: hist.id, case_type: 'remortgage', stage: 'completed', completion_date: '2019-03-01' });
  await nc.save('cases', { client_id: hist.id, case_type: 'home_mover', stage: 'completed', completion_date: '2024-11-01', fixed_rate_end_date: day(90) });
  cron();
  assert.equal((await oppsOf(hist.id, 'open')).filter((o) => o.type === 'remortgage').length, 1);
});

test('protection / home insurance gaps open again when the quote is not taken up; a dismissed one stays dismissed', async () => {
  const cl = await nc.save('clients', { first_name: 'Gary', last_name: 'Gap' });
  await nc.save('cases', { client_id: cl.id, case_type: 'ftb', stage: 'completed', completion_date: day(-30) });
  cron();
  const gaps = async () => (await oppsOf(cl.id)).filter((o) => ['protection_gap', 'home_insurance'].includes(o.type));
  assert.deepEqual((await gaps()).map((o) => o.status).sort(), ['open', 'open']);
  const life = await nc.save('policies', { client_id: cl.id, policy_type: 'life', status: 'quote' });
  const home = await nc.save('policies', { client_id: cl.id, policy_type: 'home', status: 'quote' });
  cron();
  assert.deepEqual((await gaps()).map((o) => o.status).sort(), ['actioned', 'actioned'], 'quotes close the gaps');
  await nc.save('policies', { status: 'ntu' }, life.id);
  await nc.save('policies', { status: 'declined' }, home.id);
  cron();
  const reopened = await gaps();
  assert.deepEqual(reopened.map((o) => o.status).sort(), ['open', 'open'], 'no cover any more: open again');
  assert.ok(reopened.every((o) => !/resolved automatically/.test(o.detail)), 'without the "resolved" note');
  assert.equal(reopened.length, 2, 'the same opportunities, no duplicates');

  const home2 = reopened.find((o) => o.type === 'home_insurance');
  assert.equal((await nc.post('opportunityAct', { id: home2.id, action: 'dismissed' })).status, 200);
  cron();
  assert.equal((await gaps()).find((o) => o.type === 'home_insurance').status, 'dismissed', 'an adviser\'s decision stands');
});

test('documents going out of date do not undo compliance checks that were done', async () => {
  const cl = await nc.save('clients', { first_name: 'Edna', last_name: 'Expiry' });
  const k = await nc.save('cases', { client_id: cl.id, case_type: 'remortgage', stage: 'application' });
  for (const name of ['Photo ID', 'Proof of address', 'Payslips (3 months)', 'Bank statements (3 months)']) {
    await nc.save('documents', { case_id: k.id, name, status: 'received', received_at: day(-100) });
  }
  const keys = ['address_verified', 'income_evidence', 'bank_statements'];
  let ev = (await nc.get('get', { entity: 'cases', id: k.id })).json.record.compliance_eval;
  for (const key of keys) assert.ok(ev.items.find((i) => i.key === key).done, `${key} done before`);
  cron();
  const docs = (await nc.get('list', { entity: 'documents', case_id: k.id })).json.rows;
  assert.equal(docs.filter((d) => d.status === 'expired').length, 3, 'the engine marked three documents out of date');
  const rec = (await nc.get('get', { entity: 'cases', id: k.id })).json.record;
  ev = rec.compliance_eval;
  for (const key of keys) {
    const it = ev.items.find((i) => i.key === key);
    assert.ok(it.done && !it.overdue, `${key} still done`);
  }
  assert.equal(ev.items.filter((i) => i.overdue && keys.includes(i.key)).length, 0);
  assert.ok(rec.risk.reasons.includes('3 documents out of date: ask for new copies'), 'shown as a refresh warning before the offer');
  // A fresh copy received clears the warning for that document.
  await nc.save('documents', { case_id: k.id, name: 'Proof of address', status: 'received' });
  const rec2 = (await nc.get('get', { entity: 'cases', id: k.id })).json.record;
  assert.ok(rec2.risk.reasons.includes('2 documents out of date: ask for new copies'));
});

test('annual review: no second one across New Year; a corrected review date replaces the old one', async () => {
  const cl = await nc.save('clients', { first_name: 'Yvonne', last_name: 'Yearly' });
  await nc.save('cases', { client_id: cl.id, case_type: 'remortgage', stage: 'completed', completion_date: '2024-01-15' });
  const office = (await nc.get('meta')).json.office.id;
  const lastYear = String(Number(today.slice(0, 4)) - 1);
  sql(`INSERT INTO opportunities (office_id, client_id, type, title, detail, status, auto_key, created_at, updated_at)
       VALUES (?, ?, 'review_due', 'Annual review: Yvonne Yearly', 'No contact for over a year since completion.', 'open', ?, ?, ?)`,
  [office, cl.id, `review:${cl.id}:${lastYear}`, `${lastYear}-12-31T09:00:00Z`, `${lastYear}-12-31T09:00:00Z`]);
  cron();
  let reviews = (await oppsOf(cl.id)).filter((o) => o.type === 'review_due');
  assert.equal(reviews.length, 1, 'only last year\'s review');
  assert.equal(reviews[0].status, 'open');

  const c2 = await nc.save('clients', { first_name: 'Rita', last_name: 'Review', next_review_date: day(20) });
  cron();
  await nc.save('clients', { next_review_date: day(25) }, c2.id);
  cron();
  reviews = (await oppsOf(c2.id, 'open')).filter((o) => o.type === 'review_due');
  assert.equal(reviews.length, 1, 'one open review after correcting the date');
  assert.equal(reviews[0].due_date, day(25));
  await nc.save('clients', { next_review_date: day(20) }, c2.id);
  cron();
  reviews = (await oppsOf(c2.id, 'open')).filter((o) => o.type === 'review_due');
  assert.equal(reviews.length, 1, 'and back again');
  assert.equal(reviews[0].due_date, day(20));
});
