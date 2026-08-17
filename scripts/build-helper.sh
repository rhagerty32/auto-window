#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src_dir="$root/native/layout-helper"
out="$root/assets/layout-helper"
icon="$root/assets/icon.png"

mkdir -p "$root/assets"

if [[ ! -f "$icon" ]]; then
  python3 "$root/scripts/make-icon.py" "$icon"
fi

shopt -s nullglob
sources=("$src_dir"/*.swift)
if [[ ${#sources[@]} -eq 0 ]]; then
  echo "missing swift sources in $src_dir" >&2
  exit 1
fi

swiftc -O -parse-as-library \
  -framework AppKit \
  -framework ApplicationServices \
  -o "$out" \
  "${sources[@]}"

chmod +x "$out"
echo "built $out"
