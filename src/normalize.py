from __future__ import annotations

import re
import unicodedata

_BRACKET_OPEN = re.compile(r"[【﹝\[（(]")
_BRACKET_CLOSE = re.compile(r"[】﹞\]）)]")
_WS = re.compile(r"\s+")
_PAGENOISE = re.compile(r"^[\s\-—_]*\d{1,3}[\s\-—_]*$|^第\s*\d+\s*页.*$|^\d+\s*/\s*\d+$")
_TOCLINE = re.compile(r"[.·…]{3,}\s*\d+\s*$")
_TOC_HEAD = re.compile(r"^[\s　]*目\s*录[\s　]*[:：]?$")


def normalize(text: str) -> str:
    if not text:
        return ""
    t = unicodedata.normalize("NFKC", text)
    t = _BRACKET_OPEN.sub("〔", t)
    t = _BRACKET_CLOSE.sub("〕", t)
    t = _WS.sub("", t)
    return t


def normalize_query(q: str) -> str:
    return normalize(q).lower()


def strip_page_noise(text: str) -> str:
    lines = (text or "").splitlines()
    out: list[str] = []
    in_toc = False
    toc_lines = 0
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if _TOC_HEAD.match(s):
            in_toc = True
            toc_lines = 0
            continue
        if in_toc:
            toc_lines += 1
            if len(s) > 30 or toc_lines > 120:
                in_toc = False
            else:
                continue
        if _PAGENOISE.match(s):
            continue
        if _TOCLINE.search(s):
            continue
        out.append(line)
    return "\n".join(out)


def ngrams(s: str, n: int = 2) -> list[str]:
    s = normalize(s)
    if len(s) < n:
        return [s] if s else []
    return [s[i:i + n] for i in range(len(s) - n + 1)]


_PARA_START = re.compile(
    r"^(第[一二三四五六七八九十百零〇\d]{1,6}[章节条编]"
    r"|[（(][一二三四五六七八九十\d]{1,3}[）)]"
    r"|[\d]{1,2}[.、．]"
    r"|[一二三四五六七八九十]{1,3}、"
    r"|附\s*[(（]?\s*[件表录]"
    r"|注\s*[:：])"
)
_SENT_END = ("。", "；", "：", "！", "？", "…", "》", "）", ")", "”", "\"", "，", ",")


def reflow_display(text: str) -> str:
    out: list[str] = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        if not out:
            out.append(line)
            continue
        prev = out[-1]
        if prev.endswith(_SENT_END) or _PARA_START.match(line) or len(prev) <= 4:
            out.append(line)
        else:
            out[-1] = prev + line
    return "\n".join(out)
