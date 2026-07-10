#!/usr/bin/env bash
# Pull latest code and rebuild lab containers (run on VPS as root).
set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-/opt/nexa-labs}"
BRANCH="${BRANCH:-main}"
LAB_VPS_DIR="$INSTALL_ROOT/landing/nexa-trials/marketing/lab-vps"

cd "$INSTALL_ROOT"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

cd "$LAB_VPS_DIR"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/nexa-labs}"
if [ ! -f "$INSTALL_ROOT/data/nexasource/source_values.json" ] && [ -f "$INSTALL_ROOT/landing/nexa-source-flow-demo/demo_data/source_values.json" ]; then
  cp "$INSTALL_ROOT/landing/nexa-source-flow-demo/demo_data/source_values.json" "$INSTALL_ROOT/data/nexasource/"
fi
if [ ! -d "$INSTALL_ROOT/data/nexasource/form_schemas" ] && [ -d "$INSTALL_ROOT/landing/nexa-source-flow-demo/demo_data/form_schemas" ]; then
  cp -r "$INSTALL_ROOT/landing/nexa-source-flow-demo/demo_data/form_schemas" "$INSTALL_ROOT/data/nexasource/"
fi
docker compose build
docker compose up -d

echo "OK  Updated and restarted."
docker compose ps
