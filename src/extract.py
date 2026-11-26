from __future__ import annotations

import csv
import hashlib
import html
import io
import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

DOC_EXTS = {".pdf", ".doc", ".docx", ".pptx", ".ppt", ".rtf"}
TABLE_EXTS = {".xlsx", ".xls", ".csv", ".tsv"}
TEXT_EXTS = {".txt", ".md", ".markdown", ".json", ".yaml", ".yml"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".svg", ".heic", ".heif"}
SUPPORTED_EXTS = DOC_EXTS | TABLE_EXTS | TEXT_EXTS | IMAGE_EXTS

DOC_TYPES = {
    "regulation": {"label": "制度法规", "default_chunk": "laws"},
    "finance": {"label": "财报数据", "default_chunk": "report"},
    "contract": {"label": "合同协议", "default_chunk": "laws"},
    "report": {"label": "研报方案", "default_chunk": "report"},
    "spreadsheet": {"label": "表格台账", "default_chunk": "table"},
    "image": {"label": "图片图纸", "default_chunk": "image"},
    "general": {"label": "通用文档", "default_chunk": "report"},
}

CHUNK_PROFILES = {
    "auto": "智能自动路由",
    "laws": "条文切分 (章/节/条+内嵌表)",
    "report": "层级章节切分 (标题树+自然段)",
    "table": "表格结构化切分 (自动携带表头)",
    "image": "视觉与OCR双轨索引",
    "one": "整篇/短文档不切分",
}

RE_DOCNO = re.compile(
    r"[（(]?\s*([\u4e00-\u9fa5]{2,12})\s*[〔【﹝\[（(]\s*(\d{4})\s*[〕】﹞\]）)]\s*(\d+)\s*号\s*[）)]?"
)
RE_DATE = re.compile(r"(?<!\d)(20\d{2})[-.年/]?(\d{1,2})[-.月/]?(\d{1,2})日?(?!\d)")
RE_DATE_COMPACT = re.compile(r"(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)")
RE_TITLE = re.compile(r"《([^》]{2,80})》")
RE_TITLE_ALT = re.compile(
    r"关于(?:印发|印发实施|修订印发)?(.{2,60}?)(?:的通知|的批复|\.pdf|\.docx?|\.PDF)$"
)

STATUS_PATTERNS = [
    (re.compile(r"^已被修改[-—]?|已废止|失效"), "已废止"),
    (re.compile(r"以此为准"), "现行"),
    (re.compile(r"\(试行\)|（试行）|暂行|试行"), "试行"),
]

RE_DOCNO_TEXT = re.compile(
    r"([\u4e00-\u9fa5]{2,12})\s*[〔【﹝\[（(]\s*(\d{4})\s*[〕】﹞\]）)]\s*(\d+)\s*号"
)
RE_ISSUE_TEXT = re.compile(r"(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")
RE_AMOUNT = re.compile(
    r"(?:合同金额|总金额|总价|价款|金额|人民币|¥|￥)\s*[:：为]?\s*([0-9][0-9,.，]*\s*(?:万元|亿元|元|万|亿)?)"
)
RE_PARTY_A = re.compile(r"(?:甲方|发包人|委托方|采购人|买方)\s*[（(]?[^）)\n]{0,12}[）)]?\s*[:：]\s*([^\n，,；;（(]{2,40})")
RE_PARTY_B = re.compile(r"(?:乙方|承包人|受托方|供应商|卖方)\s*[（(]?[^）)\n]{0,12}[）)]?\s*[:：]\s*([^\n，,；;（(]{2,40})")
RE_PERIOD = re.compile(r"(20\d{2}\s*(?:年\s*(?:度|半年度|第一季度|第二季度|第三季度|第四季度|[1-4]季度|年报|半年报|中报|三季报|一季报)|Q[1-4]|H[12]))", re.I)


@dataclass
class Doc:
    key: str
    dept: str
    title: str = ""
    doc_no: str = ""
    issued_date: str = ""
    handler: str = ""
    status: str = "现行"
    category: str = "文档"
    rel_path: str = ""
    abs_path: str = ""
    project: str = "集团制度库"
    folder: str = ""
    doc_type: str = ""
    file_ext: str = ""
    content_hash: str = ""
    chunk_profile: str = "auto"
    summary: str = ""
    tags: list[str] = field(default_factory=list)
    meta: dict = field(default_factory=dict)
    pages: list[str] = field(default_factory=list)
    page_blocks: dict[int, list[str]] = field(default_factory=dict)
    bboxes: dict[tuple[int, int], list[float]] = field(default_factory=dict)
    block_labels: dict[tuple[int, int], str] = field(default_factory=dict)
    tables: list[dict] = field(default_factory=list)
    has_text: bool = False
    text_source: str = ""
    note: str = ""


def _clean(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if tag else ""


def _decode_bytes(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "gb18030", "gbk"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", "replace")


def parse_rel_hierarchy(rel_path: str, default_project: str = "集团制度库") -> tuple[str, str, str]:
    norm = (rel_path or "").replace("\\", "/").strip("/")
    parts = [p for p in norm.split("/") if p and p != "."]
    if len(parts) <= 1:
        return default_project, "", default_project
    if len(parts) == 2:
        # 兼容单层部门目录结构：顶层视作默认项目下的文件夹，或本身即项目
        first = parts[0]
        if first.endswith(("部", "室", "中心", "办", "办公室", "工会", "纪委", "党委", "董事会")):
            return default_project, first, first
        return first, "", first
    project = parts[0]
    folder = "/".join(parts[1:-1])
    dept = parts[-2]
    return project, folder, dept


def parse_filename(name: str) -> dict:
    stem = os.path.splitext(os.path.basename(name or ""))[0]
    stem_work = re.sub(r"_(可搜索|已搜索)(\(OCR\))?$", "", stem)
    stem_work = re.sub(r"\(\d\)$", "", stem_work)

    meta = {"title": "", "doc_no": "", "issued_date": "", "handler": "", "status": "现行"}

    m = RE_DOCNO.search(stem_work)
    if m:
        prefix, year, num = m.group(1), m.group(2), m.group(3)
        meta["doc_no"] = f"{prefix}〔{year}〕{num}号"

    m = RE_DATE_COMPACT.search(stem_work)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            meta["issued_date"] = f"{y:04d}-{mo:02d}-{d:02d}"
            tail = stem_work[m.end():].strip(" -_")
            mh = re.match(r"([\u4e00-\u9fa5]{2,4})(?=[\s ]|关于印发|关于|\(|（|$)", tail)
            if mh and mh.group(1) not in ("关于", "印发", "修订"):
                meta["handler"] = mh.group(1)

    title_src = RE_DOCNO.sub("", stem_work)
    title_src = re.sub(r"[-—\s]*\d{1,2}\.\d{1,2}$", "", title_src).strip(" -—_")
    m = RE_TITLE.search(title_src)
    if m:
        meta["title"] = m.group(1).strip()
    else:
        m = RE_TITLE_ALT.search(title_src)
        if m:
            meta["title"] = m.group(1).strip()
        else:
            cleaned = re.sub(r"^(已被修改[-—_]?|20\d{6}\s*)", "", title_src).strip(" -—_")
            if meta["handler"] and cleaned.startswith(meta["handler"]):
                cleaned = cleaned[len(meta["handler"]):].strip(" -—_")
            meta["title"] = cleaned or stem_work

    for pat, label in STATUS_PATTERNS:
        if pat.search(stem_work):
            meta["status"] = label
            break

    return meta


def guess_doc_type(filename: str, text: str = "", ext: str = "", tables: list | None = None) -> str:
    ext = (ext or os.path.splitext(filename or "")[1]).lower()
    if ext in IMAGE_EXTS:
        return "image"
    if ext in TABLE_EXTS:
        name_head = (filename or "") + "\n" + (text or "")[:1200]
        if re.search(r"资产负债表|利润表|损益表|现金流量表|财务报表|审计报告|科目余额", name_head):
            return "finance"
        return "spreadsheet"

    sample = f"{filename or ''}\n{(text or '')[:2500]}"
    if re.search(r"合同|协议书|补充协议|战略合作协议|框架协议|租赁协议|采购合同|委托协议|保密协议", sample) and (
        re.search(r"甲方|乙方|发包人|承包人|违约责任|争议解决|合同金额", sample) or "合同" in (filename or "") or "协议" in (filename or "")
    ):
        return "contract"

    if re.search(r"财务报告|审计报告|年度报告|半年度报告|季度报告|三季报|一季报|中报|年报|资产负债表|合并利润表|现金流量表|财务决算|全面预算报表", sample):
        return "finance"

    if re.search(r"管理办法|管理制度|实施细则|暂行办法|工作细则|管理规定|工作规则|章程|条例|准则|操作规程|指引手册|委员会成员的通知", sample) or (
        RE_DOCNO.search(sample) or re.search(r"第一条[\s　]|第一章[\s　]*总\s*则", sample)
    ):
        return "regulation"

    if ext in (".pptx", ".ppt") or re.search(r"可行性研究|可研报告|尽职调查|尽调报告|实施方案|调研报告|研究报告|建设方案|工作汇报|会议纪要|专项方案|评估报告", sample):
        return "report"

    if tables and len(tables) >= 2 and len((text or "").strip()) < 2500:
        return "spreadsheet"

    return "general"


def default_chunk_profile(doc_type: str, ext: str = "", n_chars: int = 0, has_articles: bool = False) -> str:
    ext = (ext or "").lower()
    if ext in IMAGE_EXTS or doc_type == "image":
        return "image"
    if ext in TABLE_EXTS or doc_type == "spreadsheet":
        return "table"
    if 0 < n_chars <= 1000 and ext not in TABLE_EXTS:
        return "one"
    if doc_type in ("regulation", "contract") or has_articles:
        return "laws"
    return DOC_TYPES.get(doc_type, {}).get("default_chunk", "report")


def enrich_from_text(doc: Doc) -> None:
    head = "\n".join(doc.pages[:3]) if doc.pages else ""
    ext = (doc.file_ext or os.path.splitext(doc.abs_path or doc.rel_path)[1]).lower()
    doc.file_ext = ext
    if not doc.project or (doc.project == "集团制度库" and doc.rel_path):
        proj, folder, dept_guess = parse_rel_hierarchy(doc.rel_path, doc.project or "集团制度库")
        if not doc.folder:
            doc.folder = folder
        if not doc.dept:
            doc.dept = dept_guess
        doc.project = proj

    if head:
        if not doc.doc_no:
            m = RE_DOCNO_TEXT.search(head)
            if m:
                doc.doc_no = f"{m.group(1)}〔{m.group(2)}〕{m.group(3)}号"
        if not doc.issued_date:
            m = RE_ISSUE_TEXT.search(head)
            if m:
                doc.issued_date = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

    if not doc.doc_type:
        doc.doc_type = guess_doc_type(doc.title or doc.rel_path, head, ext, doc.tables)
    doc.category = DOC_TYPES.get(doc.doc_type, {}).get("label", "通用文档")

    has_art = bool(re.search(r"(?:^|\n)[\s　]*第[一二三四五六七八九十百零\d]{1,5}条", head))
    total_chars = sum(len(p) for p in doc.pages)
    if not doc.chunk_profile or doc.chunk_profile == "auto":
        doc.chunk_profile = default_chunk_profile(doc.doc_type, ext, total_chars, has_art)

    meta = dict(doc.meta or {})
    if doc.doc_type == "regulation":
        meta.setdefault("dept", doc.dept or doc.folder or "综合")
        meta.setdefault("doc_no", doc.doc_no or "")
        meta.setdefault("issued_date", doc.issued_date or "")
        meta.setdefault("status", doc.status or "现行")
        if not meta.get("scope"):
            m_sc = re.search(r"适用于([^\n。；;]{4,45})", head)
            if m_sc:
                meta["scope"] = m_sc.group(1).strip()
    elif doc.doc_type == "finance":
        m_per = RE_PERIOD.search((doc.title or "") + " " + head[:1000])
        meta.setdefault("period", m_per.group(1).strip() if m_per else (doc.issued_date[:7] if doc.issued_date else ""))
        m_ent = re.search(r"([\u4e00-\u9fa5]{4,24}(?:集团|公司|有限合伙|企业))", (doc.title or "") + "\n" + head[:600])
        meta.setdefault("entity", m_ent.group(1) if m_ent else (doc.dept or ""))
        audit = "已审计" if "审计报告" in head[:1200] else ("合并口径" if "合并" in head[:1200] else "管理口径")
        meta.setdefault("audit_status", audit)
        meta.setdefault("currency", "人民币万元" if "万元" in head[:1500] else "人民币元")
        if not meta.get("metrics") and doc.tables:
            tnames = [t.get("title") or "" for t in doc.tables[:4] if t.get("title")]
            if tnames:
                meta["metrics"] = "、".join(tnames[:3])
    elif doc.doc_type == "contract":
        ma = RE_PARTY_A.search(head)
        mb = RE_PARTY_B.search(head)
        mam = RE_AMOUNT.search(head)
        meta.setdefault("party_a", ma.group(1).strip() if ma else "")
        meta.setdefault("party_b", mb.group(1).strip() if mb else "")
        meta.setdefault("amount", mam.group(1).strip() if mam else "")
        meta.setdefault("sign_date", doc.issued_date or "")
        meta.setdefault("contract_status", "履行中" if doc.status == "现行" else doc.status)
    elif doc.doc_type == "spreadsheet":
        sheet_names = [t.get("title") or f"表{i+1}" for i, t in enumerate(doc.tables)]
        total_rows = sum(len(t.get("rows") or []) for t in doc.tables)
        cols = []
        for t in doc.tables[:2]:
            for h in (t.get("headers") or [])[:6]:
                if h and h not in cols:
                    cols.append(h)
        meta.setdefault("sheets", "、".join(sheet_names[:5]) or "默认工作表")
        meta.setdefault("row_count", f"{total_rows} 行" if total_rows else f"{len(doc.pages)} 页")
        meta.setdefault("columns", " / ".join(cols[:6]))
        meta.setdefault("stat_period", doc.issued_date or "")
    elif doc.doc_type == "image":
        meta.setdefault("image_type", "图纸/图表" if "图" in (doc.title or "") else "图像文件")
        meta.setdefault("visual_summary", (head or doc.note or "")[:120].replace("\n", " "))
    elif doc.doc_type == "report":
        stage = "汇报演示" if ext in (".pptx", ".ppt") else ("会议纪要" if "纪要" in (doc.title or "") else "专题报告")
        meta.setdefault("stage", stage)
        meta.setdefault("author", doc.dept or doc.handler or "")
        meta.setdefault("issued_date", doc.issued_date or "")
        meta.setdefault("topic", doc.title or "")
    else:
        meta.setdefault("topic", doc.dept or "通用资料")
        meta.setdefault("author", doc.handler or doc.dept or "")
        meta.setdefault("issued_date", doc.issued_date or "")

    doc.meta = meta
    if not doc.summary:
        doc.summary = build_auto_summary(doc, head)


def build_auto_summary(doc: Doc, head: str = "") -> str:
    m = doc.meta or {}
    if doc.doc_type == "regulation":
        parts = [x for x in (m.get("doc_no"), m.get("dept"), m.get("scope")) if x]
        if parts:
            return " · ".join(parts)[:120]
    elif doc.doc_type == "finance":
        parts = [x for x in (m.get("entity"), m.get("period"), m.get("audit_status"), m.get("metrics")) if x]
        if parts:
            return " · ".join(parts)[:120]
    elif doc.doc_type == "contract":
        parts = [
            f"甲方:{m['party_a']}" if m.get("party_a") else "",
            f"乙方:{m['party_b']}" if m.get("party_b") else "",
            f"金额:{m['amount']}" if m.get("amount") else "",
        ]
        parts = [x for x in parts if x]
        if parts:
            return " · ".join(parts)[:120]
    elif doc.doc_type == "spreadsheet":
        parts = [
            f"工作表:{m['sheets']}" if m.get("sheets") else "",
            m.get("row_count") or "",
            f"字段:{m['columns']}" if m.get("columns") else "",
        ]
        parts = [x for x in parts if x]
        if parts:
            return " · ".join(parts)[:120]
    elif doc.doc_type == "image":
        if m.get("visual_summary"):
            return str(m["visual_summary"])[:120]

    lines = [ln.strip() for ln in (head or "").splitlines() if len(ln.strip()) >= 10 and not ln.strip().startswith(("#", "|", "---"))]
    if lines:
        return " ".join(lines[:2])[:110]
    return doc.title or os.path.basename(doc.rel_path)


def _sha256(path: str, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def _base_group(rel_path: str) -> str:
    d, name = os.path.split(rel_path)
    stem, ext = os.path.splitext(name)
    stem = re.sub(r"_可搜索(\(OCR\))?$", "", stem)
    stem = re.sub(r"\(OCR\)$", "", stem)
    stem = re.sub(r"\(\d\)$", "", stem)
    # 仅对 PDF/Word 同名版本去重，避免同名图片和表格被误合并
    grp_kind = "doc" if ext.lower() in (".pdf", ".doc", ".docx") else ext.lower()
    return os.path.join(d, f"{stem}::{grp_kind}").lower()


def _preference(rel_path: str) -> tuple:
    name = os.path.basename(rel_path)
    ext = os.path.splitext(name)[1].lower()
    score = 0
    if "可搜索" in name and "(OCR)" not in name:
        score += 100
    elif "可搜索" in name:
        score += 60
    if ext == ".docx":
        score += 90
    elif ext == ".doc":
        score += 80
    if "以此为准" in name:
        score += 30
    return (score, -len(name))


def scan(root: str) -> tuple[list[Doc], list[dict]]:
    groups: dict[str, list[tuple[str, str]]] = {}
    if not os.path.isdir(root):
        return [], []
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            if fn.startswith(("~$", ".")):
                continue
            ext = os.path.splitext(fn)[1].lower()
            if ext not in SUPPORTED_EXTS:
                continue
            abs_path = os.path.join(dirpath, fn)
            rel = os.path.relpath(abs_path, root)
            groups.setdefault(_base_group(rel), []).append((rel, abs_path))

    picked: list[tuple[str, str]] = []
    skipped: list[dict] = []
    for _key, items in groups.items():
        items.sort(key=lambda it: _preference(it[0]), reverse=True)
        best = items[0]
        picked.append(best)
        for rel, _abs in items[1:]:
            skipped.append({"path": rel, "reason": f"与 {os.path.basename(best[0])} 重复"})

    seen_hash: dict[str, str] = {}
    docs: list[Doc] = []
    for rel, abs_path in picked:
        try:
            h = _sha256(abs_path)
        except OSError as e:
            skipped.append({"path": rel, "reason": f"读取失败 {e}"})
            continue
        if h in seen_hash:
            skipped.append({"path": rel, "reason": f"内容与 {seen_hash[h]} 相同"})
            continue
        seen_hash[h] = rel

        project, folder, dept = parse_rel_hierarchy(rel)
        ext = os.path.splitext(rel)[1].lower()
        meta = parse_filename(os.path.basename(rel))
        d = Doc(
            key=rel,
            dept=dept,
            project=project,
            folder=folder,
            file_ext=ext,
            content_hash=h,
            rel_path=rel,
            abs_path=abs_path,
            category="文档",
            **{k: v for k, v in meta.items() if k in ("title", "doc_no", "issued_date", "handler", "status")},
        )
        docs.append(d)

    docs.sort(key=lambda d: (d.project, d.folder, d.dept, d.issued_date, d.title))
    return docs, skipped


def _dedupe_page_lines(text: str, thr: float = 0.86) -> str:
    import difflib

    def nm(s: str) -> str:
        return re.sub(r"\s+", "", s)

    kept: list[str] = []
    keptn: list[str] = []
    for line in text.splitlines():
        n = nm(line)
        if not n:
            continue
        dup = False
        if len(n) >= 8:
            for prev in keptn:
                if abs(len(prev) - len(n)) > max(6, len(n) * 0.3):
                    continue
                if difflib.SequenceMatcher(None, prev, n).ratio() >= thr:
                    dup = True
                    break
        if not dup:
            kept.append(line)
            keptn.append(n)
    return "\n".join(kept)


def format_markdown_table(headers: list[str], rows: list[list[str]], title: str = "") -> str:
    cols = max([len(headers)] + [len(r) for r in rows] + [1])
    if not headers:
        headers = [f"列{i+1}" for i in range(cols)]
    else:
        headers = [str(c or "").replace("\n", " ").replace("|", "｜").strip() for c in headers]
        if len(headers) < cols:
            headers.extend(f"列{i+1}" for i in range(len(headers), cols))
    lines: list[str] = []
    if title:
        lines.append(f"### 表格：{title}")
    lines.append("| " + " | ".join(headers[:cols]) + " |")
    lines.append("| " + " | ".join("---" for _ in range(cols)) + " |")
    for r in rows:
        cells = [str(c or "").replace("\n", " ").replace("|", "｜").strip() for c in r]
        if not any(cells):
            continue
        if len(cells) < cols:
            cells.extend("" for _ in range(cols - len(cells)))
        lines.append("| " + " | ".join(cells[:cols]) + " |")
    return "\n".join(lines)


def _html_table_to_struct(raw_html: str, page_no: int = 1, title: str = "") -> dict | None:
    if "<table" not in (raw_html or "").lower():
        return None
    row_matches = re.findall(r"<tr[^>]*>(.*?)</tr>", raw_html, flags=re.I | re.S)
    if not row_matches:
        return None
    all_rows: list[list[str]] = []
    for rm in row_matches:
        cells = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", rm, flags=re.I | re.S)
        cleaned = [
            html.unescape(re.sub(r"<[^>]+>", " ", c)).strip()
            for c in cells
        ]
        cleaned = [re.sub(r"\s+", " ", c) for c in cleaned]
        if any(cleaned):
            all_rows.append(cleaned)
    if not all_rows:
        return None
    headers = all_rows[0]
    body = all_rows[1:] if len(all_rows) > 1 else []
    md = format_markdown_table(headers, body, title=title)
    return {
        "page": page_no,
        "title": title or f"第{page_no}页表格",
        "headers": headers,
        "rows": body,
        "markdown": md,
    }


def read_pdf_pages(
    path: str,
    out_tables: list[dict] | None = None,
    out_page_blocks: dict[int, list[str]] | None = None,
    out_bboxes: dict[tuple[int, int], list[float]] | None = None,
) -> list[str]:
    import pymupdf

    pages: list[str] = []
    with pymupdf.open(path) as doc:
        for pno, p in enumerate(doc, start=1):
            txt = _dedupe_page_lines(p.get_text())
            if out_page_blocks is not None and out_bboxes is not None:
                try:
                    raw_blocks = p.get_text("blocks") or []
                    b_texts: list[str] = []
                    for rb in raw_blocks:
                        if len(rb) >= 7 and rb[6] != 0:
                            continue
                        b_clean = _dedupe_page_lines(str(rb[4] or "")).strip()
                        if not b_clean:
                            continue
                        bi = len(b_texts)
                        b_texts.append(b_clean)
                        out_bboxes[(pno, bi)] = [
                            round(float(rb[0]), 2),
                            round(float(rb[1]), 2),
                            round(float(rb[2]), 2),
                            round(float(rb[3]), 2),
                        ]
                    if b_texts:
                        out_page_blocks[pno] = b_texts
                except Exception:
                    pass
            if out_tables is not None and hasattr(p, "find_tables"):
                try:
                    tf = p.find_tables()
                    for ti, tbl in enumerate(getattr(tf, "tables", []) or [], start=1):
                        extracted = tbl.extract()
                        if not extracted or len(extracted) < 2:
                            continue
                        cleaned_rows = [
                            [re.sub(r"\s+", " ", str(c or "")).strip() for c in r]
                            for r in extracted
                        ]
                        cleaned_rows = [r for r in cleaned_rows if any(r)]
                        if len(cleaned_rows) >= 2:
                            headers = cleaned_rows[0]
                            rows = cleaned_rows[1:]
                            t_title = f"第{pno}页表{ti}"
                            md = format_markdown_table(headers, rows, title=t_title)
                            out_tables.append({
                                "page": pno,
                                "title": t_title,
                                "headers": headers,
                                "rows": rows,
                                "markdown": md,
                            })
                except Exception:
                    pass
            pages.append(txt)
    return pages


def read_docx_pages(path: str, out_tables: list[dict] | None = None) -> list[str]:
    import docx as python_docx
    from docx.oxml.table import CT_Tbl
    from docx.oxml.text.paragraph import CT_P
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    d = python_docx.Document(path)
    parts: list[str] = []
    tbl_idx = 0

    for child in d.element.body.iterchildren():
        if isinstance(child, CT_P):
            p = Paragraph(child, d)
            t = (p.text or "").strip()
            if not t:
                continue
            style_name = (getattr(p.style, "name", "") or "").lower()
            if "heading 1" in style_name or "标题 1" in style_name:
                parts.append(f"# {t}")
            elif "heading 2" in style_name or "标题 2" in style_name:
                parts.append(f"## {t}")
            elif "heading 3" in style_name or "标题 3" in style_name:
                parts.append(f"### {t}")
            else:
                parts.append(t)
        elif isinstance(child, CT_Tbl):
            tbl = Table(child, d)
            raw_rows: list[list[str]] = []
            for row in tbl.rows:
                cells = [re.sub(r"\s+", " ", c.text.strip()) for c in row.cells]
                # 消除相邻完全相同的合并单元格重复噪音
                dedup_cells: list[str] = []
                for c in cells:
                    if dedup_cells and c and c == dedup_cells[-1] and len(c) > 12:
                        dedup_cells.append("")
                    else:
                        dedup_cells.append(c)
                if any(dedup_cells):
                    raw_rows.append(dedup_cells)
            if raw_rows:
                tbl_idx += 1
                headers = raw_rows[0]
                body = raw_rows[1:] if len(raw_rows) > 1 else []
                t_title = f"表{tbl_idx}"
                md = format_markdown_table(headers, body, title=t_title)
                parts.append(md)
                if out_tables is not None:
                    out_tables.append({
                        "page": max(1, len(parts) // 18 + 1),
                        "title": t_title,
                        "headers": headers,
                        "rows": body,
                        "markdown": md,
                    })

    text = "\n".join(x for x in parts if x is not None)
    lines = text.splitlines()
    pages, buf, size = [], [], 0
    for ln in lines:
        buf.append(ln)
        size += len(ln)
        if size >= 1400:
            pages.append("\n".join(buf))
            buf, size = [], 0
    if buf:
        pages.append("\n".join(buf))
    return pages or ([text] if text else [])


def read_doc_pages(path: str, out_tables: list[dict] | None = None) -> list[str]:
    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    tmp_dir = os.path.join(os.environ.get("TEMP", "."), "o2_doc2x")
    os.makedirs(tmp_dir, exist_ok=True)
    out = os.path.join(tmp_dir, hashlib.md5(path.encode("utf-8")).hexdigest() + ".docx")
    word = None
    doc = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc = word.Documents.Open(os.path.abspath(path), ReadOnly=True)
        doc.SaveAs2(out, FileFormat=16)
    finally:
        if doc is not None:
            try:
                doc.Close(False)
            except Exception:
                pass
        if word is not None:
            try:
                word.Quit()
            except Exception:
                pass
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass
    return read_docx_pages(out, out_tables=out_tables)


def read_pptx_pages(path: str, out_tables: list[dict] | None = None) -> list[str]:
    pages: list[str] = []
    with zipfile.ZipFile(path) as z:
        slide_files = sorted(
            [n for n in z.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)],
            key=lambda x: int(re.search(r"(\d+)\.xml$", x).group(1)),
        )
        for pno, sf in enumerate(slide_files, start=1):
            root = ET.fromstring(z.read(sf))
            slide_lines: list[str] = [f"## 第 {pno} 页幻灯片"]
            # 抽取形状段落文本
            for sp in root.iter():
                if _local(sp.tag) == "txBody":
                    paras: list[str] = []
                    for p in sp:
                        if _local(p.tag) != "p":
                            continue
                        runs = [t.text or "" for t in p.iter() if _local(t.tag) == "t"]
                        line = "".join(runs).strip()
                        if line:
                            paras.append(line)
                    if paras:
                        slide_lines.extend(paras)
                elif _local(sp.tag) == "tbl":
                    t_rows: list[list[str]] = []
                    for tr in sp:
                        if _local(tr.tag) != "tr":
                            continue
                        row_cells: list[str] = []
                        for tc in tr:
                            if _local(tc.tag) != "tc":
                                continue
                            cell_txt = "".join(t.text or "" for t in tc.iter() if _local(t.tag) == "t").strip()
                            row_cells.append(re.sub(r"\s+", " ", cell_txt))
                        if any(row_cells):
                            t_rows.append(row_cells)
                    if t_rows:
                        headers = t_rows[0]
                        body = t_rows[1:] if len(t_rows) > 1 else []
                        t_title = f"幻灯片{pno}表格"
                        md = format_markdown_table(headers, body, title=t_title)
                        slide_lines.append(md)
                        if out_tables is not None:
                            out_tables.append({
                                "page": pno,
                                "title": t_title,
                                "headers": headers,
                                "rows": body,
                                "markdown": md,
                            })
            pages.append("\n".join(slide_lines))
    return pages


def _xlsx_strings(z: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    out: list[str] = []
    for si in root:
        if _local(si.tag) != "si":
            continue
        parts = [t.text or "" for t in si.iter() if _local(t.tag) == "t"]
        out.append("".join(parts))
    return out


def _xlsx_sheets(z: zipfile.ZipFile) -> list[tuple[str, str]]:
    if "xl/workbook.xml" not in z.namelist():
        return []
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels: dict[str, str] = {}
    rel_path = "xl/_rels/workbook.xml.rels"
    if rel_path in z.namelist():
        rroot = ET.fromstring(z.read(rel_path))
        for rel in rroot:
            if _local(rel.tag) != "Relationship":
                continue
            rid = rel.get("Id") or ""
            target = (rel.get("Target") or "").replace("\\", "/")
            if rid and target:
                if not target.startswith("xl/"):
                    target = "xl/" + target.lstrip("/")
                rels[rid] = target
    sheets: list[tuple[str, str]] = []
    for el in wb.iter():
        if _local(el.tag) != "sheet":
            continue
        name = el.get("name") or "Sheet"
        rid = (
            el.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            or el.get("id")
            or ""
        )
        target = rels.get(rid) or ""
        if not target:
            sid = el.get("sheetId") or str(len(sheets) + 1)
            target = f"xl/worksheets/sheet{sid}.xml"
        sheets.append((name, target))
    return sheets


def _col_index(cell_ref: str) -> int:
    m = re.match(r"([A-Z]+)", (cell_ref or "").upper())
    if not m:
        return -1
    idx = 0
    for ch in m.group(1):
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def _xlsx_cell(c: ET.Element, strings: list[str]) -> str:
    kind = c.get("t") or ""
    if kind == "s":
        v = None
        for child in c:
            if _local(child.tag) == "v":
                v = child.text
                break
        try:
            return strings[int(v or 0)]
        except (ValueError, IndexError):
            return v or ""
    if kind == "inlineStr":
        return "".join(t.text or "" for t in c.iter() if _local(t.tag) == "t")
    if kind == "b":
        v = ""
        for child in c:
            if _local(child.tag) == "v":
                v = child.text or ""
        return "TRUE" if v in ("1", "true", "TRUE") else "FALSE"
    for child in c:
        if _local(child.tag) == "v":
            val = (child.text or "").strip()
            if re.fullmatch(r"-?\d+\.\d{5,}", val):
                try:
                    return f"{float(val):.4f}".rstrip("0").rstrip(".")
                except ValueError:
                    pass
            return val
    return ""


def _pick_header_and_rows(raw_rows: list[list[str]]) -> tuple[list[str], list[list[str]], str]:
    if not raw_rows:
        return [], [], ""
    title_banner = ""
    start_idx = 0
    # 若首行只有1个非空单元格而后续行有多列，则首行通常是报表大标题
    non_empty_0 = [c for c in raw_rows[0] if c.strip()]
    if len(raw_rows) >= 2 and len(non_empty_0) == 1 and sum(1 for c in raw_rows[1] if c.strip()) >= 2:
        title_banner = non_empty_0[0].strip()
        start_idx = 1
    headers = [c.strip() for c in raw_rows[start_idx]]
    body = raw_rows[start_idx + 1:]
    return headers, body, title_banner


def read_xlsx_pages(path: str, out_tables: list[dict] | None = None) -> list[str]:
    pages: list[str] = []
    with zipfile.ZipFile(path) as z:
        strings = _xlsx_strings(z)
        sheets = _xlsx_sheets(z)
        if not sheets:
            names = [n for n in z.namelist() if n.startswith("xl/worksheets/sheet")]
            sheets = [(os.path.basename(n), n) for n in names]
        for pno, (name, target) in enumerate(sheets[:30], start=1):
            if target not in z.namelist():
                continue
            root = ET.fromstring(z.read(target))
            raw_rows: list[list[str]] = []
            max_cols = 0
            for row in root.iter():
                if _local(row.tag) != "row":
                    continue
                if len(raw_rows) >= 3000:
                    break
                c_elems = [c for c in row if _local(c.tag) == "c"]
                if not c_elems:
                    continue
                row_map: dict[int, str] = {}
                cur_col = 0
                for c in c_elems:
                    ci = _col_index(c.get("r") or "")
                    if ci < 0:
                        ci = cur_col
                    cur_col = ci + 1
                    val = _xlsx_cell(c, strings).strip()
                    if val:
                        row_map[ci] = val
                if row_map:
                    hi = min(max(row_map) + 1, 64)
                    max_cols = max(max_cols, hi)
                    raw_rows.append([row_map.get(i, "") for i in range(hi)])
            if not raw_rows:
                continue
            for r in raw_rows:
                if len(r) < max_cols:
                    r.extend("" for _ in range(max_cols - len(r)))
            headers, body, banner = _pick_header_and_rows(raw_rows)
            sheet_title = f"{name}（{banner}）" if banner and banner != name else name
            md = format_markdown_table(headers, body[:200], title=sheet_title)
            pages.append(md)
            if out_tables is not None:
                out_tables.append({
                    "page": pno,
                    "title": sheet_title,
                    "headers": headers,
                    "rows": body,
                    "markdown": md,
                })
    return pages


def read_csv_pages(path: str, out_tables: list[dict] | None = None) -> list[str]:
    with open(path, "rb") as f:
        text = _decode_bytes(f.read())
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
    except csv.Error:
        dialect = csv.excel
    raw_rows: list[list[str]] = []
    for i, row in enumerate(csv.reader(io.StringIO(text), dialect)):
        if i >= 4000:
            break
        cells = [str(c).strip() for c in row]
        if any(cells):
            raw_rows.append(cells)
    if not raw_rows:
        return []
    headers, body, banner = _pick_header_and_rows(raw_rows)
    title = banner or os.path.splitext(os.path.basename(path))[0]
    md = format_markdown_table(headers, body[:250], title=title)
    if out_tables is not None:
        out_tables.append({
            "page": 1,
            "title": title,
            "headers": headers,
            "rows": body,
            "markdown": md,
        })
    return [md]


def read_text_pages(path: str) -> list[str]:
    ext = os.path.splitext(path)[1].lower()
    with open(path, "rb") as f:
        text = _decode_bytes(f.read())
    if ext == ".json":
        try:
            obj = json.loads(text)
            text = json.dumps(obj, ensure_ascii=False, indent=2)
        except ValueError:
            pass
    lines = text.splitlines()
    pages, buf, size = [], [], 0
    for ln in lines:
        buf.append(ln)
        size += len(ln)
        if size >= 1600:
            pages.append("\n".join(buf))
            buf, size = [], 0
    if buf:
        pages.append("\n".join(buf))
    return pages or ([text] if text.strip() else [])


def read_image_info(path: str) -> tuple[str, dict]:
    ext = os.path.splitext(path)[1].lower()
    meta: dict = {"format": ext.lstrip(".").upper()}
    if ext == ".svg":
        with open(path, "rb") as f:
            raw = _decode_bytes(f.read())
        texts = [
            re.sub(r"\s+", " ", html.unescape(t)).strip()
            for t in re.findall(r"<text[^>]*>(.*?)</text>", raw, flags=re.I | re.S)
        ]
        texts = [t for t in texts if t]
        meta["dimensions"] = "SVG 矢量图"
        body = f"SVG 矢量图：{os.path.basename(path)}\n" + ("\n".join(texts) if texts else "")
        return body, meta
    try:
        from PIL import Image
        with Image.open(path) as im:
            w, h = im.size
            meta["dimensions"] = f"{w}×{h}"
            meta["mode"] = im.mode
    except Exception:
        meta["dimensions"] = ""
    return f"图像文件：{os.path.basename(path)} ({meta.get('dimensions') or meta['format']})", meta


def extract_text(doc: Doc) -> None:
    ext = os.path.splitext(doc.abs_path)[1].lower()
    doc.file_ext = ext
    doc.tables = []
    try:
        if ext == ".pdf":
            doc.pages = read_pdf_pages(
                doc.abs_path,
                out_tables=doc.tables,
                out_page_blocks=doc.page_blocks,
                out_bboxes=doc.bboxes,
            )
            doc.text_source = "pdf-layer"
        elif ext == ".docx":
            doc.pages = read_docx_pages(doc.abs_path, out_tables=doc.tables)
            doc.text_source = "docx"
        elif ext == ".doc":
            doc.pages = read_doc_pages(doc.abs_path, out_tables=doc.tables)
            doc.text_source = "doc"
        elif ext == ".pptx":
            doc.pages = read_pptx_pages(doc.abs_path, out_tables=doc.tables)
            doc.text_source = "pptx"
        elif ext in (".xlsx", ".xls"):
            doc.pages = read_xlsx_pages(doc.abs_path, out_tables=doc.tables)
            doc.text_source = "xlsx"
        elif ext in (".csv", ".tsv"):
            doc.pages = read_csv_pages(doc.abs_path, out_tables=doc.tables)
            doc.text_source = "csv"
        elif ext in TEXT_EXTS:
            doc.pages = read_text_pages(doc.abs_path)
            doc.text_source = ext.lstrip(".")
        elif ext in IMAGE_EXTS:
            desc, img_meta = read_image_info(doc.abs_path)
            doc.pages = [desc]
            doc.meta.update(img_meta)
            doc.text_source = "image-meta"
            doc.doc_type = "image"
    except Exception as e:
        doc.pages = []
        doc.note = f"抽取失败: {e}"
    total = sum(len(p.strip()) for p in doc.pages)
    if ext in IMAGE_EXTS:
        doc.has_text = total >= 4
    elif ext == ".pdf":
        n_pages = max(1, len(doc.pages))
        rich_pages = sum(1 for p in doc.pages if len(p.strip()) >= 28)
        doc.has_text = bool(doc.tables) or (
            total >= 24 and (rich_pages >= max(1, n_pages // 3) or (total / n_pages) >= 35)
        )
    else:
        doc.has_text = total >= 12 or bool(doc.tables)
    if not doc.has_text:
        doc.note = doc.note or "无文本层，需 OCR"


def _image_file_to_temp_pdf(img_path: str) -> str:
    import tempfile
    from PIL import Image

    fd, out_pdf = tempfile.mkstemp(prefix="o2img-", suffix=".pdf")
    os.close(fd)
    with Image.open(img_path) as im:
        if im.mode != "RGB":
            im = im.convert("RGB")
        im.save(out_pdf, "PDF")
    return out_pdf


def run_cloud_ocr(doc: Doc, token: str, cache_dir: str, force: bool = False,
                  on_progress=None) -> bool:
    if not token:
        return False
    ext = os.path.splitext(doc.abs_path)[1].lower()
    if ext not in (".pdf", *IMAGE_EXTS):
        return False
    import ocr_cloud

    target_pdf = doc.abs_path
    temp_pdf = ""
    try:
        if ext in IMAGE_EXTS and ext != ".svg":
            temp_pdf = _image_file_to_temp_pdf(doc.abs_path)
            target_pdf = temp_pdf
        ocr_cloud.ocr_cached(target_pdf, token, cache_dir, force=force,
                             on_progress=on_progress, cache_key_path=doc.abs_path)
    except TypeError:
        try:
            ocr_cloud.ocr_cached(target_pdf, token, cache_dir, force=force,
                                 on_progress=on_progress)
        except Exception as e:
            doc.note = f"OCR失败: {e}"
            return False
    except Exception as e:
        doc.note = f"OCR失败: {e}"
        return False
    finally:
        if temp_pdf and os.path.exists(temp_pdf):
            try:
                os.remove(temp_pdf)
            except OSError:
                pass
    return apply_cloud_ocr(doc, cache_dir)


def apply_cloud_ocr(doc: Doc, cache_dir: str) -> bool:
    import ocr_cloud

    cp = os.path.join(cache_dir, f"{ocr_cloud._file_hash(doc.abs_path)}.json")
    if not os.path.exists(cp):
        return False
    try:
        with open(cp, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return False

    pages: list[str] = []
    pblocks: dict[int, list[str]] = {}
    bboxes: dict[tuple[int, int], list[float]] = {}
    blabels: dict[tuple[int, int], str] = {}
    ocr_tables: list[dict] = []

    for p in data.get("pages", []):
        pno = p["index"] + 1
        blocks = p.get("blocks") or []
        texts = [b["text"] for b in blocks]
        pblocks[pno] = texts
        for bi, b in enumerate(blocks):
            bboxes[(pno, bi)] = b["bbox"]
            lbl = (b.get("label") or "").lower()
            blabels[(pno, bi)] = lbl
            if "table" in lbl or "<table" in (b.get("text") or "").lower():
                t_struct = _html_table_to_struct(b.get("text") or "", page_no=pno, title=f"第{pno}页表格")
                if t_struct:
                    ocr_tables.append(t_struct)
                    texts[bi] = t_struct["markdown"]
        pages.append("\n".join(texts) if texts else (p.get("markdown") or ""))

    if not any(x.strip() for x in pages):
        return False

    doc.pages = pages
    doc.page_blocks = pblocks
    doc.bboxes = bboxes
    doc.block_labels = blabels
    if ocr_tables:
        doc.tables = ocr_tables
    doc.text_source = "paddleocr-vl"
    doc.has_text = True
    doc.note = ""
    return True


if __name__ == "__main__":
    import sys
    root = sys.argv[1] if len(sys.argv) > 1 else "./docs"
    docs, skipped = scan(root)
    print(f"去重后 {len(docs)} 份，跳过 {len(skipped)} 个重复件")
    for d in docs:
        extract_text(d)
        enrich_from_text(d)
    for d in docs:
        flag = "" if d.has_text else "  <<< 无文本"
        print(f"[{d.project}/{d.folder}] ({d.doc_type}) {d.issued_date:<10} {(d.title or d.rel_path)[:34]:<36}{flag}")
