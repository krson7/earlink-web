"use client";

import { useState } from "react";
import type { EarLinkCommand, EarLinkStatus } from "@/lib/earlink-protocol";

/*
 * 점자 출력 조작 (이전/다음/넘김 방식/지우기/표시 시간).
 * 기기에 이 기능의 물리 키가 없어 웹에서만 조작한다.
 */

type Props = {
  status: EarLinkStatus;
  onControl: (command: EarLinkCommand) => Promise<void>;
  onIntervalChange: (milliseconds: number) => Promise<void>;
};

const INTERVALS = [1000, 2000, 3000, 5000, 10000];

export default function DeviceOutputControls({ status, onControl, onIntervalChange }: Props) {
  const [busy, setBusy] = useState(false);

  async function run(operation: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    try { await operation(); }
    catch { /* The Bluetooth hook presents the error. */ }
    finally { setBusy(false); }
  }

  const summary = status.active
    ? `점자 ${status.page}/${status.pages}쪽 · ${status.automatic ? "자동 넘김" : "직접 넘김"}`
    : "새 메시지를 기다리고 있어요";

  return (
    <div className="output-controls">
      <p role="status" className="output-controls-status">
        {summary}
        {status.queued > 0 && ` · 대기 ${status.queued}개`}
      </p>

      {!status.outputEnabled && (
        <p className="output-controls-note">기기 출력 설정 전이라 연결과 변환만 확인할 수 있어요.</p>
      )}
      {status.unsupported > 0 && (
        <p className="output-controls-note">지원하지 않는 문자 {status.unsupported}개는 물음표로 표시해요.</p>
      )}

      <div className="output-controls-row">
        <button type="button" disabled={busy || !status.active}
          onClick={() => void run(() => onControl("previous"))}>이전</button>
        <button type="button" disabled={busy || !status.active}
          onClick={() => void run(() => onControl("next"))}>다음</button>
        <button type="button" disabled={busy}
          onClick={() => void run(() => onControl(status.automatic ? "pause" : "play"))}>
          {status.automatic ? "직접 넘기기" : "자동 넘기기"}
        </button>
        <button type="button" disabled={busy || (!status.active && status.queued === 0)}
          onClick={() => void run(() => onControl("clear"))}>지우기</button>
      </div>

      <label className="output-controls-interval">
        표시 시간
        <select value={status.intervalMs} disabled={busy}
          onChange={(event) => {
            const milliseconds = Number(event.target.value);
            void run(() => onIntervalChange(milliseconds));
          }}>
          {INTERVALS.map((ms) => <option key={ms} value={ms}>{ms / 1000}초</option>)}
        </select>
      </label>
    </div>
  );
}
