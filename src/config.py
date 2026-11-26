from __future__ import annotations

import json
import os
import threading

import providers as prov_mod
import embed as embed_mod
import api_tool as api_mod

_CONFIG_LOCK = threading.RLock()

DEFAULT_CONFIG = {
    "base_url": "https://api.deepseek.com",
    "api_key": "",
    "model": "deepseek-flash",
    "provider_id": "deepseek",
    "effort": "high",
    "temperature": 0.1,
    "top_k": 8,
    "max_tokens": 0,
    "paddle_token": "",
    "providers": [],
    "embed_providers": [],
    "embed_provider_id": "qwen",
    "embed_model": "text-embedding-v3",
    "embed_use": False,
    "embed_running": False,
    "shell": True,
    "browser": True,
    "api_call": True,
    "api_connectors": [],
    "pdf_ocr_mode": "smart",
    "batch_concurrency": 3,
    "batch_fast_meta": False,
    "browser_download_mode": "sandbox",
    "auto_clean_temp": True,
    "ui_density": "default",
    "ui_theme": "light",
    "default_tab": "ask",
    "followup_mode": "steer",
    "news_enabled": False,
    "news_auto_translate": True,
    "news_refresh_minutes": 15,
    "news_llm_provider_id": "",
    "news_llm_model": "",
    "news_rsshub_base": "https://rsshub.app",
    "news_glossary": [],
    "news_local_embed": True,
    "news_local_rerank": True,
    "news_embed_model": "BAAI/bge-m3",
    "news_rerank_model": "BAAI/bge-reranker-v2-m3",
    "news_dedup_window_hours": 72,
    "news_dedup_sem_threshold": 0.86,
    "news_dedup_xlang_threshold": 0.83,
    "dashboard_layout": None,
    "market_layout": None,
    "market_proxy": "",
    "market_source_mode": "auto",
}


class Config:
    def __init__(self, path: str):
        self.path = path
        self.data = dict(DEFAULT_CONFIG)
        self.load()

    def load(self) -> None:
        with _CONFIG_LOCK:
            try:
                with open(self.path, encoding="utf-8") as f:
                    self.data.update(json.load(f))
            except (OSError, ValueError):
                pass
            prov_mod.migrate(self.data)
            embed_mod.migrate(self.data)
            api_mod.migrate(self.data)

    def save(self) -> None:
        with _CONFIG_LOCK:
            prov_mod.migrate(self.data)
            embed_mod.migrate(self.data)
            api_mod.migrate(self.data)
            ch = prov_mod.find(self.data, self.data.get("provider_id"))
            if ch:
                self.data["base_url"] = ch.get("base_url") or self.data.get("base_url")
                self.data["api_key"] = ch.get("api_key") or ""
            os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
            tmp_path = f"{self.path}.tmp.{os.getpid()}.{threading.get_ident()}"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.path)

    @property
    def enabled(self) -> bool:
        return prov_mod.any_key(self.data)
