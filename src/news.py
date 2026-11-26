from __future__ import annotations

import concurrent.futures
import contextlib
import email.utils
import hashlib
import html
import json
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import numpy as np

import embed as embed_mod
import news_engine as eng_mod
import providers as prov_mod

USER_AGENT = "O2-News/1.0 (+https://localhost)"

# Authority tier heuristics (5=Central Banks/Gov/Top Wires, 4=Major Broadsheets/Trade, 3=General, 2=Flashes/Hotlists)
_TIER5_KEYWORDS = (
    "federal reserve", "ecb press", "cbr ", "俄罗斯央行", "white house", "中国政府网", "新华网",
    "人民日报", "reuters", "bloomberg", "financial times", "华尔街日报", "wsj", "tass", "塔斯社",
    "ria novosti", "俄新社", "interfax", "国际文传", "yonhap", "韩联社", "nhk", "cisa",
    "nature", "science", "caac", "中国民航局",
)
_TIER4_KEYWORDS = (
    "bbc", "nyt", "guardian", "economist", "cnbc", "washington post", "kommersant", "生意人报",
    "vedomosti", "公报", "rbc", "asahi", "朝日新闻", "oilprice", "gcaptain", "splash247",
    "trendforce", "ft 中文", "中央社", "量子位", "36氪", "虎嗅", "spiegel", "diplomat", "人民网",
    "中国新闻网", "mit technology review",
)
_TIER2_KEYWORDS = (
    "金十", "快讯", "热搜", "hacker news", "newsflash",
)


def infer_feed_tier(name: str = "", url: str = "", category: str = "") -> int:
    s = f"{name} {url}".lower()
    if any(k in s for k in _TIER2_KEYWORDS):
        return 2
    if any(k in s for k in _TIER5_KEYWORDS):
        return 5
    if any(k in s for k in _TIER4_KEYWORDS):
        return 4
    if category in ("央行政策",):
        return 5
    return 3


# Institutional BREAKING news rule signals (fair across ZH / EN / RU / JA even before LLM scoring)
_BRK_WIRE_RE = re.compile(
    r"(?:\b(?:BREAKING|URGENT|FLASH|ALERT)\b|【(?:突发|重磅|紧急|快讯)】|突发[:：]|紧急[:：]|СРОЧНО|МОЛНИЯ|速報)",
    re.IGNORECASE,
)
_BRK_CENTRAL_BANK_RE = re.compile(
    r"(?:降息|加息|降准|利率决议|央行|美联储|欧洲央行|日本央行|货币政策|财政刺激|"
    r"\b(?:FOMC|rate\s+(?:cut|hike)|interest\s+rate|Federal\s+Reserve|Fed\s+(?:cuts|hikes|holds|signals)|ECB\s+(?:cuts|hikes)|BOJ|PBOC)\b|"
    r"ЦБ\s*РФ|ключев\w+\s+ставк|ФРС|ЕЦБ|利上げ|利下げ|日銀|金融政策)",
    re.IGNORECASE,
)
_BRK_GEO_SHOCK_RE = re.compile(
    r"(?:空袭|导弹|停火|宣战|全面制裁|新制裁|袭击|地震|爆炸|政变|封锁|戒严|紧急状态|"
    r"\b(?:airstrike|missile\s+strike|ceasefire|sanctions|OFAC|blacklists?|embargo|invasion|earthquake|explosion|coup|martial\s+law|state\s+of\s+emergency)\b|"
    r"ракетн\w+\s+удар|авиаудар|перемири|санкци|теракт|взрыв|землетрясени|ミサイル|空爆|停戦|制裁|緊急事態)",
    re.IGNORECASE,
)
_BRK_MKT_MARITIME_RE = re.compile(
    r"(?:熔断|闪崩|暴跌|暴涨|飙升|危机|违约|破产|停航|运价飙升|红海|霍尔木兹|苏伊士|黑海航运|出口管制|关税|"
    r"\b(?:circuit\s+breaker|plunge|crash|surge|default|bankruptcy|blockade|Red\s+Sea|Strait\s+of\s+Hormuz|Suez\s+Canal|export\s+controls?|tariff)\b|"
    r"обвал|дефолт|банкротств|блокад|пошлин|関税|暴落|急騰)",
    re.IGNORECASE,
)


def _breaking_signal_points(title: str, summary: str = "") -> tuple[float, list[str]]:
    text = f"{title or ''} {(summary or '')[:240]}"
    pts = 0.0
    reasons: list[str] = []
    if _BRK_WIRE_RE.search(title or ""):
        pts += 16.0
        reasons.append("突发快讯")
    if _BRK_CENTRAL_BANK_RE.search(text):
        pts += 20.0
        reasons.append("央行宏观")
    if _BRK_GEO_SHOCK_RE.search(text):
        pts += 18.0
        reasons.append("地缘突发")
    if _BRK_MKT_MARITIME_RE.search(text):
        pts += 14.0
        reasons.append("市场异动")
    return min(34.0, pts), reasons


def _should_promote(
    new_score: float,
    old_score: float,
    *,
    new_feed_id: str = "",
    old_feed_id: str = "",
    new_title: str = "",
    old_title: str = "",
    old_starred: int = 0,
) -> bool:
    if old_starred:
        return False
    # Same-feed rolling wire update (e.g. 4th LD > 2nd LD > LEAD > URGENT): always promote higher revision
    if new_feed_id and new_feed_id == old_feed_id:
        if eng_mod.wire_revision_bonus(new_title) > eng_mod.wire_revision_bonus(old_title) and new_score > old_score:
            return True
    return new_score >= old_score + 6.0


def compute_quality_score(tier: int, title: str, summary: str, content: str, lang: str) -> float:
    rich_len = max(len((summary or "").strip()), min(2000, len((content or "").strip())))
    richness = min(28.0, rich_len / 35.0)
    rev = eng_mod.wire_revision_bonus(title)
    lang_bonus = 3.0 if lang == "zh" else 0.0
    return round(float(tier or 3) * 20.0 + richness + rev + lang_bonus, 2)

DEFAULT_GLOSSARY: list[dict[str, str]] = [
    {"term": "ОАО РЖД", "zh": "俄罗斯铁路公司（俄铁）", "note": "Russian Railways"},
    {"term": "ФРС", "zh": "美联储", "note": "Federal Reserve"},
    {"term": "ЦБ РФ", "zh": "俄罗斯央行", "note": "Bank of Russia"},
    {"term": "ЕЦБ", "zh": "欧洲央行", "note": "ECB"},
    {"term": "Минфин", "zh": "财政部", "note": "Ministry of Finance"},
    {"term": "Росморречфлот", "zh": "俄罗斯联邦海河运输署", "note": "Maritime & River Agency"},
    {"term": "Севморпуть", "zh": "北方海路", "note": "Northern Sea Route"},
    {"term": "OPEC+", "zh": "欧佩克+", "note": "产油国联盟"},
    {"term": "Brent", "zh": "布伦特原油", "note": "国际原油基准"},
    {"term": "WTI", "zh": "WTI原油", "note": "美国原油基准"},
    {"term": "BDI", "zh": "波罗的海干散货指数", "note": "Baltic Dry Index"},
    {"term": "SCFI", "zh": "上海出口集装箱运价指数", "note": "集运运价"},
    {"term": "OFAC", "zh": "美国海外资产控制办公室", "note": "制裁机构"},
    {"term": "FED", "zh": "美联储", "note": "Federal Reserve"},
    {"term": "FOMC", "zh": "联邦公开市场委员会", "note": "美联储议息机构"},
]

PRESET_FEEDS: list[dict[str, str]] = [
    # 国际主流与地缘政治（英文）
    {"name": "BBC World", "url": "https://feeds.bbci.co.uk/news/world/rss.xml", "category": "国际地缘", "lang": "en"},
    {"name": "The Guardian World", "url": "https://www.theguardian.com/world/rss", "category": "国际地缘", "lang": "en"},
    {"name": "The Guardian AU", "url": "https://theguardian.com.au/feed/", "category": "国际地缘", "lang": "en"},
    {"name": "NYT HomePage", "url": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", "category": "国际地缘", "lang": "en"},
    {"name": "NYT World", "url": "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "category": "国际地缘", "lang": "en"},
    {"name": "NPR News", "url": "https://feeds.npr.org/1001/rss.xml", "category": "国际地缘", "lang": "en"},
    {"name": "NPR World", "url": "https://feeds.npr.org/1004/rss.xml", "category": "国际地缘", "lang": "en"},
    {"name": "Washington Post World", "url": "https://feeds.washingtonpost.com/rss/world", "category": "国际地缘", "lang": "en"},
    {"name": "Reuters (Google News)", "url": "https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en", "category": "国际地缘", "lang": "en"},
    {"name": "The Economist US", "url": "https://www.economist.com/united-states/rss.xml", "category": "国际地缘", "lang": "en"},
    {"name": "The War Zone (TWZ)", "url": "https://www.twz.com/category/news-features/feed", "category": "国际地缘", "lang": "en"},
    {"name": "Global News CA", "url": "https://globalnews.ca/feed/", "category": "国际地缘", "lang": "en"},
    {"name": "Al Jazeera", "url": "https://www.aljazeera.com/xml/rss/all.xml", "category": "国际地缘", "lang": "en"},
    {"name": "NBC News World", "url": "https://feeds.nbcnews.com/nbcnews/public/world", "category": "国际地缘", "lang": "en"},
    {"name": "Der Spiegel International", "url": "https://www.spiegel.de/international/index.rss", "category": "国际地缘", "lang": "en"},
    {"name": "Bloomberg Politics", "url": "https://feeds.bloomberg.com/politics/news.rss", "category": "国际地缘", "lang": "en"},
    {"name": "France 24", "url": "https://www.france24.com/en/rss", "category": "国际地缘", "lang": "en"},
    {"name": "DW English", "url": "https://rss.dw.com/rdf/rss-en-all", "category": "国际地缘", "lang": "en"},
    {"name": "Ukrinform", "url": "https://www.ukrinform.net/rss/block-lastnews", "category": "国际地缘", "lang": "en"},
    {"name": "CNBC World", "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362", "category": "国际地缘", "lang": "en"},
    {"name": "The Diplomat", "url": "https://thediplomat.com/feed/", "category": "亚太资讯", "lang": "en"},
    {"name": "Yonhap News EN (韩联社)", "url": "https://en.yna.co.kr/RSS/news.xml", "category": "亚太资讯", "lang": "en"},
    {"name": "Hindustan Times India", "url": "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", "category": "亚太资讯", "lang": "en"},
    {"name": "Hindustan Times World", "url": "https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml", "category": "国际地缘", "lang": "en"},
    # 宏观金融与商业（英文）
    {"name": "Bloomberg Markets", "url": "https://feeds.bloomberg.com/markets/news.rss", "category": "宏观金融", "lang": "en"},
    {"name": "Financial Times", "url": "https://www.ft.com/news-feed?format=rss", "category": "宏观金融", "lang": "en"},
    {"name": "CNBC Top News", "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html", "category": "宏观金融", "lang": "en"},
    {"name": "CNBC Finance", "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", "category": "宏观金融", "lang": "en"},
    {"name": "BBC Business", "url": "https://feeds.bbci.co.uk/news/business/rss.xml", "category": "宏观金融", "lang": "en"},
    {"name": "MarketWatch Top Stories", "url": "https://feeds.content.dowjones.io/public/rss/mw_topstories", "category": "宏观金融", "lang": "en"},
    {"name": "TrendForce 集邦咨询", "url": "https://www.trendforce.com/presscenter/news", "category": "产业科技", "lang": "en"},
    # 政府、央行与安全通告
    {"name": "White House Actions", "url": "https://www.whitehouse.gov/presidential-actions/feed/", "category": "央行政策", "lang": "en"},
    {"name": "White House Briefings", "url": "https://www.whitehouse.gov/briefings-statements/feed/", "category": "央行政策", "lang": "en"},
    {"name": "CISA Advisories", "url": "https://www.cisa.gov/cybersecurity-advisories/all.xml", "category": "科技前沿", "lang": "en"},
    {"name": "Federal Reserve Press", "url": "https://www.federalreserve.gov/feeds/press_all.xml", "category": "央行政策", "lang": "en"},
    {"name": "ECB Press", "url": "https://www.ecb.europa.eu/rss/press.html", "category": "央行政策", "lang": "en"},
    # 航运与能源
    {"name": "OilPrice.com", "url": "https://oilprice.com/rss/main", "category": "大宗能源", "lang": "en"},
    {"name": "gCaptain Maritime", "url": "https://gcaptain.com/feed/", "category": "航运物流", "lang": "en"},
    {"name": "Splash247 Shipping", "url": "https://splash247.com/feed/", "category": "航运物流", "lang": "en"},
    # 科技与科学前沿（英文）
    {"name": "NYT Technology", "url": "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", "category": "科技前沿", "lang": "en"},
    {"name": "Bloomberg Technology", "url": "https://feeds.bloomberg.com/technology/news.rss", "category": "科技前沿", "lang": "en"},
    {"name": "Nature", "url": "https://www.nature.com/nature.rss", "category": "科技前沿", "lang": "en"},
    {"name": "Science", "url": "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science", "category": "科技前沿", "lang": "en"},
    {"name": "MIT Technology Review", "url": "https://www.technologyreview.com/feed/", "category": "科技前沿", "lang": "en"},
    {"name": "New Scientist", "url": "https://www.newscientist.com/section/news/feed/", "category": "科技前沿", "lang": "en"},
    {"name": "NASA", "url": "https://www.nasa.gov/feed/", "category": "科技前沿", "lang": "en"},
    {"name": "Space.com", "url": "https://www.space.com/feeds.xml", "category": "科技前沿", "lang": "en"},
    {"name": "TechCrunch", "url": "https://techcrunch.com/feed/", "category": "科技前沿", "lang": "en"},
    {"name": "The Verge", "url": "https://www.theverge.com/rss/index.xml", "category": "科技前沿", "lang": "en"},
    {"name": "Hacker News", "url": "https://hnrss.org/frontpage", "category": "科技前沿", "lang": "en"},
    {"name": "WIRED", "url": "https://www.wired.com/feed/rss", "category": "科技前沿", "lang": "en"},
    {"name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/index", "category": "科技前沿", "lang": "en"},
    {"name": "Quanta Magazine", "url": "https://www.quantamagazine.org/feed/", "category": "科技前沿", "lang": "en"},
    # 俄文 — 官方通讯社、财经与央行
    {"name": "TASS (塔斯社)", "url": "https://tass.ru/rss/v2.xml", "category": "俄语情报", "lang": "ru"},
    {"name": "RIA Novosti (俄新社)", "url": "https://ria.ru/export/rss2/archive/index.xml", "category": "俄语情报", "lang": "ru"},
    {"name": "Interfax (国际文传)", "url": "https://www.interfax.ru/rss.asp", "category": "俄语情报", "lang": "ru"},
    {"name": "Kommersant (生意人报)", "url": "https://www.kommersant.ru/RSS/news.xml", "category": "俄语财经", "lang": "ru"},
    {"name": "Vedomosti (公报)", "url": "https://www.vedomosti.ru/rss/news", "category": "俄语财经", "lang": "ru"},
    {"name": "CBR 俄罗斯央行", "url": "https://www.cbr.ru/rss/eventrss", "category": "央行政策", "lang": "ru"},
    # 日文 — 亚太主流
    {"name": "朝日新闻 头条", "url": "https://www.asahi.com/rss/asahi/newsheadlines.rdf", "category": "亚太资讯", "lang": "ja"},
    {"name": "朝日新闻 商业", "url": "https://www.asahi.com/rss/asahi/business.rdf", "category": "亚太资讯", "lang": "ja"},
    {"name": "朝日新闻 政治", "url": "https://www.asahi.com/rss/asahi/politics.rdf", "category": "亚太资讯", "lang": "ja"},
    {"name": "NHK 国际", "url": "https://news.web.nhk/n-data/conf/na/rss/cat6.xml", "category": "亚太资讯", "lang": "ja"},
    {"name": "NHK 经济", "url": "https://news.web.nhk/n-data/conf/na/rss/cat5.xml", "category": "亚太资讯", "lang": "ja"},
    {"name": "NHK 综合", "url": "https://news.web.nhk/n-data/conf/na/rss/cat0.xml", "category": "亚太资讯", "lang": "ja"},
    # 中文 — 财经、时政、科技与快讯
    {"name": "华尔街日报 中文", "url": "https://cn.wsj.com/rss-news-and-feeds/zh-hans", "category": "宏观金融", "lang": "zh"},
    {"name": "FT 中文网", "url": "https://www.ftchinese.com/rss/feed", "category": "宏观金融", "lang": "zh"},
    {"name": "金十数据快讯", "url": "https://rsshub.rssforever.com/jin10", "category": "宏观金融", "lang": "zh"},
    {"name": "BBC 中文", "url": "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml", "category": "国际地缘", "lang": "zh"},
    {"name": "俄罗斯卫星通讯社 中文", "url": "https://sputniknews.cn/export/rss2/archive/index.xml", "category": "俄语情报", "lang": "zh"},
    {"name": "韩联社 中文", "url": "https://cn.yna.co.kr/RSS/news.xml", "category": "亚太资讯", "lang": "zh"},
    {"name": "中央社 政治", "url": "https://feeds.feedburner.com/rsscna/politics", "category": "亚太资讯", "lang": "zh"},
    {"name": "中央社 科技", "url": "https://feeds.feedburner.com/rsscna/technology", "category": "产业科技", "lang": "zh"},
    {"name": "中央社 两岸", "url": "https://feeds.feedburner.com/rsscna/mainland", "category": "亚太资讯", "lang": "zh"},
    {"name": "中央社 国际", "url": "https://feeds.feedburner.com/rsscna/intworld", "category": "国际地缘", "lang": "zh"},
    {"name": "新华网", "url": "https://plink.anyfeeder.com/newscn/whxw", "category": "央行政策", "lang": "zh"},
    {"name": "人民日报", "url": "https://plink.anyfeeder.com/people-daily", "category": "央行政策", "lang": "zh"},
    {"name": "中国新闻网滚动", "url": "http://www.chinanews.com.cn/rss/scroll-news.xml", "category": "国际地缘", "lang": "zh"},
    {"name": "人民网财经", "url": "http://www.people.com.cn/rss/finance.xml", "category": "宏观金融", "lang": "zh"},
    {"name": "中国民航局 CAAC", "url": "http://www.caac.gov.cn/index.html", "category": "航运物流", "lang": "zh"},
    {"name": "百度热搜", "url": "https://rss.aishort.top/?type=baidu", "category": "综合", "lang": "zh"},
    {"name": "量子位", "url": "https://www.qbitai.com/feed", "category": "产业科技", "lang": "zh"},
    {"name": "36氪", "url": "https://36kr.com/feed", "category": "产业科技", "lang": "zh"},
    {"name": "36氪快讯", "url": "https://36kr.com/newsflashes/", "category": "产业科技", "lang": "zh"},
]

DEFAULT_DASHBOARD_LAYOUT: dict = {
    "version": 2,
    "cols": 24,
    "locked": False,
    "pulseWidth": 268,
    "watchlistSplitWidth": 232,
    "activeWorkspace": "intel_overview",
    "workspaces": [
        {
            "id": "intel_overview",
            "name": "终端总览",
            "widgets": [
                {"id": "w_watchlist_slot", "type": "watchlist_slot", "title": "WATCHLIST & K-LINE", "x": 0, "y": 0, "w": 16, "h": 12, "minW": 8, "minH": 8, "colSpan": 8, "enabled": True, "config": {}},
                {"id": "w_sentiment_gauge", "type": "sentiment_gauge", "title": "RISK PULSE", "x": 16, "y": 0, "w": 8, "h": 12, "minW": 5, "minH": 7, "colSpan": 4, "enabled": True, "config": {}},
                {"id": "w_sector_heatmap", "type": "sector_heatmap", "title": "SECTOR HEATMAP", "x": 0, "y": 12, "w": 12, "h": 10, "minW": 6, "minH": 7, "colSpan": 6, "enabled": True, "config": {}},
                {"id": "w_macro_curve", "type": "macro_curve", "title": "MACRO YIELDS & FX", "x": 12, "y": 12, "w": 12, "h": 10, "minW": 6, "minH": 7, "colSpan": 6, "enabled": True, "config": {}},
                {"id": "w_live_wire", "type": "live_wire", "title": "LIVE WIRE", "x": 0, "y": 22, "w": 16, "h": 11, "minW": 7, "minH": 6, "colSpan": 8, "enabled": True, "config": {"limit": 24}},
                {"id": "w_desk_note", "type": "desk_note", "title": "DESK NOTE", "x": 16, "y": 22, "w": 8, "h": 11, "minW": 5, "minH": 6, "colSpan": 4, "enabled": True, "config": {}},
                {"id": "w_entity_pulse", "type": "entity_pulse", "title": "ENTITY GRAPH", "x": 0, "y": 33, "w": 8, "h": 10, "minW": 5, "minH": 7, "colSpan": 4, "enabled": True, "config": {}},
                {"id": "w_geo_odds", "type": "geo_odds", "title": "GEO & PORTWATCH", "x": 8, "y": 33, "w": 8, "h": 10, "minW": 5, "minH": 6, "colSpan": 4, "enabled": True, "config": {}},
                {"id": "w_connector_hub", "type": "connector_hub", "title": "DATA BUS", "x": 16, "y": 33, "w": 8, "h": 10, "minW": 5, "minH": 6, "colSpan": 4, "enabled": True, "config": {}},
                {"id": "w_backtest_slot", "type": "backtest_slot", "title": "QUANT LAB [M4]", "x": 0, "y": 43, "w": 24, "h": 6, "minW": 6, "minH": 5, "colSpan": 12, "enabled": True, "config": {}},
            ],
        },
        {
            "id": "multi_lang_wire",
            "name": "快讯监控",
            "widgets": [
                {"id": "w_wire_all", "type": "live_wire", "title": "LIVE WIRE", "x": 0, "y": 0, "w": 16, "h": 14, "minW": 7, "minH": 6, "colSpan": 8, "enabled": True, "config": {"limit": 40}},
                {"id": "w_entity_pulse_2", "type": "entity_pulse", "title": "ENTITY GRAPH", "x": 16, "y": 0, "w": 8, "h": 14, "minW": 5, "minH": 7, "colSpan": 4, "enabled": True, "config": {}},
                {"id": "w_sentiment_gauge_2", "type": "sentiment_gauge", "title": "RISK PULSE", "x": 0, "y": 14, "w": 10, "h": 10, "minW": 5, "minH": 7, "colSpan": 6, "enabled": True, "config": {}},
                {"id": "w_desk_note_2", "type": "desk_note", "title": "DESK NOTE", "x": 10, "y": 14, "w": 14, "h": 10, "minW": 5, "minH": 6, "colSpan": 6, "enabled": True, "config": {}},
            ],
        },
        {
            "id": "quant_research",
            "name": "投研与宏观",
            "widgets": [
                {"id": "w_watchlist_2", "type": "watchlist_slot", "title": "WATCHLIST & K-LINE", "x": 0, "y": 0, "w": 16, "h": 13, "minW": 8, "minH": 8, "colSpan": 8, "enabled": True, "config": {}},
                {"id": "w_macro_2", "type": "macro_curve", "title": "MACRO YIELDS & FX", "x": 16, "y": 0, "w": 8, "h": 13, "minW": 6, "minH": 7, "colSpan": 4, "enabled": True, "config": {}},
                {"id": "w_sector_2", "type": "sector_heatmap", "title": "SECTOR HEATMAP", "x": 0, "y": 13, "w": 12, "h": 10, "minW": 6, "minH": 7, "colSpan": 6, "enabled": True, "config": {}},
                {"id": "w_geo_2", "type": "geo_odds", "title": "GEO & PORTWATCH", "x": 12, "y": 13, "w": 12, "h": 10, "minW": 5, "minH": 6, "colSpan": 6, "enabled": True, "config": {}},
                {"id": "w_backtest_2", "type": "backtest_slot", "title": "QUANT LAB [M4]", "x": 0, "y": 23, "w": 24, "h": 6, "minW": 6, "minH": 5, "colSpan": 12, "enabled": True, "config": {}},
            ],
        },
    ],
}

_DASH_WIDGET_DEFAULTS: dict[str, tuple[int, int, int, int]] = {
    "watchlist_slot": (16, 12, 8, 8),
    "sector_heatmap": (12, 10, 6, 7),
    "macro_curve": (12, 10, 6, 7),
    "geo_odds": (8, 10, 5, 6),
    "connector_hub": (8, 10, 5, 6),
    "entity_pulse": (8, 10, 5, 7),
    "sentiment_gauge": (8, 10, 5, 7),
    "live_wire": (16, 11, 7, 6),
    "desk_note": (8, 11, 5, 6),
    "backtest_slot": (24, 6, 6, 5),
}


def migrate_dashboard_layout(saved: dict | None) -> tuple[dict, bool]:
    import copy
    if not isinstance(saved, dict) or not saved.get("workspaces"):
        return copy.deepcopy(DEFAULT_DASHBOARD_LAYOUT), False
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
    if "pulseWidth" not in layout:
        layout["pulseWidth"] = 268
        changed = True
    if "watchlistSplitWidth" not in layout:
        layout["watchlistSplitWidth"] = 232
        changed = True

    def_by_ws = {ws["id"]: ws for ws in DEFAULT_DASHBOARD_LAYOUT.get("workspaces", [])}
    has_m3 = any(
        w.get("type") in ("sector_heatmap", "macro_curve", "geo_odds")
        for ws in layout.get("workspaces", [])
        for w in (ws.get("widgets") or [])
    )
    if not has_m3:
        for ws in layout.get("workspaces", []):
            dws = def_by_ws.get(ws.get("id"))
            if not dws:
                continue
            have = {w.get("type") for w in (ws.get("widgets") or [])}
            for dw in (dws.get("widgets") or []):
                if dw.get("type") in ("sector_heatmap", "macro_curve", "geo_odds") and dw.get("type") not in have:
                    ws.setdefault("widgets", []).append(copy.deepcopy(dw))
                    changed = True

    for ws in layout.get("workspaces", []):
        widgets = ws.get("widgets") or []
        need_pack = any("x" not in w or "y" not in w or "w" not in w or "h" not in w for w in widgets)
        cur_x, cur_y, row_h = 0, 0, 0
        for w in widgets:
            wt = w.get("type") or ""
            dw, dh, min_w, min_h = _DASH_WIDGET_DEFAULTS.get(wt, (12, 10, 5, 5))
            if "minW" not in w:
                w["minW"] = min_w
                changed = True
            if "minH" not in w:
                w["minH"] = min_h
                changed = True
            if need_pack or "x" not in w or "y" not in w or "w" not in w or "h" not in w:
                span12 = int(w.get("colSpan") or 0)
                gw = max(min_w, min(24, span12 * 2)) if span12 in (4, 6, 8, 12) else dw
                gh = int(w.get("h") or dh)
                if cur_x + gw > 24:
                    cur_x = 0
                    cur_y += row_h
                    row_h = 0
                w["x"] = cur_x
                w["y"] = cur_y
                w["w"] = gw
                w["h"] = max(min_h, gh)
                cur_x += gw
                row_h = max(row_h, w["h"])
                changed = True
    return layout, changed

SCHEMA = """
CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT '综合',
    lang TEXT DEFAULT 'auto',
    enabled INTEGER DEFAULT 1,
    etag TEXT DEFAULT '',
    last_modified TEXT DEFAULT '',
    last_fetch_at INTEGER DEFAULT 0,
    last_ok_at INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    last_error TEXT DEFAULT '',
    item_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS news_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guid_hash TEXT NOT NULL UNIQUE,
    sim_hash TEXT DEFAULT '',
    cluster_id TEXT DEFAULT '',
    feed_id TEXT NOT NULL,
    feed_name TEXT DEFAULT '',
    category TEXT DEFAULT '综合',
    lang TEXT DEFAULT 'en',
    title_orig TEXT NOT NULL,
    summary_orig TEXT DEFAULT '',
    content_orig TEXT DEFAULT '',
    title_zh TEXT DEFAULT '',
    summary_zh TEXT DEFAULT '',
    content_zh TEXT DEFAULT '',
    url TEXT DEFAULT '',
    author TEXT DEFAULT '',
    published_at INTEGER DEFAULT 0,
    fetched_at INTEGER DEFAULT 0,
    l1_status TEXT DEFAULT 'pending',
    l2_status TEXT DEFAULT 'none',
    sentiment TEXT DEFAULT 'neutral',
    impact INTEGER DEFAULT 0,
    entities_json TEXT DEFAULT '[]',
    tags_json TEXT DEFAULT '[]',
    starred INTEGER DEFAULT 0,
    read INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS news_emb (
    item_id INTEGER PRIMARY KEY,
    dim INTEGER NOT NULL,
    vec BLOB NOT NULL,
    model TEXT,
    provider_id TEXT
);

CREATE TABLE IF NOT EXISTS news_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_name TEXT UNIQUE,
    entity_type TEXT,
    aliases_json TEXT DEFAULT '[]',
    mention_count INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS news_item_entities (
    item_id INTEGER,
    entity_id INTEGER,
    sentiment TEXT DEFAULT 'neutral',
    PRIMARY KEY (item_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_news_pub ON news_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_feed ON news_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_news_lang ON news_items(lang);
CREATE INDEX IF NOT EXISTS idx_news_cat ON news_items(category);
CREATE INDEX IF NOT EXISTS idx_news_l1 ON news_items(l1_status);
CREATE INDEX IF NOT EXISTS idx_news_cluster ON news_items(cluster_id);
CREATE INDEX IF NOT EXISTS idx_news_sim ON news_items(sim_hash);
CREATE INDEX IF NOT EXISTS idx_news_star ON news_items(starred);
"""

_TRACKING_QS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "fbclid", "gclid", "spm", "from", "isappinstalled", "nsukey",
}
_CTRL_XML_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_CYRILLIC_RE = re.compile(r"[\u0400-\u04FF]")
_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RE = re.compile(r"[A-Za-z]")


def _feed_id_for_url(url: str) -> str:
    return "f_" + hashlib.sha1(url.strip().encode("utf-8")).hexdigest()[:12]


def normalize_url(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    try:
        u = urllib.parse.urlsplit(s)
        if not u.scheme or not u.netloc:
            return s
        qs = [
            (k, v)
            for k, v in urllib.parse.parse_qsl(u.query, keep_blank_values=True)
            if k.lower() not in _TRACKING_QS
        ]
        new_q = urllib.parse.urlencode(qs, doseq=True)
        return urllib.parse.urlunsplit((u.scheme.lower(), u.netloc.lower(), u.path, new_q, ""))
    except ValueError:
        return s


def strip_html(raw: str) -> str:
    if not raw:
        return ""
    text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</h[1-6]>", "\n", text)
    text = _TAG_RE.sub(" ", text)
    text = html.unescape(text)
    lines = [_WS_RE.sub(" ", ln).strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def detect_lang(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return "en"
    cyr = len(_CYRILLIC_RE.findall(s))
    cjk = len(_CJK_RE.findall(s))
    lat = len(_LATIN_RE.findall(s))
    total = cyr + cjk + lat
    if total == 0:
        return "other"
    if cyr >= 3 and cyr / total >= 0.25:
        return "ru"
    if cjk >= 2 and cjk / total >= 0.18:
        return "zh"
    if lat >= 3 and lat / total >= 0.35:
        return "en"
    return "other"


def title_simhash(title: str, summary: str = "") -> str:
    return eng_mod.content_simhash(title, summary)


def _hamming_hex(a: str, b: str) -> int:
    return eng_mod.hamming_hex(a, b)


def parse_timestamp(raw: str) -> int:
    s = (raw or "").strip()
    if not s:
        return 0
    try:
        dt = email.utils.parsedate_to_datetime(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        pass
    iso = s
    if iso.endswith("Z"):
        iso = iso[:-1] + "+00:00"
    iso = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", iso)
    try:
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d"):
        try:
            return int(datetime.strptime(s[:19], fmt).replace(tzinfo=timezone.utc).timestamp())
        except ValueError:
            continue
    return 0


def _local_tag(tag) -> str:
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1].lower() if "}" in tag else tag.lower()


def _child_text(node, *names: str) -> str:
    want = {n.lower() for n in names}
    for ch in node:
        if _local_tag(ch.tag) in want:
            txt = "".join(ch.itertext()).strip()
            if txt:
                return txt
    return ""


def _atom_link(node) -> str:
    fallback = ""
    for ch in node:
        if _local_tag(ch.tag) != "link":
            continue
        href = (ch.attrib.get("href") or "").strip()
        rel = (ch.attrib.get("rel") or "alternate").strip().lower()
        if href:
            if rel == "alternate":
                return href
            if not fallback:
                fallback = href
        txt = (ch.text or "").strip()
        if txt and not fallback:
            fallback = txt
    return fallback


def parse_feed_xml(raw_bytes: bytes, feed_url: str = "") -> tuple[str, list[dict]]:
    root = None
    try:
        root, _is_lxml = eng_mod.parse_xml_root_fast(raw_bytes)
    except Exception:
        root = None

    if root is None:
        text = ""
        m = re.search(br'encoding=["\']([A-Za-z0-9_\-]+)["\']', raw_bytes[:300], re.I)
        enc_candidates = []
        if m:
            enc_candidates.append(m.group(1).decode("ascii", "ignore"))
        enc_candidates.extend(["utf-8-sig", "utf-8", "cp1251", "gb18030", "latin-1"])
        for enc in enc_candidates:
            try:
                text = raw_bytes.decode(enc)
                break
            except (LookupError, UnicodeDecodeError):
                continue
        if not text:
            text = raw_bytes.decode("utf-8", "replace")
        text = _CTRL_XML_RE.sub("", text).strip()
        root = ET.fromstring(text)
    root_name = _local_tag(root.tag)

    feed_title = ""
    entries: list[ET.Element] = []
    is_atom = root_name == "feed"
    if is_atom:
        feed_title = strip_html(_child_text(root, "title"))
        entries = [ch for ch in root if _local_tag(ch.tag) == "entry"]
    elif root_name == "rss":
        channel = next((ch for ch in root if _local_tag(ch.tag) == "channel"), root)
        feed_title = strip_html(_child_text(channel, "title"))
        entries = [ch for ch in channel if _local_tag(ch.tag) == "item"]
    else:
        # RDF / RSS 1.0
        channel = next((ch for ch in root if _local_tag(ch.tag) == "channel"), None)
        if channel is not None:
            feed_title = strip_html(_child_text(channel, "title"))
        entries = [el for el in root.iter() if _local_tag(el.tag) == "item"]

    items: list[dict] = []
    now = int(time.time())
    for ent in entries:
        title = strip_html(_child_text(ent, "title"))
        link = _atom_link(ent) if is_atom else (_child_text(ent, "link") or _atom_link(ent))
        if not link and feed_url:
            link = ""
        link_norm = normalize_url(link)
        guid = _child_text(ent, "guid", "id") or link_norm or title
        if not title and not link_norm:
            continue
        if not title:
            title = link_norm

        desc_raw = _child_text(ent, "description", "summary")
        content_raw = _child_text(ent, "encoded", "content")
        summary = strip_html(desc_raw or content_raw)
        content = strip_html(content_raw or desc_raw)
        if len(summary) > 600:
            summary = summary[:597].rstrip() + "…"
        if len(content) > 20000:
            content = content[:20000]

        author = strip_html(_child_text(ent, "author", "creator"))
        if not author:
            for ch in ent:
                if _local_tag(ch.tag) == "author":
                    author = strip_html(_child_text(ch, "name"))
                    if author:
                        break
        pub_raw = _child_text(ent, "pubdate", "published", "updated", "date")
        pub_ts = parse_timestamp(pub_raw) or now
        items.append({
            "guid": guid,
            "url": link_norm or link,
            "title_orig": title,
            "summary_orig": summary,
            "content_orig": content,
            "author": author[:120],
            "published_at": pub_ts,
        })
    return feed_title, items


class NewsStore:
    """Thread-safe SQLite store for RSS feeds, multilingual news items, embeddings, and entities."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self._write_lock = threading.Lock()
        self.sim_index = eng_mod.SimHashIndex(window_sec=72 * 3600)
        self._ent_cache_lock = threading.RLock()
        self._ent_cache_loaded = False
        self._ent_by_id: dict[int, dict] = {}
        self._ent_alias_index: dict[str, int] = {}
        with self.con() as c:
            c.executescript(SCHEMA)
        self._migrate_schema()
        self.warm_sim_index()

    def _migrate_schema(self) -> None:
        with self._write_lock, self.con() as c:
            feed_cols = {r["name"] for r in c.execute("PRAGMA table_info(feeds)").fetchall()}
            if "tier" not in feed_cols:
                c.execute("ALTER TABLE feeds ADD COLUMN tier INTEGER DEFAULT 3")
            item_cols = {r["name"] for r in c.execute("PRAGMA table_info(news_items)").fetchall()}
            if "is_canonical" not in item_cols:
                c.execute("ALTER TABLE news_items ADD COLUMN is_canonical INTEGER DEFAULT 1")
            if "quality_score" not in item_cols:
                c.execute("ALTER TABLE news_items ADD COLUMN quality_score REAL DEFAULT 0")
            if "dedup_reason" not in item_cols:
                c.execute("ALTER TABLE news_items ADD COLUMN dedup_reason TEXT DEFAULT ''")
            c.execute("CREATE INDEX IF NOT EXISTS idx_news_canon_pub ON news_items(is_canonical, published_at DESC)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_news_canon_l1 ON news_items(is_canonical, l1_status, published_at DESC)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_news_entities_lower ON news_entities(LOWER(canonical_name))")

            # Backfill authority tiers for feeds that still have default/NULL tier
            for fr in c.execute("SELECT id, name, url, category, tier FROM feeds").fetchall():
                cur_t = fr["tier"]
                inferred = infer_feed_tier(fr["name"] or "", fr["url"] or "", fr["category"] or "")
                if cur_t is None or (int(cur_t) == 3 and inferred != 3):
                    c.execute("UPDATE feeds SET tier=? WHERE id=?", (inferred, fr["id"]))

    def warm_sim_index(self, window_hours: int = 72) -> int:
        cutoff = int(time.time()) - max(1, int(window_hours)) * 3600
        self.sim_index.clear()
        with self.con() as c:
            rows = c.execute(
                """SELECT id, sim_hash, cluster_id, published_at, feed_id, title_orig, summary_orig
                   FROM news_items
                   WHERE is_canonical = 1 AND published_at >= ?""",
                (cutoff,),
            ).fetchall()
        for r in rows:
            sh = r["sim_hash"] or eng_mod.content_simhash(r["title_orig"] or "", r["summary_orig"] or "")
            self.sim_index.add(
                int(r["id"]),
                sh,
                r["cluster_id"] or "",
                int(r["published_at"] or 0),
                feed_id=r["feed_id"] or "",
                has_body=bool((r["summary_orig"] or "").strip()),
                title=r["title_orig"] or "",
            )
        return len(rows)

    @contextlib.contextmanager
    def con(self):
        c = sqlite3.connect(self.db_path, timeout=15.0, check_same_thread=False)
        c.row_factory = sqlite3.Row
        try:
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA synchronous=NORMAL")
            c.execute("PRAGMA busy_timeout=5000")
            with c:
                yield c
        finally:
            c.close()

    def list_feeds(self) -> list[dict]:
        with self.con() as c:
            rows = c.execute(
                "SELECT * FROM feeds ORDER BY enabled DESC, category ASC, name ASC"
            ).fetchall()
            return [dict(r) for r in rows]

    def get_feed(self, feed_id: str) -> dict | None:
        with self.con() as c:
            row = c.execute("SELECT * FROM feeds WHERE id=?", (feed_id,)).fetchone()
            return dict(row) if row else None

    def save_feed(self, data: dict) -> dict:
        url = str(data.get("url") or "").strip()
        if not url:
            raise ValueError("RSS 源地址不能为空")
        fid = str(data.get("id") or "").strip() or _feed_id_for_url(url)
        name = str(data.get("name") or "").strip() or urllib.parse.urlsplit(url).netloc or url
        category = str(data.get("category") or "综合").strip() or "综合"
        lang = str(data.get("lang") or "auto").strip().lower() or "auto"
        if lang not in ("auto", "zh", "en", "ru", "other"):
            lang = "auto"
        enabled = 1 if data.get("enabled", True) else 0
        now = int(time.time())
        with self._write_lock, self.con() as c:
            existing = c.execute("SELECT id FROM feeds WHERE id=? OR url=?", (fid, url)).fetchone()
            if existing:
                fid = existing["id"]
                c.execute(
                    "UPDATE feeds SET name=?, url=?, category=?, lang=?, enabled=? WHERE id=?",
                    (name, url, category, lang, enabled, fid),
                )
            else:
                c.execute(
                    """INSERT INTO feeds (id, name, url, category, lang, enabled, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (fid, name, url, category, lang, enabled, now),
                )
            row = c.execute("SELECT * FROM feeds WHERE id=?", (fid,)).fetchone()
            return dict(row)

    def delete_feed(self, feed_id: str, delete_items: bool = False) -> int:
        with self._write_lock, self.con() as c:
            if delete_items:
                c.execute("DELETE FROM news_items WHERE feed_id=?", (feed_id,))
            cur = c.execute("DELETE FROM feeds WHERE id=?", (feed_id,))
            return cur.rowcount

    def import_presets(self, langs: list[str] | None = None) -> dict:
        allow = {x.lower() for x in langs} if langs else None
        added = 0
        skipped = 0
        now = int(time.time())
        with self._write_lock, self.con() as c:
            existing = {
                normalize_url(r["url"]).rstrip("/")
                for r in c.execute("SELECT url FROM feeds").fetchall()
                if r["url"]
            }
            for item in PRESET_FEEDS:
                if allow and item["lang"].lower() not in allow:
                    continue
                url = item["url"].strip()
                norm = normalize_url(url).rstrip("/")
                if norm in existing:
                    skipped += 1
                    continue
                fid = _feed_id_for_url(url)
                c.execute(
                    """INSERT OR IGNORE INTO feeds (id, name, url, category, lang, enabled, created_at)
                       VALUES (?, ?, ?, ?, ?, 1, ?)""",
                    (fid, item["name"], url, item["category"], item["lang"], now),
                )
                existing.add(norm)
                added += 1
        return {"added": added, "skipped": skipped}

    def import_opml(self, xml_text: str) -> dict:
        cleaned = _CTRL_XML_RE.sub("", xml_text or "").strip()
        if not cleaned:
            raise ValueError("OPML 内容为空")
        root = ET.fromstring(cleaned)
        body = next((ch for ch in root if _local_tag(ch.tag) == "body"), root)
        found: list[tuple[str, str, str]] = []

        def walk(node: ET.Element, group: str) -> None:
            for ch in node:
                if _local_tag(ch.tag) != "outline":
                    continue
                url = (ch.attrib.get("xmlUrl") or ch.attrib.get("xmlurl") or "").strip()
                title = (
                    ch.attrib.get("title")
                    or ch.attrib.get("text")
                    or urllib.parse.urlsplit(url).netloc
                    or "未命名源"
                ).strip()
                if url:
                    found.append((title, url, group or "OPML 导入"))
                else:
                    sub = (ch.attrib.get("title") or ch.attrib.get("text") or group).strip()
                    walk(ch, sub)

        walk(body, "综合")
        added = 0
        skipped = 0
        now = int(time.time())
        with self._write_lock, self.con() as c:
            for title, url, cat in found:
                if c.execute("SELECT 1 FROM feeds WHERE url=?", (url,)).fetchone():
                    skipped += 1
                    continue
                fid = _feed_id_for_url(url)
                c.execute(
                    """INSERT OR IGNORE INTO feeds (id, name, url, category, lang, enabled, created_at)
                       VALUES (?, ?, ?, ?, 'auto', 1, ?)""",
                    (fid, title[:120], url, cat[:60], now),
                )
                added += 1
        return {"total": len(found), "added": added, "skipped": skipped}

    def export_opml(self) -> str:
        feeds = self.list_feeds()
        groups: dict[str, list[dict]] = {}
        for f in feeds:
            groups.setdefault(f.get("category") or "综合", []).append(f)
        opml = ET.Element("opml", {"version": "2.0"})
        head = ET.SubElement(opml, "head")
        ET.SubElement(head, "title").text = "O2 情报终端 RSS 订阅源"
        body = ET.SubElement(opml, "body")
        for cat, items in groups.items():
            grp = ET.SubElement(body, "outline", {"text": cat, "title": cat})
            for f in items:
                ET.SubElement(
                    grp,
                    "outline",
                    {
                        "type": "rss",
                        "text": f.get("name") or "",
                        "title": f.get("name") or "",
                        "xmlUrl": f.get("url") or "",
                    },
                )
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(opml, encoding="unicode")

    def record_feed_result(
        self,
        feed_id: str,
        *,
        ok: bool,
        etag: str = "",
        last_modified: str = "",
        error: str = "",
    ) -> None:
        now = int(time.time())
        with self._write_lock, self.con() as c:
            cnt_row = c.execute("SELECT COUNT(*) AS n FROM news_items WHERE feed_id=?", (feed_id,)).fetchone()
            cnt = int(cnt_row["n"]) if cnt_row else 0
            if ok:
                c.execute(
                    """UPDATE feeds SET last_fetch_at=?, last_ok_at=?, fail_count=0, last_error='',
                       etag=?, last_modified=?, item_count=? WHERE id=?""",
                    (now, now, etag, last_modified, cnt, feed_id),
                )
            else:
                c.execute(
                    """UPDATE feeds SET last_fetch_at=?, fail_count=fail_count+1, last_error=?, item_count=?
                       WHERE id=?""",
                    (now, error[:400], cnt, feed_id),
                )

    def insert_items(self, feed: dict, parsed: list[dict]) -> int:
        return int(self.insert_items_detailed(feed, parsed).get("inserted") or 0)

    def insert_items_detailed(self, feed: dict, parsed: list[dict]) -> dict:
        if not parsed:
            return {"inserted": 0, "canonical_ids": [], "demoted_ids": [], "l1_deduped": 0}
        now = int(time.time())
        inserted = 0
        l1_deduped = 0
        canonical_ids: list[int] = []
        demoted_ids: list[int] = []
        feed_lang = (feed.get("lang") or "auto").lower()
        tier = int(feed.get("tier") or infer_feed_tier(feed.get("name") or "", feed.get("url") or "", feed.get("category") or ""))

        with self._write_lock, self.con() as c:
            for it in parsed:
                key_src = it["url"] or f"{feed['id']}::{it['guid']}::{it['title_orig']}"
                guid_hash = hashlib.sha1(key_src.encode("utf-8")).hexdigest()
                if c.execute("SELECT 1 FROM news_items WHERE guid_hash=?", (guid_hash,)).fetchone():
                    continue

                title = it["title_orig"]
                summary = it["summary_orig"]
                content = it["content_orig"]
                pub_ts = int(it["published_at"] or now)
                lang = feed_lang if feed_lang in ("zh", "en", "ru", "ja") else detect_lang(f"{title} {summary}")
                sh = eng_mod.content_simhash(title, summary)
                q_score = compute_quality_score(tier, title, summary, content, lang)
                has_body = bool((summary or "").strip())

                match = self.sim_index.query(
                    sh,
                    pub_ts,
                    max_hamming=5,
                    feed_id=feed["id"],
                    has_body=has_body,
                    title=title,
                )

                is_zh = lang == "zh"
                is_canonical = 1
                dedup_reason = ""
                l1_status = "done" if is_zh else "pending"
                cluster_id = guid_hash[:12]
                demote_target_id = 0

                if match is not None:
                    match_id, match_cid, _dist = match
                    mrow = c.execute(
                        "SELECT id, cluster_id, feed_id, title_orig, quality_score, starred, l1_status FROM news_items WHERE id=?",
                        (match_id,),
                    ).fetchone()
                    if mrow:
                        cluster_id = mrow["cluster_id"] or match_cid or cluster_id
                        old_score = float(mrow["quality_score"] or 0.0)
                        if _should_promote(
                            q_score, old_score,
                            new_feed_id=feed["id"], old_feed_id=mrow["feed_id"] or "",
                            new_title=title, old_title=mrow["title_orig"] or "",
                            old_starred=int(mrow["starred"] or 0),
                        ):
                            # Promote newer / higher-authority / fuller wire update (e.g. 4th LD > URGENT)
                            is_canonical = 1
                            dedup_reason = ""
                            demote_target_id = int(mrow["id"])
                        else:
                            # Fold duplicate immediately: 0 LLM, 0 GPU embedding, 0 vector/FTS indexing
                            is_canonical = 0
                            l1_status = "skipped_dup"
                            dedup_reason = "simhash"
                            l1_deduped += 1

                cur = c.execute(
                    """INSERT OR IGNORE INTO news_items (
                        guid_hash, sim_hash, cluster_id, feed_id, feed_name, category, lang,
                        title_orig, summary_orig, content_orig,
                        title_zh, summary_zh, content_zh,
                        url, author, published_at, fetched_at, l1_status, l2_status,
                        is_canonical, quality_score, dedup_reason
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, 'none', ?, ?, ?)""",
                    (
                        guid_hash,
                        sh,
                        cluster_id,
                        feed["id"],
                        feed.get("name") or "",
                        feed.get("category") or "综合",
                        lang,
                        title,
                        summary,
                        content,
                        title if is_zh else "",
                        summary if is_zh else "",
                        it["url"],
                        it["author"],
                        pub_ts,
                        now,
                        l1_status,
                        is_canonical,
                        q_score,
                        dedup_reason,
                    ),
                )
                new_id = int(cur.lastrowid or 0)
                if cur.rowcount <= 0 or new_id <= 0:
                    continue
                inserted += 1

                if demote_target_id > 0:
                    c.execute(
                        """UPDATE news_items
                           SET is_canonical = 0,
                               dedup_reason = 'demoted',
                               l1_status = CASE WHEN l1_status = 'pending' THEN 'skipped_dup' ELSE l1_status END
                           WHERE id = ?""",
                        (demote_target_id,),
                    )
                    c.execute("DELETE FROM news_emb WHERE item_id=?", (demote_target_id,))
                    self.sim_index.remove(demote_target_id)
                    demoted_ids.append(demote_target_id)

                if is_canonical == 1:
                    self.sim_index.add(
                        new_id,
                        sh,
                        cluster_id,
                        pub_ts,
                        feed_id=feed["id"],
                        has_body=has_body,
                        title=title,
                    )
                    canonical_ids.append(new_id)

        return {
            "inserted": inserted,
            "canonical_ids": canonical_ids,
            "demoted_ids": demoted_ids,
            "l1_deduped": l1_deduped,
        }

    def query_items(
        self,
        *,
        lang: str = "",
        category: str = "",
        feed_id: str = "",
        q: str = "",
        starred: bool = False,
        sentiment: str = "",
        min_impact: int = 0,
        hours: int = 0,
        entity: str = "",
        unread_only: bool = False,
        canonical_only: bool = True,
        fts_ids: list[int] | None = None,
        limit: int = 40,
        offset: int = 0,
    ) -> dict:
        where: list[str] = []
        params: list = []
        if canonical_only and not starred:
            where.append("is_canonical = 1")
        if lang and lang != "all":
            where.append("lang = ?")
            params.append(lang)
        if category and category != "all":
            where.append("category = ?")
            params.append(category)
        if feed_id:
            where.append("feed_id = ?")
            params.append(feed_id)
        if starred:
            where.append("starred = 1")
        if unread_only:
            where.append("read = 0")
        if sentiment and sentiment != "all":
            where.append("sentiment = ?")
            params.append(sentiment)
        if min_impact > 0:
            where.append("impact >= ?")
            params.append(min_impact)
        if hours > 0:
            where.append("published_at >= ?")
            params.append(int(time.time()) - hours * 3600)
        if entity.strip():
            ent_name = entity.strip()
            where.append(
                "(id IN (SELECT nie.item_id FROM news_item_entities nie "
                "JOIN news_entities ne ON ne.id=nie.entity_id WHERE ne.canonical_name=?) "
                "OR entities_json LIKE ?)"
            )
            params.extend([ent_name, f"%{ent_name}%"])
        if fts_ids is not None:
            if not fts_ids:
                return {"items": [], "total": 0}
            ph = ",".join("?" for _ in fts_ids)
            where.append(f"id IN ({ph})")
            params.extend(int(i) for i in fts_ids)
        elif q.strip():
            like = f"%{q.strip()}%"
            where.append(
                "(title_zh LIKE ? OR title_orig LIKE ? OR summary_zh LIKE ? "
                "OR summary_orig LIKE ? OR feed_name LIKE ? OR entities_json LIKE ?)"
            )
            params.extend([like, like, like, like, like, like])

        sql_where = ("WHERE " + " AND ".join(where)) if where else ""
        lim = max(1, min(200, int(limit or 40)))
        off = max(0, int(offset or 0))
        with self.con() as c:
            total = int(c.execute(f"SELECT COUNT(*) FROM news_items {sql_where}", params).fetchone()[0])
            rows = c.execute(
                f"""SELECT id, guid_hash, sim_hash, cluster_id, feed_id, feed_name, category, lang,
                           title_orig, summary_orig, title_zh, summary_zh,
                           url, author, published_at, fetched_at,
                           l1_status, l2_status, sentiment, impact, entities_json, tags_json, starred, read
                    FROM news_items {sql_where}
                    ORDER BY published_at DESC, id DESC
                    LIMIT ? OFFSET ?""",
                [*params, lim, off],
            ).fetchall()
            cluster_counts: dict[str, int] = {}
            cids = list({r["cluster_id"] for r in rows if r["cluster_id"]})
            if cids:
                ph = ",".join("?" for _ in cids)
                for cr in c.execute(
                    f"SELECT cluster_id, COUNT(*) AS n FROM news_items WHERE cluster_id IN ({ph}) GROUP BY cluster_id",
                    cids,
                ):
                    cluster_counts[cr["cluster_id"]] = int(cr["n"])
            items = []
            for r in rows:
                d = dict(r)
                d["tags"] = _safe_json_list(d.pop("tags_json", "[]"))
                d["entities"] = _safe_json_list(d.pop("entities_json", "[]"))
                d["cluster_count"] = cluster_counts.get(d["cluster_id"], 1)
                items.append(d)
            return {"items": items, "total": total}

    def get_item(self, item_id: int) -> dict | None:
        with self.con() as c:
            row = c.execute("SELECT * FROM news_items WHERE id=?", (item_id,)).fetchone()
            if not row:
                return None
            d = dict(row)
            d["tags"] = _safe_json_list(d.pop("tags_json", "[]"))
            d["entities"] = _safe_json_list(d.pop("entities_json", "[]"))
            siblings = []
            if d.get("cluster_id"):
                srows = c.execute(
                    """SELECT id, feed_name, lang, title_orig, title_zh, url, published_at, sentiment
                       FROM news_items WHERE cluster_id=? AND id!=? ORDER BY published_at DESC LIMIT 12""",
                    (d["cluster_id"], item_id),
                ).fetchall()
                siblings = [dict(x) for x in srows]
            d["cluster_items"] = siblings
            return d

    def toggle_star(self, item_id: int, starred: bool | None = None) -> bool:
        with self._write_lock, self.con() as c:
            row = c.execute("SELECT starred FROM news_items WHERE id=?", (item_id,)).fetchone()
            if not row:
                return False
            nxt = (1 if starred else 0) if starred is not None else (0 if row["starred"] else 1)
            c.execute("UPDATE news_items SET starred=? WHERE id=?", (nxt, item_id))
            return bool(nxt)

    def mark_read(self, item_id: int) -> None:
        with self._write_lock, self.con() as c:
            c.execute("UPDATE news_items SET read=1 WHERE id=?", (item_id,))

    def mark_all_read(self) -> int:
        with self._write_lock, self.con() as c:
            cur = c.execute("UPDATE news_items SET read=1 WHERE read=0")
            return cur.rowcount

    def _ensure_entity_cache(self, c: sqlite3.Connection) -> None:
        with self._ent_cache_lock:
            if self._ent_cache_loaded:
                return
            self._ent_by_id.clear()
            self._ent_alias_index.clear()
            for er in c.execute("SELECT id, canonical_name, entity_type, aliases_json FROM news_entities").fetchall():
                eid = int(er["id"])
                aliases = _safe_json_list(er["aliases_json"])
                self._ent_by_id[eid] = {
                    "id": eid,
                    "canonical_name": er["canonical_name"],
                    "entity_type": er["entity_type"] or "ORG",
                    "aliases": aliases,
                }
                self._ent_alias_index[er["canonical_name"].lower()] = eid
                for al in aliases:
                    self._ent_alias_index[str(al).lower()] = eid
            self._ent_cache_loaded = True

    def upsert_item_entities(
        self,
        item_id: int,
        entities: list[dict],
        sentiment: str = "neutral",
        glossary: list[dict] | None = None,
        entity_vec_index=None,
        local_engine=None,
    ) -> list[dict]:
        """Normalize entities via glossary + in-memory alias cache + optional BGE-M3 vector disambiguation."""
        gl_map: dict[str, str] = {}
        for g in (glossary or []) + DEFAULT_GLOSSARY:
            if not isinstance(g, dict):
                continue
            term = str(g.get("term") or "").strip().lower()
            zh = str(g.get("zh") or "").strip()
            if term and zh:
                gl_map[term] = zh

        sent = sentiment if sentiment in ("bullish", "bearish", "neutral") else "neutral"
        now = int(time.time())
        normalized: list[dict] = []
        seen_canon: set[str] = set()
        new_entity_vecs: list[tuple[int, str]] = []

        with self._write_lock, self.con() as c:
            self._ensure_entity_cache(c)
            c.execute("DELETE FROM news_item_entities WHERE item_id=?", (item_id,))
            for raw in entities[:6]:
                if isinstance(raw, str):
                    raw_name, etype, raw_alias = raw.strip(), "ORG", ""
                elif isinstance(raw, dict):
                    raw_name = str(raw.get("name") or raw.get("canonical_name") or "").strip()
                    etype = str(raw.get("type") or raw.get("entity_type") or "ORG").strip().upper()
                    raw_alias = str(raw.get("alias") or "").strip()
                else:
                    continue
                if not raw_name or len(raw_name) > 80:
                    continue
                if etype not in ("ORG", "PER", "LOC", "ASSET", "EVENT"):
                    etype = "ORG"

                canon = gl_map.get(raw_name.lower()) or gl_map.get(raw_alias.lower()) or raw_name
                if canon in seen_canon:
                    continue
                seen_canon.add(canon)

                with self._ent_cache_lock:
                    eid = self._ent_alias_index.get(canon.lower()) or self._ent_alias_index.get(raw_name.lower())
                    if eid is None and raw_alias:
                        eid = self._ent_alias_index.get(raw_alias.lower())

                # Cross-lingual vector disambiguation via USearch + BGE-M3 (merges Fed/ФРС/美联储)
                cand_vec = None
                if eid is None and entity_vec_index is not None and local_engine is not None and len(entity_vec_index) > 0:
                    try:
                        q_txt = f"{canon} ({raw_alias})" if raw_alias and raw_alias.lower() != canon.lower() else canon
                        cand_vec = local_engine.encode([q_txt], batch_size=1, max_length=64)[0]
                        hits = entity_vec_index.search(cand_vec, k=3)
                        for h_eid, h_sim in hits:
                            if h_sim < 0.88:
                                break
                            rec_cand = self._ent_by_id.get(h_eid)
                            if rec_cand and (rec_cand["entity_type"] or "ORG") == etype:
                                eid = h_eid
                                break
                    except Exception:
                        cand_vec = None

                if eid is not None:
                    rec = self._ent_by_id[eid]
                    aliases = list(rec["aliases"])
                    changed = False
                    for cand in (raw_name, raw_alias):
                        if cand and cand != rec["canonical_name"] and cand not in aliases:
                            aliases.append(cand)
                            changed = True
                    c.execute(
                        "UPDATE news_entities SET aliases_json=?, mention_count=mention_count+1, updated_at=? WHERE id=?",
                        (json.dumps(aliases[:24], ensure_ascii=False), now, eid),
                    )
                    if changed:
                        with self._ent_cache_lock:
                            rec["aliases"] = aliases[:24]
                            for al in aliases[:24]:
                                self._ent_alias_index[al.lower()] = eid
                    canon = rec["canonical_name"]
                    etype = rec["entity_type"] or etype
                else:
                    aliases = [x for x in (raw_name, raw_alias) if x and x != canon]
                    cur = c.execute(
                        """INSERT INTO news_entities (canonical_name, entity_type, aliases_json, mention_count, updated_at)
                           VALUES (?, ?, ?, 1, ?)""",
                        (canon, etype, json.dumps(aliases[:24], ensure_ascii=False), now),
                    )
                    eid = int(cur.lastrowid)
                    with self._ent_cache_lock:
                        self._ent_by_id[eid] = {"id": eid, "canonical_name": canon, "entity_type": etype, "aliases": aliases}
                        self._ent_alias_index[canon.lower()] = eid
                        for al in aliases:
                            self._ent_alias_index[al.lower()] = eid
                    if entity_vec_index is not None:
                        if cand_vec is not None:
                            entity_vec_index.add(eid, cand_vec)
                        elif local_engine is not None:
                            new_entity_vecs.append((eid, f"{canon} {raw_alias}".strip()))

                c.execute(
                    "INSERT OR REPLACE INTO news_item_entities (item_id, entity_id, sentiment) VALUES (?, ?, ?)",
                    (item_id, eid, sent),
                )
                normalized.append({"id": eid, "name": canon, "type": etype})

            c.execute(
                "UPDATE news_items SET entities_json=? WHERE id=?",
                (json.dumps(normalized, ensure_ascii=False), item_id),
            )

        if new_entity_vecs and entity_vec_index is not None and local_engine is not None:
            try:
                vecs = local_engine.encode([t for _, t in new_entity_vecs], batch_size=32, max_length=64)
                entity_vec_index.add_batch([i for i, _ in new_entity_vecs], vecs)
                entity_vec_index.save()
            except Exception:
                pass
        return normalized

    def list_entities(
        self,
        *,
        hours: int = 168,
        entity_type: str = "",
        q: str = "",
        limit: int = 40,
    ) -> list[dict]:
        where = ["ni.is_canonical = 1"]
        params: list = []
        if hours > 0:
            where.append("ni.published_at >= ?")
            params.append(int(time.time()) - hours * 3600)
        if entity_type and entity_type != "all":
            where.append("ne.entity_type = ?")
            params.append(entity_type.upper())
        if q.strip():
            like = f"%{q.strip()}%"
            where.append("(ne.canonical_name LIKE ? OR ne.aliases_json LIKE ?)")
            params.extend([like, like])
        sql_w = " AND ".join(where)
        lim = max(1, min(100, int(limit or 40)))
        with self.con() as c:
            rows = c.execute(
                f"""SELECT ne.id, ne.canonical_name, ne.entity_type, ne.aliases_json, ne.mention_count,
                           COUNT(nie.item_id) AS mentions,
                           SUM(CASE WHEN nie.sentiment='bullish' THEN 1 ELSE 0 END) AS bullish,
                           SUM(CASE WHEN nie.sentiment='bearish' THEN 1 ELSE 0 END) AS bearish,
                           SUM(CASE WHEN nie.sentiment='neutral' THEN 1 ELSE 0 END) AS neutral,
                           MAX(ni.published_at) AS last_seen
                    FROM news_entities ne
                    JOIN news_item_entities nie ON nie.entity_id = ne.id
                    JOIN news_items ni ON ni.id = nie.item_id
                    WHERE {sql_w}
                    GROUP BY ne.id
                    ORDER BY mentions DESC, last_seen DESC
                    LIMIT ?""",
                [*params, lim],
            ).fetchall()
            out = []
            for r in rows:
                b, br, nu = int(r["bullish"] or 0), int(r["bearish"] or 0), int(r["neutral"] or 0)
                tot = max(1, b + br + nu)
                out.append({
                    "id": int(r["id"]),
                    "canonical_name": r["canonical_name"],
                    "entity_type": r["entity_type"] or "ORG",
                    "aliases": _safe_json_list(r["aliases_json"]),
                    "total_mentions": int(r["mention_count"] or 0),
                    "mentions": int(r["mentions"] or 0),
                    "bullish": b,
                    "bearish": br,
                    "neutral": nu,
                    "net_sentiment": round((b - br) / tot, 2),
                    "last_seen": int(r["last_seen"] or 0),
                })
            return out

    def entity_profile(self, name_or_id: str, hours: int = 168) -> dict | None:
        key = str(name_or_id or "").strip()
        if not key:
            return None
        cutoff = int(time.time()) - hours * 3600 if hours > 0 else 0
        with self.con() as c:
            if key.isdigit():
                ent = c.execute("SELECT * FROM news_entities WHERE id=?", (int(key),)).fetchone()
            else:
                ent = c.execute(
                    "SELECT * FROM news_entities WHERE canonical_name=? LIMIT 1",
                    (key,),
                ).fetchone()
                if not ent:
                    ent = c.execute(
                        "SELECT * FROM news_entities WHERE canonical_name LIKE ? OR aliases_json LIKE ? LIMIT 1",
                        (f"%{key}%", f"%{key}%"),
                    ).fetchone()
            if not ent:
                return None
            eid = int(ent["id"])
            sent_row = c.execute(
                """SELECT COUNT(*) AS mentions,
                          SUM(CASE WHEN nie.sentiment='bullish' THEN 1 ELSE 0 END) AS bullish,
                          SUM(CASE WHEN nie.sentiment='bearish' THEN 1 ELSE 0 END) AS bearish,
                          SUM(CASE WHEN nie.sentiment='neutral' THEN 1 ELSE 0 END) AS neutral
                   FROM news_item_entities nie
                   JOIN news_items ni ON ni.id = nie.item_id
                   WHERE nie.entity_id=? AND ni.is_canonical=1 AND ni.published_at >= ?""",
                (eid, cutoff),
            ).fetchone()
            co_rows = c.execute(
                """SELECT ne2.id, ne2.canonical_name, ne2.entity_type, COUNT(*) AS co_count
                   FROM news_item_entities a
                   JOIN news_item_entities b ON a.item_id = b.item_id AND b.entity_id != a.entity_id
                   JOIN news_entities ne2 ON ne2.id = b.entity_id
                   JOIN news_items ni ON ni.id = a.item_id
                   WHERE a.entity_id=? AND ni.is_canonical=1 AND ni.published_at >= ?
                   GROUP BY ne2.id
                   ORDER BY co_count DESC
                   LIMIT 15""",
                (eid, cutoff),
            ).fetchall()
            news_rows = c.execute(
                """SELECT ni.id, ni.feed_name, ni.category, ni.lang, ni.title_orig, ni.title_zh,
                          ni.summary_zh, ni.summary_orig, ni.url, ni.published_at, ni.sentiment, ni.impact
                   FROM news_item_entities nie
                   JOIN news_items ni ON ni.id = nie.item_id
                   WHERE nie.entity_id=? AND ni.is_canonical=1 AND ni.published_at >= ?
                   ORDER BY ni.published_at DESC
                   LIMIT 20""",
                (eid, cutoff),
            ).fetchall()
        b = int((sent_row["bullish"] if sent_row else 0) or 0)
        br = int((sent_row["bearish"] if sent_row else 0) or 0)
        nu = int((sent_row["neutral"] if sent_row else 0) or 0)
        return {
            "id": eid,
            "canonical_name": ent["canonical_name"],
            "entity_type": ent["entity_type"] or "ORG",
            "aliases": _safe_json_list(ent["aliases_json"]),
            "total_mentions": int(ent["mention_count"] or 0),
            "mentions": int((sent_row["mentions"] if sent_row else 0) or 0),
            "bullish": b,
            "bearish": br,
            "neutral": nu,
            "net_sentiment": round((b - br) / max(1, b + br + nu), 2),
            "co_entities": [dict(r) for r in co_rows],
            "items": [dict(r) for r in news_rows],
        }

    def entity_graph(self, hours: int = 168, max_nodes: int = 24) -> dict:
        nodes = self.list_entities(hours=hours, limit=max_nodes)
        if not nodes:
            return {"nodes": [], "edges": []}
        ids = [n["id"] for n in nodes]
        ph = ",".join("?" for _ in ids)
        cutoff = int(time.time()) - hours * 3600 if hours > 0 else 0
        with self.con() as c:
            rows = c.execute(
                f"""SELECT a.entity_id AS src, b.entity_id AS dst, COUNT(*) AS weight
                    FROM news_item_entities a
                    JOIN news_item_entities b ON a.item_id = b.item_id AND a.entity_id < b.entity_id
                    JOIN news_items ni ON ni.id = a.item_id
                    WHERE a.entity_id IN ({ph}) AND b.entity_id IN ({ph}) AND ni.is_canonical=1 AND ni.published_at >= ?
                    GROUP BY a.entity_id, b.entity_id
                    ORDER BY weight DESC
                    LIMIT 60""",
                [*ids, *ids, cutoff],
            ).fetchall()
        return {
            "nodes": nodes,
            "edges": [{"source": int(r["src"]), "target": int(r["dst"]), "weight": int(r["weight"])} for r in rows],
        }

    def get_pending_l1(self, limit: int = 24) -> list[dict]:
        with self.con() as c:
            rows = c.execute(
                """SELECT id, lang, title_orig, summary_orig FROM news_items
                   WHERE is_canonical=1 AND l1_status='pending'
                   ORDER BY published_at DESC, id DESC LIMIT ?""",
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]

    def save_l1_batch(self, updates: list[dict]) -> int:
        if not updates:
            return 0
        with self._write_lock, self.con() as c:
            for u in updates:
                c.execute(
                    """UPDATE news_items
                       SET title_zh=?, summary_zh=?, sentiment=?, impact=?, tags_json=?, l1_status=?
                       WHERE id=?""",
                    (
                        u.get("title_zh") or "",
                        u.get("summary_zh") or "",
                        u.get("sentiment") or "neutral",
                        int(u.get("impact") or 0),
                        json.dumps(u.get("tags") or [], ensure_ascii=False),
                        u.get("l1_status") or "done",
                        int(u["id"]),
                    ),
                )
        return len(updates)

    def save_l2_item(self, item_id: int, content_orig: str, content_zh: str) -> None:
        with self._write_lock, self.con() as c:
            c.execute(
                "UPDATE news_items SET content_orig=?, content_zh=?, l2_status='done' WHERE id=?",
                (content_orig, content_zh, item_id),
            )

    def compute_breaking(self, c: sqlite3.Connection, *, hours: int = 24, limit: int = 5) -> list[dict]:
        """Institutional BREAKING scorer:
        Combines time decay (4h half-life) + multi-source/cross-lingual cluster resonance
        + source authority tier + LLM impact + multilingual high-severity signals (fair to ZH/EN/RU/JA).
        """
        now = int(time.time())
        cutoff = now - max(1, int(hours)) * 3600
        rows = c.execute(
            """SELECT ni.id, ni.lang, ni.feed_id, ni.feed_name, ni.category,
                      ni.title_zh, ni.title_orig, ni.summary_zh, ni.summary_orig,
                      ni.impact, ni.sentiment, ni.published_at, ni.cluster_id,
                      IFNULL(f.tier, 3) AS tier
               FROM news_items ni
               LEFT JOIN feeds f ON f.id = ni.feed_id
               WHERE ni.is_canonical = 1 AND ni.published_at >= ?
               ORDER BY ni.published_at DESC
               LIMIT 450""",
            (cutoff,),
        ).fetchall()
        if not rows:
            rows = c.execute(
                """SELECT ni.id, ni.lang, ni.feed_id, ni.feed_name, ni.category,
                          ni.title_zh, ni.title_orig, ni.summary_zh, ni.summary_orig,
                          ni.impact, ni.sentiment, ni.published_at, ni.cluster_id,
                          IFNULL(f.tier, 3) AS tier
                   FROM news_items ni
                   LEFT JOIN feeds f ON f.id = ni.feed_id
                   WHERE ni.is_canonical = 1
                   ORDER BY ni.published_at DESC
                   LIMIT 120"""
            ).fetchall()
        if not rows:
            return []

        cids = list({r["cluster_id"] for r in rows if r["cluster_id"]})
        clst_stats: dict[str, tuple[int, int]] = {}
        if cids:
            ph = ",".join("?" for _ in cids)
            for cr in c.execute(
                f"""SELECT cluster_id, COUNT(*) AS cnt, COUNT(DISTINCT lang) AS langs
                    FROM news_items
                    WHERE cluster_id IN ({ph})
                    GROUP BY cluster_id""",
                cids,
            ):
                clst_stats[cr["cluster_id"]] = (int(cr["cnt"] or 1), int(cr["langs"] or 1))

        scored: list[tuple[float, dict]] = []
        for r in rows:
            cid = r["cluster_id"] or ""
            c_cnt, l_cnt = clst_stats.get(cid, (1, 1))
            age_h = max(0.0, (now - int(r["published_at"] or now)) / 3600.0)
            freshness = 0.5 ** (age_h / 4.0)  # 4-hour half-life

            # 1) Multi-source & cross-lingual resonance (works even before LLM translates!)
            resonance_pts = min(42.0, max(0, c_cnt - 1) * 14.0) + min(48.0, max(0, l_cnt - 1) * 24.0)

            # 2) Severity: LLM impact OR multilingual rule signals (ensures ZH & untranslated wires aren't blind)
            imp = int(r["impact"] or 0)
            llm_pts = {5: 42.0, 4: 26.0, 3: 10.0}.get(imp, 0.0)
            sig_pts, sig_tags = _breaking_signal_points(
                f"{r['title_zh'] or ''} {r['title_orig'] or ''}",
                f"{r['summary_zh'] or ''} {r['summary_orig'] or ''}",
            )
            severity_pts = max(llm_pts, sig_pts) + (0.25 * min(llm_pts, sig_pts))

            # 3) Source authority tier
            tier = int(r["tier"] or 3)
            tier_pts = {5: 16.0, 4: 10.0, 3: 4.0}.get(tier, 0.0)

            raw_score = resonance_pts + severity_pts + tier_pts
            brk_score = round(raw_score * (0.30 + 0.70 * freshness), 1)

            tags = list(sig_tags)
            if l_cnt >= 2:
                tags.insert(0, f"{l_cnt}语共振")
            if c_cnt >= 2:
                tags.insert(0, f"{c_cnt}源报道")
            if imp >= 4:
                tags.append(f"冲击{imp}/5")

            scored.append((
                brk_score,
                {
                    "id": int(r["id"]),
                    "lang": r["lang"],
                    "feed_name": r["feed_name"],
                    "title_zh": r["title_zh"],
                    "title_orig": r["title_orig"],
                    "impact": imp,
                    "sentiment": r["sentiment"],
                    "published_at": int(r["published_at"] or 0),
                    "cluster_count": c_cnt,
                    "lang_count": l_cnt,
                    "breaking_score": brk_score,
                    "breaking_tags": tags[:3],
                },
            ))

        scored.sort(key=lambda x: (x[0], x[1]["published_at"]), reverse=True)
        qualified = [it for sc, it in scored if sc >= 28.0][:limit]
        if qualified:
            return qualified
        return [it for _, it in scored[:2]]

    def status_summary(self) -> dict:
        with self.con() as c:
            feeds_total = int(c.execute("SELECT COUNT(*) FROM feeds").fetchone()[0])
            feeds_enabled = int(c.execute("SELECT COUNT(*) FROM feeds WHERE enabled=1").fetchone()[0])
            feeds_error = int(c.execute("SELECT COUNT(*) FROM feeds WHERE enabled=1 AND fail_count > 0").fetchone()[0])
            raw_items_total = int(c.execute("SELECT COUNT(*) FROM news_items").fetchone()[0])
            items_total = int(c.execute("SELECT COUNT(*) FROM news_items WHERE is_canonical=1").fetchone()[0])
            dedup_saved = max(0, raw_items_total - items_total)
            pending_l1 = int(
                c.execute("SELECT COUNT(*) FROM news_items WHERE is_canonical=1 AND l1_status='pending'").fetchone()[0]
            )
            starred = int(c.execute("SELECT COUNT(*) FROM news_items WHERE starred=1").fetchone()[0])
            unread = int(c.execute("SELECT COUNT(*) FROM news_items WHERE is_canonical=1 AND read=0").fetchone()[0])
            clusters_total = int(c.execute("SELECT COUNT(DISTINCT cluster_id) FROM news_items").fetchone()[0])
            entities_total = int(c.execute("SELECT COUNT(*) FROM news_entities").fetchone()[0])
            embedded_total = int(
                c.execute(
                    "SELECT COUNT(*) FROM news_emb ne JOIN news_items ni ON ni.id=ne.item_id WHERE ni.is_canonical=1"
                ).fetchone()[0]
            )
            lang_rows = c.execute(
                "SELECT lang, COUNT(*) AS n FROM news_items WHERE is_canonical=1 GROUP BY lang"
            ).fetchall()
            cat_rows = c.execute(
                "SELECT category, COUNT(*) AS n FROM news_items WHERE is_canonical=1 GROUP BY category ORDER BY n DESC"
            ).fetchall()
            sent_rows = c.execute(
                "SELECT sentiment, COUNT(*) AS n FROM news_items WHERE is_canonical=1 GROUP BY sentiment"
            ).fetchall()
            brk_items = self.compute_breaking(c, hours=24, limit=5)
        by_sent = {r["sentiment"]: int(r["n"]) for r in sent_rows}
        b_cnt = by_sent.get("bullish", 0)
        br_cnt = by_sent.get("bearish", 0)
        nu_cnt = by_sent.get("neutral", 0)
        net_tone = round((b_cnt - br_cnt) / max(1, b_cnt + br_cnt + nu_cnt), 2)
        return {
            "feeds_total": feeds_total,
            "feeds_enabled": feeds_enabled,
            "feeds_error": feeds_error,
            "items_total": items_total,
            "raw_items_total": raw_items_total,
            "dedup_saved": dedup_saved,
            "dedup_ratio": round(dedup_saved / max(1, raw_items_total), 4),
            "pending_l1": pending_l1,
            "starred": starred,
            "unread": unread,
            "clusters_total": clusters_total,
            "entities_total": entities_total,
            "embedded_total": embedded_total,
            "net_tone": net_tone,
            "breaking": brk_items,
            "by_lang": {r["lang"]: int(r["n"]) for r in lang_rows},
            "by_category": [{"category": r["category"], "count": int(r["n"])} for r in cat_rows],
            "by_sentiment": by_sent,
        }


def _safe_json_list(raw: str) -> list:
    try:
        v = json.loads(raw or "[]")
        return v if isinstance(v, list) else []
    except ValueError:
        return []


def resolve_news_llm(cfg_data: dict) -> dict | None:
    """Resolve dedicated news translation/extraction channel, falling back to main chat channel."""
    pid = (cfg_data.get("news_llm_provider_id") or "").strip()
    mid = (cfg_data.get("news_llm_model") or "").strip()
    if pid:
        ch = prov_mod.resolve(cfg_data, provider_id=pid, model=mid or None)
        if ch and ch.get("api_key"):
            return ch
    ch = prov_mod.resolve(cfg_data)
    if ch and ch.get("api_key"):
        return ch
    return None


def _call_llm(ch: dict, system_prompt: str, user_prompt: str, timeout: float = 45.0) -> str:
    proto = prov_mod.protocol_of(ch.get("protocol"))
    base_url = ch.get("base_url") or ""
    api_key = ch.get("api_key") or ""
    model = ch.get("model") or ""
    if not api_key or not model:
        raise RuntimeError("未配置可用的大模型 API Key 或模型")

    headers = {
        "Content-Type": "application/json",
        "User-Agent": prov_mod.USER_AGENT,
        **prov_mod.extra_headers(base_url, proto, api_key, session="o2-news"),
    }

    if proto == "anthropic":
        url = prov_mod.chat_url(base_url, proto)
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
        payload = {
            "model": model,
            "max_tokens": 2400,
            "temperature": 0.1,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        }
    elif proto == "gemini":
        b = base_url.rstrip("/")
        if "/models/" in b:
            url = f"{b}:generateContent"
        else:
            if not b.endswith(("/v1beta", "/v1")):
                b = b + "/v1beta"
            url = f"{b}/models/{model}:generateContent"
        headers["x-goog-api-key"] = api_key
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 2400},
        }
    else:
        url = prov_mod.chat_url(base_url, proto)
        headers["Authorization"] = f"Bearer {api_key}"
        payload = {
            "model": model,
            "temperature": 0.1,
            "stream": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with prov_mod.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raise RuntimeError(prov_mod.http_error_text(e)) from None

    obj = json.loads(raw)
    if proto == "anthropic":
        parts = [b.get("text") or "" for b in (obj.get("content") or []) if b.get("type") == "text"]
        return "".join(parts).strip()
    if proto == "gemini":
        cands = obj.get("candidates") or []
        parts = ((cands[0].get("content") or {}).get("parts") or []) if cands else []
        return "".join(p.get("text") or "" for p in parts).strip()
    choices = obj.get("choices") or []
    msg = (choices[0].get("message") or {}) if choices else {}
    return str(msg.get("content") or "").strip()


def _extract_json_payload(text: str):
    s = (text or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s).strip()
    try:
        return json.loads(s)
    except ValueError:
        pass
    m = re.search(r"(\[[\s\S]*\]|\{[\s\S]*\})", s)
    if m:
        return json.loads(m.group(1))
    raise ValueError("模型未返回有效 JSON")


def _extract_article_text(html_bytes: bytes) -> str:
    text = html_bytes.decode("utf-8", "replace")
    main_m = re.search(r"(?is)<article[^>]*>([\s\S]*?)</article>", text)
    body = main_m.group(1) if main_m else text
    paras = re.findall(r"(?is)<p[^>]*>([\s\S]*?)</p>", body)
    cleaned = [strip_html(p) for p in paras]
    cleaned = [p for p in cleaned if len(p) >= 24]
    if cleaned:
        return "\n\n".join(cleaned)[:18000]
    return strip_html(body)[:18000]


def _pack_f16(vec: np.ndarray) -> bytes:
    return np.asarray(vec, dtype=np.float16).tobytes()


def _unpack_vec_any(blob: bytes, dim: int = 1024) -> np.ndarray:
    if not blob:
        return np.zeros((0,), dtype=np.float32)
    if len(blob) == dim * 2:
        return np.frombuffer(blob, dtype=np.float16).astype(np.float32)
    if len(blob) == dim * 4:
        return np.frombuffer(blob, dtype=np.float32).copy()
    if len(blob) % 4 == 0:
        return np.frombuffer(blob, dtype=np.float32).copy()
    return np.frombuffer(blob, dtype=np.float16).astype(np.float32)


class NewsManager:
    """Coordinates C/Rust/GPU news pipeline:
    - L0: curl_cffi (C libcurl) + lxml (C libxml2) + trafilatura
    - L1: xxhash banded SimHash (72h sliding window + template-title protection + representative competition)
    - L2: Local GPU BAAI/bge-m3 + USearch (C++20 SIMD HNSW) pre-LLM cross-lingual dedup & indexing + Tantivy (Rust BM25)
    - L3: Canonical-only LLM translation/NER + USearch entity vector disambiguation
    - Search: USearch + Tantivy RRF fusion -> Local GPU BAAI/bge-reranker-v2-m3 cross-encoder rerank
    """

    def __init__(self, db_path: str, config) -> None:
        self.store = NewsStore(db_path)
        self.config = config
        self.data_dir = os.path.dirname(db_path) or "."
        self._op_lock = threading.Lock()
        self._idx_lock = threading.Lock()
        self._wake = threading.Event()
        self._started = False
        self.fetching = False
        self.translating = False
        self.embedding = False
        self.last_fetch_at = 0
        self.last_prune_at = 0
        self.last_fetch_stats: dict = {}
        self.last_error = ""
        self._brief_cache: dict[int, tuple[float, dict]] = {}

        # Native C++/Rust/GPU engines
        embed_name = str(config.data.get("news_embed_model") or "BAAI/bge-m3")
        rerank_name = str(config.data.get("news_rerank_model") or "BAAI/bge-reranker-v2-m3")
        model_cache = os.path.join(self.data_dir, "models")
        self.local_engine = eng_mod.LocalBGEEngine(
            embed_model=embed_name,
            rerank_model=rerank_name,
            cache_dir=model_cache,
        )
        self.vec_index = eng_mod.USearchVectorIndex(
            os.path.join(self.data_dir, "news_vec.usearch"), ndim=1024, dtype="f16"
        )
        self.entity_vec_index = eng_mod.USearchVectorIndex(
            os.path.join(self.data_dir, "entity_vec.usearch"), ndim=1024, dtype="f16"
        )
        self.fts_index = eng_mod.TantivySearchIndex(os.path.join(self.data_dir, "news_tantivy"))

    def start_background(self) -> None:
        if self._started:
            return
        self._started = True
        threading.Thread(target=self._loop, daemon=True, name="o2-news-loop").start()

    def wake(self) -> None:
        self._wake.set()

    def _use_local_embed(self) -> bool:
        return bool(self.config.data.get("news_local_embed", True))

    def _use_local_rerank(self) -> bool:
        return bool(self.config.data.get("news_local_rerank", True))

    def _dedup_window_sec(self) -> int:
        return max(1, int(self.config.data.get("news_dedup_window_hours") or 72)) * 3600

    def _sem_thresholds(self) -> tuple[float, float]:
        same_t = float(self.config.data.get("news_dedup_sem_threshold") or 0.86)
        xlang_t = float(self.config.data.get("news_dedup_xlang_threshold") or 0.83)
        return same_t, xlang_t

    def _loop(self) -> None:
        # Delay slightly after boot so startup stays instant.
        self._wake.wait(4.0)
        while True:
            self._wake.clear()
            cfg_data = self.config.data
            if cfg_data.get("news_enabled"):
                mins = int(cfg_data.get("news_refresh_minutes") or 0)
                now = time.time()
                if mins > 0 and (now - self.last_fetch_at) >= mins * 60:
                    try:
                        feeds = self.store.list_feeds()
                        if any(f.get("enabled") for f in feeds):
                            self.fetch_all()
                            if self.config.data.get("news_auto_translate", True):
                                self.translate_pending(limit=24)
                    except Exception as e:
                        self.last_error = str(e)
                if now - self.last_prune_at > 24 * 3600:
                    try:
                        self.prune_old_data()
                        self.last_prune_at = now
                    except Exception:
                        pass
                wait_sec = max(30, mins * 60) if mins > 0 else 120
            else:
                wait_sec = 60
            self._wake.wait(wait_sec)

    def _expand_url(self, raw_url: str) -> str:
        u = (raw_url or "").strip()
        if u.lower().startswith("rsshub://"):
            base = (self.config.data.get("news_rsshub_base") or "https://rsshub.app").strip().rstrip("/")
            return base + "/" + u[9:].lstrip("/")
        return u

    def _http_get_fast(self, url: str, headers: dict, timeout: float = 15.0) -> tuple[int, bytes, dict]:
        proxy = str(self.config.data.get("market_proxy") or "").strip()
        if eng_mod._cffi_requests is not None:
            try:
                return eng_mod.fetch_url_fast(url, headers=headers, timeout=timeout, proxy=proxy)
            except Exception:
                pass
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with prov_mod.urlopen(req, timeout=timeout, retries=2) as resp:
                status = int(getattr(resp, "status", 200) or 200)
                raw = resp.read() if status != 304 else b""
                rh = getattr(resp, "headers", None)
                hdrs = {k.lower(): v for k, v in rh.items()} if rh else {}
                return status, raw, hdrs
        except urllib.error.HTTPError as e:
            return int(e.code), b"", {}

    def fetch_one_feed(self, feed: dict) -> dict:
        url = self._expand_url(feed.get("url") or "")
        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        }
        if feed.get("etag"):
            headers["If-None-Match"] = feed["etag"]
        if feed.get("last_modified"):
            headers["If-Modified-Since"] = feed["last_modified"]
        try:
            status, raw, resp_headers = self._http_get_fast(url, headers, timeout=15.0)
            if status == 304:
                self.store.record_feed_result(
                    feed["id"], ok=True, etag=feed.get("etag") or "", last_modified=feed.get("last_modified") or ""
                )
                return {"id": feed["id"], "ok": True, "inserted": 0, "canonical_ids": [], "demoted_ids": [], "l1_deduped": 0, "not_modified": True}
            if status >= 400:
                err_msg = f"HTTP {status}"
                self.store.record_feed_result(feed["id"], ok=False, error=err_msg)
                return {"id": feed["id"], "ok": False, "error": err_msg, "inserted": 0, "canonical_ids": [], "demoted_ids": [], "l1_deduped": 0}
            etag = resp_headers.get("etag") or feed.get("etag") or ""
            last_mod = resp_headers.get("last-modified") or feed.get("last_modified") or ""
            _feed_title, items = parse_feed_xml(raw, url)
            res = self.store.insert_items_detailed(feed, items)
            if res["demoted_ids"]:
                for did in res["demoted_ids"]:
                    self.vec_index.remove(did)
                self.fts_index.delete_batch(res["demoted_ids"])
            self.store.record_feed_result(feed["id"], ok=True, etag=etag, last_modified=last_mod)
            return {"id": feed["id"], "ok": True, **res}
        except Exception as e:
            err_msg = prov_mod.network_error_text(e) if isinstance(e, OSError) else str(e)
            self.store.record_feed_result(feed["id"], ok=False, error=err_msg[:300])
            return {"id": feed["id"], "ok": False, "error": err_msg[:300], "inserted": 0, "canonical_ids": [], "demoted_ids": [], "l1_deduped": 0}

    def fetch_all(self, feed_id: str = "") -> dict:
        if not self._op_lock.acquire(blocking=False):
            return {"ok": True, "busy": True, "message": "正在抓取中"}
        self.fetching = True
        self.last_error = ""
        try:
            feeds = self.store.list_feeds()
            targets = [f for f in feeds if f["id"] == feed_id] if feed_id else [f for f in feeds if f.get("enabled")]
            if not targets:
                return {"ok": True, "feeds": 0, "inserted": 0, "errors": 0, "l1_deduped": 0, "l2_deduped": 0}
            results: list[dict] = []
            workers = min(16, max(1, len(targets)))
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                futs = [pool.submit(self.fetch_one_feed, f) for f in targets]
                for fut in concurrent.futures.as_completed(futs):
                    results.append(fut.result())
            inserted = sum(int(r.get("inserted") or 0) for r in results)
            l1_deduped = sum(int(r.get("l1_deduped") or 0) for r in results)
            errors = sum(1 for r in results if not r.get("ok"))
            new_canon_ids: list[int] = []
            for r in results:
                new_canon_ids.extend(r.get("canonical_ids") or [])

            # L2: Pre-LLM cross-lingual semantic dedup + vector/Tantivy indexing on RTX 4070!
            l2_res = {"embedded": 0, "semantic_deduped": 0}
            if new_canon_ids:
                try:
                    l2_res = self.index_and_dedup_semantic(item_ids=new_canon_ids)
                except Exception as e:
                    self.last_error = str(e)

            self.last_fetch_at = int(time.time())
            self.last_fetch_stats = {
                "feeds": len(targets),
                "inserted": inserted,
                "canonical_new": max(0, len(new_canon_ids) - int(l2_res.get("semantic_deduped") or 0)),
                "l1_deduped": l1_deduped,
                "l2_deduped": int(l2_res.get("semantic_deduped") or 0),
                "embedded": int(l2_res.get("embedded") or 0),
                "errors": errors,
            }
            return {"ok": True, **self.last_fetch_stats}
        finally:
            self.fetching = False
            self._op_lock.release()

    @staticmethod
    def _build_embed_text(row: dict) -> str:
        t_orig = (row.get("title_orig") or "").strip()
        t_zh = (row.get("title_zh") or "").strip()
        s_zh = (row.get("summary_zh") or "").strip()
        s_orig = (row.get("summary_orig") or "").strip()
        ents = [e.get("name", "") for e in _safe_json_list(row.get("entities_json", "[]")) if isinstance(e, dict)]
        parts: list[str] = []
        if t_zh and t_zh != t_orig:
            parts.append(t_zh)
        if t_orig:
            parts.append(eng_mod.strip_wire_prefix(t_orig))
        lead = (s_zh or s_orig)[:450]
        if lead and lead.lower() != t_orig.lower():
            parts.append(lead)
        if ents:
            parts.append("实体: " + " ".join(ents))
        return "\n".join(p for p in parts if p) or " "

    def _encode_vectors(self, texts: list[str], *, query: bool = False) -> tuple[np.ndarray, str, str]:
        """Encode via local RTX 4070 BGE-M3 by default, falling back to cloud Embedding API if disabled/unavailable."""
        if self._use_local_embed():
            if self.local_engine.ensure_embedder():
                vecs = self.local_engine.encode(texts, batch_size=48, max_length=384)
                dev = self.local_engine._device
                return vecs, self.local_engine.embed_model_name, f"local-{dev}"
        ch = embed_mod.resolve(self.config.data)
        if not ch or not ch.get("api_key"):
            raise RuntimeError(self.local_engine.last_error or "本地 BGE-M3 与云端 Embedding 均不可用")
        vecs_list: list[list[float]] = []
        for i in range(0, len(texts), 16):
            vecs_list.extend(embed_mod.embed_texts(ch, texts[i : i + 16], query=query))
        arr = np.asarray(vecs_list, dtype=np.float32)
        if arr.ndim == 2 and arr.shape[0] > 0:
            norms = np.linalg.norm(arr, axis=1, keepdims=True)
            arr = arr / np.where(norms > 1e-12, norms, 1.0)
        return arr, ch.get("model") or "", ch.get("id") or ""

    def _fts_doc_dict(self, r: dict) -> dict:
        return {
            "id": int(r["id"]),
            "published_at": int(r.get("published_at") or 0),
            "lang": r.get("lang") or "en",
            "category": r.get("category") or "综合",
            "title_orig": r.get("title_orig") or "",
            "title_zh": r.get("title_zh") or "",
            "summary_orig": r.get("summary_orig") or "",
            "summary_zh": r.get("summary_zh") or "",
            "feed_name": r.get("feed_name") or "",
            "entities": _safe_json_list(r.get("entities_json", "[]")) if isinstance(r.get("entities_json"), str) else (r.get("entities") or []),
        }

    def index_and_dedup_semantic(
        self,
        *,
        item_ids: list[int] | None = None,
        limit: int = 500,
        skip_dedup: bool = False,
    ) -> dict:
        """L2 Cross-Lingual Semantic Dedup + USearch C++ HNSW + Rust Tantivy Indexing (canonical-only)."""
        with self._idx_lock:
            self.embedding = True
            embedded = 0
            sem_deduped = 0
            promoted = 0
            try:
                target_model = self.local_engine.embed_model_name if self._use_local_embed() else ((embed_mod.resolve(self.config.data) or {}).get("model") or "")
                with self.store.con() as c:
                    if item_ids is not None:
                        ids_clean = [int(x) for x in item_ids if int(x) > 0]
                        if not ids_clean:
                            return {"ok": True, "embedded": 0, "semantic_deduped": 0, "promoted": 0}
                        ph = ",".join("?" for _ in ids_clean)
                        rows = c.execute(
                            f"""SELECT id, cluster_id, feed_id, feed_name, category, lang,
                                       title_orig, summary_orig, title_zh, summary_zh,
                                       entities_json, published_at, quality_score, starred, l1_status
                                FROM news_items
                                WHERE is_canonical = 1 AND id IN ({ph})
                                ORDER BY published_at ASC, id ASC""",
                            ids_clean,
                        ).fetchall()
                    else:
                        rows = c.execute(
                            """SELECT ni.id, ni.cluster_id, ni.feed_id, ni.feed_name, ni.category, ni.lang,
                                      ni.title_orig, ni.summary_orig, ni.title_zh, ni.summary_zh,
                                      ni.entities_json, ni.published_at, ni.quality_score, ni.starred, ni.l1_status
                               FROM news_items ni
                               LEFT JOIN news_emb ne ON ne.item_id = ni.id
                               WHERE ni.is_canonical = 1
                                 AND (ne.item_id IS NULL OR ne.model != ?)
                               ORDER BY ni.published_at DESC, ni.id DESC
                               LIMIT ?""",
                            (target_model, max(1, min(2000, int(limit or 500)))),
                        ).fetchall()

                if not rows:
                    return {"ok": True, "embedded": 0, "semantic_deduped": 0, "promoted": 0}

                dicts = [dict(r) for r in rows]
                texts = [self._build_embed_text(d) for d in dicts]
                vecs, model_name, prov_id = self._encode_vectors(texts, query=False)
                if vecs.shape[0] != len(dicts):
                    return {"ok": False, "error": "向量返回条数不匹配", "embedded": 0}

                # Ensure USearch dimension matches model
                dim = int(vecs.shape[1])
                if dim != self.vec_index.ndim:
                    self.vec_index = eng_mod.USearchVectorIndex(self.vec_index.path, ndim=dim, dtype="f16")

                window_sec = self._dedup_window_sec()
                same_thresh, xlang_thresh = self._sem_thresholds()
                fts_upserts: list[dict] = []
                fts_deletes: list[int] = []

                with self.store._write_lock, self.store.con() as c:
                    for d, vec in zip(dicts, vecs):
                        iid = int(d["id"])
                        pub_ts = int(d["published_at"] or 0)
                        lang = d["lang"] or "en"
                        q_score = float(d["quality_score"] or 0.0)
                        is_tpl = eng_mod.is_template_title(d["title_orig"] or "")

                        matched_row = None
                        matched_xlang = False
                        if not skip_dedup and len(self.vec_index) > 0:
                            hits = self.vec_index.search(vec, k=10)
                            cand_ids = [hk for hk, hs in hits if hk != iid and hs >= min(same_thresh, xlang_thresh)]
                            if cand_ids:
                                ph = ",".join("?" for _ in cand_ids)
                                c_map = {
                                    int(cr["id"]): dict(cr)
                                    for cr in c.execute(
                                        f"""SELECT id, cluster_id, feed_id, lang, title_orig, summary_orig,
                                                   published_at, quality_score, starred, l1_status
                                            FROM news_items
                                            WHERE is_canonical = 1 AND id IN ({ph})""",
                                        cand_ids,
                                    ).fetchall()
                                }
                                for hk, hs in hits:
                                    if hk == iid:
                                        continue
                                    cand = c_map.get(hk)
                                    if not cand:
                                        continue
                                    if abs(pub_ts - int(cand["published_at"] or 0)) > window_sec:
                                        continue
                                    is_xlang = (cand["lang"] or "en") != lang
                                    thresh = xlang_thresh if is_xlang else same_thresh
                                    if is_tpl or eng_mod.is_template_title(cand["title_orig"] or ""):
                                        # Recurring template bulletins require near-identical content to merge
                                        thresh = max(thresh, 0.96)
                                    if hs >= thresh:
                                        matched_row = cand
                                        matched_xlang = is_xlang
                                        break

                        if matched_row is not None:
                            cid_target = matched_row["cluster_id"] or d["cluster_id"]
                            old_cid = d["cluster_id"]
                            cand_id = int(matched_row["id"])
                            cand_score = float(matched_row["quality_score"] or 0.0)
                            if _should_promote(
                                q_score, cand_score,
                                new_feed_id=d["feed_id"] or "", old_feed_id=matched_row["feed_id"] or "",
                                new_title=d["title_orig"] or "", old_title=matched_row["title_orig"] or "",
                                old_starred=int(matched_row["starred"] or 0),
                            ):
                                # New article clearly better -> promote new, cascade old cluster siblings, demote old canonical
                                if old_cid and old_cid != cid_target:
                                    c.execute("UPDATE news_items SET cluster_id=? WHERE cluster_id=?", (cid_target, old_cid))
                                c.execute(
                                    "UPDATE news_items SET cluster_id=?, is_canonical=1, dedup_reason='' WHERE id=?",
                                    (cid_target, iid),
                                )
                                c.execute(
                                    """UPDATE news_items
                                       SET is_canonical = 0,
                                           dedup_reason = 'demoted',
                                           l1_status = CASE WHEN l1_status = 'pending' THEN 'skipped_dup' ELSE l1_status END
                                       WHERE id = ?""",
                                    (cand_id,),
                                )
                                c.execute("DELETE FROM news_emb WHERE item_id=?", (cand_id,))
                                self.vec_index.remove(cand_id)
                                self.store.sim_index.remove(cand_id)
                                fts_deletes.append(cand_id)
                                promoted += 1
                                sem_deduped += 1
                            else:
                                # Existing canonical wins -> fold new article & cascade any L1 siblings
                                reason = "semantic_xlang" if matched_xlang else "semantic"
                                if old_cid and old_cid != cid_target:
                                    c.execute("UPDATE news_items SET cluster_id=? WHERE cluster_id=?", (cid_target, old_cid))
                                c.execute(
                                    """UPDATE news_items
                                       SET cluster_id = ?,
                                           is_canonical = 0,
                                           dedup_reason = ?,
                                           l1_status = CASE WHEN l1_status = 'pending' THEN 'skipped_dup' ELSE l1_status END
                                       WHERE id = ?""",
                                    (cid_target, reason, iid),
                                )
                                c.execute("DELETE FROM news_emb WHERE item_id=?", (iid,))
                                self.vec_index.remove(iid)
                                self.store.sim_index.remove(iid)
                                fts_deletes.append(iid)
                                sem_deduped += 1
                                continue

                        # Unique canonical event -> persist vector in SQLite (f16) + C++ USearch + Rust Tantivy
                        c.execute(
                            "INSERT OR REPLACE INTO news_emb (item_id, dim, vec, model, provider_id) VALUES (?, ?, ?, ?, ?)",
                            (iid, dim, _pack_f16(vec), model_name, prov_id),
                        )
                        self.vec_index.add(iid, vec)
                        fts_upserts.append(self._fts_doc_dict(d))
                        embedded += 1

                self.vec_index.save()
                if fts_deletes:
                    self.fts_index.delete_batch(fts_deletes)
                if fts_upserts:
                    self.fts_index.upsert_batch(fts_upserts)
                return {
                    "ok": True,
                    "embedded": embedded,
                    "semantic_deduped": sem_deduped,
                    "promoted": promoted,
                    "model": model_name,
                    "provider": prov_id,
                }
            except Exception as e:
                return {"ok": False, "error": str(e), "embedded": embedded, "semantic_deduped": sem_deduped}
            finally:
                self.embedding = False

    def rebuild_and_dedup_all(self, batch_size: int = 256) -> dict:
        """Full migration/reindex:
        1) Recompute content_simhash & quality_score across all rows
        2) Run L1 banded SimHash dedup chronologically
        3) Run L2 RTX 4070 BGE-M3 cross-lingual semantic dedup + rebuild USearch & Tantivy cleanly
        4) Build Entity USearch vector index for cross-lingual entity disambiguation
        """
        t0 = time.time()
        with self._idx_lock:
            self.embedding = True
            try:
                # Step 1: Load feed tiers & all items chronologically
                with self.store._write_lock, self.store.con() as c:
                    feed_tiers = {
                        r["id"]: int(r["tier"] or infer_feed_tier(r["name"] or "", r["url"] or "", r["category"] or ""))
                        for r in c.execute("SELECT id, name, url, category, tier FROM feeds").fetchall()
                    }
                    all_rows = c.execute(
                        """SELECT id, guid_hash, feed_id, feed_name, category, lang,
                                  title_orig, summary_orig, content_orig, title_zh, summary_zh,
                                  entities_json, published_at, starred, l1_status
                           FROM news_items
                           ORDER BY published_at ASC, id ASC"""
                    ).fetchall()

                    # Reset L1/L2 state cleanly before chronological pass
                    self.store.sim_index.clear()
                    self.vec_index.reset()
                    self.fts_index.reset()
                    c.execute("DELETE FROM news_emb")

                    l1_deduped = 0
                    l1_promoted = 0
                    canon_meta: dict[int, dict] = {}
                    for r in all_rows:
                        iid = int(r["id"])
                        tier = feed_tiers.get(r["feed_id"], 3)
                        title = r["title_orig"] or ""
                        summary = r["summary_orig"] or ""
                        content = r["content_orig"] or ""
                        lang = r["lang"] or "en"
                        pub_ts = int(r["published_at"] or 0)
                        sh = eng_mod.content_simhash(title, summary)
                        q_score = compute_quality_score(tier, title, summary, content, lang)
                        has_body = bool(summary.strip())

                        cid = (r["guid_hash"] or f"{iid}")[:12]
                        is_canon = 1
                        dedup_reason = ""
                        l1_st = r["l1_status"] or ("done" if lang == "zh" else "pending")
                        if l1_st == "skipped_dup":
                            l1_st = "done" if lang == "zh" else "pending"

                        match = self.store.sim_index.query(
                            sh, pub_ts, max_hamming=5, feed_id=r["feed_id"] or "", has_body=has_body, title=title
                        )
                        if match is not None:
                            mid, mcid, _dist = match
                            prev = canon_meta.get(mid)
                            if prev:
                                cid = prev["cluster_id"]
                                if _should_promote(
                                    q_score, prev["quality_score"],
                                    new_feed_id=r["feed_id"] or "", old_feed_id=prev["feed_id"],
                                    new_title=title, old_title=prev["title_orig"],
                                    old_starred=prev["starred"],
                                ):
                                    # Promote newer fuller version
                                    c.execute(
                                        """UPDATE news_items
                                           SET is_canonical=0, dedup_reason='demoted',
                                               l1_status=CASE WHEN l1_status='pending' THEN 'skipped_dup' ELSE l1_status END
                                           WHERE id=?""",
                                        (mid,),
                                    )
                                    self.store.sim_index.remove(mid)
                                    canon_meta.pop(mid, None)
                                    l1_promoted += 1
                                    l1_deduped += 1
                                else:
                                    is_canon = 0
                                    dedup_reason = "simhash"
                                    if l1_st == "pending":
                                        l1_st = "skipped_dup"
                                    l1_deduped += 1

                        c.execute(
                            """UPDATE news_items
                               SET sim_hash=?, cluster_id=?, is_canonical=?, quality_score=?,
                                   dedup_reason=?, l1_status=?
                               WHERE id=?""",
                            (sh, cid, is_canon, q_score, dedup_reason, l1_st, iid),
                        )
                        if is_canon == 1:
                            self.store.sim_index.add(
                                iid, sh, cid, pub_ts, feed_id=r["feed_id"] or "", has_body=has_body, title=title
                            )
                            canon_meta[iid] = {
                                "id": iid,
                                "cluster_id": cid,
                                "feed_id": r["feed_id"] or "",
                                "quality_score": q_score,
                                "starred": int(r["starred"] or 0),
                                "lang": lang,
                                "published_at": pub_ts,
                                "title_orig": title,
                                "row": dict(r),
                            }

                # Step 2: L2 GPU BGE-M3 encoding + chronological cross-lingual dedup + USearch + Tantivy
                canon_list = list(canon_meta.values())
                texts = [self._build_embed_text(x["row"]) for x in canon_list]
                vecs, model_name, prov_id = self._encode_vectors(texts, query=False)
                dim = int(vecs.shape[1]) if vecs.ndim == 2 and vecs.shape[0] > 0 else 1024
                if dim != self.vec_index.ndim:
                    self.vec_index = eng_mod.USearchVectorIndex(self.vec_index.path, ndim=dim, dtype="f16")

                window_sec = self._dedup_window_sec()
                same_thresh, xlang_thresh = self._sem_thresholds()
                l2_deduped = 0
                l2_xlang = 0
                l2_promoted = 0
                active_canon: dict[int, dict] = {}
                surviving_fts: dict[int, dict] = {}

                with self.store._write_lock, self.store.con() as c:
                    for meta, vec in zip(canon_list, vecs):
                        iid = meta["id"]
                        pub_ts = meta["published_at"]
                        lang = meta["lang"]
                        q_score = meta["quality_score"]
                        title = meta["title_orig"]
                        is_tpl = eng_mod.is_template_title(title)

                        matched_cand = None
                        matched_xlang = False
                        if len(self.vec_index) > 0:
                            hits = self.vec_index.search(vec, k=10)
                            for hk, hs in hits:
                                if hs < min(same_thresh, xlang_thresh):
                                    break
                                cand = active_canon.get(hk)
                                if not cand:
                                    continue
                                if abs(pub_ts - cand["published_at"]) > window_sec:
                                    continue
                                is_xlang = cand["lang"] != lang
                                thresh = xlang_thresh if is_xlang else same_thresh
                                if is_tpl or eng_mod.is_template_title(cand["title_orig"]):
                                    thresh = max(thresh, 0.96)
                                if hs >= thresh:
                                    matched_cand = cand
                                    matched_xlang = is_xlang
                                    break

                        if matched_cand is not None:
                            cid_target = matched_cand["cluster_id"]
                            old_cid = meta["cluster_id"]
                            cand_id = matched_cand["id"]
                            if _should_promote(
                                q_score, matched_cand["quality_score"],
                                new_feed_id=meta["feed_id"], old_feed_id=matched_cand["feed_id"],
                                new_title=title, old_title=matched_cand["title_orig"],
                                old_starred=matched_cand["starred"],
                            ):
                                if old_cid and old_cid != cid_target:
                                    c.execute("UPDATE news_items SET cluster_id=? WHERE cluster_id=?", (cid_target, old_cid))
                                c.execute(
                                    "UPDATE news_items SET cluster_id=?, is_canonical=1, dedup_reason='' WHERE id=?",
                                    (cid_target, iid),
                                )
                                c.execute(
                                    """UPDATE news_items
                                       SET is_canonical=0, dedup_reason='demoted',
                                           l1_status=CASE WHEN l1_status='pending' THEN 'skipped_dup' ELSE l1_status END
                                       WHERE id=?""",
                                    (cand_id,),
                                )
                                c.execute("DELETE FROM news_emb WHERE item_id=?", (cand_id,))
                                self.vec_index.remove(cand_id)
                                active_canon.pop(cand_id, None)
                                surviving_fts.pop(cand_id, None)
                                meta["cluster_id"] = cid_target
                                l2_promoted += 1
                                l2_deduped += 1
                                if matched_xlang:
                                    l2_xlang += 1
                            else:
                                reason = "semantic_xlang" if matched_xlang else "semantic"
                                if old_cid and old_cid != cid_target:
                                    c.execute("UPDATE news_items SET cluster_id=? WHERE cluster_id=?", (cid_target, old_cid))
                                c.execute(
                                    """UPDATE news_items
                                       SET cluster_id=?, is_canonical=0, dedup_reason=?,
                                           l1_status=CASE WHEN l1_status='pending' THEN 'skipped_dup' ELSE l1_status END
                                       WHERE id=?""",
                                    (cid_target, reason, iid),
                                )
                                l2_deduped += 1
                                if matched_xlang:
                                    l2_xlang += 1
                                continue

                        c.execute(
                            "INSERT OR REPLACE INTO news_emb (item_id, dim, vec, model, provider_id) VALUES (?, ?, ?, ?, ?)",
                            (iid, dim, _pack_f16(vec), model_name, prov_id),
                        )
                        self.vec_index.add(iid, vec)
                        active_canon[iid] = meta
                        surviving_fts[iid] = self._fts_doc_dict(meta["row"])

                self.vec_index.save(force=True)
                self.fts_index.upsert_batch(list(surviving_fts.values()))
                self.store.warm_sim_index(window_hours=int(window_sec // 3600))

                # Step 3: Build Entity Vector Index for cross-lingual entity disambiguation
                ent_indexed = self._rebuild_entity_vec_index()

                elapsed = round(time.time() - t0, 2)
                return {
                    "ok": True,
                    "raw_total": len(all_rows),
                    "canonical_total": len(active_canon),
                    "l1_deduped": l1_deduped,
                    "l1_promoted": l1_promoted,
                    "l2_deduped": l2_deduped,
                    "l2_xlang_deduped": l2_xlang,
                    "l2_promoted": l2_promoted,
                    "fts_docs": self.fts_index.num_docs(),
                    "vec_docs": len(self.vec_index),
                    "entity_vecs": ent_indexed,
                    "model": model_name,
                    "provider": prov_id,
                    "elapsed_sec": elapsed,
                }
            finally:
                self.embedding = False

    def _rebuild_entity_vec_index(self) -> int:
        if not self._use_local_embed() or not self.local_engine.ensure_embedder():
            return 0
        with self.store.con() as c:
            erows = c.execute("SELECT id, canonical_name, aliases_json FROM news_entities").fetchall()
        if not erows:
            return 0
        self.entity_vec_index.reset()
        ids = []
        texts = []
        for er in erows:
            aliases = _safe_json_list(er["aliases_json"])
            lbl = er["canonical_name"]
            if aliases:
                lbl = f"{lbl} ({', '.join(str(a) for a in aliases[:4])})"
            ids.append(int(er["id"]))
            texts.append(lbl)
        vecs = self.local_engine.encode(texts, batch_size=64, max_length=64)
        self.entity_vec_index.add_batch(ids, vecs)
        self.entity_vec_index.save(force=True)
        return len(ids)

    def prune_old_data(self, dup_content_days: int = 14) -> dict:
        """Keep SQLite lean over 100+ days: strip bulky content_orig from old folded duplicates."""
        cutoff = int(time.time()) - max(1, int(dup_content_days)) * 86400
        with self.store._write_lock, self.store.con() as c:
            cur = c.execute(
                """UPDATE news_items
                   SET content_orig = ''
                   WHERE is_canonical = 0 AND starred = 0 AND published_at < ? AND LENGTH(content_orig) > 0""",
                (cutoff,),
            )
            return {"pruned_dup_bodies": int(cur.rowcount or 0)}

    def _glossary_prompt(self) -> str:
        items = self.config.data.get("news_glossary")
        if not isinstance(items, list) or not items:
            items = DEFAULT_GLOSSARY
        lines = []
        for g in items[:60]:
            if not isinstance(g, dict):
                continue
            t = str(g.get("term") or "").strip()
            z = str(g.get("zh") or "").strip()
            if t and z:
                lines.append(f"- {t} -> {z}")
        return ("\n术语规范（必须严格遵守）：\n" + "\n".join(lines)) if lines else ""

    def _glossary_list(self) -> list[dict]:
        items = self.config.data.get("news_glossary")
        return items if isinstance(items, list) and items else DEFAULT_GLOSSARY

    def _match_zh_glossary_entities(self, title: str, summary: str) -> list[dict]:
        hay = f"{title} {summary}".lower()
        found: list[dict] = []
        seen: set[str] = set()
        for g in self._glossary_list():
            if not isinstance(g, dict):
                continue
            term = str(g.get("term") or "").strip()
            zh = str(g.get("zh") or "").strip()
            if not zh or zh in seen:
                continue
            if (term and term.lower() in hay) or zh.lower() in hay:
                seen.add(zh)
                found.append({"name": zh, "type": "ORG", "alias": term})
        return found[:4]

    def translate_pending(self, limit: int = 24) -> dict:
        ch = resolve_news_llm(self.config.data)
        if not ch:
            return {"ok": False, "error": "未配置可用的大模型 API，请先在设置中填写 API Key"}
        pending = self.store.get_pending_l1(limit=limit)
        if not pending:
            return {"ok": True, "translated": 0}

        self.translating = True
        translated = 0
        updated_ids: list[int] = []
        glossary = self._glossary_list()
        local_eng = self.local_engine if (self._use_local_embed() and self.local_engine._emb_model is not None) else None
        try:
            zh_updates = []
            todo = []
            for it in pending:
                if it["lang"] == "zh":
                    zh_updates.append({
                        "id": it["id"],
                        "title_zh": it["title_orig"],
                        "summary_zh": it["summary_orig"],
                        "sentiment": "neutral",
                        "impact": 2,
                        "tags": [],
                        "l1_status": "done",
                    })
                else:
                    todo.append(it)
            if zh_updates:
                translated += self.store.save_l1_batch(zh_updates)
                for zu in zh_updates:
                    updated_ids.append(int(zu["id"]))
                    ents = self._match_zh_glossary_entities(zu["title_zh"], zu["summary_zh"])
                    if ents:
                        self.store.upsert_item_entities(
                            zu["id"], ents, "neutral", glossary,
                            entity_vec_index=self.entity_vec_index, local_engine=local_eng,
                        )

            sys_prompt = (
                "你是资深中/英/俄/日多语种金融与地缘情报翻译官。"
                "请将输入的每条新闻翻译为准确、专业、简洁的简体中文，并同步抽取实体、情绪与冲击烈度。"
                "严格只返回 JSON 数组，不要输出任何额外解释。"
                "\n每项格式：{\"id\": 数字, \"title_zh\": \"中文标题\", \"summary_zh\": \"1-2句中文核心导语\", "
                "\"sentiment\": \"bullish|bearish|neutral\", \"impact\": 1到5整数, "
                "\"tags\": [\"标签1\", \"标签2\"], "
                "\"entities\": [{\"name\": \"规范中文实体名\", \"type\": \"ORG|PER|LOC|ASSET|EVENT\", \"alias\": \"原文实体名\"}]}"
                "\n注意：entities 每条最多抽取 4 个最核心的机构(ORG)/人物(PER)/国家港口地区(LOC)/金融资产大宗商品(ASSET)/关键事件(EVENT)。"
                + self._glossary_prompt()
            )
            for i in range(0, len(todo), 8):
                batch = todo[i : i + 8]
                payload = [
                    {
                        "id": x["id"],
                        "lang": x["lang"],
                        "title": x["title_orig"],
                        "summary": (x["summary_orig"] or "")[:450],
                    }
                    for x in batch
                ]
                try:
                    raw = _call_llm(ch, sys_prompt, json.dumps(payload, ensure_ascii=False), timeout=55.0)
                    arr = _extract_json_payload(raw)
                    if not isinstance(arr, list):
                        continue
                    by_id = {int(x["id"]): x for x in arr if isinstance(x, dict) and x.get("id") is not None}
                    updates = []
                    ent_jobs: list[tuple[int, list, str]] = []
                    for src in batch:
                        res = by_id.get(int(src["id"]))
                        if not res:
                            continue
                        sent = str(res.get("sentiment") or "neutral").lower()
                        if sent not in ("bullish", "bearish", "neutral"):
                            sent = "neutral"
                        try:
                            imp = max(1, min(5, int(res.get("impact") or 2)))
                        except (TypeError, ValueError):
                            imp = 2
                        tags = [str(t).strip() for t in (res.get("tags") or []) if str(t).strip()][:5]
                        updates.append({
                            "id": src["id"],
                            "title_zh": str(res.get("title_zh") or src["title_orig"]).strip(),
                            "summary_zh": str(res.get("summary_zh") or src["summary_orig"]).strip(),
                            "sentiment": sent,
                            "impact": imp,
                            "tags": tags,
                            "l1_status": "done",
                        })
                        ents = res.get("entities") if isinstance(res.get("entities"), list) else []
                        if ents:
                            ent_jobs.append((int(src["id"]), ents, sent))
                    translated += self.store.save_l1_batch(updates)
                    updated_ids.extend(int(u["id"]) for u in updates)
                    for iid, ents, sent in ent_jobs:
                        self.store.upsert_item_entities(
                            iid, ents, sent, glossary,
                            entity_vec_index=self.entity_vec_index, local_engine=local_eng,
                        )
                except Exception as e:
                    self.last_error = str(e)

            # Refresh Tantivy + USearch vectors for newly translated canonical items (adds ZH & entity signals)
            if updated_ids:
                try:
                    self.index_and_dedup_semantic(item_ids=updated_ids, skip_dedup=True)
                except Exception:
                    pass
            return {"ok": True, "translated": translated}
        finally:
            self.translating = False

    def translate_item_full(self, item_id: int, fetch_full: bool = False) -> dict:
        item = self.store.get_item(item_id)
        if not item:
            return {"ok": False, "error": "新闻条目不存在"}
        content_orig = (item.get("content_orig") or "").strip()
        if (fetch_full or len(content_orig) < 200) and item.get("url"):
            try:
                status, raw_html, _hdrs = self._http_get_fast(
                    item["url"],
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                    timeout=15.0,
                )
                if status == 200 and raw_html:
                    extracted = eng_mod.extract_article_fast(raw_html, item["url"]) or _extract_article_text(raw_html)
                    if len(extracted) > len(content_orig):
                        content_orig = extracted
            except Exception:
                pass
        if not content_orig:
            content_orig = item.get("summary_orig") or item.get("title_orig") or ""
        if item.get("lang") == "zh":
            self.store.save_l2_item(item_id, content_orig, content_orig)
            return {"ok": True, "item": self.store.get_item(item_id)}

        ch = resolve_news_llm(self.config.data)
        if not ch:
            return {"ok": False, "error": "未配置可用的大模型 API"}
        sys_prompt = (
            "你是专业中/英/俄/日金融与地缘新闻精翻专家。请将正文忠实、通顺、分段落翻译为简体中文，"
            "保留数字、时间、百分比和机构名称，直接输出中文译文。"
            + self._glossary_prompt()
        )
        user_prompt = f"标题：{item.get('title_orig')}\n\n正文：\n{content_orig[:12000]}"
        content_zh = _call_llm(ch, sys_prompt, user_prompt, timeout=60.0)
        self.store.save_l2_item(item_id, content_orig, content_zh)
        if item.get("l1_status") != "done":
            t_zh = item.get("title_zh") or _call_llm(
                ch,
                "请将以下新闻标题直译为简洁简体中文，只输出译文：" + self._glossary_prompt(),
                item.get("title_orig") or "",
                timeout=20.0,
            )
            self.store.save_l1_batch([{
                "id": item_id,
                "title_zh": t_zh,
                "summary_zh": item.get("summary_zh") or content_zh[:240],
                "sentiment": item.get("sentiment") or "neutral",
                "impact": item.get("impact") or 2,
                "tags": item.get("tags") or [],
                "l1_status": "done",
            }])
        return {"ok": True, "item": self.store.get_item(item_id)}

    def embed_pending(self, limit: int = 256) -> dict:
        return self.index_and_dedup_semantic(limit=max(1, min(2000, int(limit or 256))))

    def query_items_fast(self, **kwargs) -> dict:
        """Query canonical news items, accelerating keyword `q` with Rust Tantivy BM25."""
        q_str = str(kwargs.get("q") or "").strip()
        if q_str and self.fts_index.available and self.fts_index.num_docs() > 0:
            hours = int(kwargs.get("hours") or 0)
            min_pub = int(time.time()) - hours * 3600 if hours > 0 else 0
            hits = self.fts_index.search(
                q_str,
                limit=400,
                lang=str(kwargs.get("lang") or ""),
                category=str(kwargs.get("category") or ""),
                min_pub_ts=min_pub,
            )
            if hits:
                kwargs["fts_ids"] = [iid for iid, _ in hits]
        return self.store.query_items(**kwargs)

    def semantic_search(
        self,
        query: str,
        *,
        limit: int = 12,
        lang: str = "",
        category: str = "",
        hours: int = 0,
    ) -> dict:
        """3-Stage Institutional Hybrid Search (canonical-only):
        1. C++ USearch HNSW dense recall (BGE-M3, full corpus < 1ms)
        2. Rust Tantivy BM25 multilingual recall (full corpus < 2ms)
        3. RRF Fusion -> Local RTX 4070 BGE-Reranker-v2-m3 cross-encoder rerank (~20ms)
        """
        q = (query or "").strip()
        if not q:
            return {"ok": True, "mode": "keyword", "items": []}
        lim = max(1, min(40, int(limit or 12)))
        min_pub = int(time.time()) - hours * 3600 if hours > 0 else 0

        # Path 1: Vector Recall via USearch (C++20 SIMD)
        vec_hits: list[tuple[int, float]] = []
        used_vec = False
        if len(self.vec_index) > 0:
            try:
                q_vecs, _m, _p = self._encode_vectors([q], query=True)
                if q_vecs.shape[0] == 1 and q_vecs.shape[1] == self.vec_index.ndim:
                    fetch_k = 120 if (lang or category or hours > 0) else 60
                    vec_hits = self.vec_index.search(q_vecs[0], k=fetch_k)
                    used_vec = bool(vec_hits)
            except Exception:
                vec_hits = []

        # Path 2: Full-Text BM25 Recall via Tantivy (Rust)
        fts_hits: list[tuple[int, float]] = []
        if self.fts_index.available and self.fts_index.num_docs() > 0:
            try:
                fts_hits = self.fts_index.search(q, limit=60, lang=lang, category=category, min_pub_ts=min_pub)
            except Exception:
                fts_hits = []

        # RRF Fusion across both full-corpus indexes
        rrf_scores: dict[int, float] = {}
        vec_sim_map: dict[int, float] = {}
        for rank, (iid, sim) in enumerate(vec_hits, 1):
            vec_sim_map[iid] = sim
            rrf_scores[iid] = rrf_scores.get(iid, 0.0) + 1.0 / (45.0 + rank)
        for rank, (iid, _bm25) in enumerate(fts_hits, 1):
            rrf_scores[iid] = rrf_scores.get(iid, 0.0) + 1.0 / (45.0 + rank)

        cand_ids = [iid for iid, _ in sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:120]]

        # Fetch canonical metadata & apply exact SQL filters
        cands: list[dict] = []
        with self.store.con() as c:
            if cand_ids:
                ph = ",".join("?" for _ in cand_ids)
                where = [f"id IN ({ph})", "is_canonical = 1"]
                params: list = list(cand_ids)
                if lang and lang != "all":
                    where.append("lang = ?")
                    params.append(lang)
                if category and category != "all":
                    where.append("category = ?")
                    params.append(category)
                if min_pub > 0:
                    where.append("published_at >= ?")
                    params.append(min_pub)
                rows = c.execute(
                    f"""SELECT id, feed_name, category, lang, title_orig, title_zh,
                               summary_orig, summary_zh, url, published_at,
                               sentiment, impact, entities_json, tags_json, cluster_id, starred, read
                        FROM news_items
                        WHERE {' AND '.join(where)}""",
                    params,
                ).fetchall()
                row_map = {int(r["id"]): dict(r) for r in rows}
                # Fetch cluster counts in one shot
                cids = list({r["cluster_id"] for r in row_map.values() if r.get("cluster_id")})
                cluster_counts: dict[str, int] = {}
                if cids:
                    cph = ",".join("?" for _ in cids)
                    for cr in c.execute(
                        f"SELECT cluster_id, COUNT(*) AS n FROM news_items WHERE cluster_id IN ({cph}) GROUP BY cluster_id",
                        cids,
                    ):
                        cluster_counts[cr["cluster_id"]] = int(cr["n"])
                for iid in cand_ids:
                    d = row_map.get(iid)
                    if not d:
                        continue
                    d["tags"] = _safe_json_list(d.pop("tags_json", "[]"))
                    d["entities"] = _safe_json_list(d.pop("entities_json", "[]"))
                    d["cluster_count"] = cluster_counts.get(d["cluster_id"], 1)
                    d["_rrf"] = rrf_scores.get(iid, 0.0)
                    d["_vec_sim"] = vec_sim_map.get(iid, 0.0)
                    cands.append(d)
            else:
                # Fallback if indexes are empty (cold boot before first reindex)
                res = self.store.query_items(
                    q=q, lang=lang, category=category, hours=hours, canonical_only=True, limit=lim
                )
                return {"ok": True, "mode": "keyword", "items": res.get("items") or []}

        if not cands:
            return {"ok": True, "mode": "hybrid" if used_vec else "keyword", "items": []}

        # Path 3: Local RTX 4070 Cross-Encoder Rerank (BGE-Reranker-v2-m3)
        used_rerank = False
        rerank_pool = cands[:28]
        if self._use_local_rerank() and len(rerank_pool) > 1:
            try:
                if self.local_engine.ensure_reranker():
                    doc_texts = [
                        f"{d.get('title_zh') or d.get('title_orig') or ''}\n{(d.get('summary_zh') or d.get('summary_orig') or '')[:350]}"
                        for d in rerank_pool
                    ]
                    rr_scores = self.local_engine.rerank(q, doc_texts, batch_size=28, max_length=384)
                    for d, rs in zip(rerank_pool, rr_scores):
                        # Blend cross-encoder relevance with mild RRF anchor
                        d["score"] = round(0.85 * rs + 0.15 * min(1.0, d.get("_vec_sim") or rs), 4)
                    rerank_pool.sort(key=lambda x: (x["score"], x.get("published_at") or 0), reverse=True)
                    used_rerank = True
            except Exception:
                used_rerank = False

        if not used_rerank:
            max_rrf = max((d.get("_rrf") or 1e-6) for d in rerank_pool)
            for d in rerank_pool:
                norm_rrf = (d.get("_rrf") or 0.0) / max(1e-6, max_rrf)
                vsim = d.get("_vec_sim") or 0.0
                d["score"] = round(0.55 * vsim + 0.45 * norm_rrf if used_vec else norm_rrf, 4)
            rerank_pool.sort(key=lambda x: (x["score"], x.get("published_at") or 0), reverse=True)

        out_items = []
        for d in rerank_pool[:lim]:
            d.pop("_rrf", None)
            d.pop("_vec_sim", None)
            out_items.append(d)

        mode = "hybrid+rerank" if (used_vec and used_rerank) else ("hybrid" if used_vec else "bm25")
        return {"ok": True, "mode": mode, "items": out_items}

    def generate_brief(self, hours: int = 24, force: bool = False) -> dict:
        h = max(1, min(168, int(hours or 24)))
        now = time.time()
        cached = self._brief_cache.get(h)
        if not force and cached and (now - cached[0]) < 900:
            return cached[1]
        res = self.store.query_items(hours=h, limit=25, canonical_only=True)
        items = res.get("items") or []
        if not items:
            return {"ok": True, "brief": "近段时间暂无已入库新闻，请先导入 RSS 源并抓取。", "generated_at": int(now)}
        ents = self.store.list_entities(hours=h, limit=10)
        ch = resolve_news_llm(self.config.data)
        if not ch:
            lines = [f"### 近 {h} 小时快讯摘要（未配置大模型，展示高优规则汇总）"]
            for it in items[:8]:
                lines.append(f"- [{it['lang'].upper()}] **{it.get('title_zh') or it.get('title_orig')}** ({it['feed_name']})")
            out = {"ok": True, "brief": "\n".join(lines), "generated_at": int(now)}
            self._brief_cache[h] = (now, out)
            return out

        digest_in = [
            {
                "lang": x["lang"],
                "source": x["feed_name"],
                "cat": x["category"],
                "sentiment": x["sentiment"],
                "impact": x["impact"],
                "cluster_count": x.get("cluster_count", 1),
                "title": x.get("title_zh") or x.get("title_orig"),
                "summary": (x.get("summary_zh") or x.get("summary_orig") or "")[:220],
            }
            for x in sorted(
                items,
                key=lambda r: (r.get("impact") or 0, r.get("cluster_count") or 1, r.get("published_at") or 0),
                reverse=True,
            )[:18]
        ]
        ent_in = [{"name": e["canonical_name"], "type": e["entity_type"], "mentions": e["mentions"], "net_sent": e["net_sentiment"]} for e in ents]
        sys_prompt = (
            "你是资深跨市场情报与金融首席分析师（Desk Strategist）。请基于提供的近阶段中/英/俄/日去重后新闻与高频实体，"
            "撰写一份精炼、机构级「情报简报 (Desk Note)」，严格控制篇幅在 350~500 字以内，使用 Markdown 分点输出："
            "\n1. **核心主线**（2-3条最关键驱动，结合多信源报道热度 cluster_count）\n2. **高频实体与风险信号**\n3. **跨语种关注与后市提示**"
        )
        brief_md = _call_llm(
            ch,
            sys_prompt,
            json.dumps({"news": digest_in, "top_entities": ent_in}, ensure_ascii=False),
            timeout=45.0,
        )
        out = {"ok": True, "brief": brief_md, "generated_at": int(now)}
        self._brief_cache[h] = (now, out)
        return out

    def status(self) -> dict:
        s = self.store.status_summary()
        s.update({
            "enabled": bool(self.config.data.get("news_enabled")),
            "fetching": self.fetching,
            "translating": self.translating,
            "embedding": self.embedding,
            "last_fetch_at": self.last_fetch_at,
            "last_fetch_stats": self.last_fetch_stats,
            "last_error": self.last_error,
            "engine": {
                "vec_backend": self.vec_index.backend,
                "vec_docs": len(self.vec_index),
                "entity_vecs": len(self.entity_vec_index),
                "fts_backend": "tantivy-rust" if self.fts_index.available else "sqlite-like",
                "fts_docs": self.fts_index.num_docs(),
                "simhash_window_docs": len(self.store.sim_index),
                "local_gpu": self.local_engine.status(),
            },
        })
        return s


if __name__ == "__main__":
    import argparse
    import config as cfg_mod

    ap = argparse.ArgumentParser(description="O2 News Engine CLI (reindex / benchmark / status)")
    ap.add_argument("--db", default=os.path.join("data", "news.sqlite"))
    ap.add_argument("--cfg", default="config.json")
    ap.add_argument("--reindex", action="store_true", help="Run full L1+L2 cross-lingual dedup & rebuild USearch + Tantivy")
    ap.add_argument("--search", default="", help="Test hybrid+rerank semantic search")
    args = ap.parse_args()

    cfg = cfg_mod.Config(args.cfg)
    mgr = NewsManager(args.db, cfg)
    if args.reindex:
        print(json.dumps(mgr.rebuild_and_dedup_all(), ensure_ascii=False, indent=2))
    if args.search:
        t0 = time.time()
        res = mgr.semantic_search(args.search, limit=8)
        ms = round((time.time() - t0) * 1000, 1)
        print(f"Search [{res.get('mode')}] in {ms} ms, hits={len(res.get('items') or [])}:")
        for idx, it in enumerate(res.get("items") or [], 1):
            print(f"  {idx}. [{it['lang']}|score={it.get('score')}|clst={it.get('cluster_count',1)}] {it.get('title_zh') or it.get('title_orig')} ({it['feed_name']})")
    if not args.reindex and not args.search:
        print(json.dumps(mgr.status(), ensure_ascii=False, indent=2))
