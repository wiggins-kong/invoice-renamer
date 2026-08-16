// 校验前端 JS 的 renderTemplateJS 与后端 Python render_template 行为一致
const fs = require('fs');
const src = fs.readFileSync('C:/Users/wiggins/invoice-renamer/static/index.html', 'utf8');
const m = src.match(/function renderTemplateJS[\s\S]*?\n}/);
if (!m) { console.error('renderTemplateJS not found'); process.exit(1); }
eval(m[0]);

const tpl = [
  { t: 'field', v: 'date' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'invoice_no' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'seller' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'amount' }
];
const full = { date: '2026-08-15', invoice_no: '25512345678901234567', seller: '深圳XX公司', amount: '100.00' };
const missingDate = { ...full, date: '' };
const missingMid = { date: '2026-08-15', invoice_no: '', seller: '深圳XX公司', amount: '100.00' };
const sepOnly = { date: '', invoice_no: '', seller: '', amount: '' };

console.log('JS 完整字段:', renderTemplateJS(tpl, full));
console.log('JS 缺日期:  ', renderTemplateJS(tpl, missingDate));
console.log('JS 缺号码:  ', renderTemplateJS(tpl, missingMid));
console.log('JS 全缺:    ', '[' + renderTemplateJS(tpl, sepOnly) + ']');
