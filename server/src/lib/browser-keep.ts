// Keep the Bots' site logins through restarts and shutdowns of their computer.
//
// Tested on Chrome/Chromium (Linux): on a normal shutdown Chrome throws away "session" cookies (the kind most sites
// use for a login that lasts until you close the browser), and anything from the last ~30 seconds that it hadn't
// written to disk yet. Two things fix both:
//  1. "Continue where you left off" (session.restore_on_startup = 1): Chrome keeps session cookies across restarts,
//     like a normal person's browser that never logs them out.
//  2. Closing Chrome properly (Browser.close over its local debugging port) before the computer stops, so it saves
//     everything first. A plain kill or a machine shutdown doesn't give it that chance.

/** Shell: set the profile to keep its logins, before Chrome starts. Profile paths contain only [\w/-]. */
export function keepLoginsPrefs(profile: string): string {
  if (!/^[\w/-]+$/.test(profile)) throw new Error('Invalid profile path');
  return `python3 -c 'import json,os,sys
p=sys.argv[1]+"/Default/Preferences"
os.makedirs(os.path.dirname(p),exist_ok=True)
try: d=json.load(open(p))
except Exception: d={}
d.setdefault("session",{})["restore_on_startup"]=1
r=d.setdefault("profile",{}); r["exit_type"]="Normal"; r["exited_cleanly"]=True
json.dump(d,open(p,"w"))' ${profile} 2>/dev/null || true`;
}

/**
 * Shell: ask every Bot browser (or only the one using `profile`) to close properly, then wait for it to finish
 * saving (up to about 10 seconds). Prints how many browsers it closed.
 */
export function closeBrowsersCleanly(profile?: string): string {
  if (profile && !/^[\w/-]+$/.test(profile)) throw new Error('Invalid profile path');
  // python3 -c with the code in single quotes (it has none inside), so it stays one shell word and can be followed by `; …`.
  return `python3 -c 'import base64, json, os, re, socket, subprocess, sys, time, urllib.request
only = sys.argv[1] if len(sys.argv) > 1 else ""
def browsers():
    out = subprocess.run(["ps", "-eo", "args"], capture_output=True, text=True).stdout.splitlines()
    return [l for l in out if not l.startswith("python") and "--remote-debugging-port=" in l and "--type=" not in l and (not only or "--user-data-dir=" + only in l)]
def close(port):
    try:
        url = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2))["webSocketDebuggerUrl"]
        path = "/" + url.split("/", 3)[3]
        s = socket.create_connection(("127.0.0.1", port), timeout=3)
        key = base64.b64encode(os.urandom(16)).decode()
        s.send(f"GET {path} HTTP/1.1\\r\\nHost: 127.0.0.1:{port}\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Key: {key}\\r\\nSec-WebSocket-Version: 13\\r\\n\\r\\n".encode())
        head = b""
        while b"\\r\\n\\r\\n" not in head:
            c = s.recv(1)
            if not c: return False
            head += c
        data = json.dumps({"id": 1, "method": "Browser.close"}).encode(); mask = os.urandom(4)
        s.send(bytes([0x81, 0x80 | len(data)]) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))
        time.sleep(0.2)
        return True
    except Exception:
        return False
ports = {int(m) for l in browsers() for m in re.findall(r"--remote-debugging-port=(\\d+)", l)}
closed = sum(1 for p in ports if close(p))
for _ in range(40):
    if not browsers(): break
    time.sleep(0.25)
print(closed)
' ${profile ?? ''}`;
}
