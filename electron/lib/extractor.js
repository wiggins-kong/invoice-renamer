// 发票文本提取与正则字段解析（Electron 桌面版，pdfjs 提取 + 正则）
// 与 Python 版 extractor.py 行为一致：兼容单栏/双栏版式、金额不依赖 ¥ 符号
const path = require('path');
const fs = require('fs');

// pdfjs 是 ESM 模块；Electron 内置 Node 不支持 require(esm)，用动态 import
let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

// pdfjs v4 的 Node 用法：工厂是实例（非类），主线程直接调 fetch(data)
// - cMap:  fetch({name}) → { cMapData: Uint8Array, isCompressed: true }
// - fonts: fetch({filename}) → Buffer（原始字体数据）
const PDFJS_PKG = path.dirname(require.resolve('pdfjs-dist/package.json'));
const CMAPS_DIR = path.join(PDFJS_PKG, 'cmaps');
const STD_FONTS_DIR = path.join(PDFJS_PKG, 'standard_fonts');

class NodeCMapReaderFactory {
  constructor() {}
  async fetch({ name }) {
    const data = fs.readFileSync(path.join(CMAPS_DIR, name + '.bcmap'));
    return { cMapData: new Uint8Array(data), isCompressed: true };
  }
}

class NodeStandardFontDataFactory {
  constructor() {}
  async fetch({ filename }) {
    return fs.readFileSync(path.join(STD_FONTS_DIR, filename));
  }
}

async function openDoc(data) {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({
    data,
    CMapReaderFactory: NodeCMapReaderFactory,
    cMapPacked: true,
    StandardFontDataFactory: NodeStandardFontDataFactory,
    cMapUrl: null,
    standardFontDataUrl: null,
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;
}

const FIELD_LABELS = {
  invoice_no: '发票号码',
  date: '开票日期',
  seller: '销售方',
  buyer: '购买方',
  amount_excl: '金额',
  tax: '税额',
  amount: '价税合计',
  amount_cn: '金额大写',
  type: '票种',
  seller_tax_id: '销售方税号',
  buyer_tax_id: '购买方税号',
};
const KEY_FIELDS = ['invoice_no', 'date', 'amount'];

const RE_INVOICE_NO_CTX = /发票号码[:：]?\s*([0-9]{8,25})/;
const RE_INVOICE_NO_ALONE = /(?<![0-9])(\d{20})(?!\d)/;
const RE_DATE_CTX = /开票日期[:：]?\s*(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/;
const RE_DATE = /(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/;
const RE_TAX_ID = /(?:纳税人识别号|统一社会信用代码)[^\dA-Z]*([0-9A-Z]{15,20})/;
const RE_AMOUNT_CN = /价税合计[（(]大写[）)]\s*([\u4e00-\u9fa5零壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分整]+)/;
const RE_NAME_INLINE = /名称\s*[:：]\s*([^\s:：]{2,60})/;
const RE_COMPANY = /([\u4e00-\u9fa5A-Za-z0-9·（）()]{4,40}(?:公司|厂|店|事务所|中心|集团|医院|学校))/;

function emptyFields() {
  const f = {};
  for (const k of Object.keys(FIELD_LABELS)) f[k] = '';
  return f;
}

// 无状态 matchAll 包装（group=0 返回整段，否则返回捕获组）
function allMatches(re, s, group = 0) {
  const out = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = g.exec(s)) !== null) out.push(m[group]);
  return out;
}

// ---------- 文本提取（含双栏） ----------
async function extractTexts(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await openDoc(data);
  const fullLines = [], leftLines = [], rightLines = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const width = page.getViewport({ scale: 1 }).width;
    const mid = width / 2;
    const tc = await page.getTextContent();
    const rows = groupIntoLines(tc.items);
    for (const line of rows) {
      fullLines.push(line.text);
      const left = line.items.filter(it => it.x < mid).map(it => it.str).join('');
      const right = line.items.filter(it => it.x >= mid).map(it => it.str).join('');
      if (left.trim()) leftLines.push(left);
      if (right.trim()) rightLines.push(right);
    }
  }
  await doc.destroy();
  return { full: fullLines.join('\n'), left: leftLines.join('\n'), right: rightLines.join('\n') };
}

// 按 y 分组成行（y 容差 3），行内按 x 排序，相邻间隙 >2 插入空格
function groupIntoLines(items) {
  const rows = [];
  const Y_TOL = 3;
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find(r => Math.abs(r.y - y) <= Y_TOL);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, x1: x + (it.width || 0), str: it.str });
  }
  rows.sort((a, b) => b.y - a.y); // PDF 坐标 y 向上，大 y = 页面上方
  return rows.map(row => {
    row.items.sort((a, b) => a.x - b.x);
    let text = '';
    let prevX1 = null;
    for (const it of row.items) {
      if (prevX1 !== null && it.x - prevX1 > 2) text += ' ';
      text += it.str;
      prevX1 = it.x1;
    }
    return { text, items: row.items };
  });
}

// ---------- 字段解析 ----------
function detectType(text) {
  const head = text.slice(0, 800);
  if (head.includes('铁路电子客票')) return '铁路电子客票';
  if (head.includes('通行费') && (head.includes('电子发票') || head.includes('数电票'))) return '通行费电子发票（普通）';
  if (head.includes('数电票') || head.includes('全面数字化电子发票')) return head.includes('专用') ? '数电票（专用）' : '数电票（普通）';
  if (head.includes('电子发票')) return head.includes('专用') ? '电子专用发票' : '电子普通发票';
  if (head.includes('增值税专用发票')) return '增值税专用发票';
  if (head.includes('增值税普通发票')) return '增值税普通发票';
  if (head.includes('专用发票')) return '专用发票';
  if (head.includes('普通发票')) return '普通发票';
  return '';
}

function blockAfter(text, keywords, nLines = 8) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (keywords.some(k => lines[i].includes(k))) return lines.slice(i, i + nLines);
  }
  return [];
}

// 去除竖排拆字残留（"购买方信息/销售方信息"竖排拆字可能黏在名称前后：购销买售）
function cleanName(name) {
  return String(name || '')
    .replace(/^[购销买售:：\s]+/, '')
    .replace(/[统一社会信用代码纳税人识别号:：\s]+$/, '')
    .trim();
}

function partyFromColumn(colText) {
  const out = { name: '', tax_id: '' };
  const lines = colText.trim().replace(/名\s+称/g, '名称').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return out;
  for (let i = 0; i < lines.length; i++) {
    const m = RE_NAME_INLINE.exec(lines[i]);
    if (m) { out.name = cleanName(m[1]); if (out.name) break; }
    else if (/名称\s*[:：]?$/.test(lines[i]) && i + 1 < lines.length) {
      // 「名称:」单独一行，名称在下一行（pdfjs 对双栏版式的常见布局）
      out.name = cleanName(lines[i + 1]);
      if (out.name) break;
    }
  }
  if (!out.name) {
    const mm = RE_COMPANY.exec(colText.replace(/名\s+称/g, '名称'));
    if (mm) out.name = cleanName(mm[1]);
  }
  const tm = RE_TAX_ID.exec(colText);
  if (tm) out.tax_id = tm[1];
  return out;
}

function partyBlock(text, keyword) {
  const out = { name: '', tax_id: '' };
  const block = blockAfter(text, [keyword + '信息', keyword + '名称', keyword]);
  const joined = block.join('\n').replace(/名\s+称/g, '名称');
  let m = RE_NAME_INLINE.exec(joined);
  if (m) out.name = m[1].trim();
  else {
    for (const line of block) {
      if (/公司|厂|店|事务所|中心|集团|医院|学校/.test(line) && line.length <= 80) {
        out.name = line.trim();
        break;
      }
    }
  }
  m = RE_TAX_ID.exec(joined);
  if (m) out.tax_id = m[1];
  return out;
}

function extractAmount(text) {
  // 1) 价税合计行：优先「小写」后金额；否则带小数金额；否则段内最后数字
  const idx = text.indexOf('价税合计');
  if (idx !== -1) {
    const seg = text.slice(idx, idx + 120);
    let m = /小写[)）]?\s*[¥￥´]?\s*([\d,]+(?:\.\d{1,2})?)/.exec(seg);
    if (!m) {
      const dec = allMatches(/[\d,]+\.\d{1,2}/, seg);
      if (dec.length) m = { 1: dec[dec.length - 1] };
      else {
        const nums = allMatches(/[\d,]+(?:\.\d{1,2})?/, seg);
        if (nums.length) m = { 1: nums[nums.length - 1] };
      }
    }
    if (m) return (m[1] || '').replace(/,/g, '');
  }
  // 2) 合计行：金额+税额 求和
  let total = null;
  for (const line of text.split('\n')) {
    if (line.includes('合计') && !line.includes('价税合计')) {
      const vals = allMatches(/[\d,]+(?:\.\d{1,2})?/, line).map(s => parseFloat(s.replace(/,/g, '')));
      if (vals.length) total = (total || 0) + vals.reduce((a, b) => a + b, 0);
    }
  }
  if (total !== null) return total.toFixed(2);
  // 3) 兜底：最后 ¥/´ 金额
  const amounts = allMatches(/[¥￥´]\s*([\d,]+(?:\.\d{1,2})?)/, text, 1);
  if (amounts.length) return amounts[amounts.length - 1].replace(/,/g, '');
  return '';
}

// 金额（不含税）与税额：锚定「合计」行（非价税合计），行内两个带小数数字 = 金额、税额
// 例：`合 计 ¥293.81 ¥38.19` → amount_excl=293.81, tax=38.19
function extractAmountExclAndTax(text) {
  const out = { amount_excl: '', tax: '' };
  for (const line of text.split('\n')) {
    const l = line.replace(/\s/g, '');
    if (l.includes('合计') && !l.includes('价税合计')) {
      const nums = allMatches(/[\d,]+\.\d{1,2}/, l);
      if (nums.length >= 2) {
        out.amount_excl = nums[nums.length - 2].replace(/,/g, '');
        out.tax = nums[nums.length - 1].replace(/,/g, '');
        break;
      }
    }
  }
  return out;
}

// 折叠连续重复的短语（防复制水印 PDF：标签/短语重复 3 遍）
// '名称：名称：名称：' → '名称：'；'购购购' → '购'；'发票号码：发票号码：发票号码：' → '发票号码：'
// 只折叠 ≥3 次重复（\1{2,}），保护合法叠字（如公司名中恰好重复 2 次的情况）
function dedup(text) {
  return String(text).replace(/(.{1,12}?)\1{2,}/g, '$1');
}

// 水印残留的伪名称：只含「名称/购销买售」等标签字的匹配结果（如 '名称'、'名称名称'）
const JUNK_NAME = /^(?:名称|购销买售|名|称)+$/;

function parseFields(text, leftCol = '', rightCol = '') {
  // 第一遍：原始文本解析（原始优先，保护合法叠字公司名）
  const fields = parseFieldsCore(text, leftCol, rightCol);
  const missing = KEY_FIELDS.some(k => !fields[k]) || !fields.type;
  // 名称类字段可能解析出「名称」这类水印残留伪值（非空但有误）
  const nameBad = ['seller', 'buyer'].some(k => fields[k] && JUNK_NAME.test(fields[k]));
  if (missing || nameBad) {
    // 第二遍：折叠重复字后的文本再解析，只补空值/伪值
    const dFields = parseFieldsCore(dedup(text), dedup(leftCol), dedup(rightCol));
    for (const k of Object.keys(fields)) {
      const bad = (k === 'seller' || k === 'buyer') && fields[k] && JUNK_NAME.test(fields[k]);
      if ((!fields[k] || bad) && dFields[k]) fields[k] = dFields[k];
    }
  }
  return fields;
}

function parseFieldsCore(text, leftCol = '', rightCol = '') {
  const fields = emptyFields();
  fields.type = detectType(text);

  let m = RE_INVOICE_NO_CTX.exec(text);
  if (!m) m = RE_INVOICE_NO_ALONE.exec(text);
  if (m) fields.invoice_no = m[1];

  m = RE_DATE_CTX.exec(text);
  if (!m) m = RE_DATE.exec(text);
  if (m) {
    const [, y, mo, d] = m;
    // 汉字年月日格式：2026年08月15日（月日补零）
    fields.date = `${String(+y).padStart(4, '0')}年${String(+mo).padStart(2, '0')}月${String(+d).padStart(2, '0')}日`;
  }

  fields.amount = extractAmount(text);

  // 金额（不含税）/税额：优先合计行直接提取；缺失一侧时用 价税合计 推算
  const ae = extractAmountExclAndTax(text);
  fields.amount_excl = ae.amount_excl;
  fields.tax = ae.tax;
  const total = parseFloat(fields.amount);
  if (!isNaN(total)) {
    if (fields.amount_excl && !fields.tax) {
      fields.tax = Math.max(0, Math.round((total - parseFloat(fields.amount_excl)) * 100) / 100).toFixed(2);
    } else if (fields.tax && !fields.amount_excl) {
      fields.amount_excl = Math.max(0, Math.round((total - parseFloat(fields.tax)) * 100) / 100).toFixed(2);
    }
  }

  m = RE_AMOUNT_CN.exec(text);
  if (m) fields.amount_cn = m[1];

  let seller = partyFromColumn(rightCol);
  let buyer = partyFromColumn(leftCol);
  if (!seller.name) seller = partyBlock(text, '销售方');
  if (!buyer.name) buyer = partyBlock(text, '购买方');
  fields.seller = seller.name;
  fields.seller_tax_id = seller.tax_id;
  fields.buyer = buyer.name;
  fields.buyer_tax_id = buyer.tax_id;
  return fields;
}

async function parsePdf(pdfPath) {
  let texts;
  try {
    texts = await extractTexts(pdfPath);
  } catch (e) {
    return { fields: emptyFields(), errors: [`PDF 读取失败: ${e.message}`], rawText: '' };
  }
  if (!texts.full.trim()) {
    return { fields: emptyFields(), errors: ['未提取到文本（可能不是文字型 PDF）'], rawText: '' };
  }
  const fields = parseFields(texts.full, texts.left, texts.right);
  const errors = [];
  for (const k of KEY_FIELDS) {
    if (!fields[k]) errors.push(`未识别到${FIELD_LABELS[k]}`);
  }
  return { fields, errors, rawText: texts.full };
}

module.exports = {
  FIELD_LABELS, KEY_FIELDS, extractTexts, parseFields, parseFieldsCore, parsePdf, emptyFields,
};
