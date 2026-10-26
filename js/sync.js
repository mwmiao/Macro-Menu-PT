// Optional cloud sync through the user's own Google Drive. Data is stored as one JSON file in the
// app's hidden "appDataFolder" (scope drive.appdata: the app can't see any other Drive files).
// No server is involved: Google Identity Services gives the browser a short-lived access token.
//
// Flow: sign in → download remote file → merge with local (core/merge.js) → save merged locally
// → upload if it changed. Local changes are pushed 2.5 s after the last edit. Tokens last ~1 h;
// after that the user taps "Reconnect" (Google needs a click to show its window).
import config from './config.js';
import { mergeData, sanitize } from './core/merge.js';
import { userData, local } from './store.js';

const FILE = 'macro-meals.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TIMEOUT = 15000;

// status.state: 'unconfigured' | 'off' | 'connecting' | 'syncing' | 'synced' | 'reconnect' | 'offline' | 'error'
const status = { state: config.googleClientId ? 'off' : 'unconfigured', email: null, last: null, error: null };
let token = null; // { value, expires }
let tokenClient = null;
let fileId = null;
let pushTimer = null;
let running = null;
let onStatus = () => {};
let onData = () => {};

export const syncStatus = () => ({ ...status });

function set(patch) {
  Object.assign(status, patch);
  onStatus(syncStatus());
}

const session = {
  get: () => local.get('sync', null),
  set: (v) => local.set('sync', v),
};

function saveToken(t) {
  token = t;
  try { sessionStorage.setItem('mm.token', JSON.stringify(t)); } catch { /* ignore */ }
}
function loadToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem('mm.token'));
    return t && t.expires > Date.now() + 60000 ? t : null;
  } catch { return null; }
}
const tokenValid = () => token && token.expires > Date.now() + 30000;

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + token.value, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (res.status === 401) {
    token = null;
    const err = new Error('auth');
    err.auth = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Google Drive ${res.status}`);
  return res;
}

async function findFile() {
  const q = encodeURIComponent(`name='${FILE}'`);
  const res = await api(`${DRIVE}?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`);
  return (await res.json()).files?.[0]?.id || null;
}

async function upload(data) {
  const body = JSON.stringify(data);
  if (fileId) {
    await api(`${UPLOAD}/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    return;
  }
  const boundary = 'mm' + Date.now();
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE, parents: ['appDataFolder'] })}\r\n`
    + `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await api(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
  fileId = (await res.json()).id;
}

async function doSync() {
  if (!navigator.onLine) { set({ state: 'offline' }); return; }
  if (!tokenValid()) { set({ state: 'reconnect' }); return; }
  set({ state: 'syncing', error: null });
  try {
    if (!fileId) fileId = await findFile();
    const remote = fileId ? sanitize(await (await api(`${DRIVE}/${fileId}?alt=media`)).json()) : null;
    const localData = userData.get();
    const merged = remote ? mergeData(localData, remote) : localData;
    if (JSON.stringify(merged) !== JSON.stringify(localData)) {
      userData.replace(merged);
      onData();
    }
    if (!remote || JSON.stringify(merged) !== JSON.stringify(remote)) await upload(merged);
    set({ state: 'synced', last: Date.now() });
  } catch (e) {
    if (e.auth) set({ state: 'reconnect' });
    else set({ state: navigator.onLine ? 'error' : 'offline', error: e.name === 'TimeoutError' ? 'timeout' : e.message });
  }
}

// One sync at a time; a request made while one is running queues exactly one more.
export function syncNow() {
  if (!session.get()?.enabled) return Promise.resolve();
  if (running) { running.again = true; return running.p; }
  const r = { again: false };
  r.p = doSync().then(() => {
    running = null;
    if (r.again) return syncNow();
  });
  running = r;
  return r.p;
}

function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
        saveToken({ value: resp.access_token, expires: Date.now() + (resp.expires_in - 60) * 1000 });
        resolve();
      },
      error_callback: (err) => reject(new Error(err?.type === 'popup_closed' ? 'cancelled' : err?.message || 'sign-in failed')),
    });
    tokenClient.requestAccessToken({ prompt, hint: session.get()?.email || undefined });
  });
}

// Must run from a click (Google opens a window).
export async function signIn() {
  if (!config.googleClientId) return;
  set({ state: 'connecting', error: null });
  try {
    await loadGis();
    await requestToken(session.get()?.email ? '' : 'consent');
    const info = await (await api('https://www.googleapis.com/oauth2/v3/userinfo')).json();
    session.set({ enabled: true, email: info.email || null });
    set({ email: info.email || null });
    await syncNow();
  } catch (e) {
    set({ state: session.get()?.enabled ? 'reconnect' : 'off', error: e.message === 'cancelled' ? null : e.message });
  }
}

export function signOut() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.value, () => {});
  token = null;
  fileId = null;
  try { sessionStorage.removeItem('mm.token'); } catch { /* ignore */ }
  session.set(null);
  set({ state: 'off', email: null, last: null, error: null });
}

export function initSync(handlers) {
  onStatus = handlers.onStatus;
  onData = handlers.onData;
  if (!config.googleClientId) return;
  // syncNow() does nothing while signed out, so these are safe to attach up front.
  userData.onChange(() => {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 2500);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && tokenValid() && Date.now() - (status.last || 0) > 60000) syncNow();
  });
  addEventListener('online', () => syncNow());
  addEventListener('offline', () => { if (session.get()?.enabled) set({ state: 'offline' }); });

  const s = session.get();
  if (!s?.enabled) return;
  status.email = s.email;
  token = loadToken();
  set({ state: token ? 'synced' : 'reconnect' });
  if (token) syncNow();
}
