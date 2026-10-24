
import ast
import hashlib
from pathlib import PurePosixPath

IGNORED_DIRS = {
    ".git", ".venv", "venv", "__pycache__",
    "node_modules", "dist", "build", ".idea",
}

IGNORED_FILES = {
    ".env", ".env.local", ".env.production",
}

MAX_FILES = 500
MAX_FILE_BYTES = 1_000_000


def scan_project_files(files: list[dict]) -> dict:
    """Analyze uploaded text files without executing them."""

    if len(files) > MAX_FILES:
        raise ValueError(f"Project exceeds the {MAX_FILES}-file limit.")

    manifest = []
    python_files = []
    total_bytes = 0

    for item in files:
        raw_path = str(item.get("path", "")).replace("\\", "/")
        relative = PurePosixPath(raw_path)

        # Reject paths that could escape the project directory.
        if (
            not raw_path
            or relative.is_absolute()
            or ".." in relative.parts
            or ":" in raw_path
        ):
            continue

        if any(part in IGNORED_DIRS for part in relative.parts):
            continue

        if relative.name in IGNORED_FILES:
            continue

        content = item.get("content")
        if not isinstance(content, str):
            continue

        encoded = content.encode("utf-8")
        if len(encoded) > MAX_FILE_BYTES:
            continue

        total_bytes += len(encoded)
        if total_bytes > 20_000_000:
            raise ValueError("Project exceeds the 20 MB text limit.")

        file_hash = hashlib.sha256(encoded).hexdigest()

        record = {
            "path": relative.as_posix(),
            "size_bytes": len(encoded),
            "sha256": file_hash,
            "language": "python" if relative.suffix == ".py" else "text",
            "imports": [],
            "syntax_error": None,
        }

        if relative.suffix == ".py":
            try:
                tree = ast.parse(content, filename=relative.as_posix())

                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        record["imports"].extend(
                            alias.name for alias in node.names
                        )
                    elif isinstance(node, ast.ImportFrom) and node.module:
                        record["imports"].append(node.module)

                python_files.append(relative.as_posix())

            except SyntaxError as exc:
                record["syntax_error"] = {
                    "message": exc.msg,
                    "line": exc.lineno,
                    "column": exc.offset,
                }
                python_files.append(relative.as_posix())

        manifest.append(record)

    # These are candidates, not guaranteed executable entry points.
    entry_points = [
        path for path in python_files
        if PurePosixPath(path).name in {
            "main.py", "app.py", "run.py", "__main__.py"
        }
    ]

    return {
        "file_count": len(manifest),
        "python_file_count": len(python_files),
        "entry_point_candidates": entry_points,
        "files": manifest,
    }
