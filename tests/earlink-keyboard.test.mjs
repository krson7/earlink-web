import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { decodeKoreanBraille, dotMask } from "../src/lib/korean-braille-input.ts";
import {
  KeyboardSnapshotReceiver, encodeKeyboardAck, encodeKeyboardReady, encodeKeyboardSync,
} from "../src/lib/earlink-keyboard-protocol.ts";
import { KeyboardSubmissionLedger } from "../src/lib/earlink-keyboard-submission.ts";

const cells = (pattern) => pattern.split(" ").map((dots) => dots === "0" ? 0 : dotMask(dots));
function snapshot(pattern = "245 126 25 4 2346") {
  return { bootId: 0x12345678, revision: 7, requestId: 3, cells: cells(pattern), pending: cells(pattern), feedback: 0 };
}
function packets(state) {
  const begin = new Uint8Array(19), view = new DataView(begin.buffer);
  begin.set([1, 1]); view.setUint32(2, state.bootId, true); view.setUint32(6, state.revision, true);
  view.setUint32(10, state.requestId, true); view.setUint16(14, state.cells.length, true);
  view.setUint16(16, state.pending.length, true); begin[18] = state.feedback;
  const result = [begin], all = [...state.cells, ...state.pending];
  for (let offset = 0; offset < all.length; offset += 12) {
    const data = new Uint8Array(8 + Math.min(12, all.length - offset)), dv = new DataView(data.buffer);
    data.set([1, 2]); dv.setUint32(2, state.revision, true); dv.setUint16(6, offset, true);
    data.set(all.slice(offset, offset + 12), 8); result.push(data);
  }
  const end = new Uint8Array([1, 3, 0, 0, 0, 0]);
  new DataView(end.buffer).setUint32(2, state.revision, true); result.push(end);
  return result;
}
const receive = (receiver, bytes) => receiver.accept(new DataView(bytes.buffer, bytes.byteOffset, bytes.length));

test("Korean input: independent full spelling, contractions and spaces", () => {
  const examples = [
    ["4 126", "가"], ["14 126", "나"], ["24 126", "다"],
    ["245 126 25 4 2346", "한글"],
    ["126 25 14 156 2356", "안녕"],
    ["14 126 0 14 234 0 15 134", "나 너 무"],
    ["1246 14 24", "가나다"], ["15 134 25", "문"],
    ["1246 0 123 0 6 1246 0 6 123", "가 사 까 싸"],
    ["6 4 126 0 6 24 126 0 6 45 126 0 6 6 126 0 6 46 126", "까 따 빠 싸 짜"],
    ["4 126 1 0 4 126 1 3 0 4 126 1 1", "각 갃 갂"],
    ["126 2 4 135", "알기"],
    ["1456 0 23456 0 2345 0 16 0 1256 0 12456", "억 언 얼 연 열 영"],
    ["1346 0 12356 0 123456 0 1245 0 12346 0 1356 0 2346 0 12345", "옥 온 옹 운 울 은 을 인"],
    ["6 12456 0 46 12456 0 56 12456", "성 정 청"],
    ["456 234 0 6 456 234", "것 껏"],
    ["1 234 0 1 14 0 1 25 0 1 26 0 1 1345 0 1 136 0 1 156", "그래서 그러나 그러면 그러므로 그런데 그리고 그리하여"],
    ["126 36 34", "아예"], ["134 36 1235", "우애"],
    ["4 1236 1235 0 4 1234 1235 0 4 134 1235", "괘 궤 귀"],
    ["14 126 126", "나아"], ["145 126 34", "팠"],
  ];
  for (const [pattern, text] of examples) {
    const decoded = decodeKoreanBraille(cells(pattern));
    assert.equal(decoded.text, text, `${pattern}: ${JSON.stringify(decoded)}`);
    assert.equal(decoded.complete, true, pattern);
  }
});

test("all 21 vowels and compound finals", () => {
  const vowels = ["126", "1235", "345", "345 1235", "234", "1345", "156", "34", "136", "1236",
    "1236 1235", "13456", "346", "134", "1234", "1234 1235", "134 1235", "146", "246", "2456", "135"];
  vowels.forEach((pattern, index) => assert.equal(decodeKoreanBraille(cells(pattern)).text, String.fromCharCode(0xc544 + index * 28)));
  const finals = ["", "1", "1 1", "1 3", "25", "25 13", "25 356", "35", "2", "2 1", "2 26",
    "2 12", "2 3", "2 236", "2 256", "2 356", "26", "12", "12 3", "3", "34", "2356", "13", "23", "235", "236", "256", "356"];
  finals.forEach((pattern, index) => assert.equal(decodeKoreanBraille(cells(`4 126${pattern ? ` ${pattern}` : ""}`)).text, String.fromCharCode(0xac00 + index)));
});

test("independent official Korean word examples decode to their source text", () => {
  const corpus = JSON.parse(readFileSync(new URL("../firmware/tests/official_words_2024.json", import.meta.url), "utf8"));
  const words = corpus.words.filter((word) => /^[가-힣 ]+$/u.test(word.text));
  assert.equal(words.length, 229);
  for (const word of words) {
    const decoded = decodeKoreanBraille(word.expected_dots.map((dots) => dots === "0" ? 0 : dotMask(dots)));
    assert.equal(decoded.text, word.text, `official p.${word.printed_page}: ${word.text}`);
    assert.equal(decoded.complete, true, word.text);
  }
});

test("deleting raw cells recomposes vowels and final clusters; unfinished input is visible", () => {
  const raw = cells("4 126 1 3");
  assert.equal(decodeKoreanBraille(raw).text, "갃"); raw.pop();
  assert.equal(decodeKoreanBraille(raw).text, "각"); raw.pop();
  assert.equal(decodeKoreanBraille(raw).text, "가"); raw.pop();
  assert.equal(decodeKoreanBraille(raw).text, "ㄱ");
  assert.equal(decodeKoreanBraille(raw).complete, false);
  assert.equal(decodeKoreanBraille(cells("3456")).complete, false);
  for (const input of [[64], [-1], [1.2], [8, 35, 80]]) assert.throws(() => decodeKoreanBraille(input));
});

test("snapshot framing: max MTU, byte offsets, only publish complete snapshots", () => {
  const state = snapshot(); state.cells = Array.from({ length: 512 }, (_, i) => i % 64);
  const receiver = new KeyboardSnapshotReceiver(), frames = packets(state);
  for (const packet of frames.slice(0, -1)) {
    assert.ok(packet.length <= 20);
    const wrapped = new Uint8Array(packet.length + 8); wrapped.set(packet, 3);
    assert.equal(receive(receiver, wrapped.subarray(3, 3 + packet.length)), null);
  }
  assert.deepEqual(receive(receiver, frames.at(-1)), state);
  const empty = { ...state, requestId: 0, cells: [], pending: [] };
  let result;
  for (const frame of packets(empty)) result = receive(receiver, frame);
  assert.deepEqual(result, empty);
});

test("missing/duplicate/out-of-order/corrupted frames cannot emit partial text; resync recovers", () => {
  const state = snapshot(), frames = packets(state);
  for (const mode of ["missing", "duplicate", "revision", "bad-cell", "bad-count", "truncated"]) {
    const receiver = new KeyboardSnapshotReceiver();
    const bad = frames.map((frame) => frame.slice());
    if (mode === "missing") bad.splice(1, 1);
    if (mode === "duplicate") bad.splice(2, 0, bad[1]);
    if (mode === "revision") bad[1][2] ^= 1;
    if (mode === "bad-cell") bad[1][8] = 64;
    if (mode === "bad-count") { bad[0][14] = 255; bad[0][15] = 255; }
    if (mode === "truncated") bad[1] = bad[1].slice(0, 7);
    assert.throws(() => { for (const frame of bad) receive(receiver, frame); }, mode);
    let result;
    for (const frame of frames) result = receive(receiver, frame);
    assert.deepEqual(result, state, mode);
  }
});

test("control encoding uses exact request IDs and readiness", () => {
  assert.deepEqual([...encodeKeyboardSync()], [1, 1]);
  assert.deepEqual([...encodeKeyboardReady(false)], [1, 3, 0]);
  assert.deepEqual([...encodeKeyboardAck(0x12345678, true)], [1, 2, 0x78, 0x56, 0x34, 0x12, 1]);
  for (const id of [0, -1, 1.5, 0x100000000]) assert.throws(() => encodeKeyboardAck(id, true));
});

test("one physical send -> one chat send, even after duplicate notifications, disconnect and reload", () => {
  const data = new Map(), storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  let calls = 0;
  const send = (text) => { assert.equal(text, "한글"); calls++; return true; };
  const state = snapshot(), ledger = new KeyboardSubmissionLedger();
  assert.equal(ledger.handle(state, "device", true, send, storage).accepted, true);
  assert.equal(ledger.handle(state, "device", true, send, storage).accepted, true);
  assert.equal(new KeyboardSubmissionLedger().handle(state, "device", false, send, storage).accepted, true);
  assert.equal(calls, 1);
  assert.equal(ledger.handle({ ...state, bootId: state.bootId + 1 }, "device", true, send, storage).accepted, true);
  assert.equal(calls, 2);
});

test("offline, incomplete input and chat failure keep drafts and never retry automatically", () => {
  let calls = 0;
  const send = () => { calls++; return false; };
  const ledger = new KeyboardSubmissionLedger(), state = snapshot();
  assert.equal(ledger.handle(state, "device", false, send).accepted, false);
  assert.equal(ledger.handle(state, "device", true, send).accepted, false);
  assert.equal(calls, 0);
  assert.equal(ledger.handle({ ...state, requestId: 4, pending: cells("4") }, "device", true, send).accepted, false);
  assert.equal(calls, 0);
  assert.equal(ledger.handle({ ...state, requestId: 5 }, "device", true, send).accepted, false);
  assert.equal(calls, 1);
  const brokenStorage = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  const goodLedger = new KeyboardSubmissionLedger();
  assert.equal(goodLedger.handle(state, "device", true, () => true, brokenStorage).accepted, true);
  assert.equal(goodLedger.handle(state, "device", true, send, brokenStorage).accepted, true);
  assert.equal(calls, 1);
});

const fixture = new URL("../.firmware-build/keyboard-fixture.bin", import.meta.url);
test("real native firmware snapshot -> browser decoder -> chat submission", { skip: !existsSync(fixture) }, () => {
  const bytes = readFileSync(fixture), receiver = new KeyboardSnapshotReceiver();
  let result = null;
  for (let offset = 0; offset < bytes.length;) {
    const length = bytes[offset++];
    const next = receive(receiver, bytes.subarray(offset, offset + length)); offset += length;
    if (next) result = next;
  }
  assert.ok(result); assert.equal(decodeKoreanBraille(result.pending).text, "한글");
  let sent;
  const outcome = new KeyboardSubmissionLedger().handle(result, "firmware-fixture", true, (text) => { sent = text; return true; });
  assert.equal(outcome.accepted, true); assert.equal(sent, "한글");
});
