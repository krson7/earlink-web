"""Run using the FastAPI backend's Python environment; no database is used."""
import importlib.util
from pathlib import Path
import sys
import unittest

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

sys.dont_write_bytecode = True
source = Path(__file__).resolve().parents[2] / "backend/device_presence_router.py"
spec = importlib.util.spec_from_file_location("device_presence", source)
presence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(presence)


class DevicePresenceTests(unittest.TestCase):
    def setUp(self):
        self.now = 100
        presence.presence_store = presence.DevicePresenceStore(clock=lambda: self.now)
        app = FastAPI()
        rooms = APIRouter(prefix="/rooms")
        rooms.include_router(presence.router)
        app.include_router(rooms)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def report(self, owner="relay", connected=True, serial="EL-1"):
        return self.client.put("/rooms/device", json={
            "owner_id": owner, "connected": connected, "serial_number": serial,
        })

    def test_other_clients_see_the_connection_and_responses_are_not_cached(self):
        self.assertEqual(self.client.get("/rooms/device").json(), {"connected": False, "serial_number": None})
        response = self.report()
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")
        response = self.client.get("/rooms/device")
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.json(), {"connected": True, "serial_number": "EL-1"})

    def test_non_owner_disconnect_and_takeover_cannot_replace_live_owner(self):
        self.report()
        self.assertEqual(self.report("peer", connected=False).status_code, 204)
        self.assertEqual(self.report("peer").status_code, 409)
        self.assertTrue(self.client.get("/rooms/device").json()["connected"])
        self.assertEqual(self.report(connected=False).status_code, 204)
        self.assertFalse(self.client.get("/rooms/device").json()["connected"])
        self.assertEqual(self.report("peer").status_code, 204)

    def test_heartbeat_renews_and_abandoned_connection_expires(self):
        self.report(serial=None)
        self.now += 59
        self.assertTrue(self.client.get("/rooms/device").json()["connected"])
        self.report()
        self.now += 59
        self.assertTrue(self.client.get("/rooms/device").json()["connected"])
        self.now += 1
        self.assertEqual(self.client.get("/rooms/device").json(), {"connected": False, "serial_number": None})
        self.assertEqual(self.report("next").status_code, 204)

    def test_missing_or_invalid_owners_are_rejected(self):
        for owner in [None, "", "x" * 129]:
            self.assertEqual(self.report(owner).status_code, 422)
        self.assertEqual(self.client.put("/rooms/device", json={"connected": True}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
