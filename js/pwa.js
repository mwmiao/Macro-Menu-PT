// Installable app: service worker for offline use, and the browser's install prompt where offered
// (Chrome/Edge on Android and desktop). iOS Safari has no prompt; the More menu explains Share → Add to Home Screen.
let deferred = null;
let onChange = () => {};

export const pwa = {
  canPrompt: () => !!deferred,
  installed: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  isIOS: () => /iphone|ipad|ipod/i.test(navigator.userAgent),
  async prompt() {
    if (!deferred) return false;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    onChange();
    return outcome === 'accepted';
  },
};

export function initPwa(changed) {
  onChange = changed;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    onChange();
  });
  addEventListener('appinstalled', () => { deferred = null; onChange(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { /* offline support is optional */ });
  }
}
