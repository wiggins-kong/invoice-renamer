// 命名模板渲染 + 批量重命名/移动 + 冲突处理 + 撤销日志（JS 版，与 Python renamer.py 一致）
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./config');

function undoLogPath() {
  return path.join(getDataDir(), 'undo_log.json');
}

function sanitize(name) {
  let s = String(name).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
  s = s.replace(/\s+/g, ' ').trim();
  return s.replace(/^[ .]+|[ .]+$/g, '');
}

function renderTemplate(template, fields) {
  const tokens = [];
  let pendingSep = null;
  for (const seg of template || []) {
    const t = seg.t;
    const v = String(seg.v || '').trim();
    if (t === 'field') {
      const val = String(fields[v] || '').trim();
      if (val) {
        if (pendingSep !== null && tokens.length) tokens.push(pendingSep);
        pendingSep = null;
        tokens.push(val);
      }
    } else {
      pendingSep = v;
    }
  }
  return sanitize(tokens.join(''));
}

function subfolderName(fields, cfg) {
  const by = (cfg.naming && cfg.naming.subfolder_by) || 'month';
  if (by === 'seller') return sanitize(fields.seller) || '未识别销售方';
  const d = fields.date || '';
  return d.length >= 7 ? d.slice(0, 7) : '未识别日期';
}

function buildTarget(src, newStem, fields, cfg) {
  const srcP = path.parse(src);
  const stem = sanitize(newStem) || srcP.name;
  const ext = srcP.ext || '.pdf';
  const naming = (cfg && cfg.naming) || {};
  let targetDir = srcP.dir;
  if (naming.output === 'subfolder') {
    targetDir = path.join(srcP.dir, subfolderName(fields, cfg));
  }
  fs.mkdirSync(targetDir, { recursive: true });
  let candidate = path.join(targetDir, stem + ext);
  let n = 1;
  while (fs.existsSync(candidate) && path.resolve(candidate) !== path.resolve(src)) {
    candidate = path.join(targetDir, `${stem}_${n}${ext}`);
    n++;
  }
  return candidate;
}

function loadUndo() {
  try { return JSON.parse(fs.readFileSync(undoLogPath(), 'utf8')); } catch (e) { return []; }
}
function saveUndo(batches) {
  fs.mkdirSync(path.dirname(undoLogPath()), { recursive: true });
  fs.writeFileSync(undoLogPath(), JSON.stringify(batches, null, 2), 'utf8');
}

function applyRenames(items, cfg) {
  const results = [];
  const records = [];
  for (const item of items || []) {
    const src = item.src || '';
    const rec = { src, ok: false, message: '' };
    if (!src || !fs.existsSync(src)) {
      rec.message = '文件不存在';
      results.push(rec);
      continue;
    }
    let target;
    try {
      target = buildTarget(src, item.new_name || '', item.fields || {}, cfg);
    } catch (e) {
      rec.message = `目标路径计算失败: ${e.message}`;
      results.push(rec);
      continue;
    }
    if (path.resolve(target) === path.resolve(src)) {
      rec.ok = true;
      rec.message = '无需重命名（已符合）';
      results.push(rec);
      continue;
    }
    try {
      fs.renameSync(src, target);
      rec.ok = true;
      rec.message = `已重命名 → ${path.basename(target)}`;
      rec.new_path = target;
      records.push({ old: src, new: target });
    } catch (e) {
      rec.message = `重命名失败: ${e.message}`;
    }
    results.push(rec);
  }
  if (records.length) {
    const batches = loadUndo();
    batches.push({ ts: new Date().toISOString().slice(0, 19), items: records });
    saveUndo(batches);
  }
  return { results, renamed_count: records.length };
}

function undoLast() {
  const batches = loadUndo();
  if (!batches.length) return { ok: false, message: '没有可撤销的操作' };
  const batch = batches.pop();
  let undone = 0;
  const failed = [];
  for (const rec of [...batch.items].reverse()) {
    try {
      if (fs.existsSync(rec.new) && !fs.existsSync(rec.old)) {
        fs.renameSync(rec.new, rec.old);
        undone++;
      } else if (fs.existsSync(rec.old)) {
        failed.push(`${path.basename(rec.new)}: 原文件已存在，跳过`);
      } else {
        failed.push(`${path.basename(rec.new)}: 文件不存在，跳过`);
      }
    } catch (e) {
      failed.push(`${path.basename(rec.new)}: ${e.message}`);
    }
  }
  saveUndo(batches);
  return {
    ok: true,
    message: `已撤销 ${undone} 个文件` + (failed.length ? `，${failed.length} 个失败` : ''),
    undone,
    failed,
    records: batch.items,
  };
}

module.exports = { sanitize, renderTemplate, buildTarget, applyRenames, undoLast };
