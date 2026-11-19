"""Isolated integration server: real join/validation/chat, disposable SQLite.

The application entrypoint and production database/model are never loaded.
Test-only control endpoints are served exclusively on loopback by this script.
"""
import argparse
import os
from pathlib import Path
import sys
from uuid import uuid4

parser = argparse.ArgumentParser()
parser.add_argument("--backend-root", type=Path, required=True)
parser.add_argument("--port", type=int, default=3180)
options = parser.parse_args()
cache = Path(__file__).resolve().parents[2] / "node_modules/.cache/earlink-live-tests"
cache.mkdir(parents=True, exist_ok=True)
database_path = cache / f"chat-{uuid4().hex}.sqlite3"
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{database_path.as_posix()}"
sys.dont_write_bytecode = True
sys.path.insert(0, str(options.backend_root.resolve()))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import uvicorn
from server.database import Base, engine
from server.entities.room import Room
from server.routers.chat_router import router as chat_router
from server.routers.room_router import router as room_router
from server.services.chat_service import chat_manager
from server.services.room_service import ensure_default_room

Base.metadata.create_all(bind=engine)
with Session(bind=engine) as db:
    ensure_default_room(db)
    db.add(Room(room_code="OTHER", status="OPEN"))
    db.commit()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:3100"], allow_methods=["*"], allow_headers=["*"])
app.include_router(room_router)
app.include_router(chat_router)


@app.get("/__test__/health")
def health():
    return {"isolated_database": True}


@app.post("/__test__/close/{participant_id}")
async def close(participant_id: int):
    socket = chat_manager.active_connections.get("EAR001", {}).get(participant_id)
    if socket:
        await socket.close(code=1012, reason="Integration test reconnect")
    return {"closed": socket is not None}


@app.get("/__test__/connections")
def connections():
    return {room: list(peers) for room, peers in chat_manager.active_connections.items()}


if __name__ == "__main__":
    try:
        uvicorn.run(app, host="127.0.0.1", port=options.port, log_level="warning")
    finally:
        engine.dispose()
        database_path.unlink(missing_ok=True)
