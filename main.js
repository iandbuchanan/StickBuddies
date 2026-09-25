// StickBuddies — the window they live in.
// A see-through window over your whole desktop. The buddies can only SEE where your
// windows are (so they can stand on them). They can't open, change or delete anything.

const { app, BrowserWindow, screen, ipcMain, globalShortcut, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Windows thinks a see-through window is "hidden" and pauses it. Keep the buddies moving.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const MUSIC_DIR = path.join(__dirname, 'music');
const LOG = path.join(__dirname, 'debug.log');
const MEMORY = path.join(__dirname, 'memory.json'); // everything the buddies have learned
let win = null, watcher = null;

function createWindow() {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    x, y, width, height,
    transparent: true, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, focusable: false, alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
    },
  });
  // Stay on top of every window and tab, even after you click on something else.
  win.setAlwaysOnTop(true, 'screen-saver');
  setInterval(() => { if (win && win.isVisible()) { win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop(); } }, 2000);
  // Clicks pass through to your desktop unless you're pointing at a buddy.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html');

  try { if (fs.statSync(LOG).size > 1500000) fs.writeFileSync(LOG, fs.readFileSync(LOG, 'utf8').slice(-600000)); } catch { /* no log yet */ }
  fs.appendFileSync(LOG, `\n===== started ${new Date().toLocaleString()} =====\n`);
  win.webContents.on('console-message', (e, _level, message) => {
    fs.appendFileSync(LOG, `[page] ${e.message ?? message}\n`);
  });
  win.webContents.on('render-process-gone', (_e, d) => fs.appendFileSync(LOG, `[crash] ${JSON.stringify(d)}\n`));
  win.webContents.once('did-finish-load', startWindowWatcher);

  screen.on('display-metrics-changed', () => {
    if (win) win.setBounds(screen.getPrimaryDisplay().workArea);
  });
}

ipcMain.on('mouse-over', (_e, over) => {
  if (win) win.setIgnoreMouseEvents(!over, { forward: true });
});

// ---------------------------------------------------------------- memories
ipcMain.on('load-memory', e => {
  try { e.returnValue = JSON.parse(fs.readFileSync(MEMORY, 'utf8')); } catch { e.returnValue = {}; }
});
ipcMain.on('save-memory', (_e, data) => {
  try {
    fs.writeFileSync(MEMORY + '.tmp', JSON.stringify(data));
    fs.renameSync(MEMORY + '.tmp', MEMORY); // write-then-swap so a crash can't leave a half-written file
  } catch (err) { fs.appendFileSync(LOG, `[memory] save failed: ${err.message}\n`); }
});
// Before closing, ask the buddies to save, wait for it, then quit.
let saving = false;
function saveThenQuit() {
  if (saving || !win) { app.exit(0); return; }
  saving = true;
  ipcMain.once('save-memory', () => setTimeout(() => app.exit(0), 50));
  win.webContents.send('save-now');
  setTimeout(() => app.exit(0), 3000);
}
// "Stop StickBuddies.bat" drops this file to ask for a polite shutdown.
const STOP_FILE = path.join(__dirname, 'stop.request');
try { fs.unlinkSync(STOP_FILE); } catch { /* not there */ }
setInterval(() => { if (fs.existsSync(STOP_FILE)) { try { fs.unlinkSync(STOP_FILE); } catch { } saveThenQuit(); } }, 500);

// ---------------------------------------------------------------- their code
// The buddies write little JavaScript programs into "their code\<name>\" and run them with Node.
// They can only write .js files in that folder, and only run files they wrote.
const CODE_DIR = path.join(__dirname, 'their code');
const cleanName = s => String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/^\.+/, '').slice(0, 50).trim() || 'file';
ipcMain.handle('write-code', (_e, who, file, text) => new Promise(resolve => {
  try {
    const dir = path.join(CODE_DIR, cleanName(who));
    let name = cleanName(file); if (!name.endsWith('.js')) name += '.js';
    const full = path.join(dir, name);
    if (path.relative(CODE_DIR, full).startsWith('..')) return resolve({ ok: false, out: 'not allowed' });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full, String(text).slice(0, 20000), 'utf8');
    execFile('node', [full], { cwd: dir, timeout: 5000, maxBuffer: 64 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout + (stderr || '')).slice(0, 2000) });
    });
  } catch (err) { resolve({ ok: false, out: err.message }); }
}));

// ---------------------------------------------------------------- what they like
const LIKES = path.join(__dirname, 'what they like.txt');
ipcMain.on('save-likes', (_e, text) => {
  try { fs.writeFileSync(LIKES, String(text).slice(0, 100000), 'utf8'); } catch (err) { fs.appendFileSync(LOG, `[likes] ${err.message}\n`); }
});

ipcMain.handle('music-list', () => {
  try {
    return fs.readdirSync(MUSIC_DIR)
      .filter(n => /\.(mp3|ogg|wav|m4a|flac|aac)$/i.test(n))
      .map(n => pathToFileURL(path.join(MUSIC_DIR, n)).href);
  } catch { return []; }
});

// ---------------------------------------------------------------- window watcher
// A tiny PowerShell helper that only READS where your windows are.
// The top edge of each window becomes a floor the buddies can stand on.
const WATCHER = `
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class SBWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  static string Esc(string s) { var o = new StringBuilder(); foreach (char c in s) { if (c == '"' || c == (char)92) o.Append((char)92); if (c >= 32) o.Append(c); } return o.ToString(); }
  public static string Focus() {
    IntPtr h = GetForegroundWindow(); if (h == IntPtr.Zero) return "null";
    var t = new StringBuilder(300); GetWindowText(h, t, 300);
    uint pid; GetWindowThreadProcessId(h, out pid); string exe = "";
    try { exe = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
    RECT r; DwmGetWindowAttribute(h, 9, out r, 16);
    string q = ((char)34).ToString(); // a " character
    return "[" + h.ToInt64() + "," + q + Esc(exe) + q + "," + q + Esc(t.ToString()) + q + "," + r.L + "," + r.T + "," + r.R + "," + r.B + "]";
  }
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static string List() {
    var sb = new StringBuilder("["); bool first = true; IntPtr shell = GetShellWindow();
    EnumWindows((h, l) => {
      if (h == shell || !IsWindowVisible(h) || IsIconic(h) || GetWindowTextLength(h) == 0) return true;
      int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4); if (cloaked != 0) return true;
      int ex = GetWindowLong(h, -20); if ((ex & 0x20) != 0 || (ex & 0x80) != 0) return true;
      RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) return true;
      if (r.R - r.L < 120 || r.B - r.T < 60) return true;
      if (!first) sb.Append(","); first = false;
      sb.Append("[" + h.ToInt64() + "," + r.L + "," + r.T + "," + r.R + "," + r.B + "]");
      return true;
    }, IntPtr.Zero);
    return sb.Append("]").ToString();
  }
}
"@
[SBWin]::SetProcessDPIAware() | Out-Null
while ($true) { [Console]::Out.WriteLine('{"w":' + [SBWin]::List() + ',"fg":' + [SBWin]::Focus() + '}'); [Console]::Out.Flush(); Start-Sleep -Milliseconds 250 }
`;

function subtractSpan(segs, a, b) {
  const out = [];
  for (const [x1, x2] of segs) {
    if (b <= x1 || a >= x2) { out.push([x1, x2]); continue; }
    if (a > x1) out.push([x1, a]);
    if (b < x2) out.push([b, x2]);
  }
  return out;
}

function startWindowWatcher() {
  const file = path.join(app.getPath('temp'), 'stickbuddies-windows.ps1');
  fs.writeFileSync(file, WATCHER, 'utf8');
  watcher = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
  watcher.stderr.on('data', d => fs.appendFileSync(LOG, `[windows] error: ${d.toString().slice(0, 300)}\n`));
  watcher.on('exit', () => { watcher = null; });
  const handle = win.getNativeWindowHandle();
  const myHwnd = String(handle.length >= 8 ? handle.readBigInt64LE(0) : handle.readInt32LE(0));
  let buf = '', lastSent = '', lastFocus = '';
  watcher.stdout.on('data', chunk => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    const line = lines.pop();
    if (!line || !win) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const list = msg.w;
    const d = screen.getPrimaryDisplay(), sf = d.scaleFactor, wa = d.workArea;
    // which app you're using right now (so they can watch your game or react to it)
    if (msg.fg && String(msg.fg[0]) !== myHwnd) {
      const [h, exe, title, l, t, r, b] = msg.fg;
      const full = l <= d.bounds.x * sf + 2 && t <= d.bounds.y * sf + 2 && r >= (d.bounds.x + d.bounds.width) * sf - 2 && b >= (d.bounds.y + d.bounds.height) * sf - 2;
      const focus = { win: String(h), exe: String(exe).toLowerCase(), title: String(title).slice(0, 200), full,
        x1: Math.round(l / sf - wa.x), y1: Math.round(t / sf - wa.y), x2: Math.round(r / sf - wa.x), y2: Math.round(b / sf - wa.y) };
      const key = `${focus.win}|${focus.exe}|${focus.title}|${full}`;
      if (key !== lastFocus) { lastFocus = key; win.webContents.send('focus', focus); }
    }
    // Windows come top-most first. A window hides the top edge of windows underneath it.
    const rects = list
      .map(([h, l, t, r, b]) => ({ h: String(h), l: l / sf - wa.x, t: t / sf - wa.y, r: r / sf - wa.x, b: b / sf - wa.y }))
      .filter(w => w.h !== myHwnd)
      .filter(w => !(w.l <= 0 && w.t <= 0 && w.r >= d.bounds.width && w.b >= d.bounds.height)); // invisible full-screen layers
    const plats = [];
    rects.forEach((w, i) => {
      if (w.t < 60 || w.t > wa.height - 40) return;
      let segs = [[Math.max(0, w.l), Math.min(wa.width, w.r)]];
      for (let j = 0; j < i; j++) {
        const o = rects[j];
        if (o.t <= w.t + 1 && o.b > w.t) segs = subtractSpan(segs, o.l, o.r);
      }
      for (const [a, b] of segs) {
        if (b - a > 40) plats.push({ win: w.h, wl: Math.round(w.l), x1: Math.round(a), x2: Math.round(b), y: Math.round(w.t) });
      }
    });
    const alive = list.map(w => String(w[0])).filter(h => h !== myHwnd); // every open (not minimized) window
    const json = JSON.stringify([plats, alive]);
    if (json !== lastSent) { lastSent = json; win.webContents.send('windows', { plats, alive }); }
  });
}

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(() => {
  // Ears: let the buddies HEAR the computer's sound (to tell music from talking). Nothing is recorded.
  session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then(sources => callback({ video: sources[0], audio: 'loopback' }))
      .catch(() => callback({}));
  }, { useSystemPicker: false });
  createWindow();
  const send = ch => () => win && win.webContents.send(ch);
  globalShortcut.register('CommandOrControl+Alt+B', send('brain'));
  globalShortcut.register('CommandOrControl+Alt+M', send('music'));
  globalShortcut.register('CommandOrControl+Alt+H', () => {
    if (!win) return;
    if (win.isVisible()) win.hide(); else win.showInactive();
  });
  globalShortcut.register('CommandOrControl+Alt+Q', saveThenQuit);
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); if (watcher) watcher.kill(); });
app.on('window-all-closed', () => app.quit());
