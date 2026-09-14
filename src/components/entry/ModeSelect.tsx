"use client";

import Image from "next/image";

type AccessibilityMode =
  | "VISUAL"
  | "HEARING"
  | "STANDARD";

type ModeSelectProps = {
  onSelectMode: (mode: AccessibilityMode) => void;
};

type ModeOption = {
  mode: AccessibilityMode;
  title: string;
  description: readonly [string, string];
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

    imageSrc: "/mode-icons/braille.png",

    imageAlt: "점자 여섯 점을 표현한 이미지",

    cardClassName:
      "border-[#efd7d3] bg-[#fff8f6]",

    iconClassName:
      "scale-[1.78]",
  },

  {
    mode: "HEARING",
    title: "수어로\n대화하기",

    description: [
      "카메라 제스처를 인식해",
      "문장으로 바꿔줘요.",
    ],

    imageSrc:
      "/mode-icons/sign-language.png",

    imageAlt:
      "두 손으로 수어를 표현한 이미지",

    cardClassName:
      "border-[#d8e9e1] bg-[#f4fbf7]",

    iconClassName:
      "scale-[1.72]",
  },

  {
    mode: "STANDARD",
    title: "텍스트로\n대화하기",

    description: [
      "키보드로 바로 입력해",
      "실시간으로 대화해요.",
    ],

    imageSrc:
      "/mode-icons/text.png",

    imageAlt:
      "텍스트 말풍선을 표현한 이미지",

    cardClassName:
      "border-[#dfdaf0] bg-[#f7f5ff]",

    iconClassName:
      "scale-[1.76]",
  },
] as const satisfies readonly ModeOption[];

/* ======================================================
   MENU ICON
====================================================== */

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-[22px] w-[22px]"
    >
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ======================================================
   MODE CARD
====================================================== */

function ModeCard({
  option,
  onSelect,
}: {
  option: ModeOption;
  onSelect: (mode: AccessibilityMode) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.mode)}
      className={[
        "group",
        "relative",

        "flex",
        "min-h-[188px]",
        "w-full",
        "flex-col",
        "items-center",

        "rounded-[23px]",
        "border",

        "px-2",
        "pb-4",
        "pt-3.5",

        "text-center",

        "shadow-[0_8px_26px_rgba(36,30,26,0.035)]",

        "transition",
        "duration-300",
        "ease-out",

        "hover:-translate-y-1",
        "hover:shadow-[0_13px_32px_rgba(36,30,26,0.07)]",

        "active:translate-y-0",
        "active:scale-[0.985]",

        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-[#a7adc4]",
        "focus-visible:ring-offset-2",

        option.cardClassName,
      ].join(" ")}
    >
      {/* 아이콘 */}
      <span
        className="
          relative
          flex
          h-[76px]
          w-[76px]
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
          sizes="76px"
          priority
          className={[
            "origin-center",
            "object-contain",

            "transition",
            "duration-300",

            option.iconClassName,
          ].join(" ")}
        />
      </span>

      {/* 제목 */}
      <span
        className="
          mt-2

          whitespace-pre-line

          text-[14px]
          font-black
          leading-[1.45]

          tracking-[-0.05em]

          text-[#111827]

          sm:text-[15px]
        "
      >
        {option.title}
      </span>

      {/* 설명 */}
      <span
        className="
          mt-3
          block

          text-[9.5px]
          font-medium
          leading-[1.65]

          tracking-[-0.025em]

          text-[#707787]

          sm:text-[10px]
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

        flex
        min-h-[100dvh]
        flex-col

        overflow-hidden

        bg-[#fffaf6]

        text-[#101827]
      "
    >
      {/* ==================================================
          BACKGROUND
      ================================================== */}

      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          inset-0
        "
      >
        <div
          className="
            absolute

            -left-[130px]
            top-[70px]

            h-[330px]
            w-[330px]

            rounded-full

            bg-[#fff0e9]/60

            blur-[100px]
          "
        />

        <div
          className="
            absolute

            -right-[150px]
            top-[240px]

            h-[360px]
            w-[360px]

            rounded-full

            bg-[#f6e7e4]/55

            blur-[100px]
          "
        />

        <div
          className="
            absolute

            bottom-[-180px]
            left-[5%]

            h-[340px]
            w-[340px]

            rounded-full

            bg-[#eaf6ef]/50

            blur-[100px]
          "
        />
      </div>

      {/* ==================================================
          HEADER
      ================================================== */}

      <header
        className="
          relative
          z-30
          shrink-0

          border-b
          border-[#eee7e1]

          bg-[#fffdf9]/95

          backdrop-blur-sm
        "
        style={{
          paddingTop:
            "env(safe-area-inset-top)",
        }}
      >
        <div
          className="
            flex
            h-[50px]

            items-center
            justify-between

            pl-0
            pr-4
          "
        >
          {/* =========================
              EarLink LOGO
          ========================== */}

          <a
            href="#mode-select-top"
            aria-label="EarLink 홈"
            className="
              relative

              -ml-2

              block

              h-[44px]
              w-[150px]

              shrink-0

              translate-x-[3px]
              translate-y-[2px]

              overflow-hidden
            "
          >
            <Image
              src="/earlink-header-logo.png"
              alt="EarLink"
              fill
              sizes="150px"
              priority
              className="
                origin-center

                scale-[1.03]

                object-cover
                object-center
              "
            />
          </a>

          {/* =========================
              오른쪽 HEADER
          ========================== */}

          <div
            className="
              flex
              shrink-0
              items-center

              gap-[18px]
            "
          >
            {/* 페이지는 아직 연결하지 않음 */}
            <nav
              aria-label="주요 메뉴"
              className="
                flex
                items-center

                gap-[22px]
              "
            >
              <span
                className="
                  cursor-default
                  select-none

                  whitespace-nowrap

                  text-[13px]
                  font-bold

                  tracking-[-0.035em]

                  text-[#1f2937]
                "
              >
                서비스 소개
              </span>

              <span
                className="
                  cursor-default
                  select-none

                  whitespace-nowrap

                  text-[13px]
                  font-bold

                  tracking-[-0.035em]

                  text-[#1f2937]
                "
              >
                이용 방법
              </span>
            </nav>

            {/* 메뉴 아이콘 - 아직 기능 없음 */}
            <button
              type="button"
              disabled
              aria-label="메뉴"
              aria-disabled="true"
              className="
                flex
                h-9
                w-9

                cursor-default

                items-center
                justify-center

                rounded-full

                text-[#1f2937]
              "
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>

      {/* ==================================================
          CONTENT
      ================================================== */}

      <main
        id="mode-select-top"
        className="
          relative
          z-10

          mx-auto

          flex
          w-full
          max-w-[430px]
          flex-1
          flex-col

          px-5
          pb-5
          pt-6
        "
      >
        {/* ==================================================
            HERO TEXT
        ================================================== */}

        <section
          className="
            relative
            z-20

            shrink-0
          "
        >
          <h1
            className="
              text-[29px]
              font-black

              leading-[1.17]

              tracking-[-0.065em]

              text-[#101827]

              sm:text-[32px]
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
              mt-3.5

              text-[13px]
              font-medium

              leading-[1.7]

              tracking-[-0.03em]

              text-[#626b79]

              sm:text-[13.5px]
            "
          >
            당신에게 맞는 방식으로,
            <br />

            더 편안하게 이어지는 대화.
          </p>
        </section>

        {/* ==================================================
            GIRL + SPEECH BUBBLE
        ================================================== */}

        <section
          aria-label="EarLink 소개 이미지"
          className="
            relative

            -mt-1

            h-[220px]
            w-full

            shrink-0

            sm:h-[228px]
          "
        >
          {/* =========================
              SPEECH BUBBLE
          ========================== */}

          <div
            className="
              absolute

              right-0
              top-0

              z-30

              w-[142px]

              rounded-[21px]

              border
              border-[#edd6cf]

              bg-[#fffaf7]/95

              px-4
              py-2.5

              shadow-[0_6px_20px_rgba(78,58,50,0.035)]

              sm:right-1
              sm:w-[148px]
            "
          >
            <p
              className="
                text-[10px]
                font-medium

                leading-[1.8]

                tracking-[-0.025em]

                text-[#624c43]

                sm:text-[10.5px]
              "
            >
              좋은 대화가
              <br />

              좋은 하루를 만들어요.
            </p>

            {/* 말풍선 꼬리 */}
            <span
              aria-hidden="true"
              className="
                absolute

                -bottom-[7px]
                left-[27px]

                h-[13px]
                w-[13px]

                rotate-45

                border-b
                border-r
                border-[#edd6cf]

                bg-[#fffaf7]
              "
            />
          </div>

          {/* =========================
              GIRL
          ========================== */}

          <div
            className="
              absolute

              bottom-[-2px]
              left-1/2

              h-[176px]
              w-[114%]

              -translate-x-1/2

              sm:h-[185px]
            "
          >
            <Image
              src="/girl.png"
              alt="대화를 기다리는 사람 일러스트"
              fill
              sizes="430px"
              priority
              className="
                object-contain
                object-bottom
              "
            />
          </div>
        </section>

        {/* ==================================================
            MODE SELECT
        ================================================== */}

        <section
          aria-label="대화 방식 선택"
          className="
            relative
            z-20

            -mt-1

            shrink-0
          "
        >
          <div
            className="
              grid
              grid-cols-3

              gap-2.5
            "
          >
            {MODE_OPTIONS.map(
              (option) => (
                <ModeCard
                  key={option.mode}
                  option={option}
                  onSelect={onSelectMode}
                />
              )
            )}
          </div>
        </section>

        {/* ==================================================
            FOOTER
        ================================================== */}

        <footer
          className="
            mt-auto

            pb-1
            pt-4

            text-center
          "
        >
          <p
            className="
              text-[9px]
              font-semibold

              uppercase

              tracking-[0.18em]

              text-[#b0acaa]
            "
          >
            Connect in your way
          </p>
        </footer>
      </main>
    </div>
  );
}