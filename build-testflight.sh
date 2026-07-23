#!/bin/bash
# TapIn Golf - Build for TestFlight
# This script bumps the build number, runs EAS Build for iOS,
# and outputs the .ipa download link for Transporter upload.
#
# Usage: ./build-testflight.sh [--bump-version]
#   --bump-version  Also bumps the version (e.g., 1.0.0 → 1.0.1)
#
# Prerequisites:
#   - eas-cli installed: npm install -g eas-cli
#   - Logged in: eas login
#   - Apple credentials configured: eas credentials -p ios

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/artifacts/tapin-golf"
APP_JSON="$APP_DIR/app.json"

cd "$APP_DIR"

# ─── Pull latest ───────────────────────────────────────────────────────────
echo "📥 Pulling latest changes..."
cd "$SCRIPT_DIR" && git pull --rebase || true
cd "$APP_DIR"

# ─── Read current version info ─────────────────────────────────────────────
CURRENT_VERSION=$(python3 -c "import json; d=json.load(open('$APP_JSON')); print(d['expo']['version'])")
CURRENT_BUILD=$(python3 -c "import json; d=json.load(open('$APP_JSON')); print(d['expo']['ios'].get('buildNumber', '1'))")

echo ""
echo "📋 Current: v${CURRENT_VERSION} (build ${CURRENT_BUILD})"

# ─── Bump build number (always) ───────────────────────────────────────────
NEW_BUILD=$((CURRENT_BUILD + 1))

# ─── Optionally bump version ──────────────────────────────────────────────
NEW_VERSION="$CURRENT_VERSION"
if [[ "$1" == "--bump-version" ]]; then
  # Increment patch: 1.0.0 → 1.0.1, 1.2.9 → 1.2.10
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
  PATCH=$((PATCH + 1))
  NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
fi

echo "🔼 New:     v${NEW_VERSION} (build ${NEW_BUILD})"
echo ""

# ─── Update app.json ──────────────────────────────────────────────────────
python3 -c "
import json
with open('$APP_JSON') as f:
    d = json.load(f)
d['expo']['version'] = '${NEW_VERSION}'
d['expo']['ios']['buildNumber'] = '${NEW_BUILD}'
with open('$APP_JSON', 'w') as f:
    json.dump(d, f, indent=2)
print('✅ Updated app.json')
"

# ─── Commit version bump ──────────────────────────────────────────────────
cd "$SCRIPT_DIR"
git add "$APP_JSON"
git commit -m "Bump iOS build to v${NEW_VERSION} (${NEW_BUILD}) for TestFlight

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git push
echo "✅ Version bump committed and pushed"
echo ""

# ─── Run EAS Build ────────────────────────────────────────────────────────
cd "$APP_DIR"
echo "🏗️  Starting EAS Build for iOS (production profile)..."
echo "   This will build an .ipa archive for App Store / TestFlight."
echo ""

eas build --platform ios --profile production --non-interactive

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Build complete!"
echo ""
echo "Next steps:"
echo "  1. Download the .ipa from the EAS dashboard link above"
echo "  2. Open Transporter on your Mac"
echo "  3. Drag the .ipa into Transporter and click 'Deliver'"
echo "  4. Wait for processing in App Store Connect (~5-15 min)"
echo "  5. Go to TestFlight in App Store Connect to distribute"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
