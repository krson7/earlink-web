/** EarLink v1. Keep in sync with firmware/earlink/Protocol.h. */
export const EARLINK_SERVICE_UUID = "8f3a0001-7c3b-4b8a-9f52-123456789abc";
export const EARLINK_TEXT_UUID = "8f3a0002-7c3b-4b8a-9f52-123456789abc";
export const EARLINK_STATUS_UUID = "8f3a0003-7c3b-4b8a-9f52-123456789abc";
export const MAX_TEXT_BYTES = 4096;
export const ACK_TIMEOUT_MS = 10000;

export type EarLinkStatus = {
  active: boolean;
  automatic: boolean;
  outputEnabled: boolean;
  visible: boolean;
  acknowledgedId: number;
  result: number;
  queued: number;
  messageId: number;
  page: number;
  pages: number;
  unsupported: number;
  intervalMs: number;
};

export type EarLinkCommand = "next" | "previous" | "clear" | "pause" | "play";
const COMMANDS: Record<EarLinkCommand, number> = {
  next: 1, previous: 2, clear: 3, pause: 4, play: 5,
};

function packet(op: number, id: number, size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set([0x45, 0x4c, 1, op]);
  new DataView(bytes.buffer).setUint16(4, id, true);
  return bytes;
}

/** Encode first, then split bytes; ESP32 decodes only after COMMIT. */
export function encodeTextPackets(text: string, id: number): Uint8Array<ArrayBuffer>[] {
  if (!Number.isInteger(id) || id < 1 || id > 65535) {
    throw new Error("잘못된 기기 메시지 번호입니다.");
  }
  const bytes = new TextEncoder().encode(text.normalize("NFC"));
  if (!text.trim() || bytes.length > MAX_TEXT_BYTES) {
    throw new Error(`기기 메시지는 비어 있지 않은 ${MAX_TEXT_BYTES}바이트 이하여야 합니다.`);
  }
  const begin = packet(1, id, 8);
  new DataView(begin.buffer).setUint16(6, bytes.length, true);
  const packets = [begin];
  // 20-byte writes work without relying on a larger negotiated ATT MTU.
  for (let offset = 0; offset < bytes.length; offset += 12) {
    const chunk = bytes.slice(offset, offset + 12);
    const data = packet(2, id, 8 + chunk.length);
    new DataView(data.buffer).setUint16(6, offset, true);
    data.set(chunk, 8);
    packets.push(data);
  }
  packets.push(packet(3, id, 6));
  return packets;
}

export function encodeCommand(command: EarLinkCommand): Uint8Array<ArrayBuffer> {
  return new Uint8Array([1, COMMANDS[command]]);
}

export function encodeInterval(milliseconds: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(milliseconds) || milliseconds < 1000 || milliseconds > 10000) {
    throw new Error("표시 시간은 1~10초 사이여야 합니다.");
  }
  const bytes = new Uint8Array([1, 6, 0, 0]);
  new DataView(bytes.buffer).setUint16(2, milliseconds, true);
  return bytes;
}

export function decodeStatus(value: DataView): EarLinkStatus {
  if (value.byteLength !== 16 || value.getUint8(0) !== 1) {
    throw new Error("EarLink 펌웨어의 출력 규격이 맞지 않습니다.");
  }
  const flags = value.getUint8(1);
  return {
    active: Boolean(flags & 1), automatic: Boolean(flags & 2),
    outputEnabled: Boolean(flags & 4),
    visible: Boolean(flags & 8),
    acknowledgedId: value.getUint16(2, true), result: value.getUint8(4),
    queued: value.getUint8(5), messageId: value.getUint16(6, true),
    page: value.getUint16(8, true), pages: value.getUint16(10, true),
    unsupported: value.getUint16(12, true), intervalMs: value.getUint16(14, true),
  };
}

export function deviceError(result: number): string {
  return ({
    2: "기기에서 메시지 형식을 읽지 못했습니다.",
    3: "기기에 보낼 메시지가 너무 깁니다.",
    4: "메시지 일부가 누락되었습니다. 다시 전송해 주세요.",
    5: "기기의 대기 메시지가 가득 찼습니다. 읽기를 진행한 뒤 다시 전송해 주세요.",
    6: "기기 메시지 수신 시간이 초과되었습니다.",
  } as Record<number, string>)[result] ?? "기기에서 메시지를 처리하지 못했습니다.";
}
