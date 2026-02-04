#!/bin/bash

# Universal Publishing Script
# Usage: ./publish.sh [target]
# Targets:
#   all      - Publish to both VS Code Marketplace and OpenVSX (default)
#   vsx      - Publish to VS Code Marketplace only
#   ovsx     - Publish to OpenVSX only

TARGET=${1:-all}

set -e

echo "🚀 Publishing Script"
echo "===================="
echo "Target: $TARGET"

# Load .env if it exists
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env..."
    export $(grep -v '^#' .env | xargs)
fi

# Compile
echo "🔨 Compiling..."
npm run compile

# Function to cleanup .vsix files
cleanup() {
    echo "🧹 Cleaning up .vsix files..."
    rm -f *.vsix
}

# Trap exit to ensure cleanup happens
trap cleanup EXIT

# 1. Publish to VS Code Marketplace
if [[ "$TARGET" == "all" || "$TARGET" == "vsx" ]]; then
    echo ""
    echo "📦 Publishing to VS Code Marketplace..."
    if [ -z "$VSCE_PAT" ]; then
        echo "⚠️  VSCE_PAT not found. Attempting interactive login/publish..."
        npx vsce publish
    else
        echo "🔑 VSCE_PAT found."
        npx vsce publish -p "$VSCE_PAT"
    fi
fi

# 2. Publish to OpenVSX
if [[ "$TARGET" == "all" || "$TARGET" == "ovsx" ]]; then
    echo ""
    echo "📦 Publishing to OpenVSX..."
    if [ -z "$OVSX_PAT" ]; then
        echo "⚠️  OVSX_PAT not found. Attempting interactive login/publish..."
        npx ovsx publish
    else
        echo "🔑 OVSX_PAT found."
        npx ovsx publish -p "$OVSX_PAT"
    fi
fi

echo ""
echo "🎉 Done!"
