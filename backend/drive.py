import os
import tempfile
import re
import subprocess
import uuid
import zipfile
from pathlib import Path


DEFAULT_CONVERSION_TIMEOUT_SECONDS = 120
STANDARD_VIDEO_WIDTH = 640
STANDARD_VIDEO_HEIGHT = 480
STANDARD_VIDEO_FRAME_RATE = 30
VIDEO_INPUT_SUFFIXES = {
    "video/webm": ".webm",
    "video/mp4": ".mp4",
}


class VideoConversionError(RuntimeError):
    pass


def _safe_part(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-")
    return safe[:80] or "unknown"


def _ensure_storage_dir(env_name: str, default: str) -> str:
    storage_path = os.getenv(env_name, default)
    os.makedirs(storage_path, exist_ok=True)
    return storage_path


def get_video_storage_path() -> str:
    return _ensure_storage_dir("VIDEO_STORAGE_PATH", "./videos")


def _get_ffmpeg_executable() -> str:
    override = os.getenv("FFMPEG_BINARY")
    if override:
        return override

    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


def _conversion_timeout_seconds() -> int:
    raw_timeout = os.getenv(
        "VIDEO_CONVERSION_TIMEOUT_SECONDS",
        str(DEFAULT_CONVERSION_TIMEOUT_SECONDS),
    )
    try:
        return max(1, int(raw_timeout))
    except ValueError:
        return DEFAULT_CONVERSION_TIMEOUT_SECONDS


def _convert_to_standard_mp4(video_bytes: bytes, input_suffix: str) -> bytes:
    with tempfile.TemporaryDirectory(prefix="lsf-video-convert-") as temp_dir:
        input_path = Path(temp_dir) / f"input{input_suffix}"
        output_path = Path(temp_dir) / "output.mp4"
        input_path.write_bytes(video_bytes)

        video_filter = (
            f"scale={STANDARD_VIDEO_WIDTH}:{STANDARD_VIDEO_HEIGHT}:"
            "force_original_aspect_ratio=decrease,"
            f"pad={STANDARD_VIDEO_WIDTH}:{STANDARD_VIDEO_HEIGHT}:"
            "(ow-iw)/2:(oh-ih)/2:black,"
            "setsar=1"
        )
        command = [
            _get_ffmpeg_executable(),
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(input_path),
            "-an",
            "-vf",
            video_filter,
            "-r",
            str(STANDARD_VIDEO_FRAME_RATE),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        try:
            result = subprocess.run(
                command,
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=_conversion_timeout_seconds(),
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise VideoConversionError("Impossible de convertir la vidéo en MP4") from exc

        if result.returncode != 0 or not output_path.exists():
            raise VideoConversionError("Impossible de convertir la vidéo en MP4")

        return output_path.read_bytes()


def _webm_to_mp4(video_bytes: bytes) -> bytes:
    return _convert_to_standard_mp4(video_bytes, ".webm")


def _video_bytes_as_mp4(video_bytes: bytes, content_type: str | None) -> bytes:
    media_type = (content_type or "").split(";")[0].strip().lower()
    input_suffix = VIDEO_INPUT_SUFFIXES.get(media_type)
    if input_suffix:
        return _convert_to_standard_mp4(video_bytes, input_suffix)
    raise VideoConversionError("Format vidéo non convertible")


def _archive_name_for_mp4(relative_path: Path) -> str:
    return str(relative_path.with_suffix(".mp4"))


def _unique_archive_name(archive_name: str, used_names: set[str]) -> str:
    if archive_name not in used_names:
        used_names.add(archive_name)
        return archive_name

    path = Path(archive_name)
    for index in range(2, 10000):
        candidate = str(path.with_name(f"{path.stem}-{index}{path.suffix}"))
        if candidate not in used_names:
            used_names.add(candidate)
            return candidate

    raise RuntimeError("Impossible de créer un nom de fichier unique")


def upload_video(
    video_bytes: bytes,
    word_id: str,
    pseudo: str,
    content_type: str | None,
) -> str:
    """Save the submitted video as MP4 for human validation. Returns the file path."""
    storage_path = get_video_storage_path()
    mp4_bytes = _video_bytes_as_mp4(video_bytes, content_type)

    filename = (
        f"{_safe_part(word_id)}__{_safe_part(pseudo)}__"
        f"{uuid.uuid4().hex}.mp4"
    )
    filepath = os.path.join(storage_path, filename)
    with open(filepath, "wb") as f:
        f.write(mp4_bytes)
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
    used_names: set[str] = set()
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
            relative_path = video_path.resolve().relative_to(storage_root)
            if video_path.suffix.lower() == ".webm":
                archive_file.writestr(
                    _unique_archive_name(
                        _archive_name_for_mp4(relative_path),
                        used_names,
                    ),
                    _webm_to_mp4(video_path.read_bytes()),
                )
            else:
                archive_file.write(
                    video_path,
                    arcname=_unique_archive_name(str(relative_path), used_names),
                )

    return archive_path, len(video_files)
