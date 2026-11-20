# Fino for Mac — local preview

Native AppKit/WKWebView app for Apple Silicon, macOS 14 or newer. It loads the existing HTTPS workspace; the server retains conversations, models and connected accounts. The application contains no provider API keys or session credentials.

Build with `./desktop/macos/build.sh`. The output is `desktop/macos/dist/Fino.app`. Copy it into Applications. This is a locally ad-hoc signed development build, not a notarized public release. Updating native code requires rebuilding/replacing the app; deployed web changes load automatically on reload.

## Sign-in and control

Use **Sign in** to authenticate in Apple's system authentication browser. The app reuses Fino's existing single-use PKCE ticket exchange and stores the resulting HttpOnly session in its WKWebView cookie store. No password is entered into a custom native login form.

Select **Browser use** or **Mac computer use**, then **Enable local control**. A native confirmation describes the destination of screenshots. A session lasts at most 30 minutes and stops when disconnected, on app exit, or with **Stop local control / Command-period**. Reconnection requires explicit enabling again. Only bots handling direct user messages receive this local target; schedules, proactive work and delegated bot messages remain on Linux.

**Browser use:** a separate persistent WebKit browser profile. Supports HTTP/HTTPS navigation, screenshots, DOM clicks, input/textarea/contenteditable typing, scrolling and a small set of keys. It does not use the user's existing Chrome profile. Cross-origin iframe interactions, browser context menus, drag, OS dialogs and some synthetic-event-resistant websites require Mac mode or manual input. Browser links cannot execute local files or custom URL schemes. Screenshots are 1x viewport pixels so returned click coordinates match CSS pixels.

**Mac computer use:** requires the owner to enable Fino in macOS **Privacy & Security → Accessibility** and **Screen Recording** (the name can vary by macOS version). Only the main display is captured. The existing bot permission mode still applies: Ask first requests approval, while ordinary permitted actions can run within the enabled session. Screenshots use the session authorization. Commands and security/credential dialogs must be handled by the owner. Input is blocked when the foreground app is System Settings, SecurityAgent, Keychain Access, Terminal, iTerm or Script Editor. This is not a general-purpose arbitrary-code execution bridge.

Screenshots go over authenticated WSS to the user's Fino server, then to the selected model as normal computer tool output. Completed local computer turns attach their final screenshot to the originating conversation. No inbound localhost port or privileged JavaScript bridge is exposed by the app.

## Verification

Run `Fino.app/Contents/MacOS/Fino --self-test` to open a disposable, app-owned HTML page and verify click, typing and PNG capture. It writes `/tmp/fino-mac-selftest.json` and `/tmp/fino-mac-browser-test.png`; it never enables a remote control session or asks for Mac permissions.

Server checks: build the server, then run `tests/desktop-device.mjs` with a temporary `SESSION_SECRET` and `DB_PATH=:memory:`. Tests cover cookie/origin authentication, duplicate connections, owner isolation, operation validation, PNG validation, async target isolation and stopping without silently falling back to a cloud computer.
