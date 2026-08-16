"""发票文本提取与正则字段解析（中国电子发票 / 数电票，文字型 PDF）。

兼容两类版式：
- 单栏：购买方信息/销售方信息分行（数电票常见）
- 双栏：购/销双方信息左右分栏、名称同行（增值税专用发票常见）
"""
import re

import pdfplumber

FIELD_LABELS = {
    "invoice_no": "发票号码",
    "date": "开票日期",
    "seller": "销售方",
    "buyer": "购买方",
    "amount": "价税合计",
    "amount_cn": "金额大写",
    "type": "票种",
    "seller_tax_id": "销售方税号",
    "buyer_tax_id": "购买方税号",
}

# 关键字段：缺这些就算"识别不完整"
KEY_FIELDS = ("invoice_no", "date", "amount")

RE_INVOICE_NO_CTX = re.compile(r"发票号码[:：]?\s*([0-9]{8,25})")
RE_INVOICE_NO_ALONE = re.compile(r"(?<![0-9])(\d{20})(?!\d)")
RE_DATE = re.compile(r"(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})")
RE_DATE_CTX = re.compile(r"开票日期[:：]?\s*(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})")
RE_TAX_ID = re.compile(r"(?:纳税人识别号|统一社会信用代码)[^\dA-Z]*([0-9A-Z]{15,20})")
RE_AMOUNT_NUM = re.compile(r"[\d,]+(?:\.\d{1,2})?")
RE_AMOUNT_CN = re.compile(
    r"价税合计[（(]大写[）)]\s*([\u4e00-\u9fa5零壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分整]+)"
)
RE_NAME_INLINE = re.compile(r"名称\s*[:：]\s*([^\s:：]{2,60})")
RE_COMPANY = re.compile(r"([\u4e00-\u9fa5A-Za-z0-9·（）()]{4,40}(?:公司|厂|店|事务所|中心|集团|医院|学校))")


def _norm_name(text: str) -> str:
    """把 '名 称' 这类拆字还原为 '名称'（真实发票竖排/字距导致）。"""
    return re.sub(r"名\s+称", "名称", text)


def _dedup(text: str) -> str:
    """折叠连续重复字符。部分税务 PDF 做防复制水印：每个字重复 3 遍
    （'发票号码' → '发发发票票票号号号码码码'），导致 3+ 字短语匹配失败。"""
    return re.sub(r"(.)\1+", r"\1", text)


def extract_texts(pdf_path: str):
    """返回 (full_text, left_col, right_col)。
    left/right 按页面中线裁剪，用于双栏版式（左=购买方，右=销售方）。
    """
    full, left, right = [], [], []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            w, h = float(page.width), float(page.height)
            t = page.extract_text()
            if t:
                full.append(t)
            try:
                mid = w / 2
                lt = page.crop((0, 0, mid, h)).extract_text()
                rt = page.crop((mid, 0, w, h)).extract_text()
            except Exception:
                lt = rt = ""
            if lt:
                left.append(lt)
            if rt:
                right.append(rt)
    return "\n".join(full), "\n".join(left), "\n".join(right)


def extract_text(pdf_path: str) -> str:
    """提取全文（单栏视图，兼容旧调用）。"""
    full, _, _ = extract_texts(pdf_path)
    return full


def _detect_type(text: str) -> str:
    head = text[:800]
    if "铁路电子客票" in head:
        return "铁路电子客票"
    if "通行费" in head and ("电子发票" in head or "数电票" in head):
        return "通行费电子发票（普通）"
    if "数电票" in head or "全面数字化电子发票" in head:
        return "数电票（专用）" if "专用" in head else "数电票（普通）"
    if "电子发票" in head:
        return "电子专用发票" if "专用" in head else "电子普通发票"
    if "增值税专用发票" in head:
        return "增值税专用发票"
    if "增值税普通发票" in head:
        return "增值税普通发票"
    if "专用发票" in head:
        return "专用发票"
    if "普通发票" in head:
        return "普通发票"
    return ""


def _block_after(text: str, keywords, n_lines: int = 8):
    """找到关键词所在行之后的若干行（含该行），用于单栏版式。"""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    for i, line in enumerate(lines):
        if any(k in line for k in keywords):
            return lines[i : i + n_lines]
    return []


def _party_from_column(col_text: str) -> dict:
    """双栏版式：单栏文本内提取 名称 + 税号。"""
    out = {"name": "", "tax_id": ""}
    c = _norm_name(col_text.strip())
    if not c:
        return out
    m = RE_NAME_INLINE.search(c)
    if m:
        out["name"] = m.group(1).strip()
    else:
        m = RE_COMPANY.search(c)
        if m:
            out["name"] = m.group(1).strip()
    m = RE_TAX_ID.search(c)
    if m:
        out["tax_id"] = m.group(1)
    return out


def _party_block(text: str, keyword: str) -> dict:
    """单栏版式：按信息块提取 名称 + 税号。"""
    out = {"name": "", "tax_id": ""}
    block = _block_after(text, [keyword + "信息", keyword + "名称", keyword])
    joined = _norm_name("\n".join(block))
    m = RE_NAME_INLINE.search(joined)
    if m:
        out["name"] = m.group(1).strip()
    else:
        for line in block:
            if re.search(r"公司|厂|店|事务所|中心|集团|医院|学校", line) and len(line) <= 80:
                out["name"] = line.strip()
                break
    m = RE_TAX_ID.search(joined)
    if m:
        out["tax_id"] = m.group(1)
    return out


def _extract_amount(text: str) -> str:
    """价税合计提取，不依赖 ¥ 符号（真实 PDF 中可能提取为 ´ 等）。"""
    # 1) 价税合计行：优先取「小写」后紧跟的金额；否则取段内带小数的货币金额（备注里的整数编号不干扰）
    idx = text.find("价税合计")
    if idx != -1:
        seg = text[idx : idx + 120]
        m = re.search(r"小写[)）]?\s*[¥￥´]?\s*([\d,]+(?:\.\d{1,2})?)", seg)
        if not m:
            dec = re.findall(r"[\d,]+\.\d{1,2}", seg)
            if dec:
                m = dec[-1]
            else:
                nums = RE_AMOUNT_NUM.findall(seg)
                m = nums[-1] if nums else None
        if m:
            return (m if isinstance(m, str) else m.group(1)).replace(",", "")
    # 2) 合计行：金额 + 税额 求和（增值税发票 价税合计 = 金额 + 税额）
    total = None
    for line in text.splitlines():
        if "合计" in line and "价税合计" not in line:
            vals = [float(n.replace(",", "")) for n in RE_AMOUNT_NUM.findall(line)]
            if vals:
                total = sum(vals)
    if total is not None:
        return f"{total:.2f}"
    # 3) 兜底：全文最后一个 ¥/´ 金额
    amounts = re.findall(r"[¥￥´]\s*([\d,]+(?:\.\d{1,2})?)", text)
    if amounts:
        return amounts[-1].replace(",", "")
    return ""


def parse_fields(text: str, left_col: str = "", right_col: str = "") -> dict:
    """正则解析，返回字段字典。

    先按原始文本解析；缺失字段用「连续重复字折叠」后的文本再解析一次
    （兼容防复制水印 PDF）。原始结果优先，避免误伤合法叠字（如公司名）。
    """
    fields = _parse_fields_core(text, left_col, right_col)
    if missing_key_fields(fields) or not fields.get("type"):
        d_text = _dedup(text)
        d_fields = _parse_fields_core(d_text, _dedup(left_col), _dedup(right_col))
        for k in fields:
            if not fields[k] and d_fields[k]:
                fields[k] = d_fields[k]
    return fields


def _parse_fields_core(text: str, left_col: str = "", right_col: str = "") -> dict:
    """单遍正则解析（供 parse_fields 调用）。"""
    fields = {k: "" for k in FIELD_LABELS}
    fields["type"] = _detect_type(text)

    m = RE_INVOICE_NO_CTX.search(text)
    if not m:
        m = RE_INVOICE_NO_ALONE.search(text)
    if m:
        fields["invoice_no"] = m.group(1)

    m = RE_DATE_CTX.search(text)
    if not m:
        m = RE_DATE.search(text)
    if m:
        y, mo, d = m.groups()
        fields["date"] = f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"

    fields["amount"] = _extract_amount(text)

    m = RE_AMOUNT_CN.search(text)
    if m:
        fields["amount_cn"] = m.group(1)

    # 双栏版式：右栏=销售方，左栏=购买方；单栏版式：信息块兜底
    seller = _party_from_column(right_col)
    buyer = _party_from_column(left_col)
    if not seller["name"]:
        seller = _party_block(text, "销售方")
    if not buyer["name"]:
        buyer = _party_block(text, "购买方")
    fields["seller"] = seller["name"]
    fields["seller_tax_id"] = seller["tax_id"]
    fields["buyer"] = buyer["name"]
    fields["buyer_tax_id"] = buyer["tax_id"]
    return fields


def missing_key_fields(fields: dict):
    return [k for k in KEY_FIELDS if not fields.get(k)]


def parse_pdf(pdf_path: str) -> dict:
    """解析单个 PDF，返回 {fields, errors, text}。"""
    errors = []
    try:
        full, left, right = extract_texts(pdf_path)
    except Exception as e:
        return {"fields": {k: "" for k in FIELD_LABELS},
                "errors": [f"PDF 读取失败: {e}"], "text": ""}
    if not full.strip():
        errors.append("未提取到文本（可能不是文字型 PDF）")
    fields = parse_fields(full, left, right) if full.strip() else {k: "" for k in FIELD_LABELS}
    for k in missing_key_fields(fields):
        errors.append(f"未识别到{FIELD_LABELS[k]}")
    return {"fields": fields, "errors": errors, "text": full}
