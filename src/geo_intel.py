"""Geo-intelligence enrichment for multi-lingual news entities, conflict scoring, and asset impact transmission.

Maps extracted entities (LOC/ORG/PER/EVENT/ASSET) onto ISO-3166 numeric country codes and
canonical lon/lat anchors without requiring LLM-generated coordinates, scores geopolitical
conflict intensity (0-5), classifies relation edges (conflict/sanction/trade/cooccur), and
aggregates bullish/bearish financial asset transmission links.
"""
from __future__ import annotations

import hashlib
import math
import re
from collections import defaultdict

# ---------------------------------------------------------------------------
# Country master table: ISO-3166 numeric string (matches world-atlas countries-110m)
# -> (zh_name, lon, lat)
# ---------------------------------------------------------------------------
ISO_COUNTRIES: dict[str, tuple[str, float, float]] = {
    "156": ("中国", 104.2, 35.8),
    "840": ("美国", -98.5, 39.8),
    "643": ("俄罗斯", 65.0, 60.0),
    "804": ("乌克兰", 31.2, 48.8),
    "392": ("日本", 138.3, 36.2),
    "410": ("韩国", 127.8, 36.4),
    "408": ("朝鲜", 127.0, 40.2),
    "356": ("印度", 79.0, 22.0),
    "826": ("英国", -2.5, 54.0),
    "276": ("德国", 10.4, 51.2),
    "250": ("法国", 2.2, 46.6),
    "380": ("意大利", 12.6, 42.8),
    "724": ("西班牙", -3.7, 40.4),
    "616": ("波兰", 19.1, 52.1),
    "528": ("荷兰", 5.3, 52.2),
    "056": ("比利时", 4.4, 50.8),
    "756": ("瑞士", 8.2, 46.8),
    "752": ("瑞典", 16.0, 62.0),
    "578": ("挪威", 9.0, 61.5),
    "246": ("芬兰", 26.0, 63.0),
    "208": ("丹麦", 10.0, 56.1),
    "040": ("奥地利", 14.5, 47.5),
    "348": ("匈牙利", 19.5, 47.2),
    "203": ("捷克", 15.5, 49.8),
    "642": ("罗马尼亚", 25.0, 46.0),
    "300": ("希腊", 22.0, 39.1),
    "620": ("葡萄牙", -8.2, 39.5),
    "372": ("爱尔兰", -8.0, 53.3),
    "112": ("白俄罗斯", 28.0, 53.7),
    "498": ("摩尔多瓦", 28.8, 47.2),
    "688": ("塞尔维亚", 20.9, 44.0),
    "100": ("保加利亚", 25.4, 42.7),
    "440": ("立陶宛", 23.9, 55.2),
    "428": ("拉脱维亚", 24.6, 56.9),
    "233": ("爱沙尼亚", 25.0, 58.6),
    "792": ("土耳其", 35.2, 39.0),
    "364": ("伊朗", 53.7, 32.4),
    "376": ("以色列", 34.9, 31.4),
    "275": ("巴勒斯坦", 35.2, 31.9),
    "422": ("黎巴嫩", 35.8, 33.9),
    "760": ("叙利亚", 38.5, 35.0),
    "368": ("伊拉克", 43.7, 33.2),
    "682": ("沙特阿拉伯", 45.1, 24.0),
    "784": ("阿联酋", 54.4, 24.2),
    "634": ("卡塔尔", 51.2, 25.3),
    "414": ("科威特", 47.5, 29.3),
    "512": ("阿曼", 56.5, 21.5),
    "887": ("也门", 47.5, 15.6),
    "400": ("约旦", 36.5, 31.2),
    "818": ("埃及", 30.8, 26.8),
    "434": ("利比亚", 17.2, 27.0),
    "504": ("摩洛哥", -7.1, 31.8),
    "012": ("阿尔及利亚", 2.6, 28.0),
    "788": ("突尼斯", 9.5, 34.0),
    "710": ("南非", 24.5, -29.0),
    "566": ("尼日利亚", 8.7, 9.1),
    "231": ("埃塞俄比亚", 40.5, 9.1),
    "404": ("肯尼亚", 37.9, 0.5),
    "729": ("苏丹", 30.2, 15.6),
    "706": ("索马里", 46.2, 5.2),
    "262": ("吉布提", 42.6, 11.8),
    "180": ("刚果(金)", 23.6, -2.9),
    "024": ("安哥拉", 17.9, -11.2),
    "586": ("巴基斯坦", 69.3, 30.4),
    "004": ("阿富汗", 67.7, 33.9),
    "398": ("哈萨克斯坦", 67.0, 48.0),
    "860": ("乌兹别克斯坦", 64.6, 41.4),
    "031": ("阿塞拜疆", 47.6, 40.1),
    "051": ("亚美尼亚", 45.0, 40.1),
    "268": ("格鲁吉亚", 43.4, 42.3),
    "050": ("孟加拉国", 90.4, 23.7),
    "144": ("斯里兰卡", 80.7, 7.9),
    "104": ("缅甸", 96.0, 21.9),
    "764": ("泰国", 101.0, 15.5),
    "704": ("越南", 106.3, 16.0),
    "458": ("马来西亚", 102.0, 4.2),
    "360": ("印度尼西亚", 113.9, -1.5),
    "608": ("菲律宾", 122.0, 12.9),
    "116": ("柬埔寨", 105.0, 12.6),
    "418": ("老挝", 102.5, 19.9),
    "496": ("蒙古", 103.8, 46.9),
    "036": ("澳大利亚", 134.5, -25.5),
    "554": ("新西兰", 172.5, -41.5),
    "124": ("加拿大", -106.3, 56.1),
    "484": ("墨西哥", -102.5, 23.6),
    "076": ("巴西", -51.9, -14.2),
    "032": ("阿根廷", -63.6, -34.6),
    "152": ("智利", -71.5, -33.4),
    "170": ("哥伦比亚", -74.3, 4.6),
    "604": ("秘鲁", -75.0, -9.2),
    "862": ("委内瑞拉", -66.6, 6.4),
    "591": ("巴拿马", -80.1, 8.9),
    "192": ("古巴", -79.5, 21.5),
    "352": ("冰岛", -19.0, 64.9),
}

# ---------------------------------------------------------------------------
# Entity / City / Chokepoint / Institution -> (iso_num, lon, lat, geo_label)
# iso_num can be "" for maritime chokepoints / international bodies that sit on water.
# ---------------------------------------------------------------------------
GEO_ANCHORS: dict[str, tuple[str, float, float, str]] = {
    # --- Major countries & aliases ---
    "中国": ("156", 116.4, 39.9, "中国·北京"),
    "china": ("156", 116.4, 39.9, "中国·北京"),
    "prc": ("156", 116.4, 39.9, "中国·北京"),
    "北京": ("156", 116.4, 39.9, "北京"),
    "beijing": ("156", 116.4, 39.9, "北京"),
    "上海": ("156", 121.5, 31.2, "上海"),
    "shanghai": ("156", 121.5, 31.2, "上海"),
    "深圳": ("156", 114.1, 22.5, "深圳"),
    "广州": ("156", 113.3, 23.1, "广州"),
    "香港": ("156", 114.2, 22.3, "香港"),
    "hong kong": ("156", 114.2, 22.3, "香港"),
    "台湾": ("156", 121.5, 25.0, "中国台湾"),
    "台北": ("156", 121.5, 25.0, "中国台北"),
    "taiwan": ("156", 121.5, 25.0, "中国台湾"),
    "南海": ("156", 114.0, 14.5, "南海"),
    "台湾海峡": ("156", 119.5, 24.3, "台湾海峡"),
    "东海": ("156", 125.0, 29.0, "东海"),

    "美国": ("840", -77.0, 38.9, "美国·华盛顿"),
    "美方": ("840", -77.0, 38.9, "美国·华盛顿"),
    "us": ("840", -77.0, 38.9, "美国·华盛顿"),
    "u.s.": ("840", -77.0, 38.9, "美国·华盛顿"),
    "usa": ("840", -77.0, 38.9, "美国·华盛顿"),
    "united states": ("840", -77.0, 38.9, "美国·华盛顿"),
    "华盛顿": ("840", -77.0, 38.9, "华盛顿"),
    "washington": ("840", -77.0, 38.9, "华盛顿"),
    "白宫": ("840", -77.0, 38.9, "华盛顿·白宫"),
    "white house": ("840", -77.0, 38.9, "华盛顿·白宫"),
    "五角大楼": ("840", -77.0, 38.8, "华盛顿·五角大楼"),
    "pentagon": ("840", -77.0, 38.8, "华盛顿·五角大楼"),
    "纽约": ("840", -74.0, 40.7, "纽约"),
    "new york": ("840", -74.0, 40.7, "纽约"),
    "华尔街": ("840", -74.0, 40.7, "纽约·华尔街"),
    "硅谷": ("840", -122.1, 37.4, "加州·硅谷"),
    "加利福尼亚": ("840", -119.5, 36.8, "加州"),
    "加州": ("840", -119.5, 36.8, "加州"),
    "旧金山": ("840", -122.4, 37.8, "旧金山"),
    "洛杉矶": ("840", -118.2, 34.1, "洛杉矶"),
    "得克萨斯": ("840", -99.9, 31.9, "得州"),
    "德州": ("840", -99.9, 31.9, "得州"),
    "爱荷华州": ("840", -93.6, 41.9, "美国·爱荷华州"),
    "阿拉斯加": ("840", -152.0, 64.0, "阿拉斯加"),

    "俄罗斯": ("643", 37.6, 55.75, "俄罗斯·莫斯科"),
    "俄方": ("643", 37.6, 55.75, "俄罗斯·莫斯科"),
    "russia": ("643", 37.6, 55.75, "俄罗斯·莫斯科"),
    "莫斯科": ("643", 37.6, 55.75, "莫斯科"),
    "莫斯科州": ("643", 37.9, 55.6, "莫斯科州"),
    "moscow": ("643", 37.6, 55.75, "莫斯科"),
    "圣彼得堡": ("643", 30.3, 59.9, "圣彼得堡"),
    "摩尔曼斯克": ("643", 33.1, 68.97, "摩尔曼斯克"),
    "摩尔曼斯克州": ("643", 33.1, 68.97, "摩尔曼斯克州"),
    "阿尔泰": ("643", 83.7, 53.3, "阿尔泰"),
    "阿尔泰边疆区": ("643", 83.7, 53.3, "阿尔泰边疆区"),
    "西伯利亚": ("643", 92.9, 56.0, "西伯利亚"),
    "海参崴": ("643", 131.9, 43.1, "符拉迪沃斯托克"),
    "符拉迪沃斯托克": ("643", 131.9, 43.1, "符拉迪沃斯托克"),
    "库尔斯克": ("643", 36.2, 51.7, "库尔斯克"),
    "别尔哥罗德": ("643", 36.6, 50.6, "别尔哥罗德"),

    "乌克兰": ("804", 30.5, 50.45, "乌克兰·基辅"),
    "乌方": ("804", 30.5, 50.45, "乌克兰·基辅"),
    "ukraine": ("804", 30.5, 50.45, "乌克兰·基辅"),
    "基辅": ("804", 30.5, 50.45, "基辅"),
    "kyiv": ("804", 30.5, 50.45, "基辅"),
    "kiev": ("804", 30.5, 50.45, "基辅"),
    "扎波罗热": ("804", 35.1, 47.8, "扎波罗热"),
    "扎波罗热州": ("804", 35.1, 47.8, "扎波罗热州"),
    "扎波罗热核电站": ("804", 34.6, 47.5, "扎波罗热核电站"),
    "哈尔科夫": ("804", 36.2, 50.0, "哈尔科夫"),
    "敖德萨": ("804", 30.7, 46.5, "敖德萨"),
    "顿巴斯": ("804", 37.8, 48.0, "顿巴斯"),
    "顿涅茨克": ("804", 37.8, 48.0, "顿涅茨克"),
    "克里米亚": ("804", 34.1, 45.3, "克里米亚"),
    "黑海": ("804", 34.0, 43.4, "黑海"),

    "日本": ("392", 139.7, 35.7, "日本·东京"),
    "japan": ("392", 139.7, 35.7, "日本·东京"),
    "东京": ("392", 139.7, 35.7, "东京"),
    "tokyo": ("392", 139.7, 35.7, "东京"),
    "大阪": ("392", 135.5, 34.7, "大阪"),
    "冲绳": ("392", 127.7, 26.2, "冲绳"),

    "韩国": ("410", 127.0, 37.56, "韩国·首尔"),
    "south korea": ("410", 127.0, 37.56, "韩国·首尔"),
    "首尔": ("410", 127.0, 37.56, "首尔"),
    "seoul": ("410", 127.0, 37.56, "首尔"),
    "釜山": ("410", 129.1, 35.2, "釜山"),
    "韩国防空识别区": ("410", 126.2, 34.5, "韩国防空识别区"),

    "朝鲜": ("408", 125.75, 39.03, "朝鲜·平壤"),
    "north korea": ("408", 125.75, 39.03, "朝鲜·平壤"),
    "平壤": ("408", 125.75, 39.03, "平壤"),
    "朝鲜半岛": ("408", 127.0, 38.0, "朝鲜半岛"),

    "印度": ("356", 77.2, 28.6, "印度·新德里"),
    "india": ("356", 77.2, 28.6, "印度·新德里"),
    "新德里": ("356", 77.2, 28.6, "新德里"),
    "孟买": ("356", 72.9, 19.1, "孟买"),

    "英国": ("826", -0.1, 51.5, "英国·伦敦"),
    "uk": ("826", -0.1, 51.5, "英国·伦敦"),
    "united kingdom": ("826", -0.1, 51.5, "英国·伦敦"),
    "伦敦": ("826", -0.1, 51.5, "伦敦"),
    "london": ("826", -0.1, 51.5, "伦敦"),

    "德国": ("276", 13.4, 52.5, "德国·柏林"),
    "germany": ("276", 13.4, 52.5, "德国·柏林"),
    "柏林": ("276", 13.4, 52.5, "柏林"),
    "法兰克福": ("276", 8.7, 50.1, "法兰克福"),
    "汉堡": ("276", 10.0, 53.55, "汉堡"),

    "法国": ("250", 2.35, 48.85, "法国·巴黎"),
    "france": ("250", 2.35, 48.85, "法国·巴黎"),
    "巴黎": ("250", 2.35, 48.85, "巴黎"),

    "欧洲": ("056", 4.35, 50.85, "欧洲·布鲁塞尔"),
    "欧盟": ("056", 4.35, 50.85, "欧盟·布鲁塞尔"),
    "eu": ("056", 4.35, 50.85, "欧盟·布鲁塞尔"),
    "europe": ("056", 4.35, 50.85, "欧洲"),
    "欧元区": ("276", 8.7, 50.1, "欧元区·法兰克福"),
    "布鲁塞尔": ("056", 4.35, 50.85, "布鲁塞尔"),
    "波兰": ("616", 21.0, 52.2, "波兰·华沙"),
    "华沙": ("616", 21.0, 52.2, "华沙"),
    "意大利": ("380", 12.5, 41.9, "意大利·罗马"),
    "西班牙": ("724", -3.7, 40.4, "西班牙·马德里"),
    "荷兰": ("528", 4.9, 52.4, "荷兰·阿姆斯特丹"),
    "鹿特丹": ("528", 4.48, 51.92, "鹿特丹港"),
    "比利时": ("056", 4.35, 50.85, "比利时"),
    "瑞士": ("756", 7.45, 46.95, "瑞士"),
    "日内瓦": ("756", 6.15, 46.2, "日内瓦"),
    "达沃斯": ("756", 9.8, 46.8, "达沃斯"),
    "瑞典": ("752", 18.1, 59.3, "瑞典"),
    "挪威": ("578", 10.75, 59.9, "挪威"),
    "芬兰": ("246", 24.9, 60.2, "芬兰"),
    "丹麦": ("208", 12.6, 55.7, "丹麦·哥本哈根"),
    "格陵兰": ("208", -42.0, 72.0, "格陵兰"),
    "匈牙利": ("348", 19.0, 47.5, "匈牙利"),
    "奥地利": ("040", 16.4, 48.2, "奥地利·维也纳"),
    "维也纳": ("040", 16.4, 48.2, "维也纳"),
    "希腊": ("300", 23.7, 38.0, "希腊"),
    "白俄罗斯": ("112", 27.6, 53.9, "白俄罗斯"),
    "塞尔维亚": ("688", 20.5, 44.8, "塞尔维亚"),
    "罗马尼亚": ("642", 26.1, 44.4, "罗马尼亚"),
    "捷克": ("203", 14.4, 50.1, "捷克"),
    "爱尔兰": ("372", -6.3, 53.3, "爱尔兰"),
    "葡萄牙": ("620", -9.1, 38.7, "葡萄牙"),

    # --- Middle East & Strategic Chokepoints ---
    "中东": ("364", 46.0, 29.0, "中东"),
    "伊朗": ("364", 51.4, 35.7, "伊朗·德黑兰"),
    "iran": ("364", 51.4, 35.7, "伊朗·德黑兰"),
    "德黑兰": ("364", 51.4, 35.7, "德黑兰"),
    "以色列": ("376", 34.8, 32.1, "以色列"),
    "israel": ("376", 34.8, 32.1, "以色列"),
    "耶路撒冷": ("376", 35.2, 31.8, "耶路撒冷"),
    "特拉维夫": ("376", 34.8, 32.1, "特拉维夫"),
    "加沙": ("275", 34.4, 31.5, "加沙"),
    "加沙地带": ("275", 34.4, 31.5, "加沙地带"),
    "巴勒斯坦": ("275", 35.2, 31.9, "巴勒斯坦"),
    "黎巴嫩": ("422", 35.5, 33.9, "黎巴嫩·贝鲁特"),
    "贝鲁特": ("422", 35.5, 33.9, "贝鲁特"),
    "叙利亚": ("760", 36.3, 33.5, "叙利亚"),
    "伊拉克": ("368", 44.4, 33.3, "伊拉克"),
    "沙特": ("682", 46.7, 24.7, "沙特·利雅得"),
    "沙特阿拉伯": ("682", 46.7, 24.7, "沙特·利雅得"),
    "saudi arabia": ("682", 46.7, 24.7, "沙特·利雅得"),
    "利雅得": ("682", 46.7, 24.7, "利雅得"),
    "阿联酋": ("784", 54.4, 24.5, "阿联酋"),
    "迪拜": ("784", 55.3, 25.2, "迪拜"),
    "卡塔尔": ("634", 51.5, 25.3, "卡塔尔·多哈"),
    "多哈": ("634", 51.5, 25.3, "多哈"),
    "科威特": ("414", 47.9, 29.4, "科威特"),
    "阿曼": ("512", 58.4, 23.6, "阿曼"),
    "也门": ("887", 44.2, 15.35, "也门"),
    "约旦": ("400", 35.9, 31.95, "约旦"),
    "土耳其": ("792", 32.9, 39.9, "土耳其·安卡拉"),
    "turkey": ("792", 32.9, 39.9, "土耳其·安卡拉"),
    "伊斯坦布尔": ("792", 29.0, 41.0, "伊斯坦布尔"),
    "埃及": ("818", 31.2, 30.0, "埃及·开罗"),
    "利比亚": ("434", 13.2, 32.9, "利比亚"),
    "南非": ("710", 28.0, -26.2, "南非"),
    "尼日利亚": ("566", 7.5, 9.1, "尼日利亚"),
    "苏丹": ("729", 32.5, 15.6, "苏丹"),
    "索马里": ("706", 45.3, 2.0, "索马里"),
    "埃塞俄比亚": ("231", 38.7, 9.0, "埃塞俄比亚"),

    # --- Strategic maritime chokepoints ---
    "红海": ("887", 41.5, 16.5, "红海航道"),
    "red sea": ("887", 41.5, 16.5, "红海航道"),
    "曼德海峡": ("887", 43.3, 12.6, "曼德海峡"),
    "亚丁湾": ("887", 47.0, 12.5, "亚丁湾"),
    "苏伊士运河": ("818", 32.35, 30.5, "苏伊士运河"),
    "suez canal": ("818", 32.35, 30.5, "苏伊士运河"),
    "霍尔木兹海峡": ("364", 56.3, 26.5, "霍尔木兹海峡"),
    "strait of hormuz": ("364", 56.3, 26.5, "霍尔木兹海峡"),
    "波斯湾": ("364", 51.5, 26.8, "波斯湾"),
    "马六甲海峡": ("458", 101.0, 2.5, "马六甲海峡"),
    "新加坡": ("458", 103.8, 1.35, "新加坡"),
    "singapore": ("458", 103.8, 1.35, "新加坡"),
    "巴拿马运河": ("591", -79.9, 9.1, "巴拿马运河"),
    "巴拿马": ("591", -79.5, 9.0, "巴拿马"),
    "好望角": ("710", 18.5, -34.35, "好望角"),

    # --- Asia-Pacific / Americas ---
    "巴基斯坦": ("586", 73.1, 33.7, "巴基斯坦"),
    "阿富汗": ("004", 69.2, 34.5, "阿富汗"),
    "哈萨克斯坦": ("398", 71.4, 51.1, "哈萨克斯坦"),
    "乌兹别克斯坦": ("860", 69.2, 41.3, "乌兹别克斯坦"),
    "孟加拉国": ("050", 90.4, 23.8, "孟加拉国"),
    "越南": ("704", 105.8, 21.0, "越南"),
    "泰国": ("764", 100.5, 13.75, "泰国"),
    "印尼": ("360", 106.8, -6.2, "印度尼西亚"),
    "印度尼西亚": ("360", 106.8, -6.2, "印度尼西亚"),
    "马来西亚": ("458", 101.7, 3.1, "马来西亚"),
    "菲律宾": ("608", 121.0, 14.6, "菲律宾"),
    "缅甸": ("104", 96.1, 19.7, "缅甸"),
    "澳大利亚": ("036", 149.1, -35.3, "澳大利亚"),
    "australia": ("036", 149.1, -35.3, "澳大利亚"),
    "悉尼": ("036", 151.2, -33.9, "悉尼"),
    "新西兰": ("554", 174.8, -41.3, "新西兰"),
    "加拿大": ("124", -75.7, 45.4, "加拿大"),
    "canada": ("124", -75.7, 45.4, "加拿大"),
    "墨西哥": ("484", -99.1, 19.4, "墨西哥"),
    "巴西": ("076", -47.9, -15.8, "巴西"),
    "阿根廷": ("032", -58.4, -34.6, "阿根廷"),
    "智利": ("152", -70.6, -33.4, "智利"),
    "哥伦比亚": ("170", -74.1, 4.7, "哥伦比亚"),
    "秘鲁": ("604", -77.0, -12.0, "秘鲁"),
    "委内瑞拉": ("862", -66.9, 10.5, "委内瑞拉"),
    "古巴": ("192", -82.4, 23.1, "古巴"),

    # --- Major ORG & PER anchors (headquarters / political seats) ---
    "美联储": ("840", -77.0, 38.9, "美国·华盛顿"),
    "fed": ("840", -77.0, 38.9, "美国·华盛顿"),
    "美国国会": ("840", -77.0, 38.9, "美国·华盛顿"),
    "美国陆军": ("840", -77.0, 38.9, "美国·华盛顿"),
    "财政部": ("840", -77.0, 38.9, "华盛顿·财政部"),
    "美国财政部": ("840", -77.0, 38.9, "美国·华盛顿"),
    "特朗普": ("840", -77.0, 38.9, "美国·华盛顿"),
    "trump": ("840", -77.0, 38.9, "美国·华盛顿"),
    "拜登": ("840", -77.0, 38.9, "美国·华盛顿"),
    "鲍威尔": ("840", -77.0, 38.9, "美国·华盛顿"),
    "马斯克": ("840", -97.7, 30.3, "美国·得州"),
    "库什纳": ("840", -74.0, 40.7, "美国·纽约"),
    "贾里德·库什纳": ("840", -74.0, 40.7, "美国·纽约"),
    "英伟达": ("840", -121.96, 37.37, "美国·硅谷"),
    "nvidia": ("840", -121.96, 37.37, "美国·硅谷"),
    "黄仁勋": ("840", -121.96, 37.37, "美国·硅谷"),
    "openai": ("840", -122.4, 37.8, "美国·旧金山"),
    "anthropic": ("840", -122.4, 37.8, "美国·旧金山"),
    "spacex": ("840", -118.3, 33.9, "美国·加州"),
    "特斯拉": ("840", -97.7, 30.3, "美国·得州"),
    "苹果": ("840", -122.0, 37.3, "美国·硅谷"),
    "微软": ("840", -122.1, 47.6, "美国·西雅图"),
    "谷歌": ("840", -122.1, 37.4, "美国·硅谷"),
    "亚马逊": ("840", -122.3, 47.6, "美国·西雅图"),
    "meta": ("840", -122.15, 37.45, "美国·硅谷"),
    "波音": ("840", -77.1, 38.85, "美国·华盛顿"),
    "高盛": ("840", -74.0, 40.7, "美国·纽约"),
    "摩根大通": ("840", -74.0, 40.7, "美国·纽约"),
    "贝莱德": ("840", -74.0, 40.7, "美国·纽约"),
    "联合国": ("840", -74.0, 40.75, "纽约·联合国"),
    "imf": ("840", -77.0, 38.9, "华盛顿·IMF"),
    "世界银行": ("840", -77.0, 38.9, "华盛顿·世行"),

    "普京": ("643", 37.6, 55.75, "俄罗斯·莫斯科"),
    "弗拉基米尔·普京": ("643", 37.6, 55.75, "俄罗斯·莫斯科"),
    "克里姆林宫": ("643", 37.6, 55.75, "俄罗斯·莫斯科"),
    "佩斯科夫": ("643", 37.6, 55.75, "俄罗斯·莫斯科"),
    "拉夫罗夫": ("643", 37.6, 55.75, "俄罗斯·莫斯科"),
    "梅德韦杰夫": ("643", 37.6, 55.75, "俄罗斯·莫斯科"),
    "安德烈·奇比斯": ("643", 33.1, 68.97, "俄罗斯·摩尔曼斯克"),
    "泽连斯基": ("804", 30.5, 50.45, "乌克兰·基辅"),

    "北约": ("056", 4.4, 50.9, "布鲁塞尔·北约"),
    "nato": ("056", 4.4, 50.9, "布鲁塞尔·北约"),
    "欧盟委员会": ("056", 4.38, 50.84, "布鲁塞尔·欧盟"),
    "欧洲央行": ("276", 8.7, 50.1, "法兰克福·欧央行"),
    "ecb": ("276", 8.7, 50.1, "法兰克福·欧央行"),
    "马士基": ("208", 12.6, 55.7, "丹麦·哥本哈根"),
    "asml": ("528", 5.4, 51.4, "荷兰·阿斯麦"),
    "阿斯麦": ("528", 5.4, 51.4, "荷兰·阿斯麦"),
    "空客": ("250", 1.4, 43.6, "法国·图卢兹"),

    "胡塞武装": ("887", 44.2, 15.35, "也门·胡塞武装"),
    "哈马斯": ("275", 34.4, 31.5, "巴勒斯坦·加沙"),
    "真主党": ("422", 35.5, 33.9, "黎巴嫩·贝鲁特"),
    "欧佩克": ("040", 16.4, 48.2, "维也纳·OPEC"),
    "opec": ("040", 16.4, 48.2, "维也纳·OPEC"),
    "opec+": ("682", 46.7, 24.7, "沙特·OPEC+"),
    "沙特阿美": ("682", 50.1, 26.3, "沙特·达兰"),

    "台积电": ("156", 121.0, 24.8, "中国台湾·新竹"),
    "tsmc": ("156", 121.0, 24.8, "中国台湾·新竹"),
    "华为": ("156", 114.1, 22.6, "中国·深圳"),
    "比亚迪": ("156", 114.2, 22.7, "中国·深圳"),
    "中远海运": ("156", 121.5, 31.2, "中国·上海"),
    "阿里巴巴": ("156", 120.2, 30.3, "中国·杭州"),
    "腾讯": ("156", 113.9, 22.5, "中国·深圳"),
    "人民银行": ("156", 116.4, 39.9, "中国·北京"),
    "中国人民银行": ("156", 116.4, 39.9, "中国·北京"),

    "三星": ("410", 127.0, 37.25, "韩国·水原"),
    "sk海力士": ("410", 127.5, 37.25, "韩国·利川"),
    "韩国央行": ("410", 127.0, 37.56, "韩国·首尔"),
    "日本央行": ("392", 139.7, 35.7, "日本·东京"),
    "日本政府": ("392", 139.7, 35.7, "日本·东京"),
    "丰田": ("392", 137.1, 35.1, "日本·爱知"),
    "莫迪": ("356", 77.2, 28.6, "印度·新德里"),
    "印度人民党": ("356", 77.2, 28.6, "印度·新德里"),
    "印度最高法院": ("356", 77.2, 28.6, "印度·新德里"),
    "金正恩": ("408", 125.75, 39.03, "朝鲜·平壤"),
    "内塔尼亚胡": ("376", 35.2, 31.8, "以色列·耶路撒冷"),
    "埃尔多安": ("792", 32.9, 39.9, "土耳其·安卡拉"),
    "马克龙": ("250", 2.35, 48.85, "法国·巴黎"),
    "斯塔默": ("826", -0.1, 51.5, "英国·伦敦"),
}

# Prefix-based fallback rules (e.g. "俄罗斯国家杜马" -> Russia, "乌克兰武装部队" -> Ukraine)
_GEO_PREFIX_RULES: tuple[tuple[str, str, float, float, str], ...] = (
    ("俄罗斯", "643", 37.6, 55.75, "俄罗斯"),
    ("俄军", "643", 37.6, 55.75, "俄罗斯"),
    ("俄乌", "804", 33.8, 49.0, "俄乌前线"),
    ("乌克兰", "804", 30.5, 50.45, "乌克兰"),
    ("乌军", "804", 30.5, 50.45, "乌克兰"),
    ("美国", "840", -77.0, 38.9, "美国"),
    ("美军", "840", -77.0, 38.9, "美国"),
    ("中国", "156", 116.4, 39.9, "中国"),
    ("日本", "392", 139.7, 35.7, "日本"),
    ("韩国", "410", 127.0, 37.56, "韩国"),
    ("朝鲜", "408", 125.75, 39.03, "朝鲜"),
    ("印度", "356", 77.2, 28.6, "印度"),
    ("以色列", "376", 34.8, 32.1, "以色列"),
    ("以军", "376", 34.8, 32.1, "以色列"),
    ("伊朗", "364", 51.4, 35.7, "伊朗"),
    ("沙特", "682", 46.7, 24.7, "沙特阿拉伯"),
    ("欧盟", "056", 4.35, 50.85, "欧盟"),
    ("欧洲", "056", 4.35, 50.85, "欧洲"),
    ("英国", "826", -0.1, 51.5, "英国"),
    ("德国", "276", 13.4, 52.5, "德国"),
    ("法国", "250", 2.35, 48.85, "法国"),
    ("波兰", "616", 21.0, 52.2, "波兰"),
    ("土耳其", "792", 32.9, 39.9, "土耳其"),
    ("巴基斯坦", "586", 73.1, 33.7, "巴基斯坦"),
    ("澳大利亚", "036", 149.1, -35.3, "澳大利亚"),
    ("加拿大", "124", -75.7, 45.4, "加拿大"),
    ("墨西哥", "484", -99.1, 19.4, "墨西哥"),
    ("巴西", "076", -47.9, -15.8, "巴西"),
    ("也门", "887", 44.2, 15.35, "也门"),
    ("红海", "887", 41.5, 16.5, "红海"),
    ("黎巴嫩", "422", 35.5, 33.9, "黎巴嫩"),
    ("叙利亚", "760", 36.3, 33.5, "叙利亚"),
    ("伊拉克", "368", 44.4, 33.3, "伊拉克"),
    ("巴勒斯坦", "275", 35.2, 31.9, "巴勒斯坦"),
    ("埃及", "818", 31.2, 30.0, "埃及"),
    ("利比亚", "434", 13.2, 32.9, "利比亚"),
    ("哈萨克斯坦", "398", 71.4, 51.1, "哈萨克斯坦"),
    ("西班牙", "724", -3.7, 40.4, "西班牙"),
    ("意大利", "380", 12.5, 41.9, "意大利"),
    ("荷兰", "528", 4.9, 52.4, "荷兰"),
    ("台湾", "156", 121.5, 25.0, "中国台湾"),
    ("香港", "156", 114.2, 22.3, "中国香港"),
)

# News-wire / publisher entities that should not dominate map markers
MEDIA_ENTITIES: set[str] = {
    "路透社", "reuters", "塔斯社", "tass", "彭博社", "bloomberg",
    "韩联社", "yonhap", "法新社", "afp", "美联社", "ap",
    "新华社", "央视", "《自然》", "nature", "science", "bbc", "cnn",
    "金融时报", "华尔街日报", "wsj", "ft", "cnbc", "nikkei", "日经",
    "共同社", "nhk", "财联社", "金十数据", "俄新社", "ria",
}

# Non-financial noisy ASSET entries to deprioritize in the Financial Asset Impact Dock
NON_FINANCIAL_ASSETS: set[str] = {
    "无人机", "乌克兰无人机", "“爱国者”导弹", "爱国者导弹", "叠氮化铅",
    "红鱼子酱", "电子烟", "小行星", "图-160", "斯巴达ii号", "tele-droid机器人",
    "变电站", "货船",
}

# ---------------------------------------------------------------------------
# Multilingual conflict / geopolitical tension regex tiers
# ---------------------------------------------------------------------------
_CONFLICT_L5_RE = re.compile(
    r"(?:战争|军事冲突|空袭|导弹袭击|导弹打击|无人机袭击|炮击|交火|开火|核打击|核威胁|恐袭|恐怖袭击|封锁海峡|特别军事行动|俄乌战争|乌克兰冲突|防空拦截|击落|"
    r"\b(?:war|airstrike|missile\s+strike|drone\s+attack|drone\s+strike|shelling|bombardment|terror\s+attack|military\s+strike|invasion|blockade|combat|frontline)\b|"
    r"ракетн|беспилотник|дрон|авиаудар|обстрел|теракт|военн\w*\s+действ|сво\b)",
    re.IGNORECASE,
)
_CONFLICT_L4_RE = re.compile(
    r"(?:制裁|禁运|封锁|军演|武装冲突|袭击|爆炸|破坏|紧急状态|戒严|红海危机|霍尔木兹|防空识别区|停火破裂|紧张局势升级|冲突升级|扣押船只|遇袭|"
    r"\b(?:sanctions?|embargo|military\s+drill|escalation|explosion|sabotage|martial\s+law|state\s+of\s+emergency|clashes?|attack|houthi|red\s+sea|strait\s+of\s+hormuz|ceasefire)\b|"
    r"санкц|взрыв|атак|эскалац|учени|чрезвычайн)",
    re.IGNORECASE,
)
_CONFLICT_L3_RE = re.compile(
    r"(?:关税|贸易战|贸易摩擦|出口管制|反制|抗议|示威|罢工|驱逐外交官|外交风波|断交|政治危机|弹劾|网络攻击|数据泄露|停运|中断|"
    r"\b(?:tariffs?|trade\s+war|export\s+controls?|retaliat\w*|protests?|strike|cyberattack|diplomatic\s+row|impeach\w*|disruption|shutdown)\b|"
    r"пошлин|торгов\w*\s+войн|протест|кибератак)",
    re.IGNORECASE,
)
_CONFLICT_L2_RE = re.compile(
    r"(?:通胀|加息|违约|暴跌|崩盘|衰退|债务危机|能源危机|供应短缺|汇率波动|避险|风险|"
    r"\b(?:inflation|rate\s+hike|default|plunge|crash|recession|debt\s+crisis|energy\s+crisis|shortage|volatility)\b|"
    r"инфляц|дефолт|кризис|рецесси)",
    re.IGNORECASE,
)

_SANCTION_REL_RE = re.compile(
    r"(?:制裁|关税|禁运|出口管制|反制|限制|\b(?:sanction|tariff|embargo|ban|restrict|export\s+control)\b|санкц|пошлин)",
    re.IGNORECASE,
)
_TRADE_REL_RE = re.compile(
    r"(?:协议|合作|投资|收购|供应|贸易|签约|建厂|增产|降息|降准|刺激|\b(?:deal|agreement|partner|invest|supply|trade|cooperation|stimulus|acquir)\b|соглашен|сотруднич)",
    re.IGNORECASE,
)

# Directional asset heuristic for older items that only stored item-level sentiment
_SAFE_HAVEN_ASSETS = ("黄金", "金价", "gold", "美元", "usd", "石油", "原油", "布伦特原油", "wti", "天然气", "油价", "集运", "运价", "军工")


def is_media_entity(name: str) -> bool:
    return (name or "").strip().lower() in MEDIA_ENTITIES


def _deterministic_jitter(seed_text: str, radius_deg: float = 1.6) -> tuple[float, float]:
    h = hashlib.md5((seed_text or "").encode("utf-8", "ignore")).digest()
    a = (int.from_bytes(h[:2], "big") / 65535.0) * math.tau
    r = (0.35 + 0.65 * (int.from_bytes(h[2:4], "big") / 65535.0)) * radius_deg
    return round(math.cos(a) * r, 3), round(math.sin(a) * r * 0.72, 3)


def resolve_geo_anchor(
    name: str,
    entity_type: str = "",
    aliases: list[str] | None = None,
) -> dict | None:
    """Resolve an entity name/aliases to {iso, country_zh, lon, lat, geo_label} or None."""
    et = (entity_type or "").upper()
    if et == "ASSET":
        # Assets belong in the Financial Impact Dock unless explicitly a geographic asset (e.g. 扎波罗热核电站)
        nm = (name or "").strip()
        if nm in GEO_ANCHORS:
            iso, lon, lat, lbl = GEO_ANCHORS[nm]
            return {
                "iso": iso,
                "country_zh": ISO_COUNTRIES.get(iso, (lbl, 0, 0))[0],
                "lon": lon,
                "lat": lat,
                "geo_label": lbl,
            }
        return None

    cands = [name or ""] + list(aliases or [])
    for raw in cands:
        s = str(raw or "").strip()
        if not s:
            continue
        hit = GEO_ANCHORS.get(s) or GEO_ANCHORS.get(s.lower())
        if hit:
            iso, lon, lat, lbl = hit
            # Slight deterministic jitter for ORG/PER so multiple entities in same capital don't stack identically
            if et in ("ORG", "PER", "EVENT"):
                dlon, dlat = _deterministic_jitter(name, 1.35)
                lon = max(-175.0, min(175.0, lon + dlon))
                lat = max(-58.0, min(74.0, lat + dlat))
            return {
                "iso": iso,
                "country_zh": ISO_COUNTRIES.get(iso, (lbl, 0, 0))[0],
                "lon": round(lon, 3),
                "lat": round(lat, 3),
                "geo_label": lbl,
            }

    # Prefix / substring match for compound Chinese names (e.g. "俄罗斯国家杜马", "乌克兰武装部队")
    nm = (name or "").strip()
    if nm:
        for prefix, iso, lon, lat, lbl in _GEO_PREFIX_RULES:
            if prefix in nm:
                dlon, dlat = _deterministic_jitter(nm, 1.55)
                return {
                    "iso": iso,
                    "country_zh": ISO_COUNTRIES.get(iso, (lbl, 0, 0))[0],
                    "lon": round(max(-175.0, min(175.0, lon + dlon)), 3),
                    "lat": round(max(-58.0, min(74.0, lat + dlat)), 3),
                    "geo_label": lbl,
                }
    return None


def infer_conflict_level(
    title: str,
    summary: str = "",
    *,
    impact: int = 0,
    sentiment: str = "neutral",
    stored_level: int = -1,
) -> int:
    """Return geopolitical conflict/tension level in [0..5]."""
    if stored_level is not None and int(stored_level) >= 0:
        return max(0, min(5, int(stored_level)))
    txt = f"{title or ''} {summary or ''}"
    lvl = 0
    if _CONFLICT_L5_RE.search(txt):
        lvl = 5
    elif _CONFLICT_L4_RE.search(txt):
        lvl = 4
    elif _CONFLICT_L3_RE.search(txt):
        lvl = 3
    elif _CONFLICT_L2_RE.search(txt):
        lvl = 2
    elif int(impact or 0) >= 4 and sentiment == "bearish":
        lvl = 2
    elif int(impact or 0) >= 3:
        lvl = 1

    # Modulate by LLM impact when available
    imp = int(impact or 0)
    if lvl >= 4 and imp in (1, 2):
        lvl = max(3, lvl - 1)
    elif lvl == 3 and imp >= 5:
        lvl = 4
    return max(0, min(5, lvl))


def classify_edge_relation(titles: list[str], avg_conflict: float, net_sent: float) -> str:
    """Classify relationship edge as 'conflict' | 'sanction' | 'trade' | 'cooccur'."""
    blob = " ".join(titles[:8])
    if avg_conflict >= 3.2 or _CONFLICT_L5_RE.search(blob):
        return "conflict"
    if _SANCTION_REL_RE.search(blob):
        return "sanction"
    if _TRADE_REL_RE.search(blob) and net_sent >= -0.05:
        return "trade"
    if avg_conflict >= 2.2 and net_sent < -0.15:
        return "conflict"
    return "cooccur"


def infer_asset_stance(asset_name: str, item_sent: str, conflict_level: int) -> str:
    """Refine legacy item-level sentiment for safe-haven / energy commodities during conflict shocks."""
    if item_sent in ("bullish", "bearish"):
        # If an older record only tagged conflict news as 'bearish', safe-haven/energy assets often react bullishly
        if item_sent == "bearish" and conflict_level >= 4:
            low = (asset_name or "").lower()
            if any(k in low for k in _SAFE_HAVEN_ASSETS):
                return "bullish"
        return item_sent
    if conflict_level >= 4:
        low = (asset_name or "").lower()
        if any(k in low for k in _SAFE_HAVEN_ASSETS):
            return "bullish"
    return "neutral"


def conflict_tier_label(level: int) -> str:
    return {
        5: "高危冲突",
        4: "烈度升级",
        3: "制裁摩擦",
        2: "风险扰动",
        1: "轻度关注",
        0: "平稳常态",
    }.get(max(0, min(5, int(level or 0))), "平稳常态")


def aggregate_geo_intelligence(
    *,
    nodes: list[dict],
    item_rows: list[dict],
    item_entity_links: list[dict],
    all_assets_raw: list[dict],
) -> dict:
    """Build enriched geo-intelligence payload (enriched nodes, typed edges, country risk, hotspot events, asset dock)."""
    node_by_id: dict[int, dict] = {}
    enriched_nodes: list[dict] = []

    for n in nodes:
        nid = int(n["id"])
        aliases = n.get("aliases") or []
        geo = resolve_geo_anchor(n["canonical_name"], n.get("entity_type", "ORG"), aliases)
        en = {
            **n,
            "is_media": is_media_entity(n["canonical_name"]),
            "iso": geo["iso"] if geo else "",
            "country_zh": geo["country_zh"] if geo else "",
            "lon": geo["lon"] if geo else None,
            "lat": geo["lat"] if geo else None,
            "geo_label": geo["geo_label"] if geo else "",
            "conflict_level": 0,
            "conflict_score": 0,
            "impact_avg": 0.0,
        }
        node_by_id[nid] = en
        enriched_nodes.append(en)

    # Index items and compute per-item conflict level
    item_by_id: dict[int, dict] = {}
    for it in item_rows:
        iid = int(it["id"])
        title = (it.get("title_zh") or it.get("title_orig") or "").strip()
        summary = (it.get("summary_zh") or it.get("summary_orig") or "").strip()
        stored_cl = it.get("conflict_level")
        cl = infer_conflict_level(
            title,
            summary,
            impact=int(it.get("impact") or 0),
            sentiment=it.get("sentiment") or "neutral",
            stored_level=stored_cl if (stored_cl is not None and int(stored_cl) >= 0) else -1,
        )
        item_by_id[iid] = {
            "id": iid,
            "title": title,
            "summary": summary[:180],
            "sentiment": it.get("sentiment") or "neutral",
            "impact": int(it.get("impact") or 2),
            "conflict_level": cl,
            "published_at": int(it.get("published_at") or 0),
            "feed_name": it.get("feed_name") or "",
            "category": it.get("category") or "",
        }

    # Build item -> entity list (with entity metadata & geo)
    ent_meta_cache: dict[int, dict] = {nid: n for nid, n in node_by_id.items()}
    for a in all_assets_raw:
        aid = int(a["id"])
        if aid not in ent_meta_cache:
            ent_meta_cache[aid] = {
                **a,
                "is_media": False,
                "iso": "",
                "lon": None,
                "lat": None,
            }

    item_ents: dict[int, list[dict]] = defaultdict(list)
    ent_conflict_acc: dict[int, list[int]] = defaultdict(list)
    ent_impact_acc: dict[int, list[int]] = defaultdict(list)

    # Country aggregation buckets
    country_acc: dict[str, dict] = {}

    def _get_country(iso: str) -> dict:
        if iso not in country_acc:
            zh, lon, lat = ISO_COUNTRIES.get(iso, (iso, 0.0, 0.0))
            country_acc[iso] = {
                "iso": iso,
                "name_zh": zh,
                "lon": lon,
                "lat": lat,
                "mentions": 0,
                "item_ids": set(),
                "bullish": 0,
                "bearish": 0,
                "neutral": 0,
                "conflict_sum": 0.0,
                "max_conflict": 0,
                "impact_sum": 0.0,
                "entity_counts": defaultdict(int),
                "entity_names": {},
                "event_titles": [],
                "asset_ids": defaultdict(int),
            }
        return country_acc[iso]

    for lk in item_entity_links:
        iid = int(lk["item_id"])
        eid = int(lk["entity_id"])
        it = item_by_id.get(iid)
        if not it:
            continue
        ename = lk.get("canonical_name") or ""
        etype = (lk.get("entity_type") or "ORG").upper()
        sent = lk.get("sentiment") or it["sentiment"] or "neutral"
        if eid not in ent_meta_cache:
            geo = resolve_geo_anchor(ename, etype)
            ent_meta_cache[eid] = {
                "id": eid,
                "canonical_name": ename,
                "entity_type": etype,
                "is_media": is_media_entity(ename),
                "iso": geo["iso"] if geo else "",
                "lon": geo["lon"] if geo else None,
                "lat": geo["lat"] if geo else None,
                "geo_label": geo["geo_label"] if geo else "",
            }
        em = ent_meta_cache[eid]
        item_ents[iid].append({"eid": eid, "name": ename, "type": etype, "sent": sent, "meta": em})
        ent_conflict_acc[eid].append(it["conflict_level"])
        ent_impact_acc[eid].append(it["impact"])

        iso = em.get("iso") or ""
        if iso and not em.get("is_media"):
            ca = _get_country(iso)
            if iid not in ca["item_ids"]:
                ca["item_ids"].add(iid)
                ca["mentions"] += 1
                ca["conflict_sum"] += it["conflict_level"]
                ca["impact_sum"] += it["impact"]
                if it["conflict_level"] > ca["max_conflict"]:
                    ca["max_conflict"] = it["conflict_level"]
                if sent == "bullish":
                    ca["bullish"] += 1
                elif sent == "bearish":
                    ca["bearish"] += 1
                else:
                    ca["neutral"] += 1
                ca["event_titles"].append((it["conflict_level"], it["impact"], it["published_at"], it["title"], it["sentiment"], iid))
            ca["entity_counts"][eid] += 1
            ca["entity_names"][eid] = ename

    # Populate conflict stats onto enriched nodes
    for en in enriched_nodes:
        nid = en["id"]
        cls = ent_conflict_acc.get(nid) or []
        imps = ent_impact_acc.get(nid) or []
        if cls:
            mx = max(cls)
            avg = sum(cls) / len(cls)
            en["conflict_level"] = min(5, int(round(mx * 0.55 + avg * 0.45)))
            en["conflict_score"] = min(100, int(round((en["conflict_level"] / 5.0) * 75 + min(25, len(cls) * 1.4))))
        if imps:
            en["impact_avg"] = round(sum(imps) / len(imps), 2)

    # Also anchor EVENT entities to their most frequent co-occurring country
    for en in enriched_nodes:
        if en.get("entity_type") == "EVENT" and not en.get("iso"):
            iso_votes: dict[str, int] = defaultdict(int)
            for iid, ents in item_ents.items():
                if any(x["eid"] == en["id"] for x in ents):
                    for x in ents:
                        if x["meta"].get("iso") and not x["meta"].get("is_media"):
                            iso_votes[x["meta"]["iso"]] += 1
            if iso_votes:
                top_iso = max(iso_votes.items(), key=lambda kv: kv[1])[0]
                zh, lon, lat = ISO_COUNTRIES.get(top_iso, (top_iso, 0.0, 0.0))
                dlon, dlat = _deterministic_jitter(en["canonical_name"], 1.8)
                en["iso"] = top_iso
                en["country_zh"] = zh
                en["lon"] = round(lon + dlon, 3)
                en["lat"] = round(lat + dlat, 3)
                en["geo_label"] = f"{zh}·事件热点"

    # Build typed semantic edges among top nodes
    top_ids = set(node_by_id.keys())
    pair_acc: dict[tuple[int, int], dict] = {}
    for iid, ents in item_ents.items():
        it = item_by_id[iid]
        present = [x for x in ents if x["eid"] in top_ids]
        for i in range(len(present)):
            for j in range(i + 1, len(present)):
                a, b = present[i]["eid"], present[j]["eid"]
                if a == b:
                    continue
                key = (a, b) if a < b else (b, a)
                if key not in pair_acc:
                    pair_acc[key] = {
                        "weight": 0,
                        "conflict_sum": 0.0,
                        "bullish": 0,
                        "bearish": 0,
                        "titles": [],
                    }
                rec = pair_acc[key]
                rec["weight"] += 1
                rec["conflict_sum"] += it["conflict_level"]
                if it["sentiment"] == "bullish":
                    rec["bullish"] += 1
                elif it["sentiment"] == "bearish":
                    rec["bearish"] += 1
                if len(rec["titles"]) < 6 and it["title"]:
                    rec["titles"].append(it["title"])

    edges_out = []
    for (s, t), rec in sorted(pair_acc.items(), key=lambda kv: (-kv[1]["weight"], -kv[1]["conflict_sum"]))[:80]:
        w = rec["weight"]
        avg_c = rec["conflict_sum"] / max(1, w)
        ns = round((rec["bullish"] - rec["bearish"]) / max(1, w), 2)
        rel = classify_edge_relation(rec["titles"], avg_c, ns)
        edges_out.append({
            "source": s,
            "target": t,
            "weight": w,
            "rel_type": rel,
            "conflict_level": min(5, int(round(avg_c))),
            "net_sentiment": ns,
            "sample_title": rec["titles"][0] if rec["titles"] else "",
        })

    # Build Asset Bullish/Bearish Transmission Dock
    asset_acc: dict[int, dict] = {}
    for a in all_assets_raw:
        aid = int(a["id"])
        nm = a["canonical_name"]
        if nm.lower() in NON_FINANCIAL_ASSETS:
            continue
        asset_acc[aid] = {
            "id": aid,
            "canonical_name": nm,
            "mentions": int(a.get("mentions") or 0),
            "bullish": 0,
            "bearish": 0,
            "neutral": 0,
            "conflict_sum": 0.0,
            "linked_isos": defaultdict(int),
            "linked_entity_ids": defaultdict(int),
            "sample_titles": [],
        }

    for iid, ents in item_ents.items():
        it = item_by_id[iid]
        item_assets = [x for x in ents if x["eid"] in asset_acc]
        if not item_assets:
            continue
        item_isos = {x["meta"]["iso"] for x in ents if x["meta"].get("iso") and not x["meta"].get("is_media")}
        item_geo_eids = [x["eid"] for x in ents if x["eid"] in top_ids and not x["meta"].get("is_media") and x["type"] != "ASSET"]

        for ax in item_assets:
            ar = asset_acc[ax["eid"]]
            stance = infer_asset_stance(ar["canonical_name"], ax["sent"], it["conflict_level"])
            if stance == "bullish":
                ar["bullish"] += 1
            elif stance == "bearish":
                ar["bearish"] += 1
            else:
                ar["neutral"] += 1
            ar["conflict_sum"] += it["conflict_level"]
            for iso in item_isos:
                ar["linked_isos"][iso] += 1
                if iso in country_acc:
                    country_acc[iso]["asset_ids"][ax["eid"]] += 1
            for geid in item_geo_eids:
                ar["linked_entity_ids"][geid] += 1
            if len(ar["sample_titles"]) < 3 and it["title"]:
                ar["sample_titles"].append(it["title"])

    assets_out = []
    for aid, ar in asset_acc.items():
        tot = ar["bullish"] + ar["bearish"] + ar["neutral"]
        if tot <= 0:
            tot = max(1, ar["mentions"])
        ns = round((ar["bullish"] - ar["bearish"]) / max(1, tot), 2)
        stance = "bullish" if ns > 0.08 else ("bearish" if ns < -0.08 else "neutral")
        top_isos = [k for k, _ in sorted(ar["linked_isos"].items(), key=lambda kv: -kv[1])[:5]]
        top_eids = [k for k, _ in sorted(ar["linked_entity_ids"].items(), key=lambda kv: -kv[1])[:6]]
        assets_out.append({
            "id": aid,
            "canonical_name": ar["canonical_name"],
            "mentions": max(ar["mentions"], tot),
            "bullish": ar["bullish"],
            "bearish": ar["bearish"],
            "neutral": ar["neutral"],
            "net_sentiment": ns,
            "stance": stance,
            "linked_isos": top_isos,
            "linked_entity_ids": top_eids,
            "sample_title": ar["sample_titles"][0] if ar["sample_titles"] else "",
        })
    assets_out.sort(key=lambda x: (-x["mentions"], -abs(x["net_sentiment"])))
    assets_out = assets_out[:16]
    asset_name_by_id = {a["id"]: a for a in assets_out}

    # Finalize countries list (for world map choropleth + hover cards)
    countries_out = []
    for iso, ca in country_acc.items():
        cnt = max(1, ca["mentions"])
        avg_c = ca["conflict_sum"] / cnt
        eff_level = min(5, int(round(ca["max_conflict"] * 0.55 + avg_c * 0.45)))
        if ca["mentions"] == 1 and eff_level >= 4:
            eff_level = max(3, eff_level - 1)
        score = min(100, int(round((eff_level / 5.0) * 68 + min(32, math.log1p(cnt) * 9.5))))
        ns = round((ca["bullish"] - ca["bearish"]) / cnt, 2)
        top_ents = [
            {"id": eid, "name": ca["entity_names"].get(eid, ""), "count": c}
            for eid, c in sorted(ca["entity_counts"].items(), key=lambda kv: -kv[1])[:5]
        ]
        ev_sorted = sorted(ca["event_titles"], key=lambda t: (-t[0], -t[1], -t[2]))
        headlines = [
            {"id": t[5], "title": t[3], "conflict_level": t[0], "impact": t[1], "sentiment": t[4], "published_at": t[2]}
            for t in ev_sorted[:4]
        ]
        linked_assets = []
        for aid, _ in sorted(ca["asset_ids"].items(), key=lambda kv: -kv[1])[:4]:
            if aid in asset_name_by_id:
                a_obj = asset_name_by_id[aid]
                linked_assets.append({
                    "id": aid,
                    "name": a_obj["canonical_name"],
                    "stance": a_obj["stance"],
                    "net_sentiment": a_obj["net_sentiment"],
                })
        countries_out.append({
            "iso": iso,
            "name_zh": ca["name_zh"],
            "lon": ca["lon"],
            "lat": ca["lat"],
            "mentions": ca["mentions"],
            "bullish": ca["bullish"],
            "bearish": ca["bearish"],
            "neutral": ca["neutral"],
            "net_sentiment": ns,
            "conflict_level": eff_level,
            "conflict_tier": conflict_tier_label(eff_level),
            "conflict_score": score,
            "top_entities": top_ents,
            "headlines": headlines,
            "linked_assets": linked_assets,
        })
    countries_out.sort(key=lambda x: (-x["conflict_score"], -x["mentions"]))

    # Top hotspot conflict events (geo-pinned alerts for pulsing markers)
    events_out = []
    seen_ev_titles: set[str] = set()
    for it in sorted(item_by_id.values(), key=lambda x: (-x["conflict_level"], -x["impact"], -x["published_at"])):
        if it["conflict_level"] < 3:
            break
        ents = item_ents.get(it["id"]) or []
        geo_cands = [x for x in ents if x["meta"].get("iso") and not x["meta"].get("is_media")]
        geo_hit = next((x for x in geo_cands if x["type"] == "LOC"), geo_cands[0] if geo_cands else None)
        if not geo_hit:
            continue
        tkey = it["title"][:28]
        if tkey in seen_ev_titles:
            continue
        seen_ev_titles.add(tkey)
        iso = geo_hit["meta"]["iso"]
        lon = geo_hit["meta"].get("lon")
        lat = geo_hit["meta"].get("lat")
        if lon is None or lat is None:
            _, lon, lat = ISO_COUNTRIES.get(iso, ("", 0.0, 0.0))
        events_out.append({
            "id": it["id"],
            "title": it["title"],
            "iso": iso,
            "region": geo_hit["meta"].get("geo_label") or ISO_COUNTRIES.get(iso, (iso, 0, 0))[0],
            "lon": lon,
            "lat": lat,
            "conflict_level": it["conflict_level"],
            "conflict_tier": conflict_tier_label(it["conflict_level"]),
            "impact": it["impact"],
            "sentiment": it["sentiment"],
            "published_at": it["published_at"],
            "feed_name": it["feed_name"],
            "entity_ids": [x["eid"] for x in ents if x["eid"] in top_ids],
            "asset_ids": [x["eid"] for x in ents if x["eid"] in asset_name_by_id],
        })
        if len(events_out) >= 18:
            break

    return {
        "nodes": enriched_nodes,
        "edges": edges_out,
        "countries": countries_out,
        "events": events_out,
        "assets": assets_out,
    }
