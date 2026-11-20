from __future__ import annotations

import os
import subprocess
import tempfile

DEFAULT_TIMEOUT_MS = 120_000
MAX_TIMEOUT_MS = 600_000
MAX_OUTPUT_CHARS = 64_000

ENCODING_PREAMBLE = (
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); "
    "$OutputEncoding = [System.Text.UTF8Encoding]::new($false); "
)

PROMPT = """
8. 需要查看本机文件、目录、环境或运行命令时，调用 pwsh。每次调用都是独立的 PowerShell 进程，不保留上下文；切换目录请传 workdir，不要依赖 cd。路径使用 Windows 格式，环境变量使用 $env:NAME。
9. 非零退出码会标为 [exit code: N]，先排查原因再继续；超时会终止进程并标 [timed out after Nms]；超长输出只保留尾部，完整内容见返回提示中的日志路径。
10. 删除、覆盖或移动文件前先确认解析后的绝对路径；不要给 $HOME 赋值。"""

TOOL = {
    "type": "function",
    "function": {
        "name": "pwsh",
        "description": (
            "在本机执行一条 PowerShell 命令（pwsh -Command）并返回 stdout/stderr。"
            "每次调用都是新进程，状态不保留；切换目录请传 workdir。"
            "路径用 Windows 格式（C:\\...），环境变量用 $env:NAME。"
            "超长输出只保留尾部，完整内容会写入临时文件并返回路径。"
            "删除或移动前先确认解析后的绝对路径；不要给 $HOME 赋值。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "简短说明这条命令的目的",
                },
                "command": {
                    "type": "string",
                    "description": "要执行的 PowerShell 命令",
                },
                "timeoutMs": {
                    "type": "number",
                    "description": "超时毫秒数，默认 120000，最大 600000",
                },
                "workdir": {
                    "type": "string",
                    "description": "工作目录，相对路径基于会话目录解析",
                },
            },
            "required": ["description", "command"],
        },
    },
}


class ShellError(RuntimeError):
    pass


def enabled(cfg) -> bool:
    data = getattr(cfg, "data", None) or {}
    return bool(data.get("shell", True))


def session_cwd(cfg) -> str:
    data = getattr(cfg, "data", None) or {}
    raw = str(data.get("shell_cwd") or "").strip()
    if raw and os.path.isdir(raw):
        return os.path.abspath(raw)
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(here)


def _candidates() -> list[str]:
    program_files = os.environ.get("ProgramFiles") or r"C:\Program Files"
    system_root = os.environ.get("SystemRoot") or r"C:\Windows"
    found = [os.path.join(program_files, "PowerShell", "7", "pwsh.exe")]
    for entry in (os.environ.get("PATH") or "").split(";"):
        trimmed = entry.strip().strip('"')
        if trimmed:
            found.append(os.path.join(trimmed, "pwsh.exe"))
    found.append(os.path.join(
        system_root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe",
    ))
    return found


def resolve_pwsh(configured: str = "") -> str:
    explicit = (configured or "").strip()
    if explicit:
        return explicit
    if os.name == "nt":
        for path in _candidates():
            if os.path.isfile(path):
                return path
    return "pwsh"


def _clamp_timeout(raw) -> int:
    if raw is None or raw == "":
        return DEFAULT_TIMEOUT_MS
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ShellError(f"invalid timeoutMs: expected a positive number, got {raw!r}")
    if value != value or value <= 0:
        raise ShellError(f"invalid timeoutMs: expected a positive number, got {raw!r}")
    return int(min(value, MAX_TIMEOUT_MS))


def _resolve_workdir(raw: str, cwd: str) -> str:
    text = (raw or "").strip()
    if not text:
        return cwd
    path = text if os.path.isabs(text) else os.path.abspath(os.path.join(cwd, text))
    if not os.path.isdir(path):
        raise ShellError(f"workdir does not exist: {path}")
    return path


def _tail(text: str) -> tuple[str, bool]:
    if len(text) <= MAX_OUTPUT_CHARS:
        return text, False
    return text[-MAX_OUTPUT_CHARS:], True


def _spill(text: str) -> str:
    folder = os.path.join(tempfile.gettempdir(), "o2-shell")
    os.makedirs(folder, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix="pwsh-", suffix=".log", dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
    except Exception:
        return ""
    return path


def render_result(stdout: str, stderr: str, exit_code: int | None,
                  timed_out: bool, timeout_ms: int) -> str:
    out, out_cut = _tail(stdout or "")
    err, err_cut = _tail(stderr or "")
    if out_cut:
        spill = _spill(stdout)
        out += f"\n[output truncated; full output: {spill or '(unavailable)'}]"
    if err_cut:
        spill = _spill(stderr)
        err += f"\n[output truncated; full output: {spill or '(unavailable)'}]"

    body = out
    if err:
        if body and not body.endswith("\n"):
            body += "\n"
        body += f"[stderr]\n{err}"
    if not body:
        body = "(no output)"

    markers: list[str] = []
    if timed_out:
        markers.append(f"[timed out after {timeout_ms}ms]")
    if exit_code not in (0, None):
        markers.append(f"[exit code: {exit_code}]")
    if not markers:
        return body
    if not body.endswith("\n"):
        body += "\n"
    return body + "\n".join(markers)


def _kill(proc: subprocess.Popen) -> None:
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return
    proc.kill()


def run_pwsh(args: dict, cwd: str, pwsh_path: str = "") -> tuple[str, int | None]:
    command = str((args or {}).get("command") or "")
    description = str((args or {}).get("description") or "")
    if not command.strip():
        raise ShellError("invalid command: expected a non-empty string")
    if not description.strip():
        raise ShellError("invalid description: expected a non-empty string")
    timeout_ms = _clamp_timeout((args or {}).get("timeoutMs"))
    workdir = _resolve_workdir(str((args or {}).get("workdir") or ""), cwd)
    exe = resolve_pwsh(pwsh_path)

    env = os.environ.copy()
    env["NO_COLOR"] = "1"
    env["PAGER"] = "cat"
    env["GIT_PAGER"] = "cat"

    creationflags = 0
    startupinfo = None
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0

    try:
        proc = subprocess.Popen(
            [exe, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
             ENCODING_PREAMBLE + command],
            cwd=workdir,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
    except OSError as e:
        raise ShellError(f"failed to start pwsh: {e}") from e

    timed_out = False
    try:
        out_b, err_b = proc.communicate(timeout=timeout_ms / 1000)
    except subprocess.TimeoutExpired:
        timed_out = True
        _kill(proc)
        out_b, err_b = proc.communicate()

    stdout = (out_b or b"").decode("utf-8", "replace")
    stderr = (err_b or b"").decode("utf-8", "replace")
    code = proc.returncode
    text = render_result(stdout, stderr, code, timed_out, timeout_ms)
    if workdir:
        text = f"[cwd: {workdir}]\n{text}"
    return text, code
