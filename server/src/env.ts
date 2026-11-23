import os from 'node:os';
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const env = {
  agentProvider: process.env.AGENT_PROVIDER ?? 'codex',
  computerProvider: process.env.COMPUTER_PROVIDER ?? 'local',
  codexBin: process.env.CODEX_BIN ?? '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
  claudeBin: process.env.CLAUDE_BIN ?? `${os.homedir()}/.local/bin/claude`,
  claudeModel: process.env.CLAUDE_MODEL || undefined,
  codexModel: process.env.CODEX_MODEL || undefined,
  port: Number(process.env.PORT ?? 8787),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  /** Public URL of this server, used for OAuth callbacks. */
  serverUrl: process.env.SERVER_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  xaiKey: process.env.XAI_API_KEY || 'disabled',
  xaiModel: process.env.XAI_MODEL ?? 'grok-4.7',
  composioKey: process.env.COMPOSIO_API_KEY || 'disabled',
  orgoKey: process.env.ORGO_API_KEY || 'disabled',
  /** Orgo workspace that holds every user's box. */
  orgoWorkspaceId: process.env.ORGO_WORKSPACE_ID ?? '',
  /** Orgo box size for new users. */
  orgoRamGb: Number(process.env.ORGO_RAM_GB ?? 8),
  orgoCpu: Number(process.env.ORGO_CPU ?? 2),
  orgoResolution: process.env.ORGO_RESOLUTION ?? '1280x800x24',
  sessionSecret: req('SESSION_SECRET'),
  // Fino is open to everyone by default: no email allowlist and no access-code gate. PUBLIC_SIGNUP=0 makes a private server.
  publicSignup: process.env.PUBLIC_SIGNUP !== '0',
  allowedEmails: process.env.PUBLIC_SIGNUP !== '0' ? [] : (process.env.ALLOWED_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  // The passwordless local login would let anyone open any account on a public site, so it is off there.
  devLogin: process.env.DEV_LOGIN === '1' && process.env.PUBLIC_SIGNUP === '0',
  dbPath: process.env.DB_PATH ?? new URL('../../data/grokbot.db', import.meta.url).pathname,
};
