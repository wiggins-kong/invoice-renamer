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
