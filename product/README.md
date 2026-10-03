# `product/` — installer, uninstaller, bundle builder, desktop and Omarchy integration

Everything that turns a VSCodium release archive plus `dist/klammr.vsix` into *Klammr* on a user's machine — Linux, macOS
and Windows, x64 and arm64. One Node ≥ 18 script with zero dependencies, thin platform bootstraps around it, no sudo,
nothing written outside the user's account (unless `--system` is asked for on macOS/Windows).

```
product/
├── install.mjs              the installer: preflight → fetch+verify → extract → rebrand → swap in → integrate → seed → extension → verify
├── uninstall.mjs            reverses install.mjs per platform; asks before deleting user data
├── build-bundle.mjs         Klammr-<platform>-<arch>-<version>.tar.gz|zip = rebranded app + klammr.vsix + these scripts
├── install.sh / uninstall.sh      Linux + macOS bootstraps (POSIX sh): find Node 18+, exec the .mjs
├── install.ps1 / install.cmd      Windows bootstraps (+ uninstall.ps1 / uninstall.cmd)
├── lib/common.mjs           constants (version, pinned sha256, assets), per-platform paths, logging, prompts, run(),
│                            download + sha256, archive extraction, atomic swap, small fs helpers
├── lib/rebrand.mjs          VSCodium tree → Klammr for linux / darwin / win32 (+ describeTree for proofs)
├── lib/icons.mjs            ICNS and ICO writers (PNG payloads) + readers
├── lib/plist.mjs            minimal XML plist parser/serializer (Info.plist edits on any host)
├── lib/platform-linux.mjs   wrapper, .desktop files, hicolor icons, MIME, Omarchy hook / Hyprland bind / default editor, uninstall
├── lib/platform-darwin.mjs  ad-hoc codesign + quarantine, CLI symlinks, uninstall
├── lib/platform-win32.mjs   shortcuts (WScript.Shell via PowerShell), user Path, klammr:// registry, uninstall
├── omarchy/klammr-theme.hook  Omarchy theme-set hook (installed via `omarchy hook install theme-set`)
├── defaults/settings.json   seeded User/settings.json (JSONC, only when missing)
├── defaults/keybindings.json  seeded User/keybindings.json (empty: the extension binds everything)
├── defaults/argv.json       seeded ~/.klammr/argv.json (Linux: password-store gnome-libsecret; macOS/Windows get it without that key)
├── defaults/klammr-flags.conf  seeded ~/.config/klammr-flags.conf (Linux only)
├── icons/klammr-*.png       app icons 16…1024 px (klammr-256.png is also the extension icon); source of the ICNS/ICO
├── brand/*.svg              letterpress watermarks + mark copied over resources/app/out/media at rebrand time (from ../brand)
└── tools/keybindings-table.mjs  generates the README keybindings table from package.json
```

## What the installer produces

| | Linux | macOS | Windows |
|---|---|---|---|
| download cache | `~/.cache/klammr/VSCodium-linux-<arch>-<v>.tar.gz` | `~/Library/Caches/klammr/VSCodium-darwin-<arch>-<v>.zip` | `%LOCALAPPDATA%\klammr\cache\VSCodium-win32-<arch>-<v>.zip` |
| application | `~/.local/opt/klammr/` | `~/Applications/Klammr.app` | `%LOCALAPPDATA%\Programs\Klammr\` |
| headless CLI used by the installer | `bin/klammr` (sh) | `Contents/Resources/app/bin/klammr` (bash) | `Klammr.exe resources\app\out\cli.js` with `ELECTRON_RUN_AS_NODE=1` (what `bin\klammr.cmd` does, without cmd.exe quoting) |
| `klammr` for the user | `~/.local/bin/klammr` wrapper | symlink `~/.local/bin/klammr` (+ `/usr/local/bin` with `--system`) | `bin\klammr.cmd` through the user `Path` |
| user data | `~/.config/Klammr/User/` | `~/Library/Application Support/Klammr/User/` | `%APPDATA%\Klammr\User\` |
| extensions + argv.json | `~/.klammr/` | `~/.klammr/` | `%USERPROFILE%\.klammr\` |
| desktop | `klammr.desktop`, `klammr-url-handler.desktop`, hicolor icons, `mime/packages/klammr.xml` + two `mimeapps.list` defaults | LaunchServices (bundle in `~/Applications`), `klammr://` from `Info.plist` | `Start Menu\Programs\Klammr.lnk` (`--desktop-shortcut` too), `HKCU\Software\Classes\klammr` |
| integrity | — | `codesign --force --deep --sign - Klammr.app`, `xattr -dr com.apple.quarantine` | `rcedit --set-icon` only if `rcedit` is on PATH |
| marker | `klammr-install.json` in the app root | `Contents/Resources/klammr-install.json` | `klammr-install.json` in the app root |
| Omarchy (optional) | hook in `~/.config/omarchy/hooks/theme-set.d/`, `--hypr-bind` line in `~/.config/hypr/bindings.lua`, `--default-editor` → `~/.local/state/omarchy/defaults/editor` | — | — |

The installer verifies the result: `<cli> --version` must print the VSCodium version and `product.json`'s `nameShort`
must be `Klammr`. Re-runs upgrade the application directory (atomic rename, stale `*.staging.*`/`*.old.*` cleaned up),
rewrite launchers/shortcuts, and keep every seeded user file that already exists.

### The rebrand (`lib/rebrand.mjs`)

**All platforms — `resources/app/product.json`:** `nameShort`, `nameLong` → `Klammr`; `applicationName` → `klammr`;
`dataFolderName` → `.klammr`; `sharedDataFolderName` → `.klammr-shared`; `urlProtocol` → `klammr`;
`serverApplicationName`/`serverDataFolderName`/`tunnelApplicationName` → `klammr-server`/`.klammr-server`/`klammr-tunnel`;
`linuxIconName` → `klammr`; `win32DirName`/`win32NameVersion`/`win32ShellNameShort`/`win32RegValueName` → `Klammr`;
`win32MutexName` → `klammr`; `win32AppUserModelId` → `Klammr.Klammr`; `win32TunnelServiceMutex`/`win32TunnelMutex`;
`darwinBundleIdentifier` → `com.klammr.editor`; `updateUrl`/`downloadUrl` (present in the macOS/Windows builds) removed.
With `KLAMMR_REPO_URL` set, the Help-menu URLs point at that repository, otherwise they are deleted (VS Code hides the
entries). **Untouched:** `version`, `commit`, `quality`, `date`, `checksums` (so the "installation is corrupt" check
stays green), `extensionsGallery` (Open VSX), `builtInExtensions`, API proposals. `package.json`: `name` → `Klammr`,
`desktopName` → `klammr.desktop` (Wayland `app_id` / X11 `WM_CLASS`).

**Linux** (tarball, no top-level dir): `codium` → `klammr`, `bin/codium` → `bin/klammr` with
`ELECTRON="$VSCODE_PATH/klammr"` (the patch aborts if that anchor is missing), `which -a 'klammr'`, the `/usr/share/codium`
fallback → `$HOME/.local/opt/klammr`, messages; `bin/codium-tunnel` → `bin/klammr-tunnel`; `resources/app/resources/linux/code.png`
replaced; bash/zsh completions renamed.

**macOS** (`VSCodium.app` → `Klammr.app`): `Contents/Info.plist` — `CFBundleName`, `CFBundleDisplayName` → `Klammr`,
`CFBundleIdentifier` → `com.klammr.editor`, `CFBundleIconFile` → `Klammr.icns`, `CFBundleIconName`, HelpBook names,
`CFBundleURLTypes[0]` name/scheme → `Klammr`/`klammr`, "VSCodium document" type name. `CFBundleExecutable` stays
`VSCodium` (`Contents/MacOS/VSCodium`) so the helper apps and launcher keep working. `Contents/Resources/Klammr.icns` is
generated from `icons/klammr-*.png` (ICNS with PNG payloads: `ic11` 32, `ic12` 64, `ic07` 128, `ic08`/`ic13` 256,
`ic09`/`ic14` 512, `ic10` 1024) and `VSCodium.icns` removed. `Contents/Resources/app/bin/codium` → `bin/klammr` (it
resolves the bundle from its own path; only `which -a 'klammr'` changes), `bin/codium-tunnel` → `bin/klammr-tunnel`.
Signing happens on the Mac at install time.

**Windows** (portable zip): `VSCodium.exe` → `Klammr.exe`; `bin\codium.cmd` → `bin\klammr.cmd` (CRLF kept,
`"%~dp0..\Klammr.exe"`); `bin\codium` → `bin\klammr` (`NAME="Klammr"`, `APP_NAME="klammr"`);
`bin\codium-tunnel.exe` → `bin\klammr-tunnel.exe`; `Klammr.ico` (ICO with PNG entries 16/24/32/48/64/128/256) next to
the exe; `VSCodium.VisualElementsManifest.xml` → `Klammr.VisualElementsManifest.xml` (`ShortDisplayName="Klammr"`, tile
PNGs replaced).

### The theme hook

`omarchy/klammr-theme.hook` is a parametrised copy of `omarchy-theme-set-vscode`'s `set_theme` for the Klammr paths
(`KLAMMR_SETTINGS`, `KLAMMR_EXTENSIONS`, `KLAMMR_CLI` overridable). Omarchy calls it after `omarchy theme set` with the
snake-cased theme name. Decision order: `~/.local/state/omarchy/current/theme/vscode.json` (`{name, extension}` — the
extension is installed from Open VSX if missing, the name validated before it is written) → generated
`vscode-theme.json` (registered as the local extension `local.omarchy-theme` in `~/.klammr/extensions/extensions.json`,
theme *Omarchy*) → fallback *Klammr Dark*. `workbench.colorTheme` is edited in place with `sed` because `settings.json`
is JSONC. Exit 0 when Klammr is not installed; honours `~/.local/state/omarchy/toggles/skip-klammr-theme-changes`.

## `uninstall.mjs`

Linux: application tree (+ stale staging dirs), wrapper, desktop entries, icons, MIME package and the two `mimeapps.list`
defaults, the hook, the tagged Hyprland binding (reloads Hyprland when running), the default-editor file if it says
`klammr`. macOS: `~/Applications/Klammr.app` and `/Applications/Klammr.app` (when writable), the two symlinks if they
point into a `Klammr.app`. Windows: both install locations (when writable), shortcuts, the `Path` entry, the
`HKCU\Software\Classes\klammr` key (only if its command points at `Klammr.exe`). Then asks (TTY) about the user data
directory, `~/.klammr` and the Linux flags file; `--yes` deletes them, `--keep-config` keeps them silently, `--purge`
also deletes the download cache. Without a TTY and without flags the user data is kept.

## Bundles and releases

`node product/build-bundle.mjs --platform <p> --arch <a>` runs `install.mjs --stage-only` for that target (so any host can
build any target — the Linux box builds the macOS and Windows bundles), then packs `app/` (`app/Klammr.app` on macOS),
`klammr.vsix`, `INSTALL.txt`, `LICENSE` and this directory's scripts into `dist/bundles/Klammr-<p>-<a>-<v>.tar.gz` (`.zip`
for Windows) plus a `.sha256`. `install.mjs` detects `app/` and `klammr.vsix` next to itself and installs from them
without downloading (`--from <dir>` does the same explicitly). `.github/workflows/release.yml` builds all six on a `v*` tag.

## Testing without touching your real home

```bash
# Rebrand only, for a foreign platform (download goes to KLAMMR_CACHE_DIR, nothing is installed):
KLAMMR_CACHE_DIR=/tmp/kc node product/install.mjs --stage-only /tmp/stage-mac --platform darwin --arch arm64
KLAMMR_CACHE_DIR=/tmp/kc node product/install.mjs --stage-only /tmp/stage-win --platform win32 --arch x64

# Full Linux install + uninstall under a fake HOME (reuses your cached tarball):
T=$(mktemp -d)
env -u HYPRLAND_INSTANCE_SIGNATURE HOME="$T" XDG_CONFIG_HOME="$T/.config" XDG_DATA_HOME="$T/.local/share" \
    XDG_CACHE_HOME="$T/.cache" XDG_STATE_HOME="$T/.local/state" KLAMMR_CACHE_DIR="$HOME/.cache/klammr" \
    bash product/install.sh --no-omarchy
HOME="$T" XDG_CONFIG_HOME="$T/.config" "$T/.local/bin/klammr" --version          # headless CLI, no window
env HOME="$T" XDG_CONFIG_HOME="$T/.config" XDG_DATA_HOME="$T/.local/share" KLAMMR_CACHE_DIR="$T/.cache/klammr" \
    bash product/uninstall.sh --yes --purge
rm -rf "$T"
```

Override `XDG_*` as well as `HOME`: many sessions export them, and the scripts honour them. Unset
`HYPRLAND_INSTANCE_SIGNATURE` so `--hypr-bind` edits the fake `bindings.lua` without reloading your live compositor.
Point `KLAMMR_CACHE_DIR` at a throw-away directory before testing `--purge`. The macOS signing / symlink and the
Windows shortcut / Path / registry steps only run on their own OS; `--stage-only` reports them as not executed.

## Bumping VSCodium

Change `VSCODIUM_PINNED_VERSION` and `PINNED_SHA256['linux-x64']` in `lib/common.mjs` (the hash is in the `.sha256` file
next to the release asset on GitHub; the other assets are verified against their published sidecars), re-run the three
`--stage-only` targets and the fake-home test above, and check the launcher diffs still show only the expected lines —
the rebrand aborts loudly if an anchor it patches (`ELECTRON=` line, `VSCodium.exe` in `codium.cmd`, `CFBundleURLTypes`)
disappears.
