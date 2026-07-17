#!/bin/bash
# TapIn Golf - Local Dev Script
# Sets up SSH tunnel, builds API server and starts all dev servers
# Usage: ./dev.sh

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$ROOT/artifacts/api-server"
PORTAL_DIR="$ROOT/artifacts/club-portal"

echo "🏌️ TapIn Golf Dev Server"
echo "========================"

# --- SSH Tunnel ---
echo "🔒 Setting up SSH tunnel to database..."
# Kill any existing tunnel on port 1111
lsof -ti :1111 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

sshpass -p 'NC4Rv#Jx%4Aj' ssh -f -N -L 1111:localhost:5432 root@tapingolf.dedicated.co.za -o StrictHostKeyChecking=no
sleep 2

if lsof -ti :1111 > /dev/null 2>&1; then
  TUNNEL_PID=$(lsof -ti :1111)
  echo "✅ SSH tunnel established on port 1111 (PID: $TUNNEL_PID)"
else
  echo "❌ Failed to establish SSH tunnel. Is sshpass installed? (brew install hudochenkov/sshpass/sshpass)"
  exit 1
fi

# Database connection (via SSH tunnel on port 1111)
export DATABASE_URL="postgresql://tapingolf:Pretoria2026@localhost:1111/tapingolf"
export PORT=3000
export PAYFAST_SANDBOX=1

# Kill existing processes on our ports
echo "⏹️  Stopping existing servers..."
lsof -ti :3000 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti :5174 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# Build API server
echo "🔨 Building API server..."
cd "$API_DIR"
node build.mjs
echo "✅ API built"

# Start API server in background
echo "🚀 Starting API server on port 3000..."
node --enable-source-maps ./dist/index.mjs &
API_PID=$!
sleep 2

# Check API is running
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "✅ API server running (PID: $API_PID)"
else
  echo "⚠️  API server may still be starting..."
fi

# Start club portal
echo "🚀 Starting club portal on port 5174..."
cd "$PORTAL_DIR"
VITE_API_TARGET=http://localhost:3000 npx vite --port 5174 &
PORTAL_PID=$!
sleep 2
echo "✅ Club portal running (PID: $PORTAL_PID)"

echo ""
echo "========================"
echo "🟢 All servers running:"
echo "   SSH Tunnel:  localhost:1111 → DB"
echo "   API:         http://localhost:3000/api"
echo "   Club Portal: http://localhost:5174"
echo ""
echo "📱 For mobile app, run separately:"
echo "   cd $ROOT/artifacts/tapin-golf"
echo "   EXPO_NO_METRO_WORKSPACE_ROOT=1 npx expo start --ios --clear"
echo ""
echo "Press Ctrl+C to stop all servers"
echo "========================"

# Trap Ctrl+C to kill tunnel + servers
trap "echo ''; echo '⏹️  Stopping servers...'; kill $API_PID $PORTAL_PID $TUNNEL_PID 2>/dev/null; exit 0" INT TERM

# Wait for either to exit
wait
