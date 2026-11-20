# Chats within a bot

Use the **+** beside a bot in the sidebar, then **New chat**, to start a separate conversation. Saved conversations appear beneath that bot; select one to reopen it, or use its pencil to rename it. Existing conversations remain available.

Each chat has its own message history, attachments, provider session and pending approvals. Switching chats does not move a running reply: it returns to the conversation where the request started. Drafts and the selected chat are remembered per bot on the current browser. A bot processes queued tasks one at a time.

The bot's model, permissions, connected apps, computer and durable memory are shared between its chats. Subchats are context boundaries, not separate security identities. Earlier conversations can still be searched when the owner explicitly asks. Routines and unsolicited bot messages use the main chat; notifications link to the originating chat.

Authenticated owner endpoints: `GET/POST /api/bots/:id/chats` and `PATCH /api/bots/:id/chats/:generation`. Message and row endpoints accept an explicit generation. Legacy clients default to the main conversation. Provider session tables use `(bot_id, generation)` keys; migration preserves existing sessions. Row sequence numbers remain unique across all chats belonging to a bot.

Verification: `node tests/subchats.mjs` with `DB_PATH=:memory:` and a test `SESSION_SECRET`; `node tests/subchat-client.mjs` checks browser-store isolation. Build the server before running server tests.
