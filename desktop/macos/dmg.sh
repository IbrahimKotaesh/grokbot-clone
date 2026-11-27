#!/bin/bash
# The Mac installer people download from the website: Badr.dmg. Opening it shows one window with Badr on the
# left, the Applications folder on the right and an arrow between them; drag, done. (The in-app updater keeps
# using Badr-mac.zip from package.sh.)
#
#   desktop/macos/build.sh && desktop/macos/package.sh && desktop/macos/dmg.sh
#
# The window layout is set by Finder once, while building. Output: dist/Badr.dmg, copied to
# web/public/downloads (served at /api/download/mac/dmg).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
dist="$here/dist"
app="$dist/Badr.app"
public="$here/../../web/public/downloads"
[ -d "$app" ] || { echo "Build the app first: desktop/macos/build.sh" >&2; exit 1; }

work=$(mktemp -d)
trap 'hdiutil detach -quiet "/Volumes/Badr" 2>/dev/null || true; rm -rf "$work"' EXIT
stage="$work/stage"
mkdir -p "$stage/.background"
ditto "$app" "$stage/Badr.app"
ln -s /Applications "$stage/Applications"
swift "$here/dmg-background.swift" "$work" >/dev/null
tiffutil -cathidpicheck "$work/background.png" "$work/background@2x.png" -out "$stage/.background/background.tiff" >/dev/null

# A writable image first, so Finder can save the window layout into it.
hdiutil detach -quiet "/Volumes/Badr" 2>/dev/null || true
hdiutil create -quiet -volname Badr -srcfolder "$stage" -fs HFS+ -format UDRW -ov "$work/rw.dmg"
hdiutil attach -quiet -readwrite -noverify -noautoopen "$work/rw.dmg"
cp "$app/Contents/Resources/Badr.icns" "/Volumes/Badr/.VolumeIcon.icns" 2>/dev/null && SetFile -a C "/Volumes/Badr" 2>/dev/null || true

osascript <<'APPLESCRIPT'
tell application "Finder"
  tell disk "Badr"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 120, 840, 548}
    set opts to the icon view options of container window
    set arrangement of opts to not arranged
    set icon size of opts to 112
    set text size of opts to 13
    set background picture of opts to file ".background:background.tiff"
    set position of item "Badr.app" of container window to {170, 190}
    set position of item "Applications" of container window to {470, 190}
    update without registering applications
    delay 1
    close
  end tell
end tell
APPLESCRIPT

chmod -Rf go-w "/Volumes/Badr" 2>/dev/null || true
sync
hdiutil detach -quiet "/Volumes/Badr"
rm -f "$dist/Badr.dmg"
hdiutil convert -quiet "$work/rw.dmg" -format UDZO -imagekey zlib-level=9 -o "$dist/Badr.dmg"
# Sign the disk image with the same identity as the app, when there is one.
signer=$(codesign -dvv "$app" 2>&1 | awk -F= '/^Authority=/ && !done {print $2; done=1}')
[ -n "$signer" ] && codesign --sign "$signer" "$dist/Badr.dmg" 2>/dev/null || true

mkdir -p "$public"
cp "$dist/Badr.dmg" "$public/Badr.dmg"
printf '%s (%s bytes)\n' "$dist/Badr.dmg" "$(stat -f %z "$dist/Badr.dmg")"
