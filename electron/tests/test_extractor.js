// JS 解析回归测试：验证移植后的 extractor.js 与 Python 版行为一致
const { parsePdf, FIELD_LABELS } = require('../lib/extractor');
const { renderTemplate } = require('../lib/renamer');

const TPL = [
  { t: 'field', v: 'date' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'invoice_no' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'seller' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'amount' },
];

const path = require('path');
// 路径基于脚本位置解析，换机器/盘符不受影响
const FIXTURES = path.join(__dirname, 'fixtures');
const SAMPLES = path.join(__dirname, '..', '..', 'samples');

const CASES = [
  {
    file: path.join(SAMPLES, '样例1_电子普通发票.pdf'),
    expect: { invoice_no: '25512345678901234567', date: '2026年08月15日', seller: '深圳市某某科技有限公司', buyer: '北京某某商贸有限公司', amount: '100.00', amount_cn: '壹佰元整', type: '电子普通发票' },
  },
  {
    file: path.join(SAMPLES, '样例2_电子专用发票.pdf'),
    expect: { invoice_no: '25512345678901234568', date: '2026年08月12日', seller: '广州某某软件有限公司', buyer: '上海某某供应链有限公司', amount: '5000.00', amount_cn: '伍仟元整', type: '电子专用发票' },
  },
  {
    file: path.join(FIXTURES, '26447000002000000001_2026-08-13广州云帆贸易有限公司广州明辉制药有限公司332电子发票(增值税专用发票).pdf'),
    expect: { invoice_no: '26447000002000000001', date: '2026年08月13日', seller: '广州云帆贸易有限公司', buyer: '广州明辉制药有限公司', amount: '332.00', amount_excl: '293.81', tax: '38.19', amount_cn: '叁佰叁拾贰圆整', type: '电子专用发票', seller_tax_id: '91440100MA5FAKE001', buyer_tax_id: '91440100MA5FAKE002' },
  },
  {
    file: path.join(FIXTURES, '26447000002000000002_2026-08-12广州云帆贸易有限公司.pdf'),
    expect: { invoice_no: '26447000002000000002', date: '2026年08月12日', seller: '广州云帆贸易有限公司', amount: '514.38', amount_excl: '455.20', tax: '59.18', type: '电子专用发票' },
  },
  {
    // 防复制水印 PDF（数字/日期逐字重复 3 遍、名称整段重复）：dedup 兜底后应正确识别
    file: path.join(FIXTURES, '水印发票_26453579152834615209.pdf'),
    expect: { invoice_no: '26453579152834615209', date: '2026年08月08日', seller: '广州云帆贸易有限公司', buyer: '广州明辉制药有限公司', amount: '120.50', amount_excl: '106.64', tax: '13.86', type: '电子专用发票' },
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
