"use client";

import { ModeIcon } from "@/components/Brand";
import type { AccessibilityMode } from "@/types/chat";

type ChatHeaderProps = {
  chatConnected: boolean;
  chatStatus: string;
  accessibilityMode: AccessibilityMode;
  onLeave: () => void;
};

export default function ChatHeader({ chatConnected, chatStatus, accessibilityMode, onLeave }: ChatHeaderProps) {
  const label = accessibilityMode === "VISUAL" ? "Braille" : accessibilityMode === "HEARING" ? "Sign" : "Text";
  return (
    <header className="chat-header">
      <button type="button" onClick={onLeave} aria-label="서비스 선택 화면으로 돌아가기" className="soft-circle back-button">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="m14 6-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="chat-brand"><h1>EarLink</h1><p role="status" title={chatStatus}><span className={chatConnected ? "connection-dot online" : "connection-dot"} />{chatConnected ? "Online" : "연결 중"}</p></div>
      <span className="mode-badge" aria-label={`현재 대화 방식: ${label}`}><ModeIcon mode={accessibilityMode} />{label}</span>
    </header>
  );
}
