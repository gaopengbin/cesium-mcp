import { spawn, execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const HTTP_PORT = process.env.CESIUM_HTTP_PORT || '9101';
const ION_TOKEN = process.env.CESIUM_ION_TOKEN || '';
const WS_PORT = process.env.CESIUM_WS_PORT || '9100';

const params = new URLSearchParams();
if (ION_TOKEN) params.set('token', ION_TOKEN);
if (WS_PORT !== '9100') params.set('ws', WS_PORT);
const qs = params.toString() ? `?${params.toString()}` : '';
const VIEWER_URL = `http://localhost:${HTTP_PORT}${qs}`;

function isServerRunning() {
  try {
    execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${HTTP_PORT}`, {
      timeout: 2000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function startViewerServer() {
  const serverScript = resolve(PLUGIN_ROOT, 'scripts', 'start-server.js');
  const child = spawn('node', [serverScript], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, CESIUM_HTTP_PORT: HTTP_PORT },
  });
  child.unref();
}

function openBrowser() {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', VIEWER_URL], { detached: true, stdio: 'ignore' }).unref();
    } else if (platform === 'darwin') {
      spawn('open', [VIEWER_URL], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [VIEWER_URL], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch { /* ignore */ }
}

if (!isServerRunning()) {
  startViewerServer();
  setTimeout(openBrowser, 1000);
} else {
  openBrowser();
}

process.stdout.write(JSON.stringify({
  continue: true,
  suppressOutput: true,
}));
