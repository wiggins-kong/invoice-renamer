"""生成合成测试发票 fixtures（假数据，替换原真实发票）。

设计目标：让 electron/tests/test_extractor.js 用假数据跑通解析路径，覆盖三种版式：
  1. 双栏（增值税专用发票）：购买方左栏、销售方右栏，含双方税号
  2. 单栏（电子专用发票）：只有销售方
  3. 水印（防复制，每字符重复 3 遍）
所有公司名 / 税号 / 发票号均为虚构，不含任何真实企业信息。
"""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))

FIXTURES = Path(__file__).resolve().parent.parent / "electron" / "tests" / "fixtures"

SELLER = "广州云帆贸易有限公司"
SELLER_TAX = "91440100MA5FAKE001"
BUYER = "广州明辉制药有限公司"
BUYER_TAX = "91440100MA5FAKE002"

# 20 位假发票号（无相邻重复数字：逐字水印 + 非贪婪 dedup 可干净还原）
INV = "26453579152834615209"


def _drawn(c, x, y, text):
    c.drawString(x, y, text)


def make_double_col(path: str):
    """双栏增值税专用发票：购买方信息在左栏，销售方信息在右栏。"""
    c = canvas.Canvas(str(path), pagesize=A4)
    W, H = A4
    mid = W / 2
    c.setFont("STSong-Light", 16)
    c.drawCentredString(W / 2, H - 70, "电子发票（专用发票）")
    c.setFont("STSong-Light", 11)
    c.drawString(60, H - 110, f"发票号码：26447000002000000001")
    c.drawString(330, H - 110, f"开票日期：2026年08月13日")

    y = H - 160
    # 购买方（左栏，x < mid）
    c.setFont("STSong-Light", 12)
    _drawn(c, 60, y, "购买方信息")
    c.setFont("STSong-Light", 11)
    _drawn(c, 80, y - 24, f"名称：{BUYER}")
    _drawn(c, 80, y - 48, f"纳税人识别号：{BUYER_TAX}")
    # 销售方（右栏，x >= mid）
    c.setFont("STSong-Light", 12)
    _drawn(c, mid + 60, y, "销售方信息")
    c.setFont("STSong-Light", 11)
    _drawn(c, mid + 80, y - 24, f"名称：{SELLER}")
    _drawn(c, mid + 80, y - 48, f"纳税人识别号：{SELLER_TAX}")

    y = y - 100
    _drawn(c, 60, y, "项目名称")
    _drawn(c, 300, y, "金额")
    _drawn(c, 400, y, "税率")
    _drawn(c, 460, y, "税额")
    y -= 24
    _drawn(c, 60, y, "*咨询费")
    _drawn(c, 300, y, "293.81")
    _drawn(c, 400, y, "13%")
    _drawn(c, 460, y, "38.19")
    y -= 30
    _drawn(c, 60, y, "合 计")
    _drawn(c, 300, y, "¥293.81")
    _drawn(c, 460, y, "¥38.19")
    y -= 34
    c.setFont("STSong-Light", 12)
    _drawn(c, 60, y, "价税合计（大写）叁佰叁拾贰圆整（小写）¥332.00")
    c.showPage()
    c.save()


def make_single_col(path: str):
    """单栏电子专用发票：只有销售方信息。"""
    c = canvas.Canvas(str(path), pagesize=A4)
    W, H = A4
    c.setFont("STSong-Light", 16)
    c.drawCentredString(W / 2, H - 70, "电子发票（专用发票）")
    c.setFont("STSong-Light", 11)
    c.drawString(60, H - 110, f"发票号码：26447000002000000002")
    c.drawString(330, H - 110, f"开票日期：2026年08月12日")

    y = H - 160
    c.setFont("STSong-Light", 12)
    _drawn(c, 60, y, "销售方信息")
    c.setFont("STSong-Light", 11)
    _drawn(c, 80, y - 24, f"名称：{SELLER}")

    y = y - 90
    _drawn(c, 60, y, "项目名称")
    _drawn(c, 300, y, "金额")
    _drawn(c, 400, y, "税率")
    _drawn(c, 460, y, "税额")
    y -= 24
    _drawn(c, 60, y, "*技术服务费")
    _drawn(c, 300, y, "455.20")
    _drawn(c, 400, y, "13%")
    _drawn(c, 460, y, "59.18")
    y -= 30
    _drawn(c, 60, y, "合 计")
    _drawn(c, 300, y, "¥455.20")
    _drawn(c, 460, y, "¥59.18")
    y -= 34
    c.setFont("STSong-Light", 12)
    _drawn(c, 60, y, "价税合计（大写）伍佰壹拾肆元叁角捌分（小写）¥514.38")
    c.showPage()
    c.save()


def triple(text: str) -> str:
    """防复制水印：每个字符重复 3 遍。"""
    return "".join(ch * 3 for ch in text)


def phrase(text: str) -> str:
    """整段重复 3 遍（名称类用：RE_NAME_INLINE 首遍即可干净解析）。"""
    return text * 3


def make_watermark(path: str):
    """水印发票：数字/日期逐字重复 3 遍（靠解析器 dedup 兜底），名称整段重复。

    注意：逐字重复下，非贪婪 dedup（(.{1,12}?)\\1{2,} 贪婪 \\1{2,}）会把
    「相邻重复数字」的 3 倍（6 个）折叠成 1 个而丢信息。因此金额/发票号等
    必须选用**无相邻重复数字**的假值，才能干净往返。
    """
    c = canvas.Canvas(str(path), pagesize=A4)
    W, H = A4
    c.setFont("STSong-Light", 14)
    c.drawCentredString(W / 2, H - 55, triple("电子发票（专用发票）"))
    c.setFont("STSong-Light", 10)
    c.drawString(50, H - 85, triple(f"发票号码：{INV}"))
    c.drawString(50, H - 108, triple("开票日期：2026年08月08日"))
    y = H - 148
    c.drawString(60, y, phrase(f"购买方名称：{BUYER} "))
    y -= 22
    c.drawString(60, y, phrase(f"销售方名称：{SELLER} "))
    y -= 40
    c.drawString(60, y, triple("项目名称") + "   " + triple("金额") + "  " + triple("税率") + "  " + triple("税额"))
    y -= 20
    c.drawString(60, y, triple("*系统运维服务"))
    c.drawString(280, y, triple("106.64"))
    c.drawString(380, y, triple("13%"))
    c.drawString(450, y, triple("13.86"))
    y -= 26
    c.drawString(60, y, triple("合 计"))
    c.drawString(280, y, triple("106.64"))
    c.drawString(450, y, triple("13.86"))
    y -= 34
    c.setFont("STSong-Light", 9)
    c.drawString(40, y, triple("价税合计（大写）壹佰贰拾元伍角整"))
    y -= 16
    c.drawString(40, y, triple("（小写）120.50"))
    c.showPage()
    c.save()


def main():
    FIXTURES.mkdir(parents=True, exist_ok=True)
    make_double_col(FIXTURES / "26447000002000000001_2026-08-13广州云帆贸易有限公司广州明辉制药有限公司332电子发票(增值税专用发票).pdf")
    make_single_col(FIXTURES / "26447000002000000002_2026-08-12广州云帆贸易有限公司.pdf")
    make_watermark(FIXTURES / "水印发票_26453579152834615209.pdf")
    print("生成完成 ->", FIXTURES)


if __name__ == "__main__":
    main()
