# Automatic memory in Fino

## Selected architecture

The response model stays independently selectable for every bot. An asynchronous curator uses the existing official Claude subscription CLI, not an extracted OAuth token or a paid model API. Its isolated session has no tools, MCP servers, project settings, bot-session resume or persistent session transcript. It returns structured JSON containing exact quotes and source row IDs. The app validates the source's owner, bot, generation and quoted text before writing. Only direct user messages are eligible; assistant text, routine/tool outputs, other-bot messages and uploaded documents are not automatically promoted to facts.

SQLite remains canonical for all saved memories and revisions. Mem0 2.2.1 indexes those facts in local embedded Qdrant, using multilingual-e5-small's AVX512-VNNI int8 ONNX encoder (384 dimensions, one CPU thread). No PyTorch, graph database, reranker, cloud memory service or hosted embedding API is used. Mem0's `infer=False` is intentional: the separate evidence-checked curator handles extraction, while Mem0 handles storage and retrieval.

## Processing and failure behavior

- Direct user messages enqueue persistent SQLite jobs. A ten-second sweep waits at least twenty seconds and avoids bots already busy at the start of a batch. One curator runs at a time, up to three messages per batch. Restart bootstrap checks up to sixty recent direct messages per bot; completed jobs are not replayed.
- Each source is bounded to its first 2,000 characters, and candidate existing facts to a 2,500-character budget. This does not silently claim to understand all large messages or attachment content.
- Credentials are screened before extraction and again before writing. This is a defensive filter, not a universal secret detector.
- Saved text is a short verbatim user quote, never the model's invented paraphrase. Exact normalized duplicates are skipped. Explicit supported corrections can replace an automatically saved fact, preserving its previous version. Automatically inferred changes cannot overwrite manually saved/edited facts.
- Manual facts, edits and deletions reconcile to Mem0. Deleted or foreign IDs returned by a stale index are filtered against canonical bot-owned SQLite rows before inclusion in a prompt.
- A semantic lookup is bounded to 300 ms and five results/2,000 characters. Timeout or service failure falls back to the existing keyword memory and conversation archive; chat continues. This bound is not an end-to-end chat latency guarantee.
- Curator failure retries with backoff up to four attempts, then leaves a visible-to-operators failed job. Existing memories are retained. Automatic extraction consumes subscription quota.

## Measured selection, 2026-11-17

Synthetic tests on the 2-vCPU, 4-GB production VPS, without changing real bot chats:

| Candidate | Result |
| --- | --- |
| Qwen3.5-0.8B Q4_0 | Missed clear Arabic and English preferences; rejected. |
| Qwen3.5-2B Q4_K_M | Extracted preferences, but treated an Arabic weather question as a durable fact. Initial preference extraction took 41–59 seconds, with roughly 1.5 GB model memory; rejected. |
| Existing Claude subscription curator | Passed five examples: Arabic preference, English preference, question rejection, hypothetical rejection, and correction referring to the old fact ID. 4.449–5.863 seconds per example. |
| Local Mem0/E5 semantic search | Correct first result on three Arabic/English queries over two synthetic memories. 19–134 ms; first indexing of two facts took 795 ms. |

These are small smoke tests, not universal accuracy benchmarks or a production p95 claim. The failed local generative models were stopped and their downloaded weights removed. They are not used as a fallback.

## Deploy

Run `bash infra/memory/install.sh` as root on x86_64 Linux with Python 3.14 and the existing `grokbot` service account. The script creates the separate venv, downloads and checksums the ONNX weights, installs a localhost-only service on 8842, disables Mem0 telemetry and creates `/etc/fino-memory.env` (root:grokbot, 0640). The service has a 650-MB memory ceiling and 70% CPU quota. The model/tokenizer are public downloads; chat data is not uploaded to Hugging Face.

Set `FINO_MEMORY_URL=http://127.0.0.1:8842` and the same `FINO_MEMORY_KEY` in `/etc/grokbot.env`; never commit the key. Optional `FINO_MEMORY_CURATOR_MODEL` selects a Claude model; default follows `CLAUDE_MODEL` or the CLI default. The app account must already be logged into its Claude subscription. Restart grokbot after configuration. The service binds to loopback and requires the bearer key even locally.

Run `tests/memory-service-smoke.py` with `/etc/fino-memory.env` loaded for synthetic semantic retrieval/update/deletion tests. Run `tests/memory-curator-smoke.mjs` as the app user with its normal environment for the five actual subscription tests. `tests/automatic-memory.mjs` checks evidence grounding, retries, ownership/generation isolation, secret filtering, protected manual facts and correction revisions without a model.

The standard GitHub deployment updates the Node worker. Changes to `infra/memory/service.py` or its requirements need a separate service deployment/restart. Index data is rebuildable; do not replace or delete the main app database.

## Rollback and operator checks

Remove `FINO_MEMORY_URL` from the app environment and restart grokbot to disable both automatic extraction and semantic lookup. Existing facts, archive and manual memory tools remain. Stop `fino-memory.service` if desired. No main DB migration removes old data.

Check service health with the local bearer key; never print it. Inspect `auto_memory_jobs` counts by status in the main database, `systemctl status fino-memory`, and service memory/CPU. Error logs contain a generic deferred-job message rather than raw transcripts or model errors. Failed jobs can be deliberately reset to pending after fixing the cause.
