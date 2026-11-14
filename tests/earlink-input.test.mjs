import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { EarLinkInputAssembler, countUnreadCells } from "../src/lib/earlink-protocol.ts";

// Device -> web INPUT framing, written independently from InputSender.h.
function frames(text, id, committed) {
  const bytes = new TextEncoder().encode(text);
  const head = (op, extra) => new Uint8Array([0x45, 0x4c, 1, op, id & 255, id >> 8, ...extra]);
  const packets = [head(1, [bytes.length & 255, bytes.length >> 8, committed ? 1 : 0])];
  for (let at = 0; at < bytes.length; at += 12) {
    packets.push(new Uint8Array([...head(2, [at & 255, at >> 8]), ...bytes.slice(at, at + 12)]));
  }
  packets.push(head(3, []));
  return packets.map((packet) => new DataView(packet.buffer));
}
function feed(assembler, packets) {
  return packets.map((packet) => assembler.push(packet)).filter(Boolean);
}

test("typed text survives 20-byte fragmentation, preview and SEND flags", () => {
  const assembler = new EarLinkInputAssembler();
  const text = "안녕하세요 반갑습니다! ⠈ ".repeat(8);
  const packets = frames(text, 7, false);
  assert.ok(packets.every((packet) => packet.byteLength <= 20));
  assert.deepEqual(feed(assembler, packets), [{ text, committed: false }]);
  assert.deepEqual(feed(assembler, frames("가방", 8, true)), [{ text: "가방", committed: true }]);
  assert.deepEqual(feed(assembler, frames("", 9, false)), [{ text: "", committed: false }]);
});

test("a newer START drops an unfinished preview; stale packets are ignored", () => {
  const assembler = new EarLinkInputAssembler();
  const old = frames("오래된 미리보기 글입니다", 20, false);
  const fresh = frames("새 글", 21, true);
  const result = feed(assembler, [old[0], old[1], fresh[0], old[2], fresh[1], old.at(-1), fresh.at(-1)]);
  assert.deepEqual(result, [{ text: "새 글", committed: true }]);
});

test("malformed, out-of-order, overlong or invalid UTF-8 input yields nothing", () => {
  const assembler = new EarLinkInputAssembler();
  const packets = frames("가나다라마바사아자차카타", 30, true);
  assert.deepEqual(feed(assembler, [packets[0], packets[2], packets[1], packets.at(-1)]), []);
  const zeroId = frames("가", 0, true);
  assert.deepEqual(feed(assembler, zeroId), []);
  const bad = frames("ab", 31, true);
  new Uint8Array(bad[1].buffer)[8] = 0xff;
  assert.deepEqual(feed(assembler, bad), []);
  const short = frames("가나", 32, true);
  new Uint8Array(short[0].buffer)[6] = 3; // declares 3 bytes, sends 6
  assert.deepEqual(feed(assembler, short), []);
  assert.equal(assembler.push(new DataView(new Uint8Array([1, 2, 3]).buffer)), null);
  assert.deepEqual(feed(assembler, frames("다음", 33, false)), [{ text: "다음", committed: false }]);
});

test("unread braille cells are counted", () => {
  assert.equal(countUnreadCells("고마워 친⠈"), 1);
  assert.equal(countUnreadCells("⠴⠁⠸⠌"), 4);
  assert.equal(countUnreadCells("가방"), 0);
});

// Written by firmware/tests/input_test.cpp (python firmware/tests/run_tests.py).
const fixture = new URL("../.firmware-build/input-fixture.bin", import.meta.url);
const expected = new URL("../.firmware-build/input-expected.json", import.meta.url);
test("real firmware InputSender packets reassemble with the web code", {
  skip: !existsSync(fixture) && "run python firmware/tests/run_tests.py first",
}, () => {
  const data = readFileSync(fixture);
  const assembler = new EarLinkInputAssembler();
  const committed = [];
  let draft = null;
  for (let at = 0; at < data.length;) {
    const size = data[at];
    const typed = assembler.push(new DataView(data.buffer, data.byteOffset + at + 1, size));
    at += size + 1;
    if (!typed) continue;
    if (typed.committed) committed.push(typed.text);
    else draft = typed.text;
  }
  const want = JSON.parse(readFileSync(expected, "utf8"));
  assert.deepEqual(committed, want.committed);
  assert.equal(draft, want.draft);
});
