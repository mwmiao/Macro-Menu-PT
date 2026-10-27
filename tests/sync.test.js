// End-to-end tests of the Drive sync flow against an in-memory fake of Google's APIs, including
// Google's real error shapes (a 403's reason decides what the user is told).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
};
globalThis.localStorage = mem();
globalThis.sessionStorage = mem();
globalThis.window = globalThis;
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.document = { addEventListener() {}, visibilityState: 'visible', head: { appendChild() {} } };
globalThis.addEventListener = () => {};

// Fake Google Identity Services. `consent.grant` is what the user leaves ticked on Google's screen.
const consent = { grant: DRIVE_SCOPE, requests: [] };
globalThis.google = {
  accounts: { oauth2: {
    initTokenClient: ({ scope, callback }) => ({
      requestAccessToken: (opts) => {
        consent.requests.push({ scope, prompt: opts.prompt });
        callback({ access_token: 'tok-' + consent.requests.length, expires_in: 3600, scope: consent.grant });
      },
    }),
    hasGrantedAllScopes: (resp, ...scopes) => scopes.every((s) => resp.scope.split(' ').includes(s)),
    revoke: () => {},
  } },
};

// Fake Drive: one appDataFolder with at most one file; `drive.fail` queues error responses.
const gErr = (code, reason, message) => Response.json({ error: { code, message, errors: [{ reason, message }] } }, { status: code });
const drive = { file: null, uploads: 0, calls: 0, fail: [] };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  drive.calls++;
  if (drive.fail.length) return drive.fail.shift();
  if (u.includes('/about?')) return Response.json({ user: { emailAddress: 'me@example.com' } });
  if (u.includes('/files?spaces=appDataFolder')) return Response.json({ files: drive.file ? [{ id: 'f1' }] : [] });
  if (u.includes('/files/f1?alt=media')) return new Response(drive.file);
  if (u.includes('/upload/drive/v3/files')) {
    drive.uploads++;
    drive.file = opts.method === 'PATCH' ? opts.body : opts.body.split('\r\n\r\n')[2].split('\r\n--')[0];
    return Response.json({ id: 'f1' });
  }
  throw new Error('unexpected ' + u);
};

const config = (await import('../js/config.js')).default;
config.googleClientId = 'test-client';
const { userData } = await import('../js/store.js');
const sync = await import('../js/sync.js');
let dataEvents = 0;
sync.initSync({ onStatus() {}, onData() { dataEvents++; } });

test('only the Drive app-folder scope is requested (one consent checkbox)', async () => {
  consent.grant = 'email'; // user leaves the Drive box unticked
  const before = drive.calls;
  await sync.signIn();
  assert.equal(consent.requests[0].scope, DRIVE_SCOPE);
  assert.equal(consent.requests[0].prompt, 'consent');
  // A token without Drive access is never sent to Drive: no 403, a clear "permission" state instead.
  assert.equal(sync.syncStatus().state, 'permission');
  assert.equal(drive.calls, before);
});

test('local edits while Drive access is missing keep the permission message', async () => {
  userData.upsert('saved', { id: 'a', name: 'Local lunch', items: [{ key: 'kfc:tender-1-un', qty: 2 }] });
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'permission');
});

test('"Allow Drive access" re-asks with consent and the first sync then succeeds', async () => {
  consent.grant = DRIVE_SCOPE;
  await sync.signIn(true);
  assert.equal(consent.requests.at(-1).prompt, 'consent');
  assert.equal(sync.syncStatus().state, 'synced');
  assert.equal(sync.syncStatus().email, 'me@example.com');
  assert.equal(JSON.parse(drive.file).saved.a.name, 'Local lunch');
});

test('newer remote changes are merged in, local-only records are kept', async () => {
  const remote = JSON.parse(drive.file);
  remote.saved.b = { id: 'b', name: 'From phone', items: [], created: 1, t: Date.now() + 1000 };
  remote.prefs.skin = { v: 'azulejo', t: Date.now() + 1000 };
  drive.file = JSON.stringify(remote);
  userData.upsert('presets', { id: 'p', name: 'Only here', items: [{ key: 'kfc:tender-1-un', qty: 1 }] });
  await sync.syncNow();
  assert.deepEqual(userData.list('saved').map((r) => r.name).sort(), ['From phone', 'Local lunch']);
  assert.equal(userData.pref('skin'), 'azulejo');
  assert.ok(dataEvents > 0);
  assert.equal(JSON.parse(drive.file).presets.p.name, 'Only here');
});

test('nothing is uploaded when both sides already match', async () => {
  const before = drive.uploads;
  await sync.syncNow();
  assert.equal(drive.uploads, before);
  assert.equal(sync.syncStatus().state, 'synced');
});

test('a deletion on this device survives an older copy on Drive', async () => {
  userData.remove('saved', 'a');
  await sync.syncNow();
  assert.equal(JSON.parse(drive.file).saved.a.del, true);
  assert.deepEqual(userData.list('saved').map((r) => r.name), ['From phone']);
});

test('Drive rate limits (403 rateLimitExceeded) are retried with backoff', async () => {
  drive.fail.push(gErr(403, 'userRateLimitExceeded', 'User rate limit exceeded.'));
  userData.upsert('saved', { id: 'c', name: 'After a hiccup', items: [] });
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'synced');
  assert.equal(JSON.parse(drive.file).saved.c.name, 'After a hiccup');
});

test('a 403 for missing scope switches to "permission" (no generic error)', async () => {
  drive.fail.push(gErr(403, 'insufficientPermissions', 'Request had insufficient authentication scopes.'));
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'permission');
  consent.grant = DRIVE_SCOPE;
  await sync.signIn(true);
  assert.equal(sync.syncStatus().state, 'synced');
});

test('Drive API disabled in the Cloud project is reported as such', async () => {
  drive.fail.push(gErr(403, 'accessNotConfigured', 'Google Drive API has not been used in project 858395367355 before or it is disabled.'));
  await sync.syncNow();
  const s = sync.syncStatus();
  assert.equal(s.state, 'error');
  assert.equal(s.error.kind, 'api-disabled');
});

test('other genuine failures keep Google’s status and message', async () => {
  drive.fail.push(gErr(500, 'backendError', 'Backend Error'));
  await sync.syncNow();
  const s = sync.syncStatus();
  assert.equal(s.state, 'error');
  assert.equal(s.error.kind, 'google');
  assert.match(s.error.detail, /^500 — Backend Error/);
  await sync.syncNow(); // and the next attempt recovers
  assert.equal(sync.syncStatus().state, 'synced');
});

test('an expired token pauses sync instead of losing data', async () => {
  drive.fail.push(new Response('', { status: 401 }));
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'reconnect');
  assert.equal(userData.list('saved').length, 2);
});

test('signing out keeps local data', () => {
  sync.signOut();
  assert.equal(sync.syncStatus().state, 'off');
  assert.equal(userData.list('saved').length, 2);
});
