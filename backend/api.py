import os
import re
import secrets
import time
import unicodedata
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask
from starlette.middleware.trustedhost import TrustedHostMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import init_db, get_db, Score, Submission
from words import WORDS, WORDS_BY_ID
from profanity import is_vulgar
import drive as drive_service


MAX_VIDEO_BYTES = int(os.getenv("MAX_VIDEO_BYTES", str(25 * 1024 * 1024)))
MAX_REQUEST_BYTES = MAX_VIDEO_BYTES + 1024 * 1024
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "120"))
ADMIN_DOWNLOAD_TOKEN = os.getenv("ADMIN_DOWNLOAD_TOKEN", "")
WEBM_MAGIC = b"\x1a\x45\xdf\xa3"
MP4_FTYP_MARKER = b"ftyp"
ALLOWED_VIDEO_TYPES = {"video/webm", "video/mp4"}
WORD_ID_PATTERN = re.compile(r"^[a-z0-9-]{1,64}$")
PSEUDO_ALLOWED_PUNCTUATION = {" ", ".", "_", "-", "'", "’"}
_rate_limit_buckets: dict[str, deque[float]] = defaultdict(deque)


def _csv_env(name: str, default: str) -> list[str]:
    return [
        value.strip()
        for value in os.getenv(name, default).split(",")
        if value.strip()
    ]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=_csv_env("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver"),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_csv_env(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Admin-Token"],
)


def _security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "microphone=(), geolocation=()"
    return response


@app.middleware("http")
async def basic_security_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                return _security_headers(
                    JSONResponse(
                        {"detail": "Fichier trop volumineux"},
                        status_code=413,
                    )
                )
        except ValueError:
            return _security_headers(
                JSONResponse(
                    {"detail": "Requête invalide"},
                    status_code=400,
                )
            )

    if request.method != "OPTIONS":
        client_host = request.client.host if request.client else "unknown"
        bucket = _rate_limit_buckets[client_host]
        now = time.monotonic()
        while bucket and now - bucket[0] > RATE_LIMIT_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_MAX_REQUESTS:
            return _security_headers(
                JSONResponse(
                    {"detail": "Trop de requêtes. Réessayez dans un instant."},
                    status_code=429,
                )
            )
        bucket.append(now)

    response = await call_next(request)
    return _security_headers(response)


class PseudoCheck(BaseModel):
    pseudo: str


class LeaderboardEntry(BaseModel):
    pseudo: str
    count: int


def validate_pseudo_value(pseudo: str) -> str:
    clean_pseudo = " ".join(unicodedata.normalize("NFKC", pseudo).split())
    if len(clean_pseudo) < 2 or len(clean_pseudo) > 20:
        raise HTTPException(400, "Le pseudo doit faire entre 2 et 20 caractères")
    if not all(
        char.isalnum() or char in PSEUDO_ALLOWED_PUNCTUATION
        for char in clean_pseudo
    ):
        raise HTTPException(
            400,
            "Le pseudo contient uniquement lettres, chiffres, espaces, tirets, points, apostrophes ou underscores",
        )
    if is_vulgar(clean_pseudo):
        raise HTTPException(400, "Ce pseudo n'est pas autorisé")
    return clean_pseudo


def public_pseudo_value(pseudo: str) -> str:
    clean_pseudo = " ".join(unicodedata.normalize("NFKC", pseudo).split())
    safe_pseudo = "".join(
        char
        for char in clean_pseudo
        if char.isalnum() or char in PSEUDO_ALLOWED_PUNCTUATION
    ).strip()
    return safe_pseudo[:20] or "Utilisateur"


def validate_word_id_value(word_id: str) -> str:
    clean_word_id = word_id.strip()
    if not WORD_ID_PATTERN.fullmatch(clean_word_id):
        raise HTTPException(400, "Mot inconnu")
    if clean_word_id not in WORDS_BY_ID:
        raise HTTPException(400, "Mot inconnu")
    return clean_word_id


def validate_video_upload(video: UploadFile, video_bytes: bytes) -> None:
    content_type = (video.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(400, "Format vidéo non autorisé")
    if len(video_bytes) == 0:
        raise HTTPException(400, "Vidéo vide")
    if len(video_bytes) > MAX_VIDEO_BYTES:
        raise HTTPException(413, "Vidéo trop volumineuse")
    if content_type == "video/webm" and not video_bytes.startswith(WEBM_MAGIC):
        raise HTTPException(400, "Fichier vidéo invalide")
    if content_type == "video/mp4" and video_bytes[4:8] != MP4_FTYP_MARKER:
        raise HTTPException(400, "Fichier vidéo invalide")


def require_admin_download_token(request: Request) -> None:
    if not ADMIN_DOWNLOAD_TOKEN:
        raise HTTPException(404, "Téléchargement admin non configuré")

    authorization = request.headers.get("authorization", "")
    supplied_token = ""
    if authorization.lower().startswith("bearer "):
        supplied_token = authorization[7:].strip()
    if not supplied_token:
        supplied_token = request.headers.get("x-admin-token", "").strip()

    if not secrets.compare_digest(supplied_token, ADMIN_DOWNLOAD_TOKEN):
        raise HTTPException(401, "Accès admin refusé")


@app.get("/words")
async def get_words(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Submission.word_id, func.count(Submission.id)).group_by(
            Submission.word_id
        )
    )
    sample_counts = {word_id: count for word_id, count in result.all()}
    words_with_counts = [
        {
            **word,
            "sample_count": sample_counts.get(word["id"], 0),
        }
        for word in WORDS
    ]
    ordered_words = sorted(
        enumerate(words_with_counts),
        key=lambda item: (item[1]["sample_count"], item[0]),
    )
    return [word for _, word in ordered_words]


@app.post("/check-pseudo")
def check_pseudo(body: PseudoCheck):
    validate_pseudo_value(body.pseudo)
    return {"ok": True}


@app.post("/upload")
async def upload_sign(
    word_id: str = Form(...),
    pseudo: str = Form(...),
    video: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    word_id = validate_word_id_value(word_id)
    pseudo = validate_pseudo_value(pseudo)
    video_bytes = await video.read(MAX_VIDEO_BYTES + 1)
    validate_video_upload(video, video_bytes)

    try:
        video_path = drive_service.upload_video(
            video_bytes,
            word_id,
            pseudo,
            video.content_type,
        )
    except Exception:
        raise HTTPException(500, "Erreur d'enregistrement du fichier")

    result = await db.execute(select(Score).where(Score.pseudo == pseudo))
    score = result.scalar_one_or_none()
    if score is None:
        score = Score(pseudo=pseudo, count=1)
        db.add(score)
    else:
        score.count += 1
    db.add(
        Submission(
            word_id=word_id,
            pseudo=pseudo,
            video_path=video_path,
        )
    )
    await db.commit()

    return {"ok": True, "count": score.count}


@app.get("/leaderboard")
async def get_leaderboard(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Score).order_by(Score.count.desc()).limit(20)
    )
    rows = result.scalars().all()
    return [{"pseudo": public_pseudo_value(r.pseudo), "count": r.count} for r in rows]


@app.get("/admin/storage")
def get_storage_status(_: None = Depends(require_admin_download_token)):
    return drive_service.get_video_storage_stats()


@app.get("/admin/videos.zip")
def download_videos_archive(_: None = Depends(require_admin_download_token)):
    archive_path, video_count = drive_service.create_videos_archive()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return FileResponse(
        archive_path,
        media_type="application/zip",
        filename=f"lsf-videos-{timestamp}.zip",
        headers={
            "Cache-Control": "no-store",
            "X-Video-Count": str(video_count),
        },
        background=BackgroundTask(os.unlink, archive_path),
    )
