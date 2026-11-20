from __future__ import annotations

import re
from dataclasses import dataclass, field

CN_NUM = "一二三四五六七八九十百零〇两"
NUM = rf"[{CN_NUM}\d]{{1,6}}"

RE_CHAPTER = re.compile(rf"^[\s　]*第({NUM})章[\s　]*(.{{0,40}})$")
RE_ARTICLE = re.compile(rf"^[\s　]*第({NUM})条(?:之({NUM}))?[\s　、.．:：]*(.*)$")
RE_SECTION = re.compile(rf"^[\s　]*([{CN_NUM}]{{1,3}})[、.．][\s　]*(.{{1,40}})$")
RE_APPENDIX = re.compile(
    r"^[\s　]*(附\s*件|附\s*表|附\s*录)[\s　]*[\d一二三四五六七八九十]*[\s　]*[:：]?\s*(.*)$"
)

MIN_CHUNK = 12
MAX_CHUNK = 1500
CHUNK_OVERLAP = 80


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
    block_refs: list[tuple[int, int]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "seq": self.seq, "chapter": self.chapter, "article": self.article,
            "anchor": self.anchor, "page_start": self.page_start,
            "page_end": self.page_end, "text": self.text,
            "is_appendix": self.is_appendix, "block_refs": self.block_refs,
        }


@dataclass
class SplitResult:
    chunks: list[Chunk] = field(default_factory=list)
    preamble: str = ""
    has_articles: bool = False


def _build_lines(pages: list[str], page_blocks: dict[int, list[str]] | None) -> list[tuple[str, int, int | None]]:
    lines: list[tuple[str, int, int | None]] = []
    if page_blocks:
        for pno in sorted(page_blocks):
            for bi, btext in enumerate(page_blocks[pno]):
                for ln in (btext or "").splitlines():
                    lines.append((ln, pno, bi))
        return lines
    for pno, text in enumerate(pages, start=1):
        for ln in (text or "").splitlines():
            lines.append((ln, pno, None))
    return lines


def split_document(pages: list[str], doc_key: str = "",
                   page_blocks: dict[int, list[str]] | None = None) -> SplitResult:
    lines = _build_lines(pages, page_blocks)
    res = SplitResult()

    first_article_idx = None
    for i, (line, _p, _b) in enumerate(lines):
        if RE_ARTICLE.match(line):
            first_article_idx = i
            break

    if first_article_idx is None:
        sec = _split_by_sections(lines, doc_key)
        if sec is not None:
            return sec
        body = "\n".join(l for l, _p, _b in lines).strip()
        if body:
            refs = sorted({(p, b) for _l, p, b in lines if b is not None})
            res.chunks.append(
                Chunk(seq=1, chapter="", article="", anchor=f"{doc_key}#full",
                      page_start=lines[0][1] if lines else 1,
                      page_end=lines[-1][1] if lines else 1,
                      text=body, block_refs=refs)
            )
        res.chunks = _split_oversized(res.chunks)
        return res

    res.preamble = "\n".join(l for l, _p, _b in lines[:first_article_idx]).strip()
    res.has_articles = True

    cur_article = ""
    cur_chapter = ""
    buf: list[str] = []
    refs: set[tuple[int, int]] = set()
    start_page = lines[first_article_idx][1]
    end_page = start_page
    seq = 0

    def flush() -> None:
        nonlocal buf, cur_article, cur_chapter, start_page, end_page, seq, refs
        text = "\n".join(buf).strip()
        if text:
            seq += 1
            res.chunks.append(
                Chunk(seq=seq, chapter=cur_chapter, article=cur_article,
                      anchor=f"{doc_key}#a{seq}", page_start=start_page,
                      page_end=end_page, text=text, block_refs=sorted(refs))
            )
        buf = []
        refs = set()
        cur_article = ""

    for line, pno, bid in lines[first_article_idx:]:
        m_app = RE_APPENDIX.match(line)
        if m_app:
            flush()
            title = re.sub(r"[\s　]", "", m_app.group(2) or "")
            label = re.sub(r"[\s　]", "", m_app.group(1))
            if re.fullmatch(r"[\u4e00-\u9fa5]{2,10}", title):
                label = f"{label}：{title}"
            cur_article = label
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

    res.chunks = _merge_tiny(res.chunks)
    res.chunks = _split_oversized(res.chunks)
    return res


def _split_by_sections(lines: list[tuple[str, int, int | None]], doc_key: str) -> SplitResult | None:
    marks = [(i, RE_SECTION.match(line)) for i, (line, _p, _b) in enumerate(lines)]
    hits = [(i, m) for i, m in marks if m]
    if len(hits) < 3:
        return None

    res = SplitResult(has_articles=False)
    res.preamble = "\n".join(l for l, _p, _b in lines[:hits[0][0]]).strip()

    cur_chapter = ""
    cur_title = ""
    start = hits[0][0]
    start_page = lines[hits[0][0]][1]
    end_page = start_page
    seq = 0

    def flush(end_idx: int) -> None:
        nonlocal seq, start_page, end_page
        block = lines[start:end_idx]
        text = "\n".join(l for l, _p, _b in block).strip()
        if text:
            seq += 1
            refs = sorted({(p, b) for _l, p, b in block if b is not None})
            res.chunks.append(
                Chunk(seq=seq, chapter=cur_chapter, article=cur_title,
                      anchor=f"{doc_key}#s{seq}", page_start=start_page,
                      page_end=end_page, text=text, block_refs=refs)
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
        keep = c.article or c.is_appendix
        if out and not keep and len(c.text) < MIN_CHUNK:
            out[-1].text = (out[-1].text + "\n" + c.text).strip()
            out[-1].page_end = max(out[-1].page_end, c.page_end)
            out[-1].block_refs = sorted(set(out[-1].block_refs) | set(c.block_refs))
            continue
        out.append(c)
    for i, c in enumerate(out, start=1):
        c.seq = i
    return out


def _split_oversized(chunks: list[Chunk]) -> list[Chunk]:
    out: list[Chunk] = []
    for c in chunks:
        if len(c.text) <= MAX_CHUNK:
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
                Chunk(seq=0, chapter=c.chapter, article=label,
                      anchor=f"{c.anchor}p{part}", page_start=c.page_start,
                      page_end=c.page_end, text="\n".join(buf).strip(),
                      is_appendix=c.is_appendix, block_refs=list(c.block_refs))
            )
            tail = "\n".join(buf)[-CHUNK_OVERLAP:]
            buf = [tail] if tail else []
            size = len(tail)

        for p in paras:
            if size + len(p) > MAX_CHUNK and buf:
                emit()
            buf.append(p)
            size += len(p) + 1
        emit()

    for i, c in enumerate(out, start=1):
        c.seq = i
    return out
