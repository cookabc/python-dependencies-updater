#!/bin/bash

# Universe Publishing Script
# Publishes to both VS Code Marketplace (vsce) and OpenVSX (ovsx)

set -e

echo "🌌 Universe Publishing Script"
echo "============================"

# Check for environment variables (local or .env)
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env..."
    export $(grep -v '^#' .env | xargs)
fi

# Function to check tool availability
check_tool() {
    if ! command -v $1 &> /dev/null; then
        if ! npm list -g $1 &> /dev/null; then
            echo "⚠️  $1 is not installed globally or locally."
            return 1
        fi
    fi
    return 0
}

# Compile
echo "🔨 Compiling..."
npm run compile

# 1. Publish to VS Code Marketplace
echo ""
echo "📦 Publishing to VS Code Marketplace..."
if [ -z "$VSCE_PAT" ]; then
    echo "⚠️  VSCE_PAT not found. Attempting interactive login/publish..."
    npx vsce publish "$@"
else
    echo "🔑 VSCE_PAT found."
    npx vsce publish -p "$VSCE_PAT" "$@"
fi

# 2. Publish to OpenVSX
echo ""
echo "📦 Publishing to OpenVSX..."
if [ -z "$OVSX_PAT" ]; then
    echo "⚠️  OVSX_PAT not found. Attempting interactive login/publish..."
    npx ovsx publish "$@"
else
    echo "🔑 OVSX_PAT found."
    npx ovsx publish -p "$OVSX_PAT" "$@"
fi

echo ""
echo "🎉 Successfully published to the Universe (VS Code & OpenVSX)!"
