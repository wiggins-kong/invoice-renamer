"""命名模板渲染 + 批量重命名/移动 + 冲突处理 + 撤销日志。"""
import json
import re
from datetime import datetime
from pathlib import Path

from paths import data_dir

BASE_DIR = data_dir()
UNDO_LOG = BASE_DIR / "undo_log.json"

INVALID_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def sanitize(name: str) -> str:
    """清理 Windows 非法字符。"""
    name = INVALID_CHARS.sub("_", name)
    name = re.sub(r"\s+", " ", name).strip()
    name = name.strip(" .")
    return name


def render_template(template: list, fields: dict) -> str:
    """按段列表渲染文件名主体（不含扩展名）。
    缺失字段自动跳过；连续分隔符折叠为一个；首尾分隔符去除。
    """
    tokens = []
    pending_sep = None
    for seg in template or []:
        t = seg.get("t")
        v = (seg.get("v") or "").strip()
        if t == "field":
            val = (fields.get(v) or "").strip()
            if val:
                if pending_sep is not None and tokens:
                    tokens.append(pending_sep)
                pending_sep = None
                tokens.append(val)
        else:
            pending_sep = v
    return sanitize("".join(tokens))


def _subfolder_name(fields: dict, cfg: dict) -> str:
    by = cfg.get("naming", {}).get("subfolder_by", "month")
    if by == "seller":
        return sanitize(fields.get("seller") or "未识别销售方") or "未识别销售方"
    d = fields.get("date") or ""
    return d[:7] if len(d) >= 7 else "未识别日期"


def build_target(src: str, new_stem: str, fields: dict, cfg: dict) -> Path:
    """计算目标路径（原地或子文件夹，冲突自动加 _1/_2 后缀）。"""
    src_p = Path(src)
    stem = sanitize(new_stem) or src_p.stem
    ext = src_p.suffix or ".pdf"
    naming = cfg.get("naming", {})
    if naming.get("output") == "subfolder":
        target_dir = src_p.parent / _subfolder_name(fields, cfg)
    else:
        target_dir = src_p.parent
    target_dir.mkdir(parents=True, exist_ok=True)

    candidate = target_dir / f"{stem}{ext}"
    n = 1
    while candidate.exists() and candidate.resolve() != src_p.resolve():
        candidate = target_dir / f"{stem}_{n}{ext}"
        n += 1
    return candidate


def apply_renames(items: list, cfg: dict) -> dict:
    """执行批量重命名。items: [{src, new_name, fields}]。
    返回 {results: [...], batch_index} 并写入撤销日志。
    """
    results = []
    records = []
    for item in items:
        src = item.get("src", "")
        src_p = Path(src)
        rec = {"src": src, "ok": False, "message": ""}
        if not src_p.exists():
            rec["message"] = "文件不存在"
            results.append(rec)
            continue
        try:
            target = build_target(src, item.get("new_name", ""), item.get("fields", {}), cfg)
        except Exception as e:
            rec["message"] = f"目标路径计算失败: {e}"
            results.append(rec)
            continue
        if target.resolve() == src_p.resolve():
            rec["ok"] = True
            rec["message"] = "无需重命名（已符合）"
            results.append(rec)
            continue
        try:
            src_p.rename(target)
            rec["ok"] = True
            rec["message"] = f"已重命名 → {target.name}"
            rec["new_path"] = str(target)
            records.append({"old": str(src_p), "new": str(target)})
        except Exception as e:
            rec["message"] = f"重命名失败: {e}"
        results.append(rec)

    if records:
        batches = _load_undo()
        batches.append({
            "ts": datetime.now().isoformat(timespec="seconds"),
            "items": records,
        })
        _save_undo(batches)
    return {"results": results, "renamed_count": len(records), "batch_index": len(_load_undo()) - 1 if records else None}


def undo_last() -> dict:
    """撤销最近一次批量重命名。"""
    batches = _load_undo()
    if not batches:
        return {"ok": False, "message": "没有可撤销的操作"}
    batch = batches.pop()
    undone, failed = 0, []
    for rec in reversed(batch["items"]):
        new_p, old_p = Path(rec["new"]), Path(rec["old"])
        try:
            if new_p.exists() and not old_p.exists():
                new_p.rename(old_p)
                undone += 1
            elif old_p.exists():
                failed.append(f"{new_p.name}: 原文件已存在，跳过")
            else:
                failed.append(f"{new_p.name}: 文件不存在，跳过")
        except Exception as e:
            failed.append(f"{new_p.name}: {e}")
    _save_undo(batches)
    return {
        "ok": True,
        "message": f"已撤销 {undone} 个文件" + (f"，{len(failed)} 个失败" if failed else ""),
        "undone": undone,
        "failed": failed,
    }


def _load_undo() -> list:
    if UNDO_LOG.exists():
        try:
            return json.loads(UNDO_LOG.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save_undo(batches: list) -> None:
    UNDO_LOG.write_text(json.dumps(batches, ensure_ascii=False, indent=2), encoding="utf-8")
