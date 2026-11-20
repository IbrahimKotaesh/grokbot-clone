# External-content safeguards

Emails, uploaded documents, websites, screenshots, historical chat excerpts and tool results are data. They cannot authorize the agent to run commands, disclose credentials or change its permissions. The system prompt states this boundary and external tool outputs are wrapped with an explicit trust label. The same execution policy is used for Codex, Claude and the Responses tool loop.

## Enforced outside the model

* Arbitrary shell commands/scripts, remote code execution, infrastructure, credentials and permission-related tools need approval for the exact request. Only a small positive list of simple read commands bypasses this additional check. Autonomous and saved Always allow grants cannot waive this review.
* Those approval cards offer Allow once and Don't allow. A client submitting Always anyway is treated as Allow once; no permanent grant is stored. Other saved action permissions continue to work normally.
* Recognizable suspicious instructions in external text cause a warning and one owner notification for the affected conversation. Subsequent changes, delegation, browser interaction and memory/routine changes in that conversation require individual approval. Reading and reporting to the owner remain available. The flag is stored in SQLite and survives restarts, scoped to the conversation generation. A fresh conversation starts a new scope; old external content must not be treated as new authority.
* The agent can report suspicious image/OCR content and patterns not caught by the text heuristic using report_suspicious_content. A flagged conversation passes the caution flag to a delegated bot, so delegation cannot silently restore autonomous changes.
* Assistant Markdown never automatically loads external image URLs. They render as links requiring a click. Uploaded/generated images served by Fino remain inline. This closes one automatic request path that could otherwise carry sensitive text in an image URL.
* Security alerts contain a static explanation, not credentials or the full attacker-controlled message. Repeated suspicious content in the same conversation does not produce repeated push alerts.

## Boundaries and limitations

Pattern detection is an indicator, not proof or a comprehensive injection detector. Encoded, multilingual and image-based attacks can be missed, and legitimate discussions of security can trigger a warning. Prompt wording and trust labels are advisory; the independent approval checks and isolation are the enforcement layers. This is not a guarantee that an autonomous agent can never disclose data or misuse ordinary connected-app permissions. Review the exact action and destination before approving it; do not give the desktop container host/root credentials.

The deployed desktop container was checked as unprivileged, using bridge networking, with only its own named data volume and no host-directory/Docker-socket mounts. That reduces direct access to the host but is not a substitute for keeping the runtime patched and limiting connected-account permissions. This change does not add network egress filtering or a full action/recipient allowlist for every service.

The existing automatic-memory pipeline accepts source evidence only from direct owner chat messages, excluding tool output and other-bot messages. Suspicious-source instructions must not be promoted to permanent memory through explicit memory tools without review.

Validation: tests/prompt-injection.mjs uses isolated synthetic email payloads and no real mailbox or external tool execution. It checks trust wrapping, quarantine, warning deduplication, nested app execution, fresh approval enforcement even with saved grants, forged Always submissions and scope reset. Existing permission and Markdown rendering checks cover ordinary approvals and image request behavior.

Reference: [OWASP prompt-injection guidance](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) recommends separation of external data, least privilege and human approval for high-risk actions; prompt instructions alone are insufficient.
