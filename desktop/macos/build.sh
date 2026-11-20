#!/bin/bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/desktop/macos/dist/Fino.app"
mkdir -p "$out/Contents/MacOS" "$out/Contents/Resources"
swiftc -O -parse-as-library -swift-version 5 -target arm64-apple-macosx14.0 "$root/desktop/macos/Fino.swift" -o "$out/Contents/MacOS/Fino" -framework AppKit -framework WebKit -framework AuthenticationServices -framework ScreenCaptureKit -framework ApplicationServices
cat > "$out/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>en</string><key>CFBundleLocalizations</key><array><string>en</string></array><key>CFBundleIdentifier</key><string>com.ibkopixels.fino.mac</string><key>CFBundleName</key><string>Fino</string><key>CFBundleDisplayName</key><string>Fino</string><key>CFBundleExecutable</key><string>Fino</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/>
<key>FinoWorkspaceURL</key><string>https://grokbot.89-167-54-211.sslip.io</string>
<key>NSCameraUsageDescription</key><string>Attach a photo to your Fino conversation.</string><key>NSMicrophoneUsageDescription</key><string>Record a message for transcription in Fino.</string>
<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>Fino authentication</string><key>CFBundleURLSchemes</key><array><string>fino</string></array></dict></array>
</dict></plist>
PLIST
iconset="$root/desktop/macos/dist/Fino.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
 sips -z "$size" "$size" "$root/web/public/characters/fino-brand-blue.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
 double=$((size*2))
 sips -z "$double" "$double" "$root/web/public/characters/fino-brand-blue.png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$out/Contents/Resources/Fino.icns"
/usr/libexec/PlistBuddy -c 'Add :CFBundleIconFile string Fino.icns' "$out/Contents/Info.plist"
codesign --force --sign - "$out"
printf '%s\n' "$out"
