// Klammr product scripts — Windows integration and its removal.
// Start Menu / desktop shortcuts (WScript.Shell through PowerShell), <install>\bin on the user PATH,
// the klammr:// URL protocol under HKCU\Software\Classes. PowerShell scripts take every path from
// KLAMMR_* environment variables (see powershell() in common.mjs); reg.exe gets plain argv.
// Only runs on a Windows host; nothing here needs elevation for the per-user install.

import fs from 'node:fs';
import path from 'node:path';
import { confirm, die, exists, have, isDir, log, powershell, removePath, run } from './common.mjs';

function shortcut(lnk, paths) {
  const r = powershell(`
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($env:KLAMMR_LNK)
$s.TargetPath = $env:KLAMMR_EXE
$s.IconLocation = "$env:KLAMMR_ICO,0"
$s.WorkingDirectory = $env:USERPROFILE
$s.Description = 'Klammr - AI code editor'
$s.Save()`, { KLAMMR_LNK: lnk, KLAMMR_EXE: paths.exe, KLAMMR_ICO: paths.ico });
  if (!r.ok) { log.warn(`could not create ${lnk}:\n${r.stderr.trim()}`); return; }
  log.ok(`shortcut ${lnk}`);
}

export function installShortcuts(paths, { desktop }) {
  fs.mkdirSync(path.dirname(paths.startMenuLnk), { recursive: true });
  shortcut(paths.startMenuLnk, paths);
  if (desktop) shortcut(paths.desktopLnk, paths);
}

// Idempotent: adds <install>\bin to the *user* Path (HKCU) and to this process for the verification step.
export function addToUserPath(paths) {
  const r = powershell(`
$dir = $env:KLAMMR_BIN
$cur = [Environment]::GetEnvironmentVariable('Path', 'User')
$parts = @()
if ($cur) { $parts = $cur -split ';' | Where-Object { $_ -ne '' } }
if ($parts -contains $dir) { Write-Output 'present'; exit 0 }
[Environment]::SetEnvironmentVariable('Path', (($parts + $dir) -join ';'), 'User')
Write-Output 'added'`, { KLAMMR_BIN: paths.binDir });
  if (!r.ok) { log.warn(`could not update the user Path:\n${r.stderr.trim()}`); return; }
  if (r.stdout.trim() === 'added') log.ok(`added ${paths.binDir} to your user Path (open a new terminal to use 'klammr')`);
  else log.ok(`${paths.binDir} already on your user Path`);
  if (!(process.env.PATH || '').split(';').includes(paths.binDir)) process.env.PATH = `${paths.binDir};${process.env.PATH || ''}`;
}

export function removeFromUserPath(paths) {
  const r = powershell(`
$dir = $env:KLAMMR_BIN
$cur = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $cur) { exit 0 }
$parts = $cur -split ';' | Where-Object { $_ -ne '' -and $_ -ne $dir }
if (($parts -join ';') -ne ($cur.TrimEnd(';'))) { [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User'); Write-Output 'removed' }`,
  { KLAMMR_BIN: paths.binDir });
  if (r.ok && r.stdout.trim() === 'removed') log.ok(`removed ${paths.binDir} from your user Path`);
}

const PROTOCOL_KEY = 'HKCU\\Software\\Classes\\klammr';

export function registerProtocol(paths) {
  if (!have('reg')) { log.warn('reg.exe not found — klammr:// protocol not registered'); return; }
  const cmds = [
    [PROTOCOL_KEY, '/ve', '/d', 'URL:Klammr Protocol', '/f'],
    [PROTOCOL_KEY, '/v', 'URL Protocol', '/d', '', '/f'],
    [`${PROTOCOL_KEY}\\DefaultIcon`, '/ve', '/d', `${paths.ico},0`, '/f'],
    [`${PROTOCOL_KEY}\\shell\\open\\command`, '/ve', '/d', `"${paths.exe}" --open-url -- "%1"`, '/f'],
  ];
  for (const args of cmds) {
    const r = run('reg', ['add', ...args]);
    if (!r.ok) { log.warn(`reg add failed (${(r.stderr || r.stdout).trim()}) — klammr:// links will not open automatically`); return; }
  }
  log.ok(`registered the klammr:// URL protocol (${PROTOCOL_KEY})`);
}

export function unregisterProtocol() {
  if (!have('reg')) return;
  const q = run('reg', ['query', `${PROTOCOL_KEY}\\shell\\open\\command`, '/ve']);
  if (!q.ok) return;
  if (!/Klammr\.exe/i.test(q.stdout)) { log.info(`${PROTOCOL_KEY} points elsewhere — left untouched`); return; }
  if (run('reg', ['delete', PROTOCOL_KEY, '/f']).ok) log.ok(`removed ${PROTOCOL_KEY}`);
}

export function klammrRunning() {
  if (!have('tasklist')) return false;
  const r = run('tasklist', ['/FI', 'IMAGENAME eq Klammr.exe', '/NH']);
  return r.ok && /Klammr\.exe/i.test(r.stdout);
}

export function uninstallWin32(paths, { yes, keepConfig, purge }, allRoots) {
  log.step('Removing Klammr');
  if (klammrRunning()) die('Klammr.exe is running — close it first, then re-run the uninstaller');
  for (const root of allRoots) {
    if (!exists(root)) continue;
    try { removePath(root); } catch (e) { log.warn(`could not remove ${root} (${e.code}) — run the uninstaller from an elevated terminal`); }
    const parent = path.dirname(root);
    if (isDir(parent)) {
      for (const n of fs.readdirSync(parent)) if (n.startsWith('Klammr.staging.') || n.startsWith('Klammr.old.')) removePath(path.join(parent, n));
    }
  }
  for (const lnk of [paths.startMenuLnk, paths.desktopLnk]) if (exists(lnk)) { fs.unlinkSync(lnk); log.ok(`removed ${lnk}`); }
  removeFromUserPath(paths);
  unregisterProtocol();

  log.step('User data');
  if (keepConfig) {
    log.info(`kept ${paths.configRoot} and ${paths.dataDir} (--keep-config)`);
  } else {
    if (!process.stdin.isTTY && !yes) log.info('no terminal to ask on — keeping settings and extensions (use --yes to delete, --keep-config to silence this)');
    const ask = (p, what) => {
      if (!exists(p)) return;
      if (confirm(`Delete ${p} (${what})?`, false, yes)) removePath(p); else log.info(`kept ${p}`);
    };
    ask(paths.configRoot, 'settings, keybindings, window state, workspace storage');
    ask(paths.dataDir, 'installed extensions, argv.json');
  }
  if (purge) removePath(paths.cacheDir, `cached download ${paths.cacheDir}`);
  else if (isDir(paths.cacheDir)) log.info(`kept the cached VSCodium download in ${paths.cacheDir} (pass --purge to delete it)`);
}
