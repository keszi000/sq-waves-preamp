#!/bin/bash
# Build sqapi and create "SQ Preamp manager.app" so double-click runs without opening Terminal.
# Run from repo root or call from build/ (script cd's to repo root).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building..."
CGO_ENABLED=1 go build -o sqapi .

APP="SQ Preamp manager.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
mv sqapi "$APP/Contents/MacOS/"

# Icon (optional)
./build/make-icns.sh 2>/dev/null || true
mkdir -p "$APP/Contents/Resources"
if [ -f AppIcon.icns ]; then
  cp AppIcon.icns "$APP/Contents/Resources/"
  ICON_PLIST='	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
'
else
  ICON_PLIST=""
fi

cat > "$APP/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>sqapi</string>
	<key>CFBundleIdentifier</key>
	<string>com.sqapi.preamp</string>
	<key>CFBundleName</key>
	<string>SQ Preamp manager</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>NSHighResolutionCapable</key>
	<true/>
${ICON_PLIST}</dict>
</plist>
PLIST

echo "Created $APP"
echo "Put config.json and data/ next to the .app, then double-click the app."
