// JS 解析回归测试：验证移植后的 extractor.js 与 Python 版行为一致
const { parsePdf, FIELD_LABELS } = require('../lib/extractor');
const { renderTemplate } = require('../lib/renamer');

const TPL = [
  { t: 'field', v: 'date' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'invoice_no' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'seller' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'amount' },
];

const CASES = [
  {
    file: 'C:/Users/wiggins/invoice-renamer/samples/样例1_电子普通发票.pdf',
    expect: { invoice_no: '25512345678901234567', date: '2026年08月15日', seller: '深圳市某某科技有限公司', buyer: '北京某某商贸有限公司', amount: '100.00', amount_cn: '壹佰元整', type: '电子普通发票' },
  },
  {
    file: 'C:/Users/wiggins/invoice-renamer/samples/样例2_电子专用发票.pdf',
    expect: { invoice_no: '25512345678901234568', date: '2026年08月12日', seller: '广州某某软件有限公司', buyer: '上海某某供应链有限公司', amount: '5000.00', amount_cn: '伍仟元整', type: '电子专用发票' },
  },
  {
    file: 'C:/Users/wiggins/invoice-renamer/electron/tests/fixtures/26447000001576812494_2026-08-13广州晶东贸易有限公司广州白云山明兴制药有限公司332电子发票(增值税专用发票).pdf',
    expect: { invoice_no: '26447000001576812494', date: '2026年08月13日', seller: '广州晶东贸易有限公司', buyer: '广州白云山明兴制药有限公司', amount: '332.00', amount_excl: '293.81', tax: '38.19', amount_cn: '叁佰叁拾贰圆整', type: '电子专用发票', seller_tax_id: '91440101664041243T', buyer_tax_id: '9144010119046020XE' },
  },
  {
    file: 'C:/Users/wiggins/invoice-renamer/electron/tests/fixtures/26447000001568876321_2026-08-12广州晶东贸易有限公司.pdf',
    expect: { invoice_no: '26447000001568876321', date: '2026年08月12日', seller: '广州晶东贸易有限公司', amount: '514.38', amount_excl: '455.20', tax: '59.18', type: '电子专用发票' },
  },
  {
    // 防复制水印 PDF（每个字重复 3 遍）：dedup 兜底后应正确识别销售方
    file: 'C:/Users/wiggins/invoice-renamer/electron/tests/fixtures/水印发票_26447000001546483915.pdf',
    expect: { invoice_no: '26447000001546483915', date: '2026年08月08日', seller: '广州晶东贸易有限公司', buyer: '广州白云山明兴制药有限公司', amount: '1177.00', amount_excl: '1041.59', tax: '135.41', type: '电子专用发票' },
  },
];

(async () => {
  let passed = 0, failed = 0;
  for (const c of CASES) {
    const r = await parsePdf(c.file);
    const f = r.fields;
    console.log('== ' + c.file.split('/').pop());
    console.log('   errors:', r.errors.length ? r.errors : '无');
    let ok = r.errors.length === 0;
    for (const [k, v] of Object.entries(c.expect)) {
      const match = f[k] === v;
      if (!match) console.log(`   ✗ ${FIELD_LABELS[k]}: 期望 ${v}，实际 ${f[k]}`);
      ok = ok && match;
    }
    const suggested = renderTemplate(TPL, f);
    console.log('   suggested:', suggested);
    if (ok) { passed++; console.log('   ✓ 通过'); }
    else { failed++; console.log('   ✗ 失败'); }
  }
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})();
