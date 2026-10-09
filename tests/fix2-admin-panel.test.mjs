// Regression tests for the second-round website admin panel fixes (#1, #2, #3, #31). Run with: node --test tests/fix2-admin-panel.test.mjs
// Starts PHP's built-in server on a throwaway database, like tests/api.test.mjs. The browser tests drive the panel in
// Chromium with an in-memory stand-in for Firebase (nothing reaches the real Firestore) and are skipped when Playwright
// is not installed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'crm');
const PORT = 21000 + Math.floor(Math.random() * 1000);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = `${ORIGIN}/api.php`;
const PANEL = `${ORIGIN}/website-admin.php`;
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
}

/* ---------- Part 1: the page source ---------- */

const view = readFileSync(join(ROOT, 'lib', 'website-admin.view.php'), 'utf8');

test('#1/#31 every Firestore value the panel draws with innerHTML is escaped', () => {
  assert.doesNotMatch(view, /data-id="\$\{d\.id\}"/, 'document ids are escaped');
  // ${item.name}, ${item.text || ''}, ${advisor.location} ... straight into the HTML.
  const html = view.split('\n').filter((line) => !/confirm\(|showStatus\(|textContent/.test(line)).join('\n'); // plain-text uses
  const raw = html.match(/\$\{(item|advisor|member)\.\w+(\.charAt\(0\))?(\s*\|\|\s*'[^']*')?\}/g);
  assert.equal(raw, null, `unescaped: ${raw && raw.join(' ')}`);
  assert.doesNotMatch(view, /src="\$\{(imgSrc|item\.imageBase64)\}"/);
  assert.match(view, /<div class="title">\$\{mapEscape\(title\)\}<\/div>/, 'the review preview is escaped too');
});

test('#3 the panel keeps its tab in its own localStorage key, not the original admin.html one', () => {
  assert.match(view, /const TAB_STORAGE_KEY = 'map_admin_tab_crm';/);
  assert.doesNotMatch(view, /setItem\('map_admin_tab',/);
});

/* ---------- Part 2: the panel in a real browser ---------- */

let chromium = null;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(spec)); break; } catch { /* try the next place */ }
}
let browser = null;
if (chromium) {
  const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  try { browser = await chromium.launch({ executablePath }); } catch { browser = null; }
}
const skip = browser ? false : 'Playwright with Chromium is not installed';

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'map-crm-fix2-admin-'));
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], {
    env: { ...process.env, MAP_CRM_DATA_DIR: dataDir, MAP_CRM_MAIL_FILE: join(dataDir, 'mail.jsonl'), PHP_CLI_SERVER_WORKERS: '4' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}?action=status`); if (r.ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('PHP server did not start');
});
after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

// Stand-ins for the Firebase and EmailJS scripts the panel loads from the internet.
const FIREBASE_APP = 'export function initializeApp(cfg, name) { return { cfg, name }; }';
const FIRESTORE = `
export class Timestamp {
  constructor(ms) { this._ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = 0; }
  static fromDate(d) { return new Timestamp(d.getTime()); }
  static now() { return new Timestamp(Date.now()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  toDate() { return new Date(this._ms); }
  toMillis() { return this._ms; }
}
const STAMP = { serverTimestamp: true };
const revive = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v && typeof v === 'object' && '__ts' in v ? new Timestamp(v.__ts) : v]));
const resolve = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === STAMP ? Timestamp.now() : (v instanceof Date ? Timestamp.fromDate(v) : v)]));
function store() {
  if (!window.__fsStore) {
    window.__fsStore = {};
    for (const [c, docs] of Object.entries(window.__fsSeed || {})) {
      window.__fsStore[c] = {};
      for (const [id, data] of Object.entries(docs)) window.__fsStore[c][id] = revive(data);
    }
  }
  return window.__fsStore;
}
const cmp = (a, b) => { const x = a && a.toMillis ? a.toMillis() : a, y = b && b.toMillis ? b.toMillis() : b; return x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : 1; };
let n = 0;
export function getFirestore(app) { return { app }; }
export function collection(db, name) { return { name }; }
export function doc(db, coll, id) { return { coll, id }; }
export function query(c, ...cons) { return { name: c.name, cons }; }
export function orderBy(field, dir = 'asc') { return { field, dir }; }
export function serverTimestamp() { return STAMP; }
export async function getDocs(q) {
  let docs = Object.entries(store()[q.name] || {}).map(([id, data]) => ({ id, data: () => ({ ...data }) }));
  for (const c of q.cons || []) {
    docs = docs.filter((d) => d.data()[c.field] !== undefined);
    docs.sort((a, b) => cmp(a.data()[c.field], b.data()[c.field]) * (c.dir === 'desc' ? -1 : 1));
  }
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
}
export async function getDoc(r) { const d = (store()[r.coll] || {})[r.id]; return { id: r.id, exists: () => !!d, data: () => (d ? { ...d } : undefined) }; }
export async function addDoc(c, data) { const s = store(); s[c.name] = s[c.name] || {}; const id = 'mock' + (++n); s[c.name][id] = resolve(data); return { id }; }
export async function setDoc(r, data) { const s = store(); s[r.coll] = s[r.coll] || {}; s[r.coll][r.id] = resolve(data); }
export async function updateDoc(r, data) { const s = store(); if (!s[r.coll] || !s[r.coll][r.id]) throw new Error('No document to update'); Object.assign(s[r.coll][r.id], resolve(data)); }
export async function deleteDoc(r) { const s = store(); if (s[r.coll]) delete s[r.coll][r.id]; }
`;
const EMAILJS = 'window.emailjs = { init: function () {}, send: function () { return Promise.resolve({ status: 200 }); } };';

// Website data as anyone with the website's public Firebase config could write it (the panel itself writes without signing in).
const xss = (flag) => `<img src=x onerror="window.__xss.push('${flag}')">`;
const H = 3600e3, D = 24 * H, now = Date.now();
const NEWSLETTER_ID = `"><img src=x onerror="window.__xss.push('newsletter id')">`;
const ATTACK = {
  newsletterSubscribers: {
    sub1: { email: 'bob@example.com', subscribedAt: { __ts: now - D } },
    [NEWSLETTER_ID]: { email: 'eve@example.com', subscribedAt: { __ts: now - 2 * D } },
  },
  contactMessages: { c1: { name: xss('contact'), email: 'm@example.com', message: 'Hello', createdAt: { __ts: now - H } } },
  reviews: {
    r1: { name: xss('review name'), source: xss('review source'), tag: xss('review tag'), link: xss('review link'), rating: 4, approved: true, text: 'Great ' + xss('review text'), createdAt: { __ts: now - D } },
    r2: { name: 'Dave Smith', source: 'Google Reviews', link: '', rating: 5, tag: 'Remortgage', approved: true, text: 'Smooth & quick', createdAt: { __ts: now - 2 * D } },
  },
  newsItems: { n1: { title: xss('news title'), description: xss('news description'), imageBase64: `x" onerror="window.__xss.push('news image')`, published: true, createdAt: { __ts: now - D } } },
  announcements: { a1: { text: xss('announcement'), type: xss('announcement type'), enabled: true, createdAt: { __ts: now - D } } },
  searchItems: { s1: { title: xss('search title'), link: xss('search link'), cat: xss('search cat'), icon: xss('search icon'), keywords: xss('search keywords') } },
  advisors: {
    ad1: { name: 'Eldho Paul', location: 'Newcastle (Tyne & Wear)', specialty: 'Mortgage Protection', active: true, imageBase64: `x" onerror="window.__xss.push('advisor image')` },
    ad2: { name: xss('advisor name'), location: xss('advisor location'), specialty: 'Protection', active: true },
  },
  teamMembers: { t1: { name: xss('team name'), role: xss('team role'), title: 'Officer', department: xss('team department'), active: true } },
};

// Ordinary website content, for the layout tests.
const PLAIN = {
  newsletterSubscribers: { sub1: { email: 'bob@example.com', subscribedAt: { __ts: now - D } } },
  contactMessages: { c1: { name: 'Alice Brown', email: 'alice@example.com', phone: '07700 900123', contactMethods: ['email'], message: 'Please call me', createdAt: { __ts: now - H } } },
  reviews: Object.fromEntries([1, 2, 3, 4].map((i) => [`r${i}`, { name: `Customer ${i}`, source: 'Google Reviews', link: '', rating: 5, tag: 'First-time buyer', approved: true, text: 'Very helpful from start to finish.', createdAt: { __ts: now - i * D } }])),
  newsItems: Object.fromEntries([1, 2, 3].map((i) => [`n${i}`, { title: `Rates update ${i}`, description: 'What the latest Bank of England decision means for your mortgage.', published: true, createdAt: { __ts: now - i * D } }])),
  announcements: Object.fromEntries([1, 2, 3].map((i) => [`a${i}`, { text: `Office closed on bank holiday ${i}`, type: 'info', enabled: true, createdAt: { __ts: now - i * D } }])),
  searchItems: Object.fromEntries([1, 2, 3].map((i) => [`s${i}`, { title: `Calculator ${i}`, link: `calculator/c${i}.html`, cat: 'calculator', icon: '🧮', keywords: 'calc, mortgage' }])),
  advisors: { ad1: { name: 'Eldho Paul', location: 'Newcastle (Tyne & Wear)', specialty: 'Mortgage Protection', active: true } },
  teamMembers: {},
};

const admin = new Client();
let adminCookie = '';

async function panel({ width = 1280, height = 900, seed = PLAIN, before: beforeLoad } = {}) {
  if (!adminCookie) {
    await admin.login('admin');
    if ((await admin.get('status')).json.recovery_code) await admin.post('ackRecovery', {});
    adminCookie = admin.cookie.split('=')[1];
  }
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addCookies([{ name: 'map_crm_sid', value: adminCookie, url: `${ORIGIN}/` }]);
  await ctx.addInitScript(`window.__xss = []; window.__fsSeed = ${JSON.stringify(seed)};`);
  await ctx.route(/^https:\/\//, (route) => {
    const url = route.request().url();
    if (url.includes('firebase-app.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: FIREBASE_APP });
    if (url.includes('firebase-firestore.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: FIRESTORE });
    if (url.includes('emailjs')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: EMAILJS });
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  if (beforeLoad) await beforeLoad(page);
  await page.goto(PANEL);
  await page.waitForFunction(() => document.documentElement.dataset.panelReady === '1');
  // Every list is drawn while the panel connects, whichever tab is showing.
  await page.waitForFunction(() => ['newsletterList', 'reviewList', 'newsList', 'announcementList', 'searchList', 'contactList']
    .every((id) => document.querySelector(`#${id} .item`)) && document.querySelectorAll('#advisorPeopleGrid .adm-person-card').length > 20);
  page.errors = errors;
  return page;
}
const done = (page) => page.context().close();

/** Waits until a smooth scroll has finished (the scroll position stays put for a few frames). */
const settled = (page) => page.waitForFunction(() => new Promise((resolve) => {
  let last = -1, same = 0;
  const tick = () => { if (scrollY === last) { if (++same > 6) return resolve(true); } else { same = 0; last = scrollY; } requestAnimationFrame(tick); };
  tick();
}));

/** Where an element sits compared with the bottom of the sticky top bar, and whether the bar covers it. */
const placement = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel), bar = document.querySelector('.admin-topbar').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + Math.min(10, r.width / 2), r.top + Math.min(8, r.height / 2));
  return { top: Math.round(r.top), barBottom: Math.round(bar.bottom), covered: !!(hit && hit.closest('.admin-topbar')) };
}, selector);

test('#1/#31 script planted in website data never runs in the admin panel; it shows as text', { skip }, async () => {
  const page = await panel({ seed: ATTACK });
  assert.deepEqual(await page.evaluate(() => window.__xss), [], 'nothing planted ran');
  // The newsletter row keeps the document id as data, and Unsubscribe still deletes the right document.
  const ids = await page.$$eval('#newsletterList [data-action="delete"]', (b) => b.map((x) => x.dataset.id));
  assert.ok(ids.includes(NEWSLETTER_ID), 'the odd document id is kept as text');
  assert.equal(await page.locator('#newsletterList img, #reviewList img, #announcementList img, #searchList img, #contactList img').count(), 0);
  const reviews = await page.textContent('#reviewList');
  assert.ok(reviews.includes(`Great <img src=x onerror="window.__xss.push('review text')">`), 'shown as the text that was stored');
  assert.match(reviews, /Dave Smith - ★★★★★/);
  assert.match(reviews, /Smooth & quick/, 'ordinary text looks the same as before');
  assert.match(await page.textContent('#advisorPeopleGrid'), /Newcastle \(Tyne & Wear\)/);
  assert.match(await page.textContent('#searchList'), /Keywords: <img/);
  // Editing the planted review fills the live preview, which is escaped too.
  await page.click('#dashboardTabs [data-tab="reviews"]');
  await page.locator('#reviewList .item', { hasText: 'review name' }).locator('[data-action="edit"]').click();
  await page.locator('#reviewText').focus();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  assert.match(await page.textContent('#reviewPreview'), /Great <img src=x/);
  // Unsubscribe the odd id: the right document goes.
  await page.click('#dashboardTabs [data-tab="newsletter"]');
  await page.locator('#newsletterList .item', { hasText: 'eve@example.com' }).locator('[data-action="delete"]').click();
  await page.waitForFunction(() => !document.querySelector('#newsletterList').textContent.includes('eve@example.com'));
  assert.deepEqual(await page.evaluate(() => Object.keys(window.__fsStore.newsletterSubscribers)), ['sub1']);
  assert.deepEqual(await page.evaluate(() => window.__xss), []);
  assert.deepEqual(page.errors, []);
  await done(page);
});

test('#2 on a phone the top bar is one slim row and never covers a section or a form opened with Edit', { skip }, async () => {
  const page = await panel({ width: 390, height: 844 });
  const bar = await page.evaluate(() => document.querySelector('.admin-topbar').getBoundingClientRect().height);
  assert.ok(bar < 70, `one row (${bar}px)`);
  const wide = await page.evaluate(() => [...document.querySelectorAll('.admin-main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
    .map((e) => `${e.tagName}#${e.id}.${e.className}`).slice(0, 5));
  assert.deepEqual(wide, [], 'nothing pokes out sideways');
  assert.ok(await page.isVisible('#mapSignOutBtn') && await page.isVisible('#mapChangePwBtn') && await page.isVisible('#firebaseConnectionBadge'));
  // A sidebar link to a section.
  await page.click('#menuToggle');
  await page.click('.sidebar-link[data-target="review-section"]');
  await settled(page);
  let p = await placement(page, '#review-section h2');
  assert.ok(!p.covered && p.top >= p.barBottom, `section heading below the bar: ${JSON.stringify(p)}`);
  // Edit on a review, an announcement and a news article, from the bottom of the page.
  for (const [tab, list, field] of [['reviews', 'reviewList', 'reviewName'], ['announcements', 'announcementList', 'announcementText'], ['news', 'newsList', 'newsTitle']]) {
    await page.click(`#dashboardTabs [data-tab="${tab}"]`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await settled(page);
    await page.locator(`#${list} .item [data-action="edit"]`).first().click();
    await settled(page);
    p = await placement(page, `label[for="${field}"]`);
    assert.ok(!p.covered && p.top >= p.barBottom, `${tab}: first field's label below the bar: ${JSON.stringify(p)}`);
    p = await placement(page, `#${field}`);
    assert.ok(!p.covered, `${tab}: first field visible`);
  }
  // An advisor card opens the advisor form.
  await page.click('#dashboardTabs [data-tab="content"]');
  await page.locator('#advisorPeopleGrid .adm-person-card').last().scrollIntoViewIfNeeded();
  await page.locator('#advisorPeopleGrid .adm-person-card').last().click();
  await settled(page);
  p = await placement(page, '#advisorFormTitle');
  assert.ok(!p.covered && p.top >= p.barBottom, `advisor form title below the bar: ${JSON.stringify(p)}`);
  assert.deepEqual(page.errors, []);
  await done(page);
});

test('#2 on a computer, Edit and the sidebar links also land below the sticky top bar', { skip }, async () => {
  for (const width of [1280, 820]) {
    const page = await panel({ width, height: 900 });
    for (const [tab, list, field] of [['reviews', 'reviewList', 'reviewName'], ['announcements', 'announcementList', 'announcementText'], ['content', 'searchList', 'searchTitle']]) {
      await page.click(`#dashboardTabs [data-tab="${tab}"]`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await settled(page);
      await page.locator(`#${list} .item [data-action="edit"]`).first().click();
      await settled(page);
      const p = await placement(page, `label[for="${field}"]`);
      assert.ok(!p.covered && p.top >= p.barBottom, `${width}px ${tab}: label below the bar: ${JSON.stringify(p)}`);
    }
    if (width === 820) await page.click('#menuToggle');
    await page.click('.sidebar-link[data-target="announcement-section"]');
    await settled(page);
    const p = await placement(page, '#announcement-section h2');
    assert.ok(!p.covered && p.top >= p.barBottom, `${width}px section heading below the bar: ${JSON.stringify(p)}`);
    assert.deepEqual(page.errors, []);
    await done(page);
  }
});

test('#3 the panel tab is remembered in its own key; the original admin.html key is left with a tab it knows', { skip }, async () => {
  // An earlier copy of this panel left 'logins' in the original page's key.
  const page = await panel({ before: async (pg) => { await pg.goto(`${ORIGIN}/app.css`); await pg.evaluate(() => localStorage.setItem('map_admin_tab', 'logins')); } });
  const keys = () => page.evaluate(() => ({ original: localStorage.getItem('map_admin_tab'), panel: localStorage.getItem('map_admin_tab_crm') }));
  assert.equal((await keys()).original, 'content', 'put back to a tab the original page has');
  await page.click('#dashboardTabs [data-tab="connection"]');
  assert.deepEqual(await keys(), { original: 'content', panel: 'connection' });
  await page.click('#dashboardTabs [data-tab="logins"]');
  assert.deepEqual(await keys(), { original: 'content', panel: 'logins' });
  // The original page choosing a tab doesn't move this panel, and this panel still opens where it was left.
  await page.evaluate(() => localStorage.setItem('map_admin_tab', 'news'));
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.panelReady === '1');
  assert.equal(await page.getAttribute('#dashboardTabs .tab-btn.active', 'data-tab'), 'logins');
  assert.ok(await page.isVisible('#crm-requests-section'));
  assert.equal((await keys()).original, 'news', 'a tab the original page knows is left alone');
  assert.deepEqual(page.errors, []);
  await done(page);
});
