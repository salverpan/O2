from __future__ import annotations

import json
import os
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import extract as ex
import normalize as nz
from chunk import split_document

try:
    import jieba
    jieba.setLogLevel(60)
    _HAS_JIEBA = True
except ImportError:
    _HAS_JIEBA = False

SCHEMA = """
PRAGMA journal_mode=WAL;

DROP TABLE IF EXISTS docs;
DROP TABLE IF EXISTS chunks;
DROP TABLE IF EXISTS chunks_fts;
DROP TABLE IF EXISTS blocks;

CREATE TABLE docs(
    id            INTEGER PRIMARY KEY,
    key           TEXT UNIQUE,
    project       TEXT DEFAULT '集团制度库',
    folder        TEXT DEFAULT '',
    dept          TEXT,
    doc_type      TEXT DEFAULT 'regulation',
    category      TEXT,
    title         TEXT,
    doc_no        TEXT,
    issued_date   TEXT,
    handler       TEXT,
    status        TEXT,
    rel_path      TEXT,
    abs_path      TEXT,
    file_ext      TEXT DEFAULT '',
    chunk_profile TEXT DEFAULT 'laws',
    summary       TEXT DEFAULT '',
    tags          TEXT DEFAULT '[]',
    meta_json     TEXT DEFAULT '{}',
    n_pages       INTEGER,
    text_source   TEXT,
    note          TEXT,
    content_hash  TEXT DEFAULT ''
);

CREATE INDEX idx_docs_project ON docs(project, folder);
CREATE INDEX idx_docs_type ON docs(doc_type);
CREATE INDEX idx_docs_hash ON docs(project, content_hash);

CREATE TABLE IF NOT EXISTS folders(
    id         INTEGER PRIMARY KEY,
    project    TEXT NOT NULL,
    path       TEXT NOT NULL DEFAULT '',
    created_at TEXT,
    UNIQUE(project, path)
);

CREATE TABLE chunks(
    id         INTEGER PRIMARY KEY,
    doc_id     INTEGER NOT NULL,
    seq        INTEGER,
    chapter    TEXT,
    article    TEXT,
    anchor     TEXT,
    page_start INTEGER,
    page_end   INTEGER,
    text       TEXT,
    text_norm  TEXT,
    chunk_type TEXT DEFAULT 'text',
    block_refs TEXT
);

CREATE INDEX idx_chunks_doc ON chunks(doc_id);
CREATE INDEX idx_chunks_type ON chunks(chunk_type);

CREATE TABLE blocks(
    doc_id INTEGER NOT NULL,
    page   INTEGER NOT NULL,
    seq    INTEGER NOT NULL,
    x0 REAL, y0 REAL, x1 REAL, y1 REAL,
    text   TEXT,
    PRIMARY KEY(doc_id, page, seq)
);

CREATE VIRTUAL TABLE chunks_fts USING fts5(
    body_tok,
    title_tok,
    docno_tok,
    dept_tok,
    tokenize='unicode61'
);

DROP TABLE IF EXISTS chunk_emb;
CREATE TABLE chunk_emb(
    chunk_id    INTEGER PRIMARY KEY,
    dim         INTEGER NOT NULL,
    vec         BLOB NOT NULL,
    model       TEXT,
    provider_id TEXT
);

DROP TABLE IF EXISTS meta;
CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT);
"""


_SCHEMA_CHECKED: set[str] = set()


def _open_con(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path, timeout=30.0)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute("PRAGMA busy_timeout=15000")
    return con


def ensure_schema(con: sqlite3.Connection) -> None:
    cur = con.cursor()
    db_file = ""
    try:
        db_row = cur.execute("PRAGMA database_list").fetchone()
        if db_row and len(db_row) >= 3 and db_row[2]:
            db_file = os.path.normcase(os.path.abspath(str(db_row[2])))
    except sqlite3.Error:
        db_file = ""
    if db_file and db_file in _SCHEMA_CHECKED:
        return
    cur.execute(
        """CREATE TABLE IF NOT EXISTS folders(
            id         INTEGER PRIMARY KEY,
            project    TEXT NOT NULL,
            path       TEXT NOT NULL DEFAULT '',
            created_at TEXT,
            UNIQUE(project, path)
        )"""
    )
    cur.execute(
        """CREATE TABLE IF NOT EXISTS kb_off(
            project TEXT PRIMARY KEY
        )"""
    )
    has_docs = cur.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='docs'"
    ).fetchone()[0]
    if not has_docs:
        con.commit()
        return

    doc_cols = {r[1] for r in cur.execute("PRAGMA table_info(docs)").fetchall()}
    add_doc_cols = [
        ("project", "TEXT DEFAULT '集团制度库'"),
        ("folder", "TEXT DEFAULT ''"),
        ("doc_type", "TEXT DEFAULT 'regulation'"),
        ("file_ext", "TEXT DEFAULT ''"),
        ("chunk_profile", "TEXT DEFAULT 'laws'"),
        ("summary", "TEXT DEFAULT ''"),
        ("tags", "TEXT DEFAULT '[]'"),
        ("meta_json", "TEXT DEFAULT '{}'"),
        ("content_hash", "TEXT DEFAULT ''"),
    ]
    for col, spec in add_doc_cols:
        if col not in doc_cols:
            cur.execute(f"ALTER TABLE docs ADD COLUMN {col} {spec}")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_docs_hash ON docs(project, content_hash)")

    chunk_cols = {r[1] for r in cur.execute("PRAGMA table_info(chunks)").fetchall()}
    if "chunk_type" not in chunk_cols:
        cur.execute("ALTER TABLE chunks ADD COLUMN chunk_type TEXT DEFAULT 'text'")

    # 自动回填旧数据的 project / folder / doc_type / meta_json / summary
    rows = cur.execute(
        """SELECT id, dept, title, doc_no, issued_date, status, rel_path,
                  IFNULL(project,''), IFNULL(folder,''), IFNULL(doc_type,''),
                  IFNULL(file_ext,''), IFNULL(chunk_profile,''),
                  IFNULL(summary,''), IFNULL(meta_json,'')
             FROM docs"""
    ).fetchall()
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
    folder_pairs: set[tuple[str, str]] = set()
    for r in rows:
        did, dept, title, doc_no, issued_date, status, rel_path = r[0], r[1] or "", r[2] or "", r[3] or "", r[4] or "", r[5] or "现行", r[6] or ""
        proj, folder, dtype, fext, cprof, summ, mjson = r[7], r[8], r[9], r[10], r[11], r[12], r[13]
        need_update = False
        if not proj:
            proj = "集团制度库"
            need_update = True
        if not folder and dept and dept != proj:
            folder = dept
            need_update = True
        if not fext:
            fext = os.path.splitext(rel_path)[1].lower() or ".pdf"
            need_update = True
        if not dtype:
            dtype = ex.guess_doc_type(title or rel_path, "", fext)
            need_update = True
        if not cprof or cprof == "auto":
            cprof = ex.DOC_TYPES.get(dtype, {}).get("default_chunk", "laws")
            need_update = True
        try:
            meta_obj = json.loads(mjson) if mjson else {}
        except ValueError:
            meta_obj = {}
        if not meta_obj:
            need_update = True
            if dtype == "regulation":
                meta_obj = {
                    "dept": dept or folder or "综合",
                    "doc_no": doc_no,
                    "issued_date": issued_date,
                    "status": status,
                }
            else:
                meta_obj = {"dept": dept, "issued_date": issued_date}
        if not summ:
            parts = [x for x in (doc_no, dept or folder, issued_date) if x]
            summ = " · ".join(parts) if parts else title
            need_update = True
        cat_label = ex.DOC_TYPES.get(dtype, {}).get("label", "制度法规")
        if need_update:
            cur.execute(
                """UPDATE docs SET project=?, folder=?, doc_type=?, category=?,
                          file_ext=?, chunk_profile=?, summary=?, meta_json=?
                    WHERE id=?""",
                (proj, folder, dtype, cat_label, fext, cprof, summ,
                 json.dumps(meta_obj, ensure_ascii=False), did),
            )
        folder_pairs.add((proj, ""))
        if folder:
            parts = [p for p in folder.replace("\\", "/").split("/") if p]
            acc = []
            for p in parts:
                acc.append(p)
                folder_pairs.add((proj, "/".join(acc)))

    # 仅在目录表为空时（首次升级旧库）回填目录记录，避免后续操作误恢复已删除的旧目录
    n_existing_folders = cur.execute("SELECT COUNT(*) FROM folders").fetchone()[0]
    if n_existing_folders == 0 and folder_pairs:
        for proj, fpath in folder_pairs:
            cur.execute(
                "INSERT OR IGNORE INTO folders(project, path, created_at) VALUES(?,?,?)",
                (proj, fpath, now_str),
            )
    con.commit()
    if db_file:
        _SCHEMA_CHECKED.add(db_file)


def _register_folder_tree(cur: sqlite3.Cursor, project: str, folder: str) -> None:
    project = (project or "默认项目").strip() or "默认项目"
    folder = (folder or "").replace("\\", "/").strip("/")
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
    cur.execute(
        "INSERT OR IGNORE INTO folders(project, path, created_at) VALUES(?,?,?)",
        (project, "", now_str),
    )
    if folder:
        parts = [p for p in folder.split("/") if p]
        acc = []
        for p in parts:
            acc.append(p)
            cur.execute(
                "INSERT OR IGNORE INTO folders(project, path, created_at) VALUES(?,?,?)",
                (project, "/".join(acc), now_str),
            )


def _bigrams(s: str) -> set[str]:
    return {s[i:i + 2] for i in range(len(s) - 1)}


def drop_layer_duplicates(chunks: list, norm_texts: list[str]) -> list[int]:
    keep: list[int] = []
    by_page: dict[int, list[int]] = {}
    grams: dict[int, set[str]] = {}

    for i, (c, tn) in enumerate(zip(chunks, norm_texts)):
        if not tn:
            continue
        if getattr(c, "chunk_type", "text") in ("table", "image"):
            keep.append(i)
            continue
        g = grams.setdefault(i, _bigrams(tn))
        dup = False
        for j in by_page.get(c.page_start, []):
            if abs(len(norm_texts[j]) - len(tn)) > max(10, len(tn) * 0.6):
                continue
            gj = grams[j]
            if not g or not gj:
                continue
            inter = len(g & gj)
            if inter / len(g | gj) >= 0.50:
                dup = True
                break
        if not dup:
            keep.append(i)
            by_page.setdefault(c.page_start, []).append(i)
    return keep


def tokenize(text: str) -> str:
    if not text:
        return ""
    if not _HAS_JIEBA:
        s = text
        return " ".join(s[i:i + 2] for i in range(max(len(s) - 1, 1)))
    return " ".join(t for t in jieba.cut_for_search(text) if t.strip())


def warm_userdict(titles: list[str], docnos: list[str]) -> None:
    if not _HAS_JIEBA:
        return
    for t in titles:
        if t:
            jieba.add_word(t, freq=2_000_000)
    for d in docnos:
        if d:
            jieba.add_word(d.replace(" ", ""), freq=2_000_000)


def build(src_root: str, db_path: str, work_dir: str) -> dict:
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    t0 = time.time()

    cloud_dir = os.path.join(work_dir, "ocr_cloud")
    docs, skipped = ex.scan(src_root)
    n_cloud = 0
    for d in docs:
        ex.extract_text(d)
        if d.file_ext in (".pdf", *ex.IMAGE_EXTS) and ex.apply_cloud_ocr(d, cloud_dir):
            n_cloud += 1
        ex.enrich_from_text(d)

    ocr_done = []
    for d in docs:
        if not d.has_text:
            d.note = "无文本层：可在入库时或用 src/ocr_all.py 做云端识别"

    warm_userdict([d.title for d in docs], [d.doc_no for d in docs])

    con = _open_con(db_path)
    _SCHEMA_CHECKED.discard(os.path.normcase(os.path.abspath(db_path)))
    con.executescript(SCHEMA)
    cur = con.cursor()

    n_chunks = 0
    n_dropped = 0
    total_chars = 0
    for di, d in enumerate(docs, start=1):
        _register_folder_tree(cur, d.project, d.folder)
        cur.execute(
            """INSERT INTO docs(id,key,project,folder,dept,doc_type,category,title,
                                doc_no,issued_date,handler,status,rel_path,abs_path,
                                file_ext,chunk_profile,summary,tags,meta_json,
                                n_pages,text_source,note,content_hash)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                di, d.key, d.project or "集团制度库", d.folder or "", d.dept or "",
                d.doc_type or "regulation", d.category or "制度法规", d.title,
                d.doc_no, d.issued_date, d.handler, d.status, d.rel_path, d.abs_path,
                d.file_ext or os.path.splitext(d.rel_path)[1].lower(),
                d.chunk_profile or "laws",
                d.summary or "",
                json.dumps(d.tags or [], ensure_ascii=False),
                json.dumps(d.meta or {}, ensure_ascii=False),
                len(d.pages), d.text_source, d.note, d.content_hash or "",
            ),
        )
        nc, nd, chars = index_document(cur, d, di)
        n_chunks += nc
        n_dropped += nd
        total_chars += chars

    stats = {
        "docs": len(docs),
        "chunks": n_chunks,
        "chars": total_chars,
        "skipped": len(skipped),
        "dropped_dupes": n_dropped,
        "ocr": ocr_done,
        "no_text": [d.rel_path for d in docs if not d.has_text],
        "cloud_ocr": n_cloud,
        "seconds": round(time.time() - t0, 1),
    }
    cur.executemany(
        "INSERT INTO meta(k,v) VALUES(?,?)",
        [(k, json.dumps(v, ensure_ascii=False)) for k, v in stats.items()]
        + [("built_at", time.strftime("%Y-%m-%d %H:%M:%S")),
           ("src_root", src_root)],
    )
    cur.execute("INSERT INTO chunks_fts(chunks_fts) VALUES('optimize')")
    con.commit()
    con.close()
    return stats


def _fts_doc_tokens(d) -> tuple[str, str, str]:
    tags_str = " ".join(str(x) for x in (getattr(d, "tags", None) or []) if x)
    meta_vals = " ".join(str(v) for v in (getattr(d, "meta", None) or {}).values() if v)
    title_blob = f"{d.title or ''} {getattr(d, 'summary', '') or ''} {tags_str}"
    docno_blob = f"{d.doc_no or ''} {meta_vals}"
    dept_blob = f"{getattr(d, 'project', '') or ''} {getattr(d, 'folder', '') or ''} {d.dept or ''} {d.category or ''}"
    return (
        tokenize(nz.normalize(title_blob)),
        tokenize(nz.normalize(docno_blob)),
        tokenize(nz.normalize(dept_blob)),
    )


def index_document(cur: sqlite3.Cursor, d, doc_id: int) -> tuple[int, int, int]:
    n_chunks = 0
    total_chars = 0
    profile = getattr(d, "chunk_profile", "auto") or "auto"
    tables = getattr(d, "tables", None) or []
    blabels = getattr(d, "block_labels", None) or {}

    if d.page_blocks:
        pblocks = {p: [nz.strip_page_noise(t) for t in bl]
                   for p, bl in d.page_blocks.items()}
        clean_pages = ["\n".join(bl) for bl in pblocks.values()]
        res = split_document(
            clean_pages, doc_key=f"d{doc_id}", page_blocks=pblocks,
            profile=profile, tables=tables, block_labels=blabels,
        )
    else:
        clean_pages = [nz.strip_page_noise(p) for p in d.pages]
        res = split_document(
            clean_pages, doc_key=f"d{doc_id}",
            profile=profile, tables=tables, block_labels=blabels,
        )

    norm_all = [nz.normalize(c.text) for c in res.chunks]
    keep_idx = drop_layer_duplicates(res.chunks, norm_all)
    dropped = len(res.chunks) - len(keep_idx)

    title_tok, docno_tok, dept_tok = _fts_doc_tokens(d)

    for i in keep_idx:
        c = res.chunks[i]
        ctype = getattr(c, "chunk_type", "text") or "text"
        if ctype == "text":
            c.text = nz.reflow_display(c.text)
        tn = norm_all[i]
        if not tn:
            continue
        cur.execute(
            """INSERT INTO chunks(doc_id,seq,chapter,article,anchor,page_start,
                                  page_end,text,text_norm,chunk_type,block_refs)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (doc_id, c.seq, c.chapter, c.article, c.anchor, c.page_start,
             c.page_end, c.text, tn, ctype, json.dumps(c.block_refs)),
        )
        cid = cur.lastrowid
        cur.execute(
            "INSERT INTO chunks_fts(rowid,body_tok,title_tok,docno_tok,dept_tok)"
            " VALUES(?,?,?,?,?)",
            (cid, tokenize(tn), title_tok, docno_tok, dept_tok),
        )
        n_chunks += 1
        total_chars += len(tn)

    for (pno, bseq), bbox in d.bboxes.items():
        cur.execute(
            "INSERT OR IGNORE INTO blocks(doc_id,page,seq,x0,y0,x1,y1,text)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (doc_id, pno, bseq, bbox[0], bbox[1], bbox[2], bbox[3],
             (d.page_blocks.get(pno) or [""] * (bseq + 1))[bseq]
             if bseq < len(d.page_blocks.get(pno) or []) else ""),
        )
    if res.preamble.strip():
        pn = nz.normalize(res.preamble)
        if pn:
            cur.execute(
                """INSERT INTO chunks(doc_id,seq,chapter,article,anchor,page_start,
                                      page_end,text,text_norm,chunk_type,block_refs)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (doc_id, 0, "", "前言", f"d{doc_id}#pre", 1, min(2, max(1, len(d.pages))),
                 res.preamble, pn, "text", "[]"),
            )
            cur.execute(
                "INSERT INTO chunks_fts(rowid,body_tok,title_tok,docno_tok,dept_tok)"
                " VALUES(?,?,?,?,?)",
                (cur.lastrowid, tokenize(pn), title_tok, docno_tok, dept_tok),
            )
            n_chunks += 1
    return n_chunks, dropped, total_chars


def purge_doc_content(con: sqlite3.Connection, doc_id: int) -> None:
    ids = [r[0] for r in con.execute(
        "SELECT id FROM chunks WHERE doc_id=?", (doc_id,))]
    for cid in ids:
        con.execute("DELETE FROM chunks_fts WHERE rowid=?", (cid,))
    try:
        for cid in ids:
            con.execute("DELETE FROM chunk_emb WHERE chunk_id=?", (cid,))
    except sqlite3.OperationalError:
        pass
    con.execute("DELETE FROM chunks WHERE doc_id=?", (doc_id,))
    con.execute("DELETE FROM blocks WHERE doc_id=?", (doc_id,))


def upsert_document(db_path: str, d, doc_id: int | None = None) -> int:
    warm_userdict([d.title], [d.doc_no])
    con = _open_con(db_path)
    ensure_schema(con)
    cur = con.cursor()
    _register_folder_tree(cur, d.project, d.folder)
    vals = (
        d.key,
        d.project or "集团制度库",
        d.folder or "",
        d.dept or d.folder or "",
        d.doc_type or "regulation",
        d.category or ex.DOC_TYPES.get(d.doc_type or "regulation", {}).get("label", "制度法规"),
        d.title,
        d.doc_no,
        d.issued_date,
        d.handler,
        d.status,
        d.rel_path,
        d.abs_path,
        d.file_ext or os.path.splitext(d.rel_path or d.abs_path)[1].lower(),
        d.chunk_profile or "laws",
        d.summary or "",
        json.dumps(d.tags or [], ensure_ascii=False),
        json.dumps(d.meta or {}, ensure_ascii=False),
        len(d.pages),
        d.text_source,
        d.note,
        d.content_hash or "",
    )
    if doc_id:
        row = cur.execute("SELECT id FROM docs WHERE id=?", (doc_id,)).fetchone()
        if not row:
            con.close()
            raise ValueError("文档不存在")
        purge_doc_content(con, doc_id)
        cur.execute(
            """UPDATE docs SET key=?,project=?,folder=?,dept=?,doc_type=?,category=?,
                   title=?,doc_no=?,issued_date=?,handler=?,status=?,rel_path=?,
                   abs_path=?,file_ext=?,chunk_profile=?,summary=?,tags=?,meta_json=?,
                   n_pages=?,text_source=?,note=?,content_hash=?
               WHERE id=?""",
            (*vals, doc_id),
        )
    else:
        doc_id = cur.execute("SELECT IFNULL(MAX(id),0)+1 FROM docs").fetchone()[0]
        cur.execute(
            """INSERT INTO docs(id,key,project,folder,dept,doc_type,category,title,
                                doc_no,issued_date,handler,status,rel_path,abs_path,
                                file_ext,chunk_profile,summary,tags,meta_json,
                                n_pages,text_source,note,content_hash)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (doc_id, *vals),
        )
    index_document(cur, d, doc_id)
    con.commit()
    con.close()
    return doc_id


def _try_move_disk_file(src_root: str, old_rel: str, old_abs: str, old_project: str,
                        new_project: str, new_folder: str) -> tuple[str, str]:
    import shutil
    fn = os.path.basename(old_abs or old_rel or "")
    if not fn:
        return old_rel, old_abs
    rel_norm = (old_rel or "").replace("\\", "/")
    first_seg = rel_norm.split("/")[0] if rel_norm else ""
    use_prefix = bool(first_seg) and first_seg == (old_project or "")
    parts = [p for p in (new_folder.split("/") if new_folder else []) if p]
    sub_parts = ([new_project] if use_prefix else []) + parts
    new_rel = os.path.join(*sub_parts, fn) if sub_parts else fn
    if not src_root:
        return new_rel, old_abs
    cand_src = ""
    if old_rel:
        c1 = os.path.join(src_root, old_rel.replace("/", os.sep).replace("\\", os.sep))
        if os.path.isfile(c1):
            cand_src = c1
    if not cand_src and old_abs and os.path.isfile(old_abs):
        try:
            root_norm = os.path.normpath(src_root)
            abs_norm = os.path.normpath(old_abs)
            if os.path.commonpath([root_norm, abs_norm]) == root_norm:
                cand_src = abs_norm
        except ValueError:
            pass
    if not cand_src:
        return new_rel, old_abs
    dest_abs = os.path.join(src_root, new_rel)
    if os.path.normcase(os.path.normpath(cand_src)) == os.path.normcase(os.path.normpath(dest_abs)):
        return new_rel, dest_abs
    try:
        os.makedirs(os.path.dirname(dest_abs), exist_ok=True)
        stem, ext = os.path.splitext(dest_abs)
        n = 1
        while os.path.exists(dest_abs):
            dest_abs = f"{stem}_{n}{ext}"
            n += 1
        shutil.move(cand_src, dest_abs)
        return os.path.relpath(dest_abs, src_root), dest_abs
    except OSError:
        return old_rel, old_abs


def update_doc_metadata(db_path: str, doc_id: int, updates: dict, src_root: str = "") -> dict:
    con = _open_con(db_path)
    con.row_factory = sqlite3.Row
    ensure_schema(con)
    cur = con.cursor()
    row = cur.execute("SELECT * FROM docs WHERE id=?", (doc_id,)).fetchone()
    if not row:
        con.close()
        raise ValueError("文档不存在")

    old_proj = row["project"] or "集团制度库"
    old_folder = (row["folder"] or "").replace("\\", "/").strip("/")
    old_dept = row["dept"] or ""
    old_leaf = old_folder.split("/")[-1] if old_folder else old_proj

    project = str(updates.get("project") if "project" in updates else old_proj).strip() or "集团制度库"
    folder = str(updates.get("folder") if "folder" in updates else old_folder).replace("\\", "/").strip("/")
    new_leaf = folder.split("/")[-1] if folder else project

    folder_changed = (project != old_proj) or (folder != old_folder)
    if "dept" in updates and str(updates.get("dept") or "").strip():
        dept = str(updates["dept"]).strip()
    elif folder_changed:
        dept = new_leaf
    else:
        dept = old_dept or new_leaf

    doc_type = str(updates.get("doc_type") if "doc_type" in updates else row["doc_type"] or "regulation").strip()
    if doc_type not in ex.DOC_TYPES:
        doc_type = "general"
    category = ex.DOC_TYPES[doc_type]["label"]
    title = str(updates.get("title") if "title" in updates else row["title"] or "").strip()
    doc_no = str(updates.get("doc_no") if "doc_no" in updates else row["doc_no"] or "").strip()
    issued_date = str(updates.get("issued_date") if "issued_date" in updates else row["issued_date"] or "").strip()
    status = str(updates.get("status") if "status" in updates else row["status"] or "现行").strip()
    summary = str(updates.get("summary") if "summary" in updates else row["summary"] or "").strip()
    chunk_profile = str(updates.get("chunk_profile") if "chunk_profile" in updates else row["chunk_profile"] or "laws").strip()

    try:
        old_meta = json.loads(row["meta_json"] or "{}")
    except ValueError:
        old_meta = {}
    new_meta = updates.get("meta")
    if isinstance(new_meta, dict):
        old_meta.update(new_meta)

    if folder_changed:
        if old_meta.get("dept") in ("", old_dept, old_leaf, old_folder):
            old_meta["dept"] = dept
        if old_meta.get("topic") in (old_dept, old_leaf, old_folder):
            old_meta["topic"] = dept
        if summary and old_leaf and old_leaf in summary and "summary" not in updates:
            summary = summary.replace(old_leaf, new_leaf)

    if doc_type == "regulation":
        old_meta["dept"] = dept
        old_meta["doc_no"] = doc_no
        old_meta["issued_date"] = issued_date
        old_meta["status"] = status

    try:
        old_tags = json.loads(row["tags"] or "[]")
    except ValueError:
        old_tags = []
    if isinstance(updates.get("tags"), list):
        old_tags = [str(x).strip() for x in updates["tags"] if str(x).strip()]

    rel_path = row["rel_path"] or ""
    abs_path = row["abs_path"] or ""
    doc_key = row["key"] or rel_path
    if folder_changed:
        rel_path, abs_path = _try_move_disk_file(
            src_root, rel_path, abs_path, old_proj, project, folder,
        )
        # 确保 key 唯一
        cand_key = rel_path
        clash = cur.execute("SELECT id FROM docs WHERE key=? AND id<>?", (cand_key, doc_id)).fetchone()
        doc_key = f"{cand_key}#{doc_id}" if clash else cand_key

    _register_folder_tree(cur, project, folder)
    cur.execute(
        """UPDATE docs SET key=?, project=?, folder=?, dept=?, doc_type=?, category=?,
                  title=?, doc_no=?, issued_date=?, status=?, summary=?,
                  chunk_profile=?, tags=?, meta_json=?, rel_path=?, abs_path=?
            WHERE id=?""",
        (
            doc_key, project, folder, dept, doc_type, category,
            title, doc_no, issued_date, status, summary,
            chunk_profile,
            json.dumps(old_tags, ensure_ascii=False),
            json.dumps(old_meta, ensure_ascii=False),
            rel_path, abs_path,
            doc_id,
        ),
    )

    # 同步更新 FTS 元数据索引列
    dummy = ex.Doc(
        key=doc_key,
        dept=dept,
        project=project,
        folder=folder,
        doc_type=doc_type,
        category=category,
        title=title,
        doc_no=doc_no,
        issued_date=issued_date,
        status=status,
        summary=summary,
        tags=old_tags,
        meta=old_meta,
    )
    title_tok, docno_tok, dept_tok = _fts_doc_tokens(dummy)
    cids = [r[0] for r in cur.execute("SELECT id FROM chunks WHERE doc_id=?", (doc_id,)).fetchall()]
    for cid in cids:
        cur.execute(
            "UPDATE chunks_fts SET title_tok=?, docno_tok=?, dept_tok=? WHERE rowid=?",
            (title_tok, docno_tok, dept_tok, cid),
        )
    con.commit()
    con.close()
    return {"ok": True, "doc_id": doc_id, "project": project, "folder": folder, "dept": dept}


def move_or_rename_folder(
    db_path: str,
    src_root: str,
    src_project: str,
    src_path: str,
    dst_project: str,
    dst_path: str,
) -> dict:
    src_project = (src_project or "").strip()
    src_path = (src_path or "").replace("\\", "/").strip("/")
    dst_project = (dst_project or src_project).strip()
    dst_path = (dst_path or "").replace("\\", "/").strip("/")
    if not src_project or not dst_project:
        raise ValueError("项目名称不能为空")
    if src_project == dst_project and src_path == dst_path:
        return {"ok": True, "moved_docs": 0}
    if src_project == dst_project and src_path and dst_path.startswith(src_path + "/"):
        raise ValueError("不能将文件夹移动到其自身的子文件夹下")

    con = _open_con(db_path)
    ensure_schema(con)
    cur = con.cursor()

    # 1. 查找所有受影响的文档
    if not src_path:
        doc_rows = cur.execute(
            "SELECT id, folder FROM docs WHERE project=?", (src_project,)
        ).fetchall()
        folder_rows = cur.execute(
            "SELECT path FROM folders WHERE project=?", (src_project,)
        ).fetchall()
    else:
        doc_rows = cur.execute(
            "SELECT id, folder FROM docs WHERE project=? AND (folder=? OR folder LIKE ?)",
            (src_project, src_path, f"{src_path}/%"),
        ).fetchall()
        folder_rows = cur.execute(
            "SELECT path FROM folders WHERE project=? AND (path=? OR path LIKE ?)",
            (src_project, src_path, f"{src_path}/%"),
        ).fetchall()

    # 2. 更新 folders 表
    _register_folder_tree(cur, dst_project, dst_path)
    for (old_fp,) in folder_rows:
        old_fp = old_fp or ""
        if not src_path:
            sub = old_fp
            new_fp = f"{dst_path}/{sub}".strip("/") if dst_path else sub
        else:
            tail = old_fp[len(src_path):].lstrip("/")
            new_fp = f"{dst_path}/{tail}".strip("/") if tail else dst_path
        _register_folder_tree(cur, dst_project, new_fp)

    if not src_path:
        cur.execute("DELETE FROM folders WHERE project=?", (src_project,))
    else:
        cur.execute(
            "DELETE FROM folders WHERE project=? AND (path=? OR path LIKE ?)",
            (src_project, src_path, f"{src_path}/%"),
        )
    con.commit()
    con.close()

    # 3. 逐个更新受影响文档的目录与属性
    moved = 0
    for did, old_df in doc_rows:
        old_df = (old_df or "").replace("\\", "/").strip("/")
        if not src_path:
            new_df = f"{dst_path}/{old_df}".strip("/") if dst_path else old_df
        else:
            tail = old_df[len(src_path):].lstrip("/")
            new_df = f"{dst_path}/{tail}".strip("/") if tail else dst_path
        update_doc_metadata(
            db_path,
            int(did),
            {"project": dst_project, "folder": new_df},
            src_root=src_root,
        )
        moved += 1

    return {"ok": True, "moved_docs": moved, "project": dst_project, "path": dst_path}


def delete_documents(db_path: str, doc_ids: list[int]) -> int:
    if not doc_ids:
        return 0
    con = _open_con(db_path)
    ensure_schema(con)
    removed = 0
    for did in doc_ids:
        row = con.execute("SELECT id FROM docs WHERE id=?", (int(did),)).fetchone()
        if not row:
            continue
        purge_doc_content(con, int(did))
        con.execute("DELETE FROM docs WHERE id=?", (int(did),))
        removed += 1
    con.commit()
    con.close()
    return removed


def create_folder(db_path: str, src_root: str, project: str, path: str = "") -> dict:
    project = (project or "").strip()
    if not project:
        raise ValueError("项目名称不能为空")
    path = (path or "").replace("\\", "/").strip("/")
    con = _open_con(db_path)
    ensure_schema(con)
    cur = con.cursor()
    _register_folder_tree(cur, project, path)
    con.commit()
    con.close()
    if src_root:
        disk_dir = os.path.join(src_root, project, *([p for p in path.split("/") if p]))
        try:
            os.makedirs(disk_dir, exist_ok=True)
        except OSError:
            pass
    return {"ok": True, "project": project, "path": path}


def delete_folder(db_path: str, project: str, path: str = "", force: bool = False) -> dict:
    project = (project or "").strip()
    path = (path or "").replace("\\", "/").strip("/")
    con = _open_con(db_path)
    ensure_schema(con)
    cur = con.cursor()
    if not path:
        doc_ids = [r[0] for r in cur.execute("SELECT id FROM docs WHERE project=?", (project,)).fetchall()]
        if doc_ids and not force:
            con.close()
            raise ValueError(f"该项目下仍有 {len(doc_ids)} 份文件")
        for did in doc_ids:
            purge_doc_content(con, int(did))
            cur.execute("DELETE FROM docs WHERE id=?", (int(did),))
        cur.execute("DELETE FROM folders WHERE project=?", (project,))
    else:
        doc_ids = [
            r[0]
            for r in cur.execute(
                "SELECT id FROM docs WHERE project=? AND (folder=? OR folder LIKE ?)",
                (project, path, f"{path}/%"),
            ).fetchall()
        ]
        if doc_ids and not force:
            con.close()
            raise ValueError(f"该文件夹下仍有 {len(doc_ids)} 份文件")
        for did in doc_ids:
            purge_doc_content(con, int(did))
            cur.execute("DELETE FROM docs WHERE id=?", (int(did),))
        cur.execute(
            "DELETE FROM folders WHERE project=? AND (path=? OR path LIKE ?)",
            (project, path, f"{path}/%"),
        )
    con.commit()
    con.close()
    return {"ok": True, "removed_docs": len(doc_ids)}


def set_doc_status(db_path: str, doc_id: int, status: str) -> None:
    con = _open_con(db_path)
    ensure_schema(con)
    cur = con.execute("UPDATE docs SET status=? WHERE id=?", (status, doc_id))
    if cur.rowcount == 0:
        con.close()
        raise ValueError("文档不存在")
    con.commit()
    con.close()


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "./docs"
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db = os.path.join(base, "data", "zdl.sqlite")
    st = build(src, db, os.path.join(base, "build"))
    print(json.dumps(st, ensure_ascii=False, indent=2))
    print("db:", db, f"{os.path.getsize(db)/1024/1024:.1f} MB")
