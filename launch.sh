#!/usr/bin/env bash
# Lanza EC Editorial (IA gratuita) y abre el navegador.
set -u
APP_DIR="$HOME/ec"
PORT="${PORT:-3130}"
NODE_BIN="$HOME/.local/node22/bin/node"
URL="http://localhost:${PORT}"

# 1) Ollama (si no está corriendo)
if ! curl -s --max-time 2 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  OLLAMA_MODELS="$HOME/ollama-data" nohup ollama serve >/tmp/ollama-ec.log 2>&1 &
  for i in $(seq 1 20); do
    curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break
    sleep 1
  done
fi

# 2) Servidor de la app (si no está corriendo)
if ! curl -s --max-time 2 "http://127.0.0.1:${PORT}/api/ai/status" >/dev/null 2>&1; then
  cd "$APP_DIR"
  if [ ! -f dist/server/server.mjs ]; then
    "$NODE_BIN" node_modules/@angular/cli/bin/ng.js build >/tmp/ec-build.log 2>&1
  fi
  PORT="$PORT" nohup "$NODE_BIN" dist/server/server.mjs >/tmp/ec-server.log 2>&1 &
  for i in $(seq 1 30); do
    curl -s --max-time 1 "http://127.0.0.1:${PORT}/api/ai/status" >/dev/null 2>&1 && break
    sleep 1
  done
fi

# 3) Abrir navegador
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v google-chrome >/dev/null 2>&1; then
  google-chrome "$URL" >/dev/null 2>&1 &
elif command -v firefox >/dev/null 2>&1; then
  firefox "$URL" >/dev/null 2>&1 &
fi
