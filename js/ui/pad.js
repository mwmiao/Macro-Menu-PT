// Order pad: the meal being built, its receipt card, the "How to order" script and meal links.
import config from '../config.js';
import { totals, tierOf, density } from '../core/nutrition.js';
import { isAvailable } from '../core/availability.js';
import { orderScript, orderNumber, barcodeWidths, macroSplit } from '../core/order.js';
import { shareUrl } from '../core/share.js';
import { userData, newId } from '../store.js';
import { state, t, fmt, fmtInt, fmtDateTime, nameOf, chainOf, padEntries, target, getItem } from '../state.js';
import { esc, ICON, visual, macroBar, tierStamp, sheetHead, stepper, toast, copyText } from './parts.js';

export function addToPad(key, qty = 1) {
  const items = userData.pad().map((m) => ({ ...m }));
  const m = items.find((x) => x.key === key);
  if (m) m.qty = Math.min(99, m.qty + qty); else if (qty > 0) items.push({ key, qty });
  userData.setPad(items);
}

const count = (items) => items.reduce((s, m) => s + m.qty, 0);
export const padCount = () => count(userData.pad());

// The custom items a meal refers to, so a link or saved meal can carry them.
export function customsIn(items) {
  return items.filter((m) => m.key.startsWith('custom:'))
    .map((m) => userData.find('custom', m.key.slice(7)))
    .filter(Boolean)
    .map(({ id, name, kcal, p, c, f }) => ({ id, name, kcal, p, c, f }));
}

function targetBox(tt) {
  const tg = target();
  const bar = (val, max) => `<div class="prog"><i style="width:${Math.min(100, (val / max) * 100)}%" class="${val > max ? 'over' : ''}"></i></div>`;
  return `<section class="target-box">
    <div class="target-head"><b>${esc(t('dailyTarget'))}</b><button type="button" class="link" data-open="target">${esc(tg ? t('editTarget') : t('setTarget'))}</button></div>
    ${tg ? `
      <div class="target-line"><span>${fmtInt(tt.kcal)} / ${fmtInt(tg.kcal)} kcal</span><span>${esc(t('remaining'))}: ${fmtInt(tg.kcal - tt.kcal)}</span></div>${bar(tt.kcal, tg.kcal)}
      <div class="target-line"><span>${fmt(tt.p)} / ${fmtInt(tg.protein)} g ${esc(t('protein').toLowerCase())}</span><span>${esc(t('remaining'))}: ${fmtInt(Math.max(0, tg.protein - tt.p))} g</span></div>${bar(tt.p, tg.protein)}`
    : `<p class="muted">${esc(t('targetHint'))} <button type="button" class="link" data-open="tdee">${esc(t('workItOut'))}</button></p>`}
  </section>`;
}

export function totalsBlock(tt) {
  return `<div class="meal-total">
    <div class="mt-row"><b>${esc(t('totalCalories'))}</b><b>${fmtInt(tt.kcal)} kcal</b></div>
    ${macroBar(tt)}
    <div class="mt-grid">
      <span>${esc(t('protein'))}<b>${fmt(tt.p)} g</b></span><span>${esc(t('carbs'))}<b>${fmt(tt.c)} g</b></span><span>${esc(t('fat'))}<b>${fmt(tt.f)} g</b></span>
      <span>${esc(t('sugars'))}<b>${fmt(tt.sug)} g</b></span><span>${esc(t('saturates'))}<b>${fmt(tt.sat)} g</b></span><span>${esc(t('salt'))}<b>${fmt(tt.salt)} g</b></span>
    </div>
  </div>`;
}

// The pad's content; used both in the sheet (phones/tablets) and the side panel (wide screens).
export function padBody() {
  const entries = padEntries();
  const tt = totals(entries);
  const n = count(userData.pad());
  if (!entries.length) {
    return `${targetBox(tt)}
      <div class="pad-empty"><span>${ICON.receipt}</span><p>${esc(t('mealEmpty'))}</p>
        ${userData.list('presets').length ? `<button type="button" class="btn ghost" data-open="presets">${ICON.layers}<span>${esc(t('usePreset'))}</span></button>` : ''}
      </div>`;
  }
  return `${targetBox(tt)}
    <ul class="meal-list">
      ${entries.map(({ it, qty }) => `<li class="${isAvailable(it, state.now) ? '' : 'off'}">
        <span class="pad-thumb">${visual(it, 'row-emoji')}</span>
        <span class="ml-name"><b>${esc(nameOf(it))}</b><small>${esc(chainOf(it).name)} · ${fmtInt(it.kcal)} kcal · ${t('P')} ${fmt(it.p)}g</small>
          ${isAvailable(it, state.now) ? '' : `<small class="warn">${esc(t('breakfastOnlyNow'))}</small>`}</span>
        ${stepper('data-qty', it.key, qty)}
        <button type="button" class="icon-round sm" data-act="padRemove" data-arg="${esc(it.key)}" aria-label="${esc(t('removeFromMeal'))}">${ICON.close}</button>
      </li>`).join('')}
    </ul>
    ${totalsBlock(tt)}
    <form class="save-row" data-form="saveMeal">
      <label class="save-input">${ICON.save}<input name="name" maxlength="60" placeholder="${esc(t('nameToSave'))}" aria-label="${esc(t('nameToSave'))}"></label>
      <button type="submit" class="btn ghost">${esc(t('save'))}</button>
    </form>
    <div class="pad-actions">
      <button type="button" class="btn primary wide pad-receipt" data-open="receipt">${ICON.receipt}<span>${esc(t('receiptCard'))}</span>${ICON.chev}</button>
      <div class="pad-row">
        <button type="button" class="btn ghost" data-open="howto">${ICON.chat}<span>${esc(t('howToOrder'))}</span></button>
        <button type="button" class="btn ghost square" data-open="share" aria-label="${esc(t('shareMeal'))}" title="${esc(t('shareMeal'))}">${ICON.link}</button>
        <button type="button" class="btn ghost square" data-act="padToPreset" aria-label="${esc(t('saveAsPreset'))}" title="${esc(t('saveAsPreset'))}">${ICON.layers}</button>
        <button type="button" class="btn ghost square" data-act="padClear" aria-label="${esc(t('clearMeal'))}" title="${esc(t('clearMeal'))}">${ICON.trash}</button>
      </div>
    </div>
    <p class="pad-meta">${esc(t('itemCount', { n }))}</p>`;
}

export function padPanel() {
  const n = padCount();
  return `<div class="pad-head"><span class="kicker">${esc(t('orderPad'))}</span><h2>${esc(t('yourMeal'))}${n ? ` <em>${n}</em>` : ''}</h2></div>
    <div class="pad-scroll">${padBody()}</div>`;
}

function receipt() {
  const items = userData.pad();
  const entries = padEntries(items);
  const tt = totals(entries);
  const split = macroSplit(tt);
  const no = orderNumber(items);
  const chains = [...new Set(entries.map((e) => chainOf(e.it).name))];
  const rank = tierOf(tt);
  const bars = barcodeWidths(no, 56).map((w, i) => `<i style="width:${w * 1.5}px;${i % 2 ? 'background:transparent' : ''}"></i>`).join('');
  return `<div class="receipt" id="receipt">
    <div class="rc-logo">M</div>
    <h3 class="rc-brand">MACRO MEALS</h3>
    <span class="rc-pill">${esc(chains.length === 1 ? t('receiptOf', { chain: chains[0] }) : t('receiptTitle'))}</span>
    <p class="rc-meta">${esc(t('orderNo', { n: no }))} · ${esc(fmtDateTime(Date.now()))}</p>
    <div class="rc-sep"></div>
    <p class="rc-label">${esc(t('itemCount', { n: count(items) }))}</p>
    <ul class="rc-items">${entries.map(({ it, qty }) => `<li>
      <span class="rc-thumb">${visual(it, 'row-emoji')}</span>
      <span class="rc-line"><span><em>${qty}×</em> ${esc(nameOf(it))}</span><i></i><b>${fmtInt(it.kcal * qty)} kcal</b></span>
      <small>${fmt(it.p * qty)}g ${esc(t('protein').toLowerCase())} ${tierStamp(it, 'stamp-xs')}</small>
    </li>`).join('')}</ul>
    <div class="rc-sep"></div>
    <div class="rc-total"><span><b>TOTAL</b><small>${esc(t('calories'))}</small></span><strong>${fmtInt(tt.kcal)}<small>kcal</small></strong></div>
    ${macroBar(tt)}
    <div class="rc-macros">
      <span><b>${fmt(tt.p)}g</b><i class="dot mp"></i>${esc(t('protein'))}<em>${split.p}%</em></span>
      <span><b>${fmt(tt.f)}g</b><i class="dot mf"></i>${esc(t('fat'))}<em>${split.f}%</em></span>
      <span><b>${fmt(tt.c)}g</b><i class="dot mc"></i>${esc(t('carbs'))}<em>${split.c}%</em></span>
    </div>
    <p class="rc-small">${fmt(tt.sug)}g ${esc(t('sugars').toLowerCase())} · ${fmt(tt.salt)}g ${esc(t('salt').toLowerCase())}</p>
    ${rank ? `<div class="rc-rank"><small>${esc(t('mealRank'))}</small>
      <span class="rc-stamp stamp-${rank}"><b>${rank} · ${esc(t('tier_' + rank).toUpperCase())}</b><i>MACRO MEALS ${esc(t('certified'))}</i></span>
      <small class="rc-per">${esc(t('perHundred', { d: fmt(density(tt)) }))}</small></div>` : ''}
    <div class="rc-barcode" aria-hidden="true">${bars}</div>
    <p class="rc-code">MM ${fmtInt(tt.kcal).replace(/\D/g, '').padStart(4, '0')} ${no}</p>
    <p class="rc-thanks">${esc(t('receiptThanks'))}</p>
    <p class="rc-site">${esc(new URL(config.siteUrl).host)}</p>
  </div>`;
}

function scriptGroups(lang) {
  const groups = new Map();
  for (const { it, qty } of padEntries()) {
    if (it.custom) continue;
    const name = lang === 'en' && it.en ? it.en : it.pt;
    const c = chainOf(it).name;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push({ name, qty });
  }
  return [...groups].map(([chain, lines]) => ({ chain, lines }));
}

export const padSheets = {
  meal() {
    return `${sheetHead(t('yourMeal'), '', t('orderPad'))}<div class="sheet-body pad-body">${padBody()}</div>`;
  },

  receipt() {
    if (!userData.pad().length) return `${sheetHead(t('receiptCard'))}<div class="sheet-body"><p class="empty-note">${esc(t('mealEmpty'))}</p></div>`;
    return `${sheetHead(t('receiptCard'))}<div class="sheet-body receipt-wrap">${receipt()}</div>
      <div class="sheet-foot"><button type="button" class="btn ghost" data-act="copyMeal">${ICON.copy}<span>${esc(t('copyMeal'))}</span></button>
      <button type="button" class="btn primary" data-open="share">${ICON.link}<span>${esc(t('shareMeal'))}</span></button></div>`;
  },

  howto() {
    const lang = state.howtoLang || 'pt';
    const groups = scriptGroups(lang);
    const hasCustom = padEntries().some((e) => e.it.custom);
    return `${sheetHead(t('howToOrder'), '', t('orderPad'))}
      <div class="sheet-body">
        <div class="seg-toggle" role="group" aria-label="${esc(t('language'))}">
          <button type="button" class="${lang === 'pt' ? 'on' : ''}" data-act="howtoLang" data-arg="pt">Português</button>
          <button type="button" class="${lang === 'en' ? 'on' : ''}" data-act="howtoLang" data-arg="en">English</button>
        </div>
        ${groups.length ? `<blockquote class="script" id="orderScript">${esc(orderScript(groups, lang)).replace(/\n/g, '<br>')}</blockquote>
          <div class="form-actions start">
            <button type="button" class="btn ghost" data-act="copyScript">${ICON.copy}<span>${esc(t('copyScript'))}</span></button>
            ${'speechSynthesis' in window ? `<button type="button" class="btn ghost" data-act="speak">${ICON.chat}<span>${esc(t('speakScript'))}</span></button>` : ''}
          </div>`
        : `<p class="empty-note">${esc(t('mealEmpty'))}</p>`}
        ${hasCustom ? `<p class="muted">${esc(t('scriptNoCustom'))}</p>` : ''}
        <p class="note">${ICON.help}<span>${esc(t('scriptNote'))}</span></p>
      </div>`;
  },

  share(arg) {
    const meal = arg?.items ? arg : { name: '', items: userData.pad() };
    if (!meal.items.length) return `${sheetHead(t('shareMeal'))}<div class="sheet-body"><p class="empty-note">${esc(t('mealEmpty'))}</p></div>`;
    const url = shareUrl(config.siteUrl, { ...meal, custom: customsIn(meal.items) });
    state.shareUrl = url;
    return `${sheetHead(t('shareMeal'), t('shareSub'))}
      <div class="sheet-body form">
        <label>${esc(t('mealLink'))}<input type="text" readonly value="${esc(url)}" data-select-all></label>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-act="copyLink">${ICON.copy}<span>${esc(t('copyLink'))}</span></button>
          ${navigator.share ? `<button type="button" class="btn primary" data-act="nativeShare" data-arg="${esc(meal.name)}">${ICON.share}<span>${esc(t('shareVia'))}</span></button>` : ''}
        </div>
      </div>`;
  },

  incoming() {
    const meal = state.incoming;
    if (!meal) return `${sheetHead(t('sharedMeal'))}<div class="sheet-body"><p class="empty-note">${esc(t('badLink'))}</p></div>`;
    const lookup = (key) => getItem(key) || incomingCustom(key);
    const entries = meal.items.map((m) => ({ it: lookup(m.key), qty: m.qty })).filter((e) => e.it);
    const tt = totals(entries);
    return `${sheetHead(meal.name || t('sharedMeal'), t('sharedSub'), t('sharedMeal'))}
      <div class="sheet-body">
        <ul class="meal-list">${entries.map(({ it, qty }) => `<li><span class="pad-thumb">${visual(it, 'row-emoji')}</span>
          <span class="ml-name"><b>${qty}× ${esc(nameOf(it))}</b><small>${esc(chainOf(it).name)} · ${fmtInt(it.kcal * qty)} kcal</small></span></li>`).join('')}</ul>
        ${totalsBlock(tt)}
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn ghost" data-act="incoming" data-arg="add">${esc(t('addToPad'))}</button>
        <button type="button" class="btn ghost" data-act="incoming" data-arg="save">${esc(t('saveMeal'))}</button>
        <button type="button" class="btn primary" data-act="incoming" data-arg="replace">${esc(t('replacePad'))}</button>
      </div>`;
  },
};

// Custom items that arrived in a link but aren't saved yet.
function incomingCustom(key) {
  const c = state.incoming?.custom.find((x) => 'custom:' + x.id === key);
  return c ? { key, chain: 'custom', pt: c.name, en: null, cat: 'custom', kcal: c.kcal, p: c.p, c: c.c, f: c.f, sug: null, sat: null, salt: null, custom: true } : null;
}

function confirmReplacePad() {
  return !userData.pad().length || confirm(t('confirmReplacePad'));
}

export const padActions = {
  padRemove(key) { userData.setPad(userData.pad().filter((m) => m.key !== key)); },
  padClear() { if (confirm(t('confirmClear'))) userData.setPad([]); },
  padToPreset(_, ctx) {
    ctx.openSheet('editor', { coll: 'presets', items: userData.pad().map((m) => ({ ...m })) });
  },
  howtoLang(lang) { state.howtoLang = lang; },
  copyScript() { copyText(document.getElementById('orderScript').innerText); },
  // Reads the order out loud (e.g. to play at the counter), in the script's language.
  speak() {
    const text = document.getElementById('orderScript')?.innerText;
    if (!text || !('speechSynthesis' in window)) return;
    const lang = (state.howtoLang || 'pt') === 'pt' ? 'pt-PT' : 'en-GB';
    const voices = speechSynthesis.getVoices();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.voice = voices.find((v) => v.lang === lang) || voices.find((v) => v.lang.startsWith(lang.slice(0, 2))) || null;
    speechSynthesis.speak(u);
  },
  copyLink() { copyText(state.shareUrl); },
  async nativeShare(name) {
    try { await navigator.share({ title: name || 'Macro Meals', url: state.shareUrl }); } catch { /* cancelled */ }
  },
  copyMeal() {
    const entries = padEntries();
    const tt = totals(entries);
    copyText(entries.map(({ it, qty }) => `${qty}× ${nameOf(it)} (${chainOf(it).name}) — ${fmtInt(it.kcal * qty)} kcal`).join('\n')
      + `\n${t('total')}: ${fmtInt(tt.kcal)} kcal · ${t('protein')} ${fmt(tt.p)}g · ${t('carbs')} ${fmt(tt.c)}g · ${t('fat')} ${fmt(tt.f)}g\n— Macro Meals`);
  },
  incoming(mode, ctx) {
    const meal = state.incoming;
    if (!meal) return;
    for (const c of meal.custom) if (!userData.find('custom', c.id)) userData.upsert('custom', c);
    if (mode === 'replace') {
      if (!confirmReplacePad()) return;
      userData.setPad(meal.items);
    } else if (mode === 'add') {
      for (const m of meal.items) addToPad(m.key, m.qty);
    } else {
      userData.upsert('saved', { id: newId(), name: meal.name || t('sharedMeal'), items: meal.items });
      toast(t('mealSaved'));
    }
    state.incoming = null;
    ctx.openSheet(mode === 'save' ? 'saved' : 'meal');
  },
};

export const padForms = {
  saveMeal(form) {
    const name = new FormData(form).get('name').trim();
    if (!name) { toast(t('nameNeeded')); form.name.focus(); return; }
    userData.upsert('saved', { id: newId(), name, items: userData.pad().map((m) => ({ ...m })) });
    toast(t('mealSaved'));
  },
};

export { confirmReplacePad };
