"use client";

import { useSignLanguageCamera } from "@/hooks/useSignLanguageCamera";
import type { SignLanguageCameraProps } from "@/types/sign-language";

function CameraFlipIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-[18px] w-[18px]"
    >
      <path
        d="M7.5 7.2h2l1.1-1.7h2.8l1.1 1.7h2A2.5 2.5 0 0 1 19 9.7v6.1a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 15.8V9.7a2.5 2.5 0 0 1 2.5-2.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M14.8 11.1a3.2 3.2 0 0 0-5.5 1M9.2 15a3.2 3.2 0 0 0 5.5-1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />

      <path
        d="m8.8 10.2.5 1.8 1.8-.5M15.2 15.8l-.5-1.8-1.8.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EarLinkSendMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      fill="none"
      className="h-6 w-6"
    >
      <circle
        cx="23"
        cy="31"
        r="6"
        stroke="currentColor"
        strokeWidth="4"
      />

      <circle
        cx="41"
        cy="31"
        r="6"
        stroke="currentColor"
        strokeWidth="4"
      />
    </svg>
  );
}

export default function SignLanguageCamera({
  roomCode,
  participantId,
  chatConnected,
  chatErrorMessage,
  onSendText,
}: SignLanguageCameraProps) {
  const {
    videoRef,
    canvasRef,
    switchCameraRef,
    connected,
    errorMessage,
    currentJamo,
    recognizedText,
    confidence,
    facing,
    canFlipCamera,
    sendRecognizedText,
  } = useSignLanguageCamera({
    roomCode,
    participantId,
    onSendText,
  });

  return (
    <section
      className="shrink-0 bg-white px-3 pt-2"
      style={{
        paddingBottom:
          "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      {errorMessage && (
        <div
          role="alert"
          className="mb-2 rounded-[14px] border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-medium leading-4 text-rose-700"
        >
          {errorMessage}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={[
              "h-2 w-2 shrink-0 rounded-full",
              connected
                ? "bg-emerald-500"
                : "bg-rose-400",
            ].join(" ")}
          />

          <p className="text-[10px] font-black tracking-[-0.02em] text-[#153b60]">
            지문자 인식
          </p>
        </div>

        <button
          type="button"
          aria-label="카메라 전환"
          title="카메라 전환"
          disabled={!canFlipCamera}
          onClick={() => {
            void switchCameraRef.current?.();
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-[0_3px_10px_rgba(15,23,42,0.06)] transition hover:border-slate-300 hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <CameraFlipIcon />
        </button>
      </div>

      <div className="relative h-[clamp(190px,27dvh,230px)] overflow-hidden rounded-[24px] border border-slate-200 bg-[#070b16] shadow-[0_12px_28px_rgba(15,23,42,0.16)]">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="absolute inset-0 h-full w-full object-contain"
          style={{
            transform:
              facing === "user"
                ? "scaleX(-1)"
                : "none",
          }}
        />

        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={{
            transform:
              facing === "user"
                ? "scaleX(-1)"
                : "none",
          }}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45" />

        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[9px] font-semibold text-white/90 backdrop-blur-md">
          오른손을 프레임 안에 보여주세요
        </div>

        <div className="pointer-events-none absolute inset-x-[24%] bottom-[17%] top-[18%]">
          <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-[18px] border-l border-t border-white/45" />
          <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-[18px] border-r border-t border-white/45" />
          <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-[18px] border-b border-l border-white/45" />
          <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-[18px] border-b border-r border-white/45" />
        </div>

        {currentJamo && (
          <div className="absolute bottom-3 left-3 max-w-[78%] rounded-[14px] border border-white/10 bg-black/35 px-3 py-2 text-white backdrop-blur-md">
            <p className="text-[9px] font-semibold text-white/60">
              현재 인식
            </p>

            <p
              aria-live="polite"
              className="mt-0.5 truncate text-[13px] font-black tracking-[-0.02em]"
            >
              {`${currentJamo} · ${Math.round(
                confidence * 100,
              )}%`}
            </p>
          </div>
        )}
      </div>

      {chatErrorMessage && (
        <div
          role="alert"
          className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {chatErrorMessage}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendRecognizedText();
        }}
        className="pt-2"
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 rounded-[22px] border border-blue-100 bg-white px-4 py-2 shadow-[0_3px_12px_rgba(15,23,42,0.04)]">
            <textarea
              aria-label="지문자 인식 문장"
              value={recognizedText}
              rows={1}
              readOnly
              className="max-h-24 min-h-5 w-full resize-none overflow-y-auto bg-transparent text-[14px] leading-5 text-slate-900 outline-none"
            />
          </div>

          <button
            type="submit"
            aria-label="지문자 메시지 전송"
            disabled={
              !chatConnected ||
              !recognizedText.trim()
            }
            className={[
              "flex h-11 w-[62px] shrink-0 items-center justify-center",
              "rounded-[18px] text-white",
              "transition duration-200",
              chatConnected &&
              recognizedText.trim()
                ? [
                    "bg-gradient-to-br",
                    "from-sky-400",
                    "via-blue-500",
                    "to-indigo-600",
                    "shadow-[0_7px_18px_rgba(37,99,235,0.22)]",
                    "hover:-translate-y-[1px]",
                    "hover:shadow-[0_10px_22px_rgba(37,99,235,0.28)]",
                    "active:translate-y-0",
                    "active:scale-95",
                  ].join(" ")
                : [
                    "cursor-not-allowed",
                    "bg-slate-200",
                    "text-slate-400",
                    "shadow-none",
                  ].join(" "),
            ].join(" ")}
          >
            <EarLinkSendMark />
          </button>
        </div>
      </form>
    </section>
  );
}