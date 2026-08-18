"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";

import CameraComposer from "@/components/chat/CameraComposer";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageList from "@/components/chat/MessageList";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat";
import type { ChatMessageItem, JoinRoomResponse } from "@/types/chat";

type ChatScreenProps = {
  participant: JoinRoomResponse;
  messages: ChatMessageItem[];
  chatConnected: boolean;
  chatStatus: string;
  chatErrorMessage: string;
  onLeave: () => void;
  onSendMessage: (text: string) => boolean;
  onClearError: () => void;
};

function getChatPlaceholder(
  chatConnected: boolean,
  accessibilityMode: JoinRoomResponse["accessibility_mode"],
): string {
  if (!chatConnected) {
    return "채팅 서버 연결 중...";
  }

  if (accessibilityMode === "VISUAL") {
    return "점자 기기 연동 전입니다. 임시로 텍스트를 입력하세요";
  }

  return "메시지를 입력하세요";
}

export default function ChatScreen({
  participant,
  messages,
  chatConnected,
  chatStatus,
  chatErrorMessage,
  onLeave,
  onSendMessage,
  onClearError,
}: ChatScreenProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [message, setMessage] = useState("");

  const accessibilityMode = participant.accessibility_mode;

  function handleMessageChange(value: string): void {
    setMessage(value);
    onClearError();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (onSendMessage(message)) {
      setMessage("");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <ChatHeader
        chatConnected={chatConnected}
        chatStatus={chatStatus}
        accessibilityMode={accessibilityMode}
        onLeave={onLeave}
      />

      <MessageList
        messages={messages}
        participantId={participant.participant_id}
      />

      {accessibilityMode === "HEARING" ? (
        <CameraComposer
          roomCode={participant.room_code}
          participantId={participant.participant_id}
          chatConnected={chatConnected}
          chatErrorMessage={chatErrorMessage}
          onSendText={onSendMessage}
        />
      ) : (
        <ChatComposer
          message={message}
          chatConnected={chatConnected}
          chatErrorMessage={chatErrorMessage}
          placeholder={getChatPlaceholder(chatConnected, accessibilityMode)}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          inputRef={inputRef}
          onMessageChange={handleMessageChange}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}