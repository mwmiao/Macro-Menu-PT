// Browse-and-tools sheets: item detail, daily target, favourites, grade guide, rankings,
// converters, TDEE, about, compare and the Meal Matcher. Each is a function returning the sheet's HTML.
import { CHAINS, CHAIN } from '../data/index.js';
import { TIERS, NON_FOOD, MAINS, density, tierOf, totals } from '../core/nutrition.js';
import { isAvailable, isBreakfastTime, BREAKFAST } from '../core/availability.js';
import { userData, local } from '../store.js';
import {
  state, t, target, getItem, chainOf, nameOf, catName, fmt, fmtInt, fmtDate, padEntries, ALL_ITEMS, isAll,
} from '../state.js';
import { esc, ICON, visual, macroBar, tierStamp, badges, row, sheetHead } from './parts.js';

export const browseSheets = {
  item(key) {
    const it = getItem(key);
    if (!it) return `${sheetHead(t('notFound'))}`;
    const c = chainOf(it);
    const tr = tierOf(it);
    const d = density(it);
    const fav = userData.isFav(key);
    const inCmp = state.compare.includes(key);
    let leaves = '';
    const tg = target();
    if (tg) {
      const tt = totals(padEntries());
      const left = tg.kcal - tt.kcal - it.kcal;
      leaves = left >= 0
        ? `<p class="leaves">${esc(t('leaves', { kcal: fmtInt(left), p: fmtInt(Math.max(0, tg.protein - tt.p - it.p)) }))}</p>`
        : `<p class="leaves over">${esc(t('over', { kcal: fmtInt(-left) }))}</p>`;
    }
    const rows = [
      [t('energy'), `${fmtInt(it.kcal)} kcal · ${fmtInt(it.kcal * 4.184)} kJ`],
      [t('protein'), fmt(it.p) + ' g'],
      [t('carbs'), fmt(it.c) + ' g'],
      ['↳ ' + t('sugars'), it.sug == null ? '–' : fmt(it.sug) + ' g'],
      [t('fat'), fmt(it.f) + ' g'],
      ['↳ ' + t('saturates'), it.sat == null ? '–' : fmt(it.sat) + ' g'],
      [t('salt'), it.salt == null ? '–' : fmt(it.salt) + ' g'],
      [t('density'), fmt(d) + ' ' + t('perKcal')],
    ];
    if (it.portion) rows.push([t('portion'), it.portion]);
    const off = !isAvailable(it, state.now);
    return `<div class="detail" style="--cc:${c.color}">
      <div class="detail-media">
        <button type="button" class="icon-round" data-close aria-label="${esc(t('close'))}">${ICON.close}</button>
        ${visual(it, 'emoji-xl')}
        <div class="detail-title"><h2>${esc(nameOf(it))}</h2><p>${esc(c.name)} · ${esc(catName(it.cat))}</p></div>
      </div>
      <div class="detail-body">
        ${it.breakfastOnly ? `<p class="notice ${off ? '' : 'on'}">${ICON.clock}<span>${esc(t('breakfastNote', { start: BREAKFAST.start, end: BREAKFAST.end }))} <b>${esc(off ? t('breakfastLater') : t('breakfastNow'))}</b></span></p>` : ''}
        <div class="big-stats">
          <div><b>${fmtInt(it.kcal)}</b><span>kcal</span></div>
          <div><b>${fmt(it.p)}g</b><span>${esc(t('protein'))}</span></div>
          <div>${tr ? `<span class="stamp stamp-${tr} stamp-lg">${tr}</span><span>${esc(t('tier_' + tr))}</span>` : '<b>–</b><span>&nbsp;</span>'}</div>
        </div>
        ${macroBar(it)}
        <p class="blurb">${esc(tr ? t('detailBlurb', { cat: catName(it.cat).toLowerCase(), chain: c.name, tier: tr, label: t('tier_' + tr).toLowerCase(), d: fmt(d) }) : t('detailNoTier'))}</p>
        <div class="badges">${badges(it)}</div>
        ${leaves}
        <table class="nut">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
        ${it.custom ? `<p class="src">${esc(t('customSource'))}</p>` : `<p class="src">${esc(t('figuresFrom', { src: c.sourceName[state.lang], date: fmtDate(c.checked) }))} <a href="${c.sourceUrl}" target="_blank" rel="noopener">${esc(t('viewSource'))}</a></p>
        <p class="src"><button type="button" class="link" data-open="report" data-arg="${esc(key)}">${esc(t('reportItem'))}</button></p>`}
      </div>
      <div class="sheet-foot">
        ${it.custom ? '' : `<button type="button" class="btn ghost ${fav ? 'on' : ''}" data-fav="${key}">${ICON.heart}<span>${esc(fav ? t('unfavourite') : t('favourite'))}</span></button>
        <button type="button" class="btn ghost ${inCmp ? 'on' : ''}" data-compare="${key}">${ICON.scale}<span>${esc(inCmp ? t('inCompare') : t('addToCompare'))}</span></button>`}
        <button type="button" class="btn primary" data-add="${key}" data-then-close>${ICON.plus}<span>${esc(t('addToMeal'))}</span></button>
      </div>
    </div>`;
  },

  target() {
    const tg = target() || { kcal: 2000, protein: 120 };
    return `${sheetHead(t('dailyTarget'))}
      <form class="sheet-body form" data-form="target">
        <label>${esc(t('targetKcal'))}<input name="kcal" type="number" inputmode="numeric" min="800" max="6000" step="10" value="${tg.kcal}" required></label>
        <label>${esc(t('targetProtein'))}<input name="protein" type="number" inputmode="numeric" min="0" max="400" step="1" value="${tg.protein}" required></label>
        <p class="muted">${esc(t('notSure'))} <button type="button" class="link" data-open="tdee">${esc(t('workItOut'))}</button></p>
        <div class="form-actions">
          ${target() ? `<button type="button" class="btn ghost" data-act="clearTarget">${esc(t('reset'))}</button>` : ''}
          <button type="submit" class="btn primary">${esc(t('save'))}</button>
        </div>
      </form>`;
  },

  favs() {
    const list = userData.favKeys().map(getItem).filter(Boolean);
    return `${sheetHead(t('favsTitle'))}
      <div class="sheet-body">${list.length ? `<div class="rows">${list.map((it) => row(it, { showChain: true })).join('')}</div>` : `<p class="empty-note">${esc(t('favsEmpty'))}</p>`}</div>`;
  },

  tiers() {
    return `${sheetHead(t('tiers'))}
      <div class="sheet-body">
        <p class="muted">${esc(t('tierHelp'))}</p>
        <div class="tier-list">${TIERS.map((x, i) => `<button type="button" class="tier-row ${state.tiers.has(x.t) ? 'on' : ''}" data-tier="${x.t}" aria-pressed="${state.tiers.has(x.t)}">
          <span class="stamp stamp-${x.t}">${x.t}</span><span><b>${esc(t('tier_' + x.t))}</b><small>${x.min ? fmt(x.min) + 'g+/100kcal' : esc(t('tierUnder', { n: fmt(TIERS[i - 1].min) }))}</small></span></button>`).join('')}</div>
      </div>`;
  },

  rank() {
    const list = ALL_ITEMS.filter((it) => it.kcal >= 150 && !NON_FOOD.has(it.cat) && it.cat !== 'desserts')
      .sort((a, b) => density(b) - density(a)).slice(0, 30);
    return `${sheetHead(t('rankTitle'), t('rankNote'))}<div class="sheet-body"><ol class="rank">${list.map((it) => `<li>${row(it, { showChain: true })}</li>`).join('')}</ol></div>`;
  },

  low() {
    const list = ALL_ITEMS.filter((it) => MAINS.has(it.cat) && it.kcal <= 400 && it.kcal >= 150).sort((a, b) => b.p - a.p).slice(0, 30);
    return `${sheetHead(t('lowTitle'), t('lowNote'))}<div class="sheet-body"><div class="rows">${list.map((it) => row(it, { showChain: true })).join('')}</div></div>`;
  },

  kj() {
    return `${sheetHead(t('kjTitle'), t('kjNote'))}
      <div class="sheet-body form">
        <label>kJ<input id="kjIn" type="number" inputmode="decimal" min="0" value="2000"></label>
        <label>kcal<input id="kcalIn" type="number" inputmode="decimal" min="0" value="478"></label>
      </div>`;
  },

  tdee() {
    const p = local.get('tdee', { sex: 'm', age: 30, h: 175, w: 75, act: 2, goal: 'keep' });
    const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
    return `${sheetHead(t('tdeeTitle'))}
      <form class="sheet-body form" data-form="tdee" id="tdeeForm">
        <label>${esc(t('sex'))}<select name="sex">${opt('m', p.sex, t('male'))}${opt('f', p.sex, t('female'))}</select></label>
        <div class="form-row">
          <label>${esc(t('age'))}<input name="age" type="number" inputmode="numeric" min="14" max="100" value="${p.age}"></label>
          <label>${esc(t('height'))}<input name="h" type="number" inputmode="numeric" min="120" max="230" value="${p.h}"></label>
          <label>${esc(t('weight'))}<input name="w" type="number" inputmode="decimal" min="35" max="250" value="${p.w}"></label>
        </div>
        <label>${esc(t('activity'))}<select name="act">${[1, 2, 3, 4, 5].map((i) => opt(i, p.act, t('act_' + i))).join('')}</select></label>
        <label>${esc(t('goal'))}<select name="goal">${opt('cut', p.goal, t('goal_cut'))}${opt('keep', p.goal, t('goal_keep'))}${opt('bulk', p.goal, t('goal_bulk'))}</select></label>
        <div class="result" id="tdeeResult"></div>
        <div class="form-actions"><button type="submit" class="btn primary">${esc(t('useAsTarget'))}</button></div>
      </form>`;
  },

  about() {
    return `${sheetHead(t('aboutTitle'))}
      <div class="sheet-body prose">
        <p>${esc(t('aboutBody'))}</p>
        <h3>${esc(t('aboutChains'))}</h3>
        <ul class="sources">${CHAINS.map((c) => `<li><i style="background:${c.color}"></i><span><b>${esc(c.name)}</b> · ${c.items.length} ${esc(t('items'))} · ${esc(t('checked', { date: fmtDate(c.checked) }))}<br><a href="${c.sourceUrl}" target="_blank" rel="noopener">${esc(c.sourceName[state.lang])}</a></span></li>`).join('')}</ul>
        <p class="muted">${esc(t('breakfastNote', { start: BREAKFAST.start, end: BREAKFAST.end }))}</p>
        <p class="muted">${esc(t('aboutUnofficial'))}</p>
      </div>`;
  },

  compare() {
    const list = state.compare.map(getItem).filter(Boolean);
    if (!list.length) return `${sheetHead(t('compareTitle'))}<div class="sheet-body"><p class="empty-note">${esc(t('compareEmpty'))}</p></div>`;
    const metrics = [
      ['kcal', t('calories'), 'min', ''], ['p', t('protein'), 'max', 'g'], ['density', t('density'), 'max', ''],
      ['c', t('carbs'), 'min', 'g'], ['sug', t('sugars'), 'min', 'g'], ['f', t('fat'), 'min', 'g'], ['sat', t('saturates'), 'min', 'g'], ['salt', t('salt'), 'min', 'g'],
    ];
    const val = (it, k) => (k === 'density' ? density(it) : it[k]);
    return `${sheetHead(t('compareTitle'), t('compareSub'))}
      <div class="sheet-body">
        <div class="cmp" style="--n:${list.length}">
          <div class="cmp-row cmp-head"><span></span>${list.map((it) => `<span class="cmp-item" style="--cc:${chainOf(it).color}"><button type="button" class="x" data-compare="${it.key}" aria-label="${esc(t('removeFromMeal'))}">${ICON.close}</button>${tierStamp(it, 'stamp-sm')}<b>${esc(nameOf(it))}</b><small>${esc(chainOf(it).name)}</small></span>`).join('')}</div>
          ${metrics.map(([k, label, dir, unit]) => {
            const vals = list.map((it) => val(it, k));
            const best = dir === 'min' ? Math.min(...vals) : Math.max(...vals);
            return `<div class="cmp-row"><span class="cmp-label">${esc(label)}</span>${vals.map((v) => `<span class="${list.length > 1 && v === best ? 'best' : ''}">${k === 'kcal' ? fmtInt(v) : fmt(v)}${unit}</span>`).join('')}</div>`;
          }).join('')}
        </div>
      </div>
      <div class="sheet-foot"><button type="button" class="btn ghost" data-act="clearCompare">${esc(t('clear'))}</button></div>`;
  },

  matcher() {
    const tg = target();
    const tt = totals(padEntries());
    const prefs = local.get('matcher', { kcal: tg ? Math.max(400, Math.round((tg.kcal - tt.kcal) / 2 / 50) * 50) : 700, protein: 40, max: 3, desserts: false, drinks: false });
    const chainId = isAll() ? (prefs.chain && CHAIN[prefs.chain] ? prefs.chain : CHAINS[0].id) : state.chain;
    const res = state.matchResult;
    return `${sheetHead(t('matcherTitle'), t('matcherIntro', { chain: CHAIN[chainId].name }))}
      <form class="sheet-body form" data-form="matcher" id="matcherForm">
        ${isAll() ? `<label>${esc(t('restaurant'))}<select name="chain">${CHAINS.map((c) => `<option value="${c.id}" ${c.id === chainId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : `<input type="hidden" name="chain" value="${chainId}">`}
        <div class="form-row">
          <label>${esc(t('targetKcalShort'))}<input name="kcal" type="number" inputmode="numeric" min="150" max="3000" step="10" value="${prefs.kcal}"></label>
          <label>${esc(t('minProtein'))}<input name="protein" type="number" inputmode="numeric" min="0" max="250" value="${prefs.protein}"></label>
        </div>
        <fieldset class="seg"><legend>${esc(t('maxItems'))}</legend>${[1, 2, 3, 4].map((n) => `<label><input type="radio" name="max" value="${n}" ${prefs.max === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}</fieldset>
        <label class="check"><input type="checkbox" name="desserts" ${prefs.desserts ? 'checked' : ''}><span>${esc(t('allowDesserts'))}</span></label>
        <label class="check"><input type="checkbox" name="drinks" ${prefs.drinks ? 'checked' : ''}><span>${esc(t('allowDrinks'))}</span></label>
        ${chainId === 'mcdonalds' && !isBreakfastTime(state.now) ? `<p class="muted">${esc(t('matcherNoBreakfast'))}</p>` : ''}
        <div class="form-actions">
          ${res && res.combo ? `<button type="button" class="btn ghost" data-act="shuffle">${ICON.shuffle}<span>${esc(t('shuffle'))}</span></button>` : ''}
          <button type="submit" class="btn primary">${esc(t('buildMeal'))}</button>
        </div>
        ${res ? (res.combo ? `
          <div class="match">
            <div class="rows">${res.combo.map((it) => row(it)).join('')}</div>
            <div class="mt-row"><b>${esc(t('total'))}</b><b>${fmtInt(res.tot.kcal)} kcal · ${t('P')} ${fmt(res.tot.p)}g · ${t('F')} ${fmt(res.tot.f)}g · ${t('C')} ${fmt(res.tot.c)}g</b></div>
            <button type="button" class="btn primary wide" data-act="addCombo">${ICON.plus}<span>${esc(t('addAllToMeal'))}</span></button>
          </div>` : `<p class="empty-note">${esc(t('noCombo'))}</p>`) : ''}
      </form>`;
  },
};
