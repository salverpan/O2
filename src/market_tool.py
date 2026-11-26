from __future__ import annotations

import json
import time

PROMPT = (
    "\n\n【金融行情与宏观地缘数据工具】\n"
    "当用户询问实时指数/股票/汇率/商品/加密行情、K线与技术指标、行业板块热力、领涨跌异动、美债利率、中俄/国际汇率或地缘预测赔率时，"
    "主动调用以下工具获取实时/缓存行情与宏观数据，并可结合 `search_news` 与 `search_docs` 进行跨库交叉研判：\n"
    "- `market_query`: 查询全球行情总览 (`overview`)、单标的报价与技术面 K 线 (`kline`)、行业板块 (`sectors`)、异动榜 (`movers`) 或标的搜索 (`search`)。\n"
    "- `macro_query`: 查询美债利率、汇率 (`fx`/`treasury`/`overview`) 以及地缘政治与宏观预测事件赔率 (`geopolitics`)。\n"
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "market_query",
            "description": "获取全球主要指数、A/港/美股、汇率（含USD/CNH、USD/RUB）、大宗商品（黄金/原油）和加密货币的实时报价、历史K线、均线/RSI/MACD指标、行业板块与涨跌异动。",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["overview", "quote", "kline", "sectors", "movers", "search"],
                        "description": "查询动作，默认 overview",
                    },
                    "secid": {
                        "type": "string",
                        "description": "EastMoney secid（如 1.000001 上证、100.SPX、101.GC00Y 黄金、112.B00Y 布油、1.601919 中远海控、105.NVDA）或 CBR.USDRUB / CG.bitcoin",
                    },
                    "query": {"type": "string", "description": "搜索关键词或标的简称（action=search 或未提供 secid 时自动检索）"},
                    "interval": {"type": "string", "enum": ["1d", "1w", "1M"], "description": "K线周期，默认 1d"},
                    "limit": {"type": "integer", "description": "K线条数或返回条数，默认 30"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "macro_query",
            "description": "获取全球宏观指标（美国财政部国债利率、Frankfurter 全球汇率、CBR 俄央行卢布汇率、FRED 增强数据）及地缘/经济预测赔率与港口航运数据。",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["overview", "treasury", "fx", "geopolitics"],
                        "description": "查询类型，默认 overview",
                    },
                },
            },
        },
    },
]


def enabled(cfg) -> bool:
    return bool(cfg and (cfg.data.get("news_enabled") or cfg.data.get("api_call")))


def action_label(name: str, args: dict) -> str:
    act = str(args.get("action") or "overview").strip()
    if name == "macro_query":
        return f"宏观地缘 · {act}"
    target = str(args.get("secid") or args.get("query") or "").strip()
    return f"行情 · {target or act}".strip()


def run_market_tool(name: str, args: dict, market_mgr) -> tuple[str, bool, str, int]:
    if market_mgr is None:
        return "行情数据总线未初始化。", False, "未就绪", 0

    act = str(args.get("action") or "overview").strip().lower()

    if name == "macro_query":
        if act == "geopolitics":
            geo = market_mgr.geopolitics()
            evs = geo.get("events") or []
            lines = ["【Polymarket 宏观/地缘实时赔率】"]
            for e in evs[:12]:
                yp = f"{e['yes_pct']}%" if e.get("yes_pct") is not None else "-"
                lines.append(f"- {e['title']} | YES: {yp} | 24h量: ${int(e.get('volume24h') or 0):,}")
            cps = geo.get("chokepoints") or []
            if cps:
                lines.append("\n【IMF PortWatch 航运咽喉点通行量】")
                for c in cps[:8]:
                    lines.append(f"- {c.get('portname')} ({str(c.get('date') or '')[:10]}): 总船次 {c.get('n_total')}, 油轮 {c.get('n_tanker')}, 集装箱 {c.get('n_container')}")
            return "\n".join(lines), True, f"{len(evs)} 条事件", len(evs)

        m = market_mgr.macro()
        lines: list[str] = []
        tr = m.get("treasury") or {}
        if tr.get("rates") and act in ("overview", "treasury"):
            lines.append(f"【美国财政部国债平均利率 ({tr.get('date')})】")
            for r in tr["rates"]:
                lines.append(f"- {r['label']}: {r['rate']}%")
        fx = m.get("fx") or {}
        cbr = m.get("cbr") or {}
        if act in ("overview", "fx"):
            if fx.get("rates"):
                lines.append(f"\n【全球主力汇率 USD 基准 ({fx.get('date')})】")
                lines.append(", ".join(f"{k}={v}" for k, v in (fx.get("rates") or {}).items()))
            if cbr.get("items"):
                lines.append(f"\n【俄罗斯央行 CBR 官方汇率 ({cbr.get('date')})】")
                for it in cbr["items"].values():
                    lines.append(f"- {it['symbol']}: {it['price']} ({it['pct']:+.2f}%)")
        if m.get("fred"):
            lines.append("\n【FRED 宏观序列】")
            for f in m["fred"]:
                lines.append(f"- {f['label']} ({f['id']}): {f['value']} [{f['date']}]")
        return ("\n".join(lines) or "暂无宏观数据"), True, "已获取", 1

    # market_query
    if act == "search":
        q = str(args.get("query") or args.get("secid") or "").strip()
        res = market_mgr.search_symbols(q)
        items = res.get("items") or []
        if not items:
            return f"未找到匹配标的「{q}」。", True, "0 个", 0
        lines = [f"- {it['symbol']} | {it['name']} | secid={it['secid']} | {it['market']}" for it in items]
        return "\n".join(lines), True, f"{len(items)} 个", len(items)

    if act == "sectors":
        lim = max(5, min(40, int(args.get("limit") or 20)))
        res = market_mgr.sectors(limit=lim)
        items = res.get("items") or []
        lines = ["【行业板块行情与主力资金流】"]
        for it in items[:lim]:
            inflow_yi = (it.get("net_inflow") or 0.0) / 1e8
            lines.append(f"- {it['name']}: {it['pct']:+.2f}% | 指数 {it['price']} | 主力净流入 {inflow_yi:+.2f}亿")
        return "\n".join(lines), True, f"{len(items)} 个板块", len(items)

    if act == "movers":
        res = market_mgr.movers(limit=10)
        lines = ["【A股领涨】"]
        for it in (res.get("gainers") or [])[:8]:
            lines.append(f"- {it['name']}({it['symbol']}): {it['price']} ({it['pct']:+.2f}%)")
        lines.append("\n【A股领跌】")
        for it in (res.get("losers") or [])[:8]:
            lines.append(f"- {it['name']}({it['symbol']}): {it['price']} ({it['pct']:+.2f}%)")
        lines.append("\n【成交额前列】")
        for it in (res.get("active") or [])[:8]:
            lines.append(f"- {it['name']}({it['symbol']}): {it['price']} ({it['pct']:+.2f}%) | 额 {(it.get('amount') or 0)/1e8:.2f}亿")
        return "\n".join(lines), True, "异动榜", 24

    if act in ("kline", "quote"):
        sid = str(args.get("secid") or "").strip()
        q = str(args.get("query") or "").strip()
        if not sid and q:
            sr = market_mgr.search_symbols(q)
            if sr.get("items"):
                sid = sr["items"][0]["secid"]
        if not sid:
            return "请提供有效的 secid 或标的关键词 query。", False, "缺参数", 0
        iv = str(args.get("interval") or "1d")
        lim = max(10, min(180, int(args.get("limit") or 40)))
        kl = market_mgr.kline(sid, interval=iv, limit=lim)
        if not kl.get("ok"):
            return kl.get("error") or "获取 K 线失败", False, "失败", 0
        bars = kl.get("bars") or []
        ind = kl.get("indicators") or {}
        ma5 = ind.get("ma5")[-1]["value"] if ind.get("ma5") else "-"
        ma20 = ind.get("ma20")[-1]["value"] if ind.get("ma20") else "-"
        rsi = ind.get("rsi14")[-1]["value"] if ind.get("rsi14") else "-"
        macd = ind.get("macd")[-1] if ind.get("macd") else {}
        lines = [
            f"标的: {kl.get('name')} ({kl.get('secid')}) | 数据源: {kl.get('source')} | 周期: {iv}",
            f"最新收盘: {kl.get('price')} ({kl.get('pct', 0):+.2f}% / {kl.get('chg', 0):+.4f})",
            f"技术指标: MA5={ma5}, MA20={ma20}, RSI14={rsi}, MACD(DIF={macd.get('dif','-')}, DEA={macd.get('dea','-')}, HIST={macd.get('hist','-')})",
            "\n近期 K 线 (最新12根):",
        ]
        for b in bars[-12:]:
            lines.append(f"{b['time']} | O:{b['open']} H:{b['high']} L:{b['low']} C:{b['close']} V:{b['volume']}")
        evs = kl.get("news_events") or []
        if evs:
            lines.append("\n关联时间轴新闻事件:")
            for ev in evs[:6]:
                lines.append(f"- [{ev['time']}][{ev['lang'].upper()}][{ev['sentiment']}] {ev['title']}")
        return "\n".join(lines), True, f"{len(bars)} 根K线", len(bars)

    # overview
    ov = market_mgr.overview()
    lines = [f"【全球核心行情快照 ({time.strftime('%Y-%m-%d %H:%M', time.localtime(ov.get('updated_at') or time.time()))})】"]
    for p in (ov.get("panels") or []):
        lines.append(f"\n[{p['title']}]")
        for it in (p.get("items") or [])[:12]:
            if it.get("price") is None:
                continue
            lines.append(f"- {it['name']}({it['symbol']}): {it['price']} ({it['pct']:+.2f}%)")
    return "\n".join(lines), True, f"{ov.get('stats', {}).get('total', 0)} 个标的", ov.get("stats", {}).get("total", 0)
