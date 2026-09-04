#!/usr/bin/env bash
# 一次性建立 EC2 Spot + Security Group + Elastic IP（ap-northeast-1）
# 用法：MY_IP=$(curl -s https://checkip.amazonaws.com) ./deploy/ec2/create-aws-resources.sh

set -euo pipefail

PROFILE="${AWS_PROFILE:-personal-water}"
REGION="${AWS_REGION:-ap-northeast-1}"
KEY_NAME="${EC2_KEY_NAME:-ooxx}"
SG_NAME="${EC2_SG_NAME:-ooxx-server-sg}"
INSTANCE_TYPE="${EC2_INSTANCE_TYPE:-t4g.micro}"
MY_IP="${MY_IP:-$(curl -s https://checkip.amazonaws.com)}"

if ! aws ec2 describe-key-pairs --profile "$PROFILE" --region "$REGION" \
  --key-names "$KEY_NAME" >/dev/null 2>&1; then
  echo "Key pair '$KEY_NAME' 不存在。請先在 EC2 建立 key pair，或：" >&2
  echo "  EC2_KEY_NAME=your-key ./deploy/ec2/create-aws-resources.sh" >&2
  exit 1
fi

echo "Region: $REGION"
echo "Your IP: $MY_IP"

# Amazon Linux 2023 ARM64
AMI_ID=$(aws ec2 describe-images \
  --profile "$PROFILE" \
  --region "$REGION" \
  --owners amazon \
  --filters "Name=name,Values=al2023-ami-2023*-kernel-6.*-arm64" "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)

echo "AMI: $AMI_ID"

VPC_ID=$(aws ec2 describe-vpcs \
  --profile "$PROFILE" \
  --region "$REGION" \
  --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' \
  --output text)

SG_ID=$(aws ec2 describe-security-groups \
  --profile "$PROFILE" \
  --region "$REGION" \
  --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null || echo "None")

if [[ "$SG_ID" == "None" || -z "$SG_ID" ]]; then
  SG_ID=$(aws ec2 create-security-group \
    --profile "$PROFILE" \
    --region "$REGION" \
    --group-name "$SG_NAME" \
    --description "OOXX game server" \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' \
    --output text)

  aws ec2 authorize-security-group-ingress --profile "$PROFILE" --region "$REGION" \
    --group-id "$SG_ID" --protocol tcp --port 22 --cidr "${MY_IP}/32"
  aws ec2 authorize-security-group-ingress --profile "$PROFILE" --region "$REGION" \
    --group-id "$SG_ID" --protocol tcp --port 80 --cidr "0.0.0.0/0"

  echo "Created SG: $SG_ID"
else
  echo "Using existing SG: $SG_ID"
fi

USER_DATA_FILE="$(dirname "$0")/user-data.sh"
USER_DATA_B64=$(base64 < "$USER_DATA_FILE" | tr -d '\n')

INSTANCE_ID=$(aws ec2 run-instances \
  --profile "$PROFILE" \
  --region "$REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --instance-market-options '{"MarketType":"spot","SpotOptions":{"SpotInstanceType":"persistent","InstanceInterruptionBehavior":"stop"}}' \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3","DeleteOnTermination":false}}]' \
  --user-data "$USER_DATA_B64" \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ooxx-server}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance: $INSTANCE_ID (waiting for running...)"
aws ec2 wait instance-running --profile "$PROFILE" --region "$REGION" --instance-ids "$INSTANCE_ID"

EIP_ALLOC=$(aws ec2 allocate-address \
  --profile "$PROFILE" \
  --region "$REGION" \
  --domain vpc \
  --query 'AllocationId' \
  --output text)

aws ec2 associate-address \
  --profile "$PROFILE" \
  --region "$REGION" \
  --instance-id "$INSTANCE_ID" \
  --allocation-id "$EIP_ALLOC" >/dev/null

PUBLIC_IP=$(aws ec2 describe-addresses \
  --profile "$PROFILE" \
  --region "$REGION" \
  --allocation-ids "$EIP_ALLOC" \
  --query 'Addresses[0].PublicIp' \
  --output text)

echo ""
echo "=== EC2 就緒 ==="
echo "Instance ID: $INSTANCE_ID"
echo "Elastic IP:  $PUBLIC_IP"
echo "SSH:         ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@${PUBLIC_IP}"
echo ""
echo "下一步："
echo "  export EC2_HOST=${PUBLIC_IP}"
echo "  export VITE_API_BASE=http://${PUBLIC_IP}"
echo "  ./deploy-server.sh"
echo "  ./deploy.sh"
