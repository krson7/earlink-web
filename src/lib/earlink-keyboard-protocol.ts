/** Additive keyboard protocol; firmware/earlink/KeyboardProtocol.h. */
export const EARLINK_KEYBOARD_UUID = "8f3a0004-7c3b-4b8a-9f52-123456789abc";
export const MAX_KEYBOARD_CELLS = 512;
export type KeyboardSnapshot = {
  bootId: number;
  revision: number;
  requestId: number;
  cells: number[];
  pending: number[];
  feedback: number;
};

export class KeyboardSnapshotReceiver {
  private incoming: { header: Omit<KeyboardSnapshot, "cells" | "pending">; count: number; pendingCount: number; data: number[] } | null = null;
  reset(): void { this.incoming = null; }
  accept(value: DataView): KeyboardSnapshot | null {
    const bad = () => { this.reset(); throw new Error("키보드 입력을 다시 동기화하고 있습니다."); };
    if (value.byteLength < 2 || value.byteLength > 20 || value.getUint8(0) !== 1) return bad();
    const op = value.getUint8(1);
    if (op === 1) {
      if (value.byteLength !== 19) return bad();
      const count = value.getUint16(14, true), pendingCount = value.getUint16(16, true);
      const requestId = value.getUint32(10, true), feedback = value.getUint8(18);
      if (count > MAX_KEYBOARD_CELLS || pendingCount > MAX_KEYBOARD_CELLS ||
          Boolean(requestId) !== Boolean(pendingCount) || feedback > 5) return bad();
      this.incoming = { header: {
        bootId: value.getUint32(2, true), revision: value.getUint32(6, true), requestId, feedback,
      }, count, pendingCount, data: [] };
      return null;
    }
    const incoming = this.incoming;
    // Notifications may begin before subscription or an explicit sync request.
    if (!incoming) return null;
    if (value.byteLength < 6 || value.getUint32(2, true) !== incoming.header.revision) return bad();
    if (op === 2) {
      if (value.byteLength < 9 || value.getUint16(6, true) !== incoming.data.length ||
          incoming.data.length + value.byteLength - 8 > incoming.count + incoming.pendingCount) return bad();
      for (let i = 8; i < value.byteLength; i++) {
        const cell = value.getUint8(i);
        if (cell > 63) return bad();
        incoming.data.push(cell);
      }
      return null;
    }
    if (op !== 3 || value.byteLength !== 6 || incoming.data.length !== incoming.count + incoming.pendingCount) return bad();
    this.reset();
    return { ...incoming.header, cells: incoming.data.slice(0, incoming.count), pending: incoming.data.slice(incoming.count) };
  }
}

export function encodeKeyboardSync(): Uint8Array<ArrayBuffer> { return new Uint8Array([1, 1]); }
export function encodeKeyboardReady(ready: boolean): Uint8Array<ArrayBuffer> { return new Uint8Array([1, 3, Number(ready)]); }
export function encodeKeyboardAck(id: number, accepted: boolean): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(id) || id < 1 || id > 0xffffffff) throw new Error("잘못된 키보드 전송 번호입니다.");
  const bytes = new Uint8Array([1, 2, 0, 0, 0, 0, Number(accepted)]);
  new DataView(bytes.buffer).setUint32(2, id, true);
  return bytes;
}

export function keyboardFeedback(code: number): string {
  return ["", "입력 공간이 가득 찼습니다. 먼저 전송하거나 지워 주세요.",
    "웹과 채팅 연결을 확인해 주세요. 작성 내용은 보관했습니다.",
    "전송 확인 시간이 지났습니다. 작성 내용은 보관했습니다.",
    "전송하지 못했습니다. 입력을 확인한 뒤 전송 키를 다시 눌러 주세요.",
    "보낼 내용을 먼저 입력해 주세요."][code] ?? "";
}
