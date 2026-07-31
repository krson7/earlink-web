"use client";

import type {
  FormEvent,
  RefObject,
} from "react";

import SignLanguageCamera from "@/components/SignLanguageCamera";
import ChatComposer from "./ChatComposer";

type CameraComposerProps = {
  roomCode: string;
  participantId: number;
  message: string;
  chatConnected: boolean;
  chatErrorMessage: string;
  maxLength: number;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onMessageChange: (value: string) => void;
  onApplyText: (text: string) => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
  ) => void;
};

export default function CameraComposer({
  roomCode,
  participantId,
  message,
  chatConnected,
  chatErrorMessage,
  maxLength,
  inputRef,
  onMessageChange,
  onApplyText,
  onSubmit,
}: CameraComposerProps) {
  return (
    <section className="shrink-0 border-t border-slate-200/80 bg-white shadow-[0_-8px_28px_rgba(15,23,42,0.06)]">
      <ChatComposer
        message={message}
        chatConnected={chatConnected}
        chatErrorMessage={
          chatErrorMessage
        }
        placeholder={
          chatConnected
            ? "직접 입력하거나 인식된 문장을 불러오세요"
            : "채팅 서버 연결 중..."
        }
        maxLength={maxLength}
        inputRef={inputRef}
        onMessageChange={
          onMessageChange
        }
        onSubmit={onSubmit}
        withSafeArea={false}
        showTopBorder={false}
      />

      <SignLanguageCamera
        roomCode={roomCode}
        participantId={
          participantId
        }
        onApplyText={onApplyText}
      />
    </section>
  );
}