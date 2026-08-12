import os
import tempfile
import re
import uuid
import zipfile
from pathlib import Path


def _safe_part(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-")
    return safe[:80] or "unknown"


def _ensure_storage_dir(env_name: str, default: str) -> str:
    storage_path = os.getenv(env_name, default)
    os.makedirs(storage_path, exist_ok=True)
    return storage_path


def get_video_storage_path() -> str:
    return _ensure_storage_dir("VIDEO_STORAGE_PATH", "./videos")


def upload_video(
    video_bytes: bytes,
    word_id: str,
    pseudo: str,
    content_type: str | None,
) -> str:
    """Save the raw submitted video for human validation. Returns the file path."""
    storage_path = get_video_storage_path()
    media_type = (content_type or "").split(";")[0].strip().lower()
    extension = ".webm" if media_type == "video/webm" else ".bin"

    filename = (
        f"{_safe_part(word_id)}__{_safe_part(pseudo)}__"
        f"{uuid.uuid4().hex}{extension}"
    )
    filepath = os.path.join(storage_path, filename)
    with open(filepath, "wb") as f:
        f.write(video_bytes)
    return filepath


def list_video_files() -> list[Path]:
    storage_root = Path(get_video_storage_path()).resolve()
    video_files: list[Path] = []

    for path in storage_root.rglob("*"):
        if path.is_symlink() or not path.is_file():
            continue
        resolved_path = path.resolve()
        if storage_root not in resolved_path.parents:
            continue
        video_files.append(path)

    return sorted(video_files)


def get_video_storage_stats() -> dict[str, int | str]:
    video_files = list_video_files()
    return {
        "storage_path": str(Path(get_video_storage_path()).resolve()),
        "video_count": len(video_files),
        "total_bytes": sum(path.stat().st_size for path in video_files),
    }


def create_videos_archive() -> tuple[str, int]:
    storage_root = Path(get_video_storage_path()).resolve()
    video_files = list_video_files()
    archive = tempfile.NamedTemporaryFile(
        prefix="lsf-videos-",
        suffix=".zip",
        delete=False,
    )
    archive_path = archive.name
    archive.close()

    with zipfile.ZipFile(
        archive_path,
        "w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive_file:
        for video_path in video_files:
            archive_file.write(
                video_path,
                arcname=video_path.resolve().relative_to(storage_root),
            )

    return archive_path, len(video_files)
