# Fino notifications

Fino keeps an authenticated notification inbox and can send encrypted Web Push alerts to opted-in devices. No paid push service or mail API is required. Enable each device through the bell → Notifications → Enable notifications. On iPhone, add Fino to the Home Screen from Safari and open that installed icon before enabling. The existing PWA manifest and HTTPS deployment support that flow. Embedded browsers that lack Push/Notifications APIs display instructions instead of claiming push is enabled.

Important completed routine/system replies and new approval/question cards create alerts. A turn that calls `stay_silent`, or only produces punctuation/emoji, does not create a reply alert. Replies to direct user messages are opt-in per device. Bots may call `notify_user` for a requested device alert; the ordinary turn alert is then suppressed to avoid duplication. Clicking an alert opens that bot and marks the alert read. Existing open Fino windows receive a message rather than a reload, preserving drafts.

The default lock-screen payload has the bot name and “Open Fino to read this update.” Full previews require a per-device opt-in. Disable removes the server subscription and unsubscribes that browser. Normal logout also disables this device; other devices remain enabled.

VAPID keys are generated once into `push-vapid.json` beside the persistent SQLite database, with mode 0600. `PUSH_VAPID_FILE` overrides the path. Back up this private file alongside the database; replacing the key pair invalidates existing browser subscriptions. Never commit or expose its private key. `/api/push/config` returns only the public key.

Subscriptions and the per-device delivery queue survive app restarts/releases. Accepted pushes are marked sent; transient errors retry up to four attempts with backoff. HTTP 404/410 removes expired subscriptions. Pending alerts older than 24 hours are not delivered. Browser/OS Focus settings, revoked permissions, offline devices and browser support can still prevent display; an accepted push-service response does not guarantee a visible phone notification.

Push destinations are restricted to HTTPS Apple, Google, Mozilla and Microsoft push hosts, with no custom ports or URL credentials. The inbox and every device operation are owner scoped. Each account can register up to ten endpoints. The normal app starts the delivery worker; scheduler-disabled verification instances do not start a second timer.

Validation: tests cover signed/encrypted request creation, owner isolation, endpoint validation, preview defaults, deduplication, attention alerts, retries, expired subscriptions, visible service-worker notifications and safe deep links. Complete a real-device test after granting permission; an automated transport test does not prove notification delivery to an iPhone.
