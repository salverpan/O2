from __future__ import annotations

import hashlib
import json
import os
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
MODEL = "PaddleOCR-VL-1.6"
PAGE_WORKERS = 8
_JOB_SEM = threading.BoundedSemaphore(PAGE_WORKERS)


class OCRError(RuntimeError):
    pass


def _file_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def _headers(token: str) -> dict:
    return {"Authorization": f"bearer {token}"}


def submit(path: str, token: str, model: str = MODEL) -> str:
    payload = {
        "model": model,
        "optionalPayload": json.dumps(
            {
                "useDocOrientationClassify": False,
                "useDocUnwarping": False,
                "useChartRecognition": False,
            }
        ),
    }
    delays = (0, 1, 2, 4, 8, 16)
    last = "提交失败"
    for i, delay in enumerate(delays):
        if delay:
            time.sleep(delay)
        with open(path, "rb") as f:
            r = requests.post(
                JOB_URL, headers=_headers(token), data=payload,
                files={"file": (os.path.basename(path), f, "application/pdf")},
                timeout=300,
            )
        try:
            body = r.json()
        except ValueError:
            body = {}
        job = (body.get("data") or {}).get("jobId")
        if r.status_code == 200 and job:
            return job
        code = body.get("code")
        last = f"提交失败 {r.status_code}: {(r.text or '')[:200]}"
        if r.status_code in (429, 503) or code in (10010, 12002):
            continue
        raise OCRError(last)
    raise OCRError(last)


def wait(job_id: str, token: str, timeout: int = 600, interval: float = 1.5) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = requests.get(f"{JOB_URL}/{job_id}", headers=_headers(token), timeout=90)
        if r.status_code != 200:
            time.sleep(interval)
            continue
        d = r.json().get("data") or {}
        st = d.get("state")
        if st == "done":
            return (d.get("resultUrl") or {}).get("jsonUrl") or ""
        if st == "failed":
            raise OCRError(f"任务失败: {d.get('errorMsg')}")
        time.sleep(interval)
    raise OCRError("等待超时")


def _pdf_page_sizes(path: str) -> list[tuple[float, float]]:
    import pymupdf

    with pymupdf.open(path) as doc:
        return [(p.rect.width, p.rect.height) for p in doc]


def _split_page_pdfs(src: str, folder: str) -> list[tuple[str, tuple[float, float]]]:
    import pymupdf

    out: list[tuple[str, tuple[float, float]]] = []
    with pymupdf.open(src) as doc:
        for i in range(len(doc)):
            page = doc[i]
            size = (page.rect.width, page.rect.height)
            dest = os.path.join(folder, f"{i:04d}.pdf")
            one = pymupdf.open()
            one.insert_pdf(doc, from_page=i, to_page=i)
            one.save(dest)
            one.close()
            out.append((dest, size))
    return out


def _layout_to_page(res: dict, size: tuple[float, float], index: int) -> dict:
    pr = res.get("prunedResult", {}) or {}
    w_px = pr.get("width") or 0
    h_px = pr.get("height") or 0
    w_pt, h_pt = size
    sx = (w_pt / w_px) if w_px else 1.0
    sy = (h_pt / h_px) if h_px else 1.0
    blocks = []
    for b in pr.get("parsing_res_list", []) or []:
        txt = (b.get("block_content") or "").strip()
        bb = b.get("block_bbox") or []
        if not txt or len(bb) != 4:
            continue
        blocks.append(
            {
                "text": txt,
                "label": b.get("block_label") or "",
                "bbox": [round(bb[0] * sx, 2), round(bb[1] * sy, 2),
                         round(bb[2] * sx, 2), round(bb[3] * sy, 2)],
            }
        )
    return {
        "index": index,
        "width": round(w_pt, 2),
        "height": round(h_pt, 2),
        "markdown": (res.get("markdown") or {}).get("text", ""),
        "blocks": blocks,
    }


def _parse_pages(text: str, sizes: list[tuple[float, float]]) -> list[dict]:
    pages: list[dict] = []
    for line in (text or "").strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        result = json.loads(line).get("result") or {}
        for res in result.get("layoutParsingResults", []) or []:
            idx = len(pages)
            size = sizes[idx] if idx < len(sizes) else (0.0, 0.0)
            pages.append(_layout_to_page(res, size, idx))
    return pages


def _ocr_one_page(page_pdf: str, token: str, model: str,
                  size: tuple[float, float], index: int) -> dict:
    last: Exception | None = None
    for attempt in range(3):
        try:
            with _JOB_SEM:
                job = submit(page_pdf, token, model)
                url = wait(job, token)
                if not url:
                    raise OCRError("结果地址为空")
                r = requests.get(url, timeout=120)
                r.raise_for_status()
            pages = _parse_pages(r.text, [size])
            if pages:
                p = pages[0]
                p["index"] = index
                p["width"] = round(size[0], 2)
                p["height"] = round(size[1], 2)
                return p
            return {
                "index": index,
                "width": round(size[0], 2),
                "height": round(size[1], 2),
                "markdown": "",
                "blocks": [],
            }
        except Exception as e:                      # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise OCRError(f"第 {index + 1} 页失败: {last}")


def fetch(path: str, token: str, model: str = MODEL, on_progress=None) -> dict:
    n = len(_pdf_page_sizes(path))
    if n == 0:
        raise OCRError("PDF 没有页面")

    def report(done: int, total: int, stage: str = "ocr") -> None:
        if on_progress:
            on_progress(done, total, stage)

    report(0, n)
    with tempfile.TemporaryDirectory(prefix="ocr-") as td:
        parts = _split_page_pdfs(path, td)
        results: list[dict | None] = [None] * len(parts)
        workers = min(PAGE_WORKERS, len(parts)) or 1
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {
                ex.submit(_ocr_one_page, pdf, token, model, size, i): i
                for i, (pdf, size) in enumerate(parts)
            }
            done = 0
            for fut in as_completed(futs):
                i = futs[fut]
                results[i] = fut.result()
                done += 1
                report(done, n)
    pages = [p for p in results if p is not None]
    if len(pages) != n:
        raise OCRError("有页面未识别完成")
    return {"model": model, "pages": pages}


def ocr_cached(path: str, token: str, cache_dir: str, model: str = MODEL,
               force: bool = False, on_progress=None, cache_key_path: str = "") -> dict:
    os.makedirs(cache_dir, exist_ok=True)
    key_src = cache_key_path or path
    cp = os.path.join(cache_dir, f"{_file_hash(key_src)}.json")
    if os.path.exists(cp) and not force:
        try:
            with open(cp, encoding="utf-8") as f:
                data = json.load(f)
            if on_progress:
                n = max(len(data.get("pages") or []), 1)
                on_progress(n, n, "cache")
            return data
        except (OSError, ValueError):
            pass
    data = fetch(path, token, model, on_progress=on_progress)
    data["source"] = os.path.basename(path)
    with open(cp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def batch(paths: list[str], token: str, cache_dir: str, workers: int = 1,
          log=print) -> dict:
    stats: dict[str, str] = {}

    def one(p: str) -> tuple[str, str]:
        try:
            d = ocr_cached(p, token, cache_dir)
            return p, f"ok {len(d['pages'])}页"
        except Exception as e:                      # noqa: BLE001
            return p, f"失败 {type(e).__name__}: {e}"[:180]

    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        futs = {ex.submit(one, p): p for p in paths}
        for i, fut in enumerate(as_completed(futs), start=1):
            p, msg = fut.result()
            stats[p] = msg
            log(f"[{i}/{len(paths)}] {os.path.basename(p)[:42]} -> {msg}")
    return stats
