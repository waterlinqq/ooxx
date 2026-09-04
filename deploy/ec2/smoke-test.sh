#!/usr/bin/env bash
# 部署後驗收：health、guest API、build 是否嵌入 VITE_API_BASE
# 用法：VITE_API_BASE=http://<EIP> ./deploy/ec2/smoke-test.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_BASE="${VITE_API_BASE:-${EC2_HOST:+http://${EC2_HOST}}}"

if [[ -z "$API_BASE" ]]; then
  echo "請設定 VITE_API_BASE 或 EC2_HOST" >&2
  exit 1
fi

API_BASE="${API_BASE%/}"
echo "Testing API: $API_BASE"

echo -n "GET /health ... "
HEALTH=$(curl -sf "${API_BASE}/health")
echo "$HEALTH"
[[ "$HEALTH" == *'"ok":true'* ]] || { echo "health check failed"; exit 1; }

echo -n "POST /api/guest ... "
GUEST=$(curl -sf -X POST "${API_BASE}/api/guest" \
  -H 'Content-Type: application/json' \
  -d '{}')
echo "ok"
[[ "$GUEST" == *'"token"'* ]] || { echo "guest response invalid: $GUEST"; exit 1; }

if [[ -f "$ROOT/dist/assets/index-"*.js ]]; then
  BUNDLE=$(ls "$ROOT/dist/assets"/index-*.js | head -1)
  echo -n "Build embeds API base ... "
  if grep -q "${API_BASE#http://}" "$BUNDLE" 2>/dev/null || grep -q "$API_BASE" "$BUNDLE"; then
    echo "ok"
  else
    echo "warn: bundle may not contain API base (rebuild with VITE_API_BASE=$API_BASE)"
  fi
fi

echo ""
echo "全部通過。手動驗收："
echo "  1. 開啟 S3 前端，建立房間"
echo "  2. 另一分頁加入房間碼完成對局"
echo "  3. Spot stop/start 後 curl ${API_BASE}/health 仍正常"
