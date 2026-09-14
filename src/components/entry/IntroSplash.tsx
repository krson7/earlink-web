"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export default function IntroSplash() {
  const [progressStarted, setProgressStarted] =
    useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProgressStarted(true);
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main
      className="
        flex
        min-h-[100dvh]
        flex-col
        bg-[#fffdf9]
        px-6
      "
      style={{
        paddingTop:
          "max(2rem, env(safe-area-inset-top))",
        paddingBottom:
          "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* 로고 + 진행 표시 전체 영역 */}
      <section className="flex flex-1 items-center justify-center">
        <div className="flex w-full -translate-y-10 flex-col items-center">

          {/* =========================================
              INTRO LOGO
              - 기존보다 크게
              - Connect in your way 영역 숨김
          ========================================== */}
          <div
            className="
              relative
              h-[150px]
              w-[250px]
              overflow-hidden
            "
          >
            <Image
              src="/earlink-logo-transparent.png"
              alt="EarLink"
              width={320}
              height={320}
              priority
              unoptimized
              className="
                absolute
                left-1/2
                top-0

                h-auto
                w-[235px]
                max-w-none

                -translate-x-1/2

                bg-transparent
                object-contain
              "
              style={{
                /*
                 * PNG 내부의
                 * Connect in your way 부분을 잘라냄.
                 */
                clipPath:
                  "inset(0 0 18% 0)",
              }}
            />

            {/* tagline 부분을 배경색으로 한번 더 가림 */}
            <div
              aria-hidden="true"
              className="
                pointer-events-none
                absolute
                bottom-0
                left-0
                right-0
                h-[25px]
                bg-[#fffdf9]
              "
            />
          </div>

          {/* 진행 표시 */}
          <div className="-mt-2 w-full max-w-[260px]">

            {/* 로딩 바 */}
            <div
              role="progressbar"
              aria-label="EarLink 시작 준비 중"
              aria-valuemin={0}
              aria-valuemax={100}
              className="
                h-[6px]
                overflow-hidden
                rounded-full
                bg-slate-100
              "
            >
              <div
                className="
                  h-full
                  rounded-full

                  bg-gradient-to-r
                  from-slate-950
                  via-slate-700
                  to-slate-500

                  transition-[width]
                  ease-out
                "
                style={{
                  width: progressStarted
                    ? "100%"
                    : "8%",
                  transitionDuration:
                    "1600ms",
                }}
              />
            </div>

            {/* 진행 상태 점 */}
            <div
              aria-hidden="true"
              className="
                mt-5
                flex
                items-center
                justify-center
                gap-2
              "
            >
              <span className="h-2 w-2 rounded-full bg-slate-900" />

              <span className="h-2 w-2 rounded-full bg-slate-600" />

              <span className="h-2 w-2 rounded-full bg-slate-400" />
            </div>

            {/* 진행 상태 문구 */}
            <p
              aria-live="polite"
              className="
                mt-4
                text-center

                text-[12px]
                font-medium

                tracking-[-0.01em]

                text-slate-500
              "
            >
              대화를 연결하고 있어요
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}