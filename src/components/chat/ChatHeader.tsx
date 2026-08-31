"use client";

import {
  useEffect,
  useState,
} from "react";

type AccessibilityMode =
  | "VISUAL"
  | "HEARING"
  | "STANDARD";

type ChatHeaderProps = {
  chatConnected: boolean;
  chatStatus: string;
  accessibilityMode: AccessibilityMode;
  onLeave: () => void;
};

type ModeInformation = {
  label: string;
  description: string;
};

function getModeInformation(
  accessibilityMode: AccessibilityMode,
): ModeInformation {
  if (accessibilityMode === "VISUAL") {
    return {
      label: "점자 서비스",
      description: "점자 대화",
    };
  }

  if (accessibilityMode === "HEARING") {
    return {
      label: "수어 서비스",
      description: "지문자 인식",
    };
  }

  return {
    label: "텍스트 서비스",
    description: "텍스트 대화",
  };
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
    >
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrailleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
    >
      <circle
        cx="8"
        cy="6"
        r="1.7"
        fill="currentColor"
      />

      <circle
        cx="16"
        cy="6"
        r="1.7"
        fill="currentColor"
      />

      <circle
        cx="8"
        cy="12"
        r="1.7"
        fill="currentColor"
      />

      <circle
        cx="16"
        cy="12"
        r="1.7"
        fill="currentColor"
      />

      <circle
        cx="8"
        cy="18"
        r="1.7"
        fill="currentColor"
      />

      <circle
        cx="16"
        cy="18"
        r="1.7"
        fill="currentColor"
      />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
    >
      <path
        d="M7.5 12V5.5a1.5 1.5 0 0 1 3 0V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M10.5 10V4.5a1.5 1.5 0 0 1 3 0V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M13.5 10V6a1.5 1.5 0 0 1 3 0v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <path
        d="M16.5 11V8.5a1.5 1.5 0 0 1 3 0V14c0 4.1-2.7 7-6.8 7h-.9c-2.2 0-4.2-1.1-5.4-3l-2.1-3.3a1.7 1.7 0 0 1 2.7-2l1.8 1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
    >
      <path
        d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M7.5 10h9M7.5 13.5h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ModeIcon({
  accessibilityMode,
}: {
  accessibilityMode: AccessibilityMode;
}) {
  if (accessibilityMode === "VISUAL") {
    return <BrailleIcon />;
  }

  if (accessibilityMode === "HEARING") {
    return <HandIcon />;
  }

  return <TextIcon />;
}

export default function ChatHeader({
  chatConnected,
  accessibilityMode,
  onLeave,
}: ChatHeaderProps) {
  const [
    showTagline,
    setShowTagline,
  ] = useState(true);

  const modeInformation =
    getModeInformation(
      accessibilityMode,
    );

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        setShowTagline(false);
      }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <header
      className="shrink-0 bg-white shadow-sm"
      style={{
        paddingTop:
          "env(safe-area-inset-top)",
      }}
    >
      {/* 상단 헤더 */}
      <div className="flex h-[50px] items-center gap-1 px-3">
        {/* 뒤로가기 */}
        <button
          type="button"
          onClick={onLeave}
          aria-label="서비스 선택 화면으로 돌아가기"
          className="flex h-9 w-8 shrink-0 items-center justify-start rounded-full text-slate-600 transition hover:bg-slate-100 active:scale-95"
        >
          <BackIcon />
        </button>

        {/* 서비스 이름 */}
        <div className="flex min-w-0 flex-1 items-center">
          <h1 className="truncate text-[20px] font-black leading-none tracking-[-0.03em] text-slate-950">
            EarLink
          </h1>
        </div>

        {/* 서비스 종류 */}
        <div className="shrink-0">
          <span className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-3 text-[10px] font-extrabold text-slate-700">
            <ModeIcon
              accessibilityMode={
                accessibilityMode
              }
            />

            {modeInformation.label}
          </span>
        </div>
      </div>

      {/* 2.2초 동안 표시되는 문구 */}
      {showTagline && (
        <div className="flex h-[28px] items-center justify-center border-y border-emerald-100 bg-emerald-50/80">
          <p className="text-[11px] font-bold tracking-[0.12em] text-emerald-700">
            EVERY WAY CONNECTS
          </p>
        </div>
      )}

      {/* 스크린 리더 안내 */}
      <p className="sr-only">
        현재 선택한 방식은{" "}
        {modeInformation.description}
        이며,{" "}
        {chatConnected
          ? "채팅 서버에 연결되어 있습니다."
          : "채팅 서버에 연결 중입니다."}
      </p>
    </header>
  );
}