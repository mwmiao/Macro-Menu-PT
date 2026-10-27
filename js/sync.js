// Optional cloud sync through the user's own Google Drive. Data is stored as one JSON file in the
// app's hidden "appDataFolder" (scope drive.appdata: the app can't see any other Drive files).
// No server is involved: Google Identity Services gives the browser a short-lived access token.
//
// Flow: sign in → confirm Google actually granted Drive access → download remote file → merge with
// local (core/merge.js) → save merged locally → upload if it changed. Local changes are pushed 2.5 s
// after the last edit. Tokens last ~1 h; after that the user taps "Reconnect" (Google needs a click
// to show its window).
//
// Only the drive.appdata scope is requested. Google's consent screen shows one checkbox per scope,
// and a token can come back with some of them unticked; asking for a single scope (the account
// email comes from Drive's about.get) avoids a token that silently lacks Drive access, and the
// granted scopes are still checked before Drive is called.
import config from './config.js';
import { mergeData, sanitize } from './core/merge.js';
import { userData, local } from './store.js';

const FILE = 'macro-meals.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TIMEOUT = 15000;
const RATE_RETRIES = 3;

// status.state: 'unconfigured' | 'off' | 'connecting' | 'syncing' | 'synced' | 'reconnect'
//              | 'permission' (signed in, Drive access not granted) | 'offline' | 'error'
// status.error (when state is 'error'): { kind: 'api-disabled' | 'busy' | 'timeout' | 'google', detail }
const status = { state: config.googleClientId ? 'off' : 'unconfigured', email: null, last: null, error: null };
let token = null; // { value, expires }
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
function dropToken() {
  token = null;
  try { sessionStorage.removeItem('mm.token'); } catch { /* ignore */ }
}
const tokenValid = () => token && token.expires > Date.now() + 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(Object.assign(new Error('Could not load Google sign-in'), { kind: 'google' }));
    document.head.appendChild(s);
  });
}

// A Drive/Google API failure, classified from Google's error body so the UI can say what to do.
class DriveError extends Error {
  constructor(kind, detail, status) {
    super(detail || kind);
    this.kind = kind;
    this.detail = detail;
    this.status = status;
  }
}

async function classify(res) {
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const e = body?.error || {};
  const reasons = [...(e.errors || []).map((x) => x.reason), ...(e.details || []).map((x) => x.reason)].filter(Boolean);
  const has = (...r) => reasons.some((x) => r.includes(x));
  const detail = `${res.status}${e.message ? ' — ' + e.message : ''}`;
  if (res.status === 401) return new DriveError('auth', detail, 401);
  if (has('insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'insufficientScopes')) return new DriveError('permission', detail, res.status);
  if (has('accessNotConfigured', 'SERVICE_DISABLED')) return new DriveError('api-disabled', detail, res.status);
  if (res.status === 429 || has('rateLimitExceeded', 'userRateLimitExceeded', 'RATE_LIMIT_EXCEEDED')) return new DriveError('busy', detail, res.status);
  return new DriveError('google', detail, res.status);
}

// Google asks clients to retry rate-limit responses with backoff; everything else fails at once.
async function api(url, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        ...opts,
        headers: { Authorization: 'Bearer ' + token.value, ...(opts.headers || {}) },
        signal: AbortSignal.timeout(TIMEOUT),
      });
    } catch (e) {
      throw new DriveError(e.name === 'TimeoutError' ? 'timeout' : 'network', e.message);
    }
    if (res.ok) return res;
    const err = await classify(res);
    if (err.kind === 'busy' && attempt < RATE_RETRIES) { await sleep(1000 * 2 ** attempt + Math.random() * 500); continue; }
    throw err;
  }
}

async function findFile() {
  const q = encodeURIComponent(`name='${FILE}'`);
  const res = await api(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`);
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

function fail(e) {
  if (e.kind === 'auth') { dropToken(); set({ state: 'reconnect', error: null }); return; }
  if (e.kind === 'permission') { dropToken(); set({ state: 'permission', error: null }); return; }
  if (e.kind === 'network' || !navigator.onLine) { set({ state: 'offline', error: null }); return; }
  set({ state: 'error', error: { kind: e.kind || 'google', detail: e.detail || e.message } });
}

async function doSync() {
  if (!navigator.onLine) { set({ state: 'offline' }); return; }
  if (!tokenValid()) { if (status.state !== 'permission') set({ state: 'reconnect' }); return; }
  set({ state: 'syncing', error: null });
  try {
    if (!fileId) fileId = await findFile();
    const remote = fileId ? sanitize(await (await api(`${DRIVE}/files/${fileId}?alt=media`)).json()) : null;
    const localData = userData.get();
    const merged = remote ? mergeData(localData, remote) : localData;
    if (JSON.stringify(merged) !== JSON.stringify(localData)) {
      userData.replace(merged);
      onData();
    }
    if (!remote || JSON.stringify(merged) !== JSON.stringify(remote)) await upload(merged);
    set({ state: 'synced', last: Date.now() });
  } catch (e) {
    fail(e);
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

// Resolves with the token response; rejects if the window is closed or Google returns an error.
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(Object.assign(new Error(resp.error_description || resp.error), { kind: 'google', detail: resp.error_description || resp.error })); return; }
        resolve(resp);
      },
      error_callback: (err) => reject(Object.assign(new Error(err?.type || 'sign-in failed'), { kind: err?.type === 'popup_closed' ? 'cancelled' : 'google', detail: err?.message || err?.type })),
    });
    client.requestAccessToken({ prompt, hint: session.get()?.email || undefined });
  });
}

// Must run from a click (Google opens a window). `forceConsent` re-shows the consent screen, used
// when Drive access was not granted the first time.
export async function signIn(forceConsent = false) {
  if (!config.googleClientId) return;
  set({ state: 'connecting', error: null });
  try {
    await loadGis();
    const resp = await requestToken(forceConsent || !session.get()?.email ? 'consent' : '');
    // The user can untick Drive access on Google's consent screen and still get a token.
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) {
      session.set({ ...(session.get() || {}), enabled: true });
      set({ state: 'permission', error: null });
      return;
    }
    saveToken({ value: resp.access_token, expires: Date.now() + (resp.expires_in - 60) * 1000 });
    // The email is only shown in the UI, so failing to read it must never block sync.
    let email = session.get()?.email || null;
    try { email = (await (await api(`${DRIVE}/about?fields=user(emailAddress)`)).json()).user?.emailAddress || email; } catch { /* keep going */ }
    session.set({ enabled: true, email });
    set({ email });
    await syncNow();
  } catch (e) {
    if (e.kind === 'cancelled') { set({ state: session.get()?.enabled ? 'reconnect' : 'off', error: null }); return; }
    if (!session.get()?.enabled) session.set({ enabled: true, email: null });
    fail(e);
  }
}

export function signOut() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.value, () => {});
  dropToken();
  fileId = null;
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
