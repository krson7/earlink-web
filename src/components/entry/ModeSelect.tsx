"use client";

import Image from "next/image";

type AccessibilityMode =
  | "VISUAL"
  | "HEARING"
  | "STANDARD";

type ModeSelectProps = {
  onSelectMode: (
    mode: AccessibilityMode,
  ) => void;
};

type ModeOption = {
  mode: AccessibilityMode;
  title: string;
  description: readonly [
    string,
    string,
  ];
  imageSrc: string;
  imageAlt: string;
  imageClassName: string;
};

const MODE_OPTIONS = [
  {
    mode: "VISUAL",
    title: "점자로 대화하기",
    description: [
      "점자 기기와 연결해",
      "메시지를 주고받아요.",
    ],
    imageSrc:
      "/mode-icons/braille.png",
    imageAlt:
      "점자 여섯 점을 표현한 이미지",
    imageClassName:
      "scale-[1.68]",
  },

  {
    mode: "HEARING",
    title: "수어로 대화하기",
    description: [
      "카메라로 제스처를 인식해",
      "자연스럽게 문장으로 바꿔줘요.",
    ],
    imageSrc:
      "/mode-icons/sign-language.png",
    imageAlt:
      "두 손으로 수어를 표현한 이미지",
    imageClassName:
      "scale-[1.58]",
  },

  {
    mode: "STANDARD",
    title: "텍스트로 대화하기",
    description: [
      "키보드로 바로 입력하고",
      "실시간으로 이야기를 나눠요.",
    ],
    imageSrc:
      "/mode-icons/text.png",
    imageAlt:
      "텍스트 말풍선을 표현한 이미지",
    imageClassName:
      "scale-[1.64]",
  },
] as const satisfies readonly ModeOption[];

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-[17px] w-[17px]"
    >
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BottomConnectionMark() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center gap-3"
    >
      <span className="h-px w-10 bg-slate-200" />

      <svg
        viewBox="0 0 40 25"
        fill="none"
        className="h-[21px] w-9 text-slate-400"
      >
        <path
          d="M10 7.5 19 16M29 8l-10 8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <circle
          cx="8"
          cy="6"
          r="4"
          fill="white"
          stroke="currentColor"
          strokeWidth="2.4"
        />

        <circle
          cx="20"
          cy="18"
          r="4"
          fill="white"
          stroke="currentColor"
          strokeWidth="2.4"
        />

        <circle
          cx="31"
          cy="7"
          r="4"
          fill="white"
          stroke="currentColor"
          strokeWidth="2.4"
        />
      </svg>

      <span className="h-px w-10 bg-slate-200" />
    </div>
  );
}

function ModeCard({
  option,
  onSelect,
}: {
  option: ModeOption;
  onSelect: (
    mode: AccessibilityMode,
  ) => void;
}) {
  const descriptionId =
    `mode-${option.mode.toLowerCase()}-description`;

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(option.mode);
      }}
      aria-describedby={descriptionId}
      className={[
        "group relative flex",
        "h-[clamp(96px,12.8dvh,108px)]",
        "w-full items-center",
        "rounded-[22px]",
        "border border-[#eceae6]",
        "bg-white/95",
        "px-3 py-2",
        "text-left",
        "shadow-[0_8px_24px_rgba(15,23,42,0.055)]",
        "backdrop-blur-sm",
        "transition duration-200 ease-out",

        "hover:-translate-y-0.5",
        "hover:border-slate-200",
        "hover:shadow-[0_12px_28px_rgba(15,23,42,0.075)]",

        "active:translate-y-0",
        "active:scale-[0.985]",

        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-slate-400",
        "focus-visible:ring-offset-2",
      ].join(" ")}
    >
      {/* 서비스 이미지 */}
      <span
        className={[
          "relative ml-1 shrink-0",
          "h-[clamp(78px,10.5dvh,90px)]",
          "w-[clamp(78px,10.5dvh,90px)]",
          "overflow-hidden",
          "rounded-[18px]",
        ].join(" ")}
      >
        <Image
          src={option.imageSrc}
          alt={option.imageAlt}
          fill
          sizes="90px"
          priority
          className={[
            "origin-center object-contain",
            option.imageClassName,
          ].join(" ")}
        />
      </span>

      {/* 서비스 설명 */}
      <span className="ml-3.5 min-w-0 flex-1">
        <span className="block text-[15px] font-black leading-tight tracking-[-0.035em] text-slate-900">
          {option.title}
        </span>

        <span
          id={descriptionId}
          className="mt-1.5 block text-[10.5px] font-medium leading-[1.6] tracking-[-0.02em] text-slate-500"
        >
          <span className="block">
            {option.description[0]}
          </span>

          <span className="block">
            {option.description[1]}
          </span>
        </span>
      </span>

      {/* 이동 버튼 */}
      <span
        aria-hidden="true"
        className={[
          "mr-1 flex",
          "h-10 w-10",
          "shrink-0",
          "items-center justify-center",
          "rounded-full",
          "bg-[#f4f4f2]",
          "text-slate-500",
          "transition duration-200",

          "group-hover:translate-x-0.5",
          "group-hover:bg-slate-100",
          "group-hover:text-slate-700",

          "group-active:scale-95",
        ].join(" ")}
      >
        <ArrowIcon />
      </span>
    </button>
  );
}

export default function ModeSelect({
  onSelectMode,
}: ModeSelectProps) {
  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#faf9f7]">
      {/* 전체적으로 아주 약한 배경 톤 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(250,249,247,0.94) 65%, rgba(248,247,244,0.96) 100%)",
        }}
      />

      {/* 오른쪽 배경 곡면 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[145px] top-[70px] h-[470px] w-[285px] bg-[#f1f0ec]/80"
        style={{
          borderRadius:
            "58% 0 0 72% / 44% 0 0 62%",
        }}
      />

      {/* 곡면 안쪽 연한 레이어 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[175px] top-[122px] h-[390px] w-[270px] bg-white/55 blur-[1px]"
        style={{
          borderRadius:
            "65% 0 0 74% / 50% 0 0 66%",
        }}
      />

      {/* 왼쪽 하단 배경 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[170px] -left-[170px] h-[260px] w-[260px] rounded-full bg-stone-100/45"
      />

      {/* 헤더 */}
      <header
        className={[
          "relative z-30 shrink-0",
          "border-b border-slate-100/90",
          "bg-white/92",
          "backdrop-blur-sm",
        ].join(" ")}
        style={{
          paddingTop:
            "env(safe-area-inset-top)",
        }}
      >
        <div className="flex h-[50px] items-center justify-between pl-0 pr-4">
          {/* EarLink 로고 */}
          <div
            className={[
              "relative -ml-2 block",
              "h-[44px] w-[150px]",
              "translate-x-[3px]",
              "translate-y-[2px]",
              "shrink-0 overflow-hidden",
            ].join(" ")}
          >
            <Image
              src="/earlink-header-logo.png"
              alt="EarLink"
              fill
              sizes="150px"
              priority
              className="origin-center scale-[1.03] object-cover object-center"
            />
          </div>

          {/* 메뉴 */}
          <nav
            aria-label="주요 메뉴"
            className="flex shrink-0 items-center gap-4"
          >
            <a
              href="#service-intro"
              className="whitespace-nowrap text-[12px] font-black tracking-[-0.03em] text-slate-800 transition hover:text-[#3f7568]"
            >
              서비스 소개
            </a>

            <a
              href="#usage-guide"
              className="whitespace-nowrap text-[12px] font-black tracking-[-0.03em] text-slate-800 transition hover:text-[#3f7568]"
            >
              이용 방법
            </a>
          </nav>
        </div>
      </header>

      <main
        id="mode-select-top"
        className="relative z-10 flex min-h-0 flex-1 flex-col px-5"
        style={{
          paddingBottom:
            "max(0.75rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* 메인 문구 */}
        <section
          id="service-intro"
          className={[
            "mx-auto w-full max-w-[365px]",
            "shrink-0 scroll-mt-20",
            "pt-[clamp(26px,4dvh,42px)]",
            "text-left",
          ].join(" ")}
        >
          <h1
            className={[
              "text-[clamp(30px,4.4dvh,36px)]",
              "font-black",
              "leading-[1.17]",
              "tracking-[-0.065em]",
              "text-slate-950",
            ].join(" ")}
          >
            나에게 맞는
            <br />

            <span className="text-[#3f7568]">
              대화 방식
            </span>
            을
            <br />

            선택해 주세요
          </h1>

          <p
            className={[
              "mt-[clamp(12px,2dvh,18px)]",
              "text-[12.5px]",
              "font-medium",
              "leading-[1.7]",
              "tracking-[-0.025em]",
              "text-slate-500",
            ].join(" ")}
          >
            편한 방법을 선택하면
            <br />
            바로 대화를 시작할 수 있어요.
          </p>

          {/* 작은 포인트 */}
          <div
            aria-hidden="true"
            className="mt-3 flex items-center gap-1.5"
          >
            <span className="h-1 w-7 rounded-full bg-[#3f7568]" />

            <span className="h-1 w-1 rounded-full bg-[#8eaaa2]" />
          </div>
        </section>

        {/* 방식 선택 카드 */}
        <section
          id="usage-guide"
          aria-label="대화 방식 선택"
          className={[
            "mx-auto",
            "mt-[clamp(20px,3dvh,30px)]",
            "flex",
            "w-full max-w-[365px]",
            "shrink-0",
            "scroll-mt-20",
            "flex-col",
            "gap-2.5",
          ].join(" ")}
        >
          {MODE_OPTIONS.map(
            (option) => (
              <ModeCard
                key={option.mode}
                option={option}
                onSelect={
                  onSelectMode
                }
              />
            ),
          )}
        </section>

        {/* 하단 장식 */}
        <footer className="mt-auto shrink-0 pb-1 pt-[clamp(14px,2.2dvh,24px)]">
          <BottomConnectionMark />
        </footer>
      </main>
    </div>
  );
}