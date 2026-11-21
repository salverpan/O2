from __future__ import annotations

import re
from dataclasses import dataclass, field

CN_NUM = "一二三四五六七八九十百零〇两"
NUM = rf"[{CN_NUM}\d]{{1,6}}"

RE_CHAPTER = re.compile(rf"^[\s　]*第({NUM})[章编篇][\s　]*(.{{0,50}})$")
RE_SUBSECTION = re.compile(rf"^[\s　]*第({NUM})节[\s　]*(.{{0,50}})$")
RE_ARTICLE = re.compile(rf"^[\s　]*第({NUM})条(?:之({NUM}))?[\s　、.．:：]*(.*)$")
RE_SECTION = re.compile(rf"^[\s　]*([{CN_NUM}]{{1,3}})[、.．][\s　]*(.{{1,50}})$")
RE_SUB_CN = re.compile(rf"^[\s　]*[（(]([{CN_NUM}]{{1,3}})[）)][\s　]*(.{{1,50}})$")
RE_NUM_HEADING = re.compile(r"^[\s　]*(\d{1,2}(?:\.\d{1,2}){1,3})[\s　、.．]+([^\d\n].{1,48})$")
RE_MD_HEADING = re.compile(r"^\s*(#{1,4})\s+(.{1,80})$")
RE_SLIDE_HEADING = re.compile(r"^\s*##\s*第\s*\d+\s*页幻灯片\s*$")
RE_APPENDIX = re.compile(
    r"^[\s　]*(附\s*件|附\s*表|附\s*录)[\s　]*[\d一二三四五六七八九十]*[\s　]*[:：]?\s*(.*)$"
)
RE_MD_TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
RE_MD_TABLE_SEP = re.compile(r"^\s*\|\s*[-:]+[-|\s:]*\|\s*$")

MIN_CHUNK = 12
MAX_CHUNK = 1500
CHUNK_OVERLAP = 80
TABLE_ROWS_PER_CHUNK = 20


@dataclass
class Chunk:
    seq: int
    chapter: str
    article: str
    anchor: str
    page_start: int
    page_end: int
    text: str
    is_appendix: bool = False
    chunk_type: str = "text"
    block_refs: list[tuple[int, int]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "seq": self.seq,
            "chapter": self.chapter,
            "article": self.article,
            "anchor": self.anchor,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "text": self.text,
            "is_appendix": self.is_appendix,
            "chunk_type": self.chunk_type,
            "block_refs": self.block_refs,
        }


@dataclass
class SplitResult:
    chunks: list[Chunk] = field(default_factory=list)
    preamble: str = ""
    has_articles: bool = False
    profile_used: str = "laws"


def _build_lines(
    pages: list[str],
    page_blocks: dict[int, list[str]] | None,
    block_labels: dict[tuple[int, int], str] | None = None,
) -> list[tuple[str, int, int | None, str]]:
    lines: list[tuple[str, int, int | None, str]] = []
    if page_blocks:
        for pno in sorted(page_blocks):
            for bi, btext in enumerate(page_blocks[pno]):
                lbl = (block_labels or {}).get((pno, bi), "")
                for ln in (btext or "").splitlines():
                    lines.append((ln, pno, bi, lbl))
        return lines
    for pno, text in enumerate(pages, start=1):
        for ln in (text or "").splitlines():
            lines.append((ln, pno, None, ""))
    return lines


def _format_table_slice(headers: list[str], rows: list[list[str]], title: str = "") -> str:
    cols = max([len(headers)] + [len(r) for r in rows] + [1])
    hdr = [str(c or "").replace("\n", " ").replace("|", "｜").strip() for c in headers]
    if len(hdr) < cols:
        hdr.extend(f"列{i+1}" for i in range(len(hdr), cols))
    out: list[str] = []
    if title:
        out.append(f"【表格：{title}】")
    out.append("| " + " | ".join(hdr[:cols]) + " |")
    out.append("| " + " | ".join("---" for _ in range(cols)) + " |")
    for r in rows:
        cells = [str(c or "").replace("\n", " ").replace("|", "｜").strip() for c in r]
        if not any(cells):
            continue
        if len(cells) < cols:
            cells.extend("" for _ in range(cols - len(cells)))
        out.append("| " + " | ".join(cells[:cols]) + " |")
    return "\n".join(out)


def split_table_document(
    tables: list[dict],
    pages: list[str],
    doc_key: str = "",
) -> SplitResult:
    res = SplitResult(has_articles=False, profile_used="table")
    seq = 0
    if tables:
        for ti, tbl in enumerate(tables, start=1):
            pno = int(tbl.get("page") or ti)
            title = (tbl.get("title") or f"工作表{ti}").strip()
            headers = tbl.get("headers") or []
            rows = [r for r in (tbl.get("rows") or []) if any(str(c or "").strip() for c in r)]
            if not rows:
                md = (tbl.get("markdown") or "").strip()
                if md:
                    seq += 1
                    res.chunks.append(
                        Chunk(
                            seq=seq,
                            chapter=title,
                            article=f"{title} (表头)",
                            anchor=f"{doc_key}#t{seq}",
                            page_start=pno,
                            page_end=pno,
                            text=md,
                            chunk_type="table",
                        )
                    )
                continue
            total = len(rows)
            for start in range(0, total, TABLE_ROWS_PER_CHUNK):
                batch = rows[start : start + TABLE_ROWS_PER_CHUNK]
                r1 = start + 1
                r2 = start + len(batch)
                seq += 1
                art_label = f"{title}（第 {r1}–{r2} 行 / 共 {total} 行）" if total > TABLE_ROWS_PER_CHUNK else f"{title}（共 {total} 行）"
                chunk_md = _format_table_slice(headers, batch, title=art_label)
                res.chunks.append(
                    Chunk(
                        seq=seq,
                        chapter=title,
                        article=art_label,
                        anchor=f"{doc_key}#t{seq}",
                        page_start=pno,
                        page_end=pno,
                        text=chunk_md,
                        chunk_type="table",
                    )
                )
    if not res.chunks and pages:
        for pno, ptext in enumerate(pages, start=1):
            if not (ptext or "").strip():
                continue
            seq += 1
            res.chunks.append(
                Chunk(
                    seq=seq,
                    chapter="数据表",
                    article=f"第 {pno} 页表格",
                    anchor=f"{doc_key}#t{seq}",
                    page_start=pno,
                    page_end=pno,
                    text=ptext.strip(),
                    chunk_type="table",
                )
            )
    return res


def split_image_document(
    pages: list[str],
    doc_key: str = "",
    page_blocks: dict[int, list[str]] | None = None,
) -> SplitResult:
    res = SplitResult(has_articles=False, profile_used="image")
    lines = _build_lines(pages, page_blocks)
    body = "\n".join(l for l, _p, _b, _lbl in lines).strip()
    if body:
        refs = sorted({(p, b) for _l, p, b, _lbl in lines if b is not None})
        res.chunks.append(
            Chunk(
                seq=1,
                chapter="图像索引",
                article="视觉与文字识别",
                anchor=f"{doc_key}#img1",
                page_start=1,
                page_end=max(1, len(pages)),
                text=body,
                chunk_type="image",
                block_refs=refs,
            )
        )
    return res


def split_one_document(
    pages: list[str],
    doc_key: str = "",
    page_blocks: dict[int, list[str]] | None = None,
) -> SplitResult:
    res = SplitResult(has_articles=False, profile_used="one")
    lines = _build_lines(pages, page_blocks)
    body = "\n".join(l for l, _p, _b, _lbl in lines).strip()
    if body:
        refs = sorted({(p, b) for _l, p, b, _lbl in lines if b is not None})
        res.chunks.append(
            Chunk(
                seq=1,
                chapter="",
                article="全文",
                anchor=f"{doc_key}#full",
                page_start=lines[0][1] if lines else 1,
                page_end=lines[-1][1] if lines else 1,
                text=body,
                chunk_type="text",
                block_refs=refs,
            )
        )
    res.chunks = _split_oversized(res.chunks, max_len=3600)
    return res


def _detect_heading(line: str, lbl: str = "") -> tuple[int, str] | None:
    s = (line or "").strip()
    if not s or len(s) > 75:
        return None
    if RE_SLIDE_HEADING.match(s):
        return (1, s.lstrip("#").strip())
    m_md = RE_MD_HEADING.match(s)
    if m_md:
        lvl = min(3, len(m_md.group(1)))
        return (lvl, m_md.group(2).strip())
    if RE_CHAPTER.match(s):
        return (1, s)
    if RE_SUBSECTION.match(s):
        return (2, s)
    if RE_SECTION.match(s):
        return (1, s)
    if RE_SUB_CN.match(s):
        return (2, s)
    if RE_NUM_HEADING.match(s):
        m_num = RE_NUM_HEADING.match(s)
        dots = m_num.group(1).count(".")
        return (min(3, dots + 1), s)
    if RE_APPENDIX.match(s):
        return (1, s)
    if lbl in ("doc_title", "title", "paragraph_title") and 2 <= len(s) <= 42:
        return (2, s)
    return None


def split_report_document(
    lines: list[tuple[str, int, int | None, str]],
    doc_key: str = "",
    tables: list[dict] | None = None,
) -> SplitResult:
    res = SplitResult(has_articles=False, profile_used="report")
    if not lines:
        return res

    cur_h1 = ""
    cur_h2 = ""
    buf: list[str] = []
    refs: set[tuple[int, int]] = set()
    start_page = lines[0][1]
    end_page = start_page
    seq = 0
    in_md_table = False
    md_table_lines: list[str] = []
    md_table_refs: set[tuple[int, int]] = set()
    md_table_page_start = start_page
    md_table_page_end = start_page

    def flush_text() -> None:
        nonlocal buf, refs, seq, start_page, end_page
        text = "\n".join(buf).strip()
        if text:
            seq += 1
            art = cur_h2 or cur_h1 or f"第 {start_page} 页段落"
            ch = cur_h1 if cur_h2 else ""
            res.chunks.append(
                Chunk(
                    seq=seq,
                    chapter=ch,
                    article=art[:48],
                    anchor=f"{doc_key}#r{seq}",
                    page_start=start_page,
                    page_end=end_page,
                    text=text,
                    chunk_type="text",
                    block_refs=sorted(refs),
                )
            )
        buf = []
        refs = set()

    def flush_md_table() -> None:
        nonlocal in_md_table, md_table_lines, md_table_refs, seq
        if not md_table_lines:
            in_md_table = False
            return
        # 若表格行数过多，带表头切分
        hdr_lines: list[str] = []
        data_lines: list[str] = []
        for idx, tl in enumerate(md_table_lines):
            if idx < 2 and (idx == 0 or RE_MD_TABLE_SEP.match(tl)):
                hdr_lines.append(tl)
            elif idx == 1 and RE_MD_TABLE_SEP.match(tl):
                hdr_lines.append(tl)
            else:
                if not hdr_lines:
                    hdr_lines.append(tl)
                else:
                    data_lines.append(tl)
        title_ctx = cur_h2 or cur_h1 or f"第 {md_table_page_start} 页表格"
        if len(data_lines) <= TABLE_ROWS_PER_CHUNK:
            seq += 1
            res.chunks.append(
                Chunk(
                    seq=seq,
                    chapter=cur_h1,
                    article=f"{title_ctx} (表格)"[:48],
                    anchor=f"{doc_key}#rt{seq}",
                    page_start=md_table_page_start,
                    page_end=md_table_page_end,
                    text="\n".join(md_table_lines).strip(),
                    chunk_type="table",
                    block_refs=sorted(md_table_refs),
                )
            )
        else:
            for start in range(0, len(data_lines), TABLE_ROWS_PER_CHUNK):
                part = data_lines[start : start + TABLE_ROWS_PER_CHUNK]
                seq += 1
                r1, r2 = start + 1, start + len(part)
                res.chunks.append(
                    Chunk(
                        seq=seq,
                        chapter=cur_h1,
                        article=f"{title_ctx} (表行 {r1}-{r2})"[:48],
                        anchor=f"{doc_key}#rt{seq}",
                        page_start=md_table_page_start,
                        page_end=md_table_page_end,
                        text="\n".join([*hdr_lines, *part]).strip(),
                        chunk_type="table",
                        block_refs=sorted(md_table_refs),
                    )
                )
        in_md_table = False
        md_table_lines = []
        md_table_refs = set()

    for line, pno, bid, lbl in lines:
        s = line.strip()
        if not s:
            continue

        # 检测 Markdown 表格行
        if RE_MD_TABLE_ROW.match(s):
            if not in_md_table:
                flush_text()
                in_md_table = True
                md_table_page_start = pno
            md_table_lines.append(s)
            md_table_page_end = pno
            if bid is not None:
                md_table_refs.add((pno, bid))
            continue
        elif in_md_table:
            flush_md_table()
            start_page = pno

        # 检测图表/图片区块标签
        if lbl in ("figure", "chart", "image", "seal") and len(s) >= 4:
            flush_text()
            seq += 1
            res.chunks.append(
                Chunk(
                    seq=seq,
                    chapter=cur_h1,
                    article=f"第 {pno} 页图表 ({lbl})",
                    anchor=f"{doc_key}#fig{seq}",
                    page_start=pno,
                    page_end=pno,
                    text=s,
                    chunk_type="image",
                    block_refs=[(pno, bid)] if bid is not None else [],
                )
            )
            start_page = pno
            continue

        hd = _detect_heading(s, lbl)
        if hd:
            flush_text()
            lvl, htitle = hd
            if lvl == 1:
                cur_h1 = htitle
                cur_h2 = ""
            else:
                cur_h2 = htitle
            start_page = pno
            end_page = pno
            buf.append(s)
            if bid is not None:
                refs.add((pno, bid))
            continue

        if not buf:
            start_page = pno
        buf.append(line)
        end_page = pno
        if bid is not None:
            refs.add((pno, bid))

    if in_md_table:
        flush_md_table()
    flush_text()

    # 若 PDF 原生检测到结构化表格，且正文中尚无 table chunk，则补充结构化表格切片
    has_table_chunk = any(c.chunk_type == "table" for c in res.chunks)
    if tables and not has_table_chunk:
        t_res = split_table_document(tables, [], doc_key=doc_key)
        for tc in t_res.chunks:
            res.chunks.append(tc)

    res.chunks = _merge_tiny(res.chunks)
    res.chunks = _split_oversized(res.chunks)
    return res


def split_document(
    pages: list[str],
    doc_key: str = "",
    page_blocks: dict[int, list[str]] | None = None,
    profile: str = "auto",
    tables: list[dict] | None = None,
    block_labels: dict[tuple[int, int], str] | None = None,
) -> SplitResult:
    prof = (profile or "auto").lower()
    if prof == "table":
        return split_table_document(tables or [], pages, doc_key=doc_key)
    if prof == "image":
        return split_image_document(pages, doc_key=doc_key, page_blocks=page_blocks)
    if prof == "one":
        return split_one_document(pages, doc_key=doc_key, page_blocks=page_blocks)

    lines = _build_lines(pages, page_blocks, block_labels)
    if prof == "report":
        return split_report_document(lines, doc_key=doc_key, tables=tables)

    # laws 或 auto：优先检测是否存在「第X条」
    first_article_idx = None
    article_hits = 0
    for i, (line, _p, _b, _lbl) in enumerate(lines):
        if RE_ARTICLE.match(line):
            article_hits += 1
            if first_article_idx is None:
                first_article_idx = i

    if first_article_idx is None or (prof == "auto" and article_hits < 2):
        sec = _split_by_sections(lines, doc_key)
        if sec is not None:
            if tables and not any(c.chunk_type == "table" for c in sec.chunks):
                t_res = split_table_document(tables, [], doc_key=doc_key)
                sec.chunks.extend(t_res.chunks)
                for idx, c in enumerate(sec.chunks, start=1):
                    c.seq = idx
            return sec
        return split_report_document(lines, doc_key=doc_key, tables=tables)

    res = SplitResult(has_articles=True, profile_used="laws")
    res.preamble = "\n".join(l for l, _p, _b, _lbl in lines[:first_article_idx]).strip()

    cur_article = ""
    cur_chapter = ""
    cur_is_app = False
    buf: list[str] = []
    refs: set[tuple[int, int]] = set()
    start_page = lines[first_article_idx][1]
    end_page = start_page
    seq = 0

    for idx in range(first_article_idx):
        if RE_CHAPTER.match(lines[idx][0]):
            cur_chapter = lines[idx][0].strip()

    def flush() -> None:
        nonlocal buf, cur_article, cur_chapter, cur_is_app, start_page, end_page, seq, refs
        text = "\n".join(buf).strip()
        if text:
            seq += 1
            ctype = "table" if sum(1 for ln in buf if RE_MD_TABLE_ROW.match(ln.strip())) >= 2 else "text"
            res.chunks.append(
                Chunk(
                    seq=seq,
                    chapter=cur_chapter,
                    article=cur_article,
                    anchor=f"{doc_key}#a{seq}",
                    page_start=start_page,
                    page_end=end_page,
                    text=text,
                    is_appendix=cur_is_app,
                    chunk_type=ctype,
                    block_refs=sorted(refs),
                )
            )
        buf = []
        refs = set()
        cur_article = ""
        cur_is_app = False

    for line, pno, bid, _lbl in lines[first_article_idx:]:
        m_app = RE_APPENDIX.match(line)
        if m_app:
            flush()
            title = re.sub(r"[\s　]", "", m_app.group(2) or "")
            label = re.sub(r"[\s　]", "", m_app.group(1))
            if re.fullmatch(r"[\u4e00-\u9fa5A-Za-z0-9（）()]{2,20}", title):
                label = f"{label}：{title}"
            cur_article = label
            cur_is_app = True
            start_page = pno
            end_page = pno
            buf.append(line.strip())
            if bid is not None:
                refs.add((pno, bid))
            continue

        m_ch = RE_CHAPTER.match(line)
        if m_ch:
            flush()
            cur_chapter = line.strip()
            continue

        m_art = RE_ARTICLE.match(line)
        if m_art:
            flush()
            num, sub, rest = m_art.group(1), m_art.group(2), m_art.group(3)
            cur_article = f"第{num}条" + (f"之{sub}" if sub else "")
            start_page = pno
            end_page = pno
            if rest.strip():
                buf.append(rest.strip())
            if bid is not None:
                refs.add((pno, bid))
            continue

        if not buf and cur_article:
            start_page = pno
        buf.append(line)
        end_page = pno
        if bid is not None:
            refs.add((pno, bid))

    flush()

    if tables and not any(c.chunk_type == "table" for c in res.chunks):
        t_res = split_table_document(tables, [], doc_key=doc_key)
        res.chunks.extend(t_res.chunks)

    res.chunks = _merge_tiny(res.chunks)
    res.chunks = _split_oversized(res.chunks)
    return res


def _split_by_sections(
    lines: list[tuple[str, int, int | None, str]],
    doc_key: str,
) -> SplitResult | None:
    marks = [(i, RE_SECTION.match(line)) for i, (line, _p, _b, _lbl) in enumerate(lines)]
    hits = [(i, m) for i, m in marks if m]
    if len(hits) < 3:
        return None

    res = SplitResult(has_articles=False, profile_used="report")
    res.preamble = "\n".join(l for l, _p, _b, _lbl in lines[: hits[0][0]]).strip()

    cur_chapter = ""
    cur_title = ""
    start = hits[0][0]
    start_page = lines[hits[0][0]][1]
    end_page = start_page
    seq = 0

    def flush(end_idx: int) -> None:
        nonlocal seq, start_page, end_page
        block = lines[start:end_idx]
        text = "\n".join(l for l, _p, _b, _lbl in block).strip()
        if text:
            seq += 1
            refs = sorted({(p, b) for _l, p, b, _lbl in block if b is not None})
            ctype = "table" if sum(1 for _l, *_ in block if RE_MD_TABLE_ROW.match(_l.strip())) >= 2 else "text"
            res.chunks.append(
                Chunk(
                    seq=seq,
                    chapter=cur_chapter,
                    article=cur_title,
                    anchor=f"{doc_key}#s{seq}",
                    page_start=start_page,
                    page_end=end_page,
                    text=text,
                    chunk_type=ctype,
                    block_refs=refs,
                )
            )

    for idx in range(hits[0][0]):
        if RE_CHAPTER.match(lines[idx][0]):
            cur_chapter = lines[idx][0].strip()

    for pos, (i, _m) in enumerate(hits):
        if pos > 0:
            flush(i)
            start = i
            start_page = lines[i][1]
        cur_title = lines[i][0].strip()[:40]
        end_page = lines[i][1]
    flush(len(lines))

    res.chunks = _merge_tiny(res.chunks)
    res.chunks = _split_oversized(res.chunks)
    return res


def _merge_tiny(chunks: list[Chunk]) -> list[Chunk]:
    out: list[Chunk] = []
    for c in chunks:
        keep = c.article or c.is_appendix or c.chunk_type in ("table", "image")
        if out and not keep and len(c.text) < MIN_CHUNK and out[-1].chunk_type == "text":
            out[-1].text = (out[-1].text + "\n" + c.text).strip()
            out[-1].page_end = max(out[-1].page_end, c.page_end)
            out[-1].block_refs = sorted(set(out[-1].block_refs) | set(c.block_refs))
            continue
        out.append(c)
    for i, c in enumerate(out, start=1):
        c.seq = i
    return out


def _split_oversized(chunks: list[Chunk], max_len: int = MAX_CHUNK) -> list[Chunk]:
    out: list[Chunk] = []
    for c in chunks:
        if len(c.text) <= max_len or c.chunk_type == "table":
            out.append(c)
            continue
        paras = c.text.split("\n")
        buf: list[str] = []
        size = 0
        part = 0

        def emit() -> None:
            nonlocal buf, size, part
            if not buf:
                return
            part += 1
            label = c.article
            if label and part > 1:
                label = f"{label}（续{part}）"
            out.append(
                Chunk(
                    seq=0,
                    chapter=c.chapter,
                    article=label,
                    anchor=f"{c.anchor}p{part}",
                    page_start=c.page_start,
                    page_end=c.page_end,
                    text="\n".join(buf).strip(),
                    is_appendix=c.is_appendix,
                    chunk_type=c.chunk_type,
                    block_refs=list(c.block_refs),
                )
            )
            tail = "\n".join(buf)[-CHUNK_OVERLAP:]
            buf = [tail] if tail else []
            size = len(tail)

        for p in paras:
            if size + len(p) > max_len and buf:
                emit()
            buf.append(p)
            size += len(p) + 1
        emit()

    for i, c in enumerate(out, start=1):
        c.seq = i
    return out
