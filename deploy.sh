#!/usr/bin/env bash

set -euo pipefail

PROFILE="${AWS_PROFILE:-personal-water}"
BUCKET="${S3_BUCKET:-game-666290010684-ap-northeast-1-an}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${VITE_API_BASE:-}" ]]; then
  echo "警告：VITE_API_BASE 未設定" >&2
  echo "若使用 CloudFront 同源部署，請設 VITE_API_BASE=https://<cloudfront-domain>" >&2
  echo "執行 ./deploy/setup-cloudfront.sh 建立 CloudFront" >&2
  exit 1
fi

if [[ "${VITE_API_BASE}" == http://* ]] && [[ "${VITE_API_BASE}" != *localhost* ]]; then
  echo "注意：VITE_API_BASE 為 HTTP。若從 HTTPS 頁面（S3 直連）開啟會 Mixed Content 被擋。" >&2
  echo "請改用 CloudFront：https://<domain> 或 ./deploy/setup-cloudfront.sh" >&2
fi

if ! aws sts get-caller-identity --profile "$PROFILE" >/dev/null 2>&1; then
  echo "AWS 憑證無效，請執行：aws configure --profile $PROFILE" >&2
  exit 1
fi

echo "Build with VITE_API_BASE=$VITE_API_BASE"
VITE_API_BASE="$VITE_API_BASE" npm run build

aws s3 sync dist/ "s3://$BUCKET/" \
  --profile "$PROFILE" \
  --exclude index.html \
  --cache-control "public,max-age=31536000,immutable"

aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --profile "$PROFILE" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "no-cache"

echo "部署完成"
echo "遊戲網址（請用此 HTTPS 入口，避免 Mixed Content）："
if [[ "${VITE_API_BASE}" == https://* ]]; then
  echo "  ${VITE_API_BASE%/}"
else
  echo "  http://$BUCKET.s3-website-ap-northeast-1.amazonaws.com/  （僅 HTTP，勿用 S3 HTTPS 直連）"
  echo "  建議：./deploy/setup-cloudfront.sh 後改用 CloudFront HTTPS"
fi
