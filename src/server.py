from __future__ import annotations

import io
import json
import os
import re
import shutil
import socket
import sqlite3
import sys
import tempfile
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
import market_data as market_mod
import news as news_mod
import providers as prov_mod
import quant_engine as quant_mod
import search as search_mod
import embed as embed_mod
import unified_db as udb_mod
import web_search_tool as web_search_mod
import widget_tool as widget_mod

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


def _cache_paths(base_dir: str) -> dict[str, list[str]]:
    ud = user_data_dir()
    td = tempfile.gettempdir()
    build_dir = os.path.join(base_dir, "build")
    att_dirs = []
    if os.path.isdir(build_dir):
        try:
            for fn in os.listdir(build_dir):
                if fn.startswith("att-"):
                    att_dirs.append(os.path.join(build_dir, fn))
        except OSError:
            pass
    prof = os.path.join(ud, "browser-profile")
    return {
        "uploads": [os.path.join(build_dir, "uploads")],
        "temp_logs": [
            os.path.join(td, "o2-browser-shots"),
            os.path.join(td, "o2-shell"),
            os.path.join(td, "o2-api"),
            *att_dirs,
        ],
        "downloads": [os.path.join(ud, "downloads")],
        "browser_cache": [
            os.path.join(prof, "Cache"),
            os.path.join(prof, "Code Cache"),
            os.path.join(prof, "GPUCache"),
            os.path.join(prof, "Partitions", "o2-browser", "Cache"),
            os.path.join(prof, "Partitions", "o2-browser", "Code Cache"),
            os.path.join(prof, "Partitions", "o2-browser", "GPUCache"),
            os.path.join(prof, "Partitions", "o2-browser", "Service Worker", "CacheStorage"),
        ],
        "browser_profile": [prof],
        "ocr_cache": [os.path.join(build_dir, "ocr_cloud")],
    }


def _paths_usage(paths: list[str]) -> dict:
    total_bytes = 0
    total_files = 0
    for p in paths:
        if not p or not os.path.exists(p):
            continue
        if os.path.isfile(p):
            try:
                total_bytes += os.path.getsize(p)
                total_files += 1
            except OSError:
                pass
            continue
        for root, _dirs, files in os.walk(p):
            for fn in files:
                fp = os.path.join(root, fn)
                try:
                    total_bytes += os.path.getsize(fp)
                    total_files += 1
                except OSError:
                    pass
    return {"bytes": total_bytes, "files": total_files}


def _clean_paths(paths: list[str], max_age_sec: float = 0.0) -> dict:
    now = time.time()
    freed = 0
    removed = 0
    for p in paths:
        if not p or not os.path.exists(p):
            continue
        if os.path.basename(p).startswith("att-") and os.path.isdir(p):
            try:
                if max_age_sec <= 0 or (now - os.path.getmtime(p)) >= max_age_sec:
                    st = _paths_usage([p])
                    shutil.rmtree(p, ignore_errors=True)
                    freed += st["bytes"]
                    removed += max(1, st["files"])
            except OSError:
                pass
            continue
        if not os.path.isdir(p):
            continue
        for root, dirs, files in os.walk(p, topdown=False):
            for fn in files:
                fp = os.path.join(root, fn)
                try:
                    if max_age_sec > 0 and (now - os.path.getmtime(fp)) < max_age_sec:
                        continue
                    sz = os.path.getsize(fp)
                    os.remove(fp)
                    freed += sz
                    removed += 1
                except OSError:
                    pass
            for dn in dirs:
                dp = os.path.join(root, dn)
                try:
                    if not os.listdir(dp):
                        os.rmdir(dp)
                except OSError:
                    pass
    return {"freed_bytes": freed, "removed_files": removed}


def _auto_gc_temp_files(base_dir: str) -> None:
    try:
        cp = _cache_paths(base_dir)
        # 启动时自动清理超过 12 小时的未提交上传孤儿文件与临时截图/日志
        _clean_paths(cp["uploads"] + cp["temp_logs"], max_age_sec=12 * 3600)
    except Exception:
        pass


def _fix_stdio() -> None:
    if sys.stdout is not None and sys.stderr is not None:
        return
    try:
        f = open(os.path.join(user_data_dir(), "app.log"), "a", encoding="utf-8", buffering=1)
    except OSError:
        f = open(os.devnull, "w")
    sys.stdout = sys.stderr = f


if getattr(sys, "frozen", False) or sys.stdout is None or sys.stderr is None:
    _fix_stdio()


class State:
    def __init__(self) -> None:
        self.base = app_dir()
        bundled = os.path.join(res_dir(), "data", "zdl.sqlite")
        self.db_path = udb_mod.init_unified_db(self.base, bundled_zdl_path=bundled)
        self.config = cfg_mod.Config(os.path.join(self.base, "config.json"))
        self.lock = threading.Lock()
        self.rebuilding = False
        self.src_root = self._guess_src()
        self.news = news_mod.NewsManager(self.db_path, self.config)
        self.news.start_background()
        self.market = market_mod.MarketManager(
            self.db_path,
            self.config,
            news_mgr=self.news,
        )
        self.quant = quant_mod.QuantManager(
            self.base,
            self.db_path,
            self.config,
            market_mgr=self.market,
        )
        self.widgets = widget_mod.WidgetStore(os.path.join(self.base, "data", "widgets.json"))
        catalog_mod.init(os.path.join(self.base, "build"))
        threading.Thread(target=catalog_mod.refresh, daemon=True).start()
        try:
            with self.con() as con:
                build_mod.ensure_schema(con)
                embed_mod.ensure_schema(con)
        except sqlite3.Error:
            pass
        if self.config.data.get("auto_clean_temp", True):
            threading.Thread(
                target=_auto_gc_temp_files, args=(self.base,), daemon=True
            ).start()
        if (self.config.data.get("embed_use") or self.config.data.get("embed_running")) and embed_mod.resolve(self.config.data):
            self.config.data["embed_running"] = True
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
        return udb_mod.connect(self.db_path, readonly=False)

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
        if path == "/api/kb":
            return self._kb_list()
        if path == "/api/models":
            return self._models()
        if path == "/api/embed/status":
            return self._embed_status()
        if path == "/api/browser/state":
            return self._browser_state()
        if path == "/api/cache/status":
            return self._cache_status()
        if path == "/api/chats":
            return self._chats_get()
        if path == "/api/news/status":
            return self._news_status()
        if path == "/api/news/feeds":
            return self._news_feeds()
        if path == "/api/news/feeds/export_opml":
            return self._news_export_opml()
        if path == "/api/news/items":
            return self._news_items(qs)
        if path == "/api/news/search":
            return self._news_search(qs)
        if path == "/api/news/entities":
            return self._news_entities(qs)
        if path == "/api/news/entity":
            return self._news_entity_profile(qs)
        if path == "/api/news/graph":
            return self._news_entity_graph(qs)
        if path.startswith("/api/news/item/"):
            return self._news_item_detail(path.rsplit("/", 1)[1])
        if path == "/api/dashboard/layout":
            return self._dashboard_layout_get()
        if path == "/api/market/layout":
            return self._market_layout_get()
        if path == "/api/market/overview":
            return self._market_overview(qs)
        if path == "/api/market/kline":
            return self._market_kline(qs)
        if path == "/api/market/sectors":
            return self._market_sectors(qs)
        if path == "/api/market/movers":
            return self._market_movers(qs)
        if path == "/api/market/macro":
            return self._market_macro(qs)
        if path == "/api/market/geopolitics":
            return self._market_geopolitics(qs)
        if path == "/api/market/search":
            return self._market_search(qs)
        if path == "/api/market/watchlist":
            return self._market_watchlist_get()
        if path == "/api/market/quant":
            return self._market_quant(qs)
        if path == "/api/quant/status":
            return self._quant_status(qs)
        if path == "/api/quant/sync/active":
            return self._quant_sync_active()
        if path == "/api/quant/factors":
            return self._quant_factors()
        if path == "/api/quant/leaderboard":
            return self._quant_leaderboard(qs)
        if path == "/api/quant/symbols":
            return self._quant_symbols()
        if path == "/api/quant/jobs":
            return self._quant_jobs(qs)
        if path.startswith("/api/quant/job/"):
            return self._quant_job_detail(path.rsplit("/", 1)[1])
        if path == "/api/widgets":
            return self._widgets_list()
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
        if u.path == "/api/kb":
            return self._kb_set()
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
        if u.path == "/api/web_search/test":
            return self._web_search_test()
        if u.path == "/api/cache/clear":
            return self._cache_clear()
        if u.path == "/api/cache/open":
            return self._cache_open_dir()
        if u.path == "/api/chats":
            return self._chats_save()
        if u.path == "/api/news/feeds/save":
            return self._news_feed_save()
        if u.path == "/api/news/feeds/delete":
            return self._news_feed_delete()
        if u.path == "/api/news/feeds/import_presets":
            return self._news_import_presets()
        if u.path == "/api/news/feeds/import_opml":
            return self._news_import_opml()
        if u.path == "/api/news/fetch":
            return self._news_fetch()
        if u.path == "/api/news/translate_pending":
            return self._news_translate_pending()
        if u.path == "/api/news/translate":
            return self._news_translate_one()
        if u.path == "/api/news/star":
            return self._news_star()
        if u.path == "/api/news/embed":
            return self._news_embed()
        if u.path == "/api/news/reindex":
            return self._news_reindex()
        if u.path == "/api/news/mark_read":
            return self._news_mark_all_read()
        if u.path == "/api/news/brief":
            return self._news_brief()
        if u.path == "/api/dashboard/layout":
            return self._dashboard_layout_save()
        if u.path == "/api/market/layout":
            return self._market_layout_save()
        if u.path == "/api/market/watchlist":
            return self._market_watchlist_post()
        if u.path == "/api/market/test_proxy":
            return self._market_test_proxy()
        if u.path == "/api/quant/sync":
            return self._quant_sync()
        if u.path == "/api/quant/sync/stop":
            return self._quant_sync_stop()
        if u.path == "/api/quant/factor_eval":
            return self._quant_factor_eval()
        if u.path == "/api/quant/backtest":
            return self._quant_backtest()
        if u.path == "/api/quant/sweep":
            return self._quant_sweep()
        if u.path == "/api/quant/factor_batch":
            return self._quant_factor_batch()
        if u.path == "/api/quant/factor_corr":
            return self._quant_factor_corr()
        if u.path == "/api/quant/job/delete":
            return self._quant_job_delete()
        if u.path == "/api/widgets/save":
            return self._widgets_save()
        if u.path == "/api/widgets/delete":
            return self._widgets_delete()
        if u.path == "/api/widgets/topic_board":
            return self._widgets_topic_board()
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

    def _kb_list(self) -> None:
        with STATE.con() as con:
            build_mod.ensure_schema(con)
            return self._json({"disabled": search_mod.kb_disabled(con)})

    def _kb_set(self) -> None:
        body = self._body()
        project = str(body.get("project") or "").strip()
        if not project:
            return self._err("缺少文库名称")
        enabled = bool(body.get("enabled"))
        try:
            with STATE.lock:
                con = STATE.con()
                try:
                    disabled = search_mod.set_kb_enabled(con, project, enabled)
                finally:
                    con.close()
        except Exception as e:                       # noqa: BLE001
            return self._err(str(e))
        return self._json({"ok": True, "disabled": disabled})

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
        raw_ws = body.get("web_search")
        web_search = None if raw_ws is None else bool(raw_ws)
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
                    web_search=web_search,
                    news_mgr=STATE.news,
                    market_mgr=STATE.market,
                    quant_mgr=STATE.quant,
                    widget_store=STATE.widgets,
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
        d["web_search_api_key_set"] = bool(d.get("web_search_api_key"))
        d["web_search_deepseek_ready"] = web_search_mod.deepseek_ready(STATE.config.data)
        d["api_key"] = ""
        d["paddle_token"] = ""
        d["web_search_api_key"] = ""
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
        d["detected_system_proxy"] = STATE.market.system_proxy()
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
        if body.get("web_search_api_key"):
            STATE.config.data["web_search_api_key"] = str(body["web_search_api_key"]).strip()
        if body.get("clear_web_search_key"):
            STATE.config.data["web_search_api_key"] = ""
        if body.get("src_root"):
            STATE.config.data["src_root"] = body["src_root"]
            STATE.src_root = body["src_root"]
        prev_news_enabled = bool(STATE.config.data.get("news_enabled"))
        for bool_k in (
            "shell", "browser", "api_call", "web_search", "web_search_read_url",
            "batch_fast_meta", "auto_clean_temp",
            "news_enabled", "news_auto_translate", "news_local_embed", "news_local_rerank",
        ):
            if bool_k in body and body[bool_k] is not None:
                STATE.config.data[bool_k] = bool(body[bool_k])
        if "web_search_mode" in body and body["web_search_mode"] not in (None, ""):
            STATE.config.data["web_search_mode"] = web_search_mod.normalize_mode(body["web_search_mode"])
        if "web_search_count" in body and body["web_search_count"] not in (None, ""):
            try:
                STATE.config.data["web_search_count"] = max(1, min(20, int(body["web_search_count"])))
            except (TypeError, ValueError):
                pass
        prev_mkt_proxy = str(STATE.config.data.get("market_proxy") or "")
        prev_mkt_mode = str(STATE.config.data.get("market_source_mode") or "auto")
        for str_k in (
            "pdf_ocr_mode", "browser_download_mode", "ui_density", "ui_theme",
            "default_tab", "followup_mode", "web_search_base_url",
            "news_llm_provider_id", "news_llm_model", "news_rsshub_base",
            "market_proxy", "market_source_mode",
        ):
            if str_k in body and body[str_k] is not None:
                val = str(body[str_k]).strip()
                if val or str_k in ("news_llm_provider_id", "news_llm_model", "market_proxy", "web_search_base_url"):
                    STATE.config.data[str_k] = val
        if (
            str(STATE.config.data.get("market_proxy") or "") != prev_mkt_proxy
            or str(STATE.config.data.get("market_source_mode") or "auto") != prev_mkt_mode
        ):
            STATE.market.reset_routing_cache()
        if "news_refresh_minutes" in body and body["news_refresh_minutes"] not in (None, ""):
            try:
                mins = int(body["news_refresh_minutes"])
                STATE.config.data["news_refresh_minutes"] = 0 if mins <= 0 else max(1, min(1440, mins))
            except (TypeError, ValueError):
                pass
        if "news_dedup_window_hours" in body and body["news_dedup_window_hours"] not in (None, ""):
            try:
                STATE.config.data["news_dedup_window_hours"] = max(6, min(336, int(body["news_dedup_window_hours"])))
            except (TypeError, ValueError):
                pass
        for fk in ("news_dedup_sem_threshold", "news_dedup_xlang_threshold"):
            if fk in body and body[fk] not in (None, ""):
                try:
                    STATE.config.data[fk] = round(max(0.65, min(0.98, float(body[fk]))), 3)
                except (TypeError, ValueError):
                    pass
        if "news_glossary" in body and isinstance(body["news_glossary"], list):
            cleaned_g = []
            for g in body["news_glossary"]:
                if not isinstance(g, dict):
                    continue
                term = str(g.get("term") or "").strip()
                zh = str(g.get("zh") or "").strip()
                if term and zh:
                    cleaned_g.append({"term": term, "zh": zh, "note": str(g.get("note") or "").strip()})
            STATE.config.data["news_glossary"] = cleaned_g
        if "dashboard_layout" in body and (body["dashboard_layout"] is None or isinstance(body["dashboard_layout"], dict)):
            STATE.config.data["dashboard_layout"] = body["dashboard_layout"]
        if (not prev_news_enabled and STATE.config.data.get("news_enabled")) or (
            STATE.config.data.get("news_enabled") and (body.get("news_auto_translate") or body.get("news_local_embed"))
        ):
            STATE.news.wake()
        if "embed_use" in body or "embed_providers" in body or "embed_model" in body:
            if STATE.config.data.get("embed_use") and embed_mod.resolve(STATE.config.data):
                STATE.config.data["embed_running"] = True
                embed_mod.start_job(STATE.config, STATE.db_path)
            elif "embed_use" in body and not STATE.config.data.get("embed_use"):
                embed_mod.stop(STATE.config)
        if "batch_concurrency" in body and body["batch_concurrency"] not in (None, ""):
            try:
                STATE.config.data["batch_concurrency"] = max(1, min(6, int(body["batch_concurrency"])))
            except (TypeError, ValueError):
                pass
        if "browser_download_mode" in body and browser_mod.bridge_ready():
            try:
                browser_mod.call_bridge(
                    {"action": "set_download_mode", "mode": STATE.config.data.get("browser_download_mode", "sandbox")},
                    timeout=2.5,
                )
            except Exception:
                pass
        STATE.config.save()
        return self._json({
            "ok": True,
            "llm": STATE.config.enabled,
            "paddle": bool(STATE.config.data.get("paddle_token")),
            "web_search_deepseek_ready": web_search_mod.deepseek_ready(STATE.config.data),
        })

    def _web_search_test(self) -> None:
        body = self._body()
        query = str(body.get("query") or "DeepSeek").strip()
        res = web_search_mod.test_connection(STATE.config.data, query=query)
        return self._json(res)

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
        auto_commit = str(_fields.get("auto_commit") or "").strip().lower() in ("1", "true", "yes")
        force_ocr_raw = str(_fields.get("force_ocr") or "").strip().lower()
        force_ocr = True if force_ocr_raw in ("1", "true", "yes") else (False if force_ocr_raw in ("0", "false", "no") else None)
        fast_meta_raw = str(_fields.get("fast_meta") or "").strip().lower()
        fast_meta = True if fast_meta_raw in ("1", "true", "yes") else (False if fast_meta_raw in ("0", "false", "no") else None)
        work_dir = os.path.join(STATE.base, "build")
        emit, finish = self._sse_begin()
        try:
            with STATE.con() as con:
                depts = ingest_mod.existing_depts(con)
            meta = ingest_mod.parse_upload(
                STATE.config,
                work_dir,
                item["filename"], item["data"], depts,
                on_progress=lambda p: emit({"type": "progress", **p}),
                project=project,
                folder=folder,
                rel_path=rel_path,
                db_path=STATE.db_path,
                src_root=STATE.src_root,
                skip_existing=str(_fields.get("skip_existing") or "1").strip() not in ("0", "false", "no"),
                force_ocr=force_ocr,
                fast_meta=fast_meta,
            )
            if auto_commit and not meta.get("skipped") and meta.get("tmp_id"):
                if STATE.rebuilding:
                    raise ValueError("正在重建索引，请稍候")
                emit({"type": "progress", "percent": 94, "message": "正在写入索引库…", "stage": "commit"})
                commit_meta = {
                    "project": meta.get("project") or project or "集团制度库",
                    "folder": meta.get("folder") or folder or "",
                    "dept": meta.get("dept") or "",
                    "doc_type": meta.get("doc_type") or "general",
                    "chunk_profile": meta.get("chunk_profile") or "auto",
                    "title": meta.get("title") or os.path.splitext(item["filename"])[0],
                    "doc_no": meta.get("doc_no") or "",
                    "issued_date": meta.get("issued_date") or "",
                    "status": meta.get("status") or "现行",
                    "summary": meta.get("summary") or "",
                    "tags": meta.get("tags") or [],
                    "meta": meta.get("meta") or {},
                }
                committed = ingest_mod.commit(
                    STATE.config,
                    STATE.db_path,
                    STATE.src_root,
                    work_dir,
                    meta["tmp_id"],
                    commit_meta,
                    doc_id=None,
                    db_lock=STATE.lock,
                )
                emit({"type": "done", "ok": True, "committed": True, **meta, **committed})
            else:
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
            out = ingest_mod.commit(
                STATE.config, STATE.db_path, STATE.src_root,
                os.path.join(STATE.base, "build"),
                tmp_id, body, doc_id,
                db_lock=STATE.lock,
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
        try:
            mode = STATE.config.data.get("browser_download_mode", "sandbox")
            browser_mod.call_bridge({"action": "set_download_mode", "mode": mode}, timeout=2.0)
        except Exception:
            pass
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

    def _build_cache_report(self) -> dict:
        cp = _cache_paths(STATE.base)
        uploads_st = _paths_usage(cp["uploads"])
        temp_st = _paths_usage(cp["temp_logs"])
        dl_st = _paths_usage(cp["downloads"])
        bcache_st = _paths_usage(cp["browser_cache"])
        bprof_st = _paths_usage(cp["browser_profile"])
        ocr_st = _paths_usage(cp["ocr_cache"])
        db_st = _paths_usage([STATE.db_path, STATE.db_path + "-wal", STATE.db_path + "-shm"])
        sandbox_dl = cp["downloads"][0]
        sys_dl = os.path.join(os.path.expanduser("~"), "Downloads")
        dl_mode = STATE.config.data.get("browser_download_mode", "sandbox")
        return {
            "ok": True,
            "uploads": {**uploads_st, "path": cp["uploads"][0]},
            "temp_logs": {**temp_st, "bytes": uploads_st["bytes"] + temp_st["bytes"], "files": uploads_st["files"] + temp_st["files"]},
            "downloads": {**dl_st, "path": sandbox_dl},
            "browser_cache": {**bcache_st, "profile_bytes": bprof_st["bytes"], "path": cp["browser_profile"][0]},
            "ocr_cache": {**ocr_st, "path": cp["ocr_cache"][0]},
            "database": {**db_st, "path": STATE.db_path},
            "active_download_dir": sys_dl if dl_mode == "system" else sandbox_dl,
            "sandbox_download_dir": sandbox_dl,
            "system_download_dir": sys_dl,
        }

    def _cache_status(self) -> None:
        return self._json(self._build_cache_report())

    def _cache_clear(self) -> None:
        body = self._body()
        target = str(body.get("target") or "temp").strip().lower()
        cp = _cache_paths(STATE.base)
        res = {"freed_bytes": 0, "removed_files": 0}
        if target in ("temp", "uploads", "all_temp"):
            r1 = _clean_paths(cp["uploads"] + cp["temp_logs"])
            res["freed_bytes"] += r1["freed_bytes"]
            res["removed_files"] += r1["removed_files"]
            with ingest_mod._PARSED_CACHE_LOCK:
                ingest_mod._PARSED_CACHE.clear()
        elif target == "downloads":
            r1 = _clean_paths(cp["downloads"])
            res["freed_bytes"] += r1["freed_bytes"]
            res["removed_files"] += r1["removed_files"]
            if browser_mod.bridge_ready():
                try:
                    browser_mod.call_bridge({"action": "clear_cache", "clear_downloads": True}, timeout=3.0)
                except Exception:
                    pass
        elif target == "browser_cache":
            before = _paths_usage(cp["browser_cache"])["bytes"]
            if browser_mod.bridge_ready():
                try:
                    browser_mod.call_bridge({"action": "clear_cache", "clear_cookies": False}, timeout=5.0)
                except Exception:
                    pass
            r1 = _clean_paths(cp["browser_cache"])
            after = _paths_usage(cp["browser_cache"])["bytes"]
            res["freed_bytes"] = max(r1["freed_bytes"], max(0, before - after))
            res["removed_files"] = r1["removed_files"]
        elif target == "browser_cookies":
            if browser_mod.bridge_ready():
                try:
                    browser_mod.call_bridge({"action": "clear_cache", "clear_cookies": True}, timeout=5.0)
                except Exception:
                    pass
            r1 = _clean_paths(cp["browser_cache"])
            res["freed_bytes"] = r1["freed_bytes"]
            res["removed_files"] = r1["removed_files"]
        elif target == "ocr_cache":
            r1 = _clean_paths(cp["ocr_cache"])
            res["freed_bytes"] = r1["freed_bytes"]
            res["removed_files"] = r1["removed_files"]
        else:
            return self._err(f"未知的清理目标: {target}")
        report = self._build_cache_report()
        report.update(res)
        return self._json(report)

    def _cache_open_dir(self) -> None:
        body = self._body()
        kind = str(body.get("kind") or "downloads").strip().lower()
        cp = _cache_paths(STATE.base)
        if kind == "downloads":
            dl_mode = STATE.config.data.get("browser_download_mode", "sandbox")
            target_dir = os.path.join(os.path.expanduser("~"), "Downloads") if dl_mode == "system" else cp["downloads"][0]
        elif kind == "src_root":
            target_dir = STATE.src_root
        elif kind == "data":
            target_dir = os.path.dirname(STATE.db_path)
        elif kind == "ocr_cache":
            target_dir = cp["ocr_cache"][0]
        else:
            target_dir = cp["uploads"][0]
        os.makedirs(target_dir, exist_ok=True)
        try:
            if sys.platform == "win32":
                os.startfile(target_dir)  # noqa: S606
            else:
                import subprocess
                subprocess.Popen(["xdg-open", target_dir])
        except OSError as e:
            return self._err(str(e))
        return self._json({"ok": True, "path": target_dir})

    def _chats_path(self) -> str:
        d = os.path.dirname(STATE.db_path)
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, "chats.json")

    def _chats_get(self) -> None:
        p = self._chats_path()
        if not os.path.isfile(p):
            return self._json({"ok": True, "chats": [], "active_id": ""})
        try:
            with STATE.lock:
                with open(p, encoding="utf-8") as f:
                    data = json.load(f)
            if isinstance(data, list):
                return self._json({"ok": True, "chats": data, "active_id": ""})
            if isinstance(data, dict):
                return self._json({
                    "ok": True,
                    "chats": data.get("chats") if isinstance(data.get("chats"), list) else [],
                    "active_id": str(data.get("active_id") or ""),
                })
        except Exception:
            pass
        return self._json({"ok": True, "chats": [], "active_id": ""})

    def _chats_save(self) -> None:
        body = self._body()
        incoming = body.get("chats")
        replace_all = bool(body.get("replace"))
        active_id = str(body.get("active_id") or "")
        if not isinstance(incoming, list):
            return self._err("invalid chats")
        p = self._chats_path()
        try:
            with STATE.lock:
                existing_list: list[dict] = []
                if not replace_all and os.path.isfile(p):
                    try:
                        with open(p, encoding="utf-8") as f:
                            old_raw = json.load(f)
                        if isinstance(old_raw, list):
                            existing_list = old_raw
                        elif isinstance(old_raw, dict) and isinstance(old_raw.get("chats"), list):
                            existing_list = old_raw["chats"]
                    except Exception:
                        existing_list = []
                if replace_all:
                    merged = [c for c in incoming if isinstance(c, dict) and c.get("id")][:100]
                else:
                    by_id: dict[str, dict] = {}
                    for c in existing_list:
                        if isinstance(c, dict) and c.get("id"):
                            by_id[str(c["id"])] = c
                    for c in incoming:
                        if not isinstance(c, dict) or not c.get("id"):
                            continue
                        cid = str(c["id"])
                        prev = by_id.get(cid)
                        if not prev:
                            by_id[cid] = c
                        else:
                            # 保留消息更完整或更新时间更新的版本
                            prev_msgs = prev.get("messages") or []
                            new_msgs = c.get("messages") or []
                            if len(new_msgs) >= len(prev_msgs) or int(c.get("updatedAt") or 0) >= int(prev.get("updatedAt") or 0):
                                by_id[cid] = c
                    merged = sorted(
                        by_id.values(),
                        key=lambda x: int(x.get("activeAt") or x.get("updatedAt") or x.get("createdAt") or 0),
                        reverse=True,
                    )[:100]
                with open(p, "w", encoding="utf-8") as f:
                    json.dump({"chats": merged, "active_id": active_id}, f, ensure_ascii=False)
            return self._json({"ok": True, "count": len(merged)})
        except Exception as e:
            return self._err(str(e))

    def _news_status(self) -> None:
        return self._json({"ok": True, **STATE.news.status()})

    def _news_feeds(self) -> None:
        return self._json({
            "ok": True,
            "feeds": STATE.news.store.list_feeds(),
            "presets": news_mod.PRESET_FEEDS,
            "default_glossary": news_mod.DEFAULT_GLOSSARY,
        })

    def _news_export_opml(self) -> None:
        xml = STATE.news.store.export_opml().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/xml; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="o2-news-feeds.opml"')
        self.send_header("Content-Length", str(len(xml)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(xml)

    def _news_feed_save(self) -> None:
        body = self._body()
        try:
            feed = STATE.news.store.save_feed(body)
            return self._json({"ok": True, "feed": feed})
        except Exception as e:
            return self._err(str(e))

    def _news_feed_delete(self) -> None:
        body = self._body()
        fid = str(body.get("id") or "").strip()
        if not fid:
            return self._err("缺少源 id")
        removed = STATE.news.store.delete_feed(fid, delete_items=bool(body.get("delete_items")))
        return self._json({"ok": True, "removed": removed})

    def _news_import_presets(self) -> None:
        body = self._body()
        langs = body.get("langs") if isinstance(body.get("langs"), list) else None
        res = STATE.news.store.import_presets(langs=langs)
        return self._json({"ok": True, **res, "feeds": STATE.news.store.list_feeds()})

    def _news_import_opml(self) -> None:
        body = self._body()
        xml_text = str(body.get("xml") or "").strip()
        if not xml_text:
            return self._err("OPML 内容为空")
        try:
            res = STATE.news.store.import_opml(xml_text)
            return self._json({"ok": True, **res, "feeds": STATE.news.store.list_feeds()})
        except Exception as e:
            return self._err(f"OPML 解析失败: {e}")

    def _news_items(self, qs: dict) -> None:
        lang = (qs.get("lang") or [""])[0]
        category = (qs.get("category") or [""])[0]
        feed_id = (qs.get("feed_id") or [""])[0]
        q_str = (qs.get("q") or [""])[0]
        starred = (qs.get("starred") or ["0"])[0] in ("1", "true", "yes")
        unread_only = (qs.get("unread") or ["0"])[0] in ("1", "true", "yes")
        sentiment = (qs.get("sentiment") or [""])[0]
        entity = (qs.get("entity") or [""])[0]
        try:
            hours = int((qs.get("hours") or ["0"])[0] or 0)
        except ValueError:
            hours = 0
        try:
            min_impact = int((qs.get("min_impact") or ["0"])[0] or 0)
        except ValueError:
            min_impact = 0
        try:
            limit = int((qs.get("limit") or ["40"])[0] or 40)
        except ValueError:
            limit = 40
        try:
            offset = int((qs.get("offset") or ["0"])[0] or 0)
        except ValueError:
            offset = 0
        include_dups = (qs.get("include_dups") or ["0"])[0] in ("1", "true", "yes")
        res = STATE.news.query_items_fast(
            lang=lang,
            category=category,
            feed_id=feed_id,
            q=q_str,
            starred=starred,
            unread_only=unread_only,
            sentiment=sentiment,
            min_impact=min_impact,
            hours=hours,
            entity=entity,
            canonical_only=not include_dups,
            limit=limit,
            offset=offset,
        )
        return self._json({"ok": True, **res})

    def _news_item_detail(self, raw_id: str) -> None:
        try:
            iid = int(raw_id)
        except ValueError:
            return self._err("无效新闻 ID")
        item = STATE.news.store.get_item(iid)
        if not item:
            return self._err("未找到该新闻", 404)
        STATE.news.store.mark_read(iid)
        return self._json({"ok": True, "item": item})

    def _news_fetch(self) -> None:
        body = self._body()
        fid = str(body.get("feed_id") or "").strip()
        res = STATE.news.fetch_all(feed_id=fid)
        if res.get("ok") and not res.get("busy"):
            STATE.news.wake()
        return self._json({"ok": True, **res})

    def _news_translate_pending(self) -> None:
        body = self._body()
        try:
            limit = int(body.get("limit") or 24)
        except (TypeError, ValueError):
            limit = 24
        res = STATE.news.translate_pending(limit=max(1, min(80, limit)))
        return self._json(res)

    def _news_translate_one(self) -> None:
        body = self._body()
        try:
            iid = int(body.get("id") or 0)
        except (TypeError, ValueError):
            return self._err("无效新闻 ID")
        fetch_full = bool(body.get("fetch_full"))
        try:
            res = STATE.news.translate_item_full(iid, fetch_full=fetch_full)
            return self._json(res)
        except Exception as e:
            return self._err(str(e))

    def _news_star(self) -> None:
        body = self._body()
        try:
            iid = int(body.get("id") or 0)
        except (TypeError, ValueError):
            return self._err("无效新闻 ID")
        starred = body.get("starred")
        val = STATE.news.store.toggle_star(iid, None if starred is None else bool(starred))
        return self._json({"ok": True, "id": iid, "starred": val})

    def _news_search(self, qs: dict) -> None:
        q_str = (qs.get("q") or [""])[0]
        lang = (qs.get("lang") or [""])[0]
        category = (qs.get("category") or [""])[0]
        try:
            hours = int((qs.get("hours") or ["0"])[0] or 0)
        except ValueError:
            hours = 0
        try:
            limit = int((qs.get("limit") or ["24"])[0] or 24)
        except ValueError:
            limit = 24
        res = STATE.news.semantic_search(q_str, limit=limit, lang=lang, category=category, hours=hours)
        return self._json(res)

    def _news_entities(self, qs: dict) -> None:
        etype = (qs.get("type") or [""])[0]
        q_str = (qs.get("q") or [""])[0]
        try:
            hours = int((qs.get("hours") or ["168"])[0] or 168)
        except ValueError:
            hours = 168
        try:
            limit = int((qs.get("limit") or ["40"])[0] or 40)
        except ValueError:
            limit = 40
        items = STATE.news.store.list_entities(hours=hours, entity_type=etype, q=q_str, limit=limit)
        return self._json({"ok": True, "entities": items})

    def _news_entity_profile(self, qs: dict) -> None:
        name = (qs.get("name") or qs.get("id") or [""])[0]
        try:
            hours = int((qs.get("hours") or ["168"])[0] or 168)
        except ValueError:
            hours = 168
        prof = STATE.news.store.entity_profile(name, hours=hours)
        if not prof:
            return self._err("未找到该实体", 404)
        return self._json({"ok": True, "profile": prof})

    def _news_entity_graph(self, qs: dict) -> None:
        try:
            hours = int((qs.get("hours") or ["168"])[0] or 168)
        except ValueError:
            hours = 168
        try:
            limit = int((qs.get("limit") or ["36"])[0] or 36)
        except ValueError:
            limit = 36
        return self._json({"ok": True, **STATE.news.store.entity_graph(hours=hours, max_nodes=limit)})

    def _news_embed(self) -> None:
        body = self._body()
        try:
            limit = int(body.get("limit") or 256)
        except (TypeError, ValueError):
            limit = 256
        return self._json(STATE.news.embed_pending(limit=limit))

    def _news_reindex(self) -> None:
        try:
            return self._json(STATE.news.rebuild_and_dedup_all())
        except Exception as e:
            return self._err(str(e))

    def _news_mark_all_read(self) -> None:
        n = STATE.news.store.mark_all_read()
        return self._json({"ok": True, "marked": n})

    def _news_brief(self) -> None:
        body = self._body()
        try:
            hours = int(body.get("hours") or 24)
        except (TypeError, ValueError):
            hours = 24
        force = bool(body.get("force"))
        try:
            return self._json(STATE.news.generate_brief(hours=hours, force=force))
        except Exception as e:
            return self._err(str(e))

    def _dashboard_layout_get(self) -> None:
        saved = STATE.config.data.get("dashboard_layout")
        default_layout = news_mod.DEFAULT_DASHBOARD_LAYOUT
        layout, changed = news_mod.migrate_dashboard_layout(saved)
        if changed and isinstance(saved, dict):
            STATE.config.data["dashboard_layout"] = layout
            STATE.config.save()
        return self._json({"ok": True, "layout": layout, "default": default_layout})

    def _dashboard_layout_save(self) -> None:
        body = self._body()
        if body.get("reset"):
            STATE.config.data["dashboard_layout"] = None
            STATE.config.save()
            return self._json({"ok": True, "layout": news_mod.DEFAULT_DASHBOARD_LAYOUT})
        layout = body.get("layout")
        if not isinstance(layout, dict) or not isinstance(layout.get("workspaces"), list):
            return self._err("无效的看板布局")
        STATE.config.data["dashboard_layout"] = layout
        STATE.config.save()
        return self._json({"ok": True, "layout": layout})

    def _market_layout_get(self) -> None:
        saved = STATE.config.data.get("market_layout")
        default_layout = market_mod.DEFAULT_MARKET_LAYOUT
        layout, changed = market_mod.migrate_market_layout(saved)
        if changed and isinstance(saved, dict):
            STATE.config.data["market_layout"] = layout
            STATE.config.save()
        return self._json({"ok": True, "layout": layout, "default": default_layout})

    def _market_layout_save(self) -> None:
        body = self._body()
        if body.get("reset"):
            STATE.config.data["market_layout"] = None
            STATE.config.save()
            return self._json({"ok": True, "layout": market_mod.DEFAULT_MARKET_LAYOUT})
        layout = body.get("layout")
        if not isinstance(layout, dict) or not isinstance(layout.get("workspaces"), list):
            return self._err("无效的行情布局")
        STATE.config.data["market_layout"] = layout
        STATE.config.save()
        return self._json({"ok": True, "layout": layout})

    def _market_overview(self, qs: dict) -> None:
        force = (qs.get("force") or ["0"])[0] in ("1", "true", "yes")
        try:
            return self._json(STATE.market.overview(force=force))
        except Exception as e:
            return self._err(str(e))

    def _market_kline(self, qs: dict) -> None:
        secid = (qs.get("secid") or [""])[0]
        interval = (qs.get("interval") or ["1d"])[0]
        name = (qs.get("name") or [""])[0]
        force = (qs.get("force") or ["0"])[0] in ("1", "true", "yes")
        try:
            limit = int((qs.get("limit") or ["160"])[0] or 160)
        except ValueError:
            limit = 160
        try:
            return self._json(STATE.market.kline(secid, interval=interval, limit=limit, name=name, force=force))
        except Exception as e:
            return self._err(str(e))

    def _market_sectors(self, qs: dict) -> None:
        force = (qs.get("force") or ["0"])[0] in ("1", "true", "yes")
        try:
            limit = int((qs.get("limit") or ["36"])[0] or 36)
        except ValueError:
            limit = 36
        try:
            return self._json(STATE.market.sectors(limit=limit, force=force))
        except Exception as e:
            return self._err(str(e))

    def _market_movers(self, qs: dict) -> None:
        force = (qs.get("force") or ["0"])[0] in ("1", "true", "yes")
        try:
            limit = int((qs.get("limit") or ["15"])[0] or 15)
        except ValueError:
            limit = 15
        try:
            return self._json(STATE.market.movers(limit=limit, force=force))
        except Exception as e:
            return self._err(str(e))

    def _market_macro(self, qs: dict) -> None:
        force = (qs.get("force") or ["0"])[0] in ("1", "true", "yes")
        try:
            return self._json(STATE.market.macro(force=force))
        except Exception as e:
            return self._err(str(e))

    def _market_geopolitics(self, qs: dict) -> None:
        force = (qs.get("force") or ["0"])[0] in ("1", "true", "yes")
        try:
            return self._json(STATE.market.geopolitics(force=force))
        except Exception as e:
            return self._err(str(e))

    def _market_search(self, qs: dict) -> None:
        q_str = (qs.get("q") or [""])[0]
        try:
            return self._json(STATE.market.search_symbols(q_str))
        except Exception as e:
            return self._err(str(e))

    def _market_watchlist_get(self) -> None:
        return self._json({"ok": True, "items": STATE.market.store.list_watchlist()})

    def _market_watchlist_post(self) -> None:
        body = self._body()
        act = str(body.get("action") or "add").strip().lower()
        secid = str(body.get("secid") or "").strip()
        try:
            if act == "remove":
                items = STATE.market.store.remove_watchlist(secid)
            elif act == "pin":
                items = STATE.market.store.pin_watchlist(secid)
            else:
                items = STATE.market.store.add_watchlist(
                    secid,
                    str(body.get("symbol") or secid),
                    str(body.get("name") or secid),
                    str(body.get("market_group") or "custom"),
                )
            return self._json({"ok": True, "items": items})
        except Exception as e:
            return self._err(str(e))

    def _market_test_proxy(self) -> None:
        body = self._body()
        proxy_override = body.get("proxy")
        try:
            return self._json(STATE.market.test_proxy(proxy_override))
        except Exception as e:
            return self._err(str(e))

    def _market_quant(self, qs: dict) -> None:
        act = (qs.get("action") or ["barcode"])[0]
        try:
            return self._json(STATE.market.quant_analytics(act, qs))
        except Exception as e:
            return self._err(str(e))

    def _quant_status(self, qs: dict) -> None:
        force = (qs.get("force") or ["0"])[0] in ("1", "true", "yes")
        try:
            return self._json(STATE.quant.status(force=force))
        except Exception as e:
            return self._err(str(e))

    def _quant_factors(self) -> None:
        try:
            return self._json(STATE.quant.factor_catalog())
        except Exception as e:
            return self._err(str(e))

    def _quant_jobs(self, qs: dict) -> None:
        jtype = (qs.get("type") or [""])[0].strip()
        try:
            lim = int((qs.get("limit") or ["40"])[0] or 40)
        except ValueError:
            lim = 40
        try:
            return self._json({"ok": True, "items": STATE.quant.list_jobs(job_type=jtype, limit=lim)})
        except Exception as e:
            return self._err(str(e))

    def _quant_job_detail(self, job_id: str) -> None:
        try:
            job = STATE.quant.get_job(job_id.strip())
            if not job:
                return self._err("未找到该回测/因子任务", 404)
            return self._json({"ok": True, "job": job})
        except Exception as e:
            return self._err(str(e))

    def _quant_sync(self) -> None:
        body = self._body()
        scopes = body.get("scopes")
        if isinstance(scopes, list) and scopes:
            sc_lbl = "+".join(str(x) for x in scopes[:4]) + ("…" if len(scopes) > 4 else "")
        else:
            sc_lbl = str(body.get("scope") or "standard").strip()
        rng_lbl = (
            f"{body.get('start_date')}~{body.get('end_date') or '今'}"
            if body.get("start_date")
            else f"{body.get('years') or 3}年"
        )
        title = str(body.get("title") or f"数据同步 · {sc_lbl} ({rng_lbl})")
        try:
            return self._json(STATE.quant.submit_job("sync_data", title, "O2 Unified DB", body))
        except Exception as e:
            return self._err(str(e))

    def _quant_sync_stop(self) -> None:
        body = self._body()
        jid = str(body.get("job_id") or "").strip()
        try:
            return self._json(STATE.quant.stop_sync(jid))
        except Exception as e:
            return self._err(str(e))

    def _quant_sync_active(self) -> None:
        try:
            return self._json({
                "ok": True,
                "job": STATE.quant.get_active_sync(),
                "resumable": STATE.quant._get_resumable_sync(),
            })
        except Exception as e:
            return self._err(str(e))

    def _quant_factor_eval(self) -> None:
        body = self._body()
        fid = str(body.get("factor_id") or "wq_alpha006").strip()
        cexpr = str(body.get("custom_expr") or "").strip()
        uni = str(body.get("universe") or "hs300").strip()
        title = str(body.get("title") or f"因子体检 · {cexpr[:28] if cexpr else fid} ({uni})")
        try:
            return self._json(STATE.quant.submit_job("factor_eval", title, "Alphalens", body))
        except Exception as e:
            return self._err(str(e))

    def _quant_backtest(self) -> None:
        body = self._body()
        engine = str(body.get("engine") or "vectorbt").strip().lower()
        strat = str(body.get("strategy") or "dual_ma").strip()
        target = str(body.get("symbol") or body.get("universe") or "hs300").strip()
        title = str(body.get("title") or f"{'Qlib多因子' if engine == 'qlib' else 'VectorBT'} · {strat} ({target})")
        try:
            return self._json(STATE.quant.submit_job("backtest", title, engine, body))
        except Exception as e:
            return self._err(str(e))

    def _quant_job_delete(self) -> None:
        body = self._body()
        jid = str(body.get("id") or "").strip()
        if not jid:
            return self._err("缺少任务 id")
        try:
            ok = STATE.quant.delete_job(jid)
            return self._json({"ok": True, "deleted": ok})
        except Exception as e:
            return self._err(str(e))

    def _quant_leaderboard(self, qs: dict) -> None:
        uni = (qs.get("universe") or ["hs300"])[0].strip()
        try:
            return self._json(STATE.quant.get_leaderboard(uni))
        except Exception as e:
            return self._err(str(e))

    def _quant_symbols(self) -> None:
        try:
            return self._json(STATE.quant.store_symbols())
        except Exception as e:
            return self._err(str(e))

    def _quant_sweep(self) -> None:
        body = self._body()
        strat = str(body.get("strategy") or "dual_ma").strip()
        tgt = str(body.get("symbol") or body.get("universe") or "").strip()
        title = f"参数热力扫描 · {strat} ({tgt})"
        try:
            return self._json(STATE.quant.submit_job("param_sweep", title, "VectorBT Sweep", body))
        except Exception as e:
            return self._err(str(e))

    def _quant_factor_batch(self) -> None:
        body = self._body()
        fam = str(body.get("family") or "Alpha158").strip()
        uni = str(body.get("universe") or "hs300").strip()
        title = f"批量因子体检 · {fam} ({uni})"
        try:
            return self._json(STATE.quant.submit_job("factor_batch", title, "Batch Screen", body))
        except Exception as e:
            return self._err(str(e))

    def _quant_factor_corr(self) -> None:
        body = self._body()
        try:
            return self._json(STATE.quant.factor_corr(body))
        except Exception as e:
            return self._err(str(e))

    def _widgets_list(self) -> None:
        return self._json({"ok": True, "items": STATE.widgets.list_items()})

    def _widgets_save(self) -> None:
        body = self._body()
        if not isinstance(body, dict):
            return self._err("无效的模块参数")
        try:
            item = STATE.widgets.save_item(body)
            return self._json({"ok": True, "item": item})
        except Exception as e:
            return self._err(str(e))

    def _widgets_delete(self) -> None:
        body = self._body()
        wid = str(body.get("id") or "").strip()
        if not wid:
            return self._err("缺少模块 id")
        removed = STATE.widgets.delete_item(wid)
        return self._json({"ok": True, "removed": removed})

    def _widgets_topic_board(self) -> None:
        body = self._body()
        ws_name = str(body.get("workspace_name") or body.get("title") or "AI 专题看板").strip()
        b_widgets = body.get("board_widgets") or []
        if not isinstance(b_widgets, list) or not b_widgets:
            return self._err("缺少模块列表")
        try:
            res = widget_mod.materialize_topic_board(STATE.config, ws_name, b_widgets, STATE.widgets)
            return self._json({"ok": True, **res})
        except Exception as e:
            return self._err(str(e))


def _alert(msg: str) -> None:
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, APP_TITLE, 0x10)
    except Exception:
        print(msg)


class QuietHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"

    def server_bind(self) -> None:
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            try:
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            except OSError:
                pass
        super().server_bind()

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
            proc = subprocess.Popen(
                [electron_exe, desk_dir, f"--app-url={url}"],
                cwd=desk_dir,
                env=env,
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
