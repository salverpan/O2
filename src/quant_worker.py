from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import json
import math
import os
import re
import sqlite3
import struct
import sys
import time
import traceback
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import duckdb
except Exception:
    duckdb = None

try:
    import vectorbt as vbt
except Exception:
    vbt = None

try:
    import alphalens
    from alphalens import performance as al_perf
    from alphalens import utils as al_utils
except Exception:
    alphalens = None
    al_perf = None
    al_utils = None

try:
    import lightgbm as lgb
except Exception:
    lgb = None

try:
    import qlib
except Exception:
    qlib = None

try:
    import talib as _talib
except Exception:
    _talib = None

try:
    import ta as _ta_lib
except Exception:
    _ta_lib = None

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import quant_factors as qf

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

ETF_POOL_DEFAULTS: list[tuple[str, str]] = [
    ("510300.SH", "沪深300ETF"),
    ("510500.SH", "中证500ETF"),
    ("510050.SH", "上证50ETF"),
    ("159915.SZ", "创业板ETF"),
    ("588000.SH", "科创50ETF"),
    ("510880.SH", "红利ETF"),
    ("512880.SH", "证券ETF"),
    ("512800.SH", "银行ETF"),
    ("512010.SH", "医药ETF"),
    ("512480.SH", "半导体ETF"),
    ("515030.SH", "新能源车ETF"),
    ("512690.SH", "酒ETF"),
    ("512660.SH", "军工ETF"),
    ("515790.SH", "光伏ETF"),
    ("515220.SH", "煤炭ETF"),
    ("512400.SH", "有色金属ETF"),
    ("513050.SH", "中概互联ETF"),
    ("513180.SH", "恒生科技ETF"),
    ("513100.SH", "纳指ETF"),
    ("513500.SH", "标普500ETF"),
    ("518880.SH", "黄金ETF"),
    ("511090.SH", "30年国债ETF"),
    ("511260.SH", "十年国债ETF"),
    ("159928.SZ", "消费ETF"),
]

GLOBAL_CORE_DEFAULTS: list[tuple[str, str, str]] = [
    ("100.SPX", "^GSPC", "标普500指数"),
    ("100.NDX", "^NDX", "纳斯达克100指数"),
    ("100.DJIA", "^DJI", "道琼斯指数"),
    ("100.HSI", "^HSI", "恒生指数"),
    ("101.GC00Y", "GC=F", "COMEX黄金"),
    ("101.SI00Y", "SI=F", "COMEX白银"),
    ("112.B00Y", "BZ=F", "布伦特原油"),
    ("102.CL00Y", "CL=F", "WTI原油"),
    ("101.HG00Y", "HG=F", "COMEX铜"),
    ("CG.bitcoin", "BTC-USD", "Bitcoin"),
    ("CG.ethereum", "ETH-USD", "Ethereum"),
    ("CG.solana", "SOL-USD", "Solana"),
]

US_STOCKS_DEFAULTS: list[tuple[str, str, str, str]] = [
    # (secid, yf_sym, name, industry)
    ("105.NVDA", "NVDA", "英伟达", "半导体"),
    ("105.AAPL", "AAPL", "苹果", "科技硬件"),
    ("105.MSFT", "MSFT", "微软", "软件云"),
    ("105.AMZN", "AMZN", "亚马逊", "电商云"),
    ("105.GOOGL", "GOOGL", "谷歌-A", "互联网"),
    ("105.META", "META", "Meta", "互联网"),
    ("105.TSLA", "TSLA", "特斯拉", "新能源车"),
    ("105.AVGO", "AVGO", "博通", "半导体"),
    ("106.TSM", "TSM", "台积电ADR", "半导体"),
    ("106.LLY", "LLY", "礼来", "医药"),
    ("106.JPM", "JPM", "摩根大通", "金融"),
    ("106.V", "V", "Visa", "支付金融"),
    ("106.MA", "MA", "万事达", "支付金融"),
    ("106.UNH", "UNH", "联合健康", "医疗保险"),
    ("106.XOM", "XOM", "埃克森美孚", "能源"),
    ("105.COST", "COST", "开市客", "零售消费"),
    ("106.HD", "HD", "家得宝", "零售消费"),
    ("106.PG", "PG", "宝洁", "必选消费"),
    ("106.JNJ", "JNJ", "强生", "医药"),
    ("106.ORCL", "ORCL", "甲骨文", "软件云"),
    ("105.NFLX", "NFLX", "奈飞", "流媒体"),
    ("105.AMD", "AMD", "超威半导体", "半导体"),
    ("106.CRM", "CRM", "Salesforce", "软件云"),
    ("105.ADBE", "ADBE", "Adobe", "软件云"),
    ("105.QCOM", "QCOM", "高通", "半导体"),
    ("105.TXN", "TXN", "德州仪器", "半导体"),
    ("105.INTU", "INTU", "Intuit", "软件"),
    ("105.AMAT", "AMAT", "应用材料", "半导体设备"),
    ("105.MU", "MU", "美光科技", "存储芯片"),
    ("105.LRCX", "LRCX", "泛林集团", "半导体设备"),
    ("105.ARM", "ARM", "Arm", "半导体"),
    ("105.PLTR", "PLTR", "Palantir", "AI软件"),
    ("105.PANW", "PANW", "Palo Alto", "网络安全"),
    ("105.CRWD", "CRWD", "CrowdStrike", "网络安全"),
    ("105.COIN", "COIN", "Coinbase", "加密金融"),
    ("105.MSTR", "MSTR", "Strategy", "AI/BTC"),
    ("106.BRK-B", "BRK-B", "伯克希尔-B", "综合金融"),
    ("106.GS", "GS", "高盛", "投行"),
    ("106.BAC", "BAC", "美国银行", "银行"),
    ("106.CAT", "CAT", "卡特彼勒", "工业机械"),
    ("106.GE", "GE", "GE航空", "航空军工"),
    ("106.BABA", "BABA", "阿里巴巴(US)", "中概电商"),
]

US_ETF_DEFAULTS: list[tuple[str, str, str, str]] = [
    ("107.SPY", "SPY", "标普500 ETF", "美股宽基"),
    ("105.QQQ", "QQQ", "纳指100 ETF", "美股科技"),
    ("107.IWM", "IWM", "罗素2000小盘ETF", "美股小盘"),
    ("107.DIA", "DIA", "道指30 ETF", "美股蓝筹"),
    ("105.TLT", "TLT", "20年美债 ETF", "美债长久期"),
    ("105.IEF", "IEF", "7-10年美债 ETF", "美债中久期"),
    ("107.GLD", "GLD", "SPDR黄金 ETF", "贵金属"),
    ("107.SLV", "SLV", "白银 ETF", "贵金属"),
    ("107.USO", "USO", "美国原油 ETF", "能源"),
    ("105.SMH", "SMH", "半导体 ETF", "科技行业"),
    ("107.XLK", "XLK", "科技板块 ETF", "行业ETF"),
    ("107.XLF", "XLF", "金融板块 ETF", "行业ETF"),
    ("107.XLE", "XLE", "能源板块 ETF", "行业ETF"),
    ("107.XLV", "XLV", "医疗板块 ETF", "行业ETF"),
]

HK_STOCKS_DEFAULTS: list[tuple[str, str, str, str]] = [
    ("116.00700", "0700.HK", "腾讯控股", "港股科技"),
    ("116.09988", "9988.HK", "阿里巴巴-W", "港股科技"),
    ("116.03690", "3690.HK", "美团-W", "港股科技"),
    ("116.01810", "1810.HK", "小米集团-W", "港股科技"),
    ("116.09618", "9618.HK", "京东集团-SW", "港股科技"),
    ("116.09999", "9999.HK", "网易-S", "港股科技"),
    ("116.00981", "0981.HK", "中芯国际", "港股半导体"),
    ("116.01211", "1211.HK", "比亚迪股份", "港股汽车"),
    ("116.00941", "0941.HK", "中国移动", "港股红利"),
    ("116.00883", "0883.HK", "中国海洋石油", "港股能源"),
    ("116.00388", "0388.HK", "香港交易所", "港股金融"),
    ("116.02318", "2318.HK", "中国平安(HK)", "港股金融"),
    ("116.00939", "0939.HK", "建设银行(HK)", "港股银行"),
    ("116.01299", "1299.HK", "友邦保险", "港股保险"),
    ("116.09868", "9868.HK", "小鹏汽车-W", "港股汽车"),
    ("116.02015", "2015.HK", "理想汽车-W", "港股汽车"),
    ("116.00005", "0005.HK", "汇丰控股", "港股银行"),
    ("116.01024", "1024.HK", "快手-W", "港股科技"),
]


def emit_progress(pct: int, stage: str) -> None:
    try:
        sys.stderr.write(f"@@PROGRESS@@{json.dumps({'progress': int(pct), 'stage': stage}, ensure_ascii=False)}\n")
        sys.stderr.flush()
    except Exception:
        pass


def _safe_float(v, default: float = 0.0) -> float:
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except Exception:
        return default


def _round_list(arr, ndigits: int = 4) -> list:
    out = []
    for x in arr:
        if x is None:
            out.append(None)
            continue
        try:
            fx = float(x)
            if math.isnan(fx) or math.isinf(fx):
                out.append(None)
            else:
                out.append(round(fx, ndigits))
        except Exception:
            out.append(None)
    return out


# ---------------------------------------------------------------------------
# HTTP / Tushare / YahooFinance helpers (self-contained in worker)
# ---------------------------------------------------------------------------

def _http_json(url: str, *, post_json: dict | None = None, proxy_url: str = "", timeout: float = 12.0):
    hdrs = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    data = None
    if post_json is not None:
        data = json.dumps(post_json, ensure_ascii=False).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs)
    if proxy_url == "__DIRECT__":
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    elif proxy_url:
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})
        )
    else:
        opener = urllib.request.build_opener()
    with opener.open(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _ts_call(base: str, token: str, api_name: str, params: dict, fields: str = "", timeout: float = 15.0) -> list[dict]:
    if not base or not token:
        return []
    for attempt in range(2):
        try:
            res = _http_json(
                base,
                post_json={
                    "api_name": api_name,
                    "token": token,
                    "params": params,
                    "fields": fields,
                },
                proxy_url="__DIRECT__",
                timeout=timeout,
            )
            if isinstance(res, dict) and res.get("code") == 0:
                d = res.get("data") or {}
                flds = d.get("fields") or []
                items = d.get("items") or []
                return [{flds[i]: row[i] for i in range(min(len(flds), len(row)))} for row in items]
        except Exception:
            if attempt == 0:
                time.sleep(0.35)
    return []


def _secid_from_ts(ts_code: str) -> str:
    if "." not in ts_code:
        return ts_code
    code, suf = ts_code.split(".", 1)
    if suf == "SH":
        return f"1.{code}"
    if suf == "SZ":
        return f"0.{code}"
    if suf == "HK":
        return f"116.{code}"
    return ts_code


def _ts_from_secid(secid: str) -> tuple[str, str]:
    """Return (api_name, ts_code) for a secid or ts_code."""
    s = (secid or "").strip()
    if s.endswith((".SH", ".SZ")):
        code, suf = s.split(".", 1)
        if s in ("000001.SH", "000300.SH", "000905.SH", "399001.SZ", "399006.SZ", "399300.SZ"):
            return "index_daily", s
        if (suf == "SH" and code.startswith(("51", "56", "58"))) or (suf == "SZ" and code.startswith("15")):
            return "fund_daily", s
        return "daily", s
    if "." in s:
        mkt, code = s.split(".", 1)
        if mkt in ("0", "1") and code.isdigit():
            suf = "SH" if mkt == "1" else "SZ"
            tc = f"{code}.{suf}"
            if tc in ("000001.SH", "000300.SH", "000905.SH", "399001.SZ", "399006.SZ", "399300.SZ"):
                return "index_daily", tc
            if (mkt == "1" and code.startswith(("51", "56", "58"))) or (mkt == "0" and code.startswith("15")):
                return "fund_daily", tc
            return "daily", tc
    return "", ""


def _iso_date(td: str) -> str:
    s = str(td or "").strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return s[:10]


# ---------------------------------------------------------------------------
# Local Parquet + DuckDB + Qlib Binary Warehouse
# ---------------------------------------------------------------------------

def _store_paths(store_dir: str) -> dict[str, str]:
    os.makedirs(store_dir, exist_ok=True)
    return {
        "dir": store_dir,
        "bars": os.path.join(store_dir, "bars.parquet"),
        "basic": os.path.join(store_dir, "daily_basic.parquet"),
        "limit": os.path.join(store_dir, "stk_limit.parquet"),
        "universe": os.path.join(store_dir, "universe.json"),
        "qlib_bin": os.path.join(store_dir, "qlib_bin"),
    }


def _atomic_write_parquet(df: pd.DataFrame, path: str) -> None:
    tmp = path + ".tmp"
    df.to_parquet(tmp, index=False, compression="snappy")
    os.replace(tmp, path)


def _merge_parquet(path: str, new_df: pd.DataFrame, key_cols: list[str]) -> pd.DataFrame:
    if new_df is None or new_df.empty:
        if os.path.isfile(path):
            return pd.read_parquet(path)
        return pd.DataFrame()
    if os.path.isfile(path):
        try:
            old_df = pd.read_parquet(path)
            combined = pd.concat([old_df, new_df], ignore_index=True)
        except Exception:
            combined = new_df.copy()
    else:
        combined = new_df.copy()
    combined = combined.drop_duplicates(subset=key_cols, keep="last")
    combined = combined.sort_values(key_cols).reset_index(drop=True)
    _atomic_write_parquet(combined, path)
    return combined


def _dump_qlib_bin(bars_df: pd.DataFrame, qlib_dir: str, hs300_syms: list[str]) -> dict:
    """Export local bars_df into native Microsoft Qlib binary directory structure."""
    if bars_df is None or bars_df.empty:
        return {"ok": False, "symbols": 0, "days": 0}
    cal_dir = os.path.join(qlib_dir, "calendars")
    ins_dir = os.path.join(qlib_dir, "instruments")
    feat_dir = os.path.join(qlib_dir, "features")
    os.makedirs(cal_dir, exist_ok=True)
    os.makedirs(ins_dir, exist_ok=True)
    os.makedirs(feat_dir, exist_ok=True)

    df = bars_df.copy()
    df["trade_date"] = df["trade_date"].astype(str).str[:10]
    dates = sorted(df["trade_date"].unique().tolist())
    date_to_idx = {d: i for i, d in enumerate(dates)}

    with open(os.path.join(cal_dir, "day.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(dates) + "\n")

    all_ins_lines = []
    hs300_ins_lines = []
    hs300_set = set(hs300_syms)
    sym_count = 0

    for sym, grp in df.groupby("symbol"):
        grp = grp.sort_values("trade_date")
        if len(grp) < 10:
            continue
        first_d = grp["trade_date"].iloc[0]
        last_d = grp["trade_date"].iloc[-1]
        q_sym = str(sym).upper()
        all_ins_lines.append(f"{q_sym}\t{first_d}\t{last_d}")
        if sym in hs300_set:
            hs300_ins_lines.append(f"{q_sym}\t{first_d}\t{last_d}")

        start_idx = date_to_idx[first_d]
        end_idx = date_to_idx[last_d]
        span_len = end_idx - start_idx + 1
        sub_dir = os.path.join(feat_dir, q_sym.lower())
        os.makedirs(sub_dir, exist_ok=True)

        idx_arr = np.array([date_to_idx[d] - start_idx for d in grp["trade_date"]], dtype=int)
        for field, col in (
            ("open", "open"),
            ("high", "high"),
            ("low", "low"),
            ("close", "close"),
            ("volume", "volume"),
            ("amount", "amount"),
            ("factor", "adj_factor"),
        ):
            arr = np.full(span_len, np.nan, dtype=np.float32)
            vals = pd.to_numeric(grp[col], errors="coerce").to_numpy(dtype=np.float32)
            arr[idx_arr] = vals
            bin_path = os.path.join(sub_dir, f"{field}.day.bin")
            with open(bin_path, "wb") as bf:
                bf.write(struct.pack("<f", float(start_idx)))
                arr.tofile(bf)
        sym_count += 1

    with open(os.path.join(ins_dir, "all.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(all_ins_lines)) + "\n")
    with open(os.path.join(ins_dir, "hs300.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(hs300_ins_lines or all_ins_lines)) + "\n")

    return {"ok": True, "symbols": sym_count, "days": len(dates), "path": qlib_dir}


def cmd_env_check(store_dir: str) -> dict:
    pkgs = {}
    for mod_name, label in [
        ("vectorbt", "VectorBT"),
        ("qlib", "Microsoft Qlib"),
        ("alphalens", "Alphalens"),
        ("duckdb", "DuckDB"),
        ("pyarrow", "PyArrow"),
        ("lightgbm", "LightGBM"),
        ("talib", "TA-Lib"),
        ("ta", "TA (Technical Analysis)"),
        ("pandas", "Pandas"),
        ("numpy", "NumPy"),
        ("scipy", "SciPy"),
        ("sklearn", "scikit-learn"),
    ]:
        try:
            m = __import__(mod_name)
            pkgs[mod_name] = {"label": label, "installed": True, "version": str(getattr(m, "__version__", "installed"))}
        except Exception:
            pkgs[mod_name] = {"label": label, "installed": False, "version": ""}

    paths = _store_paths(store_dir)
    store_info = {
        "exists": os.path.isfile(paths["bars"]),
        "total_rows": 0,
        "symbols": 0,
        "min_date": "",
        "max_date": "",
        "basic_rows": 0,
        "limit_rows": 0,
        "qlib_bin_ready": os.path.isfile(os.path.join(paths["qlib_bin"], "calendars", "day.txt")),
        "disk_mb": 0.0,
        "universes": {},
        "last_sync_at": 0,
    }
    total_bytes = 0
    for root, _dirs, files in os.walk(store_dir):
        for fn in files:
            try:
                total_bytes += os.path.getsize(os.path.join(root, fn))
            except OSError:
                pass
    store_info["disk_mb"] = round(total_bytes / (1024 * 1024), 2)

    if os.path.isfile(paths["bars"]):
        try:
            if duckdb is not None:
                p_esc = paths["bars"].replace("\\", "/").replace("'", "''")
                row = duckdb.sql(
                    f"SELECT COUNT(*), COUNT(DISTINCT symbol), MIN(trade_date), MAX(trade_date) FROM read_parquet('{p_esc}')"
                ).fetchone()
                store_info["total_rows"] = int(row[0] or 0)
                store_info["symbols"] = int(row[1] or 0)
                store_info["min_date"] = str(row[2] or "")[:10]
                store_info["max_date"] = str(row[3] or "")[:10]
            else:
                df = pd.read_parquet(paths["bars"], columns=["trade_date", "symbol"])
                store_info["total_rows"] = int(len(df))
                store_info["symbols"] = int(df["symbol"].nunique())
                store_info["min_date"] = str(df["trade_date"].min())[:10]
                store_info["max_date"] = str(df["trade_date"].max())[:10]
        except Exception:
            pass
    if os.path.isfile(paths["basic"]) and duckdb is not None:
        try:
            p_esc = paths["basic"].replace("\\", "/").replace("'", "''")
            store_info["basic_rows"] = int(duckdb.sql(f"SELECT COUNT(*) FROM read_parquet('{p_esc}')").fetchone()[0] or 0)
        except Exception:
            pass
    if os.path.isfile(paths["limit"]) and duckdb is not None:
        try:
            p_esc = paths["limit"].replace("\\", "/").replace("'", "''")
            store_info["limit_rows"] = int(duckdb.sql(f"SELECT COUNT(*) FROM read_parquet('{p_esc}')").fetchone()[0] or 0)
        except Exception:
            pass
    if os.path.isfile(paths["universe"]):
        try:
            with open(paths["universe"], "r", encoding="utf-8") as f:
                u = json.load(f)
            store_info["universes"] = {
                k: {"label": v.get("label", k), "count": len(v.get("symbols") or [])}
                for k, v in (u.get("universes") or {}).items()
            }
            store_info["last_sync_at"] = int(u.get("updated_at") or 0)
        except Exception:
            pass

    return {
        "ok": True,
        "python": sys.version.split()[0],
        "packages": pkgs,
        "store": store_info,
        "factor_count": len(qf.FACTOR_CATALOG),
    }


def _fetch_yf_daily(yf_sym: str, start_date: datetime.date, end_date: datetime.date, proxy_url: str) -> list[dict]:
    p1 = int(datetime.datetime(start_date.year, start_date.month, start_date.day, tzinfo=datetime.timezone.utc).timestamp())
    p2 = int(datetime.datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59, tzinfo=datetime.timezone.utc).timestamp())
    qs = urllib.parse.urlencode({"period1": str(p1), "period2": str(p2), "interval": "1d"})
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        try:
            d = _http_json(f"https://{host}/v8/finance/chart/{urllib.parse.quote(yf_sym)}?{qs}", proxy_url=proxy_url, timeout=12.0)
            res = ((d or {}).get("chart") or {}).get("result") or []
            if not res:
                continue
            r0 = res[0]
            ts_list = r0.get("timestamp") or []
            q0 = (((r0.get("indicators") or {}).get("quote") or [{}])[0]) or {}
            adj = (((r0.get("indicators") or {}).get("adjclose") or [{}])[0]).get("adjclose") or []
            opens, highs, lows, closes, vols = (
                q0.get("open") or [], q0.get("high") or [], q0.get("low") or [],
                q0.get("close") or [], q0.get("volume") or [],
            )
            out = []
            seen = set()
            for i, ts in enumerate(ts_list):
                c = closes[i] if i < len(closes) else None
                if c is None:
                    continue
                c = float(c)
                ac = float(adj[i]) if i < len(adj) and adj[i] is not None else c
                ratio = (ac / c) if c > 0 else 1.0
                o = float(opens[i]) * ratio if i < len(opens) and opens[i] is not None else ac
                h = float(highs[i]) * ratio if i < len(highs) and highs[i] is not None else ac
                l = float(lows[i]) * ratio if i < len(lows) and lows[i] is not None else ac
                v = float(vols[i]) if i < len(vols) and vols[i] is not None else 0.0
                dt = datetime.datetime.fromtimestamp(int(ts), tz=datetime.timezone.utc).strftime("%Y-%m-%d")
                if dt in seen:
                    continue
                seen.add(dt)
                out.append({
                    "trade_date": dt, "open": round(o, 4), "high": round(h, 4),
                    "low": round(l, 4), "close": round(ac, 4),
                    "volume": round(v, 2), "amount": round(ac * v, 2),
                    "adj_factor": round(ratio, 6), "pct_chg": 0.0,
                })
            for i in range(1, len(out)):
                p = out[i - 1]["close"]
                if p > 0:
                    out[i]["pct_chg"] = round((out[i]["close"] / p - 1.0) * 100.0, 4)
            return out
        except Exception:
            continue
    return []


def _export_shared_sqlite_bars(bars_df: pd.DataFrame, store_dir: str) -> str:
    """Mirror Parquet daily bars into data/quant_bars.sqlite so main O2 (.venv stdlib sqlite3) pages reuse them instantaneously."""
    if bars_df is None or bars_df.empty:
        return ""
    db_path = os.path.join(os.path.dirname(store_dir), "quant_bars.sqlite")
    tmp_path = db_path + ".tmp"
    if os.path.exists(tmp_path):
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    con = sqlite3.connect(tmp_path)
    try:
        con.executescript("""
            PRAGMA journal_mode=OFF;
            PRAGMA synchronous=OFF;
            CREATE TABLE hist_bars (
                symbol TEXT NOT NULL,
                secid TEXT NOT NULL,
                name TEXT NOT NULL,
                market TEXT NOT NULL,
                trade_date TEXT NOT NULL,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                volume REAL,
                amount REAL,
                pct_chg REAL,
                PRIMARY KEY (symbol, trade_date)
            );
        """)
        rows = []
        for r in bars_df[["symbol", "secid", "name", "market", "trade_date", "open", "high", "low", "close", "volume", "amount", "pct_chg"]].itertuples(index=False):
            rows.append((
                str(r.symbol), str(r.secid), str(r.name), str(r.market), str(r.trade_date)[:10],
                _safe_float(r.open), _safe_float(r.high), _safe_float(r.low), _safe_float(r.close),
                _safe_float(r.volume), _safe_float(r.amount), _safe_float(r.pct_chg),
            ))
        con.executemany(
            "INSERT OR REPLACE INTO hist_bars VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            rows,
        )
        con.execute("CREATE INDEX idx_hb_secid_date ON hist_bars(secid, trade_date)")
        con.execute("CREATE INDEX idx_hb_sym_date ON hist_bars(symbol, trade_date)")
        con.commit()
    finally:
        con.close()
    try:
        os.replace(tmp_path, db_path)
    except OSError:
        # Fallback in-place update if main server has read handle open on Windows
        con2 = sqlite3.connect(db_path, timeout=20.0)
        try:
            con2.execute("""
                CREATE TABLE IF NOT EXISTS hist_bars (
                    symbol TEXT NOT NULL, secid TEXT NOT NULL, name TEXT NOT NULL, market TEXT NOT NULL,
                    trade_date TEXT NOT NULL, open REAL, high REAL, low REAL, close REAL,
                    volume REAL, amount REAL, pct_chg REAL, PRIMARY KEY (symbol, trade_date)
                )
            """)
            con2.execute("CREATE INDEX IF NOT EXISTS idx_hb_secid_date ON hist_bars(secid, trade_date)")
            con2.execute("CREATE INDEX IF NOT EXISTS idx_hb_sym_date ON hist_bars(symbol, trade_date)")
            con2.executemany("INSERT OR REPLACE INTO hist_bars VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows)
            con2.commit()
        finally:
            con2.close()
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    return db_path


def _parse_custom_symbol(raw: str) -> tuple[str, str, str, str]:
    """Classify a user-entered ticker into (source, code, secid, market)."""
    s = (raw or "").strip()
    if not s:
        return "", "", "", ""
    # Explicit Tushare CN code e.g. 600519.SH / 300750.SZ / 510300.SH / 000300.SH
    api, tc = _ts_from_secid(s)
    if api and tc:
        mkt = "CN_STOCK" if api == "daily" else ("CN_ETF" if api == "fund_daily" else "CN_INDEX")
        return "tushare:" + api, tc, _secid_from_ts(tc), mkt
    # Bare 6-digit CN code
    if s.isdigit() and len(s) == 6:
        suf = "SH" if s.startswith(("6", "5", "9")) else "SZ"
        tc = f"{s}.{suf}"
        api, tc2 = _ts_from_secid(tc)
        mkt = "CN_STOCK" if api == "daily" else ("CN_ETF" if api == "fund_daily" else "CN_INDEX")
        return "tushare:" + api, tc2, _secid_from_ts(tc2), mkt
    # HK code: 116.00700 or 0700.HK / 00700.HK
    if s.startswith("116.") and s[4:].isdigit():
        num = int(s[4:])
        return "yf", f"{num:04d}.HK", f"116.{num:05d}", "HK_STOCK"
    if s.upper().endswith(".HK"):
        head = s[:-3]
        if head.isdigit():
            num = int(head)
            return "yf", f"{num:04d}.HK", f"116.{num:05d}", "HK_STOCK"
    # US secid: 105.NVDA / 106.BABA / 107.SPY
    if s[:4] in ("105.", "106.", "107.") and len(s) > 4:
        sym = s[4:].upper()
        return "yf", sym, s, "US_STOCK"
    # Crypto CG.bitcoin
    if s.startswith("CG."):
        cmap = {"CG.bitcoin": "BTC-USD", "CG.ethereum": "ETH-USD", "CG.solana": "SOL-USD", "CG.binancecoin": "BNB-USD", "CG.ripple": "XRP-USD", "CG.dogecoin": "DOGE-USD"}
        ys = cmap.get(s, "")
        return ("yf", ys, s, "GLOBAL") if ys else ("", "", "", "")
    # Yahoo symbols: ^GSPC, GC=F, BTC-USD, NVDA, TSLA, BRK-B
    up = s.upper()
    if up.startswith("^") or "=F" in up or "=X" in up or up.endswith("-USD"):
        return "yf", up, up, "GLOBAL"
    if re.match(r"^[A-Z][A-Z0-9.\-]{0,7}$", up):
        return "yf", up, f"105.{up}", "US_STOCK"
    return "", "", "", ""


def cmd_sync_data(params: dict, store_dir: str) -> dict:
    paths = _store_paths(store_dir)
    ts_base = str(params.get("tushare_base") or "").strip()
    ts_token = str(params.get("tushare_token") or "").strip()
    proxy_url = str(params.get("proxy_url") or "").strip()

    # Flexible multi-scope support + legacy single scope compatibility
    scopes_raw = params.get("scopes")
    if isinstance(scopes_raw, list) and scopes_raw:
        scopes = {str(x).strip().lower() for x in scopes_raw if str(x).strip()}
    else:
        sc = str(params.get("scope") or "standard").strip().lower()
        if sc == "standard":
            scopes = {"hs300", "etf_pool", "us_stocks", "us_etf", "global"}
        elif sc == "all":
            scopes = {"hs300", "zz500", "etf_pool", "us_stocks", "us_etf", "hk_stocks", "global"}
        elif sc == "hs300_full":
            scopes = {"hs300_full", "etf_pool"}
        else:
            scopes = {sc}

    # Flexible custom years (0.5 ~ 20) OR explicit start_date / end_date
    today = datetime.date.today()
    raw_start = str(params.get("start_date") or "").strip()[:10]
    raw_end = str(params.get("end_date") or "").strip()[:10]
    try:
        years = max(0.25, min(20.0, float(params.get("years") or 3.0)))
    except Exception:
        years = 3.0

    try:
        end_dt = datetime.date.fromisoformat(raw_end) if raw_end else today
    except ValueError:
        end_dt = today
    try:
        start_dt = datetime.date.fromisoformat(raw_start) if raw_start else (end_dt - datetime.timedelta(days=int(round(years * 365.25))))
    except ValueError:
        start_dt = end_dt - datetime.timedelta(days=int(round(years * 365.25)))
    if start_dt >= end_dt:
        start_dt = end_dt - datetime.timedelta(days=365)

    start_d = start_dt.strftime("%Y%m%d")
    end_d = end_dt.strftime("%Y%m%d")

    hs300_limit = max(10, min(300, int(params.get("hs300_limit") or 80)))
    zz500_limit = max(10, min(500, int(params.get("zz500_limit") or 60)))

    # Parse custom symbols (accepts list or comma/space/newline separated string)
    raw_custom = params.get("custom_symbols") or []
    if isinstance(raw_custom, str):
        custom_symbols = [x.strip() for x in re.split(r"[\s,;，；\n]+", raw_custom) if x.strip()]
    else:
        custom_symbols = [str(x).strip() for x in raw_custom if str(x).strip()]

    emit_progress(5, f"准备同步 {start_dt.isoformat()} ~ {end_dt.isoformat()} 区间，正在获取成分股名录...")
    stock_names: dict[str, tuple[str, str]] = {}
    if ts_base and ts_token:
        sb_rows = _ts_call(ts_base, ts_token, "stock_basic", {"list_status": "L"}, "ts_code,name,industry")
        for r in sb_rows:
            tc = str(r.get("ts_code") or "")
            if tc:
                stock_names[tc] = (str(r.get("name") or tc), str(r.get("industry") or "综合"))

    def _index_top_codes(index_code: str, lim: int) -> list[str]:
        w_start = (today - datetime.timedelta(days=90)).strftime("%Y%m%d")
        w_rows = _ts_call(ts_base, ts_token, "index_weight", {"index_code": index_code, "start_date": w_start, "end_date": today.strftime("%Y%m%d")})
        if not w_rows:
            return []
        latest_td = max(str(r.get("trade_date") or "") for r in w_rows)
        latest_w = [r for r in w_rows if str(r.get("trade_date") or "") == latest_td]
        latest_w.sort(key=lambda x: _safe_float(x.get("weight")), reverse=True)
        return [str(r["con_code"]) for r in latest_w if r.get("con_code")][:lim]

    hs300_codes: list[str] = []
    zz500_codes: list[str] = []
    if ts_base and ts_token and ("hs300" in scopes or "hs300_full" in scopes):
        lim = 300 if "hs300_full" in scopes else hs300_limit
        hs300_codes = _index_top_codes("000300.SH", lim)
        if not hs300_codes:
            hs300_codes = [
                "600519.SH", "300750.SZ", "601318.SH", "600036.SH", "000858.SZ", "000333.SZ",
                "600900.SH", "601166.SH", "601899.SH", "002594.SZ", "600276.SH", "601398.SH",
                "600030.SH", "601857.SH", "002475.SZ", "603259.SH", "300059.SZ", "600887.SH",
            ]
    if ts_base and ts_token and "zz500" in scopes:
        zz500_codes = _index_top_codes("000905.SH", zz500_limit)

    etf_codes = [c for c, _ in ETF_POOL_DEFAULTS] if "etf_pool" in scopes else []
    etf_name_map = dict(ETF_POOL_DEFAULTS)

    benchmarks = [
        ("000300.SH", "沪深300指数", "index_daily"),
        ("000905.SH", "中证500指数", "index_daily"),
        ("000001.SH", "上证指数", "index_daily"),
        ("399006.SZ", "创业板指", "index_daily"),
    ]

    ts_tasks: list[tuple[str, str, str, str]] = []
    yf_tasks: list[tuple[str, str, str, str, str]] = []  # (secid, yf_sym, name, market, industry)
    seen_ts = set()
    seen_yf = set()

    if ts_base and ts_token:
        if any(k in scopes for k in ("hs300", "hs300_full", "zz500", "etf_pool")):
            for tc, nm, api in benchmarks:
                if tc not in seen_ts:
                    seen_ts.add(tc)
                    ts_tasks.append((tc, nm, "CN_INDEX", api))
        for tc in etf_codes:
            if tc not in seen_ts:
                seen_ts.add(tc)
                ts_tasks.append((tc, etf_name_map.get(tc, tc), "CN_ETF", "fund_daily"))
        for tc in hs300_codes + zz500_codes:
            if tc not in seen_ts:
                seen_ts.add(tc)
                nm = (stock_names.get(tc) or (tc, "A股"))[0]
                ts_tasks.append((tc, nm, "CN_STOCK", "daily"))

    if "us_stocks" in scopes:
        for secid, ys, nm, ind in US_STOCKS_DEFAULTS:
            if ys not in seen_yf:
                seen_yf.add(ys)
                yf_tasks.append((secid, ys, nm, "US_STOCK", ind))
        # Always include US benchmarks when syncing US stocks
        for secid, ys, nm in [("100.SPX", "^GSPC", "标普500指数"), ("100.NDX", "^NDX", "纳斯达克100指数")]:
            if ys not in seen_yf:
                seen_yf.add(ys)
                yf_tasks.append((secid, ys, nm, "GLOBAL", "US_INDEX"))

    if "us_etf" in scopes:
        for secid, ys, nm, ind in US_ETF_DEFAULTS:
            if ys not in seen_yf:
                seen_yf.add(ys)
                yf_tasks.append((secid, ys, nm, "US_ETF", ind))

    if "hk_stocks" in scopes:
        for secid, ys, nm, ind in HK_STOCKS_DEFAULTS:
            if ys not in seen_yf:
                seen_yf.add(ys)
                yf_tasks.append((secid, ys, nm, "HK_STOCK", ind))
        if "^HSI" not in seen_yf:
            seen_yf.add("^HSI")
            yf_tasks.append(("100.HSI", "^HSI", "恒生指数", "GLOBAL", "HK_INDEX"))

    if "global" in scopes:
        for secid, ys, nm in GLOBAL_CORE_DEFAULTS:
            if ys not in seen_yf:
                seen_yf.add(ys)
                yf_tasks.append((secid, ys, nm, "GLOBAL", "GlobalAsset"))

    # Classify custom symbols into Tushare or Yahoo Finance
    us_name_lookup = {ys: (nm, ind) for _, ys, nm, ind in US_STOCKS_DEFAULTS + US_ETF_DEFAULTS}
    hk_name_lookup = {ys: (nm, ind) for _, ys, nm, ind in HK_STOCKS_DEFAULTS}
    for raw_c in custom_symbols:
        src, code, secid, mkt = _parse_custom_symbol(raw_c)
        if src.startswith("tushare:") and ts_base and ts_token and code not in seen_ts:
            seen_ts.add(code)
            api = src.split(":", 1)[1]
            nm = (stock_names.get(code) or (etf_name_map.get(code, code), "A股"))[0]
            ts_tasks.append((code, nm, mkt, api))
        elif src == "yf" and code and code not in seen_yf:
            seen_yf.add(code)
            nm, ind = us_name_lookup.get(code) or hk_name_lookup.get(code) or (code, mkt)
            yf_tasks.append((secid, code, nm, mkt, ind))

    all_bar_rows: list[dict] = []
    all_basic_rows: list[dict] = []
    all_limit_rows: list[dict] = []

    def _pull_ts_one(task: tuple[str, str, str, str]):
        tc, nm, mkt, api = task
        secid = _secid_from_ts(tc)
        rows = _ts_call(ts_base, ts_token, api, {"ts_code": tc, "start_date": start_d, "end_date": end_d})
        if not rows:
            return [], [], []
        adj_map: dict[str, float] = {}
        basic_out = []
        limit_out = []
        if api == "daily":
            adj_rows = _ts_call(ts_base, ts_token, "adj_factor", {"ts_code": tc, "start_date": start_d, "end_date": end_d})
            for a in adj_rows:
                td = str(a.get("trade_date") or "")
                af = _safe_float(a.get("adj_factor"), 0.0)
                if td and af > 0:
                    adj_map[td] = af
            b_rows = _ts_call(
                ts_base, ts_token, "daily_basic",
                {"ts_code": tc, "start_date": start_d, "end_date": end_d},
                "trade_date,pe_ttm,pb,ps_ttm,dv_ttm,total_mv,circ_mv,turnover_rate_f,volume_ratio",
            )
            for b in b_rows:
                dt = _iso_date(b.get("trade_date"))
                if not dt:
                    continue
                basic_out.append({
                    "trade_date": dt, "symbol": tc,
                    "pe_ttm": _safe_float(b.get("pe_ttm"), np.nan), "pb": _safe_float(b.get("pb"), np.nan),
                    "ps_ttm": _safe_float(b.get("ps_ttm"), np.nan), "dv_ttm": _safe_float(b.get("dv_ttm"), np.nan),
                    "total_mv": _safe_float(b.get("total_mv"), np.nan), "circ_mv": _safe_float(b.get("circ_mv"), np.nan),
                    "turnover_rate_f": _safe_float(b.get("turnover_rate_f"), np.nan), "volume_ratio": _safe_float(b.get("volume_ratio"), np.nan),
                })
            l_rows = _ts_call(
                ts_base, ts_token, "stk_limit",
                {"ts_code": tc, "start_date": start_d, "end_date": end_d},
                "trade_date,up_limit,down_limit",
            )
            for lr in l_rows:
                dt = _iso_date(lr.get("trade_date"))
                if not dt:
                    continue
                limit_out.append({
                    "trade_date": dt, "symbol": tc,
                    "up_limit": _safe_float(lr.get("up_limit"), np.nan),
                    "down_limit": _safe_float(lr.get("down_limit"), np.nan),
                })

        ordered = sorted(rows, key=lambda r: str(r.get("trade_date") or ""))
        latest_af = 1.0
        if adj_map:
            for r in reversed(ordered):
                td = str(r.get("trade_date") or "")
                if td in adj_map:
                    latest_af = adj_map[td]
                    break
        bars_out = []
        for r in ordered:
            td = str(r.get("trade_date") or "")
            dt = _iso_date(td)
            c_raw = _safe_float(r.get("close"), np.nan)
            if not dt or math.isnan(c_raw):
                continue
            o_raw = _safe_float(r.get("open"), c_raw)
            h_raw = _safe_float(r.get("high"), max(o_raw, c_raw))
            l_raw = _safe_float(r.get("low"), min(o_raw, c_raw))
            af = adj_map.get(td, latest_af) if adj_map else 1.0
            ratio = (af / latest_af) if (adj_map and latest_af > 0) else 1.0
            bars_out.append({
                "trade_date": dt, "symbol": tc, "secid": secid, "name": nm, "market": mkt,
                "industry": (stock_names.get(tc) or (nm, mkt))[1],
                "open": round(o_raw * ratio, 4), "high": round(h_raw * ratio, 4),
                "low": round(l_raw * ratio, 4), "close": round(c_raw * ratio, 4),
                "volume": round(_safe_float(r.get("vol"), 0.0), 2),
                "amount": round(_safe_float(r.get("amount"), 0.0) * 1000.0, 2),
                "adj_factor": round(af, 6), "pct_chg": round(_safe_float(r.get("pct_chg"), 0.0), 4),
            })
        return bars_out, basic_out, limit_out

    total_all = len(ts_tasks) + len(yf_tasks)
    done_all = 0

    if ts_tasks:
        emit_progress(10, f"正在并行拉取 {len(ts_tasks)} 只 A股/ETF/指数 ({start_dt}~{end_dt})...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            futs = [ex.submit(_pull_ts_one, t) for t in ts_tasks]
            for fut in concurrent.futures.as_completed(futs):
                done_all += 1
                try:
                    bo, bso, lo = fut.result()
                    all_bar_rows.extend(bo)
                    all_basic_rows.extend(bso)
                    all_limit_rows.extend(lo)
                except Exception:
                    pass
                if done_all % 6 == 0 or done_all == len(ts_tasks):
                    pct = 10 + int(done_all / max(1, total_all) * 70)
                    emit_progress(pct, f"已同步 A股/ETF {done_all}/{len(ts_tasks)} 只（累计 {len(all_bar_rows):,} 条日线）")

    if yf_tasks:
        emit_progress(10 + int(done_all / max(1, total_all) * 70), f"正在同步 {len(yf_tasks)} 只美股/港股/全球跨资产 ({start_dt}~{end_dt})...")
        def _pull_yf(item):
            secid, ys, nm, mkt, ind = item
            rows = _fetch_yf_daily(ys, start_dt, end_dt, proxy_url)
            return ys, [{**r, "symbol": ys, "secid": secid, "name": nm, "market": mkt, "industry": ind} for r in rows]

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
            futs_yf = [ex.submit(_pull_yf, t) for t in yf_tasks]
            yf_done = 0
            for fut in concurrent.futures.as_completed(futs_yf):
                yf_done += 1
                done_all += 1
                try:
                    _ys, rows_g = fut.result()
                    if rows_g:
                        all_bar_rows.extend(rows_g)
                except Exception:
                    pass
                if yf_done % 5 == 0 or yf_done == len(yf_tasks):
                    pct = 10 + int(done_all / max(1, total_all) * 70)
                    emit_progress(pct, f"已同步 美/港/全球 {yf_done}/{len(yf_tasks)} 只（累计 {len(all_bar_rows):,} 条日线）")

    emit_progress(83, "正在合并写入本地 Parquet 列式数据仓...")
    new_bars_df = pd.DataFrame(all_bar_rows)
    bars_df = _merge_parquet(paths["bars"], new_bars_df, ["trade_date", "symbol"])

    if all_basic_rows:
        _merge_parquet(paths["basic"], pd.DataFrame(all_basic_rows), ["trade_date", "symbol"])
    if all_limit_rows:
        _merge_parquet(paths["limit"], pd.DataFrame(all_limit_rows), ["trade_date", "symbol"])

    # Update universe metadata dynamically from bars_df
    prev_uni = {}
    if os.path.isfile(paths["universe"]):
        try:
            with open(paths["universe"], "r", encoding="utf-8") as f:
                prev_uni = json.load(f).get("universes") or {}
        except Exception:
            prev_uni = {}

    present = set(bars_df["symbol"].unique()) if not bars_df.empty else set()
    if hs300_codes:
        valid_h = [c for c in hs300_codes if c in present]
        if valid_h:
            prev_uni["hs300"] = {"label": f"沪深300核心池 ({len(valid_h)}只)", "symbols": valid_h}
    if zz500_codes:
        valid_z = [c for c in zz500_codes if c in present]
        if valid_z:
            prev_uni["zz500"] = {"label": f"中证500核心池 ({len(valid_z)}只)", "symbols": valid_z}
    if not bars_df.empty:
        for mkt_k, u_k, u_name in [
            ("CN_ETF", "etf_pool", "A股主流ETF池"),
            ("US_STOCK", "us_stocks", "美股核心龙头池"),
            ("US_ETF", "us_etf", "美股核心ETF池"),
            ("HK_STOCK", "hk_stocks", "港股核心池"),
            ("GLOBAL", "global_core", "全球指数/商品/加密池"),
            ("CN_STOCK", "all_cn_stocks", "全部已同步A股"),
        ]:
            syms_m = sorted(bars_df.loc[bars_df["market"] == mkt_k, "symbol"].unique().tolist())
            if syms_m:
                prev_uni[u_k] = {"label": f"{u_name} ({len(syms_m)}只)", "symbols": syms_m}

    with open(paths["universe"], "w", encoding="utf-8") as f:
        json.dump({"updated_at": int(time.time()), "universes": prev_uni}, f, ensure_ascii=False, indent=2)

    emit_progress(89, "正在导出全站共享历史库 (quant_bars.sqlite)...")
    _export_shared_sqlite_bars(bars_df, store_dir)

    emit_progress(94, "正在导出 Microsoft Qlib 二进制特征目录 (qlib_bin)...")
    qlib_dump = _dump_qlib_bin(bars_df, paths["qlib_bin"], hs300_codes)

    emit_progress(100, "本地量化数据仓同步完成")
    env = cmd_env_check(store_dir)
    return {
        "ok": True,
        "date_range": [start_dt.isoformat(), end_dt.isoformat()],
        "synced_bars": len(all_bar_rows),
        "synced_basic": len(all_basic_rows),
        "synced_limit": len(all_limit_rows),
        "qlib_bin": qlib_dump,
        "store": env["store"],
    }


# ---------------------------------------------------------------------------
# DuckDB Panel Loader
# ---------------------------------------------------------------------------

def _load_panels(
    store_dir: str,
    universe: str = "hs300",
    symbols: list[str] | None = None,
    start_date: str = "",
    end_date: str = "",
) -> tuple[dict[str, pd.DataFrame], dict[str, dict]]:
    paths = _store_paths(store_dir)
    if not os.path.isfile(paths["bars"]):
        raise RuntimeError("本地量化数据仓为空，请先点击「同步本地数据仓」拉取历史数据。")

    target_syms: list[str] = []
    if symbols:
        target_syms = [str(s).strip() for s in symbols if str(s).strip()]
    elif os.path.isfile(paths["universe"]):
        with open(paths["universe"], "r", encoding="utf-8") as f:
            u = json.load(f).get("universes") or {}
        if universe in u:
            target_syms = list(u[universe].get("symbols") or [])

    where_clauses = []
    if start_date:
        where_clauses.append(f"trade_date >= '{start_date[:10]}'")
    if end_date:
        where_clauses.append(f"trade_date <= '{end_date[:10]}'")
    if target_syms:
        in_sql = ",".join("'" + s.replace("'", "''") + "'" for s in target_syms)
        where_clauses.append(f"(symbol IN ({in_sql}) OR secid IN ({in_sql}))")
    elif universe == "hs300":
        where_clauses.append("market = 'CN_STOCK'")
    elif universe == "etf_pool":
        where_clauses.append("market = 'CN_ETF'")
    elif universe == "us_stocks":
        where_clauses.append("market = 'US_STOCK'")
    elif universe == "us_etf":
        where_clauses.append("market = 'US_ETF'")
    elif universe == "hk_stocks":
        where_clauses.append("market = 'HK_STOCK'")
    elif universe == "global_core":
        where_clauses.append("market = 'GLOBAL'")

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    if duckdb is not None:
        p_esc = paths["bars"].replace("\\", "/").replace("'", "''")
        df = duckdb.sql(f"SELECT * FROM read_parquet('{p_esc}') {where_sql} ORDER BY trade_date, symbol").df()
    else:
        df = pd.read_parquet(paths["bars"])
        if start_date:
            df = df[df["trade_date"] >= start_date[:10]]
        if end_date:
            df = df[df["trade_date"] <= end_date[:10]]
        if target_syms:
            df = df[df["symbol"].isin(target_syms) | df["secid"].isin(target_syms)]

    if df.empty:
        raise RuntimeError(f"数据仓中未找到符合条件的标的（universe={universe}），请先同步对应板块数据。")

    df["trade_date"] = pd.to_datetime(df["trade_date"])
    meta_map: dict[str, dict] = {}
    for sym, grp in df.groupby("symbol"):
        last = grp.iloc[-1]
        meta_map[str(sym)] = {
            "symbol": str(sym),
            "secid": str(last.get("secid") or sym),
            "name": str(last.get("name") or sym),
            "market": str(last.get("market") or ""),
            "industry": str(last.get("industry") or "综合"),
        }

    panels: dict[str, pd.DataFrame] = {}
    for col in ("open", "high", "low", "close", "volume", "amount", "pct_chg"):
        if col in df.columns:
            panels[col] = df.pivot_table(index="trade_date", columns="symbol", values=col, aggfunc="last").sort_index()

    # Load daily_basic if present
    syms_loaded = list(panels["close"].columns)
    if os.path.isfile(paths["basic"]) and syms_loaded:
        try:
            if duckdb is not None:
                b_esc = paths["basic"].replace("\\", "/").replace("'", "''")
                in_sql = ",".join("'" + s.replace("'", "''") + "'" for s in syms_loaded)
                bdf = duckdb.sql(f"SELECT * FROM read_parquet('{b_esc}') WHERE symbol IN ({in_sql})").df()
            else:
                bdf = pd.read_parquet(paths["basic"])
                bdf = bdf[bdf["symbol"].isin(syms_loaded)]
            if not bdf.empty:
                bdf["trade_date"] = pd.to_datetime(bdf["trade_date"])
                for col in ("pe_ttm", "pb", "ps_ttm", "dv_ttm", "total_mv", "circ_mv", "turnover_rate_f", "volume_ratio"):
                    if col in bdf.columns:
                        piv = bdf.pivot_table(index="trade_date", columns="symbol", values=col, aggfunc="last")
                        panels[col] = piv.reindex(index=panels["close"].index, columns=syms_loaded)
        except Exception:
            pass

    # Load stk_limit if present
    if os.path.isfile(paths["limit"]) and syms_loaded:
        try:
            if duckdb is not None:
                l_esc = paths["limit"].replace("\\", "/").replace("'", "''")
                in_sql = ",".join("'" + s.replace("'", "''") + "'" for s in syms_loaded)
                ldf = duckdb.sql(f"SELECT * FROM read_parquet('{l_esc}') WHERE symbol IN ({in_sql})").df()
            else:
                ldf = pd.read_parquet(paths["limit"])
                ldf = ldf[ldf["symbol"].isin(syms_loaded)]
            if not ldf.empty:
                ldf["trade_date"] = pd.to_datetime(ldf["trade_date"])
                for col in ("up_limit", "down_limit"):
                    if col in ldf.columns:
                        piv = ldf.pivot_table(index="trade_date", columns="symbol", values=col, aggfunc="last")
                        panels[col] = piv.reindex(index=panels["close"].index, columns=syms_loaded)
        except Exception:
            pass

    return panels, meta_map


def _load_benchmark_series(store_dir: str, benchmark: str, index_dates: pd.DatetimeIndex) -> pd.Series:
    paths = _store_paths(store_dir)
    if not os.path.isfile(paths["bars"]):
        return pd.Series(1.0, index=index_dates)
    bm = (benchmark or "000300.SH").strip()
    try:
        if duckdb is not None:
            p_esc = paths["bars"].replace("\\", "/").replace("'", "''")
            bm_esc = bm.replace("'", "''")
            df = duckdb.sql(
                f"SELECT trade_date, close FROM read_parquet('{p_esc}') WHERE symbol='{bm_esc}' OR secid='{bm_esc}' ORDER BY trade_date"
            ).df()
        else:
            df = pd.read_parquet(paths["bars"], columns=["trade_date", "symbol", "secid", "close"])
            df = df[(df["symbol"] == bm) | (df["secid"] == bm)].sort_values("trade_date")
        if df.empty:
            return pd.Series(1.0, index=index_dates)
        s = pd.Series(df["close"].astype(float).values, index=pd.to_datetime(df["trade_date"]))
        s = s[~s.index.duplicated(keep="last")].reindex(index_dates).ffill().bfill()
        if len(s) and s.iloc[0] > 0:
            return s / s.iloc[0]
    except Exception:
        pass
    return pd.Series(1.0, index=index_dates)


# ---------------------------------------------------------------------------
# Factor Evaluation via Alphalens-reloaded
# ---------------------------------------------------------------------------

def cmd_factor_eval(params: dict, store_dir: str) -> dict:
    factor_id = str(params.get("factor_id") or "wq_alpha006").strip()
    custom_expr = str(params.get("custom_expr") or "").strip()
    universe = str(params.get("universe") or "hs300").strip()
    start_date = str(params.get("start_date") or "").strip()
    end_date = str(params.get("end_date") or "").strip()
    quantiles = max(3, min(10, int(params.get("quantiles") or 5)))
    periods = params.get("periods") or [1, 5, 10, 20]
    periods = tuple(sorted({max(1, int(p)) for p in periods})[:4]) or (1, 5, 10, 20)
    standardize = bool(params.get("standardize", True))
    flip_sign = bool(params.get("flip_sign", False))

    emit_progress(15, f"正在从 DuckDB 加载 {universe} 面板数据...")
    panels, meta_map = _load_panels(store_dir, universe=universe, start_date=start_date, end_date=end_date)
    close_df = panels["close"].dropna(axis=1, thresh=max(30, int(len(panels["close"]) * 0.3)))
    if close_df.shape[1] < quantiles + 2:
        raise RuntimeError(f"有效标的数不足（仅 {close_df.shape[1]} 只），无法按 {quantiles} 层分组体检，请先同步沪深300或ETF池数据。")

    # Filter panels to valid columns
    valid_cols = list(close_df.columns)
    panels = {k: v.reindex(columns=valid_cols) for k, v in panels.items()}

    emit_progress(38, f"正在向量化计算因子 {factor_id}...")
    raw_factor = qf.compute_factor(factor_id, panels, custom_expr=custom_expr)
    if flip_sign:
        raw_factor = -raw_factor
    if standardize:
        proc_factor = qf.cs_zscore(qf.winsorize_mad(raw_factor))
    else:
        proc_factor = qf.winsorize_mad(raw_factor)

    # Stack into MultiIndex (date, asset) for Alphalens
    factor_series = proc_factor.stack().dropna()
    factor_series.index.names = ["date", "asset"]
    prices = panels["close"].ffill()

    if len(factor_series) < 100:
        raise RuntimeError("有效因子样本点过少，请扩大时间范围或先同步数据。")

    emit_progress(62, "正在运行 Alphalens-reloaded 因子 IC/IR 与分层回测...")
    if alphalens is None:
        raise RuntimeError("Alphalens 未安装，请检查 .venv_quant 环境。")

    try:
        factor_data = al_utils.get_clean_factor_and_forward_returns(
            factor_series,
            prices,
            quantiles=quantiles,
            periods=periods,
            max_loss=0.55,
        )
    except ValueError:
        # Tie-break discrete factors cleanly via cross-sectional first-rank so qcut edges are strictly unique
        ranked = proc_factor.rank(axis=1, method="first", pct=True).stack().dropna()
        ranked.index.names = ["date", "asset"]
        factor_data = al_utils.get_clean_factor_and_forward_returns(
            ranked,
            prices,
            quantiles=quantiles,
            periods=periods,
            max_loss=0.55,
        )

    ic_df = al_perf.factor_information_coefficient(factor_data)
    mean_ret_q, _std_err_q = al_perf.mean_return_by_quantile(factor_data, by_date=False)
    mean_ret_q_daily, _ = al_perf.mean_return_by_quantile(factor_data, by_date=True)

    emit_progress(82, "正在聚合 IC 时序、分层累计净值与换手率指标...")
    summary_rows = []
    from scipy import stats as sp_stats

    for p in periods:
        col = f"{p}D"
        if col not in ic_df.columns:
            continue
        ic_s = ic_df[col].dropna()
        ic_mean = float(ic_s.mean()) if len(ic_s) else 0.0
        ic_std = float(ic_s.std()) if len(ic_s) > 1 else 0.0
        icir = (ic_mean / ic_std) if ic_std > 1e-9 else 0.0
        win_rate = float((ic_s > 0).mean() * 100.0) if len(ic_s) else 0.0
        if len(ic_s) > 2 and ic_std > 1e-9:
            t_val, p_val = sp_stats.ttest_1samp(ic_s.values, 0.0)
        else:
            t_val, p_val = 0.0, 1.0
        try:
            autocorr = float(al_perf.factor_rank_autocorrelation(factor_data, period=p).mean())
        except Exception:
            autocorr = 0.0
        try:
            qt = al_perf.quantile_turnover(factor_data["factor_quantile"], quantile=quantiles, period=p)
            top_turn = float(qt.mean() * 100.0)
        except Exception:
            top_turn = 0.0

        q_vals = mean_ret_q[col] if col in mean_ret_q.columns else pd.Series(dtype=float)
        top_bps = float(q_vals.iloc[-1] * 10000.0) if len(q_vals) else 0.0
        bot_bps = float(q_vals.iloc[0] * 10000.0) if len(q_vals) else 0.0
        ls_bps = top_bps - bot_bps

        summary_rows.append({
            "period": col,
            "ic_mean": round(_safe_float(ic_mean), 4),
            "ic_std": round(_safe_float(ic_std), 4),
            "icir": round(_safe_float(icir), 3),
            "ic_win_rate": round(_safe_float(win_rate), 1),
            "t_stat": round(_safe_float(t_val), 2),
            "p_value": round(_safe_float(p_val), 4),
            "rank_autocorr": round(_safe_float(autocorr), 3),
            "top_turnover_pct": round(_safe_float(top_turn), 1),
            "top_ret_bps": round(_safe_float(top_bps), 2),
            "bottom_ret_bps": round(_safe_float(bot_bps), 2),
            "ls_spread_bps": round(_safe_float(ls_bps), 2),
        })

    # Primary horizon for charts (prefer 5D if present, else first)
    primary_p = 5 if 5 in periods else periods[0]
    p_col = f"{primary_p}D"
    ic_primary = ic_df[p_col].dropna()
    ic_dates = [d.strftime("%Y-%m-%d") for d in ic_primary.index]
    ic_vals = _round_list(ic_primary.values, 4)
    ic_ma20 = _round_list(ic_primary.rolling(20, min_periods=3).mean().values, 4)
    ic_cum = _round_list(ic_primary.cumsum().values, 4)

    # Quantile bar chart (bps)
    q_bars = []
    if p_col in mean_ret_q.columns:
        for q_idx, val in mean_ret_q[p_col].items():
            q_bars.append({"quantile": f"Q{int(q_idx)}", "bps": round(_safe_float(val) * 10000.0, 2)})

    # Daily 1D cumulative return curves per quantile (true daily compounding)
    daily_col = f"{periods[0]}D"
    nav_dates = []
    q_curves: dict[str, list] = {}
    ls_curve: list = []
    try:
        piv_q = mean_ret_q_daily[daily_col].unstack(level=0).sort_index()
        # Scale multi-day period returns to daily approx if periods[0] > 1
        step_div = float(periods[0])
        piv_q_daily = piv_q / step_div
        nav_df = (1.0 + piv_q_daily.fillna(0.0)).cumprod()
        nav_dates = [d.strftime("%Y-%m-%d") for d in nav_df.index]
        for q_num in nav_df.columns:
            q_curves[f"Q{int(q_num)}"] = _round_list(nav_df[q_num].values, 4)
        if len(nav_df.columns) >= 2:
            q_top = piv_q_daily[nav_df.columns[-1]].fillna(0.0)
            q_bot = piv_q_daily[nav_df.columns[0]].fillna(0.0)
            ls_nav = (1.0 + (q_top - q_bot)).cumprod()
            ls_curve = _round_list(ls_nav.values, 4)
    except Exception:
        pass

    # Latest cross-sectional top/bottom snapshot
    latest_date = proc_factor.dropna(how="all").index[-1]
    latest_vals = proc_factor.loc[latest_date].dropna().sort_values(ascending=False)
    latest_closes = panels["close"].ffill().loc[latest_date]

    def _pack_rank(ser: pd.Series) -> list[dict]:
        rows = []
        for sym, fv in ser.items():
            m = meta_map.get(str(sym), {})
            rows.append({
                "symbol": str(sym),
                "secid": m.get("secid", str(sym)),
                "name": m.get("name", str(sym)),
                "industry": m.get("industry", ""),
                "price": round(_safe_float(latest_closes.get(sym), 0.0), 3),
                "factor_val": round(_safe_float(fv), 4),
            })
        return rows

    fmeta = qf.FACTOR_META_MAP.get(factor_id, {})
    # Distribution histogram of latest standardized factor values
    f_hist = {"bins": [], "counts": []}
    try:
        vals_np = latest_vals.to_numpy(dtype=float)
        vals_np = vals_np[np.isfinite(vals_np)]
        if len(vals_np) >= 5:
            cnts, edges = np.histogram(vals_np, bins=min(16, max(6, len(vals_np) // 3)))
            f_hist = {
                "bins": [f"{edges[i]:.2f}" for i in range(len(cnts))],
                "counts": [int(c) for c in cnts],
            }
    except Exception:
        pass

    emit_progress(100, "Alphalens 因子体检完成")
    return {
        "ok": True,
        "engine": f"Alphalens {getattr(alphalens, '__version__', '')}".strip(),
        "factor_id": factor_id,
        "factor_name": custom_expr if custom_expr else fmeta.get("name", factor_id),
        "family": "Custom" if custom_expr else fmeta.get("family", ""),
        "formula": custom_expr or fmeta.get("formula", ""),
        "universe": universe,
        "symbol_count": len(valid_cols),
        "date_range": [ic_dates[0] if ic_dates else "", ic_dates[-1] if ic_dates else ""],
        "quantiles": quantiles,
        "primary_period": p_col,
        "summary": summary_rows,
        "ic_series": {"dates": ic_dates, "ic": ic_vals, "ma20": ic_ma20, "cum": ic_cum},
        "quantile_bars": q_bars,
        "quantile_nav": {"dates": nav_dates, "curves": q_curves, "long_short": ls_curve},
        "factor_hist": f_hist,
        "latest_date": latest_date.strftime("%Y-%m-%d"),
        "top_stocks": _pack_rank(latest_vals.head(15)),
        "bottom_stocks": _pack_rank(latest_vals.tail(15).iloc[::-1]),
    }


# ---------------------------------------------------------------------------
# Standardized Portfolio Performance & Monthly Heatmap Analytics
# ---------------------------------------------------------------------------

def _compute_standard_report(
    equity: pd.Series,
    benchmark: pd.Series,
    trades: list[dict],
    init_cash: float,
    engine_name: str,
    meta: dict,
    extra: dict | None = None,
) -> dict:
    eq = equity.dropna().astype(float)
    if eq.empty:
        raise RuntimeError("回测净值序列为空")
    bm = benchmark.reindex(eq.index).ffill().bfill()
    if bm.isna().all() or bm.iloc[0] <= 0:
        bm = pd.Series(1.0, index=eq.index)
    else:
        bm = bm / bm.iloc[0]

    nav = eq / eq.iloc[0]
    daily_ret = nav.pct_change().fillna(0.0)
    bm_ret = bm.pct_change().fillna(0.0)
    excess_daily = daily_ret - bm_ret
    excess_nav = (1.0 + excess_daily).cumprod()

    n_days = max(1, len(nav) - 1)
    total_ret = float(nav.iloc[-1] - 1.0)
    bm_total_ret = float(bm.iloc[-1] - 1.0)
    ann_ret = float((nav.iloc[-1]) ** (252.0 / n_days) - 1.0) if nav.iloc[-1] > 0 else -1.0
    bm_ann_ret = float((bm.iloc[-1]) ** (252.0 / n_days) - 1.0) if bm.iloc[-1] > 0 else -1.0
    excess_ann = ann_ret - bm_ann_ret

    vol = float(daily_ret.std() * math.sqrt(252.0))
    bm_vol = float(bm_ret.std() * math.sqrt(252.0))
    downside = daily_ret[daily_ret < 0]
    downside_vol = float(downside.std() * math.sqrt(252.0)) if len(downside) > 2 else vol
    rf = 0.02
    sharpe = (ann_ret - rf) / vol if vol > 1e-9 else 0.0
    sortino = (ann_ret - rf) / downside_vol if downside_vol > 1e-9 else 0.0

    # Tracking error & Information Ratio
    te = float(excess_daily.std() * math.sqrt(252.0))
    info_ratio = excess_ann / te if te > 1e-9 else 0.0

    # Drawdown
    peak = nav.cummax()
    dd = (nav / peak - 1.0) * 100.0
    max_dd = float(dd.min())
    max_dd_date = dd.idxmin().strftime("%Y-%m-%d") if len(dd) else ""
    calmar = (ann_ret * 100.0) / abs(max_dd) if abs(max_dd) > 1e-6 else 0.0

    # Max DD duration in trading days
    underwater = nav < peak
    max_dd_dur = 0
    cur_dur = 0
    for uw in underwater.values:
        if uw:
            cur_dur += 1
            if cur_dur > max_dd_dur:
                max_dd_dur = cur_dur
        else:
            cur_dur = 0

    # Alpha & Beta vs benchmark
    if bm_ret.std() > 1e-9 and len(daily_ret) > 10:
        cov = np.cov(daily_ret.values, bm_ret.values)
        beta = float(cov[0, 1] / cov[1, 1]) if cov[1, 1] > 1e-12 else 0.0
        alpha = ann_ret - (rf + beta * (bm_ann_ret - rf))
    else:
        beta, alpha = 0.0, 0.0

    # Trade stats
    closed = [t for t in trades if t.get("return_pct") is not None]
    wins = [t for t in closed if float(t["return_pct"]) > 0]
    losses = [t for t in closed if float(t["return_pct"]) <= 0]
    win_rate = (len(wins) / len(closed) * 100.0) if closed else float((daily_ret > 0).mean() * 100.0)
    gross_win = sum(max(0.0, _safe_float(t.get("pnl"))) for t in wins)
    gross_loss = abs(sum(min(0.0, _safe_float(t.get("pnl"))) for t in losses))
    profit_factor = (gross_win / gross_loss) if gross_loss > 1e-6 else (9.99 if gross_win > 0 else 0.0)
    avg_hold = float(np.mean([_safe_float(t.get("holding_days")) for t in closed])) if closed else 0.0
    avg_win_pct = float(np.mean([_safe_float(t.get("return_pct")) for t in wins])) if wins else 0.0
    avg_loss_pct = float(np.mean([_safe_float(t.get("return_pct")) for t in losses])) if losses else 0.0
    expectancy = (win_rate / 100.0) * avg_win_pct + (1.0 - win_rate / 100.0) * avg_loss_pct

    # Tail risk & distribution stats (QuantStats style)
    ret_arr = daily_ret.to_numpy(dtype=float)
    ret_arr = ret_arr[np.isfinite(ret_arr)]
    var_95 = float(np.percentile(ret_arr, 5) * 100.0) if len(ret_arr) >= 5 else 0.0
    tail_vals = ret_arr[ret_arr <= np.percentile(ret_arr, 5)] if len(ret_arr) >= 5 else np.array([0.0])
    cvar_95 = float(np.mean(tail_vals) * 100.0) if len(tail_vals) else 0.0
    skew_v = float(pd.Series(ret_arr).skew()) if len(ret_arr) >= 5 else 0.0
    kurt_v = float(pd.Series(ret_arr).kurt()) if len(ret_arr) >= 5 else 0.0
    best_day = float(np.max(ret_arr) * 100.0) if len(ret_arr) else 0.0
    worst_day = float(np.min(ret_arr) * 100.0) if len(ret_arr) else 0.0
    pos_days_pct = float((ret_arr > 0).mean() * 100.0) if len(ret_arr) else 0.0

    max_win_streak, max_loss_streak, cw, cl = 0, 0, 0, 0
    for r_v in ret_arr:
        if r_v > 0:
            cw += 1
            cl = 0
            if cw > max_win_streak:
                max_win_streak = cw
        elif r_v < 0:
            cl += 1
            cw = 0
            if cl > max_loss_streak:
                max_loss_streak = cl

    # Rolling 60D Sharpe & Rolling 60D Beta
    roll_mean = daily_ret.rolling(60, min_periods=20).mean()
    roll_std = daily_ret.rolling(60, min_periods=20).std().replace(0, np.nan)
    roll_sharpe = ((roll_mean * 252.0 - rf) / (roll_std * math.sqrt(252.0))).clip(-8, 8)
    roll_cov = daily_ret.rolling(60, min_periods=20).cov(bm_ret)
    roll_var = bm_ret.rolling(60, min_periods=20).var().replace(0, np.nan)
    roll_beta = (roll_cov / roll_var).clip(-4, 4)

    # Return distribution histogram
    ret_hist = {"bins": [], "counts": [], "var_95": round(var_95, 2)}
    try:
        if len(ret_arr) >= 10:
            r_pct_arr = ret_arr * 100.0
            lo_b, hi_b = np.percentile(r_pct_arr, [1, 99])
            clipped = np.clip(r_pct_arr, min(lo_b, -1.0), max(hi_b, 1.0))
            cnts, edges = np.histogram(clipped, bins=24)
            ret_hist = {
                "bins": [round((edges[i] + edges[i + 1]) / 2.0, 2) for i in range(len(cnts))],
                "counts": [int(c) for c in cnts],
                "var_95": round(var_95, 2),
            }
    except Exception:
        pass

    # Top 5 worst drawdown episodes (QuantStats Worst 5 Drawdowns)
    worst_drawdowns: list[dict] = []
    try:
        in_dd = False
        dd_start_i = 0
        episodes = []
        dd_vals = dd.to_numpy(dtype=float)
        idx_dates = nav.index
        for i in range(len(dd_vals)):
            if dd_vals[i] < -1e-6:
                if not in_dd:
                    in_dd = True
                    dd_start_i = max(0, i - 1)
            else:
                if in_dd:
                    seg = dd_vals[dd_start_i : i + 1]
                    v_rel = int(np.argmin(seg))
                    v_i = dd_start_i + v_rel
                    episodes.append({
                        "start": idx_dates[dd_start_i].strftime("%Y-%m-%d"),
                        "valley": idx_dates[v_i].strftime("%Y-%m-%d"),
                        "recovery": idx_dates[i].strftime("%Y-%m-%d"),
                        "depth_pct": round(float(dd_vals[v_i]), 2),
                        "duration_days": int((idx_dates[i] - idx_dates[dd_start_i]).days),
                        "recovered": True,
                    })
                    in_dd = False
        if in_dd:
            seg = dd_vals[dd_start_i:]
            v_rel = int(np.argmin(seg))
            v_i = dd_start_i + v_rel
            episodes.append({
                "start": idx_dates[dd_start_i].strftime("%Y-%m-%d"),
                "valley": idx_dates[v_i].strftime("%Y-%m-%d"),
                "recovery": "未修复",
                "depth_pct": round(float(dd_vals[v_i]), 2),
                "duration_days": int((idx_dates[-1] - idx_dates[dd_start_i]).days),
                "recovered": False,
            })
        episodes.sort(key=lambda x: x["depth_pct"])
        for rank_i, ep in enumerate(episodes[:5], 1):
            worst_drawdowns.append({"rank": rank_i, **ep})
    except Exception:
        pass

    # Monthly returns heatmap
    monthly_rows = []
    try:
        m_nav = nav.resample("ME" if hasattr(pd, "offsets") and pd.__version__ >= "2.2" else "M").last()
        m_ret = m_nav.pct_change()
        if len(m_nav):
            m_ret.iloc[0] = m_nav.iloc[0] - 1.0
        years = sorted({d.year for d in m_ret.index})
        for yr in years:
            row = {"year": int(yr), "months": [None] * 12, "ytd": 0.0}
            yr_vals = []
            for dt, val in m_ret[m_ret.index.year == yr].items():
                r_pct = round(_safe_float(val) * 100.0, 2)
                row["months"][dt.month - 1] = r_pct
                yr_vals.append(_safe_float(val))
            ytd = float(np.prod([1.0 + x for x in yr_vals]) - 1.0) * 100.0 if yr_vals else 0.0
            row["ytd"] = round(ytd, 2)
            monthly_rows.append(row)
    except Exception:
        pass

    dates = [d.strftime("%Y-%m-%d") for d in nav.index]
    res = {
        "ok": True,
        "engine": engine_name,
        "meta": meta,
        "kpis": {
            "init_cash": round(init_cash, 2),
            "final_equity": round(_safe_float(eq.iloc[-1]), 2),
            "total_return": round(total_ret * 100.0, 2),
            "annual_return": round(ann_ret * 100.0, 2),
            "benchmark_return": round(bm_total_ret * 100.0, 2),
            "benchmark_annual": round(bm_ann_ret * 100.0, 2),
            "excess_return": round((total_ret - bm_total_ret) * 100.0, 2),
            "excess_annual": round(excess_ann * 100.0, 2),
            "volatility": round(vol * 100.0, 2),
            "benchmark_vol": round(bm_vol * 100.0, 2),
            "sharpe": round(_safe_float(sharpe), 2),
            "sortino": round(_safe_float(sortino), 2),
            "calmar": round(_safe_float(calmar), 2),
            "info_ratio": round(_safe_float(info_ratio), 2),
            "max_drawdown": round(_safe_float(max_dd), 2),
            "max_dd_date": max_dd_date,
            "max_dd_days": int(max_dd_dur),
            "beta": round(_safe_float(beta), 2),
            "alpha": round(_safe_float(alpha) * 100.0, 2),
            "win_rate": round(_safe_float(win_rate), 1),
            "profit_factor": round(_safe_float(profit_factor), 2),
            "total_trades": len(trades),
            "avg_holding_days": round(_safe_float(avg_hold), 1),
            "avg_win_pct": round(_safe_float(avg_win_pct), 2),
            "avg_loss_pct": round(_safe_float(avg_loss_pct), 2),
            "expectancy": round(_safe_float(expectancy), 2),
            "var_95": round(_safe_float(var_95), 2),
            "cvar_95": round(_safe_float(cvar_95), 2),
            "skew": round(_safe_float(skew_v), 2),
            "kurtosis": round(_safe_float(kurt_v), 2),
            "best_day": round(_safe_float(best_day), 2),
            "worst_day": round(_safe_float(worst_day), 2),
            "pos_days_pct": round(_safe_float(pos_days_pct), 1),
            "max_win_streak": int(max_win_streak),
            "max_loss_streak": int(max_loss_streak),
        },
        "series": {
            "dates": dates,
            "nav": _round_list(nav.values, 4),
            "benchmark": _round_list(bm.values, 4),
            "excess": _round_list(excess_nav.values, 4),
            "drawdown": _round_list(dd.values, 2),
            "daily_returns": _round_list(daily_ret.values * 100.0, 3),
            "rolling_sharpe": _round_list(roll_sharpe.values, 2),
            "rolling_beta": _round_list(roll_beta.values, 2),
            "equity": _round_list(eq.values, 2),
        },
        "return_hist": ret_hist,
        "worst_drawdowns": worst_drawdowns,
        "monthly_returns": monthly_rows,
        "trades": trades[-300:],
    }
    if extra:
        res.update(extra)
    return res


# ---------------------------------------------------------------------------
# Engine A: VectorBT (Single-Asset Timing & Multi-Asset Rotation)
# ---------------------------------------------------------------------------

def _run_vectorbt_backtest(params: dict, store_dir: str) -> dict:
    if vbt is None:
        raise RuntimeError("VectorBT 未安装，请检查 .venv_quant 环境。")

    strategy = str(params.get("strategy") or "dual_ma").strip()
    start_date = str(params.get("start_date") or "").strip()
    end_date = str(params.get("end_date") or "").strip()
    init_cash = max(1000.0, float(params.get("init_cash") or 1000000.0))
    fees = max(0.0, float(params.get("fees_bps") or 3.0)) / 10000.0
    slippage = max(0.0, float(params.get("slippage_bps") or 5.0)) / 10000.0
    sl_stop = float(params.get("stop_loss_pct") or 0.0) / 100.0
    tp_stop = float(params.get("take_profit_pct") or 0.0) / 100.0
    benchmark = str(params.get("benchmark") or "000300.SH").strip()
    sp = params.get("strategy_params") or {}

    # Multi-asset ETF / Cross-Asset Momentum Rotation
    if strategy == "etf_momentum_rotation":
        universe = str(params.get("universe") or "etf_pool").strip()
        raw_syms = params.get("symbols") or []
        emit_progress(20, f"正在加载多资产轮动标的池 ({universe})...")
        panels, meta_map = _load_panels(store_dir, universe=universe, symbols=raw_syms or None, start_date=start_date, end_date=end_date)
        close = panels["close"].ffill().dropna(how="all")
        # Keep symbols with >= 50% coverage
        close = close.dropna(axis=1, thresh=max(40, int(len(close) * 0.5)))
        if close.shape[1] < 2:
            raise RuntimeError("多资产轮动至少需要 2 只已同步标的，请先同步 ETF 池或全球资产池。")

        lookback = max(5, int(sp.get("lookback") or 20))
        rebalance_days = max(1, int(sp.get("rebalance_days") or 10))
        top_k = max(1, min(close.shape[1], int(sp.get("top_k") or 3)))
        abs_filter = bool(sp.get("abs_momentum_filter", True))

        emit_progress(48, f"正在用 VectorBT 执行 {close.shape[1]} 只标的 Top-{top_k} 动量轮动回测...")
        mom = close.pct_change(lookback)
        vol = close.pct_change().rolling(lookback).std().replace(0, np.nan)
        use_risk_adj = bool(sp.get("risk_adjusted", True))
        score = (mom / vol) if use_risk_adj else mom

        # Construct target weight matrix on rebalance dates (shifted by 1 day to avoid look-ahead)
        target_w = pd.DataFrame(np.nan, index=close.index, columns=close.columns)
        rebal_logs: list[dict] = []
        for idx in range(lookback + 1, len(close), rebalance_days):
            sig_row = score.iloc[idx - 1].dropna()
            mom_row = mom.iloc[idx - 1]
            if abs_filter:
                sig_row = sig_row[mom_row.reindex(sig_row.index) > 0]
            picks = sig_row.sort_values(ascending=False).head(top_k).index.tolist()
            w_row = pd.Series(0.0, index=close.columns)
            if picks:
                w = 1.0 / len(picks)
                for p in picks:
                    w_row[p] = w
            target_w.iloc[idx] = w_row
            rebal_logs.append({
                "date": close.index[idx].strftime("%Y-%m-%d"),
                "holdings": [
                    {"symbol": p, "name": (meta_map.get(p) or {}).get("name", p), "weight": round(100.0 / len(picks), 1)}
                    for p in picks
                ],
            })

        # VectorBT multi-asset Portfolio.from_orders with targetpercent!
        pf = vbt.Portfolio.from_orders(
            close=close,
            size=target_w,
            size_type="targetpercent",
            init_cash=init_cash,
            fees=fees,
            slippage=slippage,
            cash_sharing=True,
            group_by=True,
            call_seq="auto",
            freq="1D",
        )

        emit_progress(82, "正在生成 VectorBT 绩效归因与每日持仓明细...")
        eq = pf.value()
        if isinstance(eq, pd.DataFrame):
            eq = eq.iloc[:, 0]
        bm = _load_benchmark_series(store_dir, benchmark, eq.index)
        trades = _extract_vbt_trades(pf, meta_map)
        latest_holdings = rebal_logs[-1]["holdings"] if rebal_logs else []

        # Daily positions & logs for multi-asset rotation
        daily_positions: list[dict] = []
        try:
            asset_v = pf.asset_value()
            if isinstance(asset_v, pd.DataFrame):
                asset_v = asset_v.sum(axis=1)
            cash_v = pf.cash()
            if isinstance(cash_v, pd.DataFrame):
                cash_v = cash_v.iloc[:, 0]
            dr_pct = eq.pct_change().fillna(0.0) * 100.0
            # Map each date to most recent rebalance holdings
            rebal_by_d = {r["date"]: r["holdings"] for r in rebal_logs}
            cur_h_lbl = "现金空仓"
            for dt_i in eq.index:
                ds = dt_i.strftime("%Y-%m-%d")
                if ds in rebal_by_d:
                    hs = rebal_by_d[ds]
                    cur_h_lbl = ", ".join(h["name"] for h in hs[:4]) + (f" 等{len(hs)}只" if len(hs) > 4 else "") if hs else "空仓避险(动量≤0)"
                if dt_i >= eq.index[max(0, len(eq) - 160)]:
                    eq_i = _safe_float(eq.loc[dt_i], 0.0)
                    av_i = _safe_float(asset_v.loc[dt_i], 0.0)
                    cv_i = _safe_float(cash_v.loc[dt_i], 0.0)
                    pos_pct = (av_i / eq_i * 100.0) if eq_i > 0 else 0.0
                    daily_positions.append({
                        "date": ds, "equity": round(eq_i, 2), "pos_value": round(av_i, 2),
                        "cash": round(cv_i, 2), "pos_pct": round(pos_pct, 1),
                        "day_ret": round(_safe_float(dr_pct.loc[dt_i]), 2), "summary": cur_h_lbl,
                    })
        except Exception:
            pass

        run_logs = [
            f"[INIT] 引擎 VectorBT Multi-Asset | 池: {universe} ({close.shape[1]} 只标的) | 回测区间: {close.index[0].strftime('%Y-%m-%d')} ~ {close.index[-1].strftime('%Y-%m-%d')}",
            f"[RULE] 回看 {lookback}日 | 每 {rebalance_days}日调仓 | 持仓 Top-{top_k} | 风险调整={use_risk_adj} | 空仓避险={abs_filter}",
            f"[EXEC] 共执行 {len(rebal_logs)} 次调仓，产生 {len(trades)} 笔成交记录",
        ]
        for rb in rebal_logs[-10:]:
            hl = ", ".join(f"{h['name']}({h['weight']}%)" for h in rb["holdings"]) or "空仓避险"
            run_logs.append(f"[REBAL] {rb['date']} -> {hl}")

        return _compute_standard_report(
            eq, bm, trades, init_cash,
            engine_name=f"VectorBT {getattr(vbt, '__version__', '')} (Multi-Asset Portfolio)",
            meta={
                "strategy": strategy,
                "strategy_label": f"多资产动量轮动 Top-{top_k} ({lookback}D/{rebalance_days}D调仓)",
                "universe": universe,
                "symbol_count": close.shape[1],
                "benchmark": benchmark,
                "fees_bps": round(fees * 10000, 2),
                "slippage_bps": round(slippage * 10000, 2),
            },
            extra={
                "latest_holdings": latest_holdings,
                "rebalance_log": rebal_logs[-30:],
                "daily_positions": list(reversed(daily_positions)),
                "run_logs": run_logs,
            },
        )

    # Single-asset strategies
    target_sym = str(params.get("symbol") or "510300.SH").strip()
    emit_progress(20, f"正在加载标的 {target_sym} 历史日线数据...")
    panels, meta_map = _load_panels(store_dir, universe="custom", symbols=[target_sym], start_date=start_date, end_date=end_date)
    sym_col = panels["close"].columns[0]
    close = panels["close"][sym_col].dropna()
    high = panels["high"][sym_col].reindex(close.index).ffill()
    low = panels["low"][sym_col].reindex(close.index).ffill()
    open_ = panels["open"][sym_col].reindex(close.index).ffill()
    vol = panels["volume"][sym_col].reindex(close.index).fillna(0.0)
    if len(close) < 40:
        raise RuntimeError(f"标的 {target_sym} 历史日线不足 40 根，请先同步该标的。")

    emit_progress(48, f"正在计算策略信号并运行 VectorBT 引擎 ({strategy})...")
    entries = pd.Series(False, index=close.index)
    exits = pd.Series(False, index=close.index)
    strat_label = strategy
    overlay_specs: list[tuple[str, str, pd.Series]] = []

    if strategy == "dual_ma":
        fast_w = max(2, int(sp.get("fast") or 10))
        slow_w = max(fast_w + 2, int(sp.get("slow") or 30))
        use_ema = bool(sp.get("ema", True))
        ma_f = close.ewm(span=fast_w, adjust=False).mean() if use_ema else close.rolling(fast_w).mean()
        ma_s = close.ewm(span=slow_w, adjust=False).mean() if use_ema else close.rolling(slow_w).mean()
        entries = (ma_f > ma_s) & (ma_f.shift(1) <= ma_s.shift(1))
        exits = (ma_f < ma_s) & (ma_f.shift(1) >= ma_s.shift(1))
        strat_label = f"双均线趋势 ({'EMA' if use_ema else 'SMA'} {fast_w}/{slow_w})"
        overlay_specs = [(f"Fast {fast_w}", "#3b82f6", ma_f), (f"Slow {slow_w}", "#f59e0b", ma_s)]

    elif strategy == "macd_trend":
        fast_w = max(4, int(sp.get("fast") or 12))
        slow_w = max(fast_w + 4, int(sp.get("slow") or 26))
        sig_w = max(3, int(sp.get("signal") or 9))
        ma_filter = max(0, int(sp.get("ma_filter") or 60))
        hist = qf._calc_macd_hist(close, fast_w, slow_w, sig_w)
        ma_f = close.rolling(ma_filter).mean() if ma_filter > 0 else pd.Series(0.0, index=close.index)
        entries = (hist > 0) & (hist.shift(1) <= 0) & (close >= ma_f)
        exits = (hist < 0) & (hist.shift(1) >= 0)
        strat_label = f"MACD趋势共振 ({fast_w}/{slow_w}/{sig_w}, MA{ma_filter}过滤)"
        if ma_filter > 0:
            overlay_specs = [(f"MA{ma_filter}", "#f59e0b", ma_f)]

    elif strategy == "rsi_boll_reversion":
        rsi_w = max(4, int(sp.get("rsi_window") or 14))
        rsi_low = float(sp.get("rsi_low") or 32.0)
        rsi_high = float(sp.get("rsi_high") or 68.0)
        boll_w = max(10, int(sp.get("boll_window") or 20))
        rsi = qf._calc_rsi(close, rsi_w)
        mid = close.rolling(boll_w).mean()
        sd = close.rolling(boll_w).std()
        dn = mid - 2.0 * sd
        up = mid + 2.0 * sd
        entries = (rsi < rsi_low) & (close <= dn * 1.015)
        exits = (rsi > rsi_high) | (close >= up)
        strat_label = f"RSI({rsi_w}) + 布林({boll_w})均值回归"
        overlay_specs = [("BOLL Upper", "#ef4444", up), ("BOLL Mid", "#94a3b8", mid), ("BOLL Lower", "#10b981", dn)]

    elif strategy == "turtle_breakout":
        entry_w = max(5, int(sp.get("entry_window") or 20))
        exit_w = max(3, int(sp.get("exit_window") or 10))
        hh = high.shift(1).rolling(entry_w).max()
        ll = low.shift(1).rolling(exit_w).min()
        entries = close > hh
        exits = close < ll
        strat_label = f"海龟唐奇安通道突破 ({entry_w}/{exit_w}日)"
        overlay_specs = [(f"Donchian High({entry_w})", "#10b981", hh), (f"Donchian Low({exit_w})", "#ef4444", ll)]

    elif strategy == "factor_timing":
        fid = str(sp.get("factor_id") or "ta_rsi14").strip()
        custom_expr = str(sp.get("custom_expr") or "").strip()
        f_df = qf.compute_factor(fid, panels, custom_expr=custom_expr)
        f_ser = f_df[sym_col].reindex(close.index)
        win = max(20, int(sp.get("pct_window") or 120))
        buy_q = float(sp.get("buy_quantile") or 0.75)
        sell_q = float(sp.get("sell_quantile") or 0.30)
        rk = f_ser.rolling(win, min_periods=20).apply(lambda x: np.sum(x <= x[-1]) / len(x), raw=True)
        entries = (rk >= buy_q) & (rk.shift(1) < buy_q)
        exits = (rk <= sell_q) & (rk.shift(1) > sell_q)
        strat_label = f"单因子择时 ({fid} Q>{buy_q:.2f}买 / Q<{sell_q:.2f}卖)"
        overlay_specs = [("MA20", "#3b82f6", close.rolling(20).mean())]

    elif strategy == "custom_code":
        code_str = str(sp.get("code") or "").strip()
        if not code_str:
            raise ValueError("请输入自定义策略 Python 代码（需赋值 entries 和 exits 布尔 Series）")
        if re.search(r"__|import\s+|exec\s*\(|eval\s*\(|open\s*\(|os\.|sys\.|subprocess", code_str):
            raise ValueError("自定义策略代码不允许导入模块或访问系统资源，请直接使用内置的 open/high/low/close/volume/pd/np/talib/qf")
        safe_env = {
            "__builtins__": {"abs": abs, "min": min, "max": max, "len": len, "range": range, "float": float, "int": int, "bool": bool, "round": round},
            "pd": pd, "np": np, "talib": _talib, "qf": qf,
            "open": open_, "high": high, "low": low, "close": close, "volume": vol,
            "ret": close.pct_change().fillna(0.0),
            "entries": pd.Series(False, index=close.index),
            "exits": pd.Series(False, index=close.index),
            "overlays": {},
        }
        exec(code_str, safe_env, safe_env)
        entries = pd.Series(safe_env.get("entries"), index=close.index).fillna(False).astype(bool)
        exits = pd.Series(safe_env.get("exits"), index=close.index).fillna(False).astype(bool)
        ov_colors = ["#3b82f6", "#f59e0b", "#10b981", "#ec4899"]
        ov_dict = safe_env.get("overlays") or {}
        if isinstance(ov_dict, dict):
            for idx_ov, (k_ov, s_ov) in enumerate(ov_dict.items()):
                if isinstance(s_ov, pd.Series):
                    overlay_specs.append((str(k_ov), ov_colors[idx_ov % len(ov_colors)], s_ov.reindex(close.index)))
        strat_label = str(sp.get("code_name") or "自定义 Python 策略")

    else:
        raise ValueError(f"不支持的 VectorBT 策略类型: {strategy}")

    # Shift signals by 1 bar to prevent look-ahead bias (execute on next bar)
    entries = entries.shift(1).fillna(False).astype(bool)
    exits = exits.shift(1).fillna(False).astype(bool)

    pf_kwargs = dict(
        close=close,
        entries=entries,
        exits=exits,
        init_cash=init_cash,
        fees=fees,
        slippage=slippage,
        freq="1D",
    )
    if sl_stop > 0:
        pf_kwargs["sl_stop"] = sl_stop
    if tp_stop > 0:
        pf_kwargs["tp_stop"] = tp_stop

    pf = vbt.Portfolio.from_signals(**pf_kwargs)

    emit_progress(82, "正在整理 VectorBT 绩效指标与 K线买卖点复盘...")
    eq = pf.value()
    bm = close / close.iloc[0] if benchmark in ("self", "buy_hold", sym_col) else _load_benchmark_series(store_dir, benchmark, eq.index)
    trades = _extract_vbt_trades(pf, meta_map, default_symbol=sym_col)

    # Build TradingView Lightweight-Charts K-line trade replay package
    kline_bars = []
    for dt_i in close.index:
        t_str = dt_i.strftime("%Y-%m-%d")
        kline_bars.append({
            "time": t_str,
            "open": round(_safe_float(open_.loc[dt_i]), 4),
            "high": round(_safe_float(high.loc[dt_i]), 4),
            "low": round(_safe_float(low.loc[dt_i]), 4),
            "close": round(_safe_float(close.loc[dt_i]), 4),
            "volume": round(_safe_float(vol.loc[dt_i]), 2),
        })
    kline_overlays = []
    for ov_name, ov_col, ov_ser in overlay_specs:
        pts = []
        for dt_i, v_i in ov_ser.dropna().items():
            fv = _safe_float(v_i, np.nan)
            if not math.isnan(fv):
                pts.append({"time": dt_i.strftime("%Y-%m-%d"), "value": round(fv, 4)})
        if pts:
            kline_overlays.append({"name": ov_name, "color": ov_col, "data": pts})
    kline_markers = []
    for tr in trades:
        if tr.get("entry_date"):
            kline_markers.append({
                "time": tr["entry_date"],
                "position": "belowBar",
                "color": "#10b981",
                "shape": "arrowUp",
                "text": f"B {tr['entry_price']}",
            })
        if tr.get("exit_date") and tr.get("status", "Closed") != "Open":
            rp = float(tr.get("return_pct") or 0.0)
            kline_markers.append({
                "time": tr["exit_date"],
                "position": "aboveBar",
                "color": "#ef4444" if rp < 0 else "#f59e0b",
                "shape": "arrowDown",
                "text": f"S {rp:+.1f}%",
            })
    kline_markers.sort(key=lambda m: m["time"])

    m_info = meta_map.get(sym_col, {"symbol": sym_col, "name": sym_col})

    # JoinQuant-style daily positions & run logs
    daily_positions: list[dict] = []
    try:
        asset_v = pf.asset_value()
        cash_v = pf.cash()
        if isinstance(asset_v, pd.DataFrame):
            asset_v = asset_v.sum(axis=1)
        if isinstance(cash_v, pd.DataFrame):
            cash_v = cash_v.iloc[:, 0]
        dr_pct = eq.pct_change().fillna(0.0) * 100.0
        for dt_i in eq.index[-160:]:
            eq_i = _safe_float(eq.loc[dt_i], 0.0)
            av_i = _safe_float(asset_v.loc[dt_i], 0.0)
            cv_i = _safe_float(cash_v.loc[dt_i], 0.0)
            pos_pct = (av_i / eq_i * 100.0) if eq_i > 0 else 0.0
            daily_positions.append({
                "date": dt_i.strftime("%Y-%m-%d"),
                "equity": round(eq_i, 2),
                "pos_value": round(av_i, 2),
                "cash": round(cv_i, 2),
                "pos_pct": round(pos_pct, 1),
                "day_ret": round(_safe_float(dr_pct.loc[dt_i]), 2),
                "summary": f"{m_info.get('name', sym_col)} ({pos_pct:.0f}%)" if av_i > 1 else "空仓持有现金",
            })
    except Exception:
        pass

    run_logs = [
        f"[INIT] 引擎 VectorBT {getattr(vbt, '__version__', '')} | 标的: {m_info.get('name', sym_col)} ({sym_col})",
        f"[DATA] 回测区间: {close.index[0].strftime('%Y-%m-%d')} ~ {close.index[-1].strftime('%Y-%m-%d')} 共 {len(close)} 个交易日",
        f"[RULE] 初始资金 ¥{init_cash:,.0f} | 佣金 {fees*10000:.1f}bps | 滑点 {slippage*10000:.1f}bps | 止损 {sl_stop*100:.1f}% | 止盈 {tp_stop*100:.1f}%",
        f"[EXEC] 信号已执行 T+1 次日移位（杜绝未来函数）| 共触发买入信号 {int(entries.sum())} 次，卖出信号 {int(exits.sum())} 次，形成 {len(trades)} 笔交易",
    ]
    for tr in trades[-12:]:
        run_logs.append(f"[TRADE] {tr['entry_date']} 买入@{tr['entry_price']} -> {tr['exit_date'] or '持仓中'} 卖出@{tr['exit_price']} | 收益 {tr['return_pct']:+.2f}% | 盈亏 ¥{tr['pnl']:+,.1f}")

    return _compute_standard_report(
        eq, bm, trades, init_cash,
        engine_name=f"VectorBT {getattr(vbt, '__version__', '')} (Signal Portfolio)",
        meta={
            "strategy": strategy,
            "strategy_label": strat_label,
            "symbol": sym_col,
            "symbol_name": m_info.get("name", sym_col),
            "benchmark": "买入持有" if benchmark in ("self", "buy_hold", sym_col) else benchmark,
            "fees_bps": round(fees * 10000, 2),
            "slippage_bps": round(slippage * 10000, 2),
        },
        extra={
            "kline_replay": {
                "symbol": sym_col,
                "name": m_info.get("name", sym_col),
                "bars": kline_bars,
                "overlays": kline_overlays,
                "markers": kline_markers,
            },
            "daily_positions": list(reversed(daily_positions)),
            "run_logs": run_logs,
        },
    )


def _extract_vbt_trades(pf, meta_map: dict[str, dict], default_symbol: str = "") -> list[dict]:
    trades_out: list[dict] = []
    try:
        tdf = pf.trades.records_readable
        if tdf is None or tdf.empty:
            return trades_out
        for _, r in tdf.iterrows():
            col = str(r.get("Column") or default_symbol or "")
            sym = col if col in meta_map else (default_symbol or col)
            nm = (meta_map.get(sym) or {}).get("name", sym)
            ent_t = r.get("Entry Timestamp")
            ext_t = r.get("Exit Timestamp")
            ent_d = pd.Timestamp(ent_t).strftime("%Y-%m-%d") if pd.notna(ent_t) else ""
            ext_d = pd.Timestamp(ext_t).strftime("%Y-%m-%d") if pd.notna(ext_t) else ""
            hold_days = int((pd.Timestamp(ext_t) - pd.Timestamp(ent_t)).days) if (pd.notna(ent_t) and pd.notna(ext_t)) else 0
            trades_out.append({
                "symbol": sym,
                "name": nm,
                "direction": str(r.get("Direction") or "Long"),
                "entry_date": ent_d,
                "exit_date": ext_d,
                "entry_price": round(_safe_float(r.get("Avg Entry Price")), 4),
                "exit_price": round(_safe_float(r.get("Avg Exit Price")), 4),
                "size": round(_safe_float(r.get("Size")), 2),
                "pnl": round(_safe_float(r.get("PnL")), 2),
                "return_pct": round(_safe_float(r.get("Return")) * 100.0, 2),
                "fees": round(_safe_float(r.get("Entry Fees")) + _safe_float(r.get("Exit Fees")), 2),
                "holding_days": max(0, hold_days),
                "status": str(r.get("Status") or "Closed"),
            })
    except Exception:
        pass
    return trades_out


# ---------------------------------------------------------------------------
# Engine B: Qlib / LightGBM Multi-Factor A-Share Portfolio Engine
# ---------------------------------------------------------------------------

def _run_qlib_multifactor_backtest(params: dict, store_dir: str) -> dict:
    universe = str(params.get("universe") or "hs300").strip()
    start_date = str(params.get("start_date") or "").strip()
    end_date = str(params.get("end_date") or "").strip()
    init_cash = max(10000.0, float(params.get("init_cash") or 1000000.0))
    open_cost = max(0.0, float(params.get("fees_bps") or 3.0)) / 10000.0
    stamp_duty = max(0.0, float(params.get("stamp_duty_bps") or 5.0)) / 10000.0
    slippage = max(0.0, float(params.get("slippage_bps") or 5.0)) / 10000.0
    close_cost = open_cost + stamp_duty
    benchmark = str(params.get("benchmark") or "000300.SH").strip()

    sp = params.get("strategy_params") or {}
    model_type = str(sp.get("model_type") or "lightgbm").strip().lower()  # lightgbm | linear_ic
    factor_set = str(sp.get("factor_set") or "alpha158_core").strip()
    custom_factor_ids = sp.get("factor_ids") or []
    topk = max(3, min(50, int(sp.get("topk") or 15)))
    n_drop = max(1, min(topk, int(sp.get("n_drop") or 3)))
    rebalance_days = max(1, int(sp.get("rebalance_days") or 5))
    label_horizon = max(1, int(sp.get("label_horizon") or 5))
    train_ratio = max(0.35, min(0.75, float(sp.get("train_ratio") or 0.55)))

    emit_progress(10, f"正在加载 A 股多因子面板数据 ({universe})...")
    panels, meta_map = _load_panels(store_dir, universe=universe, start_date=start_date, end_date=end_date)
    close = panels["close"].dropna(axis=1, thresh=max(60, int(len(panels["close"]) * 0.45)))
    if close.shape[1] < max(8, topk):
        raise RuntimeError(f"有效成分股数量不足（当前 {close.shape[1]} 只），请先在「数据仓」同步沪深300成分股（建议至少 50~80 只）。")

    valid_cols = list(close.columns)
    panels = {k: v.reindex(columns=valid_cols) for k, v in panels.items()}

    # Determine factor set
    if custom_factor_ids:
        factor_ids = [str(f) for f in custom_factor_ids]
    elif factor_set == "alpha158_core":
        factor_ids = [f["id"] for f in qf.FACTOR_CATALOG if f["family"] == "Alpha158"]
    elif factor_set == "alpha101_core":
        factor_ids = [f["id"] for f in qf.FACTOR_CATALOG if f["family"] == "Alpha101"]
    elif factor_set == "alpha_all_combo":
        factor_ids = [f["id"] for f in qf.FACTOR_CATALOG if f["family"] in ("Alpha158", "Alpha101", "Fundamental")]
    elif factor_set == "value_lowvol_quality":
        factor_ids = ["fund_ep_ttm", "fund_bp", "fund_dv_ttm", "fund_turnover20", "q158_std20", "q158_std60", "wq_alpha006", "ta_rsi14"]
    else:
        factor_ids = [f["id"] for f in qf.FACTOR_CATALOG if f["family"] in ("Alpha158", "Fundamental")]

    emit_progress(26, f"正在计算 {len(factor_ids)} 个成熟因子矩阵 ({factor_set})...")
    feat_dict = qf.build_feature_matrix_for_ml(panels, factor_ids, normalize=True)
    if not feat_dict:
        raise RuntimeError("未能计算出有效因子，请检查数据仓基本面/行情完整性。")

    dates = close.index
    fwd_ret = close.pct_change(label_horizon).shift(-label_horizon)
    # Cross-sectional rank label in [-0.5, 0.5]
    y_rank = fwd_ret.rank(axis=1, pct=True) - 0.5

    split_idx = int(len(dates) * train_ratio)
    split_idx = max(60, min(len(dates) - 40, split_idx))
    train_dates = dates[: split_idx - label_horizon]
    test_dates = dates[split_idx:]

    feature_importance: list[dict] = []
    pred_panel: pd.DataFrame

    if model_type == "lightgbm" and lgb is not None:
        emit_progress(46, f"正在使用 LightGBM 训练多因子选股模型（训练集 {len(train_dates)} 天 / 样本外 {len(test_dates)} 天）...")
        # Assemble stacked feature table
        feat_names = list(feat_dict.keys())
        stacked_cols = {fn: feat_dict[fn].stack(dropna=False) for fn in feat_names}
        X_all = pd.DataFrame(stacked_cols)
        X_all.index.names = ["date", "symbol"]
        y_all = y_rank.stack(dropna=False)
        y_all.index.names = ["date", "symbol"]

        tr_mask = X_all.index.get_level_values(0).isin(train_dates)
        te_mask = X_all.index.get_level_values(0).isin(test_dates)

        X_tr = X_all[tr_mask]
        y_tr = y_all[tr_mask]
        valid_tr = y_tr.notna() & (X_tr.notna().sum(axis=1) >= max(2, len(feat_names) // 3))
        X_tr = X_tr[valid_tr].fillna(0.0)
        y_tr = y_tr[valid_tr]

        if len(X_tr) < 200:
            raise RuntimeError("训练集样本量不足，请拉长历史数据区间（建议同步 2~3 年以上数据）。")

        model = lgb.LGBMRegressor(
            n_estimators=180,
            learning_rate=0.04,
            num_leaves=31,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_samples=30,
            reg_alpha=1.0,
            reg_lambda=5.0,
            random_state=42,
            n_jobs=-1,
            verbose=-1,
        )
        model.fit(X_tr, y_tr)

        X_te = X_all[te_mask].fillna(0.0)
        preds = pd.Series(model.predict(X_te), index=X_te.index)
        pred_panel = preds.unstack(level=1).reindex(index=test_dates, columns=valid_cols)

        imps = model.feature_importances_
        total_imp = float(np.sum(imps)) or 1.0
        for fn, imp_v in sorted(zip(feat_names, imps), key=lambda x: x[1], reverse=True)[:15]:
            fmeta = qf.FACTOR_META_MAP.get(fn, {})
            feature_importance.append({
                "factor_id": fn,
                "name": fmeta.get("name", fn),
                "family": fmeta.get("family", ""),
                "importance_pct": round(float(imp_v) / total_imp * 100.0, 2),
            })
    else:
        emit_progress(46, "正在按训练集 RankIC 加权合成多因子打分...")
        # Compute training-period RankIC weights per factor (avoiding look-ahead)
        weights: dict[str, float] = {}
        for fn, fdf in feat_dict.items():
            tr_f = fdf.loc[train_dates]
            tr_y = fwd_ret.loc[train_dates]
            ics = tr_f.corrwith(tr_y, axis=1, method="spearman").dropna()
            mean_ic = float(ics.mean()) if len(ics) > 5 else 0.0
            weights[fn] = mean_ic
        abs_sum = sum(abs(v) for v in weights.values()) or 1.0
        pred_panel = pd.DataFrame(0.0, index=test_dates, columns=valid_cols)
        for fn, w in weights.items():
            nw = w / abs_sum
            pred_panel = pred_panel.add(feat_dict[fn].reindex(index=test_dates, columns=valid_cols).fillna(0.0) * nw, fill_value=0.0)
        for fn, w in sorted(weights.items(), key=lambda x: abs(x[1]), reverse=True)[:15]:
            fmeta = qf.FACTOR_META_MAP.get(fn, {})
            feature_importance.append({
                "factor_id": fn,
                "name": fmeta.get("name", fn),
                "family": fmeta.get("family", ""),
                "importance_pct": round(abs(w) / abs_sum * 100.0, 2),
                "train_ic": round(w, 4),
            })

    # Compute out-of-sample RankIC of predicted score
    oos_fwd = fwd_ret.reindex(index=test_dates, columns=valid_cols)
    oos_ic_series = pred_panel.corrwith(oos_fwd, axis=1, method="spearman").dropna()
    oos_ic_mean = float(oos_ic_series.mean()) if len(oos_ic_series) else 0.0
    oos_icir = (oos_ic_mean / float(oos_ic_series.std())) if len(oos_ic_series) > 2 and float(oos_ic_series.std()) > 1e-9 else 0.0

    # Try native Microsoft Qlib backtest_daily if qlib + qlib_bin are ready, else run A-share TopK-Dropout simulator
    qlib_bin_dir = _store_paths(store_dir)["qlib_bin"]
    used_qlib_native = False
    eq_series = None
    trades_out: list[dict] = []
    rebal_logs: list[dict] = []

    if qlib is not None and os.path.isfile(os.path.join(qlib_bin_dir, "calendars", "day.txt")) and rebalance_days == 1:
        try:
            emit_progress(68, "正在调用 Microsoft Qlib SimulatorExecutor 执行 A股 TopK-Dropout 回测...")
            from qlib.backtest import backtest as qlib_backtest
            from qlib.backtest import executor as qlib_executor

            qlib.init(provider_uri=qlib_bin_dir, region="cn")
            pred_q = pred_panel.stack().dropna().to_frame("score")
            pred_q.index = pd.MultiIndex.from_arrays(
                [pred_q.index.get_level_values(1).str.upper(), pred_q.index.get_level_values(0)],
                names=["instrument", "datetime"],
            )
            pred_q = pred_q.sort_index()
            strategy_cfg = {
                "class": "TopkDropoutStrategy",
                "module_path": "qlib.contrib.strategy.signal_strategy",
                "kwargs": {"signal": pred_q, "topk": topk, "n_drop": n_drop},
            }
            executor_cfg = {
                "class": "SimulatorExecutor",
                "module_path": "qlib.backtest.executor",
                "kwargs": {"time_per_step": "day", "generate_portfolio_metrics": True},
            }
            portfolio_metric_dict, _indicator = qlib_backtest(
                start_time=test_dates[0].strftime("%Y-%m-%d"),
                end_time=test_dates[-1].strftime("%Y-%m-%d"),
                strategy=strategy_cfg,
                executor=executor_cfg,
                benchmark=benchmark.upper(),
                account=init_cash,
                exchange_kwargs={
                    "limit_threshold": 0.095,
                    "deal_price": "close",
                    "open_cost": open_cost + slippage,
                    "close_cost": close_cost + slippage,
                    "min_cost": 5.0,
                },
            )
            rep_df, _pos_dict = portfolio_metric_dict.get("1day", (None, None))
            if rep_df is not None and not rep_df.empty and "account" in rep_df.columns:
                eq_series = rep_df["account"].astype(float)
                eq_series.index = pd.to_datetime(eq_series.index)
                used_qlib_native = True
        except Exception:
            used_qlib_native = False

    daily_positions_q: list[dict] = []
    limit_blocks = {"buy_limit_up": 0, "sell_limit_down": 0}
    if not used_qlib_native:
        emit_progress(68, f"正在运行 A股 TopK-Dropout 撮合引擎（T+1 · 涨跌停限制 · 印花税 · {rebalance_days}日调仓）...")
        eq_series, trades_out, rebal_logs, daily_positions_q, limit_blocks = _simulate_ashare_topk_dropout(
            pred_panel=pred_panel,
            panels=panels,
            meta_map=meta_map,
            topk=topk,
            n_drop=n_drop,
            rebalance_days=rebalance_days,
            init_cash=init_cash,
            open_cost=open_cost + slippage,
            close_cost=close_cost + slippage,
        )

    # Latest model score ranking (actionable stock picks)
    last_dt = pred_panel.dropna(how="all").index[-1]
    last_scores = pred_panel.loc[last_dt].dropna().sort_values(ascending=False)
    last_prices = close.ffill().loc[last_dt]
    latest_picks = [
        {
            "symbol": str(sym),
            "name": (meta_map.get(str(sym)) or {}).get("name", str(sym)),
            "industry": (meta_map.get(str(sym)) or {}).get("industry", ""),
            "price": round(_safe_float(last_prices.get(sym)), 2),
            "score": round(_safe_float(sc), 4),
            "weight": round(100.0 / min(topk, len(last_scores)), 1),
        }
        for sym, sc in last_scores.head(topk).items()
    ]

    bm = _load_benchmark_series(store_dir, benchmark, eq_series.index)
    engine_label = (
        f"Microsoft Qlib {getattr(qlib, '__version__', '')} + {'LightGBM' if model_type == 'lightgbm' else 'IC-Linear'}"
        if used_qlib_native
        else f"Qlib-Compatible TopK-Dropout + {'LightGBM ' + getattr(lgb, '__version__', '') if model_type == 'lightgbm' and lgb else 'IC-Linear'}"
    )
    run_logs_q = [
        f"[INIT] 引擎 {engine_label} | 股票池: {universe} ({len(valid_cols)}只) | 因子数: {len(feat_dict)}",
        f"[SPLIT] 训练集: {train_dates[0].strftime('%Y-%m-%d')} ~ {train_dates[-1].strftime('%Y-%m-%d')} ({len(train_dates)}日) | 样本外回测: {test_dates[0].strftime('%Y-%m-%d')} ~ {test_dates[-1].strftime('%Y-%m-%d')} ({len(test_dates)}日)",
        f"[MODEL] 样本外预测 RankIC = {oos_ic_mean:+.4f} | ICIR = {oos_icir:.3f}",
        f"[RULE] TopK={topk} / DropN={n_drop} / 每{rebalance_days}日调仓 | 买佣金 {open_cost*10000:.1f}bps | 卖(含印花税) {close_cost*10000:.1f}bps | 滑点 {slippage*10000:.1f}bps",
        f"[RISK] 涨停禁买拦截 {limit_blocks['buy_limit_up']} 次 | 跌停禁卖拦截 {limit_blocks['sell_limit_down']} 次 | 总成交 {len(trades_out)} 笔",
    ]
    for rb in rebal_logs[-8:]:
        hl = ", ".join(h["name"] for h in rb.get("holdings", [])[:5])
        run_logs_q.append(f"[REBAL] {rb['date']} 持仓 {rb.get('count', 0)}只: {hl}...")

    emit_progress(95, "正在汇总多因子组合归因与特征重要度...")
    return _compute_standard_report(
        eq_series, bm, trades_out, init_cash,
        engine_name=engine_label,
        meta={
            "strategy": "qlib_multifactor",
            "strategy_label": f"多因子选股 ({factor_set} · {'LightGBM' if model_type == 'lightgbm' else 'IC加权'} · Top{topk}/Drop{n_drop})",
            "universe": universe,
            "symbol_count": len(valid_cols),
            "factor_count": len(feat_dict),
            "train_range": [train_dates[0].strftime("%Y-%m-%d"), train_dates[-1].strftime("%Y-%m-%d")],
            "test_range": [test_dates[0].strftime("%Y-%m-%d"), test_dates[-1].strftime("%Y-%m-%d")],
            "benchmark": benchmark,
            "oos_rank_ic": round(_safe_float(oos_ic_mean), 4),
            "oos_icir": round(_safe_float(oos_icir), 3),
            "fees_bps": round(open_cost * 10000, 2),
            "stamp_duty_bps": round(stamp_duty * 10000, 2),
            "slippage_bps": round(slippage * 10000, 2),
        },
        extra={
            "feature_importance": feature_importance,
            "latest_holdings": latest_picks,
            "rebalance_log": rebal_logs[-25:],
            "daily_positions": list(reversed(daily_positions_q[-160:])),
            "run_logs": run_logs_q,
        },
    )


def _simulate_ashare_topk_dropout(
    pred_panel: pd.DataFrame,
    panels: dict[str, pd.DataFrame],
    meta_map: dict[str, dict],
    topk: int,
    n_drop: int,
    rebalance_days: int,
    init_cash: float,
    open_cost: float,
    close_cost: float,
) -> tuple[pd.Series, list[dict], list[dict]]:
    """Realistic A-share TopK-Dropout simulator with T+1, limit-up/down blocking, stamp duty & commission."""
    dates = pred_panel.index
    close_df = panels["close"].reindex(index=dates).ffill()
    open_df = panels["open"].reindex(index=dates).fillna(close_df)
    pct_df = panels["pct_chg"].reindex(index=dates).fillna(0.0) if "pct_chg" in panels else close_df.pct_change().fillna(0.0) * 100.0

    cash = float(init_cash)
    holdings: dict[str, dict] = {}  # sym -> {shares, entry_price, entry_date, cost_paid}
    eq_vals: list[float] = []
    trades: list[dict] = []
    rebal_logs: list[dict] = []
    daily_positions: list[dict] = []
    limit_blocks = {"buy_limit_up": 0, "sell_limit_down": 0}
    prev_eq = float(init_cash)

    for i, dt in enumerate(dates):
        dt_str = dt.strftime("%Y-%m-%d")
        # Execute rebalance based on T-1 signal at T open/close (T+1 no look-ahead)
        if i >= 1 and ((i - 1) % rebalance_days == 0):
            sig = pred_panel.iloc[i - 1].dropna().sort_values(ascending=False)
            if not sig.empty:
                ranked = list(sig.index)
                rank_pos = {s: idx for idx, s in enumerate(ranked)}
                cur_held = list(holdings.keys())

                # Sort currently held worst-first by today's rank
                cur_held_sorted = sorted(cur_held, key=lambda s: rank_pos.get(s, 999999), reverse=True)
                top_candidates = [s for s in ranked if s not in holdings]

                # Sell worst up to n_drop that are outside topk
                to_sell = []
                for s in cur_held_sorted:
                    if len(to_sell) >= n_drop and len(cur_held) - len(to_sell) <= topk:
                        break
                    if rank_pos.get(s, 999999) >= topk:
                        to_sell.append(s)
                    if len(to_sell) >= n_drop and len(cur_held) <= topk:
                        break

                for s in to_sell:
                    px = _safe_float(open_df.loc[dt, s], _safe_float(close_df.loc[dt, s], 0.0))
                    pct_day = _safe_float(pct_df.loc[dt, s], 0.0)
                    # Block sell if locked at limit-down (~ -9.7%)
                    if px <= 0:
                        continue
                    if pct_day <= -9.7:
                        limit_blocks["sell_limit_down"] += 1
                        continue
                    pos = holdings.pop(s)
                    gross = pos["shares"] * px
                    fee = max(5.0, gross * close_cost)
                    cash += gross - fee
                    pnl = (gross - fee) - (pos["shares"] * pos["entry_price"] + pos["cost_paid"])
                    ret_pct = (px / pos["entry_price"] - 1.0) * 100.0 if pos["entry_price"] > 0 else 0.0
                    hold_days = max(1, (dt - pd.Timestamp(pos["entry_date"])).days)
                    trades.append({
                        "symbol": s,
                        "name": (meta_map.get(s) or {}).get("name", s),
                        "direction": "Long",
                        "entry_date": pos["entry_date"],
                        "exit_date": dt_str,
                        "entry_price": round(pos["entry_price"], 3),
                        "exit_price": round(px, 3),
                        "size": round(pos["shares"], 0),
                        "pnl": round(pnl, 2),
                        "return_pct": round(ret_pct, 2),
                        "fees": round(pos["cost_paid"] + fee, 2),
                        "holding_days": hold_days,
                        "status": "Closed",
                    })

                slots = max(0, topk - len(holdings))
                if slots > 0 and cash > 1000.0:
                    buy_list = []
                    for s in top_candidates:
                        if len(buy_list) >= slots:
                            break
                        px = _safe_float(open_df.loc[dt, s], _safe_float(close_df.loc[dt, s], 0.0))
                        pct_day = _safe_float(pct_df.loc[dt, s], 0.0)
                        # Block buy if locked at limit-up (~ +9.7%)
                        if px <= 0:
                            continue
                        if pct_day >= 9.7:
                            limit_blocks["buy_limit_up"] += 1
                            continue
                        buy_list.append((s, px))
                    if buy_list:
                        alloc = (cash * 0.992) / len(buy_list)
                        for s, px in buy_list:
                            # A-share lot = 100 shares (fallback fractional if stock > alloc)
                            shares = math.floor(alloc / (px * (1.0 + open_cost)) / 100.0) * 100.0
                            if shares < 100.0:
                                shares = math.floor(alloc / (px * (1.0 + open_cost)))
                            if shares <= 0:
                                continue
                            gross = shares * px
                            fee = max(5.0, gross * open_cost)
                            if gross + fee > cash:
                                continue
                            cash -= gross + fee
                            holdings[s] = {
                                "shares": shares,
                                "entry_price": px,
                                "entry_date": dt_str,
                                "cost_paid": fee,
                            }

                rebal_logs.append({
                    "date": dt_str,
                    "count": len(holdings),
                    "holdings": [
                        {"symbol": s, "name": (meta_map.get(s) or {}).get("name", s)}
                        for s in list(holdings.keys())[:10]
                    ],
                })

        # Mark-to-market equity at day close
        pos_val = 0.0
        for s, pos in holdings.items():
            px_c = _safe_float(close_df.loc[dt, s], pos["entry_price"])
            pos_val += pos["shares"] * px_c
        cur_eq = cash + pos_val
        eq_vals.append(cur_eq)
        day_r = ((cur_eq / prev_eq - 1.0) * 100.0) if prev_eq > 0 else 0.0
        prev_eq = cur_eq
        pos_pct = (pos_val / cur_eq * 100.0) if cur_eq > 0 else 0.0
        h_names = [(meta_map.get(s) or {}).get("name", s) for s in list(holdings.keys())[:4]]
        summ = (", ".join(h_names) + (f" 等{len(holdings)}只" if len(holdings) > 4 else "")) if holdings else "现金空仓"
        daily_positions.append({
            "date": dt_str, "equity": round(cur_eq, 2), "pos_value": round(pos_val, 2),
            "cash": round(cash, 2), "pos_pct": round(pos_pct, 1),
            "day_ret": round(day_r, 2), "summary": summ,
        })

    return pd.Series(eq_vals, index=dates), trades, rebal_logs, daily_positions, limit_blocks


def cmd_backtest(params: dict, store_dir: str) -> dict:
    engine = str(params.get("engine") or "vectorbt").strip().lower()
    if engine == "qlib":
        return _run_qlib_multifactor_backtest(params, store_dir)
    return _run_vectorbt_backtest(params, store_dir)


# ---------------------------------------------------------------------------
# VectorBT 2D Parameter Sensitivity Sweep (Heatmap)
# ---------------------------------------------------------------------------

def cmd_param_sweep(params: dict, store_dir: str) -> dict:
    if vbt is None:
        raise RuntimeError("VectorBT 未安装")
    strategy = str(params.get("strategy") or "dual_ma").strip()
    symbol = str(params.get("symbol") or "510300.SH").strip()
    universe = str(params.get("universe") or "etf_pool").strip()
    start_date = str(params.get("start_date") or "").strip()
    end_date = str(params.get("end_date") or "").strip()
    fees = max(0.0, float(params.get("fees_bps") or 3.0)) / 10000.0
    slippage = max(0.0, float(params.get("slippage_bps") or 5.0)) / 10000.0

    emit_progress(15, f"正在加载参数扫描历史数据 ({strategy})...")

    if strategy == "etf_momentum_rotation":
        panels, _ = _load_panels(store_dir, universe=universe, start_date=start_date, end_date=end_date)
        close = panels["close"].ffill().dropna(how="all")
        close = close.dropna(axis=1, thresh=max(40, int(len(close) * 0.5)))
        x_key, x_label, x_vals = "lookback", "动量回看(日)", [5, 10, 15, 20, 30, 45, 60]
        y_key, y_label, y_vals = "top_k", "持仓TopK", [1, 2, 3, 4, 5, 6]
        rebal = max(1, int((params.get("strategy_params") or {}).get("rebalance_days") or 10))
        sharpe_grid, ret_grid, dd_grid = [], [], []
        best = None
        total = len(x_vals) * len(y_vals)
        done = 0
        for yi, tk in enumerate(y_vals):
            for xi, lb in enumerate(x_vals):
                done += 1
                if tk > close.shape[1]:
                    sharpe_grid.append([xi, yi, None])
                    ret_grid.append([xi, yi, None])
                    dd_grid.append([xi, yi, None])
                    continue
                mom = close.pct_change(lb)
                vol = close.pct_change().rolling(lb).std().replace(0, np.nan)
                score = mom / vol
                tw = pd.DataFrame(np.nan, index=close.index, columns=close.columns)
                for idx in range(lb + 1, len(close), rebal):
                    sr = score.iloc[idx - 1].dropna()
                    mr = mom.iloc[idx - 1]
                    sr = sr[mr.reindex(sr.index) > 0]
                    picks = sr.sort_values(ascending=False).head(tk).index.tolist()
                    w_row = pd.Series(0.0, index=close.columns)
                    for p in picks:
                        w_row[p] = 1.0 / len(picks)
                    tw.iloc[idx] = w_row
                pf = vbt.Portfolio.from_orders(
                    close=close, size=tw, size_type="targetpercent", init_cash=1000000.0,
                    fees=fees, slippage=slippage, cash_sharing=True, group_by=True, call_seq="auto", freq="1D",
                )
                eq = pf.value()
                if isinstance(eq, pd.DataFrame):
                    eq = eq.iloc[:, 0]
                dr = eq.pct_change().fillna(0.0)
                n_d = max(1, len(eq) - 1)
                ann = float((eq.iloc[-1] / eq.iloc[0]) ** (252.0 / n_d) - 1.0)
                v_ann = float(dr.std() * math.sqrt(252.0))
                sh = round((ann - 0.02) / v_ann, 2) if v_ann > 1e-9 else 0.0
                ar = round(ann * 100.0, 2)
                mdd = round(float((eq / eq.cummax() - 1.0).min() * 100.0), 2)
                sharpe_grid.append([xi, yi, sh])
                ret_grid.append([xi, yi, ar])
                dd_grid.append([xi, yi, mdd])
                if best is None or sh > best["sharpe"]:
                    best = {"x": lb, "y": tk, "sharpe": sh, "annual_return": ar, "max_drawdown": mdd}
            emit_progress(20 + int(done / total * 75), f"已扫描 {done}/{total} 组轮动参数...")
        return {
            "ok": True, "strategy": strategy, "target": universe,
            "x_key": x_key, "x_label": x_label, "x_vals": x_vals,
            "y_key": y_key, "y_label": y_label, "y_vals": y_vals,
            "sharpe_grid": sharpe_grid, "return_grid": ret_grid, "maxdd_grid": dd_grid,
            "best": best,
        }

    # Single-asset fast sweep
    panels, meta_map = _load_panels(store_dir, universe="custom", symbols=[symbol], start_date=start_date, end_date=end_date)
    sym_col = panels["close"].columns[0]
    close = panels["close"][sym_col].dropna()
    high = panels["high"][sym_col].reindex(close.index).ffill()
    low = panels["low"][sym_col].reindex(close.index).ffill()

    if strategy == "rsi_boll_reversion":
        x_key, x_label, x_vals = "rsi_low", "RSI超卖阈值", [20, 24, 28, 32, 36, 40]
        y_key, y_label, y_vals = "rsi_high", "RSI超买阈值", [58, 64, 68, 72, 76, 82]
        rsi = qf._calc_rsi(close, 14)
        mid = close.rolling(20).mean()
        sd = close.rolling(20).std()
        dn, up = mid - 2.0 * sd, mid + 2.0 * sd
    elif strategy == "turtle_breakout":
        x_key, x_label, x_vals = "entry_window", "突破窗口(日)", [10, 15, 20, 30, 40, 55, 70]
        y_key, y_label, y_vals = "exit_window", "离场窗口(日)", [5, 8, 10, 15, 20, 30]
    elif strategy == "macd_trend":
        x_key, x_label, x_vals = "fast", "MACD快线", [6, 8, 10, 12, 15, 18]
        y_key, y_label, y_vals = "slow", "MACD慢线", [18, 22, 26, 30, 36, 44]
    else:
        strategy = "dual_ma"
        x_key, x_label, x_vals = "fast", "快线周期", [3, 5, 8, 10, 15, 20, 30]
        y_key, y_label, y_vals = "slow", "慢线周期", [15, 20, 30, 45, 60, 90, 120]

    sharpe_grid, ret_grid, dd_grid = [], [], []
    best = None
    total = len(x_vals) * len(y_vals)
    done = 0
    for yi, yv in enumerate(y_vals):
        for xi, xv in enumerate(x_vals):
            done += 1
            invalid = (strategy in ("dual_ma", "macd_trend") and xv >= yv) or (strategy == "turtle_breakout" and yv > xv)
            if invalid:
                sharpe_grid.append([xi, yi, None])
                ret_grid.append([xi, yi, None])
                dd_grid.append([xi, yi, None])
                continue
            if strategy == "dual_ma":
                mf = close.ewm(span=xv, adjust=False).mean()
                ms = close.ewm(span=yv, adjust=False).mean()
                ent = ((mf > ms) & (mf.shift(1) <= ms.shift(1))).shift(1).fillna(False)
                ext = ((mf < ms) & (mf.shift(1) >= ms.shift(1))).shift(1).fillna(False)
            elif strategy == "macd_trend":
                hist = qf._calc_macd_hist(close, xv, yv, 9)
                ent = ((hist > 0) & (hist.shift(1) <= 0)).shift(1).fillna(False)
                ext = ((hist < 0) & (hist.shift(1) >= 0)).shift(1).fillna(False)
            elif strategy == "rsi_boll_reversion":
                ent = ((rsi < xv) & (close <= dn * 1.02)).shift(1).fillna(False)
                ext = ((rsi > yv) | (close >= up)).shift(1).fillna(False)
            else:
                hh = high.shift(1).rolling(xv).max()
                ll = low.shift(1).rolling(yv).min()
                ent = (close > hh).shift(1).fillna(False)
                ext = (close < ll).shift(1).fillna(False)

            pf = vbt.Portfolio.from_signals(close=close, entries=ent.astype(bool), exits=ext.astype(bool), init_cash=1000000.0, fees=fees, slippage=slippage, freq="1D")
            eq = pf.value()
            dr = eq.pct_change().fillna(0.0)
            n_d = max(1, len(eq) - 1)
            ann = float((eq.iloc[-1] / eq.iloc[0]) ** (252.0 / n_d) - 1.0)
            v_ann = float(dr.std() * math.sqrt(252.0))
            sh = round((ann - 0.02) / v_ann, 2) if v_ann > 1e-9 else 0.0
            ar = round(ann * 100.0, 2)
            mdd = round(float((eq / eq.cummax() - 1.0).min() * 100.0), 2)
            sharpe_grid.append([xi, yi, sh])
            ret_grid.append([xi, yi, ar])
            dd_grid.append([xi, yi, mdd])
            if best is None or sh > best["sharpe"]:
                best = {"x": xv, "y": yv, "sharpe": sh, "annual_return": ar, "max_drawdown": mdd}
        emit_progress(20 + int(done / total * 75), f"已完成 {done}/{total} 组参数扫描...")

    emit_progress(100, "参数敏感性热力图生成完成")
    return {
        "ok": True,
        "strategy": strategy,
        "target": (meta_map.get(sym_col) or {}).get("name", sym_col),
        "x_key": x_key, "x_label": x_label, "x_vals": x_vals,
        "y_key": y_key, "y_label": y_label, "y_vals": y_vals,
        "sharpe_grid": sharpe_grid, "return_grid": ret_grid, "maxdd_grid": dd_grid,
        "best": best,
    }


# ---------------------------------------------------------------------------
# Fast Batch Factor Screening & Pairwise Correlation Matrix
# ---------------------------------------------------------------------------

def cmd_factor_batch(params: dict, store_dir: str) -> dict:
    family = str(params.get("family") or "ALL").strip()
    universe = str(params.get("universe") or "hs300").strip()
    horizon = max(1, int(params.get("horizon") or 5))

    emit_progress(10, f"正在加载 {universe} 横截面数据准备批量体检...")
    panels, _ = _load_panels(store_dir, universe=universe)
    close = panels["close"].dropna(axis=1, thresh=max(40, int(len(panels["close"]) * 0.4)))
    if close.shape[1] < 8:
        raise RuntimeError(f"标的数不足 ({close.shape[1]}只)，请先同步沪深300或ETF池数据。")
    panels = {k: v.reindex(columns=close.columns) for k, v in panels.items()}
    fwd = close.pct_change(horizon).shift(-horizon)
    fwd1 = close.pct_change(1).shift(-1)

    targets = [f for f in qf.FACTOR_CATALOG if family == "ALL" or f["family"] == family]
    results = []
    n_tot = len(targets)
    for idx, fmeta in enumerate(targets, 1):
        fid = fmeta["id"]
        try:
            raw = qf.compute_factor(fid, panels)
            proc = qf.cs_zscore(qf.winsorize_mad(raw))
            ic_s = proc.corrwith(fwd, axis=1, method="spearman").dropna()
            ic1_s = proc.corrwith(fwd1, axis=1, method="spearman").dropna()
            if len(ic_s) < 15:
                continue
            ic_mean = float(ic_s.mean())
            ic_std = float(ic_s.std())
            icir = (ic_mean / ic_std) if ic_std > 1e-9 else 0.0
            ic_win = float((ic_s > 0).mean() * 100.0)
            ic1_mean = float(ic1_s.mean()) if len(ic1_s) else 0.0

            # Fast Top 20% vs Bottom 20% spread (bps) & rank autocorrelation
            rk = proc.rank(axis=1, pct=True)
            top_mask = rk >= 0.8
            bot_mask = rk <= 0.2
            top_r = fwd.where(top_mask).mean(axis=1)
            bot_r = fwd.where(bot_mask).mean(axis=1)
            ls_bps = float((top_r - bot_r).dropna().mean() * 10000.0)
            ac = float(rk.corrwith(rk.shift(horizon), axis=1).dropna().mean())
            turn_est = max(0.0, min(100.0, (1.0 - max(0.0, ac)) * 100.0))

            results.append({
                "factor_id": fid,
                "name": fmeta["name"],
                "family": fmeta["family"],
                "category": fmeta["category"],
                "universe": universe,
                "horizon": f"{horizon}D",
                "ic_1d": round(_safe_float(ic1_mean), 4),
                "ic_mean": round(_safe_float(ic_mean), 4),
                "icir": round(_safe_float(icir), 3),
                "abs_icir": round(abs(_safe_float(icir)), 3),
                "ic_win_rate": round(_safe_float(ic_win), 1),
                "ls_spread_bps": round(_safe_float(ls_bps), 1),
                "turnover_pct": round(_safe_float(turn_est), 1),
                "tested_at": int(time.time()),
            })
        except Exception:
            continue
        if idx % 4 == 0 or idx == n_tot:
            emit_progress(15 + int(idx / max(1, n_tot) * 82), f"批量体检进度 {idx}/{n_tot} ({fmeta['name']})")

    results.sort(key=lambda x: abs(x["icir"]), reverse=True)
    emit_progress(100, f"完成 {len(results)} 个因子批量体检")
    return {"ok": True, "universe": universe, "family": family, "horizon": f"{horizon}D", "items": results}


def cmd_factor_corr(params: dict, store_dir: str) -> dict:
    factor_ids = [str(f).strip() for f in (params.get("factor_ids") or []) if str(f).strip()][:16]
    universe = str(params.get("universe") or "hs300").strip()
    if len(factor_ids) < 2:
        raise ValueError("请至少勾选 2 个因子计算相关性矩阵")
    panels, _ = _load_panels(store_dir, universe=universe)
    close = panels["close"].dropna(axis=1, thresh=max(40, int(len(panels["close"]) * 0.4)))
    panels = {k: v.reindex(columns=close.columns) for k, v in panels.items()}

    # Compute standardized recent 120D stacked factor vectors
    cols = {}
    names = []
    valid_ids = []
    for fid in factor_ids:
        try:
            raw = qf.compute_factor(fid, panels).tail(120)
            ser = qf.cs_zscore(qf.winsorize_mad(raw)).stack().dropna()
            if len(ser) > 50:
                cols[fid] = ser
                valid_ids.append(fid)
                names.append((qf.FACTOR_META_MAP.get(fid) or {}).get("name", fid).split("(")[0].strip())
        except Exception:
            continue
    if len(valid_ids) < 2:
        raise RuntimeError("有效因子不足 2 个，无法计算相关性矩阵")
    df_f = pd.DataFrame(cols).dropna()
    corr_mat = df_f.corr(method="spearman")
    matrix = []
    high_pairs = []
    for i, f1 in enumerate(valid_ids):
        for j, f2 in enumerate(valid_ids):
            v = round(_safe_float(corr_mat.loc[f1, f2]), 2)
            matrix.append([i, j, v])
            if j > i and abs(v) >= 0.7:
                high_pairs.append({"a": names[i], "b": names[j], "corr": v})
    high_pairs.sort(key=lambda x: abs(x["corr"]), reverse=True)
    return {
        "ok": True,
        "factor_ids": valid_ids,
        "names": names,
        "matrix": matrix,
        "high_pairs": high_pairs,
    }


def cmd_store_symbols(store_dir: str) -> dict:
    paths = _store_paths(store_dir)
    if not os.path.isfile(paths["bars"]):
        return {"ok": True, "items": []}
    if duckdb is not None:
        b_esc = paths["bars"].replace("\\", "/").replace("'", "''")
        q = f"""
            SELECT symbol, ANY_VALUE(secid) AS secid, ANY_VALUE(name) AS name,
                   ANY_VALUE(market) AS market, ANY_VALUE(industry) AS industry,
                   COUNT(*) AS rows, MIN(trade_date) AS min_date, MAX(trade_date) AS max_date
            FROM read_parquet('{b_esc}')
            GROUP BY symbol
            ORDER BY market, symbol
        """
        df = duckdb.sql(q).df()
        basic_syms = set()
        if os.path.isfile(paths["basic"]):
            bs_esc = paths["basic"].replace("\\", "/").replace("'", "''")
            basic_syms = set(duckdb.sql(f"SELECT DISTINCT symbol FROM read_parquet('{bs_esc}')").df()["symbol"].tolist())
        limit_syms = set()
        if os.path.isfile(paths["limit"]):
            ls_esc = paths["limit"].replace("\\", "/").replace("'", "''")
            limit_syms = set(duckdb.sql(f"SELECT DISTINCT symbol FROM read_parquet('{ls_esc}')").df()["symbol"].tolist())
    else:
        raw = pd.read_parquet(paths["bars"])
        df = raw.groupby("symbol", as_index=False).agg(
            secid=("secid", "last"), name=("name", "last"), market=("market", "last"),
            industry=("industry", "last"), rows=("trade_date", "count"),
            min_date=("trade_date", "min"), max_date=("trade_date", "max"),
        )
        basic_syms, limit_syms = set(), set()
    items = []
    for _, r in df.iterrows():
        s = str(r["symbol"])
        items.append({
            "symbol": s,
            "secid": str(r["secid"] or s),
            "name": str(r["name"] or s),
            "market": str(r["market"] or ""),
            "industry": str(r["industry"] or ""),
            "rows": int(r["rows"] or 0),
            "min_date": str(r["min_date"] or "")[:10],
            "max_date": str(r["max_date"] or "")[:10],
            "has_basic": s in basic_syms,
            "has_limit": s in limit_syms,
        })
    return {"ok": True, "items": items}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cmd", required=True)
    ap.add_argument("--store", required=True)
    ap.add_argument("--in", dest="in_file", default="")
    ap.add_argument("--out", dest="out_file", required=True)
    args = ap.parse_args()

    params = {}
    if args.in_file and os.path.isfile(args.in_file):
        with open(args.in_file, "r", encoding="utf-8") as f:
            params = json.load(f)

    try:
        if args.cmd == "env_check":
            res = cmd_env_check(args.store)
        elif args.cmd == "factor_catalog":
            res = {"ok": True, "items": qf.FACTOR_CATALOG}
        elif args.cmd == "sync_data":
            res = cmd_sync_data(params, args.store)
        elif args.cmd == "factor_eval":
            res = cmd_factor_eval(params, args.store)
        elif args.cmd == "backtest":
            res = cmd_backtest(params, args.store)
        elif args.cmd == "param_sweep":
            res = cmd_param_sweep(params, args.store)
        elif args.cmd == "factor_batch":
            res = cmd_factor_batch(params, args.store)
        elif args.cmd == "factor_corr":
            res = cmd_factor_corr(params, args.store)
        elif args.cmd == "store_symbols":
            res = cmd_store_symbols(args.store)
        else:
            res = {"ok": False, "error": f"未知命令: {args.cmd}"}
    except Exception as e:
        res = {"ok": False, "error": str(e), "trace": traceback.format_exc()[-1500:]}

    os.makedirs(os.path.dirname(args.out_file) or ".", exist_ok=True)
    with open(args.out_file, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    return 0 if res.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
