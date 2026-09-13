"use client";

import Image from "next/image";

type AccessibilityMode =
  | "VISUAL"
  | "HEARING"
  | "STANDARD";

type ModeSelectProps = {
  onSelectMode: (
    mode: AccessibilityMode
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

  cardClassName: string;
  iconClassName: string;
};

const MODE_OPTIONS = [
  {
    mode: "VISUAL",
    title: "점자로\n대화하기",

    description: [
      "점자 기기와 연결해",
      "메시지를 주고받아요.",
    ],

    imageSrc:
      "/mode-icons/braille.png",

    imageAlt:
      "점자 여섯 점을 표현한 이미지",

    cardClassName:
      "border-[#f4d9d6] bg-[linear-gradient(180deg,#fff9f8_0%,#fdf0ef_100%)]",

    iconClassName:
      "scale-[1.48]",
  },

  {
    mode: "HEARING",
    title: "수어로\n대화하기",

    description: [
      "카메라로 제스처를 인식해",
      "자연스럽게 문장으로 바꿔줘요.",
    ],

    imageSrc:
      "/mode-icons/sign-language.png",

    imageAlt:
      "두 손으로 수어를 표현한 이미지",

    cardClassName:
      "border-[#dcece4] bg-[linear-gradient(180deg,#f8fdfa_0%,#edf8f1_100%)]",

    iconClassName:
      "scale-[1.42]",
  },

  {
    mode: "STANDARD",
    title: "텍스트로\n대화하기",

    description: [
      "키보드로 바로 입력하고",
      "실시간으로 이야기를 나눠요.",
    ],

    imageSrc:
      "/mode-icons/text.png",

    imageAlt:
      "텍스트 말풍선을 표현한 이미지",

    cardClassName:
      "border-[#e4def4] bg-[linear-gradient(180deg,#faf9ff_0%,#f1effc_100%)]",

    iconClassName:
      "scale-[1.46]",
  },
] as const satisfies readonly ModeOption[];

/* ======================================================
   메뉴 아이콘
====================================================== */

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-6 w-6"
    >
      <path
        d="M4 6.5h16M4 12h16M4 17.5h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ======================================================
   방식 선택 카드
====================================================== */

function ModeCard({
  option,
  onSelect,
}: {
  option: ModeOption;

  onSelect: (
    mode: AccessibilityMode
  ) => void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onSelect(option.mode)
      }
      className={[
        "group",
        "relative",
        "flex",
        "min-h-[230px]",
        "flex-col",
        "items-center",
        "rounded-[26px]",
        "border",
        "px-2.5",
        "pb-5",
        "pt-5",
        "text-center",
        "shadow-[0_12px_35px_rgba(53,42,36,0.045)]",
        "transition",
        "duration-300",
        "ease-out",

        "hover:-translate-y-1",
        "hover:shadow-[0_18px_42px_rgba(53,42,36,0.08)]",

        "active:translate-y-0",
        "active:scale-[0.985]",

        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-[#a8a0d8]",

        option.cardClassName,
      ].join(" ")}
    >
      {/* 아이콘 */}
      <span
        className="
          relative
          flex
          h-[66px]
          w-[66px]
          shrink-0
          items-center
          justify-center
          overflow-hidden
        "
      >
        <Image
          src={option.imageSrc}
          alt={option.imageAlt}
          fill
          sizes="66px"
          priority
          className={[
            "object-contain",
            "transition",
            "duration-300",
            "group-hover:scale-[1.06]",

            option.iconClassName,
          ].join(" ")}
        />
      </span>

      {/* 제목 */}
      <span
        className="
          mt-3
          whitespace-pre-line
          text-[15px]
          font-black
          leading-[1.5]
          tracking-[-0.045em]
          text-[#141c2c]
          sm:text-[16px]
        "
      >
        {option.title}
      </span>

      {/* 설명 */}
      <span
        className="
          mt-4
          block
          text-[10.5px]
          font-medium
          leading-[1.75]
          tracking-[-0.025em]
          text-[#667085]
          sm:text-[11px]
        "
      >
        <span className="block">
          {option.description[0]}
        </span>

        <span className="block">
          {option.description[1]}
        </span>
      </span>
    </button>
  );
}

/* ======================================================
   MAIN
====================================================== */

export default function ModeSelect({
  onSelectMode,
}: ModeSelectProps) {
  return (
    <div
      className="
        relative
        min-h-[100dvh]
        overflow-hidden
        bg-[#fffaf6]
        text-[#111827]
      "
    >
      {/* =========================
          전체 배경 분위기
      ========================== */}

      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          inset-0
        "
      >
        {/* 왼쪽 위 */}
        <div
          className="
            absolute
            -left-24
            -top-24
            h-[300px]
            w-[300px]
            rounded-full
            bg-[#fff1ec]/80
            blur-[85px]
          "
        />

        {/* 오른쪽 */}
        <div
          className="
            absolute
            -right-24
            top-[250px]
            h-[320px]
            w-[320px]
            rounded-full
            bg-[#f8e9e7]/65
            blur-[85px]
          "
        />

        {/* 아래 민트 */}
        <div
          className="
            absolute
            bottom-[-130px]
            left-[20%]
            h-[300px]
            w-[300px]
            rounded-full
            bg-[#ecf7f1]/70
            blur-[90px]
          "
        />
      </div>

      {/* =========================
          HEADER
      ========================== */}

      <header
        className="
          relative
          z-30
          border-b
          border-[#efe9e4]
          bg-[#fffdfb]/90
          backdrop-blur-xl
        "
        style={{
          paddingTop:
            "env(safe-area-inset-top)",
        }}
      >
        <div
          className="
            mx-auto
            flex
            h-[64px]
            w-full
            max-w-[1100px]
            items-center
            justify-between
            px-5
            sm:px-7
          "
        >
          {/* EarLink 로고 */}
          <a
            href="#mode-select-top"
            className="
              relative
              block
              h-[46px]
              w-[146px]
              shrink-0
            "
            aria-label="EarLink 홈"
          >
            <Image
              src="/earlink-header-logo.png"
              alt="EarLink"
              fill
              sizes="146px"
              priority
              className="
                object-contain
                object-left
              "
            />
          </a>

          <div
            className="
              flex
              items-center
              gap-5
            "
          >
            <nav
              aria-label="주요 메뉴"
              className="
                hidden
                items-center
                gap-6
                sm:flex
              "
            >
              <a
                href="#service-intro"
                className="
                  whitespace-nowrap
                  text-[13px]
                  font-bold
                  tracking-[-0.03em]
                  text-[#182033]
                  transition
                  hover:text-[#4b8b79]
                "
              >
                서비스 소개
              </a>

              <a
                href="#usage-guide"
                className="
                  whitespace-nowrap
                  text-[13px]
                  font-bold
                  tracking-[-0.03em]
                  text-[#182033]
                  transition
                  hover:text-[#4b8b79]
                "
              >
                이용 방법
              </a>
            </nav>

            <button
              type="button"
              aria-label="메뉴"
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                text-[#182033]
                transition
                hover:bg-black/[0.04]
              "
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>

      {/* =========================
          CONTENT
      ========================== */}

      <main
        id="mode-select-top"
        className="
          relative
          z-10
          mx-auto
          w-full
          max-w-[470px]
          px-5
          pb-10
          pt-9
          sm:px-6
          sm:pt-11
        "
      >
        {/* =========================
            HERO TEXT
        ========================== */}

        <section
          id="service-intro"
          className="
            relative
            z-20
          "
        >
          <h1
            className="
              text-[38px]
              font-black
              leading-[1.18]
              tracking-[-0.07em]
              text-[#101827]
              sm:text-[43px]
            "
          >
            오늘,
            <br />

            어떤 대화를
            <br />

            시작해 볼까요?
          </h1>

          <p
            className="
              mt-5
              text-[15px]
              font-medium
              leading-[1.75]
              tracking-[-0.035em]
              text-[#626873]
              sm:text-[16px]
            "
          >
            당신에게 맞는 방식으로,
            <br />

            더 편안하게 이어지는 대화.
          </p>
        </section>

        {/* =========================
            GIRL ILLUSTRATION
        ========================== */}

        <section
          aria-label="EarLink 소개 이미지"
          className="
            relative
            mt-2
            h-[300px]
            w-full
            sm:h-[325px]
          "
        >
          {/* 말풍선 */}
          <div
            className="
              absolute
              right-0
              top-4
              z-20
              rounded-[28px]
              border
              border-[#eed9d2]
              bg-[#fffaf7]/95
              px-5
              py-4
              shadow-[0_8px_25px_rgba(78,58,50,0.035)]
            "
          >
            <p
              className="
                rotate-[-2deg]
                text-[12px]
                font-medium
                leading-6
                tracking-[-0.03em]
                text-[#594c46]
                sm:text-[13px]
              "
            >
              좋은 대화가
              <br />

              좋은 하루를 만들어요.
            </p>

            {/* 말풍선 꼬리 */}
            <span
              className="
                absolute
                -bottom-[8px]
                left-7
                h-4
                w-4
                rotate-45
                border-b
                border-r
                border-[#eed9d2]
                bg-[#fffaf7]
              "
            />
          </div>

          {/* 여자 이미지 */}
          <div
            className="
              absolute
              bottom-[-8px]
              left-1/2
              h-[245px]
              w-[112%]
              -translate-x-1/2
              sm:h-[270px]
            "
          >
            <Image
              src="/girl.png"
              alt="대화를 기다리는 사람 일러스트"
              fill
              sizes="470px"
              priority
              className="
                object-contain
                object-bottom
              "
            />
          </div>
        </section>

        {/* =========================
            MODE CARDS
        ========================== */}

        <section
          id="usage-guide"
          aria-label="대화 방식 선택"
          className="
            relative
            z-20
            -mt-2
          "
        >
          <div
            className="
              grid
              grid-cols-3
              gap-2.5
              sm:gap-3
            "
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
              )
            )}
          </div>
        </section>

        {/* 하단 문구 */}
        <footer
          className="
            pb-2
            pt-8
            text-center
          "
        >
          <p
            className="
              text-[10px]
              font-semibold
              uppercase
              tracking-[0.18em]
              text-[#a1a1aa]
            "
          >
            Connect in your way
          </p>
        </footer>
      </main>
    </div>
  );
}