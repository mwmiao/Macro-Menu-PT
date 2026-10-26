// End-to-end test of the Drive sync flow against an in-memory fake of Google's APIs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

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
globalThis.google = {
  accounts: { oauth2: {
    initTokenClient: ({ callback }) => ({ requestAccessToken: () => callback({ access_token: 'tok', expires_in: 3600 }) }),
    revoke: () => {},
  } },
};

// Fake Drive: one appDataFolder with at most one file.
const drive = { file: null, uploads: 0, fail401: false };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (drive.fail401) return new Response('', { status: 401 });
  if (u.includes('userinfo')) return Response.json({ email: 'me@example.com' });
  if (u.includes('/drive/v3/files?spaces=appDataFolder')) return Response.json({ files: drive.file ? [{ id: 'f1' }] : [] });
  if (u.includes('/drive/v3/files/f1?alt=media')) return new Response(drive.file);
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

test('first sign-in uploads local data to a new Drive file', async () => {
  userData.upsert('saved', { id: 'a', name: 'Local lunch', items: [{ key: 'kfc:tender-1-un', qty: 2 }] });
  await sync.signIn();
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
});

test('a deletion on this device survives an older copy on Drive', async () => {
  userData.remove('saved', 'a');
  await sync.syncNow();
  assert.equal(JSON.parse(drive.file).saved.a.del, true);
  assert.deepEqual(userData.list('saved').map((r) => r.name), ['From phone']);
});

test('an expired token pauses sync instead of losing data', async () => {
  drive.fail401 = true;
  await sync.syncNow();
  assert.equal(sync.syncStatus().state, 'reconnect');
  assert.equal(userData.list('saved').length, 1);
  drive.fail401 = false;
});

test('signing out keeps local data', () => {
  sync.signOut();
  assert.equal(sync.syncStatus().state, 'off');
  assert.equal(userData.list('saved').length, 1);
});
