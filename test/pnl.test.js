import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPnL, computeMonth, analyze, commentary, parseCSV, aiCommentary, promptFor } from '../site/pnl.js';
const sample = readFileSync(new URL('../site/sample/store_pnl_sample.csv', import.meta.url), 'utf8');

test('parses quoted CSV with commas', () => { assert.deepEqual(parseCSV('a,b\n"1,000",2\n'), [['a', 'b'], ['1,000', '2']]); });
test('loads sample and sorts months', () => { const d = loadPnL(sample); assert.equal(d.months.length, 6); assert.equal(d.months[0].month, '2026-04'); });
test('header aliases and currency formatting', () => {
  const d = loadPnL('Period,Revenue,Cost of Goods Sold,Marketing\n2026-02,"$1,000",400,(100)\n2026-01,900,350,80\n');
  assert.equal(d.months[1].gross_sales, 1000); assert.equal(d.months[1].ad_spend, 100); assert.equal(d.months[0].month, '2026-01');
});
test('missing required columns gives a clear error', () => { assert.throws(() => loadPnL('month,orders\n2026-01,5'), /gross_sales, cogs/); });
test('P&L maths', () => {
  const c = computeMonth({ gross_sales: 1000, discounts: 100, refunds: 50, cogs: 400, shipping: 50, payment_fees: 20, ad_spend: 200, apps_software: 10, payroll: 50, other_opex: 20, orders: 10 });
  assert.equal(c.net_revenue, 850); assert.equal(c.gross_profit, 450); assert.equal(c.contribution, 180); assert.equal(c.ebitda, 100); assert.equal(c.cm_per_order, 18);
});
test('variance bridge reconciles to EBITDA change', () => {
  const a = analyze(loadPnL(sample)); const sum = a.bridge.reduce((s, b) => s + b.impact, 0);
  assert.ok(Math.abs(sum - (a.cur.ebitda - a.prev.ebitda)) < 1e-6);
});
test('sample month raises refund, cash and ad flags', () => {
  const t = analyze(loadPnL(sample)).flags.map((f) => f.title).join('|');
  assert.match(t, /High refunds/); assert.match(t, /Cash is going down/); assert.match(t, /Ad spend/);
});
test('healthy store gets no red flags', () => {
  const a = analyze(loadPnL('month,gross_sales,cogs,ad_spend\n2026-01,1000,300,100\n2026-02,1100,320,105\n'));
  assert.equal(a.flags[0].level, 'good');
});
test('commentary mentions month and EBITDA', () => { const c = commentary(analyze(loadPnL(sample)), '$'); assert.match(c[0], /2026-09/); assert.match(c[1], /EBITDA/); });
test('AI commentary uses user key and parses bullets', async () => {
  let sent; const fetchImpl = async (url, o) => { sent = { url, o }; return { ok: true, json: async () => ({ choices: [{ message: { content: '- one point\n- two point' } }] }) }; };
  const b = await aiCommentary(analyze(loadPnL(sample)), { provider: 'openai', apiKey: 'k', fetchImpl });
  assert.deepEqual(b, ['one point', 'two point']); assert.equal(sent.o.headers.Authorization, 'Bearer k');
  assert.match(promptFor(analyze(loadPnL(sample))), /CFO/);
});
