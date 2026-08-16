"""生成测试用样例发票 PDF（文字型，模拟数电票/电子发票版式）。"""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))

OUT = Path(__file__).resolve().parent


def draw_invoice(path: str, data: dict):
    c = canvas.Canvas(str(path), pagesize=A4)
    W, H = A4
    c.setFont("STSong-Light", 16)
    c.drawCentredString(W / 2, H - 70, data["title"])

    c.setFont("STSong-Light", 11)
    y = H - 110
    c.drawString(60, y, f"发票号码：{data['invoice_no']}")
    c.drawString(330, y, f"开票日期：{data['date_cn']}")
    y -= 40

    for block in data["blocks"]:  # 购买方信息 / 销售方信息
        c.setFont("STSong-Light", 12)
        c.drawString(60, y, block["title"])
        y -= 24
        c.setFont("STSong-Light", 11)
        for line in block["lines"]:
            c.drawString(80, y, line)
            y -= 24
        y -= 12

    # 明细表头
    c.setFont("STSong-Light", 11)
    c.drawString(60, y, "项目名称")
    c.drawString(300, y, "金额")
    c.drawString(400, y, "税率")
    c.drawString(460, y, "税额")
    y -= 24
    for row in data["details"]:
        c.drawString(60, y, row[0])
        c.drawString(300, y, row[1])
        c.drawString(400, y, row[2])
        c.drawString(460, y, row[3])
        y -= 24

    c.setFont("STSong-Light", 12)
    c.drawString(60, y - 10, f"价税合计（大写）{data['amount_cn']}（小写）¥{data['amount']}")
    c.showPage()
    c.save()


SAMPLES = [
    {
        "file": "样例1_电子普通发票.pdf",
        "title": "电子发票（普通发票）",
        "invoice_no": "25512345678901234567",
        "date_cn": "2026年08月15日",
        "blocks": [
            {"title": "购买方信息", "lines": [
                "名称：北京某某商贸有限公司",
                "纳税人识别号：91110108MA01XXXXXX"]},
            {"title": "销售方信息", "lines": [
                "名称：深圳市某某科技有限公司",
                "纳税人识别号：91440300MA5XXXXXXX"]},
        ],
        "details": [["技术服务费", "94.34", "6%", "5.66"]],
        "amount_cn": "壹佰元整",
        "amount": "100.00",
    },
    {
        "file": "样例2_电子专用发票.pdf",
        "title": "电子发票（专用发票）",
        "invoice_no": "25512345678901234568",
        "date_cn": "2026年08月12日",
        "blocks": [
            {"title": "购买方信息", "lines": [
                "名称：上海某某供应链有限公司",
                "纳税人识别号：91310000MA1XXXXXXX"]},
            {"title": "销售方信息", "lines": [
                "名称：广州某某软件有限公司",
                "纳税人识别号：91440100MA5XXXXXXX"]},
        ],
        "details": [["软件授权费", "4424.78", "13%", "575.22"]],
        "amount_cn": "伍仟元整",
        "amount": "5000.00",
    },
]


def main():
    OUT.mkdir(exist_ok=True)
    for s in SAMPLES:
        p = OUT / s["file"]
        p.parent.mkdir(exist_ok=True)
        draw_invoice(p, s)
        print("生成:", p)


if __name__ == "__main__":
    main()
