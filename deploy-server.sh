#!/usr/bin/env bash
# 部署後端到 EC2（rsync + docker compose prod）
# 用法：EC2_HOST=1.2.3.4 ./deploy-server.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

EC2_HOST="${EC2_HOST:?Set EC2_HOST in .env or environment}"
EC2_USER="${EC2_USER:-ec2-user}"
EC2_KEY="${EC2_KEY:-$HOME/.ssh/ooxx.pem}"
EC2_KEY="${EC2_KEY/#\~/$HOME}"
REMOTE_DIR="/opt/ooxx"

if [[ ! -f "$EC2_KEY" ]]; then
  echo "找不到 SSH key: $EC2_KEY" >&2
  exit 1
fi

SSH_OPTS=(-i "$EC2_KEY" -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh ${SSH_OPTS[*]}"

echo "→ rsync 到 ${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}"

rsync -avz --delete \
  -e "$RSYNC_SSH" \
  --exclude node_modules \
  --exclude server/node_modules \
  --exclude apps/web/dist \
  --exclude .git \
  --exclude .env \
  --exclude 'tmp-*' \
  --exclude tmptools \
  --exclude data \
  --exclude shots \
  "$ROOT/" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/"

echo "→ 安裝 Nginx 設定與 systemd"

ssh "${SSH_OPTS[@]}" "${EC2_USER}@${EC2_HOST}" bash -s << REMOTE
set -euo pipefail
cd ${REMOTE_DIR}

if [[ ! -f .env ]]; then
  echo "警告：${REMOTE_DIR}/.env 不存在，請從 .env.example 建立並設定 POSTGRES_PASSWORD"
  if [[ -f .env.example ]]; then
    cp .env.example .env
    sed -i "s/change-me-to-a-strong-password/\$(openssl rand -hex 16)/" .env 2>/dev/null || true
  fi
fi

sudo cp deploy/ec2/nginx.conf /etc/nginx/conf.d/ooxx.conf
sudo nginx -t
sudo systemctl reload nginx

sudo cp deploy/ec2/ooxx.service /etc/systemd/system/ooxx.service
sudo systemctl daemon-reload
sudo systemctl enable ooxx.service

docker compose -f docker-compose.prod.yml build server
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec -T server node src/migrate.js

echo "Health:"
curl -sf "http://127.0.0.1/health" && echo ""
REMOTE

echo ""
echo "後端部署完成：http://${EC2_HOST}/health"
echo "API: http://${EC2_HOST}/api/guest"
echo "WebSocket: ws://${EC2_HOST}/ws"
