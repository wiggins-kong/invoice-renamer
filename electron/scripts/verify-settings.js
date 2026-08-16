// 设置弹窗交互验证（开发用）：stub IPC + 真实 renderer/preload，跑完整交互断言
// 运行：npx electron scripts/verify-settings.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const outPng = process.argv.find(a => a.startsWith('--out=') && a.length > 5)?.slice(5)
  || path.join(process.env.LOCALAPPDATA || '.', 'Temp', 'settings-modal.png');

let lastSaved = null;

const TEST_CFG = {
  extraction: { mode: 'hybrid' },
  llm: {
    provider: 'deepseek',
    base_url: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    api_key: 'sk-d',
    keys: { deepseek: 'sk-d', opencode: 'sk-o' },
    timeout: 60,
  },
  naming: {
    template: [
      { t: 'field', v: 'date' }, { t: 'sep', v: '_' },
      { t: 'field', v: 'invoice_no' }, { t: 'sep', v: '_' },
      { t: 'field', v: 'seller' }, { t: 'sep', v: '_' },
      { t: 'field', v: 'amount' },
    ],
    output: 'inplace',
    conflict: 'suffix',
  },
  ui: { theme: 'light' },
};

function registerStubs() {
  ipcMain.handle('config:get', () => JSON.parse(JSON.stringify(TEST_CFG)));
  ipcMain.handle('config:save', (_e, cfg) => { lastSaved = cfg; return cfg; });
  ipcMain.handle('llm:list-models', () => ({ models: ['deepseek-chat', 'deepseek-reasoner'] }));
}

app.whenReady().then(async () => {
  registerStubs();
  const win = new BrowserWindow({
    width: 1180, height: 820, show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.show(); // 截图需要真实可见窗口（隐藏窗口下 backdrop-filter 合成层可能不渲染）

  const results = [];
  const R = (name, ok, extra) => { results.push({ name, ok, extra }); };

  // ---- 第一段：打开 / 切换提供商 / 取消恢复 ----
  const part1 = await win.webContents.executeJavaScript(`
    (async () => {
      const $ = id => document.getElementById(id);
      const tick = ms => new Promise(r => setTimeout(r, ms));
      const out = [];
      const R1 = (name, ok) => out.push({ name, ok });

      const entry = $('settingsEntryBtn');
      R1('entry-visible', !!entry && entry.style.display !== 'none');

      openSettings();
      await tick(50);
      R1('modal-opens', $('settingsModal').style.display === 'flex');
      R1('provider-deepseek', $('llmProvider').value === 'deepseek');
      R1('base-deepseek', $('llmBase').value === 'https://api.deepseek.com/v1');
      R1('key-deepseek', $('llmKey').value === 'sk-d');
      R1('sec-title', !!document.querySelector('.modal-sec-title') && document.querySelector('.modal-sec-title').textContent.includes('LLM'));

      $('llmProvider').value = 'opencode';
      onProviderChange();
      await tick(50);
      R1('switch-base-opencode', $('llmBase').value === 'https://opencode.ai/zen/go/v1');
      R1('switch-key-opencode', $('llmKey').value === 'sk-o');

      closeSettings(true);
      await tick(30);
      R1('cancel-closes', $('settingsModal').style.display === 'none');
      R1('cancel-restore-provider', $('llmProvider').value === 'deepseek');
      R1('cancel-restore-key', $('llmKey').value === 'sk-d');
      R1('cancel-restore-base', $('llmBase').value === 'https://api.deepseek.com/v1');

      // 保存路径：改 key + 模型 → 保存
      openSettings();
      await tick(50);
      $('llmKey').value = 'sk-new';
      $('llmModel').value = 'deepseek-reasoner';
      await saveSettings();
      await tick(120);
      R1('save-closes', $('settingsModal').style.display === 'none');
      return out;
    })();
  `);
  results.push(...part1);

  // ---- 保存断言（主进程读 lastSaved）----
  const saved = lastSaved && lastSaved.llm;
  R('save-payload', !!(saved && saved.api_key === 'sk-new' && saved.keys.deepseek === 'sk-new' && saved.model === 'deepseek-reasoner'),
    saved ? saved.model : 'no-save');

  // ---- 第二段：Esc 关闭 / regex 隐藏 / 重新打开供截图 ----
  const part2 = await win.webContents.executeJavaScript(`
    (async () => {
      const $ = id => document.getElementById(id);
      const tick = ms => new Promise(r => setTimeout(r, ms));
      const out = [];

      openSettings();
      await tick(40);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await tick(30);
      out.push({ name: 'esc-closes', ok: $('settingsModal').style.display === 'none' });

      $('mode').value = 'regex';
      onModeChange();
      await tick(20);
      out.push({ name: 'regex-hides-entry', ok: $('settingsEntryBtn').style.display === 'none' });

      $('mode').value = 'hybrid';
      onModeChange();
      // 截图模式：禁用遮罩模糊与入场动画，保证合成层完整渲染
      const st = document.createElement('style');
      st.textContent = '.modal-overlay{backdrop-filter:none !important}.modal-overlay,.modal{animation:none !important}';
      document.head.appendChild(st);
      openSettings();
      await tick(250);
      out.push({ name: 'reopen-for-shot', ok: $('settingsModal').style.display === 'flex' });
      return out;
    })();
  `);
  results.push(...part2);

  // 截图（弹窗已打开）
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outPng, img.toPNG());

  let failed = 0;
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.extra !== undefined ? '  [' + r.extra + ']' : ''));
    if (!r.ok) failed++;
  }
  console.log('SCREENSHOT', outPng);
  console.log('VERIFY_DONE', failed === 0 ? 'ALL_PASS' : failed + '_FAIL');
  app.exit(failed === 0 ? 0 : 1);
});
