# Fino for iPhone

Open `Fino/Fino.xcodeproj` in Xcode. Select the Fino scheme and your connected
iPhone, choose your team under Signing & Capabilities, then press Run (⌘R).
The project currently uses Ibrahim's development team and bundle identifier
`com.ibkopixels.fino`; change these for a different Apple developer account.
Enable Developer Mode on the phone if iOS requests it, and accept Trust This
Computer. Development signing requires a valid Apple account/profile; Xcode
manages provisioning automatically. It is not an App Store or TestFlight build.

The SwiftUI app hosts the same HTTPS Fino workspace in WKWebView. The website
and app share the server, conversations, providers and connected services.
Web changes arrive after deployment and reload; changes to Swift code or the
installed icon require rebuilding the iOS app. The server must remain online.

Google sign-in uses Apple's system authentication browser, rather than an
embedded Google login. A one-use, 60-second code bound to a random PKCE verifier
returns to the app. The app exchanges it over HTTPS, installs the HttpOnly cookie in
WKWebView, and then loads the workspace; model credentials and Composio keys remain on the server. External
links open in the browser. Voice depends on the server's configured voice
provider, microphone permission, and iOS web media support.

## Command line

    xcodebuild -project ios/Fino/Fino.xcodeproj -scheme Fino \
      -destination 'id=YOUR_IPHONE_UDID' -allowProvisioningUpdates build

The HTTPS workspace URL is configured in `WorkspaceView.swift`. Keep its host
and the server's `APP_URL`/`SERVER_URL` consistent when moving domains.

## Mobile QA (simulator only)

Debug simulator builds accept `--mobile-qa` and connect only to the fixed
loopback URL `http://127.0.0.1:8791`, using an isolated test backend/database.
This path is compiled out of Release and physical-device builds. The normal
launch always uses the HTTPS server above. Do not enable development login on
the public server. Native camera permission text is included; camera hardware,
microphone input and push delivery need real-device verification.

The mobile UI keeps focused fields at least 16px to avoid iOS focus zoom and
keeps the permission picker inside the phone viewport. The native status area
uses dark chrome, and initial workspace loads revalidate the deployed page.

For immediate access away from home, open the HTTPS workspace in iPhone Safari
and use Share → Add to Home Screen. The server must be online; the Mac does not
need to be on. The native Xcode build requires installation/development signing;
it has not been distributed through TestFlight or the App Store.
