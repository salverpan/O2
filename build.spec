import os

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

BASE = os.path.dirname(os.path.abspath(SPEC))
WEB = os.path.join(BASE, "src", "web")
ICON = os.path.join(BASE, "assets", "app.ico")
VER = os.path.join(BASE, "version_info.txt")

datas = [
    (os.path.join(WEB, "index.html"), "web"),
    (os.path.join(WEB, "app.js"), "web"),
    (os.path.join(WEB, "vendor"), os.path.join("web", "vendor")),
]
db_file = os.path.join(BASE, "data", "zdl.sqlite")
if os.path.isfile(db_file):
    datas.append((db_file, "data"))

datas += [
    x for x in collect_data_files("jieba")
    if "lac_small" not in x[0].replace("\\", "/")
    and "/analyse/" not in x[0].replace("\\", "/")
    and "\\analyse\\" not in x[0]
]
datas += collect_data_files("webview")
binaries = collect_dynamic_libs("webview")

a = Analysis(
    [os.path.join(BASE, "src", "server.py")],
    pathex=[os.path.join(BASE, "src")],
    binaries=binaries,
    datas=datas,
    hiddenimports=[
        "win32com.client",
        "pythoncom",
        "pywintypes",
        "docx",
        "pymupdf",
        "fitz",
        "PIL",
        "PIL.Image",
        "catalog",
        "providers",
        "agent",
        "attach",
        "shell_tool",
        "browser_tool",
        "webview",
        "webview.platforms.winforms",
        "webview.platforms.edgechromium",
        "webview.platforms.win32",
        "clr",
        "clr_loader",
        "pythonnet",
        "bottle",
        "proxy_tools",
        "cffi",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        "tkinter", "matplotlib", "scipy", "pandas", "PyQt5", "PySide2",
        "onnxruntime", "cv2", "rapidocr_onnxruntime", "torch", "IPython",
        "pytest", "setuptools", "pymupdf4llm",
        "webview.platforms.android",
        "webview.platforms.qt",
        "webview.platforms.gtk",
        "webview.platforms.cocoa",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="O2",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    icon=ICON if os.path.isfile(ICON) else None,
    version=VER if os.path.isfile(VER) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="O2",
)
