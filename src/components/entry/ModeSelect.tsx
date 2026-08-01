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
  accentClassName: string;
  arrowClassName: string;
  focusClassName: string;
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
      "scale-[1.72]",
    accentClassName:
      "bg-violet-600",
    arrowClassName:
      "bg-violet-100/70 text-violet-600 group-hover:bg-violet-100",
    focusClassName:
      "focus-visible:ring-violet-400",
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
      "scale-[1.63]",
    accentClassName:
      "bg-pink-500",
    arrowClassName:
      "bg-pink-100/70 text-pink-500 group-hover:bg-pink-100",
    focusClassName:
      "focus-visible:ring-pink-400",
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
      "scale-[1.68]",
    accentClassName:
      "bg-blue-500",
    arrowClassName:
      "bg-blue-100/70 text-blue-500 group-hover:bg-blue-100",
    focusClassName:
      "focus-visible:ring-blue-400",
  },
] as const satisfies readonly ModeOption[];

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-[18px] w-[18px]"
    >
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TopLeftDecoration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 190 170"
      fill="none"
      className="pointer-events-none absolute -left-7 top-[68px] h-[152px] w-[174px]"
    >
      <path
        d="M2 148C54 149 117 116 153 51"
        stroke="#7C3AED"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 10"
      />

      <circle
        cx="153"
        cy="51"
        r="5"
        fill="#7C3AED"
      />

      <circle
        cx="153"
        cy="31"
        r="3"
        fill="#8B5CF6"
      />
    </svg>
  );
}

function TopRightDecoration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 170 185"
      fill="none"
      className="pointer-events-none absolute -right-8 top-[100px] h-[164px] w-[150px]"
    >
      <path
        d="M34 41C38 99 86 143 165 156"
        stroke="#F9A8D4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 10"
      />

      <circle
        cx="34"
        cy="41"
        r="5"
        fill="#F9A8D4"
      />

      <circle
        cx="29"
        cy="21"
        r="3"
        fill="#FBCFE8"
      />
    </svg>
  );
}

function LeftWaveDecoration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 92 390"
      fill="none"
      className="pointer-events-none absolute -left-6 top-[31%] h-[285px] w-[82px] opacity-35"
    >
      <path
        d="M45 8C80 78 4 134 39 202C71 264 43 324 3 383"
        stroke="url(#left-wave-primary)"
        strokeWidth="1.15"
        strokeLinecap="round"
      />

      <path
        d="M63 13C88 86 25 145 56 209C84 267 64 328 22 382"
        stroke="url(#left-wave-secondary)"
        strokeWidth="0.95"
        strokeLinecap="round"
      />

      <circle
        cx="40"
        cy="34"
        r="4.5"
        fill="#A78BFA"
      />

      <circle
        cx="35"
        cy="61"
        r="2.8"
        fill="#C4B5FD"
      />

      <defs>
        <linearGradient
          id="left-wave-primary"
          x1="10"
          y1="8"
          x2="72"
          y2="383"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#A78BFA" />

          <stop
            offset="1"
            stopColor="#F9A8D4"
          />
        </linearGradient>

        <linearGradient
          id="left-wave-secondary"
          x1="35"
          y1="8"
          x2="58"
          y2="383"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F0ABFC" />

          <stop
            offset="1"
            stopColor="#C4B5FD"
          />
        </linearGradient>
      </defs>
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
        className="h-[22px] w-9"
      >
        <path
          d="M10 7.5 19 16M29 8l-10 8"
          stroke="#7C3AED"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <circle
          cx="8"
          cy="6"
          r="4"
          fill="white"
          stroke="#7C3AED"
          strokeWidth="2.5"
        />

        <circle
          cx="20"
          cy="18"
          r="4"
          fill="white"
          stroke="#7C3AED"
          strokeWidth="2.5"
        />

        <circle
          cx="31"
          cy="7"
          r="4"
          fill="white"
          stroke="#7C3AED"
          strokeWidth="2.5"
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
        "group relative flex h-[clamp(100px,13.5dvh,112px)] w-full items-center overflow-hidden",
        "rounded-[23px] border border-white/90 bg-white/90 px-3 py-2 text-left",
        "shadow-[0_10px_26px_rgba(67,45,94,0.06)] backdrop-blur-sm",
        "transition duration-200 ease-out",
        "hover:-translate-y-0.5 hover:bg-white",
        "hover:shadow-[0_14px_30px_rgba(67,45,94,0.09)]",
        "active:translate-y-0 active:scale-[0.985]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        option.focusClassName,
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "absolute inset-y-0 left-0 w-[5px]",
          option.accentClassName,
        ].join(" ")}
      />

      <span className="relative ml-1 h-[clamp(88px,11.5dvh,98px)] w-[clamp(88px,11.5dvh,98px)] shrink-0 overflow-hidden rounded-[19px]">
        <Image
          src={option.imageSrc}
          alt={option.imageAlt}
          fill
          sizes="98px"
          priority
          className={[
            "origin-center object-contain",
            option.imageClassName,
          ].join(" ")}
        />
      </span>

      <span className="ml-3 min-w-0 flex-1">
        <span className="block text-[15px] font-black leading-tight tracking-[-0.035em] text-[#07345f]">
          {option.title}
        </span>

        <span
          id={descriptionId}
          className="mt-1.5 block text-[10.5px] font-medium leading-[1.65] tracking-[-0.025em] text-[#234f76]"
        >
          <span className="block">
            {option.description[0]}
          </span>

          <span className="block">
            {option.description[1]}
          </span>
        </span>
      </span>

      <span
        aria-hidden="true"
        className={[
          "mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          "transition duration-200",
          "group-hover:translate-x-0.5",
          "group-active:scale-95",
          option.arrowClassName,
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
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#fcfbff]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(249,246,255,0.28) 100%)",
        }}
      />

      {/* 왼쪽 위 배경 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[78px] top-[28px] h-[178px] w-[178px] rounded-full bg-violet-100/65"
      />

      {/* 오른쪽 위 배경 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[95px] top-[78px] h-[205px] w-[205px] rounded-full bg-pink-100/60"
      />

      {/* 왼쪽 아래 배경 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[150px] -left-[145px] h-[245px] w-[245px] rounded-full bg-violet-100/65"
      />

      {/* 오른쪽 아래 배경 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[155px] -right-[145px] h-[250px] w-[250px] rounded-full bg-pink-100/60"
      />

      <TopLeftDecoration />
      <TopRightDecoration />
      <LeftWaveDecoration />

      {/* 헤더 */}
      <header
        className="relative z-30 shrink-0 border-b border-slate-100/90 bg-white/90 backdrop-blur-sm"
        style={{
          paddingTop:
            "env(safe-area-inset-top)",
        }}
      >
        <div className="flex h-[50px] items-center justify-between pl-0 pr-4">
          <a
            href="#mode-select-top"
            aria-label="EarLink 처음으로 이동"
            className="relative -ml-2 block h-[44px] w-[150px] translate-y-[2px] shrink-0 overflow-hidden"
          >
            <Image
              src="/earlink-header-logo.png"
              alt="EarLink"
              fill
              sizes="178px"
              priority
              className="origin-center scale-[1.03] object-cover object-center"
            />
          </a>

          <nav
            aria-label="주요 메뉴"
            className="flex shrink-0 items-center gap-4"
          >
            <a
              href="#service-intro"
              className="whitespace-nowrap text-[12px] font-black tracking-[-0.03em] text-[#07345f] transition hover:text-violet-600"
            >
              서비스 소개
            </a>

            <a
              href="#usage-guide"
              className="whitespace-nowrap text-[12px] font-black tracking-[-0.03em] text-[#07345f] transition hover:text-violet-600"
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
          className="shrink-0 scroll-mt-20 pt-[clamp(20px,3.4dvh,34px)] text-center"
        >
          <h1 className="text-[clamp(29px,4.25dvh,34px)] font-black leading-[1.18] tracking-[-0.06em] text-[#07345f]">
            나에게 맞는
            <br />

            <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
              대화 방식
            </span>
            을
            <br />

            선택해 주세요
          </h1>

          <p className="mt-[clamp(10px,1.8dvh,16px)] text-[13px] font-medium leading-[1.65] tracking-[-0.03em] text-[#234f76]">
            편한 방법을 선택하면
            <br />
            바로 대화를 시작할 수 있어요.
          </p>
        </section>

        {/* 방식 선택 카드 */}
        <section
          id="usage-guide"
          aria-label="대화 방식 선택"
          className="mx-auto mt-[clamp(16px,2.7dvh,26px)] flex w-full max-w-[365px] shrink-0 scroll-mt-20 flex-col gap-2.5"
        >
          {MODE_OPTIONS.map((option) => (
            <ModeCard
              key={option.mode}
              option={option}
              onSelect={onSelectMode}
            />
          ))}
        </section>

        {/* 남는 공간 안에서 하단 장식 배치 */}
        <footer className="mt-auto shrink-0 pb-1 pt-[clamp(12px,2dvh,22px)]">
          <BottomConnectionMark />
        </footer>
      </main>
    </div>
  );
}