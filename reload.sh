#!/bin/bash
# TapIn Golf - Rebuild & Reload App Locally
# Rebuilds API, restarts servers, and reloads the Expo app
# Usage: ./reload.sh

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT/artifacts/api-server"
PORTAL_DIR="$ROOT/artifacts/club-portal"
APP_DIR="$ROOT/artifacts/tapin-golf"

echo "🔄 TapIn Golf — Rebuild & Reload"
echo "================================="

# Kill existing servers
echo "⏹️  Stopping servers..."
lsof -ti :3000 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti :5174 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti :8081 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# Ensure SSH tunnel is up
if ! lsof -ti :1111 > /dev/null 2>&1; then
  echo "🔒 Starting SSH tunnel..."
  sshpass -p 'NC4Rv#Jx%4Aj' ssh -f -N -L 1111:localhost:5432 root@tapingolf.dedicated.co.za -o StrictHostKeyChecking=no
  sleep 2
fi

# Env vars
export DATABASE_URL="postgresql://tapingolf:Pretoria2026@localhost:1111/tapingolf"
export PORT=3000
export PAYFAST_SANDBOX=1
export PRIVATE_OBJECT_DIR="$ROOT/storage-objects"
mkdir -p "$PRIVATE_OBJECT_DIR"

# Build API
echo "🔨 Building API..."
cd "$API_DIR"
node build.mjs
echo "✅ API built"

# Start API
echo "🚀 Starting API on :3000..."
node --enable-source-maps ./dist/index.mjs &
API_PID=$!
sleep 2

# Start club portal
echo "🚀 Starting club portal on :5174..."
cd "$PORTAL_DIR"
VITE_API_TARGET=http://localhost:3000 npx vite --port 5174 &
PORTAL_PID=$!

# Build & run iOS app natively (no Expo Go needed)
echo "📱 Building & running iOS app on simulator..."
cd "$APP_DIR"
npx expo run:ios &
APP_PID=$!

echo ""
echo "================================="
echo "🟢 All running:"
echo "   API:         http://localhost:3000/api"
echo "   Club Portal: http://localhost:5174"
echo "   iOS App:     Building natively on simulator"
echo ""
echo "Press Ctrl+C to stop everything"
echo "================================="

trap "echo ''; echo '⏹️  Stopping...'; kill $API_PID $PORTAL_PID $APP_PID 2>/dev/null; exit 0" INT TERM
wait
