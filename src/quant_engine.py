from __future__ import annotations

import contextlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import uuid

SCHEMA = """
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
"""

# Lightweight static factor catalog mirror so UI works immediately even before worker cold start
STRATEGY_TEMPLATES: list[dict] = [
    {
        "id": "dual_ma",
        "engine": "vectorbt",
        "name": "双均线趋势跟踪 (EMA/SMA)",
        "category": "单标的择时",
        "desc": "经典快慢均线金叉买入、死叉卖出，支持 EMA/SMA 切换与止盈止损，使用 VectorBT 精确撮合。",
        "default_params": {"fast": 10, "slow": 30, "ema": True},
    },
    {
        "id": "macd_trend",
        "engine": "vectorbt",
        "name": "MACD 动量共振 + 均线过滤",
        "category": "单标的择时",
        "desc": "MACD 柱状由负转正且收盘位于趋势均线之上做多，动能转负平仓，过滤震荡假突破。",
        "default_params": {"fast": 12, "slow": 26, "signal": 9, "ma_filter": 60},
    },
    {
        "id": "rsi_boll_reversion",
        "engine": "vectorbt",
        "name": "RSI + 布林带均值回归",
        "category": "单标的择时",
        "desc": "恐慌超卖（RSI 低位 + 触及布林下轨）抄底，反弹至超买区或布林上轨止盈。",
        "default_params": {"rsi_window": 14, "rsi_low": 32, "rsi_high": 68, "boll_window": 20},
    },
    {
        "id": "turtle_breakout",
        "engine": "vectorbt",
        "name": "海龟唐奇安通道突破",
        "category": "单标的择时",
        "desc": "经典海龟交易法则：突破 N 日新高做多，跌破 M 日新低离场，适合指数/黄金/原油/科技龙头。",
        "default_params": {"entry_window": 20, "exit_window": 10},
    },
    {
        "id": "etf_momentum_rotation",
        "engine": "vectorbt",
        "name": "多资产 / ETF 风险调整动量轮动",
        "category": "多资产组合",
        "desc": "定期对整个 ETF 池或全球资产池按风险调整动量打分，买入 Top-K 强势资产；支持绝对动量空仓避险。",
        "default_params": {"lookback": 20, "rebalance_days": 10, "top_k": 3, "abs_momentum_filter": True, "risk_adjusted": True},
    },
    {
        "id": "factor_timing",
        "engine": "vectorbt",
        "name": "成熟因子库单标的择时",
        "category": "因子择时",
        "desc": "从 Alpha158 / Alpha101 / TA-Lib 因子库任选一个因子（或输入自定义公式），按历史滚动分位数触发交易。",
        "default_params": {"factor_id": "ta_rsi14", "pct_window": 120, "buy_quantile": 0.75, "sell_quantile": 0.30},
    },
    {
        "id": "custom_code",
        "engine": "vectorbt",
        "name": "自定义 Python 策略代码 (聚宽/VBT风格)",
        "category": "自定义代码",
        "desc": "在线编写 Python 策略逻辑（可直接调用 open/high/low/close/volume/pd/np/talib/qf 生成 entries 和 exits 信号），完整接入 K线复盘与绩效归因。",
        "default_params": {"code_name": "自定义策略", "code": ""},
    },
    {
        "id": "qlib_multifactor",
        "engine": "qlib",
        "name": "A股多因子选股 (Qlib / LightGBM TopK-Dropout)",
        "category": "全市场多因子",
        "desc": "基于 Qlib Alpha158 / WorldQuant Alpha101 / 基本面因子矩阵，使用 LightGBM 或 IC 加权预测横截面超额收益，严格模拟 A 股 T+1、涨跌停与印花税。",
        "default_params": {
            "model_type": "lightgbm",
            "factor_set": "alpha158_core",
            "topk": 15,
            "n_drop": 3,
            "rebalance_days": 5,
            "label_horizon": 5,
            "train_ratio": 0.55,
        },
    },
]


class QuantManager:
    """Manages isolated .venv_quant worker execution, SQLite job history & local quant data warehouse."""

    def __init__(self, base_dir: str, db_path: str, cfg, market_mgr=None):
        self.base_dir = base_dir
        self.db_path = db_path
        self.store_dir = os.path.join(base_dir, "data", "quant_store")
        self.cfg = cfg
        self.market_mgr = market_mgr
        self._lock = threading.Lock()
        self._env_cache: dict | None = None
        self._env_cache_at: float = 0.0
        self._catalog_cache: list[dict] | None = None
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        os.makedirs(self.store_dir, exist_ok=True)
        with self.con() as c:
            c.executescript(SCHEMA)
            # Mark orphaned running jobs from previous crash as failed
            c.execute(
                "UPDATE quant_jobs SET status='failed', error='服务重启导致任务中断' WHERE status IN ('pending', 'running')"
            )

    @contextlib.contextmanager
    def con(self):
        c = sqlite3.connect(self.db_path, timeout=30.0, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA busy_timeout=5000")
        try:
            with c:
                yield c
        finally:
            c.close()

    def quant_python(self) -> str:
        cands = [
            os.path.join(self.base_dir, ".venv_quant", "Scripts", "python.exe"),
            os.path.join(self.base_dir, ".venv_quant", "bin", "python"),
        ]
        for p in cands:
            if os.path.isfile(p):
                return p
        return sys.executable

    def worker_script(self) -> str:
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), "quant_worker.py")

    def _run_worker_sync(self, cmd: str, params: dict | None = None, timeout: float = 60.0) -> dict:
        py = self.quant_python()
        script = self.worker_script()
        td = tempfile.mkdtemp(prefix="o2-qsync-")
        in_path = os.path.join(td, "in.json")
        out_path = os.path.join(td, "out.json")
        try:
            with open(in_path, "w", encoding="utf-8") as f:
                json.dump(params or {}, f, ensure_ascii=False)
            creation = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            proc = subprocess.run(
                [py, script, "--cmd", cmd, "--store", self.store_dir, "--in", in_path, "--out", out_path],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                creationflags=creation,
            )
            if os.path.isfile(out_path):
                with open(out_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            return {"ok": False, "error": (proc.stderr or proc.stdout or f"Worker 退出码 {proc.returncode}")[-800:]}
        except Exception as e:
            return {"ok": False, "error": str(e)}
        finally:
            try:
                for fn in (in_path, out_path):
                    if os.path.isfile(fn):
                        os.remove(fn)
                os.rmdir(td)
            except OSError:
                pass

    def status(self, force: bool = False) -> dict:
        now = time.time()
        if not force and self._env_cache and (now - self._env_cache_at) < 20.0:
            return self._env_cache
        res = self._run_worker_sync("env_check", {}, timeout=25.0)
        res["quant_python"] = self.quant_python()
        res["isolated_venv"] = ".venv_quant" in self.quant_python().replace("\\", "/")
        res["templates"] = STRATEGY_TEMPLATES
        if self.market_mgr is not None:
            try:
                base, tok = self.market_mgr._tushare_creds()
                res["tushare_ready"] = bool(base and tok)
            except Exception:
                res["tushare_ready"] = False
        if res.get("ok"):
            self._env_cache = res
            self._env_cache_at = now
        return res

    def factor_catalog(self) -> dict:
        if self._catalog_cache is not None:
            return {"ok": True, "items": self._catalog_cache, "templates": STRATEGY_TEMPLATES}
        res = self._run_worker_sync("factor_catalog", {}, timeout=20.0)
        if res.get("ok") and isinstance(res.get("items"), list):
            self._catalog_cache = res["items"]
            return {"ok": True, "items": self._catalog_cache, "templates": STRATEGY_TEMPLATES}
        return res

    def list_jobs(self, job_type: str = "", limit: int = 40) -> list[dict]:
        lim = max(1, min(100, int(limit or 40)))
        with self.con() as c:
            if job_type:
                rows = c.execute(
                    """SELECT id, job_type, title, engine, status, progress, stage, params_json, error,
                              created_at, updated_at, finished_at, result_json
                       FROM quant_jobs WHERE job_type=? ORDER BY created_at DESC LIMIT ?""",
                    (job_type, lim),
                ).fetchall()
            else:
                rows = c.execute(
                    """SELECT id, job_type, title, engine, status, progress, stage, params_json, error,
                              created_at, updated_at, finished_at, result_json
                       FROM quant_jobs ORDER BY created_at DESC LIMIT ?""",
                    (lim,),
                ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["params"] = json.loads(d.pop("params_json") or "{}")
            except Exception:
                d["params"] = {}
            summary = {}
            raw_res = d.pop("result_json") or ""
            if raw_res:
                try:
                    rj = json.loads(raw_res)
                    if rj.get("kpis"):
                        summary = {
                            "total_return": rj["kpis"].get("total_return"),
                            "annual_return": rj["kpis"].get("annual_return"),
                            "sharpe": rj["kpis"].get("sharpe"),
                            "max_drawdown": rj["kpis"].get("max_drawdown"),
                            "excess_return": rj["kpis"].get("excess_return"),
                        }
                    elif rj.get("summary"):
                        s0 = rj["summary"][1] if len(rj["summary"]) > 1 else rj["summary"][0]
                        summary = {
                            "ic_mean": s0.get("ic_mean"),
                            "icir": s0.get("icir"),
                            "period": s0.get("period"),
                        }
                    elif rj.get("synced_bars") is not None:
                        summary = {"synced_bars": rj.get("synced_bars")}
                except Exception:
                    pass
            d["summary"] = summary
            out.append(d)
        return out

    def get_job(self, job_id: str) -> dict | None:
        with self.con() as c:
            row = c.execute("SELECT * FROM quant_jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        try:
            d["params"] = json.loads(d.pop("params_json") or "{}")
        except Exception:
            d["params"] = {}
        raw_res = d.pop("result_json") or ""
        if raw_res:
            try:
                d["result"] = json.loads(raw_res)
            except Exception:
                d["result"] = None
        else:
            d["result"] = None
        return d

    def delete_job(self, job_id: str) -> bool:
        with self._lock, self.con() as c:
            cur = c.execute("DELETE FROM quant_jobs WHERE id=?", (job_id,))
            return cur.rowcount > 0

    def get_leaderboard(self, universe: str = "hs300") -> dict:
        with self.con() as c:
            rows = c.execute(
                "SELECT * FROM factor_leaderboard WHERE universe=? ORDER BY ABS(icir) DESC",
                (universe,),
            ).fetchall()
        return {"ok": True, "universe": universe, "items": [dict(r) for r in rows]}

    def _upsert_leaderboard(self, items: list[dict]) -> None:
        if not items:
            return
        now = int(time.time())
        with self._lock, self.con() as c:
            for it in items:
                fid = str(it.get("factor_id") or "")
                uni = str(it.get("universe") or "hs300")
                if not fid or fid == "custom":
                    continue
                c.execute(
                    """INSERT INTO factor_leaderboard
                       (factor_id, universe, horizon, ic_1d, ic_mean, icir, ic_win_rate, ls_spread_bps, turnover_pct, tested_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(factor_id, universe) DO UPDATE SET
                       horizon=excluded.horizon, ic_1d=excluded.ic_1d, ic_mean=excluded.ic_mean,
                       icir=excluded.icir, ic_win_rate=excluded.ic_win_rate,
                       ls_spread_bps=excluded.ls_spread_bps, turnover_pct=excluded.turnover_pct,
                       tested_at=excluded.tested_at""",
                    (
                        fid, uni, str(it.get("horizon") or "5D"),
                        float(it.get("ic_1d") or 0.0), float(it.get("ic_mean") or 0.0),
                        float(it.get("icir") or 0.0), float(it.get("ic_win_rate") or 0.0),
                        float(it.get("ls_spread_bps") or 0.0), float(it.get("turnover_pct") or 0.0),
                        int(it.get("tested_at") or now),
                    ),
                )

    def store_symbols(self) -> dict:
        return self._run_worker_sync("store_symbols", {}, timeout=25.0)

    def factor_corr(self, params: dict) -> dict:
        return self._run_worker_sync("factor_corr", params, timeout=45.0)

    def _update_job(self, job_id: str, **fields) -> None:
        if not fields:
            return
        fields["updated_at"] = int(time.time())
        cols = ", ".join(f"{k}=?" for k in fields.keys())
        vals = list(fields.values()) + [job_id]
        with self._lock, self.con() as c:
            c.execute(f"UPDATE quant_jobs SET {cols} WHERE id=?", vals)

    def submit_job(self, job_type: str, title: str, engine: str, params: dict, *, wait: bool = False) -> dict:
        job_id = uuid.uuid4().hex[:12]
        now = int(time.time())
        # Store sanitized params in DB (never persist Tushare token in sqlite)
        safe_params = {k: v for k, v in params.items() if k not in ("tushare_token", "tushare_base")}
        with self._lock, self.con() as c:
            c.execute(
                """INSERT INTO quant_jobs (id, job_type, title, engine, status, progress, stage, params_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 'pending', 2, '任务排队中...', ?, ?, ?)""",
                (job_id, job_type, title, engine, json.dumps(safe_params, ensure_ascii=False), now, now),
            )

        # Inject credentials for sync_data only in temporary worker file
        worker_params = dict(params)
        if job_type == "sync_data" and self.market_mgr is not None:
            try:
                base, tok = self.market_mgr._tushare_creds()
                worker_params["tushare_base"] = base
                worker_params["tushare_token"] = tok
                worker_params["proxy_url"] = self.market_mgr.resolve_proxy()
            except Exception:
                pass

        t = threading.Thread(
            target=self._exec_job_thread,
            args=(job_id, job_type, worker_params),
            daemon=True,
        )
        t.start()
        if wait:
            t.join(timeout=300.0)
            return self.get_job(job_id) or {"id": job_id, "status": "failed", "error": "任务读取失败"}
        return {
            "ok": True,
            "job_id": job_id,
            "status": "pending",
            "title": title,
            "engine": engine,
        }

    def _exec_job_thread(self, job_id: str, job_type: str, worker_params: dict) -> None:
        self._update_job(job_id, status="running", progress=5, stage="正在启动量化计算引擎...")
        py = self.quant_python()
        script = self.worker_script()
        td = tempfile.mkdtemp(prefix=f"o2-qjob-{job_id}-")
        in_path = os.path.join(td, "in.json")
        out_path = os.path.join(td, "out.json")

        try:
            with open(in_path, "w", encoding="utf-8") as f:
                json.dump(worker_params, f, ensure_ascii=False)

            creation = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            proc = subprocess.Popen(
                [py, script, "--cmd", job_type, "--store", self.store_dir, "--in", in_path, "--out", out_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=creation,
            )

            stderr_tail: list[str] = []
            assert proc.stderr is not None
            for raw_line in proc.stderr:
                line = raw_line.strip()
                if line.startswith("@@PROGRESS@@"):
                    try:
                        p = json.loads(line[len("@@PROGRESS@@"):])
                        self._update_job(
                            job_id,
                            progress=max(0, min(99, int(p.get("progress") or 0))),
                            stage=str(p.get("stage") or ""),
                        )
                    except Exception:
                        pass
                elif line:
                    stderr_tail.append(line)
                    if len(stderr_tail) > 25:
                        stderr_tail.pop(0)

            proc.wait(timeout=600)

            res = None
            if os.path.isfile(out_path):
                with open(out_path, "r", encoding="utf-8") as f:
                    res = json.load(f)

            if res and res.get("ok"):
                if job_type == "sync_data":
                    self._env_cache = None
                elif job_type == "factor_batch" and isinstance(res.get("items"), list):
                    self._upsert_leaderboard(res["items"])
                elif job_type == "factor_eval" and res.get("summary"):
                    summ = res["summary"]
                    s5 = next((x for x in summ if x.get("period") == "5D"), summ[0])
                    s1 = next((x for x in summ if x.get("period") == "1D"), s5)
                    self._upsert_leaderboard([{
                        "factor_id": res.get("factor_id"),
                        "universe": res.get("universe") or "hs300",
                        "horizon": s5.get("period") or "5D",
                        "ic_1d": s1.get("ic_mean") or 0.0,
                        "ic_mean": s5.get("ic_mean") or 0.0,
                        "icir": s5.get("icir") or 0.0,
                        "ic_win_rate": s5.get("ic_win_rate") or 0.0,
                        "ls_spread_bps": s5.get("ls_spread_bps") or 0.0,
                        "turnover_pct": s5.get("top_turnover_pct") or 0.0,
                    }])
                self._update_job(
                    job_id,
                    status="done",
                    progress=100,
                    stage="计算完成",
                    result_json=json.dumps(res, ensure_ascii=False),
                    finished_at=int(time.time()),
                )
            else:
                err_msg = (res or {}).get("error") or "\n".join(stderr_tail[-6:]) or f"引擎异常退出 (code={proc.returncode})"
                self._update_job(
                    job_id,
                    status="failed",
                    progress=100,
                    stage="执行失败",
                    error=str(err_msg)[:2000],
                    finished_at=int(time.time()),
                )
        except Exception as e:
            self._update_job(
                job_id,
                status="failed",
                progress=100,
                stage="执行异常",
                error=str(e)[:2000],
                finished_at=int(time.time()),
            )
        finally:
            try:
                for fn in (in_path, out_path):
                    if os.path.isfile(fn):
                        os.remove(fn)
                os.rmdir(td)
            except OSError:
                pass
