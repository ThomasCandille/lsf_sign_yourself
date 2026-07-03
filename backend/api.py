import io
import numpy as np
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from dotenv import load_dotenv

load_dotenv()

from database import init_db, get_db, Score
from words import WORDS
from profanity import is_vulgar
import pose as pose_service
import drive as drive_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PseudoCheck(BaseModel):
    pseudo: str


class LeaderboardEntry(BaseModel):
    pseudo: str
    count: int


@app.get("/words")
def get_words():
    return WORDS


@app.post("/check-pseudo")
def check_pseudo(body: PseudoCheck):
    pseudo = body.pseudo.strip()
    if len(pseudo) < 2 or len(pseudo) > 20:
        raise HTTPException(400, "Le pseudo doit faire entre 2 et 20 caractères")
    if is_vulgar(pseudo):
        raise HTTPException(400, "Ce pseudo n'est pas autorisé")
    return {"ok": True}


@app.post("/upload")
async def upload_sign(
    word_id: str = Form(...),
    pseudo: str = Form(...),
    video: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    video_bytes = await video.read()
    if len(video_bytes) == 0:
        raise HTTPException(400, "Vidéo vide")

    try:
        tensor = pose_service.extract_pose_tensor(video_bytes)
    except Exception as e:
        raise HTTPException(422, f"Erreur d'extraction de pose: {e}")

    npy_buffer = io.BytesIO()
    np.save(npy_buffer, tensor)
    npy_bytes = npy_buffer.getvalue()

    try:
        drive_service.upload_tensor(npy_bytes, word_id, pseudo)
    except Exception as e:
        raise HTTPException(500, f"Erreur d'upload Drive: {e}")

    result = await db.execute(select(Score).where(Score.pseudo == pseudo))
    score = result.scalar_one_or_none()
    if score is None:
        score = Score(pseudo=pseudo, count=1)
        db.add(score)
    else:
        score.count += 1
    await db.commit()

    return {"ok": True, "count": score.count}


@app.get("/leaderboard")
async def get_leaderboard(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Score).order_by(Score.count.desc()).limit(20)
    )
    rows = result.scalars().all()
    return [{"pseudo": r.pseudo, "count": r.count} for r in rows]
