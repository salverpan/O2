from __future__ import annotations

import os
import shutil
import sqlite3
import subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC_DOCS = os.path.join(ROOT, "docs")
DB = os.path.join(ROOT, "data", "zdl.sqlite")
DIST = os.path.join(ROOT, "dist")
OUT_DOCS = os.path.join(ROOT, "build", "docs_pack", "docs")
JPEG_Q = 70
MAX_SIDE = 1800
ISCC_CANDIDATES = [
    os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "Inno Setup 6", "ISCC.exe"),
    os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Inno Setup 6", "ISCC.exe"),
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Inno Setup 6", "ISCC.exe"),
]


def resolve_src(rel: str, abs_path: str) -> str:
    if abs_path and os.path.isfile(abs_path):
        return abs_path
    cand = os.path.join(SRC_DOCS, (rel or "").replace("/", os.sep))
    return cand if os.path.isfile(cand) else ""


def compress_pdf(src: str, dst: str) -> None:
    import pymupdf

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    doc = pymupdf.open(src)
    seen: set[int] = set()
    for page in doc:
        for info in page.get_images(full=True):
            xref = info[0]
            if xref in seen:
                continue
            seen.add(xref)
            try:
                pix = pymupdf.Pixmap(doc, xref)
            except Exception:
                continue
            if pix.n - pix.alpha >= 4:
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            w, h = pix.width, pix.height
            if w < 400 and h < 400:
                continue
            scale = min(1.0, MAX_SIDE / max(w, h, 1))
            if scale < 0.99:
                pix = pymupdf.Pixmap(pix, int(w * scale), int(h * scale), None)
            try:
                data = pix.tobytes("jpeg", jpg_quality=JPEG_Q)
                doc.update_stream(xref, data)
            except Exception:
                pass
    tmp = dst + ".tmp"
    doc.save(
        tmp,
        garbage=4,
        deflate=True,
        deflate_images=True,
        deflate_fonts=True,
        clean=True,
    )
    doc.close()
    os.replace(tmp, dst)


def _file_count(folder: str) -> int:
    if not os.path.isdir(folder):
        return 0
    n = 0
    for _root, _dirs, files in os.walk(folder):
        n += len(files)
    return n


def copy_docs() -> tuple[int, int, int, int]:
    if not os.path.isfile(DB):
        os.makedirs(OUT_DOCS, exist_ok=True)
        return 0, 0, 0, 0
    con = sqlite3.connect(DB)
    rows = con.execute("SELECT rel_path, abs_path FROM docs").fetchall()
    con.close()
    if rows and _file_count(OUT_DOCS) >= len(rows):
        size = sum(
            os.path.getsize(os.path.join(r, f))
            for r, _d, fs in os.walk(OUT_DOCS)
            for f in fs
        )
        return len(rows), 0, size, size
    if os.path.isdir(OUT_DOCS):
        shutil.rmtree(OUT_DOCS)
    os.makedirs(OUT_DOCS, exist_ok=True)
    n_ok = n_fail = 0
    src_bytes = dst_bytes = 0
    for rel, abs_path in rows:
        src = resolve_src(rel, abs_path)
        if not src:
            n_fail += 1
            continue
        dest = os.path.join(OUT_DOCS, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        src_bytes += os.path.getsize(src)
        ext = os.path.splitext(src)[1].lower()
        try:
            if ext == ".pdf":
                compress_pdf(src, dest)
                if os.path.getsize(dest) >= os.path.getsize(src) * 0.95:
                    shutil.copy2(src, dest)
            else:
                shutil.copy2(src, dest)
            dst_bytes += os.path.getsize(dest)
            n_ok += 1
        except Exception:
            shutil.copy2(src, dest)
            dst_bytes += os.path.getsize(dest)
            n_fail += 1
    return n_ok, n_fail, src_bytes, dst_bytes


def ensure_icon() -> str:
    path = os.path.join(ROOT, "assets", "app.ico")
    if os.path.isfile(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    from PIL import Image, ImageDraw, ImageFont

    sizes = [16, 32, 48, 64, 128, 256]
    images = []
    font_path = r"C:\Windows\Fonts\msyhbd.ttc"
    if not os.path.isfile(font_path):
        font_path = r"C:\Windows\Fonts\msyh.ttc"
    for s in sizes:
        im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        m = max(1, s // 16)
        d.rounded_rectangle(
            [m, m, s - 1 - m, s - 1 - m],
            radius=max(2, s // 5),
            fill=(29, 78, 216, 255),
        )
        try:
            font = ImageFont.truetype(font_path, int(s * 0.44), index=0)
        except OSError:
            font = ImageFont.load_default()
        text = "O2"
        bbox = d.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        d.text(
            ((s - tw) / 2 - bbox[0], (s - th) / 2 - bbox[1] - s * 0.02),
            text,
            font=font,
            fill=(255, 255, 255, 255),
        )
        images.append(im)
    images[-1].save(path, format="ICO", sizes=[(s, s) for s in sizes])
    return path


def find_iscc() -> str:
    for p in ISCC_CANDIDATES:
        if p and os.path.isfile(p):
            return p
    found = shutil.which("iscc")
    if found:
        return found
    raise FileNotFoundError("未找到 Inno Setup（ISCC.exe）")


def write_readme() -> None:
    text = (
        "O2\n"
        "\n"
        "双击「O2-Setup.exe」安装后，从开始菜单或桌面快捷方式打开。\n"
        "打开「设置」，填入大模型接口地址、API Key 和模型名即可使用。\n"
        "关闭窗口即退出。卸载请用开始菜单里的卸载项，或系统设置 → 应用。\n"
    )
    os.makedirs(DIST, exist_ok=True)
    with open(os.path.join(DIST, "使用说明.txt"), "w", encoding="utf-8") as f:
        f.write(text)


def folder_mb(path: str) -> float:
    total = 0
    if os.path.isfile(path):
        return os.path.getsize(path) / 1024 / 1024
    for r, _d, fs in os.walk(path):
        for f in fs:
            total += os.path.getsize(os.path.join(r, f))
    return total / 1024 / 1024


def main() -> None:
    ensure_icon()
    copy_docs()
    py = os.path.join(ROOT, ".venv", "Scripts", "pyinstaller.exe")
    spec = os.path.join(ROOT, "build.spec")
    subprocess.check_call([py, "--noconfirm", "--clean", spec], cwd=ROOT)
    app_dir = os.path.join(DIST, "O2")
    print(f"程序目录 {folder_mb(app_dir):.0f} MB  {app_dir}")
    iscc = find_iscc()
    subprocess.check_call([iscc, os.path.join(ROOT, "setup.iss")], cwd=ROOT)
    setup = os.path.join(DIST, "O2-Setup.exe")
    write_readme()
    if os.path.isfile(setup):
        print(f"安装包 {os.path.getsize(setup)/1024/1024:.0f} MB  {setup}")


if __name__ == "__main__":
    main()
