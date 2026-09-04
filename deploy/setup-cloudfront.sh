#!/usr/bin/env bash
# 建立 CloudFront：S3 靜態 + /api /ws /health 轉 EC2（解決 Mixed Content）
# 用法：./deploy/setup-cloudfront.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROFILE="${AWS_PROFILE:-personal-water}"
REGION="${AWS_REGION:-ap-northeast-1}"
BUCKET="${S3_BUCKET:-game-666290010684-ap-northeast-1-an}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

EC2_HOST="${EC2_HOST:?Set EC2_HOST in .env}"
# CloudFront 不接受 IP 當 origin，用 nip.io 指向同一 IP
EC2_ORIGIN="${EC2_ORIGIN:-${EC2_HOST}.nip.io}"
CALLER_REF="ooxx-$(date +%s)"
OAC_NAME="ooxx-s3-oac"

echo "Bucket: $BUCKET"
echo "EC2 API origin: $EC2_HOST via ${EC2_ORIGIN}"

# Origin Access Control for S3
OAC_ID=$(aws cloudfront list-origin-access-controls --profile "$PROFILE" \
  --output text \
  --query "OriginAccessControlList.Items[?Name=='${OAC_NAME}'].Id | [0]" 2>/dev/null || echo "")
OAC_ID="${OAC_ID:-None}"
if [[ "$OAC_ID" == "None" ]]; then OAC_ID=""; fi

if [[ "$OAC_ID" == "None" || -z "$OAC_ID" ]]; then
  OAC_ID=$(aws cloudfront create-origin-access-control --profile "$PROFILE" \
    --origin-access-control-config "Name=${OAC_NAME},Description=OOXX S3 OAC,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query 'OriginAccessControl.Id' --output text)
  echo "Created OAC: $OAC_ID"
else
  echo "Using OAC: $OAC_ID"
fi

S3_DOMAIN="${BUCKET}.s3.${REGION}.amazonaws.com"
ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)

# Distribution config JSON
CONFIG=$(mktemp)
cat > "$CONFIG" << EOF
{
  "CallerReference": "${CALLER_REF}",
  "Comment": "OOXX game - S3 + EC2 API",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 2,
    "Items": [
      {
        "Id": "s3-ooxx",
        "DomainName": "${S3_DOMAIN}",
        "OriginAccessControlId": "${OAC_ID}",
        "S3OriginConfig": { "OriginAccessIdentity": "" }
      },
      {
        "Id": "ec2-api",
        "DomainName": "${EC2_ORIGIN}",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only",
          "OriginSslProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] },
          "OriginReadTimeout": 60,
          "OriginKeepaliveTimeout": 5
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-ooxx",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
    },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6"
  },
  "CacheBehaviors": {
    "Quantity": 3,
    "Items": [
      {
        "PathPattern": "/api/*",
        "TargetOriginId": "ec2-api",
        "ViewerProtocolPolicy": "https-only",
        "AllowedMethods": {
          "Quantity": 7,
          "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
          "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
        },
        "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
        "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac"
      },
      {
        "PathPattern": "/ws",
        "TargetOriginId": "ec2-api",
        "ViewerProtocolPolicy": "https-only",
        "AllowedMethods": {
          "Quantity": 2,
          "Items": ["GET", "HEAD"],
          "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
        },
        "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
        "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac"
      },
      {
        "PathPattern": "/health",
        "TargetOriginId": "ec2-api",
        "ViewerProtocolPolicy": "https-only",
        "AllowedMethods": {
          "Quantity": 2,
          "Items": ["GET", "HEAD"],
          "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
        },
        "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
      }
    ]
  },
  "ViewerCertificate": { "CloudFrontDefaultCertificate": true }
}
EOF

echo "Creating CloudFront distribution (may take a few minutes)..."
DIST_OUTPUT=$(aws cloudfront create-distribution --profile "$PROFILE" \
  --distribution-config "file://${CONFIG}" \
  --output json)
rm -f "$CONFIG"

DIST_ID=$(echo "$DIST_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['Distribution']['Id'])")
CF_DOMAIN=$(echo "$DIST_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['Distribution']['DomainName'])")

echo "Distribution ID: $DIST_ID"
echo "Domain: https://${CF_DOMAIN}"

# S3 bucket policy — allow CloudFront OAC
POLICY=$(cat << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontServicePrincipal",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET}/*",
    "Condition": {
      "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}" }
    }
  }]
}
EOF
)

aws s3api put-bucket-policy --profile "$PROFILE" --bucket "$BUCKET" --policy "$POLICY"

echo ""
echo "=== CloudFront 就緒 ==="
echo "遊戲網址：https://${CF_DOMAIN}"
echo ""
echo "請更新 .env："
echo "  VITE_API_BASE=https://${CF_DOMAIN}"
echo ""
echo "然後重新部署："
echo "  ./deploy.sh"
echo ""
echo "（請用 CloudFront 網址開遊戲，不要用 S3 HTTPS 直連）"
