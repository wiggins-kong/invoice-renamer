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

async function parseItems(paths, cfg) {
  const mode = (cfg.extraction && cfg.extraction.mode) || 'hybrid';
  const llmCfg = llmConfigWithPlainKeys(); // 明文 key 只在主进程内存
  const items = [];
  for (const p of paths) {
    const res = await parsePdf(p);
    const fields = res.fields;
    let errors = res.errors.slice();
    let llm_used = false;
    let llm_error = null;
    if (mode === 'llm' || (mode === 'hybrid' && LLM_TRIGGER_FIELDS.some(k => !fields[k]))) {
      try {
        const llmFields = await llm.extractWithLlm(res.rawText || '', llmCfg);
        Object.assign(fields, mode === 'llm' ? llm.replaceAll(fields, llmFields) : llm.fillMissing(fields, llmFields));
        llm_used = true;
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
    });
  }
  return items;
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
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    title: '发票识别重命名',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    frame: false, // 无边框：自绘标题栏（视觉与主题统一）
    backgroundColor: dark ? '#0f1420' : '#f2f5fa',
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

  ipcMain.handle('scan:dir', async (_e, dir) => {
    const cfg = configLib.loadConfig();
    const pdfs = [];
    collectPdfs(dir, pdfs);
    return { items: await parseItems(pdfs, cfg), count: pdfs.length, dir };
  });

  ipcMain.handle('parse:files', async (_e, paths) => {
    const cfg = configLib.loadConfig();
    return { items: await parseItems(paths || [], cfg) };
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
                fields:{ invoice_no:'26447000001546483901', date:'2026年08月08日', seller:'广州晶东贸易有限公司', buyer:'广州白云山明兴制药有限公司', amount_excl:'405.01', tax:'53.36', amount:'458.37', amount_cn:'肆佰伍拾捌元叁角柒分', type:'电子专用发票', seller_tax_id:'91440101664041243T', buyer_tax_id:'9144010119046020XE' },
                status:'ok', errors:[], llm_used:false, llm_error:null },
              { src:'C:/demo/1 (2).pdf', filename:'1 (2).pdf',
                fields:{ invoice_no:'26447000001568876321', date:'2026年08月12日', seller:'广州晶东贸易有限公司', buyer:'广州白云山明兴制药有限公司', amount_excl:'455.20', tax:'59.18', amount:'514.38', amount_cn:'伍佰壹拾肆元叁角捌分', type:'电子专用发票', seller_tax_id:'91440101664041243T', buyer_tax_id:'9144010119046020XE' },
                status:'ok', errors:[], llm_used:false, llm_error:null },
              { src:'C:/demo/1 (3).pdf', filename:'1 (3).pdf',
                fields:{ invoice_no:'26447000001569602479', date:'2026年08月12日', seller:'广州晶东贸易有限公司', buyer:'广州白云山明兴制药有限公司', amount_excl:'540.85', tax:'70.31', amount:'611.16', amount_cn:'陆佰壹拾壹元壹角陆分', type:'电子专用发票', seller_tax_id:'91440101664041243T', buyer_tax_id:'9144010119046020XE' },
                status:'ok', errors:[], llm_used:false, llm_error:null },
            ];
            items = demoItems; renderTable(); renderMeta();
              await document.fonts.ready;
              return document.fonts.check('14px MsyhSb');
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
        const base = 'C:/Users/wiggins/invoice-renamer/samples/';
        const samples = [
          base + '样例1_电子普通发票.pdf',
          base + '样例2_电子专用发票.pdf',
          'C:/Users/wiggins/invoice-renamer/electron/tests/fixtures/26447000001568876321_2026-08-12广州晶东贸易有限公司.pdf',
        ];
        const items = await parseItems(samples, cfg);
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
