from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request

_lock = threading.Lock()
_ctl_url = ""
_ctl_token = ""

_DIRECT_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

PROMPT = """
11. 需要浏览网页、查询实时在线信息、操作已登录的网站或读取浏览器全部状态时，调用 browser。该浏览器内嵌在 O2「浏览器」功能页中，持久保存用户登录态，你与用户操作的是同一个实时浏览器实例。
12. 操作网页元素前先用 browser(action="snapshot") 获取可交互元素的 ref（如 e1、e2），再用 click / fill / select 操作；需要读取长正文用 read，需要看视觉排版或验证码用 screenshot，需要调接口或深度排障可用 eval、network、console、cookies、storage 或 cdp。
13. 遇到必须由用户本人完成的登录扫码、短信验证码、支付或敏感确认时，提示用户切到左侧「浏览器」页完成后继续。"""

TOOL = {
    "type": "function",
    "function": {
        "name": "browser",
        "description": (
            "控制 O2 内置的持久化 Chromium 浏览器并读取其全部信息（与用户实时共享同一实例）。"
            "支持动作 action："
            "status/tabs（查看标签页与下载）、"
            "open（打开网址或搜索词，传 url，可选 new_tab）、"
            "switch_tab/close_tab（传 tab_id）、"
            "back/forward/reload、"
            "snapshot（获取页面概览与可交互元素编号 e1..eN）、"
            "read（提取页面全文、指定 selector 内容或 HTML）、"
            "click（按 ref/selector/text 或坐标 x,y 点击）、"
            "fill/type（按 ref/selector 输入文本，可选 press_enter）、"
            "select（选择下拉项 value/label）、"
            "press（按键如 Enter、Escape、Control+a）、"
            "hover、scroll（up/down/top/bottom 或滚到 ref/selector）、"
            "wait（等待 ms 或等待 selector/text 出现）、"
            "screenshot（截取页面画面）、"
            "eval（执行任意 JS 表达式并返回结果）、"
            "console（读取控制台日志与报错）、"
            "network（读取网络请求列表，或传 request_id 获取响应体）、"
            "cookies（get/set/clear Cookie，含 HttpOnly）、"
            "storage（读写 localStorage/sessionStorage）、"
            "downloads（查看下载文件及本地路径）、"
            "cdp（执行任意原生 Chrome DevTools Protocol 命令 method+params）。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "status", "tabs", "open", "switch_tab", "close_tab",
                        "back", "forward", "reload", "snapshot", "read",
                        "click", "hover", "fill", "type", "select", "press",
                        "scroll", "wait", "screenshot", "eval", "console",
                        "network", "cookies", "storage", "downloads", "cdp",
                    ],
                    "description": "要执行的浏览器操作",
                },
                "url": {"type": "string", "description": "网址或搜索关键词（open / cookies 用）"},
                "new_tab": {"type": "boolean", "description": "open 时是否在新标签页打开"},
                "tab_id": {"type": "string", "description": "目标标签页 ID（如 t1），不填则操作当前活动标签页"},
                "ref": {"type": "string", "description": "snapshot 返回的元素编号，如 e1"},
                "selector": {"type": "string", "description": "CSS 选择器"},
                "text": {"type": "string", "description": "按可见文本匹配元素，或 wait 等待出现的文本"},
                "value": {"type": "string", "description": "fill / type / select / storage 写入的值"},
                "label": {"type": "string", "description": "select 下拉选项显示文本"},
                "clear": {"type": "boolean", "description": "fill/type/console/network 是否清空"},
                "press_enter": {"type": "boolean", "description": "fill/type 后是否按回车提交"},
                "key": {"type": "string", "description": "press 按键名或组合键，如 Enter、Tab、Control+a"},
                "x": {"type": "number", "description": "视口横坐标"},
                "y": {"type": "number", "description": "视口纵坐标"},
                "button": {"type": "string", "enum": ["left", "right", "middle"]},
                "double": {"type": "boolean", "description": "是否双击"},
                "direction": {"type": "string", "enum": ["down", "up", "top", "bottom"]},
                "amount": {"type": "number", "description": "滚动像素数，默认 650"},
                "format": {"type": "string", "enum": ["text", "html"], "description": "read 返回格式"},
                "max_chars": {"type": "number", "description": "read/snapshot 最大返回字符数"},
                "full_page": {"type": "boolean", "description": "screenshot 是否截取整页"},
                "ms": {"type": "number", "description": "wait 等待毫秒数"},
                "timeout_ms": {"type": "number", "description": "超时毫秒数"},
                "expression": {"type": "string", "description": "eval 执行的 JavaScript 代码"},
                "url_filter": {"type": "string", "description": "network 过滤 URL 子串"},
                "request_id": {"type": "string", "description": "network 获取响应体的 requestId"},
                "op": {"type": "string", "enum": ["get", "set", "remove", "clear"]},
                "domain": {"type": "string", "description": "cookies 按域名过滤"},
                "cookie": {"type": "object", "description": "cookies op=set 时写入的 Cookie 对象"},
                "kind": {"type": "string", "enum": ["local", "session"], "description": "storage 类型"},
                "key_name": {"type": "string", "description": "storage 的键名"},
                "method": {"type": "string", "description": "cdp 命令名，如 Page.navigate、DOM.getDocument"},
                "params": {"type": "object", "description": "cdp 命令参数对象"},
            },
            "required": ["action"],
        },
    },
}


def enabled(cfg) -> bool:
    data = getattr(cfg, "data", None) or {}
    return bool(data.get("browser", True))


def register_bridge(ctl_url: str, token: str) -> None:
    global _ctl_url, _ctl_token
    with _lock:
        _ctl_url = (ctl_url or "").strip().rstrip("/")
        _ctl_token = (token or "").strip()


def bridge_ready() -> bool:
    with _lock:
        return bool(_ctl_url and _ctl_token)


def call_bridge(payload: dict, timeout: float = 35.0) -> dict:
    with _lock:
        url = _ctl_url
        token = _ctl_token
    if not url or not token:
        return {
            "ok": False,
            "error": "内置浏览器未就绪（请使用 O2 桌面端启动窗口以加载内置 Chromium 视图）",
        }
    body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url + "/action",
        data=body,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "x-o2-token": token,
        },
        method="POST",
    )
    try:
        with _DIRECT_OPENER.open(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return json.loads(raw) if raw else {"ok": False, "error": "empty bridge response"}
    except urllib.error.HTTPError as e:
        detail = e.read(1000).decode("utf-8", "replace")
        return {"ok": False, "error": f"browser bridge HTTP {e.code}: {detail}"}
    except Exception as e:
        return {"ok": False, "error": f"内置浏览器连接失败: {e}"}


def action_label(args: dict) -> str:
    act = str((args or {}).get("action") or "status").strip()
    names = {
        "status": "查看状态",
        "tabs": "标签页列表",
        "open": "打开 " + str(args.get("url") or ""),
        "switch_tab": "切换标签 " + str(args.get("tab_id") or ""),
        "close_tab": "关闭标签 " + str(args.get("tab_id") or ""),
        "back": "后退",
        "forward": "前进",
        "reload": "刷新页面",
        "snapshot": "获取页面快照",
        "read": "读取页面内容",
        "click": "点击 " + str(args.get("ref") or args.get("text") or args.get("selector") or f"({args.get('x')},{args.get('y')})"),
        "hover": "悬停 " + str(args.get("ref") or args.get("selector") or ""),
        "fill": "填写 " + str(args.get("ref") or args.get("selector") or ""),
        "type": "输入文本",
        "select": "选择下拉项",
        "press": "按键 " + str(args.get("key") or "Enter"),
        "scroll": "滚动页面",
        "wait": "等待页面",
        "screenshot": "截取页面画面",
        "eval": "执行页面脚本",
        "console": "读取控制台",
        "network": "读取网络请求",
        "cookies": "访问 Cookie",
        "storage": "访问本地存储",
        "downloads": "查看下载记录",
        "cdp": "CDP " + str(args.get("method") or ""),
    }
    label = names.get(act, act).strip()
    return label[:80]


def _fmt_snapshot(snap: dict, tab: dict | None = None) -> str:
    t = tab or snap.get("tab") or {}
    tid = t.get("id") or ""
    title = snap.get("title") or t.get("title") or ""
    url = snap.get("url") or t.get("url") or ""
    head = f"[Tab {tid}] {title}\nURL: {url}"
    if "scrollY" in snap:
        head += (
            f"\nViewport: {snap.get('viewportWidth')}x{snap.get('viewportHeight')} | "
            f"ScrollY: {snap.get('scrollY')}/{snap.get('scrollHeight')}"
        )
    els = snap.get("elements") or []
    lines = [head, f"\nInteractive Elements ({len(els)}):"]
    for el in els:
        tag = el.get("tag") or "el"
        if el.get("type"):
            tag += f"[{el['type']}]"
        elif el.get("role"):
            tag += f"[role={el['role']}]"
        txt = el.get("text") or ""
        val = f" value={el['value']!r}" if el.get("value") else ""
        href = f" -> {el['href']}" if el.get("href") else ""
        flags = ""
        if el.get("checked"):
            flags += " [checked]"
        if el.get("disabled"):
            flags += " [disabled]"
        lines.append(
            f"  [{el.get('ref')}] <{tag}>{flags} {txt!r}{val}{href} @({el.get('x')},{el.get('y')})"
        )
    excerpt = (snap.get("textExcerpt") or "").strip()
    if excerpt:
        lines.append("\nVisible Text Excerpt:\n" + excerpt)
    return "\n".join(lines)


def run_browser(args: dict) -> tuple[str, bool, dict | None]:
    payload = dict(args or {})
    if "key_name" in payload and "key" not in payload:
        payload["key"] = payload.pop("key_name")
    act = str(payload.get("action") or "status").strip()

    res = call_bridge(payload)
    if not res.get("ok"):
        return f"Error: {res.get('error') or '操作失败'}", False, None

    if act == "screenshot":
        tab = res.get("tab") or {}
        path = res.get("path") or ""
        b64 = res.get("data") or ""
        mime = res.get("mime") or "image/jpeg"
        text = (
            f"[Tab {tab.get('id', '')}] {tab.get('title', '')}\n"
            f"URL: {tab.get('url', '')}\n"
            f"Screenshot saved: {path}"
        )
        img = {"name": "browser-screenshot.jpg", "mime": mime, "data": b64} if b64 else None
        return text, True, img

    if act == "snapshot":
        return _fmt_snapshot(res, res.get("tab")), True, None

    if act == "open":
        snap = res.get("snapshot")
        if isinstance(snap, dict):
            return _fmt_snapshot(snap, res.get("tab")), True, None
        tab = res.get("tab") or {}
        return f"Opened [Tab {tab.get('id', '')}] {tab.get('title', '')} — {tab.get('url', '')}", True, None

    if act == "read":
        tab = res.get("tab") or {}
        lines = [
            f"[Tab {tab.get('id', '')}] {res.get('title') or tab.get('title', '')}",
            f"URL: {res.get('url') or tab.get('url', '')}",
            "",
            res.get("content") or "(empty)",
        ]
        links = res.get("links") or []
        if links:
            lines.append("\nLinks:")
            for lk in links[:40]:
                lines.append(f"  - {lk.get('text')}: {lk.get('href')}")
        return "\n".join(lines), True, None

    slim = {k: v for k, v in res.items() if k != "data"}
    return json.dumps(slim, ensure_ascii=False, indent=2), True, None
