from __future__ import annotations

import io
import json
import os
import re
import shutil
import ssl
import subprocess
import tempfile
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request

PROTOCOLS = [
    {"id": "openai", "label": "OpenAI 兼容 (v1/chat/completions)"},
    {"id": "anthropic", "label": "Anthropic Messages (v1/messages)"},
    {"id": "gemini", "label": "Google Gemini"},
]

PROTOCOL_IDS = {p["id"] for p in PROTOCOLS}

USER_AGENT = "O2/1.0"

_ssl_ctx: ssl.SSLContext | None = None


def ssl_context() -> ssl.SSLContext:
    global _ssl_ctx
    if _ssl_ctx is None:
        ctx = ssl.create_default_context()
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        if hasattr(ssl, "OP_IGNORE_UNEXPECTED_EOF"):
            ctx.options |= ssl.OP_IGNORE_UNEXPECTED_EOF
        _ssl_ctx = ctx
    return _ssl_ctx


def is_transient_ssl(exc: BaseException) -> bool:
    s = f"{exc} {getattr(exc, 'reason', '')}".lower()
    return any(
        k in s
        for k in (
            "unexpected_eof",
            "eof occurred in violation",
            "sslzeroreturn",
            "connection has been closed",
            "sslv3_alert",
            "connection reset",
            "broken pipe",
            "timed out",
            "temporarily unavailable",
            "the handshake operation timed out",
        )
    )


def _curl_bin() -> str:
    return shutil.which("curl.exe") or shutil.which("curl") or ""


def _req_url(req) -> str:
    return getattr(req, "full_url", None) or getattr(req, "get_full_url", lambda: "")()


def _req_method(req) -> str:
    if hasattr(req, "get_method"):
        return (req.get_method() or "GET").upper()
    return "GET"


def _req_headers(req) -> dict:
    out = {}
    for src in (getattr(req, "headers", None), getattr(req, "unredirected_hdrs", None)):
        if not src:
            continue
        items = src.items() if hasattr(src, "items") else src
        for k, v in items:
            out[str(k)] = str(v)
    return out


def _curl_escape(s: str) -> str:
    return str(s).replace("\\", "\\\\").replace('"', '\\"')


def _parse_dump_status(raw: bytes | str) -> int:
    text = raw.decode("utf-8", "replace") if isinstance(raw, (bytes, bytearray)) else (raw or "")
    code = 0
    for line in text.splitlines():
        if line.startswith("HTTP/"):
            parts = line.split()
            if len(parts) >= 2 and parts[1].isdigit():
                code = int(parts[1])
    return code


class _CurlBody:
    def __init__(self, data: bytes, status: int):
        self._fp = io.BytesIO(data or b"")
        self.status = status
        self.code = status

    def read(self, n: int = -1):
        return self._fp.read() if n < 0 else self._fp.read(n)

    def getcode(self):
        return self.status

    def close(self):
        self._fp.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


class _CurlStream:
    def __init__(self, proc: subprocess.Popen, status: int, temps: list[str]):
        self.proc = proc
        self.status = status
        self.code = status
        self._temps = temps
        self.fp = proc.stdout

    def read(self, n: int = -1):
        if not self.fp:
            return b""
        return self.fp.read() if n < 0 else self.fp.read(n)

    def readline(self, *args):
        return self.fp.readline(*args) if self.fp else b""

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if not line:
            raise StopIteration
        return line

    def getcode(self):
        return self.status

    def close(self):
        try:
            if self.proc.stdin:
                try:
                    self.proc.stdin.close()
                except OSError:
                    pass
            if self.proc.poll() is None:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
            for pipe in (self.proc.stdout, self.proc.stderr):
                if pipe:
                    try:
                        pipe.close()
                    except OSError:
                        pass
        finally:
            for path in self._temps:
                try:
                    os.remove(path)
                except OSError:
                    pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def _raise_http(url: str, status: int, body: bytes):
    raise urllib.error.HTTPError(url, status, "error", None, io.BytesIO(body or b""))


def _curl_open(req, timeout: float, stream: bool):
    bin_path = _curl_bin()
    if not bin_path:
        raise RuntimeError("curl 不可用")
    url = _req_url(req)
    method = _req_method(req)
    headers = _req_headers(req)
    data = req.data if hasattr(req, "data") else None
    if isinstance(data, str):
        data = data.encode("utf-8")
    hdr_fd, hdr_path = tempfile.mkstemp(prefix="o2-hdr-", suffix=".txt")
    os.close(hdr_fd)
    cfg_fd, cfg_path = tempfile.mkstemp(prefix="o2-curl-", suffix=".cfg")
    os.close(cfg_fd)
    body_path = ""
    temps = [hdr_path, cfg_path]
    hdr_posix = hdr_path.replace("\\", "/")
    lines = [
        f'request = "{method}"',
        f'url = "{_curl_escape(url)}"',
        "silent",
        "show-error",
        "http1.1",
        "location",
        f"max-time = {max(1, int(timeout))}",
        f'dump-header = "{hdr_posix}"',
    ]
    if stream:
        lines.append("no-buffer")
        lines.append('output = "-"')
    else:
        body_fd, body_path = tempfile.mkstemp(prefix="o2-body-", suffix=".bin")
        os.close(body_fd)
        temps.append(body_path)
        lines.append(f'output = "{body_path.replace(chr(92), "/")}"')
    if data:
        lines.append('data-binary = "@-"')
    for k, v in headers.items():
        if k.lower() in ("content-length", "host"):
            continue
        lines.append(f'header = "{_curl_escape(k)}: {_curl_escape(v)}"')
    try:
        with open(cfg_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        proc = subprocess.Popen(
            [bin_path, "-K", cfg_path],
            stdin=subprocess.PIPE if data else subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if data:
            try:
                proc.stdin.write(data)
            finally:
                proc.stdin.close()
        if stream:
            deadline = time.time() + min(float(timeout), 30.0)
            header_raw = b""
            while time.time() < deadline:
                try:
                    with open(hdr_path, "rb") as hf:
                        header_raw = hf.read()
                except OSError:
                    header_raw = b""
                if b"\r\n\r\n" in header_raw or b"\n\n" in header_raw:
                    break
                if proc.poll() is not None:
                    break
                time.sleep(0.05)
            status = _parse_dump_status(header_raw)
            if proc.poll() is not None and status < 200:
                err = (proc.stderr.read() if proc.stderr else b"").decode("utf-8", "replace")
                for path in temps:
                    try:
                        os.remove(path)
                    except OSError:
                        pass
                raise urllib.error.URLError(err.strip() or "curl 连接失败")
            if status >= 400:
                body = proc.stdout.read(2000) if proc.stdout else b""
                proc.wait(timeout=5)
                for path in temps:
                    try:
                        os.remove(path)
                    except OSError:
                        pass
                _raise_http(url, status, body)
            return _CurlStream(proc, status or 200, temps)

        try:
            _out, err_b = proc.communicate(timeout=max(1.0, float(timeout) + 2))
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            raise urllib.error.URLError("请求超时")
        header_raw = b""
        try:
            with open(hdr_path, "rb") as hf:
                header_raw = hf.read()
        except OSError:
            pass
        body = b""
        try:
            with open(body_path, "rb") as bf:
                body = bf.read()
        except OSError:
            pass
        status = _parse_dump_status(header_raw)
        if status < 200:
            msg = (err_b or b"").decode("utf-8", "replace").strip()
            raise urllib.error.URLError(msg or f"curl 退出 {proc.returncode}")
        if status >= 400:
            _raise_http(url, status, body)
        return _CurlBody(body, status)
    finally:
        if not stream:
            for path in temps:
                try:
                    os.remove(path)
                except OSError:
                    pass


def urlopen(req, timeout: float = 30, retries: int = 3, stream: bool = False):
    """HTTPS 优先走系统 curl（Windows Schannel），避开 Python OpenSSL 被网关掐断。"""
    url = _req_url(req)
    https = (url or "").lower().startswith("https://")
    curl = _curl_bin() if https else ""
    last = None
    if curl:
        try:
            return _curl_open(req, timeout=timeout, stream=stream)
        except urllib.error.HTTPError:
            raise
        except Exception as e:
            last = e
            if stream:
                raise
    for attempt in range(max(1, retries)):
        try:
            return urllib.request.urlopen(req, timeout=timeout, context=ssl_context())
        except urllib.error.HTTPError:
            raise
        except Exception as e:
            last = e
            if attempt + 1 >= retries or not is_transient_ssl(e):
                raise
            time.sleep(0.4 * (attempt + 1))
    raise last


def network_error_text(err: BaseException) -> str:
    if is_transient_ssl(err) or "ssl" in str(err).lower():
        return "TLS 连接被中断，请稍后再试"
    return str(err)

OPENCODE_GO_URL = "https://opencode.ai/inference/go/openai/v1"
OPENCODE_ZEN_URL = "https://opencode.ai/inference/openai/v1"

PRESETS = {
    "deepseek": {
        "name": "DeepSeek",
        "protocol": "openai",
        "base_url": "https://api.deepseek.com",
        "models": [
            {"id": "deepseek-flash", "label": "DeepSeek Flash"},
            {"id": "deepseek-v4-pro", "label": "DeepSeek V4 Pro"},
        ],
    },
    "opencode-go": {
        "name": "OpenCode Go",
        "protocol": "openai",
        "base_url": OPENCODE_GO_URL,
        "models": [],
    },
}

PRESET_ALIASES = {
    "opencode": "opencode-go",
    "opencode-zen": "opencode-go",
}

EFFORT_LABELS = {
    "none": "关",
    "minimal": "最低",
    "low": "低",
    "medium": "中",
    "high": "高",
    "xhigh": "极高",
    "extra_high": "极高",
    "max": "极高",
}

_EFFORT_ALIAS = {
    "extra": "extra_high",
    "extra_high": "extra_high",
    "xhigh": "xhigh",
    "ultra": "max",
    "max": "max",
    "极高": "max",
    "高": "high",
    "中": "medium",
    "低": "low",
    "最低": "minimal",
    "关": "none",
}


def new_id(prefix: str = "p") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def canonical_preset(raw) -> str:
    s = str(raw or "").strip()
    return PRESET_ALIASES.get(s, s)


def is_opencode(url: str) -> bool:
    return "opencode.ai" in (url or "").lower()


def is_opencode_go(url: str) -> bool:
    u = (url or "").lower()
    return "opencode.ai" in u and "/inference/go" in u


def extra_headers(base_url: str, protocol: str, api_key: str, session: str = "") -> dict:
    proto = protocol_of(protocol)
    h = {}
    if proto == "anthropic":
        h["x-api-key"] = api_key
        h["anthropic-version"] = "2023-06-01"
    if proto == "gemini":
        h["x-goog-api-key"] = api_key
    if is_opencode(base_url):
        h["x-opencode-session"] = session or "o2"
    return h


def protocol_of(raw) -> str:
    s = str(raw or "").strip().lower()
    if s in ("openai-compatible", "openai_compatible", "chat", "openai"):
        return "openai"
    if s in ("anthropic-messages", "anthropic_messages", "messages", "claude", "anthropic"):
        return "anthropic"
    if s in ("google", "google-gemini", "gemini"):
        return "gemini"
    return s if s in PROTOCOL_IDS else "openai"


def normalize_effort(raw) -> str:
    s = str(raw or "").strip().lower().replace("-", "_")
    s = _EFFORT_ALIAS.get(s, s)
    return s or "high"


def effort_api(raw, allowed: list[str] | None) -> str:
    """映射到该模型目录给出的档位；没有名单时按常见别名发送。"""
    s = normalize_effort(raw)
    allow = [str(x) for x in (allowed or []) if x]
    if allow:
        if s in allow:
            return s
        for cand in (s, "max" if s in ("extra_high", "xhigh") else "",
                     "extra_high" if s == "max" else "",
                     "xhigh" if s in ("max", "extra_high") else "",
                     "high"):
            if cand and cand in allow:
                return cand
        return allow[-1]
    if s == "extra_high":
        return "max"
    return s


def effort_options(values: list | None) -> list[dict]:
    out = []
    seen = set()
    for v in values or []:
        vid = str(v).strip()
        if not vid or vid in seen:
            continue
        seen.add(vid)
        out.append({"id": vid, "label": EFFORT_LABELS.get(vid, vid)})
    return out


def format_context(n) -> str:
    try:
        n = int(n)
    except (TypeError, ValueError):
        return ""
    if n <= 0:
        return ""
    if n >= 1_000_000:
        m = n / 1_048_576
        if abs(m - round(m)) < 0.08:
            return f"{int(round(m))}M"
        t = f" {n / 1_000_000:.1f}M".replace(".0M", "M")
        return t.strip()
    if n >= 1000:
        return f"{int(round(n / 1000))}K"
    return str(n)


def _clean_model(item) -> dict | None:
    if isinstance(item, str):
        mid = item.strip()
        return {"id": mid, "label": mid} if mid else None
    if not isinstance(item, dict):
        return None
    mid = str(item.get("id") or "").strip()
    if not mid:
        return None
    label = str(item.get("label") or item.get("name") or mid).strip() or mid
    out = {"id": mid, "label": label}
    raw_in = item.get("inputs")
    if isinstance(raw_in, list):
        vals = []
        seen = set()
        for x in raw_in:
            s = str(x).strip().lower()
            if not s or s in seen:
                continue
            seen.add(s)
            vals.append(s)
        if vals:
            out["inputs"] = vals
    return out


def _models_of(raw) -> list[dict]:
    out: list[dict] = []
    seen = set()
    if not isinstance(raw, list):
        return out
    for item in raw:
        m = _clean_model(item)
        if not m or m["id"] in seen:
            continue
        seen.add(m["id"])
        out.append(m)
    return out


def make_preset(preset_id: str, channel_id: str | None = None) -> dict:
    pid = canonical_preset(preset_id)
    spec = PRESETS[pid]
    return {
        "id": channel_id or preset_id or pid,
        "name": spec["name"],
        "preset": pid,
        "protocol": spec["protocol"],
        "base_url": spec["base_url"],
        "api_key": "",
        "url_custom": False,
        "models": [dict(m) for m in spec["models"]],
    }


def make_custom(name: str = "", protocol: str = "openai", base_url: str = "") -> dict:
    proto = protocol_of(protocol)
    url = (base_url or "").strip()
    if not url and proto == "gemini":
        url = "https://generativelanguage.googleapis.com/v1beta/openai"
    return {
        "id": new_id("p"),
        "name": (name or "自定义").strip() or "自定义",
        "preset": "",
        "protocol": proto,
        "base_url": url,
        "api_key": "",
        "url_custom": bool(url),
        "models": [],
    }


def apply_catalog_urls(providers: list[dict], catalog: dict | None) -> None:
    """用 models.dev 的 provider.api 刷新未改过的预设地址。"""
    if not catalog:
        return
    for p in providers:
        pid = canonical_preset(p.get("preset") or "")
        if pid not in PRESETS or p.get("url_custom"):
            continue
        meta = catalog.get(pid) or {}
        api = (meta.get("api") or "").strip() or PRESETS[pid]["base_url"]
        if api:
            p["base_url"] = api.rstrip("/")
            p["preset"] = pid


def migrate(data: dict) -> dict:
    """把旧的单套 base_url/api_key/model 收成渠道列表。"""
    providers = data.get("providers")
    if isinstance(providers, list) and providers:
        data["providers"] = [_normalize_channel(p) for p in providers if isinstance(p, dict)]
        data["providers"] = [p for p in data["providers"] if p]
        if not data.get("provider_id") and data["providers"]:
            data["provider_id"] = data["providers"][0]["id"]
        return data

    old_url = str(data.get("base_url") or "").strip()
    old_key = str(data.get("api_key") or "")
    old_model = str(data.get("model") or "").strip()
    ds = make_preset("deepseek")
    oc = make_preset("opencode")
    if old_url and "deepseek.com" not in old_url.lower():
        custom = make_custom("自定义", "openai", old_url)
        custom["api_key"] = old_key
        if old_model:
            custom["models"] = [{"id": old_model, "label": old_model}]
        data["providers"] = [custom, ds, oc]
        data["provider_id"] = custom["id"]
        if old_model:
            data["model"] = old_model
    else:
        if old_url:
            ds["base_url"] = old_url.rstrip("/")
            if old_url.rstrip("/") not in (
                PRESETS["deepseek"]["base_url"],
                PRESETS["deepseek"]["base_url"] + "/v1",
            ):
                ds["url_custom"] = True
        ds["api_key"] = old_key
        if old_model and old_model not in {m["id"] for m in ds["models"]}:
            ds["models"].insert(0, {"id": old_model, "label": old_model})
        data["providers"] = [ds, oc]
        data["provider_id"] = "deepseek"
        if old_model:
            data["model"] = old_model
    return data


def _normalize_channel(p: dict) -> dict | None:
    cid = str(p.get("id") or "").strip() or new_id("p")
    preset = canonical_preset(p.get("preset") or "")
    if preset not in PRESETS:
        preset = ""
    spec = PRESETS.get(preset) or {}
    name = str(p.get("name") or spec.get("name") or "自定义").strip()
    if preset == "opencode-go" and name in ("OpenCode", "opencode"):
        name = spec["name"]
    proto = protocol_of(p.get("protocol"))
    url = str(p.get("base_url") or "").strip().rstrip("/")
    url_custom = bool(p.get("url_custom"))
    if preset == "opencode-go" and not url_custom:
        old = url.rstrip("/")
        if not old or old in (OPENCODE_ZEN_URL, OPENCODE_ZEN_URL + "/v1", OPENCODE_GO_URL):
            url = OPENCODE_GO_URL
    if preset and not url:
        url = spec.get("base_url") or ""
    models = _models_of(p.get("models"))
    if preset and not models:
        models = [dict(m) for m in (spec.get("models") or [])]
    return {
        "id": cid,
        "name": name or "自定义",
        "preset": preset,
        "protocol": proto,
        "base_url": url,
        "api_key": str(p.get("api_key") or ""),
        "url_custom": url_custom,
        "models": models,
    }


def public_channel(p: dict) -> dict:
    return {
        "id": p.get("id") or "",
        "name": p.get("name") or "",
        "preset": p.get("preset") or "",
        "protocol": protocol_of(p.get("protocol")),
        "base_url": p.get("base_url") or "",
        "url_custom": bool(p.get("url_custom")),
        "api_key_set": bool(p.get("api_key")),
        "models": [dict(m) for m in (p.get("models") or [])],
    }


def find(data: dict, provider_id: str | None) -> dict | None:
    pid = (provider_id or "").strip() or str(data.get("provider_id") or "").strip()
    providers = data.get("providers") or []
    for p in providers:
        if p.get("id") == pid:
            return p
    return providers[0] if providers else None


def resolve(data: dict, provider_id: str | None = None, model: str | None = None) -> dict | None:
    """解析当前渠道 + 模型 + 密钥。"""
    migrate(data)
    mid = (model or "").strip() or str(data.get("model") or "").strip()
    ch = find(data, provider_id)
    if mid and (not ch or not any(m.get("id") == mid for m in (ch.get("models") or []))):
        for p in data.get("providers") or []:
            if any(m.get("id") == mid for m in (p.get("models") or [])):
                ch = p
                break
    if not ch:
        return None
    if not mid:
        models = ch.get("models") or []
        mid = models[0]["id"] if models else ""
    return {
        "id": ch.get("id") or "",
        "name": ch.get("name") or "",
        "preset": ch.get("preset") or "",
        "protocol": protocol_of(ch.get("protocol")),
        "base_url": (ch.get("base_url") or "").rstrip("/"),
        "api_key": ch.get("api_key") or "",
        "model": mid,
    }


def resolve_openaiish(data: dict) -> dict | None:
    migrate(data)
    ch = resolve(data)
    if ch and ch.get("api_key") and ch.get("protocol") != "anthropic":
        return ch
    for p in data.get("providers") or []:
        if protocol_of(p.get("protocol")) == "anthropic":
            continue
        if not (p.get("api_key") or "").strip():
            continue
        return resolve(data, p.get("id"))
    return ch


def any_key(data: dict) -> bool:
    migrate(data)
    return any((p.get("api_key") or "").strip() for p in (data.get("providers") or []))


def merge_save(data: dict, body: dict) -> None:
    """把前端提交的渠道写回去，空密钥表示不改。"""
    migrate(data)
    if "provider_id" in body and body["provider_id"] not in (None, ""):
        data["provider_id"] = str(body["provider_id"]).strip()
    if "model" in body and body["model"] not in (None, ""):
        data["model"] = str(body["model"]).strip()
    raw = body.get("providers")
    if not isinstance(raw, list):
        return
    old = {p["id"]: p for p in data.get("providers") or [] if p.get("id")}
    out = []
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        cid = str(item.get("id") or "").strip() or new_id("p")
        if cid in seen:
            continue
        seen.add(cid)
        prev = old.get(cid) or {}
        ch = _normalize_channel({**prev, **item, "id": cid})
        if not ch:
            continue
        key = item.get("api_key")
        if key:
            ch["api_key"] = str(key)
        elif item.get("clear_key"):
            ch["api_key"] = ""
        else:
            ch["api_key"] = prev.get("api_key") or ""
        if "url_custom" in item:
            ch["url_custom"] = bool(item.get("url_custom"))
        elif prev and (ch["base_url"] or "") != (prev.get("base_url") or ""):
            ch["url_custom"] = True
        out.append(ch)
    data["providers"] = out
    if data.get("provider_id") not in {p["id"] for p in out} and out:
        data["provider_id"] = out[0]["id"]


def chat_url(base_url: str, protocol: str) -> str:
    base = (base_url or "").rstrip("/")
    proto = protocol_of(protocol)
    if proto == "anthropic":
        if base.endswith("/messages"):
            return base
        if base.endswith("/v1"):
            return base + "/messages"
        return base + "/v1/messages"
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def models_url(base_url: str, protocol: str) -> str:
    base = (base_url or "").rstrip("/")
    proto = protocol_of(protocol)
    for suf in ("/chat/completions", "/messages"):
        if base.endswith(suf):
            base = base[: -len(suf)]
    if base.endswith("/models"):
        return base
    # Go 官方列表在 /inference/go/v1/models，不是 openai/v1/models
    if "/inference/go/openai/" in base:
        return base.split("/openai/", 1)[0] + "/v1/models"
    if proto == "anthropic" and not base.endswith("/v1"):
        return base + "/v1/models"
    return base + "/models"


def http_error_text(err: urllib.error.HTTPError) -> str:
    try:
        raw = err.read(1200)
        text = raw.decode("utf-8", "replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
    except Exception:
        text = str(getattr(err, "reason", "") or err)
    url = str(getattr(err, "url", "") or getattr(err, "filename", "") or "")
    return summarize_http_error(err.code, text, url)


def summarize_http_error(code: int, body: str, url: str = "") -> str:
    s = (body or "").strip()
    low = s.lower()
    if "error code: 1010" in low or "cloudflare" in low or "<!doctype" in low or "<html" in low:
        return "访问被 Cloudflare 拦截，请稍后重试"
    msg = ""
    try:
        obj = json.loads(s)
    except ValueError:
        obj = None
    if isinstance(obj, dict):
        err = obj.get("error")
        if isinstance(err, dict):
            msg = str(err.get("message") or err.get("type") or "").strip()
        elif isinstance(err, str):
            msg = err.strip()
        if not msg:
            msg = str(obj.get("message") or "").strip()
    if not msg:
        msg = re.sub(r"<[^>]+>", " ", s)
        msg = re.sub(r"\s+", " ", msg).strip()[:240]
    if "opencode" in msg.lower() and "free" in msg.lower():
        return "OpenCode 免费模型仅限官方客户端使用，请换付费模型"
    funds = code == 402 or "insufficient account funds" in low or (
        "insufficient" in low and "fund" in low
    )
    if funds:
        if is_opencode_go(url):
            return "OpenCode Go 额度不足，可换免费模型或到控制台查看用量 / Extra Usage"
        if is_opencode(url):
            return "OpenCode 余额不足。已订阅 Go 的请走 /inference/go/ 套餐接口，不要走按量计费接口"
        return "账户余额不足"
    return msg or f"HTTP {code}"


def fetch_remote_models(base_url: str, protocol: str, api_key: str) -> list[dict]:
    url = models_url(base_url, protocol)
    proto = protocol_of(protocol)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    headers.update(extra_headers(base_url, proto, api_key, session="o2-models"))
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(http_error_text(e)) from None
    raw = data.get("data") if isinstance(data, dict) else data
    if raw is None and isinstance(data, dict):
        raw = data.get("models")
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    seen = set()
    for item in raw:
        mid = ""
        label = ""
        if isinstance(item, dict):
            mid = str(item.get("id") or item.get("name") or "").strip()
            label = str(item.get("display_name") or item.get("name") or mid).strip()
            if mid.startswith("models/"):
                mid = mid.split("/", 1)[1]
        else:
            mid = str(item).strip()
            label = mid
        mid = re.sub(r"^models/", "", mid)
        if not mid or mid in seen:
            continue
        seen.add(mid)
        out.append({"id": mid, "label": label or mid})
    return out


def host_of(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    if "://" not in raw:
        raw = "https://" + raw
    try:
        return (urllib.parse.urlparse(raw).hostname or "").lower()
    except ValueError:
        return ""
