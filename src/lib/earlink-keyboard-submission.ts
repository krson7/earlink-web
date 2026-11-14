import { decodeKoreanBraille } from "./korean-braille-input.ts";
import type { KeyboardSnapshot } from "./earlink-keyboard-protocol.ts";
import { MAX_CHAT_MESSAGE_LENGTH } from "./chat.ts";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
/** Remember outcomes before the BLE ACK. Replayed snapshots must not send twice.
 * sessionStorage survives reconnect/reload in the same tab; no message text is stored.
 * Success means accepted by the existing WebSocket send API, not server delivery.
 */
export class KeyboardSubmissionLedger {
  private outcomes = new Map<string, boolean>();
  private loaded = new Set<string>();
  handle(snapshot: KeyboardSnapshot, deviceId: string, ready: boolean,
    send: (text: string) => boolean, storage?: StorageLike): { accepted: boolean; error: string } {
    const scope = `earlink-keyboard:${deviceId}:${snapshot.bootId}`;
    if (!this.loaded.has(scope)) {
      this.loaded.add(scope);
      try {
        const saved: unknown = JSON.parse(storage?.getItem(scope) ?? "[]");
        if (Array.isArray(saved)) for (const row of saved.slice(-128)) {
          if (Array.isArray(row) && Number.isInteger(row[0]) && typeof row[1] === "boolean")
            this.outcomes.set(`${scope}:${row[0]}`, row[1]);
        }
      } catch { /* Storage can be disabled; the in-memory ledger still works. */ }
    }
    const key = `${scope}:${snapshot.requestId}`;
    if (!snapshot.requestId || !snapshot.pending.length) return { accepted: false, error: "보낼 내용이 없습니다." };
    if (this.outcomes.has(key)) return { accepted: this.outcomes.get(key)!, error: "" };
    const decoded = decodeKoreanBraille(snapshot.pending);
    let accepted = false, error = "";
    if (!ready) error = "채팅 연결을 확인해 주세요. 작성 내용은 보관했습니다.";
    else if (!decoded.complete) error = decoded.issues[0];
    else if (!decoded.text.trim()) error = "보낼 내용을 먼저 입력해 주세요.";
    else if (decoded.text.trim().length > MAX_CHAT_MESSAGE_LENGTH) error = `메시지는 최대 ${MAX_CHAT_MESSAGE_LENGTH}자까지 입력할 수 있습니다.`;
    else {
      try { accepted = send(decoded.text); }
      catch { accepted = false; }
      if (!accepted) error = "전송하지 못했습니다. 작성 내용은 보관했습니다.";
    }
    this.outcomes.set(key, accepted);
    try {
      const rows = [...this.outcomes].filter(([entry]) => entry.startsWith(`${scope}:`)).slice(-128)
        .map(([entry, value]) => [Number(entry.slice(scope.length + 1)), value]);
      storage?.setItem(scope, JSON.stringify(rows));
    } catch { /* A storage error must not turn an accepted send into a retry. */ }
    return { accepted, error };
  }
}
