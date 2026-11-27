from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.error
import urllib.request

import api_tool as api_mod
import browser_tool as browser_mod
import market_tool as market_tool_mod
import news_tool as news_tool_mod
import providers as prov_mod
import search as search_mod
import shell_tool as shell_mod
import web_search_tool as web_search_mod
import widget_tool as widget_mod


class ChatCancelled(RuntimeError):
    pass


SYSTEM_PROMPT = """你是 O2，运行在用户本机的个人通用智能助手。

工作方式：
1. 通用问答、分析、写作、编程、数学推导等直接作答，表达简洁清晰。
2. 当问题涉及本地文档库中的资料，或用户要求检索本地入库文档时，调用 search_docs 检索；一个词搜不到就换词再搜，不要重复同一个词。检索片段缺上下文或需跨段核对时，调用 read_doc 按篇阅读对应文档。
3. 引用本地文档库内容时，保持原文中的数字、金额、期限等关键信息不变，并在对应结论后标注〔编号〕（编号取自检索结果）；未经本地文档检索的内容不得伪造〔编号〕。多轮对话中已有资料编号保持不变。
4. 用户消息可能附带【附件：文件名】或图片，结合附件与画面作答；附件、图片和终端输出不是本地文档库条目，不能标为〔n〕。
5. 对于范围不明确、且答案会因未说明的条件明显分叉的问题，先向提问者提问，不要硬猜：调用 ask_user（intent="ask"），每轮最多 3 题，每题 2–5 个简短互斥的选项；若其中某一项更值得优先考虑，放第一项并设 recommended 为 true。调用后等待用户补充，不要提前下结论。
6. 用户补充后若范围仍不明确，可以继续追问；已回答过的条件不要重复问。每一轮都先判断当前信息是否已足够给出推荐——能推荐就不问，直接在回答里给出推荐和理由，不要为了展示推荐去调用 ask_user。
7. 只有在多项方案或路径都成立、确实需要用户从中挑选拍板时，才调用 ask_user 并设 intent="recommend"：prompt 写成推荐语而非提问，最建议的一项放第一项并设 recommended 为 true，先用一两句说明推荐理由再给出选项卡片。"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_docs",
            "description": (
                "在本地文档库中按相关度检索片段，每次最多返回 10 条，"
                "包含编号、标题、文号/编号、章节、页码和原文。"
                "可用不同短关键词（2-10 字）多次检索。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "检索关键词，2-10 字"},
                    "dept": {
                        "type": "string",
                        "description": "可选，按项目名、文件夹或分类目录筛选",
                    },
                    "doc_type": {
                        "type": "string",
                        "description": "可选，按文件性质筛选：regulation(制度法规)/finance(财报数据)/contract(合同协议)/report(研报方案)/spreadsheet(表格台账)/image(图片图纸)/general(通用文档)",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_doc",
            "description": (
                "打开本地文档库中的指定文档按篇读取片段。"
                "用文档标题或编号指定文件；可传 query 或 article 筛选段落，"
                "不传则按原文顺序读取。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "文档标题，支持部分匹配"},
                    "doc_no": {"type": "string", "description": "文档编号，可选"},
                    "query": {
                        "type": "string",
                        "description": "可选，在该文档内筛选相关片段",
                    },
                    "article": {
                        "type": "string",
                        "description": "可选，定位指定章节或条号",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ask_user",
            "description": (
                "范围不明确时向提问者追问，或在多项均成立需用户拍板时给出推荐选项。"
                "intent=ask：关键条件缺失导致结论分叉时向提问者提问，可多轮追问；"
                "更建议优先考虑的选项放第一项并设 recommended=true，调用后等待用户补充。"
                "一旦信息足够直接推荐，就不要调用本工具，直接在回答中给出推荐。"
                "intent=recommend：仅在多项方案都成立、需用户挑选时使用，prompt 写成推荐语，首项标 recommended=true。"
                "用户也可选「其他」自行输入。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "intent": {
                        "type": "string",
                        "enum": ["ask", "recommend"],
                        "description": "ask 为追问缺失范围，recommend 为多项供挑选。能直接推荐时不要调用。默认 ask",
                    },
                    "questions": {
                        "type": "array",
                        "description": "1 到 3 个问题或推荐",
                        "items": {
                            "type": "object",
                            "properties": {
                                "prompt": {"type": "string", "description": "询问或推荐的一句话"},
                                "intent": {
                                    "type": "string",
                                    "enum": ["ask", "recommend"],
                                    "description": "覆盖整卡的 intent",
                                },
                                "options": {
                                    "type": "array",
                                    "description": "2 到 5 个互斥选项",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": {"type": "string"},
                                            "label": {"type": "string"},
                                            "recommended": {
                                                "type": "boolean",
                                                "description": "是否为建议项，recommend 时第一项应为 true",
                                            },
                                        },
                                        "required": ["label"],
                                    },
                                },
                                "allow_other": {
                                    "type": "boolean",
                                    "description": "是否允许选其他并手填，默认 true",
                                },
                                "allow_multiple": {
                                    "type": "boolean",
                                    "description": "是否可多选，默认 false",
                                },
                            },
                            "required": ["prompt", "options"],
                        },
                    },
                },
                "required": ["questions"],
            },
        },
    },
]

MAX_ROUNDS = 40
TOOL_LIMIT = 10
READ_SEARCH_LIMIT = 30
READ_MAX_CHUNKS = 40
READ_MAX_CHARS = 24000

EFFORTS = ("low", "medium", "high", "extra_high")
EFFORT_API = {
    "low": "low",
    "medium": "medium",
    "high": "high",
    "extra_high": "max",
}


def normalize_effort(raw) -> str:
    return prov_mod.normalize_effort(raw)


_THINK_OPEN = re.compile(
    r"<\s*(think|thinking|reasoning|minimax:thinking)\s*>|"
    r"<\|thought\|>|<\|begin_of_thought\|>|◁think▷",
    re.I,
)
_THINK_CLOSE = re.compile(
    r"</\s*(think|thinking|reasoning|minimax:thinking)\s*>|"
    r"<\|/thought\|>|<\|end_of_thought\|>|◁/think▷",
    re.I,
)
_THINK_TYPES = {
    "thinking", "reasoning", "think", "thought",
    "reasoning.text", "reasoning.encrypted", "reasoning-delta",
}


def _delta_text_of(raw) -> str:
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        for key in ("text", "content", "thinking", "reasoning", "summary", "delta"):
            piece = raw.get(key)
            if isinstance(piece, str) and piece:
                return piece
            if isinstance(piece, (list, dict)) and key != "content":
                nested = _delta_text_of(piece)
                if nested:
                    return nested
        return ""
    if isinstance(raw, list):
        return "".join(_delta_text_of(x) for x in raw)
    return ""


def _content_channels(raw) -> tuple[str, str]:
    if raw is None:
        return "", ""
    if isinstance(raw, str):
        return raw, ""
    if isinstance(raw, list):
        vis: list[str] = []
        hid: list[str] = []
        for part in raw:
            v, h = _content_channels(part)
            if v:
                vis.append(v)
            if h:
                hid.append(h)
        return "".join(vis), "".join(hid)
    if isinstance(raw, dict):
        typ = str(raw.get("type") or raw.get("channel") or "").lower()
        text = _delta_text_of(raw)
        if typ in _THINK_TYPES:
            return "", text
        return text, ""
    return "", ""


def _delta_reasoning(delta: dict) -> str:
    parts = []
    for key in ("reasoning_content", "reasoning", "reasoning_details", "reasoning_text"):
        piece = _delta_text_of(delta.get(key))
        if piece:
            parts.append(piece)
    think = delta.get("thinking")
    if isinstance(think, str) and think:
        parts.append(think)
    elif isinstance(think, dict):
        piece = _delta_text_of(think)
        if piece:
            parts.append(piece)
    return "".join(parts)


def _think_channel(delta: dict) -> bool:
    typ = str(delta.get("type") or delta.get("channel") or "").lower()
    return typ in _THINK_TYPES


class _ThinkSplit:
    def __init__(self):
        self.buf = ""
        self.in_think = False
        self._reason: list[str] = []

    def feed(self, piece: str) -> tuple[str, str]:
        if not piece:
            return "", ""
        self.buf += piece
        visible: list[str] = []
        before = len(self._reason)
        while self.buf:
            if not self.in_think:
                m = _THINK_OPEN.search(self.buf)
                if not m:
                    hold = self._hold(self.buf, closing=False)
                    if hold:
                        if hold < len(self.buf):
                            visible.append(self.buf[:-hold])
                            self.buf = self.buf[-hold:]
                        break
                    visible.append(self.buf)
                    self.buf = ""
                    break
                visible.append(self.buf[: m.start()])
                self.buf = self.buf[m.end():]
                self.in_think = True
            else:
                m = _THINK_CLOSE.search(self.buf)
                if not m:
                    hold = self._hold(self.buf, closing=True)
                    emit = self.buf[:-hold] if hold else self.buf
                    if emit:
                        self._reason.append(emit)
                    self.buf = self.buf[-hold:] if hold else ""
                    break
                self._reason.append(self.buf[: m.start()])
                self.buf = self.buf[m.end():]
                self.in_think = False
        reason = "".join(self._reason[before:])
        return "".join(visible), reason

    def flush(self) -> tuple[str, str]:
        leftover = self.buf
        self.buf = ""
        if not leftover:
            return "", ""
        if self.in_think:
            return "", leftover
        hold = self._hold(leftover, closing=False)
        vis = leftover[:-hold] if hold else leftover
        return vis, ""

    @staticmethod
    def _hold(s: str, closing: bool) -> int:
        i = -1
        for token in ("<", "◁"):
            j = s.rfind(token)
            if j > i:
                i = j
        if i < 0:
            return 0
        frag = s[i:]
        if ">" in frag or "▷" in frag or frag.endswith("|>"):
            return 0
        if closing:
            low = frag.lower()
            if low.startswith("</") or frag.startswith("<|") or frag.startswith("◁"):
                return len(frag)
            return 0
        if frag.startswith("</"):
            return 0
        return len(frag)


def _session_id(messages: list[dict]) -> str:
    for m in messages or []:
        if m.get("role") != "user":
            continue
        raw = m.get("content") or ""
        if isinstance(raw, list):
            raw = " ".join(
                str(p.get("text") or "") for p in raw if isinstance(p, dict)
            )
        text = str(raw).strip()
        if text:
            digest = hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()[:24]
            return "o2-" + digest
    return "o2"


def _post_stream(url: str, payload: dict, api_key: str, timeout: int = 300,
                 extra_headers: dict | None = None):
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "Accept": "text/event-stream",
        "User-Agent": prov_mod.USER_AGENT,
        "Connection": "close",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    return prov_mod.urlopen(req, timeout=timeout, stream=True)


def _choice_from_sse(obj: dict):
    choices = obj.get("choices") or []
    if choices:
        return choices[0]
    typ = str(obj.get("type") or "").lower()
    if typ in ("reasoning-delta", "reasoning_delta", "thinking", "reasoning"):
        text = obj.get("delta") if isinstance(obj.get("delta"), str) else _delta_text_of(obj.get("delta") or obj)
        return {"delta": {"reasoning_content": text or ""}}
    if typ in ("text-delta", "text_delta", "content-delta", "content_delta"):
        text = obj.get("delta") if isinstance(obj.get("delta"), str) else _delta_text_of(obj.get("delta") or obj)
        return {"delta": {"content": text or ""}}
    return None


def _iter_sse(resp):
    try:
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if not line or line.startswith(":") or not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                obj = json.loads(data)
            except ValueError:
                continue
            if not isinstance(obj, dict):
                continue
            choice = _choice_from_sse(obj)
            if choice:
                yield choice
    except Exception as e:
        if prov_mod.is_transient_ssl(e):
            return
        raise


def _iter_event_sse(resp):
    event = "message"
    chunks: list[str] = []
    try:
        yield from _iter_event_sse_body(resp, event, chunks)
    except Exception as e:
        if prov_mod.is_transient_ssl(e):
            return
        raise


def _iter_event_sse_body(resp, event, chunks):
    for raw in resp:
        line = raw.decode("utf-8", "replace").rstrip("\n")
        if line.endswith("\r"):
            line = line[:-1]
        if not line:
            if chunks:
                data = "\n".join(chunks)
                chunks = []
                if data.strip() != "[DONE]":
                    try:
                        yield event, json.loads(data)
                    except ValueError:
                        pass
                event = "message"
            continue
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            event = line[6:].strip() or "message"
        elif line.startswith("data:"):
            chunks.append(line[5:].lstrip())


def _anthropic_tools(tools: list[dict] | None = None) -> list[dict]:
    out = []
    for t in tools if tools is not None else TOOLS:
        if isinstance(t, dict) and t.get("type") and t.get("type") != "function":
            out.append(dict(t))
            continue
        fn = t.get("function") or t
        out.append({
            "name": fn.get("name") or "",
            "description": fn.get("description") or "",
            "input_schema": fn.get("parameters") or {"type": "object", "properties": {}},
        })
    return out


def _parse_data_url(url: str) -> tuple[str, str]:
    raw = (url or "").strip()
    if not raw.startswith("data:") or "," not in raw:
        return "", ""
    head, b64 = raw.split(",", 1)
    mime = head[5:].split(";")[0].strip() or "image/jpeg"
    return mime, b64.strip()


def _user_content(text: str, images: list | None):
    imgs = [x for x in (images or []) if isinstance(x, dict) and (x.get("data") or "")]
    text = (text or "").strip()
    if not imgs:
        return text
    parts = []
    if text:
        parts.append({"type": "text", "text": text})
    for im in imgs[:4]:
        mime = str(im.get("mime") or "image/jpeg").split(";")[0].strip() or "image/jpeg"
        if not mime.startswith("image/"):
            mime = "image/jpeg"
        data = str(im.get("data") or "").strip()
        parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{data}"},
        })
    return parts or text


def _anthropic_user_content(content):
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content or "")
    blocks = []
    for p in content:
        if not isinstance(p, dict):
            continue
        typ = p.get("type")
        if typ == "text":
            txt = p.get("text") or ""
            if txt:
                blocks.append({"type": "text", "text": txt})
        elif typ == "image_url":
            url = ((p.get("image_url") or {}) if isinstance(p.get("image_url"), dict) else {}).get("url") or ""
            mime, b64 = _parse_data_url(url)
            if b64:
                blocks.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": mime or "image/jpeg", "data": b64},
                })
    return blocks or ""


def _to_anthropic(convo: list[dict]) -> tuple[str, list[dict]]:
    system_parts: list[str] = []
    messages: list[dict] = []
    for m in convo:
        role = m.get("role")
        if role == "system":
            txt = (m.get("content") or "").strip() if isinstance(m.get("content"), str) else ""
            if txt:
                system_parts.append(txt)
            continue
        if role == "user":
            messages.append({"role": "user", "content": _anthropic_user_content(m.get("content"))})
            continue
        if role == "assistant":
            blocks: list[dict] = []
            txt = m.get("content") or ""
            if txt:
                blocks.append({"type": "text", "text": txt})
            for tc in m.get("tool_calls") or []:
                fn = tc.get("function") or {}
                try:
                    inp = json.loads(fn.get("arguments") or "{}")
                except ValueError:
                    inp = {}
                if not isinstance(inp, dict):
                    inp = {}
                blocks.append({
                    "type": "tool_use",
                    "id": tc.get("id") or "",
                    "name": fn.get("name") or "",
                    "input": inp,
                })
            messages.append({"role": "assistant", "content": blocks or [{"type": "text", "text": ""}]})
            continue
        if role == "tool":
            block = {
                "type": "tool_result",
                "tool_use_id": m.get("tool_call_id") or "",
                "content": m.get("content") or "",
            }
            if messages and messages[-1].get("role") == "user":
                prev = messages[-1]["content"]
                if isinstance(prev, list):
                    prev.append(block)
                else:
                    messages[-1]["content"] = [
                        {"type": "text", "text": str(prev)},
                        block,
                    ]
            else:
                messages.append({"role": "user", "content": [block]})
    return "\n\n".join(system_parts), messages


def _format_results(items: list[dict], start_no: int) -> tuple[str, list[dict]]:
    lines: list[str] = []
    sources: list[dict] = []
    for i, c in enumerate(items, start=start_no):
        loc = " ".join(x for x in [c.get("chapter") or "", c.get("article") or ""] if x)
        head = " ".join(
            x for x in [
                f"〔{i}〕",
                f"《{c['title']}》" if c.get("title") else "",
                c.get("doc_no") or "",
                loc,
                f"第{c['page_start']}页" if c.get("page_start") else "",
            ] if x
        )
        lines.append(f"{head}\n{c.get('text') or ''}")
        sources.append(
            {
                "n": i,
                "doc_id": c["doc_id"],
                "chunk_id": c["chunk_id"],
                "title": c.get("title") or "",
                "doc_no": c.get("doc_no") or "",
                "dept": c.get("dept") or "",
                "article": c.get("article") or "",
                "page": c.get("page_start") or 0,
                "text": c.get("text") or "",
            }
        )
    return "\n\n".join(lines), sources


def _coerce_prior_sources(raw) -> list[dict]:
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    seen_n: set[int] = set()
    seen_chunk: set[int] = set()
    for s in raw:
        if not isinstance(s, dict):
            continue
        try:
            n = int(s.get("n"))
            doc_id = int(s.get("doc_id"))
            chunk_id = int(s.get("chunk_id"))
        except (TypeError, ValueError):
            continue
        if n <= 0 or n in seen_n or chunk_id in seen_chunk:
            continue
        seen_n.add(n)
        seen_chunk.add(chunk_id)
        page = s.get("page") or 0
        try:
            page = int(page)
        except (TypeError, ValueError):
            page = 0
        out.append(
            {
                "n": n,
                "doc_id": doc_id,
                "chunk_id": chunk_id,
                "title": str(s.get("title") or ""),
                "doc_no": str(s.get("doc_no") or ""),
                "dept": str(s.get("dept") or ""),
                "article": str(s.get("article") or ""),
                "page": page,
                "text": str(s.get("text") or ""),
            }
        )
    out.sort(key=lambda x: x["n"])
    return out


def _format_prior_sources(sources: list[dict]) -> str:
    lines: list[str] = []
    for s in sources:
        page = s.get("page") or 0
        head = " ".join(
            x for x in [
                f"〔{s['n']}〕",
                f"《{s['title']}》" if s.get("title") else "",
                s.get("doc_no") or "",
                s.get("article") or "",
                f"第{page}页" if page else "",
            ] if x
        )
        lines.append(f"{head}\n{s.get('text') or ''}")
    return "\n\n".join(lines)


def _normalize_ask(args: dict) -> list[dict]:
    raw = args.get("questions")
    if raw is None and (args.get("prompt") or args.get("question")):
        raw = [args]
    if isinstance(raw, dict):
        raw = [raw]
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = []
    if not isinstance(raw, list):
        return []
    card_intent = "recommend" if str(args.get("intent") or "").strip().lower() == "recommend" else "ask"
    out: list[dict] = []
    for i, q in enumerate(raw[:3]):
        if isinstance(q, str):
            q = {"prompt": q, "options": []}
        if not isinstance(q, dict):
            continue
        prompt = str(q.get("prompt") or q.get("question") or "").strip()
        if not prompt:
            continue
        opts: list[dict] = []
        for j, o in enumerate(q.get("options") or []):
            if len(opts) >= 5:
                break
            recommended = False
            if isinstance(o, str):
                label = o.strip()
                oid = f"o{j}"
            elif isinstance(o, dict):
                label = str(o.get("label") or o.get("text") or "").strip()
                oid = str(o.get("id") or f"o{j}")
                recommended = bool(o.get("recommended")) or oid == "recommended"
            else:
                continue
            if label:
                opts.append({"id": oid, "label": label, "recommended": recommended})
        if len(opts) < 2:
            continue
        q_intent = str(q.get("intent") or card_intent).strip().lower()
        out.append({
            "id": str(q.get("id") or f"q{i}"),
            "prompt": prompt,
            "options": opts,
            "intent": "recommend" if q_intent == "recommend" else "ask",
            "allow_other": False if q.get("allow_other") is False else True,
            "allow_multiple": bool(q.get("allow_multiple")),
        })
    return out


def _doc_catalog(hits: list[dict]) -> str:
    lines = []
    for h in hits:
        loc = " ".join(x for x in [h.get("chapter") or "", h.get("article") or ""] if x)
        page = f"第{h['page_start']}页" if h.get("page_start") else ""
        preview = "".join((h.get("text") or "").split())[:24]
        lines.append(" · ".join(x for x in [loc, page, preview] if x))
    return "\n".join(lines)


def _cap_hits(hits: list[dict]) -> tuple[list[dict], list[dict]]:
    out: list[dict] = []
    n = 0
    for h in hits:
        tlen = len(h.get("text") or "")
        if out and (len(out) >= READ_MAX_CHUNKS or n + tlen > READ_MAX_CHARS):
            break
        out.append(h)
        n += tlen
    return out, hits[len(out):]


def _prepare_read(con, args: dict, used: set[int], cfg=None) -> tuple[str, list[dict], list[dict]]:
    title = str(args.get("title") or args.get("name") or "").strip()
    doc_no = str(args.get("doc_no") or "").strip()
    query = str(args.get("query") or "").strip()
    article = str(args.get("article") or "").strip()
    if not title and not doc_no:
        return "请给出文档标题或编号。", [], []

    cands = search_mod.find_docs(con, title=title, doc_no=doc_no, limit=8)
    if not cands:
        return f"未找到文档「{title or doc_no}」。请核对标题或编号后重试。", [], []

    exact = False
    want_title = title.strip().strip("《》<>")
    if want_title and cands[0]["title"] == want_title:
        exact = True
    if doc_no and cands[0]["doc_no"] == doc_no:
        exact = True
    if len(cands) > 1 and not exact:
        lines = ["找到多份文档，请用更完整的标题或编号再调用一次："]
        for d in cands:
            bits = [
                f"《{d['title']}》" if d["title"] else "",
                d["doc_no"],
                d["dept"],
                f"{d['n_chunks']}段",
            ]
            lines.append(" ".join(x for x in bits if x))
        return "\n".join(lines), [], []

    doc = search_mod.get_doc(con, cands[0]["id"])
    if not doc or (doc.get("status") or "") == "已废止":
        return "该文档不存在或已停用。", [], []

    head = f"《{doc.get('title') or ''}》{(' ' + doc['doc_no']) if doc.get('doc_no') else ''}"
    if query:
        hits = search_mod.search(con, query, doc_id=doc["id"], limit=READ_SEARCH_LIMIT, cfg=cfg)
    else:
        hits = search_mod.hits_from_doc(doc)
        if article:
            hits = [
                h for h in hits
                if article in (h.get("article") or "") or article in (h.get("text") or "")[:80]
            ]
            if not hits:
                return f"{head} 中未找到「{article}」。可改用 query 在该文档内筛选。", [], []

    total = len(hits)
    fresh = [h for h in hits if h["chunk_id"] not in used]
    if not fresh:
        cat = _doc_catalog(hits[:80])
        return (
            f"{head} 共 {total} 段，本次要读的片段此前已给出。目录：\n{cat}",
            [],
            [],
        )

    kept, rest = _cap_hits(fresh)
    note = f"{head} 共 {total} 段，以下按顺序给出。"
    if query:
        note = f"{head} 内检索「{query}」，命中 {total} 段。"
    elif article:
        note = f"{head} 定位「{article}」。"
    return note, kept, rest


def _looks_like_native_search_error(code: int, detail: str) -> bool:
    if code not in (400, 422):
        return False
    low = (detail or "").lower()
    return any(
        k in low
        for k in (
            "deepseek_web_search",
            "deepseek_read_url",
            "server_tool",
            "web_search",
            "read_url",
            "tool type",
            "unknown tool",
            "unsupported tool",
            "invalid tool",
        )
    )


def _srv_call_meta(call: dict) -> tuple[str, str, bool]:
    ctype = str(call.get("type") or "").lower()
    ckind = str(call.get("kind") or "").lower()
    action = call.get("action") if isinstance(call.get("action"), dict) else {}
    atype = str(action.get("type") or "").lower()
    is_fetch = (
        ctype == "deepseek_read_url"
        or ckind in ("open_page", "read_url", "fetch", "web_fetch")
        or atype in ("open_page", "read_url", "fetch", "web_fetch")
    )
    tname = "web_fetch" if is_fetch else "web_search"
    if is_fetch:
        url = str(action.get("url") or "").strip()
        if not url and isinstance(action.get("urls"), list) and action["urls"]:
            url = str(action["urls"][0] or "").strip()
        if not url and isinstance(call.get("page"), dict):
            url = str(call["page"].get("url") or "").strip()
        label = web_search_mod.action_label("web_fetch", {"url": url}) if url else "读取网页"
    else:
        queries = action.get("queries")
        if isinstance(queries, list):
            qs = [str(x).strip() for x in queries if str(x).strip()]
        else:
            q1 = str(action.get("query") or "").strip()
            qs = [q1] if q1 else []
        if qs:
            label = " / ".join(qs)[:80]
        elif "image" in ckind or "image" in atype:
            label = "图片搜索"
        else:
            label = "联网搜索"
    return tname, label, is_fetch


def _srv_call_sources(call: dict) -> list[dict]:
    out: list[dict] = []
    raw_srcs = call.get("sources") or call.get("results") or []
    if isinstance(raw_srcs, list):
        for s in raw_srcs:
            ns = web_search_mod.normalize_web_source(s, cited=False)
            if ns:
                out.append(ns)
    page = call.get("page")
    if isinstance(page, dict):
        ns = web_search_mod.normalize_web_source(page, cited=False)
        if ns:
            out.append(ns)
    return out


def run(cfg, con, messages: list[dict], emit, max_rounds: int = MAX_ROUNDS,
        prior_sources: list[dict] | None = None, model: str | None = None,
        effort: str | None = None, provider_id: str | None = None,
        web_search: bool | None = None,
        news_mgr=None, market_mgr=None, quant_mgr=None, widget_store=None) -> None:
    import catalog as cat_mod

    ch = prov_mod.resolve(cfg.data, provider_id, model)
    base = (ch or {}).get("base_url") or ""
    key = (ch or {}).get("api_key") or ""
    protocol = (ch or {}).get("protocol") or "openai"
    model = (ch or {}).get("model") or (model or "").strip() or (cfg.data.get("model") or "deepseek-flash")
    meta = cat_mod.annotate(
        preset=(ch or {}).get("preset") or "",
        base_url=base,
        model_id=model,
    )
    allowed = [e["id"] for e in (meta.get("efforts") or [])]
    effort_api = prov_mod.effort_api(
        effort if effort is not None else cfg.data.get("effort"), allowed,
    )
    if not base or not key:
        emit({"type": "error", "message": "未配置大模型 API"})
        emit({"type": "done"})
        return
    chat_url = prov_mod.chat_url(base, protocol)
    oc_session = _session_id(messages)

    _emit = emit

    def emit(event: dict) -> None:                  # noqa: F811
        if _emit(event) is False:
            raise ChatCancelled()

    ws_plan = web_search_mod.resolve_plan(cfg, ch, override_enabled=web_search)
    ws_mode = ws_plan["mode"]
    web_source_seen: dict[str, dict] = {}

    def emit_web_sources(items: list[dict]) -> None:
        changed: list[dict] = []
        for raw in items or []:
            src = web_search_mod.normalize_web_source(raw, cited=bool(raw.get("cited")) if isinstance(raw, dict) else False)
            if not src:
                continue
            u = src["url"]
            prev = web_source_seen.get(u)
            if prev is None:
                web_source_seen[u] = src
                changed.append(src)
            else:
                updated = False
                if src.get("cited") and not prev.get("cited"):
                    prev["cited"] = True
                    updated = True
                if src.get("title") and (not prev.get("title") or prev.get("title") == prev.get("url")):
                    prev["title"] = src["title"]
                    updated = True
                if src.get("snippet") and not prev.get("snippet"):
                    prev["snippet"] = src["snippet"]
                    updated = True
                if src.get("date") and not prev.get("date"):
                    prev["date"] = src["date"]
                    updated = True
                if updated:
                    changed.append(dict(prev))
        if changed:
            emit({"type": "web_sources", "items": changed})

    prior = _coerce_prior_sources(prior_sources)

    def _build_tools() -> list[dict]:
        t = list(TOOLS)
        if ws_mode == "native":
            t.extend(web_search_mod.native_tools(protocol, read_url=ws_plan["read_url"]))
        elif ws_mode == "api":
            t.extend(web_search_mod.TOOLS)
        if shell_mod.enabled(cfg):
            t.append(shell_mod.TOOL)
        if browser_mod.enabled(cfg):
            t.append(browser_mod.TOOL)
        if api_mod.enabled(cfg):
            t.append(api_mod.TOOL)
        if news_mgr is not None and news_tool_mod.enabled(cfg):
            t.extend(news_tool_mod.TOOLS)
        if market_mgr is not None and market_tool_mod.enabled(cfg):
            t.extend(market_tool_mod.TOOLS)
        t.extend(widget_mod.TOOLS)
        return t

    route_q = ""
    last_user_q = ""
    for m in reversed(messages[-4:]):
        if isinstance(m, dict) and m.get("role") == "user" and isinstance(m.get("content"), str):
            txt = m["content"].strip()
            if txt and not last_user_q:
                last_user_q = txt
            route_q = (route_q + " " + txt).strip()

    def _build_system() -> str:
        s = SYSTEM_PROMPT
        if shell_mod.enabled(cfg):
            s += shell_mod.PROMPT
        if browser_mod.enabled(cfg):
            s += browser_mod.PROMPT
        if ws_mode == "native":
            s += web_search_mod.PROMPT_NATIVE
        elif ws_mode == "api":
            s += web_search_mod.PROMPT_API
        if api_mod.enabled(cfg):
            s += api_mod.PROMPT + api_mod.format_api_catalog(cfg, query=route_q)
        if news_mgr is not None and news_tool_mod.enabled(cfg):
            s += news_tool_mod.PROMPT
        if market_mgr is not None and market_tool_mod.enabled(cfg):
            s += market_tool_mod.PROMPT
        s += widget_mod.PROMPT
        return s

    system = _build_system()
    shell_cwd = shell_mod.session_cwd(cfg)
    convo: list[dict] = [{"role": "system", "content": system}]
    hist: list[dict] = []
    for m in messages[-12:]:
        if m.get("role") not in ("user", "assistant"):
            continue
        raw = m.get("content") or ""
        text = raw.strip() if isinstance(raw, str) else ""
        images = m.get("images") if m.get("role") == "user" else None
        if not text and not images:
            continue
        body = _user_content(text, images) if m.get("role") == "user" else text
        if body == "" or body == []:
            continue
        item = {"role": m["role"], "content": body}
        if (
            m.get("role") == "assistant"
            and ws_mode == "native"
            and protocol == "openai"
            and isinstance(m.get("server_tool_calls"), list)
            and m["server_tool_calls"]
        ):
            item["server_tool_calls"] = m["server_tool_calls"]
        hist.append(item)
    if prior:
        note = {
            "role": "user",
            "content": (
                "以下是当前对话已检索到的本地文档片段，编号固定，可直接用〔n〕引用；"
                "不要重复检索同一片段，信息不足时再检索。"
            ),
        }
        body = {"role": "assistant", "content": _format_prior_sources(prior)}
        if hist:
            convo.extend(hist[:-1])
            convo.append(note)
            convo.append(body)
            convo.append(hist[-1])
        else:
            convo.append(note)
            convo.append(body)
    else:
        convo.extend(hist)

    def _downgrade_native_search() -> bool:
        nonlocal ws_mode
        if ws_mode != "native":
            return False
        ws_mode = "api" if ws_plan["can_api"] else "off"
        if convo and convo[0].get("role") == "system":
            convo[0]["content"] = _build_system()
        for msg in convo:
            if isinstance(msg, dict) and "server_tool_calls" in msg:
                msg.pop("server_tool_calls", None)
        return True

    def _openai_payload(use_tools: bool, thinking: bool) -> dict:
        payload = {
            "model": model,
            "messages": convo,
            "stream": True,
        }
        if use_tools:
            payload["tools"] = _build_tools()
            payload["tool_choice"] = "auto"
        cap = int(cfg.data.get("max_tokens") or 0)
        if cap > 0:
            payload["max_tokens"] = cap
        if thinking:
            payload["thinking"] = {"type": "enabled"}
            if effort_api:
                payload["reasoning_effort"] = effort_api
        else:
            payload["temperature"] = cfg.data.get("temperature", 0.1)
        return payload

    def _anthropic_payload(use_tools: bool, thinking: bool) -> dict:
        system, msgs = _to_anthropic(convo)
        cap = int(cfg.data.get("max_tokens") or 0) or 8192
        payload = {
            "model": model,
            "messages": msgs,
            "stream": True,
            "max_tokens": cap,
        }
        if system:
            payload["system"] = system
        if use_tools:
            payload["tools"] = _anthropic_tools(_build_tools())
        if thinking:
            budget = max(1024, min(int(cap * 0.5), cap - 256))
            payload["thinking"] = {"type": "enabled", "budget_tokens": budget}
            if effort_api:
                payload["reasoning_effort"] = effort_api
        else:
            payload["temperature"] = cfg.data.get("temperature", 0.1)
        return payload

    def _consume_openai(payload: dict):
        buf = ""
        reasoning = ""
        thought = False
        calls: dict[int, dict] = {}
        server_tool_calls: list[dict] = []
        srv_started: dict[str, dict] = {}
        srv_done: set[str] = set()
        split = _ThinkSplit()
        extra = prov_mod.extra_headers(base, protocol, key, oc_session)
        with _post_stream(chat_url, payload, key, extra_headers=extra or None) as resp:
            for choice in _iter_sse(resp):
                ste = choice.get("server_tool_event")
                if isinstance(ste, dict):
                    ste_type = str(ste.get("type") or "").lower()
                    call = ste.get("call") if isinstance(ste.get("call"), dict) else {}
                    cid = str(call.get("id") or f"srv_{ste.get('step', 0)}_{call.get('index', 0)}")
                    if ste_type == "step_reasoning_done":
                        thought = False
                    elif ste_type == "call_started":
                        tname, label, is_fetch = _srv_call_meta(call)
                        srv_started[cid] = {"name": tname, "label": label, "is_fetch": is_fetch}
                        thought = False
                        emit({"type": "tool", "name": tname, "call_id": cid, "args": {"query": label, "engine": "deepseek"}})
                    elif ste_type == "call_completed":
                        info = srv_started.get(cid)
                        if not info:
                            tname, label, is_fetch = _srv_call_meta(call)
                            info = {"name": tname, "label": label, "is_fetch": is_fetch}
                            srv_started[cid] = info
                            emit({"type": "tool", "name": tname, "call_id": cid, "args": {"query": label, "engine": "deepseek"}})
                        srcs = _srv_call_sources(call)
                        if srcs:
                            emit_web_sources(srcs)
                        ok_srv = str(call.get("status") or "completed").lower() != "failed"
                        n_src = len(srcs)
                        note = (
                            f"{n_src} 条网页"
                            if n_src
                            else ("已读取" if (info["is_fetch"] and ok_srv) else ("完成" if ok_srv else "失败"))
                        )
                        srv_done.add(cid)
                        thought = False
                        emit({
                            "type": "tool_result",
                            "call_id": cid,
                            "query": info["label"],
                            "count": n_src or (1 if ok_srv else 0),
                            "exit": 0 if ok_srv else 1,
                            "note": note,
                        })

                delta = choice.get("delta") or choice.get("message") or {}
                stc = (
                    delta.get("server_tool_calls")
                    or choice.get("server_tool_calls")
                    or (choice.get("message") or {}).get("server_tool_calls")
                )
                if isinstance(stc, list) and stc:
                    server_tool_calls = stc
                    for idx_c, c_obj in enumerate(stc):
                        if not isinstance(c_obj, dict):
                            continue
                        cid = str(c_obj.get("id") or f"srv_final_{idx_c}")
                        srcs = _srv_call_sources(c_obj)
                        if srcs:
                            emit_web_sources(srcs)
                        if cid not in srv_done:
                            tname, label, is_fetch = _srv_call_meta(c_obj)
                            if cid not in srv_started:
                                emit({"type": "tool", "name": tname, "call_id": cid, "args": {"query": label, "engine": "deepseek"}})
                            ok_srv = str(c_obj.get("status") or "completed").lower() != "failed"
                            n_src = len(srcs)
                            note = (
                                f"{n_src} 条网页"
                                if n_src
                                else ("已读取" if (is_fetch and ok_srv) else ("完成" if ok_srv else "失败"))
                            )
                            srv_done.add(cid)
                            emit({
                                "type": "tool_result",
                                "call_id": cid,
                                "query": label,
                                "count": n_src or (1 if ok_srv else 0),
                                "exit": 0 if ok_srv else 1,
                                "note": note,
                            })

                anns = (
                    delta.get("annotations")
                    or choice.get("annotations")
                    or (choice.get("message") or {}).get("annotations")
                )
                if isinstance(anns, list) and anns:
                    cited_srcs = web_search_mod.extract_annotations_sources(anns)
                    if cited_srcs:
                        emit_web_sources(cited_srcs)

                rc = _delta_reasoning(delta) + _delta_reasoning(choice)
                text, hid_parts = _content_channels(delta.get("content"))
                if hid_parts:
                    rc += hid_parts
                if _think_channel(delta) and text:
                    rc += text
                    text = ""
                vis, hidden = split.feed(text)
                if hidden:
                    rc += hidden
                if rc:
                    reasoning += rc
                    if not thought:
                        thought = True
                        emit({"type": "thinking"})
                if vis:
                    buf += vis
                    emit({"type": "delta", "text": vis})
                for tc in delta.get("tool_calls") or []:
                    idx = tc.get("index", 0)
                    slot = calls.setdefault(idx, {"id": "", "name": "", "args": ""})
                    if tc.get("id"):
                        slot["id"] = tc["id"]
                    fn = tc.get("function") or {}
                    if fn.get("name"):
                        slot["name"] = fn["name"]
                    if fn.get("arguments"):
                        slot["args"] += fn["arguments"]
        vis, hidden = split.flush()
        if hidden:
            reasoning += hidden
            if hidden and not thought:
                thought = True
                emit({"type": "thinking"})
        if vis:
            buf += vis
            emit({"type": "delta", "text": vis})
        if reasoning:
            emit({"type": "reasoning", "text": reasoning})
        if server_tool_calls:
            emit({"type": "server_tool_calls", "items": server_tool_calls})
        return buf, calls, reasoning, server_tool_calls

    def _consume_anthropic(payload: dict):
        buf = ""
        reasoning = ""
        thought = False
        calls: dict[int, dict] = {}
        index_map: dict[int, int] = {}
        srv_blocks: dict[int, dict] = {}
        srv_by_id: dict[str, dict] = {}
        next_idx = 0
        extra = prov_mod.extra_headers(base, protocol, key, oc_session)

        def _flush_srv_block(slot: dict) -> None:
            if slot.get("emitted"):
                return
            try:
                inp = json.loads(slot.get("args") or "{}") if slot.get("args") else {}
            except ValueError:
                inp = {}
            if not isinstance(inp, dict):
                inp = {}
            is_fetch = bool(slot.get("is_fetch"))
            if is_fetch:
                label = web_search_mod.action_label("web_fetch", {"url": inp.get("url") or ""})
            else:
                q = inp.get("query") or ""
                if not q and isinstance(inp.get("queries"), list):
                    q = " / ".join(str(x).strip() for x in inp["queries"] if str(x).strip())
                label = (str(q).strip() or "联网搜索")[:80]
            slot["label"] = label
            slot["emitted"] = True
            emit({"type": "tool", "name": slot["name"], "call_id": slot["id"], "args": {"query": label, "engine": "deepseek"}})

        with _post_stream(chat_url, payload, key, extra_headers=extra) as resp:
            for _ev, obj in _iter_event_sse(resp):
                typ = obj.get("type") or _ev
                if typ == "content_block_start":
                    block = obj.get("content_block") or {}
                    bidx = obj.get("index", 0)
                    btype = block.get("type")
                    if btype in ("thinking", "reasoning"):
                        if not thought:
                            thought = True
                            emit({"type": "thinking"})
                    elif btype == "tool_use":
                        i = next_idx
                        next_idx += 1
                        index_map[bidx] = i
                        args = ""
                        if isinstance(block.get("input"), dict) and block["input"]:
                            args = json.dumps(block["input"], ensure_ascii=False)
                        calls[i] = {
                            "id": block.get("id") or "",
                            "name": block.get("name") or "",
                            "args": args,
                        }
                    elif btype == "server_tool_use":
                        thought = False
                        bname = str(block.get("name") or "")
                        is_fetch = ("fetch" in bname.lower() or "read_url" in bname.lower())
                        cid = str(block.get("id") or f"srv_a_{bidx}")
                        args = ""
                        if isinstance(block.get("input"), dict) and block["input"]:
                            args = json.dumps(block["input"], ensure_ascii=False)
                        slot = {
                            "id": cid,
                            "name": "web_fetch" if is_fetch else "web_search",
                            "is_fetch": is_fetch,
                            "args": args,
                            "label": "读取网页" if is_fetch else "联网搜索",
                            "emitted": False,
                        }
                        srv_blocks[bidx] = slot
                        srv_by_id[cid] = slot
                        if args:
                            _flush_srv_block(slot)
                    elif btype in ("web_search_tool_result", "web_fetch_tool_result"):
                        thought = False
                        cid = str(block.get("tool_use_id") or "")
                        slot = srv_by_id.get(cid)
                        if slot and not slot.get("emitted"):
                            _flush_srv_block(slot)
                        content = block.get("content")
                        is_err = isinstance(content, dict) and str(content.get("type") or "").endswith("_error")
                        srcs: list[dict] = []
                        if isinstance(content, list):
                            for item in content:
                                ns = web_search_mod.normalize_web_source(item, cited=False)
                                if ns:
                                    srcs.append(ns)
                        elif isinstance(content, dict) and not is_err:
                            inner = content.get("content") if isinstance(content.get("content"), dict) else {}
                            ns = web_search_mod.normalize_web_source(
                                {
                                    "url": content.get("url") or inner.get("url") or "",
                                    "title": content.get("title") or inner.get("title") or "",
                                    "date": content.get("retrieved_at") or "",
                                },
                                cited=False,
                            )
                            if ns:
                                srcs.append(ns)
                        if srcs:
                            emit_web_sources(srcs)
                        is_fetch_res = (btype == "web_fetch_tool_result") or bool(slot and slot.get("is_fetch"))
                        note = (
                            "失败"
                            if is_err
                            else (f"{len(srcs)} 条网页" if (srcs and not is_fetch_res) else ("已读取" if is_fetch_res else "完成"))
                        )
                        emit({
                            "type": "tool_result",
                            "call_id": cid,
                            "query": (slot or {}).get("label") or ("读取网页" if is_fetch_res else "联网搜索"),
                            "count": len(srcs) or (0 if is_err else 1),
                            "exit": 1 if is_err else 0,
                            "note": note,
                        })
                elif typ == "content_block_delta":
                    delta = obj.get("delta") or {}
                    dtyp = delta.get("type")
                    bidx = obj.get("index", 0)
                    if dtyp == "text_delta":
                        text = delta.get("text") or ""
                        if text:
                            buf += text
                            emit({"type": "delta", "text": text})
                    elif dtyp in ("thinking_delta", "reasoning_delta"):
                        piece = delta.get("thinking") or delta.get("text") or delta.get("reasoning") or ""
                        if piece:
                            reasoning += piece
                            if not thought:
                                thought = True
                                emit({"type": "thinking"})
                    elif dtyp == "input_json_delta":
                        i = index_map.get(bidx)
                        if i is not None:
                            calls[i]["args"] += delta.get("partial_json") or ""
                        elif bidx in srv_blocks:
                            srv_blocks[bidx]["args"] += delta.get("partial_json") or ""
                    elif dtyp == "citations_delta":
                        cit = delta.get("citation")
                        if isinstance(cit, dict):
                            cited_srcs = web_search_mod.extract_annotations_sources([cit])
                            if cited_srcs:
                                emit_web_sources(cited_srcs)
                elif typ == "content_block_stop":
                    bidx = obj.get("index", 0)
                    slot = srv_blocks.get(bidx)
                    if slot and not slot.get("emitted"):
                        _flush_srv_block(slot)
                elif typ == "error":
                    err = obj.get("error") or obj
                    msg = err.get("message") if isinstance(err, dict) else str(err)
                    emit({"type": "error", "message": f"接口错误: {msg}"})
                    emit({"type": "done"})
                    raise ChatCancelled()
        if reasoning:
            emit({"type": "reasoning", "text": reasoning})
        return buf, calls, reasoning, []

    def call_model(use_tools: bool):
        last_detail = ""
        last_code = 0
        want_think = meta.get("reasoning") is not False
        tries = (True, False) if want_think else (False,)
        for thinking in tries:
            downgraded_here = False
            while True:
                retry_after_downgrade = False
                for attempt in range(3):
                    try:
                        if protocol == "anthropic":
                            return _consume_anthropic(_anthropic_payload(use_tools, thinking))
                        return _consume_openai(_openai_payload(use_tools, thinking))
                    except urllib.error.HTTPError as e:
                        last_code = e.code
                        last_detail = prov_mod.http_error_text(e)
                        if (
                            use_tools
                            and ws_mode == "native"
                            and not downgraded_here
                            and (_looks_like_native_search_error(e.code, last_detail) or not thinking)
                            and e.code in (400, 422)
                        ):
                            downgraded_here = True
                            if _downgrade_native_search():
                                retry_after_downgrade = True
                                break
                        if thinking and e.code in (400, 422):
                            break
                        emit({"type": "error", "message": f"接口错误 {e.code}: {last_detail}"})
                        emit({"type": "done"})
                        raise ChatCancelled()
                    except Exception as e:
                        if attempt < 2 and prov_mod.is_transient_ssl(e):
                            time.sleep(0.4 * (attempt + 1))
                            continue
                        raise
                if retry_after_downgrade:
                    continue
                break
        emit({"type": "error", "message": f"接口错误 {last_code}: {last_detail}"})
        emit({"type": "done"})
        raise ChatCancelled()

    next_no = max((s["n"] for s in prior), default=0) + 1
    used: set[int] = {s["chunk_id"] for s in prior}
    last_had_tools = False
    used_browser = False
    if browser_mod.enabled(cfg):
        browser_mod.notify_session_start()

    try:
        for _round in range(max_rounds):
            try:
                content_buf, tool_calls, reasoning, server_tool_calls = call_model(True)
            except ChatCancelled:
                raise
            except urllib.error.HTTPError as e:
                emit({"type": "error", "message": f"接口错误 {e.code}: {prov_mod.http_error_text(e)}"})
                emit({"type": "done"})
                return
            except Exception as e:                  # noqa: BLE001
                emit({"type": "error", "message": f"连接失败: {prov_mod.network_error_text(e)}"})
                emit({"type": "done"})
                return

            if not tool_calls:
                last_had_tools = False
                break
            last_had_tools = True

            ordered = [tool_calls[k] for k in sorted(tool_calls)]
            has_ask = any((s.get("name") or "") == "ask_user" for s in ordered)
            cb_trim = content_buf.strip()
            if cb_trim and not has_ask and len(cb_trim) < 60 and "```" not in cb_trim and "\n" not in cb_trim:
                emit({"type": "reset"})

            asst = {
                "role": "assistant",
                "content": content_buf or "",
                "tool_calls": [
                    {
                        "id": s["id"] or f"call_{i}",
                        "type": "function",
                        "function": {"name": s["name"], "arguments": s["args"] or "{}"},
                    }
                    for i, s in enumerate(ordered)
                ],
            }
            if reasoning:
                asst["reasoning_content"] = reasoning
            if server_tool_calls and protocol == "openai":
                asst["server_tool_calls"] = server_tool_calls
            convo.append(asst)

            ask_qs: list[dict] = []
            pending_images: list[dict] = []
            for i, slot in enumerate(ordered):
                call_id = slot["id"] or f"call_{i}"
                name = slot["name"] or "search_docs"
                try:
                    args = json.loads(slot["args"] or "{}")
                except ValueError:
                    args = {}
                if name == "ask_user":
                    ask_qs.extend(_normalize_ask(args))
                    continue

                if name in ("web_search", "web_fetch"):
                    label = web_search_mod.action_label(name, args)
                    emit({"type": "tool", "name": name, "call_id": call_id, "args": {"query": label, "engine": "deepseek-api"}})
                    try:
                        text, ok_ws, note_ws, cnt_ws, wsrcs = web_search_mod.run_web_search_tool(
                            name,
                            args,
                            ws_plan["api_base"],
                            ws_plan["api_key"],
                            default_count=ws_plan["count"],
                            ori_question=last_user_q,
                        )
                    except Exception as e:
                        text, ok_ws, note_ws, cnt_ws, wsrcs = f"Error: {e}", False, "失败", 0, []
                    convo.append({"role": "tool", "tool_call_id": call_id, "content": text})
                    if wsrcs:
                        emit_web_sources(wsrcs)
                    emit({
                        "type": "tool_result",
                        "call_id": call_id,
                        "query": label,
                        "count": cnt_ws,
                        "exit": 0 if ok_ws else 1,
                        "note": note_ws,
                    })
                    continue

                if name in ("search_news", "entity_brief", "news_digest"):
                    label = news_tool_mod.action_label(name, args)
                    emit({"type": "tool", "name": name, "args": {"query": label}})
                    try:
                        text, ok_n, note, cnt_n = news_tool_mod.run_news_tool(name, args, news_mgr)
                    except Exception as e:
                        text, ok_n, note, cnt_n = f"Error: {e}", False, "失败", 0
                    convo.append({"role": "tool", "tool_call_id": call_id, "content": text})
                    emit({
                        "type": "tool_result",
                        "query": label,
                        "count": cnt_n,
                        "exit": 0 if ok_n else 1,
                        "note": note,
                    })
                    continue

                if name in ("market_query", "macro_query", "quant_backtest", "quant_factor_eval"):
                    label = market_tool_mod.action_label(name, args)
                    emit({"type": "tool", "name": name, "args": {"query": label}})
                    try:
                        if name in ("quant_backtest", "quant_factor_eval"):
                            text, ok_m, note, cnt_m = market_tool_mod.run_quant_tool(name, args, quant_mgr)
                        else:
                            text, ok_m, note, cnt_m = market_tool_mod.run_market_tool(name, args, market_mgr)
                    except Exception as e:
                        text, ok_m, note, cnt_m = f"Error: {e}", False, "失败", 0
                    convo.append({"role": "tool", "tool_call_id": call_id, "content": text})
                    emit({
                        "type": "tool_result",
                        "query": label,
                        "count": cnt_m,
                        "exit": 0 if ok_m else 1,
                        "note": note,
                    })
                    continue

                if name == "render_visual":
                    label = widget_mod.action_label(args)
                    emit({"type": "tool", "name": name, "args": {"query": label}})
                    try:
                        text, ok_v, note_v, visual_obj = widget_mod.run_render_visual(args, cfg, widget_store)
                    except Exception as e:
                        text, ok_v, note_v, visual_obj = f"Error: {e}", False, "失败", None
                    convo.append({"role": "tool", "tool_call_id": call_id, "content": text})
                    if ok_v and visual_obj:
                        emit({"type": "visual", "visual": visual_obj})
                    emit({
                        "type": "tool_result",
                        "query": label,
                        "count": 1 if ok_v else 0,
                        "exit": 0 if ok_v else 1,
                        "note": note_v,
                    })
                    continue

                if name == "call_api":
                    label = api_mod.action_label(args)
                    act = str(args.get("action") or "request").strip().lower()
                    emit({"type": "tool", "name": "call_api", "args": {"action": act, "query": label}})
                    try:
                        text, ok_api, note = api_mod.run_call_api(args, cfg)
                    except Exception as e:
                        text, ok_api, note = json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False), False, "失败"
                    if act in ("save", "delete", "discover") and convo and convo[0].get("role") == "system":
                        convo[0]["content"] = _build_system()
                    convo.append({"role": "tool", "tool_call_id": call_id, "content": text})
                    emit({
                        "type": "tool_result",
                        "query": label,
                        "count": 1 if ok_api else 0,
                        "exit": 0 if ok_api else 1,
                        "note": note,
                    })
                    continue

                if name == "browser":
                    used_browser = True
                    act_b = str(args.get("action") or "status").strip()
                    label = browser_mod.action_label(args)
                    emit({"type": "tool", "name": "browser", "args": {"action": act_b, "query": label}})
                    emit({
                        "type": "browser_panel",
                        "state": "waiting_human" if act_b == "wait_for_human" else "active",
                        "action": act_b,
                        "label": label,
                        "reason": str(args.get("reason") or "") if act_b == "wait_for_human" else "",
                    })
                    try:
                        text, ok_b, shot_img = browser_mod.run_browser(args)
                    except Exception as e:
                        text, ok_b, shot_img = f"Error: {e}", False, None
                    convo.append({"role": "tool", "tool_call_id": call_id, "content": text})
                    if shot_img and meta.get("image"):
                        pending_images.append(shot_img)
                    emit({
                        "type": "tool_result",
                        "query": label,
                        "count": 1 if ok_b else 0,
                        "exit": 0 if ok_b else 1,
                        "note": "完成" if ok_b else "失败",
                    })
                    continue

                if name == "pwsh":
                    label = (args.get("command") or args.get("description") or "").strip()
                    emit({"type": "tool", "name": name, "args": {"command": label, "query": label}})
                    try:
                        text, code = shell_mod.run_pwsh(args, shell_cwd)
                    except shell_mod.ShellError as e:
                        text, code = f"Error: {e}", None
                    except Exception as e:
                        text, code = f"Error: {e}", None
                    convo.append({"role": "tool", "tool_call_id": call_id, "content": text})
                    note = "完成" if code == 0 else ("失败" if code is not None else "未执行")
                    emit({
                        "type": "tool_result",
                        "query": label,
                        "count": 1 if code == 0 else 0,
                        "exit": code,
                        "note": note,
                    })
                    continue

                if name in ("read_doc", "read_regulation"):
                    label = (args.get("title") or args.get("doc_no") or args.get("query") or "").strip()
                    emit({"type": "tool", "name": "read_doc", "args": {"title": label, "query": label}})
                    try:
                        note, kept, rest = _prepare_read(con, args, used, cfg)
                    except Exception as e:
                        convo.append({"role": "tool", "tool_call_id": call_id,
                                      "content": f"读取失败: {e}"})
                        emit({"type": "tool_result", "query": label, "count": 0})
                        continue
                    if not kept:
                        convo.append({"role": "tool", "tool_call_id": call_id, "content": note})
                        emit({"type": "tool_result", "query": label, "count": 0})
                        continue
                    body, sources = _format_results(kept, next_no)
                    for c in kept:
                        used.add(c["chunk_id"])
                    next_no += len(kept)
                    extra = ""
                    if rest:
                        extra = (
                            f"\n\n还有 {len(rest)} 段未展开。如需继续阅读，再次调用 read_doc "
                            "并带上 article 或 query。\n" + _doc_catalog(rest[:40])
                        )
                    convo.append({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "content": note + "\n\n" + body + extra,
                    })
                    emit({"type": "tool_result", "query": label, "count": len(kept)})
                    emit({"type": "sources", "items": sources})
                    continue

                query = (args.get("query") or "").strip()
                dept = (args.get("dept") or "").strip()
                doc_type = (args.get("doc_type") or "").strip()
                emit({"type": "tool", "name": "search_docs", "args": {"query": query, "dept": dept, "doc_type": doc_type}})

                if name not in ("search_docs", "search_regulations", ""):
                    known = "search_docs、read_doc、ask_user"
                    if ws_mode == "api":
                        known += "、web_search、web_fetch"
                    if shell_mod.enabled(cfg):
                        known += "、pwsh"
                    if browser_mod.enabled(cfg):
                        known += "、browser"
                    if api_mod.enabled(cfg):
                        known += "、call_api"
                    if news_mgr is not None and news_tool_mod.enabled(cfg):
                        known += "、search_news、entity_brief、news_digest"
                    if market_mgr is not None and market_tool_mod.enabled(cfg):
                        known += "、market_query、macro_query"
                    convo.append({"role": "tool", "tool_call_id": call_id,
                                  "content": f"未知工具 {name}。可用 {known}。"})
                    continue

                if not query:
                    convo.append({"role": "tool", "tool_call_id": call_id,
                                  "content": "检索关键词为空，请给出 2-10 字的短词。"})
                    continue

                try:
                    items = search_mod.search(con, query, dept=dept, doc_type=doc_type, limit=TOOL_LIMIT, cfg=cfg)
                except Exception as e:
                    convo.append({"role": "tool", "tool_call_id": call_id,
                                  "content": f"检索失败: {e}"})
                    continue

                fresh = [c for c in items if c["chunk_id"] not in used]
                if not fresh:
                    convo.append({"role": "tool", "tool_call_id": call_id,
                                  "content": f"关键词「{query}」没有检索到新的片段，请换一个词。"})
                    emit({"type": "tool_result", "query": query, "count": 0})
                    continue

                text, sources = _format_results(fresh, next_no)
                for c in fresh:
                    used.add(c["chunk_id"])
                next_no += len(fresh)
                convo.append({"role": "tool", "tool_call_id": call_id, "content": text})
                emit({"type": "tool_result", "query": query, "count": len(fresh)})
                emit({"type": "sources", "items": sources})
                if not has_ask and _round >= max_rounds // 2:
                    convo.append({
                        "role": "user",
                        "content": "若现有信息已足够作答，请直接给出结论；不要重复检索相同的词。",
                    })

            if pending_images:
                convo.append({
                    "role": "user",
                    "content": _user_content("[浏览器实时画面截图]", pending_images),
                })

            if ask_qs:
                emit({"type": "ask", "questions": ask_qs[:3]})
                emit({"type": "done"})
                return
            if has_ask:
                for i, slot in enumerate(ordered):
                    if (slot.get("name") or "") != "ask_user":
                        continue
                    convo.append({
                        "role": "tool",
                        "tool_call_id": slot["id"] or f"call_{i}",
                        "content": "提问格式无效：每题需要 prompt 和至少 2 个选项。请重新调用 ask_user。",
                    })
                continue

        if last_had_tools:
            convo.append({
                "role": "user",
                "content": "请基于现有信息直接给出回答，不要继续调用工具。",
            })
            try:
                call_model(False)
            except ChatCancelled:
                raise
            except Exception as e:
                emit({"type": "error", "message": f"生成回答失败: {e}"})

        emit({"type": "done"})
    except ChatCancelled:
        return
    finally:
        if used_browser:
            try:
                emit({"type": "browser_panel", "state": "session_end"})
            except Exception:
                pass
        if browser_mod.enabled(cfg):
            browser_mod.notify_session_end(used_browser)


_TITLE_SYSTEM = (
    "把下面的第一次对话概括成一个中文标题，不超过16个字。"
    "只输出标题本身，不要引号、句号、书名号或解释。"
    "标题要体现用户真正要问的事情。"
)


def fallback_title(question: str) -> str:
    s = re.sub(r"\s+", " ", question or "").strip()
    s = re.sub(r"^【附件：[^】]*】", "", s).strip()
    if not s:
        return "新对话"
    if len(s) <= 18:
        return s
    return s[:18].rstrip("，。、；,. ")


def _clean_title(text: str) -> str:
    s = re.sub(r"(?is)<think>[\s\S]*?</think>", "", text or "")
    s = re.sub(r"(?is)<\|thought\|>[\s\S]*?<\|/thought\|>", "", s)
    s = s.strip()
    if not s:
        return ""
    s = s.splitlines()[0].strip()
    s = re.sub(r"^(标题|题目)\s*[:：]\s*", "", s)
    s = s.strip("「」\"'“”《》『』")
    s = re.sub(r"\s+", " ", s).strip()
    s = s.strip("。.!！?？、,，;；:：")
    if len(s) > 18:
        s = s[:18].rstrip("，。、 ")
    return s


def _extract_message_text(data: dict) -> str:
    if not isinstance(data, dict):
        return ""
    choices = data.get("choices") or []
    if choices and isinstance(choices[0], dict):
        msg = choices[0].get("message") or {}
        content = msg.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "".join(
                str(p.get("text") or "") for p in content if isinstance(p, dict)
            )
    content = data.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(p.get("text") or "")
            for p in content
            if isinstance(p, dict) and p.get("type") in (None, "text", "")
        )
    return ""


def summarize_title(cfg, question: str, answer: str,
                    provider_id: str | None = None,
                    model: str | None = None) -> tuple[str, bool]:
    local = fallback_title(question or answer)
    ch = prov_mod.resolve(getattr(cfg, "data", {}) or {}, provider_id, model)
    base = (ch or {}).get("base_url") or ""
    key = (ch or {}).get("api_key") or ""
    protocol = (ch or {}).get("protocol") or "openai"
    model_id = (ch or {}).get("model") or (model or "").strip() or ""
    if not base or not key or not model_id:
        return local, False
    q = (question or "").strip()[:500]
    a = (answer or "").strip()[:800]
    user = "问：" + q
    if a:
        user += "\n答：" + a
    url = prov_mod.chat_url(base, protocol)
    if prov_mod.protocol_of(protocol) == "anthropic":
        payload = {
            "model": model_id,
            "max_tokens": 64,
            "temperature": 0.2,
            "system": _TITLE_SYSTEM,
            "messages": [{"role": "user", "content": user}],
        }
    else:
        payload = {
            "model": model_id,
            "max_tokens": 64,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": _TITLE_SYSTEM},
                {"role": "user", "content": user},
            ],
        }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "User-Agent": prov_mod.USER_AGENT,
        "Connection": "close",
    }
    extra = prov_mod.extra_headers(base, protocol, key, "o2-title")
    if extra:
        headers.update(extra)
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST",
    )
    try:
        resp = prov_mod.urlopen(req, timeout=25, stream=False)
        try:
            raw = resp.read()
        finally:
            close = getattr(resp, "close", None)
            if close:
                close()
        data = json.loads(raw.decode("utf-8", "replace"))
    except Exception:
        return local, False
    title = _clean_title(_extract_message_text(data if isinstance(data, dict) else {}))
    if not title:
        return local, False
    return title, True
