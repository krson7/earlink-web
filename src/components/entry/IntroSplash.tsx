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
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <main
        className="flex min-h-[100dvh] flex-col px-6"
        style={{
          paddingTop:
            "max(2rem, env(safe-area-inset-top))",
          paddingBottom:
            "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* 상단 문구 */}
        <header className="shrink-0 pt-10 text-center">
         <p className="text-[12px] font-black tracking-[0.23em] text-slate-700">
           EVERY WAY CONNECTS
         </p>
        </header>

        {/* 로고 및 진행 표시 */}
        <section className="flex flex-1 items-center justify-center">
          <div className="flex w-full -translate-y-20 flex-col items-center">
            {/* 로고 영역 */}
            <div className="relative flex h-[260px] w-full items-center justify-center">
              <Image
                src="/earlink-logo-transparent.png"
                alt="EarLink, 서로의 소리를 이어주세요"
                width={320}
                height={320}
                priority
                unoptimized
                className="h-auto w-[270px] max-w-none scale-[1.3] bg-transparent object-contain sm:w-[270px]"
                style={{
                  clipPath: "inset(3px 0 0 3px)",
                }}
              />
            </div>

            {/* 진행 표시 */}
            <div className="mt-4 w-full max-w-[290px]">
              <div
                role="progressbar"
                aria-label="EarLink 시작 준비 중"
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-[7px] overflow-hidden rounded-full bg-slate-100"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-400 transition-[width] ease-out"
                  style={{
                    width: progressStarted
                      ? "100%"
                      : "8%",
                    transitionDuration: "1600ms",
                  }}
                />
              </div>

              {/* 진행 상태 점 */}
              <div
                aria-hidden="true"
                className="mt-5 flex items-center justify-center gap-2"
              >
                <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                <span className="h-2 w-2 rounded-full bg-orange-400" />
              </div>

              <p
                aria-live="polite"
                className="mt-4 text-center text-[12px] font-medium tracking-[-0.01em] text-slate-400"
              >
                대화를 연결하고 있어요
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}