// 单文件 LLM 重识别交互验证（开发用）：stub IPC 模拟主进程 parse:one-llm + 真实 renderer/preload
// 运行：npx electron scripts/verify-reparse.js [--out=path.png]
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const outPng = process.argv.find(a => a.startsWith('--out=') && a.length > 5)?.slice(5)
  || path.join(process.env.LOCALAPPDATA || '.', 'Temp', 'reparse.png');

const TEST_CFG = {
  extraction: { mode: 'hybrid' },
  llm: { provider: 'deepseek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', api_key: '', keys: {}, timeout: 60 },
  naming: { template: [{ t: 'field', v: 'date' }, { t: 'sep', v: '_' }, { t: 'field', v: 'invoice_no' }], output: 'inplace', conflict: 'suffix' },
  ui: { theme: 'light' },
};

// 两行的初始结果：正则解析（无 llm_used）。第 2 个文件的金额故意“错”（正则自信识别错，用户真实痛点）
const BASE_ITEMS = [
  { src: 'C:/demo/票1.pdf', filename: '票1.pdf',
    fields: { invoice_no: '26447000001546483901', date: '2026年08月08日', seller: '广州晶东贸易有限公司', amount: '458.37' },
    suggested: '2026年08月08日_26447000001546483901', status: 'ok', errors: [], llm_used: false, llm_error: null, llm_usage: null },
  { src: 'C:/demo/票2.pdf', filename: '票2.pdf',
    fields: { invoice_no: '26447000001568876321', date: '2026年08月12日', seller: '广州晶东贸易有限公司', amount: '514.38' },
    suggested: '2026年08月12日_26447000001568876321', status: 'ok', errors: [], llm_used: false, llm_error: null, llm_usage: null },
];

// 第 1 次 LLM 重识别返回：修正 票2 的金额（514.38 → 514.39）并补全字段
const LLM_FIXED_FIELDS = {
  invoice_no: '26447000001568876321', date: '2026年08月12日',
  seller: '广州晶东贸易有限公司', buyer: '广州白云山明兴制药有限公司',
  amount_excl: '455.21', tax: '59.18', amount: '514.39',
  type: '电子专用发票',
};

let llmCallCount = 0;

function registerStubs() {
  ipcMain.handle('config:get', () => JSON.parse(JSON.stringify(TEST_CFG)));
  ipcMain.handle('config:save', (_e, cfg) => cfg);
  ipcMain.handle('llm:list-models', () => ({ models: ['deepseek-chat'] }));
  ipcMain.handle('parse:files', async (_e, paths) => {
    const items = paths.map(p => BASE_ITEMS.find(b => b.src === p) || BASE_ITEMS[0]);
    return { items, summary: { total: paths.length, llm_calls: 0, tokens: { input: 0, output: 0, total: 0 } } };
  });
  ipcMain.handle('scan:dir', async () => ({ items: [], count: 0, dir: '' }));
  // 单文件 LLM 重识别：票3 失败（模拟 LLM 超时），其余成功（修正金额）
  ipcMain.handle('parse:one-llm', async (_e, src) => {
    llmCallCount++;
    await new Promise(r => setTimeout(r, 150)); // 模拟 LLM 耗时，供 loading 态断言
    if (String(src).includes('票3')) throw new Error('LLM API 超时');
    // 该文件已识别过（非票1）：fields 用修正后的完整字段
    return {
      item: {
        src, filename: path.basename(src),
        fields: { ...LLM_FIXED_FIELDS, invoice_no: String(src).includes('票1') ? '26447000001546483901' : LLM_FIXED_FIELDS.invoice_no },
        suggested: String(src).includes('票1') ? '2026年08月08日_26447000001546483901' : '2026年08月12日_26447000001568876321',
        status: 'ok', errors: [],
        llm_used: true, llm_error: null,
        llm_usage: { input: 812, output: 96, total: 908 },
      },
      usage: { input: 812, output: 96, total: 908 },
    };
  });
}

app.whenReady().then(async () => {
  registerStubs();
  const win = new BrowserWindow({
    width: 1180, height: 820, show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  const results = [];
  const R = (name, ok, extra) => results.push({ name, ok, extra });

  // ---- 阶段 1：加载 2 行数据（走真实 runParse → mergeItems → renderTable）----
  await win.webContents.executeJavaScript(`
    (async () => {
      await runParse(['C:/demo/票1.pdf', 'C:/demo/票2.pdf']);
      return items.length;
    })()
  `);

  const part1 = await win.webContents.executeJavaScript(`(() => {
    const btns = [...document.querySelectorAll('.llm-rebtn')];
    const opsCols = [...document.querySelectorAll('.row-ops')];
    const meta = document.getElementById('resultMeta').textContent;
    return {
      btnCount: btns.length,
      firstLabel: btns[0] ? btns[0].textContent.trim() : '',
      opsColCount: opsCols.length,
      rmBtnCount: document.querySelectorAll('.rm-btn').length,
      meta,
      mode: document.getElementById('mode').value,
    };
  })()`);
  R('buttons-2rows', part1.btnCount === 2, `count=${part1.btnCount}`);
  R('button-label', part1.firstLabel === '🤖 LLM 重识别', part1.firstLabel);
  R('ops-col-present', part1.opsColCount === 2 && part1.rmBtnCount === 2);
  R('meta-no-llm', part1.meta.includes('未调用 LLM'), part1.meta);
  R('mode-hybrid', part1.mode === 'hybrid');

  // ---- 阶段 2：点击第 2 行按钮 → loading 态 → 成功覆盖字段 ----
  const part2 = await win.webContents.executeJavaScript(`
    (async () => {
      const $ = id => document.getElementById(id);
      const tick = ms => new Promise(r => setTimeout(r, ms));
      const out = [];
      const R2 = (name, ok, extra) => out.push({ name, ok, extra });
      const rows = [...document.querySelectorAll('#tableBody tr')];

      // 点击第 2 行（index 1）的 LLM 重识别按钮（不 await，断言中间 loading 态）
      const btns = [...document.querySelectorAll('.llm-rebtn')];
      const p = reparseWithLlm(1, btns[1]);
      await tick(30); // stub 150ms 完成前
      R2('loading-disabled', btns[1].disabled === true, String(btns[1].disabled));
      R2('loading-label', btns[1].textContent.includes('识别中'), btns[1].textContent);
      R2('row1-btn-untouched', document.querySelectorAll('.llm-rebtn')[0].disabled === false);

      await p; // 完成
      const newRow = document.querySelectorAll('#tableBody tr')[1];
      const cell = newRow.querySelectorAll('td')[1].textContent;
      R2('amount-overridden', cell.includes('514.39'), cell);
      R2('llm-badge-shown', newRow.innerHTML.includes('🤖 LLM补全'));
      R2('badge-has-tokens', newRow.innerHTML.includes('908t'));
      R2('btn-restored', document.querySelectorAll('.llm-rebtn')[1].disabled === false);
      R2('btn-label-restored', document.querySelectorAll('.llm-rebtn')[1].textContent.includes('LLM 重识别'));
      R2('meta-llm-1', $('resultMeta').textContent.includes('LLM 1 次'));
      R2('meta-tokens', $('resultMeta').textContent.includes('908'));
      // 该行的新文件名随字段更新（模板 date_invoice_no）
      const ta = newRow.querySelector('textarea.new').value;
      R2('suggested-updated', ta.includes('2026年08月12日_26447000001568876321'), ta);

      // 手改第 1 行（index 0）的新文件名 → 重识别第 2 行 → 断言第 1 行手改不丢失（单行更新不动其他行）
      const ta0 = document.querySelectorAll('textarea.new')[0];
      ta0.value = '手动改的名字.pdf';
      await reparseWithLlm(1, document.querySelectorAll('.llm-rebtn')[1]);
      R2('row0-hand-edit-kept', document.querySelectorAll('textarea.new')[0].value === '手动改的名字.pdf',
        document.querySelectorAll('textarea.new')[0].value);
      R2('row1-still-llm', document.querySelectorAll('#tableBody tr')[1].innerHTML.includes('🤖 LLM补全'));
      R2('meta-llm-2', $('resultMeta').textContent.includes('LLM 2 次'));
      return out;
    })()
  `);
  results.push(...part2);

  // ---- 阶段 3：切换到 llm 模式 → 按钮隐藏；切回 regex → 按钮显示 ----
  const part3 = await win.webContents.executeJavaScript(`
    (async () => {
      const out = [];
      const R3 = (name, ok) => out.push({ name, ok });
      const sel = document.getElementById('mode');
      sel.value = 'llm'; onModeChange();
      R3('hidden-in-llm-mode', document.querySelectorAll('.llm-rebtn').length === 0);
      sel.value = 'regex'; onModeChange();
      R3('shown-in-regex-mode', document.querySelectorAll('.llm-rebtn').length === 2);
      sel.value = 'hybrid'; onModeChange();
      R3('shown-in-hybrid-mode', document.querySelectorAll('.llm-rebtn').length === 2);
      return out;
    })()
  `);
  results.push(...part3);

  // ---- 阶段 4：LLM 失败场景（第 3 次调用 stub 抛错）→ 原字段保留 + 行内错误 + toast ----
  const part4 = await win.webContents.executeJavaScript(`
    (async () => {
      const out = [];
      const R4 = (name, ok, extra) => out.push({ name, ok, extra });
      const rows = [...document.querySelectorAll('#tableBody tr')];
      const before = rows[1].querySelectorAll('td')[1].textContent;
      // 插入第 3 行（stub 的第 2 次调用会失败）
      mergeItems([{ src: 'C:/demo/票3.pdf', filename: '票3.pdf',
        fields: { invoice_no: '999', date: '2026年01月01日', amount: '1.00' },
        suggested: '2026年01月01日_999', status: 'ok', errors: [], llm_used: false, llm_error: null, llm_usage: null }]);
      const btns = [...document.querySelectorAll('.llm-rebtn')];
      const p = reparseWithLlm(2, btns[2]);
      await p; // stub 第 2 次调用抛错
      const row3 = document.querySelectorAll('#tableBody tr')[2];
      const cell3 = row3.querySelectorAll('td')[1].textContent;
      R4('fail-row-kept-fields', cell3.includes('999') && cell3.includes('1.00'), cell3);
      R4('fail-err-inline', row3.innerHTML.includes('LLM: LLM API 超时'), row3.innerHTML);
      R4('fail-no-invoke-wrapper', !row3.innerHTML.includes('Error invoking remote method'), row3.innerHTML);
      R4('fail-btn-restored', document.querySelectorAll('.llm-rebtn')[2].disabled === false);
      R4('fail-toast', document.getElementById('toast').textContent.includes('LLM 重识别失败：LLM API 超时'));
      return out;
    })()
  `);
  results.push(...part4);

  // ---- 截图：hybrid 模式 + 已重识别的行徽标 ----
  const shotPrep = await win.webContents.executeJavaScript(`
    (async () => {
      document.getElementById('mode').value = 'hybrid'; onModeChange();
      const tick = ms => new Promise(r => setTimeout(r, ms));
      await tick(350);
      return document.querySelectorAll('.llm-rebtn').length;
    })()
  `);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outPng, img.toPNG());
  results.push({ name: 'shot-buttons', ok: shotPrep === 3, extra: String(shotPrep) });

  let failed = 0;
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.extra !== undefined ? '  [' + r.extra + ']' : ''));
    if (!r.ok) failed++;
  }
  console.log('SCREENSHOT', outPng);
  console.log('VERIFY_DONE', failed === 0 ? 'ALL_PASS' : failed + '_FAIL');
  app.exit(failed === 0 ? 0 : 1);
});