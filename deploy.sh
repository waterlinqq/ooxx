#!/usr/bin/env bash

set -euo pipefail

PROFILE="${AWS_PROFILE:-personal-water}"
BUCKET="${S3_BUCKET:-game-666290010684-ap-northeast-1-an}"

if ! aws sts get-caller-identity --profile "$PROFILE" >/dev/null 2>&1; then
  echo "AWS 尚未登入，請先執行：aws login --profile $PROFILE" >&2
  exit 1
fi

npm run build

aws s3 sync dist/ "s3://$BUCKET/" \
  --profile "$PROFILE" \
  --exclude index.html \
  --cache-control "public,max-age=31536000,immutable"

aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --profile "$PROFILE" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "no-cache"

echo "部署完成：http://$BUCKET.s3-website-ap-northeast-1.amazonaws.com/"
