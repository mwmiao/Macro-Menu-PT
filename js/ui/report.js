// "Report a problem": sent to the project inbox through Web3Forms (a form-to-email service; the
// access key in config.js delivers to the email the key was created with).
// Diagnostic context is only what the app already knows (restaurant, product, order pad,
// version, settings); the user's email is optional and only sent if they type it.
//
// Flow: validate (errors shown next to the field) → POST to Web3Forms → success screen only when
// Web3Forms answers { success: true }; otherwise the form stays filled in, with the reason and
// three ways out: try again, send it by email instead, or copy it.
import config from '../config.js';
import { totals } from '../core/nutrition.js';
import { state, t, getItem, chainOf, padEntries, fmtInt } from '../state.js';
import { esc, sheetHead, ICON, copyText } from './parts.js';
import { CHAIN } from '../data/index.js';

const TYPES = ['data', 'photo', 'bug', 'idea', 'other'];
const ENDPOINT = 'https://api.web3forms.com/submit';
const MIN_LENGTH = 5;

function diagnostics(itemKey) {
  const it = itemKey ? getItem(itemKey) : null;
  const pad = padEntries();
  const lines = [
    ['App', `Macro Meals ${config.version} (${config.build})`],
    ['Page', location.href.split('?')[0]],
    ['Restaurant', it ? chainOf(it).name : state.chain === 'all' ? 'All restaurants' : CHAIN[state.chain]?.name],
  ];
  if (it) lines.push(['Product', `${it.pt} (${it.key}) — ${it.kcal} kcal, P ${it.p} / C ${it.c} / F ${it.f}`]);
  if (pad.length) lines.push(['Order pad', pad.map(({ it: x, qty }) => `${qty}× ${x.pt}`).join(', ') + ` — ${fmtInt(totals(pad).kcal)} kcal`]);
  lines.push(['Settings', `lang=${state.lang}, skin=${state.skin}, view=${state.view}, screen=${innerWidth}×${innerHeight}`]);
  lines.push(['Browser', navigator.userAgent]);
  return lines;
}

function reportText(r) {
  const diag = r.diag ? diagnostics(r.item).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
  return `${t('report_' + r.type)}\n\n${r.message}${r.email ? `\n\nReply to: ${r.email}` : ''}${diag ? `\n\n---\n${diag}` : ''}`;
}

function subject(r) {
  return `Macro Meals report: ${r.type}${r.item ? ' — ' + (getItem(r.item)?.pt || r.item) : ''}`;
}

function failureText(err) {
  if (err.kind === 'timeout') return t('reportErrTimeout');
  if (err.kind === 'offline') return t('reportErrOffline');
  return t('reportErrService', { e: err.detail || '' });
}

export function reportSheet(arg) {
  if (!state.report) state.report = { item: arg?.item || null, type: arg?.item ? 'data' : 'bug', message: '', email: '', diag: true };
  const r = state.report;
  if (r.sent) {
    return `${sheetHead(t('reportTitle'))}<div class="sheet-body"><div class="done-box" role="status">${ICON.shield}<b>${esc(t('reportSent'))}</b><p class="muted">${esc(t('reportSentSub'))}</p></div></div>
      <div class="sheet-foot"><button type="button" class="btn primary" data-close>${esc(t('close'))}</button></div>`;
  }
  const it = r.item ? getItem(r.item) : null;
  const err = r.fieldErrors || {};
  const mailto = `mailto:${config.reportEmail}?subject=${encodeURIComponent(subject(r))}&body=${encodeURIComponent(reportText(r).slice(0, 1800))}`;
  return `${sheetHead(t('reportTitle'), it ? t('reportAbout', { name: it.pt }) : t('reportSub'))}
    <form class="sheet-body form" data-form="report" novalidate>
      <label>${esc(t('reportType'))}<select name="type">${TYPES.map((k) => `<option value="${k}" ${k === r.type ? 'selected' : ''}>${esc(t('report_' + k))}</option>`).join('')}</select></label>
      <label>${esc(t('reportWhat'))}<textarea name="message" rows="5" maxlength="2000" placeholder="${esc(t('reportPlaceholder'))}" ${err.message ? 'aria-invalid="true" aria-describedby="reportMsgErr"' : ''}>${esc(r.message)}</textarea>
        ${err.message ? `<span class="field-error" id="reportMsgErr" role="alert">${esc(err.message)}</span>` : ''}</label>
      <label>${esc(t('reportEmail'))}<input name="email" type="email" maxlength="120" autocomplete="email" value="${esc(r.email)}" ${err.email ? 'aria-invalid="true" aria-describedby="reportEmailErr"' : ''}>
        ${err.email ? `<span class="field-error" id="reportEmailErr" role="alert">${esc(err.email)}</span>` : `<small class="faint">${esc(t('reportEmailNote'))}</small>`}</label>
      <label class="check"><input type="checkbox" name="diag" ${r.diag ? 'checked' : ''}><span>${esc(t('reportDiag'))}</span></label>
      <details class="diag"><summary>${esc(t('reportDiagShow'))}</summary><dl>${diagnostics(r.item).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>
      <input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      ${r.failure ? `<div class="error-box" role="alert">
        <b>${esc(t('reportFailed'))}</b><p>${esc(failureText(r.failure))}</p>
        <div class="form-actions start">
          <a class="btn ghost" href="${esc(mailto)}">${esc(t('reportByEmail'))}</a>
          <button type="button" class="btn ghost" data-act="copyReport">${ICON.copy}<span>${esc(t('copyReport'))}</span></button>
        </div>
        <small class="faint">${esc(t('reportEmailTo', { email: config.reportEmail }))}</small>
      </div>` : ''}
      <div class="form-actions"><button type="submit" class="btn primary" ${r.sending ? 'disabled aria-busy="true"' : ''}>${esc(r.sending ? t('sending') : r.failure ? t('tryAgain') : t('sendReport'))}</button></div>
    </form>`;
}

// Keeps typed values in state so re-renders (sending, errors) never lose them.
export function reportInput(e) {
  const form = e.target.closest('form[data-form="report"]');
  if (!form || !state.report) return false;
  const fd = new FormData(form);
  Object.assign(state.report, { type: String(fd.get('type')), message: String(fd.get('message')), email: String(fd.get('email')), diag: !!fd.get('diag') });
  return true;
}

export async function submitReport(form, rerender) {
  reportInput({ target: form });
  const r = state.report;
  if (r.sending) return;
  const message = r.message.trim();
  const email = r.email.trim();
  const fieldErrors = {};
  if (message.length < MIN_LENGTH) fieldErrors.message = t('reportTooShort', { n: MIN_LENGTH });
  if (email && !form.email.checkValidity()) fieldErrors.email = t('reportBadEmail');
  r.fieldErrors = fieldErrors;
  if (Object.keys(fieldErrors).length) {
    rerender();
    document.querySelector(fieldErrors.message ? '#sheet textarea[name="message"]' : '#sheet input[name="email"]')?.focus();
    return;
  }
  if (new FormData(form).get('botcheck')) return; // honeypot: only bots tick the hidden box
  const body = { access_key: config.web3formsKey, subject: subject(r), from_name: 'Macro Meals', type: r.type, message };
  if (email) { body.email = email; body.replyto = email; }
  if (r.diag) for (const [k, v] of diagnostics(r.item)) body[k] = v;
  r.sending = true;
  r.failure = null;
  rerender();
  try {
    if (!navigator.onLine) throw Object.assign(new Error('offline'), { kind: 'offline' });
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => null);
    if (!json || json.success !== true) {
      throw Object.assign(new Error('service'), { kind: 'service', detail: json?.message || `HTTP ${res.status}` });
    }
    state.report = { sent: true };
  } catch (e) {
    r.sending = false;
    r.failure = { kind: e.name === 'TimeoutError' ? 'timeout' : e.kind || (navigator.onLine ? 'service' : 'offline'), detail: e.detail || e.message };
  }
  rerender();
}

export const reportActions = {
  copyReport() { const r = state.report; if (r) copyText(`${subject(r)}\n\n${reportText(r)}`); },
};

export const reportReset = () => { state.report = null; };
