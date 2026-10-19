import { loadPnL, analyze, commentary, aiCommentary } from './pnl.js';
const $ = (id) => document.getElementById(id);
const S = { data: null, idx: 0, cur: '$', ai: null };
const pct = (x) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`);
const m = (v) => (v == null ? '–' : `${v < 0 ? '−' : ''}${S.cur}${Math.abs(Math.round(v)).toLocaleString('en-US')}`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function open(text) {
  try {
    S.data = loadPnL(text); S.idx = S.data.months.length - 1; S.ai = null;
    $('month').innerHTML = S.data.months.map((x, i) => `<option value="${i}">${esc(x.month)}</option>`).join('');
    $('month').value = S.idx; $('err').hidden = true; $('landing').hidden = true; $('report').hidden = false; render(); scrollTo(0, 0);
  } catch (e) { $('err').textContent = e.message; $('err').hidden = false; }
}
function kpi(l, v, d, good) { return `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="d ${good == null ? 'muted' : good ? 'up' : 'down'}">${d || '&nbsp;'}</div></div>`; }
function render() {
  const a = analyze(S.data, { currentIndex: S.idx }), c = a.cur, p = a.prev;
  const ch = (k, better = 1) => { if (!p || p[k] == null || c[k] == null) return [null, null]; const d = c[k] - p[k]; return [d, d * better >= 0]; };
  const pp = (k) => { const [d, g] = ch(k); return [d == null ? 'first month' : `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)} pts vs last month`, g]; };
  const rv = ch('net_revenue'), eb = ch('ebitda');
  $('kpis').innerHTML = [
    kpi('Net revenue', m(c.net_revenue), rv[0] == null ? '' : `${rv[0] >= 0 ? '+' : ''}${pct(rv[0] / p.net_revenue)} vs last month`, rv[1]),
    kpi('Gross margin', pct(c.gross_margin), ...pp('gross_margin')),
    kpi('Contribution margin', pct(c.contribution_margin), ...pp('contribution_margin')),
    kpi('EBITDA', m(c.ebitda), eb[0] == null ? pct(c.ebitda_margin) : `${pct(c.ebitda_margin)} margin · ${eb[0] >= 0 ? '+' : '−'}${m(Math.abs(eb[0]))}`, eb[1]),
    kpi('Contribution / order', m(c.cm_per_order), c.aov ? `AOV ${m(c.aov)}` : '', null),
    kpi('MER (revenue ÷ ads)', c.mer ? `${c.mer.toFixed(2)}x` : '–', c.cac ? `Ad cost / order ${m(c.cac)}` : '', null),
    kpi('Refund rate', pct(c.refund_rate), `Discounts ${pct(c.discount_rate)}`, null),
    kpi('Cash', m(c.ending_cash), c.inventory_days ? `${Math.round(c.inventory_days)} days of inventory` : '', null),
  ].join('');
  $('comment').innerHTML = (S.ai || commentary(a, S.cur)).map((t) => `<li>${esc(t)}</li>`).join('');
  $('flags').innerHTML = a.flags.map((f) => `<div class="flag ${f.level}"><b>${esc(f.title)}</b>${esc(f.detail)}</div>`).join('');
  $('pnl').innerHTML = `<tr><th>Line</th><th>${esc(c.month)}</th><th>% of net rev</th><th>${p ? esc(p.month) : 'Prior'}</th><th>Change</th><th>Profit impact</th></tr>` +
    a.variance.map((v) => `<tr class="${v.total ? 'total' : ''}"><td>${v.label}</td><td>${m(v.cur)}</td><td>${pct(v.pctRev)}</td><td>${m(v.prev)}</td><td>${v.pct == null ? '–' : `${v.pct >= 0 ? '+' : ''}${pct(v.pct)}`}</td><td class="${v.impact == null ? '' : v.impact >= 0 ? 'up' : 'down'}">${v.impact == null ? '–' : (v.impact >= 0 ? '+' : '−') + m(Math.abs(v.impact)).replace('−', '')}</td></tr>`).join('');
  const mx = Math.max(1, ...a.bridge.map((b) => Math.abs(b.impact)));
  $('bridge').innerHTML = p ? a.bridge.map((b) => `<div class="bar"><span class="n">${b.label}</span><span class="t"><span class="f ${b.impact >= 0 ? 'pos' : 'neg'}" style="display:block;width:${(Math.abs(b.impact) / mx) * 100}%"></span></span><span class="x ${b.impact >= 0 ? 'up' : 'down'}">${b.impact >= 0 ? '+' : '−'}${m(Math.abs(b.impact))}</span></div>`).join('') : '<p class="muted">Needs a prior month.</p>';
  const ms = a.months.slice(0, S.idx + 1).slice(-6), tm = Math.max(...ms.map((x) => Math.abs(x.net_revenue)));
  $('trend').innerHTML = ms.map((x) => `<div class="bar"><span class="n">${esc(x.month)}</span><span class="t"><span class="f pos" style="display:block;width:${(x.net_revenue / tm) * 100}%;background:var(--brand)"></span></span><span class="x">${pct(x.ebitda_margin)} EBITDA</span></div>`).join('') + '<p class="small muted">Bar = net revenue, right = EBITDA margin.</p>';
}
$('file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) open(await f.text()); });
const dz = $('drop');
['dragover', 'dragenter'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, () => dz.classList.remove('drag')));
dz.addEventListener('drop', async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) open(await f.text()); });
$('try-sample').addEventListener('click', async () => open(await (await fetch('sample/store_pnl_sample.csv')).text()));
$('month').addEventListener('change', (e) => { S.idx = +e.target.value; S.ai = null; render(); });
$('cur').addEventListener('change', (e) => { S.cur = e.target.value; render(); });
$('back').addEventListener('click', () => { $('report').hidden = true; $('landing').hidden = false; $('file').value = ''; });
$('print').addEventListener('click', () => print());
$('ai-run').addEventListener('click', async () => {
  const key = $('key').value.trim(), st = $('ai-status'), b = $('ai-run');
  if (!key) { st.textContent = 'Paste an API key first. The rest of the report works without one.'; return; }
  b.disabled = true; st.textContent = 'Writing CFO note…';
  try { S.ai = await aiCommentary(analyze(S.data, { currentIndex: S.idx }), { provider: $('prov').value, apiKey: key, currency: S.cur }); render(); st.textContent = '✓ AI note shown above. Your key was used once and not saved.'; }
  catch (e) { st.textContent = `AI note failed: ${e.message}. The rule-based commentary is still shown.`; } finally { b.disabled = false; }
});
if (new URLSearchParams(location.search).has('sample')) $('try-sample').click();
