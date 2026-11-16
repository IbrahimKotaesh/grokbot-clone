# Per-bot memory and model continuity

There are three distinct layers:

1. **Saved conversation archive:** SQLite message rows, files and photos. Changing providers does not delete them. New-conversation generations remain distinct; history search stays in the current generation unless explicitly asked to include earlier conversations.
2. **Durable memories:** per-bot facts/preferences saved through `remember` or Settings → Memories → Save memory. Exact normalized duplicates are skipped. New facts emit a UI refresh event. They are included in the system prompt under a bounded relevance budget, and can be found with `recall`.
3. **Working model context:** the native subscription session. It is finite and provider managed. Fino does not receive a reliable usage percentage, so native models show saved fact/message counts instead of an unrelated xAI history meter.

The subscription providers do not run the xAI-only idle memory-consolidation job. The UI no longer promises that job for these providers. Models are instructed to immediately save stable preferences, explicit remember requests and lasting role corrections. This is model-driven fact selection, not a guarantee that every sentence automatically becomes a saved memory.

`recall` handles Unicode/Arabic queries, diacritics and common letter variants, ranks matching older facts before unrelated recent ones, and stays scoped to the current bot. `search_conversation` retrieves older chat evidence beyond the bounded session bootstrap, with timestamps and excerpt/search-limit notices. It scans up to 5000 messages and returns at most 10 excerpts, not a claim of unlimited context.

On a provider change, the destination provider's stale cached session pointer is invalidated. The next turn starts with current saved conversation context, durable facts and archive lookup tools rather than resuming a session that missed the other provider's messages. Canonical chat rows, attachments, durable memories and the conversation generation are preserved. Saving the same provider does not reset its session.

No paid API or separate vector database is required for this implementation. Native compaction is separate from durable memory. An important fact should be explicitly saved and verified in the Memories tab; a long chat alone is not proof that it has become a durable preference.
