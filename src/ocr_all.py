from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import extract as ex
import ocr_cloud


def main() -> None:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base, "docs")
    cache = os.path.join(base, "build", "ocr_cloud")

    token = os.environ.get("PADDLE_TOKEN") or ""
    if not token:
        cfg_path = os.path.join(base, "config.json")
        try:
            with open(cfg_path, encoding="utf-8") as f:
                token = json.load(f).get("paddle_token") or ""
        except (OSError, ValueError):
            pass
    if not token:
        raise SystemExit("缺少 PADDLE_TOKEN（环境变量或 config.json 的 paddle_token）")

    docs, _skipped = ex.scan(root)
    pdfs = [d.abs_path for d in docs if d.abs_path.lower().endswith(".pdf")]
    print(f"待识别 PDF {len(pdfs)} 份")

    stats = ocr_cloud.batch(pdfs, token, cache, workers=1)
    ok = sum(1 for v in stats.values() if v.startswith("ok"))
    print(f"\n完成 {ok}/{len(pdfs)}")
    bad = {k: v for k, v in stats.items() if not v.startswith("ok")}
    if bad:
        print("失败清单：")
        for k, v in bad.items():
            print("  ", os.path.basename(k)[:50], "->", v)
    with open(os.path.join(base, "build", "ocr_batch.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
