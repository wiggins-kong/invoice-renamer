"""发票识别重命名 Web 服务（FastAPI）。运行：python app.py"""
import shutil
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import renamer
import crypto_util
from config import load_config, save_config
from extractor import FIELD_LABELS, KEY_FIELDS, parse_pdf
from paths import data_dir, is_frozen, static_dir
import llm_extractor

app = FastAPI(title="发票识别重命名", version="1.1.0")

STATIC_DIR = static_dir()
UPLOAD_DIR = data_dir() / "uploads"

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ---------- 工具 ----------

def get_upload_dir() -> Path:
    cfg = load_config()
    d = Path(cfg.get("paths", {}).get("upload_dir", "uploads"))
    if not d.is_absolute():
        d = data_dir() / d
    d.mkdir(parents=True, exist_ok=True)
    return d


def _dedupe_path(directory: Path, filename: str) -> Path:
    p = directory / filename
    n = 1
    while p.exists():
        p = directory / f"{Path(filename).stem}_{n}{Path(filename).suffix}"
        n += 1
    return p


def parse_items(paths, cfg: dict) -> list:
    """对文件列表逐个解析，返回前端表格所需数据。"""
    mode = cfg.get("extraction", {}).get("mode", "hybrid")
    llm_cfg = cfg.get("llm", {})
    upload_dir = get_upload_dir().resolve()
    items = []
    for p in paths:
        res = parse_pdf(str(p))
        fields, errors, text = res["fields"], res["errors"], res["text"]
        llm_used, llm_error = False, None

        if text.strip() and mode in ("llm", "hybrid"):
            need_llm = mode == "llm" or any(not fields.get(k) for k in KEY_FIELDS)
            if need_llm:
                try:
                    llm_fields = llm_extractor.extract_with_llm(text, llm_cfg)
                    if mode == "llm":
                        fields = llm_extractor.replace_all(fields, llm_fields)
                    else:
                        fields = llm_extractor.fill_missing(fields, llm_fields)
                    llm_used = True
                    # 重算缺失项
                    errors = [e for e in errors if not fields.get(_key_of(e))]
                except Exception as e:
                    llm_error = str(e)
                    errors.append(f"LLM 补全失败: {e}")

        missing = [k for k in KEY_FIELDS if not fields.get(k)]
        if not missing:
            status = "ok"
        elif missing == list(KEY_FIELDS):
            status = "failed"
        else:
            status = "partial"

        suggested = renamer.render_template(cfg.get("naming", {}).get("template", []), fields)
        up = Path(p).resolve()
        downloadable = up.is_relative_to(upload_dir)
        items.append({
            "src": str(p),
            "filename": Path(p).name,
            "fields": fields,
            "suggested": suggested,
            "status": status,
            "errors": errors,
            "llm_used": llm_used,
            "llm_error": llm_error,
            "downloadable": downloadable,
            "download_name": up.name if downloadable else "",
        })
    return items


def _key_of(err: str) -> str:
    """从错误文本反查字段键（用于重算 missing）。"""
    for k, label in FIELD_LABELS.items():
        if label in err:
            return k
    return ""


# ---------- 页面 ----------

@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/fields")
def field_list():
    return {"labels": FIELD_LABELS, "key_fields": list(KEY_FIELDS)}


# ---------- 配置 ----------

@app.get("/api/config")
def get_config():
    cfg = load_config()
    key = cfg.get("llm", {}).get("api_key", "")
    has_key = bool(key)
    # 不回传明文 key，只回传脱敏展示 + 是否已配置
    cfg["llm"]["api_key"] = ""
    cfg["llm"]["has_api_key"] = has_key
    cfg["llm"]["api_key_masked"] = crypto_util.mask(key)
    return cfg


CLEAR_KEY = "__clear__"


class ConfigBody(BaseModel):
    config: dict


@app.post("/api/config")
def post_config(body: ConfigBody):
    incoming = body.config
    llm_in = incoming.get("llm")
    if llm_in is not None and "api_key" in llm_in:
        k = llm_in.pop("api_key")
        cur = load_config().get("llm", {}).get("api_key", "")
        if k == CLEAR_KEY:
            llm_in["api_key"] = ""          # 清除已保存的 key
        elif k:
            llm_in["api_key"] = k           # 新 key（save_config 负责加密落盘）
        else:
            if cur:
                llm_in["api_key"] = cur     # 空串 + 已有 key → 保留原 key
            else:
                llm_in["api_key"] = ""      # 空串 + 无 key → 维持空
    cfg = save_config(incoming)
    key = cfg.get("llm", {}).get("api_key", "")
    return {"ok": True, "has_api_key": bool(key), "api_key_masked": crypto_util.mask(key)}


# ---------- 文件获取与解析 ----------

@app.post("/api/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    cfg = load_config()
    upload_dir = get_upload_dir()
    saved = []
    for f in files:
        filename = renamer.sanitize(f.filename or "unnamed.pdf")
        target = _dedupe_path(upload_dir, filename)
        with target.open("wb") as out:
            shutil.copyfileobj(f.file, out)
        saved.append(target)
    return {"items": parse_items(saved, cfg), "upload_dir": str(upload_dir)}


class ScanBody(BaseModel):
    dir: str
    recursive: bool = True


@app.post("/api/scan")
def scan_dir(body: ScanBody):
    d = Path(body.dir)
    if not d.exists() or not d.is_dir():
        raise HTTPException(400, f"目录不存在: {body.dir}")
    pattern = "**/*.pdf" if body.recursive else "*.pdf"
    pdfs = sorted(d.glob(pattern))
    if not pdfs:
        return {"items": [], "scanned_dir": str(d), "count": 0}
    cfg = load_config()
    return {"items": parse_items(pdfs, cfg), "scanned_dir": str(d), "count": len(pdfs)}


class ParseBody(BaseModel):
    paths: list[str]


@app.post("/api/parse")
def re_parse(body: ParseBody):
    cfg = load_config()
    return {"items": parse_items(body.paths, cfg)}


# ---------- 重命名 ----------

class RenameBody(BaseModel):
    items: list[dict]


@app.post("/api/rename")
def do_rename(body: RenameBody):
    cfg = load_config()
    return renamer.apply_renames(body.items, cfg)


@app.post("/api/undo")
def undo():
    return renamer.undo_last()


# ---------- 下载（仅限 uploads 目录内文件） ----------

@app.get("/api/download")
def download(file: str):
    upload_dir = get_upload_dir().resolve()
    target = (upload_dir / file).resolve()
    if not target.is_relative_to(upload_dir) or not target.is_file():
        raise HTTPException(404, "文件不存在")
    return FileResponse(target, filename=target.name)


if __name__ == "__main__":
    cfg = load_config()
    srv = cfg.get("server", {})
    host = srv.get("host", "127.0.0.1")
    port = int(srv.get("port", 8600))
    url = f"http://{host}:{port}"
    if is_frozen():
        import threading
        import webbrowser

        if not __import__("os").environ.get("INVOICE_RENAMER_NO_BROWSER"):
            threading.Timer(1.5, lambda: webbrowser.open(url)).start()
            print(f"发票识别重命名工具已启动: {url}（浏览器自动打开；关闭本窗口即停止服务）")
        else:
            print(f"发票识别重命名工具已启动: {url}（已跳过自动打开浏览器）")
    else:
        print(f"发票识别重命名工具已启动: {url}")
    uvicorn.run(app, host=host, port=port, log_level="warning")
