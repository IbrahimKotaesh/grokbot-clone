# Fino for Mac — local preview

Native AppKit/WKWebView app for Apple Silicon, macOS 14 or newer. It loads the existing HTTPS workspace; the server retains conversations, models and connected accounts. The application contains no provider API keys or session credentials.

Build with `./desktop/macos/build.sh`. The output is `desktop/macos/dist/Fino.app`. Copy it into Applications. This is a locally ad-hoc signed development build, not a notarized public release. Updating native code requires rebuilding/replacing the app; deployed web changes load automatically on reload.

## Sign-in and control

Use **Sign in** to authenticate in Apple's system authentication browser. The app reuses Fino's existing single-use PKCE ticket exchange and stores the resulting HttpOnly session in its WKWebView cookie store. No password is entered into a custom native login form.

Choose **This Computer** (the default) or **Cloud** in the native Environment selector. This Computer requires **Connect**; Cloud runs on the server without local permissions. The browser is a tool within the selected computer, not a third environment. Local browser navigation uses the Mac's default browser and its work appears in the main-display preview. A session lasts at most 30 minutes and stops on disconnect, app exit, or **Stop local control / Command-period**. Only direct user tasks receive the local target; schedules and delegated work remain on Linux.

**This Computer:** requires the owner to enable Fino in macOS **Privacy & Security → Accessibility** and **Screen Recording** (the name can vary by macOS version). Only the main display is captured. The existing bot permission mode still applies: Ask first requests approval, while ordinary permitted actions can run within the enabled session. Screenshots use the session authorization. Commands and security/credential dialogs must be handled by the owner. Input is blocked when the foreground app is System Settings, SecurityAgent, Keychain Access, Terminal, iTerm or Script Editor. This is not a general-purpose arbitrary-code execution bridge.

Screenshots go over authenticated WSS to the user's Fino server, then to the selected model as normal computer tool output. Completed local computer turns attach their final screenshot to the originating conversation. No inbound localhost port or privileged JavaScript bridge is exposed by the app.

## Desktop workspace layout

The dark unified Mac toolbar replaces the old sign-in/control strip. Sign-in and Reload remain in the Fino menu. The right workspace pane includes browser navigation/address controls, a main-display preview, or the server Linux computer viewer. The web workspace retains its desktop sidebar when the pane narrows it; sidebar collapse and the pane divider make room for writing.

Environment selects **where computer actions execute**. Conversations, models, files managed by the server and account data still live on the HTTPS backend; this is not an offline local backend. Selecting Cloud closes any local lease. A disconnected local selection disables task submission and is rejected by the API, rather than silently running on Linux. Accepted tasks retain their selected target even if the environment changes while they are queued. The native/web UI bridge only exposes context and pane display actions, validates the main frame and workspace origin, and cannot authorize control or execute code.

## Verification

Run `Fino.app/Contents/MacOS/Fino --self-test` to open a disposable, app-owned HTML page and verify click, typing and PNG capture. It writes `/tmp/fino-mac-selftest.json` and `/tmp/fino-mac-browser-test.png`; it never enables a remote control session or asks for Mac permissions.

Server checks: build the server, then run `tests/desktop-device.mjs` with a temporary `SESSION_SECRET` and `DB_PATH=:memory:`. Tests cover cookie/origin authentication, duplicate connections, owner isolation, operation validation, PNG validation, async target isolation and stopping without silently falling back to a cloud computer.
