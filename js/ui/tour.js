// First-use guided tour: a dark overlay with a cut-out around the real UI element, and a panel
// with progress dots and Skip / Next / Done. Shown once per device (local key "tour"); replayable
// from More → Help and More → Settings.
import { CHAINS } from '../data/index.js';
import { local } from '../store.js';
import { t } from '../state.js';
import { esc } from './parts.js';

const PAD = 6; // space between the target and the highlight ring
const GAP = 14; // space between the highlight and the panel
const MARGIN = 12; // keep the panel this far from the screen edges

const visible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const firstVisible = (sel) => [...document.querySelectorAll(sel)].find(visible) || null;

const STEPS = [
  { target: () => firstVisible('.dd-btn'), title: 'tour1Title', body: () => t('tour1Body', { n: CHAINS.length }) },
  { target: () => firstVisible('#main .card .stamp, #main .row .stamp'), title: 'tour2Title', body: () => t('tour2Body') },
  { target: () => firstVisible('#main .card .add, #main .row .add'), title: 'tour3Title', body: () => t('tour3Body') },
];

let active = null; // { i, root, onMove, onKey, ctx }

export const tourSeen = () => !!local.get('tour', null);

function finish(completed) {
  if (!active) return;
  local.set('tour', { [completed ? 'done' : 'skipped']: true, t: Date.now() });
  removeEventListener('resize', active.onMove);
  removeEventListener('scroll', active.onMove, true);
  document.removeEventListener('keydown', active.onKey, true);
  active.root.remove();
  document.body.classList.remove('touring');
  active = null;
}

function place() {
  if (!active) return;
  const step = STEPS[active.i];
  const el = step.target();
  const hole = active.root.querySelector('.tour-hole');
  const panel = active.root.querySelector('.tour-panel');
  const vw = innerWidth, vh = innerHeight;
  if (!el) { hole.hidden = true; panel.style.left = `${(vw - panel.offsetWidth) / 2}px`; panel.style.top = `${(vh - panel.offsetHeight) / 2}px`; return; }
  const r = el.getBoundingClientRect();
  hole.hidden = false;
  Object.assign(hole.style, { left: `${r.left - PAD}px`, top: `${r.top - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px` });
  hole.style.borderRadius = getComputedStyle(el).borderRadius === '50%' || r.width === r.height ? '999px' : '16px';
  // Below the target if it fits, otherwise above; never over it.
  const ph = panel.offsetHeight, pw = panel.offsetWidth;
  const below = r.bottom + PAD + GAP;
  const above = r.top - PAD - GAP - ph;
  const top = below + ph <= vh - MARGIN || above < MARGIN ? Math.min(below, vh - MARGIN - ph) : above;
  const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - pw / 2, vw - MARGIN - pw));
  panel.style.top = `${Math.max(MARGIN, top)}px`;
  panel.style.left = `${left}px`;
  panel.dataset.side = top >= r.bottom ? 'below' : 'above';
}

function show(i) {
  active.i = i;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const el = step.target();
  // Bring the target into view, leaving room for the panel.
  if (el) el.scrollIntoView({ block: i === 0 ? 'nearest' : 'center', inline: 'nearest' });
  const panel = active.root.querySelector('.tour-panel');
  panel.innerHTML = `
    <p class="tour-step">${esc(t('tourStep', { i: i + 1, n: STEPS.length }))}</p>
    <h2 id="tourTitle">${esc(t(step.title))}</h2>
    <p class="tour-body">${esc(step.body())}</p>
    <div class="tour-foot">
      <span class="tour-dots" aria-hidden="true">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>
      ${last ? '' : `<button type="button" class="btn ghost" data-tour="skip">${esc(t('tourSkip'))}</button>`}
      <button type="button" class="btn primary" data-tour="${last ? 'done' : 'next'}">${esc(last ? t('tourDone') : t('tourNext'))}</button>
    </div>`;
  place();
  panel.querySelector('.btn.primary').focus({ preventScroll: true });
  requestAnimationFrame(place); // again once the scroll above has settled
}

export function startTour(ctx) {
  if (active) return;
  ctx.closeSheet?.();
  window.scrollTo({ top: 0 });
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `<div class="tour-hole" aria-hidden="true"></div>
    <div class="tour-panel" role="dialog" aria-modal="true" aria-labelledby="tourTitle"></div>`;
  document.body.appendChild(root);
  document.body.classList.add('touring');
  let raf = 0;
  const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    if (e.key === 'Tab') { // keep focus inside the panel
      const btns = [...root.querySelectorAll('button')];
      const i = btns.indexOf(document.activeElement);
      e.preventDefault();
      btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
    }
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tour]');
    e.stopPropagation();
    if (!b) return;
    if (b.dataset.tour === 'next') show(active.i + 1);
    else finish(b.dataset.tour === 'done');
  });
  addEventListener('resize', onMove);
  addEventListener('scroll', onMove, true);
  document.addEventListener('keydown', onKey, true);
  active = { i: 0, root, onMove, onKey, ctx };
  show(0);
}

// First visit only, and not on top of a shared-meal sheet.
export function maybeStartTour(ctx, blocked) {
  if (tourSeen() || blocked()) return;
  setTimeout(() => { if (!tourSeen() && !blocked()) startTour(ctx); }, 700);
}
