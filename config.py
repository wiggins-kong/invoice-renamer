"""配置加载/保存。config.yaml 位于运行时数据目录（exe 旁或项目根目录）。"""
import copy
from pathlib import Path

import yaml

import crypto_util
from paths import data_dir

BASE_DIR = data_dir()
CONFIG_PATH = BASE_DIR / "config.yaml"

DEFAULT_CONFIG = {
    "server": {"host": "127.0.0.1", "port": 8600},
    "extraction": {"mode": "hybrid"},  # regex | llm | hybrid
    "llm": {
        "provider": "deepseek",
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
        "api_key": "",
        "timeout": 60,
    },
    "naming": {
        "template": [
            {"t": "field", "v": "date"},
            {"t": "sep", "v": "_"},
            {"t": "field", "v": "invoice_no"},
            {"t": "sep", "v": "_"},
            {"t": "field", "v": "seller"},
            {"t": "sep", "v": "_"},
            {"t": "field", "v": "amount"},
        ],
        "output": "inplace",      # inplace | subfolder
        "subfolder_by": "month",  # month | seller
        "conflict": "suffix",     # suffix | skip
    },
    "paths": {"upload_dir": "uploads", "scan_dir": ""},
}


def _deep_merge(base: dict, override: dict) -> dict:
    """递归合并，override 覆盖 base。"""
    out = copy.deepcopy(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _read_existing() -> dict:
    """读取现有配置；文件不存在或损坏时返回默认值（无副作用）。"""
    if CONFIG_PATH.exists():
        try:
            data = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
            return _deep_merge(DEFAULT_CONFIG, data)
        except Exception:
            return copy.deepcopy(DEFAULT_CONFIG)
    return copy.deepcopy(DEFAULT_CONFIG)


def load_config() -> dict:
    """读取配置；LLM API key 在内存中解密为明文（供调用 LLM 使用），
    磁盘上的 config.yaml 始终只存密文。"""
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(
            yaml.safe_dump(DEFAULT_CONFIG, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )
    cfg = _read_existing()
    key = cfg.get("llm", {}).get("api_key", "")
    if key:
        try:
            cfg["llm"]["api_key"] = crypto_util.unprotect(key)
        except Exception:
            # 解密失败（如换机器/换用户）：视为未配置，不阻断启动
            cfg["llm"]["api_key"] = ""
    return cfg


def save_config(cfg: dict) -> dict:
    """合并保存配置；LLM API key 落盘前加密（DPAPI），config.yaml 不存明文。"""
    incoming = copy.deepcopy(cfg)
    key = incoming.get("llm", {}).get("api_key")
    if key:
        if not key.startswith(crypto_util.PREFIX):
            incoming["llm"]["api_key"] = crypto_util.protect(key)
    merged = _deep_merge(_read_existing(), incoming)
    CONFIG_PATH.write_text(
        yaml.safe_dump(merged, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    return merged
