// "Report a problem": sent to the project inbox through Web3Forms (a form-to-email service).
// Diagnostic context is only what the app already knows (restaurant, product, order pad,
// version, settings); the user's email is optional and only sent if they type it.
import config from '../config.js';
import { totals } from '../core/nutrition.js';
import { state, t, getItem, chainOf, padEntries, fmtInt } from '../state.js';
import { esc, sheetHead, ICON } from './parts.js';
import { CHAIN } from '../data/index.js';

const TYPES = ['data', 'photo', 'bug', 'idea', 'other'];

function diagnostics(itemKey) {
  const it = itemKey ? getItem(itemKey) : null;
  const pad = padEntries();
  const lines = [
    ['App', `Macro Meals ${config.version}`],
    ['Page', location.href.split('?')[0]],
    ['Restaurant', it ? chainOf(it).name : state.chain === 'all' ? 'All restaurants' : CHAIN[state.chain]?.name],
  ];
  if (it) lines.push(['Product', `${it.pt} (${it.key}) — ${it.kcal} kcal, P ${it.p} / C ${it.c} / F ${it.f}`]);
  if (pad.length) lines.push(['Order pad', pad.map(({ it: x, qty }) => `${qty}× ${x.pt}`).join(', ') + ` — ${fmtInt(totals(pad).kcal)} kcal`]);
  lines.push(['Settings', `lang=${state.lang}, skin=${state.skin}, view=${state.view}, screen=${innerWidth}×${innerHeight}`]);
  lines.push(['Browser', navigator.userAgent]);
  return lines;
}

export function reportSheet(arg) {
  const r = state.report || {};
  if (r.sent) {
    return `${sheetHead(t('reportTitle'))}<div class="sheet-body"><div class="done-box">${ICON.shield}<b>${esc(t('reportSent'))}</b><p class="muted">${esc(t('reportSentSub'))}</p></div></div>
      <div class="sheet-foot"><button type="button" class="btn primary" data-close>${esc(t('close'))}</button></div>`;
  }
  const itemKey = arg?.item || null;
  const it = itemKey ? getItem(itemKey) : null;
  const diag = diagnostics(itemKey);
  return `${sheetHead(t('reportTitle'), it ? t('reportAbout', { name: it.pt }) : t('reportSub'))}
    <form class="sheet-body form" data-form="report" novalidate>
      <input type="hidden" name="item" value="${esc(itemKey || '')}">
      <label>${esc(t('reportType'))}<select name="type">${TYPES.map((k) => `<option value="${k}" ${k === (it ? 'data' : 'bug') ? 'selected' : ''}>${esc(t('report_' + k))}</option>`).join('')}</select></label>
      <label>${esc(t('reportWhat'))}<textarea name="message" rows="5" maxlength="2000" required placeholder="${esc(t('reportPlaceholder'))}">${esc(r.message || '')}</textarea></label>
      <label>${esc(t('reportEmail'))}<input name="email" type="email" maxlength="120" autocomplete="email" value="${esc(r.email || '')}"><small class="faint">${esc(t('reportEmailNote'))}</small></label>
      <label class="check"><input type="checkbox" name="diag" checked><span>${esc(t('reportDiag'))}</span></label>
      <details class="diag"><summary>${esc(t('reportDiagShow'))}</summary><dl>${diag.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>
      <input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      ${r.error ? `<p class="error" role="alert">${esc(t('reportFailed'))} <a href="mailto:${config.reportEmail}">${config.reportEmail}</a></p>` : ''}
      <div class="form-actions"><button type="submit" class="btn primary" ${r.sending ? 'disabled' : ''}>${esc(r.sending ? t('sending') : t('sendReport'))}</button></div>
    </form>`;
}

export async function submitReport(form, rerender) {
  const fd = new FormData(form);
  const message = String(fd.get('message')).trim();
  const email = String(fd.get('email')).trim();
  state.report = { message, email };
  if (message.length < 5) { form.message.focus(); form.message.setCustomValidity(t('reportTooShort')); form.message.reportValidity(); form.message.setCustomValidity(''); return; }
  if (email && !form.email.checkValidity()) { form.email.reportValidity(); return; }
  if (fd.get('botcheck')) return;
  const itemKey = fd.get('item') || null;
  const type = String(fd.get('type'));
  const body = {
    access_key: config.web3formsKey,
    subject: `Macro Meals report: ${type}${itemKey ? ' — ' + (getItem(itemKey)?.pt || itemKey) : ''}`,
    from_name: 'Macro Meals',
    type,
    message,
  };
  if (email) body.email = email;
  if (fd.get('diag')) for (const [k, v] of diagnostics(itemKey)) body[k] = v;
  state.report.sending = true;
  rerender();
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.message || res.status);
    state.report = { sent: true };
  } catch {
    state.report = { message, email, error: true };
  }
  rerender();
}

export const reportReset = () => { state.report = null; };
