"""LLM 结构化字段提取（OpenAI 兼容协议，DeepSeek / 任意端点）。"""
import json
import re

import requests

from extractor import FIELD_LABELS, KEY_FIELDS

SYSTEM_PROMPT = (
    "你是发票信息提取助手。用户会提供增值税发票/数电票的文本内容，"
    "请提取字段并只返回一个 JSON 对象，不要输出任何解释或 Markdown。"
)

FIELD_KEYS = list(FIELD_LABELS.keys())


def _build_user_prompt(text: str) -> str:
    keys_desc = "、".join(FIELD_KEYS)
    return (
        f"从以下发票文本中提取字段。返回严格 JSON，只能包含这些键：{keys_desc}。\n"
        f"date 格式为 YYYY-MM-DD；amount 为数字（如 100.00）；"
        f"识别不到的字段用空字符串 \"\"。\n\n发票文本：\n{text[:8000]}"
    )


def _parse_json(content: str) -> dict:
    """容错解析 LLM 返回的 JSON（去代码块、取第一个完整对象）。"""
    s = content.strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s).strip()
    start, end = s.find("{"), s.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("LLM 返回中没有 JSON 对象")
    data = json.loads(s[start : end + 1])
    out = {}
    for k in FIELD_KEYS:
        v = data.get(k, data.get(k.lower(), ""))
        out[k] = str(v).strip() if v is not None else ""
    return out


def extract_with_llm(text: str, llm_cfg: dict) -> dict:
    """调用 LLM 提取字段。失败抛异常，由调用方决定兜底策略。"""
    base = (llm_cfg.get("base_url") or "https://api.deepseek.com/v1").rstrip("/")
    api_key = llm_cfg.get("api_key", "")
    model = llm_cfg.get("model", "deepseek-chat")
    timeout = int(llm_cfg.get("timeout", 60))
    if not api_key:
        raise ValueError("未配置 LLM API key")

    url = f"{base}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(text)},
        ],
        "temperature": 0,
    }
    try:
        payload["response_format"] = {"type": "json_object"}
        r = requests.post(url, json=payload, headers=headers, timeout=timeout)
    except requests.RequestException as e:
        raise ValueError(f"LLM 请求失败: {e}")
    if r.status_code in (400, 422) and "response_format" in payload:
        # 部分 OpenAI 兼容服务不支持 json_object，去掉重试一次
        del payload["response_format"]
        r = requests.post(url, json=payload, headers=headers, timeout=timeout)
    if r.status_code != 200:
        raise ValueError(f"LLM 返回 HTTP {r.status_code}: {r.text[:200]}")
    try:
        content = r.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise ValueError(f"LLM 响应格式异常: {e}")
    return _parse_json(content)


def fill_missing(fields: dict, llm_fields: dict) -> dict:
    """用 LLM 结果填补缺失字段，返回新字典。"""
    out = dict(fields)
    for k in FIELD_KEYS:
        if not out.get(k) and llm_fields.get(k):
            out[k] = llm_fields[k]
    return out


def replace_all(fields: dict, llm_fields: dict) -> dict:
    """LLM 模式：非空 LLM 字段全部覆盖。"""
    out = dict(fields)
    for k in FIELD_KEYS:
        if llm_fields.get(k):
            out[k] = llm_fields[k]
    return out
