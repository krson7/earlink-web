"use client";

import { BrandMark, ModeIcon } from "@/components/Brand";
import type { AccessibilityMode } from "@/types/chat";

const modes = [
  { mode: "VISUAL", title: "점자", english: "Braille", description: "점자 기기와 연결해 대화하기" },
  { mode: "HEARING", title: "수어", english: "Sign Language", description: "카메라로 지문자를 인식해 대화하기" },
  { mode: "STANDARD", title: "텍스트", english: "Text", description: "키보드로 입력해 대화하기" },
] as const;

function BrailleDevice() {
  return (
    <div className="device-scene" aria-hidden="true">
      <div className="device-light" />
      <div className="braille-device">
        <div className="device-keys">
          {[0, 1, 2].map((key) => <i key={key} />)}
          <i className="device-space" />
          {[3, 4, 5].map((key) => <i key={key} />)}
        </div>
        <div className="device-cells">
          {[0, 1, 2, 3].map((cell) => <span key={cell}>{[0, 1, 2, 3, 4, 5].map((dot) => <i key={dot} />)}</span>)}
        </div>
        <div className="device-port" />
      </div>
    </div>
  );
}

export default function ModeSelect({ onSelectMode }: { onSelectMode: (mode: AccessibilityMode) => void }) {
  return (
    <main className="mode-select">
      <header className="entry-header"><BrandMark /><span className="brand-name">EarLink</span></header>
      <section className="mode-content" aria-labelledby="mode-heading">
        <p className="eyebrow">CHOOSE YOUR LANGUAGE</p>
        <h1 id="mode-heading">당신의 언어를 선택하세요</h1>
        <div className="mode-options" aria-label="대화 방식 선택">
          {modes.map(({ mode, title, english, description }) => (
            <button key={mode} type="button" onClick={() => onSelectMode(mode)} className="mode-card" aria-label={`${title} · ${description}`}>
              <span className="mode-card-icon"><ModeIcon mode={mode} /></span>
              <span className="mode-card-label"><strong>{title}</strong><span>{english}</span></span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="mode-chevron"><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      </section>
      <BrailleDevice />
    </main>
  );
}
