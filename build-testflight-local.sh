#!/bin/bash
set -e

# === TapIn Golf - Local TestFlight Build ===
# Builds IPA using Xcode directly (bypasses EAS)

APP_DIR="artifacts/tapin-golf"
SCHEME="TapInGolf"
WORKSPACE="$APP_DIR/ios/TapInGolf.xcworkspace"
ARCHIVE_PATH="$APP_DIR/ios/build/TapInGolf.xcarchive"
EXPORT_PATH="$APP_DIR/ios/build/export"
EXPORT_OPTIONS="$APP_DIR/ios/ExportOptions.plist"

echo "🏗️  TapIn Golf - Local TestFlight Build"
echo "========================================"

# Step 1: Bump build number
echo ""
echo "📦 Step 1: Bumping build number..."
cd "$APP_DIR"
CURRENT_BUILD=$(grep -A1 "CFBundleVersion" ios/TapInGolf/Info.plist | grep -o '[0-9]*' | head -1)
NEW_BUILD=$((CURRENT_BUILD + 1))
# Update Info.plist
sed -i '' "s|<key>CFBundleVersion</key>|<key>CFBundleVersion</key>|" ios/TapInGolf/Info.plist
# Use plutil for reliable plist editing
plutil -replace CFBundleVersion -string "$NEW_BUILD" ios/TapInGolf/Info.plist
echo "   Build number: $CURRENT_BUILD → $NEW_BUILD"
cd ../..

# Step 2: Bundle JavaScript
echo ""
echo "📦 Step 2: Bundling JavaScript..."
cd "$APP_DIR"
npx react-native bundle \
  --platform ios \
  --dev false \
  --entry-file index.js \
  --bundle-output ios/main.jsbundle \
  --assets-dest ios 2>&1 | tail -5
cd ../..
echo "   ✅ JavaScript bundled"

# Step 3: Install pods if needed
echo ""
echo "📦 Step 3: Checking CocoaPods..."
cd "$APP_DIR/ios"
if [ ! -d "Pods" ] || [ "Podfile" -nt "Pods/Manifest.lock" ]; then
  echo "   Installing pods..."
  pod install --silent
else
  echo "   Pods up to date"
fi
cd ../../..

# Step 4: Create ExportOptions.plist if missing
if [ ! -f "$EXPORT_OPTIONS" ]; then
  echo ""
  echo "📦 Step 4: Creating ExportOptions.plist..."
  cat > "$EXPORT_OPTIONS" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>7AMSB7M6VT</string>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
    <key>destination</key>
    <string>upload</string>
</dict>
</plist>
PLIST
  echo "   ✅ Created ExportOptions.plist"
fi

# Step 5: Archive
echo ""
echo "📦 Step 5: Archiving (this takes a few minutes)..."
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination "generic/platform=iOS" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=7AMSB7M6VT \
  -allowProvisioningUpdates \
  2>&1 | grep -E "error:|warning:.*provisioning|BUILD|Archive" || true

if [ ! -d "$ARCHIVE_PATH" ]; then
  echo "   ❌ Archive failed. Run without -quiet for details:"
  echo "   xcodebuild archive -workspace $WORKSPACE -scheme $SCHEME -configuration Release -archivePath $ARCHIVE_PATH -destination 'generic/platform=iOS'"
  exit 1
fi
echo "   ✅ Archive created"

# Step 6: Export IPA
echo ""
echo "📦 Step 6: Exporting IPA..."
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_PATH" \
  -quiet 2>&1 | grep -E "error:|Export" || true

IPA_FILE=$(find "$EXPORT_PATH" -name "*.ipa" 2>/dev/null | head -1)
if [ -z "$IPA_FILE" ]; then
  echo "   ❌ Export failed. Check signing configuration."
  exit 1
fi

echo ""
echo "✅ BUILD SUCCESSFUL!"
echo "   IPA: $IPA_FILE"
echo "   Build: v$(plutil -extract CFBundleShortVersionString raw "$APP_DIR/ios/TapInGolf/Info.plist") ($NEW_BUILD)"
echo ""
echo "📤 Upload to TestFlight:"
echo "   Open Transporter app and drag in: $IPA_FILE"
echo "   Or: xcrun altool --upload-app -f \"$IPA_FILE\" -t ios -u YOUR_APPLE_ID -p APP_SPECIFIC_PASSWORD"
