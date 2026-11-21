from __future__ import annotations

import json
import os

import providers as prov_mod
import embed as embed_mod
import api_tool as api_mod

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
}


class Config:
    def __init__(self, path: str):
        self.path = path
        self.data = dict(DEFAULT_CONFIG)
        self.load()

    def load(self) -> None:
        try:
            with open(self.path, encoding="utf-8") as f:
                self.data.update(json.load(f))
        except (OSError, ValueError):
            pass
        prov_mod.migrate(self.data)
        embed_mod.migrate(self.data)
        api_mod.migrate(self.data)

    def save(self) -> None:
        prov_mod.migrate(self.data)
        embed_mod.migrate(self.data)
        api_mod.migrate(self.data)
        ch = prov_mod.find(self.data, self.data.get("provider_id"))
        if ch:
            self.data["base_url"] = ch.get("base_url") or self.data.get("base_url")
            self.data["api_key"] = ch.get("api_key") or ""
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)

    @property
    def enabled(self) -> bool:
        return prov_mod.any_key(self.data)
