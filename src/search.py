from __future__ import annotations

import html
import os
import re
import sqlite3

import normalize as nz

try:
    import jieba
    jieba.setLogLevel(60)
    _HAS_JIEBA = True
except ImportError:
    _HAS_JIEBA = False

SYNONYMS: dict[str, list[str]] = {}

MAX_TERMS = 24

STOPWORDS = {
    "的", "了", "吗", "呢", "是", "在", "和", "与", "或", "及", "等", "有", "无",
    "我", "我们", "请问", "如何", "怎么", "怎样", "什么", "哪些", "哪",
    "多少", "是否", "需要", "应当", "应该", "可以", "能否", "有没有", "一个",
    "一下", "这个", "那个", "其", "该", "按", "按照", "根据", "对于", "关于",
    "请", "想", "要", "会", "能",
}


def _usable(token: str) -> bool:
    return bool(token) and re.search(r"[\w\u4e00-\u9fff]", token) is not None


def _tokenize(text: str) -> list[str]:
    if not text:
        return []
    if not _HAS_JIEBA:
        return [text[i:i + 2] for i in range(max(len(text) - 1, 1))]
    return [t for t in jieba.cut_for_search(text) if t.strip()]


def build_match_query(q: str, with_synonyms: bool = False, mode: str = "and") -> tuple[str, list[str]]:
    q_norm = nz.normalize(q)
    if not q_norm:
        return "", []

    phrases = re.findall(r'"([^"]+)"|“([^”]+)”', q)
    phrase_terms = [nz.normalize(p[0] or p[1]) for p in phrases if _usable(nz.normalize(p[0] or p[1]))]

    raw_tokens = _tokenize(q_norm)
    content = [t.strip() for t in raw_tokens if t.strip() and _usable(t) and t.strip() not in STOPWORDS]
    if not content:
        content = [t.strip() for t in raw_tokens if t.strip() and _usable(t)]
    longer = [t for t in content if len(t) > 1]
    if longer:
        content = longer

    base_tokens: list[str] = []
    for t in content:
        if t not in base_tokens:
            base_tokens.append(t)

    terms = list(base_tokens)
    if with_synonyms:
        for t in base_tokens:
            for syn in SYNONYMS.get(t, [])[:2]:
                s = nz.normalize(syn)
                if s and s not in terms and _usable(s):
                    terms.append(s)
    terms = terms[:MAX_TERMS]

    def quote(t: str) -> str:
        return f'"{t}"'

    parts = [f'"{p}"' for p in phrase_terms]
    if base_tokens:
        if mode == "and":
            parts.extend(quote(t) for t in base_tokens)
            expr = " AND ".join(dict.fromkeys(parts)) if parts else ""
        else:
            parts.extend(quote(t) for t in terms)
            expr = " OR ".join(dict.fromkeys(parts)) if parts else ""
    else:
        expr = " AND ".join(dict.fromkeys(parts))

    return expr, list(dict.fromkeys([*terms, *phrase_terms]))


def _highlight(text: str, terms: list[str]) -> str:
    if not text or not terms:
        return html.escape(text, quote=False)
    uniq = sorted({t for t in terms if t}, key=len, reverse=True)
    pat = re.compile("|".join(re.escape(t) for t in uniq))
    out: list[str] = []
    last = 0
    for m in pat.finditer(text):
        out.append(html.escape(text[last:m.start()], quote=False))
        out.append("<mark>" + html.escape(m.group(0), quote=False) + "</mark>")
        last = m.end()
    out.append(html.escape(text[last:], quote=False))
    return "".join(out)


def _snippet(text: str, terms: list[str], width: int = 110) -> str:
    flat = re.sub(r"\s+", "", text)
    if not flat:
        return ""
    pos = -1
    for t in terms:
        p = flat.find(t)
        if p >= 0 and (pos < 0 or p < pos):
            pos = p
    if pos < 0:
        pos = 0
    start = max(0, pos - width // 3)
    end = min(len(flat), start + width)
    frag = flat[start:end]
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(flat) else ""
    return prefix + _highlight(frag, terms) + suffix


def _bigrams(s: str) -> set[str]:
    return {s[i:i + 2] for i in range(len(s) - 1)}


def _collapse(results: list[dict]) -> list[dict]:
    out: list[dict] = []
    for r in results:
        g = _bigrams(r["_norm"])
        dup = False
        for k in out:
            if k["doc_id"] != r["doc_id"] or abs(k["page_start"] - r["page_start"]) > 1:
                continue
            kg = _bigrams(k["_norm"])
            if not g or not kg:
                continue
            if len(g & kg) / len(g | kg) >= 0.35:
                dup = True
                break
        if not dup:
            out.append(r)
    return out


def _run_fts(con: sqlite3.Connection, match: str, wsql: str, params: list,
             limit: int | None) -> list[tuple]:
    sql = f"""
        SELECT ch.id, ch.doc_id, ch.seq, ch.chapter, ch.article, ch.page_start,
               ch.page_end, ch.text, ch.text_norm, d.title, d.doc_no, d.dept,
               d.issued_date, d.status, d.rel_path, d.category, d.n_pages,
               bm25(chunks_fts, 8.0, 3.0, 4.0, 1.0) AS score
          FROM chunks_fts
          JOIN chunks ch ON ch.id = chunks_fts.rowid
          JOIN docs d ON d.id = ch.doc_id
         WHERE chunks_fts MATCH ?{wsql}
         ORDER BY score
    """
    args = [match, *params]
    if limit is not None:
        sql += " LIMIT ?"
        args.append(limit)
    try:
        return con.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []


W_PLACEHOLDER = ""


def _rrf_merge(primary: list[dict], extra: list[dict], limit: int | None) -> list[dict]:
    scores: dict[int, float] = {}
    by_id: dict[int, dict] = {}
    for rank, h in enumerate(primary):
        cid = int(h.get("chunk_id") or 0)
        if not cid:
            continue
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (60 + rank + 1)
        by_id.setdefault(cid, h)
    for rank, h in enumerate(extra):
        cid = int(h.get("chunk_id") or 0)
        if not cid:
            continue
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (60 + rank + 1)
        by_id.setdefault(cid, h)
    ranked = sorted(by_id.values(), key=lambda h: scores.get(int(h.get("chunk_id") or 0), 0.0), reverse=True)
    if limit is not None:
        ranked = ranked[:limit]
    return ranked


def search(
    con: sqlite3.Connection,
    q: str,
    dept: str = "",
    status: str = "",
    category: str = "",
    doc_id: int | None = None,
    limit: int | None = None,
    cfg=None,
) -> list[dict]:
    where = []
    params: list = []
    if dept:
        where.append("d.dept = ?")
        params.append(dept)
    where.append("d.status <> ?")
    params.append("已废止")
    if status and status != "已废止":
        where.append("d.status = ?")
        params.append(status)
    if category:
        where.append("d.category = ?")
        params.append(category)
    if doc_id:
        where.append("d.id = ?")
        params.append(doc_id)
    wsql = (" AND " + " AND ".join(where)) if where else ""

    try:
        stages = [("and", False), ("or", False), ("or", True)]
        found: dict[int, tuple] = {}
        all_terms: list[str] = []
        for mode, syn in stages:
            expr, terms = build_match_query(q, with_synonyms=syn, mode=mode)
            all_terms = list(dict.fromkeys(all_terms + terms))
            if not expr:
                continue
            fetch_n = None if limit is None else limit * 2
            for r in _run_fts(con, expr, wsql, params, fetch_n):
                if r[0] not in found:
                    found[r[0]] = r
            if limit is not None and len(found) >= limit:
                break

        qn = nz.normalize(q)
        if len(found) < 5 and qn:
            sql = f"""
                SELECT ch.id, ch.doc_id, ch.seq, ch.chapter, ch.article, ch.page_start,
                       ch.page_end, ch.text, ch.text_norm, d.title, d.doc_no, d.dept,
                       d.issued_date, d.status, d.rel_path, d.category, d.n_pages,
                       0.0 AS score
                  FROM chunks ch JOIN docs d ON d.id = ch.doc_id
                 WHERE ch.text_norm LIKE ?{wsql}
            """
            like_args: list = [f"%{qn}%", *params]
            if limit is not None:
                sql += " LIMIT ?"
                like_args.append(limit * 2)
            for r in con.execute(sql, like_args).fetchall():
                found.setdefault(r[0], r)
            all_terms = list(dict.fromkeys(all_terms + [qn]))
    finally:
        pass

    rows = list(found.values())

    results = []
    for r in rows:
        results.append(
            {
                "chunk_id": r[0],
                "doc_id": r[1],
                "seq": r[2],
                "chapter": r[3] or "",
                "article": r[4] or "",
                "page_start": r[5] or 0,
                "page_end": r[6] or 0,
                "snippet": _snippet(r[7], all_terms),
                "text": r[7] or "",
                "title": r[9] or "",
                "doc_no": r[10] or "",
                "dept": r[11] or "",
                "issued_date": r[12] or "",
                "status": r[13] or "",
                "rel_path": r[14] or "",
                "category": r[15] or "",
                "n_pages": r[16] or 0,
                "score": float(r[17] or 0.0),
                "_norm": r[8] or "",
            }
        )

    results = _collapse(results)
    if cfg is not None and cfg.data.get("embed_use"):
        try:
            import embed as embed_mod
            vec_hits = embed_mod.search_vec(
                con, q, cfg,
                limit=limit or 24,
                dept=dept, status=status, category=category, doc_id=doc_id,
            )
            for h in vec_hits:
                if not h.get("snippet"):
                    h["snippet"] = _snippet(h.get("text") or "", all_terms)
            results = _rrf_merge(results, vec_hits, None)
        except Exception:
            pass
    if limit is not None:
        results = results[:limit]
    for x in results:
        x.pop("_norm", None)
        x.pop("_vec", None)
    return results


def get_doc(con: sqlite3.Connection, doc_id: int) -> dict:
    row = con.execute(
        """SELECT id,dept,category,title,doc_no,issued_date,handler,status,
                  rel_path,abs_path,n_pages,text_source,note
             FROM docs WHERE id=?""",
        (doc_id,),
    ).fetchone()
    if not row:
        return {}
    doc = {
        "id": row[0], "dept": row[1], "category": row[2], "title": row[3],
        "doc_no": row[4], "issued_date": row[5], "handler": row[6],
        "status": row[7], "rel_path": row[8], "abs_path": row[9],
        "n_pages": row[10], "text_source": row[11], "note": row[12],
        "chunks": [],
    }
    for c in con.execute(
        """SELECT id,seq,chapter,article,page_start,page_end,text FROM chunks
            WHERE doc_id=? ORDER BY seq""",
        (doc_id,),
    ):
        doc["chunks"].append(
            {
                "id": c[0], "seq": c[1], "chapter": c[2] or "", "article": c[3] or "",
                "page_start": c[4], "page_end": c[5], "text": c[6],
            }
        )
    return doc


def find_docs(con: sqlite3.Connection, title: str = "", doc_no: str = "",
              limit: int = 8) -> list[dict]:
    title = (title or "").strip().strip("《》<>\"'“”")
    doc_no = (doc_no or "").strip()
    if not title and not doc_no:
        return []
    where = ["d.status <> '已废止'"]
    params: list = []
    if doc_no:
        where.append("IFNULL(d.doc_no,'') LIKE ?")
        params.append(f"%{doc_no}%")
    if title:
        where.append("IFNULL(d.title,'') LIKE ?")
        params.append(f"%{title}%")
    order_sql = "d.issued_date DESC"
    order_params: list = []
    if title:
        order_sql = ("CASE WHEN d.title = ? THEN 0 WHEN d.title LIKE ? THEN 1 "
                     "ELSE 2 END, d.issued_date DESC")
        order_params = [title, f"{title}%"]
    elif doc_no:
        order_sql = ("CASE WHEN d.doc_no = ? THEN 0 ELSE 1 END, d.issued_date DESC")
        order_params = [doc_no]
    sql = f"""
        SELECT d.id, d.title, d.doc_no, d.dept, d.status, d.issued_date,
               COUNT(ch.id)
          FROM docs d LEFT JOIN chunks ch ON ch.doc_id = d.id
         WHERE {" AND ".join(where)}
         GROUP BY d.id
         ORDER BY {order_sql}
         LIMIT ?
    """
    out = []
    for r in con.execute(sql, [*params, *order_params, limit]):
        out.append({
            "id": r[0],
            "title": r[1] or "",
            "doc_no": r[2] or "",
            "dept": r[3] or "",
            "status": r[4] or "",
            "issued_date": r[5] or "",
            "n_chunks": r[6] or 0,
        })
    return out


def hits_from_doc(doc: dict) -> list[dict]:
    if not doc:
        return []
    hits = []
    for c in doc.get("chunks") or []:
        hits.append({
            "chunk_id": c["id"],
            "doc_id": doc["id"],
            "seq": c.get("seq") or 0,
            "chapter": c.get("chapter") or "",
            "article": c.get("article") or "",
            "page_start": c.get("page_start") or 0,
            "page_end": c.get("page_end") or 0,
            "text": c.get("text") or "",
            "title": doc.get("title") or "",
            "doc_no": doc.get("doc_no") or "",
            "dept": doc.get("dept") or "",
        })
    return hits


def facets(con: sqlite3.Connection) -> dict:
    depts = [r[0] for r in con.execute(
        "SELECT dept, COUNT(*) n FROM docs GROUP BY dept ORDER BY n DESC")]
    statuses = [r[0] for r in con.execute(
        "SELECT status, COUNT(*) n FROM docs WHERE status <> '已废止' "
        "GROUP BY status ORDER BY n DESC")]
    cats = [r[0] for r in con.execute(
        "SELECT category, COUNT(*) n FROM docs GROUP BY category ORDER BY n DESC")]
    return {"depts": depts, "statuses": statuses, "categories": cats}


def list_docs(con: sqlite3.Connection, dept: str = "") -> list[dict]:
    sql = """SELECT d.id,d.dept,d.title,d.doc_no,d.issued_date,d.status,d.category,
                    d.rel_path, COUNT(ch.id)
               FROM docs d LEFT JOIN chunks ch ON ch.doc_id=d.id
              {w}
              GROUP BY d.id ORDER BY d.dept, d.issued_date, d.title"""
    w = "WHERE d.dept=?" if dept else ""
    args = (dept,) if dept else ()
    return [
        {"id": r[0], "dept": r[1], "title": r[2] or os.path.basename(r[7] or ""),
         "doc_no": r[3], "issued_date": r[4], "status": r[5], "category": r[6],
         "rel_path": r[7], "n_chunks": r[8]}
        for r in con.execute(sql.format(w=w), args)
    ]
