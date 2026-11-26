from __future__ import annotations

import concurrent.futures
import contextlib
import datetime
import json
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import providers as prov_mod

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
EM_HEADERS = {"User-Agent": USER_AGENT, "Referer": "https://quote.eastmoney.com/"}

SCHEMA = """
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
"""

DEFAULT_WATCHLIST: list[dict] = [
    {"secid": "1.000001", "symbol": "000001.SH", "name": "上证指数", "market_group": "indices"},
    {"secid": "0.399300", "symbol": "399300.SZ", "name": "沪深300", "market_group": "indices"},
    {"secid": "100.HSI", "symbol": "HSI", "name": "恒生指数", "market_group": "indices"},
    {"secid": "100.SPX", "symbol": "SPX", "name": "标普500", "market_group": "indices"},
    {"secid": "100.NDX", "symbol": "NDX", "name": "纳斯达克", "market_group": "indices"},
    {"secid": "101.GC00Y", "symbol": "XAU", "name": "COMEX黄金", "market_group": "commodities"},
    {"secid": "112.B00Y", "symbol": "BRENT", "name": "布伦特原油", "market_group": "commodities"},
    {"secid": "133.USDCNH", "symbol": "USDCNH", "name": "USD/CNH", "market_group": "forex"},
    {"secid": "1.601919", "symbol": "601919.SH", "name": "中远海控", "market_group": "cn_logistics"},
    {"secid": "0.002352", "symbol": "002352.SZ", "name": "顺丰控股", "market_group": "cn_logistics"},
    {"secid": "105.NVDA", "symbol": "NVDA", "name": "英伟达", "market_group": "us_hk"},
    {"secid": "116.00700", "symbol": "00700.HK", "name": "腾讯控股", "market_group": "us_hk"},
]

MARKET_PANELS: list[dict] = [
    {
        "id": "indices",
        "title": "INDICES",
        "items": [
            {"secid": "1.000001", "symbol": "000001.SH", "name": "上证指数"},
            {"secid": "0.399001", "symbol": "399001.SZ", "name": "深证成指"},
            {"secid": "0.399300", "symbol": "399300.SZ", "name": "沪深300"},
            {"secid": "0.399006", "symbol": "399006.SZ", "name": "创业板指"},
            {"secid": "100.HSI", "symbol": "HSI", "name": "恒生指数"},
            {"secid": "124.HSTECH", "symbol": "HSTECH", "name": "恒生科技"},
            {"secid": "100.SPX", "symbol": "SPX", "name": "标普500"},
            {"secid": "100.NDX", "symbol": "NDX", "name": "纳斯达克100"},
            {"secid": "100.DJIA", "symbol": "DJIA", "name": "道琼斯"},
            {"secid": "100.N225", "symbol": "N225", "name": "日经225"},
            {"secid": "100.FTSE", "symbol": "FTSE", "name": "英国富时100"},
            {"secid": "100.GDAXI", "symbol": "GDAXI", "name": "德国DAX30"},
        ],
    },
    {
        "id": "forex",
        "title": "FOREX",
        "items": [
            {"secid": "133.USDCNH", "symbol": "USD/CNH", "name": "美元/离岸人民币"},
            {"secid": "CBR.USDRUB", "symbol": "USD/RUB", "name": "美元/卢布 (CBR)"},
            {"secid": "CBR.CNYRUB", "symbol": "CNY/RUB", "name": "人民币/卢布 (CBR)"},
            {"secid": "CBR.EURRUB", "symbol": "EUR/RUB", "name": "欧元/卢布 (CBR)"},
            {"secid": "119.EURUSD", "symbol": "EUR/USD", "name": "欧元/美元"},
            {"secid": "119.USDJPY", "symbol": "USD/JPY", "name": "美元/日元"},
            {"secid": "119.GBPUSD", "symbol": "GBP/USD", "name": "英镑/美元"},
            {"secid": "100.UDI", "symbol": "DXY", "name": "美元指数"},
        ],
    },
    {
        "id": "commodities",
        "title": "COMMODITIES",
        "items": [
            {"secid": "101.GC00Y", "symbol": "GC", "name": "COMEX黄金"},
            {"secid": "101.SI00Y", "symbol": "SI", "name": "COMEX白银"},
            {"secid": "102.CL00Y", "symbol": "WTI", "name": "NYMEX原油"},
            {"secid": "112.B00Y", "symbol": "BRENT", "name": "布伦特原油"},
            {"secid": "101.HG00Y", "symbol": "HG", "name": "COMEX铜"},
            {"secid": "102.NG00Y", "symbol": "NG", "name": "天然气"},
        ],
    },
    {
        "id": "cn_logistics",
        "title": "CN LOGISTICS & CORE",
        "items": [
            {"secid": "1.601919", "symbol": "601919.SH", "name": "中远海控"},
            {"secid": "0.002352", "symbol": "002352.SZ", "name": "顺丰控股"},
            {"secid": "1.601872", "symbol": "601872.SH", "name": "招商轮船"},
            {"secid": "1.600026", "symbol": "600026.SH", "name": "中远海能"},
            {"secid": "1.601006", "symbol": "601006.SH", "name": "大秦铁路"},
            {"secid": "1.600519", "symbol": "600519.SH", "name": "贵州茅台"},
            {"secid": "0.300750", "symbol": "300750.SZ", "name": "宁德时代"},
            {"secid": "1.601857", "symbol": "601857.SH", "name": "中国石油"},
            {"secid": "1.601899", "symbol": "601899.SH", "name": "紫金矿业"},
        ],
    },
    {
        "id": "us_hk",
        "title": "US & HK EQUITIES",
        "items": [
            {"secid": "105.NVDA", "symbol": "NVDA", "name": "英伟达"},
            {"secid": "105.AAPL", "symbol": "AAPL", "name": "苹果"},
            {"secid": "105.MSFT", "symbol": "MSFT", "name": "微软"},
            {"secid": "105.AMZN", "symbol": "AMZN", "name": "亚马逊"},
            {"secid": "105.GOOGL", "symbol": "GOOGL", "name": "谷歌-A"},
            {"secid": "105.META", "symbol": "META", "name": "Meta"},
            {"secid": "105.TSLA", "symbol": "TSLA", "name": "特斯拉"},
            {"secid": "106.BABA", "symbol": "BABA", "name": "阿里巴巴"},
            {"secid": "116.00700", "symbol": "00700.HK", "name": "腾讯控股"},
            {"secid": "116.09988", "symbol": "09988.HK", "name": "阿里巴巴-W"},
            {"secid": "116.03690", "symbol": "03690.HK", "name": "美团-W"},
            {"secid": "116.00883", "symbol": "00883.HK", "name": "中国海洋石油"},
        ],
    },
    {
        "id": "etf_bonds",
        "title": "ETF & BONDS",
        "items": [
            {"secid": "107.SPY", "symbol": "SPY", "name": "标普500 ETF"},
            {"secid": "105.QQQ", "symbol": "QQQ", "name": "纳指100 ETF"},
            {"secid": "107.GLD", "symbol": "GLD", "name": "黄金 ETF"},
            {"secid": "105.TLT", "symbol": "TLT", "name": "20年美债 ETF"},
            {"secid": "1.510300", "symbol": "510300.SH", "name": "沪深300 ETF"},
            {"secid": "1.511090", "symbol": "511090.SH", "name": "30年国债 ETF"},
        ],
    },
    {
        "id": "crypto",
        "title": "CRYPTO",
        "items": [
            {"secid": "CG.bitcoin", "symbol": "BTC", "name": "Bitcoin"},
            {"secid": "CG.ethereum", "symbol": "ETH", "name": "Ethereum"},
            {"secid": "CG.solana", "symbol": "SOL", "name": "Solana"},
            {"secid": "CG.binancecoin", "symbol": "BNB", "name": "BNB"},
            {"secid": "CG.ripple", "symbol": "XRP", "name": "XRP"},
            {"secid": "CG.dogecoin", "symbol": "DOGE", "name": "Dogecoin"},
            {"secid": "CG.chainlink", "symbol": "LINK", "name": "Chainlink"},
            {"secid": "CG.cardano", "symbol": "ADA", "name": "Cardano"},
        ],
    },
]

DEFAULT_MARKET_LAYOUT: dict = {
    "version": 2,
    "cols": 24,
    "locked": False,
    "detailWidth": 380,
    "detailChartHeight": 280,
    "activeWorkspace": "mkt_overview",
    "workspaces": [
        {
            "id": "mkt_overview",
            "name": "多市场网格",
            "widgets": [
                {"id": "mw_indices", "type": "panel_indices", "title": "INDICES", "x": 0, "y": 0, "w": 8, "h": 12, "minW": 5, "minH": 6, "enabled": True, "config": {"panelId": "indices"}},
                {"id": "mw_cn_logistics", "type": "panel_cn_logistics", "title": "CN LOGISTICS & CORE", "x": 8, "y": 0, "w": 8, "h": 12, "minW": 5, "minH": 6, "enabled": True, "config": {"panelId": "cn_logistics"}},
                {"id": "mw_us_hk", "type": "panel_us_hk", "title": "US & HK EQUITIES", "x": 16, "y": 0, "w": 8, "h": 12, "minW": 5, "minH": 6, "enabled": True, "config": {"panelId": "us_hk"}},
                {"id": "mw_forex", "type": "panel_forex", "title": "FOREX", "x": 0, "y": 12, "w": 8, "h": 10, "minW": 5, "minH": 6, "enabled": True, "config": {"panelId": "forex"}},
                {"id": "mw_commodities", "type": "panel_commodities", "title": "COMMODITIES", "x": 8, "y": 12, "w": 8, "h": 10, "minW": 5, "minH": 6, "enabled": True, "config": {"panelId": "commodities"}},
                {"id": "mw_etf_bonds", "type": "panel_etf_bonds", "title": "ETF & BONDS", "x": 16, "y": 12, "w": 8, "h": 10, "minW": 5, "minH": 6, "enabled": True, "config": {"panelId": "etf_bonds"}},
                {"id": "mw_crypto", "type": "panel_crypto", "title": "CRYPTO", "x": 0, "y": 22, "w": 12, "h": 10, "minW": 5, "minH": 6, "enabled": True, "config": {"panelId": "crypto"}},
                {"id": "mw_heatmap", "type": "sector_heatmap", "title": "SECTOR HEATMAP", "x": 12, "y": 22, "w": 12, "h": 10, "minW": 6, "minH": 7, "enabled": True, "config": {}},
            ],
        },
        {
            "id": "mkt_heatmap",
            "name": "热力图与异动",
            "widgets": [
                {"id": "mw_hm_full", "type": "sector_heatmap", "title": "SECTOR HEATMAP", "x": 0, "y": 0, "w": 24, "h": 13, "minW": 6, "minH": 7, "enabled": True, "config": {}},
                {"id": "mw_mv_gain", "type": "movers_gainers", "title": "TOP GAINERS", "x": 0, "y": 13, "w": 8, "h": 11, "minW": 5, "minH": 6, "enabled": True, "config": {}},
                {"id": "mw_mv_lose", "type": "movers_losers", "title": "TOP LOSERS", "x": 8, "y": 13, "w": 8, "h": 11, "minW": 5, "minH": 6, "enabled": True, "config": {}},
                {"id": "mw_mv_act", "type": "movers_active", "title": "MOST ACTIVE", "x": 16, "y": 13, "w": 8, "h": 11, "minW": 5, "minH": 6, "enabled": True, "config": {}},
            ],
        },
        {
            "id": "mkt_kline_desk",
            "name": "K线研判台",
            "widgets": [
                {"id": "mw_kline_main", "type": "kline_main", "title": "K-LINE TERMINAL", "x": 0, "y": 0, "w": 16, "h": 14, "minW": 8, "minH": 8, "enabled": True, "config": {}},
                {"id": "mw_watchlist", "type": "watchlist", "title": "WATCHLIST", "x": 16, "y": 0, "w": 8, "h": 14, "minW": 5, "minH": 6, "enabled": True, "config": {}},
                {"id": "mw_cn_log_2", "type": "panel_cn_logistics", "title": "CN LOGISTICS & CORE", "x": 0, "y": 14, "w": 12, "h": 10, "minW": 5, "minH": 6, "enabled": True, "config": {"panelId": "cn_logistics"}},
                {"id": "mw_indices_2", "type": "panel_indices", "title": "INDICES", "x": 12, "y": 14, "w": 12, "h": 10, "minW": 5, "minH": 6, "enabled": True, "config": {"panelId": "indices"}},
            ],
        },
    ],
}


def migrate_market_layout(saved: dict | None) -> tuple[dict, bool]:
    import copy
    if not isinstance(saved, dict) or not saved.get("workspaces"):
        return copy.deepcopy(DEFAULT_MARKET_LAYOUT), False
    layout = copy.deepcopy(saved)
    changed = False
    if layout.get("version") != 2:
        layout["version"] = 2
        changed = True
    if layout.get("cols") != 24:
        layout["cols"] = 24
        changed = True
    if "locked" not in layout:
        layout["locked"] = False
        changed = True
    if "detailWidth" not in layout:
        layout["detailWidth"] = 380
        changed = True
    if "detailChartHeight" not in layout:
        layout["detailChartHeight"] = 280
        changed = True
    return layout, changed

RIBBON_SECIDS = [
    "1.000001",
    "0.399300",
    "100.HSI",
    "100.SPX",
    "100.NDX",
    "101.GC00Y",
    "112.B00Y",
    "133.USDCNH",
    "CBR.USDRUB",
    "CG.bitcoin",
]

COINGECKO_IDS = [
    "bitcoin",
    "ethereum",
    "solana",
    "binancecoin",
    "ripple",
    "dogecoin",
    "chainlink",
    "cardano",
]

TUSHARE_SECID_MAP: dict[str, tuple[str, str]] = {
    # A-share indices
    "1.000001": ("index_daily", "000001.SH"),
    "1.000300": ("index_daily", "000300.SH"),
    "0.399001": ("index_daily", "399001.SZ"),
    "0.399300": ("index_daily", "399300.SZ"),
    "0.399006": ("index_daily", "399006.SZ"),
    # Global indices
    "100.HSI": ("index_global", "HSI"),
    "124.HSTECH": ("index_global", "HKTECH"),
    "100.SPX": ("index_global", "SPX"),
    "100.NDX": ("fx_daily", "NAS100"),
    "100.DJIA": ("index_global", "DJI"),
    "100.N225": ("index_global", "N225"),
    "100.FTSE": ("index_global", "FTSE"),
    "100.GDAXI": ("index_global", "GDAXI"),
    # Forex (100.UDI left to EastMoney because FXCM USDOLLAR uses ~12970 scale)
    "133.USDCNH": ("fx_daily", "USDCNH.FXCM"),
    "119.EURUSD": ("fx_daily", "EURUSD.FXCM"),
    "119.USDJPY": ("fx_daily", "USDJPY.FXCM"),
    "119.GBPUSD": ("fx_daily", "GBPUSD.FXCM"),
    # Commodities via FXCM
    "101.GC00Y": ("fx_daily", "XAUUSD.FXCM"),
    "101.SI00Y": ("fx_daily", "XAGUSD.FXCM"),
    "102.CL00Y": ("fx_daily", "USOIL"),
    "112.B00Y": ("fx_daily", "UKOIL"),
    "101.HG00Y": ("fx_daily", "COPPER"),
    "102.NG00Y": ("fx_daily", "NGAS"),
}

YFINANCE_SECID_MAP: dict[str, str] = {
    # CN indices
    "1.000001": "000001.SS",
    "0.399001": "399001.SZ",
    "0.399300": "000300.SS",
    "0.399006": "399006.SZ",
    # Global indices
    "100.HSI": "^HSI",
    "124.HSTECH": "HSTECH.HK",
    "100.SPX": "^GSPC",
    "100.NDX": "^NDX",
    "100.DJIA": "^DJI",
    "100.N225": "^N225",
    "100.FTSE": "^FTSE",
    "100.GDAXI": "^GDAXI",
    # Forex
    "133.USDCNH": "CNH=F",
    "119.EURUSD": "EURUSD=X",
    "119.USDJPY": "JPY=X",
    "119.GBPUSD": "GBPUSD=X",
    "100.UDI": "DX-Y.NYB",
    "CBR.USDRUB": "RUB=X",
    # Commodities
    "101.GC00Y": "GC=F",
    "101.SI00Y": "SI=F",
    "102.CL00Y": "CL=F",
    "112.B00Y": "BZ=F",
    "101.HG00Y": "HG=F",
    "102.NG00Y": "NG=F",
    # Crypto
    "CG.bitcoin": "BTC-USD",
    "CG.ethereum": "ETH-USD",
    "CG.solana": "SOL-USD",
    "CG.binancecoin": "BNB-USD",
    "CG.ripple": "XRP-USD",
    "CG.dogecoin": "DOGE-USD",
    "CG.chainlink": "LINK-USD",
    "CG.cardano": "ADA-USD",
}


def _is_cn_secid(secid: str) -> bool:
    sid = (secid or "").strip()
    if "." not in sid:
        return False
    mkt, code = sid.split(".", 1)
    return mkt in ("0", "1") and code.isdigit()


def _resolve_yf_symbol(secid: str) -> str:
    sid = (secid or "").strip()
    if sid in YFINANCE_SECID_MAP:
        return YFINANCE_SECID_MAP[sid]
    if "." not in sid:
        return ""
    mkt, code = sid.split(".", 1)
    if mkt in ("105", "106", "107") and code:
        return code.upper()
    if mkt == "116" and code.isdigit():
        return f"{int(code):04d}.HK"
    if mkt == "1" and code.isdigit():
        return f"{code}.SS"
    if mkt == "0" and code.isdigit():
        return f"{code}.SZ"
    return ""


def _http_json_proxy(
    url: str,
    proxy_url: str = "",
    *,
    headers: dict | None = None,
    timeout: float = 8.0,
) -> dict | list:
    hdrs = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    if proxy_url == "__DIRECT__":
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
        return json.loads(raw)
    if proxy_url:
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})
        )
        with opener.open(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
        return json.loads(raw)
    with prov_mod.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", "replace")
    return json.loads(raw)

_NEWS_KEYWORDS_MAP: list[tuple[tuple[str, ...], list[str]]] = [
    (("GC00Y", "GLD", "SI00Y", "XAU"), ["黄金", "Gold", "美联储", "FOMC", "Fed", "利率", "降息", "央行"]),
    (("CL00Y", "B00Y", "NG00Y", "601857", "00883", "OIL"), ["原油", "油价", "OPEC", "Brent", "WTI", "能源", "天然气", "伊朗", "中东"]),
    (("601919", "601872", "600026", "002352", "601006", "01919"), ["航运", "港口", "集装箱", "运价", "SCFI", "BDI", "物流", "铁路", "中远", "顺丰", "俄铁", "红海"]),
    (("USDCNH", "EURUSD", "USDJPY", "GBPUSD", "UDI"), ["汇率", "人民币", "美元", "美联储", "央行", "利率"]),
    (("USDRUB", "CNYRUB", "EURRUB"), ["卢布", "俄罗斯", "俄央行", "ЦБ РФ", "制裁", "俄铁"]),
    (("NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "NDX", "QQQ"), ["AI", "芯片", "半导体", "英伟达", "算力", "科技", "美联储"]),
    (("000001", "399300", "399001", "399006", "510300", "511090"), ["A股", "央行", "降准", "财政", "政策", "证监会", "GDP", "关税"]),
    (("HSI", "HSTECH", "00700", "09988", "03690", "BABA"), ["港股", "恒生", "腾讯", "阿里", "美团", "人民币"]),
    (("bitcoin", "ethereum", "solana"), ["Bitcoin", "比特币", "加密", "Crypto", "ETF", "SEC"]),
]


def _num(val, default: float | None = None) -> float | None:
    if val is None or val == "" or val == "-":
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _http_json(
    url: str,
    *,
    headers: dict | None = None,
    post_json: dict | None = None,
    timeout: float = 10.0,
) -> dict | list:
    hdrs = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    data = None
    if post_json is not None:
        data = json.dumps(post_json, ensure_ascii=False).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=hdrs)
    with prov_mod.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", "replace")
    return json.loads(raw)


def _calc_indicators(bars: list[dict]) -> dict:
    closes = [b["close"] for b in bars]
    times = [b["time"] for b in bars]
    n = len(closes)

    def _ma(period: int) -> list[dict]:
        out: list[dict] = []
        if n < period:
            return out
        win_sum = sum(closes[: period - 1])
        for i in range(period - 1, n):
            win_sum += closes[i]
            out.append({"time": times[i], "value": round(win_sum / period, 4)})
            win_sum -= closes[i - period + 1]
        return out

    rsi14: list[dict] = []
    period = 14
    if n > period:
        gains = [max(0.0, closes[i] - closes[i - 1]) for i in range(1, period + 1)]
        losses = [max(0.0, closes[i - 1] - closes[i]) for i in range(1, period + 1)]
        avg_g = sum(gains) / period
        avg_l = sum(losses) / period
        for i in range(period, n):
            if i > period:
                diff = closes[i] - closes[i - 1]
                avg_g = (avg_g * (period - 1) + max(0.0, diff)) / period
                avg_l = (avg_l * (period - 1) + max(0.0, -diff)) / period
            rs = avg_g / avg_l if avg_l > 1e-12 else 100.0
            val = 100.0 - (100.0 / (1.0 + rs)) if avg_l > 1e-12 else 100.0
            rsi14.append({"time": times[i], "value": round(val, 2)})

    macd_list: list[dict] = []
    if n >= 2:
        k12 = 2.0 / 13.0
        k26 = 2.0 / 27.0
        k9 = 2.0 / 10.0
        ema12 = closes[0]
        ema26 = closes[0]
        dea = 0.0
        for i in range(n):
            c = closes[i]
            ema12 = c * k12 + ema12 * (1.0 - k12)
            ema26 = c * k26 + ema26 * (1.0 - k26)
            dif = ema12 - ema26
            dea = dif * k9 + dea * (1.0 - k9)
            hist = (dif - dea) * 2.0
            if i >= 25:
                macd_list.append({
                    "time": times[i],
                    "dif": round(dif, 4),
                    "dea": round(dea, 4),
                    "hist": round(hist, 4),
                })

    return {
        "ma5": _ma(5),
        "ma20": _ma(20),
        "ma60": _ma(60),
        "rsi14": rsi14,
        "macd": macd_list,
    }


def _resample_bars(bars: list[dict], iv: str) -> list[dict]:
    if iv not in ("1w", "1M") or not bars:
        return bars
    buckets: dict[str, dict] = {}
    order: list[str] = []
    for b in bars:
        t = str(b["time"])[:10]
        try:
            dt = datetime.date.fromisoformat(t)
        except ValueError:
            continue
        if iv == "1w":
            iso = dt.isocalendar()
            bkey = f"{iso[0]}-W{iso[1]:02d}"
        else:
            bkey = t[:7]
        cur = buckets.get(bkey)
        if cur is None:
            buckets[bkey] = {
                "time": t,
                "open": b["open"],
                "high": b["high"],
                "low": b["low"],
                "close": b["close"],
                "volume": float(b.get("volume") or 0.0),
            }
            order.append(bkey)
        else:
            cur["time"] = t
            cur["high"] = max(cur["high"], b["high"])
            cur["low"] = min(cur["low"], b["low"])
            cur["close"] = b["close"]
            cur["volume"] += float(b.get("volume") or 0.0)
    return [buckets[k] for k in order]


def _symbol_keywords(secid: str, name: str = "") -> list[str]:
    kws: list[str] = []
    up = f"{secid} {name}".upper()
    for keys, words in _NEWS_KEYWORDS_MAP:
        if any(k.upper() in up for k in keys):
            kws.extend(words)
    clean_name = re.sub(r"(ETF|INC|-A|-W|控股|指数|COMEX|NYMEX|当月连续|\(CBR\))", "", name or "", flags=re.I).strip()
    if len(clean_name) >= 2:
        kws.append(clean_name)
    code = secid.split(".", 1)[1] if "." in secid else secid
    if code and not code.isdigit() and len(code) >= 2:
        kws.append(code)
    seen: set[str] = set()
    out: list[str] = []
    for k in kws:
        kl = k.strip()
        if kl and kl.lower() not in seen:
            seen.add(kl.lower())
            out.append(kl)
    return out[:14]


def _resolve_tushare_target(secid: str) -> tuple[str, str] | None:
    sid = (secid or "").strip()
    if sid in TUSHARE_SECID_MAP:
        return TUSHARE_SECID_MAP[sid]
    if "." not in sid:
        return None
    mkt, code = sid.split(".", 1)
    if mkt == "116" and code.isdigit():
        return ("hk_daily", f"{code.zfill(5)}.HK")
    if mkt in ("0", "1") and code.isdigit():
        suf = "SH" if mkt == "1" else "SZ"
        if (mkt == "1" and code.startswith(("51", "56", "58"))) or (mkt == "0" and code.startswith("15")):
            return ("fund_daily", f"{code}.{suf}")
        return ("daily", f"{code}.{suf}")
    return None


def _iso_date(td: str) -> str:
    s = str(td or "").strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return s[:10]


class MarketStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self._lock = threading.Lock()
        with self.con() as c:
            c.executescript(SCHEMA)
            cnt = c.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0]
            if cnt == 0:
                now = int(time.time())
                for idx, item in enumerate(DEFAULT_WATCHLIST):
                    c.execute(
                        """INSERT OR IGNORE INTO watchlist (secid, symbol, name, market_group, sort_order, added_at)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (item["secid"], item["symbol"], item["name"], item["market_group"], idx, now),
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

    def cache_get(self, key: str, allow_stale: bool = False):
        now = int(time.time())
        with self.con() as c:
            row = c.execute(
                "SELECT payload, fetched_at, ttl FROM kv_cache WHERE cache_key=?",
                (key,),
            ).fetchone()
            if not row:
                return None
            if not allow_stale and (now - int(row["fetched_at"])) > int(row["ttl"]):
                return None
            try:
                return json.loads(row["payload"])
            except ValueError:
                return None

    def cache_set(self, key: str, data, ttl: int) -> None:
        now = int(time.time())
        raw = json.dumps(data, ensure_ascii=False)
        with self._lock, self.con() as c:
            c.execute(
                """INSERT INTO kv_cache (cache_key, payload, fetched_at, ttl)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(cache_key) DO UPDATE SET
                   payload=excluded.payload, fetched_at=excluded.fetched_at, ttl=excluded.ttl""",
                (key, raw, now, int(ttl)),
            )

    def list_watchlist(self) -> list[dict]:
        with self.con() as c:
            rows = c.execute(
                "SELECT secid, symbol, name, market_group, sort_order, added_at FROM watchlist ORDER BY sort_order ASC, added_at ASC"
            ).fetchall()
            return [dict(r) for r in rows]

    def add_watchlist(self, secid: str, symbol: str, name: str, market_group: str = "custom") -> list[dict]:
        s = (secid or "").strip()
        if not s:
            raise ValueError("缺少标的代码 secid")
        now = int(time.time())
        with self._lock, self.con() as c:
            max_ord = c.execute("SELECT COALESCE(MAX(sort_order), 0) FROM watchlist").fetchone()[0]
            c.execute(
                """INSERT INTO watchlist (secid, symbol, name, market_group, sort_order, added_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(secid) DO UPDATE SET symbol=excluded.symbol, name=excluded.name""",
                (s, (symbol or s).strip(), (name or symbol or s).strip(), market_group or "custom", int(max_ord) + 1, now),
            )
        return self.list_watchlist()

    def remove_watchlist(self, secid: str) -> list[dict]:
        s = (secid or "").strip()
        with self._lock, self.con() as c:
            c.execute("DELETE FROM watchlist WHERE secid=?", (s,))
        return self.list_watchlist()


class MarketManager:
    def __init__(self, db_path: str, cfg, news_mgr=None):
        self.store = MarketStore(db_path)
        self.cfg = cfg
        self.news_mgr = news_mgr
        self._meta_map: dict[str, dict] = {}
        for panel in MARKET_PANELS:
            for it in panel["items"]:
                self._meta_map[it["secid"]] = {**it, "group": panel["id"]}
        self._yf_lock = threading.Lock()
        self._yf_fail_streak = 0
        self._yf_cooldown_until = 0.0

    @staticmethod
    def system_proxy() -> str:
        try:
            ps = urllib.request.getproxies() or {}
            return str(ps.get("https") or ps.get("http") or "").strip()
        except Exception:
            return ""

    def resolve_proxy(self, override: str | None = None) -> str:
        raw = str(override if override is not None else (self.cfg.data.get("market_proxy") or "")).strip()
        if raw.lower() in ("direct", "none", "off"):
            return "__DIRECT__"
        if raw:
            if "://" not in raw:
                return "http://" + raw
            return raw
        return self.system_proxy()

    def reset_routing_cache(self) -> None:
        with self._yf_lock:
            self._yf_fail_streak = 0
            self._yf_cooldown_until = 0.0
        with self.store._lock, self.store.con() as c:
            c.execute("DELETE FROM kv_cache WHERE cache_key = 'overview' OR cache_key LIKE 'kline:%'")

    def test_proxy(self, proxy_override: str | None = None) -> dict:
        px = self.resolve_proxy(proxy_override)
        t0 = time.time()
        try:
            d = _http_json_proxy(
                "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=5d&interval=1d",
                proxy_url=px,
                timeout=8.0,
            )
            res = ((d or {}).get("chart") or {}).get("result") or []
            meta = res[0].get("meta") if res else {}
            price = meta.get("regularMarketPrice")
            with self._yf_lock:
                self._yf_fail_streak = 0
                self._yf_cooldown_until = 0.0
            return {
                "ok": price is not None,
                "proxy": "direct" if px in ("", "__DIRECT__") else px,
                "price": price,
                "ms": int((time.time() - t0) * 1000),
            }
        except Exception as e:
            return {
                "ok": False,
                "proxy": "direct" if px in ("", "__DIRECT__") else px,
                "ms": int((time.time() - t0) * 1000),
                "error": str(e),
            }

    def _yf_fetch_chart(
        self,
        yf_sym: str,
        rng: str = "1mo",
        interval: str = "1d",
        timeout: float = 8.0,
    ) -> dict | None:
        if not yf_sym:
            return None
        with self._yf_lock:
            if time.time() < self._yf_cooldown_until:
                return None
        px = self.resolve_proxy()
        qs = urllib.parse.urlencode({"range": rng, "interval": interval})
        last_err: Exception | None = None
        for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
            url = f"https://{host}/v8/finance/chart/{urllib.parse.quote(yf_sym)}?{qs}"
            try:
                d = _http_json_proxy(url, proxy_url=px, timeout=timeout)
                res = ((d or {}).get("chart") or {}).get("result") or []
                if not res:
                    continue
                r0 = res[0]
                meta = r0.get("meta") or {}
                ts_list = r0.get("timestamp") or []
                quote = (((r0.get("indicators") or {}).get("quote") or [{}])[0]) or {}
                opens = quote.get("open") or []
                highs = quote.get("high") or []
                lows = quote.get("low") or []
                closes = quote.get("close") or []
                vols = quote.get("volume") or []
                bars: list[dict] = []
                seen_d: set[str] = set()
                for i, ts in enumerate(ts_list):
                    c = _num(closes[i] if i < len(closes) else None)
                    if c is None:
                        continue
                    o = _num(opens[i] if i < len(opens) else None, c)
                    h = _num(highs[i] if i < len(highs) else None, max(o, c))
                    l = _num(lows[i] if i < len(lows) else None, min(o, c))
                    v = _num(vols[i] if i < len(vols) else None, 0.0) or 0.0
                    d_iso = datetime.datetime.fromtimestamp(int(ts), tz=datetime.timezone.utc).strftime("%Y-%m-%d")
                    if d_iso in seen_d:
                        if bars and bars[-1]["time"] == d_iso:
                            bars[-1] = {
                                "time": d_iso,
                                "open": bars[-1]["open"],
                                "high": max(bars[-1]["high"], h),
                                "low": min(bars[-1]["low"], l),
                                "close": round(c, 5),
                                "volume": bars[-1]["volume"] + v,
                            }
                        continue
                    seen_d.add(d_iso)
                    bars.append({
                        "time": d_iso,
                        "open": round(o, 5),
                        "high": round(h, 5),
                        "low": round(l, 5),
                        "close": round(c, 5),
                        "volume": round(v, 2),
                    })
                price = _num(meta.get("regularMarketPrice"))
                if price is None and bars:
                    price = bars[-1]["close"]
                prev_c = _num(meta.get("chartPreviousClose")) or _num(meta.get("previousClose"))
                if prev_c is None:
                    prev_c = bars[-2]["close"] if len(bars) >= 2 else price
                if price is None:
                    continue
                chg = (price - prev_c) if prev_c else 0.0
                pct = (chg / prev_c * 100.0) if prev_c else 0.0
                with self._yf_lock:
                    self._yf_fail_streak = 0
                return {
                    "price": round(price, 4 if abs(price) < 10 else 2),
                    "prev_close": prev_c,
                    "chg": round(chg, 4 if abs(chg) < 1 else 2),
                    "pct": round(pct, 2),
                    "high": _num(meta.get("regularMarketDayHigh")),
                    "low": _num(meta.get("regularMarketDayLow")),
                    "open": bars[-1]["open"] if bars else price,
                    "volume": _num(meta.get("regularMarketVolume"), 0.0) or (bars[-1]["volume"] if bars else 0.0),
                    "name": str(meta.get("shortName") or meta.get("longName") or yf_sym),
                    "bars": bars,
                    "spark": [b["close"] for b in bars[-10:]],
                    "source": "YahooFinance",
                }
            except Exception as e:
                last_err = e
                continue
        if last_err is not None:
            with self._yf_lock:
                self._yf_fail_streak += 1
                if self._yf_fail_streak >= 3:
                    self._yf_cooldown_until = time.time() + 120.0
        return None

    def _fetch_yf_overview(self, secids: list[str]) -> dict[str, dict]:
        if not secids:
            return {}
        with self._yf_lock:
            if time.time() < self._yf_cooldown_until:
                return {}
        pairs = [(sid, _resolve_yf_symbol(sid)) for sid in secids]
        pairs = [(sid, ys) for sid, ys in pairs if ys]
        if not pairs:
            return {}
        by_ys: dict[str, list[str]] = {}
        for sid, ys in pairs:
            by_ys.setdefault(ys, []).append(sid)
        uniq_ys = list(by_ys.keys())
        px = self.resolve_proxy()

        def _batch(chunk: list[str]) -> dict:
            qs = urllib.parse.urlencode({"symbols": ",".join(chunk), "range": "5d", "interval": "1d"})
            for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
                url = f"https://{host}/v8/finance/spark?{qs}"
                try:
                    d = _http_json_proxy(url, proxy_url=px, timeout=10.0)
                    if isinstance(d, dict) and d:
                        return d
                except Exception:
                    continue
            return {}

        chunks = [uniq_ys[i : i + 18] for i in range(0, len(uniq_ys), 18)]
        merged: dict = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(chunks))) as ex:
            for part in ex.map(_batch, chunks):
                if isinstance(part, dict):
                    merged.update(part)

        if not merged:
            with self._yf_lock:
                self._yf_fail_streak += 1
                if self._yf_fail_streak >= 2:
                    self._yf_cooldown_until = time.time() + 120.0
            return {}

        with self._yf_lock:
            self._yf_fail_streak = 0

        out: dict[str, dict] = {}
        for ys, sids in by_ys.items():
            item = merged.get(ys)
            if not isinstance(item, dict):
                continue
            closes = [float(x) for x in (item.get("close") or []) if _num(x) is not None]
            if not closes:
                continue
            price = closes[-1]
            prev_c = closes[-2] if len(closes) >= 2 else (_num(item.get("chartPreviousClose")) or price)
            chg = _num(item.get("fulldayChange"))
            pct = _num(item.get("fulldayChangePercent"))
            if chg is None or pct is None:
                chg = price - prev_c
                pct = (chg / prev_c * 100.0) if prev_c else 0.0
            for sid in sids:
                meta = self._meta_map.get(sid) or {}
                out[sid] = {
                    "secid": sid,
                    "symbol": meta.get("symbol") or ys,
                    "name": meta.get("name") or ys,
                    "price": round(price, 4 if abs(price) < 10 else 2),
                    "chg": round(chg, 4 if abs(chg) < 1 else 2),
                    "pct": round(pct, 2),
                    "high": max(closes),
                    "low": min(closes),
                    "open": closes[0],
                    "prev_close": prev_c,
                    "volume": 0.0,
                    "amount": 0.0,
                    "spark": [round(x, 4) for x in closes[-10:]],
                    "source": "YahooFinance",
                }
        return out

    def _kline_yfinance(self, secid: str, iv: str, limit: int) -> tuple[list[dict], str, str]:
        ys = _resolve_yf_symbol(secid)
        if not ys:
            return [], "", ""
        yf_iv = {"1d": "1d", "1w": "1wk", "1M": "1mo", "60m": "60m"}.get(iv, "1d")
        if iv == "1d":
            rng = "6mo" if limit <= 130 else ("1y" if limit <= 260 else "2y")
        elif iv == "1w":
            rng = "2y" if limit <= 110 else "5y"
        elif iv == "1M":
            rng = "10y"
        else:
            rng = "1mo"
        res = self._yf_fetch_chart(ys, rng=rng, interval=yf_iv, timeout=9.0)
        if not res or not res.get("bars"):
            return [], "", ""
        return res["bars"][-limit:], res.get("name") or "", "YahooFinance"

    def _find_connector(self, name_or_key: str) -> dict | None:
        target = name_or_key.lower()
        for c in (self.cfg.data.get("api_connectors") or []):
            if not isinstance(c, dict) or not c.get("enabled", True):
                continue
            cname = str(c.get("name") or "").lower()
            if target == cname or target in cname:
                return c
        return None

    def _tushare_creds(self) -> tuple[str, str]:
        conn = self._find_connector("tushare") or self._find_connector("山西证券")
        if not conn:
            return "", ""
        base = str(conn.get("base_url") or "").strip()
        token = str(conn.get("api_key") or "").strip()
        if not token:
            notes = str(conn.get("notes") or "")
            m = re.search(r"\b([0-9a-f]{40,64})\b", notes, re.I)
            if m:
                token = m.group(1)
        return base, token

    def _ts_call(self, api_name: str, params: dict, fields: str = "", timeout: float = 8.0) -> list[dict] | None:
        base, token = self._tushare_creds()
        if not base or not token:
            return None
        try:
            res = _http_json(
                base,
                post_json={
                    "api_name": api_name,
                    "token": token,
                    "params": params,
                    "fields": fields,
                },
                timeout=timeout,
            )
            if not isinstance(res, dict) or res.get("code") != 0:
                return None
            data = res.get("data") or {}
            flds = data.get("fields") or []
            items = data.get("items") or []
            return [{flds[i]: row[i] for i in range(min(len(flds), len(row)))} for row in items]
        except Exception:
            return None

    def _ts_stock_basic(self) -> dict[str, dict]:
        cached = self.store.cache_get("ts_stock_basic")
        if cached:
            return cached
        rows = self._ts_call("stock_basic", {"list_status": "L"}, "ts_code,symbol,name,industry,market", timeout=10.0)
        if not rows:
            return self.store.cache_get("ts_stock_basic", allow_stale=True) or {}
        out: dict[str, dict] = {}
        for r in rows:
            tc = str(r.get("ts_code") or "").strip()
            if tc:
                out[tc] = {
                    "ts_code": tc,
                    "symbol": str(r.get("symbol") or tc),
                    "name": str(r.get("name") or tc),
                    "industry": str(r.get("industry") or "综合"),
                    "market": str(r.get("market") or "A"),
                }
        if out:
            self.store.cache_set("ts_stock_basic", out, ttl=86400)
        return out

    def _ts_latest_trade_date(self) -> str:
        cached = self.store.cache_get("ts_latest_trade_date")
        if cached:
            return str(cached)
        today = datetime.date.today()
        beg = (today - datetime.timedelta(days=14)).strftime("%Y%m%d")
        end = today.strftime("%Y%m%d")
        rows = self._ts_call("index_daily", {"ts_code": "000001.SH", "start_date": beg, "end_date": end}, "trade_date")
        if rows:
            dates = sorted({str(r.get("trade_date") or "") for r in rows if r.get("trade_date")}, reverse=True)
            for td in dates:
                # Confirm daily table also populated for td
                chk = self._ts_call("daily", {"trade_date": td}, "ts_code")
                if chk:
                    self.store.cache_set("ts_latest_trade_date", td, ttl=14400)
                    return td
        return ""

    @staticmethod
    def _ts_rows_to_bars(rows: list[dict], api_name: str, adj_map: dict[str, float] | None = None) -> list[dict]:
        if not rows:
            return []
        ordered = sorted(rows, key=lambda r: str(r.get("trade_date") or ""))
        latest_adj = 1.0
        if adj_map:
            for r in reversed(ordered):
                td = str(r.get("trade_date") or "")
                if td in adj_map and adj_map[td]:
                    latest_adj = float(adj_map[td])
                    break

        bars: list[dict] = []
        for r in ordered:
            td = str(r.get("trade_date") or "")
            d_iso = _iso_date(td)
            if not d_iso:
                continue
            if api_name == "fx_daily":
                bo, ao = _num(r.get("bid_open")), _num(r.get("ask_open"))
                bc, ac = _num(r.get("bid_close")), _num(r.get("ask_close"))
                bh, ah = _num(r.get("bid_high")), _num(r.get("ask_high"))
                bl, al = _num(r.get("bid_low")), _num(r.get("ask_low"))
                if bc is None or ac is None:
                    continue
                c = round((bc + ac) / 2.0, 5)
                o = round(((bo if bo is not None else bc) + (ao if ao is not None else ac)) / 2.0, 5)
                h = round(((bh if bh is not None else bc) + (ah if ah is not None else ac)) / 2.0, 5)
                l = round(((bl if bl is not None else bc) + (al if al is not None else ac)) / 2.0, 5)
                vol = float(_num(r.get("tick_qty"), 0.0) or 0.0)
            else:
                o = _num(r.get("open"))
                c = _num(r.get("close"))
                h = _num(r.get("high"))
                l = _num(r.get("low"))
                if c is None:
                    continue
                o = o if o is not None else c
                h = h if h is not None else max(o, c)
                l = l if l is not None else min(o, c)
                if adj_map and td in adj_map and adj_map[td] and latest_adj:
                    ratio = float(adj_map[td]) / latest_adj
                    o = round(o * ratio, 4)
                    c = round(c * ratio, 4)
                    h = round(h * ratio, 4)
                    l = round(l * ratio, 4)
                vol = float(_num(r.get("vol"), 0.0) or 0.0)
            bars.append({"time": d_iso, "open": o, "high": h, "low": l, "close": c, "volume": vol})
        return bars

    def _quote_from_ts_rows(self, sid: str, rows: list[dict], api_name: str) -> dict | None:
        bars = self._ts_rows_to_bars(rows, api_name)
        if not bars:
            return None
        ordered = sorted(rows, key=lambda r: str(r.get("trade_date") or ""))
        last_r = ordered[-1]
        last_b = bars[-1]
        price = last_b["close"]
        if api_name == "fx_daily":
            prev_c = bars[-2]["close"] if len(bars) >= 2 else last_b["open"]
            chg = price - prev_c
            pct = (chg / prev_c * 100.0) if prev_c else 0.0
        else:
            prev_c = _num(last_r.get("pre_close")) or (bars[-2]["close"] if len(bars) >= 2 else price)
            chg = _num(last_r.get("change"))
            if chg is None:
                chg = price - prev_c
            pct = _num(last_r.get("pct_chg"))
            if pct is None:
                pct = (chg / prev_c * 100.0) if prev_c else 0.0
        meta = self._meta_map.get(sid) or {}
        return {
            "secid": sid,
            "symbol": meta.get("symbol") or sid,
            "name": meta.get("name") or sid,
            "price": round(price, 4 if abs(price) < 10 else 2),
            "chg": round(chg, 4 if abs(chg) < 1 else 2),
            "pct": round(pct, 2),
            "high": last_b["high"],
            "low": last_b["low"],
            "open": last_b["open"],
            "prev_close": prev_c,
            "volume": last_b["volume"],
            "amount": float(_num(last_r.get("amount"), 0.0) or 0.0),
            "spark": [b["close"] for b in bars[-10:]],
            "source": "Tushare山西网关",
        }

    def _fetch_tushare_overview(self, secids: list[str]) -> dict[str, dict]:
        base, token = self._tushare_creds()
        if not base or not token:
            return {}
        today = datetime.date.today()
        beg = (today - datetime.timedelta(days=20)).strftime("%Y%m%d")
        end = today.strftime("%Y%m%d")

        # Group target secids by Tushare API
        by_api: dict[str, list[tuple[str, str]]] = {
            "index_daily": [],
            "index_global": [],
            "fx_daily": [],
            "daily": [],
            "hk_daily": [],
            "fund_daily": [],
        }
        for sid in secids:
            tgt = _resolve_tushare_target(sid)
            if tgt and tgt[0] in by_api:
                by_api[tgt[0]].append((sid, tgt[1]))

        out: dict[str, dict] = {}
        jobs: list = []

        def _fetch_one(api_name: str, sid: str, ts_code: str):
            rows = self._ts_call(api_name, {"ts_code": ts_code, "start_date": beg, "end_date": end})
            return sid, api_name, rows

        def _fetch_bulk(api_name: str, pairs: list[tuple[str, str]]):
            rows = self._ts_call(api_name, {"start_date": beg, "end_date": end})
            if not rows:
                return []
            by_code: dict[str, list[dict]] = {}
            for r in rows:
                tc = str(r.get("ts_code") or "")
                if tc:
                    by_code.setdefault(tc, []).append(r)
            return [(sid, api_name, by_code.get(tc) or []) for sid, tc in pairs]

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
            futs_single = []
            for api_name in ("index_daily", "daily", "hk_daily", "fund_daily"):
                for sid, tc in by_api[api_name]:
                    futs_single.append(ex.submit(_fetch_one, api_name, sid, tc))
            fut_ig = ex.submit(_fetch_bulk, "index_global", by_api["index_global"]) if by_api["index_global"] else None
            fut_fx = ex.submit(_fetch_bulk, "fx_daily", by_api["fx_daily"]) if by_api["fx_daily"] else None

            for f in futs_single:
                try:
                    sid, api_name, rows = f.result()
                    if rows:
                        q = self._quote_from_ts_rows(sid, rows, api_name)
                        if q:
                            out[sid] = q
                except Exception:
                    pass
            for bf in (fut_ig, fut_fx):
                if bf is None:
                    continue
                try:
                    for sid, api_name, rows in bf.result():
                        if rows:
                            q = self._quote_from_ts_rows(sid, rows, api_name)
                            if q:
                                out[sid] = q
                except Exception:
                    pass
        return out

    def _fetch_em_ulist(self, secids: list[str]) -> dict[str, dict]:
        out: dict[str, dict] = {}
        if not secids:
            return out
        chunk_size = 55
        for i in range(0, len(secids), chunk_size):
            batch = secids[i : i + chunk_size]
            url = (
                "https://push2.eastmoney.com/api/qt/ulist.np/get?"
                + urllib.parse.urlencode({
                    "fltt": "2",
                    "invt": "2",
                    "fields": "f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18",
                    "secids": ",".join(batch),
                })
            )
            try:
                res = _http_json(url, headers=EM_HEADERS, timeout=8.0)
                diffs = ((res or {}).get("data") or {}).get("diff") or []
                for d in diffs:
                    sid = f"{d.get('f13')}.{d.get('f12')}"
                    price = _num(d.get("f2"))
                    pct = _num(d.get("f3"), 0.0)
                    chg = _num(d.get("f4"), 0.0)
                    if price is None:
                        continue
                    out[sid] = {
                        "secid": sid,
                        "code": str(d.get("f12") or ""),
                        "name_em": str(d.get("f14") or ""),
                        "price": price,
                        "chg": round(chg or 0.0, 4),
                        "pct": round(pct or 0.0, 2),
                        "high": _num(d.get("f15")),
                        "low": _num(d.get("f16")),
                        "open": _num(d.get("f17")),
                        "prev_close": _num(d.get("f18")),
                        "volume": _num(d.get("f5"), 0.0),
                        "amount": _num(d.get("f6"), 0.0),
                        "source": "EastMoney",
                    }
            except Exception:
                continue
        return out

    def _fetch_cbr_rates(self) -> dict:
        cached = self.store.cache_get("cbr_daily")
        if cached:
            return cached
        try:
            data = _http_json("https://www.cbr-xml-daily.ru/daily_json.js", timeout=7.0)
            val = (data or {}).get("Valute") or {}
            usd = val.get("USD") or {}
            cny = val.get("CNY") or {}
            eur = val.get("EUR") or {}

            def _mk(obj: dict, secid: str, sym: str, name: str) -> dict | None:
                v = _num(obj.get("Value"))
                p = _num(obj.get("Previous"))
                nom = _num(obj.get("Nominal"), 1.0) or 1.0
                if v is None:
                    return None
                v = v / nom
                p = (p / nom) if p else v
                chg = v - p
                pct = (chg / p * 100.0) if p else 0.0
                return {
                    "secid": secid,
                    "symbol": sym,
                    "name": name,
                    "price": round(v, 4),
                    "chg": round(chg, 4),
                    "pct": round(pct, 2),
                    "prev_close": round(p, 4),
                    "spark": [round(p, 4), round(v, 4)],
                    "source": "CBR",
                }

            res = {
                "date": str((data or {}).get("Date") or "")[:10],
                "items": {
                    k: v
                    for k, v in (
                        ("CBR.USDRUB", _mk(usd, "CBR.USDRUB", "USD/RUB", "美元/卢布 (CBR)")),
                        ("CBR.CNYRUB", _mk(cny, "CBR.CNYRUB", "CNY/RUB", "人民币/卢布 (CBR)")),
                        ("CBR.EURRUB", _mk(eur, "CBR.EURRUB", "EUR/RUB", "欧元/卢布 (CBR)")),
                    )
                    if v is not None
                },
            }
            self.store.cache_set("cbr_daily", res, ttl=600)
            return res
        except Exception:
            return self.store.cache_get("cbr_daily", allow_stale=True) or {"date": "", "items": {}}

    def _fetch_coingecko_quotes(self) -> dict[str, dict]:
        cached = self.store.cache_get("cg_quotes")
        if cached:
            return cached
        try:
            url = (
                "https://api.coingecko.com/api/v3/coins/markets?"
                + urllib.parse.urlencode({
                    "vs_currency": "usd",
                    "ids": ",".join(COINGECKO_IDS),
                    "order": "market_cap_desc",
                    "sparkline": "true",
                    "price_change_percentage": "24h",
                })
            )
            arr = _http_json(url, timeout=8.0)
            out: dict[str, dict] = {}
            for row in (arr or []):
                cid = str(row.get("id") or "")
                if not cid:
                    continue
                sid = f"CG.{cid}"
                price = _num(row.get("current_price"), 0.0) or 0.0
                chg = _num(row.get("price_change_24h"), 0.0) or 0.0
                pct = _num(row.get("price_change_percentage_24h"), 0.0) or 0.0
                sp_raw = ((row.get("sparkline_in_7d") or {}).get("price") or [])[-24:]
                out[sid] = {
                    "secid": sid,
                    "symbol": str(row.get("symbol") or cid).upper(),
                    "name": str(row.get("name") or cid),
                    "price": round(price, 4 if price < 10 else 2),
                    "chg": round(chg, 4 if abs(chg) < 1 else 2),
                    "pct": round(pct, 2),
                    "market_cap": _num(row.get("market_cap"), 0.0),
                    "volume": _num(row.get("total_volume"), 0.0),
                    "spark": [round(float(x), 4) for x in sp_raw if x is not None],
                    "source": "CoinGecko",
                }
            if out:
                self.store.cache_set("cg_quotes", out, ttl=120)
            return out
        except Exception:
            return self.store.cache_get("cg_quotes", allow_stale=True) or {}

    def overview(self, force: bool = False) -> dict:
        if not force:
            cached = self.store.cache_get("overview")
            if cached:
                wl = self.store.list_watchlist()
                qmap = cached.get("_qmap") or {}
                cached["watchlist"] = [
                    {**w, **(qmap.get(w["secid"]) or {}), "secid": w["secid"], "symbol": w["symbol"], "name": w["name"]}
                    for w in wl
                ]
                return cached

        wl = self.store.list_watchlist()
        all_secids: list[str] = []
        seen: set[str] = set()
        for panel in MARKET_PANELS:
            for it in panel["items"]:
                if it["secid"] not in seen:
                    seen.add(it["secid"])
                    all_secids.append(it["secid"])
        for w in wl:
            if w["secid"] not in seen:
                seen.add(w["secid"])
                all_secids.append(w["secid"])

        mode = str(self.cfg.data.get("market_source_mode") or "auto").strip().lower()
        non_cbr = [s for s in all_secids if not s.startswith("CBR.")]
        if mode == "yfinance":
            ts_primary: list[str] = []
            yf_primary = list(non_cbr)
        elif mode == "tushare":
            ts_primary = [s for s in non_cbr if not s.startswith("CG.")]
            yf_primary = [s for s in non_cbr if s not in ts_primary or _resolve_tushare_target(s) is None]
        else:
            # auto: CN (A-shares/CN indices/CN ETFs) -> Tushare; Global (US/HK/Global Indices/FX/Commodities/Crypto) -> YahooFinance
            ts_primary = [s for s in non_cbr if _is_cn_secid(s)]
            yf_primary = [s for s in non_cbr if not _is_cn_secid(s)]

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
            f_ts = ex.submit(self._fetch_tushare_overview, ts_primary)
            f_yf = ex.submit(self._fetch_yf_overview, yf_primary)
            f_cbr = ex.submit(self._fetch_cbr_rates)
            ts_map = f_ts.result()
            yf_map = f_yf.result()
            cbr_res = f_cbr.result()

        qmap: dict[str, dict] = {}
        for sid, q in ts_map.items():
            qmap[sid] = q
        for sid, q in yf_map.items():
            if sid not in qmap:
                qmap[sid] = q

        # Cross-fallback: missing global items -> Tushare; missing CN items -> YahooFinance
        miss_for_ts = [s for s in non_cbr if s not in qmap and not s.startswith("CG.") and _resolve_tushare_target(s)]
        if miss_for_ts:
            extra_ts = self._fetch_tushare_overview(miss_for_ts)
            ts_map.update(extra_ts)
            for sid, q in extra_ts.items():
                if sid not in qmap:
                    qmap[sid] = q

        miss_for_yf = [s for s in non_cbr if s not in qmap and _resolve_yf_symbol(s)]
        if miss_for_yf and mode != "yfinance":
            extra_yf = self._fetch_yf_overview(miss_for_yf)
            yf_map.update(extra_yf)
            for sid, q in extra_yf.items():
                if sid not in qmap:
                    qmap[sid] = q

        # Remaining gaps: EastMoney (equities/indices/FX/commodities) & CoinGecko (crypto)
        miss_em = [s for s in non_cbr if s not in qmap and not s.startswith("CG.")]
        miss_cg = [s for s in non_cbr if s not in qmap and s.startswith("CG.")]
        em_map = self._fetch_em_ulist(miss_em) if miss_em else {}
        cg_map = self._fetch_coingecko_quotes() if miss_cg else {}

        for sid, q in em_map.items():
            if sid in qmap:
                continue
            meta = self._meta_map.get(sid) or {}
            qmap[sid] = {
                **q,
                "symbol": meta.get("symbol") or q.get("code") or sid,
                "name": meta.get("name") or q.get("name_em") or sid,
                "spark": [q["prev_close"], q["price"]] if q.get("prev_close") and q.get("price") is not None else [],
            }
        for sid, q in (cbr_res.get("items") or {}).items():
            qmap[sid] = q
        for sid, q in cg_map.items():
            if sid not in qmap:
                qmap[sid] = q

        if not qmap:
            stale = self.store.cache_get("overview", allow_stale=True)
            if stale:
                return stale

        panels_out = []
        up_cnt = 0
        down_cnt = 0
        flat_cnt = 0
        for p in MARKET_PANELS:
            rows = []
            for it in p["items"]:
                sid = it["secid"]
                q = qmap.get(sid)
                row = {
                    "secid": sid,
                    "symbol": it["symbol"],
                    "name": it["name"],
                    "price": q.get("price") if q else None,
                    "chg": q.get("chg", 0.0) if q else 0.0,
                    "pct": q.get("pct", 0.0) if q else 0.0,
                    "high": q.get("high") if q else None,
                    "low": q.get("low") if q else None,
                    "open": q.get("open") if q else None,
                    "prev_close": q.get("prev_close") if q else None,
                    "amount": q.get("amount", 0.0) if q else 0.0,
                    "spark": q.get("spark", []) if q else [],
                    "source": q.get("source", "") if q else "",
                }
                if row["price"] is not None:
                    if row["pct"] > 0:
                        up_cnt += 1
                    elif row["pct"] < 0:
                        down_cnt += 1
                    else:
                        flat_cnt += 1
                rows.append(row)
            panels_out.append({"id": p["id"], "title": p["title"], "items": rows})

        ribbon = []
        for sid in RIBBON_SECIDS:
            meta = self._meta_map.get(sid) or {"symbol": sid, "name": sid}
            q = qmap.get(sid) or {}
            ribbon.append({
                "secid": sid,
                "symbol": meta.get("symbol") or sid,
                "name": meta.get("name") or sid,
                "price": q.get("price"),
                "chg": q.get("chg", 0.0),
                "pct": q.get("pct", 0.0),
                "spark": q.get("spark", []),
                "source": q.get("source", ""),
            })

        watchlist_out = [
            {
                "secid": w["secid"],
                "symbol": w["symbol"],
                "name": w["name"],
                "market_group": w["market_group"],
                "price": (qmap.get(w["secid"]) or {}).get("price"),
                "chg": (qmap.get(w["secid"]) or {}).get("chg", 0.0),
                "pct": (qmap.get(w["secid"]) or {}).get("pct", 0.0),
                "spark": (qmap.get(w["secid"]) or {}).get("spark", []),
            }
            for w in wl
        ]

        res = {
            "ok": True,
            "ribbon": ribbon,
            "panels": panels_out,
            "watchlist": watchlist_out,
            "stats": {
                "total": up_cnt + down_cnt + flat_cnt,
                "up": up_cnt,
                "down": down_cnt,
                "flat": flat_cnt,
                "sources": [
                    name
                    for name, has in (
                        ("YahooFinance", bool(yf_map)),
                        ("Tushare山西网关", bool(ts_map)),
                        ("EastMoney", bool(em_map)),
                        ("CBR", bool(cbr_res.get("items"))),
                        ("CoinGecko", bool(cg_map)),
                    )
                    if has
                ],
            },
            "updated_at": int(time.time()),
            "_qmap": qmap,
        }
        self.store.cache_set("overview", res, ttl=60)
        return res

    def _kline_tushare(self, secid: str, iv: str, limit: int) -> tuple[list[dict], str, str]:
        tgt = _resolve_tushare_target(secid)
        if not tgt:
            return [], "", ""
        api_name, ts_code = tgt
        today = datetime.date.today()
        end_d = today.strftime("%Y%m%d")

        # Native weekly / monthly for A-share stocks
        if api_name == "daily" and iv in ("1w", "1M"):
            days_back = max(365, limit * (8 if iv == "1w" else 32))
            beg_d = (today - datetime.timedelta(days=min(3650, days_back))).strftime("%Y%m%d")
            ts_api = "weekly" if iv == "1w" else "monthly"
            rows = self._ts_call(ts_api, {"ts_code": ts_code, "start_date": beg_d, "end_date": end_d})
            if rows:
                bars = self._ts_rows_to_bars(rows, ts_api)
                if bars:
                    sb = self._ts_stock_basic() if len(self._ts_stock_basic()) else {}
                    nm = (sb.get(ts_code) or {}).get("name") or ""
                    return bars[-limit:], nm, "Tushare山西网关"

        mult = 2 if iv == "1d" else (8 if iv == "1w" else 32)
        raw_bars_needed = limit if iv == "1d" else min(900, limit * (6 if iv == "1w" else 24))
        beg_d = (today - datetime.timedelta(days=min(3650, max(90, limit * mult)))).strftime("%Y%m%d")

        adj_map: dict[str, float] | None = None
        if api_name == "daily" and iv == "1d":
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
                f_rows = ex.submit(self._ts_call, "daily", {"ts_code": ts_code, "start_date": beg_d, "end_date": end_d})
                f_adj = ex.submit(self._ts_call, "adj_factor", {"ts_code": ts_code, "start_date": beg_d, "end_date": end_d})
                rows = f_rows.result()
                adj_rows = f_adj.result()
            if adj_rows:
                adj_map = {str(a.get("trade_date") or ""): float(a["adj_factor"]) for a in adj_rows if a.get("trade_date") and a.get("adj_factor")}
        else:
            rows = self._ts_call(api_name, {"ts_code": ts_code, "start_date": beg_d, "end_date": end_d})

        if not rows:
            return [], "", ""
        bars = self._ts_rows_to_bars(rows, api_name, adj_map=adj_map)
        if iv in ("1w", "1M"):
            bars = _resample_bars(bars, iv)
        elif raw_bars_needed:
            bars = bars[-limit:]

        nm = ""
        if api_name == "daily":
            sb = self.store.cache_get("ts_stock_basic") or {}
            nm = (sb.get(ts_code) or {}).get("name") or ""
        return bars[-limit:], nm, "Tushare山西网关"

    def _kline_em_fallback(self, secid: str, iv: str, limit: int) -> tuple[list[dict], str, str]:
        klt = {"1d": "101", "1w": "102", "1M": "103", "60m": "60"}.get(iv, "101")
        try:
            url = (
                "https://push2his.eastmoney.com/api/qt/stock/kline/get?"
                + urllib.parse.urlencode({
                    "secid": secid,
                    "fields1": "f1,f2,f3,f4,f5,f6",
                    "fields2": "f51,f52,f53,f54,f55,f56,f57",
                    "klt": klt,
                    "fqt": "1",
                    "end": "20500101",
                    "lmt": str(limit),
                })
            )
            res = _http_json(url, headers=EM_HEADERS, timeout=6.0)
            kd = (res or {}).get("data") or {}
            bars = []
            for ln in (kd.get("klines") or []):
                parts = str(ln).split(",")
                if len(parts) >= 6:
                    bars.append({
                        "time": parts[0][:10],
                        "open": float(parts[1]),
                        "close": float(parts[2]),
                        "high": float(parts[3]),
                        "low": float(parts[4]),
                        "volume": float(parts[5] or 0.0),
                    })
            return bars, str(kd.get("name") or ""), "EastMoneyHistory"
        except Exception:
            return [], "", ""

    def _kline_tencent_fallback(self, secid: str, iv: str, limit: int) -> tuple[list[dict], str]:
        if "." not in secid:
            return [], ""
        mkt, code = secid.split(".", 1)
        tc_sym = ""
        if mkt == "1" and code.isdigit():
            tc_sym = f"sh{code}"
        elif mkt == "0" and code.isdigit():
            tc_sym = f"sz{code}"
        elif mkt == "116" and code.isdigit():
            tc_sym = f"hk{code.zfill(5)}"
        elif mkt in ("105", "106", "107") and code:
            tc_sym = f"us{code}"
        if not tc_sym:
            return [], ""
        tc_iv = {"1d": "day", "1w": "week", "1M": "month"}.get(iv, "day")
        try:
            url = (
                "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?"
                + urllib.parse.urlencode({"param": f"{tc_sym},{tc_iv},,,{limit},qfq"})
            )
            res = _http_json(url, timeout=8.0)
            sdata = ((res or {}).get("data") or {}).get(tc_sym) or {}
            rows = sdata.get(f"qfq{tc_iv}") or sdata.get(tc_iv) or []
            bars = []
            for row in rows:
                if not isinstance(row, list) or len(row) < 5:
                    continue
                bars.append({
                    "time": str(row[0])[:10],
                    "open": float(row[1]),
                    "close": float(row[2]),
                    "high": float(row[3]),
                    "low": float(row[4]),
                    "volume": float(row[5]) if len(row) >= 6 and row[5] not in (None, "") else 0.0,
                })
            return bars[-limit:], "Tencent"
        except Exception:
            return [], ""

    def _kline_coingecko(self, coin_id: str, limit: int) -> tuple[list[dict], str, str]:
        url = (
            f"https://api.coingecko.com/api/v3/coins/{urllib.parse.quote(coin_id)}/market_chart?"
            + urllib.parse.urlencode({"vs_currency": "usd", "days": str(max(30, min(365, limit))), "interval": "daily"})
        )
        res = _http_json(url, timeout=9.0)
        prices = (res or {}).get("prices") or []
        vols = (res or {}).get("total_volumes") or []
        vol_by_day = {}
        for ts_ms, v in vols:
            d = datetime.datetime.fromtimestamp(ts_ms / 1000.0, tz=datetime.timezone.utc).strftime("%Y-%m-%d")
            vol_by_day[d] = float(v or 0.0)
        by_day: dict[str, float] = {}
        for ts_ms, p in prices:
            d = datetime.datetime.fromtimestamp(ts_ms / 1000.0, tz=datetime.timezone.utc).strftime("%Y-%m-%d")
            by_day[d] = float(p)
        bars: list[dict] = []
        prev_c = None
        for d in sorted(by_day.keys()):
            c = by_day[d]
            o = prev_c if prev_c is not None else c
            bars.append({
                "time": d,
                "open": round(o, 4 if o < 10 else 2),
                "high": round(max(o, c), 4 if c < 10 else 2),
                "low": round(min(o, c), 4 if c < 10 else 2),
                "close": round(c, 4 if c < 10 else 2),
                "volume": round(vol_by_day.get(d, 0.0), 2),
            })
            prev_c = c
        return bars[-limit:], coin_id.upper(), "CoinGecko"

    def _kline_cbr(self, pair: str, limit: int) -> tuple[list[dict], str, str]:
        cbr = self._fetch_cbr_rates()
        it = (cbr.get("items") or {}).get(pair)
        if not it:
            return [], pair, "CBR"
        today = cbr.get("date") or datetime.date.today().isoformat()
        cur = float(it.get("price") or 0.0)
        prev = float(it.get("prev_close") or cur)
        d_prev = (datetime.date.fromisoformat(today) - datetime.timedelta(days=1)).isoformat()
        bars = [
            {"time": d_prev, "open": prev, "high": prev, "low": prev, "close": prev, "volume": 0.0},
            {"time": today, "open": prev, "high": max(prev, cur), "low": min(prev, cur), "close": cur, "volume": 0.0},
        ]
        return bars[-limit:], it.get("name") or pair, "CBR"

    def _news_markers_for_bars(self, secid: str, name: str, bars: list[dict]) -> tuple[list[dict], list[dict]]:
        if not self.news_mgr or not bars:
            return [], []
        first_t = str(bars[0]["time"])[:10]
        last_t = str(bars[-1]["time"])[:10]
        try:
            start_ts = int(datetime.datetime.fromisoformat(first_t).replace(tzinfo=datetime.timezone.utc).timestamp()) - 86400
            end_ts = int(datetime.datetime.fromisoformat(last_t).replace(tzinfo=datetime.timezone.utc).timestamp()) + 86400 * 2
        except ValueError:
            return [], []

        bar_dates = sorted({str(b["time"])[:10] for b in bars})
        kws = _symbol_keywords(secid, name)

        def _snap_bar_date(pub_ts: int) -> str | None:
            d = datetime.datetime.fromtimestamp(pub_ts).strftime("%Y-%m-%d")
            if d in bar_dates:
                return d
            for bd in bar_dates:
                if bd >= d:
                    return bd
            return bar_dates[-1] if bar_dates else None

        try:
            with self.news_mgr.store.con() as c:
                rows = c.execute(
                    """SELECT id, feed_name, lang, title_orig, title_zh, sentiment, impact, published_at, entities_json
                       FROM news_items
                       WHERE IFNULL(is_canonical, 1) = 1 AND published_at >= ? AND published_at <= ?
                       ORDER BY impact DESC, published_at DESC
                       LIMIT 260""",
                    (start_ts, end_ts),
                ).fetchall()
        except Exception:
            return [], []

        matched: list[dict] = []
        macro_fallback: list[dict] = []
        for r in rows:
            it = dict(r)
            text_blob = f"{it.get('title_zh') or ''} {it.get('title_orig') or ''} {it.get('entities_json') or ''}".lower()
            hit = any(k.lower() in text_blob for k in kws)
            if hit:
                matched.append(it)
            elif int(it.get("impact") or 0) >= 4:
                macro_fallback.append(it)

        chosen = matched[:30] if matched else macro_fallback[:16]
        markers: list[dict] = []
        events: list[dict] = []
        seen_day: dict[str, int] = {}
        for it in chosen:
            pub_ts = int(it.get("published_at") or 0)
            bd = _snap_bar_date(pub_ts)
            if not bd:
                continue
            title = (it.get("title_zh") or it.get("title_orig") or "").strip()
            sent = str(it.get("sentiment") or "neutral")
            events.append({
                "id": it["id"],
                "time": bd,
                "published_at": pub_ts,
                "lang": it.get("lang") or "en",
                "feed_name": it.get("feed_name") or "",
                "title": title,
                "sentiment": sent,
                "impact": int(it.get("impact") or 0),
                "matched": bool(matched),
            })
            if seen_day.get(bd, 0) < 1:
                seen_day[bd] = 1
                color = "#10b981" if sent == "bullish" else ("#ef4444" if sent == "bearish" else "#f59e0b")
                shape = "arrowUp" if sent == "bullish" else ("arrowDown" if sent == "bearish" else "circle")
                pos = "belowBar" if sent == "bullish" else "aboveBar"
                markers.append({
                    "time": bd,
                    "position": pos,
                    "color": color,
                    "shape": shape,
                    "text": f"[{str(it.get('lang') or '').upper()}] {title[:18]}",
                    "news_id": it["id"],
                })
        markers.sort(key=lambda m: m["time"])
        return markers, events[:20]

    def kline(self, secid: str, interval: str = "1d", limit: int = 160, name: str = "", force: bool = False) -> dict:
        sid = (secid or "").strip()
        if not sid:
            raise ValueError("缺少标的代码 secid")
        lim = max(10, min(360, int(limit or 160)))
        iv = (interval or "1d").strip()
        ck = f"kline:{sid}:{iv}:{lim}"
        data = None if force else self.store.cache_get(ck)
        if not data:
            bars: list[dict] = []
            resolved_name = name or (self._meta_map.get(sid) or {}).get("name") or sid
            source = ""
            mode = str(self.cfg.data.get("market_source_mode") or "auto").strip().lower()
            if sid.startswith("CBR."):
                bars, cname, source = self._kline_cbr(sid, lim)
                resolved_name = name or cname
                if not bars:
                    bars, yf_nm, yf_src = self._kline_yfinance(sid, iv, lim)
                    if bars:
                        source = yf_src
                        resolved_name = name or yf_nm or resolved_name
            else:
                if mode == "yfinance":
                    chain = ["yfinance", "tushare", "coingecko" if sid.startswith("CG.") else "em", "tencent"]
                elif mode == "tushare":
                    chain = ["tushare", "yfinance", "coingecko" if sid.startswith("CG.") else "em", "tencent"]
                else:
                    # auto: CN -> Tushare primary; Global & Crypto -> YahooFinance primary
                    if _is_cn_secid(sid):
                        chain = ["tushare", "yfinance", "em", "tencent"]
                    elif sid.startswith("CG."):
                        chain = ["yfinance", "coingecko"]
                    else:
                        chain = ["yfinance", "tushare", "em", "tencent"]

                for prov in chain:
                    if bars:
                        break
                    if prov == "yfinance":
                        bars, nm_p, src_p = self._kline_yfinance(sid, iv, lim)
                        if bars:
                            source = src_p
                            if not name and nm_p:
                                resolved_name = (self._meta_map.get(sid) or {}).get("name") or nm_p
                    elif prov == "tushare" and iv in ("1d", "1w", "1M"):
                        bars, nm_p, src_p = self._kline_tushare(sid, iv, lim)
                        if bars:
                            source = src_p
                            if not name and nm_p:
                                resolved_name = (self._meta_map.get(sid) or {}).get("name") or nm_p
                    elif prov == "coingecko" and sid.startswith("CG."):
                        bars, nm_p, src_p = self._kline_coingecko(sid[3:], lim)
                        if bars:
                            source = src_p
                            resolved_name = name or nm_p or resolved_name
                    elif prov == "em":
                        bars, nm_p, src_p = self._kline_em_fallback(sid, iv, lim)
                        if bars:
                            source = src_p
                            if not name and nm_p:
                                resolved_name = (self._meta_map.get(sid) or {}).get("name") or nm_p
                    elif prov == "tencent" and iv in ("1d", "1w", "1M"):
                        bars, src_p = self._kline_tencent_fallback(sid, iv, lim)
                        if bars:
                            source = src_p

            if not bars:
                stale = self.store.cache_get(ck, allow_stale=True)
                if stale:
                    data = stale
                else:
                    return {"ok": False, "error": f"暂无 {sid} 行情K线数据", "secid": sid}
            else:
                ind = _calc_indicators(bars)
                last_b = bars[-1]
                prev_b = bars[-2] if len(bars) >= 2 else last_b
                chg = round(last_b["close"] - prev_b["close"], 4)
                pct = round((chg / prev_b["close"]) * 100.0, 2) if prev_b["close"] else 0.0
                data = {
                    "ok": True,
                    "secid": sid,
                    "name": resolved_name,
                    "interval": iv,
                    "source": source,
                    "price": last_b["close"],
                    "chg": chg,
                    "pct": pct,
                    "bars": bars,
                    "indicators": ind,
                }
                self.store.cache_set(ck, data, ttl=120)

        markers, events = self._news_markers_for_bars(sid, data.get("name") or name or sid, data.get("bars") or [])
        return {**data, "markers": markers, "news_events": events}

    def sectors(self, limit: int = 36, force: bool = False) -> dict:
        lim = max(8, min(60, int(limit or 36)))
        if not force:
            cached = self.store.cache_get(f"sectors:{lim}")
            if cached:
                return cached

        # Primary: Tushare daily + daily_basic + stock_basic grouped by industry
        td = self._ts_latest_trade_date()
        if td:
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
                f_sb = ex.submit(self._ts_stock_basic)
                f_dl = ex.submit(self._ts_call, "daily", {"trade_date": td}, "ts_code,close,pct_chg,amount", 10.0)
                f_db = ex.submit(self._ts_call, "daily_basic", {"trade_date": td}, "ts_code,total_mv", 10.0)
                sb = f_sb.result()
                dl_rows = f_dl.result()
                db_rows = f_db.result()
            if sb and dl_rows:
                mv_map = {str(r["ts_code"]): (_num(r.get("total_mv"), 0.0) or 0.0) for r in (db_rows or []) if r.get("ts_code")}
                agg: dict[str, dict] = {}
                for r in dl_rows:
                    tc = str(r.get("ts_code") or "")
                    info = sb.get(tc)
                    if not info:
                        continue
                    ind = info.get("industry") or "综合"
                    pct = _num(r.get("pct_chg"), 0.0) or 0.0
                    amt = (_num(r.get("amount"), 0.0) or 0.0) * 1000.0
                    mv = mv_map.get(tc, 0.0) * 10000.0
                    w = mv if mv > 0 else max(amt, 1.0)
                    b = agg.setdefault(ind, {"w_sum": 0.0, "w_pct": 0.0, "mkt_cap": 0.0, "cnt": 0, "amt": 0.0})
                    b["w_sum"] += w
                    b["w_pct"] += w * pct
                    b["mkt_cap"] += mv if mv > 0 else amt
                    b["amt"] += amt
                    b["cnt"] += 1
                items = []
                for ind, b in agg.items():
                    if b["cnt"] == 0 or b["w_sum"] <= 0:
                        continue
                    pct_avg = b["w_pct"] / b["w_sum"]
                    items.append({
                        "code": ind,
                        "name": ind,
                        "price": b["cnt"],
                        "pct": round(pct_avg, 2),
                        "chg": round(pct_avg, 2),
                        "mkt_cap": round(b["mkt_cap"], 0) or 1.0,
                        "net_inflow": round(b["amt"] * (pct_avg / 100.0), 0),
                    })
                items.sort(key=lambda x: x["mkt_cap"], reverse=True)
                if items:
                    out = {"ok": True, "items": items[:lim], "source": "Tushare山西网关", "trade_date": td, "updated_at": int(time.time())}
                    self.store.cache_set(f"sectors:{lim}", out, ttl=300)
                    return out

        # Fallback: EastMoney sectors
        try:
            url = (
                "https://push2.eastmoney.com/api/qt/clist/get?"
                + urllib.parse.urlencode({
                    "pn": "1",
                    "pz": str(lim),
                    "po": "1",
                    "np": "1",
                    "fltt": "2",
                    "invt": "2",
                    "fid": "f20",
                    "fs": "m:90+t:2",
                    "fields": "f2,f3,f4,f12,f14,f20,f62",
                })
            )
            res = _http_json(url, headers=EM_HEADERS, timeout=8.0)
            diffs = ((res or {}).get("data") or {}).get("diff") or []
            items = []
            for d in diffs:
                items.append({
                    "code": str(d.get("f12") or ""),
                    "name": str(d.get("f14") or ""),
                    "price": _num(d.get("f2"), 0.0),
                    "pct": round(_num(d.get("f3"), 0.0) or 0.0, 2),
                    "chg": round(_num(d.get("f4"), 0.0) or 0.0, 2),
                    "mkt_cap": _num(d.get("f20"), 0.0) or 1.0,
                    "net_inflow": _num(d.get("f62"), 0.0) or 0.0,
                })
            out = {"ok": True, "items": items, "source": "EastMoney", "updated_at": int(time.time())}
            if items:
                self.store.cache_set(f"sectors:{lim}", out, ttl=120)
            return out
        except Exception as e:
            stale = self.store.cache_get(f"sectors:{lim}", allow_stale=True)
            if stale:
                return stale
            return {"ok": False, "error": str(e), "items": []}

    def movers(self, limit: int = 15, force: bool = False) -> dict:
        lim = max(5, min(30, int(limit or 15)))
        if not force:
            cached = self.store.cache_get(f"movers:{lim}")
            if cached:
                return cached

        # Primary: Tushare daily(trade_date=latest) + stock_basic
        td = self._ts_latest_trade_date()
        if td:
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
                f_sb = ex.submit(self._ts_stock_basic)
                f_dl = ex.submit(self._ts_call, "daily", {"trade_date": td}, "ts_code,close,change,pct_chg,amount", 10.0)
                sb = f_sb.result()
                dl_rows = f_dl.result()
            if dl_rows:
                norm: list[dict] = []
                for r in dl_rows:
                    tc = str(r.get("ts_code") or "")
                    if "." not in tc:
                        continue
                    code, suf = tc.split(".", 1)
                    if suf not in ("SH", "SZ"):
                        continue
                    mkt_prefix = "1" if suf == "SH" else "0"
                    price = _num(r.get("close"))
                    if price is None:
                        continue
                    norm.append({
                        "secid": f"{mkt_prefix}.{code}",
                        "symbol": tc,
                        "name": (sb.get(tc) or {}).get("name") or code,
                        "price": price,
                        "pct": round(_num(r.get("pct_chg"), 0.0) or 0.0, 2),
                        "chg": round(_num(r.get("change"), 0.0) or 0.0, 2),
                        "amount": round((_num(r.get("amount"), 0.0) or 0.0) * 1000.0, 0),
                    })
                if norm:
                    out = {
                        "ok": True,
                        "gainers": sorted(norm, key=lambda x: x["pct"], reverse=True)[:lim],
                        "losers": sorted(norm, key=lambda x: x["pct"])[:lim],
                        "active": sorted(norm, key=lambda x: x["amount"], reverse=True)[:lim],
                        "source": "Tushare山西网关",
                        "trade_date": td,
                        "updated_at": int(time.time()),
                    }
                    self.store.cache_set(f"movers:{lim}", out, ttl=300)
                    return out

        # Fallback: EastMoney
        def _q(fid: str, po: str) -> list[dict]:
            url = (
                "https://push2.eastmoney.com/api/qt/clist/get?"
                + urllib.parse.urlencode({
                    "pn": "1",
                    "pz": str(lim),
                    "po": po,
                    "np": "1",
                    "fltt": "2",
                    "invt": "2",
                    "fid": fid,
                    "fs": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
                    "fields": "f2,f3,f4,f6,f12,f13,f14",
                })
            )
            res = _http_json(url, headers=EM_HEADERS, timeout=8.0)
            diffs = ((res or {}).get("data") or {}).get("diff") or []
            out = []
            for d in diffs:
                p = _num(d.get("f2"))
                if p is None:
                    continue
                out.append({
                    "secid": f"{d.get('f13')}.{d.get('f12')}",
                    "symbol": str(d.get("f12") or ""),
                    "name": str(d.get("f14") or ""),
                    "price": p,
                    "pct": round(_num(d.get("f3"), 0.0) or 0.0, 2),
                    "chg": round(_num(d.get("f4"), 0.0) or 0.0, 2),
                    "amount": _num(d.get("f6"), 0.0) or 0.0,
                })
            return out

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
                fg = ex.submit(_q, "f3", "1")
                fl = ex.submit(_q, "f3", "0")
                fa = ex.submit(_q, "f6", "1")
                out = {
                    "ok": True,
                    "gainers": fg.result(),
                    "losers": fl.result(),
                    "active": fa.result(),
                    "source": "EastMoney",
                    "updated_at": int(time.time()),
                }
            self.store.cache_set(f"movers:{lim}", out, ttl=120)
            return out
        except Exception as e:
            stale = self.store.cache_get(f"movers:{lim}", allow_stale=True)
            if stale:
                return stale
            return {"ok": False, "error": str(e), "gainers": [], "losers": [], "active": []}

    def macro(self, force: bool = False) -> dict:
        if not force:
            cached = self.store.cache_get("macro")
            if cached:
                return cached

        def _treasury() -> dict:
            try:
                res = _http_json(
                    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=25",
                    timeout=9.0,
                )
                rows = (res or {}).get("data") or []
                latest_date = rows[0].get("record_date", "") if rows else ""
                items = []
                for r in rows:
                    if r.get("record_date") != latest_date:
                        continue
                    items.append({
                        "label": str(r.get("security_desc") or ""),
                        "rate": _num(r.get("avg_interest_rate_amt"), 0.0),
                        "date": latest_date,
                    })
                order_pref = ["Treasury Bills", "Treasury Notes", "Treasury Bonds", "Treasury Inflation-Protected Securities (TIPS)", "Treasury Floating Rate Notes (FRN)", "Total Marketable"]
                rank = {k: i for i, k in enumerate(order_pref)}
                items.sort(key=lambda x: rank.get(x["label"], 99))
                return {"date": latest_date, "rates": items[:8], "source": "TreasuryFiscalData"}
            except Exception:
                return {"date": "", "rates": [], "source": "TreasuryFiscalData"}

        def _frankfurter() -> dict:
            try:
                res = _http_json("https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY,EUR,JPY,GBP,HKD,CHF", timeout=8.0)
                return {"date": res.get("date", ""), "rates": res.get("rates") or {}, "source": "Frankfurter"}
            except Exception:
                return {"date": "", "rates": {}, "source": "Frankfurter"}

        def _fred_extra() -> list[dict]:
            conn = self._find_connector("fred")
            key = str((conn or {}).get("api_key") or "").strip()
            if not key:
                return []
            series = [("FEDFUNDS", "联邦基金利率"), ("DGS10", "美债10Y收益率"), ("DGS2", "美债2Y收益率"), ("CPIAUCSL", "美国CPI")]
            out = []
            for sid, lbl in series:
                try:
                    u = (
                        "https://api.stlouisfed.org/fred/series/observations?"
                        + urllib.parse.urlencode({"series_id": sid, "api_key": key, "file_type": "json", "sort_order": "desc", "limit": "2"})
                    )
                    r = _http_json(u, timeout=7.0)
                    obs = [o for o in ((r or {}).get("observations") or []) if o.get("value") not in (None, ".")]
                    if obs:
                        out.append({"id": sid, "label": lbl, "value": obs[0]["value"], "date": obs[0]["date"]})
                except Exception:
                    continue
            return out

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            ft = ex.submit(_treasury)
            ff = ex.submit(_frankfurter)
            fc = ex.submit(self._fetch_cbr_rates)
            fd = ex.submit(_fred_extra)
            out = {
                "ok": True,
                "treasury": ft.result(),
                "fx": ff.result(),
                "cbr": fc.result(),
                "fred": fd.result(),
                "updated_at": int(time.time()),
            }
        self.store.cache_set("macro", out, ttl=1800)
        return out

    def geopolitics(self, force: bool = False) -> dict:
        if not force:
            cached = self.store.cache_get("geopolitics")
            if cached:
                return cached

        def _poly(tag: str) -> list[dict]:
            try:
                url = (
                    "https://gamma-api.polymarket.com/events?"
                    + urllib.parse.urlencode({
                        "active": "true",
                        "closed": "false",
                        "limit": "8",
                        "order": "volume24hr",
                        "ascending": "false",
                        "tag_slug": tag,
                    })
                )
                events = _http_json(url, timeout=8.0)
                items = []
                for ev in (events or []):
                    mkts = ev.get("markets") or []
                    yes_pct = None
                    if mkts:
                        m0 = mkts[0]
                        raw_op = m0.get("outcomePrices")
                        try:
                            op = json.loads(raw_op) if isinstance(raw_op, str) else raw_op
                            if isinstance(op, list) and op:
                                yes_pct = round(float(op[0]) * 100.0, 1)
                        except Exception:
                            yes_pct = None
                    slug = ev.get("slug") or ""
                    items.append({
                        "id": str(ev.get("id") or slug),
                        "tag": tag,
                        "title": str(ev.get("title") or ""),
                        "yes_pct": yes_pct,
                        "volume24h": round(_num(ev.get("volume24hr"), 0.0) or 0.0, 0),
                        "url": f"https://polymarket.com/event/{slug}" if slug else "",
                    })
                return items
            except Exception:
                return []

        def _portwatch() -> list[dict]:
            pw_cache = self.store.cache_get("portwatch_chokepoints")
            if pw_cache is not None:
                return pw_cache
            try:
                url = (
                    "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query?"
                    + urllib.parse.urlencode({
                        "where": "1=1",
                        "outFields": "date,portname,n_total,n_tanker,n_container",
                        "orderByFields": "date DESC",
                        "resultRecordCount": "12",
                        "returnGeometry": "false",
                        "f": "json",
                    })
                )
                res = _http_json(url, timeout=6.0)
                if (res or {}).get("error"):
                    stale = self.store.cache_get("portwatch_chokepoints", allow_stale=True)
                    return stale or []
                feats = (res or {}).get("features") or []
                out = [f.get("attributes") for f in feats if isinstance(f, dict) and f.get("attributes")]
                if out:
                    self.store.cache_set("portwatch_chokepoints", out, ttl=21600)
                return out
            except Exception:
                return self.store.cache_get("portwatch_chokepoints", allow_stale=True) or []

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
            fg = ex.submit(_poly, "geopolitics")
            fe = ex.submit(_poly, "economy")
            fp = ex.submit(_portwatch)
            geo_items = fg.result()
            econ_items = fe.result()
            ports = fp.result()

        seen_id: set[str] = set()
        merged: list[dict] = []
        for it in geo_items + econ_items:
            if it["id"] not in seen_id:
                seen_id.add(it["id"])
                merged.append(it)
        merged.sort(key=lambda x: x.get("volume24h") or 0.0, reverse=True)

        out = {
            "ok": True,
            "events": merged[:14],
            "chokepoints": ports[:8],
            "updated_at": int(time.time()),
        }
        self.store.cache_set("geopolitics", out, ttl=600)
        return out

    def search_symbols(self, q: str) -> dict:
        qs = (q or "").strip()
        if not qs:
            return {"ok": True, "items": []}
        ql = qs.lower()
        hits: list[dict] = []
        seen: set[str] = set()
        for sid, meta in self._meta_map.items():
            if ql in sid.lower() or ql in (meta.get("symbol") or "").lower() or ql in (meta.get("name") or "").lower():
                seen.add(sid)
                hits.append({
                    "secid": sid,
                    "symbol": meta["symbol"],
                    "name": meta["name"],
                    "market": meta["group"],
                })
        # Primary: cached Tushare stock_basic (5581 A-shares)
        sb = self._ts_stock_basic()
        for tc, info in sb.items():
            if len(hits) >= 18:
                break
            if "." not in tc:
                continue
            code, suf = tc.split(".", 1)
            if suf not in ("SH", "SZ"):
                continue
            sid = f"{'1' if suf == 'SH' else '0'}.{code}"
            if sid in seen:
                continue
            if ql in tc.lower() or ql in (info.get("name") or "").lower() or ql in code.lower():
                seen.add(sid)
                hits.append({
                    "secid": sid,
                    "symbol": tc,
                    "name": info["name"],
                    "market": info.get("industry") or info.get("market") or "A股",
                })
        # Supplement via EastMoney suggest when < 8 hits (HK/US/ETF)
        if len(hits) < 8:
            try:
                url = (
                    "https://searchapi.eastmoney.com/api/suggest/get?"
                    + urllib.parse.urlencode({"input": qs, "type": "14", "count": "12"})
                )
                res = _http_json(url, headers=EM_HEADERS, timeout=6.0)
                rows = (((res or {}).get("QuotationCodeTable") or {}).get("Data") or [])
                for r in rows:
                    sid = str(r.get("QuoteID") or "").strip()
                    if not sid or sid in seen:
                        continue
                    seen.add(sid)
                    hits.append({
                        "secid": sid,
                        "symbol": str(r.get("Code") or sid),
                        "name": str(r.get("Name") or r.get("ShortName") or sid),
                        "market": str(r.get("SecurityTypeName") or r.get("Classify") or "EM"),
                    })
            except Exception:
                pass
        return {"ok": True, "items": hits[:18]}
