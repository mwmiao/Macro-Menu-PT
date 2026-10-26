// Saved meals (snapshots you reload), meal presets (templates you add to the pad) and custom items.
import { CHAINS } from '../data/index.js';
import { totals } from '../core/nutrition.js';
import { userData, newId } from '../store.js';
import { state, t, fmt, fmtInt, fmtDateTime, nameOf, chainOf, padEntries, getItem, customToItem } from '../state.js';
import { esc, ICON, visual, sheetHead, stepper, toast } from './parts.js';
import { addToPad, confirmReplacePad } from './pad.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function summary(items) {
  const entries = padEntries(items);
  const tt = totals(entries);
  const n = items.reduce((s, m) => s + m.qty, 0);
  return `${esc(t('itemCount', { n }))} · ${fmtInt(tt.kcal)} kcal · ${t('P')} ${fmt(tt.p)}g`;
}

function mealCard(coll, rec) {
  const primary = coll === 'saved'
    ? `<button type="button" class="btn primary" data-act="loadSaved" data-arg="${rec.id}">${esc(t('loadMeal'))}</button>`
    : `<button type="button" class="btn primary" data-act="applyPreset" data-arg="${rec.id}">${ICON.plus}<span>${esc(t('addToPad'))}</span></button>`;
  const names = padEntries(rec.items).slice(0, 4).map((e) => nameOf(e.it)).join(', ');
  return `<li class="coll-card">
    <div class="coll-top"><b>${esc(rec.name)}</b><small>${summary(rec.items)}</small>${names ? `<span class="coll-items">${esc(names)}${rec.items.length > 4 ? '…' : ''}</span>` : ''}
      <small class="faint">${esc(t('updated', { date: fmtDateTime(rec.t) }))}</small></div>
    <div class="coll-actions">${primary}
      <button type="button" class="btn ghost square" data-act="editColl" data-arg="${coll}:${rec.id}" aria-label="${esc(t('edit'))}" title="${esc(t('edit'))}">${ICON.edit}</button>
      ${coll === 'saved' ? `<button type="button" class="btn ghost square" data-act="shareSaved" data-arg="${rec.id}" aria-label="${esc(t('shareMeal'))}" title="${esc(t('shareMeal'))}">${ICON.link}</button>` : ''}
      <button type="button" class="btn ghost square" data-act="deleteColl" data-arg="${coll}:${rec.id}" aria-label="${esc(t('delete'))}" title="${esc(t('delete'))}">${ICON.trash}</button>
    </div></li>`;
}

function searchResults(q) {
  const s = norm(q.trim());
  if (s.length < 2) return '';
  const all = [...userData.list('custom').map(customToItem), ...CHAINS.flatMap((c) => c.items)];
  const hits = all.filter((it) => norm(it.pt + ' ' + (it.en || '') + ' ' + chainOf(it).name).includes(s)).slice(0, 10);
  if (!hits.length) return `<p class="muted">${esc(t('noMatches'))}</p>`;
  return `<ul class="pick-list">${hits.map((it) => `<li><button type="button" data-act="edAdd" data-arg="${esc(it.key)}">
    <span class="pad-thumb">${visual(it, 'row-emoji')}</span><span><b>${esc(nameOf(it))}</b><small>${esc(chainOf(it).name)} · ${fmtInt(it.kcal)} kcal</small></span>${ICON.plus}</button></li>`).join('')}</ul>`;
}

function customForm(c = {}) {
  const field = (name, label, max, step = '0.1') => `<label>${esc(label)}<input name="${name}" type="number" inputmode="decimal" min="0" max="${max}" step="${step}" value="${c[name] ?? ''}" required></label>`;
  return `<form class="form custom-form" data-form="custom">
    <input type="hidden" name="id" value="${esc(c.id || '')}">
    <label>${esc(t('customName'))}<input name="name" maxlength="60" value="${esc(c.name || '')}" required></label>
    <div class="form-row">${field('kcal', 'kcal', 5000, '1')}${field('p', t('protein') + ' (g)', 500)}${field('c', t('carbs') + ' (g)', 1000)}${field('f', t('fat') + ' (g)', 500)}</div>
    <div class="form-actions">
      ${c.id ? `<button type="button" class="btn ghost" data-act="customCancel">${esc(t('cancel'))}</button>` : ''}
      <button type="submit" class="btn primary">${esc(c.id ? t('save') : t('addCustom'))}</button>
    </div>
  </form>`;
}

export const collectionSheets = {
  saved() {
    const list = userData.list('saved');
    return `${sheetHead(t('savedMeals'), t('savedSub'))}<div class="sheet-body">
      ${list.length ? `<ul class="coll-list">${list.map((r) => mealCard('saved', r)).join('')}</ul>` : `<p class="empty-note">${esc(t('savedEmpty'))}</p>`}
    </div>`;
  },

  presets() {
    const list = userData.list('presets');
    return `${sheetHead(t('presets'), t('presetsSub'))}<div class="sheet-body">
      <div class="form-actions start">
        <button type="button" class="btn ghost" data-act="newPreset">${ICON.plus}<span>${esc(t('newPreset'))}</span></button>
        ${userData.pad().length ? `<button type="button" class="btn ghost" data-act="padToPreset">${ICON.layers}<span>${esc(t('presetFromPad'))}</span></button>` : ''}
      </div>
      ${list.length ? `<ul class="coll-list">${list.map((r) => mealCard('presets', r)).join('')}</ul>` : `<p class="empty-note">${esc(t('presetsEmpty'))}</p>`}
    </div>`;
  },

  // Editor for a saved meal or preset. Works on a draft in state.editor until "Save".
  editor(arg) {
    if (!state.editor || state.editor.arg !== arg) {
      const rec = arg.id ? userData.find(arg.coll, arg.id) : null;
      state.editor = { arg, coll: arg.coll, id: arg.id || null, name: rec?.name || '', items: (rec?.items || arg.items || []).map((m) => ({ ...m })), q: '' };
    }
    const ed = state.editor;
    const entries = ed.items.map((m) => ({ it: getItem(m.key), qty: m.qty })).filter((e) => e.it);
    const title = ed.id ? t('editX', { x: ed.coll === 'saved' ? t('savedMeal') : t('preset') }) : t('newPreset');
    return `${sheetHead(title)}
      <form class="sheet-body form" data-form="editor">
        <label>${esc(t('mealName'))}<input name="name" id="edName" maxlength="60" value="${esc(ed.name)}" required></label>
        ${entries.length ? `<ul class="meal-list">${entries.map(({ it, qty }) => `<li><span class="pad-thumb">${visual(it, 'row-emoji')}</span>
          <span class="ml-name"><b>${esc(nameOf(it))}</b><small>${esc(chainOf(it).name)} · ${fmtInt(it.kcal)} kcal</small></span>
          ${stepper('data-ed-qty', it.key, qty)}
          <button type="button" class="icon-round sm" data-act="edRemove" data-arg="${esc(it.key)}" aria-label="${esc(t('removeFromMeal'))}">${ICON.close}</button></li>`).join('')}</ul>
          <p class="muted">${summary(ed.items)}</p>`
        : `<p class="muted">${esc(t('editorEmpty'))}</p>`}
        <label class="search">${ICON.search}<input id="edSearch" type="search" value="${esc(ed.q)}" placeholder="${esc(t('addItemSearch'))}" aria-label="${esc(t('addItemSearch'))}" autocomplete="off"></label>
        <div id="edResults">${searchResults(ed.q)}</div>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-act="edCancel">${esc(t('cancel'))}</button>
          <button type="submit" class="btn primary">${esc(t('save'))}</button>
        </div>
      </form>`;
  },

  custom() {
    const list = userData.list('custom');
    const editing = state.customEdit ? userData.find('custom', state.customEdit) : null;
    return `${sheetHead(t('customItems'), t('customSub'))}<div class="sheet-body">
      ${customForm(editing || {})}
      ${list.length ? `<ul class="meal-list">${list.map((c) => {
        const it = customToItem(c);
        return `<li><span class="pad-thumb">${visual(it, 'row-emoji')}</span>
          <span class="ml-name"><b>${esc(c.name)}</b><small>${fmtInt(c.kcal)} kcal · ${t('P')} ${fmt(c.p)}g · ${t('C')} ${fmt(c.c)}g · ${t('F')} ${fmt(c.f)}g</small></span>
          <button type="button" class="icon-round sm" data-add="${esc(it.key)}" aria-label="${esc(t('addToMeal'))}">${ICON.plus}</button>
          <button type="button" class="icon-round sm" data-act="customEdit" data-arg="${c.id}" aria-label="${esc(t('edit'))}">${ICON.edit}</button>
          <button type="button" class="icon-round sm" data-act="customDelete" data-arg="${c.id}" aria-label="${esc(t('delete'))}">${ICON.trash}</button></li>`;
      }).join('')}</ul>` : `<p class="empty-note">${esc(t('customEmpty'))}</p>`}
    </div>`;
  },
};

export const collectionActions = {
  loadSaved(id, ctx) {
    const rec = userData.find('saved', id);
    if (!rec || !confirmReplacePad()) return;
    userData.setPad(rec.items.map((m) => ({ ...m })));
    toast(t('mealLoaded'));
    ctx.openSheet('meal');
  },
  applyPreset(id) {
    const rec = userData.find('presets', id);
    if (!rec) return;
    for (const m of rec.items) addToPad(m.key, m.qty);
    toast(t('presetAdded', { name: rec.name }));
  },
  shareSaved(id, ctx) {
    const rec = userData.find('saved', id);
    if (rec) ctx.openSheet('share', { name: rec.name, items: rec.items });
  },
  editColl(arg, ctx) {
    const [coll, id] = arg.split(':');
    ctx.openSheet('editor', { coll, id });
  },
  deleteColl(arg) {
    const [coll, id] = arg.split(':');
    const rec = userData.find(coll, id);
    if (rec && confirm(t('confirmDelete', { name: rec.name }))) userData.remove(coll, id);
  },
  newPreset(_, ctx) { ctx.openSheet('editor', { coll: 'presets' }); },
  edAdd(key) {
    const m = state.editor.items.find((x) => x.key === key);
    if (m) m.qty = Math.min(99, m.qty + 1); else state.editor.items.push({ key, qty: 1 });
    state.editor.q = '';
  },
  edRemove(key) { state.editor.items = state.editor.items.filter((m) => m.key !== key); },
  edCancel(_, ctx) {
    const back = state.editor.coll;
    state.editor = null;
    ctx.openSheet(back);
  },
  customEdit(id) { state.customEdit = id; },
  customCancel() { state.customEdit = null; },
  customDelete(id) {
    const c = userData.find('custom', id);
    if (c && confirm(t('confirmDelete', { name: c.name }))) userData.remove('custom', id);
  },
};

export const collectionForms = {
  editor(form, ctx) {
    const ed = state.editor;
    const name = new FormData(form).get('name').trim();
    if (!name) { toast(t('nameNeeded')); return; }
    if (!ed.items.length) { toast(t('editorEmpty')); return; }
    userData.upsert(ed.coll, { id: ed.id || newId(), name, items: ed.items });
    toast(ed.coll === 'saved' ? t('mealSaved') : t('presetSaved'));
    state.editor = null;
    ctx.openSheet(ed.coll);
  },
  custom(form) {
    const fd = new FormData(form);
    const nums = ['kcal', 'p', 'c', 'f'].map((k) => Number(fd.get(k)));
    const name = String(fd.get('name')).trim().slice(0, 60);
    if (!name || nums.some((n) => !Number.isFinite(n) || n < 0) || nums[0] > 5000 || nums[0] <= 0) { toast(t('customInvalid')); return; }
    const [kcal, p, c, f] = nums;
    userData.upsert('custom', { id: fd.get('id') || newId(), name, kcal, p, c, f });
    state.customEdit = null;
    toast(t('customSaved'));
  },
};

// Keeps the editor's draft in sync while typing, without a full re-render.
export function editorInput(e) {
  if (!state.editor) return false;
  if (e.target.id === 'edName') { state.editor.name = e.target.value; return true; }
  if (e.target.id === 'edSearch') {
    state.editor.q = e.target.value;
    document.getElementById('edResults').innerHTML = searchResults(state.editor.q);
    return true;
  }
  return false;
}

export function editorQty(key, d) {
  const m = state.editor.items.find((x) => x.key === key);
  if (m) m.qty = Math.max(1, Math.min(99, m.qty + d));
}
