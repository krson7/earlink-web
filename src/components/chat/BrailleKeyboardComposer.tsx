"use client";

import { useMemo, useState } from "react";
import { SendIcon } from "@/components/Brand";
import { decodeKoreanBraille } from "@/lib/korean-braille-input";
import { keyboardFeedback } from "@/lib/earlink-keyboard-protocol";
import type { KeyboardSnapshot } from "@/lib/earlink-keyboard-protocol";

type Props = {
  connected: boolean;
  supported: boolean;
  chatConnected: boolean;
  snapshot: KeyboardSnapshot | null;
  error: string | null;
  chatError: string;
  onSend: () => Promise<void>;
};

export default function BrailleKeyboardComposer({ connected, supported, chatConnected, snapshot, error, chatError, onSend }: Props) {
  const [sending, setSending] = useState(false);
  const decoded = useMemo(() => decodeKoreanBraille(snapshot?.cells ?? []), [snapshot]);
  const feedback = error || chatError || keyboardFeedback(snapshot?.feedback ?? 0);
  const canSend = connected && supported && chatConnected && decoded.complete &&
    Boolean(decoded.text.trim()) && !snapshot?.requestId && !sending;
  async function submit() {
    if (!canSend) return;
    setSending(true);
    try { await onSend(); }
    catch { /* The Bluetooth hook presents the error. */ }
    finally { setSending(false); }
  }
  return (
    <section className="braille-keyboard-composer" aria-labelledby="braille-draft-label">
      <div className="flex items-center justify-between gap-2">
        <label id="braille-draft-label" htmlFor="braille-draft" className="text-sm font-semibold text-slate-800">점자 키보드로 작성</label>
        <span className="text-xs text-slate-500">{snapshot?.requestId ? "전송 확인 중…" : `${snapshot?.cells.length ?? 0}칸`}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="composer-input">
          <textarea id="braille-draft" readOnly rows={2} value={decoded.text}
            placeholder={connected ? "점자 키보드로 입력해 주세요" : "EarLink를 연결해 주세요"}
            aria-describedby="braille-input-help" />
        </div>
        <button type="button" className="soft-circle send-button" aria-label="점자 입력 메시지 전송"
          disabled={!canSend} onClick={() => void submit()}><SendIcon /></button>
      </div>
      <p id="braille-input-help" className="mt-2 text-xs leading-relaxed text-slate-500">
        점 키를 눌렀다가 모두 떼면 입력됩니다. 지우기를 길게 누르면 전체 삭제, 전송 키를 누르면 메시지를 보냅니다.
      </p>
      <div role="status" aria-live="polite" className="mt-1 text-xs text-slate-600">
        {!connected ? "연결이 끊겨도 작성 내용은 기기에 보관됩니다." :
          !supported ? "키보드를 사용하려면 최신 EarLink 펌웨어를 업로드해 주세요." :
          !snapshot ? "키보드 입력을 동기화하고 있습니다…" :
          !chatConnected ? "채팅 연결 중입니다. 입력은 계속할 수 있습니다." :
          snapshot.requestId ? "작성한 메시지를 전송하고 있습니다." : "한글 점자 입력을 지원합니다."}
      </div>
      {feedback && <p role="alert" className="mt-2 text-xs text-red-700">{feedback}</p>}
      {!decoded.complete && <p className="mt-1 text-xs text-amber-800">{decoded.issues[0]}</p>}
      {decoded.braille && <details className="mt-2 text-xs text-slate-500">
        <summary>입력한 점자 확인</summary>
        <p className="mt-1 break-all text-lg tracking-wider" aria-label="입력 점자">{decoded.braille}</p>
      </details>}
    </section>
  );
}
