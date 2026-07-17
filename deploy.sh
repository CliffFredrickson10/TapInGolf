#!/bin/bash
# TapIn Golf - Server Deploy Script
# Run on the server: bash /opt/TapInGolf/deploy.sh
set -e

cd /opt/TapInGolf

echo "🔄 Pulling latest changes..."
git pull origin clifffredrickson10-reseller-login-page

echo "📦 Installing dependencies..."
pnpm install

echo "🔨 Building API server..."
cd artifacts/api-server
node build.mjs

echo "🎨 Building club portal..."
cd ../club-portal
BASE_PATH=/club-portal/ npx vite build

echo "🚀 Restarting API..."
pm2 restart tapingolf-api

echo "✅ Deploy complete!"
pm2 logs tapingolf-api --lines 5 --nostream
