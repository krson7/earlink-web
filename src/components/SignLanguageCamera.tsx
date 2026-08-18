"use client";

import { useSignLanguageCamera } from "@/hooks/useSignLanguageCamera";
import type { SignLanguageCameraProps } from "@/types/sign-language";

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
    status,
    connected,
    errorMessage,
    currentJamo,
    recognizedText,
    confidence,
    facing,
    canFlipCamera,
    ttsEnabled,
    sendRecognizedText,
    toggleTts,
  } = useSignLanguageCamera({
    roomCode,
    participantId,
    onSendText,
  });

  return (
    <section className="shrink-0 border-b border-slate-200 bg-white">
      {errorMessage && (
        <div
          role="alert"
          className="border-b border-red-100 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700"
        >
          {errorMessage}
        </div>
      )}

      <div className="relative aspect-[16/10] overflow-hidden bg-slate-950">
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            transform:
              facing === "user"
                ? "scaleX(-1)"
                : "none",
          }}
        />

        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{
            transform:
              facing === "user"
                ? "scaleX(-1)"
                : "none",
          }}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/65" />

        <div className="pointer-events-none absolute inset-x-[22%] bottom-[18%] top-[18%] rounded-[28px] border border-white/25 shadow-[0_0_0_999px_rgba(15,23,42,0.05)]">
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-white/75">
            오른손을 안내선 안에 보여주세요
          </span>
        </div>

        <div className="absolute left-3 top-3 flex max-w-[58%] items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md">
          <span
            className={
              "h-2 w-2 shrink-0 rounded-full " +
              (
                connected
                  ? "bg-emerald-400"
                  : "bg-rose-400"
              )
            }
          />

          <span className="truncate">
            {status}
          </span>
        </div>

        <div className="absolute right-3 top-3 flex gap-2">
          <button
            type="button"
            aria-label="카메라 전환"
            title="카메라 전환"
            disabled={!canFlipCamera}
            onClick={() => {
              void switchCameraRef.current?.();
            }}
            className="rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            전환
          </button>

          <button
            type="button"
            aria-label={
              ttsEnabled
                ? "인식 음성 끄기"
                : "인식 음성 켜기"
            }
            title={
              ttsEnabled
                ? "인식 음성 끄기"
                : "인식 음성 켜기"
            }
            onClick={toggleTts}
            className="rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-md transition active:scale-95"
          >
            {ttsEnabled
              ? "음성 켬"
              : "음성 끔"}
          </button>
        </div>

        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-white/70">
              현재 인식
            </p>

            <p
              aria-live="polite"
              className="mt-0.5 truncate text-lg font-black text-white drop-shadow"
            >
              {currentJamo
                ? `${currentJamo} · ${Math.round(
                    confidence * 100,
                  )}%`
                : "손동작을 기다리고 있어요"}
            </p>
          </div>

          <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
            지문자 입력
          </span>
        </div>
      </div>

      {chatErrorMessage && (
        <div
          role="alert"
          className="mx-3 mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {chatErrorMessage}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendRecognizedText();
        }}
        className="bg-white px-3 py-1.5"
        style={{
          paddingBottom:
            "max(0.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 rounded-[22px] border border-blue-100 bg-white px-4 py-2 shadow-[0_3px_12px_rgba(15,23,42,0.04)]">
            <textarea
              aria-label="지문자 인식 문장"
              value={recognizedText}
              rows={1}
              readOnly
              placeholder="지문자를 인식하면 문장이 여기에 표시됩니다"
              className="max-h-24 min-h-5 w-full resize-none overflow-y-auto bg-transparent text-[14px] leading-5 text-slate-900 outline-none placeholder:text-slate-400"
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