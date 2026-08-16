"""端到端测试：上传 → 解析 → 预览 → 重命名 → 验证 → 撤销 → 验证。"""
import sys
from pathlib import Path

import requests

BASE = "http://127.0.0.1:8600"
ROOT = Path(__file__).resolve().parent.parent

passed = failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        print(f"  ✗ {name}  {detail}")


def main():
    print("== 1. 上传两张样例发票 ==")
    files = [
        ("files", (p.name, p.open("rb"), "application/pdf"))
        for p in [ROOT / "samples/样例1_电子普通发票.pdf",
                  ROOT / "samples/样例2_电子专用发票.pdf"]
    ]
    r = requests.post(f"{BASE}/api/upload", files=files, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data["items"]
    check("上传并解析 2 个文件", len(items) == 2, str(len(items)))

    f1 = next(i for i in items if "25512345678901234567" in i["filename"] or i["fields"]["invoice_no"] == "25512345678901234567")
    f2 = next(i for i in items if i["fields"]["invoice_no"] == "25512345678901234568")
    check("样例1 发票号码", f1["fields"]["invoice_no"] == "25512345678901234567", f1["fields"]["invoice_no"])
    check("样例1 日期", f1["fields"]["date"] == "2026-08-15", f1["fields"]["date"])
    check("样例1 销售方", f1["fields"]["seller"] == "深圳市某某科技有限公司", f1["fields"]["seller"])
    check("样例1 金额", f1["fields"]["amount"] == "100.00", f1["fields"]["amount"])
    check("样例1 状态=ok", f1["status"] == "ok", f1["status"])
    check("样例2 票种", f2["fields"]["type"] == "电子专用发票", f2["fields"]["type"])
    check("样例2 建议名含金额", f2["suggested"].endswith("5000.00"), f2["suggested"])
    print(f"  建议名1: {f1['suggested']}")
    print(f"  建议名2: {f2['suggested']}")

    print("== 2. 批量重命名 ==")
    r = requests.post(f"{BASE}/api/rename", json={
        "items": [{"src": i["src"], "new_name": i["suggested"], "fields": i["fields"]} for i in items]
    }, timeout=30)
    res = r.json()
    check("重命名全部成功", res["renamed_count"] == 2, str(res))
    new1 = ROOT / "uploads" / f"{f1['suggested']}.pdf"
    new2 = ROOT / "uploads" / f"{f2['suggested']}.pdf"
    check("新文件1 已存在", new1.exists(), str(new1))
    check("新文件2 已存在", new2.exists(), str(new2))
    check("旧文件1 已不存在", not (ROOT / "uploads/样例1_电子普通发票.pdf").exists())

    print("== 3. 扫描目录（重命名后） ==")
    r = requests.post(f"{BASE}/api/scan", json={"dir": str(ROOT / "uploads")}, timeout=60)
    scanned = r.json()["items"]
    names = sorted(i["filename"] for i in scanned)
    check("扫描到 2 个新文件", len(names) == 2, str(names))
    check("文件名均为模板格式", all(n.endswith(".pdf") and "_" in n for n in names), str(names))

    print("== 4. 撤销 ==")
    r = requests.post(f"{BASE}/api/undo", timeout=30)
    check("撤销成功", r.json().get("ok") and r.json()["undone"] == 2, str(r.json()))
    check("旧文件名已恢复", (ROOT / "uploads/样例1_电子普通发票.pdf").exists())

    print(f"\n结果: {passed} 通过, {failed} 失败")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
