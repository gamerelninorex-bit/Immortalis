#!/bin/sh
# Hands the persistent volume to the unprivileged runtime user (the operator verifies that the campaign directories belong to the user
# that runs it), then starts the bridge as that user. It sets no secret and supplies no default for one.
set -eu
DATA="${IMMORTALIS_DATA_DIR:-/data}"
mkdir -p "$DATA/operator"
chmod 0700 "$DATA/operator"
chown -R node:node "$DATA"
export IMMORTALIS_CAMPAIGN_DIR="${IMMORTALIS_CAMPAIGN_DIR:-$DATA/campaign}"
export IMMORTALIS_OPERATOR_DIR="${IMMORTALIS_OPERATOR_DIR:-$DATA/operator}"
cd /app
if [ "$(id -u)" = "0" ]; then
  exec runuser -u node -- node --experimental-strip-types --disable-warning=ExperimentalWarning apps/phone/src/main.ts
fi
exec node --experimental-strip-types --disable-warning=ExperimentalWarning apps/phone/src/main.ts
