"use client";

import { useMemo, useState } from "react";
import { SendIcon } from "@/components/Brand";
import { decodeKoreanBraille } from "@/lib/korean-braille-input";
import { keyboardFeedback } from "@/lib/earlink-keyboard-protocol";
import type { KeyboardSnapshot } from "@/lib/earlink-keyboard-protocol";

/*
 * 기기의 점자 키보드로 작성 중인 글.
 * 기기의 전송 키나 오른쪽 전송 버튼을 누르면 채팅으로 보낸다.
 */

type Props = {
  chatConnected: boolean;
  snapshot: KeyboardSnapshot | null;
  error: string | null;
  onSend: () => Promise<void>;
};

export default function BrailleKeyboardComposer({ chatConnected, snapshot, error, onSend }: Props) {
  const [sending, setSending] = useState(false);
  const decoded = useMemo(() => decodeKoreanBraille(snapshot?.cells ?? []), [snapshot]);
  const pending = Boolean(snapshot?.requestId);
  const notice = error || keyboardFeedback(snapshot?.feedback ?? 0) || (decoded.complete ? "" : decoded.issues[0]);
  const canSend = chatConnected && decoded.complete && Boolean(decoded.text.trim()) && !pending && !sending;

  async function submit() {
    if (!canSend) return;
    setSending(true);
    try { await onSend(); }
    catch { /* The Bluetooth hook presents the error. */ }
    finally { setSending(false); }
  }

  return (
    <section className="braille-draft" aria-labelledby="braille-draft-label">
      <p id="braille-draft-label" className="braille-draft-label">
        점자 키보드{pending ? " · 보내는 중…" : ""}
      </p>
      <div className="flex items-center gap-2">
        <div className="composer-input">
          <textarea readOnly rows={1} value={decoded.text} aria-labelledby="braille-draft-label"
            placeholder="기기의 점자 키보드로 입력하세요" />
        </div>
        <button type="button" className="soft-circle send-button" aria-label="점자 입력 메시지 전송"
          disabled={!canSend} onClick={() => void submit()}><SendIcon /></button>
      </div>
      {notice && <p role="alert" className="braille-draft-notice">{notice}</p>}
    </section>
  );
}
