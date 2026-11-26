from __future__ import annotations

import json
import time

PROMPT = (
    "\n\n【多语种实时新闻流与实体情报工具】\n"
    "当用户询问最新国际/国内新闻、宏观/地缘事件、俄语/英文媒体报道、特定机构/人物/港口/大宗商品动态，"
    "或需要将外部新闻情报与本地文档库/制度规则交叉分析时，主动调用以下工具：\n"
    "- `search_news`: 按语义+关键词混合检索已入库的中/英/俄新闻（支持按语种、分类、实体、时间窗筛选）。\n"
    "- `entity_brief`: 查询特定实体（机构/人物/地区/资产）的近期情绪分布、共现关联实体与相关报道。\n"
    "- `news_digest`: 获取近 N 小时高冲击快讯与热点概览。\n"
    "若发现重要外部事件影响内部制度或业务合规，请结合 `search_docs` 联合研判。"
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_news",
            "description": "在中/英/俄多语种新闻库中进行语义+关键词混合检索，返回中文译文标题、原文标题、来源、时间、情绪与实体标签。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "检索查询语句或关键词"},
                    "lang": {"type": "string", "description": "可选，语种过滤：all / zh / en / ru / ja"},
                    "category": {"type": "string", "description": "可选，分类过滤，如 宏观金融 / 俄语情报 / 航运物流"},
                    "entity": {"type": "string", "description": "可选，按规范实体名筛选"},
                    "hours": {"type": "integer", "description": "可选，回溯小时数，如 24 或 168"},
                    "limit": {"type": "integer", "description": "返回条数，默认 10"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "entity_brief",
            "description": "获取某实体（公司、央行、港口、人物、大宗商品等）的情报画像：提及次数、情绪倾向、共现关联实体与最近新闻。",
            "parameters": {
                "type": "object",
                "properties": {
                    "entity": {"type": "string", "description": "实体名称（中文译名或外文原名）"},
                    "hours": {"type": "integer", "description": "统计窗口小时数，默认 168（7天）"},
                },
                "required": ["entity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "news_digest",
            "description": "拉取近 N 小时重要/高冲击多语种新闻摘要与热门实体榜。",
            "parameters": {
                "type": "object",
                "properties": {
                    "hours": {"type": "integer", "description": "回溯小时数，默认 24"},
                    "category": {"type": "string", "description": "可选，分类过滤"},
                    "lang": {"type": "string", "description": "可选，语种过滤：all / zh / en / ru / ja"},
                    "min_impact": {"type": "integer", "description": "最低冲击烈度 1-5，默认 0"},
                },
            },
        },
    },
]


def enabled(cfg) -> bool:
    return bool(cfg and cfg.data.get("news_enabled"))


def action_label(name: str, args: dict) -> str:
    if name == "entity_brief":
        return f"实体画像 · {args.get('entity') or ''}".strip()
    if name == "news_digest":
        h = args.get("hours") or 24
        return f"近 {h}h 情报速览"
    return str(args.get("query") or args.get("entity") or "新闻检索").strip()


def _fmt_ts(ts: int) -> str:
    if not ts:
        return ""
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(int(ts)))


def _fmt_items(items: list[dict]) -> str:
    lines = []
    for i, it in enumerate(items, 1):
        title_zh = it.get("title_zh") or it.get("title_orig") or ""
        title_orig = it.get("title_orig") or ""
        summ = (it.get("summary_zh") or it.get("summary_orig") or "").strip()
        ents = [e.get("name", "") for e in (it.get("entities") or []) if isinstance(e, dict) and e.get("name")]
        clst = int(it.get("cluster_count") or 1)
        clst_tag = f" | 同事件:{clst}源" if clst > 1 else ""
        lines.append(
            f"[{i}] ({it.get('lang', '').upper()} | {it.get('feed_name', '')} | {_fmt_ts(it.get('published_at') or 0)} "
            f"| 情绪:{it.get('sentiment', 'neutral')} | 冲击:{it.get('impact', 0)}/5{clst_tag})\n"
            f"标题: {title_zh}"
            + (f"\n原标题: {title_orig}" if title_orig and title_orig != title_zh else "")
            + (f"\n摘要: {summ}" if summ else "")
            + (f"\n实体: {', '.join(ents)}" if ents else "")
            + (f"\n链接: {it.get('url')}" if it.get("url") else "")
        )
    return "\n\n".join(lines)


def run_news_tool(name: str, args: dict, news_mgr) -> tuple[str, bool, str, int]:
    if news_mgr is None:
        return "新闻流引擎未初始化。", False, "未就绪", 0

    if name == "search_news":
        q = str(args.get("query") or "").strip()
        lang = str(args.get("lang") or "").strip()
        cat = str(args.get("category") or "").strip()
        ent = str(args.get("entity") or "").strip()
        hours = int(args.get("hours") or 0)
        limit = max(1, min(20, int(args.get("limit") or 10)))
        if ent and not q:
            res = news_mgr.store.query_items(entity=ent, lang=lang, category=cat, hours=hours, limit=limit)
            items = res.get("items") or []
            mode = "entity"
        else:
            res = news_mgr.semantic_search(q, limit=limit, lang=lang, category=cat, hours=hours)
            items = res.get("items") or []
            mode = res.get("mode") or "keyword"
            if ent:
                items = [x for x in items if any(e.get("name") == ent for e in (x.get("entities") or []))]
        if not items:
            return f"未检索到与「{q or ent}」相关的新闻。", True, "0 条", 0
        txt = f"检索模式: {mode}，命中 {len(items)} 条：\n\n" + _fmt_items(items)
        return txt, True, f"{len(items)} 条", len(items)

    if name == "entity_brief":
        ent = str(args.get("entity") or "").strip()
        hours = int(args.get("hours") or 168)
        prof = news_mgr.store.entity_profile(ent, hours=hours)
        if not prof:
            return f"暂未在近 {hours} 小时新闻中发现实体「{ent}」。", True, "未命中", 0
        co = ", ".join(f"{c['canonical_name']}({c['co_count']})" for c in (prof.get("co_entities") or [])[:10])
        header = (
            f"实体: {prof['canonical_name']} [{prof['entity_type']}]\n"
            f"别名: {', '.join(prof.get('aliases') or []) or '无'}\n"
            f"近 {hours}h 提及: {prof['mentions']} 次 (历史累计 {prof['total_mentions']} 次)\n"
            f"情绪分布: 利多 {prof['bullish']} / 利空 {prof['bearish']} / 中性 {prof['neutral']} (净情绪 {prof['net_sentiment']})\n"
            f"共现关联实体: {co or '暂无'}\n"
        )
        items = prof.get("items") or []
        txt = header + ("\n最近相关报道:\n\n" + _fmt_items(items[:10]) if items else "")
        return txt, True, f"{len(items)} 条", len(items)

    if name == "news_digest":
        hours = int(args.get("hours") or 24)
        cat = str(args.get("category") or "").strip()
        lang = str(args.get("lang") or "").strip()
        min_imp = int(args.get("min_impact") or 0)
        res = news_mgr.store.query_items(hours=hours, category=cat, lang=lang, min_impact=min_imp, limit=15)
        items = res.get("items") or []
        ents = news_mgr.store.list_entities(hours=hours, limit=8)
        ent_line = ", ".join(f"{e['canonical_name']}({e['mentions']})" for e in ents)
        txt = (
            f"近 {hours} 小时热门实体: {ent_line or '暂无'}\n\n"
            + (_fmt_items(items) if items else "该窗口暂无符合条件的新闻。")
        )
        return txt, True, f"{len(items)} 条", len(items)

    return json.dumps({"ok": False, "error": f"未知新闻工具: {name}"}, ensure_ascii=False), False, "失败", 0
