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
    id          INTEGER PRIMARY KEY,
    key         TEXT UNIQUE,
    dept        TEXT,
    category    TEXT,
    title       TEXT,
    doc_no      TEXT,
    issued_date TEXT,
    handler     TEXT,
    status      TEXT,
    rel_path    TEXT,
    abs_path    TEXT,
    n_pages     INTEGER,
    text_source TEXT,
    note        TEXT
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
    block_refs TEXT
);

CREATE INDEX idx_chunks_doc ON chunks(doc_id);

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


def _bigrams(s: str) -> set[str]:
    return {s[i:i + 2] for i in range(len(s) - 1)}


def drop_layer_duplicates(chunks: list, norm_texts: list[str]) -> list[int]:
    keep: list[int] = []
    by_page: dict[int, list[int]] = {}
    grams: dict[int, set[str]] = {}

    for i, (c, tn) in enumerate(zip(chunks, norm_texts)):
        if not tn:
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
        if d.abs_path.lower().endswith(".pdf") and ex.apply_cloud_ocr(d, cloud_dir):
            n_cloud += 1
        ex.enrich_from_text(d)

    ocr_done = []
    for d in docs:
        if not d.has_text:
            d.note = "无文本层：先运行 src/ocr_all.py 做云端识别"

    warm_userdict([d.title for d in docs], [d.doc_no for d in docs])

    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)
    cur = con.cursor()

    n_chunks = 0
    n_dropped = 0
    total_chars = 0
    for di, d in enumerate(docs, start=1):
        cur.execute(
            """INSERT INTO docs(id,key,dept,category,title,doc_no,issued_date,handler,
                               status,rel_path,abs_path,n_pages,text_source,note)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (di, d.key, d.dept, d.category, d.title, d.doc_no, d.issued_date,
             d.handler, d.status, d.rel_path, d.abs_path, len(d.pages),
             d.text_source, d.note),
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


def index_document(cur: sqlite3.Cursor, d, doc_id: int) -> tuple[int, int, int]:
    n_chunks = 0
    total_chars = 0
    if d.page_blocks:
        pblocks = {p: [nz.strip_page_noise(t) for t in bl]
                   for p, bl in d.page_blocks.items()}
        clean_pages = ["\n".join(bl) for bl in pblocks.values()]
        res = split_document(clean_pages, doc_key=f"d{doc_id}", page_blocks=pblocks)
    else:
        clean_pages = [nz.strip_page_noise(p) for p in d.pages]
        res = split_document(clean_pages, doc_key=f"d{doc_id}")

    norm_all = [nz.normalize(c.text) for c in res.chunks]
    keep_idx = drop_layer_duplicates(res.chunks, norm_all)
    dropped = len(res.chunks) - len(keep_idx)

    title_tok = tokenize(nz.normalize(d.title))
    docno_tok = tokenize(nz.normalize(d.doc_no))
    dept_tok = tokenize(nz.normalize(d.dept))

    for i in keep_idx:
        c = res.chunks[i]
        c.text = nz.reflow_display(c.text)
        tn = norm_all[i]
        if not tn:
            continue
        cur.execute(
            """INSERT INTO chunks(doc_id,seq,chapter,article,anchor,page_start,
                                  page_end,text,text_norm,block_refs)
               VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (doc_id, c.seq, c.chapter, c.article, c.anchor, c.page_start,
             c.page_end, c.text, tn, json.dumps(c.block_refs)),
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
                                      page_end,text,text_norm,block_refs)
                   VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (doc_id, 0, "", "前言", f"d{doc_id}#pre", 1, min(2, len(d.pages)),
                 res.preamble, pn, "[]"),
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
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    vals = (d.key, d.dept, d.category, d.title, d.doc_no, d.issued_date,
            d.handler, d.status, d.rel_path, d.abs_path, len(d.pages),
            d.text_source, d.note)
    if doc_id:
        row = cur.execute("SELECT id FROM docs WHERE id=?", (doc_id,)).fetchone()
        if not row:
            con.close()
            raise ValueError("文档不存在")
        purge_doc_content(con, doc_id)
        cur.execute(
            """UPDATE docs SET key=?,dept=?,category=?,title=?,doc_no=?,issued_date=?,
                   handler=?,status=?,rel_path=?,abs_path=?,n_pages=?,text_source=?,note=?
               WHERE id=?""",
            (*vals, doc_id),
        )
    else:
        doc_id = cur.execute("SELECT IFNULL(MAX(id),0)+1 FROM docs").fetchone()[0]
        cur.execute(
            """INSERT INTO docs(id,key,dept,category,title,doc_no,issued_date,handler,
                               status,rel_path,abs_path,n_pages,text_source,note)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (doc_id, *vals),
        )
    index_document(cur, d, doc_id)
    con.commit()
    con.close()
    return doc_id


def set_doc_status(db_path: str, doc_id: int, status: str) -> None:
    con = sqlite3.connect(db_path)
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
