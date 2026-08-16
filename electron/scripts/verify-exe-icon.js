// 打包后验证：从 exe 提取关联图标，与设计稿对比（确认不是 Electron 默认图标）
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXE = 'C:/Users/wiggins/invoice-renamer/electron/dist/发票识别重命名.exe';
const OUT = 'C:/Users/wiggins/AppData/Local/Temp/exe-icon-check.png';
const ps = `
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${EXE}')
if ($icon) {
  $bmp = $icon.ToBitmap()
  $bmp.Save('${OUT}', [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "EXTRACTED $($bmp.Width)x$($bmp.Height)"
} else {
  Write-Output "NO_ICON"
}
`;
try {
  const out = execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { encoding: 'utf8', timeout: 60000 });
  console.log(out.trim());
  if (fs.existsSync(OUT)) {
    const sharp = require('sharp');
    const buf = await_png_check(OUT);
  }
} catch (e) {
  console.error('EXTRACT_FAIL', String(e.message || e).slice(0, 300));
}

async function await_png_check(p) {
  const sharp = require('sharp');
  const img = sharp(p);
  const meta = await img.metadata();
  console.log('提取图标尺寸:', meta.width, 'x', meta.height);
  // 检查中心像素是否为蓝色系（我们的图标是蓝底白纸，中心应该是白色纸）
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  function px(x, y) { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; }
  const cx = Math.floor(W / 2), cy = Math.floor(H_center(info.height));
  console.log('中心像素:', px(cx, cy));
  // 左上角圆角外应是透明（alpha=0）或深蓝，检测角落
  const corner = px(2, 2);
  console.log('角落像素:', corner);
  // 采样四个区域：底角（渐变蓝）vs 中心（白纸）
  console.log('底角像素:', px(Math.floor(W*0.85), Math.floor(info.height*0.85)));
  console.log('标签条区域(0.5宽,0.42高):', px(Math.floor(W*0.5), Math.floor(info.height*0.42)));
}
function H_center(h) { return Math.floor(h / 2); }
