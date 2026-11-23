#!/bin/bash
# Zip the built Mac app for the website's "Download for Mac" button.
# Run build.sh first. Output: desktop/macos/dist/Fino-mac.zip plus web/public/downloads/Fino-mac.zip (the server serves it at /api/download/mac).
set -euo pipefail
dist=$(cd "$(dirname "$0")" && pwd)/dist
[ -d "$dist/Fino.app" ] || { echo "Build the app first: desktop/macos/build.sh" >&2; exit 1; }
rm -f "$dist/Fino-mac.zip"
ditto -c -k --sequesterRsrc --keepParent "$dist/Fino.app" "$dist/Fino-mac.zip"
# A copy the website serves after deploy.
mkdir -p "$dist/../../../web/public/downloads" && cp "$dist/Fino-mac.zip" "$dist/../../../web/public/downloads/Fino-mac.zip"
printf '%s\n' "$dist/Fino-mac.zip"
