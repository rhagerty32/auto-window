#!/usr/bin/env bash
# Rebuild Auto Window and restart Raycast so a git pull actually shows up.
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
cd "$root"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  if [[ -f .nvmrc ]]; then
    nvm use
  fi
fi

if ! command -v node >/dev/null; then
  echo "Need Node 22.14+ (nvm use, then retry)." >&2
  exit 1
fi
if ! command -v swiftc >/dev/null; then
  echo "Need Xcode Command Line Tools so layout-helper can compile (xcode-select --install)." >&2
  exit 1
fi

npm install
npm run build-helper
npx ray build -e dev -I --exit-on-error

raycast_running() {
  local id="$1"
  [[ -n "$(/usr/bin/lsappinfo find "bundleid=${id}" 2>/dev/null | tr -d '[:space:]')" ]]
}

restart_bundle() {
  local id="$1"
  osascript -e "tell application id \"${id}\" to quit" >/dev/null 2>&1 || true
  for _ in $(seq 1 40); do
    if raycast_running "$id"; then
      sleep 0.25
    else
      break
    fi
  done
  open -b "$id"
}

if raycast_running "com.raycast-x.macos"; then
  restart_bundle "com.raycast-x.macos"
  echo "Restarted Raycast Beta. Auto Window is reloaded."
elif raycast_running "com.raycast.macos"; then
  restart_bundle "com.raycast.macos"
  echo "Restarted Raycast. Auto Window is reloaded."
elif [[ -d "/Applications/Raycast Beta.app" ]]; then
  open -a "Raycast Beta"
  echo "Opened Raycast Beta. Auto Window is reloaded."
else
  open -a "Raycast"
  echo "Opened Raycast. Auto Window is reloaded."
fi
