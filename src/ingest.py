from __future__ import annotations

import base64
import json
import os
import re
import shutil
import sqlite3
import uuid
import urllib.error
import urllib.request

import attach as attach_mod
import build as build_mod
import catalog as catalog_mod
import extract as ex
import search as search_mod

ALLOWED_EXT = ex.SUPPORTED_EXTS
STATUSES = ("现行", "试行", "已废止")
MAX_UPLOAD = 100 * 1024 * 1024

META_SYS = """你是企业级多模态文档智能分类与结构化元数据抽取器。只返回 JSON，不要解释。
输出 JSON 结构：
{
  "doc_type": "regulation | finance | contract | report | spreadsheet | image | general",
  "folder": "建议归入的子文件夹名称（优先从已有文件夹中匹配；若都不合适，给出2-8字简短分类目录名）",
  "dept": "所属部门或业务归口",
  "title": "规范化文档标题（不要书名号与扩展名）",
  "doc_no": "文号或编号，无则留空",
  "issued_date": "YYYY-MM-DD，无则留空",
  "status": "现行 | 试行 | 已废止",
  "summary": "40字以内的一句话核心摘要",
  "tags": ["标签1", "标签2", "标签3"],
  "meta": {
    // 根据 doc_type 填入对应专属字段：
    // regulation(制度法规): {"dept":"发文部门","doc_no":"文号","issued_date":"发布日期","status":"现行/试行/已废止","scope":"适用范围"}
    // finance(财报数据): {"entity":"公司主体","period":"报告期如2025Q3/2025年报","audit_status":"已审计/合并口径/预算","currency":"币种单位","metrics":"核心指标摘要"}
    // contract(合同协议): {"party_a":"甲方","party_b":"乙方","amount":"合同金额","sign_date":"签订日期","contract_status":"履行中/已完结"}
    // report(研报方案): {"stage":"可研/尽调/方案/纪要/汇报","author":"编制单位或作者","topic":"核心主题","issued_date":"日期"}
    // spreadsheet(表格台账): {"sheets":"工作表名","row_count":"行数","columns":"关键表头字段","stat_period":"统计周期"}
    // image(图片图纸): {"image_type":"流程图/规划图/架构图/图表/照片","visual_summary":"视觉要素描述"}
    // general(通用文档): {"topic":"主题分类","author":"来源或作者","issued_date":"日期"}
  }
}"""

VISION_SYS = """请详细识别并描述这张图片/图纸/图表中的所有内容：
1. 如果是流程图、架构图或工程图纸：按逻辑顺序列出所有节点、连线、区域标注和文字说明；
2. 如果是统计图表或表格截图：完整转写表头、数据趋势与关键数值；
3. 如果是公文、证照或现场照片：提取所有可见文字、印章及画面关键要素。
直接输出结构化中文描述与原文转写，不要寒暄。"""


def require_keys(cfg, ext: str = ".pdf", has_native_text: bool = False) -> str | None:
    ext = (ext or "").lower()
    # 非扫描件或已自带文本层的文档，不强制要求 PaddleOCR Token
    if ext == ".pdf" and not has_native_text:
        if not (cfg.data.get("paddle_token") or "").strip():
            return "该 PDF 为无文本层的扫描件，请先在设置中填入 PaddleOCR Token"
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


def _safe_folder_path(folder: str) -> str:
    raw = (folder or "").replace("\\", "/").strip("/")
    if not raw:
        return ""
    parts = []
    for p in raw.split("/"):
        s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", p.strip()).strip(" .")
        if s and s not in (".", ".."):
            parts.append(s[:60])
    return "/".join(parts[:6])


def _find_tmp(work_dir: str, tmp_id: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{32}", tmp_id or ""):
        raise ValueError("无效的临时文件")
    folder = uploads_dir(work_dir)
    for fn in os.listdir(folder):
        if fn.startswith(tmp_id):
            return os.path.join(folder, fn)
    raise ValueError("临时文件已过期，请重新上传")


def _chat_json(cfg, user: str, sys_prompt: str = META_SYS) -> dict:
    import providers as prov_mod
    ch = prov_mod.resolve_openaiish(cfg.data)
    if not ch or not ch.get("api_key"):
        raise ValueError("未配置大模型 API")
    url = prov_mod.chat_url(ch["base_url"], "openai" if ch["protocol"] == "anthropic" else ch["protocol"])
    payload = {
        "model": ch["model"] or "deepseek-flash",
        "messages": [
            {"role": "system", "content": sys_prompt},
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
    with prov_mod.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _describe_image_with_vlm(cfg, img_bytes: bytes, ext: str) -> str:
    import providers as prov_mod
    if not prov_mod.any_key(cfg.data):
        return ""
    ch = prov_mod.resolve_openaiish(cfg.data)
    if not ch or not ch.get("api_key"):
        return ""
    # 检查当前模型或同渠道是否有支持视觉输入的模型
    model_id = ch.get("model") or ""
    meta = catalog_mod.annotate(ch.get("preset") or "", ch.get("base_url") or "", model_id)
    if not meta.get("image"):
        p_obj = prov_mod.find(cfg.data, ch.get("id"))
        for m in (p_obj or {}).get("models") or []:
            mm = catalog_mod.annotate(ch.get("preset") or "", ch.get("base_url") or "", m.get("id") or "")
            if mm.get("image") or "vl" in (m.get("id") or "").lower() or "vision" in (m.get("id") or "").lower():
                model_id = m.get("id")
                break
    try:
        jpeg, mime = attach_mod.to_vision_jpeg(img_bytes, ext)
        b64 = base64.b64encode(jpeg).decode("ascii")
        url = prov_mod.chat_url(ch["base_url"], "openai" if ch["protocol"] == "anthropic" else ch["protocol"])
        payload = {
            "model": model_id,
            "messages": [
                {"role": "system", "content": VISION_SYS},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "请识别并详细描述该图像的内容："},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    ],
                },
            ],
            "temperature": 0.1,
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {ch['api_key']}",
                "User-Agent": prov_mod.USER_AGENT,
                **prov_mod.extra_headers(ch.get("base_url") or "", ch.get("protocol") or "openai", ch["api_key"], "o2-vision"),
            },
            method="POST",
        )
        with prov_mod.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    except Exception:
        return ""


def extract_meta(cfg, doc: ex.Doc, filename: str, existing_folders: list[str]) -> dict:
    ex.enrich_from_text(doc)
    head = "\n".join(doc.pages[:3])[:4500]
    table_hint = ""
    if doc.tables:
        t_Previews = [
            f"{t.get('title')}(列:{','.join((t.get('headers') or [])[:6])}; 共{len(t.get('rows') or [])}行)"
            for t in doc.tables[:4]
        ]
        table_hint = "\n检测到的表格结构：" + "；".join(t_Previews)

    prompt = (
        f"当前项目：{doc.project}\n"
        f"已有文件夹/分类：{'、'.join(existing_folders) or '（无）'}\n"
        f"文件名：{filename} (格式:{doc.file_ext})\n"
        f"初步规则推测性质：{doc.doc_type} ({ex.DOC_TYPES.get(doc.doc_type, {}).get('label', '')})\n"
        f"{table_hint}\n\n"
        f"内容前部摘录：\n{head or '（无文本）'}"
    )
    got: dict = {}
    try:
        import providers as prov_mod
        if prov_mod.any_key(cfg.data):
            got = _chat_json(cfg, prompt)
    except Exception:
        got = {}

    dtype = str(got.get("doc_type") or doc.doc_type or "general").strip().lower()
    if dtype not in ex.DOC_TYPES:
        dtype = doc.doc_type if doc.doc_type in ex.DOC_TYPES else "general"

    folder_pick = _safe_folder_path(str(got.get("folder") or got.get("dept") or doc.folder or doc.dept or ""))
    if folder_pick and existing_folders:
        for ef in existing_folders:
            if ef == folder_pick or ef.endswith("/" + folder_pick):
                folder_pick = ef
                break

    dept = str(got.get("dept") or doc.dept or (folder_pick.split("/")[-1] if folder_pick else "")).strip()
    title = str(got.get("title") or doc.title or os.path.splitext(os.path.basename(filename))[0]).strip()
    doc_no = str(got.get("doc_no") or doc.doc_no or "").strip()
    issued_date = str(got.get("issued_date") or doc.issued_date or "").strip()
    status = str(got.get("status") or doc.status or "现行").strip()
    if status not in STATUSES:
        status = "现行"

    merged_meta = dict(doc.meta or {})
    if isinstance(got.get("meta"), dict):
        for k, v in got["meta"].items():
            if v is not None and str(v).strip():
                merged_meta[k] = str(v).strip()

    if dtype == "regulation":
        merged_meta["dept"] = dept or merged_meta.get("dept") or ""
        merged_meta["doc_no"] = doc_no or merged_meta.get("doc_no") or ""
        merged_meta["issued_date"] = issued_date or merged_meta.get("issued_date") or ""
        merged_meta["status"] = status

    tags = got.get("tags") if isinstance(got.get("tags"), list) else doc.tags
    tags = [str(t).strip() for t in (tags or []) if str(t).strip()][:6]

    summary = str(got.get("summary") or doc.summary or "").strip()
    doc.doc_type = dtype
    doc.category = ex.DOC_TYPES[dtype]["label"]
    doc.meta = merged_meta
    if not summary:
        summary = ex.build_auto_summary(doc, head)

    has_art = bool(re.search(r"(?:^|\n)[\s　]*第[一二三四五六七八九十百零\d]{1,5}条", head))
    chunk_profile = ex.default_chunk_profile(dtype, doc.file_ext, sum(len(p) for p in doc.pages), has_art)

    return {
        "project": doc.project or "集团制度库",
        "folder": doc.folder or folder_pick,
        "dept": dept or folder_pick or "其他",
        "doc_type": dtype,
        "category": ex.DOC_TYPES[dtype]["label"],
        "chunk_profile": chunk_profile,
        "title": title,
        "doc_no": doc_no,
        "issued_date": issued_date,
        "status": status,
        "summary": summary,
        "tags": tags,
        "meta": merged_meta,
    }


def parse_upload(
    cfg,
    work_dir: str,
    filename: str,
    data: bytes,
    depts: list[str],
    on_progress=None,
    project: str = "",
    folder: str = "",
    rel_path: str = "",
) -> dict:
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

    if not data:
        raise ValueError("文件为空")
    if len(data) > MAX_UPLOAD:
        raise ValueError("文件超过 100MB")
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise ValueError(f"暂不支持该文件格式 ({ext or '未知'})")

    # 若上传带有文件夹相对路径（如拖入整个项目文件夹）
    inferred_proj = (project or "").strip()
    inferred_folder = _safe_folder_path(folder)
    if rel_path:
        norm_rel = rel_path.replace("\\", "/").strip("/")
        rparts = [p for p in norm_rel.split("/") if p and p not in (".", "..")]
        if len(rparts) >= 2:
            if not inferred_proj:
                inferred_proj = rparts[0]
                inferred_folder = _safe_folder_path("/".join(rparts[1:-1]))
            else:
                sub = "/".join(rparts[1:-1]) if rparts[0] == inferred_proj else "/".join(rparts[:-1])
                if sub:
                    inferred_folder = _safe_folder_path(
                        f"{inferred_folder}/{sub}" if inferred_folder else sub
                    )

    prog(5, "正在保存文件")
    tmp_id = uuid.uuid4().hex
    path = os.path.join(uploads_dir(work_dir), tmp_id + ext)
    with open(path, "wb") as f:
        f.write(data)

    prog(12, "正在解析文件与结构")
    d = ex.Doc(
        key=tmp_id,
        project=inferred_proj or "集团制度库",
        folder=inferred_folder,
        dept=inferred_folder.split("/")[-1] if inferred_folder else "",
        file_ext=ext,
        rel_path=os.path.basename(filename),
        abs_path=path,
        title="",
        doc_no="",
        issued_date="",
        status="现行",
    )
    ex.extract_text(d)

    token = (cfg.data.get("paddle_token") or "").strip()
    cache = os.path.join(work_dir, "ocr_cloud")

    if ext == ".pdf":
        if token:
            def ocr_hook(done: int, total: int, stage: str = "ocr") -> None:
                total = max(int(total or 0), 1)
                done = int(done or 0)
                if stage == "cache":
                    prog(50, "命中版面识别缓存", done, total, "ocr")
                    return
                pct = 15 + int(done / total * 68)
                if done <= 0:
                    prog(15, f"版面与表格识别中，共 {total} 页", 0, total, "ocr")
                else:
                    prog(pct, f"正在识别 {done}/{total} 页", done, total, "ocr")

            ok = ex.run_cloud_ocr(d, token, cache, on_progress=ocr_hook)
            if not ok and not d.has_text:
                raise ValueError(d.note or "PaddleOCR 识别失败")
        elif not d.has_text:
            raise ValueError("该 PDF 是扫描件（无内置文本层），请先在设置中填入 PaddleOCR Token")
        else:
            prog(55, f"已抽取 PDF 文本与 {len(d.tables)} 张表格")
    elif ext in ex.IMAGE_EXTS:
        prog(25, "正在构建图像视觉与文字索引", stage="ocr")
        vision_desc = _describe_image_with_vlm(cfg, data, ext)
        ocr_text = ""
        if token and ext != ".svg":
            if ex.run_cloud_ocr(d, token, cache):
                ocr_text = "\n".join(d.pages).strip()
        combined_parts = []
        if vision_desc:
            combined_parts.append(f"【AI 视觉解析】\n{vision_desc}")
            d.meta["visual_summary"] = vision_desc[:140].replace("\n", " ")
        if ocr_text:
            combined_parts.append(f"【图中文字 OCR】\n{ocr_text}")
        if combined_parts:
            d.pages = ["\n\n".join(combined_parts)]
            d.has_text = True
            d.text_source = "vlm+ocr" if (vision_desc and ocr_text) else ("vlm" if vision_desc else "paddleocr-vl")
        prog(78, "图像索引构建完成")
    else:
        if not d.has_text and ext in (".doc", ".docx") and token:
            prog(30, "Word 内置文本为空，尝试转 PDF OCR")
        elif not d.has_text:
            raise ValueError(d.note or "无法抽取文件有效内容")
        else:
            prog(60, f"内容抽取完成（共 {len(d.pages)} 页/表）")

    prog(86, "AI 正在识别文件性质并提取专属属性", stage="meta")
    meta = extract_meta(cfg, d, os.path.basename(filename), depts)
    if inferred_proj:
        meta["project"] = inferred_proj
    if inferred_folder:
        meta["folder"] = inferred_folder
    prog(100, "识别完成", stage="done")
    return {
        "tmp_id": tmp_id,
        "filename": os.path.basename(filename),
        "file_ext": ext,
        "n_pages": len(d.pages),
        "n_tables": len(d.tables),
        "text_source": d.text_source,
        **meta,
    }


def commit(
    cfg,
    db_path: str,
    src_root: str,
    work_dir: str,
    tmp_id: str,
    meta: dict,
    doc_id: int | None = None,
) -> dict:
    src = _find_tmp(work_dir, tmp_id)
    ext = os.path.splitext(src)[1].lower()
    project = (meta.get("project") or "").strip() or "集团制度库"
    folder = _safe_folder_path(meta.get("folder") or "")
    dept = (meta.get("dept") or (folder.split("/")[-1] if folder else "") or "").strip() or project
    doc_type = (meta.get("doc_type") or "general").strip().lower()
    if doc_type not in ex.DOC_TYPES:
        doc_type = "general"
    category = ex.DOC_TYPES[doc_type]["label"]
    chunk_profile = (meta.get("chunk_profile") or "auto").strip()
    title = (meta.get("title") or "").strip()
    doc_no = (meta.get("doc_no") or "").strip()
    issued = (meta.get("issued_date") or "").strip()
    status = (meta.get("status") or "现行").strip()
    summary = (meta.get("summary") or "").strip()
    tags = meta.get("tags") if isinstance(meta.get("tags"), list) else []
    custom_meta = meta.get("meta") if isinstance(meta.get("meta"), dict) else {}

    if status not in STATUSES:
        status = "现行"
    if not title:
        raise ValueError("文件名称不能为空")

    stem = _safe_filename((doc_no + " " + title).strip() if (doc_no and doc_type == "regulation") else title)
    sub_parts = [project] + ([p for p in folder.split("/") if p] if folder else [])
    dest_dir = os.path.join(src_root, *sub_parts)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, stem + ext)
    if os.path.exists(dest):
        dest = os.path.join(dest_dir, f"{stem}_{tmp_id[:6]}{ext}")
    shutil.copy2(src, dest)

    rel = os.path.relpath(dest, src_root)
    d = ex.Doc(
        key=rel,
        project=project,
        folder=folder,
        dept=dept,
        doc_type=doc_type,
        category=category,
        file_ext=ext,
        chunk_profile=chunk_profile,
        title=title,
        doc_no=doc_no,
        issued_date=issued,
        status=status,
        summary=summary,
        tags=tags,
        meta=custom_meta,
        rel_path=rel,
        abs_path=dest,
    )
    ex.extract_text(d)
    cache = os.path.join(work_dir, "ocr_cloud")
    if ext in (".pdf", *ex.IMAGE_EXTS):
        ex.apply_cloud_ocr(d, cache)
    if ext in ex.IMAGE_EXTS and custom_meta.get("visual_summary"):
        v_text = f"【AI 视觉解析】\n{custom_meta['visual_summary']}\n\n" + "\n".join(d.pages)
        d.pages = [v_text]
        d.has_text = True
    ex.enrich_from_text(d)
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
    return {"ok": True, "doc_id": new_id, "rel_path": rel, "project": project, "folder": folder, "doc_type": doc_type}


def ai_organize_project(cfg, db_path: str, project: str) -> dict:
    """对指定项目下的文档自动识别共性并归入合理的子文件夹与文件性质。"""
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    build_mod.ensure_schema(con)
    rows = con.execute(
        """SELECT id, title, doc_type, folder, dept, doc_no, summary, file_ext, meta_json
             FROM docs WHERE project=? ORDER BY id""",
        (project,),
    ).fetchall()
    con.close()
    if not rows:
        return {"ok": True, "updated": 0}

    items_desc = []
    for r in rows[:120]:
        items_desc.append({
            "id": r["id"],
            "title": r["title"],
            "ext": r["file_ext"],
            "current_folder": r["folder"],
            "doc_type": r["doc_type"],
            "summary": (r["summary"] or "")[:80],
        })

    plan: dict[int, dict] = {}
    import providers as prov_mod
    if prov_mod.any_key(cfg.data):
        sys_p = (
            "你是项目资料归档专家。请将以下项目中的文件按业务主题与文件性质智能归入结构清晰的子文件夹（可使用多级路径如 '01-制度规范'、'02-财务报表'、'03-合同协议'、'04-方案与汇报' 或按部门/专题划分），"
            "同时核对每个文件的 doc_type (regulation/finance/contract/report/spreadsheet/image/general)。"
            "只返回 JSON：{\"items\": [{\"id\": 1, \"folder\": \"子文件夹名\", \"doc_type\": \"性质\"}]}"
        )
        try:
            res = _chat_json(cfg, json.dumps({"project": project, "files": items_desc}, ensure_ascii=False), sys_prompt=sys_p)
            for it in res.get("items") or []:
                if isinstance(it, dict) and it.get("id"):
                    plan[int(it["id"])] = {
                        "folder": _safe_folder_path(str(it.get("folder") or "")),
                        "doc_type": str(it.get("doc_type") or "").strip().lower(),
                    }
        except Exception:
            plan = {}

    default_folder_map = {
        "regulation": "01-制度与规范",
        "contract": "02-合同与协议",
        "finance": "03-财报与预算",
        "report": "04-报告与方案",
        "spreadsheet": "05-数据与台账",
        "image": "06-图纸与图像",
        "general": "07-综合资料",
    }

    updated = 0
    for r in rows:
        did = int(r["id"])
        p = plan.get(did) or {}
        dtype = p.get("doc_type") if p.get("doc_type") in ex.DOC_TYPES else (r["doc_type"] or "general")
        new_folder = p.get("folder") or r["folder"] or r["dept"] or default_folder_map.get(dtype, "综合资料")
        if new_folder != (r["folder"] or "") or dtype != (r["doc_type"] or ""):
            build_mod.update_doc_metadata(db_path, did, {"folder": new_folder, "doc_type": dtype})
            updated += 1
    return {"ok": True, "updated": updated}


def set_status(db_path: str, doc_id: int, status: str) -> None:
    if status not in STATUSES:
        raise ValueError("状态只能是现行、试行或已废止")
    build_mod.set_doc_status(db_path, doc_id, status)


def existing_depts(con) -> list[str]:
    fct = search_mod.facets(con)
    folders = fct.get("folders") or []
    depts = fct.get("depts") or []
    return list(dict.fromkeys([*folders, *depts]))
