"use client";

import { BrandMark } from "@/components/Brand";

export default function IntroSplash() {
  return (
    <main className="intro-splash">
      <section className="splash-content">
        <div className="splash-icon"><BrandMark /></div>
        <h1>EarLink</h1>
        <p>서로의 방식으로, 하나의 대화</p>
        <div role="progressbar" aria-label="EarLink 시작 준비 중" aria-valuemin={0} aria-valuemax={100} className="splash-progress"><span /></div>
      </section>
      <p className="splash-footer">CONNECT IN YOUR WAY</p>
    </main>
  );
}
