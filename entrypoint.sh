#!/bin/sh
set -eu
WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
mkdir -p "$CODEX_HOME" "$WORKSPACE_DIR"
git config --global --replace-all safe.directory "$WORKSPACE_DIR"
printf '\n╭────────────────────────────────────────╮\n│  Open Agents SDLC · iniciando runtime  │\n╰────────────────────────────────────────╯\n'
printf 'Workspace: %s\n' "$WORKSPACE_DIR"
if [ -f /codex-seed/auth.json ]; then
  cp /codex-seed/auth.json "$CODEX_HOME/auth.json"
  chmod 600 "$CODEX_HOME/auth.json"
  printf 'Codex: sessão local carregada para armazenamento temporário.\n'
else
  printf 'Codex: configure uma API key ou uma sessão OAuth para executar agentes.\n'
fi
exec "$@"
