from __future__ import annotations

import json
import os
import threading
import time
import urllib.request

import providers as prov_mod

CATALOG_URL = "https://models.dev/api.json"
TTL = 24 * 60 * 60

_lock = threading.Lock()
_data: dict | None = None
_loaded_at = 0.0
_path = ""
_fetching = False


def init(cache_dir: str) -> None:
    global _path
    os.makedirs(cache_dir, exist_ok=True)
    _path = os.path.join(cache_dir, "models_dev.json")
    _load_disk()


def _load_disk() -> None:
    global _data, _loaded_at
    if not _path or not os.path.isfile(_path):
        return
    try:
        with open(_path, encoding="utf-8") as f:
            obj = json.load(f)
        if isinstance(obj, dict) and obj:
            _data = obj
            _loaded_at = os.path.getmtime(_path)
    except (OSError, ValueError):
        pass


def _save_disk(obj: dict) -> None:
    if not _path:
        return
    tmp = _path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)
        os.replace(tmp, _path)
    except OSError:
        try:
            os.remove(tmp)
        except OSError:
            pass


def _stale() -> bool:
    if _data is None:
        return True
    return (time.time() - _loaded_at) > TTL


def refresh(force: bool = False) -> dict:
    global _data, _loaded_at, _fetching
    with _lock:
        if not force and not _stale() and _data is not None:
            return _data
        if _fetching:
            return _data or {}
        _fetching = True
    try:
        req = urllib.request.Request(CATALOG_URL, headers={"User-Agent": prov_mod.USER_AGENT})
        with prov_mod.urlopen(req, timeout=20) as resp:
            obj = json.loads(resp.read().decode("utf-8"))
        if isinstance(obj, dict) and obj:
            with _lock:
                _data = obj
                _loaded_at = time.time()
            _save_disk(obj)
            return obj
    except Exception:
        pass
    finally:
        with _lock:
            _fetching = False
    return _data or {}


def get() -> dict:
    if _data is None:
        _load_disk()
    if _stale():
        threading.Thread(target=refresh, daemon=True).start()
    return _data or {}


def _host_providers(catalog: dict, base_url: str) -> list[str]:
    host = prov_mod.host_of(base_url)
    if not host:
        return []
    hits = []
    for pid, p in catalog.items():
        if not isinstance(p, dict):
            continue
        api = p.get("api") or ""
        h = prov_mod.host_of(api)
        if h and (h == host or host.endswith("." + h) or h.endswith("." + host)):
            hits.append(pid)
    return hits


def _lookup(preset: str, base_url: str, model_id: str) -> tuple[str, dict] | None:
    catalog = get()
    if not catalog or not model_id:
        return None
    mid = model_id.strip()
    short = mid.split("/")[-1]
    preset = prov_mod.canonical_preset(preset)
    order: list[str] = []
    if preset and preset in catalog:
        order.append(preset)
    for pid in _host_providers(catalog, base_url):
        if pid not in order:
            order.append(pid)
    if "/inference/go" in (base_url or "").lower():
        order.sort(key=lambda x: 0 if x == "opencode-go" else 1)
    elif preset == "opencode-go" and "opencode-go" in order:
        order = ["opencode-go"] + [x for x in order if x != "opencode-go"]
    for pid in order:
        models = (catalog.get(pid) or {}).get("models") or {}
        if mid in models:
            return pid, models[mid]
        if short in models:
            return pid, models[short]
    # 不在预设/域名下时，不跨全库乱匹配同名 id
    return None


def _efforts_of(model: dict) -> list[str]:
    raw = model.get("reasoning_options")
    if not isinstance(raw, list):
        return []
    for item in raw:
        if isinstance(item, dict) and item.get("type") == "effort":
            vals = item.get("values") or []
            return [str(v) for v in vals if v]
    return []


def annotate(preset: str = "", base_url: str = "", model_id: str = "") -> dict:
    hit = _lookup(preset or "", base_url or "", model_id or "")
    if not hit:
        return {
            "label": model_id,
            "context": None,
            "context_label": "",
            "reasoning": None,
            "efforts": [],
            "inputs": [],
            "image": False,
            "attachment": False,
        }
    _pid, m = hit
    lim = m.get("limit") or {}
    ctx = lim.get("context") if isinstance(lim, dict) else None
    try:
        ctx = int(ctx) if ctx is not None else None
    except (TypeError, ValueError):
        ctx = None
    reasoning = m.get("reasoning")
    if reasoning is not None:
        reasoning = bool(reasoning)
    name = str(m.get("name") or model_id)
    efforts = prov_mod.effort_options(_efforts_of(m))
    mods = m.get("modalities") if isinstance(m.get("modalities"), dict) else {}
    raw_in = mods.get("input") if isinstance(mods, dict) else None
    inputs = []
    seen = set()
    for x in raw_in or []:
        s = str(x).strip().lower()
        if not s or s in seen:
            continue
        seen.add(s)
        inputs.append(s)
    return {
        "label": name,
        "context": ctx,
        "context_label": prov_mod.format_context(ctx) if ctx else "",
        "reasoning": reasoning,
        "efforts": efforts,
        "inputs": inputs,
        "image": "image" in inputs,
        "attachment": bool(m.get("attachment")) if m.get("attachment") is not None else ("image" in inputs or "pdf" in inputs),
    }


def stamp_models(preset: str, base_url: str, models: list) -> None:
    """把 models.dev 的输入能力写进渠道模型列表。"""
    if not isinstance(models, list):
        return
    for m in models:
        if not isinstance(m, dict) or not m.get("id"):
            continue
        meta = annotate(preset=preset or "", base_url=base_url or "", model_id=m.get("id") or "")
        if meta.get("inputs"):
            m["inputs"] = meta["inputs"]
        if meta.get("label") and (not m.get("label") or m.get("label") == m.get("id")):
            m["label"] = meta["label"]
