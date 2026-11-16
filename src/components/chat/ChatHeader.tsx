"use client";

import { ModeIcon } from "@/components/Brand";
import type { AccessibilityMode } from "@/types/chat";

type ChatHeaderProps = {
  chatConnected: boolean;
  chatStatus: string;
  accessibilityMode: AccessibilityMode;
  deviceConnected: boolean;
  deviceConnecting: boolean;
  serialNumber: string | null;
  onDevicePress: () => void;
  onLeave: () => void;
};

/*
 * 채팅 서버가 끊겨 있으면 대화 자체가 안 되므로 그 상태를 먼저 보여 주고,
 * 그 외에는 점자 기기 연결 상태와 시리얼을 보여 준다.
 */
function getConnectionState(
  chatConnected: boolean,
  deviceConnected: boolean,
  deviceConnecting: boolean,
  serialNumber: string | null,
) {
  if (!chatConnected) return { text: "연결 중", dot: "connection-dot" };
  if (deviceConnected) {
    return { text: serialNumber ? `기기 연결됨 · ${serialNumber}` : "기기 연결됨", dot: "connection-dot online" };
  }
  if (deviceConnecting) return { text: "기기 연결 중…", dot: "connection-dot" };
  return { text: "기기 미연결", dot: "connection-dot offline" };
}

export default function ChatHeader({
  chatConnected,
  chatStatus,
  accessibilityMode,
  deviceConnected,
  deviceConnecting,
  serialNumber,
  onDevicePress,
  onLeave,
}: ChatHeaderProps) {
  const label = accessibilityMode === "VISUAL" ? "Voice" : accessibilityMode === "HEARING" ? "Sign" : "Text";
  const connection = getConnectionState(chatConnected, deviceConnected, deviceConnecting, serialNumber);

  return (
    <header className="chat-header">
      <button type="button" onClick={onLeave} aria-label="서비스 선택 화면으로 돌아가기" className="soft-circle back-button">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="m14 6-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="chat-brand">
        <h1>EarLink</h1>
        <button type="button" onClick={onDevicePress} title={chatStatus} className="device-status">
          <span aria-hidden="true" className={connection.dot} />
          <span role="status">{connection.text}</span>
          <span className="sr-only">, 눌러서 기기 연결 관리</span>
        </button>
      </div>
      <span className="mode-badge" aria-label={`현재 대화 방식: ${label}`}><ModeIcon mode={accessibilityMode} />{label}</span>
    </header>
  );
}
