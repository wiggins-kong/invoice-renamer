// API key 加密（Electron safeStorage；Windows 上底层为 DPAPI，当前 Windows 账户级加密）
// 值格式：enc:<base64>（沿用 Web 版 crypto_util 的 enc: 前缀约定）
// 设计边界：明文只允许出现在主进程内存；磁盘只落 enc: 密文；渲染层只给掩码。
const PREFIX = 'enc:';

let storage = null; // Electron safeStorage 注入（纯 node 单测可控）
function init(safeStorage) { storage = safeStorage; }

function isAvailable() {
  return !!(storage && typeof storage.isEncryptionAvailable === 'function'
    && storage.isEncryptionAvailable());
}

function isEncrypted(v) {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

// 加密明文；已是密文或空值原样返回；加密不可用时抛错（宁可失败也不落明文）
function encrypt(plain) {
  if (!plain) return plain;
  if (isEncrypted(plain)) return plain;
  if (!isAvailable()) throw new Error('系统加密不可用（safeStorage）');
  return PREFIX + storage.encryptString(String(plain)).toString('base64');
}

// 解密；明文原样返回（旧配置迁移期）；密文解不开（换电脑/账户/损坏）返回 null
function decrypt(value) {
  if (!value) return '';
  if (!isEncrypted(value)) return String(value);
  if (!isAvailable()) return null;
  try {
    return storage.decryptString(Buffer.from(value.slice(PREFIX.length), 'base64'));
  } catch (e) {
    return null;
  }
}

// 脱敏：保留前 3 后 4（短值全掩），用于渲染层展示
function mask(value) {
  const s = String(value || '');
  if (s.length <= 8) return '*'.repeat(s.length);
  return s.slice(0, 3) + '*'.repeat(Math.min(s.length - 7, 12)) + s.slice(-4);
}

module.exports = { init, isAvailable, isEncrypted, encrypt, decrypt, mask, PREFIX };