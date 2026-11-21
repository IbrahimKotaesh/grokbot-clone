# Fino mobile architecture

Fino has two separately rendered clients, one shared service:

- `web/`: React, DOM, Vite. Existing web and desktop users retain their interface.
- `mobile/`: React Native 0.88, Expo SDK 58, TypeScript, Hermes. iOS and Android native views; Expo Router file routes backed by native stack/form sheets. No WebView dependency or HTML shell.
- `packages/contracts/`: platform-neutral API types. `server/src/types.ts` retains a compatibility type export for the web and server.
- `packages/client/`: transport-injected HTTP API, incremental SSE decoding, revision-aware message merging and validated chart data. No UI, platform credentials or provider secrets.
- `server/`: existing Node/Hono agent runtime, SQLite, provider sessions, bots, memory, permissions, integrations and scheduling. The server remains authoritative for both clients.

## Identity and security

Native sign-in opens the system authentication browser, generates a random verifier and SHA-256 PKCE challenge, and exchanges a one-use 60-second ticket for a server session. Only the short-lived code appears in the callback. Sessions are stored with Expo SecureStore (Keychain / Android Keystore), attached as an Authorization header, checked against the same expiring and revocable auth_sessions table. Logout revokes the session and removes local storage. Existing cookie sessions and the legacy Swift wrapper remain supported during migration. The workspace access-code gate is preserved and applies before authenticated API routes. API keys and model-provider sign-ins remain on the server.

The internal QA login is only rendered when explicitly enabled at build time AND the configured server is a loopback host. Production builds must omit EXPO_PUBLIC_MOBILE_QA and use HTTPS. DEV_LOGIN stays disabled on the production server.

## Rendering and performance

Native FlatList virtualizes history. Only revised row objects are replaced; unchanged memoized message rows retain their references. Text input state stays in the composer, independent from transcript state. Incoming SSE messages merge by sequence/revision, reconnect with bounded backoff and re-sync after foregrounding. Connections stop in the background. Native navigation handles gestures/transitions; haptics follow explicit actions. Avatars have no perpetual idle animation or runtime tint filters. Image assets are bundled and optimized, with natural fruit colors separate from vivid message colors.

Markdown renders to native Text/View components. Charts use react-native-svg and the same bounded, data-only parser as the web. Photo selection, camera, document selection, audio capture, secure storage, file sharing and image zoom use native modules. No arbitrary HTML is executed in chat.

## Migration and release gates

Keep the existing TestFlight build usable until the new client is verified. Native and web releases are independent: server/API changes must remain backwards compatible; native modules and screen changes require a store/TestFlight build. A web deploy alone cannot update native screens.

Core screens implemented: Google login/access code, team list/search, chief/team avatars, native conversation and streaming, per-bot conversation list/new conversation, model/permission choice, bot creation/settings, memory/skills/task views, routine toggles, app connections, notification inbox and sign-out. Attachments, image viewer, chart rendering, tool disclosures and approval/question/connect cards use native UI.

Remaining parity work must be tracked explicitly rather than hidden behind the web: APNs/FCM background push registration (the native inbox alone is not push delivery), full remote computer viewer/control, theme preferences, editable skills/memories/task workflows, group management, avatar/team reordering, all model variants beyond provider defaults, and production authentication/device verification. Audio transcription still uses the existing server STT service, so native capture alone does not remove server transcription latency.

Verification must report actual simulator and Android device/build coverage separately. A successful Metro bundle is not a device test. No 100% parity/performance claim before these gates pass.

## Commands

From `mobile/`: `npm ci`, `npx expo prebuild`, `npx expo run:ios`, `npx expo run:android`, `npm run typecheck`. Native folders are generated from app.json and excluded from Git; do not hand-edit generated files for production changes. Use config plugins instead.

The mobile dependency lockfile is separate to keep React 19 native dependencies from changing the existing React 18 web installation. The repository's deployment scripts continue to build server/web only.

## Research

The source Grokbot clone documents React/TypeScript/Vite/Zustand for web and Node/Hono/SQLite/SSE for the service: https://github.com/nickvasilescu/grokbot-clone . This is not proof of the proprietary Grok Bot application's implementation.

Anthropic's published mobile roles identify Swift/UIKit/SwiftUI for iOS and Kotlin/Jetpack Compose for Android: https://job-boards.greenhouse.io/anthropic/jobs/4572744008 and https://job-boards.greenhouse.io/anthropic/jobs/4899511008 . Job descriptions indicate team technologies, not a complete source-code audit. No verified complete internal stack for ChatGPT or proprietary Grok Bot is asserted.

Expo documents its native architecture and cross-platform workflow: https://docs.expo.dev/guides/new-architecture/ and https://docs.expo.dev/tutorial/introduction/ . We choose it for Fino's cross-platform needs, rather than claiming it is what a competitor uses.
