#!/bin/sh
# Klammr one-line installer for Linux and macOS. Downloads the latest release bundle for this machine from
# GitHub, checks its sha256 and runs the installer inside it; arguments are passed on to that installer
# (--help lists them). With --uninstall it fetches that release's source and runs the uninstaller instead.
#
#   curl -fsSL https://klammr.github.io/klammr/install.sh | sh
#   curl -fsSL https://klammr.github.io/klammr/install.sh | sh -s -- --hypr-bind --default-editor
#   curl -fsSL https://klammr.github.io/klammr/install.sh | sh -s -- --uninstall
#
# Environment: KLAMMR_VERSION (a release such as 0.2.0; default: the latest), KLAMMR_REPO_URL, KLAMMR_CACHE_DIR
# (the bundle is unpacked there and removed afterwards). Needs curl, tar and Node.js 18+, which only runs the
# installer. Nothing here uses sudo. All code is in functions called from the last line, so a partly
# downloaded script does nothing.
set -eu

say() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# node_ok/find_node: the same search as product/install.sh.
node_ok() {
  [ -x "$1" ] || return 1
  major=$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null) || return 1
  [ "${major:-0}" -ge 18 ] 2>/dev/null
}

find_node() {
  if command -v node >/dev/null 2>&1 && node_ok "$(command -v node)"; then
    command -v node
    return 0
  fi
  for c in \
    "$HOME/.local/share/mise/shims/node" \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    /usr/bin/node \
    "$HOME/.volta/bin/node" \
    "$HOME/.local/share/fnm/aliases/default/bin/node" \
    "$HOME/.fnm/aliases/default/bin/node" \
    "$HOME/Library/Application Support/fnm/aliases/default/bin/node" \
    "$HOME/.nvm/versions/node"/*/bin/node \
    "$HOME/.asdf/shims/node"; do
    if node_ok "$c"; then
      printf '%s\n' "$c"
      return 0
    fi
  done
  return 1
}

# fetch <url> <file> [progress]
fetch() {
  if [ -n "${3:-}" ] && [ -t 2 ]; then
    curl -fL --retry 3 --progress-bar -o "$2" "$1" || die "download failed: $1"
  else
    curl -fsSL --retry 3 -o "$2" "$1" || die "download failed: $1"
  fi
}

main() {
  uninstall=
  for arg do
    shift
    if [ "$arg" = --uninstall ]; then uninstall=1; else set -- "$@" "$arg"; fi
  done

  command -v curl >/dev/null 2>&1 || die 'curl is required'
  command -v tar >/dev/null 2>&1 || die 'tar is required'
  if ! node=$(find_node); then
    printf '%s\n' \
      'error: Node.js 18 or newer is required to run the Klammr installer (it is not needed to use Klammr).' \
      '' \
      '  macOS:        brew install node          or https://nodejs.org' \
      '  Arch/Omarchy: sudo pacman -S nodejs npm  (or: mise use -g node@lts)' \
      '  Debian/Ubuntu/Fedora: see https://nodejs.org/en/download/package-manager' \
      '' \
      'Then run this command again.' >&2
    exit 1
  fi
  # Node's platform and CPU pick the bundle: the installer checks the bundle against exactly these.
  target=$("$node" -p 'process.platform + "-" + process.arch')
  case $target in
    linux-x64 | linux-arm64) cache=${KLAMMR_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/klammr} ;;
    darwin-x64 | darwin-arm64) cache=${KLAMMR_CACHE_DIR:-$HOME/Library/Caches/klammr} ;;
    *) die "there is no Klammr build for $target (Linux and macOS on x64 or arm64; on Windows use install.ps1)" ;;
  esac

  repo=${KLAMMR_REPO_URL:-https://github.com/klammr/klammr}
  repo=${repo%/}
  version=${KLAMMR_VERSION:-}
  if [ -z "$version" ]; then
    # GitHub redirects releases/latest to releases/tag/<tag>, or to releases/ while there is none.
    latest=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$repo/releases/latest") || die "cannot reach $repo"
    case $latest in
      */releases/tag/*) version=${latest##*/releases/tag/} ;;
      *) die "no Klammr release is published at $repo/releases yet" ;;
    esac
  fi
  version=${version#v}

  # The bundle is large, so it is unpacked in the cache rather than a RAM-backed /tmp. The uninstaller is
  # small and may delete the cache directory itself, so it goes to the temp directory.
  if [ -n "$uninstall" ]; then
    work=$(mktemp -d "${TMPDIR:-/tmp}/klammr-uninstall.XXXXXX")
  else
    mkdir -p "$cache"
    work=$(mktemp -d "$cache/web-install.XXXXXX")
  fi
  trap 'rm -rf "$work"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  script=
  if [ -n "$uninstall" ]; then
    say "Klammr $version: fetching the uninstaller"
    fetch "$repo/archive/refs/tags/v$version.tar.gz" "$work/source.tar.gz"
    tar -xzf "$work/source.tar.gz" -C "$work"
    for f in "$work"/*/product/uninstall.mjs; do script=$f; done
  else
    file="Klammr-$target-$version.tar.gz"
    url="$repo/releases/download/v$version/$file"
    say "Klammr $version for $target: downloading $file"
    fetch "$url.sha256" "$work/$file.sha256"
    fetch "$url" "$work/$file" progress
    expected=$(cut -d ' ' -f 1 "$work/$file.sha256")
    actual=$("$node" -e 'const h = require("crypto").createHash("sha256"); require("fs").createReadStream(process.argv[1]).on("data", (d) => h.update(d)).on("end", () => console.log(h.digest("hex")))' "$work/$file")
    [ "$expected" = "$actual" ] || die "sha256 mismatch for $file (expected $expected, got $actual)"
    printf '    sha256 ok %s\n' "$actual"
    tar -xzf "$work/$file" -C "$work"
    rm -f "$work/$file"
    for f in "$work"/Klammr-*/install.mjs; do script=$f; done
  fi
  [ -f "$script" ] || die 'the download does not contain the Klammr installer'

  # Under `curl | sh` stdin is this script, so the installer's questions read the terminal instead.
  status=0
  if [ ! -t 0 ] && (: </dev/tty) 2>/dev/null; then
    "$node" "$script" "$@" </dev/tty || status=$?
  else
    "$node" "$script" "$@" || status=$?
  fi
  exit "$status"
}

main "$@"
