# Fino for Mac

Native AppKit/WKWebView app for Apple Silicon, macOS 14 or newer. It loads the existing HTTPS workspace; the server retains conversations, models and connected accounts. The application contains no provider API keys or session credentials.

Build with `./desktop/macos/build.sh`. The output is `desktop/macos/dist/Fino.app`. Deployed web changes load automatically on reload; only native code (this folder) needs a new app build, which installed apps then fetch by themselves (see Releases).

## Releases, notarization and auto-update

```bash
desktop/macos/build.sh && desktop/macos/package.sh
```

`build.sh` stamps a build number (UTC `YYYYMMDDHHMM`, override with `FINO_BUILD`), signs with the hardened runtime and `Fino.entitlements` (microphone, camera), preferring a **Developer ID Application** certificate over Apple Development. `package.sh` zips the app, sends it to Apple's notary service, staples the ticket, and writes `Fino-mac.zip` + `Fino-mac.json` to `web/public/downloads`. Commit both and push: the site's **Download for Mac** button and `/api/download/mac/info` serve them.

Installed apps check `/api/download/mac/info` 20 seconds after launch and every 6 hours (also **Fino → Check for Updates…**). A higher `build` is downloaded, verified against the team's signature (Team ID `345F6K6X7N`, bundle `com.ibkopixels.fino.mac`), and installed on **Restart now** or when Fino quits.

One-time setup for notarization (the owner does this; it needs the Apple account):
1. Xcode → Settings → Accounts → team **IBKO Pixels** → Manage Certificates → **+** → **Developer ID Application**.
2. Create an app-specific password at account.apple.com (Sign-In and Security → App-Specific Passwords), then run `xcrun notarytool store-credentials fino-notary --apple-id <your Apple ID email> --team-id 345F6K6X7N` and paste it when asked.

Without these, `package.sh` still publishes a signed build and prints why it isn't notarized.

## Sign-in and control

Use **Sign in** to authenticate in Apple's system authentication browser. The app reuses Fino's existing single-use PKCE ticket exchange and stores the resulting HttpOnly session in its WKWebView cookie store. No password is entered into a custom native login form.

Choose where bots work from the toolbar's **Computer** button (also the **Computer** menu): **Cloud computer**, **This Mac** or **Fino Browser**. The first Connect asks once (with *Always allow on this Mac*); after that Fino connects by itself at launch, after switching, and when a session runs out. The browser is a tool within the selected computer, not a third environment. Local browser navigation uses the Mac's default browser and its work appears in the main-display preview. A session lasts at most 30 minutes and stops on disconnect, app exit, or **Stop local control / Command-period**. Only direct user tasks receive the local target; schedules and delegated work remain on Linux.

**This Computer:** requires the owner to enable Fino in macOS **Privacy & Security → Accessibility** and **Screen Recording** (the name can vary by macOS version). Only the main display is captured. The existing bot permission mode still applies: Ask first requests approval, while ordinary permitted actions can run within the enabled session. Screenshots use the session authorization. Commands and security/credential dialogs must be handled by the owner. Input is blocked when the foreground app is System Settings, SecurityAgent, Keychain Access, Terminal, iTerm or Script Editor. This is not a general-purpose arbitrary-code execution bridge.

Screenshots go over authenticated WSS to the user's Fino server, then to the selected model as normal computer tool output. Completed local computer turns attach their final screenshot to the originating conversation. No inbound localhost port or privileged JavaScript bridge is exposed by the app.

## Desktop workspace layout

The dark unified Mac toolbar replaces the old sign-in/control strip. Sign-in and Reload remain in the Fino menu. The right workspace pane includes browser navigation/address controls, a main-display preview, or the server Linux computer viewer. The web workspace retains its desktop sidebar when the pane narrows it; sidebar collapse and the pane divider make room for writing.

Environment selects **where computer actions execute**. Conversations, models, files managed by the server and account data still live on the HTTPS backend; this is not an offline local backend. Selecting Cloud closes any local lease. When This Mac or the Fino Browser is selected but not connected, tasks still run, on the cloud computer, so sending is never blocked. Accepted tasks retain their selected target even if the environment changes while they are queued. The native/web UI bridge only exposes context and pane display actions, validates the main frame and workspace origin, and cannot authorize control or execute code.

## Verification

Run `Fino.app/Contents/MacOS/Fino --self-test` to open a disposable, app-owned HTML page and verify click, typing and PNG capture. It writes `/tmp/fino-mac-selftest.json` and `/tmp/fino-mac-browser-test.png`; it never enables a remote control session or asks for Mac permissions.

Server checks: build the server, then run `tests/desktop-device.mjs` with a temporary `SESSION_SECRET` and `DB_PATH=:memory:`. Tests cover cookie/origin authentication, duplicate connections, owner isolation, operation validation, PNG validation, async target isolation and falling back to the cloud computer when nothing is connected.
