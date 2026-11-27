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
    {"secid": "1.600519", "symbol": "600519.SH", "name": "贵州茅台", "market_group": "cn_logistics"},
    {"secid": "0.300750", "symbol": "300750.SZ", "name": "宁德时代", "market_group": "cn_logistics"},
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
        "title": "A 股核心资产",
        "items": [
            {"secid": "1.600519", "symbol": "600519.SH", "name": "贵州茅台"},
            {"secid": "0.300750", "symbol": "300750.SZ", "name": "宁德时代"},
            {"secid": "1.601318", "symbol": "601318.SH", "name": "中国平安"},
            {"secid": "1.600036", "symbol": "600036.SH", "name": "招商银行"},
            {"secid": "0.002594", "symbol": "002594.SZ", "name": "比亚迪"},
            {"secid": "1.601899", "symbol": "601899.SH", "name": "紫金矿业"},
            {"secid": "1.601857", "symbol": "601857.SH", "name": "中国石油"},
            {"secid": "1.600900", "symbol": "600900.SH", "name": "长江电力"},
            {"secid": "0.002475", "symbol": "002475.SZ", "name": "立讯精密"},
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

    boll_list: list[dict] = []
    if n >= 20:
        for i in range(19, n):
            win = closes[i - 19 : i + 1]
            mid = sum(win) / 20.0
            var = sum((x - mid) ** 2 for x in win) / 20.0
            sd = var ** 0.5
            up = mid + 2.0 * sd
            dn = mid - 2.0 * sd
            bw = ((up - dn) / mid * 100.0) if abs(mid) > 1e-12 else 0.0
            boll_list.append({
                "time": times[i],
                "mid": round(mid, 4),
                "upper": round(up, 4),
                "lower": round(dn, 4),
                "bw": round(bw, 3),
            })

    return {
        "ma5": _ma(5),
        "ma20": _ma(20),
        "ma60": _ma(60),
        "rsi14": rsi14,
        "macd": macd_list,
        "boll": boll_list,
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
        c.execute("PRAGMA synchronous=NORMAL")
        c.execute("PRAGMA busy_timeout=15000")
        try:
            with c:
                yield c
        finally:
            c.close()

    def save_quotes(self, qmap: dict[str, dict], panel_lookup: dict[str, str] | None = None) -> None:
        if not qmap:
            return
        now = int(time.time())
        pl = panel_lookup or {}
        rows = []
        for sid, q in qmap.items():
            if not sid or not isinstance(q, dict) or q.get("price") is None:
                continue
            rows.append((
                str(sid),
                str(q.get("symbol") or sid),
                str(q.get("name") or sid),
                str(pl.get(sid) or ""),
                _num(q.get("price")),
                _num(q.get("chg"), 0.0) or 0.0,
                _num(q.get("pct"), 0.0) or 0.0,
                _num(q.get("open")),
                _num(q.get("high")),
                _num(q.get("low")),
                _num(q.get("prev_close")),
                _num(q.get("volume"), 0.0) or 0.0,
                _num(q.get("amount"), 0.0) or 0.0,
                str(q.get("source") or ""),
                str(q.get("time") or ""),
                now,
            ))
        if not rows:
            return
        try:
            with self._lock, self.con() as c:
                c.executemany(
                    """INSERT OR REPLACE INTO market_quotes
                       (secid, symbol, name, panel_id, price, chg, pct, open, high, low, prev_close,
                        volume, amount, source, quote_time, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    rows,
                )
        except Exception:
            pass

    def save_bars(self, secid: str, symbol: str, name: str, market: str, interval: str, bars: list[dict], source: str = "") -> None:
        if not bars or not symbol:
            return
        now = int(time.time())
        rows = []
        prev_c = None
        for b in bars:
            dt = str(b.get("time") or "")[:10]
            cl = _num(b.get("close"))
            if not dt or cl is None:
                continue
            pct = round((cl / prev_c - 1.0) * 100.0, 4) if prev_c and prev_c > 0 else 0.0
            prev_c = cl
            rows.append((
                symbol, secid, interval, dt, name or symbol, market or "", "",
                _num(b.get("open"), cl), _num(b.get("high"), cl), _num(b.get("low"), cl), cl,
                _num(b.get("volume"), 0.0) or 0.0, _num(b.get("amount"), 0.0) or 0.0,
                1.0, pct, source or "", now,
            ))
        if not rows:
            return
        try:
            with self._lock, self.con() as c:
                c.executemany(
                    """INSERT INTO market_bars
                       (symbol, secid, interval, trade_date, name, market, industry,
                        open, high, low, close, volume, amount, adj_factor, pct_chg, source, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(symbol, interval, trade_date) DO UPDATE SET
                         secid=CASE WHEN excluded.secid!='' THEN excluded.secid ELSE market_bars.secid END,
                         name=CASE WHEN excluded.name!='' THEN excluded.name ELSE market_bars.name END,
                         open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close,
                         volume=excluded.volume, pct_chg=excluded.pct_chg,
                         source=CASE WHEN market_bars.source='' THEN excluded.source ELSE market_bars.source END,
                         updated_at=excluded.updated_at""",
                    rows,
                )
                c.execute(
                    """INSERT INTO instruments(symbol, secid, name, market, updated_at)
                       VALUES (?,?,?,?,?)
                       ON CONFLICT(symbol) DO UPDATE SET
                         secid=CASE WHEN excluded.secid!='' THEN excluded.secid ELSE instruments.secid END,
                         name=CASE WHEN excluded.name!='' THEN excluded.name ELSE instruments.name END,
                         market=CASE WHEN excluded.market!='' THEN excluded.market ELSE instruments.market END,
                         updated_at=excluded.updated_at""",
                    (symbol, secid, name or symbol, market or "", now),
                )
        except Exception:
            pass

    def save_instruments(self, items: list[tuple]) -> None:
        if not items:
            return
        try:
            with self._lock, self.con() as c:
                c.executemany(
                    """INSERT INTO instruments(symbol, secid, ts_code, name, market, industry, updated_at)
                       VALUES (?,?,?,?,?,?,?)
                       ON CONFLICT(symbol) DO UPDATE SET
                         secid=CASE WHEN excluded.secid!='' THEN excluded.secid ELSE instruments.secid END,
                         ts_code=CASE WHEN excluded.ts_code!='' THEN excluded.ts_code ELSE instruments.ts_code END,
                         name=CASE WHEN excluded.name!='' THEN excluded.name ELSE instruments.name END,
                         market=CASE WHEN excluded.market!='' THEN excluded.market ELSE instruments.market END,
                         industry=CASE WHEN excluded.industry!='' THEN excluded.industry ELSE instruments.industry END,
                         updated_at=excluded.updated_at""",
                    items,
                )
        except Exception:
            pass

    def save_sector_snapshots(self, trade_date: str, taxonomy: str, items: list[dict], source: str, is_live: bool) -> None:
        if not items:
            return
        now = int(time.time())
        td = (trade_date or datetime.date.today().isoformat())[:10]
        rows = [
            (
                td, taxonomy, str(it.get("code") or it.get("name") or ""), str(it.get("name") or ""),
                _num(it.get("price"), 0.0) or 0.0, _num(it.get("pct"), 0.0) or 0.0,
                _num(it.get("chg"), 0.0) or 0.0, _num(it.get("mkt_cap"), 0.0) or 0.0,
                _num(it.get("amount"), 0.0) or 0.0,
                _num(it.get("net_inflow")) if it.get("net_inflow") is not None else None,
                int(it.get("up_count") or 0), int(it.get("down_count") or 0),
                int(it.get("stock_count") or 0), str(it.get("lead_stock") or ""),
                _num(it.get("lead_pct"), 0.0) or 0.0, 1 if is_live else 0, source or "", now,
            )
            for it in items
        ]
        try:
            with self._lock, self.con() as c:
                c.executemany(
                    """INSERT OR REPLACE INTO sector_snapshots
                       (trade_date, taxonomy, sector_code, sector_name, price, pct, chg,
                        mkt_cap, amount, net_inflow, up_count, down_count, stock_count,
                        lead_stock, lead_pct, is_live, source, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    rows,
                )
        except Exception:
            pass

    def save_movers_snapshots(self, trade_date: str, data: dict, source: str) -> None:
        now = int(time.time())
        td = (trade_date or datetime.date.today().isoformat())[:10]
        rows = []
        for btype in ("gainers", "losers", "active"):
            for idx, it in enumerate(data.get(btype) or [], 1):
                rows.append((
                    td, btype, idx, str(it.get("secid") or ""), str(it.get("symbol") or ""),
                    str(it.get("name") or ""), _num(it.get("price"), 0.0) or 0.0,
                    _num(it.get("pct"), 0.0) or 0.0, _num(it.get("chg"), 0.0) or 0.0,
                    _num(it.get("amount"), 0.0) or 0.0, source or "", now,
                ))
        if not rows:
            return
        try:
            with self._lock, self.con() as c:
                c.executemany(
                    """INSERT OR REPLACE INTO movers_snapshots
                       (trade_date, board_type, rank_no, secid, symbol, name, price, pct, chg, amount, source, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    rows,
                )
        except Exception:
            pass

    def save_macro_indicators(self, out: dict) -> None:
        now = int(time.time())
        rows = []
        tr = out.get("treasury") or {}
        for r in (tr.get("rates") or []):
            v = _num(r.get("rate"))
            if v is not None:
                rows.append((f"UST:{r.get('label')}", "treasury", str(r.get("label") or ""), str(r.get("date") or tr.get("date") or "")[:10], v, "%", str(tr.get("source") or ""), "{}", now))
        fx = out.get("fx") or {}
        fx_d = str(fx.get("date") or datetime.date.today().isoformat())[:10]
        for cur, val in (fx.get("rates") or {}).items():
            v = _num(val)
            if v is not None:
                rows.append((f"FX:USD/{cur}", "fx", f"USD/{cur}", fx_d, v, "", str(fx.get("source") or ""), "{}", now))
        cbr = out.get("cbr") or {}
        cbr_d = str(cbr.get("date") or datetime.date.today().isoformat())[:10]
        for k, it in (cbr.get("items") or {}).items():
            v = _num((it or {}).get("price"))
            if v is not None:
                rows.append((f"CBR:{k}", "cbr", str((it or {}).get("name") or k), cbr_d, v, "RUB", "CBR", "{}", now))
        for f in (out.get("fred") or []):
            v = _num(f.get("value"))
            if v is not None:
                rows.append((f"FRED:{f.get('id')}", "fred", str(f.get("label") or f.get("id") or ""), str(f.get("date") or "")[:10], v, "", "FRED", "{}", now))
        if not rows:
            return
        try:
            with self._lock, self.con() as c:
                c.executemany(
                    """INSERT OR REPLACE INTO macro_indicators
                       (series_id, category, label, obs_date, value, unit, source, extra_json, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?)""",
                    rows,
                )
        except Exception:
            pass

    def save_geo_events(self, events: list[dict], chokepoints: list[dict]) -> None:
        now = int(time.time())
        rows = []
        for ev in (events or []):
            eid = str(ev.get("id") or ev.get("title") or "")[:120]
            if not eid:
                continue
            rows.append((
                f"ev:{eid}", str(ev.get("tag") or "geopolitics"), str(ev.get("title") or ""),
                "", None, None, "", "", "", "Polymarket", "",
                json.dumps(ev, ensure_ascii=False), now,
            ))
        for cp in (chokepoints or []):
            pname = str(cp.get("portname") or cp.get("name") or "")
            if not pname:
                continue
            rows.append((
                f"cp:{pname}:{cp.get('date') or ''}", "chokepoint", pname, pname,
                None, None, "", "", "", "IMF PortWatch", str(cp.get("date") or ""),
                json.dumps(cp, ensure_ascii=False), now,
            ))
        if not rows:
            return
        try:
            with self._lock, self.con() as c:
                c.executemany(
                    """INSERT OR REPLACE INTO geo_events
                       (event_id, category, title, region, lat, lon, severity, status, summary, source, event_time, extra_json, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    rows,
                )
        except Exception:
            pass

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

    def pin_watchlist(self, secid: str) -> list[dict]:
        s = (secid or "").strip()
        if not s:
            return self.list_watchlist()
        with self._lock, self.con() as c:
            min_ord = c.execute("SELECT COALESCE(MIN(sort_order), 0) FROM watchlist").fetchone()[0]
            c.execute("UPDATE watchlist SET sort_order=? WHERE secid=?", (int(min_ord) - 1, s))
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
            now = int(time.time())
            ins_rows = []
            for tc, info in out.items():
                code, _, suf = tc.partition(".")
                sid = f"1.{code}" if suf == "SH" else (f"0.{code}" if suf == "SZ" else tc)
                ins_rows.append((tc, sid, tc, info["name"], "CN_STOCK", info["industry"], now))
            self.store.save_instruments(ins_rows)
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
        panel_lookup = {it["secid"]: p["id"] for p in MARKET_PANELS for it in p["items"]}
        self.store.save_quotes(qmap, panel_lookup)
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

    def _kline_local_quant_store(self, secid: str, iv: str, limit: int) -> tuple[list[dict], str, str]:
        """Read locally synced daily bars directly from unified data/o2.sqlite (market_bars)."""
        if iv not in ("1d", "1w", "1M"):
            return [], "", ""
        qdb = self.store.db_path
        if not os.path.isfile(qdb):
            return [], "", ""
        sid = (secid or "").strip()
        cand_syms = [sid]
        if "." in sid:
            mkt, code = sid.split(".", 1)
            if mkt == "1" and code.isdigit():
                cand_syms.append(f"{code}.SH")
            elif mkt == "0" and code.isdigit():
                cand_syms.append(f"{code}.SZ")
            elif mkt in ("105", "106", "107") and code:
                cand_syms.append(code.upper())
            elif mkt == "116" and code.isdigit():
                cand_syms.append(f"{int(code):04d}.HK")
        yf_s = _resolve_yf_symbol(sid)
        if yf_s and yf_s not in cand_syms:
            cand_syms.append(yf_s)
        raw_lim = limit if iv == "1d" else min(4000, limit * (6 if iv == "1w" else 24))
        try:
            with self.store.con() as con:
                ph = ",".join("?" for _ in cand_syms)
                rows = con.execute(
                    f"""SELECT trade_date, open, high, low, close, volume, name, market
                        FROM market_bars
                        WHERE interval = '1d' AND (secid = ? OR symbol IN ({ph}))
                        ORDER BY trade_date DESC LIMIT ?""",
                    [sid, *cand_syms, int(raw_lim)],
                ).fetchall()
        except Exception:
            return [], "", ""
        if len(rows) < 15:
            return [], "", ""
        rows = list(reversed(rows))
        last_d = str(rows[-1]["trade_date"] or "")[:10]
        try:
            age_days = (datetime.date.today() - datetime.date.fromisoformat(last_d)).days
            if age_days > 7:
                return [], "", ""
        except ValueError:
            pass
        bars = [
            {
                "time": str(r["trade_date"])[:10],
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": float(r["volume"] or 0.0),
            }
            for r in rows
            if r["close"] is not None
        ]
        if iv in ("1w", "1M"):
            bars = _resample_bars(bars, iv)
        nm = str(rows[-1]["name"] or "")
        return bars[-limit:], nm, "本地统一数据库"

    def kline(self, secid: str, interval: str = "1d", limit: int = 160, name: str = "", force: bool = False) -> dict:
        sid = (secid or "").strip()
        if not sid:
            raise ValueError("缺少标的代码 secid")
        lim = max(10, min(2500, int(limit or 160)))
        iv = (interval or "1d").strip()
        ck = f"kline:{sid}:{iv}:{lim}"
        data = None if force else self.store.cache_get(ck)
        if not data:
            bars: list[dict] = []
            resolved_name = name or (self._meta_map.get(sid) or {}).get("name") or sid
            source = ""
            # Prefer shared local quant warehouse (Parquet -> quant_bars.sqlite) when available and fresh!
            if not force and iv in ("1d", "1w", "1M"):
                lbars, lnm, lsrc = self._kline_local_quant_store(sid, iv, lim)
                if lbars:
                    bars = lbars
                    source = lsrc
                    if not name and lnm:
                        resolved_name = (self._meta_map.get(sid) or {}).get("name") or lnm
            mode = str(self.cfg.data.get("market_source_mode") or "auto").strip().lower()
            if not bars and sid.startswith("CBR."):
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
                if iv == "1d" and source and source != "本地统一数据库":
                    tgt_ts = _resolve_tushare_target(sid)
                    sym_store = tgt_ts[1] if tgt_ts else (_resolve_yf_symbol(sid) or sid)
                    mkt_store = "CN_STOCK" if _is_cn_secid(sid) else ("HK_STOCK" if sid.startswith("116.") else ("US_STOCK" if sid[:4] in ("105.", "106.", "107.") else "GLOBAL"))
                    self.store.save_bars(sid, sym_store, resolved_name, mkt_store, "1d", bars, source)

        markers, events = self._news_markers_for_bars(sid, data.get("name") or name or sid, data.get("bars") or [])
        return {**data, "markers": markers, "news_events": events}

    # Official 31 Shenwan 2021 Level-1 A-share industry boards (mutually exclusive, 100% coverage)
    _SW_L1_BOARDS: list[tuple[str, str]] = [
        ("BK1283", "银行"), ("BK1201", "电子"), ("BK1203", "非银金融"), ("BK1216", "医药生物"),
        ("BK1215", "通信"), ("BK1200", "电力设备"), ("BK0464", "石油石化"), ("BK1205", "机械设备"),
        ("BK0427", "公用事业"), ("BK0438", "食品饮料"), ("BK0478", "有色金属"), ("BK1211", "汽车"),
        ("BK1206", "基础化工"), ("BK1207", "计算机"), ("BK1210", "交通运输"), ("BK1204", "国防军工"),
        ("BK0437", "煤炭"), ("BK0456", "家用电器"), ("BK0486", "传媒"), ("BK1202", "房地产"),
        ("BK1209", "建筑装饰"), ("BK0433", "农林牧渔"), ("BK1213", "商贸零售"), ("BK0479", "钢铁"),
        ("BK1208", "建筑材料"), ("BK0436", "纺织服饰"), ("BK1212", "轻工制造"), ("BK1214", "社会服务"),
        ("BK0728", "环保"), ("BK1035", "美容护理"), ("BK1217", "综合"),
    ]

    def _sectors_eastmoney_sw_l1(self) -> list[dict]:
        """Fetch live real-time Shenwan Level-1 (31 industries) from EastMoney in a single request."""
        secids = ",".join(f"90.{code}" for code, _ in self._SW_L1_BOARDS)
        sw_names = {nm for _, nm in self._SW_L1_BOARDS}
        hdrs = {
            "User-Agent": USER_AGENT,
            "Referer": "https://quote.eastmoney.com/center/boardlist.html",
            "Accept": "*/*",
            "Connection": "close",
        }
        qs_ulist = urllib.parse.urlencode({
            "fltt": "2",
            "invt": "2",
            "ut": "bd1d9ddb04089700cf9c27f6f7426281",
            "fields": "f2,f3,f4,f6,f12,f14,f20,f62,f104,f105,f128,f136",
            "secids": secids,
        })
        diffs: list[dict] = []
        for host in ("push2.eastmoney.com", "82.push2.eastmoney.com", "push2delay.eastmoney.com"):
            try:
                res = _http_json(f"https://{host}/api/qt/ulist.np/get?{qs_ulist}", headers=hdrs, timeout=6.0)
                cand = ((res or {}).get("data") or {}).get("diff") or []
                if len(cand) >= 20:
                    diffs = cand
                    break
            except Exception:
                continue

        # Secondary EastMoney query: single clist page filtered strictly to Shenwan L1 names
        if not diffs:
            qs_clist = urllib.parse.urlencode({
                "pn": "1",
                "pz": "100",
                "po": "1",
                "np": "1",
                "ut": "bd1d9ddb04089700cf9c27f6f7426281",
                "fltt": "2",
                "invt": "2",
                "fid": "f20",
                "fs": "m:90+t:2+f:!50",
                "fields": "f2,f3,f4,f6,f12,f14,f20,f62,f104,f105,f128,f136",
            })
            for host in ("push2.eastmoney.com", "82.push2.eastmoney.com"):
                try:
                    res = _http_json(f"https://{host}/api/qt/clist/get?{qs_clist}", headers=hdrs, timeout=6.0)
                    raw = ((res or {}).get("data") or {}).get("diff") or []
                    dedup: dict[str, dict] = {}
                    for d in raw:
                        nm = str(d.get("f14") or "").strip()
                        if nm in sw_names:
                            prev = dedup.get(nm)
                            if not prev or (_num(d.get("f20"), 0.0) or 0.0) > (_num(prev.get("f20"), 0.0) or 0.0):
                                dedup[nm] = d
                    if len(dedup) >= 15:
                        diffs = list(dedup.values())
                        break
                except Exception:
                    continue

        items: list[dict] = []
        for d in diffs:
            nm = str(d.get("f14") or "").strip()
            if not nm:
                continue
            pct_val = _num(d.get("f3"))
            if pct_val is None:
                continue
            up_c = int(_num(d.get("f104"), 0.0) or 0)
            dn_c = int(_num(d.get("f105"), 0.0) or 0)
            inflow_raw = _num(d.get("f62"))
            items.append({
                "code": str(d.get("f12") or nm),
                "name": nm,
                "price": round(_num(d.get("f2"), 0.0) or 0.0, 2),
                "pct": round(pct_val, 2),
                "chg": round(_num(d.get("f4"), 0.0) or 0.0, 2),
                "mkt_cap": round(_num(d.get("f20"), 0.0) or 1.0, 0),
                "amount": round(_num(d.get("f6"), 0.0) or 0.0, 0),
                "net_inflow": round(inflow_raw, 0) if inflow_raw is not None else None,
                "up_count": up_c,
                "down_count": dn_c,
                "stock_count": up_c + dn_c,
                "lead_stock": str(d.get("f128") or ""),
                "lead_pct": round(_num(d.get("f136"), 0.0) or 0.0, 2),
            })
        items.sort(key=lambda x: x["mkt_cap"], reverse=True)
        return items

    def _sectors_sina_live(self) -> list[dict]:
        """Fetch live real-time industry boards from Sina Finance (reliable low-latency backup)."""
        url = "https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php"
        hdrs = {"User-Agent": USER_AGENT, "Referer": "https://finance.sina.com.cn/", "Connection": "close"}
        req = urllib.request.Request(url, headers=hdrs)
        with urllib.request.urlopen(req, timeout=7.0) as r:
            txt = r.read().decode("gbk", errors="replace")
        eq_idx = txt.find("=")
        if eq_idx < 0:
            return []
        obj = json.loads(txt[eq_idx + 1 :].strip().rstrip(";"))
        items: list[dict] = []
        for code, raw in (obj or {}).items():
            parts = str(raw).split(",")
            if len(parts) < 13:
                continue
            nm = parts[1].strip()
            cnt = int(_num(parts[2], 0.0) or 0)
            avg_px = _num(parts[3], 0.0) or 0.0
            chg = _num(parts[4], 0.0) or 0.0
            pct = _num(parts[5], 0.0) or 0.0
            amt = _num(parts[7], 0.0) or 0.0
            lead_pct = _num(parts[9], 0.0) or 0.0
            lead_nm = parts[12].strip()
            if not nm or cnt <= 0:
                continue
            # Use turnover + constituent count to produce realistic area weight when mkt_cap isn't provided
            est_cap = max(amt * 40.0, float(cnt) * 8e9, 1.0)
            items.append({
                "code": str(code),
                "name": nm,
                "price": round(avg_px, 2),
                "pct": round(pct, 2),
                "chg": round(chg, 2),
                "mkt_cap": round(est_cap, 0),
                "amount": round(amt, 0),
                "net_inflow": None,
                "up_count": 0,
                "down_count": 0,
                "stock_count": cnt,
                "lead_stock": lead_nm,
                "lead_pct": round(lead_pct, 2),
            })
        items.sort(key=lambda x: x["amount"], reverse=True)
        return items

    def sectors(self, limit: int = 36, force: bool = False) -> dict:
        lim = max(8, min(60, int(limit or 36)))
        ck = f"sectors_v2:{lim}"
        if not force:
            cached = self.store.cache_get(ck)
            if cached:
                return cached

        now_ts = int(time.time())
        today_iso = datetime.date.today().isoformat()
        now_hm = datetime.datetime.now().strftime("%H:%M")

        # Priority 1: Live real-time EastMoney 31 Shenwan Level-1 industries (mutually exclusive + real net inflow)
        try:
            em_items = self._sectors_eastmoney_sw_l1()
            if em_items:
                out = {
                    "ok": True,
                    "items": em_items[:lim],
                    "source": "申万一级",
                    "taxonomy": "sw_l1",
                    "is_live": True,
                    "trade_date": today_iso,
                    "quote_time": now_hm,
                    "updated_at": now_ts,
                }
                self.store.cache_set(ck, out, ttl=45)
                self.store.save_sector_snapshots(today_iso, "sw_l1", em_items[:lim], "EastMoney·申万一级", True)
                return out
        except Exception:
            pass

        # Priority 2: Live real-time Sina Finance industry boards
        try:
            sina_items = self._sectors_sina_live()
            if sina_items:
                out = {
                    "ok": True,
                    "items": sina_items[:lim],
                    "source": "新浪行业",
                    "taxonomy": "sina_hy",
                    "is_live": True,
                    "trade_date": today_iso,
                    "quote_time": now_hm,
                    "updated_at": now_ts,
                }
                self.store.cache_set(ck, out, ttl=45)
                self.store.save_sector_snapshots(today_iso, "sina_hy", sina_items[:lim], "Sina·实时行业", True)
                return out
        except Exception:
            pass

        # Priority 3: Offline EOD fallback via Tushare daily + daily_basic (honestly marked EOD, no fake net_inflow)
        try:
            td = self._ts_latest_trade_date()
            if td:
                with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
                    f_sb = ex.submit(self._ts_stock_basic)
                    f_dl = ex.submit(self._ts_call, "daily", {"trade_date": td}, "ts_code,close,pct_chg,amount", 10.0)
                    f_db = ex.submit(self._ts_call, "daily_basic", {"trade_date": td}, "ts_code,circ_mv,total_mv", 10.0)
                    sb = f_sb.result()
                    dl_rows = f_dl.result()
                    db_rows = f_db.result()
                if sb and dl_rows:
                    mv_map = {
                        str(r["ts_code"]): (_num(r.get("circ_mv"), 0.0) or _num(r.get("total_mv"), 0.0) or 0.0)
                        for r in (db_rows or [])
                        if r.get("ts_code")
                    }
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
                        b = agg.setdefault(ind, {"w_sum": 0.0, "w_pct": 0.0, "mkt_cap": 0.0, "cnt": 0, "up": 0, "dn": 0, "amt": 0.0, "lead_nm": "", "lead_pct": -999.0})
                        b["w_sum"] += w
                        b["w_pct"] += w * pct
                        b["mkt_cap"] += mv if mv > 0 else amt
                        b["amt"] += amt
                        b["cnt"] += 1
                        if pct > 0:
                            b["up"] += 1
                        elif pct < 0:
                            b["dn"] += 1
                        if pct > b["lead_pct"]:
                            b["lead_pct"] = pct
                            b["lead_nm"] = info.get("name") or tc
                    items = []
                    for ind, b in agg.items():
                        if b["cnt"] == 0 or b["w_sum"] <= 0:
                            continue
                        pct_avg = b["w_pct"] / b["w_sum"]
                        items.append({
                            "code": ind,
                            "name": ind,
                            "price": 0.0,
                            "pct": round(pct_avg, 2),
                            "chg": round(pct_avg, 2),
                            "mkt_cap": round(b["mkt_cap"], 0) or 1.0,
                            "amount": round(b["amt"], 0),
                            "net_inflow": None,
                            "up_count": b["up"],
                            "down_count": b["dn"],
                            "stock_count": b["cnt"],
                            "lead_stock": b["lead_nm"],
                            "lead_pct": round(b["lead_pct"], 2) if b["lead_pct"] > -900 else 0.0,
                        })
                    items.sort(key=lambda x: x["mkt_cap"], reverse=True)
                    if items:
                        td_iso = _iso_date(td)
                        out = {
                            "ok": True,
                            "items": items[:lim],
                            "source": f"Tushare 收盘 {td_iso}",
                            "taxonomy": "ts_ind",
                            "is_live": False,
                            "trade_date": td_iso,
                            "quote_time": td_iso,
                            "updated_at": now_ts,
                        }
                        self.store.cache_set(ck, out, ttl=300)
                        self.store.save_sector_snapshots(td_iso, "ts_ind", items[:lim], "Tushare·收盘", False)
                        return out
        except Exception:
            pass

        stale = self.store.cache_get(ck, allow_stale=True)
        if stale:
            return stale
        return {"ok": False, "error": "暂无法获取行业板块行情", "items": []}

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
                    self.store.save_movers_snapshots(_iso_date(td), out, "Tushare")
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
            self.store.save_movers_snapshots(datetime.date.today().isoformat(), out, "EastMoney")
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
            series = [
                ("FEDFUNDS", "联邦基金利率"),
                ("SOFR", "SOFR隔夜利率"),
                ("DGS10", "美债10Y收益率"),
                ("DGS2", "美债2Y收益率"),
                ("T10Y2Y", "美债10Y-2Y利差"),
                ("VIXCLS", "VIX恐慌指数"),
                ("WALCL", "美联储总资产(百万$)"),
                ("WTREGEN", "财政部TGA账户(百万$)"),
                ("RRPONTSYD", "隔夜逆回购RRP(十亿$)"),
                ("CPIAUCSL", "美国CPI"),
            ]
            out = []
            raw_map: dict[str, float] = {}
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
                        fv = _num(obs[0]["value"])
                        if fv is not None:
                            raw_map[sid] = fv
                except Exception:
                    continue
            if "WALCL" in raw_map and "WTREGEN" in raw_map:
                rrp_mn = (raw_map.get("RRPONTSYD") or 0.0) * 1000.0
                net_liq_tn = (raw_map["WALCL"] - raw_map["WTREGEN"] - rrp_mn) / 1e6
                out.insert(0, {
                    "id": "NET_LIQ",
                    "label": "美元净流动性(万亿$)",
                    "value": f"{net_liq_tn:.3f}",
                    "date": out[0]["date"] if out else "",
                })
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
        self.store.save_macro_indicators(out)
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
        self.store.save_geo_events(out["events"], out["chokepoints"])
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

    def quant_analytics(self, action: str, qs: dict) -> dict:
        act = (action or "barcode").strip().lower()
        force = (qs.get("force") or ["0"])[0] in ("1", "true", "yes")

        if act == "rebased":
            raw_sids = (qs.get("secids") or ["0.399300,1.600519,0.300750,1.601318"])[0]
            sids = [s.strip() for s in raw_sids.split(",") if s.strip()][:6]
            try:
                limit = max(20, min(250, int((qs.get("limit") or ["90"])[0] or 90)))
            except ValueError:
                limit = 90
            ckey = f"quant:rebased:{','.join(sids)}:{limit}"
            if not force:
                cached = self.store.cache_get(ckey)
                if cached:
                    return cached

            def _pull(sid: str):
                return sid, self.kline(sid, interval="1d", limit=limit, force=False)

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(6, max(1, len(sids)))) as ex:
                fetched = dict(ex.map(lambda s: _pull(s), sids))

            series_out = []
            all_dates: set[str] = set()
            maps: list[tuple[str, str, dict[str, float]]] = []
            for sid in sids:
                kl = fetched.get(sid) or {}
                bars = kl.get("bars") or []
                if len(bars) < 5:
                    continue
                mp = {b["time"]: float(b["close"]) for b in bars if b.get("time") and b.get("close")}
                all_dates.update(mp.keys())
                maps.append((sid, kl.get("name") or sid, mp))
            dates = sorted(all_dates)[-limit:]
            for sid, nm, mp in maps:
                base_val = None
                vals = []
                for d in dates:
                    v = mp.get(d)
                    if v is not None and base_val is None and v > 0:
                        base_val = v
                    if v is not None and base_val:
                        vals.append(round((v / base_val - 1.0) * 100.0, 2))
                    else:
                        vals.append(None)
                last_v = next((x for x in reversed(vals) if x is not None), 0.0)
                series_out.append({"secid": sid, "name": nm, "values": vals, "latest_pct": last_v})
            out = {"ok": True, "dates": dates, "series": series_out, "updated_at": int(time.time())}
            self.store.cache_set(ckey, out, ttl=300)
            return out

        if act == "formula":
            preset = (qs.get("preset") or ["gold_oil"])[0].strip()
            PRESET_SPECS = {
                "gold_oil": ("101.GC00Y", "102.CL00Y", "ratio", 1.0, "金油比 (COMEX黄金 / WTI原油)", "飙升反映滞胀/避险升温，回落反映实体需求扩张"),
                "copper_gold": ("101.HG00Y", "101.GC00Y", "ratio", 1000.0, "铜金比×1000 (铜 / 黄金)", "全球制造业景气与长端美债利率领先风向标"),
                "gold_silver": ("101.GC00Y", "101.SI00Y", "ratio", 1.0, "金银比 (COMEX黄金 / 白银)", "衡量贵金属避险溢价与工业复苏弹性"),
                "csi_bond": ("1.510300", "1.511090", "ratio", 100.0, "股债强弱比 (沪深300ETF / 30年国债ETF)", "A股股债性价比实时高频代理：低分位=股票偏低估，高分位=债券更具性价比"),
                "us_cn_tech": ("100.NDX", "124.HSTECH", "ratio", 1.0, "纳指100 / 恒生科技比值", "中美科技成长资产估值剪刀差与资金偏好"),
                "ship_oil": ("1.601919", "112.B00Y", "ratio", 10.0, "航运/布油比 (中远海控×10 / 布伦特原油)", "衡量集运相对燃油成本端定价"),
            }
            if preset in PRESET_SPECS:
                sid_a, sid_b, op, scale, title, hint_desc = PRESET_SPECS[preset]
            else:
                sid_a = (qs.get("secid_a") or ["101.GC00Y"])[0].strip()
                sid_b = (qs.get("secid_b") or ["102.CL00Y"])[0].strip()
                op = (qs.get("op") or ["ratio"])[0].strip()
                scale = 1.0
                title = f"{sid_a} {'/' if op == 'ratio' else '-'} {sid_b}"
                hint_desc = "自定义跨资产合成序列与历史分位通道"

            ckey = f"quant:formula:{preset}:{sid_a}:{sid_b}:{op}"
            if not force:
                cached = self.store.cache_get(ckey)
                if cached:
                    return cached

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
                fa = ex.submit(self.kline, sid_a, "1d", 240, "", False)
                fb = ex.submit(self.kline, sid_b, "1d", 240, "", False)
                kla, klb = fa.result(), fb.result()

            mpa = {b["time"]: float(b["close"]) for b in (kla.get("bars") or []) if b.get("close")}
            mpb = {b["time"]: float(b["close"]) for b in (klb.get("bars") or []) if b.get("close")}
            common = sorted(set(mpa.keys()) & set(mpb.keys()))
            dates, vals = [], []
            for d in common:
                va, vb = mpa[d], mpb[d]
                if op == "spread":
                    v = (va - vb) * scale
                else:
                    if abs(vb) < 1e-9:
                        continue
                    v = (va / vb) * scale
                dates.append(d)
                vals.append(round(v, 4))

            if not vals:
                return {"ok": False, "error": "缺少重叠历史K线数据", "dates": [], "values": []}

            mean = sum(vals) / len(vals)
            sd = (sum((x - mean) ** 2 for x in vals) / len(vals)) ** 0.5
            cur = vals[-1]
            pct_rank = round(sum(1 for x in vals if x <= cur) / len(vals) * 100.0, 1)
            zscore = round((cur - mean) / sd, 2) if sd > 1e-9 else 0.0
            out = {
                "ok": True,
                "preset": preset,
                "title": title,
                "desc": hint_desc,
                "dates": dates,
                "values": vals,
                "latest": round(cur, 4),
                "percentile": pct_rank,
                "zscore": zscore,
                "std": round(sd, 4),
                "mean": round(mean, 4),
                "up1": round(mean + sd, 4),
                "dn1": round(mean - sd, 4),
                "up2": round(mean + 2.0 * sd, 4),
                "dn2": round(mean - 2.0 * sd, 4),
                "updated_at": int(time.time()),
            }
            self.store.cache_set(ckey, out, ttl=600)
            return out

        if act == "barcode":
            raw_sids = (qs.get("secids") or [""])[0].strip()
            custom_sids = [s.strip() for s in raw_sids.split(",") if s.strip()][:20]
            ckey = f"quant:barcode:v2:{','.join(custom_sids)}" if custom_sids else "quant:barcode:v2:default"
            if not force:
                cached = self.store.cache_get(ckey)
                if cached:
                    return cached

            if custom_sids:
                TARGETS = []
                for sid in custom_sids:
                    meta = self._meta_map.get(sid) or {}
                    TARGETS.append((sid, meta.get("name") or sid, meta.get("group") or "自选标的"))
            else:
                TARGETS = [
                    ("0.399300", "沪深300", "A股核心"),
                    ("0.399006", "创业板指", "A股成长"),
                    ("124.HSTECH", "恒生科技", "港股科技"),
                    ("100.SPX", "标普500", "美股核心"),
                    ("100.NDX", "纳斯达克100", "全球科技"),
                    ("1.511090", "中国30Y国债ETF", "国内利率"),
                    ("105.TLT", "美债20Y+ ETF", "美元久期"),
                    ("100.UDI", "美元指数 DXY", "全球流动性"),
                    ("133.USDCNH", "USD/CNH 离岸人民币", "跨境汇率"),
                    ("101.GC00Y", "COMEX 黄金", "避险信用"),
                    ("112.B00Y", "布伦特原油", "能源通胀"),
                    ("101.HG00Y", "COMEX 铜", "工业景气"),
                    ("1.600519", "贵州茅台", "A股消费"),
                    ("CG.bitcoin", "Bitcoin", "风险流动性"),
                ]

            def _calc_one(item):
                sid, nm, cat = item
                try:
                    kl = self.kline(sid, "1d", 200, nm if nm != sid else "", False)
                    bars = kl.get("bars") or []
                    closes = [float(b["close"]) for b in bars if b.get("close") is not None]
                    if len(closes) < 15:
                        return None
                    cur = closes[-1]
                    pr = round(sum(1 for x in closes if x <= cur) / len(closes) * 100.0, 1)
                    rsi_list = ((kl.get("indicators") or {}).get("rsi14") or [])
                    rsi_v = rsi_list[-1]["value"] if rsi_list else 50.0
                    zone = "hot" if pr >= 88 else ("warm" if pr >= 70 else ("ice" if pr <= 12 else ("cool" if pr <= 30 else "neutral")))
                    real_nm = kl.get("name") or nm
                    return {
                        "secid": sid,
                        "name": real_nm,
                        "category": cat,
                        "price": cur,
                        "pct": kl.get("pct") or 0.0,
                        "percentile": pr,
                        "rsi14": rsi_v,
                        "zone": zone,
                    }
                except Exception:
                    return None

            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
                rows = [r for r in ex.map(_calc_one, TARGETS) if r]

            if not custom_sids:
                for preset_id, lbl, cat in [("gold_oil", "金油比 (滞胀温度)", "跨资产因子"), ("csi_bond", "股债性价比代理", "跨资产因子")]:
                    try:
                        fm = self.quant_analytics("formula", {"preset": [preset_id]})
                        if fm.get("ok"):
                            pr = fm["percentile"]
                            zone = "hot" if pr >= 88 else ("warm" if pr >= 70 else ("ice" if pr <= 12 else ("cool" if pr <= 30 else "neutral")))
                            rows.append({
                                "secid": preset_id,
                                "name": lbl,
                                "category": cat,
                                "price": fm["latest"],
                                "pct": 0.0,
                                "percentile": pr,
                                "rsi14": 50.0,
                                "zone": zone,
                            })
                    except Exception:
                        pass

            rows.sort(key=lambda x: x["percentile"], reverse=True)
            out = {"ok": True, "items": rows, "window_days": 200, "updated_at": int(time.time())}
            self.store.cache_set(ckey, out, ttl=600)
            return out

        if act == "analog":
            sid = (qs.get("secid") or ["0.399300"])[0].strip()
            win = 30
            fwd = 20
            ckey = f"quant:analog:{sid}:{win}:{fwd}"
            if not force:
                cached = self.store.cache_get(ckey)
                if cached:
                    return cached

            kl = self.kline(sid, "1d", 500, "", False)
            bars = kl.get("bars") or []
            if len(bars) < win * 2 + fwd + 5:
                return {"ok": False, "error": "历史K线样本不足以匹配历史剧本（需至少 90 根日线）"}

            closes = [float(b["close"]) for b in bars]
            dates = [b["time"] for b in bars]
            cur_seg = closes[-win:]
            c0 = cur_seg[0] or 1.0
            cur_norm = [(x / c0 - 1.0) * 100.0 for x in cur_seg]
            c_mean = sum(cur_norm) / win
            c_cent = [x - c_mean for x in cur_norm]
            c_norm_len = (sum(x * x for x in c_cent) ** 0.5) or 1e-9

            cands = []
            last_valid_start = len(closes) - win - fwd - 5
            for s in range(0, last_valid_start):
                seg = closes[s : s + win]
                s0 = seg[0]
                if not s0 or s0 <= 0:
                    continue
                sn = [(x / s0 - 1.0) * 100.0 for x in seg]
                sm = sum(sn) / win
                sc = [x - sm for x in sn]
                slen = (sum(x * x for x in sc) ** 0.5)
                if slen < 1e-9:
                    continue
                corr = sum(a * b for a, b in zip(c_cent, sc)) / (c_norm_len * slen)
                cands.append((corr, s))

            cands.sort(key=lambda x: x[0], reverse=True)
            picked = []
            for corr, s in cands:
                if any(abs(s - ps) < win // 2 for _, ps in picked):
                    continue
                picked.append((corr, s))
                if len(picked) >= 3:
                    break

            analogs = []
            cur_last_base = cur_norm[-1]
            for corr, s in picked:
                full = closes[s : s + win + fwd]
                f0 = full[0]
                curve = [round((x / f0 - 1.0) * 100.0, 2) for x in full]
                shift = cur_last_base - curve[win - 1]
                aligned = curve[:win] + [round(x + shift, 2) for x in curve[win:]]
                fwd_ret = round((full[-1] / full[win - 1] - 1.0) * 100.0, 2) if full[win - 1] else 0.0
                analogs.append({
                    "period": f"{dates[s]} ~ {dates[s + win - 1]}",
                    "similarity": round(max(0.0, corr) * 100.0, 1),
                    "forward_20d_pct": fwd_ret,
                    "path": aligned,
                })

            avg_fwd = []
            if analogs:
                for k in range(win + fwd):
                    if k < win - 1:
                        avg_fwd.append(None)
                    else:
                        avg_fwd.append(round(sum(a["path"][k] for a in analogs) / len(analogs), 2))

            x_labels = [dates[-win + i] for i in range(win)] + [f"T+{i}" for i in range(1, fwd + 1)]
            out = {
                "ok": True,
                "secid": sid,
                "name": kl.get("name") or sid,
                "window": win,
                "forward": fwd,
                "labels": x_labels,
                "current": [round(x, 2) for x in cur_norm] + [None] * fwd,
                "analogs": analogs,
                "avg_projection": avg_fwd,
                "updated_at": int(time.time()),
            }
            self.store.cache_set(ckey, out, ttl=600)
            return out

        if act == "factors":
            sid = (qs.get("secid") or ["0.399300"])[0].strip()
            pack = (qs.get("factor_pack") or ["oversold_reversal"])[0].strip()
            ckey = f"quant:factors:{sid}:{pack}"
            if not force:
                cached = self.store.cache_get(ckey)
                if cached:
                    return cached

            PACK_META = {
                "oversold_reversal": ("冰点恐慌反转因子包", "RSI14 < 34 且收盘触及/跌破布林下轨附近，捕捉恐慌出清后的均值回归"),
                "squeeze_breakout": ("波动压缩突破因子包", "布林带宽收敛后放量站上20日均线，捕捉蓄势主升拐点"),
                "macd_golden_trend": ("趋势金叉共振因子包", "MACD柱由负转正且收盘位于MA20之上，捕捉顺势加速段"),
                "liquidity_impulse": ("放量异动脉冲因子包", "单日成交量 > 20日均量1.7倍且单日涨幅 > 1.8%，追踪增量资金点火"),
            }
            p_title, p_desc = PACK_META.get(pack, PACK_META["oversold_reversal"])
            kl = self.kline(sid, "1d", 420, "", False)
            bars = kl.get("bars") or []
            if len(bars) < 45:
                return {"ok": False, "error": "历史K线不足以回测该事件因子包"}

            ind = kl.get("indicators") or {}
            rsi_map = {x["time"]: x["value"] for x in (ind.get("rsi14") or [])}
            boll_map = {x["time"]: x for x in (ind.get("boll") or [])}
            macd_map = {x["time"]: x for x in (ind.get("macd") or [])}
            ma20_map = {x["time"]: x["value"] for x in (ind.get("ma20") or [])}

            trig_indices: list[int] = []
            last_trig = -10
            for i in range(22, len(bars)):
                if i - last_trig < 5:
                    continue
                b = bars[i]
                t = b["time"]
                c = float(b["close"])
                prev_c = float(bars[i - 1]["close"])
                matched = False
                if pack == "oversold_reversal":
                    rv = rsi_map.get(t, 50.0)
                    bl = boll_map.get(t)
                    if rv < 35.0 and bl and c <= bl["lower"] * 1.012:
                        matched = True
                elif pack == "squeeze_breakout":
                    bl = boll_map.get(t)
                    bws = [boll_map[bars[j]["time"]]["bw"] for j in range(max(20, i - 40), i) if bars[j]["time"] in boll_map]
                    if bl and bws:
                        bw_thr = sorted(bws)[max(0, int(len(bws) * 0.35) - 1)]
                        if bl["bw"] <= bw_thr * 1.15 and c > bl["mid"] and prev_c <= bl["mid"]:
                            matched = True
                elif pack == "macd_golden_trend":
                    mc = macd_map.get(t)
                    mc_prev = macd_map.get(bars[i - 1]["time"])
                    m20 = ma20_map.get(t)
                    if mc and mc_prev and m20 and mc_prev["hist"] <= 0 < mc["hist"] and c >= m20:
                        matched = True
                else:
                    vols = [float(bars[j].get("volume") or 0.0) for j in range(i - 20, i)]
                    avg_v = sum(vols) / 20.0 if vols else 0.0
                    pct_d = (c / prev_c - 1.0) * 100.0 if prev_c else 0.0
                    if avg_v > 0 and float(b.get("volume") or 0.0) >= avg_v * 1.7 and pct_d >= 1.8:
                        matched = True

                if matched:
                    trig_indices.append(i)
                    last_trig = i

            offsets = list(range(-5, 21))
            paths = []
            for idx in trig_indices:
                if idx - 5 < 0 or idx + 20 >= len(bars):
                    continue
                base_c = float(bars[idx]["close"]) or 1.0
                paths.append([round((float(bars[idx + off]["close"]) / base_c - 1.0) * 100.0, 2) for off in offsets])

            mean_curve, p25_curve, p75_curve = [], [], []
            for col_i in range(len(offsets)):
                col = sorted(p[col_i] for p in paths) if paths else [0.0]
                mean_curve.append(round(sum(col) / len(col), 2))
                p25_curve.append(round(col[max(0, int(len(col) * 0.25))], 2))
                p75_curve.append(round(col[min(len(col) - 1, int(len(col) * 0.75))], 2))

            def _stat_at(day_ahead: int) -> dict:
                ci = offsets.index(day_ahead)
                vals = [p[ci] for p in paths]
                if not vals:
                    return {"win_rate": 0.0, "avg": 0.0}
                wins = sum(1 for v in vals if v > 0)
                return {
                    "win_rate": round(wins / len(vals) * 100.0, 1),
                    "avg": round(sum(vals) / len(vals), 2),
                }

            triggers = [
                {"time": bars[idx]["time"], "price": bars[idx]["close"]}
                for idx in trig_indices[-18:]
            ]
            out = {
                "ok": True,
                "secid": sid,
                "name": kl.get("name") or sid,
                "factor_pack": pack,
                "title": p_title,
                "desc": p_desc,
                "sample_count": len(paths),
                "total_triggers": len(trig_indices),
                "triggers": triggers,
                "labels": [f"T{o:+d}" if o != 0 else "T0(触发)" for o in offsets],
                "mean_curve": mean_curve,
                "p25_curve": p25_curve,
                "p75_curve": p75_curve,
                "stats": {"t5": _stat_at(5), "t10": _stat_at(10), "t20": _stat_at(20)},
                "updated_at": int(time.time()),
            }
            self.store.cache_set(ckey, out, ttl=600)
            return out

        if act == "macro_regime":
            ckey = "quant:macro_regime:v1"
            if not force:
                cached = self.store.cache_get(ckey)
                if cached:
                    return cached

            probes = [
                ("101.HG00Y", "COMEX铜"),
                ("101.GC00Y", "COMEX黄金"),
                ("112.B00Y", "布伦特原油"),
                ("100.SPX", "标普500"),
                ("0.399300", "沪深300"),
                ("100.UDI", "美元指数"),
                ("105.TLT", "美债20Y+"),
            ]

            def _pull_m(item):
                sid, nm = item
                try:
                    kl = self.kline(sid, "1d", 90, nm, False)
                    bars = kl.get("bars") or []
                    closes = [float(b["close"]) for b in bars if b.get("close")]
                    if len(closes) < 22:
                        return sid, None
                    c_now = closes[-1]
                    c_20 = closes[-21] if len(closes) >= 21 else closes[0]
                    c_60 = closes[-61] if len(closes) >= 61 else closes[0]
                    r20 = (c_now / c_20 - 1.0) * 100.0 if c_20 else 0.0
                    r60 = (c_now / c_60 - 1.0) * 100.0 if c_60 else 0.0
                    return sid, {
                        "secid": sid,
                        "name": kl.get("name") or nm,
                        "price": c_now,
                        "pct": float(kl.get("pct") or 0.0),
                        "r20": round(r20, 2),
                        "r60": round(r60, 2),
                    }
                except Exception:
                    return sid, None

            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
                res_map = dict(ex.map(_pull_m, probes))

            def _mom(sid: str) -> float:
                d = res_map.get(sid)
                if not d:
                    return 0.0
                return 0.6 * d["r20"] + 0.4 * d["r60"]

            cu_m = _mom("101.HG00Y")
            au_m = _mom("101.GC00Y")
            oil_m = _mom("112.B00Y")
            spx_m = _mom("100.SPX")
            csi_m = _mom("0.399300")
            dxy_m = _mom("100.UDI")
            tlt_m = _mom("105.TLT")

            def _clamp100(v: float) -> float:
                return round(max(-100.0, min(100.0, v)), 1)

            # Growth: Copper-Gold momentum + Global equity blend
            growth_score = _clamp100(((cu_m - au_m) * 0.55 + (spx_m * 0.25 + csi_m * 0.20)) * 5.2)
            # Inflation: Brent oil + Gold + Copper commodity pulse
            inflation_score = _clamp100((oil_m * 0.50 + au_m * 0.30 + cu_m * 0.20) * 4.8)
            # Liquidity: TLT up (yields down) + DXY down (weak dollar)
            liquidity_score = _clamp100((tlt_m * 0.55 - dxy_m * 0.65) * 6.0)

            if growth_score >= 0 and inflation_score < 0:
                regime, r_lbl, playbook = "recovery", "复苏期 (Goldilocks)", "顺周期权益 · 科技成长 · 信用债"
            elif growth_score >= 0 and inflation_score >= 0:
                regime, r_lbl, playbook = "overheat", "过热期 (Reflation)", "大宗商品 · 能源有色 · 价值周期"
            elif growth_score < 0 and inflation_score >= 0:
                regime, r_lbl, playbook = "stagflation", "滞胀期 (Stagflation)", "黄金避险 · 能源上游 · 现金短久期"
            else:
                regime, r_lbl, playbook = "recession", "衰退期 (Deflation)", "长久期国债 · 高股息红利 · 黄金"

            signals = [res_map[s] for s, _ in probes if res_map.get(s)]
            out = {
                "ok": True,
                "regime": regime,
                "regime_label": r_lbl,
                "playbook": playbook,
                "growth_score": growth_score,
                "inflation_score": inflation_score,
                "liquidity_score": liquidity_score,
                "signals": signals,
                "updated_at": int(time.time()),
            }
            self.store.cache_set(ckey, out, ttl=600)
            return out

        if act == "correlation":
            group = (qs.get("group") or ["macro_core"])[0].strip()
            raw_sids = (qs.get("secids") or [""])[0].strip()
            try:
                limit = max(25, min(180, int((qs.get("limit") or ["60"])[0] or 60)))
            except ValueError:
                limit = 60

            CORR_GROUPS = {
                "macro_core": ["0.399300", "100.SPX", "105.TLT", "101.GC00Y", "112.B00Y", "100.UDI"],
                "global_eq": ["0.399300", "0.399006", "124.HSTECH", "100.SPX", "100.NDX", "1.600519"],
                "tech_leaders": ["105.NVDA", "105.MSFT", "116.00700", "0.300750", "100.NDX", "124.HSTECH"],
            }
            if raw_sids:
                sids = [s.strip() for s in raw_sids.split(",") if s.strip()][:7]
            else:
                sids = CORR_GROUPS.get(group, CORR_GROUPS["macro_core"])

            ckey = f"quant:corr:{group}:{','.join(sids)}:{limit}"
            if not force:
                cached = self.store.cache_get(ckey)
                if cached:
                    return cached

            def _pull_c(sid: str):
                try:
                    kl = self.kline(sid, "1d", limit + 15, "", False)
                    bars = kl.get("bars") or []
                    rets = {}
                    for i in range(1, len(bars)):
                        c0 = float(bars[i - 1].get("close") or 0)
                        c1 = float(bars[i].get("close") or 0)
                        if c0 > 0 and c1 > 0:
                            rets[bars[i]["time"]] = (c1 / c0) - 1.0
                    return sid, (kl.get("name") or sid), rets
                except Exception:
                    return sid, sid, {}

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(6, max(1, len(sids)))) as ex:
                pulled = list(ex.map(_pull_c, sids))

            valid = [(s, nm, rm) for s, nm, rm in pulled if len(rm) >= 12]
            if len(valid) < 2:
                return {"ok": False, "error": "有效资产样本不足，无法计算相关性矩阵"}

            n = len(valid)
            names = [x[1] for x in valid]
            secids_out = [x[0] for x in valid]
            matrix = []
            pair_list = []

            def _pearson(m1: dict, m2: dict) -> float:
                common = sorted(set(m1.keys()) & set(m2.keys()))[-limit:]
                if len(common) < 8:
                    return 0.0
                xs = [m1[d] for d in common]
                ys = [m2[d] for d in common]
                mx = sum(xs) / len(xs)
                my = sum(ys) / len(ys)
                num = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
                dx = sum((a - mx) ** 2 for a in xs) ** 0.5
                dy = sum((b - my) ** 2 for b in ys) ** 0.5
                if dx < 1e-12 or dy < 1e-12:
                    return 0.0
                return round(max(-1.0, min(1.0, num / (dx * dy))), 2)

            abs_corrs = []
            for i in range(n):
                for j in range(n):
                    c_val = 1.0 if i == j else _pearson(valid[i][2], valid[j][2])
                    matrix.append([i, j, c_val])
                    if j > i:
                        abs_corrs.append(abs(c_val))
                        pair_list.append({"a": names[i], "b": names[j], "corr": c_val})

            pair_list.sort(key=lambda x: x["corr"])
            avg_abs = round(sum(abs_corrs) / len(abs_corrs), 2) if abs_corrs else 0.0
            out = {
                "ok": True,
                "group": group,
                "limit": limit,
                "names": names,
                "secids": secids_out,
                "matrix": matrix,
                "avg_abs_corr": avg_abs,
                "best_hedge": pair_list[0] if pair_list else None,
                "most_crowded": pair_list[-1] if pair_list else None,
                "updated_at": int(time.time()),
            }
            self.store.cache_set(ckey, out, ttl=600)
            return out

        if act == "risk_metrics":
            sid = (qs.get("secid") or ["0.399300"])[0].strip()
            try:
                limit = max(60, min(360, int((qs.get("limit") or ["240"])[0] or 240)))
            except ValueError:
                limit = 240
            ckey = f"quant:risk:{sid}:{limit}"
            if not force:
                cached = self.store.cache_get(ckey)
                if cached:
                    return cached

            kl = self.kline(sid, "1d", limit, "", False)
            bars = kl.get("bars") or []
            if len(bars) < 25:
                return {"ok": False, "error": "历史 K 线不足，无法计算波动率与回撤指标"}

            dates = [b["time"] for b in bars]
            closes = [float(b["close"]) for b in bars]
            rets = [(closes[i] / closes[i - 1] - 1.0) for i in range(1, len(closes)) if closes[i - 1] > 0]

            peak = closes[0]
            dd_curve = []
            max_dd = 0.0
            max_dd_date = dates[0]
            for dt, c in zip(dates, closes):
                if c > peak:
                    peak = c
                dd = (c / peak - 1.0) * 100.0 if peak > 0 else 0.0
                dd_r = round(dd, 2)
                dd_curve.append(dd_r)
                if dd_r < max_dd:
                    max_dd = dd_r
                    max_dd_date = dt

            def _ann_vol(arr: list[float]) -> float:
                if len(arr) < 5:
                    return 0.0
                m = sum(arr) / len(arr)
                var = sum((x - m) ** 2 for x in arr) / max(1, len(arr) - 1)
                return round((var ** 0.5) * (252.0 ** 0.5) * 100.0, 1)

            vol_20 = _ann_vol(rets[-20:])
            vol_60 = _ann_vol(rets[-60:])
            vol_all = _ann_vol(rets)
            sorted_rets = sorted(rets)
            var95_idx = max(0, int(len(sorted_rets) * 0.05))
            var_95 = round(sorted_rets[var95_idx] * 100.0, 2) if sorted_rets else 0.0

            total_ret = round((closes[-1] / closes[0] - 1.0) * 100.0, 2) if closes[0] > 0 else 0.0
            ann_ret = ((closes[-1] / closes[0]) ** (252.0 / max(1, len(rets))) - 1.0) * 100.0 if closes[0] > 0 else 0.0
            sharpe = round((ann_ret - 2.0) / vol_all, 2) if vol_all > 0.1 else 0.0
            calmar = round(ann_ret / abs(max_dd), 2) if abs(max_dd) > 0.5 else 0.0
            win_days = round(sum(1 for x in rets if x > 0) / max(1, len(rets)) * 100.0, 1)

            out = {
                "ok": True,
                "secid": sid,
                "name": kl.get("name") or sid,
                "price": closes[-1],
                "pct": float(kl.get("pct") or 0.0),
                "dates": dates,
                "drawdown_curve": dd_curve,
                "max_drawdown": max_dd,
                "max_dd_date": max_dd_date,
                "current_drawdown": dd_curve[-1] if dd_curve else 0.0,
                "vol_20d": vol_20,
                "vol_60d": vol_60,
                "vol_ann": vol_all,
                "var_95": var_95,
                "sharpe": sharpe,
                "calmar": calmar,
                "total_ret": total_ret,
                "win_days_pct": win_days,
                "updated_at": int(time.time()),
            }
            self.store.cache_set(ckey, out, ttl=300)
            return out

        if act == "style_rotation":
            ckey = "quant:style_rotation:v1"
            if not force:
                cached = self.store.cache_get(ckey)
                if cached:
                    return cached

            STYLES = [
                ("0.399300", "大盘核心", "沪深300"),
                ("0.399006", "A股成长", "创业板指"),
                ("124.HSTECH", "港股弹性", "恒生科技"),
                ("100.NDX", "海外科技", "纳指100"),
                ("1.511090", "利率防御", "30Y国债ETF"),
                ("101.GC00Y", "避险商品", "COMEX黄金"),
            ]

            def _pull_s(item):
                sid, style_lbl, nm = item
                try:
                    kl = self.kline(sid, "1d", 80, nm, False)
                    bars = kl.get("bars") or []
                    closes = [float(b["close"]) for b in bars if b.get("close")]
                    if len(closes) < 8:
                        return None
                    c_now = closes[-1]
                    r5 = round((c_now / closes[max(0, len(closes) - 6)] - 1.0) * 100.0, 2)
                    r20 = round((c_now / closes[max(0, len(closes) - 21)] - 1.0) * 100.0, 2)
                    r60 = round((c_now / closes[max(0, len(closes) - 61)] - 1.0) * 100.0, 2)
                    return {
                        "secid": sid,
                        "style": style_lbl,
                        "name": kl.get("name") or nm,
                        "price": c_now,
                        "pct": float(kl.get("pct") or 0.0),
                        "r5": r5,
                        "r20": r20,
                        "r60": r60,
                    }
                except Exception:
                    return None

            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
                items = [x for x in ex.map(_pull_s, STYLES) if x]

            by20 = sorted(items, key=lambda x: x["r20"], reverse=True)
            out = {
                "ok": True,
                "items": items,
                "leader_20d": by20[0] if by20 else None,
                "laggard_20d": by20[-1] if by20 else None,
                "updated_at": int(time.time()),
            }
            self.store.cache_set(ckey, out, ttl=300)
            return out

        # Default: divergence radar
        ov = self.overview(force=False)
        secs = (self.sectors(limit=30, force=False).get("items") or [])
        quote_map = {}
        for p in (ov.get("panels") or []):
            for it in (p.get("items") or []):
                quote_map[it["secid"]] = it

        alerts: list[dict] = []
        gc = quote_map.get("101.GC00Y")
        dxy = quote_map.get("100.UDI")
        if gc and dxy and (gc.get("pct") or 0) > 0.4 and (dxy.get("pct") or 0) > 0.25:
            alerts.append({
                "level": "high",
                "tag": "宏观背离",
                "title": f"黄金 ({gc['pct']:+.2f}%) 与美元指数 ({dxy['pct']:+.2f}%) 同向走强",
                "detail": "避险买盘压倒美元计价压制，常见于地缘摩擦或信用风险升温阶段。",
                "secid": "101.GC00Y",
            })
        brent = quote_map.get("112.B00Y")
        spx = quote_map.get("100.SPX")
        if brent and spx and abs((brent.get("pct") or 0) - (spx.get("pct") or 0)) >= 2.2:
            alerts.append({
                "level": "medium",
                "tag": "跨资产分化",
                "title": f"布油 ({brent['pct']:+.2f}%) 与标普500 ({spx['pct']:+.2f}%) 日内走阔",
                "detail": "能源价格与权益市场走势显著分化，建议关注通胀预期与风险偏好切换。",
                "secid": "112.B00Y",
            })
        for s in secs:
            pct = float(s.get("pct") or 0.0)
            inf_yi = float(s.get("net_inflow") or 0.0) / 1e8
            if pct >= 1.2 and inf_yi <= -1.5:
                alerts.append({
                    "level": "warn",
                    "tag": "量价背离·诱多",
                    "title": f"{s['name']} 指数涨 {pct:+.2f}% 但主力净流出 {inf_yi:.2f}亿",
                    "detail": "板块账面飘红但大单资金净撤离，警惕冲高回落。",
                    "secid": "",
                })
            elif pct <= -0.5 and inf_yi >= 1.5:
                alerts.append({
                    "level": "ok",
                    "tag": "潜伏吸筹",
                    "title": f"{s['name']} 跌 {pct:+.2f}% 但主力逆势净流入 +{inf_yi:.2f}亿",
                    "detail": "回调过程中出现大单逆势承接，具备左侧潜伏观察价值。",
                    "secid": "",
                })
        if not alerts:
            for s in secs[:4]:
                inf_yi = float(s.get("net_inflow") or 0.0) / 1e8
                alerts.append({
                    "level": "info",
                    "tag": "资金焦点",
                    "title": f"{s['name']} ({float(s.get('pct') or 0):+.2f}%) · 主力净流 {inf_yi:+.2f}亿",
                    "detail": "当前盘面量价方向一致，未触发显著跨市场背离阈值。",
                    "secid": "",
                })
        return {"ok": True, "alerts": alerts[:10], "updated_at": int(time.time())}
