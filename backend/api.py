import asyncio
import hashlib
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
from pathlib import Path
from typing import Literal
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask
from starlette.middleware.trustedhost import TrustedHostMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import init_db, get_db, AsyncSessionLocal, AdminSession, Score, Submission
from words import WORDS, WORDS_BY_ID
from profanity import is_vulgar
import drive as drive_service


MAX_VIDEO_BYTES = int(os.getenv("MAX_VIDEO_BYTES", str(25 * 1024 * 1024)))
MAX_REQUEST_BYTES = MAX_VIDEO_BYTES + 1024 * 1024
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "120"))
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
ADMIN_SESSION_SECONDS = 8 * 60 * 60
_admin_login_attempts: dict[str, deque[float]] = defaultdict(deque)
_moderation_lock = asyncio.Lock()
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
    drive_service.prepare_video_storage()
    # Also repair paths after a restart between a file move and the DB commit.
    root = Path(drive_service.get_video_storage_path()).resolve()
    async with AsyncSessionLocal() as db:
        for submission in (await db.execute(select(Submission))).scalars():
            old = Path(submission.video_path).resolve()
            if old.is_relative_to(root):
                relative = old.relative_to(root)
                remainder = Path(*relative.parts[1:]) if relative.parts[0] in drive_service.VIDEO_STATUSES else relative
                candidates = [root / status / remainder for status in drive_service.VIDEO_STATUSES]
                matches = [path for path in candidates if path.is_file()]
                if len(matches) == 1:
                    submission.video_path = str(matches[0])
        await db.commit()
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
    allow_headers=["Authorization", "Content-Type"],
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


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def require_admin(request: Request, db: AsyncSession = Depends(get_db)) -> AdminSession:
    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Connexion administrateur requise")
    session = await db.get(AdminSession, token_hash(authorization[7:].strip()))
    if session is None or session.expires_at <= int(time.time()):
        raise HTTPException(401, "Session expirée. Reconnectez-vous.")
    return session


class AdminLogin(BaseModel):
    username: str = Field(max_length=256)
    password: str = Field(max_length=1024)


class VideoClassification(BaseModel):
    path: str = Field(max_length=1024)
    status: Literal["en_attente", "bon", "pas_bon"]


@app.post("/admin/login")
async def admin_login(body: AdminLogin, request: Request, db: AsyncSession = Depends(get_db)):
    if not ADMIN_USERNAME or not ADMIN_PASSWORD:
        raise HTTPException(503, "Configurez ADMIN_USERNAME et ADMIN_PASSWORD côté backend")
    host = request.client.host if request.client else "unknown"
    attempts = _admin_login_attempts[host]
    now = time.monotonic()
    while attempts and now - attempts[0] >= 300:
        attempts.popleft()
    if len(attempts) >= 5:
        raise HTTPException(429, "Trop de tentatives. Réessayez dans 5 minutes.")
    attempts.append(now)
    username_ok = secrets.compare_digest(token_hash(body.username), token_hash(ADMIN_USERNAME))
    password_ok = secrets.compare_digest(token_hash(body.password), token_hash(ADMIN_PASSWORD))
    if not (username_ok and password_ok):
        raise HTTPException(401, "Identifiant ou mot de passe incorrect")
    attempts.clear()
    token = secrets.token_urlsafe(32)
    await db.execute(delete(AdminSession).where(AdminSession.expires_at <= int(time.time())))
    db.add(AdminSession(token_hash=token_hash(token), expires_at=int(time.time()) + ADMIN_SESSION_SECONDS))
    await db.commit()
    return JSONResponse({"token": token}, headers={"Cache-Control": "no-store"})


@app.post("/admin/logout")
async def admin_logout(session: AdminSession = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await db.delete(session)
    await db.commit()
    return {"ok": True}


@app.get("/admin/videos")
def admin_videos(_: AdminSession = Depends(require_admin)):
    return JSONResponse(drive_service.list_admin_videos(), headers={"Cache-Control": "no-store"})


def admin_video_path(path: str) -> Path:
    try:
        return drive_service.get_admin_video(path)
    except ValueError:
        raise HTTPException(400, "Chemin vidéo invalide")
    except FileNotFoundError:
        raise HTTPException(404, "Vidéo introuvable")


@app.get("/admin/video")
def admin_video(path: str, _: AdminSession = Depends(require_admin)):
    return FileResponse(admin_video_path(path), headers={"Cache-Control": "no-store"})


def move_video_file(source: Path, target: Path) -> None:
    with drive_service.storage_lock:
        source.rename(target)


@app.post("/admin/classify")
async def classify_video(body: VideoClassification, _: AdminSession = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    async with _moderation_lock:
        source = admin_video_path(body.path)
        root = Path(drive_service.get_video_storage_path()).resolve()
        relative = source.relative_to(root)
        target = root / body.status / Path(*relative.parts[1:])
        if source != target:
            if target.exists():
                raise HTTPException(409, "Une vidéo porte déjà ce nom dans ce dossier")
            # Validate the destination too, including any parent symlinks.
            if not target.resolve().is_relative_to(root / body.status):
                raise HTTPException(400, "Dossier de destination invalide")
            target.parent.mkdir(parents=True, exist_ok=True)
            rows = (await db.execute(select(Submission))).scalars()
            for row in rows:
                if Path(row.video_path).resolve() == source:
                    row.video_path = str(target)
            await asyncio.to_thread(move_video_file, source, target)
            try:
                await db.commit()
            except Exception:
                await asyncio.to_thread(move_video_file, target, source)
                await db.rollback()
                raise
        return {"ok": True, "path": str(target.relative_to(root))}


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
def get_storage_status(_: AdminSession = Depends(require_admin)):
    return drive_service.get_video_storage_stats()


@app.get("/admin/videos.zip")
def download_videos_archive(_: AdminSession = Depends(require_admin)):
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
