#!/usr/bin/env bash
# Spot EC2 無法原地改 instance type，需遷移到新機器並掛回原本 EBS
# 用法：./deploy/ec2/downsize-to-micro.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PROFILE="${AWS_PROFILE:-personal-water}"
REGION="${AWS_REGION:-ap-northeast-1}"
TARGET_TYPE="${EC2_TARGET_TYPE:-t4g.micro}"
EC2_HOST="${EC2_HOST:?Set EC2_HOST in .env}"
EC2_USER="${EC2_USER:-ec2-user}"
EC2_KEY="${EC2_KEY:-$HOME/.ssh/ooxx.pem}"
EC2_KEY="${EC2_KEY/#\~/$HOME}"
KEY_NAME="${EC2_KEY_NAME:-ooxx}"
SSH_OPTS=(-i "$EC2_KEY" -o StrictHostKeyChecking=accept-new)

wait_for_spot_stopped() {
  local instance_id="$1"
  echo "等待 Spot request 進入 instance-stopped-by-user..."
  for _ in $(seq 1 60); do
    local status
    status=$(aws ec2 describe-spot-instance-requests \
      --profile "$PROFILE" --region "$REGION" \
      --filters "Name=instance-id,Values=$instance_id" \
      --query 'SpotInstanceRequests[0].Status.Code' --output text 2>/dev/null || echo "unknown")
    if [[ "$status" == "instance-stopped-by-user" ]]; then
      return 0
    fi
    sleep 5
  done
  echo "Spot request 未在時限內就緒（status=$status）" >&2
  return 1
}

wait_for_ssh() {
  local host="$1"
  ssh-keygen -R "$host" >/dev/null 2>&1 || true
  for i in $(seq 1 60); do
    if ssh "${SSH_OPTS[@]}" -o ConnectTimeout=5 "${EC2_USER}@${host}" 'true' 2>/dev/null; then
      return 0
    fi
    echo "  SSH 尚未就緒 ($i/60)..."
    sleep 5
  done
  return 1
}

INSTANCE_ID=$(aws ec2 describe-instances \
  --profile "$PROFILE" --region "$REGION" \
  --filters "Name=ip-address,Values=$EC2_HOST" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

if [[ -z "$INSTANCE_ID" || "$INSTANCE_ID" == "None" ]]; then
  echo "找不到 IP 對應的 EC2：$EC2_HOST" >&2
  exit 1
fi

CURRENT_TYPE=$(aws ec2 describe-instances \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].InstanceType' --output text)

echo "Instance: $INSTANCE_ID"
echo "目前規格: $CURRENT_TYPE → 目標: $TARGET_TYPE"
echo ""

if [[ "$CURRENT_TYPE" == "$TARGET_TYPE" ]]; then
  echo "已是 $TARGET_TYPE，僅同步設定與 swap"
  NEED_MIGRATE=false
else
  echo "⚠️  Spot 實例無法原地改規格，將遷移到新 $TARGET_TYPE（停機約 3–5 分鐘）"
  read -r -p "繼續？[y/N] " confirm
  if [[ ! "$confirm" =~ ^[yY]$ ]]; then
    echo "已取消"
    exit 0
  fi
  NEED_MIGRATE=true
fi

echo ""
echo "→ 1/5 同步 docker-compose.prod.yml"
rsync -avz \
  -e "ssh ${SSH_OPTS[*]}" \
  "$ROOT/docker-compose.prod.yml" \
  "${EC2_USER}@${EC2_HOST}:/opt/ooxx/docker-compose.prod.yml"

ssh "${SSH_OPTS[@]}" "${EC2_USER}@${EC2_HOST}" bash -s << 'REMOTE'
set -euo pipefail
cd /opt/ooxx
docker compose -f docker-compose.prod.yml up -d
REMOTE

echo ""
echo "→ 2/5 建立 swap"
ssh "${SSH_OPTS[@]}" "${EC2_USER}@${EC2_HOST}" 'sudo bash -s' < "$ROOT/deploy/ec2/setup-swap.sh"

if [[ "$NEED_MIGRATE" != "true" ]]; then
  curl -sf "http://${EC2_HOST}/health" && echo ""
  exit 0
fi

# 收集舊機資訊
read -r VOLUME_ID SUBNET_ID SG_ID KEY_NAME AZ AMI_ID EIP_ALLOC < <(
  aws ec2 describe-instances \
    --profile "$PROFILE" --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].[
      BlockDeviceMappings[0].Ebs.VolumeId,
      SubnetId,
      SecurityGroups[0].GroupId,
      KeyName,
      Placement.AvailabilityZone,
      ImageId
    ]' --output text
)

EIP_ALLOC=$(aws ec2 describe-addresses \
  --profile "$PROFILE" --region "$REGION" \
  --filters "Name=instance-id,Values=$INSTANCE_ID" \
  --query 'Addresses[0].AllocationId' --output text)

echo ""
echo "→ 3/5 停止舊機並卸載 EBS"
echo "Volume: $VOLUME_ID | EIP: $EIP_ALLOC"

aws ec2 stop-instances \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$INSTANCE_ID" --output text >/dev/null
aws ec2 wait instance-stopped \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$INSTANCE_ID"
wait_for_spot_stopped "$INSTANCE_ID"

aws ec2 detach-volume \
  --profile "$PROFILE" --region "$REGION" \
  --volume-id "$VOLUME_ID"
aws ec2 wait volume-available \
  --profile "$PROFILE" --region "$REGION" \
  --volume-ids "$VOLUME_ID"

USER_DATA_B64=$(base64 < "$ROOT/deploy/ec2/user-data.sh" | tr -d '\n')

echo ""
echo "→ 4/5 啟動新 $TARGET_TYPE Spot 並掛回 EBS"
NEW_INSTANCE_ID=$(aws ec2 run-instances \
  --profile "$PROFILE" \
  --region "$REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$TARGET_TYPE" \
  --key-name "$KEY_NAME" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --instance-market-options '{"MarketType":"spot","SpotOptions":{"SpotInstanceType":"persistent","InstanceInterruptionBehavior":"stop"}}' \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":8,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --user-data "$USER_DATA_B64" \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ooxx-server}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "新 Instance: $NEW_INSTANCE_ID"
aws ec2 wait instance-running \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$NEW_INSTANCE_ID"

# 換成原本的資料碟
TEMP_VOLUME_ID=$(aws ec2 describe-instances \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$NEW_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' \
  --output text)

aws ec2 stop-instances \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$NEW_INSTANCE_ID" --output text >/dev/null
aws ec2 wait instance-stopped \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$NEW_INSTANCE_ID"
wait_for_spot_stopped "$NEW_INSTANCE_ID"

aws ec2 detach-volume \
  --profile "$PROFILE" --region "$REGION" \
  --volume-id "$TEMP_VOLUME_ID"
aws ec2 wait volume-available \
  --profile "$PROFILE" --region "$REGION" \
  --volume-ids "$TEMP_VOLUME_ID"

aws ec2 attach-volume \
  --profile "$PROFILE" --region "$REGION" \
  --volume-id "$VOLUME_ID" \
  --instance-id "$NEW_INSTANCE_ID" \
  --device /dev/xvda
aws ec2 wait volume-in-use \
  --profile "$PROFILE" --region "$REGION" \
  --volume-ids "$VOLUME_ID"

aws ec2 associate-address \
  --profile "$PROFILE" --region "$REGION" \
  --instance-id "$NEW_INSTANCE_ID" \
  --allocation-id "$EIP_ALLOC" >/dev/null

aws ec2 start-instances \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$NEW_INSTANCE_ID" --output text >/dev/null
aws ec2 wait instance-running \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$NEW_INSTANCE_ID"

aws ec2 delete-volume \
  --profile "$PROFILE" --region "$REGION" \
  --volume-id "$TEMP_VOLUME_ID" || true

echo ""
echo "→ 5/5 清理舊機並健康檢查"
aws ec2 terminate-instances \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$INSTANCE_ID" --output text >/dev/null

wait_for_ssh "$EC2_HOST"

ssh "${SSH_OPTS[@]}" "${EC2_USER}@${EC2_HOST}" bash -s << 'REMOTE'
set -euo pipefail
cd /opt/ooxx
docker compose -f docker-compose.prod.yml up -d
sleep 3
curl -sf http://127.0.0.1/health
REMOTE

NEW_TYPE=$(aws ec2 describe-instances \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$NEW_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].InstanceType' --output text)

echo ""
echo "=== 降規完成 ==="
echo "舊機: $INSTANCE_ID ($CURRENT_TYPE) → 已終止"
echo "新機: $NEW_INSTANCE_ID ($NEW_TYPE)"
echo "Health: http://${EC2_HOST}/health"
echo ""
ssh "${SSH_OPTS[@]}" "${EC2_USER}@${EC2_HOST}" 'free -h && echo "" && docker stats --no-stream'
