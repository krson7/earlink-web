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
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-white">
      {/* 왼쪽 위 배경 장식 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-32 h-96 w-96 rounded-full bg-fuchsia-100/75 blur-3xl"
      />

      {/* 오른쪽 아래 배경 장식 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-32 h-[420px] w-[420px] rounded-full bg-orange-100/75 blur-3xl"
      />

      {/* 중앙 배경 장식 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[35%] h-64 w-64 -translate-x-1/2 rounded-full bg-fuchsia-50/50 blur-3xl"
      />

      <main
        className="relative z-10 flex min-h-[100dvh] flex-col px-6"
        style={{
          paddingTop:
            "max(2rem, env(safe-area-inset-top))",
          paddingBottom:
            "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* 상단 문구 */}
        <header className="shrink-0 pt-10 text-center">
          <p className="text-[12px] font-black tracking-[0.23em] text-fuchsia-500">
            EVERY WAY CONNECTS
          </p>
        </header>

        {/* 로고 및 진행 표시 */}
        <section className="flex flex-1 items-center justify-center">
          {/* 기존 -translate-y-16에서 조금 더 위로 이동 */}
          <div className="flex w-full -translate-y-20 flex-col items-center">
            {/* 로고 영역 */}
            <div className="relative flex h-[260px] w-full items-center justify-center overflow-visible">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute h-56 w-56 rounded-full bg-fuchsia-200/35 blur-3xl"
              />

              <Image
                src="/earlink-logo-transparent.png"
                alt="EarLink, 서로의 소리를 이어주세요"
                width={320}
                height={320}
                priority
                unoptimized
                className="relative z-10 h-auto w-[270px] max-w-none scale-[1.3] bg-transparent object-contain sm:w-[270px]"
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

        {/* 하단 메시지 */}
        <footer className="mt-6 shrink-0">
          <div className="mx-auto w-[86%] max-w-[330px] rounded-[22px] border border-fuchsia-100 bg-white/75 px-4 py-2 text-center shadow-[0_10px_28px_rgba(217,70,239,0.07)] backdrop-blur-sm">
            <div
              aria-hidden="true"
              className="mx-auto mb-1.5 flex items-center justify-center gap-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />

              <span className="h-px w-6 bg-gradient-to-r from-fuchsia-300 to-rose-300" />

              <span className="text-[13px] text-rose-400">
                ♥
              </span>

              <span className="h-px w-6 bg-gradient-to-r from-rose-300 to-orange-300" />

              <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            </div>

            <p className="text-[13px] font-semibold leading-5 tracking-[-0.015em] text-slate-700">
              서로 다른 방식도
              <br />
              마음은 같은 곳에 닿을 수 있어요.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}