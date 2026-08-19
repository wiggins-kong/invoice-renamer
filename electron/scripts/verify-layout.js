// 布局响应式验证（开发用）：多窗口尺寸下检查命名模板行/预设/拖拽区，输出度量 + 截图
// 运行：npx electron scripts/verify-layout.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(process.env.LOCALAPPDATA || '.', 'Temp', 'layout');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const TEST_CFG = {
  extraction: { mode: 'hybrid' },
  llm: { provider: 'deepseek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', api_key: '', keys: {}, timeout: 60 },
  naming: { template: [{ t: 'field', v: 'date' }, { t: 'sep', v: '_' }, { t: 'field', v: 'invoice_no' }, { t: 'sep', v: '_' }, { t: 'field', v: 'seller' }, { t: 'sep', v: '_' }, { t: 'field', v: 'amount' }], output: 'inplace', conflict: 'suffix' },
  ui: { theme: 'light' },
};

function registerStubs() {
  ipcMain.handle('config:get', () => JSON.parse(JSON.stringify(TEST_CFG)));
  ipcMain.handle('config:save', (_e, cfg) => cfg);
  ipcMain.handle('llm:list-models', () => ({ models: ['deepseek-chat', 'deepseek-reasoner'] }));
  ipcMain.handle('pick:dir', () => null);
  ipcMain.handle('pick:files', () => null);
  ipcMain.handle('scan:dir', () => ({ items: [], count: 0 }));
  ipcMain.handle('parse:files', () => ({ items: [] }));
  ipcMain.handle('rename', () => ({ results: [] }));
  ipcMain.handle('undo', () => ({ message: 'ok', records: [] }));
}

const SIZES = [
  { w: 1180, h: 820, tag: 'default' },
  { w: 1080, h: 820, tag: 'min-width' },
];

app.whenReady().then(async () => {
  registerStubs();
  const win = new BrowserWindow({
    width: 1180, height: 820, show: true,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 400));

  // 注入演示数据（3 条发票 + 结果面板可见）
  await win.webContents.executeJavaScript(`
    (() => {
      const demoItems = [
        { src:'C:/demo/1.pdf', filename:'1.pdf', fields:{ invoice_no:'26447000002000000001', date:'2026年08月08日', seller:'广州云帆贸易有限公司', buyer:'广州明辉制药有限公司', amount_excl:'405.01', tax:'53.36', amount:'458.37', amount_cn:'肆佰伍拾捌元叁角柒分', type:'电子专用发票' }, status:'ok', errors:[], llm_used:false },
        { src:'C:/demo/2.pdf', filename:'2.pdf', fields:{ invoice_no:'26447000002000000002', date:'2026年08月12日', seller:'广州云帆贸易有限公司', amount:'514.38', type:'电子专用发票' }, status:'ok', errors:[], llm_used:false },
        { src:'C:/demo/3.pdf', filename:'3.pdf', fields:{ invoice_no:'26453579152834615209', date:'2026年08月12日', amount:'611.16' }, status:'partial', errors:[], llm_used:true },
      ];
      items = demoItems; renderTable(); renderMeta();
    })();
  `);
  await new Promise(r => setTimeout(r, 200));

  for (const s of SIZES) {
    win.setSize(s.w, s.h);
    await new Promise(r => setTimeout(r, 350));
    const m = await win.webContents.executeJavaScript(`
      (() => {
        const $ = id => document.getElementById(id);
        const rc = document.querySelector('.row-ctl').getBoundingClientRect();
        const sg = document.querySelector('.sep-group').getBoundingClientRect();
        const fs = $('fieldSel').getBoundingClientRect();
        const pr = document.querySelector('.preset-inline').getBoundingClientRect();
        const ch = document.querySelector('.card-head').getBoundingClientRect();
        const addBtn = document.querySelector('.row-ctl > .btn').getBoundingClientRect();
        const drop = $('drop').getBoundingClientRect();
        const main = document.querySelector('.main');
        const mainR = main.getBoundingClientRect();
        const rowCtl = document.querySelector('.row-ctl');
        const dropFullyVisible = drop.top >= mainR.top - 1 && drop.bottom <= mainR.bottom + 1;
        return {
          rowCtlH: Math.round(rc.height),
          sepGroupSameLineAsSel: Math.abs(sg.top - fs.top) < 8,
          sepGroupTop: Math.round(sg.top), fieldSelTop: Math.round(fs.top),
          presetSameLineAsTitle: Math.abs(pr.top - ch.top) < 12,
          presetRightOf: pr.left > ch.left + 200,
          fieldSelW: Math.round(fs.width),
          addBtnOneLine: Math.round(addBtn.height) < 40, // 按钮被压扁竖排时高度 >40
          rowOverflow: rowCtl.scrollWidth > rowCtl.clientWidth + 1,
          dropFullyVisible,
          dropTop: Math.round(drop.top), dropBottom: Math.round(drop.bottom),
          mainBottom: Math.round(mainR.bottom), mainScrollH: main.scrollHeight, mainClientH: main.clientHeight,
          mainHasVScroll: main.scrollHeight > main.clientHeight,
        };
      })();
    `);
    const img = await win.webContents.capturePage();
    const png = path.join(OUT_DIR, s.tag + '-' + s.w + 'x' + s.h + '.png');
    fs.writeFileSync(png, img.toPNG());
    console.log(JSON.stringify({ size: s.w + 'x' + s.h, ...m, png }));
  }
  app.exit(0);
});
setTimeout(() => app.exit(3), 60000);