from __future__ import annotations

import contextlib
import json
import os
import sqlite3
import threading
import time

UNIFIED_DB_NAME = "o2.sqlite"
_INIT_LOCK = threading.Lock()
_INITIALIZED: set[str] = set()

UNIFIED_SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS o2_migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS app_kv (
    ns TEXT NOT NULL,
    k TEXT NOT NULL,
    v_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ns, k)
);

CREATE TABLE IF NOT EXISTS kv_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    ttl INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist (
    secid TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    market_group TEXT DEFAULT 'custom',
    sort_order INTEGER DEFAULT 0,
    added_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS instruments (
    symbol TEXT PRIMARY KEY,
    secid TEXT NOT NULL DEFAULT '',
    ts_code TEXT NOT NULL DEFAULT '',
    yf_symbol TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    market TEXT NOT NULL DEFAULT '',
    asset_class TEXT NOT NULL DEFAULT '',
    industry TEXT NOT NULL DEFAULT '',
    exchange TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT '',
    list_date TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    meta_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_instruments_secid ON instruments(secid);
CREATE INDEX IF NOT EXISTS idx_instruments_market ON instruments(market);

CREATE TABLE IF NOT EXISTS market_bars (
    symbol TEXT NOT NULL,
    secid TEXT NOT NULL DEFAULT '',
    interval TEXT NOT NULL DEFAULT '1d',
    trade_date TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    market TEXT NOT NULL DEFAULT '',
    industry TEXT NOT NULL DEFAULT '',
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    adj_factor REAL DEFAULT 1.0,
    pct_chg REAL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (symbol, interval, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_mb_secid_iv_date ON market_bars(secid, interval, trade_date);
CREATE INDEX IF NOT EXISTS idx_mb_mkt_iv_date ON market_bars(market, interval, trade_date);
CREATE INDEX IF NOT EXISTS idx_mb_iv_date ON market_bars(interval, trade_date);

CREATE TABLE IF NOT EXISTS market_daily_basic (
    symbol TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    pe_ttm REAL,
    pb REAL,
    ps_ttm REAL,
    dv_ttm REAL,
    total_mv REAL,
    circ_mv REAL,
    turnover_rate_f REAL,
    volume_ratio REAL,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (symbol, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_mdb_date ON market_daily_basic(trade_date);

CREATE TABLE IF NOT EXISTS market_stk_limit (
    symbol TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    up_limit REAL,
    down_limit REAL,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (symbol, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_msl_date ON market_stk_limit(trade_date);

CREATE TABLE IF NOT EXISTS market_quotes (
    secid TEXT PRIMARY KEY,
    symbol TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    panel_id TEXT NOT NULL DEFAULT '',
    price REAL,
    chg REAL DEFAULT 0,
    pct REAL DEFAULT 0,
    open REAL,
    high REAL,
    low REAL,
    prev_close REAL,
    volume REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    quote_time TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mq_symbol ON market_quotes(symbol);

CREATE TABLE IF NOT EXISTS sector_snapshots (
    trade_date TEXT NOT NULL,
    taxonomy TEXT NOT NULL DEFAULT 'sw_l1',
    sector_code TEXT NOT NULL,
    sector_name TEXT NOT NULL,
    price REAL DEFAULT 0,
    pct REAL DEFAULT 0,
    chg REAL DEFAULT 0,
    mkt_cap REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    net_inflow REAL,
    up_count INTEGER DEFAULT 0,
    down_count INTEGER DEFAULT 0,
    stock_count INTEGER DEFAULT 0,
    lead_stock TEXT NOT NULL DEFAULT '',
    lead_pct REAL DEFAULT 0,
    is_live INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (trade_date, taxonomy, sector_code)
);
CREATE INDEX IF NOT EXISTS idx_sec_snap_updated ON sector_snapshots(updated_at DESC);

CREATE TABLE IF NOT EXISTS movers_snapshots (
    trade_date TEXT NOT NULL,
    board_type TEXT NOT NULL,
    rank_no INTEGER NOT NULL,
    secid TEXT NOT NULL,
    symbol TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    price REAL DEFAULT 0,
    pct REAL DEFAULT 0,
    chg REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (trade_date, board_type, rank_no)
);

CREATE TABLE IF NOT EXISTS macro_indicators (
    series_id TEXT NOT NULL,
    category TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    obs_date TEXT NOT NULL,
    value REAL,
    unit TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    extra_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (series_id, obs_date)
);
CREATE INDEX IF NOT EXISTS idx_macro_cat ON macro_indicators(category, obs_date DESC);

CREATE TABLE IF NOT EXISTS geo_events (
    event_id TEXT PRIMARY KEY,
    category TEXT NOT NULL DEFAULT 'event',
    title TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    lat REAL,
    lon REAL,
    severity TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    event_time TEXT NOT NULL DEFAULT '',
    extra_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quant_universes (
    universe_id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    symbols_json TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quant_jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    title TEXT NOT NULL,
    engine TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    stage TEXT NOT NULL DEFAULT '',
    params_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    finished_at INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quant_jobs_created ON quant_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS factor_leaderboard (
    factor_id TEXT NOT NULL,
    universe TEXT NOT NULL,
    horizon TEXT NOT NULL DEFAULT '5D',
    ic_1d REAL DEFAULT 0,
    ic_mean REAL DEFAULT 0,
    icir REAL DEFAULT 0,
    ic_win_rate REAL DEFAULT 0,
    ls_spread_bps REAL DEFAULT 0,
    turnover_pct REAL DEFAULT 0,
    tested_at INTEGER NOT NULL,
    PRIMARY KEY (factor_id, universe)
);

CREATE TABLE IF NOT EXISTS sync_tasks (
    task_key TEXT PRIMARY KEY,
    scopes_json TEXT NOT NULL DEFAULT '[]',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    params_json TEXT NOT NULL DEFAULT '{}',
    total_symbols INTEGER NOT NULL DEFAULT 0,
    done_symbols INTEGER NOT NULL DEFAULT 0,
    failed_symbols INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    last_job_id TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_checkpoints (
    task_key TEXT NOT NULL,
    symbol TEXT NOT NULL,
    secid TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    market TEXT NOT NULL DEFAULT '',
    industry TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    rows_written INTEGER NOT NULL DEFAULT 0,
    last_trade_date TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (task_key, symbol)
);
CREATE INDEX IF NOT EXISTS idx_sync_cp_status ON sync_checkpoints(task_key, status);
"""

# Knowledge-base tables (compatible with build.py / search.py / embed.py)
ZDL_BASE_SCHEMA = """
CREATE TABLE IF NOT EXISTS docs(
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
CREATE INDEX IF NOT EXISTS idx_docs_project ON docs(project, folder);
CREATE INDEX IF NOT EXISTS idx_docs_type ON docs(doc_type);
CREATE INDEX IF NOT EXISTS idx_docs_hash ON docs(project, content_hash);

CREATE TABLE IF NOT EXISTS folders(
    id         INTEGER PRIMARY KEY,
    project    TEXT NOT NULL,
    path       TEXT NOT NULL DEFAULT '',
    created_at TEXT,
    UNIQUE(project, path)
);

CREATE TABLE IF NOT EXISTS kb_off(
    project TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS chunks(
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
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks(chunk_type);

CREATE TABLE IF NOT EXISTS blocks(
    doc_id INTEGER NOT NULL,
    page   INTEGER NOT NULL,
    seq    INTEGER NOT NULL,
    x0 REAL, y0 REAL, x1 REAL, y1 REAL,
    text   TEXT,
    PRIMARY KEY(doc_id, page, seq)
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    body_tok,
    title_tok,
    docno_tok,
    dept_tok,
    tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS chunk_emb(
    chunk_id    INTEGER PRIMARY KEY,
    dim         INTEGER NOT NULL,
    vec         BLOB NOT NULL,
    model       TEXT,
    provider_id TEXT
);

CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
"""


def get_unified_db_path(base_dir: str) -> str:
    return os.path.join(base_dir, "data", UNIFIED_DB_NAME)


def configure_connection(con: sqlite3.Connection, *, readonly: bool = False) -> sqlite3.Connection:
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout=15000")
    if not readonly:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA synchronous=NORMAL")
        con.execute("PRAGMA temp_store=MEMORY")
    return con


def connect(db_path: str, *, readonly: bool = False, timeout: float = 30.0) -> sqlite3.Connection:
    if readonly:
        uri = f"file:{db_path}?mode=ro"
        con = sqlite3.connect(uri, uri=True, timeout=timeout, check_same_thread=False)
    else:
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        con = sqlite3.connect(db_path, timeout=timeout, check_same_thread=False)
    return configure_connection(con, readonly=readonly)


@contextlib.contextmanager
def transaction(db_path: str, timeout: float = 30.0):
    con = connect(db_path, readonly=False, timeout=timeout)
    try:
        with con:
            yield con
    finally:
        con.close()


def _migration_done(con: sqlite3.Connection, name: str) -> bool:
    row = con.execute("SELECT 1 FROM o2_migrations WHERE name=?", (name,)).fetchone()
    return row is not None


def _mark_migration(con: sqlite3.Connection, name: str, note: str = "") -> None:
    con.execute(
        "INSERT OR REPLACE INTO o2_migrations(name, applied_at, note) VALUES (?, ?, ?)",
        (name, int(time.time()), note[:500]),
    )


def _table_exists(con: sqlite3.Connection, schema: str, table: str) -> bool:
    row = con.execute(
        f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row is not None


def _table_columns(con: sqlite3.Connection, schema: str, table: str) -> list[str]:
    rows = con.execute(f'PRAGMA {schema}.table_info("{table}")').fetchall()
    return [str(r[1]) for r in rows]


def _copy_table_common(con: sqlite3.Connection, src_alias: str, table: str, *, target_table: str = "") -> int:
    dst = target_table or table
    if not _table_exists(con, src_alias, table) or not _table_exists(con, "main", dst):
        return 0
    src_cols = _table_columns(con, src_alias, table)
    dst_cols = set(_table_columns(con, "main", dst))
    common = [c for c in src_cols if c in dst_cols]
    if not common:
        return 0
    cols_sql = ", ".join(f'"{c}"' for c in common)
    cur = con.execute(
        f'INSERT OR IGNORE INTO main."{dst}" ({cols_sql}) SELECT {cols_sql} FROM {src_alias}."{table}"'
    )
    return max(0, int(cur.rowcount or 0))


def _ensure_news_tables_from_legacy(con: sqlite3.Connection, legacy_news_path: str) -> None:
    """Create news tables matching legacy schema if not yet present, then copy rows."""
    con.execute("ATTACH DATABASE ? AS leg_news", (legacy_news_path,))
    try:
        ddl_rows = con.execute(
            """SELECT name, sql FROM leg_news.sqlite_master
               WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL"""
        ).fetchall()
        for nm, ddl in ddl_rows:
            if not _table_exists(con, "main", nm):
                stmt = str(ddl).replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1)
                con.execute(stmt)
        idx_rows = con.execute(
            """SELECT sql FROM leg_news.sqlite_master
               WHERE type='index' AND sql IS NOT NULL"""
        ).fetchall()
        for (ddl,) in idx_rows:
            stmt = str(ddl).replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1)
            stmt = stmt.replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", 1)
            try:
                con.execute(stmt)
            except sqlite3.Error:
                pass
        copied = {}
        for nm, _ in ddl_rows:
            copied[nm] = _copy_table_common(con, "leg_news", nm)
        con.commit()
    finally:
        con.execute("DETACH DATABASE leg_news")


def init_unified_db(base_dir: str, bundled_zdl_path: str = "") -> str:
    """Ensure data/o2.sqlite exists with the full unified schema and migrate legacy SQLite files once."""
    db_path = get_unified_db_path(base_dir)
    norm_key = os.path.normcase(os.path.abspath(db_path))
    with _INIT_LOCK:
        if norm_key in _INITIALIZED and os.path.isfile(db_path):
            return db_path

        data_dir = os.path.join(base_dir, "data")
        os.makedirs(data_dir, exist_ok=True)

        con = connect(db_path, readonly=False)
        try:
            con.executescript(UNIFIED_SCHEMA)
            con.executescript(ZDL_BASE_SCHEMA)
            con.commit()

            # 1. Migrate legacy zdl.sqlite (institutional KB)
            if not _migration_done(con, "migrate_zdl_v1"):
                zdl_src = os.path.join(data_dir, "zdl.sqlite")
                if not os.path.isfile(zdl_src) and bundled_zdl_path and os.path.isfile(bundled_zdl_path):
                    zdl_src = bundled_zdl_path
                note = "empty"
                if os.path.isfile(zdl_src):
                    con.execute("ATTACH DATABASE ? AS leg_zdl", (zdl_src,))
                    try:
                        cnts = {}
                        for t in ("docs", "folders", "kb_off", "chunks", "blocks", "chunk_emb", "meta"):
                            cnts[t] = _copy_table_common(con, "leg_zdl", t)
                        if _table_exists(con, "leg_zdl", "chunks_fts"):
                            cur_fts = con.execute("SELECT COUNT(*) FROM main.chunks_fts").fetchone()[0]
                            if cur_fts == 0:
                                con.execute(
                                    """INSERT INTO main.chunks_fts(rowid, body_tok, title_tok, docno_tok, dept_tok)
                                       SELECT rowid, body_tok, title_tok, docno_tok, dept_tok FROM leg_zdl.chunks_fts"""
                                )
                        con.commit()
                        note = json.dumps(cnts, ensure_ascii=False)
                    finally:
                        con.execute("DETACH DATABASE leg_zdl")
                _mark_migration(con, "migrate_zdl_v1", note)
                con.commit()

            # 2. Migrate legacy news.sqlite
            if not _migration_done(con, "migrate_news_v1"):
                news_src = os.path.join(data_dir, "news.sqlite")
                note = "empty"
                if os.path.isfile(news_src):
                    _ensure_news_tables_from_legacy(con, news_src)
                    note = "migrated"
                _mark_migration(con, "migrate_news_v1", note)
                con.commit()

            # 3. Migrate legacy market.sqlite
            if not _migration_done(con, "migrate_market_v1"):
                mkt_src = os.path.join(data_dir, "market.sqlite")
                note = "empty"
                if os.path.isfile(mkt_src):
                    con.execute("ATTACH DATABASE ? AS leg_mkt", (mkt_src,))
                    try:
                        c1 = _copy_table_common(con, "leg_mkt", "kv_cache")
                        c2 = _copy_table_common(con, "leg_mkt", "watchlist")
                        con.commit()
                        note = f"kv_cache={c1},watchlist={c2}"
                    finally:
                        con.execute("DETACH DATABASE leg_mkt")
                _mark_migration(con, "migrate_market_v1", note)
                con.commit()

            # 4. Migrate legacy quant.sqlite
            if not _migration_done(con, "migrate_quant_v1"):
                q_src = os.path.join(data_dir, "quant.sqlite")
                note = "empty"
                if os.path.isfile(q_src):
                    con.execute("ATTACH DATABASE ? AS leg_q", (q_src,))
                    try:
                        c1 = _copy_table_common(con, "leg_q", "quant_jobs")
                        c2 = _copy_table_common(con, "leg_q", "factor_leaderboard")
                        con.commit()
                        note = f"jobs={c1},lb={c2}"
                    finally:
                        con.execute("DETACH DATABASE leg_q")
                _mark_migration(con, "migrate_quant_v1", note)
                con.commit()

            # 5. Migrate legacy quant_bars.sqlite -> market_bars + instruments
            if not _migration_done(con, "migrate_quant_bars_v1"):
                qb_src = os.path.join(data_dir, "quant_bars.sqlite")
                note = "empty"
                if os.path.isfile(qb_src):
                    now = int(time.time())
                    con.execute("ATTACH DATABASE ? AS leg_qb", (qb_src,))
                    try:
                        if _table_exists(con, "leg_qb", "hist_bars"):
                            cur = con.execute(
                                """INSERT OR IGNORE INTO main.market_bars
                                   (symbol, secid, interval, trade_date, name, market, industry,
                                    open, high, low, close, volume, amount, adj_factor, pct_chg, source, updated_at)
                                   SELECT symbol, secid, '1d', substr(trade_date, 1, 10), name, market, '',
                                          open, high, low, close, volume, amount, 1.0, pct_chg, 'migrated', ?
                                   FROM leg_qb.hist_bars""",
                                (now,),
                            )
                            bars_cnt = max(0, int(cur.rowcount or 0))
                            con.execute(
                                """INSERT OR IGNORE INTO main.instruments
                                   (symbol, secid, name, market, updated_at)
                                   SELECT symbol, MAX(secid), MAX(name), MAX(market), ?
                                   FROM leg_qb.hist_bars GROUP BY symbol""",
                                (now,),
                            )
                            con.commit()
                            note = f"bars={bars_cnt}"
                    finally:
                        con.execute("DETACH DATABASE leg_qb")
                _mark_migration(con, "migrate_quant_bars_v1", note)
                con.commit()

            # 6. Migrate legacy universe.json -> quant_universes
            if not _migration_done(con, "migrate_universe_json_v1"):
                u_json = os.path.join(data_dir, "quant_store", "universe.json")
                note = "empty"
                if os.path.isfile(u_json):
                    try:
                        with open(u_json, "r", encoding="utf-8") as f:
                            raw = json.load(f)
                        unis = raw.get("universes") or {}
                        upd = int(raw.get("updated_at") or time.time())
                        for uid, meta in unis.items():
                            con.execute(
                                """INSERT OR REPLACE INTO quant_universes(universe_id, label, symbols_json, updated_at)
                                   VALUES (?, ?, ?, ?)""",
                                (
                                    str(uid),
                                    str((meta or {}).get("label") or uid),
                                    json.dumps((meta or {}).get("symbols") or [], ensure_ascii=False),
                                    upd,
                                ),
                            )
                        con.commit()
                        note = f"universes={len(unis)}"
                    except Exception as e:
                        note = f"err:{str(e)[:120]}"
                _mark_migration(con, "migrate_universe_json_v1", note)
                con.commit()
        finally:
            con.close()

        _INITIALIZED.add(norm_key)
        return db_path
