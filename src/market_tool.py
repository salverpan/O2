from __future__ import annotations

import json
import time

PROMPT = (
    "\n\n【金融行情、宏观地缘与专业量化回测工具】\n"
    "当用户询问实时指数/股票/汇率/商品/加密行情、K线与技术指标、行业板块热力、领涨跌异动、美债利率、中俄/国际汇率、地缘预测赔率，或要求对策略进行真实回测/对因子进行 Alphalens 体检时，"
    "主动调用以下工具：\n"
    "- `market_query`: 查询全球行情总览 (`overview`)、单标的报价与技术面 K 线 (`kline`)、行业板块 (`sectors`)、异动榜 (`movers`) 或标的搜索 (`search`)。\n"
    "- `macro_query`: 查询美债利率、汇率 (`fx`/`treasury`/`overview`) 以及地缘政治与宏观预测事件赔率 (`geopolitics`)。\n"
    "- `quant_backtest`: 调用本地成熟双引擎（VectorBT 择时/ETF轮动 或 Qlib+LightGBM A股多因子选股）运行含手续费、滑点、涨跌停/T+1约束的真实历史回测。\n"
    "- `quant_factor_eval`: 调用 Alphalens-reloaded 对 Alpha158 / Alpha101 / Alpha191 / TA-Lib / 基本面因子或自定义公式进行 IC/RankIC/ICIR 与五分层净值体检。\n"
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
                        "enum": ["overview", "quote", "kline", "sectors", "movers", "search", "barcode", "formula", "analog", "factors", "divergence"],
                        "description": "查询动作：overview/kline/sectors/movers/search 或高级量化 barcode(全景分位数)/formula(金油比·铜金比·股债比)/analog(历史相似剧本)/factors(事件因子回测)/divergence(跨市场背离)",
                    },
                    "secid": {
                        "type": "string",
                        "description": "EastMoney secid（如 1.000001 上证、0.399300 沪深300、100.SPX、101.GC00Y 黄金、112.B00Y 布油、1.601919 中远海控、105.NVDA）或 CBR.USDRUB / CG.bitcoin",
                    },
                    "preset": {
                        "type": "string",
                        "description": "action=formula 时可选 gold_oil | copper_gold | ship_oil | csi_bond | us_cn_tech；action=factors 时可选 oversold_reversal | squeeze_breakout | macd_golden_trend | liquidity_impulse",
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
    {
        "type": "function",
        "function": {
            "name": "quant_backtest",
            "description": "运行成熟量化引擎回测（VectorBT 择时/多资产ETF轮动，或 Qlib+LightGBM A股多因子选股），返回年化收益、夏普、最大回撤、超额收益与最新持仓信号。",
            "parameters": {
                "type": "object",
                "properties": {
                    "engine": {"type": "string", "enum": ["vectorbt", "qlib"], "description": "vectorbt 适合单标的择时与ETF轮动；qlib 适合A股多因子选股"},
                    "strategy": {
                        "type": "string",
                        "enum": ["dual_ma", "macd_trend", "rsi_boll_reversion", "turtle_breakout", "etf_momentum_rotation", "factor_timing", "qlib_multifactor"],
                        "description": "策略模板名称",
                    },
                    "symbol": {"type": "string", "description": "单标的回测代码，如 510300.SH、600519.SH、GC=F、NVDA"},
                    "universe": {"type": "string", "enum": ["hs300", "etf_pool", "global_core", "all_cn_stocks"], "description": "多标的/多因子回测股票池"},
                    "start_date": {"type": "string", "description": "开始日期 YYYY-MM-DD（可选）"},
                    "end_date": {"type": "string", "description": "结束日期 YYYY-MM-DD（可选）"},
                    "strategy_params": {"type": "object", "description": "策略参数字典，如 {fast:10, slow:30} 或 {factor_set:'alpha158_core', topk:15, model_type:'lightgbm'}"},
                },
                "required": ["engine", "strategy"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "quant_factor_eval",
            "description": "调用 Alphalens-reloaded 对 Alpha158 / Alpha101 / Alpha191 / TA-Lib / 基本面因子或自定义公式跑横截面 IC/ICIR/五分层收益体检。",
            "parameters": {
                "type": "object",
                "properties": {
                    "factor_id": {"type": "string", "description": "因子ID，如 wq_alpha006、q158_std20、q158_roc20、ta_rsi14、fund_ep_ttm、fund_turnover20 或 custom"},
                    "custom_expr": {"type": "string", "description": "当 factor_id=custom 时传入因子公式，如 -ts_corr(open, volume, 10)"},
                    "universe": {"type": "string", "enum": ["hs300", "etf_pool", "all_cn_stocks"], "description": "股票池，默认 hs300"},
                },
                "required": ["factor_id"],
            },
        },
    },
]


def enabled(cfg) -> bool:
    return bool(cfg and (cfg.data.get("news_enabled") or cfg.data.get("api_call")))


def action_label(name: str, args: dict) -> str:
    if name == "quant_backtest":
        eng = str(args.get("engine") or "vectorbt")
        st = str(args.get("strategy") or "")
        tgt = str(args.get("symbol") or args.get("universe") or "")
        return f"量化回测 · {eng}/{st} {tgt}".strip()
    if name == "quant_factor_eval":
        fid = str(args.get("custom_expr") or args.get("factor_id") or "")
        return f"因子体检 · {fid[:24]}"
    act = str(args.get("action") or "overview").strip()
    if name == "macro_query":
        return f"宏观地缘 · {act}"
    target = str(args.get("secid") or args.get("query") or "").strip()
    return f"行情 · {target or act}".strip()


def run_quant_tool(name: str, args: dict, quant_mgr) -> tuple[str, bool, str, int]:
    if quant_mgr is None:
        return "量化回测引擎未初始化。", False, "未就绪", 0
    if name == "quant_factor_eval":
        fid = str(args.get("factor_id") or "wq_alpha006").strip()
        cexpr = str(args.get("custom_expr") or "").strip()
        uni = str(args.get("universe") or "hs300").strip()
        job = quant_mgr.submit_job("factor_eval", f"AI因子体检 · {cexpr or fid}", "Alphalens", {
            "factor_id": fid, "custom_expr": cexpr, "universe": uni,
        }, wait=True)
        res = job.get("result") or {}
        if job.get("status") != "done" or not res.get("ok"):
            return f"因子体检失败：{job.get('error') or res.get('error') or '未知错误'}", False, "失败", 0
        lines = [
            f"【Alphalens 因子体检完成 · {res.get('factor_name')}】({res.get('universe')}, {res.get('symbol_count')}只标的, {res.get('date_range',[ '',''])[0]} ~ {res.get('date_range',['',''])[1]})",
        ]
        for r in (res.get("summary") or []):
            lines.append(
                f"- {r['period']}: RankIC={r['ic_mean']:+.4f} | ICIR={r['icir']:+.3f} | t={r['t_stat']} | 胜率={r['ic_win_rate']}% | 多空(Q5-Q1)={r['ls_spread_bps']:+.1f}bps | 顶层换手={r['top_turnover_pct']}%"
            )
        tops = res.get("top_stocks") or []
        if tops:
            lines.append(f"\n最新横截面 Top 8 ({res.get('latest_date')}):")
            lines.append(", ".join(f"{x['name']}({x['symbol']} {x['factor_val']:+.2f})" for x in tops[:8]))
        return "\n".join(lines), True, f"{len(res.get('summary') or [])} 周期", len(tops)

    # quant_backtest
    engine = str(args.get("engine") or "vectorbt").strip().lower()
    strat = str(args.get("strategy") or "dual_ma").strip()
    tgt = str(args.get("symbol") or args.get("universe") or "hs300").strip()
    job = quant_mgr.submit_job("backtest", f"AI回测 · {engine}/{strat} ({tgt})", engine, dict(args), wait=True)
    res = job.get("result") or {}
    if job.get("status") != "done" or not res.get("ok"):
        return f"回测执行失败：{job.get('error') or res.get('error') or '未知错误'}", False, "失败", 0
    k = res.get("kpis") or {}
    m = res.get("meta") or {}
    lines = [
        f"【量化回测报告 · {m.get('strategy_label') or strat}】",
        f"引擎: {res.get('engine')} | 基准: {m.get('benchmark')} | 交易笔数: {k.get('total_trades')}",
        f"- 累计收益: {k.get('total_return'):+.2f}% | 年化收益: {k.get('annual_return'):+.2f}% | 基准收益: {k.get('benchmark_return'):+.2f}% | 超额收益: {k.get('excess_return'):+.2f}%",
        f"- 夏普比率: {k.get('sharpe')} | 索提诺: {k.get('sortino')} | 卡玛比率: {k.get('calmar')} | 信息比率: {k.get('info_ratio')}",
        f"- 最大回撤: {k.get('max_drawdown'):.2f}% ({k.get('max_dd_date')}) | 年化波动: {k.get('volatility')}% | 胜率: {k.get('win_rate')}% | 盈亏比: {k.get('profit_factor')}",
    ]
    if m.get("oos_rank_ic") is not None:
        lines.append(f"- 样本外预测 RankIC: {m.get('oos_rank_ic'):+.4f} | ICIR: {m.get('oos_icir')}")
    holds = res.get("latest_holdings") or []
    if holds:
        lines.append("\n最新持仓/推荐信号:")
        lines.append(", ".join(f"{h.get('name')}({h.get('symbol')})" for h in holds[:10]))
    return "\n".join(lines), True, f"年化 {k.get('annual_return', 0):+.1f}%", int(k.get("total_trades") or 0)


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
    if act in ("barcode", "formula", "analog", "factors", "divergence"):
        preset = str(args.get("preset") or "").strip()
        sid = str(args.get("secid") or "").strip()
        qs = {}
        if sid:
            qs["secid"] = [sid]
        if preset:
            qs["preset"] = [preset]
            qs["factor_pack"] = [preset]
        qres = market_mgr.quant_analytics(act, qs)
        if not qres.get("ok"):
            return qres.get("error") or "量化计算失败", False, "失败", 0
        if act == "barcode":
            items = qres.get("items") or []
            lines = ["【全景核心资产历史分位数条形码 (近200交易日)】"]
            for it in items:
                lines.append(f"- {it['name']} [{it['category']}]: 分位 {it['percentile']}% ({it['zone']}) | 最新 {it['price']} | RSI14={it['rsi14']}")
            return "\n".join(lines), True, f"{len(items)} 项分位数", len(items)
        if act == "formula":
            return (
                f"【{qres.get('title')}】\n说明: {qres.get('desc')}\n"
                f"最新值: {qres.get('latest')} | 历史分位: {qres.get('percentile')}%\n"
                f"均值: {qres.get('mean')} | ±1σ: [{qres.get('dn1')}, {qres.get('up1')}] | ±2σ: [{qres.get('dn2')}, {qres.get('up2')}]"
            ), True, f"分位 {qres.get('percentile')}%", 1
        if act == "analog":
            ans = qres.get("analogs") or []
            lines = [f"【{qres.get('name')} 近30日形态 · 历史相似剧本匹配】"]
            for a in ans:
                lines.append(f"- {a['period']}: 相似度 {a['similarity']}% | 当年后续20日涨跌 {a['forward_20d_pct']:+.2f}%")
            return "\n".join(lines), True, f"{len(ans)} 个剧本", len(ans)
        if act == "factors":
            st = qres.get("stats") or {}
            t5, t10, t20 = st.get("t5") or {}, st.get("t10") or {}, st.get("t20") or {}
            return (
                f"【{qres.get('name')} · {qres.get('title')}】({qres.get('sample_count')} 次历史触发)\n"
                f"- T+5 胜率 {t5.get('win_rate')}% (均值 {t5.get('avg', 0):+.2f}%)\n"
                f"- T+10 胜率 {t10.get('win_rate')}% (均值 {t10.get('avg', 0):+.2f}%)\n"
                f"- T+20 胜率 {t20.get('win_rate')}% (均值 {t20.get('avg', 0):+.2f}%)"
            ), True, f"{qres.get('sample_count')} 次回测", int(qres.get("sample_count") or 0)
        alerts = qres.get("alerts") or []
        lines = ["【跨市场背离与量价异动雷达】"]
        for a in alerts:
            lines.append(f"- [{a['tag']}] {a['title']} — {a['detail']}")
        return "\n".join(lines), True, f"{len(alerts)} 条信号", len(alerts)

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
