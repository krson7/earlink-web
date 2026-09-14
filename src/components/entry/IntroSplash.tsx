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
      {/* =========================================
          SPLASH CONTENT
      ========================================== */}

      <section
        className="
          flex
          flex-1
          items-center
          justify-center
        "
      >
        <div
          className="
            flex
            w-full

            -translate-y-10

            flex-col
            items-center
          "
        >
          {/* =========================================
              INTRO LOGO
          ========================================== */}

          <div
            className="
              relative

              h-[150px]
              w-[260px]

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
                w-[245px]
                max-w-none

                -translate-x-1/2

                bg-transparent
                object-contain
              "
              style={{
                /*
                 * PNG 안에 포함된
                 * Connect in your way 부분 숨김
                 */
                clipPath:
                  "inset(0 0 18% 0)",
              }}
            />

            {/* tagline 하단 영역을 완전히 덮음 */}
            <div
              aria-hidden="true"
              className="
                pointer-events-none

                absolute

                bottom-0
                left-0
                right-0

                h-[24px]

                bg-[#fffdf9]
              "
            />
          </div>

          {/* =========================================
              LOADING BAR
          ========================================== */}

          <div
            className="
              mt-5

              w-full
              max-w-[260px]
            "
          >
            <div
              role="progressbar"
              aria-label="EarLink 시작 준비 중"
              aria-valuemin={0}
              aria-valuemax={100}
              className="
                h-[6px]
                w-full

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
          </div>
        </div>
      </section>
    </main>
  );
}