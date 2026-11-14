"use client";

import { useState } from "react";
import { countUnreadCells } from "@/lib/earlink-protocol";
import type { EarLinkCommand, EarLinkStatus } from "@/lib/earlink-protocol";

type EarLinkConnectorProps = {
  connected: boolean;
  connecting: boolean;
  status: EarLinkStatus | null;
  onControl: (command: EarLinkCommand) => Promise<void>;
  onIntervalChange: (milliseconds: number) => Promise<void>;
  failedCount: number;
  retrying: boolean;
  onRetry: () => Promise<void>;
  deviceName: string | null;
  error: string | null;
  /** The firmware has the Perkins keys (INPUT characteristic). */
  inputSupported: boolean;
  /** Live preview of what is being typed on the device. */
  inputDraft: string;
  unsentTypedCount: number;
  chatConnected: boolean;
  chatErrorMessage: string;
  onRetryTyped: () => void;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
};

export default function EarLinkConnector({
  connected,
  connecting,
  status,
  onControl,
  onIntervalChange,
  failedCount,
  retrying,
  onRetry,
  deviceName,
  error,
  inputSupported,
  inputDraft,
  unsentTypedCount,
  chatConnected,
  chatErrorMessage,
  onRetryTyped,
  onConnect,
  onDisconnect,
}: EarLinkConnectorProps) {
  const unreadCells = countUnreadCells(inputDraft);
  const [busy, setBusy] = useState(false);
  async function run(operation: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    try { await operation(); }
    catch { /* The Bluetooth hook presents the error. */ }
    finally { setBusy(false); }
  }
  async function handleConnect(): Promise<void> {
    await onConnect();
  }

  function handleDisconnect(): void {
    onDisconnect();
  }

  return (
    <div
      className="earlink-connector"
      style={{
        paddingBottom:
          "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* 기기 키 입력을 채팅 서버로 보내지 못한 이유 */}
      {chatErrorMessage && (
        <div
          role="alert"
          className="mb-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700"
        >
          {chatErrorMessage}
        </div>
      )}

      {/* 실제 오류가 있을 때만 표시 */}
      {error && (
        <div
          role="alert"
          className="
            mb-2
            rounded-xl
            border border-red-100
            bg-red-50
            px-3 py-2
            text-center
            text-xs
            font-medium
            text-red-700
          "
        >
          {error}
        </div>
      )}

      {connected ? (
        <div
          className="earlink-connected"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="
                  h-2.5
                  w-2.5
                  shrink-0
                  rounded-full
                  bg-emerald-500
                "
              />

              <p className="truncate text-sm font-semibold text-slate-800">
                {deviceName ?? "EarLink"} 연결됨
              </p>
            </div>

            <p className="mt-1 text-xs text-slate-500">
              새 메시지를 점자 기기로 전달합니다.
              {inputSupported && " 기기 키로 쓴 글은 전송 키를 누르면 채팅으로 보냅니다."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleDisconnect}
            className="
              shrink-0
              rounded-xl
              border border-slate-200
              bg-white
              px-3 py-2
              text-xs
              font-semibold
              text-slate-600
              transition
              hover:bg-slate-50
              active:scale-[0.98]
            "
          >
            연결 해제
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="earlink-connect-button"
        >
          {connecting ? "EarLink 연결 중…" : "EarLink 연결"}
        </button>
      )}

      {connected && inputSupported && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] font-semibold text-slate-500">기기 입력</p>
          <p
            aria-live="polite"
            className="mt-0.5 min-h-5 whitespace-pre-wrap break-all text-sm text-slate-800"
          >
            {inputDraft || <span className="text-slate-400">점자 키로 입력하면 여기에 표시됩니다</span>}
          </p>
          {unreadCells > 0 && (
            <p className="mt-1 text-xs text-amber-800">
              읽지 못한 점자 칸 {unreadCells}개는 점자 기호(⠿)로 보냅니다.
            </p>
          )}
          {!chatConnected && (
            <p className="mt-1 text-xs text-amber-800">채팅 서버에 연결되면 보낼 수 있어요.</p>
          )}
        </div>
      )}

      {connected && status && (
        <div className="mt-2 space-y-2">
          <p role="status" className="text-xs text-slate-600">
            {status.active
              ? `점자 ${status.page}/${status.pages}쪽 · ${status.automatic ? "자동 넘김" : "직접 넘김"}`
              : "새 메시지를 기다리고 있어요"}
            {status.queued > 0 && ` · 대기 ${status.queued}개`}
          </p>
          {!status.outputEnabled && (
            <p className="text-xs text-amber-800">기기 출력 설정 전입니다. 현재 연결과 변환만 확인할 수 있어요.</p>
          )}
          {status.active && !status.automatic && !status.visible && (
            <p className="text-xs text-slate-600">점 표시가 꺼졌습니다. 이전 또는 자동 넘김을 누르면 다시 표시됩니다.</p>
          )}
          {status.unsupported > 0 && (
            <p role="status" className="text-xs text-amber-800">
              지원하지 않는 문자 {status.unsupported}개를 물음표로 표시합니다.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || !status.active}
              onClick={() => void run(() => onControl("previous"))}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40">이전</button>
            <button type="button" disabled={busy || !status.active}
              onClick={() => void run(() => onControl("next"))}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40">다음</button>
            <button type="button" disabled={busy}
              onClick={() => void run(() => onControl(status.automatic ? "pause" : "play"))}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40">
              {status.automatic ? "직접 넘기기" : "자동 넘기기"}
            </button>
            <button type="button" disabled={busy || (!status.active && status.queued === 0)}
              onClick={() => void run(() => onControl("clear"))}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40">출력 지우기</button>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              표시 시간
              <select value={status.intervalMs} disabled={busy}
                onChange={(event) => { const milliseconds = Number(event.target.value); void run(() => onIntervalChange(milliseconds)); }}
                className="rounded-lg border bg-white px-2 py-2">
                {[1000, 2000, 3000, 5000, 10000].map((ms) => <option key={ms} value={ms}>{ms / 1000}초</option>)}
              </select>
            </label>
          </div>
        </div>
      )}
      {failedCount > 0 && (
        <button type="button" disabled={!connected || retrying}
          onClick={() => void onRetry()}
          className="mt-2 rounded-lg border border-amber-300 px-3 py-2 text-xs text-amber-900 disabled:opacity-40">
          {retrying ? "다시 보내는 중…" : `전달 실패 ${failedCount}개 다시 보내기`}
        </button>
      )}
      {unsentTypedCount > 0 && (
        <button type="button" disabled={!chatConnected}
          onClick={onRetryTyped}
          className="mt-2 ml-2 rounded-lg border border-amber-300 px-3 py-2 text-xs text-amber-900 disabled:opacity-40">
          {`기기에서 쓴 글 ${unsentTypedCount}개 채팅으로 다시 보내기`}
        </button>
      )}
    </div>
  );
}
