import os

from sqlalchemy import Column, DateTime, Integer, String, func, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./lsf.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Score(Base):
    __tablename__ = "scores"
    id = Column(Integer, primary_key=True, autoincrement=True)
    pseudo = Column(String, nullable=False)
    count = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Submission(Base):
    __tablename__ = "submissions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    word_id = Column(String, nullable=False, index=True)
    pseudo = Column(String, nullable=False)
    video_path = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        result = await conn.execute(text("PRAGMA table_info(submissions)"))
        columns = [row[1] for row in result.fetchall()]
        if "tensor_path" in columns:
            await conn.execute(text("DROP TABLE IF EXISTS submissions_without_tensor"))
            await conn.execute(
                text(
                    """
                    CREATE TABLE submissions_without_tensor (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        word_id VARCHAR NOT NULL,
                        pseudo VARCHAR NOT NULL,
                        video_path VARCHAR NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            await conn.execute(
                text(
                    """
                    INSERT INTO submissions_without_tensor (
                        id,
                        word_id,
                        pseudo,
                        video_path,
                        created_at
                    )
                    SELECT id, word_id, pseudo, video_path, created_at
                    FROM submissions
                    """
                )
            )
            await conn.execute(text("DROP TABLE submissions"))
            await conn.execute(
                text("ALTER TABLE submissions_without_tensor RENAME TO submissions")
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_submissions_word_id "
                    "ON submissions (word_id)"
                )
            )


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
