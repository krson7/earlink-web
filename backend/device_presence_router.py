"""Install as server/routers/device_presence_router.py and include in room_router.

Like the existing chat connection manager, this store is for one FastAPI worker.
Multi-worker deployments must put both chat and device presence in shared storage.
"""
from threading import Lock
from time import monotonic
from typing import Callable

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field


class DevicePresenceReport(BaseModel):
    connected: bool
    owner_id: str = Field(min_length=1, max_length=128)
    serial_number: str | None = Field(default=None, max_length=128)


class DevicePresenceStore:
    def __init__(self, clock: Callable[[], float] = monotonic, ttl: float = 60):
        self._clock = clock
        self._ttl = ttl
        self._lock = Lock()
        self._owner: str | None = None
        self._serial: str | None = None
        self._expires_at = 0.0

    def _expire(self):
        if self._clock() >= self._expires_at:
            self._owner = None
            self._serial = None

    def read(self):
        with self._lock:
            self._expire()
            return {"connected": self._owner is not None, "serial_number": self._serial}

    def report(self, body: DevicePresenceReport):
        with self._lock:
            self._expire()
            if body.connected:
                if self._owner is not None and self._owner != body.owner_id:
                    raise HTTPException(409, "다른 휴대폰이 이미 기기에 연결되어 있습니다.")
                self._owner = body.owner_id
                self._serial = body.serial_number
                self._expires_at = self._clock() + self._ttl
            elif self._owner == body.owner_id:
                self._owner = None
                self._serial = None


presence_store = DevicePresenceStore()
router = APIRouter()


@router.get("/device")
def get_device_presence(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return presence_store.read()


@router.put("/device", status_code=204)
def put_device_presence(body: DevicePresenceReport):
    presence_store.report(body)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
