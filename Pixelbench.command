#!/usr/bin/env bash
# Starts Pixelbench and opens it in the default browser. Close this window or press Ctrl+C to stop it.
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  # nvm, fnm and Homebrew may be missing from PATH when Finder starts the shell.
  # nvm is a shell function from nvm.sh, which a Finder-started shell may not have loaded. It selects the default version.
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
  fi
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell bash)" || true
  fi
  for dir in /opt/homebrew/bin /usr/local/bin; do
    if ! command -v node >/dev/null 2>&1 && [ -x "$dir/node" ]; then
      PATH="$dir:$PATH"
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Run install.command first."
  [ -t 0 ] && read -r -p "Press Enter to close this window. " _
  exit 1
fi

# Ctrl+C goes to node as well. Bash must outlive it, so node can shut the server down cleanly.
trap ':' INT
code=0
node scripts/launch.mjs "$@" || code=$?
trap - INT
# 130 and 143 mean the user stopped it on purpose.
if [ "$code" -ne 0 ] && [ "$code" -ne 130 ] && [ "$code" -ne 143 ] && [ -t 0 ]; then
  read -r -p "Press Enter to close this window. " _ || true
fi
exit "$code"
