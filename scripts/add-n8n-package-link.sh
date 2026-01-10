#!/usr/bin/env bash

set -e

# ===== CONFIG =====
PACKAGE_PATH="$1"              # path tới package source
PACKAGE_NAME=""                # sẽ tự đọc từ package.json
N8N_CUSTOM_DIR="$HOME/.n8n/custom"

# ===== CHECK =====
if [ -z "$PACKAGE_PATH" ]; then
  echo "❌ Usage: ./add-n8n-package-link.sh /path/to/package"
  exit 1
fi

if [ ! -f "$PACKAGE_PATH/package.json" ]; then
  echo "❌ package.json not found in $PACKAGE_PATH"
  exit 1
fi

# ===== READ PACKAGE NAME =====
PACKAGE_NAME=$(node -p "require('$PACKAGE_PATH/package.json').name")

echo "📦 Package: $PACKAGE_NAME"
echo "📁 Source : $PACKAGE_PATH"
echo "📁 n8n dir: $N8N_CUSTOM_DIR"

# ===== LINK PACKAGE =====
cd "$PACKAGE_PATH"
echo "🔗 npm link (global)"
npm link

# ===== ENSURE N8N CUSTOM DIR =====
mkdir -p "$N8N_CUSTOM_DIR"
cd "$N8N_CUSTOM_DIR"

# ===== LINK INTO N8N =====
echo "🔗 Linking package into n8n"
npm link "$PACKAGE_NAME"

echo "✅ Done!"
echo "👉 Restart n8n to load the node"