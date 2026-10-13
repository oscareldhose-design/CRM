/*
 * MAP CRM demo: runs the real CRM server code (PHP) inside the visitor's browser, so the demo works on a static host
 * such as Netlify. This service worker answers requests for api.php and website-admin.php with PHP compiled to
 * WebAssembly, and keeps each visitor's demo data in their own browser (IndexedDB). Nothing is sent to a server.
 */
import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadWebRuntime } from '@php-wasm/web';

const SCOPE = new URL('./', self.location.href).pathname; // e.g. /crm/
const DOCROOT = '/www';
const CRM_DIR = DOCROOT + SCOPE.replace(/\/$/, '');
const DATA_DIR = CRM_DIR + '/data';
const PHP_PAGES = ['api.php', 'website-admin.php'];
const IDB = 'map-crm-demo';
const VERSION = self.MAP_DEMO_VERSION || 'v1'; // a new demo build starts everyone on fresh demo data

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* ---- Tiny IndexedDB key-value store ------------------------------------------------------------- */
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDelete(key) {
  const db = await idb();
  return new Promise((resolve) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/* ---- PHP ----------------------------------------------------------------------------------------- */
let booting = null;
let cookies = {};

function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function boot() {
  const [runtime, sources] = await Promise.all([
    loadWebRuntime('8.3'),
    fetch(SCOPE + 'demo/php-files.json', { cache: 'no-cache' }).then((r) => r.json()),
  ]);
  const php = new PHP(runtime);
  await setPhpIniEntries(php, { display_errors: '0', log_errors: '1', error_log: '/tmp/php-errors.log', 'date.timezone': 'Europe/London' });
  for (const [path, content] of Object.entries(sources.files)) {
    const full = CRM_DIR + '/' + path;
    php.mkdir(full.slice(0, full.lastIndexOf('/')));
    php.writeFile(full, content);
  }
  // Emails can't be sent from a browser: the demo writes them to a file instead, so every flow carries on.
  php.writeFile(DOCROOT + '/demo-prepend.php', "<?php putenv('MAP_CRM_MAIL_FILE=/tmp/demo-mail.jsonl');");
  await setPhpIniEntries(php, { auto_prepend_file: DOCROOT + '/demo-prepend.php' });
  php.mkdir(DATA_DIR);
  const saved = await idbGet('data-' + VERSION);
  const data = saved || Object.fromEntries(Object.entries(sources.seed).map(([k, v]) => [k, b64ToBytes(v)]));
  for (const [name, bytes] of Object.entries(data)) php.writeFile(DATA_DIR + '/' + name, bytes);
  if (!saved) await moveDatesToToday(php, sources.seededAt);
  cookies = (await idbGet('cookies-' + VERSION)) || {};
  const handler = new PHPRequestHandler({ php, documentRoot: DOCROOT, absoluteUrl: self.location.origin, cookieStore: false });
  return { php, handler };
}
// The sample data was made on the day the demo was built. Moving every date forward by the days since then keeps
// "due today", "overdue" and "this week" looking current whenever the demo is opened.
async function moveDatesToToday(php, seededAt) {
  const days = Math.floor((Date.now() - Date.parse(seededAt)) / 86400000);
  if (!(days > 0)) return;
  const code = `<?php
    $cfg = include '${DATA_DIR}/config.php';
    $pdo = new PDO('sqlite:${DATA_DIR}/' . $cfg['db']);
    $n = ${days};
    $q = function ($name) { return '"' . str_replace('"', '""', $name) . '"'; };
    $day = '[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]';
    $pdo->exec('BEGIN');
    foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('settings', 'login_failures')")->fetchAll(PDO::FETCH_COLUMN) as $t) {
      foreach ($pdo->query('PRAGMA table_info(' . $q($t) . ')')->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $col = $q($c['name']);
        $pdo->exec(sprintf("UPDATE %s SET %s = date(%s, '+%d days') WHERE typeof(%s) = 'text' AND %s GLOB '%s'", $q($t), $col, $col, $n, $col, $col, $day));
        $pdo->exec(sprintf("UPDATE %s SET %s = strftime('%%Y-%%m-%%dT%%H:%%M:%%SZ', %s, '+%d days') WHERE typeof(%s) = 'text' AND %s GLOB '%s'", $q($t), $col, $col, $n, $col, $col, $day . 'T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'));
      }
    }
    $pdo->exec('COMMIT');
    echo 'moved ' . $n . ' days';`;
  const res = await php.runStream({ code });
  const [out, err] = await Promise.all([res.stdoutText, res.stderrText]);
  console.log('[demo] dates moved:', out, err);
}

function getPHP() {
  if (!booting) booting = boot().catch((e) => { booting = null; throw e; });
  return booting;
}

async function saveState(php) {
  const data = {};
  for (const name of php.listFiles(DATA_DIR)) {
    const full = DATA_DIR + '/' + name;
    if (php.isFile ? php.isFile(full) : true) {
      try { data[name] = php.readFileAsBuffer(full); } catch (e) { /* a directory or a lock file */ }
    }
  }
  await idbSet('data-' + VERSION, data);
  await idbSet('cookies-' + VERSION, cookies);
}

function rememberCookies(headers) {
  for (const line of headers['set-cookie'] || []) {
    const [pair, ...attrs] = line.split(';');
    const eq = pair.indexOf('=');
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = attrs.some((a) => /^\s*expires=/i.test(a) && Date.parse(a.split('=').slice(1).join('=')) < Date.now())
      || attrs.some((a) => /^\s*max-age=\s*-?0/i.test(a));
    if (!value || value === 'deleted' || expired) delete cookies[name];
    else cookies[name] = value;
  }
}

// One request at a time: PHP runs on a single instance.
let queue = Promise.resolve();
function runPhp(request) {
  const job = queue.then(() => handle(request));
  queue = job.catch(() => {});
  return job;
}

async function handle(request) {
  const { php, handler } = await getPHP();
  const url = new URL(request.url);
  const headers = {};
  for (const name of ['accept', 'content-type', 'x-map-crm', 'origin', 'user-agent', 'referer']) {
    const v = request.headers.get(name);
    if (v) headers[name] = v;
  }
  // A page's own address counts as its origin (browsers leave Origin off same-origin GETs).
  if (!headers.origin && request.method !== 'GET') headers.origin = self.location.origin;
  const jar = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (jar) headers.cookie = jar;
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : new Uint8Array(await request.arrayBuffer());
  const res = await handler.request({ method: request.method, url: url.pathname + url.search, headers, body });
  rememberCookies(res.headers);
  const out = new Headers();
  for (const [k, vals] of Object.entries(res.headers)) {
    if (k === 'set-cookie') continue;
    for (const v of vals) out.append(k, v);
  }
  const status = res.httpStatusCode;
  const saving = saveState(php).catch(() => {});
  if (status >= 300 && status < 400 && out.get('location')) {
    return { response: Response.redirect(new URL(out.get('location'), url).href, status === 301 ? 301 : 302), saving };
  }
  return { response: new Response(status === 204 ? null : res.bytes, { status, headers: out }), saving };
}

async function resetDemo(url) {
  await idbDelete('data-' + VERSION);
  await idbDelete('cookies-' + VERSION);
  cookies = {};
  booting = null;
  return Response.redirect(new URL(SCOPE, url).href, 302);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  const rel = url.pathname.slice(SCOPE.length);
  if (url.searchParams.has('reset-demo')) {
    event.respondWith(resetDemo(url));
    return;
  }
  // The CRM page itself (the static index.html is only the first-visit loader).
  if (event.request.mode === 'navigate' && (rel === '' || rel === 'index.html')) {
    event.respondWith(fetch(SCOPE + 'app.html', { cache: 'no-cache' }).then((r) => new Response(r.body, { status: r.status, headers: r.headers })));
    return;
  }
  if (rel.endsWith('.php')) {
    if (!PHP_PAGES.includes(rel)) {
      event.respondWith(new Response('Not found', { status: 404 }));
      return;
    }
    event.respondWith((async () => {
      try {
        const { response, saving } = await runPhp(event.request);
        event.waitUntil(saving);
        return response;
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, code: 'demo', message: 'The demo could not start: ' + (e && e.message ? e.message : e) }),
          { status: 503, headers: { 'content-type': 'application/json' } });
      }
    })());
  }
});
