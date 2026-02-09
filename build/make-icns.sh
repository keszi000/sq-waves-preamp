#!/bin/bash
# Create AppIcon.icns from static/icon.svg (macOS only; uses qlmanage, sips, iconutil).
# Run from repo root or call from build/ (script cd's to repo root).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SVG="static/icon.svg"
if [ ! -f "$SVG" ]; then
  echo "No $SVG, skipping icon."
  exit 0
fi
echo "Building icon from $SVG..."
qlmanage -t -s 1024 -o . "$SVG" 2>/dev/null || true
PNG="${SVG}.png"
[ -f "$PNG" ] || { echo "Could not export PNG from SVG (install qlmanage?). Skipping icon."; exit 0; }
ICONSET="AppIcon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
sips -z 16 16 "$PNG" --out "$ICONSET/icon_16x16.png"
sips -z 32 32 "$PNG" --out "$ICONSET/icon_16x16@2x.png"
sips -z 32 32 "$PNG" --out "$ICONSET/icon_32x32.png"
sips -z 64 64 "$PNG" --out "$ICONSET/icon_32x32@2x.png"
sips -z 128 128 "$PNG" --out "$ICONSET/icon_128x128.png"
sips -z 256 256 "$PNG" --out "$ICONSET/icon_128x128@2x.png"
sips -z 256 256 "$PNG" --out "$ICONSET/icon_256x256.png"
sips -z 512 512 "$PNG" --out "$ICONSET/icon_256x256@2x.png"
sips -z 512 512 "$PNG" --out "$ICONSET/icon_512x512.png"
cp "$PNG" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o AppIcon.icns
rm -rf "$ICONSET" "$PNG"
echo "Created AppIcon.icns"
