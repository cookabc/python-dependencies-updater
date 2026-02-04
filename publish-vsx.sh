#!/bin/bash

# VS Code Marketplace Publishing Script
# Usage: ./publish-vsx.sh

set -e

echo "🚀 VS Code Marketplace Publishing Script"
echo "========================================"

# Check for environment variables (local or .env)
# Load .env if it exists
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env..."
    export $(grep -v '^#' .env | xargs)
fi

# Compile project
echo "🔨 Compiling TypeScript..."
npm run compile

# Check for icon file
if [ ! -f "icon.png" ]; then
    echo "⚠️  Warning: No icon.png found."
else
    echo "✅ Icon file found: icon.png"
fi

echo "📋 Current package info:"
echo "  Name: $(node -p "require('./package.json').name")"
echo "  Version: $(node -p "require('./package.json').version")"
echo "  Publisher: $(node -p "require('./package.json').publisher")"

echo ""
echo "📦 Publishing to VS Code Marketplace..."

if [ -z "$VSCE_PAT" ]; then
    echo "⚠️  VSCE_PAT environment variable is not set."
    echo "   You can set it with: export VSCE_PAT=your_token"
    echo "   Or the tool might prompt you for a token (if interactive)."
    
    echo "🚀 Publishing to VS Code Marketplace (interactive/manual auth)..."
    npx vsce publish
else
    echo "🔑 VSCE_PAT found."
    echo "🚀 Publishing to VS Code Marketplace..."
    npx vsce publish -p "$VSCE_PAT"
fi

echo ""
echo "🎉 Done! Check your extension at:"
echo "   https://marketplace.visualstudio.com/items?itemName=cookabc.python-dependencies-updater"
