"""High-performance native news engine:
- C/C++: xxhash (L1 SimHash), USearch (C++20 SIMD HNSW vectors), curl_cffi (libcurl HTTP/2), lxml (libxml2), trafilatura
- Rust: Tantivy (multilingual BM25 full-text search)
- GPU (CUDA FP16 / CPU fallback): BAAI/bge-m3 (4-language dense embedding) + BAAI/bge-reranker-v2-m3 (cross-encoder rerank)
"""
from __future__ import annotations

import hashlib
import math
import os
import re
import threading
import time
from collections import defaultdict
from typing import Iterable

import jieba
import numpy as np

# Silence noisy jieba startup logs
jieba.setLogLevel(60)

try:
    import xxhash as _xxhash
except ImportError:
    _xxhash = None

try:
    from usearch.index import Index as _USearchIndex
except ImportError:
    _USearchIndex = None

try:
    import tantivy as _tantivy
except ImportError:
    _tantivy = None

try:
    from curl_cffi import requests as _cffi_requests
except ImportError:
    _cffi_requests = None

try:
    import trafilatura as _trafilatura
except ImportError:
    _trafilatura = None

try:
    from lxml import etree as _lxml_etree
except ImportError:
    _lxml_etree = None


_CJK_SPAN_RE = re.compile(r"[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+")
_WORD_RE = re.compile(r"[a-z0-9\u0400-\u04ff]+")
_DIGIT_NORM_RE = re.compile(r"\d+")

# Wire-service rolling update prefixes (Yonhap, Reuters, Bloomberg, TASS, Chinese flashes)
_WIRE_PREFIX_RE = re.compile(
    r"^\s*(?:"
    r"\((?:\d+(?:st|nd|rd|th)\s+LD|LEAD|URGENT|RECAST|CORRECTED|UPDATE\s*\d*)\)\s*"
    r"|(?:UPDATE\s*\d+|BREAKING|URGENT|FLASH|EXCLUSIVE|CORRECTED|WRAPUP\s*\d*)\s*[-:：]\s*"
    r"|【(?:快讯|突发|更新|独家|重磅|财联社|金十数据)[^】]{0,12}】\s*"
    r"|(?:快讯|突发|即时)\s*[|｜:：]\s*"
    r")+",
    re.IGNORECASE,
)

# Detect rolling-update precedence (higher number = newer/fuller wire revision)
_WIRE_LD_NUM_RE = re.compile(r"\((\d+)(?:st|nd|rd|th)\s+LD\)", re.IGNORECASE)
_WIRE_UPDATE_NUM_RE = re.compile(r"\bUPDATE\s*(\d+)\b", re.IGNORECASE)

# Boilerplate/template titles that repeat across different days/batches (must NOT merge on title alone)
_TEMPLATE_TITLE_PATTERNS = (
    re.compile(r"^\d{4}年\d{1,2}月\d{1,2}日.*(?:头条|要闻|早报|晚报|简报|日报|汇市|股市)"),
    re.compile(r"^CISA Adds .+ Known Exploited Vulnerabilit", re.IGNORECASE),
    re.compile(r"^Nominations Sent to the Senate$", re.IGNORECASE),
    re.compile(r"^(?:Daily|Morning|Evening|Weekly)\s+(?:Briefing|Digest|Roundup|Summary)", re.IGNORECASE),
    re.compile(r"^(?:每日|早间|午间|晚间)(?:新闻|快讯|要闻|简报|汇总)"),
)


def capabilities() -> dict:
    cuda_ok = False
    gpu_name = ""
    try:
        import torch
        cuda_ok = bool(torch.cuda.is_available())
        if cuda_ok:
            gpu_name = torch.cuda.get_device_name(0)
    except Exception:
        pass
    return {
        "xxhash": _xxhash is not None,
        "usearch": _USearchIndex is not None,
        "tantivy": _tantivy is not None,
        "curl_cffi": _cffi_requests is not None,
        "trafilatura": _trafilatura is not None,
        "lxml": _lxml_etree is not None,
        "cuda": cuda_ok,
        "gpu": gpu_name,
    }


def strip_wire_prefix(title: str) -> str:
    return _WIRE_PREFIX_RE.sub("", (title or "").strip()).strip()


def wire_revision_bonus(title: str) -> float:
    """Positive score for fuller wire updates (e.g. 4th LD > 2nd LD > LEAD > plain > URGENT)."""
    t = title or ""
    m = _WIRE_LD_NUM_RE.search(t)
    if m:
        return min(14.0, 4.0 + int(m.group(1)) * 2.5)
    m = _WIRE_UPDATE_NUM_RE.search(t)
    if m:
        return min(14.0, 4.0 + int(m.group(1)) * 2.5)
    tu = t.upper()
    if "(LEAD)" in tu or "WRAPUP" in tu:
        return 4.0
    if "(URGENT)" in tu or "FLASH:" in tu or "【快讯】" in t:
        return -8.0
    return 0.0


def is_template_title(title: str) -> bool:
    t = strip_wire_prefix(title)
    return any(p.search(t) for p in _TEMPLATE_TITLE_PATTERNS)


def _hash64(token: str) -> int:
    b = token.encode("utf-8", "ignore")
    if _xxhash is not None:
        return _xxhash.xxh64_intdigest(b)
    return int.from_bytes(hashlib.blake2b(b, digest_size=8).digest(), "big")


def tokenize_multilingual(text: str, *, for_bm25: bool = False) -> list[str]:
    """Tokenize ZH / EN / RU / JA cleanly using Jieba (CJK) + Unicode word tokens."""
    s = (text or "").lower()
    if not s:
        return []
    tokens: list[str] = []
    # Latin / Cyrillic / digits
    for w in _WORD_RE.findall(s):
        if len(w) >= 2 or w.isdigit():
            tokens.append(w)
    # CJK / Japanese / Korean spans
    for span in _CJK_SPAN_RE.findall(s):
        if len(span) <= 2:
            tokens.append(span)
            continue
        if for_bm25:
            # Emit both search-mode jieba words AND overlapping bigrams so JA/ZH substring queries always hit
            seen_span = set()
            for tok in jieba.cut_for_search(span):
                tok = tok.strip()
                if len(tok) >= 2 and tok not in seen_span:
                    seen_span.add(tok)
                    tokens.append(tok)
            for i in range(len(span) - 1):
                bg = span[i : i + 2]
                if bg not in seen_span:
                    seen_span.add(bg)
                    tokens.append(bg)
        else:
            # For SimHash: overlapping bigrams are fast, deterministic, and language-agnostic for ZH/JA
            for i in range(len(span) - 1):
                tokens.append(span[i : i + 2])
    return tokens


def content_simhash(title: str, summary: str = "") -> str:
    """64-bit SimHash over cleaned title (2x weight) + lead summary (1x weight), C-accelerated via xxhash."""
    clean_title = strip_wire_prefix(title)
    lead = (summary or "").strip()
    # Avoid duplicating title if RSS summary just repeats title verbatim
    if lead.lower().startswith(clean_title.lower()):
        lead = lead[len(clean_title) :].strip()
    lead = lead[:200]

    title_toks = tokenize_multilingual(clean_title, for_bm25=False)
    body_toks = tokenize_multilingual(lead, for_bm25=False) if lead else []
    if not title_toks and not body_toks:
        return "0" * 16

    v = [0] * 64
    for tok in title_toks:
        h = _hash64(tok)
        for i in range(64):
            v[i] += 2 if ((h >> i) & 1) else -2
    for tok in body_toks:
        h = _hash64(tok)
        for i in range(64):
            v[i] += 1 if ((h >> i) & 1) else -1

    out = 0
    for i in range(64):
        if v[i] > 0:
            out |= 1 << i
    return f"{out:016x}"


def hamming_hex(a: str, b: str) -> int:
    try:
        return (int(a, 16) ^ int(b, 16)).bit_count()
    except ValueError:
        return 64


# ---------------------------------------------------------------------------
# L1: 6-band x 10-bit Pigeonhole SimHash Index (100% recall for Hamming <= 5)
# ---------------------------------------------------------------------------
class SimHashIndex:
    """In-memory banded LSH index covering a 72h sliding window (~<0.05ms/lookup)."""

    def __init__(self, window_sec: int = 72 * 3600) -> None:
        self.window_sec = window_sec
        self._lock = threading.RLock()
        # 6 bands of 10 bits -> 60 bits covered; Hamming <= 5 guarantees >= 1 exact band collision
        self._bands: list[dict[int, set[int]]] = [defaultdict(set) for _ in range(6)]
        # item_id -> (hash_int, cluster_id, published_at, feed_id, has_body, is_template, title_norm)
        self._meta: dict[int, tuple[int, str, int, str, bool, bool, str]] = {}
        self._last_prune = 0.0

    @staticmethod
    def _band_keys(h: int) -> tuple[int, ...]:
        return tuple((h >> (b * 10)) & 0x3FF for b in range(6))

    def add(
        self,
        item_id: int,
        sim_hex: str,
        cluster_id: str,
        published_at: int,
        feed_id: str = "",
        has_body: bool = False,
        title: str = "",
    ) -> None:
        try:
            h = int(sim_hex, 16)
        except (TypeError, ValueError):
            return
        if h == 0:
            return
        t_norm = strip_wire_prefix(title).lower()
        is_tpl = is_template_title(title)
        with self._lock:
            if item_id in self._meta:
                self._remove_unlocked(item_id)
            self._meta[item_id] = (h, cluster_id, int(published_at or 0), feed_id, has_body, is_tpl, t_norm)
            for b, bk in enumerate(self._band_keys(h)):
                self._bands[b][bk].add(item_id)
            now = time.time()
            if now - self._last_prune > 300:
                self._prune_unlocked(int(now) - self.window_sec)
                self._last_prune = now

    def _remove_unlocked(self, item_id: int) -> None:
        rec = self._meta.pop(item_id, None)
        if not rec:
            return
        h = rec[0]
        for b, bk in enumerate(self._band_keys(h)):
            s = self._bands[b].get(bk)
            if s:
                s.discard(item_id)
                if not s:
                    del self._bands[b][bk]

    def remove(self, item_id: int) -> None:
        with self._lock:
            self._remove_unlocked(item_id)

    def _prune_unlocked(self, min_ts: int) -> None:
        stale = [iid for iid, rec in self._meta.items() if rec[2] < min_ts]
        for iid in stale:
            self._remove_unlocked(iid)

    def query(
        self,
        sim_hex: str,
        published_at: int,
        *,
        max_hamming: int = 5,
        feed_id: str = "",
        has_body: bool = False,
        title: str = "",
    ) -> tuple[int, str, int] | None:
        """Return (matched_item_id, cluster_id, hamming_dist) or None."""
        try:
            h = int(sim_hex, 16)
        except (TypeError, ValueError):
            return None
        if h == 0:
            return None
        is_tpl = is_template_title(title)
        t_norm = strip_wire_prefix(title).lower()
        t_no_digits = _DIGIT_NORM_RE.sub("", t_norm)

        with self._lock:
            cands: set[int] = set()
            for b, bk in enumerate(self._band_keys(h)):
                bucket = self._bands[b].get(bk)
                if bucket:
                    cands.update(bucket)
            best: tuple[int, str, int] | None = None
            for cid_item in cands:
                rh, r_cluster, r_pub, r_feed, r_has_body, r_tpl, r_tnorm = self._meta[cid_item]
                if abs(int(published_at or 0) - r_pub) > self.window_sec:
                    continue
                dist = (h ^ rh).bit_count()
                if dist > max_hamming:
                    continue
                # Guard against false-merging recurring template bulletins (CISA, White House, Daily Headlines)
                if is_tpl or r_tpl:
                    if not (has_body and r_has_body and dist <= 2):
                        continue
                # Guard against same-feed different-date headlines that only differ by numbers when body is absent
                if feed_id and feed_id == r_feed and not (has_body and r_has_body):
                    r_no_digits = _DIGIT_NORM_RE.sub("", r_tnorm)
                    if t_no_digits == r_no_digits and t_norm != r_tnorm:
                        continue
                if best is None or dist < best[2]:
                    best = (cid_item, r_cluster, dist)
            return best

    def clear(self) -> None:
        with self._lock:
            self._meta.clear()
            for b in self._bands:
                b.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._meta)


# ---------------------------------------------------------------------------
# L2: C++20 SIMD HNSW Vector Index (USearch) with numpy fallback
# ---------------------------------------------------------------------------
class USearchVectorIndex:
    """Thread-safe C++20 SIMD HNSW vector index (f16 cosine) backed by USearch."""

    def __init__(self, path: str, ndim: int = 1024, dtype: str = "f16") -> None:
        self.path = path
        self.ndim = ndim
        self.dtype = dtype
        self._lock = threading.RLock()
        self._dirty = False
        self._idx = None
        self._fallback_vecs: dict[int, np.ndarray] = {}
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self._init_index()

    def _init_index(self) -> None:
        if _USearchIndex is None:
            return
        idx = _USearchIndex(
            ndim=self.ndim,
            metric="cos",
            dtype=self.dtype,
            connectivity=16,
            expansion_add=128,
            expansion_search=64,
        )
        if os.path.exists(self.path):
            try:
                # Read bytes via Python open() so Windows Unicode/Chinese paths (e.g. 物流集团制度库) always work
                with open(self.path, "rb") as f:
                    buf = f.read()
                if buf:
                    idx.load(buf)
            except Exception:
                # Corrupted or incompatible dimension -> rebuild cleanly
                idx = _USearchIndex(
                    ndim=self.ndim,
                    metric="cos",
                    dtype=self.dtype,
                    connectivity=16,
                    expansion_add=128,
                    expansion_search=64,
                )
        self._idx = idx

    @property
    def backend(self) -> str:
        return "usearch-cpp" if self._idx is not None else "numpy-fallback"

    def __len__(self) -> int:
        with self._lock:
            if self._idx is not None:
                return len(self._idx)
            return len(self._fallback_vecs)

    def contains(self, key: int) -> bool:
        k = int(key)
        with self._lock:
            if self._idx is not None:
                try:
                    return k in self._idx
                except Exception:
                    return False
            return k in self._fallback_vecs

    def add(self, key: int, vec: np.ndarray) -> None:
        k = int(key)
        v = np.asarray(vec, dtype=np.float32).reshape(-1)
        if v.shape[0] != self.ndim:
            return
        norm = float(np.linalg.norm(v))
        if norm > 1e-12:
            v = v / norm
        with self._lock:
            if self._idx is not None:
                try:
                    if k in self._idx:
                        self._idx.remove(k)
                except Exception:
                    pass
                self._idx.add(k, v)
                self._dirty = True
            else:
                self._fallback_vecs[k] = v.astype(np.float16)

    def add_batch(self, keys: Iterable[int], vecs: np.ndarray) -> int:
        key_list = [int(k) for k in keys]
        if not key_list:
            return 0
        arr = np.asarray(vecs, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        if arr.shape[1] != self.ndim:
            return 0
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms = np.where(norms > 1e-12, norms, 1.0)
        arr = arr / norms
        with self._lock:
            if self._idx is not None:
                for k in key_list:
                    try:
                        if k in self._idx:
                            self._idx.remove(k)
                    except Exception:
                        pass
                self._idx.add(np.asarray(key_list, dtype=np.uint64), arr)
                self._dirty = True
            else:
                for k, v in zip(key_list, arr):
                    self._fallback_vecs[k] = v.astype(np.float16)
        return len(key_list)

    def remove(self, key: int) -> None:
        k = int(key)
        with self._lock:
            if self._idx is not None:
                try:
                    if k in self._idx:
                        self._idx.remove(k)
                        self._dirty = True
                except Exception:
                    pass
            else:
                self._fallback_vecs.pop(k, None)

    def search(self, query_vec: np.ndarray, k: int = 40) -> list[tuple[int, float]]:
        v = np.asarray(query_vec, dtype=np.float32).reshape(-1)
        if v.shape[0] != self.ndim:
            return []
        norm = float(np.linalg.norm(v))
        if norm > 1e-12:
            v = v / norm
        with self._lock:
            if self._idx is not None:
                n = len(self._idx)
                if n == 0:
                    return []
                matches = self._idx.search(v, min(max(1, k), n))
                out: list[tuple[int, float]] = []
                for mk, dist in zip(matches.keys, matches.distances):
                    sim = max(0.0, min(1.0, 1.0 - float(dist)))
                    out.append((int(mk), sim))
                return out
            if not self._fallback_vecs:
                return []
            keys = list(self._fallback_vecs.keys())
            mat = np.stack([self._fallback_vecs[x] for x in keys]).astype(np.float32)
            sims = mat @ v
            top = np.argsort(-sims)[:k]
            return [(keys[int(i)], float(max(0.0, sims[int(i)]))) for i in top]

    def reset(self) -> None:
        with self._lock:
            self._fallback_vecs.clear()
            if _USearchIndex is not None:
                self._idx = _USearchIndex(
                    ndim=self.ndim,
                    metric="cos",
                    dtype=self.dtype,
                    connectivity=16,
                    expansion_add=128,
                    expansion_search=64,
                )
            if os.path.exists(self.path):
                try:
                    os.remove(self.path)
                except OSError:
                    pass
            self._dirty = False

    def save(self, force: bool = False) -> None:
        with self._lock:
            if self._idx is None or (not self._dirty and not force):
                return
            buf = self._idx.save()
            tmp = self.path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(buf)
            os.replace(tmp, self.path)
            self._dirty = False


# ---------------------------------------------------------------------------
# Rust BM25 Full-Text Search Index (Tantivy)
# ---------------------------------------------------------------------------
class TantivySearchIndex:
    """Rust Tantivy multilingual BM25 index (ZH/EN/RU/JA pre-tokenized)."""

    def __init__(self, index_dir: str) -> None:
        self.index_dir = index_dir
        self._lock = threading.RLock()
        self._index = None
        self._schema = None
        self._pending_ops = 0
        if _tantivy is not None:
            self._open_or_create()

    def _build_schema(self):
        sb = _tantivy.SchemaBuilder()
        sb.add_unsigned_field("item_id", stored=True, indexed=True, fast=True)
        sb.add_text_field("item_key", stored=False, tokenizer_name="raw")
        sb.add_unsigned_field("published_at", stored=True, indexed=True, fast=True)
        sb.add_text_field("lang", stored=True, tokenizer_name="raw")
        sb.add_text_field("category", stored=True, tokenizer_name="raw")
        sb.add_text_field("title_tok", stored=False, tokenizer_name="whitespace")
        sb.add_text_field("body_tok", stored=False, tokenizer_name="whitespace")
        return sb.build()

    def _open_or_create(self) -> None:
        os.makedirs(self.index_dir, exist_ok=True)
        self._schema = self._build_schema()
        try:
            self._index = _tantivy.Index(self._schema, path=self.index_dir)
        except Exception:
            # Schema mismatch or corrupted dir -> recreate cleanly
            for fn in os.listdir(self.index_dir):
                fp = os.path.join(self.index_dir, fn)
                if os.path.isfile(fp):
                    try:
                        os.remove(fp)
                    except OSError:
                        pass
            self._index = _tantivy.Index(self._schema, path=self.index_dir)

    @property
    def available(self) -> bool:
        return self._index is not None

    def num_docs(self) -> int:
        if self._index is None:
            return 0
        with self._lock:
            self._index.reload()
            return int(self._index.searcher().num_docs)

    @staticmethod
    def _doc_from_item(item: dict):
        title_str = " ".join(
            tokenize_multilingual(f"{item.get('title_zh') or ''} {item.get('title_orig') or ''}", for_bm25=True)
        )
        ents = item.get("entities") or []
        ent_names = " ".join(
            e.get("name", "") if isinstance(e, dict) else str(e) for e in ents
        )
        body_src = " ".join([
            item.get("summary_zh") or "",
            item.get("summary_orig") or "",
            item.get("feed_name") or "",
            ent_names,
        ])
        body_str = " ".join(tokenize_multilingual(body_src, for_bm25=True))
        doc = _tantivy.Document()
        iid = int(item["id"])
        doc.add_unsigned("item_id", iid)
        doc.add_text("item_key", str(iid))
        doc.add_unsigned("published_at", max(0, int(item.get("published_at") or 0)))
        doc.add_text("lang", str(item.get("lang") or "en"))
        doc.add_text("category", str(item.get("category") or "综合"))
        doc.add_text("title_tok", title_str)
        doc.add_text("body_tok", body_str)
        return doc

    def upsert_batch(self, items: list[dict]) -> int:
        if self._index is None or not items:
            return 0
        with self._lock:
            writer = self._index.writer(heap_size=64_000_000)
            try:
                for it in items:
                    iid = int(it["id"])
                    writer.delete_documents_by_term("item_key", str(iid))
                    writer.add_document(self._doc_from_item(it))
                writer.commit()
            finally:
                try:
                    writer.wait_merging_threads()
                except Exception:
                    pass
            self._index.reload()
            return len(items)

    def delete_batch(self, item_ids: Iterable[int]) -> None:
        ids = [int(i) for i in item_ids]
        if self._index is None or not ids:
            return
        with self._lock:
            writer = self._index.writer(heap_size=32_000_000)
            try:
                for iid in ids:
                    writer.delete_documents_by_term("item_key", str(iid))
                writer.commit()
            finally:
                try:
                    writer.wait_merging_threads()
                except Exception:
                    pass
            self._index.reload()

    def reset(self) -> None:
        if _tantivy is None:
            return
        with self._lock:
            self._index = None
            if os.path.isdir(self.index_dir):
                for fn in os.listdir(self.index_dir):
                    fp = os.path.join(self.index_dir, fn)
                    if os.path.isfile(fp):
                        try:
                            os.remove(fp)
                        except OSError:
                            pass
            self._open_or_create()

    def search(
        self,
        query: str,
        *,
        limit: int = 60,
        lang: str = "",
        category: str = "",
        min_pub_ts: int = 0,
    ) -> list[tuple[int, float]]:
        if self._index is None:
            return []
        toks = tokenize_multilingual(query, for_bm25=True)
        if not toks:
            return []
        # Escape any special query syntax tokens and build clean OR query with title boost
        clean_toks = [re.sub(r"[^\w\u0400-\u04ff\u4e00-\u9fff\u3040-\u30ff]+", "", t) for t in toks]
        clean_toks = [t for t in clean_toks if t][:24]
        if not clean_toks:
            return []
        q_str = " ".join(clean_toks)
        with self._lock:
            self._index.reload()
            searcher = self._index.searcher()
            if searcher.num_docs == 0:
                return []
            try:
                parsed_q = self._index.parse_query(
                    q_str,
                    default_field_names=["title_tok", "body_tok"],
                    field_boosts={"title_tok": 2.4, "body_tok": 1.0},
                )
            except Exception:
                parsed_q = self._index.parse_query(q_str, ["title_tok", "body_tok"])
            # Over-fetch slightly when filtering by lang/category/time in Python
            fetch_k = min(max(limit * 4, 80), 400) if (lang or category or min_pub_ts > 0) else limit
            res = searcher.search(parsed_q, fetch_k)
            out: list[tuple[int, float]] = []
            for score, addr in res.hits:
                doc = searcher.doc(addr)
                iid_list = doc["item_id"]
                if not iid_list:
                    continue
                if min_pub_ts > 0:
                    pub_list = doc["published_at"]
                    if not pub_list or int(pub_list[0]) < min_pub_ts:
                        continue
                if lang and lang != "all":
                    l_list = doc["lang"]
                    if not l_list or l_list[0] != lang:
                        continue
                if category and category != "all":
                    c_list = doc["category"]
                    if not c_list or c_list[0] != category:
                        continue
                out.append((int(iid_list[0]), float(score)))
                if len(out) >= limit:
                    break
            return out


# ---------------------------------------------------------------------------
# Local GPU Neural Engine: BAAI/bge-m3 + BAAI/bge-reranker-v2-m3
# ---------------------------------------------------------------------------
class LocalBGEEngine:
    """Lazy-loaded CUDA FP16 (RTX 4070) multilingual embedder & cross-encoder reranker."""

    def __init__(
        self,
        embed_model: str = "BAAI/bge-m3",
        rerank_model: str = "BAAI/bge-reranker-v2-m3",
        cache_dir: str | None = None,
    ) -> None:
        self.embed_model_name = embed_model
        self.rerank_model_name = rerank_model
        self.cache_dir = cache_dir
        self._emb_lock = threading.Lock()
        self._rr_lock = threading.Lock()
        self._emb_tok = None
        self._emb_model = None
        self._rr_tok = None
        self._rr_model = None
        self._device = "cpu"
        self._use_fp16 = False
        self.last_error = ""

    def _detect_device(self) -> tuple[str, bool]:
        import torch
        if torch.cuda.is_available():
            return "cuda", True
        return "cpu", False

    def _ensure_hf_endpoint(self) -> None:
        # Respect user's HF_ENDPOINT if set; otherwise try direct HF and fallback to hf-mirror on download failure
        if self.cache_dir:
            os.makedirs(self.cache_dir, exist_ok=True)

    def _load_from_hf(self, loader_fn, model_name: str, **kwargs):
        self._ensure_hf_endpoint()
        os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
        if self.cache_dir:
            kwargs.setdefault("cache_dir", self.cache_dir)
        # Fast offline path when weights are already cached locally (zero network wait)
        try:
            return loader_fn(model_name, local_files_only=True, **kwargs)
        except Exception:
            pass
        try:
            return loader_fn(model_name, **kwargs)
        except Exception:
            if not os.environ.get("HF_ENDPOINT"):
                os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
                return loader_fn(model_name, **kwargs)
            raise

    def ensure_embedder(self) -> bool:
        if self._emb_model is not None:
            return True
        with self._emb_lock:
            if self._emb_model is not None:
                return True
            try:
                import torch
                from transformers import AutoModel, AutoTokenizer

                self._device, self._use_fp16 = self._detect_device()
                dtype = torch.float16 if self._use_fp16 else torch.float32
                tok = self._load_from_hf(AutoTokenizer.from_pretrained, self.embed_model_name)
                mdl = self._load_from_hf(AutoModel.from_pretrained, self.embed_model_name, dtype=dtype)
                mdl.eval()
                mdl.to(self._device)
                self._emb_tok = tok
                self._emb_model = mdl
                self.last_error = ""
                return True
            except Exception as e:
                self.last_error = f"embedder load failed: {e}"
                return False

    def ensure_reranker(self) -> bool:
        if self._rr_model is not None:
            return True
        with self._rr_lock:
            if self._rr_model is not None:
                return True
            try:
                import torch
                from transformers import AutoModelForSequenceClassification, AutoTokenizer

                self._device, self._use_fp16 = self._detect_device()
                dtype = torch.float16 if self._use_fp16 else torch.float32
                tok = self._load_from_hf(AutoTokenizer.from_pretrained, self.rerank_model_name)
                mdl = self._load_from_hf(
                    AutoModelForSequenceClassification.from_pretrained,
                    self.rerank_model_name,
                    dtype=dtype,
                )
                mdl.eval()
                mdl.to(self._device)
                self._rr_tok = tok
                self._rr_model = mdl
                self.last_error = ""
                return True
            except Exception as e:
                self.last_error = f"reranker load failed: {e}"
                return False

    def encode(self, texts: list[str], *, batch_size: int = 48, max_length: int = 384) -> np.ndarray:
        if not texts:
            return np.zeros((0, 1024), dtype=np.float32)
        if not self.ensure_embedder():
            raise RuntimeError(self.last_error or "本地 BGE-M3 未就绪")
        import torch

        cleaned = [(t or " ").strip()[:2400] or " " for t in texts]
        chunks: list[np.ndarray] = []
        with self._emb_lock:
            for i in range(0, len(cleaned), batch_size):
                batch = cleaned[i : i + batch_size]
                enc = self._emb_tok(
                    batch,
                    padding=True,
                    truncation=True,
                    max_length=max_length,
                    return_tensors="pt",
                ).to(self._device)
                with torch.inference_mode():
                    out = self._emb_model(**enc)
                    # BGE-M3 dense representation = L2-normalized CLS token
                    vecs = out.last_hidden_state[:, 0]
                    vecs = torch.nn.functional.normalize(vecs.float(), p=2, dim=-1)
                chunks.append(vecs.cpu().numpy())
        return np.vstack(chunks).astype(np.float32, copy=False)

    def rerank(self, query: str, docs: list[str], *, batch_size: int = 24, max_length: int = 384) -> list[float]:
        if not docs:
            return []
        if not self.ensure_reranker():
            raise RuntimeError(self.last_error or "本地 BGE-Reranker 未就绪")
        import torch

        q = (query or "").strip()[:400]
        scores_all: list[float] = []
        with self._rr_lock:
            for i in range(0, len(docs), batch_size):
                batch_docs = [(d or " ").strip()[:1600] or " " for d in docs[i : i + batch_size]]
                pairs = [[q, d] for d in batch_docs]
                enc = self._rr_tok(
                    pairs,
                    padding=True,
                    truncation=True,
                    max_length=max_length,
                    return_tensors="pt",
                ).to(self._device)
                with torch.inference_mode():
                    logits = self._rr_model(**enc, return_dict=True).logits.view(-1).float()
                    probs = torch.sigmoid(logits)
                scores_all.extend(float(x) for x in probs.cpu().tolist())
        return scores_all

    def status(self) -> dict:
        return {
            "embed_model": self.embed_model_name,
            "rerank_model": self.rerank_model_name,
            "embed_loaded": self._emb_model is not None,
            "rerank_loaded": self._rr_model is not None,
            "device": self._device,
            "fp16": self._use_fp16,
            "last_error": self.last_error,
        }


# ---------------------------------------------------------------------------
# Fast C-backed HTTP Fetcher (curl_cffi) + Article Extractor (trafilatura)
# ---------------------------------------------------------------------------
def fetch_url_fast(
    url: str,
    headers: dict | None = None,
    *,
    timeout: float = 15.0,
    proxy: str = "",
) -> tuple[int, bytes, dict]:
    """Fetch URL using C libcurl (curl_cffi with browser TLS impersonation) for speed & anti-403."""
    if _cffi_requests is None:
        raise RuntimeError("curl_cffi not installed")
    proxies = {"http": proxy, "https": proxy} if proxy else None
    resp = _cffi_requests.get(
        url,
        headers=headers or {},
        timeout=timeout,
        impersonate="chrome",
        allow_redirects=True,
        proxies=proxies,
    )
    resp_headers = {k.lower(): v for k, v in resp.headers.items()}
    return int(resp.status_code), bytes(resp.content or b""), resp_headers


def extract_article_fast(html_bytes: bytes, url: str = "") -> str:
    """Extract clean article main text via trafilatura (removes nav/ads/footers)."""
    if not html_bytes:
        return ""
    if _trafilatura is not None:
        try:
            text = _trafilatura.extract(
                html_bytes,
                url=url or None,
                include_comments=False,
                include_tables=False,
                favor_precision=False,
                no_fallback=False,
            )
            if text and len(text.strip()) >= 80:
                return text.strip()[:18000]
        except Exception:
            pass
    return ""


def parse_xml_root_fast(raw_bytes: bytes):
    """Parse RSS/Atom XML with C libxml2 (lxml) recovery mode, returning (root, is_lxml)."""
    if _lxml_etree is not None:
        parser = _lxml_etree.XMLParser(
            recover=True,
            resolve_entities=False,
            no_network=True,
            huge_tree=True,
        )
        # Strip leading BOM / whitespace before <?xml
        cleaned = raw_bytes.lstrip(b"\xef\xbb\xbf \t\r\n")
        root = _lxml_etree.fromstring(cleaned, parser=parser)
        if root is not None:
            return root, True
    return None, False
