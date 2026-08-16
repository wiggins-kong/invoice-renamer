"""加密 + 水印修复的集成验证（服务需已启动）。"""
import requests

BASE = "http://127.0.0.1:8600"
FAKE_KEY = "sk-test1234567890abcdef"
results = []


def check(name, cond, extra=""):
    results.append((name, cond))
    print(("✓" if cond else "✗"), name, extra)


# 1) 保存带 key 的配置
r = requests.post(f"{BASE}/api/config", json={"config": {"llm": {"api_key": FAKE_KEY}}})
d = r.json()
check("保存 key 成功", d.get("ok") and d.get("has_api_key"), f"masked={d.get('api_key_masked')}")

# 2) config.yaml 落盘不含明文
raw = open("config.yaml", encoding="utf-8").read()
check("config.yaml 不含明文 key", FAKE_KEY not in raw)
check("config.yaml 存的是 enc: 密文", "enc:" in raw)

# 3) GET 不回传明文
g = requests.get(f"{BASE}/api/config").json()["llm"]
check("GET api_key 为空（不回传明文）", g["api_key"] == "")
check("GET 有脱敏值", g["has_api_key"] and g["api_key_masked"] == "sk-****cdef", g["api_key_masked"])

# 4) 不带 api_key 保存 → key 保留
requests.post(f"{BASE}/api/config", json={"config": {"llm": {"model": "deepseek-chat"}}})
g = requests.get(f"{BASE}/api/config").json()["llm"]
check("未传 key 时保留原 key", g["has_api_key"])

# 5) 清除 key
requests.post(f"{BASE}/api/config", json={"config": {"llm": {"api_key": "__clear__"}}})
g = requests.get(f"{BASE}/api/config").json()["llm"]
check("__clear__ 后 key 已清除", not g["has_api_key"])
raw = open("config.yaml", encoding="utf-8").read()
check("清除后 config.yaml 无 enc 残留", "enc:" not in raw or g["has_api_key"])

# 6) 水印 PDF 票种修复
r = requests.post(f"{BASE}/api/scan", json={"dir": r"C:\Users\wiggins\invoice-renamer\uploads"})
items = r.json()["items"]
wm = [it for it in items if it["filename"].startswith("26447000001546483915")]
if wm:
    check("水印 PDF 票种已识别", wm[0]["fields"]["type"] == "电子专用发票",
          f"type={wm[0]['fields']['type']!r}")
else:
    check("找到水印 PDF", False)

bad = [it["filename"] for it in items if it["status"] != "ok"]
check("全部 7 个文件 status=ok", not bad, str(bad))

print("-" * 50)
ok = sum(1 for _, c in results if c)
print(f"{ok}/{len(results)} 通过")
