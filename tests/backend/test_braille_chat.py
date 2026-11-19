"""Exercise the separate FastAPI chat router without a database or model.

Run with that backend's Python environment and --backend-root. --router-path
can select a prepared router before applying it to the backend checkout.
"""
import argparse
from contextlib import ExitStack
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest

parser = argparse.ArgumentParser()
parser.add_argument("--backend-root", type=Path, required=True)
parser.add_argument("--router-path", type=Path)
options, remaining = parser.parse_known_args()
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
sys.dont_write_bytecode = True
sys.path.insert(0, str(options.backend_root.resolve()))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from server.services.chat_service import ChatConnectionManager

router_path = options.router_path or options.backend_root / "server/routers/chat_router.py"
spec = importlib.util.spec_from_file_location("braille_chat_under_test", router_path)
chat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chat)


class BrailleChatTests(unittest.TestCase):
    def setUp(self):
        chat.chat_manager = ChatConnectionManager()
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.validated = []

        def validate(room, participant):
            self.validated.append((room, participant))
            if (room, participant) not in {("QA", 1), ("QA", 2), ("QB", 3)}:
                raise ValueError("Participant not in room")

        chat.validate_chat_participant = validate
        app = FastAPI()
        app.include_router(chat.router)
        self.client = self.stack.enter_context(TestClient(app))

    def connect(self, participant=1, room="QA"):
        socket = self.stack.enter_context(self.client.websocket_connect(f"/ws/rooms/{room}/{participant}"))
        self.assertEqual(socket.receive_json(), {"type": "capabilities", "braille_events": True})
        return socket

    def typing(self, active=True, **overrides):
        return {"type": "typing", "source": "braille", "active": active, **overrides}

    def test_status_is_transient_room_scoped_and_sender_cannot_be_spoofed(self):
        sender, peer, other_room = self.connect(), self.connect(2), self.connect(3, "QB")
        sender.send_json(self.typing(sender_id=999))
        event = {**self.typing(), "sender_id": 1}
        self.assertEqual(sender.receive_json(), event)
        self.assertEqual(peer.receive_json(), event)
        other_room.send_text("다른 방")
        self.assertEqual(other_room.receive_json(), {"type": "message", "sender_id": 3, "content": "다른 방"})
        self.assertIn(("QA", 1), self.validated)

    def test_normal_text_and_literal_json_still_work_without_typing_events(self):
        sender, peer = self.connect(), self.connect(2)
        for text in ["일반 채팅", '{"hello":"world"}']:
            sender.send_text(text)
            expected = {"type": "message", "sender_id": 1, "content": text}
            self.assertEqual(sender.receive_json(), expected)
            self.assertEqual(peer.receive_json(), expected)

    def test_only_braille_send_clears_active_typing(self):
        sender, peer = self.connect(), self.connect(2)
        sender.send_json(self.typing())
        sender.receive_json()
        peer.receive_json()
        sender.send_text("연결을 도와주는 사람의 채팅")
        self.assertEqual(sender.receive_json()["type"], "message")
        self.assertEqual(peer.receive_json()["type"], "message")
        sender.send_json({"type": "message", "source": "braille", "content": "  한글  "})
        for socket in [sender, peer]:
            self.assertEqual(socket.receive_json(), {**self.typing(False), "sender_id": 1})
            self.assertEqual(socket.receive_json(), {"type": "message", "source": "braille", "sender_id": 1, "content": "한글"})

    def test_disconnect_clears_peer_indicator(self):
        peer = self.connect(2)
        with self.client.websocket_connect("/ws/rooms/QA/1") as sender:
            sender.receive_json()
            sender.send_json(self.typing())
            sender.receive_json()
            peer.receive_json()
        self.assertEqual(peer.receive_json(), {**self.typing(False), "sender_id": 1})

    def test_invalid_events_and_message_limits_do_not_enter_chat(self):
        sender = self.connect()
        for event in [self.typing(active="true"), self.typing(source="text")]:
            sender.send_json(event)
            self.assertEqual(sender.receive_json()["code"], "INVALID_TYPING_EVENT")
        for content, code in [(None, "INVALID_MESSAGE"), (" ", "EMPTY_MESSAGE"), ("가" * 1001, "MESSAGE_TOO_LONG")]:
            sender.send_json({"type": "message", "source": "braille", "content": content})
            self.assertEqual(sender.receive_json()["code"], code)
        sender.send_json({"type": "message", "source": "braille", "content": "가" * 1000})
        self.assertEqual(len(sender.receive_json()["content"]), 1000)

    def test_validation_still_precedes_capabilities_and_control_events(self):
        with self.client.websocket_connect("/ws/rooms/QA/3") as socket:
            self.assertEqual(socket.receive_json()["code"], "PARTICIPANT_VALIDATION_FAILED")
            with self.assertRaises(WebSocketDisconnect) as result:
                socket.receive_json()
            self.assertEqual(result.exception.code, 1008)


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0], *remaining])
