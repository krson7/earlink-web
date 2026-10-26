import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  encodeTextPackets, decodeStatus, encodeCommand, encodeInterval,
} from "../src/lib/earlink-protocol.ts";

test("long Korean text survives 20-byte fragmentation and NFC normalization", () => {
  const text = "한글과 숫자 123 😀 ".repeat(50);
  const packets = encodeTextPackets(text, 65535);
  assert.ok(packets.every((packet) => packet.length <= 20));
  const encoded = new TextEncoder().encode(text.normalize("NFC"));
  assert.equal(new DataView(packets[0].buffer).getUint16(6, true), encoded.length);
  const restored = [];
  for (const packet of packets.slice(1, -1)) {
    assert.equal(new DataView(packet.buffer).getUint16(6, true), restored.length);
    restored.push(...packet.slice(8));
  }
  assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(restored)), text.normalize("NFC"));
  assert.deepEqual([...packets.at(-1)], [0x45, 0x4c, 1, 3, 255, 255]);
});

test("invalid IDs, blank content and byte overflow are rejected", () => {
  for (const id of [0, -1, 65536, 1.5]) assert.throws(() => encodeTextPackets("한", id));
  assert.throws(() => encodeTextPackets(" \n", 1));
  assert.throws(() => encodeTextPackets("가".repeat(1366), 1));
  assert.doesNotThrow(() => encodeTextPackets("a".repeat(4096), 1));
});

test("status respects DataView offset and includes actual device page/ACK", () => {
  const buffer = new ArrayBuffer(24);
  const view = new DataView(buffer, 4, 16);
  view.setUint8(0, 1); view.setUint8(1, 15);
  view.setUint16(2, 513, true); view.setUint8(4, 1); view.setUint8(5, 2);
  view.setUint16(6, 512, true); view.setUint16(8, 3, true); view.setUint16(10, 99, true);
  view.setUint16(12, 2, true); view.setUint16(14, 3000, true);
  assert.deepEqual(decodeStatus(view), {
    active: true, automatic: true, outputEnabled: true, visible: true,
    acknowledgedId: 513, result: 1, queued: 2, messageId: 512,
    page: 3, pages: 99, unsupported: 2, intervalMs: 3000,
  });
  assert.throws(() => decodeStatus(new DataView(new ArrayBuffer(15))));
  view.setUint8(0, 2); assert.throws(() => decodeStatus(view));
});

test("controls encode stable wire values and constrain dwell time", () => {
  assert.deepEqual([...encodeCommand("clear")], [1, 3]);
  assert.deepEqual([...encodeInterval(3000)], [1, 6, 184, 11]);
  for (const value of [0, 999, 10001, NaN, 3000.1]) assert.throws(() => encodeInterval(value));
});

test("write a browser-generated fixture for the native firmware receiver test", () => {
  const text = "한글 ABC 123 아예 우애 😀 ".repeat(20);
  const packets = encodeTextPackets(text, 513);
  mkdirSync(new URL("../.firmware-build/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../.firmware-build/protocol-fixture.bin", import.meta.url),
    Buffer.concat(packets.map((packet) => Buffer.concat([Buffer.from([packet.length]), packet]))));
  writeFileSync(new URL("../.firmware-build/protocol-text.txt", import.meta.url), text);
});
