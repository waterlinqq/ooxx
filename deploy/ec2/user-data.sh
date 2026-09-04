#!/bin/bash
# EC2 User Data — Amazon Linux 2023 ARM64 (t4g.small)
# 貼到 Launch Instance → Advanced → User data

set -euo pipefail

dnf update -y
dnf install -y docker git nginx
systemctl enable --now docker
systemctl enable nginx
usermod -aG docker ec2-user

mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-aarch64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose

mkdir -p /opt/ooxx
chown ec2-user:ec2-user /opt/ooxx

# Nginx 站點（deploy-server.sh 會覆寫設定檔）
cat > /etc/nginx/conf.d/ooxx.conf << 'NGINX'
server {
    listen 80 default_server;
    server_name _;

    location /health {
        proxy_pass http://127.0.0.1:3001/health;
        proxy_http_version 1.1;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3001/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
NGINX

systemctl start nginx || true

echo "OOXX EC2 bootstrap complete"
