"use client";

import { useEarLinkBluetooth } from "@/hooks/useEarLinkBluetooth";

export default function EarLinkConnector() {
  const {
    connected,
    deviceName,
    error,
    connect,
    disconnect,
  } = useEarLinkBluetooth();

  async function handleConnect(): Promise<void> {
    await connect();
  }

  function handleDisconnect(): void {
    disconnect();
  }

  return (
    <div
      className="
        shrink-0
        border-t border-slate-200
        bg-white
        px-4 py-3
      "
      style={{
        paddingBottom:
          "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* 에러 메시지 */}
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
        /* 연결 완료 상태 */
        <div
          className="
            flex
            min-h-14
            items-center
            gap-3
            rounded-2xl
            border border-blue-100
            bg-blue-50/50
            px-4 py-3
          "
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

              <p
                className="
                  truncate
                  text-sm
                  font-semibold
                  text-slate-800
                "
              >
                {deviceName ?? "EarLink"} 연결됨
              </p>
            </div>

            <p
              className="
                mt-1
                text-xs
                text-slate-500
              "
            >
              점자 기기가 준비되었습니다.
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
        /* 연결 전 상태 */
        <div>
          <p
            className="
              mb-2
              text-center
              text-xs
              text-slate-500
            "
          >
            상대방의 메시지를 점자로 받으려면
            EarLink 기기를 연결해주세요.
          </p>

          <button
            type="button"
            onClick={handleConnect}
            className="
              flex
              h-12
              w-full
              items-center
              justify-center
              rounded-2xl
              bg-gradient-to-r
              from-sky-500
              to-blue-600
              text-sm
              font-semibold
              text-white
              shadow-[0_6px_18px_rgba(37,99,235,0.20)]
              transition
              duration-200
              hover:-translate-y-[1px]
              hover:shadow-[0_8px_22px_rgba(37,99,235,0.25)]
              active:translate-y-0
              active:scale-[0.99]
            "
          >
            EarLink 연결하기
          </button>
        </div>
      )}
    </div>
  );
}