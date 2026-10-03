// site/install.sh (the one-line installer) against a local stand-in for GitHub: the releases/latest redirect,
// release assets behind a CDN redirect and the tag's source archive. The real script runs under `sh` (dash on
// CI), with stub install.mjs / uninstall.mjs entry points that record how they were started.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'site', 'install.sh');
const TARGET = `${process.platform}-${process.arch}`;
const skip = process.platform === 'win32' && 'POSIX sh script (site/install.ps1 covers Windows)';

const stub = (name) => `import fs from 'node:fs';
fs.writeFileSync(process.env.KLAMMR_TEST_OUT, JSON.stringify({ script: '${name}', argv: process.argv.slice(2) }));
process.exit(Number(process.env.KLAMMR_TEST_EXIT || 0));
`;

let tmp;
let server;
let base;
const hits = [];

function tarGz(dir, top, out) {
  execFileSync('tar', ['-C', dir, '-czf', out, top]);
}

before(async () => {
  if (skip) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'klammr-web-install-'));
  const files = new Map(); // request path → file on disk

  // 9.9.9 is a good release; 9.9.8 publishes a .sha256 that does not match its bundle.
  for (const version of ['9.9.9', '9.9.8']) {
    const name = `Klammr-${TARGET}-${version}`;
    const dir = path.join(tmp, 'build', version);
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'install.mjs'), stub('install'));
    const archive = path.join(tmp, `${name}.tar.gz`);
    tarGz(dir, name, archive);
    const sha = version === '9.9.8' ? '0'.repeat(64) : crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    fs.writeFileSync(`${archive}.sha256`, `${sha}  ${name}.tar.gz\n`);
    files.set(`/o/klammr/releases/download/v${version}/${name}.tar.gz`, archive);
    files.set(`/o/klammr/releases/download/v${version}/${name}.tar.gz.sha256`, `${archive}.sha256`);
  }
  // GitHub's source archive for a tag unpacks to <repo>-<version without v>/.
  const src = path.join(tmp, 'build', 'source');
  fs.mkdirSync(path.join(src, 'klammr-9.9.9', 'product'), { recursive: true });
  fs.writeFileSync(path.join(src, 'klammr-9.9.9', 'product', 'uninstall.mjs'), stub('uninstall'));
  tarGz(src, 'klammr-9.9.9', path.join(tmp, 'source.tar.gz'));
  files.set('/o/klammr/archive/refs/tags/v9.9.9.tar.gz', path.join(tmp, 'source.tar.gz'));

  server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    const send = (status, headers = {}, body = '') => {
      res.writeHead(status, headers);
      res.end(body);
    };
    if (req.url === '/o/klammr/releases/latest') return send(302, { location: '/o/klammr/releases/tag/v9.9.9' });
    if (req.url === '/none/klammr/releases/latest') return send(302, { location: '/none/klammr/releases' });
    if (req.url.startsWith('/o/klammr/releases/tag/') || req.url === '/none/klammr/releases') return send(200, { 'content-type': 'text/html' }, 'ok');
    if (files.has(req.url)) return send(302, { location: `/cdn${req.url}` });
    const file = req.url.startsWith('/cdn/') && files.get(req.url.slice(4));
    if (file) return send(200, { 'content-type': 'application/octet-stream' }, fs.readFileSync(file));
    return send(404, {}, 'not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

// Runs the script; resolves with its exit code, output, what the stub recorded and what is left in the work dirs.
function run(args, env = {}) {
  const out = path.join(tmp, `out-${crypto.randomUUID()}.json`);
  const cache = path.join(tmp, 'cache');
  const temp = path.join(tmp, 'temp');
  fs.mkdirSync(temp, { recursive: true });
  return new Promise((resolve) => {
    execFile('sh', [SCRIPT, ...args], {
      env: {
        ...process.env,
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
        KLAMMR_REPO_URL: `${base}/o/klammr`,
        KLAMMR_VERSION: '',
        KLAMMR_CACHE_DIR: cache,
        TMPDIR: temp,
        KLAMMR_TEST_OUT: out,
        ...env,
      },
    }, (err, stdout, stderr) => {
      resolve({
        code: err ? err.code : 0,
        stdout,
        stderr,
        ran: fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null,
        leftovers: [cache, temp].flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d) : [])),
      });
    });
  });
}

test('installs the latest release and passes the arguments on', { skip }, async () => {
  const r = await run(['--hypr-bind', 'two words']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.ran, { script: 'install', argv: ['--hypr-bind', 'two words'] });
  assert.match(r.stdout, new RegExp(`Klammr 9\\.9\\.9 for ${TARGET}`));
  assert.match(r.stdout, /sha256 ok/);
  assert.deepEqual(r.leftovers, [], 'the unpacked bundle is removed');
});

test('KLAMMR_VERSION picks the release without looking up the latest', { skip }, async () => {
  hits.length = 0;
  const r = await run([], { KLAMMR_VERSION: 'v9.9.9' });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.ran.script, 'install');
  assert.ok(!hits.some((h) => h.includes('/releases/latest')), hits.join('\n'));
});

test('refuses a bundle whose sha256 does not match', { skip }, async () => {
  const r = await run([], { KLAMMR_VERSION: '9.9.8' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /sha256 mismatch for Klammr-.*-9\.9\.8\.tar\.gz/);
  assert.equal(r.ran, null);
  assert.deepEqual(r.leftovers, []);
});

test("exits with the installer's exit code", { skip }, async () => {
  const r = await run([], { KLAMMR_TEST_EXIT: '3' });
  assert.equal(r.code, 3);
  assert.equal(r.ran.script, 'install');
  assert.deepEqual(r.leftovers, []);
});

test('--uninstall runs the uninstaller from the release source', { skip }, async () => {
  const r = await run(['--uninstall', '--yes']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.ran, { script: 'uninstall', argv: ['--yes'] });
  assert.deepEqual(r.leftovers, []);
});

test('says so when no release is published yet', { skip }, async () => {
  const r = await run([], { KLAMMR_REPO_URL: `${base}/none/klammr` });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no Klammr release is published/);
  assert.equal(r.ran, null);
});
