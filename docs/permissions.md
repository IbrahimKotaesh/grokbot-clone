# Chat permissions and private Sheets previews

Each bot has a persisted permission mode, selected beside the model in the composer:

- **Read only**: connected read tools, screenshots, memories and discovery. Blocks shell, browser interaction, writes, scheduling and delegation. This is an application tool restriction, not a claim that arbitrary browser browsing can be made safe.
- **Balanced** (existing/default behavior): local Linux computer tools run freely; connected app writes or opaque remote code ask for approval unless previously allowed.
- **Ask first**: also asks before computer actions and commands. Reads and discovery do not prompt.
- **Autonomous**: local computer actions and connected app changes run without approval, except explicit blocked policies. This includes actions such as sending email and modifying files in connected accounts.

Modes are enforced by the shared tool executor for both subscription providers. Existing bots remain Balanced. New delegated bots inherit their parent's mode. The Linux container boundary does not change. Already-running actions cannot be revoked; mode changes apply when the next tool is checked.

“Always allow” is an owner-level choice for the displayed tool/action, across bots. Opaque remote-workbench permission covers arbitrary connected-app code executed through that workbench; it is broader than an individual Gmail action. Batch approval persists each displayed inner tool. Explicit blocks and Read only restrictions override saved allows.

Google Sheets links offer a read-only preview through the signed-in Fino owner's existing Composio Google Sheets connection. No sharing permissions change. Preview requests use a fixed Google API host and GET only, are limited to A1:T100 per worksheet, coalesce concurrent requests and cache results per owner for 45 seconds. Missing connection, denied access and quota errors have separate messages. Opening the editable Google site still requires a Google session in that browser; Fino's session does not create Google browser cookies.
