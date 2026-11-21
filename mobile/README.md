# Fino native mobile

React Native / Expo client for iOS and Android. The web UI remains in `../web`; both clients use the same server and contracts. This app has no WebView shell.

```
npm ci
npm run typecheck
npx expo prebuild
npm run ios
npm run android
```

Use `EXPO_PUBLIC_API_URL` to choose your HTTPS workspace. Omit it to use the current Fino workspace. Public environment variables are compiled into the application, so they must never contain credentials. Sessions live in platform secure storage and are separated by server hostname. API/provider keys remain on the server.

Build iOS with Xcode and Android with the Android SDK/JDK. Production signing uses your Apple/Google developer accounts. Generated `ios/` and `android/` folders are ignored; app configuration and the scene migration plugin are committed so generation is reproducible.

A standalone QA build can use `EXPO_PUBLIC_API_URL=http://127.0.0.1:8791 EXPO_PUBLIC_MOBILE_QA=1` against a separate DB and a server with DEV_LOGIN=1. The QA login cannot appear for a public host; production builds must omit the flag. Android emulator loopback uses `10.0.2.2` instead. Use a signed simulator build when testing SecureStore, not CODE_SIGNING_ALLOWED=NO.

See [architecture, coverage and remaining migration work](../docs/MOBILE-ARCHITECTURE.md). The native app is being migrated; a native inbox is not yet APNs/FCM background push, and a successful JS export is not Android device validation.
