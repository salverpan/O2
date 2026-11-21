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
11. 需要浏览网页、查询实时在线信息、操作已登录的网站或读取浏览器全部状态时，调用 browser。调用时问答界面上方会自动展开固定比例的内置浏览器窗口并展示你的虚拟鼠标轨迹，你与用户实时共享同一个持久化浏览器实例。
12. 操作网页元素前先看快照中的 [ref=eN]（如 e12），再用 click / fill / select 传入该 ref。点击和悬停只传 ref 或 selector，不要传快照里的坐标，也不要写死 x,y；程序会在当前视口下重新测量元素中心，窗口拉大拉小都不影响落点。open / click / fill / type / select / press / scroll 成功后会自动附带最新快照，可直接用新 ref 继续，不必每次再 snapshot；只有 ref 失效、找不到目标或页面结构对不上时才再调 snapshot。大页面要找某个按钮/输入框时，优先 browser(action="find", text="登录")，只返回命中片段和 ref，避免整页快照过长。需要读长正文用 read，看验证码或纯图像用 screenshot。
13. 遇到必须由用户本人完成的人机验证（验证码、滑块、Cloudflare 拦截）、扫码登录、账号密码/短信验证码登录、支付或敏感确认（或 snapshot 提示检测到需要人工操作）时，立即调用 browser(action="wait_for_human", reason="简明提示用户需完成的操作")。调用后浏览器会挂起等待用户操作，系统检测到用户操作完成后会自动唤醒你并返回最新页面快照继续下一步；若返回用户主动关闭了浏览器窗口，说明用户放弃该验证，请勿重复强弹，智能改用无需验证的替代方案或直接向用户说明。
14. 某个网页的信息已经拿到、操作已经做完，或你判断它不再需要时，立刻 browser(action="close_tab", tab_id="该标签 id") 关掉这个标签，不要留在标签栏。tab_id 用 tabs 或打开结果里的 id（如 t2）。还要对照、还要沿用登录态，或用户明确要求保留的页面不要关；只关你判断没用的那一个，不要顺手关掉用户原本打开、且与当前任务无关的标签。"""

TOOL = {
    "type": "function",
    "function": {
        "name": "browser",
        "description": (
            "控制 O2 内置的持久化 Chromium 浏览器并读取其全部信息（与用户在问答界面上方同屏共享同一实例，带 AI 模拟鼠标）。"
            "支持动作 action："
            "status/tabs（查看标签页与下载）、"
            "open（打开网址或搜索词，传 url，可选 new_tab）、"
            "switch_tab/close_tab（传 tab_id）、"
            "back/forward/reload、"
            "snapshot（获取页面无障碍树，可交互节点带 [ref=eN]；click/fill 等写操作也会自动附带最新快照）、"
            "find（在当前页无障碍树中按关键字或正则搜索，只返回命中行及上下文和 ref，大页面优先于整页 snapshot；传 text 或 regex 之一，可选 max_results）、"
            "read（提取页面全文、指定 selector 内容或 HTML）、"
            "click（按 ref/selector/text 或坐标 x,y 点击）、"
            "fill/type（按 ref/selector 输入文本，可选 press_enter）、"
            "select（选择下拉项 value/label）、"
            "press（按键如 Enter、Escape、Control+a）、"
            "hover、scroll（up/down/top/bottom 或滚到 ref/selector）、"
            "wait（等待 ms 或等待 selector/text 出现）、"
            "wait_for_human（当需要用户完成人机验证、验证码、扫码或登录时挂起等待用户操作完成，传 reason）、"
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
                        "back", "forward", "reload", "snapshot", "find", "read",
                        "click", "hover", "fill", "type", "select", "press",
                        "scroll", "wait", "wait_for_human", "screenshot", "eval",
                        "console", "network", "cookies", "storage", "downloads", "cdp",
                    ],
                    "description": "要执行的浏览器操作",
                },
                "reason": {"type": "string", "description": "wait_for_human 时显示给用户的操作提示，如“请完成滑块人机验证”或“请扫码登录”"},
                "url": {"type": "string", "description": "网址或搜索关键词（open / cookies 用）"},
                "new_tab": {"type": "boolean", "description": "open 时是否在新标签页打开"},
                "tab_id": {"type": "string", "description": "目标标签页 ID（如 t1），不填则操作当前活动标签页"},
                "ref": {"type": "string", "description": "snapshot 返回的元素编号，如 e1"},
                "selector": {"type": "string", "description": "CSS 选择器"},
                "text": {"type": "string", "description": "find 时按快照文本不区分大小写搜索；click/wait 时按可见文本匹配元素"},
                "regex": {"type": "string", "description": "find 时用正则搜索快照，与 text 二选一；可用 /error/i 这种写法"},
                "max_results": {"type": "number", "description": "find 最多返回几条命中，不填则全部返回"},
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


def notify_session_start() -> None:
    if not bridge_ready():
        return
    try:
        call_bridge({"action": "co_panel", "sessionStart": True}, timeout=2.5)
    except Exception:
        pass


def notify_session_end(used_browser: bool = False) -> None:
    if not bridge_ready():
        return
    try:
        call_bridge(
            {
                "action": "co_panel",
                "sessionEnd": True,
                "autoCloseDelayMs": 850 if used_browser else 0,
            },
            timeout=2.5,
        )
    except Exception:
        pass


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
        "find": "查找 " + str(args.get("text") or args.get("query") or args.get("regex") or "元素"),
        "read": "读取页面内容",
        "click": "点击 " + str(args.get("ref") or args.get("text") or args.get("selector") or f"({args.get('x')},{args.get('y')})"),
        "hover": "悬停 " + str(args.get("ref") or args.get("selector") or ""),
        "fill": "填写 " + str(args.get("ref") or args.get("selector") or ""),
        "type": "输入文本",
        "select": "选择下拉项",
        "press": "按键 " + str(args.get("key") or "Enter"),
        "scroll": "滚动页面",
        "wait": "等待页面",
        "wait_for_human": "等待人工操作 · " + str(args.get("reason") or "人机验证/登录"),
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
    hv = snap.get("humanVerification")
    if isinstance(hv, dict) and hv.get("detected"):
        reason = hv.get("reason") or "检测到人机验证或登录拦截"
        head += (
            f"\n[检测到需要人工操作] {reason} —— "
            "若该验证或登录阻碍了后续获取目标内容，请调用 browser(action=\"wait_for_human\", reason=\"...\") 交由用户在上方浏览器窗口完成。"
        )
    yaml = str(snap.get("aria") or "").strip()
    if yaml:
        return head + "\n\n" + yaml
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

    timeout_s = 35.0
    if act == "wait_for_human":
        ms = float(payload.get("timeout_ms") or 180000)
        timeout_s = max(40.0, min(310.0, ms / 1000.0 + 10.0))

    res = call_bridge(payload, timeout=timeout_s)
    if not res.get("ok"):
        return f"Error: {res.get('error') or '操作失败'}", False, None

    if act == "wait_for_human":
        status = str(res.get("humanStatus") or "auto_detected")
        snap = res.get("snapshot") if isinstance(res.get("snapshot"), dict) else {}
        snap_text = _fmt_snapshot(snap, res.get("tab")) if snap else ""
        if status == "user_closed":
            return (
                "[用户主动关闭了上方浏览器窗口，放弃了当前人工验证/登录操作。"
                "请尊重用户意愿（用户优先），不要再次强行弹出该验证页面，改用其他无需登录的公开渠道或直接基于现有信息回答。]",
                True,
                None,
            )
        if status == "timeout":
            return (
                "[等待用户操作超时，当前页面最新状态如下：]\n\n" + snap_text,
                True,
                None,
            )
        return (
            "[用户已在上方浏览器窗口完成操作，系统自动检测完成并继续下一步。当前页面最新快照如下：]\n\n" + snap_text,
            True,
            None,
        )

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

    if act == "find":
        tab = res.get("tab") or {}
        tid = tab.get("id") or ""
        title = res.get("title") or tab.get("title") or ""
        url = res.get("url") or tab.get("url") or ""
        lines = [f"[Tab {tid}] {title}", f"URL: {url}"]
        hv = res.get("humanVerification")
        if isinstance(hv, dict) and hv.get("detected"):
            reason = hv.get("reason") or "检测到人机验证或登录拦截"
            lines.append(
                f"[检测到需要人工操作] {reason} —— "
                "若该验证阻碍后续操作，请调用 browser(action=\"wait_for_human\", reason=\"...\")"
            )
        lines.append("")
        lines.append(str(res.get("header") or "").strip() or "No matches.")
        snippets = str(res.get("snippets") or "").strip()
        if snippets:
            lines.append("")
            lines.append(snippets)
        lines.append("")
        lines.append("用片段中的 [ref=eN] 去 click/fill；这些 ref 只对这次 find 的当前页有效。")
        return "\n".join(lines), True, None

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

    nested = res.get("snapshot") if isinstance(res.get("snapshot"), dict) else None
    if nested:
        prefix = ""
        if act != "open":
            prefix = f"[{act} 完成。请用下面快照里的 ref 继续；不要使用更早的 ref。]\n\n"
        return prefix + _fmt_snapshot(nested, res.get("tab")), True, None

    slim = {k: v for k, v in res.items() if k not in ("data", "snapshot")}
    return json.dumps(slim, ensure_ascii=False, indent=2), True, None
