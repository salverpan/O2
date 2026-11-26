from __future__ import annotations

import base64
import copy
import html
import json
import os
import re
import threading
import time

_STORE_LOCK = threading.RLock()

BUILTIN_WIDGET_TYPES = {
    "pro_kline",
    "rebased_compare",
    "formula_spread",
    "percentile_barcode",
    "capital_flow",
    "rotation_quadrant",
    "chokepoint_watch",
    "analog_finder",
    "event_study",
    "divergence_radar",
    "macro_clock",
    "corr_matrix",
    "risk_drawdown",
    "market_breadth",
    "style_factor",
    "commodity_dashboard",
    "rate_spread_watch",
    "intel_catalyst",
    "watchlist_slot",
    "sector_heatmap",
    "macro_curve",
    "geo_odds",
    "entity_pulse",
    "sentiment_gauge",
    "live_wire",
    "desk_note",
}

PROMPT = """

【数据可视化 ECharts 绘图、实时终端模块引用与模块库工具（render_visual）】
当你回答涉及数据对比、趋势演化、结构占比、财务/经营指标拆解、制度额度阶梯、行情与宏观研判，或者用户要求画图、创建看板模块、生成专题监控工作区时，主动调用 `render_visual` 工具增强回答的可视化表现力：
1. `mode="echarts"`（最常用）：传入标准声明式 ECharts `option` 对象（JSON，不含 JS 函数），直接在回答中渲染可交互 ECharts 图表（支持 bar / line / pie / scatter / radar / candlestick / sankey / funnel / heatmap / gauge 及双 Y 轴、markLine 制度红线阈值等）。
   - 务必同时填写清晰的 `title`（标题）与 `description`（一句话讲清“这是什么图、有什么研判用途”）。
   - 为保证图表钉选到看板后任意拖拽缩放均自适应：请设置 `grid: { containLabel: true, left: 12, right: 16, top: 28, bottom: 20 }`（勿硬编码过大的像素边距，勿在 `option.title` 重复卡片标题）；禁止在 `tooltip.valueFormatter` 写模板字符串（数值单位请放在坐标轴 `axisLabel.formatter` 或 `series.label.formatter`）。
   - 若用户明确希望“存成模块 / 加到模块库 / 放到看板”，设置 `save_to_library=true`（及 `pin_to_dashboard=true`）。
   - 请不要再在正文中重复输出冗长的 JSON 代码块，直接在正文中结合图表给出精炼洞察结论即可。
2. `mode="cite_widget"`：当回答讨论具体股票/指数走势、跨资产比值、美林时钟、相关性矩阵、波动率回撤、风格轮动、市场广度、行业资金流、板块热力、大宗通胀链、利差汇率、热点催化、历史相似剧本或事件回测时，可直接把内置实时模块嵌进回答（如 `pro_kline` / `rebased_compare` / `formula_spread` / `percentile_barcode` / `macro_clock` / `corr_matrix` / `risk_drawdown` / `market_breadth` / `style_factor` / `commodity_dashboard` / `rate_spread_watch` / `intel_catalyst` / `capital_flow` / `rotation_quadrant` / `chokepoint_watch` / `analog_finder` / `event_study` / `divergence_radar` / `sector_heatmap` / `macro_curve`）。
3. `mode="topic_board"`：当用户希望对某个复杂主题（如“全球利率与大宗商品监控”、“科技股与指数超额收益盯盘”）建立一整套监控视图时，传入 `workspace_name` 与 3～6 个关联模块列表 `board_widgets`，用户可一键生成专属看板工作区。
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "render_visual",
            "description": (
                "在回答中渲染交互式 ECharts 数据可视化图表、引用内置实时金融/情报模块，"
                "或将可视化模块保存到模块库/钉选到看板工作区，或一键生成多模块专题监控看板。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "mode": {
                        "type": "string",
                        "enum": ["echarts", "cite_widget", "topic_board"],
                        "description": "echarts=自定义ECharts图表；cite_widget=引用内置实时模块；topic_board=生成多模块专题看板",
                    },
                    "title": {
                        "type": "string",
                        "description": "图表或模块的简明标题（如：沪深300 vs 标普500 近90日超额收益对比）",
                    },
                    "description": {
                        "type": "string",
                        "description": "简介：用1~2句话说明该模块是什么、有什么研判或风控用途",
                    },
                    "category": {
                        "type": "string",
                        "enum": ["kline", "macro", "flow", "factor", "shipping", "ai"],
                        "description": "模块分类标签，默认 ai",
                    },
                    "option": {
                        "type": "object",
                        "description": "mode=echarts 时的标准 ECharts 配置对象（纯 JSON 数据与样式，禁止包含 JS function 字符串；支持 markLine 标注制度阈值红线）",
                    },
                    "widget_type": {
                        "type": "string",
                        "description": (
                            "mode=cite_widget 时引用的内置模块类型："
                            "pro_kline | rebased_compare | formula_spread | percentile_barcode | "
                            "macro_clock | corr_matrix | risk_drawdown | market_breadth | style_factor | "
                            "commodity_dashboard | rate_spread_watch | intel_catalyst | "
                            "capital_flow | rotation_quadrant | chokepoint_watch | analog_finder | "
                            "event_study | divergence_radar | sector_heatmap | macro_curve | geo_odds | entity_pulse"
                        ),
                    },
                    "config": {
                        "type": "object",
                        "description": "mode=cite_widget 时的模块参数，例如 {\"secid\":\"0.399300\",\"name\":\"沪深300\",\"preset\":\"gold_oil\",\"factor_pack\":\"oversold_reversal\"}",
                    },
                    "save_to_library": {
                        "type": "boolean",
                        "description": "是否将该可视化同步存入右上角『+ 模块库』以便随时复用，默认 false（用户要求创建/保存模块时设为 true）",
                    },
                    "pin_to_dashboard": {
                        "type": "boolean",
                        "description": "是否直接将该模块钉选添加到当前看板工作区，默认 false（用户要求放到看板时设为 true）",
                    },
                    "workspace_name": {
                        "type": "string",
                        "description": "mode=topic_board 时的专题工作区名称",
                    },
                    "board_widgets": {
                        "type": "array",
                        "description": "mode=topic_board 时的模块数组，每项含 {type, title, w, h, config, option}",
                        "items": {"type": "object"},
                    },
                },
                "required": ["mode", "title"],
            },
        },
    }
]


def _strip_unsafe(obj, depth: int = 0):
    if depth > 14:
        return None
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            ks = str(k)
            if ks in ("__proto__", "constructor", "prototype"):
                continue
            # Strip raw HTML tooltip formatters that might inject script
            if ks == "formatter" and isinstance(v, str) and ("<script" in v.lower() or "javascript:" in v.lower()):
                continue
            out[ks] = _strip_unsafe(v, depth + 1)
        return out
    if isinstance(obj, list):
        return [_strip_unsafe(x, depth + 1) for x in obj[:500]]
    if isinstance(obj, (int, float, bool)) or obj is None:
        return obj
    s = str(obj)
    if len(s) > 8000:
        s = s[:8000]
    return s


def infer_chart_kind(option: dict | None) -> str:
    if not isinstance(option, dict):
        return "bar"
    series = option.get("series")
    if isinstance(series, dict):
        return str(series.get("type") or "bar").lower()
    if isinstance(series, list) and series and isinstance(series[0], dict):
        return str(series[0].get("type") or "bar").lower()
    return "bar"


def generate_svg_thumbnail(title: str, kind: str = "bar", accent: str = "#3b82f6") -> str:
    safe_t = html.escape((title or "O2 Visual")[:22])
    k = (kind or "bar").lower()
    if k in ("line", "area", "rebased", "formula", "analog"):
        graphic = (
            '<path d="M18 86 L58 68 L98 74 L138 44 L178 52 L222 26" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/>'
            '<path d="M18 94 L58 84 L98 78 L138 66 L178 60 L222 48" fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="4 3"/>'
        )
    elif k in ("pie", "funnel", "gauge"):
        graphic = (
            '<circle cx="120" cy="60" r="30" fill="none" stroke="#3b82f6" stroke-width="12" stroke-dasharray="110 90"/>'
            '<circle cx="120" cy="60" r="30" fill="none" stroke="#10b981" stroke-width="12" stroke-dasharray="55 145" stroke-dashoffset="-110"/>'
        )
    elif k in ("scatter", "quadrant"):
        graphic = (
            '<line x1="120" y1="20" x2="120" y2="100" stroke="#334155" stroke-dasharray="3 3"/>'
            '<line x1="24" y1="60" x2="216" y2="60" stroke="#334155" stroke-dasharray="3 3"/>'
            '<circle cx="165" cy="38" r="9" fill="#10b981" fill-opacity="0.75"/>'
            '<circle cx="145" cy="48" r="6" fill="#3b82f6" fill-opacity="0.75"/>'
            '<circle cx="78" cy="42" r="7" fill="#f59e0b" fill-opacity="0.75"/>'
            '<circle cx="72" cy="78" r="8" fill="#ef4444" fill-opacity="0.75"/>'
        )
    elif k in ("candlestick", "kline", "pro_kline"):
        graphic = (
            '<line x1="48" y1="34" x2="48" y2="86" stroke="#ef4444" stroke-width="2"/><rect x="42" y="48" width="12" height="24" fill="#ef4444" rx="1"/>'
            '<line x1="88" y1="28" x2="88" y2="78" stroke="#10b981" stroke-width="2"/><rect x="82" y="38" width="12" height="26" fill="#10b981" rx="1"/>'
            '<line x1="128" y1="40" x2="128" y2="90" stroke="#ef4444" stroke-width="2"/><rect x="122" y="52" width="12" height="22" fill="#ef4444" rx="1"/>'
            '<line x1="168" y1="22" x2="168" y2="72" stroke="#10b981" stroke-width="2"/><rect x="162" y="30" width="12" height="28" fill="#10b981" rx="1"/>'
            '<path d="M36 66 Q96 40 196 32" fill="none" stroke="#3b82f6" stroke-width="2"/>'
        )
    elif k in ("radar",):
        graphic = (
            '<polygon points="120,22 162,46 148,88 92,88 78,46" fill="rgba(59,130,246,0.22)" stroke="#3b82f6" stroke-width="2"/>'
            '<polygon points="120,34 146,52 136,78 104,78 94,52" fill="none" stroke="#475569" stroke-width="1"/>'
        )
    else:
        graphic = (
            '<rect x="34" y="54" width="22" height="40" rx="3" fill="#3b82f6"/>'
            '<rect x="72" y="36" width="22" height="58" rx="3" fill="#10b981"/>'
            '<rect x="110" y="62" width="22" height="32" rx="3" fill="#f59e0b"/>'
            '<rect x="148" y="26" width="22" height="68" rx="3" fill="#6366f1"/>'
            '<rect x="186" y="44" width="22" height="50" rx="3" fill="#ec4899"/>'
        )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 116">'
        '<rect width="240" height="116" rx="6" fill="#0f172a"/>'
        '<g opacity="0.22" stroke="#334155" stroke-width="1">'
        '<line x1="16" y1="32" x2="224" y2="32"/><line x1="16" y1="62" x2="224" y2="62"/><line x1="16" y1="94" x2="224" y2="94"/>'
        '</g>'
        f'{graphic}'
        f'<text x="14" y="18" fill="#94a3b8" font-family="sans-serif" font-size="10" font-weight="600">{safe_t}</text>'
        '</svg>'
    )
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


class WidgetStore:
    def __init__(self, path: str):
        self.path = path
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)

    def _read_all(self) -> list[dict]:
        with _STORE_LOCK:
            if not os.path.exists(self.path):
                return []
            try:
                with open(self.path, encoding="utf-8") as f:
                    data = json.load(f)
                return data if isinstance(data, list) else (data.get("items") or [])
            except (OSError, ValueError):
                return []

    def _write_all(self, items: list[dict]) -> None:
        with _STORE_LOCK:
            os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
            tmp = f"{self.path}.tmp.{os.getpid()}.{threading.get_ident()}"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"version": 1, "items": items}, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)

    def list_items(self) -> list[dict]:
        items = self._read_all()
        items.sort(key=lambda x: int(x.get("updatedAt") or x.get("createdAt") or 0), reverse=True)
        return items

    def save_item(self, raw: dict) -> dict:
        with _STORE_LOCK:
            items = self._read_all()
            now = int(time.time())
            wid = str(raw.get("id") or "").strip() or f"cw_{int(time.time()*1000):x}"
            title = str(raw.get("title") or "自定义图表模块").strip()[:80]
            desc = str(raw.get("description") or "自定义数据可视化分析模块").strip()[:280]
            cat = str(raw.get("category") or "ai").strip()
            renderer = str(raw.get("renderer") or "echarts").strip()
            spec = _strip_unsafe(raw.get("spec") or {})
            if not isinstance(spec, dict):
                spec = {}
            opt = spec.get("option") or raw.get("option")
            if isinstance(opt, dict):
                spec["option"] = _strip_unsafe(opt)
            kind = infer_chart_kind(spec.get("option")) if renderer == "echarts" else str(spec.get("widgetType") or renderer)
            thumb = str(raw.get("thumbnail") or "").strip()
            if not thumb:
                thumb = generate_svg_thumbnail(title, kind)
            default_w = max(4, min(24, int(raw.get("defaultW") or 12)))
            default_h = max(5, min(28, int(raw.get("defaultH") or 10)))

            existing_idx = next((i for i, x in enumerate(items) if x.get("id") == wid), -1)
            created_at = items[existing_idx].get("createdAt", now) if existing_idx >= 0 else now
            record = {
                "id": wid,
                "title": title,
                "description": desc,
                "category": cat,
                "renderer": renderer,
                "spec": spec,
                "thumbnail": thumb,
                "defaultW": default_w,
                "defaultH": default_h,
                "createdAt": created_at,
                "updatedAt": now,
            }
            if existing_idx >= 0:
                items[existing_idx] = record
            else:
                items.insert(0, record)
            self._write_all(items[:200])
            return record

    def delete_item(self, wid: str) -> bool:
        with _STORE_LOCK:
            items = self._read_all()
            nxt = [x for x in items if x.get("id") != wid]
            if len(nxt) == len(items):
                return False
            self._write_all(nxt)
            return True


def pin_widget_to_dashboard(cfg, widget_entry: dict) -> dict:
    import news as news_mod
    saved = cfg.data.get("dashboard_layout")
    layout, _ = news_mod.migrate_dashboard_layout(saved)
    ws_list = layout.get("workspaces") or []
    if not ws_list:
        layout = copy.deepcopy(news_mod.DEFAULT_DASHBOARD_LAYOUT)
        ws_list = layout["workspaces"]
    active_id = layout.get("activeWorkspace") or ws_list[0]["id"]
    ws = next((w for w in ws_list if w.get("id") == active_id), ws_list[0])
    widgets = ws.setdefault("widgets", [])
    max_y = max(((int(w.get("y") or 0) + int(w.get("h") or 8)) for w in widgets), default=0)
    new_w = {
        "id": f"w_custom_{int(time.time()*1000):x}",
        "type": widget_entry.get("boardType") or "custom_echarts",
        "title": widget_entry.get("title") or "AI 图表",
        "x": 0,
        "y": max_y,
        "w": int(widget_entry.get("defaultW") or 12),
        "h": int(widget_entry.get("defaultH") or 10),
        "minW": 4,
        "minH": 5,
        "enabled": True,
        "config": widget_entry.get("boardConfig") or {},
    }
    widgets.append(new_w)
    cfg.data["dashboard_layout"] = layout
    cfg.save()
    return new_w


def materialize_topic_board(cfg, workspace_name: str, raw_widgets: list[dict], widget_store: WidgetStore | None = None) -> dict:
    import news as news_mod
    saved = cfg.data.get("dashboard_layout")
    layout, _ = news_mod.migrate_dashboard_layout(saved)
    ws_id = f"ws_topic_{int(time.time()*1000):x}"
    packed: list[dict] = []
    cur_x, cur_y, row_h = 0, 0, 0
    for idx, rw in enumerate(raw_widgets[:10]):
        if not isinstance(rw, dict):
            continue
        wtype = str(rw.get("type") or rw.get("widget_type") or "").strip()
        title = str(rw.get("title") or wtype or f"模块 {idx + 1}").strip()[:60]
        gw = max(6, min(24, int(rw.get("w") or 12)))
        gh = max(7, min(20, int(rw.get("h") or 10)))
        cfg_obj = _strip_unsafe(rw.get("config") or {}) if isinstance(rw.get("config"), dict) else {}
        opt = rw.get("option")
        if isinstance(opt, dict):
            clean_opt = _strip_unsafe(opt)
            wtype = "custom_echarts"
            if widget_store is not None:
                saved_item = widget_store.save_item({
                    "title": title,
                    "description": str(rw.get("description") or f"{workspace_name} 专题图表"),
                    "category": "ai",
                    "renderer": "echarts",
                    "spec": {"option": clean_opt},
                    "defaultW": gw,
                    "defaultH": gh,
                })
                cfg_obj = {"customWidgetId": saved_item["id"], "option": clean_opt}
            else:
                cfg_obj = {"option": clean_opt}
        elif not wtype:
            wtype = "pro_kline"

        if cur_x + gw > 24:
            cur_x = 0
            cur_y += row_h
            row_h = 0
        packed.append({
            "id": f"w_{ws_id}_{idx}",
            "type": wtype,
            "title": title,
            "x": cur_x,
            "y": cur_y,
            "w": gw,
            "h": gh,
            "minW": 5,
            "minH": 6,
            "enabled": True,
            "config": cfg_obj,
        })
        cur_x += gw
        row_h = max(row_h, gh)

    new_ws = {
        "id": ws_id,
        "name": (workspace_name or "AI 专题看板").strip()[:28],
        "widgets": packed,
    }
    layout.setdefault("workspaces", []).append(new_ws)
    layout["activeWorkspace"] = ws_id
    cfg.data["dashboard_layout"] = layout
    cfg.save()
    return {"workspace": new_ws, "layout": layout}


def action_label(args: dict) -> str:
    mode = str(args.get("mode") or "echarts").strip()
    title = str(args.get("title") or args.get("workspace_name") or "可视化图表").strip()
    if mode == "cite_widget":
        return f"引用模块 · {title}"
    if mode == "topic_board":
        return f"生成专题看板 · {title}"
    return f"绘制图表 · {title}"


def run_render_visual(args: dict, cfg, widget_store: WidgetStore | None = None) -> tuple[str, bool, str, dict | None]:
    mode = str(args.get("mode") or "echarts").strip().lower()
    title = str(args.get("title") or args.get("workspace_name") or "数据可视化").strip()[:80]
    desc = str(args.get("description") or "").strip()[:280]
    category = str(args.get("category") or "ai").strip()
    vid = f"vis_{int(time.time()*1000):x}"

    if mode == "topic_board":
        ws_name = str(args.get("workspace_name") or title or "AI 专题监控").strip()
        b_widgets = args.get("board_widgets") or []
        if not isinstance(b_widgets, list) or not b_widgets:
            return "topic_board 需要非空的 board_widgets 数组。", False, "缺参数", None
        visual = {
            "id": vid,
            "mode": "topic_board",
            "title": ws_name,
            "description": desc or f"包含 {len(b_widgets)} 个联动监控模块的专题看板工作区",
            "workspace_name": ws_name,
            "board_widgets": _strip_unsafe(b_widgets),
        }
        return (
            f"已在回答中生成专题监控看板卡片「{ws_name}」（共 {len(b_widgets)} 个模块），用户可一键创建并打开。",
            True,
            f"{len(b_widgets)} 个模块",
            visual,
        )

    if mode == "cite_widget":
        wtype = str(args.get("widget_type") or "pro_kline").strip()
        wcfg = _strip_unsafe(args.get("config") or {}) if isinstance(args.get("config"), dict) else {}
        if wtype not in BUILTIN_WIDGET_TYPES:
            return f"未知的内置模块类型 {wtype}。", False, "参数错误", None
        visual = {
            "id": vid,
            "mode": "cite_widget",
            "title": title,
            "description": desc or f"实时终端模块：{wtype}",
            "category": category,
            "widget_type": wtype,
            "config": wcfg,
        }
        if args.get("pin_to_dashboard") and cfg is not None:
            pin_widget_to_dashboard(cfg, {
                "boardType": wtype,
                "title": title,
                "defaultW": 12,
                "defaultH": 10,
                "boardConfig": wcfg,
            })
        return f"已在回答中内嵌实时模块「{title}」({wtype})。", True, "已引用", visual

    # Default: mode == "echarts"
    raw_opt = args.get("option")
    if isinstance(raw_opt, str):
        try:
            raw_opt = json.loads(raw_opt)
        except ValueError:
            raw_opt = None
    if not isinstance(raw_opt, dict) or not raw_opt.get("series"):
        return "mode=echarts 必须提供包含 series 的有效 ECharts option 对象。", False, "缺 option", None

    clean_opt = _strip_unsafe(raw_opt)
    saved_item = None
    if (args.get("save_to_library") or args.get("pin_to_dashboard")) and widget_store is not None:
        saved_item = widget_store.save_item({
            "title": title,
            "description": desc or f"{title}（AI 生成 ECharts 可视化模块）",
            "category": category,
            "renderer": "echarts",
            "spec": {"option": clean_opt},
            "defaultW": 12,
            "defaultH": 10,
        })
    if args.get("pin_to_dashboard") and cfg is not None:
        pin_widget_to_dashboard(cfg, {
            "boardType": "custom_echarts",
            "title": title,
            "defaultW": 12,
            "defaultH": 10,
            "boardConfig": {
                "customWidgetId": saved_item["id"] if saved_item else "",
                "description": desc,
                "option": clean_opt,
            },
        })

    visual = {
        "id": vid,
        "mode": "echarts",
        "title": title,
        "description": desc or f"{title} · 交互式数据可视化",
        "category": category,
        "option": clean_opt,
        "savedWidgetId": saved_item["id"] if saved_item else "",
        "pinned": bool(args.get("pin_to_dashboard")),
    }
    msg = f"已在回答中渲染交互式 ECharts 图表「{title}」"
    if saved_item:
        msg += f"，并已存入模块库 (id={saved_item['id']})"
    if args.get("pin_to_dashboard"):
        msg += "且已钉选到当前看板"
    return msg + "。请直接围绕数据结论作答，不必重复贴出 JSON。", True, "已绘图", visual
