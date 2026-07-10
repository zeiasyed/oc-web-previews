#!/usr/bin/env bash
# One-time (re-runnable) VPS bootstrap for Nexa lab demos.
# Run on Ubuntu 22.04/24.04 (Oracle Ampere A1, etc.):
#   sudo bash setup-vps.sh
#
# Env overrides:
#   INSTALL_ROOT=/opt/nexa-labs
#   REPO_URL=https://github.com/zeiasyed/oc-web-previews.git
#   BRANCH=main

set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-/opt/nexa-labs}"
REPO_URL="${REPO_URL:-https://github.com/zeiasyed/oc-web-previews.git}"
BRANCH="${BRANCH:-main}"
DATA_ROOT="${NEXA_LABS_DATA:-/opt/nexa-labs/data}"
LAB_VPS_DIR="$INSTALL_ROOT/landing/nexa-trials/marketing/lab-vps"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash setup-vps.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo ">> Installing Docker + nginx"
apt-get update -qq
apt-get install -y -qq git nginx ca-certificates curl

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker
systemctl start docker

echo ">> Syncing repo to $INSTALL_ROOT"
if [ ! -d "$INSTALL_ROOT/.git" ]; then
  if [ -d "$INSTALL_ROOT" ] && [ -n "$(ls -A "$INSTALL_ROOT" 2>/dev/null)" ]; then
    echo "!! $INSTALL_ROOT is not empty. Remove it or set INSTALL_ROOT to a fresh path."
    exit 1
  fi
  mkdir -p "$(dirname "$INSTALL_ROOT")"
  git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$INSTALL_ROOT"
else
  git -C "$INSTALL_ROOT" fetch origin "$BRANCH"
  git -C "$INSTALL_ROOT" checkout "$BRANCH"
  git -C "$INSTALL_ROOT" pull --ff-only origin "$BRANCH"
fi

if [ -f /tmp/nexa-labs.env ]; then
  cp /tmp/nexa-labs.env "$LAB_VPS_DIR/.env"
  chmod 600 "$LAB_VPS_DIR/.env"
  echo "   Applied /tmp/nexa-labs.env"
elif [ ! -f "$LAB_VPS_DIR/.env" ]; then
  echo "!! Missing $LAB_VPS_DIR/.env — copy env.example or run deploy-labs-vps.ps1 from your PC"
  cp "$LAB_VPS_DIR/env.example" "$LAB_VPS_DIR/.env"
  echo "   Edit .env and set LAB_AUTH_PASSWORD before going live."
fi

mkdir -p "$DATA_ROOT/nexadirect" "$DATA_ROOT/nexasource"
chown -R root:root "$DATA_ROOT"

cd "$LAB_VPS_DIR"

seed_demo_data() {
  local service="$1"
  local dest="$2"
  if [ -f "$dest/edc_state.sqlite" ]; then
    echo "   $service data already seeded at $dest"
    return
  fi
  echo "   Seeding $service demo_data -> $dest (first run only)"
  docker compose run --rm --no-deps "$service" tar -C /app/demo_data -cf - . | tar -C "$dest" -xf -
}

# Volume seeds can be incomplete if an early image lacked demo_data files.
ensure_nexasource_demo_files() {
  local dest="$1"
  local src="$INSTALL_ROOT/landing/nexa-source-flow-demo/demo_data"
  if [ ! -f "$dest/source_values.json" ] && [ -f "$src/source_values.json" ]; then
    echo "   Adding missing source_values.json to $dest"
    cp "$src/source_values.json" "$dest/"
  fi
  if [ ! -d "$dest/form_schemas" ] && [ -d "$src/form_schemas" ]; then
    echo "   Adding missing form_schemas to $dest"
    cp -r "$src/form_schemas" "$dest/"
  fi
}

echo ">> Building images (NexaSource may take several minutes on ARM)"
docker compose build

echo ">> Seeding persistent demo_data volumes"
seed_demo_data nexadirect "$DATA_ROOT/nexadirect"
seed_demo_data nexasource "$DATA_ROOT/nexasource"
ensure_nexasource_demo_files "$DATA_ROOT/nexasource"

echo ">> Starting containers"
docker compose up -d

echo ">> Installing edge nginx"
mkdir -p "$DATA_ROOT/client-videos"
VIDEO_SECRET_FILE="$INSTALL_ROOT/.video-origin-secret"
if [ ! -f "$VIDEO_SECRET_FILE" ]; then
  openssl rand -hex 10 > "$VIDEO_SECRET_FILE"
  chmod 600 "$VIDEO_SECRET_FILE"
fi
SECRET="$(cat "$VIDEO_SECRET_FILE")"
cat > /etc/nginx/nexa-video-auth.conf <<EOF
if (\$arg_key != "$SECRET") {
  return 403;
}
EOF
cp "$LAB_VPS_DIR/nginx-edge.conf" /etc/nginx/sites-available/nexa-labs
ln -sf /etc/nginx/sites-available/nexa-labs /etc/nginx/sites-enabled/nexa-labs
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

echo ">> Installing systemd unit"
cp "$LAB_VPS_DIR/nexa-labs.service" /etc/systemd/system/nexa-labs.service
systemctl daemon-reload
systemctl enable nexa-labs.service

PUBLIC_IP="$(curl -fsS -m 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
echo "OK  Nexa labs running on this host."
echo "    Public IP (for Cloudflare A records): $PUBLIC_IP"
echo "    Health: curl -s http://127.0.0.1:8070/health"
echo "    Update from PC: .\\deploy-labs-vps.ps1 -VpsIp $PUBLIC_IP"
echo ""
docker compose ps
