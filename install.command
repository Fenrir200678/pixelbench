#!/usr/bin/env bash
# Double-click in Finder to install or repair Pixelbench. Options are passed on, see: ./install.command --help
set -euo pipefail
cd "$(dirname "$0")"

MIN_NODE=24

# Finder-started shells may lack nvm, fnm and Homebrew on PATH.
node_major() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  local version
  version="$(node -p 'process.versions.node' 2>/dev/null || true)"
  case "$version" in
    [0-9]*) echo "${version%%.*}" ;;
    *) echo 0 ;;
  esac
}

find_node() {
  [ "$(node_major)" -ge "$MIN_NODE" ] && return 0
  # nvm is a shell function from nvm.sh and selects its default version. nvm.sh does not run under set -u.
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    set +u
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
    set -u
    [ "$(node_major)" -ge "$MIN_NODE" ] && return 0
  fi
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell bash)" || true
    [ "$(node_major)" -ge "$MIN_NODE" ] && return 0
  fi
  local dir
  for dir in /opt/homebrew/bin /usr/local/bin; do
    if [ -x "$dir/node" ]; then
      case ":$PATH:" in *":$dir:"*) ;; *) PATH="$dir:$PATH" ;; esac
    fi
  done
  [ "$(node_major)" -ge "$MIN_NODE" ]
}

wait_for_enter() {
  # Like pause in install.cmd: keep the Terminal window open, but only when a person is there and asked for a run.
  [ -t 0 ] || return 0
  local arg
  for arg in "$@"; do
    case "$arg" in --yes | -y | --check | --help | -h) return 0 ;; esac
  done
  echo
  read -r -p "Press Enter to close this window. " _ || true
}

# A zip built on Windows carries no exec bit, and downloads are quarantined.
chmod +x install.command Pixelbench.command 2>/dev/null || true
find . \( -name node_modules -o -name .runtime \) -prune -o -exec xattr -d com.apple.quarantine {} + >/dev/null 2>&1 || true

if ! find_node; then
  if command -v brew >/dev/null 2>&1; then
    read -r -p "  ? Install Node.js with Homebrew now? (Y/n) " answer || answer=""
    case "$answer" in
      "" | [Yy] | [Yy][Ee][Ss]) ;;
      *)
        echo "  x Pixelbench needs Node.js $MIN_NODE or newer."
        wait_for_enter "$@"
        exit 1
        ;;
    esac
    if ! brew install node; then
      echo "  x Homebrew could not install Node.js."
      wait_for_enter "$@"
      exit 1
    fi
    hash -r
    find_node || true
  fi
  if [ "$(node_major)" -lt "$MIN_NODE" ]; then
    echo "  x Please install Node.js $MIN_NODE or newer from https://nodejs.org and run install.command again."
    wait_for_enter "$@"
    exit 1
  fi
fi

code=0
node scripts/setup.mjs "$@" || code=$?
wait_for_enter "$@"
exit "$code"
