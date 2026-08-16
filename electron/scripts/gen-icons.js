// 生成图标全尺寸 PNG + ICO（ICO 内嵌 PNG，Vista+ 兼容，手写容器零依赖）
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const MASTER = path.join(__dirname, '..', 'build', 'icon-master.svg');
const OUT = path.join(__dirname, '..', 'build');

const SIZES = [16, 24, 32, 48, 64, 128, 256];

// ICO 格式：ICONDIR + ICONDIRENTRY[] + PNG 数据（PNG 内嵌，256 尺寸用 0 表示）
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);          // reserved
  header.writeUInt16LE(1, 2);          // type: icon
  header.writeUInt16LE(pngs.length, 4);// count
  const entries = [];
  const datas = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);  // width
    e.writeUInt8(size >= 256 ? 0 : size, 1);  // height
    e.writeUInt8(0, 2);                       // palette
    e.writeUInt8(0, 3);                       // reserved
    e.writeUInt16LE(1, 4);                    // planes
    e.writeUInt16LE(32, 6);                   // bpp
    e.writeUInt32LE(data.length, 8);          // bytes
    e.writeUInt32LE(offset, 12);              // offset
    entries.push(e);
    datas.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

(async () => {
  const master = fs.readFileSync(MASTER);
  const pngs = [];
  for (const s of SIZES) {
    const p = path.join(OUT, `icon-${s}.png`);
    await sharp(master).resize(s, s).png().toFile(p);
    pngs.push({ size: s, data: fs.readFileSync(p) });
    console.log('PNG', s, 'ok');
  }
  // 512 源图（AppImage/大图/文档用）
  await sharp(master).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
  fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(pngs));
  console.log('ICO ok', fs.statSync(path.join(OUT, 'icon.ico')).size, 'bytes');
  // 验证 ICO 可解析
  const ico = fs.readFileSync(path.join(OUT, 'icon.ico'));
  console.log('ICO header: count =', ico.readUInt16LE(4));
})();
