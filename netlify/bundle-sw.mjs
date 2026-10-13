// Bundles sw-src.js (PHP 8.3 compiled to WebAssembly + the request router) into one ES-module service worker.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2]; // folder that becomes /crm/ on the site
const VERSION = process.argv[3] || 'v1';
const NM = join(HERE, 'node_modules', '@php-wasm');

const onlyPhp83 = {
  name: 'only-php-8-3',
  setup(b) {
    // Only PHP 8.3 (the "asyncify" build, which every modern browser can run) is shipped.
    b.onResolve({ filter: /^@php-wasm\/web-\d-\d$/ }, (a) => ({ path: a.path, namespace: 'phpver' }));
    b.onLoad({ filter: /.*/, namespace: 'phpver' }, (a) => ({
      contents: a.path === '@php-wasm/web-8-3'
        ? `export async function getPHPLoaderModule() { return await import(${JSON.stringify(join(NM, 'web-8-3/asyncify/php_8_3.js'))}); }
           export async function getIntlExtensionPath() { throw new Error('intl is not included in the demo'); }
           export async function jspi() { return false; }`
        : `export async function getPHPLoaderModule() { throw new Error('Only PHP 8.3 is included in the demo'); }
           export async function getIntlExtensionPath() { throw new Error('not included'); }`,
      resolveDir: HERE,
    }));
    // The intl extension's data file isn't needed.
    b.onResolve({ filter: /icu\.dat$|\.so\?url$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default "";' }));
    // Node.js-only code paths are never taken in a browser.
    b.onResolve({ filter: /^(node:)?(worker_threads|fs|path|os|crypto|child_process|url|module|util|stream|net|tls|http|https|events)$/ }, (a) => ({ path: a.path, namespace: 'nodestub' }));
    b.onLoad({ filter: /.*/, namespace: 'nodestub' }, () => ({ contents: 'export default {}; export const receiveMessageOnPort = undefined;' }));
  },
};

await build({
  entryPoints: [join(HERE, 'sw-src.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  outfile: join(OUT, 'sw.js'),
  plugins: [onlyPhp83],
  define: { 'self.MAP_DEMO_VERSION': JSON.stringify(VERSION) },
  logLevel: 'warning',
});
mkdirSync(join(OUT, '8_3_33'), { recursive: true });
copyFileSync(join(NM, 'web-8-3/asyncify/8_3_33/php_8_3.wasm'), join(OUT, '8_3_33/php_8_3.wasm'));
console.log('service worker built');
