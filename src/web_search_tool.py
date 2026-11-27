from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

import providers as prov_mod

DEFAULT_DEEPSEEK_BASE = "https://api.deepseek.com"
SEARCH_MODES = ("auto", "native", "api")
MAX_FETCH_CHARS = 24000
MAX_QUERY_CHARS = 128

PROMPT_NATIVE = """
15. 当前已启用 DeepSeek 官方联网搜索能力（deepseek_web_search / deepseek_read_url）。遇到时效性问题、最新政策/新闻/行情/产品动态、需核查外部事实，或用户消息包含网页链接时，优先直接利用官方联网搜索与读页能力获取最新信息并给出准确引用；不要对网页结果伪造本地知识库的〔n〕编号。需要登录态、网页交互点击或视觉截图时再调用 browser。"""

PROMPT_API = """
15. 当前已启用 DeepSeek 官方联网搜索工具（web_search / web_fetch）。遇到时效性问题、最新政策/新闻/行情/技术文档或外部事实核查时，优先调用 web_search 检索（支持 site:、-site:、精确引号等语法），需要深入阅读某网页正文时再调用 web_fetch 获取 Markdown 全文。网页结果请直接用 Markdown 链接标注来源，不得伪造本地知识库的〔n〕编号。仅在需要登录态、交互操作、动态渲染页面或查看页面截图时才调用 browser。"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "调用 DeepSeek 官方 Web Search API 实时搜索互联网公开信息，返回带综合相关性评分"
                "（rerank_score 0-3，≥1.5 为高质量）、标题、URL、长摘要（summary）和站点信息的排序结果。"
                "支持 site:、-site: 和精确短语引号语法。适合查最新资讯、官方文档、政策公告与外部事实核查。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词或检索式（1-128 字符，支持 site: / -site: / \"短语\"）",
                    },
                    "count": {
                        "type": "integer",
                        "description": "返回结果条数（1-20，不填则使用系统默认配置）",
                    },
                    "need_content": {
                        "type": "boolean",
                        "description": "是否直接返回完整网页正文（默认 false，仅在需立刻细读原文时设为 true）",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch",
            "description": (
                "调用 DeepSeek 官方 Fetch API 抓取单个公开网页（http/https）并返回清洗后的 Markdown 正文与标题。"
                "比启动完整浏览器更轻快，适合阅读文章、文档与公告详情。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要读取的网页完整 URL（必须为 http:// 或 https://）",
                    },
                },
                "required": ["url"],
            },
        },
    },
]


def normalize_mode(raw) -> str:
    s = str(raw or "").strip().lower()
    return s if s in SEARCH_MODES else "auto"


def is_deepseek_official(preset: str = "", base_url: str = "") -> bool:
    host = prov_mod.host_of(base_url)
    if host:
        return host == "deepseek.com" or host.endswith(".deepseek.com")
    return prov_mod.canonical_preset(preset) == "deepseek"


def normalize_deepseek_root(base_url: str = "") -> str:
    raw = (base_url or "").strip().rstrip("/")
    if not raw:
        return DEFAULT_DEEPSEEK_BASE
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urllib.parse.urlparse(raw)
    if not parsed.hostname:
        return DEFAULT_DEEPSEEK_BASE
    path = (parsed.path or "").rstrip("/")
    for suf in (
        "/chat/completions",
        "/anthropic/v1/messages",
        "/anthropic/messages",
        "/anthropic/v1",
        "/anthropic",
        "/v1/messages",
        "/v1/tools/search",
        "/v1/tools/fetch",
        "/v1",
        "/beta",
    ):
        if path.lower().endswith(suf):
            path = path[: -len(suf)]
            break
    root = f"{parsed.scheme}://{parsed.netloc}{path}".rstrip("/")
    return root or DEFAULT_DEEPSEEK_BASE


def search_endpoint(base_url: str = "") -> str:
    return normalize_deepseek_root(base_url) + "/v1/tools/search"


def fetch_endpoint(base_url: str = "") -> str:
    return normalize_deepseek_root(base_url) + "/v1/tools/fetch"


def resolve_deepseek_credentials(cfg_data: dict | None, active_channel: dict | None = None) -> tuple[str, str]:
    """解析可用于 DeepSeek 官方 Search/Fetch API 的 (base_url, api_key)。"""
    data = cfg_data if isinstance(cfg_data, dict) else {}
    custom_key = str(data.get("web_search_api_key") or "").strip()
    custom_base = str(data.get("web_search_base_url") or "").strip()
    if custom_key:
        return normalize_deepseek_root(custom_base or DEFAULT_DEEPSEEK_BASE), custom_key

    if isinstance(active_channel, dict):
        if (
            is_deepseek_official(active_channel.get("preset") or "", active_channel.get("base_url") or "")
            and (active_channel.get("api_key") or "").strip()
        ):
            base = custom_base or (active_channel.get("base_url") or DEFAULT_DEEPSEEK_BASE)
            return normalize_deepseek_root(base), str(active_channel.get("api_key") or "").strip()

    for p in data.get("providers") or []:
        if not isinstance(p, dict):
            continue
        key = str(p.get("api_key") or "").strip()
        if not key:
            continue
        if is_deepseek_official(p.get("preset") or "", p.get("base_url") or ""):
            base = custom_base or (p.get("base_url") or DEFAULT_DEEPSEEK_BASE)
            return normalize_deepseek_root(base), key

    return normalize_deepseek_root(custom_base or DEFAULT_DEEPSEEK_BASE), ""


def deepseek_ready(cfg_data: dict | None) -> bool:
    _base, key = resolve_deepseek_credentials(cfg_data)
    return bool(key)


def native_supported(active_channel: dict | None, protocol: str = "openai") -> bool:
    if not isinstance(active_channel, dict):
        return False
    proto = prov_mod.protocol_of(protocol or active_channel.get("protocol"))
    if proto not in ("openai", "anthropic"):
        return False
    if not is_deepseek_official(active_channel.get("preset") or "", active_channel.get("base_url") or ""):
        return False
    return bool((active_channel.get("api_key") or "").strip())


def native_tools(protocol: str = "openai", read_url: bool = True) -> list[dict]:
    """返回 DeepSeek 官方服务端内置 Web Tools 声明。"""
    _proto = prov_mod.protocol_of(protocol)
    items = [{"type": "deepseek_web_search", "name": "deepseek_web_search"}]
    if read_url:
        items.append({"type": "deepseek_read_url", "name": "deepseek_read_url"})
    return items


def resolve_plan(cfg, active_channel: dict | None, override_enabled: bool | None = None) -> dict:
    """决定当前对话的联网搜索策略：native / api / off。"""
    data = getattr(cfg, "data", None) or (cfg if isinstance(cfg, dict) else {})
    enabled = bool(data.get("web_search", True)) if override_enabled is None else bool(override_enabled)
    pref = normalize_mode(data.get("web_search_mode"))
    read_url = bool(data.get("web_search_read_url", True))
    count = int(data.get("web_search_count") or 8)
    count = max(1, min(20, count))
    protocol = prov_mod.protocol_of((active_channel or {}).get("protocol"))
    api_base, api_key = resolve_deepseek_credentials(data, active_channel)
    can_native = native_supported(active_channel, protocol)
    can_api = bool(api_key)

    if not enabled:
        return {
            "enabled": False,
            "mode": "off",
            "preferred": pref,
            "read_url": read_url,
            "count": count,
            "api_base": api_base,
            "api_key": api_key,
            "can_native": can_native,
            "can_api": can_api,
            "reason": "",
        }

    if pref == "native":
        if can_native:
            mode = "native"
            reason = ""
        else:
            mode = "off"
            reason = "当前渠道非 DeepSeek 官方接口，无法使用原生服务端搜索"
    elif pref == "api":
        if can_api:
            mode = "api"
            reason = ""
        else:
            mode = "off"
            reason = "未配置 DeepSeek API Key，无法调用 DeepSeek Search API"
    else:  # auto
        if can_native:
            mode = "native"
            reason = ""
        elif can_api:
            mode = "api"
            reason = ""
        else:
            mode = "off"
            reason = "未配置 DeepSeek API Key，请在设置中配置 DeepSeek 渠道或独立搜索密钥"

    return {
        "enabled": enabled and mode != "off",
        "mode": mode,
        "preferred": pref,
        "read_url": read_url,
        "count": count,
        "api_base": api_base,
        "api_key": api_key,
        "can_native": can_native,
        "can_api": can_api,
        "reason": reason,
    }


def _clean_text(raw, limit: int = 0) -> str:
    s = str(raw or "").strip()
    if limit > 0 and len(s) > limit:
        s = s[:limit].strip()
    return s


def _validate_http_url(url: str) -> str:
    u = str(url or "").strip()
    if not u:
        raise ValueError("URL 不能为空")
    if len(u) > 8192:
        raise ValueError("URL 长度超过 8192 字符限制")
    parsed = urllib.parse.urlparse(u)
    if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname:
        raise ValueError("仅支持有效的 http:// 或 https:// 网址")
    if parsed.username or parsed.password:
        raise ValueError("URL 不允许包含用户名或密码")
    return u


def _post_json(url: str, payload: dict, api_key: str, timeout: float = 35.0) -> dict:
    if not (api_key or "").strip():
        raise RuntimeError("缺少 DeepSeek API Key")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key.strip()}",
        "Accept": "application/json",
        "User-Agent": prov_mod.USER_AGENT,
        "Connection": "close",
    }
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with prov_mod.urlopen(req, timeout=timeout, stream=False) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"DeepSeek Search HTTP {e.code}: {prov_mod.http_error_text(e)}") from None
    except Exception as e:
        raise RuntimeError(f"DeepSeek Search 请求失败: {prov_mod.network_error_text(e)}") from None
    try:
        data = json.loads(raw.decode("utf-8", "replace"))
    except ValueError:
        raise RuntimeError("DeepSeek Search 返回了无法解析的 JSON 响应") from None
    if not isinstance(data, dict):
        raise RuntimeError("DeepSeek Search 返回格式异常")
    return data


def normalize_web_source(item: dict, *, cited: bool = False) -> dict | None:
    if not isinstance(item, dict):
        return None
    url = str(item.get("url") or "").strip()
    if not url or not url.lower().startswith(("http://", "https://")):
        return None
    title = str(item.get("title") or "").strip()
    if not title:
        title = urllib.parse.urlparse(url).hostname or url
    host = urllib.parse.urlparse(url).hostname or ""
    site = str(item.get("site_name") or item.get("site") or "").strip() or host
    snippet = str(item.get("snippet") or item.get("summary") or "").strip()
    if len(snippet) > 360:
        snippet = snippet[:360].rstrip() + "…"
    date_str = str(item.get("date") or item.get("published_at") or item.get("page_age") or "").strip()
    score = item.get("rerank_score")
    try:
        score = round(float(score), 2) if score is not None else None
    except (TypeError, ValueError):
        score = None
    out = {
        "url": url,
        "title": title,
        "site": site,
        "snippet": snippet,
        "date": date_str,
        "cited": bool(cited or item.get("cited")),
    }
    if item.get("site_icon"):
        out["icon"] = str(item.get("site_icon") or "").strip()
    if score is not None:
        out["score"] = score
    return out


def extract_annotations_sources(annotations) -> list[dict]:
    """从 DeepSeek Chat Completions / Anthropic citations 提取标准网页引用列表。"""
    out: list[dict] = []
    if not isinstance(annotations, list):
        return out
    for ann in annotations:
        if not isinstance(ann, dict):
            continue
        inner = ann.get("url_citation") if isinstance(ann.get("url_citation"), dict) else ann
        src = normalize_web_source(
            {
                "url": inner.get("url") or ann.get("url") or "",
                "title": inner.get("title") or ann.get("title") or "",
                "snippet": inner.get("cited_text") or ann.get("cited_text") or inner.get("snippet") or "",
                "date": inner.get("page_age") or inner.get("published_at") or "",
            },
            cited=True,
        )
        if src:
            out.append(src)
    return out


def call_search_api(
    base_url: str,
    api_key: str,
    query: str,
    *,
    count: int = 8,
    ori_question: str = "",
    need_content: bool = False,
    localization: str = "",
) -> dict:
    q = _clean_text(query, MAX_QUERY_CHARS)
    if not q:
        raise ValueError("搜索关键词不能为空")
    n = max(1, min(50, int(count or 8)))
    payload: dict = {
        "query": q,
        "count": n,
        "need_content": bool(need_content),
    }
    oq = _clean_text(ori_question, MAX_QUERY_CHARS)
    if oq:
        payload["ori_question"] = oq
    loc = _clean_text(localization, 64)
    if loc:
        payload["localization"] = loc
    return _post_json(search_endpoint(base_url), payload, api_key, timeout=35.0)


def call_fetch_api(base_url: str, api_key: str, url: str) -> dict:
    clean_url = _validate_http_url(url)
    return _post_json(fetch_endpoint(base_url), {"url": clean_url}, api_key, timeout=45.0)


def action_label(name: str, args: dict) -> str:
    a = args if isinstance(args, dict) else {}
    if name == "web_fetch":
        u = str(a.get("url") or "").strip()
        if u:
            try:
                p = urllib.parse.urlparse(u)
                short = (p.hostname or "") + (p.path if p.path and p.path != "/" else "")
                return (short or u)[:80]
            except ValueError:
                return u[:80]
        return "读取网页"
    q = str(a.get("query") or "").strip()
    return (q or "联网搜索")[:80]


def run_web_search_tool(
    name: str,
    args: dict,
    base_url: str,
    api_key: str,
    *,
    default_count: int = 8,
    ori_question: str = "",
) -> tuple[str, bool, str, int, list[dict]]:
    a = args if isinstance(args, dict) else {}
    if name == "web_search":
        query = str(a.get("query") or "").strip()
        if not query:
            return "搜索关键词为空，请给出明确的搜索查询词。", False, "参数无效", 0, []
        try:
            cnt = int(a.get("count") or default_count or 8)
        except (TypeError, ValueError):
            cnt = default_count or 8
        cnt = max(1, min(20, cnt))
        need_content = bool(a.get("need_content"))
        try:
            res = call_search_api(
                base_url,
                api_key,
                query,
                count=cnt,
                ori_question=ori_question,
                need_content=need_content,
            )
        except Exception as e:
            return f"联网搜索失败: {e}", False, "失败", 0, []

        raw_items = res.get("results") or []
        if not isinstance(raw_items, list) or not raw_items:
            return f"未搜索到与「{query}」相关的网页结果，请换一组关键词重试。", True, "0 条网页", 0, []

        lines = [f"DeepSeek 官方搜索「{query}」，共返回 {len(raw_items)} 条网页结果："]
        web_sources: list[dict] = []
        for i, item in enumerate(raw_items, 1):
            if not isinstance(item, dict):
                continue
            src = normalize_web_source(item, cited=False)
            if src:
                web_sources.append(src)
            title = str(item.get("title") or "").strip() or str(item.get("url") or "")
            url = str(item.get("url") or "").strip()
            site = str(item.get("site_name") or "").strip()
            date_str = str(item.get("date") or item.get("page_age") or "").strip()
            score = item.get("rerank_score")
            meta_bits = []
            if site:
                meta_bits.append(site)
            if date_str:
                meta_bits.append(date_str)
            if score is not None:
                try:
                    meta_bits.append(f"相关度 {float(score):.2f}/3")
                except (TypeError, ValueError):
                    pass
            meta_line = f" ({' | '.join(meta_bits)})" if meta_bits else ""
            body_text = str(item.get("summary") or item.get("snippet") or "").strip()
            content_text = str(item.get("content") or "").strip() if need_content else ""
            block = [f"[{i}] {title}{meta_line}", f"URL: {url}"]
            if body_text:
                block.append(f"摘要: {body_text}")
            if content_text:
                if len(content_text) > 4000:
                    content_text = content_text[:4000].rstrip() + "\n...(正文已截断，如需完整内容请对该 URL 调用 web_fetch)"
                block.append(f"正文:\n{content_text}")
            lines.append("\n".join(block))

        return "\n\n".join(lines), True, f"{len(web_sources)} 条网页", len(web_sources), web_sources

    if name == "web_fetch":
        url = str(a.get("url") or "").strip()
        if not url:
            return "请提供要抓取的 http/https 网址。", False, "参数无效", 0, []
        try:
            res = call_fetch_api(base_url, api_key, url)
        except Exception as e:
            return f"网页抓取失败: {e}", False, "失败", 0, []
        title = str(res.get("title") or "").strip()
        content = str(res.get("content") or "").strip()
        truncated = False
        if len(content) > MAX_FETCH_CHARS:
            content = content[:MAX_FETCH_CHARS].rstrip() + f"\n\n[正文已截断，仅保留前 {MAX_FETCH_CHARS} 字符]"
            truncated = True
        src = normalize_web_source(
            {
                "url": url,
                "title": title or url,
                "snippet": content[:240].replace("\n", " "),
            },
            cited=False,
        )
        web_sources = [src] if src else []
        head = f"网页标题: {title or '(无标题)'}\nURL: {url}"
        if truncated:
            head += " (已截断)"
        text = head + "\n\n" + (content or "(页面正文为空)")
        return text, True, "已读取", 1, web_sources

    return f"未知联网工具: {name}", False, "失败", 0, []


def test_connection(cfg_data: dict | None, query: str = "DeepSeek") -> dict:
    base, key = resolve_deepseek_credentials(cfg_data)
    if not key:
        return {
            "ok": False,
            "error": "未找到可用的 DeepSeek API Key，请先在「提供商 -> DeepSeek」中配置密钥，或在下方填写独立搜索密钥。",
        }
    try:
        res = call_search_api(base, key, query or "DeepSeek", count=3, need_content=False)
        items = res.get("results") or []
        return {
            "ok": True,
            "count": len(items) if isinstance(items, list) else 0,
            "endpoint": search_endpoint(base),
            "sample_title": (items[0].get("title") if items and isinstance(items[0], dict) else "") or "",
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "endpoint": search_endpoint(base)}
