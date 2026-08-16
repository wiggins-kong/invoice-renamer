// 配置读写（JSON，数据目录可被 main 进程设置为 exe 旁 data/）
const fs = require('fs');
const path = require('path');
const secret = require('./secret');

let dataDir = null;
function setDataDir(d) { dataDir = d; }
function getDataDir() { return dataDir || path.join(__dirname, '..'); }

function configPath() { return path.join(getDataDir(), 'config.json'); }

const DEFAULT_TEMPLATE = [
  { t: 'field', v: 'date' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'invoice_no' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'seller' }, { t: 'sep', v: '_' },
  { t: 'field', v: 'amount' },
];

const DEFAULTS = {
  extraction: { mode: 'hybrid' },
  llm: {
    provider: 'deepseek',
    base_url: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    api_key: '',
    keys: {}, // 按提供商分别保存的 API key
    timeout: 60,
  },
  naming: {
    template: DEFAULT_TEMPLATE,
    output: 'inplace',
    subfolder_by: 'month',
    conflict: 'suffix',
  },
};

function deepMerge(base, override) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(override || {})) {
    const v = override[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), raw);
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

// 写盘前把 llm.keys 各项统一转为 enc: 密文（已是密文跳过；加密失败宁可不写该项，不落明文）
function encryptKeys(cfg) {
  const l = cfg.llm || {};
  if (!l.keys) return;
  for (const k of Object.keys(l.keys)) {
    const v = l.keys[k];
    if (!v || secret.isEncrypted(v)) continue;
    try {
      l.keys[k] = secret.encrypt(v);
    } catch (e) {
      delete l.keys[k]; // 加密不可用：禁止明文落盘
    }
  }
}

function saveConfig(cfg) {
  const merged = deepMerge(loadConfig(), cfg || {});
  encryptKeys(merged);
  if (merged.llm && merged.llm.api_key) delete merged.llm.api_key; // keys 为准，遗留单字段不再落盘
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = { loadConfig, saveConfig, setDataDir, getDataDir, configPath };
