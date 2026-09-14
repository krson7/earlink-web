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

          <Image
            src="/earlink-logo-transparent.png"
            alt="EarLink"
            width={320}
            height={320}
            priority
            unoptimized
            className="
              h-auto
              w-[245px]
              max-w-none
              bg-transparent
              object-contain

              sm:w-[250px]
            "
          />

          {/* =========================================
              LOADING BAR
          ========================================== */}

          <div
            className="
              mt-7
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
                bg-[#eeeae5]
              "
            >
              <div
                className="
                  h-full
                  rounded-full

                  bg-gradient-to-r
                  from-[#f2a093]
                  via-[#c5aa99]
                  to-[#9eafa3]

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