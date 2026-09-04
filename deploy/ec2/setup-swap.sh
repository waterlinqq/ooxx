#!/usr/bin/env bash
# 在 EC2 上建立 1GB swap（可重複執行，已存在則跳過）
# 本機：ssh ec2-user@$EC2_HOST 'sudo bash -s' < deploy/ec2/setup-swap.sh

set -euo pipefail

SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE_MB="${SWAP_SIZE_MB:-1024}"

if swapon --show | grep -qF "$SWAP_FILE"; then
  echo "Swap 已啟用：$SWAP_FILE"
  swapon --show
  exit 0
fi

echo "建立 ${SWAP_SIZE_MB}MB swap：$SWAP_FILE"
fallocate -l "${SWAP_SIZE_MB}M" "$SWAP_FILE" 2>/dev/null \
  || dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$SWAP_SIZE_MB" status=progress

chmod 600 "$SWAP_FILE"
mkswap "$SWAP_FILE"
swapon "$SWAP_FILE"

if ! grep -qF "$SWAP_FILE" /etc/fstab; then
  echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
fi

# 降低 swap 使用傾向，優先保留 RAM 給 Postgres / Node
if [[ -f /etc/sysctl.d/99-ooxx-swap.conf ]]; then
  echo "sysctl 已設定"
else
  cat > /etc/sysctl.d/99-ooxx-swap.conf << 'EOF'
vm.swappiness=10
EOF
  sysctl -p /etc/sysctl.d/99-ooxx-swap.conf
fi

echo "Swap 就緒："
swapon --show
free -h
