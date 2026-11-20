# Private access code

Fino supports an owner-chosen fixed code (6–12 digits) before normal account sign-in. This is a shared workspace lock, not an authenticator/TOTP implementation. Set it in Settings → Account. Changing it requires the existing code, owner session and unlocked browser.

The server stores only a salted scrypt hash and a random cookie signing key in `access-secret.json` alongside its private database, or at `FINO_ACCESS_FILE`. The file is created atomically with mode 0600 and must stay outside Git. Unlocks use a signed HttpOnly SameSite=Lax cookie, Secure on HTTPS, lasting seven days. Changing the code rotates the signing key and revokes previous unlocks. Account authentication is still required after unlocking. API requests, desktop WebSocket connections and ongoing SSE streams check the access lock. The public health response is the only non-access API exception.

Failed and in-flight attempts reserve persisted rate-limit slots: five attempts per client address and thirty across the installation per fifteen-minute window. Caddy is the only public entry point; the app binds loopback, and uses Caddy's forwarded address. No PIN or hash is logged or sent to model providers.

For deployment, securely install the owner-enrolled private hash file at `/var/lib/grokbot/access-secret.json` as grokbot:0600, set `FINO_ACCESS_REQUIRED=1` in `/etc/grokbot.env`, and deploy the code. This flag fails closed if the private file becomes missing/corrupt. Verify unsigned API requests fail, a valid access unlock still requires account sign-in, and VNC cannot bypass the lock, before retiring an outer proxy password. Preserve the protected backup configuration until validation passes. Never copy a development database over the production database.

The live server's temporary Caddy password is independent of this feature and remains until the owner's chosen code has been enrolled and the application gate has been deployed and verified.
