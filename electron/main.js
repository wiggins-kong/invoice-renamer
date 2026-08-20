// Electron 主进程：窗口管理 + 文件系统/解析/重命名/LLM IPC
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const { parsePdf, FIELD_LABELS, KEY_FIELDS, emptyFields } = require('./lib/extractor');
const renamer = require('./lib/renamer');
const configLib = require('./lib/config');
const llm = require('./lib/llm');
const secret = require('./lib/secret');

// 数据目录：%APPDATA%\发票识别重命名（portable exe 自解压到临时目录，
// 不能用 exe 所在位置；userData 是桌面应用标准做法，持久保留）
function resolveDataDir() {
  return path.join(app.getPath('userData'), 'data');
}

function keyOf(err) {
  for (const k of Object.keys(FIELD_LABELS)) {
    if (err.includes(FIELD_LABELS[k])) return k;
  }
  return '';
}

// LLM 补全触发字段：关键字段（号码/日期/金额）+ 名称类（销售方/购买方）
// hybrid 模式缺任一触发字段时调用 LLM 补全
const LLM_TRIGGER_FIELDS = [...KEY_FIELDS, 'seller', 'buyer'];

// 明文 key 视图：仅主进程内存使用（LLM 调用），绝不下发渲染层、绝不写盘
function llmConfigWithPlainKeys() {
  const cfg = configLib.loadConfig();
  const l = cfg.llm || {};
  const keys = l.keys || {};
  const plain = {};
  for (const k of Object.keys(keys)) {
    const d = secret.decrypt(keys[k]);
    if (d !== null && d !== undefined) plain[k] = d;
  }
  const provider = l.provider || 'deepseek';
  const api_key = plain[provider] || (l.api_key && secret.decrypt(l.api_key)) || '';
  return { ...l, keys: plain, api_key };
}

// 渲染层视图：key 全部脱敏为 { masked, has }，不含任何原文
function maskConfig(cfg) {
  const out = JSON.parse(JSON.stringify(cfg));
  const l = out.llm || {};
  const keys = l.keys || {};
  const maskedKeys = {};
  for (const k of Object.keys(keys)) {
    const d = secret.decrypt(keys[k]); // 兼容旧明文配置（迁移期）
    maskedKeys[k] = d ? { masked: secret.mask(d), has: true } : { masked: '', has: false };
  }
  l.keys = maskedKeys;
  l.api_key = '';
  return out;
}

const CLEAR_MARKER = '__clear__'; // 渲染层提交该值 = 删除已保存的 key

// 旧配置迁移：llm.api_key（明文单字段）→ keys[provider]（加密）；saveConfig 会删掉遗留 api_key
function migrateLegacyKey() {
  try {
    const cfg = configLib.loadConfig();
    const l = cfg.llm || {};
    const provider = l.provider || 'deepseek';
    if (l.api_key && !(l.keys && l.keys[provider])) {
      const keys = { ...(l.keys || {}) };
      keys[provider] = secret.encrypt(l.api_key);
      configLib.saveConfig({ llm: { keys } });
      console.log('MIGRATED legacy api_key -> encrypted keys.' + provider);
    }
  } catch (e) {
    console.warn('migrateLegacyKey skipped:', e.message);
  }
}

async function parseItems(paths, cfg, onProgress) {
  const mode = (cfg.extraction && cfg.extraction.mode) || 'hybrid';
  const llmCfg = llmConfigWithPlainKeys(); // 明文 key 只在主进程内存
  const items = [];
  const total = paths.length;
  // 本次批量识别统计：LLM 调用次数 + token 用量（用户关心是否真的调用了 LLM / 花了多少）
  const summary = { total, llm_calls: 0, tokens: { input: 0, output: 0, total: 0 } };
  for (let i = 0; i < total; i++) {
    const p = paths[i];
    if (onProgress) onProgress({ phase: 'regex', done: i, total, filename: path.basename(p) });
    const res = await parsePdf(p);
    const fields = res.fields;
    let errors = res.errors.slice();
    let llm_used = false;
    let llm_error = null;
    let llm_usage = null;
    if (mode === 'llm' || (mode === 'hybrid' && LLM_TRIGGER_FIELDS.some(k => !fields[k]))) {
      if (onProgress) onProgress({ phase: 'llm', done: i, total, filename: path.basename(p) });
      try {
        const llmRes = await llm.extractWithLlm(res.rawText || '', llmCfg);
        const llmFields = llmRes.fields;
        Object.assign(fields, mode === 'llm' ? llm.replaceAll(fields, llmFields) : llm.fillMissing(fields, llmFields));
        llm_used = true;
        llm_usage = llmRes.usage || null;
        if (llm_usage) {
          summary.llm_calls++;
          summary.tokens.input += llm_usage.input || 0;
          summary.tokens.output += llm_usage.output || 0;
          summary.tokens.total += llm_usage.total || 0;
        }
        errors = errors.filter(e => !fields[keyOf(e)]);
      } catch (e) {
        llm_error = String(e.message || e);
        errors.push(`LLM 补全失败: ${llm_error}`);
      }
    }
    const missing = KEY_FIELDS.filter(k => !fields[k]);
    let status = 'ok';
    if (missing.length === KEY_FIELDS.length) status = 'failed';
    else if (missing.length) status = 'partial';
    items.push({
      src: p,
      filename: path.basename(p),
      fields,
      suggested: renamer.renderTemplate(cfg.naming.template, fields),
      status,
      errors,
      llm_used,
      llm_error,
      llm_usage,
    });
  }
  return { items, summary };
}

// 单文件强制 LLM 重识别（用户点表格行「🤖 LLM 重识别」按钮时调用）：
// 覆盖式——LLM 有值的字段一律覆盖正则结果（用户不信当前结果时才点），
// LLM 没把握的字段（返回空）保留原值；正则 errors 中已被 LLM 补上的移除
async function reparseOneWithLlm(src) {
  const cfg = configLib.loadConfig();
  const llmCfg = llmConfigWithPlainKeys();
  const res = await parsePdf(src);
  const llmRes = await llm.extractWithLlm(res.rawText || '', llmCfg);
  const fields = llm.replaceAll(res.fields, llmRes.fields);
  const errors = res.errors.slice().filter(e => !fields[keyOf(e)]);
  const missing = KEY_FIELDS.filter(k => !fields[k]);
  let status = 'ok';
  if (missing.length === KEY_FIELDS.length) status = 'failed';
  else if (missing.length) status = 'partial';
  return {
    item: {
      src,
      filename: path.basename(src),
      fields,
      suggested: renamer.renderTemplate(cfg.naming.template, fields),
      status,
      errors,
      llm_used: true,
      llm_error: null,
      llm_usage: llmRes.usage || null,
    },
    usage: llmRes.usage || null,
  };
}

// 递归收集 pdf
function collectPdfs(dir, out, depth = 0) {
  if (depth > 12) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectPdfs(full, out, depth + 1);
    else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) out.push(full);
  }
}

function createWindow() {
  const cfg = configLib.loadConfig();
  const theme = (cfg.ui && cfg.ui.theme) || 'system';
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  // Windows 11 云母材质（Mica）：窗口背景半透明磨砂随壁纸色调；
  // Win10/更低自动降级为纯色背景（backgroundColor），渲染层同源色系叠加
  const isWin11 = process.platform === 'win32' &&
    (process.getSystemVersion && Number(String(process.getSystemVersion()).split('.')[2] || 0) >= 22000);
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 1080,
    minHeight: 620,
    title: '发票识别重命名',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    frame: false, // 无边框：自绘标题栏（视觉与主题统一）
    backgroundColor: isWin11 ? '#00000000' : (dark ? '#141a26' : '#eef2f8'),
    ...(isWin11 ? { backgroundMaterial: 'mica' } : {}),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => win.webContents.send('window:maximized-changed', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized-changed', false));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return win;
}

function registerIpc() {
  // config:get 下发脱敏视图：keys → {masked, has}，渲染层拿不到明文
  ipcMain.handle('config:get', () => maskConfig(configLib.loadConfig()));

  // config:save：llm.api_key 语义 = '' 保留原 key / '__clear__' 删除 / 其他为新值（加密落盘）
  ipcMain.handle('config:save', (_e, cfg) => {
    const cur = configLib.loadConfig();
    const keys = { ...(cur.llm.keys || {}) };
    const p = cfg && cfg.llm && cfg.llm.provider;
    if (p) {
      const v = String((cfg.llm && cfg.llm.api_key) || '');
      if (v === CLEAR_MARKER) {
        delete keys[p];
      } else if (v && v !== '') {
        keys[p] = secret.encrypt(v); // 新明文 → 立即加密；加密不可用会抛错，由调用方看到
      }
      // ''/undefined → 保留原 keys[p]
    }
    const out = JSON.parse(JSON.stringify(cfg || {}));
    out.llm = { ...(out.llm || {}), provider: p, keys };
    delete out.llm.api_key; // 单一字段不再落盘（keys 为准）
    return configLib.saveConfig(out);
  });

  ipcMain.handle('pick:dir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择发票所在文件夹' });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });
  ipcMain.handle('pick:files', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: '选择发票 PDF 文件',
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }, { name: '所有文件', extensions: ['*'] }],
    });
    return r.canceled ? null : r.filePaths;
  });

  // 进度事件推送（不阻塞解析；窗口销毁后停止发送）
  const progressSender = (event) => {
    const wc = event.sender;
    return (p) => {
      try { if (!wc.isDestroyed()) wc.send('parse:progress', p); } catch (e) { /* ignore */ }
    };
  };

  ipcMain.handle('scan:dir', async (event, dir) => {
    const cfg = configLib.loadConfig();
    const pdfs = [];
    collectPdfs(dir, pdfs);
    const { items, summary } = await parseItems(pdfs, cfg, progressSender(event));
    return { items, summary, count: pdfs.length, dir };
  });

  ipcMain.handle('parse:files', async (event, paths) => {
    const cfg = configLib.loadConfig();
    return await parseItems(paths || [], cfg, progressSender(event));
  });

  // 单文件强制 LLM 重识别：正则/混合模式下用户对某行结果不放心时点按钮
  // 返回 { item, usage }；LLM 未配置/调用失败时抛错，渲染层保留原结果
  ipcMain.handle('parse:one-llm', async (_e, src) => {
    if (!src) throw new Error('缺少文件路径');
    return await reparseOneWithLlm(String(src));
  });

  ipcMain.handle('rename', (_e, items) => {
    return renamer.applyRenames(items || [], configLib.loadConfig());
  });

  ipcMain.handle('undo', () => renamer.undoLast());

  // 获取模型列表（OpenAI 兼容 /models 接口）
  ipcMain.handle('llm:list-models', async (_e, opts) => {
    const base = String((opts && opts.base_url) || '').trim().replace(/\/+$/, '');
    let key = String((opts && opts.api_key) || '');
    // 渲染层只持有草稿/掩码：未显式传新 key 时，主进程用已保存的解密 key
    if (!key && opts && opts.provider) {
      const plain = llmConfigWithPlainKeys();
      key = plain.keys[String(opts.provider)] || '';
    }
    if (!base) return { models: [], error: 'Base URL 为空' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (key) headers.Authorization = `Bearer ${key}`;
      const resp = await fetch(`${base}/models`, { headers, signal: ctrl.signal });
      if (!resp.ok) return { models: [], error: `HTTP ${resp.status}` };
      const data = await resp.json();
      const models = (data.data || []).map(m => m.id).filter(Boolean).sort();
      return { models };
    } catch (e) {
      return { models: [], error: String(e.message || e) };
    } finally {
      clearTimeout(timer);
    }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // 无边框自绘标题栏，移除默认菜单
  secret.init(safeStorage);      // API key 加密：Windows 上 = DPAPI 账户级加密
  configLib.setDataDir(resolveDataDir());
  migrateLegacyKey();            // 旧配置：api_key 单字段 → keys[provider] 加密
  registerIpc();
  if (process.argv.includes('--screenshot')) {
    // 截图模式（开发验证用）：注入演示数据 → 截图 → 退出
    const argIdx = process.argv.indexOf('--screenshot');
    const outPath = process.argv[argIdx + 1] || 'screen.png';
    const themeArg = process.argv.includes('--dark') ? 'dark' : 'light';
    const win = createWindow();
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const fontOk = await win.webContents.executeJavaScript(`
            (async () => {
              document.documentElement.dataset.theme = '${themeArg}';
              document.body.dataset.theme = '${themeArg}';
            const demoItems = [
              { src:'C:/demo/1 (1).pdf', filename:'1 (1).pdf',
                fields:{ invoice_no:'26447000002000000001', date:'2026年08月08日', seller:'广州云帆贸易有限公司', buyer:'广州明辉制药有限公司', amount_excl:'405.01', tax:'53.36', amount:'458.37', amount_cn:'肆佰伍拾捌元叁角柒分', type:'电子专用发票', seller_tax_id:'91440100MA5FAKE001', buyer_tax_id:'91440100MA5FAKE002' },
                status:'ok', errors:[], llm_used:false, llm_error:null },
              { src:'C:/demo/1 (2).pdf', filename:'1 (2).pdf',
                fields:{ invoice_no:'26447000002000000002', date:'2026年08月12日', seller:'广州云帆贸易有限公司', buyer:'广州明辉制药有限公司', amount_excl:'455.20', tax:'59.18', amount:'514.38', amount_cn:'伍佰壹拾肆元叁角捌分', type:'电子专用发票', seller_tax_id:'91440100MA5FAKE001', buyer_tax_id:'91440100MA5FAKE002' },
                status:'ok', errors:[], llm_used:false, llm_error:null },
              { src:'C:/demo/1 (3).pdf', filename:'1 (3).pdf',
                fields:{ invoice_no:'26453579152834615209', date:'2026年08月12日', seller:'广州云帆贸易有限公司', buyer:'广州明辉制药有限公司', amount_excl:'540.85', tax:'70.31', amount:'611.16', amount_cn:'陆佰壹拾壹元壹角陆分', type:'电子专用发票', seller_tax_id:'91440100MA5FAKE001', buyer_tax_id:'91440100MA5FAKE002' },
                status:'ok', errors:[], llm_used:true, llm_error:null, llm_usage:{ input:812, output:96, total:908 } },
            ];
            items = demoItems; renderTable(); renderMeta();
              await document.fonts.ready;
              return document.fonts.check('14px "Microsoft YaHei"');
            })();
          `);
          console.log('FONT_CHECK', fontOk);
          await new Promise(r => setTimeout(r, 400));
          const img = await win.webContents.capturePage();
          fs.writeFileSync(outPath, img.toPNG());
          console.log('SCREENSHOT_SAVED', outPath);
          app.exit(0);
        } catch (e) {
          console.error('SCREENSHOT_ERROR', e);
          app.exit(2);
        }
      }, 900);
    });
    return;
  }
  if (process.argv.includes('--smoke')) {
    // 冒烟自检：无窗口跑通解析管线（开发用）
    (async () => {
      try {
        const cfg = configLib.loadConfig();
        // 冒烟自检的测试发票：打包版从 resources 读（extraResources 打进包）；
        // 开发版（npx electron .）resources 无此目录，回退到项目源目录
        const resSamples = path.join(process.resourcesPath, 'samples');
        const resFixtures = path.join(process.resourcesPath, 'test-fixtures');
        const projSamples = path.join(app.getAppPath(), '..', 'samples');
        const projFixtures = path.join(app.getAppPath(), 'tests', 'fixtures');
        const base = fs.existsSync(resSamples) ? resSamples : projSamples;
        const fixtures = fs.existsSync(resFixtures) ? resFixtures : projFixtures;
        const samples = [
          path.join(base, '样例1_电子普通发票.pdf'),
          path.join(base, '样例2_电子专用发票.pdf'),
          path.join(fixtures, '26447000002000000002_2026-08-12广州云帆贸易有限公司.pdf'),
        ];
        const items = (await parseItems(samples, cfg)).items;
        for (const it of items) console.log('SMOKE', it.filename, '->', it.suggested, '|', it.status);
        const allOk = items.length >= 2 && items.every(i => i.status === 'ok');
        console.log('SMOKE_DONE', allOk ? 'ALL_OK' : 'FAIL');
        // 打包版 stdout 不可见，结果写入数据目录
        try {
          fs.mkdirSync(configLib.getDataDir(), { recursive: true });
          const out = items.map(i => `${i.filename} => ${i.suggested} | ${i.status}`).join('\n');
          fs.writeFileSync(path.join(configLib.getDataDir(), 'smoke_result.txt'), `${out}\nRESULT=${allOk ? 'ALL_OK' : 'FAIL'}\n`, 'utf8');
        } catch (e) { /* ignore */ }
        app.exit(allOk ? 0 : 1);
      } catch (e) {
        console.error('SMOKE_ERROR', e);
        app.exit(2);
      }
    })();
    return;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // 无边框窗口控制
  ipcMain.on('win:minimize', () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.minimize(); });
  ipcMain.on('win:maximize-toggle', () => {
    const w = BrowserWindow.getFocusedWindow();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
  });
  ipcMain.on('win:close', () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.close(); });
});

app.on('window-all-closed', () => app.quit());
