#!/bin/bash
set -ex

ENV_FILE=".env"

if [ -f "$ENV_FILE" ]; then
  echo "⚠️  $ENV_FILE already exists. Skipping."
  exit 0
fi

# Generate a random 32-character hex string
RANDOM_PASS=$(openssl rand -hex 16)

cat <<EOT >> "$ENV_FILE"
POSTGRES_USER=where2go
POSTGRES_PASSWORD=$RANDOM_PASS
POSTGRES_DB=where2go
EOT

echo "$ENV_FILE created with a random POSTGRES_PASSWORD."
