// Store P&L Analyst: all maths runs in the browser. No data leaves the page.

export const FIELDS = {
  month: ['month', 'period', 'date', 'month_start'],
  gross_sales: ['gross_sales', 'gross sales', 'sales', 'revenue', 'gross_revenue', 'total_sales'],
  discounts: ['discounts', 'discount', 'promotions'],
  refunds: ['refunds', 'returns', 'refund', 'chargebacks'],
  cogs: ['cogs', 'cost_of_goods', 'cost of goods sold', 'product_cost', 'cost'],
  shipping: ['shipping', 'fulfilment', 'fulfillment', 'shipping_cost', 'delivery'],
  payment_fees: ['payment_fees', 'transaction_fees', 'fees', 'processing_fees', 'gateway_fees'],
  ad_spend: ['ad_spend', 'marketing', 'ads', 'advertising', 'paid_media'],
  apps_software: ['apps_software', 'software', 'apps', 'saas'],
  payroll: ['payroll', 'salaries', 'staff', 'wages'],
  other_opex: ['other_opex', 'opex', 'other', 'overheads', 'rent'],
  orders: ['orders', 'order_count', 'number_of_orders'],
  ending_cash: ['ending_cash', 'cash', 'cash_balance', 'bank'],
  ending_inventory: ['ending_inventory', 'inventory', 'inventory_value', 'stock_value'],
};
const REQUIRED = ['month', 'gross_sales', 'cogs'];

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const norm = (s) => s.trim().toLowerCase().replace(/[\s\-]+/g, '_');
const num = (v) => { if (v == null) return 0; const s = String(v).trim(); if (!s) return 0; const neg = /^\(.*\)$/.test(s) || s.startsWith('-'); const n = parseFloat(s.replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : (neg ? -n : n); };

export function loadPnL(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The file needs a header row and at least one month.');
  const head = rows[0].map(norm);
  const idx = {};
  for (const [k, al] of Object.entries(FIELDS)) { const i = head.findIndex((h) => al.map(norm).includes(h)); if (i >= 0) idx[k] = i; }
  const missing = REQUIRED.filter((k) => idx[k] == null);
  if (missing.length) throw new Error(`Missing column(s): ${missing.join(', ')}. Download the template to see the expected format.`);
  const months = rows.slice(1).map((r) => {
    const m = { month: r[idx.month].trim() };
    for (const k of Object.keys(FIELDS)) if (k !== 'month') m[k] = idx[k] == null ? null : Math.abs(num(r[idx[k]]));
    return m;
  }).filter((m) => m.month);
  months.sort((a, b) => a.month.localeCompare(b.month));
  return { months, has: Object.fromEntries(Object.keys(FIELDS).map((k) => [k, idx[k] != null])) };
}

const z = (v) => v || 0;
const div = (a, b) => (b ? a / b : null);

export function computeMonth(m) {
  const net_revenue = m.gross_sales - z(m.discounts) - z(m.refunds);
  const gross_profit = net_revenue - m.cogs;
  const variable = z(m.shipping) + z(m.payment_fees);
  const contribution_pre_ads = gross_profit - variable;
  const contribution = contribution_pre_ads - z(m.ad_spend);
  const fixed = z(m.apps_software) + z(m.payroll) + z(m.other_opex);
  const ebitda = contribution - fixed;
  const o = m.orders || null;
  return {
    ...m, net_revenue, gross_profit, variable, contribution_pre_ads, contribution, fixed, ebitda,
    gross_margin: div(gross_profit, net_revenue),
    contribution_margin: div(contribution, net_revenue),
    ebitda_margin: div(ebitda, net_revenue),
    discount_rate: div(z(m.discounts), m.gross_sales),
    refund_rate: div(z(m.refunds), m.gross_sales),
    ad_pct: div(z(m.ad_spend), net_revenue),
    mer: div(net_revenue, m.ad_spend),
    aov: o ? net_revenue / o : null,
    cm_per_order: o ? contribution / o : null,
    cac: o && m.ad_spend ? m.ad_spend / o : null,
    inventory_days: m.ending_inventory != null && m.cogs ? (m.ending_inventory / m.cogs) * 30 : null,
  };
}

export const LINES = [
  ['gross_sales', 'Gross sales'], ['discounts', 'Discounts', -1], ['refunds', 'Refunds', -1], ['net_revenue', 'Net revenue', 0, true],
  ['cogs', 'COGS', -1], ['gross_profit', 'Gross profit', 0, true], ['shipping', 'Shipping & fulfilment', -1], ['payment_fees', 'Payment fees', -1],
  ['ad_spend', 'Ad spend', -1], ['contribution', 'Contribution margin', 0, true], ['apps_software', 'Apps & software', -1], ['payroll', 'Payroll', -1],
  ['other_opex', 'Other opex', -1], ['ebitda', 'EBITDA', 0, true],
];

export function analyze(data, { currentIndex } = {}) {
  const ms = data.months.map(computeMonth);
  const ci = currentIndex ?? ms.length - 1;
  const cur = ms[ci], prev = ci > 0 ? ms[ci - 1] : null;
  const variance = LINES.map(([k, label, sign, total]) => {
    const c = cur[k], p = prev ? prev[k] : null;
    if (c == null) return null;
    const delta = p == null ? null : c - p;
    // Effect on profit: costs going up hurt, revenue/profit going up helps.
    const impact = delta == null ? null : (sign === -1 ? -delta : delta);
    return { key: k, label, cur: c, prev: p, delta, pct: p ? delta / p : null, impact, total: !!total, pctRev: div(c, cur.net_revenue) };
  }).filter(Boolean);
  // Bridge: what moved EBITDA vs last month.
  const bridge = prev ? variance.filter((v) => !v.total && v.impact).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)) : [];
  return { months: ms, cur, prev, variance, bridge, flags: flags(ms, ci) };
}

export function flags(ms, ci = ms.length - 1) {
  const c = ms[ci], p = ci > 0 ? ms[ci - 1] : null, f = [];
  const add = (level, title, detail) => f.push({ level, title, detail });
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  if (c.ebitda < 0) add('bad', 'Loss-making month', `EBITDA is negative at ${pct(c.ebitda_margin)} of net revenue.`);
  if (c.contribution_margin != null && c.contribution_margin < 0.1) add('bad', 'Thin contribution margin', `Only ${pct(c.contribution_margin)} of net revenue is left after product, fulfilment and ads. Growth at this margin burns cash.`);
  if (c.refund_rate != null && c.refund_rate > 0.07) add('bad', 'High refunds', `Refunds are ${pct(c.refund_rate)} of gross sales${p && p.refund_rate != null ? ` (was ${pct(p.refund_rate)})` : ''}. Check top refunded SKUs and reasons.`);
  if (c.discount_rate != null && c.discount_rate > 0.1) add('warn', 'Heavy discounting', `Discounts are ${pct(c.discount_rate)} of gross sales.`);
  if (c.ad_pct != null && c.ad_pct > 0.3) add('warn', 'Ad spend is a large share of revenue', `Ads take ${pct(c.ad_pct)} of net revenue (MER ${c.mer.toFixed(2)}x).`);
  if (p && c.mer != null && p.mer != null && c.mer < p.mer * 0.9) add('warn', 'Ads getting less efficient', `MER fell from ${p.mer.toFixed(2)}x to ${c.mer.toFixed(2)}x.`);
  if (p && c.gross_margin != null && p.gross_margin != null && c.gross_margin < p.gross_margin - 0.02) add('warn', 'Gross margin slipping', `Gross margin dropped from ${pct(p.gross_margin)} to ${pct(c.gross_margin)}. Look at supplier costs, mix and discounts.`);
  if (p && c.cm_per_order != null && p.cm_per_order != null && c.cm_per_order < p.cm_per_order) add('warn', 'Less profit per order', `Contribution per order fell from ${p.cm_per_order.toFixed(2)} to ${c.cm_per_order.toFixed(2)}.`);
  if (c.cac != null && c.cm_per_order != null && c.cm_per_order < 0) add('bad', 'Each order loses money after ads', `Ad cost per order is ${c.cac.toFixed(2)}, more than the ${(c.cm_per_order + c.cac).toFixed(2)} each order earns before ads.`);
  if (c.inventory_days != null && c.inventory_days > 75) add('warn', 'Cash tied up in stock', `About ${Math.round(c.inventory_days)} days of inventory on hand.`);
  if (p && c.ending_cash != null && p.ending_cash != null && c.ending_cash < p.ending_cash) {
    const burn = p.ending_cash - c.ending_cash; const runway = c.ending_cash / burn;
    add(runway < 6 ? 'bad' : 'warn', 'Cash is going down', `Cash fell by ${Math.round(burn).toLocaleString()} this month. At that pace you have about ${runway.toFixed(1)} months of runway.`);
  }
  if (!f.length) add('good', 'No red flags', 'Margins, refunds, ad efficiency and cash all look healthy for this month.');
  return f;
}

const money = (v, cur) => `${v < 0 ? "−" : ""}${cur}${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
export function commentary(a, cur = '$') {
  const c = a.cur, p = a.prev, pct = (x) => `${(x * 100).toFixed(1)}%`, out = [];
  out.push(`${c.month}: net revenue ${money(c.net_revenue, cur)}${p ? ` (${c.net_revenue >= p.net_revenue ? '+' : ''}${pct((c.net_revenue - p.net_revenue) / p.net_revenue)} vs ${p.month})` : ''}, EBITDA ${money(c.ebitda, cur)} (${pct(c.ebitda_margin)} margin).`);
  if (p) {
    const d = c.ebitda - p.ebitda;
    const top = a.bridge.slice(0, 3).map((b) => `${b.label.toLowerCase()} ${b.impact >= 0 ? '+' : '−'}${money(Math.abs(b.impact), cur)}`).join(', ');
    out.push(`EBITDA ${d >= 0 ? 'rose' : 'fell'} by ${money(Math.abs(d), cur)}. Biggest drivers: ${top}.`);
  }
  out.push(`Gross margin ${pct(c.gross_margin)}, contribution margin ${pct(c.contribution_margin)}${c.cm_per_order != null ? `, ${money(c.cm_per_order, cur)} contribution per order` : ''}.`);
  const bad = a.flags.filter((f) => f.level !== 'good').slice(0, 2);
  if (bad.length) out.push(`Watch: ${bad.map((f) => f.title.toLowerCase()).join('; ')}.`);
  return out;
}

export function promptFor(a, cur = '$') {
  const r = (v) => (v == null ? 'n/a' : typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
  const keys = ['month', 'net_revenue', 'gross_margin', 'contribution_margin', 'ebitda', 'ebitda_margin', 'refund_rate', 'discount_rate', 'ad_pct', 'mer', 'aov', 'cm_per_order', 'ending_cash', 'inventory_days'];
  const table = a.months.map((m) => keys.map((k) => `${k}=${r(m[k])}`).join(', ')).join('\n');
  return `You are the CFO of an online store, writing a month-end note to the founder. Currency: ${cur}.
Monthly metrics (oldest first):
${table}
Flags already detected: ${a.flags.map((f) => f.title).join('; ')}.
Write 5 to 7 short bullet points, each starting with "- ". Cover: what happened this month and why, the 2-3 numbers that matter most, the biggest risk, and 3 concrete actions for next month with the expected impact. Use only the numbers given. No preamble.`;
}

export function parseBullets(text) {
  return text.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((l) => l.length > 3);
}

export async function aiCommentary(a, { provider, apiKey, currency = '$', fetchImpl = fetch }) {
  const prompt = promptFor(a, currency); let text;
  if (provider === 'anthropic') {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 700, messages: [{ role: 'user', content: prompt }] }) });
    const d = await res.json(); if (!res.ok) throw new Error(d?.error?.message || `Anthropic API error ${res.status}`);
    text = (d.content || []).map((b) => b.text || '').join('');
  } else {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, messages: [{ role: 'user', content: prompt }] }) });
    const d = await res.json(); if (!res.ok) throw new Error(d?.error?.message || `OpenAI API error ${res.status}`);
    text = d.choices?.[0]?.message?.content || '';
  }
  const b = parseBullets(text); if (!b.length) throw new Error('The model returned an empty answer.'); return b;
}
