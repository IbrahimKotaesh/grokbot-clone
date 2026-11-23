import { spawn } from 'node:child_process';
import os from 'node:os';
import { posix } from 'node:path';

export const limaBin = process.env.LIMA_BIN ?? `${os.homedir()}/.local/grokbot-runtime/bin/limactl`;
const transport = process.env.DESKTOP_TRANSPORT ?? 'lima';
const wsBind = process.env.DESKTOP_WS_BIND === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';
const vncBase = Number(process.env.DESKTOP_VNC_BASE_PORT ?? 6080);
if (!Number.isInteger(vncBase) || vncBase < 1 || vncBase > 65532) throw new Error('Invalid desktop VNC port');
const vm = process.env.LIMA_INSTANCE ?? 'grokbot';
const quote = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`;
const display = (screen?: string) => {
  const n = screen && screen !== 'default' ? Number(screen.replace('screen-', '')) : 0;
  if (!Number.isInteger(n) || n < 0 || n > 3) throw new Error('Invalid screen');
  return n;
};
export function localShell(command: string, screen?: string, timeout = 120): Promise<{ success: boolean; output: string; exit_code: number }> {
  const n = display(screen);
  return new Promise((resolve, reject) => {
    // On Linux the root-owned wrapper executes only inside the fixed desktop container.
    const binary = transport === 'container' ? '/usr/bin/sudo' : limaBin;
    const args = transport === 'container' ? ['-n', '/usr/local/sbin/grokbot-desktop-exec'] : ['shell', '--workdir=/', vm, 'sudo', '-H', 'bash', '-s'];
    const p = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let size = 0;
    const timer = setTimeout(() => { p.kill('SIGTERM'); reject(new Error('Linux command timed out')); }, (timeout + 5) * 1000);
    const collect = (b: Buffer) => { size += b.length; if (size < 20_000_000) output += b.toString(); else p.kill(); };
    p.stdout.on('data', collect); p.stderr.on('data', collect);
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ success: code === 0, output, exit_code: code ?? 1 }); });
    p.stdin.on('error', () => {});
    p.stdin.end(`export DISPLAY=:${n} HOME=/root\ncd /root/grokbot\ntimeout ${Math.max(1, Math.min(timeout, 300))} bash -c ${quote(command)}\n`);
  });
}
async function checked(command: string, screen?: string) {
  const r = await localShell(command, screen);
  if (!r.success) throw new Error(r.output || 'Linux command failed');
  return r.output;
}
const screenInfo = (n: number) => ({ id: n ? `screen-${n}` : 'default', display: `:${n}`, width: 1280, height: 800, default: n === 0 });
async function startScreen(n: number) {
  const s = screenInfo(n);
  const portsReady = `python3 -c 'from pathlib import Path; ports={int(line.split()[1].split(":")[1],16) for line in Path("/proc/net/tcp").read_text().splitlines()[1:] if line.split()[3]=="0A"}; raise SystemExit(0 if {${6080+n},${5900+n}} <= ports else 1)'`;
  await checked(`exec 9>/tmp/grokbot-screen-${n}.lock; flock -w 15 9 || exit 1;
    mkdir -p /root/grokbot/screens/${n}; if ! xdpyinfo -display :${n} >/dev/null 2>&1; then nohup Xvfb :${n} -screen 0 1280x800x24 -ac >/tmp/grokbot-x-${n}.log 2>&1 </dev/null 9>&- & sleep 1; fi
    mkdir -p /root/.config/pcmanfm/fino-${n};
    printf '[*]\nwallpaper_mode=color\ndesktop_bg=#dbece5\ndesktop_fg=#184e3c\nshow_documents=1\nshow_trash=1\nshow_mounts=1\n' > /root/.config/pcmanfm/fino-${n}/desktop-items-0.conf
    wm_ready() { id=$(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | awk '/window id/{print $NF}'); test -n "$id" && xwininfo -id "$id" >/dev/null 2>&1; }
    if ! test -f /tmp/grokbot-screen-${n}.started || ! wm_ready; then
      nohup dbus-run-session -- bash -c 'openbox & xsetroot -solid "#dbece5"; pcmanfm --desktop --profile=fino-${n} & tint2 & wait' >/tmp/grokbot-wm-${n}.log 2>&1 </dev/null 9>&- &
      for attempt in $(seq 1 50); do wm_ready && break; sleep 0.1; done
      wm_ready || { echo 'Desktop window manager did not become ready' >&2; exit 1; }
      touch /tmp/grokbot-screen-${n}.started
    fi
    if ! test -f /tmp/grokbot-relay-${n}.v3 || ! ${portsReady}; then
      pkill -f '^x11vnc -display :${n} ' || true
      pkill -f '^/usr/bin/python3 /usr/bin/websockify ${wsBind}:${6080+n} ' || true
      nohup x11vnc -display :${n} -localhost -rfbport ${5900+n} -forever -shared -nopw -threads -rfbwait 5000 -readtimeout 10 >/tmp/grokbot-vnc-${n}.log 2>&1 </dev/null 9>&- &
      nohup websockify ${wsBind}:${6080+n} localhost:${5900+n} >/tmp/grokbot-ws-${n}.log 2>&1 </dev/null 9>&- &
      touch /tmp/grokbot-relay-${n}.v3
    fi
    for attempt in $(seq 1 50); do
      if ${portsReady}; then exit 0; fi
      sleep 0.1
    done
    echo 'Desktop relay did not become ready' >&2; exit 1`, s.id);
  return s;
}
export const localComputer = {
  workspaces: async () => [{ id: 'local' }],
  createComputer: async (_name: string, _key: string) => { await startScreen(0); return { id: 'local', status: 'running', name: vm }; },
  getComputer: async (_id: string) => { await startScreen(0); return { id: 'local', status: 'running', name: vm, asleep: null as null | { where: string } }; },
  start: async (_id: string) => startScreen(0),
  resume: async (_id: string) => startScreen(0),
  // Keep the local VM running: suspending it would affect every local bot.
  suspend: async (_id: string) => {},
  vncPassword: async (_id: string) => ({ password: '', desktop_api_token: '' }),
  listScreens: async (_id: string) => {
    const r = await checked('ls -1 /root/grokbot/screens');
    return r.trim().split('\n').filter(x => /^[0-3]$/.test(x)).map(Number).map(screenInfo);
  },
  createScreen: async (_id: string) => {
    const r = await checked('ls -1 /root/grokbot/screens');
    const taken = new Set(r.trim().split('\n'));
    for (let n = 1; n < 4; n++) if (!taken.has(String(n))) return startScreen(n);
    throw new Error('All four local screens are allocated');
  },
  getScreen: async (_id: string, screen: string) => startScreen(display(screen)),
  deleteScreen: async (_id: string, _screen: string) => {},
  screenshot: async (_id: string, screen?: string) => {
    const image = await checked('f=$(mktemp --suffix=.png); scrot -o "$f" && base64 -w0 "$f"; result=$?; rm -f "$f"; exit "$result"', screen);
    return { image: image.trim(), mime_type: 'image/png', width: 1280, height: 800 };
  },
  click: async (_id: string, screen: string | undefined, b: {x: number; y: number; button?: string; double?: boolean}) => checked(`xdotool mousemove ${Math.round(b.x)} ${Math.round(b.y)} click ${b.double ? '--repeat 2 --delay 120 ' : ''}${b.button === 'right' ? 3 : b.button === 'middle' ? 2 : 1}`, screen),
  move: async (_id: string, screen: string | undefined, b: {x: number; y: number}) => checked(`xdotool mousemove ${Math.round(b.x)} ${Math.round(b.y)}`, screen),
  drag: async (_id: string, screen: string | undefined, b: {start_x: number; start_y: number; end_x: number; end_y: number}) => checked(`xdotool mousemove ${Math.round(b.start_x)} ${Math.round(b.start_y)} mousedown 1 mousemove ${Math.round(b.end_x)} ${Math.round(b.end_y)} mouseup 1`, screen),
  // Short text is typed key by key. Long text is pasted: the clipboard owner keeps serving until replaced, because
  // with -loops 1 Chrome's first "what formats?" request used up the only answer and the paste came out empty.
  type: async (_id: string, screen: string | undefined, text: string) => checked(text.length <= 200 && !/[\r\n\t]/.test(text)
    ? `xdotool type --clearmodifiers --delay 12 -- ${quote(text)}`
    : `printf '%s' ${quote(text)} | xclip -selection clipboard -i >/dev/null 2>&1; sleep 0.2; xdotool key --clearmodifiers ctrl+v`, screen),
  key: async (_id: string, screen: string | undefined, key: string) => checked(`xdotool key --clearmodifiers ${quote(key.replace(/CTRL/gi, 'ctrl').replace(/ENTER/gi, 'Return'))}`, screen),
  scroll: async (_id: string, screen: string | undefined, b: {x: number; y: number; direction: 'up' | 'down'; amount: number}) => checked(`xdotool mousemove ${Math.round(b.x)} ${Math.round(b.y)} click --repeat ${Math.min(100,Math.max(1,Math.round(b.amount)))} --delay 60 ${b.direction === 'up' ? 4 : 5}`, screen),
  bash: (_id: string, screen: string | undefined, command: string, timeout = 120) => localShell(command, screen, timeout),
  exportFile: async (_id: string, path: string) => {
    path = posix.resolve(path);
    if (!path.startsWith('/root/grokbot/files/')) throw new Error('Only Library files can be exported');
    const data = (await checked(`base64 -w0 -- ${quote(path)}`)).trim();
    return { url: `data:application/octet-stream;base64,${data}` };
  },
};
export const localVncUrl = (screen: string) => `ws://127.0.0.1:${vncBase + display(screen)}`;

/**
 * Restart one bot's screen from scratch: close its browser, stop that display's desktop, viewer relay and X server,
 * then start them again. Other bots' screens are untouched. Patterns use [x] so pkill never matches this script itself.
 */
export async function restartLocalScreen(screen: string, botId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(botId)) throw new Error('Invalid bot id');
  const n = display(screen);
  // x11vnc blocks SIGTERM, so whatever is still alive after a short grace period is killed outright.
  await localShell(`pats=('[u]ser-data-dir=/root/grokbot/profiles/${botId}' '[f]ino-${n} ' '^[x]11vnc -display :${n} ' '^/usr/bin/python3 /usr/bin/[w]ebsockify ${wsBind}:${6080+n} ' '^[X]vfb :${n} ')
    for p in "\${pats[@]}"; do pkill -f "$p" || true; done
    for i in $(seq 1 20); do alive=0; for p in "\${pats[@]}"; do pgrep -f "$p" >/dev/null && alive=1; done; [ $alive = 0 ] && break; sleep 0.1; done
    for p in "\${pats[@]}"; do pkill -9 -f "$p" || true; done
    sleep 0.3
    rm -f /tmp/grokbot-screen-${n}.started /tmp/grokbot-relay-${n}.v3 /tmp/.X${n}-lock /tmp/.X11-unix/X${n} /root/grokbot/profiles/${botId}/Singleton*
    exit 0`, screen, 30);
  await startScreen(n);
  await prepareLocalDesktop(screen, botId);
}

/** Restore a usable desktop and the assistant's persistent browser profile. */
const desktopStarts = new Map<string, Promise<void>>();
export async function prepareLocalDesktop(screen: string, botId: string) {
  const pending = desktopStarts.get(screen);
  if (pending) return pending;
  const task = openLocalBrowser(screen, botId);
  desktopStarts.set(screen, task);
  try { await task; } finally { desktopStarts.delete(screen); }
}
async function openLocalBrowser(screen: string, botId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(botId)) throw new Error('Invalid bot id');
  await checked(`if ! xdotool search --onlyvisible --class chromium >/dev/null 2>&1; then
    mkdir -p /root/grokbot/profiles/${botId};
    ps -eo comm,args | awk '$1 == "chromium" && index($0, "user-data-dir=/root/grokbot/profiles/${botId}") { found=1 } END { exit !found }' || rm -f /root/grokbot/profiles/${botId}/Singleton*;
    setsid nohup chromium --no-sandbox --no-first-run --no-default-browser-check --disable-dev-shm-usage --password-store=basic --user-data-dir=/root/grokbot/profiles/${botId} --start-maximized about:blank >/tmp/chrome-${botId}.log 2>&1 </dev/null &
    sleep 2;
  fi`, screen);
}
