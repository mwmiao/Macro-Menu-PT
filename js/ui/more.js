// The "More" menu: quick settings, account/sync, skins, the user's saved things, tools, settings
// (install + privacy) and support.
import config from '../config.js';
import { CHAINS } from '../data/index.js';
import { userData } from '../store.js';
import { state, t, SKINS, target, fmtInt, fmtDateTime } from '../state.js';
import { syncStatus } from '../sync.js';
import { pwa } from '../pwa.js';
import { esc, ICON, sheetHead } from './parts.js';

export const TABS = [
  ['quick', ICON.bolt], ['account', ICON.user], ['skins', ICON.palette], ['mine', ICON.save],
  ['tools', ICON.tools], ['settings', ICON.cog], ['support', ICON.help],
];

const tile = (open, icon, title, sub, extra = '') => `<button type="button" class="tool" ${open}><span class="tool-ic">${icon}</span><span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${extra || ICON.chev}</button>`;

function skinPicker() {
  return `<div class="skins">${SKINS.map((s) => `<button type="button" class="skin skin-${s} ${state.skin === s ? 'on' : ''}" data-act="skin" data-arg="${s}" aria-pressed="${state.skin === s}">
    <span class="swatch"><i></i><i></i><i></i></span><b>${esc(t('skin_' + s))}</b><small>${esc(t('skin_' + s + '_sub'))}</small></button>`).join('')}</div>`;
}

function accountCard() {
  const s = syncStatus();
  if (s.state === 'unconfigured') {
    return `<div class="card-box"><h3>${ICON.cloud}${esc(t('syncTitle'))}</h3><p class="muted">${esc(t('syncUnconfigured'))}</p></div>`;
  }
  const signedIn = !['off', 'unconfigured'].includes(s.state) || s.email;
  const label = {
    off: t('sync_off'), connecting: t('sync_connecting'), syncing: t('sync_syncing'), reconnect: t('sync_reconnect'),
    offline: t('sync_offline'), error: t('sync_error', { e: s.error || '' }),
    synced: s.last ? t('sync_synced', { when: fmtDateTime(s.last) }) : t('sync_ready'),
  }[s.state];
  if (!signedIn || s.state === 'off') {
    return `<div class="promo">${ICON.cloud}<div><b>${esc(t('syncPromoTitle'))}</b><p>${esc(t('syncPromo'))}</p></div>
      <button type="button" class="btn primary" data-act="signIn">${esc(t('signIn'))}</button></div>
      ${s.error ? `<p class="error">${esc(t('sync_error', { e: s.error }))}</p>` : ''}
      <p class="muted">${esc(t('syncWhat'))}</p>`;
  }
  return `<div class="card-box">
    <h3>${ICON.cloud}${esc(t('syncTitle'))}</h3>
    <p><b>${esc(s.email || '')}</b></p>
    <p class="sync-line sync-${s.state}" role="status">${esc(label)}</p>
    <div class="form-actions start">
      ${s.state === 'reconnect' || s.state === 'error' ? `<button type="button" class="btn primary" data-act="signIn">${esc(t('reconnect'))}</button>`
        : `<button type="button" class="btn ghost" data-act="syncNow" ${s.state === 'syncing' ? 'disabled' : ''}>${esc(t('syncNow'))}</button>`}
      <button type="button" class="btn ghost" data-act="signOut">${esc(t('signOut'))}</button>
    </div>
    <p class="muted">${esc(t('syncWhat'))}</p>
  </div>`;
}

function installCard() {
  if (pwa.installed()) return tile('', ICON.home, t('installTitle'), t('installDone'), '');
  return `<div class="card-box">
    <h3>${ICON.home}${esc(t('installTitle'))}</h3>
    ${pwa.canPrompt() ? `<button type="button" class="btn primary" data-act="install">${esc(t('installNow'))}</button>` : ''}
    <ul class="steps">
      <li><b>Chrome / Edge</b> — ${esc(t('installChrome'))}</li>
      <li><b>iPhone / iPad (Safari)</b> — ${esc(t('installIOS'))}</li>
    </ul>
  </div>`;
}

const sections = {
  quick() {
    const tg = target();
    return `<div class="stack">
      <div class="card-box"><h3>${esc(t('language'))}</h3>
        <div class="seg-toggle"><button type="button" data-lang="pt" class="${state.lang === 'pt' ? 'on' : ''}">Português</button><button type="button" data-lang="en" class="${state.lang === 'en' ? 'on' : ''}">English</button></div></div>
      <div class="card-box"><h3>${esc(t('skin'))}</h3>${skinPicker()}</div>
      ${tile('data-open="target"', ICON.target, t('dailyTarget'), tg ? `${fmtInt(tg.kcal)} kcal · ${fmtInt(tg.protein)} g ${t('protein').toLowerCase()}` : t('targetHint'))}
    </div>`;
  },
  account: () => accountCard(),
  skins: () => skinPicker(),
  mine() {
    return `<div class="stack">
      ${tile('data-open="saved"', ICON.save, t('savedMeals'), t('nSaved', { n: userData.list('saved').length }))}
      ${tile('data-open="presets"', ICON.layers, t('presets'), t('nSaved', { n: userData.list('presets').length }))}
      ${tile('data-open="custom"', ICON.star, t('customItems'), t('nSaved', { n: userData.list('custom').length }))}
      ${tile('data-open="favs"', ICON.heart, t('favsTitle'), t('nSaved', { n: userData.favKeys().length }))}
    </div>`;
  },
  tools() {
    return `<div class="stack">${[['rank', '🏆'], ['low', '🥗'], ['tdee', '🧮'], ['kj', '🔁']]
      .map(([k, e]) => tile(`data-open="${k}"`, `<span class="emo">${e}</span>`, t('tool_' + k), t('tool_' + k + '_sub'))).join('')}</div>`;
  },
  settings() {
    return `<div class="stack">${installCard()}
      ${tile('data-act="tour"', ICON.help, t('tourReplay'), t('tourReplaySub'))}
      <details class="card-box privacy"><summary><h3>${ICON.shield}${esc(t('privacyTitle'))}</h3></summary>
        <p>${esc(t('privacyLocal'))}</p><p>${esc(t('privacySync'))}</p><p>${esc(t('privacyReport'))}</p></details></div>`;
  },
  support() {
    return `<div class="stack">
      ${tile('data-act="tour"', ICON.help, t('tourReplay'), t('tourReplaySub'))}
      ${tile('data-open="report"', ICON.flag, t('reportTitle'), t('reportSub'))}
      ${tile('data-open="about"', '<span class="emo">📄</span>', t('tool_about'), t('tool_about_sub'))}
    </div>`;
  },
};

export function moreSheet() {
  const tab = state.moreTab;
  const items = CHAINS.reduce((s, c) => s + c.items.length, 0);
  return `${sheetHead(t('moreTitle'), '', t('moreKicker'))}
    <div class="sheet-body more">
      <nav class="more-nav" aria-label="${esc(t('moreTitle'))}">${TABS.map(([k, ic]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-act="moreTab" data-arg="${k}" aria-current="${tab === k}">${ic}<span>${esc(t('more_' + k))}</span></button>`).join('')}</nav>
      <div class="more-main">${sections[tab]()}
        <p class="more-foot">Macro Meals ${config.version} (${config.build}) · ${t('nRestaurants', { n: CHAINS.length })} · ${fmtInt(items)} ${esc(t('items'))}</p></div>
    </div>`;
}
