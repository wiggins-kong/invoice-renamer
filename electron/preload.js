// preload：通过 contextBridge 暴露安全 API；webUtils 用于获取拖拽文件的绝对路径
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('invoiceAPI', {
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (e) {
      return '';
    }
  },
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  pickDir: () => ipcRenderer.invoke('pick:dir'),
  pickFiles: () => ipcRenderer.invoke('pick:files'),
  scanDir: (dir) => ipcRenderer.invoke('scan:dir', dir),
  parseFiles: (paths) => ipcRenderer.invoke('parse:files', paths),
  reparseWithLlm: async (src) => {
    try {
      return await ipcRenderer.invoke('parse:one-llm', src);
    } catch (e) {
      // 去掉 Electron invoke 包装和 Error: 前缀，只留真实错误（如 'LLM API 超时'）
      throw new Error(String(e.message || e).replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, ''));
    }
  },
  onParseProgress: (cb) => ipcRenderer.on('parse:progress', (_e, p) => cb(p)),
  rename: (items) => ipcRenderer.invoke('rename', items),
  undo: () => ipcRenderer.invoke('undo'),
  listModels: (opts) => ipcRenderer.invoke('llm:list-models', opts),
  windowControls: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximizeToggle: () => ipcRenderer.send('win:maximize-toggle'),
    close: () => ipcRenderer.send('win:close'),
    onMaximizedChange: (cb) => ipcRenderer.on('window:maximized-changed', (_e, v) => cb(v)),
  },
});
