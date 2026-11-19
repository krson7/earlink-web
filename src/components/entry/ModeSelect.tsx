"use client";

import { BrandMark, ModeIcon } from "@/components/Brand";
import BrailleDevice from "@/components/entry/BrailleDevice";
import type { DeviceSummary } from "@/components/entry/BrailleDevice";
import type { AccessibilityMode } from "@/types/chat";

type ModeSelectProps = {
  onSelectMode: (mode: AccessibilityMode) => void;
  device: DeviceSummary;
  showGuide: boolean;
  onDevicePress: () => void;
};

// 서버의 VISUAL 값은 그대로 두고 화면에서는 "음성" 모드로 쓴다.
const modes = [
  { mode: "VISUAL", title: "음성", english: "Voice", description: "말로 입력하고 받은 메시지를 소리로 듣기" },
  { mode: "HEARING", title: "수어", english: "Sign Language", description: "카메라로 지문자를 인식해 대화하기" },
  { mode: "STANDARD", title: "텍스트", english: "Text", description: "키보드로 입력해 대화하기" },
] as const;

export default function ModeSelect({ onSelectMode, device, showGuide, onDevicePress }: ModeSelectProps) {
  return (
    <main className="mode-select">
      <header className="entry-header"><BrandMark /><span className="brand-name">EarLink</span></header>
      <section className="mode-content" aria-labelledby="mode-heading">
        <p className="eyebrow">CHOOSE YOUR LANGUAGE</p>
        <h1 id="mode-heading">소통 방식을 선택하세요</h1>
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
      <BrailleDevice device={device} showGuide={showGuide} onPress={onDevicePress} />
    </main>
  );
}
