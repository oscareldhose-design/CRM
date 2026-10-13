// Builds ../netlify-demo: a folder you can drag onto Netlify to show the MAP CRM with sample data.
// The CRM's PHP runs in each visitor's browser (WebAssembly) inside a service worker, so no server is needed, and each
// visitor gets their own private copy of the sample data. Uses the committed code (git HEAD), not uncommitted edits.
//
//   cd netlify && npm install && npm run build      (needs Node 20+, PHP with SQLite and git on the PATH)
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'netlify-demo');
const VERSION = 'demo-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const tmp = mkdtempSync(join(tmpdir(), 'map-crm-demo-'));
const replaceOnce = (text, find, repl, what) => {
  if (text.split(find).length !== 2) throw new Error(`Could not find the place to change: ${what}`);
  return text.replace(find, repl);
};

try {
  // 1. The committed CRM.
  execFileSync('sh', ['-c', `git -C "${ROOT}" archive HEAD crm | tar -x -C "${tmp}"`]);
  const SRC = join(tmp, 'crm');
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'crm'), { recursive: true });

  // 2. Static files, with the CRM page renamed app.html (the service worker serves it at /crm/; index.html is the
  //    first-visit loader) and the demo pill added.
  for (const name of ['app.css', 'js', 'assets']) cpSync(join(SRC, name), join(OUT, 'crm', name), { recursive: true });
  const pill = readFileSync(join(HERE, 'site/crm/demo/pill.html'), 'utf8');
  let app = readFileSync(join(SRC, 'index.html'), 'utf8');
  app = app.replace(/(<link rel="stylesheet" href="app\.css[^"]*">)/, '$1\n<link rel="stylesheet" href="demo/demo.css">');
  app = replaceOnce(app, '<body>', '<body>\n' + pill, 'CRM <body>');
  writeFileSync(join(OUT, 'crm/app.html'), app);
  cpSync(join(HERE, 'site'), OUT, { recursive: true, filter: (p) => !p.endsWith('pill.html') });

  // 3. The PHP code. In the demo the website half of the admin panel doesn't connect to the live website's Firebase,
  //    so nobody can change themaap.co.uk from the demo; the CRM logins half works as normal.
  const files = {};
  const walk = (dir, rel = '') => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), rel + e.name + '/');
      else if (e.name.endsWith('.php')) files[rel + e.name] = readFileSync(join(dir, e.name), 'utf8');
    }
  };
  walk(SRC);
  let view = files['lib/website-admin.view.php'];
  view = view.replace(/const DEFAULT_FIREBASE_CONFIG = \{[\s\S]*?\};/, (m) => m.replace(/'[^']*'/g, "''"));
  view = replaceOnce(view, 'async function connectFirebase() {', `async function connectFirebase() {
			showStatus(refs.firebaseStatus, 'Demo: the website half of this panel is switched off, so the live website can\\'t be changed from the demo. CRM logins (above) work as normal.', 'info');
			setConnectionState(false, 'Demo: website off');
			// Show the built-in advisors and team (as the live panel does), without Firebase.
			[['advisorPeopleGrid', HARDCODED_EXPERT_ADVISORS, 'location', selectAdvisorCard], ['teamPeopleGrid', HARDCODED_TEAM, 'role', selectTeamCard]].forEach(([id, list, sub, select]) => {
				const grid = document.getElementById(id);
				if (!grid || grid.children.length) return;
				list.forEach((p) => {
					const card = document.createElement('div');
					card.className = 'adm-person-card';
					card.innerHTML = \`<img class="adm-person-avatar" src="\${mapEscape(p.img)}" alt="\${mapEscape(p.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
						<div class="adm-person-init" style="display:none;">\${mapEscape(p.name.charAt(0))}</div>
						<div class="adm-person-name">\${mapEscape(p.name)}</div><div class="adm-person-sub">\${mapEscape(p[sub] || '')}</div>\`;
					card.addEventListener('click', () => select(p, undefined, card));
					grid.appendChild(card);
				});
			});
			return;`, 'connectFirebase');
  view = replaceOnce(view, '</head>', '<link rel="stylesheet" href="{{CRM_BASE}}demo/demo.css">\n</head>', 'panel </head>');
  view = replaceOnce(view, '<body>', '<body>\n' + pill.replace('href="./?reset-demo"', 'href="{{CRM_BASE}}?reset-demo"'), 'panel <body>');
  files['lib/website-admin.view.php'] = view;
  // Emails can't leave a browser: say so rather than claiming one was sent.
  files['lib/admin.php'] = replaceOnce(files['lib/admin.php'], "crm_ok(['message' => 'The server sent a test email to ' . CRM_NOTIFY_EMAIL . '. Check the inbox, and the Junk folder, in the next few minutes.']);",
    "crm_ok(['message' => 'Demo: the test email to ' . CRM_NOTIFY_EMAIL . ' was prepared, but emails are switched off in the demo. On the live site it is sent for real.']);", 'test email message');

  // 4. Sample data: made by the real CRM (local PHP), exactly as on a live server.
  const data = join(tmp, 'data');
  mkdirSync(data);
  const port = 19500 + Math.floor(Math.random() * 400);
  const env = { ...process.env, MAP_CRM_DATA_DIR: data, MAP_CRM_MAIL_FILE: join(tmp, 'mail.jsonl') };
  const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', ROOT], { env, stdio: 'ignore' });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { up = (await fetch(`http://127.0.0.1:${port}/crm/api.php?action=status`)).ok; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!up) throw new Error('The local PHP server did not start');
    execFileSync('node', [join(HERE, 'seed-demo.mjs')], { env: { ...process.env, BASE: `http://127.0.0.1:${port}` }, stdio: 'inherit' });
    execFileSync('php', [join(ROOT, 'crm/api.php'), 'cron'], { env, stdio: 'ignore' });
  } finally {
    server.kill();
  }
  const cfg = readdirSync(data).find((f) => /^crm-[a-f0-9]{32}\.sqlite$/.test(f));
  execFileSync('php', ['-r', `$p = new PDO('sqlite:' . $argv[1]); $p->exec('PRAGMA wal_checkpoint(TRUNCATE)');`, join(data, cfg)]);
  const seed = {};
  for (const f of readdirSync(data)) {
    if (/-(wal|shm)$|^\.lock$/.test(f)) continue;
    seed[f] = readFileSync(join(data, f)).toString('base64');
  }
  mkdirSync(join(OUT, 'crm/demo'), { recursive: true });
  writeFileSync(join(OUT, 'crm/demo/php-files.json'), JSON.stringify({ version: VERSION, seededAt: new Date().toISOString(), files, seed }));

  // 5. The service worker with PHP 8.3 for the browser.
  execFileSync('node', [join(HERE, 'bundle-sw.mjs'), join(OUT, 'crm'), VERSION], { stdio: 'inherit' });
  console.log(`\nBuilt ${OUT} (${VERSION}). Drag the netlify-demo folder onto https://app.netlify.com/drop`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
