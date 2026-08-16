// API key 加密落盘验证（开发用）：真实 safeStorage + 临时数据目录，断言磁盘无明文
// 运行：npx electron scripts/verify-secret.js
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const secret = require('../lib/secret');
const configLib = require('../lib/config');

app.whenReady().then(() => {
  const results = [];
  const R = (name, ok, extra) => { results.push({ name, ok, extra }); };

  // 临时数据目录（不碰真实 %APPDATA% 配置）
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-verify-'));
  configLib.setDataDir(tmpDir);
  secret.init(safeStorage);

  try {
    // 1. 基础往返 + 判定
    R('isEncrypted-prefix', secret.isEncrypted('enc:abc') === true && secret.isEncrypted('plain') === false);
    const enc = secret.encrypt('sk-supersecret-123456');
    R('encrypt-adds-prefix', secret.isEncrypted(enc));
    R('decrypt-roundtrip', secret.decrypt(enc) === 'sk-supersecret-123456');
    R('decrypt-plain-passthrough', secret.decrypt('sk-raw') === 'sk-raw'); // 迁移期明文兜底
    R('decrypt-empty', secret.decrypt('') === '');
    R('mask-format', secret.mask('sk-abcdef1234567890') === 'sk-' + '*'.repeat(12) + '7890');

    // 2. 保存含明文 key 的配置 → 磁盘必须无明文、值为 enc:
    const saved = configLib.saveConfig({ llm: { keys: { deepseek: 'sk-plain-lives-here-999' } } });
    const raw = fs.readFileSync(configLib.configPath(), 'utf8');
    R('disk-no-plaintext', !raw.includes('sk-plain-lives-here-999'), raw);
    R('disk-has-enc', raw.includes('enc:'));
    R('saved-value-encrypted', secret.isEncrypted(saved.llm.keys.deepseek));

    // 3. 重新加载（模拟重启）→ 解密一致
    const loaded = configLib.loadConfig();
    R('load-decrypts', secret.decrypt(loaded.llm.keys.deepseek) === 'sk-plain-lives-here-999');

    // 4. 未加密字段不被误处理（模板等普通配置原样保存）
    const tpl = configLib.saveConfig({ naming: { template: [{ t: 'field', v: 'date' }] } });
    R('template-intact', JSON.stringify(tpl.naming.template) === JSON.stringify([{ t: 'field', v: 'date' }]));

    // 5. 密文损坏 → decrypt 返回 null（换电脑/账户场景）
    const corrupt = 'enc:' + Buffer.from('garbage-bytes').toString('base64');
    R('corrupt-decrypts-null', secret.decrypt(corrupt) === null);

    // 6. 遗留 api_key 单字段在保存时被移除，明文不再落盘
    const legacy = configLib.saveConfig({ llm: { api_key: 'sk-legacy-should-vanish' } });
    const raw2 = fs.readFileSync(configLib.configPath(), 'utf8');
    R('legacy-field-removed', !raw2.includes('sk-legacy-should-vanish') && !raw2.includes('"api_key"'));

    // 7. 无 key 时一切正常（空 keys 不炸）
    configLib.saveConfig({ llm: { keys: {} } });
    R('empty-keys-ok', configLib.loadConfig().llm.keys !== undefined);
  } catch (e) {
    console.error('VERIFY_ERROR', e);
    app.exit(2);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  let failed = 0;
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.extra !== undefined ? '  [' + r.extra + ']' : ''));
    if (!r.ok) failed++;
  }
  console.log('SECRET_DONE', failed === 0 ? 'ALL_PASS' : failed + '_FAIL');
  app.exit(failed === 0 ? 0 : 1);
});