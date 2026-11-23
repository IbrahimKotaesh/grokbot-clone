#!/bin/bash
# Make the Mac app ready to give to anyone: zip it, have Apple notarize it (so macOS opens it without a
# warning), and publish it for the website's "Download for Mac" button and the in-app updater.
#
#   desktop/macos/build.sh && desktop/macos/package.sh
#
# Notarization runs when the app is signed with a "Developer ID Application" certificate and the notary
# login is saved in the keychain as "fino-notary" (see README.md). Otherwise it still packages, and says so.
# Output: desktop/macos/dist/Fino-mac.zip + Fino-mac.json, copied to web/public/downloads (served at /api/download/mac).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
dist="$here/dist"
app="$dist/Fino.app"
public="$here/../../web/public/downloads"
profile="${FINO_NOTARY_PROFILE:-fino-notary}"
[ -d "$app" ] || { echo "Build the app first: desktop/macos/build.sh" >&2; exit 1; }

build=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Contents/Info.plist")
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")
signer=$(codesign -dvv "$app" 2>&1 | awk -F= '/^Authority=/ && !done {print $2; done=1}')
zip="$dist/Fino-mac.zip"
pack() { rm -f "$zip"; ditto -c -k --sequesterRsrc --keepParent "$app" "$zip"; }

notarized=false
pack
if [[ "$signer" == "Developer ID Application"* ]] && xcrun notarytool history --keychain-profile "$profile" >/dev/null 2>&1; then
  echo "Sending to Apple for notarization (usually 1–5 minutes)…" >&2
  if xcrun notarytool submit "$zip" --keychain-profile "$profile" --wait --timeout 30m | tee "$dist/notary.log" | grep -q "status: Accepted"; then
    xcrun stapler staple "$app" >&2
    pack
    notarized=true
    echo "Notarized and stapled ✓" >&2
  else
    echo "Apple did not accept it. Details: xcrun notarytool log <id> --keychain-profile $profile (id in $dist/notary.log)" >&2
    exit 1
  fi
else
  [[ "$signer" == "Developer ID Application"* ]] || echo "Not notarized: signed with '${signer:-ad-hoc}', not a Developer ID Application certificate." >&2
  [[ "$signer" != "Developer ID Application"* ]] || echo "Not notarized: no notary login saved as '$profile' (see README.md)." >&2
fi

printf '{"version":"%s","build":"%s","notarized":%s,"signer":"%s"}\n' "$version" "$build" "$notarized" "$signer" > "$dist/Fino-mac.json"
mkdir -p "$public"
cp "$zip" "$public/Fino-mac.zip"
cp "$dist/Fino-mac.json" "$public/Fino-mac.json"
printf '%s (build %s, notarized: %s)\n' "$zip" "$build" "$notarized"
