#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
NODE_BIN="${NODE_BIN:-}"
if [ -z "$NODE_BIN" ] && [ -x "$HOME/.local/node22/bin/node" ]; then
  NODE_BIN="$HOME/.local/node22/bin/node"
fi
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node)"
fi
exec "$NODE_BIN" node_modules/@angular/cli/bin/ng.js serve
