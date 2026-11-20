from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass, field

RE_DOCNO = re.compile(
    r"[（(]?\s*([\u4e00-\u9fa5]{2,12})\s*[〔【﹝\[（(]\s*(\d{4})\s*[〕】﹞\]）)]\s*(\d+)\s*号\s*[）)]?"
)
RE_DATE = re.compile(r"(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)")
RE_TITLE = re.compile(r"《([^》]{2,80})》")
RE_TITLE_ALT = re.compile(
    r"关于(?:印发|印发实施|修订印发)?(.{2,60}?)(?:的通知|的批复|\.pdf|\.docx?|\.PDF)$"
)

STATUS_PATTERNS = [
    (re.compile(r"^已被修改[-—]?"), "已废止"),
    (re.compile(r"以此为准"), "现行"),
    (re.compile(r"\(试行\)|（试行）|暂行"), "试行"),
]


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
    pages: list[str] = field(default_factory=list)
    page_blocks: dict[int, list[str]] = field(default_factory=dict)
    bboxes: dict[tuple[int, int], list[float]] = field(default_factory=dict)
    has_text: bool = False
    text_source: str = ""
    note: str = ""


def _clean(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def parse_filename(name: str) -> dict:
    stem = os.path.splitext(name)[0]
    stem_work = re.sub(r"_(可搜索|已搜索)(\(OCR\))?$", "", stem)
    stem_work = re.sub(r"\(\d\)$", "", stem_work)

    meta = {"title": "", "doc_no": "", "issued_date": "", "handler": "", "status": "现行"}

    m = RE_DOCNO.search(stem_work)
    if m:
        prefix, year, num = m.group(1), m.group(2), m.group(3)
        meta["doc_no"] = f"{prefix}〔{year}〕{num}号"

    m = RE_DATE.search(stem_work)
    if m:
        meta["issued_date"] = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
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

    for pat, label in STATUS_PATTERNS:
        if pat.search(stem_work):
            meta["status"] = label
            break

    return meta


RE_DOCNO_TEXT = re.compile(
    r"([\u4e00-\u9fa5]{2,12})\s*[〔【﹝\[（(]\s*(\d{4})\s*[〕】﹞\]）)]\s*(\d+)\s*号"
)
RE_ISSUE_TEXT = re.compile(r"(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")


def enrich_from_text(doc: "Doc") -> None:
    head = "\n".join(doc.pages[:2]) if doc.pages else ""
    if not head:
        return
    if not doc.doc_no:
        m = RE_DOCNO_TEXT.search(head)
        if m:
            doc.doc_no = f"{m.group(1)}〔{m.group(2)}〕{m.group(3)}号"
    if not doc.issued_date:
        m = RE_ISSUE_TEXT.search(head)
        if m:
            doc.issued_date = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


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
    stem = os.path.splitext(name)[0]
    stem = re.sub(r"_可搜索(\(OCR\))?$", "", stem)
    stem = re.sub(r"\(OCR\)$", "", stem)
    stem = re.sub(r"\(\d\)$", "", stem)
    return os.path.join(d, stem).lower()


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
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            if fn.startswith("~$"):
                continue
            ext = os.path.splitext(fn)[1].lower()
            if ext not in (".pdf", ".doc", ".docx"):
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

        dept = rel.split(os.sep)[0] if os.sep in rel else "其他"
        meta = parse_filename(os.path.basename(rel))
        d = Doc(
            key=rel,
            dept=dept,
            rel_path=rel,
            abs_path=abs_path,
            category="文档",
            **{k: v for k, v in meta.items() if k in ("title", "doc_no", "issued_date", "handler", "status")},
        )
        docs.append(d)

    docs.sort(key=lambda d: (d.dept, d.issued_date, d.title))
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


def read_pdf_pages(path: str) -> list[str]:
    import pymupdf

    with pymupdf.open(path) as doc:
        return [_dedupe_page_lines(p.get_text()) for p in doc]


def read_docx_pages(path: str) -> list[str]:
    import docx as python_docx

    d = python_docx.Document(path)
    parts: list[str] = [p.text for p in d.paragraphs]
    for tbl in d.tables:
        for row in tbl.rows:
            cells = [c.text.strip() for c in row.cells]
            if any(cells):
                parts.append(" | ".join(cells))
    text = "\n".join(x for x in parts if x is not None)
    lines = text.splitlines()
    pages, buf, size = [], [], 0
    for ln in lines:
        buf.append(ln)
        size += len(ln)
        if size >= 1200:
            pages.append("\n".join(buf))
            buf, size = [], 0
    if buf:
        pages.append("\n".join(buf))
    return pages or [text]


def read_doc_pages(path: str) -> list[str]:
    import win32com.client

    tmp_dir = os.path.join(os.environ.get("TEMP", "."), "o2_doc2x")
    os.makedirs(tmp_dir, exist_ok=True)
    out = os.path.join(tmp_dir, hashlib.md5(path.encode("utf-8")).hexdigest() + ".docx")
    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    try:
        doc = word.Documents.Open(os.path.abspath(path), ReadOnly=True)
        doc.SaveAs2(out, FileFormat=16)
        doc.Close(False)
    finally:
        word.Quit()
    return read_docx_pages(out)


def extract_text(doc: Doc) -> None:
    ext = os.path.splitext(doc.abs_path)[1].lower()
    try:
        if ext == ".pdf":
            doc.pages = read_pdf_pages(doc.abs_path)
            doc.text_source = "pdf-layer"
        elif ext == ".docx":
            doc.pages = read_docx_pages(doc.abs_path)
            doc.text_source = "docx"
        elif ext == ".doc":
            doc.pages = read_doc_pages(doc.abs_path)
            doc.text_source = "doc"
    except Exception as e:
        doc.pages = []
        doc.note = f"抽取失败: {e}"
    total = sum(len(p.strip()) for p in doc.pages)
    doc.has_text = total >= 20
    if not doc.has_text:
        doc.note = doc.note or "无文本层，需 OCR"


def run_cloud_ocr(doc: Doc, token: str, cache_dir: str, force: bool = False,
                  on_progress=None) -> bool:
    if not token or not doc.abs_path.lower().endswith(".pdf"):
        return False
    import ocr_cloud

    try:
        ocr_cloud.ocr_cached(doc.abs_path, token, cache_dir, force=force,
                             on_progress=on_progress)
    except Exception as e:
        doc.note = f"OCR失败: {e}"
        return False
    return apply_cloud_ocr(doc, cache_dir)


def apply_cloud_ocr(doc: Doc, cache_dir: str) -> bool:
    import json
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
    for p in data.get("pages", []):
        pno = p["index"] + 1
        blocks = p.get("blocks") or []
        texts = [b["text"] for b in blocks]
        pblocks[pno] = texts
        for bi, b in enumerate(blocks):
            bboxes[(pno, bi)] = b["bbox"]
        pages.append("\n".join(texts) if texts else (p.get("markdown") or ""))

    if not any(x.strip() for x in pages):
        return False

    doc.pages = pages
    doc.page_blocks = pblocks
    doc.bboxes = bboxes
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
        print(f"{d.dept:<6} {d.issued_date:<10} {d.doc_no:<22} {(d.title or d.rel_path)[:34]:<36}{flag}")
