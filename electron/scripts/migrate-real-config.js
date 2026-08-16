// 一次性迁移：把真实 %APPDATA%\invoice-renamer 配置中的明文 key 加密落盘
// 注意：独立脚本运行时 app 名默认 "Electron"，必须 setName 才能指向真实 userData
// 运行：npx electron scripts/migrate-real-config.js
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('invoice-renamer'); // 关键：与 package.json name 一致，userData = %APPDATA%\invoice-renamer

const secret = require('../lib/secret');
const configLib = require('../lib/config');

app.whenReady().then(() => {
  const dataDir = path.join(app.getPath('userData'), 'data');
  configLib.setDataDir(dataDir);
  secret.init(safeStorage);
  console.log('TARGET_DIR', dataDir);
  try {
    const before = configLib.loadConfig();
    const beforeKey = before.llm && before.llm.keys && before.llm.keys.deepseek;
    console.log('BEFORE keys.deepseek:', beforeKey ? (secret.isEncrypted(beforeKey) ? 'enc:<密文>' : String(beforeKey).slice(0, 6) + '…明文!') : '(空)');

    // 无变更保存：触发 encryptKeys（明文→密文）+ 删除遗留 api_key 字段
    configLib.saveConfig({});
    const raw = fs.readFileSync(configLib.configPath(), 'utf8');
    const hasPlain = beforeKey && !secret.isEncrypted(beforeKey) && raw.includes(beforeKey);
    console.log('DISK_HAS_PLAINTEXT', hasPlain ? 'YES_!!' : 'no');
    console.log('DISK_HAS_API_KEY_FIELD', raw.includes('"api_key"') ? 'YES_!!' : 'no');
    console.log('DISK_HAS_ENC', raw.includes('enc:') ? 'yes' : 'no');

    const afterKey = configLib.loadConfig().llm.keys.deepseek;
    console.log('AFTER keys.deepseek:', afterKey ? (secret.isEncrypted(afterKey) ? 'enc:<密文>' : '明文!') : '(空)');
    const dec = afterKey ? secret.decrypt(afterKey) : '';
    console.log('ROUNDTRIP_MATCHES', dec && beforeKey && dec === secret.decrypt(beforeKey) ? 'yes' : 'no');
    console.log('TEMPLATE_INTACT', JSON.stringify(configLib.loadConfig().naming.template).includes('invoice_no') ? 'yes' : 'no');
  } catch (e) {
    console.log('MIGRATE_ERROR', String(e.message || e));
  }
  app.exit(0);
});
setTimeout(() => app.exit(3), 30000);