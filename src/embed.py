from __future__ import annotations

import json
import math
import sqlite3
import struct
import threading
import time
import urllib.error
import urllib.request
import providers as prov_mod

PROTOCOLS = [
    {"id": "openai", "label": "OpenAI 兼容 (v1/embeddings)"},
    {"id": "dashscope", "label": "通义千问 DashScope 原生"},
]
PROTOCOL_IDS = {p["id"] for p in PROTOCOLS}

PRESETS = {
    "qwen": {
        "name": "千问 AI",
        "protocol": "openai",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": [
            {"id": "text-embedding-v4", "label": "text-embedding-v4"},
            {"id": "text-embedding-v3", "label": "text-embedding-v3"},
            {"id": "text-embedding-v2", "label": "text-embedding-v2"},
        ],
    },
    "siliconflow": {
        "name": "硅基流动",
        "protocol": "openai",
        "base_url": "https://api.siliconflow.cn/v1",
        "models": [
            {"id": "BAAI/bge-m3", "label": "BGE-M3"},
            {"id": "BAAI/bge-large-zh-v1.5", "label": "BGE Large 中文"},
            {"id": "Qwen/Qwen3-Embedding-8B", "label": "Qwen3 Embedding 8B"},
            {"id": "Qwen/Qwen3-Embedding-4B", "label": "Qwen3 Embedding 4B"},
        ],
    },
    "openrouter": {
        "name": "OpenRouter",
        "protocol": "openai",
        "base_url": "https://openrouter.ai/api/v1",
        "models": [
            {"id": "openai/text-embedding-3-small", "label": "OpenAI Embedding 3 Small"},
            {"id": "openai/text-embedding-3-large", "label": "OpenAI Embedding 3 Large"},
            {"id": "qwen/qwen3-embedding-8b", "label": "Qwen3 Embedding 8B"},
        ],
    },
}

BATCH = 16
MAX_CHARS = 4000
SCHEMA = """
CREATE TABLE IF NOT EXISTS chunk_emb (
    chunk_id    INTEGER PRIMARY KEY,
    dim         INTEGER NOT NULL,
    vec         BLOB NOT NULL,
    model       TEXT,
    provider_id TEXT
);
"""

_job_lock = threading.Lock()
_job_stop = threading.Event()
_job_thread: threading.Thread | None = None
_job_error = ""
_job_done = 0
_job_total = 0


def protocol_of(raw) -> str:
    s = str(raw or "").strip().lower()
    if s in ("openai-compatible", "openai_compatible", "openai", "chat"):
        return "openai"
    if s in ("dashscope", "qwen", "tongyi", "aliyun"):
        return "dashscope"
    return s if s in PROTOCOL_IDS else "openai"


def embeddings_url(base_url: str, protocol: str) -> str:
    base = (base_url or "").rstrip("/")
    proto = protocol_of(protocol)
    if proto == "dashscope":
        if "text-embedding" in base:
            return base
        if base.endswith("/api/v1"):
            return base + "/services/embeddings/text-embedding/text-embedding"
        return "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding"
    for suf in ("/embeddings", "/chat/completions", "/messages"):
        if base.endswith(suf):
            return base[: -len(suf)] + "/embeddings" if suf != "/embeddings" else base
    return base + "/embeddings"


def models_list_base(base_url: str, protocol: str) -> str:
    proto = protocol_of(protocol)
    base = (base_url or "").rstrip("/")
    if proto == "dashscope" or "dashscope.aliyuncs.com" in base.lower():
        if "compatible-mode" in base:
            return base
        return "https://dashscope.aliyuncs.com/compatible-mode/v1"
    return base


def is_embed_model(mid: str) -> bool:
    s = (mid or "").lower()
    return any(k in s for k in ("embed", "bge", "gte-", "e5-", "jina-clip", "jina-embeddings"))


def fetch_remote_models(base_url: str, protocol: str, api_key: str) -> list[dict]:
    raw = prov_mod.fetch_remote_models(models_list_base(base_url, protocol), "openai", api_key)
    return [m for m in raw if is_embed_model(m.get("id") or "")]


def make_preset(preset_id: str, channel_id: str | None = None) -> dict:
    spec = PRESETS[preset_id]
    return {
        "id": channel_id or preset_id,
        "name": spec["name"],
        "preset": preset_id,
        "protocol": spec["protocol"],
        "base_url": spec["base_url"],
        "api_key": "",
        "url_custom": False,
        "models": [dict(m) for m in spec["models"]],
    }


def make_custom(name: str = "", protocol: str = "openai", base_url: str = "") -> dict:
    proto = protocol_of(protocol)
    url = (base_url or "").strip()
    if not url and proto == "dashscope":
        url = "https://dashscope.aliyuncs.com/api/v1"
    return {
        "id": prov_mod.new_id("e"),
        "name": (name or "自定义").strip() or "自定义",
        "preset": "",
        "protocol": proto,
        "base_url": url,
        "api_key": "",
        "url_custom": bool(url),
        "models": [],
    }


def _normalize_channel(p: dict) -> dict | None:
    cid = str(p.get("id") or "").strip() or prov_mod.new_id("e")
    preset = str(p.get("preset") or "").strip()
    if preset not in PRESETS:
        preset = ""
    spec = PRESETS.get(preset) or {}
    name = str(p.get("name") or spec.get("name") or "自定义").strip()
    proto = protocol_of(p.get("protocol") or spec.get("protocol"))
    url = str(p.get("base_url") or "").strip().rstrip("/")
    url_custom = bool(p.get("url_custom"))
    if preset and not url:
        url = spec.get("base_url") or ""
    models = prov_mod._models_of(p.get("models"))
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


def migrate(data: dict) -> dict:
    providers = data.get("embed_providers")
    if not isinstance(providers, list) or not providers:
        data["embed_providers"] = [
            make_preset("qwen"),
            make_preset("siliconflow"),
            make_preset("openrouter"),
        ]
    else:
        data["embed_providers"] = [_normalize_channel(p) for p in providers if isinstance(p, dict)]
        data["embed_providers"] = [p for p in data["embed_providers"] if p]
    if not data.get("embed_provider_id") and data["embed_providers"]:
        data["embed_provider_id"] = data["embed_providers"][0]["id"]
    data["embed_use"] = bool(data.get("embed_use"))
    data["embed_running"] = bool(data.get("embed_running"))
    if not str(data.get("embed_model") or "").strip():
        ch = find(data, data.get("embed_provider_id"))
        models = (ch or {}).get("models") or []
        if models:
            data["embed_model"] = models[0]["id"]
    return data


def find(data: dict, provider_id: str | None) -> dict | None:
    pid = (provider_id or "").strip() or str(data.get("embed_provider_id") or "").strip()
    providers = data.get("embed_providers") or []
    for p in providers:
        if p.get("id") == pid:
            return p
    return providers[0] if providers else None


def resolve(data: dict) -> dict | None:
    migrate(data)
    ch = find(data, data.get("embed_provider_id"))
    if not ch:
        return None
    mid = str(data.get("embed_model") or "").strip()
    models = ch.get("models") or []
    if mid and not any(m.get("id") == mid for m in models):
        for p in data.get("embed_providers") or []:
            if any(m.get("id") == mid for m in (p.get("models") or [])):
                ch = p
                models = p.get("models") or []
                break
    if not mid:
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


def any_key(data: dict) -> bool:
    migrate(data)
    return any((p.get("api_key") or "").strip() for p in (data.get("embed_providers") or []))


def merge_save(data: dict, body: dict) -> None:
    migrate(data)
    if "embed_provider_id" in body and body["embed_provider_id"] not in (None, ""):
        data["embed_provider_id"] = str(body["embed_provider_id"]).strip()
    if "embed_model" in body and body["embed_model"] not in (None, ""):
        data["embed_model"] = str(body["embed_model"]).strip()
    if "embed_use" in body:
        data["embed_use"] = bool(body["embed_use"])
    raw = body.get("embed_providers")
    if not isinstance(raw, list):
        return
    old = {p["id"]: p for p in data.get("embed_providers") or [] if p.get("id")}
    out = []
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        cid = str(item.get("id") or "").strip() or prov_mod.new_id("e")
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
    data["embed_providers"] = out
    if data.get("embed_provider_id") not in {p["id"] for p in out} and out:
        data["embed_provider_id"] = out[0]["id"]


def extra_headers(base_url: str, protocol: str, api_key: str) -> dict:
    h = {"User-Agent": prov_mod.USER_AGENT}
    proto = protocol_of(protocol)
    if proto == "dashscope":
        h["Authorization"] = f"Bearer {api_key}"
    else:
        h["Authorization"] = f"Bearer {api_key}"
    if "openrouter.ai" in (base_url or "").lower():
        h["HTTP-Referer"] = "http://127.0.0.1"
        h["X-Title"] = "O2"
    return h


def pack_vec(vec: list[float]) -> bytes:
    return struct.pack(f"<{len(vec)}f", *[float(x) for x in vec])


def unpack_vec(blob: bytes) -> list[float]:
    n = len(blob) // 4
    if n <= 0:
        return []
    return list(struct.unpack(f"<{n}f", blob[: n * 4]))


def cosine(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    if n <= 0:
        return 0.0
    s = 0.0
    na = 0.0
    nb = 0.0
    for i in range(n):
        x = a[i]
        y = b[i]
        s += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return 0.0
    return s / math.sqrt(na * nb)


def ensure_schema(con) -> None:
    con.executescript(SCHEMA)
    try:
        con.execute("CREATE INDEX IF NOT EXISTS idx_chunk_emb_prov ON chunk_emb(provider_id, model)")
    except Exception:
        pass
    con.commit()


def counts(con, provider_id: str = "", model: str = "") -> dict:
    try:
        total = con.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    except Exception:
        total = 0
    try:
        if provider_id and model:
            embedded = con.execute(
                "SELECT COUNT(*) FROM chunk_emb WHERE model=? AND provider_id=?",
                (model, provider_id),
            ).fetchone()[0]
        else:
            embedded = con.execute("SELECT COUNT(*) FROM chunk_emb").fetchone()[0]
    except Exception:
        embedded = 0
    return {"total": int(total or 0), "embedded": int(embedded or 0)}


def _clip(text: str) -> str:
    s = (text or "").strip()
    if len(s) <= MAX_CHARS:
        return s
    return s[:MAX_CHARS]


def _parse_openai_emb(obj: dict) -> list[list[float]]:
    rows = obj.get("data") or []
    out: list[list[float] | None] = [None] * len(rows)
    for item in rows:
        if not isinstance(item, dict):
            continue
        idx = item.get("index")
        vec = item.get("embedding") or item.get("vector")
        if not isinstance(vec, list):
            continue
        nums = [float(x) for x in vec]
        if isinstance(idx, int) and 0 <= idx < len(out):
            out[idx] = nums
        else:
            out.append(nums)
    return [v or [] for v in out]


def _parse_dashscope_emb(obj: dict) -> list[list[float]]:
    output = obj.get("output") or obj
    rows = output.get("embeddings") or output.get("data") or []
    parsed: list[tuple[int, list[float]]] = []
    for i, item in enumerate(rows):
        if not isinstance(item, dict):
            continue
        vec = item.get("embedding") or item.get("vector")
        if not isinstance(vec, list):
            continue
        idx = item.get("text_index", i)
        parsed.append((int(idx) if isinstance(idx, int) else i, [float(x) for x in vec]))
    parsed.sort()
    return [v for _, v in parsed]


def embed_texts(ch: dict, texts: list[str], *, query: bool = False) -> list[list[float]]:
    clipped = [_clip(t) or " " for t in texts]
    proto = protocol_of(ch.get("protocol"))
    key = ch.get("api_key") or ""
    model = ch.get("model") or ""
    url = embeddings_url(ch.get("base_url") or "", proto)
    headers = extra_headers(ch.get("base_url") or "", proto, key)
    headers["Content-Type"] = "application/json"
    headers["Accept"] = "application/json"
    if proto == "dashscope":
        payload = {
            "model": model,
            "input": {"texts": clipped},
            "parameters": {"text_type": "query" if query else "document"},
        }
    else:
        payload = {"model": model, "input": clipped}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with prov_mod.urlopen(req, timeout=90, stream=False) as resp:
        raw = resp.read()
    obj = json.loads(raw.decode("utf-8", "replace") or "{}")
    if proto == "dashscope":
        vecs = _parse_dashscope_emb(obj if isinstance(obj, dict) else {})
    else:
        vecs = _parse_openai_emb(obj if isinstance(obj, dict) else {})
    if len(vecs) < len(clipped):
        vecs.extend([] for _ in range(len(clipped) - len(vecs)))
    return vecs[: len(clipped)]


def pending_rows(con, provider_id: str, model: str, doc_id: int | None = None) -> list[tuple]:
    sql = """
        SELECT ch.id, ch.text
          FROM chunks ch
          LEFT JOIN chunk_emb e ON e.chunk_id = ch.id
         WHERE (e.chunk_id IS NULL OR IFNULL(e.model,'') != ? OR IFNULL(e.provider_id,'') != ?)
    """
    args: list = [model, provider_id]
    if doc_id:
        sql += " AND ch.doc_id = ?"
        args.append(doc_id)
    return con.execute(sql, args).fetchall()


def upsert_vecs(con, rows: list[tuple], vecs: list[list[float]], provider_id: str, model: str) -> int:
    n = 0
    for (cid, _text), vec in zip(rows, vecs):
        if not vec:
            continue
        con.execute(
            """INSERT INTO chunk_emb(chunk_id, dim, vec, model, provider_id)
               VALUES(?,?,?,?,?)
               ON CONFLICT(chunk_id) DO UPDATE SET
                 dim=excluded.dim, vec=excluded.vec, model=excluded.model,
                 provider_id=excluded.provider_id""",
            (int(cid), len(vec), pack_vec(vec), model, provider_id),
        )
        n += 1
    return n


def embed_document(cfg, db_path: str, doc_id: int) -> int:
    ch = resolve(cfg.data)
    if not ch or not ch.get("api_key") or not ch.get("model"):
        return 0
    con = sqlite3.connect(db_path, timeout=30)
    try:
        ensure_schema(con)
        pending = pending_rows(con, ch["id"], ch["model"], doc_id)
        wrote = 0
        for i in range(0, len(pending), BATCH):
            batch = pending[i:i + BATCH]
            vecs = embed_texts(ch, [r[1] for r in batch], query=False)
            wrote += upsert_vecs(con, batch, vecs, ch["id"], ch["model"])
            con.commit()
        return wrote
    finally:
        con.close()


def purge_chunks(con, chunk_ids: list[int]) -> None:
    if not chunk_ids:
        return
    try:
        con.executemany("DELETE FROM chunk_emb WHERE chunk_id=?", [(i,) for i in chunk_ids])
    except Exception:
        pass


def job_active() -> bool:
    t = _job_thread
    return bool(t and t.is_alive())


def status(cfg, con) -> dict:
    migrate(cfg.data)
    ch = resolve(cfg.data)
    c = counts(con, (ch or {}).get("id") or "", (ch or {}).get("model") or "")
    return {
        "ok": True,
        "use": bool(cfg.data.get("embed_use")),
        "running": bool(cfg.data.get("embed_running")),
        "job": job_active(),
        "total": c["total"],
        "embedded": c["embedded"],
        "pending": max(0, c["total"] - c["embedded"]),
        "model": (ch or {}).get("model") or "",
        "provider": (ch or {}).get("name") or "",
        "provider_id": (ch or {}).get("id") or "",
        "error": _job_error,
        "progress": {"done": _job_done, "total": _job_total},
        "ready": bool(ch and ch.get("api_key") and ch.get("model")),
    }


def start(cfg, db_path: str) -> dict:
    ch = resolve(cfg.data)
    if not ch or not ch.get("api_key"):
        raise ValueError("请先为 Embedding 渠道填入 API Key")
    if not ch.get("model"):
        raise ValueError("请先选择 Embedding 模型")
    cfg.data["embed_running"] = True
    cfg.save()
    start_job(cfg, db_path)
    return {"ok": True, "running": True}


def stop(cfg) -> dict:
    cfg.data["embed_running"] = False
    cfg.save()
    _job_stop.set()
    return {"ok": True, "running": False}


def start_job(cfg, db_path: str) -> None:
    global _job_thread
    with _job_lock:
        if job_active():
            return
        _job_stop.clear()
        t = threading.Thread(target=_run_job, args=(cfg, db_path), daemon=True)
        _job_thread = t
        t.start()


def _run_job(cfg, db_path: str) -> None:
    global _job_error, _job_done, _job_total
    _job_error = ""
    _job_done = 0
    _job_total = 0
    ch = resolve(cfg.data)
    if not ch or not ch.get("api_key") or not ch.get("model"):
        _job_error = "未配置 Embedding 渠道"
        return
    con = sqlite3.connect(db_path, check_same_thread=False, timeout=30)
    try:
        ensure_schema(con)
        pending = pending_rows(con, ch["id"], ch["model"])
        _job_total = len(pending)
        for i in range(0, len(pending), BATCH):
            if _job_stop.is_set() or not cfg.data.get("embed_running"):
                break
            batch = pending[i:i + BATCH]
            try:
                vecs = embed_texts(ch, [r[1] for r in batch], query=False)
                upsert_vecs(con, batch, vecs, ch["id"], ch["model"])
                con.commit()
            except Exception as e:  # noqa: BLE001
                _job_error = str(e)
                time.sleep(1.2)
                continue
            _job_done = min(_job_total, i + len(batch))
    finally:
        con.close()


def search_vec(con, q: str, cfg, limit: int = 24, dept: str = "",
               status: str = "", category: str = "", doc_id: int | None = None,
               project: str = "", folder: str = "", doc_type: str = "",
               chunk_type: str = "") -> list[dict]:
    if not (q or "").strip():
        return []
    ch = resolve(cfg.data)
    if not ch or not ch.get("api_key") or not ch.get("model"):
        return []
    try:
        qv = embed_texts(ch, [q], query=True)[0]
    except Exception:
        return []
    if not qv:
        return []
    where = ["e.model = ?", "e.provider_id = ?", "d.status <> ?"]
    args: list = [ch["model"], ch["id"], "已废止"]
    if project:
        where.append("d.project = ?")
        args.append(project)
    if folder:
        where.append("(d.folder = ? OR d.folder LIKE ?)")
        args.extend([folder, f"{folder}/%"])
    if dept:
        where.append("(d.dept = ? OR d.folder = ? OR d.project = ?)")
        args.extend([dept, dept, dept])
    if doc_type:
        where.append("d.doc_type = ?")
        args.append(doc_type)
    if chunk_type:
        where.append("IFNULL(ch.chunk_type, 'text') = ?")
        args.append(chunk_type)
    if status and status != "已废止":
        where.append("d.status = ?")
        args.append(status)
    if category:
        where.append("d.category = ?")
        args.append(category)
    if doc_id:
        where.append("d.id = ?")
        args.append(doc_id)
    sql = f"""
        SELECT ch.id, ch.doc_id, ch.seq, ch.chapter, ch.article, ch.page_start,
               ch.page_end, ch.text, ch.text_norm, d.title, d.doc_no, d.dept,
               d.issued_date, d.status, d.rel_path, d.category, d.n_pages,
               e.vec, e.dim,
               IFNULL(ch.chunk_type, 'text'),
               IFNULL(d.project, '集团制度库'),
               IFNULL(d.folder, ''),
               IFNULL(d.doc_type, 'regulation'),
               IFNULL(d.file_ext, ''),
               IFNULL(d.summary, ''),
               IFNULL(d.meta_json, '{{}}')
          FROM chunk_emb e
          JOIN chunks ch ON ch.id = e.chunk_id
          JOIN docs d ON d.id = ch.doc_id
         WHERE {" AND ".join(where)}
    """
    scored: list[tuple[float, tuple]] = []
    try:
        rows = con.execute(sql, args).fetchall()
    except Exception:
        return []
    for r in rows:
        vec = unpack_vec(r[17])
        if not vec:
            continue
        scored.append((cosine(qv, vec), r))
    scored.sort(key=lambda x: x[0], reverse=True)
    if limit:
        scored = scored[: max(limit, 8)]
    out = []
    for score, r in scored:
        if score <= 0:
            continue
        text = r[7] or ""
        try:
            meta_obj = json.loads(r[25]) if r[25] else {}
        except ValueError:
            meta_obj = {}
        out.append({
            "chunk_id": r[0],
            "doc_id": r[1],
            "seq": r[2],
            "chapter": r[3] or "",
            "article": r[4] or "",
            "page_start": r[5] or 0,
            "page_end": r[6] or 0,
            "snippet": "",
            "text": text,
            "title": r[9] or "",
            "doc_no": r[10] or "",
            "dept": r[11] or "",
            "issued_date": r[12] or "",
            "status": r[13] or "",
            "rel_path": r[14] or "",
            "category": r[15] or "",
            "n_pages": r[16] or 0,
            "chunk_type": r[19] or "text",
            "project": r[20] or "集团制度库",
            "folder": r[21] or "",
            "doc_type": r[22] or "regulation",
            "file_ext": r[23] or "",
            "summary": r[24] or "",
            "meta": meta_obj,
            "score": float(score),
            "_vec": True,
        })
    return out
