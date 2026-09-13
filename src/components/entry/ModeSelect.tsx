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

/* ======================================================
   대화 방식
====================================================== */

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
      "border-[#f0d7d2] bg-[#fff8f6]",

    iconClassName:
      "scale-[1.5]",
  },

  {
    mode: "HEARING",

    title: "수어로\n대화하기",

    description: [
      "카메라로 제스처를 인식해",
      "문장으로 바꿔줘요.",
    ],

    imageSrc:
      "/mode-icons/sign-language.png",

    imageAlt:
      "두 손으로 수어를 표현한 이미지",

    cardClassName:
      "border-[#d9e9e1] bg-[#f4fbf7]",

    iconClassName:
      "scale-[1.43]",
  },

  {
    mode: "STANDARD",

    title: "텍스트로\n대화하기",

    description: [
      "키보드로 바로 입력하고",
      "실시간으로 이야기해요.",
    ],

    imageSrc:
      "/mode-icons/text.png",

    imageAlt:
      "텍스트 말풍선을 표현한 이미지",

    cardClassName:
      "border-[#dfdaf0] bg-[#f7f5ff]",

    iconClassName:
      "scale-[1.48]",
  },
] as const satisfies readonly ModeOption[];

/* ======================================================
   햄버거 아이콘
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
   카드
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
        "min-h-[190px]",
        "w-full",
        "flex-col",
        "items-center",
        "rounded-[24px]",
        "border",
        "px-2",
        "pb-4",
        "pt-4",
        "text-center",

        "shadow-[0_8px_28px_rgba(36,30,26,0.035)]",

        "transition",
        "duration-300",
        "ease-out",

        "hover:-translate-y-1",
        "hover:shadow-[0_13px_34px_rgba(36,30,26,0.07)]",

        "active:translate-y-0",
        "active:scale-[0.985]",

        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-[#9fa9c4]",
        "focus-visible:ring-offset-2",

        option.cardClassName,
      ].join(" ")}
    >
      {/* 아이콘 */}
      <span
        className="
          relative
          flex
          h-[58px]
          w-[58px]
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
          sizes="58px"
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
          mt-3
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
          text-[#6f7685]

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

      {/* 아래 작은 포인트 */}
      <span
        aria-hidden="true"
        className="
          absolute
          bottom-3.5
          h-[3px]
          w-[18px]
          rounded-full
          bg-current
          opacity-0
          transition

          group-hover:opacity-[0.16]
        "
      />
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
          배경
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
            top-[80px]
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
            top-[260px]
            h-[370px]
            w-[370px]
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
          기존 EarLink 위치 유지
      ================================================== */}

      <header
        className="
          relative
          z-30
          shrink-0
          border-b
          border-slate-100/90
          bg-white/92
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
          {/* EarLink 로고 */}
          <a
            href="#mode-select-top"
            aria-label="EarLink 홈"
            className="
              relative
              -ml-2
              block
              h-[44px]
              w-[150px]
              translate-x-[3px]
              translate-y-[2px]
              shrink-0
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

          {/* 오른쪽 */}
          <div
            className="
              flex
              shrink-0
              items-center
              gap-4
            "
          >
            <nav
              aria-label="주요 메뉴"
              className="
                flex
                shrink-0
                items-center
                gap-4
              "
            >
              <a
                href="#service-intro"
                className="
                  whitespace-nowrap
                  text-[12px]
                  font-black
                  tracking-[-0.03em]
                  text-slate-800
                  transition
                  hover:text-[#3f7568]
                "
              >
                서비스 소개
              </a>

              <a
                href="#usage-guide"
                className="
                  whitespace-nowrap
                  text-[12px]
                  font-black
                  tracking-[-0.03em]
                  text-slate-800
                  transition
                  hover:text-[#3f7568]
                "
              >
                이용 방법
              </a>
            </nav>

            <button
              type="button"
              aria-label="메뉴 열기"
              className="
                ml-1
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-full
                text-slate-800
                transition
                hover:bg-slate-100
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
          pt-7
        "
      >
        {/* ==================================================
            HERO COPY
        ================================================== */}

        <section
          id="service-intro"
          className="
            relative
            z-20
            shrink-0
          "
        >
          <h1
            className="
              text-[31px]
              font-black
              leading-[1.16]
              tracking-[-0.065em]
              text-[#101827]

              sm:text-[34px]
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
              mt-4
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
            ILLUSTRATION

            이전보다 확실히 위로 올림
        ================================================== */}

        <section
          aria-label="EarLink 소개 이미지"
          className="
            relative
            -mt-2
            h-[235px]
            w-full
            shrink-0

            sm:h-[250px]
          "
        >
          {/* 말풍선 */}
          <div
            className="
              absolute
              right-0
              top-[22px]
              z-20

              rounded-[24px]
              border
              border-[#efd8d1]

              bg-[#fffaf7]/95

              px-4
              py-3

              shadow-[0_6px_22px_rgba(78,58,50,0.035)]
            "
          >
            <p
              className="
                text-[10.5px]
                font-medium
                leading-[1.8]
                tracking-[-0.025em]
                text-[#645047]

                sm:text-[11px]
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
                -bottom-[7px]
                left-9

                h-[14px]
                w-[14px]

                rotate-45

                border-b
                border-r
                border-[#efd8d1]

                bg-[#fffaf7]
              "
            />
          </div>

          {/* girl.png */}
          <div
            className="
              absolute
              bottom-[-2px]
              left-1/2

              h-[215px]
              w-[116%]

              -translate-x-1/2

              sm:h-[230px]
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

            기존보다 위로 당김
        ================================================== */}

        <section
          id="usage-guide"
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
                  onSelect={
                    onSelectMode
                  }
                />
              )
            )}
          </div>
        </section>

        {/* 하단 */}
        <footer
          className="
            mt-auto
            pb-1
            pt-5
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