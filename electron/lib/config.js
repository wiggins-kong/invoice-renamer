// 配置读写（JSON，数据目录可被 main 进程设置为 exe 旁 data/）
const fs = require('fs');
const path = require('path');

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

function saveConfig(cfg) {
  const merged = deepMerge(loadConfig(), cfg || {});
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = { loadConfig, saveConfig, setDataDir, getDataDir, configPath };
