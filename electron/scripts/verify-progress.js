// 识别进度条交互验证（开发用）：stub IPC 模拟主进程逐文件推送进度 + 真实 renderer/preload
// 运行：npx electron scripts/verify-progress.js [--out=path.png]
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const outPng = process.argv.find(a => a.startsWith('--out=') && a.length > 5)?.slice(5)
  || path.join(process.env.LOCALAPPDATA || '.', 'Temp', 'parse-progress.png');

const TEST_CFG = {
  extraction: { mode: 'hybrid' },
  llm: { provider: 'deepseek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', api_key: '', keys: {}, timeout: 60 },
  naming: { template: [{ t: 'field', v: 'date' }, { t: 'sep', v: '_' }, { t: 'field', v: 'invoice_no' }], output: 'inplace', conflict: 'suffix' },
  ui: { theme: 'light' },
};

// 模拟主进程 parseItems 的进度推送：3 个文件，第 1 个走 regex、第 2 个走 LLM、第 3 个 regex
function registerStubs() {
  ipcMain.handle('config:get', () => JSON.parse(JSON.stringify(TEST_CFG)));
  ipcMain.handle('config:save', (_e, cfg) => cfg);
  ipcMain.handle('llm:list-models', () => ({ models: ['deepseek-chat'] }));
  ipcMain.handle('parse:files', async (event, paths) => {
    const total = paths.length;
    for (let i = 0; i < total; i++) {
      event.sender.send('parse:progress', { phase: 'regex', done: i, total, filename: path.basename(paths[i]) });
      await new Promise(r => setTimeout(r, 120));
      if (i === 1) { // 第 2 个文件触发 LLM 补全（间隔拉宽，断言窗口无竞态）
        event.sender.send('parse:progress', { phase: 'llm', done: i, total, filename: path.basename(paths[i]) });
        await new Promise(r => setTimeout(r, 120));
      }
    }
    const items = paths.map((_, i) => ({
      src: paths[i], filename: path.basename(paths[i]),
      fields: { invoice_no: '2644' + (1000000000000000 + i), date: '2026年08月1' + i + '日' },
      suggested: '2026年08月1' + i + '日_2644' + (1000000000000000 + i),
      status: 'ok', errors: [], llm_used: i === 1, llm_error: null,
      llm_usage: i === 1 ? { input: 812, output: 96, total: 908 } : null,
    }));
    return {
      items,
      summary: { total, llm_calls: 1, tokens: { input: 812, output: 96, total: 908 } },
    };
  });
  // 空文件列表不报错
  ipcMain.handle('scan:dir', async () => ({ items: [], count: 0, dir: '' }));
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

  // 等 MsyhSb 字体就绪:16MB 全局字体启动期加载会占主线程,若不等就绪,
  // 后面的 90/190/310/450ms 时序断言会因 reflow 错过窗口(偶发 11-12 FAIL)
  await win.webContents.executeJavaScript(`document.fonts.ready.then(() => new Promise(r => {
    // 再给一帧让字体 reflow 完成,避免立即测量到旧布局
    requestAnimationFrame(() => requestAnimationFrame(r));
  }))`);

  const results = [];
  const R = (name, ok, extra) => results.push({ name, ok, extra });

  // ---- 第一阶段：调用前进度条隐藏 ----
  const part1 = await win.webContents.executeJavaScript(`(() => {
    const box = document.getElementById('parseProgress');
    return { hidden: box.style.display === 'none' || getComputedStyle(box).display === 'none' };
  })()`);
  R('initial-hidden', part1.hidden);

  // ---- 第二阶段：触发解析（不 await，边跑边断言中间状态）----
  const p = win.webContents.executeJavaScript(`
    (async () => {
      const $ = id => document.getElementById(id);
      const tick = ms => new Promise(r => setTimeout(r, ms));
      const out = [];
      const R2 = (name, ok) => out.push({ name, ok });

      const pRun = runParse(['C:/demo/票1.pdf', 'C:/demo/票2.pdf', 'C:/demo/票3.pdf']);
      await tick(90);   // 事件时间线(120ms/步): t0=regex(0) t120=regex(1) t240=llm(1) t360=regex(2)

      R2('visible-during-parse', $('parseProgress').style.display === 'block');
      R2('bar-advanced', parseFloat($('ppBar').style.width) > 0);
      R2('count-1of3', $('ppCount').textContent.replace(/\\s/g, '') === '1/3');
      R2('stage-regex', $('ppText').textContent.includes('本地解析'));
      R2('filename-1', $('ppText').textContent.includes('票1.pdf'));

      await tick(100);  // t≈190：regex(1) 已到，LLM(1) 未到
      R2('count-2of3', $('ppCount').textContent.replace(/\\s/g, '') === '2/3');
      R2('filename-2', $('ppText').textContent.includes('票2.pdf'));
      R2('stage-regex-2', $('ppText').textContent.includes('本地解析'));

      await tick(120);  // t≈310：llm(1) 已到，regex(2) 未到
      R2('count-2of3-llm', $('ppCount').textContent.replace(/\\s/g, '') === '2/3');
      R2('stage-llm', $('ppText').textContent.includes('LLM 补全'));
      R2('llm-badge', !!document.querySelector('.pp-stage.llm'));

      await tick(140);  // t≈450：regex(2) 已到
      R2('count-3of3', $('ppCount').textContent.replace(/\\s/g, '') === '3/3');
      R2('filename-3', $('ppText').textContent.includes('票3.pdf'));
      R2('stage-regex-3', $('ppText').textContent.includes('本地解析'));

      await pRun;       // 解析完成
      R2('done-shown', $('ppText').textContent.includes('识别完成'));
      R2('done-count', $('ppText').textContent.includes('3'));
      R2('done-bar-full', parseFloat($('ppBar').style.width) >= 100);
      R2('done-green', $('ppBar').classList.contains('done'));
      // LLM 汇总：调用次数 + tokens（本次核心需求——明确是否调用 LLM / 花了多少）
      R2('summary-llm-calls', $('ppText').textContent.includes('调用 LLM 1 次'));
      R2('summary-tokens', $('ppText').textContent.includes('908 tokens'));
      R2('summary-tokens-detail', $('ppText').textContent.includes('812 入 / 96 出'));
      R2('meta-llm', $('resultMeta').textContent.includes('LLM 1 次'));
      R2('meta-tokens', $('resultMeta').textContent.includes('908'));
      // 行内徽标带 token 数
      R2('row-badge-tokens', !!document.querySelector('.fchip[title*="908"]') && document.querySelector('.fchip[title*="908"]').textContent.includes('908t'));
      return out;
    })();
  `);

  // 页面里截图由主进程补拍（完整合成层）
  const part2 = await p;

  // 截图前强制置为完成态并等待渲染，确保截图能看到「识别完成 + LLM 汇总」文案
  const shotPrep = await win.webContents.executeJavaScript(`
    (async () => {
      const $ = id => document.getElementById(id);
      const tick = ms => new Promise(r => setTimeout(r, ms));
      showProgress();
      $('ppBar').style.width = '100%';
      finishParseProgress(3, { total: 3, llm_calls: 1, tokens: { input: 812, output: 96, total: 908 } });
      await tick(350); // 等完成态文案渲染稳定
      return $('ppText').textContent;
    })();
  `);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outPng, img.toPNG());
  results.push({ name: 'shot-prep-msg', ok: shotPrep.includes('识别完成') && shotPrep.includes('908'), extra: shotPrep });
  results.push(...part2);

  // ---- 第三阶段：未调用 LLM 的批次（纯本地正则）----
  const part3 = await win.webContents.executeJavaScript(`
    (async () => {
      const $ = id => document.getElementById(id);
      const out = [];
      const R3 = (name, ok) => out.push({ name, ok });
      showProgress();
      $('ppBar').style.width = '100%';
      finishParseProgress(2, { total: 2, llm_calls: 0, tokens: { input: 0, output: 0, total: 0 } });
      R3('no-llm-msg', $('ppText').textContent.includes('全部本地正则，未调用 LLM'));
      lastSummary = { total: 2, llm_calls: 0, tokens: { input: 0, output: 0, total: 0 } };
      mergeItems([
        { src: 'C:/a/1.pdf', filename: '1.pdf', fields: { invoice_no: 'A' }, suggested: 'A', status: 'ok', errors: [], llm_used: false, llm_error: null, llm_usage: null },
      ]);
      R3('no-llm-meta', $('resultMeta').textContent.includes('未调用 LLM'));
      R3('no-llm-bar-not-animated', !$('ppBar').classList.contains('llm'));
      return out;
    })();
  `);
  results.push(...part3);

  // ---- 第四阶段：延迟隐藏（完成提示 5s 后进度条自动收起）----
  await new Promise(r => setTimeout(r, 5200));
  const part4 = await win.webContents.executeJavaScript(`(() => {
    const box = document.getElementById('parseProgress');
    return { hidden: box.style.display === 'none' };
  })()`);
  R('auto-hide-after-done', part4.hidden);

  let failed = 0;
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.extra !== undefined ? '  [' + r.extra + ']' : ''));
    if (!r.ok) failed++;
  }
  console.log('SCREENSHOT', outPng);
  console.log('VERIFY_DONE', failed === 0 ? 'ALL_PASS' : failed + '_FAIL');
  app.exit(failed === 0 ? 0 : 1);
});