from __future__ import annotations

import json
import os
import re
import shutil
import uuid
import urllib.error
import urllib.request

import build as build_mod
import extract as ex
import search as search_mod

ALLOWED_EXT = {".pdf", ".doc", ".docx"}
STATUSES = ("现行", "试行", "已废止")
MAX_UPLOAD = 80 * 1024 * 1024

META_SYS = """你是文档元数据抽取器。只返回 JSON，不要解释。
字段：
{"dept":"","title":"","doc_no":"","issued_date":"","status":"现行"}
规则：
- dept 优先从已有分类目录中匹配；无法判断再给简短分类名
- title 为文档标题，不要加书名号
- doc_no 为文号或编号，无则留空
- issued_date 用 YYYY-MM-DD，无则留空
- status 只能是 现行 / 试行 / 已废止"""


def require_keys(cfg) -> str | None:
    import providers as prov_mod
    if not prov_mod.any_key(cfg.data):
        return "请先在设置中填入 API Key"
    if not (cfg.data.get("paddle_token") or "").strip():
        return "请先在设置中填入 PaddleOCR Token"
    return None


def uploads_dir(work_dir: str) -> str:
    p = os.path.join(work_dir, "uploads")
    os.makedirs(p, exist_ok=True)
    return p


def _safe_filename(name: str) -> str:
    name = os.path.basename(name or "")
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    name = name.strip(" .")
    return name[:120] or "文档"


def _find_tmp(work_dir: str, tmp_id: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{32}", tmp_id or ""):
        raise ValueError("无效的临时文件")
    folder = uploads_dir(work_dir)
    for fn in os.listdir(folder):
        if fn.startswith(tmp_id):
            return os.path.join(folder, fn)
    raise ValueError("临时文件已过期，请重新上传")


def _chat_json(cfg, user: str) -> dict:
    import providers as prov_mod
    ch = prov_mod.resolve_openaiish(cfg.data)
    if not ch or not ch.get("api_key"):
        raise ValueError("未配置大模型 API")
    url = prov_mod.chat_url(ch["base_url"], "openai" if ch["protocol"] == "anthropic" else ch["protocol"])
    payload = {
        "model": ch["model"] or "deepseek-flash",
        "messages": [
            {"role": "system", "content": META_SYS},
            {"role": "user", "content": user},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ch['api_key']}",
            "User-Agent": prov_mod.USER_AGENT,
            **prov_mod.extra_headers(ch.get("base_url") or "", ch.get("protocol") or "openai", ch["api_key"], "o2-ingest"),
        },
        method="POST",
    )
    with prov_mod.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def extract_meta(cfg, text: str, filename: str, depts: list[str]) -> dict:
    fallback = ex.parse_filename(filename)
    head = (text or "")[:4000]
    prompt = (
        f"已有分类：{'、'.join(depts) or '（无）'}\n"
        f"文件名：{filename}\n\n"
        f"原文首页：\n{head or '（无文本）'}"
    )
    try:
        got = _chat_json(cfg, prompt)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError,
            ValueError, json.JSONDecodeError, KeyError, IndexError):
        got = {}
    out = {
        "dept": str(got.get("dept") or "").strip(),
        "title": str(got.get("title") or fallback.get("title") or "").strip(),
        "doc_no": str(got.get("doc_no") or fallback.get("doc_no") or "").strip(),
        "issued_date": str(got.get("issued_date") or fallback.get("issued_date") or "").strip(),
        "status": str(got.get("status") or fallback.get("status") or "现行").strip(),
    }
    if out["status"] not in STATUSES:
        out["status"] = "现行"
    if out["dept"] and depts:
        for d in depts:
            if d == out["dept"] or d in out["dept"] or out["dept"] in d:
                out["dept"] = d
                break
    return out


def parse_upload(cfg, work_dir: str, filename: str, data: bytes,
                 depts: list[str], on_progress=None) -> dict:
    def prog(percent: int, message: str, done: int = 0, total: int = 0,
             stage: str = "") -> None:
        if on_progress:
            on_progress({
                "percent": max(0, min(100, int(percent))),
                "message": message,
                "done": done,
                "total": total,
                "stage": stage,
            })

    err = require_keys(cfg)
    if err:
        raise ValueError(err)
    if not data:
        raise ValueError("文件为空")
    if len(data) > MAX_UPLOAD:
        raise ValueError("文件超过 80MB")
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise ValueError("只支持 PDF / Word")

    prog(4, "正在保存文件")
    tmp_id = uuid.uuid4().hex
    path = os.path.join(uploads_dir(work_dir), tmp_id + ext)
    with open(path, "wb") as f:
        f.write(data)

    prog(8, "正在读取文件")
    d = ex.Doc(key=tmp_id, dept="", rel_path=filename, abs_path=path,
               title="", doc_no="", issued_date="", status="现行")
    ex.extract_text(d)
    token = cfg.data.get("paddle_token") or ""
    cache = os.path.join(work_dir, "ocr_cloud")
    if ext == ".pdf":
        def ocr_hook(done: int, total: int, stage: str = "ocr") -> None:
            total = max(int(total or 0), 1)
            done = int(done or 0)
            if stage == "cache":
                prog(40, "命中识别缓存", done, total, "ocr")
                return
            pct = 10 + int(done / total * 75)
            if done <= 0:
                prog(10, f"开始识别，共 {total} 页", 0, total, "ocr")
            else:
                prog(pct, f"正在识别 {done}/{total} 页", done, total, "ocr")

        if not ex.run_cloud_ocr(d, token, cache, on_progress=ocr_hook):
            raise ValueError(d.note or "PaddleOCR 识别失败")
    elif not d.has_text:
        raise ValueError(d.note or "无法抽取文本")
    else:
        prog(50, "正在抽取文本")

    prog(88, "正在提取文档信息", stage="meta")
    ex.enrich_from_text(d)
    body = "\n".join(d.pages[:2])
    meta = extract_meta(cfg, body, filename, depts)
    if not meta["dept"]:
        meta["dept"] = d.dept or ""
    if not meta["title"]:
        meta["title"] = d.title or os.path.splitext(filename)[0]
    prog(100, "识别完成", stage="done")
    return {
        "tmp_id": tmp_id,
        "filename": filename,
        "n_pages": len(d.pages),
        "text_source": d.text_source,
        **meta,
    }


def commit(cfg, db_path: str, src_root: str, work_dir: str,
           tmp_id: str, meta: dict, doc_id: int | None = None) -> dict:
    err = require_keys(cfg)
    if err:
        raise ValueError(err)
    src = _find_tmp(work_dir, tmp_id)
    ext = os.path.splitext(src)[1].lower()
    dept = (meta.get("dept") or "").strip() or "其他"
    title = (meta.get("title") or "").strip()
    doc_no = (meta.get("doc_no") or "").strip()
    issued = (meta.get("issued_date") or "").strip()
    status = (meta.get("status") or "现行").strip()
    if status not in STATUSES:
        status = "现行"
    if not title:
        raise ValueError("文件名称不能为空")

    stem = _safe_filename((doc_no + title) if doc_no else title)
    dest_dir = os.path.join(src_root, dept)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, stem + ext)
    if os.path.exists(dest):
        dest = os.path.join(dest_dir, f"{stem}_{tmp_id[:6]}{ext}")
    shutil.copy2(src, dest)

    rel = os.path.relpath(dest, src_root)
    d = ex.Doc(
        key=rel, dept=dept, title=title, doc_no=doc_no, issued_date=issued,
        status=status, category="文档", rel_path=rel, abs_path=dest,
    )
    ex.extract_text(d)
    cache = os.path.join(work_dir, "ocr_cloud")
    if ext == ".pdf":
        ex.apply_cloud_ocr(d, cache)
    if not d.has_text:
        raise ValueError(d.note or "入库失败：没有可用文本")

    new_id = build_mod.upsert_document(db_path, d, doc_id)
    try:
        os.remove(src)
    except OSError:
        pass
    if cfg.data.get("embed_running"):
        try:
            import embed as embed_mod
            embed_mod.embed_document(cfg, db_path, new_id)
        except Exception:
            pass
    return {"ok": True, "doc_id": new_id, "rel_path": rel}


def set_status(db_path: str, doc_id: int, status: str) -> None:
    if status not in STATUSES:
        raise ValueError("状态只能是现行、试行或已废止")
    build_mod.set_doc_status(db_path, doc_id, status)


def existing_depts(con) -> list[str]:
    return search_mod.facets(con).get("depts") or []
