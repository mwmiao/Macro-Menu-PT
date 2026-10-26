// Text and numbers for the order pad: the "How to order" script and the receipt card.

const LIST_AND = { pt: ' e ', en: ', and ' };

function joinList(parts, lang) {
  if (parts.length < 2) return parts.join('');
  return parts.slice(0, -1).join(', ') + LIST_AND[lang] + parts[parts.length - 1];
}

// groups: [{ chain: 'KFC', lines: [{ name, qty }] }] — one script per restaurant.
export function orderScript(groups, lang) {
  return groups.map(({ chain, lines }) => {
    const parts = lines.map(({ name, qty }) => (lang === 'en' && qty === 1 ? `a ${name}` : `${qty} ${name}`));
    const body = lang === 'pt'
      ? `Olá, queria por favor ${joinList(parts, 'pt')}.\nÉ tudo, obrigado!`
      : `Hi, can I please get ${joinList(parts, 'en')}.\nThat's it, thanks!`;
    return groups.length > 1 ? `${chain}:\n${body}` : body;
  }).join('\n\n');
}

// A stable 4-digit "order number" and barcode pattern for the receipt, derived from its items.
export function orderNumber(items) {
  let h = 2166136261;
  for (const { key, qty } of items) {
    for (const ch of key + '*' + qty) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return String((h >>> 0) % 9000 + 1000);
}

export function barcodeWidths(seed, bars = 38) {
  const out = [];
  let x = Number(seed) || 1;
  for (let i = 0; i < bars; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out.push(1 + (x % 4));
  }
  return out;
}

// Share of calories from each macro, as whole percentages.
export function macroSplit({ p, f, c }) {
  const pk = p * 4, fk = f * 9, ck = c * 4, tot = pk + fk + ck;
  if (!tot) return { p: 0, f: 0, c: 0 };
  return { p: Math.round((pk / tot) * 100), f: Math.round((fk / tot) * 100), c: Math.round((ck / tot) * 100) };
}
