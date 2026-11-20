from __future__ import annotations

import base64
import csv
import io
import os
import re
import tempfile
import zipfile
import xml.etree.ElementTree as ET

import extract as ex

ALLOWED_EXT = {".xlsx", ".csv", ".pdf", ".doc", ".docx"}
TEXT_EXT = {".md", ".markdown", ".json", ".txt"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".svg", ".webp", ".heif", ".heic"}
MAX_BYTES = 30 * 1024 * 1024
VISION_MAX_SIDE = 1568
VISION_MAX_BYTES = 4 * 1024 * 1024
MAX_CHARS = 80_000
MAX_XLSX_ROWS = 2000
MAX_XLSX_SHEETS = 20
MAX_CSV_ROWS = 3000

SSML = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if tag else ""


def _cap(text: str, limit: int = MAX_CHARS) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "\n…（已截断）"


def _safe_name(name: str) -> str:
    name = os.path.basename(name or "")
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    return name[:120] or "附件"


def _decode_text(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "gb18030", "gbk"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", "replace")


def read_csv(data: bytes) -> str:
    text = _decode_text(data)
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
    except csv.Error:
        dialect = csv.excel
    rows = []
    reader = csv.reader(io.StringIO(text), dialect)
    for i, row in enumerate(reader):
        if i >= MAX_CSV_ROWS:
            rows.append("…")
            break
        cells = [str(c).strip() for c in row]
        if any(cells):
            rows.append("\t".join(cells))
    return "\n".join(rows)


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
        rid = el.get(REL_ID) or el.get("id") or ""
        target = rels.get(rid) or ""
        if not target:
            sid = el.get("sheetId") or str(len(sheets) + 1)
            target = f"xl/worksheets/sheet{sid}.xml"
        sheets.append((name, target))
    return sheets


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
            return (child.text or "").strip()
    return ""


def read_xlsx(path: str) -> str:
    parts: list[str] = []
    with zipfile.ZipFile(path) as z:
        strings = _xlsx_strings(z)
        sheets = _xlsx_sheets(z)
        if not sheets:
            names = [n for n in z.namelist() if n.startswith("xl/worksheets/sheet")]
            sheets = [(os.path.basename(n), n) for n in names]
        for name, target in sheets[:MAX_XLSX_SHEETS]:
            if target not in z.namelist():
                continue
            root = ET.fromstring(z.read(target))
            rows: list[str] = []
            for row in root.iter():
                if _local(row.tag) != "row":
                    continue
                if len(rows) >= MAX_XLSX_ROWS:
                    rows.append("…")
                    break
                cells = [_xlsx_cell(c, strings) for c in row if _local(c.tag) == "c"]
                if any(x.strip() for x in cells):
                    rows.append("\t".join(cells))
            if rows:
                parts.append(f"## {name}\n" + "\n".join(rows))
    return "\n\n".join(parts)


def _word_save_as(src: str, dst: str, fmt: int) -> None:
    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    word = None
    doc = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc = word.Documents.Open(os.path.abspath(src), ReadOnly=True)
        doc.SaveAs2(os.path.abspath(dst), FileFormat=fmt)
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


def _word_to_pdf(src: str, dst: str) -> None:
    _word_save_as(src, dst, 17)  # wdFormatPDF


def _try_heif() -> None:
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except Exception:
        pass


def _pil_to_jpeg(im) -> bytes:
    from PIL import Image

    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > VISION_MAX_SIDE:
        im.thumbnail((VISION_MAX_SIDE, VISION_MAX_SIDE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue()


def _via_pil(data: bytes):
    from PIL import Image

    _try_heif()
    im = Image.open(io.BytesIO(data))
    im.load()
    return _pil_to_jpeg(im)


def _via_fitz(data: bytes, ext: str) -> bytes:
    import pymupdf

    kind = (ext or "").lstrip(".").lower()
    if kind in ("jpg", "jpeg", "jpe"):
        kind = "jpeg"
    elif kind == "tif":
        kind = "tiff"
    elif kind == "heic":
        kind = "heif"
    doc = pymupdf.open(stream=data, filetype=kind or None)
    try:
        page = doc[0]
        pix = page.get_pixmap(dpi=144)
        raw = pix.tobytes("jpeg")
    finally:
        doc.close()
    from PIL import Image

    return _pil_to_jpeg(Image.open(io.BytesIO(raw)))


def to_vision_jpeg(data: bytes, ext: str) -> tuple[bytes, str]:
    last = None
    for opener in (_via_pil, lambda blob: _via_fitz(blob, ext)):
        try:
            jpeg = opener(data)
            if jpeg:
                return jpeg, "image/jpeg"
        except Exception as e:  # noqa: BLE001
            last = e
    raise ValueError(f"图片无法处理：{last or '不支持该格式'}")


def _image_to_pdf(data: bytes, dest: str, ext: str) -> None:
    jpeg, _mime = to_vision_jpeg(data, ext)
    from PIL import Image

    im = Image.open(io.BytesIO(jpeg))
    if im.mode != "RGB":
        im = im.convert("RGB")
    im.save(dest, "PDF")


def _ocr_pdf(cfg, work_dir: str, pdf_path: str, on_progress=None) -> str:
    token = (cfg.data.get("paddle_token") or "").strip()
    if not token:
        raise ValueError("扫描件需要先在设置中填入 PaddleOCR Token")
    d = ex.Doc(key="att", dept="", rel_path=os.path.basename(pdf_path), abs_path=pdf_path)
    cache = os.path.join(work_dir, "ocr_cloud")

    def hook(done: int, total: int, stage: str = "ocr") -> None:
        if not on_progress:
            return
        total = max(int(total or 0), 1)
        done = int(done or 0)
        if stage == "cache":
            on_progress(90, "命中识别缓存")
            return
        pct = 15 + int(done / total * 80)
        if done <= 0:
            on_progress(15, f"识别 0/{total}")
        else:
            on_progress(min(pct, 95), f"识别 {done}/{total}")

    if not ex.run_cloud_ocr(d, token, cache, on_progress=hook):
        raise ValueError(d.note or "PaddleOCR 识别失败")
    return "\n\n".join(d.pages)


def _from_pages(doc: ex.Doc) -> str:
    return "\n\n".join(p for p in (doc.pages or []) if (p or "").strip())


def parse_file(cfg, work_dir: str, filename: str, data: bytes, on_progress=None,
               vision: bool = False) -> dict:
    def prog(percent: int, message: str = "") -> None:
        if on_progress:
            on_progress({"percent": max(0, min(100, int(percent))), "message": message})

    if not data:
        raise ValueError("文件为空")
    if len(data) > MAX_BYTES:
        raise ValueError("附件超过 30MB")
    name = _safe_name(filename)
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXT and ext not in TEXT_EXT and ext not in IMAGE_EXT:
        raise ValueError("仅支持 xlsx / csv / pdf / doc / docx / md / json / txt / jpg / png / tiff / svg / webp / heif")

    os.makedirs(work_dir, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="att-", dir=work_dir)
    path = os.path.join(tmp, name)
    try:
        with open(path, "wb") as f:
            f.write(data)

        if ext in IMAGE_EXT:
            prog(20, "处理图片")
            if vision:
                jpeg, mime = to_vision_jpeg(data, ext)
                prog(100)
                return {
                    "name": name,
                    "kind": "image",
                    "source": "image",
                    "mime": mime,
                    "data": base64.b64encode(jpeg).decode("ascii"),
                    "chars": 0,
                    "text": "",
                }
            pdf_path = os.path.join(tmp, os.path.splitext(name)[0] + ".pdf")
            _image_to_pdf(data, pdf_path, ext)
            text = _ocr_pdf(cfg, work_dir, pdf_path, on_progress)
            source = "paddleocr-vl"
            text = _cap(text)
            if not text.strip():
                raise ValueError("没有可用文本")
            prog(100)
            return {
                "name": name,
                "kind": "text",
                "source": source,
                "chars": len(text),
                "text": text,
            }

        if ext in TEXT_EXT:
            prog(40)
            text = _decode_text(data)
            source = "json" if ext == ".json" else ("markdown" if ext in (".md", ".markdown") else "txt")
        elif ext == ".csv":
            prog(40)
            text = read_csv(data)
            source = "csv"
        elif ext == ".xlsx":
            prog(40)
            try:
                text = read_xlsx(path)
            except zipfile.BadZipFile:
                raise ValueError("xlsx 无法打开") from None
            source = "xlsx"
        elif ext == ".pdf":
            prog(12)
            d = ex.Doc(key="att", dept="", rel_path=name, abs_path=path)
            ex.extract_text(d)
            text = _from_pages(d)
            if text.strip():
                source = d.text_source or "pdf-layer"
            else:
                text = _ocr_pdf(cfg, work_dir, path, on_progress)
                source = "paddleocr-vl"
        else:
            prog(12)
            d = ex.Doc(key="att", dept="", rel_path=name, abs_path=path)
            try:
                ex.extract_text(d)
            except Exception:
                d.pages = []
            text = _from_pages(d)
            if text.strip():
                source = d.text_source or ext.lstrip(".")
            else:
                pdf_path = os.path.join(tmp, os.path.splitext(name)[0] + ".pdf")
                try:
                    prog(20)
                    _word_to_pdf(path, pdf_path)
                except Exception as e:  # noqa: BLE001
                    raise ValueError(f"无法转为 PDF 识别：{e}") from e
                if not os.path.isfile(pdf_path):
                    raise ValueError("无法转为 PDF 识别")
                text = _ocr_pdf(cfg, work_dir, pdf_path, on_progress)
                source = "paddleocr-vl"

        text = _cap(text)
        if not text.strip():
            raise ValueError("没有可用文本")
        prog(100)
        return {
            "name": name,
            "kind": "text",
            "source": source,
            "chars": len(text),
            "text": text,
        }
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
