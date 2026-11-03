#!/usr/bin/env bash
# Downloads scripts/setup.ts and runs it with bun. Extra args pass through (e.g. --values values.json).
set -euo pipefail
command -v bun >/dev/null || { echo "bun is required: https://bun.sh" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "${PI_CONFIG_RAW:-https://raw.githubusercontent.com/smb374/pi-config/main}/scripts/setup.ts" -o "$tmp/setup.ts"
bun "$tmp/setup.ts" "$@"
