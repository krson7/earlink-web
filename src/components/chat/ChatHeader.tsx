"use client";

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
  badgeClassName: string;
};

function getModeInformation(
  accessibilityMode: AccessibilityMode,
): ModeInformation {
  if (accessibilityMode === "VISUAL") {
    return {
      label: "점자 서비스",
      description: "점자 대화",
      badgeClassName:
        "border-violet-200 bg-violet-50 text-violet-700",
    };
  }

  if (accessibilityMode === "HEARING") {
    return {
      label: "수어 서비스",
      description: "지문자 인식",
      badgeClassName:
        "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    };
  }

  return {
    label: "텍스트 서비스",
    description: "텍스트 대화",
    badgeClassName:
      "border-slate-200 bg-slate-100 text-slate-700",
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
      className="h-[18px] w-[18px]"
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
      className="h-[18px] w-[18px]"
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
      className="h-[18px] w-[18px]"
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
  chatStatus,
  accessibilityMode,
  onLeave,
}: ChatHeaderProps) {
  const modeInformation =
    getModeInformation(
      accessibilityMode,
    );

  return (
    <header
      className="shrink-0 border-b border-slate-100 bg-white px-4 pb-3 shadow-sm"
      style={{
        paddingTop:
          "max(0.75rem, env(safe-area-inset-top))",
      }}
    >
      <div className="flex min-h-12 items-center gap-3">
        {/* 뒤로가기 버튼 */}
        <button
          type="button"
          onClick={onLeave}
          aria-label="서비스 선택 화면으로 돌아가기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 active:scale-95"
        >
          <BackIcon />
        </button>

        {/* 서비스 이름과 연결 상태 */}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-black tracking-[-0.03em] text-slate-950">
            EarLink
          </h1>

          <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px]">
            <span
              aria-hidden="true"
              className={[
                "h-2 w-2 shrink-0 rounded-full",
                chatConnected
                  ? "bg-emerald-500"
                  : "bg-amber-400",
              ].join(" ")}
            />

            <span
              aria-live="polite"
              className="truncate text-slate-500"
            >
              {chatStatus}
            </span>
          </div>
        </div>

        {/* 오른쪽 서비스 종류 배지 */}
        <div className="shrink-0">
          <span
            className={[
              "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-extrabold whitespace-nowrap",
              modeInformation.badgeClassName,
            ].join(" ")}
          >
            <ModeIcon
              accessibilityMode={
                accessibilityMode
              }
            />

            {modeInformation.label}
          </span>
        </div>
      </div>

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