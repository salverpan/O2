from __future__ import annotations

import base64
import gzip
import hashlib
import hmac
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import xml.etree.ElementTree as ET
import zlib

import providers as prov_mod

DEFAULT_TIMEOUT_MS = 30_000
MAX_TIMEOUT_MS = 180_000
CALL_API_MAX_BODY = 512 * 1024
MAX_INLINE_CHARS = 48_000
MAX_NOTES_CHARS = 8_000

PROTOCOLS = [
    {"id": "rest", "label": "REST / HTTP JSON"},
    {"id": "graphql", "label": "GraphQL"},
    {"id": "jsonrpc", "label": "JSON-RPC 2.0"},
    {"id": "form", "label": "Form 表单 (urlencoded / multipart)"},
    {"id": "soap", "label": "SOAP / XML"},
    {"id": "sse", "label": "SSE / EventStream / NDJSON"},
]
PROTOCOL_IDS = {p["id"] for p in PROTOCOLS}

AUTH_TYPES = [
    "none",
    "bearer",
    "header",
    "query",
    "basic",
    "hmac_sha256",
    "oauth2_client_credentials",
    "cookie",
]

AUTH_TYPE_LABELS = [
    {"id": "none", "label": "无（免费 / 公开 API，无需密钥）"},
    {"id": "bearer", "label": "Bearer / Token Header (Authorization)"},
    {"id": "header", "label": "自定义 Header (X-Api-Key 等)"},
    {"id": "query", "label": "Query 参数 (api_key / key 等)"},
    {"id": "basic", "label": "HTTP Basic (账号 + 密码)"},
    {"id": "hmac_sha256", "label": "HMAC-SHA256 签名 (交易所 / 企业网关)"},
    {"id": "oauth2_client_credentials", "label": "OAuth2 / 企业令牌 (自动换取 access_token)"},
    {"id": "cookie", "label": "Cookie 凭证"},
]

HTTP_METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

API_PRESETS = [
    {
        "id": "public",
        "name": "公开 REST API",
        "protocol": "rest",
        "base_url": "https://",
        "auth_type": "none",
        "allow_write": False,
        "notes": "免费、无需 Key 的公开接口。保存后会出现在「已接入 API」目录中，提醒 AI 优先走这条渠道，并在此处写明常用路径与参数说明。",
    },
    {
        "id": "rest_bearer",
        "name": "Bearer REST API",
        "protocol": "rest",
        "base_url": "https://",
        "auth_type": "bearer",
        "auth_prefix": "Bearer",
        "allow_write": False,
        "notes": "通用 Bearer 鉴权 REST / 数据库接口（Supabase、GitHub、Notion、自建服务等）。",
    },
    {
        "id": "fred",
        "name": "FRED",
        "protocol": "rest",
        "base_url": "https://api.stlouisfed.org",
        "auth_type": "query",
        "query_name": "api_key",
        "default_query": {"file_type": "json"},
        "allow_write": False,
        "notes": "美联储圣路易斯 FRED 经济数据库。常用路径：GET /fred/series/observations（参数 series_id 如 FEDFUNDS、GDP、CPIAUCSL）、GET /fred/series/search（参数 search_text）。",
    },
    {
        "id": "binance",
        "name": "Binance",
        "protocol": "rest",
        "base_url": "https://api.binance.com",
        "auth_type": "hmac_sha256",
        "header_name": "X-MBX-APIKEY",
        "signature_param": "signature",
        "signature_in": "query",
        "signature_encoding": "hex",
        "allow_write": False,
        "notes": "币安接口。行情可 GET /api/v3/ticker/24hr、/api/v3/klines（参数 symbol、interval）；账户 GET /api/v3/account 自动附带 timestamp 与 HMAC-SHA256 签名。",
    },
    {
        "id": "graphql",
        "name": "GraphQL API",
        "protocol": "graphql",
        "base_url": "https://",
        "auth_type": "bearer",
        "allow_write": False,
        "notes": "通用 GraphQL 端点。调用时传 graphql_query 与 graphql_variables，只读 query 默认可调，mutation 需开启允许写入。",
    },
    {
        "id": "jsonrpc",
        "name": "JSON-RPC 2.0",
        "protocol": "jsonrpc",
        "base_url": "https://",
        "auth_type": "none",
        "allow_write": False,
        "notes": "通用 JSON-RPC 2.0 接口（区块链节点、内部 RPC 服务等）。调用时传 rpc_method 与 rpc_params。",
    },
    {
        "id": "oauth2",
        "name": "OAuth2 / 企业应用",
        "protocol": "rest",
        "base_url": "https://",
        "auth_type": "oauth2_client_credentials",
        "token_url": "https://",
        "allow_write": False,
        "notes": "通过 client_id(api_key) 与 client_secret(api_secret) 自动向 token_url 换取并缓存 access_token，兼容标准 OAuth2、飞书、钉钉、企业微信等接口。",
    },
]

API_CATEGORIES = [
    ("macro", "宏观与汇率"),
    ("market", "行情与公司"),
    ("filings", "披露与主体"),
    ("trade", "贸易与航运"),
    ("news", "新闻与事件"),
    ("reference", "文献资料"),
    ("geo", "天气与地理"),
    ("dev", "开发"),
    ("other", "其他"),
]
API_CATEGORY_IDS = {key for key, _label in API_CATEGORIES}
API_CATEGORY_LABELS = dict(API_CATEGORIES)
_CATEGORY_BY_NAME = {
    "fred": "macro",
    "eia": "macro",
    "treasuryfiscaldata": "macro",
    "bls": "macro",
    "ecb": "macro",
    "worldbank": "macro",
    "frankfurter": "macro",
    "yahoofinance": "market",
    "fmp": "market",
    "finnhub": "market",
    "eastmoney": "market",
    "eastmoneyhistory": "market",
    "coingecko": "market",
    "山西证券tushare网关": "market",
    "gleif": "filings",
    "secedgar": "filings",
    "comtrade": "trade",
    "comtradepreview": "trade",
    "imfportwatch": "trade",
    "vesselapi": "trade",
    "digitrafficais": "trade",
    "gdelt": "news",
    "hackernews": "news",
    "wikipedia": "reference",
    "openalex": "reference",
    "crossref": "reference",
    "openmeteo": "geo",
    "nws": "geo",
    "usgs": "geo",
    "github": "dev",
    "pypi": "dev",
}


_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "macro": (
        "fred", "stlouisfed", "eia", "treasury", "fiscaldata", "bls", "ecb", "worldbank",
        "frankfurter", "imf", "oecd", "pbc", "stats.gov", "gdp", "cpi", "ppi", "inflation",
        "interestrate", "fedfunds", "exchangerate", "forex", "currency", "fx", "macro",
        "宏观", "汇率", "利率", "央行", "统计局", "通胀", "国债", "财政", "外汇", "货币", "经济指标",
    ),
    "market": (
        "yahoofinance", "fmp", "financialmodelingprep", "finnhub", "eastmoney", "coingecko",
        "tushare", "akshare", "binance", "okx", "coinmarketcap", "alphavantage", "polygon.io",
        "tiingo", "iex", "twelvedata", "stock", "quote", "ticker", "kline", "candlestick",
        "ohlc", "equity", "etf", "fund", "crypto", "futures", "market", "orderbook",
        "行情", "股票", "证券", "基金", "期货", "k线", "股价", "市值", "涨跌", "交易所", "龙虎榜", "盘口",
    ),
    "filings": (
        "gleif", "secedgar", "sec.gov", "edgar", "cninfo", "qichacha", "tianyancha",
        "opencorporates", "lei", "10-k", "10-q", "8-k", "filing", "prospectus", "disclosure",
        "annualreport", "balance_sheet", "income_statement", "cash_flow",
        "披露", "公告", "巨潮", "企查查", "天眼查", "工商", "主体", "招股书", "年报", "季报", "财报披露", "信用代码",
    ),
    "trade": (
        "comtrade", "portwatch", "vessel", "digitraffic", "marinetraffic", "vesselfinder",
        "ais", "customs", "tariff", "freight", "shipping", "container", "port", "logistics",
        "supplychain", "bdi", "scfi", "cargo", "waybill", "import", "export", "hs_code",
        "贸易", "航运", "船舶", "港口", "海关", "进出口", "关税", "物流", "货运", "运价", "集装箱", "运单", "供应链", "口岸",
    ),
    "news": (
        "gdelt", "hackernews", "newsapi", "mediastack", "rss", "feed", "headline",
        "breaking", "press", "reuters", "bloomberg", "tass", "interfax", "sentiment",
        "新闻", "资讯", "快讯", "舆情", "事件", "头条", "日报", "情报", "媒体",
    ),
    "reference": (
        "wikipedia", "wikimedia", "openalex", "crossref", "arxiv", "pubmed", "semanticscholar",
        "doi", "orcid", "scholar", "paper", "citation", "journal", "encyclopedia", "library",
        "文献", "百科", "论文", "期刊", "学术", "引文", "词条", "专利", "知识库",
    ),
    "geo": (
        "openmeteo", "open-meteo", "nws", "weather.gov", "usgs", "openweathermap", "qweather",
        "amap", "restapi.amap", "map.baidu", "mapbox", "nominatim", "openstreetmap",
        "weather", "forecast", "climate", "earthquake", "geocode", "location", "latitude", "longitude",
        "天气", "气象", "预报", "地理", "地图", "高德", "经纬度", "地震", "台风", "空气质量", "路线规划",
    ),
    "dev": (
        "github", "gitlab", "pypi", "npmjs", "crates.io", "docker", " huggingface",
        "stackoverflow", "cloudflare", "dns", "ipinfo", "whois", "repos", "commits",
        "开发", "代码", "仓库", "镜像", "依赖包", "域名",
    ),
}


def score_category(
    name: str,
    base_url: str = "",
    notes: str = "",
    endpoints: list[dict] | None = None,
) -> tuple[str, int]:
    key = re.sub(r"\s+", "", str(name or "").strip().lower())
    if key in _CATEGORY_BY_NAME:
        return _CATEGORY_BY_NAME[key], 100

    ep_blob = ""
    if isinstance(endpoints, list):
        ep_parts = []
        for ep in endpoints[:25]:
            if isinstance(ep, dict):
                ep_parts.append(f"{ep.get('path') or ''} {ep.get('summary') or ''} {ep.get('params') or ''}")
        ep_blob = " ".join(ep_parts)

    name_low = str(name or "").lower()
    url_low = str(base_url or "").lower()
    notes_low = str(notes or "").lower()[:1500]
    ep_low = ep_blob.lower()[:1500]

    best_cat = "other"
    best_score = 0
    for cat_id, kw_list in _CATEGORY_KEYWORDS.items():
        score = 0
        for kw in kw_list:
            if kw in name_low or kw in key:
                score += 6
            if kw in url_low:
                score += 5
            if kw in notes_low:
                score += 3
            if kw in ep_low:
                score += 2
        if score > best_score:
            best_score = score
            best_cat = cat_id

    if best_score < 3:
        return "other", 0
    return best_cat, best_score


def infer_category(
    name: str,
    base_url: str = "",
    notes: str = "",
    endpoints: list[dict] | None = None,
) -> str:
    cat, _score = score_category(name, base_url=base_url, notes=notes, endpoints=endpoints)
    return cat


_RECLASSIFY_STEP = 5
_RECLASSIFY_LOCK = threading.Lock()
_RECLASSIFY_RUNNING = False


def _needs_reclassification(connectors: list[dict], last_count: int, force: bool = False) -> bool:
    n = len(connectors)
    if n < 3:
        return False
    delta = n - max(0, int(last_count or 0))
    if not force and delta < _RECLASSIFY_STEP:
        return False

    # 必要性门控（有必要才分）：
    # 1) 存在较多未归类（"other"）接口
    other_cnt = sum(1 for c in connectors if (c.get("category") or "other") == "other")
    if other_cnt >= 2:
        return True
    # 2) 单一分类过于拥挤（>= 10 个且占总数 45% 以上），需要巡检是否有错分
    by_cat: dict[str, int] = {}
    for c in connectors:
        cid = c.get("category") or "other"
        by_cat[cid] = by_cat.get(cid, 0) + 1
    if n >= 8 and any(cnt >= 10 or (cnt / n) > 0.48 for cnt in by_cat.values()):
        return True
    # 3) 本地多维特征评分与当前分类明显冲突的连接 >= 2 个
    mismatch = 0
    for c in connectors:
        inferred, sc = score_category(
            c.get("name") or "",
            base_url=c.get("base_url") or "",
            notes=c.get("notes") or "",
            endpoints=c.get("endpoints"),
        )
        cur = c.get("category") or "other"
        if sc >= 8 and inferred != "other" and inferred != cur:
            mismatch += 1
    return mismatch >= 2


def maybe_silent_reclassify(cfg_or_data, force: bool = False) -> None:
    """当 API 数量每增长一定阈值（默认 5 个）时自动检查必要性，有必要则在后台静默重分类。"""
    global _RECLASSIFY_RUNNING
    data = getattr(cfg_or_data, "data", None) if hasattr(cfg_or_data, "data") else (
        cfg_or_data if isinstance(cfg_or_data, dict) else None
    )
    if not isinstance(data, dict):
        return
    connectors = data.get("api_connectors")
    if not isinstance(connectors, list) or not connectors:
        return

    # 第一步：零延迟本地多维特征补全（把原本落在 other 但特征明确的接口直接自动归类）
    local_changed = False
    for c in connectors:
        if not isinstance(c, dict):
            continue
        cur = str(c.get("category") or "").strip().lower()
        if not cur or cur == "other" or cur not in API_CATEGORY_IDS:
            inferred, sc = score_category(
                c.get("name") or "",
                base_url=c.get("base_url") or "",
                notes=c.get("notes") or "",
                endpoints=c.get("endpoints"),
            )
            if inferred != "other" and sc >= 3:
                c["category"] = inferred
                local_changed = True

    last_count = int(data.get("api_last_classify_count") or 0)
    if not _needs_reclassification(connectors, last_count, force=force):
        if len(connectors) - last_count >= _RECLASSIFY_STEP:
            data["api_last_classify_count"] = len(connectors)
        if local_changed and hasattr(cfg_or_data, "save") and callable(cfg_or_data.save):
            try:
                cfg_or_data.save()
            except Exception:
                pass
        return

    if not prov_mod.any_key(data):
        data["api_last_classify_count"] = len(connectors)
        return

    with _RECLASSIFY_LOCK:
        if _RECLASSIFY_RUNNING:
            return
        _RECLASSIFY_RUNNING = True

    def _worker() -> None:
        global _RECLASSIFY_RUNNING
        try:
            ch = prov_mod.resolve_openaiish(data)
            if not ch or not ch.get("api_key"):
                return
            brief = []
            for c in (data.get("api_connectors") or [])[:80]:
                if not isinstance(c, dict):
                    continue
                eps = [f"{e.get('method','')} {e.get('path','')}" for e in (c.get("endpoints") or [])[:4] if isinstance(e, dict)]
                brief.append({
                    "id": c.get("id"),
                    "name": c.get("name"),
                    "base_url": c.get("base_url"),
                    "current_category": c.get("category") or "other",
                    "notes": str(c.get("notes") or "")[:120],
                    "endpoints": eps,
                })
            if not brief:
                return
            valid_cats = ", ".join(f"{k}({lbl})" for k, lbl in API_CATEGORIES)
            sys_p = (
                "你是 API 资产目录治理器。请审阅以下外部 API 连接列表的分类是否合理。\n"
                f"可用分类 ID：{valid_cats}。\n"
                "原则：**只调整归类明显错误或滞留在 other(其他) 的连接**；原本归类合理的连接不要改动。\n"
                "只返回 JSON：{\"updates\": [{\"id\": \"连接id\", \"category\": \"分类id\"}]}"
            )
            url = prov_mod.chat_url(ch["base_url"], "openai" if ch["protocol"] == "anthropic" else ch["protocol"])
            payload = {
                "model": ch["model"] or "deepseek-flash",
                "messages": [
                    {"role": "system", "content": sys_p},
                    {"role": "user", "content": json.dumps({"connectors": brief}, ensure_ascii=False)},
                ],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {ch['api_key']}",
                    "User-Agent": prov_mod.USER_AGENT,
                    **prov_mod.extra_headers(ch.get("base_url") or "", ch.get("protocol") or "openai", ch["api_key"], "o2-api-classify"),
                },
                method="POST",
            )
            with prov_mod.urlopen(req, timeout=25) as resp:
                res_obj = json.loads(resp.read().decode("utf-8"))
            txt = (((res_obj.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
            if txt.startswith("```"):
                txt = re.sub(r"^```(?:json)?\s*", "", txt)
                txt = re.sub(r"\s*```$", "", txt)
            parsed = json.loads(txt) if txt else {}
            upd_map = {}
            for u in (parsed.get("updates") or []):
                if isinstance(u, dict) and u.get("id") and u.get("category") in API_CATEGORY_IDS:
                    upd_map[str(u["id"])] = str(u["category"])
            changed = False
            for c in (data.get("api_connectors") or []):
                if isinstance(c, dict) and c.get("id") in upd_map:
                    new_cat = upd_map[c["id"]]
                    if c.get("category") != new_cat:
                        c["category"] = new_cat
                        changed = True
            data["api_last_classify_count"] = len(data.get("api_connectors") or [])
            data["api_last_classify_ts"] = int(time.time())
            if changed and hasattr(cfg_or_data, "save") and callable(cfg_or_data.save):
                cfg_or_data.save()
        except Exception:
            pass
        finally:
            with _RECLASSIFY_LOCK:
                _RECLASSIFY_RUNNING = False

    threading.Thread(target=_worker, daemon=True).start()

_BLOCKED_CALLER_HEADER = re.compile(
    r"^(authorization|cookie|set-cookie|host|content-length|connection)$",
    re.I,
)
_SECRET_QUERY_RE = re.compile(
    r"^(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|client[_-]?secret|"
    r"app[_-]?secret|app[_-]?key|signature|sig|password|passwd|pwd|key|auth)$",
    re.I,
)
_GRAPHQL_MUTATION_RE = re.compile(r"^\s*mutation\b", re.I)

_TOKEN_CACHE_LOCK = threading.Lock()
_TOKEN_CACHE: dict[str, tuple[str, float]] = {}

PROMPT = """
14. 需要调用外部或内部 HTTP/HTTPS API（REST、GraphQL、JSON-RPC 2.0、SOAP/XML、Form 表单、SSE 流、OpenAPI 等）时，调用 call_api：
   - **已接入渠道优先**：下方「已接入外部 API 目录」按数据分类（命名空间）列出已保存的 API 连接及使用说明。只使用和当前问题同一类的连接。标「优先」的连接在该类里先调用；该类没有优先连接时，再从其余连接里选。不要因为某个连接标了优先，就把它用到无关问题上。调用时传 `connector="连接名称"`，不要假装没有，也不要绕去爬网页。
   - **Agent 自主添加 API 与编写使用说明**：当用户要求添加/接入某个 API、提供 API 文档或密钥，或你在任务中发现实用的公开/免费 API 时，立即调用 `call_api(action="save", ...)` 保存连接，并在 `notes`（以及可选的 `endpoints`、`default_headers`、`default_query`）中为 AI 写清楚详尽的使用说明（功能、路径、必填/选填参数、返回关键字段、示例），以便当前与后续对话直接复用。若对方提供 OpenAPI/Swagger 地址，可调用 `call_api(action="discover", url=..., save=True)` 自动解析文档并生成使用说明。
   - **密钥安全**：调用已保存连接时，密钥由运行时自动注入（支持 Bearer、Header、Query、Basic、HMAC-SHA256、OAuth2 自动换 Token、Cookie），**严禁**把密钥明文写进 url、query、headers 或回复正文中。
   - **读写权限**：GET/HEAD/OPTIONS 以及只读的 GraphQL query / JSON-RPC 查询默认可调；改变远端状态的 POST/PUT/PATCH/DELETE 或 GraphQL mutation 必须走已保存且 `allow_write=True` 的连接。"""

TOOL = {
    "type": "function",
    "function": {
        "name": "call_api",
        "description": (
            "通用多协议 API 客户端与 API 连接库管理工具，适配 REST/JSON、GraphQL、JSON-RPC 2.0、"
            "Form (urlencoded/multipart)、SOAP/XML、SSE/NDJSON 及 OpenAPI 自动发现。"
            "支持 action：\n"
            "- request（默认）：发起 API 请求。已保存连接传 connector + path（或 graphql_query / rpc_method）；未保存公开接口可直接传 url。\n"
            "- save：Agent 自主新增或更新 API 连接到本地配置，并为 AI 编写详细使用说明（notes、endpoints、default_headers、default_query、protocol、auth_type 等）。\n"
            "- discover：拉取并解析 OpenAPI / Swagger 文档（可传文档 url 或根地址自动探测），生成 AI 使用说明；传 save=true 可直接保存为连接。\n"
            "- list：列出所有已保存的 API 连接概要（不含密钥明文）。\n"
            "- get：查看指定连接的完整 AI 使用说明、端点定义与默认配置。\n"
            "- test：测试指定连接或 URL 的连通性与鉴权。\n"
            "- delete：删除指定 API 连接。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["request", "save", "discover", "list", "get", "test", "delete"],
                    "description": "操作类型：request=调用接口（默认）；save=添加/更新API连接与使用说明；discover=解析OpenAPI文档；list=列出连接；get=查看连接详情；test=测试连接；delete=删除连接。",
                },
                "connector": {
                    "type": "string",
                    "description": "已保存连接的名称或 ID。调用已接入 API 时必填此项。",
                },
                "method": {
                    "type": "string",
                    "enum": ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
                    "description": "HTTP 方法。REST 默认 GET；GraphQL / JSON-RPC / SOAP 默认 POST。",
                },
                "url": {
                    "type": "string",
                    "description": "完整 http(s) URL（未保存的公开接口或 discover 文档地址使用；使用 connector 时请用 path）。",
                },
                "path": {
                    "type": "string",
                    "description": "相对于 connector base_url 的请求路径，如 /v1/weather 或 /users/{id}。",
                },
                "path_params": {
                    "type": "object",
                    "description": "路径模板参数，自动替换 path 中的 {key} 或 :key 并做 URL 编码。",
                },
                "query": {
                    "type": "object",
                    "description": "URL Query 参数对象，自动与连接的 default_query 合并。",
                },
                "headers": {
                    "type": "object",
                    "description": "额外 HTTP 请求头（不要在此放密钥，密钥由 connector 自动注入）。",
                },
                "body": {
                    "description": "请求体（JSON 对象/数组、表单字段字典、XML 字符串或纯文本）。",
                },
                "body_type": {
                    "type": "string",
                    "enum": ["json", "form", "multipart", "xml", "text", "graphql", "jsonrpc"],
                    "description": "显式指定请求体编码格式；不填则按连接的 protocol 自动匹配。",
                },
                "graphql_query": {
                    "type": "string",
                    "description": "GraphQL 查询或变更语句（query / mutation）。",
                },
                "graphql_variables": {
                    "type": "object",
                    "description": "GraphQL variables 变量对象。",
                },
                "graphql_operation": {
                    "type": "string",
                    "description": "可选，GraphQL operationName。",
                },
                "rpc_method": {
                    "type": "string",
                    "description": "JSON-RPC 2.0 的方法名（method）。",
                },
                "rpc_params": {
                    "description": "JSON-RPC 2.0 的参数（对象或数组）。",
                },
                "soap_action": {
                    "type": "string",
                    "description": "SOAP 请求的 SOAPAction 头。",
                },
                "extract_path": {
                    "type": "string",
                    "description": "可选，从返回 JSON 中按点号/下标路径提取子字段，如 'data.items' 或 'results.0'。",
                },
                "timeout_ms": {
                    "type": "number",
                    "description": "请求超时毫秒数，默认 30000，最大 180000。",
                },
                "name": {
                    "type": "string",
                    "description": "action=save/discover 时：API 连接显示名称（如 FRED、高德地图、企业ERP）。",
                },
                "base_url": {
                    "type": "string",
                    "description": "action=save 时：API 根地址（如 https://api.stlouisfed.org）。",
                },
                "protocol": {
                    "type": "string",
                    "enum": ["rest", "graphql", "jsonrpc", "form", "soap", "sse"],
                    "description": "action=save 时：API 协议类型，默认 rest。",
                },
                "auth_type": {
                    "type": "string",
                    "enum": [
                        "none",
                        "bearer",
                        "header",
                        "query",
                        "basic",
                        "hmac_sha256",
                        "oauth2_client_credentials",
                        "cookie",
                    ],
                    "description": "action=save 时：鉴权方式。免费接口填 none。",
                },
                "api_key": {
                    "type": "string",
                    "description": "action=save 时：API Key / Token / Basic 用户名 / OAuth2 client_id / Cookie 值。保存后运行时自动注入。",
                },
                "api_secret": {
                    "type": "string",
                    "description": "action=save 时：HMAC Secret / Basic 密码 / OAuth2 client_secret / 辅助密钥。",
                },
                "auth_prefix": {
                    "type": "string",
                    "description": "auth_type=bearer 时的前缀，默认 Bearer（可改为 Token、Apikey 等）。",
                },
                "header_name": {
                    "type": "string",
                    "description": "auth_type=header 或 hmac_sha256 时的请求头名称（默认 X-Api-Key 或 X-MBX-APIKEY）。",
                },
                "secret_header_name": {
                    "type": "string",
                    "description": "auth_type=header 且同时需要发送 api_secret 时的第二个请求头名（如 X-App-Secret）。",
                },
                "query_name": {
                    "type": "string",
                    "description": "auth_type=query 时的参数名（默认 api_key）。",
                },
                "secret_query_name": {
                    "type": "string",
                    "description": "auth_type=query 且同时需要发送 api_secret 时的参数名。",
                },
                "signature_param": {
                    "type": "string",
                    "description": "auth_type=hmac_sha256 时的签名参数名或头名（默认 signature）。",
                },
                "signature_in": {
                    "type": "string",
                    "enum": ["query", "header"],
                    "description": "auth_type=hmac_sha256 时签名放置位置：query（默认）或 header。",
                },
                "signature_encoding": {
                    "type": "string",
                    "enum": ["hex", "base64"],
                    "description": "auth_type=hmac_sha256 时签名编码：hex（默认）或 base64。",
                },
                "token_url": {
                    "type": "string",
                    "description": "auth_type=oauth2_client_credentials 时获取 access_token 的接口 URL。",
                },
                "default_headers": {
                    "type": "object",
                    "description": "action=save 时：每次调用该连接自动附带的固定请求头字典。",
                },
                "default_query": {
                    "type": "object",
                    "description": "action=save 时：每次调用该连接自动附带的默认 Query 参数字典。",
                },
                "allow_write": {
                    "type": "boolean",
                    "description": "action=save 时：是否允许 POST/PUT/PATCH/DELETE 写入操作，默认 false。",
                },
                "notes": {
                    "type": "string",
                    "description": "action=save 时：提供给 AI 的 API 使用说明（功能简介、常用路径、参数说明、返回结构、调用示例与注意事项）。",
                },
                "endpoints": {
                    "type": "array",
                    "description": "action=save 时：可选，结构化端点说明列表，每项含 method、path、summary、params。",
                    "items": {
                        "type": "object",
                        "properties": {
                            "method": {"type": "string"},
                            "path": {"type": "string"},
                            "summary": {"type": "string"},
                            "params": {"type": "string"},
                        },
                    },
                },
                "save": {
                    "type": "boolean",
                    "description": "action=discover 时：是否将解析出的 API 及使用说明自动保存为连接。",
                },
            },
        },
    },
}


def enabled(cfg) -> bool:
    data = getattr(cfg, "data", None) or {}
    return bool(data.get("api_call", True))


def new_connector_id() -> str:
    return f"api_{int(time.time() * 1000):x}_{uuid.uuid4().hex[:6]}"


def _clean_str_dict(raw) -> dict[str, str]:
    if isinstance(raw, str):
        s = raw.strip()
        if s.startswith("{"):
            try:
                raw = json.loads(s)
            except ValueError:
                return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        ks = str(k or "").strip()
        if not ks or v is None:
            continue
        out[ks] = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
    return out


def _clean_endpoints(raw) -> list[dict]:
    if isinstance(raw, str):
        s = raw.strip()
        if s.startswith("["):
            try:
                raw = json.loads(s)
            except ValueError:
                return []
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for item in raw[:60]:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").strip()
        method = str(item.get("method") or "GET").strip().upper()
        summary = str(item.get("summary") or item.get("description") or "").strip()
        params = item.get("params") or item.get("parameters") or ""
        if isinstance(params, (list, dict)):
            params = json.dumps(params, ensure_ascii=False)
        params = str(params).strip()
        if not path and not summary:
            continue
        out.append({
            "method": method or "GET",
            "path": path,
            "summary": summary[:300],
            "params": params[:500],
        })
    return out


def normalize_connector(raw: dict | None) -> dict:
    c = raw if isinstance(raw, dict) else {}
    proto = str(c.get("protocol") or "rest").strip().lower()
    if proto not in PROTOCOL_IDS:
        proto = "rest"
    auth_type = str(c.get("auth_type") or c.get("authType") or "none").strip().lower()
    if auth_type == "oauth2":
        auth_type = "oauth2_client_credentials"
    if auth_type not in AUTH_TYPES:
        auth_type = "none"

    default_header = "X-MBX-APIKEY" if auth_type == "hmac_sha256" else "X-Api-Key"
    header_name = str(c.get("header_name") or c.get("headerName") or default_header).strip() or default_header
    secret_header_name = str(c.get("secret_header_name") or c.get("secretHeaderName") or "").strip()
    query_name = str(c.get("query_name") or c.get("queryName") or "api_key").strip() or "api_key"
    secret_query_name = str(c.get("secret_query_name") or c.get("secretQueryName") or "").strip()
    auth_prefix = str(c.get("auth_prefix") or c.get("authPrefix") or "Bearer").strip() or "Bearer"
    signature_param = str(c.get("signature_param") or c.get("signatureParam") or "signature").strip() or "signature"
    signature_in = str(c.get("signature_in") or c.get("signatureIn") or "query").strip().lower()
    if signature_in not in ("query", "header"):
        signature_in = "query"
    signature_encoding = str(c.get("signature_encoding") or c.get("signatureEncoding") or "hex").strip().lower()
    if signature_encoding not in ("hex", "base64"):
        signature_encoding = "hex"
    token_url = str(c.get("token_url") or c.get("tokenUrl") or "").strip()

    base_url = str(c.get("base_url") or c.get("baseUrl") or "").strip().rstrip("/")
    notes = str(c.get("notes") or c.get("usage") or c.get("description") or "").strip()[:MAX_NOTES_CHARS]
    cleaned_eps = _clean_endpoints(c.get("endpoints"))
    now_ms = int(time.time() * 1000)
    allow_raw = c.get("allow_write") if "allow_write" in c else c.get("allowWrite")
    name = str(c.get("name") or "").strip() or "unnamed"
    category = str(c.get("category") or "").strip().lower()
    if category not in API_CATEGORY_IDS or category == "other":
        inferred = infer_category(name, base_url=base_url, notes=notes, endpoints=cleaned_eps)
        if category not in API_CATEGORY_IDS or inferred != "other":
            category = inferred

    return {
        "id": str(c.get("id") or "").strip() or new_connector_id(),
        "name": name,
        "category": category,
        "preferred": bool(c.get("preferred")),
        "protocol": proto,
        "base_url": base_url,
        "auth_type": auth_type,
        "api_key": "" if auth_type == "none" else str(c.get("api_key") or c.get("apiKey") or ""),
        "api_secret": (
            str(c.get("api_secret") or c.get("apiSecret") or "")
            if auth_type in ("hmac_sha256", "basic", "oauth2_client_credentials", "header", "query")
            else ""
        ),
        "auth_prefix": auth_prefix,
        "header_name": header_name,
        "secret_header_name": secret_header_name,
        "query_name": query_name,
        "secret_query_name": secret_query_name,
        "signature_param": signature_param,
        "signature_in": signature_in,
        "signature_encoding": signature_encoding,
        "token_url": token_url,
        "default_headers": _clean_str_dict(c.get("default_headers") or c.get("defaultHeaders")),
        "default_query": _clean_str_dict(c.get("default_query") or c.get("defaultQuery")),
        "allow_write": bool(allow_raw),
        "notes": notes,
        "endpoints": cleaned_eps,
        "created_at": int(c.get("created_at") or c.get("createdAt") or now_ms),
        "updated_at": int(c.get("updated_at") or c.get("updatedAt") or now_ms),
    }


def public_connector(raw: dict) -> dict:
    n = normalize_connector(raw)
    has_key = bool(n["api_key"] or n["api_secret"])
    return {
        "id": n["id"],
        "name": n["name"],
        "protocol": n["protocol"],
        "base_url": n["base_url"],
        "baseUrl": n["base_url"],
        "auth_type": n["auth_type"],
        "authType": n["auth_type"],
        "auth_prefix": n["auth_prefix"],
        "header_name": n["header_name"],
        "secret_header_name": n["secret_header_name"],
        "query_name": n["query_name"],
        "secret_query_name": n["secret_query_name"],
        "signature_param": n["signature_param"],
        "signature_in": n["signature_in"],
        "signature_encoding": n["signature_encoding"],
        "token_url": n["token_url"],
        "default_headers": dict(n["default_headers"]),
        "default_query": dict(n["default_query"]),
        "allow_write": n["allow_write"],
        "allowWrite": n["allow_write"],
        "category": n["category"],
        "preferred": n["preferred"],
        "has_key": has_key,
        "hasKey": has_key,
        "api_key_set": bool(n["api_key"]),
        "api_secret_set": bool(n["api_secret"]),
        "notes": n["notes"],
        "endpoints": list(n["endpoints"]),
        "created_at": n["created_at"],
        "updated_at": n["updated_at"],
    }


def migrate(data: dict) -> dict:
    raw = data.get("api_connectors")
    if not isinstance(raw, list):
        data["api_connectors"] = []
        return data
    out: list[dict] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        c = normalize_connector(item)
        if c["id"] in seen:
            continue
        seen.add(c["id"])
        out.append(c)
    data["api_connectors"] = out
    return data


def merge_save(data: dict, body: dict) -> None:
    migrate(data)
    raw = body.get("api_connectors")
    if not isinstance(raw, list):
        return
    old_by_id = {c["id"]: c for c in (data.get("api_connectors") or []) if c.get("id")}
    old_by_name = {c["name"].lower(): c for c in (data.get("api_connectors") or []) if c.get("name")}
    out: list[dict] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        cid = str(item.get("id") or "").strip()
        name = str(item.get("name") or "").strip()
        prev = old_by_id.get(cid) or (old_by_name.get(name.lower()) if name else None) or {}
        merged = dict(prev)
        merged.update(item)
        if prev.get("id"):
            merged["id"] = prev["id"]
        if item.get("clear_key"):
            merged["api_key"] = ""
        elif not item.get("api_key") and not item.get("apiKey"):
            merged["api_key"] = prev.get("api_key") or ""
        if item.get("clear_secret"):
            merged["api_secret"] = ""
        elif not item.get("api_secret") and not item.get("apiSecret"):
            merged["api_secret"] = prev.get("api_secret") or ""
        norm = normalize_connector(merged)
        if norm["id"] in seen:
            continue
        seen.add(norm["id"])
        out.append(norm)
    data["api_connectors"] = out
    maybe_silent_reclassify(data)


def find_connector(connectors: list[dict], id_or_name: str | None) -> dict | None:
    q = str(id_or_name or "").strip().lower()
    if not q:
        return None
    arr = connectors if isinstance(connectors, list) else []
    for c in arr:
        if str(c.get("id") or "").strip().lower() == q:
            return c
    for c in arr:
        if str(c.get("name") or "").strip().lower() == q:
            return c
    return None


def route_api_categories(rows: list[dict], query: str = "") -> tuple[set[str], set[str]]:
    """根据用户当前对话问题，路由匹配最相关的 API 分类与具体连接 ID（用于渐进式披露）。"""
    q_low = str(query or "").strip().lower()
    if not q_low or len(rows) <= 6:
        all_cats = {(c.get("category") or "other") for c in rows}
        all_ids = {str(c.get("id") or "") for c in rows}
        return all_cats, all_ids

    cat_scores: dict[str, int] = {}
    matched_ids: set[str] = set()

    for cat_id, kw_list in _CATEGORY_KEYWORDS.items():
        sc = sum(3 for kw in kw_list if kw in q_low)
        if sc > 0:
            cat_scores[cat_id] = sc

    q_tokens = [t for t in re.split(r"[\s,，。？！?!、/\\|;:()（）]+", q_low) if len(t) >= 2]
    for c in rows:
        cid = str(c.get("id") or "")
        cat = c.get("category") or "other"
        name_low = str(c.get("name") or "").lower()
        url_low = str(c.get("base_url") or "").lower()
        notes_low = str(c.get("notes") or "").lower()[:600]
        if name_low and name_low in q_low:
            matched_ids.add(cid)
            cat_scores[cat] = cat_scores.get(cat, 0) + 12
            continue
        hit_tok = 0
        for tok in q_tokens[:16]:
            if tok in name_low or tok in url_low:
                hit_tok += 4
            elif tok in notes_low:
                hit_tok += 1
        if hit_tok >= 3:
            matched_ids.add(cid)
            cat_scores[cat] = cat_scores.get(cat, 0) + hit_tok

    if not cat_scores and not matched_ids:
        # 若问题未明显指向特定分类，默认只展开各分类中标记了 preferred（优先）的连接，其余折叠为 L0 索引
        pref_ids = {str(c.get("id") or "") for c in rows if c.get("preferred")}
        pref_cats = {(c.get("category") or "other") for c in rows if c.get("preferred")}
        return pref_cats, pref_ids

    ranked_cats = sorted(cat_scores.items(), key=lambda kv: kv[1], reverse=True)
    routed_cats = {k for k, sc in ranked_cats[:2] if sc > 0}
    for c in rows:
        if (c.get("category") or "other") in routed_cats:
            matched_ids.add(str(c.get("id") or ""))
    return routed_cats, matched_ids


def _format_connector_detail(c: dict, max_note_lines: int = 12, max_endpoints: int = 8) -> list[str]:
    lines: list[str] = []
    rw = "可读可写" if c["allow_write"] else "只读"
    key_desc = f"需密钥({c['auth_type']})" if c["has_key"] else "免费无需密钥"
    proto = c["protocol"].upper()
    pref = " · 优先" if c.get("preferred") else ""
    head = f"- **{c['name']}**{pref} [{proto}] · {key_desc} · `{c['base_url'] or '(无 base_url)'}` · {rw}"
    lines.append(head)
    if c["default_query"]:
        dq = ", ".join(f"{k}={v}" for k, v in c["default_query"].items())
        lines.append(f"  - 默认 Query: `{dq}`")
    if c["default_headers"]:
        dh = ", ".join(f"{k}: {v}" for k, v in c["default_headers"].items())
        lines.append(f"  - 默认 Headers: `{dh}`")
    if c["notes"]:
        note_lines = c["notes"].strip().splitlines()
        if len(note_lines) == 1:
            lines.append(f"  - 使用说明: {note_lines[0][:300]}")
        else:
            lines.append("  - 使用说明:")
            for nl in note_lines[:max_note_lines]:
                lines.append(f"    {nl}")
            if len(note_lines) > max_note_lines:
                lines.append(f"    …（其余说明可通过 call_api(action=\"get\", connector=\"{c['name']}\") 展开）")
    if c["endpoints"]:
        eps = c["endpoints"]
        lines.append("  - 常用端点:")
        for ep in eps[:max_endpoints]:
            ep_line = f"    - `{ep['method']} {ep['path']}`"
            if ep.get("summary"):
                ep_line += f"：{ep['summary']}"
            if ep.get("params"):
                ep_line += f"（参数：{ep['params']}）"
            lines.append(ep_line)
        if len(eps) > max_endpoints:
            lines.append(
                f"    - …共 {len(eps)} 个端点，调用 `call_api(action=\"get\", connector=\"{c['name']}\")` 查看完整端点表。"
            )
    return lines


def format_api_catalog(connectors_or_cfg, query: str = "") -> str:
    if hasattr(connectors_or_cfg, "data"):
        raw_list = (connectors_or_cfg.data or {}).get("api_connectors") or []
    elif isinstance(connectors_or_cfg, dict):
        raw_list = connectors_or_cfg.get("api_connectors") or []
    elif isinstance(connectors_or_cfg, list):
        raw_list = connectors_or_cfg
    else:
        raw_list = []

    rows = [public_connector(c) for c in raw_list if isinstance(c, dict)]
    if not rows:
        return (
            "\n\n### 已接入外部 API 目录（call_api）\n"
            "（当前尚未保存任何 API 连接。免费无需密钥的公开 API 或用户提供密钥/文档的接口，"
            "都请调用 `call_api(action=\"save\", name=..., base_url=..., notes=\"详细使用说明\")` 保存，"
            "用来建立可复用的 API 知识库；未列入目录的公开 http/https 接口仍可直接传 url 调用。）"
        )

    use_progressive = bool(query and len(rows) > 6)
    routed_cats, matched_ids = route_api_categories(rows, query=query) if use_progressive else (
        {(c.get("category") or "other") for c in rows},
        {str(c.get("id") or "") for c in rows},
    )

    lines = [
        "\n\n### 已接入外部 API 目录（call_api · 路由与渐进式披露）",
        "目录按数据分类分组。已根据当前问题自动展开最相关的连接详情；未展开的分类仅显示 L0 目录索引（如需调用未展开的连接，可先 `call_api(action=\"get\", connector=\"连接名\")` 或 `call_api(action=\"list\", category=\"分类ID\")` 获取详细参数说明）。同一类里标「优先」的先调用。密钥由运行时自动注入，严禁写进参数：",
    ]
    grouped: dict[str, list[dict]] = {}
    for c in rows:
        grouped.setdefault(c.get("category") or "other", []).append(c)
    ordered = [key for key, _label in API_CATEGORIES if grouped.get(key)]
    ordered.extend(key for key in grouped if key not in ordered)

    collapsed_lines: list[str] = []
    for key in ordered:
        items = grouped[key]
        items.sort(key=lambda item: (not item.get("preferred"), str(item.get("name") or "").lower()))
        cat_label = API_CATEGORY_LABELS.get(key, "其他")
        expanded_items = [c for c in items if not use_progressive or key in routed_cats or c["id"] in matched_ids]
        collapsed_items = [c for c in items if c not in expanded_items]

        if expanded_items:
            lines.append(f"\n#### {cat_label} (`category=\"{key}\"`)")
            for c in expanded_items:
                lines.extend(_format_connector_detail(c))
        if collapsed_items:
            names_preview = "、".join(
                f"{c['name']}{'[优先]' if c.get('preferred') else ''}"
                for c in collapsed_items[:12]
            )
            if len(collapsed_items) > 12:
                names_preview += f" 等 {len(collapsed_items)} 个"
            collapsed_lines.append(
                f"- **{cat_label}** (`category=\"{key}\"`，共 {len(collapsed_items)} 个未展开)：{names_preview}"
            )

    if collapsed_lines:
        lines.append("\n#### 其他分类折叠索引（L0 渐进式披露 · 按需调用 `call_api(action=\"get\", connector=\"名称\")` 展开）")
        lines.extend(collapsed_lines)
    return "\n".join(lines)


def assert_safe_url(raw: str) -> str | None:
    s = str(raw or "").strip()
    if not s:
        return "URL 不能为空。"
    try:
        u = urllib.parse.urlsplit(s)
    except ValueError:
        return "URL 格式无效。"
    if u.scheme.lower() not in ("http", "https"):
        return "只允许 http 或 https 协议。"
    if not u.netloc or not u.hostname:
        return "URL 缺少有效主机名。"
    if u.username or u.password:
        return "URL 内不要内嵌账号密码，请用 connector 保存鉴权信息。"
    return None


def apply_path_params(path: str, path_params: dict | None) -> str:
    p = str(path or "")
    if not path_params or not isinstance(path_params, dict):
        return p
    for k, v in path_params.items():
        key = str(k or "").strip()
        if not key or v is None:
            continue
        enc = urllib.parse.quote(str(v), safe="")
        p = p.replace("{" + key + "}", enc)
        p = re.sub(r":" + re.escape(key) + r"(?=/|$)", enc, p)
    return p


def join_url(base: str, path: str, path_params: dict | None = None) -> str:
    b = str(base or "").strip().rstrip("/")
    p = apply_path_params(str(path or "").strip(), path_params)
    if not p:
        return b
    if re.match(r"^https?://", p, re.I):
        return p
    if not b:
        return p if p.startswith("/") else "/" + p
    return f"{b}{p}" if p.startswith("/") else f"{b}/{p}"


def apply_query(url: str, query: dict | None) -> str:
    if not query or not isinstance(query, dict):
        return url
    u = urllib.parse.urlsplit(url)
    pairs = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
    key_order: list[str] = []
    by_key: dict[str, list[str]] = {}
    for k, v in pairs:
        if k not in by_key:
            key_order.append(k)
            by_key[k] = []
        by_key[k].append(v)

    for k, v in query.items():
        if v is None:
            continue
        ks = str(k)
        if ks not in by_key:
            key_order.append(ks)
        if isinstance(v, (list, tuple)):
            by_key[ks] = [
                json.dumps(x, ensure_ascii=False) if isinstance(x, (dict, list)) else str(x)
                for x in v
                if x is not None
            ]
        elif isinstance(v, dict):
            by_key[ks] = [json.dumps(v, ensure_ascii=False)]
        elif isinstance(v, bool):
            by_key[ks] = ["true" if v else "false"]
        else:
            by_key[ks] = [str(v)]

    flat: list[tuple[str, str]] = []
    for k in key_order:
        for val in by_key.get(k, []):
            flat.append((k, val))
    new_query = urllib.parse.urlencode(flat, doseq=True)
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, new_query, u.fragment))


def redact_url(url: str, secrets: list[str] | None = None) -> str:
    try:
        u = urllib.parse.urlsplit(str(url or ""))
        if not u.scheme or not u.netloc:
            return ""
        pairs = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
        secret_set = {s for s in (secrets or []) if s and len(s) >= 4}
        cleaned: list[tuple[str, str]] = []
        for k, v in pairs:
            if _SECRET_QUERY_RE.search(k) or (v in secret_set):
                cleaned.append((k, "***"))
            else:
                cleaned.append((k, v))
        # keep '*' unescaped for readability
        q_str = urllib.parse.urlencode(cleaned, doseq=True).replace("%2A%2A%2A", "***")
        out = urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, q_str, u.fragment))
        return redact_text(out, secrets)
    except Exception:
        return ""


def redact_text(text: str, secrets: list[str] | None = None) -> str:
    s = str(text or "")
    if not s:
        return s
    s = re.sub(r"(?i)(Bearer|Token|Basic)\s+[A-Za-z0-9._~+/=-]{6,}", r"\1 ***", s)
    for sec in secrets or []:
        if sec and len(sec) >= 4 and sec in s:
            s = s.replace(sec, "***")
    return s


def hmac_sha256_hex(secret: str, message: str) -> str:
    return hmac.new(
        str(secret or "").encode("utf-8"),
        str(message or "").encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def hmac_sha256_base64(secret: str, message: str) -> str:
    digest = hmac.new(
        str(secret or "").encode("utf-8"),
        str(message or "").encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode("ascii")


def merge_headers(default_headers: dict | None, extra_headers: dict | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if isinstance(default_headers, dict):
        for k, v in default_headers.items():
            ks = str(k or "").strip()
            if ks and v is not None:
                out[ks] = str(v)
    if isinstance(extra_headers, dict):
        for k, v in extra_headers.items():
            ks = str(k or "").strip()
            if not ks or v is None:
                continue
            if _BLOCKED_CALLER_HEADER.match(ks):
                continue
            out[ks] = str(v)
    return out


def _fetch_oauth2_token(connector: dict, http_fn=None) -> str:
    token_url = str(connector.get("token_url") or "").strip()
    client_id = str(connector.get("api_key") or "").strip()
    client_secret = str(connector.get("api_secret") or "").strip()
    if not token_url or not client_id:
        raise RuntimeError("OAuth2 连接缺少 token_url 或 api_key (client_id)")

    cache_key = f"{token_url}|{client_id}|{hashlib.sha256(client_secret.encode('utf-8')).hexdigest()[:16]}"
    now = time.time()
    with _TOKEN_CACHE_LOCK:
        cached = _TOKEN_CACHE.get(cache_key)
        if cached and cached[1] > now + 30:
            return cached[0]

    sender = http_fn or _http_request
    u_low = token_url.lower()
    # Enterprise adapters: Feishu / WeCom / DingTalk / standard OAuth2
    if "feishu.cn" in u_low or "larksuite.com" in u_low:
        body_bytes = json.dumps({"app_id": client_id, "app_secret": client_secret}).encode("utf-8")
        headers = {"Content-Type": "application/json; charset=utf-8", "Accept": "application/json"}
        status, _, raw = sender("POST", token_url, headers, body_bytes, 15.0)
    elif "qyapi.weixin.qq.com" in u_low and "gettoken" in u_low:
        url = apply_query(token_url, {"corpid": client_id, "corpsecret": client_secret})
        status, _, raw = sender("GET", url, {"Accept": "application/json"}, None, 15.0)
    else:
        form_data = urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        }).encode("utf-8")
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }
        status, _, raw = sender("POST", token_url, headers, form_data, 15.0)

    text = raw.decode("utf-8", "replace")
    try:
        data = json.loads(text)
    except ValueError:
        raise RuntimeError(f"OAuth2 token 接口返回非 JSON (HTTP {status})")
    if not isinstance(data, dict):
        raise RuntimeError(f"OAuth2 token 接口返回格式异常 (HTTP {status})")

    token = str(
        data.get("access_token")
        or data.get("tenant_access_token")
        or data.get("app_access_token")
        or data.get("token")
        or ""
    ).strip()
    if not token:
        err_msg = data.get("error_description") or data.get("errmsg") or data.get("msg") or data.get("error") or f"HTTP {status}"
        raise RuntimeError(f"OAuth2 获取 token 失败: {err_msg}")

    expires_in = float(data.get("expires_in") or data.get("expire") or 3600)
    with _TOKEN_CACHE_LOCK:
        _TOKEN_CACHE[cache_key] = (token, now + max(60.0, expires_in))
    return token


def apply_auth(
    url: str,
    headers: dict[str, str],
    connector: dict | None,
    body_bytes: bytes | None = None,
    http_fn=None,
) -> tuple[str, dict[str, str]]:
    c = normalize_connector(connector) if connector else None
    if not c or c["auth_type"] == "none":
        return url, dict(headers)

    h = dict(headers)
    atype = c["auth_type"]

    if atype == "bearer" and c["api_key"]:
        prefix = c["auth_prefix"] or "Bearer"
        h["Authorization"] = f"{prefix} {c['api_key']}"
        return url, h

    if atype == "header":
        if c["api_key"]:
            h[c["header_name"] or "X-Api-Key"] = c["api_key"]
        if c["api_secret"] and c["secret_header_name"]:
            h[c["secret_header_name"]] = c["api_secret"]
        return url, h

    if atype == "basic" and (c["api_key"] or c["api_secret"]):
        raw_cred = f"{c['api_key']}:{c['api_secret']}".encode("utf-8")
        h["Authorization"] = "Basic " + base64.b64encode(raw_cred).decode("ascii")
        return url, h

    if atype == "cookie" and c["api_key"]:
        h["Cookie"] = c["api_key"]
        return url, h

    if atype == "query":
        q_patch: dict[str, str] = {}
        if c["api_key"]:
            q_patch[c["query_name"] or "api_key"] = c["api_key"]
        if c["api_secret"] and c["secret_query_name"]:
            q_patch[c["secret_query_name"]] = c["api_secret"]
        return apply_query(url, q_patch), h

    if atype == "hmac_sha256":
        u = urllib.parse.urlsplit(url)
        pairs = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
        keys = {k for k, _ in pairs}
        if "timestamp" not in keys:
            pairs.append(("timestamp", str(int(time.time() * 1000))))
        query_payload = urllib.parse.urlencode(pairs, doseq=True)
        body_str = body_bytes.decode("utf-8", "replace") if body_bytes else ""
        sign_target = query_payload if not body_str or c["signature_in"] == "query" else (
            f"{query_payload}{body_str}" if query_payload else body_str
        )
        if c["signature_encoding"] == "base64":
            sig = hmac_sha256_base64(c["api_secret"], sign_target)
        else:
            sig = hmac_sha256_hex(c["api_secret"], sign_target)

        sig_param = c["signature_param"] or "signature"
        if c["signature_in"] == "header":
            h[sig_param] = sig
            new_url = urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, query_payload, u.fragment))
        else:
            pairs.append((sig_param, sig))
            new_q = urllib.parse.urlencode(pairs, doseq=True)
            new_url = urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, new_q, u.fragment))
        if c["api_key"]:
            h[c["header_name"] or "X-MBX-APIKEY"] = c["api_key"]
        return new_url, h

    if atype == "oauth2_client_credentials":
        token = _fetch_oauth2_token(c, http_fn=http_fn)
        prefix = c["auth_prefix"] or "Bearer"
        h["Authorization"] = f"{prefix} {token}"
        return url, h

    return url, h


def _encode_multipart(fields: dict) -> tuple[bytes, str]:
    boundary = f"----O2Boundary{uuid.uuid4().hex}"
    buf = io.BytesIO()
    for k, v in (fields or {}).items():
        if v is None:
            continue
        ks = str(k).replace('"', "")
        buf.write(f"--{boundary}\r\n".encode("utf-8"))
        if isinstance(v, dict) and ("content" in v or "filename" in v):
            fname = str(v.get("filename") or ks).replace('"', "")
            ctype = str(v.get("content_type") or "application/octet-stream")
            raw_val = v.get("content") or ""
            data = raw_val.encode("utf-8") if isinstance(raw_val, str) else bytes(raw_val)
            buf.write(f'Content-Disposition: form-data; name="{ks}"; filename="{fname}"\r\n'.encode("utf-8"))
            buf.write(f"Content-Type: {ctype}\r\n\r\n".encode("utf-8"))
            buf.write(data)
            buf.write(b"\r\n")
        else:
            val_str = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
            buf.write(f'Content-Disposition: form-data; name="{ks}"\r\n\r\n'.encode("utf-8"))
            buf.write(val_str.encode("utf-8"))
            buf.write(b"\r\n")
    buf.write(f"--{boundary}--\r\n".encode("utf-8"))
    return buf.getvalue(), f"multipart/form-data; boundary={boundary}"


def _has_content_type(headers: dict[str, str]) -> bool:
    return any(k.lower() == "content-type" for k in headers)


def encode_body(
    args: dict,
    headers: dict[str, str],
    protocol: str = "rest",
) -> tuple[bytes | None, dict[str, str]]:
    h = dict(headers)
    body_type = str(args.get("body_type") or "").strip().lower()
    if not body_type:
        if args.get("graphql_query"):
            body_type = "graphql"
        elif args.get("rpc_method"):
            body_type = "jsonrpc"
        elif protocol in ("graphql", "jsonrpc", "form", "soap"):
            body_type = "xml" if protocol == "soap" else protocol
        else:
            body_type = "auto"

    if body_type == "graphql":
        gql_q = str(args.get("graphql_query") or "")
        gql_vars = args.get("graphql_variables")
        gql_op = args.get("graphql_operation")
        if not gql_q and isinstance(args.get("body"), dict):
            payload = dict(args["body"])
        else:
            payload = {"query": gql_q}
            if gql_vars is not None:
                payload["variables"] = gql_vars
            if gql_op:
                payload["operationName"] = str(gql_op)
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        if not _has_content_type(h):
            h["Content-Type"] = "application/json; charset=utf-8"
        return raw, h

    if body_type == "jsonrpc":
        rpc_method = str(args.get("rpc_method") or "")
        rpc_params = args.get("rpc_params")
        if not rpc_method and isinstance(args.get("body"), dict):
            payload = dict(args["body"])
            payload.setdefault("jsonrpc", "2.0")
            payload.setdefault("id", 1)
        else:
            payload = {
                "jsonrpc": "2.0",
                "id": args.get("rpc_id", 1),
                "method": rpc_method,
            }
            if rpc_params is not None:
                payload["params"] = rpc_params
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        if not _has_content_type(h):
            h["Content-Type"] = "application/json; charset=utf-8"
        return raw, h

    body = args.get("body")
    if body is None or body == "":
        return None, h

    if body_type == "form":
        if isinstance(body, dict):
            flat: list[tuple[str, str]] = []
            for k, v in body.items():
                if v is None:
                    continue
                if isinstance(v, (list, tuple)):
                    for item in v:
                        flat.append((str(k), str(item)))
                elif isinstance(v, dict):
                    flat.append((str(k), json.dumps(v, ensure_ascii=False)))
                else:
                    flat.append((str(k), str(v)))
            raw = urllib.parse.urlencode(flat, doseq=True).encode("utf-8")
        else:
            raw = str(body).encode("utf-8")
        if not _has_content_type(h):
            h["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"
        return raw, h

    if body_type == "multipart":
        if not isinstance(body, dict):
            raise ValueError("body_type=multipart 时 body 必须为对象字典")
        raw, ctype = _encode_multipart(body)
        h["Content-Type"] = ctype
        return raw, h

    if body_type == "xml" or protocol == "soap":
        raw = (body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)).encode("utf-8")
        if args.get("soap_action") and "SOAPAction" not in h:
            h["SOAPAction"] = str(args["soap_action"])
        if not _has_content_type(h):
            h["Content-Type"] = "text/xml; charset=utf-8"
        return raw, h

    if isinstance(body, str) and body_type in ("auto", "text"):
        raw = body.encode("utf-8")
        if not _has_content_type(h):
            s = body.lstrip()
            if s.startswith("<?xml") or s.startswith("<soap") or s.startswith("<Envelope"):
                h["Content-Type"] = "application/xml; charset=utf-8"
            else:
                h["Content-Type"] = "text/plain; charset=utf-8"
        return raw, h

    raw = (body.encode("utf-8") if isinstance(body, str) else json.dumps(body, ensure_ascii=False).encode("utf-8"))
    if not _has_content_type(h):
        h["Content-Type"] = "application/json; charset=utf-8"
    return raw, h


def is_readonly_request(method: str, args: dict, connector: dict | None) -> bool:
    m = method.upper()
    if m not in WRITE_METHODS:
        return True
    proto = (connector or {}).get("protocol") or "rest"
    gql_q = str(args.get("graphql_query") or "").strip()
    if not gql_q and proto == "graphql" and isinstance(args.get("body"), dict):
        gql_q = str(args["body"].get("query") or "").strip()
    if (proto == "graphql" or args.get("graphql_query") or args.get("body_type") == "graphql") and gql_q:
        if not _GRAPHQL_MUTATION_RE.match(gql_q):
            return True
    return False


def build_api_request(args: dict, connector: dict | None = None, http_fn=None) -> dict:
    c = normalize_connector(connector) if connector else None
    proto = c["protocol"] if c else str(args.get("protocol") or "rest").strip().lower()

    default_method = "POST" if (
        proto in ("graphql", "jsonrpc", "soap")
        or args.get("graphql_query")
        or args.get("rpc_method")
        or args.get("body_type") in ("graphql", "jsonrpc", "multipart")
    ) else "GET"
    method = str(args.get("method") or default_method).strip().upper()
    if method not in HTTP_METHODS:
        return {"error": f"不支持的 HTTP method: {method}"}

    path_params = args.get("path_params") if isinstance(args.get("path_params"), dict) else None
    url = ""
    if args.get("url"):
        url = apply_path_params(str(args["url"]).strip(), path_params)
    elif c:
        url = join_url(c["base_url"], str(args.get("path") or ""), path_params)
    elif args.get("path"):
        url = apply_path_params(str(args["path"]).strip(), path_params)
    if not url:
        return {"error": "需要提供 url，或 connector + path。"}

    bad = assert_safe_url(url)
    if bad:
        return {"error": bad}

    if c and c["base_url"]:
        try:
            target = urllib.parse.urlsplit(url)
            base_u = urllib.parse.urlsplit(c["base_url"])
            target_origin = f"{target.scheme.lower()}://{target.netloc.lower()}"
            base_origin = f"{base_u.scheme.lower()}://{base_u.netloc.lower()}"
            if target_origin != base_origin:
                return {"error": f"请求 URL 不在连接「{c['name']}」的源 {base_origin} 下，禁止跨源发送凭证。"}
        except ValueError:
            return {"error": "connector base_url 无效。"}

    merged_query: dict = {}
    if c and c["default_query"]:
        merged_query.update(c["default_query"])
    if isinstance(args.get("query"), dict):
        merged_query.update(args["query"])
    url = apply_query(url, merged_query)

    headers = merge_headers(c["default_headers"] if c else None, args.get("headers"))
    if "User-Agent" not in headers and "user-agent" not in {k.lower() for k in headers}:
        headers["User-Agent"] = prov_mod.USER_AGENT
    if "Accept" not in headers and "accept" not in {k.lower() for k in headers}:
        if proto == "sse":
            headers["Accept"] = "text/event-stream, application/json, */*"
        elif proto == "soap":
            headers["Accept"] = "text/xml, application/xml, */*"
        else:
            headers["Accept"] = "application/json, text/plain, */*"

    try:
        body_bytes, headers = encode_body(args, headers, protocol=proto)
    except Exception as e:
        return {"error": f"编码请求体失败: {e}"}

    if body_bytes and len(body_bytes) > CALL_API_MAX_BODY:
        return {"error": f"请求体超过上限 {CALL_API_MAX_BODY} 字节。"}

    try:
        authed_url, authed_headers = apply_auth(url, headers, c, body_bytes=body_bytes, http_fn=http_fn)
    except Exception as e:
        return {"error": str(e)}

    return {
        "method": method,
        "url": authed_url,
        "headers": authed_headers,
        "body": body_bytes,
        "protocol": proto,
    }


def _parse_header_dump(raw: bytes) -> tuple[int, dict[str, str]]:
    text = raw.decode("utf-8", "replace")
    blocks = [b.strip() for b in re.split(r"\r?\n\r?\n", text) if b.strip()]
    last_http = ""
    for b in blocks:
        if b.upper().startswith("HTTP/"):
            last_http = b
    if not last_http:
        return 0, {}
    lines = last_http.splitlines()
    status = 0
    parts = lines[0].split()
    if len(parts) >= 2 and parts[1].isdigit():
        status = int(parts[1])
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        headers[k.strip().lower()] = v.strip()
    return status, headers


def _curl_request(
    method: str,
    url: str,
    headers: dict[str, str],
    body: bytes | None,
    timeout_sec: float,
) -> tuple[int, dict[str, str], bytes]:
    curl_bin = shutil.which("curl.exe") or shutil.which("curl") or ""
    if not curl_bin:
        raise RuntimeError("curl 不可用")
    hdr_fd, hdr_path = tempfile.mkstemp(prefix="o2-apihdr-", suffix=".txt")
    os.close(hdr_fd)
    body_fd, body_path = tempfile.mkstemp(prefix="o2-apibody-", suffix=".bin")
    os.close(body_fd)
    cfg_fd, cfg_path = tempfile.mkstemp(prefix="o2-apicfg-", suffix=".cfg")
    os.close(cfg_fd)

    def _esc(s: str) -> str:
        return str(s).replace("\\", "\\\\").replace('"', '\\"')

    lines = [
        f'request = "{method}"',
        f'url = "{_esc(url)}"',
        "silent",
        "show-error",
        "location",
        "compressed",
        f"max-time = {max(1, int(round(timeout_sec)))}",
        f'dump-header = "{hdr_path.replace(chr(92), "/")}"',
        f'output = "{body_path.replace(chr(92), "/")}"',
    ]
    if method == "HEAD":
        lines.append("head")
    if body and method not in ("GET", "HEAD"):
        lines.append('data-binary = "@-"')
    for k, v in (headers or {}).items():
        if k.lower() in ("content-length", "host"):
            continue
        lines.append(f'header = "{_esc(k)}: {_esc(v)}"')

    try:
        with open(cfg_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        send_stdin = bool(body and method not in ("GET", "HEAD"))
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0
        proc = subprocess.Popen(
            [curl_bin, "-K", cfg_path],
            stdin=subprocess.PIPE if send_stdin else subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
        if send_stdin and proc.stdin:
            try:
                proc.stdin.write(body)
            finally:
                proc.stdin.close()
        try:
            _, err_b = proc.communicate(timeout=max(2.0, timeout_sec + 3.0))
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            raise TimeoutError(f"超时（{int(timeout_sec * 1000)}ms）")

        hdr_raw = b""
        if os.path.isfile(hdr_path):
            with open(hdr_path, "rb") as hf:
                hdr_raw = hf.read()
        resp_body = b""
        if os.path.isfile(body_path):
            with open(body_path, "rb") as bf:
                resp_body = bf.read()

        status, resp_headers = _parse_header_dump(hdr_raw)
        if status <= 0:
            err_msg = (err_b or b"").decode("utf-8", "replace").strip()
            raise RuntimeError(err_msg or f"请求失败 (curl exit {proc.returncode})")
        return status, resp_headers, resp_body
    finally:
        for p in (hdr_path, body_path, cfg_path):
            try:
                os.remove(p)
            except OSError:
                pass


def _urllib_request(
    method: str,
    url: str,
    headers: dict[str, str],
    body: bytes | None,
    timeout_sec: float,
) -> tuple[int, dict[str, str], bytes]:
    data = None if method in ("GET", "HEAD") else body
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    ctx = prov_mod.ssl_context() if url.lower().startswith("https://") else None
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec, context=ctx) as resp:
            status = getattr(resp, "status", None) or resp.getcode() or 200
            resp_headers = {k.lower(): v for k, v in resp.headers.items()} if resp.headers else {}
            raw = b"" if method == "HEAD" else resp.read()
            return int(status), resp_headers, raw
    except urllib.error.HTTPError as e:
        resp_headers = {k.lower(): v for k, v in e.headers.items()} if e.headers else {}
        try:
            raw = e.read()
        except Exception:
            raw = b""
        return int(e.code), resp_headers, raw
    except TimeoutError:
        raise TimeoutError(f"超时（{int(timeout_sec * 1000)}ms）")
    except urllib.error.URLError as e:
        if isinstance(getattr(e, "reason", None), TimeoutError) or "timed out" in str(e).lower():
            raise TimeoutError(f"超时（{int(timeout_sec * 1000)}ms）")
        raise RuntimeError(str(getattr(e, "reason", None) or e))


def _decompress_bytes(raw: bytes, headers: dict[str, str]) -> bytes:
    if not raw:
        return b""
    enc = (headers.get("content-encoding") or "").lower()
    if enc == "gzip" or (len(raw) >= 2 and raw[:2] == b"\x1f\x8b"):
        try:
            return gzip.decompress(raw)
        except Exception:
            return raw
    if enc == "deflate":
        try:
            return zlib.decompress(raw)
        except Exception:
            try:
                return zlib.decompress(raw, -zlib.MAX_WBITS)
            except Exception:
                return raw
    return raw


def _decode_text(raw: bytes, headers: dict[str, str]) -> str:
    if not raw:
        return ""
    ctype = headers.get("content-type") or ""
    m = re.search(r"charset=([A-Za-z0-9._-]+)", ctype, re.I)
    if m:
        charset = m.group(1).strip()
        try:
            return raw.decode(charset)
        except (LookupError, UnicodeDecodeError):
            pass
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return raw.decode("gb18030")
        except UnicodeDecodeError:
            return raw.decode("utf-8", "replace")


def _http_request(
    method: str,
    url: str,
    headers: dict[str, str],
    body: bytes | None,
    timeout_sec: float,
) -> tuple[int, dict[str, str], bytes]:
    if url.lower().startswith("https://") and (shutil.which("curl.exe") or shutil.which("curl")):
        try:
            status, hdrs, raw = _curl_request(method, url, headers, body, timeout_sec)
            return status, hdrs, _decompress_bytes(raw, hdrs)
        except TimeoutError:
            raise
        except Exception:
            pass
    status, hdrs, raw = _urllib_request(method, url, headers, body, timeout_sec)
    return status, hdrs, _decompress_bytes(raw, hdrs)


def _xml_to_dict(elem: ET.Element, depth: int = 0) -> dict | str:
    tag = elem.tag.split("}", 1)[-1] if "}" in elem.tag else elem.tag
    children = list(elem)
    text = (elem.text or "").strip()
    if not children and not elem.attrib:
        return text
    node: dict = {}
    if elem.attrib:
        node["@attrs"] = {
            (k.split("}", 1)[-1] if "}" in k else k): v
            for k, v in elem.attrib.items()
        }
    if text:
        node["#text"] = text
    if depth < 8:
        for child in children[:200]:
            ctag = child.tag.split("}", 1)[-1] if "}" in child.tag else child.tag
            cval = _xml_to_dict(child, depth + 1)
            if ctag in node:
                if not isinstance(node[ctag], list):
                    node[ctag] = [node[ctag]]
                node[ctag].append(cval)
            else:
                node[ctag] = cval
    return {tag: node} if depth == 0 else node


def _parse_xml_maybe(text: str) -> dict | None:
    s = (text or "").strip()
    if not s.startswith("<"):
        return None
    try:
        root = ET.fromstring(s)
        res = _xml_to_dict(root, depth=0)
        return res if isinstance(res, dict) else {"root": res}
    except ET.ParseError:
        return None


def _parse_sse_or_ndjson(text: str, content_type: str) -> list | None:
    ct = (content_type or "").lower()
    s = (text or "").strip()
    if not s:
        return None
    if "text/event-stream" in ct or s.startswith("event:") or s.startswith("data:"):
        events = []
        for line in s.splitlines():
            line = line.strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if not payload or payload == "[DONE]":
                continue
            try:
                events.append(json.loads(payload))
            except ValueError:
                events.append(payload)
        if events:
            return events
    if "ndjson" in ct or "jsonl" in ct:
        rows = []
        for line in s.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except ValueError:
                return None
        return rows if rows else None
    return None


def extract_by_path(data, path: str):
    p = str(path or "").strip()
    if not p or data is None:
        return data
    tokens = [t for t in re.split(r"\.|\[(\d+)\]", p) if t is not None and t != ""]
    cur = data
    for tok in tokens:
        if isinstance(cur, dict):
            if tok in cur:
                cur = cur[tok]
            else:
                return None
        elif isinstance(cur, list) and tok.isdigit():
            idx = int(tok)
            if 0 <= idx < len(cur):
                cur = cur[idx]
            else:
                return None
        else:
            return None
    return cur


def _spill_response(text: str, prefix: str = "api-") -> str:
    folder = os.path.join(tempfile.gettempdir(), "o2-api")
    os.makedirs(folder, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix=prefix, suffix=".json", dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        return path
    except Exception:
        return ""


def _summarize_large_json(obj):
    if isinstance(obj, dict):
        summary = {}
        for k, v in list(obj.items())[:30]:
            if isinstance(v, list):
                summary[k] = {
                    "_type": f"Array({len(v)})",
                    "sample": v[:5],
                }
            elif isinstance(v, dict):
                summary[k] = {
                    "_type": f"Object({len(v)} keys)",
                    "keys": list(v.keys())[:20],
                }
            else:
                summary[k] = v
        return summary
    if isinstance(obj, list):
        return {
            "_type": f"Array({len(obj)})",
            "sample": obj[:10],
        }
    return obj


def _useful_response_headers(hdrs: dict[str, str]) -> dict[str, str]:
    keep = {}
    for k, v in (hdrs or {}).items():
        kl = k.lower()
        if (
            kl in ("content-type", "location", "retry-after", "link", "x-total-count", "x-request-id")
            or "ratelimit" in kl
            or "rate-limit" in kl
            or "pagination" in kl
        ):
            keep[kl] = v
    return keep


def discover_openapi(url: str, http_fn=None) -> dict:
    bad = assert_safe_url(url)
    if bad:
        return {"ok": False, "error": bad}
    sender = http_fn or _http_request

    candidates = [url]
    u = urllib.parse.urlsplit(url)
    if not u.path or u.path == "/" or not u.path.endswith((".json", ".yaml", ".yml")):
        base = url.rstrip("/")
        for suffix in ("/openapi.json", "/swagger.json", "/v3/api-docs", "/v2/api-docs", "/api-docs"):
            cand = base + suffix
            if cand not in candidates:
                candidates.append(cand)

    spec = None
    hit_url = ""
    last_err = ""
    for cand in candidates:
        try:
            status, hdrs, raw = sender("GET", cand, {"Accept": "application/json", "User-Agent": prov_mod.USER_AGENT}, None, 15.0)
            if status >= 400:
                last_err = f"HTTP {status}"
                continue
            text = _decode_text(_decompress_bytes(raw, hdrs), hdrs)
            parsed = json.loads(text)
            if isinstance(parsed, dict) and ("paths" in parsed or "openapi" in parsed or "swagger" in parsed):
                spec = parsed
                hit_url = cand
                break
        except Exception as e:
            last_err = str(e)

    if not spec:
        return {"ok": False, "error": f"未能解析 OpenAPI/Swagger JSON 文档（{last_err or '未找到 paths'}）"}

    info = spec.get("info") if isinstance(spec.get("info"), dict) else {}
    title = str(info.get("title") or "").strip() or urllib.parse.urlsplit(hit_url).hostname or "API"
    desc = str(info.get("description") or "").strip()[:600]

    # Resolve base_url
    base_url = ""
    servers = spec.get("servers")
    if isinstance(servers, list) and servers and isinstance(servers[0], dict):
        srv_url = str(servers[0].get("url") or "").strip()
        if srv_url.startswith("http://") or srv_url.startswith("https://"):
            base_url = srv_url.rstrip("/")
        elif srv_url.startswith("/"):
            hu = urllib.parse.urlsplit(hit_url)
            base_url = f"{hu.scheme}://{hu.netloc}{srv_url}".rstrip("/")
    if not base_url:
        hu = urllib.parse.urlsplit(hit_url)
        host = str(spec.get("host") or hu.netloc).strip()
        base_path = str(spec.get("basePath") or "").strip().rstrip("/")
        scheme = "https"
        if isinstance(spec.get("schemes"), list) and spec["schemes"]:
            scheme = str(spec["schemes"][0])
        elif hu.scheme:
            scheme = hu.scheme
        base_url = f"{scheme}://{host}{base_path}".rstrip("/")

    # Resolve security schemes
    auth_type = "none"
    header_name = "X-Api-Key"
    query_name = "api_key"
    token_url = ""
    sec_defs = (
        ((spec.get("components") or {}).get("securitySchemes") if isinstance(spec.get("components"), dict) else None)
        or spec.get("securityDefinitions")
        or {}
    )
    if isinstance(sec_defs, dict):
        for _sname, sdef in sec_defs.items():
            if not isinstance(sdef, dict):
                continue
            st = str(sdef.get("type") or "").lower()
            scheme = str(sdef.get("scheme") or "").lower()
            loc = str(sdef.get("in") or "").lower()
            if st == "http" and scheme == "bearer":
                auth_type = "bearer"
                break
            if st == "http" and scheme == "basic":
                auth_type = "basic"
                break
            if st == "apikey":
                if loc == "query":
                    auth_type = "query"
                    query_name = str(sdef.get("name") or "api_key")
                else:
                    auth_type = "header"
                    header_name = str(sdef.get("name") or "X-Api-Key")
                break
            if st == "oauth2":
                auth_type = "oauth2_client_credentials"
                flows = sdef.get("flows") if isinstance(sdef.get("flows"), dict) else {}
                cc = flows.get("clientCredentials") or flows.get("application") or sdef
                if isinstance(cc, dict) and cc.get("tokenUrl"):
                    token_url = str(cc["tokenUrl"])
                break

    # Extract endpoints
    paths = spec.get("paths") if isinstance(spec.get("paths"), dict) else {}
    endpoints: list[dict] = []
    for path_key, methods_obj in paths.items():
        if not isinstance(methods_obj, dict):
            continue
        common_params = methods_obj.get("parameters") if isinstance(methods_obj.get("parameters"), list) else []
        for m_name, op in methods_obj.items():
            m_up = m_name.upper()
            if m_up not in HTTP_METHODS or not isinstance(op, dict):
                continue
            summary = str(op.get("summary") or op.get("description") or op.get("operationId") or "").strip()
            summary = re.sub(r"\s+", " ", summary)[:160]
            op_params = list(common_params) + (op.get("parameters") if isinstance(op.get("parameters"), list) else [])
            p_list: list[str] = []
            for p in op_params[:12]:
                if not isinstance(p, dict):
                    continue
                pname = str(p.get("name") or "").strip()
                if not pname:
                    continue
                pin = str(p.get("in") or "query")
                req = "*" if p.get("required") else ""
                p_list.append(f"{pname}{req}({pin})")
            req_body = op.get("requestBody")
            if isinstance(req_body, dict):
                content = req_body.get("content") if isinstance(req_body.get("content"), dict) else {}
                json_media = content.get("application/json") or next(iter(content.values()), None)
                if isinstance(json_media, dict) and isinstance(json_media.get("schema"), dict):
                    props = json_media["schema"].get("properties")
                    if isinstance(props, dict) and props:
                        bkeys = ", ".join(list(props.keys())[:10])
                        p_list.append(f"body: {{{bkeys}}}")
            endpoints.append({
                "method": m_up,
                "path": str(path_key),
                "summary": summary,
                "params": ", ".join(p_list),
            })
            if len(endpoints) >= 40:
                break
        if len(endpoints) >= 40:
            break

    note_parts = []
    if desc:
        note_parts.append(desc)
    note_parts.append(f"OpenAPI 文档源: {hit_url}（共发现 {len(endpoints)} 个常用端点）")
    notes = "\n".join(note_parts)
    category = infer_category(title, base_url=base_url, notes=notes, endpoints=endpoints)

    return {
        "ok": True,
        "spec_url": hit_url,
        "name": title,
        "category": category,
        "base_url": base_url,
        "protocol": "rest",
        "auth_type": auth_type,
        "header_name": header_name,
        "query_name": query_name,
        "token_url": token_url,
        "notes": notes,
        "endpoints": endpoints,
    }


def execute_api_call(args: dict, opts: dict | None = None) -> dict:
    opts = opts or {}
    cfg = opts.get("cfg")
    http_fn = opts.get("http_fn")
    sub = bool(opts.get("subagent_kind") or opts.get("subagentKind"))

    def _load() -> list[dict]:
        if callable(opts.get("load_connectors")):
            return [normalize_connector(c) for c in (opts["load_connectors"]() or [])]
        if cfg is not None:
            migrate(cfg.data)
            return [normalize_connector(c) for c in (cfg.data.get("api_connectors") or [])]
        return []

    def _save(new_list: list[dict]) -> None:
        normed = [normalize_connector(c) for c in (new_list or [])]
        if callable(opts.get("save_connectors")):
            opts["save_connectors"](normed)
            return
        if cfg is not None:
            cfg.data["api_connectors"] = normed
            if hasattr(cfg, "save") and callable(cfg.save):
                cfg.save()

    a = args if isinstance(args, dict) else {}
    action = str(a.get("action") or "request").strip().lower()

    if sub and action not in ("request", "list", "get"):
        return {"ok": False, "error": "子代理仅允许 list / get / 只读 request，不能保存或删除 API 连接。"}

    if action == "list":
        connectors = _load()
        cat_filter = str(a.get("category") or "").strip().lower()
        kw_filter = str(a.get("query") or a.get("q") or "").strip().lower()
        filtered = []
        for c in connectors:
            pub = public_connector(c)
            if cat_filter and pub.get("category") != cat_filter and API_CATEGORY_LABELS.get(pub.get("category"), "").lower() != cat_filter:
                continue
            if kw_filter:
                blob = f"{pub.get('name','')} {pub.get('base_url','')} {pub.get('notes','')}".lower()
                if kw_filter not in blob:
                    continue
            filtered.append({
                "id": pub["id"],
                "name": pub["name"],
                "category": pub["category"],
                "category_label": API_CATEGORY_LABELS.get(pub["category"], "其他"),
                "preferred": pub["preferred"],
                "protocol": pub["protocol"],
                "base_url": pub["base_url"],
                "auth_type": pub["auth_type"],
                "has_key": pub["has_key"],
                "allow_write": pub["allow_write"],
                "summary": (pub["notes"] or "").splitlines()[0][:180] if pub.get("notes") else "",
                "endpoint_count": len(pub.get("endpoints") or []),
            })
        return {
            "ok": True,
            "count": len(filtered),
            "total": len(connectors),
            "connectors": filtered,
            "hint": "调用 call_api(action=\"get\", connector=\"连接名\") 查看指定连接的完整使用说明与全部端点参数。",
        }

    if action in ("get", "describe"):
        connectors = _load()
        target = a.get("connector") or a.get("name") or a.get("id")
        hit = find_connector(connectors, target)
        if not hit:
            return {"ok": False, "error": f"未找到名为「{target or ''}」的连接。可先 action=list 查看。"}
        return {"ok": True, "connector": public_connector(hit)}

    if action == "delete":
        connectors = _load()
        target = a.get("connector") or a.get("name") or a.get("id")
        hit = find_connector(connectors, target)
        if not hit:
            return {"ok": False, "error": "没有找到该连接。"}
        _save([c for c in connectors if c["id"] != hit["id"]])
        return {"ok": True, "deleted": hit["name"]}

    if action == "discover":
        target_url = str(a.get("url") or a.get("base_url") or a.get("baseUrl") or "").strip()
        connectors = _load()
        existing = find_connector(connectors, a.get("connector") or a.get("name") or a.get("id"))
        if not target_url and existing:
            target_url = existing["base_url"]
        if not target_url:
            return {"ok": False, "error": "discover 需要提供 OpenAPI/Swagger 文档 url 或 base_url。"}
        disc = discover_openapi(target_url, http_fn=http_fn)
        if not disc.get("ok"):
            return disc
        if a.get("save") or existing:
            save_args = {
                "action": "save",
                "id": existing["id"] if existing else None,
                "name": a.get("name") or a.get("connector") or (existing["name"] if existing else disc["name"]),
                "base_url": a.get("base_url") or disc["base_url"] or (existing["base_url"] if existing else ""),
                "protocol": a.get("protocol") or disc["protocol"],
                "auth_type": a.get("auth_type") or (existing["auth_type"] if existing else disc["auth_type"]),
                "api_key": a.get("api_key") or (existing["api_key"] if existing else ""),
                "api_secret": a.get("api_secret") or (existing["api_secret"] if existing else ""),
                "header_name": a.get("header_name") or disc["header_name"],
                "query_name": a.get("query_name") or disc["query_name"],
                "token_url": a.get("token_url") or disc["token_url"],
                "notes": a.get("notes") or disc["notes"],
                "endpoints": a.get("endpoints") or disc["endpoints"],
                "allow_write": a.get("allow_write") if a.get("allow_write") is not None else (existing["allow_write"] if existing else False),
            }
            saved_res = execute_api_call(save_args, opts)
            disc["saved"] = saved_res.get("saved")
            disc["hint"] = saved_res.get("hint")
        return disc

    if action == "save":
        name = str(a.get("name") or a.get("connector") or "").strip()
        if not name:
            return {"ok": False, "error": "save 需要提供连接名称 name。"}
        connectors = _load()
        existing = find_connector(connectors, a.get("id")) or find_connector(connectors, name)
        base_url = str(a.get("base_url") or a.get("baseUrl") or (existing or {}).get("base_url") or "").strip()
        if not base_url or base_url in ("https://", "http://"):
            return {
                "ok": False,
                "error": "save 需要有效的 base_url（免费无需 Key 的接口也要保存根地址，用来在目录中提醒有这条渠道）。",
            }
        bad = assert_safe_url(base_url)
        if bad:
            return {"ok": False, "error": f"base_url 无效: {bad}"}

        auth_type = str(a.get("auth_type") or a.get("authType") or (existing or {}).get("auth_type") or "none").strip().lower()
        protocol = str(a.get("protocol") or (existing or {}).get("protocol") or "rest").strip().lower()

        allow_write = (
            bool(a["allow_write"])
            if "allow_write" in a and a["allow_write"] is not None
            else (
                bool(a["allowWrite"])
                if "allowWrite" in a and a["allowWrite"] is not None
                else bool((existing or {}).get("allow_write", False))
            )
        )
        notes = (
            str(a["notes"])
            if a.get("notes") is not None
            else (
                str(a["usage"])
                if a.get("usage") is not None
                else str((existing or {}).get("notes") or "")
            )
        )
        endpoints = a["endpoints"] if a.get("endpoints") is not None else (existing or {}).get("endpoints")
        default_headers = (
            a.get("default_headers")
            if a.get("default_headers") is not None
            else (a.get("defaultHeaders") if a.get("defaultHeaders") is not None else (existing or {}).get("default_headers"))
        )
        default_query = (
            a.get("default_query")
            if a.get("default_query") is not None
            else (a.get("defaultQuery") if a.get("defaultQuery") is not None else (existing or {}).get("default_query"))
        )

        merged = normalize_connector({
            **(existing or {}),
            "id": (existing or {}).get("id"),
            "name": name,
            "protocol": protocol,
            "base_url": base_url,
            "auth_type": auth_type,
            "api_key": "" if auth_type == "none" else (
                a.get("api_key") or a.get("apiKey") or (existing or {}).get("api_key") or ""
            ),
            "api_secret": (
                a.get("api_secret") or a.get("apiSecret") or (existing or {}).get("api_secret") or ""
            ),
            "auth_prefix": a.get("auth_prefix") or a.get("authPrefix") or (existing or {}).get("auth_prefix"),
            "header_name": a.get("header_name") or a.get("headerName") or (existing or {}).get("header_name"),
            "secret_header_name": a.get("secret_header_name") or a.get("secretHeaderName") or (existing or {}).get("secret_header_name"),
            "query_name": a.get("query_name") or a.get("queryName") or (existing or {}).get("query_name"),
            "secret_query_name": a.get("secret_query_name") or a.get("secretQueryName") or (existing or {}).get("secret_query_name"),
            "signature_param": a.get("signature_param") or a.get("signatureParam") or (existing or {}).get("signature_param"),
            "signature_in": a.get("signature_in") or a.get("signatureIn") or (existing or {}).get("signature_in"),
            "signature_encoding": a.get("signature_encoding") or a.get("signatureEncoding") or (existing or {}).get("signature_encoding"),
            "token_url": a.get("token_url") or a.get("tokenUrl") or (existing or {}).get("token_url"),
            "default_headers": default_headers,
            "default_query": default_query,
            "allow_write": allow_write,
            "notes": notes,
            "endpoints": endpoints,
            "created_at": (existing or {}).get("created_at"),
            "updated_at": int(time.time() * 1000),
        })

        next_list = (
            [merged if c["id"] == existing["id"] else c for c in connectors]
            if existing
            else [*connectors, merged]
        )
        _save(next_list)
        if cfg is not None:
            maybe_silent_reclassify(cfg)
        pub = public_connector(merged)
        hint = (
            f"已保存连接「{merged['name']}」（含鉴权配置与使用说明）。之后请用 connector=\"{merged['name']}\" 调用，不要再传 api_key。"
            if pub["has_key"]
            else f"已保存为免费渠道「{merged['name']}」（无需 Key）。后续相关问题优先用 connector=\"{merged['name']}\" 调用。"
        )
        return {"ok": True, "saved": pub, "hint": hint}

    if action not in ("request", "test"):
        return {"ok": False, "error": f"未知 action: {action}。可选 request / save / discover / list / get / test / delete。"}

    connectors = _load()
    conn_name = a.get("connector") or a.get("name")
    connector = find_connector(connectors, conn_name) if conn_name else None
    if conn_name and not connector:
        return {
            "ok": False,
            "error": f"没有找到名为「{conn_name}」的连接。请用 action=\"list\" 查看，或先用 action=\"save\" 添加该连接。",
        }

    req_args = dict(a)
    if action == "test":
        if connector and connector["protocol"] == "graphql" and not req_args.get("graphql_query"):
            req_args["graphql_query"] = "{ __typename }"
        elif connector and connector["protocol"] == "jsonrpc" and not req_args.get("rpc_method"):
            req_args.setdefault("method", "POST")
        else:
            req_args["method"] = str(a.get("method") or "GET").upper()
        if not connector and not req_args.get("url"):
            return {"ok": False, "error": "测试需要提供 connector 或 url。"}

    built = build_api_request(req_args, connector, http_fn=http_fn)
    if built.get("error"):
        return {"ok": False, "error": built["error"]}

    method = built["method"]
    readonly = is_readonly_request(method, req_args, connector)
    if sub and not readonly:
        return {"ok": False, "error": "子代理只能执行只读请求，写入操作请交由主代理执行。"}

    if not readonly:
        if connector and not connector.get("allow_write"):
            return {
                "ok": False,
                "error": f"连接「{connector['name']}」当前为只读（未开启允许写入）。请在设置中开启，或调用 action=\"save\" 设 allow_write=true。",
            }
        if not connector:
            return {
                "ok": False,
                "error": "POST/PUT/PATCH/DELETE 写入操作必须走已保存且开启 allow_write 的连接，防止误改任意网址数据。",
            }

    raw_timeout = a.get("timeout_ms") or a.get("timeoutMs") or opts.get("timeout_ms") or DEFAULT_TIMEOUT_MS
    try:
        timeout_ms = max(1000, min(int(float(raw_timeout)), MAX_TIMEOUT_MS))
    except (TypeError, ValueError):
        timeout_ms = DEFAULT_TIMEOUT_MS

    secrets = [
        s for s in [
            (connector or {}).get("api_key") or "",
            (connector or {}).get("api_secret") or "",
        ]
        if s
    ]
    safe_url = redact_url(built["url"], secrets)
    sender = http_fn or _http_request
    t0 = time.time()
    try:
        status, resp_headers, raw_bytes = sender(
            method,
            built["url"],
            built["headers"],
            built["body"],
            timeout_ms / 1000.0,
        )
    except Exception as e:
        return {
            "ok": False,
            "url": safe_url,
            "error": redact_text(str(e), secrets),
        }

    elapsed_ms = int((time.time() - t0) * 1000)
    raw_bytes = _decompress_bytes(raw_bytes, resp_headers)
    content_type = resp_headers.get("content-type") or ""
    raw_text = "" if method == "HEAD" else _decode_text(raw_bytes, resp_headers)
    raw_text = redact_text(raw_text, secrets)

    out: dict = {
        "ok": 200 <= status < 300,
        "status": status,
        "method": method,
        "url": safe_url,
        "contentType": content_type,
        "elapsedMs": elapsed_ms,
        "chars": len(raw_text),
    }
    if connector:
        out["connector"] = connector["name"]
    useful_hdrs = _useful_response_headers(resp_headers)
    if useful_hdrs:
        out["headers"] = useful_hdrs

    parsed_json = None
    s_trim = raw_text.strip()
    if s_trim and len(s_trim) <= 2_000_000 and (s_trim[0] in ("{", "[") or "json" in content_type.lower()):
        try:
            parsed_json = json.loads(s_trim)
        except ValueError:
            parsed_json = None

    if parsed_json is None:
        events = _parse_sse_or_ndjson(raw_text, content_type)
        if events is not None:
            parsed_json = {"events": events, "count": len(events)}

    if parsed_json is None and ("xml" in content_type.lower() or s_trim.startswith("<")):
        xml_dict = _parse_xml_maybe(s_trim)
        if xml_dict is not None:
            out["xml"] = xml_dict

    extract_path = str(a.get("extract_path") or "").strip()
    if parsed_json is not None and extract_path:
        extracted = extract_by_path(parsed_json, extract_path)
        out["extract_path"] = extract_path
        parsed_json = extracted

    if parsed_json is not None:
        dumped = json.dumps(parsed_json, ensure_ascii=False)
        if len(dumped) > MAX_INLINE_CHARS:
            spill_path = _spill_response(json.dumps(parsed_json, ensure_ascii=False, indent=2))
            out["truncated"] = True
            if spill_path:
                out["full_output_path"] = spill_path
            out["json_summary"] = _summarize_large_json(parsed_json)
            out["preview"] = dumped[:MAX_INLINE_CHARS]
        else:
            out["json"] = parsed_json
    elif "xml" not in out:
        if len(raw_text) > MAX_INLINE_CHARS:
            spill_path = _spill_response(raw_text, prefix="api-txt-")
            out["truncated"] = True
            if spill_path:
                out["full_output_path"] = spill_path
            out["text"] = raw_text[:MAX_INLINE_CHARS]
        else:
            out["text"] = raw_text

    if not out["ok"]:
        out["error"] = f"HTTP {status}"
    return out


def action_label(args: dict) -> str:
    a = args if isinstance(args, dict) else {}
    act = str(a.get("action") or "request").strip().lower()
    conn = str(a.get("connector") or a.get("name") or "").strip()
    if act == "list":
        return "列出已接入 API"
    if act in ("get", "describe"):
        return f"查看 API 说明 · {conn}" if conn else "查看 API 说明"
    if act == "save":
        return f"保存 API 连接 · {conn}" if conn else "保存 API 连接"
    if act == "delete":
        return f"删除 API 连接 · {conn}" if conn else "删除 API 连接"
    if act == "discover":
        target = conn or str(a.get("url") or a.get("base_url") or "").strip()
        return f"解析 OpenAPI · {target}"[:80]
    if act == "test":
        target = conn or str(a.get("url") or "").strip()
        return f"测试 API · {target}"[:80]

    method = str(a.get("method") or (
        "POST" if (a.get("graphql_query") or a.get("rpc_method")) else "GET"
    )).upper()
    path = str(a.get("path") or "").strip()
    if a.get("rpc_method"):
        detail = f"RPC {a['rpc_method']}"
    elif a.get("graphql_query"):
        detail = "GraphQL"
    else:
        detail = f"{method} {path}" if path else method

    if conn:
        label = f"{conn} · {detail}"
    else:
        raw_url = redact_url(str(a.get("url") or path))
        label = f"{method} {raw_url}".strip()
    return label[:80]


def run_call_api(args: dict, cfg) -> tuple[str, bool, str]:
    res = execute_api_call(args, {"cfg": cfg})
    ok = bool(res.get("ok"))
    act = str((args or {}).get("action") or "request").strip().lower()
    if act == "save" and ok:
        note = "已保存"
    elif act == "delete" and ok:
        note = "已删除"
    elif act == "discover" and ok:
        note = "已解析"
    elif "status" in res:
        note = f"HTTP {res['status']}"
    else:
        note = "完成" if ok else "失败"
    text = json.dumps(res, ensure_ascii=False, indent=2)
    return text, ok, note
