from __future__ import annotations

import math
import re
from typing import Callable

import numpy as np
import pandas as pd

try:
    import talib as _talib
except Exception:
    _talib = None

try:
    import ta as _ta_lib
except Exception:
    _ta_lib = None


# ---------------------------------------------------------------------------
# Cross-sectional & Time-series Vectorized Alpha Operators
# All panels are DataFrames indexed by datetime (rows) x symbol (columns)
# ---------------------------------------------------------------------------

def _eps(x: pd.DataFrame | np.ndarray, val: float = 1e-12):
    return x.replace(0, np.nan) if isinstance(x, pd.DataFrame) else np.where(x == 0, val, x)


def cs_rank(df: pd.DataFrame) -> pd.DataFrame:
    return df.rank(axis=1, pct=True)


def cs_zscore(df: pd.DataFrame) -> pd.DataFrame:
    mean = df.mean(axis=1)
    std = df.std(axis=1).replace(0, np.nan)
    return df.sub(mean, axis=0).div(std, axis=0)


def cs_scale(df: pd.DataFrame, a: float = 1.0) -> pd.DataFrame:
    denom = df.abs().sum(axis=1).replace(0, np.nan)
    return df.div(denom, axis=0) * a


def delay(df: pd.DataFrame, d: int = 1) -> pd.DataFrame:
    return df.shift(int(d))


def delta(df: pd.DataFrame, d: int = 1) -> pd.DataFrame:
    return df.diff(int(d))


def ts_sum(df: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    return df.rolling(int(d), min_periods=max(1, int(d) // 2)).sum()


def ts_mean(df: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    return df.rolling(int(d), min_periods=max(1, int(d) // 2)).mean()


def ts_std(df: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    return df.rolling(int(d), min_periods=max(2, int(d) // 2)).std()


def ts_min(df: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    return df.rolling(int(d), min_periods=max(1, int(d) // 2)).min()


def ts_max(df: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    return df.rolling(int(d), min_periods=max(1, int(d) // 2)).max()


def ts_rank(df: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    w = int(d)
    return df.rolling(w, min_periods=max(2, w // 2)).apply(
        lambda x: (np.sum(x <= x[-1]) / len(x)), raw=True
    )


def ts_argmax(df: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    w = int(d)
    return df.rolling(w, min_periods=max(2, w // 2)).apply(
        lambda x: (np.argmax(x) + 1) / len(x), raw=True
    )


def ts_argmin(df: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    w = int(d)
    return df.rolling(w, min_periods=max(2, w // 2)).apply(
        lambda x: (np.argmin(x) + 1) / len(x), raw=True
    )


def ts_corr(x: pd.DataFrame, y: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    w = int(d)
    out = x.rolling(w, min_periods=max(3, w // 2)).corr(y)
    return out.replace([np.inf, -np.inf], np.nan)


def ts_cov(x: pd.DataFrame, y: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    w = int(d)
    out = x.rolling(w, min_periods=max(3, w // 2)).cov(y)
    return out.replace([np.inf, -np.inf], np.nan)


def decay_linear(df: pd.DataFrame, d: int = 10) -> pd.DataFrame:
    w = int(d)
    weights = np.arange(1, w + 1, dtype=float)
    weights /= weights.sum()
    return df.rolling(w, min_periods=w).apply(lambda x: float(np.dot(x, weights)), raw=True)


def signed_power(df: pd.DataFrame, a: float) -> pd.DataFrame:
    return np.sign(df) * (df.abs() ** a)


def winsorize_mad(df: pd.DataFrame, n_mad: float = 5.0) -> pd.DataFrame:
    med = df.median(axis=1)
    mad = df.sub(med, axis=0).abs().median(axis=1).replace(0, np.nan)
    hi = med + n_mad * 1.4826 * mad
    lo = med - n_mad * 1.4826 * mad
    return df.clip(lower=lo, upper=hi, axis=0)


def _safe_div(a: pd.DataFrame, b: pd.DataFrame) -> pd.DataFrame:
    return a.div(b.replace(0, np.nan)).replace([np.inf, -np.inf], np.nan)


# ---------------------------------------------------------------------------
# Technical indicator helpers (uses TA-Lib if installed, else ta / numpy)
# ---------------------------------------------------------------------------

def _apply_col(df: pd.DataFrame, fn: Callable[[pd.Series], pd.Series]) -> pd.DataFrame:
    out = {}
    for col in df.columns:
        s = df[col].astype(float)
        if s.notna().sum() < 10:
            out[col] = pd.Series(np.nan, index=df.index)
            continue
        try:
            out[col] = fn(s)
        except Exception:
            out[col] = pd.Series(np.nan, index=df.index)
    return pd.DataFrame(out, index=df.index)


def _apply_ohlcv(panels: dict[str, pd.DataFrame], fn: Callable) -> pd.DataFrame:
    c_df = panels["close"]
    h_df = panels["high"]
    l_df = panels["low"]
    o_df = panels["open"]
    v_df = panels["volume"]
    out = {}
    for col in c_df.columns:
        c = c_df[col].astype(float)
        if c.notna().sum() < 15:
            out[col] = pd.Series(np.nan, index=c_df.index)
            continue
        h = h_df[col].astype(float)
        l = l_df[col].astype(float)
        o = o_df[col].astype(float)
        v = v_df[col].astype(float).fillna(0.0)
        try:
            res = fn(o, h, l, c, v)
            out[col] = pd.Series(res, index=c_df.index) if not isinstance(res, pd.Series) else res
        except Exception:
            out[col] = pd.Series(np.nan, index=c_df.index)
    return pd.DataFrame(out, index=c_df.index)


def _calc_rsi(s: pd.Series, window: int = 14) -> pd.Series:
    if _talib is not None:
        return pd.Series(_talib.RSI(s.values, timeperiod=window), index=s.index)
    if _ta_lib is not None:
        return _ta_lib.momentum.RSIIndicator(s, window=window).rsi()
    diff = s.diff()
    gain = diff.clip(lower=0).ewm(alpha=1 / window, adjust=False).mean()
    loss = (-diff.clip(upper=0)).ewm(alpha=1 / window, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100.0 - 100.0 / (1.0 + rs)


def _calc_macd_hist(s: pd.Series, fast: int = 12, slow: int = 26, sig: int = 9) -> pd.Series:
    if _talib is not None:
        _, _, hist = _talib.MACD(s.values, fastperiod=fast, slowperiod=slow, signalperiod=sig)
        return pd.Series(hist, index=s.index)
    if _ta_lib is not None:
        return _ta_lib.trend.MACD(s, window_slow=slow, window_fast=fast, window_sign=sig).macd_diff()
    ema_f = s.ewm(span=fast, adjust=False).mean()
    ema_s = s.ewm(span=slow, adjust=False).mean()
    dif = ema_f - ema_s
    dea = dif.ewm(span=sig, adjust=False).mean()
    return dif - dea


def _calc_adx(o, h, l, c, v, window: int = 14):
    if _talib is not None:
        return _talib.ADX(h.values, l.values, c.values, timeperiod=window)
    if _ta_lib is not None:
        return _ta_lib.trend.ADXIndicator(h, l, c, window=window).adx()
    return (h - l) / c.replace(0, np.nan)


def _calc_natr(o, h, l, c, v, window: int = 14):
    if _talib is not None:
        return _talib.NATR(h.values, l.values, c.values, timeperiod=window)
    if _ta_lib is not None:
        atr = _ta_lib.volatility.AverageTrueRange(h, l, c, window=window).average_true_range()
        return atr / c.replace(0, np.nan) * 100.0
    tr = pd.concat([(h - l), (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1).max(axis=1)
    return tr.rolling(window).mean() / c.replace(0, np.nan) * 100.0


def _calc_cci(o, h, l, c, v, window: int = 20):
    if _talib is not None:
        return _talib.CCI(h.values, l.values, c.values, timeperiod=window)
    if _ta_lib is not None:
        return _ta_lib.trend.CCIIndicator(h, l, c, window=window).cci()
    tp = (h + l + c) / 3.0
    ma = tp.rolling(window).mean()
    md = tp.rolling(window).apply(lambda x: np.mean(np.abs(x - np.mean(x))), raw=True)
    return (tp - ma) / (0.015 * md.replace(0, np.nan))


def _calc_mfi(o, h, l, c, v, window: int = 14):
    if _talib is not None:
        return _talib.MFI(h.values, l.values, c.values, v.values, timeperiod=window)
    if _ta_lib is not None:
        return _ta_lib.volume.MFIIndicator(h, l, c, v, window=window).money_flow_index()
    tp = (h + l + c) / 3.0
    mf = tp * v
    pos = mf.where(tp > tp.shift(1), 0.0).rolling(window).sum()
    neg = mf.where(tp < tp.shift(1), 0.0).rolling(window).sum()
    return 100.0 - 100.0 / (1.0 + pos / neg.replace(0, np.nan))


def _calc_willr(o, h, l, c, v, window: int = 14):
    if _talib is not None:
        return _talib.WILLR(h.values, l.values, c.values, timeperiod=window)
    if _ta_lib is not None:
        return _ta_lib.momentum.WilliamsRIndicator(h, l, c, lbp=window).williams_r()
    hh = h.rolling(window).max()
    ll = l.rolling(window).min()
    return -100.0 * (hh - c) / (hh - ll).replace(0, np.nan)


def _calc_aroon_osc(o, h, l, c, v, window: int = 25):
    if _talib is not None:
        return _talib.AROONOSC(h.values, l.values, timeperiod=window)
    if _ta_lib is not None:
        return _ta_lib.trend.AroonIndicator(h, l, window=window).aroon_indicator()
    return (h.rolling(window).apply(np.argmax, raw=True) - l.rolling(window).apply(np.argmin, raw=True)) / window * 100.0


def _calc_stoch_k(o, h, l, c, v, window: int = 14):
    if _talib is not None:
        k, _ = _talib.STOCH(h.values, l.values, c.values, fastk_period=window)
        return k
    if _ta_lib is not None:
        return _ta_lib.momentum.StochasticOscillator(h, l, c, window=window).stoch()
    ll = l.rolling(window).min()
    hh = h.rolling(window).max()
    return 100.0 * (c - ll) / (hh - ll).replace(0, np.nan)


# ---------------------------------------------------------------------------
# Mature Factor Catalog (Alpha158 + Alpha101 + Alpha191 + TA-Lib + Fundamental)
# ---------------------------------------------------------------------------

FACTOR_CATALOG: list[dict] = [
    # --- Microsoft Qlib Alpha158 Representative Core ---
    {"id": "q158_kmid", "name": "KMID (日内实体动量)", "family": "Alpha158", "category": "K线形态", "direction": 1,
     "formula": "(close - open) / open", "desc": "Qlib Alpha158 KBAR 基础因子：衡量日内多空实体推进强度"},
    {"id": "q158_klen", "name": "KLEN (日内振幅)", "family": "Alpha158", "category": "波动率", "direction": -1,
     "formula": "(high - low) / open", "desc": "Qlib Alpha158 KBAR 因子：日内高低振幅，低波往往具有更稳健的超额表现"},
    {"id": "q158_ksft", "name": "KSFT (重心偏移)", "family": "Alpha158", "category": "K线形态", "direction": 1,
     "formula": "(2*close - high - low) / open", "desc": "Qlib Alpha158：收盘价相对当日高低中枢的偏移，刻画尾盘买盘强弱"},
    {"id": "q158_roc5", "name": "ROC5 (5日反转/动量)", "family": "Alpha158", "category": "动量反转", "direction": -1,
     "formula": "close / delay(close, 5) - 1", "desc": "Qlib Alpha158 5日收益率，A股短周期常呈显著均值回归（负向反转）"},
    {"id": "q158_roc20", "name": "ROC20 (20日月度动量)", "family": "Alpha158", "category": "动量反转", "direction": -1,
     "formula": "close / delay(close, 20) - 1", "desc": "Qlib Alpha158 20日收益率，经典月度反转/动量因子"},
    {"id": "q158_roc60", "name": "ROC60 (60日季度动量)", "family": "Alpha158", "category": "动量反转", "direction": 1,
     "formula": "close / delay(close, 60) - 1", "desc": "Qlib Alpha158 60日中期趋势动量"},
    {"id": "q158_ma10", "name": "MA10 乖离率", "family": "Alpha158", "category": "均线趋势", "direction": -1,
     "formula": "ts_mean(close, 10) / close - 1", "desc": "Qlib Alpha158：10日均线与现价之比，捕捉偏离均值后的回归机会"},
    {"id": "q158_ma20", "name": "MA20 乖离率", "family": "Alpha158", "category": "均线趋势", "direction": -1,
     "formula": "ts_mean(close, 20) / close - 1", "desc": "Qlib Alpha158：20日均线相对现价位置"},
    {"id": "q158_std20", "name": "STD20 (20日低波因子)", "family": "Alpha158", "category": "波动率", "direction": -1,
     "formula": "-ts_std(close, 20) / close", "desc": "Qlib Alpha158 核心低波异象因子：波动越低风险调整收益通常越优"},
    {"id": "q158_std60", "name": "STD60 (60日低波因子)", "family": "Alpha158", "category": "波动率", "direction": -1,
     "formula": "-ts_std(close, 60) / close", "desc": "Qlib Alpha158 中期低波动因子"},
    {"id": "q158_rsv20", "name": "RSV20 (20日价格位置)", "family": "Alpha158", "category": "价格通道", "direction": -1,
     "formula": "(close - ts_min(low, 20)) / (ts_max(high, 20) - ts_min(low, 20))", "desc": "Qlib Alpha158 RSV20：收盘价在近20日高低区间中的相对分位"},
    {"id": "q158_rsv60", "name": "RSV60 (60日价格位置)", "family": "Alpha158", "category": "价格通道", "direction": 1,
     "formula": "(close - ts_min(low, 60)) / (ts_max(high, 60) - ts_min(low, 60))", "desc": "Qlib Alpha158 RSV60：中期突破强弱位置"},
    {"id": "q158_corr20", "name": "CORR20 (20日量价相关)", "family": "Alpha158", "category": "量价相关性", "direction": -1,
     "formula": "-ts_corr(close, log(volume+1), 20)", "desc": "Qlib Alpha158 量价相关性：放量上涨后短期往往过热，低量价相关更具反转弹性"},
    {"id": "q158_cord20", "name": "CORD20 (量价变化相关)", "family": "Alpha158", "category": "量价相关性", "direction": -1,
     "formula": "-ts_corr(close/delay(close,1), log(volume/delay(volume,1)+1), 20)", "desc": "Qlib Alpha158 收益率与成交量增速的20日相关性"},
    {"id": "q158_vma20", "name": "VMA20 (量能相对均值)", "family": "Alpha158", "category": "成交量", "direction": -1,
     "formula": "ts_mean(volume, 20) / (volume + 1e-12)", "desc": "Qlib Alpha158：缩量/放量状态刻画"},
    {"id": "q158_vstd20", "name": "VSTD20 (成交量稳定性)", "family": "Alpha158", "category": "成交量", "direction": -1,
     "formula": "-ts_std(volume, 20) / (ts_mean(volume, 20) + 1e-12)", "desc": "Qlib Alpha158：成交量变异系数，捕捉资金筹码稳定度"},
    {"id": "q158_wvma20", "name": "WVMA20 (量加权波动)", "family": "Alpha158", "category": "波动率", "direction": -1,
     "formula": "-ts_std(abs(ret)*volume, 20) / ts_mean(abs(ret)*volume, 20)", "desc": "Qlib Alpha158 成交量加权的价格波动率"},
    {"id": "q158_cntd20", "name": "CNTD20 (20日涨跌天数差)", "family": "Alpha158", "category": "动量反转", "direction": 1,
     "formula": "ts_mean(close > delay(close,1), 20) - ts_mean(close < delay(close,1), 20)", "desc": "Qlib Alpha158：上涨天数占比减去下跌天数占比"},
    {"id": "q158_sumd20", "name": "SUMD20 (RSI类多空幅差)", "family": "Alpha158", "category": "动量反转", "direction": 1,
     "formula": "(sum(max(diff,0),20) - sum(max(-diff,0),20)) / sum(abs(diff),20)", "desc": "Qlib Alpha158：20日多头净涨幅占比"},
    {"id": "q158_imxd20", "name": "IMXD20 (高低点时序差)", "family": "Alpha158", "category": "趋势结构", "direction": 1,
     "formula": "(ts_argmax(high, 20) - ts_argmin(low, 20))", "desc": "Qlib Alpha158：近20日最高点与最低点出现时间差，正值代表近期创高走势向上"},

    # --- WorldQuant Alpha101 Classic Set ---
    {"id": "wq_alpha001", "name": "WQ Alpha#001 (波动调整动量极值)", "family": "Alpha101", "category": "动量波动", "direction": 1,
     "formula": "rank(ts_argmax(signed_power(where(ret<0, ts_std(ret,20), close), 2), 5)) - 0.5", "desc": "WorldQuant 101经典首因子：结合下跌波动与上涨价格的极值时点排名"},
    {"id": "wq_alpha002", "name": "WQ Alpha#002 (量变与日内涨跌负相关)", "family": "Alpha101", "category": "量价背离", "direction": 1,
     "formula": "-ts_corr(rank(delta(log(volume), 2)), rank((close-open)/open), 6)", "desc": "WorldQuant #002：捕捉缩量收阳与放量滞涨的短期量价背离"},
    {"id": "wq_alpha003", "name": "WQ Alpha#003 (开盘价与成交量负相关)", "family": "Alpha101", "category": "量价背离", "direction": 1,
     "formula": "-ts_corr(rank(open), rank(volume), 10)", "desc": "WorldQuant #003：10日开盘价排名与成交量排名的负相关"},
    {"id": "wq_alpha004", "name": "WQ Alpha#004 (低点时序反转)", "family": "Alpha101", "category": "短线反转", "direction": 1,
     "formula": "-ts_rank(rank(low), 9)", "desc": "WorldQuant #004：9日最低价横截面排名的时序反转"},
    {"id": "wq_alpha006", "name": "WQ Alpha#006 (开盘量价负相关)", "family": "Alpha101", "category": "量价背离", "direction": 1,
     "formula": "-ts_corr(open, volume, 10)", "desc": "WorldQuant #006：在A股历来表现极强的经典量价负相关反转因子"},
    {"id": "wq_alpha008", "name": "WQ Alpha#008 (开盘收益加速反转)", "family": "Alpha101", "category": "短线反转", "direction": 1,
     "formula": "-rank((ts_sum(open,5)*ts_sum(ret,5)) - delay(ts_sum(open,5)*ts_sum(ret,5), 10))", "desc": "WorldQuant #008：开盘价与累计收益乘积的二阶变化反转"},
    {"id": "wq_alpha012", "name": "WQ Alpha#012 (量价同向反转)", "family": "Alpha101", "category": "量价背离", "direction": 1,
     "formula": "sign(delta(volume, 1)) * (-delta(close, 1))", "desc": "WorldQuant #012：放量下跌抄底、缩量上涨持有"},
    {"id": "wq_alpha013", "name": "WQ Alpha#013 (收盘量协方差反转)", "family": "Alpha101", "category": "量价背离", "direction": 1,
     "formula": "-rank(ts_cov(rank(close), rank(volume), 5))", "desc": "WorldQuant #013：5日收盘价排名与成交量排名的负协方差"},
    {"id": "wq_alpha014", "name": "WQ Alpha#014 (收益变化×开盘量相关)", "family": "Alpha101", "category": "量价复合", "direction": 1,
     "formula": "-rank(delta(ret, 3)) * ts_corr(open, volume, 10)", "desc": "WorldQuant #014：3日收益反转与10日量价相关性的复合因子"},
    {"id": "wq_alpha015", "name": "WQ Alpha#015 (高点量能相关性累积)", "family": "Alpha101", "category": "量价背离", "direction": 1,
     "formula": "-ts_sum(rank(ts_corr(rank(high), rank(volume), 3)), 3)", "desc": "WorldQuant #015：高位放量预警信号"},
    {"id": "wq_alpha016", "name": "WQ Alpha#016 (高点成交量协方差)", "family": "Alpha101", "category": "量价背离", "direction": 1,
     "formula": "-rank(ts_cov(rank(high), rank(volume), 5))", "desc": "WorldQuant #016：5日最高价与成交量秩协方差取反"},
    {"id": "wq_alpha018", "name": "WQ Alpha#018 (实体波动与相关复合)", "family": "Alpha101", "category": "波动反转", "direction": 1,
     "formula": "-rank((ts_std(abs(close-open), 5) + (close-open)) + ts_corr(close, open, 10))", "desc": "WorldQuant #018：结合日内实体波动、日内涨幅与开收相关性"},
    {"id": "wq_alpha020", "name": "WQ Alpha#020 (开盘跳空三因子复合)", "family": "Alpha101", "category": "跳空反转", "direction": 1,
     "formula": "-rank(open-delay(high,1)) * rank(open-delay(close,1)) * rank(open-delay(low,1))", "desc": "WorldQuant #020：高开过热反转与低开修复"},
    {"id": "wq_alpha022", "name": "WQ Alpha#022 (量价相关变化×波动)", "family": "Alpha101", "category": "量价波动", "direction": 1,
     "formula": "-delta(ts_corr(high, volume, 5), 5) * rank(ts_std(close, 20))", "desc": "WorldQuant #022：高点量价相关性变化乘以20日波动排名"},
    {"id": "wq_alpha025", "name": "WQ Alpha#025 (量能均值与振幅反转)", "family": "Alpha101", "category": "量价复合", "direction": 1,
     "formula": "rank((-ret * ts_mean(volume, 20) * vwap) * (high - close))", "desc": "WorldQuant #025：放量回调且留有上影线的超跌回补"},
    {"id": "wq_alpha033", "name": "WQ Alpha#033 (日内开收比反转)", "family": "Alpha101", "category": "短线反转", "direction": 1,
     "formula": "rank(-1 * (1 - open / close))", "desc": "WorldQuant #033：极简高夏普日内反转因子"},
    {"id": "wq_alpha034", "name": "WQ Alpha#034 (短长波动比反转)", "family": "Alpha101", "category": "波动反转", "direction": 1,
     "formula": "rank((1 - rank(ts_std(ret,2)/ts_std(ret,5))) + (1 - rank(delta(close,1))))", "desc": "WorldQuant #034：波动率收敛叠加短期回调"},
    {"id": "wq_alpha038", "name": "WQ Alpha#038 (10日位置与日内回撤)", "family": "Alpha101", "category": "短线反转", "direction": 1,
     "formula": "-rank(ts_rank(close, 10)) * rank(close / open)", "desc": "WorldQuant #038：高位收阳警惕、低位收阴修复"},
    {"id": "wq_alpha040", "name": "WQ Alpha#040 (高点波动与量价相关)", "family": "Alpha101", "category": "量价波动", "direction": 1,
     "formula": "-rank(ts_std(high, 10)) * ts_corr(high, volume, 10)", "desc": "WorldQuant #040：高点低波动与量价低相关共振"},
    {"id": "wq_alpha041", "name": "WQ Alpha#041 (几何均值偏离VWAP)", "family": "Alpha101", "category": "微观结构", "direction": 1,
     "formula": "sqrt(high * low) - vwap", "desc": "WorldQuant #041：高低几何中心相对均价VWAP的偏离"},
    {"id": "wq_alpha042", "name": "WQ Alpha#042 (VWAP相对收盘偏离)", "family": "Alpha101", "category": "微观结构", "direction": 1,
     "formula": "rank(vwap - close) / rank(vwap + close)", "desc": "WorldQuant #042：尾盘压低至均价下方后的次日修复效应"},
    {"id": "wq_alpha044", "name": "WQ Alpha#044 (高点与量能秩负相关)", "family": "Alpha101", "category": "量价背离", "direction": 1,
     "formula": "-ts_corr(high, rank(volume), 5)", "desc": "WorldQuant #044：5日最高价与成交量横截面排名的负相关"},
    {"id": "wq_alpha053", "name": "WQ Alpha#053 (K线位置9日变化)", "family": "Alpha101", "category": "短线反转", "direction": 1,
     "formula": "-delta(((close-low)-(high-close))/(close-low+1e-6), 9)", "desc": "WorldQuant #053：收盘位置强弱9日变化反转"},
    {"id": "wq_alpha054", "name": "WQ Alpha#054 (日内高低开收结构)", "family": "Alpha101", "category": "K线形态", "direction": 1,
     "formula": "-((low - close) * (open^5)) / ((low - high) * (close^5))", "desc": "WorldQuant #054：经典非线性K线实体/影线结构因子"},
    {"id": "wq_alpha060", "name": "WQ Alpha#060 (资金流向与高点位置差)", "family": "Alpha101", "category": "量价复合", "direction": 1,
     "formula": "-(2*scale(rank(((close-low)-(high-close))/(high-low)*volume)) - scale(rank(ts_argmax(close,10))))", "desc": "WorldQuant #060：日内筹码重心成交量加权与10日高点时序对冲"},
    {"id": "wq_alpha101", "name": "WQ Alpha#101 (日内实体占比)", "family": "Alpha101", "category": "K线形态", "direction": 1,
     "formula": "(close - open) / ((high - low) + 0.001)", "desc": "WorldQuant #101：极简光头光脚实体强度指标"},

    # --- 国泰君安 Alpha191 精选 ---
    {"id": "gtja_001", "name": "GTJA #001 (量能变化与实体负相关)", "family": "Alpha191", "category": "量价背离", "direction": 1,
     "formula": "-ts_corr(rank(delta(log(volume), 1)), rank((close-open)/open), 6)", "desc": "国泰君安 Alpha191 首因子：针对A股优化的单日量变与日内涨幅背离"},
    {"id": "gtja_002", "name": "GTJA #002 (收盘位置单日反转)", "family": "Alpha191", "category": "短线反转", "direction": 1,
     "formula": "-delta(((close-low)-(high-close))/(high-low+1e-6), 1)", "desc": "国泰君安 Alpha191 #002：日内收口位置单日跳变反转"},
    {"id": "gtja_014", "name": "GTJA #014 (5日价差动量)", "family": "Alpha191", "category": "动量反转", "direction": -1,
     "formula": "close - delay(close, 5)", "desc": "国泰君安 Alpha191 #014：5日绝对价格动量"},
    {"id": "gtja_018", "name": "GTJA #018 (5日涨跌幅比率)", "family": "Alpha191", "category": "短线反转", "direction": -1,
     "formula": "close / delay(close, 5)", "desc": "国泰君安 Alpha191 #018：5日价格比"},
    {"id": "gtja_020", "name": "GTJA #020 (6日涨幅反转)", "family": "Alpha191", "category": "短线反转", "direction": -1,
     "formula": "(close - delay(close, 6)) / delay(close, 6) * 100", "desc": "国泰君安 Alpha191 #020：6日涨幅百分比"},
    {"id": "gtja_031", "name": "GTJA #031 (12日均线乖离)", "family": "Alpha191", "category": "均线趋势", "direction": -1,
     "formula": "(close - ts_mean(close, 12)) / ts_mean(close, 12) * 100", "desc": "国泰君安 Alpha191 #031：12日均线BIAS乖离率"},
    {"id": "gtja_042", "name": "GTJA #042 (高点波动×量价相关)", "family": "Alpha191", "category": "量价波动", "direction": 1,
     "formula": "-rank(ts_std(high, 10)) * ts_corr(high, volume, 10)", "desc": "国泰君安 Alpha191 #042：A股量价波动经典复合因子"},
    {"id": "gtja_057", "name": "GTJA #057 (9日随机RSV平滑)", "family": "Alpha191", "category": "摆动指标", "direction": -1,
     "formula": "EMA((close-ts_min(low,9))/(ts_max(high,9)-ts_min(low,9))*100, 3)", "desc": "国泰君安 Alpha191 #057：类KDJ快速摆动指标"},
    {"id": "gtja_070", "name": "GTJA #070 (6日成交额低波)", "family": "Alpha191", "category": "流动性", "direction": -1,
     "formula": "-ts_std(amount, 6) / (ts_mean(amount, 6) + 1e-6)", "desc": "国泰君安 Alpha191 #070：成交额稳定性因子"},
    {"id": "gtja_088", "name": "GTJA #088 (20日价格趋势)", "family": "Alpha191", "category": "动量反转", "direction": -1,
     "formula": "(close - delay(close, 20)) / delay(close, 20) * 100", "desc": "国泰君安 Alpha191 #088：20日收益率"},

    # --- TA-Lib / 成熟技术面因子 ---
    {"id": "ta_rsi14", "name": "TA-Lib RSI(14)", "family": "TA-Lib", "category": "动量超买超卖", "direction": -1,
     "formula": "RSI(close, 14)", "desc": "经典14日相对强弱指数，A股横截面低RSI常具超跌反弹收益"},
    {"id": "ta_macd_hist", "name": "TA-Lib MACD柱状动量", "family": "TA-Lib", "category": "趋势动量", "direction": 1,
     "formula": "MACD_HIST(close, 12, 26, 9) / close", "desc": "标准化MACD红绿柱强度，捕捉趋势加速拐点"},
    {"id": "ta_adx14", "name": "TA-Lib ADX(14) 趋势强度", "family": "TA-Lib", "category": "趋势强度", "direction": 1,
     "formula": "ADX(high, low, close, 14)", "desc": "Wilder 趋势强度指标，用于识别强趋势与震荡市"},
    {"id": "ta_natr14", "name": "TA-Lib NATR(14) 归一化波幅", "family": "TA-Lib", "category": "波动率", "direction": -1,
     "formula": "-NATR(high, low, close, 14)", "desc": "14日归一化真实波幅（取负=低波因子）"},
    {"id": "ta_cci20", "name": "TA-Lib CCI(20) 顺势指标", "family": "TA-Lib", "category": "摆动指标", "direction": -1,
     "formula": "CCI(high, low, close, 20)", "desc": "20日商品通道指标，刻画价格偏离统计常态程度"},
    {"id": "ta_mfi14", "name": "TA-Lib MFI(14) 资金流量", "family": "TA-Lib", "category": "量价资金", "direction": -1,
     "formula": "MFI(high, low, close, volume, 14)", "desc": "带成交量加权的RSI资金流量指标"},
    {"id": "ta_willr14", "name": "TA-Lib WILLR(14) 威廉指标", "family": "TA-Lib", "category": "动量超买超卖", "direction": -1,
     "formula": "WILLR(high, low, close, 14)", "desc": "14日威廉超买超卖指标"},
    {"id": "ta_boll_pctb", "name": "布林带 %B 位置", "family": "TA-Lib", "category": "波动通道", "direction": -1,
     "formula": "(close - boll_low) / (boll_up - boll_low)", "desc": "收盘价在20日布林上下轨中的标准化位置"},
    {"id": "ta_boll_bw", "name": "布林带宽度 (波动收敛)", "family": "TA-Lib", "category": "波动通道", "direction": -1,
     "formula": "-(boll_up - boll_low) / boll_mid", "desc": "布林带宽收敛度，负值越大代表挤压越紧"},
    {"id": "ta_aroon25", "name": "TA-Lib Aroon(25) 趋势振荡", "family": "TA-Lib", "category": "趋势强度", "direction": 1,
     "formula": "AROONOSC(high, low, 25)", "desc": "25日阿隆多空趋势强弱差"},
    {"id": "ta_stoch_k", "name": "TA-Lib Stochastic %K", "family": "TA-Lib", "category": "摆动指标", "direction": -1,
     "formula": "STOCH_K(high, low, close, 14)", "desc": "14日随机震荡指标K值"},

    # --- 基本面 / Barra 风格与流动性因子（来自 Tushare daily_basic） ---
    {"id": "fund_ep_ttm", "name": "EP_TTM (盈利收益率)", "family": "Fundamental", "category": "价值因子", "direction": 1,
     "formula": "1 / pe_ttm", "desc": "Barra 价值核心因子：市盈率TTM倒数，越高估值越便宜"},
    {"id": "fund_bp", "name": "BP (账面市值比)", "family": "Fundamental", "category": "价值因子", "direction": 1,
     "formula": "1 / pb", "desc": "Fama-French HML 核心价值因子：市净率倒数"},
    {"id": "fund_dv_ttm", "name": "股息率 (DV_TTM)", "family": "Fundamental", "category": "红利价值", "direction": 1,
     "formula": "dv_ttm", "desc": "高股息红利因子：近12个月股息率"},
    {"id": "fund_size_neg", "name": "小市值因子 (-ln 流通市值)", "family": "Fundamental", "category": "规模风格", "direction": 1,
     "formula": "-log(circ_mv)", "desc": "Fama-French SMB 规模因子：流通市值对数取负"},
    {"id": "fund_turnover20", "name": "20日低换手因子", "family": "Fundamental", "category": "流动性", "direction": 1,
     "formula": "-ts_mean(turnover_rate_f, 20)", "desc": "A股极稳健的换手率反转因子：20日自由流通换手率越低越稳健"},
    {"id": "fund_amihud20", "name": "Amihud 非流动性因子", "family": "Fundamental", "category": "流动性", "direction": 1,
     "formula": "ts_mean(abs(ret) / (amount + 1), 20)", "desc": "经典 Amihud 流动性溢价因子"},
    {"id": "fund_vol_ratio", "name": "量比异动因子", "family": "Fundamental", "category": "流动性", "direction": -1,
     "formula": "-volume_ratio", "desc": "Tushare 日频量比指标"},
]

FACTOR_META_MAP = {f["id"]: f for f in FACTOR_CATALOG}


def compute_factor(factor_id: str, panels: dict[str, pd.DataFrame], custom_expr: str = "") -> pd.DataFrame:
    """Compute a factor DataFrame (index=date, columns=symbol) from OHLCV + fundamental panels."""
    o = panels["open"]
    h = panels["high"]
    l = panels["low"]
    c = panels["close"]
    v = panels["volume"].fillna(0.0)
    amt = panels.get("amount")
    if amt is None or amt.empty:
        amt = c * v
    vwap = _safe_div(amt, v.replace(0, np.nan)).fillna((h + l + c) / 3.0)
    ret = c.pct_change()
    log_v = np.log(v.clip(lower=0) + 1.0)

    if factor_id == "custom" or custom_expr.strip():
        return eval_custom_formula(custom_expr.strip(), {
            "open": o, "high": h, "low": l, "close": c, "volume": v,
            "amount": amt, "vwap": vwap, "ret": ret, "log_v": log_v,
            "pe_ttm": panels.get("pe_ttm", pd.DataFrame(np.nan, index=c.index, columns=c.columns)),
            "pb": panels.get("pb", pd.DataFrame(np.nan, index=c.index, columns=c.columns)),
            "dv_ttm": panels.get("dv_ttm", pd.DataFrame(np.nan, index=c.index, columns=c.columns)),
            "circ_mv": panels.get("circ_mv", pd.DataFrame(np.nan, index=c.index, columns=c.columns)),
            "turnover_rate_f": panels.get("turnover_rate_f", pd.DataFrame(np.nan, index=c.index, columns=c.columns)),
        })

    fid = factor_id.strip()

    # --- Alpha158 ---
    if fid == "q158_kmid":
        return _safe_div(c - o, o)
    if fid == "q158_klen":
        return _safe_div(h - l, o)
    if fid == "q158_ksft":
        return _safe_div(2.0 * c - h - l, o)
    if fid == "q158_roc5":
        return _safe_div(c, delay(c, 5)) - 1.0
    if fid == "q158_roc20":
        return _safe_div(c, delay(c, 20)) - 1.0
    if fid == "q158_roc60":
        return _safe_div(c, delay(c, 60)) - 1.0
    if fid == "q158_ma10":
        return _safe_div(ts_mean(c, 10), c) - 1.0
    if fid == "q158_ma20":
        return _safe_div(ts_mean(c, 20), c) - 1.0
    if fid == "q158_std20":
        return -_safe_div(ts_std(c, 20), c)
    if fid == "q158_std60":
        return -_safe_div(ts_std(c, 60), c)
    if fid == "q158_rsv20":
        return _safe_div(c - ts_min(l, 20), ts_max(h, 20) - ts_min(l, 20))
    if fid == "q158_rsv60":
        return _safe_div(c - ts_min(l, 60), ts_max(h, 60) - ts_min(l, 60))
    if fid == "q158_corr20":
        return -ts_corr(c, log_v, 20)
    if fid == "q158_cord20":
        return -ts_corr(_safe_div(c, delay(c, 1)), np.log(_safe_div(v, delay(v, 1)).clip(lower=0) + 1.0), 20)
    if fid == "q158_vma20":
        return _safe_div(ts_mean(v, 20), v + 1e-6)
    if fid == "q158_vstd20":
        return -_safe_div(ts_std(v, 20), ts_mean(v, 20) + 1e-6)
    if fid == "q158_wvma20":
        wv = ret.abs() * v
        return -_safe_div(ts_std(wv, 20), ts_mean(wv, 20) + 1e-6)
    if fid == "q158_cntd20":
        up = (c > delay(c, 1)).astype(float)
        dn = (c < delay(c, 1)).astype(float)
        return ts_mean(up, 20) - ts_mean(dn, 20)
    if fid == "q158_sumd20":
        d1 = delta(c, 1)
        return _safe_div(ts_sum(d1.clip(lower=0), 20) - ts_sum((-d1).clip(lower=0), 20), ts_sum(d1.abs(), 20))
    if fid == "q158_imxd20":
        return ts_argmax(h, 20) - ts_argmin(l, 20)

    # --- WorldQuant Alpha101 ---
    if fid == "wq_alpha001":
        inner = c.where(ret >= 0, ts_std(ret, 20))
        return cs_rank(ts_argmax(signed_power(inner, 2.0), 5)) - 0.5
    if fid == "wq_alpha002":
        return -ts_corr(cs_rank(delta(log_v, 2)), cs_rank(_safe_div(c - o, o)), 6)
    if fid == "wq_alpha003":
        return -ts_corr(cs_rank(o), cs_rank(v), 10)
    if fid == "wq_alpha004":
        return -ts_rank(cs_rank(l), 9)
    if fid == "wq_alpha006":
        return -ts_corr(o, v, 10)
    if fid == "wq_alpha008":
        prod = ts_sum(o, 5) * ts_sum(ret, 5)
        return -cs_rank(prod - delay(prod, 10))
    if fid == "wq_alpha012":
        return np.sign(delta(v, 1)) * (-delta(c, 1))
    if fid == "wq_alpha013":
        return -cs_rank(ts_cov(cs_rank(c), cs_rank(v), 5))
    if fid == "wq_alpha014":
        return -cs_rank(delta(ret, 3)) * ts_corr(o, v, 10)
    if fid == "wq_alpha015":
        return -ts_sum(cs_rank(ts_corr(cs_rank(h), cs_rank(v), 3)), 3)
    if fid == "wq_alpha016":
        return -cs_rank(ts_cov(cs_rank(h), cs_rank(v), 5))
    if fid == "wq_alpha018":
        return -cs_rank(ts_std((c - o).abs(), 5) + (c - o) + ts_corr(c, o, 10))
    if fid == "wq_alpha020":
        return -cs_rank(o - delay(h, 1)) * cs_rank(o - delay(c, 1)) * cs_rank(o - delay(l, 1))
    if fid == "wq_alpha022":
        return -delta(ts_corr(h, v, 5), 5) * cs_rank(ts_std(c, 20))
    if fid == "wq_alpha025":
        return cs_rank((-ret) * ts_mean(v, 20) * vwap * (h - c))
    if fid == "wq_alpha033":
        return cs_rank(-(1.0 - _safe_div(o, c)))
    if fid == "wq_alpha034":
        return cs_rank((1.0 - cs_rank(_safe_div(ts_std(ret, 2), ts_std(ret, 5)))) + (1.0 - cs_rank(delta(c, 1))))
    if fid == "wq_alpha038":
        return -cs_rank(ts_rank(c, 10)) * cs_rank(_safe_div(c, o))
    if fid == "wq_alpha040":
        return -cs_rank(ts_std(h, 10)) * ts_corr(h, v, 10)
    if fid == "wq_alpha041":
        return np.sqrt((h * l).clip(lower=0)) - vwap
    if fid == "wq_alpha042":
        return _safe_div(cs_rank(vwap - c), cs_rank(vwap + c))
    if fid == "wq_alpha044":
        return -ts_corr(h, cs_rank(v), 5)
    if fid == "wq_alpha053":
        return -delta(_safe_div((c - l) - (h - c), (c - l) + 1e-6), 9)
    if fid == "wq_alpha054":
        return -_safe_div((l - c) * (o ** 5), (l - h).replace(0, np.nan) * (c ** 5))
    if fid == "wq_alpha060":
        mf = _safe_div((c - l) - (h - c), h - l) * v
        return -(2.0 * cs_scale(cs_rank(mf)) - cs_scale(cs_rank(ts_argmax(c, 10))))
    if fid == "wq_alpha101":
        return _safe_div(c - o, (h - l) + 0.001)

    # --- GTJA Alpha191 ---
    if fid == "gtja_001":
        return -ts_corr(cs_rank(delta(log_v, 1)), cs_rank(_safe_div(c - o, o)), 6)
    if fid == "gtja_002":
        return -delta(_safe_div((c - l) - (h - c), (h - l) + 1e-6), 1)
    if fid == "gtja_014":
        return c - delay(c, 5)
    if fid == "gtja_018":
        return _safe_div(c, delay(c, 5))
    if fid == "gtja_020":
        return _safe_div(c - delay(c, 6), delay(c, 6)) * 100.0
    if fid == "gtja_031":
        m12 = ts_mean(c, 12)
        return _safe_div(c - m12, m12) * 100.0
    if fid == "gtja_042":
        return -cs_rank(ts_std(h, 10)) * ts_corr(h, v, 10)
    if fid == "gtja_057":
        rsv9 = _safe_div(c - ts_min(l, 9), ts_max(h, 9) - ts_min(l, 9)) * 100.0
        return rsv9.ewm(span=3, adjust=False).mean()
    if fid == "gtja_070":
        return -_safe_div(ts_std(amt, 6), ts_mean(amt, 6) + 1e-6)
    if fid == "gtja_088":
        return _safe_div(c - delay(c, 20), delay(c, 20)) * 100.0

    # --- TA-Lib ---
    if fid == "ta_rsi14":
        return _apply_col(c, lambda s: _calc_rsi(s, 14))
    if fid == "ta_macd_hist":
        return _safe_div(_apply_col(c, lambda s: _calc_macd_hist(s, 12, 26, 9)), c)
    if fid == "ta_adx14":
        return _apply_ohlcv(panels, lambda o_, h_, l_, c_, v_: _calc_adx(o_, h_, l_, c_, v_, 14))
    if fid == "ta_natr14":
        return -_apply_ohlcv(panels, lambda o_, h_, l_, c_, v_: _calc_natr(o_, h_, l_, c_, v_, 14))
    if fid == "ta_cci20":
        return _apply_ohlcv(panels, lambda o_, h_, l_, c_, v_: _calc_cci(o_, h_, l_, c_, v_, 20))
    if fid == "ta_mfi14":
        return _apply_ohlcv(panels, lambda o_, h_, l_, c_, v_: _calc_mfi(o_, h_, l_, c_, v_, 14))
    if fid == "ta_willr14":
        return _apply_ohlcv(panels, lambda o_, h_, l_, c_, v_: _calc_willr(o_, h_, l_, c_, v_, 14))
    if fid == "ta_boll_pctb":
        mid = ts_mean(c, 20)
        sd = ts_std(c, 20)
        return _safe_div(c - (mid - 2.0 * sd), 4.0 * sd)
    if fid == "ta_boll_bw":
        mid = ts_mean(c, 20)
        sd = ts_std(c, 20)
        return -_safe_div(4.0 * sd, mid)
    if fid == "ta_aroon25":
        return _apply_ohlcv(panels, lambda o_, h_, l_, c_, v_: _calc_aroon_osc(o_, h_, l_, c_, v_, 25))
    if fid == "ta_stoch_k":
        return _apply_ohlcv(panels, lambda o_, h_, l_, c_, v_: _calc_stoch_k(o_, h_, l_, c_, v_, 14))

    # --- Fundamental / Style ---
    if fid == "fund_ep_ttm":
        pe = panels.get("pe_ttm")
        if pe is None:
            raise ValueError("缺少 pe_ttm 基本面数据，请先同步 A 股数据仓")
        return _safe_div(pd.DataFrame(1.0, index=pe.index, columns=pe.columns), pe.where(pe > 0))
    if fid == "fund_bp":
        pb = panels.get("pb")
        if pb is None:
            raise ValueError("缺少 pb 基本面数据，请先同步 A 股数据仓")
        return _safe_div(pd.DataFrame(1.0, index=pb.index, columns=pb.columns), pb.where(pb > 0))
    if fid == "fund_dv_ttm":
        dv = panels.get("dv_ttm")
        if dv is None:
            raise ValueError("缺少 dv_ttm 股息率数据，请先同步 A 股数据仓")
        return dv
    if fid == "fund_size_neg":
        mv = panels.get("circ_mv")
        if mv is None:
            raise ValueError("缺少 circ_mv 市值数据，请先同步 A 股数据仓")
        return -np.log(mv.where(mv > 0))
    if fid == "fund_turnover20":
        tr = panels.get("turnover_rate_f")
        if tr is None:
            raise ValueError("缺少 turnover_rate_f 换手率数据，请先同步 A 股数据仓")
        return -ts_mean(tr, 20)
    if fid == "fund_amihud20":
        return ts_mean(_safe_div(ret.abs(), amt.clip(lower=1.0)), 20) * 1e8
    if fid == "fund_vol_ratio":
        vr = panels.get("volume_ratio")
        if vr is None:
            return -_safe_div(v, ts_mean(v, 5) + 1e-6)
        return -vr

    raise ValueError(f"未知因子 ID: {fid}")


def eval_custom_formula(expr: str, env_vars: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Safely evaluate a user-defined vectorized factor formula (supports both Python-like and $close Qlib style)."""
    cleaned = expr.strip()
    if not cleaned:
        raise ValueError("自定义因子表达式为空")
    # Block dunder / import / attribute abuse
    if re.search(r"__|import|exec|eval|open\s*\(|os\.|sys\.|lambda|class|def ", cleaned):
        raise ValueError("表达式包含不允许的关键字")
    # Convert Qlib $close -> close, Ref(x, n) -> delay(x, n), Mean -> ts_mean, Std -> ts_std, Corr -> ts_corr
    cleaned = re.sub(r"\$([a-zA-Z_]\w*)", r"\1", cleaned)
    cleaned = re.sub(r"\bRef\s*\(", "delay(", cleaned)
    cleaned = re.sub(r"\bMean\s*\(", "ts_mean(", cleaned)
    cleaned = re.sub(r"\bStd\s*\(", "ts_std(", cleaned)
    cleaned = re.sub(r"\bSum\s*\(", "ts_sum(", cleaned)
    cleaned = re.sub(r"\bMax\s*\(", "ts_max(", cleaned)
    cleaned = re.sub(r"\bMin\s*\(", "ts_min(", cleaned)
    cleaned = re.sub(r"\bCorr\s*\(", "ts_corr(", cleaned)
    cleaned = re.sub(r"\bRank\s*\(", "rank(", cleaned)

    safe_ns = {
        "__builtins__": {},
        "rank": cs_rank,
        "zscore": cs_zscore,
        "scale": cs_scale,
        "delay": delay,
        "delta": delta,
        "ts_sum": ts_sum,
        "ts_mean": ts_mean,
        "ts_std": ts_std,
        "ts_min": ts_min,
        "ts_max": ts_max,
        "ts_rank": ts_rank,
        "ts_argmax": ts_argmax,
        "ts_argmin": ts_argmin,
        "ts_corr": ts_corr,
        "ts_cov": ts_cov,
        "decay_linear": decay_linear,
        "signed_power": signed_power,
        "log": lambda x: np.log(x.clip(lower=1e-12)) if isinstance(x, pd.DataFrame) else math.log(max(x, 1e-12)),
        "abs": lambda x: x.abs() if isinstance(x, pd.DataFrame) else abs(x),
        "sqrt": lambda x: np.sqrt(x.clip(lower=0)) if isinstance(x, pd.DataFrame) else math.sqrt(max(x, 0)),
        "sign": lambda x: np.sign(x),
        "clip": lambda x, lo, hi: x.clip(lower=lo, upper=hi),
        **env_vars,
    }
    res = eval(cleaned, safe_ns, {})
    if not isinstance(res, pd.DataFrame):
        raise ValueError("表达式必须返回横截面矩阵 DataFrame")
    return res.replace([np.inf, -np.inf], np.nan)


def build_feature_matrix_for_ml(
    panels: dict[str, pd.DataFrame],
    factor_ids: list[str],
    normalize: bool = True,
) -> dict[str, pd.DataFrame]:
    """Compute a dictionary of named feature panels for LightGBM / Qlib multi-factor models."""
    feats: dict[str, pd.DataFrame] = {}
    for fid in factor_ids:
        try:
            f = compute_factor(fid, panels)
            f = f.replace([np.inf, -np.inf], np.nan)
            if normalize:
                f = cs_zscore(winsorize_mad(f))
            feats[fid] = f
        except Exception:
            continue
    return feats
