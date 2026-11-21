from __future__ import annotations

import io
import json
import os
import re
import sqlite3
import sys
import threading
import time
import urllib.parse
import urllib.request
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import agent as agent_mod
import api_tool as api_mod
import attach as attach_mod
import browser_tool as browser_mod
import catalog as catalog_mod
import config as cfg_mod
import build as build_mod
import ingest as ingest_mod
import providers as prov_mod
import search as search_mod
import embed as embed_mod

APP_TITLE = "O2"
HERE = os.path.dirname(os.path.abspath(__file__))


def app_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(HERE)


def res_dir() -> str:
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(HERE)


def user_data_dir() -> str:
    base = os.environ.get("LOCALAPPDATA") or app_dir()
    d = os.path.join(base, APP_TITLE)
    os.makedirs(d, exist_ok=True)
    return d


def _fix_stdio() -> None:
    if sys.stdout is not None and sys.stderr is not None:
        return
    try:
        f = open(os.path.join(user_data_dir(), "app.log"), "a", encoding="utf-8", buffering=1)
    except OSError:
        f = open(os.devnull, "w")
    sys.stdout = sys.stderr = f


if getattr(sys, "frozen", False):
    _fix_stdio()


class State:
    def __init__(self) -> None:
        self.base = app_dir()
        self.db_path = os.path.join(self.base, "data", "zdl.sqlite")
        bundled = os.path.join(res_dir(), "data", "zdl.sqlite")
        if getattr(sys, "frozen", False):
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            if not os.path.exists(self.db_path) and os.path.exists(bundled):
                try:
                    import shutil
                    shutil.copy2(bundled, self.db_path)
                except OSError:
                    self.db_path = bundled
        elif not os.path.exists(self.db_path) and os.path.exists(bundled):
            self.db_path = bundled
        self.config = cfg_mod.Config(os.path.join(self.base, "config.json"))
        self.lock = threading.Lock()
        self.rebuilding = False
        self.src_root = self._guess_src()
        catalog_mod.init(os.path.join(self.base, "build"))
        threading.Thread(target=catalog_mod.refresh, daemon=True).start()
        try:
            with self.con() as con:
                build_mod.ensure_schema(con)
                embed_mod.ensure_schema(con)
        except sqlite3.Error:
            pass
        if self.config.data.get("embed_running"):
            threading.Thread(
                target=embed_mod.start_job, args=(self.config, self.db_path), daemon=True
            ).start()

    def _guess_src(self) -> str:
        saved = os.path.join(self.base, "config.json")
        try:
            with open(saved, encoding="utf-8") as f:
                p = json.load(f).get("src_root")
                if p and os.path.isdir(p):
                    return p
        except (OSError, ValueError):
            pass
        cand = os.path.join(self.base, "docs")
        if os.path.isdir(cand):
            return cand
        return cand

    def con(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.db_path, check_same_thread=False)
        con.row_factory = sqlite3.Row
        return con

    def doc_path(self, rel_path: str, abs_path: str) -> str:
        rel = (rel_path or "").replace("/", os.sep).replace("\\", os.sep).lstrip("\\/")
        if rel and self.src_root and ".." not in rel.split(os.sep):
            cand = os.path.normpath(os.path.join(self.src_root, rel))
            root = os.path.normpath(self.src_root)
            try:
                if os.path.commonpath([root, cand]) == root and os.path.isfile(cand):
                    return cand
            except ValueError:
                pass
        if abs_path and os.path.isfile(abs_path):
            return abs_path
        return abs_path or ""


STATE = State()

_PAGE_CACHE: OrderedDict[tuple, bytes] = OrderedDict()
_PAGE_CACHE_LOCK = threading.Lock()
_PAGE_CACHE_MAX = 80


def _page_cache_get(key: tuple) -> bytes | None:
    with _PAGE_CACHE_LOCK:
        data = _PAGE_CACHE.get(key)
        if data is not None:
            _PAGE_CACHE.move_to_end(key)
        return data


def _page_cache_put(key: tuple, data: bytes) -> None:
    with _PAGE_CACHE_LOCK:
        _PAGE_CACHE[key] = data
        _PAGE_CACHE.move_to_end(key)
        while len(_PAGE_CACHE) > _PAGE_CACHE_MAX:
            _PAGE_CACHE.popitem(last=False)


def _pixmap_to_jpeg(pix) -> bytes:
    from PIL import Image
    import pymupdf

    if pix.n - pix.alpha == 4:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    if pix.alpha:
        img = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif pix.n == 1:
        img = Image.frombytes("L", (pix.width, pix.height), pix.samples).convert("RGB")
    else:
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=78, optimize=True)
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    server_version = "O2/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        if os.environ.get("O2_DEBUG"):
            super().log_message(fmt, *args)

    def _send(self, code: int, body: bytes, ctype: str = "application/json; charset=utf-8",
              cache: bool = False) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "private, max-age=86400" if cache else "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def _err(self, msg: str, code: int = 400) -> None:
        self._json({"ok": False, "error": msg}, code)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except ValueError:
            return {}

    def do_GET(self) -> None:
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)
        path = u.path

        if path in ("/", "/index.html"):
            return self._serve_static("index.html", "text/html; charset=utf-8")
        if path == "/favicon.ico":
            return self._serve_static("favicon.ico", "image/x-icon")
        if path.startswith("/vendor/") or path == "/app.js":
            rel = path.lstrip("/")
            ext = os.path.splitext(rel)[1].lower()
            ctype = {
                ".js": "application/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8",
                ".woff2": "font/woff2",
                ".woff": "font/woff",
                ".ttf": "font/ttf",
                ".svg": "image/svg+xml",
            }.get(ext, "application/octet-stream")
            return self._serve_static(rel, ctype)
        if path == "/api/facets":
            with STATE.con() as con:
                return self._json(search_mod.facets(con))
        if path == "/api/stats":
            return self._stats()
        if path == "/api/config":
            return self._config()
        if path == "/api/docs":
            dept = (qs.get("dept") or [""])[0]
            project = (qs.get("project") or [""])[0]
            folder = (qs.get("folder") or [""])[0]
            doc_type = (qs.get("doc_type") or [""])[0]
            q_filter = (qs.get("q") or [""])[0]
            with STATE.con() as con:
                return self._json(
                    search_mod.list_docs(
                        con, dept=dept, project=project,
                        folder=folder, doc_type=doc_type, q=q_filter,
                    )
                )
        if path == "/api/page":
            return self._page_image(qs)
        if path == "/api/search":
            return self._search(qs)
        if path == "/api/models":
            return self._models()
        if path == "/api/embed/status":
            return self._embed_status()
        if path == "/api/browser/state":
            return self._browser_state()
        if path.startswith("/api/doc/"):
            try:
                did = int(path.rsplit("/", 1)[1])
            except ValueError:
                return self._err("doc id 无效")
            with STATE.con() as con:
                doc = search_mod.get_doc(con, did)
            if not doc:
                return self._err("未找到该文件", 404)
            return self._json(doc)
        return self._err("not found", 404)

    def do_POST(self) -> None:                      # noqa: N802
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/chat":
            return self._chat()
        if u.path == "/api/chat/title":
            return self._chat_title()
        if u.path == "/api/config":
            return self._save_config()
        if u.path == "/api/open":
            return self._open_file()
        if u.path == "/api/rebuild":
            return self._rebuild()
        if u.path == "/api/docs/parse":
            return self._docs_parse()
        if u.path == "/api/docs/commit":
            return self._docs_commit()
        if u.path == "/api/docs/status":
            return self._docs_status()
        if u.path == "/api/docs/meta":
            return self._docs_meta()
        if u.path == "/api/docs/delete":
            return self._docs_delete()
        if u.path == "/api/docs/organize":
            return self._docs_organize()
        if u.path == "/api/folders/create":
            return self._folders_create()
        if u.path == "/api/folders/delete":
            return self._folders_delete()
        if u.path == "/api/folders/move":
            return self._folders_move()
        if u.path == "/api/attach":
            return self._attach()
        if u.path == "/api/models/sync":
            return self._models_sync()
        if u.path == "/api/embed/start":
            return self._embed_start()
        if u.path == "/api/embed/stop":
            return self._embed_stop()
        if u.path == "/api/embed/models/sync":
            return self._embed_models_sync()
        if u.path == "/api/browser/register":
            return self._browser_register()
        if u.path == "/api/browser/action":
            return self._browser_action()
        if u.path == "/api/connectors/test":
            return self._connector_test()
        if u.path == "/api/connectors/discover":
            return self._connector_discover()
        return self._err("not found", 404)

    def _serve_static(self, rel: str, ctype: str) -> None:
        rel = rel.replace("\\", "/").lstrip("/")
        if ".." in rel.split("/"):
            return self._err("bad path", 400)
        for base in (os.path.join(res_dir(), "web"), os.path.join(HERE, "web")):
            cand = os.path.normpath(os.path.join(base, rel))
            if not cand.startswith(os.path.normpath(base)):
                continue
            if os.path.isfile(cand):
                with open(cand, "rb") as f:
                    return self._send(200, f.read(), ctype)
        self._send(404, f"{rel} 不存在".encode("utf-8"), "text/plain; charset=utf-8")

    def _stats(self) -> None:
        out = {"docs": 0, "chunks": 0, "built_at": "", "src_root": STATE.src_root}
        try:
            with STATE.con() as con:
                out["docs"] = con.execute("SELECT COUNT(*) FROM docs").fetchone()[0]
                out["chunks"] = con.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
                row = con.execute("SELECT v FROM meta WHERE k='built_at'").fetchone()
                if row:
                    out["built_at"] = row[0]
        except sqlite3.Error as e:
            out["error"] = str(e)
        out["rebuilding"] = STATE.rebuilding
        out["llm"] = STATE.config.enabled
        return self._json(out)

    def _page_image(self, qs: dict) -> None:
        try:
            doc_id = int((qs.get("doc_id") or ["0"])[0])
            page_no = int((qs.get("page") or ["1"])[0])
            chunk_id = (qs.get("chunk_id") or [""])[0]
            zoom = float((qs.get("zoom") or ["2"])[0])
        except ValueError:
            return self._err("参数无效")
        zoom = max(1.0, min(zoom, 2.0))

        with STATE.con() as con:
            row = con.execute(
                "SELECT rel_path, abs_path FROM docs WHERE id=?", (doc_id,)
            ).fetchone()
            if not row:
                return self._err("未找到文件", 404)
            path = STATE.doc_path(row[0], row[1])
            rects: list[list[float]] = []
            if chunk_id:
                r = con.execute(
                    "SELECT block_refs FROM chunks WHERE id=?", (int(chunk_id),)
                ).fetchone()
                refs = []
                if r and r[0]:
                    try:
                        refs = json.loads(r[0])
                    except ValueError:
                        refs = []
                for pref in refs:
                    if len(pref) == 2 and int(pref[0]) == page_no:
                        b = con.execute(
                            "SELECT x0,y0,x1,y1 FROM blocks WHERE doc_id=? AND page=? AND seq=?",
                            (doc_id, page_no, int(pref[1])),
                        ).fetchone()
                        if b:
                            rects.append([b[0], b[1], b[2], b[3]])

        if not path or not os.path.exists(path):
            return self._err("文件不存在", 404)
        ext = os.path.splitext(path)[1].lower()
        if ext in (".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".svg", ".heic", ".heif"):
            try:
                with open(path, "rb") as f:
                    raw_img = f.read()
                if ext == ".svg":
                    return self._send(200, raw_img, "image/svg+xml", cache=True)
                jpeg, mime = attach_mod.to_vision_jpeg(raw_img, ext)
                return self._send(200, jpeg, mime, cache=True)
            except Exception as e:
                return self._err(f"图像读取失败: {e}", 500)
        if ext != ".pdf":
            return self._err("该文件无原页图像可显示", 400)

        try:
            mtime = int(os.path.getmtime(path))
        except OSError:
            mtime = 0
        cache_key = (path, mtime, page_no, round(zoom, 2), chunk_id or "", "wbg")
        cached = _page_cache_get(cache_key)
        if cached:
            return self._send(200, cached, "image/jpeg", cache=True)

        try:
            import pymupdf
        except ImportError:
            return self._err("缺少 PyMuPDF 组件", 500)

        try:
            with pymupdf.open(path) as pdf:
                if page_no < 1 or page_no > pdf.page_count:
                    return self._err("页码超出范围", 400)
                page = pdf[page_no - 1]
                page.draw_rect(
                    page.rect, color=None, fill=(1, 1, 1), overlay=False,
                )
                for x0, y0, x1, y1 in rects:
                    r = pymupdf.Rect(x0, y0, x1, y1) & page.rect
                    if r.is_empty or r.width <= 0 or r.height <= 0:
                        continue
                    page.draw_rect(r, color=None, fill=(1, 0.86, 0.15),
                                   fill_opacity=0.38, overlay=True, width=0)
                pix = page.get_pixmap(
                    matrix=pymupdf.Matrix(zoom, zoom),
                    colorspace=pymupdf.csRGB,
                    alpha=True,
                )
                data = _pixmap_to_jpeg(pix)
        except Exception as e:                  # noqa: BLE001
            return self._err(f"渲染失败: {e}", 500)

        _page_cache_put(cache_key, data)
        return self._send(200, data, "image/jpeg", cache=True)

    def _search(self, qs: dict) -> None:
        def g(k: str) -> str:
            return (qs.get(k) or [""])[0]

        q = g("q").strip()
        if not q:
            return self._json([])
        raw = g("limit")
        limit = None
        if raw:
            try:
                n = int(raw)
                if n > 0:
                    limit = n
            except ValueError:
                limit = None
        with STATE.con() as con:
            rs = search_mod.search(
                con, q,
                dept=g("dept"), status=g("status"), category=g("category"),
                project=g("project"), folder=g("folder"),
                doc_type=g("doc_type"), chunk_type=g("chunk_type"),
                doc_id=int(g("doc_id")) if g("doc_id").isdigit() else None,
                limit=limit,
                cfg=STATE.config,
            )
        return self._json(rs)

    def _chat(self) -> None:
        body = self._body()
        messages = body.get("messages") or []
        prior_sources = body.get("sources") or []
        model = (body.get("model") or "").strip()
        effort = (body.get("effort") or "").strip()
        provider_id = (body.get("provider_id") or "").strip()
        if not isinstance(messages, list) or not messages:
            return self._err("消息为空")
        if not isinstance(prior_sources, list):
            prior_sources = []
        if not STATE.config.enabled:
            return self._json({
                "ok": False,
                "error": "未配置大模型 API，请在「设置」中填入接口地址、API Key 和模型。",
            })

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        lock = threading.Lock()
        closed = False

        def emit(event: dict) -> bool:
            nonlocal closed
            data = ("data: " + json.dumps(event, ensure_ascii=False) + "\n\n").encode("utf-8")
            with lock:
                if closed:
                    return False
                try:
                    self.wfile.write(f"{len(data):X}\r\n".encode("ascii"))
                    self.wfile.write(data)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
                    return True
                except (BrokenPipeError, ConnectionResetError, OSError):
                    closed = True
                    return False

        try:
            con = STATE.con()
            try:
                agent_mod.run(
                    STATE.config, con, messages, emit,
                    prior_sources=prior_sources,
                    model=model or None,
                    effort=effort or None,
                    provider_id=provider_id or None,
                )
            finally:
                con.close()
        except Exception as e:                       # noqa: BLE001
            emit({"type": "error", "message": str(e)})
            emit({"type": "done"})
        finally:
            with lock:
                if not closed:
                    try:
                        self.wfile.write(b"0\r\n\r\n")
                        self.wfile.flush()
                    except OSError:
                        pass
            self.close_connection = True

    def _chat_title(self) -> None:
        body = self._body()
        question = str(body.get("question") or "").strip()
        answer = str(body.get("answer") or "").strip()
        if not question and not answer:
            return self._err("内容为空")
        provider_id = str(body.get("provider_id") or "").strip()
        model = str(body.get("model") or "").strip()
        title, summarized = agent_mod.summarize_title(
            STATE.config, question, answer,
            provider_id=provider_id or None,
            model=model or None,
        )
        return self._json({"title": title, "summarized": bool(summarized)})

    def _config(self) -> None:
        d = dict(STATE.config.data)
        cat = catalog_mod.get()
        prov_mod.apply_catalog_urls(d.get("providers") or [], cat)
        d["providers"] = [prov_mod.public_channel(p) for p in (d.get("providers") or [])]
        d["protocols"] = prov_mod.PROTOCOLS
        d["presets"] = [
            {"id": pid, "name": spec["name"]}
            for pid, spec in prov_mod.PRESETS.items()
        ]
        d["api_key_set"] = prov_mod.any_key(STATE.config.data)
        d["paddle_token_set"] = bool(d.get("paddle_token"))
        d["api_key"] = ""
        d["paddle_token"] = ""
        d["embed_providers"] = [embed_mod.public_channel(p) for p in (d.get("embed_providers") or [])]
        d["embed_protocols"] = embed_mod.PROTOCOLS
        d["embed_presets"] = [
            {"id": pid, "name": spec["name"]}
            for pid, spec in embed_mod.PRESETS.items()
        ]
        d["api_connectors"] = [
            api_mod.public_connector(c) for c in (d.get("api_connectors") or [])
        ]
        d["api_protocols"] = api_mod.PROTOCOLS
        d["api_auth_types"] = api_mod.AUTH_TYPE_LABELS
        d["api_presets"] = api_mod.API_PRESETS
        d["src_root"] = STATE.src_root
        d["db_path"] = STATE.db_path
        return self._json(d)

    def _models(self) -> None:
        cat = catalog_mod.get()
        prov_mod.apply_catalog_urls(STATE.config.data.get("providers") or [], cat)
        channels = STATE.config.data.get("providers") or []
        current = (STATE.config.data.get("model") or "").strip()
        provider_id = (STATE.config.data.get("provider_id") or "").strip()
        models = []
        for p in channels:
            if not p.get("api_key"):
                continue
            for m in p.get("models") or []:
                meta = catalog_mod.annotate(
                    preset=p.get("preset") or "",
                    base_url=p.get("base_url") or "",
                    model_id=m.get("id") or "",
                )
                label = m.get("label") or meta.get("label") or m.get("id")
                models.append({
                    "id": m.get("id") or "",
                    "label": label,
                    "provider_id": p.get("id") or "",
                    "provider": p.get("name") or "",
                    "context": meta.get("context"),
                    "context_label": meta.get("context_label") or "",
                    "reasoning": meta.get("reasoning"),
                    "efforts": meta.get("efforts") or [],
                    "inputs": meta.get("inputs") or m.get("inputs") or [],
                    "image": bool(meta.get("image") or ("image" in (m.get("inputs") or []))),
                })
        return self._json({
            "models": models,
            "current": current,
            "provider_id": provider_id,
            "effort": prov_mod.normalize_effort(STATE.config.data.get("effort")),
            "protocols": prov_mod.PROTOCOLS,
        })

    def _models_sync(self) -> None:
        body = self._body()
        pid = str(body.get("provider_id") or "").strip()
        ch = prov_mod.find(STATE.config.data, pid)
        if not ch:
            return self._err("未找到该渠道")
        key = ch.get("api_key") or ""
        if not key:
            return self._err("请先填入 API Key")
        try:
            remote = prov_mod.fetch_remote_models(
                ch.get("base_url") or "", ch.get("protocol") or "openai", key,
            )
        except Exception as e:  # noqa: BLE001
            return self._err(f"同步失败：{e}")
        have = {m["id"] for m in (ch.get("models") or [])}
        added = 0
        for m in remote:
            if m["id"] in have:
                continue
            ch.setdefault("models", []).append(m)
            have.add(m["id"])
            added += 1
        catalog_mod.stamp_models(ch.get("preset") or "", ch.get("base_url") or "", ch.get("models") or [])
        STATE.config.save()
        return self._json({
            "ok": True,
            "added": added,
            "models": [dict(m) for m in (ch.get("models") or [])],
        })

    def _embed_status(self) -> None:
        with STATE.con() as con:
            return self._json(embed_mod.status(STATE.config, con))

    def _embed_start(self) -> None:
        try:
            embed_mod.start(STATE.config, STATE.db_path)
        except ValueError as e:
            return self._err(str(e))
        except Exception as e:  # noqa: BLE001
            return self._err(str(e))
        with STATE.con() as con:
            return self._json(embed_mod.status(STATE.config, con))

    def _embed_stop(self) -> None:
        embed_mod.stop(STATE.config)
        with STATE.con() as con:
            return self._json(embed_mod.status(STATE.config, con))

    def _embed_models_sync(self) -> None:
        body = self._body()
        pid = str(body.get("provider_id") or "").strip()
        ch = embed_mod.find(STATE.config.data, pid)
        if not ch:
            return self._err("未找到该渠道")
        key = ch.get("api_key") or ""
        if not key:
            return self._err("请先填入 API Key")
        try:
            remote = embed_mod.fetch_remote_models(
                ch.get("base_url") or "", ch.get("protocol") or "openai", key,
            )
        except Exception as e:  # noqa: BLE001
            return self._err(f"同步失败：{e}")
        have = {m["id"] for m in (ch.get("models") or [])}
        added = 0
        for m in remote:
            if m["id"] in have:
                continue
            ch.setdefault("models", []).append(m)
            have.add(m["id"])
            added += 1
        STATE.config.save()
        return self._json({
            "ok": True,
            "added": added,
            "models": [dict(m) for m in (ch.get("models") or [])],
        })

    def _attach(self) -> None:
        try:
            files, _fields = self._multipart()
        except ValueError as e:
            return self._err(str(e))
        item = files.get("file")
        if not item or not item.get("data"):
            return self._err("请选择附件")
        vision = str(_fields.get("vision") or "").strip().lower() in ("1", "true", "yes")
        emit, finish = self._sse_begin()
        try:
            meta = attach_mod.parse_file(
                STATE.config,
                os.path.join(STATE.base, "build"),
                item["filename"], item["data"],
                on_progress=lambda p: emit({"type": "progress", **p}),
                vision=vision,
            )
            emit({"type": "done", "ok": True, **meta})
        except Exception as e:                       # noqa: BLE001
            emit({"type": "error", "error": str(e)})
        finally:
            finish()

    def _save_config(self) -> None:
        body = self._body()
        for k in ("model", "temperature", "top_k"):
            if k in body and body[k] not in (None, ""):
                STATE.config.data[k] = body[k]
        if "effort" in body and body["effort"] not in (None, ""):
            STATE.config.data["effort"] = prov_mod.normalize_effort(body["effort"])
        if "providers" in body or "provider_id" in body:
            prov_mod.merge_save(STATE.config.data, body)
        else:
            if body.get("api_key"):
                ch = prov_mod.find(STATE.config.data, body.get("provider_id"))
                if ch:
                    ch["api_key"] = body["api_key"]
            if body.get("clear_key"):
                ch = prov_mod.find(STATE.config.data, body.get("provider_id"))
                if ch:
                    ch["api_key"] = ""
        if "embed_providers" in body or "embed_provider_id" in body or "embed_model" in body or "embed_use" in body:
            embed_mod.merge_save(STATE.config.data, body)
        if "api_connectors" in body:
            api_mod.merge_save(STATE.config.data, body)
        if body.get("paddle_token"):
            STATE.config.data["paddle_token"] = body["paddle_token"]
        if body.get("clear_paddle"):
            STATE.config.data["paddle_token"] = ""
        if body.get("src_root"):
            STATE.config.data["src_root"] = body["src_root"]
            STATE.src_root = body["src_root"]
        STATE.config.save()
        return self._json({
            "ok": True,
            "llm": STATE.config.enabled,
            "paddle": bool(STATE.config.data.get("paddle_token")),
        })

    def _open_file(self) -> None:
        body = self._body()
        did = body.get("doc_id")
        try:
            with STATE.con() as con:
                row = con.execute(
                    "SELECT rel_path, abs_path FROM docs WHERE id=?", (did,)
                ).fetchone()
        except sqlite3.Error as e:
            return self._err(str(e))
        if not row:
            return self._err("未找到文件", 404)
        p = STATE.doc_path(row[0], row[1])
        if not p or not os.path.exists(p):
            return self._err(f"文件不存在：{p}")
        try:
            if sys.platform == "win32":
                os.startfile(p)                    # noqa: S606
            else:
                import subprocess
                subprocess.Popen(["xdg-open", p])
        except OSError as e:
            return self._err(str(e))
        return self._json({"ok": True})

    def _rebuild(self) -> None:
        if STATE.rebuilding:
            return self._json({"ok": False, "error": "正在重建，请稍候"})
        STATE.rebuilding = True

        def run() -> None:
            try:
                st = build_mod.build(
                    STATE.src_root, STATE.db_path,
                    os.path.join(STATE.base, "build"),
                )
                with open(os.path.join(STATE.base, "last_build.json"), "w",
                          encoding="utf-8") as f:
                    json.dump(st, f, ensure_ascii=False, indent=2)
            except Exception as e:                 # noqa: BLE001
                with open(os.path.join(STATE.base, "last_build.json"), "w",
                          encoding="utf-8") as f:
                    json.dump({"error": str(e)}, f, ensure_ascii=False)
            finally:
                STATE.rebuilding = False
                if STATE.config.data.get("embed_running"):
                    embed_mod.start_job(STATE.config, STATE.db_path)

        threading.Thread(target=run, daemon=True).start()
        return self._json({"ok": True, "msg": "已开始重建索引"})

    def _read_raw(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        if n > ingest_mod.MAX_UPLOAD + 1024 * 1024:
            raise ValueError("请求体过大")
        return self.rfile.read(n) if n else b""

    def _multipart(self) -> tuple[dict, dict]:
        ctype = self.headers.get("Content-Type") or ""
        m = re.search(r'boundary="?([^";]+)"?', ctype)
        if not m:
            raise ValueError("不是 multipart 上传")
        boundary = m.group(1).encode("utf-8")
        body = self._read_raw()
        files: dict = {}
        fields: dict = {}
        for part in body.split(b"--" + boundary):
            if not part or part in (b"--", b"--\r\n", b"\r\n") or part.startswith(b"--"):
                continue
            if part.startswith(b"\r\n"):
                part = part[2:]
            header_blob, sep, content = part.partition(b"\r\n\r\n")
            if not sep:
                continue
            if content.endswith(b"\r\n"):
                content = content[:-2]
            disp = ""
            for line in header_blob.decode("utf-8", "replace").split("\r\n"):
                if line.lower().startswith("content-disposition:"):
                    disp = line
            name_m = re.search(r'name="([^"]+)"', disp)
            if not name_m:
                continue
            name = name_m.group(1)
            file_m = re.search(r'filename="([^"]*)"', disp)
            if file_m:
                files[name] = {"filename": file_m.group(1), "data": content}
            else:
                fields[name] = content.decode("utf-8", "replace")
        return files, fields

    def _sse_begin(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        lock = threading.Lock()
        closed = {"v": False}

        def emit(event: dict) -> None:
            data = ("data: " + json.dumps(event, ensure_ascii=False) + "\n\n").encode("utf-8")
            with lock:
                if closed["v"]:
                    return
                try:
                    self.wfile.write(f"{len(data):X}\r\n".encode("ascii"))
                    self.wfile.write(data)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, OSError):
                    closed["v"] = True

        def finish() -> None:
            with lock:
                if closed["v"]:
                    return
                try:
                    self.wfile.write(b"0\r\n\r\n")
                    self.wfile.flush()
                except OSError:
                    pass
                closed["v"] = True
            self.close_connection = True

        return emit, finish

    def _docs_parse(self) -> None:
        try:
            files, _fields = self._multipart()
        except ValueError as e:
            return self._err(str(e))
        item = files.get("file")
        if not item or not item.get("data"):
            return self._err("请上传文件")
        project = str(_fields.get("project") or "").strip()
        folder = str(_fields.get("folder") or "").strip()
        rel_path = str(_fields.get("rel_path") or "").strip()
        emit, finish = self._sse_begin()
        try:
            with STATE.con() as con:
                depts = ingest_mod.existing_depts(con)
            meta = ingest_mod.parse_upload(
                STATE.config,
                os.path.join(STATE.base, "build"),
                item["filename"], item["data"], depts,
                on_progress=lambda p: emit({"type": "progress", **p}),
                project=project,
                folder=folder,
                rel_path=rel_path,
            )
            emit({"type": "done", "ok": True, **meta})
        except Exception as e:                       # noqa: BLE001
            emit({"type": "error", "error": str(e)})
        finally:
            finish()

    def _docs_commit(self) -> None:
        body = self._body()
        tmp_id = (body.get("tmp_id") or "").strip()
        if not tmp_id:
            return self._err("缺少 tmp_id")
        doc_id = body.get("doc_id")
        try:
            doc_id = int(doc_id) if doc_id else None
        except (TypeError, ValueError):
            return self._err("doc_id 无效")
        if STATE.rebuilding:
            return self._err("正在重建索引，请稍候")
        try:
            with STATE.lock:
                out = ingest_mod.commit(
                    STATE.config, STATE.db_path, STATE.src_root,
                    os.path.join(STATE.base, "build"),
                    tmp_id, body, doc_id,
                )
        except Exception as e:                       # noqa: BLE001
            return self._err(str(e))
        return self._json(out)

    def _docs_status(self) -> None:
        body = self._body()
        try:
            did = int(body.get("doc_id"))
        except (TypeError, ValueError):
            return self._err("doc_id 无效")
        try:
            ingest_mod.set_status(STATE.db_path, did, (body.get("status") or "").strip())
        except Exception as e:                       # noqa: BLE001
            return self._err(str(e))
        return self._json({"ok": True})

    def _docs_meta(self) -> None:
        body = self._body()
        doc_ids = body.get("doc_ids")
        if isinstance(doc_ids, list) and doc_ids:
            updates = body.get("updates") if isinstance(body.get("updates"), dict) else body
            try:
                with STATE.lock:
                    for did in doc_ids:
                        build_mod.update_doc_metadata(STATE.db_path, int(did), updates, src_root=STATE.src_root)
            except Exception as e:                   # noqa: BLE001
                return self._err(str(e))
            return self._json({"ok": True, "count": len(doc_ids)})
        try:
            did = int(body.get("doc_id"))
        except (TypeError, ValueError):
            return self._err("doc_id 无效")
        try:
            with STATE.lock:
                out = build_mod.update_doc_metadata(STATE.db_path, did, body, src_root=STATE.src_root)
        except Exception as e:                       # noqa: BLE001
            return self._err(str(e))
        return self._json(out)

    def _docs_delete(self) -> None:
        body = self._body()
        raw_ids = body.get("doc_ids")
        if not isinstance(raw_ids, list):
            did = body.get("doc_id")
            raw_ids = [did] if did else []
        try:
            ids = [int(x) for x in raw_ids if x]
        except (TypeError, ValueError):
            return self._err("doc_id 无效")
        if not ids:
            return self._err("未选择文档")
        try:
            with STATE.lock:
                removed = build_mod.delete_documents(STATE.db_path, ids)
        except Exception as e:                       # noqa: BLE001
            return self._err(str(e))
        return self._json({"ok": True, "removed": removed})

    def _docs_organize(self) -> None:
        body = self._body()
        project = str(body.get("project") or "").strip()
        if not project:
            return self._err("请先选择一个项目")
        try:
            with STATE.lock:
                out = ingest_mod.ai_organize_project(STATE.config, STATE.db_path, project)
        except Exception as e:                       # noqa: BLE001
            return self._err(str(e))
        return self._json(out)

    def _folders_create(self) -> None:
        body = self._body()
        project = str(body.get("project") or "").strip()
        path = str(body.get("path") or "").strip()
        try:
            with STATE.lock:
                out = build_mod.create_folder(STATE.db_path, STATE.src_root, project, path)
        except Exception as e:                       # noqa: BLE001
            return self._err(str(e))
        return self._json(out)

    def _folders_delete(self) -> None:
        body = self._body()
        project = str(body.get("project") or "").strip()
        path = str(body.get("path") or "").strip()
        force = bool(body.get("force"))
        try:
            with STATE.lock:
                out = build_mod.delete_folder(STATE.db_path, project, path, force=force)
        except Exception as e:                       # noqa: BLE001
            return self._err(str(e))
        return self._json(out)

    def _folders_move(self) -> None:
        body = self._body()
        src_project = str(body.get("src_project") or "").strip()
        src_path = str(body.get("src_path") or "").strip()
        dst_project = str(body.get("dst_project") or src_project).strip()
        dst_path = str(body.get("dst_path") or "").strip()
        try:
            with STATE.lock:
                out = build_mod.move_or_rename_folder(
                    STATE.db_path, STATE.src_root,
                    src_project, src_path, dst_project, dst_path,
                )
        except Exception as e:                       # noqa: BLE001
            return self._err(str(e))
        return self._json(out)

    def _browser_register(self) -> None:
        host = (self.client_address[0] if self.client_address else "")
        if host not in ("127.0.0.1", "::1"):
            return self._err("forbidden", 403)
        body = self._body()
        ctl_url = str(body.get("ctl_url") or "").strip()
        token = str(body.get("token") or "").strip()
        if not ctl_url or not token:
            return self._err("missing ctl_url or token")
        browser_mod.register_bridge(ctl_url, token)
        return self._json({"ok": True})

    def _browser_state(self) -> None:
        if not browser_mod.bridge_ready():
            return self._json({"ok": True, "ready": False, "tabs": [], "downloads": []})
        out = browser_mod.call_bridge({"action": "status"}, timeout=8.0)
        return self._json(out)

    def _browser_action(self) -> None:
        body = self._body()
        out = browser_mod.call_bridge(body, timeout=35.0)
        return self._json(out)

    def _connector_test(self) -> None:
        body = self._body()
        cid = str(body.get("id") or body.get("connector") or "").strip()
        existing = api_mod.find_connector(STATE.config.data.get("api_connectors") or [], cid)
        if body.get("base_url") or body.get("baseUrl"):
            temp = dict(existing or {})
            temp.update(body)
            if not body.get("api_key") and existing:
                temp["api_key"] = existing.get("api_key") or ""
            if not body.get("api_secret") and existing:
                temp["api_secret"] = existing.get("api_secret") or ""
            norm = api_mod.normalize_connector(temp)
            out = api_mod.execute_api_call(
                {
                    "action": "test",
                    "connector": norm["name"],
                    "path": body.get("path") or "",
                },
                {"load_connectors": lambda: [norm], "timeout_ms": 15000},
            )
            return self._json(out)
        out = api_mod.execute_api_call(
            {"action": "test", "connector": cid, "path": body.get("path") or ""},
            {"cfg": STATE.config, "timeout_ms": 15000},
        )
        return self._json(out)

    def _connector_discover(self) -> None:
        body = self._body()
        url = str(body.get("url") or body.get("base_url") or "").strip()
        if not url:
            return self._err("请填入 OpenAPI/Swagger 文档地址或 API 根地址")
        out = api_mod.discover_openapi(url)
        return self._json(out)


def _alert(msg: str) -> None:
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, APP_TITLE, 0x10)
    except Exception:
        print(msg)


class QuietHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address) -> None:
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def _bind(preferred: int) -> ThreadingHTTPServer:
    err: OSError | None = None
    for p in (preferred, 0):
        try:
            return QuietHTTPServer(("127.0.0.1", p), Handler)
        except OSError as e:
            err = e
    raise OSError(err)


def _wait_up(url: str, timeout: float = 8.0) -> None:
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=0.5)
            return
        except Exception:
            time.sleep(0.1)


def _find_electron() -> tuple[str, str]:
    for root in (app_dir(), os.path.dirname(HERE)):
        desk = os.path.join(root, "desktop")
        exe = os.path.join(desk, "node_modules", "electron", "dist", "electron.exe")
        if os.path.isfile(exe) and os.path.isfile(os.path.join(desk, "main.js")):
            return exe, desk
    return "", ""


def _run_window(url: str) -> bool:
    electron_exe, desk_dir = _find_electron()
    if electron_exe and desk_dir:
        import subprocess
        env = os.environ.copy()
        env.pop("ELECTRON_RUN_AS_NODE", None)
        env.pop("CHROME_CRASHPAD_PIPE_NAME", None)
        try:
            flags = 0
            startupinfo = None
            if os.name == "nt":
                flags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = 0
            proc = subprocess.Popen(
                [electron_exe, desk_dir, f"--app-url={url}"],
                cwd=desk_dir,
                env=env,
                creationflags=flags,
                startupinfo=startupinfo,
            )
            proc.wait()
            return True
        except OSError as e:
            print(f"Electron 启动失败：{e}")

    try:
        import webview
    except ImportError:
        return False
    storage = os.path.join(user_data_dir(), "webview")
    os.makedirs(storage, exist_ok=True)
    webview.create_window(
        APP_TITLE,
        url,
        width=1440,
        height=840,
        min_size=(960, 640),
        text_select=True,
        zoomable=True,
        background_color="#FAFAFA",
    )
    try:
        webview.start(private_mode=False, storage_path=storage)
        return True
    except Exception as e:
        print(f"窗口启动失败：{e}")
        return False


def main(port: int = 8765, use_gui: bool = True) -> None:
    _fix_stdio()
    if not os.path.exists(STATE.db_path) and os.path.isdir(STATE.src_root):
        st = build_mod.build(STATE.src_root, STATE.db_path,
                             os.path.join(STATE.base, "build"))
        print("建库完成：", st)

    httpd = _bind(port)
    real_port = httpd.server_address[1]
    url = f"http://127.0.0.1:{real_port}/"
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    _wait_up(url)
    print(f"{APP_TITLE} 已启动：{url}")
    try:
        if use_gui and _run_window(url):
            return
        if getattr(sys, "frozen", False):
            _alert("无法打开窗口。请安装 Microsoft Edge WebView2 后重试。")
            return
        import webbrowser
        webbrowser.open(url)
        print("关闭本窗口即退出。")
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            httpd.shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    port = 8765
    use_gui = "--no-gui" not in sys.argv
    args = [a for a in sys.argv[1:] if a != "--no-gui"]
    if args:
        try:
            port = int(args[0])
        except ValueError:
            pass
    main(port, use_gui=use_gui)
