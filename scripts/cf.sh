#!/bin/sh
# 读取 Cloudflare 凭据后运行 wrangler，例如：sh scripts/cf.sh whoami
# 凭据文件不在项目里，不会进 git；可用 CF_ENV_FILE 指定其他路径。
set -e
ENV_FILE="${CF_ENV_FILE:-$HOME/.config/cloudflare/up-learn.env}"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
elif [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "缺少 Cloudflare 凭据：请创建 $ENV_FILE" >&2
  exit 1
fi
cd "$(dirname "$0")/.."
exec npx wrangler "$@"
